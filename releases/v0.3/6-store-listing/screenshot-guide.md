# 截图准备与尺寸检查指南

> 归档于 releases/v0.3/6-store-listing/ · 版本 v0.3 · 关联 Issue #66

## 截图清单

| 文件 | 场景 | 尺寸 | 捕获方式 |
|---|---|---|---|
| `screenshots/popup.png` | popup 配置面板 | 1280x800 | 真实扩展页面截图 |
| `screenshots/options.png` | options 设置页 | 1280x800 | 真实扩展页面截图 |
| `screenshots/overlay.png` | 划词翻译浮层 | 1280x800 | 真实扩展页面截图 |

所有截图均使用最终品牌名 `Omni AI Translator`（#65 已落地），展示 sunlit teal 明亮主题。

## 前置条件

1. Node.js + pnpm 已安装
2. Python 3 + Pillow 已安装（图标生成与尺寸校验）
3. Playwright chromium 已安装（`pnpm e2e:install`）

## 截图步骤

### 1. 生成图标（如尚未生成）

```bash
python3 scripts/generate-icons.py
```

输出：`public/icon/{16,32,48,128}.png`

### 2. 构建扩展

```bash
pnpm build
```

产物：`.output/chrome-mv3/`

### 3. 捕获截图

```bash
npx tsx scripts/capture-screenshots.ts
```

脚本自动完成：
1. 启动 mock LLM 服务器（返回固定译文 "你好,世界"，无真实 API 调用）
2. 以持久化上下文加载扩展（`--load-extension`）
3. 通过 options 页配置一个 mock OpenAI 兼容提供方并启用
4. 截取 options 页面（展示已配置的提供方）
5. 截取 popup 页面（居中于暖白画布）
6. 导航到测试文章页，选中文本，触发翻译，等待浮层展示译文后截图
7. 验证所有截图尺寸为 1280x800

输出：`releases/v0.3/6-store-listing/screenshots/{popup,options,overlay}.png`

### 4. 尺寸校验

```bash
python3 -c "
from PIL import Image
import os
d = 'releases/v0.3/6-store-listing/screenshots'
for f in ['popup.png', 'options.png', 'overlay.png']:
    img = Image.open(os.path.join(d, f))
    print(f'{f}: {img.size[0]}x{img.size[1]}')
"
```

预期输出：三张均为 1280x800。

## 安全规范

- 截图使用 mock 翻译服务器，不连接真实 API，无 API Key 泄露风险
- mock 提供方不填入 API Key 字段
- 测试页面内容为合成文章文本，不含真实用户数据
- 截图前确认输入框中无真实 Key 残留

## 重新生成

如需重新生成截图（如 UI 更新后），直接重复上述步骤即可。脚本每次清理旧 profile，确保状态干净。

## 测试页面

截图脚本使用 `e2e/fixtures/screenshot-page.html` 作为划词翻译的宿主页面。该页面模拟一篇关于 AI 的英文短文，包含可选中段落 "Hello world"。
