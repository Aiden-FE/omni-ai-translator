# 扩展商店发布

> 扩展商店自动发布流水线操作手册。prodflow-release-deploy 创建正式 GitHub Release 后，`release.yml` 自动触发三浏览器构建与上架。

## 触发条件

- prodflow-release-deploy 创建正式 GitHub Release（非 prerelease）-> `release.yml` 的 `on: release [published]` 自动触发。
- 手动 dry-run：`workflow_dispatch` + `dry-run=true`，执行版本校验 + 三浏览器构建/打包 + Release 资产上传，跳过商店 API。
- prerelease：不上传任何商店，仅完成构建与 Release 资产上传。

## 构建矩阵

| 浏览器 | 构建命令 | 打包命令 | 产物目录 | zip 产物 |
|--------|----------|----------|----------|----------|
| Chrome | `pnpm build` | `pnpm zip` | `.output/chrome-mv3/` | `.output/llm-translator-{version}-chrome.zip` |
| Firefox | `pnpm build:firefox` | `pnpm zip:firefox` | `.output/firefox-mv2/` | `.output/llm-translator-{version}-firefox.zip` + sources.zip |
| Edge | `pnpm build:edge` | `pnpm zip:edge` | `.output/edge-mv3/` | `.output/llm-translator-{version}-edge.zip` |

Firefox 另外生成 `sources.zip`（AMO 要求提交源码包）。

## 必需 GitHub Secrets

### Chrome Web Store

- `CHROME_CLIENT_ID` - OAuth client ID
- `CHROME_CLIENT_SECRET` - OAuth client secret
- `CHROME_REFRESH_TOKEN` - OAuth refresh token
- `CHROME_ITEM_ID` - 扩展 item ID（首次手动上传后获取）

### AMO (Firefox)

- `AMO_API_KEY` - AMO API key
- `AMO_API_SECRET` - AMO API secret

### Edge Add-ons

- `EDGE_PRODUCT_ID` - 扩展 product ID
- `EDGE_CLIENT_ID` - Azure AD client ID
- `EDGE_CLIENT_SECRET` - Azure AD client secret
- `EDGE_TENANT_ID` - Azure AD tenant ID

缺失任何 Secret 时，对应商店上传步骤在调用前明确失败（不静默跳过）。日志与产物中不泄露凭据值。

## 外部前置（用户操作）

- 各商店开发者账号注册与 OAuth 凭据申请。
- 首次手动上传扩展包以获取 `CHROME_ITEM_ID` / `EDGE_PRODUCT_ID`。
- 各商店人工审核通过后正式上架（流水线仅完成上传，审核为商店侧异步流程）。

## 故障排查

### 版本不一致

- tag 版本号、`package.json` version、manifest version 三者必须一致。
- 流水线启动时校验版本一致性，不一致则立即失败。
- 修复：确保 prodflow-release-deploy 创建的 tag 与 `package.json` 版本号同步更新。

### Secret 缺失

- 日志会明确指出缺失的 Secret 名称（不泄露已有值）。
- 修复：在仓库 Settings -> Secrets and variables -> Actions 中补充对应 Secret。

### Release 不存在

- `on: release [published]` 依赖 GitHub Release 已创建。若 Release 未创建或被删除，流水线不触发。
- 修复：确认 prodflow-release-deploy 已成功创建正式 Release。

### 单商店失败定位与安全重试

- 三浏览器上传步骤相互独立，单商店失败不影响其他商店上传。
- 流水线使用 `continue-on-error` 或 matrix 独立 job 隔离单商店失败。
- 安全重试：修复失败原因后，可用 `workflow_dispatch` + `dry-run=false` 手动重新触发（需 Release 仍存在）。或重新创建 Release 触发。
- 重试前检查商店后台是否已有部分上传（避免重复上传冲突）。

## 相关

- 触发决策：`knowledges/adr/007-release-event-driven-publishing-pipeline.md`
- 跨浏览器构建：`knowledges/adr/008-wxt-cross-browser-manifest-differentiation.md`
- 构建约定：`knowledges/context/development/wxt-conventions.md`
- 关键文件：`.github/workflows/release.yml`
- 迭代文档：`releases/v0.3/issue-63/`、`releases/v0.3/issue-68/`
