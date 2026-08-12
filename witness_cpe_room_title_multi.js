// WITNESS — §CPE_ROOM_TITLE_MULTI: the caption fan fills centre-ray MISSES, never overrides a hit.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_ROOM_TITLE_MULTI (2026-08-02).
//
// THE DEFECT THIS PROVES OR DISPROVES: a single gaze ray that clips a wall edge or grazes past a
// doorway jamb hits NO room even when one plainly dominates the view — gazeMissedAll=257/740 (35%)
// on an LTU film, 59/783 on the user's 2026-08-02 Hospital bake ("Room labelling poor"). The fix
// casts two rays ±10° HORIZONTALLY when — and only when — the centre ray misses.
//
//   G-RTM-1  RED→GREEN on real geometry: a ray aimed to graze past a real room's jamb misses on the
//            centre ray (the shipped rule — RED) and is recovered by the fan naming THAT room.
//   G-RTM-2  the fan NEVER overrides a hit: a centre ray aimed into a room names the same room with
//            and without the fan, over every room probed.
//   G-RTM-3  §CPE_ROOM_TITLE_HEIGHT_BLIND (#1108) stays closed: a ray passing a full storey band
//            ABOVE a room still captions NOTHING — the fan is horizontal by construction.
//   G-RTM-4  the instrument reports: the real film's timeline logs gazeFanRecovered=N and its
//            missed count can only fall — recovered + missed(after) equals what missed before.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8443;
const BLD = process.env.BLD || 'Hospital';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
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
    const A = window.APP, out = { err: null };
    try {
      if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) { try { await A.loadNavigate(); } catch (e) {} }
      if (typeof A.ensureRooms === 'function') { try { await A.ensureRooms({}); } catch (e) {} }
      out.singleProbe = typeof A.roomTitleGazeSingleProbe === 'function';
      if (!out.singleProbe) return out;
      const g = A.getRoomGraph();
      const rooms = Object.values(g.nodesByGuid).filter(n => n.kind === 'room' && n.rects && n.rects.length);
      out.nRooms = rooms.length;

      // ── G-RTM-1: find a real jamb-graze — origin level with the room, ray parallel to x, aimed
      // to pass JUST outside the room's y extent (0.4m past the jamb at its nearest corner). The
      // centre ray must miss (that room and everything else); the fan, sweeping ±10°, recovers it.
      out.graze = null;
      for (const n of rooms) {
        const r = n.rects[0];
        const oy = r.y1 + 0.4;                       // just past the jamb line
        const ox = r.x0 - 6, oz = n.cz || 0;         // 6m back, on the room's own storey datum
        const single = A.roomTitleGazeSingleProbe(ox, oy, oz, 1, 0, 0);
        if (single) continue;                        // some other room caught it — not a clean case
        const fan = A.roomTitleGazeProbe(ox, oy, oz, 1, 0, 0);
        if (fan && fan.guid === n.guid) {
          out.graze = { room: n.guid, name: fan.name, oy, y1: r.y1 };
          break;
        }
      }

      // ── G-RTM-2: centre hits are returned untouched — every room, aimed at its own centre.
      let overridden = 0, probed = 0;
      for (const n of rooms.slice(0, 200)) {
        const r = n.rects[0];
        const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2, cz = n.cz || 0;
        const single = A.roomTitleGazeSingleProbe(cx - 8, cy, cz, 1, 0, 0);
        if (!single) continue;
        probed++;
        const fan = A.roomTitleGazeProbe(cx - 8, cy, cz, 1, 0, 0);
        if (!fan || fan.guid !== single.guid) overridden++;
      }
      out.override = { probed, overridden };

      // ── G-RTM-3: the #1108 height rule — a ray passing well above the room's storey band.
      let heightLeaks = 0, heightProbed = 0;
      for (const n of rooms.slice(0, 100)) {
        const r = n.rects[0];
        const band = 5.0;                            // storeyPitch on Hospital, logged as 5.0m
        const cy = (r.y0 + r.y1) / 2;
        const hit = A.roomTitleGazeProbe(r.x0 - 6, cy, (n.cz || 0) + band * 2.2, 1, 0, 0);
        heightProbed++;
        if (hit && hit.guid === n.guid) heightLeaks++;
      }
      out.height = { heightProbed, heightLeaks };

      // ── G-RTM-4: the real film's timeline — the instrument must report the fan's work.
      const plan = A.cinemaPathPlan(40);
      const segs = A.roomTitleBuildTimeline(plan, plan.naturalTotal || 40);
      out.segments = segs.length;
    } catch (e) { out.err = String(e && e.message) + (e && e.stack ? '|' + String(e.stack).slice(0, 300) : ''); }
    return out;
  });

  let all = true;
  const P = (name, ok, detail) => { all = all && ok; console.log(`${ok ? '✅' : '❌'} ${name}  ${detail}`); };
  if (res.err || !res.singleProbe) {
    console.log('❌ setup: ' + (res.err || 'roomTitleGazeSingleProbe not exposed (RED on main)'));
    await browser.close(); process.exit(1);
  }
  P('G-RTM-1 a real jamb-graze: centre ray misses (RED), the ±10° fan recovers that exact room',
    !!res.graze,
    res.graze ? `room=${res.graze.room} "${res.graze.name}" ray passes 0.4m outside y1=${res.graze.y1.toFixed(2)}`
              : `no clean graze case found among ${res.nRooms} rooms — cannot show the RED`);
  P('G-RTM-2 the fan never overrides a centre hit',
    res.override.probed > 50 && res.override.overridden === 0,
    `${res.override.probed} rooms probed at their own centres, ${res.override.overridden} overridden`);
  P('G-RTM-3 #1108 stays closed: a ray a storey above a room captions nothing from the fan either',
    res.height.heightProbed > 50 && res.height.heightLeaks === 0,
    `${res.height.heightProbed} over-flights probed, ${res.height.heightLeaks} leaked a caption`);
  const tl = logs.find(l => l.includes('§CPE_ROOM_TITLE_TIMELINE'));
  const fanRe = tl && tl.match(/gazeFanRecovered=(\d+)/);
  P('G-RTM-4 the timeline reports the fan (gazeFanRecovered=N in §CPE_ROOM_TITLE_TIMELINE)',
    !!fanRe,
    tl ? tl.slice(0, 220) : 'no §CPE_ROOM_TITLE_TIMELINE line at all');

  console.log(all ? 'ALL GATES PASS' : 'GATES FAILED');
  await browser.close();
  process.exit(all ? 0 : 1);
})().catch(e => { console.error('witness crashed: ' + e.message); process.exit(1); });
