// WITNESS — §CPE_ROOM_TITLE_GROUP: constant, composed, tempered labelling.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_ROOM_TITLE_GROUP (2026-08-02).
//
// THE ISSUE IT PROVES OR DISPROVES (user, 2026-08-02): the 117.4s Hospital bake showed 16 captions
// with long unnamed stretches (11 rooms skipped under the 3s ruling, 29 suppressed) — "Room
// labelling poor". User ruling: "anything that comes within range of path or sight are pointed out
// so inaccurate labelling is diminished", composed "Storey 2, Corridor Hall, Rooms 2,3", in single
// lines, TEMPERED ("not fast flashing each").
//
//   G-RTG-1  coverage: room captions + composed fill label ≥90% of the film; the same log line
//            carries the rooms-alone number (the RED baseline) which must be LOWER.
//   G-RTG-2  precedence: no group segment overlaps a room caption — the precision pipeline is
//            untouched, the fill is a pure addition.
//   G-RTG-3  honesty, recomputed not trusted: at each sampled group segment's midpoint, a storey
//            named in the label is the nearest ladder rung to the camera's own z, and a
//            containment key resolves to the room the camera is inside.
//   G-RTG-4  TEMPERED: every group segment holds ≥ MIN_HOLD (3s) — no fast flashing.
//   G-RTG-5  single line, and the instrument reports (§CPE_ROOM_TITLE_GROUP line with coverage).
//   G-RTG-6  §CPE_ROOM_TITLE_LEVEL_CONSOLIDATE (fix, 2026-08-02): a shared storey prefix must be
//            named ONCE in a composed line, never repeated per room. Real defect measured on this
//            same Hospital film (#1136/#1138 build session witness log): a window whose sighted
//            rooms all read "Level 4 ..." rendered "Level 4 Hall/Corridor 2, Level 4 Hall/Corridor
//            1, Level 4 R1, Level 4 R4" — the prefix repeated four times — because the per-room
//            dedupe only fired when the WINDOW's camera-position storey test (stSame) was
//            unanimous, a stricter and independent test from "do the sighted rooms themselves
//            share a level". For every ladder storey name, its "<name> " substring must occur at
//            most once in any composed line.
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
      const DUR = 147.9;                              // the user's own film length
      const plan = A.cinemaPathPlan(DUR);
      const segs = A.roomTitleBuildTimeline(plan, DUR);
      const rooms = segs.filter(s => !s.group), groups = segs.filter(s => s.group);
      out.nRooms = rooms.length; out.nGroups = groups.length;
      const span = list => list.reduce((a, s) => a + (s.tEnd - s.tStart), 0);
      out.roomSec = span(rooms); out.groupSec = span(groups); out.total = DUR;
      // G-RTG-2: pairwise overlap
      out.overlaps = 0;
      for (const g of groups) for (const r of rooms) {
        if (Math.min(g.tEnd, r.tEnd) - Math.max(g.tStart, r.tStart) > 0.05) out.overlaps++;
      }
      // G-RTG-4: shortest group segment
      out.minGroupLen = groups.length ? Math.min(...groups.map(s => s.tEnd - s.tStart)) : null;
      // G-RTG-5: single line
      out.multiline = groups.filter(s => /\n/.test(s.name)).length;
      out.sampleNames = groups.slice(0, 6).map(s => s.name);
      // G-RTG-3: recompute at midpoints
      const ladder = A.dbQuery(
        "SELECT m.storey, AVG(COALESCE(t.center_z,0)) FROM elements_meta m " +
        "JOIN element_transforms t ON t.guid=m.guid " +
        "WHERE m.storey IS NOT NULL AND m.storey NOT IN ('','_UNKNOWN','Unknown') GROUP BY m.storey")
        .map(r => ({ name: String(r[0]), z: +r[1] }));
      // Unanimity + union semantics: a displayed storey must be the nearest rung at start, mid AND
      // end of its window (that is what "shown only if unanimous" claims); a c:<guid> must contain
      // the camera at those probes; every r:<guid> must appear in the segment's recomputed sight
      // union (probed at the builder's own 0.45s cadence via the exposed roomTitleSightProbe).
      let checked = 0, bad = [];
      const nearestRung = z => {
        let best = null, bd = Infinity;
        for (const L of ladder) { const d = Math.abs(L.z - z); if (d < bd) { bd = d; best = L; } }
        return best && best.name;
      };
      for (const g of groups.slice(0, 12)) {
        checked++;
        const probes = [g.tStart + 0.5, (g.tStart + g.tEnd) / 2, g.tEnd - 0.5]
          .map(t => {
            const p = plan.poseAt(Math.min(1, Math.max(0, t) / DUR));
            const o = A.three2ifc(p.x, p.y, p.z), tg = A.three2ifc(p.tx, p.ty, p.tz);
            return o ? { o, tg } : null;
          }).filter(Boolean);
        if (!probes.length) continue;
        const led = ladder.find(L => g.name === L.name || g.name.indexOf(L.name + ' ·') === 0);
        if (led) {
          for (const pr of probes) if (nearestRung(pr.o.iz) !== led.name)
            bad.push({ name: g.name, expect: nearestRung(pr.o.iz), z: +pr.o.iz.toFixed(1) });
        }
        const m = /(^|\t)c:([^\t]+)/.exec(g.guid);   // TAB-separated key — guids contain '|'
        if (m) {
          for (const pr of probes) {
            const n = A.roomTitleContainProbe(pr.o.ix, pr.o.iy, pr.o.iz);
            if (!n || n.guid !== m[2]) bad.push({ name: g.name, containExpected: m[2], got: n && n.guid });
          }
        }
        const rGuids = [...g.guid.matchAll(/(?:^|\t)r:([^\t]+)/g)].map(x => x[1]);
        if (rGuids.length && A.roomTitleSightProbe) {
          const union = new Set();
          for (let t = g.tStart; t <= g.tEnd + 1e-6; t += 0.15) {   // SAMPLE_DT — the builder's own cadence
            const p = plan.poseAt(Math.min(1, t / DUR));
            const o = A.three2ifc(p.x, p.y, p.z), tg = A.three2ifc(p.tx, p.ty, p.tz);
            if (!o || !tg) continue;
            for (const gd of A.roomTitleSightProbe(o.ix, o.iy, o.iz,
              tg.ix - o.ix, tg.iy - o.iy, tg.iz - o.iz)) union.add(gd);
          }
          for (const rg of rGuids) if (!union.has(rg))
            bad.push({ name: g.name, sightNotRecomputed: rg });
        }
      }
      out.honesty = { checked, bad: bad.slice(0, 4), nBad: bad.length };
      // G-RTG-6: no ladder storey prefix repeats inside one composed line.
      const repeats = [];
      for (const g of groups) {
        for (const L of ladder) {
          const token = L.name + ' ';
          let count = 0, idx = -1;
          while ((idx = g.name.indexOf(token, idx + 1)) !== -1) count++;
          if (count > 1) repeats.push({ name: g.name, storey: L.name, count });
        }
      }
      out.levelRepeats = repeats;
    } catch (e) { out.err = String(e && e.message); }
    return out;
  });

  let all = true;
  const P = (name, ok, detail) => { all = all && ok; console.log(`${ok ? '✅' : '❌'} ${name}  ${detail}`); };
  if (res.err) { console.log('❌ setup: ' + res.err); await browser.close(); process.exit(1); }

  const glog = logs.find(l => l.includes('§CPE_ROOM_TITLE_GROUP'));
  const cov = (res.roomSec + res.groupSec) / res.total, covRooms = res.roomSec / res.total;
  P('G-RTG-1 coverage ≥90% with the fill; rooms alone (the RED baseline) is lower',
    cov >= 0.90 && covRooms < cov,
    `rooms=${(covRooms * 100).toFixed(0)}% -> rooms+fill=${(cov * 100).toFixed(0)}% ` +
    `(${res.nRooms} room captions + ${res.nGroups} fill segments)`);
  P('G-RTG-2 the fill never overlaps a room caption (precision pipeline untouched)',
    res.overlaps === 0, `${res.overlaps} overlaps`);
  P('G-RTG-3 composed labels are honest — storey/containment recomputed at midpoints',
    res.honesty.checked >= Math.min(res.nGroups, 12) && res.honesty.checked > 0 && res.honesty.nBad === 0,
    `${res.honesty.checked} midpoints recomputed, ${res.honesty.nBad} wrong` +
    (res.honesty.nBad ? ' ' + JSON.stringify(res.honesty.bad) : ''));
  P('G-RTG-4 TEMPERED: every fill segment holds ≥3s — no fast flashing',
    res.minGroupLen != null && res.minGroupLen >= 3 - 1e-6,
    `shortest fill segment ${res.minGroupLen == null ? 'n/a' : res.minGroupLen.toFixed(2) + 's'}`);
  P('G-RTG-5 single-line labels + the instrument reports',
    res.multiline === 0 && !!glog,
    `multiline=${res.multiline}; sample: ${JSON.stringify(res.sampleNames.slice(0, 3))}; ` +
    (glog ? glog.slice(0, 160) : 'NO §CPE_ROOM_TITLE_GROUP line'));
  P('G-RTG-6 a shared storey prefix is named ONCE per composed line, never repeated per room',
    res.levelRepeats.length === 0,
    `${res.levelRepeats.length} repeats` +
    (res.levelRepeats.length ? ' ' + JSON.stringify(res.levelRepeats.slice(0, 4)) : ''));

  console.log(all ? 'ALL GATES PASS' : 'GATES FAILED');
  await browser.close();
  process.exit(all ? 0 : 1);
})().catch(e => { console.error('witness crashed: ' + e.message); process.exit(1); });
