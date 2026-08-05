// @vitest-environment jsdom
// 渲染器单元测试 - 替换/双语双模式渲染与 Shadow DOM 译文块隔离

import { describe, it, expect, beforeEach } from 'vitest';
import { collectSegments, collectSemanticSegments } from './segmenter';
import {
  applyReplace,
  applyBilingual,
  markLoading,
  clearLoadingMark,
  markFailed,
  clearFailedMark,
  switchMode,
  restoreAll,
} from './renderer';
import type { SegmentRecord } from './types';

/** 用真实 DOM 构造分段并模拟翻译完成状态 */
function setupSegments(html: string, translatedPrefix = '[译] '): SegmentRecord[] {
  document.body.innerHTML = html;
  const segments = collectSegments(document.body, { skipVisibilityCheck: true });
  for (const seg of segments) {
    seg.translatedText = `${translatedPrefix}${seg.originalText}`;
    seg.status = 'done';
  }
  return segments;
}

/** 构造单个失败分段 */
function setupFailedSegment(html: string): SegmentRecord {
  document.body.innerHTML = html;
  const segments = collectSegments(document.body, { skipVisibilityCheck: true });
  expect(segments.length).toBeGreaterThanOrEqual(1);
  const seg = segments[0];
  seg.status = 'failed';
  seg.errorType = 'network';
  return seg;
}

describe('applyReplace', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('把译文写入首个文本节点，其余置空', () => {
    const segs = setupSegments('<p>Hello world</p>');
    applyReplace(segs[0]);
    expect(segs[0].textNodes[0].data).toBe('[译] Hello world');
  });

  it('多个文本节点时：首节点写译文，其余置空', () => {
    // <p>text1 <span>bold</span> text2</p> -> p 有两个直接文本节点 "text1 " 和 " text2"
    const segs = setupSegments('<p>text1 <span>bold</span> text2</p>');
    const pSeg = segs.find((s) => s.el.tagName === 'P')!;
    expect(pSeg.textNodes.length).toBe(2);
    applyReplace(pSeg);
    expect(pSeg.textNodes[0].data).toContain('[译]');
    expect(pSeg.textNodes[1].data).toBe('');
  });

  it('不摧毁行内子元素结构（只改 textNodes.data）', () => {
    const segs = setupSegments('<p>hello <strong>world</strong></p>');
    const pSeg = segs.find((s) => s.el.tagName === 'P')!;
    applyReplace(pSeg);
    // strong 子元素仍然存在
    const strong = pSeg.el.querySelector('strong');
    expect(strong).not.toBeNull();
    expect(strong!.textContent).toBe('world');
  });

  it('捕获原始文本节点 data 快照（供逐字节恢复）', () => {
    const segs = setupSegments('<p>  Hello world  </p>');
    const seg = segs[0];
    const originalData = seg.textNodes.map((tn) => tn.data);
    applyReplace(seg);
    expect(seg.originalTextNodesData).toEqual(originalData);
  });

  it('捕获含原始空白的快照（非 trimmed）', () => {
    const segs = setupSegments('<p>text1 <span>x</span> text2</p>');
    const pSeg = segs.find((s) => s.el.tagName === 'P')!;
    applyReplace(pSeg);
    // 快照应包含原始空白，而非 trimmed 后的文本
    expect(pSeg.originalTextNodesData![0]).toBe('text1 ');
    expect(pSeg.originalTextNodesData![1]).toBe(' text2');
  });

  it('无 translatedText 时写入空字符串', () => {
    const segs = setupSegments('<p>Hello</p>');
    segs[0].translatedText = undefined;
    applyReplace(segs[0]);
    expect(segs[0].textNodes[0].data).toBe('');
  });

  it('writes translated parts back without removing strong or links', () => {
    document.body.innerHTML = '<p>Hello <strong>world</strong></p>';
    const [segment] = collectSemanticSegments(document.body);
    segment.translatedParts = ['你好', '世界'];
    segment.translatedText = '你好世界';

    applyReplace(segment);

    expect(document.querySelector('p')?.textContent).toBe('你好世界');
    expect(document.querySelector('strong')).not.toBeNull();
  });
});

describe('applyBilingual', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('创建带 data-llm-translator 属性的宿主元素', () => {
    const segs = setupSegments('<p>Hello world</p>');
    applyBilingual(segs[0]);
    expect(segs[0].blockHost).toBeDefined();
    expect(segs[0].blockHost!.hasAttribute('data-llm-translator')).toBe(true);
    expect(segs[0].blockHost!.className).toContain('llm-translator-block-host');
  });

  it('宿主元素挂载 open shadow root', () => {
    const segs = setupSegments('<p>Hello world</p>');
    applyBilingual(segs[0]);
    expect(segs[0].blockHost!.shadowRoot).not.toBeNull();
  });

  it('shadow root 内注入 style 与译文容器', () => {
    const segs = setupSegments('<p>Hello world</p>');
    applyBilingual(segs[0]);
    const shadow = segs[0].blockHost!.shadowRoot!;
    expect(shadow.querySelector('style')).not.toBeNull();
    const content = shadow.querySelector('.llm-translator-block-content');
    expect(content).not.toBeNull();
  });

  it('译文以纯文本写入（textContent，非 innerHTML）', () => {
    const segs = setupSegments('<p>Hello</p>');
    segs[0].translatedText = '<script>alert(1)</script>译文';
    applyBilingual(segs[0]);
    const content = segs[0].blockHost!.shadowRoot!.querySelector('.llm-translator-block-content')!;
    // textContent 不会解析 HTML
    expect(content.textContent).toBe('<script>alert(1)</script>译文');
    expect(content.querySelector('script')).toBeNull();
  });

  it('块级段：译文块插到 seg.el 之后', () => {
    const segs = setupSegments('<p>Hello</p>');
    const p = document.querySelector('p')!;
    applyBilingual(segs[0]);
    expect(p.nextElementSibling).toBe(segs[0].blockHost);
  });

  it('行内段：译文块插到最近块级祖先之后', () => {
    const segs = setupSegments('<div><span>inline text</span></div>');
    const spanSeg = segs.find((s) => s.el.tagName === 'SPAN')!;
    const div = document.querySelector('div')!;
    applyBilingual(spanSeg);
    // 译文块应在 div 之后，而非 span 之后
    expect(div.nextElementSibling).toBe(spanSeg.blockHost);
    expect(spanSeg.el.nextElementSibling).not.toBe(spanSeg.blockHost);
  });

  it('同祖先多段：依次堆叠（保持顺序）', () => {
    // <p>Hello <span>world</span> <a href="#">link</a></p>
    // p 段: 块级，插到 p 之后
    // span 段: 行内，插到 p（最近块级祖先）之后，但在 p 段块之后
    // a 段: 行内，插到 p 之后，但在 span 段块之后
    const segs = setupSegments('<p>Hello <span>world</span> <a href="#">link</a></p>');
    const pSeg = segs.find((s) => s.el.tagName === 'P')!;
    const spanSeg = segs.find((s) => s.el.tagName === 'SPAN')!;
    const aSeg = segs.find((s) => s.el.tagName === 'A')!;

    // 按段顺序应用
    applyBilingual(pSeg);
    applyBilingual(spanSeg);
    applyBilingual(aSeg);

    const p = document.querySelector('p')!;
    // 验证堆叠顺序：p -> block_p -> block_span -> block_a
    expect(p.nextElementSibling).toBe(pSeg.blockHost);
    expect(pSeg.blockHost!.nextElementSibling).toBe(spanSeg.blockHost);
    expect(spanSeg.blockHost!.nextElementSibling).toBe(aSeg.blockHost);
  });

  it('seg.blockHost 记录引用', () => {
    const segs = setupSegments('<p>Hello</p>');
    applyBilingual(segs[0]);
    expect(segs[0].blockHost).toBeDefined();
    expect(segs[0].blockHost!.isConnected).toBe(true);
  });

  it('从替换模式切换时先还原文本节点', () => {
    const segs = setupSegments('<p>  Hello  </p>');
    const seg = segs[0];
    // 先应用替换模式
    applyReplace(seg);
    expect(seg.textNodes[0].data).toBe('[译] Hello');
    // 再应用双语模式
    applyBilingual(seg);
    // 文本节点应恢复为原始值
    expect(seg.textNodes[0].data).toBe('  Hello  ');
  });

  it('重复调用时移除旧 blockHost 再挂新的', () => {
    const segs = setupSegments('<p>Hello</p>');
    applyBilingual(segs[0]);
    const oldHost = segs[0].blockHost!;
    applyBilingual(segs[0]);
    expect(oldHost.isConnected).toBe(false);
    expect(segs[0].blockHost).not.toBe(oldHost);
    expect(segs[0].blockHost!.isConnected).toBe(true);
  });

  it('creates one bilingual block for one semantic paragraph', () => {
    document.body.innerHTML = '<p>Hello <strong>world</strong></p>';
    const [segment] = collectSemanticSegments(document.body);
    segment.translatedText = '你好世界';

    applyBilingual(segment);

    expect(document.querySelectorAll('.llm-translator-block-host')).toHaveLength(1);
  });
});

describe('markLoading / clearLoadingMark', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('重复标记时复用单个 Shadow DOM 加载状态，并可清理', () => {
    const seg = setupFailedSegment('<p>Hello</p>');

    markLoading(seg);
    markLoading(seg);

    expect(document.querySelectorAll('.llm-translator-loading-host')).toHaveLength(1);
    const statusEl = seg.loadingMarkHost?.shadowRoot?.querySelector('[role="status"]');
    // 无 aria-label 文案，仅保留 role="status" 语义
    expect(statusEl?.getAttribute('aria-label')).toBeNull();
    expect(statusEl?.getAttribute('role')).toBe('status');
    expect(document.querySelector('[role="status"]')).toBeNull();
    // spinner 节点仍存在（视觉反馈）：标记仅含视觉元素，不带文案
    const shadowSpinner = seg.loadingMarkHost?.shadowRoot?.querySelector(
      '.llm-translator-loading-spinner',
    );
    expect(shadowSpinner).toBeDefined();
    expect(shadowSpinner?.getAttribute('aria-hidden')).toBe('true');
    // 防回退：shadow root 内不应出现中文文案（避免设计回退到「正在翻译此段」等可读文本）
    const shadowContent = seg.loadingMarkHost?.shadowRoot?.textContent ?? '';
    expect(shadowContent).not.toContain('正在翻译此段');

    clearLoadingMark(seg);

    expect(seg.loadingMarkHost).toBeUndefined();
    expect(document.querySelector('.llm-translator-loading-host')).toBeNull();
  });

  it('重复清理时安全', () => {
    const seg = setupFailedSegment('<p>Hello</p>');
    markLoading(seg);
    clearLoadingMark(seg);

    expect(() => clearLoadingMark(seg)).not.toThrow();
  });

  it('应用替换译文时移除加载状态', () => {
    const seg = setupSegments('<p>Hello</p>')[0];
    markLoading(seg);

    applyReplace(seg);

    expect(seg.loadingMarkHost).toBeUndefined();
  });

  it('应用双语译文时移除加载状态', () => {
    const seg = setupSegments('<p>Hello</p>')[0];
    markLoading(seg);

    applyBilingual(seg);

    expect(seg.loadingMarkHost).toBeUndefined();
  });

  it('标记失败时移除加载状态', () => {
    const seg = setupFailedSegment('<p>Hello</p>');
    markLoading(seg);

    markFailed(seg);

    expect(seg.loadingMarkHost).toBeUndefined();
  });
});

describe('markFailed / clearFailedMark', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('创建带 data-llm-translator 的徽标宿主', () => {
    const seg = setupFailedSegment('<p>Hello</p>');
    markFailed(seg);
    expect(seg.failedMarkHost).toBeDefined();
    expect(seg.failedMarkHost!.hasAttribute('data-llm-translator')).toBe(true);
    expect(seg.failedMarkHost!.className).toContain('llm-translator-failed-host');
  });

  it('徽标宿主挂载 open shadow root 并包含 ⚠ 徽标', () => {
    const seg = setupFailedSegment('<p>Hello</p>');
    markFailed(seg);
    const shadow = seg.failedMarkHost!.shadowRoot!;
    expect(shadow).not.toBeNull();
    expect(shadow.querySelector('style')).not.toBeNull();
    const badge = shadow.querySelector('.llm-translator-failed-badge');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe('⚠');
  });

  it('替换模式下：徽标插到 seg.el 之后', () => {
    const seg = setupFailedSegment('<p>Hello</p>');
    markFailed(seg);
    expect(seg.el.nextElementSibling).toBe(seg.failedMarkHost);
  });

  it('双语模式下：徽标插到 blockHost 之后', () => {
    const seg = setupFailedSegment('<p>Hello</p>');
    // 模拟双语模式（先有 blockHost）
    seg.translatedText = '[译] Hello';
    seg.status = 'done';
    applyBilingual(seg);
    markFailed(seg);
    expect(seg.blockHost!.nextElementSibling).toBe(seg.failedMarkHost);
  });

  it('clearFailedMark 移除徽标宿主', () => {
    const seg = setupFailedSegment('<p>Hello</p>');
    markFailed(seg);
    const host = seg.failedMarkHost!;
    expect(host.isConnected).toBe(true);
    clearFailedMark(seg);
    expect(host.isConnected).toBe(false);
    expect(seg.failedMarkHost).toBeUndefined();
  });

  it('clearFailedMark 无徽标时不报错', () => {
    const seg = setupFailedSegment('<p>Hello</p>');
    expect(() => clearFailedMark(seg)).not.toThrow();
  });

  it('markFailed 先清除旧徽标再挂新的', () => {
    const seg = setupFailedSegment('<p>Hello</p>');
    markFailed(seg);
    const oldHost = seg.failedMarkHost!;
    markFailed(seg);
    expect(oldHost.isConnected).toBe(false);
    expect(seg.failedMarkHost).not.toBe(oldHost);
  });
});

describe('switchMode', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('replace -> bilingual：还原文本节点再挂译文块', () => {
    const segs = setupSegments('<p>Hello</p><p>World</p>');
    // 先应用替换模式
    for (const seg of segs) applyReplace(seg);
    expect(segs[0].textNodes[0].data).toBe('[译] Hello');

    // 切换到双语模式
    switchMode(segs, 'replace', 'bilingual');

    // 文本节点已还原
    expect(segs[0].textNodes[0].data).toBe('Hello');
    expect(segs[1].textNodes[0].data).toBe('World');
    // 译文块已挂载
    expect(segs[0].blockHost).toBeDefined();
    expect(segs[1].blockHost).toBeDefined();
    expect(segs[0].blockHost!.isConnected).toBe(true);
  });

  it('bilingual -> replace：移除 blockHost 再写译文', () => {
    const segs = setupSegments('<p>Hello</p><p>World</p>');
    // 先应用双语模式
    for (const seg of segs) applyBilingual(seg);
    const oldHost0 = segs[0].blockHost!;
    const oldHost1 = segs[1].blockHost!;

    // 切换到替换模式
    switchMode(segs, 'bilingual', 'replace');

    // blockHost 已移除
    expect(oldHost0.isConnected).toBe(false);
    expect(oldHost1.isConnected).toBe(false);
    expect(segs[0].blockHost).toBeUndefined();
    // 译文已写入文本节点
    expect(segs[0].textNodes[0].data).toBe('[译] Hello');
    expect(segs[1].textNodes[0].data).toBe('[译] World');
  });

  it('同模式切换（from === to）不做任何操作', () => {
    const segs = setupSegments('<p>Hello</p>');
    for (const seg of segs) applyReplace(seg);
    const dataBefore = segs[0].textNodes[0].data;
    switchMode(segs, 'replace', 'replace');
    expect(segs[0].textNodes[0].data).toBe(dataBefore);
  });

  it('同步完成，返回值不是 Promise', () => {
    const segs = setupSegments('<p>Hello</p>');
    for (const seg of segs) applyReplace(seg);
    const result = switchMode(segs, 'replace', 'bilingual');
    expect(result).toBeUndefined();
  });

  it('无 translatedText 的段不挂译文块', () => {
    const segs = setupSegments('<p>Hello</p><p>World</p>');
    segs[1].translatedText = undefined;
    segs[1].status = 'failed';
    for (const seg of segs) {
      if (seg.translatedText) applyReplace(seg);
    }
    switchMode(segs, 'replace', 'bilingual');
    expect(segs[0].blockHost).toBeDefined();
    expect(segs[1].blockHost).toBeUndefined();
  });

  it('replace -> bilingual：多段堆叠顺序正确', () => {
    const segs = setupSegments('<p>Hello <span>world</span> <a href="#">link</a></p>');
    const pSeg = segs.find((s) => s.el.tagName === 'P')!;
    const spanSeg = segs.find((s) => s.el.tagName === 'SPAN')!;
    const aSeg = segs.find((s) => s.el.tagName === 'A')!;

    for (const seg of segs) applyReplace(seg);
    switchMode(segs, 'replace', 'bilingual');

    const p = document.querySelector('p')!;
    expect(p.nextElementSibling).toBe(pSeg.blockHost);
    expect(pSeg.blockHost!.nextElementSibling).toBe(spanSeg.blockHost);
    expect(spanSeg.blockHost!.nextElementSibling).toBe(aSeg.blockHost);
  });
});

describe('restoreAll', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('还原所有文本节点的原始 data（逐字节，含空白）', () => {
    const segs = setupSegments('<p>  Hello  </p><p>World</p>');
    for (const seg of segs) applyReplace(seg);
    // 文本节点已被修改
    expect(segs[0].textNodes[0].data).not.toBe('  Hello  ');

    restoreAll(segs);

    expect(segs[0].textNodes[0].data).toBe('  Hello  ');
    expect(segs[1].textNodes[0].data).toBe('World');
  });

  it('还原多文本节点段的原始空白分布', () => {
    const segs = setupSegments('<p>text1 <span>x</span> text2</p>');
    const pSeg = segs.find((s) => s.el.tagName === 'P')!;
    applyReplace(pSeg);
    // 替换后首节点为译文，次节点为空
    expect(pSeg.textNodes[1].data).toBe('');

    restoreAll(segs);

    // 逐字节还原
    expect(pSeg.textNodes[0].data).toBe('text1 ');
    expect(pSeg.textNodes[1].data).toBe(' text2');
  });

  it('移除所有 blockHost', () => {
    const segs = setupSegments('<p>Hello</p><p>World</p>');
    for (const seg of segs) applyBilingual(seg);
    const hosts = segs.map((s) => s.blockHost!);

    restoreAll(segs);

    for (const host of hosts) {
      expect(host.isConnected).toBe(false);
    }
    for (const seg of segs) {
      expect(seg.blockHost).toBeUndefined();
    }
  });

  it('移除所有失败标记', () => {
    const segs = setupSegments('<p>Hello</p>');
    segs[0].status = 'failed';
    segs[0].errorType = 'network';
    segs[0].translatedText = undefined;
    markFailed(segs[0]);
    const markHost = segs[0].failedMarkHost!;

    restoreAll(segs);

    expect(markHost.isConnected).toBe(false);
    expect(segs[0].failedMarkHost).toBeUndefined();
  });

  it('移除加载、双语与失败宿主', () => {
    const segs = setupSegments('<p>Loading</p><p>Bilingual</p><p>Failed</p>');
    markLoading(segs[0]);
    applyBilingual(segs[1]);
    segs[2].status = 'failed';
    markFailed(segs[2]);

    const loadingHost = segs[0].loadingMarkHost!;
    const blockHost = segs[1].blockHost!;
    const failedHost = segs[2].failedMarkHost!;

    restoreAll(segs);

    expect(loadingHost.isConnected).toBe(false);
    expect(blockHost.isConnected).toBe(false);
    expect(failedHost.isConnected).toBe(false);
    expect(segs[0].loadingMarkHost).toBeUndefined();
    expect(segs[1].blockHost).toBeUndefined();
    expect(segs[2].failedMarkHost).toBeUndefined();
  });

  it('重置状态为 pending', () => {
    const segs = setupSegments('<p>Hello</p>');
    for (const seg of segs) applyReplace(seg);
    segs[0].status = 'done';

    restoreAll(segs);

    expect(segs[0].status).toBe('pending');
  });

  it('保留 translatedText 缓存值', () => {
    const segs = setupSegments('<p>Hello</p>');
    for (const seg of segs) applyReplace(seg);

    restoreAll(segs);

    expect(segs[0].translatedText).toBe('[译] Hello');
  });

  it('清除 errorType', () => {
    const seg = setupFailedSegment('<p>Hello</p>');
    markFailed(seg);

    restoreAll([seg]);

    expect(seg.errorType).toBeUndefined();
  });

  it('对从未渲染过的段也是安全的', () => {
    const segs = setupSegments('<p>Hello</p>');
    expect(() => restoreAll(segs)).not.toThrow();
    expect(segs[0].textNodes[0].data).toBe('Hello');
  });

  it('双语模式下还原：移除 blockHost + 还原文本', () => {
    const segs = setupSegments('<p>  Hello  </p>');
    for (const seg of segs) applyBilingual(seg);

    restoreAll(segs);

    expect(segs[0].blockHost).toBeUndefined();
    expect(segs[0].textNodes[0].data).toBe('  Hello  ');
  });

  it('逐字节还原语义段的所有文本部分', () => {
    document.body.innerHTML = '<p>Hello <strong>secure AI</strong> world</p>';
    const [segment] = collectSemanticSegments(document.body);
    segment.translatedParts = ['你好', '安全 AI', '世界'];
    segment.translatedText = '你好安全 AI世界';
    applyReplace(segment);

    restoreAll([segment]);

    expect(document.querySelector('p')?.innerHTML).toBe('Hello <strong>secure AI</strong> world');
  });
});

describe('Shadow DOM 隔离', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('宿主页面 CSS 类不影响 shadow 内内容', () => {
    // 宿主页面有同名 class 元素，shadow 内内容不受影响
    document.body.innerHTML = '<div class="llm-translator-block-content" id="page-content">page text</div><p>Hello</p>';
    const segs = collectSegments(document.body, { skipVisibilityCheck: true });
    segs[0].translatedText = '译文';
    segs[0].status = 'done';

    applyBilingual(segs[0]);

    const shadowContent = segs[0].blockHost!.shadowRoot!.querySelector('.llm-translator-block-content')!;
    const pageContent = document.getElementById('page-content')!;
    // 两者是不同元素
    expect(shadowContent).not.toBe(pageContent);
    // shadow 内元素的文本是译文
    expect(shadowContent.textContent).toBe('译文');
  });

  it('shadow root 内 style 包含自足样式', () => {
    const segs = setupSegments('<p>Hello</p>');
    applyBilingual(segs[0]);
    const styleEl = segs[0].blockHost!.shadowRoot!.querySelector('style')!;
    expect(styleEl.textContent).toContain(':host');
    expect(styleEl.textContent).toContain('.llm-translator-block-content');
  });

  it('所有注入的 DOM 宿主都带 data-llm-translator 属性', () => {
    const segs = setupSegments('<p>Hello</p><span>inline</span>');
    for (const seg of segs) applyBilingual(seg);
    // 失败标记也带属性
    segs[0].status = 'failed';
    markFailed(segs[0]);

    const injected = document.querySelectorAll('[data-llm-translator]');
    expect(injected.length).toBe(3); // 2 blockHost + 1 failedMarkHost
    for (const el of injected) {
      expect(el.hasAttribute('data-llm-translator')).toBe(true);
    }
  });
});
