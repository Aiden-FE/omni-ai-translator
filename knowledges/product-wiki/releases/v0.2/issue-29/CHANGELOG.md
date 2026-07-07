# CHANGELOG #29

> 关联迭代:v0.2 - 翻译源配置闭环 · 独立快修
> PR:https://github.com/Aiden-FE/llm-translator/pull/32

## 🐛 Bug 修复

- manifest host_permissions 增补 https://*/* 覆盖云端 LLM 端点,修复自定义云端 LLM 端点请求被拦截问题 (#29 · PR #32)

## 🚀 部署说明

- 浏览器扩展权限变更:新增 host_permissions `https://*/*`,用户安装/升级时可能见到权限确认提示 (#29 · PR #32)
