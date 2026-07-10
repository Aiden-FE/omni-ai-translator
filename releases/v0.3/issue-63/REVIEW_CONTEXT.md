## 变更摘要

新建 `.github/workflows/release.yml`，实现 Chrome 扩展自动构建与上架发布流水线。响应由 prodflow-release-deploy 创建的 GitHub Release published 事件，自动完成版本一致性校验、Chrome MV3 构建打包、Release 资产上传、Chrome Web Store 上传发布。支持手动 dry-run 模式（跳过商店上传），prerelease 不上传商店。

### 新增文件

- `.github/workflows/release.yml` - Chrome 扩展发布流水线 workflow
- `releases/v0.3/issue-63/PRD.md` - 任务 PRD（引用上游 PRD，含澄清）
- `releases/v0.3/issue-63/DESIGN.md` - 技术设计（选型、架构、Secrets、风险）
- `releases/v0.3/issue-63/PLAN.md` - 执行计划（全部完成）
- `releases/v0.3/issue-63/MEMORY.md` - 上下文记忆与待沉淀知识
- `releases/v0.3/issue-63/CHANGELOG.md` - 变更日志

## 影响面

- 新增独立 workflow，不修改现有 `ci.yml` 或任何应用代码。
- 需配置 5 个 GitHub Secrets 才能启用商店上传（dry-run 不需要）。
- 对 Release 事件的响应是增量式的：不创建 tag/Release/发行说明，仅上传资产。

## 回滚方案

删除 `.github/workflows/release.yml` 即可完全回滚，不影响现有 CI 或应用功能。已上传到 Chrome Web Store 的版本需在商店后台手动处理。

## 审查上下文

| 项 | 内容 |
|---|---|
| PRD Issue | #51 https://github.com/Aiden-FE/llm-translator/issues/51 |
| PRD 文档路径 | `releases/v0.3/3-release-pipeline/PRD.md` |
| 版本号 | v0.3 |
| 里程碑 | v0.3 - 商店首发与 UI 美化 |
| DESIGN | `releases/v0.3/issue-63/DESIGN.md` |
| PLAN | `releases/v0.3/issue-63/PLAN.md` |
| CHANGELOG | `releases/v0.3/issue-63/CHANGELOG.md` |
| 验收标准 | 正式 GitHub Release 发布后 workflow 自动触发；prerelease 不上传商店；dry-run 完成版本校验+构建+打包+Release 资产上传，跳过商店上传；正式模式用 Secrets 完成商店上传与发布；版本不一致时明确失败；Secret 缺失时上传前明确失败，不泄露凭据；Release 包含可安装 Chrome MV3 zip；pnpm build/typecheck/lint 通过 |
| UX 规范 | 无（纯后端/DevOps 任务，无前端界面） |
| 知识沉淀清单 | 知识沉淀：待补。feature: Chrome 扩展自动发布流水线架构；runbook: Chrome Web Store Secrets 配置与故障排查；adr: release event 驱动而非 tag push 驱动的发布流水线 |
| 并发安全等级 | parallel-safe |
| MR 基线策略 | base-branch |
| 上游 Issue/MR | 无研发任务依赖（运行时依赖 prodflow-release-deploy 已发布正式 GitHub Release） |
| 基线分支 | master |
| 推荐合并顺序 | 无 |
| Stacked MR | 否 |
| 依赖契约 | prodflow-release-deploy 创建 Release 与 tag，#63 响应正式 Release 事件（`release [published]`），prerelease 不上传商店。下游 PRD #55 的 #68 将复用本 workflow 结构扩展 Firefox/Edge |

Closes #63
