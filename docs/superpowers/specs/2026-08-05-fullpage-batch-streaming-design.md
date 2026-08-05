# Full-page Batch Streaming Translation Design

**Date:** 2026-08-05
**Status:** Approved in conversation; awaiting written-spec review
**Branch:** `ai-devflow-sprint/v0.4.0`

## Summary

This change fixes three full-page translation acceptance defects:

1. A visual paragraph containing inline elements is collected as several independent translation segments.
2. Full-page translation sends one non-streaming request per segment, creating excessive request overhead and delaying useful page updates.
3. Thinking/reasoning text and control tokens such as `</think>` and `</s>` can be rendered as translation output.

The approved design uses semantic block segments, LLM-only batch streaming, incremental schema-validated chunk delivery, and request/output defenses against reasoning leakage. Traditional Google and Microsoft translation keep the existing non-streaming path.

## Goals

1. Treat one visual text block as one translation unit even when it contains `span`, `strong`, `em`, `a`, or other inline descendants.
2. Preserve inline DOM structure in replace mode by translating the semantic block's ordered text-node parts together and writing translated parts back to their original text nodes.
3. Send multiple LLM chunks in one streaming request.
4. Keep at most three batch requests in flight, matching the existing maximum concurrency.
5. Pack at most 20 chunks and at most 6000 source Unicode characters into one request.
6. Render each completed and validated chunk as soon as it can be parsed from the stream.
7. Disable model thinking where the selected protocol provides a compatible switch and prevent reasoning text from reaching the page for every provider.
8. Preserve cache, retry, viewport priority, dynamic-content translation, restore, and stale-session protections.

## Non-goals

- Changing Google or Microsoft translation to a streaming protocol.
- Increasing full-page request concurrency above three.
- Adding user-facing batch-size or concurrency settings.
- Depending on provider-specific structured-output features or an LLM SDK.
- Attempting to preserve executable or interactive behavior from model-generated markup.
- Rendering partial text from an incomplete semantic block result.

## Root Cause

### Paragraph fragmentation

`collectSegments` currently creates a segment from only an element's direct child text nodes and then recursively creates more segments for inline children. For example:

```html
<p>Members of the <strong>Open Secure AI Alliance</strong> are publishing guidance.</p>
```

becomes three independent translation contexts. In bilingual mode those contexts become separate translation blocks. In replace mode each result mutates a different subset of the paragraph, so word order and punctuation can become incoherent.

### Request overhead

`runPool` currently calls `browser.runtime.sendMessage({ type: 'translate' })` once per segment. The pool permits three concurrent requests, but every request repeats connection, prompt, and provider overhead. The existing `translate-stream` Port is used by selection translation and is not used by full-page translation.

### Reasoning leakage

The current LLM request bodies do not explicitly disable thinking. The Ollama requests omit the supported `think: false` field. OpenAI-compatible gateways may place reasoning in normal `content`, including literal `<think>` blocks, so the existing content parser forwards it as `deltaText`. The full-page renderer correctly uses `textContent`, but that also means it faithfully displays leaked reasoning and control tokens.

## Architecture

### Capability selection

The orchestrator resolves the active provider category before collecting segments:

- LLM provider: semantic segmenter plus batch-stream pool.
- Traditional provider: existing segmenter and existing non-streaming pool.

The background exposes only the capability needed by the content script, for example `{ batchStream: boolean }`; it does not expose API keys or complete provider configuration.

### Semantic segment model

An LLM semantic segment is owned by the smallest eligible block container. It includes descendant text nodes reached through inline elements but stops at nested block boundaries. Standalone controls or inline text without an eligible block owner remain independent segments.

```ts
interface SegmentTextPart {
  id: number;
  node: Text;
  sourceText: string;
  translatedText?: string;
}

interface SegmentRecord {
  // existing fields
  parts?: SegmentTextPart[];
}
```

The segment's `originalText` is the ordered concatenation of its parts. Whitespace-only parts are retained for DOM fidelity but are not independently translated. Nested block elements produce their own segments, so a parent `div` does not absorb whole cards, lists, or article sections.

The batch prompt receives every segment as an ID plus ordered parts. The model translates the parts with the full segment context and returns the same part IDs. Replace mode writes validated translated parts back to their original text nodes. Bilingual mode concatenates the translated parts into one translation block. A mismatched part set is a failed segment and is never partially applied.

### Batch packing

Batch construction is stable and greedy in page-priority order:

1. Add the next pending chunk while the batch contains fewer than 20 chunks.
2. Count source characters with Unicode code points, excluding JSON/protocol overhead.
3. Add the chunk only when the resulting source total is at most 6000 characters.
4. When the next chunk would exceed 6000 characters, close the current non-empty batch and start another batch with that chunk.

Therefore reducing the chunk count is the only normal response to the character limit. A batch never exceeds either limit.

If one semantic segment alone exceeds 6000 source characters, split it at sentence, then whitespace, then code-point boundaries for transport only. Each transport chunk retains the semantic segment ID and an ordered part index. The page does not render that segment until all transport chunks complete and are recombined, so an oversized paragraph still appears as one translation unit.

Approved constants:

```ts
const MAX_BATCH_CHUNKS = 20;
const MAX_BATCH_SOURCE_CHARS = 6000;
const MAX_BATCH_CONCURRENCY = 3;
const VIEWPORT_BATCH_WINDOW_MS = 25;
```

### Streaming contract

Full-page translation uses a dedicated runtime Port so the existing selection-translation contract remains backward compatible.

```ts
interface BatchTranslateChunk {
  chunkId: string;
  segmentId: string;
  parts: Array<{ partId: number; sliceIndex: number; text: string }>;
}

type BatchStreamPortMessage =
  | { type: 'request'; requestId: string; targetLang: string; chunks: BatchTranslateChunk[] }
  | {
      type: 'chunk';
      requestId: string;
      chunkId: string;
      translatedParts: Array<{ partId: number; sliceIndex: number; text: string }>;
    }
  | { type: 'done'; requestId: string; missingChunkIds: string[] }
  | { type: 'error'; requestId: string; result: TranslateResult };
```

Normally one semantic segment maps to one transport chunk. An oversized semantic segment maps to multiple transport chunks with the same `segmentId`; `partId` and `sliceIndex` provide deterministic reassembly into the original text-node parts.

The LLM is instructed to emit one compact JSON object per completed transport chunk, without Markdown fences, commentary, reasoning, or prose. The provider stream still yields raw text deltas internally. A stateful incremental object scanner finds complete JSON objects across arbitrary network chunks and newlines. It publishes a `chunk` only after validating:

- the chunk ID belongs to the current request;
- the chunk ID has not already settled;
- every expected `(partId, sliceIndex)` pair occurs exactly once;
- every translated part is a string;
- no unknown part or slice IDs are present.

Text outside validated objects is ignored. This permits immediate chunk settlement while preventing a reasoning preamble from becoming page content. A normal semantic segment renders immediately when its only chunk settles. An oversized segment renders after all of its chunks settle and reassemble. Code fences and unrelated JSON objects are harmless because they fail schema and request-ID validation.

At stream completion, requested chunk IDs without valid results are included in `missingChunkIds`. Their owning semantic segments become failed and use the existing retry workflow. Complete semantic segments from the same batch remain successful and cached; incomplete oversized segments are never partially rendered or cached.

### Scheduling and progressive rendering

The batch pool keeps no more than three requests in flight. Cached segments settle before packing and consume neither chunk nor character budget. Each validated chunk updates its transport state immediately. A semantic segment updates its cache, progress, and renderer as soon as all of its chunks are valid; the pool does not wait for unrelated chunks in the batch.

Initial in-viewport segments are packed first in document order. Out-of-viewport segments keep the existing IntersectionObserver behavior. Segments entering the viewport within a 25 ms window are collected and packed together, preventing the lazy path from regressing to one request per segment. Dynamic DOM additions use the same queue.

The existing session generation and `isActive` checks remain authoritative. Results received after restore or restart may complete provider work but cannot mutate the current page session.

## Thinking and Output Safety

Translation never requests extended thinking as a feature.

- Ollama requests send top-level `think: false` in streaming and non-streaming paths.
- Anthropic requests continue to omit the `thinking` property, which leaves extended thinking disabled.
- OpenAI-compatible endpoints do not receive a guessed vendor-specific field that could break arbitrary gateways. Their translation prompt explicitly prohibits analysis, reasoning, `<think>` tags, and control tokens.
- The batch parser exposes only schema-valid requested items, so reasoning text outside the contract is discarded.
- Existing non-batch translation results pass through a shared reasoning-artifact sanitizer before rendering. It removes complete `<think>...</think>` and `<analysis>...</analysis>` blocks and strips residual `<think>`, `<analysis>`, and `</s>` control tags.

There is no universal switch that can stop every OpenAI-compatible reasoning model from spending internal reasoning tokens. A provider/model that always reasons may still do so internally, but its reasoning must never be rendered. Providers with a documented disable switch use that switch; models without one require selecting a non-reasoning model to remove the internal cost completely.

## Cache and Retry

The LLM cache stores the structured semantic translation needed by both display modes:

```ts
interface SemanticTranslation {
  translatedText: string;
  translatedParts: string[];
}
```

The key remains target language plus original semantic text, with a version discriminator so legacy flat-string cache entries cannot be misapplied to structured segments. Traditional translation keeps its current string cache.

Retry selects failed semantic segments, repacks them with the same 20-chunk and 6000-character constraints, and streams valid results progressively. It does not resend successful siblings from a partially failed batch.

## Error Handling

- A batch-level HTTP, network, or Port error fails only semantic segments with unresolved chunks in that batch.
- Already completed semantic segments stay rendered and cached after a later stream error.
- Duplicate or malformed model objects are ignored and recorded as missing at stream completion.
- A translated-parts mismatch never mutates any source text node.
- Restore removes loading, failure, and bilingual hosts immediately; stale results fail the existing generation check.
- Provider error strings continue through API-key redaction and the existing error classifier.
- An unsupported batch-stream capability cannot silently fall back to LLM per-segment requests; capability selection chooses the traditional legacy path only for traditional providers.

## Testing Strategy

### Segmenter and renderer

1. A paragraph with nested `strong`, `span`, `em`, and `a` becomes one semantic segment.
2. Nested block elements remain separate semantic segments.
3. Standalone inline controls remain independently translatable.
4. Replace mode writes translated parts to the corresponding text nodes and preserves inline elements.
5. Bilingual mode creates exactly one translated block per semantic segment.
6. Part mismatch leaves the original DOM untouched and marks the segment failed.
7. Restore reproduces original text-node bytes and inline DOM.

### Batch packing and pool

1. Twenty small chunks fit in one batch; the twenty-first starts a new batch.
2. A chunk that would make source text exceed 6000 characters starts a new batch.
3. Every emitted batch satisfies both limits using actual transport chunks.
4. One source segment over 6000 characters is transport-split with stable part/slice IDs and rendered only after recombination.
5. No more than three batch streams are in flight.
6. Cached items are excluded from request limits and settle immediately.
7. Valid items render before their batch finishes.
8. A late stream error preserves earlier completed semantic segments and fails only segments with unresolved chunks.
9. Viewport entries within the batching window share requests.
10. Restore stops new dispatch and blocks late rendering.

### Stream parser and thinking controls

1. JSON objects split across arbitrary deltas parse exactly once.
2. Multiple objects in one delta parse independently.
3. Reasoning prose, Markdown fences, unknown IDs, duplicate IDs, and malformed objects never produce page items.
4. Missing IDs are reported on completion.
5. Ollama streaming and non-streaming request bodies contain `think: false`.
6. Anthropic requests do not enable thinking.
7. Batch prompts explicitly forbid reasoning and require the object-stream contract.
8. Non-batch sanitization removes tagged thinking blocks and residual control tags.

### Integration and E2E

1. The mock LLM accepts a 20-item request and emits item objects with observable delays.
2. Request-count assertions prove that several page segments share one provider request.
3. The first completed item appears while the same batch is still streaming.
4. A fixture paragraph containing inline markup produces one translated block.
5. A mock reasoning preamble and `</think></s>` tokens never appear in page text.
6. Partial malformed output produces per-item failures and successful retry.
7. Traditional provider tests retain the existing non-streaming behavior.
8. Unit tests, typecheck, lint, build, and Playwright E2E pass.

## Acceptance Criteria

1. A visual paragraph with inline markup is translated and displayed as one semantic unit.
2. An LLM batch contains no more than 20 chunks and no more than 6000 source Unicode characters.
3. No more than three LLM batch requests are active concurrently.
4. Multiple normal page chunks share a provider request.
5. Each valid completed chunk is rendered before the rest of its batch finishes.
6. Initial viewport, lazy viewport entry, dynamic content, retry, cache, restore, and mode switching retain their documented behavior.
7. Ollama thinking is explicitly disabled, other providers never enable optional thinking, and reasoning/control content is never rendered.
8. Google and Microsoft continue to use the existing non-streaming translation path.

## Rollout

The new Port contract is additive. The selection-translation stream and traditional full-page path remain available during rollout. No storage migration is required. The semantic cache uses an in-memory version discriminator, so release rollback does not leave incompatible persistent data.
