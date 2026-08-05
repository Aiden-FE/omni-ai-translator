// 全文翻译双模式渲染器 - 替换/双语双模式渲染与 Shadow DOM 译文块隔离
//
// 纯 DOM 操作，不持有翻译状态；状态全部来自 SegmentRecord。
// - applyReplace: 译文写入 textNodes[0].data，其余置空（保留行内子元素结构）
// - applyBilingual: 创建带 shadow 的译文块宿主，插入段后/块级祖先后
// - markLoading/clearLoadingMark: 段尾追加/移除加载标记宿主
// - markFailed/clearFailedMark: 段尾追加/移除失败徽标宿主
// - switchMode: 同步切换显示模式（零 API 调用）
// - restoreAll: 还原所有文本节点原始 data、移除注入 DOM、重置状态
//
// 样式隔离：所有注入宿主带 data-llm-translator（t2 分段排除、t5 观察器过滤、恢复清理均依赖）。
// 译文块走 shadow 内样式（宿主页面 CSS 无法穿透），shadow 根内样式自足不依赖继承值。

import blockCss from '@/assets/fullpage-block.css?inline';
import type { DisplayMode } from '../types';
import type { SegmentRecord } from './types';

/** 块级元素 CSS 选择器（与 segmenter BLOCK_TAGS 一致，用于 closest() 定位行内段的块级祖先） */
const BLOCK_SELECTOR =
  'p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote,figcaption,div,section,article,header,footer,aside,main,nav,pre,code,ul,ol,dl,dt,dd,hr,fieldset,legend,caption,tr';

/**
 * 捕获段文本节点的原始 data 快照（首次渲染时写入，供逐字节恢复含原始空白）。
 * originalText 是 trimmed 拼接，丢失了各节点原始空白分布，无法用于逐字节还原。
 */
function captureOriginal(seg: SegmentRecord): void {
  if (seg.originalTextNodesData === undefined) {
    seg.originalTextNodesData = seg.textNodes.map((tn) => tn.data);
  }
}

/** 从快照逐字节还原文本节点原始 data */
function restoreTextNodes(seg: SegmentRecord): void {
  if (seg.originalTextNodesData === undefined) return;
  for (let i = 0; i < seg.textNodes.length; i++) {
    seg.textNodes[i].data = seg.originalTextNodesData[i] ?? '';
  }
}

/**
 * 查找双语译文块的插入参考点：
 * - 块级段：seg.el 自身（插到其后）
 * - 行内段：最近块级祖先（插到其后再堆叠）
 */
function findInsertionRef(seg: SegmentRecord): Element {
  return seg.el.closest(BLOCK_SELECTOR) ?? seg.el;
}

/**
 * 在参考元素后插入译文块宿主，跳过已有连续译文块以保持堆叠顺序。
 * 同祖先多段依次堆叠：新块插到最后一个连续 block-host 之后。
 */
function insertBlockAfter(ref: Element, host: HTMLElement): void {
  let target = ref;
  let next = target.nextElementSibling;
  while (
    next instanceof HTMLElement &&
    next.hasAttribute('data-llm-translator') &&
    next.classList.contains('llm-translator-block-host')
  ) {
    target = next;
    next = target.nextElementSibling;
  }
  target.after(host);
}

/**
 * 创建带 open shadow root 的宿主元素，注入自足样式 + 内容容器。
 * @param className - 宿主 class（llm-translator-block-host 或 llm-translator-failed-host）
 * @returns [宿主元素, shadow root]
 */
function createShadowHost(className: string): [HTMLElement, ShadowRoot] {
  const host = document.createElement('div');
  host.className = className;
  host.setAttribute('data-llm-translator', '');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = blockCss;
  shadow.appendChild(style);
  return [host, shadow];
}

/**
 * 替换模式：把 seg.translatedText 写入 seg.textNodes[0].data，其余 textNodes 置 ''。
 * originalText 已存于 record（originalTextNodesData 快照），供恢复。
 * 只改 textNodes.data，绝不整体覆盖 seg.el.textContent（会摧毁 a/strong 等行内子元素）。
 */
export function applyReplace(seg: SegmentRecord): void {
  clearLoadingMark(seg);
  if (seg.textNodes.length === 0) return;
  captureOriginal(seg);
  const text = seg.translatedText ?? '';
  seg.textNodes[0].data = text;
  for (let i = 1; i < seg.textNodes.length; i++) {
    seg.textNodes[i].data = '';
  }
}

/**
 * 双语模式：创建宿主元素 div.llm-translator-block-host（带 data-llm-translator），
 * attachShadow({mode:'open'})，注入 <style>（blockCss）+ 译文容器（textContent 纯文本，
 * 不做 markdown 渲染--全文场景译文回填页面，避免 LLM 输出被当 HTML 解析的风险）。
 *
 * 插入位置：块级段插到 seg.el 之后；行内段插到其最近块级祖先之后，同祖先多段依次堆叠。
 * 从替换模式切换时先还原文本节点（恢复原文显示，译文走 shadow 块）。
 */
export function applyBilingual(seg: SegmentRecord): void {
  clearLoadingMark(seg);
  // 移除已有 blockHost（重复调用场景）
  if (seg.blockHost) {
    seg.blockHost.remove();
  }

  captureOriginal(seg);
  // 还原文本节点（若此前为替换模式，恢复原文；若为原始状态则 no-op）
  restoreTextNodes(seg);

  const [host, shadow] = createShadowHost('llm-translator-block-host');
  const container = document.createElement('div');
  container.className = 'llm-translator-block-content';
  container.textContent = seg.translatedText ?? '';
  shadow.appendChild(container);

  const ref = findInsertionRef(seg);
  insertBlockAfter(ref, host);

  seg.blockHost = host;
}

/**
 * 加载标记：在段尾追加带 Shadow DOM 的 spinner。
 * 已存在且仍挂载的标记直接复用，避免翻译生命周期重复回调时产生多个宿主。
 * 仅保留 role="status" 无障碍语义，不含文案（不破坏页面结构）。
 */
export function markLoading(seg: SegmentRecord): void {
  if (seg.loadingMarkHost?.isConnected) return;

  clearLoadingMark(seg);

  const [host, shadow] = createShadowHost('llm-translator-loading-host');
  const status = document.createElement('span');
  status.className = 'llm-translator-loading-status';
  status.setAttribute('role', 'status');

  const spinner = document.createElement('span');
  spinner.className = 'llm-translator-loading-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  status.appendChild(spinner);

  shadow.appendChild(status);

  const ref = seg.failedMarkHost ?? seg.blockHost ?? seg.el;
  ref.after(host);
  seg.loadingMarkHost = host;
}

/** 移除段落加载标记宿主（幂等） */
export function clearLoadingMark(seg: SegmentRecord): void {
  seg.loadingMarkHost?.remove();
  seg.loadingMarkHost = undefined;
}

/**
 * 失败标记：在段尾追加带 shadow 的小徽标宿主（⚠ + 虚线底边）。
 * 替换/双语模式通用：双语模式插到 blockHost 之后，替换模式插到 seg.el 之后。
 */
export function markFailed(seg: SegmentRecord): void {
  clearLoadingMark(seg);
  // 先清除旧徽标
  if (seg.failedMarkHost) {
    seg.failedMarkHost.remove();
  }

  const [host, shadow] = createShadowHost('llm-translator-failed-host');
  const badge = document.createElement('span');
  badge.className = 'llm-translator-failed-badge';
  badge.textContent = '⚠';
  shadow.appendChild(badge);

  // 双语模式插到 blockHost 之后，替换模式插到 seg.el 之后
  const ref = seg.blockHost ?? seg.el;
  ref.after(host);

  seg.failedMarkHost = host;
}

/** 移除失败标记徽标宿主 */
export function clearFailedMark(seg: SegmentRecord): void {
  seg.failedMarkHost?.remove();
  seg.failedMarkHost = undefined;
}

/**
 * 同步切换显示模式（零 API 调用，6 秒级切换）。
 * - replace -> bilingual：先还原所有文本节点，再批量挂译文块
 * - bilingual -> replace：移除全部 blockHost，再写入译文
 */
export function switchMode(
  records: SegmentRecord[],
  from: DisplayMode,
  to: DisplayMode,
): void {
  if (from === to) return;

  if (from === 'replace' && to === 'bilingual') {
    // 阶段 1：还原所有文本节点（撤销替换模式）
    for (const seg of records) {
      restoreTextNodes(seg);
    }
    // 阶段 2：批量挂译文块（仅有译文的段）
    for (const seg of records) {
      if (seg.translatedText !== undefined) {
        applyBilingual(seg);
      }
    }
  } else if (from === 'bilingual' && to === 'replace') {
    // 阶段 1：移除全部 blockHost
    for (const seg of records) {
      seg.blockHost?.remove();
      seg.blockHost = undefined;
    }
    // 阶段 2：写入译文（仅有译文的段）
    for (const seg of records) {
      if (seg.translatedText !== undefined) {
        applyReplace(seg);
      }
    }
  }
}

/**
 * 还原所有分段：逐字节还原 textNodes 原始 data、移除全部 blockHost 与失败标记宿主，
 * 重置 record 状态为 pending（保留 translatedText 缓存值供再次触发复用）。
 */
export function restoreAll(records: SegmentRecord[]): void {
  for (const seg of records) {
    restoreTextNodes(seg);
    seg.blockHost?.remove();
    seg.blockHost = undefined;
    clearLoadingMark(seg);
    clearFailedMark(seg);
    seg.status = 'pending';
    seg.errorType = undefined;
    // 保留 translatedText 缓存值
  }
}
