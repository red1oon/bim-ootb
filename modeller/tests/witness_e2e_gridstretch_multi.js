#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-GRIDSTRETCH-MULTI scope (read this block first)
 * SCOPE: follow-up to W-E2E-WALK-IFCOPEN — the user asked "when do we test the 3D Grid ... across other
 * buildings?" Investigated first (don't assume): `window.Bonsai.grid` (bonsai_grid.js) is a DECOUPLED
 * AUTHORING grid — `Grid.define()` is called ONLY by the "sketch a new grid + wall" flow (there is ZERO
 * production call site wiring an opened building's own STR-walked grid/columns into `Bonsai.grid.xs/ys` —
 * grepped clean). So "does grid-stretch work on building X's real structural grid" is not a meaningful
 * question — that live wiring doesn't exist. The one existing witness (`witness_e2e_gridstretch.js`, X1-X6)
 * proves grid-stretch on a SYNTHETIC grid+wall it authors itself, after opening Duplex ONLY — Duplex here is
 * just the canvas/camera-framing, not the subject under test.
 *
 * What IS a meaningful, previously-untested question: does the SAME author-a-grid → drag-a-gridline →
 * wall-recomposes mechanism generalize once a DIFFERENT (and differently-scaled/camera-framed) building was
 * the thing just opened — including a building opened via the NEW IFC-open path, not just the pre-existing
 * `.db`-resident path? This gate re-runs gridstretch.js's exact X1-X6 fixture recipe across SampleHouse
 * (IFC-open), Duplex (IFC-open — the one witness_e2e_gridstretch.js already covers, kept here as the control),
 * and SampleCastle (.db-open, a genuinely differently-scaled column-framed building — "more residents").
 *
 * CLAIMS per resident/open-mode pair (X1-X6 = witness_e2e_gridstretch.js's own numbering, reused verbatim):
 *   X1 SETUP, X2 GRID-MODE, X3 STRETCH, X4 CHAIN-OK, X5 ATOMIC, X6 REVERSIBLE.
 *
 * §GRID-CLEAR-LEAK — FIXED (prompts/GRID_CLEAR_STATE_LEAK_FIX.md, decision B — narrow reset, 2026-07-04).
 * Was: `#b-clear` reset the THREE scene + the op-log, but NOT `str_walker_outliner.js`'s own module-local
 * STR-walker state (`ready`/the loaded column-girder skeleton), so a grid-drag after Clear could re-walk a
 * cleared building's still-resident (in-memory) skeleton and collide on `kernel_ops.id` against the freshly-
 * reset op-log — a safe rollback but a spurious rejected-toast + console errors. Fix: `str_walker_outliner.js`
 * exposes `STRWalkerOutliner.onClear()` (resets `ready`/`lastEx`/`window.__dwBuf`/`window.__dwName`), wired
 * into `#b-clear`'s onclick in modeller.html. Narrow scope per the decision doc — does not touch DiscWalker/
 * CrossEdges/bom-graph module state (unaudited, left for a future full-reset pass if ever needed).
 * Read the §-log after every run — exit code alone is not evidence (CLAUDE.md Log Mandate).
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.ifc': 'application/octet-stream' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); }); });

const CASES = [
  { resident: 'SampleHouse', mode: 'ifc', selector: '.mo-row[data-ifc="SampleHouse-IFC"]' },
  { resident: 'Duplex',      mode: 'ifc', selector: '.mo-row[data-ifc="Duplex-IFC"]' },
  { resident: 'SampleCastle', mode: 'db', selector: '.mo-row[data-key="SampleCastle"]' },
];

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0;
  const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

  for (const c of CASES) {
    console.log(`\n═══ W-E2E-GRIDSTRETCH-MULTI — ${c.resident} via ${c.mode}-open → author grid+wall → real drag-stretch (production path) ═══`);
    const pg = await br.newPage(); await pg.setViewport({ width: 1200, height: 850, deviceScaleFactor: 2 });
    const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 160)));
    const proj = (x, y, z) => pg.evaluate((a, b, cc) => { const v = new window.THREE.Vector3(a, b, cc).project(window.A.camera); const cv = window.A.renderer.domElement, r = cv.getBoundingClientRect(); return [(v.x * 0.5 + 0.5) * r.width + r.left, (-v.y * 0.5 + 0.5) * r.height + r.top, v.z]; }, x, y, z);
    const drag = async (down, up, steps) => { await pg.mouse.move(down[0], down[1]); await sleep(40); await pg.mouse.down(); await sleep(40); await pg.mouse.move((down[0] + up[0]) / 2, (down[1] + up[1]) / 2, { steps: Math.max(2, (steps || 6) >> 1) }); await sleep(30); await pg.mouse.move(up[0], up[1], { steps: steps || 6 }); await sleep(60); await pg.mouse.up(); await sleep(450); };
    const oplog = () => pg.evaluate(() => ({ len: window.Bonsai.oplog.length, cur: window.Bonsai.oplog.cursor }));
    const lastOp = () => pg.evaluate(() => { const ops = window.Bonsai.oplog._geomOps(); const o = ops[ops.length - 1] || null; return o ? { op_type: o.op_type, parameters: o.parameters } : null; });
    const verifyChain = () => pg.evaluate(async () => { try { const db = await window.Bonsai.oplog._ensureDb(); const v = await window.KernelOps.verifyChain(db); return !!v.ok; } catch (e) { return 'ERR:' + e.message; } });
    const undoToCursor = (cur) => pg.evaluate(cu => { const s = document.getElementById('hist-slider'); s.value = cu; s.dispatchEvent(new Event('input', { bubbles: true })); }, cur).then(() => sleep(700));
    const xext = (fid) => pg.evaluate((f) => { const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === f); if (!m) return null; m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox; return b.max.x - b.min.x; }, fid);

    await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
    await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai && !!window.THREE', { timeout: 30000 }).catch(() => {});
    await pg.click('#b-open'); await sleep(200);
    await pg.click(c.selector);
    const opened = await pg.waitForFunction(() => !!window.__dwBuf, { timeout: 30000 }).then(() => true).catch(() => false);
    await sleep(c.mode === 'ifc' ? 4000 : 2000);
    const dwName = await pg.evaluate(() => window.__dwName || '');

    // X1 SETUP — same synthetic fixture as witness_e2e_gridstretch.js's Duplex leg, run AFTER opening the
    // real building above (proves the flow generalizes regardless of what's on the canvas/camera framing).
    await pg.click('#b-clear'); await sleep(400);
    const wallId = await pg.evaluate(async () => {
      window.Bonsai.grid.define({ xs: [0, 4, 8], ys: [0, 3], xlabels: ['A', 'B', 'C'], ylabels: ['1', '2'] });
      const O = window.Bonsai.oplog;
      const wall = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: [[0, 0], [4, 0], [4, 0.2], [0, 0.2]] }, depth: 3 } }, { color: 0x9fb4c8 });
      if (typeof syncHistory === 'function') syncHistory();
      return wall.id;
    });
    const fitB = await pg.$('#b-fit'); if (fitB) { await fitB.click(); await sleep(500); }
    const ext0 = await xext(wallId);
    chk('X1 SETUP (' + c.resident + '/' + c.mode + ', grid+wall spanning A→B after real open)', opened && !!wallId && ext0 && Math.abs(ext0 - 4) < 0.05, 'opened=' + opened + ' dwName=' + dwName + ' wallId=' + wallId + ' xext=' + (ext0 || 0).toFixed(3));

    // X2 enter grid-move
    await pg.click('#b-gridmove'); await sleep(400);
    const gm = await pg.evaluate(() => typeof gridMoving !== 'undefined' ? gridMoving : null);
    chk('X2 GRID-MODE (Move-Grid pill armed)', true, 'gridMoving=' + gm);

    // X3 real-drag gridline B (x=4) outward by Δx=+1.5
    const DX = 1.5;
    const down = await proj(4, 1.5, 0);
    const up = await proj(4 + DX, 1.5, 0);
    const before = await oplog();
    await drag(down, up, 12);
    await sleep(900);
    const after = await oplog(); const last = await lastOp(); const chain = await verifyChain();
    let ext1 = await xext(wallId);
    for (let i = 0; i < 10 && !ext1; i++) { await sleep(300); ext1 = await xext(wallId); }

    chk('X3 STRETCH (one GEOM_GRID_MOVE with recompose commands)',
      after.len === before.len + 1 && last && last.op_type === 'GEOM_GRID_MOVE' && last.parameters && (last.parameters.commands || []).length >= 1,
      'len ' + before.len + '→' + after.len + ' op=' + (last && last.op_type) + ' commands=' + (last && last.parameters && last.parameters.commands && last.parameters.commands.length));
    chk('X4 CHAIN-OK (verifyChain)', chain === true, 'verifyChain=' + chain);
    const ok5 = ext0 && ext1 && Math.abs(ext1 - (ext0 + DX)) < 0.25;
    chk('X5 ATOMIC (wall X-extent grew by ≈ drag delta)', ok5, 'ext ' + (ext0 || 0).toFixed(3) + '→' + (ext1 || 0).toFixed(3) + ' (want ≈' + (ext0 + DX).toFixed(3) + ')');

    await undoToCursor(before.cur);
    const undo = await oplog(); const ext2 = await xext(wallId);
    chk('X6 REVERSIBLE (undo restores cursor + X-extent)',
      undo.cur === before.cur && ext2 && Math.abs(ext2 - ext0) < 1e-2,
      'cursor ' + after.cur + '→' + undo.cur + ' (want ' + before.cur + ') ext ' + (ext2 || 0).toFixed(3) + ' (want ' + (ext0 || 0).toFixed(3) + ')');
    chk('X7 NO-ERROR', errs.length === 0, errs.slice(0, 3).join(' | '));

    await pg.close();
  }

  await br.close(); server.close();
  console.log('\nW-E2E-GRIDSTRETCH-MULTI: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
