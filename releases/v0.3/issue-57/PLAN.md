# Visual Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver Issue #57 by defining and applying the final v0.3 bright-but-comfortable theme tokens across app and content surfaces.

**Architecture:** Keep #56's shadcn-vue + Tailwind semantic-token architecture. Replace centralized CSS variable values, add missing warning/info semantic mappings, and update UX knowledge documents plus verification evidence.

**Tech Stack:** WXT, Vue 3, TypeScript, tailwindcss, shadcn-vue style local components, CSS custom properties.

---

## Scope And Files

- Modify: `shared/styles/tokens.css` - final app and content theme token values.
- Modify: `assets/content.css` - iframe/trigger token values and content surface polish.
- Modify: `tailwind.config.ts` - warning/info color namespaces.
- Modify: `shared/ui/components/button/Button.vue` - warning/info variants if needed.
- Modify: `shared/ui/components/badge/Badge.vue` - warning/info variants if needed.
- Modify: `knowledges/ux/design-system.md` - final v0.3 token table and state mapping.
- Modify: `knowledges/ux/accessibility.md` - updated contrast requirements and validation evidence.
- Modify: `releases/v0.3/issue-57/MEMORY.md` - implementation notes and Step5b knowledge points.

## Task 1: Finalize Theme Token Values

**Priority:** P0
**Complexity:** Medium
**Dependencies:** #56 token base exists

- [x] **Step 1: Update app tokens**

  Edit `shared/styles/tokens.css` so `:root` contains the final sunlit teal palette:

  ```css
  --background: 36 100% 98%;
  --foreground: 224 38% 16%;
  --card: 0 0% 100%;
  --card-foreground: 224 38% 16%;
  --popover: 0 0% 100%;
  --popover-foreground: 224 38% 16%;
  --primary: 174 84% 27%;
  --primary-foreground: 0 0% 100%;
  --secondary: 47 96% 90%;
  --secondary-foreground: 224 38% 16%;
  --muted: 37 43% 94%;
  --muted-foreground: 225 16% 39%;
  --accent: 18 100% 94%;
  --accent-foreground: 224 38% 16%;
  --destructive: 356 74% 46%;
  --destructive-foreground: 0 0% 100%;
  --success: 155 64% 30%;
  --success-foreground: 0 0% 100%;
  --warning: 38 92% 44%;
  --warning-foreground: 224 38% 16%;
  --info: 203 77% 37%;
  --info-foreground: 0 0% 100%;
  --border: 34 45% 84%;
  --input: 34 38% 76%;
  --ring: 174 84% 33%;
  ```

- [x] **Step 2: Update content tokens**

  In both `shared/styles/tokens.css` and `assets/content.css`, set content tokens to:

  ```css
  --translator-panel-background: 195 62% 16%;
  --translator-panel-foreground: 40 100% 97%;
  --translator-panel-muted: 39 30% 82%;
  --translator-panel-code: 194 42% 24%;
  --translator-panel-quote: 174 48% 48%;
  --translator-panel-link: 42 100% 72%;
  --translator-trigger-background: 174 84% 27%;
  --translator-trigger-foreground: 0 0% 100%;
  --translator-trigger-hover: 174 88% 22%;
  --translator-shadow: 0 18px 44px hsl(196 72% 12% / 0.28);
  --translator-trigger-shadow: 0 8px 20px hsl(174 84% 20% / 0.32);
  ```

- [x] **Step 3: Extend Tailwind theme**

  Add `warning` and `info` namespaces to `tailwind.config.ts`, matching the existing `success` and `destructive` structure.

## Task 2: Complete Semantic Component Coverage

**Priority:** P1
**Complexity:** Low
**Dependencies:** Task 1

- [x] **Step 1: Add Button semantic variants**

  In `shared/ui/components/button/Button.vue`, add:

  ```ts
  warning: 'bg-warning text-warning-foreground hover:bg-warning/90',
  info: 'bg-info text-info-foreground hover:bg-info/90',
  ```

- [x] **Step 2: Add Badge semantic variants**

  In `shared/ui/components/badge/Badge.vue`, add:

  ```ts
  warning: 'border-transparent bg-warning text-warning-foreground',
  info: 'border-transparent bg-info text-info-foreground',
  ```

- [x] **Step 3: Typecheck component variants**

  Run: `pnpm typecheck`

  Expected: no TypeScript or Vue template type errors.

## Task 3: Update UX Knowledge

**Priority:** P0
**Complexity:** Medium
**Dependencies:** Task 1

- [x] **Step 1: Update design-system token tables**

  Rewrite the color strategy and token sections in `knowledges/ux/design-system.md` so they describe the final v0.3 palette, not the #56 cold-color placeholder.

- [x] **Step 2: Add WCAG AA contrast evidence**

  Add the verified ratios from PRD/DESIGN to `knowledges/ux/design-system.md`.

- [x] **Step 3: Update accessibility guidance**

  Replace old `#1F2937` / `#F9FAFB` contrast statements in `knowledges/ux/accessibility.md` with the new token pair guidance and evidence.

## Task 4: Cold-Color Residual Review

**Priority:** P0
**Complexity:** Low
**Dependencies:** Tasks 1-3

- [x] **Step 1: Search old hex values**

  Run:

  ```powershell
  rg "#1F2937|#F9FAFB|#E5E7EB|#D1D5DB|#DC2626|#16A34A" -n --glob "!node_modules/**" --glob "!.output/**"
  ```

  Expected: no source or knowledge entries that still describe the old active theme as current.

- [x] **Step 2: Search old cold HSL token fragments**

  Run:

  ```powershell
  rg "215 28% 17%|210 20% 98%|220 13% 91%|220 13% 84%|217 19% 27%" -n --glob "!node_modules/**" --glob "!.output/**"
  ```

  Expected: no active token definitions using the old #56 cold base.

## Task 5: Full Verification And Regression

**Priority:** P0
**Complexity:** Medium
**Dependencies:** Tasks 1-4

- [x] **Step 1: Run typecheck**

  Run: `pnpm typecheck`

  Expected: passes.

- [x] **Step 2: Run lint**

  Run: `pnpm lint`

  Expected: passes.

- [x] **Step 3: Run build**

  Run: `pnpm build`

  Expected: passes and produces WXT output.

- [x] **Step 4: Run e2e if browser dependencies are available**

  Run: `pnpm e2e`

  Expected: passes. If Playwright browser dependencies are unavailable, record the exact failure and validate popup/options/content flows through build, typecheck, lint, and code review.

## Task 6: Documentation Closeout

**Priority:** P0
**Complexity:** Low
**Dependencies:** Tasks 1-5

- [x] **Step 1: Update MEMORY.md**

  Add implementation notes, verification results, and knowledge-deposition candidates to `releases/v0.3/issue-57/MEMORY.md`.

- [x] **Step 2: Confirm no `releases/v0.3/index.md` change**

  Because this is sub agent mode, do not update the sprint index. Confirm with `git diff -- releases/v0.3/index.md`.

## Auto Approval

This plan is auto-approved under prodflow-worker unattended mode because Issue #57, PRD #50, `releases/v0.3/2-visual-theme/PRD.md`, and the UX knowledge base provide sufficient constraints. The plan uses the smallest reversible implementation path: centralized token updates, narrow semantic token extension, documentation updates, and verification.
