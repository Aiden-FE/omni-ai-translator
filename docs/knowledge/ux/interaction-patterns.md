---
id: ux:interaction-patterns
type: ux
status: draft
owner: project
updated: 2026-07-30
confidence: 0.8
sources:
  - entrypoints/content.ts
  - entrypoints/options
  - entrypoints/popup
  - knowledges/ux/interaction-patterns.md
  - knowledges/startup-summary.md
related:
  - product:overview
  - context:system:plugin-architecture
---

# 交互模式（初始化草稿）

> 来源：既有 `knowledges/ux/interaction-patterns.md` 与立项摘要；UI 细节以 `entrypoints/` 实际实现为准。

## 设计原则

1. **轻量不打扰**：翻译浮层最小侵入，不遮挡阅读流。
2. **状态可见**：加载、成功、失败状态清晰反馈。
3. **配置友好**：设置页对普通用户简洁、对技术用户暴露高级项。
4. **隐私透明**：明确告知数据去向（云端 vs 本地）。

## 划词翻译（核心）

- 用户选中文本 → `mouseup` 释放 → 选区右下方出现圆形浮动触发按钮（「译」）。
- **用户点击触发按钮**才开始翻译（不自动翻译，避免打扰阅读流）。
- 选区为空或超 5000 字符时不出现触发按钮。
- 点击触发按钮/浮层外任意位置清除；新选区触发时移除旧按钮与浮层。

### 状态反馈

| 状态 | 反馈 |
|------|------|
| 待触发 | 圆形「译」按钮 |
| 加载 | 「翻译中…」（流式则渐进渲染译文） |
| 成功 | 译文文本（markdown 可读渲染） |
| 失败 | 「❌」+ 主文案 + 引导次要行（按 `errorType` 差异化，见 `feature:translator:unified-adapter`） |

## 目标语言

- 默认浏览器首选语言（`navigator.language`），用户可在设置页覆盖（自由填写，留空自动取浏览器语言）。

## 设置页（options）与弹窗（popup）

- **popup**：配置主入口——生效源横幅、源卡片（可折叠）、源类型分组、连通性测试、目标语言、「打开全部设置」跳 options。
- **options**：兜底全功能页——翻译源管理（添加/删除/编辑/启用）、当前生效源横幅（兜底态 / 自有源态）、4 类源类型下拉、连通性测试。
- **生效源横幅**：兜底态提示「未配置自有源，待翻译文本将外传到 Google / 微软」+「配置自有源 →」引导；自有源态显示源名称 +「翻译请求将发送到该翻译源」。

## 待规划交互

重译 / 复制译文 / 切换目标语言、快捷键触发、小窗输入翻译窗口。

## 来源证据

- `entrypoints/content.ts`：划词触发按钮与浮层渲染。
- `entrypoints/options/` / `entrypoints/popup/`：配置页与弹窗。
