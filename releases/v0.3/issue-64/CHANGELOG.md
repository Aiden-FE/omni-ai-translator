# CHANGELOG: 合规材料落档与 contextMenus 权限清理 (#64)

> 任务 Issue: #64 | PRD Issue: #52 | 版本: v0.3 | 创建日期 2026-07-10

## 变更内容

### 新增

- 落档 Chrome Web Store 隐私实践表填报答案(`releases/v0.3/4-listing-compliance/PRIVACY-PRACTICES.md`)，与 PRIVACY-POLICY.md 一致
- 落档 manifest 权限用途说明(`releases/v0.3/4-listing-compliance/PERMISSIONS-JUSTIFICATION.md`)，覆盖 storage、activeTab、content script matches 及全部 host_permissions
- 落档数据用途披露(`releases/v0.3/4-listing-compliance/DATA-DISCLOSURE.md`)，覆盖数据收集/使用/共享/存储/安全/用户权利
- 落档一致性交叉核对清单(`releases/v0.3/4-listing-compliance/COMPLIANCE-CHECKLIST.md`)，12 项关键事实逐条核对无矛盾

### 变更

- 从 `wxt.config.ts` 移除未使用的 `contextMenus` 权限，最终 Chrome MV3 manifest 仅声明 `storage` 和 `activeTab`

### 验证

- `pnpm build` 通过，manifest.json 确认不含 contextMenus
- `pnpm typecheck` 通过
- `pnpm lint` 通过
- `pnpm e2e` 7 项测试全部通过，划词翻译链路无回归
