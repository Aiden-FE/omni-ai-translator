// 跨浏览器通道冒烟(Q26=C 扫尾交付)
// 仅验证「build → 加载扩展 → 渲染 options 页」能跑通,不验证翻译业务流。
// 深度跨浏览器覆盖留作后续 PR。
import { test, expect } from './fixtures';

test('通道冒烟:options 页可加载、标题可见', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  // 等待 Vue app mount
  await expect(page.locator('text=Omni AI Translator').first()).toBeVisible({ timeout: 10_000 });
  // 无论是否配置自有源，当前生效源状态卡都会出现。
  await expect(page.getByRole('status', { name: /当前生效:/ }))
    .toBeVisible({ timeout: 5_000 });
  await page.close();
});
