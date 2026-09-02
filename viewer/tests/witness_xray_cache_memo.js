#!/usr/bin/env node
// WITNESS — W-XRAY-MEMO — §XRAY_CACHE_MEMO + §TM_WARM
// Spec: bim-compiler prompts/CPE_4D_PERF_MEM_FINDINGS.md §3c (R4, user ruling 2026-08-12).
//
// ISSUE THIS PROVES OR DISPROVES:
//   The x-ray support-edge cache (74,942 edges / ~0.7s on Hospital) rebuilt on EVERY TM activation,
//   including the §GANTT_CACHE_HIT fast path where injectGantt never runs. It is a pure function of
//   (DB elements) + (_ops end_ts), so identical inputs were recomputing a byte-identical map.
//   The fix memoizes it on _metaGen + an _ops signature. The DANGER the fix introduces is a FALSE
//   HIT — serving a stale staging map after the schedule moved, which is a wrong-render bug, not a
//   perf one. So the blocking bar is EQUIVALENCE and KEY DISCIPLINE, never speed.
//
//   It also proves §TM_WARM does what the ruling allowed and nothing more: warm the DERIVED DATA,
//   never activate. G-CPE-SOLE-OWNER ("only a real Play opens Time Machine") must still hold.
//
// GATES:
//   G-XM-WARM      tmWarmXrayElements() with TM OFF: TM stays inactive, _ops stays empty, the
//                  kernel_ops row count is unchanged (no DB write), the panel stays hidden, and the
//                  elements memo becomes populated. Proves the warm contract's four "must nots".
//   G-XM-EQUIV     (BLOCKING) map built fresh == map restored from the memo, compared KEY BY KEY.
//                  mismatch=0 required. This is the bar; timing is not.
//   G-XM-KEY       move one op's end_ts -> MUST miss and rebuild; move it back -> MUST hit.
//                  Proves the memo cannot serve a stale map across a schedule change.
//   G-XM-RESET     after deactivate(), _tmXraySolidifyTs is {} and both counters are 0 —
//                  §Z_STACK_XRAY_STAGING's "nothing may survive TM being switched off" is intact.
//                  A memo surviving is not the same as state surviving.
//   G-XM-PERF      informational only: elemMs/edgeMs split from the new §XRAY_CACHE_BUILD line.
//                  Recorded, never asserted (headless swiftshader is not a perf instrument —
//                  CPE_4D_PERF_MEM_FINDINGS.md §6).
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT = process.env.FIX_PORT || 8519;
const BLD = process.env.BLD || 'Duplex';
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Load budget is environment, not behaviour: Hospital under headless swiftshader blew the 120s
// default (witnessed: "Waiting failed: 120000ms exceeded" before a single gate ran). Configurable
// so a big building can be measured without editing the file. See CPE_4D_PERF_MEM_FINDINGS.md §6.
const LOAD_MS = +(process.env.LOAD_MS || 120000);
const SETTLE_MS = +(process.env.SETTLE_MS || 9000);

const results = [];
function gate(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader']
  });
  const logs = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 700 });
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
    await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
      { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.APP && window.APP.dbQuery && window.tmActivateForBake,
      { timeout: LOAD_MS });
    await sleep(SETTLE_MS);
    await page.waitForFunction(() => {
      try { return window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms')[0][0] > 0; }
      catch (e) { return false; }
    }, { timeout: LOAD_MS, polling: 2000 });
    await page.waitForFunction(() => !window.APP.streaming, { timeout: LOAD_MS, polling: 1000 });

    // ── G-XM-WARM: the warm contract, asserted BEFORE any activation ──────────────────────────
    const koCount = () => page.evaluate(() => {
      try { return window.APP.dbQuery('SELECT COUNT(*) FROM kernel_ops')[0][0]; } catch (e) { return -1; }
    });
    const koBefore = await koCount();
    const warmBefore = await page.evaluate(() => window.__tmXrayProbe());
    const scheduled = await page.evaluate(() => window.tmWarmXrayElements());
    // requestIdleCallback has no timeout by design (baseline-perf guard) — give the browser real
    // idle time rather than forcing it.
    await sleep(4000);
    const warmAfter = await page.evaluate(() => window.__tmXrayProbe());
    const koAfter = await koCount();
    const panelShown = await page.evaluate(() => {
      const p = document.getElementById('time-machine-panel');
      return !!(p && p.style.display && p.style.display !== 'none');
    });
    const warmLine = logs.find(l => /§TM_WARM/.test(l)) || '(none)';
    const warmOK = scheduled === true && warmAfter.active === false && warmAfter.ops === 0 &&
                   koAfter === koBefore && panelShown === false && warmAfter.elemMemo === true &&
                   warmBefore.elemMemo === false;
    gate('G-XM-WARM', warmOK,
      `scheduled=${scheduled} active=${warmAfter.active} ops=${warmAfter.ops} ` +
      `kernel_ops ${koBefore}->${koAfter} panel=${panelShown} ` +
      `elemMemo ${warmBefore.elemMemo}->${warmAfter.elemMemo} | ${warmLine}`);

    // ── activate for the rest ─────────────────────────────────────────────────────────────────
    let ok = false;
    for (let i = 0; i < 20 && !ok; i++) ok = await page.evaluate(() => window.tmActivateForBake());
    if (!ok) throw new Error('TM activation failed on port ' + PORT);

    // ── Ensure a NON-EMPTY defect population before the equivalence bar ───────────────────────
    // Witnessed on the first run: Duplex's staged population is legitimately 0 (no element whose
    // last carrier finishes after its own reveal), so comparing two empty maps would prove nothing
    // and the gate would pass vacuously. Shift one op's end_ts until a real population exists —
    // that is exactly the "carrier finishes late" condition the feature is about.
    let popShift = 0;
    for (const shift of [0, 86400000, 86400000 * 6, 86400000 * 30]) {
      if (shift) { await page.evaluate(s => window.__tmXrayProbe('nudge', s), shift); popShift += shift; }
      const p = await page.evaluate(() => { window.__tmXrayProbe('clearMemo'); window.__tmXrayProbe('rebuild'); return window.__tmXrayProbe(); });
      if (p.staged > 0) break;
    }
    const pop = await page.evaluate(() => window.__tmXrayProbe());
    console.log(`      (defect population for the equivalence bar: staged=${pop.staged} after end_ts shift of ${popShift / 86400000}d)`);

    // ── G-XM-EQUIV (BLOCKING): fresh map vs memo-restored map, key by key ─────────────────────
    // Force a cold build (memo cleared) and snapshot; then rebuild again — that second call must
    // be a memo HIT — and snapshot again. The two maps must be identical entry for entry.
    const fresh = await page.evaluate(() => { window.__tmXrayProbe('clearMemo'); window.__tmXrayProbe('rebuild'); return window.__tmXrayProbe('map'); });
    const nLogsBefore = logs.length;
    const hitted = await page.evaluate(() => { window.__tmXrayProbe('rebuild'); return window.__tmXrayProbe('map'); });
    const hitLine = logs.slice(nLogsBefore).find(l => /§XRAY_CACHE_BUILD/.test(l)) || '(none)';
    let mismatch = 0, missingA = 0, missingB = 0;
    const kf = Object.keys(fresh.map), kh = Object.keys(hitted.map);
    for (const k of kf) {
      if (!(k in hitted.map)) { missingB++; continue; }
      if (hitted.map[k] !== fresh.map[k]) mismatch++;
    }
    for (const k of kh) if (!(k in fresh.map)) missingA++;
    const equivOK = mismatch === 0 && missingA === 0 && missingB === 0 &&
                    kf.length === kh.length && kf.length > 0 &&
                    /edgeMemo=hit/.test(hitLine) && hitted.solidified === 0;
    gate('G-XM-EQUIV', equivOK,
      `n=${kf.length}/${kh.length} mismatch=${mismatch} missingA=${missingA} missingB=${missingB} ` +
      `solidifiedResetTo=${hitted.solidified} | ${hitLine}`);

    // ── G-XM-KEY: a schedule change MUST force a miss; undoing it MUST restore the hit ────────
    // The restore leg is what proves the memo is TWO slots: a single slot would have been evicted
    // by the nudged build and would miss here (that is exactly what the first run showed). The
    // derived-order round trip in the cinema bake (tmApplyDerivedOrder → tmRestoreDerivedOrder)
    // walks this same alternation, which is why it is a gate and not a nicety.
    const nBeforeNudge = logs.length;
    const nudged = await page.evaluate(() => { window.__tmXrayProbe('nudge', 86400000); window.__tmXrayProbe('rebuild'); return window.__tmXrayProbe(); });
    const nudgeLine = logs.slice(nBeforeNudge).find(l => /§XRAY_CACHE_BUILD/.test(l)) || '(none)';
    const nBeforeRestore = logs.length;
    const restored = await page.evaluate(() => { window.__tmXrayProbe('nudge', -86400000); window.__tmXrayProbe('rebuild'); return window.__tmXrayProbe('map'); });
    const restoreLine = logs.slice(nBeforeRestore).find(l => /§XRAY_CACHE_BUILD/.test(l)) || '(none)';
    let restMismatch = 0;
    for (const k of Object.keys(fresh.map)) if (restored.map[k] !== fresh.map[k]) restMismatch++;
    const keyOK = /edgeMemo=miss/.test(nudgeLine) && /edgeMemo=hit/.test(restoreLine) &&
                  restMismatch === 0 && Object.keys(restored.map).length === kf.length;
    gate('G-XM-KEY', keyOK,
      `nudge->${/edgeMemo=miss/.test(nudgeLine) ? 'MISS' : 'HIT(BAD)'} ` +
      `restore->${/edgeMemo=hit/.test(restoreLine) ? 'HIT' : 'MISS'} ` +
      `restoredMismatch=${restMismatch} staged(nudged)=${nudged.staged}`);

    // ── G-XM-RESET: the §Z_STACK_XRAY_STAGING invariant is untouched by the memo ──────────────
    const afterOff = await page.evaluate(() => {
      window.__tmXrayProbe('deactivate');   // the same verb the panel's close button calls
      return new Promise(r => setTimeout(() => r(window.__tmXrayProbe()), 1200));
    });
    const resetOK = afterOff.active === false && afterOff.n === 0 &&
                    afterOff.staged === 0 && afterOff.solidified === 0 && afterOff.edgeMemo > 0;
    gate('G-XM-RESET', resetOK,
      `active=${afterOff.active} mapEntries=${afterOff.n} staged=${afterOff.staged} ` +
      `solidified=${afterOff.solidified} memoSurvives=${afterOff.edgeMemo} ` +
      `(state resets, memo survives — that is the ruling)`);

    // ── G-XM-PERF: informational split, never asserted ────────────────────────────────────────
    const perfLines = logs.filter(l => /§XRAY_CACHE_BUILD/.test(l));
    gate('G-XM-PERF', true, `builds=${perfLines.length} | ${perfLines.slice(0, 4).join(' || ')}`);

    const errs = logs.filter(l => /PAGEERROR/.test(l));
    gate('G-XM-NOERR', errs.length === 0, `pageErrors=${errs.length} ${errs.slice(0, 2).join(' | ')}`);
  } catch (e) {
    gate('G-XM-RUN', false, 'harness error: ' + e.message);
  } finally {
    await browser.close();
  }
  const passed = results.filter(r => r.pass).length;
  console.log(`\n§XRAY_MEMO_WITNESS ${passed}/${results.length} gates passed`);
  process.exit(passed === results.length ? 0 : 1);
})();
