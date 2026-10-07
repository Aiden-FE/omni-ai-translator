// 环境变量解析与校验。
//
// 见 ADR-0002：TRUST_PROXY 必须在部署于反向代理之后才开启——
// 默认 false（直连按 socket 地址），置为 true 时 request.ip 取 X-Forwarded-For。
// 不配的后果：所有经 nginx 的自建者共用 127.0.0.1 一个限流桶，互相挤掉对方。

/** 30 天。译文结果不随时间失效，但脏数据需要可恢复窗口。 */
export const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface RelayEnv {
  /** 服务监听端口。 */
  port: number;
  /** Redis 连接串。 */
  redisUrl: string;
  /** 缓存 TTL（秒）。 */
  ttlSeconds: number;
  /** 是否信任反向代理。 */
  trustProxy: boolean;
  /** lookup 每分钟每 IP 允许次数（宽松）。 */
  lookupLimit: number;
  /** commit 每分钟每 IP 允许次数（严格——写才是成本大头）。 */
  commitLimit: number;
  /** 限流窗口（秒）。 */
  rateLimitWindowSeconds: number;
}

export class EnvParseError extends Error {}

function readInt(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  { min }: { min: number },
): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new EnvParseError(`${key} 必须是 >= ${min} 的整数，实际为 "${raw}"`);
  }
  return parsed;
}

function readBool(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new EnvParseError(`${key} 必须是 true/false，实际为 "${raw}"`);
}

export function loadEnv(env: NodeJS.ProcessEnv = process.env): RelayEnv {
  return {
    port: readInt(env, 'PORT', 3000, { min: 1 }),
    redisUrl: env.REDIS_URL?.trim() || 'redis://localhost:6379',
    ttlSeconds: readInt(env, 'CACHE_TTL_SECONDS', DEFAULT_TTL_SECONDS, { min: 1 }),
    trustProxy: readBool(env, 'TRUST_PROXY', false),
    lookupLimit: readInt(env, 'RATE_LIMIT_LOOKUP', 120, { min: 1 }),
    commitLimit: readInt(env, 'RATE_LIMIT_COMMIT', 30, { min: 1 }),
    rateLimitWindowSeconds: readInt(env, 'RATE_LIMIT_WINDOW_SECONDS', 60, { min: 1 }),
  };
}
