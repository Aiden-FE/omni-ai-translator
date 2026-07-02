<script setup lang="ts">
// 选项页：LLM 提供方配置（云端 OpenAI 兼容 / 本地 Ollama）
import { ref, onMounted } from 'vue';
import type { ProviderConfig } from '@/shared/types';
import { getProviders, setProviders, getSettings, setSettings } from '@/shared/storage';

const providers = ref<ProviderConfig[]>([]);
const activeId = ref<string | null>(null);
const targetLang = ref('');
const testMsg = ref('');
const browserLang = ref(navigator.language || '');

// 各类型提供方的完整接口路径默认值（代码不再追加 path，需用户填完整路径）
const DEFAULT_BASE_URL: Record<ProviderConfig['type'], string> = {
  'openai-compatible': 'https://api.openai.com/v1/chat/completions',
  ollama: 'http://localhost:11434/api/chat',
};
// 已知的默认值（含历史 host 形式），切换类型时若 baseUrl 命中则自动替换
const KNOWN_DEFAULT_BASE_URLS = new Set([
  'https://api.openai.com',
  'http://localhost:11434',
  ...Object.values(DEFAULT_BASE_URL),
]);

function baseUrlPlaceholder(type: ProviderConfig['type']): string {
  return type === 'ollama'
    ? '完整接口路径,如 http://localhost:11434/api/chat'
    : '完整接口路径,如 https://api.openai.com/v1/chat/completions';
}

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

onMounted(async () => {
  providers.value = await getProviders();
  const s = await getSettings();
  activeId.value = s.activeProviderId;
  // 目标语言：优先用户已保存设置，否则取浏览器首选语言
  targetLang.value = s.defaultTargetLang || defaultTargetLang();
});

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
  await save();
}

async function removeProvider(id: string) {
  providers.value = providers.value.filter((p) => p.id !== id);
  if (activeId.value === id) activeId.value = null;
  await save();
}

async function save() {
  await setProviders(providers.value);
  await setSettings({ activeProviderId: activeId.value, defaultTargetLang: targetLang.value });
}

async function activate(id: string) {
  activeId.value = id;
  await save();
}

// 切换提供方类型时,若 baseUrl 仍是已知默认值(含历史 host 形式),自动替换为新类型的完整路径默认值
async function onTypeChange(p: ProviderConfig) {
  if (KNOWN_DEFAULT_BASE_URLS.has(p.baseUrl)) {
    p.baseUrl = DEFAULT_BASE_URL[p.type];
  }
  await save();
}

async function testProvider(p: ProviderConfig) {
  testMsg.value = '测试中…';
  const resp = await chrome.runtime.sendMessage({ type: 'test-provider' as const, payload: p });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: { translatedText?: string; error?: string } = resp as any;
  testMsg.value = r.error ? `❌ ${r.error}` : `✅ ${r.translatedText}`;
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
        @change="save"
      >
      <p class="hint">
        留空时自动使用浏览器首选语言（{{ browserLang }}）。
      </p>
    </section>

    <section>
      <h2>LLM 提供方</h2>
      <p class="hint">
        本插件不内置任何模型接口，请自行配置云端 OpenAI 兼容接口或本地 Ollama 接口。
        BaseURL 需填写<b>完整接口路径</b>（如 https://api.openai.com/v1/chat/completions），代码不再自动追加路径。
      </p>
      <div
        v-for="p in providers"
        :key="p.id"
        class="provider-card"
      >
        <div class="row">
          <input
            v-model="p.name"
            placeholder="名称"
            @change="save"
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
          </select>
          <button
            :class="{ active: activeId === p.id }"
            @click="activate(p.id)"
          >
            {{ activeId === p.id ? '已启用' : '启用' }}
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
            @change="save"
          >
          <input
            v-model="p.model"
            placeholder="模型名"
            @change="save"
          >
        </div>
        <div class="row">
          <input
            v-model="p.apiKey"
            type="password"
            placeholder="API Key（Ollama 可留空）"
            @change="save"
          >
          <button @click="testProvider(p)">
            测试连通
          </button>
        </div>
      </div>
      <button @click="addProvider">
        + 添加提供方
      </button>
      <p
        v-if="testMsg"
        class="test-msg"
      >
        {{ testMsg }}
      </p>
    </section>
  </div>
</template>

<style scoped>
.options {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px;
  font-family: system-ui, sans-serif;
}
section {
  margin-bottom: 24px;
}
h2 {
  font-size: 16px;
}
.hint {
  margin: 4px 0 8px;
  font-size: 12px;
  color: #6b7280;
}
.provider-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}
.row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
input,
select {
  padding: 6px 8px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
}
input {
  flex: 1;
}
button {
  padding: 6px 12px;
  cursor: pointer;
}
button.active {
  background: #1f2937;
  color: #fff;
}
.test-msg {
  margin-top: 8px;
  color: #4b5563;
}
</style>
