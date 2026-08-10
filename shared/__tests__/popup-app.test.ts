// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ErrorType, StreamPortMessage } from '@/shared/types';
import LanguageSelect from '@/shared/ui/components/language-select/LanguageSelect.vue';
import App from '@/entrypoints/popup/App.vue';

vi.mock('@/shared/storage', () => ({
  getSettings: vi.fn().mockResolvedValue({
    activeProviderId: null,
    defaultTargetLang: 'zh-CN',
  }),
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

describe('popup stream session lifecycle', () => {
  const wrappers: VueWrapper[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it('忽略旧 port 延迟到达的断开事件', async () => {
    const first = createPopupPort();
    const second = createPopupPort();
    const ports = [first, second];
    vi.stubGlobal('browser', {
      runtime: {
        connect: vi.fn(() => ports.shift()!.port),
        openOptionsPage: vi.fn(),
      },
    });
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

// #80：错误差异化展示（ErrorType → errorFeedback 文案）、重试触发、复制译文反馈
describe('popup 错误横幅 / 重试 / 复制译文 (#80)', () => {
  const wrappers: VueWrapper[] = [];

  function stubBrowser(ports: PopupPortHarness[]) {
    const queue = [...ports];
    vi.stubGlobal('browser', {
      runtime: {
        connect: vi.fn(() => queue.shift()!.port),
        openOptionsPage: vi.fn(),
      },
    });
  }

  async function mountAndStart(): Promise<{
    wrapper: VueWrapper;
    startTranslation: () => Promise<void>;
  }> {
    const wrapper = mount(App);
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

  const allTypes: ErrorType[] = ['no-config', 'network', 'rate-limit', 'unreachable'];

  // 四类 ErrorType 的期望文案(独立于被测组件:取自规格约定的四类互斥文案)
  const expectedBanner: Record<ErrorType, { main: string; guidance: string }> = {
    'no-config': { main: '未配置可用翻译源', guidance: '请在配置页选择或添加源' },
    network: { main: '翻译请求失败', guidance: '请检查网络或源地址' },
    'rate-limit': { main: '翻译源繁忙（限流）', guidance: '请稍后再试或在配置页切换源' },
    unreachable: { main: '翻译源不可达', guidance: '请在配置页切换到其它源' },
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

  it('四类 ErrorType 展示文案互不相同', () => {
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

    const copy = wrapper.findAll('button').find((b) => b.text().includes('复制'));
    expect(copy).toBeDefined();
    await copy!.trigger('click');
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith('你好');

    const copied = wrapper.findAll('button').find((b) => b.text().includes('已复制'));
    expect(copied).toBeDefined();

    vi.advanceTimersByTime(2000);
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('button').some((b) => b.text().includes('已复制'))).toBe(false);
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

    const copy = wrapper.findAll('button').find((b) => b.text().includes('复制'));
    expect(copy).toBeDefined();
    await copy!.trigger('click');
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith('你好');
  });

  it('无译文(idle)时不显示复制按钮', async () => {
    const port = createPopupPort();
    stubBrowser([port]);
    const { wrapper } = await mountAndStart();
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('button').some((b) => b.text().includes('复制'))).toBe(false);
  });
});
