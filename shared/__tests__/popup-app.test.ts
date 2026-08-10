// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamPortMessage } from '@/shared/types';
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
