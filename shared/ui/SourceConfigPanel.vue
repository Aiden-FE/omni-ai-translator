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
} from '@/shared/types';
import { getProviders, setProviders, getSettings, setSettings } from '@/shared/storage';
import { DEFAULT_ACTIVE_SOURCE_ID } from '@/shared/translator/builtin-sources';
import Button from '@/shared/ui/components/button/Button.vue';
import Card from '@/shared/ui/components/card/Card.vue';
import Input from '@/shared/ui/components/input/Input.vue';
import Label from '@/shared/ui/components/label/Label.vue';
import Select from '@/shared/ui/components/select/Select.vue';
import Badge from '@/shared/ui/components/badge/Badge.vue';

const props = withDefaults(defineProps<{
  variant?: 'popup' | 'options';
}>(), {
  variant: 'options',
});

const providers = ref<ProviderConfig[]>([]);
const activeSourceId = ref<string>(DEFAULT_ACTIVE_SOURCE_ID);
const allSources = ref<ProviderConfig[]>([]);
const targetLang = ref('');
const testMsgs = ref<Record<string, string>>({});
const bannerTestMsg = ref('');
const browserLang = ref(navigator.language || '');
const collapsedCards = ref<Record<string, boolean>>({});

const DEFAULT_BASE_URL: Record<ProviderType, string> = {
  llm: 'https://api.openai.com/v1/chat/completions',
  google: 'https://translation.googleapis.com',
  microsoft: 'https://api.cognitive.microsofttranslator.com/translate',
};

const DEFAULT_BASE_URL_BY_STYLE: Record<string, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  ollama: 'http://localhost:11434/api/chat',
};

const KNOWN_DEFAULT_BASE_URLS = new Set([
  'https://api.openai.com',
  'http://localhost:11434',
  'https://api.anthropic.com',
  ...Object.values(DEFAULT_BASE_URL),
  ...Object.values(DEFAULT_BASE_URL_BY_STYLE),
]);
const FALLBACK_SOURCE_ID = DEFAULT_ACTIVE_SOURCE_ID;

function isLlmType(type: ProviderType): boolean {
  return type === 'llm';
}

function baseUrlPlaceholder(type: ProviderType): string {
  if (type === 'llm') return '完整接口路径,如 https://api.openai.com/v1/chat/completions';
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

function sendMessage<T>(message: Message): Promise<T> {
  return browser.runtime.sendMessage(message) as Promise<T>;
}

async function loadActiveSources() {
  const r = await sendMessage<ActiveSourcesResult>({ type: 'get-active-sources' });
  activeSourceId.value = r.activeSourceId;
  allSources.value = r.sources;
}

const targetLangInput = ref<InstanceType<typeof Input> | null>(null);

onMounted(async () => {
  await loadActiveSources();
  providers.value = await getProviders();
  const s = await getSettings();
  targetLang.value = s.defaultTargetLang || defaultTargetLang();

  if (props.variant === 'popup') {
    await nextTick();
    targetLangInput.value?.focus();
    for (const p of providers.value) {
      collapsedCards.value[p.id] = p.id !== activeSourceId.value;
    }
  }
});

defineExpose({
  focusFirst() {
    targetLangInput.value?.focus();
  },
  addProvider,
});

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
    type: 'llm',
    baseUrl: DEFAULT_BASE_URL['llm'],
    apiKey: '',
    model: 'gpt-4o-mini',
    responseStyle: 'openai',
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
  if (KNOWN_DEFAULT_BASE_URLS.has(p.baseUrl)) {
    p.baseUrl = DEFAULT_BASE_URL[p.type];
  }
  if (p.type !== 'llm') {
    p.responseStyle = 'openai';
  }
  const next = { ...testMsgs.value };
  delete next[p.id];
  testMsgs.value = next;
  await saveProviders();
}

function responseStyleHint(style: 'openai' | 'anthropic' | 'ollama'): string {
  if (style === 'anthropic')
    return '适用于原生 Anthropic Messages API 端点(如 https://api.anthropic.com/v1/messages)';
  if (style === 'ollama')
    return '适用于本地 Ollama 端点(如 http://localhost:11434/api/chat)';
  return '适用于 OpenAI 兼容端点(如 https://api.openai.com/v1/chat/completions)';
}

async function onResponseStyleChange(p: ProviderConfig, style: 'openai' | 'anthropic' | 'ollama') {
  p.responseStyle = style;
  if (KNOWN_DEFAULT_BASE_URLS.has(p.baseUrl)) {
    p.baseUrl = DEFAULT_BASE_URL_BY_STYLE[style];
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
      <Label for="target-lang-input">默认目标语言</Label>
      <Input
        id="target-lang-input"
        ref="targetLangInput"
        v-model="targetLang"
        placeholder="留空则使用浏览器首选语言"
        @change="saveTargetLang"
      />
      <p class="text-xs leading-5 text-muted-foreground">
        留空时自动使用浏览器首选语言({{ browserLang }})。
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
            <Input
              v-model="p.baseUrl"
              data-testid="base-url"
              :placeholder="baseUrlPlaceholder(p.type)"
              @change="saveProviders"
            />
            <Input
              v-if="isLlmType(p.type)"
              v-model="p.model"
              placeholder="模型名"
              @change="saveProviders"
            />
          </div>

          <div
            v-if="isLlmType(p.type)"
            class="flex flex-wrap items-center gap-2 rounded-md bg-muted p-2"
            data-testid="response-style"
          >
            <span class="text-xs font-medium text-muted-foreground">响应风格</span>
            <label class="inline-flex items-center gap-1 text-xs text-foreground">
              <input
                type="radio"
                value="openai"
                :name="`response-style-${p.id}`"
                :checked="(p.responseStyle ?? 'openai') === 'openai'"
                @change="onResponseStyleChange(p, 'openai')"
              >
              openai
            </label>
            <label class="inline-flex items-center gap-1 text-xs text-foreground">
              <input
                type="radio"
                value="anthropic"
                :name="`response-style-${p.id}`"
                :checked="p.responseStyle === 'anthropic'"
                @change="onResponseStyleChange(p, 'anthropic')"
              >
              anthropic
            </label>
            <label class="inline-flex items-center gap-1 text-xs text-foreground">
              <input
                type="radio"
                value="ollama"
                :name="`response-style-${p.id}`"
                :checked="p.responseStyle === 'ollama'"
                @change="onResponseStyleChange(p, 'ollama')"
              >
              ollama
            </label>
            <span class="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
              {{ responseStyleHint(p.responseStyle ?? 'openai') }}
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
