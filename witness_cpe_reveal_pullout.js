#!/usr/bin/env node
/**
 * §CPE_DISCIPLINE_REVEAL_PULLOUT — the pull-out + repeated-forward-lap restructure (2026-08-14).
 * Spec: bim-compiler prompts/CINEMA_DISCIPLINE_REVEAL.md, dated "pull-out restructure" section.
 * Supersedes the there-and-back Mechanism C shape (witness_cpe_reveal_round.js, removed — it tested
 * boundaries/fields (backSec/fwdSec, a retrace leg) that no longer exist). Numeric §-tagged proof
 * only, per CLAUDE.md's FUNDAMENTAL LAW — no screenshots, no eyeballing.
 * RUN: node witness_cpe_reveal_pullout.js
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
// §W-CPE-REVEAL-PULLOUT — building choice: buildings/Duplex_extracted.db (the ORIGINAL Mechanism C
// witness's fixture) is gitignored by design (viewer/OCI-distributed, not git-tracked — see
// .gitattributes/.gitignore's own "buildings/*.db... fetches from OCI" note) and was not present in
// this fresh worktree (per this project's own worktree-hygiene rule: never reuse the shared
// checkout). buildings/HHS_Office_Federated_extracted.db IS git-tracked (explicit .gitignore
// allowlist) and has real, populated MEP/ELEC/FP/ACMV disciplines (per this same spec file's own
// 2026-08-14 colour investigation) — used here instead. Mid-size (~7k elements per that
// investigation), needs more headroom than Duplex but nowhere near Hospital's 600s budget
// (witness_cpe_walk_hallway.js's own precedent for this exact building).
const _watchdog = setTimeout(() => { console.log('\n§W-CPE-REVEAL-PULLOUT TIMEOUT — killed after 300s'); process.exit(3); }, 300000);

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
  const url = `http://localhost:${port}/viewer/viewer.html?db=buildings/HHS_Office_Federated_extracted.db`;
  await pg.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pg.waitForFunction('!!window.APP && !!window.APP.camera && !!window.APP.db', { timeout: 120000 });
  await new Promise(r => setTimeout(r, 4000));
  await pg.waitForFunction(() => {
    try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
    catch (e) { return false; }
  }, { timeout: 90000, polling: 2000 });
  await pg.evaluate(() => window.APP.loadNavigate ? window.APP.loadNavigate() : null);
  await pg.evaluate(() => window.APP.ensureRooms ? window.APP.ensureRooms({}) : null);
  await new Promise(r => setTimeout(r, 1500));

  // ── W-PULLOUT-OFF (Guardrail 2): no override at all -> pullout/round2 beats are zero-width and
  // unreachable, byte-identical to before this feature existed. ──
  const offTest = await pg.evaluate(() => {
    const A = window.APP;
    const plan = A.cinemaPathPlan(15, null);
    return { tO: plan.beats.out, tP: plan.beats.pullout, tV: plan.beats.reveal, tR: plan.beats.rise,
      secPullout: plan.sec.pullout, secReveal: plan.sec.reveal,
      topout: A.buildupTopoutU(plan) };
  });
  chk('reveal OFF: beats.pullout === beats.out (zero-width, unreachable)',
    offTest.tP === offTest.tO, 'pullout=' + offTest.tP + ' out=' + offTest.tO);
  chk('reveal OFF: beats.reveal === beats.out (zero-width, unreachable)',
    offTest.tV === offTest.tO, 'reveal=' + offTest.tV + ' out=' + offTest.tO);
  chk('reveal OFF: sec.pullout === 0', offTest.secPullout === 0, 'got=' + offTest.secPullout);
  chk('reveal OFF: sec.reveal === 0', offTest.secReveal === 0, 'got=' + offTest.secReveal);
  chk('reveal OFF: topout src unchanged (plan.beats.rise, regression check)',
    offTest.topout.src === 'plan.beats.rise', 'got=' + offTest.topout.src);

  // ── W-PULLOUT-ON: open the real editor, check the box, OK, then re-derive the full plan from the
  // returned override so poseAt/beats/sec/reveal can be probed directly. ──
  const onTest = await pg.evaluate(async () => {
    const A = window.APP;
    let plan; try { plan = A.cinemaPathPlan(15); } catch (e) { return { ok: false, reason: 'cinemaPathPlan failed: ' + e.message }; }
    const openPromise = A.cinemaPathEditor.open({ plan: plan, durationSec: 15, fps: 15 });
    await new Promise(r => setTimeout(r, 1500));
    const cb = document.getElementById('cpe-reveal');
    if (!cb) { document.getElementById('cpe-cancel') && document.getElementById('cpe-cancel').click(); return { ok: false, reason: 'no #cpe-reveal checkbox' }; }
    cb.click();
    await new Promise(r => setTimeout(r, 50));
    document.getElementById('cpe-ok').click();
    const res = await openPromise;
    if (!res.override || !res.override.reveal) return { ok: false, reason: 'override.reveal not true: ' + JSON.stringify(res.override && res.override.reveal) };
    const plan2 = A.cinemaPathPlan(res.durationSec, res.override);
    const tO = plan2.beats.out, tP = plan2.beats.pullout, tF = plan2.beats.flyback,
          tV = plan2.beats.reveal, tR = plan2.beats.rise;
    const eps = 1e-4;
    function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
    function gazeDir(a) {
      var ax = a.tx - a.x, ay = a.ty - a.y, az = a.tz - a.z, aL = Math.hypot(ax, ay, az) || 1;
      return { x: ax / aL, y: ay / aL, z: az / aL };
    }
    function gazeDeg(a, b) {
      var ga = gazeDir(a), gb = gazeDir(b);
      var dot = ga.x * gb.x + ga.y * gb.y + ga.z * gb.z;
      return Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
    }
    const pAtO_minus = plan2.poseAt(tO - eps);   // last frame of Beat 3 (round 1's own end)
    const pAtO       = plan2.poseAt(tO);          // pull-out's own w=0 (boundary is inclusive to the EARLIER beat per <=, so this is Beat3's e3=1 too)
    const pAtP       = plan2.poseAt(tP);          // pull-out's own w=1 (boundary <= leans to pullout, not flyback)
    const pAtP_mid    = plan2.poseAt(tO + (tP - tO) * 0.5);
    // §CPE_DISCIPLINE_REVEAL_FLYBACK: the fly-back sub-beat (tP..tF) now bridges the pull-out's end
    // back onto the first stick — the old teleport cut used to sit right at tP. Both new seams
    // (tP->flyback-start, flyback-end->tV) must be continuous in position AND gaze.
    const pAtF_start = plan2.poseAt(tP + eps);    // fly-back's own first frame
    const pAtF       = plan2.poseAt(tF);          // fly-back's own w=1 (boundary <= leans to flyback, not round2)
    const pAtV_start = plan2.poseAt(tF + eps);    // round 2's own first frame (should now be ON the first stick)
    const pAtV_minus = plan2.poseAt(tV - eps);    // round 2's own last frame
    const pAtV_plus  = plan2.poseAt(tV + eps);    // first frame of Beat 4 (e4≈0, folded rise+tail)
    return {
      ok: true, cpeRevealDurationSec: res.durationSec, tO, tP, tF, tV, tR,
      secPullout: plan2.sec.pullout, secFlyback: plan2.sec.flyback, secReveal: plan2.sec.reveal,
      revealPulloutSec: plan2.reveal.pulloutSec, revealRoundSec: plan2.reveal.roundSec,
      revealTailSec: plan2.reveal.tailSec, revealRiseSec: plan2.reveal.riseSec,
      discs: plan2.reveal.discs, pathLen: plan2.pathLen,
      // pull-out geometry: displacement from the last stick, and gaze constancy through the beat.
      // Uses pAtO (the EXACT tO boundary, poseAt's <= convention) rather than pAtO_minus, so this
      // is an exact arithmetic check (9.75m to float precision), not one padded for sampling error.
      pulloutDisplacement: dist(pAtP, pAtO),
      gazeConstThroughPullout: Math.max(gazeDeg(pAtO, pAtP_mid), gazeDeg(pAtO, pAtP)),
      // the tP -> flyback-start seam must be continuous (position AND gaze) — the fly-back picks up
      // exactly where the pull-out left off, no cut any more.
      posJumpAtFlybackStart: dist(pAtP, pAtF_start), gazeJumpAtFlybackStartDeg: gazeDeg(pAtP, pAtF_start),
      // the flyback-end -> tV (round 2 start) seam must ALSO be continuous now — this is the exact
      // seam that used to be the "clean CUT" this session's fix removes.
      posJumpAtRound2Start: dist(pAtF, pAtV_start), gazeJumpAtRound2StartDeg: gazeDeg(pAtF, pAtV_start),
      // the fly-back must actually land ON the first stick (round 1's own start, _outPos(0)) by tF —
      // otherwise round 2 would silently start somewhere else.
      posDeltaFlybackEndVsRound2Pose: dist(pAtF, pAtV_start),
      // round 2 ends at the SAME spot round 1 did (same _outPos(1))
      posDeltaRound2EndVsRound1End: dist(pAtV_minus, pAtO_minus),
      // the tV -> tR seam (round 2 -> the folded rise/tail beat) must still be continuous —
      // UNCHANGED code path from before this restructure (§CPE_GAZE_CONSTANT_RATE)
      posJumpAtRiseSeam: dist(pAtV_minus, pAtV_plus), gazeJumpAtRiseSeamDeg: gazeDeg(pAtV_minus, pAtV_plus),
      // the tO -> tP seam (walk -> pull-out) must also stay continuous (position AND gaze) — the
      // pull-out is a smooth dolly-back from where round 1 arrived, not a cut
      posJumpAtPulloutStart: dist(pAtO_minus, pAtO), gazeJumpAtPulloutStartDeg: gazeDeg(pAtO_minus, pAtO)
    };
  });
  chk('reveal ON: OK returns override.reveal=true and a plan with pullout+flyback+round2 inserted', onTest.ok, onTest.reason || '');
  if (onTest.ok) {
    chk('tO < tP < tF < tV < tR (all five beats have real width)',
      onTest.tO < onTest.tP && onTest.tP < onTest.tF && onTest.tF < onTest.tV && onTest.tV < onTest.tR,
      'tO=' + onTest.tO.toFixed(4) + ' tP=' + onTest.tP.toFixed(4) + ' tF=' + onTest.tF.toFixed(4) +
      ' tV=' + onTest.tV.toFixed(4) + ' tR=' + onTest.tR.toFixed(4));
    chk('sec.pullout === reveal.pulloutSec === 1.5 (CINEMA_REVEAL_PULLOUT_SEC)',
      onTest.secPullout === 1.5 && onTest.revealPulloutSec === 1.5,
      'sec.pullout=' + onTest.secPullout + ' reveal.pulloutSec=' + onTest.revealPulloutSec);
    chk('sec.reveal === reveal.roundSec (round 2 is never overridable)',
      onTest.secReveal === onTest.revealRoundSec, 'sec.reveal=' + onTest.secReveal + ' roundSec=' + onTest.revealRoundSec);
    chk('reveal.roundSec > 0 (one real lap costed)', onTest.revealRoundSec > 0, 'got=' + onTest.revealRoundSec.toFixed(2));
    chk('reveal.tailSec === 2*discs.length + 2 (per-discipline + kept all-together slot)',
      onTest.revealTailSec === 2 * onTest.discs.length + 2,
      'tailSec=' + onTest.revealTailSec + ' discs=' + JSON.stringify(onTest.discs));
    // §CPE_DISCIPLINE_REVEAL_FLYBACK: sec.flyback === pathLen / CINEMA_PULLBACK_MPS(6.5), a real,
    // precise, derived duration (never a new speed invented).
    chk('sec.flyback === pathLen / CINEMA_PULLBACK_MPS (6.5) — derived, not invented',
      Math.abs(onTest.secFlyback - onTest.pathLen / 6.5) < 0.01,
      'secFlyback=' + onTest.secFlyback.toFixed(3) + ' pathLen/6.5=' + (onTest.pathLen / 6.5).toFixed(3));
    // Pull-out: continuous hand-off from round 1's arrival (position AND gaze), then a real,
    // precise displacement — CINEMA_REVEAL_PULLOUT_SEC(1.5) * CINEMA_PULLBACK_MPS(6.5) = 9.75m —
    // and gaze held CONSTANT throughout (author's own call, see spec file).
    chk('position continuous at the tO seam (walk -> pull-out start)', onTest.posJumpAtPulloutStart < 0.05,
      onTest.posJumpAtPulloutStart.toFixed(4) + 'm');
    chk('gaze continuous at the tO seam (walk -> pull-out start)', onTest.gazeJumpAtPulloutStartDeg < 2,
      onTest.gazeJumpAtPulloutStartDeg.toFixed(2) + 'deg');
    chk('pull-out displacement === CINEMA_REVEAL_PULLOUT_SEC * CINEMA_PULLBACK_MPS (1.5*6.5=9.75m)',
      Math.abs(onTest.pulloutDisplacement - 9.75) < 0.05, 'got=' + onTest.pulloutDisplacement.toFixed(4) + 'm');
    chk('gaze held constant through the pull-out (no blend — author\'s own call)',
      onTest.gazeConstThroughPullout < 0.5, onTest.gazeConstThroughPullout.toFixed(3) + 'deg');
    // §CPE_DISCIPLINE_REVEAL_FLYBACK (2026-08-16): the old "clean CUT" at this seam is GONE — this is
    // the exact regression proof that the user's "abrupt, not smooth" report is now fixed. Both new
    // seams (pull-out -> fly-back, fly-back -> round 2) must be continuous in position AND gaze,
    // the OPPOSITE of what the superseded test above used to assert here.
    chk('position continuous at the tP seam (pull-out -> fly-back start) — the old cut is gone',
      onTest.posJumpAtFlybackStart < 0.05, onTest.posJumpAtFlybackStart.toFixed(4) + 'm');
    chk('gaze continuous at the tP seam (pull-out -> fly-back start)',
      onTest.gazeJumpAtFlybackStartDeg < 2, onTest.gazeJumpAtFlybackStartDeg.toFixed(2) + 'deg');
    chk('position continuous at the tF seam (fly-back end -> round 2 start) — this IS the seam ' +
      'that used to be an abrupt teleport; now it must be smooth',
      onTest.posJumpAtRound2Start < 0.05, onTest.posJumpAtRound2Start.toFixed(4) + 'm');
    chk('gaze continuous at the tF seam (fly-back end -> round 2 start)',
      onTest.gazeJumpAtRound2StartDeg < 2, onTest.gazeJumpAtRound2StartDeg.toFixed(2) + 'deg');
    chk('the fly-back actually lands ON the first stick (round 2\'s own start pose) by tF',
      onTest.posDeltaFlybackEndVsRound2Pose < 0.05, onTest.posDeltaFlybackEndVsRound2Pose.toFixed(4) + 'm');
    chk('round 2 ends at the SAME spot round 1 did (both are _outPos(1))',
      onTest.posDeltaRound2EndVsRound1End < 0.05, onTest.posDeltaRound2EndVsRound1End.toFixed(4) + 'm');
    // tV -> tR seam: UNCHANGED code path from before the restructure — must still be exactly as
    // continuous as the original build measured (regression check).
    chk('position continuous at the tV seam (round 2 -> folded rise/tail beat)', onTest.posJumpAtRiseSeam < 0.05,
      onTest.posJumpAtRiseSeam.toFixed(4) + 'm');
    chk('gaze continuous at the tV seam (round 2 -> folded rise/tail beat)', onTest.gazeJumpAtRiseSeamDeg < 2,
      onTest.gazeJumpAtRiseSeamDeg.toFixed(2) + 'deg');
    chk('the panel duration (drives nFrames) GREW to fit pullout+round2+tail, not squeezed the rest',
      onTest.cpeRevealDurationSec > 15 + onTest.secPullout + onTest.secReveal - 1,
      'durationSec=' + onTest.cpeRevealDurationSec.toFixed(1));
  }

  const revealLog = logs.filter(l => l.indexOf('§CPE_REVEAL_ROUND') !== -1);
  chk('§CPE_REVEAL_ROUND logged with pulloutSec/round2Sec/tailSec and a real disc list',
    revealLog.some(l => l.indexOf('pulloutSec=') !== -1 && l.indexOf('round2Sec=') !== -1 && l.indexOf('discs=[') !== -1),
    revealLog.join(' | '));
  const beatsLog = logs.filter(l => l.indexOf('§CINEMA_BEATS') !== -1);
  chk('§CINEMA_BEATS logs pullout=/flyback=/round2= (flyback is the new boundary this session added)',
    beatsLog.some(l => l.indexOf('pullout=') !== -1 && l.indexOf('flyback=') !== -1 && l.indexOf('round2=') !== -1),
    beatsLog.slice(-1)[0] || 'not found');

  // ── W-PULLOUT-TOPOUT: buildup's 100%-complete moment must land at tP (end of pull-out), not tO
  // (instant of arrival — the "way before" bug this restructure fixes) and not tR (the "way after"
  // pre-#1353 bug this must not reintroduce). ──
  const topoutTest = await pg.evaluate(async () => {
    const A = window.APP;
    let plan; try { plan = A.cinemaPathPlan(15, null); } catch (e) { return { ok: false, reason: 'cinemaPathPlan failed: ' + e.message }; }
    const openPromise = A.cinemaPathEditor.open({ plan: plan, durationSec: 15, fps: 15 });
    await new Promise(r => setTimeout(r, 1500));
    document.getElementById('cpe-reveal').click();
    await new Promise(r => setTimeout(r, 50));
    document.getElementById('cpe-ok').click();
    const res = await openPromise;
    const plan2 = A.cinemaPathPlan(res.durationSec, res.override);
    const onTop = A.buildupTopoutU(plan2);
    return {
      ok: true, src: onTop.src, u: onTop.u,
      atArrival: A.buildupTAt(plan2.beats.out, plan2),        // tO — must NOT be complete yet ("way before" bug)
      atPulloutEnd: A.buildupTAt(plan2.beats.pullout, plan2), // tP — must be exactly complete
      atRound2End: A.buildupTAt(plan2.beats.reveal, plan2),   // tV — must stay complete
      tO: plan2.beats.out, tP: plan2.beats.pullout
    };
  });
  chk('topout probe ran', topoutTest.ok, topoutTest.reason || '');
  if (topoutTest.ok) {
    chk('reveal ON: topout src = plan.beats.pullout', topoutTest.src.indexOf('plan.beats.pullout') === 0,
      'got=' + topoutTest.src);
    chk('reveal ON: topout u === beats.pullout', topoutTest.u === topoutTest.tP,
      'u=' + topoutTest.u + ' pullout=' + topoutTest.tP);
    chk('reveal ON: buildup NOT yet complete at the instant of arrival (tO) — the "way before" bug is fixed',
      topoutTest.atArrival < 1, 'got=' + topoutTest.atArrival.toFixed(4));
    chk('reveal ON: buildup IS fully complete by the end of the pull-out (tP)',
      topoutTest.atPulloutEnd === 1, 'got=' + topoutTest.atPulloutEnd.toFixed(4));
    chk('reveal ON: buildup stays complete through round 2 (no "way after" regression)',
      topoutTest.atRound2End === 1, 'got=' + topoutTest.atRound2End.toFixed(4));
  }

  // ── W-PULLOUT-NO-DOUBLE-FOLD: real bug found and fixed while building this restructure (never
  // shipped) — `plan.sec.rise` feeds cinema_path_editor.js's `s.baseSec.rise`, which `_buildOverride()`
  // echoes straight back as the NEXT plan's `riseSec` override on every replan (drag a band, toggle a
  // checkbox, etc., all while Reveal stays checked within one editing session). If the tail were
  // folded into `sec.rise` itself (the first cut of this fix), each such round-trip would fold the
  // tail in AGAIN, growing the rise beat without bound. Proof: sec.rise must be IDENTICAL whether
  // reveal is off or on (the fold must be invisible to the override channel), AND must stay identical
  // across repeated round-trips through A.cinemaPathPlan with the SAME override object. ──
  const noDoubleFoldTest = await pg.evaluate(async () => {
    const A = window.APP;
    let planOff; try { planOff = A.cinemaPathPlan(15, null); } catch (e) { return { ok: false, reason: 'off plan failed: ' + e.message }; }
    let plan; try { plan = A.cinemaPathPlan(15); } catch (e) { return { ok: false, reason: 'cinemaPathPlan failed: ' + e.message }; }
    const openPromise = A.cinemaPathEditor.open({ plan: plan, durationSec: 15, fps: 15 });
    await new Promise(r => setTimeout(r, 1500));
    document.getElementById('cpe-reveal').click();
    await new Promise(r => setTimeout(r, 50));
    document.getElementById('cpe-ok').click();
    const res = await openPromise;
    const planOn1 = A.cinemaPathPlan(res.durationSec, res.override);
    // Simulate N replans within one editing session, all with reveal still ON (the SAME override
    // object re-submitted, exactly what a band-drag/checkbox-toggle replan does downstream) —
    // sec.rise must never drift across them.
    const planOn2 = A.cinemaPathPlan(res.durationSec, res.override);
    const planOn3 = A.cinemaPathPlan(res.durationSec, res.override);
    return {
      ok: true, secRiseOff: planOff.sec.rise,
      secRiseOn: [planOn1.sec.rise, planOn2.sec.rise, planOn3.sec.rise],
      riseBeatWidth: [planOn1.beats.rise - planOn1.beats.reveal, planOn2.beats.rise - planOn2.beats.reveal,
                       planOn3.beats.rise - planOn3.beats.reveal]
    };
  });
  chk('no-double-fold probe ran', noDoubleFoldTest.ok, noDoubleFoldTest.reason || '');
  if (noDoubleFoldTest.ok) {
    chk('sec.rise is IDENTICAL whether reveal is off or on (the tail-fold never leaks into the ' +
      'round-trippable override value)', noDoubleFoldTest.secRiseOff === noDoubleFoldTest.secRiseOn[0],
      'off=' + noDoubleFoldTest.secRiseOff.toFixed(6) + ' on=' + noDoubleFoldTest.secRiseOn[0].toFixed(6));
    chk('sec.rise stays IDENTICAL across 3 repeated round-trips through the SAME override (no ' +
      'accumulation across replans)',
      noDoubleFoldTest.secRiseOn[0] === noDoubleFoldTest.secRiseOn[1] && noDoubleFoldTest.secRiseOn[1] === noDoubleFoldTest.secRiseOn[2],
      'run1=' + noDoubleFoldTest.secRiseOn[0].toFixed(6) + ' run2=' + noDoubleFoldTest.secRiseOn[1].toFixed(6) +
      ' run3=' + noDoubleFoldTest.secRiseOn[2].toFixed(6));
    chk('the folded [reveal,rise] beat WIDTH also stays IDENTICAL across repeated round-trips',
      Math.abs(noDoubleFoldTest.riseBeatWidth[0] - noDoubleFoldTest.riseBeatWidth[2]) < 1e-9,
      'run1=' + noDoubleFoldTest.riseBeatWidth[0].toFixed(6) + ' run3=' + noDoubleFoldTest.riseBeatWidth[2].toFixed(6));
  }

  // ── W-PULLOUT-VISUAL: the four visual zones — pull-out (null), round 2 (ghost, all discs), the
  // tail folded into [tV,tR] (tail-one cycling then tail-all), and rise-proper (null again). ──
  const visTest = await pg.evaluate(async () => {
    const A = window.APP;
    let plan; try { plan = A.cinemaPathPlan(15); } catch (e) { return { ok: false, reason: 'cinemaPathPlan failed: ' + e.message }; }
    const openPromise = A.cinemaPathEditor.open({ plan: plan, durationSec: 15, fps: 15 });
    await new Promise(r => setTimeout(r, 1500));
    document.getElementById('cpe-reveal').click();
    await new Promise(r => setTimeout(r, 50));
    document.getElementById('cpe-ok').click();
    const res = await openPromise;
    const plan2 = A.cinemaPathPlan(res.durationSec, res.override);
    const tO = plan2.beats.out, tP = plan2.beats.pullout, tF = plan2.beats.flyback,
          tV = plan2.beats.reveal, tR = plan2.beats.rise;
    const rv = plan2.reveal;
    const riseSpanSec = rv.riseSec + rv.tailSec, tailFrac = rv.tailSec / riseSpanSec;
    const at = (tn) => A.cpeRevealVisualAt(plan2, tn);
    const capAt = (tn) => A.cpeRevealCaptionAt(plan2, tn);
    const pulloutMid = tO + (tP - tO) * 0.5;
    const flybackMid = tP + (tF - tP) * 0.5;
    const round2Mid = tF + (tV - tF) * 0.5;
    const tailEarly = tV + (tR - tV) * (tailFrac * 0.05);
    const tailLate = tV + (tR - tV) * (tailFrac * 0.99);     // near the end of tailSec -> tail-all
    const riseProper = tV + (tR - tV) * Math.min(0.999, tailFrac * 1.2);
    // §CPE_DISCIPLINE_REVEAL_FADE: sample right AFTER the first tail-one->tail-one slot boundary
    // (idx 0 -> idx 1, 2s into the tail, requires >=2 discs) and again well past its own
    // CPE_REVEAL_FADE_SEC (0.4s) window, to prove the overlap widens then narrows.
    const perDiscSec = 2;
    const slot1StartFrac = perDiscSec / riseSpanSec;
    const fadeEarly = tV + (tR - tV) * (slot1StartFrac + 0.1 / riseSpanSec);   // ~0.1s into slot 1
    const fadeLate  = tV + (tR - tV) * (slot1StartFrac + 0.9 / riseSpanSec);   // ~0.9s into slot 1 (past 0.4s)
    return {
      ok: true,
      pullout: at(pulloutMid), flyback: at(flybackMid), round2: at(round2Mid),
      tailEarly: at(tailEarly), tailLate: at(tailLate),
      riseProper: at(riseProper), outside: at(tO - 1e-4),
      capPullout: capAt(pulloutMid), capRound2: capAt(round2Mid),
      capTailEarly: capAt(tailEarly), capTailLate: capAt(tailLate), capRiseProper: capAt(riseProper),
      discLabelELEC: A.cpeRevealDiscLabel ? A.cpeRevealDiscLabel('ELEC') : null,
      discLabelUnknown: A.cpeRevealDiscLabel ? A.cpeRevealDiscLabel('ZZZ') : null,
      qtyCostShape: A.cpeRevealDiscQtyCost ? A.cpeRevealDiscQtyCost(rv.discs) : null,
      discs: rv.discs, fadeEarly: at(fadeEarly), fadeLate: at(fadeLate)
    };
  });
  chk('visual/caption probe ran', visTest.ok, visTest.reason || '');
  if (visTest.ok) {
    chk('outside the round: no visual override', visTest.outside === null, JSON.stringify(visTest.outside));
    chk('pull-out: no visual override (ARC/STR stays solid — author\'s own call)', visTest.pullout === null, JSON.stringify(visTest.pullout));
    chk('fly-back: phase=ghost (same zone as round 2 — the discs stay revealed WHILE the camera ' +
      'retraces back to the first stick, not a hard cut in visibility either)',
      visTest.flyback && visTest.flyback.phase === 'ghost', JSON.stringify(visTest.flyback));
    chk('round 2: phase=ghost, all non-ARC/STR discs shown together (unchanged from before)',
      visTest.round2 && visTest.round2.phase === 'ghost', JSON.stringify(visTest.round2));
    chk('tail (early, folded into rise): phase=tail-one, exactly one discipline',
      visTest.tailEarly && visTest.tailEarly.phase === 'tail-one' && visTest.tailEarly.discs.length === 1,
      JSON.stringify(visTest.tailEarly));
    if (visTest.discs.length > 1) {
      chk('§CPE_DISCIPLINE_REVEAL_FADE: shortly after a tail-one slot boundary, visDiscs widens to ' +
        'BOTH the outgoing and incoming discipline (the overlap window, not an instant swap)',
        visTest.fadeEarly && visTest.fadeEarly.phase === 'tail-one' && visTest.fadeEarly.visDiscs &&
        visTest.fadeEarly.visDiscs.length === 2, JSON.stringify(visTest.fadeEarly));
      chk('§CPE_DISCIPLINE_REVEAL_FADE: well past the overlap window, visDiscs narrows back to just ' +
        'the incoming discipline',
        visTest.fadeLate && visTest.fadeLate.phase === 'tail-one' && visTest.fadeLate.visDiscs &&
        visTest.fadeLate.visDiscs.length === 1, JSON.stringify(visTest.fadeLate));
      chk('the caption identity (discs[0]) during the overlap is the INCOMING discipline, never the outgoing one',
        visTest.fadeEarly && visTest.fadeEarly.discs[0] === visTest.fadeEarly.visDiscs[1],
        JSON.stringify(visTest.fadeEarly));
    } else {
      console.log('  (skipped §CPE_DISCIPLINE_REVEAL_FADE overlap checks — fixture building has < 2 disciplines)');
    }
    chk('tail (late, folded into rise): phase=tail-all — KEPT (user asked for it elsewhere in this file)',
      visTest.tailLate && visTest.tailLate.phase === 'tail-all', JSON.stringify(visTest.tailLate));
    chk('rise proper (after the tail): no visual override, ARC/STR solid again', visTest.riseProper === null,
      JSON.stringify(visTest.riseProper));
    // Room-title override: only during the tail's own slots, never round 1/pullout/round2/rise-proper.
    chk('caption null during pull-out (room title untouched)', visTest.capPullout === null, JSON.stringify(visTest.capPullout));
    chk('caption null during round 2 (room title behaves exactly as round 1 — spec item 3)',
      visTest.capRound2 === null, JSON.stringify(visTest.capRound2));
    chk('caption is the discipline name during a tail-one slot', visTest.capTailEarly &&
      typeof visTest.capTailEarly.name === 'string' && visTest.capTailEarly.name.length > 0 && visTest.capTailEarly.opacity === 1,
      JSON.stringify(visTest.capTailEarly));
    chk('caption is "All Disciplines" during the tail-all slot', visTest.capTailLate &&
      visTest.capTailLate.name === 'All Disciplines', JSON.stringify(visTest.capTailLate));
    chk('caption null again once the tail ends (swaps back to normal room title)', visTest.capRiseProper === null,
      JSON.stringify(visTest.capRiseProper));
    chk('A.cpeRevealDiscLabel reuses A.PHASE_MAP (ELEC -> "Electrical", stripped of its "3-" prefix)',
      visTest.discLabelELEC === 'Electrical', 'got=' + visTest.discLabelELEC);
    chk('A.cpeRevealDiscLabel degrades to the raw code for a discipline PHASE_MAP has no entry for',
      visTest.discLabelUnknown === 'ZZZ', 'got=' + visTest.discLabelUnknown);
    chk('A.cpeRevealDiscQtyCost returns a {count,cost} shape per discipline (no exception)',
      visTest.qtyCostShape && typeof visTest.qtyCostShape === 'object', JSON.stringify(visTest.qtyCostShape));
  }

  // ── W-PULLOUT-PREVIEW-REPLAN: same class of bug §CPE_REVEAL_ROUND already paid to fix (PR #1354)
  // — toggling Reveal must widen the EDITOR'S OWN live plan (the one Preview flies), not just a
  // freshly-built one, and must widen BOTH new boundaries (pullout and round2). ──
  const previewReplanTest = await pg.evaluate(async () => {
    const A = window.APP;
    let plan; try { plan = A.cinemaPathPlan(15); } catch (e) { return { ok: false, reason: 'cinemaPathPlan failed: ' + e.message }; }
    const openPromise = A.cinemaPathEditor.open({ plan: plan, durationSec: 15, fps: 15 });
    await new Promise(r => setTimeout(r, 1500));
    const beforeToggle = A.cinemaPathEditor._probePlanRef();
    const beforeWidth = beforeToggle ? (beforeToggle.beats.reveal - beforeToggle.beats.out) : null;
    document.getElementById('cpe-reveal').click();     // toggle ON — NO band drag, NO other edit
    await new Promise(r => setTimeout(r, 50));
    const afterToggle = A.cinemaPathEditor._probePlanRef();   // the editor's LIVE plan, same one Preview flies
    document.getElementById('cpe-cancel').click();
    if (!afterToggle) return { ok: false, reason: 'no _state.plan after toggle' };
    return { ok: true, beforeWidth, tO: afterToggle.beats.out, tP: afterToggle.beats.pullout, tV: afterToggle.beats.reveal };
  });
  chk('preview-replan probe ran', previewReplanTest.ok, previewReplanTest.reason || '');
  if (previewReplanTest.ok) {
    chk('before toggle: editor\'s live plan has the round at zero width (reveal was off)',
      previewReplanTest.beforeWidth === 0, 'got=' + previewReplanTest.beforeWidth);
    chk('checking Reveal alone (no band drag) immediately widens BOTH new boundaries on the ' +
      'EDITOR\'S OWN live plan — the exact plan Preview flies, not a freshly-built one',
      previewReplanTest.tP > previewReplanTest.tO && previewReplanTest.tV > previewReplanTest.tP,
      'tO=' + previewReplanTest.tO.toFixed(3) + ' tP=' + previewReplanTest.tP.toFixed(3) + ' tV=' + previewReplanTest.tV.toFixed(3));
  }

  // ── W-PULLOUT-DISC-ORDER (§CPE_DISCIPLINE_REVEAL_ORDER, 2026-08-16): the tail parade's discipline
  // order must match a HAND-COMPUTED sort of the same fixture DB — ascending AVG(bbox_x*bbox_y*
  // bbox_z) per discipline, with the literal 'MEP' code forced last regardless of its own measured
  // size. Recomputed independently here (not just re-reading A.cpeRevealDiscsPresent's own output)
  // so this is a real numeric proof, not a tautology. ──
  const discOrderTest = await pg.evaluate(() => {
    const A = window.APP;
    const discs = A.cpeRevealDiscsPresent ? A.cpeRevealDiscsPresent() : [];
    if (!discs.length) return { ok: false, reason: 'no non-ARC/STR discipline present in this fixture' };
    const inList = discs.map(d => "'" + d.replace(/'/g, "''") + "'").join(',');
    const rows = A.dbQuery('SELECT m.discipline, AVG(t.bbox_x * t.bbox_y * t.bbox_z) FROM elements_meta m ' +
      'JOIN element_transforms t ON m.guid = t.guid WHERE m.discipline IN (' + inList + ') ' +
      'AND t.bbox_x IS NOT NULL AND t.bbox_x > 0 GROUP BY m.discipline');
    const avgVol = {}; (rows || []).forEach(r => { avgVol[r[0]] = +r[1]; });
    const expected = discs.slice().sort((a, b) => {
      if (a === 'MEP' && b !== 'MEP') return 1;
      if (b === 'MEP' && a !== 'MEP') return -1;
      const va = avgVol[a], vb = avgVol[b];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return va - vb;
    });
    return { ok: true, actual: discs, expected, avgVol, hasMep: discs.indexOf('MEP') !== -1 };
  });
  chk('disc-order probe ran', discOrderTest.ok, discOrderTest.reason || '');
  if (discOrderTest.ok) {
    chk('A.cpeRevealDiscsPresent() order === independently hand-computed AVG(bbox volume) ascending sort',
      JSON.stringify(discOrderTest.actual) === JSON.stringify(discOrderTest.expected),
      'actual=' + JSON.stringify(discOrderTest.actual) + ' expected=' + JSON.stringify(discOrderTest.expected) +
      ' avgVol=' + JSON.stringify(discOrderTest.avgVol));
    if (discOrderTest.hasMep) {
      chk('MEP is the LAST discipline in the order, regardless of its own measured size',
        discOrderTest.actual[discOrderTest.actual.length - 1] === 'MEP', 'got=' + JSON.stringify(discOrderTest.actual));
    } else {
      console.log('  (skipped MEP-last check — fixture building has no MEP-coded elements, only sub-disciplines)');
    }
  }
  // The sort (and its log line) only runs when >1 discipline is present — a single-discipline
  // fixture correctly skips both (no ordering decision to make or log), so this check is gated the
  // same way the fixture-dependent checks above are, not a fixed expectation.
  if (discOrderTest.ok && discOrderTest.actual.length > 1) {
    const orderLog = logs.filter(l => l.indexOf('§CPE_REVEAL_DISC_ORDER') !== -1);
    chk('§CPE_REVEAL_DISC_ORDER logged with real avg-volume numbers per discipline',
      orderLog.length > 0, orderLog.slice(-1)[0] || 'not found');
  } else {
    console.log('  (skipped §CPE_REVEAL_DISC_ORDER log check — fixture has <= 1 discipline, sort is a correct no-op)');
  }

  chk('zero pageerrors through the whole run', errs.length === 0, errs.join(' | '));

  await br.close();
  await server.close();
  clearTimeout(_watchdog);
  console.log('\n§W-CPE-REVEAL-PULLOUT DONE pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('\n§W-CPE-REVEAL-PULLOUT CRASHED ' + (e && e.stack || e)); process.exit(2); });
