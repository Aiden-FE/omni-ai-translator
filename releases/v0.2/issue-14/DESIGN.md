# DESIGN — 免 Key 翻译源 google/microsoft provider 实现与生效源切换契约

| 项 | 内容 |
|---|---|
| ISSUE_ID | #14 |
| 所属 PRD | #2 |
| 迭代版本 | v0.2 |
| 设计模式 | 无人值守自动批准（依据：#14 Issue + #2 PRD 修订版 + 代码现状可做保守可回滚决策） |

## 1. 背景与目标

unified-adapter #10 已落地 `TranslationProvider` 接口、注册表、四类错误模型，并预留 `traditional-provider.ts` 占位（translate/test 返回 unreachable）。本任务将该占位替换为真实的 google/microsoft 免 Key provider 实现，并补齐生效源默认/切换契约、host_permissions、错误归类与隐私声明，使用户无需任何配置即可划词翻译（默认 microsoft）。

## 2. 技术选型与方案对比

核心设计问题：**如何让内置免费源（端点不可编辑）出现在可用源列表、可被选为生效源、且 fresh install 默认选中 microsoft，同时不引入隐式回退。**

### 方案 A：内置源常量 + 合并返回 + null 解析默认（推荐）

- 新建 `shared/translator/builtin-sources.ts`，定义 `BUILTIN_FREE_SOURCES: ProviderConfig[]`（id `builtin:microsoft`/`builtin:google`，type microsoft/google，category traditional，baseUrl 为内置端点常量），导出 `getBuiltinSourceById(id)`、`DEFAULT_ACTIVE_SOURCE_ID = 'builtin:microsoft'`。
- `translateWithAdapter`：`activeId = settings.activeProviderId ?? DEFAULT_ACTIVE_SOURCE_ID`；先在 stored providers 查找，未命中再查 builtin free sources；均未命中才返回 no-config。
- 新增 `getActiveSources()`：合并 builtin + stored providers 返回 `{ sources, activeSourceId }`，`activeSourceId = settings.activeProviderId ?? DEFAULT_ACTIVE_SOURCE_ID`。
- 新增 `setActiveSource(id)`：`setSettings({ ...settings, activeProviderId: id })`。

**优点**：无需 install 时写 storage（无 onInstalled 监听、无迁移）；fresh install 即可见即用；默认值是文档化的 null 解析，非隐式回退；改动集中、易回滚。
**缺点**：内置源不在 storage（用户无法删除，符合 PRD）；null 语义从 no-config 变为 microsoft 默认（预期行为变更，需更新测试）。

### 方案 B：onInstalled 监听写入 builtin 源到 storage

- 在 background 注册 `chrome.runtime.onInstalled`，首次安装时将 google/microsoft 写入 `providers` storage 并设 `activeProviderId = builtin:microsoft`。

**优点**：内置源与用户源统一在 storage，translateWithAdapter 无需改路由。
**缺点**：需引入 install 生命周期监听；已安装用户（已装但无 builtin 源）需迁移逻辑；写入 storage 后用户可「删除」内置源（与 PRD「始终可选」冲突，需防删）；改动面更大、回滚复杂。否决。

### 方案 C：translateWithAdapter 回退链

- activeProviderId 失败时自动尝试 builtin microsoft → google。

**优点**：实现简单。
**缺点**：**违反「无隐式自动回退」核心语义**。否决。

### 最终选择：方案 A

满足最小改动、可测试、可回滚；默认值是显式文档化的 null 解析（非回退）；内置源始终可选符合 PRD；不引入 install 迁移复杂度。

## 3. 架构方案

```
content-script → sendMessage({type:'translate', payload})
  → background.ts
      → translateWithAdapter(req)
          → activeId = settings.activeProviderId ?? 'builtin:microsoft'
          → stored providers.find(id) ?? builtinSources.find(id)
          → 无匹配 → no-config
          → createProvider(config) → provider.translate(req)
              → google/microsoft: fetch 内置端点常量 → 解析非标准响应 → TranslateResult
              → 失败 → classifyError(err, status) → errorType
          → TranslateResult → 浮层

配置页(#4) → sendMessage({type:'getActiveSources'})
  → background → getActiveSources() → { sources: [...builtin, ...stored], activeSourceId }
配置页(#4) → sendMessage({type:'setActiveSource', payload:{id}})
  → background → setActiveSource(id) → setSettings({activeProviderId: id})
```

## 4. 数据结构/模型变更

### 4.1 新增 `shared/translator/builtin-sources.ts`

```typescript
// 内置免费源端点常量（不可编辑）
const GOOGLE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const MICROSOFT_ENDPOINT = 'https://edge.microsoft.com/translate'; // 实现时验证可达性

export const DEFAULT_ACTIVE_SOURCE_ID = 'builtin:microsoft';

export const BUILTIN_FREE_SOURCES: ProviderConfig[] = [
  { id: 'builtin:microsoft', name: '微软翻译（免费）', type: 'microsoft', category: 'traditional', baseUrl: MICROSOFT_ENDPOINT, model: '' },
  { id: 'builtin:google', name: 'Google 翻译（免费）', type: 'google', category: 'traditional', baseUrl: GOOGLE_ENDPOINT, model: '' },
];

export function getBuiltinSourceById(id: string): ProviderConfig | undefined { ... }
```

> 端点确切 URL 与请求/响应格式由实现时验证可达性确定（PRD 授权），常量定义后不可由用户编辑。

### 4.2 `shared/types.ts` Message 联合类型扩展

```typescript
export type Message =
  | { type: 'translate'; payload: TranslateRequest }
  | { type: 'test-provider'; payload: ProviderConfig }
  | { type: 'get-settings' }
  | { type: 'get-providers' }
  | { type: 'get-active-sources' }                      // 新增
  | { type: 'set-active-source'; payload: { id: string } }; // 新增

// 新增返回类型
export interface ActiveSourcesResult {
  sources: ProviderConfig[];
  activeSourceId: string;
}
```

### 4.3 `shared/translator/traditional-provider.ts` 重写

`createTraditionalProvider(config)` 按 `config.type` 路由到 `callGoogle`/`callMicrosoft`，使用内置端点常量（忽略 config.baseUrl，因端点不可编辑），fetch + 解析非标准响应 + classifyError 归类错误。

## 5. 接口设计

### 5.1 background 消息契约（供 #4 消费）

| 消息 type | payload | 返回 | 说明 |
|---|---|---|---|
| `get-active-sources` | 无 | `ActiveSourcesResult` | 返回 builtin+stored 合并源列表及当前生效源 id |
| `set-active-source` | `{ id: string }` | `{ ok: true }` | 设置生效源（id 可为 builtin 或 user provider） |

### 5.2 适配层新增函数

- `getActiveSources(): Promise<ActiveSourcesResult>` — 合并 builtin + stored，activeSourceId 解析默认。
- `setActiveSource(id: string): Promise<void>` — 写 settings.activeProviderId。

### 5.3 Provider 行为契约（不变）

google/microsoft provider 实现 `TranslationProvider`：输入 `TranslateRequest`，输出 `TranslateResult`；失败经 `classifyError` 归类为 network/rate-limit/unreachable。

## 6. 错误归类映射

| 场景 | errorType | 可读提示 |
|---|---|---|
| fetch 抛异常 / 域名不可达 / 地域不可达 | `network`（无 status）或 `unreachable` | 翻译源不可达，请在配置页切换到其它源 |
| 源返回 429 | `rate-limit` | 翻译源繁忙（限流），请稍后再试或配置自有源 |
| 源返回 4xx/5xx（非 429） | `unreachable` | 翻译源不可达，请在配置页切换到其它源 |

复用 `classifyError`，不新增 errorType 值。免费源失败**不自动回退**。

## 7. host_permissions 声明

`wxt.config.ts` manifest.host_permissions 新增：
- `https://translate.googleapis.com/*`（google）
- `https://edge.microsoft.com/*`（microsoft，确切域名随实现验证调整）

## 8. 兼容性与风险评估

- **向后兼容**：`translateWithAdapter` 仍读 stored providers；用户已配置的 LLM 源 activeProviderId 不变，行为不退化。null 默认从 no-config 变为 microsoft，仅影响 fresh install（预期）。
- **测试同步**：adapter.test.ts / registry.test.ts 中「传统 provider 返回 unreachable」断言需更新为 mock fetch 测试真实翻译。
- **风险**：非官方端点可能限流/封禁/地域不可达（Google 大陆不可达）—— 由错误归类 + 人工切换应对，不自动回退。
- **回滚**：删除 builtin-sources.ts，恢复 traditional-provider.ts 占位、index.ts 路由、background 分支、types Message、wxt host_permissions、隐私声明。

## 9. 自动批准留痕

依据 prodflow-worker 无人值守默认决策策略，本设计自动批准推进：
- 方案选择 A：最小改动、可测试、可回滚，满足保守可回滚决策标准。
- 默认值 null→microsoft：PRD「显式默认值」明示，非隐式回退。
- 端点 URL：PRD 授权研发实现时确定并验证可达性。
- 隐私声明措辞同步：#14 明确要求，本任务范围内可执行。
