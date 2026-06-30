import { defineConfig } from '@playwright/test';

// Playwright 配置:加载 Chrome MV3 扩展进行 e2e 测试
// 扩展产物路径:.output/chrome-mv3/(需先 pnpm build)
// 注:Chrome 扩展不支持旧版 headless,使用 --headless=new
const extensionPath = '.output/chrome-mv3';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    // 持久化上下文通过 fixture 注入(见 e2e/fixtures.ts)
    headless: false,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        // 扩展加载参数在 fixture 中通过 launchPersistentContext 注入
        channel: 'chromium',
      },
    },
  ],
  // 不用默认 browserType.launch,扩展需持久化上下文
  // 实际 context 在 e2e/fixtures.ts 中创建
});

export { extensionPath };
