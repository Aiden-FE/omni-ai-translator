# WXT 构建与图标约定

WXT 框架的图标自动生成、构建命令、产物目录与截图脚本约定。扩展使用 WXT 管理构建流程，图标放置后自动生成 manifest `icons` 字段；三浏览器构建通过 `pnpm build [-b firefox|edge]` 切换；截图使用 Playwright 加载真实扩展产物捕获。

## 图标约定

- 图标文件放置于 `public/icon/{16,32,48,128}.png`，WXT 自动扫描并生成 manifest `icons` 字段，无需在 `wxt.config.ts` 手动声明。
- 图标设计：sunlit teal（HSL 174, 84%, 27%）圆角方形背景 + 暖白（HSL 36, 100%, 98%）「译」字标。16px 尺寸下仍可辨识。
- 生成脚本：`scripts/generate-icons.py` 使用 PIL 库，4x 超采样后 Lanczos 降采样生成各尺寸，确保小尺寸清晰度。

## 构建约定

| 操作 | 命令 | 产物目录 |
|------|------|----------|
| Chrome 构建 | `pnpm build` | `.output/chrome-mv3/` |
| Firefox 构建 | `pnpm build:firefox` | `.output/firefox-mv2/` |
| Edge 构建 | `pnpm build:edge` | `.output/edge-mv3/` |
| Chrome 打包 | `pnpm zip` | `.output/llm-translator-{version}-chrome.zip` |
| Firefox 打包 | `pnpm zip:firefox` | `.output/llm-translator-{version}-firefox.zip` + sources.zip |
| Edge 打包 | `pnpm zip:edge` | `.output/llm-translator-{version}-edge.zip` |

Firefox 产物为 MV2（WXT 自动降级），Chrome/Edge 产物为 MV3。

## 截图约定

- 截图脚本 `scripts/capture-screenshots.ts` 使用 Playwright `launchPersistentContext` + `--load-extension` 加载真实扩展产物目录。
- 使用 `--headless=new` 模式（Chrome 扩展不支持旧版 headless，`new` 模式支持扩展加载与截图）。
- popup/options 页面：直接导航到对应 HTML 页面捕获。
- 划词浮层：模拟选中文本后触发浮层，等待浮层渲染后捕获。
- 可用 mock LLM server 避免依赖真实 API（截图脚本内含 mock server 启动逻辑）。

## 相关文件

- `wxt.config.ts` - WXT 配置与 manifest 函数。
- `scripts/generate-icons.py` - 图标生成脚本（PIL + Lanczos 降采样）。
- `scripts/capture-screenshots.ts` - 截图脚本（Playwright + 真实扩展加载）。
- `releases/v0.3/issue-66/` - 图标与截图任务迭代文档。
- `knowledges/adr/008-wxt-cross-browser-manifest-differentiation.md` - 跨浏览器 manifest 差异化策略。
