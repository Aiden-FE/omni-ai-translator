## 变更摘要

将 popup/options 用户可见品牌字样从旧名 `LLM Translator` 统一为正式产品名 `Omni AI Translator`,完成品牌一致性回归。

### 变更内容(5 处靶向替换)
- `entrypoints/popup/App.vue`: header span 品牌字样 + dialog aria-label -> `Omni AI Translator`
- `entrypoints/options/App.vue`: h1 页面标题 -> `Omni AI Translator 设置`
- `entrypoints/popup/index.html`: `<title>` -> `Omni AI Translator`
- `entrypoints/options/index.html`: `<title>` -> `Omni AI Translator 设置`

wxt.config.ts manifest name 与 README 已在 PRD 定稿时同步,本任务不触碰 wxt.config.ts。

### 影响面
仅品牌文案替换,不涉及布局/字号/颜色/间距/组件结构/交互/token 变更。popup 400x600 布局不退化(header span 使用 truncate 截断)。

### 回滚方案
`git revert` 本 PR commit 即可恢复旧品牌字样。无数据迁移、无存储变更、无类型变更。

## 审查上下文

| 项目 | 值 |
|---|---|
| PRD Issue | #53 |
| PRD 文档路径 | `releases/v0.3/5-product-name/PRD.md` |
| 版本 | v0.3 |
| 里程碑 | v0.3 - 商店首发与 UI 美化 |
| DESIGN 路径 | `releases/v0.3/issue-65/DESIGN.md` |
| PLAN 路径 | `releases/v0.3/issue-65/PLAN.md` |
| CHANGELOG 路径 | `releases/v0.3/issue-65/CHANGELOG.md` |
| 并发安全 | parallel-safe |
| MR 基线 | base-branch |
| 上游 | 无(#56/#57 已合并) |
| 基线分支 | master |
| 推荐合并顺序 | 无 |
| Stacked MR | 否 |
| 依赖契约 | 无 |

### 验收标准
- [x] popup 顶部标题、popup aria-label、options 页面标题均显示 `Omni AI Translator`
- [x] popup/options HTML title 使用 `Omni AI Translator`
- [x] wxt.config.ts manifest name、README、popup、options 用户可见品牌名完全一致
- [x] popup 400x600 布局、标题截断、键盘操作不退化
- [x] 构建产物 manifest name = `Omni AI Translator`
- [x] `pnpm build && pnpm typecheck && pnpm lint` 全部通过

### UX 规范与视觉原型路径
- 引用 PRD `releases/v0.3/5-product-name/PRD.md` `## UX 设计` 章节:品牌名呈现于 popup/options 顶部与 manifest,无独立交互流程;仅替换品牌文案,不改变布局/字号/颜色/间距/组件结构
- 引用 `knowledges/ux/design-system.md`:popup 固定 400x600,header span 使用 truncate 截断,视觉基线为 sunlit teal 主题(#57)+ token-first 策略(ADR-006)

### 知识沉淀清单
- 知识沉淀:待补
- 产品名定稿决策(context):正式产品名 `Omni AI Translator`,`Omni` 修饰词呼应「模型无关/任意源」差异化,`AI Translator` 关键词全命中 SEO 最强
- 品牌一致性边界:用户可见交付面统一;仓库名不变;内部知识库不作批量替换
- 品牌一致性回归检查方法:构建后检查 manifest.json name + grep 确认无残留

Closes #65
