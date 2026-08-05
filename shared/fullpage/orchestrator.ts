// 全文翻译编排器 — 唯一状态持有者，组合 segmenter / pool / renderer / toolbar 的状态机
//
// 职责：
// - start(mode)：收集分段 → 挂工具栏 → 并发翻译池（onSettled 逐段即时渲染）→ 启动增量观察器
// - 工具栏回调接线：切换模式（零 API）/ 恢复原文（保留会话缓存）/ 重试失败段 / 收起展开
// - 增量翻译：MutationObserver + 200ms 防抖聚合新增节点，过滤注入子树，recordedEls 去重收段
//
// segmenter / pool / renderer / toolbar 均为无全局状态组件；本模块是唯一状态持有者。
// 样式隔离约定：所有注入 DOM 带 data-llm-translator（分段排除、观察器过滤、恢复清理均依赖）。

import { collectSegments, collectSemanticSegments } from './segmenter';
import {
  runPool,
  retrySegments,
  isSegmentInViewport,
  createViewportObserver,
  type ViewportObserver,
} from './translate-pool';
import {
  createBatchRequestGate,
  retryBatchSegments,
  runBatchPool,
} from './batch-pool';
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
import type { BackgroundCommand, DisplayMode, TranslationCapabilities } from '../types';
import type { SegmentRecord, SemanticTranslation } from './types';

/** 增量翻译防抖间隔（ms） */
const OBSERVER_DEBOUNCE_MS = 200;
/** 视口进入与动态分段共享的 micro-batch 聚合窗口（ms） */
const BATCH_QUEUE_MS = 25;

// ---- 模块级状态（编排器是唯一状态持有者） ----

/** 当前页所有分段记录 */
let records: SegmentRecord[] = [];
/** 当前显示模式 */
let mode: DisplayMode = 'replace';
/** 翻译是否进行中（恢复原文后置 false） */
let active = false;
/** 会话级缓存：恢复原文后不清除，再次触发命中段秒级渲染（验收标准 10） */
let cache: Map<string, string> = new Map();
/** LLM 语义译文缓存；key 由 batch pool 添加结构版本前缀。 */
let semanticCache: Map<string, SemanticTranslation> = new Map();
/** 当前会话翻译路径，由 capability 查询确定并供 retry / dynamic nodes 复用。 */
let batchStreamEnabled = false;
/** 所有会话入口共享同一个三槽 gate，避免 viewport/dynamic/retry pool 叠加并发。 */
const batchRequestGate = createBatchRequestGate();
/** 工具栏实例 */
let toolbar: ToolbarApi | null = null;
/** 增量翻译观察器（仅含初始分段的 active 会话连接） */
let observer: MutationObserver | null = null;
/** 已收段元素集合（增量翻译防重复收段） */
let recordedEls: Set<HTMLElement> = new Set();
/** 视口外段观察器（多 doStart 复用；doStart 入口 disconnect 旧句柄） */
let viewportObserver: ViewportObserver | null = null;
/** 目标语言：start 时解析一次，传入池 */
let targetLang = '';
/** 进行中的 start（并发触发守卫：第二次等待首次完成后按最新状态决策） */
let startInFlight: Promise<void> | null = null;
/** 单调递增的会话代次，用于拒绝 restore/restart 前启动的晚到回调。 */
let sessionGeneration = 0;

// ---- 增量翻译防抖状态 ----

/** 防抖窗口内聚合的新增节点 */
let pendingAddedNodes: Set<HTMLElement> = new Set();
/** 防抖计时器 */
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
/** flush 并发守卫：flush 期间新到达的节点入新 set，完成后重新调度 */
let isFlushing = false;

// ---- 视口 / 动态分段共享 micro-batch 队列 ----

let queuedSegments: Set<SegmentRecord> = new Set();
let batchQueueTimer: ReturnType<typeof setTimeout> | null = null;
let batchQueueGeneration = 0;

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
  const generation = ++sessionGeneration;
  clearBatchQueue();
  active = true;
  mode = requestedMode;
  let resolvedTargetLang: string;
  let resolvedBatchStreamEnabled: boolean;
  try {
    // 目标语言每次启动解析一次（用户配置优先，回退浏览器首选语言）
    resolvedTargetLang = await getTargetLang();
    if (!isSessionActive(generation)) return;
    resolvedBatchStreamEnabled = await resolveBatchStreamCapability();
    if (!isSessionActive(generation)) return;
  } catch (error) {
    cleanupFailedStart(generation);
    throw error;
  }
  targetLang = resolvedTargetLang;
  batchStreamEnabled = resolvedBatchStreamEnabled;

  // v0.4 同步收集；大页面（上千段）首帧收集后续可用 requestIdleCallback 分片优化
  records = batchStreamEnabled
    ? collectSemanticSegments(document.body)
    : collectSegments(document.body);
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

  // 入口先 disconnect 旧 viewportObserver，避免跨会话残留段监听
  viewportObserver?.disconnect();
  viewportObserver = null;

  // 视口分组：视口内段走 runPool；视口外段挂 IO 等待进入后入池
  const inView = records.filter(isSegmentInViewport);
  const outOfView = records.filter((r) => !isSegmentInViewport(r));

  // 视口外段也立即 markLoading 计入总进度
  if (outOfView.length > 0) {
    markSegmentsLoading(outOfView);
  }

  // 统一调度进度：空页面也需 updateProgress 让工具栏呈现“未发现可翻译文本”
  updateProgress();
  await enqueueSegments(inView, generation);

  if (outOfView.length > 0) {
    updateProgress();
    viewportObserver = createViewportEnterObserver(generation);
    for (const seg of outOfView) {
      viewportObserver.observe(seg);
    }
  }

  // 会话失效或初始页面无分段时不启动观察器
  if (isSessionActive(generation) && records.length > 0) {
    startObserver();
  }
}

/**
 * 入队一组段为 loading + 派发入池。
 * 供 doStart 视口内、IO onEnter 单段、增量翻译视口内/外段全部走同一路径。
 */
async function enqueueSegments(
  segs: SegmentRecord[],
  generation: number,
): Promise<void> {
  if (segs.length === 0) return;
  markSegmentsLoading(segs);
  updateProgress();
  if (batchStreamEnabled) {
    await runBatchPool(segs, {
      targetLang,
      concurrency: 3,
      cache: semanticCache,
      requestGate: batchRequestGate,
      onSettled: (seg) => handleSettled(seg, generation),
      isActive: () => isSessionActive(generation),
    });
  } else {
    await runPool(segs, {
      targetLang,
      concurrency: 3,
      cache,
      onSettled: (seg) => handleSettled(seg, generation),
      isActive: () => isSessionActive(generation),
    });
  }
}

async function resolveBatchStreamCapability(): Promise<boolean> {
  const capabilities: unknown = await browser.runtime.sendMessage({
    type: 'get-translation-capabilities',
  });
  if (typeof capabilities !== 'object'
    || capabilities === null
    || typeof (capabilities as Partial<TranslationCapabilities>).batchStream !== 'boolean') {
    throw new Error('Invalid translation capabilities response');
  }
  return (capabilities as TranslationCapabilities).batchStream;
}

/** 清理未完成的启动，不保留任何可被误认为 active session 的 DOM 或调度状态。 */
function cleanupFailedStart(generation: number): void {
  if (!isSessionActive(generation)) return;
  if (records.length > 0) restoreAll(records);
  stopObserver();
  clearBatchQueue();
  viewportObserver?.disconnect();
  viewportObserver = null;
  toolbar?.destroy();
  toolbar = null;
  records = [];
  recordedEls = new Set();
  active = false;
  batchStreamEnabled = false;
  targetLang = '';
  sessionGeneration += 1;
}

/** 将多次视口进入和动态分段聚合到同一个 25ms 派发窗口。 */
function queueSegments(segs: SegmentRecord[], generation: number): void {
  if (segs.length === 0 || !isSessionActive(generation)) return;
  if (batchQueueTimer !== null && batchQueueGeneration !== generation) {
    clearBatchQueue();
  }
  batchQueueGeneration = generation;
  for (const seg of segs) queuedSegments.add(seg);
  markSegmentsLoading(segs);
  updateProgress();
  if (batchQueueTimer !== null) return;
  batchQueueTimer = setTimeout(() => {
    batchQueueTimer = null;
    const queuedGeneration = batchQueueGeneration;
    const segments = Array.from(queuedSegments);
    queuedSegments = new Set();
    if (!isSessionActive(queuedGeneration)) return;
    void enqueueSegments(segments, queuedGeneration).catch((err) => {
      console.warn('[fullpage] micro-batch enqueue failed', err);
    });
  }, BATCH_QUEUE_MS);
}

function clearBatchQueue(): void {
  if (batchQueueTimer !== null) {
    clearTimeout(batchQueueTimer);
    batchQueueTimer = null;
  }
  queuedSegments = new Set();
  batchQueueGeneration = 0;
}

/**
 * 创建视口外段 IO 观察器。onEnter 内部将单段走 enqueueSegments
 * 复用同一入池路径；错误由编排器侧 try/catch 隔离，不让 IO 回调异常
 * 破坏状态机（t2 的 IO 内部出列逻辑先于 onEnter）。
 */
function createViewportEnterObserver(
  generation: number,
): ViewportObserver {
  return createViewportObserver((seg) => {
    queueSegments([seg], generation);
  });
}

function isSessionActive(generation: number): boolean {
  return active && sessionGeneration === generation;
}

/**
 * 池逐段 settle 回调：
 * - 会话 generation 失效后不渲染已返回段（防 restore/restart 后译文闪回）
 * - 元素已被宿主移除（isConnected=false）→ 丢弃不渲染
 * - done → 按当前模式渲染；failed → 失败标记 + 更新工具栏计数；translating → 仅更新进度
 */
function handleSettled(seg: SegmentRecord, generation: number): void {
  if (!isSessionActive(generation)) return;
  if (!seg.el.isConnected) return;
  if (seg.status === 'translating') {
    updateProgress();
    return;
  }
  clearLoadingMark(seg);
  updateProgress();
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
  clearBatchQueue();
  viewportObserver?.disconnect();
  viewportObserver = null;
  toolbar?.destroy();
  toolbar = null;
  active = false;
  sessionGeneration++;
  // 注意：cache 与 records[].translatedText 保留，再次触发时命中段秒级渲染（验收标准 10）
}

/** 工具栏回调：重试失败段 — 清除失败标记后重跑池（复用缓存），成功则渲染并更新计数 */
async function handleRetry(): Promise<void> {
  const generation = sessionGeneration;
  const failedSegs = records.filter((r) => r.status === 'failed');
  if (failedSegs.length === 0) return;
  for (const seg of failedSegs) {
    clearFailedMark(seg);
  }
  markSegmentsLoading(failedSegs);
  updateProgress();
  // retrySegments 重置段状态后复用池逻辑；onSettled 的 active 校验保证恢复后不误渲染，
  // 翻译仍完成并写入缓存（有利于再次触发时秒级渲染）
  if (batchStreamEnabled) {
    await retryBatchSegments(failedSegs, {
      targetLang,
      concurrency: 3,
      cache: semanticCache,
      requestGate: batchRequestGate,
      onSettled: (seg) => handleSettled(seg, generation),
      isActive: () => isSessionActive(generation),
    });
  } else {
    await retrySegments(failedSegs, {
      targetLang,
      concurrency: 3,
      cache,
      onSettled: (seg) => handleSettled(seg, generation),
      isActive: () => isSessionActive(generation),
    });
  }
  if (!isSessionActive(generation)) return;
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

/** 启动增量观察器（仅含初始分段的 active 会话调用；重复调用安全） */
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
        const segs = batchStreamEnabled
          ? collectSemanticSegments(node)
          : collectSegments(node);
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
      const generation = sessionGeneration;
      records.push(...newSegments);
      // 增量段同样按视口分组：视口内走 enqueueSegments；视口外挂同一 viewportObserver
      const inViewNew = newSegments.filter(isSegmentInViewport);
      const outOfViewNew = newSegments.filter((r) => !isSegmentInViewport(r));
      queueSegments(inViewNew, generation);
      if (outOfViewNew.length > 0) {
        markSegmentsLoading(outOfViewNew);
        updateProgress();
        // 同一会话复用 viewportObserver 句柄（doStart 与 flushAddedNodes 共享）
        if (!viewportObserver) {
          viewportObserver = createViewportEnterObserver(generation);
        }
        for (const seg of outOfViewNew) {
          viewportObserver.observe(seg);
        }
      }
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
  semanticCache: Map<string, SemanticTranslation>;
  batchStreamEnabled: boolean;
  targetLang: string;
}

/** 测试专用：读取内部状态（勿在生产代码使用） */
export function __getState(): OrchestratorStateSnapshot {
  return {
    records,
    mode,
    active,
    cache,
    semanticCache,
    batchStreamEnabled,
    targetLang,
  };
}

/** 测试专用：重置全部模块级状态（还原页面 DOM、断开观察器、销毁工具栏、清空缓存） */
export function __reset(): void {
  if (records.length > 0) {
    restoreAll(records);
  }
  stopObserver();
  clearBatchQueue();
  viewportObserver?.disconnect();
  viewportObserver = null;
  toolbar?.destroy();
  toolbar = null;
  records = [];
  recordedEls = new Set();
  mode = 'replace';
  active = false;
  sessionGeneration++;
  cache = new Map();
  semanticCache = new Map();
  batchStreamEnabled = false;
  targetLang = '';
  startInFlight = null;
  isFlushing = false;
}
