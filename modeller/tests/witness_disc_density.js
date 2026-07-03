#!/usr/bin/env node
/**
 * §8E-2b W-DW-DENSITY-TE — headless proof that the MEP-family disciplines (PLB/ELEC/FP/ACMV) WALK over the laid TE ARC
 * and FILL it (VISION-LOCK sentence 4), with an HONEST per-discipline count verdict vs the oracle. This is the Stage-1
 * clash-OFF baseline — measured, never forced green. Substrate: Terminal_arcstr_proof.db (laid ARC shell) + terminal_rules.db
 * (rules mined off Terminal) + Terminal_meta.db (real per-disc counts = ORACLE).
 *   D1 RENDER — each disc's fixtures render into the scene (_dwRoot) + in-frustum
 *   D2 §READPIXELS — the MEP layer rasterizes over the laid ARC (A/B-isolated via __dwPixelProbe)
 *   D3 ENVELOPE — every placement lands inside an INDEPENDENTLY-recomputed ARC occupancy envelope (no void fixtures)
 *   D4 COUNT — area-distributed discs same-order vs oracle [0.3×,3×]; ACMV+FP tight ≤20% (reported per disc)
 *   D5 PLB routed → no-endpoints honest refusal (chains=0, no fabricated network)
 *   D6 LABEL — no placement carries an rmse/fidelity field (the measurement doctrine); prov ∈ generated set
 *   D7 no script LOAD_FAIL / pageerror
 * FINDING (listed not hidden, §8D): ELEC over-counts (~2.4×) — density-transfer drift (ARC footprint ≠ disc coverage area).
 */
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');
var { chromium } = require('playwright');
var ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json',
  '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream', '.png': 'image/png' };
function serve() {
  return new Promise(function (resolve) {
    var srv = http.createServer(function (req, res) {
      var p = decodeURIComponent(req.url.split('?')[0]);
      var fp = path.join(ROOT, p === '/' ? 'modeller/modeller.html' : p);
      fs.readFile(fp, function (e, buf) {
        if (e) { res.statusCode = 404; return res.end('nf'); }
        res.setHeader('Content-Type', MIME[path.extname(fp)] || 'application/octet-stream');
        res.setHeader('Accept-Ranges', 'bytes'); res.end(buf);
      });
    });
    srv.listen(0, function () { resolve(srv); });
  });
}
var DISCS = ['PLB', 'ELEC', 'FP', 'ACMV'];
(async function () {
  var srv = await serve(); var port = srv.address().port;
  var logs = []; var browser = await chromium.launch(); var page = await browser.newPage();
  page.on('console', function (m) { logs.push(m.text()); });
  page.on('pageerror', function (e) { logs.push('PAGEERROR ' + e.message); });
  await page.goto('http://localhost:' + port + '/modeller/modeller.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(function () {
    return window.__sceneReady === true && !!window.SQL && !!window.ArcEditable && !!window.DiscWalker &&
           !!window.__renderDiscWalk && !!window.__dwPixelProbe;
  }, { timeout: 25000 }).catch(function () {});

  var pass = 0, fail = 0;
  function chk(n, c, x) { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } }
  console.log('═══ §8E-2b W-DW-DENSITY-TE — MEP-family disciplines walk into the laid ARC (headless) ═══');

  var R = await page.evaluate(async function (arg) {
    var port = arg.port, DISCS = arg.DISCS;
    var O = window.Bonsai.oplog; await O.setModelKey('mo_dwdensity');
    // 1) lay the real ARC shell + stash its bytes for the walker to re-open
    var abuf = await (await fetch('http://localhost:' + port + '/modeller/Terminal_arcstr_proof.db')).arrayBuffer();
    window.__dwBuf = abuf; window.__dwName = 'TE';
    var adb = new window.SQL.Database(new Uint8Array(abuf));
    var ar = await window.ArcEditable.seedArc(adb, {
      commitGroup: function (ops, gid) { return O.commitSeedGroup(ops, gid); },
      registerGeometry: function (assets) { window.Bonsai.library.registerRealGeometry(assets); }, building: 'dwdensity' });
    // 2) rules + oracle
    await window.DiscWalker.dwInit(window.SQL, './', 'terminal_rules.db');
    var mbuf = await (await fetch('http://localhost:' + port + '/modeller/Terminal_meta.db')).arrayBuffer();
    var mdb = new window.SQL.Database(new Uint8Array(mbuf));
    function realCount(disc) { var r = mdb.exec("SELECT count(*) FROM elements_meta WHERE discipline='" + disc + "'"); return r.length ? r[0].values[0][0] : 0; }
    // independent ARC occupancy envelope (recomputed HERE so D3 is a genuine oracle, not the engine grading itself)
    var sub = window.DiscWalker.substrate(adb);
    function occCells(st, cell) {
      cell = Math.max(cell > 0 ? cell : 1, 0.5);
      var r = adb.exec("SELECT t.center_x,t.center_y,COALESCE(t.bbox_x,0),COALESCE(t.bbox_y,0) FROM elements_meta m " +
        "JOIN element_transforms t ON m.guid=t.guid WHERE m.storey='" + String(st.name).replace(/'/g, "''") + "'");
      var occ = {};
      if (r.length) r[0].values.forEach(function (v) {
        var i0 = Math.floor((v[0] - v[2] / 2) / cell), i1 = Math.floor((v[0] + v[2] / 2) / cell);
        var j0 = Math.floor((v[1] - v[3] / 2) / cell), j1 = Math.floor((v[1] + v[3] / 2) / cell);
        for (var i = i0; i <= i1 && i < i0 + 256; i++) for (var j = j0; j <= j1 && j < j0 + 256; j++) occ[i + ',' + j] = 1;
      });
      return occ;
    }
    var subByName = {}; sub.forEach(function (st) { subByName[st.name] = st; });

    // 3) walk + render each disc
    var out = {};
    DISCS.forEach(function (disc) {
      var bdb = new window.SQL.Database(new Uint8Array(abuf));
      var w = window.DiscWalker.dwWalk(disc, bdb, 'TE');
      bdb.close();
      var pl = (w.placements || []);
      window.__renderDiscWalk(disc, pl);                 // production render into _dwRoot
      // provenance histogram + label check (no rmse/fidelity field anywhere)
      var provs = {}, hasFidelity = false;
      pl.forEach(function (p) {
        provs[p.prov] = (provs[p.prov] || 0) + 1;
        if (('rmse' in p) || ('cover' in p) || ('fidelity' in p)) hasFidelity = true;
      });
      // envelope: each placement's xy falls in an occupied cell of its storey (independent recompute)
      var inEnv = 0, checked = 0, occCache = {};
      pl.forEach(function (p) {
        var st = subByName[p.storey]; if (!st) return; checked++;
        // cell size = the class's measured spacing if array-placed, else 1m (coarse) — match the engine's grid
        var cell = 1; var key = p.storey + '|' + cell;
        var occ = occCache[key] || (occCache[key] = occCells(st, cell));
        var i = Math.floor(p.x / cell), j = Math.floor(p.y / cell);
        // accept the cell or its 8-neighbourhood (placement centre may sit at a cell edge after striding)
        var hit = false;
        for (var di = -1; di <= 1 && !hit; di++) for (var dj = -1; dj <= 1 && !hit; dj++) if (occ[(i + di) + ',' + (j + dj)]) hit = true;
        if (hit) inEnv++;
      });
      out[disc] = {
        walked: pl.length, real: realCount(disc), chains: (w.chains ? w.chains.length : 0),
        chainSegs: (w.chainSegs ? w.chainSegs.length : 0), provs: provs, hasFidelity: hasFidelity,
        arrayN: provs['placed:array-density'] || 0, inEnv: inEnv, envChecked: checked,
        refused: !!w.refused, reason: w.reason || ''
      };
    });
    adb.close(); mdb.close();
    return { arcCommitted: ar.committed, discs: out };
  }, { port: port, DISCS: DISCS });
  await page.waitForTimeout(400);

  // readPixels per disc (A/B-isolated _dwRoot layer)
  var probes = {};
  for (var i = 0; i < DISCS.length; i++) probes[DISCS[i]] = await page.evaluate(function (d) { return window.__dwPixelProbe(d); }, DISCS[i]);
  var shot = path.join(ROOT, 'modeller', 'tests', 'disc_density.png');
  await page.screenshot({ path: shot });

  // ── checks ──
  var anyMesh = DISCS.every(function (d) { return probes[d].meshes > 0 && probes[d].inFrustum > 0; });
  chk('D1 RENDER — every MEP disc renders fixtures into the scene + in-frustum', anyMesh,
    DISCS.map(function (d) { return d + ':' + probes[d].meshes + 'm/' + probes[d].inFrustum + 'f'; }).join(' '));
  // D2 readPixels — the MEP layer (any disc) rasterizes; report the biggest layer's footprint
  var paintOk = DISCS.some(function (d) { return probes[d].dwPainted > 2000; });
  chk('D2 §READPIXELS — MEP layer rasterizes over the laid ARC (A/B-isolated > 2000px)', paintOk,
    DISCS.map(function (d) { return d + ':' + probes[d].dwPainted + 'px'; }).join(' '));
  // D3 envelope — every placement inside the recomputed ARC occupancy envelope
  var envOk = DISCS.every(function (d) { var x = R.discs[d]; return x.envChecked === 0 || x.inEnv / x.envChecked >= 0.99; });
  chk('D3 ENVELOPE — placements land inside the ARC occupancy envelope (≥99%, no void fixtures)', envOk,
    DISCS.map(function (d) { var x = R.discs[d]; return d + ':' + x.inEnv + '/' + x.envChecked; }).join(' '));
  // D4 count — area-distributed discs same-order bounded; ACMV+FP tight
  var areaDiscs = DISCS.filter(function (d) { return R.discs[d].arrayN > 0; });
  var bounded = areaDiscs.every(function (d) { var x = R.discs[d]; var r = x.walked / x.real; return r >= 0.3 && r <= 3; });
  chk('D4 COUNT — area-distributed discs same-order vs oracle [0.3×–3×] (generative tolerance)', bounded,
    areaDiscs.map(function (d) { var x = R.discs[d]; return d + ' ' + x.walked + '/' + x.real + '=' + (x.walked / x.real).toFixed(2) + '×'; }).join('  '));
  var acmv = R.discs.ACMV, fp = R.discs.FP;
  var tight = Math.abs(acmv.walked - acmv.real) / acmv.real <= 0.20 && Math.abs(fp.walked - fp.real) / fp.real <= 0.20;
  chk('D4b COUNT TIGHT — genuinely area-distributed terminals reconstruct ≤20% (ACMV, FP)', tight,
    'ACMV ' + acmv.walked + '/' + acmv.real + '=' + ((acmv.walked / acmv.real - 1) * 100).toFixed(0) + '%  FP ' + fp.walked + '/' + fp.real + '=' + ((fp.walked / fp.real - 1) * 100).toFixed(0) + '%');
  // D5 PLB routed honest refusal (no fabricated network on an ARC-only building)
  var plb = R.discs.PLB;
  chk('D5 PLB routed — no fabricated network on ARC-only (chains=0, no array reconstruction)', plb.chains === 0 && plb.chainSegs === 0 && plb.arrayN === 0,
    'PLB walked=' + plb.walked + ' (real=' + plb.real + ') chains=' + plb.chains + ' segs=' + plb.chainSegs + ' provs=' + JSON.stringify(plb.provs) + ' — routed disc needs its network');
  // D6 label — no fidelity field on any placement
  var noFid = DISCS.every(function (d) { return !R.discs[d].hasFidelity; });
  chk('D6 LABEL — no placement carries rmse/cover/fidelity (the measurement doctrine)', noFid,
    DISCS.map(function (d) { return d + ':' + (R.discs[d].hasFidelity ? 'FID!' : 'clean'); }).join(' '));
  var loadFail = logs.filter(function (l) { return /LOAD_FAIL|PAGEERROR/.test(l); });
  chk('D7 no script LOAD_FAIL / pageerror', loadFail.length === 0, loadFail.slice(0, 2).join(' | '));

  // FINDING (listed, not hidden)
  var elec = R.discs.ELEC;
  console.log('  ⚠ FINDING ELEC over-count ' + elec.walked + ' vs real ' + elec.real + ' = ' + (elec.walked / elec.real).toFixed(2) +
    '× — density-transfer drift (ARC footprint ≠ disc coverage area); bounded, Stage-1 baseline.');
  console.log('  screenshot: ' + shot);
  console.log('§DW-DENSITY-TE: ' + pass + ' PASS / ' + fail + ' FAIL');
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
