# Provider Protocol and Full-page Feedback Verification

**Date:** 2026-08-03
**Verified implementation commit:** `763c41a10cea434b0a2d507dbf80a3e51025da88`
**Scope:** explicit LLM protocols and Base URL resolution; full-page loading markers and aggregate toolbar progress.

## Verification Results

| Command | Exit code | Result |
|---|---:|---|
| `node_modules/.bin/vitest run` | 0 | 16 test files, 344 passed, 0 failed |
| `node_modules/.bin/vue-tsc --noEmit` | 0 | Type check completed without diagnostics |
| `node_modules/.bin/eslint . --ext .ts,.vue` | 0 | Lint completed without diagnostics |
| `node_modules/.bin/wxt build` | 0 | Chrome MV3 production extension built successfully |
| `node_modules/.bin/playwright test` | 0 | 18 Chromium E2E tests passed, 0 failed |

Playwright's first run in the restricted sandbox could not bind its local mock server (`listen EPERM: operation not permitted 127.0.0.1`): 2 setup failures and 16 tests not started. The identical command was rerun with local-listener permission and passed all 18 tests. The runner also emitted a non-failing `NO_COLOR` / `FORCE_COLOR` warning.

## Acceptance Mapping

| # | Acceptance criterion | Evidence |
|---:|---|---|
| 1 | A provider using `https://api.openai.com/v1` can use Chat Completions or Responses. | `shared/translator/__tests__/llm-protocol.test.ts` validates root-to-endpoint resolution; `shared/translator/__tests__/llm-provider.test.ts` validates `/responses` with `input`; E2E `OpenAI Responses 使用 Base URL 连通并以 input 字段完成划词翻译` passed. |
| 2 | Existing complete endpoint configurations are not duplicated. | `shared/translator/__tests__/llm-protocol.test.ts` covers selected complete endpoints; E2E `切换协议时将带尾斜杠的已知完整端点重置为 Base URL` passed. |
| 3 | Stored legacy OpenAI providers retain Chat Completions behavior. | `shared/__tests__/storage.test.ts` covers legacy `responseStyle='openai'`, missing values, on-read migration, and no write-back; `shared/translator/__tests__/llm-provider.test.ts` covers the default completions request path. |
| 4 | Every collected full-page segment shows a loading marker before provider response. | `shared/fullpage/orchestrator.test.ts` case `初始队列立即显示全部 loading...`; E2E `替换模式触发全文翻译,段落渐进渲染` asserts nine markers before the delayed response. |
| 5 | The floating toolbar appears at task start and reports deterministic progress. | `shared/fullpage/toolbar.test.ts` covers active, complete, failed, and empty progress states; orchestrator tests cover the derived `done + failed` count; the full-page E2E case asserts `全文翻译 0/9` and terminal progress. |
| 6 | Each segment replaces loading with translation or failure feedback on settlement. | `shared/fullpage/renderer.test.ts` covers marker removal by replace, bilingual, and failure rendering; `shared/fullpage/orchestrator.test.ts` covers success and partial failure terminal states. |
| 7 | Retry, dynamic content, mode switching, and restore preserve the marker lifecycle. | Orchestrator tests cover retry loading, dynamically added segments, and restore during in-flight work; E2E covers mode switch, restore cleanup, failure/retry, and dynamic translation. |
| 8 | Unit tests, typecheck, lint, build, and full-page E2E pass. | The five commands in the verification table all completed with exit code 0; unit tests are 344/344 and the E2E suite is 18/18. |

## Documentation Review

- ADR-005 now records the four explicit protocol values, defaults, endpoint resolver, and OpenAI Responses split.
- The storage migration context records the exact on-read behavior for legacy `openai`, missing, and unknown protocol values.
- The adapter feature describes Base URL semantics, the shared resolver, and OpenAI Responses request/stream handling.
- The full-page feature documents immediate markers, terminal cleanup, retry/dynamic/restore behavior, and progress derived from `records`.

No production source or test was changed by this documentation task.
