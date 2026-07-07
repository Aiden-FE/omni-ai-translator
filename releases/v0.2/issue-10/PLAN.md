# 任务执行计划

本文档记录当前任务的实现拆分和执行进度，**执行过程中计划变更时必须同步更新**。

## 任务信息

| 项 | 说明 |
|----|------|
| 版本号 | v0.2 |
| ISSUE_ID | #10 |
| 基础分支 | master |

---

## 执行任务列表

按实现顺序列出需要完成的任务，使用 GitHub Flavored Markdown 任务列表格式，状态实时更新。

```checkbox
- 准备工作
  - [x] 引入 Vitest 单元测试框架（devDependency + vitest.config.ts + test 脚本）
- 类型扩展
  - [x] 扩展 shared/types.ts：新增 ProviderCategory / ErrorType，扩展 ProviderType，ProviderConfig 加 category?，TranslateResult 加 errorType?
- 适配层核心模块
  - [x] 新增 shared/translator/types.ts：TranslationProvider 接口定义
  - [x] 新增 shared/translator/error.ts：错误归一化（classifyError / errorTypeMessage）
  - [x] 新增 shared/translator/llm-provider.ts：LLM provider 工厂（迁移 callOpenAICompatible / callOllama，加错误归一化）
  - [x] 新增 shared/translator/traditional-provider.ts：传统 provider 占位（google/microsoft）
  - [x] 新增 shared/translator/registry.ts：provider 工厂注册表与路由
  - [x] 新增 shared/translator/index.ts：统一入口 translateWithAdapter / testWithAdapter
- 迁移与改造
  - [x] 改造 shared/llm.ts：保留导出签名，内部委托适配层
  - [x] 改造 entrypoints/background.ts：translate 分支用 translateWithAdapter，test-provider 用 testWithAdapter，无源类型分支
- 单元测试
  - [x] 编写 shared/translator/__tests__/error.test.ts：四类错误路径覆盖
  - [x] 编写 shared/translator/__tests__/registry.test.ts：provider 注册与路由测试
  - [x] 运行单元测试，全部通过（40 tests passed）
- 回归验证
  - [x] 运行 typecheck（vue-tsc --noEmit）通过
  - [x] 运行 e2e（wxt build && playwright test）全绿（2 tests passed）
```

---

## 任务分解（详细）

### 1. 引入 Vitest 单元测试框架

**描述：** 安装 vitest devDependency，创建 vitest.config.ts，在 package.json 添加 test 脚本。

**依赖：** 无

**验收标准：** `pnpm test -- --run` 可执行（即使无测试文件也不报配置错误）

---

### 2. 扩展 shared/types.ts

**描述：** 新增 `ProviderCategory`、`ErrorType` 类型；扩展 `ProviderType` 加入 `'google' | 'microsoft'`；`ProviderConfig` 新增可选 `category?` 字段；`TranslateResult` 新增可选 `errorType?` 字段。

**依赖：** 无

**验收标准：** typecheck 通过，现有代码不受影响（所有新字段可选）

---

### 3. 新增 shared/translator/types.ts

**描述：** 定义 `TranslationProvider` 接口（`id` / `type: 'llm'|'traditional'` / `translate(req)` / `test(req?)`）。

**依赖：** 任务 2

**验收标准：** 接口可被 LLM 和传统 provider 实现

---

### 4. 新增 shared/translator/error.ts

**描述：** 实现 `classifyError(err, status?)` 和 `errorTypeMessage(errorType)`。classifyError 规则：fetch TypeError → network；429 → rate-limit；4xx/5xx(非429) → unreachable。

**依赖：** 任务 2

**验收标准：** 四类错误均能正确分类

---

### 5. 新增 shared/translator/llm-provider.ts

**描述：** 迁移 `callOpenAICompatible` / `callOllama` 为 `createLLMProvider(config): TranslationProvider`。保持 fetch 请求体完全一致，错误处理加 errorType 归一化。

**依赖：** 任务 3、4

**验收标准：** 相同输入产出相同 TranslateResult（含 errorType），行为不变

---

### 6. 新增 shared/translator/traditional-provider.ts

**描述：** 实现 `createTraditionalProvider(config): TranslationProvider`，google/microsoft 占位。translate 返回 `{ translatedText: '', error: '该翻译源尚未实现', errorType: 'unreachable' }`；test 同理。

**依赖：** 任务 3

**验收标准：** 可创建实例，translate 返回 unreachable 错误

---

### 7. 新增 shared/translator/registry.ts

**描述：** 实现 `createProvider(config): TranslationProvider`，根据 config.type 路由到 llm-provider 或 traditional-provider 工厂。

**依赖：** 任务 5、6

**验收标准：** 四种 ProviderType 均可创建对应 provider

---

### 8. 新增 shared/translator/index.ts

**描述：** 实现统一入口 `translateWithAdapter(req)` 和 `testWithAdapter(config)`。translateWithAdapter 内部读 settings + providers，无可用源返回 no-config，有源则 createProvider + translate。testWithAdapter 直接 createProvider + test。

**依赖：** 任务 7

**验收标准：** 无源时返回 no-config；有源时路由到对应 provider

---

### 9. 改造 shared/llm.ts

**描述：** 保留 `translate(provider, req)` 和 `testProvider(provider)` 导出签名，内部委托 `createLLMProvider` + provider.translate/test。buildPrompt 保留。

**依赖：** 任务 5

**验收标准：** 导出签名不变，内部委托适配层，typecheck 通过

---

### 10. 改造 entrypoints/background.ts

**描述：** `translate` case 改用 `translateWithAdapter(message.payload)`，移除 providers.find + translate 调用；`test-provider` case 改用 `testWithAdapter(message.payload)`。background 内无源类型 if-else 分支。

**依赖：** 任务 8

**验收标准：** background 无源类型分支，typecheck 通过

---

### 11. 编写单元测试

**描述：** 编写 error.test.ts（四类错误路径：no-config / network / rate-limit / unreachable）和 registry.test.ts（provider 创建与路由）。

**依赖：** 任务 4、7、8

**验收标准：** 四类错误路径均有测试覆盖，全部通过

---

### 12. 回归验证

**描述：** 运行 typecheck（vue-tsc --noEmit）和 e2e（wxt build && playwright test），确保全绿。

**依赖：** 任务 10、11

**验收标准：** typecheck 通过，e2e 全绿

---

## 进度跟踪

| 状态 | 任务数 |
|------|--------|
| 未开始 | 0 |
| 进行中 | 0 |
| 已完成 | 15 |
| **总计** | **15** |

**完成进度：** `100%`

> 注：代码提交与 PR 创建由 Step6 处理，不在本执行计划 checkbox 内。

---

## 变更记录

| 变更日期 | 变更内容 | 变更原因 |
|----------|----------|----------|
| 2026-07-02 | 初始计划创建 | 任务启动 |
| 2026-07-02 | Vitest 降级为 2.x | Vitest 4.x 与项目 Vite 5.3.4 不兼容 |
| 2026-07-02 | 新增 llm-provider.test.ts 和 adapter.test.ts | 补充 LLM provider 错误路径和适配层 no-config 路径测试覆盖 |
| 2026-07-02 | App.vue DEFAULT_BASE_URL 加 google/microsoft 占位 | ProviderType 扩展后 Record 类型需覆盖所有键 |
| 2026-07-02 | 全部任务完成，单元测试 40 通过、typecheck 通过、e2e 2 通过 | 开发完成 |
