<script setup lang="ts">
defineOptions({ name: 'UiCard' });
</script>

<template>
  <div class="rounded-lg border border-border bg-card text-card-foreground shadow-sm">
    <slot />
  </div>
</template>
