# PRD: #66 商店 Listing 素材 - 图标、截图与上架文案归档

> 关联 PRD Issue #54 · 迭代 v0.3 · 创建日期 2026-07-10

## 1. 任务目标

为 LLM Translator 浏览器扩展首次上架 Chrome Web Store 准备完整的 Listing 素材:
- 16/32/48/128px PNG 扩展图标 + manifest icons 声明
- 3 张 1280x800 商店截图(划词翻译浮层、popup 配置、options 设置页)
- 简短描述(≤132 字符)、详细描述、分类(生产力工具)、关键词
- 可重复的截图准备与尺寸检查方式

## 2. 范围边界

**包含**:图标资产生成与声明、截图归档、Listing 文案归档、截图复现说明。
**不包含**:商店后台上传/审核、法律复核、UI/交互/token 改造、Firefox/Edge 适配。

## 3. 依赖

- #65(品牌统一,PR #69 已合并):品牌名 `Omni AI Translator` 已落地,截图可呈现最终品牌名
- #56(ui-rewrite)+ #57(visual-theme):明亮 sunlit teal 主题基线就绪
- 并发安全: blocked-by-upstream; MR 基线: after-upstream-merged

## 4. 验收标准

- [ ] 4 个 PNG 图标(16/32/48/128px)尺寸格式正确,manifest icons 引用有效
- [ ] 图标视觉与 sunlit teal 主题一致,16px 下可辨识
- [ ] 3 张截图均为 1280x800,覆盖约定场景,使用最终品牌名 `Omni AI Translator`
- [ ] 截图无敏感数据(API Key/账号)
- [ ] 简短描述 ≤132 字符
- [ ] 详细描述覆盖划词翻译、免 Key、BYO Key、本地模型、隐私可控
- [ ] 分类(生产力工具)与关键词(翻译/AI/划词)完整归档
- [ ] 截图准备与尺寸检查方式可重复
- [ ] `pnpm build && pnpm typecheck && pnpm lint` 全部通过

## 5. 引用

- PRD: `releases/v0.3/6-store-listing/PRD.md` `## UX 设计`
- 设计系统: `knowledges/ux/design-system.md`
- ADR-006: `knowledges/adr/006-token-first-visual-theme.md`
- 设计 token: `shared/styles/tokens.css`
