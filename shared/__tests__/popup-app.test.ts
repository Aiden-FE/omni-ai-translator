// @vitest-environment jsdom
// popup 应用单元测试：流式会话生命周期（#79）与
// 设置视图往返导航 / 会话保留（#81）。
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ErrorType, Message, StreamPortMessage } from '@/shared/types';
import LanguageSelect from '@/shared/ui/components/language-select/LanguageSelect.vue';
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

  it('流式期间进入设置：终止请求并保留部分译文,返回后不自动续传', async () => {
    const port = createPopupPort();
    stubBrowser({ ports: [port] });
    const wrapper = mount(App);
    wrappers.push(wrapper);
    await flushPromises();
    await wrapper.get('textarea').setValue('streaming');

    await actionButton(wrapper, '翻译').trigger('click');
    port.emitMessage({ type: 'chunk', deltaText: '流式' });

    // PRD「翻译生命周期」:进入设置先终止请求(port disconnect)并保留部分译文
    await openSettingsView(wrapper);
    expect(port.port.disconnect).toHaveBeenCalledTimes(1);

    const back = wrapper.findAll('button').find((b) => b.attributes('aria-label') === '返回文本翻译');
    await back!.trigger('click');
    await flushPromises();

    // 返回文本翻译:不自动续传,状态停留在已停止,部分译文保留
    expect(wrapper.text()).toContain('已停止');
    expect(wrapper.text()).toContain('流式');
    expect(wrapper.text()).not.toContain('翻译中');

    // 旧 port 延迟到达的 chunk 不会复活已终止的流(streamPort 已置空,监听器早返回)
    port.emitMessage({ type: 'chunk', deltaText: '中' });
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).not.toContain('流式中');
    expect(wrapper.text()).toContain('流式');
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

  it('清空原文同时重置当前译文并把焦点还给输入区', async () => {
    const port = createPopupPort();
    stubBrowser({ ports: [port] });
    const wrapper = mount(App, { attachTo: document.body });
    wrappers.push(wrapper);
    await flushPromises();
    const textarea = wrapper.get('textarea');
    await textarea.setValue('hello');

    await actionButton(wrapper, '翻译').trigger('click');
    port.emitMessage({ type: 'done', result: { translatedText: '你好' } });
    await wrapper.vm.$nextTick();
    await wrapper.get('button[aria-label="清空原文"]').trigger('click');
    await flushPromises();

    expect(textarea.element.value).toBe('');
    expect(wrapper.text()).not.toContain('你好');
    expect(document.activeElement).toBe(textarea.element);
  });

  it('未临时切换语言时,设置改默认值返回后同步为新默认值 (#87)', async () => {
    settingsFixture.defaultTargetLang = 'zh-CN';
    stubBrowser({ ports: [] });
    const wrapper = mount(App);
    wrappers.push(wrapper);
    await flushPromises();

    // 当前文本翻译会话内未临时切换目标语言
    const workbenchTrigger = wrapper.find('button[role="combobox"][aria-label="目标语言"]');
    expect(workbenchTrigger.text()).toContain('zh-CN');

    await openSettingsView(wrapper);
    // 用户在设置中把默认目标语言改为日语(模拟持久化后的最新值)
    settingsFixture.defaultTargetLang = 'ja';

    const back = wrapper.findAll('button').find((b) => b.attributes('aria-label') === '返回文本翻译');
    await back!.trigger('click');
    await flushPromises();

    // 未临时切换 -> 返回后同步使用新默认值(日语)
    const workbenchTriggerAfter = wrapper.find('button[role="combobox"][aria-label="目标语言"]');
    expect(workbenchTriggerAfter.text()).toContain('ja');
    expect(workbenchTriggerAfter.text()).toContain('日语');
  });

  it('已临时切换语言时,设置改默认值返回后保留临时选择 (#87)', async () => {
    settingsFixture.defaultTargetLang = 'zh-CN';
    stubBrowser({ ports: [] });
    const wrapper = mount(App);
    wrappers.push(wrapper);
    await flushPromises();

    // 用户在文本翻译界面临时切换目标语言为日语(覆盖默认值)
    wrapper.findComponent(LanguageSelect).vm.$emit('update:modelValue', 'ja');
    await wrapper.vm.$nextTick();
    const workbenchTrigger = wrapper.find('button[role="combobox"][aria-label="目标语言"]');
    expect(workbenchTrigger.text()).toContain('ja');

    await openSettingsView(wrapper);
    // 用户在设置中把默认目标语言改为韩语
    settingsFixture.defaultTargetLang = 'ko';

    const back = wrapper.findAll('button').find((b) => b.attributes('aria-label') === '返回文本翻译');
    await back!.trigger('click');
    await flushPromises();

    // 已临时切换 -> 返回后保留临时选择(日语),不跟随新默认值(韩语)
    const workbenchTriggerAfter = wrapper.find('button[role="combobox"][aria-label="目标语言"]');
    expect(workbenchTriggerAfter.text()).toContain('ja');
    expect(workbenchTriggerAfter.text()).not.toContain('ko');
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

// #80：错误差异化展示（ErrorType → errorFeedback 文案）、重试触发、复制译文反馈
describe('popup 错误横幅 / 重试 / 复制译文 (#80)', () => {
  const wrappers: VueWrapper[] = [];

  function stubBrowser(ports: PopupPortHarness[]) {
    const queue = [...ports];
    vi.stubGlobal('browser', {
      runtime: {
        connect: vi.fn(() => queue.shift()!.port),
        openOptionsPage: vi.fn(),
        sendMessage: vi.fn(async (message: Message) => {
          if (message.type === 'get-active-sources') {
            return {
              sources: [
                { id: 'builtin:microsoft', name: '微软翻译', type: 'microsoft' },
                { id: 'builtin:google', name: 'Google 翻译', type: 'google' },
              ],
              activeSourceId: 'builtin:microsoft',
            };
          }
          return { ok: true };
        }),
      },
    });
  }

  async function mountAndStart(options: { attachTo?: HTMLElement } = {}): Promise<{
    wrapper: VueWrapper;
    startTranslation: () => Promise<void>;
  }> {
    const wrapper = mount(App, options.attachTo ? { attachTo: options.attachTo } : {});
    wrappers.push(wrapper);
    await flushPromises();
    await wrapper.get('textarea').setValue('hello');
    return {
      wrapper,
      startTranslation: async () => {
        await actionButton(wrapper, '翻译').trigger('click');
        await wrapper.vm.$nextTick();
      },
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.unmount();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const allTypes: ErrorType[] = ['no-config', 'network', 'rate-limit', 'unreachable', 'unsupported-lang'];

  // 五类 ErrorType 的期望文案(独立于被测组件:取自规格约定的五类互斥文案)
  const expectedBanner: Record<ErrorType, { main: string; guidance: string }> = {
    'no-config': { main: '未配置可用翻译源', guidance: '请在配置页选择或添加源' },
    network: { main: '翻译请求失败', guidance: '请检查网络或源地址' },
    'rate-limit': { main: '翻译源繁忙（限流）', guidance: '请稍后再试或在配置页切换源' },
    unreachable: { main: '翻译源不可达', guidance: '请在配置页切换到其它源' },
    'unsupported-lang': { main: '翻译源不支持该目标语言', guidance: '请在目标语言中选择其它语言' },
  };

  it.each(allTypes)('错误横幅按 ErrorType(%s) 差异化展示主文案与引导', async (errorType) => {
    const port = createPopupPort();
    stubBrowser([port]);
    const { wrapper, startTranslation } = await mountAndStart();

    await startTranslation();
    port.emitMessage({
      type: 'error',
      result: { translatedText: '', error: '底层信息', errorType },
    });
    await wrapper.vm.$nextTick();

    const banner = wrapper.find('[role="alert"]');
    expect(banner.exists()).toBe(true);
    expect(banner.text()).toContain(expectedBanner[errorType].main);
    expect(banner.text()).toContain(expectedBanner[errorType].guidance);
  });

  it('五类 ErrorType 展示文案互不相同', () => {
    const mains = allTypes.map((t) => expectedBanner[t].main);
    expect(new Set(mains).size).toBe(allTypes.length);
  });

  it('错误横幅带重试按钮;重试保留原文与临时目标语言重新发起', async () => {
    const first = createPopupPort();
    const second = createPopupPort();
    stubBrowser([first, second]);
    const { wrapper, startTranslation } = await mountAndStart();

    // 用户先把临时目标语言改为日语(覆盖设置默认值),再触发错误与重试
    wrapper.findComponent(LanguageSelect).vm.$emit('update:modelValue', 'ja');
    await wrapper.vm.$nextTick();

    await startTranslation();
    first.emitMessage({
      type: 'error',
      result: { translatedText: '', error: 'fail', errorType: 'network' },
    });
    await wrapper.vm.$nextTick();

    const retry = wrapper.find('[role="alert"]').find('button');
    expect(retry.text()).toContain('重试');
    await retry.trigger('click');
    await wrapper.vm.$nextTick();

    // 重新建连并用当前原文 + 用户切换后的临时目标语言发起 request
    expect(second.port.postMessage).toHaveBeenCalledWith({
      type: 'request',
      text: 'hello',
      targetLang: 'ja',
    });
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('错误横幅出现时主操作按钮仍在原位且可用', async () => {
    const port = createPopupPort();
    stubBrowser([port]);
    const { wrapper, startTranslation } = await mountAndStart();

    await startTranslation();
    port.emitMessage({
      type: 'error',
      result: { translatedText: '', error: 'fail', errorType: 'rate-limit' },
    });
    await wrapper.vm.$nextTick();

    const mainButton = actionButton(wrapper, '翻译');
    expect((mainButton.element as HTMLButtonElement).disabled).toBe(false);
    // 横幅位于译文区(主按钮之后),不推动主操作按钮位置
    const alert = wrapper.get('[role="alert"]');
    const pos = mainButton.element.compareDocumentPosition(alert.element);
    expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('有译文时可复制;复制成功按钮显示已复制并在稍后恢复', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    const port = createPopupPort();
    stubBrowser([port]);
    const { wrapper, startTranslation } = await mountAndStart();

    await startTranslation();
    port.emitMessage({ type: 'done', result: { translatedText: '你好' } });
    await flushPromises();

    const copy = wrapper.get('button[aria-label="复制"]');
    await copy.trigger('click');
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith('你好');

    expect(wrapper.find('button[aria-label="已复制 ✓"]').exists()).toBe(true);

    vi.advanceTimersByTime(2000);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('button[aria-label="已复制 ✓"]').exists()).toBe(false);
  });

  it('停止后保留的部分译文同样可复制', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    const port = createPopupPort();
    stubBrowser([port]);
    const { wrapper, startTranslation } = await mountAndStart();

    await startTranslation();
    port.emitMessage({ type: 'chunk', deltaText: '你好' });
    await actionButton(wrapper, '停止').trigger('click');
    await wrapper.vm.$nextTick();

    const copy = wrapper.get('button[aria-label="复制"]');
    await copy.trigger('click');
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith('你好');
  });

  it('无译文(idle)时不显示复制按钮', async () => {
    const port = createPopupPort();
    stubBrowser([port]);
    const { wrapper } = await mountAndStart();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('button[aria-label="复制"]').exists()).toBe(false);
  });

  it('流式失败后保留部分译文并允许复制', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    const port = createPopupPort();
    stubBrowser([port]);
    const { wrapper, startTranslation } = await mountAndStart();
    await startTranslation();
    port.emitMessage({ type: 'chunk', deltaText: '部分译文' });
    port.emitMessage({
      type: 'error',
      result: { translatedText: '', error: 'fail', errorType: 'network' },
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('部分译文');
    await wrapper.get('button[aria-label="复制"]').trigger('click');
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith('部分译文');
  });

  it('未配置翻译源时错误操作进入 popup 设置页', async () => {
    const port = createPopupPort();
    stubBrowser([port]);
    const { wrapper, startTranslation } = await mountAndStart();
    await startTranslation();
    port.emitMessage({
      type: 'error',
      result: { translatedText: '', error: 'fail', errorType: 'no-config' },
    });
    await wrapper.vm.$nextTick();

    await actionButton(wrapper, '打开设置').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="combobox"][aria-label="默认目标语言"]').exists()).toBe(true);
  });

  // #88：unsupported-lang 错误提供「更换语言」入口，点击聚焦目标语言选择器；同时保留「重试」。
  it('unsupported-lang 错误展示「更换语言」+「重试」两个入口，「更换语言」聚焦选择器', async () => {
    const port = createPopupPort();
    stubBrowser([port]);
    const { wrapper, startTranslation } = await mountAndStart({ attachTo: document.body });
    await startTranslation();
    port.emitMessage({
      type: 'error',
      result: { translatedText: '', error: 'fail', errorType: 'unsupported-lang' },
    });
    await wrapper.vm.$nextTick();

    const banner = wrapper.find('[role="alert"]');
    expect(banner.text()).toContain('翻译源不支持该目标语言');
    const buttons = banner.findAll('button');
    // unsupported-lang 仅提供「更换语言」（重试会用相同语言复现同一错误，故不展示）
    expect(buttons).toHaveLength(1);
    expect(buttons[0].text()).toContain('更换语言');

    await buttons[0].trigger('click');
    // 「更换语言」聚焦目标语言选择器的触发按钮（LanguageSelect.focusTrigger）
    const trigger = wrapper.get('button[role="combobox"][aria-label="目标语言"]');
    expect(document.activeElement).toBe(trigger.element);
  });
});
