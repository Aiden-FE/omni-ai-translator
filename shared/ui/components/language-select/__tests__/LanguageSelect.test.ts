// @vitest-environment jsdom
// LanguageSelect 组件单元测试（#78）：可搜索目标语言选择器
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import LanguageSelect from '../LanguageSelect.vue';
import { LANGUAGE_CATALOG, findLanguageByCode } from '@/shared/language-catalog';

function mountSelect(props: { modelValue?: string; disabled?: boolean; ariaLabel?: string } = {}) {
  return mount(LanguageSelect, {
    props: { modelValue: props.modelValue ?? 'en', disabled: props.disabled, ariaLabel: props.ariaLabel },
    attachTo: document.body,
  });
}

async function openDropdown(wrapper: ReturnType<typeof mountSelect>) {
  await wrapper.find('button[role="combobox"]').trigger('click');
}

describe('LanguageSelect — 触发器展示当前选中语言', () => {
  it('展示选中语言的中文名与代码', () => {
    const wrapper = mountSelect({ modelValue: 'zh-CN' });
    const trigger = wrapper.find('button[role="combobox"]');
    expect(trigger.text()).toContain('简体中文');
  });

  it('disabled 时触发器禁用', () => {
    const wrapper = mountSelect({ disabled: true });
    expect(wrapper.find('button[role="combobox"]').attributes('disabled')).toBeDefined();
  });

  it('ariaLabel 绑定到 combobox 触发器（而非外层容器）', () => {
    const wrapper = mountSelect({ ariaLabel: '目标语言' });
    expect(wrapper.find('button[role="combobox"]').attributes('aria-label')).toBe('目标语言');
    expect(wrapper.find('div.relative').attributes('aria-label')).toBeUndefined();
  });
});

describe('LanguageSelect — 搜索过滤', () => {
  it('打开后展示完整目录并聚焦搜索框', async () => {
    const wrapper = mountSelect();
    await openDropdown(wrapper);
    const options = wrapper.findAll('[role="option"]');
    expect(options.length).toBe(LANGUAGE_CATALOG.length);
    expect(wrapper.find('input[type="search"]').element).toBe(document.activeElement);
  });

  it('按代码搜索（大小写不敏感）', async () => {
    const wrapper = mountSelect();
    await openDropdown(wrapper);
    const input = wrapper.find('input[type="search"]');
    await input.setValue('ZH-');
    const options = wrapper.findAll('[role="option"]');
    expect(options.length).toBe(2);
    expect(options.map((o) => o.text()).join(' ')).toContain('简体中文');
    expect(options.map((o) => o.text()).join(' ')).toContain('繁體中文');
  });

  it('按中文名搜索', async () => {
    const wrapper = mountSelect();
    await openDropdown(wrapper);
    await wrapper.find('input[type="search"]').setValue('日语');
    const options = wrapper.findAll('[role="option"]');
    expect(options.length).toBe(1);
    expect(options[0].text()).toContain('日本語');
    expect(options[0].attributes('data-code')).toBe('ja');
  });

  it('按原文名搜索', async () => {
    const wrapper = mountSelect();
    await openDropdown(wrapper);
    await wrapper.find('input[type="search"]').setValue('français');
    const options = wrapper.findAll('[role="option"]');
    expect(options.length).toBe(1);
    expect(options[0].attributes('data-code')).toBe('fr');
  });

  it('无匹配时展示「没有匹配的语言」', async () => {
    const wrapper = mountSelect();
    await openDropdown(wrapper);
    await wrapper.find('input[type="search"]').setValue('不存在的语言xyz');
    expect(wrapper.findAll('[role="option"]').length).toBe(0);
    expect(wrapper.text()).toContain('没有匹配的语言');
  });
});

describe('LanguageSelect — 选择与选中高亮', () => {
  it('当前选中项带 aria-selected', async () => {
    const wrapper = mountSelect({ modelValue: 'ja' });
    await openDropdown(wrapper);
    const selected = wrapper.find('[role="option"][data-code="ja"]');
    expect(selected.attributes('aria-selected')).toBe('true');
    const others = wrapper.findAll('[role="option"][data-code="en"]');
    expect(others[0].attributes('aria-selected')).toBe('false');
  });

  it('点击选项发出 update:modelValue 并关闭弹层', async () => {
    const wrapper = mountSelect();
    await openDropdown(wrapper);
    await wrapper.find('input[type="search"]').setValue('韩语');
    await wrapper.find('[role="option"][data-code="ko"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([['ko']]);
    await nextTick();
    expect(wrapper.find('input[type="search"]').exists()).toBe(false);
  });

  it('Esc 关闭弹层', async () => {
    const wrapper = mountSelect();
    await openDropdown(wrapper);
    expect(wrapper.find('input[type="search"]').exists()).toBe(true);
    await wrapper.find('input[type="search"]').trigger('keydown', { key: 'Escape' });
    await nextTick();
    expect(wrapper.find('input[type="search"]').exists()).toBe(false);
  });

  it('方向键移动高亮项，Enter 确认选择', async () => {
    const wrapper = mountSelect();
    await openDropdown(wrapper);
    const input = wrapper.find('input[type="search"]');
    await input.setValue('中文');
    // 匹配 zh-CN / zh-TW；从第一项开始，ArrowDown 移到第二项后 Enter
    await input.trigger('keydown', { key: 'ArrowDown' });
    await input.trigger('keydown', { key: 'Enter' });
    const emitted = wrapper.emitted('update:modelValue');
    expect(emitted).toBeTruthy();
    expect(emitted![0]).toEqual(['zh-TW']);
  });

  it('点击外部关闭弹层', async () => {
    const wrapper = mountSelect();
    await openDropdown(wrapper);
    expect(wrapper.find('input[type="search"]').exists()).toBe(true);
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await nextTick();
    expect(wrapper.find('input[type="search"]').exists()).toBe(false);
  });
});

describe('LanguageSelect — 选项展示格式', () => {
  it('选项展示「中文名 / 原文名 · 代码」', async () => {
    const wrapper = mountSelect();
    await openDropdown(wrapper);
    const entry = findLanguageByCode('fr')!;
    const option = wrapper.find(`[role="option"][data-code="fr"]`);
    const text = option.text();
    expect(text).toContain(entry.zhName);
    expect(text).toContain(entry.nativeName);
    expect(text).toContain('fr');
  });
});
