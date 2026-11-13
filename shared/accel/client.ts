// 加速节点 HTTP 客户端 — fail-open 语义。
//
// 见 ADR-0002 / CONTEXT.md §3.12：
// - lookup 任何异常（超时 / 网络 / 非 2xx / 响应畸形）→ 按「全未命中」处理，不向用户暴露
// - commit 为 fire-and-forget，失败即丢弃
// - lookup 超时 3 秒（可配），必须显著短于翻译超时，否则未命中场景反而变慢
//
// 本文件只负责「一次 HTTP 往返」；合批、限流退避与熔断在 scheduler.ts。
// 拆开的原因是客户端要用状态码判断是否该冷却，而对外仍保持「永不抛错」的语义。

const DEFAULT_LOOKUP_TIMEOUT_MS = 3000;

/** lookup 响应中单条命中的形状（服务端契约 LookupResponse）。 */
export interface AccelHit {
  id: string;
  translatedText: string;
}

/** lookup 请求中的一条原文（服务端契约 LookupItem）。 */
export interface AccelLookupQuery {
  id: string;
  text: string;
  /** 缺省或空串 = 自动检测。 */
  sourceLang?: string;
  targetLang: string;
}

/** commit 请求中的一条完整条目（服务端契约 CommitItem）。 */
export interface AccelCommitItem extends AccelLookupQuery {
  translatedText: string;
}

/** 单次请求的结果。ok=false 表示节点拒绝/不可达，调度器据此进入冷却。 */
export interface AccelOutcome {
  ok: boolean;
  /** 服务端 Retry-After（毫秒）；缺失为 undefined。 */
  retryAfterMs?: number;
}

/** lookup 结果：命中列表 + 是否成功。 */
export interface AccelLookupOutcome extends AccelOutcome {
  hits: AccelHit[];
}

/** 生成相关 id（仅用于请求-响应回填，服务端不参与缓存身份）。 */
export function newAccelId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 带超时的 fetch。lookup 的超时必须显著短于翻译超时
 * （LLM 翻译 60 秒，传统源较快，3 秒在两者之下都安全）。
 */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 解析 Retry-After：秒数或 HTTP 日期，统一转毫秒。 */
function parseRetryAfter(resp: Response): number | undefined {
  const raw = resp.headers.get('retry-after');
  if (raw === null || raw.trim() === '') return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const at = Date.parse(raw);
  if (Number.isFinite(at)) return Math.max(0, at - Date.now());
  return undefined;
}

/**
 * 批量查缓存（单次往返）。
 * - 返回值只含命中项；调用方按 id 回填，未出现的 id 一律视为未命中
 * - 超时（默认 3 秒）/ 网络错误 / 非 2xx → ok=false + 空 hits，调用方据此 fail-open
 * - 响应中的未知 id、缺失 translatedText 的条目一律忽略
 */
export async function requestLookup(
  endpoint: string,
  items: AccelLookupQuery[],
  timeoutMs = DEFAULT_LOOKUP_TIMEOUT_MS,
): Promise<AccelLookupOutcome> {
  try {
    const resp = await fetchWithTimeout(
      `${endpoint}/v1/cache/lookup`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items }),
      },
      timeoutMs,
    );
    if (!resp.ok) {
      return { ok: false, hits: [], retryAfterMs: parseRetryAfter(resp) };
    }
    const body: unknown = await resp.json();
    if (typeof body !== 'object' || body === null) {
      // 2xx 但响应畸形：节点是活的，不该触发冷却，按未命中处理即可。
      return { ok: true, hits: [] };
    }
    const hits = (body as { hits?: unknown }).hits;
    if (!Array.isArray(hits)) return { ok: true, hits: [] };
    return {
      ok: true,
      hits: hits.filter(
        (hit): hit is AccelHit =>
          typeof hit === 'object'
          && hit !== null
          && typeof (hit as { id?: unknown }).id === 'string'
          && typeof (hit as { translatedText?: unknown }).translatedText === 'string',
      ),
    };
  } catch {
    // fail-open：任何异常都按全未命中处理
    return { ok: false, hits: [] };
  }
}

/**
 * 批量查缓存（兼容旧调用方）：只返回命中列表。
 * 新代码应走 scheduler 的 accelLookupBatched，以便合批与冷却。
 */
export async function accelLookup(
  endpoint: string,
  items: AccelLookupQuery[],
  timeoutMs = DEFAULT_LOOKUP_TIMEOUT_MS,
): Promise<AccelHit[]> {
  const outcome = await requestLookup(endpoint, items, timeoutMs);
  return outcome.hits;
}

/**
 * 批量存缓存（单次往返，永不抛错）。
 * 调用方不需要 await 结果；拒绝已被内部消费，不会产生 unhandled rejection。
 */
export async function requestCommit(
  endpoint: string,
  items: AccelCommitItem[],
  timeoutMs = DEFAULT_LOOKUP_TIMEOUT_MS,
): Promise<AccelOutcome> {
  try {
    const resp = await fetchWithTimeout(
      `${endpoint}/v1/cache/commit`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items }),
      },
      timeoutMs,
    );
    // 响应体不需要消费，主动释放连接。
    if (resp.body !== null) void resp.body.cancel().catch(() => { /* 丢弃 */ });
    return { ok: resp.ok, retryAfterMs: parseRetryAfter(resp) };
  } catch {
    // fail-open：失败即丢弃，不向用户暴露
    return { ok: false };
  }
}

/**
 * 批量存缓存（fire-and-forget 兼容入口）。
 * 新代码应走 scheduler 的 accelCommitQueued，以便合并写入并遵守冷却。
 */
export function accelCommit(endpoint: string, items: AccelCommitItem[]): void {
  void requestCommit(endpoint, items);
}

/** 健康检查结果。区分「节点不可达」与「节点活着但 Redis 挂了」。 */
export type AccelHealthStatus =
  | { reachable: true; redis: 'ok' | 'down'; version: string }
  | { reachable: false; reason: string };

/**
 * 测试连通（设置页按钮）。打 `GET /healthz`。
 * 与 lookup 不同，这里需要把失败原因如实回给用户，因此不吞错误。
 */
export async function accelHealth(
  endpoint: string,
  timeoutMs = DEFAULT_LOOKUP_TIMEOUT_MS,
): Promise<AccelHealthStatus> {
  try {
    const resp = await fetchWithTimeout(
      `${endpoint}/healthz`,
      { method: 'GET' },
      timeoutMs,
    );
    const body: unknown = await resp.json().catch(() => null);
    const redis = (body as { redis?: unknown } | null)?.redis;
    const version = (body as { version?: unknown } | null)?.version;
    // 503 + redis:'down' 也是有效响应：节点活着，缓存没通。
    if (redis === 'ok' || redis === 'down') {
      return {
        reachable: true,
        redis,
        version: typeof version === 'string' ? version : 'unknown',
      };
    }
    return { reachable: false, reason: `HTTP ${resp.status}` };
  } catch (err) {
    return { reachable: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
