# 任务执行计划

## 任务信息

| 项 | 说明 |
|----|------|
| 版本号 | v0.2 |
| ISSUE_ID | #43 |
| 基础分支 | master |

---

## 执行任务列表

- [x] P0 | types.ts — ProviderType 收敛为 'llm'|'google'|'microsoft',responseStyle 扩展为 'openai'|'anthropic'|'ollama'
- [x] P0 | llm-provider.ts — createLLMProvider 路由改 responseStyle 三路分发(translate + translateStream)
- [x] P0 | registry.ts — LLM_TYPES 加 'llm',inferCategory 兼容旧 type
- [x] P0 | storage.ts — getProviders on-read 迁移(ollama→llm+ollama,openai-compatible→llm+原 responseStyle)
- [x] P1 | SourceConfigPanel.vue — LLM optgroup 单一 option + 响应风格三选一对所有 LLM 源展示 + baseUrl 联动 + isLlmType 适配
- [x] P1 | llm.ts — 确认兼容层无需改动(签名不变)
- [x] P1 | registry.test.ts — 适配新 type + 保留旧 type 兼容用例
- [x] P1 | llm-provider.test.ts — 适配 responseStyle 路由 + ollama 风格用例
- [x] P1 | adapter.test.ts — 适配新 type
- [x] P2 | e2e/translate.spec.ts — 新增 ollama 风格连通性测试
- [x] P0 | 门禁: pnpm typecheck + pnpm lint + pnpm test 全绿
- [x] P2 | 门禁: pnpm e2e(若环境可用)
- [x] P0 | 提交代码 + 测试
- [x] P0 | 提交迭代文档(PRD/DESIGN/PLAN/MEMORY)
- [x] P0 | 更新 PLAN.md 全部勾选 + MEMORY.md 新发现

---

## 任务分解

### 1. types.ts 类型收敛
**描述**: ProviderType 收敛 + responseStyle 扩展 + 注释更新
**依赖**: 无
**验收标准**: TypeScript 编译通过,responseStyle 含 ollama

### 2. llm-provider.ts 路由三路分发
**描述**: createLLMProvider 从 type 二级路由改为 responseStyle 三路分发,translateStream 同步
**依赖**: #1
**验收标准**: responseStyle='ollama' → callOllama;'anthropic' → callAnthropic;'openai'/缺省 → callOpenAICompatible

### 3. registry.ts inferCategory 适配
**描述**: LLM_TYPES 加 'llm',保留旧 type 兼容识别
**依赖**: #1
**验收标准**: inferCategory('llm')='llm';inferCategory('openai-compatible')='llm'(兼容);inferCategory('ollama')='llm'(兼容)

### 4. storage.ts on-read 迁移
**描述**: getProviders 读出时迁移旧 type 到新 type + responseStyle
**依赖**: #1
**验收标准**: type='ollama'→llm+responseStyle='ollama';type='openai-compatible'→llm+responseStyle 取原值;type='llm' 不变

### 5. SourceConfigPanel.vue UI 收敛
**描述**: LLM optgroup 单一 option + 响应风格三选一 + baseUrl 联动 + isLlmType 适配 + addProvider 默认 type=llm
**依赖**: #1
**验收标准**: LLM optgroup 仅一个 option;响应风格对所有 LLM 源展示含 ollama;切换响应风格 baseUrl 联动 + 测试复位

### 6. 测试迁移与新增
**描述**: registry/llm-provider/adapter 测试适配新 type + ollama 风格用例;e2e 新增 ollama 连通性测试
**依赖**: #1-#5
**验收标准**: 全部测试通过

### 7. 门禁与提交
**描述**: typecheck/lint/test/e2e 全绿后提交代码 + 文档
**依赖**: #1-#6
**验收标准**: 所有门禁通过,commit 格式正确

---

## 进度跟踪

| 状态 | 任务数 |
|------|--------|
| 未开始 | 0 |
| 进行中 | 0 |
| 已完成 | 14 |
| **总计** | **14** |

**完成进度:** 100%

---

## 变更记录

| 变更日期 | 变更内容 | 变更原因 |
|----------|----------|----------|
| 2026-07-04 | 初始计划创建 | 任务启动 |
