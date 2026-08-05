# Full-page Batch Streaming Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate semantic page blocks through schema-validated LLM batch streams so paragraphs are not fragmented, completed chunks render immediately, and model reasoning never reaches the page.

**Architecture:** Keep the existing traditional translation pool unchanged. Add an LLM-only path composed of a semantic segmenter, a pure 20-chunk/6000-character transport packer, a provider-level JSON object stream parser, and a three-request batch pool; the orchestrator selects the path from an active-provider capability and retains ownership of viewport, retry, cache, and session lifecycle.

**Tech Stack:** TypeScript 5.4, WXT 0.19, Chrome MV3 runtime Ports, Vue 3, Vitest 2 with jsdom, Playwright 1.61.

## Global Constraints

- LLM batch concurrency remains exactly 3; do not lower or raise it.
- A provider request contains at most 20 transport chunks.
- The source text in one provider request contains at most 6000 Unicode code points; JSON/prompt overhead is excluded.
- Oversized semantic segments may split only for transport and render only after complete reassembly.
- Initial viewport segments remain higher priority than out-of-viewport segments.
- Viewport entries observed within 25 ms share the same packing queue.
- Google and Microsoft keep the existing non-streaming `collectSegments` plus `runPool` path.
- Ollama streaming and non-streaming requests send `think: false`; Anthropic never enables `thinking`.
- No LLM reasoning, `<think>`, `<analysis>`, or `</s>` control content may reach page rendering.
- Do not add an LLM SDK, provider-specific structured-output dependency, storage migration, or user-facing tuning setting.

## File Map

- Create `shared/translator/reasoning-filter.ts`: shared final-text and streaming reasoning filter.
- Create `shared/translator/reasoning-filter.test.ts`: real filter behavior, including split control tags.
- Create `shared/translator/batch-object-stream.ts`: batch prompt builder plus validated incremental JSON object scanner.
- Create `shared/translator/batch-object-stream.test.ts`: network-boundary and schema validation tests.
- Create `shared/fullpage/batch-packer.ts`: semantic-segment transport splitting and greedy batch packing.
- Create `shared/fullpage/batch-packer.test.ts`: 20/6000/Unicode/oversized-segment boundary tests.
- Create `shared/fullpage/batch-pool.ts`: Port client, three-request scheduling, structured cache, and per-segment settlement.
- Create `shared/fullpage/batch-pool.test.ts`: progressive results, concurrency, partial failure, cache, and stale-session tests.
- Modify `shared/types.ts`: capability and batch Port wire types shared by content/background.
- Modify `shared/translator/types.ts`: optional provider batch-stream method.
- Modify `shared/translator/index.ts` and `shared/translator/__tests__/adapter.test.ts`: active capability and batch adapter entry points.
- Modify `shared/translator/llm-provider.ts` and `shared/translator/__tests__/llm-provider.test.ts`: batch prompt streaming, reasoning filtering, and Ollama thinking switch.
- Modify `shared/fullpage/types.ts`: semantic text parts and structured translation/cache types.
- Modify `shared/fullpage/segmenter.ts` and `shared/fullpage/segmenter.test.ts`: additive `collectSemanticSegments` path.
- Modify `shared/fullpage/renderer.ts` and `shared/fullpage/renderer.test.ts`: part-preserving replace and one-block bilingual rendering.
- Modify `entrypoints/background.ts`: capability message and dedicated `fullpage-translate-batch-stream` Port.
- Modify `shared/fullpage/orchestrator.ts` and `shared/fullpage/orchestrator.test.ts`: capability selection, batch pool composition, 25 ms viewport queue, retry, and cleanup.
- Modify `e2e/mock-server.ts`, `e2e/fixtures/fullpage-test-page.html`, and `e2e/fullpage.spec.ts`: batch object stream and acceptance coverage.

---

### Task 1: Block Reasoning Artifacts in Existing Translation Paths

**Files:**
- Create: `shared/translator/reasoning-filter.ts`
- Create: `shared/translator/reasoning-filter.test.ts`
- Modify: `shared/translator/llm-provider.ts`
- Test: `shared/translator/__tests__/llm-provider.test.ts`

**Interfaces:**
- Produces: `sanitizeReasoningArtifacts(text: string): string`.
- Produces: `createReasoningStreamFilter(onText: (text: string) => void): { push(delta: string): void; finish(): string }`.
- Preserves: `TranslationProvider.translate` and `translateStream` public signatures.

- [ ] **Step 1: Write failing final-text and split-stream tests**

```ts
it('removes complete reasoning blocks and control tokens', () => {
  expect(sanitizeReasoningArtifacts(
    '<think>translate rationale</think>关注我们</s>',
  )).toBe('关注我们');
});

it('does not emit a think block split across network deltas', () => {
  const visible: string[] = [];
  const filter = createReasoningStreamFilter((text) => visible.push(text));
  filter.push('<thi');
  filter.push('nk>secret reasoning</th');
  filter.push('ink>译文</s>');
  expect(filter.finish()).toBe('译文');
  expect(visible.join('')).toBe('译文');
});
```

The tests catch removal of block-state buffering, tag-prefix buffering, and final control-token cleanup.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm test -- shared/translator/reasoning-filter.test.ts`

Expected: FAIL because `reasoning-filter.ts` does not exist.

- [ ] **Step 3: Implement the stateful filter and apply it at provider boundaries**

```ts
export function sanitizeReasoningArtifacts(text: string): string {
  return text
    .replace(/<(think|analysis)>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(?:think|analysis)>|<\/s>/gi, '')
    .trim();
}

export function createReasoningStreamFilter(onText: (text: string) => void) {
  let raw = '';
  return {
    push(delta: string) { raw += delta; },
    finish() {
      const clean = sanitizeReasoningArtifacts(raw);
      if (clean) onText(clean);
      return clean;
    },
  };
}
```

Use the real implementation as a state machine that can release proven normal text without waiting for stream completion, but never releases bytes inside an incomplete `<think>` or `<analysis>` block. Route all four non-streaming results through `sanitizeReasoningArtifacts`; route all four stream deltas through one filter and use `finish()` for the final `translatedText`. Add top-level `think: false` to both Ollama request bodies.

- [ ] **Step 4: Verify GREEN and provider request behavior**

Run: `pnpm test -- shared/translator/reasoning-filter.test.ts shared/translator/__tests__/llm-provider.test.ts`

Expected: PASS; Ollama body assertions contain `{ think: false }`, reasoning chunks never reach `onChunk`, and existing protocol cases remain green.

- [ ] **Step 5: Commit the isolated safety fix**

```bash
git add shared/translator/reasoning-filter.ts shared/translator/reasoning-filter.test.ts shared/translator/llm-provider.ts shared/translator/__tests__/llm-provider.test.ts
git commit -m "fix: suppress llm reasoning in translation output"
```

### Task 2: Collect and Render Semantic Blocks Without Fragmenting Inline Markup

**Files:**
- Modify: `shared/fullpage/types.ts`
- Modify: `shared/fullpage/segmenter.ts`
- Modify: `shared/fullpage/segmenter.test.ts`
- Modify: `shared/fullpage/renderer.ts`
- Modify: `shared/fullpage/renderer.test.ts`

**Interfaces:**
- Produces: `SegmentTextPart { id: number; node: Text; sourceText: string; translatedText?: string }`.
- Produces: `collectSemanticSegments(root: ParentNode, options?: SegmenterOptions): SegmentRecord[]`.
- Extends: `SegmentRecord.parts?: SegmentTextPart[]` and `SegmentRecord.translatedParts?: string[]`.
- Preserves: legacy `collectSegments` behavior for traditional providers.

- [ ] **Step 1: Write failing semantic collection tests**

```ts
it('collects inline descendants as one semantic paragraph', () => {
  document.body.innerHTML = '<p>Hello <strong>secure AI</strong> world</p>';
  const [segment] = collectSemanticSegments(document.body);
  expect(segment.originalText).toBe('Hello secure AI world');
  expect(segment.parts?.map((part) => part.sourceText)).toEqual([
    'Hello ', 'secure AI', ' world',
  ]);
  expect(collectSemanticSegments(document.body)).toHaveLength(1);
});

it('stops at nested block boundaries', () => {
  document.body.innerHTML = '<div>intro<p>paragraph <em>text</em></p>outro</div>';
  expect(collectSemanticSegments(document.body).map((s) => s.originalText)).toEqual([
    'introoutro', 'paragraph text',
  ]);
});
```

Also retain an assertion that `collectSegments` still returns legacy direct-node/inline records.

- [ ] **Step 2: Run semantic tests and verify RED**

Run: `pnpm test -- shared/fullpage/segmenter.test.ts`

Expected: FAIL because `collectSemanticSegments` is not exported.

- [ ] **Step 3: Implement additive semantic ownership**

```ts
export interface SegmentTextPart {
  id: number;
  node: Text;
  sourceText: string;
  translatedText?: string;
}

export function collectSemanticSegments(
  root: ParentNode,
  options: SegmenterOptions = {},
): SegmentRecord[];
```

Walk eligible block owners in document order. For each owner, collect text nodes through inline descendants, prune translator/hidden/skipped subtrees, and stop before a nested eligible block. Emit standalone inline/control owners only when no eligible block owns their text. Reuse `generateSegmentId`, visibility checks, and letter filtering instead of duplicating those rules.

- [ ] **Step 4: Write failing structured renderer tests**

```ts
it('writes translated parts back without removing strong or links', () => {
  document.body.innerHTML = '<p>Hello <strong>world</strong></p>';
  const [segment] = collectSemanticSegments(document.body);
  segment.translatedParts = ['你好', '世界'];
  segment.translatedText = '你好世界';
  applyReplace(segment);
  expect(document.querySelector('p')?.textContent).toBe('你好世界');
  expect(document.querySelector('strong')).not.toBeNull();
});

it('creates one bilingual block for one semantic paragraph', () => {
  const [segment] = collectSemanticSegments(document.body);
  segment.translatedText = '你好世界';
  applyBilingual(segment);
  expect(document.querySelectorAll('.llm-translator-block-host')).toHaveLength(1);
});
```

- [ ] **Step 5: Implement structured render with legacy fallback**

```ts
export function applyReplace(seg: SegmentRecord): void {
  clearLoadingMark(seg);
  captureOriginal(seg);
  if (seg.parts && seg.translatedParts?.length === seg.parts.length) {
    seg.parts.forEach((part, index) => { part.node.data = seg.translatedParts![index]; });
    return;
  }
  // Keep the existing flat-string path unchanged for traditional segments.
  seg.textNodes[0].data = seg.translatedText ?? '';
  seg.textNodes.slice(1).forEach((node) => { node.data = ''; });
}
```

Ensure `captureOriginal`, `restoreAll`, and mode switching use all semantic part nodes and preserve their original byte-for-byte data.

- [ ] **Step 6: Verify segmenter and renderer GREEN**

Run: `pnpm test -- shared/fullpage/segmenter.test.ts shared/fullpage/renderer.test.ts`

Expected: PASS for new semantic cases and every legacy case.

- [ ] **Step 7: Commit semantic segmentation**

```bash
git add shared/fullpage/types.ts shared/fullpage/segmenter.ts shared/fullpage/segmenter.test.ts shared/fullpage/renderer.ts shared/fullpage/renderer.test.ts
git commit -m "fix: translate inline markup as semantic blocks"
```

### Task 3: Enforce 20-Chunk and 6000-Character Transport Limits

**Files:**
- Modify: `shared/types.ts`
- Create: `shared/fullpage/batch-packer.ts`
- Create: `shared/fullpage/batch-packer.test.ts`

**Interfaces:**
- Produces wire types `BatchTranslatePart`, `BatchTranslateChunk`, `BatchTranslatedPart`, and `BatchTranslatedChunk`.
- Produces `createTransportChunks(segment: SegmentRecord): BatchTranslateChunk[]`.
- Produces `packTransportBatches(chunks: BatchTranslateChunk[]): BatchTranslateChunk[][]`.
- Produces constants `MAX_BATCH_CHUNKS = 20` and `MAX_BATCH_SOURCE_CHARS = 6000`.

- [ ] **Step 1: Write literal boundary tests before the packer exists**

```ts
it('puts 20 one-character chunks in one request and the 21st in another', () => {
  const chunks = Array.from({ length: 21 }, (_, i) => wireChunk(`c${i}`, 'x'));
  expect(packTransportBatches(chunks).map((batch) => batch.length)).toEqual([20, 1]);
});

it('counts Unicode code points and never exceeds 6000', () => {
  const chunks = [wireChunk('a', '😀'.repeat(3000)), wireChunk('b', '文'.repeat(3001))];
  expect(packTransportBatches(chunks).map(sourceCodePointCount)).toEqual([3000, 3001]);
});

it('transport-splits one oversized segment with stable slice indexes', () => {
  const chunks = createTransportChunks(segmentWithText('a'.repeat(6001)));
  expect(chunks).toHaveLength(2);
  expect(chunks.map((c) => c.parts[0].sliceIndex)).toEqual([0, 1]);
  expect(chunks.map(sourceCodePointCount)).toEqual([6000, 1]);
});
```

Test helpers use hand-authored expected values and complete real wire shapes.

- [ ] **Step 2: Run packer tests and verify RED**

Run: `pnpm test -- shared/fullpage/batch-packer.test.ts`

Expected: FAIL because the module and exported wire types do not exist.

- [ ] **Step 3: Add wire types and implement deterministic transport splitting**

```ts
export interface BatchTranslatePart {
  partId: number;
  sliceIndex: number;
  text: string;
}

export interface BatchTranslateChunk {
  chunkId: string;
  segmentId: string;
  parts: BatchTranslatePart[];
}

export const countCodePoints = (text: string) => Array.from(text).length;
```

Fill a transport chunk from ordered parts until the next part would exceed 6000. Split an individually oversized part at sentence punctuation, then whitespace, then the exact code-point boundary. Assign `${segment.id}:${chunkIndex}` and monotonically increasing `sliceIndex` values.

- [ ] **Step 4: Implement stable greedy request packing**

```ts
export function packTransportBatches(chunks: BatchTranslateChunk[]) {
  const batches: BatchTranslateChunk[][] = [];
  let current: BatchTranslateChunk[] = [];
  let chars = 0;
  for (const chunk of chunks) {
    const nextChars = chunk.parts.reduce((n, p) => n + countCodePoints(p.text), 0);
    if (current.length && (current.length === 20 || chars + nextChars > 6000)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(chunk);
    chars += nextChars;
  }
  if (current.length) batches.push(current);
  return batches;
}
```

Reject an impossible empty or over-budget transport chunk rather than emitting an invalid provider request.

- [ ] **Step 5: Verify packer GREEN and typecheck**

Run: `pnpm test -- shared/fullpage/batch-packer.test.ts && pnpm typecheck`

Expected: PASS; every emitted batch satisfies both constraints.

- [ ] **Step 6: Commit transport packing**

```bash
git add shared/types.ts shared/fullpage/batch-packer.ts shared/fullpage/batch-packer.test.ts
git commit -m "feat: pack full-page translation batches"
```

### Task 4: Parse Schema-Validated Translation Objects Incrementally

**Files:**
- Create: `shared/translator/batch-object-stream.ts`
- Create: `shared/translator/batch-object-stream.test.ts`

**Interfaces:**
- Produces `buildBatchPrompt(targetLang: string, chunks: BatchTranslateChunk[]): string`.
- Produces `createBatchObjectStream(expected, onChunk): { push(delta: string): void; finish(): string[] }` where `finish()` returns missing chunk IDs.

- [ ] **Step 1: Write failing parser and prompt tests**

```ts
it('parses adjacent objects split at arbitrary network boundaries', () => {
  const results: BatchTranslatedChunk[] = [];
  const parser = createBatchObjectStream(expectedChunks, (chunk) => results.push(chunk));
  parser.push('reasoning that must be ignored\n```json\n{"chunk');
  parser.push('Id":"c1","translatedParts":[{"partId":0,"sliceIndex":0,"text":"你"}]}');
  parser.push('{"chunkId":"c2","translatedParts":[{"partId":0,"sliceIndex":0,"text":"好"}]}\n```');
  expect(parser.finish()).toEqual([]);
  expect(results.map((r) => r.chunkId)).toEqual(['c1', 'c2']);
});

it('ignores duplicate, unknown, malformed, and mismatched part objects', () => {
  // Push one valid c1 twice, unknown c9, and c2 with the wrong sliceIndex.
  expect(results.map((r) => r.chunkId)).toEqual(['c1']);
  expect(parser.finish()).toEqual(['c2']);
});
```

Prompt assertions verify the literal requirements `no reasoning`, `one JSON object per completed chunk`, and exact input IDs without asserting incidental prose.

- [ ] **Step 2: Run parser tests and verify RED**

Run: `pnpm test -- shared/translator/batch-object-stream.test.ts`

Expected: FAIL because the parser module does not exist.

- [ ] **Step 3: Implement a brace/string-aware incremental scanner**

```ts
interface ScannerState {
  depth: number;
  inString: boolean;
  escaped: boolean;
  objectStart: number;
  buffer: string;
}
```

Advance one character at a time, count braces only outside strings, retain incomplete objects between `push` calls, and parse only when depth returns to zero. Validate `chunkId`, one-settlement-only, exact `(partId, sliceIndex)` membership, no duplicates, and string translations before invoking `onChunk`.

- [ ] **Step 4: Build the batch prompt from JSON data, not string interpolation per field**

```ts
export function buildBatchPrompt(targetLang: string, chunks: BatchTranslateChunk[]): string {
  return [
    `Translate every chunk into ${targetLang}.`,
    'Do not reason or output analysis, <think>, <analysis>, or control tokens.',
    'Output one compact JSON object per completed chunk and no other text.',
    JSON.stringify(chunks),
  ].join('\n');
}
```

- [ ] **Step 5: Verify parser GREEN**

Run: `pnpm test -- shared/translator/batch-object-stream.test.ts`

Expected: PASS for arbitrary splits, braces inside JSON strings, invalid schemas, duplicates, reasoning preambles, and missing IDs.

- [ ] **Step 6: Commit object-stream protocol**

```bash
git add shared/translator/batch-object-stream.ts shared/translator/batch-object-stream.test.ts
git commit -m "feat: parse llm batch translation streams"
```

### Task 5: Add LLM Batch Provider, Capability, and Background Port

**Files:**
- Modify: `shared/types.ts`
- Modify: `shared/translator/types.ts`
- Modify: `shared/translator/llm-provider.ts`
- Modify: `shared/translator/index.ts`
- Modify: `shared/translator/__tests__/llm-provider.test.ts`
- Modify: `shared/translator/__tests__/adapter.test.ts`
- Modify: `entrypoints/background.ts`

**Interfaces:**
- Produces `TranslationCapabilities { batchStream: boolean }`.
- Produces `BatchTranslateRequest { targetLang: string; chunks: BatchTranslateChunk[] }`.
- Produces `BatchTranslateResult { missingChunkIds: string[]; error?: string; errorType?: ErrorType }`.
- Produces optional `TranslationProvider.translateBatchStream(req, onChunk)`.
- Produces adapter entries `getTranslationCapabilities()` and `translateBatchWithAdapterStream(req, onChunk)`.
- Produces dedicated Port name `fullpage-translate-batch-stream` and `BatchStreamPortMessage` wire union.

- [ ] **Step 1: Write failing provider tests using real SSE/NDJSON bodies**

```ts
it('streams validated OpenAI batch chunks progressively', async () => {
  const seen: string[] = [];
  const result = await provider.translateBatchStream!(request, (chunk) => seen.push(chunk.chunkId));
  expect(seen).toEqual(['c1', 'c2']);
  expect(result.missingChunkIds).toEqual([]);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).stream).toBe(true);
});

it('sends think false for Ollama batch translation', async () => {
  await ollama.translateBatchStream!(request, vi.fn());
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).think).toBe(false);
});
```

Repeat protocol payload coverage for Responses and Anthropic, while parser behavior stays in Task 4 tests.

- [ ] **Step 2: Run provider tests and verify RED**

Run: `pnpm test -- shared/translator/__tests__/llm-provider.test.ts`

Expected: FAIL because `translateBatchStream` is absent.

- [ ] **Step 3: Refactor protocol stream calls to accept an explicit prompt**

```ts
type DeltaHandler = (delta: string) => void;

async function callOpenAICompletionsPromptStream(
  provider: ProviderConfig,
  prompt: string,
  onDelta: DeltaHandler,
): Promise<TranslateResult>;
```

Use the same raw-prompt shape for Responses, Anthropic, and Ollama. Existing `translateStream` calls these helpers with `buildPrompt`; new `translateBatchStream` calls them with `buildBatchPrompt`, pipes deltas through `createBatchObjectStream`, and returns its missing IDs plus any classified stream error. Preserve existing endpoint, headers, temperature, and redaction behavior.

- [ ] **Step 4: Write failing adapter capability and routing tests**

```ts
it('reports batchStream only for the active LLM source', async () => {
  expect(await getTranslationCapabilities()).toEqual({ batchStream: true });
  vi.mocked(getSettings).mockResolvedValue({ activeProviderId: 'builtin:microsoft', defaultTargetLang: '' });
  expect(await getTranslationCapabilities()).toEqual({ batchStream: false });
});

it('routes a batch stream to the active LLM provider', async () => {
  const seen: string[] = [];
  const result = await translateBatchWithAdapterStream(request, (c) => seen.push(c.chunkId));
  expect(seen).toEqual(['c1']);
  expect(result.missingChunkIds).toEqual([]);
});
```

- [ ] **Step 5: Implement active-provider resolution once and expose capability/batch APIs**

Extract a private `resolveActiveProviderConfig()` used by scalar, stream, capability, and batch entry points. Return `{ batchStream: false }` for missing/traditional sources. Return a typed error if a batch call reaches a provider without `translateBatchStream`; never fall back to per-segment LLM translation.

- [ ] **Step 6: Register the background message and Port contract**

Add `get-translation-capabilities` to `Message` and define the exact shared Port union:

```ts
export type BatchStreamPortMessage =
  | { type: 'request'; requestId: string; targetLang: string; chunks: BatchTranslateChunk[] }
  | { type: 'chunk'; requestId: string; chunk: BatchTranslatedChunk }
  | { type: 'done'; requestId: string; missingChunkIds: string[] }
  | { type: 'error'; requestId: string; result: BatchTranslateResult };
```

On `fullpage-translate-batch-stream`, accept one typed request, call `translateBatchWithAdapterStream`, post each validated `chunk`, then post `done` or `error` and disconnect. Ignore messages with the wrong type or duplicate requests on one Port.

- [ ] **Step 7: Verify provider and adapter GREEN**

Run: `pnpm test -- shared/translator/__tests__/llm-provider.test.ts shared/translator/__tests__/adapter.test.ts && pnpm typecheck`

Expected: PASS for all protocols, capability categories, no-config, batch routing, and existing scalar/selection translation.

- [ ] **Step 8: Commit provider and background integration**

```bash
git add shared/types.ts shared/translator/types.ts shared/translator/llm-provider.ts shared/translator/index.ts shared/translator/__tests__/llm-provider.test.ts shared/translator/__tests__/adapter.test.ts entrypoints/background.ts
git commit -m "feat: add llm batch streaming port"
```

### Task 6: Schedule and Render Batch Streams in the Full-page Orchestrator

**Files:**
- Create: `shared/fullpage/batch-pool.ts`
- Create: `shared/fullpage/batch-pool.test.ts`
- Modify: `shared/fullpage/types.ts`
- Modify: `shared/fullpage/orchestrator.ts`
- Modify: `shared/fullpage/orchestrator.test.ts`

**Interfaces:**
- Produces `runBatchPool(segments: SegmentRecord[], opts: BatchPoolOptions): Promise<TranslatePoolResult>`.
- Produces `retryBatchSegments(failed: SegmentRecord[], opts: BatchPoolOptions): Promise<TranslatePoolResult>`.
- Consumes Task 3 `createTransportChunks`/`packTransportBatches` and Task 5 Port types.
- Preserves existing `runPool`/`retrySegments` for traditional providers.

- [ ] **Step 1: Write failing batch-pool tests around real SegmentRecord state**

```ts
it('renders a completed segment before its request finishes', async () => {
  const promise = runBatchPool(segments, options);
  fakePort.emit(validChunkFor(segments[0]));
  expect(segments[0].status).toBe('done');
  expect(segments[1].status).toBe('translating');
  fakePort.emitDone([]);
  await promise;
});

it('never opens more than three batch ports', async () => {
  const promise = runBatchPool(manySegmentsProducingFourBatches, options);
  expect(fakeRuntime.activePortCount()).toBe(3);
  fakeRuntime.finishFirstPort();
  expect(fakeRuntime.maxActivePortCount()).toBe(3);
  await promise;
});

it('keeps valid siblings and fails only missing chunks', async () => {
  // Emit segment 0, finish with segment 1 missing.
  expect(result.succeeded).toEqual([segments[0]]);
  expect(result.failed).toEqual([segments[1]]);
});
```

Additional cases cover structured cache hits, oversized reassembly, Port error after a valid chunk, duplicate events, and `isActive` stopping new batch dispatch.

- [ ] **Step 2: Run batch-pool tests and verify RED**

Run: `pnpm test -- shared/fullpage/batch-pool.test.ts`

Expected: FAIL because `batch-pool.ts` does not exist.

- [ ] **Step 3: Implement batch Port client and three-worker scheduler**

```ts
export interface BatchPoolOptions {
  targetLang: string;
  concurrency?: 3;
  cache: Map<string, SemanticTranslation>;
  onSettled: (segment: SegmentRecord) => void;
  isActive?: () => boolean;
}

export async function runBatchPool(
  segments: SegmentRecord[],
  opts: BatchPoolOptions,
): Promise<TranslatePoolResult>;
```

Set segments to `translating` before Port dispatch. Validate and reassemble chunk slices by `(segmentId, partId, sliceIndex)`. Only set `translatedParts`, `translatedText`, cache, and `done` after all transport chunks for that semantic segment succeed. On batch error or missing IDs, fail only unresolved owner segments. Use three worker loops over packed batches so a fourth Port opens only after one of the first three closes.

- [ ] **Step 4: Write failing orchestrator path-selection and micro-batch tests**

```ts
it('uses semantic batch streaming for an active LLM source', async () => {
  mockCapabilities({ batchStream: true });
  document.body.innerHTML = '<p>Hello <strong>world</strong></p>';
  await start('bilingual');
  expect(__getState().records).toHaveLength(1);
  expect(browser.runtime.connect).toHaveBeenCalledWith({ name: 'fullpage-translate-batch-stream' });
});

it('keeps the legacy non-streaming path for a traditional source', async () => {
  mockCapabilities({ batchStream: false });
  await start('replace');
  expect(browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'translate' }));
  expect(browser.runtime.connect).not.toHaveBeenCalled();
});

it('coalesces viewport entries observed within 25 ms', async () => {
  enterViewport(outOfViewSegments);
  await vi.advanceTimersByTimeAsync(24);
  expect(browser.runtime.connect).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(browser.runtime.connect).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 5: Compose capability selection and a shared 25 ms queue**

At `doStart`, request `get-translation-capabilities`, select `collectSemanticSegments`/`runBatchPool` for LLM or legacy functions for traditional, and store the path for retry/dynamic nodes. Replace single-segment `enqueueSegments([seg])` viewport calls with a session-scoped queue flushed after 25 ms. Initial in-view segments may enqueue immediately because the packer already batches them. Clear the timer and queued segments in `handleRestore`, new-session startup, and `__reset`.

- [ ] **Step 6: Preserve progress, cache, retry, and stale-session semantics**

Use the existing `handleSettled` renderer callback for both pools. Add a structured LLM cache version prefix and keep the legacy string cache for traditional mode. Retry only failed semantic segments through `retryBatchSegments`. Continue checking generation and `isConnected` before any page mutation.

- [ ] **Step 7: Verify pool and orchestrator GREEN**

Run: `pnpm test -- shared/fullpage/batch-pool.test.ts shared/fullpage/orchestrator.test.ts shared/fullpage/translate-pool.test.ts && pnpm typecheck`

Expected: PASS for progressive rendering, concurrency 3, viewport priority, 25 ms grouping, dynamic content, cache, retry, restore, and all traditional regressions.

- [ ] **Step 8: Commit full-page composition**

```bash
git add shared/fullpage/batch-pool.ts shared/fullpage/batch-pool.test.ts shared/fullpage/types.ts shared/fullpage/orchestrator.ts shared/fullpage/orchestrator.test.ts
git commit -m "feat: stream full-page translation batches"
```

### Task 7: Prove Batch Count, Progressive Rendering, Semantic Grouping, and No Leakage in E2E

**Files:**
- Modify: `e2e/mock-server.ts`
- Modify: `e2e/fixtures/fullpage-test-page.html`
- Modify: `e2e/fullpage.spec.ts`

**Interfaces:**
- Extends mock OpenAI stream behavior only when the prompt contains the batch wire payload.
- Preserves existing selection-translation stream responses and traditional mock routes.

- [ ] **Step 1: Add failing E2E assertions before changing the mock response**

```ts
test('LLM full-page translation batches requests and reveals no reasoning', async ({ context, extensionId }) => {
  await configureMockProvider(context, extensionId);
  const page = await openTestPage(context);
  await triggerFullpageTranslate(context, 'bilingual');

  await expect(page.locator('#inline-paragraph + .llm-translator-block-host')).toHaveCount(1);
  await expect(page.locator('body')).not.toContainText('mock private reasoning');
  await expect(page.locator('body')).not.toContainText('</think>');
  expect(getRequestCount(CHAT_ROUTE)).toBeLessThan(INITIAL_REQUEST_COUNT);
});
```

Add a progressive assertion that the first semantic block is translated while a later block from the same provider response remains original.

- [ ] **Step 2: Run the focused E2E and verify RED**

Run: `pnpm build` then `pnpm exec playwright test e2e/fullpage.spec.ts --grep "batches requests|semantic inline|reasoning"`

Expected: FAIL because the mock emits the legacy fixed translation and each segment still has the old observable contract in the built extension.

- [ ] **Step 3: Extend the fixture and mock batch stream**

Add `#inline-paragraph` containing direct text plus `strong` and `a`. In `sendOpenAIStream`, detect the batch prompt, extract the serialized chunk input, emit a reasoning preamble first, then emit one schema-valid translated chunk object at a time with `CHUNK_DELAY_MS` between objects. Split at least one JSON object across two SSE deltas to exercise the real provider and object scanners together.

- [ ] **Step 4: Update legacy request-count expectations to batch semantics**

Replace exact per-segment counts only in LLM full-page cases. Assert one initial request when all fixture segments fit under 20/6000, no new request on mode switch/cache reuse, one grouped request for viewport entries within the window, and unchanged counts after restore. Keep traditional/selection tests unchanged.

- [ ] **Step 5: Run complete verification gates**

Run:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm e2e
```

Expected: all unit tests, typecheck, lint, Chrome MV3 build, and Playwright E2E pass with no warnings attributable to this change.

- [ ] **Step 6: Review final diff against the approved spec**

Run: `git diff --check && git status --short && git diff --stat be6946d..HEAD`

Confirm that every changed production file belongs to the file map, no Provider secrets are logged, and no generated build output is staged.

- [ ] **Step 7: Commit acceptance coverage**

```bash
git add e2e/mock-server.ts e2e/fixtures/fullpage-test-page.html e2e/fullpage.spec.ts
git commit -m "test: cover full-page batch streaming acceptance"
```
