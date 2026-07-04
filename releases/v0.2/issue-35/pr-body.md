## 变更摘要

将翻译源配置从 options 页迁移到 popup,升级为配置主入口;抽取共享组件 `SourceConfigPanel.vue` 消除 popup 与 options 双份维护。

### 主要改动
- 新增 `shared/ui/SourceConfigPanel.vue`:从 options/App.vue 抽取全部源配置逻辑(状态+方法+模板),接受 `variant: 'popup' | 'options'` prop 控制布局差异
- 重构 `entrypoints/options/App.vue`:改为复用 SourceConfigPanel(variant="options"),行为等价
- 升级 `entrypoints/popup/App.vue`:400x600 配置面板(header + scrollable body + footer),复用 SourceConfigPanel(variant="popup")
- bug #27 在 popup 生效:配置自有源触发 addProvider() + 聚焦新卡片名称输入
- bug #28 在 popup 生效:源类型下拉 optgroup 分组(LLM 接口配置/传统翻译),移除云端/本地后缀
- popup 卡片可折叠、打开即聚焦首项、可访问性增强(role=status / Tab 可达 / 聚焦环)
- options/popup 互通:popup 底部「打开全部设置」→ chrome.runtime.openOptionsPage();共享 chrome.storage.local

### 影响面
- popup:从 602 字节「打开设置」按钮升级为完整配置面板
- options:从 ~18KB 内联逻辑重构为复用共享组件,功能等价
- 后端契约不变(ProviderType 枚举、Message 通道、shared/storage 均不变)
- 不触碰 #36 的文件(entrypoints/content.ts、assets/content.css、shared/translator/llm-provider.ts)

### 回滚方案
`git revert` 此 commit 即可恢复 options 原始内联实现和 popup 轻量按钮。无数据迁移,无破坏性变更。

## 审查上下文

| 项 | 内容 |
|---|---|
| PRD Issue | #30 (https://github.com/Aiden-FE/llm-translator/issues/30) |
| PRD 文档 | `knowledges/product-wiki/releases/v0.2/7-popup-settings/PRD.md` |
| 版本号 | v0.2 |
| 里程碑 | v0.2 - 翻译源配置闭环 (https://github.com/Aiden-FE/llm-translator/milestone/1) |
| DESIGN | `releases/v0.2/issue-35/DESIGN.md` |
| PLAN | `releases/v0.2/issue-35/PLAN.md` |
| CHANGELOG | `releases/v0.2/issue-35/CHANGELOG.md` |
| 验收标准 | 见 PRD §8 验收标准 + §UX 设计 验收补充 |
| UX 规范 | `knowledges/ux/design-system.md`、`knowledges/ux/interaction-patterns.md`、`knowledges/ux/accessibility.md` |
| 视觉原型 | `knowledges/ux/prototypes/v0.2-popup-settings.html` |
| 知识沉淀 | context: 无; adr: 共享组件变体设计(variant prop 控制 popup/options 差异); feature: popup 设置入口迁移与共享组件抽取; runbook: 无 |
| 并发安全等级 | parallel-safe |
| MR 基线策略 | base-branch |
| 上游 Issue/MR | 无 |
| 基线分支 | master |
| 推荐合并顺序 | 无(单任务,无上游依赖) |
| Stacked MR | 否 |
| 依赖契约或接口文档 | 无(后端契约不变,复用既有 get-active-sources/set-active-source/test-provider 消息通道与 shared/storage.ts) |

### 测试结果
- `pnpm lint`:0 errors 0 warnings
- `pnpm typecheck`(vue-tsc):通过
- `pnpm build`(wxt build):通过(156.4 kB)
- `pnpm test`(vitest):103/103 passed
- `pnpm e2e`(playwright):6/6 passed(划词翻译链路不退化)

Closes #35
