import { test as base, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
export const meta = {
  'server.port': { path: 'server.port', description: 'TCP port the HTTP server listens on', type: 'integer', apply: 'restart_server', min: 1, max: 65535, secret: false, nullable: false },
  'audio.volume': { path: 'audio.volume', description: 'Playback volume (0.0-1.0)', type: 'number', apply: 'hot', min: 0, max: 1, secret: false, nullable: false },
  'logging.level': { path: 'logging.level', description: 'Log level filter', type: 'string', apply: 'hot', allowed_values: ['debug', 'info', 'warn'], secret: false, nullable: false },
};
export interface Fixture { calls: { path: string; method: string; body: string | null }[]; finishJob: (stage?: string) => void; setReady: (ready: boolean) => void }
export async function installApi(page: Page): Promise<Fixture> {
  let ready = true; let revision = 1; let port = 17842; let jobStage = 'running'; let resolveEvents: (() => void) | undefined;
  let voices = [{ id: 'profile-1', name: 'Narrator', provider: 'qwen3', model: 'qwen-base', language: 'es', clone_mode: 'icl', reference_duration_secs: 4, reference_sample_rate: 24000 }];
  const calls: Fixture['calls'] = [];
  const providers = () => ({ providers: [{ provider_id: 'supertonic', state: ready ? 'ready' : 'loading', enabled: true, effective_device: 'cpu', active_model: 'supertonic-3' }, { provider_id: 'qwen3', state: 'ready', enabled: true, effective_device: 'cpu', active_model: 'qwen-base' }], capabilities: [{ provider_id: 'supertonic', models: ['supertonic-3'], languages: ['en','es'], devices: ['cpu'], clone_modes: [], requires_reference_audio: false, requires_reference_transcript: false }, { provider_id: 'qwen3', models: ['qwen-base'], languages: ['en','es'], devices: ['cpu'], clone_modes: ['icl','x_vector'], requires_reference_audio: true, requires_reference_transcript: false }], diagnostics: { worker: 'ready' } });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url()); const path = url.pathname; const method = route.request().method();
    if (url.origin !== 'http://localhost:5180') return route.continue();
    if (['/','/setup','/admin/login'].includes(path)) {
      const data = path === '/setup' ? { page: 'setup' } : path === '/admin/login' ? { page: 'login' } : { page: 'home', modelReady: ready, voices: ready ? ['F1','M1'] : [], status: ready ? '' : 'Loading model...', providers: providers().providers.map(status => ({ status, models: status.active_model })) };
      const escaped = JSON.stringify(data).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
      return route.fulfill({ contentType: 'text/html', headers: { 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; connect-src 'self' ws://localhost:5180; object-src 'none'; base-uri 'none'" }, body: source.replace('SONICBOOM_PAGE_DATA',escaped) });
    }
    if (!path.startsWith('/api/') && !path.startsWith('/v1/') && !path.startsWith('/setup/')) return route.continue();
    calls.push({ path, method, body: route.request().postData() });
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (path === '/api/info') return json({ version: 'test', setup_complete: true, mode: 'desktop', auth: { required: false, mode: 'local' }, features: { audio_devices: true, playback: true }, model: { status: ready ? 'ready' : 'loading' }, config_revision: revision });
    if (path === '/api/providers') return json(providers());
    if (path === '/v1/voices') return json({ data: ready ? [{ id:'F1', name:'F1' }, { id:'M1', name:'M1' }] : [] });
    if (path === '/api/voices') return json({ data: voices });
    if (path === '/api/voices/clones') { const profile = { ...voices[0], id: 'profile-2', name: url.searchParams.get('name') || 'New voice' }; voices = [...voices,profile]; return json(profile,201); }
    if (path.startsWith('/api/voices/') && method === 'DELETE') { voices = voices.filter(voice => voice.id !== decodeURIComponent(path.split('/').at(-1)!)); return json({ success: true }); }
    if (path === '/api/config/schema') return json({ ...meta, 'providers.qwen3.enabled': { path: 'providers.qwen3.enabled', description: 'Enable the Qwen3-TTS voice-cloning provider (default false)', type:'boolean', apply:'hot', secret:false, nullable:false } });
    if (path === '/api/config/status') return json({ revision, config_path: '/test/config.toml', watcher:'watching', pending_applies:[], apply_failures:[] });
    if (path === '/api/config') { if (method === 'PATCH') { const body=route.request().postDataJSON(); port=body.changes.server?.port || port; revision++; } return json({ revision, config: { server:{ port }, audio:{ volume:.8 }, logging:{ level:'info' }, providers:{ qwen3:{ enabled:true } } } }); }
    if (path.startsWith('/api/config/')) return json({ success:true });
    if (path === '/api/audio/devices' || path === '/setup/audio-devices') return json({ devices:[{ id:'speakers',name:'Speakers' }] });
    if (path === '/setup/status') return json({ model:{ cache_dir:'/test/models' }, server:{ port:17842 } });
    if (path === '/setup/complete') return json({ api_url:'http://127.0.0.1:17842', audio_device:'default', auth:'local (no API token required)' });
    if (path === '/api/tts/jobs') { jobStage='running'; return json({ id:'one-job' },202); }
    if (path === '/api/tts/jobs/one-job') return json({ stage:jobStage, elapsed_secs:1, context:{ provider:'supertonic', model:'supertonic-3', voice:'F1', effective_device:'cpu' } });
    if (path === '/api/tts/jobs/one-job/events') { await new Promise<void>(resolve => { resolveEvents=resolve; }); return route.fulfill({ contentType:'text/event-stream',body:`data: ${JSON.stringify({stage:jobStage, elapsed_secs:2})}\n\n` }).catch(()=>{}); }
    if (path === '/api/tts/jobs/one-job/cancel') { jobStage='cancelled'; resolveEvents?.(); return json({ success:true }); }
    if (path === '/api/tts/jobs/one-job/audio') { const wav=Buffer.alloc(244);wav.write('RIFF');wav.writeUInt32LE(236,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(22050,24);wav.writeUInt32LE(44100,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(200,40);return route.fulfill({contentType:'audio/wav',body:wav}); }
    return json({message:'Unhandled fixture: '+path},404);
  });
  return { calls, finishJob(stage='completed') { jobStage=stage; resolveEvents?.(); }, setReady(value) { ready=value; } };
}
export const test = base.extend<{ api: Fixture }>({ api: async ({ page }, use) => { await use(await installApi(page)); } });
export { expect };
