// W-STILL-OVERLAY-NOGI — PHOTOREAL_STILL_RENDER.md §STILL_OVERLAY_NOGI (2026-10-05).
// ISSUE IT PROVES/DISPROVES: with no bounce (no WebGPU / touch), Alt+S finished but showed no Save PNG / Close overlay and
// §STILL_LOCK ate clicks — the still looked hung. Before the fix this witness FAILs at "overlay never appeared".
// Run: URL=http://<lan-ip>:<port>/viewer/viewer.html?db=/buildings/X.db#bld=X LOG=out.log node witness_still_overlay_nogi.js
// The URL MUST be a non-secure origin (LAN IP, not localhost) so navigator.gpu is absent; else verdict INCONCLUSIVE.
const { chromium } = require(process.env.PW || 'playwright-core');
const fs = require('fs'); const out = fs.createWriteStream(process.env.LOG || 'witness_still_overlay_nogi.log');
const T0 = Date.now(), t = () => ((Date.now() - T0) / 1000).toFixed(1), say = s => out.write(t() + ' ' + s + '\n');
const lines = [];
(async () => {
  const b = await chromium.launch({ headless: true, args: ['--enable-gpu', '--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  let last = Date.now();
  p.on('console', m => { last = Date.now(); lines.push(m.text()); say('[page] ' + m.text().slice(0, 600)); });
  p.on('pageerror', e => say('[PAGEERROR] ' + e.message));
  await p.goto(process.env.URL, { timeout: 300000 });
  for (const s = Date.now(); Date.now() - last < 20000 && Date.now() - s < 360000;) await new Promise(r => setTimeout(r, 1000));
  say('[W] loaded, pressing Alt+S');
  await p.keyboard.press('Alt+s');
  let ov = null;
  for (const s = Date.now(); Date.now() - s < 180000; await new Promise(r => setTimeout(r, 1000))) {
    ov = await p.evaluate(() => { const o = document.getElementById('gi-still-overlay'); if (!o) return null; const c = o.querySelector('canvas');
      return { save: [...o.querySelectorAll('button')].some(x => /Save PNG/.test(x.textContent)), title: (o.querySelector('b') || {}).textContent,
               cw: c && c.width, ch: c && c.height, rw: APP.renderer.domElement.width, rh: APP.renderer.domElement.height }; });
    if (ov) break;
  }
  const off = lines.find(l => /§GI_STILL_OFF/.test(l)), shown = lines.filter(l => /§STILL_OVERLAY_NOGI shown/.test(l)), fault = lines.some(l => /§STILL_OVERLAY_NOGI FAULT/.test(l));
  const m = shown[0] && +(/mean=([\d.]+)/.exec(shown[0]) || [])[1];
  say('[W] overlay=' + JSON.stringify(ov) + ' shownLines=' + shown.length + ' mean=' + m);
  let escOk = false;
  if (ov) { await p.keyboard.press('Escape'); await new Promise(r => setTimeout(r, 1500));
    escOk = await p.evaluate(() => !document.getElementById('gi-still-overlay') && !APP._stillRefineActive); say('[W] afterEsc overlayGone+stillOff=' + escOk); }
  let v, why;
  if (!off) { v = 'INCONCLUSIVE'; why = 'no §GI_STILL_OFF — bounce path ran, the no-bounce branch was not judged'; }
  else if (!ov) { v = 'FAIL'; why = 'overlay never appeared within 180 s after Alt+S (the defect)'; }
  else if (!ov.save) { v = 'FAIL'; why = 'overlay has no Save PNG button'; }
  else if (ov.cw !== ov.rw || ov.ch !== ov.rh) { v = 'FAIL'; why = 'overlay canvas ' + ov.cw + 'x' + ov.ch + ' != frame ' + ov.rw + 'x' + ov.rh; }
  else if (shown.length !== 1) { v = 'FAIL'; why = '§STILL_OVERLAY_NOGI shown logged ' + shown.length + 'x (want 1)'; }
  else if (fault || !(m >= 2)) { v = 'FAIL'; why = 'blank frame mean=' + m; }
  else if (!escOk) { v = 'FAIL'; why = 'Esc did not remove overlay and end the still'; }
  else { v = 'PASS'; why = 'overlay "' + ov.title + '" ' + ov.cw + 'x' + ov.ch + ' mean=' + m + ', Esc exits'; }
  say('§W_STILL_OVERLAY_NOGI ' + v + ' — ' + why + ' (' + (off || '').slice(0, 60) + ')');
  await b.close(); out.end(); process.exitCode = v === 'PASS' ? 0 : 1;
})().catch(e => { say('[W-ERR] ' + e.stack); out.end(); process.exitCode = 2; });
