// Content Script — 划词翻译
// 交互模型：划词后出现一个浮动小触发按钮，点击触发才翻译，结果在浮层展示。
// 目标语言：默认浏览器首选语言（navigator.language）。

import '@/assets/content.css';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    let trigger: HTMLDivElement | null = null;
    let panel: HTMLDivElement | null = null;
    let selectedText = '';

    function getTargetLang(): string {
      // 浏览器首选语言，如 "zh-CN" → "中文" 简化映射；未命中则原样返回
      const lang = (navigator.language || 'en').toLowerCase();
      const map: Record<string, string> = {
        'zh-cn': '简体中文',
        'zh-tw': '繁體中文',
        'zh-hk': '繁體中文',
        zh: '中文',
        en: 'English',
        ja: '日本語',
        ko: '한국어',
        fr: 'Français',
        de: 'Deutsch',
        es: 'Español',
      };
      return map[lang] ?? map[lang.split('-')[0]] ?? lang;
    }

    function clearAll() {
      trigger?.remove();
      panel?.remove();
      trigger = null;
      panel = null;
      selectedText = '';
    }

    function showPanel(content: string, x: number, y: number) {
      panel = document.createElement('div');
      panel.className = 'llm-translator-panel';
      panel.textContent = content;
      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
      document.body.appendChild(panel);
    }

    async function doTranslate(x: number, y: number) {
      trigger?.remove();
      trigger = null;
      showPanel('翻译中…', x, y);
      const resp = await chrome.runtime.sendMessage({
        type: 'translate' as const,
        payload: { text: selectedText, targetLang: getTargetLang() },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: { translatedText?: string; error?: string } = resp as any;
      if (panel) {
        panel.textContent = result.error ? `❌ ${result.error}` : result.translatedText ?? '';
      }
    }

    // 划词后显示触发按钮
    document.addEventListener('mouseup', (e: MouseEvent) => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? '';
      clearAll();
      if (!text || text.length > 5000) return;
      selectedText = text;

      trigger = document.createElement('div');
      trigger.className = 'llm-translator-trigger';
      trigger.textContent = '译';
      trigger.title = '翻译选中文本';
      trigger.style.left = `${e.pageX + 8}px`;
      trigger.style.top = `${e.pageY + 8}px`;
      trigger.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
      });
      trigger.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const x = parseFloat(trigger!.style.left);
        const y = parseFloat(trigger!.style.top);
        void doTranslate(x, y);
      });
      document.body.appendChild(trigger);
    });

    // 点击空白处清除
    document.addEventListener('mousedown', (e) => {
      if (
        trigger && !trigger.contains(e.target as Node) &&
        panel && !panel.contains(e.target as Node)
      ) {
        clearAll();
      }
    });
  },
});
