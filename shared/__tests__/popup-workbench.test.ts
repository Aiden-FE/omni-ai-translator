// popup 文本翻译工作台状态机单测
// - #77 验收标准「单测覆盖翻译工作台状态机(空 / 就绪 / 超限)」
// - #79 验收标准「单测覆盖流式状态机(就绪 → 流式 → 完成 / 停止)」
// 被测 seam：shared/popup-workbench.ts 的纯函数状态机（无 DOM / browser 依赖）
import { describe, it, expect } from 'vitest';
import {
  WORKBENCH_MAX_LENGTH,
  createWorkbenchState,
  deriveWorkbenchInput,
  reduceWorkbench,
} from '../popup-workbench';
import type { WorkbenchState } from '../popup-workbench';

/** 构造处于流式中的状态（ready → stream-start） */
function streamingState(text = 'hello'): WorkbenchState {
  return reduceWorkbench(
    reduceWorkbench(createWorkbenchState(), { type: 'edit-text', text }),
    { type: 'stream-start' },
  );
}

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

describe('reduceWorkbench — 输入与启动迁移', () => {
  it('edit-text: 输入文本 → 进入 ready', () => {
    const next = reduceWorkbench(createWorkbenchState(), { type: 'edit-text', text: 'hello' });
    expect(next.inputPhase).toBe('ready');
    expect(next.sourceText).toBe('hello');
  });

  it('stream-start: ready → streaming,原文保留(翻译中同屏可见)', () => {
    const ready = reduceWorkbench(createWorkbenchState(), { type: 'edit-text', text: 'hello' });
    const next = reduceWorkbench(ready, { type: 'stream-start' });
    expect(next.outputPhase).toBe('streaming');
    expect(next.sourceText).toBe('hello');
    expect(next.translatedText).toBe('');
    expect(next.errorMessage).toBe('');
  });

  it('stream-start: empty → 拒绝迁移(返回原 state)', () => {
    const initial = createWorkbenchState();
    expect(reduceWorkbench(initial, { type: 'stream-start' })).toBe(initial);
  });

  it('stream-start: overlimit → 拒绝迁移', () => {
    const overlimit = reduceWorkbench(createWorkbenchState(), {
      type: 'edit-text',
      text: 'a'.repeat(5001),
    });
    expect(reduceWorkbench(overlimit, { type: 'stream-start' })).toBe(overlimit);
  });

  it('stream-start: 重新翻译时清空上一轮译文与错误', () => {
    const stopped = reduceWorkbench(streamingState(), { type: 'stream-stop' });
    const edited = reduceWorkbench(stopped, { type: 'edit-text', text: 'hello world' });
    const next = reduceWorkbench(edited, { type: 'stream-start' });
    expect(next.outputPhase).toBe('streaming');
    expect(next.translatedText).toBe('');
    expect(next.errorMessage).toBe('');
  });
});

describe('reduceWorkbench — 流式迁移(就绪 → 流式 → 完成 / 停止)', () => {
  it('stream-chunk: 流式期间增量追加译文', () => {
    const streaming = streamingState();
    const s1 = reduceWorkbench(streaming, { type: 'stream-chunk', deltaText: '你' });
    const s2 = reduceWorkbench(s1, { type: 'stream-chunk', deltaText: '好' });
    expect(s1.translatedText).toBe('你');
    expect(s2.translatedText).toBe('你好');
    expect(s2.outputPhase).toBe('streaming');
  });

  it('stream-chunk: 非流式阶段为 no-op(晚到分片被忽略)', () => {
    const idle = reduceWorkbench(createWorkbenchState(), { type: 'edit-text', text: 'hello' });
    expect(reduceWorkbench(idle, { type: 'stream-chunk', deltaText: '你' })).toBe(idle);
  });

  it('stream-done: 流式 → success,译文以 done.result 为准', () => {
    const streaming = reduceWorkbench(streamingState(), { type: 'stream-chunk', deltaText: '你' });
    const next = reduceWorkbench(streaming, {
      type: 'stream-done',
      result: { translatedText: '你好' },
    });
    expect(next.outputPhase).toBe('success');
    expect(next.translatedText).toBe('你好');
    expect(next.errorMessage).toBe('');
  });

  it('stream-done: result 译文为空时保留已累计的部分译文', () => {
    const streaming = reduceWorkbench(streamingState(), { type: 'stream-chunk', deltaText: '你好' });
    const next = reduceWorkbench(streaming, {
      type: 'stream-done',
      result: { translatedText: '' },
    });
    expect(next.outputPhase).toBe('success');
    expect(next.translatedText).toBe('你好');
  });

  it('stream-done: 无 chunk 直接 done → 渲染完整译文', () => {
    const next = reduceWorkbench(streamingState(), {
      type: 'stream-done',
      result: { translatedText: '你好' },
    });
    expect(next.outputPhase).toBe('success');
    expect(next.translatedText).toBe('你好');
  });

  it('stream-error: 流式 → error 与错误文案', () => {
    const next = reduceWorkbench(streamingState(), {
      type: 'stream-error',
      message: '未配置生效源',
    });
    expect(next.outputPhase).toBe('error');
    expect(next.errorMessage).toBe('未配置生效源');
    expect(next.translatedText).toBe('');
  });

  it('stream-stop: 保留已到达的部分译文,进入 stopped', () => {
    const streaming = reduceWorkbench(streamingState(), { type: 'stream-chunk', deltaText: '你好世' });
    const next = reduceWorkbench(streaming, { type: 'stream-stop' });
    expect(next.outputPhase).toBe('stopped');
    expect(next.translatedText).toBe('你好世');
    expect(next.sourceText).toBe('hello');
  });

  it('stream-stop: 一个 chunk 都未到达时也可停止(部分译文为空)', () => {
    const next = reduceWorkbench(streamingState(), { type: 'stream-stop' });
    expect(next.outputPhase).toBe('stopped');
    expect(next.translatedText).toBe('');
  });

  it('stream-stop: 非流式阶段为 no-op', () => {
    const idle = reduceWorkbench(createWorkbenchState(), { type: 'edit-text', text: 'hello' });
    expect(reduceWorkbench(idle, { type: 'stream-stop' })).toBe(idle);

    const done = reduceWorkbench(streamingState(), {
      type: 'stream-done',
      result: { translatedText: '你好' },
    });
    expect(reduceWorkbench(done, { type: 'stream-stop' })).toBe(done);
  });

  it('stream-done / stream-error / stream-chunk: 终态后晚到回调为 no-op', () => {
    const stopped = reduceWorkbench(streamingState(), { type: 'stream-stop' });
    expect(reduceWorkbench(stopped, { type: 'stream-chunk', deltaText: '晚到' })).toBe(stopped);
    expect(
      reduceWorkbench(stopped, { type: 'stream-done', result: { translatedText: '晚到' } }),
    ).toBe(stopped);
    expect(reduceWorkbench(stopped, { type: 'stream-error', message: '晚到' })).toBe(stopped);
  });

  it('streaming 期间 edit-text 被拒绝(原文区锁定)', () => {
    const streaming = streamingState();
    expect(reduceWorkbench(streaming, { type: 'edit-text', text: '篡改' })).toBe(streaming);
  });

  it('停止后可继续编辑原文并重新翻译(部分译文保留直至新一轮开始)', () => {
    const stopped = reduceWorkbench(
      reduceWorkbench(streamingState(), { type: 'stream-chunk', deltaText: '你好' }),
      { type: 'stream-stop' },
    );
    const edited = reduceWorkbench(stopped, { type: 'edit-text', text: 'hello world' });
    expect(edited.inputPhase).toBe('ready');
    expect(edited.sourceText).toBe('hello world');
    expect(edited.outputPhase).toBe('stopped');
    expect(edited.translatedText).toBe('你好');

    const restarted = reduceWorkbench(edited, { type: 'stream-start' });
    expect(restarted.outputPhase).toBe('streaming');
    expect(restarted.translatedText).toBe('');
  });

  it('edit-text 不清除已有译文(完成态修改原文后可再次翻译)', () => {
    const done = reduceWorkbench(streamingState(), {
      type: 'stream-done',
      result: { translatedText: '你好' },
    });
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
