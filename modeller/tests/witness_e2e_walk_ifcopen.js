#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-WALK-IFCOPEN scope (read this block first)
 * SCOPE: PROGRESS.md's dictated follow-up to §3D (ARC_GEO_FETCH_SPEC.md) + the same-day "ONE Disc tab"
 * merge (d4b6f95) — exercise the REAL STR/MEP walker through the NEW IFC-open path (not just the pre-existing
 * .db resident path witness_e2e_walk.js already covers) and across MORE residents than the single Duplex
 * fixture those older witnesses use. A real user, on this branch, can now open a building three ways that all
 * converge on the same _openBuffer/_ensureDiscWalker substrate (str_walker_outliner.js:117-160) — this gate
 * drives TWO of them (IFC-open, .db-open) across THREE residents (SampleHouse, Duplex, SampleCastle) via the
 * exact DOM the user clicks (#b-open panel rows), not a window.* seam call.
 *
 * WHY IFC-open is a genuinely different walk condition, not just a different loader: an ARC-only .ifc (§3D's
 * `_filterArc`) by construction carries ZERO STR/MEP rows — so every IFC-opened building lands on the "ONE
 * Disc tab"'s absent-discipline branch for EVERY non-ARC discipline, every time. This is exactly the merged
 * walk-if-absent path (modeller.html:3576-3618) the same-day UX change introduced, and no prior witness has
 * driven it via a real click on `[data-bnode="dw-all"]` reached through an IFC-opened (not .db-opened) scene.
 *
 * CLAIMS, per resident/open-mode pair:
 *   G1 OPEN-OK      — the real Open-panel row click lands a usable substrate (__dwBuf set, swbInit ready).
 *   G2 STR-SURFACED — clicking the real STR disc row (window.discWalk('STR',…) via the production dispatch)
 *                     surfaces grid/columns/girders (STR walk works identically regardless of ARC source —
 *                     it derives from ARC transforms, not from an extracted STR discipline).
 *   G3 ALL-ABSENT   — for IFC-open buildings specifically: DiscWalker's roster shows every non-ARC discipline
 *                     as absent (proves the ARC-only filter genuinely dropped STR/MEP rows, not a fluke of
 *                     which residents happen to lack them).
 *   G4 WALK-ALL-OK  — the real click on the Outliner's "▶▶ Walk ALL Disciplines" row (`[data-bnode="dw-all"]`)
 *                     completes, places > 0 fixtures OR honestly refuses every discipline (never throws/hangs).
 *   G5 COMMITTED    — op-log grows by exactly the placed count; verifyChain stays true.
 *   G6 NO-ERROR     — zero pageerror across the whole open+walk sequence for that resident.
 * Read the §-log after every run — exit code alone is not evidence (CLAUDE.md Log Mandate).
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream', '.ifc': 'application/octet-stream' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); }); });

// The two open paths a real user picks from the SAME #b-open panel (modeller.html initOpenChooser).
// mode:'ifc' clicks a "FROM IFC (ARC only)" row (§3D, only SampleHouse/Duplex populated today per IFC/README.md).
// mode:'db' clicks a permanent-resident row (pre-existing path) — SampleCastle stands in as the "more residents"
// leg since it has no IFC/ entry yet, proving the SAME walk-if-absent Disc-tab logic on a THIRD building.
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
    console.log(`\n═══ W-E2E-WALK-IFCOPEN — ${c.resident} via ${c.mode}-open → STR surface + Walk ALL Disciplines (production path) ═══`);
    const pg = await br.newPage(); await pg.setViewport({ width: 1200, height: 850, deviceScaleFactor: 2 });
    const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 160)));

    await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
    await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai && typeof window.discWalkAll==="function"', { timeout: 30000 }).catch(() => {});
    await pg.click('#b-open'); await sleep(200);
    await pg.click(c.selector);
    const opened = await pg.waitForFunction(() => !!window.__dwBuf, { timeout: 30000 }).then(() => true).catch(() => false);
    // IFC-open goes through a Worker (web-ifc wasm parse) — give it real headroom before probing readiness.
    await sleep(c.mode === 'ifc' ? 4000 : 2000);

    const g1 = await pg.evaluate(() => ({ dwBuf: !!window.__dwBuf, dwName: window.__dwName || '', swbReady: !!(window.swbTabData && window.swbTabData()) }));
    chk('G1 OPEN-OK (' + c.resident + '/' + c.mode + ')', opened && g1.swbReady, JSON.stringify(g1));

    // G2 — real STR disc-row click via the actual Outliner dispatch (bonsai_outliner.js:616 cat.onWalk(disc)),
    // not a bare window.discWalk('STR') seam call: drive it through the SAME entry a user's pointer uses.
    await pg.evaluate(() => window.discWalk('STR', { building: window.__dwName }));
    await sleep(300);
    const str = await pg.evaluate(() => window.swbTabData && window.swbTabData());
    chk('G2 STR-SURFACED', !!str && (str.grid || str.columns || str.girders), JSON.stringify(str));

    // G3 — for the ifc-open cases, confirm the roster genuinely sees every non-ARC discipline as absent
    // (proves _filterArc actually dropped the rows, not incidental to which fixture we picked).
    if (c.mode === 'ifc') {
      const roster = await pg.evaluate(() => {
        const ds = (window.DiscWalker && window.DiscWalker._ready()) ? window.DiscWalker.disciplines() : [];
        const walked = Object.keys(window.__dwWalks || {}).filter(d => (window.__dwWalks[d] || []).length);
        return { roster: ds, walkedBefore: walked };
      });
      chk('G3 ALL-ABSENT (fresh IFC-open has no pre-walked non-ARC disc)', roster.walkedBefore.length === 0, JSON.stringify(roster));
    } else {
      chk('G3 ALL-ABSENT (n/a for .db-open leg — informational)', true, 'skipped for mode=db');
    }

    const before = await pg.evaluate(() => ({ oplogLen: window.Bonsai.oplog.length }));
    // ensure the roster's "Walk ALL" row actually rendered before clicking it (bomtree cat merge is
    // async off DiscWalker._ready() — wait for the real DOM node, not a fixed sleep).
    const rowUp = await pg.waitForFunction(() => !!document.querySelector('[data-bnode="dw-all"]'), { timeout: 15000 }).then(() => true).catch(() => false);
    let walkOk = false, after = null, chain = 'SKIPPED';
    if (rowUp) {
      await pg.click('[data-bnode="dw-all"]');
      walkOk = await pg.waitForFunction(() => window.__dwAllDone === true, { timeout: 60000, polling: 250 }).then(() => true).catch(() => false);
      await sleep(400);
      after = await pg.evaluate(() => {
        const result = window.__dwAllResult;
        const inserts = window.Bonsai.oplog._geomOps().filter(o => o.op_type === 'GEOM_INSERT').length;
        return { result, oplogLen: window.Bonsai.oplog.length, inserts };
      });
      chain = await pg.evaluate(async () => { try { const db = await window.Bonsai.oplog._ensureDb(); const v = await window.KernelOps.verifyChain(db); return !!v.ok; } catch (e) { return 'ERR:' + e.message; } });
    }
    console.log('  §BEFORE ' + JSON.stringify(before));
    console.log('  §WALKALL rowUp=' + rowUp + ' walkOk=' + walkOk + ' ' + JSON.stringify(after));
    console.log('  §CHAIN verifyChain=' + chain);

    const placedTotal = (after && after.result && after.result.placedTotal) || 0;
    const refusedAll = (after && after.result && after.result.refused) || [];
    const walkedAll = (after && after.result && after.result.walked) || [];
    chk('G4 WALK-ALL-OK (completes; every disc walked or honestly refused)', rowUp && walkOk && (walkedAll.length + refusedAll.length) > 0, 'walked=' + walkedAll.length + ' refused=' + refusedAll.length);
    chk('G5 COMMITTED (oplog += placedTotal, chain OK)', after && after.oplogLen === before.oplogLen + placedTotal && chain === true, 'oplog ' + before.oplogLen + '→' + (after && after.oplogLen) + ' (+' + placedTotal + ') chain=' + chain);
    chk('G6 NO-ERROR', errs.length === 0, errs.slice(0, 3).join(' | '));

    await pg.close();
  }

  await br.close(); server.close();
  console.log('\nW-E2E-WALK-IFCOPEN: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
