# feat(#66): 商店 Listing 素材 - 图标截图与上架文案归档

## 变更摘要

为 Chrome Web Store 首次上架准备完整 Listing 素材：

1. **扩展图标** - 16/32/48/128px PNG 图标（sunlit teal 圆角方形 + 暖白「译」字标），WXT 自动声明 manifest `icons` 字段
2. **商店截图** - 3 张 1280x800 PNG（划词翻译浮层、popup 配置面板、options 设置页），Playwright + mock server 真实捕获
3. **Listing 文案** - 简短描述（49字符≤132）、详细描述、分类（生产力工具）、关键词
4. **可复现工具** - 图标生成脚本（PIL）、截图脚本（Playwright）、截图指南文档

## 影响面

- 新增 `public/icon/` 目录（4 个 PNG） - WXT 打包进扩展，manifest 自动声明
- 新增 `scripts/` 目录（generate-icons.py + capture-screenshots.ts） - 开发工具
- 新增 `e2e/fixtures/screenshot-page.html` - 截图测试页
- 新增 `releases/v0.3/6-store-listing/` 下素材（screenshots/ + listing-copy.md + screenshot-guide.md）
- **不修改任何应用代码**（entrypoints/shared/assets/wxt.config.ts）

## 回滚方案

删除新增文件即可，无代码变更需回滚。

## 验收标准

- [x] 4 个 PNG 图标（16/32/48/128px）尺寸格式正确，manifest icons 引用有效
- [x] 图标视觉与 sunlit teal 主题一致，16px 下可辨识
- [x] 3 张截图均为 1280x800，覆盖约定场景，使用最终品牌名 `Omni AI Translator`
- [x] 截图无敏感数据（API Key/账号）
- [x] 简短描述 ≤132 字符（49字符）
- [x] 详细描述覆盖划词翻译、免 Key、BYO Key、本地模型、隐私可控
- [x] 分类（生产力工具）与关键词（翻译/AI/划词）完整归档
- [x] 截图准备与尺寸检查方式可重复
- [x] `pnpm build && pnpm typecheck && pnpm lint` 全部通过

## 审查上下文

| 项目 | 值 |
|---|---|
| PRD Issue | #54 |
| PRD 文档路径 | releases/v0.3/6-store-listing/PRD.md |
| 版本 | v0.3 |
| 里程碑 | v0.3 - 商店首发与 UI 美化 |
| DESIGN 路径 | releases/v0.3/issue-66/DESIGN.md |
| PLAN 路径 | releases/v0.3/issue-66/PLAN.md |
| CHANGELOG 路径 | releases/v0.3/issue-66/CHANGELOG.md |
| UX 规范与视觉原型路径 | releases/v0.3/6-store-listing/PRD.md `## UX 设计`；knowledges/ux/design-system.md；ADR-006 |
| 知识沉淀清单 | 1. 图标设计规范(context) 2. PIL 图标生成脚本模式(feature/context) 3. Playwright 扩展截图方法(feature) 4. WXT 图标约定(context) — 知识沉淀:待补 |
| 并发安全 | blocked-by-upstream |
| MR 基线 | after-upstream-merged（上游 #65 已合并，基于 master） |
| 上游 Issue/MR | #65（PR #69 已合并） |
| 基线分支 | master |
| 推荐合并顺序 | 无 |
| Stacked MR | 否 |
| 依赖契约 | 截图使用 #65 最终品牌名 `Omni AI Translator` |

## 截图清单

| 文件 | 场景 | 尺寸 | 捕获方式 |
|---|---|---|---|
| screenshots/popup.png | popup 配置面板 | 1280x800 | 真实扩展页面截图 |
| screenshots/options.png | options 设置页 | 1280x800 | 真实扩展页面截图 |
| screenshots/overlay.png | 划词翻译浮层 | 1280x800 | 真实扩展页面截图 |

所有截图均使用 mock server 捕获，无真实 API 调用，无敏感数据。

Closes #66
