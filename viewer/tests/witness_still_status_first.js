// ⚠ DO NOT REMOVE — witness for §STILL_STATUS_FIRST (bim-compiler PHOTOREAL_STILL_RENDER.md). Read the log after every run.
// Issue: the Alt+S status only appeared after the synchronous still staging (~5 s desktop). Proves it is painted
// FIRST: a real Alt+S keypress must log §STILL_STATUS painted -> frame -> stagingStart (gap < ~100 ms), the toast
// must be visible before staging, and the still (and the bounce, where supported) must still complete.
// Usage: node viewer/tests/witness_still_status_first.js --port 8600
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const arg = (k, d) => process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d;
const PORT = +arg('--port', 8600), DB = arg('--db', '/buildings/HHS_Office_Federated_silent.db');
const OUT = process.env.OUT || '/tmp/witness_still_status'; fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, 'log.txt'); const lines = []; const T0 = Date.now();
function say(s) { const t = '+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s; lines.push(t); console.log(t); fs.writeFileSync(LOG, lines.join('\n')); }
(async () => {
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=gl-egl', '--window-size=1300,900'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  p.on('console', m => { const t = m.text(); if (/§STILL_STATUS|§KBD_ROUTE Alt\+S|§PHOTO_STAGING on|§GI_STILL (done|stage)|§GI_STILL_OFF|PAGEERROR|§LOAD_FAIL|§SUN_SHADOW_RESTORE|§STILL_POSE/.test(t)) say('[page] ' + t.slice(0, 200)); });
  p.on('pageerror', e => say('PAGEERROR ' + e.message));
  await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=' + DB, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.APP && window.APP.cinemaPathPlan, { timeout: 180000 });
  try { await p.waitForFunction(() => { try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; } catch (e) { return false; } }, { timeout: 120000, polling: 2000 }); } catch (e) {}
  const blds = await p.evaluate(() => (window.APP.dbQuery('SELECT DISTINCT building FROM elements_meta') || []).map(r => r[0]));
  for (const bb of blds) { await p.evaluate(x => { try { window.APP.streamBuilding(x); } catch (e) {} }, bb);
    let prev = -1, st = 0; for (let i = 0; i < 90 && st < 3; i++) { const n = await p.evaluate(() => Object.keys(window.APP.guidMap).length); st = (n === prev && n > 0) ? st + 1 : 0; prev = n; await sleep(2000); } say('streamed ' + bb + ' guids=' + prev); }
  // Toast visibility is sampled by a MutationObserver + rAF, recording when it became visible vs staging start.
  await p.evaluate(() => { window.__toastSeenAt = null; const chk = () => { const e = document.getElementById('gi-still-toast'); if (e && e.style.display !== 'none' && window.__toastSeenAt == null) window.__toastSeenAt = performance.now(); requestAnimationFrame(chk); }; requestAnimationFrame(chk); });
  await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');
  say('Alt+S pressed');
  let ok = false; for (let i = 0; i < 300; i++) { const s = await p.evaluate(() => ({ a: !!window.APP._stillRefineActive, b: !!window.APP._stillRefineBusy })); if (s.a && !s.b) { ok = true; break; } await sleep(1000); }
  say('still ready=' + ok + ' toastSeenAt=' + await p.evaluate(() => window.__toastSeenAt && window.__toastSeenAt.toFixed(1)));
  for (let i = 0; i < 120; i++) { if (await p.evaluate(() => !!document.getElementById('gi-still-overlay'))) break; await sleep(1000); }
  say('bounce overlay present=' + await p.evaluate(() => !!document.getElementById('gi-still-overlay')));
  await b.close();
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
