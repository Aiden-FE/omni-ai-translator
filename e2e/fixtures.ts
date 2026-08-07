// E2E Fixture:启动持久化浏览器上下文并加载扩展;支持 chromium / firefox / edge 三通道。
import { test as base, chromium, firefox, type BrowserContext } from '@playwright/test';
import path from 'node:path';

const extensionPath = path.resolve(process.cwd(), '.output/chrome-mv3');

/** 通道入口: Playwright projects[] 指定。 */
async function launchContext(browserName: 'chromium' | 'firefox' | 'edge'): Promise<BrowserContext> {
  const userDataDir = path.resolve(process.cwd(), `.e2e-profile-${browserName}`);
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
    let worker = context.serviceWorkers().find((w) => w.url().includes('background'));
    if (!worker) {
      worker = await context.waitForEvent('serviceworker', {
        predicate: (w) => w.url().includes('background'),
        timeout: 10_000,
      });
    }
    const id = worker.url().split('/')[2];
    await use(id);
  },
});

export const expect = test.expect;
