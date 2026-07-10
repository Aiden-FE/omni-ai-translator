# DESIGN: #66 商店 Listing 素材设计

> 关联 Issue #66 · PRD Issue #54 · 迭代 v0.3

## 1. 总体方案

本任务产出商店 Listing 素材(图标/截图/文案),不涉及应用 UI 代码改造。图标作为静态资产由 WXT 打包进扩展;截图与文案归档到 `releases/v0.3/6-store-listing/` 供商店上架使用。

### 1.1 图标方案

- 使用 Python PIL 生成 4 尺寸 PNG(16/32/48/128px)
- 图标设计:sunlit teal 圆角方形背景 + 暖白「译」字标
- 放置 `public/icon/{16,32,48,128}.png`,遵循 WXT 约定自动生成 manifest icons
- 不碰 wxt.config.ts(避免与 #67 冲突),仅在 WXT 约定不生效时做最小靶向改动

### 1.2 截图方案

- 使用 Playwright 加载扩展产物,自动截取 3 张 1280x800 截图
- 场景:划词翻译浮层、popup 配置页、options 设置页
- 截图归档到 `releases/v0.3/6-store-listing/screenshots/`
- 提供可重复的截图脚本与尺寸检查方式

### 1.3 文案方案

- 简短描述(≤132 字符)、详细描述、分类、关键词归档到 `releases/v0.3/6-store-listing/listing-copy.md`

## 2. UX 与视觉实现

> 引用 PRD `releases/v0.3/6-store-listing/PRD.md` `## UX 设计` 与 `knowledges/ux/design-system.md`

### 2.1 图标设计

设计系统(ADR-006 token-first 策略)定义的核心色板:

| Token | HSL | 用途 | 图标应用 |
|---|---|---|---|
| `--primary` | `174 84% 27%` | 主操作色 | 图标背景(sunlit teal) |
| `--background` | `36 100% 98%` | 暖白页面背景 | 「译」字前景色(暖白) |
| `--primary-foreground` | `0 0% 100%` | 纯白前景 | 不使用(改用暖白增强温暖感) |
| `--ring` | `174 84% 33%` | focus ring | 图标边缘高亮(可选) |

图标视觉规范:
- **形状**:圆角方形(rounded square),圆角半径约为尺寸的 1/5(如 128px 图标圆角 25px)
- **背景色**:HSL(174, 84%, 27%) ≈ RGB(11, 127, 115) → `#0B7F73`(sunlit teal 主色)
- **前景色**:HSL(36, 100%, 98%) ≈ RGB(255, 252, 245) → `#FFFCF5`(暖白)
- **字标**:中文「译」字,居中,字重 bold,字号约为图标尺寸的 60%
- **无额外文字**:仅「译」字标,不加产品名或其它文字(与 popup header 的「译」logo 一致)
- **16px 可辨识策略**:16px 图标使用最大笔画对比,「译」字占据更大比例(约 70%),省略圆角细节

与现有 UI 一致性:
- popup header 使用 teal 背景白「译」字(`entrypoints/popup/App.vue` line 29-35)
- content trigger 使用 teal 背景白「译」字(`assets/content.css` `.llm-translator-trigger`)
- 图标采用相同视觉语言,暖白替代纯白增强主题温暖感

### 2.2 截图场景与品牌名约束

截图必须使用最终品牌名 `Omni AI Translator`(#65 已落地),展示 sunlit teal 明亮主题:

| 场景 | 截图内容 | 品牌名出现位置 |
|---|---|---|
| 划词翻译浮层 | 网页选中文本 → trigger 按钮 → 翻译浮层展示译文 | 浮层内无品牌名(trigger 按钮有「译」字标) |
| popup 配置 | popup 400x600 界面,展示翻译源配置 | header "Omni AI Translator" |
| options 设置页 | options 页面,展示全部设置 | h1 "Omni AI Translator 设置" |

截图安全规范:
- 不得包含 API Key、账号或其它敏感信息
- 截图前清除所有输入框中的真实 Key
- 使用 mock 翻译服务(已有 e2e/mock-server.ts),不连接真实 API

### 2.3 文案规范

- 简短描述:一句话讲清核心价值,≤132 字符,面向普通用户
- 详细描述:列出核心能力(划词翻译、免 Key 开箱即用、BYO Key、本地模型、隐私可控)
- 不宣称未实现能力
- 与现有隐私说明一致(Key 仅存本地,不上传)

## 3. 技术实现

### 3.1 图标生成

- 工具:Python PIL(Pillow),系统已安装
- 脚本:`scripts/generate-icons.py`
- 输出:`public/icon/{16,32,48,128}.png`
- WXT 约定:public/icon/ 下的图标自动被 WXT 识别并生成 manifest icons 字段

### 3.2 截图捕获

- 工具:Playwright(已有 e2e 基建)
- 脚本:`scripts/capture-screenshots.ts`
- 流程:build 扩展 → 加载扩展 → 导航到测试页面 → 截取 3 个场景
- 输出:`releases/v0.3/6-store-listing/screenshots/{overlay,popup,options}.png`
- 尺寸校验:截图后用 PIL 检查尺寸为 1280x800

### 3.3 文案归档

- 文件:`releases/v0.3/6-store-listing/listing-copy.md`
- 包含:简短描述、详细描述、分类、关键词

## 4. 无人值守默认决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 图标生成工具 | Python PIL | 系统已安装,无需额外依赖 |
| 图标前景色 | 暖白(#FFFCF5)而非纯白 | 匹配 sunlit 主题温暖感,与 issue 要求一致 |
| 截图工具 | Playwright | 项目已有 e2e 基建,可加载真实扩展 |
| 图标声明方式 | WXT 约定(public/icon/) | 避免修改 wxt.config.ts,与 #67 无冲突 |
| 截图归档位置 | releases/v0.3/6-store-listing/screenshots/ | PRD 约定的版本化归档路径 |
