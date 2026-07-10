# MEMORY: #68 多浏览器发布流水线 - Firefox/Edge 构建矩阵与商店发布

> Issue #68 · 版本 v0.3 · 创建 2026-07-10 · 关联 PRD Issue #55

## 1. PRD 摘要

PRD: `releases/v0.3/7-cross-browser-build/PRD.md`
在 WXT 框架已预留的跨浏览器能力基础上，扩展 #63 的 Chrome 发布 workflow，使同一发布流水线产出 Chrome、Firefox、Edge 三浏览器扩展包并分别上架各自商店（Chrome Web Store / AMO / Edge Add-ons）。增长优先阶段零成本扩大分发覆盖面。

### 验收标准
- 正式 GitHub Release 触发同一 workflow，生成 Chrome/Firefox/Edge 三浏览器 zip
- 三个 zip 均上传到同一既有 GitHub Release，文件名含目标浏览器且版本可追溯
- 正式模式 Secrets 齐备时调用 Chrome/AMO/Edge 上传发布
- 任一商店 Secrets 缺失时在对应上传前明确失败，日志不泄露凭据
- dry-run 完成构建/打包/资产上传，跳过全部商店 API
- prerelease 不上传任何商店
- 单个商店失败可定位并安全重试
- `pnpm build && pnpm build:firefox && pnpm build:edge && pnpm typecheck && pnpm lint` 通过

## 2. #63 Workflow 结构（上游契约，已合并 PR #71）

文件: `.github/workflows/release.yml`

### 触发
- `on: release [published]`: 自动，GitHub Release 发布时
- `on: workflow_dispatch`: 手动，含 `tag` + `dry-run` 输入

### 条件控制
| 步骤 | 正式Release | prerelease | 手动dry-run |
|---|---|---|---|
| 版本校验 | 执行 | 执行 | 执行 |
| 构建+打包 | 执行 | 执行 | 执行 |
| Release资产上传 | 执行 | 执行 | 执行 |
| 商店上传 | 执行 | **跳过** | **跳过** |

### Chrome Secrets (5个)
- CHROME_CLIENT_ID, CHROME_CLIENT_SECRET, CHROME_REFRESH_TOKEN, CHROME_ITEM_ID, CHROME_PUBLISHER_ID

### 关键设计
- 版本校验: tag SemVer vs package.json vs wxt.config.ts manifest.version 三方比对
- 商店上传工具: `chrome-webstore-upload-cli@4` (Chrome Web Store API v2)
- Release 资产上传: `gh release upload --clobber`
- concurrency: `release-chrome-${{ tag }}` 防重复
- Secret 检查仅打印变量名不打印值

### 当前 workflow 结构
单 job `release-chrome`，线性步骤: checkout -> pnpm/node setup -> install -> ctx(version/prerelease/upload_store) -> version-check -> build -> zip -> locate-zip -> upload-to-release -> skip-notice / check-secrets -> upload-to-store

## 3. #67 三浏览器构建契约（上游契约，已合并 PR #72）

### 构建命令与产物
| 浏览器 | 构建 | 产物目录 | zip 命令 | zip 产物 |
|---|---|---|---|---|
| Chrome | `pnpm build` | `.output/chrome-mv3/` | `pnpm zip` | `.output/llm-translator-0.1.0-chrome.zip` |
| Firefox | `pnpm build:firefox` | `.output/firefox-mv2/` | `pnpm zip:firefox` | `.output/llm-translator-0.1.0-firefox.zip` (+ sources.zip) |
| Edge | `pnpm build:edge` | `.output/edge-mv3/` | `pnpm zip:edge` | `.output/llm-translator-0.1.0-edge.zip` |

### manifest 差异
- Firefox MV2 (manifest_version=2, host_permissions 归 permissions, gecko.id, browser_action, background.scripts) — WXT 自动处理 MV2 转换
- Chrome/Edge MV3
- 权限基线三浏览器一致: `permissions:['storage','activeTab']`
- Firefox gecko.id: `omni-ai-translator@aiden-fe.dev`

## 4. 依赖链元数据

- PRD Issue: #55
- 上游 #63 (PR #71 已合并): release.yml Chrome 发布 workflow — 本任务直接扩展
- 上游 #67 (PR #72 已合并): 三浏览器构建命令/产物路径/manifest 契约 — 本任务消费
- 并发安全: blocked-by-upstream
- MR 基线: after-upstream-merged (上游已合并，基于 master)
- 基础分支: master
- 类型: 后端/DevOps，无前端界面

## 5. AMO/Edge API Secret 约定（待实现）

### AMO (Firefox Add-ons)
需新增 Secrets:
- AMO_API_KEY - AMO JWT issuer (API key)
- AMO_API_SECRET - AMO JWT secret
工具: `web-ext` CLI (Mozilla 官方) 或 AMO REST API
AMO 需要 sources.zip (源码包) — WXT zip:firefox 可能已生成

### Edge Add-ons
需新增 Secrets:
- EDGE_PRODUCT_ID - Edge 扩展产品 ID
- EDGE_CLIENT_ID - Azure AD client ID
- EDGE_CLIENT_SECRET - Azure AD client secret
- EDGE_ACCESS_TOKEN_URL - (可选) token endpoint
工具: Edge Add-ons API (Microsoft)

## 6. 关键文件路径

- worktree: `/home/admin/dev/prodflow/ai-projects/llm-translator/.worktrees/master-issue-68`
- workflow: `.github/workflows/release.yml`
- package.json scripts: build, build:firefox, build:edge, zip, zip:firefox, zip:edge, typecheck, lint
- wxt.config.ts: manifest 函数形式，Firefox 添加 gecko.id
- PRD: `releases/v0.3/7-cross-browser-build/PRD.md`
- #63 DESIGN: `releases/v0.3/issue-63/DESIGN.md`
- #67 DESIGN: `releases/v0.3/issue-67/DESIGN.md`

## 待沉淀知识

（Step5b 填充）
