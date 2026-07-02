# 统一翻译源适配层设计

v0.2 引入传统翻译源（Google/微软）作为免 Key 兜底，需要把 v0.1 只支持 LLM 的适配逻辑（`shared/llm.ts` 内 `provider.type === 'ollama'` 的 if-else 分支）抽象为通用接口。我们新建 `shared/translator/` 目录建立统一适配层，而非扩展 `shared/llm.ts`；provider 采用工厂函数（`createLLMProvider` / `createTraditionalProvider`）返回接口对象，而非类继承体系；错误归一化为四类互斥的 `errorType`（`no-config` / `network` / `rate-limit` / `unreachable`），供下游前端差异化反馈消费。

**状态**: accepted

**考虑过的选项**:

适配层模块位置：

| 方案 | 描述 | 结论 |
|------|------|------|
| A. 新建 `shared/translator/` 目录 | 适配层独立目录，types/registry/llm-provider/traditional-provider/error 分文件管理 | 采用 |
| B. 扩展 `shared/llm.ts` | 在现有文件内增加接口、注册表、路由 | 否决 — llm.ts 成为 god file，后续扩源难维护 |
| C. Provider 类继承体系 | 定义抽象基类，各 provider 继承实现多态 | 否决 — 浏览器扩展 MV3 Service Worker 场景无需类实例，工厂函数更轻量，避免 OOP 过度设计 |

Provider 实现模式：选工厂函数而非类继承。MV3 Service Worker 会被回收、不持有长生命周期对象，每次翻译按需 `createProvider(config)` 创建 provider 即可，无需实例状态持久化。类继承的抽象基类与多态派发在无状态调用场景下是过度设计。

错误模型设计为四类互斥，而非沿用原始 error 字符串或简单 success/fail 二分：

| errorType | 触发场景 | 归一化规则 |
|-----------|----------|------------|
| `no-config` | 未配置任何源或当前源未启用 | 适配层入口未匹配到 provider 时直接返回 |
| `network` | fetch 抛异常、超时 | `classifyError` 无 HTTP 状态码时 fallback |
| `rate-limit` | 源返回 429 | `classifyError` status === 429 |
| `unreachable` | 源返回 4xx/5xx（非 429）、域名不可达 | `classifyError` status >= 400 |

四类划分的理由：每类对应不同的用户侧操作（no-config → 去配置页添加源；network → 检查网络；rate-limit → 稍后重试或换源；unreachable → 换源），前端可据此做差异化反馈而非统一「翻译失败」。429 单列是因为限流是可重试的瞬时状态，语义上不同于 4xx/5xx 的「源不可达」。

**后果**:

- `shared/llm.ts` 降级为兼容层，保留 `translate(provider, req)` 和 `testProvider(provider)` 导出签名但内部委托适配层，避免直接引用方被破坏。新代码应直接使用 `shared/translator` 的 `translateWithAdapter` / `testWithAdapter`。
- `TranslateResult.errorType` 是供下游 #11 前端消费的契约，新增 errorType 值需要同步前端反馈逻辑与单元测试。
- `ProviderConfig.category` 为新增可选字段，旧配置缺省时按 `type` 推断（`openai-compatible`/`ollama` → `llm`，`google`/`microsoft` → `traditional`），向后兼容。
- 传统 provider（google/microsoft）当前为占位，translate 返回 `unreachable`，具体实现由功能事项 2/3 补充，不影响适配层路由框架。
- 回滚方式：删除 `shared/translator/` 目录，恢复 `shared/llm.ts` 和 `entrypoints/background.ts` 到 master 版本。
