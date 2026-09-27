// WITNESS — §CPE_ROOM_TITLE_HEIGHT_BLIND: a title card must name the room you are IN, not the one
// you are flying OVER.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_ROOM_TITLE_HEIGHT_BLIND.
//
// THE DEFECT THIS PROVES OR DISPROVES (user, 2026-07-31, watching the Hospital film: "u can see the
// room labels are Level 2 two rooms when we are flying quite high"):
// `_roomAtIfcPoint` matched on the PLAN RECT alone; `z` only ranked the candidates and could never
// reject one. A camera 40m above the roof therefore resolved to whatever footprint it was over, and
// the z-closest tie-break captioned it "Level 2". The cinema camera is the first consumer of this
// logic that spends most of its runtime OUTSIDE the building (dive, pullback, orbit).
//
// Driven through the SHIPPED entry point `A.roomTitleBuildTimeline(plan, totalSec)` with a synthetic
// `poseAt` — the same function the bake and the live preview both call, so this cannot pass while
// the real path fails. Room coordinates come from the room graph itself; nothing is guessed.
//
//   G-RTH-1  control: a pose AT a real room's own cz, over its rect, still titles that room. Guards
//            against "fixing" this by switching titles off.
//   G-RTH-2  RED on origin/main. The SAME x/y raised by TWO storey pitches yields NO segment.
//   G-RTH-3  the boundary is the stated one (ONE pitch), not an accident: 0.9x pitch still titles,
//            1.6x pitch does not. Half a pitch was MEASURED too tight — it deleted a real caption on
//            Duplex's own derived walk, which climbs 1.2-1.5m above Level 1's datum mid-walk.
//   G-RTH-4  the log answers "why so few captions": §CPE_ROOM_TITLE_TIMELINE carries storeyPitch and
//            rejectedByHeight, and rejectedByHeight is >0 exactly on the high run.
//   G-RTH-5  no regression at floor level: the floor-level timeline is unchanged in segment count.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8439;
const BUILDINGS = (process.env.BLDS || 'Duplex').split(',');
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
      { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.APP && window.APP.roomTitleBuildTimeline && window.APP.dbQuery,
      { timeout: 120000 });
    await sleep(9000);
    await page.waitForFunction(() => {
      try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
      catch (e) { return false; }
    }, { timeout: 60000, polling: 2000 });

    const res = await page.evaluate(async () => {
      const A = window.APP;
      if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) { try { await A.loadNavigate(); } catch (e) {} }
      if (typeof A.ensureRooms === 'function') { try { await A.ensureRooms({}); } catch (e) {} }
      const g = A.getRoomGraph ? A.getRoomGraph() : null;
      if (!g || !g.nodesByGuid) return { err: 'no room graph' };

      // The building's OWN storey pitch, computed here the same way the module does — from the
      // distinct room z values — so the witness asserts against the data, not against a constant
      // copied out of the code under test.
      const zs = [], seen = {};
      const rooms = [];
      for (const k in g.nodesByGuid) {
        const n = g.nodesByGuid[k];
        if (!n || n.kind !== 'room' || !n.rects || !n.rects.length || n.cz == null) continue;
        rooms.push(n);
        const key = Math.round(n.cz * 10) / 10;
        if (!seen[key]) { seen[key] = 1; zs.push(n.cz); }
      }
      zs.sort((a, b) => a - b);
      const gaps = [];
      for (let i = 1; i < zs.length; i++) { const d = zs[i] - zs[i - 1]; if (d > 0.5) gaps.push(d); }
      gaps.sort((a, b) => a - b);
      const pitch = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;

      // Pick the biggest room so the sample point is unambiguously inside one footprint.
      let room = null, area = -1;
      rooms.forEach(n => {
        const r = n.rects[0], a = (r.x1 - r.x0) * (r.y1 - r.y0);
        if (a > area) { area = a; room = n; }
      });
      if (!room) return { err: 'no room with a rect' };
      const r0 = room.rects[0];
      const cx = (r0.x0 + r0.x1) / 2, cy = (r0.y0 + r0.y1) / 2;

      // A plan whose camera simply SITS at one point for the whole film. Everything else about the
      // timeline (sampling, dwell collapse, MIN_DWELL) is the shipped code's own.
      const planAt = (ifcZ) => {
        const p = A.ifc2three(cx, cy, ifcZ);
        return { poseAt: () => ({ x: p.x, y: p.y, z: p.z }) };
      };
      const run = (ifcZ) => {
        // §CPE_ROOM_TITLE_GROUP (2026-08-02): filter the fill — flying over a room now yields an
        // honest BUILDING/storey fill segment, which is not the #1108 defect (a ROOM named from
        // above). This gate is about room captions only; the fill has its own witness.
        const segs = A.roomTitleBuildTimeline(planAt(ifcZ), 12).filter(s => !s.group);
        return { n: segs.length, name: segs.length ? segs[0].name : null };
      };

      return {
        pitch, roomName: room.name, roomCz: room.cz, storeys: zs.length,
        atFloor: run(room.cz),
        high2x: run(room.cz + 2 * pitch),
        at09: run(room.cz + 0.9 * pitch),
        at16: run(room.cz + 1.6 * pitch),
      };
    });

    const checks = [];
    const P = (n, ok, d) => { checks.push({ n, ok, d }); console.log(`  ${ok ? '✅' : '❌'} ${n}\n        ${d}`); };

    if (res.err || !(res.pitch > 0)) {
      P('G-RTH-0 the building states a storey pitch and has a room with a footprint', false,
        res.err ? res.err : `pitch=${res.pitch} storeys=${res.storeys} — INCONCLUSIVE on this building, not a product verdict`);
    } else {
      P('G-RTH-1 control: a pose at the room\'s own height still titles that room',
        res.atFloor.n === 1 && !!res.atFloor.name,
        `room="${res.roomName}" cz=${res.roomCz.toFixed(2)} pitch=${res.pitch.toFixed(2)}m → segments=${res.atFloor.n} name="${res.atFloor.name}"`);

      P('G-RTH-2 two storey pitches ABOVE that room yields NO title (RED on origin/main)',
        res.high2x.n === 0,
        `z=cz+${(2 * res.pitch).toFixed(2)}m → segments=${res.high2x.n}` +
        (res.high2x.name ? ` name="${res.high2x.name}"  ← flying over it, captioned as if inside` : ''));

      P('G-RTH-3 the boundary is ONE pitch, as specced — 0.9x still titles, 1.6x does not',
        res.at09.n === 1 && res.at16.n === 0,
        `0.9x pitch → segments=${res.at09.n}   1.6x pitch → segments=${res.at16.n}   ` +
        `(0.9x MUST title: the building's own walk climbs to 1.5m above a datum — measured, see spec)`);

      const line = logs.filter(l => /§CPE_ROOM_TITLE_TIMELINE/.test(l)).slice(-1)[0] || '';
      const rejected = logs.filter(l => /§CPE_ROOM_TITLE_TIMELINE/.test(l) && /rejectedByHeight=[1-9]/.test(l)).length;
      P('G-RTH-4 the log says why: storeyPitch + rejectedByHeight are reported',
        /storeyPitch=/.test(line) && /rejectedByHeight=/.test(line) && rejected > 0,
        `${line || 'no §CPE_ROOM_TITLE_TIMELINE line'}   (runs with rejectedByHeight>0: ${rejected})`);

      P('G-RTH-5 no regression at floor level: the floor-level run is unaffected',
        res.atFloor.n === 1 && res.atFloor.name === res.at09.name,
        `floor="${res.atFloor.name}"  0.9x-pitch="${res.at09.name}" — same room, height test does not shrink real coverage`);
    }

    const pass = checks.filter(c => c.ok).length;
    console.log(`\n  ${BLD}: ${pass}/${checks.length}`);
    if (pass !== checks.length || !checks.length) allPass = false;
    await page.close();
  }

  await browser.close();
  console.log(allPass ? '\nALL GREEN' : '\nRED');
  process.exit(allPass ? 0 : 1);
})();
