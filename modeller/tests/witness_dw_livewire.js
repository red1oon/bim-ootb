#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DW-LIVEWIRE scope (READ THE LOG after every run)
 * SCOPE: §LIVEWIRE (bim-compiler prompts/Modeller/DISC_Walker/RESUME_DISC_WALKER_ENVELOPE_BOUND.md) —
 * the DEFAULT-FLIP + LOD400 render seam wired into the LIVE modeller, driven through the REAL user
 * path (open resident → discWalk), §-log-first (whitebox), screenshots secondary.
 * ISSUES THIS WITNESS EXPOSES (each named, per the test doctrine):
 *   L0  FRAME       — projected Duplex spatial_structure spaces must overlap the ARC substrate's own
 *                     bbox (a frame mismatch would silently starve every schedule placement).
 *   L1  SCHED-LIVE  — Duplex ELEC walk engages placeSchedule IN THE BROWSER (was impossible: no
 *                     shipped ARC db carried any space row, rules DBs lacked the schedule tables).
 *   L2  LOD400-LIVE — schedule fixtures render REAL mined meshes from the shared mesh.db
 *                     (§DW-PRIM-LOD lod400>0), not boxes — the previously-dead render seam.
 *   L3  NOSPACES    — Terminal ELEC walk takes the measured-band path live (placed>0, real z-bands).
 *   L4  FALLBACK    — SampleCastle ELEC (duplex-rules, no spaces, no mesh binding) falls back to the
 *                     LEGACY walk with placements — the flip must not cost any resident its walk.
 *   L5  FAKE-HASH falsifier — corrupting placements' hashes → lod400 drops to 0, honest boxes, no crash.
 *   L6  CROSS-DISC  — a second discipline (PLB) walks after ELEC with the avoid list live, no crash.
 * PASS bar: all chk() green, zero pageerror on every page.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const Database = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'better-sqlite3'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..');
const OUT = process.env.LIVEWIRE_OUT || path.join(ROOT, 'logs');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); });
});

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

// ── L0 FRAME (node-side, exact): every projected real space bbox intersects the ARC substrate bbox ──
function frameCheck() {
  const db = new Database(path.join(ROOT, 'modeller', 'Duplex_ARC.db'), { readonly: true });
  const arc = db.prepare(`SELECT MIN(center_x-bbox_x/2) x0, MAX(center_x+bbox_x/2) x1,
    MIN(center_y-bbox_y/2) y0, MAX(center_y+bbox_y/2) y1 FROM element_transforms`).get();
  const sp = db.prepare(`SELECT name, center_x cx, center_y cy, size_x sx, size_y sy FROM spatial_structure
    WHERE type='IfcSpace' AND guid NOT LIKE 'RM\\_%' ESCAPE '\\' AND name NOT LIKE '%≈%'`).all();
  db.close();
  const out = sp.filter(s => s.cx + s.sx / 2 < arc.x0 || s.cx - s.sx / 2 > arc.x1 || s.cy + s.sy / 2 < arc.y0 || s.cy - s.sy / 2 > arc.y1);
  chk('L0 FRAME projected spaces ∩ ARC bbox', sp.length === 21 && out.length === 0,
    `${sp.length - out.length}/${sp.length} intersect` + (out.length ? ' OUTSIDE: ' + out.map(s => s.name).join(',') : ''));
}

async function openResident(br, key, minChildren, deadlineMs) {
  const pg = await br.newPage(); await pg.setViewport({ width: 1280, height: 850, deviceScaleFactor: 1 });
  const logs = [], errs = [];
  pg.on('console', m => logs.push(m.text()));
  pg.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${server.address().port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai', { timeout: 30000 }).catch(() => {});
  await pg.click('#b-open'); await sleep(200);
  await pg.click(`#m-open-panel .mo-row[data-key="${key}"]`);
  const deadline = Date.now() + deadlineMs;
  let lastN = -1, stable = 0, n = -1;
  while (Date.now() < deadline) {
    n = await pg.evaluate(() => { const g = window.Bonsai && window.Bonsai.group ? window.Bonsai.group() : null; return g ? g.children.length : -1; }).catch(() => -1);
    if (n === lastN && n > 0) stable++; else stable = 0;
    lastN = n;
    if (stable >= 8 && n >= minChildren) break;
    await sleep(500);
  }
  console.log(`  §LIVEWIRE-OPEN ${key} children=${n}`);
  return { pg, logs, errs };
}

async function walkAndWait(pg, logs, disc, deadlineMs) {
  const before = logs.length;
  await pg.evaluate(d => { window.discWalk(d); }, disc);
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const done = logs.slice(before).some(l =>
      l.indexOf(`§DISC-WALK ${disc} placed=`) >= 0 || l.indexOf(`§DISC-WALK ${disc} REFUSE`) >= 0 ||
      l.indexOf(`§DISC-WALK ${disc} failed`) >= 0 || l.indexOf(`§DISC-WALK ${disc} — no walk`) >= 0);
    if (done) break;
    await sleep(500);
  }
  await sleep(1000);   // let render/§DW-PRIM logs land
  return logs.slice(before);
}
const grab = (ls, tag) => ls.filter(l => l.indexOf(tag) >= 0);
const num = (l, k) => { const m = l && l.match(new RegExp(k + '=(-?\\d+)')); return m ? +m[1] : null; };

(async () => {
  await new Promise(r => server.listen(0, r));
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  fs.mkdirSync(OUT, { recursive: true });

  console.log('═══ W-DW-LIVEWIRE ═══');
  frameCheck();

  // ── Duplex: schedule walk live + LOD400 render + falsifier + cross-disc ──
  {
    const { pg, logs, errs } = await openResident(br, 'Duplex', 150, 120000);
    const w = await walkAndWait(pg, logs, 'ELEC', 60000);
    const sched = grab(w, '§WALK-SCHED disc=ELEC')[0];
    const fell = grab(w, '§SCHED-FALLBACK ELEC').length;
    chk('L1 SCHED-LIVE Duplex ELEC placeSchedule engaged', !!sched && num(sched, 'placed') > 0 && fell === 0,
      sched ? sched.slice(sched.indexOf('placed=')) : 'no §WALK-SCHED line');
    const lod = grab(w, '§DW-PRIM-LOD disc=ELEC')[0];
    chk('L2 LOD400-LIVE Duplex ELEC real meshes rendered', !!lod && num(lod, 'lod400') > 0,
      lod ? lod.slice(lod.indexOf('lod400=')) : 'no §DW-PRIM-LOD line');
    // L5 falsifier — corrupt every hash, re-render, lod400 must drop to 0 honestly (no crash)
    const before = logs.length;
    await pg.evaluate(() => {
      const list = (window.__dwWalks.ELEC || []).map(p => Object.assign({}, p, { geometry_hash: 'deadbeef00000000' }));
      window.__renderDiscWalk('ELEC', list);
    });
    await sleep(800);
    const lodF = grab(logs.slice(before), '§DW-PRIM-LOD disc=ELEC')[0];
    chk('L5 FAKE-HASH falsifier: lod400→0, honest boxes, no crash', !!lodF && num(lodF, 'lod400') === 0 && num(lodF, 'lod200') > 0,
      lodF ? lodF.slice(lodF.indexOf('lod400=')) : 'no re-render log');
    // L6 cross-disc — PLB walks after ELEC (avoid list live), places via schedule, no crash
    const w2 = await walkAndWait(pg, logs, 'PLB', 90000);
    const sched2 = grab(w2, '§WALK-SCHED disc=PLB')[0];
    chk('L6 CROSS-DISC PLB after ELEC (avoid live)', !!sched2 && num(sched2, 'placed') > 0,
      sched2 ? sched2.slice(sched2.indexOf('placed=')) : 'no §WALK-SCHED PLB line');
    // L7 FOLD-PARITY — the op-log fold of the committed fixtures renders the REAL device mesh CENTRED
    // exactly at the walker's (x,y,z). ISSUE EXPOSED: _commitDiscWalk's old cat[0] fallback folded every
    // unmatched fixture as a full-height catalog Column (the towers in the pre-fix screenshot — the
    // op-log half of geometry hell). Geometry doctrine: measure through the REAL renderer, don't reason.
    const fold = await pg.evaluate(() => {
      const THREE = window.THREE, out = { n: 0, maxD: 0, real: 0 };
      const odb = window.Bonsai.oplog.db; if (!odb) return { err: 'no oplog db' };
      const rows = odb.exec("SELECT id, parameters FROM kernel_ops WHERE op_type='GEOM_INSERT'");
      const want = {};
      if (rows.length) rows[0].values.forEach(r => {
        try { const P = JSON.parse(r[1]); if (P._dw && P._dw.cz != null) want[r[0]] = { x: P.placement.x, y: P.placement.y, z: P._dw.cz }; } catch (e) { }
      });
      window.A.scene.updateMatrixWorld(true);
      const box = new THREE.Box3(), v = new THREE.Vector3();
      for (const m of window.Bonsai.group().children) {
        if (!m.isMesh || !m.userData || m.userData.featureId == null) continue;
        const w = want[m.userData.featureId]; if (!w) continue;
        box.setFromObject(m); const c = box.getCenter(v);
        const d = Math.max(Math.abs(c.x - w.x), Math.abs(c.y - w.y), Math.abs(c.z - w.z));
        out.n++; if (d > out.maxD) out.maxD = d;
      }
      return out;
    });
    chk('L7 FOLD-PARITY committed fixtures fold centred at walker xyz', !fold.err && fold.n >= 100 && fold.maxD <= 1e-3,
      fold.err || `folded=${fold.n} maxD=${fold.maxD.toExponential(2)}m`);
    await pg.screenshot({ path: path.join(OUT, 'livewire_duplex_elec.png') });
    chk('Duplex page zero pageerror', errs.length === 0, errs[0] || '');
    await pg.close();
  }

  // ── Terminal: measured-band no-spaces path live ──
  {
    const { pg, logs, errs } = await openResident(br, 'Terminal', 20000, 240000);
    const w = await walkAndWait(pg, logs, 'ELEC', 120000);
    const ns = grab(w, '§WALK-NOSPACES disc=ELEC')[0];
    chk('L3 NOSPACES Terminal ELEC measured-band live', !!ns && num(ns, 'placed') > 0,
      ns ? ns.slice(ns.indexOf('placed=')) : 'no §WALK-NOSPACES line (got: ' + (grab(w, '§WALK')[0] || 'none') + ')');
    const lod = grab(w, '§DW-PRIM-LOD disc=ELEC')[0];
    chk('L3b LOD400 Terminal ELEC real meshes', !!lod && num(lod, 'lod400') > 0,
      lod ? lod.slice(lod.indexOf('lod400=')) : 'no §DW-PRIM-LOD line');
    await pg.screenshot({ path: path.join(OUT, 'livewire_terminal_elec.png') });
    chk('Terminal page zero pageerror', errs.length === 0, errs[0] || '');
    await pg.close();
  }

  // ── SampleCastle: fallback preserves the legacy walk (no resident loses placements) ──
  {
    const { pg, logs, errs } = await openResident(br, 'SampleCastle', 2000, 180000);
    const w = await walkAndWait(pg, logs, 'ELEC', 90000);
    const fb = grab(w, '§SCHED-FALLBACK ELEC').length;
    const legacy = grab(w, '§WALK disc=ELEC')[0];
    chk('L4 FALLBACK SC ELEC → legacy walk placed', fb > 0 && !!legacy && num(legacy, 'placed') > 0,
      `fallback=${fb} ` + (legacy ? legacy.slice(legacy.indexOf('placed=')) : 'no legacy §WALK line'));
    chk('SampleCastle page zero pageerror', errs.length === 0, errs[0] || '');
    await pg.close();
  }

  await br.close(); server.close();
  console.log(`\nW-DW-LIVEWIRE: ${pass}/${pass + fail} PASS${fail ? ' — ' + fail + ' FAIL' : ''}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('W-DW-LIVEWIRE crashed:', e); process.exit(1); });
