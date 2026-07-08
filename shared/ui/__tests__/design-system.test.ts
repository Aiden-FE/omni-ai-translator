import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = process.cwd();

function readProjectFile(path: string): string {
  return readFileSync(resolve(projectRoot, path), 'utf8');
}

function stripCssVariableBlocks(css: string): string {
  return css.replace(/:root\s*\{[\s\S]*?\}/g, '');
}

describe('v0.3 design token foundation', () => {
  it('defines the shared app and content design tokens', () => {
    const tokensPath = resolve(projectRoot, 'shared/styles/tokens.css');

    expect(existsSync(tokensPath)).toBe(true);

    const tokens = readProjectFile('shared/styles/tokens.css');
    [
      '--background',
      '--foreground',
      '--card',
      '--card-foreground',
      '--primary',
      '--primary-foreground',
      '--border',
      '--input',
      '--ring',
      '--destructive',
      '--success',
      '--warning',
      '--info',
      '--translator-panel-background',
      '--translator-trigger-background',
    ].forEach((token) => {
      expect(tokens).toContain(token);
    });
  });

  it('uses the final v0.3 sunlit theme token values', () => {
    const tokens = readProjectFile('shared/styles/tokens.css');
    const contentCss = readProjectFile('assets/content.css');

    [
      '--background: 36 100% 98%',
      '--foreground: 224 38% 16%',
      '--primary: 174 84% 27%',
      '--accent: 18 100% 94%',
      '--destructive: 356 74% 46%',
      '--success: 155 64% 30%',
      '--warning: 38 92% 44%',
      '--info: 203 77% 37%',
      '--ring: 174 84% 33%',
      '--translator-panel-background: 195 62% 16%',
      '--translator-trigger-background: 174 84% 27%',
    ].forEach((declaration) => {
      expect(tokens).toContain(declaration);
    });

    [
      '--translator-panel-background: 195 62% 16%',
      '--translator-panel-foreground: 40 100% 97%',
      '--translator-trigger-background: 174 84% 27%',
      '--translator-trigger-hover: 174 88% 22%',
    ].forEach((declaration) => {
      expect(contentCss).toContain(declaration);
    });
  });

  it('maps warning and info semantic tokens through Tailwind and base variants', () => {
    const tailwindConfig = readProjectFile('tailwind.config.ts');
    const button = readProjectFile('shared/ui/components/button/Button.vue');
    const badge = readProjectFile('shared/ui/components/badge/Badge.vue');

    expect(tailwindConfig).toContain("warning: {");
    expect(tailwindConfig).toContain("DEFAULT: 'hsl(var(--warning))'");
    expect(tailwindConfig).toContain("info: {");
    expect(tailwindConfig).toContain("DEFAULT: 'hsl(var(--info))'");
    expect(button).toContain('bg-warning text-warning-foreground');
    expect(button).toContain('bg-info text-info-foreground');
    expect(badge).toContain('bg-warning text-warning-foreground');
    expect(badge).toContain('bg-info text-info-foreground');
  });

  it('keeps content script styling driven by translator tokens', () => {
    const contentCss = readProjectFile('assets/content.css');

    expect(contentCss).toContain('var(--translator-trigger-background)');
    expect(contentCss).toContain('var(--translator-panel-background)');
    expect(contentCss).toContain('var(--translator-panel-foreground)');
    expect(contentCss).toContain('var(--translator-panel-link)');
  });

  it('provides the shadcn-vue base component set used by settings UI', () => {
    [
      'shared/ui/components/button/Button.vue',
      'shared/ui/components/card/Card.vue',
      'shared/ui/components/input/Input.vue',
      'shared/ui/components/label/Label.vue',
      'shared/ui/components/select/Select.vue',
      'shared/ui/components/badge/Badge.vue',
      'shared/ui/components/scroll-area/ScrollArea.vue',
    ].forEach((componentPath) => {
      expect(existsSync(resolve(projectRoot, componentPath))).toBe(true);
    });
  });

  it('removes scattered hard-coded hex colors from migrated UI surfaces', () => {
    const migratedFiles = [
      'entrypoints/popup/App.vue',
      'entrypoints/options/App.vue',
      'shared/ui/SourceConfigPanel.vue',
      'assets/content.css',
    ];

    const hexColorPattern = /#[0-9a-fA-F]{3,8}\b/g;

    for (const file of migratedFiles) {
      const source = file.endsWith('.css')
        ? stripCssVariableBlocks(readProjectFile(file))
        : readProjectFile(file);

      expect(source.match(hexColorPattern) ?? [], file).toEqual([]);
    }
  });
});
