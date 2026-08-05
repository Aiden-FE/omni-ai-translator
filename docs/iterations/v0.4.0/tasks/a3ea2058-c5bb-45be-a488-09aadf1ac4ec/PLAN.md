# 实施计划 — 扩展 e2e 验证视口优先调度与恢复清理

> 任务 ID: `a3ea2058-c5bb-45be-a488-09aadf1ac4ec`
> 父迭代: `v0.4.0`
> 依赖: `docs/iterations/v0.4.0/tasks/a3ea2058-c5bb-45be-a488-09aadf1ac4ec/DESIGN.md`

## 任务拆分

| 步骤 | 任务 | 文件 | 类型 | 验证 |
|------|------|------|------|------|
| s1 | 重写用例 2 使用视口 fixture + 双断言（计数 + 无 data-llm-translator） | `e2e/fullpage.spec.ts` | TDD 红 | 跑 `pnpm test:e2e e2e/fullpage.spec.ts`：用例 2 期望绿（实现已到位）；临时移除 `handleRestore` 中 `viewportObserver?.disconnect()` 后期望用例 2 红（data-llm-translator 断言失败） |
| s2 | 端到端验证 | — | 验证 | 跑 `pnpm test:e2e e2e/fullpage.spec.ts` 期望 10 用例全绿 |
| s3 | typecheck / lint | — | 验证 | `pnpm typecheck` / `pnpm lint`（如可用） |

## 步骤详情

### s1 — 重写用例 2 消除假阳性

**目标**：根据审查反馈,用例 2 当前使用现有 fixture（9 段全视口内）导致 `viewportObserver` 句柄根本不会被创建,`handleRestore` 末尾的 `disconnect` 调用即使被移除也能通过测试。改用 `viewportTestPageUrl` 并加「`[data-llm-translator]` count = 0」强断言,确保 `disconnect` 调用被回归保护。

**改动**:`e2e/fullpage.spec.ts` 用例 2 替换为以下流程:

1. `openTestPageUrl(context, viewportTestPageUrl)`(用视口 fixture)。
2. `triggerFullpageTranslate(context, 'replace')`。
3. 等待 3 视口内段(`#in-1..#in-3`)译出。
4. 断言:`getRequestCount('/v1/chat/completions') === 3`。
5. 断言:6 视口外段(`#out-1..#out-6`)仍为原文(loading 宿主可见但文本未变)。
6. 点击「恢复原文」→ 等待 `[data-llm-translator]` count = 0。
7. 分步滚动(半视口步进 + rAF)→ 等待 2s。
8. 断言:6 视口外段**仍为原文**(无 onEnter 触发翻译)。
9. **核心断言**:`[data-llm-translator]` count **仍为 0**(IO 已 disconnect,无新 loading 宿主)。
10. 断言:请求计数仍为 3(sanity check,即使 onEnter 触发也因 `shouldStop` 不派发)。

**TDD 实证(临时移除 disconnect 期望失败)**:
- 临时在 `shared/fullpage/orchestrator.ts` 的 `handleRestore` 中注释掉 `viewportObserver?.disconnect(); viewportObserver = null;` 两行。
- 跑 `pnpm test:e2e e2e/fullpage.spec.ts`:用例 2 在断言 9 处失败(滚动后 `[data-llm-translator]` count = 6,即 6 个新 loading 宿主)。
- 还原 `disconnect` 调用 → 用例 2 重新绿。

**接口消费**(无新增):
- 既有 `openTestPageUrl`、`configureMockProvider`、`triggerFullpageTranslate`、`getRequestCount`。

### s2 — 端到端验证

跑 `pnpm test:e2e e2e/fullpage.spec.ts`，期望：

- 8 原用例全绿（零回归）。
- 用例 1 视口外滚动入池全绿。
- 用例 2 恢复后 IO disconnect 验证全绿（新增强断言捕获回归）。

如失败：
- 视口内段计数 ≠ 3 → 检查 `isSegmentInViewport` / 编排器视口分组。
- 视口外段计数 ≠ 9（用例 1） → 检查 IO 触发链路 / `viewportObserver.onEnter`。
- 用例 2 滚动后 `[data-llm-translator]` count > 0 → 检查 `handleRestore` 末尾 `disconnect` 调用。
- 用例 2 滚动后 6 视口外段被翻译 → 检查 `handleRestore` 末尾 `disconnect` 调用。

### s3 — typecheck / lint

- `pnpm typecheck`（vue-tsc --noEmit）—— 新增断言代码应通过。
- `pnpm lint`（eslint）—— 新增代码应符合现有风格。

## 依赖关系

```
s1 (写失败测试) ──→ s2 (新建 fixture) ──→ s3 (e2e 验证) ──→ s4 (typecheck/lint)
                  └─→ 用例 2 已可绿 (复用现有 fixture)
```

## 验证矩阵

| 用例 | 验证目标 | 失败信号 |
|------|---------|---------|
| 用例 1.a | 视口内段立即入池 | 段文本非 MOCK_TRANSLATION |
| 用例 1.b | 请求计数 = 3（仅视口内） | getRequestCount > 3 |
| 用例 1.c | 视口外段初始为原文 | 段文本为 MOCK_TRANSLATION |
| 用例 1.d | 滚动后 6 段全部译出 | expect.poll 超时 |
| 用例 1.e | 滚动后请求计数 = 9 | getRequestCount !== 9 |
| 用例 2.a | 恢复后滚动无新请求 | getRequestCount +1+ |

## 风险与对策

| 风险 | 对策 |
|------|------|
| 现有 8 用例时序被破坏 | 新 fixture 独立，不改现有 fixture |
| 视口内段 DOM 顺序与计数 3 不匹配 | `#in-1..#in-3` 紧邻 body 顶部，无 spacer 干扰 |
| `page.evaluate` 滚动后 IO 触发未及时 | `expect.poll` timeout 15s 足够 |
| 现有 9 段 fixture 高度意外超出 720 | 任务描述已确认总高 < 600px |
| 用例 2 滚动后无 IO 触发导致假阳性 | 编排器已实现 disconnect，断言「计数不变」是正确语义 |
