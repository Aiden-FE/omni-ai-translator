import { defineConfig } from 'vitest/config';

// relay 服务的单测与契约测试。单测 mock ioredis；契约测试跑真实 Redis
// （由 RELAY_CONTRACT_REDIS_URL 指向的实例提供，未设置时自动跳过）。
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    globals: true,
    environment: 'node',
  },
});
