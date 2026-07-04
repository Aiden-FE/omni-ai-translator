# 技术设计文档

## 任务信息

| 项 | 说明 |
|----|------|
| 版本号 | v0.2 |
| ISSUE_ID | #43 |
| 基础分支 | master |
| 设计状态 | 已批准(无人值守自动批准) |

---

## 一、需求背景

LLM 翻译源的 `ProviderType` 内部按 `openai-compatible`/`ollama` 子分组,`responseStyle` 仅在 openai-compatible 下区分协议。子分组在用户侧无实际意义(字段完全一致),却增加配置复杂度与代码路由分支。本任务消除 type 子分组,由 `responseStyle` 统一承载协议格式区分,收敛 LLM 源配置为四要素。

---

## 二、技术选型

| 技术/依赖 | 版本 | 选型原因 |
|-----------|------|----------|
| TypeScript | 5.4.x | 项目已有技术栈 |
| Vue 3 | 3.x | SourceConfigPanel.vue 已有 |
| Vitest | 2.0.x | 项目已有测试框架 |
| Playwright | 1.61.x | e2e 测试已有 |

### 方案对比

| 方案 | 描述 | 优点 | 缺点 | 推荐 |
|------|------|------|------|------|
| A. on-read 迁移 | getProviders 读出时补全 type+responseStyle,不回写 | 最小侵入、可回滚、用户无感 | 每次读取需映射(开销极小) | ✅ |
| B. write-back 迁移 | 首次读取后回写新形态到 storage | 后续读取无映射 | 需额外写操作、并发风险、不可回滚 | ❌ |
| C. 一次性迁移脚本 | 启动时检测旧 type 并批量迁移 | 一次性完成 | 需独立迁移逻辑、启动时阻塞 | ❌ |

**推荐方案 A**:on-read 迁移。最小侵入,可回滚,用户无感。回滚时只需还原代码,存储数据未被修改。

**回滚方案**:还原代码即可。on-read 迁移不修改存储数据,旧代码读取新形态配置时,type='llm' 会被 inferCategory 识别为...需注意:旧代码的 inferCategory 不识别 'llm' type,会 fallback 到 traditional。因此回滚需同时还原存储(但 on-read 不修改存储,所以回滚后旧代码读取的还是旧 type)。**关键**:on-read 迁移返回新对象,不修改原始存储数据,所以回滚安全。

---

## 三、整体设计

```
ProviderConfig (存储层)
  ↓ getProviders() on-read backfill
  ↓ type='llm' + responseStyle
  ↓
createProvider (registry.ts)
  ↓ inferCategory(type) → 'llm'
  ↓
createLLMProvider (llm-provider.ts)
  ↓ responseStyle 三路分发
  ├─ 'ollama' → callOllama / callOllamaStream
  ├─ 'anthropic' → callAnthropic / callAnthropicStream
  └─ 'openai'(缺省) → callOpenAICompatible / callOpenAICompatibleStream
```

---

## 四、UX 与视觉实现

### 设计系统与设计 token

- 引用来源: `knowledges/ux/design-system.md` + `knowledges/ux/prototypes/v0.2-llm-type-unify.html`
- 色彩: #1F2937(主操作/启用态)、#DC2626(错误)、#16A34A(成功)、#6B7280(hint)、#E5E7EB(边框)
- 字体: system-ui, -apple-system, "Segoe UI", sans-serif; 14px 基准
- 间距: 4px 基准(--sp-1: 4px, --sp-2: 8px, --sp-3: 12px, --sp-4: 16px)
- 圆角: 卡片 8px(--r-card)、输入 4px(--r-input)
- 无新增 token,严格沿用既有设计系统

### 视觉还原要点

- 源类型下拉 LLM optgroup 由两选项(openai-compatible/ollama)收敛为单一「LLM」option
- 响应风格 radio group:对所有 LLM 源展示(type==='llm'),三选一(openai/anthropic/ollama),默认 openai
- 响应风格 radio 布局:水平排列,每个选项含 radio + 文字标签;复用既有 `.response-style-option` 样式
- 响应风格说明文案:每种风格配一句适用端点说明,复用 `responseStyleHint` 模式扩展
- model 输入框:对所有 LLM 源展示,与 baseUrl 同行
- 传统翻译(google/microsoft)optgroup 不变

### 交互实现

- **默认态**: 新建 LLM 源 type=llm + responseStyle=openai + baseUrl=OpenAI 默认端点 + model=gpt-4o-mini
- **响应风格切换**: radio change → onResponseStyleChange → baseUrl 命中 KNOWN_DEFAULT_BASE_URLS 则替换为对应风格默认端点 → 测试结果复位 → saveProviders
- **源类型切换**: select change → onTypeChange → baseUrl 命中已知默认则替换 → 非_llm 时 responseStyle 置 openai → 测试结果复位 → saveProviders
- **连通性测试**: 点击「测试连通」→ testProvider → inline 结果(✅ 译文 / ❌ 错误)
- **动效**: 沿用既有过渡(border-color 160ms / background 120ms);`@media (prefers-reduced-motion: reduce)` 关闭过渡

### 响应式与可访问性

- popup 变体: 400×600 固定尺寸,卡片可折叠
- options 变体: max-width 720px
- 无新增断点差异;LLM 卡片高度因选项收敛略降,不影响布局
- 响应风格 radio 键盘可达: Tab 聚焦 + 方向键切换(原生 radio 行为)
- 可见聚焦环: `outline: 2px solid #1f2937`(沿用既有)
- optgroup「LLM 接口配置」语义分组保留,供读屏识别类目
- 错误/成功色非唯一区分(同时有 ❌/✅ 文字)
- `@media (prefers-reduced-motion: reduce)` 关闭过渡(沿用既有)

### 原型参照

- 视觉原型路径: `knowledges/ux/prototypes/v0.2-llm-type-unify.html`

---

## 五、数据结构设计

### ProviderType 变更

| 字段 | 旧类型 | 新类型 |
|------|--------|--------|
| ProviderType | `'openai-compatible' \| 'ollama' \| 'google' \| 'microsoft'` | `'llm' \| 'google' \| 'microsoft'` |
| responseStyle | `'openai' \| 'anthropic'` | `'openai' \| 'anthropic' \| 'ollama'` |

### ProviderConfig 接口

```typescript
interface ProviderConfig {
  id: string;
  name: string;
  type: 'llm' | 'google' | 'microsoft';  // 收敛
  category?: 'llm' | 'traditional';
  baseUrl: string;
  apiKey?: string;
  model: string;
  region?: string;
  responseStyle?: 'openai' | 'anthropic' | 'ollama';  // 扩展,对所有 LLM 源生效
}
```

### 存储迁移映射(on-read)

| 旧 type | 旧 responseStyle | 新 type | 新 responseStyle |
|---------|------------------|---------|------------------|
| ollama | (任意) | llm | ollama |
| openai-compatible | anthropic | llm | anthropic |
| openai-compatible | openai/缺省 | llm | openai |
| llm | (任意) | llm | (不变) |

---

## 六、接口设计

### createLLMProvider 路由变更

```
// 旧路由(二级判断)
if (config.type === 'ollama') → callOllama
if (config.responseStyle === 'anthropic') → callAnthropic
else → callOpenAICompatible

// 新路由(responseStyle 三路分发)
const style = config.responseStyle ?? 'openai';
if (style === 'ollama') → callOllama
if (style === 'anthropic') → callAnthropic
else → callOpenAICompatible
```

### inferCategory 变更

```
// 新增 'llm' 识别,保留旧 type 兼容
LLM_TYPES = new Set(['llm', 'openai-compatible', 'ollama'])
'llm' → 'llm'
'openai-compatible' → 'llm'  (兼容)
'ollama' → 'llm'  (兼容)
'google'/'microsoft' → 'traditional'
```

---

## 七、主要变更点

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `shared/types.ts` | 修改 | ProviderType 收敛 + responseStyle 扩展 |
| `shared/translator/llm-provider.ts` | 修改 | createLLMProvider 路由改 responseStyle 三路分发 |
| `shared/translator/registry.ts` | 修改 | LLM_TYPES 加 'llm' + inferCategory 兼容旧 type |
| `shared/storage.ts` | 修改 | getProviders on-read 迁移 |
| `shared/ui/SourceConfigPanel.vue` | 修改 | UI 收敛 + 响应风格三选一 + baseUrl 联动 |
| `shared/llm.ts` | 无需改 | 兼容层委托 createProvider,签名不变 |
| `shared/translator/__tests__/registry.test.ts` | 修改 | 适配新 type + 保留旧 type 兼容用例 |
| `shared/translator/__tests__/llm-provider.test.ts` | 修改 | 适配 responseStyle 路由 + ollama 风格用例 |
| `shared/translator/__tests__/adapter.test.ts` | 修改 | 适配新 type |
| `e2e/translate.spec.ts` | 修改 | 新增 ollama 风格连通性测试 |

---

## 八、兼容性考虑

- **存储兼容**: on-read 迁移不修改原始存储数据,旧代码回滚后仍可读取旧 type
- **registry 兼容**: inferCategory 同时识别新旧 type,防止非迁移路径(如直接传 config)路由失败
- **兼容层 llm.ts**: 委托 createProvider,签名不变,无需改动
- **测试兼容**: 保留旧 type 测试用例(openai-compatible/ollama),确保兼容路径覆盖
- **无破坏性变更**: 传统翻译(google/microsoft)完全不受影响

---

## 九、风险评估

| 风险 | 影响程度 | 概率 | 应对措施 |
|------|----------|------|----------|
| 适配层路由重构波及划词翻译 | 高 | 低 | e2e 回归 + 单测覆盖三种 responseStyle |
| 存量迁移边界(旧 type 缺省/category 缺省) | 中 | 低 | inferCategory 保留旧 type 识别 + on-read 补全 + 单测覆盖 |
| baseUrl 自动替换误覆盖自定义端点 | 中 | 低 | 仅命中 KNOWN_DEFAULT_BASE_URLS 时替换 |
| e2e 环境不可用(浏览器/headless) | 低 | 中 | 如环境失败如实记录,不阻塞;代码层单测全绿保证逻辑正确 |
