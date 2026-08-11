// E2E Fixture:启动持久化浏览器上下文并加载扩展;支持 chromium / firefox / edge 三通道。
import { test as base, chromium, firefox, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import type { ProviderConfig, Settings } from '../shared/types';

const extensionPath = path.resolve(process.cwd(), '.output/chrome-mv3');

/** 通道入口: Playwright projects[] 指定。 */
async function launchContext(browserName: 'chromium' | 'firefox' | 'edge'): Promise<BrowserContext> {
  // 空路径由 Playwright 创建并在 context 关闭后清理，避免用例间扩展存储串扰。
  const userDataDir = '';
  if (browserName === 'firefox') {
    return firefox.launchPersistentContext(userDataDir, {
      headless: true,
      args: ['-headless=new'],
    });
  }
  // chromium / edge 共享 chromium 二进制;edge 需本地安装
  return chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--headless=new`,
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
    ],
  });
}

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({}, use) => {
    // 从 PLAYWRIGHT_BROWSER 拿当前通道;未设时走 chromium。
    const browserName = (process.env.PLAYWRIGHT_BROWSER as 'chromium' | 'firefox' | 'edge') || 'chromium';
    const context = await launchContext(browserName);
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    // 从 service worker URL 提取扩展 ID(Firefox MV2 走 background script 路径,需兼容。)
    const browserName = (process.env.PLAYWRIGHT_BROWSER as 'chromium' | 'firefox' | 'edge') || 'chromium';
    if (browserName === 'firefox') {
      // Firefox MV2 无 service worker; extensionId 从 manifest 路径或固定值取。
      // 本仓库 manifest.gecko.id = 'omni-ai-translator@aiden-fe.dev'; AMO 加载后 url 形如
      // moz-extension://<uuid>/options.html; 运行时取一次缓存。
      const pages = context.pages();
      if (pages.length === 0) {
        // 走预热页(由 spec 后续 openPage 触发);此处返回占位。
        await use('firefox-mv2-fixture');
        return;
      }
      const url = pages[0].url();
      const match = url.match(/^moz-extension:\/\/([0-9a-f-]+)\//);
      await use(match ? match[1] : 'firefox-mv2-fixture');
      return;
    }
    const id = (await getBackgroundServiceWorker(context)).url().split('/')[2];
    await use(id);
  },
});

/**
 * 获取扩展 background service worker:优先取已注册实例,否则等待其唤醒注册。
 *
 * Chromium MV3 的 SW 可能被回收,持久化上下文初始化与 storage 种子时均可能遇到
 * 未注册态,统一在此等待。集中一处避免 service-worker 发现逻辑在各调用点重复。
 */
async function getBackgroundServiceWorker(context: BrowserContext) {
  const existing = context.serviceWorkers().find((w) => w.url().includes('background'));
  if (existing) return existing;
  return context.waitForEvent('serviceworker', {
    predicate: (w) => w.url().includes('background'),
    timeout: 10_000,
  });
}

/**
 * 直接经 service worker 写入扩展存储(绕过 options 页 UI)。
 *
 * popup 每次打开都重新读 storage(getProviders / getSettings),因此每个用例独立
 * context 内只需在打开 popup 前种子一次,即可让 popup 挂载时拿到目标生效源与
 * 默认目标语言。比走 options UI 更快且不依赖组件交互时序。
 *
 * @param settings 可选;未传时仅写 providers,settings 保持空(默认目标语言为空)
 */
export async function seedExtensionStorage(
  context: BrowserContext,
  providers: ProviderConfig[],
  settings?: Settings,
): Promise<void> {
  const payload: Record<string, unknown> = {
    'llm_translator:providers': providers,
  };
  if (settings) payload['llm_translator:settings'] = settings;

  const worker = await getBackgroundServiceWorker(context);
  await worker.evaluate(async (data) => {
    await chrome.storage.local.set(data);
  }, payload);
}

/**
 * 在已加载扩展的浏览器实例中打开 popup 页面(chrome-extension://<id>/popup.html)。
 *
 * Popup 在持久化上下文中以普通页签形式打开:与真实点击扩展按钮触发的 popup 行为
 * 一致(同一 service worker、同一 storage),只是窗口形态不同。供 popup 文本翻译 E2E
 * (#82)使用。调用方负责在打开前经 seedExtensionStorage 种子生效源/默认目标语言。
 */
export async function openPopup(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  // 等待 Vue 应用挂载:header 标题出现
  await page.getByText('Omni AI Translator').first().waitFor({ timeout: 10_000 });
  return page;
}

export const expect = test.expect;
