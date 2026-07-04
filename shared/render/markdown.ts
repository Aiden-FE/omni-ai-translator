// 译文 markdown 可读渲染 — 轻量解析器 + DOMPurify sanitize
// 用于翻译浮层 done 阶段:将 LLM 译文(不可信)解析为 HTML 并 sanitize 后注入浮层。
// 安全模型:parseMarkdown 产出 HTML(代码块/行内代码 escape,普通文本不 escape)
// → DOMPurify 清除恶意标签/属性/协议(script 标签及内容被移除,非白名单标签被移除)。
// DOMPurify 是最终安全门,解析器 bug 不影响安全性。

import DOMPurify from 'dompurify';

/** HTML 实体转义:仅用于代码块/行内代码内容(需字面显示) */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

// 占位符分隔符:使用空字节 \x00,不会出现在正常翻译文本中
const PH_START = '\x00';
const PH_END = '\x00';

/**
 * 行内 markdown 解析(输入为原始文本,不预转义):
 * 1. 行内代码(`code`) → 先提取为占位符,内容 escape(字面显示),保护不被 bold/italic 误匹配
 * 2. 加粗(**text**) → <strong>
 * 3. 斜体(*text*) → <em>
 * 4. 链接([text](url)) → <a href>
 * 5. 还原行内代码占位符 → <code>(内容已 escape)</code>
 *
 * 普通文本不 escape:交由 DOMPurify sanitize(移除 script 等恶意标签及内容)。
 */
function parseInline(s: string): string {
  const codeChunks: string[] = [];
  // 行内代码优先提取,内容 escape(字面显示),避免 code 内 ** 被 bold 正则误匹配
  let out = s.replace(/`([^`]+)`/g, (_, code: string) => {
    codeChunks.push(escapeHtml(code));
    return `${PH_START}C${codeChunks.length - 1}${PH_END}`;
  });
  // 加粗
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // 斜体
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // 链接
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // 还原行内代码
  const phPattern = new RegExp(`${PH_START}C(\\d+)${PH_END}`, 'g');
  out = out.replace(phPattern, (_, i: string) => `<code>${codeChunks[Number(i)]}</code>`);
  return out;
}

/**
 * 轻量 markdown 块级解析器:
 * 支持标题(h1-h6)、无序列表(减号/星号/加号)、有序列表(数字句点)、代码块(三反引号)、引用(>)、段落。
 * 普通文本不 escape(交由 DOMPurify sanitize);代码块内容 escape(字面显示)。
 */
function parseMarkdown(md: string): string {
  const lines = md.split('\n');
  let html = '';
  let inCode = false;
  let codeBuf: string[] = [];
  let inUl = false;
  let inOl = false;

  function closeList(): void {
    if (inUl) { html += '</ul>'; inUl = false; }
    if (inOl) { html += '</ol>'; inOl = false; }
  }

  for (const line of lines) {
    // 代码块围栏 ```(允许末尾语言标识)
    if (line.trim().startsWith('```')) {
      if (!inCode) {
        closeList();
        inCode = true;
        codeBuf = [];
      } else {
        html += `<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`;
        inCode = false;
      }
      continue;
    }

    // 代码块内:原样收集(仅 escape,不做行内格式)
    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    // 标题 h1-h6
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      html += `<h${level}>${parseInline(headingMatch[2])}</h${level}>`;
      continue;
    }

    // 无序列表(减号/星号/加号)
    if (/^[-*+]\s+/.test(line)) {
      if (!inUl) { closeList(); html += '<ul>'; inUl = true; }
      html += `<li>${parseInline(line.replace(/^[-*+]\s+/, ''))}</li>`;
      continue;
    }

    // 有序列表(数字句点)
    if (/^\d+\.\s+/.test(line)) {
      if (!inOl) { closeList(); html += '<ol>'; inOl = true; }
      html += `<li>${parseInline(line.replace(/^\d+\.\s+/, ''))}</li>`;
      continue;
    }

    // 引用(>)
    if (/^>\s?/.test(line)) {
      closeList();
      html += `<blockquote>${parseInline(line.replace(/^>\s?/, ''))}</blockquote>`;
      continue;
    }

    // 空行:关闭列表,不产出标签
    if (line.trim() === '') {
      closeList();
      continue;
    }

    // 段落
    closeList();
    html += `<p>${parseInline(line)}</p>`;
  }

  // 未闭合代码块(防御)
  if (inCode) {
    html += `<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`;
  }
  closeList();

  return html;
}

/** DOMPurify 配置:仅允许 markdown 语义标签 + href/target/rel 属性 */
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'ul', 'ol', 'li',
    'strong', 'em', 'code', 'pre', 'blockquote', 'a', 'br',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
};

// DOMPurify 在无 window 时(构建/SSR)默认导出为工厂函数,无 sanitize/addHook 方法。
// 懒初始化:首次调用 renderMarkdown 时(window 已可用)创建实例并注册 hook。
let purifyInstance: typeof DOMPurify | null = null;

function getPurify(): typeof DOMPurify {
  if (!purifyInstance) {
    // DOMPurify(window) 创建绑定到当前 window 的完整实例
    purifyInstance = DOMPurify(window);
    // 链接强制新标签页 + noopener,确保所有保留的链接安全打开
    purifyInstance.addHook('afterSanitizeAttributes', function (node: Element) {
      if (node.tagName === 'A' && node.getAttribute('href')) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    });
  }
  return purifyInstance;
}

/**
 * 将 markdown 文本解析为 HTML 并经 DOMPurify sanitize。
 * 用于翻译浮层 done 阶段渲染。
 * @param md markdown 文本(可能含恶意 HTML)
 * @returns sanitize 后的安全 HTML 字符串
 */
export function renderMarkdown(md: string): string {
  if (!md) return '';
  const rawHtml = parseMarkdown(md);
  return getPurify().sanitize(rawHtml, SANITIZE_CONFIG) as string;
}
