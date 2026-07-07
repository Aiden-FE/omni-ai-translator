# CHANGELOG #25

> 关联迭代:v0.2 - 翻译源配置闭环 · 功能事项 6 llm-streaming
> PRD:[../6-llm-streaming/PRD.md](../6-llm-streaming/PRD.md) · PR:https://github.com/Aiden-FE/llm-translator/pull/26

## ✨ 新增功能

- LLM 翻译采用流式响应,译文逐步呈现,避免用户干等;仅 LLM 源(openai-compatible/anthropic/ollama)流式,传统源(google/microsoft)保持非流式 (#25 · PR #26)

## 🔌 API 变更

- provider 契约扩展流式能力;background↔content 消息层(port)支持流式传输;浮层渐进渲染译文 (#25 · PR #26)
