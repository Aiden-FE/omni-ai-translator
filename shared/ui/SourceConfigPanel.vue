<script setup lang="ts">
/**
 * 共享翻译源配置面板 — popup 与 options 共用。
 * 本文件只迁移渲染层到 tailwind + shadcn-vue 基础组件,业务契约保持不变。
 */
import { ref, computed, onMounted, nextTick } from 'vue';
import type {
  ActiveSourcesResult,
  Message,
  ProviderConfig,
  ProviderType,
  TranslateResult,
  LlmProtocol,
} from '@/shared/types';
import { getProviders, setProviders, getSettings, setSettings } from '@/shared/storage';
import { DEFAULT_ACTIVE_SOURCE_ID } from '@/shared/translator/builtin-sources';
import {
  DEFAULT_LLM_BASE_URL_BY_PROTOCOL,
  resolveLlmEndpoint,
} from '@/shared/translator/llm-protocol';
import Button from '@/shared/ui/components/button/Button.vue';
import Card from '@/shared/ui/components/card/Card.vue';
import Input from '@/shared/ui/components/input/Input.vue';
import Label from '@/shared/ui/components/label/Label.vue';
import Select from '@/shared/ui/components/select/Select.vue';
import Badge from '@/shared/ui/components/badge/Badge.vue';
import LanguageSelect from '@/shared/ui/components/language-select/LanguageSelect.vue';
import { findLanguageByCode } from '@/shared/language-catalog';

const props = withDefaults(defineProps<{
  variant?: 'popup' | 'options';
}>(), {
  variant: 'options',
});

const providers = ref<ProviderConfig[]>([]);
const activeSourceId = ref<string>(DEFAULT_ACTIVE_SOURCE_ID);
const allSources = ref<ProviderConfig[]>([]);
// 默认目标语言（BCP 47 代码；空字符串 = 跟随浏览器首选语言，#81）
const targetLang = ref('');
const testMsgs = ref<Record<string, string>>({});
const bannerTestMsg = ref('');
const browserLang = ref(navigator.language || '');
const collapsedCards = ref<Record<string, boolean>>({});
const langSelect = ref<InstanceType<typeof LanguageSelect> | null>(null);

const DEFAULT_BASE_URL: Record<ProviderType, string> = {
  llm: DEFAULT_LLM_BASE_URL_BY_PROTOCOL['openai-completions'],
  google: 'https://translation.googleapis.com',
  microsoft: 'https://api.cognitive.microsofttranslator.com/translate',
};

const LLM_PROTOCOLS: LlmProtocol[] = [
  'openai-completions',
  'openai-responses',
  'anthropic',
  'ollama',
];

const KNOWN_DEFAULT_BASE_URLS = new Set([
  'https://api.openai.com',
  'https://api.anthropic.com',
  ...Object.values(DEFAULT_BASE_URL),
  ...LLM_PROTOCOLS.flatMap((protocol) => {
    const baseUrl = DEFAULT_LLM_BASE_URL_BY_PROTOCOL[protocol];
    return [baseUrl, resolveLlmEndpoint(baseUrl, protocol)];
  }),
]);
const FALLBACK_SOURCE_ID = DEFAULT_ACTIVE_SOURCE_ID;

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function isKnownDefaultBaseUrl(baseUrl: string): boolean {
  return KNOWN_DEFAULT_BASE_URLS.has(normalizeBaseUrl(baseUrl));
}

function isLlmType(type: ProviderType): boolean {
  return type === 'llm';
}

function baseUrlPlaceholder(type: ProviderType): string {
  if (type === 'llm') return '如 https://api.openai.com/v1';
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

function sendMessage<T>(message: Message): Promise<T> {
  return browser.runtime.sendMessage(message) as Promise<T>;
}

async function loadActiveSources() {
  const r = await sendMessage<ActiveSourcesResult>({ type: 'get-active-sources' });
  activeSourceId.value = r.activeSourceId;
  allSources.value = r.sources;
}

onMounted(async () => {
  await loadActiveSources();
  providers.value = await getProviders();
  const s = await getSettings();
  // 未知/历史遗留值（旧版展示名）视为未配置 → 跟随浏览器首选语言（#81）
  targetLang.value = findLanguageByCode(s.defaultTargetLang ?? '') ? s.defaultTargetLang : '';

  if (props.variant === 'popup') {
    await nextTick();
    langSelect.value?.focusTrigger();
    for (const p of providers.value) {
      collapsedCards.value[p.id] = p.id !== activeSourceId.value;
    }
  }
});

defineExpose({
  focusFirst() {
    langSelect.value?.focusTrigger();
  },
  addProvider,
});

async function saveProviders() {
  await setProviders(providers.value);
  await loadActiveSources();
}

// 选择即持久化（#81）：空字符串表示跟随浏览器首选语言
async function saveTargetLang() {
  const s = await getSettings();
  await setSettings({ ...s, defaultTargetLang: targetLang.value });
}

async function onTargetLangChange(code: string) {
  targetLang.value = code;
  await saveTargetLang();
}

async function addProvider() {
  const id = crypto.randomUUID();
  providers.value.push({
    id,
    name: '新提供方',
    type: 'llm',
    baseUrl: DEFAULT_BASE_URL['llm'],
    apiKey: '',
    model: 'gpt-4o-mini',
    responseStyle: 'openai-completions',
  });

  if (props.variant === 'popup') {
    collapsedCards.value[id] = false;
  }
  await saveProviders();
}

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
  if (isKnownDefaultBaseUrl(p.baseUrl)) {
    p.baseUrl = DEFAULT_BASE_URL[p.type];
  }
  if (p.type !== 'llm') {
    delete p.responseStyle;
  }
  const next = { ...testMsgs.value };
  delete next[p.id];
  testMsgs.value = next;
  await saveProviders();
}

function responseStyleHint(style: NonNullable<ProviderConfig['responseStyle']>): string {
  if (style === 'openai-responses')
    return '适用于 OpenAI Responses API(如 https://api.openai.com/v1)';
  if (style === 'anthropic')
    return '适用于原生 Anthropic Messages API(如 https://api.anthropic.com/v1)';
  if (style === 'ollama')
    return '适用于本地 Ollama Chat API(如 http://localhost:11434)';
  return '适用于 OpenAI Chat Completions API(如 https://api.openai.com/v1)';
}

async function onResponseStyleChange(p: ProviderConfig, style: LlmProtocol) {
  p.responseStyle = style;
  if (isKnownDefaultBaseUrl(p.baseUrl)) {
    p.baseUrl = DEFAULT_LLM_BASE_URL_BY_PROTOCOL[style];
  }
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

function messageVariant(msg: string): 'success' | 'destructive' | 'secondary' {
  if (isOk(msg)) return 'success';
  if (isErr(msg)) return 'destructive';
  return 'secondary';
}

function toggleCollapse(id: string) {
  collapsedCards.value[id] = !collapsedCards.value[id];
}

function isCollapsed(id: string): boolean {
  return collapsedCards.value[id] ?? false;
}
</script>

<template>
  <div
    class="source-config flex flex-col gap-3 text-sm text-foreground"
    :class="variant === 'popup' ? 'source-config--popup' : 'source-config--options'"
  >
    <section class="space-y-2">
      <Label>默认目标语言</Label>
      <LanguageSelect
        ref="langSelect"
        :model-value="targetLang"
        allow-browser-default
        aria-label="默认目标语言"
        @update:model-value="onTargetLangChange"
      />
      <p class="text-xs leading-5 text-muted-foreground">
        选择「跟随浏览器语言」时按浏览器首选语言解析（{{ browserLang }}）。
      </p>
    </section>

    <section class="space-y-3">
      <div
        v-if="variant === 'options'"
        class="space-y-1"
      >
        <h2 class="text-base font-semibold text-foreground">
          翻译源管理
        </h2>
        <p class="text-xs leading-5 text-muted-foreground">
          未配置时使用免 Key 兜底翻译;配置自有源后覆盖兜底。
        </p>
      </div>

      <Card
        class="flex items-start gap-3 p-3"
        :class="isFallback ? 'bg-muted' : 'bg-card'"
        :data-state="isFallback ? 'fallback' : 'active'"
        role="status"
        :aria-label="`当前生效:${isFallback ? '免 Key 兜底' : activeSourceName}`"
      >
        <span
          class="mt-1.5 h-2 w-2 flex-none rounded-full"
          :class="isFallback ? 'bg-muted-foreground' : 'bg-success'"
          aria-hidden="true"
        />
        <div class="min-w-0 flex-1">
          <div class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            当前生效
          </div>
          <div class="mt-0.5 truncate text-sm font-semibold text-foreground">
            {{ isFallback ? '免 Key 兜底' : activeSourceName }}
          </div>
          <div class="mt-1 text-xs leading-5 text-muted-foreground">
            <template v-if="isFallback">
              未配置自有源,待翻译文本将外传到 Google / 微软完成翻译。
            </template>
            <template v-else>
              翻译请求将发送到该翻译源。
            </template>
          </div>
        </div>
        <Button
          v-if="isFallback && variant === 'options'"
          variant="link"
          size="sm"
          class="h-auto px-0 py-0"
          @click="configureOwnSource"
        >
          配置自有源 →
        </Button>
      </Card>

      <div
        v-if="isFallback"
        class="flex items-center gap-2"
      >
        <Button
          variant="outline"
          size="sm"
          :disabled="bannerTestMsg === '测试中…'"
          @click="testBuiltin"
        >
          测试连通
        </Button>
        <Badge
          v-if="bannerTestMsg"
          class="test-msg inline"
          :variant="messageVariant(bannerTestMsg)"
        >
          {{ bannerTestMsg }}
        </Badge>
      </div>

      <Button
        v-if="isFallback && variant === 'popup'"
        class="w-full"
        @click="configureOwnSource"
      >
        + 配置自有源
      </Button>

      <Card
        v-for="p in providers"
        :key="p.id"
        class="provider-card overflow-hidden"
        :class="activeSourceId === p.id ? 'ring-1 ring-primary' : ''"
        :data-active="activeSourceId === p.id"
        :data-collapsed="variant === 'popup' ? isCollapsed(p.id) : false"
      >
        <div
          class="flex items-center gap-2 p-3"
          :class="variant === 'popup' ? 'cursor-pointer' : ''"
          :aria-expanded="variant === 'popup' ? !isCollapsed(p.id) : undefined"
          @click="variant === 'popup' ? toggleCollapse(p.id) : undefined"
        >
          <Input
            v-model="p.name"
            class="min-w-0 flex-1"
            placeholder="名称"
            @click.stop
            @change="saveProviders"
          />
          <Button
            size="sm"
            :variant="activeSourceId === p.id ? 'default' : 'outline'"
            @click.stop="activate(p.id)"
          >
            {{ activeSourceId === p.id ? '已启用' : '启用' }}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            @click.stop="removeProvider(p.id)"
          >
            删除
          </Button>
          <span
            v-if="variant === 'popup'"
            class="grid h-5 w-5 flex-none place-items-center text-xs text-muted-foreground transition-transform"
            :class="isCollapsed(p.id) ? '' : 'rotate-90'"
            aria-hidden="true"
          >
            ▸
          </span>
        </div>

        <div
          v-show="variant !== 'popup' || !isCollapsed(p.id)"
          class="flex flex-col gap-2 px-3 pb-3"
        >
          <Select
            v-model="p.type"
            @change="onTypeChange(p)"
          >
            <optgroup label="LLM 接口配置">
              <option value="llm">
                LLM
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
          </Select>

          <div class="grid gap-2 sm:grid-cols-2">
            <div class="grid gap-1">
              <Label :for="`base-url-${p.id}`">Base URL</Label>
              <Input
                :id="`base-url-${p.id}`"
                v-model="p.baseUrl"
                data-testid="base-url"
                :placeholder="baseUrlPlaceholder(p.type)"
                @change="saveProviders"
              />
            </div>
            <div
              v-if="isLlmType(p.type)"
              class="grid gap-1"
            >
              <Label :for="`model-${p.id}`">模型名</Label>
              <Input
                :id="`model-${p.id}`"
                v-model="p.model"
                placeholder="模型名"
                @change="saveProviders"
              />
            </div>
          </div>

          <div
            v-if="isLlmType(p.type)"
            class="flex flex-wrap items-center gap-2 rounded-md bg-muted p-2"
            data-testid="response-style"
          >
            <span class="text-xs font-medium text-muted-foreground">请求协议</span>
            <label class="inline-flex items-center gap-1 text-xs text-foreground">
              <input
                type="radio"
                value="openai-completions"
                :name="`response-style-${p.id}`"
                :checked="(p.responseStyle ?? 'openai-completions') === 'openai-completions'"
                @change="onResponseStyleChange(p, 'openai-completions')"
              >
              OpenAI Chat Completions
            </label>
            <label class="inline-flex items-center gap-1 text-xs text-foreground">
              <input
                type="radio"
                value="openai-responses"
                :name="`response-style-${p.id}`"
                :checked="p.responseStyle === 'openai-responses'"
                @change="onResponseStyleChange(p, 'openai-responses')"
              >
              OpenAI Responses
            </label>
            <label class="inline-flex items-center gap-1 text-xs text-foreground">
              <input
                type="radio"
                value="anthropic"
                :name="`response-style-${p.id}`"
                :checked="p.responseStyle === 'anthropic'"
                @change="onResponseStyleChange(p, 'anthropic')"
              >
              Anthropic Messages
            </label>
            <label class="inline-flex items-center gap-1 text-xs text-foreground">
              <input
                type="radio"
                value="ollama"
                :name="`response-style-${p.id}`"
                :checked="p.responseStyle === 'ollama'"
                @change="onResponseStyleChange(p, 'ollama')"
              >
              Ollama Chat
            </label>
            <span class="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
              {{ responseStyleHint(p.responseStyle ?? 'openai-completions') }}
            </span>
          </div>

          <div class="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input
              v-model="p.apiKey"
              type="password"
              :placeholder="apiKeyPlaceholder(p.type)"
              @change="saveProviders"
            />
            <Button
              variant="outline"
              :disabled="testMsgs[p.id] === '测试中…'"
              @click="testProvider(p)"
            >
              测试连通
            </Button>
          </div>

          <Input
            v-if="p.type === 'microsoft' && p.apiKey"
            v-model="p.region"
            data-testid="region"
            placeholder="Azure 区域,如 eastus"
            @change="saveProviders"
          />

          <Badge
            v-if="testMsgs[p.id]"
            class="test-msg inline w-fit"
            :variant="messageVariant(testMsgs[p.id])"
          >
            {{ testMsgs[p.id] }}
          </Badge>
        </div>
      </Card>

      <Button
        v-if="variant === 'options'"
        variant="dashed"
        @click="addProvider"
      >
        + 添加提供方
      </Button>
    </section>
  </div>
</template>
