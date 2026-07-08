<script setup lang="ts">
import { ref } from 'vue';

defineOptions({ name: 'UiInput' });

const model = defineModel<string | undefined>();
const inputRef = ref<HTMLInputElement | null>(null);

defineExpose({
  focus() {
    inputRef.value?.focus();
  },
});

withDefaults(defineProps<{
  type?: string;
}>(), {
  type: 'text',
});
</script>

<template>
  <input
    ref="inputRef"
    v-model="model"
    :type="type"
    class="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
  >
</template>
