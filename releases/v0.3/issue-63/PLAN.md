# PLAN: Chrome 扩展自动构建与上架发布流水线 (Issue #63)

> 版本: v0.3 · 关联 Issue #63 · 创建 2026-07-10

## 任务清单

- [x] 新建 `.github/workflows/release.yml`，定义 release + workflow_dispatch 触发
- [x] 实现 checkout + pnpm 11 + node 22 环境准备步骤
- [x] 实现版本一致性校验步骤（tag vs package.json vs manifest）
- [x] 实现 pnpm build + pnpm zip 构建打包步骤
- [x] 实现 Release 资产上传步骤（gh release upload --clobber）
- [x] 实现 Secret 缺失检查步骤（商店上传前校验，仅打印变量名不打印值）
- [x] 实现 Chrome Web Store 上传发布步骤（chrome-webstore-upload-cli@4 via npx）
- [x] 实现 dry-run / prerelease 条件控制（跳过商店上传，含跳过原因日志）
- [x] 添加 Secrets 配置说明与 workflow 顶部注释文档（含触发方式、dry-run、故障排查）
- [x] 运行 pnpm build && pnpm typecheck && pnpm lint 全部通过
- [x] 校验 workflow YAML 语法（actionlint/yamllint 如可用）
- [x] 编写 CHANGELOG.md
