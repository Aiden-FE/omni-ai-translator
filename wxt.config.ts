import { defineConfig } from 'wxt';
import vue from '@vitejs/plugin-vue';

// WXT 配置：Chrome MV3 扩展
// 详见 https://wxt.dev/api/config
export default defineConfig({
  // 注册 Vue 插件以处理 .vue 文件
  vite: () => ({
    plugins: [vue()],
  }),
  manifest: {
    name: 'LLM Translator',
    description: '基于 LLM 的浏览器翻译插件，支持配置云端/本地大模型接口',
    version: '0.1.0',
    // 调用第三方 LLM 接口所需的权限；本地模型走 localhost
    // 内置免 Key 免费翻译源（google/microsoft）公共端点，确保 background 可跨域请求
    host_permissions: [
      'http://localhost/*',
      'http://127.0.0.1/*',
      'https://translate.googleapis.com/*',
      'https://edge.microsoft.com/*',
      'https://api.cognitive.microsofttranslator.com/*',
      // 用户自配云端 LLM 端点(https://*),SW 跨域 fetch 绕过 CORS (#29)
      'https://*/*',
    ],
    permissions: ['storage', 'activeTab', 'contextMenus'],
  },
});
