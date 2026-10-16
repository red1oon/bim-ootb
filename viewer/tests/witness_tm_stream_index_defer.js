#!/usr/bin/env node
// WITNESS — §PERF_INCR_DEFER (spec: bim-compiler prompts/TM_STREAM_REBUILD_COALESCE.md;
// study: CPE_4D_PERF_MEM_FINDINGS.md §3-R5).
//
// ISSUE: TM active while a big building streams = every batch bumps _metaGen = a full
// _tmBuildEventIndex rebuild per batch (§PERF_INCR_INDEX ms=50-159, 10+ cycles ≈ 0.5-2s stacked
// main-thread cost on LTU, live 2026-07-20) — and every rebuild forced mode=full anyway. Fix:
// while app.streaming, drop the index once and render the full path (identical output — the full
// path never consults the index); build ONCE after streaming settles.
//
// GATES (run BASE_PORT against unpatched code for the RED side):
//   G-SID-DEFER   during simulated streaming (app.streaming=true + N _metaGen bumps + a render
//                 tick each), the FIX builds the index 0 times (baseline: N times — the RED side).
//   G-SID-SETTLE  first tick after streaming ends builds EXACTLY once.
//   G-SID-EQUIV   the parent lane's own bar (mismatch=0): visible-guid snapshot rendered at
//                 cursor X via the DEFERRED full path == snapshot at X via the settled indexed
//                 path. Uses the shipped __tmSetCursor/__tmSnapshotVisible hooks.
//   G-SID-PERF    informational: §PERF_INCR_INDEX ms on the one settle build.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const FIX_PORT = process.env.FIX_PORT || 8519;
const BASE_PORT = process.env.BASE_PORT || 8399;
const BLD = process.env.BLD || 'Duplex';
const N_BUMPS = 5;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function drive(browser, port, logs) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700 });
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${port}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.APP && window.APP.dbQuery && window.tmActivateForBake, { timeout: 120000 });
  await sleep(9000);
  await page.waitForFunction(() => {
    try { return window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms')[0][0] > 0; } catch (e) { return false; }
  }, { timeout: 60000, polling: 2000 });
  let ok = false;
  for (let i = 0; i < 20 && !ok; i++) ok = await page.evaluate(() => window.tmActivateForBake());
  if (!ok) throw new Error('TM activation failed on port ' + port);
  await page.evaluate(() => window.__tmStep(3600000));   // prime: one real pass, index built
  const before = logs.filter(l => /§PERF_INCR_INDEX built/.test(l)).length;

  // ── simulated streaming: the EXACT invalidation channel (app.streaming + _metaGen bumps) ──
  const r = await page.evaluate(async (N) => {
    const A = window.APP;
    A.streaming = true;
    for (let i = 0; i < N; i++) {
      A._metaGen = (A._metaGen | 0) + 1;
      window.__tmStep(600000);
    }
    // snapshot at a fixed cursor while still streaming (deferred / index-less full path)
    window.__tmSetCursor(window.tmGetState ? undefined : undefined);
    const st = window.tmGetState ? window.tmGetState() : null;
    const mid = st && st.projectStart ? (st.projectStart + (st.projectEnd - st.projectStart) * 0.5) : null;
    let snapA = null;
    if (mid != null) { window.__tmSetCursor(mid); snapA = window.__tmSnapshotVisible(); }
    A.streaming = false;
    window.__tmStep(600000);           // settle: exactly one rebuild expected on the fix
    let snapB = null;
    if (mid != null) { window.__tmSetCursor(mid); snapB = window.__tmSnapshotVisible(); }
    // __tmSnapshotVisible returns { mesh:[guid...], batched:{objId:{guid:bool}},
    // instanced:{objId:{guid:bool}} } — flatten each side to guid→visible and diff.
    const eq = (a, b) => {
      if (!a || !b) return { comparable: false };
      const flat = s => {
        const m = {};
        (s.mesh || []).forEach(g => { m['m:' + g] = true; });
        for (const grp of ['batched', 'instanced'])
          for (const oid in (s[grp] || {}))
            for (const g in s[grp][oid]) m[grp[0] + ':' + g] = s[grp][oid][g];
        return m;
      };
      const A1 = flat(a), B1 = flat(b);
      let miss = 0, n = 0;
      for (const k in A1) { n++; if (A1[k] !== B1[k]) miss++; }
      for (const k in B1) if (!(k in A1)) { miss++; }
      return { comparable: true, n, mismatch: miss };
    };
    return { cmp: eq(snapA, snapB), midCursor: mid };
  }, N_BUMPS);
  await page.close();
  return { before, r };
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 600000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader']
  });
  const checks = [];
  const P = (n, ok, d) => { checks.push({ n, ok, d }); console.log((ok ? 'PASS ' : 'FAIL ') + n + ' — ' + d); };
  try {
    const bLogs = [];
    const b = await drive(browser, BASE_PORT, bLogs);
    const bDuring = bLogs.filter(l => /§PERF_INCR_INDEX built/.test(l)).length - b.before;
    const fLogs = [];
    const f = await drive(browser, FIX_PORT, fLogs);
    const fAll = fLogs.filter(l => /§PERF_INCR_INDEX built/.test(l)).length;
    // fix-side: builds during the streaming window = total - prime(1) - settle(1)
    const fDuring = fAll - f.before - 1;
    const deferLine = fLogs.filter(l => /§PERF_INCR_DEFER/.test(l)).length;

    P('G-SID-DEFER', fDuring === 0 && deferLine >= 1 && bDuring >= N_BUMPS,
      `fix builds during streaming=${fDuring} (want 0, defer lines=${deferLine}); baseline=${bDuring} (want >=${N_BUMPS} — RED side)`);
    P('G-SID-SETTLE', fAll === f.before + 1,
      `fix total builds=${fAll} = prime(${f.before}) + settle(1)`);
    P('G-SID-EQUIV', f.r.cmp.comparable === true && f.r.cmp.mismatch === 0,
      `deferred-path vs settled-path visible set: ${JSON.stringify(f.r.cmp)}`);
    const settleMs = (fLogs.map(l => l.match(/§PERF_INCR_INDEX built.*ms=([\d.]+)/)).filter(Boolean).pop() || [])[1];
    P('G-SID-PERF', true, `informational: settle build ms=${settleMs} on ${BLD}; baseline paid ~that ×${bDuring} during streaming`);
  } catch (e) {
    P('G-INFRA', false, e.message);
  } finally {
    const pass = checks.filter(c => c.ok).length;
    console.log(`\n§TM_STREAM_INDEX_DEFER WITNESS ${pass}/${checks.length} PASS`);
    await browser.close();
    process.exit(pass === checks.length ? 0 : 1);
  }
})();
