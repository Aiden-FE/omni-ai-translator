// 全文翻译编排器 — 唯一状态持有者，组合 segmenter / pool / renderer / toolbar 的状态机
//
// 职责：
// - start(mode)：收集分段 → 挂工具栏 → 并发翻译池（onSettled 逐段即时渲染）→ 启动增量观察器
// - 工具栏回调接线：切换模式（零 API）/ 恢复原文（保留会话缓存）/ 重试失败段 / 收起展开
// - 增量翻译：MutationObserver + 200ms 防抖聚合新增节点，过滤注入子树，recordedEls 去重收段
//
// segmenter / pool / renderer / toolbar 均为无全局状态组件；本模块是唯一状态持有者。
// 样式隔离约定：所有注入 DOM 带 data-llm-translator（分段排除、观察器过滤、恢复清理均依赖）。

import { collectSegments } from './segmenter';
import { runPool, retrySegments } from './translate-pool';
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
import { createToolbar, type ToolbarApi } from './toolbar';
import { getTargetLang } from '../target-lang';
import type { BackgroundCommand, DisplayMode } from '../types';
import type { SegmentRecord } from './types';

/** 增量翻译防抖间隔（ms） */
const OBSERVER_DEBOUNCE_MS = 200;

// ---- 模块级状态（编排器是唯一状态持有者） ----

/** 当前页所有分段记录 */
let records: SegmentRecord[] = [];
/** 当前显示模式 */
let mode: DisplayMode = 'replace';
/** 翻译是否进行中（恢复原文后置 false） */
let active = false;
/** 会话级缓存：恢复原文后不清除，再次触发命中段秒级渲染（验收标准 10） */
let cache: Map<string, string> = new Map();
/** 工具栏实例 */
let toolbar: ToolbarApi | null = null;
/** 增量翻译观察器（仅 active 期间连接） */
let observer: MutationObserver | null = null;
/** 已收段元素集合（增量翻译防重复收段） */
let recordedEls: Set<HTMLElement> = new Set();
/** 目标语言：start 时解析一次，传入池 */
let targetLang = '';
/** 进行中的 start（并发触发守卫：第二次等待首次完成后按最新状态决策） */
let startInFlight: Promise<void> | null = null;

// ---- 增量翻译防抖状态 ----

/** 防抖窗口内聚合的新增节点 */
let pendingAddedNodes: Set<HTMLElement> = new Set();
/** 防抖计时器 */
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
/** flush 并发守卫：flush 期间新到达的节点入新 set，完成后重新调度 */
let isFlushing = false;

/**
 * 启动全文翻译。
 * - 复用路径：active 且 records 非空 → 仅切换显示模式（零 API，复用缓存，验收标准 10）
 * - 全新路径：collectSegments → createToolbar → runPool 逐段渲染 → startObserver
 */
export async function start(requestedMode: DisplayMode): Promise<void> {
  // 并发触发守卫（如右键菜单连点）：等待进行中的 start 完成，再按最新状态决策，
  // 避免重复收集分段 / 重复挂工具栏 / 重复派发翻译
  if (startInFlight) {
    await startInFlight;
  }

  // 复用路径：已激活且有分段 → 仅切换模式（译文已在段上/缓存中，零 API）
  if (active && records.length > 0) {
    switchToMode(requestedMode);
    return;
  }

  const p = doStart(requestedMode);
  startInFlight = p;
  try {
    await p;
  } finally {
    if (startInFlight === p) {
      startInFlight = null;
    }
  }
}

/** 全新启动路径 */
async function doStart(requestedMode: DisplayMode): Promise<void> {
  active = true;
  mode = requestedMode;
  // 目标语言每次启动解析一次（用户配置优先，回退浏览器首选语言）
  targetLang = await getTargetLang();

  // v0.4 同步收集；大页面（上千段）首帧收集后续可用 requestIdleCallback 分片优化
  records = collectSegments(document.body);
  recordedEls = new Set(records.map((r) => r.el));

  // 防御：空分段页重复触发走全新路径时先销毁旧工具栏，避免重复挂载
  toolbar?.destroy();
  toolbar = createToolbar({
    onSwitchMode: handleSwitchMode,
    onRestore: handleRestore,
    onRetry: () => {
      void handleRetry();
    },
    onCollapse: handleCollapse,
    onRecall: handleRecall,
  });
  toolbar.setMode(mode);
  markSegmentsLoading(records);
  updateProgress();

  await runPool(records, {
    targetLang,
    concurrency: 3,
    cache,
    onSettled: handleSettled,
    // 恢复原文后不再派发新段（已返回段由 handleSettled 的 active 校验拦截渲染）
    isActive: () => active,
  });

  // 翻译期间被恢复（active=false）则不启动观察器
  if (active) {
    startObserver();
  }
}

/**
 * 池逐段 settle 回调：
 * - 恢复原文后（active=false）不渲染已返回段（防译文闪回）
 * - 元素已被宿主移除（isConnected=false）→ 丢弃不渲染
 * - done → 按当前模式渲染；failed → 失败标记 + 更新工具栏计数；translating → 仅更新进度
 */
function handleSettled(seg: SegmentRecord): void {
  if (seg.status === 'translating') {
    updateProgress();
    return;
  }
  clearLoadingMark(seg);
  updateProgress();
  if (!active) return;
  if (!seg.el.isConnected) return;
  if (seg.status === 'done') {
    if (mode === 'replace') {
      applyReplace(seg);
    } else {
      applyBilingual(seg);
    }
  } else if (seg.status === 'failed') {
    markFailed(seg);
    updateFailureCount();
  }
}

/** 为本轮所有待处理分段挂载加载标记。 */
function markSegmentsLoading(segments: SegmentRecord[]): void {
  for (const seg of segments) {
    markLoading(seg);
  }
}

/** 从唯一状态 records 派生聚合进度并同步工具栏。 */
function updateProgress(): void {
  const completed = records.filter(
    (seg) => seg.status === 'done' || seg.status === 'failed',
  ).length;
  const failed = records.filter((seg) => seg.status === 'failed').length;
  const activeProgress = records.some(
    (seg) => seg.status === 'pending' || seg.status === 'translating',
  );
  toolbar?.setProgress({ completed, total: records.length, failed, active: activeProgress });
}

/** 统计当前失败段数并同步工具栏（>0 显示重试按钮，=0 隐藏） */
function updateFailureCount(): void {
  const count = records.reduce((n, r) => (r.status === 'failed' ? n + 1 : n), 0);
  toolbar?.setFailureCount(count);
}

/** 切换显示模式（零 API 调用）：renderer.switchMode + 翻转 mode + 工具栏文案 */
function switchToMode(next: DisplayMode): void {
  const from = mode;
  mode = next;
  switchMode(records, from, next);
  toolbar?.setMode(next);
}

/** 工具栏回调：切换显示模式（replace <-> bilingual） */
function handleSwitchMode(): void {
  switchToMode(mode === 'replace' ? 'bilingual' : 'replace');
}

/** 工具栏回调：恢复原文 — 还原 DOM、断开观察器、销毁工具栏、active=false（保留会话缓存） */
function handleRestore(): void {
  restoreAll(records);
  stopObserver();
  toolbar?.destroy();
  toolbar = null;
  active = false;
  // 注意：cache 与 records[].translatedText 保留，再次触发时命中段秒级渲染（验收标准 10）
}

/** 工具栏回调：重试失败段 — 清除失败标记后重跑池（复用缓存），成功则渲染并更新计数 */
async function handleRetry(): Promise<void> {
  const failedSegs = records.filter((r) => r.status === 'failed');
  if (failedSegs.length === 0) return;
  for (const seg of failedSegs) {
    clearFailedMark(seg);
  }
  markSegmentsLoading(failedSegs);
  updateProgress();
  // retrySegments 重置段状态后复用池逻辑；onSettled 的 active 校验保证恢复后不误渲染，
  // 翻译仍完成并写入缓存（有利于再次触发时秒级渲染）
  await retrySegments(failedSegs, {
    targetLang,
    concurrency: 3,
    cache,
    onSettled: handleSettled,
  });
  updateFailureCount();
  updateProgress();
}

/** 工具栏回调：收起（toolbar 已自动 collapse；预留暂停观察器扩展位） */
function handleCollapse(): void {
  // no-op：收起属工具栏自身 UI 状态，不影响翻译状态机
}

/** 工具栏回调：从迷你把手展开（toolbar 已自动 expand） */
function handleRecall(): void {
  // no-op：展开属工具栏自身 UI 状态
}

/** 启动增量观察器（仅 active 期间连接；重复调用安全） */
function startObserver(): void {
  if (observer) return;
  observer = new MutationObserver(handleMutations);
  observer.observe(document.body, { childList: true, subtree: true });
}

/** 断开观察器并清空待处理节点与防抖计时器 */
function stopObserver(): void {
  observer?.disconnect();
  observer = null;
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  pendingAddedNodes = new Set();
}

/** MutationObserver 回调：聚合 addedNodes，每次 mutation 重置 200ms 防抖 */
function handleMutations(mutations: MutationRecord[]): void {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node instanceof HTMLElement) {
        pendingAddedNodes.add(node);
      }
    }
  }
  scheduleFlush();
}

function scheduleFlush(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    flushAddedNodes().catch(() => {
      /* 增量 flush 异常不阻断宿主页面；后续 mutation 会重新调度 */
    });
  }, OBSERVER_DEBOUNCE_MS);
}

/**
 * 防抖 flush：逐新增子树 collectSegments → recordedEls 去重 → 新段入 records
 * 并按当前 mode 走缓存/翻译/渲染流程。
 * 自身渲染产物带 data-llm-translator，在此过滤，不形成回环。
 */
async function flushAddedNodes(): Promise<void> {
  if (isFlushing) return;
  isFlushing = true;
  const batch = Array.from(pendingAddedNodes);
  // flush 期间新到达的节点入新 set，完成后重新调度
  pendingAddedNodes = new Set();
  try {
    const newSegments: SegmentRecord[] = [];
    for (const node of batch) {
      if (!active) break;
      try {
        if (!node.isConnected) continue;
        if (node.hasAttribute('data-llm-translator')) continue;
        const segs = collectSegments(node);
        for (const seg of segs) {
          if (recordedEls.has(seg.el)) continue;
          recordedEls.add(seg.el);
          newSegments.push(seg);
        }
      } catch {
        // 单棵子树收集失败不阻断整批（宿主页面 DOM 可能非常规）
        continue;
      }
    }
    if (active && newSegments.length > 0) {
      records.push(...newSegments);
      markSegmentsLoading(newSegments);
      updateProgress();
      await runPool(newSegments, {
        targetLang,
        concurrency: 3,
        cache,
        onSettled: handleSettled,
        isActive: () => active,
      });
    }
  } finally {
    isFlushing = false;
    if (pendingAddedNodes.size > 0) {
      scheduleFlush();
    }
  }
}

/**
 * BackgroundCommand 类型守卫：校验 background → content 命令消息（供 entrypoint 消费）。
 * TS 严格模式：unknown + 类型守卫，不用 any。
 */
export function isBackgroundCommand(msg: unknown): msg is BackgroundCommand {
  if (typeof msg !== 'object' || msg === null) {
    return false;
  }
  const m = msg as Record<string, unknown>;
  return (
    m.type === 'fullpage-translate' &&
    (m.mode === 'replace' || m.mode === 'bilingual')
  );
}

/** 编排器内部状态快照（测试断言用） */
export interface OrchestratorStateSnapshot {
  records: SegmentRecord[];
  mode: DisplayMode;
  active: boolean;
  cache: Map<string, string>;
  targetLang: string;
}

/** 测试专用：读取内部状态（勿在生产代码使用） */
export function __getState(): OrchestratorStateSnapshot {
  return { records, mode, active, cache, targetLang };
}

/** 测试专用：重置全部模块级状态（还原页面 DOM、断开观察器、销毁工具栏、清空缓存） */
export function __reset(): void {
  if (records.length > 0) {
    restoreAll(records);
  }
  stopObserver();
  toolbar?.destroy();
  toolbar = null;
  records = [];
  recordedEls = new Set();
  mode = 'replace';
  active = false;
  cache = new Map();
  targetLang = '';
  startInFlight = null;
  isFlushing = false;
}
