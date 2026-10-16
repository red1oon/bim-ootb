// WITNESS — §CPE_ROOM_TITLE_LEAD: name the room you are HEADING INTO, not the one you are in.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_ROOM_TITLE_LEAD.
//
// THE DEFECT THIS PROVES OR DISPROVES (user, 2026-08-01, while a bake ran):
//   "room labelling i got a suggestion is that should not wait to be in the room but as it is
//    heading towards a room, about 2 secs before will be view point friendly."
//   "for every room too... not wait till inside room it can be too late as 3 secs optimum label
//    appearance"
//   "even though just left room,.. but when new room appears, it tries to show also up to 3 secs..
//    and if misses, then skips"
// A caption started at the first sample INSIDE the room's plan rect, so the name arrived after the
// doorway had already gone past — and §CPE_ROOM_TITLE_HOLD's 3s floor could still be cut short by a
// fast next room, so a caption could still flash by unread.
//
// Gated on `A.roomTitleApplyLead` — the SAME function the timeline builder calls, fed synthetic
// segment lists so each rule fires at an exact time rather than hoping a camera path produces one,
// plus a real-timeline invariant sweep so the synthetic gates cannot drift from the product.
//
//   G-TL-1  RED before this change: a caption APPEARS 2s before entry, not at entry.
//   G-TL-2  no negative time, and the film's first caption never opens before the dive ends.
//   G-TL-3  the skip rule: a room entered too soon after the last caption is DROPPED, not flashed.
//   G-TL-4  the replacement rule: the previous caption ends exactly when the new one APPEARS.
//   G-TL-5  the hold is still a floor, not a cap — an 8s dwell is not cut to 3s.
//   G-TL-6  ordering/monotonicity: starts ordered, no segment ends before it starts.
//   G-TL-7  on a REAL timeline every caption satisfies all of the above.
//   G-TL-8  the log says how many captions led, and how many were skipped for want of 3s.
//   G-TL-9  degrade, not disable: no dive info still leads, and says so.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8443;
const BUILDINGS = (process.env.BLDS || 'Duplex').split(',');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LEAD = 2.0;
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
      const out = { hasFn: typeof A.roomTitleApplyLead === 'function' };
      if (!out.hasFn) return out;

      // G-TL-1 / G-TL-5: one caption, well clear of the film start. Compare against what the
      // SHIPPED path (hold only) produces for the same input — that is the RED.
      out.today = A.roomTitleApplyHold([seg('kitchen', 10, 11.5)], 100);
      out.solo = A.roomTitleApplyLead([seg('kitchen', 10, 11.5)], 100, 0);
      out.longDwell = A.roomTitleApplyLead([seg('hall', 10, 18)], 100, 0);

      // G-TL-2: entry inside the lead window, and a film whose dive ends at 6s.
      out.atStart = A.roomTitleApplyLead([seg('lobby', 1.0, 4.0)], 100, 0);
      out.diveClipped = A.roomTitleApplyLead([seg('lobby', 7.0, 10.0)], 100, 6.0);
      // the dive clip must never push a caption PAST its own doorway: entry before the dive ends.
      out.diveLate = A.roomTitleApplyLead([seg('lobby', 4.0, 9.0)], 100, 6.0);

      // G-TL-3: second room entered 1.5s after the first — its slot would open at 9.5, inside the
      // first caption's guaranteed 3s (10 -> 13). It must be SKIPPED, not shown for 1.5s.
      out.skipped = A.roomTitleApplyLead([seg('a', 12, 13.5), seg('b', 13.5, 16)], 100, 0);
      // ...and one that DOES fit: entry 5s later, slot opens at 15 > 13.
      out.fits = A.roomTitleApplyLead([seg('a', 12, 13.5), seg('b', 17, 19)], 100, 0);

      // G-TL-4: the new caption appears while the camera is STILL inside the old room (a long dwell
      // that runs past the next room's lead-in) — the newer room must take the screen.
      out.replaced = A.roomTitleApplyLead([seg('a', 10, 20), seg('b', 21, 24)], 100, 0);

      // G-TL-7: the real thing.
      if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) { try { await A.loadNavigate(); } catch (e) {} }
      if (typeof A.ensureRooms === 'function') { try { await A.ensureRooms({}); } catch (e) {} }
      const DUR = 60;
      let real = [];
      try {
        const plan = A.cinemaPathPlan(DUR);
        out.planBeats = plan && plan.beats ? plan.beats.dive : null;
        real = A.roomTitleBuildTimeline(plan, DUR) || [];
        // §CPE_ROOM_TITLE_GROUP (2026-08-02): the fill segments are NOT event captions — they have
        // no doorway, so "led its doorway by 2s" does not apply to them. Their own gates live in
        // witness_cpe_room_title_group.js; here only the room captions are lead-gated.
        real = real.filter(s => !s.group);
      } catch (e) { out.realErr = e.message; }
      out.real = real.map(s => ({ name: s.name, tStart: +s.tStart.toFixed(2), tEnd: +s.tEnd.toFixed(2),
                                 entry: s.entry == null ? null : +s.entry.toFixed(2) }));
      out.realTotal = DUR;
      return out;
    });

    const checks = [];
    const P = (n, ok, d) => { checks.push({ n, ok, d }); console.log(`  ${ok ? '✅' : '❌'} ${n}\n        ${d}`); };
    const dur = s => +(s.tEnd - s.tStart).toFixed(3);
    const near = (a, b) => Math.abs(a - b) < 1e-6;

    if (!res.hasFn) {
      P('G-TL-1..9 A.roomTitleApplyLead exists', false, 'not exported — the feature is not built');
      console.log(`\n  ${BLD}: 0/1`);
      allPass = false;
      await page.close();
      continue;
    }

    P('G-TL-1 a caption APPEARS 2s before entry (RED today: the shipped hold starts it at entry)',
      near(res.solo[0].tStart, 8.0) && near(res.today[0].tStart, 10.0),
      `entry 10.0 -> shipped caption starts ${res.today[0].tStart} (at the doorway), ` +
      `led caption starts ${res.solo[0].tStart} and runs to ${res.solo[0].tEnd} (${dur(res.solo[0])}s)`);

    P('G-TL-2 no negative time; the first caption never opens before the dive ends',
      res.atStart[0].tStart >= 0 && near(res.diveClipped[0].tStart, 6.0) && near(res.diveLate[0].tStart, 4.0),
      `entry 1.0 with no dive -> starts ${res.atStart[0].tStart} (clamped at 0); ` +
      `entry 7.0 with a 6.0s dive -> starts ${res.diveClipped[0].tStart} (clipped to the dive end, not 5.0); ` +
      `entry 4.0 with a 6.0s dive -> starts ${res.diveLate[0].tStart} (its own doorway, never later)`);

    P('G-TL-3 a room entered too soon is SKIPPED, not flashed — every shown caption gets its 3s',
      res.skipped.length === 1 && dur(res.skipped[0]) >= HOLD - 1e-6 && res.fits.length === 2 &&
      res.fits.every(s => dur(s) >= HOLD - 1e-6),
      `rooms at 12.0 and 13.5 (1.5s apart) -> ${res.skipped.length} caption ` +
      `[${res.skipped.map(s => `${s.name} ${s.tStart}→${s.tEnd}`).join(', ')}]; ` +
      `rooms at 12.0 and 17.0 -> ${res.fits.length} captions ` +
      `[${res.fits.map(s => `${s.name} ${s.tStart}→${s.tEnd} (${dur(s)}s)`).join(', ')}]`);

    P('G-TL-4 the previous caption ends exactly when the new one APPEARS — never two at once',
      res.replaced.length === 2 && near(res.replaced[0].tEnd, res.replaced[1].tStart),
      `a dwells 10→20, b enters at 21: a shows ${res.replaced[0].tStart}→${res.replaced[0].tEnd}, ` +
      `b appears ${res.replaced[1].tStart} (a is cut at b's appearance, though the camera was still in a)`);

    P('G-TL-5 the hold is a floor, not a cap — an 8s dwell is not cut to 3s',
      near(res.longDwell[0].tEnd, 18.0),
      `dwell 10→18 becomes ${res.longDwell[0].tStart}→${res.longDwell[0].tEnd} (${dur(res.longDwell[0])}s on screen)`);

    const mono = res.fits.every((s, i, arr) => s.tEnd >= s.tStart && (i === 0 || s.tStart >= arr[i - 1].tStart));
    P('G-TL-6 ordering survives: starts ordered, no caption ends before it starts',
      mono, `segments=${JSON.stringify(res.fits)}`);

    if (res.realErr || !res.real.length) {
      P('G-TL-7 real timeline invariant', false,
        (res.realErr || 'the real plan produced no captions on this building') + ' — INCONCLUSIVE, not a product verdict');
    } else {
      const bad = res.real.filter((s, i, arr) => {
        if (s.tEnd < s.tStart) return true;                                    // inverted
        if (i > 0 && s.tStart < arr[i - 1].tEnd - 1e-6) return true;           // overlap
        if (s.entry != null && s.tStart > s.entry + 1e-6) return true;         // shown AFTER the doorway
        if (s.tEnd - s.tStart >= HOLD - 1e-6) return false;                    // got its 3s
        return Math.abs(s.tEnd - res.realTotal) > 1e-6;                        // or the film ended
      });
      P('G-TL-7 on a REAL timeline every caption leads its doorway, gets 3s (or the film ends), and never overlaps',
        bad.length === 0,
        `${res.real.length} captions, planBeats.dive=${res.planBeats}: ` +
        res.real.map(s => `${s.name} ${s.tStart}→${s.tEnd} (enters ${s.entry})`).join('  |  ') +
        (bad.length ? `   VIOLATIONS: ${JSON.stringify(bad)}` : ''));

      // ⚠ G-TL-7 alone can pass with the lead NEVER FIRING — measured: on Duplex the only room is
      // entered at 5.4s and the dive ends at 5.57s, so the clip legitimately pushes the caption to
      // its own doorway and `lead=0/1`. A gate that green-lights zero lead is the trap this lane
      // already paid for once (§CPE_GHOST_GROUND armed in a regime the bake never reached). So every
      // caption must be EXPLAINED: a full 2s lead, or the film start, or the dive clip — nothing else.
      const diveEnd = res.planBeats != null ? res.planBeats * res.realTotal : 0;
      const why = res.real.map((s, i) => {
        if (near(s.tStart, s.entry - LEAD)) return { name: s.name, why: 'led 2.0s' };
        if (near(s.tStart, 0)) return { name: s.name, why: 'film start' };
        if (i === 0 && diveEnd > 0 && near(s.tStart, Math.min(s.entry, diveEnd)))
          return { name: s.name, why: `dive clip (dive ends ${diveEnd.toFixed(2)})` };
        return { name: s.name, why: 'UNEXPLAINED' };
      });
      const unex = why.filter(w => w.why === 'UNEXPLAINED');
      P('G-TL-7b every caption\'s appearance is a full 2s lead, or explained by the film start / the dive clip',
        unex.length === 0,
        why.map(w => `${w.name}: ${w.why}`).join('  |  '));
    }

    const line = logs.filter(l => /§CPE_ROOM_TITLE_TIMELINE/.test(l)).slice(-1)[0] || '';
    P('G-TL-8 the log reports the lead and the skips',
      /lead=\d+\/\d+@2s/.test(line) && /skipped=\d+/.test(line), line || 'no §CPE_ROOM_TITLE_TIMELINE line');

    const degraded = logs.filter(l => /§CPE_ROOM_TITLE_DIVE/.test(l)).slice(-1)[0] || '';
    P('G-TL-9 degrade, not disable: the dive source is named in the log, and no dive info still leads',
      /§CPE_ROOM_TITLE_DIVE src=/.test(degraded) && near(res.solo[0].tStart, 8.0),
      `${degraded || 'no §CPE_ROOM_TITLE_DIVE line'} | with diveEndSec=0 a caption still leads by ` +
      `${(10 - res.solo[0].tStart).toFixed(1)}s`);

    const pass = checks.filter(c => c.ok).length;
    console.log(`\n  ${BLD}: ${pass}/${checks.length}`);
    if (pass !== checks.length || !checks.length) allPass = false;
    await page.close();
  }

  await browser.close();
  console.log(allPass ? '\nALL GREEN' : '\nRED');
  process.exit(allPass ? 0 : 1);
})();
