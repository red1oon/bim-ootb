#!/usr/bin/env node
/**
 * Closes a real gap: witness_cpe_room_title.js proved the checkbox reaches the bake's override and
 * the draw routine works standalone, but never actually clicked Preview with the box checked and
 * read the LIVE overlay canvas's pixels during playback. This does that — numeric proof, not a
 * screenshot or a user's visual impression (CLAUDE.md FUNDAMENTAL LAW).
 * RUN: node witness_cpe_room_title_live.js
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = path.join(__dirname, '..', '..');
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
const _watchdog = setTimeout(() => { console.log('\n§W-LIVE TIMEOUT — killed after 120s'); process.exit(3); }, 120000);

(async () => {
  const server = makeServer(ROOT);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const pg = await br.newPage();
  await pg.setViewport({ width: 1400, height: 900 });
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e)));
  const url = `http://localhost:${port}/viewer/viewer.html?db=buildings/Duplex_extracted.db`;
  await pg.goto(url, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('!!window.APP && !!window.APP.camera && !!window.APP.db', { timeout: 45000 });
  await new Promise(r => setTimeout(r, 2000));
  await pg.evaluate(() => window.APP.loadNavigate ? window.APP.loadNavigate() : null);
  await pg.evaluate(() => window.APP.ensureRooms ? window.APP.ensureRooms({}) : null);
  await new Promise(r => setTimeout(r, 500));

  // Open the real editor, check the box, click Preview — the exact user gesture.
  const setup = await pg.evaluate(async () => {
    const A = window.APP;
    let plan; try { plan = A.cinemaPathPlan(15); } catch (e) { return { ok: false, reason: 'plan failed: ' + e.message }; }
    A.cinemaPathEditor.open({ plan: plan, durationSec: 15, fps: 15 }); // don't await — stays open for Preview
    await new Promise(r => setTimeout(r, 400));
    const cb = document.getElementById('cpe-room-title');
    if (!cb) return { ok: false, reason: 'no checkbox' };
    cb.click();
    await new Promise(r => setTimeout(r, 50));
    return { ok: true, checked: cb.checked };
  });
  chk('editor opened + room-title checkbox checked', setup.ok && setup.checked, JSON.stringify(setup));

  // Click Preview and sample the overlay canvas's pixels repeatedly across the ~10s rehearsal
  // (§CPE_PREVIEW plays the WHOLE film in a fixed 10s scrub regardless of its real length — a
  // pre-existing behavior of _previewFly, unrelated to room titles — so a room dwell that would
  // last several real seconds in the actual bake compresses to a much shorter flash here; that's
  // expected, not a bug — see witness_cpe_room_title_timing.js for the exact math).
  await pg.evaluate(() => { document.getElementById('cpe-preview').click(); });
  const samples = [];
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 800));
    const s = await pg.evaluate(() => {
      const c = document.getElementById('cpe-room-title-overlay');
      if (!c || !c.width || !c.height) return { hasCanvas: !!c, nonTransparent: 0 };
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let nonTransparent = 0;
      for (let p = 3; p < d.length; p += 4 * 37) { if (d[p] > 5) nonTransparent++; } // alpha channel, sparse sample
      return { hasCanvas: true, w: c.width, h: c.height, nonTransparent: nonTransparent };
    });
    samples.push(s);
  }
  const canvasSeen = samples.some(s => s.hasCanvas);
  const maxNonTransparent = Math.max(0, ...samples.map(s => s.nonTransparent || 0));
  chk('overlay canvas exists during Preview playback', canvasSeen, JSON.stringify(samples[samples.length - 1]));
  chk('overlay canvas shows REAL non-transparent pixels at some point (a title actually drew)',
    maxNonTransparent > 0, 'samples=' + JSON.stringify(samples.map(s => s.nonTransparent)));

  // Close cleanly.
  await pg.evaluate(() => { const c = document.getElementById('cpe-cancel'); if (c) c.click(); });

  chk('zero pageerrors through the whole run', errs.length === 0, errs.join(' | '));

  await br.close();
  await server.close();
  clearTimeout(_watchdog);
  console.log('\n§W-LIVE DONE pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('\n§W-LIVE CRASHED ' + (e && e.stack || e)); process.exit(2); });
