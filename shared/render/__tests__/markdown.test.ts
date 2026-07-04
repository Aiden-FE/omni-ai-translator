// @vitest-environment jsdom
// renderMarkdown 单元测试 — 覆盖 sanitize 安全性 + 正常 markdown 渲染
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../markdown';

describe('renderMarkdown — XSS sanitize 安全性', () => {
  it('<script> 标签及内容被清除', () => {
    const html = renderMarkdown('<script>alert(1)</script>hello');
    expect(html).not.toContain('<script');
    // script 标签的内容也被 DOMPurify 移除
    expect(html).not.toContain('alert');
    // 非恶意文本保留
    expect(html).toContain('hello');
  });

  it('onerror 事件属性被清除(img 标签整体移除)', () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)">');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('alert');
  });

  it('javascript: 链接 href 被清除', () => {
    const md = '[click](javascript:alert(1))';
    const html = renderMarkdown(md);
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('alert');
    // 链接文本保留
    expect(html).toContain('click');
  });

  it('<iframe> 标签被清除', () => {
    const html = renderMarkdown('<iframe src="evil.com"></iframe>safe');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('evil.com');
    expect(html).toContain('safe');
  });

  it('<object> 标签被清除', () => {
    const html = renderMarkdown('<object data="evil.swf"></object>safe');
    expect(html).not.toContain('<object');
    expect(html).not.toContain('evil.swf');
    expect(html).toContain('safe');
  });

  it('<embed> 标签被清除', () => {
    const html = renderMarkdown('<embed src="evil.swf">safe');
    expect(html).not.toContain('<embed');
    expect(html).not.toContain('evil.swf');
    expect(html).toContain('safe');
  });

  it('on* 事件属性被清除(onclick/onmouseover)', () => {
    // p 在 ALLOWED_TAGS 中,仅 on* 属性应被移除,标签和文本保留
    const html = renderMarkdown('<p onmouseover="alert(1)">text</p>');
    expect(html).not.toContain('onmouseover');
    expect(html).not.toContain('alert');
    expect(html).toContain('text');
  });

  it('data: URL 链接被清除', () => {
    const md = '[link](data:text/html,<script>alert(1))';
    const html = renderMarkdown(md);
    expect(html).not.toContain('data:');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert');
  });

  it('混合恶意 payload 全部被清除', () => {
    const md = [
      '# 标题',
      '<script>alert(1)</script>',
      '<img src=x onerror="steal()">',
      '[evil](javascript:alert(1))',
      '<iframe src="evil.com"></iframe>',
      '正常文本',
    ].join('\n');
    const html = renderMarkdown(md);
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('steal');
    // 正常内容保留
    expect(html).toContain('标题');
    expect(html).toContain('正常文本');
  });
});

describe('renderMarkdown — 正常 markdown 渲染', () => {
  it('标题 h1-h3 正确渲染', () => {
    const md = '# 标题一\n## 标题二\n### 标题三';
    const html = renderMarkdown(md);
    expect(html).toContain('<h1>标题一</h1>');
    expect(html).toContain('<h2>标题二</h2>');
    expect(html).toContain('<h3>标题三</h3>');
  });

  it('标题 h4-h6 正确渲染', () => {
    const md = '#### h4\n##### h5\n###### h6';
    const html = renderMarkdown(md);
    expect(html).toContain('<h4>h4</h4>');
    expect(html).toContain('<h5>h5</h5>');
    expect(html).toContain('<h6>h6</h6>');
  });

  it('无序列表正确渲染', () => {
    const md = '- 项目一\n- 项目二\n- 项目三';
    const html = renderMarkdown(md);
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>项目一</li>');
    expect(html).toContain('<li>项目二</li>');
    expect(html).toContain('<li>项目三</li>');
    expect(html).toContain('</ul>');
  });

  it('有序列表正确渲染', () => {
    const md = '1. 第一\n2. 第二\n3. 第三';
    const html = renderMarkdown(md);
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>第一</li>');
    expect(html).toContain('<li>第二</li>');
    expect(html).toContain('<li>第三</li>');
    expect(html).toContain('</ol>');
  });

  it('加粗和斜体正确渲染', () => {
    const md = '这是 **加粗** 和 *斜体*';
    const html = renderMarkdown(md);
    expect(html).toContain('<strong>加粗</strong>');
    expect(html).toContain('<em>斜体</em>');
  });

  it('行内代码正确渲染', () => {
    const md = '使用 `npm install` 安装';
    const html = renderMarkdown(md);
    expect(html).toContain('<code>npm install</code>');
  });

  it('行内代码内 ** 不被加粗处理', () => {
    const md = '`**not bold**`';
    const html = renderMarkdown(md);
    expect(html).toContain('<code>**not bold**</code>');
    expect(html).not.toContain('<strong>');
  });

  it('代码块正确渲染(内容 escape,不做行内格式)', () => {
    const md = '```js\nconst x = "**not bold**";\n```';
    const html = renderMarkdown(md);
    expect(html).toContain('<pre><code>');
    expect(html).toContain('const x =');
    // 代码块内 ** 不被加粗处理
    expect(html).not.toContain('<strong>');
  });

  it('代码块内 HTML 标签被 escape(字面显示)', () => {
    const md = '```\n<div>not a tag</div>\n```';
    const html = renderMarkdown(md);
    expect(html).toContain('&lt;div&gt;');
    expect(html).not.toContain('<div>');
  });

  it('引用正确渲染', () => {
    const md = '> 这是一段引用';
    const html = renderMarkdown(md);
    expect(html).toContain('<blockquote>');
    expect(html).toContain('这是一段引用');
    expect(html).toContain('</blockquote>');
  });

  it('链接正确渲染并强制 target=_blank + rel=noopener', () => {
    const md = '[官网](https://example.com)';
    const html = renderMarkdown(md);
    expect(html).toContain('<a href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('>官网</a>');
  });

  it('段落正确渲染', () => {
    const md = '这是普通段落';
    const html = renderMarkdown(md);
    expect(html).toContain('<p>这是普通段落</p>');
  });

  it('多段落渲染', () => {
    const md = '第一段\n\n第二段';
    const html = renderMarkdown(md);
    expect(html).toContain('<p>第一段</p>');
    expect(html).toContain('<p>第二段</p>');
  });

  it('HTML 特殊字符被转义', () => {
    const md = 'a < b > c & d';
    const html = renderMarkdown(md);
    expect(html).toContain('&lt;');
    expect(html).toContain('&gt;');
    expect(html).toContain('&amp;');
    expect(html).not.toContain('a < b');
  });
});

describe('renderMarkdown — 边界场景', () => {
  it('空字符串返回空', () => {
    expect(renderMarkdown('')).toBe('');
  });

  it('纯文本(无 markdown 语法)渲染为段落', () => {
    const html = renderMarkdown('你好,世界');
    expect(html).toContain('<p>你好,世界</p>');
  });

  it('未闭合代码块仍渲染(防御)', () => {
    const md = '```\ncode without closing';
    const html = renderMarkdown(md);
    expect(html).toContain('<pre><code>');
    expect(html).toContain('code without closing');
  });

  it('纯空白行不产出空段落', () => {
    const html = renderMarkdown('\n\n\n');
    expect(html).not.toContain('<p>');
  });

  it('混合 markdown 结构综合渲染', () => {
    const md = [
      '# 配置',
      '启用 **流式** 并设置 `model`。',
      '- 打开 popup',
      '- 点击 *添加*',
      '',
      '```js',
      'const t = await translate(text)',
      '```',
      '> 注意事项',
    ].join('\n');
    const html = renderMarkdown(md);
    expect(html).toContain('<h1>配置</h1>');
    expect(html).toContain('<strong>流式</strong>');
    expect(html).toContain('<code>model</code>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>打开 popup</li>');
    expect(html).toContain('<em>添加</em>');
    expect(html).toContain('<pre><code>');
    expect(html).toContain('const t = await translate(text)');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('注意事项');
  });
});
