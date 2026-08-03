---
id: feature:index
type: feature
status: active
owner: project
updated: 2026-07-30
confidence: 0.9
sources: []
related:
  - feature:translator:unified-adapter
  - feature:fullpage:command-channel
  - feature:fullpage:segmenter-pool
---

# Feature Knowledge

feature 知识索引：具体功能模块说明。

## 模块清单

| ID | 文件 | 说明 |
|----|------|------|
| `feature:translator:unified-adapter` | [translator-unified-adapter.md](translator-unified-adapter.md) | 翻译源适配层 — 统一接口、provider 注册路由、四类错误模型 |
| `feature:fullpage:command-channel` | [fullpage-command-channel.md](fullpage-command-channel.md) | 全文翻译入口与命令通道 — 菜单 id 契约、BackgroundCommand（background→content）、MV3 SW 约束 |
| `feature:fullpage:segmenter-pool` | [fullpage-segmenter-pool.md](fullpage-segmenter-pool.md) | 全文翻译分段收集器与并发翻译池 - SegmentRecord 契约、collectSegments/runPool/retrySegments、缓存 key 格式、data-llm-translator 排除约定 |
