import { expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { useSynthesis } from '../src/composables/useSynthesis';
import type { Studio } from '../src/composables/useStudio';
import { ApiError } from '../src/services/http';
function create() {
  const api = { createJob: vi.fn().mockResolvedValue({ id:'keep-this-job' }), job: vi.fn().mockResolvedValue({ stage:'completed' }), jobAudio: vi.fn(), cancelJob: vi.fn().mockResolvedValue({}), jobEvents: vi.fn() };
  const studio = { api, text:ref('Hello'), token:ref(''), info:ref({ auth:{ required:false } }), voice:ref('F1'), language:ref('en'), selectedModel:ref({ ready:true, cloned:false }) } as unknown as Studio;
  let state!: ReturnType<typeof useSynthesis>;
  const wrapper = mount(defineComponent({ setup() { state=useSynthesis(studio); return ()=>null; } }));
  vi.stubGlobal('URL',{ createObjectURL:vi.fn(()=> 'blob:generated-audio'), revokeObjectURL:vi.fn() });
  return { api, studio, state, wrapper };
}
it('resumes the original completed job after an audio download failure without new inference',async()=>{
  const {api,state}=create();api.jobAudio.mockRejectedValueOnce(new ApiError(503,'temporary audio failure')).mockResolvedValueOnce(new Blob(['audio']));
  await state.generate();expect(state.jobId.value).toBe('keep-this-job');expect(state.error.value).not.toBeNull();
  await state.generate();expect(api.createJob).toHaveBeenCalledTimes(1);expect(api.jobAudio).toHaveBeenCalledTimes(2);expect(state.audioUrl.value).toBe('blob:generated-audio');expect(state.jobId.value).toBeNull();
});
it('unmount aborts monitoring, releases browser resources and does not silently cancel server work',async()=>{
  const {api,state,wrapper}=create();let signal:AbortSignal|undefined;
  api.job.mockImplementation((_id:string,value:AbortSignal)=>{signal=value;return new Promise((_resolve,reject)=>value.addEventListener('abort',()=>reject(value.reason),{once:true}))});
  const running=state.generate();await flushPromises();wrapper.unmount();await running;
  expect(signal?.aborted).toBe(true);expect(api.cancelJob).not.toHaveBeenCalled();
});
it('drops a missing job instead of offering an endless resume loop',async()=>{
  const {api,state}=create();api.job.mockRejectedValue(new ApiError(404,'unknown job'));await state.generate();expect(state.jobId.value).toBeNull();expect(state.pending.value).toBe(false);expect(api.job).toHaveBeenCalledTimes(1);
});
