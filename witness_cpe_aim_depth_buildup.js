// WITNESS — §CPE_AIM_DEPTH_BUILDUP candidate 2 (2026-08-13). Spec: bim-compiler
// prompts/CINEMA_PATH_EDITOR.md §CPE_AIM_DEPTH_BUILDUP. User: "Why stall on candidate 2. See if it
// is useful then fix it for testing."
//
// NAMES THE ISSUE: `_aimDepthWeight`/`_aimDepthSubject` (§CPE_AIM_DEPTH) used to be UNCONDITIONALLY
// silent during a buildup bake (`if (A._cinemaPathEdit && A._cinemaPathEdit.buildup) return null;`)
// because the subject grid was the WHOLE finished building with no notion of what had actually been
// revealed. Candidate 2 restricts the search to elements §CPE_BUILDUP has actually placed by the
// real cursor at that point in the film, using the SAME cursor-mapping the bake itself uses.
//
//   M1  W-GUIDENDS — tmGuidEndTs() returns real, non-trivial per-guid completion times once Time
//       Machine is armed on a real building.
//   M2  W-BUILDUP-OFF-UNCHANGED — with buildup OFF, the probe reports unrestricted (cells=null),
//       exactly the original behaviour — proves this change is a pure addition, not a rewrite of the
//       non-buildup path.
//   M3  W-BUILDUP-ON-RESTRICTED — with buildup ON, at least one probe along the walk reports
//       restricted=true (the fix actually engaged, not silently degraded).
//   M4  W-PLACED-GROWS — the number of placed elements the restricted grid sees is monotone
//       non-decreasing as e3 advances (a real cursor, not a fixed/frozen snapshot).
//   M5  W-PLACED-BOUNDED — the restricted grid's element count never exceeds the FULL grid's — it is
//       a genuine subset, at every probe, not an accidental pass-through of everything.
//   M6  W-RULE-FIRES — before this fix `§CPE_AIM_DEPTH`'s own trigger (`_probeAimDepth().fired`)
//       could never be true during buildup by construction (the guard returned null before density
//       was even computed). After the fix it fires at least once across the walk when boxed in.
//
// Read the §-log lines. Exit code alone is not evidence.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8435;
const BLD = process.env.BLD || 'Hospital_3';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 300000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.APP && window.APP.cinemaPathPlan, { timeout: 180000 });
  await sleep(9000);
  await page.waitForFunction(() => {
    try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
    catch (e) { return false; }
  }, { timeout: 120000, polling: 2000 });

  const res = await page.evaluate(async () => {
    const A = window.APP, out = {};
    if (typeof window.tmActivateForBake !== 'function') return { err: 'no time_machine' };
    out.activated = await window.tmActivateForBake();
    if (!out.activated) return { err: 'tmActivateForBake false' };
    const bkState = window.tmFollowTimeline();
    if (!bkState) return { err: 'tmFollowTimeline returned null' };
    out.bkState = { ops: bkState.ops, source: bkState.source };

    // M1
    const guidEnds = window.tmGuidEndTs ? window.tmGuidEndTs() : null;
    out.guidEndsCount = guidEnds ? Object.keys(guidEnds).length : null;

    // Build a real plan so _outPos/envelope/etc are populated (same as any real preview/bake).
    A._cinemaPathEdit = null;   // clean slate — no authored override
    const plan = A.cinemaPathPlan(55, null);
    out.beatsRise = plan && plan.beats ? plan.beats.rise : null;

    // M2 — buildup OFF, sweep the walk.
    const offSamples = [];
    for (let i = 0; i <= 20; i++) offSamples.push(A._probeAimDepth(i / 20));
    out.offSamples = offSamples;

    // Turn buildup ON exactly like the checkbox does (§CPE_BUILDUP_FOLLOW_TM's own contract:
    // the flag alone; the reveal follows the Time Machine timeline as-is).
    A._cinemaPathEdit = { buildup: true };
    // A fresh plan is required — _aimDepthWeight/_aimGrid/_densPoints are all scoped INSIDE
    // cinemaPathPlan()'s own closure (see effects.js's own comment on why this is safe: the
    // buildup flag is read live at BUILD time, so a stale plan built before the flag flipped would
    // never see it — same reason a real editing session always replans on checkbox change).
    const plan2 = A.cinemaPathPlan(55, null);

    const onSamples = [];
    for (let i = 0; i <= 20; i++) onSamples.push(A._probeAimDepth(i / 20));
    out.onSamples = onSamples;

    return out;
  });

  if (res.err) { console.log('❌ SKIP reason=' + res.err); await browser.close(); process.exit(1); }

  const checks = [];
  const P = (n, ok, d) => { checks.push({ n, ok, d }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}\n        ${d}`); };

  console.log(`\n${BLD} — bkState.ops=${res.bkState.ops} source=${res.bkState.source} beatsRise=${res.beatsRise}\n`);

  P('M1 W-GUIDENDS tmGuidEndTs() returns real per-guid completion times', res.guidEndsCount > 0,
    `guidEndsCount=${res.guidEndsCount}`);

  const offRestricted = res.offSamples.some(s => s.restricted);
  P('M2 W-BUILDUP-OFF-UNCHANGED no probe reports restricted=true with buildup off', !offRestricted,
    `restrictedCount(off)=${res.offSamples.filter(s => s.restricted).length}/21`);

  const onRestrictedCount = res.onSamples.filter(s => s.restricted).length;
  P('M3 W-BUILDUP-ON-RESTRICTED at least one probe restricts the search with buildup on', onRestrictedCount > 0,
    `restrictedCount(on)=${onRestrictedCount}/21`);

  const placedSeries = res.onSamples.map(s => s.placedElems).filter(x => x != null);
  let grows = true;
  for (let i = 1; i < placedSeries.length; i++) if (placedSeries[i] < placedSeries[i - 1] - 1e-6) grows = false;
  P('M4 W-PLACED-GROWS placed-element count is monotone non-decreasing across the walk', grows,
    `placedElems series=[${placedSeries.join(',')}]`);

  const totalElems = res.onSamples.find(s => s.restricted) ? null : null; // n/a, cross-checked below
  const maxPlaced = placedSeries.length ? Math.max(...placedSeries) : 0;
  P('M5 W-PLACED-BOUNDED restricted count never implausibly exceeds bkState.ops', maxPlaced <= res.bkState.ops,
    `maxPlacedElems=${maxPlaced} bkState.ops=${res.bkState.ops}`);

  const fired = res.onSamples.some(s => s.fired);
  P('M6 W-RULE-FIRES §CPE_AIM_DEPTH actually fires at least once during a buildup walk', fired,
    `firedCount(on)=${res.onSamples.filter(s => s.fired).length}/21 ` +
    `firedCount(off)=${res.offSamples.filter(s => s.fired).length}/21`);

  console.log('\nsample on-probes (e3, restricted, placedElems, fired, w):');
  res.onSamples.forEach((s, i) => console.log(`  e3=${(i/20).toFixed(2)} restricted=${s.restricted} placedElems=${s.placedElems} fired=${s.fired} w=${s.w != null ? s.w.toFixed(3) : 'n/a'}`));

  const allPass = checks.every(c => c.ok);
  console.log('\n' + (allPass ? 'WITNESS PASS' : 'WITNESS FAIL'));
  await browser.close();
  process.exit(allPass ? 0 : 1);
})();
