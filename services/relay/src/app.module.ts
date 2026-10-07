// 应用模块 — 单模块：缓存接口 + 健康检查 + 按真实 IP 限流。
//
// 见 ADR-0002/0003：relay 是薄壳服务，刻意不引入更多分层。
// throttler 定义两组具名限流：lookup 宽松、commit 严格。

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { CacheController } from './cache/cache.controller.js';
import { CacheService } from './cache/cache.service.js';
import { HealthController } from './health/health.controller.js';
import { ProxyThrottlerGuard } from './rate-limit/proxy-throttler.guard.js';
import { RedisModule } from './redis/redis.module.js';
import { loadEnv } from './config/env.js';

@Module({
  imports: [
    RedisModule,
    ThrottlerModule.forRootAsync({
      useFactory: () => {
        const env = loadEnv();
        return {
          // @nestjs/throttler 6.x 的 ttl 单位是毫秒；seconds() 只是 ×1000，
          // 保留 env 配置的可读性。
          throttlers: [
            {
              name: 'lookup',
              ttl: seconds(env.rateLimitWindowSeconds),
              limit: env.lookupLimit,
            },
            {
              name: 'commit',
              ttl: seconds(env.rateLimitWindowSeconds),
              limit: env.commitLimit,
            },
          ],
        };
      },
    }),
  ],
  controllers: [CacheController, HealthController],
  providers: [CacheService, { provide: APP_GUARD, useClass: ProxyThrottlerGuard }],
})
export class AppModule {}
