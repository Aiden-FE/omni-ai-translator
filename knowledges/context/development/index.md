# 开发上下文索引

- `coding-standard.md` — 编码规范
- `dompurify-lazy-init.md` — DOMPurify 在 WXT/SSR 构建中的懒初始化（无 window 时默认导出为工厂函数，需运行时 `DOMPurify(window)` 创建实例）
- `on-read-storage-migration.md` — on-read 存储迁移模式（chrome.storage.local 存量配置读出时补全新形态、不回写，用户无感；含 TS 联合收紧后旧值比较与 registry 旧 type 兼容踩坑）
