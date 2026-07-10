# PRD: Chrome 扩展自动构建与上架发布流水线 (Issue #63)

> 版本: v0.3 · 关联 Issue #63 · PRD Issue #51 · 创建 2026-07-10

## 1. 概述

本任务 (#63) 落地 `releases/v0.3/3-release-pipeline/PRD.md` 中定义的自动化发布流水线的 Chrome 扩展部分。新建独立 GitHub Actions workflow (`release.yml`)，响应由 `prodflow-release-deploy` 创建并发布的正式 GitHub Release 事件，自动完成版本提取与一致性校验、Chrome MV3 构建打包、Release 资产上传、Chrome Web Store 上传发布。

上游 PRD 文档: `releases/v0.3/3-release-pipeline/PRD.md`（关联 Issue #51）。本 PRD 在其基础上做任务级澄清与细化，不重写上游 PRD 内容。

## 2. 任务范围澄清

### 2.1 包含

- 新建 `.github/workflows/release.yml`，响应 `release` event（`published` action）
- 从 Release tag 提取 SemVer，校验 tag / package.json / wxt.config.ts manifest 三方版本一致
- CI 中安装锁定依赖、构建 Chrome MV3 扩展、生成可上架 zip
- 将 zip 上传到已存在的 GitHub Release（不创建 tag/Release/发行说明）
- 通过 Chrome Web Store API 上传并发布扩展（正式 Release）
- 手动 dry-run 模式：版本校验 + 构建 + 打包 + Release 资产上传，跳过商店上传
- prerelease Release 不上传商店
- Secrets 配置、触发方式、dry-run 与故障排查文档

### 2.2 不包含（上游 PRD 已界定）

- tag 创建、RELEASE-NOTES 聚合、GitHub Release 创建 -> prodflow-release-deploy 负责
- Chrome Web Store 首次手动上传与 OAuth 凭据申请 -> 用户外部完成
- Firefox/Edge 构建发布 -> PRD #55 的 #68

### 2.3 与上游 PRD 的差异澄清

上游 PRD 7.2 提到 "CI 自动创建 GitHub Release"，但 #63 Issue 明确 "不重复创建 tag、发行说明或 Release" --以 Issue 为准：Release 由 prodflow-release-deploy 创建，#63 仅上传资产到已存在的 Release。上游 PRD 7.2 提到 "发行说明自动生成"，但 #63 Issue 不含此项 --以 Issue 为准：RELEASE-NOTES 聚合由 prodflow-release-deploy 负责。

## 3. 验收标准

- [ ] 正式 GitHub Release 发布后 workflow 自动触发
- [ ] 从 Release tag 提取 SemVer 并校验 tag / package.json / manifest 三方一致，不一致时明确失败
- [ ] CI 安装锁定依赖、构建 Chrome MV3 扩展、生成可上架 zip
- [ ] zip 作为资产上传到对应 GitHub Release
- [ ] 正式模式使用 Secrets 完成 Chrome Web Store 上传与发布
- [ ] prerelease 不执行 Chrome Web Store 上传
- [ ] 手动 dry-run 可完成版本校验、构建、打包、Release 资产上传，明确跳过商店上传
- [ ] 必需环境变量缺失时上传前明确失败，日志/仓库/产物不泄露凭据
- [ ] `pnpm build`、`pnpm typecheck`、`pnpm lint` 通过

## 4. 依赖与契约

| 项 | 内容 |
|---|---|
| 上游（运行时） | prodflow-release-deploy 创建并发布正式 GitHub Release（含 tag + RELEASE-NOTES） |
| 触发契约 | 仅正式 Release 进入 Chrome Web Store 上传；prerelease 不上传 |
| 环境契约 | 用户提供 Chrome Web Store Secrets，流水线只负责安全消费与缺失校验 |
| 下游 | PRD #55 的 #68 复用本 workflow 结构扩展 Firefox/Edge |
| 并发安全 | parallel-safe |
| MR 基线 | base-branch |

## UX 与视觉实现

无前端界面，无 UX 实现要求。本任务为 CI/CD 发布基建。
