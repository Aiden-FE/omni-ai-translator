# 变更日志

记录当前任务完成后的实际代码变更。

## 任务信息

| 项 | 说明 |
|----|------|
| 版本号 | v0.2 |
| ISSUE_ID | #10 |
| 基础分支 | master |
| 完成日期 | 2026-07-02 |
| Merge Request | 待创建 |

---

## 主要变更

### 新增功能

- 新增统一翻译源适配层 `shared/translator/`，定义 `TranslationProvider` 接口（`id` / `type: 'llm'|'traditional'` / `translate(req)` / `test(req?)`），使 LLM 类源与传统翻译类源均可注册并被路由
- 新增 provider 注册表与路由（`registry.ts`）：根据 `ProviderConfig.type` 自动创建对应 provider 实例，支持 `category` 字段覆盖推断
- 新增统一入口 `translateWithAdapter(req)` / `testWithAdapter(config)`：上层调用经适配层读取 `settings.activeProviderId` 路由，无可用源时返回 `no-config` 错误
- 新增统一错误模型：`TranslateResult` 新增 `errorType?: 'no-config'|'network'|'rate-limit'|'unreachable'` 字段，四类错误互斥可判别，每类附可读提示
- 新增传统翻译源 provider 占位（google/microsoft）：可注册但具体 translate 由功能事项 2/3 实现
- 新增 Vitest 单元测试框架（4 个测试文件，40 个测试用例），覆盖四类错误路径

### 接口变更

- **新增** `TranslateResult.errorType?: ErrorType` 字段（可选，向后兼容）
- **新增** `ProviderConfig.category?: ProviderCategory` 字段（可选，缺省时按 type 推断）
- **扩展** `ProviderType` 新增 `'google' | 'microsoft'` 值
- **新增** `ProviderCategory = 'llm' | 'traditional'` 类型
- **新增** `ErrorType = 'no-config' | 'network' | 'rate-limit' | 'unreachable'` 类型

### 代码重构

- 迁移 `shared/llm.ts` 的 `callOpenAICompatible` / `callOllama` 到 `shared/translator/llm-provider.ts`，改为 LLM provider 工厂实现
- 改造 `shared/llm.ts` 为兼容层：保留 `translate(provider, req)` 和 `testProvider(provider)` 导出签名，内部委托适配层 `createProvider`
- 改造 `entrypoints/background.ts`：`translate` 分支改用 `translateWithAdapter`，`test-provider` 分支改用 `testWithAdapter`，消除源类型 if-else 分支
- 更新 `entrypoints/options/App.vue`：`DEFAULT_BASE_URL` 新增 google/microsoft 空字符串占位以匹配扩展后的 `ProviderType`

---

## 部署说明

无特殊操作。本次变更为纯代码重构与接口扩展，无需数据库迁移或配置变更。新字段均为可选，旧配置可平滑读取。

---

## 升级注意事项

- `TranslateResult.errorType` 为新增可选字段，下游 #11 前端可据此做四类错误差异化反馈，旧代码不读取此字段不受影响
- `ProviderConfig.category` 为新增可选字段，旧 LLM 配置无此字段时适配层按 `type` 自动推断（`openai-compatible`/`ollama` → `llm`）
- 回滚方案：删除 `shared/translator/` 目录，恢复 `shared/llm.ts` 和 `entrypoints/background.ts` 到 master 版本即可

---

## 依赖契约（供下游 #11 消费）

本任务产出 `TranslateResult.errorType` 四类错误契约，供 #11 前端 content 浮层差异化反馈消费：

| errorType | 触发场景 | error 可读提示 |
|---|---|---|
| `no-config` | 未配置任何源或当前源未启用 | 未配置可用翻译源，请在配置页选择或添加源 |
| `network` | fetch 抛异常、超时 | 翻译请求失败，请检查网络或源地址 |
| `rate-limit` | 源返回 429 | 翻译源繁忙（限流），请稍后再试或在配置页切换源 |
| `unreachable` | 源返回 4xx/5xx（非 429）、域名不可达 | 翻译源不可达，请在配置页切换到其它源 |
