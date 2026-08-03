---
id: feature:index
type: feature
status: active
owner: project
updated: 2026-08-03
confidence: 0.9
sources: []
related:
  - feature:translator:unified-adapter
  - feature:fullpage:command-channel
  - feature:fullpage:segmenter-pool
  - feature:fullpage:orchestrator
  - feature:fullpage:e2e-mock-contract
---

# Feature Knowledge

feature 知识索引：具体功能模块说明。

## 模块清单

| ID | 文件 | 说明 |
|----|------|------|
| `feature:translator:unified-adapter` | [translator-unified-adapter.md](translator-unified-adapter.md) | 翻译源适配层 — 统一接口、provider 注册路由、四类错误模型 |
| `feature:fullpage:command-channel` | [fullpage-command-channel.md](fullpage-command-channel.md) | 全文翻译入口与命令通道 — 菜单 id 契约、BackgroundCommand（background→content）、MV3 SW 约束 |
| `feature:fullpage:segmenter-pool` | [fullpage-segmenter-pool.md](fullpage-segmenter-pool.md) | 全文翻译分段收集器、并发翻译池与双模式渲染器 - SegmentRecord 契约、collectSegments/runPool/retrySegments、applyReplace/applyBilingual/switchMode/restoreAll、Shadow DOM 隔离与自足样式、data-llm-translator 排除约定 |
| `feature:fullpage:orchestrator` | [fullpage-orchestrator.md](fullpage-orchestrator.md) | 全文翻译编排器状态机与可复用模式 - 唯一状态持有者组合无状态组件、startInFlight 并发重入守卫、增量翻译防抖管线（isFlushing+data-llm-translator 过滤+recordedEls 去重）、isActive/onSettled 防闪回双保险、isBackgroundCommand 类型守卫 |
| `feature:fullpage:e2e-mock-contract` | [fullpage-e2e-mock-contract.md](fullpage-e2e-mock-contract.md) | 全文翻译 e2e mock server 契约 - 按路由请求计数 getRequestCount/resetRequestCount（含失败请求）、__FAIL__ 子串失败开关 setFailMode（部分失败隔离、快速失败）、非流式 300ms 延迟 NONSTREAM_DELAY_MS、workers=1 模块状态共享的 beforeEach/afterEach 复位约定 |
