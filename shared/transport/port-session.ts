// PortSession — 把 `browser.runtime.Port` 长连接的状态机收敛到一处。
//
// 每次 `onConnect` 都会拿到一个独立 Port。两个 port 处理器（划词/popup translate-stream
// 与全文 fullpage-translate-batch-stream）过去各自维护同一套状态：
//   - disconnected flag + onDisconnect 监听
//   - terminalSent 终止单写守卫
//   - postMessage 错误抑制（peer 已消失时不抛 uncaught）
//   - disconnectOnce 幂等断开
//   - AbortController：port 断开时 abort，让下游翻译请求主动取消
//
// PortSession 拥有以上 transport 级状态。`send` 写普通消息、`terminal` 写终止消息（done/error）
// 一次后自动断开。调用方只关心协议（消息类型、payload 结构），不必再写状态机。
//
// 「每条 Port 只接受一个请求」属于应用层策略，仍由调用方在自己的闭包里维护。

export interface PortLike {
  postMessage(msg: unknown): void;
  disconnect(): void;
  onDisconnect: { addListener(cb: () => void): void };
}

export interface PortSession {
  /** 写入一条非终止消息；port 已断开则返回 false 并自动断开。 */
  send(msg: unknown): boolean;
  /** 写入一条终止消息（done/error），仅一次，然后断开；已断开或已终止时为 no-op。 */
  terminal(msg: unknown): void;
  /** 当前 port 是否已断开。 */
  isDisconnected(): boolean;
  /** 端口断开时 abort；用于取消下游翻译请求。 */
  readonly signal: AbortSignal;
}

export function createPortSession(port: PortLike): PortSession {
  let disconnected = false;
  let terminalSent = false;
  const controller = new AbortController();

  const disconnectOnce = (): void => {
    if (disconnected) return;
    disconnected = true;
    try {
      port.disconnect();
    } catch {
      // peer may have disappeared between state check and disconnect()
    }
  };

  port.onDisconnect.addListener(() => {
    disconnected = true;
    controller.abort();
  });

  const send = (msg: unknown): boolean => {
    if (disconnected) return false;
    try {
      port.postMessage(msg);
      return true;
    } catch {
      disconnectOnce();
      return false;
    }
  };

  const terminal = (msg: unknown): void => {
    if (disconnected || terminalSent) return;
    terminalSent = true;
    if (send(msg)) disconnectOnce();
  };

  return {
    signal: controller.signal,
    isDisconnected: () => disconnected,
    send,
    terminal,
  };
}
