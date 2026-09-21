// StreamPortSession — 把 translate-stream port 的客户端生命周期收敛到一处。
//
// 划词 content 与 popup workbench 过去各自实现同一套 port 状态机：
//   - 连接 + 注册 onMessage / onDisconnect 监听
//   - onMessage：chunk / done / error 分发，done/error 后主动断开
//   - 回调失效守卫（popup 用 streamPort 身份比对；content 用捕获的 DOM 引用）
//   - onDisconnect：未收到 done/error 时归为 SW 回收 / 后台重启异常
//
// 会话内部持有 active 标记：done/error/stop 之后所有回调自动 no-op，等价于
// 两处调用方各自的「终态后不再响应」守卫。调用方只注入渲染行为。

import type { StreamPortMessage, TranslateResult } from '@/shared/types';

/** 最小 Port 接口（browser.runtime.Port 收窄，便于测试注入 fake）。 */
export interface StreamPortLike {
  postMessage(msg: unknown): void;
  disconnect(): void;
  onMessage: { addListener(cb: (msg: unknown) => void): void };
  onDisconnect: { addListener(cb: () => void): void };
}

export interface StreamPortSessionHandlers {
  /** 流式增量。 */
  onChunk(deltaText: string): void;
  /** 终止：成功。 */
  onDone(result: TranslateResult): void;
  /** 终止：上游返回错误。 */
  onError(result: TranslateResult): void;
  /** port 断开但未收到 done/error（SW 回收 / 后台重启）。 */
  onAbnormalDisconnect(): void;
}

export interface StreamPortSession {
  /** 用户主动停止（流式「停止」/ 组件卸载）。之后所有回调为 no-op。 */
  stop(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStreamPortMessage(msg: unknown): msg is StreamPortMessage {
  return isRecord(msg) && typeof msg.type === 'string';
}

export function createStreamPortSession(
  port: StreamPortLike,
  request: Extract<StreamPortMessage, { type: 'request' }>,
  handlers: StreamPortSessionHandlers,
): StreamPortSession {
  let active = true;

  const closePort = (): void => {
    try {
      port.disconnect();
    } catch {
      // peer may have disappeared
    }
  };

  port.onMessage.addListener((msg: unknown) => {
    if (!active || !isStreamPortMessage(msg)) return;
    if (msg.type === 'chunk') {
      handlers.onChunk(msg.deltaText);
      return;
    }
    if (msg.type === 'done') {
      active = false;
      handlers.onDone(msg.result);
      closePort();
      return;
    }
    if (msg.type === 'error') {
      active = false;
      handlers.onError(msg.result);
      closePort();
    }
  });

  port.onDisconnect.addListener(() => {
    if (!active) return;
    active = false;
    handlers.onAbnormalDisconnect();
  });

  try {
    port.postMessage(request);
  } catch {
    // 建连即失败 → 交给 onDisconnect 兜底
  }

  return {
    stop(): void {
      if (!active) return;
      active = false;
      closePort();
    },
  };
}
