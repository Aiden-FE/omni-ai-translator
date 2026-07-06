// Content Script — 划词翻译
// 交互模型：划词后出现一个浮动小触发按钮，点击触发才翻译，结果在浮层展示。
// 目标语言：默认浏览器首选语言（navigator.language）。
// 流式翻译：经 chrome.runtime.Port 长连接接收 chunk，浮层渐进渲染译文 + 闪烁光标。
//
// 样式隔离：译文浮层(panel)渲染进一个 about:blank iframe(同源,可直接写 contentDocument)。
// iframe 是独立文档,宿主页面 CSS 无法穿透文档边界,彻底避免宿主对 p/code/h1 等语义标签
// 的颜色规则覆盖浮层——此前 color:inherit(PR #45)/Shadow DOM(PR #46)方案仍受宿主样式影响,
// 译文与暗底同色不可见。触发按钮(trigger)结构简单且自带显式色,保留在宿主 DOM;仅显示浮层做 iframe 隔离。

import '@/assets/content.css';
// content.css 以字符串注入浮层 iframe 文档(见 showPanel),不依赖宿主文档全局 CSS 穿透进 iframe。
import contentStyle from '@/assets/content.css?inline';
import { getSettings } from '@/shared/storage';
import type { TranslateResult, StreamPortMessage } from '@/shared/types';
import { errorFeedback } from '@/shared/translator/error';
import { renderMarkdown } from '@/shared/render/markdown';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    let trigger: HTMLDivElement | null = null;
    // 浮层 iframe(宿主 DOM 中的容器元素)与其内部文档根(panelRoot,挂 .llm-translator-panel)
    let panelFrame: HTMLIFrameElement | null = null;
    let panelRoot: HTMLDivElement | null = null;
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
      panelFrame?.remove();
      panelFrame = null;
      panelRoot = null;
      trigger = null;
      selectedText = '';
    }

    /** 同步浮层 iframe 元素宽高到内部 panelRoot 尺寸(内容驱动,最大宽 360px+内边距) */
    function syncPanelSize() {
      if (!panelFrame || !panelRoot) return;
      panelFrame.style.width = `${panelRoot.offsetWidth}px`;
      panelFrame.style.height = `${panelRoot.offsetHeight}px`;
    }

    function showPanel(content: string, x: number, y: number) {
      // iframe 作为浮层容器挂在宿主 body;position:absolute 锚定文档原点,内部 panelRoot 沿用 pageX/pageY 定位
      panelFrame = document.createElement('iframe');
      panelFrame.className = 'llm-translator-panel-frame';
      panelFrame.title = 'LLM 翻译结果';
      panelFrame.style.left = `${x}px`;
      panelFrame.style.top = `${y}px`;
      document.body.appendChild(panelFrame);

      // about:blank 同源,可立即写 contentDocument;注入文档重置 + content.css 字符串
      // overflow:hidden:iframe 尺寸由 syncSize 贴合内容,本就不该内部滚动;消除 sub-pixel 溢出引发的
      // 上下/左右滚动条(垂直滚动条占宽度+panel max-content 不收缩→水平滚动条的连锁)。pre 等局部滚动用细窄半透明滚动条。
      const doc = panelFrame.contentDocument;
      if (!doc) return;
      doc.open();
      doc.write(
        '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
          'html,body{margin:0;padding:0;background:transparent;overflow:hidden;}' +
          '::-webkit-scrollbar{width:6px;height:6px;}' +
          '::-webkit-scrollbar-thumb{background:rgba(249,250,251,0.25);border-radius:3px;}' +
          '::-webkit-scrollbar-track{background:transparent;}' +
          '::-webkit-scrollbar-thumb:hover{background:rgba(249,250,251,0.4);}' +
          contentStyle +
          '</style></head><body></body></html>',
      );
      doc.close();

      // panelRoot 挂 .llm-translator-panel;width:max-content 让宽度由内容决定(见 content.css),不依赖 iframe 宽度,打破塌陷循环
      panelRoot = doc.createElement('div');
      panelRoot.className = 'llm-translator-panel';
      panelRoot.setAttribute('aria-live', 'polite');
      panelRoot.textContent = content;
      doc.body.appendChild(panelRoot);

      // 初始同步 iframe 宽高到 panelRoot 尺寸;后续内容变更由 doTranslate 内 syncSize 显式同步(确定性,不依赖 RO 跨 realm 时序)
      syncPanelSize();
    }

    /** 在浮层内渲染错误反馈（主行 + 引导次要行）。元素须在 iframe 文档内创建,沿用 panelRoot 所属文档。 */
    function renderError(targetPanel: HTMLDivElement, result: TranslateResult) {
      const doc = targetPanel.ownerDocument;
      if (result.errorType) {
        const { main, guidance } = errorFeedback(result.errorType);
        const mainDiv = doc.createElement('div');
        mainDiv.className = 'llm-translator-error-main';
        mainDiv.textContent = `❌ ${main}`;
        targetPanel.appendChild(mainDiv);
        if (guidance) {
          const hintDiv = doc.createElement('div');
          hintDiv.className = 'llm-translator-error-hint';
          hintDiv.textContent = guidance;
          targetPanel.appendChild(hintDiv);
        }
      } else {
        // 回退：无 errorType 时沿用旧逻辑
        const errorDiv = doc.createElement('div');
        errorDiv.className = 'llm-translator-error-main';
        errorDiv.textContent = `❌ ${result.error}`;
        targetPanel.appendChild(errorDiv);
      }
    }

    async function doTranslate(x: number, y: number) {
      trigger?.remove();
      trigger = null;
      showPanel('翻译中…', x, y);
      // 捕获当前浮层引用,防止后续 clearAll/new doTranslate 改变 module-level 引用后旧 port 回调误操作
      const currentRoot = panelRoot;
      const currentDoc = panelFrame?.contentDocument ?? null;
      const currentFrame = panelFrame;
      // 显式同步当前浮层 iframe 宽高到 panelRoot 尺寸(内容驱动,确定性;每次内容变更后调用,避免高度溢出)
      const syncSize = () => {
        if (currentFrame && currentRoot) {
          currentFrame.style.width = `${currentRoot.offsetWidth}px`;
          currentFrame.style.height = `${currentRoot.offsetHeight}px`;
        }
      };
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
        if (!currentRoot || !currentDoc || firstChunkReceived) return;
        firstChunkReceived = true;
        currentRoot.textContent = '';

        textContainer = currentDoc.createElement('span');
        textContainer.className = 'llm-translator-stream-text';

        cursor = currentDoc.createElement('span');
        cursor.className = 'llm-translator-cursor';
        cursor.textContent = '▋';
        cursor.setAttribute('aria-hidden', 'true');

        currentRoot.appendChild(textContainer);
        currentRoot.appendChild(cursor);
        syncSize();
      }

      /** requestAnimationFrame 合批：将 pendingDelta 刷入 DOM */
      function flushPending() {
        if (pendingDelta && textContainer) {
          translatedText += pendingDelta;
          textContainer.textContent = translatedText;
          pendingDelta = '';
          syncSize();
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
          if (currentRoot && currentDoc) {
            if (firstChunkReceived && textContainer && msg.result.translatedText) {
              // done 阶段:markdown 渲染(解析 → sanitize → innerHTML)
              // 移除流式 span,创建 md 渲染容器注入 sanitize 后的 HTML
              textContainer.remove();
              const mdContainer = currentDoc.createElement('div');
              mdContainer.className = 'llm-translator-md-render';
              mdContainer.innerHTML = renderMarkdown(msg.result.translatedText);
              currentRoot.appendChild(mdContainer);
            } else if (!firstChunkReceived) {
              // 无 chunk 直接 done（理论上不会发生，但防御处理）
              currentRoot.textContent = '';
              const mdContainer = currentDoc.createElement('div');
              mdContainer.className = 'llm-translator-md-render';
              mdContainer.innerHTML = renderMarkdown(msg.result.translatedText ?? '');
              currentRoot.appendChild(mdContainer);
            }
            syncSize();
          }
          port.disconnect();
        } else if (msg.type === 'error') {
          finished = true;
          if (rafId !== null) cancelAnimationFrame(rafId);
          flushPending();
          removeCursor();
          if (currentRoot) {
            // 保留已渲染译文 + 追加错误提示行
            if (!firstChunkReceived) {
              // 未收到任何 chunk，清空「翻译中…」再显示错误
              currentRoot.textContent = '';
            }
            renderError(currentRoot, msg.result);
            syncSize();
          }
          port.disconnect();
        }
      });

      port.onDisconnect.addListener(() => {
        if (!finished && currentRoot) {
          // SW 回收等异常路径 → 归入 network 错误
          if (rafId !== null) cancelAnimationFrame(rafId);
          flushPending();
          removeCursor();
          if (!firstChunkReceived) {
            currentRoot.textContent = '';
          }
          renderError(currentRoot, {
            translatedText: '',
            error: '翻译连接中断',
            errorType: 'network',
          });
          syncSize();
        }
      });
    }

    // 划词后显示触发按钮
    document.addEventListener('mouseup', (e: MouseEvent) => {
      // 点击发生在已有 trigger/panel 上时不重建,避免误清除
      // (浮层在 iframe 内,宿主事件不穿透 iframe;此判断仅覆盖点中 iframe 元素本身的少见情形)
      const target = e.target as Node;
      if ((trigger && trigger.contains(target)) || (panelFrame && panelFrame.contains(target))) {
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

    // 点击空白处清除(浮层在 iframe 内,iframe 捕获其区域内事件,宿主 mousedown 仅在点宿主空白时触发)
    document.addEventListener('mousedown', (e) => {
      const target = e.target as Node;
      const onTrigger = trigger && trigger.contains(target);
      const onPanel = panelFrame && panelFrame.contains(target);
      if (!onTrigger && !onPanel) {
        clearAll();
      }
    });
  },
});
