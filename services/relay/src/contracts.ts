// 加速节点契约 — 插件与 relay 服务共享的类型定义。
//
// 设计约束见 ADR-0002：
// - `id` 仅作批量回填的相关 id，**不参与缓存身份**；缓存身份只由
//   {text, sourceLang, targetLang} 决定，且规范化与哈希全部在服务端完成
//   （客户端不实现哈希算法，避免两端实现漂移）。
// - Key 不含 model / customPrompt 指纹：加速层定位为通用译文加速层。
// - 响应中未出现的 id 一律按未命中处理；未知 id 必须忽略。

/** 单次请求允许的最大条数。超出部分服务端逐条跳过，不整批失败。 */
export const MAX_ITEMS_PER_REQUEST = 200;

/** 单条原文允许的最大字符数。 */
export const MAX_TEXT_LENGTH = 5000;

/** 查缓存请求中的一条原文。 */
export interface LookupItem {
  /** 客户端生成的相关 id，服务端原样回显，仅用于回填。 */
  id: string;
  /** 待翻译原文。 */
  text: string;
  /** 源语言；缺省或空串表示自动检测。 */
  sourceLang?: string;
  /** 目标语言。 */
  targetLang: string;
}

/** 存缓存请求中的一条原文 + 译文。 */
export interface CommitItem extends LookupItem {
  translatedText: string;
}

/** 查缓存响应：只含命中项。 */
export interface LookupResponse {
  hits: Array<{ id: string; translatedText: string }>;
}

/** 存缓存响应：回显已接受写入的条数（坏条已跳过）。 */
export interface CommitResponse {
  accepted: number;
}

/** 健康检查响应。 */
export interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  /** 区分「节点活着但 Redis 挂了」——插件「测试连通」按钮需要这个区分。 */
  redis: 'ok' | 'down';
}

/** 服务统一的错误响应体。 */
export interface ErrorResponse {
  error: string;
}
