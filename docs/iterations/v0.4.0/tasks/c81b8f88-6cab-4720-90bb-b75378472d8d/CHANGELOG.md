# CHANGELOG - 全文翻译功能审查（c81b8f88）

> 任务：c81b8f88-6cab-4720-90bb-b75378472d8d
> 迭代：v0.4.0
> 日期：2026-08-03

## 审查结论

全文翻译功能（t1-t5）审查通过：typecheck ✓ / lint ✓ / 309 单测 ✓ / 15 e2e ✓（7 划词 + 8 全文翻译）/ Chrome MV3 + Firefox MV2 构建 ✓。验收标准 1-10、12 完全达成，验收标准 11 基本达成（强样式页面人工验证待执行）。

发版前需处理：B1（PERMISSIONS-JUSTIFICATION.md 同步 contextMenus）、S4（强样式页面人工验证）。

## 知识沉淀

基于审查报告（REVIEW.md）的验证结论与发现项，更新以下长期知识：

### 候选映射

| 候选 | 类型 | 映射知识 ID | 说明 |
|------|------|------------|------|
| 0 | feature | `feature:fullpage:orchestrator` | 全文翻译编排器状态机与可复用设计范式：新增范式 5（Shadow DOM+自足样式隔离跨模块复用）、审查验证节（309 单测+15 e2e 全绿、范式 1-4 逐项确认）、遗留项 S3（retrySegments isActive 设计权衡）；同步更新 segmenter-pool（S1/S2 样式缺口、S6 CODE 冗余）与 permissions-privacy（B1 审查确认） |
| 1 | runbook | `runbook:e2e:fullpage-trigger-assertions` | 扩展 e2e 触发技术与渐进渲染断言：新增审查验证节（15 e2e 全绿、技术 1/2/shadow DOM 断言逐项确认）、REVIEW.md 来源证据 |

### 更新的知识 ID

- `feature:fullpage:orchestrator` - 编排器状态机与可复用范式（审查验证 + 范式 5 + S3）
- `feature:fullpage:segmenter-pool` - 分段收集器、翻译池与渲染器（S1/S2 样式缺口 + S6 CODE 冗余）
- `runbook:e2e:fullpage-trigger-assertions` - e2e 触发与断言技术（审查验证）
- `context:system:permissions-privacy` - 权限基线与隐私（B1 审查确认）

### 复用场景

1. **编排器状态机组合无状态组件范式**（feature:fullpage:orchestrator）：后续实现其他 content script 注入类功能（如页面级批注、DOM 增强）时，采用「一个模块级状态机编排器组合多个无状态 DOM 工具组件」范式，避免状态散落与隐式耦合。
2. **并发重入守卫**（feature:fullpage:orchestrator）：异步入口可能被用户连续触发（菜单连点、快捷键连按）的 content script 功能，使用「进行中 Promise 守卫 + 完成后按最新状态决策」模式。
3. **增量翻译防抖管线**（feature:fullpage:orchestrator）：需要监听 DOM 变更并增量处理的 content script 功能，复用「防抖聚合 + 并发守卫 + 注入过滤 + 元素去重 + 错误隔离」管线模式。
4. **防闪回双保险**（feature:fullpage:orchestrator）：异步操作回调需要防「操作完成时上下文已失效」的场景，复用「入口级 isActive 守卫 + 回调级 active/isConnected 双重校验」模式。
5. **Shadow DOM + 自足样式隔离**（feature:fullpage:segmenter-pool）：content script 注入 DOM 走 Shadow DOM + 显式重置继承属性，规避宿主 CSS 穿透。
6. **SW 广播 + Promise.allSettled e2e 触发**（runbook:e2e:fullpage-trigger-assertions）：后续为右键菜单/background 命令触发的扩展功能编写 e2e 时复用「SW 广播下发 + 0 送达抛错」触发模式。
7. **相对时序断言**（runbook:e2e:fullpage-trigger-assertions）：需要断言「渐进/分批渲染」的 e2e 复用「先行元素已完成 && 后行元素未完成」相对时序断言替代绝对时间。
8. **mock 契约复用**（feature:fullpage:e2e-mock-contract）：构造部分失败/缓存复用场景时复用 `__FAIL__` 子串失败开关与 `getRequestCount` 计数断言。
