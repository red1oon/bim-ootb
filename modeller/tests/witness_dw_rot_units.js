#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DW-ROT-UNITS scope (read this block first; read the log after every run)
 * ISSUE THIS WITNESS EXPOSES: the LEGACY disc-walk fixture-commit path (`_commitDiscWalk`,
 * modeller.html) writes the placement's `yaw` — which disc_walker.js produces in RADIANS
 * (`yaw: wl.rot` = element_transforms.rotation_z radians in place()'s shim:host-wall branch;
 * `yaw: Math.PI/2` in hostBind) — RAW into `parameters.placement.rot`, a field every fold
 * consumer treats as DEGREES (`bonsai_library.js place(): rot * Math.PI / 180`;
 * `bonsai_gridmove.js:82` same). The SAME radians-as-degrees bug class was found + fixed at the
 * ARC seed boundary in prompts/RESUME_MODELLER_TERMINAL_LOAD_LOD400.md (§ARC-ROT-UNIT,
 * `rot: rz * 180 / Math.PI` in arc_editable.js:229) — this is its unfixed disc-walk sibling.
 * The preview markers are UNAFFECTED (they render yaw as radians via makeRotationZ,
 * modeller.html §ROTATION-BOUND Bug B) — so preview and committed fold DISAGREE on screen,
 * and per §I5b-TWIN the folded authored mesh draws OVER the marker and wins the raycast:
 * the wrong rotation is what the user sees + what persists in the signed op-log.
 *
 * REAL-RENDERER CONFIRMATION (not a unit-conversion assertion): drives the PRODUCTION walk
 * (SampleHouse resident → click ELEC in the Outliner disc roster, exactly W-DW-OPLOG's flow).
 * MEASURED (probe, 2026-07-10): the ELEC walk yields 6 shim:host-IfcWall-side placements with
 * yaw = 1.5708 rad (hostBind's `Math.PI/2` vertical-run branch) and their committed ops carry
 * placement.rot = 1.5707963267948966 — raw radians in the degrees field. (FP's shim:host-wall
 * fixtures all land on rotation_z=0 walls on this building — no signal there.)
 * Then measures, in the LIVE scene the renderer paints:
 *   • preview on-screen yaw — the dwRoot InstancedMesh instance matrix (atan2(el[1],el[0]))
 *     for one of those yaw=π/2 placements;
 *   • committed on-screen yaw — the folded authored mesh (userData.featureId == the signed
 *     GEOM_INSERT id, matched by _dw + placement xyz, the §I5b-TWIN contract) principal
 *     XY-footprint axis of its BAKED world vertex buffer vs the catalog component's local
 *     long axis (guarded: footprint must be non-square, else the angle is degenerate).
 *
 * CLAIMS (ELEC on SampleHouse; asserting the CORRECT behavior — MUST FAIL on the unfixed tree = the bug is
 * measurably wrong on screen and NOT silently canceled downstream; MUST PASS after the fix):
 *   R1 SHIM-YAW      — the ELEC walk yields ≥1 shim:host-IfcWall-side placement with |yaw| ≈ π/2 rad.
 *   R2 PREVIEW-YAW   — its preview instance matrix yaw == the placement yaw (radians path, ±0.1°).
 *   R3 ROT-IS-DEG    — its signed op placement.rot equals yaw*180/π (degrees convention), NOT raw radians.
 *   R4 FOLD==PREVIEW — folded mesh on-screen yaw == preview on-screen yaw (±2°, mod 180).
 *   R5 NON-SQUARE    — footprint aspect of the folded box ≥1.15 (rotation is measurable, guards R4).
 *   R6 NO-ERROR      — no script LOAD_FAIL / pageerror.
 * Artifacts: build/dw_rot_units.png (viewport screenshot, the render evidence frame).
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
  console.log('═══ W-DW-ROT-UNITS — legacy fixture-commit rot units, REAL renderer (SampleHouse ELEC) ═══');

  await openResident(page, 'SampleHouse');

  // walk ELEC → production path: place() + hostBind + _commitDiscWalk (auto-commits, W-DW-OPLOG proved)
  await page.click('#bo-tree [data-disc="ELEC"]');
  await page.waitForFunction(function () { return !!(window.__dwWalks && window.__dwWalks.ELEC && window.__dwWalks.ELEC.length > 0); }, null, { timeout: 15000 }).catch(function () {});
  await page.waitForFunction(function () { return window.__dwLastCommitDisc === 'ELEC'; }, null, { timeout: 15000 }).catch(function () {});
  await page.waitForTimeout(400);

  var m = await page.evaluate(function () {
    var out = { err: null };
    function yawOfMatrix(el) { return Math.atan2(el[1], el[0]); }                 // makeRotationZ: el[0]=cos, el[1]=sin
    // principal XY axis angle of a vertex buffer footprint (covariance eigenvector), mod π
    function footprint(pos) {
      var n = pos.length / 3, mx = 0, my = 0;
      for (var i = 0; i < pos.length; i += 3) { mx += pos[i]; my += pos[i + 1]; }
      mx /= n; my /= n;
      var sxx = 0, sxy = 0, syy = 0;
      for (var j = 0; j < pos.length; j += 3) {
        var dx = pos[j] - mx, dy = pos[j + 1] - my;
        sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
      }
      var theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);                          // major-axis angle
      var c = Math.cos(theta), s = Math.sin(theta), la = 0, lb = 0;
      for (var k = 0; k < pos.length; k += 3) {
        var ddx = pos[k] - mx, ddy = pos[k + 1] - my;
        var a = Math.abs(c * ddx + s * ddy), b = Math.abs(-s * ddx + c * ddy);
        if (a > la) la = a; if (b > lb) lb = b;
      }
      return { theta: theta, major: la, minor: lb, aspect: lb > 1e-9 ? la / lb : Infinity };
    }
    // 1) a shim:host-* placement with |yaw| ≈ π/2 (hostBind Math.PI/2 vertical-run branch, 6 on SampleHouse ELEC)
    var recs = (window.__dwWalks && window.__dwWalks.ELEC) || [];
    var idx = -1, rec = null;
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      if (r.prov && r.prov.indexOf('shim:host-') === 0 && r.yaw != null && Math.abs(Math.abs(r.yaw) - Math.PI / 2) < 1e-6) { idx = i; rec = r; break; }
    }
    if (!rec) { out.err = 'no shim placement with |yaw|≈π/2 (recs=' + recs.length + ')'; return out; }
    out.recYawRad = rec.yaw; out.recXYZ = [rec.x, rec.y, rec.z]; out.host = rec.host;
    // 2) preview on-screen yaw — the dwRoot InstancedMesh instance matrix for THIS record
    var dwRoot = window.__dwRoot || null;
    var found = null;
    (window.A && window.A.scene ? [window.A.scene] : []).forEach(function (scn) {
      scn.traverse(function (o) {
        if (found || !o.isInstancedMesh || !o.userData || !o.userData.dwSub) return;
        var sub = o.userData.dwSub;
        for (var i = 0; i < sub.length; i++) if (sub[i] === rec) { found = { im: o, i: i }; return; }
      });
    });
    if (!found) { out.err = 'preview instance for the shim record not found in scene'; return out; }
    var elArr = new Array(16);
    found.im.getMatrixAt(found.i, new window.THREE.Matrix4());                    // warm API presence
    var m4 = new window.THREE.Matrix4(); found.im.getMatrixAt(found.i, m4);
    out.previewYawDeg = yawOfMatrix(m4.elements) * 180 / Math.PI;
    // 3) the signed op for THIS placement (§I5b-TWIN contract: _dw.disc + placement xyz toFixed(4))
    var kx = (+rec.x).toFixed(4), ky = (+rec.y).toFixed(4), kz = (+rec.z).toFixed(4);
    var op = null;
    (window.Bonsai.oplog._geomOps() || []).forEach(function (o) {
      var pm = o.parameters;
      if (!op && o.op_type === 'GEOM_INSERT' && pm && pm._dw && pm._dw.disc === 'ELEC' && pm.placement &&
          (+pm.placement.x).toFixed(4) === kx && (+pm.placement.y).toFixed(4) === ky && (+pm.placement.z).toFixed(4) === kz) op = o;
    });
    if (!op) { out.err = 'no committed GEOM_INSERT twin for the shim placement'; return out; }
    out.opId = op.id; out.opRot = (op.parameters.placement && op.parameters.placement.rot) || 0;
    // 4) folded authored mesh on-screen yaw — baked world vertex buffer principal axis vs catalog local axis
    var mesh = null;
    window.A.scene.traverse(function (o) { if (!mesh && o.isMesh && o.userData && o.userData.featureId === op.id) mesh = o; });
    if (!mesh) { out.err = 'folded mesh featureId=' + op.id + ' not in scene'; return out; }
    var world = footprint(mesh.geometry.attributes.position.array);
    var comp = window.Bonsai.library.get(op.parameters.hash);
    var bb = comp.bbox;                                                           // local [xmin,xmax,ymin,ymax,zmin,zmax]
    var lx = bb[1] - bb[0], ly = bb[3] - bb[2];
    var localTheta = lx >= ly ? 0 : Math.PI / 2;                                  // box local major axis
    out.aspect = world.aspect;
    var appliedRad = world.theta - localTheta;                                    // baked yaw, mod π
    out.foldedYawDeg = ((appliedRad * 180 / Math.PI) % 180 + 270) % 180 - 90;     // normalize to (−90, 90]
    out.compBBoxXY = [lx, ly]; out.hash = op.parameters.hash;
    return out;
  });

  if (m.err) console.log('  ⚠ measurement error: ' + m.err);
  var yawDeg = m.recYawRad != null ? m.recYawRad * 180 / Math.PI : null;
  console.log('§DW-ROT-UNITS record yaw=' + (m.recYawRad != null ? m.recYawRad.toFixed(6) : '—') + ' rad (' +
    (yawDeg != null ? yawDeg.toFixed(2) : '—') + '°) op=' + m.opId + ' placement.rot=' + (m.opRot != null ? (+m.opRot).toFixed(6) : '—') +
    ' previewYaw=' + (m.previewYawDeg != null ? m.previewYawDeg.toFixed(2) : '—') + '° foldedYaw=' +
    (m.foldedYawDeg != null ? m.foldedYawDeg.toFixed(2) : '—') + '° aspect=' + (m.aspect != null ? m.aspect.toFixed(2) : '—') +
    ' hash=' + String(m.hash).slice(0, 12));

  chk('R1 SHIM-YAW ≥1 shim:host-* placement with |yaw|≈π/2 rad', !m.err && m.recYawRad != null,
    m.err || ('yaw=' + m.recYawRad.toFixed(6) + ' rad, host=' + String(m.host).slice(0, 14) + '…'));
  function angDiff(a, b) { var d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); }
  chk('R2 PREVIEW-YAW instance matrix == placement yaw (radians path)',
    m.previewYawDeg != null && yawDeg != null && angDiff(m.previewYawDeg, yawDeg) < 0.1,
    'preview=' + (m.previewYawDeg != null ? m.previewYawDeg.toFixed(2) : '—') + '° expected=' + (yawDeg != null ? yawDeg.toFixed(2) : '—') + '°');
  chk('R3 ROT-IS-DEG signed placement.rot carries DEGREES (yaw*180/π), not raw radians',
    m.opRot != null && yawDeg != null && Math.abs(m.opRot - yawDeg) < 0.01,
    'rot=' + (m.opRot != null ? (+m.opRot).toFixed(4) : '—') + ' expected(deg)=' + (yawDeg != null ? yawDeg.toFixed(4) : '—'));
  chk('R5 NON-SQUARE folded footprint aspect ≥1.15 (rotation measurable)', m.aspect != null && m.aspect >= 1.15,
    'aspect=' + (m.aspect != null ? m.aspect.toFixed(2) : '—') + ' bboxXY=' + JSON.stringify(m.compBBoxXY));
  chk('R4 FOLD==PREVIEW folded on-screen yaw == preview on-screen yaw (±2°, mod 180)',
    m.foldedYawDeg != null && m.previewYawDeg != null && angDiff(m.foldedYawDeg, m.previewYawDeg) < 2,
    'folded=' + (m.foldedYawDeg != null ? m.foldedYawDeg.toFixed(2) : '—') + '° preview=' +
    (m.previewYawDeg != null ? m.previewYawDeg.toFixed(2) : '—') + '° Δ=' +
    ((m.foldedYawDeg != null && m.previewYawDeg != null) ? angDiff(m.foldedYawDeg, m.previewYawDeg).toFixed(2) : '—') + '°');

  var loadFail = logs.filter(function (l) { return /LOAD_FAIL|PAGEERROR/.test(l); });
  chk('R6 no script LOAD_FAIL / pageerror', loadFail.length === 0, loadFail.slice(0, 2).join(' | '));

  try {
    fs.mkdirSync(path.join(__dirname, '..', 'build'), { recursive: true });
    await page.screenshot({ path: path.join(__dirname, '..', 'build', 'dw_rot_units.png') });
    console.log('  📷 build/dw_rot_units.png saved');
  } catch (e) { console.log('  ⚠ screenshot failed: ' + e.message); }

  console.log('W-DW-ROT-UNITS: ' + pass + ' PASS / ' + fail + ' FAIL');
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
