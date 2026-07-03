# DESIGN — Issue #29 host_permissions 增补 https://*/*

## 背景

Chrome MV3 中,background Service Worker 对声明在 `manifest.host_permissions` 的域名具备跨域 fetch 特权(绕过 CORS);未声明的域名仅靠目标端点 CORS 头放行。当前 `wxt.config.ts` 的 host_permissions 仅覆盖 localhost 与三个内置传统源,用户自配的云端 LLM 端点(`https://*`)未被覆盖,导致非 CORS 友好 provider 请求失败。

## 方案

在 `wxt.config.ts` 的 `manifest.host_permissions` 数组末尾增补 `'https://*/*'`,并补注释说明用途(用户自配云端 LLM 端点跨域 fetch,绕过 CORS)。

选择 `https://*/*` 而非 `<all_urls>` 的理由(自动决策,源自 Issue 建议):仅放行 HTTPS,不覆盖所有协议,对 store 审核更平衡;LLM 端点普遍走 HTTPS。

### 最小改动

```ts
host_permissions: [
  'http://localhost/*',
  'http://127.0.0.1/*',
  'https://translate.googleapis.com/*',
  'https://edge.microsoft.com/*',
  'https://api.cognitive.microsofttranslator.com/*',
  'https://*/*', // 用户自配云端 LLM 端点,SW 跨域 fetch 绕过 CORS
],
```

### 回滚方案

移除新增的 `'https://*/*'` 行即可回滚;不影响其它条目。

### 兼容性

- 本地 ollama(localhost / 127.0.0.1)由既有条目覆盖,无影响。
- 内置传统源端点由既有条目覆盖,无影响。
- store 审核:`https://*/*` 是宽泛权限,审核可能询问用途,需在 CHANGELOG / PR 说明(用户自配云端 LLM 端点跨域 fetch,绕过 CORS)。

## UX 与视觉实现

本任务无前端界面,无 UX 实现要求。修复作用于 manifest 网络权限层,用户可见效果为"配置非 CORS 友好云端 LLM 端点后划词翻译可成功",无视觉变更。
