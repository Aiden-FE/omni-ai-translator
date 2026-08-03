# Provider Protocol and Full-page Feedback Verification

**Date:** 2026-08-03
**Verified implementation commit:** `e593905c1cd178d4f98b4415c1e1a030006c19cb`
**Scope:** explicit LLM protocols and Base URL resolution; Responses SSE terminal errors; full-page loading/progress, session isolation, retry cancellation guard, and empty-session observer lifecycle.

## Verification Results

| Command | Exit code | Result |
|---|---:|---|
| `node_modules/.bin/vitest run` | 0 | 16 test files, 353 passed, 0 failed |
| `node_modules/.bin/vue-tsc --noEmit` | 0 | Type check completed without diagnostics |
| `node_modules/.bin/eslint . --ext .ts,.vue` | 0 | Lint completed without diagnostics |
| `node_modules/.bin/wxt build` | 0 | Chrome MV3 production extension built successfully |
| `node_modules/.bin/playwright test` | 0 | 18 Chromium E2E tests passed, 0 failed |

Playwright's first run in the restricted sandbox could not bind its local mock server (`listen EPERM: operation not permitted 127.0.0.1`): 2 setup failures and 16 tests not started. The identical command was rerun with local-listener permission and passed all 18 tests. The runner also emitted a non-failing `NO_COLOR` / `FORCE_COLOR` warning.

## Acceptance Mapping

| # | Acceptance criterion | Evidence |
|---:|---|---|
| 1 | A provider using `https://api.openai.com/v1` can use Chat Completions or Responses. | `shared/translator/__tests__/llm-protocol.test.ts` validates root-to-endpoint resolution; `shared/translator/__tests__/llm-provider.test.ts` validates `/responses` with `input`; E2E `OpenAI Responses 使用 Base URL 连通并以 input 字段完成划词翻译` passed. |
| 2 | Existing complete endpoint configurations are not duplicated. | `shared/translator/__tests__/llm-protocol.test.ts` covers selected complete endpoints plus Base URLs and complete endpoints carrying query/hash; E2E `切换协议时将带尾斜杠的已知完整端点重置为 Base URL` passed. |
| 3 | Stored legacy OpenAI providers retain Chat Completions behavior. | `shared/__tests__/storage.test.ts` covers legacy `responseStyle='openai'`, missing values, on-read migration, and no write-back; `shared/translator/__tests__/llm-provider.test.ts` covers the default completions request path. |
| 4 | Every collected full-page segment shows a loading marker before provider response. | `shared/fullpage/orchestrator.test.ts` case `初始队列立即显示全部 loading...`; E2E `替换模式触发全文翻译,段落渐进渲染` asserts nine markers before the delayed response. |
| 5 | The floating toolbar appears at task start and reports deterministic progress. | `shared/fullpage/toolbar.test.ts` covers active, complete, failed, and empty progress states; orchestrator tests cover the derived `done + failed` count; the full-page E2E case asserts `全文翻译 0/9` and terminal progress. |
| 6 | Each segment replaces loading with translation or failure feedback on settlement. | `shared/fullpage/renderer.test.ts` covers marker removal by replace, bilingual, and failure rendering; `shared/fullpage/orchestrator.test.ts` covers success and partial failure terminal states. |
| 7 | Retry, dynamic content, mode switching, and restore preserve the marker lifecycle. | Orchestrator tests cover retry loading, restore/restart session isolation, restore stopping queued retry dispatch, dynamically added segments, empty-session observer behavior, and restore during in-flight work; E2E covers mode switch, restore cleanup, failure/retry, and dynamic translation. |
| 8 | Unit tests, typecheck, lint, build, and full-page E2E pass. | The five commands in the verification table all completed with exit code 0; unit tests are 353/353 and the E2E suite is 18/18. |

## Final Fix Regression Mapping

| Finding | Regression evidence |
|---|---|
| URL query/hash handling | `llm-protocol.test.ts`: Base URL query/hash receives the suffix in `pathname`; a complete endpoint with query/hash remains intact. |
| Responses SSE terminal failures | `llm-provider.test.ts`: `response.failed`, `response.incomplete`, and `error` return sanitized `unreachable` results without the configured API key; `response.completed` and `[DONE]` remain successful terminators. |
| Late retry session isolation | `orchestrator.test.ts`: `retry -> restore -> restart -> old retry settles` creates no old-mode translation or orphan host. |
| Retry queue stop after restore | `orchestrator.test.ts`: five failed segments with concurrency three dispatch only the three in-flight retries; resolving them after restore does not dispatch the remaining two. |
| Empty-session observer lifecycle | `orchestrator.test.ts`: the empty toolbar state remains visible, and content added afterward is not collected or translated. |

## Documentation Review

- ADR-005 now records pathname-only endpoint resolution, query/hash preservation, and Responses SSE terminal errors.
- The storage migration context records the exact on-read behavior for legacy `openai`, missing, and unknown protocol values.
- The adapter feature describes Base URL semantics, the shared resolver, Responses success terminators, and sanitized failure events.
- The full-page features document generation-based session identity, retry `isActive` forwarding, empty-session observer behavior, and progress derived from `records`.
