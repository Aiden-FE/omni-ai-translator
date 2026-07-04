// 划词翻译全链路 e2e 测试
import { test, expect } from './fixtures';
import { startMockServer, getLastRequestBody, getLastRequestHeaders } from './mock-server';
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

test('microsoft 有 Key 源启用后,划词翻译落到官方端点并携带 region', async ({ context, extensionId }) => {
  // 1. 通过 options 页配置 microsoft 有 Key 提供方并启用
  const optionsPage = await context.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);

  await optionsPage.getByRole('button', { name: '+ 添加提供方' }).click();

  const cards = optionsPage.locator('.provider-card');
  const card = cards.last();
  await card.locator('input[placeholder="名称"]').fill('ms-key');
  // 切换为 microsoft 传统源（onTypeChange 会把 baseUrl 替换为官方默认值）
  await card.locator('select').selectOption('microsoft');
  // baseUrl 指向 mock server 的 microsoft translate 路由
  await card.getByTestId('base-url').fill(`${mockUrl}/translate`);
  // 填入 API Key（填入后 region 输入框出现）
  await card.locator('input[type="password"]').fill('test-ms-key');
  // 填入 region
  await card.getByTestId('region').fill('eastus');
  // 启用该提供方
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

  // 3. 断言译文浮层展示 mock 译文
  const panel = page.locator('.llm-translator-panel');
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(panel).toContainText('你好,世界');

  // 4. 断言请求落到 microsoft 官方端点（mock）并携带 Key 与 region header
  const headers = getLastRequestHeaders();
  expect(headers['ocp-apim-subscription-key']).toBe('test-ms-key');
  expect(headers['ocp-apim-subscription-region']).toBe('eastus');
});

test('anthropic 响应风格划词翻译落到 /v1/messages 并携带 x-api-key + anthropic-version', async ({ context, extensionId }) => {
  // 1. 通过 options 页配置 anthropic 风格提供方并启用
  const optionsPage = await context.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);

  await optionsPage.getByRole('button', { name: '+ 添加提供方' }).click();

  const cards = optionsPage.locator('.provider-card');
  const card = cards.last();
  await card.locator('input[placeholder="名称"]').fill('anthropic-mock');
  // BaseURL 指向 mock server 的 Anthropic /v1/messages 路由
  await card.getByTestId('base-url').fill(`${mockUrl}/v1/messages`);
  await card.locator('input[placeholder="模型名"]').fill('mock-model');
  // 选择 anthropic 响应风格
  await card.getByTestId('response-style').locator('input[type="radio"][value="anthropic"]').check();
  // 填入 API Key
  await card.locator('input[type="password"]').fill('test-anthropic-key');

  // 连通性测试（复用 test-provider 通道，覆盖 anthropic 风格）
  await card.getByRole('button', { name: '测试连通' }).click();
  await expect(card.locator('.test-msg')).toContainText('✅', { timeout: 5_000 });

  // 启用该提供方
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

  // 3. 断言译文浮层展示 mock 译文
  const panel = page.locator('.llm-translator-panel');
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(panel).toContainText('你好,世界');

  // 4. 断言请求落到 Anthropic /v1/messages 并携带 x-api-key + anthropic-version
  const headers = getLastRequestHeaders();
  expect(headers['x-api-key']).toBe('test-anthropic-key');
  expect(headers['anthropic-version']).toBe('2023-06-01');
  // 5. 断言请求体为 Anthropic 格式（max_tokens + 顶层 system + user message）
  const body = getLastRequestBody() as {
    system?: string;
    max_tokens?: number;
    messages?: Array<{ role?: string; content?: string }>;
  } | null;
  expect(body?.max_tokens).toBe(1024);
  expect(body?.system).toBeTruthy();
  expect(body?.messages?.[0]?.role).toBe('user');
});

test('OpenAI 流式翻译浮层渐进渲染译文', async ({ context, extensionId }) => {
  // 1. 配置 OpenAI 兼容提供方指向 mock server（stream 路径）
  const optionsPage = await context.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);

  await optionsPage.getByRole('button', { name: '+ 添加提供方' }).click();

  const cards = optionsPage.locator('.provider-card');
  const card = cards.last();
  await card.locator('input[placeholder="名称"]').fill('stream-mock');
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

  // 3. 等待浮层出现
  const panel = page.locator('.llm-translator-panel');
  await expect(panel).toBeVisible({ timeout: 15_000 });

  // 4. 流式渲染期间应出现光标元素（渐进渲染标志）
  const cursor = panel.locator('.llm-translator-cursor');
  await expect(cursor).toBeVisible({ timeout: 5_000 });

  // 5. 流式结束后光标消失,最终译文完整展示
  await expect(panel).toContainText('你好,世界', { timeout: 10_000 });
  await expect(cursor).not.toBeVisible({ timeout: 5_000 });
});

test('传统源(microsoft)划词翻译一次性返回译文', async ({ context, extensionId }) => {
  // 1. 配置 microsoft 有 Key 提供方指向 mock server（非流式回退路径）
  const optionsPage = await context.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);

  await optionsPage.getByRole('button', { name: '+ 添加提供方' }).click();

  const cards = optionsPage.locator('.provider-card');
  const card = cards.last();
  await card.locator('input[placeholder="名称"]').fill('ms-fallback');
  await card.locator('select').selectOption('microsoft');
  await card.getByTestId('base-url').fill(`${mockUrl}/translate`);
  await card.locator('input[type="password"]').fill('test-ms-key');
  await card.getByTestId('region').fill('eastus');
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

  // 3. 断言译文浮层展示 mock 译文（非流式回退一次性返回）
  const panel = page.locator('.llm-translator-panel');
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(panel).toContainText('你好,世界');

  // 4. 断言请求未走流式（microsoft 传统源回退,请求体为 array 格式,无 stream 字段）
  const body = getLastRequestBody();
  expect(Array.isArray(body)).toBe(true);
});

test('ollama 响应风格划词翻译落到 /api/chat 并返回 mock 译文', async ({ context, extensionId }) => {
  // 1. 通过 options 页配置 ollama 风格提供方并启用
  const optionsPage = await context.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);

  await optionsPage.getByRole('button', { name: '+ 添加提供方' }).click();

  const cards = optionsPage.locator('.provider-card');
  const card = cards.last();
  await card.locator('input[placeholder="名称"]').fill('ollama-mock');
  // BaseURL 指向 mock server 的 Ollama /api/chat 路由
  await card.getByTestId('base-url').fill(`${mockUrl}/api/chat`);
  await card.locator('input[placeholder="模型名"]').fill('mock-model');
  // 选择 ollama 响应风格
  await card.getByTestId('response-style').locator('input[type="radio"][value="ollama"]').check();

  // 连通性测试（复用 test-provider 通道，覆盖 ollama 风格）
  await card.getByRole('button', { name: '测试连通' }).click();
  await expect(card.locator('.test-msg')).toContainText('✅', { timeout: 5_000 });

  // 启用该提供方
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

  // 3. 断言译文浮层展示 mock 译文
  const panel = page.locator('.llm-translator-panel');
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(panel).toContainText('你好,世界');

  // 4. 断言请求体为 Ollama 格式（stream: true 流式翻译 + message.content 响应路径）
  const body = getLastRequestBody() as {
    model?: string;
    stream?: boolean;
    messages?: Array<{ content?: string }>;
  } | null;
  expect(body?.model).toBe('mock-model');
  expect(body?.stream).toBe(true);
  expect(body?.messages?.[0]?.content).toBeTruthy();
});

