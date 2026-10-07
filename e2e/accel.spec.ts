// 翻译加速 E2E 覆盖（#92 / #93）
//
// 覆盖验收标准：
// - 加速命中：popup 文本翻译直接用缓存译文，不发 LLM 请求
// - 加速未命中：照常发 LLM 请求并展示译文
// - fail-open：加速 lookup 故障时翻译照常成功（用户无感知）
// - 未配置端点：行为与启用加速前一致
//
// mock：e2e/mock-server.ts 同时扮演 LLM 端点与加速节点（/v1/cache/*、/healthz）。
// 加速端点用 scope='all' + 自有 LLM 源，才能让自有源走加速（默认 scope='builtin'
// 只覆盖免 Key 内置源）。
import { test, expect, seedExtensionStorage, openPopup } from './fixtures';
import {
  startMockServer,
  setAccelCache,
  setAccelFailLookup,
  resetAccelState,
  getAccelRequestCount,
} from './mock-server';
import type { ProviderConfig, Settings } from '../shared/types';

let mockUrl = '';
let mockServer: { close: () => Promise<void> } | null = null;

test.beforeAll(async () => {
  mockServer = await startMockServer();
  mockUrl = mockServer.url;
});

test.afterAll(async () => {
  await mockServer?.close();
});

test.afterEach(() => {
  resetAccelState();
});

function mockProvider(id = 'accel-mock'): ProviderConfig {
  return {
    id,
    name: id,
    type: 'llm',
    category: 'llm',
    baseUrl: `${mockUrl}/v1`,
    model: 'mock-model',
    responseStyle: 'openai-completions',
  };
}

/** scope='all'：自有源也走加速（自有源需显式开启，见 CONTEXT.md §3.14） */
function accelSettings(providerId: string): Settings {
  return {
    activeProviderId: providerId,
    defaultTargetLang: 'zh-CN',
    accelEndpoint: mockUrl,
    accelScope: 'all',
  };
}

const MOCK_TRANSLATION = '你好,世界';

test('加速命中 → 直接展示缓存译文，不发 LLM 请求', async ({ context, extensionId }) => {
  // 预置缓存：原文经 NFKC+trim+折叠空白 后与 'Hello world' 相同
  setAccelCache({ 'Hello world||zh-cn': '缓存里的译文' });

  await seedExtensionStorage(context, [mockProvider()], accelSettings('accel-mock'));
  const popup = await openPopup(context, extensionId);

  await popup.getByRole('textbox', { name: '原文输入区' }).fill('Hello world');
  await popup.getByRole('button', { name: '翻译' }).click();

  // 命中：一次性展示完整缓存译文
  const translationSection = popup.getByLabel('译文');
  await expect(translationSection).toContainText('缓存里的译文', { timeout: 15_000 });

  // 断言确实查了缓存
  expect(getAccelRequestCount('lookup')).toBeGreaterThan(0);
});

test('加速未命中 → 照常调用 LLM 翻译', async ({ context, extensionId }) => {
  setAccelCache({}); // 空缓存 → 全未命中
  await seedExtensionStorage(context, [mockProvider()], accelSettings('accel-mock'));
  const popup = await openPopup(context, extensionId);

  await popup.getByRole('textbox', { name: '原文输入区' }).fill('Hello world');
  await popup.getByRole('button', { name: '翻译' }).click();

  await expect(popup.getByLabel('译文')).toContainText(MOCK_TRANSLATION, { timeout: 15_000 });
  expect(getAccelRequestCount('lookup')).toBeGreaterThan(0);
});

test('fail-open：加速 lookup 500 → 翻译照常成功，用户无感知', async ({ context, extensionId }) => {
  setAccelFailLookup(true);
  await seedExtensionStorage(context, [mockProvider()], accelSettings('accel-mock'));
  const popup = await openPopup(context, extensionId);

  await popup.getByRole('textbox', { name: '原文输入区' }).fill('Hello world');
  await popup.getByRole('button', { name: '翻译' }).click();

  // 关键：加速挂了不影响翻译结果
  await expect(popup.getByLabel('译文')).toContainText(MOCK_TRANSLATION, { timeout: 15_000 });
  // 也没有向用户暴露加速相关错误
  await expect(popup.getByRole('alert')).toHaveCount(0);
});

test('未配置加速端点 → 不查询缓存', async ({ context, extensionId }) => {
  await seedExtensionStorage(context, [mockProvider()], {
    activeProviderId: 'accel-mock',
    defaultTargetLang: 'zh-CN',
  } as Settings);
  const popup = await openPopup(context, extensionId);

  await popup.getByRole('textbox', { name: '原文输入区' }).fill('Hello world');
  await popup.getByRole('button', { name: '翻译' }).click();

  await expect(popup.getByLabel('译文')).toContainText(MOCK_TRANSLATION, { timeout: 15_000 });
  expect(getAccelRequestCount('lookup')).toBe(0);
});
