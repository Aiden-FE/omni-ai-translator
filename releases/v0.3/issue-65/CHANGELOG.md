# CHANGELOG: 产品品牌统一 (#65)

## v0.3 - Issue #65

### 变更
- popup 顶部品牌字样(header span)从 `LLM Translator` 统一为 `Omni AI Translator`
- popup 对话框 `aria-label` 从 `LLM Translator 设置` 统一为 `Omni AI Translator 设置`
- popup HTML `<title>` 从 `LLM Translator` 统一为 `Omni AI Translator`
- options 页面标题(h1)从 `LLM Translator 设置` 统一为 `Omni AI Translator 设置`
- options HTML `<title>` 从 `LLM Translator 设置` 统一为 `Omni AI Translator 设置`

### 验证
- 构建产物 manifest.json name = `Omni AI Translator`
- 构建产物 popup.html title = `Omni AI Translator`
- 构建产物 options.html title = `Omni AI Translator 设置`
- `pnpm build` / `pnpm typecheck` / `pnpm lint` 全部通过
- entrypoints/ 与 shared/ 无残留 `LLM Translator` 品牌字样

### 参考
- 正式产品名定稿: releases/v0.3/5-product-name/PRD.md 定稿记录(2026-07-07)
- wxt.config.ts manifest name 与 README 已在定稿时同步,本任务补齐 popup/options 用户可见面
