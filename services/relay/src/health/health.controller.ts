// 健康检查 — 区分「节点活着但 Redis 挂了」。
//
// 插件的「测试连通」按钮需要这个区分：redis:'down' 说明容器起来了但缓存没通，
// 提示用户检查 compose 的 Redis 而不是插件配置。503 状态码让 docker healthcheck
// 与 curl -f 也能直接反映缓存可用性。

import { Controller, Get, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { SkipThrottle } from '@nestjs/throttler';
import { CacheService } from '../cache/cache.service.js';
import type { HealthResponse } from '../contracts.js';

const VERSION = '0.1.0';

export function renderHealth(redisOk: boolean): HealthResponse {
  return {
    status: redisOk ? 'ok' : 'degraded',
    version: VERSION,
    redis: redisOk ? 'ok' : 'down',
  };
}

@Controller('healthz')
export class HealthController {
  constructor(private readonly cache: CacheService) {}

  @Get()
  @SkipThrottle()
  async health(@Res({ passthrough: true }) reply: FastifyReply): Promise<HealthResponse> {
    const redisOk = await this.cache.ping();
    reply.status(redisOk ? 200 : 503);
    return renderHealth(redisOk);
  }
}
