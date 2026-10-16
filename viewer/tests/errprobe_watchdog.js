const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
(async () => {
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox','--enable-unsafe-webgpu','--enable-features=Vulkan','--ignore-gpu-blocklist','--use-angle=gl-egl','--window-size=1686,1044'] });
  const p = await b.newPage(); await p.setViewport({ width: 1666, height: 864 });
  const out = [];
  p.on('console', m => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning' || /ERROR|THREE\.WebGL|shader|§SOURCED|§LIGHT_ZONE|FAIL/i.test(t)) { out.push('[' + m.type() + '] ' + t.slice(0, 400)); console.log('[' + m.type() + '] ' + t.slice(0, 600)); } });
  p.on('pageerror', e => out.push('PAGEERROR ' + e.message.slice(0, 400)));
  await p.goto('http://127.0.0.1:' + (process.env.PORT || '8600') + '/viewer/viewer.html?db=/buildings/Hospital_extracted.db', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 70000));
  try { await p.evaluate(() => window.APP && window.APP.toggleStillRefine && window.APP.toggleStillRefine()); } catch (e) { out.push('EVAL ' + e.message); }
  await new Promise(r => setTimeout(r, 30000));
  const bar = await p.evaluate(() => Array.from(document.querySelectorAll('div')).filter(d => { const s = getComputedStyle(d); return /rgb\((2[0-5]\d|1[5-9]\d), ?[0-6]\d?, ?[0-6]\d?\)/.test(s.backgroundColor) && d.innerText && d.innerText.length < 400; }).map(d => d.innerText.slice(0, 300)).slice(0, 5));
  console.log(out.slice(0, 60).join('\n')); console.log('RED_BARS', JSON.stringify(bar));
  await b.close();
})().catch(e => { console.log('FATAL', e.message); process.exit(1); });
