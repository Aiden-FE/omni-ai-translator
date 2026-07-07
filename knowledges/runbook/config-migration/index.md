# 配置 schema 迁移(chrome.storage.local)

> 纯操作类 runbook。chrome.storage.local 存量配置在数据模型演进时的无感迁移流程。

## 操作目的

`chrome.storage.local` 存量配置在数据模型演进时(字段重命名 / 枚举收敛 / 形态变更),采用 **on-read backfill** 模式无感迁移:读出时补全新形态字段,**不回写存储**,用户无感;直到用户下次主动写入才自然落新形态。最小侵入、可回滚。本 runbook 给出通用迁移流程,供后续版本复用。

## 前置条件

- 迁移逻辑是**纯函数**,可由读出值确定性地推出新形态(无外部依赖、无异步)。
- 新旧形态可共存:旧代码路径(未经迁移函数)读到旧形态不会崩,或已加兼容识别。
- 已评估 write-back vs on-read:确认运行时补全即可满足业务,无需主动写回(参考 ADR-005)。

## 操作步骤

1. **定义迁移纯函数**:在存储读取层(如 `shared/storage.ts`)新增 `migrateXxx(config)`,接收旧形态、返回新形态,纯函数无副作用。
2. **在读取入口 on-read 补全**:在 `getProviders` 等读取函数中,读出后立即调 `migrateXxx` 补全,**不回写存储**。
3. **registry / 路由层保留旧值兼容识别**:若存在不经 `getProviders` 直接传 config 的代码路径,在 `inferCategory` 等处同时识别新旧值,兜底迁移前路由失败。
4. **处理 TypeScript 联合收紧**:枚举/联合类型收敛后,旧值不再属于类型,直接 `=== 'oldVal'` 会报 TS2367。用 `const raw = config.field as string` 转 string 比较;`inferCategory` 参数也改为 `string`。
5. **写入路径自然落新形态**:用户主动编辑保存时经正常写入路径落新形态,无需额外写回逻辑。

## 验证

- 存量旧形态配置读出后,运行时得到新形态(字段/枚举正确补全)。
- 存储层仍是旧形态(未回写)——用户无感、可回滚。
- 不经 `getProviders` 的代码路径传旧 config,registry 兼容识别不报错。
- `pnpm typecheck` + 单测 + e2e 全绿(含旧形态 fixture 回归)。

## 回滚

- on-read backfill 天然可回滚:还原代码后,旧代码仍可读取原始旧形态配置(存储层未被破坏)。
- 若新形态有问题,只需改 `migrateXxx`,存储层数据不受影响。
- 极端情况(迁移函数 bug 污染运行时):修复 `migrateXxx` 即可,无需数据修复(未回写)。

## 相关

- 模式来源:#43 LLM 类型统一(`type` 子分组收敛为 `responseStyle`)
- 决策取舍:`knowledges/adr/005-response-style-as-llm-protocol-discriminator.md`(on-read vs write-back 选型)
- 实现参考:`knowledges/context/development/on-read-storage-migration.md`
- 关键文件:`shared/storage.ts`(`getProviders` + `migrateProvider`)、`shared/translator/registry.ts`(`inferCategory` 旧 type 兼容)
