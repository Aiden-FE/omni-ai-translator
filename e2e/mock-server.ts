// E2E Mock LLM Server
// 模拟 OpenAI /v1/chat/completions 与 /v1/responses、Anthropic /v1/messages、Ollama /api/chat 与微软官方 translate 接口。
// 支持 stream: true 时返回流式响应(SSE / NDJSON),供 e2e 测试验证渐进渲染。
// 全文翻译 e2e 扩展(v0.4.0):
// - getRequestCount/resetRequestCount:按路由(pathname)累计请求数,供缓存复用/免重译断言
// - setFailMode:失败开关,开启后 OpenAI 兼容路由对请求体含 __FAIL__ 标记的请求返回 500(快速失败,无延迟)
// - NONSTREAM_DELAY_MS:非流式成功响应统一 300ms 可观测延迟,使「先译完的段落先渲染」可被断言
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

const BATCH_PROMPT_PREFIX = 'Translate every chunk into ';
const BATCH_REASONING_INSTRUCTION =
  'Do not reason or output analysis, <think>, <analysis>, or control tokens.';
const BATCH_OUTPUT_INSTRUCTION =
  'Output one compact JSON object per completed chunk and no other text.';
const MOCK_TRANSLATION = '你好,世界';

interface MockBatchPart {
  partId: number;
  sliceIndex: number;
  text: string;
}

interface MockBatchChunk {
  chunkId: string;
  segmentId: string;
  parts: MockBatchPart[];
}

interface CapturedBatchRequest {
  chunks: MockBatchChunk[];
}

interface PendingBatchChunk {
  chunkId: string;
  release: () => void;
}

/** 非流式成功响应的可观测延迟(ms):使全文翻译「先译完的段落先渲染」可被 e2e 相对时序断言 */
export const NONSTREAM_DELAY_MS = 300;

/** 按路由(pathname,不含 query)累计的请求计数,供缓存复用/免重译断言 */
const requestCounts = new Map<string, number>();
const capturedBatchRequests: CapturedBatchRequest[] = [];
const emittedBatchChunkIds: string[] = [];
const pendingBatchChunks: PendingBatchChunk[] = [];
let activeBatchRequests = 0;
let maxActiveBatchRequests = 0;
let batchChunkGateEnabled = false;
let batchObservationGeneration = 0;

/**
 * 读取请求计数。
 * @param route - 指定路由 pathname(如 /v1/chat/completions)时返回该路由计数;缺省返回总数
 */
export function getRequestCount(route?: string): number {
  if (route !== undefined) {
    return requestCounts.get(route) ?? 0;
  }
  let total = 0;
  for (const n of requestCounts.values()) {
    total += n;
  }
  return total;
}

/** 清空请求计数(用例间隔离,workers=1 单进程内模块状态跨 spec 文件共享) */
export function resetRequestCount(): void {
  releaseAllBatchChunks();
  batchChunkGateEnabled = false;
  batchObservationGeneration += 1;
  requestCounts.clear();
  capturedBatchRequests.length = 0;
  emittedBatchChunkIds.length = 0;
  activeBatchRequests = 0;
  maxActiveBatchRequests = 0;
}

function cloneBatchChunks(chunks: MockBatchChunk[]): MockBatchChunk[] {
  return chunks.map((chunk) => ({
    chunkId: chunk.chunkId,
    segmentId: chunk.segmentId,
    parts: chunk.parts.map((part) => ({ ...part })),
  }));
}

/** 返回 batch wire 的只读快照，避免测试修改 server 内部状态。 */
export function getCapturedBatchRequests(): CapturedBatchRequest[] {
  return capturedBatchRequests.map((request) => ({ chunks: cloneBatchChunks(request.chunks) }));
}

export function getMaxActiveBatchRequests(): number {
  return maxActiveBatchRequests;
}

export function getActiveBatchRequests(): number {
  return activeBatchRequests;
}

export function getPendingBatchChunkCount(): number {
  return pendingBatchChunks.length;
}

export function getEmittedBatchChunkIds(): string[] {
  return [...emittedBatchChunkIds];
}

export function setBatchChunkGate(enabled: boolean): void {
  batchChunkGateEnabled = enabled;
  if (!enabled) releaseAllBatchChunks();
}

export function releaseNextBatchChunk(): boolean {
  const pending = pendingBatchChunks.shift();
  if (!pending) return false;
  pending.release();
  return true;
}

export function releaseAllBatchChunks(): void {
  while (releaseNextBatchChunk()) {
    // Drain every waiter so a failed test cannot strand an HTTP response.
  }
}

/** 失败开关状态:开启后 OpenAI 兼容路由对含 __FAIL__ 标记的请求返回 500 */
let failMode = false;

/**
 * 失败开关(用后须 setFailMode(false) 复位,避免污染后续用例)。
 * 开启后仅对请求体含 __FAIL__ 标记的 OpenAI 兼容请求返回 500——
 * 供失败重试 e2e 构造「部分失败」:其余段正常译出,仅标记段失败。
 */
export function setFailMode(on: boolean): void {
  failMode = on;
}

/** 等待指定毫秒 */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMockBatchPart(value: unknown): value is MockBatchPart {
  return isRecord(value)
    && typeof value.partId === 'number'
    && typeof value.sliceIndex === 'number'
    && typeof value.text === 'string';
}

function isMockBatchChunk(value: unknown): value is MockBatchChunk {
  return isRecord(value)
    && typeof value.chunkId === 'string'
    && typeof value.segmentId === 'string'
    && Array.isArray(value.parts)
    && value.parts.length > 0
    && value.parts.every(isMockBatchPart);
}

/** 仅识别 buildBatchPrompt 的完整四行协议；普通划词文本无法伪造 batch route。 */
function extractBatchChunks(requestBody: unknown): MockBatchChunk[] | null {
  if (!isRecord(requestBody) || !Array.isArray(requestBody.messages)) return null;
  const userMessage = requestBody.messages.find(
    (message) => isRecord(message) && message.role === 'user' && typeof message.content === 'string',
  );
  if (!isRecord(userMessage) || typeof userMessage.content !== 'string') return null;

  const prompt = userMessage.content;
  const lines = prompt.split('\n');
  if (lines.length !== 4
    || !lines[0].startsWith(BATCH_PROMPT_PREFIX)
    || !lines[0].endsWith('.')
    || lines[0].slice(BATCH_PROMPT_PREFIX.length, -1).length === 0
    || lines[1] !== BATCH_REASONING_INSTRUCTION
    || lines[2] !== BATCH_OUTPUT_INSTRUCTION) {
    return null;
  }

  try {
    const chunks: unknown = JSON.parse(lines[3]);
    return Array.isArray(chunks) && chunks.length > 0 && chunks.every(isMockBatchChunk)
      ? chunks
      : null;
  } catch {
    return null;
  }
}

async function waitForBatchChunkRelease(chunkId: string): Promise<void> {
  if (!batchChunkGateEnabled) return;
  await new Promise<void>((release) => {
    pendingBatchChunks.push({ chunkId, release });
  });
}

function writeOpenAIDelta(res: ServerResponse, content: string): void {
  res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
}

async function sendOpenAIBatchStream(
  res: ServerResponse,
  chunks: MockBatchChunk[],
  omitFailedChunks: boolean,
  observationGeneration: number,
): Promise<void> {
  writeOpenAIDelta(res, '<think>mock private reasoning</think>\n');

  const completedChunks = omitFailedChunks
    ? chunks.filter((chunk) => !chunk.parts.some((part) => part.text.includes('__FAIL__')))
    : chunks;

  for (let index = 0; index < completedChunks.length; index += 1) {
    const chunk = completedChunks[index];
    await waitForBatchChunkRelease(chunk.chunkId);
    const objectText = JSON.stringify({
      chunkId: chunk.chunkId,
      translatedParts: chunk.parts.map((part) => ({
        partId: part.partId,
        sliceIndex: part.sliceIndex,
        text: MOCK_TRANSLATION,
      })),
    });

    // 首对象跨两个真实 SSE delta，覆盖 provider 行解析器与 batch object scanner 的组合边界。
    if (index === 0) {
      const splitAt = Math.max(1, Math.floor(objectText.length / 2));
      writeOpenAIDelta(res, objectText.slice(0, splitAt));
      writeOpenAIDelta(res, objectText.slice(splitAt));
    } else {
      writeOpenAIDelta(res, objectText);
    }
    if (observationGeneration === batchObservationGeneration) {
      emittedBatchChunkIds.push(chunk.chunkId);
    }

    if (index < completedChunks.length - 1) await sleep(CHUNK_DELAY_MS);
  }
}

/** 发送 OpenAI 兼容 SSE 流式响应:逐 chunk data 行,以 data: [DONE] 结束 */
async function sendOpenAIStream(
  res: ServerResponse,
  requestBody: unknown,
  omitFailedChunks: boolean,
): Promise<void> {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const batchChunks = extractBatchChunks(requestBody);
  if (batchChunks) {
    const observationGeneration = batchObservationGeneration;
    capturedBatchRequests.push({ chunks: cloneBatchChunks(batchChunks) });
    activeBatchRequests += 1;
    maxActiveBatchRequests = Math.max(maxActiveBatchRequests, activeBatchRequests);
    try {
      await sendOpenAIBatchStream(
        res,
        batchChunks,
        omitFailedChunks,
        observationGeneration,
      );
      res.write('data: [DONE]\n\n');
      res.end();
    } finally {
      if (observationGeneration === batchObservationGeneration) {
        activeBatchRequests -= 1;
      }
    }
    return;
  }

  for (const chunk of STREAM_CHUNKS) {
    writeOpenAIDelta(res, chunk);
    await sleep(CHUNK_DELAY_MS);
  }
  res.write('data: [DONE]\n\n');
  res.end();
}

/** 发送 OpenAI Responses SSE 流式响应:output_text delta 事件后以 completed + [DONE] 结束 */
async function sendOpenAIResponsesStream(res: ServerResponse): Promise<void> {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(`data: ${JSON.stringify({ type: 'response.created' })}\n\n`);
  for (const delta of STREAM_CHUNKS) {
    res.write(`data: ${JSON.stringify({ type: 'response.output_text.delta', delta })}\n\n`);
    await sleep(CHUNK_DELAY_MS);
  }
  res.write(`data: ${JSON.stringify({ type: 'response.completed' })}\n\n`);
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

        // 按路由(pathname)累计请求计数(含失败请求:缓存复用断言语义为「未发起新请求」)
        const route = (req.url ?? '').split('?')[0];
        requestCounts.set(route, (requestCounts.get(route) ?? 0) + 1);

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
          const batchChunks = isStream ? extractBatchChunks(parsedBody) : null;
          // 失败开关:仅对含 __FAIL__ 标记的请求返回 500(快速失败,不加非流式延迟)
          if (failMode && body.includes('__FAIL__') && batchChunks === null) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'mock forced failure for __FAIL__ segment' } }));
            return;
          }
          if (isStream) {
            await sendOpenAIStream(res, parsedBody, failMode);
          } else {
            await sleep(NONSTREAM_DELAY_MS);
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

        // OpenAI Responses API
        if (req.method === 'POST' && req.url?.includes('/v1/responses')) {
          if (isStream) {
            await sendOpenAIResponsesStream(res);
          } else {
            await sleep(NONSTREAM_DELAY_MS);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ output_text: '你好,世界', output: [] }));
          }
          return;
        }

        // Anthropic Messages API（原生协议，anthropic 响应风格）
        if (req.method === 'POST' && req.url?.includes('/v1/messages')) {
          if (isStream) {
            await sendAnthropicStream(res);
          } else {
            await sleep(NONSTREAM_DELAY_MS);
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
            await sleep(NONSTREAM_DELAY_MS);
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
          await sleep(NONSTREAM_DELAY_MS);
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
