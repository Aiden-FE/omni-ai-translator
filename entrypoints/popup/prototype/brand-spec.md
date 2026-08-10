# Omni AI Translator Popup Prototype Brand Spec

This file belongs to a throwaway UI prototype. Production design authority remains in the shared tokens and components.

## Assets

- Prototype-local copy of the extension icon: `entrypoints/popup/prototype/assets/icon-128.png`
- Source extension icon: `public/icon/128.png`
- Shared tokens: `shared/styles/tokens.css`
- Shared application styles: `shared/styles/app.css`

## Visual Contracts

- Canvas: fixed `400 x 600` popup.
- Palette: the existing v0.3 sunlit theme. Warm ivory background, dark navy foreground, deep teal primary, pale yellow secondary, and pale coral accent.
- Typography: the existing system font stack.
- Radius: 4px to 8px. No oversized pills or nested cards.
- Motion: short state feedback only, with reduced-motion support.

## Prototype Question

Which information structure best supports quick text translation inside the existing popup shell?

- A: stacked workbench
- B: composer with result drawer
- C: result-first canvas
