// @vitest-environment jsdom
// popup 应用单元测试：流式会话生命周期（#79）与
// 设置视图往返导航 / 会话保留（#81）。
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message, StreamPortMessage } from '@/shared/types';
import App from '@/entrypoints/popup/App.vue';

// 可变设置夹具：默认目标语言（#81 设置读写）
const settingsFixture = {
  activeProviderId: null as string | null,
  defaultTargetLang: 'zh-CN',
};

vi.mock('@/shared/storage', () => ({
  getSettings: vi.fn().mockImplementation(async () => ({ ...settingsFixture })),
  setSettings: vi.fn(),
  getProviders: vi.fn().mockResolvedValue([]),
  setProviders: vi.fn(),
}));

interface PopupPortHarness {
  port: {
    onMessage: { addListener(listener: (message: StreamPortMessage) => void): void };
    onDisconnect: { addListener(listener: () => void): void };
    postMessage: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };
  emitMessage(message: StreamPortMessage): void;
  emitDisconnect(): void;
}

function createPopupPort(): PopupPortHarness {
  const messageListeners: Array<(message: StreamPortMessage) => void> = [];
  const disconnectListeners: Array<() => void> = [];
  const port = {
    onMessage: { addListener: (listener: (message: StreamPortMessage) => void) => messageListeners.push(listener) },
    onDisconnect: { addListener: (listener: () => void) => disconnectListeners.push(listener) },
    postMessage: vi.fn(),
    disconnect: vi.fn(),
  };
  return {
    port,
    emitMessage(message) {
      for (const listener of messageListeners) listener(message);
    },
    emitDisconnect() {
      for (const listener of disconnectListeners) listener();
    },
  };
}

function actionButton(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('button').find((candidate) => candidate.text().includes(label));
  if (!button) throw new Error(`Missing ${label} button`);
  return button;
}

function stubBrowser(options: {
  ports?: PopupPortHarness[];
  openOptionsPage?: ReturnType<typeof vi.fn>;
} = {}) {
  const ports = options.ports ?? [];
  const sendMessage = vi.fn(async (message: Message) => {
    if (message.type === 'get-active-sources') {
      return {
        sources: [
          { id: 'builtin:microsoft', name: '微软翻译', type: 'microsoft' },
          { id: 'builtin:google', name: 'Google 翻译', type: 'google' },
        ],
        activeSourceId: settingsFixture.activeProviderId ?? 'builtin:microsoft',
      };
    }
    if (message.type === 'set-active-source') {
      settingsFixture.activeProviderId = message.payload.id;
      return { ok: true };
    }
    throw new Error(`Unexpected message: ${message.type}`);
  });
  const openOptionsPage = options.openOptionsPage ?? vi.fn();
  vi.stubGlobal('browser', {
    runtime: {
      connect: vi.fn(() => ports.shift()!.port),
      openOptionsPage,
      sendMessage,
    },
  });
  return { openOptionsPage };
}

async function openSettingsView(wrapper: VueWrapper) {
  const gear = wrapper.findAll('button').find((b) => b.attributes('aria-label') === '设置');
  if (!gear) throw new Error('Missing settings button');
  await gear.trigger('click');
  await flushPromises();
}

describe('popup stream session lifecycle', () => {
  const wrappers: VueWrapper[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    settingsFixture.activeProviderId = null;
    settingsFixture.defaultTargetLang = 'zh-CN';
  });

  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it('忽略旧 port 延迟到达的断开事件', async () => {
    const first = createPopupPort();
    const second = createPopupPort();
    stubBrowser({ ports: [first, second] });
    const wrapper = mount(App);
    wrappers.push(wrapper);
    await flushPromises();
    await wrapper.get('textarea').setValue('hello');

    await actionButton(wrapper, '翻译').trigger('click');
    first.emitMessage({ type: 'chunk', deltaText: '你' });
    await actionButton(wrapper, '停止').trigger('click');
    await actionButton(wrapper, '翻译').trigger('click');

    first.emitDisconnect();
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('翻译中');

    second.emitMessage({ type: 'chunk', deltaText: '你好' });
    second.emitMessage({ type: 'done', result: { translatedText: '你好' } });
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('已完成');
    expect(wrapper.text()).toContain('你好');
  });
});

describe('popup 设置视图往返（#81）', () => {
  const wrappers: VueWrapper[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    settingsFixture.activeProviderId = null;
    settingsFixture.defaultTargetLang = 'zh-CN';
  });

  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it('工作台 ⇄ 设置往返导航保留原文、译文与状态', async () => {
    const port = createPopupPort();
    stubBrowser({ ports: [port] });
    const wrapper = mount(App);
    wrappers.push(wrapper);
    await flushPromises();
    await wrapper.get('textarea').setValue('hello world');

    await actionButton(wrapper, '翻译').trigger('click');
    port.emitMessage({ type: 'chunk', deltaText: '你好' });
    port.emitMessage({ type: 'done', result: { translatedText: '你好，世界' } });
    await wrapper.vm.$nextTick();

    await openSettingsView(wrapper);
    expect(wrapper.find('[role="combobox"][aria-label="默认目标语言"]').exists()).toBe(true);

    const back = wrapper.findAll('button').find((b) => b.attributes('aria-label') === '返回文本翻译');
    expect(back).toBeTruthy();
    await back!.trigger('click');
    await flushPromises();

    expect(wrapper.get('textarea').element.value).toBe('hello world');
    expect(wrapper.text()).toContain('你好，世界');
    expect(wrapper.text()).toContain('已完成');
  });

  it('流式期间进入设置：导航不打断流，返回后译文继续累计', async () => {
    const port = createPopupPort();
    stubBrowser({ ports: [port] });
    const wrapper = mount(App);
    wrappers.push(wrapper);
    await flushPromises();
    await wrapper.get('textarea').setValue('streaming');

    await actionButton(wrapper, '翻译').trigger('click');
    port.emitMessage({ type: 'chunk', deltaText: '流式' });

    await openSettingsView(wrapper);
    port.emitMessage({ type: 'chunk', deltaText: '中' });

    const back = wrapper.findAll('button').find((b) => b.attributes('aria-label') === '返回文本翻译');
    await back!.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('翻译中');
    port.emitMessage({ type: 'done', result: { translatedText: '流式中' } });
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('已完成');
    expect(wrapper.text()).toContain('流式中');
  });

  it('新开文本翻译会话的临时目标语言跟随最新默认目标语言', async () => {
    settingsFixture.defaultTargetLang = 'ja';
    stubBrowser({ ports: [] });
    const wrapper = mount(App);
    wrappers.push(wrapper);
    await flushPromises();

    const workbenchTrigger = wrapper.find('button[role="combobox"][aria-label="目标语言"]');
    expect(workbenchTrigger.text()).toContain('日语');
    expect(workbenchTrigger.text()).toContain('ja');
  });

  it('设置视图提供打开 options 完整设置页的入口', async () => {
    const { openOptionsPage } = stubBrowser({ ports: [] });
    const wrapper = mount(App);
    wrappers.push(wrapper);
    await flushPromises();

    await openSettingsView(wrapper);
    await actionButton(wrapper, '打开全部设置').trigger('click');
    expect(openOptionsPage).toHaveBeenCalledTimes(1);
  });
});
