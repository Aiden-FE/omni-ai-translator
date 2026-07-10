# MEMORY - Issue #63 发布流水线 - Chrome 扩展自动构建与上架

> 版本: v0.3 · 关联 Issue #63 · PRD Issue #51 · 创建 2026-07-10

## PRD 摘要

本任务 (#63) 为 LLM Translator 搭建 Chrome 扩展自动构建与上架发布流水线。新建独立 GitHub Actions workflow (`release.yml`)，响应由 `prodflow-release-deploy` 创建并发布的正式 GitHub Release 事件，自动完成：版本提取与一致性校验 -> 依赖安装 -> Chrome MV3 构建打包 -> Release 资产上传 -> Chrome Web Store 上传发布。支持手动 dry-run 模式（跳过商店上传）。prerelease 不上传商店。

参考 PRD 文档: `releases/v0.3/3-release-pipeline/PRD.md`（关联 Issue #51）。

## 业务规则

1. **触发契约**: 仅响应正式 GitHub Release 发布事件（`release` event, `published` action）；prerelease Release 不执行商店上传。
2. **版本一致性**: 从 Release tag 提取 SemVer（vX.Y.Z），校验 tag、`package.json` version、`wxt.config.ts` manifest.version 三方一致；不一致则中止，错误信息不含敏感数据。
3. **Release 资产上传**: 将构建产出的 Chrome MV3 zip 上传到已存在的 GitHub Release（不创建 tag/Release/发行说明，由 prodflow-release-deploy 负责）。
4. **Secret 安全消费**: Chrome Web Store API 凭据（CLIENT_ID、REFRESH_TOKEN、ITEM_ID）通过 GitHub Secrets 注入；必需变量缺失时上传前明确失败；日志/仓库/产物不泄露凭据。
5. **dry-run 模式**: 手动触发，完成版本校验+构建+打包+Release 资产上传，跳过商店上传；用于首次联调验证。
6. **不包含**: tag 创建、RELEASE-NOTES 聚合、GitHub Release 创建（prodflow-release-deploy 负责）；首次手动上传/OAuth 申请（用户外部完成）；Firefox/Edge（PRD #55）。

## 技术约束

- **运行环境**: ubuntu-latest, Node 22, pnpm 11（与现有 `ci.yml` 一致）。
- **构建工具**: WXT 0.19.0；`pnpm build`（wxt build）产出 `.output/chrome-mv3/`；`pnpm zip`（wxt zip）产出可上架 zip 包。
- **当前版本号**: `package.json` version=0.1.0, `wxt.config.ts` manifest.version=0.1.0（需同步，CI 校验）。
- **Chrome Web Store 上传**: 使用 `chrome-webstore-upload-cli@4`（fregante 社区 CLI）通过 `npx` 运行；v4 使用 Chrome Web Store API v2，需要 5 个环境变量：`CLIENT_ID`、`CLIENT_SECRET`、`REFRESH_TOKEN`、`EXTENSION_ID`、`PUBLISHER_ID`。Secret 申请指南: https://github.com/fregante/chrome-webstore-upload-keys
- **现有 CI**: `.github/workflows/ci.yml` 仅覆盖 typecheck + lint + e2e，无构建/发布步骤；`release.yml` 为独立 workflow，不改 ci.yml。
- **`.gitignore`**: `.output/`、`.wxt/` 已被忽略；构建产物不入库。

## 依赖链元数据

- **上游（运行时）**: prodflow-release-deploy 创建并发布正式 GitHub Release（含 tag + RELEASE-NOTES）；本 workflow 响应 `release` event。
- **下游**: PRD #55 的 #68 将复用本 workflow 结构扩展 Firefox/Edge 构建发布。
- **并发安全等级**: parallel-safe
- **MR 基线策略**: base-branch
- **上游研发任务依赖**: 无（运行时依赖正式 GitHub Release）

## 知识检索

知识检索: 直接读文件，无 retrieve 技能。已读 `knowledges/runbook/e2e-and-build/index.md`（CI Node 22 要求、构建排错）、`releases/v0.3/3-release-pipeline/PRD.md`、`releases/v0.3/7-cross-browser-build/PRD.md`（下游 Firefox/Edge 扩展参考）。

## 关键文件

- `.github/workflows/ci.yml` — 现有 CI workflow（typecheck + lint + e2e）
- `.github/workflows/release.yml` — 本任务新建（Chrome 发布流水线）
- `package.json` — scripts: build/zip/typecheck/lint；version=0.1.0
- `wxt.config.ts` — manifest.version=0.1.0
- `releases/v0.3/3-release-pipeline/PRD.md` — 上游 PRD 文档

## 待沉淀知识

### 1. feature: Chrome 扩展自动发布流水线架构
- **类型**: feature
- **Issue ID**: #63
- **关键摘要**: release.yml 响应 GitHub Release published 事件，自动构建 Chrome MV3 扩展并上传到 Chrome Web Store。架构为：release event -> 版本校验 -> build -> zip -> Release 资产上传 -> 商店上传（prerelease/dry-run 跳过）。使用 chrome-webstore-upload-cli@4，5 个 GitHub Secrets 注入凭据。
- **相关文件**: `.github/workflows/release.yml`, `releases/v0.3/issue-63/DESIGN.md`
- **建议沉淀路径**: `knowledges/feature/release-pipeline/chrome-publish.md`（新建 feature/release-pipeline/ 目录）

### 2. runbook: Chrome Web Store 发布 Secrets 配置与故障排查
- **类型**: runbook
- **Issue ID**: #63
- **关键摘要**: 5 个必需 GitHub Secrets（CHROME_CLIENT_ID、CHROME_CLIENT_SECRET、CHROME_REFRESH_TOKEN、CHROME_ITEM_ID、CHROME_PUBLISHER_ID）的申请与配置流程；dry-run 模式用法；版本不一致、Secret 缺失、Release 不存在等常见失败排查。
- **相关文件**: `.github/workflows/release.yml`（顶部注释含完整排障指南）
- **建议沉淀路径**: `knowledges/runbook/chrome-release/index.md`（新建 runbook/chrome-release/ 目录）

### 3. adr: release event 驱动而非 tag push 驱动的发布流水线
- **类型**: adr
- **Issue ID**: #63
- **关键摘要**: 选择 `on: release [published]` 而非 `on: push [tags: v*]` 作为触发器，因为 Release 由 prodflow-release-deploy 创建（含 RELEASE-NOTES 聚合），tag push 与 Release 创建之间有时间差。响应 Release 事件确保 RELEASE-NOTES 已就绪。prerelease 通过 `github.event.release.prerelease` 区分，天然支持跳过商店上传。
- **相关文件**: `.github/workflows/release.yml`, `releases/v0.3/3-release-pipeline/PRD.md`
- **建议沉淀路径**: `knowledges/adr/007-release-event-driven-pipeline.md`
