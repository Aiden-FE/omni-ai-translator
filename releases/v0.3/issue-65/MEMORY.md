# MEMORY - Issue #65 产品品牌统一

## 任务元数据
- Issue: #65 产品品牌统一 - popup/options 品牌字样与一致性回归
- PRD Issue: #53 (5-product-name)
- 版本: v0.3
- 类型: 前端
- 并发安全: parallel-safe; MR 基线: base-branch; 上游依赖: 无(#56/#57 已合并)
- 基础分支: master; worktree 分支: issue-65

## 品牌名定稿
- 正式产品名: `Omni AI Translator`(2026-07-07 定稿,见 PRD releases/v0.3/5-product-name/PRD.md 定稿记录章节)
- `Omni` 修饰词呼应「模型无关/任意源」差异化,`AI Translator` 关键词全命中 SEO 最强
- 仓库名 `Aiden-FE/llm-translator` 保持不变;内部知识库不作批量替换

## UX 约束(引用 PRD `## UX 设计` 与 knowledges/ux/design-system.md)
- 仅替换品牌文案,不改动布局/字号/颜色/间距/组件结构/交互
- popup 固定 400x600;header span 使用 `truncate` 截断,品牌名不得造成容器溢出
- popup 对话框 `aria-label` 与可见品牌名必须一致
- 视觉基线: sunlit teal 主题(#57),token-first 策略(ADR-006),本任务不触碰任何 token/样式

## 已就绪产物(PRD 定稿时已同步)
- wxt.config.ts:13 `name: 'Omni AI Translator'` ✅
- wxt.config.ts:14 `description: 'AI 驱动的浏览器翻译插件...'` ✅
- README.md:1 `# Omni AI Translator` + 仓库名/产品名对应说明 ✅

## 待修改品牌字样(5 处)
1. entrypoints/popup/App.vue:27 `aria-label="LLM Translator 设置"` -> `Omni AI Translator 设置`
2. entrypoints/popup/App.vue:36 `<span ...>LLM Translator</span>` -> `Omni AI Translator`
3. entrypoints/options/App.vue:9 `LLM Translator 设置` -> `Omni AI Translator 设置`
4. entrypoints/popup/index.html:5 `<title>LLM Translator</title>` -> `<title>Omni AI Translator</title>`
5. entrypoints/options/index.html:5 `<title>LLM Translator 设置</title>` -> `<title>Omni AI Translator 设置</title>`

## 共享文件注意
- #64 也在改 wxt.config.ts(移除 contextMenus 权限);本任务只改 manifest name 字段(已改好),不重排权限或其它字段

## 依赖链
- #56(UI 基座 tailwind+shadcn-vue) 已合并
- #57(visual-theme sunlit teal) 已合并
- 本任务基于当前 UI 与视觉主题直接修改品牌文案
