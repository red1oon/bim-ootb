#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ROOM-LENS-HAB scope (READ THE LOG after every run)
 * SCOPE: VIEWER_FIND_PANEL_ROOM_ACCURACY.md Task 1 + Task 2 + §2b — the LIVE bim-ootb
 * viewer/navigate_find.js `_allRoomVolumes()` habitability filter, `_buildRoomTree()`'s Type-view
 * COMPILED fallthrough fix, and the buildings/patches/HHS_Office_Federated_extracted.db.sql
 * self-heal migration (viewer/scene.js A._applyPendingPatch, wired into streaming.js's single-DB
 * load path). Driven through the REAL user path (open a building, tap Find, cycle to the Room
 * axis), §-log-first (whitebox) — Playwright/Puppeteer here is wiring only, per project convention.
 * ISSUES THIS WITNESS EXPOSES:
 *   H1 DUPLEX-HAB   — buildings/Duplex_extracted.db's 5 synthetic IfcSpace rows include one
 *                     non-habitable void ("≈ Roof R1") whose habitability signal lives ONLY in
 *                     `name` (predefined_type is generically 'INTERNAL' for all 5, object_type
 *                     is 'COMPILED' for all 5) — proves the label-join fix (not a single-field
 *                     priority pick) actually catches it. Expect habitable=4 excluded=1 (Roof).
 *   H2 HHS-SELFHEAL — buildings/HHS_Office_Federated_extracted.db ships stale (14 IfcSpace rows,
 *                     object_type=COMPILED only) on disk; the runtime patch loader must fetch
 *                     buildings/patches/HHS_Office_Federated_extracted.db.sql and apply it BEFORE
 *                     the Room Lens queries — expect §PATCH_APPLY in the log and 105 real (all
 *                     habitable — no roof/void rows in this compiled set) rooms shown after.
 *   H3 TYPE-FALLTHROUGH — HHS's Type view must show "INTERNAL_DOORPART" as its OWN group (105
 *                     rooms), not a generic "COMPILED" bucket (the bug this task fixes).
 * PASS bar: all chk() green, zero pageerror on either page.
 * RUN: node witness_room_lens_hab.js   (from the worktree root; needs a live building HTTP server)
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const Database = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'better-sqlite3'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'logs');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

// ── Ground truth, computed INDEPENDENTLY of the app under test (node-side, direct file reads) ──
// Not hardcoded literals — derived fresh from whatever is actually on disk right now, so a stale
// building file or a re-generated patch changes these expectations along with it.
function groundTruth() {
  const dup = new Database(path.join(ROOT, 'buildings', 'Duplex_extracted.db'), { readonly: true });
  const dupRows = dup.prepare("SELECT guid, name FROM spatial_structure WHERE type='IfcSpace'").all();
  dup.close();
  const dupNonHab = dupRows.filter(r => /roof|shaft|void|plant|external|podium|sill|parapet|balcony/i.test(r.name || ''));
  const dupExpectHabitable = dupRows.length - dupNonHab.length;

  const hhsOnDisk = new Database(path.join(ROOT, 'buildings', 'HHS_Office_Federated_extracted.db'), { readonly: true });
  const hhsPreCount = hhsOnDisk.prepare("SELECT COUNT(*) c FROM spatial_structure WHERE type='IfcSpace'").get().c;
  hhsOnDisk.close();
  // Apply the patch to a scratch in-memory db and QUERY it (not regex the SQL text) — this is the
  // exact same SQL the browser's sql.js runs, just executed node-side via better-sqlite3 for an
  // independent ground truth.
  const patchSql = fs.readFileSync(path.join(ROOT, 'buildings', 'patches', 'HHS_Office_Federated_extracted.db.sql'), 'utf8');
  const scratch = new Database(':memory:');
  scratch.exec(patchSql);
  const patchInserts = scratch.prepare("SELECT guid FROM spatial_structure WHERE type='IfcSpace'").all();
  const typeCountRows = scratch.prepare(
    "SELECT predefined_type t, COUNT(*) c FROM spatial_structure WHERE type='IfcSpace' GROUP BY predefined_type").all();
  scratch.close();
  const patchTypeCounts = {};
  typeCountRows.forEach(r => { patchTypeCounts[r.t || '(null)'] = r.c; });

  console.log('§GROUND-TRUTH (independent, direct file reads — not hardcoded):');
  console.log('  Duplex on-disk: ' + dupRows.length + ' IfcSpace, ' + dupNonHab.length +
    ' name-matches a non-habitable keyword (' + dupNonHab.map(r => r.name).join(',') + ') → expect habitable=' + dupExpectHabitable);
  console.log('  HHS on-disk (PRE-patch): ' + hhsPreCount + ' IfcSpace (stale)');
  console.log('  HHS patch file: ' + patchInserts.length + ' IfcSpace INSERT rows, predefined_type breakdown=' + JSON.stringify(patchTypeCounts));
  return { dupExpectHabitable, dupNonHabNames: dupNonHab.map(r => r.name), hhsPreCount,
    hhsPatchIfcSpaceCount: patchInserts.length, hhsPatchTypeCounts: patchTypeCounts };
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css',
  '.db': 'application/octet-stream', '.data': 'application/octet-stream', '.sql': 'text/plain' };

function makeServer(root) {
  return http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    fs.readFile(path.join(root, p), (e, b) => {
      if (e) { r.writeHead(404); r.end('404'); return; }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' });
      r.end(b);
    });
  });
}

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

async function openBuilding(br, root, dbUrl, minWaitMs) {
  const server = makeServer(root);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const pg = await br.newPage();
  await pg.setViewport({ width: 1280, height: 850, deviceScaleFactor: 1 });
  const logs = [], errs = [];
  pg.on('console', m => logs.push(m.text()));
  pg.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  const url = `http://localhost:${port}/viewer/viewer.html?db=${encodeURIComponent(dbUrl)}`;
  await pg.goto(url, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('!!window.APP && !!window.APP.db', { timeout: 30000 }).catch(() => {});
  await sleep(minWaitMs || 1500);
  // Open Find panel (lazy-loads navigate_find.js + room_habitability.js — wait for the toggle to exist)
  await pg.evaluate(() => { if (window.APP && window.APP.openFindPanel) window.APP.openFindPanel(); });
  await pg.waitForSelector('#find-axis-toggle', { timeout: 15000 }).catch(() => {});
  await sleep(400);
  // Cycle the single axis-toggle button until data-axis="room" (or exhausted, max 8 taps)
  for (let i = 0; i < 8; i++) {
    const cur = await pg.evaluate(() => {
      const b = document.getElementById('find-axis-toggle');
      return b ? b.getAttribute('data-axis') : null;
    });
    if (cur === 'room') break;
    const clicked = await pg.evaluate(() => {
      const b = document.getElementById('find-axis-toggle');
      if (!b) return false;
      b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      return true;
    });
    if (!clicked) { await sleep(300); continue; }   // toggle not mounted yet — keep polling, don't bail
    await sleep(400);
  }
  await sleep(500);
  const finalAxis = await pg.evaluate(() => {
    const b = document.getElementById('find-axis-toggle');
    return b ? b.getAttribute('data-axis') : null;
  });
  await server.close();
  return { logs, errs, finalAxis, pg };
}

(async () => {
  const GT = groundTruth();
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  // ── H1: Duplex habitability filter ──
  console.log('\n§H1 DUPLEX opening buildings/Duplex_extracted.db');
  const d = await openBuilding(br, ROOT, 'buildings/Duplex_extracted.db', 1800);
  fs.writeFileSync(path.join(OUT, 'duplex_console.log'), d.logs.join('\n'));
  chk('H1 no pageerror on Duplex open', d.errs.length === 0, d.errs.join(' | '));
  chk('H1 reached room axis', d.finalAxis === 'room', 'finalAxis=' + d.finalAxis);
  const volCountLine = d.logs.filter(l => l.indexOf('§ROOM_VOL_COUNT') >= 0).slice(-1)[0] || '';
  console.log('  ' + volCountLine);
  const nonhabLines = d.logs.filter(l => l.indexOf('§ROOM_VOL_NONHAB') >= 0);
  nonhabLines.forEach(l => console.log('  ' + l));
  const vm = volCountLine.match(/habitable=(\d+) excluded=(\d+)/);
  chk('H1 PRECISION/RECALL vs ground truth (habitable=' + GT.dupExpectHabitable + ')',
    !!vm && +vm[1] === GT.dupExpectHabitable && +vm[2] === GT.dupNonHabNames.length,
    vm ? ('habitable=' + vm[1] + ' excluded=' + vm[2]) : 'no §ROOM_VOL_COUNT line found');
  chk('H1 excluded row(s) match ground-truth non-habitable name(s) (' + GT.dupNonHabNames.join(',') + ')',
    nonhabLines.length === GT.dupNonHabNames.length &&
      GT.dupNonHabNames.every(n => nonhabLines.some(l => l.indexOf(n) >= 0)),
    nonhabLines.join(' | ') || 'none');

  // ── H2 + H3: HHS self-heal + Type-view fallthrough ──
  console.log('\n§H2/H3 HHS opening buildings/HHS_Office_Federated_extracted.db (on-disk PRE-patch=' + GT.hhsPreCount + ' IfcSpace)');
  const h = await openBuilding(br, ROOT, 'buildings/HHS_Office_Federated_extracted.db', 3000);
  chk('H2 no pageerror on HHS open', h.errs.length === 0, h.errs.join(' | '));
  const patchLine = h.logs.filter(l => l.indexOf('§PATCH_APPLY') >= 0).slice(-1)[0] || '';
  console.log('  ' + patchLine);
  chk('H2 self-heal patch applied', /§PATCH_APPLY HHS_Office_Federated_extracted\.db applied/.test(patchLine), patchLine || 'no §PATCH_APPLY line');
  const hVolLine = h.logs.filter(l => l.indexOf('§ROOM_VOL_COUNT') >= 0).slice(-1)[0] || '';
  console.log('  ' + hVolLine);
  const hvm = hVolLine.match(/habitable=(\d+) excluded=(\d+)/);
  chk('H2 post-patch habitable count matches patch-file ground truth (' + GT.hhsPatchIfcSpaceCount +
      ') AND differs from stale on-disk (' + GT.hhsPreCount + ')',
    !!hvm && +hvm[1] === GT.hhsPatchIfcSpaceCount && GT.hhsPatchIfcSpaceCount !== GT.hhsPreCount,
    hvm ? ('habitable=' + hvm[1] + ' excluded=' + hvm[2]) : 'no line');

  // Switch to Type sub-toggle (Storey/Type row) and read §LENS_GROUPS. h.logs is the SAME array
  // the page's console listener (attached once, inside openBuilding) keeps appending to — no
  // second listener needed, and the log file is written AFTER this so the resulting evidence
  // actually lands on disk (an earlier draft of this witness wrote the file too early and the
  // Type-toggle's §LENS_GROUPS line never made it into the saved log — fixed here).
  await h.pg.evaluate(() => {
    const rows = document.querySelectorAll('#find-tree button, #find-tree [data-value]');
    for (const b of rows) { if ((b.textContent || '').trim() === 'Type' || b.getAttribute('data-value') === 'type') { b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); break; } }
  });
  await sleep(500);
  const groupsLines = h.logs.filter(l => l.indexOf('§LENS_GROUPS') >= 0 && l.indexOf('groupBy=type') >= 0);
  const lastGroups = groupsLines.slice(-1)[0] || '';
  console.log('  ' + lastGroups);
  fs.writeFileSync(path.join(OUT, 'hhs_console.log'), h.logs.join('\n'));

  const treeText = await h.pg.evaluate(() => {
    const t = document.getElementById('find-tree');
    return t ? t.textContent : '';
  });
  chk('H3 Type view shows INTERNAL_DOORPART as its own group label (not COMPILED)',
    treeText.indexOf('INTERNAL_DOORPART') >= 0, treeText.indexOf('INTERNAL_DOORPART') >= 0 ? 'found' : 'NOT FOUND in tree text');
  chk('H3 Type view does NOT show a bare "COMPILED" group label',
    !/(^|\s)COMPILED(\s|$)/.test(treeText), /(^|\s)COMPILED(\s|$)/.test(treeText) ? 'COMPILED group still present' : 'absent, as expected');
  const gm = lastGroups.match(/groups=(\d+) rooms=(\d+) typed=(\d+)\/(\d+)/);
  const gtIfcSpace = GT.hhsPatchIfcSpaceCount;
  chk('H3 §LENS_GROUPS rooms=' + gtIfcSpace + ' typed=' + gtIfcSpace + '/' + gtIfcSpace +
      ' vs patch-file ground truth (all rooms carry predefined_type)',
    !!gm && +gm[2] === gtIfcSpace && +gm[3] === gtIfcSpace && +gm[4] === gtIfcSpace,
    lastGroups || 'no §LENS_GROUPS(type) line');
  chk('H3 group count matches distinct predefined_type values in patch file (' +
      Object.keys(GT.hhsPatchTypeCounts).join(',') + ')',
    !!gm && +gm[1] === Object.keys(GT.hhsPatchTypeCounts).length, lastGroups || 'no §LENS_GROUPS(type) line');

  await br.close();
  console.log(`\n§ROOM-LENS-HAB DONE pass=${pass} fail=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})();
