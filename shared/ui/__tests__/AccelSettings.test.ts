// @vitest-environment jsdom
// AccelSettings 单元测试（#92）：默认关闭、官方端点、第三方 URL 需确认、连通测试。
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AccelSettings from '@/shared/ui/AccelSettings.vue';
import { OFFICIAL_ACCEL_ENDPOINT } from '@/shared/accel';
import type { Settings } from '@/shared/types';

const getSettings = vi.fn();
const setSettings = vi.fn();
const getConfirmedAccelUrl = vi.fn();
const setConfirmedAccelUrl = vi.fn();

vi.mock('@/shared/storage', () => ({
  getSettings: (...a: unknown[]) => getSettings(...a),
  setSettings: (...a: unknown[]) => setSettings(...a),
  getConfirmedAccelUrl: (...a: unknown[]) => getConfirmedAccelUrl(...a),
  setConfirmedAccelUrl: (...a: unknown[]) => setConfirmedAccelUrl(...a),
}));

const baseSettings = (over: Partial<Settings> = {}): Settings => ({
  activeProviderId: null,
  defaultTargetLang: 'zh-CN',
  ...over,
});

function lastSettingsCall(): Settings {
  const calls = setSettings.mock.calls;
  return calls[calls.length - 1]![0] as Settings;
}

beforeEach(() => {
  getSettings.mockReset();
  setSettings.mockReset();
  getConfirmedAccelUrl.mockReset();
  setConfirmedAccelUrl.mockReset();
  getSettings.mockResolvedValue(baseSettings());
  getConfirmedAccelUrl.mockResolvedValue(null);
});

describe('默认状态', () => {
  it('默认「不使用加速」，不写入端点', async () => {
    const w = mount(AccelSettings);
    await flushPromises();
    expect(w.find('[data-testid="accel-official"]').exists()).toBe(true);
    expect(setSettings).not.toHaveBeenCalled();
  });

  it('存量设置无 accel 字段时也不报错', async () => {
    getSettings.mockResolvedValue({ activeProviderId: null, defaultTargetLang: 'zh-CN' } as Settings);
    const w = mount(AccelSettings);
    await flushPromises();
    expect(w.find('[data-testid="accel-custom"]').exists()).toBe(true);
  });
});

describe('官方节点', () => {
  it('选官方 → 写入官方 URL 且无需确认', async () => {
    const w = mount(AccelSettings);
    await flushPromises();

    await w.find('[data-testid="accel-official"]').setValue(true);
    await flushPromises();

    expect(lastSettingsCall().accelEndpoint).toBe(OFFICIAL_ACCEL_ENDPOINT);
    // 官方属项目方服务，不应出现第三方确认块
    expect(w.find('[data-testid="accel-confirm"]').exists()).toBe(false);
    expect(setConfirmedAccelUrl).not.toHaveBeenCalled();
  });

  it('已存官方 URL 时回显为选中态', async () => {
    getSettings.mockResolvedValue(baseSettings({ accelEndpoint: OFFICIAL_ACCEL_ENDPOINT }));
    const w = mount(AccelSettings);
    await flushPromises();
    const radio = w.find('[data-testid="accel-official"]').element as HTMLInputElement;
    expect(radio.checked).toBe(true);
  });
});

describe('第三方 URL 的知情确认', () => {
  it('填入第三方 URL → 显示确认块且不立即生效', async () => {
    const w = mount(AccelSettings);
    await flushPromises();

    await w.find('[data-testid="accel-custom"]').setValue(true);
    await flushPromises();
    await w.find('[data-testid="accel-custom-url"]').setValue('https://my-accel.example.com');
    await flushPromises();

    // 确认块出现
    expect(w.find('[data-testid="accel-confirm"]').exists()).toBe(true);
    // 未确认前不写入第三方端点
    expect(lastSettingsCall().accelEndpoint).toBeNull();
  });

  it('点「我已了解，启用」→ 记录确认并写入端点', async () => {
    const w = mount(AccelSettings);
    await flushPromises();
    await w.find('[data-testid="accel-custom"]').setValue(true);
    await flushPromises();
    await w.find('[data-testid="accel-custom-url"]').setValue('https://my-accel.example.com');
    await flushPromises();

    await w.find('[data-testid="accel-confirm-accept"]').trigger('click');
    await flushPromises();

    expect(setConfirmedAccelUrl).toHaveBeenCalledWith('https://my-accel.example.com');
    expect(lastSettingsCall().accelEndpoint).toBe('https://my-accel.example.com');
    expect(w.find('[data-testid="accel-confirm"]').exists()).toBe(false);
  });

  it('已确认过的 URL → 直接生效，不再要求确认', async () => {
    getConfirmedAccelUrl.mockResolvedValue('https://my-accel.example.com');
    getSettings.mockResolvedValue(
      baseSettings({ accelEndpoint: 'https://my-accel.example.com' }),
    );
    const w = mount(AccelSettings);
    await flushPromises();
    expect(w.find('[data-testid="accel-confirm"]').exists()).toBe(false);
  });

  it('换域名 → 需重新确认（旧确认记录只认旧 URL）', async () => {
    const OLD_URL = 'https://old.example.com';
    // 只认旧域名
    getConfirmedAccelUrl.mockResolvedValue(OLD_URL);
    getSettings.mockResolvedValue(baseSettings({ accelEndpoint: OLD_URL }));
    const w = mount(AccelSettings);
    await flushPromises();
    // 旧域名已确认 → 直接生效，无确认块
    expect(w.find('[data-testid="accel-confirm"]').exists()).toBe(false);

    // 改为新域名：旧确认记录不适用 → 要求重新确认
    await w.find('[data-testid="accel-custom-url"]').setValue('https://new.example.com');
    await flushPromises();
    expect(w.find('[data-testid="accel-confirm"]').exists()).toBe(true);
    expect(lastSettingsCall().accelEndpoint).toBeNull();
  });

  it('非法 URL → 提示且不写入', async () => {
    const w = mount(AccelSettings);
    await flushPromises();
    await w.find('[data-testid="accel-custom"]').setValue(true);
    await flushPromises();
    await w.find('[data-testid="accel-custom-url"]').setValue('not-a-url');
    await flushPromises();
    expect(w.text()).toContain('请输入 http(s) 开头的完整地址');
    expect(lastSettingsCall().accelEndpoint).toBeNull();
  });
});

describe('关闭加速', () => {
  it('切回「不使用」→ 端点清空', async () => {
    getSettings.mockResolvedValue(baseSettings({ accelEndpoint: OFFICIAL_ACCEL_ENDPOINT }));
    const w = mount(AccelSettings);
    await flushPromises();
    expect((w.find('[data-testid="accel-official"]').element as HTMLInputElement).checked).toBe(true);

    const off = w.findAll('input[name="accel-mode"]').find((r) => r.element.value === 'off')!;
    await off.setValue(true);
    await flushPromises();
    expect(lastSettingsCall().accelEndpoint).toBeNull();
  });

  it('第三方 URL 未确认时切回「不使用」→ 隐藏确认块且保持端点为空', async () => {
    const w = mount(AccelSettings);
    await flushPromises();
    await w.find('[data-testid="accel-custom"]').setValue(true);
    await flushPromises();
    await w.find('[data-testid="accel-custom-url"]').setValue('https://my-accel.example.com');
    await flushPromises();
    expect(w.find('[data-testid="accel-confirm"]').exists()).toBe(true);

    const off = w.findAll('input[name="accel-mode"]').find((r) => r.element.value === 'off')!;
    await off.setValue(true);
    await flushPromises();

    expect(w.find('[data-testid="accel-confirm"]').exists()).toBe(false);
    expect(lastSettingsCall().accelEndpoint).toBeNull();
  });
});

describe('加速范围', () => {
  it('默认 builtin', async () => {
    const w = mount(AccelSettings);
    await flushPromises();
    await w.find('[data-testid="accel-official"]').setValue(true);
    await flushPromises();
    expect(lastSettingsCall().accelScope).toBe('builtin');
  });

  it('选「所有翻译源」→ scope=all', async () => {
    const w = mount(AccelSettings);
    await flushPromises();
    await w.find('[data-testid="accel-official"]').setValue(true);
    await flushPromises();
    await w.find('[data-testid="accel-scope-all"]').setValue(true);
    await flushPromises();
    expect(lastSettingsCall().accelScope).toBe('all');
  });

  it('从「所有翻译源」切回「仅免 Key 翻译源」→ scope=builtin', async () => {
    getSettings.mockResolvedValue(baseSettings({
      accelEndpoint: OFFICIAL_ACCEL_ENDPOINT,
      accelScope: 'all',
    }));
    const w = mount(AccelSettings);
    await flushPromises();

    await w.find('[data-testid="accel-scope-builtin"]').setValue(true);
    await flushPromises();

    expect(lastSettingsCall().accelScope).toBe('builtin');
    expect((w.find('[data-testid="accel-scope-builtin"]').element as HTMLInputElement).checked)
      .toBe(true);
  });
});

describe('测试连通', () => {
  it('redis ok → 提示连接正常', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ status: 'ok', version: '0.1.0', redis: 'ok' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const w = mount(AccelSettings);
    await flushPromises();
    await w.find('[data-testid="accel-official"]').setValue(true);
    await flushPromises();
    await w.find('[data-testid="accel-test"]').trigger('click');
    await flushPromises();

    expect(w.find('[data-testid="accel-test-msg"]').text()).toContain('连接正常');
    expect(fetchMock.mock.calls[0]![0]).toBe(`${OFFICIAL_ACCEL_ENDPOINT}/healthz`);
    vi.unstubAllGlobals();
  });

  it('redis down → 区分「缓存未就绪」', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ status: 'degraded', version: '0.1.0', redis: 'down' }), { status: 503 })) as never);

    const w = mount(AccelSettings);
    await flushPromises();
    await w.find('[data-testid="accel-official"]').setValue(true);
    await flushPromises();
    await w.find('[data-testid="accel-test"]').trigger('click');
    await flushPromises();

    expect(w.find('[data-testid="accel-test-msg"]').text()).toContain('缓存');
    vi.unstubAllGlobals();
  });

  it('不可达 → 提示无法连接', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('Failed to fetch');
    }) as never);

    const w = mount(AccelSettings);
    await flushPromises();
    await w.find('[data-testid="accel-official"]').setValue(true);
    await flushPromises();
    await w.find('[data-testid="accel-test"]').trigger('click');
    await flushPromises();

    expect(w.find('[data-testid="accel-test-msg"]').text()).toContain('无法连接');
    vi.unstubAllGlobals();
  });
});
