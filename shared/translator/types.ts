// 适配层接口定义 — 所有翻译源实现同一契约
import type { TranslateRequest, TranslateResult } from '@/shared/types';

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
}
