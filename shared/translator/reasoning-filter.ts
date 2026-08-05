type ReasoningTagName = 'think' | 'analysis';

interface ReasoningTag {
  readonly prefix: string;
  readonly kind: 'open' | 'close' | 'control';
  readonly name?: ReasoningTagName;
}

const REASONING_TAGS: readonly ReasoningTag[] = [
  { prefix: '<think', kind: 'open', name: 'think' },
  { prefix: '</think', kind: 'close', name: 'think' },
  { prefix: '<analysis', kind: 'open', name: 'analysis' },
  { prefix: '</analysis', kind: 'close', name: 'analysis' },
  { prefix: '</s', kind: 'control' },
];

type TagInspection = ReasoningTag | 'potential' | undefined;

function inspectTagPrefix(value: string, tag: ReasoningTag): TagInspection {
  const normalized = value.toLowerCase();
  if (tag.prefix.startsWith(normalized)) return 'potential';
  if (!normalized.startsWith(tag.prefix)) return undefined;

  const suffix = normalized.slice(tag.prefix.length);
  if (!suffix) return 'potential';
  if (suffix[0] !== '>' && !/\s/u.test(suffix[0])) return undefined;
  return suffix.includes('>') ? tag : 'potential';
}

function inspectTag(value: string): TagInspection {
  let hasPotentialMatch = false;
  for (const tag of REASONING_TAGS) {
    const match = inspectTagPrefix(value, tag);
    if (match && match !== 'potential') return match;
    hasPotentialMatch ||= match === 'potential';
  }
  return hasPotentialMatch ? 'potential' : undefined;
}

/**
 * Removes model reasoning markup from a completed provider response.
 *
 * The stream filter is also used here so an unterminated reasoning block cannot
 * escape through a non-streaming provider response.
 */
export function sanitizeReasoningArtifacts(text: string): string {
  const filter = createReasoningStreamFilter(() => undefined);
  filter.push(text);
  return filter.finish();
}

/**
 * Filters reasoning artifacts from provider deltas without exposing tentative
 * tag prefixes or the contents of an unfinished reasoning block.
 */
export function createReasoningStreamFilter(onText: (text: string) => void): {
  push(delta: string): void;
  finish(): string;
} {
  let tagBuffer = '';
  let hiddenTags: ReasoningTagName[] = [];
  let pendingWhitespace = '';
  let visibleText = '';
  let pendingEmission = '';
  let hasVisibleText = false;
  let finished = false;

  const emitVisible = (text: string) => {
    for (const character of text) {
      if (/\s/u.test(character)) {
        pendingWhitespace += character;
        continue;
      }

      const prefix = hasVisibleText ? pendingWhitespace : '';
      const emitted = `${prefix}${character}`;
      pendingWhitespace = '';
      hasVisibleText = true;
      visibleText += emitted;
      pendingEmission += emitted;
    }
  };

  const flushEmission = () => {
    if (!pendingEmission) return;
    onText(pendingEmission);
    pendingEmission = '';
  };

  const consumeTagBuffer = () => {
    const tag = inspectTag(tagBuffer);
    if (!tag) {
      const text = tagBuffer;
      tagBuffer = '';
      if (hiddenTags.length === 0) emitVisible(text);
      return;
    }
    if (tag === 'potential') return;

    tagBuffer = '';
    if (tag.kind === 'open' && tag.name) {
      hiddenTags.push(tag.name);
      return;
    }
    if (tag.kind === 'close' && tag.name && hiddenTags.at(-1) === tag.name) {
      hiddenTags = hiddenTags.slice(0, -1);
    }
  };

  return {
    push(delta: string) {
      if (finished) return;

      for (const character of delta) {
        if (tagBuffer) {
          tagBuffer += character;
          consumeTagBuffer();
          continue;
        }

        if (character === '<') {
          tagBuffer = character;
          continue;
        }

        if (hiddenTags.length === 0) emitVisible(character);
      }
      flushEmission();
    },
    finish() {
      if (finished) return visibleText;

      tagBuffer = '';
      flushEmission();
      pendingWhitespace = '';
      finished = true;
      return visibleText;
    },
  };
}
