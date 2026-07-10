# PRD: 产品品牌统一 - popup/options 品牌字样与一致性回归 (#65)

> Issue #65 · PRD Issue #53 (5-product-name) · 版本 v0.3 · 类型: 前端

## 1. 目标

将 popup/options 用户可见品牌字样从旧名 `LLM Translator` 统一为正式产品名 `Omni AI Translator`,并验证构建产物 manifest name 一致,完成品牌一致性回归。

## 2. 背景

正式产品名已于 2026-07-07 定稿为 `Omni AI Translator`(见 `releases/v0.3/5-product-name/PRD.md` 定稿记录章节)。定稿时已同步:
- wxt.config.ts manifest.name -> `Omni AI Translator` ✅
- wxt.config.ts manifest.description -> `AI 驱动的浏览器翻译插件` ✅
- README 仓库名/产品名对应说明 ✅

剩余未同步的用户可见品牌字样分布在 popup/options 的 Vue 组件与 HTML 入口文件中,共 5 处仍使用旧名 `LLM Translator`。

## 3. 范围

### 包含
- popup 顶部品牌字样(header span) -> `Omni AI Translator`
- popup 对话框 aria-label -> `Omni AI Translator 设置`
- popup HTML title -> `Omni AI Translator`
- options 页面标题(h1) -> `Omni AI Translator 设置`
- options HTML title -> `Omni AI Translator 设置`
- 品牌一致性回归检查:验证 wxt.config.ts、README、popup、options 用户可见品牌名一致
- 构建产物 manifest name 验证

### 不包含
- 商标检索/商店重名检索(用户人工)
- Chrome 商店 Listing 标题/描述/截图/图标(PRD #54)
- 仓库重命名
- 历史 PRD/知识库/内部技术标识的 LLM Translator/LLM 批量替换
- UI 布局/设计 token/交互/翻译功能改造

## 4. 验收标准

- [ ] popup 顶部标题、popup aria-label、options 页面标题均显示 `Omni AI Translator`
- [ ] popup/options HTML title 使用 `Omni AI Translator`
- [ ] wxt.config.ts manifest name、README、popup、options 用户可见品牌名完全一致
- [ ] popup 400x600 布局、标题截断、键盘操作不退化
- [ ] 构建产物 manifest name = `Omni AI Translator`
- [ ] `pnpm build && pnpm typecheck && pnpm lint` 全部通过

## 5. UX 设计

引用 PRD `releases/v0.3/5-product-name/PRD.md` 的 `## UX 设计` 章节:
- 品牌名呈现于 popup/options 顶部与 manifest,无独立交互流程
- 仅替换品牌文案,不改变 popup/options 已落地的布局、字号、颜色、间距和组件结构
- popup 保持现有标题截断行为(truncate),正式产品名不得造成容器溢出
- popup 对话框可访问名称(aria-label)与可见品牌名保持一致
