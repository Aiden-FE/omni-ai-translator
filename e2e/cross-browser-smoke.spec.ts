// 跨浏览器通道冒烟(Q26=C 扫尾交付)
// 仅验证「build → 加载扩展 → 渲染 options 页」能跑通,不验证翻译业务流。
// 深度跨浏览器覆盖留作后续 PR。
import { test, expect } from './fixtures';

test('通道冒烟:options 页可加载、标题可见', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  // 等待 Vue app mount
  await expect(page.locator('text=Omni AI Translator').first()).toBeVisible({ timeout: 10_000 });
  // 提供方列表容器出现
  await expect(page.locator('.provider-card, [data-testid="provider-list-empty"]').first())
    .toBeVisible({ timeout: 5_000 });
  await page.close();
});
