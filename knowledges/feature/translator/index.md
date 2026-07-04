# translator 功能索引

> 翻译源适配层相关功能模块。

| 文件 | 说明 |
|------|------|
| unified-adapter.md | 统一翻译源适配层 — 接口、注册路由、四类错误模型、LLM 迁移、传统 provider 有 Key/无 Key 双模式 + region 契约 |
| streaming.md | LLM 翻译流式响应 — provider 流式契约、三源 SSE/NDJSON 解析、port 消息层、浮层渐进渲染 |
| popup-settings.md | popup 设置入口与翻译源配置共享组件 — variant prop、生效源横幅、源卡片增删改、optgroup 分组、options/popup 互通 |
| markdown-render.md | 翻译浮层译文 markdown 可读渲染 — 流式→done 渲染、轻量解析器 + DOMPurify sanitize、暗底 md 样式、prompt 保留结构 |
| llm-type-unify.md | LLM 类型分组统一为响应风格 — ProviderType 收敛为 llm、responseStyle 三值区分协议、createLLMProvider 三路分发、on-read 迁移、配置页 UI 归并 |
