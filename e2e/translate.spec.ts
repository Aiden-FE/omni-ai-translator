// 划词翻译全链路 e2e 测试
import { test, expect } from './fixtures';
import { startMockServer, getLastRequestBody } from './mock-server';
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
  // BaseURL 需填完整接口路径(契约变更后代码不再追加 path)
  await card.getByTestId('base-url').fill(`${mockUrl}/v1/chat/completions`);
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

test('配置的默认目标语言生效,prompt 使用用户配置值', async ({ context, extensionId }) => {
  // 1. 在 options 页配置默认目标语言为「简体中文」,并配置 mock 提供方
  const optionsPage = await context.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);

  // 设置默认目标语言(填后点击其它元素触发 change 保存)
  await optionsPage.getByPlaceholder('留空则使用浏览器首选语言').fill('简体中文');
  await optionsPage.getByRole('button', { name: '+ 添加提供方' }).click();

  const cards = optionsPage.locator('.provider-card');
  const card = cards.last();
  await card.locator('input[placeholder="名称"]').fill('mock-lang');
  await card.getByTestId('base-url').fill(`${mockUrl}/v1/chat/completions`);
  await card.locator('input[placeholder="模型名"]').fill('mock-model');
  await card.getByRole('button', { name: '启用' }).click();
  await optionsPage.close();

  // 2. 打开测试页,选中 "Hello world" 并翻译
  const page = await context.newPage();
  await page.goto(testPageUrl);
  const selectable = page.locator('#selectable');
  await selectable.waitFor();
  await selectable.selectText();
  await page.mouse.up();

  const trigger = page.locator('.llm-translator-trigger');
  await expect(trigger).toBeVisible({ timeout: 5_000 });
  await trigger.click();

  const panel = page.locator('.llm-translator-panel');
  await expect(panel).toBeVisible({ timeout: 15_000 });

  // 3. 断言 mock server 收到的 prompt 包含用户配置的目标语言
  const body = getLastRequestBody() as {
    messages?: Array<{ content?: string }>;
  } | null;
  const prompt = body?.messages?.[0]?.content ?? '';
  expect(prompt).toContain('into 简体中文');
});

