<script setup lang="ts">
defineOptions({ name: 'LanguageSelect' });

// 可搜索目标语言选择器（#78）：基于共享目录 LANGUAGE_CATALOG。
// 选项展示「中文名 / 原文名 · 代码」，支持按代码 / 中文名 / 原文名搜索；
// 选中后 emit update:modelValue（BCP 47 代码）。供文本翻译与设置复用。
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import {
  LANGUAGE_CATALOG,
  filterLanguages,
  findLanguageByCode,
  type LanguageEntry,
} from '@/shared/language-catalog';

/** 浏览器首选语言哨兵值（#81）：空字符串表示未配置，跟随 navigator.language */
const BROWSER_DEFAULT_LABEL = '跟随浏览器语言';

const props = defineProps<{
  /** 当前选中的 BCP 47 语言代码；空字符串表示浏览器首选语言（仅 allowBrowserDefault） */
  modelValue: string;
  /** 禁用（如翻译进行中锁定选择器） */
  disabled?: boolean;
  /** 触发按钮的无障碍标签（透传到 combobox，而非外层容器） */
  ariaLabel?: string;
  /** 提供「跟随浏览器语言」选项，选择后 emit 空字符串（默认目标语言设置用） */
  allowBrowserDefault?: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
}>();

const open = ref(false);
const query = ref('');
const activeIndex = ref(0);
const searchInput = ref<HTMLInputElement | null>(null);
const triggerEl = ref<HTMLButtonElement | null>(null);
const rootEl = ref<HTMLElement | null>(null);

const filtered = computed(() => filterLanguages(query.value));

const isBrowserDefault = computed(
  () => props.allowBrowserDefault === true && props.modelValue === '',
);

// 浏览器选项参与搜索：关键词命中即展示（#81）
function matchesBrowserDefault(rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  return q === '' || BROWSER_DEFAULT_LABEL.includes(q);
}

const showBrowserDefault = computed(
  () => props.allowBrowserDefault === true && matchesBrowserDefault(query.value),
);

const browserEntry: LanguageEntry = { code: '', zhName: BROWSER_DEFAULT_LABEL, nativeName: '' };

/** 弹层选项列表：浏览器选项置顶（展示时），后接目录匹配项 */
const entries = computed<readonly LanguageEntry[]>(() => (
  showBrowserDefault.value ? [browserEntry, ...filtered.value] : filtered.value
));

const selected = computed<LanguageEntry>(() => {
  if (isBrowserDefault.value) return browserEntry;
  return findLanguageByCode(props.modelValue) ?? LANGUAGE_CATALOG[0];
});

/** 重置高亮项：当前选中优先，否则回到第一项 */
function resetActiveIndex() {
  const selectedIndex = entries.value.findIndex((e) => e.code === selected.value.code);
  activeIndex.value = selectedIndex >= 0 ? selectedIndex : 0;
}

function openDropdown() {
  if (props.disabled) return;
  open.value = true;
  query.value = '';
  resetActiveIndex();
  void nextTick(() => searchInput.value?.focus());
}

function closeDropdown() {
  open.value = false;
}

/** 供设置面板初始化时聚焦触发按钮（#81） */
function focusTrigger() {
  triggerEl.value?.focus();
}

defineExpose({ focusTrigger });

function select(code: string) {
  emit('update:modelValue', code);
  closeDropdown();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeDropdown();
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (entries.value.length > 0) {
      activeIndex.value = (activeIndex.value + 1) % entries.value.length;
    }
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (entries.value.length > 0) {
      activeIndex.value = (activeIndex.value - 1 + entries.value.length) % entries.value.length;
    }
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const target = entries.value[activeIndex.value];
    if (target) select(target.code);
  }
}

function onOutsideMousedown(event: MouseEvent) {
  if (open.value && rootEl.value && !rootEl.value.contains(event.target as Node)) {
    closeDropdown();
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('mousedown', onOutsideMousedown);
  } else {
    document.removeEventListener('mousedown', onOutsideMousedown);
  }
});

// 查询变化后保持高亮项有效
watch(query, () => {
  resetActiveIndex();
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onOutsideMousedown);
});
</script>

<template>
  <div
    ref="rootEl"
    class="relative"
  >
    <button
      ref="triggerEl"
      type="button"
      role="combobox"
      class="flex h-7 items-center gap-1 rounded-md border border-input bg-card px-2 text-xs text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
      :aria-expanded="open"
      :aria-haspopup="true"
      :aria-label="ariaLabel"
      :disabled="disabled"
      @click="openDropdown"
      @keydown.enter.prevent="openDropdown"
    >
      <span>{{ selected.zhName }}</span>
      <span
        v-if="selected.code"
        class="text-muted-foreground"
      >· {{ selected.code }}</span>
      <span
        class="text-muted-foreground"
        aria-hidden="true"
      >▾</span>
    </button>

    <div
      v-if="open"
      class="absolute left-0 top-full z-20 mt-1 w-72 overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-lg"
      role="dialog"
      aria-label="选择目标语言"
    >
      <input
        ref="searchInput"
        v-model="query"
        type="search"
        class="w-full border-b border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none"
        placeholder="搜索语言（代码 / 中文名 / 原文名）"
        aria-label="搜索语言"
        autocomplete="off"
        @keydown="onKeydown"
      >
      <ul
        v-if="entries.length"
        class="max-h-64 overflow-y-auto py-1"
        role="listbox"
      >
        <li
          v-for="(entry, index) in entries"
          :key="entry.code || 'browser-default'"
          role="option"
          :data-code="entry.code || undefined"
          :data-browser-default="entry.code === '' ? 'true' : undefined"
          :aria-selected="entry.code === modelValue"
          class="flex cursor-pointer items-baseline gap-1 px-3 py-1.5 text-sm"
          :class="[
            entry.code === modelValue ? 'text-primary font-medium' : 'text-foreground',
            index === activeIndex ? 'bg-accent text-accent-foreground' : '',
          ]"
          @click="select(entry.code)"
        >
          <span>{{ entry.zhName }}</span>
          <span
            v-if="entry.code"
            class="text-xs text-muted-foreground"
          >/ {{ entry.nativeName }} · {{ entry.code }}</span>
        </li>
      </ul>
      <p
        v-else
        class="px-3 py-3 text-sm text-muted-foreground"
        role="status"
      >
        没有匹配的语言
      </p>
    </div>
  </div>
</template>
