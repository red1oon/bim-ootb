#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ROUTE-PATTERN-BRIDGE scope (read this block first)
 * SCOPE: RESUME_MODELLER_WALK_SUBSTRATE.md §CAMPAIGN M1, REDIRECTED 2026-07-07 — "bridge ARC-derived anchors
 *   into routewalker.js's already-proven ad_mep_pattern engine, don't reinvent generation in disc_walker.js/
 *   seed_trunk.js." This gate MEASURES two claims, not assumes them:
 *   (1) On an ARC-only building (Duplex — verified zero real MEP/pipe/fixture elements_meta rows), routeChains
 *       ('PLB', bdb) is honestly 0 (nothing real to nn-pair) BEFORE the bridge, and disc_walker.js's new
 *       routePattern() bridge — derived METER=door-seed, STACK=stair-riser, FIXTURE=place()'s own measured
 *       output, JUNCTION=SeedTrunk corridor waypoints — makes DiscWalker.dwWalk('PLB',…).chainSegs flip 0→N by
 *       calling routewalker.js's OWN _rwPairSegments (the function RouteWalker.java's Java-side W-PATTERN-CW/
 *       W-PATTERN-SP 7/7 tests exercise the ported logic of), not a second nn/Dijkstra mechanism.
 *   (2) Discipline-agnostic check, MEASURED not assumed: `ad_mep_pattern` carries rows for exactly CW+SP
 *       (both PLUMBING sub-networks — routewalker.js's own RW_DISC_TO_COORD maps CW/SP/PLB all to DWATER/DRAIN).
 *       ELEC/ACMV have ZERO ad_mep_pattern rows, so the SAME bridge must HONESTLY REFUSE for them (not silently
 *       stay 0 as if untried, and not fabricate a network) — this is the "measure it, don't assume" instruction.
 *   Drives the REAL production path (window.discWalk — the Outliner "Walk" row's handler, per
 *   feedback_test_real_user_path_not_seams) for the render/commit/undo integration, PLUS a direct engine-seam
 *   check (DiscWalker.routeChains/dwWalk) for the byRule/anchor-count numbers a screenshot can't show.
 * THE WORKING SWIFTSHADER FLAGS: --use-gl=angle --use-angle=swiftshader (precedent witness_dw_pixelprobe.js).
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };
// NOTE (found this pass, logged not fixed here — separate pre-existing regression, not M1's scope): the live
// isolated modeller serves modeller.html from GH Pages `modeller/` but routewalker.js fetches `mep_rw.db`
// relative to THAT page — and mep_rw.db is git-tracked/deployed only under `viewer/` (confirmed: GH Pages
// modeller/mep_rw.db → 404 live; viewer/mep_rw.db → 200). So the BOM-drop auto-route (autoRouteMEP) is
// currently non-functional on the real isolated modeller, unrelated to this bridge. This witness's local
// server fixture-serves it at the modeller-relative path the code expects, so THIS bridge (a disc_walker.js/
// modeller.html change, independent of where mep_rw.db is hosted) can be measured correctly.
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  let fp = path.join(ROOT, p);
  if (p === '/modeller/mep_rw.db' && !fs.existsSync(fp)) fp = path.join(ROOT, 'viewer', 'mep_rw.db');
  fs.readFile(fp, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); }); });

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  const logs = []; pg.on('console', m => { const t = m.text(); if (/^§(DW|RW)/.test(t)) logs.push(t); });

  console.log('═══ W-ROUTE-PATTERN-BRIDGE — Duplex (ARC-only) PLB: routeChains 0 → routePattern bridge N, + honest ELEC/ACMV refuse ═══');
  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai && typeof window.discWalk==="function"', { timeout: 30000 }).catch(() => {});
  await pg.click('#b-open'); await sleep(200);
  await pg.click('#m-open-panel .mo-row[data-key="Duplex"]');
  await pg.waitForFunction(() => !!window.__dwBuf, { timeout: 30000 }).catch(() => {});
  await sleep(1500);

  // ── PREMISE: routeChains('PLB', bdb) is honestly 0 on this ARC-only building (measured, not assumed) ──
  const premise = await pg.evaluate(async () => {
    await window.DiscWalker.dwInit(window.SQL, './', window._dwRules(window.__dwName));
    await window._dwEnsureBorrow();
    const bdb = new window.SQL.Database(new Uint8Array(window.__dwBuf));
    const rc = window.DiscWalker.routeChains('PLB', bdb);
    const arcMepRows = bdb.exec("SELECT COUNT(*) FROM elements_meta WHERE ifc_class LIKE '%Pipe%' OR ifc_class LIKE '%Sanitary%' OR ifc_class LIKE '%FlowTerminal%'")[0].values[0][0];
    bdb.close();
    return { routeChainsSegs: rc.segs.length, arcMepRows: arcMepRows };
  });

  // ── ENGINE SEAM: direct dwWalk (both WITHOUT and WITH the pattern bridge) for the byRule/anchor numbers ──
  const engine = await pg.evaluate(async () => {
    await window.rwInit(window.SQL, './');   // load mep_rw.db's ad_mep_pattern table (SAME lazy-init the BOM-drop flow uses)
    const bdb1 = new window.SQL.Database(new Uint8Array(window.__dwBuf));
    const noPattern = window.DiscWalker.dwWalk('PLB', bdb1, window.__dwName, { noPattern: true });
    bdb1.close();
    const bdb2 = new window.SQL.Database(new Uint8Array(window.__dwBuf));
    const withPattern = window.DiscWalker.dwWalk('PLB', bdb2, window.__dwName);
    bdb2.close();
    // discipline-agnostic check: ELEC/ACMV have NO ad_mep_pattern rows — must honestly refuse, not silently 0
    const bdb3 = new window.SQL.Database(new Uint8Array(window.__dwBuf));
    const elecPattern = window.DiscWalker.routePattern('ELEC', bdb3, {});
    const acmvPattern = window.DiscWalker.routePattern('ACMV', bdb3, {});
    bdb3.close();
    return {
      noPatternSegs: noPattern.chainSegs.length,
      withPatternSegs: withPattern.chainSegs.length,
      byRule: withPattern.chainByRule,
      anchorCounts: withPattern.patternBridge && withPattern.patternBridge.anchorCounts,
      seedGuid: withPattern.patternBridge && withPattern.patternBridge.seed && withPattern.patternBridge.seed.guid,
      riser: withPattern.patternBridge && withPattern.patternBridge.riser,
      elecRefused: elecPattern.refused, elecReason: elecPattern.reason,
      acmvRefused: acmvPattern.refused, acmvReason: acmvPattern.reason
    };
  });

  // ── REAL PRODUCTION PATH: window.discWalk('PLB', …) — the Outliner "Walk" handler — render + commit ──
  const before = await pg.evaluate(() => ({ oplogLen: window.Bonsai.oplog.length, cur: window.Bonsai.oplog.cursor }));
  await pg.evaluate(() => window.discWalk('PLB', { building: window.__dwName }));
  const completed = await pg.waitForFunction(() => window.__dwLastCommitDisc === 'PLB', { timeout: 25000, polling: 250 }).then(() => true).catch(() => false);
  // PLB has a non-zero chainSegs (the bridge), so _discWalkOne ALSO awaits _commitDiscChains after
  // _commitDiscWalk — a second, separate signed commit with its OWN sentinel (__dwLastChainDisc). Waiting on
  // __dwLastCommitDisc alone races the chain commit (seen once as a flaky undo — plbObjs/instances not cleared).
  const chainCommitted = await pg.waitForFunction(() => window.__dwLastChainDisc === 'PLB', { timeout: 25000, polling: 250 }).then(() => true).catch(() => false);
  await sleep(400);
  const after = await pg.evaluate(() => {
    const g = window.Bonsai.group(); const root = g && g.children.find(o => o.userData && o.userData.dwRoot);
    const kids = root ? root.children : [];
    const chainTubes = kids.filter(o => o.userData && o.userData.dwChain === 'PLB');
    return { oplogLen: window.Bonsai.oplog.length, cur: window.Bonsai.oplog.cursor,
      n: (window.__dwWalks && window.__dwWalks.PLB || []).length, chainTubes: chainTubes.length };
  });
  const chain = await pg.evaluate(async () => { try { const db = await window.Bonsai.oplog._ensureDb(); const v = await window.KernelOps.verifyChain(db); return !!v.ok; } catch (e) { return 'ERR:' + e.message; } });
  // undo back to pre-walk (reversibility, mirrors W-E2E-WALK's own W6)
  await pg.evaluate(c => { const s = document.getElementById('hist-slider'); s.value = c; s.dispatchEvent(new Event('input', { bubbles: true })); }, before.cur);
  await sleep(600);
  // undo signal = RENDERED instances (mirrors W-E2E-WALK's own W6) — window.__dwWalks[disc] is walk-time
  // bookkeeping only, never wired to the op-log cursor/history-scrub, so it's the wrong field to check here.
  const undo = await pg.evaluate(() => {
    const g = window.Bonsai.group(); const root = g && g.children.find(o => o.userData && o.userData.dwRoot);
    const kids = root ? root.children : [];
    const plb = kids.filter(o => o.userData && o.userData.dwDisc === 'PLB');
    const instances = plb.reduce((a, o) => a + (o.isInstancedMesh ? (o.count || 0) : 0), 0);
    return { cur: window.Bonsai.oplog.cursor, plbObjs: plb.length, instances: instances };
  });

  await br.close(); server.close();

  console.log('  §PREMISE ' + JSON.stringify(premise));
  console.log('  §ENGINE ' + JSON.stringify(engine));
  console.log('  §PRODPATH completed=' + completed + ' before=' + JSON.stringify(before) + ' after=' + JSON.stringify(after));
  console.log('  §CHAIN verifyChain=' + chain);
  console.log('  §UNDO ' + JSON.stringify(undo));
  logs.slice(0, 40).forEach(l => console.log('    ' + l));

  let pass = 0, fail = 0;
  const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
  chk('P1 PREMISE routeChains=0 on ARC-only Duplex', premise.routeChainsSegs === 0 && premise.arcMepRows === 0, JSON.stringify(premise));
  chk('P2 noPattern (opts.noPattern) stays 0 — old behaviour byte-identical', engine.noPatternSegs === 0, 'noPatternSegs=' + engine.noPatternSegs);
  chk('P3 BRIDGE flips 0→N via routewalker.js pattern engine', engine.withPatternSegs > 0, 'withPatternSegs=' + engine.withPatternSegs);
  chk('P4 CW+SP both produced segments (byRule)', engine.byRule && engine.byRule.filter(b => b.mode === 'CW' && b.segs > 0).length > 0 && engine.byRule.filter(b => b.mode === 'SP' && b.segs > 0).length > 0, JSON.stringify(engine.byRule));
  chk('P5 anchors are REAL (seed=door guid, riser=stair, junctions>0)', !!engine.seedGuid && !!engine.riser && engine.anchorCounts && engine.anchorCounts.junction > 0, JSON.stringify({ seedGuid: engine.seedGuid, riser: engine.riser, anchorCounts: engine.anchorCounts }));
  chk('P6 DISCIPLINE-AGNOSTIC CHECK, measured: ELEC/ACMV honestly REFUSE (no ad_mep_pattern rows), not silent-0', engine.elecRefused === true && engine.acmvRefused === true, 'elec=' + engine.elecReason + ' acmv=' + engine.acmvReason);
  chk('P7 REAL PRODUCTION PATH renders the bridged chain (dwChain tubes)', completed && chainCommitted && after.chainTubes > 0, 'completed=' + completed + ' chainCommitted=' + chainCommitted + ' chainTubes=' + after.chainTubes);
  chk('P8 COMMITTED (op-log grew, signed chain verifies)', after.oplogLen > before.oplogLen && chain === true, 'oplog ' + before.oplogLen + '→' + after.oplogLen + ' verifyChain=' + chain);
  chk('P9 REVERSIBLE (undo clears PLB walk, cursor restored)', undo.instances === 0 && undo.cur === before.cur, JSON.stringify(undo));
  chk('P10 NO-ERROR', errs.length === 0, errs.slice(0, 2).join(' | '));

  console.log('W-ROUTE-PATTERN-BRIDGE: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
