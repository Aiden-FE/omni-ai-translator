import { Logger, Provider } from '@nestjs/common';
import { Redis, type RedisOptions } from 'ioredis';
import { loadEnv } from '../config/env.js';

/** ioredis 实例的注入 token。 */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/** 契约测试用：把 token 换成裸 ioredis 实例。 */
export function provideRedis(client: Redis): Provider {
  return { provide: REDIS_CLIENT, useValue: client };
}

export const RedisProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: (): Redis => {
    const { redisUrl } = loadEnv();
    const options: RedisOptions = {
      // 不开 lazyConnect：与 enableOfflineQueue:false 搭配时，lazyConnect 会让
      // 首次 ping 在 TCP 握手完成前就被拒（"Stream isn't writeable"），导致
      // 健康检查误报 redis:down。直接连接则由下面的 error 监听兜住未就绪窗口。
      lazyConnect: false,
      // 加速节点是缓存层：Redis 不可用时快速失败，由调用方按未命中处理，
      // 而不是让请求挂住到客户端超时。
      maxRetriesPerRequest: 1,
      // 保留离线队列：连接建立过程中的首批命令排队执行，而非直接报错。
      enableOfflineQueue: true,
      connectTimeout: 3_000,
    };
    const client = new Redis(redisUrl, options);
    client.on('error', (err: Error) => {
      // 只记错误本身，不记 key 之外的任何内容——不打原文/译文（ADR-0002）。
      new Logger('Redis').error(`连接异常: ${err.message}`);
    });
    return client;
  },
};
