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

/**
 * 根据 errorType 返回用户可读的提示文案
 */
export function errorTypeMessage(errorType: ErrorType): string {
  switch (errorType) {
    case 'no-config':
      return '未配置可用翻译源，请在配置页选择或添加源';
    case 'network':
      return '翻译请求失败，请检查网络或源地址';
    case 'rate-limit':
      return '翻译源繁忙（限流），请稍后再试或在配置页切换源';
    case 'unreachable':
      return '翻译源不可达，请在配置页切换到其它源';
    default:
      return '翻译失败';
  }
}
