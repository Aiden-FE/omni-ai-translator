// 全文翻译悬浮工具栏 - 纯 DOM + Shadow DOM，不引 Vue（与 content script 侧零框架做法一致）
//
// 工具栏只发事件（callbacks），不直接操作翻译状态；状态编排全在 t5 orchestrator。
// 收起/展开属工具栏自身 UI 状态（非翻译状态），按钮点击直接管理 + 发通知回调。
//
// 样式隔离：宿主带 data-llm-translator（t2 分段排除、t5 观察器过滤、恢复清理均依赖）。
// shadow 边界天然隔离宿主脚本监听，按钮事件无需 stopPropagation。

import toolbarCss from '@/assets/fullpage-toolbar.css?inline';
import type { DisplayMode } from '../types';

/** 切换按钮文案随当前模式翻转：当前为 replace 时提示「切换为双语对照」，反之亦然 */
const SWITCH_LABELS: Record<DisplayMode, string> = {
  replace: '切换为双语对照',
  bilingual: '切换为替换',
};

/** 工具栏回调 - 工具栏只发事件，不直接操作翻译状态 */
export interface ToolbarCallbacks {
  /** 切换显示模式（replace <-> bilingual），编排器处理后调 setMode 更新文案 */
  onSwitchMode: () => void;
  /** 恢复原文 */
  onRestore: () => void;
  /** 重试失败段落 */
  onRetry: () => void;
  /** 收起工具栏（toolbar 已自动 collapse 切换为迷你把手） */
  onCollapse: () => void;
  /** 从迷你把手恢复工具栏（toolbar 已自动 expand），可选 */
  onRecall?: () => void;
}

/** 工具栏 API - 由编排器持有，控制模式文案、失败计数与折叠状态 */
export interface ToolbarApi {
  /** 设置当前显示模式，翻转切换按钮文案 + title + aria-label */
  setMode(mode: DisplayMode): void;
  /** 设置失败段落数：n>0 显示重试按钮并带计数徽标，n=0 隐藏 */
  setFailureCount(n: number): void;
  /** 隐藏工具栏，显示迷你把手 */
  collapse(): void;
  /** 隐藏迷你把手，显示工具栏 */
  expand(): void;
  /** 移除全部宿主节点（幂等：恢复原文与页面卸载路径都可能调用） */
  destroy(): void;
}

/**
 * 创建悬浮翻译工具栏。
 *
 * 宿主 div[data-llm-translator] 挂载到 document.body，position:fixed 右下角，
 * z-index 2147483647（与 content.css trigger/panel 同级约定）。
 * attachShadow({mode:'open'}) 注入自足样式（?inline CSS），shadow 根显式重置继承属性。
 *
 * 工具栏与迷你把手互斥可见（通过 host[data-collapsed] 属性 CSS 切换）。
 *
 * @param callbacks - 事件回调，工具栏只发事件不直接操作翻译状态
 * @returns ToolbarApi
 */
export function createToolbar(callbacks: ToolbarCallbacks): ToolbarApi {
  // ---- 宿主元素 ----
  const host = document.createElement('div');
  host.setAttribute('data-llm-translator', '');

  const shadow = host.attachShadow({ mode: 'open' });

  // 注入自足样式（shadow 根显式重置 font-family/color 等继承属性）
  const style = document.createElement('style');
  style.textContent = toolbarCss;
  shadow.appendChild(style);

  // ---- 工具栏容器 ----
  const toolbar = document.createElement('div');
  toolbar.className = 'llm-translator-toolbar';

  // ---- 切换模式按钮 ----
  const switchBtn = document.createElement('button');
  switchBtn.type = 'button';
  switchBtn.className = 'llm-translator-toolbar-btn llm-translator-toolbar-switch';
  switchBtn.textContent = SWITCH_LABELS.replace;
  switchBtn.title = SWITCH_LABELS.replace;
  switchBtn.setAttribute('aria-label', SWITCH_LABELS.replace);
  switchBtn.addEventListener('click', () => callbacks.onSwitchMode());

  // ---- 恢复原文按钮 ----
  const restoreBtn = document.createElement('button');
  restoreBtn.type = 'button';
  restoreBtn.className = 'llm-translator-toolbar-btn';
  restoreBtn.textContent = '恢复原文';
  restoreBtn.title = '恢复原文';
  restoreBtn.setAttribute('aria-label', '恢复原文');
  restoreBtn.addEventListener('click', () => callbacks.onRestore());

  // ---- 重试失败段落按钮（默认隐藏）----
  const retryBtn = document.createElement('button');
  retryBtn.type = 'button';
  retryBtn.className = 'llm-translator-toolbar-btn llm-translator-toolbar-retry';
  retryBtn.title = '重试失败段落';
  retryBtn.setAttribute('aria-label', '重试失败段落');
  retryBtn.hidden = true;
  // 文案 span + 计数徽标 span（space-between 布局）
  const retryLabel = document.createElement('span');
  retryLabel.textContent = '重试失败段落';
  const retryBadge = document.createElement('span');
  retryBadge.className = 'llm-translator-retry-badge';
  retryBadge.textContent = '0';
  retryBtn.appendChild(retryLabel);
  retryBtn.appendChild(retryBadge);
  retryBtn.addEventListener('click', () => callbacks.onRetry());

  // ---- 收起按钮 ----
  const collapseBtn = document.createElement('button');
  collapseBtn.type = 'button';
  collapseBtn.className = 'llm-translator-toolbar-btn';
  collapseBtn.textContent = '收起';
  collapseBtn.title = '收起工具栏';
  collapseBtn.setAttribute('aria-label', '收起工具栏');
  // 收起属 UI 状态，toolbar 直接管理 + 发通知回调
  collapseBtn.addEventListener('click', () => {
    collapse();
    callbacks.onCollapse();
  });

  toolbar.appendChild(switchBtn);
  toolbar.appendChild(restoreBtn);
  toolbar.appendChild(retryBtn);
  toolbar.appendChild(collapseBtn);
  shadow.appendChild(toolbar);

  // ---- 迷你把手（36px 圆形「译」按钮）----
  const miniHandle = document.createElement('button');
  miniHandle.type = 'button';
  miniHandle.className = 'llm-translator-mini-handle';
  miniHandle.textContent = '译';
  miniHandle.title = '展开工具栏';
  miniHandle.setAttribute('aria-label', '展开工具栏');
  // 展开属 UI 状态，toolbar 直接管理 + 发通知回调
  miniHandle.addEventListener('click', () => {
    expand();
    callbacks.onRecall?.();
  });
  shadow.appendChild(miniHandle);

  // ---- 挂载到文档 ----
  document.body.appendChild(host);

  let destroyed = false;

  // ---- ToolbarApi 实现 ----

  function setMode(mode: DisplayMode): void {
    const label = SWITCH_LABELS[mode];
    switchBtn.textContent = label;
    switchBtn.title = label;
    switchBtn.setAttribute('aria-label', label);
  }

  function setFailureCount(n: number): void {
    if (n > 0) {
      retryBtn.hidden = false;
      retryBadge.textContent = String(n);
      retryBtn.setAttribute('aria-label', `重试失败段落（${n} 个）`);
    } else {
      retryBtn.hidden = true;
    }
  }

  function collapse(): void {
    host.setAttribute('data-collapsed', '');
  }

  function expand(): void {
    host.removeAttribute('data-collapsed');
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    host.remove();
  }

  return {
    setMode,
    setFailureCount,
    collapse,
    expand,
    destroy,
  };
}
