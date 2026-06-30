// E2E Fixture:启动持久化 Chromium 上下文并加载扩展
import { test as base, chromium, type BrowserContext } from '@playwright/test';
import path from 'node:path';

const extensionPath = path.resolve(process.cwd(), '.output/chrome-mv3');

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({}, use) => {
    // 持久化上下文目录,加载扩展;CI 每次新建避免状态残留
    const userDataDir = path.resolve(process.cwd(), '.e2e-profile');
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--headless=new`,
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    // 从 service worker URL 提取扩展 ID
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
