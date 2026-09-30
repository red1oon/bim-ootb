#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DW-ROT-UNITS scope (read this block first; read the log after every run)
 * ISSUE THIS WITNESS EXPOSES: an orientation the walker computed is LOST or MIS-SCALED at the walk → render /
 * walk → commit boundary, so what the user sees (and what the signed op-log persists) is not what the walk placed.
 *
 * HISTORY. 2026-07-10: the LEGACY fixture-commit path wrote hostBind's `yaw` (radians) raw into placement.rot (a
 * DEGREES field) — fixed at the commit boundary (`rot: yaw·180/π`, modeller.html §DW-ROT-UNIT). That population is
 * gone: since §WALK-LOD400-ONLY (2026-09-27) the legacy walk's hashless placements REFUSE on every resident
 * (SampleHouse ELEC recs=0 → 1/5 RED on main 8311ba5f, judging nothing).
 * 2026-09-30 RE-POINT to the PRODUCTION walk (Duplex ELEC, the schedule path, 102 LOD400 fixtures): placeSchedule
 * computes a FACING for every wall-anchored device (`_schedFacing` / `_snapToWall`: the wall normal INTO the room,
 * radians) but wrote it to `rot` only, while every consumer reads `yaw` (renderer makeRotationZ(p.yaw), commit
 * placement.rot = p.yaw·180/π) → all 102 fixtures drawn AND signed at 0° (measured: yawDeg={"null":102}). Fixed by
 * §SCHED-YAW (disc_walker.js): the facing is re-expressed in the mesh's own frame — the mesh's thin horizontal axis is
 * its depth (read off its vertex buffer: Duplex receptacle 031416… is 0.0587 deep on local X, 23c614…/4730c9… on
 * local Y) and that axis turns onto the normal: thin X → yaw = facing, thin Y → yaw = facing − π/2.
 *
 * ORACLE (independent of the engine's yaw): the facing is the walker's own `rot`; the mesh frame is read HERE from the
 * geo buffer; R4 measures the FOLDED WORLD footprint of each twin against the wall run — geometry, not a field copy.
 *
 * CLAIMS (Duplex ELEC via the real Outliner roster click; wall-anchored = x_ref/y_ref MIN|MAX in duplex_rules.db
 * rule_space_schedule, matched by device + placement_rule) — MUST FAIL on the unfixed tree, PASS with §SCHED-YAW:
 *   R1 POPULATION    — ≥1 wall-anchored schedule placement with a mesh; INCONCLUSIVE otherwise (nothing judged).
 *   R2 PREVIEW-YAW   — EVERY such placement's InstancedMesh matrix yaw == expected (mod 180°, ±0.1°). n_ok/n printed.
 *   R3 ROT-IS-DEG    — EVERY signed twin op's placement.rot == expected·180/π (DEGREES, mod 180, ±0.01°).
 *   R4 WALL-PARALLEL — every MEASURABLE twin (footprint aspect ≥1.15): the folded mesh's WORLD footprint major axis is
 *                      PERPENDICULAR to the facing normal, i.e. flat along its wall (±2°, mod 180).
 *   R5 NON-SQUARE    — ≥1 measurable twin (guards R4; INCONCLUSIVE label otherwise).
 *   R6 NO-ERROR      — no script LOAD_FAIL / pageerror.
 * Artifacts: build/dw_rot_units.png (a frame for the record — never evidence).
 */
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');
var { chromium } = require('playwright');

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
  }, null, { timeout: 25000 }).catch(function () {});
  await page.waitForFunction(function () { return window.DiscWalker && window.DiscWalker._ready(); }, null, { timeout: 25000 }).catch(function () {});
  await page.waitForFunction(function () { return window.Bonsai && window.Bonsai.library && (window.Bonsai.library.catalog() || []).length > 0; }, null, { timeout: 10000 }).catch(function () {});
  await page.waitForFunction(function () { return !!window.__dwGeoBuf; }, null, { timeout: 30000 }).catch(function () {});
  await page.waitForTimeout(300);
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
  console.log('═══ W-DW-ROT-UNITS — walk orientation survives render + commit, REAL renderer (Duplex ELEC schedule walk) ═══');

  await openResident(page, 'Duplex');

  // walk ELEC → production path (Outliner roster click → _discWalkOne → placeSchedule → LOD400 gate → _commitDiscWalk)
  await page.click('#bo-tree [data-disc="ELEC"]');
  await page.waitForFunction(function () { return !!(window.__dwWalks && window.__dwWalks.ELEC && window.__dwWalks.ELEC.length > 0); }, null, { timeout: 60000 }).catch(function () {});
  await page.waitForFunction(function () { return window.__dwLastCommitDisc === 'ELEC'; }, null, { timeout: 60000 }).catch(function () {});
  await page.waitForTimeout(1500);

  var m = await page.evaluate(async function (port) {
    var out = { err: null, rows: [] };
    function yawOfMatrix(el) { return Math.atan2(el[1], el[0]); }                 // makeRotationZ: el[0]=cos, el[1]=sin
    function angDiff(a, b) { var d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); }
    // principal XY axis of a WORLD vertex cloud (covariance eigenvector), mod π
    function footprint(pts) {
      var n = pts.length / 2, mx = 0, my = 0;
      for (var i = 0; i < pts.length; i += 2) { mx += pts[i]; my += pts[i + 1]; }
      mx /= n; my /= n;
      var sxx = 0, sxy = 0, syy = 0;
      for (var j = 0; j < pts.length; j += 2) { var dx = pts[j] - mx, dy = pts[j + 1] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
      var theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
      // extents = projection RANGES (max − min) along θ and θ+90°, not |deviation from the mean|: a 16-vertex receptacle
      // clusters 6 of its 8 XY corners on one side, so the mean is off-centre and the old max-|dev| read 0.0417 for a
      // 0.0587 side (measured 2026-09-30) and flipped the major axis. The MAJOR axis is the larger range.
      var c = Math.cos(theta), s = Math.sin(theta), a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (var k = 0; k < pts.length; k += 2) { var a = c * pts[k] + s * pts[k + 1], b = -s * pts[k] + c * pts[k + 1]; if (a < a0) a0 = a; if (a > a1) a1 = a; if (b < b0) b0 = b; if (b > b1) b1 = b; }
      var la = a1 - a0, lb = b1 - b0;
      if (lb > la) { var tmp = la; la = lb; lb = tmp; theta += Math.PI / 2; }
      return { theta: theta, aspect: lb > 1e-9 ? la / lb : Infinity };
    }
    // 1) the wall-anchored schedule rules (the witness reads the rules DB itself)
    var rbuf = await (await fetch('http://localhost:' + port + '/modeller/duplex_rules.db')).arrayBuffer();
    var rdb = new window.SQL.Database(new Uint8Array(rbuf));
    var rr = rdb.exec("SELECT device_id, placement_rule, x_ref, y_ref FROM rule_space_schedule WHERE disc='ELEC'");
    var wallKeys = {}; if (rr.length) rr[0].values.forEach(function (v) { if (v[2] === 'MIN' || v[2] === 'MAX' || v[3] === 'MIN' || v[3] === 'MAX') wallKeys[v[0] + '|' + v[1]] = 1; });
    rdb.close();
    out.wallRules = Object.keys(wallKeys).length;
    var recs = (window.__dwWalks && window.__dwWalks.ELEC) || [];
    var cands = recs.map(function (r, i) { return { r: r, i: i }; }).filter(function (o) {
      var rule = String(o.r.prov || '').replace(/^sched:space-schedule:/, '');
      return o.r.geometry_hash && wallKeys[o.r.device + '|' + rule] && o.r.rot != null;
    });
    out.recs = recs.length; out.cands = cands.length;
    if (!cands.length) { out.err = 'no wall-anchored schedule placement with a mesh (recs=' + recs.length + ')'; return out; }
    // 2) mesh frames — local horizontal extents from the geo buffer (independent read)
    var hashes = {}; cands.forEach(function (o) { hashes[o.r.geometry_hash] = 1; });
    var gdb = new window.SQL.Database(new Uint8Array(window.__dwGeoBuf));
    var real = window.RealGeometry.resolveHashes(gdb, Object.keys(hashes)); gdb.close();
    var frame = {};
    Object.keys(real).forEach(function (h) {
      var p = real[h].positions, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (var i = 0; i + 2 < p.length; i += 3) { if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i]; if (p[i + 1] < y0) y0 = p[i + 1]; if (p[i + 1] > y1) y1 = p[i + 1]; }
      frame[h] = { dx: x1 - x0, dy: y1 - y0 };
    });
    // 3) per placement: preview matrix yaw, signed op rot, folded world footprint
    var ims = [];
    window.A.scene.traverse(function (o) { if (o.isInstancedMesh && o.userData && o.userData.dwSub) ims.push(o); });
    var ops = window.Bonsai.oplog._geomOps() || [];
    var M4 = new window.THREE.Matrix4(), V3 = new window.THREE.Vector3();
    cands.forEach(function (o) {
      var r = o.r, f = frame[r.geometry_hash];
      var facingDeg = r.rot * 180 / Math.PI;
      var expDeg = f ? ((f.dx > 0 && f.dy > 0 && f.dy < f.dx) ? facingDeg - 90 : facingDeg) : null;   // thin Y → facing − 90°
      var row = { i: o.i, device: r.device, facingDeg: +facingDeg.toFixed(2), frame: f ? (f.dy < f.dx ? 'thinY' : 'thinX') : 'no-mesh', expDeg: expDeg == null ? null : +expDeg.toFixed(2) };
      // preview instance (+ its WORLD footprint: instance matrix applied to the bucket's own geometry — the on-screen marker)
      var found = null;
      ims.forEach(function (im) { if (found) return; var sub = im.userData.dwSub; for (var k = 0; k < sub.length; k++) if (sub[k] === r) { found = { im: im, k: k }; return; } });
      if (found) {
        found.im.getMatrixAt(found.k, M4); row.previewDeg = +(yawOfMatrix(M4.elements) * 180 / Math.PI).toFixed(2);
        var ga = found.im.geometry && found.im.geometry.attributes.position ? found.im.geometry.attributes.position.array : null;
        if (ga) { var ppts = []; for (var g2 = 0; g2 + 2 < ga.length; g2 += 3) { V3.set(ga[g2], ga[g2 + 1], ga[g2 + 2]).applyMatrix4(M4); ppts.push(V3.x, V3.y); }
          var pfp = footprint(ppts); row.previewAspect = +pfp.aspect.toFixed(3); row.previewMajorDeg = +(pfp.theta * 180 / Math.PI).toFixed(2); }
      }
      if (f) row.local = [+f.dx.toFixed(4), +f.dy.toFixed(4)];
      // signed twin (§I5b-TWIN: _dw.disc + placement x/y + centre z in _dw.cz)
      var kx = (+r.x).toFixed(4), ky = (+r.y).toFixed(4), kz = (+r.z).toFixed(4), op = null;
      ops.forEach(function (q) { var pm = q.parameters; if (!op && q.op_type === 'GEOM_INSERT' && pm && pm._dw && pm._dw.disc === 'ELEC' && pm.placement &&
        (+pm.placement.x).toFixed(4) === kx && (+pm.placement.y).toFixed(4) === ky && (+(pm._dw.cz != null ? pm._dw.cz : pm.placement.z)).toFixed(4) === kz) op = q; });
      if (op) {
        row.opId = op.id; row.rotDeg = +(+(op.parameters.placement.rot || 0)).toFixed(4);
        var mesh = (window.Bonsai.meshFor && window.Bonsai.meshFor(op.id)) || null;
        if (!mesh) window.A.scene.traverse(function (q) { if (!mesh && q.isMesh && q.userData && q.userData.featureId === op.id) mesh = q; });
        if (mesh && mesh.geometry && mesh.geometry.attributes.position) {
          mesh.updateWorldMatrix(true, false);
          var pa = mesh.geometry.attributes.position.array, pts = [];
          for (var v = 0; v + 2 < pa.length; v += 3) { V3.set(pa[v], pa[v + 1], pa[v + 2]).applyMatrix4(mesh.matrixWorld); pts.push(V3.x, V3.y); }
          var fp = footprint(pts); row.aspect = +fp.aspect.toFixed(3); row.majorDeg = +(fp.theta * 180 / Math.PI).toFixed(2);
        }
      }
      row.r2 = row.previewDeg != null && expDeg != null && angDiff(row.previewDeg, expDeg) < 0.1;
      row.r3 = row.rotDeg != null && expDeg != null && angDiff(row.rotDeg, expDeg) < 0.01;
      row.measurable = row.aspect != null && isFinite(row.aspect) && row.aspect >= 1.15;
      row.r4 = row.measurable && angDiff(row.majorDeg, facingDeg + 90) <= 2;   // major axis ⟂ facing normal = flat along the wall
      row.r4p = row.previewAspect != null && row.previewAspect >= 1.15 && angDiff(row.previewMajorDeg, facingDeg + 90) <= 2;   // same, for the preview marker
      row.twinEqPreview = row.previewMajorDeg != null && row.majorDeg != null && angDiff(row.previewMajorDeg, row.majorDeg) <= 2;
      out.rows.push(row);
    });
    return out;
  }, port);

  if (m.err) console.log('  ⚠ measurement: ' + m.err);
  var rows = m.rows || [];
  var n = rows.length, r2ok = rows.filter(function (r) { return r.r2; }).length, r3ok = rows.filter(function (r) { return r.r3; }).length;
  var meas = rows.filter(function (r) { return r.measurable; }), r4ok = meas.filter(function (r) { return r.r4; }).length;
  var r4pok = rows.filter(function (r) { return r.r4p; }).length, tpEq = rows.filter(function (r) { return r.twinEqPreview; }).length;
  console.log('§DW-ROT-UNITS recs=' + m.recs + ' wallRules=' + m.wallRules + ' wallAnchored=' + m.cands + ' previewOk=' + r2ok + '/' + n + ' rotOk=' + r3ok + '/' + n +
    ' measurable=' + meas.length + ' wallParallel(twin)=' + r4ok + '/' + meas.length + ' wallParallel(preview)=' + r4pok + '/' + n + ' twinMajor==previewMajor=' + tpEq + '/' + n);
  rows.slice(0, 12).forEach(function (r) { console.log('   ' + JSON.stringify(r)); });
  var bad = rows.filter(function (r) { return !r.r2 || !r.r3 || (r.measurable && !r.r4); }).slice(0, 4);
  if (bad.length && rows.length > 12) bad.forEach(function (r) { console.log('   ✗ ' + JSON.stringify(r)); });

  chk('R1 POPULATION ≥1 wall-anchored ELEC schedule placement with a mesh' + (n ? '' : ' — INCONCLUSIVE (nothing judged)'), n > 0,
    m.err || ('wallAnchored=' + n + ' of recs=' + m.recs));
  chk('R2 PREVIEW-YAW every wall-anchored instance matrix yaw == expected mesh-frame yaw (mod 180, ±0.1°)', n > 0 && r2ok === n, r2ok + '/' + n);
  chk('R3 ROT-IS-DEG every signed twin placement.rot == expected·180/π (DEGREES, mod 180, ±0.01°)', n > 0 && r3ok === n, r3ok + '/' + n);
  chk('R5 NON-SQUARE ≥1 twin with footprint aspect ≥1.15 (rotation measurable, guards R4)', meas.length > 0, 'measurable=' + meas.length + '/' + n);
  chk('R4 WALL-PARALLEL every measurable folded twin lies flat along its wall (footprint major axis ⟂ facing normal, ±2°)' + (meas.length ? '' : ' — INCONCLUSIVE (see R5)'),
    meas.length > 0 && r4ok === meas.length, r4ok + '/' + meas.length);

  var loadFail = logs.filter(function (l) { return /LOAD_FAIL|PAGEERROR/.test(l); });
  chk('R6 no script LOAD_FAIL / pageerror', loadFail.length === 0, loadFail.slice(0, 2).join(' | '));
  logs.filter(function (l) { return /§SCHED-YAW|§DISC-WALK ELEC|§DW-LOD400-REFUSE/.test(l); }).slice(0, 6).forEach(function (l) { console.log('   ' + l.slice(0, 200)); });

  try {
    fs.mkdirSync(path.join(__dirname, '..', 'build'), { recursive: true });
    await page.screenshot({ path: path.join(__dirname, '..', 'build', 'dw_rot_units.png'), timeout: 8000 });
    console.log('  📷 build/dw_rot_units.png saved');
  } catch (e) { console.log('  ⚠ screenshot skipped: ' + String(e.message).split('\n')[0]); }

  console.log('W-DW-ROT-UNITS: ' + pass + ' PASS / ' + fail + ' FAIL');
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
