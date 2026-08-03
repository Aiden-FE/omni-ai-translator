// 页面分段收集器 - 从 DOM 递归遍历提取可翻译文本段

import type { SegmentRecord, SegmenterOptions } from './types';

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

/**
 * 从 root 递归遍历，收集可翻译文本段。
 *
 * 「段」= 自身直接子文本节点拼接（trim 后）非空且含字母的块级/行内元素。
 * 嵌套允许：父段只含自己的直接文本节点（不含子元素内文本），并对子元素继续递归，
 * 因此即便父元素直接文本无字母/为空/非块行内，仍会向下递归收集子元素中的段。
 *
 * @param root - 遍历根节点（可为 Document / DocumentFragment / Element）
 * @param options - 分段选项
 * @returns 分段记录数组
 */
export function collectSegments(
  root: ParentNode,
  options: SegmenterOptions = {},
): SegmentRecord[] {
  const segments: SegmentRecord[] = [];

  function traverse(node: Node): void {
    // 文本节点由其父元素处理
    if (node.nodeType === Node.TEXT_NODE) {
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;

      // 剪枝：扩展注入子树（自身或祖先带 data-llm-translator）——整棵子树不递归
      if (shouldSkipElement(el) || hasTranslatorAncestor(el)) {
        return;
      }
      // 剪枝：跳过标签（SCRIPT/STYLE/...）——内部不递归
      if (SKIP_TAGS.has(el.tagName)) {
        return;
      }
      // 剪枝：display:none 不可见子树
      if (!options.skipVisibilityCheck && el instanceof HTMLElement && isHiddenByDisplay(el)) {
        return;
      }

      // 尝试从直接子文本节点构造段。
      // 注意：此处不 return——即便不构成段（无字母/为空/非块行内），也继续向下递归，
      // 以满足「嵌套允许」：父元素自身不成段时，子元素仍可独立成段。
      const textNodes = getDirectTextNodes(el);
      if (textNodes.length > 0) {
        const rawText = textNodes.map((tn) => tn.textContent ?? '').join('');
        const trimmedText = rawText.trim();

        if (
          trimmedText.length > 0 &&
          hasLetterChar(trimmedText) &&
          (isBlockElement(el) || isInlineElement(el))
        ) {
          segments.push({
            id: generateSegmentId(el as HTMLElement, trimmedText),
            el: el as HTMLElement,
            textNodes,
            originalText: trimmedText,
            status: 'pending',
          });
        }
      }
    }

    // 递归遍历子节点：元素 / 文档 / 文档片段均递归
    // （跳过标签与注入子树已在上方剪枝处 return，不会进入此分支）
    if (
      node.nodeType === Node.ELEMENT_NODE ||
      node.nodeType === Node.DOCUMENT_NODE ||
      node.nodeType === Node.DOCUMENT_FRAGMENT_NODE
    ) {
      for (const child of node.childNodes) {
        traverse(child);
      }
    }
  }

  traverse(root);
  return segments;
}
