// E2E Mock LLM Server
// 模拟 OpenAI 兼容 /v1/chat/completions、Anthropic /v1/messages、Ollama /api/chat 与微软官方 translate 接口。
// 支持 stream: true 时返回流式响应(SSE / NDJSON),供 e2e 测试验证渐进渲染。
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';

/** 记录最近一次请求体,供测试断言 prompt 内容 */
let lastRequestBody: unknown = null;
export function getLastRequestBody() {
  return lastRequestBody;
}

/** 记录最近一次请求 headers,供测试断言 microsoft 有 Key 场景的鉴权 header */
let lastRequestHeaders: Record<string, string | string[] | undefined> = {};
export function getLastRequestHeaders() {
  return lastRequestHeaders;
}

/** 模拟流式翻译的固定译文 "你好,世界",按字符拆分为 chunk */
const STREAM_CHUNKS = ['你', '好', ',世界'];

/** chunk 间延迟(ms),模拟真实流式传输,使渐进渲染可被 e2e 捕获 */
const CHUNK_DELAY_MS = 100;

/** 等待指定毫秒 */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 发送 OpenAI 兼容 SSE 流式响应:逐 chunk data 行,以 data: [DONE] 结束 */
async function sendOpenAIStream(res: ServerResponse): Promise<void> {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  for (const chunk of STREAM_CHUNKS) {
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`);
    await sleep(CHUNK_DELAY_MS);
  }
  res.write('data: [DONE]\n\n');
  res.end();
}

/** 发送 Anthropic SSE 流式响应:message_start → content_block_delta × N → message_stop */
async function sendAnthropicStream(res: ServerResponse): Promise<void> {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(`event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: { id: 'msg_mock', type: 'message', role: 'assistant', content: [] } })}\n\n`);
  res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })}\n\n`);
  for (const chunk of STREAM_CHUNKS) {
    res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text', text: chunk } })}\n\n`);
    await sleep(CHUNK_DELAY_MS);
  }
  res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`);
  res.write(`event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' } })}\n\n`);
  res.write(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
  res.end();
}

/** 发送 Ollama NDJSON 流式响应:逐行 message.content,最后一行 done: true */
async function sendOllamaStream(res: ServerResponse): Promise<void> {
  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson',
    'Cache-Control': 'no-cache',
  });
  for (const chunk of STREAM_CHUNKS) {
    res.write(`${JSON.stringify({ message: { content: chunk } })}\n`);
    await sleep(CHUNK_DELAY_MS);
  }
  res.write(`${JSON.stringify({ message: { content: '' }, done: true })}\n`);
  res.end();
}

export function startMockServer(): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        try {
          lastRequestBody = body ? JSON.parse(body) : null;
        } catch {
          lastRequestBody = body;
        }
        // 记录 headers,供 microsoft 有 Key e2e 断言鉴权 header
        lastRequestHeaders = { ...req.headers };

        // 健康检查
        if (req.method === 'GET' && req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        const parsedBody = lastRequestBody as Record<string, unknown> | null;
        const isStream = parsedBody?.stream === true;

        // OpenAI 兼容 chat completions
        if (req.method === 'POST' && req.url?.includes('/v1/chat/completions')) {
          if (isStream) {
            await sendOpenAIStream(res);
          } else {
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
          }
          return;
        }

        // Anthropic Messages API（原生协议，anthropic 响应风格）
        if (req.method === 'POST' && req.url?.includes('/v1/messages')) {
          if (isStream) {
            await sendAnthropicStream(res);
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                id: 'msg_mock',
                type: 'message',
                role: 'assistant',
                content: [{ type: 'text', text: '你好,世界' }],
                model: 'mock-model',
                stop_reason: 'end_turn',
              }),
            );
          }
          return;
        }

        // Ollama 本地接口(/api/chat)
        if (req.method === 'POST' && req.url?.includes('/api/chat')) {
          if (isStream) {
            await sendOllamaStream(res);
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                model: 'mock-model',
                message: { role: 'assistant', content: '你好,世界' },
                done: true,
              }),
            );
          }
          return;
        }

        // 微软官方 translate 端点（有 Key 场景）：POST /translate?api-version=3.0&to=...
        // 返回微软响应格式,供有 Key e2e 验证官方端点落点与鉴权 header
        if (req.method === 'POST' && req.url?.includes('/translate')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify([{ translations: [{ text: '你好,世界', to: 'zh' }] }]),
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
