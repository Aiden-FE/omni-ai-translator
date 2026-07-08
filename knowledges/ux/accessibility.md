# 可访问性 — LLM Translator

## 对比度

v0.3 主题 token 需要满足 WCAG AA：

- 正文文字与背景对比度 >= 4.5:1。
- 大号文字与 UI 组件边界/状态对比度 >= 3:1。
- content 翻译浮层叠在网页上时必须保持不透明背景，确保译文不受宿主页面干扰。

当前 #57 token 验证结果：

| 组合 | 对比度 | 结论 |
|---|---:|---|
| `foreground` / `background` | 15.35:1 | 满足 AA |
| `muted-foreground` / `background` | 6.53:1 | 满足 AA |
| `primary-foreground` / `primary` | 4.89:1 | 满足 AA |
| `success-foreground` / `success` | 5.10:1 | 满足 AA |
| `destructive-foreground` / `destructive` | 5.55:1 | 满足 AA |
| `info-foreground` / `info` | 5.43:1 | 满足 AA |
| `warning-foreground` / `warning` | 5.76:1 | 满足 AA |
| `translator-panel-foreground` / `translator-panel-background` | 12.54:1 | 满足 AA |
| `translator-panel-muted` / `translator-panel-background` | 8.97:1 | 满足 AA |
| `translator-trigger-foreground` / `translator-trigger-background` | 4.89:1 | 满足 AA |

## 键盘

- 设置页所有可操作元素（输入框、按钮、下拉）可通过 Tab 聚焦与操作。
- focus-visible 使用 `--ring` token，颜色必须在暖白背景、卡片背景和 content 浮层内可见。
- 浮层为鼠标交互产物，第一版不强求键盘可达；后续可加快捷键。

## 文字与状态

- 不依赖纯图标或纯颜色传达信息，关键状态均有文字说明。
- 错误/成功/警告语义色用于辅助信息，不作为唯一区分手段；继续保留 `❌`、`✅`、`⚠` 或明确文案。
- 输入框带 placeholder 说明用途。

## 本地化

- 第一版界面文案为中文；目标语言由用户配置，支持任意语言输入。
- 后续可抽取文案做 i18n。
