<script setup lang="ts">
// 选项页：翻译源管理（LLM / 传统 API Key / 免 Key 兜底 统一管理）
// v0.2：源类型下拉扩展为 4 项，顶部生效源提示行走 get-active-sources/set-active-source 新契约，
// 连通性测试覆盖 LLM、传统 API Key、免 Key 兜底源，结果 inline 展示。
import { ref, computed, onMounted } from 'vue';
import type {
  ActiveSourcesResult,
  Message,
  ProviderConfig,
  ProviderType,
  TranslateResult,
} from '@/shared/types';
import { getProviders, setProviders, getSettings, setSettings } from '@/shared/storage';
// 复用后端默认生效源常量，避免 UI 与后端默认值脱钩
import { DEFAULT_ACTIVE_SOURCE_ID } from '@/shared/translator/builtin-sources';

const providers = ref<ProviderConfig[]>([]);
// 当前生效源 ID（经 get-active-sources 解析，null → builtin:microsoft）
// 初始化为默认兜底源，使加载前横幅即呈现正确的兜底态
const activeSourceId = ref<string>(DEFAULT_ACTIVE_SOURCE_ID);
// 合并后的全部可用源（内置免 Key 源 + 用户源），供横幅展示与兜底测试
const allSources = ref<ProviderConfig[]>([]);
const targetLang = ref('');
// 每卡 inline 测试结果，按 provider id 索引
const testMsgs = ref<Record<string, string>>({});
// 横幅兜底态测试连通结果
const bannerTestMsg = ref('');
const browserLang = ref(navigator.language || '');

// 各类型源的字段默认值
// google/microsoft 为传统翻译源，baseUrl 默认官方端点（后端当前忽略，PRD #3 启用「有 Key 走官方 API」时生效）
const DEFAULT_BASE_URL: Record<ProviderType, string> = {
  'openai-compatible': 'https://api.openai.com/v1/chat/completions',
  ollama: 'http://localhost:11434/api/chat',
  google: 'https://translation.googleapis.com',
  microsoft: 'https://api.cognitive.microsofttranslator.com/translate',
};
// 已知的默认值（含历史 host 形式），切换类型时若 baseUrl 命中则自动替换
const KNOWN_DEFAULT_BASE_URLS = new Set([
  'https://api.openai.com',
  'http://localhost:11434',
  ...Object.values(DEFAULT_BASE_URL),
]);

// 默认生效的免 Key 兜底源 ID（复用后端 DEFAULT_ACTIVE_SOURCE_ID 常量）
const FALLBACK_SOURCE_ID = DEFAULT_ACTIVE_SOURCE_ID;

function isLlmType(type: ProviderType): boolean {
  return type === 'openai-compatible' || type === 'ollama';
}

function baseUrlPlaceholder(type: ProviderType): string {
  if (type === 'ollama') return '完整接口路径，如 http://localhost:11434/api/chat';
  if (type === 'openai-compatible') return '完整接口路径，如 https://api.openai.com/v1/chat/completions';
  return '默认官方端点，可改';
}

function apiKeyPlaceholder(type: ProviderType): string {
  return isLlmType(type) ? 'API Key（Ollama 可留空）' : '留空使用免 Key 兜底；填入则走官方 API';
}

// 兜底生效：当前生效源为内置免 Key 源
const isFallback = computed(() => activeSourceId.value.startsWith('builtin:'));

// 当前生效源名称（兜底态显示「免 Key 兜底」，自有源态显示源名称）
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

// 类型化消息发送封装
function sendMessage<T>(message: Message): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

// 读取当前生效源（新契约 get-active-sources）
async function loadActiveSources() {
  const r = await sendMessage<ActiveSourcesResult>({ type: 'get-active-sources' });
  activeSourceId.value = r.activeSourceId;
  allSources.value = r.sources;
}

onMounted(async () => {
  await loadActiveSources();
  providers.value = await getProviders();
  const s = await getSettings();
  // 目标语言：优先用户已保存设置，否则取浏览器首选语言
  targetLang.value = s.defaultTargetLang || defaultTargetLang();
});

// 保存用户源列表并刷新合并源（保持横幅 allSources 同步）
async function saveProviders() {
  await setProviders(providers.value);
  await loadActiveSources();
}

// 保存目标语言（read-merge，避免覆盖 activeProviderId——生效源经 set-active-source 管理）
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
  await saveProviders();
}

async function removeProvider(id: string) {
  // 删除的若为当前生效源，先回退到默认兜底，避免横幅短暂停留在已删除源
  if (activeSourceId.value === id) {
    await sendMessage({ type: 'set-active-source', payload: { id: FALLBACK_SOURCE_ID } });
  }
  providers.value = providers.value.filter((p) => p.id !== id);
  await saveProviders();
}

// 启用/切换生效源（新契约 set-active-source）
// 已激活的自有源再次点击 → 回兜底，避免「启用自有源后无法回到兜底」死路
async function activate(id: string) {
  const target = activeSourceId.value === id ? FALLBACK_SOURCE_ID : id;
  await sendMessage({ type: 'set-active-source', payload: { id: target } });
  await loadActiveSources();
}

// 切换源类型时，若 baseUrl 仍是已知默认值（含历史 host 形式），自动替换为新类型默认值
async function onTypeChange(p: ProviderConfig) {
  if (KNOWN_DEFAULT_BASE_URLS.has(p.baseUrl)) {
    p.baseUrl = DEFAULT_BASE_URL[p.type];
  }
  // 类型变更后旧测试结果失效，清除
  const next = { ...testMsgs.value };
  delete next[p.id];
  testMsgs.value = next;
  await saveProviders();
}

// 连通性测试（复用 test-provider 通道，对 LLM、传统 API Key、免 Key 兜底源均生效）
async function testProvider(p: ProviderConfig) {
  testMsgs.value = { ...testMsgs.value, [p.id]: '测试中…' };
  const resp = await sendMessage<TranslateResult>({ type: 'test-provider', payload: p });
  testMsgs.value = {
    ...testMsgs.value,
    [p.id]: resp.error ? `❌ ${resp.error}` : `✅ ${resp.translatedText}`,
  };
}

// 横幅兜底态：测试当前生效的内置免 Key 源
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
</script>

<template>
  <div class="options">
    <h1>LLM Translator 设置</h1>

    <section>
      <h2>默认目标语言</h2>
      <input
        v-model="targetLang"
        placeholder="留空则使用浏览器首选语言"
        @change="saveTargetLang"
      >
      <p class="hint">
        留空时自动使用浏览器首选语言（{{ browserLang }}）。
      </p>
    </section>

    <section id="source-section">
      <h2>翻译源管理</h2>
      <p class="hint">
        未配置时使用免 Key 兜底翻译；配置自有源后覆盖兜底。
      </p>

      <!-- 当前生效源提示行：兜底态 / 自有源态 -->
      <div
        class="effective"
        :data-state="isFallback ? 'fallback' : 'active'"
        role="status"
        :aria-label="`当前生效：${isFallback ? '免 Key 兜底' : activeSourceName}`"
      >
        <span class="effective__label">当前生效</span>
        <div class="effective__body">
          <div class="effective__value">
            {{ isFallback ? '免 Key 兜底' : activeSourceName }}
          </div>
          <div
            v-if="isFallback"
            class="effective__note"
          >
            未配置自有源，待翻译文本将外传到 Google / 微软完成翻译。
          </div>
          <div
            v-else
            class="effective__note"
          >
            翻译请求将发送到该翻译源。
          </div>
        </div>
        <a
          v-if="isFallback"
          class="effective__action"
          href="#source-section"
        >配置自有源 →</a>
      </div>

      <!-- 兜底态：测试连通 + inline 结果 -->
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

      <div
        v-for="p in providers"
        :key="p.id"
        class="provider-card"
        :data-active="activeSourceId === p.id"
      >
        <div class="row">
          <input
            v-model="p.name"
            placeholder="名称"
            @change="saveProviders"
          >
          <select
            v-model="p.type"
            @change="onTypeChange(p)"
          >
            <option value="openai-compatible">
              OpenAI 兼容（云端）
            </option>
            <option value="ollama">
              Ollama（本地）
            </option>
            <option value="google">
              Google 翻译
            </option>
            <option value="microsoft">
              微软翻译
            </option>
          </select>
          <button
            :class="{ active: activeSourceId === p.id }"
            @click="activate(p.id)"
          >
            {{ activeSourceId === p.id ? '已启用' : '启用' }}
          </button>
          <button @click="removeProvider(p.id)">
            删除
          </button>
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
        <!-- microsoft 有 Key 场景：region 输入框（消费 ProviderConfig.region，无 Key 或非 microsoft 源不显示） -->
        <div
          v-if="p.type === 'microsoft' && p.apiKey"
          class="row"
        >
          <input
            v-model="p.region"
            data-testid="region"
            placeholder="Azure 区域，如 eastus"
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
      <button @click="addProvider">
        + 添加提供方
      </button>
    </section>
  </div>
</template>

<style scoped>
.options {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px;
  font-family: system-ui, -apple-system, sans-serif;
  color: #111827;
}
section {
  margin-bottom: 24px;
}
h1 {
  font-size: 22px;
  font-weight: 600;
  margin: 0 0 24px;
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

/* ===== 当前生效源提示行 ===== */
.effective {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  border: 1px solid #e5e7eb;
  background: #fff;
  transition: border-color 160ms ease, background 160ms ease;
}
.effective__label {
  font-size: 12px;
  color: #6b7280;
  white-space: nowrap;
  padding-top: 1px;
}
.effective__body {
  flex: 1;
  min-width: 0;
}
.effective__value {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
}
/* 隐私提示文字用 #4b5563（gray-600），在 #f3f4f6 底上对比度≈6.9:1，满足 WCAG AA 正文 */
.effective__note {
  font-size: 12px;
  color: #4b5563;
  margin-top: 2px;
  line-height: 1.6;
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
/* 兜底生效态：中性提示底（信息性提示，非错误，不用警告红） */
.effective[data-state="fallback"] {
  background: #f3f4f6;
  border-color: #d1d5db;
}
/* 自有源生效态：白底 */
.effective[data-state="active"] {
  background: #fff;
}

/* 横幅兜底态测试连通 */
.banner-test {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

/* ===== 源卡片 ===== */
.provider-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
  background: #fff;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
.provider-card[data-active="true"] {
  border-color: #1f2937;
  box-shadow: 0 0 0 1px #1f2937;
}
.row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  align-items: center;
}
.row:last-child {
  margin-bottom: 0;
}
input,
select,
button {
  font-family: inherit;
  font-size: 14px;
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
select:focus {
  outline: 2px solid #1f2937;
  outline-offset: 1px;
  border-color: #1f2937;
}
button {
  padding: 6px 12px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
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
  margin-top: 8px;
  font-size: 12px;
  color: #4b5563;
}
.test-msg.inline {
  margin-top: 0;
}
.test-msg.ok {
  color: #16a34a;
}
.test-msg.err {
  color: #dc2626;
}

@media (prefers-reduced-motion: reduce) {
  * {
    transition: none !important;
  }
}
</style>
