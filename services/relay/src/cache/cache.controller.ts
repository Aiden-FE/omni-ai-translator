// 加速节点缓存接口。
//
// 契约见 ADR-0002：只缓存不代理。加速节点永远拿不到翻译接口凭据，
// 因此插件的隐私承诺（API Key 只存本地）在开启加速后依然成立。
//
// 路径用 /v1/cache/lookup 而非 /v1/cache:lookup：find-my-way 把冒号后的
// 段当通配参数，导致 lookup 与 commit 注册到同一路由（DUPLICATED_ROUTE）。

import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CacheService } from './cache.service.js';
import { Throttle } from '@nestjs/throttler';
import type { CommitResponse, LookupResponse } from '../contracts.js';

@Controller()
export class CacheController {
  constructor(private readonly cache: CacheService) {}

  @Post('/v1/cache/lookup')
  @HttpCode(200)
  @Throttle({ lookup: {} })
  async lookup(@Body() body: unknown): Promise<LookupResponse> {
    return this.cache.lookup(readItems(body));
  }

  @Post('/v1/cache/commit')
  @HttpCode(200)
  // 写才是成本大头：commit 的限流比 lookup 严格（见 env.ts 的 RATE_LIMIT_COMMIT）。
  @Throttle({ commit: {} })
  async commit(@Body() body: unknown): Promise<CommitResponse> {
    return { accepted: await this.cache.commit(readItems(body)) };
  }
}

/** 容错地取 body.items：非对象 body 一律当作空批，由 service 层返回空结果。 */
function readItems(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) return [];
  return (body as Record<string, unknown>).items;
}
