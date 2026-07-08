<script setup lang="ts">
defineOptions({ name: 'UiSelect' });

const model = defineModel<string | undefined>();
</script>

<template>
  <select
    v-model="model"
    class="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
  >
    <slot />
  </select>
</template>
