# Provider and Full-page Acceptance Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept provider Base URLs with OpenAI Chat Completions or Responses protocols and make full-page translation visibly active through per-segment loading markers and toolbar progress.

**Architecture:** Add a pure LLM protocol module for normalization and endpoint resolution, then route provider requests through explicit protocol handlers. Keep full-page state in the orchestrator while renderer and toolbar expose idempotent presentation APIs.

**Tech Stack:** TypeScript strict mode, Vue 3, WXT MV3, Vitest/jsdom, Playwright, Shadow DOM, CSS inline imports.

## Global Constraints

- Work only in `/Users/aiden/dev/aiden/omni-ai-translator/.worktrees/acceptance-provider-fullpage-feedback`.
- Do not modify or repair the stale primary worktree.
- Do not add runtime dependencies.
- Do not log API keys or include them in error text.
- Use `unknown` plus type guards; do not introduce `any`.
- Preserve complete legacy endpoint configurations.
- Run local binaries under `node_modules/.bin/` because pnpm 11's dependency preflight cannot validate the copied worktree dependency directory.

---

### Task 1: LLM Protocol Contract, Endpoint Resolution, and Storage Migration

**Files:**
- Create: `shared/translator/llm-protocol.ts`
- Create: `shared/translator/__tests__/llm-protocol.test.ts`
- Modify: `shared/types.ts`
- Modify: `shared/storage.ts`
- Modify: `shared/__tests__/storage.test.ts`

**Interfaces:**
- Produces: `LlmProtocol`, `normalizeLlmProtocol(value: unknown): LlmProtocol`, `resolveLlmEndpoint(baseUrl: string, protocol: LlmProtocol): string`, `DEFAULT_LLM_BASE_URL_BY_PROTOCOL`.
- Consumed by: `shared/translator/llm-provider.ts`, `shared/ui/SourceConfigPanel.vue`, and storage migration.

- [ ] **Step 1: Write endpoint resolver tests**

Create table-driven tests that demand Base URL expansion and complete endpoint preservation:

```ts
import { describe, expect, it } from 'vitest';
import {
  normalizeLlmProtocol,
  resolveLlmEndpoint,
} from '../llm-protocol';

describe('resolveLlmEndpoint', () => {
  it.each([
    ['https://api.openai.com/v1', 'openai-completions', 'https://api.openai.com/v1/chat/completions'],
    ['https://api.openai.com/v1/', 'openai-responses', 'https://api.openai.com/v1/responses'],
    ['https://api.anthropic.com/v1', 'anthropic', 'https://api.anthropic.com/v1/messages'],
    ['http://localhost:11434', 'ollama', 'http://localhost:11434/api/chat'],
  ] as const)('%s + %s', (baseUrl, protocol, expected) => {
    expect(resolveLlmEndpoint(baseUrl, protocol)).toBe(expected);
  });

  it.each([
    ['https://gateway.test/v1/chat/completions', 'openai-completions'],
    ['https://gateway.test/v1/responses', 'openai-responses'],
    ['https://gateway.test/v1/messages', 'anthropic'],
    ['http://localhost:11434/api/chat', 'ollama'],
  ] as const)('preserves complete endpoint %s', (url, protocol) => {
    expect(resolveLlmEndpoint(url, protocol)).toBe(url);
  });
});

describe('normalizeLlmProtocol', () => {
  it('maps legacy and missing OpenAI values to Chat Completions', () => {
    expect(normalizeLlmProtocol('openai')).toBe('openai-completions');
    expect(normalizeLlmProtocol(undefined)).toBe('openai-completions');
  });
});
```

- [ ] **Step 2: Extend storage migration tests**

Change the `mockStorage` input from `ProviderConfig[]` to `unknown[]` because it represents untrusted persisted data. Then change legacy OpenAI expectations to `openai-completions` and add an already-new Responses case:

```ts
mockStorage([{ id: 'legacy', name: 'Legacy', type: 'openai-compatible', baseUrl: 'https://host/v1/chat/completions', model: 'm', responseStyle: 'openai' }]);
expect((await getProviders())[0].responseStyle).toBe('openai-completions');

// Stored new protocol remains unchanged.
mockStorage([{ id: 'responses', name: 'Responses', type: 'llm', baseUrl: 'https://host/v1', model: 'm', responseStyle: 'openai-responses' }]);
expect((await getProviders())[0].responseStyle).toBe('openai-responses');
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
node_modules/.bin/vitest run shared/translator/__tests__/llm-protocol.test.ts shared/__tests__/storage.test.ts
```

Expected: FAIL because `llm-protocol.ts` does not exist and legacy migration still returns `openai`.

- [ ] **Step 4: Implement the protocol contract and resolver**

Add the protocol type to `shared/types.ts`. During Task 1 only, keep legacy `'openai'` in the input union so the unchanged UI still typechecks; `getProviders` must nevertheless return normalized values at runtime:

```ts
export type LlmProtocol =
  | 'openai-completions'
  | 'openai-responses'
  | 'anthropic'
  | 'ollama';

responseStyle?: LlmProtocol | 'openai';
```

Implement protocol metadata and suffix-safe resolution:

```ts
const ENDPOINT_SUFFIX: Record<LlmProtocol, string> = {
  'openai-completions': '/chat/completions',
  'openai-responses': '/responses',
  anthropic: '/messages',
  ollama: '/api/chat',
};

export function normalizeLlmProtocol(value: unknown): LlmProtocol {
  if (value === 'openai-responses' || value === 'anthropic' || value === 'ollama') return value;
  return 'openai-completions';
}

export function resolveLlmEndpoint(baseUrl: string, protocol: LlmProtocol): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  const suffix = ENDPOINT_SUFFIX[protocol];
  return normalized.endsWith(suffix) ? normalized : `${normalized}${suffix}`;
}
```

Update `migrateProvider` to normalize every LLM provider's raw response style, including legacy types, without writing storage.

- [ ] **Step 5: Run focused and type tests and verify GREEN**

Run:

```bash
node_modules/.bin/vitest run shared/translator/__tests__/llm-protocol.test.ts shared/__tests__/storage.test.ts
node_modules/.bin/vue-tsc --noEmit
```

Expected: protocol and storage tests PASS; typecheck PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add shared/types.ts shared/storage.ts shared/__tests__/storage.test.ts shared/translator/llm-protocol.ts shared/translator/__tests__/llm-protocol.test.ts
git commit -m "feat: add explicit LLM protocol endpoints"
```

---

### Task 2: OpenAI Responses Requests and Provider Configuration UI

**Files:**
- Modify: `shared/translator/llm-provider.ts`
- Modify: `shared/translator/__tests__/llm-provider.test.ts`
- Modify: `shared/ui/SourceConfigPanel.vue`
- Modify: `e2e/mock-server.ts`
- Modify: `e2e/translate.spec.ts`

**Interfaces:**
- Consumes: Task 1 protocol normalization, defaults, and endpoint resolver.
- Produces: non-streaming and streaming OpenAI Responses behavior; four-option protocol UI using Base URL semantics.

- [ ] **Step 1: Write failing Chat Completions Base URL and Responses tests**

Update the OpenAI fixture Base URL to `http://localhost:9999/v1`. Assert the final fetch URL for Chat Completions, then add Responses tests:

```ts
expect(fetchMock).toHaveBeenCalledWith(
  'http://localhost:9999/v1/chat/completions',
  expect.any(Object),
);

const provider = createLLMProvider(makeOpenAIConfig({ responseStyle: 'openai-responses' }));
const result = await provider.translate(baseReq);
expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:9999/v1/responses');
expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
  model: 'test-model',
  input: expect.stringContaining('hello'),
});
expect(result.translatedText).toBe('你好,世界');
```

Cover direct `output_text`, nested `output[].content[]`, streaming `response.output_text.delta`, `[DONE]`, and malformed SSE events.

- [ ] **Step 2: Run provider tests and verify RED**

Run:

```bash
node_modules/.bin/vitest run shared/translator/__tests__/llm-provider.test.ts
```

Expected: FAIL because existing code posts directly to the Base URL and has no Responses route/parser.

- [ ] **Step 3: Implement Responses non-streaming and streaming handlers**

Route normalized protocols explicitly:

```ts
const protocol = normalizeLlmProtocol(config.responseStyle);
if (protocol === 'openai-responses') return callOpenAIResponses(config, req);
if (protocol === 'anthropic') return callAnthropic(config, req);
if (protocol === 'ollama') return callOllama(config, req);
return callOpenAICompletions(config, req);
```

Use `resolveLlmEndpoint` in all four non-streaming and streaming handlers. Parse Responses output with `unknown` type guards rather than optional chaining through untyped JSON.

- [ ] **Step 4: Update provider UI to Base URL semantics**

Use Task 1 defaults and four radio options. New providers use:

```ts
baseUrl: DEFAULT_LLM_BASE_URL_BY_PROTOCOL['openai-completions'],
responseStyle: 'openai-completions',
```

Change visible text to `Base URL` and examples such as `https://api.openai.com/v1`. When a known default or known complete endpoint is present, switching protocol replaces it with that protocol's default Base URL. Preserve custom values.

After every UI and provider caller uses the new values, narrow `ProviderConfig.responseStyle` from `LlmProtocol | 'openai'` to `LlmProtocol`. Legacy `'openai'` remains accepted only as `unknown` persisted input in `migrateProvider` tests.

- [ ] **Step 5: Add Responses mock route and provider E2E**

Add `/v1/responses` support to `e2e/mock-server.ts` for both ordinary JSON and SSE:

```ts
{ output_text: '你好,世界', output: [] }
```

Add an E2E case that selects `OpenAI Responses`, enters only `${mockUrl}/v1`, runs `测试连通`, activates the provider, translates selected text, and asserts request count or last request body uses the Responses route and `input` field.

- [ ] **Step 6: Run focused verification and verify GREEN**

Run:

```bash
node_modules/.bin/vitest run shared/translator/__tests__/llm-provider.test.ts shared/translator/__tests__/llm-protocol.test.ts shared/__tests__/storage.test.ts
node_modules/.bin/vue-tsc --noEmit
node_modules/.bin/wxt build
node_modules/.bin/playwright test e2e/translate.spec.ts
```

Expected: all commands PASS and Responses requests reach `/v1/responses` from a Base URL.

- [ ] **Step 7: Commit Task 2**

```bash
git add shared/translator/llm-provider.ts shared/translator/__tests__/llm-provider.test.ts shared/ui/SourceConfigPanel.vue e2e/mock-server.ts e2e/translate.spec.ts
git commit -m "feat: support OpenAI Responses provider mode"
```

---

### Task 3: Segment Loading Markers and Toolbar Progress Presentation

**Files:**
- Modify: `shared/fullpage/types.ts`
- Modify: `shared/fullpage/renderer.ts`
- Modify: `shared/fullpage/renderer.test.ts`
- Modify: `shared/fullpage/toolbar.ts`
- Modify: `shared/fullpage/toolbar.test.ts`
- Modify: `assets/fullpage-block.css`
- Modify: `assets/fullpage-toolbar.css`

**Interfaces:**
- Produces: `markLoading`, `clearLoadingMark`, `TranslationProgress`, and `ToolbarApi.setProgress`.
- Consumed by: Task 4 orchestrator integration.

- [ ] **Step 1: Write renderer loading marker tests**

Add tests that assert idempotence, Shadow DOM isolation, accessibility, and cleanup:

```ts
markLoading(seg);
markLoading(seg);
expect(document.querySelectorAll('.llm-translator-loading-host')).toHaveLength(1);
expect(seg.loadingMarkHost?.shadowRoot?.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe('正在翻译此段');

clearLoadingMark(seg);
expect(seg.loadingMarkHost).toBeUndefined();
expect(document.querySelector('.llm-translator-loading-host')).toBeNull();
```

Extend `restoreAll` tests to begin with loading, bilingual, and failure hosts and assert all are removed.

- [ ] **Step 2: Write toolbar progress tests**

Add tests for these exact calls and visible strings:

```ts
api.setProgress({ completed: 0, total: 9, failed: 0, active: true });
expect(progress.textContent).toContain('全文翻译 0/9');

api.setProgress({ completed: 9, total: 9, failed: 0, active: false });
expect(progress.textContent).toContain('全文翻译完成 9/9');

api.setProgress({ completed: 9, total: 9, failed: 1, active: false });
expect(progress.textContent).toContain('已完成 9/9，失败 1');

api.setProgress({ completed: 0, total: 0, failed: 0, active: false });
expect(progress.textContent).toContain('未发现可翻译文本');
```

- [ ] **Step 3: Run renderer and toolbar tests and verify RED**

Run:

```bash
node_modules/.bin/vitest run shared/fullpage/renderer.test.ts shared/fullpage/toolbar.test.ts
```

Expected: FAIL because marker functions, record field, progress type, and toolbar API do not exist.

- [ ] **Step 4: Implement marker DOM and CSS**

Add `loadingMarkHost?: HTMLElement` to `SegmentRecord`. Implement an idempotent host with `data-llm-translator`, open Shadow DOM, inline block CSS, spinner, `role="status"`, and `aria-label="正在翻译此段"`. Ensure `applyReplace`, `applyBilingual`, `markFailed`, `restoreAll`, and explicit clear calls cannot leave duplicate or stale loading hosts.

- [ ] **Step 5: Implement toolbar progress DOM and CSS**

Add `TranslationProgress` and `setProgress`. Insert a fixed-height progress row before action buttons so text changes do not resize controls. Toggle a CSS spinner from `active`; expose the progress row as `role="status"` with `aria-live="polite"`.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
node_modules/.bin/vitest run shared/fullpage/renderer.test.ts shared/fullpage/toolbar.test.ts
node_modules/.bin/vue-tsc --noEmit
```

Expected: renderer and toolbar tests PASS; typecheck PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add shared/fullpage/types.ts shared/fullpage/renderer.ts shared/fullpage/renderer.test.ts shared/fullpage/toolbar.ts shared/fullpage/toolbar.test.ts assets/fullpage-block.css assets/fullpage-toolbar.css
git commit -m "feat: show full-page translation progress"
```

---

### Task 4: Orchestrator Loading Lifecycle and Full-page E2E

**Files:**
- Modify: `shared/fullpage/orchestrator.ts`
- Modify: `shared/fullpage/orchestrator.test.ts`
- Modify: `e2e/fullpage.spec.ts`

**Interfaces:**
- Consumes: Task 3 renderer and toolbar presentation APIs.
- Produces: immediate markers for initial/dynamic/retry segments and deterministic aggregate progress.

- [ ] **Step 1: Write orchestrator tests for immediate loading and progress**

Use a deferred translation response, start translation without awaiting completion, and assert:

```ts
const startPromise = start('replace');
await drainMicrotasks();
expect(document.querySelectorAll('.llm-translator-loading-host')).toHaveLength(2);
expect(toolbarText()).toContain('全文翻译 0/2');

resolveFirst({ translatedText: '第一段' });
await drainMicrotasks();
expect(toolbarText()).toContain('全文翻译 1/2');
```

Add partial failure, retry, dynamic segment, empty page, and restore-in-flight cases. Assert restore leaves zero `[data-llm-translator]` nodes.

- [ ] **Step 2: Run orchestrator tests and verify RED**

Run:

```bash
node_modules/.bin/vitest run shared/fullpage/orchestrator.test.ts
```

Expected: FAIL because the orchestrator does not mark queued segments or call `setProgress`.

- [ ] **Step 3: Implement progress derivation and marker lifecycle**

Add focused helpers:

```ts
function markSegmentsLoading(segments: SegmentRecord[]): void {
  for (const seg of segments) markLoading(seg);
}

function updateProgress(): void {
  const completed = records.filter((seg) => seg.status === 'done' || seg.status === 'failed').length;
  const failed = records.filter((seg) => seg.status === 'failed').length;
  const activeProgress = records.some((seg) => seg.status === 'pending' || seg.status === 'translating');
  toolbar?.setProgress({ completed, total: records.length, failed, active: activeProgress });
}
```

Call marker and progress updates after initial collection, every settle, before retry, after retry, after dynamic collection, and on empty-page startup. Clear a marker before terminal rendering.

- [ ] **Step 4: Add E2E assertions before the first delayed response**

Configure Chat Completions with `${mockUrl}/v1` rather than a complete endpoint. Immediately after triggering, assert nine loading hosts and toolbar `全文翻译 0/9`. Then assert progressive translation, terminal `全文翻译完成 9/9`, zero loading hosts, existing retry behavior, and restore cleanup.

- [ ] **Step 5: Run focused and E2E verification and verify GREEN**

Run:

```bash
node_modules/.bin/vitest run shared/fullpage/orchestrator.test.ts shared/fullpage/renderer.test.ts shared/fullpage/toolbar.test.ts shared/fullpage/translate-pool.test.ts
node_modules/.bin/vue-tsc --noEmit
node_modules/.bin/wxt build
node_modules/.bin/playwright test e2e/fullpage.spec.ts
```

Expected: all commands PASS; E2E observes loading before delayed responses and terminal progress after settlement.

- [ ] **Step 6: Commit Task 4**

```bash
git add shared/fullpage/orchestrator.ts shared/fullpage/orchestrator.test.ts e2e/fullpage.spec.ts
git commit -m "fix: make full-page translation activity visible"
```

---

### Task 5: Knowledge Updates and Full Verification

**Files:**
- Modify: `docs/knowledge/adr/005-response-style-as-llm-protocol-discriminator.md`
- Modify: `docs/knowledge/context/development/storage-migration.md`
- Modify: `docs/knowledge/feature/translator-unified-adapter.md`
- Modify: `docs/knowledge/feature/fullpage-orchestrator.md`
- Modify: `docs/knowledge/feature/fullpage-segmenter-pool.md`
- Create: `docs/superpowers/reviews/2026-08-03-provider-fullpage-acceptance-fixes-verification.md`

**Interfaces:**
- Documents the final protocol names, Base URL behavior, migration, loading lifecycle, progress calculation, and verification evidence.

- [ ] **Step 1: Update knowledge documents from verified behavior**

Record these exact contracts:

```text
responseStyle: openai-completions | openai-responses | anthropic | ollama
legacy openai or missing value -> openai-completions on read
Base URL -> protocol-specific endpoint resolver
pending/translating -> loading marker
done/failed -> terminal rendering and aggregate progress
```

- [ ] **Step 2: Run the full verification suite**

Run:

```bash
node_modules/.bin/vitest run
node_modules/.bin/vue-tsc --noEmit
node_modules/.bin/eslint . --ext .ts,.vue
node_modules/.bin/wxt build
node_modules/.bin/playwright test
```

Expected: 0 failed unit tests, typecheck exit 0, lint exit 0, build exit 0, all Playwright projects pass.

- [ ] **Step 3: Write verification evidence**

Create the review document with the exact commands, exit codes, unit test count, E2E test count, and any environment caveats. Include a requirement checklist mapping all eight design acceptance criteria to tests or manual evidence.

- [ ] **Step 4: Check the final diff**

Run:

```bash
git diff --check
git status --short
git log --oneline --decorate -6
```

Expected: no whitespace errors; only intentional Task 5 files remain uncommitted before the final documentation commit.

- [ ] **Step 5: Commit Task 5**

```bash
git add docs/knowledge docs/superpowers/reviews/2026-08-03-provider-fullpage-acceptance-fixes-verification.md
git commit -m "docs: record provider and full-page acceptance behavior"
```
