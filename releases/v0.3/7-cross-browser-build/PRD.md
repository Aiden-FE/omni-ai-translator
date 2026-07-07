# PRD:跨浏览器构建发布（7-cross-browser-build）

> 版本:v0.3 第 7 项 · 优先级 P1 · 关联 Issue #55 · 创建日期 2026-07-07 · 状态 draft

## 1. 摘要

本 PRD 定义 LLM Translator v0.3 跨浏览器构建发布：在 WXT 框架已预留的跨浏览器能力基础上，扩展第 3 项 release-pipeline，使同一发布流水线能产出 Chrome、Firefox、Edge 三浏览器扩展包并分别上架各自商店。目标是让用户从任一浏览器商店都能安装本插件，扩大分发覆盖面，支撑增长优先阶段的市场抢占。

## 2. 联系人

| 角色 | 负责人 | 备注 |
|---|---|---|
| 产品 | Prodflow | 需求与验收 |
| 前端/构建 | 待分配 | WXT 多浏览器 manifest 配置、browser.* API 统一、构建脚本补全 |
| 发布/运维 | 待分配 | GitHub Actions 构建矩阵扩展、AMO/Edge Add-ons API 凭据与上架 |

## 3. 背景

- **当前状态**：v0.1/v0.2 仅在 Chrome 验证；`wxt.config.ts` 的 manifest 为 Chrome MV3 硬编码（name/description/version/host_permissions/permissions 均写死）；`package.json` 已预留 `dev:firefox`/`build:firefox`/`zip:firefox` 脚本但未实际验证产出；startup-summary 明确「WXT 框架预留跨浏览器能力，但第一版只在 Chrome 验证」。
- **为什么现在做**：2026-07-06 战略转向增长优先——商店首发需覆盖更多浏览器以扩大分发覆盖面，单一 Chrome 渠道限制了用户触达；roadmap v0.3 明确含「跨浏览器构建（WXT 已预留，打通 Firefox/Edge 构建发布）」；WXT 跨浏览器能力已预留，扩展成本可控，是增长优先阶段零成本扩大用户基数的直接路径。
- **变化点**：第 3 项 release-pipeline 先打通 Chrome 自动发布流水线（push tag → CI 打包 → 上架 Chrome Web Store）；本项在其基础上扩展 Firefox/Edge 构建与上架。需处理 MV3 差异：Firefox 处于 MV2/MV3 过渡期（manifest_version 差异、host_permissions vs permissions 归并模型差异）、browser.* vs chrome.* API 命名差异（WXT 抽象层处理）。

## 4. 目标

**目标**：WXT 打通 Firefox/Edge 构建；同一发布流水线产出 Chrome/Firefox/Edge 三浏览器包并可分别上架；逐浏览器验证划词翻译核心链路通过。

**为什么重要**：Chrome Web Store 单一渠道限制了分发覆盖面；Firefox（AMO）和 Edge（Add-ons）用户群体合计不可忽视；增长优先阶段多浏览器上架是零成本扩大用户基数的直接手段。WXT 框架已预留跨浏览器能力，扩展边际成本可控。

**战略对齐**：对应 strategy 增长优先「商店首发扩大分发覆盖面」与 roadmap v0.3 跨浏览器构建要求（「WXT 已预留，打通 Firefox/Edge 构建发布」）。

**关键结果（SMART OKR）**：
- O：三浏览器扩展包可上架
  - KR1：Firefox/Edge 构建通过（`wxt build -b firefox` / `-b edge` 产出有效扩展包，可加载运行）
  - KR2：同一发布流水线（GitHub Actions）产出 Chrome/Firefox/Edge 三浏览器包
  - KR3：逐浏览器 smoke 验证划词翻译链路通过（划词 → 触发按钮 → 翻译 → 浮层展示，三浏览器各通过一次）

## 5. 细分市场

按待完成任务定义用户：

- **Firefox 用户**：任务是从 AMO 安装翻译插件——当前无法安装（仅 Chrome 商店有），期望在 Firefox 上获得与 Chrome 一致的划词翻译体验。约束：Firefox 处于 MV2/MV3 过渡期，部分 MV3 特性支持不完整。
- **Edge 用户**：任务是从 Edge Add-ons 安装翻译插件——当前无法安装，期望在 Edge 上开箱即用。约束：Edge 基于 Chromium 内核，与 Chrome 行为接近，主要差异在商店上架流程。
- **项目维护者**：任务是「一次构建发布三浏览器」——当前需手动分别构建且无 Firefox/Edge 流程，期望同一流水线自动产出三浏览器包并分别上架。约束：需提前申请 AMO API key/secret 与 Edge Publisher 凭据。

## 6. 价值主张

| 客户任务 | 现状痛点 | 升级后收益 |
|---|---|---|
| Firefox 用户安装插件 | AMO 无此插件，无法安装 | 可从 AMO 安装，体验与 Chrome 一致 |
| Edge 用户安装插件 | Edge Add-ons 无此插件 | 可从 Edge Add-ons 安装 |
| 维护者发布多浏览器 | 手动构建，无 Firefox/Edge 流程 | 同一流水线自动产出三浏览器包并上架 |
| 扩大用户覆盖面 | 仅 Chrome 单一渠道 | 三浏览器商店覆盖，分发面扩大 |

**比竞品优在哪**：多数翻译插件仅上架 Chrome 商店，Firefox/Edge 用户无优质选项；本项通过 WXT 跨浏览器能力低成本覆盖 Firefox/Edge，以多渠道分发在增长优先阶段抢占市场份额。

## 7. 解决方案

### 7.1 UX / 原型（高层流程）

无用户界面，流程为多浏览器构建发布：CI 触发（push 版本 tag）→ WXT 按浏览器目标分别构建（chrome/firefox/edge）→ 产出三浏览器扩展包 → 分别推送上架（Chrome Web Store / AMO / Edge Add-ons）→ 用户从各自浏览器商店安装。

### 7.2 核心功能

1. **WXT 多浏览器 manifest 配置**：`wxt.config.ts` manifest 支持按浏览器目标差异化（browser-specific manifest）；处理 Firefox MV2/MV3 兼容——manifest_version 差异、host_permissions 在 Firefox MV2 归入 permissions 的模型差异。
2. **browser.* API 统一**：WXT 抽象层（webextension-polyfill）统一 `browser.*` 与 `chrome.*` 命名差异；审查现有代码中直接使用 `chrome.*` 的调用，替换为 WXT 统一 API（`browser.*`），确保三浏览器运行时一致。
3. **构建脚本补全**：`package.json` 已有 `build:firefox`/`zip:firefox`，补全 Edge 构建（`build:edge`/`zip:edge`）；确保三浏览器 `wxt build` 均产出有效包。
4. **发布流水线扩展**：在第 3 项 release-pipeline 的 GitHub Actions 基础上，增加 Firefox/Edge 构建矩阵（matrix）与上架步骤——AMO API（signing/publishing）、Edge Add-ons API（upload/publish）。
5. **逐浏览器 smoke 验证**：三浏览器各跑一次划词翻译链路验证（划词 → 触发按钮 → 翻译 → 浮层展示），确保核心链路不退化。
6. **最小兼容修补**：仅在构建/运行阻断时做最小修补，不引入新功能、不做功能适配。

### 7.3 技术

- **入口**：`wxt.config.ts`（manifest 多浏览器配置）；`package.json` scripts（`build:edge`/`zip:edge` 补全）。
- **复用**：WXT 跨浏览器构建能力（`wxt build -b <browser>`）；第 3 项 release-pipeline 的 GitHub Actions workflow。
- **类型**：`shared/types.ts` 不变；WXT 统一 API（`browser.*`）替代直接 `chrome.*` 调用，类型由 WXT 提供。
- **存储**：`chrome.storage` → WXT 抽象（`browser.storage`），三浏览器一致，存储契约不变。
- **兼容**：Firefox MV2/MV3（manifest_version 差异；host_permissions 在 MV2 归入 permissions，MV3 分离）；逐浏览器 host_permissions 差异（当前 `https://*/*` 在 Firefox 需调整为 `<all_urls>` 或分域声明）；Edge 基于 Chromium 内核，兼容性高，主要验证商店上架流程。

### 7.4 假设

- 假设 WXT 0.19 的跨浏览器构建能力（firefox/edge target）足以产出有效包，无需额外脚手架。
- 假设 Firefox 当前 MV3 支持程度足以运行本扩展核心链路（划词翻译 + storage + contextMenus + activeTab）；若不足，降级为 MV2 仅影响 Firefox 目标，不波及 Chrome/Edge。
- 假设 AMO/Edge API 凭据可提前申请并获得（AMO 需 API key/secret，Edge 需 Publisher ID/Client Secret）。
- 假设 Edge（Chromium 内核）与 Chrome 行为基本一致，构建产物可直接上架，仅需商店流程适配。
- 假设现有代码中 `chrome.*` 直接调用可由 WXT 抽象层统一替换为 `browser.*`，无运行时差异。

## 8. 发布

**时间范围**：约 1–1.5 周（在第 3 项 release-pipeline 基础上扩展，依赖第 3 项先完成）。

**第一版（v0.3-7）包含**：
- WXT 多浏览器 manifest 配置（Firefox/Edge 差异化）
- browser.* API 统一（WXT 抽象层替换 chrome.* 直接调用）
- `build:edge`/`zip:edge` 构建脚本补全
- GitHub Actions 三浏览器构建矩阵 + AMO/Edge 上架步骤
- 逐浏览器 smoke 验证（划词翻译链路）
- 最小兼容修补（仅阻断项）

**未来版本（v0.4+）**：逐浏览器 e2e 自动化回归测试扩展；Safari 构建评估；商店自动更新与回滚机制。

**验收标准**：
- [ ] `wxt build -b firefox` 产出有效 Firefox 扩展包，可加载运行
- [ ] `wxt build -b edge` 产出有效 Edge 扩展包，可加载运行
- [ ] 同一 GitHub Actions workflow 产出 Chrome/Firefox/Edge 三浏览器包
- [ ] Firefox 扩展包可经 AMO API 上架
- [ ] Edge 扩展包可经 Edge Add-ons API 上架
- [ ] 三浏览器各通过一次划词翻译链路 smoke 验证（划词 → 触发按钮 → 翻译 → 浮层展示）
- [ ] 现有代码无 `chrome.*` 直接调用残留（统一为 WXT `browser.*` 抽象）

## UX 设计

> 本项为跨浏览器构建发布，无应用内用户界面，UX 章节不适用。
