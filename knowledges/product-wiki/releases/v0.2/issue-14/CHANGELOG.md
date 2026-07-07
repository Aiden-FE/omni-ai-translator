# CHANGELOG #14

> 关联迭代:v0.2 - 翻译源配置闭环 · 功能事项 2 builtin-fallback
> PRD:[../2-builtin-fallback/PRD.md](../2-builtin-fallback/PRD.md) · PR:https://github.com/Aiden-FE/llm-translator/pull/15

## ✨ 新增功能

- 内置 Google + 微软免 Key 公共端点 provider,作为用户可选的免费翻译源;全新安装默认选中 microsoft,用户可随时切换;无隐式自动回退,源失败仅返回错误提示 (#14 · PR #15)

## ⚠️ 破坏性变更

- 调整 v0.1「不内置任何模型接口」原则:内置传统翻译免 Key 公共端点作为可选免费源(非隐式兜底,源失败不自动切换) (#14 · PR #15)

## 🚀 部署说明

- 隐私声明同步更新:全新安装默认选中微软翻译,文本默认外传给微软;用户可在配置页切换到 Google 免费源或自有源(如本地 Ollama,文本仅本机流转) (#14 · PR #15)
