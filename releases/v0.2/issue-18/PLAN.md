# PLAN — #18 传统翻译源 有 Key 走官方 API 调用（后端）

| 项 | 内容 |
|---|---|
| 文档类型 | 执行计划 |
| 状态 | approved（无人值守自动批准） |
| 关联 Issue | #18 |
| 关联 DESIGN | ./DESIGN.md（方案 A） |

## 任务清单

- [x] T1: `shared/types.ts` — ProviderConfig 新增可选 `region?: string` 字段（含 JSDoc 注释：microsoft Azure 区域，有 Key 时携带 Ocp-Apim-Subscription-Region；google 不使用；缺省不发送 header）
  - 优先级 P0，复杂度低，无依赖
- [x] T2: `shared/translator/traditional-provider.ts` — 新增 `callGoogleWithKey(config, req)` 官方 v2 端点调用
  - 端点：baseUrl 去尾斜杠，未以 `/language/translate/v2` 结尾则追加；附 `?key=`
  - POST JSON `{q:[text], target, source?, format:'text'}`，解析 `data.translations[0].translatedText`
  - 失败经 classifyError 归类
  - 优先级 P0，复杂度中，依赖 T1
- [x] T3: `shared/translator/traditional-provider.ts` — 新增 `callMicrosoftWithKey(config, req)` 官方 Key 端点调用
  - 端点：baseUrl 直接用，附 `?api-version=3.0&to=`（有 source 加 from）
  - headers：`Ocp-Apim-Subscription-Key`、`Ocp-Apim-Subscription-Region`（region 非空才发）、`Content-Type`
  - 不走 edge auth；body `[{Text}]`，解析 `[0].translations[0].text`
  - 失败经 classifyError 归类
  - 优先级 P0，复杂度中，依赖 T1
- [x] T4: `shared/translator/traditional-provider.ts` — 在 `createTraditionalProvider.translate` 内按 `config.apiKey` 分支切换有/无 Key 调用
  - google: apiKey ? callGoogleWithKey : callGoogle
  - microsoft: apiKey ? callMicrosoftWithKey : callMicrosoft
  - 未知类型与 catch 不变；test() 不变（委托 translate）
  - 优先级 P0，复杂度低，依赖 T2/T3
- [x] T5: 新建 `shared/translator/__tests__/traditional-provider.test.ts` — 单测覆盖
  - google 无 Key（免 Key 端点解析）
  - google 有 Key（v2 端点 URL/header/body 校验）
  - microsoft 无 Key（auth + translate 两步）
  - microsoft 有 Key（含 region header 校验、不发 auth 请求）
  - microsoft 有 Key region 缺省（不发 Region header）
  - 错误归一化：429/500/TypeError（有 Key 与无 Key 路径）
  - 优先级 P0，复杂度中，依赖 T4
- [x] T6: 运行 `pnpm test` + `pnpm typecheck` 全绿，确认无回归
  - 优先级 P0，复杂度低，依赖 T5
- [x] T7: 审查计划完成度（子 agent 审查 PLAN 全部任务已实现、无遗漏）
  - 优先级 P0，复杂度低，依赖 T6

## 执行顺序

T1 → (T2 ‖ T3) → T4 → T5 → T6 → T7

## 偏差记录

- T4 实现初版漏写 `await`（`return config.apiKey ? callXxx : callXxx`），导致 rejected promise 不被 try/catch 捕获，registry.test.ts 与新测试的 network 错误用例失败。已修复为 `await callXxx` 形式，83 项测试全绿。
- 其余任务按计划执行，无偏差。
