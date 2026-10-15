import { expect, it, vi } from 'vitest';
import { monitorJob } from '../src/services/jobs';
import { ApiError } from '../src/services/http';
import type { Api } from '../src/services/api';
it('reconciles a dropped SSE stream using the same job snapshot', async () => {
  vi.useFakeTimers();
  const job = vi.fn().mockResolvedValueOnce({ stage: 'running' }).mockResolvedValueOnce({ stage: 'completed' });
  const api = { job, jobEvents: vi.fn().mockRejectedValue(new ApiError(503, 'disconnected')) } as unknown as Api;
  const snapshot = vi.fn(); const result = monitorJob(api, 'original-job', snapshot, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(1000);
  await expect(result).resolves.toMatchObject({ stage: 'completed' });
  expect(job.mock.calls.map(call => call[0])).toEqual(['original-job', 'original-job']);
  expect(snapshot).toHaveBeenCalledTimes(2);
});
it('treats a missing private job as terminal and stops retrying', async () => {
  const job = vi.fn().mockRejectedValue(new ApiError(404, 'unknown job'));
  await expect(monitorJob({ job } as unknown as Api, 'id', vi.fn(), new AbortController().signal)).rejects.toMatchObject({ status: 404 });
  expect(job).toHaveBeenCalledTimes(1);
});
it('decodes fragmented SSE and releases its stream on completion', async () => {
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('data: {"stage":"com')); controller.enqueue(new TextEncoder().encode('pleted"}\n\n')); controller.close(); } });
  const api = { job: vi.fn().mockResolvedValue({ stage: 'running' }), jobEvents: vi.fn().mockResolvedValue(new Response(stream)) } as unknown as Api;
  await expect(monitorJob(api, 'id', vi.fn(), new AbortController().signal)).resolves.toMatchObject({ stage: 'completed' });
  expect(stream.locked).toBe(false);
});
