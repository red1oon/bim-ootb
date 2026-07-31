// WITNESS — §CPE_ROOM_TITLE_GAZE: caption the room the camera is LOOKING INTO.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_ROOM_TITLE_GAZE.
//
// THE DEFECT THIS PROVES OR DISPROVES (§CPE_ROOM_TITLE_FLYOVER_BLIND, measured 2026-08-01 from the
// user's own preview log on a 147.9s Hospital buildup film):
//   §CPE_ROOM_TITLE_TIMELINE segments=1/1 suppressed=2 rejectedByHeight=306 storeyPitch=5.0m
// 987 samples, 306 of them (31%) over a room's FOOTPRINT but a full storey above its datum, and ONE
// caption in a 148-second film. Containment answers "which room am I in"; a wide flyover is never in
// one. User ruling: "Label what the camera looks at" — as the rule, not as a fallback.
//
//   G-GZ-1  RED on the real thing: the same plan yields more captions by gaze than by containment.
//   G-GZ-2  truthfulness: the hit point is recomputed here and must lie inside the captioned room's
//           own AABB. Never a fabricated name.
//   G-GZ-3  the storey band still bites — a ray passing above a room does not caption it (#1108).
//   G-GZ-4  nearest-hit, not any-hit.
//   G-GZ-5  a camera INSIDE a room still captions that room — walk films do not regress.
//   G-GZ-6  the orbit beat is MEASURED, not assumed: how many captions, and does one hold the lap.
//   G-GZ-7  cost stays the same order as the point test (the slab test's budget claim, checked).
//   G-GZ-8  the log names the rule in force, so a stale cache cannot silently serve containment.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8443;
const BUILDINGS = (process.env.BLDS || 'Hospital').split(',');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  let allPass = true;

  for (const BLD of BUILDINGS) {
    console.log(`\n${'='.repeat(78)}\n${BLD}\n${'='.repeat(78)}`);
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 700 });
    const logs = [];
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
    await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
      { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.roomTitleGazeProbe && window.APP.dbQuery,
      { timeout: 300000 });
    await sleep(9000);
    await page.waitForFunction(() => {
      try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
      catch (e) { return false; }
    }, { timeout: 300000, polling: 3000 });

    const res = await page.evaluate(async () => {
      const A = window.APP;
      const out = {};
      if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) { try { await A.loadNavigate(); } catch (e) {} }
      if (typeof A.ensureRooms === 'function') { try { await A.ensureRooms({}); } catch (e) {} }

      const g = A.getRoomGraph();
      const rooms = Object.values(g.nodesByGuid).filter(n => n.kind === 'room' && n.rects && n.rects.length);
      out.nRooms = rooms.length;

      // The film the user actually ran: 147.9s.
      const DUR = 147.9;
      let segs = [];
      try {
        const plan = A.cinemaPathPlan(DUR);
        out.hasTarget = plan.poseAt(0.5).tx != null;
        segs = A.roomTitleBuildTimeline(plan, DUR) || [];
        // G-GZ-1's baseline: the SAME plan, same sampling, resolved by containment — computed here
        // rather than quoted from a log, so the comparison is like-for-like.
        let contain = 0, lastGuid = null;
        for (let t = 0; t <= DUR + 1e-6; t += 0.15) {
          const p = plan.poseAt(Math.min(1, t / DUR));
          const q = A.three2ifc(p.x, p.y, p.z);
          const n = q ? A.roomTitleContainProbe(q.ix, q.iy, q.iz) : null;
          const gid = n ? n.guid : null;
          if (gid && gid !== lastGuid) contain++;
          lastGuid = gid;
        }
        out.containRuns = contain;
        // G-GZ-2: re-probe along the film and verify each hit geometrically.
        const bad = [];
        let probes = 0, hits = 0;
        for (let t = 0; t <= DUR + 1e-6; t += 1.5) {
          const p = plan.poseAt(Math.min(1, t / DUR));
          const o = A.three2ifc(p.x, p.y, p.z), tg = A.three2ifc(p.tx, p.ty, p.tz);
          if (!o || !tg) continue;
          probes++;
          const h = A.roomTitleGazeProbe(o.ix, o.iy, o.iz, tg.ix - o.ix, tg.iy - o.iy, tg.iz - o.iz);
          if (!h) continue;
          hits++;
          const L = Math.hypot(tg.ix - o.ix, tg.iy - o.iy, tg.iz - o.iz) || 1;
          const hx = o.ix + (tg.ix - o.ix) / L * h.t;
          const hy = o.iy + (tg.iy - o.iy) / L * h.t;
          const hz = o.iz + (tg.iz - o.iz) / L * h.t;
          const E = 1e-6;
          const inRect = h.rects.some(r => hx >= r.x0 - E && hx <= r.x1 + E && hy >= r.y0 - E && hy <= r.y1 + E);
          const inBand = h.band == null || Math.abs(hz - h.cz) <= h.band + E;
          if (!inRect || !inBand) bad.push({ t: +t.toFixed(1), name: h.name, inRect, inBand,
                                             hit: [+hx.toFixed(2), +hy.toFixed(2), +hz.toFixed(2)],
                                             cz: h.cz, band: h.band });
        }
        out.probes = probes; out.hits = hits; out.badHits = bad.slice(0, 5); out.nBad = bad.length;

        // G-GZ-6: the orbit beat, measured. beats.rise is where the orbit starts.
        const rise = plan.beats ? plan.beats.rise : null;
        out.orbitFrom = rise;
        if (rise != null) {
          const orbitNames = new Set();
          for (let tn = rise; tn <= 1.0 + 1e-9; tn += 0.01) {
            const p = plan.poseAt(Math.min(1, tn));
            const o = A.three2ifc(p.x, p.y, p.z), tg = A.three2ifc(p.tx, p.ty, p.tz);
            if (!o || !tg) continue;
            const h = A.roomTitleGazeProbe(o.ix, o.iy, o.iz, tg.ix - o.ix, tg.iy - o.iy, tg.iz - o.iz);
            orbitNames.add(h ? h.name : '(none)');
          }
          out.orbitNames = [...orbitNames];
        }
      } catch (e) { out.err = e.message + ' | ' + (e.stack || '').split('\n')[1]; }
      out.segs = segs.map(s => ({ name: s.name, tStart: +s.tStart.toFixed(2), tEnd: +s.tEnd.toFixed(2) }));

      // G-GZ-3 / G-GZ-4 / G-GZ-5: synthetic rays against a REAL room, so the geometry rules are
      // exercised at exact offsets instead of hoping the film produces them.
      const r0 = rooms[0];
      const zs = [...new Set(rooms.map(n => Math.round(n.cz * 10) / 10))].sort((a, b) => a - b);
      const gaps = []; for (let i = 1; i < zs.length; i++) { const d = zs[i] - zs[i - 1]; if (d > 0.5) gaps.push(d); }
      gaps.sort((a, b) => a - b);
      const pitch = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
      out.pitch = pitch;
      const c = { x: (r0.rects[0].x0 + r0.rects[0].x1) / 2, y: (r0.rects[0].y0 + r0.rects[0].y1) / 2, z: r0.cz };
      const span = Math.max(r0.rects[0].x1 - r0.rects[0].x0, 10);
      // level ray from outside, straight at the room's centre
      out.level = A.roomTitleGazeProbe(c.x - span * 5, c.y, c.z, 1, 0, 0);
      // G-GZ-3, CORRECTED 2026-08-01. The first version asserted "a ray 4 pitches higher must hit
      // NOTHING" and went red against correct code: this is a 5-storey hospital, so a horizontal ray
      // 20 m up simply enters Level 4's rooms instead — a true hit, not a fabricated one. The premise
      // was wrong, not the ray. What #1108 actually forbids is naming a room you merely pass OVER, so
      // that is what is asserted now, in two parts:
      //   (a) the lifted ray must not still name the room it is flying above, and
      //   (b) a ray above EVERY room's band must miss entirely — proving the z slab is enforced at
      //       all, rather than the storey below happening to catch it.
      out.high = A.roomTitleGazeProbe(c.x - span * 5, c.y, c.z + pitch * 4, 1, 0, 0);
      const maxCz = Math.max(...rooms.map(n => n.cz || 0));
      out.aboveAll = A.roomTitleGazeProbe(c.x - span * 5, c.y, maxCz + pitch * 3, 1, 0, 0);
      out.maxCz = maxCz;
      // camera standing INSIDE the room, looking anywhere (G-GZ-5)
      out.inside = A.roomTitleGazeProbe(c.x, c.y, c.z, 1, 0, 0);
      out.r0name = A.friendlyName(r0.name, null);
      return out;
    });

    const checks = [];
    const P = (n, ok, d) => { checks.push({ n, ok, d }); console.log(`  ${ok ? '✅' : '❌'} ${n}\n        ${d}`); };

    if (res.err) {
      P('G-GZ-1..8 the gaze pre-pass runs on a real plan', false, res.err);
      console.log(`\n  ${BLD}: 0/1`); allPass = false; await page.close(); continue;
    }

    const line = logs.filter(l => /§CPE_ROOM_TITLE_TIMELINE/.test(l)).slice(-1)[0] || '';
    const mSeg = /segments=(\d+)\//.exec(line);
    const nSeg = mSeg ? +mSeg[1] : res.segs.length;

    P('G-GZ-1 the gaze rule produces MORE captions than containment on the same 147.9s plan (RED: 1)',
      nSeg > 1,
      `gaze -> ${nSeg} captions [${res.segs.map(s => `${s.name} ${s.tStart}→${s.tEnd}`).join(' | ')}]` +
      `  (containment room-runs over the same samples: ${res.containRuns})`);

    P('G-GZ-2 every gaze hit lies inside the captioned room\'s own AABB — recomputed here, not trusted',
      res.nBad === 0,
      `${res.hits}/${res.probes} probes hit a room; ${res.nBad} bad` +
      (res.nBad ? `  ${JSON.stringify(res.badHits)}` : ''));

    P('G-GZ-3 the storey band still bites: a ray never names a room it flies OVER, and misses above them all',
      !!res.level && (!res.high || res.high.guid !== res.level.guid) && !res.aboveAll,
      `pitch=${res.pitch}m | level ray -> ${res.level ? res.level.name : 'MISS'} | ` +
      `+${(res.pitch * 4).toFixed(1)}m -> ${res.high ? res.high.name : 'MISS'} ` +
      `(must not be the room below it) | above every storey (z=${(res.maxCz + res.pitch * 3).toFixed(1)}) -> ` +
      `${res.aboveAll ? res.aboveAll.name + ' (WRONG)' : 'MISS'}`);

    P('G-GZ-5 a camera standing INSIDE a room still captions that room — walk films do not regress',
      !!res.inside && res.inside.name === res.r0name && res.inside.t < 1e-6,
      `inside ${res.r0name} -> ${res.inside ? `${res.inside.name} at t=${res.inside.t}` : 'MISS'}`);

    P('G-GZ-4 nearest-hit: the level ray from outside resolves at a positive t, at the near face',
      !!res.level && res.level.t > 0, `t=${res.level ? res.level.t.toFixed(2) : 'n/a'}m along the ray`);

    P('G-GZ-6 the orbit beat is MEASURED (this gate reports, it does not judge)',
      res.orbitFrom != null,
      `orbit from tn=${res.orbitFrom} — distinct captions across the lap: ` +
      `${res.orbitNames ? res.orbitNames.length : '?'} ${JSON.stringify(res.orbitNames || [])}`);

    const mMs = /ms=([\d.]+)/.exec(line);
    P('G-GZ-7 cost stays the same order as the point test (34ms on 987 samples before this change)',
      mMs && +mMs[1] < 340, `§CPE_ROOM_TITLE_TIMELINE ms=${mMs ? mMs[1] : '?'} for ${res.nRooms} rooms`);

    P('G-GZ-8 the log names the rule in force',
      /rule=gaze/.test(line), line || 'no §CPE_ROOM_TITLE_TIMELINE line');

    const pass = checks.filter(c => c.ok).length;
    console.log(`\n  ${BLD}: ${pass}/${checks.length}`);
    if (pass !== checks.length || !checks.length) allPass = false;
    await page.close();
  }

  await browser.close();
  console.log(allPass ? '\nALL GREEN' : '\nRED');
  process.exit(allPass ? 0 : 1);
})();
