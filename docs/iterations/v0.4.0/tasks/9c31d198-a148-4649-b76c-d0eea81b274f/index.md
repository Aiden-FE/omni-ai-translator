# 搭建上下文菜单入口与全文翻译消息通道

任务文档索引。

## 文档资产

- [DESIGN.md](DESIGN.md) — 技术设计：菜单/命令通道契约、MV3 SW 约束、target-lang 提取边界
- [PLAN.md](PLAN.md) — 实施计划（7 步，已全部完成）
- [CHANGELOG.md](CHANGELOG.md) — 变更清单与验证证据

## 代码资产

- `shared/target-lang.ts` + `shared/__tests__/target-lang.test.ts`（新增）
- `shared/types.ts`（DisplayMode / BackgroundCommand）
- `wxt.config.ts`（contextMenus 权限）
- `entrypoints/background.ts`（菜单创建 + 命令下发）
- `entrypoints/content.ts`（import 切换，行为不变）

## 缺失说明

无。e2e 已在本任务环境内实际运行通过（7/7）。
