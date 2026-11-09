#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-TYPESET-ZOOM: real-user witness for §TYPESET (bim-compiler
 * prompts/MODELLER_ZOOM_TO_SELECTION.md §TYPESET, MODELLER_MASTER §RESUME 2026-11-10 prep item 1).
 * Read the log after every run.
 * ISSUES IT PROVES OR DISPROVES:
 *   (1) a Walked Fixtures CLASS row (dwc|disc|cls) click selects and frames NOTHING — selectSubtree pushes only
 *       numeric featureIds and skips dwp| leaves, and zoomToSelection reads feature meshes only;
 *   (2) the class row shows no count, though dw_instances_outliner.js's own header specifies "LightFixture (230)".
 * Real path: open Duplex → production discWalk('ELEC') → real mouse click on the class row.
 *
 * CLAIMS:
 *   T0 MID-REVEAL-TINT       the class row clicked DURING the build-up reveal (im.count < capacity): once the reveal
 *                            ends every instance carries the tint (measured on the first fix: 62/102 — the colour
 *                            buffer was sized to the live count).
 *   T1 SET-TINTED            every instance of the clicked class carries the pick tint 0x4fc3f7; count = the class's
 *                            leaf count in __dwWalks. RED on main (0 tinted).
 *   T2 FRAME-FILL            controls.target = union box centre ≤1e-3; camera distance = frustum-fit distance
 *                            recomputed HERE from box size + fov + aspect ≤1e-3; every instance's centre projects inside
 *                            NDC [-1,1]; the union box's larger projected half-extent ≥ 0.8 (the set fills the frame).
 *   T3 HIDDEN-EXCLUDED       eye-hide one instance (real eye click), click the class row again: tinted = n−1,
 *                            §INSTSET-SELECT hidden=1.
 *   T4 CLEAR                 Escape restores every tinted instance's prior colour.
 *   T5 COUNT-LABEL           every rendered class row label ends "(n)" with n = its leaf count.
 *   T6 FEATURE-PATH-UNCHANGED a non-walked tree category header click still selects via selectMany (§OLGROUPSELECT n>0).
 *   M1 (measurement)         after the walk: Walked Fixtures header present? collapsed? inside the visible scroll window?
 *                            (main, measured: present, expanded, header y=8159 px vs view 84-822 px — off-screen)
 *   T7 REVEAL-ON-WALK        after the walk the header is inside the Outliner view and §OL-REVEAL cat=dwinst is logged.
 */
'use strict';
const { runE2E } = require('./e2e_harness');

// Frustum-fit distance, recomputed independently of the page (MODELLER_ZOOM_TO_SELECTION.md source block,
// Z-up adaptation: offset dir (1,-1,1.3) normalised, world up +Z).
function fitDist(size, fovDeg, aspect) {
  const n = Math.hypot(1, -1, 1.3), d = [1 / n, -1 / n, 1.3 / n];
  const fwd = d.map(v => -v);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(a[0], a[1], a[2]); return a.map(v => v / l); };
  const right = norm(cross(fwd, [0, 0, 1])), up = norm(cross(right, fwd));
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  let hW = 0, hH = 0, hD = 0;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const c = [sx * size[0] / 2, sy * size[1] / 2, sz * size[2] / 2];
    hW = Math.max(hW, Math.abs(dot(c, right))); hH = Math.max(hH, Math.abs(dot(c, up))); hD = Math.max(hD, Math.abs(dot(c, fwd)));
  }
  const tanV = Math.tan(fovDeg * Math.PI / 360), tanH = tanV * aspect;
  return (Math.max(hH / tanV, hW / tanH) + hD * 0.3) * 1.03;
}

// In-page: resolve each record of disc/cls to its first (im,i) twin — same scan order as _instRefMap — and
// read tint, hidden state, and the instance's world box.
const READ_SET = (disc, cls) => {
  const g = window.Bonsai.group(); const root = g.children.find(o => o.userData && o.userData.dwRoot);
  const W = (window.__dwWalks && window.__dwWalks[disc]) || [];
  const recs = new Set(W.filter(p => ((p && p.ifc_class) || (p && p.piece_type) || 'Unknown') === cls));
  const first = new Map();
  root.children.forEach(im => {
    if (!im.isInstancedMesh || !Array.isArray(im.userData.dwSub)) return;
    im.userData.dwSub.forEach((p, i) => { if (recs.has(p) && !first.has(p)) first.set(p, { im, i }); });
  });
  const T = [0x4f / 255, 0xc3 / 255, 0xf7 / 255];
  const m4 = new THREE.Matrix4(), out = [];
  first.forEach((r, p) => {
    const a = r.im.instanceColor;
    const rgb = a ? [a.getX(r.i), a.getY(r.i), a.getZ(r.i)] : [1, 1, 1];
    r.im.geometry.computeBoundingBox();
    r.im.getMatrixAt(r.i, m4);
    const bb = r.im.geometry.boundingBox.clone().applyMatrix4(m4.premultiply(r.im.matrixWorld));
    out.push({ idx: W.indexOf(p), tinted: rgb.every((v, j) => Math.abs(v - T[j]) < 0.02), rgb,
      hidden: !!(r.im.userData.dwHidden && r.im.userData.dwHidden.has(r.i)),
      min: bb.min.toArray(), max: bb.max.toArray() });
  });
  return { n: recs.size, resolved: first.size, rows: out };
};

runE2E('W-E2E-TYPESET-ZOOM', async (t) => {
  await t.open('Duplex');
  await t.pg.evaluate(() => window.discWalk('ELEC', { building: 'Duplex' }));
  await t.pg.waitForFunction(() => {
    const g = window.Bonsai.group(); const root = g && g.children.find(o => o.userData && o.userData.dwRoot);
    return !!(root && root.children.some(o => o.isInstancedMesh && o.userData.dwDisc === 'ELEC'));
  }, { timeout: 30000 }).catch(() => {});
  await t.pg.waitForFunction(() => !!document.querySelector('[data-bnode^="dwc|ELEC|"]'), { timeout: 30000 }).catch(() => {});
  await t.sleep(300);
  // M1 — measurement: is the Walked Fixtures category visible after a walk, as the user left the panel?
  const m1 = await t.pg.evaluate(() => {
    const ol = window.Bonsai.outliner; if (ol && ol._paint) ol._paint();
    const h = document.querySelector('[data-tcat="dwinst"]:not([data-bnode])');
    if (!h) return { present: false };
    let sc = h.parentElement; while (sc && sc !== document.body) { const s = getComputedStyle(sc); if (/(auto|scroll)/.test(s.overflowY) && sc.scrollHeight > sc.clientHeight) break; sc = sc.parentElement; }
    const r = h.getBoundingClientRect(), cr = (sc && sc !== document.body) ? sc.getBoundingClientRect() : { top: 0, bottom: innerHeight };
    return { present: true, collapsed: !!(ol && ol._collapsed['tcat|dwinst']), headerTop: Math.round(r.top), viewTop: Math.round(cr.top),
      viewBottom: Math.round(cr.bottom), inView: r.top >= cr.top && r.bottom <= cr.bottom, label: h.textContent.trim().slice(0, 60) };
  });
  console.log('§TYPESET-M1 ' + JSON.stringify(m1));
  const rev = t.slog.filter(l => /§OL-REVEAL cat=dwinst/.test(l)).pop() || '';
  t.assert('T7 REVEAL-ON-WALK (after the walk the Walked Fixtures header is inside the Outliner view; §OL-REVEAL logged)',
    !!(m1.present && !m1.collapsed && m1.inView && rev), 'm1=' + JSON.stringify(m1) + ' log="' + rev.slice(0, 80) + '"');

  // T0 — click the class row MID-REVEAL (the §D64 build-up grows im.count for ~9 s after discWalk returns)
  await t.pg.evaluate(() => { const ol = window.Bonsai.outliner; ol._paint(); });
  const mid = await t.pg.evaluate(() => { const g = window.Bonsai.group(); const root = g.children.find(o => o.userData && o.userData.dwRoot);
    const ims = root ? root.children.filter(o => o.isInstancedMesh && o.userData.dwDisc === 'ELEC') : [];
    const shown = ims.reduce((s, im) => s + im.count, 0), cap = ims.reduce((s, im) => s + im.userData.dwSub.length, 0);
    const row = document.querySelector('[data-bnode^="dwc|ELEC|"]');
    return { shown, cap, row: row ? row.getAttribute('data-bnode') : null };
  });
  if (mid.row) await t.pg.click('[data-bnode="' + mid.row + '"]');
  const revealed = await t.pg.waitForFunction(() => { const g = window.Bonsai.group(); const root = g.children.find(o => o.userData && o.userData.dwRoot);
    const ims = root ? root.children.filter(o => o.isInstancedMesh && o.userData.dwDisc === 'ELEC') : [];
    return ims.length && ims.every(im => im.count === im.userData.dwSub.length); }, { timeout: 60000 }).then(() => true).catch(() => false);
  const s0 = mid.row ? await t.pg.evaluate(READ_SET, 'ELEC', mid.row.split('|').slice(2).join('|')) : { n: 0, rows: [] };
  const tinted0 = s0.rows.filter(r => r.tinted).length;
  t.assert('T0 MID-REVEAL-TINT (class row clicked while the build-up shows ' + mid.shown + '/' + mid.cap + ' → after the reveal ends every instance is tinted)',
    !!mid.row && mid.shown < mid.cap && revealed && s0.n > 0 && tinted0 === s0.n,
    'row=' + mid.row + ' shownAtClick=' + mid.shown + '/' + mid.cap + ' revealEnded=' + revealed + ' tinted=' + tinted0 + '/' + s0.n);
  await t.pg.keyboard.press('Escape'); await t.sleep(250);
  await t.flySettle();

  // open every row so class rows + leaves render (the user expands them by chevron; the click under test is the class row)
  await t.pg.evaluate(() => { const ol = window.Bonsai.outliner; ol._collapsed = {}; ol._paint(); });
  const cls = await t.pg.evaluate(() => {
    const W = window.__dwWalks.ELEC || [], by = {};
    W.forEach(p => { const c = (p && p.ifc_class) || (p && p.piece_type) || 'Unknown'; by[c] = (by[c] || 0) + 1; });
    const rows = Array.from(document.querySelectorAll('[data-bnode^="dwc|ELEC|"]')).map(d => {
      const c = d.getAttribute('data-bnode').split('|').slice(2).join('|');
      return { id: d.getAttribute('data-bnode'), cls: c, label: d.textContent.trim(), n: by[c] || 0 };
    });
    // T1 subject: the largest class with ≥2 members (a SET, not a single)
    const pick = rows.filter(r => r.n >= 2).sort((a, b) => b.n - a.n)[0] || null;
    return { rows, pick };
  });
  console.log('§TYPESET classes=' + JSON.stringify(cls.rows.map(r => r.cls + ':' + r.n)) + ' subject=' + (cls.pick && cls.pick.id));

  // T5 — count on every class row label
  const badLbl = cls.rows.filter(r => !new RegExp('\\(' + r.n + '\\)\\s*$').test(r.label));
  t.assert('T5 COUNT-LABEL (class row label ends "(n)", n = its leaf count)', cls.rows.length > 0 && badLbl.length === 0,
    'rows=' + cls.rows.length + ' bad=' + JSON.stringify(badLbl.slice(0, 3).map(r => r.label + ' want(' + r.n + ')')));
  if (!cls.pick) { t.assert('T1 SET-TINTED', false, 'no ELEC class with ≥2 instances'); return; }
  const sel = '[data-bnode="' + cls.pick.id + '"]';

  // T1 — real click on the class row
  await t.pg.click(sel); await t.sleep(300); await t.flySettle();
  const s1 = await t.pg.evaluate(READ_SET, 'ELEC', cls.pick.cls);
  const tinted1 = s1.rows.filter(r => r.tinted).length;
  t.assert('T1 SET-TINTED (every instance of the class tinted 0x4fc3f7, count = leaf count)',
    s1.resolved === s1.n && tinted1 === s1.n, 'class=' + cls.pick.cls + ' n=' + s1.n + ' resolved=' + s1.resolved + ' tinted=' + tinted1 +
    ' log="' + (t.slog.filter(l => /§INSTSET-SELECT/.test(l)).pop() || 'none') + '"');

  // T2 — frame fills: target on the union box centre, distance = frustum-fit, corners in NDC, extent ≥ 0.8
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  s1.rows.filter(r => !r.hidden).forEach(r => { for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], r.min[k]); mx[k] = Math.max(mx[k], r.max[k]); } });
  const ctr = mn.map((v, k) => (v + mx[k]) / 2), size = mn.map((v, k) => mx[k] - v);
  const cam = await t.pg.evaluate((mn, mx) => {
    const c = window.A.camera, ct = window.A.controls; c.updateMatrixWorld();
    const ndc = [];
    for (const x of [mn[0], mx[0]]) for (const y of [mn[1], mx[1]]) for (const z of [mn[2], mx[2]]) { const v = new THREE.Vector3(x, y, z).project(c); ndc.push([v.x, v.y]); }
    return { pos: c.position.toArray(), tgt: ct.target.toArray(), fov: c.fov, aspect: c.aspect, ndc };
  }, mn, mx);
  const dT = Math.hypot(cam.tgt[0] - ctr[0], cam.tgt[1] - ctr[1], cam.tgt[2] - ctr[2]);
  const dist = Math.hypot(cam.pos[0] - cam.tgt[0], cam.pos[1] - cam.tgt[1], cam.pos[2] - cam.tgt[2]);
  const want = fitDist(size, cam.fov, cam.aspect);
  // every instance's own box centre must land on the canvas (the frustum-fit rule fits the box's projected extents,
  // so a near AABB corner can poke past NDC ±1 — measured 0.883 extent with a corner outside — but no instance may)
  const cen = s1.rows.filter(r => !r.hidden).map(r => r.min.map((v, k) => (v + r.max[k]) / 2));
  const cNdc = await t.pg.evaluate(cs => { const c = window.A.camera; return cs.map(p => { const v = new THREE.Vector3(p[0], p[1], p[2]).project(c); return [v.x, v.y]; }); }, cen);
  const inNdc = cNdc.every(p => Math.abs(p[0]) <= 1 && Math.abs(p[1]) <= 1);
  const ext = Math.max(Math.max(...cam.ndc.map(p => p[0])) - Math.min(...cam.ndc.map(p => p[0])),
                       Math.max(...cam.ndc.map(p => p[1])) - Math.min(...cam.ndc.map(p => p[1]))) / 2;
  t.assert('T2 FRAME-FILL (target=union centre ≤1e-3, dist=frustum-fit ≤1e-3, every instance centre in NDC, box extent ≥0.8)',
    dT < 1e-3 && Math.abs(dist - want) < 1e-3 && inNdc && ext >= 0.8,
    'Δtarget=' + dT.toExponential(2) + ' dist=' + dist.toFixed(4) + ' want=' + want.toFixed(4) + ' size=' + size.map(v => v.toFixed(2)).join('x') +
    ' centresInNdc=' + cNdc.filter(p => Math.abs(p[0]) <= 1 && Math.abs(p[1]) <= 1).length + '/' + cNdc.length + ' extent=' + ext.toFixed(3));

  // T3 — eye-hide one instance (real eye click on its leaf row), click the class row again
  const hidIdx = s1.rows.length ? s1.rows[0].idx : -1;
  const eyeSel = '.bn-eye[data-eye="dwp|ELEC|' + hidIdx + '"]';
  const hasEye = await t.pg.evaluate(s => !!document.querySelector(s), eyeSel);
  if (hasEye) { await t.pg.click(eyeSel); await t.sleep(300); }
  await t.pg.click(sel); await t.sleep(300); await t.flySettle();
  const s3 = await t.pg.evaluate(READ_SET, 'ELEC', cls.pick.cls);
  const hidRow = s3.rows.find(r => r.idx === hidIdx);
  const lastSet = t.slog.filter(l => /§INSTSET-SELECT/.test(l)).pop() || '';
  t.assert('T3 HIDDEN-EXCLUDED (eye-hidden instance not tinted; tinted = n−1; log hidden=1)',
    hasEye && !!hidRow && hidRow.hidden && !hidRow.tinted && s3.rows.filter(r => r.tinted).length === s3.n - 1 && /hidden=1\b/.test(lastSet),
    'eye=' + hasEye + ' hiddenRow=' + JSON.stringify(hidRow && { hidden: hidRow.hidden, tinted: hidRow.tinted }) +
    ' tinted=' + s3.rows.filter(r => r.tinted).length + '/' + s3.n + ' log="' + lastSet.slice(0, 120) + '"');

  // T4 — Escape clears the set tint (fresh instanceColor prev = white)
  await t.pg.keyboard.press('Escape'); await t.sleep(250);
  const s4 = await t.pg.evaluate(READ_SET, 'ELEC', cls.pick.cls);
  const still = s4.rows.filter(r => r.tinted).length;
  t.assert('T4 CLEAR (Escape untints every set instance)', tinted1 > 0 && still === 0, 'tintedAfterEsc=' + still + ' (before=' + tinted1 + ')');

  // T6 — a feature (non-walked) tree category header still selects through selectMany
  const fcat = await t.pg.evaluate(() => {
    const hs = Array.from(document.querySelectorAll('[data-tcat]:not([data-bnode])')).filter(h => h.getAttribute('data-tcat') !== 'dwinst');
    return hs.length ? hs[0].getAttribute('data-tcat') : null;
  });
  if (fcat) { await t.pg.click('[data-tcat="' + fcat + '"]:not([data-bnode])'); await t.sleep(300); await t.flySettle(); }
  const gl = t.slog.filter(l => new RegExp('§OLGROUPSELECT cat=' + fcat + ' n=').test(l)).pop() || '';
  const gn = +((/n=(\d+)/.exec(gl) || [])[1] || 0);
  const selN = await t.pg.evaluate(() => (window.Bonsai._selSet ? window.Bonsai._selSet.size : 0));
  t.assert('T6 FEATURE-PATH-UNCHANGED (non-walked category → selectMany, n>0, selection size = n)',
    !!fcat && gn > 0 && selN === gn, 'cat=' + fcat + ' log="' + gl.slice(0, 90) + '" selSet=' + selN);
}, { width: 1200, height: 850, dpr: 1 });
