# 技术设计文档

本文档记录当前任务的技术设计方案，经自动批准后作为实现依据。

## 任务信息

| 项 | 说明 |
|----|------|
| 版本号 | v0.2 |
| ISSUE_ID | #10 |
| 基础分支 | master |
| 设计状态 | approved（无人值守自动批准） |

---

## 一、需求背景

LLM Translator v0.1 的翻译源只有 LLM 一种类型，`shared/llm.ts` 通过 `provider.type === 'ollama'` 的 if-else 分支区分调用逻辑。v0.2 要引入传统翻译接口（Google/微软）作为免 Key 兜底，如果上层直接对接每种源会堆满 if-else、难以维护。因此需要建立统一翻译源适配层：定义一致接口，把不同源的差异封装在各自 provider 内部。

本任务定义 `TranslationProvider` 接口、provider 注册表与路由、四类错误模型，并将现有 LLM 适配迁移为 provider 之一。

---

## 二、技术选型

| 技术/依赖 | 版本 | 选型原因 |
|-----------|------|----------|
| TypeScript | 5.4 | 项目已有，严格模式 |
| WXT | 0.19 | 项目已有 MV3 框架 |
| Vitest | ^2.x | 新引入，与 Vite/WXT 生态匹配，PRD KR4 要求单元测试覆盖四类错误路径 |

---

## 三、整体设计

### 3.1 方案对比

| 方案 | 描述 | 优点 | 缺点 |
|---|---|---|---|
| A. 新建 `shared/translator/` 目录（推荐） | 适配层独立目录，含 types/registry/llm-provider/traditional-provider/error 模块 | 职责清晰，每个 provider 独立文件，利于功能事项 2/3/4 扩展 | 新增目录与文件 |
| B. 扩展 `shared/llm.ts` | 在现有 llm.ts 内增加接口、注册表、路由 | 文件少，改动集中 | llm.ts 成为 god file，后续扩源难维护 |
| C. Provider 类继承体系 | 定义抽象基类，各 provider 继承 | OOP 多态 | 浏览器扩展场景过度设计，MV3 SW 无需类实例 |

**最终选择：方案 A**。理由：PRD 明确建议 `shared/translator/`；职责清晰利于后续功能事项 2/3/4 在同框架下扩展；回滚简单（删除目录恢复 llm.ts）。

### 3.2 架构

```
entrypoints/background.ts
    │
    ▼
shared/translator/index.ts  (统一入口: translateWithAdapter / testWithAdapter)
    │
    ├── registry.ts  (provider 工厂注册表 + 路由)
    │       │
    │       ├── llm-provider.ts  (createLLMProvider: openai-compatible / ollama)
    │       └── traditional-provider.ts  (createTraditionalProvider: google / microsoft 占位)
    │
    ├── error.ts  (错误归一化: classifyError → errorType)
    │
    └── types.ts  (TranslationProvider 接口定义)

shared/llm.ts  (保留导出签名，内部委托适配层，向后兼容)
shared/types.ts  (扩展 ProviderType / ProviderCategory / TranslateResult.errorType)
```

### 3.3 数据流

```
content.ts → sendMessage({type:'translate', payload})
    → background.ts → translator.translateWithAdapter(req)
        → 读取 settings.activeProviderId + providers (via storage)
        → 无可用源 → TranslateResult{errorType:'no-config'}
        → 有源 → registry.getProvider(config) → provider.translate(req)
            → LLM provider: fetch → 成功返回译文 / 失败 classifyError → errorType
            → 传统 provider (占位): 返回 {errorType:'unreachable', error:'该源尚未实现'}
        → TranslateResult → background → content → 浮层展示
```

---

## 四、数据结构设计

### 4.1 shared/types.ts 扩展

```typescript
/** 源类型分类 */
export type ProviderCategory = 'llm' | 'traditional';

/** 具体源类型（扩展传统源占位） */
export type ProviderType = 'openai-compatible' | 'ollama' | 'google' | 'microsoft';

/** 错误类型 */
export type ErrorType = 'no-config' | 'network' | 'rate-limit' | 'unreachable';

export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  /** 源类型分类，缺省时按 type 推断（向后兼容旧配置） */
  category?: ProviderCategory;
  baseUrl: string;
  apiKey?: string;
  model: string;
}

export interface TranslateResult {
  translatedText: string;
  error?: string;
  /** 错误类型标识，四类互斥，供前端差异化反馈 */
  errorType?: ErrorType;
}
```

### 4.2 shared/translator/types.ts — TranslationProvider 接口

```typescript
import type { TranslateRequest, TranslateResult } from '@/shared/types';

export interface TranslationProvider {
  id: string;
  type: 'llm' | 'traditional';
  translate(req: TranslateRequest): Promise<TranslateResult>;
  test(req?: TranslateRequest): Promise<TranslateResult>;
}
```

---

## 五、接口设计

### 5.1 适配层统一入口（shared/translator/index.ts）

```typescript
/** 翻译：经适配层路由到当前生效源 */
export async function translateWithAdapter(req: TranslateRequest): Promise<TranslateResult>;

/** 连通性测试：对指定 provider 配置测试 */
export async function testWithAdapter(config: ProviderConfig): Promise<TranslateResult>;
```

### 5.2 Provider 工厂注册表（shared/translator/registry.ts）

```typescript
/** 根据 ProviderConfig 创建对应的 TranslationProvider 实例 */
export function createProvider(config: ProviderConfig): TranslationProvider;
```

内部维护 `ProviderType → factory` 映射表：
- `'openai-compatible' | 'ollama'` → `createLLMProvider`
- `'google' | 'microsoft'` → `createTraditionalProvider`

### 5.3 错误归一化（shared/translator/error.ts）

```typescript
/** 从 fetch 异常 / HTTP 状态码推断 errorType */
export function classifyError(err: unknown, status?: number): ErrorType;
/** 根据 errorType 返回可读提示 */
export function errorTypeMessage(errorType: ErrorType): string;
```

归一化规则：
- fetch 抛 TypeError（网络层面） → `network`
- status === 429 → `rate-limit`
- status >= 400 (非 429) → `unreachable`

---

## 六、主要变更点

| 模块 | 变更类型 | 说明 |
|------|----------|------|
| `shared/types.ts` | 修改 | 新增 ProviderCategory / ErrorType，扩展 ProviderType，ProviderConfig 加 category?，TranslateResult 加 errorType? |
| `shared/translator/types.ts` | 新增 | TranslationProvider 接口定义 |
| `shared/translator/error.ts` | 新增 | 错误归一化逻辑 |
| `shared/translator/llm-provider.ts` | 新增 | LLM provider 工厂（迁移自 llm.ts） |
| `shared/translator/traditional-provider.ts` | 新增 | 传统 provider 占位 |
| `shared/translator/registry.ts` | 新增 | provider 工厂注册表与路由 |
| `shared/translator/index.ts` | 新增 | 统一入口 translateWithAdapter / testWithAdapter |
| `shared/llm.ts` | 修改 | 保留 translate/testProvider 导出签名，内部委托适配层 |
| `entrypoints/background.ts` | 修改 | translate 分支改用 translateWithAdapter，test-provider 改用 testWithAdapter，无源类型分支 |
| `vitest.config.ts` | 新增 | Vitest 配置 |
| `shared/translator/__tests__/error.test.ts` | 新增 | 四类错误路径单元测试 |
| `shared/translator/__tests__/registry.test.ts` | 新增 | provider 注册与路由测试 |
| `package.json` | 修改 | 新增 vitest devDependency + test 脚本 |

---

## 七、兼容性考虑

1. **ProviderConfig 向后兼容**：新增 `category?` 可选字段，旧配置无此字段时按 `type` 推断（`openai-compatible`/`ollama` → `llm`，`google`/`microsoft` → `traditional`）。
2. **shared/llm.ts 导出签名不变**：`translate(provider, req)` 和 `testProvider(provider)` 签名保留，内部委托适配层，确保任何直接引用不破坏。
3. **background 消息通道不变**：`Message` 联合类型不变，content.ts / options/App.vue 无需改动。
4. **TranslateResult 扩展**：新增 `errorType?` 可选字段，旧代码不读取此字段不受影响。
5. **e2e 测试不变**：mock server 返回格式不变，LLM provider 迁移后相同输入产出相同 TranslateResult。

---

## 八、风险评估

| 风险 | 影响程度 | 概率 | 应对措施 |
|------|----------|------|----------|
| LLM provider 迁移后行为变化导致 e2e 失败 | 高 | 低 | 迁移保持 fetch 请求体/响应解析完全一致；e2e 回归验证 |
| Vitest 与 WXT 构建冲突 | 中 | 低 | Vitest 仅 devDependency，test 脚本独立于 build；tsconfig exclude 不影响 |
| 传统 provider 占位误被调用 | 低 | 低 | 占位 translate 返回 unreachable 错误，不抛异常 |
| storage Vue proxy 问题波及适配层 | 中 | 低 | 适配层读取 providers 时保持 Array.isArray 防御 |
