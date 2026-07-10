# PRD: #67 跨浏览器兼容 - Firefox/Edge 构建与运行时适配

> Issue #67 · PRD Issue #55 · 版本 v0.3 · 类型 前端 · 创建日期 2026-07-10

## 1. 目标

将 LLM Translator 扩展从仅 Chrome 验证扩展为 Chrome/Firefox/Edge 三浏览器构建与运行时兼容:

1. 配置 WXT 的 Chrome、Firefox、Edge 差异化 manifest,处理 Firefox manifest/权限模型差异,保持 Chrome、Edge MV3 产物有效
2. 将运行时代码中直接 `chrome.*` 调用迁移到 WXT 统一 `browser.*` API(消息、Port、存储、打开设置页等)
3. 补全 Edge 开发/构建/压缩脚本(dev:edge/build:edge/zip:edge),核对三浏览器构建与压缩产物
4. 为三浏览器划词翻译核心链路提供可重复 smoke 验证步骤,完成构建阻断项最小兼容修补

## 2. 范围

**包含**:
- WXT `manifest` 函数化,按 `browser` 目标差异化(Firefox 添加 `browser_specific_settings.gecko.id`)
- 运行时 `chrome.*` -> `browser.*` 全量迁移(7 处调用点)
- `package.json` 补全 Edge 脚本
- 测试 mock 适配(`chrome` -> `browser` 全局 mock)
- 三浏览器构建/smoke 验证说明

**不包含**:
- GitHub Actions 发布 workflow、Release 资产上传、商店 API 发布(属 #68)
- 商店账号/凭据申请/审核
- 新功能/交互改版/数据模型变更

## 3. 验收标准

- [ ] `pnpm build`、`pnpm build:firefox`、`pnpm build:edge` 均成功并产出可加载扩展目录
- [ ] Chrome、Firefox、Edge 压缩命令均成功,产物名称/路径稳定
- [ ] 三类产物 manifest 版本、权限、host permissions 符合目标浏览器要求
- [ ] 运行时代码无直接 `chrome.*` 调用残留(测试/mock/文档不计)
- [ ] `pnpm typecheck`、`pnpm test`、`pnpm lint` 通过
- [ ] 三浏览器划词翻译核心链路 smoke 验证步骤可重复执行
