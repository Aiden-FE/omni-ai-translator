# 需求文档

---

## 基础信息

| 项目 | 内容 |
|------|------|
| **ISSUE ID** | #43 |
| **标题** | LLM 适配层类型分组统一为响应风格 |
| **版本号** | v0.2 |
| **PRD Issue** | #42 |
| **源 PRD** | `releases/v0.2/9-llm-type-unify/PRD.md` |

---

## 需求内容

### 需求背景

LLM Translator v0.2 建立了统一翻译源适配层,LLM 类内部按 `type` 细分 openai-compatible 与 ollama 两个子类型,`responseStyle` 仅在 openai-compatible 下区分协议格式。事项7 已在 UI 层归并这两个子类型到同一 optgroup,但数据模型层仍分叉。本任务将归并深化到数据模型层:消除 type 子分组,由 `responseStyle` 统一承载协议格式区分。

### 需求目标

- `ProviderType` 收敛为 `'llm' | 'google' | 'microsoft'`
- `responseStyle` 扩展为 `'openai' | 'anthropic' | 'ollama'`,缺省 openai
- `createLLMProvider` 按 `responseStyle` 三路分发(含流式)
- 存量配置无感迁移(on-read backfill)
- 配置页 UI: LLM optgroup 单一 option + 响应风格对所有 LLM 源展示 + 新增 ollama
- 测试全覆盖 + e2e 回归

### 需求范围

- `shared/types.ts` — 类型定义
- `shared/translator/llm-provider.ts` — 路由分发
- `shared/translator/registry.ts` — inferCategory 适配
- `shared/storage.ts` — on-read 迁移
- `shared/ui/SourceConfigPanel.vue` — 配置页 UI
- `shared/llm.ts` — 兼容层适配
- `shared/translator/__tests__/` — 单元测试迁移
- `e2e/translate.spec.ts` — 划词回归

### 业务规则

- LLM 源配置四要素: type=llm + responseStyle + baseUrl + model + apiKey
- 存量 `type='ollama'` → llm + responseStyle='ollama'
- 存量 `type='openai-compatible'` → llm + responseStyle 取原值(anthropic 保留,缺省 openai)
- 切换响应风格: baseUrl 命中 KNOWN_DEFAULT_BASE_URLS 时自动替换;自定义端点保留
- 切换响应风格: 测试结果复位
- 切换为传统源: responseStyle 置 openai
- 传统翻译(google/microsoft)保持独立 type,不受影响

### 需求详情

**F1 类型层收敛**: ProviderType 收敛 + responseStyle 扩展(含 ollama)

**F2 createLLMProvider 路由**: 从 type+responseStyle 二级路由改为 responseStyle 三路分发(ollama→callOllama / anthropic→callAnthropic / openai→callOpenAICompatible);流式 translateStream 同步

**F3 registry/inferCategory**: 适配新 type(llm→llm);保留旧 type(openai-compatible/ollama→llm)兼容识别

**F4 存量配置无感迁移**: getProviders 读出时补全 type+responseStyle

**F5 配置页 UI**: LLM optgroup 单一 option;响应风格 radio(openai/anthropic/ollama)对所有 LLM 源展示;切换响应风格 baseUrl 联动 + 测试复位;isLlmType 适配 type===llm

**F6 错误模型与安全约束不变**: 复用四类 errorType,Key 仅存本地

### 交互说明

- 源类型下拉: LLM optgroup 由两选项收敛为单一「LLM」option
- 响应风格单选: 对所有 LLM 源展示(type==='llm'),三选一(openai/anthropic/ollama),默认 openai
- 切换响应风格: baseUrl 命中已知默认值则替换为对应风格默认端点;测试结果复位
- model 字段: 对所有 LLM 源展示,传统源不展示

---

## 非功能需求

### 性能要求
- 无新增性能开销(on-read 迁移为纯内存映射)

### 兼容性要求
- 存量配置 100% 无感迁移,翻译行为不退化
- 兼容层 shared/llm.ts 不破坏旧导出签名

### 安全性要求
- Key 仅存 chrome.storage.local,不写入日志/错误文案/commit
- 隐私无变更

### 边界场景与异常处理

| 场景 | 处理方式 |
|------|----------|
| 存量 type=ollama 配置 | on-read 迁移为 type=llm + responseStyle=ollama |
| 存量 type=openai-compatible + responseStyle=anthropic | on-read 迁移为 type=llm + responseStyle=anthropic |
| 存量 type=openai-compatible 无 responseStyle | on-read 迁移为 type=llm + responseStyle=openai(缺省) |
| 新建 LLM 源 | type=llm + responseStyle=openai(缺省) |
| 切换响应风格时 baseUrl 为自定义端点 | 保留不动,不替换 |

---

## 需求歧义处

| 编号 | 疑问点 | 影响范围 | 决策 |
|------|--------|----------|------|
| 1 | 迁移是否回写存储 | storage.ts | 不回写,on-read 补全,最小侵入 |
| 2 | registry 是否保留旧 type 识别 | registry.ts | 保留,防止非迁移路径路由失败 |

---

## 参考资料

- 源 PRD: `releases/v0.2/9-llm-type-unify/PRD.md`
- UX 原型: `knowledges/ux/prototypes/v0.2-llm-type-unify.html`
- ADR-001: 统一适配层工厂模式
- 事项7: popup-settings(任务 #35 / PR #38)
