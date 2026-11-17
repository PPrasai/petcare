import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const out = process.argv[2];
const only = process.argv[3]?.split(',');
const widths = [[900,720],[1280,720],[1920,1080]];
const themes = process.argv[4]?.split(',') ?? ['light'];
mkdirSync(out, { recursive: true });
const tab = (n) => async (p) => { const t=p.getByRole('tablist'); if(!(await t.isVisible())) await p.getByTestId('pet-row').filter({hasText:'Momo'}).click(); await t.waitFor(); if(n) await p.getByRole('tab',{name:n,exact:true}).click(); await p.waitForTimeout(400); };
const screens = [
  ['home','/',async()=>{}],
  ['overview','/',tab()],
  ['care','/',tab('Care')],
  ['health','/',tab('Health')],
  ['files','/',tab('Files')],
  ['expenses','/expenses',async()=>{}],
  ['household','/household',async()=>{}],
  ['contacts','/contacts',async()=>{}],
  ['settings','/settings',async()=>{}],
  ['sync','/sync',async()=>{}],
  ['emergency','/emergency',async()=>{}],
].filter(s=>!only||only.includes(s[0]));
const browser = await chromium.launch();

for (const theme of themes) for (const [w,h] of widths) {
  const ctx = await browser.newContext({ baseURL:'http://localhost:4173', viewport:{width:w,height:h}});
  const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  await page.emulateMedia({colorScheme:theme, reducedMotion:'reduce'});
  await page.goto('/sign-in');
  await page.getByRole('button',{name:'Try the demo'}).click();
  await page.getByRole('navigation',{name:'Main'}).waitFor();
  for (const [name,path,act] of screens) {
    await page.goto(path); await page.waitForTimeout(800);
    try { await act(page); } catch(e){ console.log('act fail',name,String(e).slice(0,80)); }
    await page.waitForTimeout(300);
    await page.screenshot({path:`${out}/${name}-${w}-${theme}.png`});
  }
  await ctx.close();
}
await browser.close();
