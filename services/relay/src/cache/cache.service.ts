// 缓存读写 — mget 查询 / pipeline upsert 写入。
//
// 见 ADR-0002：
// - 规范化与哈希全部在此层完成，控制器与插件都不碰哈希算法
// - commit 是 upsert（覆盖 + 重置 TTL）：用户显式重试即覆盖公共缓存，
//   这是纠正错误缓存的唯一手段，且不需要任何鉴权端点
// - 坏条跳过、好条照处理：一条坏数据不放大成全批失败

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { buildCacheKey, type CacheIdentity } from './cache-key.js';
import { loadEnv } from '../config/env.js';
import { REDIS_CLIENT } from '../redis/redis.provider.js';
import {
  MAX_ITEMS_PER_REQUEST,
  MAX_TEXT_LENGTH,
  type CommitItem,
  type LookupItem,
  type LookupResponse,
} from '../contracts.js';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly ttlSeconds = loadEnv().ttlSeconds;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * 逐条校验。返回 null 表示该条非法、应被跳过。
   * 校验只覆盖「服务端能确定的事」：类型、必填、长度上限。
   */
  private static validate(item: unknown): item is LookupItem {
    if (typeof item !== 'object' || item === null) return false;
    const candidate = item as Record<string, unknown>;
    return (
      typeof candidate.id === 'string'
      && candidate.id.length > 0
      && typeof candidate.text === 'string'
      && candidate.text.length <= MAX_TEXT_LENGTH
      && typeof candidate.targetLang === 'string'
      && candidate.targetLang.length > 0
      && (candidate.sourceLang === undefined || typeof candidate.sourceLang === 'string')
    );
  }

  /** 截断到上限并剔除非法条；空数组表示本批无可处理数据。 */
  private static pickValid<T extends LookupItem>(items: unknown): T[] {
    if (!Array.isArray(items)) return [];
    const valid = items.filter(CacheService.validate).slice(0, MAX_ITEMS_PER_REQUEST);
    return valid as T[];
  }

  private static identityOf(item: LookupItem): CacheIdentity {
    return {
      text: item.text,
      targetLang: item.targetLang,
      sourceLang: item.sourceLang,
    };
  }

  /**
   * 批量查缓存。响应只含命中项——插件按 id 回填，
   * 未出现在 hits 中的 id 一律按未命中处理。
   */
  async lookup(items: unknown): Promise<LookupResponse> {
    const valid = CacheService.pickValid<LookupItem>(items);
    if (valid.length === 0) return { hits: [] };

    const keys = valid.map((item) => buildCacheKey(CacheService.identityOf(item)));
    const values = await this.redis.mget(...keys);

    const hits: LookupResponse['hits'] = [];
    valid.forEach((item, index) => {
      const value = values[index];
      // 命中条缺译文（理论上不该发生）按未命中处理，不升级为 5xx。
      if (typeof value !== 'string' || value.length === 0) return;
      hits.push({ id: item.id, translatedText: value });
    });

    // 只打命中数与键前缀，不打原文/译文。
    this.logger.debug(`lookup ${valid.length} 条，命中 ${hits.length} 条`);
    return { hits };
  }

  /**
   * 批量 upsert。返回已接受的条数。
   * 非法条（缺译文等）跳过，其余照常写入。
   */
  async commit(items: unknown): Promise<number> {
    const valid = CacheService.pickValid<CommitItem>(items)
      .filter((item) => typeof item.translatedText === 'string' && item.translatedText.length > 0);
    if (valid.length === 0) return 0;

    const pipeline = this.redis.pipeline();
    for (const item of valid) {
      const key = buildCacheKey(CacheService.identityOf(item));
      // SET key value EX ttl —— 覆盖既有条目并重置 TTL（upsert 语义）。
      pipeline.set(key, item.translatedText, 'EX', this.ttlSeconds);
    }
    const results = await pipeline.exec();

    // exec 返回 [err, result] 数组；逐条统计成功数，让部分失败不至于丢掉整批语义。
    const accepted = (results ?? []).reduce(
      (count, [err]) => (err === null ? count + 1 : count),
      0,
    );
    this.logger.debug(`commit 提交 ${valid.length} 条，成功 ${accepted} 条`);
    return accepted;
  }

  /** 健康检查用：ping 探活。 */
  async ping(): Promise<boolean> {
    try {
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
}
