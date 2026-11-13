// 加速请求调度器 — 微批合流 + 限流退避 / 熔断。
//
// 背景（2026-11-13 生产诊断，见 CONTEXT.md §3.24）：
// 默认免 Key 源的全文翻译逐段调用适配层，每段触发 1 次 lookup + 1 次 commit。
// 一篇 60 段的文章≈120 次请求，直接撞满官方节点的 per-IP 限额
// （relay 30 commit/min + 反向代理 8r/s），实测 65% 被 429；而 fail-open 把 429
// 当「未命中」，于是用户侧几乎没有加速感，且节点越忙客户端越重试。
//
// 本模块做两件事：
// 1. 合流：同一 endpoint 的并发 lookup 在 25ms 窗口内合成一个请求（≤200 条），
//    commit 按 40 条或 1.2s 空闲落盘；同一时刻每条通道只有 1 个在途请求。
// 2. 快速失败：429 / 5xx / 网络错误 → 立刻把所有等待中的查询按未命中返回
//    （调用方马上走自己的翻译源，不阻塞、不排队等节点释放），并进入指数退避冷却；
//    冷却期内 lookup 直接返回空、commit 直接丢弃，不再向已拥堵的节点发请求。
//    冷却结束后的第一个请求即探针：成功清零，失败继续加倍。
//
// 所有时间参数可用 configureAccelScheduler 覆盖，仅供单测/调试，生产不调用。

import { MAX_ITEMS_PER_REQUEST } from '@/services/relay/src/contracts';
import {
  requestCommit,
  requestLookup,
  type AccelCommitItem,
  type AccelHit,
  type AccelLookupQuery,
  type AccelOutcome,
} from './client';

const DEFAULT_LOOKUP_TIMEOUT_MS = 3000;

/** commit 队列上限：超过即丢最旧的，避免页面异常时无限增长。 */
const MAX_PENDING_COMMITS = 500;

/** 调度参数。 */
export interface AccelSchedulerTiming {
  /** lookup 合流窗口（毫秒）。 */
  lookupWindowMs: number;
  /** commit 空闲落盘延迟（毫秒）。 */
  commitIdleMs: number;
  /** commit 达到多少条立即落盘。 */
  commitFlushItems: number;
  /** 首次冷却时长（毫秒），之后指数翻倍。 */
  cooldownBaseMs: number;
  /** 冷却时长上限（毫秒）。 */
  cooldownMaxMs: number;
  /** 冷却抖动比例（0–1）：避免所有客户端在同一毫秒重试，形成二次拥塞。 */
  cooldownJitterRatio: number;
}

const DEFAULT_TIMING: AccelSchedulerTiming = {
  lookupWindowMs: 25,
  commitIdleMs: 1200,
  commitFlushItems: 40,
  cooldownBaseMs: 10_000,
  cooldownMaxMs: 120_000,
  cooldownJitterRatio: 0.2,
};

let timing: AccelSchedulerTiming = { ...DEFAULT_TIMING };

/** 一次调用（可能拆成多个批次）共享的解析上下文。 */
interface LookupGroup {
  remaining: number;
  hits: AccelHit[];
  done: boolean;
  resolve: (hits: AccelHit[]) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

interface PendingLookup {
  query: AccelLookupQuery;
  group: LookupGroup;
}

interface EndpointState {
  queue: PendingLookup[];
  lookupTimer: ReturnType<typeof setTimeout> | null;
  lookupInFlight: boolean;
  commitQueue: AccelCommitItem[];
  commitTimer: ReturnType<typeof setTimeout> | null;
  commitInFlight: boolean;
  /** 连续失败次数，成功一次即清零。 */
  failures: number;
  /** 冷却截止时间（epoch ms）；0 表示未冷却。 */
  openUntil: number;
}

const states = new Map<string, EndpointState>();

function getState(endpoint: string): EndpointState {
  const existing = states.get(endpoint);
  if (existing !== undefined) return existing;
  const state: EndpointState = {
    queue: [],
    lookupTimer: null,
    lookupInFlight: false,
    commitQueue: [],
    commitTimer: null,
    commitInFlight: false,
    failures: 0,
    openUntil: 0,
  };
  states.set(endpoint, state);
  return state;
}

/** 是否处于冷却期（此期间不发任何请求）。 */
function isCoolingDown(state: EndpointState): boolean {
  return state.openUntil > Date.now();
}

function settleGroup(group: LookupGroup): void {
  if (group.done) return;
  group.done = true;
  if (group.timer !== null) {
    clearTimeout(group.timer);
    group.timer = null;
  }
  group.resolve(group.hits);
}

/** 把一批条目按「未命中」结清（group.remaining 归零时解析）。 */
function settleAsMiss(entries: PendingLookup[]): void {
  for (const entry of entries) {
    const group = entry.group;
    if (group.done) continue;
    group.remaining -= 1;
    if (group.remaining <= 0) settleGroup(group);
  }
}

/** 清空排队中的查询：全部按未命中立即返回，调用方马上走自己的翻译源。 */
function drainLookupQueue(state: EndpointState): void {
  if (state.lookupTimer !== null) {
    clearTimeout(state.lookupTimer);
    state.lookupTimer = null;
  }
  const pending = state.queue.splice(0, state.queue.length);
  settleAsMiss(pending);
}

function scheduleLookupFlush(state: EndpointState, endpoint: string, delay: number): void {
  if (state.lookupTimer !== null || state.lookupInFlight) return;
  state.lookupTimer = setTimeout(() => {
    state.lookupTimer = null;
    void flushLookup(state, endpoint);
  }, delay);
}

/** 取下一批待查条目：跳过已超时（group 已 done）的条目。 */
function takeLookupBatch(state: EndpointState): PendingLookup[] {
  const batch: PendingLookup[] = [];
  while (batch.length < MAX_ITEMS_PER_REQUEST && state.queue.length > 0) {
    const entry = state.queue.shift();
    if (entry === undefined) break;
    if (!entry.group.done) batch.push(entry);
  }
  return batch;
}

/** 把响应里的命中回填给对应 group。 */
function applyHits(batch: PendingLookup[], hits: AccelHit[]): void {
  const byId = new Map<string, AccelHit>();
  for (const hit of hits) byId.set(hit.id, hit);
  for (const entry of batch) {
    const group = entry.group;
    if (group.done) continue;
    const hit = byId.get(entry.query.id);
    if (hit !== undefined) group.hits.push(hit);
    group.remaining -= 1;
    if (group.remaining <= 0) settleGroup(group);
  }
}

function noteFailure(state: EndpointState, retryAfterMs?: number): void {
  state.failures += 1;
  const exponent = Math.min(state.failures - 1, 10);
  const backoff = Math.min(timing.cooldownMaxMs, timing.cooldownBaseMs * 2 ** exponent);
  const cooldown = Math.max(backoff, retryAfterMs ?? 0);
  // 抖动：同一节点被打满时，客户端不应在同一毫秒集体重试。
  const jitter = Math.round(cooldown * timing.cooldownJitterRatio * Math.random());
  state.openUntil = Date.now() + cooldown + jitter;
  // 冷却期内不再写：排队中的 commit 直接丢弃，避免节点恢复瞬间被旧流量淹没。
  state.commitQueue.length = 0;
  if (state.commitTimer !== null) {
    clearTimeout(state.commitTimer);
    state.commitTimer = null;
  }
}

function noteSuccess(state: EndpointState): void {
  // 冷却期内到达的成功响应多半是冷却前发出的旧请求：不能据此提前解除冷却，
  // 否则「lookup 429 → 在途 commit 成功」会让冷却失效、流量立刻又打满节点。
  if (isCoolingDown(state)) return;
  state.failures = 0;
  state.openUntil = 0;
}

async function flushLookup(state: EndpointState, endpoint: string): Promise<void> {
  if (state.lookupInFlight) return;
  const batch = takeLookupBatch(state);
  if (batch.length === 0) return;

  // 冷却可能在排队期间被其它请求打开。
  if (isCoolingDown(state)) {
    settleAsMiss(batch);
    drainLookupQueue(state);
    return;
  }

  state.lookupInFlight = true;
  let outcome: Awaited<ReturnType<typeof requestLookup>>;
  try {
    outcome = await requestLookup(endpoint, batch.map((entry) => entry.query));
  } catch {
    outcome = { ok: false, hits: [] };
  }
  state.lookupInFlight = false;

  if (outcome.ok) {
    noteSuccess(state);
    applyHits(batch, outcome.hits);
  } else {
    noteFailure(state, outcome.retryAfterMs);
    settleAsMiss(batch);
    drainLookupQueue(state);
  }

  if (state.queue.length > 0 && !isCoolingDown(state)) {
    scheduleLookupFlush(state, endpoint, 0);
  }
}

/** 合并提交计划：已有更晚的定时器时，按需提前。 */
function scheduleCommitFlush(state: EndpointState, endpoint: string, delay: number): void {
  if (state.commitInFlight) return;
  if (state.commitTimer !== null) {
    if (delay > 0) return;
    clearTimeout(state.commitTimer);
    state.commitTimer = null;
  }
  state.commitTimer = setTimeout(() => {
    state.commitTimer = null;
    void flushCommit(state, endpoint);
  }, delay);
}

async function flushCommit(state: EndpointState, endpoint: string): Promise<void> {
  if (state.commitInFlight) return;
  if (isCoolingDown(state)) {
    state.commitQueue.length = 0;
    return;
  }
  const batch = state.commitQueue.splice(0, MAX_ITEMS_PER_REQUEST);
  if (batch.length === 0) return;

  state.commitInFlight = true;
  let outcome: AccelOutcome;
  try {
    outcome = await requestCommit(endpoint, batch);
  } catch {
    outcome = { ok: false };
  }
  state.commitInFlight = false;

  if (outcome.ok) {
    noteSuccess(state);
  } else {
    // 写失败不重试：旧译文可能已过期，重发还可能打爆已经吃紧的节点。
    noteFailure(state, outcome.retryAfterMs);
  }

  if (state.commitQueue.length > 0 && !isCoolingDown(state)) {
    const delay = state.commitQueue.length >= timing.commitFlushItems ? 0 : timing.commitIdleMs;
    scheduleCommitFlush(state, endpoint, delay);
  }
}

/**
 * 批量查缓存（合流 + 冷却）。
 * - 合流窗口内的并发调用合并成一个 HTTP 请求（≤200 条）
 * - 冷却期 / 失败时立即解析为空数组，调用方无需等待即可走自己的翻译源
 */
export function accelLookupBatched(
  endpoint: string,
  queries: AccelLookupQuery[],
  timeoutMs = DEFAULT_LOOKUP_TIMEOUT_MS,
): Promise<AccelHit[]> {
  if (queries.length === 0) return Promise.resolve([]);
  const state = getState(endpoint);
  if (isCoolingDown(state)) return Promise.resolve([]);

  return new Promise<AccelHit[]>((resolve) => {
    const group: LookupGroup = {
      remaining: queries.length,
      hits: [],
      done: false,
      resolve,
      timer: null,
    };
    group.timer = setTimeout(() => settleGroup(group), timeoutMs);
    for (const query of queries) state.queue.push({ query, group });
    scheduleLookupFlush(state, endpoint, timing.lookupWindowMs);
  });
}

/**
 * 批量存缓存（排队 + 合流 + 冷却）。
 * fire-and-forget：不返回 Promise，任何失败都在内部丢弃。
 */
export function accelCommitQueued(endpoint: string, items: AccelCommitItem[]): void {
  if (items.length === 0) return;
  const state = getState(endpoint);
  if (isCoolingDown(state)) return;

  state.commitQueue.push(...items);
  if (state.commitQueue.length > MAX_PENDING_COMMITS) {
    state.commitQueue.splice(0, state.commitQueue.length - MAX_PENDING_COMMITS);
  }
  const delay = state.commitQueue.length >= timing.commitFlushItems ? 0 : timing.commitIdleMs;
  scheduleCommitFlush(state, endpoint, delay);
}

/** 覆盖调度参数（仅供单测 / 调试）。 */
export function configureAccelScheduler(partial: Partial<AccelSchedulerTiming>): void {
  timing = { ...timing, ...partial };
}

/** 清空调度器状态并恢复默认参数（仅供单测）。 */
export function resetAccelScheduler(): void {
  for (const state of states.values()) {
    if (state.lookupTimer !== null) clearTimeout(state.lookupTimer);
    if (state.commitTimer !== null) clearTimeout(state.commitTimer);
    drainLookupQueue(state);
    state.commitQueue.length = 0;
  }
  states.clear();
  timing = { ...DEFAULT_TIMING };
}
