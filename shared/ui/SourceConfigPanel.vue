<script setup lang="ts">
/**
 * 共享翻译源配置面板 — popup 与 options 共用
 * Issue #35: 从 entrypoints/options/App.vue 抽取,消除双份维护
 *
 * variant:
 *   'popup'  — 适配 400×600 尺寸,卡片可折叠,配置自有源为全宽按钮,底部「打开全部设置」
 *   'options' — 全功能页,max-width 720px,配置自有源为横幅内锚点
 */
import { ref, computed, onMounted, nextTick } from 'vue';
import type {
  ActiveSourcesResult,
  Message,
  ProviderConfig,
  ProviderType,
  TranslateResult,
} from '@/shared/types';
import { getProviders, setProviders, getSettings, setSettings } from '@/shared/storage';
import { DEFAULT_ACTIVE_SOURCE_ID } from '@/shared/translator/builtin-sources';

const props = withDefaults(defineProps<{
  variant?: 'popup' | 'options';
}>(), {
  variant: 'options',
});

// ===== 状态 =====
const providers = ref<ProviderConfig[]>([]);
const activeSourceId = ref<string>(DEFAULT_ACTIVE_SOURCE_ID);
const allSources = ref<ProviderConfig[]>([]);
const targetLang = ref('');
const testMsgs = ref<Record<string, string>>({});
const bannerTestMsg = ref('');
const browserLang = ref(navigator.language || '');

// 卡片折叠状态(popup 变体用),按 provider id 索引;默认展开活跃卡、折叠非活跃
const collapsedCards = ref<Record<string, boolean>>({});

// ===== 常量 =====
const DEFAULT_BASE_URL: Record<ProviderType, string> = {
  'openai-compatible': 'https://api.openai.com/v1/chat/completions',
  ollama: 'http://localhost:11434/api/chat',
  google: 'https://translation.googleapis.com',
  microsoft: 'https://api.cognitive.microsofttranslator.com/translate',
};
const KNOWN_DEFAULT_BASE_URLS = new Set([
  'https://api.openai.com',
  'http://localhost:11434',
  ...Object.values(DEFAULT_BASE_URL),
]);
const FALLBACK_SOURCE_ID = DEFAULT_ACTIVE_SOURCE_ID;

// ===== 计算属性 =====
function isLlmType(type: ProviderType): boolean {
  return type === 'openai-compatible' || type === 'ollama';
}

function baseUrlPlaceholder(type: ProviderType): string {
  if (type === 'ollama') return '完整接口路径,如 http://localhost:11434/api/chat';
  if (type === 'openai-compatible') return '完整接口路径,如 https://api.openai.com/v1/chat/completions';
  return '默认官方端点,可改';
}

function apiKeyPlaceholder(type: ProviderType): string {
  return isLlmType(type) ? 'API Key(Ollama 可留空)' : '留空使用免 Key 兜底;填入则走官方 API';
}

const isFallback = computed(() => activeSourceId.value.startsWith('builtin:'));

const activeSourceName = computed(() => {
  const s = allSources.value.find((x) => x.id === activeSourceId.value);
  return s?.name ?? '免 Key 兜底';
});

function defaultTargetLang(): string {
  const lang = browserLang.value.toLowerCase();
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

// ===== 消息封装 =====
function sendMessage<T>(message: Message): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

async function loadActiveSources() {
  const r = await sendMessage<ActiveSourcesResult>({ type: 'get-active-sources' });
  activeSourceId.value = r.activeSourceId;
  allSources.value = r.sources;
}

// ===== 生命周期 =====
const targetLangInput = ref<HTMLInputElement | null>(null);

onMounted(async () => {
  await loadActiveSources();
  providers.value = await getProviders();
  const s = await getSettings();
  targetLang.value = s.defaultTargetLang || defaultTargetLang();
  // popup 变体:打开即聚焦首个可交互项
  if (props.variant === 'popup') {
    await nextTick();
    targetLangInput.value?.focus();
  }
  // popup 变体:默认折叠非活跃卡片
  if (props.variant === 'popup') {
    for (const p of providers.value) {
      collapsedCards.value[p.id] = p.id !== activeSourceId.value;
    }
  }
});

/** 暴露给父组件:聚焦首个可交互项 + 添加提供方(popup footer 用) */
defineExpose({
  focusFirst() {
    targetLangInput.value?.focus();
  },
  addProvider,
});

// ===== 数据操作 =====
async function saveProviders() {
  await setProviders(providers.value);
  await loadActiveSources();
}

async function saveTargetLang() {
  const s = await getSettings();
  await setSettings({ ...s, defaultTargetLang: targetLang.value });
}

async function addProvider() {
  const id = crypto.randomUUID();
  providers.value.push({
    id,
    name: '新提供方',
    type: 'openai-compatible',
    baseUrl: DEFAULT_BASE_URL['openai-compatible'],
    apiKey: '',
    model: 'gpt-4o-mini',
  });
  // popup 变体:新建卡片默认展开
  if (props.variant === 'popup') {
    collapsedCards.value[id] = false;
  }
  await saveProviders();
}

// 兜底态「配置自有源」:新建提供方卡片并聚焦名称输入(focus 自动滚动入视口)
async function configureOwnSource() {
  await addProvider();
  await nextTick();
  const cards = document.querySelectorAll('.provider-card');
  const last = cards[cards.length - 1];
  last?.querySelector('input')?.focus();
}

async function removeProvider(id: string) {
  if (activeSourceId.value === id) {
    await sendMessage({ type: 'set-active-source', payload: { id: FALLBACK_SOURCE_ID } });
  }
  providers.value = providers.value.filter((p) => p.id !== id);
  delete collapsedCards.value[id];
  await saveProviders();
}

async function activate(id: string) {
  const target = activeSourceId.value === id ? FALLBACK_SOURCE_ID : id;
  await sendMessage({ type: 'set-active-source', payload: { id: target } });
  await loadActiveSources();
}

async function onTypeChange(p: ProviderConfig) {
  if (KNOWN_DEFAULT_BASE_URLS.has(p.baseUrl)) {
    p.baseUrl = DEFAULT_BASE_URL[p.type];
  }
  if (p.type !== 'openai-compatible') {
    p.responseStyle = 'openai';
  }
  const next = { ...testMsgs.value };
  delete next[p.id];
  testMsgs.value = next;
  await saveProviders();
}

function responseStyleHint(p: ProviderConfig): string {
  return p.responseStyle === 'anthropic'
    ? '适用于原生 Anthropic Messages API 端点(如 Claude 官方 https://api.anthropic.com/v1/messages)'
    : '适用于 OpenAI 兼容端点';
}

async function onResponseStyleChange(p: ProviderConfig, style: 'openai' | 'anthropic') {
  p.responseStyle = style;
  const next = { ...testMsgs.value };
  delete next[p.id];
  testMsgs.value = next;
  await saveProviders();
}

async function testProvider(p: ProviderConfig) {
  testMsgs.value = { ...testMsgs.value, [p.id]: '测试中…' };
  const resp = await sendMessage<TranslateResult>({ type: 'test-provider', payload: p });
  testMsgs.value = {
    ...testMsgs.value,
    [p.id]: resp.error ? `❌ ${resp.error}` : `✅ ${resp.translatedText}`,
  };
}

async function testBuiltin() {
  const cfg = allSources.value.find((s) => s.id === activeSourceId.value);
  if (!cfg) return;
  bannerTestMsg.value = '测试中…';
  const resp = await sendMessage<TranslateResult>({ type: 'test-provider', payload: cfg });
  bannerTestMsg.value = resp.error ? `❌ ${resp.error}` : `✅ ${resp.translatedText}`;
}

function isOk(msg: string): boolean {
  return msg.startsWith('✅');
}

function isErr(msg: string): boolean {
  return msg.startsWith('❌');
}

// 卡片折叠切换(popup 变体)
function toggleCollapse(id: string) {
  collapsedCards.value[id] = !collapsedCards.value[id];
}

function isCollapsed(id: string): boolean {
  return collapsedCards.value[id] ?? false;
}
</script>

<template>
  <div :class="['source-config', `source-config--${variant}`]">
    <!-- 目标语言 -->
    <section class="lang-section">
      <label
        class="lang-label"
        for="target-lang-input"
      >默认目标语言</label>
      <input
        id="target-lang-input"
        ref="targetLangInput"
        v-model="targetLang"
        placeholder="留空则使用浏览器首选语言"
        @change="saveTargetLang"
      >
      <p class="hint">
        留空时自动使用浏览器首选语言({{ browserLang }})。
      </p>
    </section>

    <!-- 翻译源管理 -->
    <section class="source-section">
      <h2 v-if="variant === 'options'">
        翻译源管理
      </h2>
      <p class="hint">
        未配置时使用免 Key 兜底翻译;配置自有源后覆盖兜底。
      </p>

      <!-- 当前生效源横幅 -->
      <div
        class="effective"
        :data-state="isFallback ? 'fallback' : 'active'"
        role="status"
        :aria-label="`当前生效:${isFallback ? '免 Key 兜底' : activeSourceName}`"
      >
        <span
          class="effective__dot"
          aria-hidden="true"
        />
        <div class="effective__body">
          <div class="effective__label">
            当前生效
          </div>
          <div class="effective__value">
            {{ isFallback ? '免 Key 兜底' : activeSourceName }}
          </div>
          <div
            v-if="isFallback"
            class="effective__note"
          >
            未配置自有源,待翻译文本将外传到 Google / 微软完成翻译。
          </div>
          <div
            v-else
            class="effective__note"
          >
            翻译请求将发送到该翻译源。
          </div>
        </div>
        <!-- options 变体:横幅内「配置自有源」锚点 -->
        <a
          v-if="isFallback && variant === 'options'"
          class="effective__action"
          href="#"
          @click.prevent="configureOwnSource"
        >配置自有源 →</a>
      </div>

      <!-- 兜底态:测试连通 + inline 结果 -->
      <div
        v-if="isFallback"
        class="banner-test"
      >
        <button @click="testBuiltin">
          测试连通
        </button>
        <span
          v-if="bannerTestMsg"
          class="test-msg inline"
          :class="{ ok: isOk(bannerTestMsg), err: isErr(bannerTestMsg) }"
        >{{ bannerTestMsg }}</span>
      </div>

      <!-- popup 变体:兜底态全宽「配置自有源」按钮 -->
      <button
        v-if="isFallback && variant === 'popup'"
        class="configure-btn"
        @click="configureOwnSource"
      >
        + 配置自有源
      </button>

      <!-- 源卡片 -->
      <div
        v-for="p in providers"
        :key="p.id"
        class="provider-card"
        :data-active="activeSourceId === p.id"
        :data-collapsed="variant === 'popup' ? isCollapsed(p.id) : false"
      >
        <!-- 卡片头部 -->
        <div
          class="card__head"
          :class="{ 'card__head--clickable': variant === 'popup' }"
          @click="variant === 'popup' ? toggleCollapse(p.id) : undefined"
        >
          <input
            v-model="p.name"
            placeholder="名称"
            @click.stop
            @change="saveProviders"
          >
          <button
            :class="{ active: activeSourceId === p.id }"
            @click.stop="activate(p.id)"
          >
            {{ activeSourceId === p.id ? '已启用' : '启用' }}
          </button>
          <button @click.stop="removeProvider(p.id)">
            删除
          </button>
          <span
            v-if="variant === 'popup'"
            class="card__chevron"
            aria-hidden="true"
          >▸</span>
        </div>

        <!-- 卡片主体 -->
        <div class="card__body">
          <div class="row">
            <select
              v-model="p.type"
              @change="onTypeChange(p)"
            >
              <optgroup label="LLM 接口配置">
                <option value="openai-compatible">
                  OpenAI 兼容
                </option>
                <option value="ollama">
                  Ollama
                </option>
              </optgroup>
              <optgroup label="传统翻译">
                <option value="google">
                  Google 翻译
                </option>
                <option value="microsoft">
                  微软翻译
                </option>
              </optgroup>
            </select>
          </div>
          <div class="row">
            <input
              v-model="p.baseUrl"
              data-testid="base-url"
              :placeholder="baseUrlPlaceholder(p.type)"
              @change="saveProviders"
            >
            <input
              v-if="isLlmType(p.type)"
              v-model="p.model"
              placeholder="模型名"
              @change="saveProviders"
            >
          </div>
          <!-- 响应风格单选:仅 openai-compatible 类型展示 -->
          <div
            v-if="p.type === 'openai-compatible'"
            class="row response-style-row"
            data-testid="response-style"
          >
            <span class="response-style-label">响应风格</span>
            <label class="response-style-option">
              <input
                type="radio"
                value="openai"
                :name="`response-style-${p.id}`"
                :checked="(p.responseStyle ?? 'openai') === 'openai'"
                @change="onResponseStyleChange(p, 'openai')"
              >
              openai
            </label>
            <label class="response-style-option">
              <input
                type="radio"
                value="anthropic"
                :name="`response-style-${p.id}`"
                :checked="p.responseStyle === 'anthropic'"
                @change="onResponseStyleChange(p, 'anthropic')"
              >
              anthropic
            </label>
            <span class="hint response-style-hint">
              {{ responseStyleHint(p) }}
            </span>
          </div>
          <div class="row">
            <input
              v-model="p.apiKey"
              type="password"
              :placeholder="apiKeyPlaceholder(p.type)"
              @change="saveProviders"
            >
            <button @click="testProvider(p)">
              测试连通
            </button>
          </div>
          <!-- microsoft 有 Key 场景:region 输入框 -->
          <div
            v-if="p.type === 'microsoft' && p.apiKey"
            class="row"
          >
            <input
              v-model="p.region"
              data-testid="region"
              placeholder="Azure 区域,如 eastus"
              @change="saveProviders"
            >
          </div>
          <p
            v-if="testMsgs[p.id]"
            class="test-msg inline"
            :class="{ ok: isOk(testMsgs[p.id]), err: isErr(testMsgs[p.id]) }"
          >
            {{ testMsgs[p.id] }}
          </p>
        </div>
      </div>

      <!-- 添加提供方(options 变体:按钮在卡片列表后;popup 变体由父组件 footer 渲染) -->
      <button
        v-if="variant === 'options'"
        class="add-btn add-btn--options"
        @click="addProvider"
      >
        + 添加提供方
      </button>
    </section>
  </div>
</template>

<style scoped>
/* ===== 共享基础样式 ===== */
.source-config {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: #111827;
}

.lang-section {
  margin-bottom: 12px;
}
.lang-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 4px;
}

.source-section {
  margin-bottom: 0;
}

h2 {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px;
}

.hint {
  margin: 4px 0 12px;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.6;
}

/* ===== 当前生效源横幅 ===== */
.effective {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 12px;
  border: 1px solid #e5e7eb;
  background: #fff;
  transition: border-color 160ms ease, background 160ms ease;
}
.effective__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #6b7280;
  margin-top: 6px;
  flex: none;
}
.effective[data-state="active"] .effective__dot {
  background: #16a34a;
}
.effective__body {
  flex: 1;
  min-width: 0;
}
.effective__label {
  font-size: 11px;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.effective__value {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  margin-top: 1px;
}
.effective__note {
  font-size: 12px;
  color: #4b5563;
  margin-top: 2px;
  line-height: 1.55;
}
.effective__action {
  font-size: 12px;
  font-weight: 600;
  color: #1f2937;
  text-decoration: none;
  white-space: nowrap;
  padding-top: 1px;
}
.effective__action:hover {
  text-decoration: underline;
}
.effective[data-state="fallback"] {
  background: #f3f4f6;
  border-color: #d1d5db;
}
.effective[data-state="active"] {
  background: #fff;
}

/* ===== 兜底态「配置自有源」全宽按钮(popup) ===== */
.configure-btn {
  width: 100%;
  padding: 9px;
  margin-bottom: 12px;
  border: 1px solid #1f2937;
  border-radius: 4px;
  background: #1f2937;
  color: #fff;
  font-weight: 500;
  cursor: pointer;
  transition: background 120ms ease;
}
.configure-btn:hover {
  background: #374151;
}

/* ===== 横幅兜底态测试连通 ===== */
.banner-test {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

/* ===== 源卡片 ===== */
.provider-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 8px;
  background: #fff;
  transition: border-color 160ms ease, box-shadow 160ms ease;
  overflow: hidden;
}
.provider-card[data-active="true"] {
  border-color: #1f2937;
  box-shadow: 0 0 0 1px #1f2937;
}
.card__head {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
}
.card__head--clickable {
  cursor: pointer;
}
.card__chevron {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  color: #6b7280;
  font-size: 12px;
  transition: transform 160ms ease;
  flex: none;
}
.provider-card[data-collapsed="false"] .card__chevron {
  transform: rotate(90deg);
}
.card__body {
  padding: 0 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.provider-card[data-collapsed="true"] .card__body {
  display: none;
}
.row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.row > input,
.row > select {
  flex: 1;
  min-width: 0;
}

/* ===== 响应风格单选 ===== */
.response-style-label {
  font-size: 13px;
  color: #374151;
  white-space: nowrap;
  padding-top: 1px;
}
.response-style-option {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #1f2937;
  cursor: pointer;
  white-space: nowrap;
}
.response-style-option input {
  flex: none;
  width: auto;
}
.response-style-hint {
  margin: 0;
  flex: 1;
  min-width: 0;
}

/* ===== 通用控件 ===== */
input,
select,
button {
  font-family: inherit;
  font-size: 13px;
  color: inherit;
}
input,
select {
  padding: 6px 8px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #fff;
}
input {
  flex: 1;
  min-width: 0;
}
input:focus,
select:focus,
button:focus-visible {
  outline: 2px solid #1f2937;
  outline-offset: 1px;
  border-color: #1f2937;
}
button {
  padding: 6px 10px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
  white-space: nowrap;
}
button:hover {
  background: #f3f4f6;
}
button.active {
  background: #1f2937;
  color: #fff;
  border-color: #1f2937;
}
button.active:hover {
  background: #374151;
}

/* ===== 测试结果 inline ===== */
.test-msg {
  font-size: 12px;
  color: #4b5563;
}
.test-msg.inline {
  margin: 0;
}
.test-msg.ok {
  color: #16a34a;
}
.test-msg.err {
  color: #dc2626;
}

/* ===== 添加提供方按钮 ===== */
.add-btn {
  padding: 9px;
  border: 1px dashed #d1d5db;
  background: transparent;
  border-radius: 4px;
  color: #6b7280;
  font-weight: 500;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
.add-btn:hover {
  background: #f3f4f6;
  color: #111827;
}
.add-btn--options {
  width: auto;
  border-style: solid;
  border-color: #d1d5db;
}

@media (prefers-reduced-motion: reduce) {
  * {
    transition: none !important;
  }
}
</style>
