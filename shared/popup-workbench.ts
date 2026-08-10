// popup 文本翻译工作台状态机（#77 变体 A）
// 纯函数：原文输入准入判定（空 / 就绪 / 超限）+ 翻译生命周期迁移。
// 不持久化任何内容；状态仅存在于 popup 生命周期内（文本翻译会话）。
import type { TranslateResult } from './types';

/** 原文最大字符数（按 Unicode 码点计数） */
export const WORKBENCH_MAX_LENGTH = 5000;

/** 原文输入阶段 */
export type WorkbenchInputPhase = 'empty' | 'ready' | 'overlimit';

/** 译文输出阶段 */
export type WorkbenchOutputPhase = 'idle' | 'translating' | 'success' | 'error';

export interface WorkbenchState {
  sourceText: string;
  inputPhase: WorkbenchInputPhase;
  outputPhase: WorkbenchOutputPhase;
  translatedText: string;
  errorMessage: string;
}

/** 输入准入判定结果 */
export interface WorkbenchInputEligibility {
  phase: WorkbenchInputPhase;
  /** 码点字符数，展示为 N / 5000 */
  charCount: number;
  canTranslate: boolean;
}

/** 工作台操作 */
export type WorkbenchAction =
  | { type: 'edit-text'; text: string }
  | { type: 'translate-start' }
  | { type: 'translate-success'; result: TranslateResult }
  | { type: 'translate-error'; message: string };

/** 码点计数（与 Array.from / spread 一致，emoji 等代理对计为 1 个字符） */
export function countWorkbenchCharacters(text: string): number {
  return [...text].length;
}

/** 原文输入准入判定：空白 → empty；超过上限 → overlimit；其余 → ready */
export function deriveWorkbenchInput(text: string): WorkbenchInputEligibility {
  const charCount = countWorkbenchCharacters(text);
  const phase: WorkbenchInputPhase =
    text.trim().length === 0 ? 'empty'
    : charCount > WORKBENCH_MAX_LENGTH ? 'overlimit'
    : 'ready';
  return { phase, charCount, canTranslate: phase === 'ready' };
}

/** 初始状态：空原文、idle 译文 */
export function createWorkbenchState(): WorkbenchState {
  return {
    sourceText: '',
    inputPhase: 'empty',
    outputPhase: 'idle',
    translatedText: '',
    errorMessage: '',
  };
}

/** 状态机迁移（非法迁移返回原 state 引用，视图按派生值渲染即可） */
export function reduceWorkbench(state: WorkbenchState, action: WorkbenchAction): WorkbenchState {
  switch (action.type) {
    case 'edit-text': {
      const { phase } = deriveWorkbenchInput(action.text);
      return {
        ...state,
        sourceText: action.text,
        inputPhase: phase,
      };
    }
    case 'translate-start': {
      if (state.inputPhase !== 'ready') return state;
      return {
        ...state,
        outputPhase: 'translating',
        translatedText: '',
        errorMessage: '',
      };
    }
    case 'translate-success': {
      if (state.outputPhase !== 'translating') return state;
      return {
        ...state,
        outputPhase: 'success',
        translatedText: action.result.translatedText,
        errorMessage: '',
      };
    }
    case 'translate-error': {
      if (state.outputPhase !== 'translating') return state;
      return {
        ...state,
        outputPhase: 'error',
        errorMessage: action.message,
      };
    }
    default:
      return state;
  }
}
