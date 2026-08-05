// @vitest-environment jsdom
// 分段收集器单元测试

import { describe, it, expect, beforeEach } from 'vitest';
import { collectSegments, collectSemanticSegments } from './segmenter';

describe('collectSegments', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('基本段落 → 收集到段', () => {
    document.body.innerHTML = '<p>Hello world</p>';
    const segments = collectSegments(document.body);
    expect(segments).toHaveLength(1);
    expect(segments[0].originalText).toBe('Hello world');
    expect(segments[0].status).toBe('pending');
    expect(segments[0].textNodes.length).toBe(1);
  });

  it('多个段落 → 每个独立段', () => {
    document.body.innerHTML = '<p>First</p><p>Second</p><p>Third</p>';
    const segments = collectSegments(document.body);
    expect(segments).toHaveLength(3);
    expect(segments.map((s) => s.originalText)).toEqual(['First', 'Second', 'Third']);
  });

  it('嵌套块元素 → 只收集直接文本节点', () => {
    // <div>outer<span>inner</span></div>
    // div 的直接文本节点为空（只有 span 子元素），所以 div 不成段
    // span 有直接文本 "inner"，成段
    document.body.innerHTML = '<div>outer<span>inner</span></div>';
    const segments = collectSegments(document.body);
    // div 的直接文本节点被 "outer" 包裹吗？不，innerHTML 中 "outer" 是 div 的直接子文本节点
    // 所以 div 有直接文本节点 "outer" + span 子元素
    // div 是块级元素，有直接文本 "outer"，应成段
    // span 有直接文本 "inner"，也应成段
    expect(segments).toHaveLength(2);
    const texts = segments.map((s) => s.originalText);
    expect(texts).toContain('outer');
    expect(texts).toContain('inner');
  });

  it('行内元素（a/button/span）→ 成段', () => {
    document.body.innerHTML = '<span>inline text</span><a href="#">link</a><button>btn</button>';
    const segments = collectSegments(document.body);
    expect(segments).toHaveLength(3);
    const texts = segments.map((s) => s.originalText);
    expect(texts).toContain('inline text');
    expect(texts).toContain('link');
    expect(texts).toContain('btn');
  });

  it('跳过 SCRIPT 元素', () => {
    document.body.innerHTML = '<p>visible</p><script>var x = "script text";</script><p>also visible</p>';
    const segments = collectSegments(document.body);
    expect(segments).toHaveLength(2);
    const texts = segments.map((s) => s.originalText);
    expect(texts).toEqual(['visible', 'also visible']);
  });

  it('跳过 STYLE 元素', () => {
    document.body.innerHTML = '<p>visible</p><style>.cls { color: red; }</style><p>also visible</p>';
    const segments = collectSegments(document.body);
    expect(segments).toHaveLength(2);
    const texts = segments.map((s) => s.originalText);
    expect(texts).toEqual(['visible', 'also visible']);
  });

  it('跳过 TEMPLATE 元素', () => {
    document.body.innerHTML = '<p>visible</p><template><p>hidden in template</p></template><p>also visible</p>';
    const segments = collectSegments(document.body);
    expect(segments).toHaveLength(2);
    const texts = segments.map((s) => s.originalText);
    expect(texts).toEqual(['visible', 'also visible']);
  });

  it('跳过 TEXTAREA 元素', () => {
    document.body.innerHTML = '<p>visible</p><textarea>user input text</textarea><p>also visible</p>';
    const segments = collectSegments(document.body);
    expect(segments).toHaveLength(2);
    const texts = segments.map((s) => s.originalText);
    expect(texts).toEqual(['visible', 'also visible']);
  });

  it('跳过 INPUT 元素', () => {
    document.body.innerHTML = '<p>visible</p><input value="input value" /><p>also visible</p>';
    const segments = collectSegments(document.body);
    expect(segments).toHaveLength(2);
    const texts = segments.map((s) => s.originalText);
    expect(texts).toEqual(['visible', 'also visible']);
  });

  it('跳过 IFRAME 元素', () => {
    document.body.innerHTML = '<p>visible</p><iframe src="about:blank"><p>nested</p></iframe><p>also visible</p>';
    const segments = collectSegments(document.body);
    expect(segments).toHaveLength(2);
    const texts = segments.map((s) => s.originalText);
    expect(texts).toEqual(['visible', 'also visible']);
  });

  it('跳过 SVG 元素', () => {
    document.body.innerHTML = '<p>visible</p><svg><text>svg text</text></svg><p>also visible</p>';
    const segments = collectSegments(document.body);
    expect(segments).toHaveLength(2);
    const texts = segments.map((s) => s.originalText);
    expect(texts).toEqual(['visible', 'also visible']);
  });

  it('跳过 data-llm-translator 标记的子树', () => {
    document.body.innerHTML = '<p>visible</p><div data-llm-translator><p>injected</p><span>also injected</span></div><p>also visible</p>';
    const segments = collectSegments(document.body);
    expect(segments).toHaveLength(2);
    const texts = segments.map((s) => s.originalText);
    expect(texts).toEqual(['visible', 'also visible']);
  });

  it('跳过纯数字/符号文本', () => {
    document.body.innerHTML = '<p>123</p><p>abc</p><p>456!@#</p><p>hello7world</p>';
    const segments = collectSegments(document.body);
    // "123" 无字母 → 跳过
    // "abc" 有字母 → 保留
    // "456!@#" 无字母 → 跳过
    // "hello7world" 有字母 → 保留
    expect(segments).toHaveLength(2);
    const texts = segments.map((s) => s.originalText);
    expect(texts).toEqual(['abc', 'hello7world']);
  });

  it('跳过空文本', () => {
    document.body.innerHTML = '<p>   </p><p>has text</p><p></p>';
    const segments = collectSegments(document.body);
    expect(segments).toHaveLength(1);
    expect(segments[0].originalText).toBe('has text');
  });

  it('跳过不可见元素（display:none）', () => {
    document.body.innerHTML = '<p>visible</p><p style="display:none">hidden</p><p>also visible</p>';
    const segments = collectSegments(document.body);
    expect(segments).toHaveLength(2);
    const texts = segments.map((s) => s.originalText);
    expect(texts).toEqual(['visible', 'also visible']);
  });

  it('跳过 NOSCRIPT 和 CANVAS 元素', () => {
    document.body.innerHTML = '<p>visible</p><noscript>noscript text</noscript><canvas>canvas text</canvas><p>also visible</p>';
    const segments = collectSegments(document.body);
    expect(segments).toHaveLength(2);
    const texts = segments.map((s) => s.originalText);
    expect(texts).toEqual(['visible', 'also visible']);
  });

  it('跳过 SELECT 元素', () => {
    document.body.innerHTML = '<p>visible</p><select><option>option text</option></select><p>also visible</p>';
    const segments = collectSegments(document.body);
    expect(segments).toHaveLength(2);
    const texts = segments.map((s) => s.originalText);
    expect(texts).toEqual(['visible', 'also visible']);
  });

  it('嵌套行内元素 → 各自独立段', () => {
    document.body.innerHTML = '<p><strong>bold</strong> text <a href="#">link</a></p>';
    const segments = collectSegments(document.body);
    // p 有直接文本 " text "（trim 后 "text"），同时有 strong 和 a 子元素
    // strong 有直接文本 "bold"，成段
    // a 有直接文本 "link"，成段
    expect(segments).toHaveLength(3);
    const texts = segments.map((s) => s.originalText);
    expect(texts).toContain('text');
    expect(texts).toContain('bold');
    expect(texts).toContain('link');
  });

  it('LI 元素 → 成段', () => {
    document.body.innerHTML = '<ul><li>item 1</li><li>item 2</li></ul>';
    const segments = collectSegments(document.body);
    expect(segments).toHaveLength(2);
    const texts = segments.map((s) => s.originalText);
    expect(texts).toEqual(['item 1', 'item 2']);
  });

  it('TD 元素 → 成段', () => {
    document.body.innerHTML = '<table><tr><td>cell 1</td><td>cell 2</td></tr></table>';
    const segments = collectSegments(document.body);
    expect(segments).toHaveLength(2);
    const texts = segments.map((s) => s.originalText);
    expect(texts).toEqual(['cell 1', 'cell 2']);
  });

  it('SKIP_TAGS 元素内部不递归', () => {
    document.body.innerHTML = '<p>before</p><script>var x = "<p>inside script</p>";</script><p>after</p>';
    const segments = collectSegments(document.body);
    expect(segments).toHaveLength(2);
    const texts = segments.map((s) => s.originalText);
    expect(texts).toEqual(['before', 'after']);
  });

  it('textNodes 保存直接子文本节点引用', () => {
    document.body.innerHTML = '<p>hello<span>world</span></p>';
    const segments = collectSegments(document.body);
    const pSegment = segments.find((s) => s.el.tagName === 'P');
    expect(pSegment).toBeDefined();
    expect(pSegment!.textNodes.length).toBe(1);
    expect(pSegment!.textNodes[0].textContent).toBe('hello');
  });

  it('skipVisibilityCheck=true → 不跳过 display:none', () => {
    document.body.innerHTML = '<p>visible</p><p style="display:none">hidden</p><p>also visible</p>';
    const segments = collectSegments(document.body, { skipVisibilityCheck: true });
    expect(segments).toHaveLength(3);
    const texts = segments.map((s) => s.originalText);
    expect(texts).toEqual(['visible', 'hidden', 'also visible']);
  });

  it('H1-H6 标题 → 成段', () => {
    document.body.innerHTML = '<h1>Title 1</h1><h2>Title 2</h2><h3>Title 3</h3>';
    const segments = collectSegments(document.body);
    expect(segments).toHaveLength(3);
    const texts = segments.map((s) => s.originalText);
    expect(texts).toEqual(['Title 1', 'Title 2', 'Title 3']);
  });

  it('BLOCKQUOTE 和 FIGCAPTION → 成段', () => {
    document.body.innerHTML = '<blockquote>quoted text</blockquote><figure><figcaption>caption text</figcaption></figure>';
    const segments = collectSegments(document.body);
    expect(segments).toHaveLength(2);
    const texts = segments.map((s) => s.originalText);
    expect(texts).toEqual(['quoted text', 'caption text']);
  });

  it('DIV 元素 → 成段', () => {
    document.body.innerHTML = '<div>div text</div>';
    const segments = collectSegments(document.body);
    expect(segments).toHaveLength(1);
    expect(segments[0].originalText).toBe('div text');
  });

  it('非块级/非行内的元素（如 IMG 等）→ 不成段', () => {
    document.body.innerHTML = '<p>para</p><img src="test.png" alt="image" />';
    const segments = collectSegments(document.body);
    expect(segments).toHaveLength(1);
    expect(segments[0].originalText).toBe('para');
  });

  it('根节点为 document 时遍历全页', () => {
    document.body.innerHTML = '<p>body para</p>';
    const segments = collectSegments(document);
    expect(segments).toHaveLength(1);
    expect(segments[0].originalText).toBe('body para');
  });

  it('根节点为 DocumentFragment 时遍历', () => {
    const fragment = document.createDocumentFragment();
    const p = document.createElement('p');
    p.textContent = 'fragment para';
    fragment.appendChild(p);
    const segments = collectSegments(fragment);
    expect(segments).toHaveLength(1);
    expect(segments[0].originalText).toBe('fragment para');
  });

  it('重复文本的不同元素 -> 各自独立段（id 基于 DOM 路径唯一）', () => {
    document.body.innerHTML = '<ul><li>item</li><li>item</li><li>item</li></ul>';
    const segments = collectSegments(document.body);
    expect(segments).toHaveLength(3);
    expect(segments.every((s) => s.originalText === 'item')).toBe(true);
    // 三个段的 id 互不相同（基于 DOM 路径，非文本）
    const ids = segments.map((s) => s.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('无字母直接文本的父元素仍递归收集子元素文本', () => {
    // div 直接文本 "123" 无字母 -> 不成段，但嵌套允许，仍递归到 span
    document.body.innerHTML = '<div>123<span>real text</span></div>';
    const segments = collectSegments(document.body);
    expect(segments).toHaveLength(1);
    expect(segments[0].originalText).toBe('real text');
  });
});

describe('collectSemanticSegments', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

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

  it('keeps collectSegments direct-node and inline records for traditional providers', () => {
    document.body.innerHTML = '<p>Hello <strong>secure AI</strong> world</p>';
    expect(collectSegments(document.body).map((segment) => ({
      tag: segment.el.tagName,
      text: segment.originalText,
    }))).toEqual([
      { tag: 'P', text: 'Hello  world' },
      { tag: 'STRONG', text: 'secure AI' },
    ]);
  });
});
