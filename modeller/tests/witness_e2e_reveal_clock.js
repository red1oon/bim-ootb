#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-REVEAL-CLOCK: real-user witness for §REVEAL-FRAME-CLOCK (bim-compiler prompts/MODELLER_MASTER.md).
 * Read the log after every run.
 * ISSUE IT PROVES OR DISPROVES: the walk's build-up (§D64, _dwRevealTick) ran on wall-clock time, so when the walk's commit
 * blocked the page (measured on a real building: 207 signed ops + 554 line ops in the reveal window) it reached done before a
 * single frame was drawn — the user never saw the devices come on.
 * CLAIMS:
 *   C1 SEEN-AFTER-BLOCK  the main thread is blocked longer than the build-up (dur + 1 s) right after the reveal starts; afterwards __dwReveal.ELEC.i still rises
 *                        through ≥3 distinct values before done. RED on main: done at the first sample.
 *   C2 RENDERED-DURATION the §DW-REVEAL done line states rendered ms (within 10% of dur) and wall ms (≥ the block). Main's
 *                        line printed only `ms=<dur>`, the configured duration, so it could not tell.
 *   C4 HELD-UNTIL-COMMIT the build-up is held while the walk commits (take 2: the commit's ~1.3 s chunks left 6 frames in 8 s)
 *                        and starts after §DISC-WALK-COMMIT; no front is drawn while held.
 *   C3 COMPLETE          after done, every ELEC bucket's count = dwSub.length.
 */
'use strict';
const { runE2E } = require('./e2e_harness');
runE2E('W-E2E-REVEAL-CLOCK', async (t) => {
  await t.open('Duplex');
  const n0 = t.slog.length;
  const walk = t.pg.evaluate(() => { window.discWalk('ELEC', { building: 'Duplex' }); return true; });
  await walk;
  const armed = await t.pg.waitForFunction(() => !!(window.__dwRevealMeta && window.__dwRevealMeta.ELEC), { timeout: 120000, polling: 10 }).then(() => true).catch(() => false);
  const dur = await t.pg.evaluate(() => window.__dwRevealMeta && window.__dwRevealMeta.ELEC ? window.__dwRevealMeta.ELEC.dur : null);
  // fronts sampled while the reveal is still held (before its release line): a held build-up draws nothing
  const preRelease = [];
  for (let k = 0; k < 40; k++) { const r = await t.pg.evaluate(() => { const R = window.__dwRevealMeta && window.__dwRevealMeta.ELEC; const v = window.__dwReveal && window.__dwReveal.ELEC; return { hold: !!(R && R.hold), i: v ? v.i : 0 }; });
    if (!r.hold) break; preRelease.push(r.i || 0); await t.sleep(25); }
  if (!armed) { t.assert('C1 SEEN-AFTER-BLOCK', false, 'reveal never armed'); return; }
  const blockMs = (dur || 7000) + 1000;   // longer than the whole build-up: a wall clock must finish inside the block
  await t.pg.evaluate((b) => { const t0 = performance.now(); while (performance.now() - t0 < b) { /* block the main thread, as a heavy commit does */ } }, blockMs);
  const seen = []; const tS = Date.now();
  while (Date.now() - tS < 150000) {   // swiftshader draws a few fps: allow the full rendered duration
    const r = await t.pg.evaluate(() => { const v = window.__dwReveal && window.__dwReveal.ELEC; return v ? { i: v.i, n: v.n, done: !!v.done, meta: !!(window.__dwRevealMeta && window.__dwRevealMeta.ELEC) } : null; });
    if (r && (!seen.length || seen[seen.length - 1] !== r.i)) seen.push(r.i);
    if (r && r.done && !r.meta) break;
    await t.sleep(150);
  }
  const rising = seen.filter((x, k, a) => k > 0 && x > a[k - 1]).length;
  t.assert('C1 SEEN-AFTER-BLOCK (after a block longer than the build-up, the front still rises through ≥3 distinct values)', seen.length >= 3 && rising >= 2, 'samples=' + JSON.stringify(seen.slice(0, 12)) + ' rising=' + rising + ' dur=' + dur + ' block=' + blockMs);
  const dl = t.slog.slice(n0).filter(l => /§DW-REVEAL disc=ELEC done/.test(l)).pop() || '';
  const ms = +((/ ms=(\d+)/.exec(dl) || [])[1] || NaN);
  const wall = +((/ wallMs=(\d+)/.exec(dl) || [])[1] || NaN);
  t.assert('C2 RENDERED-DURATION (done line states rendered ms within 10% of dur, and wall ms ≥ block + rendered)', isFinite(ms) && isFinite(wall) && dur && Math.abs(ms - dur) <= 0.1 * dur && wall >= blockMs, 'line="' + dl.slice(0, 160) + '" dur=' + dur);
  await t.sleep(500);
  const full = await t.pg.evaluate(() => { const g = window.Bonsai.group(); const root = g.children.find(o => o.userData && o.userData.dwRoot);
    const ims = root ? root.children.filter(o => o.isInstancedMesh && o.userData.dwDisc === 'ELEC' && Array.isArray(o.userData.dwSub)) : [];
    return { n: ims.length, ok: ims.every(im => im.count === im.userData.dwSub.length), counts: ims.map(im => im.count + '/' + im.userData.dwSub.length) }; });
  // C4 — held until the walk's own commit is done: the release line comes after §DISC-WALK-COMMIT, and the front was not drawn before
  const L4 = t.slog.slice(n0), iC = L4.findIndex(l => /§DISC-WALK-COMMIT disc=ELEC/.test(l)), iR = L4.findIndex(l => /§DW-REVEAL-RELEASE disc=ELEC/.test(l));
  t.assert('C4 HELD-UNTIL-COMMIT (release after §DISC-WALK-COMMIT; first sampled front was taken after release)', iC >= 0 && iR > iC && preRelease.every(v => !v),
    'commitIdx=' + iC + ' releaseIdx=' + iR + ' "' + (L4[iR] || '').slice(0, 90) + '" preReleaseFronts=' + JSON.stringify(preRelease.slice(0, 6)));
  t.assert('C3 COMPLETE (every ELEC bucket count = dwSub.length after done)', full.n > 0 && full.ok, JSON.stringify(full));
}, { width: 1200, height: 850, dpr: 1 });
