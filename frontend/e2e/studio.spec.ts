import { test, expect } from './fixtures';
import AxeBuilder from '@axe-core/playwright';
for (const language of ['en','es'] as const) {
  test(`generation, cancellation, voice wizard and settings retain state (${language})`, async ({ page, api }) => {
    await page.goto('/');
    await page.getByRole('combobox', { name:'Interface language' }).selectOption(language);
    const es=language==='es';
    await page.locator('#text').fill('Hello desde SonicBoom');
    await page.getByRole('tab',{name:es?'Ajustes':'Settings',exact:true}).click();
    const setting=page.locator('[data-path="server.port"] input'); await setting.fill('18001');
    await page.getByRole('combobox',{name:es?'Idioma de la interfaz':'Interface language'}).selectOption(es?'en':'es');
    await expect(setting).toHaveValue('18001');
    await page.getByRole('combobox',{name:es?'Interface language':'Idioma de la interfaz'}).selectOption(language);
    await page.locator('[data-path="server.port"]').getByRole('button',{name:es?'Guardar':'Save',exact:true}).click();
    await expect(page.locator('[data-path="server.port"]')).toContainText(es?'Guardado.':'Saved.');
    expect(api.calls.some(call=>call.method==='PATCH'&&JSON.parse(call.body!).changes.server?.port===18001)).toBeTruthy();
    await page.getByRole('tab',{name:es?'Crear audio':'Create speech',exact:true}).click();
    await expect(page.locator('#text')).toHaveValue('Hello desde SonicBoom');
    await page.locator('#btn').click(); await expect(page.locator('#cancelGeneration')).toBeVisible();
    await page.getByRole('combobox',{name:es?'Idioma de la interfaz':'Interface language'}).selectOption(es?'en':'es');
    await expect(page.locator('#btn')).toHaveText(es?'Generating…':'Generando…');
    await page.getByRole('combobox',{name:es?'Interface language':'Idioma de la interfaz'}).selectOption(language);
    api.finishJob(); await expect(page.locator('#downloadAudio')).toBeVisible();
    await page.locator('#btn').click(); await page.locator('#cancelGeneration').click();
    await expect(page.getByRole('alert')).toContainText(es?'cancel':'cancel');
    expect(api.calls.filter(call=>call.path==='/api/tts/jobs'&&call.method==='POST')).toHaveLength(2);
    await page.getByRole('tab',{name:es?'Biblioteca de voces':'Voice library'}).click();
    await page.getByRole('button',{name:es?'Continuar':'Continue',exact:true}).click();
    await page.locator('#cloneFile').setInputFiles({name:'reference.wav',mimeType:'audio/wav',buffer:Buffer.from('RIFF0000WAVE0000')});
    await page.locator('#cloneTranscript').fill('Hello desde SonicBoom');
    await page.getByRole('button',{name:es?'Continuar':'Continue',exact:true}).click();
    await page.locator('#cloneName').fill('My new voice');await page.locator('#cloneConsent').fill('owner');await page.locator('#cloneSubmit').click();
    await expect(page.locator('#voicesList')).toContainText('My new voice');
    const upload=api.calls.find(call=>call.path==='/api/voices/clones');expect(upload?.body).toContain('RIFF');
    await page.locator('.voice-row').filter({hasText:'My new voice'}).getByRole('button',{name:es?'Usar':'Use',exact:true}).click();
    await expect(page.getByRole('tab',{name:es?'Crear audio':'Create speech',exact:true})).toHaveAttribute('aria-selected','true');
    await expect(page.locator('#model')).toHaveValue('qwen-base');
  });
}
test('system theme switches live with accessible palettes, native controls and no lost edits', async ({page,api},testInfo)=>{
  void api; await page.goto('/');await page.locator('#text').fill('Theme transition draft');
  for(const theme of ['light','dark'] as const) {
    await page.emulateMedia({colorScheme:theme});
    const colors=await page.evaluate(()=>{const s=getComputedStyle(document.documentElement);return Object.fromEntries(['--page','--surface','--surface-raised','--text','--text-secondary','--text-muted','--accent','--on-accent','--accent-surface','--warning','--warning-surface','--danger','--danger-surface','--success','--success-surface','--border'].map(key=>[key,s.getPropertyValue(key).trim()]))});
    function luminance(hex:string){const c=hex.slice(1).match(/../g)!.map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]}
    for(const [fg,bg] of [['--text','--page'],['--text-secondary','--surface'],['--text-muted','--surface-raised'],['--accent','--accent-surface'],['--on-accent','--accent'],['--warning','--warning-surface'],['--danger','--danger-surface'],['--success','--success-surface']]){const a=luminance(colors[fg]),b=luminance(colors[bg]);expect((Math.max(a,b)+.05)/(Math.min(a,b)+.05),`${theme} ${fg}/${bg}`).toBeGreaterThanOrEqual(4.5)}
    const a=luminance(colors['--border']),b=luminance(colors['--surface']);expect((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toBeGreaterThanOrEqual(3);
    await expect(page.locator('#text')).toHaveValue('Theme transition draft');
    const audit=await new AxeBuilder({page}).analyze();expect(audit.violations).toEqual([]);
    await page.screenshot({path:testInfo.outputPath(`desktop-${theme}.png`),fullPage:true});
    for(const [tab,file] of [['Settings','settings'],['Voice library','voices'],['Engines','engines']]) { await page.getByRole('tab',{name:tab,exact:true}).click();if(tab==='Settings') await page.getByText('Advanced configuration tools',{exact:true}).click();const audit=await new AxeBuilder({page}).analyze();expect(audit.violations,`${theme} ${tab}`).toEqual([]);await page.screenshot({path:testInfo.outputPath(`${file}-${theme}.png`),fullPage:true});if(tab==='Settings')await page.getByText('Advanced configuration tools',{exact:true}).click(); }await page.getByRole('tab',{name:'Create speech',exact:true}).click();
  }
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:testInfo.outputPath(`viewport-${width}.png`),fullPage:true})}
  await page.getByRole('tab',{name:'Create speech',exact:true}).focus();await page.keyboard.press('End');await expect(page.getByRole('tab',{name:'Settings',exact:true})).toBeFocused();
  const focus=await page.getByRole('tab',{name:'Settings',exact:true}).evaluate(el=>getComputedStyle(el).outlineStyle);expect(focus).not.toBe('none');
});
test('polling readiness never reloads or discards a draft', async({page,api})=>{
  api.setReady(false);await page.clock.install();await page.goto('/');await page.locator('#text').fill('Preserve me');await expect(page.locator('#btn')).toBeDisabled();api.setReady(true);await page.clock.fastForward(5100);await expect(page.locator('#btn')).toBeEnabled();await expect(page.locator('#text')).toHaveValue('Preserve me');
});
test('setup and admin use the same system theme and language controls',async({page,api},testInfo)=>{
  void api;
  for(const path of ['/setup','/admin/login']){await page.goto(path);await page.emulateMedia({colorScheme:'dark'});await page.getByRole('combobox',{name:'Interface language'}).selectOption('es');const audit=await new AxeBuilder({page}).analyze();expect(audit.violations).toEqual([]);await page.screenshot({path:testInfo.outputPath(path==='/setup'?'setup-dark-es.png':'login-dark-es.png'),fullPage:true});await page.getByRole('combobox',{name:'Idioma de la interfaz'}).selectOption('en')}
});
