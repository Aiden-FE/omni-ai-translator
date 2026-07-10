# DESIGN: 合规材料落档与 contextMenus 权限清理 (#64)

> 任务 Issue: #64 | PRD Issue: #52 | 版本: v0.3 | 创建日期 2026-07-10

## 1. 权限清理方案

### 1.1 移除 contextMenus

**目标文件**: `wxt.config.ts` line 27

当前:
```typescript
permissions: ['storage', 'activeTab', 'contextMenus'],
```

修改后:
```typescript
permissions: ['storage', 'activeTab'],
```

**安全性分析**: grep 确认 `contextMenus` 仅出现在 `wxt.config.ts` 声明处，全代码库无 `chrome.contextMenus` API 调用。background.ts、content.ts、options、popup 均不依赖该权限。移除后无行为退化风险。

**并发注意**: #65 也在修改 wxt.config.ts(改 manifest name 字段)，本任务仅改动 permissions 数组行，不触碰其他字段，最小靶向改动避免冲突。

### 1.2 构建产物验证

执行 `pnpm build` 后检查 `.output/chrome-mv3/manifest.json`，确认 permissions 数组不含 `contextMenus`。

## 2. 合规材料结构

合规材料归档至 `releases/v0.3/4-listing-compliance/` 目录(与 PRD 同级)，包含:

### 2.1 隐私实践表 (PRIVACY-PRACTICES.md)

Chrome Web Store 隐私实践表填报答案，以表格形式呈现:

| 数据类别 | 是否收集 | 用途 | 共享方 |
|---|---|---|---|
| 个人通讯(Personal communications) | 是 | 待翻译文本发送给当前生效翻译源 | Google翻译/微软翻译/用户配置的LLM提供方 |
| 身份信息(PII) | 否 | - | - |
| 认证信息(Authentication) | 否 | API Key仅存本地不上传 | - |
| 位置信息 | 否 | - | - |
| 浏览历史 | 否 | - | - |
| 用户活动 | 否 | - | - |
| 网站内容 | 否 | content script仅读取用户主动选中文本 | - |

明确说明:
- 默认微软免费源(全新安装默认值)，用户可选 Google/云端 LLM/本地模型
- 待翻译文本仅按需发送当前生效翻译源
- API Key 与设置仅存 chrome.storage.local
- 无分析/追踪/Cookie/译文历史持久化

### 2.2 权限用途说明 (PERMISSIONS-JUSTIFICATION.md)

逐项为 manifest 声明的权限撰写用途说明:

**permissions**:
- `storage`: 存储用户配置(API Key、目标语言、生效源等)到 chrome.storage.local
- `activeTab`: 读取用户在当前页面选中的文本，用于划词翻译

**content script matches**:
- `<all_urls>`: 划词翻译需在用户浏览的任意网页上工作

**host_permissions**:
- `http://localhost/*`: 连接用户配置的本地大模型(Ollama)
- `http://127.0.0.1/*`: 本地模型备用回环地址
- `https://translate.googleapis.com/*`: Google 翻译免 Key 公共端点
- `https://edge.microsoft.com/*`: 微软翻译免 Key 公共端点(默认源)
- `https://api.cognitive.microsofttranslator.com/*`: 微软翻译官方 API(用户填 Key)
- `https://*/*`: 用户自配云端 LLM 端点，Service Worker 跨域 fetch

### 2.3 数据用途披露 (DATA-DISCLOSURE.md)

覆盖六个维度: 数据收集、数据使用、数据共享、数据存储、数据安全、用户权利。均与 PRIVACY-POLICY.md 一致。

### 2.4 一致性交叉核对清单 (COMPLIANCE-CHECKLIST.md)

逐条核对四份材料(隐私实践表、权限用途说明、数据用途披露、PRIVACY-POLICY.md)在各关键事实上的一致性。

## 3. 回归策略

1. `pnpm build` - 构建成功，manifest.json 不含 contextMenus
2. `pnpm typecheck` - TypeScript 类型检查通过
3. `pnpm lint` - ESLint 检查通过
4. `pnpm e2e` - 端到端测试(含划词翻译链路)通过，确认移除 contextMenus 无行为退化

## 4. 兼容性与风险

### 兼容性

- 移除 contextMenus 不影响任何现有功能(代码库无 chrome.contextMenus 调用)
- 不修改其他权限和 host_permissions
- 不修改 PRIVACY-POLICY.md 内容

### 风险

- **低风险**: contextMenus 移除后若发现隐藏依赖 -> grep 已确认无调用，风险极低
- **合规一致性风险**: 合规材料与隐私政策可能存在表述差异 -> 通过交叉核对清单逐条验证

## 5. UX 与视觉实现

无应用内前端界面，无 UX 实现要求。本任务面向 Chrome Web Store 后台合规字段与版本化文档，不涉及用户可见 UI。
