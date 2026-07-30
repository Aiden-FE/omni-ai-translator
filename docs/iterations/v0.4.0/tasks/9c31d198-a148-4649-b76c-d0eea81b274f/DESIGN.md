# DESIGN: 搭建上下文菜单入口与全文翻译消息通道

> 版本: v0.4.0 | 任务: 9c31d198-a148-4649-b76c-d0eea81b274f

## 1. 目标与范围

为全文翻译功能落地「入口 + 命令通道」基建（本任务只做通道，不做页面翻译消费，消费由后续 t5 任务承接）：

1. 右键菜单：父项「全文翻译」+ 子项「翻译此页（替换）」/「翻译此页（双语对照）」，`contexts: ['page']`。
2. background → content 命令通道：`{ type: 'fullpage-translate', mode }` 经 `browser.tabs.sendMessage` 下发。
3. 机械提取 `getTargetLang()` 到 `shared/target-lang.ts`，供后续全文翻译任务复用，content.ts 行为不变。

**非目标**：逐段翻译 DOM 改造、翻译适配层变更、content 侧命令消费（t5）。

## 2. 关键设计决策

### 2.1 权限：重新引入 contextMenus

v0.3 #64 曾移除未使用的 `contextMenus`（合规清理）。本任务因全文翻译功能**实际使用**而重新引入，写入三浏览器共用 `baseManifest.permissions`（WXT 自动处理 Firefox MV2 归并）。

**知识差异上报**：`knowledges/adr/008` 与 `knowledges/context/development/extension-permissions-and-privacy.md` 记载「contextMenus 已移除」，本任务后过期；合规材料 `releases/v0.3/4-listing-compliance/PERMISSIONS-JUSTIFICATION.md` 需后续任务补充 contextMenus 用途说明（商店审核质询预案）。本任务不改长期知识与合规材料（只读检索原则）。

### 2.2 MV3 Service Worker 生命周期约束

- `browser.contextMenus.onClicked` 监听器在 `defineBackground` 主函数**顶层同步注册**：SW 被回收后由事件唤醒，顶层同步注册才能保证事件分发前监听器已绑定；放进异步回调会丢事件。
- `browser.contextMenus.create` 放在 `browser.runtime.onInstalled` 内：仅安装/更新时执行一次，SW 重启不重复创建，避免 `duplicate id` 运行时报错。

### 2.3 消息通道类型分离

现有 `Message` 联合是 content → background 方向（background 的 `runtime.onMessage` 消费）。新增 `BackgroundCommand` 联合表示 background → content 方向，二者**不混用**：

```ts
export type DisplayMode = 'replace' | 'bilingual';
export type BackgroundCommand =
  | { type: 'fullpage-translate'; mode: DisplayMode };
```

联合形式（而非单接口）为后续新增 background→content 命令预留扩展位，与 `Message` 的既有风格一致。

### 2.4 菜单 id 契约

| 菜单项 | id | mode 映射 |
|---|---|---|
| 全文翻译（父项） | `fullpage` | —（无点击行为） |
| 翻译此页（替换） | `fullpage-replace` | `replace` |
| 翻译此页（双语对照） | `fullpage-bilingual` | `bilingual` |

后续任务以此 id 命名为准。onClicked 中用 `Record<string, DisplayMode>` 做 id → mode 映射；`info.menuItemId` 类型为 `string | number`，先 `typeof === 'string'` 收窄（TS 严格模式，不用 `any`）。

### 2.5 发送与守卫

- `tab?.id` 空值守卫：`tab` 或 `tab.id` 缺失（如 devtools 上下文）时直接返回。
- `browser.tabs.sendMessage(tabId, command)` 返回 Promise；目标页 content script 未注入时（受限页面等）会 reject「Receiving end does not exist」，以 `.catch(() => {})` 消化，避免 SW 未处理 rejection 噪声。t5 落地 content 侧 `browser.runtime.onMessage` 消费后该通道闭环。

### 2.6 getTargetLang 提取（纯机械重构）

`entrypoints/content.ts` 内私有 `getTargetLang()` 原样搬入 `shared/target-lang.ts` 导出：读 `settings.defaultTargetLang`（trim 非空优先）→ 回退 `navigator.language` 映射表 → 未命中原样返回。content.ts 改为 `import { getTargetLang } from '@/shared/target-lang'`，删除本地实现与不再使用的 `getSettings` import（`noUnusedLocals` 要求）。划词翻译其余逻辑零改动。

## 3. 改动文件

| 文件 | 改动 |
|---|---|
| `shared/types.ts` | 新增 `DisplayMode`、`BackgroundCommand` |
| `shared/target-lang.ts` | 新增：导出的 `getTargetLang()` |
| `shared/__tests__/target-lang.test.ts` | 新增：单测覆盖配置优先/回退映射/未知语言 |
| `entrypoints/content.ts` | 改为 import `getTargetLang`，删本地实现 |
| `wxt.config.ts` | `permissions` 追加 `'contextMenus'` |
| `entrypoints/background.ts` | onInstalled 建菜单 + 顶层同步 onClicked → tabs.sendMessage |

## 4. 验证策略

1. RED：`target-lang.test.ts` 先写（模块未实现时失败）。
2. GREEN：实现 `shared/target-lang.ts` + content.ts 切换 → `vitest run` 全绿。
3. 绿色边界：每步后 `vue-tsc --noEmit` 通过。
4. `eslint` 通过；`wxt build`（Chrome MV3）+ `wxt build -b firefox`（MV2）产物 manifest 均含 `contextMenus`。
5. e2e：尝试 `playwright test` 回归划词链路（受沙箱浏览器可用性限制，不可行时如实记录）。
6. 手动右键菜单验证需真实浏览器加载构建产物，沙箱内不可行 → 记为待人工验证。

## 5. 风险

| 风险 | 缓解 |
|---|---|
| SW 异步注册监听器丢事件 | 顶层同步注册 onClicked（代码注释标注原因） |
| onInstalled 外建菜单 → duplicate id | create 全部置于 onInstalled 回调内 |
| content 未注入页 sendMessage reject | `.catch` 消化 + 注释 |
| 提取函数顺手改逻辑致划词回归 | 逐字符机械搬迁 + 单测 + e2e 回归 |
| 知识/合规材料与权限基线不一致 | 差异上报，后续任务同步（见 2.1） |
