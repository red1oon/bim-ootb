// WITNESS — §CPE_BUILDUP_REAL_SCHEDULE.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_BUILDUP_REAL_SCHEDULE (§2 the defect,
// §3 the fix, §4 these claims, §5 the honesty rule, §6 the billboard elements).
//
// Each check names the issue it proves or disproves — a check that cannot fail is not a check.
//
//   R1  W-SCHED-REAL-ORDER — THE GATE. On a building whose `tasks` are populated, the buildup reveal
//       follows the SCHEDULE, not the camera: for leaf phases ordered by schedule_start,
//       max(reveal ts of phase i) <= min(reveal ts of phase i+1) — the phases do not interleave.
//   R2  W-SCHED-REAL-ORDER, the DISCRIMINATOR — the same measurement run against mode D
//       (tmOrderByCameraPath) on the SAME building must FAIL R1's non-interleave test. Without this,
//       R1 could be passing for a reason unrelated to the fix. This is the §2 defect, measured.
//   V1  W-SCHED-REVERSIBLE — tmOrderBySchedule() mutates NOTHING: the all-ops checksum
//       (opCount/sumStart/sumEnd over every op) is bit-identical before and after, and
//       tmRestoreDerivedOrder() returns false because there is nothing saved to restore.
//   M1  W-SCHED-MONOTONE — §CPE_BUILDUP's own trap still holds on the captured branch: placed is
//       monotone non-decreasing across frames, starts at 0, ends at full, mid strictly between —
//       so a §CPE_CLIP still opens on a partially-built model.
//   C1  W-SCHED-COVERAGE — the reported coverage is real, not asserted: covered+generated==total,
//       pct matches the ratio, and the distinct guid count in task_elements equals what _cap covered.
//   B1  W-SCHED-BILLBOARD (§6) — the §BILLBOARD_INJECT panel + 4 floodlights are each bound to a leaf
//       task and therefore land in the captured reveal; the frame index of each is reported.
//   F1  W-SCHED-FALLBACK — on a building with NO usable `tasks`, tmScheduleSource() says 'derived'
//       and tmOrderBySchedule() returns null (refuses, does not guess).
//   F2  W-SCHED-FALLBACK, the REGRESSION gate — the derived path is UNCHANGED. Differential: the
//       frame-by-frame placed series from calling tmOrderByCameraPath directly (the pre-change code)
//       must equal, frame for frame, the series produced by going through the new §3.3 branch. Any
//       perturbation of the shipped derived buildup shows up as a differing frame.
//   A1  W-SCHED-AUTHOR-ROUNDTRIP — author -> save -> reload -> the buildup consumes it. Runs the
//       ALREADY-SHIPPED ScheduleAuthor.materializeDefault on a building that has no schedule, then
//       proves tmScheduleSource() flips derived -> captured and R1 passes on that building too.
//       This is a VERIFICATION of shipped authoring code (spec §0), not a gate on new code.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8433;
const CAPTURED = process.env.CAP_BLD || 'TerminalHi4D';       // has a real linked schedule
const DERIVED = (process.env.DER_BLDS || 'Duplex,Hospital_3').split(',');   // have none
const NF = 40;                                                 // frames in the sampled film
const BILLBOARD = ['BB0BIMOOTBSIGN000001A', 'BB0BIMOOTBFLOOD000001', 'BB0BIMOOTBFLOOD000002',
                   'BB0BIMOOTBFLOOD000003', 'BB0BIMOOTBFLOOD000004'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// A synthetic straight-line flight, deterministic, so mode D's re-key is reproducible run to run.
const POSE_SRC = `(function(t){ return { x: -200 + 400*t, y: 40, z: -200 + 400*t,
                                          tx: 0, ty: 10, tz: 0 }; })`;

async function open(browser, bld) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 600 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${bld}_extracted.db`,
    { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.APP && window.APP.dbQuery, { timeout: 300000 });
  await page.waitForFunction(() => {
    try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM elements_meta'); return r && r[0][0] > 0; }
    catch (e) { return false; }
  }, { timeout: 300000, polling: 2000 });
  await sleep(6000);
  return { page, logs };
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 1800000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader',
           '--max-old-space-size=8192'],
  });
  let allPass = true;
  const checks = [];
  const P = (n, ok, d) => { checks.push({ n, ok, d }); if (!ok) allPass = false;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${n.padEnd(26)} ${d}`); };

  // ══════════════ CAPTURED BUILDING — R1 R2 V1 M1 C1 B1 ══════════════
  console.log('\n' + '='.repeat(78) + `\n${CAPTURED} — real linked schedule\n` + '='.repeat(78));
  {
    const { page, logs } = await open(browser, CAPTURED);
    const res = await page.evaluate(async (nf, poseSrc, bbGuids) => {
      const A = window.APP, out = {};
      const poseAt = eval(poseSrc);
      if (typeof window.tmActivateForBake !== 'function') return { err: 'no time_machine' };
      out.activated = await window.tmActivateForBake();
      if (!out.activated) return { err: 'tmActivateForBake false' };

      out.src = window.tmScheduleSource();

      // ── C1: coverage cross-checked against the tables themselves ──
      const q1 = A.dbQuery('SELECT COUNT(DISTINCT guid) FROM task_elements te JOIN tasks t ' +
        'ON t.task_id=te.task_id WHERE t.schedule_start IS NOT NULL AND t.schedule_finish IS NOT NULL ' +
        'AND (t.is_summary IS NULL OR t.is_summary=0)');
      out.boundGuids = q1[0][0];
      out.total = A.dbQuery("SELECT COUNT(*) FROM elements_meta WHERE ifc_class!='IfcOpeningElement'")[0][0];

      // ── V1 (before) + R1: measure the CAPTURED order ──
      const before = window.tmPhaseWindows();
      out.chkBefore = before.checksum;
      const st = window.tmOrderBySchedule();
      out.state = st;
      const after = window.tmPhaseWindows();
      out.chkAfter = after.checksum;
      out.restoreReturn = window.tmRestoreDerivedOrder();     // must be false — nothing was saved
      out.capturedPhases = after.phases.map(p => ({ taskId: p.taskId, name: p.name,
        scheduleStart: p.scheduleStart, n: p.n, bound: p.bound, minStart: p.minStart, maxStart: p.maxStart }));

      // ── M1: the placed series across the film, on the captured window ──
      const series = [];
      for (let i = 0; i < nf; i++) {
        const t = nf > 1 ? i / (nf - 1) : 0;
        series.push(window.tmPlacedCount(st.projectStart + t * (st.projectEnd - st.projectStart)));
      }
      out.series = series;

      // ── B1: where each billboard element lands in the film ──
      const bb = [];
      for (const g of bbGuids) {
        const r = A.dbQuery("SELECT te.task_id, t.name, t.schedule_start FROM task_elements te " +
          "JOIN tasks t ON t.task_id=te.task_id WHERE te.guid='" + g + "'");
        const ko = A.dbQuery("SELECT timestamp FROM kernel_ops WHERE output_guid='" + g +
          "' AND op_type='ELEMENT_PLACE'");
        let frame = -1;
        if (ko.length) {
          const f = (ko[0][0] - st.projectStart) / (st.projectEnd - st.projectStart);
          frame = Math.round(f * (nf - 1));
        }
        bb.push({ guid: g, task: r.length ? r[0][0] : null, phase: r.length ? r[0][1] : null,
                  ts: ko.length ? ko[0][0] : null, frame });
      }
      out.billboard = bb;

      // ── R2 THE DISCRIMINATOR: same measurement under mode D ──
      const md = window.tmOrderByCameraPath(poseAt, nf);
      out.modeD = md;
      out.modeDPhases = window.tmPhaseWindows().phases.map(p => ({ taskId: p.taskId, name: p.name,
        scheduleStart: p.scheduleStart, minStart: p.minStart, maxStart: p.maxStart }));
      window.tmRestoreDerivedOrder();
      out.chkRestored = window.tmPhaseWindows().checksum;
      return out;
    }, NF, POSE_SRC, BILLBOARD);

    if (res.err) { P('SETUP', false, res.err); }
    else {
      const nonInterleave = (phases) => {
        const bad = [];
        for (let i = 0; i + 1 < phases.length; i++) {
          if (!(phases[i].maxStart <= phases[i + 1].minStart)) bad.push(`${phases[i].name}->${phases[i + 1].name}`);
        }
        return bad;
      };
      const src = res.src;
      P('SRC captured', src.source === 'captured',
        `source=${src.source} leafTasks=${src.leafTasks} summarySkipped=${src.summarySkipped} ` +
        `covered=${src.covered}/${src.total} pct=${src.pct}%`);

      const badCap = nonInterleave(res.capturedPhases);
      P('R1 W-SCHED-REAL-ORDER', res.capturedPhases.length >= 2 && badCap.length === 0,
        `${res.capturedPhases.length} leaf phases, 0 interleaving pairs` +
        (badCap.length ? ` — VIOLATIONS: ${badCap.join(', ')}` : ''));
      console.log('     phase windows (captured):');
      res.capturedPhases.forEach(p => console.log(`       ${p.name.padEnd(16)} start=${p.scheduleStart}` +
        ` n=${String(p.n).padStart(6)} bound=${String(p.bound).padStart(6)}` +
        ` ts=[${new Date(p.minStart).toISOString().slice(0, 10)} .. ${new Date(p.maxStart).toISOString().slice(0, 10)}]`));

      const badD = nonInterleave(res.modeDPhases);
      P('R2 discriminator', badD.length > 0,
        `mode D interleaves ${badD.length}/${res.modeDPhases.length - 1} consecutive phase pairs ` +
        `(a gate mode D also passed would prove nothing)`);
      console.log('     phase windows (mode D re-key, the §2 defect):');
      res.modeDPhases.forEach(p => console.log(`       ${p.name.padEnd(16)}` +
        ` ts=[${new Date(p.minStart).toISOString().slice(0, 10)} .. ${new Date(p.maxStart).toISOString().slice(0, 10)}]`));

      const b = res.chkBefore, a = res.chkAfter, r = res.chkRestored;
      P('V1 W-SCHED-REVERSIBLE',
        b.opCount === a.opCount && b.sumStart === a.sumStart && b.sumEnd === a.sumEnd &&
        res.restoreReturn === false,
        `ops=${b.opCount} sumStart delta=${a.sumStart - b.sumStart} sumEnd delta=${a.sumEnd - b.sumEnd}` +
        ` restoreReturn=${res.restoreReturn} (false = nothing was written)`);
      P('V1b modeD restored', r.sumStart === b.sumStart && r.sumEnd === b.sumEnd,
        `after mode D + restore, sumStart delta=${r.sumStart - b.sumStart} sumEnd delta=${r.sumEnd - b.sumEnd}`);

      const s = res.series, mid = s[Math.floor(s.length / 2)];
      let mono = true; for (let i = 1; i < s.length; i++) if (s[i] < s[i - 1]) mono = false;
      P('M1 W-SCHED-MONOTONE', mono && s[0] === 0 && s[s.length - 1] > mid && mid > 0,
        `placed ${s[0]} -> ${mid} (mid) -> ${s[s.length - 1]} over ${s.length} frames, monotone=${mono}`);

      P('C1 W-SCHED-COVERAGE',
        res.boundGuids === res.state.covered && res.state.covered === res.total &&
        res.state.pct === 100,
        `task_elements distinct bound guids=${res.boundGuids} == _cap covered=${res.state.covered}` +
        ` == elements=${res.total}, pct=${res.state.pct}%`);

      const bbOk = res.billboard.every(x => x.task && x.frame >= 0);
      P('B1 W-SCHED-BILLBOARD', bbOk, `${res.billboard.length}/5 bound to a leaf task`);
      res.billboard.forEach(x => console.log(`       ${x.guid.padEnd(22)} -> ${String(x.phase).padEnd(14)}` +
        ` frame ${x.frame}/${NF - 1}`));

      const srcLine = logs.filter(l => l.startsWith('§CPE_BUILDUP_SOURCE'));
      const gsLine = logs.filter(l => l.startsWith('§GANTT_SOURCE') || l.startsWith('§4D_COVERAGE'));
      console.log('     §-log:');
      gsLine.concat(srcLine).forEach(l => console.log('       ' + l));
      P('LOG §CPE_BUILDUP_SOURCE', srcLine.length > 0 && /source=captured/.test(srcLine[0] || ''),
        srcLine.length ? 'printed' : 'MISSING — a claim with no log line is not done');
    }
    await page.close();
  }

  // ══════════════ DERIVED BUILDINGS — F1 F2 (+ A1 on the first) ══════════════
  //
  // ⚠ THE F2 INSTRUMENT WAS WRONG TWICE BEFORE THE CODE WAS — read before changing it.
  //   attempt 1 | both paths in ONE page, compare the placed series frame by frame | 1/40 frames
  //     differed. Cause: `tmOrderByCameraPath`'s tie-break `zRank = i/(n-1)` is the op's INDEX in the
  //     CURRENT `_ops` order. Re-keying re-sorts `_ops`; `tmRestoreDerivedOrder` re-sorts back — and
  //     for ops whose original timestamps TIE, the stable sort preserves the camera order, not the
  //     load order. A second mode-D pass therefore starts from a different tie permutation. That is a
  //     pre-existing, harmless non-idempotence in SHIPPED mode D, not a regression from this change.
  //   attempt 2 | one path per FRESH page load | worse: ops=1120 vs 1121 and the project windows
  //     differed by ~4.6 s. Two causes, both fatal to a cross-load differential: injectGantt anchors
  //     the generated timeline on `new Date()` (wall-clock, so every load has a different epoch), and
  //     the IDB building cache PERSISTS between loads in one browser profile, so a stray op recorded
  //     by the first load is present in the second. A differential across two different inputs is not
  //     a differential.
  //   correct instrument | ONE page (same epoch, same ops), gate on the ALL-OPS CHECKSUM plus the
  //     returned state object. `sumStart`/`sumEnd` are sums over the same op set, so they are provably
  //     INVARIANT to a tie permutation (swapping two tied ops swaps which zRank each gets; the
  //     multiset of zRank values, and hence the sum, is unchanged) while still changing if any real
  //     re-key value changes. The placed series is still reported, with its tie-artifact diff, as an
  //     observation rather than the gate.
  for (const BLD of DERIVED) {
    console.log('\n' + '='.repeat(78) + `\n${BLD} — no schedule (fallback + regression)\n` + '='.repeat(78));
    const { page, logs } = await open(browser, BLD);
    const res = await page.evaluate(async (nf, poseSrc) => {
      const out = {}, poseAt = eval(poseSrc);
      out.activated = await window.tmActivateForBake();
      if (!out.activated) return { err: 'tmActivateForBake false' };
      out.src = window.tmScheduleSource();
      out.rejected = window.tmOrderBySchedule();     // must be null — refuses, does not guess
      const sample = (st) => {
        const s = [];
        for (let i = 0; i < nf; i++) {
          const t = nf > 1 ? i / (nf - 1) : 0;
          s.push(window.tmPlacedCount(st.projectStart + t * (st.projectEnd - st.projectStart)));
        }
        return s;
      };
      const pack = (st) => ({ ps: st.projectStart, pe: st.projectEnd, placed: st.placed,
                              ops: st.ops, noGeom: st.noGeom, arc: st.arc, source: st.source });
      // THE CONTROL: three consecutive DIRECT passes (the pre-change code path), each followed by a
      // restore. Their checksums show the shipped tie-permutation artifact settling, and pass 3 is the
      // control the branch is measured against — so the gate is an exact equality against a repeat of
      // the OLD code, never an invented tolerance.
      out.direct = [];
      for (let k = 0; k < 3; k++) {
        const st = window.tmOrderByCameraPath(poseAt, nf);
        out.direct.push({ st: pack(st), chk: window.tmPhaseWindows().checksum, series: sample(st) });
        window.tmRestoreDerivedOrder();
      }
      // THE TEST: through the NEW §3.3 branch, replicated verbatim from cinema_maxq.js.
      let bk = null;
      const ss = (typeof window.tmScheduleSource === 'function') ? window.tmScheduleSource() : null;
      if (ss && ss.source === 'captured' && typeof window.tmOrderBySchedule === 'function') bk = window.tmOrderBySchedule();
      if (!bk) bk = window.tmOrderByCameraPath(poseAt, nf);
      out.stB = pack(bk); out.seriesB = sample(bk); out.chkB = window.tmPhaseWindows().checksum;
      window.tmRestoreDerivedOrder();
      return out;
    }, NF, POSE_SRC);

    if (res.err) { P(`SETUP ${BLD}`, false, res.err); }
    else {
      P(`F1 fallback ${BLD}`, res.src.source === 'derived' && res.rejected === null,
        `source=${res.src.source} leafTasks=${res.src.leafTasks} capOps=${res.src.capOps} ` +
        `tmOrderBySchedule()=${res.rejected} (refuses, does not guess)`);
      const ctrl = res.direct[2], b = res.chkB, sC = ctrl.st, sB = res.stB;   // pass 3 = the control
      const diffs = ctrl.series.filter((v, i) => v !== res.seriesB[i]).length;
      const same = ctrl.chk.opCount === b.opCount && ctrl.chk.sumStart === b.sumStart &&
        ctrl.chk.sumEnd === b.sumEnd && diffs === 0 &&
        sC.ps === sB.ps && sC.pe === sB.pe && sC.placed === sB.placed && sC.ops === sB.ops &&
        sC.noGeom === sB.noGeom && sC.arc === sB.arc && sB.source === 'derived';
      P(`F2 regression ${BLD}`, same,
        `branch == a repeat of the OLD call, exactly: ops=${sC.ops}==${sB.ops} ` +
        `placed=${sC.placed}==${sB.placed} noGeom=${sC.noGeom}==${sB.noGeom} arc=${sC.arc}==${sB.arc} | ` +
        `sumStart delta=${b.sumStart - ctrl.chk.sumStart} sumEnd delta=${b.sumEnd - ctrl.chk.sumEnd} | ` +
        `placed series ${diffs}/${NF} frames differ | branch took source=${sB.source}`);
      console.log(`     control — 3 consecutive DIRECT passes (shipped code), sumEnd deltas vs pass1: ` +
        res.direct.map(d => (d.chk.sumEnd - res.direct[0].chk.sumEnd)).join(', ') +
        ` (the shipped noGeom/tie artifact settling; branch is gated against pass 3)`);
      const md = logs.filter(l => l.startsWith('§MAXQ_TIME mode=D'));
      P(`LOG mode=D ${BLD}`, md.length >= 2, `§MAXQ_TIME mode=D printed ${md.length}x (both paths reached it)`);
      if (md.length) console.log('       ' + md[md.length - 1]);
    }
    await page.close();

    // ── A1 W-SCHED-AUTHOR-ROUNDTRIP — only on the first derived building (it is the slowest gate) ──
    // A REAL round-trip: author -> persistDb -> page RELOAD -> re-read. Run 1 did the author and then
    // called tmGenerateTimeline() in place, which (a) re-injected ELEMENT_PLACE ops on top of the
    // existing ones and (b) never reloaded `_ops`, so the measurement compared stale in-memory ops
    // against fresh task bindings. That was a witness defect, and it is exactly the "verify the
    // checker's own ground truth first" trap — the reload is the claim, so the reload must happen.
    if (BLD === DERIVED[0]) {
      console.log(`  -- A1 W-SCHED-AUTHOR-ROUNDTRIP on ${BLD} --`);
      const { page } = await open(browser, BLD);
      const pre = await page.evaluate(async () => {
        const A = window.APP, out = {};
        if (!window.ScheduleAuthor) return { err: 'ScheduleAuthor not loaded' };
        await window.tmActivateForBake();
        out.before = window.tmScheduleSource();
        // The ALREADY-SHIPPED authoring call — the exact one schedule_editor_ui.js:503 makes.
        out.mat = window.ScheduleAuthor.materializeDefault(A.db, window.SEQUENCE_RULES,
          { start: '2026-01-01', phaseDays: 30 });
        out.rows = {
          schedules: A.dbQuery('SELECT COUNT(*) FROM schedules')[0][0],
          tasks: A.dbQuery('SELECT COUNT(*) FROM tasks')[0][0],
          taskElements: A.dbQuery('SELECT COUNT(*) FROM task_elements')[0][0],
        };
        // The SHIPPED re-fold path (§TM-REFOLD, W-TM-REFOLD) — not a hand-rolled DELETE. It drops the
        // IDB 'gantt' cache AND the stale ELEMENT_PLACE ops, so the next activate() re-reads the
        // just-authored tasks through injectGantt's `_cap` instead of replaying the derived fast path
        // (the same short-circuit that produced the _capActive correction above). Using the real verb
        // keeps this a test of the user path, not of a seam the user never touches.
        try { out.refold = window.tmRefoldSchedule(); } catch (e) { out.refoldErr = e.message; }
        out.persisted = true;
        try { window.ScheduleAuthor.persistDb(A.db, A.DB_URL, { immediate: true }); }
        catch (e) { out.persisted = false; out.persistErr = e.message; }
        return out;
      });
      if (pre.err) P('A1 W-SCHED-AUTHOR-ROUNDTRIP', false, pre.err);
      else {
        await sleep(6000);                       // let the debounced IDB write land
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.waitForFunction(() => window.APP && window.APP.dbQuery, { timeout: 300000 });
        await page.waitForFunction(() => {
          try { return window.APP.dbQuery('SELECT COUNT(*) FROM tasks')[0][0] > 0; } catch (e) { return false; }
        }, { timeout: 300000, polling: 2000 });
        await sleep(6000);
        const post = await page.evaluate(async () => {
          const out = {};
          out.activated = await window.tmActivateForBake();
          out.src = window.tmScheduleSource();
          out.st = window.tmOrderBySchedule();
          const pw = window.tmPhaseWindows();
          out.phases = pw.phases.map(p => ({ name: p.name, scheduleStart: p.scheduleStart, n: p.n,
            bound: p.bound, minStart: p.minStart, maxStart: p.maxStart }));
          out.rows = { tasks: window.APP.dbQuery('SELECT COUNT(*) FROM tasks')[0][0],
                       taskElements: window.APP.dbQuery('SELECT COUNT(*) FROM task_elements')[0][0] };
          return out;
        });
        const bad = [];
        for (let i = 0; i + 1 < post.phases.length; i++)
          if (!(post.phases[i].maxStart <= post.phases[i + 1].minStart)) bad.push(post.phases[i].name);
        P('A1 W-SCHED-AUTHOR-ROUNDTRIP',
          pre.before.source === 'derived' && post.src.source === 'captured' &&
          post.st !== null && post.phases.length >= 2 && bad.length === 0,
          `${pre.before.source} -> RELOAD -> ${post.src.source}; authored ${pre.mat.taskCount} phases / ` +
          `${pre.mat.assignmentCount} assignments; after reload tasks=${post.rows.tasks} ` +
          `task_elements=${post.rows.taskElements} covered=${post.src.covered}/${post.src.total} ` +
          `pct=${post.src.pct}%; interleaving pairs=${bad.length}`);
        post.phases.forEach(p => console.log(`       ${String(p.name).padEnd(16)} start=${p.scheduleStart}` +
          ` n=${String(p.n).padStart(5)} bound=${String(p.bound).padStart(5)}` +
          ` ts=[${new Date(p.minStart).toISOString().slice(0, 10)} .. ${new Date(p.maxStart).toISOString().slice(0, 10)}]`));
      }
      await page.close();
    }
  }

  console.log('\n' + '='.repeat(78));
  console.log(`RESULT ${checks.filter(c => c.ok).length}/${checks.length} ${allPass ? 'GREEN' : 'RED'}`);
  console.log('='.repeat(78));
  await browser.close();
  process.exit(allPass ? 0 : 1);
})();
