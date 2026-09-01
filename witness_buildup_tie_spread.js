// WITNESS — §BUILDUP_TIE_SPREAD (bim-compiler prompts/CINEMA_PATH_EDITOR.md).
//
// ISSUE IT PROVES/DISPROVES: user, 2026-09-01 — floor slabs "seems to come on all at once". The
// reveal is a pure timestamp compare (time_machine.js:1232 `op.end_ts <= cursorMs`) and the bake
// steps the cursor linearly in calendar ms, with NO per-frame element budget anywhere. So every op
// tied on one instant becomes visible on ONE frame — 1 element or 5,000, same frame. The ties are
// manufactured in support_sweep.js: when a task's elements share one raw start, every gap is 0 so
// pad = 0 and all N land on w.s exactly.
//
// The metric is the one the viewer actually feels: MAX ELEMENTS REVEALED IN A SINGLE FRAME, computed
// by bucketing every op's end_ts into the same linear cursor steps the bake uses. A "pop" is that
// number being far above the mean. Reported as a ratio to the mean so it is comparable across
// buildings and frame counts.
//
// Run it against BOTH ports (stock and fixed) — the number only means something as a comparison.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT = process.env.PORT || 8541, BLD = process.env.BLD || 'Hospital';
const FRAMES = +(process.env.FRAMES || 3118);   // the user's own last Hospital bake
const LABEL = process.env.LABEL || ('port ' + PORT);
process.on('unhandledRejection', e => { console.error('UNHANDLED: ' + (e && e.stack || e)); process.exit(1); });
(async () => {
  const b = await puppeteer.launch({ headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
    protocolTimeout: 1800000 });
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 500 });
  let spreadLog = null;
  p.on('console', m => { const t = m.text(); if (/§BUILDUP_TIE_SPREAD/.test(t)) spreadLog = t.slice(0, 220); });
  await p.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    { waitUntil: 'domcontentloaded', timeout: 180000 });
  await p.waitForFunction(() => window.APP && window.APP.db, { timeout: 240000 });
  await p.waitForFunction(() => window.APP.streaming === true || (window.APP.streamQueue || []).length > 0,
    { timeout: 180000, polling: 250 }).catch(() => {});
  await p.waitForFunction(() => !window.APP.streaming || (window.APP.streamIdx >= (window.APP.streamQueue || []).length),
    { timeout: 900000, polling: 1000 }).catch(() => {});
  const r = await p.evaluate(async (FRAMES) => {
    if (typeof window.tmGenerateTimeline === 'function') {
      try { const x = window.tmGenerateTimeline(); if (x && x.then) await x; } catch (e) { return { fail: 'generate: ' + e.message }; }
    }
    // tmOpsSnapshot() is EMPTY until the timeline is activated — generate alone is not enough. The
    // first cut of this witness omitted this and got "no ops" on both sides of the A/B.
    if (typeof window.tmActivateForBake === 'function') {
      try { await window.tmActivateForBake(); } catch (e) { return { fail: 'activate: ' + e.message }; }
    }
    if (typeof window.tmFollowTimeline === 'function') { try { window.tmFollowTimeline(); } catch (e) {} }
    const ops = (typeof window.tmOpsSnapshot === 'function') ? window.tmOpsSnapshot() : null;
    if (!ops || !ops.length) return { fail: 'no ops' };
    const ends = ops.map(o => (o.e == null ? o.s : o.e));
    const lo = Math.min(...ops.map(o => o.s)), hi = Math.max(...ends);
    const span = hi - lo;
    if (!(span > 0)) return { fail: 'zero span' };
    // exact tie groups
    const tie = new Map();
    for (const e of ends) tie.set(e, (tie.get(e) || 0) + 1);
    let maxTie = 0; for (const v of tie.values()) if (v > maxTie) maxTie = v;
    // elements revealed per frame, the bake's own linear cursor stepping
    const bucket = new Array(FRAMES).fill(0);
    for (const e of ends) {
      let i = Math.floor((e - lo) / span * FRAMES);
      if (i >= FRAMES) i = FRAMES - 1; if (i < 0) i = 0;
      bucket[i]++;
    }
    let maxF = 0, maxAt = 0, nonEmpty = 0;
    for (let i = 0; i < FRAMES; i++) { if (bucket[i] > maxF) { maxF = bucket[i]; maxAt = i; } if (bucket[i]) nonEmpty++; }
    return { n: ops.length, distinctEnds: tie.size, maxTie, maxF, maxAt, nonEmpty, FRAMES };
  }, FRAMES);
  console.log('='.repeat(86) + `\n§BUILDUP_TIE_SPREAD witness — ${BLD} — ${LABEL}\n` + '='.repeat(86));
  if (r.fail) { console.log('  INCONCLUSIVE — ' + r.fail + '; nothing was judged.'); await b.close(); process.exit(2); }
  if (spreadLog) console.log('  log: ' + spreadLog);
  const mean = r.n / r.FRAMES;
  console.log(`  ops ${r.n}   distinct end_ts ${r.distinctEnds}   largest exact tie ${r.maxTie}`);
  console.log(`  frames ${r.FRAMES}  mean ${mean.toFixed(1)} elements/frame  frames that reveal anything ${r.nonEmpty}`);
  console.log(`  WORST FRAME: ${r.maxF} elements at frame ${r.maxAt}  = ${(r.maxF/mean).toFixed(1)}x the mean`);
  await b.close();
})();
