/**
 * Capture store listing screenshots for Omni AI Translator.
 *
 * Prerequisites: extension must be built (pnpm build -> .output/chrome-mv3/)
 * Output: releases/v0.3/6-store-listing/screenshots/{popup,options,overlay}.png
 *
 * Usage: pnpm build && npx tsx scripts/capture-screenshots.ts
 *
 * Captures 3 screenshots at 1280x800:
 *   1. popup  - the popup configuration panel (centered on warm-white canvas)
 *   2. options - the full options/settings page with a configured provider
 *   3. overlay - a realistic article page with text selected, trigger button,
 *                and translation panel showing mock-translated text
 *
 * The mock LLM server (e2e/mock-server.ts) returns "你好,世界" as translation,
 * ensuring no real API keys or sensitive data appear in screenshots.
 */
import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { startMockServer } from '../e2e/mock-server';

const SCREENSHOT_W = 1280;
const SCREENSHOT_H = 800;

const extensionPath = path.resolve(process.cwd(), '.output/chrome-mv3');
const outputDir = path.resolve(
  process.cwd(),
  'releases/v0.3/6-store-listing/screenshots',
);
const screenshotPage = path.resolve(
  process.cwd(),
  'e2e/fixtures/screenshot-page.html',
);

async function main() {
  // --- sanity checks ---
  if (!fs.existsSync(extensionPath)) {
    console.error('Extension not built. Run `pnpm build` first.');
    process.exit(1);
  }
  fs.mkdirSync(outputDir, { recursive: true });

  // --- start mock server ---
  const mockServer = await startMockServer();
  const mockUrl = mockServer.url;
  console.log(`Mock server: ${mockUrl}`);

  // --- launch persistent context with extension ---
  const userDataDir = path.resolve(process.cwd(), '.screenshot-profile');
  // Clean previous profile to avoid stale state
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
    // --- extract extension ID ---
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

    // --- 1. configure mock provider via options page ---
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
    await optionsPage.waitForLoadState('networkidle');

    // Add a mock OpenAI-compatible provider
    await optionsPage.getByRole('button', { name: '+ 添加提供方' }).click();
    const cards = optionsPage.locator('.provider-card');
    const card = cards.last();
    await card.locator('input[placeholder="名称"]').fill('GPT-4o');
    await card.getByTestId('base-url').fill(
      `${mockUrl}/v1/chat/completions`,
    );
    await card.locator('input[placeholder="模型名"]').fill('gpt-4o');
    await card.getByRole('button', { name: '启用' }).click();
    await optionsPage.waitForTimeout(800);

    // --- 2. capture options screenshot ---
    await optionsPage.screenshot({
      path: path.join(outputDir, 'options.png'),
    });
    console.log('Captured: options.png');
    // Keep options page open for state; close later

    // --- 3. capture popup screenshot ---
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await popupPage.waitForLoadState('networkidle');
    await popupPage.waitForTimeout(500);

    // Center the 400x600 popup on the 1280x800 canvas with warm-white bg
    await popupPage.addStyleTag({
      content: `
        body {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          min-height: 100vh !important;
          margin: 0 !important;
          background: hsl(36 100% 98%) !important;
        }
      `,
    });
    await popupPage.waitForTimeout(300);
    await popupPage.screenshot({
      path: path.join(outputDir, 'popup.png'),
    });
    console.log('Captured: popup.png');
    await popupPage.close();

    // --- 4. capture overlay screenshot ---
    const page = await context.newPage();
    await page.goto(`file://${screenshotPage}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Select the target text
    const selectable = page.locator('#selectable');
    await selectable.waitFor();
    await selectable.selectText();
    await page.mouse.up();

    // Wait for trigger button to appear
    const trigger = page.locator('.llm-translator-trigger');
    await trigger.waitFor({ state: 'visible', timeout: 5_000 });

    // Click trigger and wait for translation panel
    await trigger.click();
    const panel = page.frameLocator(
      'iframe.llm-translator-panel-frame',
    ).locator('.llm-translator-panel');
    await panel.waitFor({ state: 'visible', timeout: 15_000 });
    await page.waitForTimeout(800); // let translation settle

    await page.screenshot({
      path: path.join(outputDir, 'overlay.png'),
    });
    console.log('Captured: overlay.png');
    await page.close();

    // close options page
    await optionsPage.close();

    // --- 5. verify screenshot dimensions ---
    console.log('\n--- Screenshot verification ---');
    for (const name of ['popup.png', 'options.png', 'overlay.png']) {
      const filePath = path.join(outputDir, name);
      const sizeStr = execSync(
        `python3 -c "from PIL import Image; img=Image.open('${filePath}'); print(f'{img.size[0]}x{img.size[1]}')"`,
        { encoding: 'utf-8' },
      ).trim();
      const ok = sizeStr === `${SCREENSHOT_W}x${SCREENSHOT_H}`;
      console.log(`  ${name}: ${sizeStr} ${ok ? 'OK' : 'MISMATCH!'}`);
    }

    console.log('\nAll screenshots captured successfully!');
  } finally {
    await context.close();
    await mockServer.close();
    // Clean up profile
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
