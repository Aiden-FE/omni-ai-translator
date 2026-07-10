# MEMORY - Issue #64 上架合规准备 - 合规材料落档与未用权限清理

> 任务: #64 | 版本: v0.3 | PRD Issue: #52 | 分支: issue-64

## PRD 摘要

本任务为 Chrome Web Store 上架准备合规材料，基于 PRIVACY-POLICY.md 如实填报隐私实践表、为 manifest 权限撰写用途说明、完成数据用途披露，并移除未使用的 contextMenus 权限。

- PRD 文档: `releases/v0.3/4-listing-compliance/PRD.md`
- 隐私政策: `knowledges/product-wiki/privacy/PRIVACY-POLICY.md`
- 验收标准: 合规材料完整覆盖(隐私实践/权限说明/数据披露/一致性核对);contextMenus 从 wxt.config.ts 和 manifest 移除;build/typecheck/lint/e2e 通过

## 隐私事实(来源 PRIVACY-POLICY.md)

1. **不收集 PII**，不内置分析/追踪 SDK，不使用 Cookie
2. **本地处理数据**: 翻译源凭证(LLM API Key/BaseURL、传统翻译源 API Key/端点)、待翻译文本、插件设置(目标语言、Prompt、生效源)
3. **API Key 仅存 chrome.storage.local**，不上传，不出现在日志/错误上报/commit
4. **待翻译文本按需透传**给当前生效翻译源，不在本地留存，翻译后不持久化
5. **数据流向取决于配置**:
   - 云端 LLM 提供方(OpenAI 兼容/Anthropic 原生端点): 文本发给该 LLM 接口
   - 本地模型(Ollama): 文本仅本机流转，不外传
   - 传统翻译源(Google/微软自有 Key): 发给官方翻译 API
   - 内置免 Key 免费源: 默认微软翻译(全新安装显式默认值)，可选 Google
6. **不发送给插件作者或无关第三方**
7. **无译文历史持久化**(v0.2 范围不含历史记录功能)
8. **用户权利**: 卸载/清除配置删除所有本地数据;配置页选择翻译源(含本地模型使文本不外传)
9. **[需法律复核]**: 隐私联系邮箱、责任主体、GDPR/CCPA 完整权利流程待补

## 权限清单

### manifest permissions (wxt.config.ts line 27)
- `storage` - 存储用户配置到 chrome.storage.local → 保留
- `activeTab` - 读取用户选中文本用于划词翻译 → 保留
- `contextMenus` - 代码中未使用(grep 确认仅 wxt.config.ts 声明) → **移除**

### content script matches (entrypoints/content.ts line 20)
- `<all_urls>` - 划词翻译需在任意网页工作 → 保留

### host_permissions (wxt.config.ts lines 18-26)
- `http://localhost/*` - 本地大模型(Ollama)
- `http://127.0.0.1/*` - 本地模型备用回环地址
- `https://translate.googleapis.com/*` - Google 翻译免 Key 公共端点
- `https://edge.microsoft.com/*` - 微软翻译免 Key 公共端点(默认源)
- `https://api.cognitive.microsofttranslator.com/*` - 微软翻译官方 API(用户填 Key)
- `https://*/*` - 用户自配云端 LLM 端点，SW 跨域 fetch 绕过 CORS

## 依赖链元数据

- 入口: `wxt.config.ts`(manifest 权限声明)
- content script: `entrypoints/content.ts`(matches: `<all_urls>`)
- background: `entrypoints/background.ts`(消息处理、流式翻译 port)
- 翻译适配层: `shared/translator/`(llm-provider.ts、traditional-provider.ts、builtin-sources.ts、index.ts)
- 存储: `shared/storage.ts`(chrome.storage.local)
- #65 也在改 wxt.config.ts(改 name 字段)，本任务只动 contextMenus 相关行

## 并发安全

- parallel-safe;MR 基线: base-branch;上游依赖: 无
- 共享文件 wxt.config.ts: #65 改 name 字段，#64 改 permissions 数组，不同字段无冲突

## 执行进度

- [x] Step4: contextMenus 已从 wxt.config.ts 移除; 4 份合规材料已落档至 releases/v0.3/4-listing-compliance/
- [ ] Step5: 待构建验证与测试
- [ ] Step6: 待提交与建 PR
