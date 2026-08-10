import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

// Vitest 配置：单元测试（与 WXT 构建独立，不影响 build）
// e2e 测试仍由 Playwright 负责（见 playwright.config.ts）
export default defineConfig({
  plugins: [vue()],
  test: {
    include: ['shared/**/*.test.ts', 'scripts/**/*.test.ts'],
    globals: true,
    // 启用 CSS 处理：renderer.ts 以 ?inline 导入 fullpage-block.css 字符串注入 shadow root，
    // vitest 默认 css:false 会 stub 为空串，需开启才能在测试中拿到实际 CSS 内容。
    css: true,
  },
  resolve: {
    alias: {
      '@': process.cwd(),
    },
  },
});
