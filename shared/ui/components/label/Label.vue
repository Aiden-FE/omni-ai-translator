<script setup lang="ts">
defineOptions({ name: 'UiLabel' });
</script>

<template>
  <label class="text-sm font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
    <slot />
  </label>
</template>
