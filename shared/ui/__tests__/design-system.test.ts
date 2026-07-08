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
      '--translator-panel-background',
      '--translator-trigger-background',
    ].forEach((token) => {
      expect(tokens).toContain(token);
    });
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
