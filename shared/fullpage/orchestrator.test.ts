// @vitest-environment jsdom
// 编排器单元测试 - 全文翻译状态机（start / 工具栏回调 / 增量翻译 / 类型守卫）
//
// 编排器是唯一状态持有者；segmenter/pool/renderer/toolbar 均无全局状态。
// 测试通过 __reset() 在每个用例前重置模块级状态，经 __getState() 断言内部状态。
// Mock 策略：vi.stubGlobal('browser') 同时覆盖 runtime.sendMessage（翻译池通道）
// 与 storage.local.get（getTargetLang 读取用户配置的目标语言）。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { BatchStreamPortMessage } from '@/shared/types';
import { start, isBackgroundCommand, __reset, __getState } from './orchestrator';

/** 翻译通道响应（与 background translate 返回体一致） */
interface TranslateResponse {
  translatedText?: string;
  error?: string;
  errorType?: string;
}

type TranslateImpl = (text: string) => TranslateResponse | Promise<TranslateResponse>;

const defaultTranslate: TranslateImpl = (text) => ({ translatedText: `[译] ${text}` });

/** 工具栏宿主选择器：排除双语块、加载标记与失败标记宿主 */
const TOOLBAR_HOST_SELECTOR =
  '[data-llm-translator]:not(.llm-translator-block-host):not(.llm-translator-loading-host):not(.llm-translator-failed-host)';

/** Mock browser 全局：runtime.sendMessage（翻译池）+ storage.local.get（目标语言设置） */
function setupBrowser(translateImpl: TranslateImpl = defaultTranslate) {
  const translateMessage = vi.fn();
  const sendMessage = vi.fn(
    async (msg: { type: string; payload?: { text: string; targetLang: string } }) => {
      if (msg.type === 'get-translation-capabilities') {
        return { batchStream: false };
      }
      if (msg.type === 'translate' && msg.payload) {
        translateMessage(msg);
        return translateImpl(msg.payload.text);
      }
      return {};
    },
  );
  const connect = vi.fn();
  vi.stubGlobal('browser', {
    runtime: { sendMessage, connect },
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({
          [key]: { activeProviderId: null, defaultTargetLang: '简体中文' },
        })),
      },
    },
  });
  return { sendMessage: translateMessage, runtimeSendMessage: sendMessage, connect };
}

class FakeBatchPort {
  readonly onMessage = {
    addListener: (listener: (message: BatchStreamPortMessage) => void) => {
      this.messageListeners.push(listener);
    },
  };
  readonly onDisconnect = {
    addListener: (listener: () => void) => {
      this.disconnectListeners.push(listener);
    },
  };
  readonly postMessage = vi.fn((message: BatchStreamPortMessage) => {
    if (message.type !== 'request') return;
    this.request = message;
    if (this.autoRespond) {
      queueMicrotask(() => {
        for (const chunk of message.chunks) {
          this.emit({
            type: 'chunk',
            requestId: message.requestId,
            chunk: {
              chunkId: chunk.chunkId,
              translatedParts: chunk.parts.map((part) => ({
                partId: part.partId,
                sliceIndex: part.sliceIndex,
                text: `[批] ${part.text}`,
              })),
            },
          });
        }
        this.emit({ type: 'done', requestId: message.requestId, missingChunkIds: [] });
      });
    }
  });
  readonly disconnect = vi.fn(() => {
    if (this.disconnected) return;
    this.disconnected = true;
    this.onClosed();
    for (const listener of [...this.disconnectListeners]) listener();
  });
  request?: Extract<BatchStreamPortMessage, { type: 'request' }>;
  private readonly messageListeners: Array<(message: BatchStreamPortMessage) => void> = [];
  private readonly disconnectListeners: Array<() => void> = [];
  private disconnected = false;

  constructor(
    private readonly autoRespond: boolean,
    private readonly onClosed: () => void,
  ) {}

  emit(message: BatchStreamPortMessage): void {
    for (const listener of [...this.messageListeners]) listener(message);
  }

  complete(): void {
    const request = this.request;
    if (!request) throw new Error('Batch request not posted');
    for (const chunk of request.chunks) {
      this.emit({
        type: 'chunk',
        requestId: request.requestId,
        chunk: {
          chunkId: chunk.chunkId,
          translatedParts: chunk.parts.map((part) => ({
            partId: part.partId,
            sliceIndex: part.sliceIndex,
            text: `[批] ${part.text}`,
          })),
        },
      });
    }
    this.emit({ type: 'done', requestId: request.requestId, missingChunkIds: [] });
  }
}

function setupBatchBrowser(autoRespond = true) {
  const translateMessage = vi.fn();
  const sendMessage = vi.fn(async (msg: { type: string; payload?: { text: string } }) => {
    if (msg.type === 'get-translation-capabilities') return { batchStream: true };
    if (msg.type === 'translate' && msg.payload) {
      translateMessage(msg);
      return defaultTranslate(msg.payload.text);
    }
    return {};
  });
  const ports: FakeBatchPort[] = [];
  let activePorts = 0;
  let maxActivePorts = 0;
  const connect = vi.fn(() => {
    activePorts += 1;
    maxActivePorts = Math.max(maxActivePorts, activePorts);
    const port = new FakeBatchPort(autoRespond, () => {
      activePorts -= 1;
    });
    ports.push(port);
    return port;
  });
  vi.stubGlobal('browser', {
    runtime: { sendMessage, connect },
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({
          [key]: { activeProviderId: 'llm-source', defaultTargetLang: '简体中文' },
        })),
      },
    },
  });
  return {
    sendMessage: translateMessage,
    runtimeSendMessage: sendMessage,
    connect,
    ports,
    activePortCount: () => activePorts,
    maxActivePortCount: () => maxActivePorts,
  };
}

/** 排空微任务队列：让纯 Promise 链（getTargetLang / runPool / sendMessage mock）完整推进 */
async function drainMicrotasks(rounds = 30): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

/**
 * 增量翻译 flush：
 * 1. 排空微任务让 MutationObserver 投递（jsdom 经 Promise 微任务派发记录）
 * 2. 推进 200ms 防抖计时器触发 flush
 * 3. 兜底排空 flush 内部异步链（collectSegments → runPool → 渲染）
 */
async function flushObserver(): Promise<void> {
  await drainMicrotasks();
  await vi.advanceTimersByTimeAsync(250);
  await drainMicrotasks();
}

function getToolbarHost(): HTMLElement {
  const host = document.querySelector(TOOLBAR_HOST_SELECTOR);
  expect(host).not.toBeNull();
  return host as HTMLElement;
}

function getToolbarShadow(): ShadowRoot {
  return getToolbarHost().shadowRoot!;
}

function toolbarText(): string {
  return getToolbarShadow().querySelector('.llm-translator-toolbar-progress')?.textContent ?? '';
}

function clickToolbarButtonByText(text: string): void {
  const btn = Array.from(getToolbarShadow().querySelectorAll('button')).find(
    (b) => b.textContent === text,
  );
  expect(btn).toBeDefined();
  (btn as HTMLButtonElement).click();
}

function getSwitchButton(): HTMLButtonElement {
  return getToolbarShadow().querySelector('.llm-translator-toolbar-switch') as HTMLButtonElement;
}

function getRetryButton(): HTMLButtonElement {
  return getToolbarShadow().querySelector('.llm-translator-toolbar-retry') as HTMLButtonElement;
}

/**
 * 视口布局 mock：根据可见文本集合决定每个段元素的几何位置。
 * - 在 visibleTexts 中的段 → 视为视口内（top=0..100, bottom=100）
 * - 否则 → 视为视口外（top=2000, bottom=2100）
 *
 * 重要：仅 mock `getBoundingClientRect`，不动 `getClientRects`（避免影响
 * renderer.ts / segmenter.ts 的可见性剪枝；display:none 剪枝测试需真实 getClientRects）。
 * 调用方仍需在每个段元素上用 `Object.defineProperty(seg.el, 'getClientRects', ...)`
 * 返回非空数组，使 isSegmentInViewport 跳过 jsdom 兑底。
 */
function mockViewportLayout(visibleTexts: Set<string>): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const text = this.textContent ?? '';
    const visible = [...visibleTexts].some((t) => text.includes(t));
    return visible
      ? { top: 0, bottom: 100, left: 0, right: 100, width: 100, height: 100, x: 0, y: 0, toJSON() {} } as DOMRect
      : { top: 2000, bottom: 2100, left: 0, right: 100, width: 100, height: 100, x: 0, y: 2000, toJSON() {} } as DOMRect;
  });
}

/**
 * 为收集到的段元素覆写 getClientRects 返回非空数组。
 * jsdom 默认 getClientRects() 长度为 0，会让 isSegmentInViewport 走兜底视为视口内；
 * 设置非空后才会走几何判定路径。
 */
function setClientRectsNonEmpty(els: Iterable<HTMLElement>): void {
  for (const el of els) {
    Object.defineProperty(el, 'getClientRects', {
      value: () => [{} as DOMRect],
      configurable: true,
    });
  }
}

/**
 * 安装可控的 mock IntersectionObserver，返回一个 trigger 函数用于测试中
 * 模拟“进入视口”回调。记录每个 observe 回调 + 每个 IO 实例以便断言。
 */
function installMockIO(): {
  trigger: (targets: Element[]) => void;
  instances: Array<{
    observed: Set<Element>;
    disconnect: () => void;
  }>;
} {
  const observedCallbacks: Array<(entries: Array<{ isIntersecting: boolean; target: Element }>) => void> = [];
  const instances: Array<{
    observed: Set<Element>;
    disconnect: () => void;
  }> = [];

  class MockIO {
    cb: (entries: Array<{ isIntersecting: boolean; target: Element }>) => void;
    observed: Set<Element> = new Set();
    disconnected = false;
    constructor(
      cb: (entries: Array<{ isIntersecting: boolean; target: Element }>) => void,
    ) {
      this.cb = cb;
      observedCallbacks.push(cb);
      instances.push({
        observed: this.observed,
        disconnect: () => {
          this.disconnected = true;
          this.observed.clear();
        },
      });
    }
    observe(el: Element) {
      this.observed.add(el);
    }
    unobserve(el: Element) {
      this.observed.delete(el);
    }
    disconnect() {
      this.disconnected = true;
      this.observed.clear();
    }
  }
  vi.stubGlobal('IntersectionObserver', MockIO);
  return {
    trigger: (targets: Element[]) => {
      for (const cb of observedCallbacks) {
        cb(targets.map((t) => ({ isIntersecting: true, target: t })));
      }
    },
    instances,
  };
}

beforeEach(() => {
  __reset();
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('isBackgroundCommand - 类型守卫', () => {
  it('合法命令 → true', () => {
    expect(isBackgroundCommand({ type: 'fullpage-translate', mode: 'replace' })).toBe(true);
    expect(isBackgroundCommand({ type: 'fullpage-translate', mode: 'bilingual' })).toBe(true);
  });

  it('非法消息 → false', () => {
    expect(isBackgroundCommand(null)).toBe(false);
    expect(isBackgroundCommand(undefined)).toBe(false);
    expect(isBackgroundCommand('fullpage-translate')).toBe(false);
    expect(isBackgroundCommand(42)).toBe(false);
    expect(isBackgroundCommand({})).toBe(false);
    // 划词翻译消息（content → background 方向）不应误判
    expect(isBackgroundCommand({ type: 'translate', payload: { text: 'x', targetLang: 'y' } })).toBe(false);
    // 缺 mode / mode 非法
    expect(isBackgroundCommand({ type: 'fullpage-translate' })).toBe(false);
    expect(isBackgroundCommand({ type: 'fullpage-translate', mode: 'invalid' })).toBe(false);
    expect(isBackgroundCommand({ type: 'fullpage-translate', mode: 123 })).toBe(false);
  });
});

describe('start - 基本流程', () => {
  it('start(replace)：收集分段、挂载工具栏、逐段翻译并替换渲染', async () => {
    document.body.innerHTML = '<p>Hello world</p><p>Second paragraph</p>';
    const { sendMessage } = setupBrowser();

    await start('replace');

    const state = __getState();
    expect(state.active).toBe(true);
    expect(state.mode).toBe('replace');
    expect(state.targetLang).toBe('简体中文');
    expect(state.records).toHaveLength(2);
    expect(state.records.every((r) => r.status === 'done')).toBe(true);

    // 替换模式：译文写入文本节点
    const ps = document.querySelectorAll('p');
    expect(ps[0].textContent).toBe('[译] Hello world');
    expect(ps[1].textContent).toBe('[译] Second paragraph');

    // 工具栏已挂载
    expect(getToolbarHost()).toBeInstanceOf(HTMLElement);

    // 翻译通道调用与缓存写入
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'translate',
      payload: { text: 'Hello world', targetLang: '简体中文' },
    });
    expect(state.cache.size).toBe(2);
  });

  it('start(bilingual)：译文以双语块渲染，原文保留', async () => {
    document.body.innerHTML = '<p>Hello world</p>';
    setupBrowser();

    await start('bilingual');

    expect(__getState().mode).toBe('bilingual');
    const p = document.querySelector('p')!;
    expect(p.textContent).toBe('Hello world');
    const blockHost = document.querySelector('.llm-translator-block-host') as HTMLElement;
    expect(blockHost).not.toBeNull();
    const content = blockHost.shadowRoot!.querySelector('.llm-translator-block-content');
    expect(content).not.toBeNull();
    expect(content!.textContent).toBe('[译] Hello world');
  });

  it('无可翻译段的页面：不调用 API，工具栏仍挂载', async () => {
    document.body.innerHTML = '<div><span></span></div>';
    const { sendMessage } = setupBrowser();

    await start('replace');

    expect(__getState().records).toHaveLength(0);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(getToolbarHost()).toBeInstanceOf(HTMLElement);
    expect(toolbarText()).toContain('未发现可翻译文本');
  });

  it('空页面重复触发：不产生重复工具栏', async () => {
    document.body.innerHTML = '<div><span></span></div>';
    setupBrowser();

    await start('replace');
    await start('bilingual');

    expect(document.querySelectorAll(TOOLBAR_HOST_SELECTOR)).toHaveLength(1);
  });

  it('并发触发 start：第二次等待首次完成后走复用路径（不重复翻译/建栏）', async () => {
    document.body.innerHTML = '<p>concurrent text</p>';
    let resolveGate!: (v: TranslateResponse) => void;
    const gate = new Promise<TranslateResponse>((r) => {
      resolveGate = r;
    });
    const { sendMessage } = setupBrowser(() => gate);

    const p1 = start('replace');
    const p2 = start('bilingual');
    await drainMicrotasks();

    resolveGate({ translatedText: '[译] concurrent text' });
    await Promise.all([p1, p2]);

    // 只翻译一次、只建一个工具栏；第二次触发最终落实为模式切换
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll(TOOLBAR_HOST_SELECTOR)).toHaveLength(1);
    expect(__getState().mode).toBe('bilingual');
    expect(document.querySelector('.llm-translator-block-host')).not.toBeNull();
  });
});

describe('loading 标记与聚合进度', () => {
  it('初始队列立即显示全部 loading，逐段完成时更新进度并清除对应标记', async () => {
    document.body.innerHTML = '<p>first text</p><p>second text</p>';
    let resolveFirst!: (value: TranslateResponse) => void;
    let resolveSecond!: (value: TranslateResponse) => void;
    const firstGate = new Promise<TranslateResponse>((resolve) => {
      resolveFirst = resolve;
    });
    const secondGate = new Promise<TranslateResponse>((resolve) => {
      resolveSecond = resolve;
    });
    setupBrowser((text) => (text === 'first text' ? firstGate : secondGate));

    const startPromise = start('replace');
    await drainMicrotasks();

    expect(document.querySelectorAll('.llm-translator-loading-host')).toHaveLength(2);
    expect(toolbarText()).toContain('全文翻译 0/2');

    resolveFirst({ translatedText: '第一段' });
    await drainMicrotasks();

    expect(document.querySelectorAll('.llm-translator-loading-host')).toHaveLength(1);
    expect(toolbarText()).toContain('全文翻译 1/2');

    resolveSecond({ translatedText: '第二段' });
    await startPromise;

    expect(document.querySelectorAll('.llm-translator-loading-host')).toHaveLength(0);
    expect(toolbarText()).toContain('全文翻译完成 2/2');
  });

  it('部分失败也计入完成进度并呈现失败终态', async () => {
    document.body.innerHTML = '<p>good text</p><p>bad text</p>';
    setupBrowser((text) =>
      text === 'bad text'
        ? { error: 'boom', errorType: 'network' }
        : { translatedText: '成功译文' },
    );

    await start('replace');

    expect(document.querySelectorAll('.llm-translator-loading-host')).toHaveLength(0);
    expect(toolbarText()).toContain('已完成 2/2，失败 1');
  });
});

describe('start - 复用路径（验收标准 10）', () => {
  it('active 且 records 非空时再次触发 → 仅切换模式复用缓存（零 API）', async () => {
    document.body.innerHTML = '<p>Hello world</p>';
    const { sendMessage } = setupBrowser();
    await start('replace');
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const hostBefore = getToolbarHost();

    await start('bilingual');

    // 无新 API 调用、工具栏未重建、模式已切换为双语
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(getToolbarHost()).toBe(hostBefore);
    expect(__getState().mode).toBe('bilingual');
    expect(document.querySelector('.llm-translator-block-host')).not.toBeNull();
    // 原文恢复显示，译文走双语块
    expect(document.querySelector('p')!.textContent).toBe('Hello world');
  });

  it('恢复原文后再次触发 → cache 命中段秒级渲染（零 API）', async () => {
    document.body.innerHTML = '<p>Hello world</p>';
    const { sendMessage } = setupBrowser();
    await start('replace');
    clickToolbarButtonByText('恢复原文');
    expect(__getState().active).toBe(false);
    expect(__getState().cache.size).toBe(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);

    await start('replace');

    // cache 命中：无 API 调用，译文即时渲染
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(__getState().active).toBe(true);
    expect(document.querySelector('p')!.textContent).toBe('[译] Hello world');
  });
});

describe('工具栏回调', () => {
  it('onSwitchMode：翻转 mode + renderer.switchMode（零 API）', async () => {
    document.body.innerHTML = '<p>Hello world</p>';
    const { sendMessage } = setupBrowser();
    await start('replace');
    const switchBtn = getSwitchButton();

    switchBtn.click();
    expect(__getState().mode).toBe('bilingual');
    expect(document.querySelector('.llm-translator-block-host')).not.toBeNull();
    expect(document.querySelector('p')!.textContent).toBe('Hello world');

    switchBtn.click();
    expect(__getState().mode).toBe('replace');
    expect(document.querySelector('.llm-translator-block-host')).toBeNull();
    expect(document.querySelector('p')!.textContent).toBe('[译] Hello world');

    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('onRestore：恢复原文、销毁工具栏、active=false、保留 cache', async () => {
    document.body.innerHTML = '<p>Hello world</p>';
    setupBrowser();
    await start('replace');
    expect(document.querySelector('p')!.textContent).toBe('[译] Hello world');

    clickToolbarButtonByText('恢复原文');

    const state = __getState();
    expect(state.active).toBe(false);
    expect(document.querySelector('p')!.textContent).toBe('Hello world');
    // 工具栏销毁，页面无注入残留
    expect(document.querySelector('[data-llm-translator]')).toBeNull();
    // cache 保留（再次触发复用）
    expect(state.cache.size).toBe(1);
  });

  it('onRetry：失败段立即重新显示 loading，成功后渲染并更新进度', async () => {
    document.body.innerHTML = '<p>good text</p><p>bad text</p>';
    let failBad = true;
    let resolveRetry!: (value: TranslateResponse) => void;
    const retryGate = new Promise<TranslateResponse>((resolve) => {
      resolveRetry = resolve;
    });
    const { sendMessage } = setupBrowser((text) => {
      if (text === 'bad text' && failBad) {
        return { error: 'boom', errorType: 'network' };
      }
      if (text === 'bad text') {
        return retryGate;
      }
      return { translatedText: `[译] ${text}` };
    });
    await start('replace');

    // 失败段标记 + 重试按钮显示（计数 1）
    expect(document.querySelector('.llm-translator-failed-host')).not.toBeNull();
    const retryBtn = getRetryButton();
    expect(retryBtn.hidden).toBe(false);
    expect(retryBtn.textContent).toContain('1');

    failBad = false;
    retryBtn.click();
    await drainMicrotasks();

    expect(document.querySelectorAll('.llm-translator-loading-host')).toHaveLength(1);
    expect(toolbarText()).toContain('全文翻译 1/2');

    resolveRetry({ translatedText: '[译] bad text' });
    await drainMicrotasks();

    // 失败标记清除、重试按钮隐藏、译文渲染
    expect(document.querySelector('.llm-translator-failed-host')).toBeNull();
    expect(document.querySelector('.llm-translator-loading-host')).toBeNull();
    expect(retryBtn.hidden).toBe(true);
    expect(toolbarText()).toContain('全文翻译完成 2/2');
    const ps = document.querySelectorAll('p');
    expect(ps[0].textContent).toBe('[译] good text');
    expect(ps[1].textContent).toBe('[译] bad text');
    // 初始 2 次 + 重试 1 次
    expect(sendMessage).toHaveBeenCalledTimes(3);
  });

  it('超过并发数的重试在 restore 后不再派发排队请求', async () => {
    document.body.innerHTML = Array.from(
      { length: 5 },
      (_, index) => `<p>failed text ${index}</p>`,
    ).join('');
    let retrying = false;
    const retryResolvers: Array<(value: TranslateResponse) => void> = [];
    const { sendMessage } = setupBrowser((text) => {
      if (!retrying) return { error: 'initial failure', errorType: 'network' };
      if (retryResolvers.length < 3) {
        return new Promise<TranslateResponse>((resolve) => {
          retryResolvers.push(resolve);
        });
      }
      return { translatedText: `[重试] ${text}` };
    });
    await start('replace');
    expect(sendMessage).toHaveBeenCalledTimes(5);

    retrying = true;
    getRetryButton().click();
    await drainMicrotasks();
    expect(sendMessage).toHaveBeenCalledTimes(8);

    clickToolbarButtonByText('恢复原文');
    for (const resolve of retryResolvers) {
      resolve({ translatedText: '已完成的在途重试' });
    }
    await drainMicrotasks();

    expect(sendMessage).toHaveBeenCalledTimes(8);
  });
});

describe('onSettled 守卫', () => {
  it('翻译返回前恢复原文 → 已返回段不再渲染（防译文闪回）', async () => {
    document.body.innerHTML = '<p>slow text</p>';
    let resolveGate!: (v: TranslateResponse) => void;
    const gate = new Promise<TranslateResponse>((r) => {
      resolveGate = r;
    });
    setupBrowser(() => gate);

    const startPromise = start('replace');
    await drainMicrotasks();

    expect(document.querySelectorAll('.llm-translator-loading-host')).toHaveLength(1);
    expect(toolbarText()).toContain('全文翻译 0/1');

    // 翻译在途时恢复原文
    clickToolbarButtonByText('恢复原文');
    expect(__getState().active).toBe(false);
    expect(document.querySelectorAll('[data-llm-translator]')).toHaveLength(0);

    resolveGate({ translatedText: '[译] slow text' });
    await startPromise;

    // 段状态仍推进为 done（缓存已写入），但 DOM 不渲染译文
    expect(__getState().records[0].status).toBe('done');
    expect(document.querySelector('p')!.textContent).toBe('slow text');
    expect(document.querySelectorAll('[data-llm-translator]')).toHaveLength(0);
  });

  it('翻译返回时元素已被宿主移除 → 丢弃不渲染', async () => {
    document.body.innerHTML = '<p>removable text</p>';
    let resolveGate!: (v: TranslateResponse) => void;
    const gate = new Promise<TranslateResponse>((r) => {
      resolveGate = r;
    });
    setupBrowser(() => gate);

    const startPromise = start('replace');
    await drainMicrotasks();

    const p = document.querySelector('p')!;
    p.remove();
    resolveGate({ translatedText: '[译] removable text' });
    await startPromise;

    expect(__getState().records[0].status).toBe('done');
    expect(p.isConnected).toBe(false);
    expect(p.textContent).toBe('removable text');
  });

  it('retry → restore → restart 后旧 retry 返回不按新 mode 渲染 orphan host', async () => {
    document.body.innerHTML = '<p>retry text</p>';
    let requestCount = 0;
    let resolveOldRetry!: (value: TranslateResponse) => void;
    let resolveRestart!: (value: TranslateResponse) => void;
    const oldRetryGate = new Promise<TranslateResponse>((resolve) => {
      resolveOldRetry = resolve;
    });
    const restartGate = new Promise<TranslateResponse>((resolve) => {
      resolveRestart = resolve;
    });
    const { sendMessage } = setupBrowser(() => {
      requestCount++;
      if (requestCount === 1) return { error: 'initial failure', errorType: 'network' };
      if (requestCount === 2) return oldRetryGate;
      return restartGate;
    });

    await start('replace');
    const oldRecord = __getState().records[0];
    getRetryButton().click();
    await drainMicrotasks();

    clickToolbarButtonByText('恢复原文');
    const restartPromise = start('bilingual');
    await drainMicrotasks();
    expect(sendMessage).toHaveBeenCalledTimes(3);
    expect(__getState().records[0]).not.toBe(oldRecord);

    resolveOldRetry({ translatedText: '旧重试译文' });
    await drainMicrotasks();

    expect(document.querySelector('.llm-translator-block-host')).toBeNull();
    expect(document.querySelector('p')?.textContent).toBe('retry text');
    expect(document.querySelectorAll('.llm-translator-loading-host')).toHaveLength(1);

    resolveRestart({ translatedText: '新会话译文' });
    await restartPromise;
    const blocks = document.querySelectorAll('.llm-translator-block-host');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].shadowRoot?.textContent).toContain('新会话译文');
  });
});

describe('增量翻译（MutationObserver + 200ms 防抖）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('空页面显示空状态且不启动 observer', async () => {
    document.body.innerHTML = '<div><span></span></div>';
    const { sendMessage } = setupBrowser();
    await start('replace');
    expect(toolbarText()).toContain('未发现可翻译文本');

    const p = document.createElement('p');
    p.textContent = 'added after empty session';
    document.body.appendChild(p);
    await flushObserver();

    expect(sendMessage).not.toHaveBeenCalled();
    expect(__getState().records).toHaveLength(0);
    expect(p.textContent).toBe('added after empty session');
  });

  it('新增节点 → 收集 → 翻译 → 按当前模式渲染（验收标准 9）', async () => {
    document.body.innerHTML = '<p>initial text</p>';
    const { sendMessage } = setupBrowser();
    await start('replace');
    expect(sendMessage).toHaveBeenCalledTimes(1);

    const p = document.createElement('p');
    p.textContent = 'dynamic text';
    document.body.appendChild(p);
    await flushObserver();

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenLastCalledWith({
      type: 'translate',
      payload: { text: 'dynamic text', targetLang: '简体中文' },
    });
    expect(p.textContent).toBe('[译] dynamic text');
    expect(__getState().records).toHaveLength(2);
  });

  it('新增节点入队后立即显示 loading，并把动态段计入总进度', async () => {
    document.body.innerHTML = '<p>initial text</p>';
    let resolveDynamic!: (value: TranslateResponse) => void;
    const dynamicGate = new Promise<TranslateResponse>((resolve) => {
      resolveDynamic = resolve;
    });
    setupBrowser((text) =>
      text === 'dynamic text' ? dynamicGate : { translatedText: '[译] initial text' },
    );
    await start('replace');

    const p = document.createElement('p');
    p.textContent = 'dynamic text';
    document.body.appendChild(p);
    await flushObserver();

    expect(document.querySelectorAll('.llm-translator-loading-host')).toHaveLength(1);
    expect(toolbarText()).toContain('全文翻译 1/2');

    resolveDynamic({ translatedText: '[译] dynamic text' });
    await drainMicrotasks();

    expect(document.querySelectorAll('.llm-translator-loading-host')).toHaveLength(0);
    expect(toolbarText()).toContain('全文翻译完成 2/2');
  });

  it('双语模式下新增节点 → 渲染双语块、原文保留', async () => {
    document.body.innerHTML = '<p>initial text</p>';
    setupBrowser();
    await start('bilingual');

    const p = document.createElement('p');
    p.textContent = 'dynamic text';
    document.body.appendChild(p);
    await flushObserver();

    const blockHosts = document.querySelectorAll('.llm-translator-block-host');
    expect(blockHosts).toHaveLength(2);
    expect(p.textContent).toBe('dynamic text');
  });

  it('过滤 data-llm-translator 注入子树（不收集、不翻译）', async () => {
    document.body.innerHTML = '<p>initial text</p>';
    const { sendMessage } = setupBrowser();
    await start('replace');

    const injected = document.createElement('div');
    injected.setAttribute('data-llm-translator', '');
    injected.innerHTML = '<p>injected text</p>';
    document.body.appendChild(injected);
    await flushObserver();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(__getState().records).toHaveLength(1);
  });

  it('模式切换产生的注入 DOM 不形成回环', async () => {
    document.body.innerHTML = '<p>initial text</p>';
    const { sendMessage } = setupBrowser();
    await start('replace');

    const switchBtn = getSwitchButton();
    switchBtn.click(); // → bilingual（插入 blockHost）
    switchBtn.click(); // → replace（移除 blockHost）
    await flushObserver();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(__getState().records).toHaveLength(1);
    expect(document.querySelector('p')!.textContent).toBe('[译] initial text');
  });

  it('同一元素被多个 mutation 覆盖时去重收段（recordedEls）', async () => {
    document.body.innerHTML = '<p>initial text</p>';
    const { sendMessage } = setupBrowser();
    await start('replace');

    const container = document.createElement('div');
    const p = document.createElement('p');
    p.textContent = 'nested text';
    document.body.appendChild(container); // mutation A：body += container
    container.appendChild(p); // mutation B：container += p（同一防抖窗口聚合）
    await flushObserver();

    // container 遍历时 p 已成段；p 自身再遍历时被 recordedEls 去重 → 仅 1 个新段
    expect(__getState().records).toHaveLength(2);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(p.textContent).toBe('[译] nested text');
  });

  it('恢复原文后新增节点不再翻译（观察器已断开）', async () => {
    document.body.innerHTML = '<p>initial text</p>';
    const { sendMessage } = setupBrowser();
    await start('replace');

    clickToolbarButtonByText('恢复原文');

    const p = document.createElement('p');
    p.textContent = 'after restore';
    document.body.appendChild(p);
    await flushObserver();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(p.textContent).toBe('after restore');
  });
});

describe('视口分组调度（IntersectionObserver）', () => {
  /**
   * 可控 mock IntersectionObserver：记录 observe/unobserve/disconnect 调用，
   * 触发相交时调用 callback。完全替代 jsdom 缺失的 IO。
   */
  class MockIntersectionObserver {
    static instances: MockIntersectionObserver[] = [];
    readonly rootMargin: string;
    readonly thresholds: ReadonlyArray<number>;
    private callback: IntersectionObserverCallback;
    private observed: Set<Element> = new Set();
    public disconnectCalls = 0;
    public unobserveCalls: Element[] = [];

    constructor(
      callback: IntersectionObserverCallback,
      opts: { rootMargin?: string; threshold?: number | number[] } = {},
    ) {
      this.callback = callback;
      this.rootMargin = opts.rootMargin ?? '0px';
      this.thresholds = Array.isArray(opts.threshold)
        ? opts.threshold
        : [opts.threshold ?? 0];
      MockIntersectionObserver.instances.push(this);
    }

    observe(el: Element): void {
      this.observed.add(el);
    }
    unobserve(el: Element): void {
      this.observed.delete(el);
      this.unobserveCalls.push(el);
    }
    disconnect(): void {
      this.observed.clear();
      this.disconnectCalls++;
    }
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
    /** 测试用：触发一次相交（isIntersecting=true） */
    triggerIntersect(el: Element, isIntersecting: boolean): void {
      this.callback(
        [
          {
            isIntersecting,
            target: el,
            intersectionRatio: isIntersecting ? 1 : 0,
            boundingClientRect: {} as DOMRectReadOnly,
            intersectionRect: {} as DOMRectReadOnly,
            rootBounds: null,
            time: 0,
          } as IntersectionObserverEntry,
        ],
        this as unknown as IntersectionObserver,
      );
    }
  }

  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    vi.useFakeTimers();
  });

  it('doStart：jsdom 兜底路径下视口外段立即入池（onEnter 同步触发）', async () => {
    // jsdom 默认无 IO：视口外段走同步降级路径，立即入池
    document.body.innerHTML = '<p>in view text</p><p>out of view text</p>';
    const { sendMessage } = setupBrowser();
    await start('replace');

    const state = __getState();
    expect(state.records).toHaveLength(2);
    expect(state.records.every((r) => r.status === 'done')).toBe(true);
    // jsdom 下两条段都入池（视口内/外均走同步入池）
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('doStart：mock IO 不触发相交时视口外段仍 markLoading 且不调用 sendMessage', async () => {
    // 提供 IO mock 但不触发相交：验证生产路径 — 视口外段只 markLoading、不入池
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    try {
      document.body.innerHTML = '<p>in view text</p><p>out of view text</p>';
      // jsdom 默认 getClientRects 为空 → isSegmentInViewport 走兑底视为视口内。
      // 这里覆盖两个 <p> 的 getClientRects + getBoundingClientRect 使其进入几何判定。
      const ps = document.querySelectorAll('p');
      Object.defineProperty(ps[0], 'getClientRects', {
        value: () => [{} as DOMRect],
        configurable: true,
      });
      Object.defineProperty(ps[0], 'getBoundingClientRect', {
        value: () => ({ top: 100, bottom: 200, left: 0, right: 100, width: 100, height: 100 } as DOMRect),
        configurable: true,
      });
      // 视口外：在视口下方 (top=2000) 且 innerHeight=768
      Object.defineProperty(ps[1], 'getClientRects', {
        value: () => [{} as DOMRect],
        configurable: true,
      });
      Object.defineProperty(ps[1], 'getBoundingClientRect', {
        value: () => ({ top: 2000, bottom: 2100, left: 0, right: 100, width: 100, height: 100 } as DOMRect),
        configurable: true,
      });
      const resolveGates: Array<(v: TranslateResponse) => void> = [];
      const gates = ['in view text', 'out of view text'].map(
        () =>
          new Promise<TranslateResponse>((r) => {
            resolveGates.push(r);
          }),
      );
      const { sendMessage } = setupBrowser(
        (text) => (text === 'in view text' ? gates[0] : gates[1]),
      );

      const startPromise = start('replace');
      await drainMicrotasks();

      // 视口外段已 markLoading 但未派发（未触发相交）
      // 视口内段已派发，sendMessage 被调用 1 次
      const loadingHosts = document.querySelectorAll('.llm-translator-loading-host');
      expect(loadingHosts.length).toBe(2);
      // 进度反映全 2 段：1 翻译中 + 1 waiting
      expect(toolbarText()).toMatch(/全文翻译 0\/2|全文翻译 1\/2/);
      // 仅入池 1 个：视口内段
      expect(sendMessage).toHaveBeenCalledTimes(1);

      // 释放视口内段门控
      resolveGates[0]({ translatedText: '一' });
      await drainMicrotasks();
      // 释放视口外段门控（即使入池也不会发生；仅保证清理）
      resolveGates[1]({ translatedText: '二' });
      await startPromise;
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('IO 触发相交后视口外段入池并渲染', async () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    try {
      document.body.innerHTML = '<p>in view text</p><p>out of view text</p>';
      // 覆盖 getClientRects + getBoundingClientRect 使其进入几何判定
      const ps = document.querySelectorAll('p');
      Object.defineProperty(ps[0], 'getClientRects', {
        value: () => [{} as DOMRect],
        configurable: true,
      });
      Object.defineProperty(ps[0], 'getBoundingClientRect', {
        value: () => ({ top: 100, bottom: 200, left: 0, right: 100, width: 100, height: 100 } as DOMRect),
        configurable: true,
      });
      Object.defineProperty(ps[1], 'getClientRects', {
        value: () => [{} as DOMRect],
        configurable: true,
      });
      Object.defineProperty(ps[1], 'getBoundingClientRect', {
        value: () => ({ top: 2000, bottom: 2100, left: 0, right: 100, width: 100, height: 100 } as DOMRect),
        configurable: true,
      });
      const { sendMessage } = setupBrowser();
      const startPromise = start('replace');
      await drainMicrotasks();

      // 初始：视口内段已派发（1 次），视口外段仅 markLoading
      expect(sendMessage).toHaveBeenCalledTimes(1);

      // 找到视口外段对应的 <p> 元素
      const outEl = ps[1];
      // 触发该段进入视口
      const io = MockIntersectionObserver.instances[0];
      io.triggerIntersect(outEl, true);
      await vi.advanceTimersByTimeAsync(25);

      // 视口外段现在应入池并翻译
      expect(sendMessage).toHaveBeenCalledTimes(2);
      expect(outEl.textContent).toBe('[译] out of view text');
      await startPromise;
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('doStart：视口外段立即显示 loading 并计入总进度（jsdom 兜底路径）', async () => {
    // jsdom 下视口外段同步入池：loading 标记短暂出现后被渲染清除，
    // 通过延迟 sendMessage 验证拆分后 markLoading 立即被调用
    document.body.innerHTML = '<p>in view text</p><p>out of view text</p>';
    let resolveFirst!: (value: TranslateResponse) => void;
    let resolveSecond!: (value: TranslateResponse) => void;
    const firstGate = new Promise<TranslateResponse>((r) => {
      resolveFirst = r;
    });
    const secondGate = new Promise<TranslateResponse>((r) => {
      resolveSecond = r;
    });
    setupBrowser((text) => (text === 'in view text' ? firstGate : secondGate));

    const startPromise = start('replace');
    await drainMicrotasks();

    // jsdom 下视口外段同步走 IO 降级 onEnter 立即入池（与视口内段并发竞争 1 槽位）
    // 但已派发的两段都立即 markLoading：loading 标记应出现
    const loadingHosts = document.querySelectorAll('.llm-translator-loading-host');
    expect(loadingHosts.length).toBeGreaterThanOrEqual(1);
    // 进度反映全部段（含视口外）
    expect(toolbarText()).toMatch(/全文翻译 0\/2|全文翻译 1\/2/);

    resolveFirst({ translatedText: '一' });
    resolveSecond({ translatedText: '二' });
    await startPromise;
  });

  it('handleRestore 调用 viewportObserver.disconnect', async () => {
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true, writable: true });
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true, writable: true });
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    try {
      // 制造一个视口外段，让 viewportObserver 被创建
      document.body.innerHTML = '<p>in view</p><p>out of view</p>';
      const ps = document.querySelectorAll('p');
      Object.defineProperty(ps[0], 'getClientRects', { value: () => [{} as DOMRect], configurable: true });
      Object.defineProperty(ps[0], 'getBoundingClientRect', {
        value: () => ({ top: 100, bottom: 200, left: 0, right: 100, width: 100, height: 100 } as DOMRect),
        configurable: true,
      });
      Object.defineProperty(ps[1], 'getClientRects', { value: () => [{} as DOMRect], configurable: true });
      Object.defineProperty(ps[1], 'getBoundingClientRect', {
        value: () => ({ top: 2000, bottom: 2100, left: 0, right: 100, width: 100, height: 100 } as DOMRect),
        configurable: true,
      });
      setupBrowser();
      await start('replace');

      // 验证 viewportObserver 存在
      expect(MockIntersectionObserver.instances).toHaveLength(1);
      const io = MockIntersectionObserver.instances[0];
      expect(io.disconnectCalls).toBe(0);

      clickToolbarButtonByText('恢复原文');

      // disconnect 被调用 1 次
      expect(io.disconnectCalls).toBe(1);
      const state = __getState();
      expect(state.active).toBe(false);
      expect(document.querySelector('[data-llm-translator]')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('__reset 调用 viewportObserver.disconnect', async () => {
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true, writable: true });
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true, writable: true });
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    try {
      document.body.innerHTML = '<p>in view</p><p>out of view</p>';
      const ps = document.querySelectorAll('p');
      Object.defineProperty(ps[0], 'getClientRects', { value: () => [{} as DOMRect], configurable: true });
      Object.defineProperty(ps[0], 'getBoundingClientRect', {
        value: () => ({ top: 100, bottom: 200, left: 0, right: 100, width: 100, height: 100 } as DOMRect),
        configurable: true,
      });
      Object.defineProperty(ps[1], 'getClientRects', { value: () => [{} as DOMRect], configurable: true });
      Object.defineProperty(ps[1], 'getBoundingClientRect', {
        value: () => ({ top: 2000, bottom: 2100, left: 0, right: 100, width: 100, height: 100 } as DOMRect),
        configurable: true,
      });
      setupBrowser();
      await start('replace');

      expect(MockIntersectionObserver.instances).toHaveLength(1);
      const io = MockIntersectionObserver.instances[0];

      __reset();
      // disconnect 被调用 1 次
      expect(io.disconnectCalls).toBe(1);
      // reset 幂等：重复 reset 不应抛错
      expect(() => __reset()).not.toThrow();
      // 重复 reset 不再调用 disconnect（句柄已为 null）
      expect(io.disconnectCalls).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('增量翻译视口外段加入同一 viewportObserver（jsdom 兜底）', async () => {
    document.body.innerHTML = '<p>initial text</p>';
    const { sendMessage } = setupBrowser();
    await start('replace');
    expect(sendMessage).toHaveBeenCalledTimes(1);

    const p = document.createElement('p');
    p.textContent = 'dynamic text';
    document.body.appendChild(p);
    await flushObserver();

    // jsdom 下视口外段同步入池，sendMessage 增加一次
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(p.textContent).toBe('[译] dynamic text');
    expect(__getState().records).toHaveLength(2);
  });

  it('doStart 二次触发时 disconnect 旧 viewportObserver', async () => {
    // 覆盖 getClientRects + getBoundingClientRect 使部分段位于视口外
    // 以确保 viewportObserver 被创建
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true, writable: true });
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true, writable: true });
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    try {
      document.body.innerHTML = '<p>first in view</p><p>first out of view</p>';
      const ps1 = document.querySelectorAll('p');
      Object.defineProperty(ps1[0], 'getClientRects', { value: () => [{} as DOMRect], configurable: true });
      Object.defineProperty(ps1[0], 'getBoundingClientRect', {
        value: () => ({ top: 100, bottom: 200, left: 0, right: 100, width: 100, height: 100 } as DOMRect),
        configurable: true,
      });
      Object.defineProperty(ps1[1], 'getClientRects', { value: () => [{} as DOMRect], configurable: true });
      Object.defineProperty(ps1[1], 'getBoundingClientRect', {
        value: () => ({ top: 2000, bottom: 2100, left: 0, right: 100, width: 100, height: 100 } as DOMRect),
        configurable: true,
      });
      setupBrowser();
      await start('replace');
      // 第一轮创建了 1 个 viewportObserver
      expect(MockIntersectionObserver.instances).toHaveLength(1);
      const firstIO = MockIntersectionObserver.instances[0];
      expect(firstIO.disconnectCalls).toBe(0);

      // 恢复原文
      clickToolbarButtonByText('恢复原文');
      expect(firstIO.disconnectCalls).toBe(1);

      // 第二次 start：重设 DOM + 视口外段 → 重新创建 viewportObserver
      document.body.innerHTML = '<p>second in view</p><p>second out of view</p>';
      const ps2 = document.querySelectorAll('p');
      Object.defineProperty(ps2[0], 'getClientRects', { value: () => [{} as DOMRect], configurable: true });
      Object.defineProperty(ps2[0], 'getBoundingClientRect', {
        value: () => ({ top: 100, bottom: 200, left: 0, right: 100, width: 100, height: 100 } as DOMRect),
        configurable: true,
      });
      Object.defineProperty(ps2[1], 'getClientRects', { value: () => [{} as DOMRect], configurable: true });
      Object.defineProperty(ps2[1], 'getBoundingClientRect', {
        value: () => ({ top: 2000, bottom: 2100, left: 0, right: 100, width: 100, height: 100 } as DOMRect),
        configurable: true,
      });
      await start('replace');

      // handleRestore 已 disconnect 句柄并置 null，doStart 入口不需重复 disconnect。
      // 但应创建一个新 viewportObserver（doStart 入口 disconnect 旧句柄 = no-op 后创建新）
      expect(firstIO.disconnectCalls).toBe(1);
      expect(MockIntersectionObserver.instances.length).toBe(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('doStart 二次触发时清理上一会话 viewportObserver（兼底路径）', async () => {
    // 极端路径：起动后不走 handleRestore，直接调 __reset 模拟跨会话状态。
    // 验证 __reset 会 disconnect 句柄。
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true, writable: true });
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true, writable: true });
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    try {
      document.body.innerHTML = '<p>in view</p><p>out of view</p>';
      const ps = document.querySelectorAll('p');
      Object.defineProperty(ps[0], 'getClientRects', { value: () => [{} as DOMRect], configurable: true });
      Object.defineProperty(ps[0], 'getBoundingClientRect', {
        value: () => ({ top: 100, bottom: 200, left: 0, right: 100, width: 100, height: 100 } as DOMRect),
        configurable: true,
      });
      Object.defineProperty(ps[1], 'getClientRects', { value: () => [{} as DOMRect], configurable: true });
      Object.defineProperty(ps[1], 'getBoundingClientRect', {
        value: () => ({ top: 2000, bottom: 2100, left: 0, right: 100, width: 100, height: 100 } as DOMRect),
        configurable: true,
      });
      setupBrowser();
      await start('replace');
      const firstIO = MockIntersectionObserver.instances[0];
      expect(firstIO.disconnectCalls).toBe(0);

      // 模拟跨会话调起：__reset 清理全部状态（含 viewportObserver）
      __reset();
      expect(firstIO.disconnectCalls).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('视口优先调度', () => {
  /**
   * 任务所要求的视口优先调度单测：3 段在视口内、2 段在视口外。
   * 仅 mock `getBoundingClientRect`（不 mock `getClientRects`），并为每个段元素单独
   * 定义 `getClientRects` 返回非空数组以跳过 jsdom 兑底。
   */
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('视口内段优先入池：3 段在视口内、2 段在视口外', async () => {
    // 设置视口尺寸：jsdom 默认 0×0，需改写才能使几何判定生效
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true, writable: true });
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true, writable: true });
    // DOM：5 段，文本含“in view N”与“out of view N”以驱动 mockViewportLayout
    document.body.innerHTML =
      '<p>in view 1</p><p>in view 2</p><p>in view 3</p><p>out of view 1</p><p>out of view 2</p>';
    const ps = Array.from(document.querySelectorAll('p')) as HTMLElement[];

    // 几何判定兑底：jsdom 默认 getClientRects 为空 → isSegmentInViewport 走兑底
    // 返回 true。为模拟生产路径需让 getClientRects 返回非空。
    setClientRectsNonEmpty(ps);

    // mock 视口布局：前 3 段视为视口内，后 2 段视为视口外
    const visibleTexts = new Set(['in view 1', 'in view 2', 'in view 3']);
    mockViewportLayout(visibleTexts);

    // mock IO：视口外段挂到 IO 上等待进入视口
    const { trigger, instances } = installMockIO();

    try {
      const { sendMessage } = setupBrowser();
      const startPromise = start('replace');
      await drainMicrotasks();

      // 初始：仅 3 个视口内段发起 sendMessage，视口外段只 markLoading
      expect(sendMessage).toHaveBeenCalledTimes(3);
      const calledTexts = sendMessage.mock.calls.map(
        (c) => (c[0] as { payload: { text: string } }).payload.text,
      );
      expect(calledTexts).toEqual(
        expect.arrayContaining(['in view 1', 'in view 2', 'in view 3']),
      );
      // 视口外段不发起
      expect(calledTexts).not.toContain('out of view 1');
      expect(calledTexts).not.toContain('out of view 2');

      // 创建了一个 IO 实例，视口外 2 段被 observe
      expect(instances).toHaveLength(1);
      const io = instances[0];
      expect(io.observed.size).toBe(2);
      expect(io.observed.has(ps[3])).toBe(true);
      expect(io.observed.has(ps[4])).toBe(true);

      // 释放前 3 段门控，避免在途入池占用并发（可选，不影响本断言）
      await drainMicrotasks();
      // 释放 IO 回调 → 后 2 段入池
      trigger([ps[3], ps[4]]);
      await vi.advanceTimersByTimeAsync(25);

      expect(sendMessage).toHaveBeenCalledTimes(5);
      const calledTextsAfter = sendMessage.mock.calls.map(
        (c) => (c[0] as { payload: { text: string } }).payload.text,
      );
      expect(calledTextsAfter).toEqual(
        expect.arrayContaining(['in view 1', 'in view 2', 'in view 3', 'out of view 1', 'out of view 2']),
      );

      await startPromise;
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });

  it('jsdom 兑底：IO 缺失时视口外段立即入池', async () => {
    // 设置视口尺寸但不使用 mockViewportLayout——jsdom 下 getClientRects 兑底使
    // 所有段被判定为视口内；但任务本测要点是 IO 缺失时视口外段也立即入池。
    // 这里靠删除全局 IntersectionObserver 走 t2 降级路径：观察 5 段全部入池。
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true, writable: true });
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true, writable: true });
    document.body.innerHTML =
      '<p>in view 1</p><p>in view 2</p><p>in view 3</p><p>out of view 1</p><p>out of view 2</p>';
    const ps = Array.from(document.querySelectorAll('p')) as HTMLElement[];
    setClientRectsNonEmpty(ps);
    // 模拟“后 2 段在视口外”的几何状态
    mockViewportLayout(new Set(['in view 1', 'in view 2', 'in view 3']));

    // 删除全局 IntersectionObserver → t2 降级路径同步触发 onEnter
    vi.stubGlobal('IntersectionObserver', undefined);

    try {
      const { sendMessage } = setupBrowser();
      const startPromise = start('replace');
      await drainMicrotasks();
      await vi.advanceTimersByTimeAsync(25);

      // jsdom 兑底：视口外段也同步入池（与视口内段一起被 runPool 调度）
      // 总 5 段：3 视口内同步 + 2 视口外通过 IO 兑底路径同步 → 全部发起
      expect(sendMessage).toHaveBeenCalledTimes(5);
      const calledTexts = sendMessage.mock.calls.map(
        (c) => (c[0] as { payload: { text: string } }).payload.text,
      );
      expect(calledTexts).toEqual(
        expect.arrayContaining(['in view 1', 'in view 2', 'in view 3', 'out of view 1', 'out of view 2']),
      );

      await startPromise;
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });

  it('恢复原文清理 viewportObserver：disconnect 被调用', async () => {
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true, writable: true });
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true, writable: true });
    document.body.innerHTML = '<p>in view</p><p>out of view</p>';
    const ps = Array.from(document.querySelectorAll('p')) as HTMLElement[];
    setClientRectsNonEmpty(ps);
    mockViewportLayout(new Set(['in view']));
    const { instances } = installMockIO();

    try {
      setupBrowser();
      const startPromise = start('replace');
      await drainMicrotasks();

      // 有视口外段时创建了 1 个 viewportObserver 并 observe
      expect(instances).toHaveLength(1);
      const io = instances[0];
      expect(io.observed.has(ps[1])).toBe(true);

      // 恢复原文
      clickToolbarButtonByText('恢复原文');

      // disconnect 被调用
      expect(io.disconnect).toBeDefined();
      // mockIO 的 disconnect 由 setClientRectsNonEmpty / createViewportObserver 内部调用
      // 通过检查 observed 为空确认 disconnect 生效
      expect(io.observed.size).toBe(0);
      // 状态被重置
      expect(__getState().active).toBe(false);

      await startPromise;
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });
});

describe('LLM semantic batch orchestration', () => {
  it('selects semantic batch streaming and preserves inline markup across mode switches', async () => {
    document.body.innerHTML = '<p>Hello <strong>world</strong></p>';
    const { runtimeSendMessage, sendMessage, connect } = setupBatchBrowser();

    await start('replace');

    expect(runtimeSendMessage).toHaveBeenCalledWith({ type: 'get-translation-capabilities' });
    expect(connect).toHaveBeenCalledWith({ name: 'fullpage-translate-batch-stream' });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(__getState().records).toHaveLength(1);
    expect(document.querySelector('strong')).not.toBeNull();
    expect(document.querySelector('p')?.textContent).toBe('[批] Hello [批] world');

    getSwitchButton().click();
    expect(document.querySelector('p')?.innerHTML).toBe('Hello <strong>world</strong>');
    expect(document.querySelector('.llm-translator-block-host')?.shadowRoot?.textContent)
      .toContain('[批] Hello [批] world');

    getSwitchButton().click();
    expect(document.querySelector('strong')).not.toBeNull();
    expect(document.querySelector('p')?.textContent).toBe('[批] Hello [批] world');
  });

  it('keeps the legacy non-streaming path for a traditional source', async () => {
    document.body.innerHTML = '<p>Hello world</p>';
    const { runtimeSendMessage, sendMessage, connect } = setupBrowser();

    await start('replace');

    expect(runtimeSendMessage).toHaveBeenCalledWith({ type: 'get-translation-capabilities' });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'translate',
      payload: { text: 'Hello world', targetLang: '简体中文' },
    });
    expect(connect).not.toHaveBeenCalled();
  });

  it('coalesces viewport entries observed within 25 ms into one batch port', async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true, writable: true });
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true, writable: true });
    document.body.innerHTML = '<p>outside one</p><p>outside two</p>';
    const paragraphs = Array.from(document.querySelectorAll('p')) as HTMLElement[];
    setClientRectsNonEmpty(paragraphs);
    mockViewportLayout(new Set());
    const { trigger } = installMockIO();
    const { connect, sendMessage } = setupBatchBrowser();

    await start('replace');
    expect(connect).not.toHaveBeenCalled();

    trigger(paragraphs);
    await vi.advanceTimersByTimeAsync(24);
    expect(connect).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(sendMessage).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('uses the same 25 ms queue for dynamic in-view segments', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<p>initial text</p>';
    const { connect } = setupBatchBrowser();
    await start('replace');
    expect(connect).toHaveBeenCalledTimes(1);

    const dynamic = document.createElement('p');
    dynamic.textContent = 'dynamic text';
    document.body.appendChild(dynamic);
    await drainMicrotasks();

    await vi.advanceTimersByTimeAsync(224);
    expect(connect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(dynamic.textContent).toBe('[批] dynamic text');
  });

  it('clears a pending viewport micro-batch when restoring the page', async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true, writable: true });
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true, writable: true });
    document.body.innerHTML = '<p>outside text</p>';
    const paragraph = document.querySelector('p') as HTMLElement;
    setClientRectsNonEmpty([paragraph]);
    mockViewportLayout(new Set());
    const { trigger } = installMockIO();
    const { connect, sendMessage } = setupBatchBrowser();

    await start('replace');
    trigger([paragraph]);
    expect(connect).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();

    clickToolbarButtonByText('恢复原文');
    await vi.advanceTimersByTimeAsync(25);

    expect(connect).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(paragraph.textContent).toBe('outside text');
    vi.restoreAllMocks();
  });

  it('reuses the versioned structured cache after restore without opening another port', async () => {
    document.body.innerHTML = '<p>Hello <strong>world</strong></p>';
    const { connect } = setupBatchBrowser();

    await start('replace');
    expect(connect).toHaveBeenCalledTimes(1);
    clickToolbarButtonByText('恢复原文');

    await start('bilingual');

    expect(connect).toHaveBeenCalledTimes(1);
    expect(__getState().records).toHaveLength(1);
    expect(document.querySelector('p')?.innerHTML).toBe('Hello <strong>world</strong>');
    expect(document.querySelector('.llm-translator-block-host')?.shadowRoot?.textContent)
      .toContain('[批] Hello [批] world');
  });

  it('rejects late batch events after restore before mutating the page', async () => {
    document.body.innerHTML = '<p>slow text</p>';
    const { ports } = setupBatchBrowser(false);

    const startPromise = start('replace');
    await drainMicrotasks();
    expect(ports).toHaveLength(1);

    clickToolbarButtonByText('恢复原文');
    ports[0].complete();
    await startPromise;

    expect(document.querySelector('p')?.textContent).toBe('slow text');
    expect(document.querySelector('[data-llm-translator]')).toBeNull();
  });

  it('abandons a start whose capability lookup resolves after reset', async () => {
    document.body.innerHTML = '<p>stale startup</p>';
    let resolveCapabilities!: (value: { batchStream: boolean }) => void;
    const capabilities = new Promise<{ batchStream: boolean }>((resolve) => {
      resolveCapabilities = resolve;
    });
    const sendMessage = vi.fn((message: { type: string }) => {
      if (message.type === 'get-translation-capabilities') return capabilities;
      return Promise.resolve({});
    });
    const connect = vi.fn();
    vi.stubGlobal('browser', {
      runtime: { sendMessage, connect },
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({
            [key]: { activeProviderId: 'llm-source', defaultTargetLang: '简体中文' },
          })),
        },
      },
    });

    const startPromise = start('replace');
    await drainMicrotasks();
    expect(sendMessage).toHaveBeenCalledWith({ type: 'get-translation-capabilities' });

    __reset();
    resolveCapabilities({ batchStream: true });
    await startPromise;

    expect(connect).not.toHaveBeenCalled();
    expect(__getState().records).toHaveLength(0);
    expect(__getState().active).toBe(false);
    expect(__getState().targetLang).toBe('');
    expect(document.querySelector('[data-llm-translator]')).toBeNull();
  });

  it('shares three Port slots across viewport windows, dynamic nodes, and retry', async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true, writable: true });
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true, writable: true });
    const outOfViewTexts = ['a', 'b', 'c'].map((suffix) => `${'x'.repeat(5999)}${suffix}`);
    document.body.innerHTML = [
      '<p>initial failure</p>',
      ...outOfViewTexts.map((text) => `<p>${text}</p>`),
    ].join('');
    const paragraphs = Array.from(document.querySelectorAll('p')) as HTMLElement[];
    setClientRectsNonEmpty(paragraphs);
    const visibleTexts = new Set(['initial failure']);
    mockViewportLayout(visibleTexts);
    const { trigger } = installMockIO();
    const {
      ports,
      activePortCount,
      maxActivePortCount,
    } = setupBatchBrowser(false);

    const startPromise = start('replace');
    await drainMicrotasks();
    const initialRequest = ports[0].request!;
    ports[0].emit({
      type: 'error',
      requestId: initialRequest.requestId,
      result: {
        missingChunkIds: initialRequest.chunks.map((chunk) => chunk.chunkId),
        error: 'retry later',
        errorType: 'network',
      },
    });
    await startPromise;
    expect(activePortCount()).toBe(0);

    trigger(paragraphs.slice(1));
    await vi.advanceTimersByTimeAsync(25);
    expect(ports).toHaveLength(4);
    expect(activePortCount()).toBe(3);

    getRetryButton().click();
    const dynamicText = 'd'.repeat(6000);
    visibleTexts.add(dynamicText);
    const dynamic = document.createElement('p');
    dynamic.textContent = dynamicText;
    document.body.appendChild(dynamic);
    setClientRectsNonEmpty([dynamic]);
    await drainMicrotasks();
    await vi.advanceTimersByTimeAsync(225);

    expect(ports).toHaveLength(4);
    expect(activePortCount()).toBe(3);
    expect(maxActivePortCount()).toBe(3);

    ports[1].complete();
    await drainMicrotasks();
    expect(ports).toHaveLength(5);
    expect(ports[4].request?.chunks[0].parts[0].text).toBe('initial failure');
    expect(activePortCount()).toBe(3);

    ports[2].complete();
    await drainMicrotasks();
    expect(ports).toHaveLength(6);
    expect(ports[5].request?.chunks[0].parts[0].text).toBe(dynamicText);
    expect(activePortCount()).toBe(3);
    expect(maxActivePortCount()).toBe(3);

    for (const port of ports.slice(3)) port.complete();
    await drainMicrotasks();
    expect(activePortCount()).toBe(0);
  });

  it('retries only failed semantic owners through the batch port', async () => {
    document.body.innerHTML = '<p>retry text</p>';
    const { ports, connect, sendMessage } = setupBatchBrowser(false);
    const startPromise = start('replace');
    await drainMicrotasks();
    const firstRequest = ports[0].request!;
    ports[0].emit({
      type: 'error',
      requestId: firstRequest.requestId,
      result: {
        missingChunkIds: firstRequest.chunks.map((chunk) => chunk.chunkId),
        error: 'temporary failure',
        errorType: 'network',
      },
    });
    await startPromise;

    getRetryButton().click();
    await drainMicrotasks();
    expect(ports).toHaveLength(2);
    ports[1].complete();
    await drainMicrotasks();

    expect(connect).toHaveBeenCalledTimes(2);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(document.querySelector('p')?.textContent).toBe('[批] retry text');
    expect(__getState().records[0].status).toBe('done');
  });
});
