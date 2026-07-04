# CHANGELOG:popup 设置入口 - 翻译源配置迁移与现代化(Issue #35)

> 关联 Issue:#35 · PRD Issue:#30 · 迭代:v0.2
> 创建日期:2026-07-04

## 新增功能

- **popup 配置主入口**:点击工具栏 icon 弹出 400x600 配置面板,支持添加/编辑/删除提供方、切换生效源、连通性测试、设置目标语言,无需打开 options 页(Issue #35)
- **共享源配置组件**:抽取 `shared/ui/SourceConfigPanel.vue`,popup 与 options 共用,消除双份维护(Issue #35)
- **popup 现代化 UI**:深色 header(logo + title)、可滚动主体、底部操作栏(添加提供方 + 打开全部设置),对齐项目设计系统(Issue #35)
- **卡片折叠**:popup 变体下源卡片可折叠,默认展开活跃卡、折叠非活跃卡,节省纵向空间(Issue #35)
- **popup 打开即聚焦**:popup 打开时自动聚焦目标语言输入框,满足可访问性要求(Issue #35)
- **options/popup 互通**:popup 底部「打开全部设置」→ chrome.runtime.openOptionsPage();两者共享 chrome.storage.local 实时同步(Issue #35)

## Bug 修复

- **bug #27 在 popup 生效**:兜底态「配置自有源」由纯锚点改为触发 addProvider() 并聚焦新卡片名称输入,经共享组件复用带到 popup(Issue #35)
- **bug #28 在 popup 生效**:LLM 源类目归并,源类型下拉 optgroup 分组为「LLM 接口配置」/「传统翻译」,移除「云端/本地」误导后缀,经共享组件复用带到 popup(Issue #35)

## API 变更

无。后端契约(ProviderType 枚举、Message 通道、shared/storage)均不变。

## 破坏性变更

无。options 页行为等价(改为复用共享组件,功能不变)。

## 部署注意事项

- 无后端迁移;popup 与 options 共享 chrome.storage.local,配置实时同步
- 既有划词翻译链路不受影响(e2e 回归 6/6 通过)
- `shared/ui/SourceConfigPanel.vue` 为新增共享组件,popup 与 options 均引用
