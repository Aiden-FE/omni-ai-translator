# DESIGN — #19 传统 API Key 源 有 Key 场景前端联调与回归

| 项 | 内容 |
|---|---|
| 文档类型 | 技术设计文档 |
| 状态 | approved（无人值守自动批准，依据 Issue #19 + PRD #3 + #18 已交付契约） |
| 关联 Issue | #19 |
| 关联 PRD | #3 功能事项 3 |
| 上游依赖 | #18（已合并） |

## 1. 背景与目标

后端 #18 已在 `shared/types.ts` 新增可选 `ProviderConfig.region?: string`，并在 `shared/translator/traditional-provider.ts` 的 `callMicrosoftWithKey` 中消费该字段（trim 后非空携带 `Ocp-Apim-Subscription-Region`）。配置页 `entrypoints/options/App.vue` 当前无 region 输入框，用户无法在 UI 填写 region。本任务在配置页新增 region 输入框（仅 microsoft 有 Key 场景显示），并做有 Key 端到端联调与安全/LLM 回归。

## 2. 技术选型与理由

复用现有配置页 provider-card 表单结构，在 apiKey 行下方按条件渲染 region 输入框。region 存入 `ProviderConfig.region`（已有字段），经现有 `saveProviders` → `setProviders` → `chrome.storage.local` 链路持久化，经 `test-provider` / `translate` 消息通道传给后端。不新增类型、不新增存储逻辑、不新增消息通道。

理由：改动集中在 App.vue 模板 + e2e 测试，最小改动、可测试、可回滚。

## 3. 方案对比（无人值守自动批准记录）

### 方案 A（推荐，采用）：region 输入框在 microsoft && apiKey 非空时条件渲染，普通文本输入

- 实现：App.vue 在 apiKey 行后新增 `<input v-if="p.type === 'microsoft' && p.apiKey" v-model="p.region" ...>`，placeholder「Azure 区域，如 eastus」，`@change="saveProviders"`。
- e2e：扩展 mock-server.ts 增加 microsoft translate 路由 + 记录 headers，新增 microsoft 有 Key 划词 e2e。
- 优点：精确匹配 Issue「无 Key 或非 microsoft 源不显示」；region 为公开值无需掩码；e2e 覆盖官方端点落点与 header 携带。
- 缺点：mock server 需扩展（但兼容既有 LLM e2e）。
- 回滚：移除 region input + 还原 mock-server.ts + 删 e2e 用例。

### 方案 B：microsoft 类型始终显示 region 输入框（不看 apiKey）

- 实现：`v-if="p.type === 'microsoft'"`。
- 优点：条件更简单。
- 缺点：违背 Issue「无 Key 不显示」；无 Key 时 region 无意义（后端 callMicrosoft 无 Key 路径不读 region），易误导用户。
- 不采用原因：不符合 Issue 明确要求。

### 方案 C：region 输入框 type=password 掩码

- 实现：region 输入框设 `type="password"`。
- 优点：与 apiKey 一致视觉。
- 缺点：region 是公开 Azure 区域值（如 eastus、global），非凭证；掩码损害用户可校验性，违背可用性。
- 不采用原因：region 非敏感凭证，掩码弊大于利；安全要求（仅存本地+不入日志）不依赖掩码即可满足。

**最终选择：方案 A。**

## 4. 数据结构 / 模型变更

无。`ProviderConfig.region?: string` 已由 #18 新增，本任务仅消费，不改类型。

## 5. 接口设计

### 5.1 region 输入框（App.vue 模板）

在 provider-card 的 apiKey 行（含测试连通按钮）之后新增 region 行：

```vue
<div class="row" v-if="p.type === 'microsoft' && p.apiKey">
  <input
    v-model="p.region"
    placeholder="Azure 区域，如 eastus"
    @change="saveProviders"
  >
</div>
```

- 条件：`p.type === 'microsoft' && p.apiKey`（apiKey 非空字符串）。apiKey 留空/未填 → 不显示。
- 绑定：`v-model="p.region"`（ProviderConfig.region 可选，未定义时 v-model 初始为 undefined，输入后赋值）。
- 持久化：复用 `@change="saveProviders"`，与 baseUrl/apiKey 同链路存入 chrome.storage.local。
- 无需新增 data-testid（region 非既有 e2e 选择器依赖），但为 e2e 可选加 `data-testid="region"`。

### 5.2 e2e mock server 扩展（mock-server.ts）

新增 microsoft translate 路由 + headers 记录：

```ts
let lastRequestHeaders: Record<string, string> = {};
export function getLastRequestHeaders() { return lastRequestHeaders; }

// microsoft translate：POST /translate?api-version=3.0&to=...
if (req.method === 'POST' && req.url?.includes('/translate')) {
  lastRequestHeaders = req.headers as Record<string, string>;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify([{ translations: [{ text: '你好,世界', to: 'zh' }] }]));
  return;
}
```

- 兼容性：保留既有 /health 与 /v1/chat/completions 路由不变。
- headers 记录供 e2e 断言 `Ocp-Apim-Subscription-Key` 与 `Ocp-Apim-Subscription-Region`。

### 5.3 e2e 用例（translate.spec.ts）

新增「microsoft 有 Key 划词翻译落到官方端点」用例：
1. options 页添加 microsoft provider，baseUrl 填 mock server `/translate`，apiKey 填测试值，region 填 `eastus`，启用。
2. 测试页划词「Hello world」→ 触发 → 浮层显示「你好,世界」。
3. 断言 mock server 收到 microsoft 请求且 headers 含 `Ocp-Apim-Subscription-Key` 与 `Ocp-Apim-Subscription-Region: eastus`。

## 6. baseUrl / placeholder 校对结论

| 字段 | 当前值 | 后端语义 | 一致性 |
|---|---|---|---|
| google baseUrl 默认 | `https://translation.googleapis.com` | callGoogleWithKey 追加 `/language/translate/v2?key=` | ✅ 一致 |
| microsoft baseUrl 默认 | `https://api.cognitive.microsofttranslator.com/translate` | callMicrosoftWithKey 原样用 + `?api-version=3.0&to=` | ✅ 一致 |
| apiKey placeholder | `留空使用免 Key 兜底；填入则走官方 API` | apiKey 留空走兜底/填入走官方 | ✅ 一致 |
| region placeholder（新增） | `Azure 区域，如 eastus` | region 为 Azure 区域值 | ✅ 一致 |

结论：baseUrl 默认值与既有 placeholder 无需修改，仅新增 region placeholder。

## 7. 安全回归

- apiKey 输入框 `type="password"`（既有，✅）。
- region 输入框普通文本（region 非凭证，见方案对比 C）。
- Key/region 经 `setProviders` 存 `chrome.storage.local`（既有链路，仅本地）。
- 后端 #18 已确保 Key/region 不入日志/错误文案（本任务回归确认，不改后端）。
- e2e 测试用测试占位值，不写真实密钥。

## 8. 兼容性与风险评估

| 项 | 评估 |
|---|---|
| 向后兼容 | region 可选字段，既有配置无 region 正常读取；无 Key 路径不变 |
| 与 #16 既有 UI | 仅新增条件渲染行，不改既有字段/交互 |
| 与 v0.1 LLM | region 仅 microsoft 有 Key 显示，LLM 类型不受影响 |
| e2e 稳定性 | mock server 扩展兼容既有用例；microsoft 路由独立 |
| 回滚 | 移除 region input + 还原 mock-server + 删 e2e 用例 |

## 9. 测试设计

- 单测：既有 `traditional-provider.test.ts` 已覆盖 region header（#18），本任务不改后端，跑全量 `pnpm test` 回归。
- e2e：新增 microsoft 有 Key 划词用例（见 5.3）。
- typecheck + lint：`pnpm typecheck` + `pnpm lint` 零错误。
