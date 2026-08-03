# DESIGN: 悬浮翻译工具栏与收起迷你把手

> 版本 v0.4 · 全文翻译 · 工具栏组件

## 总体架构

工具栏是纯 DOM + Shadow DOM 组件（不引 Vue），与现有 `renderer.ts` 的零框架做法一致。
产出 `shared/fullpage/toolbar.ts`（`createToolbar` 工厂 + `ToolbarApi`），消费 `assets/fullpage-toolbar.css`（`?inline` 注入 shadow root）。
工具栏只发事件（callbacks），不直接操作翻译状态；状态编排全在 t5 orchestrator。

## 受影响文件

| 文件 | 动作 | 说明 |
|---|---|---|
| `assets/fullpage-toolbar.css` | 新增 | 工具栏与迷你把手 shadow 内样式 |
| `shared/fullpage/toolbar.ts` | 新增 | 工具栏组件（createToolbar + ToolbarApi） |
| `shared/fullpage/toolbar.test.ts` | 新增 | 单元测试（jsdom） |

## 数据契约

### ToolbarCallbacks

```typescript
export interface ToolbarCallbacks {
  /** 切换显示模式（replace <-> bilingual），编排器处理后调 setMode 更新文案 */
  onSwitchMode: () => void;
  /** 恢复原文 */
  onRestore: () => void;
  /** 重试失败段落 */
  onRetry: () => void;
  /** 收起工具栏（toolbar 已自动 collapse 切换为迷你把手） */
  onCollapse: () => void;
  /** 从迷你把手恢复工具栏（toolbar 已自动 expand），可选 */
  onRecall?: () => void;
}
```

> **设计权衡——`onRecall` 为可选**：任务步骤 1 的签名列 4 个回调，步骤 3 提到迷你把手「点击回调 onRecall」。
> 收起/展开属工具栏自身 UI 状态（非翻译状态），按钮点击直接调用 `collapse()`/`expand()` 并发通知回调。
> `onCollapse` 必填（编排器需感知收起以暂停观察器等），`onRecall` 可选（展开时编排器通常无需额外动作）。

### ToolbarApi

```typescript
export interface ToolbarApi {
  setMode(mode: DisplayMode): void;   // 翻转切换按钮文案 + title + aria-label
  setFailureCount(n: number): void;   // n>0 显示重试按钮 + 计数徽标；n=0 隐藏
  collapse(): void;                   // 隐藏工具栏，显示迷你把手
  expand(): void;                     // 隐藏迷你把手，显示工具栏
  destroy(): void;                    // 移除宿主节点（幂等）
}
```

## DOM 结构

```
div[data-llm-translator] (host, position:fixed, right:16px, bottom:16px, z-index:2147483647)
└─ #shadow-root (open)
   ├─ <style> (toolbarCss)
   ├─ div.llm-translator-toolbar
   │   ├─ button.llm-translator-toolbar-btn.llm-translator-toolbar-switch  (切换模式)
   │   ├─ button.llm-translator-toolbar-btn  (恢复原文)
   │   ├─ button.llm-translator-toolbar-btn.llm-translator-toolbar-retry[hidden]  (重试失败段落 + 徽标)
   │   └─ button.llm-translator-toolbar-btn  (收起)
   └─ button.llm-translator-mini-handle  (36px 圆形「译」)
```

- 单一宿主元素，工具栏与迷你把手互斥可见（通过 `host[data-collapsed]` 属性 CSS 切换）。
- 宿主带 `data-llm-translator`：t2 分段收集器排除、t5 MutationObserver 过滤。
- shadow 边界天然隔离宿主脚本监听，按钮事件无需 stopPropagation。

## 交互流

| 触发 | 动作 | 回调 |
|---|---|---|
| 点击「切换模式」 | — | `onSwitchMode()` |
| 点击「恢复原文」 | — | `onRestore()` |
| 点击「重试失败段落」 | — | `onRetry()` |
| 点击「收起」 | `collapse()` | `onCollapse()` |
| 点击迷你把手「译」 | `expand()` | `onRecall?.()` |

收起/展开属 UI 状态（非翻译状态），toolbar 直接管理 + 发通知回调；翻译状态操作（切换/恢复/重试）只发回调，编排器处理。

## 样式设计

- `:host` 上自足定义 `--translator-*` token（不依赖宿主文档 `:root`），显式重置 `font-family`/`color` 等继承属性。
- 主色 teal `hsl(174 84% 27%)`，与 content.css trigger 一致。
- 工具栏：暗底 `hsl(195 62% 16%)` + 浅色文字，宽 ≤ 220px，竖排按钮组。
- 切换模式按钮：teal 强调底。
- 重试徽标：红色 `hsl(0 70% 50%)` 圆形计数。
- 迷你把手：36px 圆形 teal 底白字「译」。
- 按钮 hover/active 微交互（`background` 过渡）。
- `prefers-reduced-motion` 禁用过渡。

## 边界与风险

- 宿主页面同 z-index 元素遮挡：用 2147483647 最大值（项目既有约定）。
- `destroy()` 幂等：恢复原文与页面卸载路径都可能调用，重复调用不报错。
- `setFailureCount` 重复调用安全：先清空徽标再设值。
- jsdom 无布局：`offsetWidth` 等不可靠，测试通过 `max-width` 样式与属性断言验证尺寸约束。
