// 按真实客户端 IP 计桶的限流守卫。
//
// 见 ADR-0002：默认 trustProxy=false（直连按 socket 地址）。部署在 nginx 之后
// 必须置 TRUST_PROXY=true，否则所有自建者共用 127.0.0.1 一个桶，互相挤掉对方。
//
// 这里刻意只用 `request.ip`，不读 `request.ips[0]`：fastify 的 ips 数组首项是
// socket 地址（形如 ['127.0.0.1', ...xff 倒序]），取 ips[0] 恰好退化成
// 「所有人共用一个桶」。而 fastify 在 trustProxy=true 时已把 request.ip
// 解析为 X-Forwarded-For 最左侧可信值，trustProxy=false 时即 socket 地址。

import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

interface ProxyAwareRequest {
  ip?: string;
  raw?: { remoteAddress?: string };
}

@Injectable()
export class ProxyThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as ProxyAwareRequest;
    return request.ip ?? request.raw?.remoteAddress ?? 'unknown';
  }
}
