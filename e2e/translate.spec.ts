// 划词翻译全链路 e2e 测试
import { test, expect } from './fixtures';
import { startMockServer } from './mock-server';
import path from 'node:path';

const testPageUrl = `file://${path.resolve(process.cwd(), 'e2e/fixtures/test-page.html')}`;

let mockUrl = '';
let mockServer: { close: () => Promise<void> } | null = null;

test.beforeAll(async () => {
  mockServer = await startMockServer();
  mockUrl = mockServer.url;
});

test.afterAll(async () => {
  await mockServer?.close();
});

test('划词后出现触发按钮,点击后浮层展示 mock 译文', async ({ context, extensionId }) => {
  // 1. 通过 options 页配置 mock server 为 LLM 提供方并启用
  const optionsPage = await context.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);

  // 添加一个 OpenAI 兼容提供方
  await optionsPage.getByRole('button', { name: '+ 添加提供方' }).click();

  // 填写配置(最后一张卡片)
  const cards = optionsPage.locator('.provider-card');
  const card = cards.last();
  await card.locator('input[placeholder="名称"]').fill('mock');
  await card.locator('input[placeholder="BaseURL"]').fill(mockUrl);
  await card.locator('input[placeholder="模型名"]').fill('mock-model');

  // 启用该提供方
  await card.getByRole('button', { name: '启用' }).click();

  // 关闭 options 页
  await optionsPage.close();

  // 2. 打开测试页,选中 "Hello world"
  const page = await context.newPage();
  await page.goto(testPageUrl);

  const selectable = page.locator('#selectable');
  await selectable.waitFor();

  // 选中整段文本
  await selectable.selectText();

  // 触发 mouseup(content script 监听 mouseup)
  await page.mouse.up();

  // 3. 断言触发按钮出现
  const trigger = page.locator('.llm-translator-trigger');
  await expect(trigger).toBeVisible({ timeout: 5_000 });

  // 4. 点击触发按钮,等待译文浮层
  await trigger.click();
  const panel = page.locator('.llm-translator-panel');
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(panel).toContainText('你好,世界');
});
