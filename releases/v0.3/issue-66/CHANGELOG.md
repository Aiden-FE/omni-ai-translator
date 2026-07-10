# CHANGELOG: #66 商店 Listing 素材归档

> 关联 Issue #66 · PRD Issue #54 · 迭代 v0.3

## 变更内容

### 新增

- **扩展图标**: 生成 16/32/48/128px PNG 图标(`public/icon/`), 采用 sunlit teal 圆角方形 + 暖白「译」字标设计, 与应用 UI 视觉统一。WXT 自动声明 manifest `icons` 字段, 无需修改 wxt.config.ts。
- **图标生成脚本**: `scripts/generate-icons.py`, 使用 Python PIL 4x 超采样 + Lanczos 降采样, 可重复运行。
- **商店截图**: 3 张 1280x800 PNG 截图(`releases/v0.3/6-store-listing/screenshots/`), 覆盖划词翻译浮层、popup 配置面板、options 设置页。使用 Playwright + mock server 真实捕获, 无敏感数据。
- **截图脚本**: `scripts/capture-screenshots.ts`, 可重复执行的 Playwright 截图工具。
- **截图测试页**: `e2e/fixtures/screenshot-page.html`, 模拟英文文章页用于划词翻译截图。
- **Listing 文案**: `releases/v0.3/6-store-listing/listing-copy.md`, 含简短描述(49字符≤132)、详细描述、分类(生产力工具)、关键词。
- **截图指南**: `releases/v0.3/6-store-listing/screenshot-guide.md`, 可重复的截图准备与尺寸检查说明。

### 验证

- 图标尺寸/格式: `file` 确认 16/32/48/128 RGBA PNG
- manifest icons: `pnpm build` 后 manifest.json 自动包含 icons 字段(4 尺寸)
- 截图尺寸: 3 张均为 1280x800(PIL 校验)
- 截图安全: 使用 mock server, 无 API Key/账号/敏感数据
- 简短描述: 49 字符 ≤ 132 上限
- 构建: `pnpm build && pnpm typecheck && pnpm lint` 全部通过

## 截图说明

三张截图均为真实扩展页面截图(非 mockup):
- `popup.png` - popup 配置面板, 居中于暖白画布, 展示已启用的翻译源
- `options.png` - options 设置页, 展示已配置的 GPT-4o 提供方
- `overlay.png` - 划词翻译浮层, 在文章页选中 "Hello world" 后触发翻译, 浮层展示 mock 译文 "你好,世界"

## 影响面

- 新增 `public/icon/` 目录(4 个 PNG 图标) - 被 WXT 打包进扩展, manifest 自动声明
- 新增 `scripts/` 目录(2 个脚本) - 开发工具, 不进入扩展产物
- 新增 `e2e/fixtures/screenshot-page.html` - 截图测试页
- 新增 `releases/v0.3/6-store-listing/` 下 3 个文档 + 3 张截图 - 商店上架素材归档
- 不修改任何应用代码(entrypoints/shared/assets)
- 不修改 wxt.config.ts(与 #67 无冲突)

## 回滚方案

删除新增文件即可, 无代码变更需回滚:
- `public/icon/` 目录
- `scripts/` 目录
- `e2e/fixtures/screenshot-page.html`
- `releases/v0.3/6-store-listing/screenshots/`
- `releases/v0.3/6-store-listing/listing-copy.md`
- `releases/v0.3/6-store-listing/screenshot-guide.md`
