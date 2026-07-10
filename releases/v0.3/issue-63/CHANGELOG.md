# CHANGELOG - Issue #63

## 新增功能

- 新建 `.github/workflows/release.yml` Chrome 扩展自动构建与上架发布流水线，响应 GitHub Release published 事件（由 prodflow-release-deploy 创建）。
- 从 Release tag 提取 SemVer，校验 tag、`package.json`、`wxt.config.ts` manifest 三方版本一致性，不一致时中止并输出不含敏感信息的错误。
- CI 中安装锁定依赖、构建 Chrome MV3 扩展（`pnpm build`）、生成可上架 zip（`pnpm zip`）。
- 将 zip 作为资产上传到已存在的 GitHub Release（`gh release upload --clobber`），不重复创建 tag/发行说明/Release。
- 通过 `chrome-webstore-upload-cli@4`（Chrome Web Store API v2）上传并发布扩展到 Chrome Web Store，凭据通过 GitHub Secrets 环境变量注入。
- 手动 dry-run 模式（`workflow_dispatch` + `dry-run=true`）：完成版本校验、构建、打包、Release 资产上传，跳过商店上传。
- prerelease Release 不执行 Chrome Web Store 上传。
- 商店上传前校验 5 个必需 Secret（`CHROME_CLIENT_ID`、`CHROME_CLIENT_SECRET`、`CHROME_REFRESH_TOKEN`、`CHROME_ITEM_ID`、`CHROME_PUBLISHER_ID`），缺失时明确失败并打印变量名（不打印值）。
- workflow 顶部含完整文档注释：触发方式、Secrets 配置、dry-run 用法、常见故障排查。

## 文档

- 新增迭代文档：`releases/v0.3/issue-63/PRD.md`、`DESIGN.md`、`PLAN.md`、`MEMORY.md`、`CHANGELOG.md`。

## Bug 修复

- 无业务 bug 修复。本任务为 CI/CD 发布基建，不修改应用代码。

## API Changes

- 无 API 变更。

## 破坏性变更

- 无破坏性变更。`release.yml` 为新增独立 workflow，不影响现有 `ci.yml`。

## 验证

- `pnpm build` 通过，产出 `.output/chrome-mv3/` 构建产物。
- `pnpm typecheck` 通过。
- `pnpm lint` 通过。
- `pnpm zip` 通过，产出 `.output/llm-translator-0.1.0-chrome.zip`（78.67 kB）。
- workflow YAML 语法经 Python yaml.safe_load 校验通过（13 steps，2 triggers）。
