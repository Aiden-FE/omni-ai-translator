// 全文翻译全链路 e2e 测试(v0.4.0)
// 触发通道:Playwright 无法操作原生右键菜单,经 service worker 直发 BackgroundCommand
// ({ type: 'fullpage-translate', mode })——与真实右键链路在 content script 侧汇合。
// 段清单(9 段,fixture 注释已实测):3 nav 链接(行内) + 4 正文段 + footer + #add-paragraph 按钮。
// 并发池 concurrency=3 + mock 300ms 非流式延迟 ⇒ 分 3 批 settle,支撑渐进渲染相对时序断言。
import { test, expect } from './fixtures';
import {
  startMockServer,
  getRequestCount,
  resetRequestCount,
  setFailMode,
} from './mock-server';
import path from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';

const testPageUrl = `file://${path.resolve(process.cwd(), 'e2e/fixtures/fullpage-test-page.html')}`;

/** mock 固定译文(非流式响应) */
const MOCK_TRANSLATION = '你好,世界';

/** 请求计数路由:本 spec 仅配置 OpenAI 兼容提供方 */
const CHAT_ROUTE = '/v1/chat/completions';

/** 首触发请求总数 = 9 段 × 1 请求(jsdom + collectSegments 实测 9 段,见 PLAN s1) */
const INITIAL_REQUEST_COUNT = 9;

const PARA1_ORIGINAL = 'The first paragraph describes a quiet morning in the small town.';
const PARA4_ORIGINAL = 'The final paragraph closes the story with a hopeful note about tomorrow.';
const PARA_FAIL_ORIGINAL =
  'This paragraph carries the __FAIL__ marker so the mock server can fail it on demand.';

let mockUrl = '';
let mockServer: { close: () => Promise<void> } | null = null;

test.beforeAll(async () => {
  mockServer = await startMockServer();
  mockUrl = mockServer.url;
});

test.afterAll(async () => {
  await mockServer?.close();
});

test.beforeEach(() => {
  // 计数断言与执行顺序/其它 spec 文件解耦(workers=1 单进程内模块状态共享)
  resetRequestCount();
});

test.afterEach(() => {
  // 失败开关用后复位,防泄漏到后续用例(关键约定)
  setFailMode(false);
});

/**
 * 通过 options 页配置 mock OpenAI 兼容提供方并启用(复用 translate.spec.ts 既有模式),
 * 随后关闭 options 页(避免 SW 触发时 chrome.tabs.query 误匹配)。
 */
async function configureMockProvider(context: BrowserContext, extensionId: string): Promise<void> {
  const optionsPage = await context.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);

  await optionsPage.getByRole('button', { name: '+ 添加提供方' }).click();

  // 填写配置(最后一张卡片)
  const card = optionsPage.locator('.provider-card').last();
  await card.locator('input[placeholder="名称"]').fill('fullpage-mock');
  // Chat Completions 使用协议根路径，由适配层补全 /chat/completions。
  await card.getByTestId('base-url').fill(`${mockUrl}/v1`);
  await card.locator('input[placeholder="模型名"]').fill('mock-model');

  // 启用该提供方(排他:成为唯一 active source)
  await card.getByRole('button', { name: '启用' }).click();

  await optionsPage.close();
}

/** 新开测试页并等待关键锚点渲染 */
async function openTestPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto(testPageUrl);
  await page.locator('#para-1').waitFor();
  return page;
}

/**
 * 经 service worker 直发 BackgroundCommand 触发全文翻译。
 *
 * 页签定位:扩展无 tabs 权限且 host_permissions 不含 file://,chrome.tabs.query 返回的
 * Tab.url/title 被剥离,无法按 URL 精确匹配——改为向全部页签广播:仅注入 fullpage
 * content script 的页签(file:// 测试页)注册了 onMessage 接收端,sendMessage 成功;
 * 其余页签无接收端 reject,吞掉。每用例独立 context 且仅一个测试页,广播确定送达唯一目标;
 * 0 送达说明 content script 未注入,抛错快失败。
 */
async function triggerFullpageTranslate(
  context: BrowserContext,
  mode: 'replace' | 'bilingual',
): Promise<void> {
  let sw = context.serviceWorkers().find((w) => w.url().includes('background'));
  if (!sw) {
    // SW 可能被回收,兜底等待唤醒(同 fixtures.ts 模式)
    sw = await context.waitForEvent('serviceworker', {
      predicate: (w) => w.url().includes('background'),
      timeout: 10_000,
    });
  }
  await sw.evaluate(async (m) => {
    const tabs = await chrome.tabs.query({});
    const results = await Promise.allSettled(
      tabs.map((t) =>
        t.id === undefined
          ? Promise.reject(new Error('tab without id'))
          : chrome.tabs.sendMessage(t.id, { type: 'fullpage-translate', mode: m }),
      ),
    );
    const delivered = results.filter((r) => r.status === 'fulfilled').length;
    if (delivered === 0) {
      throw new Error('fullpage e2e: no tab consumed the command (content script not injected?)');
    }
  }, mode);
}

/**
 * 等待「全部请求落盘」(替换模式):#para-4/footer/#add-paragraph 同属第 3 批,
 * 三者均渲染译文 ⇒ 第 3 批全部 settle ⇒ 此前批次更早完成 ⇒ 请求计数稳定。
 */
async function waitForReplaceSettled(page: Page): Promise<void> {
  await expect(page.locator('#para-4')).toHaveText(MOCK_TRANSLATION, { timeout: 15_000 });
  await expect(page.locator('footer')).toHaveText(MOCK_TRANSLATION, { timeout: 15_000 });
  await expect(page.locator('#add-paragraph')).toHaveText(MOCK_TRANSLATION, { timeout: 15_000 });
}

test('替换模式触发全文翻译,段落渐进渲染', async ({ context, extensionId }) => {
  await configureMockProvider(context, extensionId);
  const page = await openTestPage(context);
  await triggerFullpageTranslate(context, 'replace');

  // 首个 300ms 延迟响应返回前，全部分段已同步进入 loading，聚合进度从 0/9 开始。
  const loadingHosts = page.locator('.llm-translator-loading-host');
  const progress = page.locator('.llm-translator-toolbar-progress');
  await Promise.all([
    expect(loadingHosts).toHaveCount(INITIAL_REQUEST_COUNT),
    expect(progress).toContainText('全文翻译 0/9'),
  ]);

  // 相对时序断言:第 2 批的 #para-1 已译出时,第 3 批的 #para-4 仍是原文(依赖 mock 300ms 延迟)。
  // 第一条等待至译出即返回,第二条此刻立即命中原文;若时序被打破第二条会 polling 超时失败(自校验)。
  await expect(page.locator('#para-1')).toHaveText(MOCK_TRANSLATION, { timeout: 15_000 });
  await expect(page.locator('#para-4')).toHaveText(PARA4_ORIGINAL);

  // 最终全部段落含 mock 译文(4 正文段 + nav 链接 + footer + 按钮)
  await expect(page.locator('#para-2')).toHaveText(MOCK_TRANSLATION, { timeout: 15_000 });
  await expect(page.locator('#para-fail')).toHaveText(MOCK_TRANSLATION, { timeout: 15_000 });
  await expect(page.locator('#para-4')).toHaveText(MOCK_TRANSLATION, { timeout: 15_000 });
  await expect(page.locator('nav a').first()).toHaveText(MOCK_TRANSLATION);
  await expect(page.locator('footer')).toHaveText(MOCK_TRANSLATION);
  await expect(page.locator('#add-paragraph')).toHaveText(MOCK_TRANSLATION);
  await expect(progress).toContainText('全文翻译完成 9/9');
  await expect(loadingHosts).toHaveCount(0);

  // 工具栏出现(替换模式下切换按钮提示「切换为双语对照」)
  await expect(page.getByRole('button', { name: '切换为双语对照' })).toBeVisible();
});

test('双语对照模式保留原文并在段后渲染 shadow 译文块', async ({ context, extensionId }) => {
  await configureMockProvider(context, extensionId);
  const page = await openTestPage(context);
  await triggerFullpageTranslate(context, 'bilingual');

  // 9 段全部渲染译文块宿主(3 nav 链接 + 4 正文段 + footer + 按钮)
  const blockHosts = page.locator('.llm-translator-block-host');
  await expect(blockHosts).toHaveCount(9, { timeout: 15_000 });

  // 原文段落文本不变
  await expect(page.locator('#para-1')).toHaveText(PARA1_ORIGINAL);
  await expect(page.locator('#para-4')).toHaveText(PARA4_ORIGINAL);

  // 译文块宿主紧跟 #para-1,shadow 内含译文
  const host = page.locator('#para-1 + .llm-translator-block-host');
  await expect(host).toHaveCount(1);
  await expect
    .poll(() => host.evaluate((el) => el.shadowRoot?.textContent ?? ''), { timeout: 5_000 })
    .toContain(MOCK_TRANSLATION);
});

test('切换显示模式零重译:DOM 翻转且请求计数不变', async ({ context, extensionId }) => {
  await configureMockProvider(context, extensionId);
  const page = await openTestPage(context);
  await triggerFullpageTranslate(context, 'replace');
  await waitForReplaceSettled(page);

  const countBefore = getRequestCount(CHAT_ROUTE);
  expect(countBefore).toBe(INITIAL_REQUEST_COUNT);

  // 工具栏切换:replace → bilingual
  await page.getByRole('button', { name: '切换为双语对照' }).click();

  // DOM 翻转:译文块出现、原文还原、切换按钮文案翻转
  await expect(page.locator('.llm-translator-block-host')).toHaveCount(9, { timeout: 5_000 });
  await expect(page.locator('#para-1')).toHaveText(PARA1_ORIGINAL);
  await expect(page.getByRole('button', { name: '切换为替换' })).toBeVisible();

  // 免重译:零新请求(验收标准 6/10)
  expect(getRequestCount(CHAT_ROUTE)).toBe(countBefore);
});

test('恢复原文后无注入残留且原文逐字还原', async ({ context, extensionId }) => {
  await configureMockProvider(context, extensionId);
  const page = await openTestPage(context);
  await triggerFullpageTranslate(context, 'replace');
  await waitForReplaceSettled(page);

  await page.getByRole('button', { name: '恢复原文' }).click();

  // 无注入残留(工具栏宿主/译文块/失败徽标均带 data-llm-translator,恢复后全部移除)
  await expect(page.locator('[data-llm-translator]')).toHaveCount(0);

  // 原文逐字还原(textContent 全等)
  expect(await page.locator('#para-1').textContent()).toBe(PARA1_ORIGINAL);
  expect(await page.locator('#para-4').textContent()).toBe(PARA4_ORIGINAL);
  expect(await page.locator('#para-fail').textContent()).toBe(PARA_FAIL_ORIGINAL);
});

test('失败段落保留原文并标记,复位后重试译出且标记消失', async ({ context, extensionId }) => {
  // 失败开关:仅 __FAIL__ 段 500(快速失败),其余段正常——部分失败隔离
  setFailMode(true);
  await configureMockProvider(context, extensionId);
  const page = await openTestPage(context);
  await triggerFullpageTranslate(context, 'replace');
  await waitForReplaceSettled(page);

  // __FAIL__ 段保留原文 + 失败徽标宿主出现(shadow 内含 ⚠)
  await expect(page.locator('#para-fail')).toHaveText(PARA_FAIL_ORIGINAL);
  const failedHost = page.locator('.llm-translator-failed-host');
  await expect(failedHost).toHaveCount(1);
  await expect
    .poll(() => failedHost.first().evaluate((el) => el.shadowRoot?.textContent ?? ''))
    .toContain('⚠');

  // 工具栏出现「重试失败段落」按钮(计数 1)
  const retryBtn = page.getByRole('button', { name: '重试失败段落' });
  await expect(retryBtn).toBeVisible();

  // 复位失败开关 → 点重试 → 该段译出、徽标消失、重试按钮隐藏
  setFailMode(false);
  await retryBtn.click();
  await expect(page.locator('#para-fail')).toHaveText(MOCK_TRANSLATION, { timeout: 15_000 });
  await expect(page.locator('.llm-translator-failed-host')).toHaveCount(0);
  await expect(retryBtn).toBeHidden();
});

test('动态新增段落自动增量翻译', async ({ context, extensionId }) => {
  await configureMockProvider(context, extensionId);
  const page = await openTestPage(context);
  await triggerFullpageTranslate(context, 'replace');
  await waitForReplaceSettled(page);

  const countBefore = getRequestCount(CHAT_ROUTE);

  // 按钮文本已被替换为译文,点击定位用 id 选择器
  await page.locator('#add-paragraph').click();

  // MutationObserver 200ms 防抖聚合 → 新段落自动译出(验收标准 9)
  await expect(page.locator('#added-para-1')).toHaveText(MOCK_TRANSLATION, { timeout: 15_000 });

  // 增量翻译恰好 1 个新请求(新段文本唯一,无缓存命中)
  expect(getRequestCount(CHAT_ROUTE)).toBe(countBefore + 1);
});

test('恢复原文后再次触发命中会话缓存,请求计数不变', async ({ context, extensionId }) => {
  await configureMockProvider(context, extensionId);
  const page = await openTestPage(context);
  await triggerFullpageTranslate(context, 'replace');
  await waitForReplaceSettled(page);

  const countBefore = getRequestCount(CHAT_ROUTE);
  expect(countBefore).toBe(INITIAL_REQUEST_COUNT);

  // 恢复原文(保留会话缓存)
  await page.getByRole('button', { name: '恢复原文' }).click();
  await expect(page.locator('[data-llm-translator]')).toHaveCount(0);

  // 再次触发:命中缓存秒级渲染,零新请求(验收标准 10)
  await triggerFullpageTranslate(context, 'replace');
  await waitForReplaceSettled(page);
  expect(getRequestCount(CHAT_ROUTE)).toBe(countBefore);
});

test('工具栏收起后迷你把手可见,点把手恢复工具栏', async ({ context, extensionId }) => {
  await configureMockProvider(context, extensionId);
  const page = await openTestPage(context);
  await triggerFullpageTranslate(context, 'replace');
  await waitForReplaceSettled(page);

  const switchBtn = page.getByRole('button', { name: '切换为双语对照' });
  await expect(switchBtn).toBeVisible();

  // 收起:工具栏隐藏、迷你把手可见(验收标准 11)
  await page.getByRole('button', { name: '收起工具栏' }).click();
  await expect(switchBtn).toBeHidden();
  const miniHandle = page.getByRole('button', { name: '展开工具栏' });
  await expect(miniHandle).toBeVisible();

  // 唤出:工具栏恢复、把手隐藏
  await miniHandle.click();
  await expect(switchBtn).toBeVisible();
  await expect(miniHandle).toBeHidden();
});
