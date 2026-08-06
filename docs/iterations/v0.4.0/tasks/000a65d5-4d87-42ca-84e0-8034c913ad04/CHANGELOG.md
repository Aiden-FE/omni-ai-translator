# CHANGELOG: 移除段尾 loading 文案与 aria-label

> 版本 v0.4.0 | 任务: 000a65d5-4d87-42ca-84e0-8034c913ad04

## 变更内容

### 修改

- `shared/fullpage/renderer.ts`（`markLoading` 行为简化）：
  - 移除原段尾 loading 状态节点的文案内容（「正在翻译此段」等可读文本），仅保留 `role="status"` 无障碍语义与 spinner 视觉元素。
  - 移除 `aria-label` 属性（仅保留 `role="status"` 语义标签），避免屏幕阅读器朗读与设计回退到「正在翻译此段」等可读文本破坏页面结构。
  - 加载标记由「视觉 + 文字 + aria-label」三件套收敛为「spinner + `role="status"`」两件套：
    - `spinner.setAttribute('aria-hidden', 'true')`（仅视觉，无语义读屏）。
    - `status.setAttribute('role', 'status')`（保留实时状态语义，便于 AT 用户感知翻译在进行）。
    - status 容器不再设 `aria-label`，shadow root 内不再注入可读文本节点。

## 设计决策

- **不破坏页面结构**：loading 标记通过 Shadow DOM 注入到段尾，shadow 内若写入可读文本，会以块级形式出现在页面（即使在 shadow 内也会被可访问性树读取）。移除文案可避免「视觉上未打扰、AT 树中却有 '正在翻译此段'」的隐性侵入。
- **保留 `role="status"` 而非删除整节点**：屏幕阅读器可在「翻译进行中 → 完成」的状态变化时收到 polite 播报，但具体内容由 AT 用户自行感知（spinner 视觉），避免强制朗读模板化文本。
- **与「spinner-only」工具栏进度行一致**：t5 编排器 `setProgress` 走 `aria-live="polite"` 工具栏进度行承担详细进度播报；段尾 loading 标记仅承担「单段进行中」的视觉占位，重复播报会让体验嘈杂。

## 验证（依据任务内既有测试）

- `shared/fullpage/renderer.test.ts`：
  - 「重复标记时复用单个 Shadow DOM 加载状态」用例断言：
    - `statusEl?.getAttribute('aria-label')` 为 `null`（移除断言）。
    - `statusEl?.getAttribute('role')` 为 `'status'`（保留）。
    - shadow root 内 `textContent` 不包含「正在翻译此段」（防设计回退）。
    - spinner 节点仍存在且 `aria-hidden='true'`（视觉反馈保留）。
- 全量回归：`vitest run` → 既有用例无回归（依据 e2e 任务 9d51a89a 与视口调度任务 83a350c8 的合并验证记录：15 → 20 → 35 + 9 用例递增，均覆盖 `markLoading` 路径）。

## 来源证据

- 产品代码：`shared/fullpage/renderer.ts`（`markLoading` 实现）。
- 单元测试：`shared/fullpage/renderer.test.ts`（loading 标记的「无 aria-label / 无文案 / 仅 spinner + role」断言）。
- 任务索引：`docs/iterations/v0.4.0/tasks/000a65d5-4d87-42ca-84e0-8034c913ad04/index.md`。

## 知识沉淀

本次任务无新增/变更长期知识（依据沉淀记录：knowledgeIds=[]、changedPaths=[]）。

- 行为契约（loading 标记「spinner + role=status」、无文案、无 aria-label）已直接由 renderer.test.ts 单测锁定；不另开长期知识。
- 后续若在 e2e 或其他场景中需要断言「loading 不打断页面可访问性树」，应引用 renderer.test.ts 用例（`statusEl?.getAttribute('aria-label')` 为 null）作为权威契约源。
