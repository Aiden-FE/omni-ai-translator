# DESIGN: #68 多浏览器发布流水线 - Firefox/Edge 构建矩阵与商店发布

> Issue #68 · 版本 v0.3 · 关联 PRD Issue #55 · 创建 2026-07-10

## 1. 方案概述

### 1.1 扩展策略：矩阵化构建

在 #63 的单 job `release-chrome` 基础上，重构为 **matrix 矩阵** 单 job `release`，支持 `[chrome, firefox, edge]` 三浏览器并行构建。`fail-fast: false` 确保单个浏览器失败不取消其他浏览器构建。

**扩展原则**：Chrome 的构建命令（`pnpm build`/`pnpm zip`）、商店上传工具（`chrome-webstore-upload-cli@4`）、Secrets（`CHROME_*`）和逻辑保持与 #63 完全一致，仅在 matrix 结构中通过 `case` 语句分发浏览器目标。不重写 Chrome 上传逻辑，只扩展 Firefox/Edge 路径。

### 1.2 Workflow 结构

```
release.yml (扩展后)
├── on: release [published] + workflow_dispatch (tag + dry-run)
├── concurrency: release-extension-${{ tag }}
├── job: release (matrix: [chrome, firefox, edge], fail-fast: false)
│   ├── checkout
│   ├── setup pnpm 11 + node 22
│   ├── pnpm install --frozen-lockfile
│   ├── determine-context (tag, prerelease, upload_store)  [共享，同 #63]
│   ├── version-check (tag vs package.json vs manifest)     [共享，同 #63]
│   ├── build (case: chrome/firefox/edge)                   [浏览器特定]
│   ├── zip (case: chrome/firefox/edge)                     [浏览器特定]
│   ├── locate-zip (find *-{browser}.zip)                   [浏览器特定]
│   ├── upload-to-release (gh release upload --clobber)     [共享，同 #63]
│   ├── skip-notice (upload_store=false 时打印跳过原因)      [共享]
│   ├── check-secrets (浏览器特定 Secrets 校验)              [浏览器特定]
│   └── upload-to-store (浏览器特定 API 上传)                [浏览器特定]
```

### 1.3 条件控制矩阵

| 步骤 | 正式Release | prerelease | 手动dry-run |
|---|---|---|---|
| 版本校验 | 执行 | 执行 | 执行 |
| 构建+打包(三浏览器) | 执行 | 执行 | 执行 |
| Release资产上传 | 执行 | 执行 | 执行 |
| 商店上传(Chrome/AMO/Edge) | 执行 | **跳过** | **跳过** |

`upload_store` 判定逻辑与 #63 一致：
- prerelease=true -> upload_store=false
- release 事件(正式) -> upload_store=true
- workflow_dispatch + dry-run=false -> upload_store=true
- 其他 -> upload_store=false

## 2. 三浏览器构建矩阵

### 2.1 构建命令与产物（消费 #67 契约）

| 浏览器 | matrix值 | 构建命令 | 产物目录 | zip命令 | zip产物 |
|---|---|---|---|---|---|
| Chrome | `chrome` | `pnpm build` | `.output/chrome-mv3/` | `pnpm zip` | `.output/llm-translator-0.1.0-chrome.zip` |
| Firefox | `firefox` | `pnpm build:firefox` | `.output/firefox-mv2/` | `pnpm zip:firefox` | `.output/llm-translator-0.1.0-firefox.zip` |
| Edge | `edge` | `pnpm build:edge` | `.output/edge-mv3/` | `pnpm zip:edge` | `.output/llm-translator-0.1.0-edge.zip` |

### 2.2 构建分发实现

使用 `case` 语句在单个 step 中分发浏览器目标，避免重复 step 定义：

```yaml
- name: Build extension (${{ matrix.browser }})
  run: |
    case "${{ matrix.browser }}" in
      chrome)  pnpm build ;;
      firefox) pnpm build:firefox ;;
      edge)    pnpm build:edge ;;
    esac
```

zip 和 locate-zip 同理。locate-zip 使用 `find .output -name "*-${{ matrix.browser }}.zip"`。

## 3. AMO (Firefox) API 接入

### 3.1 工具选型

选用 Mozilla 官方 `web-ext` CLI，通过 `npx` 在 CI 中运行。`web-ext sign` 是 AMO 标准的上传签名发布工具。

```bash
npx --yes web-ext sign \
  --source-dir .output/firefox-mv2/ \
  --channel listed \
  --api-key "$AMO_API_KEY" \
  --api-secret "$AMO_API_SECRET" \
  --artifacts-dir .output/web-ext-artifacts
```

- `--source-dir .output/firefox-mv2/`：指向 WXT 构建的 Firefox 扩展目录
- `--channel listed`：发布到 AMO（公开可搜索），需通过 AMO 审核
- `--api-key` / `--api-secret`：AMO API 凭据（JWT issuer/secret）
- `--artifacts-dir`：签名后 XPI 保存目录

### 3.2 AMO Secrets

| Secret | 环境变量 | 用途 | 必需 |
|---|---|---|---|
| `AMO_API_KEY` | `AMO_API_KEY` | AMO JWT issuer (API key) | 商店上传时必需 |
| `AMO_API_SECRET` | `AMO_API_SECRET` | AMO JWT secret | 商店上传时必需 |

申请方式：登录 AMO (addons.mozilla.org) -> API Keys -> 创建 API key（需 Developer 或 Owner 权限）。

### 3.3 AMO 注意事项

- `web-ext sign --channel listed` 提交后进入 AMO 审核队列，非即时发布
- AMO 审核可能要求提交源码（sources.zip），属审核阶段任务，不在本 workflow 范围
- Firefox gecko.id 已由 #67 配置：`omni-ai-translator@aiden-fe.dev`

## 4. Edge Add-ons API 接入

### 4.1 工具选型

Edge Add-ons 无官方 CLI，直接使用 REST API（curl）。三步流程：获取 Azure AD token -> 上传包到 draft -> 发布提交。

### 4.2 API 流程

```bash
# 1. 获取 Azure AD access token (client_credentials flow)
TOKEN=$(curl -s -X POST \
  "https://login.microsoftonline.com/${EDGE_TENANT_ID}/oauth2/v2.0/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=${EDGE_CLIENT_ID}" \
  -d "client_secret=${EDGE_CLIENT_SECRET}" \
  -d "scope=https://api.addons.microsoftedge.com/.default" \
  | jq -r '.access_token // empty')

# 2. 上传 zip 包到 draft
curl -s -X POST \
  "https://api.addons.microsoftedge.com/v1/products/${EDGE_PRODUCT_ID}/submissions/draft/package" \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "file=@${ZIP_PATH}"

# 3. 发布提交
curl -s -X POST \
  "https://api.addons.microsoftedge.com/v1/products/${EDGE_PRODUCT_ID}/submissions" \
  -H "Authorization: Bearer ${TOKEN}"
```

### 4.3 Edge Secrets

| Secret | 环境变量 | 用途 | 必需 |
|---|---|---|---|
| `EDGE_PRODUCT_ID` | `EDGE_PRODUCT_ID` | Edge Add-ons 扩展产品 ID | 商店上传时必需 |
| `EDGE_CLIENT_ID` | `EDGE_CLIENT_ID` | Azure AD 应用 client ID | 商店上传时必需 |
| `EDGE_CLIENT_SECRET` | `EDGE_CLIENT_SECRET` | Azure AD 应用 client secret | 商店上传时必需 |
| `EDGE_TENANT_ID` | `EDGE_TENANT_ID` | Azure AD tenant ID | 商店上传时必需 |

申请方式：Azure AD 注册应用 -> 获取 client_id/secret/tenant_id；Edge Partner Center 获取 product_id。

### 4.4 安全注意

- Token 仅通过环境变量传递，不 echo
- curl 使用 `-s` 静默模式，响应中不含凭据
- HTTP 状态码校验，非预期码则 `exit 1` 并打印错误信息（不含敏感数据）
- 上传失败时不打印 response body 中的认证信息

## 5. Chrome Web Store（保持 #63 不变）

Chrome 的构建、打包、Release 资产上传、Secrets 校验、商店上传步骤与 #63 完全一致：

- 构建命令：`pnpm build`（在 matrix 中通过 case 分发）
- zip 命令：`pnpm zip`
- 商店上传工具：`npx --yes chrome-webstore-upload-cli@4 --source <zip-path>`
- Secrets：`CHROME_CLIENT_ID`/`CHROME_CLIENT_SECRET`/`CHROME_REFRESH_TOKEN`/`CHROME_ITEM_ID`/`CHROME_PUBLISHER_ID`
- 条件：`matrix.browser == 'chrome' && steps.ctx.outputs.upload_store == 'true'`

## 6. dry-run / prerelease 门禁设计

### 6.1 upload_store 判定（共享，同 #63）

所有三个浏览器的商店上传步骤都使用同一个 `upload_store` 输出：
- prerelease -> upload_store=false（所有浏览器跳过商店上传）
- dry-run=true -> upload_store=false（所有浏览器跳过商店上传）
- 正式 Release 或 dry-run=false -> upload_store=true（各浏览器检查各自 Secrets 后上传）

### 6.2 跳过通知

`upload_store=false` 时，打印跳过原因（prerelease 或 dry-run），明确标识目标浏览器。

### 6.3 Secrets 校验

每个浏览器在上传前独立检查各自所需 Secrets。缺失时仅打印变量名（不打印值），并给出配置指引。Secrets 校验步骤使用 `if` 条件，仅在 `upload_store=true` 时执行。

## 7. 完整 Secrets 清单

### 7.1 Chrome Web Store（#63 已有，5个）
| Secret | 用途 |
|---|---|
| `CHROME_CLIENT_ID` | Google OAuth2 client ID |
| `CHROME_CLIENT_SECRET` | Google OAuth2 client secret |
| `CHROME_REFRESH_TOKEN` | OAuth2 refresh token |
| `CHROME_ITEM_ID` | Chrome Web Store extension ID |
| `CHROME_PUBLISHER_ID` | Chrome Web Store publisher ID |

### 7.2 AMO（#68 新增，2个）
| Secret | 用途 |
|---|---|
| `AMO_API_KEY` | AMO JWT issuer (API key) |
| `AMO_API_SECRET` | AMO JWT secret |

### 7.3 Edge Add-ons（#68 新增，4个）
| Secret | 用途 |
|---|---|
| `EDGE_PRODUCT_ID` | Edge Add-ons 扩展产品 ID |
| `EDGE_CLIENT_ID` | Azure AD 应用 client ID |
| `EDGE_CLIENT_SECRET` | Azure AD 应用 client secret |
| `EDGE_TENANT_ID` | Azure AD tenant ID |

**合计新增 6 个 Secrets**（AMO 2 + Edge 4）。

## 8. 兼容性与风险

### 8.1 与 #63 的兼容性

- Chrome 构建命令、zip 命令、商店上传工具和 Secrets 保持不变
- 版本校验逻辑保持不变（tag vs package.json vs wxt.config.ts）
- Release 资产上传（`gh release upload --clobber`）保持不变
- concurrency group 从 `release-chrome-{tag}` 改为 `release-extension-{tag}`（三浏览器共享同一 Release，防重复触发）

### 8.2 与 #67 的契约消费

- 消费 #67 的构建命令：`pnpm build:firefox`、`pnpm build:edge`
- 消费 #67 的 zip 命令：`pnpm zip:firefox`、`pnpm zip:edge`
- 消费 #67 的产物路径：`.output/firefox-mv2/`、`.output/edge-mv3/`
- 消费 #67 的 manifest 契约：Firefox MV2（gecko.id 已配置）

### 8.3 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| AMO/Edge 凭据未就绪 | 正式发布时商店上传失败 | dry-run 可先验证构建+打包+资产上传；Secrets 校验提前失败并给出配置指引 |
| `web-ext` 版本变更 | sign 命令行为变化 | 使用 `npx --yes web-ext` 自动安装最新稳定版；Mozilla 官方维护 |
| Edge API 变更 | 上传/发布失败 | 使用 curl 直接调用 REST API，可快速适配；HTTP 状态码校验 |
| AMO 审核要求 sources.zip | 审核阶段补充源码 | 属审核范畴，不在 workflow 范围；troubleshooting 中说明 |
| 三浏览器并行构建资源竞争 | 构建变慢 | GitHub Actions runner 各 matrix 实例独立，无竞争 |
| 单浏览器失败影响其他 | 阻断发布 | `fail-fast: false`，其他浏览器继续；失败浏览器可重跑 |

### 8.4 失败定位与重试

- `fail-fast: false` 确保单个浏览器失败不取消其他
- 每个 step 有明确的 `name`，含浏览器标识（如 "Build extension (firefox)"）
- GitHub Actions matrix 允许重跑单个失败的浏览器（re-run failed jobs）
- 商店上传失败时：Secrets 问题 -> 重新配置 Secrets -> re-run；API 问题 -> 检查 API 状态 -> re-run
- Release 资产上传使用 `--clobber`，重跑时覆盖同名资产

## UX 与视觉实现

无前端界面，无 UX 实现要求。本任务为 CI/CD 与浏览器商店发布基建。workflow 日志应清晰标识目标浏览器、当前阶段和失败原因，但不得输出 Secret 值或可反推凭据的请求内容。
