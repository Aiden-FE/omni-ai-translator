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
  getRequestCount,
  getCapturedBatchRequests,
  resetRequestCount,
} from './mock-server';
import path from 'node:path';
import type { BrowserContext } from '@playwright/test';
import type { ProviderConfig, Settings } from '../shared/types';

let mockUrl = '';
let mockServer: { close: () => Promise<void> } | null = null;
const CHAT_ROUTE = '/v1/chat/completions';
const fullpageTestPageUrl = `file://${path.resolve(process.cwd(), 'e2e/fixtures/fullpage-test-page.html')}`;

test.beforeAll(async () => {
  mockServer = await startMockServer();
  mockUrl = mockServer.url;
});

test.afterAll(async () => {
  await mockServer?.close();
});

test.afterEach(() => {
  resetAccelState();
  resetRequestCount();
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

/** 与 fullpage.spec.ts 相同的触发方式：绕过原生右键菜单，直发 BackgroundCommand。 */
async function triggerFullpageTranslate(context: BrowserContext): Promise<void> {
  const worker = context.serviceWorkers().find((sw) => sw.url().includes('background'))
    ?? await context.waitForEvent('serviceworker', {
      predicate: (sw) => sw.url().includes('background'),
      timeout: 10_000,
    });
  await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    const results = await Promise.allSettled(
      tabs.map((tab) =>
        tab.id === undefined
          ? Promise.reject(new Error('tab without id'))
          : chrome.tabs.sendMessage(tab.id, { type: 'fullpage-translate', mode: 'replace' }),
      ),
    );
    if (!results.some((result) => result.status === 'fulfilled')) {
      throw new Error('fullpage accel e2e: no tab consumed the command');
    }
  });
}

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
  expect(getRequestCount(CHAT_ROUTE)).toBe(0);
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

test('全文批量部分命中 → 命中段零等待渲染，未命中段单独发 LLM', async ({ context, extensionId }) => {
  setAccelCache({ 'Cached paragraph||简体中文': '缓存段落译文' });
  const provider = mockProvider('accel-fullpage-mock');
  await seedExtensionStorage(context, [provider], {
    ...accelSettings(provider.id),
    defaultTargetLang: '简体中文',
  });

  const page = await context.newPage();
  await page.goto(fullpageTestPageUrl);
  await page.locator('#para-1').waitFor();
  await page.evaluate(() => {
    document.body.replaceChildren();
    const cached = document.createElement('p');
    cached.id = 'accel-cached';
    cached.textContent = 'Cached paragraph';
    const uncached = document.createElement('p');
    uncached.id = 'accel-uncached';
    uncached.textContent = 'Uncached paragraph';
    document.body.append(cached, uncached);
  });

  await triggerFullpageTranslate(context);

  await expect(page.locator('#accel-cached')).toHaveText('缓存段落译文', { timeout: 15_000 });
  await expect(page.locator('#accel-uncached')).toHaveText(MOCK_TRANSLATION, { timeout: 15_000 });
  expect(getAccelRequestCount('lookup')).toBeGreaterThan(0);

  const requests = getCapturedBatchRequests();
  expect(requests).toHaveLength(1);
  expect(requests[0]!.chunks.map((chunk) => chunk.parts.map((part) => part.text))).toEqual([
    ['Uncached paragraph'],
  ]);
});
