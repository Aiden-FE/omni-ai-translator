# PRD: #68 多浏览器发布流水线 - Firefox/Edge 构建矩阵与商店发布

> Issue #68 · 版本 v0.3 · 关联 PRD Issue #55 · 创建 2026-07-10 · 状态 draft

## 1. 摘要

在 #63 交付的 Chrome 发布 workflow 基础上，扩展为 Chrome、Firefox、Edge 三浏览器构建/打包矩阵。三浏览器 zip 作为资产上传到同一个正式 GitHub Release（由 prodflow-release-deploy 创建）。接入 AMO（Firefox）与 Edge Add-ons 的上传/发布 API，安全消费 GitHub Secrets 凭据。保持正式 Release / prerelease / 手动 dry-run 的发布边界。

## 2. 范围

### 包含
- 正式 GitHub Release 触发的 Chrome、Firefox、Edge 构建/打包矩阵（matrix）
- 三浏览器 zip 资产上传至同一个既有 GitHub Release，文件名含目标浏览器且版本可追溯
- AMO（web-ext sign）与 Edge Add-ons API（curl）正式上传/发布步骤
- 多商店凭据（Secrets）存在性校验，缺失时明确失败，不泄露凭据值
- 手动 dry-run：完成版本校验、三浏览器构建/打包/Release 资产上传，跳过全部商店 API
- prerelease 不上传任何商店的门禁
- 单个商店失败可定位（fail-fast: false）并安全重试说明

### 不包含
- AMO/Edge/Chrome 账号与凭据申请、首次商店建档、首次人工上传、人工审核（用户外部）
- 商店标题/描述/截图/图标（#66）
- 运行时 API 迁移/manifest 兼容（#67 已完成）
- tag/RELEASE-NOTES/GitHub Release 创建（prodflow-release-deploy）

## 3. 依赖

- #63（PR #71 已合并）：release.yml 正式 Release 触发、版本校验、Chrome 构建发布及 dry-run 基线
- #67（PR #72 已合并）：Firefox/Edge 构建命令（`pnpm build:firefox`/`build:edge`）、产物路径（`.output/firefox-mv2/`、`.output/edge-mv3/`）、manifest 契约

## 4. 验收标准

- 正式 GitHub Release 触发同一 workflow，成功生成 Chrome、Firefox、Edge 三浏览器 zip
- 三个 zip 均上传到对应的既有 GitHub Release，文件名明确包含目标浏览器且版本可追溯
- 正式模式在 Secrets 齐备时可调用 Chrome Web Store、AMO 和 Edge Add-ons 的上传/发布步骤
- 任一商店所需 Secrets 缺失时，在对应上传前明确失败，日志与构建产物不泄露凭据
- 手动 dry-run 完成版本校验、三浏览器构建/打包和 Release 资产上传，并跳过全部商店 API 调用
- prerelease 不上传 Chrome Web Store、AMO 或 Edge Add-ons
- 单个商店上传失败时可从日志定位目标浏览器和失败阶段，并有可重复的安全重试说明
- `pnpm build && pnpm build:firefox && pnpm build:edge && pnpm typecheck && pnpm lint` 通过
