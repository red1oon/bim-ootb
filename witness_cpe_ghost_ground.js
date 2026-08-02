// WITNESS — §CPE_GHOST_GROUND: a buildup film must not open on a buried foundation.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_GHOST_GROUND.
//
// THE DEFECT THIS PROVES OR DISPROVES (user, 2026-07-31, watching a Hospital buildup bake:
// "or because cam was too high, and foundation has not emerged?" ... "is there a way to make the
// foundation beams seen thru? at least until its above slabs appears"):
// A buildup film opens on SUBSTRUCTURE, and substructure sits BELOW the ground plane (§GROUND_Y —
// the L1 slab datum, z=165.36 on Hospital). Their own log read `placed=210/63421` at frame 120 with
// `§GROUND_MAP key=paved` and `§PHOTO_SHADOW casters=4043` — those 210 elements were built and
// BURIED. The opening was occluded, not empty, so no camera or gaze change could have revealed it.
//
//   G-GG-1  the trigger is real and non-trivial: tmFirstAboveGroundMs(groundZ) lands STRICTLY inside
//           the project span. At t<=0 the feature would be a silent no-op; null would mean it never
//           fires. Both are failures of the mechanism, not of the film.
//   G-GG-2  RED before this change. Early in the buildup the ground is see-through (opacity ==
//           GHOST), where it used to be fully opaque and hid the substructure.
//   G-GG-3  the return is GRADUAL, not a cut (user: "it be cool when they return back to opaque
//           gradually rather than right away"). Sampled across the trigger: strictly more than one
//           intermediate value, monotone non-decreasing, ending exactly at 1.0. A cut would pass a
//           naive before/after test and fail this one — that is the point of it.
//   G-GG-4  it never ghosts again: at the end of the film the ground is fully opaque.
//   G-GG-5  no leak. After ghostGroundRestore() the material is byte-identical to what it was
//           before arming. A ghosted ground left behind follows the user into normal navigation.
//   G-GG-6  preview and bake agree — the same film fraction yields the same opacity whichever
//           call site drives it, because the fade is expressed in film fraction, not wall time.
//
// §CPE_GHOST_GROUND_TRIGGER (2026-08-03): #1112 replaced the first-element trigger above with a
// RATIO against the model's own above-ground total (opaque at 5% of above-ground work placed),
// reasoning the first-element trigger was too brief to be legible. The user then watched real
// bakes and said, twice, directly, that even 5% is "quite further on" than they want — this
// reverts the TRIGGER to first-above-ground-element while keeping every #1113-1115 hardening
// (degrade-not-disable, refusal logging, lazy arm-on-first-tick, arm-while-hidden) intact.
//   G-GG-8  RED-vs-GREEN: the ground reaches opaque essentially AT the first above-ground
//           element (within one fade window), NOT materially later — the point of the revert.
//           Also computes, from the SAME real schedule data, where the retired 5%-share rule
//           would have fired, as the quantified "before" this replaces.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8441;
const BUILDINGS = (process.env.BLDS || 'Duplex').split(',');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 1800000,
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
    await page.waitForFunction(() => window.APP && window.APP.ghostGroundArm && window.APP.dbQuery,
      { timeout: 300000 });
    await sleep(9000);
    await page.waitForFunction(() => {
      try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
      catch (e) { return false; }
    }, { timeout: 300000, polling: 3000 });

    const res = await page.evaluate(async () => {
      const A = window.APP;
      const out = { steps: [] };
      // ⚠ DO NOT make the ground visible before arming. This witness used to do exactly that, and
      // it is why 8/8 green shipped a feature that never armed in a real bake: photoreal staging
      // turns the plane on INSIDE the per-frame loop, so at arm time it is always hidden. Arming
      // against a state the browser never has is the harness lying, not the product passing.
      if (!A.ground) return { err: 'no ground plane' };
      A.ground.visible = false;
      out.groundIfcZ = A.groundIfcZ;
      if (typeof window.tmGenerateTimeline === 'function') { try { window.tmGenerateTimeline(); } catch (e) {} }
      let ok = false;
      try { ok = await window.tmActivateForBake(); } catch (e) { return { err: 'tmActivateForBake: ' + e.message }; }
      if (!ok) return { err: 'tmActivateForBake returned false — no ops for this building' };
      const bk = window.tmFollowTimeline();
      if (!bk) return { err: 'no timeline to follow' };
      out.span = { start: bk.projectStart, end: bk.projectEnd, ops: bk.ops };

      const sched = window.tmGroundSchedule(A.groundIfcZ);
      out.sched = sched ? { aboveTotal: sched.aboveTotal, belowTotal: sched.belowTotal } : null;
      out.firstMs = sched ? sched.firstAboveMs : null;
      out.triggerT = out.firstMs == null ? null : (out.firstMs - bk.projectStart) / (bk.projectEnd - bk.projectStart);

      // RED reference, computed from the SAME real schedule: where the retired #1112 5%-share rule
      // would have fired — the k-th above-ground op's own end_ts, k = ceil(5% of aboveTotal).
      if (sched && sched.ends && sched.ends.length) {
        const k = Math.max(1, Math.ceil(sched.aboveTotal * 0.05));
        const oldMs = sched.ends[Math.min(k, sched.ends.length) - 1];
        out.oldRuleK = k;
        out.oldRuleMs = oldMs;
        out.oldRuleT = (oldMs - bk.projectStart) / (bk.projectEnd - bk.projectStart);
      }

      const m = A.ground.material;
      const before = { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite };
      out.before = before;

      // RED reference: what the ground reads at an early cursor with the feature NOT armed.
      out.unarmedEarlyOpacity = m.opacity;

      out.groundVisibleAtArm = A.ground.visible;   // false, exactly as a real bake has it
      out.armed = A.ghostGroundArm(bk);
      A.ground.visible = true;                     // staging turns it on once the frame loop starts
      const TOTAL = 100;   // a 100 s film, so 1 film-fraction unit == 100 s
      // Sample densely across the whole film; that is the only way to see whether the return to
      // opaque is a ramp or a cut.
      for (let i = 0; i <= 200; i++) {
        const t = i / 200;
        const o = A.ghostGroundAt(t, TOTAL);
        out.steps.push({ t: +t.toFixed(4), o: o == null ? null : +o.toFixed(4) });
      }
      out.endOpacity = A.ghostGroundAt(1, TOTAL);

      // G-GG-6: the SAME fractions again through a fresh arming, the way the preview drives it.
      // ⚠ This must re-arm: the rate limiter carries state forward, so sampling t=0.02 after the
      // sweep has already reached t=1 returns 1 and the gate would pass for the wrong reason
      // (caught 2026-07-31 — it did exactly that before this re-arm was added).
      A.ghostGroundRestore();
      A.ground.visible = true;
      A.ghostGroundArm(bk);
      const fracs = [0.02, 0.05, 0.10, 0.20, 0.50, 0.90];
      const byT = {};
      out.steps.forEach(s => { byT[s.t] = s.o; });
      out.previewSamples = [];
      for (const t of fracs) {   // ascending, exactly as a rehearsal advances
        const preview = A.ghostGroundAt(t, TOTAL);
        // the bake sweep sampled every 1/200, so these fractions land on real samples
        out.previewSamples.push({ t, bake: byT[+t.toFixed(4)], preview: preview == null ? null : +preview.toFixed(4) });
      }

      // G-GG-10: DEGRADE, DON'T DISABLE. Hide the precise API the way a stale service-worker copy of
      // time_machine.js would, and the feature must still arm on the coarse proxy rather than vanish.
      A.ghostGroundRestore();
      A.ground.visible = false;
      const realSched = window.tmGroundSchedule;
      window.tmGroundSchedule = undefined;
      out.fallbackArmed = A.ghostGroundArm(bk);
      A.ground.visible = true;
      out.fallbackOpacityEarly = A.ghostGroundAt(0.001, TOTAL);
      out.fallbackOpacityLate = A.ghostGroundAt(1, TOTAL);
      window.tmGroundSchedule = realSched;

      // G-GG-11: LAZY ARM. Never call arm; the first per-frame tick must arm itself, because the
      // up-front arm runs before photoreal staging exists and that ordering disabled it live.
      A.ghostGroundRestore();
      A.ground.visible = false;
      out.lazyFirstTick = A.ghostGroundAt(0.001, TOTAL, bk);
      out.lazyArmedWithoutExplicitArm = out.lazyFirstTick != null;

      A.ghostGroundRestore();
      out.after = { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite };
      try { window.tmRestoreDerivedOrder(); } catch (e) {}
      return out;
    });

    const checks = [];
    const P = (n, ok, d) => { checks.push({ n, ok, d }); console.log(`  ${ok ? '✅' : '❌'} ${n}\n        ${d}`); };

    if (res.err) {
      P('G-GG-0 the building has a ground plane and a buildup timeline', false,
        res.err + ' — INCONCLUSIVE on this building, not a product verdict');
    } else {
      P('G-GG-1 the trigger lands strictly inside the film, not at t=0 and not never',
        res.firstMs != null && res.triggerT > 0 && res.triggerT < 1,
        `groundIfcZ=${res.groundIfcZ}  firstAboveMs=${res.firstMs}  triggerT=${res.triggerT == null ? 'null' : res.triggerT.toFixed(4)}  ` +
        `span=${Math.round(res.span.start)}..${Math.round(res.span.end)} ops=${res.span.ops}`);

      // where the ratio rule actually reaches opaque — the number that says whether the ghost is
      // long enough to see, and the whole reason the first-element trigger was replaced.
      const opaqueAt = (res.steps.find(s => s.o != null && s.o > 0.999) || {}).t;
      res.opaqueAt = opaqueAt;
      const early = res.steps.filter(s => s.t < res.triggerT);
      const ghosted = early.length && early.every(s => s.o != null && s.o < 0.3);
      P('G-GG-2 before the trigger the ground is see-through, so the substructure reads (RED before this change)',
        res.armed && ghosted,
        `armed=${res.armed}  ${early.length} samples before t=${res.triggerT.toFixed(3)}, ` +
        `opacity ${early.length ? early[0].o + '..' + early[early.length - 1].o : '-'}  ` +
        `(unarmed the same plane reads ${res.unarmedEarlyOpacity} — fully opaque, foundation buried)`);

      // the ramp: values strictly between ghost and opaque
      const mid = res.steps.filter(s => s.o != null && s.o > 0.23 && s.o < 0.999);
      let monotone = true;
      for (let i = 1; i < res.steps.length; i++) {
        if (res.steps[i].o != null && res.steps[i - 1].o != null && res.steps[i].o < res.steps[i - 1].o - 1e-9) monotone = false;
      }
      P('G-GG-3 the return to opaque is GRADUAL and monotone, not a cut',
        mid.length >= 3 && monotone,
        `${mid.length} intermediate opacity values between ghost and opaque (a cut would give 0), monotone=${monotone}  ` +
        `ramp=[${mid.slice(0, 6).map(s => s.o).join(' ')}${mid.length > 6 ? ' …' : ''}]`);

      P('G-GG-4 it never ghosts again — the end of the film is fully opaque',
        res.endOpacity === 1,
        `opacity at t=1 is ${res.endOpacity}`);

      const leak = res.before.transparent !== res.after.transparent ||
                   res.before.opacity !== res.after.opacity ||
                   res.before.depthWrite !== res.after.depthWrite;
      P('G-GG-5 no leak into normal navigation after restore',
        !leak,
        `before=${JSON.stringify(res.before)}  after=${JSON.stringify(res.after)}`);

      const agree = res.previewSamples.length > 0 &&
        res.previewSamples.every(s => s.bake != null && s.preview != null && Math.abs(s.bake - s.preview) < 1e-6);
      P('G-GG-6 preview and bake trace the identical curve at the same film fraction',
        agree,
        res.previewSamples.map(s => `t=${s.t} bake=${s.bake} preview=${s.preview}`).join('   '));

      // §CPE_GHOST_GROUND_TRIGGER (2026-08-03 revert): the ground must go opaque essentially AT the
      // first above-ground element — within one GHOST_FADE_SEC fade window of it, not materially
      // later. fadeFrac = min(0.5, 3s / 100s film) = 0.03; allow slack for the 1/200 sample grid.
      const fadeFrac = 0.03, tol = fadeFrac + 0.015;
      const gap = res.opaqueAt == null ? null : res.opaqueAt - res.triggerT;
      P('G-GG-8 GREEN — opaque essentially AT first above-ground element, not materially later (the point of the revert)',
        gap != null && gap > 0 && gap <= tol,
        `first above-ground element at t=${res.triggerT.toFixed(4)}; ground reaches opaque at ` +
        `t=${res.opaqueAt == null ? 'never' : res.opaqueAt.toFixed(4)}  gap=${gap == null ? 'n/a' : gap.toFixed(4)} ` +
        `(tolerance=${tol.toFixed(4)}, above=${res.sched.aboveTotal} below=${res.sched.belowTotal})  |  ` +
        `RED reference (retired #1112 5%-share rule, same real schedule): would have fired at ` +
        `t=${res.oldRuleT == null ? 'n/a' : res.oldRuleT.toFixed(4)} (k=${res.oldRuleK}th above-ground element) — ` +
        `gap this revert closes = ${res.oldRuleT == null ? 'n/a' : (res.oldRuleT - res.triggerT).toFixed(4)} film-fraction ` +
        `(${res.oldRuleMs == null ? '' : Math.round(res.oldRuleMs - res.firstMs) + 'ms, '}` +
        `${res.oldRuleK ? (res.oldRuleK - 1) + ' extra above-ground elements waited on' : ''})`);

      P('G-GG-10 a stale time_machine.js DEGRADES to the coarse rule instead of disabling the feature',
        res.fallbackArmed === true && res.fallbackOpacityEarly != null && res.fallbackOpacityEarly < 0.3 &&
        res.fallbackOpacityLate === 1,
        `with tmGroundSchedule hidden: armed=${res.fallbackArmed} early=${res.fallbackOpacityEarly} late=${res.fallbackOpacityLate}  ` +
        `(this feature spans 3 files; one stale copy must not silently kill it)`);

      P('G-GG-11 the first per-frame tick arms itself — no dependency on WHEN arm is called',
        res.lazyArmedWithoutExplicitArm === true && res.lazyFirstTick < 0.3,
        `ghostGroundArm() never called; first ghostGroundAt() returned ${res.lazyFirstTick}`);

      const trig = logs.filter(l => /§GHOST_GROUND_SCHEDULE /.test(l)).slice(-1)[0] || '';
      const armed = logs.filter(l => /§GHOST_GROUND armed/.test(l)).slice(-1)[0] || '';
      P('G-GG-9 it arms while the ground is still HIDDEN — the state every real bake arms in',
        res.groundVisibleAtArm === false && res.armed === true,
        `ground.visible at arm = ${res.groundVisibleAtArm}, armed = ${res.armed}  ` +
        `(a visibility guard here silently disabled the feature on every real bake — the witness had ` +
        `been setting visible=true first, which is a regime the browser never enters at that moment)`);

      P('G-GG-7 the log states the trigger and the arming, so a quiet no-op is visible',
        !!trig && !!armed,
        `${trig || 'no §GHOST_GROUND_SCHEDULE'}\n        ${armed || 'no §GHOST_GROUND armed'}`);
    }

    const pass = checks.filter(c => c.ok).length;
    console.log(`\n  ${BLD}: ${pass}/${checks.length}`);
    if (pass !== checks.length || !checks.length) allPass = false;
    await page.close();
  }

  await browser.close();
  console.log(allPass ? '\nALL GREEN' : '\nRED');
  process.exit(allPass ? 0 : 1);
})();
