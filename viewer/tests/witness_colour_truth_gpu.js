#!/usr/bin/env node
// ⚠ DO NOT REMOVE — Scope guard. W-COLOUR-TRUTH-GPU — bim-compiler prompts/PHOTOREAL_STILL_RENDER.md "### Z19 SPEC" / "### Z20 SPEC" /
// "### Z21 SPEC". READ THE LOG (viewer/tests/witness_colour_truth_gpu.log) before any conclusion — exit code is not evidence.
//
// ISSUES THIS EXPOSES (each verdict can fail on its own):
//   Z21  the exporter placeholder 0.920,0.900,0.850 renders cream on beams/members/columns on the NORMAL CANVAS and in Alt+S;
//        after: those classes render their STD_MAT default (steel = blue-leaning grey: b > r; before: cream r > b).
//   Z20  toilets/sinks/urinals get the glazed-porcelain finish (roughness 0.08 from physicallybased.info Porcelain 0, metal 0) and keep
//        their own white colour; nothing outside the list moves.
//   Z19  the Alt+S zone interreflection carries the surfaces' colour: still frame mean saturation rises at interior poses while
//        §IR_COLOUR reports Y unchanged; the canvas (no IR there) moves ONLY through Z21/Z20 pixels.
//   REFS pixels whose element is NOT a placeholder row and NOT a porcelain match are unchanged on the canvas (<= 2 codes mean abs).
// NUMBERS ONLY — no screenshot is judged. Per-class colours are read from the rendered frame at raycast-identified pixels
// (class from elements_meta by the hit's guid) and from the real built THREE materials.
// SELF-FAILURE: INCONCLUSIVE (never PASS) when an arm fails to boot, a pose's anchor element is not the first hit, a class has < 5
// sampled pixels, the §-lines are missing, or sw / streaming.js ?v= do not match the expected arm.
//
// Run (coordinator, two static servers: BEFORE = look/combined-0925 @53128dd3, AFTER = fix/colour-truth):
//   node viewer/tests/witness_colour_truth_gpu.js <PORT_BEFORE> <PORT_AFTER> [WANT_GUIDS=63182] > viewer/tests/witness_colour_truth_gpu.log 2>&1
'use strict';
const puppeteer = require(process.env.PUPPETEER || '/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [PB, PA, WANT = '63182'] = process.argv.slice(2);
const LOG = [], S = m => { LOG.push(m); console.log(m); };
let fails = 0, judged = 0, inconcl = 0;
const V = (ok, l, d) => { if (ok === null) { inconcl++; S('   ⚪ INCONCLUSIVE ' + l + (d ? ' — ' + d : '')); return; } judged++; if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + l + (d ? ' — ' + d : '')); };
const PLENUM = { cam: [-20.496, -5.619, -34.439], tgt: [-23.527, -6.051, -22.952] };
const TAGS = /§PLACEHOLDER_COLOUR|§PLACEHOLDER_CLASS|§PORCELAIN|§IR_COLOUR|§IRC_MAX build|§MEP_HUE_TALLY|§GI_STILL result|§LOAD_FAIL|§METER camera|§FAULT/;

// in-page: one measured frame. mode 'canvas' renders the app scene now; mode 'still' reads the Alt+S overlay canvas.
function pageMeasure(mode, GX, GY) {
  const A = window.APP, T = window.THREE, R = A.renderer, W = R.domElement.width, H = R.domElement.height;
  let src;
  if (mode === 'canvas') { R.render(A.scene, A.camera); src = document.createElement('canvas'); src.width = W; src.height = H; src.getContext('2d').drawImage(R.domElement, 0, 0); }
  else { src = document.querySelector('#gi-still-overlay canvas'); if (!src) return { error: 'no still overlay canvas' }; }
  const px = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, src.width, src.height).data;
  let ss = 0, n = 0; for (let i = 0; i < px.length; i += 4 * 7) { const r = px[i], g = px[i + 1], b = px[i + 2], mx = Math.max(r, g, b); ss += mx ? (mx - Math.min(r, g, b)) / mx : 0; n++; }
  const meta = window.__ctMeta, tg = []; A.scene.traverse(o => { if ((o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible && o !== A._sky && !(o.userData && o.userData.skyPortal)) tg.push(o); });
  const rc = new T.Raycaster(), samples = [];
  for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
    const u = (gx + 0.5) / GX, v = (gy + 0.5) / GY; rc.setFromCamera(new T.Vector2(u * 2 - 1, 1 - v * 2), A.camera);
    const h = rc.intersectObjects(tg, false).filter(q => { const m = Array.isArray(q.object.material) ? q.object.material[0] : q.object.material; return m && !m.isMeshBasicMaterial && !(m.transparent && m.opacity < 0.95); })[0];
    if (!h) continue; const o = h.object, id = h.batchId != null ? o.id + '_' + h.batchId : h.instanceId != null ? o.id + '_' + h.instanceId : o.id;
    const guid = A.guidMap[id] || A.guidMap[o.id]; const m = guid && meta[guid]; if (!m) continue;
    const x = Math.min(src.width - 1, Math.floor(u * src.width)), y = Math.min(src.height - 1, Math.floor(v * src.height)), k = (y * src.width + x) * 4;
    samples.push({ i: gy * GX + gx, g: guid, cls: m.c, d: m.d, ph: m.ph, porc: m.p, rgb: [px[k], px[k + 1], px[k + 2]] });
  }
  return { mode, w: src.width, h: src.height, meanSat: +(ss / n).toFixed(4), samples };
}
// in-page: CPU census of the built materials per class (the real THREE objects)
function pageMaterials() {
  const A = window.APP, out = {}; A.scene.traverse(o => { if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh)) return; const ms = Array.isArray(o.material) ? o.material : [o.material];
    ms.forEach(m => { if (!m || !m.color) return; const k = (m.userData && m.userData._porcelain) ? 'porcelain' : (o.userData && o.userData.ifcClass) || '?';
      const e = out[k] || (out[k] = {}); const key = m.color.getHexString() + ' r' + (+m.roughness).toFixed(3) + ' m' + (+m.metalness).toFixed(2); e[key] = (e[key] || 0) + 1; }); });
  return out;
}
// in-page: choose a pose looking at an element of the given predicate: 4 horizontal directions, eye 1.6 m above its base; the pose
// counts only if the element is the FIRST opaque hit on the centre ray (else the next candidate). Deterministic (guid order).
function pageAnchor(which) {
  const A = window.APP, T = window.THREE, meta = window.__ctMeta, rows = window.__ctRows;
  const cand = rows.filter(r => which === 'toilet' ? /^Toilet-Wall-Mounted/.test(r.n) : (r.c === 'IfcBeam' && meta[r.g].ph)).sort((a, b) => a.g < b.g ? -1 : 1).slice(0, 40);
  const tg = []; A.scene.traverse(o => { if ((o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible && o !== A._sky) tg.push(o); });
  const rc = new T.Raycaster();
  for (const r of cand) { const p = A.ifc2three(r.x, r.y, r.z), base = new T.Vector3(p.x, p.y, p.z);
    const dirs = which === 'toilet' ? [[2.2, 0.8, 0], [-2.2, 0.8, 0], [0, 0.8, 2.2], [0, 0.8, -2.2]] : [[3, -2.5, 0], [-3, -2.5, 0], [0, -2.5, 3], [0, -2.5, -3]];
    for (const d of dirs) { const cam = base.clone().add(new T.Vector3(d[0], d[1], d[2])); rc.set(cam, base.clone().sub(cam).normalize());
      const h = rc.intersectObjects(tg, false).filter(q => { const m = Array.isArray(q.object.material) ? q.object.material[0] : q.object.material; return m && !m.isMeshBasicMaterial && !(m.transparent && m.opacity < 0.95); })[0];
      if (!h) continue; const id = h.batchId != null ? h.object.id + '_' + h.batchId : h.instanceId != null ? h.object.id + '_' + h.instanceId : h.object.id;
      if ((A.guidMap[id] || A.guidMap[h.object.id]) === r.g) return { guid: r.g, name: r.n, cam: cam.toArray(), tgt: base.toArray() }; } }
  return null;
}

async function arm(port, label, posesIn) {   // posesIn: the AFTER arm's poses, so both arms render the identical cameras
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 1800000, env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }),
    args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--window-size=1705,1054', '--user-data-dir=/tmp/ct-gpu-' + label + '-' + Date.now()] });
  const p = await b.newPage(); await p.setViewport({ width: 1685, height: 874 }); const L = []; let pe = 0;
  p.on('console', m => L.push(m.text())); p.on('pageerror', e => { pe++; L.push('PAGEERROR ' + e.message); });
  const out = { label, poses: {}, L };
  try {
    await p.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?db=/buildings/Hospital_extracted.db', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(w => window.APP && window.APP.guidMap && Object.keys(window.APP.guidMap).length >= w, { timeout: 600000, polling: 2000 }, +WANT); await sleep(3000);
    out.sw = await p.evaluate(async () => (await (await fetch('/viewer/sw.js')).text()).match(/CACHE_VERSION = '([^']+)'/)[1]);
    out.v = await p.evaluate(() => [...document.scripts].map(s => s.src).filter(s => /streaming\.js|sourced_light\.js|light_zones\.js/.test(s)).map(s => s.split('/').pop()).join(' '));
    // element facts from the building's own DB, through the running app (the same rows it streamed)
    await p.evaluate(() => { const A = window.APP, rs = A.dbQuery("SELECT m.guid, m.ifc_class, coalesce(m.material_rgba,''), coalesce(m.material_name,''), coalesce(m.element_name,''), t.center_x, t.center_y, t.center_z, coalesce(m.discipline,'') FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid") || [];
      const meta = {}, rows = []; rs.forEach(r0 => { const r = Array.isArray(r0) ? r0 : Object.values(r0), ph = A._isExporterPlaceholder ? A._isExporterPlaceholder(r[2], r[3]) : /^0\.920,0\.900,0\.850(,1\.000)?$/.test(r[2]) && !r[3];
        const po = A._porcelainKey ? !!A._porcelainKey(r[1], r[4], r[3]) : false; meta[r[0]] = { c: r[1], ph, p: po, d: r[8] }; rows.push({ g: r[0], c: r[1], n: r[4], x: r[5], y: r[6], z: r[7] }); });
      window.__ctMeta = meta; window.__ctRows = rows; });
    out.materials = await p.evaluate(pageMaterials);
    const poses = posesIn || { plenum: PLENUM, toilet: await p.evaluate(pageAnchor, 'toilet'), beams: await p.evaluate(pageAnchor, 'beams') };
    for (const [name, pose] of Object.entries(poses)) {
      if (!pose) { out.poses[name] = { error: 'no anchor pose (element never first hit)' }; continue; }
      await p.evaluate(q => { const A = window.APP; A.camera.position.fromArray(q.cam); A.controls.target.fromArray(q.tgt); A.controls.update(); }, pose); await sleep(1500);
      const canvas = await p.evaluate(pageMeasure, 'canvas', 48, 27);
      const n0 = L.length; await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');
      for (let i = 0; i < 400 && !L.slice(n0).some(t => /§GI_STILL result|§GI_STILL_FAIL/.test(t)); i++) await sleep(1000);
      const still = await p.evaluate(pageMeasure, 'still', 48, 27);
      out.poses[name] = { pose, canvas, still, tags: L.slice(n0).filter(t => TAGS.test(t)) };
      await p.keyboard.press('Escape'); await sleep(1500);
    }
  } catch (e) { out.error = e.message; }
  out.pageErrors = pe; await b.close(); return out;
}
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;
function byClass(samples, pred) { const s = samples.filter(pred); return { n: s.length, rgb: [0, 1, 2].map(k => mean(s.map(q => q.rgb[k]))), sat: mean(s.map(q => { const mx = Math.max(...q.rgb); return mx ? (mx - Math.min(...q.rgb)) / mx : 0; })) }; }
const f3 = c => c.rgb.map(v => isNaN(v) ? '-' : v.toFixed(1)).join(',');

(async () => {
  if (!PB || !PA) { S('§W_COLOUR_TRUTH_GPU INCONCLUSIVE usage: <PORT_BEFORE> <PORT_AFTER> [WANT]'); process.exitCode = 2; return; }
  const A = await arm(PA, 'after'), posesA = {}; Object.entries(A.poses).forEach(([k, v]) => { posesA[k] = v.pose || null; });
  const B = await arm(PB, 'before', posesA);
  // the BEFORE build has no porcelain owner: a before pixel is porcelain iff the AFTER pixel in the same grid cell is the same porcelain guid
  for (const k of Object.keys(B.poses)) for (const mode of ['canvas', 'still']) { const fa = A.poses[k] && A.poses[k][mode], fb = B.poses[k][mode]; if (!fa || !fb || !fa.samples || !fb.samples) continue;
    const pg = new Map(fa.samples.filter(q => q.porc).map(q => [q.i, q.g])); fb.samples.forEach(q => { q.porc = pg.get(q.i) === q.g; }); }
  for (const X of [B, A]) { S('── arm ' + X.label + ' sw=' + X.sw + ' scripts=' + X.v + ' pageErrors=' + X.pageErrors + (X.error ? ' ERROR ' + X.error : ''));
    X.L.filter(t => /§PLACEHOLDER_COLOUR|§PLACEHOLDER_CLASS|§PORCELAIN|§MEP_HUE_TALLY/.test(t)).forEach(t => S('   ' + t.slice(0, 400)));
    ['IfcBeam', 'IfcMember', 'IfcColumn', 'IfcPipeSegment', 'IfcDuctSegment', 'porcelain'].forEach(c => S('   §MATERIALS ' + X.label + ' ' + c + ' ' + JSON.stringify(X.materials ? X.materials[c] || {} : 'n/a'))); }
  const boot = !B.error && !A.error && A.sw === 'v1476' && /streaming\.js\?v=78/.test(A.v || '') && !B.pageErrors && !A.pageErrors;
  V(boot ? true : null, 'instrument: both arms booted, AFTER serves sw v1476 + streaming.js?v=78, no page errors', 'before ' + B.sw + ' / after ' + A.sw + ' ' + A.v);
  const phLine = A.L.find(t => /^§PLACEHOLDER_COLOUR bld=Hospital/.test(t)) || '', porcLine = A.L.find(t => /^§PORCELAIN bld=Hospital/.test(t)) || '';
  const rep = +((/replaced=(\d+)/.exec(phLine) || [])[1] || NaN), pm = +((/matched=(\d+)/.exec(porcLine) || [])[1] || NaN);
  V(phLine ? rep === 10947 : null, 'Z21 §PLACEHOLDER_COLOUR replaced = 10947 (node census: Member 6635, Beam 1970, WallStd 1226, Column 506, Footing 444, Covering 152, Door 5, Railing 4, Wall 3, Slab 2)', phLine.slice(0, 200));
  const mt = +((/mepTier2=(\d+)/.exec(phLine) || [])[1] || NaN), pk = +((/proxyKept=(\d+)/.exec(phLine) || [])[1] || NaN);
  V(phLine ? mt === 44246 && pk === 1293 : null, 'Z21 §MEP_PROXY_HUE: mepTier2 = 44246 (40563 MEP-class + 3683 MEP-trade proxies) and proxyKept = 1293 (ARC proxies)', 'mepTier2=' + mt + ' proxyKept=' + pk);
  V(porcLine ? pm === 554 : null, 'Z20 §PORCELAIN matched = 554 on Hospital (node census)', porcLine.slice(0, 200));
  V(B.L.some(t => /§PLACEHOLDER_COLOUR/.test(t)) ? false : true, 'BEFORE arm has no §PLACEHOLDER_COLOUR line (it is the true baseline)');
  for (const name of ['plenum', 'toilet', 'beams']) {
    const b = B.poses[name] || {}, a = A.poses[name] || {};
    S('── pose ' + name + ' ' + (a.pose ? 'cam ' + JSON.stringify(a.pose.cam.map(v => +v.toFixed(3))) + ' -> ' + JSON.stringify(a.pose.tgt.map(v => +v.toFixed(3))) + (a.pose.name ? ' anchor "' + a.pose.name + '" ' + a.pose.guid : '') : (a.error || b.error || 'missing')));
    if (!a.canvas || !b.canvas || a.canvas.error || b.canvas.error) { V(null, name + ': frames', (a.error || b.error || (a.canvas && a.canvas.error) || '')); continue; }
    (a.tags || []).forEach(t => S('   ' + t.slice(0, 300)));
    for (const mode of ['canvas', 'still']) {
      const fb = b[mode], fa = a[mode]; if (!fb || !fa || fb.error || fa.error) { V(null, name + ' ' + mode, (fb && fb.error) || (fa && fa.error) || 'no frame'); continue; }
      S('   ' + mode + ' meanSat before ' + fb.meanSat + ' after ' + fa.meanSat + ' (samples ' + fb.samples.length + '/' + fa.samples.length + ')');
      ['IfcBeam', 'IfcMember', 'IfcColumn', 'IfcPipeSegment', 'IfcPipeFitting', 'IfcDuctSegment', 'IfcDuctFitting'].forEach(c => { const cb = byClass(fb.samples, q => q.cls === c), ca = byClass(fa.samples, q => q.cls === c);
        if (cb.n || ca.n) S('   ' + mode + ' ' + c + ' n ' + cb.n + '/' + ca.n + ' rgb before ' + f3(cb) + ' after ' + f3(ca) + ' sat ' + cb.sat.toFixed(3) + '/' + ca.sat.toFixed(3)); });
      // Z21: steel classes flip from cream (r > b) to steel (b >= r) at placeholder pixels
      const sb = byClass(fb.samples, q => q.ph && (q.cls === 'IfcBeam' || q.cls === 'IfcMember')), sa = byClass(fa.samples, q => q.ph && (q.cls === 'IfcBeam' || q.cls === 'IfcMember'));
      if (name === 'beams' || sa.n >= 5) V(sa.n >= 5 && sb.n >= 5 ? (sb.rgb[0] > sb.rgb[2] && sa.rgb[2] >= sa.rgb[0]) : null, 'Z21 ' + name + ' ' + mode + ': placeholder beam/member pixels cream (r>b) -> steel (b>=r)', 'before ' + f3(sb) + ' after ' + f3(sa) + ' n ' + sb.n + '/' + sa.n);
      // Z21 §MEP_PROXY_HUE: MEP-trade proxy placeholder pixels gain saturation (cream -> trade hue); judged where >= 5 pixels exist
      const MPD = /^(MEP|FP|PLB|ELEC|ACMV|HVAC|SAN|VENT|HEAT)$/, xb = byClass(fb.samples, q => q.cls === 'IfcBuildingElementProxy' && q.ph && !q.porc && MPD.test(q.d)), xa = byClass(fa.samples, q => q.cls === 'IfcBuildingElementProxy' && q.ph && !q.porc && MPD.test(q.d));
      if (xa.n || xb.n) V(xa.n >= 5 && xb.n >= 5 ? xa.sat > xb.sat + 0.1 : null, 'Z21 ' + name + ' ' + mode + ': MEP-trade proxy placeholder pixels take a trade hue (sat +0.1)', 'before ' + f3(xb) + ' sat ' + xb.sat.toFixed(3) + ' after ' + f3(xa) + ' sat ' + xa.sat.toFixed(3) + ' n ' + xb.n + '/' + xa.n);
      // Z20: porcelain pixels keep their white (mean channel within 8 % of before, low saturation)
      const pb = byClass(fb.samples, q => q.porc), pa = byClass(fa.samples, q => q.porc);
      if (name === 'toilet') V(pa.n >= 5 && pb.n >= 5 ? (pa.sat < 0.12 && Math.abs(mean(pa.rgb) - mean(pb.rgb)) / Math.max(1, mean(pb.rgb)) < 0.08) : null, 'Z20 toilet ' + mode + ': porcelain pixels stay white (sat < 0.12, mean within 8 %)', 'before ' + f3(pb) + ' sat ' + pb.sat.toFixed(3) + ' after ' + f3(pa) + ' sat ' + pa.sat.toFixed(3) + ' n ' + pb.n + '/' + pa.n);
      // REFS (canvas only — the still also carries the IR colour): untouched elements identical
      if (mode === 'canvas') { const byI = new Map(fa.samples.map(q => [q.i, q])), diffs = [];
        fb.samples.forEach(q => { const r = byI.get(q.i); if (r && r.g === q.g && !q.ph && !q.porc) diffs.push((Math.abs(q.rgb[0] - r.rgb[0]) + Math.abs(q.rgb[1] - r.rgb[1]) + Math.abs(q.rgb[2] - r.rgb[2])) / 3); });
        const md = []; fb.samples.forEach(q => { const r = byI.get(q.i); if (r && r.g === q.g && q.ph && /^Ifc(Pipe|Duct)/.test(q.cls)) md.push((Math.abs(q.rgb[0] - r.rgb[0]) + Math.abs(q.rgb[1] - r.rgb[1]) + Math.abs(q.rgb[2] - r.rgb[2])) / 3); });
        if (name === 'plenum') V(md.length >= 20 ? mean(md) <= 2 : null, 'Z21 plenum canvas: MEP placeholder pipes/ducts keep their tier-2 colour (mean abs <= 2 codes)', 'n=' + md.length + ' meanAbs=' + (md.length ? mean(md).toFixed(2) : '-'));
        V(diffs.length >= 20 ? mean(diffs) <= 2 : null, 'REFS ' + name + ' canvas: untouched-element pixels unchanged (mean abs <= 2 codes, same grid cell + same guid)', 'n=' + diffs.length + ' meanAbs=' + (diffs.length ? mean(diffs).toFixed(2) : '-')); }
      // Z19: Alt+S saturation rises (canvas does not carry IR)
      if (mode === 'still' && name !== 'toilet') { const irc = (a.tags || []).find(t => /^§IR_COLOUR bld=/.test(t)) || '';
        V(irc && !/VACUOUS|off/.test(irc) ? fa.meanSat > fb.meanSat : null, 'Z19 ' + name + ' still: mean saturation rises with coloured IR', 'before ' + fb.meanSat + ' after ' + fa.meanSat + ' | ' + irc.slice(0, 160)); }
    }
  }
  S('§W_COLOUR_TRUTH_GPU ' + (inconcl && !fails ? 'INCONCLUSIVE' : fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE') + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inconcl);
  fs.writeFileSync(path.join(__dirname, 'witness_colour_truth_gpu.log'), LOG.join('\n') + '\n');
  if (fails) process.exitCode = 1; else if (inconcl || !judged) process.exitCode = 2;
})().catch(e => { S('§W_COLOUR_TRUTH_GPU INCONCLUSIVE FATAL ' + e.message); process.exitCode = 2; });
