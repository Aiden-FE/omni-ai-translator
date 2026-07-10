# 迭代主文档

| 项 | 内容 |
|---|---|
| **版本号** | v0.3 |
| **迭代主题** | 商店首发与 UI 美化 |
| **状态** | draft |
| **负责人** |  |
| **创建日期** | 2026-07-07 |
| **最近更新** | 2026-07-10（prodflow-workers Batch3 #68 完成 PR#74 待合并(多浏览器发布矩阵+AMO/Edge);#66/#67 已合并->item6 done;item7 #67已合并/#68 PR#74待合并 reviewing;6 个研发任务 PR 全创建,待 #74 合并后最终收尾:知识沉淀+index 翻 done+关闭 PRD#51-#55） |
| **开发周期估算** | ~3–3.5 周（美化工作流 ‖ 发布基建工作流并行；接受略超 3 周理论上限，用户已确认） |
| **闭环业务链** | 用户从 Chrome/Firefox/Edge 商店发现 AI Translator（产品名定稿 + Listing 素材 + 合规披露）→ 安装（自动化发布流水线上架）→ 划词/配置翻译源 → 看到美化后全新视觉体验（shadcn/tailwind 重构 + 明亮鲜艳主题）→ 获得译文 |
| **关联材料** | [../../knowledges/product-wiki/strategy/index.md](../../knowledges/product-wiki/strategy/index.md)、[../../knowledges/product-wiki/roadmap/index.md](../../knowledges/product-wiki/roadmap/index.md)、[../../knowledges/ux/design-system.md](../../knowledges/ux/design-system.md)、[../../knowledges/startup-summary.md](../../knowledges/startup-summary.md) |

---

## 迭代概览

本轮迭代是增长优先阶段的关键一轮：在 v0.2 翻译源配置闭环基础上，打通「商店首发美化产品」这条完整业务链——使美化后的产品可通过自动化流水线上架 Chrome/Firefox/Edge 商店，用户从商店发现→安装→使用全程闭环。发布基建与应用美化两工作流是交付这一闭环的两个半面，非两条独立业务链。

**目标**：
1. **全面美化应用**——引入 shadcn/ui + tailwindcss 重构 UI、弃灰白黑冷色改适度明亮鲜艳主题，提升商店首发视觉吸引力（战略明确「v0.3 上线前全面美化、美观是增长抓手」）。
2. **打通自动化发布基建**——GitHub Actions 自动打包/版本标签/发行说明 + Chrome Web Store API 上架 + 跨浏览器（Firefox/Edge）构建。
3. **商店上架就绪**——Listing 素材、上架合规披露、正式产品名定稿。

**范围边界**：本轮只闭环「商店首发美化产品」一条业务链，不涉及全文翻译、小窗输入翻译、翻译历史、账号体系/云同步等其它业务链。战略延后事项见「本轮不做」。

**估算说明**：现实估算 ~3–3.5 周（美化工作流 1→2 ‖ 发布基建工作流 3→[4,5,6,7] 并行），略超技能 3 周理论上限；用户已确认接受，并通过并行压缩 + 跨浏览器列 P1（Chrome 首发优先）做了缩减。

## 功能清单

| 编号 | 概要标题 | 优先级 | PRD 文档 | 状态 | 闭环路径说明 |
|---|---|---|---|---|---|
| 1 | ui-rewrite | P0 | `./1-ui-rewrite/PRD.md` | done | 引入 tailwindcss + shadcn/ui，重构翻译浮层/触发按钮/options 配置页/popup 全套组件到新设计系统；划词与配置链路全部基于新组件系统渲染 |
| 2 | visual-theme | P0 | `./2-visual-theme/PRD.md` | done | 弃灰白黑冷色，定适度明亮鲜艳主题（主色/强调/语义色），产出设计 token 并应用；全应用视觉焕新（依赖 1） |
| 3 | release-pipeline | P0 | `./3-release-pipeline/PRD.md` | done | GitHub Actions 自动打包 + Chrome Web Store API 上架；研发任务 #63（后端,PR #71 已合并）：`prodflow-release-deploy` 发布正式 GitHub Release → CI 打包并上传 Release 资产 → 自动上架 Chrome 商店 |
| 4 | listing-compliance | P0 | `./4-listing-compliance/PRD.md` | done | 商店隐私实践表/权限声明/数据用途披露；研发任务 #64（后端,PR #70 已合并）：合规材料落档 → 移除未用 `contextMenus` → 构建与划词链路回归 |
| 5 | product-name | P0 | `./5-product-name/PRD.md` | done | "AI Translator"+区分词定稿，同步 manifest/UI/商店品牌名；研发任务 #65（前端,PR #69 已合并）：统一 popup/options 品牌字样并完成 manifest/README/UI 一致性回归 |
| 6 | store-listing | P1 | `./6-store-listing/PRD.md` | done | 商店 Listing 素材：图标/截图/描述/分类/关键词；研发任务 #66（前端，依赖 #65）：归档 16/32/48/128px 图标、3 张 1280×800 商店截图与 Listing 文案 |
| 7 | cross-browser-build | P1 | `./7-cross-browser-build/PRD.md` | reviewing | WXT 打通 Firefox/Edge 构建 + 上架；研发任务 #67（前端，依赖 #64）：差异化 manifest、统一 `browser.*` API 与三浏览器 smoke；研发任务 #68（后端，依赖 #63/#67）：三浏览器构建矩阵、Release 资产与 AMO/Edge 发布 |

## 本轮不做

| 功能 | 所属业务链 | 延后原因 | 预计纳入版本 |
|---|---|---|---|
| 全文翻译（整页 DOM 改造 + 分段并发） | 全文翻译 | 独立业务链，复杂度高 | v0.4（顺延） |
| 小窗输入翻译 | 小窗输入翻译 | 独立交互入口 | v0.5（顺延） |
| 翻译历史记录（本地） | 历史记录 | 战略延后事项，免费产品成熟后渐进加入 | 待定 |
| 多源自动降级与优先级列表 | 翻译源配置 | v0.2 延后，状态管理复杂度高 | 后续评估 |
| 账号体系/云同步/Pro 变现 | 商业化 | 战略延后，免费产品成熟、WTP 验证后再建 | 不预设 |

## 依赖与风险

| 类型 | 内容 | 影响范围 | 缓解措施 | 负责人 |
|---|---|---|---|---|
| 依赖 | v0.2 已实现的翻译源配置/划词翻译链路 + popup/options UI | 美化重构 | 复用既有组件结构，重构而非重写 |  |
| 依赖 | store-listing(6) 截图依赖 ui-rewrite(1)+visual-theme(2) 完成 | Listing 素材 | 美化先行，截图排其后 |  |
| 依赖 | cross-browser-build(7) 依赖 release-pipeline(3) | 跨浏览器发布 | 先打通 Chrome 流水线再扩展 |  |
| 依赖 | visual-theme(2) 依赖 ui-rewrite(1) 新设计系统 | 主题应用 | 1→2 顺序执行 |  |
| 风险 | 美化重构波及现有划词/配置链路 | 划词翻译回归 | 复用 v0.2 e2e 用例回归，保证不退化 |  |
| 风险 | 首次 CI/CD + Chrome Web Store API 搭建（审核周期、API 配额未知） | 发布流水线 | 尽早 dry-run 跑通，预留审核周期 |  |
| 风险 | 跨浏览器 MV3 差异（Firefox MV2/MV3 过渡、权限差异） | 跨浏览器构建 | WXT 抽象 + 逐浏览器验证 |  |
| 风险 | 产品名商标/重名冲突 | 上架 | 上架前检索商标与商店重名 |  |
| 隐私登记 | 本轮不涉及隐私声明变更（roadmap 明确 v0.3 不引入新用户数据收集）；listing-compliance(4) 须基于 v0.2 已更新隐私声明如实填报商店隐私实践表 | 隐私合规 | 合规表与现有隐私声明一致 |  |

## 验收标准

| 验收项 | 验收条件 | 优先级 |
|---|---|---|
| UI 重构 | 浮层/触发按钮/options 配置页/popup 全部基于 tailwindcss + shadcn/ui 新设计系统渲染 | P0 |
| 视觉主题 | 弃用灰白黑冷色，应用适度明亮鲜艳主题，设计 token 落档 | P0 |
| 发布流水线 | push 版本 tag → GitHub Actions 自动打包 + 标签 + 发行说明 + 上架 Chrome 商店 | P0 |
| 上架合规 | 商店隐私实践表/权限声明/数据用途披露就绪，与 v0.2 隐私声明一致 | P0 |
| 产品名 | 正式产品名定稿，manifest/UI/商店品牌名统一 | P0 |
| 商店 Listing | 图标/截图/描述/分类/关键词齐备 | P1 |
| 跨浏览器 | Firefox/Edge 构建通过并可上架 | P1 |
| 划词回归 | 美化重构后划词翻译链路行为不退化（e2e 通过） | P0 |

## 里程碑信息

| 项 | 内容 |
|---|---|
| **里程碑标题** | `v0.3 - 商店首发与 UI 美化` |
| **仓库** | Aiden-FE/llm-translator（GitHub） |
| **截止日期** | 2026-07-29（里程碑 due_on，约 3 周） |
| **里程碑链接** | https://github.com/Aiden-FE/llm-translator/milestone/2 |
