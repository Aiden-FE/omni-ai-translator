---
id: adr:index
type: adr
status: active
owner: project
updated: 2026-07-30
confidence: 0.9
sources: []
related:
  - adr:001-unified-translator-adapter-layer
  - adr:002-llm-streaming-port-and-readablestream
  - adr:005-response-style-as-llm-protocol-discriminator
---

# ADR Knowledge

adr 知识索引：记录「为什么这样设计」。

## 决策清单

| ID | 文件 | 标题 | 状态 |
|----|------|------|------|
| `adr:001-unified-translator-adapter-layer` | [001-unified-translator-adapter-layer.md](001-unified-translator-adapter-layer.md) | 统一翻译源适配层设计 | accepted |
| `adr:002-llm-streaming-port-and-readablestream` | [002-llm-streaming-port-and-readablestream.md](002-llm-streaming-port-and-readablestream.md) | LLM 流式响应 Port 长连接 + ReadableStream | accepted |
| `adr:005-response-style-as-llm-protocol-discriminator` | [005-response-style-as-llm-protocol-discriminator.md](005-response-style-as-llm-protocol-discriminator.md) | responseStyle 作为 LLM 协议区分器 | accepted |

> 说明：初始化草稿仅沉淀与当前代码强相关的核心 ADR（001/002/005）。legacy `knowledges/adr/` 另含 003/004/006/007/008，待后续按需迁移。
