import { defineConfig } from 'vitest/config';

// Vitest 配置：单元测试（与 WXT 构建独立，不影响 build）
// e2e 测试仍由 Playwright 负责（见 playwright.config.ts）
export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': process.cwd(),
    },
  },
});
