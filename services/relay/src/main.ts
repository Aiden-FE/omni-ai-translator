// 翻译加速节点入口 — NestJS + fastify 内核。
//
// 见 ADR-0002：TRUST_PROXY 只在部署于反向代理之后才开启。
// 默认 false（按 socket 地址限流），由 main.ts 显式传给 FastifyAdapter。

import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { loadEnv } from './config/env.js';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      // 关闭时 X-Forwarded-For 不参与 request.ip，客户端无法伪造来源绕过限流。
      trustProxy: env.trustProxy,
      // 请求体上限：200 条 × 5000 字符 ≈ 1MB，再留出 JSON 结构与译文余量。
      bodyLimit: 1_500_000,
    }),
  );

  await app.listen(env.port, '0.0.0.0');
  new Logger('Bootstrap').log(
    `翻译加速节点监听 :${env.port}（trustProxy=${env.trustProxy}，TTL=${env.ttlSeconds}s）`,
  );
}

void bootstrap();
