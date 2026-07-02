# PLAN — #19 传统 API Key 源 有 Key 场景前端联调与回归

| 项 | 内容 |
|---|---|
| 关联 Issue | #19 |
| 关联 PRD | #3 功能事项 3 |
| 迭代版本 | v0.2 |

## 任务清单

### T1: 配置页新增 region 输入框
- [x] 在 `entrypoints/options/App.vue` provider-card 的 apiKey 行后新增 region 行，条件 `v-if="p.type === 'microsoft' && p.apiKey"`，`v-model="p.region"`，placeholder「Azure 区域，如 eastus」，`@change="saveProviders"`，加 `data-testid="region"` 便于 e2e。
- 优先级：P0 | 复杂度：低 | 依赖：无

### T2: 扩展 e2e mock server 支持 microsoft translate 路由
- [x] 在 `e2e/mock-server.ts` 新增 `POST /translate` 路由，返回 microsoft 响应格式 `[{ translations: [{ text: '你好,世界', to: 'zh' }] }]`；新增 `lastRequestHeaders` 记录与 `getLastRequestHeaders()` 导出；保留既有 /health 与 /v1/chat/completions 路由不变。
- 优先级：P0 | 复杂度：低 | 依赖：无

### T3: 新增 microsoft 有 Key 划词 e2e 用例
- [x] 在 `e2e/translate.spec.ts` 新增用例：options 页添加 microsoft provider，baseUrl 填 mock `/translate`，apiKey 填测试值，region 填 `eastus`，启用；测试页划词「Hello world」→ 浮层显示「你好,世界」；断言 mock 收到请求且 headers 含 `Ocp-Apim-Subscription-Key` 与 `Ocp-Apim-Subscription-Region: eastus`。
- 优先级：P0 | 复杂度：中 | 依赖：T1、T2

### T4: baseUrl/placeholder 一致性校对（确认无需改）
- [x] 校对 google/microsoft baseUrl 默认值与后端 callGoogleWithKey/callMicrosoftWithKey 端点构造语义一致（已在 DESIGN 第 6 节确认），记录结论，不修改代码。
- 优先级：P0 | 复杂度：低 | 依赖：无

### T5: Key/region 安全回归确认
- [x] 确认 apiKey `type="password"`；region 普通文本（非凭证）；Key/region 经 chrome.storage.local 仅本地存储；后端不日志 region（#18 已实现）；e2e 用占位值无真实密钥。
- 优先级：P0 | 复杂度：低 | 依赖：T1

### T6: v0.1 LLM 配置流程回归
- [x] 运行 `pnpm test`（全量单测含 traditional-provider/llm-provider/adapter/registry/error/builtin-sources）、`pnpm typecheck`、`pnpm lint`，确认零错误零告警。
- 优先级：P0 | 复杂度：低 | 依赖：T1

### T7: e2e 全量回归
- [x] 运行 `pnpm e2e`（wxt build + playwright），确认既有 LLM e2e + 新增 microsoft e2e 全绿。
- 优先级：P0 | 复杂度：中 | 依赖：T1、T2、T3

## 执行顺序

T1 → T2 → T3 → T4 → T5 → T6 → T7（T1/T2 可并行，T3 依赖两者）
