// popup 文本翻译工作台状态机单测 — #77 验收标准「单测覆盖翻译工作台状态机(空 / 就绪 / 超限)」
// 被测 seam：shared/popup-workbench.ts 的纯函数状态机（无 DOM / browser 依赖）
import { describe, it, expect } from 'vitest';
import {
  WORKBENCH_MAX_LENGTH,
  createWorkbenchState,
  deriveWorkbenchInput,
  reduceWorkbench,
} from '../popup-workbench';

describe('deriveWorkbenchInput — 原文输入准入判定', () => {
  it('空字符串 → empty 且不可翻译', () => {
    const input = deriveWorkbenchInput('');
    expect(input.phase).toBe('empty');
    expect(input.charCount).toBe(0);
    expect(input.canTranslate).toBe(false);
  });

  it('仅空白字符 → empty(空白内容不可提交)', () => {
    const input = deriveWorkbenchInput('   \n\t ');
    expect(input.phase).toBe('empty');
    expect(input.canTranslate).toBe(false);
  });

  it('正常文本 → ready 且可翻译', () => {
    const input = deriveWorkbenchInput('你好世界');
    expect(input.phase).toBe('ready');
    expect(input.charCount).toBe(4);
    expect(input.canTranslate).toBe(true);
  });

  it('恰好 5000 码点 → 仍为 ready(边界含上限)', () => {
    const input = deriveWorkbenchInput('a'.repeat(5000));
    expect(input.phase).toBe('ready');
    expect(input.canTranslate).toBe(true);
  });

  it('5001 码点 → overlimit 且不可翻译', () => {
    const input = deriveWorkbenchInput('a'.repeat(5001));
    expect(input.phase).toBe('overlimit');
    expect(input.charCount).toBe(5001);
    expect(input.canTranslate).toBe(false);
  });

  it('含 emoji 的代理对按码点计数(1 个 emoji = 1 字符)', () => {
    const input = deriveWorkbenchInput('😀'.repeat(5000));
    expect(input.charCount).toBe(5000);
    expect(input.phase).toBe('ready');
  });

  it('超长内容完整保留(不自动截断)', () => {
    const longText = 'x'.repeat(6000);
    const next = reduceWorkbench(createWorkbenchState(), { type: 'edit-text', text: longText });
    expect(next.sourceText).toBe(longText);
    expect(next.inputPhase).toBe('overlimit');
  });
});

describe('createWorkbenchState — 初始状态', () => {
  it('空原文、idle 译文、无错误', () => {
    expect(createWorkbenchState()).toEqual({
      sourceText: '',
      inputPhase: 'empty',
      outputPhase: 'idle',
      translatedText: '',
      errorMessage: '',
    });
  });
});

describe('reduceWorkbench — 状态迁移', () => {
  it('edit-text: 输入文本 → 进入 ready', () => {
    const next = reduceWorkbench(createWorkbenchState(), { type: 'edit-text', text: 'hello' });
    expect(next.inputPhase).toBe('ready');
    expect(next.sourceText).toBe('hello');
  });

  it('translate-start: ready → translating,原文保留(翻译中同屏可见)', () => {
    const ready = reduceWorkbench(createWorkbenchState(), { type: 'edit-text', text: 'hello' });
    const next = reduceWorkbench(ready, { type: 'translate-start' });
    expect(next.outputPhase).toBe('translating');
    expect(next.sourceText).toBe('hello');
    expect(next.translatedText).toBe('');
    expect(next.errorMessage).toBe('');
  });

  it('translate-start: empty → 拒绝迁移(返回原 state)', () => {
    const initial = createWorkbenchState();
    expect(reduceWorkbench(initial, { type: 'translate-start' })).toBe(initial);
  });

  it('translate-start: overlimit → 拒绝迁移', () => {
    const overlimit = reduceWorkbench(createWorkbenchState(), {
      type: 'edit-text',
      text: 'a'.repeat(5001),
    });
    expect(reduceWorkbench(overlimit, { type: 'translate-start' })).toBe(overlimit);
  });

  it('translate-success: 译文渲染,原文与译文同屏(源文不变)', () => {
    const translating = reduceWorkbench(
      reduceWorkbench(createWorkbenchState(), { type: 'edit-text', text: 'hello' }),
      { type: 'translate-start' },
    );
    const next = reduceWorkbench(translating, {
      type: 'translate-success',
      result: { translatedText: '你好' },
    });
    expect(next.outputPhase).toBe('success');
    expect(next.translatedText).toBe('你好');
    expect(next.sourceText).toBe('hello');
  });

  it('translate-error: 输出 error 与错误文案', () => {
    const translating = reduceWorkbench(
      reduceWorkbench(createWorkbenchState(), { type: 'edit-text', text: 'hello' }),
      { type: 'translate-start' },
    );
    const next = reduceWorkbench(translating, {
      type: 'translate-error',
      message: '未配置生效源',
    });
    expect(next.outputPhase).toBe('error');
    expect(next.errorMessage).toBe('未配置生效源');
    expect(next.translatedText).toBe('');
  });

  it('translate-success / translate-error: 非 translating 阶段为 no-op(晚到回调被忽略)', () => {
    const idle = reduceWorkbench(createWorkbenchState(), { type: 'edit-text', text: 'hello' });
    expect(
      reduceWorkbench(idle, { type: 'translate-success', result: { translatedText: '你好' } }),
    ).toBe(idle);
    expect(reduceWorkbench(idle, { type: 'translate-error', message: 'x' })).toBe(idle);
  });

  it('edit-text 不清除已有译文(修改原文后可再次翻译,结果区保留)', () => {
    const done = reduceWorkbench(
      reduceWorkbench(
        reduceWorkbench(createWorkbenchState(), { type: 'edit-text', text: 'hello' }),
        { type: 'translate-start' },
      ),
      { type: 'translate-success', result: { translatedText: '你好' } },
    );
    const next = reduceWorkbench(done, { type: 'edit-text', text: 'hello world' });
    expect(next.translatedText).toBe('你好');
    expect(next.outputPhase).toBe('success');
  });
});

describe('WORKBENCH_MAX_LENGTH', () => {
  it('字数上限为 5000', () => {
    expect(WORKBENCH_MAX_LENGTH).toBe(5000);
  });
});
