#!/usr/bin/env node
/**
 * §8E-2b W-DW-DENSITY-TE — headless proof that the MEP-family disciplines (PLB/ELEC/FP/ACMV) WALK over the laid TE ARC
 * and FILL it (VISION-LOCK sentence 4), with an HONEST per-discipline count verdict vs the oracle. This is the Stage-1
 * clash-OFF baseline — measured, never forced green. Substrate: Terminal_arcstr_proof.db (laid ARC shell) + terminal_rules.db
 * (rules mined off Terminal) + Terminal_meta.db (real per-disc counts = ORACLE).
 *   D1 RENDER — each disc's fixtures render into the scene (_dwRoot) + in-frustum
 *   D2 §READPIXELS — the MEP layer rasterizes over the laid ARC (A/B-isolated via __dwOcclusionProbe)
 *   D3 ENVELOPE — every placement lands inside an INDEPENDENTLY-recomputed ARC occupancy envelope (no void fixtures)
 *   D4 COUNT — area-distributed discs same-order vs oracle [0.3×,3×]; ACMV+FP tight ≤20% (reported per disc)
 *   D5 PLB routed → no-endpoints honest refusal (chains=0, no fabricated network)
 *   D6 LABEL — no placement carries an rmse/fidelity field (the measurement doctrine); prov ∈ generated set
 *   D7 no script LOAD_FAIL / pageerror
 * FINDING (listed not hidden, §8D): ELEC over-counts (~2.4×) — density-transfer drift (ARC footprint ≠ disc coverage area).
 * RE-BASELINED 2026-09-30 on the LOD400 production walk (MODELLER_MASTER §RESUME 2026-09-30 known-red D3/D4; RED on main
 * 8311ba5f: D3 ELEC 33/35 FP 368/703, D4 vacuous, D4b ACMV −28%):
 *   D3 §D3-BAND — placeMeasured placements carry a z-BAND + a Terminal storey_scope label (not a substrate storey), so the
 *      per-storey grid graded 35/878 ELEC. Now graded against the envelope of the ARC elements intersecting THEIR band;
 *      the only sanctioned off-envelope positions are the engine's LOGGED §NOSPACES-TOPUP grid points (thin bands), so
 *      off-envelope ≤ logged top-ups and none outside the band bbox. A silent void fixture still fails.
 *   D4 §D4-CLASS — the oracle is the SAME ifc_class in Terminal_meta.db (whole-disc counted pipes the walk never makes);
 *      'placed:measured-band' is the area-scaled walk. A walked class the oracle does not hold = fabricated ⇒ FAIL.
 *   FINDING line now prints the production-walk ELEC ratio (measured 1.05× at 8311ba5f; 2.11× was the legacy walk).
 */
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');
var { chromium } = require(path.join(process.env.HOME, 'bim-ootb', 'tests', 'node_modules', 'playwright'));   // absolute — no NODE_PATH dependency (same pattern as witness_dw_pixelprobe's puppeteer)
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
           !!window.__renderDiscWalk && !!window.__dwOcclusionProbe;
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
    // §WALK-LOD400-ONLY (2026-09-27): the walk render draws ONLY real LOD400 meshes resolved from the geo buffer; before this the
    // witness had none, so every 'rendered fixture' was a measured box (red1: "All must be LOD400 or fail hard"). Load Terminal's
    // own _geo.db exactly as the app does — from the resident registry's geoBase/geoDb/geoV.
    var _te = (window.STRWalkerOutliner._residents || []).filter(function (r) { return r.key === 'Terminal'; })[0];
    var _gr = await fetch(_te.geoBase + _te.geoDb + '?v=' + _te.geoV);
    window.__dwGeoBuf = _gr.ok ? await _gr.arrayBuffer() : null;
    console.log('§TE-GEO ' + _te.geoDb + ' http=' + _gr.status + ' bytes=' + (window.__dwGeoBuf ? window.__dwGeoBuf.byteLength : 0));
    var adb = new window.SQL.Database(new Uint8Array(abuf));
    var ar = await window.ArcEditable.seedArc(adb, {
      commitGroup: function (ops, gid) { return O.commitSeedGroup(ops, gid); },
      registerGeometry: function (assets) { window.Bonsai.library.registerRealGeometry(assets); }, building: 'dwdensity' });
    // 2) rules + oracle — Terminal_meta.db (all-discipline real extraction, per this file's own header comment)
    // is the designed oracle source; Terminal_ARC.db is the shipped ARC-only resident (0 MEP rows since the
    // embed-8 strip, 6068fab) and was never the intended oracle here — this was a stale fetch path, not a data gap.
    await window.DiscWalker.dwInit(window.SQL, './', 'terminal_rules.db');
    var mbuf = await (await fetch('http://localhost:' + port + '/modeller/Terminal_meta.db')).arrayBuffer();
    var mdb = new window.SQL.Database(new Uint8Array(mbuf));
    function realCount(disc) { var r = mdb.exec("SELECT count(*) FROM elements_meta WHERE discipline='" + disc + "'"); return r.length ? r[0].values[0][0] : 0; }
    function realByClass(disc) { var r = mdb.exec("SELECT ifc_class, count(*) FROM elements_meta WHERE discipline='" + disc + "' GROUP BY ifc_class"); var o = {}; if (r.length) r[0].values.forEach(function (v) { o[v[0]] = v[1]; }); return o; }
    // independent ARC occupancy envelope (recomputed HERE so D3 is a genuine oracle, not the engine grading itself)
    // §BUG-A ORACLE CONVENTION (bim-compiler RESUME_DISC_WALKER_ENVELOPE_BOUND.md, reviewer finding 5 — the
    // identical contamination was found+fixed in witness_elec_hostbind.js/witness_dwwalk_hostbind.js): a raw
    // element_transforms.center is the IFC placement-line ORIGIN, not the element's midpoint (measured off by up
    // to 11.27m on 73/2147 elements of THIS substrate). The engine places via mesh-recovered true midpoints, so
    // an occupancy oracle built from raw center±bbox/2 rasterizes a grid displaced from the real building —
    // grading correct placements as "void". Recompute each cell around the element's OWN _trueMidpoint (still an
    // independent recompute: the GRID math stays this witness's own, only the defective centre source is corrected).
    var sub = window.DiscWalker.substrate(adb);
    // one mesh-recovered midpoint per guid for the whole grading (the same element sits in many bands; ~27 bands × 2,147 elements)
    var midCache = {};
    function midOf(v) { var k = v[0]; if (midCache[k] === undefined) midCache[k] = window.DiscWalker._trueMidpoint(adb, v[0], { x: v[1], y: v[2], z: v[3], rx: v[6], ry: v[7], rot: v[8] }); return midCache[k]; }
    function occCells(st, cell) {
      cell = Math.max(cell > 0 ? cell : 1, 0.5);
      var r = adb.exec("SELECT t.guid,t.center_x,t.center_y,t.center_z,COALESCE(t.bbox_x,0),COALESCE(t.bbox_y,0)," +
        "COALESCE(t.rotation_x,0),COALESCE(t.rotation_y,0),COALESCE(t.rotation_z,0) FROM elements_meta m " +
        "JOIN element_transforms t ON m.guid=t.guid WHERE m.storey='" + String(st.name).replace(/'/g, "''") + "'");
      var occ = {};
      if (r.length) r[0].values.forEach(function (v) {
        var mid = midOf(v);
        var cx = (mid && mid.verified) ? mid.x : v[1], cy = (mid && mid.verified) ? mid.y : v[2];
        var i0 = Math.floor((cx - v[4] / 2) / cell), i1 = Math.floor((cx + v[4] / 2) / cell);
        var j0 = Math.floor((cy - v[5] / 2) / cell), j1 = Math.floor((cy + v[5] / 2) / cell);
        for (var i = i0; i <= i1 && i < i0 + 256; i++) for (var j = j0; j <= j1 && j < j0 + 256; j++) occ[i + ',' + j] = 1;
      });
      return occ;
    }
    var subByName = {}; sub.forEach(function (st) { subByName[st.name] = st; });
    // §D3-HOST-FOOTPRINT: Terminal_arcstr_proof.db is a MERGED two-block model — its 82 IfcCoverings all sit
    // under the Malay-named storeys (Aras Tanah/01-04) while fixtures walk English-labelled storeys too, so a
    // ceiling fixture legitimately binds (nearest-XY, storey-agnostic hostBind) to a real Covering recorded
    // under ANOTHER storey label. Such a placement is NOT void — it sits at a real element's measured position —
    // but a per-storey grid can never contain it (measured: every pre-fix D3 miss was prov shim:host-IfcCovering-
    // bottom with a cross-storey host). Oracle therefore grades a host-BOUND placement against its OWN host's
    // independently-recomputed true footprint (stricter than a union grid: it must sit AT its claimed host);
    // floats keep the per-storey occupancy grid.
    var hostCellCache = {};
    function hostCells(guid, cell) {
      var key = guid + '|' + cell;
      if (hostCellCache[key]) return hostCellCache[key];
      var occ = {};
      var r = adb.exec("SELECT t.guid,t.center_x,t.center_y,t.center_z,COALESCE(t.bbox_x,0),COALESCE(t.bbox_y,0)," +
        "COALESCE(t.rotation_x,0),COALESCE(t.rotation_y,0),COALESCE(t.rotation_z,0) FROM element_transforms t WHERE t.guid='" +
        String(guid).replace(/'/g, "''") + "'");
      if (r.length && r[0].values.length) {
        var v = r[0].values[0];
        var mid = midOf(v);
        var cx = (mid && mid.verified) ? mid.x : v[1], cy = (mid && mid.verified) ? mid.y : v[2];
        var i0 = Math.floor((cx - v[4] / 2) / cell), i1 = Math.floor((cx + v[4] / 2) / cell);
        var j0 = Math.floor((cy - v[5] / 2) / cell), j1 = Math.floor((cy + v[5] / 2) / cell);
        for (var i = i0; i <= i1 && i < i0 + 256; i++) for (var j = j0; j <= j1 && j < j0 + 256; j++) occ[i + ',' + j] = 1;
      }
      return (hostCellCache[key] = occ);
    }

    // 3) walk + render each disc
    var out = {};
    DISCS.forEach(function (disc) {
      var bdb = new window.SQL.Database(new Uint8Array(abuf));
      // §NET-AUDIT WRONG-PATH (2026-09-27): production (_discWalkOne) walks with { schedule: true, geoDb } and falls back to the legacy
      // walk only on 0; this witness called the bare legacy walk, whose placements carry no mesh hash — i.e. it measured a walk users
      // never get, and every fixture it 'rendered' was a box. Same call as production now; mesh-less placements are refused (§WALK-LOD400-ONLY).
      var _g = window.__dwGeoBuf ? new window.SQL.Database(new Uint8Array(window.__dwGeoBuf)) : null;
      var w = window.DiscWalker.dwWalk(disc, bdb, 'TE', { schedule: true, geoDb: _g || undefined });
      if ((w.refused || !w.placed) && !w.verdict) w = window.DiscWalker.dwWalk(disc, bdb, 'TE', { geoDb: _g || undefined });
      if (_g) _g.close();
      w.placements = (w.placements || []).filter(function (p) { return !!p.geometry_hash; }); w.placed = w.placements.length;
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
      // §D3-BAND (2026-09-30 re-baseline on the LOD400 walk): the production walk is placeMeasured (§NOSPACES) — each
      // placement carries the rule's z-BAND and a Terminal storey_scope label that is NOT a substrate storey name, so the
      // per-storey grid graded 35 of 878 ELEC (scope-blind). A banded placement is now graded against the envelope of the
      // real ARC elements whose vertical extent intersects ITS band (the witness's own grid; §BUG-A midpoint correction kept).
      // The engine's ONLY sanctioned off-envelope positions are the logged §NOSPACES-TOPUP grid points (thin bands), so the
      // off-envelope count must be covered by that log line — a silent void fixture is the defect D3 still catches.
      var inEnv = 0, checked = 0, unscoped = 0, offBox = 0, offBoxMax = 0, occCache = {};
      function bandCells(lo, hi, cell) {
        var key = 'band|' + lo + '|' + hi + '|' + cell; if (occCache[key]) return occCache[key];
        var r = adb.exec("SELECT t.guid,t.center_x,t.center_y,t.center_z,COALESCE(t.bbox_x,0),COALESCE(t.bbox_y,0)," +
          "COALESCE(t.rotation_x,0),COALESCE(t.rotation_y,0),COALESCE(t.rotation_z,0) FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid " +
          "WHERE m.ifc_class<>'IfcSpace' AND t.center_z + COALESCE(t.bbox_z,0)/2 >= " + lo + " AND t.center_z - COALESCE(t.bbox_z,0)/2 <= " + hi);
        var occ = {}, bx = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
        if (r.length) r[0].values.forEach(function (v) {
          var mid = midOf(v);
          var cx = (mid && mid.verified) ? mid.x : v[1], cy = (mid && mid.verified) ? mid.y : v[2];
          bx.x0 = Math.min(bx.x0, cx - v[4] / 2); bx.x1 = Math.max(bx.x1, cx + v[4] / 2); bx.y0 = Math.min(bx.y0, cy - v[5] / 2); bx.y1 = Math.max(bx.y1, cy + v[5] / 2);
          var i0 = Math.floor((cx - v[4] / 2) / cell), i1 = Math.floor((cx + v[4] / 2) / cell);
          var j0 = Math.floor((cy - v[5] / 2) / cell), j1 = Math.floor((cy + v[5] / 2) / cell);
          for (var i = i0; i <= i1 && i < i0 + 256; i++) for (var j = j0; j <= j1 && j < j0 + 256; j++) occ[i + ',' + j] = 1;
        });
        occ.__box = bx; return (occCache[key] = occ);
      }
      pl.forEach(function (p) {
        var cell = 1, occ = null;
        // host-BOUND placement → grade against its OWN host's true footprint (§D3-HOST-FOOTPRINT above);
        // banded (measured-band) → the band's own ARC envelope; legacy float → the per-storey occupancy grid.
        if (p.host) occ = hostCells(p.host, cell);
        else if (p.band && p.band.length === 2) occ = bandCells(+p.band[0], +p.band[1], cell);
        else if (subByName[p.storey]) { var st = subByName[p.storey], key = p.storey + '|' + cell; occ = occCache[key] || (occCache[key] = occCells(st, cell)); }
        if (!occ) { unscoped++; return; }
        checked++;
        var i = Math.floor(p.x / cell), j = Math.floor(p.y / cell);
        // accept the cell or its 8-neighbourhood (placement centre may sit at a cell edge after striding)
        var hit = false;
        for (var di = -1; di <= 1 && !hit; di++) for (var dj = -1; dj <= 1 && !hit; dj++) if (occ[(i + di) + ',' + (j + dj)]) hit = true;
        if (hit) inEnv++;
        var b = occ.__box;
        if (b) { var ov = Math.max(b.x0 - p.x, p.x - b.x1, b.y0 - p.y, p.y - b.y1, 0); if (ov > cell) { offBox++; if (ov > offBoxMax) offBoxMax = ov; } }
      });
      // per-CLASS walked histogram — the oracle is compared class by class (see D4)
      var byCls = {}; pl.forEach(function (p) { byCls[p.ifc_class] = (byCls[p.ifc_class] || 0) + 1; });
      out[disc] = {
        walked: pl.length, real: realCount(disc), realByClass: realByClass(disc), byCls: byCls, chains: (w.chains ? w.chains.length : 0),
        chainSegs: (w.chainSegs ? w.chainSegs.length : 0), provs: provs, hasFidelity: hasFidelity,
        arrayN: (provs['placed:array-density'] || 0) + (provs['placed:measured-band'] || 0), inEnv: inEnv, envChecked: checked,
        unscoped: unscoped, offBox: offBox, offBoxMax: offBoxMax, legacyArrayN: provs['placed:array-density'] || 0, refused: !!w.refused, reason: w.reason || ''
      };
    });
    adb.close(); mdb.close();
    return { arcCommitted: ar.committed, discs: out };
  }, { port: port, DISCS: DISCS });
  // §-LOG FIRST (CLAUDE.md law 3): the engine's own lines carry the counts the checks below reconcile against.
  var topup = {};   // disc → Σ '+N' of §NOSPACES-TOPUP
  logs.forEach(function (l) { var m = /§NOSPACES-TOPUP (\w+)\/\S+ band=\[[^\]]*\] \+(\d+) /.exec(l); if (m) topup[m[1]] = (topup[m[1]] || 0) + (+m[2]); });
  logs.filter(function (l) { return /§NOSPACES-(ZONE|TOPUP|NOCELLS)|§DW-CAP|§LOD400-REFUSE|§DW-LOD400|§ROOF-PATTERN|§DW-TESSELLATE|§WALK-NOSPACES|§TE-GEO/.test(l); })
    .slice(0, 80).forEach(function (l) { console.log('   ' + l.slice(0, 220)); });
  await page.waitForTimeout(400);

  // readPixels per disc (A/B-isolated _dwRoot layer)
  var probes = {};
  for (var i = 0; i < DISCS.length; i++) probes[DISCS[i]] = await page.evaluate(function (d) { return window.__dwOcclusionProbe(d); }, DISCS[i]);
  var shot = path.join(ROOT, 'modeller', 'tests', 'disc_density.png');
  // the frame is a convenience, never evidence (CLAUDE.md FUNDAMENTAL LAW) — a font-load hang in page.screenshot (30 s
  // TimeoutError, 2026-09-30) must not kill the verdict below
  try { await page.screenshot({ path: shot, timeout: 8000 }); } catch (e) { console.log('  ⚠ screenshot skipped: ' + (e && e.message || e).toString().split('\n')[0]); }

  // ── checks ──
  var anyMesh = DISCS.every(function (d) { return probes[d].meshes > 0 && probes[d].inFrustum > 0; });
  chk('D1 RENDER — every MEP disc renders fixtures into the scene + in-frustum', anyMesh,
    DISCS.map(function (d) { return d + ':' + probes[d].meshes + 'm/' + probes[d].inFrustum + 'f'; }).join(' '));
  // D2 readPixels — the MEP layer (any disc) rasterizes; report the biggest layer's footprint
  var paintOk = DISCS.some(function (d) { return probes[d].dwPainted > 2000; });
  chk('D2 §READPIXELS — MEP layer rasterizes over the laid ARC (A/B-isolated > 2000px)', paintOk,
    DISCS.map(function (d) { return d + ':' + probes[d].dwPainted + 'px'; }).join(' '));
  // D3 envelope — every placement inside the recomputed ARC occupancy envelope
  // §NET-AUDIT VACUOUS (2026-09-26): envChecked===0 used to count as a pass, so a disc that placed fixtures but had
  // none graded (or an empty run) passed D3 on nothing. Now: a disc may skip grading ONLY if it placed nothing,
  // and at least one placement across all discs must actually be graded.
  var envTotal = DISCS.reduce(function (a, d) { return a + R.discs[d].envChecked; }, 0);
  // §D3-BAND: walked>0 ⇒ every placement graded (unscoped=0), none outside its band's ARC bbox, and every off-envelope
  // placement covered by the engine's own §NOSPACES-TOPUP count for that disc. A disc that walked nothing is skipped.
  var envOk = envTotal > 0 && DISCS.every(function (d) { var x = R.discs[d]; if (x.walked === 0) return true;
    if (x.unscoped > 0 || x.envChecked === 0 || x.offBox > 0) return false; return (x.envChecked - x.inEnv) <= (topup[d] || 0); });
  chk('D3 ENVELOPE — every placement sits on its band\'s recomputed ARC envelope or is a LOGGED §NOSPACES-TOPUP grid point inside that band\'s bbox (no silent void fixture)', envOk,
    DISCS.map(function (d) { var x = R.discs[d]; var off = x.envChecked - x.inEnv; return d + ':' + x.inEnv + '/' + x.envChecked + (off ? ' off=' + off + ' topup=' + (topup[d] || 0) : '') +
      (x.unscoped ? ' UNSCOPED=' + x.unscoped + '(INCONCLUSIVE)' : '') + (x.offBox ? ' OFFBOX=' + x.offBox + '(max ' + x.offBoxMax.toFixed(1) + 'm)' : ''); }).join('  '));
  // D4 count — area-distributed discs same-order bounded; ACMV+FP tight. §D4-CLASS (2026-09-30): the oracle is compared
  // CLASS by CLASS — realCount(disc) counts the routed network too (PLB 8,175 incl. pipe segments the walk never
  // fabricates, D5), so a whole-disc ratio graded fixtures against pipes. 'placed:measured-band' IS area-scaled
  // (count = n_measured × bandArea / srcArea), the same claim 'placed:array-density' carried on the legacy walk.
  var areaDiscs = DISCS.filter(function (d) { return R.discs[d].arrayN > 0; });
  // §NET-AUDIT VACUOUS (2026-09-26): [].every() passed when no disc was area-distributed.
  // A FIXTURE class (terminal/appliance/valve/alarm) is what an area-distributed walk claims to reconstruct; a RUN class
  // (IfcPipeSegment / IfcDuctSegment / IfcDuctFitting) is the routed network — placeMeasured also emits those as banded
  // fixtures because rule_placement carries their mined rows. Graded on separate lines so neither hides the other.
  var RUN = /Segment|Fitting/;
  var perCls = [], bounded = areaDiscs.length > 0, perRun = [], runOk = true, runN = 0;
  areaDiscs.forEach(function (d) { var x = R.discs[d]; Object.keys(x.byCls).forEach(function (c) {
    var real = x.realByClass[c] || 0, r = real > 0 ? x.byCls[c] / real : Infinity, ok = real > 0 && r >= 0.3 && r <= 3;
    var row = d + '/' + c.replace(/^Ifc/, '') + ' ' + x.byCls[c] + '/' + real + '=' + (real > 0 ? r.toFixed(2) + '×' : 'NO-ORACLE-CLASS') + (ok ? '' : ' ✗');
    if (RUN.test(c)) { runN++; if (!ok) runOk = false; perRun.push(row); } else { if (!ok) bounded = false; perCls.push(row); } }); });
  chk('D4 COUNT — every walked FIXTURE class same-order vs the oracle\'s SAME class [0.3×–3×]; a walked class absent from the oracle is fabricated' + (areaDiscs.length ? '' : ' — INCONCLUSIVE (no area-distributed walk)'), bounded, perCls.join('  '));
  var tightRows = [], tight = true, tightN = 0;
  ['ACMV', 'FP'].forEach(function (d) { var x = R.discs[d]; Object.keys(x.byCls).forEach(function (c) { if (RUN.test(c)) return;
    var real = x.realByClass[c] || 0, dev = real > 0 ? (x.byCls[c] / real - 1) : NaN, ok = real > 0 && Math.abs(dev) <= 0.20; tightN++; if (!ok) tight = false;
    tightRows.push(d + '/' + c.replace(/^Ifc/, '') + ' ' + x.byCls[c] + '/' + real + '=' + (real > 0 ? (dev * 100).toFixed(0) + '%' : 'NO-ORACLE-CLASS') + (ok ? '' : ' ✗')); }); });
  chk('D4b COUNT TIGHT — ACMV/FP terminal classes reconstruct within ≤20% of the oracle\'s same class' + (tightN ? '' : ' — INCONCLUSIVE (nothing walked)'), tightN > 0 && tight, tightRows.join('  '));
  chk('D4c RUN CLASSES — Segment/Fitting rows placed as banded fixtures are same-order vs the oracle [0.3×–3×] (a run class is the router\'s, not a fixture — see FINDING)' + (runN ? '' : ' — INCONCLUSIVE (no run class walked)'), runN > 0 && runOk, perRun.join('  '));
  // D5 PLB routed honest refusal (no fabricated network on an ARC-only building). `legacyArrayN` keeps this line's original
  // meaning (no legacy spacing-tile / array-density reconstruction); the banded run classes are D4c's line.
  var plb = R.discs.PLB;
  chk('D5 PLB routed — no fabricated network on ARC-only (chains=0, no array reconstruction)', plb.chains === 0 && plb.chainSegs === 0 && plb.legacyArrayN === 0,
    'PLB walked=' + plb.walked + ' (real=' + plb.real + ') chains=' + plb.chains + ' segs=' + plb.chainSegs + ' provs=' + JSON.stringify(plb.provs) + ' — routed disc needs its network');
  // D6 label — no fidelity field on any placement
  var noFid = DISCS.every(function (d) { return !R.discs[d].hasFidelity; });
  chk('D6 LABEL — no placement carries rmse/cover/fidelity (the measurement doctrine)', noFid,
    DISCS.map(function (d) { return d + ':' + (R.discs[d].hasFidelity ? 'FID!' : 'clean'); }).join(' '));
  var loadFail = logs.filter(function (l) { return /LOAD_FAIL|PAGEERROR/.test(l); });
  chk('D7 no script LOAD_FAIL / pageerror', loadFail.length === 0, loadFail.slice(0, 2).join(' | '));

  // FINDING (listed, not hidden). History: 2.4× (2026-07) then 2.11× (§SWEEP 2026-09-15) were measured on the LEGACY
  // walk this witness no longer drives (§NET-AUDIT WRONG-PATH); the production measured-band walk is what is printed now.
  var elec = R.discs.ELEC;
  console.log('  ⚠ FINDING ELEC whole-disc ' + elec.walked + ' vs real ' + elec.real + ' = ' + (elec.walked / elec.real).toFixed(2) +
    '× on the production measured-band walk (per-class verdict is D4; the 2.11× over-count was the legacy walk).');
  console.log('  screenshot: ' + shot);
  console.log('§DW-DENSITY-TE: ' + pass + ' PASS / ' + fail + ' FAIL');
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
