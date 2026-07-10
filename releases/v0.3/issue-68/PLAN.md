# PLAN: #68 多浏览器发布流水线 - Firefox/Edge 构建矩阵与商店发布

> Issue #68 · 版本 v0.3 · 创建 2026-07-10

## 执行清单

- [x] 1. 更新 release.yml workflow header 注释（多浏览器说明、完整 Secrets 清单、troubleshooting）
- [x] 2. 更新 workflow name 为 "Release Browser Extension"
- [x] 3. 更新 dry-run 输入描述为 "skip all store uploads (Chrome/Firefox/Edge)"
- [x] 4. 更新 concurrency group 为 release-extension-${{ tag }}
- [x] 5. 将单 job `release-chrome` 重构为 matrix job `release`（browser: [chrome, firefox, edge], fail-fast: false）
- [x] 6. 保留共享 steps：checkout / pnpm setup / node setup / install / determine-context / version-check
- [x] 7. 将 build step 改为 case 分发（chrome/firefox/edge）
- [x] 8. 将 zip step 改为 case 分发（chrome/firefox/edge）
- [x] 9. 将 locate-zip step 改为 matrix.browser 模式匹配
- [x] 10. 保留 upload-to-release step（gh release upload --clobber，共享）
- [x] 11. 保留 skip-notice step（增加浏览器标识）
- [x] 12. Chrome Secrets 校验 step：条件加 matrix.browser == 'chrome'
- [x] 13. Chrome 商店上传 step：条件加 matrix.browser == 'chrome'，逻辑不变
- [x] 14. 新增 AMO Secrets 校验 step（AMO_API_KEY, AMO_API_SECRET）
- [x] 15. 新增 AMO 上传 step（web-ext sign --source-dir .output/firefox-mv2/ --channel listed）
- [x] 16. 新增 Edge Secrets 校验 step（EDGE_PRODUCT_ID/CLIENT_ID/CLIENT_SECRET/TENANT_ID）
- [x] 17. 新增 Edge 上传 step（curl: 获取 token -> 上传包 -> 发布）
- [ ] 18. 运行 pnpm build && pnpm build:firefox && pnpm build:edge 验证构建
- [ ] 19. 运行 pnpm typecheck && pnpm lint 验证代码质量
- [ ] 20. YAML 语法校验（python yaml.safe_load 或 actionlint）
- [ ] 21. 自审：workflow 语法、Secret 不打印、三浏览器矩阵正确、prerelease/dry-run 门禁、不破坏 Chrome 逻辑
- [ ] 22. 写 CHANGELOG.md
- [ ] 23. 更新 MEMORY.md 待沉淀知识
