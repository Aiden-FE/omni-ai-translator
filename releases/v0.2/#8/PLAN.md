# PLAN — Issue #8

## 执行计划

- [x] 1. 修改 `entrypoints/content.ts`:`getTargetLang()` 改为 async,优先读取 `settings.defaultTargetLang`(trim 后非空),否则回退 navigator.language 映射;import `getSettings`;`doTranslate` 调用处加 `await`。优先级 P0,复杂度低。
- [x] 2. e2e 增强:在 `e2e/translate.spec.ts` 新增用例 —— 在 options 页配置 defaultTargetLang 为「简体中文」后划词翻译,通过 `getLastRequestBody()` 断言 mock server 收到的请求体 prompt 包含 `into 简体中文`,验证配置生效。优先级 P1,复杂度中。
- [x] 3. 校验:typecheck(`./node_modules/.bin/vue-tsc --noEmit`)+ lint(`./node_modules/.bin/eslint . --ext .ts,.vue`)通过。优先级 P0,复杂度低。
- [x] 4. 校验:e2e 在 `#`-free 路径构建运行通过(见 MEMORY e2e 执行策略)。优先级 P0,复杂度中。
- [x] 5. 审查:子 agent 审查实现覆盖 PLAN 全部任务与代码质量。优先级 P0,复杂度低。

## 依赖关系
1 → 2 → (3,4 可并行) → 5。任务 2 依赖任务 1 的代码改动;3/4 为校验;5 为最终审查。

## 执行结果与偏差
- 任务 1-2 实现完成,子 agent 完成度审查通过(仅 content.ts 与 e2e/translate.spec.ts 两个文件改动,未波及 background/llm/storage/types)。
- 任务 3:typecheck exit 0、lint exit 0(直接调二进制绕过 pnpm deps check,见 MEMORY)。
- 任务 4:在 `/tmp/lt8-build`(无 `#` 路径)重新 `pnpm install` + `wxt build` + `playwright test`,2 个用例全部通过(含新增断言 prompt 含 `into 简体中文` 的用例)。临时目录已清理。
- 任务 5:子 agent 完成度审查结论为「全部任务完成,无遗漏」。
