// 全文翻译编排器 — 唯一状态持有者，组合 segmenter / pool / renderer / toolbar 的状态机
//
// 职责：
// - start(mode)：收集分段 → 挂工具栏 → 并发翻译池（onSettled 逐段即时渲染）→ 启动增量观察器
// - 工具栏回调接线：切换模式（零 API）/ 恢复原文（保留会话缓存）/ 重试失败段 / 收起展开
// - 增量翻译：MutationObserver + 200ms 防抖聚合新增节点，过滤注入子树，recordedEls 去重收段
//
// segmenter / pool / renderer / toolbar 均为无全局状态组件；本模块是唯一状态持有者。
// 样式隔离约定：所有注入 DOM 带 data-llm-translator（分段排除、观察器过滤、恢复清理均依赖）。

import { isSegmentInViewport, createViewportObserver, type ViewportObserver } from './translate-pool';
import { createBatchRequestGate } from './batch-pool';
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
import {
  discoverSegments,
  createIdleChunkerScheduler,
  DiscoveryAborted,
} from './chunker';
import { pickStrategy, type TranslationStrategy, type StrategyContext } from './strategy';
import {
  createDebouncer,
  createDrainQueue,
  type DrainQueue,
} from './scheduler';
import { getTargetLang } from '../target-lang';
import type { BackgroundCommand, DisplayMode, TranslationCapabilities } from '../types';
import type { SegmentRecord, SemanticTranslation } from './types';

/** 增量翻译防抖间隔（ms） */
const OBSERVER_DEBOUNCE_MS = 200;
/** 视口进入与动态分段共享的 micro-batch 聚合窗口（ms） */
const BATCH_QUEUE_MS = 25;
/** 动态视口外段等待滚入视口的短暂优先窗口，之后自动后台翻译。 */
const DEFERRED_DRAIN_MS = 100;
/** chunker 调度器预算（ms），与 Q21=B 一致 */
const CHUNKER_BUDGET_MS = 8;
/** chunker 每片段数上限，与 Q9 决策一致 */
const CHUNK_SIZE = 200;

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
/** 当前会话翻译策略，由 capability 解析一次；chunker 模式、增量收段、入池与重试均经此分发。 */
let strategy: TranslationStrategy | null = null;
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

// ---- 三个子状态对象（详见 ./scheduler.ts） ----

/**
 * MutationObserver 防抖：200ms 内多次 mutation 聚合到一次 flush。
 * drain 时调 flushAddedNodesBatch 进行分段收集与派发。
 */
let addedNodesDebouncer: ReturnType<typeof createDebouncer<HTMLElement>> | null = null;

/**
 * 视口进入 + 动态分段共享 micro-batch 队列：25ms 聚合窗口。
 * drain 时把 pending 且连接中的段派发入池。
 */
let microBatch: DrainQueue<SegmentRecord> | null = null;

/**
 * 视口外段延迟排空队列：已挂 viewportObserver、等待滚入视口或兜底排空的段。
 * 成员在视口进入 / SPA 删除时被摘除；drain 时把剩余段送回 micro-batch。
 */
let deferredViewport: DrainQueue<SegmentRecord> | null = null;

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
  clearDeferredDrain();
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
  strategy = pickStrategy(resolvedBatchStreamEnabled, {
    cache,
    semanticCache,
    requestGate: batchRequestGate,
  });

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

  // 流式分段发现: 通过 chunker 把 walkSegments/walkSemanticSegments 切到 rIC 上,
  // 1000+ 段页面不会在同步收集阶段冻结主线程(Q12=B 预算)。
  // 每个 chunk flush 出来后立刻分入池(inView)/挂 IO(outOfView), 用户先看见可见区域。
  // chunkerMode 由 strategy 解析 capability 时一并确定；不需要在编排器再分支一次。
  const chunkerMode = strategy.chunkerMode;
  records = [];
  recordedEls = new Set();
  // 收集阶段工具栏进不定态脉冲: total 未知, 显示"全文翻译中…"
  toolbar.setIndeterminate(true);
  // 空页面也要进“不发现任何段”分支; 以 `total=0` 收尾
  try {
    await discoverSegments({
      root: document.body,
      mode: chunkerMode,
      chunkSize: CHUNK_SIZE,
      scheduler: createIdleChunkerScheduler(CHUNKER_BUDGET_MS),
      isActive: () => isSessionActive(generation),
      isInViewport: isSegmentInViewport,
      onChunk: (chunk) => handleDiscoveryChunk(chunk, generation),
    });
  } catch (error) {
    if (error instanceof DiscoveryAborted) {
      // 会话在发现中途被 restore / restart 抢占: 跳出, 并发下一次 start() 走全新路径
      cleanupFailedStart(generation);
      return;
    }
    cleanupFailedStart(generation);
    throw error;
  } finally {
    if (isSessionActive(generation) && toolbar) {
      toolbar.setIndeterminate(false);
    }
  }
  // 发现收尾: 不论 total=N 还是 0, 都跑一次 updateProgress 让工具栏从不定态切到
  // 真实 M/N(空页面 → “未发现可翻译文本”)。
  if (isSessionActive(generation)) {
    updateProgress();
    // 视口只决定优先级，不决定是否翻译。发现结束后后台排空所有未相交段，
    // 避免 sticky/hidden 几何或用户不滚动时进度永久停在 N-x/N。
    scheduleDeferredDrain(generation, 0);
  }

  // 会话失效或初始页面无分段时不启动观察器
  if (isSessionActive(generation) && records.length > 0) {
    startObserver();
  }
}

/**
 * 处理一个发现 chunk: 去重、入 records、视口内入池、视口外挂 IO。
 * 供 onChunk 回调: 每隔 CHUNK_SIZE 段或预算耗尽时调用一次。
 */
function handleDiscoveryChunk(
  chunk: { inView: SegmentRecord[]; outOfView: SegmentRecord[] },
  generation: number,
): void {
  if (!isSessionActive(generation)) return;
  // 去重: 同一段可能在 chunker 期间已被另一路径记入 (极端: MutationObserver 同时冲入)
  const newInView = chunk.inView.filter((s) => !recordedEls.has(s.el));
  const newOutView = chunk.outOfView.filter((s) => !recordedEls.has(s.el));
  for (const s of newInView) recordedEls.add(s.el);
  for (const s of newOutView) recordedEls.add(s.el);
  if (newInView.length === 0 && newOutView.length === 0) return;
  records.push(...newInView, ...newOutView);

  // 视口内: 立即入池
  if (newInView.length > 0) {
    void enqueueSegments(newInView, generation).catch((err) => {
      console.warn('[fullpage] discovery in-view enqueue failed', err);
    });
  }
  // 视口外: markLoading + 挂 IO + 入延迟排空队列
  if (newOutView.length > 0) {
    markSegmentsLoading(newOutView);
    ensureViewportObserver(generation);
    ensureDeferredViewport(generation);
    for (const seg of newOutView) {
      viewportObserver?.observe(seg);
      deferredViewport?.add(seg);
    }
  }
  updateProgress();
  // 发现阶段所有 chunk 收完后由 doStart 统一 scheduleDeferredDrain(generation, 0)；
  // 动态发现路径（增量 flush）自行排 100ms 优先窗口。
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
  if (!strategy) return;
  const ctx: StrategyContext = {
    targetLang,
    generation,
    isActive: () => isSessionActive(generation),
    onSettled: (seg) => handleSettled(seg, generation),
  };
  await strategy.enqueue(segs, ctx);
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
  clearDeferredDrain();
  viewportObserver?.disconnect();
  viewportObserver = null;
  toolbar?.destroy();
  toolbar = null;
  records = [];
  recordedEls = new Set();
  active = false;
  strategy = null;
  targetLang = '';
  sessionGeneration += 1;
}

/** 用于 `__reset`: 导入保留, 以备单测需要。 */
void pickStrategy;

/** 初始化 micro-batch 队列（同一会话复用；generation 捕获到 drain 回调里校验）。 */
function ensureMicroBatch(generation: number): void {
  if (microBatch) return;
  microBatch = createDrainQueue<SegmentRecord>((items) => {
    if (!isSessionActive(generation)) return;
    discardDisconnectedSegments(items);
    const segments = items.filter(
      (seg) => seg.status === 'pending' && seg.el.isConnected,
    );
    void enqueueSegments(segments, generation).catch((err) => {
      console.warn('[fullpage] micro-batch enqueue failed', err);
    });
  });
}

/** 初始化视口外延迟排空队列。 */
function ensureDeferredViewport(generation: number): void {
  if (deferredViewport) return;
  deferredViewport = createDrainQueue<SegmentRecord>((items) => {
    if (!isSessionActive(generation)) return;
    for (const seg of items) {
      viewportObserver?.unobserve(seg);
    }
    discardDisconnectedSegments(items);
    const segments = items.filter(
      (seg) => seg.status === 'pending' && seg.el.isConnected,
    );
    queueSegments(segments, generation);
  });
}

/** 将多次视口进入和动态分段聚合到同一个 25ms 派发窗口。 */
function queueSegments(segs: SegmentRecord[], generation: number): void {
  const pendingSegments = segs.filter((seg) => seg.status === 'pending');
  if (pendingSegments.length === 0 || !isSessionActive(generation)) return;
  ensureMicroBatch(generation);
  markSegmentsLoading(pendingSegments);
  updateProgress();
  for (const seg of pendingSegments) {
    microBatch?.add(seg);
  }
  microBatch?.scheduleTimer(BATCH_QUEUE_MS);
}

function clearBatchQueue(): void {
  microBatch?.clear();
}

/** 安排视口外段兜底派发；初始发现结束立即安排（delay=0），动态段保留视口优先窗口。 */
function scheduleDeferredDrain(generation: number, delay = DEFERRED_DRAIN_MS): void {
  if (!isSessionActive(generation)) return;
  ensureDeferredViewport(generation);
  deferredViewport?.scheduleTimer(delay);
}

function clearDeferredDrain(): void {
  deferredViewport?.clear();
}

/** SPA 删除尚未完成的源节点时，从进度与所有注入状态中同步移除该段。 */
function discardDisconnectedSegments(segments: SegmentRecord[]): void {
  const disconnected = segments.filter((seg) => !seg.el.isConnected);
  if (disconnected.length === 0) return;
  const discarded = new Set(disconnected);
  for (const seg of disconnected) {
    clearLoadingMark(seg);
    clearFailedMark(seg);
    seg.blockHost?.remove();
    seg.blockHost = undefined;
    deferredViewport?.remove(seg);
    viewportObserver?.unobserve(seg);
    recordedEls.delete(seg.el);
  }
  records = records.filter((seg) => !discarded.has(seg));
  updateFailureCount();
  updateProgress();
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
    deferredViewport?.remove(seg);
    queueSegments([seg], generation);
  });
}

/** 确保 viewportObserver 存在（同一会话复用同一句柄）。 */
function ensureViewportObserver(generation: number): void {
  if (!viewportObserver) {
    viewportObserver = createViewportEnterObserver(generation);
  }
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
  if (!seg.el.isConnected) {
    discardDisconnectedSegments([seg]);
    return;
  }
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
    markFailed(seg, () => {
      void handleRetry([seg]);
    });
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
  clearDeferredDrain();
  viewportObserver?.disconnect();
  viewportObserver = null;
  toolbar?.destroy();
  toolbar = null;
  active = false;
  sessionGeneration++;
  // 注意：cache 与 records[].translatedText 保留，再次触发时命中段秒级渲染（验收标准 10）
}

/** 工具栏回调：重试失败段 — 清除失败标记后重跑池（复用缓存），成功则渲染并更新计数 */
async function handleRetry(requestedSegments?: SegmentRecord[]): Promise<void> {
  const generation = sessionGeneration;
  const failedSegs = (requestedSegments ?? records).filter((r) => r.status === 'failed');
  if (failedSegs.length === 0) return;
  for (const seg of failedSegs) {
    clearFailedMark(seg);
    seg.status = 'pending';
    seg.errorType = undefined;
  }
  markSegmentsLoading(failedSegs);
  updateFailureCount();
  updateProgress();
  // retrySegments 重置段状态后复用池逻辑；onSettled 的 active 校验保证恢复后不误渲染，
  // 翻译仍完成并写入缓存（有利于再次触发时秒级渲染）
  if (!strategy) return;
  const ctx: StrategyContext = {
    targetLang,
    generation,
    isActive: () => isSessionActive(generation),
    onSettled: (seg) => handleSettled(seg, generation),
  };
  await strategy.retry(failedSegs, ctx);
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
  ensureAddedNodesDebouncer();
  observer = new MutationObserver(handleMutations);
  observer.observe(document.body, { childList: true, subtree: true });
}

/** 断开观察器并清空待处理节点与防抖计时器 */
function stopObserver(): void {
  observer?.disconnect();
  observer = null;
  addedNodesDebouncer?.cancel();
}

/** MutationObserver 回调：聚合 addedNodes，每次 mutation 重置 200ms 防抖 */
function handleMutations(mutations: MutationRecord[]): void {
  if (!addedNodesDebouncer) return;
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node instanceof HTMLElement) {
        addedNodesDebouncer.add(node);
      }
    }
  }
}

/** 初始化增量翻译防抖器（同一会话复用）。 */
function ensureAddedNodesDebouncer(): void {
  if (addedNodesDebouncer) return;
  addedNodesDebouncer = createDebouncer<HTMLElement>(
    OBSERVER_DEBOUNCE_MS,
    (batch) => flushAddedNodesBatch(batch),
  );
}

/**
 * 防抖 flush：逐新增子树 collectFor → recordedEls 去重 → 新段入 records
 * 并按视口分组派发（视口内进 micro-batch；视口外挂 IO + 延迟排空）。
 * 自身渲染产物带 data-llm-translator，在此过滤，不形成回环。
 */
async function flushAddedNodesBatch(batch: HTMLElement[]): Promise<void> {
  const newSegments: SegmentRecord[] = [];
  for (const node of batch) {
    if (!active) break;
    try {
      if (!node.isConnected) continue;
      if (node.hasAttribute('data-llm-translator')) continue;
      if (!strategy) continue;
      const segs = strategy.collectFor(node);
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
    // 增量段同样按视口分组：视口内走 queueSegments；视口外挂同一 viewportObserver
    const inViewNew = newSegments.filter(isSegmentInViewport);
    const outOfViewNew = newSegments.filter((r) => !isSegmentInViewport(r));
    queueSegments(inViewNew, generation);
    if (outOfViewNew.length > 0) {
      markSegmentsLoading(outOfViewNew);
      updateProgress();
      // 同一会话复用 viewportObserver 句柄（doStart 与 flushAddedNodes 共享）
      ensureViewportObserver(generation);
      ensureDeferredViewport(generation);
      for (const seg of outOfViewNew) {
        viewportObserver?.observe(seg);
        deferredViewport?.add(seg);
      }
      scheduleDeferredDrain(generation);
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
    batchStreamEnabled: strategy?.chunkerMode === 'semantic',
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
  clearDeferredDrain();
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
  strategy = null;
  targetLang = '';
  startInFlight = null;
  // 调度器对象在同一会话内复用（generation 捕获在回调里校验），跨会话直接丢弃重建
  addedNodesDebouncer = null;
  microBatch = null;
  deferredViewport = null;
}
