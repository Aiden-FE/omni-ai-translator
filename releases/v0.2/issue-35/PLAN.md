# PLAN:popup 设置入口 - 翻译源配置迁移与现代化(Issue #35)

> 关联 Issue:#35 · PRD Issue:#30 · 迭代:v0.2
> 创建日期:2026-07-04

## 任务清单

### P0:核心实现

- [x] 1. 创建 `shared/ui/SourceConfigPanel.vue` 共享组件
  - 复杂度:高 · 依赖:无
  - 从 options/App.vue 迁移全部状态、方法、模板
  - 添加 variant prop('popup' | 'options')控制布局差异
  - 添加 focusFirst/addProvider expose 方法(popup footer + 打开即聚焦用)
  - popup 变体:配置自有源为全宽 primary 按钮在横幅下方
  - popup 变体:卡片可折叠(data-collapsed),默认折叠非活跃卡
  - options 变体:配置自有源为横幅内锚点,添加提供方按钮在卡片列表后

- [x] 2. 重构 `entrypoints/options/App.vue` 复用共享组件
  - 复杂度:中 · 依赖:1
  - 移除内联状态/方法/模板,改为引用 SourceConfigPanel(variant="options")
  - 保留 options 外壳(h1、max-width 720px)
  - 行为等价验证(lint/typecheck/build/e2e 全通过)

- [x] 3. 升级 `entrypoints/popup/App.vue` 为配置主入口
  - 复杂度:中 · 依赖:1
  - popup 外壳:header(logo+title) + scrollable body + footer
  - body 内渲染 SourceConfigPanel(variant="popup")
  - footer:「+ 添加提供方」按钮(调用 panel.addProvider()) + 「打开全部设置」链接
  - onMounted 调用 panel.focusFirst() 聚焦首项
  - 「打开全部设置」→ chrome.runtime.openOptionsPage()

### P1:样式与视觉还原

- [x] 4. 实现 popup 现代化样式(对照原型)
  - 复杂度:中 · 依赖:3
  - popup 窗口 400x600 + border-radius 8px + box-shadow + border
  - header 深色背景 #1F2937 + logo + title
  - body 可滚动(flex 1 + overflow-y auto)
  - footer border-top + 白底 + dashed add-btn + link
  - effective banner 两态样式(fallback 灰底 / active 白底) + dot indicator
  - card 可折叠样式(data-collapsed + chevron rotate)
  - 源类型 optgroup 分组(LLM 接口配置 / 传统翻译)
  - 聚焦环(outline: 2px solid #1F2937)
  - prefers-reduced-motion 支持

### P2:验证与回归

- [x] 5. 视觉还原自检(对照原型)
  - 复杂度:低 · 依赖:4
  - 色彩/间距/圆角对照原型 — 一致(深灰主色 #1F2937、8px/4px 圆角、4/8/12 间距)
  - 交互状态(横幅两态、卡片折叠、启用态) — 实现
  - 可访问性(聚焦首项、Tab 可达、role=status) — 实现

- [x] 6. 运行 lint + type-check + build
  - 复杂度:低 · 依赖:2,3
  - pnpm lint — 0 errors 0 warnings
  - vue-tsc 类型检查 — 通过
  - wxt build — 通过(156.38 kB)

- [x] 7. 运行 e2e 回归测试
  - 复杂度:低 · 依赖:6
  - pnpm e2e — 6/6 passed(划词翻译链路不退化)

- [x] 8. 运行单元测试
  - 复杂度:低 · 依赖:6
  - pnpm test — 103/103 passed
