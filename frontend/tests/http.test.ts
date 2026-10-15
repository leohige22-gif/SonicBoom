import { expect, it, vi } from 'vitest';
import { createHttpClient, ApiError } from '../src/services/http';
import { createApi } from '../src/services/api';
it('sends bearer credentials only when required, preserving caller headers', async () => {
  const fetch = vi.fn(async () => new Response('{}', { status: 200 })); vi.stubGlobal('fetch', fetch);
  let required = true;
  const http = createHttpClient(() => ' secret ', () => required);
  await http.json('/api/config', { headers: { 'Content-Type': 'application/json' } });
  const options = fetch.mock.calls[0][1] as RequestInit;
  expect(new Headers(options.headers).get('Authorization')).toBe('Bearer secret');
  expect(new Headers(options.headers).get('Content-Type')).toBe('application/json');
  expect(options.credentials).toBe('same-origin');
  required = false; await http.response('/api/info');
  expect(new Headers((fetch.mock.calls[1][1] as RequestInit).headers).has('Authorization')).toBe(false);
});
it('preserves server status codes and JSON/plain text error messages', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('{"message":"revision conflict"}', { status: 409 })).mockResolvedValueOnce(new Response('unavailable', { status: 503 })));
  const http = createHttpClient();
  await expect(http.json('/api/config')).rejects.toMatchObject({ status: 409, message: 'revision conflict' });
  await expect(http.json('/api/info')).rejects.toBeInstanceOf(ApiError);
});
it('uploads the raw WAV with encoded query parameters, never multipart or JSON audio', async () => {
  const fetch = vi.fn(async () => new Response('{"id":"profile"}')); vi.stubGlobal('fetch', fetch);
  const api = createApi(createHttpClient()); const file = new File(['RIFF'], 'reference.wav', { type: 'audio/wav' });
  await api.createVoice({ name: 'A&B', provider: 'qwen3', model: 'base', language: 'es', mode: 'icl', consent_basis: 'owner', transcript: 'hola & adiós' }, file);
  const [url, options] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(new URL(url, 'http://localhost').searchParams.get('transcript')).toBe('hola & adiós');
  expect(new URL(url, 'http://localhost').searchParams.get('name')).toBe('A&B');
  expect(options.body).toBe(file); expect(new Headers(options.headers).get('Content-Type')).toBe('audio/wav');
});
