import { describe, expect, it } from 'vitest';
import {
  createReasoningStreamFilter,
  sanitizeReasoningArtifacts,
} from './reasoning-filter';

describe('reasoning artifact filter', () => {
  it('removes complete reasoning blocks and control tokens', () => {
    expect(sanitizeReasoningArtifacts(
      '<think>translate rationale</think>关注我们</s>',
    )).toBe('关注我们');
  });

  it('does not emit a think block split across network deltas', () => {
    const visible: string[] = [];
    const filter = createReasoningStreamFilter((text) => visible.push(text));

    filter.push('<thi');
    filter.push('nk>secret reasoning</th');
    filter.push('ink>译文</s>');

    expect(filter.finish()).toBe('译文');
    expect(visible.join('')).toBe('译文');
  });

  it('emits proven normal text before finish while buffering split control tokens', () => {
    const visible: string[] = [];
    const filter = createReasoningStreamFilter((text) => visible.push(text));

    filter.push('即时');
    expect(visible.join('')).toBe('即时');

    filter.push('译文</');
    expect(visible.join('')).toBe('即时译文');

    filter.push('s>');
    expect(filter.finish()).toBe('即时译文');
    expect(visible.join('')).toBe('即时译文');
  });

  it('suppresses analysis blocks without withholding following translation', () => {
    const visible: string[] = [];
    const filter = createReasoningStreamFilter((text) => visible.push(text));

    filter.push('<analysis>private chain');
    filter.push(' of thought</analysis>可见译文');

    expect(filter.finish()).toBe('可见译文');
    expect(visible.join('')).toBe('可见译文');
  });
});
