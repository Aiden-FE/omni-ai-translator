# 编码规范 — LLM Translator

> 编码标准与约定。

## 通用

- TypeScript 严格模式，禁止 `any`（确需时用 `unknown` + 类型守卫）。
- 命名：变量/函数 camelCase，类型/接口 PascalCase，常量 UPPER_SNAKE_CASE。
- 注释密度匹配上下文；公共 API 与复杂逻辑必须注释「为什么」。

## 扩展特定

- 脚本间通信统一走类型化消息通道：定义 `Message` 联合类型，`chrome.runtime.sendMessage` / `onMessage` 均按类型校验。
- 配置读写统一封装 `storage` 模块，不直接散用 `chrome.storage` API。
- LLM 调用统一走适配层，不在 content-script 直接 `fetch` 第三方接口（受 CORS 与 SW 生命周期约束，应由 background 发起）。
- API Key 严禁出现在日志、commit、错误上报中。

## 提交

- 遵循 Prodflow commit 规范（见 `prodflow-commit` 技能）。
- 不提交真实密钥、令牌、隐私数据。
