# PRD:上架合规准备（4-listing-compliance）

> 版本:v0.3 第 4 项 · 优先级 P0 · 关联 Issue #52 · 创建日期 2026-07-07 · 状态 draft

## 1. 摘要

本事项为 LLM Translator 的 Chrome Web Store 上架准备合规材料：基于 v0.2 已更新的隐私声明（PRIVACY-POLICY.md），如实填报商店隐私实践表（数据收集类型/用途/共享）、为 manifest 声明的每个权限撰写用途说明、完成数据用途披露。目标是让合规字段与现有隐私声明完全一致、通过商店审核，为 v0.3 商店首发扫清合规障碍。

## 2. 联系人

| 角色 | 负责人 | 备注 |
|---|---|---|
| 产品 | Prodflow | 合规字段定义与验收 |
| 开发 | 待分配 | manifest 权限梳理、contextMenus 未用权限清理 |
| 法务 | 待分配 | 隐私实践表与数据披露复核（PRIVACY-POLICY.md 标注 `[⚠️ 需要法律复核]` 待补） |

## 3. 背景

v0.3 战略转向「增长优先」，核心目标是商店首发——把美化后的产品通过自动化流水线上架 Chrome 商店，让用户从商店发现→安装→使用全程闭环。上架前必须通过 Chrome Web Store 合规审核，其中三块材料是硬性门禁：

1. **隐私实践表**：商店要求如实声明扩展收集哪些数据、用途是什么、是否共享给第三方。v0.2 已更新隐私声明——默认外传文本到微软翻译（全新安装默认源）、用户可选 Google 免费源或自有源（LLM 提供方）、API Key 仅存 chrome.storage.local 不上传。roadmap 明确 v0.3 不引入新数据收集，隐私声明本身无需更新，但商店合规表须基于现有声明如实填报。
2. **权限声明**：商店要求每个 manifest 权限（含 host_permissions）附用途说明（justification）。当前 manifest 声明了 `storage`、`activeTab`、`contextMenus` 三个权限与 6 条 host_permissions，其中 `contextMenus` 在代码中未使用（合规风险——声明了但没用的权限会被审核质疑）。
3. **数据用途披露**：商店要求说明扩展如何处理用户数据，须与隐私实践表和隐私声明三者一致、无矛盾。

变化点：此前产品未上架，无商店合规材料；本轮首次填报。

## 4. 目标

**目标**：商店隐私实践表、权限声明、数据用途披露三份合规材料就绪，与 v0.2 隐私声明（PRIVACY-POLICY.md）完全一致，通过 Chrome Web Store 审核。

**为什么重要**：合规是上架的硬门禁——材料缺失或与实际行为矛盾会被拒审，直接阻塞 v0.3 商店首发。增长优先阶段，上架时间是抢占市场的关键。

**战略对齐**：v0.3 主题=商店首发与 UI 美化；本事项是首发闭环中「合规就绪」这一环，与发布流水线（第 3 项）、Listing 素材（第 6 项）并列，属发布基建工作流。

**关键结果（SMART OKR）**：

- O：合规上架就绪，商店审核通过
  - KR1：隐私实践表如实反映「个人通讯（待翻译文本）外传给 Google/微软/LLM 提供方」行为，其余数据类型勾选「不收集」，与 PRIVACY-POLICY.md 第 1-3 节一致
  - KR2：manifest 每个权限（storage/activeTab/content script）与每条 host_permissions（localhost/127.0.0.1/translate.googleapis.com/edge.microsoft.com/api.cognitive.microsofttranslator.com/https://*/*）一一对应并附用途说明；未使用的 `contextMenus` 权限移除
  - KR3：合规表、权限声明、数据用途披露三者与 PRIVACY-POLICY.md 交叉比对无矛盾（逐条核对清单产出）

## 5. 细分市场

按待完成任务定义用户：

- **上架审核员（Chrome Web Store）**：任务是审核扩展是否如实声明数据行为。约束：审核员只看 manifest 与商店填报表，不会读代码；声明必须与实际行为一致，多余权限会被质疑。
- **终端用户（安装前查看隐私披露）**：任务是评估「这个插件会不会泄露我的数据」。约束：用户在商店页面看到隐私实践摘要，期望一眼看清「文本发给谁、Key 存哪、有没有追踪」。
- **项目维护者（后续迭代）**：任务是保证未来版本合规表与隐私声明同步更新。约束：合规材料须可追溯、有变更记录，不能是一个不可维护的快照。

## 6. 价值主张

| 客户任务 | 现状痛点 | 升级后收益 |
|---|---|---|
| 通过商店审核 | 无合规材料，首次填报无从下手 | 隐私实践表/权限声明/数据披露齐备，一次过审 |
| 用户了解数据去向 | 商店页面无隐私披露 | 安装前看到准确摘要：文本发给翻译源、Key 仅本地、无追踪 |
| 权限透明 | manifest 有未用权限（contextMenus），审核员会质疑 | 移除未用权限，每个保留权限附用途说明，审核无歧义 |
| 后续维护 | 无合规变更流程 | 合规材料随版本更新，变更记录可追溯 |

比竞品优在哪：多数翻译扩展含追踪 SDK 或模糊披露数据去向；本项目零追踪、零分析、Key 纯本地，合规表可如实勾选「不收集」大部分类别，差异化透明度是增长优先阶段的信任抓手。

## 7. 解决方案

### 7.1 UX / 原型（高层流程）

本事项为合规材料填报，无面向终端用户的 UI 交互。流程为：梳理 manifest 权限 → 逐项撰写用途说明 → 对照 PRIVACY-POLICY.md 填报隐私实践表 → 产出数据用途披露文档 → 交叉比对一致性 → 提交商店审核。

UX 章节（如商店隐私披露页面的用户可读性优化）待 issue 创建后由 prodflow-prd revise 模式补全。

### 7.2 核心功能

**7.2.1 隐私实践表填报**

基于 PRIVACY-POLICY.md 如实填报 Chrome Web Store 隐私实践表：

| 数据类别 | 是否收集 | 用途 | 共享方 | 依据（PRIVACY-POLICY.md） |
|---|---|---|---|---|
| 个人通讯（Personal communications） | 是 | 待翻译文本发送给当前生效翻译源完成翻译 | Google 翻译 / 微软翻译 / 用户配置的 LLM 提供方 | 第 3 节「数据流向」 |
| 身份信息（PII） | 否 | — | — | 第 1 节「不收集任何个人身份信息」 |
| 认证信息（Authentication） | 否 | API Key 仅存本地 chrome.storage.local，不上传、不收集 | — | 第 2 节「仅本地，不上传」 |
| 位置信息 | 否 | — | — | 未涉及 |
| 浏览历史 | 否 | — | — | 第 1 节「不使用 Cookie 追踪」 |
| 用户活动 | 否 | — | — | 无分析/追踪 SDK |
| 网站内容 | 否 | content script 仅读取用户主动选中的文本，不收集网页内容 | — | 第 2 节「选中的待翻译文本」 |

「个人通讯」用途说明：用户划词选中的文本按需透传给当前生效的翻译源（默认微软翻译免费源，可切换 Google/自有源/本地模型），翻译完成后不在本地留存。

**7.2.2 权限声明**

逐项为 manifest 声明的权限撰写用途说明（justification）：

| 权限 | 用途说明 | 处置 |
|---|---|---|
| `storage` | 存储用户配置（LLM API Key、传统翻译源 API Key、目标语言、生效源等）到 chrome.storage.local，不外传 | 保留 |
| `activeTab` | 读取用户在当前页面选中的文本，用于划词翻译 | 保留 |
| `contextMenus` | manifest 已声明但代码中未使用 | **移除**（合规风险，审核会质疑无用权限） |
| content script `matches: <all_urls>` | 划词翻译需在用户浏览的任意网页上工作，读取选中文本并展示翻译浮层 | 保留，附用途说明 |

host_permissions 逐条用途说明：

| host_permission | 用途说明 |
|---|---|
| `http://localhost/*` | 连接用户配置的本地大模型（如 Ollama），文本仅在本机流转 |
| `http://127.0.0.1/*` | 同上，本地模型备用回环地址 |
| `https://translate.googleapis.com/*` | 调用 Google 翻译免 Key 公共端点（用户可选免费源之一） |
| `https://edge.microsoft.com/*` | 调用微软翻译免 Key 公共端点（全新安装默认选中源） |
| `https://api.cognitive.microsofttranslator.com/*` | 调用微软翻译官方 API（用户填入自有 Key 时使用） |
| `https://*/*` | 用户自配云端 LLM 端点（OpenAI 兼容接口 / Anthropic 端点），Service Worker 跨域 fetch 绕过 CORS |

**7.2.3 数据用途披露**

产出数据用途披露文档，覆盖以下要点（均与 PRIVACY-POLICY.md 一致）：

- 数据收集：不收集 PII，不内置分析/追踪 SDK，不使用 Cookie
- 数据使用：待翻译文本按需透传给当前生效翻译源；API Key 仅用于调用用户配置的接口，存本地不上传
- 数据共享：文本发送给翻译源（Google/微软/LLM 提供方），不发送给插件作者或任何无关第三方
- 数据存储：API Key 与设置存于 chrome.storage.local；待翻译文本翻译完成后不持久化（v0.2 无历史记录功能）
- 数据安全：Key 不出现在日志、错误上报或 commit 中
- 用户权利：可卸载插件或清除配置删除所有本地数据；可通过配置页选择翻译源（含本地模型使文本不外传）

**7.2.4 一致性交叉比对**

产出逐条核对清单，确保三份材料（隐私实践表、权限声明、数据用途披露）与 PRIVACY-POLICY.md 交叉一致、无矛盾。

**7.2.5 移除未用权限**

从 wxt.config.ts 的 `permissions` 数组中移除 `contextMenus`，验证移除后划词翻译链路无回归。

### 7.3 技术

- 入口：`wxt.config.ts`（manifest 权限声明），移除 `contextMenus`
- 复用：PRIVACY-POLICY.md（隐私声明，作为合规表的事实来源，不修改其内容）
- 类型：无新增类型，合规材料为文档产出
- 存储：不涉及存储变更（本轮不引入新数据收集）
- 兼容：移除 `contextMenus` 后需验证 content script / background / popup 链路无依赖（代码搜索确认当前未使用 contextMenus API）

### 7.4 假设

- 假设 v0.2 隐私声明（PRIVACY-POLICY.md）内容准确、已反映所有数据流向，本轮仅基于其填报合规表，不重新审计代码行为
- 假设 Chrome Web Store 审核以 manifest 声明的权限与商店填报表为准，不会要求额外代码级审计
- 假设移除 `contextMenus` 权限不影响任何现有功能（代码搜索确认未使用 chrome.contextMenus API）
- 假设 `[⚠️ 需要法律复核]` 标注项（隐私联系邮箱、责任主体、GDPR/CCPA 完整权利）不阻塞本轮上架（商店审核不强制要求这些字段，但建议正式发布前补全）
- 假设 v0.3 UI 美化（事项 1-2）不引入新权限或新数据收集，合规表在本轮填报后无需因美化而更新

## 8. 发布

**时间范围**：约 0.5-1 周（文档填报为主，加 contextMenus 移除与回归验证）。

**第一版（v0.3-4）包含**：
- 商店隐私实践表填报（个人通讯=是，其余=否，附用途与共享方）
- manifest 全部权限（含 host_permissions）逐条用途说明
- 数据用途披露文档
- 三份材料与 PRIVACY-POLICY.md 一致性交叉核对清单
- 移除未使用的 `contextMenus` 权限并回归验证

**未来版本**：
- 正式发布前由法律复核补全 PRIVACY-POLICY.md 中 `[⚠️ 需要法律复核]` 项（隐私联系邮箱、责任主体、GDPR/CCPA 权利流程），同步更新合规表
- 跨浏览器上架（Firefox/Edge）时按各商店要求适配合规字段（事项 7）
- Pro 上线前（不预设版本）隐私声明与合规表同步更新（账号、同步数据、支付通道）

**验收标准**：
- [ ] 隐私实践表如实反映默认外传 Google/微软 + LLM 外传行为，与 PRIVACY-POLICY.md 第 1-3 节一致
- [ ] manifest 每个权限与 host_permissions 一一对应并附用途说明
- [ ] 未使用的 `contextMenus` 权限已从 wxt.config.ts 移除
- [ ] 移除 contextMenus 后划词翻译链路 e2e 回归通过（不退化）
- [ ] 合规表、权限声明、数据用途披露三者与 PRIVACY-POLICY.md 交叉比对无矛盾（逐条核对清单产出）

## UX 设计

> 本项无应用内用户界面（Chrome Web Store 后台表单填报），UX 章节不适用。权限声明与隐私实践表见 Solution 7.2。
