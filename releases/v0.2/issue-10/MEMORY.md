# 任务记忆文档

本文档用于存储当前开发任务的**关键信息**，包括 API 接口、业务规则、技术决策、踩坑记录等。

## 任务基础信息

| 项 | 说明 |
|----|------|
| 版本号 | v0.2 |
| ISSUE_ID | #10 |
| 基础分支 | master |
| 任务分支 | 10 |
| 标题 | 【AI】【后端】统一翻译源适配层 - 接口/注册路由/四类错误模型/LLM 迁移 |

---

## 目录

- [任务记忆文档](#任务记忆文档)
  - [任务基础信息](#任务基础信息)
  - [PRD 摘要](#prd-摘要)
  - [API 接口信息](#api-接口信息)
  - [业务规则与约束](#业务规则与约束)
  - [技术决策](#技术决策)
  - [踩坑记录](#踩坑记录)
  - [依赖关系](#依赖关系)
  - [自动决策记录](#自动决策记录)

---

## PRD 摘要

本次任务对应 v0.2 迭代功能事项 1（unified-adapter），PRD 文档路径：`releases/v0.2/1-unified-adapter/PRD.md`，关联 PRD Issue #1。

**核心目标**：把现有只支持 LLM 的适配逻辑（`shared/llm.ts`）抽象升级为通用翻译源接口 `TranslationProvider`，让 LLM 类源（OpenAI 兼容 / Ollama）与传统翻译类源（Google / 微软）都作为可插拔 provider 接入，上层划词翻译只面向统一接口调用。

**交付内容**：
- `TranslationProvider` 接口与 provider 注册表/路由实现
- 四类错误归一化逻辑 + 单元测试覆盖四类错误路径
- openai-compatible / ollama 迁移完成，行为不变
- background 经适配层统一入口调用，无源类型分支
- 传统 provider 抽象占位（google/microsoft 可注册但具体 translate 由功能事项 2/3）
- v0.1 划词翻译 e2e 回归全绿

**不包含**：免 Key 兜底源具体实现（功能事项 2）、传统 API Key 配置（功能事项 3）、配置页源选择 UI（功能事项 4）、content 浮层错误文案细化（前端任务 #11）、多源自动降级（v0.3+）。

---

## API 接口信息

### TranslationProvider 接口（本任务产出契约）

```typescript
interface TranslationProvider {
  id: string;
  type: 'llm' | 'traditional';
  translate(req: TranslateRequest): Promise<TranslateResult>;
  test(req?: TranslateRequest): Promise<TranslateResult>;
}
```

### TranslateResult 错误模型（本任务产出契约，下游 #11 消费）

```typescript
interface TranslateResult {
  translatedText: string;
  error?: string;
  errorType?: 'no-config' | 'network' | 'rate-limit' | 'unreachable';
}
```

四类错误互斥可判别：
- `no-config`：未配置任何源或当前源未启用
- `network`：fetch 抛异常、超时
- `rate-limit`：源返回 429 或等价信号
- `unreachable`：源返回 4xx/5xx、域名不可达

### 现有消息通道（保持兼容）

- `{ type: 'translate'; payload: TranslateRequest }` — background 经适配层统一入口
- `{ type: 'test-provider'; payload: ProviderConfig }` — 连通性测试
- `{ type: 'get-settings' }` / `{ type: 'get-providers' }`

---

## 业务规则与约束

1. **统一入口**：上层（background）调用翻译时，经适配层读取 `settings.activeProviderId`，从注册表取出对应 provider 调用 `translate`，background 内无源类型 if-else 分支。
2. **无可用源错误**：未配置任何源时返回 `no-config` 错误，不硬编码兜底逻辑（兜底源由功能事项 2 注入）。
3. **行为不变**：迁移 openai-compatible / ollama 时，相同输入产出相同 TranslateResult。
4. **不做自动降级**：失败只给提示，由用户在配置页人工切换。
5. **传统 provider 占位**：google/microsoft 可注册但具体 `translate` 抛「未实现」或返回 unreachable，由功能事项 2/3 实现。
6. **存储只读**：适配层只读 `chrome.storage.local`（`shared/storage.ts`），不写。
7. **编码规范**：TypeScript 严格模式，禁止 `any`（用 `unknown` + 类型守卫）；脚本间通信走类型化消息通道；配置读写统一封装 storage 模块。

---

## 技术决策

- **适配层模块位置**：新建 `shared/translator/` 目录，包含 `types.ts`（接口定义）、`registry.ts`（注册表与路由）、`llm-provider.ts`（LLM provider 实现）、`traditional-provider.ts`（传统 provider 占位）。理由：职责清晰，比扩展 `shared/llm.ts` 更利于后续扩源。
- **单元测试框架**：引入 Vitest 2.x（与 Vite/WXT 生态匹配），项目当前无单元测试框架。PRD KR4 要求单元测试覆盖四类错误路径。注意：Vitest 4.x 与项目 Vite 5.3.4 不兼容（`./module-runner` 未导出），必须使用 2.x。
- **ProviderType 扩展策略**：保留现有 `ProviderType = 'openai-compatible' | 'ollama'`，新增 `ProviderCategory = 'llm' | 'traditional'` 作为源类型分类字段；`ProviderConfig` 新增可选 `category` 字段，向后兼容旧配置（缺省时按 type 推断）。
- **迁移策略**：`shared/llm.ts` 的 `callOpenAICompatible`/`callOllama` 迁移为 LLM provider 工厂函数，保留 `translate(provider, req)` 和 `testProvider(provider)` 导出签名不变以兼容 background，但内部委托给适配层。

---

## 踩坑记录

### Vue reactive proxy 数组变异（已修复，迁移时注意）

Vue 3 reactive proxy 数组经 `chrome.storage.local` 结构化克隆后变异为对象。`setProviders` 写入前已用 `Array.from()` 转纯数组；`getProviders` 读取后用 `Array.isArray` 防御。适配层从 storage 读 providers 时需保持此防御。

### e2e 划词触发按钮丢失（已修复，回归时注意）

document `mouseup` 监听器在 Playwright 合成 click 时触发，因选区仍在而重建 trigger。已解决：mouseup handler 判断事件目标是否在已有 trigger/panel 内；trigger 对 mousedown/mouseup `stopPropagation`。

### Vitest 4.x 与 Vite 5 不兼容（开发中发现）

Vitest 4.x 要求 Vite 6+，项目使用 Vite 5.3.4（由 WXT 0.19 锁定）。安装 vitest@4 后运行报 `ERR_PACKAGE_PATH_NOT_EXPORTED: ./module-runner`。解决方案：降级到 `vitest@^2`。

### ProviderType 扩展后 Record 类型需覆盖所有键（开发中发现）

扩展 `ProviderType` 加入 `'google' | 'microsoft'` 后，`entrypoints/options/App.vue` 中 `DEFAULT_BASE_URL: Record<ProviderConfig['type'], string>` 报 TS2739 缺少 google/microsoft 键。解决方案：为传统源添加空字符串占位。

---

## 开发结果

- 单元测试：40 tests passed（4 test files: error / registry / llm-provider / adapter）
- typecheck：通过（vue-tsc --noEmit）
- e2e 回归：2 tests passed（v0.1 划词翻译链路全绿）
- 四类错误路径覆盖：no-config（adapter.test.ts）、network（llm-provider.test.ts）、rate-limit（llm-provider.test.ts）、unreachable（llm-provider.test.ts + registry.test.ts）

---

## 依赖关系

| 项 | 内容 |
|----|------|
| 并发安全等级 | parallel-safe |
| MR 基线策略 | base-branch（直接从 master 创建分支与 MR） |
| 上游依赖 | 无（本任务为上游地基） |
| 上游 Issue/MR | 无 |
| 下游 Issue | #11（前端）— 消费本任务产出的 `TranslateResult.errorType` 契约 |
| 推荐合并顺序 | 本任务 MR 应先于 #11 合并 |
| 依赖契约 | `TranslationProvider` 接口 + `TranslateResult.errorType` 四类错误契约，供 #11 前端消费 |

---

## 自动决策记录

### 1. 适配层模块位置：新建 `shared/translator/`

- **决策点**：PRD 建议 `shared/translator/` 或扩展 `shared/llm.ts`
- **采用值**：新建 `shared/translator/` 目录
- **依据**：职责清晰，注册表/路由/LLM provider/传统 provider 分文件管理，比在单个 `llm.ts` 内堆叠更利于后续功能事项 2/3/4 扩展
- **风险**：新增目录，需确保 tsconfig include 覆盖（已确认 `shared/**/*` 在 include 中）
- **回滚方式**：删除 `shared/translator/` 目录，恢复 `shared/llm.ts` 原样

### 2. 单元测试框架：引入 Vitest

- **决策点**：PRD KR4 要求单元测试覆盖四类错误路径，项目当前无单元测试框架
- **采用值**：Vitest
- **依据**：与 Vite/WXT 生态天然匹配，零配置集成，类型安全
- **风险**：新增 devDependency，需确认不与 WXT 构建冲突
- **回滚方式**：移除 vitest 依赖与配置，删除测试文件

### 3. ProviderType 扩展：新增 ProviderCategory 分类字段

- **决策点**：PRD 要求 `type: 'llm' | 'traditional'` 源类型分类，现有 `ProviderType` 是具体源类型
- **采用值**：保留 `ProviderType = 'openai-compatible' | 'ollama' | 'google' | 'microsoft'`，新增 `ProviderCategory = 'llm' | 'traditional'`；`ProviderConfig` 新增可选 `category` 字段，缺省时按 type 推断
- **依据**：向后兼容旧配置，不破坏现有 LLM 配置读写
- **风险**：`category` 缺省推断逻辑需覆盖所有 type 值
- **回滚方式**：移除 category 字段与推断逻辑

### 4. background 迁移：保留消息签名，内部委托适配层

- **决策点**：background 如何迁移到适配层统一入口
- **采用值**：background 的 `translate` case 不再直接 `providers.find` + `translate(provider, req)`，改为调用适配层统一入口 `translateWithAdapter(req)`，由适配层内部读 settings/providers 并路由；`test-provider` case 同理委托适配层
- **依据**：满足 KR3「background 无源类型分支」与 PRD「上层不感知具体源类型」
- **风险**：适配层需在内部处理 storage 读取，需保持 storage 防御逻辑
- **回滚方式**：恢复 background 直接调用 `shared/llm.ts` 的 translate
