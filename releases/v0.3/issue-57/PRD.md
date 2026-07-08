# PRD - Issue #57 视觉主题改造

> 版本: v0.3 · 研发任务: #57 · PRD Issue: #50 · 来源: `releases/v0.3/2-visual-theme/PRD.md`

## 背景与目标

#57 在 #56 已合并到 `master` 的 tailwindcss + shadcn-vue + CSS token 基座上，完成 v0.3 最终视觉主题产出与全界面应用。目标是弃用 #56 迁移期保留的冷色基座，换成适度明亮鲜艳但不抢眼的主题，使商店首发截图和实际使用界面更有辨识度，同时保持划词翻译阅读舒适和 WCAG AA 可访问性。

本任务不新增交互入口，不修改 provider、storage、message、translator 契约，不重构 #56 已完成的组件结构。所有视觉变化应优先通过 `shared/styles/tokens.css`、`assets/content.css` 和 Tailwind token 映射完成。

## 范围

### 包含

- 定义最终 v0.3 主题 token: 主色、强调色、success/error/warning/info 语义色、中性色、边框、输入框、阴影、focus ring。
- 将 popup、options、`shared/ui/SourceConfigPanel.vue`、划词触发按钮、iframe 翻译浮层切换到新主题。
- 扩展 Tailwind token 以覆盖 warning/info，并保持现有 success/destructive 可用。
- 更新 `knowledges/ux/design-system.md` 和 `knowledges/ux/accessibility.md`，记录最终色板、状态映射、对比度验证。
- grep/审查旧冷色硬编码与冷色 HSL 残留。
- 回归 `pnpm build`、`pnpm typecheck`、`pnpm lint`，并覆盖划词翻译 / popup / options 配置流。

### 不包含

- tailwind/shadcn 基座搭建与大规模组件迁移，已由 #56 完成。
- Logo、商店截图、Listing 素材，属于后续 store-listing 任务。
- 暗色模式、多主题切换。
- provider / storage / message / translator 数据契约改动。
- 新交互、新功能入口或配置项。

## UX 设计

交互逻辑完全沿用 `knowledges/ux/interaction-patterns.md`: 划词后显示「译」触发按钮，点击后显示 iframe 浮层；popup 与 options 继续复用 `SourceConfigPanel` 管理翻译源和目标语言。#57 只改变视觉 token，不改变状态流转。

最终主题方向为“sunlit teal”: 以深青绿色主色承载主操作和触发按钮，以柔和暖白作为页面背景，以珊瑚/琥珀/绿色/蓝色语义色表达反馈状态。主题需要明亮、有彩色引导，但浮层背景保持足够深且不透明，避免叠在网页内容上时降低译文可读性。

关键状态映射:

| 状态 | Token 表达 | 辅助语义 |
|---|---|---|
| idle | `background` / `card` / `foreground` | 中性内容承载 |
| hover | `accent` / `primary` hover opacity | 轻量色彩反馈 |
| active | `ring` / `primary` | 主操作聚焦 |
| disabled | opacity + muted foreground | 不只靠颜色 |
| error | `destructive` + `❌` + 文案 | 错误可识别 |
| success | `success` + `✅` + 文案 | 成功可识别 |
| warning | `warning` + `⚠` + 文案 | 预留警告语义 |
| info | `info` + 文案 | 预留信息语义 |

## 可访问性与验收

预设 token 对比度验证结果:

| 组合 | 对比度 | 结论 |
|---|---:|---|
| `foreground` / `background` | 15.35:1 | 满足 AA |
| `muted-foreground` / `background` | 6.53:1 | 满足 AA |
| `primary-foreground` / `primary` | 4.89:1 | 满足 AA |
| `success-foreground` / `success` | 5.10:1 | 满足 AA |
| `destructive-foreground` / `destructive` | 5.55:1 | 满足 AA |
| `info-foreground` / `info` | 5.43:1 | 满足 AA |
| `warning-foreground` / `warning` | 5.76:1 | 满足 AA |
| `translator-panel-foreground` / `translator-panel-background` | 12.54:1 | 满足 AA |
| `translator-panel-muted` / `translator-panel-background` | 8.97:1 | 满足 AA |

验收标准:

- [ ] 冷色硬编码和旧冷色 HSL token 无不合理残留。
- [ ] 全应用通过语义 token 使用新主题，视觉统一且不刺眼。
- [ ] 关键文本、按钮、语义状态、翻译浮层满足 WCAG AA。
- [ ] `knowledges/ux/design-system.md` 与 `knowledges/ux/accessibility.md` 同步最终主题。
- [ ] `pnpm build`、`pnpm typecheck`、`pnpm lint` 通过。
- [ ] 划词翻译、popup、options 配置流行为不因主题改造退化。

## 自动批准记录

本任务按用户要求以 prodflow-worker 默认无人值守模式执行。需求、设计、计划均从 Issue #57、PRD #50、`releases/v0.3/2-visual-theme/PRD.md`、UX 知识库和 #56 已合并代码推导。方案选择“集中 token 替换 + 小范围语义 token 扩展”，因为它改动范围最小、复用 #56 基座、可通过 grep 和构建校验验证，回滚方式为还原 token 与文档改动。
