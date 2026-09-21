// 编排器子状态对象 — 两个调度抽象封装各自的 timer 与本地状态。
//
// 编排器是唯一状态持有者（见 ADR-0001 §3.3）。它原本的 ~20 个模块级 `let` 里，
// 三个 timer 驱动的子系统各自维护一个 timer + 一个 pending 集合：
//   1. 增量翻译防抖（200ms，重置型：每次 mutation 重置 timer）
//   2. micro-batch 队列（25ms，集合累积型：timer 只设一次，drain 取集合快照）
//   3. 视口外延迟排空（100ms / 0ms，同 2，但成员可被中途移除）
//
// 2 和 3 语义一致（集合累积 + scheduleTimer 不重置 + drain 清空集合），合并为
// DrainQueue；1 的「重置 timer + drain 期间新到达再排」单独为 Debouncer。
// 「会话是否有效」的判断不在调度器内——回调由编排器注入，编排器自行校验 generation。

/**
 * 防抖调度器：每次 add 重置 timer，`delayMs` 静默后调用 onDrain(batch)。
 * drain 期间新到达的项目在 drain 完成后触发下一轮（re-entrant）。
 */
export interface Debouncer<T> {
  add(node: T): void;
  /** 清空 pending 与 timer，不触发 drain。 */
  cancel(): void;
}

export function createDebouncer<T>(
  delayMs: number,
  onDrain: (batch: T[]) => Promise<void> | void,
): Debouncer<T> {
  let pending: Set<T> = new Set();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let draining = false;

  const drain = (): void => {
    if (draining) return;
    draining = true;
    timer = null;
    const batch = Array.from(pending);
    pending = new Set();
    Promise.resolve(onDrain(batch))
      .catch(() => {
        /* flush 异常不阻断宿主页面；后续 mutation 会重新调度 */
      })
      .finally(() => {
        draining = false;
        if (pending.size > 0 && timer === null) {
          timer = setTimeout(drain, delayMs);
        }
      });
  };

  return {
    add(node: T): void {
      pending.add(node);
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(drain, delayMs);
    },
    cancel(): void {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      pending = new Set();
      draining = false;
    },
  };
}

/**
 * 集合累积型排空队列：add 把项目累积进集合；scheduleTimer 在尚无 timer 时安排一次
 * drain（已有时不重置——与原 scheduleDeferredDrain / queueSegments 语义一致）；
 * drain 时把集合当前内容整体交给 onDrain 并清空。remove / has 支持中途摘除
 * （视口进入、SPA 节点删除）。
 */
export interface DrainQueue<T> {
  add(item: T): void;
  remove(item: T): void;
  has(item: T): boolean;
  /** 尚无 timer 时安排 drain；已有 timer 时不重置。 */
  scheduleTimer(delayMs: number): void;
  /** 清空集合并取消 timer。 */
  clear(): void;
}

export function createDrainQueue<T>(
  onDrain: (items: T[]) => void,
): DrainQueue<T> {
  let queue: Set<T> = new Set();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const drain = (): void => {
    timer = null;
    const items = Array.from(queue);
    queue = new Set();
    onDrain(items);
  };

  return {
    add(item: T): void {
      queue.add(item);
    },
    remove(item: T): void {
      queue.delete(item);
    },
    has(item: T): boolean {
      return queue.has(item);
    },
    scheduleTimer(delayMs: number): void {
      if (timer !== null) return;
      if (queue.size === 0) return;
      timer = setTimeout(drain, delayMs);
    },
    clear(): void {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      queue = new Set();
    },
  };
}
