#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-SLIDE-REAL: a REAL authored door/window slides along its REAL SampleHouse wall on the real Open path,
 * and its hole goes with it. §SLIDE-REAL-WALLS Phase B (spec: bim-compiler prompts/RESUME_MODELLER_LOD400_REAL_GEOMETRY.md
 * §SLIDE-REAL-WALLS; handoff: MODELLER_MASTER.md §HANDOFF-SLIDE-SH step 3). Read the log after every run.
 * Node twin: witness_slide_real_wall.js (W-SLIDE-REAL-WALL, W0 = main's substrate refuses 7/7 — the RED-first control).
 * ISSUE: on main every resident wall carries its opening BAKED into the shipped mesh → the slide REFUSES (a moved door would
 *   leave its hole behind). Phase B seeds each host from its UNCUT body + one GEOM_CUT per authored opening (self-heal patch
 *   modeller/patches/SampleHouse_ARC.db.sql → slide_hosts / slide_openings), so the hole is an op that rides the door (§CUT-MOVE).
 * CLAIMS (numbers off app state + raycasts against the HOST mesh only — never pixels):
 *   POPULATION (M5, 2026-09-30b): SampleHouse has 7 authored fills on 3 hosts, but only host 3cUkl32yn9qRSPvBJVyWXt
 *                (IfcBooleanClippingResult, 2 doors) has an uncut body in the source; the other two are IfcFacetedBrep
 *                bodies that already carry their 5 openings → the generator refuses them (named) and they keep today's
 *                honest slide refusal (E7). Found by THIS witness: with all 7 seeded, E5 read the old hole still open.
 *   E0 SEED      real Open logs `§SLIDE-SEED building=SampleHouse uncutHosts=1/1 openings=2 cuts=2`; 2 active GEOM_CUT rows carry `slide`
 *   E1 PROMOTED  the host fid is in Bonsai._computeSeeds(activeOps).promoted; NO `§LAYER-SOLID-SEED-REFUSE` line
 *   E2 FRAME     each rendered host's world AABB == DB truth: element_transforms.center + the SERVED baked mesh AABB (≤1 mm)
 *   E3 CUT       before any drag, a thickness-axis ray through EVERY opening centre passes the host (open ×7), and a ray through a
 *                host point clear of all openings hits it (solid) — the kernel re-cut the uncut body where the source baked it
 *   E4 DRAG      a REAL item-tool drag (#b-itemdrag → pointerdown on the door → move along the wall → pointerup) commits exactly
 *                GEOM_MOVE{parent:door} + GEOM_CUT_MOVE{cutId: the door's own cut} in ONE gesture gid, same delta
 *   E5 HOLE      after the fold: a ray at the OLD opening centre HITS the host (solid now) and at the NEW centre PASSES (open)
 *   E6 UNDO      ONE Ctrl+Z → active length back to pre, door centre restored ≤1e-6 m, OLD centre open again, NEW centre solid again
 *   E7 REFUSED   the 5 fillings on the 2 brep hosts still REFUSE the slide on the real page (no hole ever left behind)
 * E2E_URL=<live modeller.html> runs the SAME witness against the deployed page.
 */
'use strict';
const fs = require('fs'), path = require('path');
const { runE2E } = require('./e2e_harness');
const URL = process.env.E2E_URL || undefined;
const ROOT = path.join(__dirname, '..');

// DB truth in node: ARC.db element_transforms + the SERVED geo db (same object the page fetches; cached by witness_slide_real_wall.js)
async function dbTruth() {
  const initSqlJs = require(path.join(ROOT, 'lib', 'sql-wasm.js'));
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm')) });
  const swo = fs.readFileSync(path.join(ROOT, 'str_walker_outliner.js'), 'utf8');
  const base = (swo.match(/var GEO_BASE = '([^']+)'/) || [])[1];
  const m = swo.match(/key: 'SampleHouse',[^\n]*?geoDb: '([^']+)',\s*geoV: (\d+)/);
  const dir = path.join(process.env.HOME, '.cache', 'bim-modeller-geo'); fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, 'v' + m[2] + '_' + m[1]);
  if (!fs.existsSync(fp)) { const r = await fetch(base + m[1] + '?v=' + m[2]); fs.writeFileSync(fp, Buffer.from(await r.arrayBuffer())); }
  const arc = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ROOT, 'SampleHouse_ARC.db'))));
  const geo = new SQL.Database(new Uint8Array(fs.readFileSync(fp)));
  arc.run(fs.readFileSync(path.join(ROOT, 'patches', 'SampleHouse_ARC.db.sql'), 'utf8'));
  const hosts = arc.exec('SELECT h.host_guid, h.baked_hash, t.center_x, t.center_y, t.center_z FROM slide_hosts h JOIN element_transforms t ON t.guid=h.host_guid')[0].values;
  const out = {};
  for (const [g, bh, cx, cy, cz] of hosts) {
    const v = geo.exec("SELECT vertices FROM component_geometries WHERE geometry_hash='" + bh + "'")[0].values[0][0];
    const f = new Float32Array(v.buffer, v.byteOffset, v.byteLength / 4); const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let i = 0; i < f.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], f[i + k]); mx[k] = Math.max(mx[k], f[i + k]); }
    out[g] = [cx + mn[0], cx + mx[0], cy + mn[1], cy + mx[1], cz + mn[2], cz + mx[2]];
  }
  const openings = arc.exec('SELECT opening_guid, host_guid, filling_guid, x0,y0,z0,x1,y1,z1 FROM slide_openings')[0].values
    .map(v => ({ opening: v[0], host: v[1], filling: v[2], c1: [v[3], v[4], v[5]], c2: [v[6], v[7], v[8]] }));
  return { hostAABB: out, openings, geoFile: fp };
}

runE2E('W-E2E-SLIDE-REAL', async (t) => {
  const pg = t.pg;
  const truth = await dbTruth();
  console.log('  §SLIDE-E2E dbTruth geo=' + truth.geoFile + ' hosts=' + Object.keys(truth.hostAABB).length + ' openings=' + truth.openings.length);

  await t.open('SampleHouse');
  await pg.waitForFunction(() => !!(window.__arcFidByGuid && window.swXEdges && window.swXEdges.fills && window.swXEdges.fills.length), { timeout: 30000 }).catch(() => {});
  { const t1 = Date.now(); while (Date.now() - t1 < 30000 && !t.slog.some(l => /§SLIDE-SEED building=SampleHouse/.test(l))) await t.sleep(300); }

  // E0 — seed
  const seedLine = t.slog.find(l => /§SLIDE-SEED building=SampleHouse/.test(l)) || '';
  console.log('    app: ' + seedLine.slice(0, 200));
  const cuts = await pg.evaluate(() => window.Bonsai.oplog._geomOps().filter(o => o.op_type === 'GEOM_CUT' && o.parameters && o.parameters.slide).map(o => ({ id: o.id, parent: o.parameters.parent, void: o.parameters.void, slide: o.parameters.slide })));
  t.assert('E0 SEED (real Open: §SLIDE-SEED uncutHosts=1/1 openings=2 cuts=2; 2 active GEOM_CUT rows carry `slide`)',
    /uncutHosts=1\/1 openings=2 cuts=2/.test(seedLine) && cuts.length === 2, 'cutRows=' + cuts.length);
  if (cuts.length !== 2) { console.log('W-E2E-SLIDE-REAL: INCONCLUSIVE past E0 — the slide seed did not land; E1-E6 judge nothing'); return; }

  // E1 — promoted, no refuse
  const hostFids = await pg.evaluate((guids) => guids.map(g => window.__arcFidByGuid[g]), Object.keys(truth.hostAABB));
  const prom = await pg.evaluate((hf) => { const s = window.Bonsai._computeSeeds(window.Bonsai.oplog._geomOps()); return hf.map(f => s.promoted.has(f)); }, hostFids);
  const refuse = t.slog.filter(l => /§LAYER-SOLID-SEED-REFUSE/.test(l));
  console.log('  §SLIDE-E2E hosts=' + JSON.stringify(hostFids) + ' promoted=' + JSON.stringify(prom) + ' refuseLines=' + refuse.length);
  t.assert('E1 PROMOTED (the host fid in Bonsai._computeSeeds(active).promoted; no §LAYER-SOLID-SEED-REFUSE)', prom.length === 1 && prom.every(Boolean) && refuse.length === 0, JSON.stringify(prom) + ' refuse=' + refuse.length);

  // E2 — frame
  const aabbs = await pg.evaluate((hf) => hf.map(f => { const m = window.Bonsai.group().children.find(o => o.isMesh && o.userData.featureId === f); if (!m) return null; const b = new window.THREE.Box3().setFromObject(m); const pos = m.geometry.attributes.position, idx = m.geometry.index; return { a: [b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z], tris: (idx ? idx.count : pos.count) / 3 }; }), hostFids);
  const dFrame = Object.keys(truth.hostAABB).map((g, i) => aabbs[i] ? Math.max(...aabbs[i].a.map((x, k) => Math.abs(x - truth.hostAABB[g][k]))) : Infinity);
  console.log('  §SLIDE-E2E frame rendered=' + JSON.stringify(aabbs.map(x => x && { tris: x.tris, a: x.a.map(v => +v.toFixed(4)) })) + ' dbTruth=' + JSON.stringify(Object.values(truth.hostAABB).map(a => a.map(v => +v.toFixed(4)))) + ' Δmax=' + JSON.stringify(dFrame.map(v => +v.toFixed(5))));
  t.assert('E2 FRAME (rendered host world AABB == element_transforms.center + served baked mesh AABB ≤1 mm)', dFrame.every(d => d <= 1e-3), 'Δ=' + JSON.stringify(dFrame.map(v => +v.toFixed(5))));

  // raycast probe against ONE host mesh along its thickness axis (the host's thinner XY extent) → 'solid' | 'open'
  const probe = (hostFid, x, y, z) => pg.evaluate((f, x, y, z) => {
    const m = window.Bonsai.group().children.find(o => o.isMesh && o.userData.featureId === f); if (!m) return 'nomesh';
    const b = new window.THREE.Box3().setFromObject(m); const thinX = (b.max.x - b.min.x) < (b.max.y - b.min.y);
    const o = new window.THREE.Vector3(thinX ? b.min.x - 1 : x, thinX ? y : b.min.y - 1, z), d = new window.THREE.Vector3(thinX ? 1 : 0, thinX ? 0 : 1, 0);
    const rc = new window.THREE.Raycaster(o, d, 0, (thinX ? b.max.x - b.min.x : b.max.y - b.min.y) + 2);
    m.updateMatrixWorld(true); return rc.intersectObject(m, false).length ? 'solid' : 'open';
  }, hostFid, x, y, z);
  // open intervals along a host's long axis at height z (1 cm steps) — evidence line for where the holes ARE
  const openSpans = (hostFid, z) => pg.evaluate((f, z) => {
    const m = window.Bonsai.group().children.find(o => o.isMesh && o.userData.featureId === f); if (!m) return null;
    const b = new window.THREE.Box3().setFromObject(m); const thinX = (b.max.x - b.min.x) < (b.max.y - b.min.y); m.updateMatrixWorld(true);
    const lo = thinX ? b.min.y : b.min.x, hi = thinX ? b.max.y : b.max.x, out = []; let cur = null;
    for (let L = lo + 0.005; L < hi; L += 0.01) {
      const o = new window.THREE.Vector3(thinX ? b.min.x - 1 : L, thinX ? L : b.min.y - 1, z), d = new window.THREE.Vector3(thinX ? 1 : 0, thinX ? 0 : 1, 0);
      const open = !new window.THREE.Raycaster(o, d, 0, 5).intersectObject(m, false).length;
      if (open && !cur) cur = [L, L]; else if (open) cur[1] = L; else if (cur) { out.push(cur.map(v => +v.toFixed(2))); cur = null; }
    }
    if (cur) out.push(cur.map(v => +v.toFixed(2))); return out;
  }, hostFid, z);
  const ctr = v => [(v.c1[0] + v.c2[0]) / 2, (v.c1[1] + v.c2[1]) / 2, (v.c1[2] + v.c2[2]) / 2];

  // E3 — every opening is cut, a clear point is solid
  const e3 = [];
  for (const c of cuts) { const p = ctr(c.void); e3.push({ cut: c.id, host: c.parent, at: p.map(v => +v.toFixed(3)), got: await probe(c.parent, p[0], p[1], p[2]) }); }
  const solidCtl = [];
  for (let i = 0; i < hostFids.length; i++) {           // a host point clear of every opening on it: scan along the long axis at z = 0.5 m above the base
    const a = aabbs[i].a, longX = (a[1] - a[0]) > (a[3] - a[2]), mine = cuts.filter(c => c.parent === hostFids[i]);
    let pt = null;
    for (let s = 0.05; s < 0.96 && !pt; s += 0.05) {
      const L = longX ? a[0] + s * (a[1] - a[0]) : a[2] + s * (a[3] - a[2]), z = a[4] + 0.5;
      const inHole = mine.some(c => { const lo = longX ? c.void.c1[0] : c.void.c1[1], hi = longX ? c.void.c2[0] : c.void.c2[1]; return L > lo - 0.05 && L < hi + 0.05 && z > c.void.c1[2] - 0.05 && z < c.void.c2[2] + 0.05; });
      if (!inHole) pt = longX ? [L, (a[2] + a[3]) / 2, z] : [(a[0] + a[1]) / 2, L, z];
    }
    solidCtl.push({ host: hostFids[i], at: pt && pt.map(v => +v.toFixed(3)), got: pt ? await probe(hostFids[i], pt[0], pt[1], pt[2]) : 'no-clear-point' });
  }
  console.log('  §SLIDE-E2E cut-probe openings=' + JSON.stringify(e3) + ' solidControls=' + JSON.stringify(solidCtl));
  t.assert('E3 CUT (a thickness-axis ray through each of the 2 opening centres PASSES the host; a clear host point HITS it)',
    e3.length === 2 && e3.every(r => r.got === 'open') && solidCtl.length === 1 && solidCtl.every(r => r.got === 'solid'), 'open=' + e3.filter(r => r.got === 'open').length + '/2 solidCtl=' + solidCtl.filter(r => r.got === 'solid').length + '/1');
  t.slog.filter(l => /§CUT-THROUGH/.test(l)).slice(0, 2).forEach(l => console.log('    app: ' + l.slice(0, 200)));

  // E4 — pick a door/window whose slide admits a shift ≥ its own half-width + 5 cm (so the OLD centre must become solid), pre-screened
  // with the production canDropAt, then do the REAL drag.
  const plan = await pg.evaluate((cutsIn) => {
    const exitItemDrag = () => document.getElementById('b-itemdrag').click();   // the button toggles the armed mode off (module-scoped exitItemDrag)
    const out = [];
    for (const c of cutsIn) {
      const f = c.slide.fillingFid; if (f == null) continue;
      if (!window.__armItemDrag(f, {})) { exitItemDrag(); continue; }
      const s = window.Bonsai.itemdrag._session; if (!s || !s.slide) { exitItemDrag(); continue; }
      const K = s.slide.axis, w = c.void.c2[K] - c.void.c1[K], need = w / 2 + 0.05;
      for (const t of [need, -need, need + 0.1, -(need + 0.1)]) {
        if (t < s.slide.tMin || t > s.slide.tMax) continue;
        const p = s.preCentre.slice(); p[K] += t;
        const v = window.Bonsai.itemdrag.canDropAt(p[0], p[1], p[2]);
        if (v.valid) { out.push({ fid: f, cut: c.id, host: c.parent, K, t, w, pre: s.preCentre.slice(), tMin: s.slide.tMin, tMax: s.slide.tMax }); break; }
      }
      exitItemDrag();
      if (out.length) break;
    }
    return out[0] || null;
  }, cuts);
  console.log('  §SLIDE-E2E plan ' + JSON.stringify(plan));
  if (!plan) { t.assert('E4 DRAG (a real filling admits a hole-clearing slide)', false, 'INCONCLUSIVE — no filling admits a valid shift ≥ w/2+5cm'); return; }
  const myCut = cuts.find(c => c.id === plan.cut), oldC = ctr(myCut.void), newC = oldC.slice(); newC[plan.K] += plan.t;
  const pre = { old: await probe(plan.host, ...oldC), neu: await probe(plan.host, ...newC) };
  console.log('  §SLIDE-E2E host ' + plan.host + ' open spans @z=' + oldC[2].toFixed(3) + ' BEFORE drag: ' + JSON.stringify(await openSpans(plan.host, oldC[2])));

  await t.flySettle();
  await pg.click('#b-itemdrag'); await t.sleep(300);
  // camera face-on to the wall's thin axis (the harness's §L3-AIM placement) so the wall's run is ACROSS the screen and the
  // door's own face is the first raycast hit — a drag along an end-on wall would project to t≈0 (measured: t=-0.000).
  // The handler intersects the pointer ray with a HORIZONTAL plane at the door's own height, so the camera must look DOWN
  // on it (a level camera at door height is parallel to that plane — measured: committed t=-0.000). Stand off the wall's
  // thin side (1.5-3 m), 0.5-1.2 m above the door centre, target the door centre; first placement whose door face is the
  // first raycast hit wins — pure camera maths off the host AABB.
  const fr = await pg.evaluate((f, hf) => {
    const g = window.Bonsai.group(), m = g.children.find(o => o.isMesh && o.userData.featureId === f), hm = g.children.find(o => o.isMesh && o.userData.featureId === hf);
    const b = new window.THREE.Box3().setFromObject(m), hb = new window.THREE.Box3().setFromObject(hm), c = b.getCenter(new window.THREE.Vector3());
    const thinX = (hb.max.x - hb.min.x) < (hb.max.y - hb.min.y), cam = window.A.camera, ctl = window.A.controls, out = [];
    for (const up of [0.5, 0.8, 1.2]) for (const dist of [1.5, 2.2, 3.0]) for (const side of [1, -1]) {
      cam.position.set(c.x + (thinX ? side * dist : 0), c.y + (thinX ? 0 : side * dist), c.z + up); ctl.target.copy(c); ctl.update(); cam.updateMatrixWorld(true);
      const pt = window.__e2e.clickPointFor(f); if (pt) { if (window.A.requestRender) window.A.requestRender(); return { side, up, dist, pt, cam: cam.position.toArray().map(v => +v.toFixed(2)) }; }
    }
    return null;
  }, plan.fid, plan.host);
  let pt = fr && fr.pt;
  console.log('  §SLIDE-E2E aim ' + JSON.stringify(fr));
  if (!pt) { t.assert('E4 DRAG (the door is clickable)', false, 'INCONCLUSIVE — no verified click point on fid ' + plan.fid); return; }
  const before = await t.oplog();
  // drag target: the screen point of the door's own centre shifted by t along the wall, at the door's height (the handler's plane)
  const a0 = await t.proj(plan.pre[0], plan.pre[1], plan.pre[2]);
  const tgt = plan.pre.slice(); tgt[plan.K] += plan.t; const a1 = await t.proj(tgt[0], tgt[1], tgt[2]);
  const end = [pt[0] + (a1[0] - a0[0]), pt[1] + (a1[1] - a0[1])];
  // the handler raycasts the grab point's plane at z=preCentre; the grab pixel is on the door face, so the drop = pick-plane hit;
  // aim the pointer so the PLANE hit lands at the target: move from a0 (the centre's pixel) to a1 after the grab.
  await pg.mouse.move(pt[0], pt[1]); await t.sleep(60); await pg.mouse.down(); await t.sleep(120);
  await pg.mouse.move(a0[0], a0[1], { steps: 4 }); await t.sleep(80);
  await pg.mouse.move((a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2, { steps: 5 }); await t.sleep(120);
  await pg.mouse.move(a1[0], a1[1], { steps: 5 }); await t.sleep(200);
  await pg.mouse.up(); await t.sleep(2500);
  { const t0 = Date.now(); while (Date.now() - t0 < 20000 && (await t.oplog()).len === before.len) await t.sleep(300); await t.sleep(800); }
  const after = await t.oplog();
  const added = await pg.evaluate(n => { const O = window.Bonsai.oplog, gidOf = new Map(O._allGeom().map(o => [o.id, o.gid])); return O._geomOps().slice(n).map(o => ({ id: o.id, op_type: o.op_type, gid: gidOf.get(o.id), p: o.parameters })); }, before.len);
  t.slog.filter(l => /§ITEMDRAG commit|§CUT-MOVE|commitGesture gid|§SLIDE REFUSED|REFUSED drop/.test(l)).slice(-6).forEach(l => console.log('    app: ' + l.slice(0, 240)));
  const mv = added.find(o => o.op_type === 'GEOM_MOVE' && o.p.parent === plan.fid), cm = added.find(o => o.op_type === 'GEOM_CUT_MOVE');
  const dk = plan.K === 0 ? 'dx' : 'dy';
  console.log('  §SLIDE-E2E drag oplog ' + before.len + '→' + after.len + ' added=' + JSON.stringify(added.map(o => ({ id: o.id, t: o.op_type, gid: o.gid, p: o.p }))) + ' end=' + JSON.stringify(end.map(v => +v.toFixed(1))));
  t.assert('E4 DRAG (real item-tool drag commits GEOM_MOVE{door} + GEOM_CUT_MOVE{its own cut, parent host} in ONE gesture gid, same delta)',
    added.length === 2 && !!mv && !!cm && cm.p.cutId === plan.cut && String(cm.p.parent) === String(plan.host) && mv.gid === cm.gid && /^gesture-grp-/.test(mv.gid || '') && Math.abs(cm.p[dk] - mv.p[dk]) < 1e-12 && Math.abs(mv.p[dk]) > 0.01,
    'rows=' + added.length + ' gid=' + (mv && mv.gid) + ' door' + dk + '=' + (mv && mv.p[dk]) + ' cut' + dk + '=' + (cm && cm.p[dk]));
  if (!mv || !cm) return;

  // E5 — the hole moved: probe at the ACTUAL committed shift
  const shift = mv.p[dk], oldC2 = oldC.slice(), newC2 = oldC.slice(); newC2[plan.K] += shift;
  const post = { old: await probe(plan.host, ...oldC2), neu: await probe(plan.host, ...newC2) };
  const preNew = pre.neu;
  console.log('  §SLIDE-E2E host ' + plan.host + ' open spans @z=' + oldC[2].toFixed(3) + ' AFTER drag: ' + JSON.stringify(await openSpans(plan.host, oldC[2])) + ' (want the authored span + ' + shift.toFixed(3) + ')');
  console.log('  §SLIDE-E2E hole shift=' + shift.toFixed(4) + ' (w=' + plan.w.toFixed(3) + ') oldCentre=' + JSON.stringify(oldC2.map(v => +v.toFixed(3))) + ' newCentre=' + JSON.stringify(newC2.map(v => +v.toFixed(3))) + ' pre{old,new}=' + JSON.stringify(pre) + ' post{old,new}=' + JSON.stringify(post));
  t.assert('E5 HOLE (after the fold: OLD opening centre is SOLID, NEW centre is OPEN; before the drag it was the reverse)',
    Math.abs(shift) >= plan.w / 2 && pre.old === 'open' && preNew === 'solid' && post.old === 'solid' && post.neu === 'open', 'pre=' + JSON.stringify(pre) + ' post=' + JSON.stringify(post) + ' |shift|=' + Math.abs(shift).toFixed(3) + ' w/2=' + (plan.w / 2).toFixed(3));

  // E6 — ONE Ctrl+Z
  const doorPost = await t.centre(plan.fid);
  await pg.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
  await pg.keyboard.down('Control'); await pg.keyboard.press('KeyZ'); await pg.keyboard.up('Control'); await t.sleep(2500);
  { const t0 = Date.now(); while (Date.now() - t0 < 20000 && (await t.oplog()).len !== before.len) await t.sleep(300); await t.sleep(600); }
  const u = await t.oplog(), doorBack = await t.centre(plan.fid);
  const doorPre = [doorPost[0] - (dk === 'dx' ? shift : 0), doorPost[1] - (dk === 'dy' ? shift : 0), doorPost[2]];
  const dBack = Math.hypot(doorBack[0] - doorPre[0], doorBack[1] - doorPre[1], doorBack[2] - doorPre[2]);
  const und = { old: await probe(plan.host, ...oldC2), neu: await probe(plan.host, ...newC2) };
  t.slog.filter(l => /§GESTURE-UNDO|undo id=/.test(l)).slice(-2).forEach(l => console.log('    app: ' + l.slice(0, 200)));
  console.log('  §SLIDE-E2E undo len ' + after.len + '→' + u.len + ' doorResidual=' + dBack.toExponential(2) + ' probes{old,new}=' + JSON.stringify(und));
  t.assert('E6 UNDO (ONE Ctrl+Z → length back to pre, door centre restored ≤1e-6 m, OLD centre open again, NEW centre solid again)',
    u.len === before.len && dBack < 1e-6 && und.old === 'open' && und.neu === 'solid', 'len=' + u.len + '/' + before.len + ' dBack=' + dBack.toExponential(2) + ' ' + JSON.stringify(und));

  // E7 — the brep hosts' fillings still refuse on the real page
  const slideFills = new Set(cuts.map(c => c.slide.filling));
  const e7 = await pg.evaluate((sf) => {
    const exitItemDrag = () => document.getElementById('b-itemdrag').click(), fbg = window.__arcFidByGuid, out = [];
    for (const e of window.swXEdges.fills) {
      if (sf.indexOf(e.filling_guid) >= 0) continue;
      const f = fbg[e.filling_guid], h = fbg[e.host_guid]; if (f == null || h == null) continue;
      const ok = window.__armItemDrag(f, {}); const s = window.Bonsai.itemdrag._session;
      out.push({ fid: f, host: h, slide: !!(ok && s && s.slide) }); exitItemDrag();
    }
    return out;
  }, Array.from(slideFills));
  console.log('  §SLIDE-E2E refused-population ' + JSON.stringify(e7));
  t.assert('E7 REFUSED (the 5 fillings on the 2 IfcFacetedBrep hosts still refuse the slide — their bodies carry the openings)', e7.length === 5 && e7.every(r => !r.slide), 'refused=' + e7.filter(r => !r.slide).length + '/' + e7.length);
}, { width: 1280, height: 860, dpr: 1, url: URL });
