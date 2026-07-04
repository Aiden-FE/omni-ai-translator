// Content Script — 划词翻译
// 交互模型：划词后出现一个浮动小触发按钮，点击触发才翻译，结果在浮层展示。
// 目标语言：默认浏览器首选语言（navigator.language）。
// 流式翻译：经 chrome.runtime.Port 长连接接收 chunk，浮层渐进渲染译文 + 闪烁光标。

import '@/assets/content.css';
import { getSettings } from '@/shared/storage';
import type { TranslateResult, StreamPortMessage } from '@/shared/types';
import { errorFeedback } from '@/shared/translator/error';
import { renderMarkdown } from '@/shared/render/markdown';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    let trigger: HTMLDivElement | null = null;
    let panel: HTMLDivElement | null = null;
    let selectedText = '';

    async function getTargetLang(): Promise<string> {
      // 优先使用用户在设置页配置的默认目标语言（trim 后非空）
      const settings = await getSettings();
      const configured = settings.defaultTargetLang?.trim();
      if (configured) return configured;
      // 留空则回退浏览器首选语言，如 "zh-CN" → "中文" 简化映射；未命中则原样返回
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
      panel.setAttribute('aria-live', 'polite');
      panel.textContent = content;
      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
      document.body.appendChild(panel);
    }

    /** 在浮层内渲染错误反馈（主行 + 引导次要行） */
    function renderError(targetPanel: HTMLDivElement, result: TranslateResult) {
      if (result.errorType) {
        const { main, guidance } = errorFeedback(result.errorType);
        const mainDiv = document.createElement('div');
        mainDiv.className = 'llm-translator-error-main';
        mainDiv.textContent = `❌ ${main}`;
        targetPanel.appendChild(mainDiv);
        if (guidance) {
          const hintDiv = document.createElement('div');
          hintDiv.className = 'llm-translator-error-hint';
          hintDiv.textContent = guidance;
          targetPanel.appendChild(hintDiv);
        }
      } else {
        // 回退：无 errorType 时沿用旧逻辑
        const errorDiv = document.createElement('div');
        errorDiv.className = 'llm-translator-error-main';
        errorDiv.textContent = `❌ ${result.error}`;
        targetPanel.appendChild(errorDiv);
      }
    }

    async function doTranslate(x: number, y: number) {
      trigger?.remove();
      trigger = null;
      showPanel('翻译中…', x, y);
      // 捕获当前 panel 引用，防止后续 clearAll/new doTranslate 改变 module-level panel 后旧 port 回调误操作
      const currentPanel = panel;
      const targetLang = await getTargetLang();

      // 经 port 长连接发起流式翻译
      const port = chrome.runtime.connect({ name: 'translate-stream' });
      port.postMessage({ type: 'request', text: selectedText, targetLang });

      let translatedText = '';
      let pendingDelta = '';
      let rafId: number | null = null;
      let finished = false;
      let firstChunkReceived = false;

      // 流式文本容器与光标元素（首次 chunk 到达时创建）
      let textContainer: HTMLSpanElement | null = null;
      let cursor: HTMLSpanElement | null = null;

      /** 首次 chunk 到达时初始化流式渲染结构：清空「翻译中…」，创建文本容器 + 光标 */
      function initStreamingUI() {
        if (!currentPanel || firstChunkReceived) return;
        firstChunkReceived = true;
        currentPanel.textContent = '';

        textContainer = document.createElement('span');
        textContainer.className = 'llm-translator-stream-text';

        cursor = document.createElement('span');
        cursor.className = 'llm-translator-cursor';
        cursor.textContent = '▋';
        cursor.setAttribute('aria-hidden', 'true');

        currentPanel.appendChild(textContainer);
        currentPanel.appendChild(cursor);
      }

      /** requestAnimationFrame 合批：将 pendingDelta 刷入 DOM */
      function flushPending() {
        if (pendingDelta && textContainer) {
          translatedText += pendingDelta;
          textContainer.textContent = translatedText;
          pendingDelta = '';
        }
        rafId = null;
      }

      function scheduleFlush() {
        if (rafId === null) {
          rafId = requestAnimationFrame(flushPending);
        }
      }

      /** 移除光标，定稿 */
      function removeCursor() {
        cursor?.remove();
        cursor = null;
      }

      port.onMessage.addListener((msg: StreamPortMessage) => {
        if (msg.type === 'chunk') {
          initStreamingUI();
          pendingDelta += msg.deltaText;
          scheduleFlush();
        } else if (msg.type === 'done') {
          finished = true;
          if (rafId !== null) cancelAnimationFrame(rafId);
          // 最终刷出
          if (pendingDelta) {
            translatedText += pendingDelta;
            pendingDelta = '';
          }
          removeCursor();
          // 以 done.result 为准（含完整译文）
          if (currentPanel) {
            if (firstChunkReceived && textContainer && msg.result.translatedText) {
              // done 阶段:markdown 渲染(解析 → sanitize → innerHTML)
              // 移除流式 span,创建 md 渲染容器注入 sanitize 后的 HTML
              textContainer.remove();
              const mdContainer = document.createElement('div');
              mdContainer.className = 'llm-translator-md-render';
              mdContainer.innerHTML = renderMarkdown(msg.result.translatedText);
              currentPanel.appendChild(mdContainer);
            } else if (!firstChunkReceived) {
              // 无 chunk 直接 done（理论上不会发生，但防御处理）
              currentPanel.textContent = '';
              const mdContainer = document.createElement('div');
              mdContainer.className = 'llm-translator-md-render';
              mdContainer.innerHTML = renderMarkdown(msg.result.translatedText ?? '');
              currentPanel.appendChild(mdContainer);
            }
          }
          port.disconnect();
        } else if (msg.type === 'error') {
          finished = true;
          if (rafId !== null) cancelAnimationFrame(rafId);
          flushPending();
          removeCursor();
          if (currentPanel) {
            // 保留已渲染译文 + 追加错误提示行
            if (!firstChunkReceived) {
              // 未收到任何 chunk，清空「翻译中…」再显示错误
              currentPanel.textContent = '';
            }
            renderError(currentPanel, msg.result);
          }
          port.disconnect();
        }
      });

      port.onDisconnect.addListener(() => {
        if (!finished && currentPanel) {
          // SW 回收等异常路径 → 归入 network 错误
          if (rafId !== null) cancelAnimationFrame(rafId);
          flushPending();
          removeCursor();
          if (!firstChunkReceived) {
            currentPanel.textContent = '';
          }
          renderError(currentPanel, {
            translatedText: '',
            error: '翻译连接中断',
            errorType: 'network',
          });
        }
      });
    }

    // 划词后显示触发按钮
    document.addEventListener('mouseup', (e: MouseEvent) => {
      // 点击发生在已有 trigger/panel 上时不重建,避免误清除
      const target = e.target as Node;
      if ((trigger && trigger.contains(target)) || (panel && panel.contains(target))) {
        return;
      }
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
      // 阻止 mousedown/mouseup 冒泡,防止 document 监听器误触发重建或清除
      trigger.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
      });
      trigger.addEventListener('mouseup', (ev) => {
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
      const target = e.target as Node;
      const onTrigger = trigger && trigger.contains(target);
      const onPanel = panel && panel.contains(target);
      if (!onTrigger && !onPanel) {
        clearAll();
      }
    });
  },
});
