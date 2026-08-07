// 页面分段收集器 - 从 DOM 递归遍历提取可翻译文本段
//
// 本模块对外提供两类 API:
// 1. 同步收集 (collectSegments / collectSemanticSegments): 返回完整数组,供一次性调用。
// 2. 回调式遍历 (walkSegments / walkSemanticSegments): 供需要逐段处理的简单场景。
// 3. 异步迭代器 (walkSegmentsGen / walkSemanticSegmentsGen): 供 chunker 等需要在
//    遍历过程中让出主线程的场景;generator 在每个段之间暂停,调用方可插入 idle 调度。

import type { SegmentRecord, SegmenterOptions, SegmentTextPart } from './types';

/** 应跳过的元素标签名集合 */
const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'TEXTAREA',
  'INPUT',
  'SELECT',
  'CANVAS',
  'IFRAME',
  'SVG',
]);

/** 块级元素标签名集合 */
const BLOCK_TAGS = new Set([
  'P',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'LI',
  'TD', 'TH',
  'BLOCKQUOTE',
  'FIGCAPTION',
  'DIV',
  'SECTION',
  'ARTICLE',
  'HEADER',
  'FOOTER',
  'ASIDE',
  'MAIN',
  'NAV',
  'PRE',
  'CODE',
  'UL', 'OL',
  'DL', 'DT', 'DD',
  'HR',
  'FIELDSET',
  'LEGEND',
  'CAPTION',
  'TR',
]);

/** 行内元素标签名集合（含自身文本的也会成段） */
const INLINE_TAGS = new Set([
  'A',
  'BUTTON',
  'SPAN',
  'LABEL',
  'EM',
  'STRONG',
  'I',
  'B',
  'U',
  'SMALL',
  'SUB',
  'SUP',
  'MARK',
  'INS',
  'DEL',
  'ABBR',
  'CITE',
  'CODE',
  'SAMP',
  'KBD',
  'VAR',
  'TIME',
  'DATA',
  'BDO',
]);

/** 判断元素是否带 data-llm-translator 标记（扩展注入子树） */
function shouldSkipElement(el: Element): boolean {
  return el.hasAttribute('data-llm-translator');
}

/**
 * 判断元素是否位于 data-llm-translator 标记的子树内。
 * 防御用途：当遍历根本身位于注入子树内部（调用方切入）时仍能排除整棵子树。
 * 正常自顶向下遍历时，注入元素在自身处即被 shouldSkipElement 剪枝，不会触达后代。
 */
function hasTranslatorAncestor(el: Element): boolean {
  let parent = el.parentElement;
  while (parent) {
    if (shouldSkipElement(parent)) {
      return true;
    }
    parent = parent.parentElement;
  }
  return false;
}

/** 判断元素是否块级 */
function isBlockElement(el: Element): boolean {
  return BLOCK_TAGS.has(el.tagName);
}

/** 判断元素是否行内 */
function isInlineElement(el: Element): boolean {
  return INLINE_TAGS.has(el.tagName);
}

/** 语义块边界不包含同时声明为行内元素的 CODE。 */
function isSemanticBlockElement(el: Element): boolean {
  return isBlockElement(el) && !isInlineElement(el);
}

/**
 * 判断元素是否 display:none（不可见）。
 * 启发式：getClientRects().length === 0 时再校验 getComputedStyle().display === 'none'，
 * 避免 jsdom（无布局、getClientRects 恒空）把所有元素误判为不可见。
 */
function isHiddenByDisplay(el: Element): boolean {
  if (typeof window === 'undefined' || !window.getComputedStyle) {
    return false;
  }
  try {
    const rectCount = el.getClientRects().length;
    if (rectCount === 0) {
      const style = window.getComputedStyle(el);
      if (style.display === 'none') {
        return true;
      }
    }
  } catch {
    // getComputedStyle 可能失败，保守视为可见
  }
  return false;
}

/** 判断文本是否包含字母字符（\p{L}/u 判定，跳过纯数字/符号文本） */
function hasLetterChar(text: string): boolean {
  return /\p{L}/u.test(text);
}

/** 收集一个元素的所有直接子文本节点 */
function getDirectTextNodes(el: Node): Text[] {
  const textNodes: Text[] = [];
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      textNodes.push(child as Text);
    }
  }
  return textNodes;
}

/** 计算元素在同标签兄弟中的序号（用于 DOM 路径，保证路径唯一） */
function indexAmongTagSiblings(el: Element): number {
  const parent = el.parentNode;
  if (!parent) {
    return 0;
  }
  let index = 0;
  for (const child of parent.childNodes) {
    if (child === el) {
      break;
    }
    if (child instanceof Element && child.tagName === el.tagName) {
      index++;
    }
  }
  return index;
}

/** 构建元素的 DOM 路径（如 html[0]/body[0]/p[1]），逐层带同标签序号以保证唯一 */
function buildDomPath(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur) {
    parts.unshift(`${cur.tagName.toLowerCase()}[${indexAmongTagSiblings(cur)}]`);
    cur = cur.parentElement;
  }
  return parts.join('/');
}

/** 文本哈希（确定性 32 位 -> base36，供 id 区分同路径不同文本） */
function hashText(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/** 生成段 ID：基于 DOM 路径 + 文本哈希（唯一标识） */
function generateSegmentId(el: HTMLElement, text: string): string {
  return `${buildDomPath(el)}:${hashText(text)}`;
}

/** 判断语义收集时是否应剪枝当前元素及其全部子树。 */
function shouldPruneSemanticElement(el: Element, options: SegmenterOptions): boolean {
  return (
    shouldSkipElement(el) ||
    hasTranslatorAncestor(el) ||
    SKIP_TAGS.has(el.tagName) ||
    (!options.skipVisibilityCheck && el instanceof HTMLElement && isHiddenByDisplay(el))
  );
}

/**
 * 收集一个语义所有者的文本节点，穿透行内后代并在嵌套块级元素前停止。
 * 调用方已验证 owner 可参与收集，因此此处只处理其子树边界和剪枝规则。
 */
function getSemanticTextNodes(owner: Element, options: SegmenterOptions): Text[] {
  const textNodes: Text[] = [];

  function traverse(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      textNodes.push(node as Text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as Element;
    if (shouldPruneSemanticElement(el, options) || isSemanticBlockElement(el)) {
      return;
    }
    for (const child of el.childNodes) {
      traverse(child);
    }
  }

  for (const child of owner.childNodes) {
    traverse(child);
  }
  return textNodes;
}

/** flat 段构造工具: 直接子文本节点拼接,有字母且 (块级|行内)。 */
function buildFlatSegment(el: HTMLElement, textNodes: Text[]): SegmentRecord | null {
  if (textNodes.length === 0) return null;
  const rawText = textNodes.map((tn) => tn.textContent ?? '').join('');
  const trimmedText = rawText.trim();
  if (
    trimmedText.length === 0
    || !hasLetterChar(trimmedText)
    || (!isBlockElement(el) && !isInlineElement(el))
  ) {
    return null;
  }
  return {
    id: generateSegmentId(el, trimmedText),
    el,
    textNodes,
    originalText: trimmedText,
    status: 'pending',
  };
}

/** semantic 段构造工具: 收集 owner 的所有穿透文本,有字母且 trim 非空。 */
function buildSemanticSegment(el: HTMLElement, options: SegmenterOptions): SegmentRecord | null {
  const textNodes = getSemanticTextNodes(el, options);
  const rawText = textNodes.map((node) => node.data).join('');
  const originalText = rawText.trim();
  if (originalText.length === 0 || !hasLetterChar(originalText)) return null;
  const parts: SegmentTextPart[] = textNodes.map((node, id) => ({
    id,
    node,
    sourceText: node.data,
  }));
  return {
    id: generateSegmentId(el, originalText),
    el,
    textNodes,
    originalText,
    parts,
    status: 'pending',
  };
}

/**
 * 异步迭代器: 深度优先遍历 DOM, 逐段 yield SegmentRecord。
 * 供 chunker 在 walk 过程中让出主线程使用; 普通调用方请用 collectSegments 或 walkSegments。
 */
export function* walkSegmentsGen(
  root: ParentNode,
  options: SegmenterOptions = {},
): Generator<SegmentRecord> {
  function* traverse(node: Node): Generator<SegmentRecord> {
    if (node.nodeType === Node.TEXT_NODE) return;

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      if (shouldSkipElement(el) || hasTranslatorAncestor(el)) return;
      if (SKIP_TAGS.has(el.tagName)) return;
      if (!options.skipVisibilityCheck && el instanceof HTMLElement && isHiddenByDisplay(el)) {
        return;
      }
      const textNodes = getDirectTextNodes(el);
      if (textNodes.length > 0) {
        const seg = buildFlatSegment(el as HTMLElement, textNodes);
        if (seg) yield seg;
      }
    }

    if (
      node.nodeType === Node.ELEMENT_NODE
      || node.nodeType === Node.DOCUMENT_NODE
      || node.nodeType === Node.DOCUMENT_FRAGMENT_NODE
    ) {
      for (const child of node.childNodes) {
        yield* traverse(child);
      }
    }
  }
  yield* traverse(root);
}

/**
 * 异步迭代器: 语义段深度优先遍历。
 * 一个可翻译块拥有其所有行内后代文本,但不跨越嵌套块级边界。
 */
export function* walkSemanticSegmentsGen(
  root: ParentNode,
  options: SegmenterOptions = {},
): Generator<SegmentRecord> {
  function* traverse(node: Node, ownedBySemanticOwner: boolean): Generator<SegmentRecord> {
    if (node.nodeType === Node.TEXT_NODE) return;

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      if (shouldPruneSemanticElement(el, options)) return;

      const isBlockOwner = isSemanticBlockElement(el);
      const isStandaloneInlineOwner = !ownedBySemanticOwner && isInlineElement(el);
      const isSemanticOwner = isBlockOwner || isStandaloneInlineOwner;
      if (isSemanticOwner) {
        const seg = buildSemanticSegment(el as HTMLElement, options);
        if (seg) yield seg;
      }

      for (const child of el.childNodes) {
        const startsNestedBlock =
          child.nodeType === Node.ELEMENT_NODE && isSemanticBlockElement(child as Element);
        yield* traverse(child, startsNestedBlock ? false : ownedBySemanticOwner || isSemanticOwner);
      }
      return;
    }

    if (node.nodeType === Node.DOCUMENT_NODE || node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      for (const child of node.childNodes) {
        yield* traverse(child, false);
      }
    }
  }
  yield* traverse(root, false);
}

/**
 * 从 root 递归遍历,同步收集所有可翻译文本段并返回数组。
 * @param root - 遍历根节点 (可为 Document / DocumentFragment / Element)
 * @param options - 分段选项
 */
export function collectSegments(
  root: ParentNode,
  options: SegmenterOptions = {},
): SegmentRecord[] {
  return Array.from(walkSegmentsGen(root, options));
}

export function collectSemanticSegments(
  root: ParentNode,
  options: SegmenterOptions = {},
): SegmentRecord[] {
  return Array.from(walkSemanticSegmentsGen(root, options));
}

/** 回调式遍历: 同步逐段回调(无让出,供不需要分片的简单场景)。 */
export function walkSegments(
  root: ParentNode,
  callback: (seg: SegmentRecord) => void,
  options: SegmenterOptions = {},
): void {
  for (const seg of walkSegmentsGen(root, options)) {
    callback(seg);
  }
}

export function walkSemanticSegments(
  root: ParentNode,
  callback: (seg: SegmentRecord) => void,
  options: SegmenterOptions = {},
): void {
  for (const seg of walkSemanticSegmentsGen(root, options)) {
    callback(seg);
  }
}
