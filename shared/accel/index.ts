// 加速层对外入口。
export {
  DEFAULT_ACCEL_SCOPE,
  OFFICIAL_ACCEL_ENDPOINT,
  deriveAccelSettings,
  isAccelEligible,
  normalizeAccelEndpoint,
} from './config';
export type { AccelScope } from './config';
export {
  accelCommit,
  accelHealth,
  accelLookup,
  newAccelId,
} from './client';
export type {
  AccelCommitItem,
  AccelHealthStatus,
  AccelHit,
  AccelLookupQuery,
} from './client';
