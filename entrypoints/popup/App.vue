<script setup lang="ts">
// 弹窗:翻译源配置主入口(Issue #35)
// 升级为配置面板:生效源横幅、源卡片、连通性测试、目标语言
// 复用 shared/ui/SourceConfigPanel.vue 与 options 共享
import { ref, onMounted } from 'vue';
import SourceConfigPanel from '@/shared/ui/SourceConfigPanel.vue';

const panel = ref<InstanceType<typeof SourceConfigPanel> | null>(null);

function openOptions() {
  chrome.runtime.openOptionsPage();
}

function handleAddProvider() {
  panel.value?.addProvider();
}

onMounted(() => {
  // popup 打开即聚焦首个可交互项
  panel.value?.focusFirst();
});
</script>

<template>
  <div
    class="popup"
    role="dialog"
    aria-label="LLM Translator 设置"
  >
    <!-- 标题条 -->
    <header class="popup__header">
      <div class="popup__brand">
        <div
          class="popup__logo"
          aria-hidden="true"
        >
          译
        </div>
        <span class="popup__title">LLM Translator</span>
      </div>
    </header>

    <!-- 可滚动主体 -->
    <div class="popup__body">
      <SourceConfigPanel
        ref="panel"
        variant="popup"
      />
    </div>

    <!-- 底部:添加提供方 + 打开全部设置 -->
    <footer class="popup__footer">
      <button
        class="add-btn"
        @click="handleAddProvider"
      >
        + 添加提供方
      </button>
      <a
        class="footer__link"
        href="#"
        @click.prevent="openOptions"
      >打开全部设置 →</a>
    </footer>
  </div>
</template>

<style scoped>
.popup {
  width: 400px;
  height: 600px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f9fafb;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.22), 0 2px 8px rgba(0, 0, 0, 0.08);
}

/* ===== 标题条 ===== */
.popup__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: #1f2937;
  color: #f9fafb;
  flex: none;
}
.popup__brand {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
.popup__logo {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  background: #f9fafb;
  color: #1f2937;
  font-size: 13px;
  font-weight: 700;
  display: grid;
  place-items: center;
  flex: none;
}
.popup__title {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

/* ===== 可滚动主体 ===== */
.popup__body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}

/* ===== 底部操作栏 ===== */
.popup__footer {
  flex: none;
  border-top: 1px solid #e5e7eb;
  padding: 8px 16px;
  background: #fff;
  display: flex;
  align-items: center;
  gap: 8px;
}
.popup__footer .add-btn {
  flex: 1;
  padding: 9px;
  border: 1px dashed #d1d5db;
  background: transparent;
  border-radius: 4px;
  color: #6b7280;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  transition: background 120ms ease, color 120ms ease;
}
.popup__footer .add-btn:hover {
  background: #f3f4f6;
  color: #111827;
}
.popup__footer .add-btn:focus-visible {
  outline: 2px solid #1f2937;
  outline-offset: 1px;
}
.footer__link {
  font-size: 12px;
  color: #6b7280;
  text-decoration: none;
  white-space: nowrap;
}
.footer__link:hover {
  color: #1f2937;
  text-decoration: underline;
}
.footer__link:focus-visible {
  outline: 2px solid #1f2937;
  outline-offset: 1px;
  border-radius: 2px;
}

@media (prefers-reduced-motion: reduce) {
  * {
    transition: none !important;
  }
}
</style>

<style>
/* 全局:popup body margin reset,确保精确 400x600 尺寸 */
body {
  margin: 0;
}
</style>
