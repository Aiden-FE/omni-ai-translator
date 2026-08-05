type ReasoningTagName = 'think' | 'analysis';

interface ReasoningTag {
  readonly text: string;
  readonly kind: 'open' | 'close' | 'control';
  readonly name?: ReasoningTagName;
}

const REASONING_TAGS: readonly ReasoningTag[] = [
  { text: '<think>', kind: 'open', name: 'think' },
  { text: '</think>', kind: 'close', name: 'think' },
  { text: '<analysis>', kind: 'open', name: 'analysis' },
  { text: '</analysis>', kind: 'close', name: 'analysis' },
  { text: '</s>', kind: 'control' },
];

function findTag(value: string): ReasoningTag | undefined {
  const normalized = value.toLowerCase();
  return REASONING_TAGS.find((tag) => tag.text === normalized);
}

function isTagPrefix(value: string): boolean {
  const normalized = value.toLowerCase();
  return REASONING_TAGS.some((tag) => tag.text.startsWith(normalized));
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
    if (!isTagPrefix(tagBuffer)) {
      const text = tagBuffer;
      tagBuffer = '';
      if (hiddenTags.length === 0) emitVisible(text);
      return;
    }

    const tag = findTag(tagBuffer);
    if (!tag) return;

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

      if (tagBuffer && hiddenTags.length === 0) emitVisible(tagBuffer);
      tagBuffer = '';
      flushEmission();
      pendingWhitespace = '';
      finished = true;
      return visibleText;
    },
  };
}
