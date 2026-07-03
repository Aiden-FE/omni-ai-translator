// 适配层接口定义 — 所有翻译源实现同一契约
import type { TranslateChunk, TranslateRequest, TranslateResult } from '@/shared/types';

/**
 * 统一翻译源接口
 * LLM 类源（openai-compatible / ollama）与传统翻译类源（google / microsoft）均实现此接口。
 * 上层（background）仅通过此接口调用翻译，不感知具体源类型。
 */
export interface TranslationProvider {
  /** 源唯一标识 */
  id: string;
  /** 源类型分类：llm / traditional */
  type: 'llm' | 'traditional';
  /** 执行翻译 */
  translate(req: TranslateRequest): Promise<TranslateResult>;
  /** 连通性测试（发送最小请求） */
  test(req?: TranslateRequest): Promise<TranslateResult>;
  /**
   * 流式翻译（可选实现）
   * LLM 源实现此方法，逐 chunk 经 onChunk 回调推送增量译文，返回最终 TranslateResult（含完整译文）。
   * 传统源不实现（undefined），适配层回退到 translate() 一次性返回。
   */
  translateStream?(req: TranslateRequest, onChunk: (chunk: TranslateChunk) => void): Promise<TranslateResult>;
}
