// WITNESS — §CPE_ROOM_TITLE_HOLD: a caption must stay up long enough to read.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_ROOM_TITLE_HOLD.
//
// THE DEFECT THIS PROVES OR DISPROVES (user, 2026-08-01: "give it 3 secs, because user will know u
// just passed that room, and of course, if another room cuts in by 2 secs, then it can replace so"
// — after twice reporting labels flashing past unread):
// A caption ended the instant the camera left the room, so a 1.5s crossing produced a 1.5s label.
// Measured on their own Hospital film: FOUR of six labels were under 2 seconds
// (2.6 / 1.5 / 1.8 / 1.8 / 1.5 / 4.7).
//
// Gated on `A.roomTitleApplyHold` — the SAME function the timeline builder calls, fed synthetic
// segment lists so each rule is exercised at an exact duration rather than hoping a camera path
// happens to produce one. Plus a real-path invariant check on a live timeline.
//
//   G-TH-1  RED before this change: a short caption is extended to the 3s floor.
//   G-TH-2  a caption that already earned MORE than 3s is left alone — the hold is a floor, not a cap.
//   G-TH-3  the user's replacement rule: a next room starting at 2s CUTS the hold at 2s, so the
//           newer room wins. Without this the hold would overlap the room you are actually in.
//   G-TH-4  a caption is never SHORTENED below the dwell the camera actually earned, even when the
//           next room starts early — that would be the hold making things worse than before.
//   G-TH-5  the last caption's hold never runs past the end of the film.
//   G-TH-6  ordering/monotonicity survives: starts unchanged, ends non-decreasing, no segment ends
//           before it starts.
//   G-TH-7  on a REAL timeline every segment satisfies the invariant (>=3s, or clipped by the next
//           start, or clipped by the film end) — the synthetic gates cannot drift from the product.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8443;
const BUILDINGS = (process.env.BLDS || 'Duplex').split(',');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const HOLD = 3.0;

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
    await page.waitForFunction(() => window.APP && window.APP.roomTitleApplyHold && window.APP.dbQuery,
      { timeout: 300000 });
    await sleep(9000);
    await page.waitForFunction(() => {
      try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
      catch (e) { return false; }
    }, { timeout: 300000, polling: 3000 });

    const res = await page.evaluate(async () => {
      const A = window.APP;
      const seg = (name, a, b) => ({ guid: name, name, tStart: a, tEnd: b });
      const out = {};

      // G-TH-1/2/5: a short one, a long one, and the last one near the film end.
      out.solo = A.roomTitleApplyHold([seg('short', 10, 11.5)], 100);
      out.longEnough = A.roomTitleApplyHold([seg('long', 10, 18)], 100);
      out.atFilmEnd = A.roomTitleApplyHold([seg('tail', 98.5, 99)], 100);

      // G-TH-3: the user's own case — next room cuts in at 2s.
      out.replaced = A.roomTitleApplyHold([seg('a', 10, 11.5), seg('b', 12, 13.5)], 100);

      // G-TH-4: next room starts BEFORE this one's earned end (overlapping samples).
      out.noShorten = A.roomTitleApplyHold([seg('a', 10, 14), seg('b', 12, 13)], 100);

      // G-TH-7: the real thing — build a timeline from the real plan and check the invariant.
      if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) { try { await A.loadNavigate(); } catch (e) {} }
      if (typeof A.ensureRooms === 'function') { try { await A.ensureRooms({}); } catch (e) {} }
      const DUR = 60;
      let real = [];
      try {
        const plan = A.cinemaPathPlan(DUR);
        real = A.roomTitleBuildTimeline(plan, DUR) || [];
      } catch (e) { out.realErr = e.message; }
      out.real = real.map(s => ({ name: s.name, tStart: +s.tStart.toFixed(2), tEnd: +s.tEnd.toFixed(2) }));
      out.realTotal = DUR;
      return out;
    });

    const checks = [];
    const P = (n, ok, d) => { checks.push({ n, ok, d }); console.log(`  ${ok ? '✅' : '❌'} ${n}\n        ${d}`); };
    const dur = s => +(s.tEnd - s.tStart).toFixed(3);

    P('G-TH-1 a 1.5s caption is held to 3s (RED before this change — it stayed 1.5s)',
      dur(res.solo[0]) === HOLD,
      `10.0→11.5 (1.5s)  becomes  ${res.solo[0].tStart}→${res.solo[0].tEnd} (${dur(res.solo[0])}s)`);

    P('G-TH-2 a caption that earned 8s is left alone — the hold is a floor, not a cap',
      dur(res.longEnough[0]) === 8,
      `10.0→18.0 (8s) stays ${res.longEnough[0].tStart}→${res.longEnough[0].tEnd} (${dur(res.longEnough[0])}s)`);

    P('G-TH-3 the replacement rule: a room cutting in at 2s truncates the hold at 2s',
      res.replaced[0].tEnd === 12 && dur(res.replaced[1]) === HOLD,
      `first 10.0→${res.replaced[0].tEnd} (cut by the next room's start at 12.0), ` +
      `second ${res.replaced[1].tStart}→${res.replaced[1].tEnd} (${dur(res.replaced[1])}s)`);

    P('G-TH-4 a caption is never shortened below the dwell the camera actually earned',
      res.noShorten[0].tEnd === 14,
      `earned 10.0→14.0; next room starts at 12.0; kept ${res.noShorten[0].tStart}→${res.noShorten[0].tEnd}`);

    P('G-TH-5 the last caption never runs past the end of the film',
      res.atFilmEnd[0].tEnd === 100,
      `98.5→99.0 in a 100s film becomes ${res.atFilmEnd[0].tStart}→${res.atFilmEnd[0].tEnd}`);

    const ordered = res.replaced.every((s, i, arr) => s.tEnd >= s.tStart && (i === 0 || s.tStart >= arr[i - 1].tStart));
    P('G-TH-6 ordering survives: no segment ends before it starts, starts stay ordered',
      ordered, `segments=${JSON.stringify(res.replaced)}`);

    if (res.realErr || !res.real.length) {
      P('G-TH-7 real timeline invariant', false,
        (res.realErr || 'the real plan produced no captions on this building') + ' — INCONCLUSIVE, not a product verdict');
    } else {
      const bad = res.real.filter((s, i, arr) => {
        const held = s.tEnd - s.tStart;
        if (held >= HOLD - 1e-6) return false;                       // met the floor
        const cap = (i + 1 < arr.length) ? arr[i + 1].tStart : res.realTotal;
        return Math.abs(s.tEnd - cap) > 1e-6;                        // or was legitimately clipped
      });
      P('G-TH-7 on a REAL timeline every caption is >=3s, or clipped by the next one / the film end',
        bad.length === 0,
        `${res.real.length} captions: ` + res.real.map(s => `${s.name} ${s.tStart}→${s.tEnd}`).join('  |  ') +
        (bad.length ? `   VIOLATIONS: ${JSON.stringify(bad)}` : ''));
    }

    const line = logs.filter(l => /§CPE_ROOM_TITLE_TIMELINE/.test(l)).slice(-1)[0] || '';
    P('G-TH-8 the log reports how many captions were extended',
      /held=\d+\/\d+@3s/.test(line), line || 'no §CPE_ROOM_TITLE_TIMELINE line');

    const pass = checks.filter(c => c.ok).length;
    console.log(`\n  ${BLD}: ${pass}/${checks.length}`);
    if (pass !== checks.length || !checks.length) allPass = false;
    await page.close();
  }

  await browser.close();
  console.log(allPass ? '\nALL GREEN' : '\nRED');
  process.exit(allPass ? 0 : 1);
})();
