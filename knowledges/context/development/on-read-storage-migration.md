# on-read 存储迁移模式

chrome.storage.local 存量配置在数据模型演进时,采用 **on-read backfill** 模式:读出时补全新形态字段,不回写存储,用户无感。任务 #43(LLM 类型统一)把旧 `type='ollama'`/`'openai-compatible'` 在 `getProviders` 读出时补全为 `type='llm'` + 对应 `responseStyle`,存储层不主动改写,直到用户下次主动写入才落新形态。

## 关系

- **存量配置(旧形态)** → `getProviders` on-read 补全(`migrateProvider`) → **运行时新形态**;存储层保持旧形态。
- **registry 旧 type 兼容识别**(`inferCategory` 同时识别新 `llm` 与旧 `openai-compatible`/`ollama`)兜底迁移前其他代码路径直接传 config 的场景。

## 示例对话

> **开发者**: "存量 ollama 配置为什么不读出时顺便回写成新形态?"
> **领域专家**: "回写需额外写操作且无业务价值——运行时已补全,用户无感。on-read backfill 最小侵入、可回滚:若新形态有问题,只需改 `migrateProvider`,存储层数据未被破坏。下次用户主动编辑保存才自然落新形态。"

## 适用场景

- 数据模型字段重命名 / 枚举收敛 / 形态变更,存量数据需无感迁移且不强制写回。
- 迁移逻辑纯函数、可由读出值确定性地推出新形态(无外部依赖)。

## 相关文件

- `shared/storage.ts` — `getProviders` 调 `migrateProvider` 补全 type + responseStyle,不回写
- `shared/translator/registry.ts` — `inferCategory` 旧 type 兼容识别(防迁移前路由失败)
- `knowledges/adr/005-response-style-as-llm-protocol-discriminator.md` — 选 on-read 而非 write-back 的决策取舍

## 踩坑

- **TypeScript 联合收紧后的旧值比较**: `ProviderType` 收敛后不再含 `'ollama'`/`'openai-compatible'`,直接 `p.type === 'ollama'` 报 TS2367。需 `const rawType = p.type as string` 转 string 比较;`inferCategory` 参数也改为 `string`。
- **registry 必须保留旧 type 识别**: 若只识别新 `llm`,迁移前(其他代码路径直接传 config、未经 `getProviders`)的旧 type 配置会路由失败。保留旧 type → llm 的兼容映射。
