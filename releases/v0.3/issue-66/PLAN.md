# PLAN: #66 商店 Listing 素材归档执行计划

> 关联 Issue #66 · 迭代 v0.3

## 执行清单

- [x] 1. 创建 public/icon/ 目录
- [x] 2. 编写图标生成脚本 scripts/generate-icons.py
- [x] 3. 生成 16/32/48/128px PNG 图标
- [x] 4. 验证图标尺寸与格式正确
- [x] 5. pnpm build 验证 WXT 自动生成 manifest icons 字段
- [x] 6. 编写截图脚本 scripts/capture-screenshots.ts
- [x] 7. 运行截图脚本,生成 3 张 1280x800 截图
- [x] 8. 验证截图尺寸(1280x800)与品牌名(Omni AI Translator)
- [x] 9. 验证截图无敏感数据
- [x] 10. 编写 Listing 文案(listing-copy.md)
- [x] 11. 验证简短描述 ≤132 字符
- [x] 12. 编写截图准备与尺寸检查说明(screenshot-guide.md)
- [x] 13. 运行 pnpm build && pnpm typecheck && pnpm lint 全部通过
- [x] 14. 更新 MEMORY.md
- [x] 15. 自审清单检查
