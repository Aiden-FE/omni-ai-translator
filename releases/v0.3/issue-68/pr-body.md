## 变更摘要

扩展 `.github/workflows/release.yml`（原 #63 Chrome 单浏览器发布流水线）为 Chrome、Firefox、Edge 三浏览器构建矩阵。

- 将单 job `release-chrome` 重构为 matrix job `release`（browser: [chrome, firefox, edge]，fail-fast: false）
- 使用 `case` 语句按浏览器分发构建/打包命令，消费 #67 的 `pnpm build:firefox`/`build:edge`、`pnpm zip:firefox`/`zip:edge` 命令与产物路径
- 三浏览器 zip 上传同一 GitHub Release（`gh release upload --clobber`）
- 新增 AMO 上传步骤（`web-ext sign --channel listed`），消费 AMO_API_KEY/AMO_API_SECRET
- 新增 Edge Add-ons 上传步骤（REST API: Azure AD token -> upload package -> publish），消费 EDGE_PRODUCT_ID/CLIENT_ID/CLIENT_SECRET/TENANT_ID
- 每个浏览器独立 Secrets 校验，缺失时仅打印变量名不打印值
- prerelease 不上传任何商店；dry-run 跳过全部商店 API
- Chrome 逻辑（构建命令、zip 命令、chrome-webstore-upload-cli@4、Secrets）与 #63 完全一致

### 影响面

- `.github/workflows/release.yml`：唯一修改文件，从 Chrome 单 job 扩展为三浏览器 matrix job
- 新增 6 个 GitHub Secrets 需求（AMO 2 + Edge 4），需在仓库 Settings -> Secrets 配置后才能正式发布
- 不影响应用代码、构建配置、manifest

### 回滚方案

revert 本 PR 即可恢复 #63 的 Chrome 单浏览器 workflow。已配置的 AMO/Edge Secrets 可保留（不影响 Chrome 流程）。

Closes #68

## 审查上下文

| 项目 | 值 |
|---|---|
| PRD Issue | #55 |
| PRD 文档路径 | releases/v0.3/7-cross-browser-build/PRD.md |
| 版本 | v0.3 |
| 里程碑 | v0.3 - 商店首发与 UI 美化 |
| DESIGN 路径 | releases/v0.3/issue-68/DESIGN.md |
| PLAN 路径 | releases/v0.3/issue-68/PLAN.md |
| CHANGELOG 路径 | releases/v0.3/issue-68/CHANGELOG.md |
| UX 规范 | 无（CI/CD 任务，无前端界面） |
| 并发安全 | blocked-by-upstream |
| MR 基线 | after-upstream-merged（上游 #63/#67 已合并，基于 master） |
| 上游 Issue/MR | #63 (PR #71 已合并) + #67 (PR #72 已合并) |
| 基线分支 | master |
| 推荐合并顺序 | 最后 |
| Stacked MR | 否 |
| 依赖契约 | 扩展 #63 release.yml，消费 #67 三浏览器构建命令/产物路径/manifest 契约 |

### 验收标准

- 正式 GitHub Release 触发同一 workflow，成功生成 Chrome、Firefox、Edge 三浏览器 zip
- 三个 zip 均上传到对应的既有 GitHub Release，文件名明确包含目标浏览器且版本可追溯
- 正式模式在 Secrets 齐备时可调用 Chrome Web Store、AMO 和 Edge Add-ons 的上传/发布步骤
- 任一商店所需 Secrets 缺失时，在对应上传前明确失败，日志与构建产物不泄露凭据
- 手动 dry-run 完成版本校验、三浏览器构建/打包和 Release 资产上传，并跳过全部商店 API 调用
- prerelease 不上传 Chrome Web Store、AMO 或 Edge Add-ons
- 单个商店上传失败时可从日志定位目标浏览器和失败阶段，并有可重复的安全重试说明
- `pnpm build && pnpm build:firefox && pnpm build:edge && pnpm typecheck && pnpm lint` 通过

### 测试结果

- `pnpm build` (Chrome): 通过
- `pnpm build:firefox` (Firefox): 通过
- `pnpm build:edge` (Edge): 通过
- `pnpm typecheck`: 通过
- `pnpm lint`: 通过
- YAML 语法校验 (python yaml.safe_load): 通过

### 新增 Secrets 清单

AMO (2): AMO_API_KEY, AMO_API_SECRET
Edge (4): EDGE_PRODUCT_ID, EDGE_CLIENT_ID, EDGE_CLIENT_SECRET, EDGE_TENANT_ID

### 知识沉淀清单

- 三浏览器发布矩阵架构（matrix + case 分发 + fail-fast:false）- 知识沉淀:待补
- AMO/Edge API 接入与 Secret 约定 - 知识沉淀:待补
- dry-run/prerelease 门禁设计（upload_store 三因素判定）- 知识沉淀:待补
