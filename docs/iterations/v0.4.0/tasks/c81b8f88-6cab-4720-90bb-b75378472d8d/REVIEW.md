# 审查报告：全文翻译功能实现（v0.4.0 t1-t5）

> 审查任务：c81b8f88-6cab-4720-90bb-b75378472d8d
> 审查范围：`wxt.config.ts`、`entrypoints/background.ts`、`entrypoints/fullpage.content.ts`、`entrypoints/content.ts`（targetLang 提取）、`shared/types.ts`、`shared/target-lang.ts`、`shared/fullpage/*`、`assets/fullpage-*.css`、e2e 资产
> 审查日期：2026-08-03

## 一、验证结果（全部通过）

| 验证项 | 命令 | 结果 |
|--------|------|------|
| 类型检查 | `pnpm typecheck` | ✓ 通过（vue-tsc --noEmit 零错误） |
| Lint | `pnpm lint` | ✓ 通过（ESLint 零警告） |
| 单元测试 | `pnpm test -- --run` | ✓ 309 passed（15 文件） |
| E2E | `pnpm e2e` | ✓ 15 passed（28.3s；7 划词 + 8 全文翻译） |
| 构建 Chrome MV3 | `pnpm build` | ✓ manifest 含 `contextMenus` + 双 content script |
| 构建 Firefox MV2 | `pnpm build -b firefox` | ✓ manifest 含 `contextMenus`（MV2 归并）+ 双 content script |

## 二、问题清单

### 阻塞项

**无阻塞代码缺陷。** 以下为需在发版前处理的合规/验证项：

#### B1. [合规] PERMISSIONS-JUSTIFICATION.md 未同步 contextMenus 重新引入

- **严重级别**：阻塞发版（非代码缺陷）
- **现状**：`releases/v0.3/4-listing-compliance/PERMISSIONS-JUSTIFICATION.md` 仍将 `contextMenus` 标记为「已移除」，与 v0.4.0 manifest（`permissions: ['storage', 'contextMenus']`）不一致。
- **影响**：Chrome Web Store 审核会质疑 `contextMenus` 权限用途，若审核员参照该文档会发现矛盾。
- **知识登记**：`docs/knowledge/context/system/permissions-privacy.md` 已在「待办（合规同步）」中登记此差异。
- **建议**：发版前在 PERMISSIONS-JUSTIFICATION.md 中补充 `contextMenus` 用途说明（右键菜单全文翻译入口），或将该文件迁移到 v0.4.0 合规目录。

### 建议项（非阻塞）

#### S1. [样式隔离] 工具栏按钮未显式重置 font-weight

- **文件**：`assets/fullpage-toolbar.css`
- **现状**：`:host` 和 `.llm-translator-toolbar-btn` 设置了 `font-family`/`color`/`font-size`/`line-height`，但未设置 `font-weight`。在 `* { font-weight: 700; }` 等全局粗体页面上，切换/恢复/收起按钮会继承粗体。
- **对比**：block CSS（`.llm-translator-block-content`）已设 `font-weight: 400`，工具栏的迷你把手（`font-weight: 600`）和重试徽标（`font-weight: 600`）也已设置，仅 3 个普通按钮遗漏。
- **建议**：在 `.llm-translator-toolbar-btn` 或 `:host` 添加 `font-weight: 400`。

#### S2. [样式隔离] letter-spacing / text-transform / white-space 未重置

- **文件**：`assets/fullpage-toolbar.css`、`assets/fullpage-block.css`
- **现状**：这三个继承属性在 shadow DOM 内未显式重置。在极端样式页面（如 `body { text-transform: uppercase; letter-spacing: 2px; }`）上，工具栏和译文块文字会受影响。
- **影响程度**：低——PR #46 的核心坑（color 不可见）已通过显式 color 解决；这些属性影响排版美观但不影响可读性。
- **建议**：在 `:host` 上添加 `letter-spacing: normal; text-transform: none; white-space: normal;` 作为防御性重置。

#### S3. [生命周期] retrySegments 不支持 isActive 中止

- **文件**：`shared/fullpage/orchestrator.ts`（`handleRetry`）、`shared/fullpage/translate-pool.ts`（`retrySegments`）
- **现状**：`handleRetry` 调用 `retrySegments` 时未传 `isActive`。若用户在重试期间点击「恢复原文」，已派发的段仍会完成翻译（写入缓存），浪费 API 调用。
- **安全保证**：`handleSettled` 的 `active` 校验确保不误渲染（无闪回）；`toolbar` 为 null 后 `updateFailureCount` 的 `toolbar?.setFailureCount` 为 no-op。无 DOM 损坏或错误。
- **设计权衡**：DESIGN.md 已明确记录此决策（翻译仍完成并写入缓存，有利于再次触发时秒级渲染）。
- **建议**：可接受现状；若后续优化，可为 `retrySegments` 补充 `isActive` 支持。

#### S4. [验收标准 11] 强样式页面人工验证未执行

- **现状**：e2e 测试使用简单 fixture 页面（基本 font/padding/color 样式），未覆盖 GitHub/Wikipedia/新闻站等强样式页面。
- **CSS 实现**：所有注入 DOM 走 Shadow DOM，文本元素显式重置 color/font-family/font-size/line-height/background——理论上可应对强样式页面。
- **建议**：在真实浏览器加载构建产物，在 GitHub（Tailwind 重置）、Wikipedia（大量 `!important`）、新闻站（暗底主题）上人工截图验证译文块与工具栏可读性。

#### S5. [开发产物] run-vitest.sh 硬编码绝对路径

- **文件**：`run-vitest.sh`
- **现状**：包含硬编码路径 `/Users/aiden/dev/aiden/omni-ai-translator/node_modules/.bin/vitest`，在其他环境（包括 worktree）不可用。
- **建议**：删除该文件（`pnpm test` 已覆盖），或改为 `npx vitest run "$@"`。`run-tests.mjs` 同理可考虑移除。

#### S6. [代码整洁] CODE 同时存在于 BLOCK_TAGS 和 INLINE_TAGS

- **文件**：`shared/fullpage/segmenter.ts`
- **现状**：`CODE` 同时在 `BLOCK_TAGS` 和 `INLINE_TAGS` 集合中。`isBlockElement` 先于 `isInlineElement` 检查（`||` 短路），所以 CODE 实际被当作块级处理。功能正确但语义冗余。
- **建议**：从 `INLINE_TAGS` 中移除 `CODE`（保留在 `BLOCK_TAGS`），或添加注释说明 `PRE > CODE` 场景下 CODE 作为块级的意图。

## 三、验收标准 1-12 逐条确认

> 验收标准编号据 e2e DESIGN.md §3.3 用例->验收标准映射表与任务审查描述重建。

| # | 验收标准 | 状态 | 证据 |
|---|---------|------|------|
| 1 | 渐进渲染-触发：replace 模式右键触发全文翻译 | ✓ 达成 | e2e test 1：SW 广播触发 -> 段落开始译出 |
| 2 | 渐进渲染-时序：先译完先渲染，后行段此刻仍原文 | ✓ 达成 | e2e test 1：`#para-1` 译出时 `#para-4` 仍 `PARA4_ORIGINAL`（相对时序断言，自校验） |
| 3 | 渐进渲染-完成：最终所有段落译出 | ✓ 达成 | e2e test 1：4 正文段 + nav 链接 + footer + 按钮均为 `MOCK_TRANSLATION` |
| 4 | 双语对照：原文不变 + 译文块紧跟其后 | ✓ 达成 | e2e test 2：9 个 `.llm-translator-block-host`，原文 textContent 不变，`#para-1 + .llm-translator-block-host` shadow 含译文 |
| 5 | 替换模式：译文替换原文，保留行内子元素结构 | ✓ 达成 | 单测 `renderer.test.ts`（41 例覆盖 applyReplace 仅改 textNodes.data 不摧毁 a/strong）；e2e test 1 段落均译出 |
| 6 | 切换模式免重译：DOM 翻转且零 API | ✓ 达成 | e2e test 3：replace->bilingual 后 9 个 block-host + 原文还原 + `getRequestCount` 不变 |
| 7 | 恢复原文：无注入残留 + 逐字还原 | ✓ 达成 | e2e test 4：`[data-llm-translator]` 计数 0 + textContent 全等原文；单测 `renderer.test.ts` 验证 `restoreAll` 逐字节还原 `textNodes.data` |
| 8 | 失败处理：失败段保留原文 + 徽标 + 重试译出 | ✓ 达成 | e2e test 5：`__FAIL__` 段保留原文 + `.llm-translator-failed-host` shadow 含 ⚠ + 重试按钮计数 1 -> 复位后重试译出 + 徽标消失 + 按钮隐藏 |
| 9 | 增量翻译：动态新增段落自动翻译 | ✓ 达成 | e2e test 6：点 `#add-paragraph` -> `#added-para-1` 自动译出 + 请求计数 +1 |
| 10 | 缓存复用：恢复后再触发零 API | ✓ 达成 | e2e test 7：恢复原文 -> 再触发 -> 全部译出 + `getRequestCount` 不变（= INITIAL_REQUEST_COUNT） |
| 11 | 工具栏 UX + 样式可读 | △ 基本达成 | e2e test 8：收起->迷你把手可见、唤出->工具栏恢复。CSS 实现显式重置关键继承属性。**强样式页面人工验证待执行**（见 S4） |
| 12 | 工程门禁：typecheck + lint + e2e + 单测全绿 | ✓ 达成 | typecheck ✓ / lint ✓ / 309 单测 ✓ / 15 e2e ✓ |

## 四、详细审查

### 4.1 样式隔离健壮性（审查重点 1）

**结论：基本健壮，有 2 处可改进（S1/S2）。**

- **Shadow DOM 隔离**：译文块（`llm-translator-block-host`）、失败徽标（`llm-translator-failed-host`）、工具栏均使用 `attachShadow({ mode: 'open' })`，宿主页面 CSS 无法穿透 shadow 边界。✓
- **继承属性重置**：
  - block CSS：`.llm-translator-block-content` 显式设置 color/font-family/font-size/font-weight/line-height/background。✓
  - toolbar CSS：`:host` 显式设置 font-family/color/font-size/line-height。✓ 但 `font-weight` 未设（S1）。
  - PR #46 历史坑（color:inherit 导致暗底同色不可见）已规避——所有文本元素显式设置 color。✓
- **Token 自足**：toolbar CSS 在 `:host` 上定义 `--translator-*` CSS 变量，不依赖宿主文档 `:root`。✓
- **z-index**：工具栏 `z-index: 2147483647`（最大值），与项目既有约定一致。✓

### 4.2 恢复原文完整性（审查重点 2）

**结论：完整，无缺陷。**

- **逐字节还原**：`renderer.ts` 的 `captureOriginal` 在首次渲染时快照 `seg.textNodes.map(tn => tn.data)`（含原始空白），`restoreTextNodes` 逐节点写回 `.data`。非 `textContent`/`innerHTML` 整体覆盖。✓
- **行内子元素结构保留**：`applyReplace` 仅修改 `textNodes[0].data`（写译文）+ `textNodes[i].data = ''`（i≥1 置空），绝不覆盖 `seg.el.textContent`/`innerHTML`，a/strong 等行内子元素结构不被摧毁。✓
- **无 data-llm-translator 残留**：`restoreAll` 移除 `blockHost` + `clearFailedMark`；`handleRestore` 调 `toolbar?.destroy()`。e2e test 4 验证 `[data-llm-translator]` 计数 0。✓
- **嵌套段恢复**：父段和子段（如 `<p>` 与内部 `<a>`）各自独立快照与恢复，互不干扰。✓

### 4.3 资源与生命周期（审查重点 3）

**结论：正确，1 处设计权衡可接受（S3）。**

- **MutationObserver 不重复创建**：`startObserver` 有 `if (observer) return` 守卫；`stopObserver` 置 `observer = null`。恢复后再触发走 `doStart` -> `startObserver`（observer 已 null，创建新实例）。✓
- **Observer disconnect**：`handleRestore` 调 `stopObserver`（disconnect + 清 timer + 清 pendingAddedNodes）。✓
- **池 isActive 中止**：`runPool` 的 `isActive: () => active` 在派发新段前检查；恢复后 `active = false` -> 不再派发新段。已返回段的 `handleSettled` 检查 `active` 跳过渲染（防闪回）。✓
- **toolbar.destroy 幂等**：`destroyed` 标志位守卫，重复调用 no-op。`handleRestore` 后 `toolbar = null`，再次调 `toolbar?.destroy()` 为 no-op。✓
- **无闭包泄漏**：toolbar 事件监听器绑定在 shadow DOM 元素上，`host.remove()` 后随宿主 GC；observer disconnect 后无引用。模块级状态在 `__reset` / `handleRestore` 中清理。✓
- **防抖管线**：200ms 防抖 + `isFlushing` 并发守卫 + `data-llm-translator` 过滤防回环 + `recordedEls` 去重 + 错误隔离。✓

### 4.4 并发与错误路径（审查重点 4）

**结论：正确，无缺陷。**

- **并发 ≤ 3**：`runPool` 维护 `running` 数组，达 `concurrency`(3) 时 `Promise.race` 等一个完成。`.finally()` 正确移除已完成 promise。✓
- **sendMessage `{error}` 契约**：`translateSegment` 先 try/catch（兜底连接异常），再判 `result.error`（返回体字段，非 reject）。双路径覆盖。✓
- **失败段收集/重试/计数一致**：`handleSettled`(failed) -> `markFailed` + `updateFailureCount`；`handleRetry` 收集 failed 段 -> `clearFailedMark` -> `retrySegments` -> `updateFailureCount`。e2e test 5 验证计数 1 -> 重试 -> 0。✓
- **SW 回收容错**：逐段 `sendMessage` 各自独立，SW 回收后由事件唤醒重建。`onMessage` 监听器顶层同步注册。✓

### 4.5 兼容性（审查重点 5）

**结论：兼容，合规文档需同步（B1）。**

- **Firefox MV2**：`browser.contextMenus` API 可用（MV2 原生支持）；Shadow DOM 自 Firefox 63 起支持。manifest（MV2）含 `contextMenus` + 双 content script。✓
- **contextMenus 权限**：v0.4.0 重新引入，DESIGN.md §2.1 记录决策与知识差异上报。代码正确。✓
- **隐私声明**：`contextMenus` 仅用于右键菜单入口，不收集额外数据。PERMISSIONS-JUSTIFICATION.md 需更新（B1）。⚠️

### 4.6 回归（审查重点 6）

**结论：零回归。**

- **划词翻译**：`content.ts` 改动为纯机械提取（`getTargetLang` 搬入 `shared/target-lang.ts`，import 替换，删除本地实现与 `getSettings` import）。git diff 确认仅此 2 处改动。`target-lang.test.ts`（9 例）覆盖。e2e 划词 7 例全绿。✓
- **消息通道类型安全**：`Message`（content->background）与 `BackgroundCommand`（background->content）显式分离，background.ts 分别用于 `onMessage` 和 `onClicked`。fullpage.content.ts 用 `isBackgroundCommand` 类型守卫（`unknown` + 守卫，不用 `any`）。✓
- **TS 严格模式**：全量 `vue-tsc --noEmit` 通过，无 `any`。`info.menuItemId` 用 `typeof === 'string'` 收窄。✓

## 五、总结

全文翻译功能（t1-t5）实现质量高，架构清晰（编排器作为唯一状态持有者组合 4 个无状态组件），状态机完备（并发守卫、防闪回双保险、防抖增量管线），测试覆盖充分（309 单测 + 15 e2e）。验收标准 1-10、12 完全达成，验收标准 11 基本达成（强样式页面人工验证待执行）。

**发版前需处理**：
1. B1：更新 PERMISSIONS-JUSTIFICATION.md 的 contextMenus 说明
2. S4：在 GitHub/Wikipedia/新闻站人工验证样式可读性

**可择机改进**（不阻塞发版）：
- S1：工具栏按钮补 `font-weight: 400`
- S2：shadow DOM 补 `letter-spacing/text-transform/white-space` 重置
- S5：清理 `run-vitest.sh` / `run-tests.mjs` 开发产物
- S6：移除 `INLINE_TAGS` 中的 `CODE` 冗余
