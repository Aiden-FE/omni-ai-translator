// E2E Mock LLM Server
// 模拟 OpenAI 兼容 /v1/chat/completions 接口,返回固定译文,供 e2e 测试使用。
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';

/** 记录最近一次请求体,供测试断言 prompt 内容 */
let lastRequestBody: unknown = null;
export function getLastRequestBody() {
  return lastRequestBody;
}

export function startMockServer(): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          lastRequestBody = body ? JSON.parse(body) : null;
        } catch {
          lastRequestBody = body;
        }

        // 健康检查
        if (req.method === 'GET' && req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        // OpenAI 兼容 chat completions
        if (req.method === 'POST' && req.url?.includes('/v1/chat/completions')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              choices: [
                {
                  message: { role: 'assistant', content: '你好,世界' },
                  finish_reason: 'stop',
                  index: 0,
                },
              ],
            }),
          );
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not found' }));
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}
