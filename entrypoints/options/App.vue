<script setup lang="ts">
// 选项页：LLM 提供方配置（云端 OpenAI 兼容 / 本地 Ollama）
import { ref, onMounted } from 'vue';
import type { ProviderConfig } from '@/shared/types';
import { getProviders, setProviders, getSettings, setSettings } from '@/shared/storage';

const providers = ref<ProviderConfig[]>([]);
const activeId = ref<string | null>(null);
const targetLang = ref('中文');
const testMsg = ref('');

onMounted(async () => {
  providers.value = await getProviders();
  const s = await getSettings();
  activeId.value = s.activeProviderId;
  targetLang.value = s.defaultTargetLang;
});

async function addProvider() {
  const id = crypto.randomUUID();
  providers.value.push({
    id,
    name: '新提供方',
    type: 'openai-compatible',
    baseUrl: 'https://api.openai.com',
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
        placeholder="如：中文、English"
        @change="save"
      >
    </section>

    <section>
      <h2>LLM 提供方</h2>
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
            @change="save"
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
            placeholder="BaseURL"
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
