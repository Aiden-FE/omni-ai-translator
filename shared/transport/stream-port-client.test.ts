// 单元测试：StreamPortSession — translate-stream 客户端生命周期接缝
// 覆盖 chunk/done/error 分发、终态后回调失效、异常断开归因、用户停止。

import { describe, it, expect, vi } from 'vitest';
import { createStreamPortSession, type StreamPortLike } from './stream-port-client';

interface FakePort extends StreamPortLike {
  messageListeners: Array<(msg: unknown) => void>;
  disconnectListeners: Array<() => void>;
  sent: unknown[];
  disconnectCalls: number;
  failPostMessage: boolean;
}

function makePort(): FakePort {
  const port: FakePort = {
    messageListeners: [],
    disconnectListeners: [],
    sent: [],
    disconnectCalls: 0,
    failPostMessage: false,
    postMessage(msg) {
      if (port.failPostMessage) throw new Error('postMessage failed');
      port.sent.push(msg);
    },
    disconnect() {
      port.disconnectCalls += 1;
    },
    onMessage: {
      addListener(cb) {
        port.messageListeners.push(cb);
      },
    },
    onDisconnect: {
      addListener(cb) {
        port.disconnectListeners.push(cb);
      },
    },
  };
  return port;
}

function emitMessage(port: FakePort, msg: unknown): void {
  for (const cb of port.messageListeners) cb(msg);
}

function emitDisconnect(port: FakePort): void {
  for (const cb of port.disconnectListeners) cb();
}

function makeRequest() {
  return { type: 'request' as const, text: 'hello', targetLang: '中文' };
}

function makeHandlers() {
  return {
    onChunk: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
    onAbnormalDisconnect: vi.fn(),
  };
}

describe('createStreamPortSession', () => {
  it('sends the request on construction', () => {
    const port = makePort();
    createStreamPortSession(port, makeRequest(), makeHandlers());
    expect(port.sent).toEqual([makeRequest()]);
  });

  it('postMessage failure at construction is swallowed (onDisconnect handles it)', () => {
    const port = makePort();
    port.failPostMessage = true;
    expect(() =>
      createStreamPortSession(port, makeRequest(), makeHandlers()),
    ).not.toThrow();
  });

  it('routes chunk messages to onChunk', () => {
    const port = makePort();
    const handlers = makeHandlers();
    createStreamPortSession(port, makeRequest(), handlers);
    emitMessage(port, { type: 'chunk', deltaText: '你好' });
    emitMessage(port, { type: 'chunk', deltaText: '世界' });
    expect(handlers.onChunk).toHaveBeenCalledTimes(2);
    expect(handlers.onChunk).toHaveBeenNthCalledWith(1, '你好');
    expect(handlers.onChunk).toHaveBeenNthCalledWith(2, '世界');
  });

  it('done triggers onDone once and disconnects; further messages are no-ops', () => {
    const port = makePort();
    const handlers = makeHandlers();
    createStreamPortSession(port, makeRequest(), handlers);
    emitMessage(port, { type: 'done', result: { translatedText: '你好' } });
    expect(handlers.onDone).toHaveBeenCalledOnce();
    expect(port.disconnectCalls).toBe(1);

    emitMessage(port, { type: 'chunk', deltaText: 'late' });
    emitMessage(port, { type: 'error', result: { translatedText: '', error: 'x' } });
    expect(handlers.onChunk).not.toHaveBeenCalled();
    expect(handlers.onError).not.toHaveBeenCalled();
    expect(port.disconnectCalls).toBe(1);
  });

  it('error triggers onError once and disconnects', () => {
    const port = makePort();
    const handlers = makeHandlers();
    createStreamPortSession(port, makeRequest(), handlers);
    emitMessage(port, { type: 'error', result: { translatedText: '', error: 'boom' } });
    expect(handlers.onError).toHaveBeenCalledOnce();
    expect(port.disconnectCalls).toBe(1);
  });

  it('disconnect without terminal routes to onAbnormalDisconnect', () => {
    const port = makePort();
    const handlers = makeHandlers();
    createStreamPortSession(port, makeRequest(), handlers);
    emitDisconnect(port);
    expect(handlers.onAbnormalDisconnect).toHaveBeenCalledOnce();
    expect(handlers.onDone).not.toHaveBeenCalled();
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it('disconnect after done does not trigger onAbnormalDisconnect', () => {
    const port = makePort();
    const handlers = makeHandlers();
    createStreamPortSession(port, makeRequest(), handlers);
    emitMessage(port, { type: 'done', result: { translatedText: 'ok' } });
    emitDisconnect(port);
    expect(handlers.onAbnormalDisconnect).not.toHaveBeenCalled();
  });

  it('stop() disconnects once and silences all further callbacks', () => {
    const port = makePort();
    const handlers = makeHandlers();
    const session = createStreamPortSession(port, makeRequest(), handlers);
    session.stop();
    expect(port.disconnectCalls).toBe(1);

    emitMessage(port, { type: 'chunk', deltaText: 'late' });
    emitMessage(port, { type: 'done', result: { translatedText: 'late-done' } });
    emitDisconnect(port);
    expect(handlers.onChunk).not.toHaveBeenCalled();
    expect(handlers.onDone).not.toHaveBeenCalled();
    expect(handlers.onAbnormalDisconnect).not.toHaveBeenCalled();
    expect(port.disconnectCalls).toBe(1);
  });

  it('non-object messages are ignored', () => {
    const port = makePort();
    const handlers = makeHandlers();
    createStreamPortSession(port, makeRequest(), handlers);
    emitMessage(port, null);
    emitMessage(port, 42);
    emitMessage(port, 'chunk');
    expect(handlers.onChunk).not.toHaveBeenCalled();
    expect(handlers.onAbnormalDisconnect).not.toHaveBeenCalled();
  });
});
