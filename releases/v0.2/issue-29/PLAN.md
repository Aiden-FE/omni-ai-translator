# PLAN — Issue #29 执行计划

## 任务条目

- [x] 编辑 `wxt.config.ts`:host_permissions 数组增补 `'https://*/*'`,补注释
- [x] 恢复依赖(若 worktree 无 node_modules)— pnpm install 完成,postinstall wxt prepare 通过
- [x] 运行构建,验证 `.output/chrome-mv3/manifest.json` 的 host_permissions 含 `https://*/*`— 构建通过,manifest 已确认含 `https://*/*`
- [x] 提交代码:`git add wxt.config.ts && git commit -m "fix(#29): manifest host_permissions 增补 https://*/* 覆盖云端 LLM 端点 [AICODING]"`— commit c1bf216
- [x] 自审:改动覆盖验收标准,可读性/健壮性
- [x] 写 CHANGELOG.md
- [x] 提交迭代文档并推送
- [x] 创建 PR(base master,head issue-29,body 含 "Closes #29" + 审查上下文)

## 执行偏差

无偏差。构建成功,manifest 验证通过。
