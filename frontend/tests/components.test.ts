import { describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import StudioLayout from '../src/components/StudioLayout.vue';
import VoiceSelector from '../src/components/studio/VoiceSelector.vue';
import SettingField from '../src/components/studio/SettingField.vue';
import { studioKey } from '../src/composables/useStudio';
import { locale } from '../src/i18n';
import type { SettingSchema } from '../src/services/contracts';
describe('workspace components', () => {
  it('supports keyboard navigation with roving focus and one current panel', async () => {
    const wrapper = mount(StudioLayout, { attachTo: document.body, props: { modelValue: 'create' } });
    await wrapper.get('#tab-create').trigger('keydown', { key: 'End' });
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['settings']);
    await wrapper.setProps({ modelValue: 'settings' });
    expect(wrapper.get('#tab-settings').attributes('tabindex')).toBe('0');
    expect(wrapper.get('#tab-settings').attributes('aria-selected')).toBe('true');
    expect(wrapper.get('#panel-create').isVisible()).toBe(false);
    expect(wrapper.get('#panel-settings').isVisible()).toBe(true);
  });
  it('keeps a selected voice through search and language changes', async () => {
    const wrapper = mount(VoiceSelector, { props: { modelValue: 'F1', voices: [{ id: 'F1', name: 'F1', detail: 'Built-in voice', cloned: false }, { id: 'clone', name: 'Narrator', detail: 'qwen3 · es', cloned: true }] } });
    await wrapper.get('input[type=search]').setValue('narrator');
    expect(wrapper.findAll('input[type=radio]')).toHaveLength(1);
    locale.value = 'es'; await flushPromises();
    expect(wrapper.props('modelValue')).toBe('F1');
    expect(wrapper.text()).toContain('Voz seleccionada: F1');
    await wrapper.get('input[type=radio]').setValue();
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['clone']);
  });
  it('retains unsaved setting edits through polling and EN/ES changes, then saves typed data', async () => {
    const save = vi.fn(async () => {});
    const meta: SettingSchema = { path: 'server.port', description: 'TCP port the HTTP server listens on', type: 'integer', apply: 'restart_server', secret: false, nullable: false, min: 1, max: 65535 };
    const wrapper = mount(SettingField, { props: { meta, value: 17842 }, global: { provide: { [studioKey as symbol]: { saveSetting: save, devices: ref([]) } } } });
    await wrapper.get('input').setValue('18001'); await wrapper.setProps({ value: 18000 });
    locale.value = 'es'; await flushPromises();
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('18001');
    expect(wrapper.text()).toContain('Puerto');
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(save).toHaveBeenCalledWith('server.port', 18001);
    expect(wrapper.text()).toContain('Guardado.');
  });
});
