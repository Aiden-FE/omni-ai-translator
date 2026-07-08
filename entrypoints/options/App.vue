<script setup lang="ts">
// 选项页:翻译源管理,复用共享组件。
import SourceConfigPanel from '@/shared/ui/SourceConfigPanel.vue';
</script>

<template>
  <main class="mx-auto w-full max-w-[720px] px-6 py-6 text-foreground">
    <h1 class="mb-6 text-[22px] font-semibold leading-tight">
      LLM Translator 设置
    </h1>
    <SourceConfigPanel variant="options" />
  </main>
</template>
