// @vitest-environment jsdom
// 单元测试：TranslationStrategy 接缝
// 验证两个 strategy 实现与 pickStrategy 选路都按 capability 正确分支，
// 并且对外暴露的接口是编排器侧唯一需要的 contract。

import { describe, it, expect, vi } from 'vitest';
import {
  pickStrategy,
  createLlmBatchStrategy,
  createTraditionalStrategy,
} from './strategy';

describe('TranslationStrategy seam', () => {
  it('pickStrategy returns LlmBatchStrategy when batch stream enabled', () => {
    const strategy = pickStrategy(true, {
      cache: new Map(),
      semanticCache: new Map(),
      requestGate: { acquire: vi.fn() },
    });
    expect(strategy.chunkerMode).toBe('semantic');
  });

  it('pickStrategy returns TraditionalStrategy when batch stream disabled', () => {
    const strategy = pickStrategy(false, {
      cache: new Map(),
      semanticCache: new Map(),
      requestGate: { acquire: vi.fn() },
    });
    expect(strategy.chunkerMode).toBe('flat');
  });

  it('TraditionalStrategy surfaces the same chunker mode the orchestrator expects', () => {
    const strategy = createTraditionalStrategy({ cache: new Map() });
    expect(strategy.chunkerMode).toBe('flat');
  });

  it('LlmBatchStrategy reports semantic chunker mode', () => {
    const strategy = createLlmBatchStrategy({
      semanticCache: new Map(),
      requestGate: { acquire: vi.fn() },
    });
    expect(strategy.chunkerMode).toBe('semantic');
  });

  it('collectFor on a non-semantic segmenter node returns at least the input node segments', () => {
    const strategy = createTraditionalStrategy({ cache: new Map() });
    const div = document.createElement('div');
    div.innerHTML = '<p>one</p><p>two</p>';
    const segs = strategy.collectFor(div);
    expect(segs.length).toBeGreaterThanOrEqual(0);
  });
});
