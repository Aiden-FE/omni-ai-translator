# CHANGELOG #10

> 关联迭代:v0.2 - 翻译源配置闭环 · 功能事项 1 unified-adapter（后端）
> PRD:[../1-unified-adapter/PRD.md](../1-unified-adapter/PRD.md) · PR:https://github.com/Aiden-FE/llm-translator/pull/12

## ✨ 新增功能

- 抽象统一翻译源适配层:定义统一翻译源接口,将现有 LLM 适配迁移为 provider 之一,新增传统翻译 provider 抽象,对上层暴露一致调用接口 (#10 · PR #12)

## 🔌 API 变更

- 新增统一翻译源适配层接口与 provider 注册/路由机制;建立四类错误模型(errorType)供上层差异化反馈;LLM 适配层由直接调用改为作为 provider 注册接入 (#10 · PR #12)
