// 错误归一化 — 将底层异常 / HTTP 状态码映射为四类 errorType
import type { ErrorType } from '@/shared/types';

/**
 * 从 fetch 异常或 HTTP 状态码推断错误类型
 * @param err - catch 到的异常（fetch TypeError 等）
 * @param status - HTTP 响应状态码（有响应时传入）
 * @returns 四类互斥的 errorType
 */
export function classifyError(_err: unknown, status?: number): ErrorType {
  // 有明确 HTTP 状态码时按状态码分类
  if (status !== undefined) {
    if (status === 429) return 'rate-limit';
    if (status >= 400) return 'unreachable';
  }
  // fetch 网络层面异常（TypeError: Failed to fetch）→ network
  return 'network';
}

/** 错误反馈结构：主文案 + 引导次要行（供前端浮层差异化渲染） */
export interface ErrorFeedback {
  /** 主文案（不含 ❌ 前缀，由调用方添加） */
  main: string;
  /** 引导次要行（可操作性建议） */
  guidance: string;
}

/**
 * 根据 errorType 返回拆分的主文案与引导文案，供前端浮层差异化渲染。
 * 主文案与引导文案单一数据源，errorTypeMessage 内部委托本函数拼接。
 */
export function errorFeedback(errorType: ErrorType): ErrorFeedback {
  switch (errorType) {
    case 'no-config':
      return { main: '未配置可用翻译源', guidance: '请在配置页选择或添加源' };
    case 'network':
      return { main: '翻译请求失败', guidance: '请检查网络或源地址' };
    case 'rate-limit':
      return { main: '翻译源繁忙（限流）', guidance: '请稍后再试或在配置页切换源' };
    case 'unreachable':
      return { main: '翻译源不可达', guidance: '请在配置页切换到其它源' };
    default:
      return { main: '翻译失败', guidance: '' };
  }
}

/**
 * 根据 errorType 返回用户可读的提示文案（主文案 + 引导合并）
 * 内部委托 errorFeedback 拼接，保持返回值向后兼容。
 */
export function errorTypeMessage(errorType: ErrorType): string {
  const { main, guidance } = errorFeedback(errorType);
  return guidance ? `${main}，${guidance}` : main;
}
