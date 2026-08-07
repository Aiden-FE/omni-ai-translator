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
  // 三通道顺序跑 (firefox / edge / chromium),避免持久化上下文竞争
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
    {
      // Firefox 通道冒烟(Q26=C): 仅验证 MV2 manifest 转换 + 扩展加载。
      // 实际跑需在 CI 装 firefox: pnpm exec playwright install firefox
      name: 'firefox',
      use: { browserName: 'firefox' },
    },
    {
      // Edge 通道: 与 chromium 共二进制。CI 跑需装 msedge 通道:
      // pnpm exec playwright install msedge
      name: 'edge',
      use: { channel: 'msedge' },
    },
  ],
  // 不用默认 browserType.launch,扩展需持久化上下文
  // 实际 context 在 e2e/fixtures.ts 中创建
});

export { extensionPath };
