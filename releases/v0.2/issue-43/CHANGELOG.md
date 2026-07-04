# 变更日志

## 任务信息

| 项 | 说明 |
|----|------|
| 版本号 | v0.2 |
| ISSUE_ID | #43 |
| 基础分支 | master |
| 完成日期 | 2026-07-04 |

---

## 主要变更

### 🎁 新增功能

- `responseStyle` 新增 `'ollama'` 选项,LLM 源支持本地 Ollama 协议
- 响应风格单选(openai/anthropic/ollama)对所有 LLM 源展示(原仅 openai-compatible 展示)
- 切换响应风格时 baseUrl 自动联动替换(命中已知默认值时)+ 测试结果复位
- 连通性测试覆盖 ollama 响应风格

### 🐛 Bug 修复

- 无

### 🔧 接口变更

- **修改** `ProviderType`: `'openai-compatible' | 'ollama' | 'google' | 'microsoft'` → `'llm' | 'google' | 'microsoft'`
- **修改** `responseStyle`: `'openai' | 'anthropic'` → `'openai' | 'anthropic' | 'ollama'`,对所有 LLM 源生效(原仅 openai-compatible)
- **修改** `createLLMProvider` 路由:从 type 二级判断改为 responseStyle 三路分发(ollama→callOllama / anthropic→callAnthropic / openai→callOpenAICompatible)
- **修改** `inferCategory`:参数类型从 `ProviderType` 改为 `string`,新增 'llm' 识别,保留旧 type 兼容

### 📦 数据变更

- **存储迁移(on-read)**: `getProviders` 读出时自动迁移旧 type:
  - `type='ollama'` → `type='llm'` + `responseStyle='ollama'`
  - `type='openai-compatible'` → `type='llm'` + `responseStyle` 取原值(缺省 openai)
  - 不回写存储,用户无感

### ♻️ 代码重构

- `shared/ui/SourceConfigPanel.vue`: LLM optgroup 由两选项收敛为单一「LLM」option;`DEFAULT_BASE_URL` 适配新 type;新增 `DEFAULT_BASE_URL_BY_STYLE` 按响应风格索引;`isLlmType` 适配 `type==='llm'`;`addProvider` 默认 `type:'llm'` + `responseStyle:'openai'`;`onResponseStyleChange` 扩展支持 ollama + baseUrl 联动替换;`responseStyleHint` 扩展三种风格说明
- `shared/translator/registry.ts`: `LLM_TYPES` 改为 `Set<string>`,含 'llm' + 旧 type 兼容
- `shared/translator/llm-provider.ts`: `createLLMProvider` 路由从 `config.type` 改为 `config.responseStyle ?? 'openai'`

### 🎨 样式调整

- 响应风格 radio group 新增 ollama 选项(label + hint 文案)

---

## 部署说明

无特殊操作。存储迁移在读出时自动完成,无需手动迁移脚本。

---

## 升级注意事项

- 存量 `type='ollama'` / `type='openai-compatible'` 配置自动无感迁移,翻译行为不退化
- 回滚安全:on-read 迁移不修改存储数据,还原代码后旧代码仍可读取原始旧 type 配置
- 隐私无变更:LLM 文本外传行为同事项5/6
