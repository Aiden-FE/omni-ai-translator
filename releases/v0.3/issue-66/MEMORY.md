# MEMORY - #66 商店 Listing 素材归档

## 任务元数据

- Issue: #66
- PRD Issue: #54
- 迭代: v0.3
- 类型: 前端
- 分支: issue-66
- worktree: /home/admin/dev/prodflow/ai-projects/llm-translator/.worktrees/master-issue-66
- 并发安全: blocked-by-upstream; MR 基线: after-upstream-merged
- 上游依赖: #65 (PR #69 已合并), 品牌名 Omni AI Translator 已落地

## PRD 摘要 (#54 / releases/v0.3/6-store-listing/PRD.md)

商店 Listing 素材首次准备,支撑 Chrome Web Store 上架。包含:
1. 16/32/48/128px PNG 扩展图标 + manifest icons 声明
2. 3 张 1280x800 截图:划词翻译浮层、popup 配置、options 设置页
3. 简短描述(≤132 字符)、详细描述、分类(生产力工具)、关键词(翻译/AI/划词)
4. 可重复的截图准备与尺寸检查方式

不包含:商店后台上传/审核、法律复核、UI/token 改造、Firefox/Edge 适配。

## UX/视觉约束

引用: PRD `## UX 设计` + knowledges/ux/design-system.md + ADR-006

- **图标**: sunlit teal 主色(HSL 174 84% 27% ≈ #0B7C6C), 暖白前景(HSL 36 100% 98% ≈ #FFFCF5), 无文字「译」字标, 16px 下仍可辨识
- **截图**: 使用最终品牌名 `Omni AI Translator`, 展示明亮主题(sunlit teal), 1280x800, 不得含 API Key/账号/敏感信息
- **文案**: 不宣称未实现能力, 与现有隐私说明一致
- 设计 token 单一事实源: shared/styles/tokens.css (ADR-006 token-first 策略)

## 关键技术发现

- 项目无 public/ 目录(WXT postinstall 警告 "Public directory not found: ./public")
- wxt.config.ts manifest 无 icons 字段; 已有 name="Omni AI Translator" (#65 已落地)
- WXT 约定: public/icon/{16,32,48,128}.png 放置后自动生成 manifest icons (优先用约定, 不碰 wxt.config.ts)
- **已验证**: `pnpm build` 后 manifest.json 自动包含 `icons` 字段(16/32/48/128 -> icon/{size}.png), 无需修改 wxt.config.ts
- popup: 400x600, teal header + 「译」logo + "Omni AI Translator" 标题 (entrypoints/popup/App.vue)
- options: max-w-720px, "Omni AI Translator 设置" 标题 (entrypoints/options/App.vue)
- content trigger: 24x24 圆形, teal bg, white 「译」字 (assets/content.css)
- E2E 基建: Playwright + mock-server.ts, 持久化上下文加载扩展 (e2e/fixtures.ts)
- 图像工具: Python PIL 可用; sharp/canvas 不可用; 无 ImageMagick/rsvg-convert

## 共享文件注意

- #67 也在改 wxt.config.ts(浏览器差异化 manifest)。图标声明优先用 WXT 约定(public/icon/), 尽量不碰 wxt.config.ts
- 仅在约定不生效时才在 wxt.config.ts manifest 中只加 icons 字段

## 依赖链

- #65(品牌统一) 已合并(PR #69) -> 本任务截图可呈现最终品牌名
- #56(ui-rewrite) + #57(visual-theme) 已完成 -> 明亮主题基线就绪

## 执行结果

### 图标
- `scripts/generate-icons.py` - PIL 生成脚本, 4x 超采样 Lanczos 降采样
- `public/icon/{16,32,48,128}.png` - 已生成, `file` 确认尺寸格式正确(RGBA PNG)
- manifest.json icons 字段由 WXT 自动声明, 无需改 wxt.config.ts

### 截图
- `scripts/capture-screenshots.ts` - Playwright 截图脚本
- `e2e/fixtures/screenshot-page.html` - 截图用测试文章页
- `releases/v0.3/6-store-listing/screenshots/{popup,options,overlay}.png` - 3 张 1280x800 PNG
- 全部为真实扩展页面截图(mock server 提供翻译, 无真实 API 调用, 无敏感数据)

### 文案
- `releases/v0.3/6-store-listing/listing-copy.md` - 简短描述(49字符≤132)、详细描述、分类(生产力工具)、关键词

### 测试
- `pnpm build && pnpm typecheck && pnpm lint` 全部通过

## 待沉淀知识

> 以下要点适合在任务完成后由协调器(主会话)通过 prodflow-knowledge-* 技能沉淀为知识文档。

### 1. 图标设计规范 (适合 context 类知识)
- 图标视觉语言: sunlit teal 圆角方形 + 暖白「译」字标, 与 popup header/content trigger 统一
- 色板: 背景 HSL(174,84%,27%) -> #0B7F73; 前景 HSL(36,100%,98%) -> #FFFCF5(暖白非纯白)
- 16px 可辨识策略: 字符占比 72%(vs 大尺寸 60%), 省略圆角细节
- 字体: NotoSansCJK-Black.ttc (系统 CJK 字体)

### 2. PIL 图标生成脚本模式 (适合 feature/context 类知识)
- 4x 超采样 -> Lanczos 降采样: 在小尺寸(16px)保持笔画清晰
- rounded_rectangle alpha mask + composite: 透明背景圆角方形
- textbbox 居中: 注意 bbox[0]/bbox[1] 偏移修正
- 可重复运行: `python3 scripts/generate-icons.py`

### 3. Playwright 扩展截图方法 (适合 feature 类知识)
- 持久化上下文加载扩展: `chromium.launchPersistentContext` + `--load-extension` + `--disable-extensions-except`
- `--headless=new` 支持扩展 + 截图
- 获取扩展 ID: 从 service worker URL 提取
- popup/options 截图: 直接导航 `chrome-extension://<id>/popup.html`
- 划词浮层截图: 导航测试页 -> selectText() -> mouse.up() -> 等 trigger -> click -> 等 panel
- mock server 确保无敏感数据: 返回固定译文, 不填 API Key
- 视口设置: `viewport: { width: 1280, height: 800 }` 确保截图尺寸

### 4. WXT 图标约定 (适合 context 类知识)
- WXT 自动扫描 `public/icon/{16,32,48,128}.png` 并生成 manifest `icons` 字段
- 无需手动在 wxt.config.ts manifest 中声明 icons
- 构建产物 `.output/chrome-mv3/icon/` 包含图标副本, manifest.json 引用 `icon/{size}.png`
