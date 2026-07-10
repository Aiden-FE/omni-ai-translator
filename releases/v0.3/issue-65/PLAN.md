# PLAN: 产品品牌统一 (#65)

> Issue #65 · 执行清单

## 执行步骤

- [x] 替换 `entrypoints/popup/App.vue` aria-label(line 27): `LLM Translator 设置` -> `Omni AI Translator 设置`
- [x] 替换 `entrypoints/popup/App.vue` header span(line 36): `LLM Translator` -> `Omni AI Translator`
- [x] 替换 `entrypoints/options/App.vue` h1 标题(line 9): `LLM Translator 设置` -> `Omni AI Translator 设置`
- [x] 替换 `entrypoints/popup/index.html` title(line 5): `LLM Translator` -> `Omni AI Translator`
- [x] 替换 `entrypoints/options/index.html` title(line 5): `LLM Translator 设置` -> `Omni AI Translator 设置`
- [x] 品牌一致性回归检查:grep 确认 entrypoints/ 与 shared/ 无残留 `LLM Translator`
- [x] 构建: `pnpm build` 通过
- [x] 构建产物验证: manifest.json name = `Omni AI Translator`
- [x] 类型检查: `pnpm typecheck` 通过
- [x] Lint: `pnpm lint` 通过
- [x] 更新 CHANGELOG.md
