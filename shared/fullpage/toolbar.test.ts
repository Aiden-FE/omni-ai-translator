// @vitest-environment jsdom
// 工具栏单元测试 - 悬浮翻译工具栏与收起迷你把手

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createToolbar } from './toolbar';

/** 创建工具栏并返回 api 与关键 shadow 内元素引用 */
function setupToolbar(callbacks?: Partial<Record<string, () => void>>) {
  const cb = {
    onSwitchMode: callbacks?.onSwitchMode ?? vi.fn(),
    onRestore: callbacks?.onRestore ?? vi.fn(),
    onRetry: callbacks?.onRetry ?? vi.fn(),
    onCollapse: callbacks?.onCollapse ?? vi.fn(),
    onRecall: callbacks?.onRecall ?? vi.fn(),
  };
  const api = createToolbar(cb);

  const host = document.querySelector('[data-llm-translator]') as HTMLElement;
  const shadow = host.shadowRoot!;
  const toolbar = shadow.querySelector('.llm-translator-toolbar') as HTMLElement;
  const miniHandle = shadow.querySelector('.llm-translator-mini-handle') as HTMLButtonElement;
  const switchBtn = shadow.querySelector('.llm-translator-toolbar-switch') as HTMLButtonElement;
  const buttons = shadow.querySelectorAll('.llm-translator-toolbar-btn');
  const retryBtn = shadow.querySelector('.llm-translator-toolbar-retry') as HTMLButtonElement;

  return { api, cb, host, shadow, toolbar, miniHandle, switchBtn, buttons, retryBtn };
}

describe('createToolbar - 宿主与 Shadow DOM', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('创建带 data-llm-translator 属性的宿主元素', () => {
    const { host } = setupToolbar();
    expect(host).toBeInstanceOf(HTMLElement);
    expect(host.hasAttribute('data-llm-translator')).toBe(true);
  });

  it('宿主元素挂载 open shadow root', () => {
    const { host } = setupToolbar();
    expect(host.shadowRoot).not.toBeNull();
  });

  it('shadow root 内注入 style 元素', () => {
    const { shadow } = setupToolbar();
    const style = shadow.querySelector('style');
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain(':host');
    expect(style!.textContent).toContain('.llm-translator-toolbar');
  });

  it('宿主元素挂载到 document.body', () => {
    const { host } = setupToolbar();
    expect(host.isConnected).toBe(true);
    expect(host.parentElement).toBe(document.body);
  });
});

describe('createToolbar - 按钮组', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('包含 4 个按钮（切换/恢复/重试/收起）', () => {
    const { buttons } = setupToolbar();
    expect(buttons.length).toBe(4);
  });

  it('切换模式按钮默认文案为「切换为双语对照」（初始 replace 模式）', () => {
    const { switchBtn } = setupToolbar();
    expect(switchBtn.textContent).toBe('切换为双语对照');
  });

  it('恢复原文按钮文案为「恢复原文」', () => {
    const { buttons } = setupToolbar();
    const restoreBtn = Array.from(buttons).find((b) => b.textContent === '恢复原文');
    expect(restoreBtn).toBeDefined();
  });

  it('重试按钮默认隐藏（hidden 属性）', () => {
    const { retryBtn } = setupToolbar();
    expect(retryBtn.hidden).toBe(true);
  });

  it('收起按钮文案为「收起」', () => {
    const { buttons } = setupToolbar();
    const collapseBtn = Array.from(buttons).find((b) => b.textContent === '收起');
    expect(collapseBtn).toBeDefined();
  });

  it('所有按钮带 title 属性', () => {
    const { buttons } = setupToolbar();
    for (const btn of buttons) {
      expect(btn.title).not.toBe('');
    }
  });

  it('所有按钮带 aria-label 属性', () => {
    const { buttons } = setupToolbar();
    for (const btn of buttons) {
      expect(btn.getAttribute('aria-label')).not.toBeNull();
      expect(btn.getAttribute('aria-label')).not.toBe('');
    }
  });
});

describe('createToolbar - 迷你把手', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('包含迷你把手按钮（「译」）', () => {
    const { miniHandle } = setupToolbar();
    expect(miniHandle).toBeInstanceOf(HTMLButtonElement);
    expect(miniHandle.textContent).toBe('译');
  });

  it('迷你把手带 title 与 aria-label', () => {
    const { miniHandle } = setupToolbar();
    expect(miniHandle.title).not.toBe('');
    expect(miniHandle.getAttribute('aria-label')).not.toBeNull();
  });

  it('初始状态：工具栏可见，迷你把手不可见（无 data-collapsed）', () => {
    const { host } = setupToolbar();
    expect(host.hasAttribute('data-collapsed')).toBe(false);
  });
});

describe('setMode', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('设置为 bilingual 时翻转文案为「切换为替换」', () => {
    const { api, switchBtn } = setupToolbar();
    api.setMode('bilingual');
    expect(switchBtn.textContent).toBe('切换为替换');
  });

  it('设置为 replace 时翻转文案为「切换为双语对照」', () => {
    const { api, switchBtn } = setupToolbar();
    api.setMode('bilingual');
    api.setMode('replace');
    expect(switchBtn.textContent).toBe('切换为双语对照');
  });

  it('同步更新 title 与 aria-label', () => {
    const { api, switchBtn } = setupToolbar();
    api.setMode('bilingual');
    expect(switchBtn.title).toBe('切换为替换');
    expect(switchBtn.getAttribute('aria-label')).toBe('切换为替换');
  });
});

describe('setFailureCount', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('n>0 时显示重试按钮', () => {
    const { api, retryBtn } = setupToolbar();
    api.setFailureCount(3);
    expect(retryBtn.hidden).toBe(false);
  });

  it('n>0 时重试按钮含计数徽标', () => {
    const { api, retryBtn } = setupToolbar();
    api.setFailureCount(3);
    const badge = retryBtn.querySelector('.llm-translator-retry-badge');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe('3');
  });

  it('n>0 时重试按钮含「重试失败段落」文案', () => {
    const { api, retryBtn } = setupToolbar();
    api.setFailureCount(2);
    expect(retryBtn.textContent).toContain('重试失败段落');
  });

  it('n=0 时隐藏重试按钮', () => {
    const { api, retryBtn } = setupToolbar();
    api.setFailureCount(5);
    expect(retryBtn.hidden).toBe(false);
    api.setFailureCount(0);
    expect(retryBtn.hidden).toBe(true);
  });

  it('n=1 时徽标显示「1」', () => {
    const { api, retryBtn } = setupToolbar();
    api.setFailureCount(1);
    const badge = retryBtn.querySelector('.llm-translator-retry-badge');
    expect(badge!.textContent).toBe('1');
  });

  it('重复调用安全（先 5 后 3 徽标更新）', () => {
    const { api, retryBtn } = setupToolbar();
    api.setFailureCount(5);
    api.setFailureCount(3);
    const badge = retryBtn.querySelector('.llm-translator-retry-badge');
    expect(badge!.textContent).toBe('3');
  });

  it('n>0 时 aria-label 含计数', () => {
    const { api, retryBtn } = setupToolbar();
    api.setFailureCount(3);
    expect(retryBtn.getAttribute('aria-label')).toContain('3');
  });
});

describe('collapse / expand', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('collapse() 设置 data-collapsed 属性', () => {
    const { api, host } = setupToolbar();
    api.collapse();
    expect(host.hasAttribute('data-collapsed')).toBe(true);
  });

  it('expand() 移除 data-collapsed 属性', () => {
    const { api, host } = setupToolbar();
    api.collapse();
    api.expand();
    expect(host.hasAttribute('data-collapsed')).toBe(false);
  });

  it('collapse 后 expand 恢复可见', () => {
    const { api, host } = setupToolbar();
    api.collapse();
    expect(host.hasAttribute('data-collapsed')).toBe(true);
    api.expand();
    expect(host.hasAttribute('data-collapsed')).toBe(false);
  });

  it('重复 collapse 幂等', () => {
    const { api, host } = setupToolbar();
    api.collapse();
    api.collapse();
    expect(host.hasAttribute('data-collapsed')).toBe(true);
  });

  it('expand 在未 collapse 时也安全', () => {
    const { api, host } = setupToolbar();
    expect(() => api.expand()).not.toThrow();
    expect(host.hasAttribute('data-collapsed')).toBe(false);
  });
});

describe('destroy', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('移除宿主元素', () => {
    const { api, host } = setupToolbar();
    expect(host.isConnected).toBe(true);
    api.destroy();
    expect(host.isConnected).toBe(false);
  });

  it('销毁后不再有 data-llm-translator 元素', () => {
    const { api } = setupToolbar();
    api.destroy();
    expect(document.querySelector('[data-llm-translator]')).toBeNull();
  });

  it('重复调用幂等（不报错）', () => {
    const { api } = setupToolbar();
    api.destroy();
    expect(() => api.destroy()).not.toThrow();
  });
});

describe('按钮事件回调', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('点击切换模式按钮触发 onSwitchMode', () => {
    const onSwitchMode = vi.fn();
    const { switchBtn } = setupToolbar({ onSwitchMode });
    switchBtn.click();
    expect(onSwitchMode).toHaveBeenCalledTimes(1);
  });

  it('点击恢复原文按钮触发 onRestore', () => {
    const onRestore = vi.fn();
    const { buttons } = setupToolbar({ onRestore });
    const restoreBtn = Array.from(buttons).find((b) => b.textContent === '恢复原文')!;
    restoreBtn.click();
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it('点击重试按钮触发 onRetry', () => {
    const onRetry = vi.fn();
    const api = createToolbar({
      onSwitchMode: vi.fn(),
      onRestore: vi.fn(),
      onRetry,
      onCollapse: vi.fn(),
    });
    const host = document.querySelector('[data-llm-translator]') as HTMLElement;
    const retryBtn = host.shadowRoot!.querySelector('.llm-translator-toolbar-retry') as HTMLButtonElement;
    api.setFailureCount(2);
    retryBtn.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('点击收起按钮触发 onCollapse 并自动 collapse', () => {
    const onCollapse = vi.fn();
    const { buttons, host } = setupToolbar({ onCollapse });
    const collapseBtn = Array.from(buttons).find((b) => b.textContent === '收起')!;
    collapseBtn.click();
    expect(onCollapse).toHaveBeenCalledTimes(1);
    expect(host.hasAttribute('data-collapsed')).toBe(true);
  });

  it('点击迷你把手触发 onRecall 并自动 expand', () => {
    const onRecall = vi.fn();
    const { api, miniHandle, host } = setupToolbar({ onRecall });
    api.collapse();
    miniHandle.click();
    expect(onRecall).toHaveBeenCalledTimes(1);
    expect(host.hasAttribute('data-collapsed')).toBe(false);
  });

  it('onRecall 未提供时点击迷你把手不报错且仍 expand', () => {
    const api = createToolbar({
      onSwitchMode: vi.fn(),
      onRestore: vi.fn(),
      onRetry: vi.fn(),
      onCollapse: vi.fn(),
    });
    const host = document.querySelector('[data-llm-translator]') as HTMLElement;
    const miniHandle = host.shadowRoot!.querySelector('.llm-translator-mini-handle') as HTMLButtonElement;
    api.collapse();
    expect(() => miniHandle.click()).not.toThrow();
    expect(host.hasAttribute('data-collapsed')).toBe(false);
  });
});

describe('样式与定位', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('shadow 内 style 包含 z-index: 2147483647', () => {
    const { shadow } = setupToolbar();
    const style = shadow.querySelector('style')!;
    expect(style.textContent).toContain('2147483647');
  });

  it('shadow 内 style 包含 position: fixed', () => {
    const { shadow } = setupToolbar();
    const style = shadow.querySelector('style')!;
    expect(style.textContent).toContain('position: fixed');
  });

  it('shadow 内 style 包含 right: 16px 与 bottom: 16px', () => {
    const { shadow } = setupToolbar();
    const style = shadow.querySelector('style')!;
    expect(style.textContent).toContain('right: 16px');
    expect(style.textContent).toContain('bottom: 16px');
  });

  it('shadow 内 style 包含 max-width: 220px（尺寸克制）', () => {
    const { shadow } = setupToolbar();
    const style = shadow.querySelector('style')!;
    expect(style.textContent).toContain('max-width: 220px');
  });

  it('shadow 内 style 包含 teal 主色 174 84% 27%', () => {
    const { shadow } = setupToolbar();
    const style = shadow.querySelector('style')!;
    expect(style.textContent).toContain('174 84% 27%');
  });

  it('shadow 内 style 包含 hover/active 微交互', () => {
    const { shadow } = setupToolbar();
    const style = shadow.querySelector('style')!;
    expect(style.textContent).toContain(':hover');
    expect(style.textContent).toContain(':active');
  });

  it('shadow 内 style 包含 prefers-reduced-motion', () => {
    const { shadow } = setupToolbar();
    const style = shadow.querySelector('style')!;
    expect(style.textContent).toContain('prefers-reduced-motion');
  });

  it('切换模式按钮带 switch class（teal 强调）', () => {
    const { switchBtn } = setupToolbar();
    expect(switchBtn.classList.contains('llm-translator-toolbar-switch')).toBe(true);
  });
});

describe('Shadow DOM 隔离', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('宿主页面同名 class 不影响 shadow 内按钮', () => {
    document.body.innerHTML = '<div class="llm-translator-toolbar-btn" id="page-btn">page text</div>';
    const { switchBtn } = setupToolbar();
    const pageBtn = document.getElementById('page-btn')!;
    expect(switchBtn).not.toBe(pageBtn);
  });

  it('宿主页面 CSS 无法匹配 shadow 内元素（shadowRoot 可访问）', () => {
    const { host, switchBtn } = setupToolbar();
    // 宿主 document 查询不到 shadow 内元素
    expect(document.querySelector('.llm-translator-toolbar-switch')).toBeNull();
    // 但 shadowRoot 内可查询
    expect(host.shadowRoot!.querySelector('.llm-translator-toolbar-switch')).toBe(switchBtn);
  });
});
