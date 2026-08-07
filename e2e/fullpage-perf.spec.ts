// 全文翻译 e2e 性能回归(ADR-0001 D1-D4 性能门,Q16=C 真 DOM 端到端围栏)
//
// 围栏：start('replace') 起到「首段译文 DOM 落盘」(即 .llm-translator-block-host
// 首次出现)的时间。真 DOM 预算(ADR-0001 / Q12=B):
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

/**
 * 预挂 MutationObserver 监 .llm-translator-block-host 首次出现,记录 timestamp。
 * 返回 promise resolve 到首次出现耗时(ms)。如 timeoutMs 内未触发则 reject。
 */
async function armFirstSettledObserver(
  page: Page,
  timeoutMs: number,
): Promise<{ resolve: (elapsedMs: number) => void; promise: Promise<number> }> {
  let resolveFn!: (elapsedMs: number) => void;
  const promise = new Promise<number>((res, rej) => {
    resolveFn = res;
    setTimeout(() => { rej(new Error(`first-settled not observed within ${timeoutMs}ms`)); }, timeoutMs);
  });
  await page.evaluate(() => {
    const t0 = performance.now();
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        for (const node of r.addedNodes) {
          if (node instanceof HTMLElement && node.classList.contains('llm-translator-block-host')) {
            const elapsed = performance.now() - t0;
            observer.disconnect();
            (window as unknown as { __firstSettledResolver: (ms: number) => void }).__firstSettledResolver(elapsed);
            return;
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    (window as unknown as { __firstSettledResolver: (ms: number) => void }).__firstSettledResolver = (ms: number) => {
      // 由 page.exposeFunction 调入；这里兜底
    };
  });
  return { resolve: resolveFn, promise };
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
  // 在 page 上下文预装 MO,t0 在 evaluate 内部取
  const startPromise = page.evaluate(() => {
    return new Promise<number>((resolve) => {
      const t0 = performance.now();
      const observer = new MutationObserver((records) => {
        for (const r of records) {
          for (const node of r.addedNodes) {
            if (node instanceof HTMLElement && node.classList.contains('llm-translator-block-host')) {
              observer.disconnect();
              resolve(performance.now() - t0);
              return;
            }
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      // 全局句柄,供 trigger 后若 MO 错过主线程 tick 时兜底
      (globalThis as unknown as { __perfT0: number }).__perfT0 = t0;
    });
  });

  let sw = context.serviceWorkers().find((w) => w.url().includes('background'));
  if (!sw) {
    sw = await context.waitForEvent('serviceworker', {
      predicate: (w) => w.url().includes('background'),
      timeout: 10_000,
    });
  }
  const t0 = Date.now();
  await sw.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    await Promise.allSettled(
      tabs.map((t) =>
        t.id === undefined
          ? Promise.reject(new Error('tab without id'))
          : chrome.tabs.sendMessage(t.id, { type: 'fullpage-translate', mode: 'replace' }),
      ),
    );
  });

  return Promise.race([
    startPromise,
    new Promise<number>((_, rej) => { setTimeout(() => rej(new Error(`first-settled > ${timeoutMs}ms`)), timeoutMs); }),
  ]).finally(() => {
    void t0;
  });
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
