// 单元测试：两个调度抽象
// Debouncer（重置型）与 DrainQueue（集合累积型）在 timer / 摘除 / clear 维度上的行为。

import { describe, it, expect, vi } from 'vitest';
import { createDebouncer, createDrainQueue } from './scheduler';

describe('createDebouncer', () => {
  it('collapses rapid adds into one drain after delay', () => {
    vi.useFakeTimers();
    const onDrain = vi.fn();
    const d = createDebouncer<number>(200, onDrain);
    d.add(1);
    d.add(2);
    d.add(3);
    expect(onDrain).not.toHaveBeenCalled();
    vi.advanceTimersByTime(199);
    expect(onDrain).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDrain).toHaveBeenCalledOnce();
    expect(onDrain).toHaveBeenCalledWith([1, 2, 3]);
    vi.useRealTimers();
  });

  it('re-entrant: new adds during drain schedule another drain', async () => {
    vi.useFakeTimers();
    let resolveDrain!: () => void;
    const onDrain = vi.fn(() => new Promise<void>((r) => { resolveDrain = r; }));
    const d = createDebouncer<number>(200, onDrain);
    d.add(1);
    vi.advanceTimersByTime(200);
    expect(onDrain).toHaveBeenCalledOnce();
    d.add(2);
    resolveDrain();
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(200);
    expect(onDrain).toHaveBeenCalledTimes(2);
    expect(onDrain.mock.calls[1][0]).toEqual([2]);
    vi.useRealTimers();
  });

  it('cancel clears pending + timer', () => {
    vi.useFakeTimers();
    const onDrain = vi.fn();
    const d = createDebouncer<number>(200, onDrain);
    d.add(1);
    d.cancel();
    vi.advanceTimersByTime(500);
    expect(onDrain).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('createDrainQueue', () => {
  it('accumulates adds and drains the whole set once', () => {
    vi.useFakeTimers();
    const onDrain = vi.fn();
    const q = createDrainQueue<number>(onDrain);
    q.add(1);
    q.add(2);
    q.scheduleTimer(25);
    q.add(3); // timer 已设，不再重置；成员仍入集合
    expect(onDrain).not.toHaveBeenCalled();
    vi.advanceTimersByTime(25);
    expect(onDrain).toHaveBeenCalledOnce();
    expect(onDrain).toHaveBeenCalledWith([1, 2, 3]);
    vi.useRealTimers();
  });

  it('scheduleTimer is a no-op while a timer is pending', () => {
    vi.useFakeTimers();
    const onDrain = vi.fn();
    const q = createDrainQueue<number>(onDrain);
    q.add(1);
    q.scheduleTimer(100);
    q.scheduleTimer(10); // 不重置
    vi.advanceTimersByTime(10);
    expect(onDrain).not.toHaveBeenCalled();
    vi.advanceTimersByTime(90);
    expect(onDrain).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('remove drops items before drain', () => {
    vi.useFakeTimers();
    const onDrain = vi.fn();
    const q = createDrainQueue<number>(onDrain);
    q.add(1);
    q.add(2);
    q.remove(1);
    expect(q.has(1)).toBe(false);
    expect(q.has(2)).toBe(true);
    q.scheduleTimer(25);
    vi.advanceTimersByTime(25);
    expect(onDrain).toHaveBeenCalledWith([2]);
    vi.useRealTimers();
  });

  it('scheduleTimer with empty queue does not arm a timer', () => {
    vi.useFakeTimers();
    const onDrain = vi.fn();
    const q = createDrainQueue<number>(onDrain);
    q.scheduleTimer(25);
    vi.advanceTimersByTime(100);
    expect(onDrain).not.toHaveBeenCalled();
    // 之后再 add 仍能正常排空
    q.add(1);
    q.scheduleTimer(25);
    vi.advanceTimersByTime(25);
    expect(onDrain).toHaveBeenCalledWith([1]);
    vi.useRealTimers();
  });

  it('clear drops both pending items and timer', () => {
    vi.useFakeTimers();
    const onDrain = vi.fn();
    const q = createDrainQueue<number>(onDrain);
    q.add(1);
    q.scheduleTimer(25);
    q.clear();
    vi.advanceTimersByTime(100);
    expect(onDrain).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('queue can be reused after drain', () => {
    vi.useFakeTimers();
    const onDrain = vi.fn();
    const q = createDrainQueue<number>(onDrain);
    q.add(1);
    q.scheduleTimer(25);
    vi.advanceTimersByTime(25);
    expect(onDrain).toHaveBeenCalledTimes(1);
    q.add(2);
    q.scheduleTimer(25);
    vi.advanceTimersByTime(25);
    expect(onDrain).toHaveBeenCalledTimes(2);
    expect(onDrain).toHaveBeenCalledWith([2]);
    vi.useRealTimers();
  });
});
