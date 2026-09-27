#!/usr/bin/env node
// WITNESS — §CPE_REPLAN_LAZY (spec: bim-compiler prompts/CINEMA_DELIGHT_BATCH.md:40-66;
// study: CPE_4D_PERF_MEM_FINDINGS.md §3-R3).
//
// ISSUE: _cinemaPathPlan recomputed its invariant prefix (§CINEMA_SPACE scan + §CINEMA_DIVE settle
// + §CINEMA_EXIT scoring/route — ~550ms of the measured 600-1000ms §CPE_REPLAN_SLOW) BYTE-IDENTICALLY
// on every band drag (8 consecutive drags identical, Terminal 48k), and Alt+C open ran the full plan
// 3× (~560ms, §CINEMA_PLAN_MS 291+133+135). Fix: cache the prefix keyed on
// (building, _metaGen, camPos, yaw0, pitch0) — pinned for the whole session by §CPE_PREVIEW_DIVERGENCE.
//
// GATES (spec's own bar: "Gate it on equivalence, not on speed"):
//   G-RL-EQUIV   THE BLOCKING GATE (W-REPLAN-CACHE): for N band-edit variants, the CACHED plan's
//                sampled poses equal the UNCACHED plan's (invalidate → recompute) within 1e-6 m.
//   G-RL-LINES   §CINEMA_DIVE + §CINEMA_EXIT lines on a cache hit are byte-identical to the miss's
//                (witness_cpe_preview_divergence.js parses them — the contract holds).
//   G-RL-DEDUPE  the editor-open triple plan computes the prefix ONCE (1 miss, ≥1 hit) —
//                §CPE_PANEL_PERF item 2 closed.
//   G-RL-INVAL   A.cinemaPrefixInvalidate() forces the next plan to recompute (the re-derive
//                control's engine half; the panel button is a flagged user decision, not shipped).
//   G-RL-PERF    informational: prefixMs (miss) vs savedMs (hit) from §CPE_REPLAN_LAZY lines.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT = process.env.PORT || 8518;
const BLD = process.env.BLD || 'Duplex';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 600000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader']
  });
  const checks = [];
  const P = (n, ok, d) => { checks.push({ n, ok, d }); console.log((ok ? 'PASS ' : 'FAIL ') + n + ' — ' + d); };
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 700 });
    const logs = [];
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
    await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
      { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(
      () => window.APP && window.APP.cinemaPathPlan && window.APP.cinemaPathEditor &&
            window.APP.startMaxQualityOrbit && window.APP._composer, { timeout: 120000 });
    await sleep(9000);
    await page.waitForFunction(() => {
      try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
      catch (e) { return false; }
    }, { timeout: 60000, polling: 2000 });

    // ── G-RL-DEDUPE: open the editor; the (up to 3×) open-time plans share one prefix ──
    const mark0 = logs.length;
    await page.evaluate(() => { window.APP.startMaxQualityOrbit({ preview: false, fps: 1, editor: true }); });
    await page.waitForSelector('#cpe-ok', { timeout: 300000 });
    await sleep(1000);
    const openLog = logs.slice(mark0);
    const misses0 = openLog.filter(l => /§CPE_REPLAN_LAZY miss=1/.test(l)).length;
    const hits0 = openLog.filter(l => /§CPE_REPLAN_LAZY hit=1/.test(l)).length;
    const plans0 = openLog.filter(l => /§CINEMA_PLAN_MS/.test(l)).length;
    P('G-RL-DEDUPE', misses0 === 1 && (plans0 <= 1 || hits0 >= 1),
      `editor open: plans=${plans0} prefixMiss=${misses0} prefixHit=${hits0} (want 1 miss; every further open-plan a hit)`);

    // ── G-RL-EQUIV + G-RL-LINES: cached vs invalidated-recompute pose equivalence, N variants ──
    // Drives the PLAN seam directly (the precedent every cinema witness uses). Each variant nudges
    // the stored band centres — the exact state a drag mutates — then compares poseAt samples
    // between a cache-hit plan and a forced-recompute plan of the SAME override.
    const res = await page.evaluate(() => {
      const A = window.APP;
      const ed = A._getCinemaPathEdit ? A._getCinemaPathEdit() : null;
      const base = ed || null;
      const S = 60, out = [];
      function samp(plan) {
        const a = [];
        for (let i = 0; i <= S; i++) {
          const p = plan.poseAt(i / S);
          a.push([p.x, p.y, p.z, p.tx, p.ty, p.tz]);
        }
        return a;
      }
      function maxd(a, b) {
        let m = 0;
        for (let i = 0; i < a.length; i++)
          for (let j = 0; j < 6; j++) m = Math.max(m, Math.abs(a[i][j] - b[i][j]));
        return m;
      }
      for (let v = 0; v < 4; v++) {
        let ov = base ? JSON.parse(JSON.stringify(base)) : null;
        if (ov && ov.bands && ov.bands.length) {
          for (let bi = 0; bi < ov.bands.length; bi++) {
            ov.bands[bi].c.x += (v + 1) * 0.7 * (bi % 2 ? 1 : -1);
            ov.bands[bi].c.z += (v + 1) * 0.4;
          }
        }
        const cached = A.cinemaPathPlan(30, ov);       // prefix cache warm from the open above
        const cachedSamp = samp(cached);
        A.cinemaPrefixInvalidate('witness');
        const fresh = A.cinemaPathPlan(30, ov);        // full recompute, same override
        const freshSamp = samp(fresh);
        out.push({ v: v, maxDelta: maxd(cachedSamp, freshSamp), bands: ov && ov.bands ? ov.bands.length : 0 });
      }
      return out;
    });
    const worst = Math.max.apply(null, res.map(r => r.maxDelta));
    P('G-RL-EQUIV', worst <= 1e-6,
      `W-REPLAN-CACHE: ${res.length} band-edit variants, worst pose delta=${worst.toExponential(2)} (bar 1e-6) [${res.map(r => r.maxDelta.toExponential(1)).join(', ')}]`);

    const diveLines = logs.filter(l => /§CINEMA_DIVE /.test(l));
    const exitLines = logs.filter(l => /§CINEMA_EXIT chosen=/.test(l));
    const diveUniq = new Set(diveLines).size, exitUniq = new Set(exitLines).size;
    P('G-RL-LINES', diveLines.length >= 3 && diveUniq === 1 && exitUniq === 1,
      `§CINEMA_DIVE lines=${diveLines.length} unique=${diveUniq}; §CINEMA_EXIT lines=${exitLines.length} unique=${exitUniq} (hits replay verbatim)`);

    // ── G-RL-INVAL ──
    const mark1 = logs.length;
    await page.evaluate(() => { window.APP.cinemaPrefixInvalidate('witness-final'); window.APP.cinemaPathPlan(30, null); });
    await sleep(300);
    const tail = logs.slice(mark1);
    P('G-RL-INVAL', tail.some(l => /§CPE_REPLAN_LAZY invalidated/.test(l)) && tail.some(l => /§CPE_REPLAN_LAZY miss=1/.test(l)),
      'invalidate → next plan recomputes (miss logged)');

    const missMs = (logs.map(l => l.match(/§CPE_REPLAN_LAZY miss=1 prefixMs=([\d.]+)/)).filter(Boolean)[0] || [])[1];
    const hitMs = (logs.map(l => l.match(/§CPE_REPLAN_LAZY hit=1 savedMs=([\d.]+)/)).filter(Boolean)[0] || [])[1];
    P('G-RL-PERF', true, `informational: prefixMs(miss)=${missMs} savedMs(hit)=${hitMs} on ${BLD} under swiftshader`);
  } catch (e) {
    P('G-INFRA', false, e.message);
  } finally {
    const pass = checks.filter(c => c.ok).length;
    console.log(`\n§CPE_REPLAN_LAZY WITNESS ${pass}/${checks.length} PASS`);
    await browser.close();
    process.exit(pass === checks.length ? 0 : 1);
  }
})();
