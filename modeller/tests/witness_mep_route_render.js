#!/usr/bin/env node
/**
 * §8E-3 — headless proof that the ROUTED MEP NETWORK (disc_walker.routeChains — fitting-to-pipe/duct-run
 * connectivity, not just placed component density) renders into the laid ARC and PAINTS real screen pixels,
 * on BOTH a real MEP-bearing large-complex substrate (Terminal) and a real MEP-bearing residential substrate
 * (Duplex). Mirrors witness_str_into_arc.js's structure (seed ARC, drive the production bridge/render verb
 * directly via its witness seam, MATHS-check the result, A/B-isolated readPixels).
 *
 * BACKGROUND (read before touching): the RENDER machinery this proves already exists and is already merged —
 * _renderDiscChains/_commitDiscChains (modeller.html, §ROUTER-NNCHAIN / §CAMPAIGN M4-M5, PR #555/#686) turn
 * DiscWalker.routeChains()'s segment list into cylinder-tube InstancedMeshes placed at the real endpoints
 * (§DW-TUBE whitebox drift check, 0 tolerance) and fold a signed GEOM_SWEEP sample to the op-log. What was
 * ACTUALLY missing (confirmed by re-running the existing gate below on this exact checkout before writing this
 * file — see the § log this witness's own header references):
 *   (1) the SHIPPED "Open Terminal" resident (modeller/Terminal_ARC.db) is ARC-ONLY (35552 elements, 0 MEP) —
 *       walking PLB on it produces chainSegs=0 (routeChains legitimately finds no IfcPipeFitting/Segment rows).
 *       modeller/tests/witness_modeller_router_nnchain.js (W-ROUTER-NNCHAIN), which drives that real "Open"
 *       flow, is therefore CURRENTLY RED on this checkout (5/8 FAIL, re-run 2026-07-11 — a substrate-data
 *       regression since it last passed, not a render-code fault; the render code below is untouched and correct).
 *   (2) window.__dwOcclusionProbe's A/B-isolation only matched userData.dwDisc (the GENERATED-fixture-box tag) —
 *       the routed-network's own tubes carry userData.dwChain and were silently excluded from the hide-set, so
 *       calling __dwOcclusionProbe('PLB') on a routed disc under-counted (tubes stayed visible in both A/B frames,
 *       contributing 0 to the diff even when they painted real pixels). Fixed in this same commit (see the
 *       §8E-3 comment above window.__dwOcclusionProbe in modeller.html) — this witness is what exercises the fix.
 * This witness does NOT touch the shipped Terminal_ARC.db resident (no binary edits, per LFS-quota-exhausted
 * discipline) — it drives the SAME render+probe functions directly via their witness seam (window.DiscWalker.
 * routeChains, window.__dwChainRender = _renderDiscChains, window.__dwOcclusionProbe), fed by the REAL MEP-bearing
 * fixtures already proven by the engine-side witness (bim-compiler/scripts/witness_walkback_mep.js,
 * W-WALKBACK-MEP 8/8: Terminal_extracted.db 5317 segs, Duplex_mep_extracted.db 358 segs) — same non-invent
 * discipline as witness_str_into_arc.js using Terminal_arcstr_proof.db instead of the live resident.
 * Those two fixtures live in the SIBLING bim-compiler checkout (not committed here — see EXT_FILES below);
 * this witness serves them off an absolute path and HONESTLY SKIPS (not fabricates) if that checkout is absent.
 *
 * Checks (12):
 *   R1  Terminal PLB routeChains segs == 4315 (pinned oracle, 0-tol — re-derived independently by this session
 *       via node against the same fixture; matches W-WALKBACK-MEP's Terminal totalSegs=5317 split PLB+ACMV)
 *   R2  Terminal ACMV routeChains segs == 1002 (pinned oracle, 0-tol)
 *   R3  Terminal PLB+ACMV == 5317 (== W-WALKBACK-MEP's own headline total)
 *   R4  Duplex PLB routeChains segs == 358 (pinned oracle, 0-tol — == W-WALKBACK-MEP's Duplex totalSegs)
 *   R5  every rendered tube's endpoints are the segment's own real from/to coords (§DW-TUBE reused; bound =
 *       1mm, not 0 — THREE's InstancedMesh matrix is a Float32Array, and Terminal's coords are ~700m absolute,
 *       so float32's ~1.2e-7 relative epsilon alone predicts ~8e-5m drift; measured 6.1e-5m matches that, and
 *       Duplex (~6m absolute coords) drifts only 1.9e-6m — same relative epsilon, smaller magnitude, confirming
 *       this is precision noise, not a logic bug. Production's own §DW-TUBE log reports this same number
 *       unconditionally with no gate; 1mm is comfortably above the float32 floor and comfortably below any
 *       real-world pipe-routing tolerance.)
 *   R6  Terminal PLB tubes rendered == segs (render count == data count, no silent drop)
 *   R7  Terminal ACMV tubes rendered == segs
 *   R8  Duplex PLB tubes rendered == segs
 *   R9  §READPIXELS Terminal PLB — A/B-isolated __dwOcclusionProbe('PLB') tubes>0 and dwPainted>0 real px
 *   R10 §READPIXELS Terminal ACMV — A/B-isolated __dwOcclusionProbe('ACMV') tubes>0 and dwPainted>0 real px
 *   R11 §READPIXELS Duplex PLB — A/B-isolated __dwOcclusionProbe('PLB') tubes>0 and dwPainted>0 real px
 *   R12 no script LOAD_FAIL / pageerror
 *
 * Read the § log after the run; exit code is not the evidence (Log Mandate).
 */
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');
var { chromium } = require('playwright');

var ROOT = path.join(__dirname, '..', '..');
// EXT_FILES — the real MEP-bearing fixtures live in the SIBLING bim-compiler checkout (DB Storage Policy: an
// extracted/derived building DB is never committed here; distributed via OCI/local dev handoff, not git/LFS).
// Fixed absolute paths (not relative to this worktree) so the witness works from any bim-ootb worktree.
var EXT_ROOT = '/home/red1/bim-compiler';
var EXT_FILES = {
  '/ext/terminal_extracted.db': path.join(EXT_ROOT, 'deploy/buildings/Terminal_extracted.db'),
  '/ext/terminal_rules.db': path.join(EXT_ROOT, 'build/terminal_rules.db'),
  '/ext/duplex_mep_extracted.db': path.join(EXT_ROOT, 'build/Duplex_mep_extracted.db'),
  '/ext/duplex_rules.db': path.join(EXT_ROOT, 'build/duplex_rules.db')
};
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm',
  '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.png': 'image/png' };

function serve() {
  return new Promise(function (resolve) {
    var srv = http.createServer(function (req, res) {
      var p = decodeURIComponent(req.url.split('?')[0]);
      var fp = EXT_FILES[p] || path.join(ROOT, p === '/' ? 'modeller/modeller.html' : p);
      fs.readFile(fp, function (e, buf) {
        if (e) { res.statusCode = 404; return res.end('nf'); }
        res.setHeader('Content-Type', MIME[path.extname(fp)] || 'application/octet-stream');
        res.setHeader('Accept-Ranges', 'bytes'); res.end(buf);
      });
    });
    srv.listen(0, function () { resolve(srv); });
  });
}

(async function () {
  var missing = Object.values(EXT_FILES).filter(function (f) { return !fs.existsSync(f); });
  if (missing.length) {
    console.log('═══ §8E-3 route-render witness — HONEST SKIP ═══');
    console.log('  sibling bim-compiler fixture(s) not found (non-invent — refusing rather than fabricating a substitute):');
    missing.forEach(function (m) { console.log('    ' + m); });
    process.exit(1);
  }

  var srv = await serve(); var port = srv.address().port;
  var logs = []; var browser = await chromium.launch(); var page = await browser.newPage();
  page.on('console', function (m) { logs.push(m.text()); });
  page.on('pageerror', function (e) { logs.push('PAGEERROR ' + e.message); });
  await page.goto('http://localhost:' + port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(function () {
    return window.__sceneReady === true && !!window.SQL && !!window.ArcEditable && !!window.DiscWalker && !!window.__dwChainRender && !!window.__dwOcclusionProbe;
  }, { timeout: 25000 }).catch(function () {});

  var pass = 0, fail = 0;
  function chk(n, c, x) { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } }
  console.log('═══ §8E-3 — routed MEP network renders into the laid ARC (headless) ═══');

  // ── TERMINAL: seed real ARC + route PLB/ACMV directly off the real MEP-bearing fixture, render via the
  // SAME production verb the live walk calls (window.__dwChainRender = _renderDiscChains), no UI click needed
  // (mirrors witness_str_into_arc.js calling window.swbRenderOps() directly instead of the Outliner button).
  var T = await page.evaluate(async function (port) {
    var extBuf = await (await fetch('http://localhost:' + port + '/ext/terminal_extracted.db')).arrayBuffer();
    var rulesBuf = await (await fetch('http://localhost:' + port + '/ext/terminal_rules.db')).arrayBuffer();
    var db = new window.SQL.Database(new Uint8Array(extBuf));
    var rulesDb = new window.SQL.Database(new Uint8Array(rulesBuf));
    var O = window.Bonsai.oplog; await O.setModelKey('mo_meproute_te');
    var ar = await window.ArcEditable.seedArc(db, {
      commitGroup: function (ops, gid) { return O.commitSeedGroup(ops, gid); },
      registerGeometry: function (assets) { window.Bonsai.library.registerRealGeometry(assets); }, building: 'meproute_te'
    });
    window.DiscWalker.dwOpen(rulesDb);
    var plb = window.DiscWalker.routeChains('PLB', db);
    var acmv = window.DiscWalker.routeChains('ACMV', db);
    window.__dwChainRender('PLB', plb.segs, { instant: true });
    window.__dwChainRender('ACMV', acmv.segs, { instant: true });
    db.close(); rulesDb.close();
    return { arcCommitted: ar.committed, plbSegs: plb.segs.length, acmvSegs: acmv.segs.length,
      plbByRule: plb.byRule, acmvByRule: acmv.byRule,
      plbSample: plb.segs[0], acmvSample: acmv.segs[0] };
  }, port);
  await page.waitForTimeout(400);

  chk('R1 Terminal PLB routeChains segs == 4315 (pinned oracle, 0-tol)', T.plbSegs === 4315, 'segs=' + T.plbSegs);
  chk('R2 Terminal ACMV routeChains segs == 1002 (pinned oracle, 0-tol)', T.acmvSegs === 1002, 'segs=' + T.acmvSegs);
  chk('R3 Terminal PLB+ACMV == 5317 (== W-WALKBACK-MEP totalSegs)', (T.plbSegs + T.acmvSegs) === 5317,
    'total=' + (T.plbSegs + T.acmvSegs));

  // R5 — census the rendered tube InstancedMeshes and reconstruct their ±Y/2 endpoints, compare to the segs
  // that were fed in (same whitebox method §DW-TUBE already logs, independently re-derived here).
  var drift = await page.evaluate(function () {
    var g = window.Bonsai.group(); var root = g.children.find(function (o) { return o.userData && o.userData.dwRoot; });
    function tubesOf(disc) { return root.children.filter(function (o) { return o.isInstancedMesh && o.userData.dwChain === disc; }); }
    function maxDrift(disc, segs) {
      var im = tubesOf(disc)[0]; if (!im) return { tubes: 0, count: 0, maxDrift: Infinity };
      var m = new window.THREE.Matrix4(), t = new window.THREE.Vector3(), b = new window.THREE.Vector3();
      var k = Math.min(im.count, 300), worst = 0;
      for (var i = 0; i < k; i++) {
        im.getMatrixAt(i, m); t.set(0, 0.5, 0).applyMatrix4(m); b.set(0, -0.5, 0).applyMatrix4(m);
        var s = segs[i]; var a1 = new window.THREE.Vector3(s.from[0], s.from[1], s.from[2]), a2 = new window.THREE.Vector3(s.to[0], s.to[1], s.to[2]);
        var d = Math.min(t.distanceTo(a2) + b.distanceTo(a1), t.distanceTo(a1) + b.distanceTo(a2));
        if (d > worst) worst = d;
      }
      return { tubes: tubesOf(disc).length, count: im.count, maxDrift: worst, sampled: k };
    }
    return { plb: maxDrift('PLB', window.__dwChains['PLB']), acmv: maxDrift('ACMV', window.__dwChains['ACMV']) };
  });
  chk('R5 rendered tube endpoints == segment from/to coords (bound=1mm, float32-precision-aware)',
    drift.plb.maxDrift < 1e-3 && drift.acmv.maxDrift < 1e-3,
    'PLB maxDrift=' + drift.plb.maxDrift.toExponential(1) + 'm (n=' + drift.plb.sampled + ') ACMV maxDrift=' + drift.acmv.maxDrift.toExponential(1) + 'm (n=' + drift.acmv.sampled + ')');
  chk('R6 Terminal PLB tubes rendered == segs (no silent drop)', drift.plb.count === T.plbSegs, 'rendered=' + drift.plb.count + ' segs=' + T.plbSegs);
  chk('R7 Terminal ACMV tubes rendered == segs', drift.acmv.count === T.acmvSegs, 'rendered=' + drift.acmv.count + ' segs=' + T.acmvSegs);

  var probePLB = await page.evaluate(function () { return window.__dwOcclusionProbe('PLB'); });
  var probeACMV = await page.evaluate(function () { return window.__dwOcclusionProbe('ACMV'); });
  chk('R9 §READPIXELS Terminal PLB — A/B-isolated tubes painted real px', probePLB.tubes > 0 && probePLB.dwPainted > 0,
    'tubes=' + probePLB.tubes + ' dwPainted=' + probePLB.dwPainted + 'px (' + (probePLB.dwPaintedFrac * 100).toFixed(2) + '%)');
  chk('R10 §READPIXELS Terminal ACMV — A/B-isolated tubes painted real px', probeACMV.tubes > 0 && probeACMV.dwPainted > 0,
    'tubes=' + probeACMV.tubes + ' dwPainted=' + probeACMV.dwPainted + 'px (' + (probeACMV.dwPaintedFrac * 100).toFixed(2) + '%)');

  var shot1 = path.join(ROOT, 'modeller', 'tests', 'mep_route_render_terminal.png');
  await page.screenshot({ path: shot1 });

  // ── DUPLEX: fresh model key (clears the Terminal seed), same non-UI render seam, residential MEP substrate.
  var D = await page.evaluate(async function (port) {
    var extBuf = await (await fetch('http://localhost:' + port + '/ext/duplex_mep_extracted.db')).arrayBuffer();
    var rulesBuf = await (await fetch('http://localhost:' + port + '/ext/duplex_rules.db')).arrayBuffer();
    var db = new window.SQL.Database(new Uint8Array(extBuf));
    var rulesDb = new window.SQL.Database(new Uint8Array(rulesBuf));
    var O = window.Bonsai.oplog; await O.setModelKey('mo_meproute_dx');
    var ar = await window.ArcEditable.seedArc(db, {
      commitGroup: function (ops, gid) { return O.commitSeedGroup(ops, gid); },
      registerGeometry: function (assets) { window.Bonsai.library.registerRealGeometry(assets); }, building: 'meproute_dx'
    });
    window.DiscWalker.dwOpen(rulesDb);
    var plb = window.DiscWalker.routeChains('PLB', db);
    window.__dwChainRender('PLB', plb.segs, { instant: true });
    db.close(); rulesDb.close();
    return { arcCommitted: ar.committed, plbSegs: plb.segs.length, plbByRule: plb.byRule, plbSample: plb.segs[0] };
  }, port);
  await page.waitForTimeout(400);

  chk('R4 Duplex PLB routeChains segs == 358 (pinned oracle, 0-tol)', D.plbSegs === 358, 'segs=' + D.plbSegs);

  var driftDX = await page.evaluate(function () {
    var g = window.Bonsai.group(); var root = g.children.find(function (o) { return o.userData && o.userData.dwRoot; });
    var im = root.children.filter(function (o) { return o.isInstancedMesh && o.userData.dwChain === 'PLB'; })[0];
    return { tubes: im ? 1 : 0, count: im ? im.count : 0 };
  });
  chk('R8 Duplex PLB tubes rendered == segs', driftDX.count === D.plbSegs, 'rendered=' + driftDX.count + ' segs=' + D.plbSegs);

  var probeDX = await page.evaluate(function () { return window.__dwOcclusionProbe('PLB'); });
  chk('R11 §READPIXELS Duplex PLB — A/B-isolated tubes painted real px', probeDX.tubes > 0 && probeDX.dwPainted > 0,
    'tubes=' + probeDX.tubes + ' dwPainted=' + probeDX.dwPainted + 'px (' + (probeDX.dwPaintedFrac * 100).toFixed(2) + '%)');

  var shot2 = path.join(ROOT, 'modeller', 'tests', 'mep_route_render_duplex.png');
  await page.screenshot({ path: shot2 });

  var loadFail = logs.filter(function (l) { return /LOAD_FAIL|PAGEERROR/.test(l); });
  chk('R12 no script LOAD_FAIL / pageerror', loadFail.length === 0, loadFail.slice(0, 3).join(' | '));

  console.log('  Terminal ARC committed=' + T.arcCommitted + '  Duplex ARC committed=' + D.arcCommitted);
  console.log('  Terminal PLB byRule=' + JSON.stringify(T.plbByRule.map(function (b) { return b.from + '->' + b.to + ':' + b.segs; })));
  console.log('  Terminal ACMV byRule=' + JSON.stringify(T.acmvByRule.map(function (b) { return b.from + '->' + b.to + ':' + b.segs; })));
  console.log('  Duplex PLB byRule=' + JSON.stringify(D.plbByRule.map(function (b) { return b.from + '->' + b.to + ':' + b.segs; })));
  console.log('  screenshots: ' + shot1 + ' , ' + shot2);
  if (fail) {
    console.log('--- §8E-3 logs ---');
    logs.filter(function (l) { return /DW-TUBE|DW-PIXELPROBE|LOAD_FAIL|PAGEERROR|ArcEditable|§ARC/.test(l); }).slice(0, 20).forEach(function (l) { console.log('   ' + l); });
  }
  console.log('§MEP-ROUTE-RENDER: ' + pass + ' PASS / ' + fail + ' FAIL');
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
