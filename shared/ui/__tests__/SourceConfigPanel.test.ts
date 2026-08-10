// @vitest-environment jsdom
// SourceConfigPanel 设置读写单元测试（#81）：
// 默认目标语言复用共享目录 + LanguageSelect，选择即持久化；
// 翻译源切换复用 get-active-sources / set-active-source 生效源通道。
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SourceConfigPanel from '@/shared/ui/SourceConfigPanel.vue';
import type { Message } from '@/shared/types';

const getSettings = vi.fn();
const setSettings = vi.fn();
const getProviders = vi.fn();
const setProviders = vi.fn();

vi.mock('@/shared/storage', () => ({
  getSettings: (...args: unknown[]) => getSettings(...args),
  setSettings: (...args: unknown[]) => setSettings(...args),
  getProviders: (...args: unknown[]) => getProviders(...args),
  setProviders: (...args: unknown[]) => setProviders(...args),
}));

interface ProviderLike {
  id: string;
  name: string;
}

interface HarnessState {
  activeSourceId: string;
  defaultTargetLang: string;
  providers: ProviderLike[];
}

function setupHarness(options: Partial<HarnessState> = {}) {
  const state: HarnessState = {
    activeSourceId: options.activeSourceId ?? 'builtin:microsoft',
    defaultTargetLang: options.defaultTargetLang ?? '',
    providers: options.providers ?? [],
  };
  const sentMessages: Message[] = [];

  getSettings.mockImplementation(async () => ({
    activeProviderId: state.activeSourceId.startsWith('builtin:') ? null : state.activeSourceId,
    defaultTargetLang: state.defaultTargetLang,
  }));
  setSettings.mockImplementation(async (settings: { defaultTargetLang?: string }) => {
    state.defaultTargetLang = settings.defaultTargetLang ?? '';
  });
  getProviders.mockImplementation(async () => state.providers.map((p) => ({ ...p, type: 'llm' })));
  setProviders.mockResolvedValue(undefined);

  const sendMessage = vi.fn(async (message: Message) => {
    sentMessages.push(message);
    if (message.type === 'get-active-sources') {
      return {
        sources: [
          { id: 'builtin:microsoft', name: '微软翻译', type: 'microsoft' },
          { id: 'builtin:google', name: 'Google 翻译', type: 'google' },
          ...state.providers.map((p) => ({ id: p.id, name: p.name, type: 'llm' })),
        ],
        activeSourceId: state.activeSourceId,
      };
    }
    if (message.type === 'set-active-source') {
      state.activeSourceId = message.payload.id;
      return { ok: true };
    }
    throw new Error(`Unexpected message: ${(message as Message).type}`);
  });

  vi.stubGlobal('browser', { runtime: { sendMessage } });
  return { state, sentMessages };
}

async function mountPanel(variant: 'popup' | 'options' = 'options'): Promise<VueWrapper> {
  const wrapper = mount(SourceConfigPanel, {
    props: { variant },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

function languageTrigger(wrapper: VueWrapper) {
  const trigger = wrapper
    .findAll('button[role="combobox"]')
    .find((b) => b.attributes('aria-label') === '默认目标语言');
  if (!trigger) throw new Error('默认目标语言 LanguageSelect 未渲染');
  return trigger;
}

async function openLanguageDropdown(wrapper: VueWrapper) {
  await languageTrigger(wrapper).trigger('click');
}

const wrappers: VueWrapper[] = [];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.unstubAllGlobals();
});

describe('SourceConfigPanel — 默认目标语言(#81)', () => {
  it('复用 LanguageSelect 展示当前默认目标语言', async () => {
    setupHarness({ defaultTargetLang: 'ja' });
    const wrapper = await mountPanel('popup');
    wrappers.push(wrapper);
    const trigger = languageTrigger(wrapper);
    expect(trigger.text()).toContain('日语');
    expect(trigger.text()).toContain('ja');
  });

  it('未配置默认目标语言时展示「跟随浏览器语言」', async () => {
    setupHarness({ defaultTargetLang: '' });
    const wrapper = await mountPanel('popup');
    wrappers.push(wrapper);
    expect(languageTrigger(wrapper).text()).toContain('跟随浏览器语言');
  });

  it('历史遗留的未知目标语言值（旧版展示名）按跟随浏览器语言展示', async () => {
    setupHarness({ defaultTargetLang: 'English' });
    const wrapper = await mountPanel('popup');
    wrappers.push(wrapper);
    expect(languageTrigger(wrapper).text()).toContain('跟随浏览器语言');
  });

  it('选择语言即持久化（合并现有设置写入）', async () => {
    setupHarness({ defaultTargetLang: '' });
    const wrapper = await mountPanel('popup');
    wrappers.push(wrapper);

    await openLanguageDropdown(wrapper);
    await wrapper.find('[role="option"][data-code="ja"]').trigger('click');
    await flushPromises();

    expect(setSettings).toHaveBeenCalledTimes(1);
    expect(setSettings).toHaveBeenCalledWith(expect.objectContaining({ defaultTargetLang: 'ja' }));
    expect(languageTrigger(wrapper).text()).toContain('日语');
  });

  it('选择「跟随浏览器语言」持久化为空字符串', async () => {
    setupHarness({ defaultTargetLang: 'ja' });
    const wrapper = await mountPanel('popup');
    wrappers.push(wrapper);

    await openLanguageDropdown(wrapper);
    await wrapper.find('[role="option"][data-browser-default="true"]').trigger('click');
    await flushPromises();

    expect(setSettings).toHaveBeenCalledWith(expect.objectContaining({ defaultTargetLang: '' }));
    expect(languageTrigger(wrapper).text()).toContain('跟随浏览器语言');
  });
});

describe('SourceConfigPanel — 翻译源切换(#81)', () => {
  it('展示当前生效源（get-active-sources 通道）', async () => {
    setupHarness({
      activeSourceId: 'builtin:microsoft',
      providers: [{ id: 'p1', name: '我的 LLM' }],
    });
    const wrapper = await mountPanel('popup');
    wrappers.push(wrapper);
    expect(wrapper.text()).toContain('免 Key 兜底');
  });

  it('启用提供方经 set-active-source 持久化并刷新生效源', async () => {
    const { sentMessages } = setupHarness({
      activeSourceId: 'builtin:microsoft',
      providers: [{ id: 'p1', name: '我的 LLM' }],
    });
    const wrapper = await mountPanel('popup');
    wrappers.push(wrapper);

    await wrapper.findAll('button').find((b) => b.text() === '启用')!.trigger('click');
    await flushPromises();

    // 翻译源切换复用生效源通道并持久化
    expect(sentMessages).toContainEqual({ type: 'set-active-source', payload: { id: 'p1' } });

    // 面板重新加载后，生效源状态卡片应展示新启用的提供方
    const statusCard = wrapper.find('[role="status"]');
    expect(statusCard.attributes('aria-label')).toContain('我的 LLM');
    expect(statusCard.text()).toContain('我的 LLM');
  });
});
