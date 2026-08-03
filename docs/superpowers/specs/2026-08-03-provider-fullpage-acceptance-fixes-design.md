# Provider Protocol and Full-page Feedback Acceptance Fixes Design

**Date:** 2026-08-03
**Status:** Approved for implementation planning
**Branch:** `codex/fix-acceptance-provider-fullpage-feedback`

## Summary

This change resolves two acceptance gaps:

1. LLM providers accept a Base URL rather than requiring a complete request endpoint, and OpenAI-compatible providers support both Chat Completions and Responses protocols.
2. Full-page translation becomes visibly active immediately through per-segment loading markers and task-level progress in the existing floating toolbar.

The implementation preserves existing provider configurations that contain complete endpoint paths and keeps all injected full-page UI isolated from host-page CSS through Shadow DOM.

## Goals

1. Let users configure service roots such as `https://api.openai.com/v1`.
2. Build the final request endpoint from the selected protocol without duplicating path suffixes.
3. Support non-streaming and streaming OpenAI Responses requests.
4. Preserve stored `responseStyle: 'openai'` configurations as Chat Completions behavior.
5. Show a loading marker for every collected segment as soon as full-page translation starts.
6. Show completed, total, active, and failed task state in the existing toolbar.
7. Correctly clean up loading UI on success, failure, retry, restore, mode switch, and dynamic content translation.

## Non-goals

- Introducing an OpenAI SDK dependency.
- Automatically probing provider protocol support.
- Adding cancellation or pause controls.
- Streaming individual full-page segments; the existing full-page pool remains non-streaming.
- Redesigning the provider category model or traditional translation providers.
- Changing segment collection rules, concurrency, or cache keys.

## Provider Configuration Design

### Protocol type

Replace the ambiguous OpenAI response style with explicit protocol values:

```ts
export type LlmProtocol =
  | 'openai-completions'
  | 'openai-responses'
  | 'anthropic'
  | 'ollama';
```

`ProviderConfig.responseStyle` uses `LlmProtocol`. Storage migration treats legacy `'openai'` as `'openai-completions'`. Missing values also default to `'openai-completions'` for backward compatibility.

### Base URL semantics

The configuration UI labels the field `Base URL` and uses service-root examples:

| Protocol | Default Base URL | Appended endpoint |
|---|---|---|
| `openai-completions` | `https://api.openai.com/v1` | `/chat/completions` |
| `openai-responses` | `https://api.openai.com/v1` | `/responses` |
| `anthropic` | `https://api.anthropic.com/v1` | `/messages` |
| `ollama` | `http://localhost:11434` | `/api/chat` |

Add a pure endpoint resolver in the translator layer:

```ts
export function resolveLlmEndpoint(baseUrl: string, protocol: LlmProtocol): string;
```

The resolver:

1. trims surrounding whitespace and trailing slashes;
2. appends the protocol endpoint for a service root;
3. recognizes the selected protocol's complete endpoint and returns it unchanged;
4. recognizes legacy OpenAI `/v1/chat/completions` input after migration;
5. never appends the same suffix twice.

The resolver does not silently rewrite an endpoint belonging to a different protocol. A user switching protocol from a known default or known endpoint receives the new protocol's default Base URL in the UI. Custom URLs remain untouched and are interpreted according to the newly selected protocol.

### Request and response handling

Chat Completions, Anthropic, and Ollama retain their current payload and parser behavior but obtain their URLs from `resolveLlmEndpoint`.

OpenAI Responses non-streaming requests use:

```json
{
  "model": "<configured model>",
  "input": "<translation prompt>"
}
```

The parser reads `output_text` when present and otherwise concatenates `text` values from `output[].content[]` items whose type is `output_text`. An HTTP failure continues through the existing error classifier.

OpenAI Responses streaming requests send `stream: true` and parse SSE `data:` objects:

- `response.output_text.delta`: emit and accumulate its string `delta`;
- `response.completed`: finish successfully;
- `[DONE]`: finish for compatible gateways that emit the legacy terminator;
- malformed or unrelated events: ignore without exposing provider secrets.

### UI behavior

The LLM protocol select exposes four explicit options with user-facing labels:

- OpenAI Chat Completions
- OpenAI Responses
- Anthropic Messages
- Ollama Chat

New providers default to OpenAI Chat Completions and `https://api.openai.com/v1`. Hints describe Base URL rather than complete endpoint requirements. Provider connection tests use the same resolver and protocol path as normal translation.

## Full-page Translation Feedback Design

### Segment loading lifecycle

Extend `SegmentRecord` with a loading marker host:

```ts
loadingMarkHost?: HTMLElement;
```

Add renderer functions:

```ts
export function markLoading(seg: SegmentRecord): void;
export function clearLoadingMark(seg: SegmentRecord): void;
```

`markLoading` creates an idempotent Shadow DOM host carrying `data-llm-translator`. It displays a compact spinner with an accessible label equivalent to `正在翻译此段`. The marker is positioned after the segment or its active bilingual block without replacing original text.

The orchestrator marks all collected segments before starting the concurrency-limited pool. This means queued and actively requested segments both provide immediate feedback. The marker lifecycle is:

| Transition | UI action |
|---|---|
| collected `pending` | add loading marker |
| `translating` | keep existing marker |
| `done` | remove marker, render translation |
| `failed` | remove marker, render failure badge |
| retry begins | clear failure badge, add loading marker |
| restore | remove loading, translation, and failure hosts |

Dynamic segments collected by the mutation observer follow the same lifecycle before entering the pool. Mode switching does not recreate or remove loading markers; marker placement remains valid in both modes.

### Toolbar progress

Extend `ToolbarApi` with:

```ts
interface TranslationProgress {
  completed: number;
  total: number;
  failed: number;
  active: boolean;
}

setProgress(progress: TranslationProgress): void;
```

The toolbar is created before requests are dispatched and displays a stable status row:

- active: `全文翻译 completed/total` with a spinner;
- complete with no failures: `全文翻译完成 total/total`;
- complete with failures: `已完成 completed/total，失败 failed`;
- empty page: `未发现可翻译文本`.

`completed` counts both successful and failed terminal segments, so progress never stalls when a request fails. Retry temporarily removes retried failures from the completed count, marks the task active, and updates progress as each retry settles.

The existing retry button remains controlled by `setFailureCount`; `setProgress` only owns the task status row.

### Orchestrator ownership

The orchestrator remains the sole state owner. It derives progress from `records` after collection and every status transition:

```ts
completed = records.filter((seg) => seg.status === 'done' || seg.status === 'failed').length;
failed = records.filter((seg) => seg.status === 'failed').length;
active = records.some((seg) => seg.status === 'pending' || seg.status === 'translating');
```

The renderer owns only individual marker DOM, and the toolbar owns only status presentation. Neither module starts requests or mutates orchestration state.

## Error and Cleanup Behavior

- Provider errors never include API keys; existing error classification remains unchanged.
- A rejected background message removes the segment loading marker and shows the normal failure badge.
- Restoring while requests are in flight removes every injected host immediately. Late results are blocked by the existing `active` guard and cannot reinsert markers or translations.
- Starting a new empty-page session replaces any old toolbar and shows the empty state without starting the mutation observer.
- Repeated `markLoading`, `clearLoadingMark`, toolbar progress updates, and cleanup calls are idempotent.

## Testing Strategy

### Provider tests

1. Endpoint resolver appends each protocol suffix to its Base URL.
2. Complete legacy endpoints are not duplicated.
3. Legacy `responseStyle: 'openai'` migrates to `openai-completions`.
4. Chat Completions requests use `/chat/completions` with the existing payload.
5. Responses requests use `/responses`, `input`, and configured model.
6. Responses non-streaming parser handles both `output_text` and nested output content.
7. Responses streaming parser emits deltas and stops on completion.
8. Malformed SSE events are ignored and stream interruption returns the existing network error shape.
9. Provider UI defaults and protocol labels are covered by focused component or extracted-helper tests.

### Full-page tests

1. `markLoading` is idempotent and creates an isolated accessible marker.
2. `clearLoadingMark` and `restoreAll` remove loading hosts.
3. All segments have markers before the first delayed translation resolves.
4. Settled success and failure segments lose loading markers and gain their expected rendering.
5. Toolbar progress covers active, success, partial failure, retry, and empty-page states.
6. Dynamic segments receive loading markers immediately.
7. Restore during in-flight work leaves no `data-llm-translator` DOM.
8. E2E asserts markers and `0/N` task progress before the first delayed mock response, then asserts terminal progress and rendered translations.

## Acceptance Criteria

1. A provider configured with `https://api.openai.com/v1` can use either OpenAI Chat Completions or OpenAI Responses.
2. Existing complete endpoint configurations continue to work without duplicated paths.
3. Existing stored OpenAI providers retain Chat Completions behavior after migration.
4. Full-page translation displays a loading marker for every collected segment before any provider response.
5. The floating toolbar appears at task start and reports deterministic progress.
6. Each segment replaces loading with translation or failure feedback as soon as it settles.
7. Retry, dynamic content, mode switching, and restore preserve the documented marker lifecycle.
8. Unit tests, typecheck, lint, build, and full-page E2E pass.

## Rollout

No storage rewrite is required beyond the existing read-time migration pattern. Release the provider protocol and full-page feedback changes together so the acceptance workflow can configure a Base URL, trigger translation, and immediately observe both segment-level and task-level activity.
