<script setup lang="ts">
// popup:#77 文本翻译工作台(变体 A 上下工作台)为默认视图;
// 翻译源配置(SourceConfigPanel)经 header 设置入口访问(保留现有能力);
// #81 设置视图往返:工作台 ⇄ 设置导航不结束文本翻译会话;
// 默认目标语言复用共享目录 + LanguageSelect,选择即持久化。
// #79:翻译经 browser.runtime.connect({ name: 'translate-stream' }) 流式 port 通道发起,
// 复用划词翻译 StreamPortMessage 契约(request / chunk / done / error);
// 译文增量渲染 + 光标反馈,主按钮在流式期间变为「停止」。
// #80:翻译出错按 ErrorType 四类差异化展示错误横幅(文案来自 errorFeedback),
// 横幅内提供重试(保留原文与当前临时目标语言);译文可复制并给出短暂已复制反馈。
// 错误横幅渲染在译文区内,不推动主操作按钮位置。
// 状态机来自 shared/popup-workbench.ts;不持久化输入文本、译文或历史。
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue';
import SourceConfigPanel from '@/shared/ui/SourceConfigPanel.vue';
import Button from '@/shared/ui/components/button/Button.vue';
import ScrollArea from '@/shared/ui/components/scroll-area/ScrollArea.vue';
import LanguageSelect from '@/shared/ui/components/language-select/LanguageSelect.vue';
import { getSettings } from '@/shared/storage';
import { resolveInitialTargetLang } from '@/shared/language-catalog';
import { errorFeedback } from '@/shared/translator/error';
import type { StreamPortMessage } from '@/shared/types';
import './popup.css';
import {
  WORKBENCH_MAX_LENGTH,
  createWorkbenchState,
  countWorkbenchCharacters,
  reduceWorkbench,
} from '@/shared/popup-workbench';

const state = reactive(createWorkbenchState());
const view = ref<'translator' | 'settings'>('translator');
// 临时目标语言（BCP 47 代码，#78）：仅当前文本翻译会话生效，不写入存储；
// popup 每次打开（组件挂载）重新从默认目标语言初始化。
const targetLangCode = ref('en');
const sourceArea = ref<HTMLTextAreaElement | null>(null);
const settingsPanel = ref<InstanceType<typeof SourceConfigPanel> | null>(null);

const charCount = computed(() => countWorkbenchCharacters(state.sourceText));
const isStreaming = computed(() => state.outputPhase === 'streaming');
const canTranslate = computed(
  () => state.inputPhase === 'ready' && state.outputPhase !== 'streaming',
);

// 错误横幅文案:有 errorType 时按 errorFeedback 差异化展示;否则展示原始错误信息
const errorBanner = computed(() =>
  state.errorType
    ? errorFeedback(state.errorType)
    : { main: state.errorMessage, guidance: '' },
);

// 只要已有完整或部分译文，生成中、停止后或失败时都允许复制。
const canCopyTranslation = computed(() => state.translatedText.length > 0);
const copied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | null = null;

// 当前流式会话的 port。回调必须校验 port 仍为当前会话，避免旧会话延迟断开污染新翻译。
let streamPort: ReturnType<typeof browser.runtime.connect> | null = null;

async function initTargetLang() {
  // 从设置中的默认目标语言初始化;未配置时跟随浏览器首选语言(#78 共享目录解析)。
  const settings = await getSettings();
  targetLangCode.value = resolveInitialTargetLang(
    settings.defaultTargetLang,
    navigator.language,
  ).code;
}

onMounted(async () => {
  await initTargetLang();
  await nextTick();
  sourceArea.value?.focus();
});

onUnmounted(() => {
  // popup 关闭时断开进行中的流式 port(后台经 onDisconnect 感知,不再写消息)
  const port = streamPort;
  if (port) finishStream(port);
  try {
    port?.disconnect();
  } catch {
    // port 可能已被后台终结
  }
  if (copiedTimer) clearTimeout(copiedTimer);
});

function dispatch(action: Parameters<typeof reduceWorkbench>[1]) {
  Object.assign(state, reduceWorkbench(state, action));
}

function onSourceInput(event: Event) {
  dispatch({ type: 'edit-text', text: (event.target as HTMLTextAreaElement).value });
}

function onSourceKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    translate();
  }
}

async function clearSource() {
  if (isStreaming.value) return;
  dispatch({ type: 'clear' });
  await nextTick();
  sourceArea.value?.focus();
}

function finishStream(port: ReturnType<typeof browser.runtime.connect>): boolean {
  if (streamPort !== port) return false;
  streamPort = null;
  return true;
}

async function translate() {
  if (!canTranslate.value) return;
  const text = state.sourceText;
  const lang = targetLangCode.value;

  const port = browser.runtime.connect({ name: 'translate-stream' });
  streamPort = port;
  dispatch({ type: 'stream-start' });

  port.onMessage.addListener((msg: StreamPortMessage) => {
    if (streamPort !== port) return;
    if (msg.type === 'chunk') {
      dispatch({ type: 'stream-chunk', deltaText: msg.deltaText });
    } else if (msg.type === 'done') {
      if (!finishStream(port)) return;
      dispatch({ type: 'stream-done', result: msg.result });
      try { port.disconnect(); } catch { /* 后台可能已断开 */ }
    } else if (msg.type === 'error') {
      if (!finishStream(port)) return;
      dispatch({
        type: 'stream-error',
        message: msg.result.error ?? '翻译失败,请重试',
        errorType: msg.result.errorType,
      });
      try { port.disconnect(); } catch { /* 后台可能已断开 */ }
    }
  });

  // 异常断开(SW 回收 / 后台重启等):归一为可恢复的终态,不卡死不悬停。
  // 已有部分译文 → 视为停止并保留;无译文 → 网络错误。
  port.onDisconnect.addListener(() => {
    if (!finishStream(port)) return;
    if (state.translatedText) {
      dispatch({ type: 'stream-stop' });
    } else {
      dispatch({ type: 'stream-error', message: '翻译连接中断,请重试' });
    }
  });

  try {
    port.postMessage({ type: 'request', text, targetLang: lang });
  } catch {
    // 建连即失败 → 交给 onDisconnect 兜底
  }
}

function stop() {
  if (!isStreaming.value) return;
  const port = streamPort;
  if (!port || !finishStream(port)) return;
  try {
    port.disconnect();
  } catch {
    // port 可能已被后台终结
  }
  dispatch({ type: 'stream-stop' });
}

// 复制当前译文;成功后短暂展示「已复制」反馈(约 1.5s 后恢复)
async function copyTranslation() {
  if (!canCopyTranslation.value) return;
  try {
    await navigator.clipboard.writeText(state.translatedText);
  } catch {
    return; // 剪贴板不可用时保持原状
  }
  copied.value = true;
  if (copiedTimer) clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => {
    copied.value = false;
    copiedTimer = null;
  }, 1500);
}

async function openSettings() {
  // PRD「翻译生命周期」:流式期间进入设置先终止请求并保留部分译文,再切换视图。
  // 返回文本翻译时不自动续传已停止的流(见 backToTranslator,仅切回视图)。
  // stop() 在非流式时为 no-op,故无需在此重复判定 isStreaming。
  stop();
  view.value = 'settings';
  await nextTick();
  settingsPanel.value?.focusFirst();
}

function handleErrorAction() {
  if (state.errorType === 'no-config') {
    void openSettings();
    return;
  }
  void translate();
}

function backToTranslator() {
  view.value = 'translator';
  void nextTick().then(() => sourceArea.value?.focus());
}

function openOptions() {
  browser.runtime.openOptionsPage();
}

function handleAddProvider() {
  settingsPanel.value?.addProvider();
}
</script>

<template>
  <div
    class="popup-shell"
    role="dialog"
    :aria-label="view === 'translator' ? 'Omni AI Translator 文本翻译' : 'Omni AI Translator 设置'"
  >
    <!-- 统一 header -->
    <header class="popup-header">
      <template v-if="view === 'settings'">
        <Button
          variant="ghost"
          size="icon"
          class="popup-header-button -ml-1"
          aria-label="返回文本翻译"
          @click="backToTranslator"
        >
          ←
        </Button>
        <span>设置</span>
      </template>
      <template v-else>
        <img
          src="/icon/128.png"
          alt=""
          width="28"
          height="28"
        >
        <span>Omni AI Translator</span>
        <Button
          variant="ghost"
          size="icon"
          class="popup-header-button -mr-1"
          aria-label="设置"
          @click="openSettings"
        >
          ⚙
        </Button>
      </template>
    </header>

    <!-- 文本翻译工作台(变体 A:工具条 / 原文区 / 翻译按钮 / 译文区) -->
    <main
      v-if="view === 'translator'"
      class="translator-body"
      aria-label="文本翻译"
    >
      <div class="translator-toolbar">
        <span class="source-mode">自动识别</span>
        <span
          class="flow-arrow"
          aria-hidden="true"
        >→</span>
        <!-- 可搜索目标语言选择器(#78):临时目标语言,流式期间锁定切换 -->
        <LanguageSelect
          v-model="targetLangCode"
          :disabled="isStreaming"
          variant="workbench"
          label="目标语言"
          aria-label="目标语言"
        />
      </div>

      <section
        class="text-pane source-pane"
        :class="state.inputPhase === 'overlimit' ? 'is-overlimit' : ''"
        aria-label="原文"
      >
        <div class="pane-heading">
          <label for="popup-source-text">原文</label>
          <span
            class="character-count"
          >
            {{ charCount }} / {{ WORKBENCH_MAX_LENGTH }}
          </span>
        </div>
        <textarea
          id="popup-source-text"
          ref="sourceArea"
          :value="state.sourceText"
          :disabled="isStreaming"
          placeholder="输入或粘贴要翻译的文本"
          aria-label="原文输入区"
          @input="onSourceInput"
          @keydown="onSourceKeydown"
        />
        <button
          v-if="state.sourceText"
          type="button"
          class="pane-icon-button clear-source-button"
          aria-label="清空原文"
          title="清空原文"
          :disabled="isStreaming"
          @click="clearSource"
        >
          ×
        </button>
        <span
          v-if="state.inputPhase === 'overlimit'"
          class="overlimit-message"
          role="alert"
        >超出 {{ charCount - WORKBENCH_MAX_LENGTH }} 字</span>
      </section>

      <!-- 主操作按钮:位置固定在原文区与译文区之间,不随状态跳动;
           流式期间同位置按钮变为「停止」(#79) -->
      <button
        v-if="isStreaming"
        type="button"
        class="stop-action"
        @click="stop"
      >
        <span aria-hidden="true">■</span>
        <span>停止</span>
      </button>
      <button
        v-else
        type="button"
        class="primary-action"
        :disabled="!canTranslate"
        @click="translate"
      >
        <span>翻译</span>
        <kbd>⌘ ↵</kbd>
      </button>

      <section
        class="text-pane result-pane"
        :class="state.outputPhase === 'error' ? 'has-error' : ''"
        aria-label="译文"
      >
        <div class="pane-heading">
          <div class="result-heading-group">
            <span>译文</span>
            <span
              v-if="state.outputPhase === 'success'"
              class="status-badge status-badge--success"
            >已完成</span>
            <span
              v-else-if="isStreaming"
              class="status-badge status-badge--info"
            >翻译中</span>
            <span
              v-else-if="state.outputPhase === 'stopped'"
              class="status-badge status-badge--warning"
            >已停止</span>
            <span
              v-else-if="state.outputPhase === 'error'"
              class="status-badge status-badge--destructive"
            >未完成</span>
          </div>
          <button
            v-if="canCopyTranslation"
            type="button"
            class="pane-icon-button"
            :class="copied ? 'is-copied' : ''"
            :aria-label="copied ? '已复制 ✓' : '复制'"
            :title="copied ? '已复制' : '复制译文'"
            @click="copyTranslation"
          >
            {{ copied ? '✓' : '⧉' }}
          </button>
        </div>
        <ScrollArea class="result-content">
          <!-- 完整或部分译文始终保留；错误横幅作为 pane 内次级状态呈现。 -->
          <div
            v-if="state.translatedText"
            class="result-text"
            aria-live="polite"
          >
            {{ state.translatedText }}<span
              v-if="isStreaming"
              class="stream-cursor"
              aria-hidden="true"
            />
          </div>
          <div
            v-else-if="isStreaming"
            class="empty-result"
          >
            正在翻译…
          </div>
          <div
            v-else
            class="empty-result"
          >
            暂无译文
          </div>
        </ScrollArea>
        <!-- 错误横幅(#80):位于结果 pane 内部，不推动主操作按钮。 -->
        <div
          v-if="state.outputPhase === 'error'"
          class="error-banner"
          role="alert"
        >
          <span>
            <strong>{{ errorBanner.main }}</strong>
            <small v-if="errorBanner.guidance">{{ errorBanner.guidance }}</small>
          </span>
          <button
            type="button"
            @click="handleErrorAction"
          >
            {{ state.errorType === 'no-config' ? '打开设置' : '重试' }}
          </button>
        </div>
      </section>
    </main>

    <!-- 翻译源配置(保留现有能力) -->
    <template v-else>
      <ScrollArea class="flex-1 px-4 py-3">
        <SourceConfigPanel
          ref="settingsPanel"
          variant="popup"
        />
      </ScrollArea>

      <footer class="flex flex-none items-center gap-2 border-t border-border bg-card px-4 py-2">
        <Button
          variant="dashed"
          class="flex-1"
          @click="handleAddProvider"
        >
          + 添加提供方
        </Button>
        <Button
          variant="link"
          size="sm"
          class="px-0 text-xs"
          @click="openOptions"
        >
          打开全部设置 →
        </Button>
      </footer>
    </template>
  </div>
</template>
