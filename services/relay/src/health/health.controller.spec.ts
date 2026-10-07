import { describe, expect, it } from 'vitest';
import { renderHealth } from './health.controller.js';

describe('renderHealth', () => {
  it('redis 正常：200 语义的 ok 响应', () => {
    expect(renderHealth(true)).toEqual({ status: 'ok', version: '0.1.0', redis: 'ok' });
  });

  it('redis 挂了：degraded + redis down（供插件区分节点与缓存）', () => {
    expect(renderHealth(false)).toEqual({ status: 'degraded', version: '0.1.0', redis: 'down' });
  });
});
