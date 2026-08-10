<script setup lang="ts">
// popup:#77 文本翻译工作台(变体 A 上下工作台)为默认视图;
// 翻译源配置(SourceConfigPanel)经 header 设置入口访问(保留现有能力)。
// #79:翻译经 browser.runtime.connect({ name: 'translate-stream' }) 流式 port 通道发起,
// 复用划词翻译 StreamPortMessage 契约(request / chunk / done / error);
// 译文增量渲染 + 光标反馈,主按钮在流式期间变为「停止」。
// 状态机来自 shared/popup-workbench.ts;不持久化输入文本、译文或历史。
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue';
import SourceConfigPanel from '@/shared/ui/SourceConfigPanel.vue';
import Button from '@/shared/ui/components/button/Button.vue';
import ScrollArea from '@/shared/ui/components/scroll-area/ScrollArea.vue';
import LanguageSelect from '@/shared/ui/components/language-select/LanguageSelect.vue';
import { getSettings } from '@/shared/storage';
import { resolveInitialTargetLang } from '@/shared/language-catalog';
import type { StreamPortMessage } from '@/shared/types';
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
      dispatch({ type: 'stream-error', message: msg.result.error ?? '翻译失败,请重试' });
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

async function openSettings() {
  view.value = 'settings';
  await nextTick();
  settingsPanel.value?.focusFirst();
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
    class="flex h-[600px] w-[400px] flex-col overflow-hidden rounded-lg border border-border bg-background text-foreground shadow-2xl"
    role="dialog"
    :aria-label="view === 'translator' ? 'Omni AI Translator 文本翻译' : 'Omni AI Translator 设置'"
  >
    <!-- 统一 header -->
    <header class="flex h-12 flex-none items-center gap-2 bg-primary px-4 text-primary-foreground">
      <template v-if="view === 'settings'">
        <Button
          variant="ghost"
          size="icon"
          class="-ml-1 flex-none text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
          aria-label="返回文本翻译"
          @click="backToTranslator"
        >
          ←
        </Button>
        <span class="min-w-0 flex-1 text-sm font-semibold">设置</span>
      </template>
      <template v-else>
        <div
          class="grid h-6 w-6 flex-none place-items-center rounded-md bg-primary-foreground text-sm font-bold text-primary"
          aria-hidden="true"
        >
          译
        </div>
        <span class="min-w-0 flex-1 truncate text-sm font-semibold">Omni AI Translator</span>
        <Button
          variant="ghost"
          size="icon"
          class="-mr-1 flex-none text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
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
      class="flex min-h-0 flex-1 flex-col gap-3 px-4 py-3"
      aria-label="文本翻译"
    >
      <div class="flex flex-none items-center gap-2 text-sm text-muted-foreground">
        <span>自动识别</span>
        <span aria-hidden="true">→</span>
        <!-- 可搜索目标语言选择器(#78):临时目标语言,流式期间锁定切换 -->
        <LanguageSelect
          v-model="targetLangCode"
          :disabled="isStreaming"
          aria-label="目标语言"
        />
      </div>

      <section
        class="flex flex-none flex-col gap-1"
        aria-label="原文"
      >
        <div class="flex items-baseline justify-between">
          <span class="text-xs font-medium">原文</span>
          <span
            class="text-xs tabular-nums"
            :class="state.inputPhase === 'overlimit' ? 'text-destructive' : 'text-muted-foreground'"
          >
            {{ charCount }} / {{ WORKBENCH_MAX_LENGTH }}
          </span>
        </div>
        <textarea
          ref="sourceArea"
          :value="state.sourceText"
          :disabled="isStreaming"
          class="h-36 w-full resize-none rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          :class="state.inputPhase === 'overlimit' ? 'border-destructive' : ''"
          placeholder="输入或粘贴要翻译的文本"
          aria-label="原文输入区"
          @input="onSourceInput"
          @keydown="onSourceKeydown"
        />
        <!-- 超限提示占位高度固定(visibility 切换),主操作按钮位置不随状态跳动 -->
        <p
          class="text-xs"
          :class="state.inputPhase === 'overlimit' ? 'text-destructive' : 'invisible'"
          :role="state.inputPhase === 'overlimit' ? 'alert' : undefined"
        >
          已超出 {{ Math.max(charCount - WORKBENCH_MAX_LENGTH, 0) }} 字,最多可翻译 {{ WORKBENCH_MAX_LENGTH }} 字
        </p>
      </section>

      <!-- 主操作按钮:位置固定在原文区与译文区之间,不随状态跳动;
           流式期间同位置按钮变为「停止」(#79) -->
      <div class="flex-none">
        <Button
          class="h-10 w-full"
          :variant="isStreaming ? 'destructive' : 'default'"
          :disabled="isStreaming ? false : !canTranslate"
          @click="isStreaming ? stop() : translate()"
        >
          <template v-if="isStreaming">
            停止
          </template>
          <template v-else>
            翻译
            <kbd class="ml-2 text-xs opacity-70">⌘ ↵</kbd>
          </template>
        </Button>
      </div>

      <section
        class="flex min-h-0 flex-1 flex-col gap-1"
        aria-label="译文"
      >
        <div class="flex flex-none items-baseline justify-between">
          <span class="text-xs font-medium">译文</span>
          <span
            v-if="state.outputPhase === 'success'"
            class="text-xs text-success"
          >已完成</span>
          <span
            v-else-if="isStreaming"
            class="text-xs text-muted-foreground"
          >翻译中</span>
          <span
            v-else-if="state.outputPhase === 'stopped'"
            class="text-xs text-muted-foreground"
          >已停止</span>
        </div>
        <ScrollArea class="min-h-0 flex-1 rounded-md border border-border bg-muted/40">
          <div
            v-if="state.outputPhase === 'error'"
            class="px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {{ state.errorMessage }}
          </div>
          <!-- 流式进行中:已到达的部分译文 + 闪烁光标 -->
          <div
            v-else-if="isStreaming"
            class="whitespace-pre-wrap px-3 py-2 text-sm"
            aria-live="polite"
          >
            <span
              v-if="!state.translatedText"
              class="text-muted-foreground"
            >正在翻译…</span>{{ state.translatedText }}<span
              class="stream-cursor text-muted-foreground"
              aria-hidden="true"
            >▋</span>
          </div>
          <!-- 完成 / 已停止:保留译文(停止后为已到达的部分译文) -->
          <div
            v-else-if="state.translatedText"
            class="whitespace-pre-wrap px-3 py-2 text-sm"
            aria-live="polite"
          >
            {{ state.translatedText }}
          </div>
          <div
            v-else
            class="px-3 py-2 text-sm text-muted-foreground"
          >
            译文将显示在这里
          </div>
        </ScrollArea>
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
