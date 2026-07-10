## 变更摘要

从 `wxt.config.ts` 移除未使用的 `contextMenus` 权限，并落档可直接用于 Chrome Web Store 后台填报的合规材料。

### 具体变更

- **权限清理**: 从 `wxt.config.ts` 的 `permissions` 数组移除 `contextMenus`(代码库无 `chrome.contextMenus` API 调用，grep 确认)
- **隐私实践表** (`releases/v0.3/4-listing-compliance/PRIVACY-PRACTICES.md`): Chrome Web Store 隐私实践表填报答案，个人通讯=是(待翻译文本外传翻译源)，其余=否
- **权限用途说明** (`releases/v0.3/4-listing-compliance/PERMISSIONS-JUSTIFICATION.md`): storage、activeTab、content script matches、全部 host_permissions 逐项用途说明
- **数据用途披露** (`releases/v0.3/4-listing-compliance/DATA-DISCLOSURE.md`): 数据收集/使用/共享/存储/安全/用户权利六维度披露
- **一致性核对清单** (`releases/v0.3/4-listing-compliance/COMPLIANCE-CHECKLIST.md`): 12 项关键事实逐条核对，四份材料与 PRIVACY-POLICY.md 全部一致无矛盾

### 影响面

- 仅移除 manifest 中未使用的 `contextMenus` 权限声明，不影响任何运行时功能
- 合规材料为纯文档新增，不修改代码行为
- 不修改 PRIVACY-POLICY.md 内容

### 回滚方案

如需回滚，在 `wxt.config.ts` 的 `permissions` 数组中重新添加 `'contextMenus'` 即可。合规材料文档可保留或删除，无运行时影响。

## 审查上下文

| 字段 | 值 |
|---|---|
| PRD Issue | #52 |
| PRD 文档路径 | `releases/v0.3/4-listing-compliance/PRD.md` |
| 版本 | v0.3 |
| 里程碑 | v0.3 - 商店首发与 UI 美化 |
| DESIGN 路径 | `releases/v0.3/issue-64/DESIGN.md` |
| PLAN 路径 | `releases/v0.3/issue-64/PLAN.md` |
| CHANGELOG 路径 | `releases/v0.3/issue-64/CHANGELOG.md` |
| 验收标准 | 合规材料完整覆盖(隐私实践/权限说明/数据披露/一致性核对); contextMenus 从 wxt.config.ts 和 manifest 移除; build/typecheck/lint/e2e 通过 |
| UX 规范 | 无 |
| 知识沉淀清单 | 权限基线(context)、隐私数据流(feature) - 待沉淀 |
| 并发安全 | parallel-safe |
| MR 基线 | base-branch |
| 上游 | 无 |
| 基线分支 | master |
| 推荐合并顺序 | 无 |
| Stacked MR | 否 |
| 依赖契约 | 无 |

### 测试结果

- `pnpm build`: 通过，manifest.json permissions=["storage","activeTab"]，无 contextMenus
- `pnpm typecheck`: 通过
- `pnpm lint`: 通过
- `pnpm e2e`: 7/7 通过(划词翻译全链路回归)

Closes #64
