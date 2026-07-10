# CHANGELOG: #68 多浏览器发布流水线 - Firefox/Edge 构建矩阵与商店发布

> Issue #68 · 版本 v0.3 · 创建 2026-07-10

## 变更内容

扩展 `.github/workflows/release.yml`（原 #63 Chrome 单浏览器发布流水线）为 Chrome、Firefox、Edge 三浏览器构建矩阵：

- **构建矩阵**：将单 job `release-chrome` 重构为 matrix job `release`（browser: [chrome, firefox, edge]，fail-fast: false），三浏览器并行构建互不阻断
- **构建分发**：使用 `case` 语句按 matrix.browser 分发构建/打包命令（Chrome: `pnpm build`/`pnpm zip`；Firefox: `pnpm build:firefox`/`pnpm zip:firefox`；Edge: `pnpm build:edge`/`pnpm zip:edge`）
- **Release 资产上传**：三浏览器 zip 均上传到同一个既有 GitHub Release（`gh release upload --clobber`），文件名含目标浏览器且版本可追溯
- **AMO 上传**（Firefox）：新增 `web-ext sign --source-dir .output/firefox-mv2/ --channel listed`，通过 AMO API 上传签名发布
- **Edge Add-ons 上传**（Edge）：新增 Edge Add-ons REST API（curl）三步流程——获取 Azure AD token -> 上传包到 draft -> 发布提交
- **Secrets 校验**：每个浏览器在上传前独立检查各自所需 Secrets，缺失时仅打印变量名（不打印值）并给出配置指引
- **发布边界**：prerelease 不上传任何商店；dry-run 跳过全部商店 API；正式 Release 上传全部商店
- **Chrome 逻辑不变**：Chrome 的构建命令、zip 命令、商店上传工具（chrome-webstore-upload-cli@4）、Secrets 与 #63 完全一致

## 新增 GitHub Secrets 清单

### AMO / Firefox Add-ons（2个）
| Secret | 用途 |
|---|---|
| `AMO_API_KEY` | AMO JWT issuer (API key) |
| `AMO_API_SECRET` | AMO JWT secret |

### Edge Add-ons（4个）
| Secret | 用途 |
|---|---|
| `EDGE_PRODUCT_ID` | Edge Add-ons 扩展产品 ID |
| `EDGE_CLIENT_ID` | Azure AD 应用 client ID |
| `EDGE_CLIENT_SECRET` | Azure AD 应用 client secret |
| `EDGE_TENANT_ID` | Azure AD tenant ID |

## 多商店发布说明

- 正式 GitHub Release 触发同一 workflow，三浏览器并行构建并上传 zip 到同一 Release
- 三浏览器商店上传独立执行，单个失败不影响其他浏览器（fail-fast: false）
- prerelease Release：三浏览器构建+资产上传正常执行，全部商店上传跳过
- 手动 dry-run（workflow_dispatch, dry-run=true）：三浏览器构建+资产上传正常执行，全部商店上传跳过
- 手动非 dry-run（workflow_dispatch, dry-run=false）：三浏览器构建+资产上传+商店上传（Secrets 齐备时）
- 商店上传失败可重跑单个 matrix 实例（re-run failed jobs），Release 资产使用 --clobber 覆盖

## 测试结果

- `pnpm build` (Chrome): 通过
- `pnpm build:firefox` (Firefox): 通过
- `pnpm build:edge` (Edge): 通过
- `pnpm typecheck`: 通过
- `pnpm lint`: 通过
- YAML 语法校验 (python yaml.safe_load): 通过
