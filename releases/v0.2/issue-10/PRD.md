# PRD — 统一翻译源适配层（unified-adapter）

| 项 | 内容 |
|---|---|
| 文档类型 | 需求文档（PRD） |
| 状态 | approved（无人值守自动批准） |
| ISSUE_ID | #10 |
| 版本号 | v0.2 |
| 基础分支 | master |
| 创建日期 | 2026-07-02 |
| 关联 PRD | `releases/v0.2/1-unified-adapter/PRD.md` |
| 关联 PRD Issue | #1 |

---

## 1. 需求概述

本任务实现 v0.2 迭代功能事项 1「统一翻译源适配层」。将现有只支持 LLM 的适配逻辑（`shared/llm.ts`）抽象升级为通用翻译源接口 `TranslationProvider`，使 LLM 类源（OpenAI 兼容 / Ollama）与传统翻译类源（Google / 微软）都作为可插拔 provider 接入，上层划词翻译只面向统一接口调用。

完整 PRD 详见 `releases/v0.2/1-unified-adapter/PRD.md`，本文件记录任务级澄清与补充。

## 2. 处理范围

### 2.1 包含

- 新增统一适配层（`shared/translator/`）：定义 `TranslationProvider` 接口（`id` / `type: 'llm'|'traditional'` / `translate(req): Promise<TranslateResult>` / `test(req?): Promise<TranslateResult>`）
- 建立 provider 注册表与路由：上层调用经适配层读取 `settings.activeProviderId`，从注册表取出对应 provider 调用其 `translate`；无可用源时返回 `no-config` 错误
- 统一错误模型：`TranslateResult` 新增 `errorType?: 'no-config'|'network'|'rate-limit'|'unreachable'`，保留 `error` 原始信息；四类错误互斥可判别
- 迁移 `shared/llm.ts`：`callOpenAICompatible` / `callOllama` 改为 LLM provider 实现，`translate(provider, req)` 入口改为适配层统一入口；迁移遵循行为不变（相同输入产出相同 TranslateResult）
- 扩展 `shared/types.ts`：`ProviderType` 扩展源类型分类字段，`ProviderConfig` 向后兼容（旧 LLM 配置可平滑读取）；新增传统 provider 类型占位（google/microsoft 具体实现由功能事项 2/3）
- 改造 `entrypoints/background.ts`：`translate` 分支经适配层统一入口调用，background 内无源类型 if-else 分支
- 引入 Vitest 单元测试框架，覆盖四类错误路径
- v0.1 划词翻译 e2e 回归全绿

### 2.2 不包含

- 免 Key 兜底源具体实现（功能事项 2）
- 传统 API Key 配置（功能事项 3）
- 配置页源选择 UI（功能事项 4）
- content 浮层错误文案细化（前端任务 #11）
- 多源自动降级（v0.3+）

## 3. 验收标准

| 验收项 | 验收条件 | 优先级 |
|---|---|---|
| 统一接口 | `TranslationProvider` 接口定义完成，LLM 与传统 provider 均可注册并被路由 | P0 |
| LLM 迁移 | openai-compatible / ollama 迁移到新接口，行为不变（相同输入产出相同 TranslateResult） | P0 |
| 路由 | 上层调用经适配层路由到当前生效源，background 无源类型 if-else 分支（代码审查） | P0 |
| 错误模型 | 四类错误（no-config / network / rate-limit / unreachable）均有可读提示与 errorType，单元测试覆盖四类错误路径 | P0 |
| 划词回归 | v0.1 划词翻译 e2e 全绿 | P0 |
| 传统 provider 占位 | google/microsoft 可注册但具体 translate 由功能事项 2/3 实现 | P0 |

## 4. 依赖契约（供下游 #11 消费）

本任务产出 `TranslationProvider` 接口与 `TranslateResult.errorType` 四类错误契约，供 #11 前端消费。

### TranslateResult.errorType 契约

```typescript
type ErrorType = 'no-config' | 'network' | 'rate-limit' | 'unreachable';

interface TranslateResult {
  translatedText: string;
  error?: string;       // 原始错误信息（可读提示）
  errorType?: ErrorType; // 错误类型标识，四类互斥
}
```

| errorType | 触发场景 | error 可读提示示例 |
|---|---|---|
| `no-config` | 未配置任何源，或当前源未启用 | 未配置可用翻译源，请在配置页选择或添加源 |
| `network` | fetch 抛异常、超时 | 翻译请求失败，请检查网络或源地址 |
| `rate-limit` | 源返回 429 或等价信号 | 翻译源繁忙（限流），请稍后再试或在配置页切换源 |
| `unreachable` | 源返回 4xx/5xx（非 429）、域名不可达 | 翻译源不可达，请在配置页切换到其它源 |

## 5. 技术约束

- MV3 Service Worker 会被回收，状态不依赖内存，配置走 `chrome.storage.local`
- content-script 不直接 fetch 第三方接口，翻译统一由 background 调用适配层
- TypeScript 严格模式，禁止 `any`（用 `unknown` + 类型守卫）
- 配置读写统一封装 `shared/storage.ts`
- 适配层只读 storage，不写

## 6. 无人值守自动决策

| 决策点 | 采用值 | 依据 |
|---|---|---|
| 适配层模块位置 | 新建 `shared/translator/` 目录 | PRD 建议该选项，职责清晰利于扩展 |
| 单元测试框架 | Vitest | 与 Vite/WXT 生态匹配，PRD KR4 要求单元测试 |
| ProviderType 扩展 | 保留具体 type，新增 ProviderCategory 分类字段 | 向后兼容旧配置 |
| background 迁移 | 保留消息签名，内部委托适配层统一入口 | 满足 KR3 background 无源类型分支 |
