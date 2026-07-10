<script setup lang="ts">
// 弹窗:翻译源配置主入口,复用 shared/ui/SourceConfigPanel.vue。
import { ref, onMounted } from 'vue';
import SourceConfigPanel from '@/shared/ui/SourceConfigPanel.vue';
import Button from '@/shared/ui/components/button/Button.vue';
import ScrollArea from '@/shared/ui/components/scroll-area/ScrollArea.vue';

const panel = ref<InstanceType<typeof SourceConfigPanel> | null>(null);

function openOptions() {
  chrome.runtime.openOptionsPage();
}

function handleAddProvider() {
  panel.value?.addProvider();
}

onMounted(() => {
  panel.value?.focusFirst();
});
</script>

<template>
  <div
    class="flex h-[600px] w-[400px] flex-col overflow-hidden rounded-lg border border-border bg-background text-foreground shadow-2xl"
    role="dialog"
    aria-label="Omni AI Translator 设置"
  >
    <header class="flex h-12 flex-none items-center gap-2 bg-primary px-4 text-primary-foreground">
      <div
        class="grid h-6 w-6 flex-none place-items-center rounded-md bg-primary-foreground text-sm font-bold text-primary"
        aria-hidden="true"
      >
        译
      </div>
      <span class="min-w-0 flex-1 truncate text-sm font-semibold">Omni AI Translator</span>
    </header>

    <ScrollArea class="flex-1 px-4 py-3">
      <SourceConfigPanel
        ref="panel"
        variant="popup"
      />
    </ScrollArea>

    <footer class="flex flex-none items-center gap-2 border-t border-border bg-card px-4 py-2">
      <Button
        variant="dashed"
        class="flex-1"
        @click="handleAddProvider"
      >
        + 添加提供方
      </Button>
      <Button
        variant="link"
        size="sm"
        class="px-0 text-xs"
        @click="openOptions"
      >
        打开全部设置 →
      </Button>
    </footer>
  </div>
</template>
