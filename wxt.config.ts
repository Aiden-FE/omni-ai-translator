import { defineConfig } from 'wxt';

// WXT 配置：Chrome MV3 扩展
// 详见 https://wxt.dev/api/config
export default defineConfig({
  manifest: {
    name: 'LLM Translator',
    description: '基于 LLM 的浏览器翻译插件，支持配置云端/本地大模型接口',
    version: '0.1.0',
    // 调用第三方 LLM 接口所需的权限；本地模型走 localhost
    host_permissions: ['http://localhost/*', 'http://127.0.0.1/*'],
    permissions: ['storage', 'activeTab', 'contextMenus'],
  },
});
