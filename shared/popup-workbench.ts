// popup 文本翻译工作台状态机（#77 变体 A 骨架 + #79 流式输出与停止）
// 纯函数：原文输入准入判定（空 / 就绪 / 超限）+ 流式翻译生命周期迁移
// （就绪 → 流式 → 完成 / 停止 / 错误）。
// 不持久化任何内容；状态仅存在于 popup 生命周期内（文本翻译会话）。
import type { TranslateResult } from './types';

/** 原文最大字符数（按 Unicode 码点计数） */
export const WORKBENCH_MAX_LENGTH = 5000;

/** 原文输入阶段 */
export type WorkbenchInputPhase = 'empty' | 'ready' | 'overlimit';

/**
 * 译文输出阶段
 * - idle：未开始；streaming：流式进行中（原文区锁定、主按钮为停止）
 * - success：done 完成；stopped：用户停止或连接中断（保留部分译文，译文不持久化）
 * - error：翻译错误
 */
export type WorkbenchOutputPhase = 'idle' | 'streaming' | 'success' | 'stopped' | 'error';

export interface WorkbenchState {
  sourceText: string;
  inputPhase: WorkbenchInputPhase;
  outputPhase: WorkbenchOutputPhase;
  /** 流式期间为已累计的部分译文；stopped 后保留 */
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

/** 工作台操作（流式契约对应 port 消息 request / chunk / done / error + 用户停止） */
export type WorkbenchAction =
  | { type: 'edit-text'; text: string }
  | { type: 'stream-start' }
  | { type: 'stream-chunk'; deltaText: string }
  | { type: 'stream-done'; result: TranslateResult }
  | { type: 'stream-error'; message: string }
  | { type: 'stream-stop' };

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
      // 流式期间原文区锁定：编辑请求直接忽略
      if (state.outputPhase === 'streaming') return state;
      const { phase } = deriveWorkbenchInput(action.text);
      return {
        ...state,
        sourceText: action.text,
        inputPhase: phase,
      };
    }
    case 'stream-start': {
      if (state.inputPhase !== 'ready' || state.outputPhase === 'streaming') return state;
      return {
        ...state,
        outputPhase: 'streaming',
        translatedText: '',
        errorMessage: '',
      };
    }
    case 'stream-chunk': {
      if (state.outputPhase !== 'streaming') return state;
      return {
        ...state,
        translatedText: state.translatedText + action.deltaText,
      };
    }
    case 'stream-done': {
      if (state.outputPhase !== 'streaming') return state;
      return {
        ...state,
        outputPhase: 'success',
        // 以 done.result 为准；result 译文为空时保留已累计的部分译文
        translatedText: action.result.translatedText || state.translatedText,
        errorMessage: '',
      };
    }
    case 'stream-error': {
      if (state.outputPhase !== 'streaming') return state;
      return {
        ...state,
        outputPhase: 'error',
        translatedText: '',
        errorMessage: action.message,
      };
    }
    case 'stream-stop': {
      // 停止后已到达的部分译文保留，状态显示已停止；译文不持久化（仅内存态）
      if (state.outputPhase !== 'streaming') return state;
      return {
        ...state,
        outputPhase: 'stopped',
      };
    }
    default:
      return state;
  }
}
