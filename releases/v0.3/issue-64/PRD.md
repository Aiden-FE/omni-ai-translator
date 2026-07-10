# PRD: 合规材料落档与 contextMenus 权限清理 (#64)

> 任务 Issue: #64 | PRD Issue: #52 | 版本: v0.3 | 创建日期 2026-07-10

## 1. 任务目标

基于现有隐私政策(PRIVACY-POLICY.md)与 PRD #52，落档可直接用于 Chrome Web Store 后台填报的合规材料，并移除 manifest 中未使用的 contextMenus 权限。

### 交付物

1. **隐私实践表填报答案** - 与 PRIVACY-POLICY.md 一致的 Chrome Web Store 隐私实践表答案
2. **权限用途说明** - manifest 每个保留权限(storage、activeTab、content script matches)与全部 host_permissions 的逐项用途说明
3. **数据用途披露** - 覆盖数据类型/用途/共享方/存储/安全/用户权利的披露文档
4. **一致性交叉核对清单** - 三份材料与 PRIVACY-POLICY.md 逐条比对，确认无矛盾
5. **contextMenus 权限移除** - 从 wxt.config.ts 移除，验证构建产物不含该权限

### 验收标准

- [ ] 隐私实践表如实反映默认外传微软/Google + LLM 外传行为，与 PRIVACY-POLICY.md 第 1-3 节一致
- [ ] manifest 每个权限与 host_permissions 一一对应并附用途说明
- [ ] 未使用的 contextMenus 权限已从 wxt.config.ts 移除
- [ ] 移除 contextMenus 后划词翻译链路 e2e 回归通过
- [ ] 合规表、权限声明、数据用途披露三者与 PRIVACY-POLICY.md 交叉比对无矛盾
- [ ] pnpm build、pnpm typecheck、pnpm lint、pnpm e2e 全部通过

## 2. 范围边界

### 包含

- 版本控制下的 Chrome Web Store 合规材料(隐私实践表/权限说明/数据披露/核对清单)
- contextMenus 权限移除与回归验证
- Chrome MV3 manifest 权限检查

### 不包含

- 商店后台实际填报/审核沟通
- 法律复核(隐私联系邮箱、责任主体、GDPR/CCPA 权利流程)
- 修改 PRIVACY-POLICY.md 内容(发现冲突只记录报告)
- 处理 PRD #55(7-cross-browser-build)中 contextMenus 陈旧表述
