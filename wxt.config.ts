import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';

// WXT 配置：跨浏览器扩展（Chrome MV3 / Firefox MV2 / Edge MV3）
// WXT 按目标浏览器自动处理 manifest_version、host_permissions->permissions(MV2)、
// action->browser_action(MV2)、background 脚本格式转换。
// 详见 https://wxt.dev/api/config
export default defineConfig({
  // 注册 Vue 插件以处理 .vue 文件
  vite: () => ({
    plugins: [tailwindcss(), vue()],
  }),
  // manifest 函数：按浏览器目标差异化（Firefox 添加 browser_specific_settings）
  // 共享字段（name/description/version/host_permissions/permissions）三浏览器一致，
  // WXT 自动处理 MV2 的 host_permissions 归并。
  manifest: ({ browser }) => {
    const baseManifest = {
      name: 'Omni AI Translator',
      description: 'AI 驱动的浏览器翻译插件，支持配置云端/本地大模型接口',
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
      permissions: ['storage', 'activeTab'],
    };

    if (browser === 'firefox') {
      // Firefox AMO 上架必需：gecko addon ID
      return {
        ...baseManifest,
        browser_specific_settings: {
          gecko: {
            id: 'omni-ai-translator@aiden-fe.dev',
          },
        },
      };
    }

    return baseManifest;
  },
});
