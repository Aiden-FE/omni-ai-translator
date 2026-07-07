# CHANGELOG #18

> 关联迭代:v0.2 - 翻译源配置闭环 · 功能事项 3 traditional-apikey-config（后端）
> PRD:[../3-traditional-apikey-config/PRD.md](../3-traditional-apikey-config/PRD.md) · PR:https://github.com/Aiden-FE/llm-translator/pull/20

## ✨ 新增功能

- 传统翻译源支持填入自有 API Key/端点,启用后覆盖免 Key 免费源走官方 API;ProviderConfig 新增 region 字段 (#18 · PR #20)

## 🔌 API 变更

- ProviderConfig 新增 region 字段,有 Key 场景按官方端点路由(microsoft region 路由) (#18 · PR #20)
