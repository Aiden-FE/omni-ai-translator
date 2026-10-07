// Redis 连接提供者。
//
// 见 CONTEXT.md §3.21：ioredis 直连，不进 cache-manager。
// lookup 的 mget 与 commit 的 pipeline SET EX 直接调用，抽象层只增阅读成本。

import { Global, Module } from '@nestjs/common';
import { REDIS_CLIENT, RedisProvider } from './redis.provider.js';

@Global()
@Module({
  providers: [RedisProvider],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
