import { test as base, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { chmodSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
const binary = process.env.SONICBOOM_TEST_BINARY;
const test = base.extend<{ production: string }>({
  production: async ({}, use, testInfo) => {
    test.skip(!binary, 'Set SONICBOOM_TEST_BINARY to a built release server executable.');
  const directory = mkdtempSync(join(tmpdir(), 'sonicboom-ui-production-'));
  const copied = join(directory, process.platform === 'win32' ? 'SonicBoom.exe' : 'SonicBoom');
  copyFileSync(resolve(binary!), copied); chmodSync(copied, 0o755);
  const port = await new Promise<number>((resolvePort, reject) => {
    const listener = createServer(); listener.on('error', reject);
    listener.listen(0, '127.0.0.1', () => { const address=listener.address(); if (!address || typeof address === 'string') throw new Error('Port discovery failed'); const value=address.port; listener.close(()=>resolvePort(value)); });
  });
  const env: NodeJS.ProcessEnv = { ...process.env, SONICBOOM_CONFIG: join(directory, 'config.toml'), PORT: String(port), BIND: '127.0.0.1', SONICBOOM_FRONTEND_DEV: '1' };
  delete env.SONICBOOM_ADMIN_PW;
  let processHandle: ChildProcess | undefined;
  const origin = `http://127.0.0.1:${port}`;
  let output = '';
  try {
    processHandle = spawn(copied, ['--smoke-test'], { cwd: directory, env });
    processHandle.stdout?.on('data', value => { output += String(value); }); processHandle.stderr?.on('data', value => { output += String(value); });
    await expect.poll(async()=>{try{return (await fetch(origin+'/health')).status}catch{return 0}}, { timeout:7000 }).toBe(200);
    await use(origin);
  } finally {
    if (processHandle && processHandle.exitCode === null) { const closed=new Promise<void>(done=>processHandle!.once('close',()=>done())); processHandle.kill('SIGTERM'); await closed; }
    await testInfo.attach('production-server.log',{body:output,contentType:'text/plain'});
    rmSync(directory,{recursive:true,force:true});
  }

  },
});
test('embedded production UI: strict CSP, live theme, EN/ES and setup', async ({ page, production: origin }, testInfo) => {
    const violations: string[] = [];
    page.on('console', message => { if (/content security policy|violates.*policy/i.test(message.text())) violations.push(message.text()); });
    const response=await page.goto(origin+'/setup');
    const csp=response!.headers()['content-security-policy'];expect(csp).toContain("script-src 'self'");expect(csp).toContain("style-src 'self';");expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|localhost:5173/);
    await expect(page.locator('script:not([src]),style')).toHaveCount(0);
    const scripts=await page.locator('script[src]').evaluateAll(elements=>elements.map(element=>element.getAttribute('src')));expect(scripts.every(src=>src?.startsWith('/assets/'))).toBe(true);
    for(const src of scripts){const asset=await page.request.get(origin+src);expect(asset.status()).toBe(200);expect(asset.headers()['cache-control']).toContain('immutable')}
    await page.getByRole('combobox',{name:'Interface language'}).selectOption('es');await page.emulateMedia({colorScheme:'dark'});
    await expect(page.getByRole('heading',{name:'Te damos la bienvenida a SonicBoom'})).toBeVisible();
    await page.getByRole('button',{name:'Continuar',exact:true}).click();await page.getByRole('button',{name:'Continuar',exact:true}).click();await page.getByRole('button',{name:'Continuar',exact:true}).click();await page.locator('[name=admin_password]').fill('isolated-production-check-12345');page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'Completar configuración'}).click();await expect(page).toHaveURL(origin+'/');
    await expect(page.getByRole('heading',{name:'Crear audio',exact:true})).toBeVisible();
    await page.getByRole('tab',{name:'Ajustes',exact:true}).click();await expect(page.locator('[data-path="server.port"] input')).toHaveValue(new URL(origin).port);
    const audit=await new AxeBuilder({page}).analyze();expect(audit.violations).toEqual([]);
    await page.getByRole('combobox',{name:'Idioma de la interfaz'}).selectOption('en');await expect(page.getByRole('heading',{name:'Settings',exact:true})).toBeVisible();
    await page.screenshot({path:testInfo.outputPath('embedded-settings-dark.png'),fullPage:true});
    expect(violations).toEqual([]);
});

test('embedded production UI: real session, CSRF, one-time token, revoke and logout', async ({ page, production: origin }) => {
    const setup = await page.request.post(origin+'/setup/complete', { headers: { origin }, data: { usage_mode:'local', audio_device:'default', inference_steps:5, model_cache_dir:null, bind:null, port:Number(new URL(origin).port), auth_mode:'local', admin_username:'admin', admin_password:'isolated-production-check-12345' } });
    expect(setup.status()).toBe(200);
    await page.goto(origin+'/admin/login');await page.locator('[name=id]').fill('admin');await page.locator('[name=pw]').fill('isolated-production-check-12345');await page.getByRole('button',{name:'Login',exact:true}).click();await expect(page.getByRole('heading',{name:'API access',exact:true})).toBeVisible();
    const denied=await page.request.post(origin+'/admin/tokens',{form:{csrf_token:'invalid'},headers:{origin:'http://foreign.invalid'}});expect(denied.status()).toBe(403);
    const badCsrf=await page.request.post(origin+'/admin/tokens',{form:{csrf_token:'invalid'},headers:{origin}});expect(badCsrf.status()).toBe(403);
    await page.getByRole('button',{name:'Generate Token',exact:true}).click();await expect(page.getByRole('heading',{name:'New Token Created',exact:true})).toBeVisible();
    const oneTimeResponse=await page.request.get(origin+'/admin');expect(oneTimeResponse.headers()['cache-control']).toBe('no-store');
    await page.getByRole('button',{name:'Revoke',exact:true}).first().click();await expect(page.getByRole('cell',{name:'Revoked',exact:true}).first()).toBeVisible();await page.getByRole('button',{name:'Logout',exact:true}).click();await expect(page.getByRole('heading',{name:'Admin Login'})).toBeVisible();

});
