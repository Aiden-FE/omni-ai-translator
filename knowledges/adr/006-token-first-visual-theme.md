# 视觉主题采用 token-first 单一事实源策略

v0.3 弃用 v0.2 的灰白黑冷色，改用 sunlit teal 明亮主题（#57 / PR #60）。我们采用 token-first 策略：在 `shared/styles/tokens.css` 的 `:root` 集中定义全部主题 token（主色/强调/secondary/muted/success/destructive/warning/info/中性/边框/输入框/ring/radius，以及划词浮层专属 panel/trigger/shadow token）为 HSL 分量形式的 CSS 自定义属性（如 `--primary: 174 84% 27%`）；`tailwind.config.ts` 将所有 Tailwind 颜色 utility 映射到 `hsl(var(--token))`，`Button`/`Badge` 等基础组件 variant 与 `assets/content.css` 划词浮层全部引用同一套 token；`shared/ui/__tests__/design-system.test.ts` 单测锁定 token 值，保证「改主题只改 tokens.css 一处」且 popup/options/划词三层视觉一致。

**状态**: accepted

**考虑过的选项**:

| 方案 | 描述 | 结论 |
|------|------|------|
| A. token-first | tokens.css 单一事实源 + Tailwind/组件/content.css 全映射 + design-system 单测锁定 | 采用 - 改主题单点修改、可单测、三层样式统一 |
| B. Tailwind 内置色板 + 散落 utility | 直接用 Tailwind 默认色板与 color utility class，不建 token 层 | 否决 - 主题/品牌调整需逐处改色，易遗漏且无法单测锁定 |
| C. 仅 CSS 变量不接入 Tailwind/组件 | 只在 CSS 里定义变量，组件不通过 Tailwind 映射消费 | 否决 - popup/options/划词三层样式割裂，warning/info 等语义色无法在组件 variant 层统一 |

**后果**:

- 主题调整（含未来深色模式 / 品牌色变更）只需改 `tokens.css` 一处，Tailwind utility 与组件 variant 自动跟随；但新增语义色需同步 `tokens.css`、`tailwind.config.ts` 与 design-system 单测三处，缺一即被单测拦截。
- token 以 HSL 分量（`H S% L%`）而非 hex 存储，便于后续派生透明度变体与做对比度计算；WCAG AA 对比度验证记录在 `knowledges/ux/accessibility.md`，最终色板记录在 `knowledges/ux/design-system.md`。
- 回滚方式：还原 `tokens.css`、`content.css`、`tailwind.config.ts`、`Button.vue`、`Badge.vue`、`design-system.test.ts` 至 #56 基座状态即可恢复旧冷色主题。
