# PLAN: 悬浮翻译工具栏与收起迷你把手

> 版本 v0.4 · 全文翻译 · 工具栏组件

## 执行清单

- [x] 1. 设计：DESIGN.md（架构、数据契约、DOM 结构、交互流、样式设计、边界）
- [x] 2. 新增 `assets/fullpage-toolbar.css`：shadow 内自足样式
  - `:host` 定位 fixed right:16px bottom:16px z-index:2147483647
  - `:host` 自足定义 `--translator-*` token + 显式重置继承属性
  - 工具栏容器 max-width:220px、竖排按钮组
  - 按钮 hover/active 微交互、teal 强调切换按钮、红色重试徽标
  - 迷你把手 36px 圆形「译」、互斥可见（`:host([data-collapsed])`）
  - `prefers-reduced-motion` 禁用过渡
- [x] 3. TDD 红：写 `shared/fullpage/toolbar.test.ts`（48 个测试，覆盖宿主/shadow/按钮/回调/折叠/销毁/样式/隔离）
- [x] 4. TDD 绿：实现 `shared/fullpage/toolbar.ts`
  - `createToolbar(callbacks)` 工厂 + `ToolbarApi` 接口
  - 宿主 div[data-llm-translator] + open shadow + ?inline CSS
  - 4 按钮（切换/恢复/重试/收起）+ 迷你把手
  - setMode/setFailureCount/collapse/expand/destroy
  - 收起/展开直接管理 UI 状态 + 发通知回调；翻译操作只发回调
- [x] 5. 验证：vitest 48 测试通过 + 全量 289 测试无回归
- [x] 6. 验证：vue-tsc typecheck 通过（无新增类型错误）
- [x] 7. 验证：eslint 通过
- [x] 8. 验证：wxt build 通过（?inline CSS 导入正确解析）
- [x] 9. 文档：CHANGELOG.md

## 接口依赖

- **消费**：`shared/types.ts`（`DisplayMode`）、`assets/fullpage-toolbar.css`（`?inline`）
- **产出给 t5（编排器）**：`createToolbar` / `ToolbarApi` / `ToolbarCallbacks`
