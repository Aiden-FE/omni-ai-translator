// 全文翻译 e2e 性能回归(ADR-0001 D1-D4 性能门,Q16=C 真 DOM 端到端围栏)
//
// 围栏：start('replace') 起到「首段译文写入源文本节点」的时间。
// 真 DOM 预算(ADR-0001 / Q12=B):
// - 1000 段 ≤ 80ms
// - 5000 段 ≤ 400ms
//
// 为隔离收集/调度成本，mock-server 延迟需为 0(setMockLatencyMs(0) 在 beforeEach 内调用)。
// 总 LLM 工作不测——本 spec 只覆盖「用户先看见第一段译文」这一刻，与 v0.4.x ① 改造目标对齐。

import { test, expect } from './fixtures';
import {
  startMockServer,
  setMockLatencyMs,
} from './mock-server';
import type { BrowserContext, Page } from '@playwright/test';
import path from 'node:path';

const testPageUrl = `file://${path.resolve(process.cwd(), 'e2e/fixtures/fullpage-test-page.html')}`;

let mockServer: { close: () => Promise<void> } | null = null;

test.beforeAll(async () => {
  mockServer = await startMockServer();
});

test.afterAll(async () => {
  await mockServer?.close();
});

test.beforeEach(() => {
  // 隔离 LLM 网络延迟;纯测 chunker + 编排器调度开销
  setMockLatencyMs(0);
});

/**
 * 合成 N 段 DOM 并装载。
 * 每段 1px 高(无空白占位)、id=`gen-${i}`、文本稳定(供 hash/翻译)。
 */
async function loadSyntheticPage(context: BrowserContext, segmentCount: number): Promise<Page> {
  const page = await context.newPage();
  await page.goto(testPageUrl);
  await page.evaluate((n) => {
    document.body.replaceChildren();
    document.body.style.cssText = 'margin:0;padding:0';
    const main = document.createElement('main');
    for (let i = 0; i < n; i += 1) {
      const p = document.createElement('p');
      p.id = `gen-${i}`;
      p.textContent = `段 ${i}: synthetic translation performance fixture.`;
      p.style.cssText = 'font-size:1px;line-height:1px;height:1px;margin:0';
      main.appendChild(p);
    }
    document.body.appendChild(main);
  }, segmentCount);
  return page;
}

async function configureMockProvider(context: BrowserContext, extensionId: string, mockBaseUrl: string): Promise<void> {
  const optionsPage = await context.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
  await optionsPage.getByRole('button', { name: '+ 添加提供方' }).click();
  const card = optionsPage.locator('.provider-card').last();
  await card.locator('input[placeholder="名称"]').fill('perf-mock');
  await card.getByTestId('base-url').fill(`${mockBaseUrl}/v1`);
  await card.locator('input[placeholder="模型名"]').fill('mock-model');
  await card.getByRole('button', { name: '启用' }).click();
  await optionsPage.close();
}

async function triggerFullpageTranslateAndMeasure(
  context: BrowserContext,
  page: Page,
  timeoutMs: number,
): Promise<number> {
  // replace 模式不会创建 block host，只会改写原文本节点；计时探针必须观察 characterData。
  await page.evaluate(() => {
    const state = globalThis as unknown as { __firstSettledPromise: Promise<number> };
    state.__firstSettledPromise = new Promise<number>((resolve) => {
      const t0 = performance.now();
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          const target = record.target;
          if (
            record.type === 'characterData'
            && target instanceof Text
            && target.parentElement?.id.startsWith('gen-')
          ) {
            observer.disconnect();
            resolve(performance.now() - t0);
            return;
          }
        }
      });
      observer.observe(document.body, { characterData: true, subtree: true });
    });
  });

  let sw = context.serviceWorkers().find((w) => w.url().includes('background'));
  if (!sw) {
    sw = await context.waitForEvent('serviceworker', {
      predicate: (w) => w.url().includes('background'),
      timeout: 10_000,
    });
  }
  const delivered = await sw.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    const results = await Promise.allSettled(
      tabs.map((t) =>
        t.id === undefined
          ? Promise.reject(new Error('tab without id'))
          : chrome.tabs.sendMessage(t.id, { type: 'fullpage-translate', mode: 'replace' }),
      ),
    );
    return results.filter((result) => result.status === 'fulfilled').length;
  });
  if (delivered === 0) {
    throw new Error('fullpage perf e2e: no tab consumed the command');
  }

  return page.evaluate((timeout) => {
    const state = globalThis as unknown as { __firstSettledPromise?: Promise<number> };
    if (!state.__firstSettledPromise) throw new Error('first-settled observer was not armed');
    return Promise.race([
      state.__firstSettledPromise,
      new Promise<number>((_, reject) => {
        setTimeout(() => reject(new Error(`first-settled > ${timeout}ms`)), timeout);
      }),
    ]);
  }, timeoutMs);
}

test('1000 段真 DOM：首段译文落盘 ≤ 80ms (ADR-0001 D1-D4 性能门)', async ({ context, extensionId }) => {
  const mockBaseUrl = (mockServer as unknown as { url: string }).url;
  await configureMockProvider(context, extensionId, mockBaseUrl);
  const page = await loadSyntheticPage(context, 1000);
  const elapsed = await triggerFullpageTranslateAndMeasure(context, page, 5_000);
  expect(elapsed).toBeLessThan(80);
});

test('5000 段真 DOM：首段译文落盘 ≤ 400ms (ADR-0001 D1-D4 性能门)', async ({ context, extensionId }) => {
  const mockBaseUrl = (mockServer as unknown as { url: string }).url;
  await configureMockProvider(context, extensionId, mockBaseUrl);
  const page = await loadSyntheticPage(context, 5000);
  const elapsed = await triggerFullpageTranslateAndMeasure(context, page, 10_000);
  expect(elapsed).toBeLessThan(400);
});
