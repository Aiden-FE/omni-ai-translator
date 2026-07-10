# DESIGN: Chrome 扩展自动构建与上架发布流水线 (Issue #63)

> 版本: v0.3 · 关联 Issue #63 · 创建 2026-07-10

## 1. 技术选型

### 1.1 Workflow 触发机制

- **自动触发**: `on: release` + `types: [published]` --监听 GitHub Release 发布事件。仅正式 Release（非 prerelease）触发商店上传。
- **手动触发**: `on: workflow_dispatch` + `dry-run` 输入参数（默认 `true`）--用于首次联调与验证。

### 1.2 Chrome Web Store 上传

选用 `chrome-webstore-upload-cli@4`（fregante 社区 CLI，GitHub 上最广泛使用的 Chrome Web Store 上传工具），通过 `npx` 在 CI 中运行。v4 使用 Chrome Web Store API v2。

环境变量（通过 GitHub Secrets 注入）：
- `CLIENT_ID`: Google OAuth2 client ID
- `CLIENT_SECRET`: Google OAuth2 client secret
- `REFRESH_TOKEN`: OAuth2 refresh token
- `EXTENSION_ID`: Chrome Web Store 扩展 ID
- `PUBLISHER_ID`: Chrome Web Store publisher ID（v4 新增必需）

默认运行（无子命令）同时执行 upload + publish。通过 `--source` 指定 zip 路径。

Secret 申请指南: https://github.com/fregante/chrome-webstore-upload-keys

### 1.3 版本一致性校验

在 workflow job 中内联 shell 脚本完成，无需额外依赖：
- 从 tag（`github.event.release.tag_name` 或 `inputs.tag`）提取版本（去掉 `v` 前缀）
- 用 `node -p` 读取 `package.json` version
- 用 `grep -oP` 从 `wxt.config.ts` 提取 `manifest.version` 值
- 三方比对，不一致则 `exit 1`

### 1.4 Release 资产上传

使用 `gh release upload` CLI（`gh` 已预装在 GitHub Actions runner），将 zip 上传到对应 tag 的 Release。`--clobber` 覆盖同名资产（支持重跑）。

## 2. 架构

### 2.1 Workflow 结构

```
release.yml
├── on: release [published] + workflow_dispatch (dry-run)
├── job: release-chrome
│   ├── checkout
│   ├── setup pnpm 11 + node 22
│   ├── pnpm install --frozen-lockfile
│   ├── version-check (tag vs package.json vs manifest)
│   ├── pnpm build
│   ├── pnpm zip
│   ├── upload-to-release (gh release upload)
│   ├── skip-notice (dry-run/prerelease 时打印跳过原因)
│   ├── check-secrets (dry-run/prerelease 跳过)
│   └── upload-to-store (chrome-webstore-upload-cli@4, dry-run/prerelease 跳过)
```

### 2.2 条件控制

| 步骤 | 自动触发(正式) | 自动触发(prerelease) | 手动 dry-run |
|---|---|---|---|
| 版本校验 | 执行 | 执行 | 执行 |
| 构建+打包 | 执行 | 执行 | 执行 |
| Release 资产上传 | 执行 | 执行 | 执行 |
| 商店上传 | 执行 | **跳过** | **跳过** |

商店上传条件: `!prerelease && !dry-run`

### 2.3 环境变量与 Secrets

| Secret | 环境变量 | 用途 | 必需 |
|---|---|---|---|
| `CHROME_CLIENT_ID` | `CLIENT_ID` | Google OAuth2 client ID | 商店上传时必需 |
| `CHROME_CLIENT_SECRET` | `CLIENT_SECRET` | Google OAuth2 client secret | 商店上传时必需 |
| `CHROME_REFRESH_TOKEN` | `REFRESH_TOKEN` | OAuth2 refresh token | 商店上传时必需 |
| `CHROME_ITEM_ID` | `EXTENSION_ID` | Chrome Web Store 扩展 ID | 商店上传时必需 |
| `CHROME_PUBLISHER_ID` | `PUBLISHER_ID` | Chrome Web Store publisher ID | 商店上传时必需 |

Secrets 仅在商店上传步骤通过 `env` 注入，不在其他步骤暴露。检查步骤仅验证变量是否为空，不打印值。

## 3. 数据与接口

### 3.1 输入

- `github.event.release.tag_name`: Release tag（如 `v0.3.0`），release 事件
- `github.event.release.prerelease`: 是否预发布（boolean），release 事件
- `inputs.tag`: 手动指定的 Release tag，workflow_dispatch 事件
- `inputs.dry-run`: 是否跳过商店上传（boolean，默认 true），workflow_dispatch 事件

### 3.2 产出

- Chrome MV3 zip 包（`.output/llm-translator-<version>-chrome.zip`）
- GitHub Release 资产（zip 上传到 Release）
- Chrome Web Store 新版本（正式模式）

### 3.3 失败模式

| 场景 | 行为 |
|---|---|
| 版本不一致 | `exit 1`，错误信息仅含版本号，不含敏感数据 |
| Secret 缺失 | 商店上传前检查，缺失则 `exit 1` 并打印缺失变量名（不打印值） |
| 构建失败 | `pnpm build` 非零退出码，job 失败 |
| zip 生成失败 | `pnpm zip` 非零退出码，job 失败 |
| 商店上传失败 | CLI 返回非零退出码，job 失败 |

## 4. 兼容性与风险

### 4.1 兼容性

- 不修改现有 `ci.yml`，`release.yml` 为独立 workflow
- 不修改应用代码，仅新增 workflow 文件
- 版本号当前 `package.json`（0.1.0）与 `wxt.config.ts`（0.1.0）已一致

### 4.2 风险

| 风险 | 缓解 |
|---|---|
| Chrome Web Store API 凭据未就绪 | dry-run 模式可先验证构建+打包+资产上传 |
| `chrome-webstore-upload-cli` 停更 | 使用 `@4` 固定版本；后续可切换到其他工具 |
| WXT zip 产出文件名不确定 | 使用 `find` 匹配 `*-chrome.zip` |
| tag 格式非 vX.Y.Z | 版本校验步骤会失败并提示正确格式 |
| 凭据泄露 | Secrets 通过 `${{ secrets.* }}` 引用到 `env`，不 echo；CLI 内部处理凭据 |

## UX 与视觉实现

无前端界面，无 UX 实现要求。本任务为 CI/CD 发布基建。
