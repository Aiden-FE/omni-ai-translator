/** Capture the four current product views used by README.md. */
import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { startMockServer } from '../e2e/mock-server.ts';

const SCREENSHOT_W = 1280;
const SCREENSHOT_H = 800;

const extensionPath = path.resolve(process.cwd(), '.output/chrome-mv3');
const outputDir = path.resolve(process.cwd(), 'docs/images');
const demoPage = path.resolve(process.cwd(), 'e2e/fixtures/readme-demo-page.html');

async function triggerFullpageTranslate(
  context: Awaited<ReturnType<typeof chromium.launchPersistentContext>>,
) {
  let worker = context.serviceWorkers().find((candidate) =>
    candidate.url().includes('background'),
  );
  if (!worker) {
    worker = await context.waitForEvent('serviceworker', {
      predicate: (candidate) => candidate.url().includes('background'),
      timeout: 15_000,
    });
  }

  await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    const results = await Promise.allSettled(
      tabs.map((tab) =>
        tab.id === undefined
          ? Promise.reject(new Error('tab without id'))
          : chrome.tabs.sendMessage(tab.id, {
              type: 'fullpage-translate',
              mode: 'bilingual',
            }),
      ),
    );
    if (!results.some((result) => result.status === 'fulfilled')) {
      throw new Error('No tab accepted the full-page translation command.');
    }
  });
}

async function useReadmeCanvas(page: import('@playwright/test').Page) {
  await page.addStyleTag({
    content: `
      body {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        min-height: 100vh !important;
        margin: 0 !important;
        background: #eef3f0 !important;
      }
    `,
  });
}

async function main() {
  if (!fs.existsSync(extensionPath)) {
    console.error('Extension not built. Run `pnpm build` first.');
    process.exit(1);
  }
  fs.mkdirSync(outputDir, { recursive: true });

  const mockServer = await startMockServer();
  const mockUrl = mockServer.url;
  console.log(`Mock server: ${mockUrl}`);

  const userDataDir = path.resolve(process.cwd(), '.screenshot-profile');
  fs.rmSync(userDataDir, { recursive: true, force: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: SCREENSHOT_W, height: SCREENSHOT_H },
    args: [
      '--headless=new',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
      '--disable-gpu',
    ],
  });

  try {
    let worker = context.serviceWorkers().find((w) =>
      w.url().includes('background'),
    );
    if (!worker) {
      worker = await context.waitForEvent('serviceworker', {
        predicate: (w) => w.url().includes('background'),
        timeout: 15_000,
      });
    }
    const extensionId = worker.url().split('/')[2];
    console.log(`Extension ID: ${extensionId}`);

    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
    await optionsPage.waitForLoadState('networkidle');

    await optionsPage.getByRole('button', { name: '+ 添加提供方' }).click();
    const cards = optionsPage.locator('.provider-card');
    const card = cards.last();
    await card.locator('input[placeholder="名称"]').fill('OpenAI');
    await card.getByTestId('base-url').fill(`${mockUrl}/v1`);
    await card.locator('input[placeholder="模型名"]').fill('gpt-4o-mini');
    await card.getByRole('button', { name: '启用' }).click();
    await optionsPage.waitForTimeout(800);

    // Text translation workbench.
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await popupPage.waitForLoadState('networkidle');
    await useReadmeCanvas(popupPage);
    await popupPage.getByRole('textbox', { name: '原文输入区' }).fill('Hello world');
    await popupPage.getByRole('button', { name: '翻译' }).click();
    await popupPage.getByText('已完成').waitFor({ state: 'visible', timeout: 15_000 });
    await popupPage.screenshot({
      path: path.join(outputDir, 'text-translation.png'),
    });
    console.log('Captured: text-translation.png');
    await popupPage.close();

    // Selection translation overlay.
    const selectionPage = await context.newPage();
    await selectionPage.goto(`file://${demoPage}`);
    await selectionPage.waitForLoadState('networkidle');
    const selectable = selectionPage.locator('#selectable');
    await selectable.waitFor();
    await selectable.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      const rect = range.getBoundingClientRect();
      element.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        clientX: rect.right,
        clientY: rect.bottom,
      }));
    });
    const trigger = selectionPage.locator('.llm-translator-trigger');
    await trigger.waitFor({ state: 'visible', timeout: 5_000 });
    await trigger.click();
    const panel = selectionPage.frameLocator(
      'iframe.llm-translator-panel-frame',
    ).locator('.llm-translator-panel');
    await panel.waitFor({ state: 'visible', timeout: 15_000 });
    await panel.locator('.llm-translator-md-render').waitFor({ timeout: 15_000 });
    await panel.evaluate((root) => {
      const result = root.querySelector('.llm-translator-md-render');
      if (result) {
        result.textContent = '翻译不仅是替换单词，更要保留语气、上下文与原作者的意图。';
      }
      const frame = window.frameElement as HTMLIFrameElement | null;
      if (frame) {
        frame.style.width = `${(root as HTMLElement).offsetWidth}px`;
        frame.style.height = `${(root as HTMLElement).offsetHeight}px`;
      }
    });
    await selectionPage.screenshot({
      path: path.join(outputDir, 'selection-translation.png'),
    });
    console.log('Captured: selection-translation.png');
    await selectionPage.close();

    // Full-page bilingual translation and its live toolbar.
    const fullpage = await context.newPage();
    await fullpage.goto(`file://${demoPage}`);
    await fullpage.waitForLoadState('networkidle');
    await fullpage.evaluate(() => {
      document.querySelector('.site-header')?.setAttribute('data-llm-translator', '');
      document.querySelector('aside')?.setAttribute('data-llm-translator', '');
    });
    await triggerFullpageTranslate(context);
    const translationBlocks = fullpage.locator('.llm-translator-block-host');
    await translationBlocks.first().waitFor({ state: 'attached', timeout: 15_000 });
    await fullpage.getByText(/全文翻译完成/).waitFor({ timeout: 15_000 });
    await fullpage.evaluate(() => {
      const hosts = document.querySelectorAll<HTMLElement>('.llm-translator-block-host');
      for (const host of hosts) {
        const source = host.closest('[data-demo-translation]')
          ?? host.previousElementSibling?.closest('[data-demo-translation]');
        const translation = source?.getAttribute('data-demo-translation');
        const content = host.shadowRoot?.querySelector('.llm-translator-block-content');
        if (translation && content) content.textContent = translation;
      }
    });
    await fullpage.screenshot({
      path: path.join(outputDir, 'fullpage-translation.png'),
    });
    console.log('Captured: fullpage-translation.png');
    await fullpage.close();

    // Provider settings. Keep the screenshot realistic while avoiding localhost details.
    await card.getByTestId('base-url').fill('https://api.openai.com/v1');
    await card.locator('input[type="password"]').fill('sk-example-not-a-real-key');
    await optionsPage.addStyleTag({ content: 'body { zoom: 1.12; }' });
    await optionsPage.screenshot({
      path: path.join(outputDir, 'settings.png'),
    });
    console.log('Captured: settings.png');
    await optionsPage.close();

    console.log('\n--- Screenshot verification ---');
    for (const name of [
      'selection-translation.png',
      'fullpage-translation.png',
      'text-translation.png',
      'settings.png',
    ]) {
      const filePath = path.join(outputDir, name);
      const bytes = fs.statSync(filePath).size;
      console.log(`  ${name}: ${SCREENSHOT_W}x${SCREENSHOT_H}, ${bytes} bytes`);
    }

    console.log('\nAll screenshots captured successfully!');
  } finally {
    await context.close();
    await mockServer.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
