#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-FLYTHRU-SUBJECTS scope (READ THE LOG after every run)
 * SCOPE: prompts/MEP_CLASH_REVEAL_MOVIE.md §20 — run the SUBJECT MODEL against the real camera path
 * and report what turns up. Tests §20.4's tier-2 prominence (project 8 corners, hull, area/frame)
 * with the camera-INSIDE-BOX guard, NOT the retired `d > r` guard that discarded slabs.
 * Read-only: builds nothing into the viewer, changes no shipped file.
 */
'use strict';
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.env.PORT || '8477';
const DUR = Number(process.env.DUR || 195.8);
const DB  = process.env.DB || 'Hospital_silent_local';
(async () => {
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  p.on('console', m => { const t = m.text(); if (/§FS_|PAGEERROR/.test(t)) console.log('  ' + t); });
  p.on('pageerror', e => console.log('  PAGEERROR ' + e.message));
  await p.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${DB}.db`,
    { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForFunction(() => window.APP && window.APP.cinemaPathPlan, { timeout: 240000 });
  const parts = await p.evaluate(() => (window.APP.dbQuery('SELECT DISTINCT building FROM elements_meta') || []).map(r => r[0]));
  for (const bb of parts) await p.evaluate(x => { try { window.APP.streamBuilding(x); } catch (e) {} }, bb);
  let stable = 0;
  for (let i = 0; i < 400; i++) {
    const st = await p.evaluate(() => (window.APP.status && window.APP.status.textContent) || '');
    const m = st.match(/([\d,]+)\s*\/\s*([\d,]+)/);
    if (!m || m[1].replace(/,/g, '') === m[2].replace(/,/g, '')) { if (++stable >= 4) break; } else stable = 0;
    await sleep(3000);
  }
  await sleep(4000);
  console.log('§FS_STREAM settled — scoring subjects');

  const out = await p.evaluate((dur) => {
    const A = window.APP, T = window.THREE, R = { classes: {}, top: [], errs: [] };
    const W = 1280, H = 720, FLOOR = 0.0225, MIN_HOLD = 2.0, N = 300, CAP = 160;
    const q = s => { try { return A.dbQuery(s) || []; } catch (e) { R.errs.push(e.message); return []; } };
    const i2t = (x, y, z) => A.ifc2three(x, y, z);
    // box from IFC centre+size -> scene Box3 (both corners re-min/maxed: the axis swap moves them)
    function box(cx, cy, cz, sx, sy, sz) {
      const a = i2t(cx - sx / 2, cy - sy / 2, cz - sz / 2), b2 = i2t(cx + sx / 2, cy + sy / 2, cz + sz / 2);
      return new T.Box3(new T.Vector3(Math.min(a.x, b2.x), Math.min(a.y, b2.y), Math.min(a.z, b2.z)),
                        new T.Vector3(Math.max(a.x, b2.x), Math.max(a.y, b2.y), Math.max(a.z, b2.z)));
    }
    // ── candidates, by TYPE (§20.1 — the type list IS the noise filter) ──────────────────────────
    const cands = [];
    const push = (cls, name, bx) => { const s = bx.getSize(new T.Vector3());
      if (s.x > 0 && s.y > 0 && s.z > 0) cands.push({ cls, name, box: bx, diag: s.length() }); };
    // A · spaces: rooms (union of sub-rects per room_guid)
    const rr = q("SELECT room_guid,name,center_x,center_y,center_z,size_x,size_y,size_z FROM spatial_structure WHERE type='IfcSpace' AND center_x IS NOT NULL");
    const byRoom = {};
    rr.forEach(r => { const g = r[0] || r[1]; const bx = box(r[2], r[3], r[4], r[5], r[6], r[7]);
      if (!byRoom[g]) byRoom[g] = { n: r[1], b: bx.clone() }; else byRoom[g].b.union(bx); });
    Object.keys(byRoom).forEach(g => push('room', g, byRoom[g].b));
    // B · per-storey SLAB union, and the largest individual slabs
    const sl = q("SELECT m.storey,t.center_x,t.center_y,t.center_z,t.bbox_x,t.bbox_y,t.bbox_z FROM element_transforms t JOIN elements_meta m ON m.guid=t.guid WHERE m.ifc_class='IfcSlab'");
    R.slabRows = sl.length;
    const byS = {};
    sl.forEach(r => { const k = String(r[0] || '?').replace(/\s+(Ceiling|TOS)$/i, '');
      const bx = box(r[1], r[2], r[3], r[4], r[5], r[6]);
      if (!byS[k]) byS[k] = bx.clone(); else byS[k].union(bx); });
    Object.keys(byS).forEach(k => { if (k !== '?' && k !== 'Unknown') push('slabStorey', k, byS[k]); });
    sl.map(r => ({ r, d: Math.hypot(r[4], r[5], r[6]) })).sort((a, b2) => b2.d - a.d).slice(0, CAP)
      .forEach(o => push('slab', 'slab', box(o.r[1], o.r[2], o.r[3], o.r[4], o.r[5], o.r[6])));
    // B · openings and walls — largest CAP of each class
    [['IfcDoor', 'door'], ['IfcWindow', 'window'], ['IfcWallStandardCase', 'wall'], ['IfcCurtainWall', 'curtainwall']].forEach(cw => {
      const rows = q("SELECT t.center_x,t.center_y,t.center_z,t.bbox_x,t.bbox_y,t.bbox_z FROM element_transforms t JOIN elements_meta m ON m.guid=t.guid WHERE m.ifc_class='" + cw[0] + "'");
      R.classes[cw[1] + 'Rows'] = rows.length;
      rows.map(r => ({ r, d: Math.hypot(r[3], r[4], r[5]) })).sort((a, b2) => b2.d - a.d).slice(0, CAP)
        .forEach(o => push(cw[1], cw[1], box(o.r[0], o.r[1], o.r[2], o.r[3], o.r[4], o.r[5])));
    });
    R.candidates = cands.length;

    // ── camera path ──────────────────────────────────────────────────────────────────────────────
    let plan = null; try { plan = A.cinemaPathPlan(dur); } catch (e) { R.errs.push('plan ' + e.message); }
    const cam = new T.PerspectiveCamera(A.camera ? A.camera.fov : 60, W / H, 0.1, 5000);
    const poses = [];
    // Envelope of all candidates — also the fallback orbit's frame.
    const env = new T.Box3(); cands.forEach(c => env.union(c.box));
    if (plan && typeof plan.poseAt === 'function') {
      R.pathSource = 'cinema_path (plan.poseAt)';
      for (let i = 0; i <= N; i++) { const pz = plan.poseAt(i / N);
        poses.push({ t: (i / N) * dur, p: new T.Vector3(pz.x, pz.y, pz.z), tg: new T.Vector3(pz.tx, pz.ty, pz.tz) }); }
    } else {
      // §GENERALISATION: a building with no saved path still exercises the maths. A descending orbit
      // is NOT the film — it is a neutral probe path, and results from it must be labelled as such.
      R.pathSource = 'SYNTHETIC descending orbit (no cinema_path in this DB) — not the film';
      const c0 = env.getCenter(new T.Vector3()), sz = env.getSize(new T.Vector3()), rad = sz.length() * 0.55;
      for (let i = 0; i <= N; i++) { const u = i / N, a = u * Math.PI * 2;
        poses.push({ t: u * dur,
          p: new T.Vector3(c0.x + rad * Math.cos(a), env.max.y + sz.y * (0.9 - 0.7 * u), c0.z + rad * Math.sin(a)),
          tg: c0.clone() }); }
    }

    // ── §20.4 tier-2 prominence: project 8 corners, clip behind near plane, hull, area/frame ──────
    const NEAR = 0.1;
    const EDGES = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
    function polyArea(h) { let s2 = 0;
      for (let i = 0; i < h.length; i++) { const a = h[i], b2 = h[(i + 1) % h.length]; s2 += a.x * b2.y - b2.x * a.y; }
      return Math.abs(s2) / 2; }
    function hullPoly(pts) {
      if (pts.length < 3) return pts;
      pts = pts.slice().sort((a, b2) => a.x - b2.x || a.y - b2.y);
      const cross = (o, a, b2) => (a.x - o.x) * (b2.y - o.y) - (a.y - o.y) * (b2.x - o.x);
      const lo = [], up = [];
      for (const q2 of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q2) <= 0) lo.pop(); lo.push(q2); }
      for (let i = pts.length - 1; i >= 0; i--) { const q2 = pts[i];
        while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q2) <= 0) up.pop(); up.push(q2); }
      return lo.concat(up.slice(1, -1));
    }
    // Clip a convex polygon to the frame rect. Without this an object near the camera projects a hull
    // far larger than the screen — MEASURED: peaks of 456,595% of frame, 625/661 candidates "passing".
    function clipRect(poly, w, h) {
      const edges = [p2 => p2.x >= 0, p2 => p2.x <= w, p2 => p2.y >= 0, p2 => p2.y <= h];
      const isec = [(a, b2) => ({ x: 0, y: a.y + (b2.y - a.y) * (0 - a.x) / (b2.x - a.x) }),
                    (a, b2) => ({ x: w, y: a.y + (b2.y - a.y) * (w - a.x) / (b2.x - a.x) }),
                    (a, b2) => ({ x: a.x + (b2.x - a.x) * (0 - a.y) / (b2.y - a.y), y: 0 }),
                    (a, b2) => ({ x: a.x + (b2.x - a.x) * (h - a.y) / (b2.y - a.y), y: h })];
      for (let e = 0; e < 4; e++) {
        const inb = edges[e], cut = isec[e], out2 = [];
        for (let i = 0; i < poly.length; i++) {
          const a = poly[i], b2 = poly[(i + 1) % poly.length], ia = inb(a), ib = inb(b2);
          if (ia) { out2.push(a); if (!ib) out2.push(cut(a, b2)); }
          else if (ib) out2.push(cut(a, b2));
        }
        poly = out2; if (!poly.length) return [];
      }
      return poly;
    }
    const corners = bx => { const o = []; for (let i = 0; i < 8; i++)
      o.push(new T.Vector3(i & 1 ? bx.max.x : bx.min.x, i & 2 ? bx.max.y : bx.min.y, i & 4 ? bx.max.z : bx.min.z)); return o; };

    // ── §9 CHEAPEST STAGE FIRST — cull by distance to the PATH before any projection ─────────────
    // The path is fixed and known before anything runs, so most of the building is never in frame at
    // any point in the film. Scoring all of it was waste AND it crowded the results with walls the
    // camera never reaches. dMax = 5.77 x span (§9's own figure: the 15% floor at 60 deg fov). Using
    // the LARGEST box dimension over-includes, which is the safe direction for a cull.
    const cullT0 = performance.now();
    const kept = [];
    for (const c of cands) {
      const sz = c.box.getSize(new T.Vector3()), span = Math.max(sz.x, sz.y, sz.z);
      const dMax = 5.77 * span;
      let near = Infinity;
      for (let i = 0; i < poses.length; i++) {
        const d = c.box.distanceToPoint(poses[i].p);
        if (d < near) { near = d; if (near <= dMax) break; }
      }
      if (near <= dMax) { c.near = near; kept.push(c); }
    }
    R.cull = { before: cands.length, after: kept.length, dropped: cands.length - kept.length,
               ms: +(performance.now() - cullT0).toFixed(0) };
    const bcc = {};
    cands.forEach(c => { bcc[c.cls] = bcc[c.cls] || { n: 0, kept: 0 }; bcc[c.cls].n++; });
    kept.forEach(c => bcc[c.cls].kept++);
    R.cullByClass = bcc;

    const PROBE_T = [5, 9, 15, 22, 30];   // seconds we want a snapshot of
    const snap = PROBE_T.map(() => []);
    const results = [];
    const scoreT0 = performance.now();
    for (const c of kept) {
      const cs = corners(c.box);
      let run = 0, runStart = -1, best = 0, bestT = -1, bestRun = 0, bestRunStart = -1, curPeak = 0, curPeakT = -1, globalPeak = 0;
      for (let i = 0; i < poses.length; i++) {
        const ps = poses[i];
        // §20.4 GUARD: camera inside the box on all three axes (NOT d > r — that discards slabs)
        let frac = 0;
        if (!c.box.containsPoint(ps.p)) {
          cam.position.copy(ps.p); cam.lookAt(ps.tg); cam.updateMatrixWorld(true);
          // View-space corners, then clip the box (convex) against the near plane using its 12 edges.
          // Dropping behind-camera corners alone gives a nonsense hull when the box straddles the eye.
          const vs = cs.map(w => w.clone().applyMatrix4(cam.matrixWorldInverse));
          const keep = [];
          for (let k = 0; k < 8; k++) if (vs[k].z < -NEAR) keep.push(vs[k].clone());
          if (keep.length && keep.length < 8) {
            for (const e of EDGES) {
              const a = vs[e[0]], b3 = vs[e[1]];
              if ((a.z < -NEAR) !== (b3.z < -NEAR)) {
                const tt = (-NEAR - a.z) / (b3.z - a.z);
                keep.push(new T.Vector3(a.x + (b3.x - a.x) * tt, a.y + (b3.y - a.y) * tt, -NEAR));
              }
            }
          }
          if (keep.length >= 3) {
            const pts = keep.map(v => { const n = v.clone().applyMatrix4(cam.projectionMatrix);
              return { x: (n.x * 0.5 + 0.5) * W, y: (-n.y * 0.5 + 0.5) * H }; });
            const cl = clipRect(hullPoly(pts), W, H);
            if (cl.length >= 3) frac = polyArea(cl) / (W * H);
          }
        }
        if (frac >= FLOOR) {
          if (runStart < 0) { runStart = i; curPeak = 0; curPeakT = ps.t; }
          if (frac > curPeak) { curPeak = frac; curPeakT = ps.t; }
          run = ps.t - poses[runStart].t;
          if (run > bestRun) { bestRun = run; bestRunStart = poses[runStart].t; best = curPeak; bestT = curPeakT; }
        } else { runStart = -1; run = 0; }
        if (frac > globalPeak) globalPeak = frac;
        for (let k = 0; k < PROBE_T.length; k++)
          if (Math.abs(ps.t - PROBE_T[k]) < (dur / N) / 2 && frac > 0.005)
            snap[k].push({ cls: c.cls, name: String(c.name).slice(0, 18), pct: +(frac * 100).toFixed(1),
                           dist: +c.near.toFixed(1) });
      }
      results.push({ cls: c.cls, name: c.name, peak: best, peakT: bestT, hold: bestRun, holdStart: bestRunStart, gpeak: globalPeak });
    }
    R.scoreMs = +(performance.now() - scoreT0).toFixed(0);
    // ── report ───────────────────────────────────────────────────────────────────────────────────
    const qual = results.filter(r => r.hold >= MIN_HOLD);
    R.qualified = qual.length;
    const byCls = {};
    results.forEach(r => { const k = r.cls; byCls[k] = byCls[k] || { n: 0, q: 0, maxPeak: 0 };
      byCls[k].n++; if (r.hold >= MIN_HOLD) byCls[k].q++; if (r.peak > byCls[k].maxPeak) byCls[k].maxPeak = r.peak; });
    R.byClass = byCls;
    qual.sort((a, b2) => b2.peak - a.peak);
    R.top = qual.slice(0, 14).map(r => ({ cls: r.cls, name: String(r.name).slice(0, 22),
      peakPct: +(r.peak * 100).toFixed(2), peakT: +r.peakT.toFixed(1), holdSec: +r.hold.toFixed(1), from: +r.holdStart.toFixed(1) }));
    const peaks = results.map(r => r.gpeak).filter(v => v > 0).sort((a, b2) => a - b2);
    R.dist = peaks.length ? { n: peaks.length, median: +(peaks[peaks.length >> 1] * 100).toFixed(3),
      p90: +(peaks[Math.floor(peaks.length * 0.9)] * 100).toFixed(3), max: +(peaks[peaks.length - 1] * 100).toFixed(2) } : null;
    R.snapshots = {};
    PROBE_T.forEach((t, k) => { snap[k].sort((a, b2) => b2.pct - a.pct);
      R.snapshots['t' + t] = snap[k].slice(0, 8); });
    return R;
  }, DUR);
  console.log('\n§FS_RESULT db=' + DB + ' ' + JSON.stringify(out, null, 1));
  await b.close();
})().catch(e => { console.error('PROBE FAILED ' + e.message); process.exit(1); });
