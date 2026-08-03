// @vitest-environment jsdom
// 编排器单元测试 - 全文翻译状态机（start / 工具栏回调 / 增量翻译 / 类型守卫）
//
// 编排器是唯一状态持有者；segmenter/pool/renderer/toolbar 均无全局状态。
// 测试通过 __reset() 在每个用例前重置模块级状态，经 __getState() 断言内部状态。
// Mock 策略：vi.stubGlobal('browser') 同时覆盖 runtime.sendMessage（翻译池通道）
// 与 storage.local.get（getTargetLang 读取用户配置的目标语言）。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
  const sendMessage = vi.fn(
    async (msg: { type: string; payload?: { text: string; targetLang: string } }) => {
      if (msg.type === 'translate' && msg.payload) {
        return translateImpl(msg.payload.text);
      }
      return {};
    },
  );
  vi.stubGlobal('browser', {
    runtime: { sendMessage },
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({
          [key]: { activeProviderId: null, defaultTargetLang: '简体中文' },
        })),
      },
    },
  });
  return { sendMessage };
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
});

describe('增量翻译（MutationObserver + 200ms 防抖）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
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
