#!/usr/bin/env node
/**
 * W-TITLE-COMPOSITED / W-TITLE-NAME-SOURCE / W-TITLE-RATE + checkbox/Guardrail-2 wiring —
 * prompts/RESUME_CPE_ROOM_TITLE.md. Numeric §-tagged proof only, per CLAUDE.md's FUNDAMENTAL LAW.
 * RUN: node witness_cpe_room_title.js
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
const _watchdog = setTimeout(() => { console.log('\n§W-CPE-ROOM-TITLE TIMEOUT — killed after 180s'); process.exit(3); }, 180000);

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

  // ── W-TITLE-NAME-SOURCE: a synthetic 2-room "plan" (real room-graph points, fake poseAt) — every
  // title must equal A.friendlyName(roomNode.name, ...) for THAT room, the same verb the Find panel
  // and §HOVER_NAME use. No second naming path. ──
  const nameTest = await pg.evaluate(() => {
    const A = window.APP;
    const g = A.getRoomGraph();
    if (!g || !g.nodesByGuid) return { ok: false, reason: 'no room graph' };
    const rooms = Object.values(g.nodesByGuid).filter(n => n.kind === 'room' && n.rects && n.rects.length);
    if (rooms.length < 2) return { ok: false, reason: 'not enough rooms, n=' + rooms.length };
    const r0 = rooms[0], r1 = rooms[rooms.length - 1];
    const p0 = A.ifc2three(r0.cx, r0.cy, r0.cz), p1 = A.ifc2three(r1.cx, r1.cy, r1.cz);
    const plan = { poseAt: function(tn) { const p = tn < 0.5 ? p0 : p1; return { x: p.x, y: p.y, z: p.z, tx: p.x + 1, ty: p.y, tz: p.z }; } };
    // 10s/room. FIXTURE CHANGED 2026-08-01 (§CPE_ROOM_TITLE_LEAD), assertion NOT touched — it still
    // demands exactly 2 segments named through friendlyName, which is the claim this gate exists to
    // make. The old fixture was 6s (3s/room) and now yields ONE caption, correctly: a caption opens
    // 2s before its doorway and owns a 3s slot, so two rooms entered 3.0s apart cannot both have one
    // — the second "misses, then skips", the user's own rule. That is arbitration, not naming, and it
    // is gated in witness_cpe_room_title_lead.js G-TL-3. Spacing the rooms puts this gate back on its
    // own subject instead of failing for someone else's reason.
    const segs = A.roomTitleBuildTimeline(plan, 20); // 10s/room — well over MIN_DWELL and the 3s slot
    return {
      ok: true, segs: segs,
      expected0: A.friendlyName(r0.name, null), expected1: A.friendlyName(r1.name, null),
      guid0: r0.guid, guid1: r1.guid
    };
  });
  chk('W-TITLE-NAME-SOURCE: room graph reachable with real room-kind nodes', nameTest.ok, nameTest.reason || '');
  if (nameTest.ok) {
    chk('W-TITLE-NAME-SOURCE: exactly 2 segments (one per room, well over MIN_DWELL)', nameTest.segs.length === 2, 'got=' + nameTest.segs.length);
    if (nameTest.segs.length === 2) {
      chk('W-TITLE-NAME-SOURCE: segment 1 guid + name match A.friendlyName for that room',
        nameTest.segs[0].guid === nameTest.guid0 && nameTest.segs[0].name === nameTest.expected0,
        'guid=' + nameTest.segs[0].guid + ' name="' + nameTest.segs[0].name + '" want="' + nameTest.expected0 + '"');
      chk('W-TITLE-NAME-SOURCE: segment 2 guid + name match A.friendlyName for that room',
        nameTest.segs[1].guid === nameTest.guid1 && nameTest.segs[1].name === nameTest.expected1,
        'guid=' + nameTest.segs[1].guid + ' name="' + nameTest.segs[1].name + '" want="' + nameTest.expected1 + '"');
    }
  }

  // ── W-TITLE-RATE: a synthetic path crossing 8 rooms in 2.4s (0.3s each) — every dwell is under
  // MIN_DWELL=1.4s, so every title must be suppressed, never strobed. ──
  const rateTest = await pg.evaluate(() => {
    const A = window.APP;
    const g = A.getRoomGraph();
    const rooms = Object.values(g.nodesByGuid).filter(n => n.kind === 'room' && n.rects && n.rects.length).slice(0, 8);
    if (rooms.length < 4) return { ok: false, reason: 'not enough rooms, n=' + rooms.length };
    const pts = rooms.map(function(r) { return A.ifc2three(r.cx, r.cy, r.cz); });
    const total = pts.length * 0.3;
    const plan = { poseAt: function(tn) {
      var idx = Math.min(pts.length - 1, Math.floor(tn * pts.length));
      var p = pts[idx]; return { x: p.x, y: p.y, z: p.z, tx: p.x + 1, ty: p.y, tz: p.z };
    } };
    const segs = A.roomTitleBuildTimeline(plan, total);
    return { ok: true, nRooms: pts.length, segsKept: segs.length };
  });
  chk('W-TITLE-RATE: rapid room-crossing rate-limited (kept < visited rooms)',
    rateTest.ok && rateTest.segsKept < rateTest.nRooms, JSON.stringify(rateTest));

  // ── W-TITLE-COMPOSITED (the gate): the SAME draw routine _captureFrame calls, run against a
  // plain 2D context — proves the composite actually changes PIXELS, and only in the title band
  // (RESUME_CPE_ROOM_TITLE.md §2's trap: a DOM caption never would show up here at all). ──
  const compositeTest = await pg.evaluate(() => {
    const A = window.APP;
    const w = 800, h = 450;
    const c1 = document.createElement('canvas'); c1.width = w; c1.height = h;
    const ctx1 = c1.getContext('2d'); ctx1.fillStyle = '#123456'; ctx1.fillRect(0, 0, w, h);
    const c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
    const ctx2 = c2.getContext('2d'); ctx2.fillStyle = '#123456'; ctx2.fillRect(0, 0, w, h);
    A.roomTitleCompositeOntoCanvas(ctx2, w, h, 'Witness Room', 1.0);
    const d1 = ctx1.getImageData(0, 0, w, h).data, d2 = ctx2.getImageData(0, 0, w, h).data;
    const fontPx = Math.max(18, Math.round(h * 0.032)), bandH = fontPx * 2.2, bandY0 = h - bandH * 1.4 - bandH;
    let diffInBand = 0, diffOutsideBand = 0;
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 4) {
      const i = (y * w + x) * 4;
      const diff = Math.abs(d1[i] - d2[i]) + Math.abs(d1[i + 1] - d2[i + 1]) + Math.abs(d1[i + 2] - d2[i + 2]);
      if (diff > 10) { if (y >= bandY0) diffInBand++; else diffOutsideBand++; }
    }
    return { diffInBand, diffOutsideBand, bandY0 };
  });
  chk('W-TITLE-COMPOSITED: composite changes real pixels, confined to the title band',
    compositeTest.diffInBand > 0 && compositeTest.diffOutsideBand === 0, JSON.stringify(compositeTest));

  // ── Checkbox in the Film-Maker panel: exists, OFF by default, and the FULL wiring chain reaches
  // the resolved override — including Guardrail 2 (an OK with ONLY this box checked must still
  // hand back override.roomTitle=true; caught and fixed during this witness's own first draft). ──
  const cbTest = await pg.evaluate(async () => {
    const A = window.APP;
    let plan; try { plan = A.cinemaPathPlan(15); } catch (e) { return { ok: false, reason: 'cinemaPathPlan failed: ' + e.message }; }
    const openPromise = A.cinemaPathEditor.open({ plan: plan, durationSec: 15, fps: 15 });
    await new Promise(function(r) { setTimeout(r, 400); });
    const cb = document.getElementById('cpe-room-title');
    if (!cb) { document.getElementById('cpe-cancel') && document.getElementById('cpe-cancel').click(); return { ok: false, reason: 'no checkbox' }; }
    const startChecked = cb.checked;
    cb.click(); // native click on a checkbox toggles .checked AND fires 'change'
    await new Promise(function(r) { setTimeout(r, 50); });
    const afterChecked = cb.checked;
    document.getElementById('cpe-ok').click();
    const res = await openPromise;
    return { ok: true, startChecked: startChecked, afterChecked: afterChecked,
      overrideRoomTitle: res.override ? res.override.roomTitle : 'NO-OVERRIDE(' + JSON.stringify(res) + ')' };
  });
  chk('checkbox exists in the Film-Maker panel', cbTest.ok, cbTest.reason || '');
  if (cbTest.ok) {
    chk('checkbox starts unchecked (OFF by default)', cbTest.startChecked === false);
    chk('checkbox click sets checked=true', cbTest.afterChecked === true);
    chk('OK with ONLY the checkbox toggled still returns override.roomTitle=true (Guardrail 2)',
      cbTest.overrideRoomTitle === true, 'got=' + cbTest.overrideRoomTitle);
  }

  chk('zero pageerrors through the whole run', errs.length === 0, errs.join(' | '));

  await br.close();
  await server.close();
  clearTimeout(_watchdog);
  console.log('\n§W-CPE-ROOM-TITLE DONE pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('\n§W-CPE-ROOM-TITLE CRASHED ' + (e && e.stack || e)); process.exit(2); });
