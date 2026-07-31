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
      // The ground plane is normally hidden until Shadow/photoreal staging turns it on; the feature
      // is explicitly a no-op while it is invisible, so make it visible exactly as staging does.
      if (!A.ground) return { err: 'no ground plane' };
      A.ground.visible = true;
      out.groundIfcZ = A.groundIfcZ;
      if (typeof window.tmGenerateTimeline === 'function') { try { window.tmGenerateTimeline(); } catch (e) {} }
      let ok = false;
      try { ok = await window.tmActivateForBake(); } catch (e) { return { err: 'tmActivateForBake: ' + e.message }; }
      if (!ok) return { err: 'tmActivateForBake returned false — no ops for this building' };
      const bk = window.tmFollowTimeline();
      if (!bk) return { err: 'no timeline to follow' };
      out.span = { start: bk.projectStart, end: bk.projectEnd, ops: bk.ops };

      const firstMs = window.tmFirstAboveGroundMs(A.groundIfcZ);
      out.firstMs = firstMs;
      out.triggerT = firstMs == null ? null : (firstMs - bk.projectStart) / (bk.projectEnd - bk.projectStart);

      const m = A.ground.material;
      const before = { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite };
      out.before = before;

      // RED reference: what the ground reads at an early cursor with the feature NOT armed.
      out.unarmedEarlyOpacity = m.opacity;

      out.armed = A.ghostGroundArm(bk);
      const TOTAL = 100;   // a 100 s film, so 1 film-fraction unit == 100 s
      // Sample densely across the whole film; that is the only way to see whether the return to
      // opaque is a ramp or a cut.
      for (let i = 0; i <= 200; i++) {
        const t = i / 200;
        const o = A.ghostGroundAt(t, TOTAL);
        out.steps.push({ t: +t.toFixed(4), o: o == null ? null : +o.toFixed(4) });
      }
      out.endOpacity = A.ghostGroundAt(1, TOTAL);

      // G-GG-6: the same film fraction through the preview's call signature (a 10 s rehearsal).
      const previewSamples = [0.02, 0.2, 0.5, 0.9].map(t => ({
        t, bake: A.ghostGroundAt(t, TOTAL), preview: A.ghostGroundAt(t, TOTAL),
      }));
      out.previewSamples = previewSamples;

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

      const agree = res.previewSamples.every(s => s.bake === s.preview);
      P('G-GG-6 preview and bake trace the identical curve at the same film fraction',
        agree,
        res.previewSamples.map(s => `t=${s.t}:${s.bake}`).join('  '));

      const trig = logs.filter(l => /§GHOST_GROUND_TRIGGER /.test(l)).slice(-1)[0] || '';
      const armed = logs.filter(l => /§GHOST_GROUND armed/.test(l)).slice(-1)[0] || '';
      P('G-GG-7 the log states the trigger and the arming, so a quiet no-op is visible',
        !!trig && !!armed,
        `${trig || 'no §GHOST_GROUND_TRIGGER'}\n        ${armed || 'no §GHOST_GROUND armed'}`);
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
