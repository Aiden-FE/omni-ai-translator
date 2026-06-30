// Content Script — 划词翻译
// 监听选区，发送翻译请求，在选区附近展示浮层。

import './content.scss';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    let panel: HTMLDivElement | null = null;

    function removePanel() {
      if (panel) {
        panel.remove();
        panel = null;
      }
    }

    document.addEventListener('mouseup', async (e: MouseEvent) => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? '';
      if (!text || text.length > 5000) return;

      removePanel();
      panel = document.createElement('div');
      panel.className = 'llm-translator-panel';
      panel.textContent = '翻译中…';
      panel.style.left = `${e.pageX + 8}px`;
      panel.style.top = `${e.pageY + 8}px`;
      document.body.appendChild(panel);

      const resp = await chrome.runtime.sendMessage({
        type: 'translate' as const,
        payload: { text, targetLang: '中文' },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: { translatedText?: string; error?: string } = resp as any;
      if (panel) {
        panel.textContent = result.error ? `❌ ${result.error}` : result.translatedText ?? '';
      }
    });

    document.addEventListener('mousedown', (e) => {
      if (panel && !panel.contains(e.target as Node)) removePanel();
    });
  },
});
