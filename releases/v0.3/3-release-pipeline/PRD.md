# PRD:自动化发布流水线（3-release-pipeline）

> 版本:v0.3 第 3 项 · 优先级 P0 · 关联 Issue #51 · 创建日期 2026-07-07 · 状态 draft

## 1. 摘要

本项为 LLM Translator 搭建自动化发布流水线：push 版本 tag 后，GitHub Actions 自动构建打包、生成发行说明、通过 Chrome Web Store API 上架 Chrome 商店。取代 v0.2.0 全手动发版（手打 tag + 手建 GitHub Release + 无商店上架），使每次发版从多步人工操作降为一次 push，支撑增长优先阶段的高速迭代。

## 2. 联系人

| 角色 | 负责人 | 备注 |
|---|---|---|
| 产品 | Prodflow | 需求定义与验收 |
| DevOps/CI | 待分配 | GitHub Actions workflow 编写、Chrome Web Store API 对接、Secrets 配置 |
| 开发 | 待分配 | 版本号同步（package.json + manifest）、tag 命名规范遵守 |

## 3. 背景

**当前状态**：v0.2.0 发版全手动——打 tag `v0.2.0` @ commit `b5b3fb3` → 手动建 GitHub Release → 无商店上架。v0.2 RELEASE-NOTES 明确记载「项目未配置 deploy.yml，浏览器扩展商店发布流水线已延后到 v0.3，本版需自行打包部署」。现有 CI（`.github/workflows/ci.yml`）仅覆盖 typecheck + lint + e2e，无构建/打包/发布步骤。

**为什么现在做**：2026-07-06 战略转向增长优先，策略文档明确「发布速度（自动化商店发布流水线支撑高速迭代）」为近期护城河之一。手动发版每次需多步操作（打 tag、建 Release、打包 zip、上架），耗时且易出错，拖慢迭代节奏。roadmap v0.3 将自动化发布流水线列为发布基建首项。

**变化点**：从零搭建 CI/CD 发布流水线；首次接入 Chrome Web Store API；首次实现商店自动上架。

## 4. 目标

**目标**：建立 GitHub Actions 自动化发布流水线，push 版本 tag 触发自动构建打包 + 发行说明生成 + Chrome Web Store 上架，实现发版全自动化。

**为什么重要**：增长优先阶段发布速度是护城河——自动化后每次发版只需 push 一个 tag，将发布操作从多步手动降为零人工干预，支撑后续高速迭代节奏。

**战略对齐**：策略文档明确「发布速度（自动化商店发布流水线支撑高速迭代）」为近期护城河之一；roadmap v0.3 将自动化发布流水线列为发布基建首项（P0）。

**关键结果（SMART OKR）**：
- O：发版全自动化，零人工干预
  - KR1：push 版本 tag（vX.Y.Z）触发完整流水线，无人工干预即可完成构建 → 打包 → 发行说明 → 上架
  - KR2：自动产出可上架 zip 包 + GitHub Release 发行说明（聚合 `releases/<版本>/` 下 CHANGELOG 或读取 RELEASE-NOTES）+ Chrome 商店上传成功
  - KR3：首次 dry-run 验证通过（构建 + 打包 + 发行说明生成均成功，商店上传走 dry-run 模式验证）

## 5. 细分市场

按待完成任务定义用户（本项用户为开发团队内部，非终端用户）：

- **发布负责人（发新版）**：任务是「把一个开发完成的版本发布到 Chrome 商店」——期望一条命令（push tag）即可完成全部发布步骤，不需要手动打包、建 Release、登录商店后台上传。当前需多步手动操作，耗时且易遗漏。
- **开发者（持续迭代）**：任务是「频繁发版验证产品改进」——期望发版流程可重复、可靠、快速，不因发版操作拖慢迭代节奏。当前无自动化流程，每次发版重复手动劳动。

**约束**：
- Chrome Web Store API 需凭据（refresh token + item id），凭据须存 GitHub Secrets，不可入库。
- Chrome Web Store 审核有周期（首次提交可能需数天），API 上传后不等于即时上架。
- WXT build 产出在 `.output/chrome-mv3/`，`wxt zip` 产出可上架 zip 包。
- 版本号须在 `package.json`（`"version"`）与 `wxt.config.ts`（`manifest.version`）同步，tag 命名须与版本号一致（vX.Y.Z）。

## 6. 价值主张

| 客户任务 | 现状痛点 | 升级后收益 |
|---|---|---|
| 发布新版本 | 手打 tag + 手建 Release + 手动打包 + 手动上架，多步易错 | push 一个 tag，CI 自动完成全部步骤 |
| 生成发行说明 | 手动从各 Issue CHANGELOG 聚合 RELEASE-NOTES | CI 自动读取 `releases/<版本>/` 聚合或读取已有 RELEASE-NOTES |
| 上架 Chrome 商店 | 无商店上架流程，需手动登录后台上传 zip | CI 通过 Chrome Web Store API 自动上传发布 |
| 高频迭代发版 | 每次发版重复手动劳动，拖慢节奏 | 发版成本趋近于零，支撑高速迭代 |
| 版本可追溯 | tag 与 Release 手动建，可能不一致 | CI 自动建 tag + Release，版本号与产物严格一致 |

比竞品优在哪：多数中小翻译扩展仍靠手动打包上架或半自动脚本，发版周期长；本项目通过全自动 CI/CD 流水线实现「push tag 即上架」，发版速度成为增长优先阶段的护城河。

## 7. 解决方案

### 7.1 UX / 原型（高层流程）

无用户界面，流程为 CI 自动化。触发流程：

```
开发完成 → push 版本 tag（vX.Y.Z）
  → GitHub Actions 自动触发 release.yml
  → 构建（wxt build）→ 打包 zip（wxt zip）
  → 生成发行说明（读取 releases/<版本>/RELEASE-NOTES.md 或聚合 issue CHANGELOG）
  → 创建 GitHub Release（关联 tag + 附 zip artifact + body 填发行说明）
  → Chrome Web Store API 上传 zip + 发布
  → 完成，用户可从商店获取新版本
```

### 7.2 核心功能

1. **版本 tag 触发**：监听 `push tag v*` 事件（tag 格式 vX.Y.Z），触发 release workflow。tag 命名约定与 v0.2.0 已有实践一致。
2. **自动构建打包**：CI 环境执行 `pnpm install --frozen-lockfile` → `pnpm build`（wxt build 产出 `.output/chrome-mv3/`）→ `pnpm zip`（wxt zip 产出可上架 zip 包）。版本号从 tag 提取，校验 `package.json` 与 `manifest.version` 一致。
3. **发行说明自动生成**：优先读取 `releases/<版本>/RELEASE-NOTES.md`（已由 prodflow-release-deploy 聚合就绪）；若不存在，扫描 `releases/<版本>/issue-*/CHANGELOG.md` 聚合。将内容写入 GitHub Release body。
4. **Chrome Web Store API 上架**：使用 Chrome Web Store Upload API（client_id + refresh_token + item_id），上传 zip 包并发布（publish）。凭据存 GitHub Secrets，不入库不入日志。
5. **GitHub Release 自动创建**：CI 自动创建 GitHub Release，关联 tag，附 zip 包为 artifact，body 填入发行说明。
6. **dry-run 验证模式**：首次跑通时支持 dry-run（构建 + 打包 + 发行说明生成 + GitHub Release 创建，跳过商店上传），验证流水线正确性后再开启正式上架。
7. **版本号一致性校验**：CI 从 tag 提取版本号，校验 `package.json`（`"version"`）与 `wxt.config.ts`（`manifest.version`）一致，不一致则 fail。

### 7.3 技术

- **入口**：`.github/workflows/release.yml`（新建，独立于现有 `ci.yml`）。
- **复用**：复用现有 `ci.yml` 的 checkout + pnpm setup + node setup 步骤模式；复用 `package.json` 既有 `build`/`zip` 脚本（`wxt build` / `wxt zip`）。
- **类型**：无新增 TS 类型（本项为 CI/CD，不涉及应用代码类型变更）。
- **存储**：无应用存储变更；CI 产物（zip 包）作为 GitHub Release artifact 存储；Chrome Web Store API 凭据存 GitHub Secrets（`CHROME_CLIENT_ID`、`CHROME_REFRESH_TOKEN`、`CHROME_ITEM_ID`）。
- **兼容**：不改动现有应用代码与 `ci.yml`；`release.yml` 为独立 workflow。版本号须在 `package.json`（`"version"`）与 `wxt.config.ts`（`manifest.version`）同步——CI 从 tag 提取版本号并校验一致性。
- **tag 命名约定**：`vX.Y.Z`（如 v0.3.0），与 GitHub Release tag、Chrome Web Store 版本号一致。
- **Chrome Web Store API**：使用社区 Action（如 `chrome-webstore-upload-cli` 或 `microsoft/google-chrome-upload-action`）；需 Google Cloud 项目 OAuth 凭据（client_id + client_secret → refresh_token）+ 扩展 item_id。首次上架需手动上传 zip 获取 item_id，后续走 API 自动更新。
- **运行环境**：`ubuntu-latest`，Node 22，pnpm 11（与现有 ci.yml 一致）。

### 7.4 假设

- 假设 Chrome Web Store API 凭据（refresh token、item id）可在开发前就绪（需先在 Google Cloud Console 创建 OAuth 凭据并获取 refresh_token，在 Chrome Web Store Developer Dashboard 获取 item_id）。
- 假设扩展已通过 Chrome Web Store 首次手动上传（首次上架需手动上传 zip 获取 item_id，后续可走 API 自动更新）。
- 假设 `releases/<版本>/RELEASE-NOTES.md` 在发版时已由 prodflow-release-deploy 聚合就绪；若未就绪，CI 回退聚合 `releases/<版本>/issue-*/CHANGELOG.md`。
- 假设版本号在 tag、`package.json`、`manifest` 三处一致（CI 校验，不一致则 fail）。
- 假设首次 dry-run 跳过商店上传即可验证流水线其余环节正确性。
- 假设 WXT `zip` 命令产出的 zip 包符合 Chrome Web Store 上架格式要求（MV3 zip）。

## 8. 发布

**时间范围**：约 1 周（CI/CD 搭建 + Chrome Web Store API 对接 + dry-run 验证）。

**第一版（v0.3-3）包含**：
- `release.yml` workflow：tag 触发 → 构建 → 打包 → 发行说明 → Chrome Web Store 上架
- GitHub Release 自动创建（附 zip artifact + 发行说明 body）
- Chrome Web Store API 凭据存 GitHub Secrets
- dry-run 验证模式
- 版本号一致性校验（tag / `package.json` / manifest）

**未来版本（v0.3-7 / 后续）**：
- 跨浏览器构建发布（Firefox/Edge，依赖本项流水线扩展，属第 7 项）
- 商店 Listing 素材自动化（截图等，属第 6 项）
- 发版前自动跑 e2e 门禁（当前 `ci.yml` 已覆盖，可串联为 release 前置检查）

**验收标准**：
- [ ] push 版本 tag（vX.Y.Z）触发 `release.yml` workflow 自动执行
- [ ] CI 自动构建并产出可上架 zip 包
- [ ] CI 自动生成发行说明（读取 RELEASE-NOTES 或聚合 CHANGELOG）并填入 GitHub Release body
- [ ] CI 自动创建 GitHub Release（关联 tag + 附 zip artifact）
- [ ] CI 通过 Chrome Web Store API 上传 zip 并发布到商店（正式或 dry-run 验证通过）
- [ ] 版本号在 tag / `package.json` / manifest 三处一致（CI 校验）
- [ ] Chrome Web Store API 凭据存 GitHub Secrets，不入库不入日志
- [ ] dry-run 验证通过（构建 + 打包 + 发行说明生成成功）

## UX 设计

> 本项为纯基建（GitHub Actions CI/CD 流水线），无应用内用户界面，UX 章节不适用。流程与配置见 Solution 7.2。
