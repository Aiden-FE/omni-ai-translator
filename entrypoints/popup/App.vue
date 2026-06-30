<script setup lang="ts">
// 弹窗：快捷入口（第一版轻量，主要引导至选项页配置）
</script>

<template>
  <div class="popup">
    <h1>LLM Translator</h1>
    <p>划词选中网页文本即可翻译。</p>
    <button @click="chrome.runtime.openOptionsPage()">打开设置</button>
  </div>
</template>

<style scoped>
.popup {
  width: 240px;
  padding: 12px;
  font-family: system-ui, sans-serif;
}
h1 {
  font-size: 16px;
  margin: 0 0 8px;
}
button {
  margin-top: 8px;
  padding: 6px 12px;
  cursor: pointer;
}
</style>
