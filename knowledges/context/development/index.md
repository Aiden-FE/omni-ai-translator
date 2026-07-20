# 开发上下文索引

- `coding-standard.md` - 编码规范
- `dompurify-lazy-init.md` - DOMPurify 在 WXT/SSR 构建中的懒初始化（无 window 时默认导出为工厂函数，需运行时 `DOMPurify(window)` 创建实例）
- `on-read-storage-migration.md` - on-read 存储迁移模式（chrome.storage.local 存量配置读出时补全新形态、不回写，用户无感；含 TS 联合收紧后旧值比较与 registry 旧 type 兼容踩坑）
- `extension-permissions-and-privacy.md` - 扩展权限基线（storage；activeTab、contextMenus 已移除）、host_permissions、隐私数据流与合规材料归档
- `wxt-conventions.md` - WXT 构建命令与产物目录约定、图标自动生成、Playwright 截图脚本约定
