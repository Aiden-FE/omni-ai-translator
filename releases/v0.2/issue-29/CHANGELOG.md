# CHANGELOG — Issue #29

## Bug 修复

### host_permissions 增补 `https://*/*` 覆盖云端 LLM 端点 (#29)

**问题**:`wxt.config.ts` 的 `manifest.host_permissions` 仅含 localhost、127.0.0.1 与三个内置传统源端点,无通配 HTTPS。用户配置的云端 LLM 端点(`https://*`)不在权限内,background SW fetch 仅靠 CORS,非 CORS 友好 provider(部分 OpenAI 兼容网关 / 自建反代)被跨域拦截,划词翻译报"翻译请求失败请检查网络或源地址"。

**修复**:在 `host_permissions` 数组末尾增补 `'https://*/*'`,使 SW 对用户配置的任意 HTTPS 云端 LLM 端点具备跨域 fetch 特权,绕过 CORS。

**改动文件**:`wxt.config.ts`(host_permissions 数组增 1 行 + 注释)

**验证**:`pnpm build` 通过,`.output/chrome-mv3/manifest.json` 的 host_permissions 已含 `https://*/*`。

## 部署注意

- `https://*/*` 是宽泛权限,Chrome Web Store 审核可能询问用途。用途说明:用户自行配置云端 LLM 翻译源端点(如 OpenAI 兼容接口、Anthropic 原生接口、ARK 等),扩展 background Service Worker 需跨域 fetch 这些端点完成翻译,声明 host_permissions 以绕过 CORS 限制。选择 `https://*/*` 而非 `<all_urls>` 以平衡审核(仅 HTTPS,不覆盖所有协议)。
- 本地 ollama 端点已由 `localhost` / `127.0.0.1` 覆盖,无需额外处理。
- 回滚:移除新增的 `'https://*/*'` 行即可,不影响其它条目。
