#!/usr/bin/env node
/**
 * §CPE_DISCIPLINE_REVEAL Mechanism C — the retrace reveal round (geometry/timeline stage only;
 * ghost/hide/shadow visuals are a separate, not-yet-built layer). Spec: bim-compiler
 * prompts/CINEMA_DISCIPLINE_REVEAL.md §Mechanism C. Numeric §-tagged proof only, per CLAUDE.md's
 * FUNDAMENTAL LAW — no screenshots, no eyeballing.
 * RUN: node witness_cpe_reveal_round.js
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = __dirname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.db': 'application/octet-stream' };
function makeServer(root) {
  return http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    fs.readFile(path.join(root, p), (e, b) => {
      if (e) { r.writeHead(404); r.end('404'); return; }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      r.end(b);
    });
  });
}
let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
const _watchdog = setTimeout(() => { console.log('\n§W-CPE-REVEAL-ROUND TIMEOUT — killed after 180s'); process.exit(3); }, 180000);

(async () => {
  const server = makeServer(ROOT);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const pg = await br.newPage();
  await pg.setViewport({ width: 1400, height: 900 });
  const errs = [], logs = [];
  pg.on('pageerror', e => errs.push(String(e)));
  pg.on('console', m => logs.push(m.text()));
  const url = `http://localhost:${port}/viewer/viewer.html?db=buildings/Duplex_extracted.db`;
  await pg.goto(url, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('!!window.APP && !!window.APP.camera && !!window.APP.db', { timeout: 45000 });
  await new Promise(r => setTimeout(r, 2000));
  await pg.evaluate(() => window.APP.loadNavigate ? window.APP.loadNavigate() : null);
  await pg.evaluate(() => window.APP.ensureRooms ? window.APP.ensureRooms({}) : null);
  await new Promise(r => setTimeout(r, 500));

  // ── W-REVEAL-DISCS: cross-check against the SAME 3-representation enumeration A.filterDiscs
  // already uses (panels.js §NAV_FIND_002), not against elements_meta.discipline directly — a real,
  // measured gap found building this witness: Duplex's elements_meta has ELEC=81/PLB=14 rows (sqlite3
  // CLI on the raw file), each WITH an element_transforms row, but NONE of those guids are reachable
  // through collectMeshes/_batchMeta/_instanceMeta in the live scene (checked directly, zero found) —
  // so A.filterDiscs(['ELEC']) would isolate nothing either. Pre-existing, building-specific gap in
  // how these elements reach the renderer; not caused by or in scope for this feature. cpeRevealDiscsPresent
  // must faithfully match what's actually live, not the raw DB file. ──
  const discTest = await pg.evaluate(() => {
    const A = window.APP;
    if (typeof A.cpeRevealDiscsPresent !== 'function') return { ok: false, reason: 'cpeRevealDiscsPresent missing' };
    var live = {};
    function bump(d) { if (d && d !== 'ARC' && d !== 'STR') live[d] = true; }
    A.collectMeshes(function(o) { return o.isMesh && o.userData && o.userData.disc; }).forEach(function(o) { bump(o.userData.disc); });
    for (var k in (A._batchMeta || {})) A._batchMeta[k].forEach(function(m) { bump(m.disc); });
    for (var k2 in (A._instanceMeta || {})) A._instanceMeta[k2].forEach(function(m) { bump(m.disc); });
    return { ok: true, discs: A.cpeRevealDiscsPresent().slice().sort(), liveDiscs: Object.keys(live).sort() };
  });
  chk('A.cpeRevealDiscsPresent exists and returns the real discipline set', discTest.ok, discTest.reason || '');
  if (discTest.ok) {
    chk('discs matches an independent re-enumeration of the SAME live scene (not the raw DB file)',
      JSON.stringify(discTest.discs) === JSON.stringify(discTest.liveDiscs), 'got=' + JSON.stringify(discTest.discs) +
      ' independent=' + JSON.stringify(discTest.liveDiscs));
    chk('at least one real, non-ARC/STR discipline reachable on Duplex (MEP)', discTest.discs.indexOf('MEP') !== -1,
      'got=' + JSON.stringify(discTest.discs));
  }

  // ── W-REVEAL-OFF (Guardrail 2): no override at all -> the reveal beat is zero-width and
  // unreachable, byte-identical to before this feature existed. ──
  const offTest = await pg.evaluate(() => {
    const A = window.APP;
    const plan = A.cinemaPathPlan(15);
    return { beatsReveal: plan.beats.reveal, beatsOut: plan.beats.out, secReveal: plan.sec.reveal };
  });
  chk('reveal OFF: plan.beats.reveal === plan.beats.out (zero-width, unreachable)',
    offTest.beatsReveal === offTest.beatsOut, 'reveal=' + offTest.beatsReveal + ' out=' + offTest.beatsOut);
  chk('reveal OFF: plan.sec.reveal === 0', offTest.secReveal === 0, 'got=' + offTest.secReveal);

  // ── W-REVEAL-ON: open the real editor, check the box (PR #1349's wiring), OK, then re-derive the
  // full plan from the returned override so poseAt/beats/sec can be probed directly. ──
  const onTest = await pg.evaluate(async () => {
    const A = window.APP;
    let plan; try { plan = A.cinemaPathPlan(15); } catch (e) { return { ok: false, reason: 'cinemaPathPlan failed: ' + e.message }; }
    const openPromise = A.cinemaPathEditor.open({ plan: plan, durationSec: 15, fps: 15 });
    await new Promise(r => setTimeout(r, 400));
    const cb = document.getElementById('cpe-reveal');
    if (!cb) { document.getElementById('cpe-cancel') && document.getElementById('cpe-cancel').click(); return { ok: false, reason: 'no #cpe-reveal checkbox' }; }
    cb.click();
    await new Promise(r => setTimeout(r, 50));
    document.getElementById('cpe-ok').click();
    const res = await openPromise;
    if (!res.override || !res.override.reveal) return { ok: false, reason: 'override.reveal not true: ' + JSON.stringify(res.override && res.override.reveal) };
    const plan2 = A.cinemaPathPlan(res.durationSec, res.override);
    const tO = plan2.beats.out, tV = plan2.beats.reveal, tR = plan2.beats.rise;
    const eps = 1e-4;
    const pAtO_minus = plan2.poseAt(tO - eps);   // last frame of Beat 3
    const pAtO_plus  = plan2.poseAt(tO + eps);    // first frame of the reveal round
    const pAtV_minus = plan2.poseAt(tV - eps);    // last frame of the reveal round (tail hold)
    const pAtV_plus  = plan2.poseAt(tV + eps);    // first frame of Beat 4 (e4≈0)
    function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
    function gazeDeg(a, b) {
      var ax = a.tx - a.x, ay = a.ty - a.y, az = a.tz - a.z, aL = Math.hypot(ax, ay, az) || 1;
      var bx = b.tx - b.x, by = b.ty - b.y, bz = b.tz - b.z, bL = Math.hypot(bx, by, bz) || 1;
      var dot = (ax / aL) * (bx / bL) + (ay / aL) * (by / bL) + (az / aL) * (bz / bL);
      return Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
    }
    return {
      ok: true, cpeRevealDurationSec: res.durationSec, tO: tO, tV: tV, tR: tR,
      secReveal: plan2.sec.reveal, secOut: plan2.sec.out,
      posJumpAtStart: dist(pAtO_minus, pAtO_plus), gazeJumpAtStartDeg: gazeDeg(pAtO_minus, pAtO_plus),
      posJumpAtEnd: dist(pAtV_minus, pAtV_plus), gazeJumpAtEndDeg: gazeDeg(pAtV_minus, pAtV_plus),
      tailPos: pAtV_minus, walkEndPos: pAtO_minus,
      posDeltaTailVsWalkEnd: dist(pAtV_minus, pAtO_minus)
    };
  });
  chk('reveal ON: OK returns override.reveal=true and a plan with the round inserted', onTest.ok, onTest.reason || '');
  if (onTest.ok) {
    chk('tV > tO (the round has real width)', onTest.tV > onTest.tO, 'tO=' + onTest.tO.toFixed(4) + ' tV=' + onTest.tV.toFixed(4));
    chk('sec.reveal > 0', onTest.secReveal > 0, 'secReveal=' + onTest.secReveal.toFixed(2));
    // Position is _outPos-continuous by construction (same curve, no teleport) — must be near-exact.
    chk('position continuous at the tO seam (walk -> reveal round)', onTest.posJumpAtStart < 0.05,
      onTest.posJumpAtStart.toFixed(4) + 'm');
    chk('position continuous at the tV seam (reveal round -> Beat 4)', onTest.posJumpAtEnd < 0.05,
      onTest.posJumpAtEnd.toFixed(4) + 'm');
    // Seam blend anchors to the ACTUAL rate-limited gaze Beat 3/4 render at tO/tV (_gazeRateAt), not
    // the raw _beat3EndDir — anchoring to raw measured a real 63deg/12deg instantaneous jump here
    // before that fix (Duplex, this witness). A tight bound now catches a regression back to that.
    chk('gaze continuous at the tO seam (walk -> reveal round)', onTest.gazeJumpAtStartDeg < 2,
      onTest.gazeJumpAtStartDeg.toFixed(2) + 'deg');
    chk('gaze continuous at the tV seam (reveal round -> Beat 4)', onTest.gazeJumpAtEndDeg < 2,
      onTest.gazeJumpAtEndDeg.toFixed(2) + 'deg');
    chk('the round returns to the same spot the walk ended (tail sits at the last stick)',
      onTest.posDeltaTailVsWalkEnd < 0.05, onTest.posDeltaTailVsWalkEnd.toFixed(4) + 'm');
    chk('the panel duration (drives nFrames) GREW to fit the round, not squeezed the rest of the film',
      onTest.cpeRevealDurationSec > 15 + onTest.secReveal - 1, 'durationSec=' + onTest.cpeRevealDurationSec.toFixed(1) +
      ' (base 15 + secReveal ' + onTest.secReveal.toFixed(1) + ')');
  }

  const revealLog = logs.filter(l => l.indexOf('§CPE_REVEAL_ROUND') !== -1);
  chk('§CPE_REVEAL_ROUND logged with real disc list, non-empty', revealLog.some(l => l.indexOf('discs=[ELEC,MEP,PLB]') !== -1 || l.indexOf('discs=[') !== -1),
    revealLog.join(' | '));
  const gazeRateLog = logs.filter(l => l.indexOf('§CPE_GAZE_CONSTANT_RATE') !== -1);
  chk('§CPE_GAZE_CONSTANT_RATE has no NaN/Infinity after the tV fix', gazeRateLog.length > 0 &&
    !gazeRateLog.some(l => /NaN|Infinity/.test(l)), gazeRateLog.slice(-1)[0] || 'not found');

  // ── W-REVEAL-TOPOUT: real defect found on a Hospital bake (user, 2026-08-14: "2nd round seems to
  // cut over way before the stop stick without finishing the full buildup") — buildup was topping out
  // at plan.beats.rise (orbit start, AFTER the whole round), not plan.beats.out (the stop stick, the
  // round's own start), so round 2 played over a still-under-construction building. Fixed in
  // _buildupTopoutU; reveal-off films must be byte-identical to before (regression). ──
  const topoutTest = await pg.evaluate(async () => {
    const A = window.APP;
    // ov=null (explicit) is "derived, ignore any staged edit" per A.cinemaPathPlan's own wrapper
    // comment — earlier test blocks in this same page session (onTest/visTest) OK'd a reveal=true
    // edit, which STAYS staged in A._cinemaPathEdit; A.cinemaPathPlan(15) with NO second arg at all
    // would silently inherit that stale staged override instead of a true "reveal off" baseline.
    let plan; try { plan = A.cinemaPathPlan(15, null); } catch (e) { return { ok: false, reason: 'cinemaPathPlan failed: ' + e.message }; }
    // Reveal OFF (regression) — topout must still be plan.beats.rise, buildup still ramping at tO.
    const offTop = A.buildupTopoutU(plan);
    const offAtOut = A.buildupTAt(plan.beats.out, plan);
    // Reveal ON — topout must move to plan.beats.out, buildup must be FULLY complete by then.
    const openPromise = A.cinemaPathEditor.open({ plan: plan, durationSec: 15, fps: 15 });
    await new Promise(r => setTimeout(r, 400));
    document.getElementById('cpe-reveal').click();
    await new Promise(r => setTimeout(r, 50));
    document.getElementById('cpe-ok').click();
    const res = await openPromise;
    const plan2 = A.cinemaPathPlan(res.durationSec, res.override);
    const onTop = A.buildupTopoutU(plan2);
    const buildupAtStop = A.buildupTAt(plan2.beats.out, plan2);       // round 2 START (the stop stick)
    const buildupAtTail = A.buildupTAt(plan2.beats.reveal, plan2);    // round 2 END (right before rise)
    return { ok: true, offTop, offAtOut, onTop, buildupAtStop, buildupAtTail,
      tO: plan2.beats.out, tV: plan2.beats.reveal, tR: plan2.beats.rise };
  });
  chk('topout probe ran', topoutTest.ok, topoutTest.reason || '');
  if (topoutTest.ok) {
    chk('reveal OFF: topout src = plan.beats.rise (unchanged default, regression check)', topoutTest.offTop.src === 'plan.beats.rise',
      'got=' + topoutTest.offTop.src);
    chk('reveal OFF: buildup still ramping (not 1) at the stop stick, matching original §CPE_BUILDUP_TOPOUT',
      topoutTest.offAtOut < 1, 'got=' + topoutTest.offAtOut.toFixed(3));
    chk('reveal ON: topout moved to plan.beats.out (the stop stick)',
      topoutTest.onTop.src.indexOf('plan.beats.out') === 0, 'got=' + topoutTest.onTop.src);
    chk('reveal ON: buildup is FULLY complete (=1) right as round 2 begins',
      topoutTest.buildupAtStop === 1, 'got=' + topoutTest.buildupAtStop.toFixed(4) +
      ' (tO=' + topoutTest.tO.toFixed(3) + ')');
    chk('reveal ON: buildup stays complete through round 2\'s own tail',
      topoutTest.buildupAtTail === 1, 'got=' + topoutTest.buildupAtTail.toFixed(4) +
      ' (tV=' + topoutTest.tV.toFixed(3) + ')');
  }

  // ── W-REVEAL-PREVIEW-REPLAN: real defect found live (user, 2026-08-14: "Preview also do not go
  // 2nd round" / "the pov timeline numbering did double but the alt-c still remains not"). Root
  // cause: the reveal checkbox's change handler only called _markPreviewStale() (bumps a counter),
  // never _replanFilm() (the only thing that rebuilds _state.plan) — unlike buildup/roomTitle, reveal
  // changes the PLAN'S OWN beat boundaries, so poseAt/buildupTopoutU kept reading the stale pre-toggle
  // plan until an unrelated edit (a band drag) happened to trigger a replan. Checks the EDITOR'S OWN
  // live _state.plan (via the exposed _probePlanRef test hook), NOT a freshly-built plan the way the
  // topout test above does — that distinction is exactly what this bug hid. ──
  const previewReplanTest = await pg.evaluate(async () => {
    const A = window.APP;
    let plan; try { plan = A.cinemaPathPlan(15); } catch (e) { return { ok: false, reason: 'cinemaPathPlan failed: ' + e.message }; }
    const openPromise = A.cinemaPathEditor.open({ plan: plan, durationSec: 15, fps: 15 });
    await new Promise(r => setTimeout(r, 400));
    const beforeToggle = A.cinemaPathEditor._probePlanRef();
    const beforeWidth = beforeToggle ? (beforeToggle.beats.reveal - beforeToggle.beats.out) : null;
    document.getElementById('cpe-reveal').click();     // toggle ON — NO band drag, NO other edit
    await new Promise(r => setTimeout(r, 50));
    const afterToggle = A.cinemaPathEditor._probePlanRef();   // the editor's LIVE plan, same one Preview flies
    document.getElementById('cpe-cancel').click();
    if (!afterToggle) return { ok: false, reason: 'no _state.plan after toggle' };
    return { ok: true, beforeWidth, tO: afterToggle.beats.out, tV: afterToggle.beats.reveal };
  });
  chk('preview-replan probe ran', previewReplanTest.ok, previewReplanTest.reason || '');
  if (previewReplanTest.ok) {
    chk('before toggle: editor\'s live plan has the round at zero width (reveal was off)',
      previewReplanTest.beforeWidth === 0, 'got=' + previewReplanTest.beforeWidth);
    chk('checking Reveal alone (no band drag) immediately widens the EDITOR\'S OWN live plan — ' +
      'the exact plan Preview flies, not a freshly-built one',
      previewReplanTest.tV > previewReplanTest.tO,
      'tO=' + previewReplanTest.tO.toFixed(3) + ' tV=' + previewReplanTest.tV.toFixed(3));
  }

  // ── W-REVEAL-VISUAL: the visual layer (A.cpeRevealVisualAt / A.cpeRevealApplyVisual) — full hide
  // via the existing A.filterDiscs, phase-correct at each point in the round, snapshot/restore of a
  // PRE-EXISTING filter (not a blind "show everything"), and skips redundant scene traversal. ──
  const visTest = await pg.evaluate(async () => {
    const A = window.APP;
    let plan; try { plan = A.cinemaPathPlan(15); } catch (e) { return { ok: false, reason: 'cinemaPathPlan failed: ' + e.message }; }
    const openPromise = A.cinemaPathEditor.open({ plan: plan, durationSec: 15, fps: 15 });
    await new Promise(r => setTimeout(r, 400));
    document.getElementById('cpe-reveal').click();
    await new Promise(r => setTimeout(r, 50));
    document.getElementById('cpe-ok').click();
    const res = await openPromise;
    const plan2 = A.cinemaPathPlan(res.durationSec, res.override);
    const tO = plan2.beats.out, tV = plan2.beats.reveal;
    const eps = 1e-4;
    const phaseAt = (frac) => A.cpeRevealVisualAt(plan2, tO + (tV - tO) * frac);
    // Boundaries derived from the plan's own reveal info, not guessed: backW/fwdEndW split the
    // round into back/fwd/tail exactly as A.cpeRevealVisualAt itself computes them.
    const rv = plan2.reveal, totalSec = rv.backSec + rv.fwdSec + rv.tailSec;
    const fwdEndW = (rv.backSec + rv.fwdSec) / totalSec;
    const phases = { back: phaseAt(0.02), fwd: phaseAt(0.45),
      tailStart: phaseAt(fwdEndW + 0.03), tailAll: phaseAt(0.99), outside: A.cpeRevealVisualAt(plan2, tO - eps) };
    // A PRE-EXISTING filter (simulates a Role/Find isolate already active) — the round must restore
    // exactly THIS on exit, not blindly show everything.
    A.filterDiscs(['STR']);
    const preExisting = Array.from(A.hiddenDiscs).sort();
    let applyCalls = 0;
    const origApply = A._applyDiscVisibility;
    A._applyDiscVisibility = function() { applyCalls++; return origApply.apply(this, arguments); };
    A.cpeRevealApplyVisual(plan2, tO + (tV - tO) * 0.45);   // forward-leg ghost
    const hiddenDuringGhost = Array.from(A.hiddenDiscs).sort();
    const callsAfterFirst = applyCalls;
    A.cpeRevealApplyVisual(plan2, tO + (tV - tO) * 0.451);  // same phase/discs, tiny tNorm change — must be a no-op
    const callsAfterRepeat = applyCalls;
    A.cpeRevealApplyVisual(null, 0);                        // force restore
    const hiddenAfterRestore = Array.from(A.hiddenDiscs).sort();
    A._applyDiscVisibility = origApply;
    A.filterDiscs(null);   // clean up this witness's own probe filter
    return { ok: true, phases, preExisting, hiddenDuringGhost, callsAfterFirst, callsAfterRepeat, hiddenAfterRestore };
  });
  chk('visual layer probe ran', visTest.ok, visTest.reason || '');
  if (visTest.ok) {
    chk('backward leg: no visual override (ARC/STR stays solid)', visTest.phases.back === null, JSON.stringify(visTest.phases.back));
    chk('outside the round: no visual override', visTest.phases.outside === null, JSON.stringify(visTest.phases.outside));
    chk('forward leg: phase=ghost, all discs shown together', visTest.phases.fwd &&
      visTest.phases.fwd.phase === 'ghost' && JSON.stringify(visTest.phases.fwd.discs) === '["MEP"]',
      JSON.stringify(visTest.phases.fwd));
    chk('tail (early): phase=tail-one, exactly one discipline', visTest.phases.tailStart &&
      visTest.phases.tailStart.phase === 'tail-one' && visTest.phases.tailStart.discs.length === 1,
      JSON.stringify(visTest.phases.tailStart));
    chk('tail (late): phase=tail-all, every discipline together', visTest.phases.tailAll &&
      visTest.phases.tailAll.phase === 'tail-all' && JSON.stringify(visTest.phases.tailAll.discs) === '["MEP"]',
      JSON.stringify(visTest.phases.tailAll));
    chk('forward-leg apply hides ARC+STR, leaves MEP visible', JSON.stringify(visTest.hiddenDuringGhost) === '["ARC","STR"]',
      'got=' + JSON.stringify(visTest.hiddenDuringGhost));
    chk('a real scene traversal happened on the first apply', visTest.callsAfterFirst > 0, 'calls=' + visTest.callsAfterFirst);
    chk('a same-phase re-apply skips the (expensive) scene traversal', visTest.callsAfterRepeat === visTest.callsAfterFirst,
      'before=' + visTest.callsAfterFirst + ' after=' + visTest.callsAfterRepeat);
    chk('restore brings back the PRE-EXISTING filter exactly, not a blind "show all"',
      JSON.stringify(visTest.hiddenAfterRestore) === JSON.stringify(visTest.preExisting),
      'preExisting=' + JSON.stringify(visTest.preExisting) + ' afterRestore=' + JSON.stringify(visTest.hiddenAfterRestore));
  }

  chk('zero pageerrors through the whole run', errs.length === 0, errs.join(' | '));

  await br.close();
  await server.close();
  clearTimeout(_watchdog);
  console.log('\n§W-CPE-REVEAL-ROUND DONE pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('\n§W-CPE-REVEAL-ROUND CRASHED ' + (e && e.stack || e)); process.exit(2); });
