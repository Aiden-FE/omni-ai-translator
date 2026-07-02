# PLAN — 免 Key 翻译源 google/microsoft provider 实现与生效源切换契约

| 项 | 内容 |
|---|---|
| ISSUE_ID | #14 |
| 所属 PRD | #2 |
| 迭代版本 | v0.2 |
| 执行模式 | 无人值守自动批准 |

## 任务清单

### 阶段 1：类型与内置源定义

- [x] 1.1 扩展 `shared/types.ts`：Message 联合类型新增 `get-active-sources` / `set-active-source`；新增 `ActiveSourcesResult` 接口（低复杂度，无依赖）
- [x] 1.2 新建 `shared/translator/builtin-sources.ts`：定义 `DEFAULT_ACTIVE_SOURCE_ID`、`BUILTIN_FREE_SOURCES` 常量、`getBuiltinSourceById(id)`、`isBuiltinSourceId`（低复杂度，无依赖）

### 阶段 2：Provider 实现

- [x] 2.1 重写 `shared/translator/traditional-provider.ts`：实现 `callGoogle`（fetch google 端点常量，解析非标准数组/JSONP 响应）、`callMicrosoft`（fetch microsoft 端点常量，解析响应）；`createTraditionalProvider` 按 config.type 路由；失败经 `classifyError` 归类；端点用内置常量不读 config.baseUrl（中复杂度，依赖 1.2）

### 阶段 3：适配层默认与切换契约

- [x] 3.1 修改 `shared/translator/index.ts`：`translateWithAdapter` 中 `activeId = settings.activeProviderId ?? DEFAULT_ACTIVE_SOURCE_ID`，先查 stored providers 未命中再查 builtin sources；新增 `getActiveSources()` / `setActiveSource(id)` 导出（中复杂度，依赖 1.1/1.2/2.1）

### 阶段 4：background 消息分支

- [x] 4.1 修改 `entrypoints/background.ts`：onMessage switch 新增 `get-active-sources`→`getActiveSources()`、`set-active-source`→`setActiveSource(payload.id)` 分支（低复杂度，依赖 3.1）

### 阶段 5：host_permissions

- [x] 5.1 修改 `wxt.config.ts`：manifest.host_permissions 新增 google/microsoft 域名（低复杂度，无依赖）

### 阶段 6：隐私声明更新

- [x] 6.1 修改 `knowledges/product-wiki/privacy/PRIVACY-POLICY.md`：将「兜底」措辞改为「用户可选的免费翻译源」；明示默认 microsoft 外传行为；更新变更记录（低复杂度，无依赖）

### 阶段 7：测试

- [x] 7.1 新建 `shared/translator/__tests__/builtin-sources.test.ts`：测试 `BUILTIN_FREE_SOURCES` 含 microsoft/google、`getBuiltinSourceById` 命中/未命中、`DEFAULT_ACTIVE_SOURCE_ID` 为 builtin:microsoft（低复杂度，依赖 1.2）
- [x] 7.2 更新 `shared/translator/__tests__/registry.test.ts`：将「传统 provider translate/test 返回 unreachable」改为 mock fetch 测试真实翻译路径（中复杂度，依赖 2.1）
- [x] 7.3 更新 `shared/translator/__tests__/adapter.test.ts`：更新「传统 provider 测试 → unreachable」为 mock fetch；新增 `translateWithAdapter` null→builtin:microsoft 默认路由测试、builtin 源命中测试、getActiveSources/setActiveSource 测试（中复杂度，依赖 3.1）

### 阶段 8：验证

- [x] 8.1 运行 `pnpm test`（vitest 单元测试）全部通过 — 5 文件 71 测试通过
- [x] 8.2 运行 `pnpm lint` 与 `pnpm typecheck`（vue-tsc）无错误
- [x] 8.3 运行 `pnpm build` 构建通过 — 产物 135.28 kB，manifest.json 含 google/microsoft host_permissions

## 依赖关系

- 1.1 → 4.1（Message 类型）
- 1.2 → 2.1, 3.1, 7.1
- 2.1 → 3.1, 7.2
- 3.1 → 4.1, 7.3
- 6.1, 5.1 无代码依赖
- 8.1-8.3 依赖全部代码任务完成

## 风险与缓解

- 端点可达性：实现时验证，若某端点不可达则错误归类为 unreachable，不阻塞实现（PRD 已授权人工切换应对）。
- 测试断言变更：registry/adapter 测试中 unreachable 断言需同步更新，避免误判。

## 执行偏差记录

- 无代码偏差。PLAN.md 全部任务已完成并通过审查（子 agent 逐项核对）。
- 端点选择：Google 用 `translate.googleapis.com/translate_a/single`（GET 嵌套数组响应）；Microsoft 用 `edge.microsoft.com/translate/auth` 取 token + `api.cognitive.microsofttranslator.com/translate`（POST），均符合 PRD「研发实现时确定并验证可达性」授权。
- 语言名→代码映射：上层 targetLang 为人类可读名（如「简体中文」），traditional-provider 内置 `LANG_NAME_TO_CODE` 映射为端点所需语言代码（zh-CN/en/ja 等），未知回退 en。
