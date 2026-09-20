// 单元测试：PortSession 接缝
// 验证 transport 级状态机（disconnected + terminal-once + postMessage 错误抑制 +
// disconnectOnce + onDisconnect → abort）在不同错误注入下都按预期触发。

import { describe, it, expect, vi } from 'vitest';
import { createPortSession, type PortLike } from './port-session';

interface FakePort extends PortLike {
  sent: unknown[];
  disconnectCalls: number;
  disconnectListeners: Array<() => void>;
  messageListeners: Array<(msg: unknown) => void>;
  postMessageImpl: ((msg: unknown) => void) | null;
  failPostMessageTimes: number;
}

function makePort(): FakePort {
  const port: FakePort = {
    sent: [],
    disconnectCalls: 0,
    disconnectListeners: [],
    messageListeners: [],
    postMessageImpl: null,
    failPostMessageTimes: 0,
    postMessage(msg) {
      if (port.failPostMessageTimes > 0) {
        port.failPostMessageTimes -= 1;
        throw new Error('postMessage failed');
      }
      port.sent.push(msg);
    },
    disconnect() {
      port.disconnectCalls += 1;
    },
    onDisconnect: {
      addListener(cb) {
        port.disconnectListeners.push(cb);
      },
    },
  };
  return port;
}

describe('createPortSession', () => {
  it('send delivers messages and reports success', () => {
    const port = makePort();
    const session = createPortSession(port);
    expect(session.send({ type: 'chunk', n: 1 })).toBe(true);
    expect(port.sent).toEqual([{ type: 'chunk', n: 1 }]);
  });

  it('send returns false after port disconnect', () => {
    const port = makePort();
    const session = createPortSession(port);
    port.disconnectListeners.forEach((cb) => cb());
    expect(session.isDisconnected()).toBe(true);
    expect(session.send({ type: 'chunk' })).toBe(false);
    expect(port.sent).toEqual([]);
  });

  it('send swallows postMessage errors and disconnects', () => {
    const port = makePort();
    const session = createPortSession(port);
    port.failPostMessageTimes = 1;
    expect(session.send({ type: 'chunk' })).toBe(false);
    expect(port.disconnectCalls).toBe(1);
  });

  it('terminal writes once then disconnects', () => {
    const port = makePort();
    const session = createPortSession(port);
    session.terminal({ type: 'done' });
    expect(port.sent).toEqual([{ type: 'done' }]);
    expect(port.disconnectCalls).toBe(1);
    // 二次 terminal 是 no-op
    session.terminal({ type: 'error' });
    expect(port.sent).toEqual([{ type: 'done' }]);
    expect(port.disconnectCalls).toBe(1);
  });

  it('terminal is no-op after peer disconnect', () => {
    const port = makePort();
    const session = createPortSession(port);
    port.disconnectListeners.forEach((cb) => cb());
    session.terminal({ type: 'done' });
    expect(port.sent).toEqual([]);
    expect(port.disconnectCalls).toBe(0);
  });

  it('signal aborts when peer disconnects', () => {
    const port = makePort();
    const session = createPortSession(port);
    const onAbort = vi.fn();
    session.signal.addEventListener('abort', onAbort);
    expect(session.signal.aborted).toBe(false);
    port.disconnectListeners.forEach((cb) => cb());
    expect(session.signal.aborted).toBe(true);
    expect(onAbort).toHaveBeenCalledOnce();
  });
});
