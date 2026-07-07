# CHANGELOG #43

> 关联迭代:v0.2 - 翻译源配置闭环 · 功能事项 9 llm-type-unify
> PRD:[../9-llm-type-unify/PRD.md](../9-llm-type-unify/PRD.md) · PR:https://github.com/Aiden-FE/llm-translator/pull/44

## ✨ 新增功能

- 取消 LLM 类 type 子分组(openai-compatible/ollama),responseStyle 扩展为 openai/anthropic/ollama 统一区分协议格式;LLM 配置收敛为 baseUrl+model+apiKey+responseStyle;深化事项 7 UI 归并到数据模型层 (#43 · PR #44)

## ⚠️ 破坏性变更

- LLM 配置数据模型变更:type 子分组收敛为 responseStyle 字段;存量配置无感迁移(on-read storage migration),用户无需手动操作 (#43 · PR #44)

## 🔌 API 变更

- responseStyle 作为 LLM 协议区分器,路由三路分发(openai/anthropic/ollama) (#43 · PR #44)
