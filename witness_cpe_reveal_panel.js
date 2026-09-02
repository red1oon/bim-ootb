#!/usr/bin/env node
/**
 * §CPE_DISCIPLINE_REVEAL panel wiring — prompts/CINEMA_DISCIPLINE_REVEAL.md.
 * Checks the 'Reveal' checkbox exists beside 'room titles', is OFF by default, toggling it fires
 * §CPE_REVEAL and round-trips through _buildOverride (Guardrail-2 style: an OK with ONLY this box
 * checked must still hand back override.reveal=true), same pattern as witness_cpe_room_title.js.
 * RUN: node witness_cpe_reveal_panel.js
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = __dirname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.db': 'application/octet-stream' };
function makeServer(root) {
  return http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    fs.readFile(path.join(root, p), (e, b) => {
      if (e) { r.writeHead(404); r.end('404'); return; }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      r.end(b);
    });
  });
}
let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
const _watchdog = setTimeout(() => { console.log('\n§W-CPE-REVEAL-PANEL TIMEOUT — killed after 180s'); process.exit(3); }, 180000);

(async () => {
  const server = makeServer(ROOT);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const pg = await br.newPage();
  await pg.setViewport({ width: 1400, height: 900 });
  const errs = [], logs = [];
  pg.on('pageerror', e => errs.push(String(e)));
  pg.on('console', m => logs.push(m.text()));
  const url = `http://localhost:${port}/viewer/viewer.html?db=buildings/Duplex_extracted.db`;
  await pg.goto(url, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('!!window.APP && !!window.APP.camera && !!window.APP.db', { timeout: 45000 });
  await new Promise(r => setTimeout(r, 2000));

  const cbTest = await pg.evaluate(async () => {
    const A = window.APP;
    let plan; try { plan = A.cinemaPathPlan(15); } catch (e) { return { ok: false, reason: 'cinemaPathPlan failed: ' + e.message }; }
    const openPromise = A.cinemaPathEditor.open({ plan: plan, durationSec: 15, fps: 15 });
    await new Promise(function(r) { setTimeout(r, 400); });
    const rt = document.getElementById('cpe-room-title');
    const cb = document.getElementById('cpe-reveal');
    if (!rt || !cb) { document.getElementById('cpe-cancel') && document.getElementById('cpe-cancel').click(); return { ok: false, reason: 'missing: ' + (!rt ? 'cpe-room-title ' : '') + (!cb ? 'cpe-reveal' : '') }; }
    // "just beside" — same parent row as the room-title checkbox, not a new row below it.
    const sameRow = rt.closest('div') === cb.closest('div');
    const startChecked = cb.checked;
    cb.click(); // native click toggles .checked AND fires 'change'
    await new Promise(function(r) { setTimeout(r, 50); });
    const afterChecked = cb.checked;
    document.getElementById('cpe-ok').click();
    const res = await openPromise;
    return { ok: true, sameRow: sameRow, startChecked: startChecked, afterChecked: afterChecked,
      overrideReveal: res.override ? res.override.reveal : 'NO-OVERRIDE(' + JSON.stringify(res) + ')' };
  });
  chk('checkbox exists in the Film-Maker panel', cbTest.ok, cbTest.reason || '');
  if (cbTest.ok) {
    chk('Reveal sits in the SAME row as room titles ("just beside")', cbTest.sameRow === true);
    chk('checkbox starts unchecked (OFF by default)', cbTest.startChecked === false);
    chk('checkbox click sets checked=true', cbTest.afterChecked === true);
    chk('OK with ONLY the checkbox toggled still returns override.reveal=true (Guardrail 2)',
      cbTest.overrideReveal === true, 'got=' + cbTest.overrideReveal);
  }
  chk('§CPE_REVEAL logged on toggle', logs.some(l => l.indexOf('§CPE_REVEAL ON') !== -1),
    logs.filter(l => l.indexOf('§CPE_REVEAL') !== -1).join(' | '));

  chk('zero pageerrors through the whole run', errs.length === 0, errs.join(' | '));

  await br.close();
  await server.close();
  clearTimeout(_watchdog);
  console.log('\n§W-CPE-REVEAL-PANEL DONE pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('\n§W-CPE-REVEAL-PANEL CRASHED ' + (e && e.stack || e)); process.exit(2); });
