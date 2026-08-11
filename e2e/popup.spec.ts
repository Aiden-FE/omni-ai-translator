// popup 文本翻译 E2E 覆盖(#82)
// 父工单 #76;依赖 #79(流式与停止)/#80(错误差异化与重试)/#81(设置往返)已 CLOSED。
//
// 覆盖验收标准:
// - 新增/扩展 popup 夹具:openPopup + seedExtensionStorage(见 fixtures.ts)
// - 流式翻译主路径:输入原文 -> 翻译 -> 流式完成 -> 译文展示与复制
// - 语言选择器搜索与临时目标语言选择,且翻译请求目标语言随之变化
// - mock 错误响应 -> 错误横幅 -> 重试成功
//
// 触发通道:在已加载扩展的持久化上下文中以页签形式打开 popup.html,与真实 popup
// 共享同一 service worker 与 storage;生效源经 service worker 直写 storage 种子
// (绕过 options UI,更快且不依赖组件交互时序)。mock 服务复用 e2e/mock-server.ts。
import { test, expect, seedExtensionStorage, openPopup } from './fixtures';
import {
  startMockServer,
  getLastRequestBody,
  setFailMode,
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
  // 失败开关用后复位,防泄漏到后续用例(关键约定,与 fullpage.spec.ts 一致)
  setFailMode(false);
});

/** mock 固定流式译文(mock-server.ts:STREAM_CHUNKS = ['你','好',',世界']) */
const MOCK_TRANSLATION = '你好,世界';

/** 构造指向 mock server 的 OpenAI 兼容 LLM 提供方(baseUrl 为协议根,适配层补全 /chat/completions) */
function mockProvider(id = 'popup-mock'): ProviderConfig {
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

/** 构造已启用该生效源的 settings */
function mockSettings(providerId: string, defaultTargetLang = ''): Settings {
  return {
    activeProviderId: providerId,
    defaultTargetLang,
  };
}

test('输入原文 -> 流式翻译完成 -> 译文展示与复制', async ({ context, extensionId }) => {
  await seedExtensionStorage(context, [mockProvider()], mockSettings('popup-mock'));

  const popup = await openPopup(context, extensionId);

  // 输入原文
  const source = popup.getByRole('textbox', { name: '原文输入区' });
  await source.fill('Hello world');
  await expect(popup.getByText('11 / 5000')).toBeVisible();

  // 主操作按钮:翻译
  await popup.getByRole('button', { name: '翻译' }).click();

  // 流式进行中:主按钮变为停止,原文区锁定
  await expect(popup.getByRole('button', { name: '停止' })).toBeVisible({ timeout: 5_000 });
  await expect(source).toBeDisabled();

  // 流式结束后译文完整展示,已完成状态可见
  const translationSection = popup.getByLabel('译文');
  await expect(translationSection).toContainText(MOCK_TRANSLATION, { timeout: 15_000 });
  await expect(popup.getByText('已完成')).toBeVisible();

  // 复制译文:点击复制按钮 -> 短暂「已复制 ✓」反馈。
  // 「已复制 ✓」仅在 navigator.clipboard.writeText 成功后置位(失败时早返回保持原状),
  // 故该反馈可见即证明剪贴板写入成功;扩展页无 clipboardRead 权限,不直接读剪贴板。
  const copyButton = popup.getByRole('button', { name: '复制' });
  await copyButton.click();
  await expect(popup.getByRole('button', { name: '已复制 ✓' })).toBeVisible({ timeout: 3_000 });
});

test('语言选择器搜索并选择临时目标语言,翻译请求目标语言随之变化', async ({
  context,
  extensionId,
}) => {
  await seedExtensionStorage(context, [mockProvider()], mockSettings('popup-mock'));

  const popup = await openPopup(context, extensionId);

  // 选择临时目标语言:日语。打开下拉,搜索「日语」选中
  const langTrigger = popup.getByRole('combobox', { name: '目标语言' });
  await langTrigger.click();
  const searchBox = popup.getByRole('searchbox', { name: '搜索语言' });
  await searchBox.fill('日语');
  await popup.getByRole('option', { name: /日语.*日本語.*ja/ }).click();

  // 触发按钮展示已选临时目标语言
  await expect(langTrigger).toContainText('ja');

  // 翻译:断言请求 prompt 目标语言变为 ja
  await popup.getByRole('textbox', { name: '原文输入区' }).fill('Hello world');
  await popup.getByRole('button', { name: '翻译' }).click();

  // 等待译文完成(确保请求已发出并被 mock 捕获)
  await expect(popup.getByLabel('译文')).toContainText(MOCK_TRANSLATION, { timeout: 15_000 });

  const body = getLastRequestBody() as { messages?: Array<{ content?: string }> } | null;
  const prompt = body?.messages?.[0]?.content ?? '';
  expect(prompt).toContain('into ja');
});

test('mock 错误响应 -> 错误横幅 -> 重试成功', async ({ context, extensionId }) => {
  // 开启失败开关:含 __FAIL__ 标记的请求返回 500 -> errorType='unreachable'
  setFailMode(true);
  await seedExtensionStorage(context, [mockProvider()], mockSettings('popup-mock'));

  const popup = await openPopup(context, extensionId);

  // 原文含 __FAIL__ 标记触发 mock 失败
  await popup.getByRole('textbox', { name: '原文输入区' }).fill('Hello __FAIL__ world');
  await popup.getByRole('button', { name: '翻译' }).click();

  // 错误横幅出现:按 ErrorType=unreachable 差异化文案,带重试入口
  const errorBanner = popup.getByRole('alert');
  await expect(errorBanner).toBeVisible({ timeout: 10_000 });
  await expect(errorBanner).toContainText('翻译源不可达');
  const retryButton = popup.getByRole('button', { name: '重试' });
  await expect(retryButton).toBeVisible();

  // 主操作按钮位置不跳动:错误横幅在译文区内,翻译按钮仍在原文区与译文区之间
  await expect(popup.getByRole('button', { name: '翻译' })).toBeVisible();

  // 关闭失败开关后重试 -> 成功,译文展示
  setFailMode(false);
  await retryButton.click();

  // 重试进入流式,译文完成展示
  await expect(popup.getByLabel('译文')).toContainText(MOCK_TRANSLATION, { timeout: 15_000 });
  await expect(popup.getByText('已完成')).toBeVisible();
});
