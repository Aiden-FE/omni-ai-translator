<script setup lang="ts">
// 选项页:翻译源管理(复用共享组件,popup 与 options 共用)
// Issue #35: 源配置逻辑抽取为 shared/ui/SourceConfigPanel.vue
import SourceConfigPanel from '@/shared/ui/SourceConfigPanel.vue';
</script>

<template>
  <div class="options">
    <h1>LLM Translator 设置</h1>
    <SourceConfigPanel variant="options" />
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
h1 {
  font-size: 22px;
  font-weight: 600;
  margin: 0 0 24px;
}
</style>
