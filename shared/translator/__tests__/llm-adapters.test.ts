// 单元测试：LlmProtocolAdapter 接缝
// 验证四种协议的 buildHeaders / buildScalarBody / parseScalarResponse / buildStreamBody
// 与 readStream 行为符合原实现。

import { describe, it, expect } from 'vitest';
import type { ProviderConfig } from '@/shared/types';
import {
  getLlmProtocolAdapter,
  buildLlmUrl,
  ANTHROPIC_BATCH_MAX_TOKENS,
  ANTHROPIC_SCALAR_MAX_TOKENS,
} from '../llm-adapters';

function makeProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'test',
    name: 'test',
    type: 'llm',
    baseUrl: 'https://example.com/v1',
    model: 'm',
    ...overrides,
  };
}

describe('buildLlmUrl', () => {
  it('appends the protocol-specific path suffix', () => {
    expect(buildLlmUrl('https://api.openai.com/v1', 'openai-completions'))
      .toBe('https://api.openai.com/v1/chat/completions');
    expect(buildLlmUrl('https://api.openai.com/v1', 'openai-responses'))
      .toBe('https://api.openai.com/v1/responses');
    expect(buildLlmUrl('https://api.anthropic.com/v1', 'anthropic'))
      .toBe('https://api.anthropic.com/v1/messages');
    expect(buildLlmUrl('http://localhost:11434', 'ollama'))
      .toBe('http://localhost:11434/api/chat');
  });

  it('does not double the suffix if already present', () => {
    expect(buildLlmUrl('https://api.openai.com/v1/chat/completions', 'openai-completions'))
      .toBe('https://api.openai.com/v1/chat/completions');
  });
});

describe('OpenAI Chat Completions adapter', () => {
  const adapter = getLlmProtocolAdapter('openai-completions');

  it('buildHeaders adds Bearer auth only when apiKey present', () => {
    expect(adapter.buildHeaders(makeProvider())).toEqual({ 'Content-Type': 'application/json' });
    expect(adapter.buildHeaders(makeProvider({ apiKey: 'k' })))
      .toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer k' });
  });

  it('buildScalarBody sends prompt as user content', () => {
    const body = adapter.buildScalarBody(makeProvider(), 'PROMPT', 'TEXT');
    expect(body).toMatchObject({
      model: 'm',
      messages: [{ role: 'user', content: 'PROMPT' }],
      reasoning_effort: 'none',
      temperature: 0.3,
    });
  });

  it('parseScalarResponse extracts choices[0].message.content', () => {
    expect(adapter.parseScalarResponse({ choices: [{ message: { content: '  hi  ' } }] }))
      .toBe('hi');
    expect(adapter.parseScalarResponse({})).toBe('');
  });

  it('buildStreamBody adds stream: true', () => {
    const body = adapter.buildStreamBody(makeProvider(), 'PROMPT') as Record<string, unknown>;
    expect(body.stream).toBe(true);
    expect(body.messages).toEqual([{ role: 'user', content: 'PROMPT' }]);
  });
});

describe('OpenAI Responses adapter', () => {
  const adapter = getLlmProtocolAdapter('openai-responses');

  it('parseScalarResponse falls back to scanning output[].content[].text', () => {
    expect(adapter.parseScalarResponse({
      output: [{ content: [{ type: 'output_text', text: 'hello ' }, { type: 'output_text', text: 'world' }] }],
    })).toBe('hello world');
    expect(adapter.parseScalarResponse({ output_text: 'direct' })).toBe('direct');
  });

  it('buildStreamBody sets input + stream: true', () => {
    const body = adapter.buildStreamBody(makeProvider(), 'PROMPT') as Record<string, unknown>;
    expect(body).toMatchObject({ model: 'm', input: 'PROMPT', stream: true });
  });
});

describe('Anthropic adapter', () => {
  const adapter = getLlmProtocolAdapter('anthropic');

  it('buildHeaders includes x-api-key only when apiKey present + anthropic-version', () => {
    expect(adapter.buildHeaders(makeProvider({ apiKey: 'sk' })))
      .toEqual({ 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': 'sk' });
    expect(adapter.buildHeaders(makeProvider()))
      .toEqual({ 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' });
  });

  it('buildScalarBody uses system=prompt + user=userText + ANTHROPIC_SCALAR_MAX_TOKENS', () => {
    const body = adapter.buildScalarBody(makeProvider(), 'PROMPT', 'TEXT') as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'm',
      max_tokens: ANTHROPIC_SCALAR_MAX_TOKENS,
      system: 'PROMPT',
      messages: [{ role: 'user', content: 'TEXT' }],
      thinking: { type: 'disabled' },
      temperature: 0.3,
    });
  });

  it('buildStreamBody respects AnthropicStreamOptions overrides', () => {
    const body = adapter.buildStreamBody(makeProvider(), 'SYSTEM', {
      userContent: 'USER',
      maxTokens: ANTHROPIC_BATCH_MAX_TOKENS,
    }) as Record<string, unknown>;
    expect(body).toMatchObject({
      max_tokens: ANTHROPIC_BATCH_MAX_TOKENS,
      system: 'SYSTEM',
      messages: [{ role: 'user', content: 'USER' }],
      stream: true,
    });
  });

  it('parseScalarResponse extracts content[0].text', () => {
    expect(adapter.parseScalarResponse({ content: [{ type: 'text', text: '  hi  ' }] }))
      .toBe('hi');
    expect(adapter.parseScalarResponse({})).toBe('');
  });
});

describe('Ollama adapter', () => {
  const adapter = getLlmProtocolAdapter('ollama');

  it('buildHeaders has no auth', () => {
    expect(adapter.buildHeaders(makeProvider({ apiKey: 'whatever' })))
      .toEqual({ 'Content-Type': 'application/json' });
  });

  it('buildScalarBody sets stream: false + think: false', () => {
    const body = adapter.buildScalarBody(makeProvider(), 'PROMPT', 'TEXT') as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'm',
      stream: false,
      think: false,
      messages: [{ role: 'user', content: 'PROMPT' }],
    });
  });

  it('parseScalarResponse reads message.content', () => {
    expect(adapter.parseScalarResponse({ message: { content: ' hi ' } })).toBe('hi');
    expect(adapter.parseScalarResponse({})).toBe('');
  });
});
