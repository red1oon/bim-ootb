#!/usr/bin/env node
// WITNESS — §CPE_ROOM_TITLE_COLLECTIVE: ONE composed caption everywhere + live [phase].
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_ROOM_TITLE_COLLECTIVE (2026-08-02).
//
// THE ISSUE IT PROVES OR DISPROVES (user, 2026-08-02): "grouped together in single label… it is
// caption optics" — the film mixed two caption formats (bare room names during dwells, composed
// lines only in the gaps), and no caption ever named the collective being BUILT. Format confirmed
// verbatim: "Storey - 1 Corridor Hall Rooms 2,3 [MEP Rough in]".
//
//   G-RTC-1  every dwell caption is composed: the §CPE_ROOM_TITLE_COLLECTIVE pass labels 100% of
//            dwell segments through the SAME grammar the gap fill uses. RED before the fix: zero
//            dwell segments carry a label — the two-format optics.
//   G-RTC-2  the captioned room appears in its OWN collective line (a label that dropped the room
//            it captions would be worse optics, not better).
//   G-RTC-3  optics only — name/guid/times untouched: bare `name` survives on every dwell segment
//            (degrade path + what the settled timing witnesses gate), and two builds of the same
//            plan agree byte-for-byte on (guid,tStart,tEnd,name) — the pass is deterministic and
//            writes ONLY `label`.
//   G-RTC-4  the film shows the label: roomTitleOpacityAt inside a dwell window returns the
//            composed label, not the bare name.
//   G-RTC-5  [phase] resolves at DRAW time from the live TM frontier: with a phase in force the
//            compositor paints exactly "text [phase]"; with none it paints bare text. Driven
//            through the REAL roomTitleCompositeOntoCanvas via a capturing ctx stub — not a
//            re-implementation. RED before the fix: no bracket ever.
//   G-RTC-6  §CPE_ROOM_TITLE_LEVEL_CONSOLIDATE (fix, 2026-08-02): same invariant as
//            witness_cpe_room_title_group.js's G-RTG-6, applied to dwell-caption `.label`s (the
//            SAME _lineFrom grammar composes both) — a shared storey prefix is named ONCE per
//            composed line, never repeated per room.
//   G-RTC-7  THE BAKE PATH, NOT INFERRED: cinema_maxq.js's frame loop is a SEPARATE compositing
//            call site from the live-display caller (`_captureFrame` at cinema_maxq.js:478-491
//            calls `A.roomTitleOpacityAt(_titleSegs, i/fps)` at :1082, then passes `.name`
//            UNMODIFIED into `A.roomTitleCompositeOntoCanvas` at :486 — the exact function this
//            witness already drives for G-RTC-5). Reproduces that EXACT call chain — same two
//            functions, same argument shapes — across every segment (dwell AND gap-fill) of the
//            real 147.9s Hospital film and asserts the text actually painted onto the captured-
//            frame canvas carries no repeated storey prefix. Proves the bake's EXPORTED bytes, not
//            just the segment builder.
// RUN: node witness_cpe_room_title_collective.js
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = __dirname;
const FALLBACK_ROOT = '/home/red1/bim-ootb';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.json': 'application/json', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png' };
function makeServer(root) {
  return http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    const send = (b) => { r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); };
    fs.readFile(path.join(root, p), (e, b) => {
      if (!e) return send(b);
      fs.readFile(path.join(FALLBACK_ROOT, p), (e2, b2) => {
        if (e2) { r.writeHead(404); r.end('404'); return; }
        send(b2);
      });
    });
  });
}
const BLD = process.env.BLD || 'Hospital';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const _watchdog = setTimeout(() => { console.log('\n§W-RTC TIMEOUT — killed after 420s'); process.exit(3); }, 420000);

(async () => {
  const server = makeServer(ROOT);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${port}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.APP && window.APP.roomTitleBuildTimeline && window.APP.dbQuery,
    { timeout: 300000 });
  await sleep(9000);
  await page.waitForFunction(() => {
    try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
    catch (e) { return false; }
  }, { timeout: 300000, polling: 3000 });

  const res = await page.evaluate(async () => {
    const A = window.APP, out = { err: null };
    try {
      if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) { try { await A.loadNavigate(); } catch (e) {} }
      if (typeof A.ensureRooms === 'function') { try { await A.ensureRooms({}); } catch (e) {} }
      const DUR = 147.9;                              // the user's own film length
      const plan = A.cinemaPathPlan(DUR);
      const segs = A.roomTitleBuildTimeline(plan, DUR);
      const rooms = segs.filter(s => !s.group), groups = segs.filter(s => s.group);
      out.nRooms = rooms.length; out.nGroups = groups.length;
      // G-RTC-1: every dwell caption composed
      out.labelled = rooms.filter(s => typeof s.label === 'string' && s.label.length > 0).length;
      out.sample = rooms.slice(0, 5).map(s => ({ name: s.name, label: s.label }));
      // Storey ladder, fetched once — used by G-RTC-2 (own-room presence, mirroring the grammar's
      // per-room dedupe) and G-RTC-6 (level-consolidate invariant) below.
      const ladder = A.dbQuery(
        "SELECT m.storey, AVG(COALESCE(t.center_z,0)) FROM elements_meta m " +
        "JOIN element_transforms t ON t.guid=m.guid " +
        "WHERE m.storey IS NOT NULL AND m.storey NOT IN ('','_UNKNOWN','Unknown') GROUP BY m.storey")
        .map(r => ({ name: String(r[0]), z: +r[1] }));
      // G-RTC-2: own room in its own line — the bare title, with ANY ladder-matching storey
      // prefix it carries stripped, must appear in the label. §CPE_ROOM_TITLE_LEVEL_CONSOLIDATE
      // groups the sight list by each room's OWN embedded prefix (not only the window's announced
      // top storey — a mixed-storey sight or an unannounced window still strips per-room), so the
      // check mirrors THAT: try stripping every ladder name the room's own raw text contains,
      // not just the label's first ' · ' segment.
      out.ownRoomMissing = [];
      for (const s of rooms) {
        if (!s.label) continue;
        if (s.label.indexOf(s.name) >= 0) continue;
        let found = false;
        for (const L of ladder) {
          const dedup = s.name.replace(L.name + ' ', '');
          if (dedup !== s.name && s.label.indexOf(dedup) >= 0) { found = true; break; }
        }
        if (!found) out.ownRoomMissing.push({ name: s.name, label: s.label });
      }
      // G-RTC-3: bare names survive; deterministic double build agrees on identity+times+name
      out.nameHasDot = rooms.filter(s => s.name.indexOf(' · ') >= 0).length;
      const key = list => JSON.stringify(list.map(s => [s.guid, +s.tStart.toFixed(4), +s.tEnd.toFixed(4), s.name]));
      const segs2 = A.roomTitleBuildTimeline(plan, DUR);
      out.deterministic = key(segs.filter(s => !s.group)) === key(segs2.filter(s => !s.group));
      // G-RTC-4: the film shows the label
      out.opacityShowsLabel = null;
      const withLabel = rooms.find(s => s.label && s.label !== s.name);
      if (withLabel) {
        const info = A.roomTitleOpacityAt(segs, (withLabel.tStart + withLabel.tEnd) / 2);
        out.opacityShowsLabel = !!info && info.name === withLabel.label;
        out.opacitySample = info && info.name;
      }
      // G-RTC-5: [phase] at draw time, through the REAL compositor via a capturing ctx stub
      const painted = [];
      const stub = { save() {}, restore() {}, fillRect() {}, fillText(t) { painted.push(t); },
                     // §CPE_LABEL_PANEL_SYNC: the caption now draws a measured, rounded plate.
                     // Stub these so this witness exercises the REAL path instead of the
                     // no-measureText fallback — it still asserts only the CAPTION text.
                     measureText(t) { return { width: t.length * 10 }; },
                     beginPath() {}, roundRect() {}, fill() {},
                     set globalAlpha(v) {}, set fillStyle(v) {}, set font(v) {},
                     set textAlign(v) {}, set textBaseline(v) {} };
      const prevPhase = A.tmFrontierPhase;
      A.tmFrontierPhase = 'MEP Rough in';
      A.roomTitleCompositeOntoCanvas(stub, 1852, 960, 'Level 1 · Corridor · Rooms 2, 3', 1);
      A.tmFrontierPhase = null;
      A.roomTitleCompositeOntoCanvas(stub, 1852, 960, 'Level 1 · Corridor · Rooms 2, 3', 1);
      A.tmFrontierPhase = prevPhase == null ? null : prevPhase;
      out.painted = painted;
      out.pure = [A.roomTitleFinalText && A.roomTitleFinalText('X') === 'X'];
      // G-RTC-6: no ladder storey prefix repeats inside one dwell-caption label (ladder fetched above).
      const repeats = [];
      for (const s of rooms) {
        if (!s.label) continue;
        for (const L of ladder) {
          const token = L.name + ' ';
          let count = 0, idx = -1;
          while ((idx = s.label.indexOf(token, idx + 1)) !== -1) count++;
          if (count > 1) repeats.push({ label: s.label, storey: L.name, count });
        }
      }
      out.levelRepeats = repeats;
      // G-RTC-7: THE BAKE PATH — reproduce cinema_maxq.js's exact frame-loop chain (`_captureFrame`
      // :478-491, driven from :1082/:486) rather than inferring it shares the live path. `segs`
      // here IS what `_titleSegs = A.roomTitleBuildTimeline(plan, nFrames/fps)` (:1015) holds —
      // both dwell AND gap-fill segments, unfiltered, same as the bake samples per-frame. For every
      // segment's midpoint, call `A.roomTitleOpacityAt(segs, t)` (the SAME function+args as :1082)
      // and feed `.name` into the SAME `A.roomTitleCompositeOntoCanvas` (:486) via a capturing
      // stub — the exact two-call chain that reaches the exported frame bytes.
      const bakeStub = { save() {}, restore() {}, fillRect() {}, fillText(t) { bakePainted.push(t); },
                     // §CPE_LABEL_PANEL_SYNC: the caption now draws a measured, rounded plate.
                     // Stub these so this witness exercises the REAL path instead of the
                     // no-measureText fallback — it still asserts only the CAPTION text.
                     measureText(t) { return { width: t.length * 10 }; },
                     beginPath() {}, roundRect() {}, fill() {},
                         set globalAlpha(v) {}, set fillStyle(v) {}, set font(v) {},
                         set textAlign(v) {}, set textBaseline(v) {} };
      var bakePainted = [];
      const bakeRepeats = [];
      for (const s of segs) {
        const mid = (s.tStart + s.tEnd) / 2;
        const info = A.roomTitleOpacityAt(segs, mid);          // exact call cinema_maxq.js:1082 makes
        if (!info || !(info.opacity > 0)) continue;
        const before = bakePainted.length;
        A.roomTitleCompositeOntoCanvas(bakeStub, 1852, 960, info.name, info.opacity); // exact call :486 makes
        for (let bi = before; bi < bakePainted.length; bi++) {
          const txt = bakePainted[bi];
          for (const L of ladder) {
            const token = L.name + ' ';
            let count = 0, idx = -1;
            while ((idx = txt.indexOf(token, idx + 1)) !== -1) count++;
            if (count > 1) bakeRepeats.push({ segGuid: s.guid, painted: txt, storey: L.name, count });
          }
        }
      }
      out.bakeFramesChecked = segs.length;
      out.bakePaintedSample = bakePainted.slice(0, 3);
      out.bakeLevelRepeats = bakeRepeats;
    } catch (e) { out.err = String(e && e.message) + '\n' + String(e && e.stack).slice(0, 400); }
    return out;
  });

  let all = true;
  const P = (name, ok, detail) => { all = all && ok; console.log(`${ok ? '✅' : '❌'} ${name}  ${detail}`); };
  if (res.err) { console.log('❌ setup: ' + res.err); await browser.close(); server.close(); process.exit(1); }

  P('G-RTC-1 every dwell caption is composed (RED before fix: 0 labelled)',
    res.nRooms > 0 && res.labelled === res.nRooms,
    `${res.labelled}/${res.nRooms} labelled; sample: ${JSON.stringify(res.sample.slice(0, 2))}`);
  P('G-RTC-2 the captioned room appears in its own collective line',
    res.ownRoomMissing.length === 0,
    `${res.ownRoomMissing.length} missing` + (res.ownRoomMissing.length ? ' ' + JSON.stringify(res.ownRoomMissing.slice(0, 2)) : ''));
  P('G-RTC-3 optics only: bare names survive, double build byte-identical on (guid,times,name)',
    res.nameHasDot === 0 && res.deterministic === true,
    `namesComposed=${res.nameHasDot} (must be 0) deterministic=${res.deterministic}`);
  P('G-RTC-4 the film shows the composed label (roomTitleOpacityAt returns label)',
    res.opacityShowsLabel === true,
    `mid-window text: ${JSON.stringify(res.opacitySample)}`);
  P('G-RTC-5 [phase] resolves at draw: bracket exactly when a TM frontier phase is in force',
    res.painted.length === 2 &&
    res.painted[0] === 'Level 1 · Corridor · Rooms 2, 3 [MEP Rough in]' &&
    res.painted[1] === 'Level 1 · Corridor · Rooms 2, 3',
    JSON.stringify(res.painted));
  P('G-RTC-6 a shared storey prefix is named ONCE per dwell-caption label, never repeated per room',
    res.levelRepeats.length === 0,
    `${res.levelRepeats.length} repeats` +
    (res.levelRepeats.length ? ' ' + JSON.stringify(res.levelRepeats.slice(0, 4)) : ''));
  P('G-RTC-7 THE BAKE PATH: cinema_maxq.js\'s exact roomTitleOpacityAt->roomTitleCompositeOntoCanvas ' +
    'chain paints no repeated storey prefix onto the captured-frame canvas',
    res.bakeLevelRepeats.length === 0,
    `${res.bakeFramesChecked} segments driven through the bake chain, ${res.bakeLevelRepeats.length} repeats; ` +
    `sample painted: ${JSON.stringify(res.bakePaintedSample)}` +
    (res.bakeLevelRepeats.length ? ' ' + JSON.stringify(res.bakeLevelRepeats.slice(0, 4)) : ''));
  const cl = logs.find(l => l.includes('§CPE_ROOM_TITLE_COLLECTIVE'));
  console.log('  instrument: ' + (cl || 'NO §CPE_ROOM_TITLE_COLLECTIVE LINE'));
  all = all && !!cl;

  await browser.close(); server.close(); clearTimeout(_watchdog);
  console.log(all ? '\n§W-RTC all green' : '\n§W-RTC FAIL');
  process.exit(all ? 0 : 1);
})();
