// PROTOTYPE ONLY: disposable interaction and layout exploration for GitHub Issue #76.

const variants = [
  { key: 'A', name: '上下工作台' },
  { key: 'B', name: '结果抽屉' },
  { key: 'C', name: '聚焦译文' },
];

const languageDirectory = [
  ['zh-CN', '简体中文', '简体中文'],
  ['zh-TW', '繁体中文', '繁體中文'],
  ['en', '英语', 'English'],
  ['ja', '日语', '日本語'],
  ['ko', '韩语', '한국어'],
  ['fr', '法语', 'Français'],
  ['de', '德语', 'Deutsch'],
  ['es', '西班牙语', 'Español'],
  ['it', '意大利语', 'Italiano'],
  ['pt-BR', '葡萄牙语（巴西）', 'Português (Brasil)'],
  ['pt-PT', '葡萄牙语（葡萄牙）', 'Português (Portugal)'],
  ['ru', '俄语', 'Русский'],
  ['uk', '乌克兰语', 'Українська'],
  ['pl', '波兰语', 'Polski'],
  ['nl', '荷兰语', 'Nederlands'],
  ['sv', '瑞典语', 'Svenska'],
  ['no', '挪威语', 'Norsk'],
  ['da', '丹麦语', 'Dansk'],
  ['fi', '芬兰语', 'Suomi'],
  ['is', '冰岛语', 'Íslenska'],
  ['cs', '捷克语', 'Čeština'],
  ['sk', '斯洛伐克语', 'Slovenčina'],
  ['hu', '匈牙利语', 'Magyar'],
  ['ro', '罗马尼亚语', 'Română'],
  ['bg', '保加利亚语', 'Български'],
  ['sr', '塞尔维亚语', 'Српски'],
  ['hr', '克罗地亚语', 'Hrvatski'],
  ['sl', '斯洛文尼亚语', 'Slovenščina'],
  ['el', '希腊语', 'Ελληνικά'],
  ['tr', '土耳其语', 'Türkçe'],
  ['ar', '阿拉伯语', 'العربية'],
  ['he', '希伯来语', 'עברית'],
  ['fa', '波斯语', 'فارسی'],
  ['hi', '印地语', 'हिन्दी'],
  ['bn', '孟加拉语', 'বাংলা'],
  ['ur', '乌尔都语', 'اردو'],
  ['ta', '泰米尔语', 'தமிழ்'],
  ['te', '泰卢固语', 'తెలుగు'],
  ['th', '泰语', 'ไทย'],
  ['vi', '越南语', 'Tiếng Việt'],
  ['id', '印度尼西亚语', 'Bahasa Indonesia'],
  ['ms', '马来语', 'Bahasa Melayu'],
  ['fil', '菲律宾语', 'Filipino'],
  ['sw', '斯瓦希里语', 'Kiswahili'],
  ['af', '南非荷兰语', 'Afrikaans'],
  ['ca', '加泰罗尼亚语', 'Català'],
  ['eu', '巴斯克语', 'Euskara'],
  ['ga', '爱尔兰语', 'Gaeilge'],
  ['cy', '威尔士语', 'Cymraeg'],
  ['et', '爱沙尼亚语', 'Eesti'],
  ['lv', '拉脱维亚语', 'Latviešu'],
  ['lt', '立陶宛语', 'Lietuvių'],
  ['ka', '格鲁吉亚语', 'ქართული'],
  ['hy', '亚美尼亚语', 'Հայերեն'],
  ['kk', '哈萨克语', 'Қазақша'],
  ['uz', '乌兹别克语', 'Oʻzbekcha'],
  ['mn', '蒙古语', 'Монгол'],
  ['ne', '尼泊尔语', 'नेपाली'],
  ['km', '高棉语', 'ខ្មែរ'],
].map(([code, name, native]) => ({ code, name, native }));

const samples = {
  short: {
    source: 'The meeting has been moved to Friday afternoon. Please let me know if the new time works for you.',
    translations: {
      'zh-CN': '会议已改到周五下午。如果新的时间合适，请告诉我。',
      'zh-TW': '會議已改到週五下午。如果新的時間合適，請告訴我。',
      ja: '会議は金曜日の午後に変更されました。新しい時間で都合がつくか教えてください。',
      ko: '회의가 금요일 오후로 변경되었습니다. 새 시간이 괜찮은지 알려 주세요.',
      fr: 'La réunion a été déplacée à vendredi après-midi. Dites-moi si ce nouvel horaire vous convient.',
      de: 'Das Meeting wurde auf Freitagnachmittag verschoben. Bitte sag mir, ob die neue Zeit für dich passt.',
      es: 'La reunión se ha trasladado al viernes por la tarde. Avísame si te viene bien el nuevo horario.',
    },
  },
  long: {
    source: 'Please review the attached proposal before our meeting on Friday. Focus on the timeline, ownership, and any risks that could delay the launch.\n\nAdd your comments directly to the document so we can resolve open questions together.',
    translations: {
      'zh-CN': '请在周五会议前审阅随附的提案，重点关注时间安排、责任归属，以及任何可能导致发布延期的风险。\n\n请直接在文档中添加评论，方便我们一起解决尚未明确的问题。',
      'zh-TW': '請在週五會議前審閱隨附的提案，重點關注時程、責任歸屬，以及任何可能導致發布延期的風險。\n\n請直接在文件中加入評論，方便我們一起解決尚未明確的問題。',
      ja: '金曜日の会議までに添付の提案書を確認してください。スケジュール、担当範囲、リリースを遅らせる可能性のあるリスクを重点的に見てください。\n\n未解決の点を一緒に整理できるよう、コメントは文書に直接追加してください。',
    },
  },
};

const stateLabels = {
  empty: '空白',
  ready: '就绪',
  streaming: '流式翻译',
  complete: '已完成',
  stopped: '已停止',
  error: '网络错误',
  overlimit: '超出字数',
};

const prototypeState = {
  view: 'translator',
  sourceText: samples.short.source,
  output: samples.short.translations['zh-CN'],
  status: 'complete',
  error: '',
  targetLang: 'zh-CN',
  defaultTargetLang: 'zh-CN',
  temporaryTarget: false,
  activeProvider: 'builtin:microsoft',
  languageMenu: null,
  languageQuery: '',
  copied: false,
  toast: '',
  sampleLength: 'short',
};

let streamTimer = null;
let toastTimer = null;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function withLineBreaks(value) {
  return escapeHtml(value).replaceAll('\n', '<br>');
}

function selectedVariant() {
  const key = new URLSearchParams(window.location.search).get('variant')?.toUpperCase();
  return variants.some((variant) => variant.key === key) ? key : 'A';
}

function selectedLanguage(code) {
  return languageDirectory.find((language) => language.code === code) ?? languageDirectory[0];
}

function iconButton(symbol, label, options = {}) {
  const { className = '', action = '', disabled = false } = options;
  return `
    <button
      class="icon-button ${className}"
      type="button"
      aria-label="${label}"
      title="${label}"
      ${action ? `data-action="${action}"` : ''}
      ${disabled ? 'disabled' : ''}
    >${symbol}</button>
  `;
}

function header(interactive = true) {
  return `
    <header class="popup-header">
      <img src="./assets/icon-128.png" alt="" width="28" height="28">
      <span>Omni AI Translator</span>
      ${iconButton('⚙︎', '设置', { action: interactive ? 'open-settings' : '' })}
    </header>
  `;
}

function languageControl(context, compact = false) {
  const languageCode = context === 'settings'
    ? prototypeState.defaultTargetLang
    : prototypeState.targetLang;
  const language = selectedLanguage(languageCode);
  const disabled = (prototypeState.status === 'streaming' && context === 'translator')
    || context.startsWith('static');
  return `
    <button
      class="language-control ${compact ? 'is-compact' : ''}"
      type="button"
      data-action="open-language"
      data-context="${context}"
      aria-haspopup="listbox"
      aria-expanded="${prototypeState.languageMenu === context}"
      ${disabled ? 'disabled' : ''}
    >
      <span class="language-label">${context === 'settings' ? '默认语言' : '目标语言'}</span>
      <strong>${escapeHtml(language.name)} / ${escapeHtml(language.native)}</strong>
      <span class="language-code">${escapeHtml(language.code)}</span>
      <span aria-hidden="true">⌄</span>
    </button>
  `;
}

function languagePopover(context) {
  if (prototypeState.languageMenu !== context) return '';
  return `
    <div class="language-popover" data-language-context="${context}">
      <div class="language-search-row">
        <span aria-hidden="true">⌕</span>
        <input
          id="language-search"
          type="search"
          value="${escapeHtml(prototypeState.languageQuery)}"
          placeholder="搜索语言或代码"
          autocomplete="off"
        >
      </div>
      <div id="language-options" class="language-options" role="listbox"></div>
    </div>
  `;
}

function matchingLanguages() {
  const query = prototypeState.languageQuery.trim().toLocaleLowerCase();
  if (!query) return languageDirectory;
  return languageDirectory.filter((language) => (
    `${language.code} ${language.name} ${language.native}`.toLocaleLowerCase().includes(query)
  ));
}

function renderLanguageOptions() {
  const options = document.querySelector('#language-options');
  if (!options) return;
  const context = prototypeState.languageMenu;
  const selectedCode = context === 'settings'
    ? prototypeState.defaultTargetLang
    : prototypeState.targetLang;
  const matches = matchingLanguages();
  options.innerHTML = matches.length
    ? matches.map((language) => `
        <button
          type="button"
          role="option"
          aria-selected="${language.code === selectedCode}"
          data-action="choose-language"
          data-code="${escapeHtml(language.code)}"
        >
          <span><strong>${escapeHtml(language.name)}</strong><small>${escapeHtml(language.native)}</small></span>
          <code>${escapeHtml(language.code)}</code>
          ${language.code === selectedCode ? '<span class="selected-check">✓</span>' : ''}
        </button>
      `).join('')
    : '<div class="no-language-result">没有匹配的语言</div>';
}

function eligibility() {
  const count = [...prototypeState.sourceText].length;
  return {
    count,
    empty: prototypeState.sourceText.trim().length === 0,
    overlimit: count > 5000,
  };
}

function outputStatus() {
  if (prototypeState.status === 'streaming') return ['info', '翻译中'];
  if (prototypeState.status === 'complete') return ['success', '已完成'];
  if (prototypeState.status === 'stopped') return ['warning', '已停止'];
  if (prototypeState.status === 'error') return ['destructive', '未完成'];
  return ['', ''];
}

function translatorView() {
  const { count, empty, overlimit } = eligibility();
  const locked = prototypeState.status === 'streaming';
  const [statusClass, statusText] = outputStatus();
  const canTranslate = !empty && !overlimit;
  const output = prototypeState.output
    ? `<p class="result-text">${withLineBreaks(prototypeState.output)}${locked ? '<span class="stream-cursor" aria-hidden="true"></span>' : ''}</p>`
    : '<div class="empty-result">暂无译文</div>';

  return `
    <article class="popup-shell variant-a" aria-label="文本翻译">
      ${header()}
      <main class="translator-body">
        <div class="a-toolbar">
          <span class="source-mode">自动识别</span>
          <span class="flow-arrow" aria-hidden="true">→</span>
          ${languageControl('translator')}
          ${languagePopover('translator')}
        </div>

        <section class="text-pane source-pane ${overlimit ? 'is-overlimit' : ''}">
          <div class="pane-heading">
            <label for="source-a">原文</label>
            <span class="character-count">${count} / 5000</span>
          </div>
          <textarea id="source-a" ${locked ? 'disabled' : ''}>${escapeHtml(prototypeState.sourceText)}</textarea>
          ${iconButton('×', '清空原文', { className: 'clear-button', action: 'clear', disabled: locked })}
        </section>

        ${locked
          ? '<button class="stop-action" type="button" data-action="stop"><span aria-hidden="true">■</span><span>停止</span></button>'
          : `<button class="primary-action" type="button" data-action="translate" ${canTranslate ? '' : 'disabled'}>
              <span>翻译</span><kbd>⌘ ↵</kbd>
            </button>`}

        <section class="text-pane result-pane ${prototypeState.error ? 'has-error' : ''}">
          <div class="pane-heading">
            <div class="result-heading-group">
              <span>译文</span>
              ${statusText ? `<span class="status-badge ${statusClass}">${statusText}</span>` : ''}
            </div>
            ${prototypeState.output
              ? iconButton(prototypeState.copied ? '✓' : '⧉', prototypeState.copied ? '已复制' : '复制译文', { action: 'copy' })
              : ''}
          </div>
          <div class="result-content" aria-live="polite">${output}</div>
          ${prototypeState.error
            ? `<div class="error-banner" role="alert">
                <span>${escapeHtml(prototypeState.error)}</span>
                <button type="button" data-action="retry">重试</button>
              </div>`
            : ''}
        </section>
      </main>
      ${prototypeState.toast ? `<div class="prototype-toast" role="status">${escapeHtml(prototypeState.toast)}</div>` : ''}
    </article>
  `;
}

function settingsView() {
  return `
    <article class="popup-shell settings-shell" aria-label="设置">
      <header class="popup-header settings-header">
        ${iconButton('←', '返回文本翻译', { action: 'back-to-translator' })}
        <span>设置</span>
      </header>
      <main class="settings-body">
        <section class="settings-section language-settings-section">
          <div class="settings-title">
            <div><strong>默认目标语言</strong><span>用于新建翻译会话</span></div>
          </div>
          ${languageControl('settings')}
          ${languagePopover('settings')}
        </section>

        <section class="settings-section">
          <div class="settings-title">
            <div><strong>翻译源</strong><span>下一次翻译时生效</span></div>
          </div>
          <div class="provider-options">
            ${providerOption('builtin:microsoft', 'Microsoft 翻译', '免 Key')}
            ${providerOption('builtin:google', 'Google 翻译', '免 Key')}
            ${providerOption('user:llm', '我的 LLM', 'OpenAI Responses')}
          </div>
        </section>
      </main>
      <footer class="settings-footer">
        <button type="button" data-action="open-full-settings">打开全部设置 <span aria-hidden="true">↗</span></button>
      </footer>
      ${prototypeState.toast ? `<div class="prototype-toast" role="status">${escapeHtml(prototypeState.toast)}</div>` : ''}
    </article>
  `;
}

function providerOption(id, name, note) {
  const selected = prototypeState.activeProvider === id;
  return `
    <label class="provider-option ${selected ? 'is-selected' : ''}">
      <input type="radio" name="provider" value="${id}" ${selected ? 'checked' : ''}>
      <span class="provider-radio" aria-hidden="true"></span>
      <span><strong>${name}</strong><small>${note}</small></span>
      ${selected ? '<span class="active-note">当前</span>' : ''}
    </label>
  `;
}

function staticVariantB() {
  const sample = samples[prototypeState.sampleLength];
  const translation = previewTranslation();
  return `
    <article class="popup-shell variant-b" aria-label="变体 B：结果抽屉">
      ${header(false)}
      <div class="b-language-row">${languageControl('static-b', true)}</div>
      <section class="composer">
        <div class="pane-heading"><span>输入文本</span><span>${[...sample.source].length} / 5000</span></div>
        <textarea>${escapeHtml(sample.source)}</textarea>
        <div class="composer-actions">
          ${iconButton('×', '清空原文')}
          <button class="primary-action compact-action" type="button"><span>翻译</span><span aria-hidden="true">↑</span></button>
        </div>
      </section>
      <section class="result-drawer">
        <div class="drawer-handle" aria-hidden="true"></div>
        <div class="pane-heading"><span>译文</span>${iconButton('⧉', '复制译文')}</div>
        <p>${withLineBreaks(translation)}</p><span class="completion-note">翻译完成</span>
      </section>
    </article>
  `;
}

function staticVariantC() {
  const sample = samples[prototypeState.sampleLength];
  const translation = previewTranslation();
  return `
    <article class="popup-shell variant-c" aria-label="变体 C：聚焦译文">
      ${header(false)}
      <div class="c-control-row">${languageControl('static-c', true)}<button class="translate-again" type="button">重新翻译</button></div>
      <details class="source-summary">
        <summary><span>原文</span><strong>${escapeHtml(sample.source)}</strong><span aria-hidden="true">⌄</span></summary>
        <p>${withLineBreaks(sample.source)}</p>
      </details>
      <section class="result-canvas">
        <div class="result-kicker">译文 · ${escapeHtml(selectedLanguage(prototypeState.targetLang).native)}</div>
        <p>${withLineBreaks(translation)}</p>
        <div class="result-footer"><span>已完成</span>${iconButton('⧉', '复制译文', { className: 'copy-on-canvas' })}</div>
      </section>
      <button class="new-translation" type="button"><span aria-hidden="true">＋</span><span>新建文本翻译</span></button>
    </article>
  `;
}

function previewTranslation() {
  const sample = samples[prototypeState.sampleLength];
  const language = selectedLanguage(prototypeState.targetLang);
  return sample.translations[prototypeState.targetLang]
    ?? `[${language.native} translation placeholder]`;
}

function render() {
  const key = selectedVariant();
  const variant = variants.find((item) => item.key === key);
  const root = document.querySelector('#prototype-root');
  root.innerHTML = key === 'A'
    ? (prototypeState.view === 'settings' ? settingsView() : translatorView())
    : (key === 'B' ? staticVariantB() : staticVariantC());
  document.querySelector('#variant-label').textContent = `${key} — ${variant.name}`;
  document.querySelector('#state-label').textContent = key === 'A' ? currentStateLabel() : '静态对照';
  document.querySelector('#state-select').value = currentStateKey();
  document.querySelector('#length-select').value = prototypeState.sampleLength;
  document.title = `${key} — ${variant.name} | Popup Prototype`;
  renderLanguageOptions();
}

function currentStateKey() {
  const { empty, overlimit } = eligibility();
  if (overlimit) return 'overlimit';
  if (prototypeState.status === 'streaming') return 'streaming';
  if (prototypeState.status === 'complete') return 'complete';
  if (prototypeState.status === 'stopped') return 'stopped';
  if (prototypeState.status === 'error') return 'error';
  return empty ? 'empty' : 'ready';
}

function currentStateLabel() {
  return prototypeState.view === 'settings' ? '设置' : stateLabels[currentStateKey()];
}

function cycle(direction) {
  stopTimer();
  const currentIndex = variants.findIndex((variant) => variant.key === selectedVariant());
  const nextIndex = (currentIndex + direction + variants.length) % variants.length;
  const url = new URL(window.location.href);
  url.searchParams.set('variant', variants[nextIndex].key);
  window.history.replaceState({}, '', url);
  render();
}

function setPreset(preset) {
  stopTimer();
  const sample = samples[prototypeState.sampleLength];
  prototypeState.view = 'translator';
  prototypeState.languageMenu = null;
  prototypeState.error = '';
  prototypeState.copied = false;
  prototypeState.sourceText = sample.source;
  prototypeState.output = '';
  prototypeState.status = 'idle';

  if (preset === 'empty') prototypeState.sourceText = '';
  if (preset === 'complete') {
    prototypeState.output = previewTranslation();
    prototypeState.status = 'complete';
  }
  if (preset === 'stopped') {
    prototypeState.output = [...previewTranslation()].slice(0, 18).join('');
    prototypeState.status = 'stopped';
  }
  if (preset === 'error') {
    prototypeState.output = [...previewTranslation()].slice(0, 18).join('');
    prototypeState.status = 'error';
    prototypeState.error = '网络连接中断，请检查连接后重试。';
  }
  if (preset === 'overlimit') prototypeState.sourceText = 'A'.repeat(5001);
  if (preset === 'streaming') {
    startTranslation();
    return;
  }
  render();
}

function startTranslation() {
  const { empty, overlimit } = eligibility();
  if (empty || overlimit) return;
  stopTimer();
  prototypeState.output = '';
  prototypeState.error = '';
  prototypeState.status = 'streaming';
  prototypeState.copied = false;
  const translation = [...previewTranslation()];
  let position = 0;
  render();
  streamTimer = window.setInterval(() => {
    const chunkSize = prototypeState.sampleLength === 'long' ? 4 : 2;
    prototypeState.output += translation.slice(position, position + chunkSize).join('');
    position += chunkSize;
    if (position >= translation.length) {
      stopTimer();
      prototypeState.status = 'complete';
    }
    render();
  }, 70);
}

function stopTimer() {
  if (streamTimer !== null) {
    window.clearInterval(streamTimer);
    streamTimer = null;
  }
}

function stopTranslation() {
  stopTimer();
  prototypeState.status = 'stopped';
  render();
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  prototypeState.toast = message;
  render();
  toastTimer = window.setTimeout(() => {
    prototypeState.toast = '';
    render();
  }, 1400);
}

function openLanguageMenu(context) {
  prototypeState.languageMenu = context;
  prototypeState.languageQuery = '';
  render();
  window.setTimeout(() => document.querySelector('#language-search')?.focus(), 0);
}

function chooseLanguage(code) {
  if (prototypeState.languageMenu === 'settings') {
    prototypeState.defaultTargetLang = code;
    if (!prototypeState.temporaryTarget) prototypeState.targetLang = code;
  } else {
    prototypeState.targetLang = code;
    prototypeState.temporaryTarget = code !== prototypeState.defaultTargetLang;
  }
  prototypeState.languageMenu = null;
  prototypeState.languageQuery = '';
  render();
}

function handleAction(action, element) {
  if (action === 'open-settings') {
    if (prototypeState.status === 'streaming') stopTranslation();
    prototypeState.view = 'settings';
    prototypeState.languageMenu = null;
    render();
  }
  if (action === 'back-to-translator') {
    prototypeState.view = 'translator';
    prototypeState.languageMenu = null;
    render();
    window.setTimeout(() => document.querySelector('#source-a')?.focus(), 0);
  }
  if (action === 'open-language') openLanguageMenu(element.dataset.context);
  if (action === 'choose-language') chooseLanguage(element.dataset.code);
  if (action === 'translate' || action === 'retry') startTranslation();
  if (action === 'stop') stopTranslation();
  if (action === 'clear') {
    prototypeState.sourceText = '';
    prototypeState.output = '';
    prototypeState.error = '';
    prototypeState.status = 'idle';
    render();
    window.setTimeout(() => document.querySelector('#source-a')?.focus(), 0);
  }
  if (action === 'copy') {
    navigator.clipboard?.writeText(prototypeState.output);
    prototypeState.copied = true;
    render();
    window.setTimeout(() => {
      prototypeState.copied = false;
      render();
    }, 1200);
  }
  if (action === 'open-full-settings') showToast('完整设置页不在本原型范围内');
}

document.querySelector('#prototype-root').addEventListener('click', (event) => {
  const actionElement = event.target.closest('[data-action]');
  if (actionElement) handleAction(actionElement.dataset.action, actionElement);
});

document.querySelector('#prototype-root').addEventListener('input', (event) => {
  if (event.target.matches('#source-a')) {
    prototypeState.sourceText = event.target.value;
    prototypeState.copied = false;
    document.querySelector('.character-count').textContent = `${[...prototypeState.sourceText].length} / 5000`;
    const sourcePane = document.querySelector('.source-pane');
    sourcePane.classList.toggle('is-overlimit', [...prototypeState.sourceText].length > 5000);
    const translateButton = document.querySelector('[data-action="translate"]');
    if (translateButton) translateButton.disabled = eligibility().empty || eligibility().overlimit;
    document.querySelector('#state-label').textContent = currentStateLabel();
    document.querySelector('#state-select').value = currentStateKey();
  }
  if (event.target.matches('#language-search')) {
    prototypeState.languageQuery = event.target.value;
    renderLanguageOptions();
  }
});

document.querySelector('#prototype-root').addEventListener('change', (event) => {
  if (event.target.matches('input[name="provider"]')) {
    prototypeState.activeProvider = event.target.value;
    render();
  }
});

document.querySelector('#prototype-root').addEventListener('keydown', (event) => {
  if (event.target.matches('#source-a') && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    startTranslation();
  }
});

document.querySelector('#previous-variant').addEventListener('click', () => cycle(-1));
document.querySelector('#next-variant').addEventListener('click', () => cycle(1));
document.querySelector('#state-select').addEventListener('change', (event) => setPreset(event.target.value));
document.querySelector('#length-select').addEventListener('change', (event) => {
  prototypeState.sampleLength = event.target.value;
  setPreset('complete');
});
document.querySelector('#tweaks-toggle').addEventListener('click', () => {
  document.querySelector('#tweaks-panel').hidden = false;
  document.querySelector('#tweaks-toggle').hidden = true;
});
document.querySelector('#tweaks-close').addEventListener('click', () => {
  document.querySelector('#tweaks-panel').hidden = true;
  document.querySelector('#tweaks-toggle').hidden = false;
});

window.addEventListener('keydown', (event) => {
  const target = event.target;
  const isEditing = target instanceof HTMLElement
    && (target.matches('input, textarea, select') || target.isContentEditable);
  if (isEditing) return;
  if (event.key === 'ArrowLeft') cycle(-1);
  if (event.key === 'ArrowRight') cycle(1);
});
window.addEventListener('popstate', render);

const initialParams = new URLSearchParams(window.location.search);
prototypeState.sampleLength = initialParams.get('length') === 'long' ? 'long' : 'short';
setPreset(initialParams.get('state') || 'complete');
window.setTimeout(() => document.querySelector('#source-a')?.focus(), 0);
