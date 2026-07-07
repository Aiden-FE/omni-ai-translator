# CHANGELOG — Issue #8

## Bug 修复

- **修复划词翻译「默认目标语言」配置不生效**(#8):`entrypoints/content.ts` 的 `getTargetLang()` 此前只读 `navigator.language`,完全忽略用户在设置页配置的 `settings.defaultTargetLang`,导致 prompt 始终用浏览器首选语言作为目标语言(如浏览器为 en-US 时把英文译成英文)。现改为 async,优先读取 `settings.defaultTargetLang`(trim 后非空时使用用户配置值),为空则回退 `navigator.language` 映射值(保持原回退逻辑),使设置页 hint「留空则使用浏览器首选语言」的承诺在划词翻译链路真正生效。

## 测试变更

- `e2e/translate.spec.ts` 新增用例「配置的默认目标语言生效,prompt 使用用户配置值」:在 options 页配置默认目标语言为「简体中文」后划词翻译,通过 `getLastRequestBody()` 取 mock server 收到的请求体,断言 prompt 包含 `into 简体中文`,回归保护该配置链路。
- 既有「划词后出现触发按钮,点击后浮层展示 mock 译文」用例保持通过。

## API 变更
无。消息协议、storage、类型定义均未改动。

## 破坏性变更
无。`defaultTargetLang` 默认值为空字符串,trim 后为空 → 回退 `navigator.language`,与改动前行为完全一致。

## 部署注意事项
- 无需数据迁移;存量用户配置在划词翻译时立即生效。
- 连通性测试 `testProvider` 不受影响(硬编码 `targetLang='中文'`,不经过 content.ts 的 `getTargetLang`)。
