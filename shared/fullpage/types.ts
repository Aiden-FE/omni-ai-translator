// 全文翻译领域类型 — 分段收集与翻译池

/** 分段状态 */
export type SegmentStatus = 'pending' | 'translating' | 'done' | 'failed';

/** 分段记录 — 一段可翻译文本及其状态 */
export interface SegmentRecord {
  /** 唯一标识（基于 DOM 路径 + 文本哈希） */
  id: string;
  /** 所属元素 */
  el: HTMLElement;
  /** 直接子文本节点引用（渲染时把译文写入首个节点、其余置空，保留行内子元素结构） */
  textNodes: Text[];
  /** 原始文本（所有直接子文本节点的拼接，trim 后） */
  originalText: string;
  /** 译文（翻译成功后写入） */
  translatedText?: string;
  /** 当前状态 */
  status: SegmentStatus;
  /** 错误类型（仅 status=failed 时存在） */
  errorType?: string;
  /** 用于 t3 渲染器挂载双语译文块的 host 元素 */
  blockHost?: HTMLElement;
}

/** 分段收集选项 */
export interface SegmenterOptions {
  /** 是否跳过可见性检查（jsdom 环境下 getClientRects 恒空） */
  skipVisibilityCheck?: boolean;
}

/** 翻译池执行选项 */
export interface TranslatePoolOptions {
  /** 目标语言 */
  targetLang: string;
  /** 最大并发数，默认 3 */
  concurrency?: number;
  /** 会话级缓存 Map，key = `${targetLang}\u0000${originalText}` */
  cache: Map<string, string>;
  /** 每个分段 settle 时的回调 */
  onSettled: (seg: SegmentRecord) => void;
  /** 中止信号，isActive 返回 false 时停止派发新段 */
  signal?: AbortSignal;
  /** 活跃回调：返回 true 表示翻译仍在进行中 */
  isActive?: () => boolean;
}

/** 翻译池执行结果 */
export interface TranslatePoolResult {
  /** 成功翻译的分段 */
  succeeded: SegmentRecord[];
  /** 失败的分段 */
  failed: SegmentRecord[];
}
