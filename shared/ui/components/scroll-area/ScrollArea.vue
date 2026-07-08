<script setup lang="ts">
defineOptions({ name: 'UiScrollArea' });
</script>

<template>
  <div class="min-h-0 overflow-auto">
    <slot />
  </div>
</template>
