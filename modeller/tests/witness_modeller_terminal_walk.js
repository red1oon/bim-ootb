#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-TERM-WALK scope (read this block first; read the log after every run)
 * W-TERM-WALK — headless witness for the disc-walk roster wired to the Outliner, on the building class the rules
 * were MINED for (RESUME_TERMINAL_RULE_MINING §CONVERGENCE / Phase 6):
 *   • on Open, the shared DiscWalker engine loads the building-class rules + a "Walk · Disciplines" roster appears
 *   • the roster lists the MEASURED disciplines (FP/ELEC/PLB/ACMV)
 *   • clicking a roster discipline WALKS it onto the open building → §DISC-WALK <D> placed=N + LOD400 instances
 *   • a discipline with no rule (generic MEP) → honest REFUSE, 0 fabricated
 *
 * RE-POINTED 2026-09-30 (MODELLER_MASTER §RESUME 2026-09-30 known-red "terminal_walk"; RED 5/5 on main 8311ba5f):
 *   The old claims ran on SampleHouse and asserted (a) terminal_rules.db loads there — which contradicts the Walker
 *   Doctrine (a house walks duplex_rules.db and BORROWS FP) — and (b) FP/ELEC place >0 there. Under §WALK-LOD400-ONLY a
 *   house has no mesh for those rules' placements: measured on main, FP 17 + ELEC 28 hashless legacy placements all
 *   REFUSED (§DW-LOD400-REFUSE … no box, no LOD200). So the walk-to-instances claims now run on the TERMINAL resident
 *   (terminal_rules.db is its own measured standard; §NOSPACES bands + rule_mesh_binding resolve in Terminal_geo.db),
 *   and the house keeps ONE claim of its own: the doctrine + the honest refusal, so nobody re-adds a box to get placed>0.
 *   FALSIFY=1 blanks RealGeometry.resolveHashes before the Terminal FP click → T4/T5/T6 must go RED (the LOD400 gate
 *   refuses everything and this witness sees it).
 *
 * CLAIMS:
 *   T1  Terminal open → DiscWalker.loadedFile() === 'terminal_rules.db' and the roster is registered (§DISC-WALK roster)
 *   T2  measured disciplines FP + ELEC present
 *   T3  the roster shows an FP node + ▶ glyph
 *   T4  click FP → walked onto the Terminal, placed>0
 *   T5  §DISC-WALK FP placed=N logged (the production _discWalkOne line)
 *   T6  FP placements rendered as InstancedMesh instances under dwRoot: instances == placed, §DW-PRIM-LOD lod300=0 lod200=0
 *   T7  click ELEC → walked, placed>0 (2 disciplines co-resident)
 *   T7b the gate's clash flags and the RED (0xff2a2a) instances agree — flagged == redMarkers (INCONCLUSIVE label at 0/0)
 *   T8  generic MEP (no rule) → honest refusal, 0 placed
 *   T9  SampleHouse (residential): loadedFile() === 'duplex_rules.db' (Walker Doctrine) and click FP → REFUSE with a
 *       §DW-LOD400-REFUSE line, 0 instances under dwRoot (no box, no LOD200)
 *   T10 no script LOAD_FAIL / pageerror
 */
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');
var { chromium } = require('playwright');
var FALSIFY = process.env.FALSIFY === '1';

// Repo-root docroot: the Modeller lives in /modeller/ (its own app folder); serving from root resolves
// /modeller/modeller.html, its sibling JS, /modeller/lib/*, /modeller/*.db, AND the cross-surface broker /viewer/connect_scene.js.
var ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm',
  '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };

function serve() {
  return new Promise(function (resolve) {
    var srv = http.createServer(function (req, res) {
      var p = decodeURIComponent(req.url.split('?')[0]);
      var fp = path.join(ROOT, p === '/' ? 'modeller/modeller.html' : p);
      fs.readFile(fp, function (e, buf) {
        if (e) { res.statusCode = 404; return res.end('nf'); }
        res.setHeader('Content-Type', MIME[path.extname(fp)] || 'application/octet-stream');
        res.setHeader('Accept-Ranges', 'bytes');
        res.end(buf);
      });
    });
    srv.listen(0, function () { resolve(srv); });
  });
}

async function openResident(page, key) {
  await page.click('#b-open');
  await page.waitForTimeout(120);
  await page.click('#m-open-panel .mo-row[data-key="' + key + '"]');
  await page.waitForFunction(function () {
    var t = window.BOMTreeOutliner && window.BOMTreeOutliner._currentTree && window.BOMTreeOutliner._currentTree();
    return !!t && Object.keys(t.nodes).some(function (id) { return t.nodes[id].kind === 'disc'; });
  }, null, { timeout: 90000 }).catch(function () {});
  // the DiscWalker engine loads the class rules + registers the roster; the LOD400 gate needs the geo buffer
  await page.waitForFunction(function () { return window.DiscWalker && window.DiscWalker._ready(); }, null, { timeout: 60000 }).catch(function () {});
  await page.waitForFunction(function () { return !!window.__dwGeoBuf; }, null, { timeout: 90000 }).catch(function () {});
  await page.waitForTimeout(500);
}
function dwInstances(page) {   // fixture buckets (userData.dwSub, per-disc) vs everything else under dwRoot (routed chain tubes, bends)
  return page.evaluate(function () {
    var g = window.Bonsai.group && window.Bonsai.group(); if (!g) return { inst: -1, red: 0, root: false };
    var root = g.children.find(function (o) { return o.userData && o.userData.dwRoot; }); if (!root) return { inst: 0, fix: {}, other: 0, red: 0, root: false };
    var inst = 0, red = 0, other = 0, fix = {};
    root.children.forEach(function (o) {
      if (!o.isInstancedMesh) return; inst += o.count;
      if (o.userData && o.userData.dwSub && o.userData.dwDisc) fix[o.userData.dwDisc] = (fix[o.userData.dwDisc] || 0) + o.count; else other += o.count;
      if (o.material && o.material.color && o.material.color.getHex() === 0xff2a2a) red += o.count;
    });
    return { inst: inst, fix: fix, other: other, red: red, root: true };
  });
}

(async function () {
  var srv = await serve();
  var port = srv.address().port;
  var logs = [];
  var browser = await chromium.launch();
  var page = await browser.newPage();
  page.on('console', function (m) { logs.push(m.text()); });
  page.on('pageerror', function (e) { logs.push('PAGEERROR ' + e.message); });

  await page.goto('http://localhost:' + port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(function () { return window.__sceneReady === true && !!window.SQL; }, { timeout: 25000 }).catch(function () {});

  var pass = 0, fail = 0;
  function chk(name, cond, extra) { if (cond) { pass++; console.log('  ✅ ' + name + (extra ? '  ' + extra : '')); } else { fail++; console.log('  ❌ ' + name + (extra ? '  ' + extra : '')); } }
  console.log('═══ W-TERM-WALK — disc-walk roster wired to the Outliner, on the mined building class (headless' + (FALSIFY ? ', FALSIFY=1' : '') + ') ═══');

  // ── Terminal (the large-complex standard's own building) ──────────────────────────────────────
  var t0 = Date.now();
  await openResident(page, 'Terminal');
  var eng = await page.evaluate(function () { return { ready: !!(window.DiscWalker && window.DiscWalker._ready()), file: window.DiscWalker && window.DiscWalker.loadedFile ? window.DiscWalker.loadedFile() : null,
    discs: window.DiscWalker ? window.DiscWalker.disciplines() : [], geo: !!window.__dwGeoBuf, name: window.__dwName }; });
  var rosterLog = logs.some(function (l) { return /§DISC-WALK roster registered/.test(l); });
  console.log('  §TW-OPEN Terminal ready=' + eng.ready + ' rules=' + eng.file + ' discs=' + eng.discs.join(',') + ' geoBuf=' + eng.geo + ' ms=' + (Date.now() - t0));
  chk('T1 Terminal open → DiscWalker loaded terminal_rules.db + roster registered', eng.ready && eng.file === 'terminal_rules.db' && rosterLog, 'rules=' + eng.file + ' roster=' + rosterLog);
  chk('T2 measured disciplines available (FP/ELEC present)', eng.discs.indexOf('FP') >= 0 && eng.discs.indexOf('ELEC') >= 0, eng.discs.join(','));

  var rosterFP = await page.evaluate(function () {
    var nodes = [].slice.call(document.querySelectorAll('#bo-tree [data-disc]'));
    var fp = nodes.find(function (d) { return d.getAttribute('data-disc') === 'FP'; });
    return { has: !!fp, glyph: fp ? !!fp.querySelector('.bn-walk') : false };
  });
  chk('T3 "Walk · Disciplines" roster shows an FP node + ▶', rosterFP.has && rosterFP.glyph);

  if (FALSIFY) await page.evaluate(function () {   // fault at the loader seam: no hash resolves → the LOD400 gate must refuse every placement
    window.RealGeometry.resolveHashes = function () { return {}; }; console.log('§TW-FALSIFY RealGeometry.resolveHashes blanked (expect T4/T5/T6 RED)');
  });

  // ── click FP → walk it onto the Terminal ─────────────────────────────────────────────────────
  logs.length = 0; var t1 = Date.now();
  await page.click('#bo-tree [data-disc="FP"]');
  await page.waitForFunction(function () { return window.__dwLastCommitDisc === 'FP' || /REFUSE|no walk/.test((document.getElementById('stat') || {}).textContent || ''); }, null, { timeout: 180000 }).catch(function () {});
  await page.waitForTimeout(1500);
  var fpWalk = await page.evaluate(function () { return { placed: (window.__dwWalks && window.__dwWalks.FP) ? window.__dwWalks.FP.length : 0 }; });
  var fpLine = logs.filter(function (l) { return /^§DISC-WALK FP /.test(l); })[0] || '';
  var primLine = logs.filter(function (l) { return /§DW-PRIM-LOD.*disc=FP/.test(l); }).pop() || '';
  var lodOk = /lod300=0 lod200=0/.test(primLine);
  console.log('  §TW-WALK FP placed=' + fpWalk.placed + ' ms=' + (Date.now() - t1) + ' | ' + fpLine.slice(0, 160) + ' | ' + primLine.slice(0, 120));
  chk('T4 click FP → walked onto the Terminal, placed>0', fpWalk.placed > 0, 'placed=' + fpWalk.placed);
  chk('T5 §DISC-WALK FP placed=N logged (production _discWalkOne)', /^§DISC-WALK FP placed=\d+/.test(fpLine), fpLine.slice(0, 120) || logs.filter(function (l) { return /DISC-WALK FP/.test(l); })[0]);
  var inst = await dwInstances(page);
  var fpFix = inst.fix.FP || 0;
  chk('T6 FP placements rendered as LOD400 InstancedMesh fixture instances under dwRoot (FP fixture instances == placed, lod300=0 lod200=0; routed tubes counted apart)',
    fpFix > 0 && fpFix === fpWalk.placed && lodOk, 'fixtureInst=' + fpFix + ' placed=' + fpWalk.placed + ' otherInst(chains/bends)=' + inst.other + ' prim=' + (primLine.replace(/^.*§DW-PRIM-LOD/, '§DW-PRIM-LOD').slice(0, 90) || '(no §DW-PRIM-LOD line)'));

  // ── click ELEC too → the Gate runs across FP+ELEC ─────────────────────────────────────────────
  logs.length = 0; var t2 = Date.now();
  await page.click('#bo-tree [data-disc="ELEC"]');
  await page.waitForFunction(function () { return window.__dwLastCommitDisc === 'ELEC' || /REFUSE|no walk/.test((document.getElementById('stat') || {}).textContent || ''); }, null, { timeout: 180000 }).catch(function () {});
  await page.waitForTimeout(1500);
  var elPlaced = await page.evaluate(function () { return (window.__dwWalks && window.__dwWalks.ELEC) ? window.__dwWalks.ELEC.length : 0; });
  console.log('  §TW-WALK ELEC placed=' + elPlaced + ' ms=' + (Date.now() - t2) + ' | ' + (logs.filter(function (l) { return /^§DISC-WALK ELEC /.test(l); })[0] || '').slice(0, 160));
  chk('T7 click ELEC → walked, placed>0 (2 disciplines now co-resident)', elPlaced > 0, 'placed=' + elPlaced);

  // T7b — the gate's clash flags (clash=true) and the RED (0xff2a2a) instances must agree: a residual clash a human would
  // SEE is asserted, never assumed. On the Terminal's own rules nothing may be irreducible — then 0 == 0 is INCONCLUSIVE
  // for the "renders red" half and the line says so; a flagged clash with no red instance (or the reverse) is the defect.
  var clashRender = await page.evaluate(function () {
    var n = 0; ['FP', 'ELEC'].forEach(function (d) { n += ((window.__dwWalks && window.__dwWalks[d]) || []).filter(function (p) { return p.clash; }).length; });
    return { clashFlagged: n };
  });
  var inst2 = await dwInstances(page);
  chk('T7b gate flags == RED-rendered instances (no silent clash)' + (clashRender.clashFlagged === 0 ? ' — INCONCLUSIVE for the red-render half (0 flagged on the building\'s own rules)' : ''),
    clashRender.clashFlagged === inst2.red, 'clashFlagged=' + clashRender.clashFlagged + ' redMarkers=' + inst2.red + ' instances=' + inst2.inst);

  // ── generic MEP (no measured rule) → honest refusal ───────────────────────────────────────────
  var refused = await page.evaluate(function () {
    var w = window.DiscWalker.dwWalk('MEP', new window.SQL.Database(new Uint8Array(window.__dwBuf)), window.__dwName);
    return { refused: !!w.refused, placed: w.placed || 0 };
  });
  chk('T8 generic MEP (no rule) → honest refusal, 0 placed', refused.refused && refused.placed === 0);

  // ── SampleHouse (residential): the doctrine + the honest refusal ───────────────────────────────
  logs.length = 0;
  await openResident(page, 'SampleHouse');
  await page.click('#bo-tree [data-disc="FP"]');
  await page.waitForFunction(function () { return /REFUSE|no walk|placed/.test((document.getElementById('stat') || {}).textContent || '') || window.__dwLastCommitDisc === 'FP'; }, null, { timeout: 90000 }).catch(function () {});
  await page.waitForTimeout(1500);
  // the building-class select happens at WALK time (_discWalkOne → dwInit(_dwRules(name))), so the loaded file is read after the click
  var shEng = await page.evaluate(function () { return { file: window.DiscWalker.loadedFile ? window.DiscWalker.loadedFile() : null }; });
  var shWalk = await page.evaluate(function () { return { placed: (window.__dwWalks && window.__dwWalks.FP) ? window.__dwWalks.FP.length : 0 }; });
  var shRefuse = logs.filter(function (l) { return /§DW-LOD400-REFUSE disc=FP|§DISC-WALK FP REFUSE/.test(l); });
  var shInst = await dwInstances(page);
  console.log('  §TW-HOUSE rules=' + shEng.file + ' FP placed=' + shWalk.placed + ' instances=' + shInst.inst + ' | ' + (shRefuse[0] || '').slice(0, 160));
  chk('T9 SampleHouse: duplex_rules.db loaded (Walker Doctrine) and click FP → honest LOD400 REFUSE, 0 placed, 0 instances (no box)',
    shEng.file === 'duplex_rules.db' && shWalk.placed === 0 && shInst.inst === 0 && shRefuse.length > 0,
    'rules=' + shEng.file + ' placed=' + shWalk.placed + ' instances=' + shInst.inst + ' refuseLines=' + shRefuse.length);

  var allFail = logs.filter(function (l) { return /LOAD_FAIL|PAGEERROR/.test(l); });
  chk('T10 no script LOAD_FAIL / pageerror', allFail.length === 0, allFail.slice(0, 2).join(' | '));

  console.log('W-TERM-WALK: ' + pass + ' PASS / ' + fail + ' FAIL');
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('FATAL', e); process.exit(1); });
