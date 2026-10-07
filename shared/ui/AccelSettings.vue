<script setup lang="ts">
/**
 * 翻译加速设置 — 端点选择、连通测试、加速范围、第三方知情确认。
 *
 * 见 CONTEXT.md §3.15 / §3.16：
 * - 三态单选：不使用（默认）/ 官方域名 / 自定义域名；选官方等价于写入官方 URL，不引入 preset 字段
 * - 默认不使用：发往项目方服务器必须是显式选择
 * - 第三方 URL 首次配置需显式确认「该节点可看到全部原文，且可返回任意译文」；
 *   确认状态按 URL 记录（换域名重新确认），官方节点不弹
 * - 「测试连通」打 /healthz，区分「节点不可达」与「节点活着但 Redis 挂了」
 */
import { ref, onMounted, computed } from 'vue';
import {
  OFFICIAL_ACCEL_ENDPOINT,
  accelHealth,
  normalizeAccelEndpoint,
} from '@/shared/accel';
import {
  getSettings,
  setSettings,
  getConfirmedAccelUrl,
  setConfirmedAccelUrl,
} from '@/shared/storage';
import Button from '@/shared/ui/components/button/Button.vue';
import Card from '@/shared/ui/components/card/Card.vue';
import Input from '@/shared/ui/components/input/Input.vue';
import Label from '@/shared/ui/components/label/Label.vue';
import Badge from '@/shared/ui/components/badge/Badge.vue';
import type { Settings } from '@/shared/types';

type AccelMode = 'off' | 'official' | 'custom';

const mode = ref<AccelMode>('off');
const customUrl = ref('');
const scopeAll = ref(false);
/** 未经确认的第三方 URL 暂存于此：确认前不写入设置。 */
const pendingCustomUrl = ref<string | null>(null);
const testMsg = ref('');
const testOk = ref(false);
const testing = ref(false);

/** 归一化后的自定义 URL；为空表示未填或非法。 */
const normalizedCustom = computed(() => normalizeAccelEndpoint(customUrl.value));

/** 当前待写入设置的端点（确认通过才非空）。 */
const effectiveEndpoint = computed<string | null>(() => {
  if (mode.value === 'official') return OFFICIAL_ACCEL_ENDPOINT;
  if (mode.value === 'custom') return pendingCustomUrl.value;
  return null;
});

const customInvalid = computed(
  () => mode.value === 'custom' && customUrl.value.trim() !== '' && normalizedCustom.value === null,
);

onMounted(async () => {
  const settings = await getSettings();
  scopeAll.value = settings.accelScope === 'all';
  const endpoint = normalizeAccelEndpoint(settings.accelEndpoint);
  if (endpoint === null) {
    mode.value = 'off';
  } else if (endpoint === OFFICIAL_ACCEL_ENDPOINT) {
    mode.value = 'official';
  } else {
    mode.value = 'custom';
    customUrl.value = endpoint;
    // 已确认过的 URL 才能直接生效
    if ((await getConfirmedAccelUrl()) === endpoint) {
      pendingCustomUrl.value = endpoint;
    }
  }
});

async function persist(endpoint: string | null): Promise<void> {
  const settings: Settings = await getSettings();
  await setSettings({
    ...settings,
    accelEndpoint: endpoint,
    accelScope: scopeAll.value ? 'all' : 'builtin',
  });
  testMsg.value = '';
  testOk.value = false;
}

async function onModeChange(next: AccelMode): Promise<void> {
  mode.value = next;
  testMsg.value = '';
  testOk.value = false;

  if (next === 'off') {
    pendingCustomUrl.value = null;
    await persist(null);
    return;
  }
  if (next === 'official') {
    pendingCustomUrl.value = null;
    // 官方节点属项目方服务，不需要第三方知情确认
    await persist(OFFICIAL_ACCEL_ENDPOINT);
    return;
  }
  // 切到自定义：先看已填的 URL
  await attemptCustomActivation();
}

/**
 * 自定义 URL 激活。
 * 首次（未确认过该 URL）先停在 pendingCustomUrl 等用户确认；已确认过则直接生效。
 */
async function attemptCustomActivation(): Promise<void> {
  const url = normalizedCustom.value;
  if (url === null) {
    pendingCustomUrl.value = null;
    await persist(null);
    return;
  }
  if (url === OFFICIAL_ACCEL_ENDPOINT) {
    mode.value = 'official';
    pendingCustomUrl.value = null;
    await persist(OFFICIAL_ACCEL_ENDPOINT);
    return;
  }
  if ((await getConfirmedAccelUrl()) === url) {
    pendingCustomUrl.value = url;
    await persist(url);
    return;
  }
  // 未确认：要求显式知悉
  pendingCustomUrl.value = null;
  await persist(null);
}

/** 用户阅读风险说明后确认启用。 */
async function confirmThirdParty(): Promise<void> {
  const url = normalizedCustom.value;
  if (url === null) return;
  await setConfirmedAccelUrl(url);
  pendingCustomUrl.value = url;
  await persist(url);
}

async function onCustomInputChange(): Promise<void> {
  if (mode.value !== 'custom') return;
  await attemptCustomActivation();
}

async function onScopeChange(): Promise<void> {
  await persist(effectiveEndpoint.value);
}

async function testAccel(): Promise<void> {
  const endpoint = effectiveEndpoint.value;
  if (endpoint === null) {
    testMsg.value = '请先选择或填写加速节点';
    testOk.value = false;
    return;
  }
  testing.value = true;
  testMsg.value = '测试中…';
  testOk.value = false;
  const result = await accelHealth(endpoint);
  testing.value = false;
  if (result.reachable && result.redis === 'ok') {
    testOk.value = true;
    testMsg.value = `连接正常（服务版本 v${result.version}，缓存就绪）`;
  } else if (result.reachable) {
    testOk.value = false;
    testMsg.value = '节点可访问，但缓存（Redis）未就绪，请检查服务端 Redis 配置';
  } else {
    testOk.value = false;
    testMsg.value = `无法连接：${result.reason}`;
  }
}
</script>

<template>
  <Card class="space-y-3 p-3">
    <div class="space-y-1">
      <Label>翻译加速</Label>
      <p class="text-xs leading-5 text-muted-foreground">
        开启后，翻译前会先向加速节点查询缓存：命中的直接展示，未命中的照常翻译并写回缓存。
        加速节点<strong>不会收到你的 API Key</strong>，但会看到被翻译的原文。
      </p>
    </div>

    <fieldset class="space-y-2">
      <legend class="sr-only">
        加速节点
      </legend>

      <label class="flex items-start gap-2">
        <input
          type="radio"
          name="accel-mode"
          value="off"
          :checked="mode === 'off'"
          @change="onModeChange('off')"
        >
        <span class="min-w-0 flex-1 text-xs leading-5">
          不使用加速<span class="text-muted-foreground">（默认）</span>
        </span>
      </label>

      <label class="flex items-start gap-2">
        <input
          type="radio"
          name="accel-mode"
          value="official"
          data-testid="accel-official"
          :checked="mode === 'official'"
          @change="onModeChange('official')"
        >
        <span class="min-w-0 flex-1 text-xs leading-5">
          官方加速节点
          <span class="block text-muted-foreground">{{ OFFICIAL_ACCEL_ENDPOINT }}</span>
        </span>
      </label>

      <label class="flex items-start gap-2">
        <input
          type="radio"
          name="accel-mode"
          value="custom"
          data-testid="accel-custom"
          :checked="mode === 'custom'"
          @change="onModeChange('custom')"
        >
        <span class="min-w-0 flex-1 text-xs leading-5">自定义节点地址</span>
      </label>
    </fieldset>

    <div
      v-if="mode === 'custom'"
      class="space-y-2"
    >
      <Input
        v-model="customUrl"
        data-testid="accel-custom-url"
        placeholder="https://accel.example.com"
        aria-label="加速节点地址"
        @change="onCustomInputChange"
      />
      <p
        v-if="customInvalid"
        class="text-xs text-destructive"
      >
        请输入 http(s) 开头的完整地址。
      </p>
    </div>

    <!-- 第三方节点首次配置：显式知悉后才生效（CONTEXT.md §3.15） -->
    <div
      v-if="pendingCustomUrl === null && normalizedCustom !== null && normalizedCustom !== OFFICIAL_ACCEL_ENDPOINT"
      class="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3"
      data-testid="accel-confirm"
    >
      <p class="text-xs leading-5">
        <strong>请确认你信任该节点：</strong>它可以看到你翻译的<strong>每一段原文</strong>，
        并且可以返回<strong>任意内容</strong>作为译文，插件无法验证其是否被篡改。
        你的 API Key 不会发往该节点。
      </p>
      <div class="flex gap-2">
        <Button
          size="sm"
          data-testid="accel-confirm-accept"
          @click="confirmThirdParty"
        >
          我已了解，启用
        </Button>
      </div>
    </div>

    <div class="space-y-2">
      <Label>加速范围</Label>
      <label class="flex items-start gap-2">
        <input
          type="radio"
          name="accel-scope"
          value="builtin"
          :checked="!scopeAll"
          @change="onScopeChange"
        >
        <span class="min-w-0 flex-1 text-xs leading-5">
          仅免 Key 翻译源<span class="block text-muted-foreground">默认。你的自有源原文不会外发。</span>
        </span>
      </label>
      <label class="flex items-start gap-2">
        <input
          type="radio"
          name="accel-scope"
          value="all"
          data-testid="accel-scope-all"
          :checked="scopeAll"
          @change="scopeAll = true; onScopeChange()"
        >
        <span class="min-w-0 flex-1 text-xs leading-5">
          所有翻译源<span class="block text-muted-foreground">自有源的原文也会发往加速节点。</span>
        </span>
      </label>
    </div>

    <div class="flex items-center gap-2">
      <Button
        variant="outline"
        :disabled="testing"
        data-testid="accel-test"
        @click="testAccel"
      >
        {{ testing ? '测试中…' : '测试连通' }}
      </Button>
      <Badge
        v-if="testMsg"
        class="test-msg inline"
        :variant="testOk ? 'default' : 'secondary'"
        data-testid="accel-test-msg"
      >
        {{ testMsg }}
      </Badge>
    </div>
  </Card>
</template>
