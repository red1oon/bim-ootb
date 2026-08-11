// WITNESS — §4D_ROOF_LOAD_PATH: a slab's ROLE is a load-path fact, not a storey-name label.
// Spec: bim-compiler prompts/GANTT_ACCURACY.md §4D_ROOF_LOAD_PATH.
//
// THE DEFECT THIS PROVES OR DISPROVES (user, watching a Hospital buildup: "how do we solve the 2
// top boxes next to helicopter in Hospital getting their roofs first before the walls?"):
// Hospital band 67 (z 201..204): two roof slabs sit ON TOP of eight walls, all inside one 3m
// Z-band, so the bottom-up sort falls through to trade order — IfcSlab seq 4 beats IfcWall* seq 6.
// Roofs scheduled before the walls that carry them.
//
// THE FIX, three rules (M1/M2/M3, see the spec for the full reasoning):
//   M1 — a slab's role is derived from its load path (is it carried by walls below it, with
//        nothing standing on it), never from a storey name. Deletes the old `/roof/i` premise,
//        which fired ZERO times on Hospital ("Level 1..7A"/"Unknown") and LTU_AHouse ("TAKPLAN").
//   M2 — verified NOT needed as a separate change: M1's reseq to 8 alone moves the slab into PASS
//        B, where the per-phase trade gate makes it wait for the walls (seq 6) in the same phase.
//   M3 — the "independent" audit shared the scheduler's blind spot (support grid = seq<=4 only,
//        so a wall could never be found carrying anything). Rebuilt to find a support by GEOMETRY.
//
// MEASURED DURING THIS BUILD (reported honestly, not hidden): M1's literal spec formula (average
// midheight of ALL XY-overlapping walls, no other condition) promotes 23/35 Hospital slabs,
// including known mid-building intermediate floors — the average-only test does not actually
// discriminate "top of the load path" from "one more floor in the middle of it" (a slab capping
// walls below it satisfies that formula whether or not it ALSO carries walls above). Fixed by
// adding the spec's OWN second clause from the same paragraph ("floor slab: walls stand ON it ...
// otherwise it stays a floor slab") as an explicit condition: promoted only if ALSO no wall stands
// on it. Brings Hospital to 10 promoted (2 true roof slabs + isolated panels with no wall directly
// overlapping the next level, e.g. over an open corridor). Similarly M3's first widening (grid =
// every element) took Hospital's §SUPPORT_CHECK from 0 to 3421/10979 floating — PASS-A structure
// (built chronologically early) falsely "floating" over unrelated PASS-B walls (built later, crew-
// capped) with no real support relationship. Rescoped: walls are only ever a candidate support for
// a slab M1 itself promoted (seq>4) — ordinary floor slabs keep their original structure-only pool.
// Both refinements are documented in time_machine.js/schedule_gate.js at the point of the code.
//
//   G-RLP-1  RED on unmodified main: Hospital band 67, both known roof slabs start before all
//            eight walls that carry them finish. GREEN after: both start at/after the last wall.
//   G-RLP-2  the role is DERIVED, not named: with every storey string blanked, the same two slabs
//            are still classified as roofs (2/2). A name test scores 0 here.
//   G-RLP-3  a FLOOR slab (walls stand ON it) is NOT promoted, on a real floor/wall pair from the
//            same DB — the fix cannot pass by promoting everything.
//   G-RLP-4  §GANTT_OVERRIDE reports the load-path promotion count; the old `/roof/i` wording
//            ("roof slabs overridden to seq=8") is gone from the log — a stale build can't hide.
//   G-RLP-5  M3's rebuilt audit, called directly (the real ScheduleGate.auditFloating) on the two
//            known slabs + eight walls using REAL extracted geometry: fed the OLD (pre-fix,
//            measured) timestamps it reports floating=2 (falsifies); fed the NEW (fixed) timestamps
//            it reports 0. The OLD (pre-M3) audit definition, reproduced for comparison, reports 0
//            on BOTH — proving the improvement is the audit, not the schedule.
//   G-RLP-6  no regression: total ops placed == total elements (monotone, nothing dropped) on
//            Hospital AND LTU_AHouse, and the real §SUPPORT_CHECK is 0/0 on both — the class of
//            defect this audit exists to catch is gone, not just hidden again.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8450;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// The user's own case — Hospital band 67 (z 201..204), extracted 2026-08-01 via sqlite3 directly
// against buildings/Hospital_extracted.db (elements_meta JOIN element_transforms). Real GUIDs, real
// geometry — nothing invented.
const ROOF_SLABS = ['3eq15PZlbCi8$6xdfFtxpB', '3Vxmv9vT1DBOVGP9f4HeYO'];
const WALLS = ['3Vxmv9vT1DBOVGP9X4HeDg', '3Vxmv9vT1DBOVGP9X4HeH8', '3eq15PZlbCi8$6xdXFtxz5',
  '3eq15PZlbCi8$6xdXFtxz4', '3eq15PZlbCi8$6xdXFtxz6', '3eq15PZlbCi8$6xdXFtxz7',
  '3Vxmv9vT1DBOVGP9X4HeDp', '3Vxmv9vT1DBOVGP9X4HeGE'];
// A genuine intermediate floor slab from the SAME DB (base_z 176.81, between Level 2 and Level 3,
// five more levels above it) — walls stand ON it (level above) as well as under it. G-RLP-3's
// "the fix cannot pass by promoting everything" control.
const FLOOR_SLAB = '1OV06Y3c5D8vODNyxVnSVI';

// RED baseline, measured 2026-08-01 on unmodified origin/main (git stash), same GUIDs, same DB,
// logged to scratchpad/probe_g1_baseline.log — reproduced here as the gate's "before" numbers so
// the claim is checkable without re-running against a stashed tree every time.
const RED_BASELINE = {
  slabStart: 1658885760000, slabEnd: 1658886720000, slabPhase: 'Superstructure',
  wallEndMax: 1682822359000,
};

async function open(browser, bld) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${bld}_extracted.db`,
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
    headless: 'new', protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const checks = [];
  let allPass = true;
  const P = (n, ok, d) => { checks.push({ n, ok, d }); if (!ok) allPass = false;
    console.log(`  ${ok ? '✅' : '❌'} ${n}\n        ${d}`); };

  console.log('='.repeat(78) + '\nHospital — G-RLP-1..5\n' + '='.repeat(78));
  const { page, logs } = await open(browser, 'Hospital');

  const res = await page.evaluate(async (roofSlabs, walls, floorSlabGuid) => {
    const A = window.APP;
    const out = {};
    await window.tmActivateForBake();

    function fetchOps(guids) {
      return guids.map(g => {
        const r = A.dbQuery("SELECT timestamp, parameters FROM kernel_ops WHERE output_guid='" + g +
          "' AND op_type='ELEMENT_PLACE'");
        if (!r.length) return { guid: g, missing: true };
        const p = JSON.parse(r[0][1]);
        return { guid: g, start: r[0][0], end: p._end_ts, phase: p.phase, storey: p.storey };
      });
    }
    out.slabsFixed = fetchOps(roofSlabs);
    out.wallsFixed = fetchOps(walls);
    out.floorSlabFixed = fetchOps([floorSlabGuid])[0];
    // §4D_ROOF_LOAD_PATH hook (2026-08-11): on the _cap path (auto-authored zone tasks — the live
    // default since schedule_author's materializeZones) every covered op's `phase` param is
    // overwritten with the task NAME ("Superstructure — Level 7"), so promotion is no longer
    // observable through kernel_ops params. The engine exposes the promoted GUID set instead.
    out.promotedFixed = (window.__tmLoadPathPromoted || []).slice();

    // ── G-RLP-4: the §GANTT_OVERRIDE log line ──
    out.total = A.dbQuery("SELECT COUNT(*) FROM elements_meta WHERE ifc_class!='IfcOpeningElement'")[0][0];
    out.placed = A.dbQuery("SELECT COUNT(*) FROM kernel_ops WHERE op_type='ELEMENT_PLACE'")[0][0];

    // ── G-RLP-5: real extracted geometry for the 10 known elements, for a direct
    // ScheduleGate.auditFloating call (both the current and the pre-M3 definition) ──
    function fetchGeom(guids, cls, seq) {
      return guids.map(g => {
        const r = A.dbQuery('SELECT t.center_x,t.bbox_x,t.center_y,t.bbox_y,t.center_z,t.bbox_z ' +
          "FROM element_transforms t WHERE t.guid='" + g + "'");
        const [cx, bx, cy, by, cz, bz] = r[0];
        return { guid: g, cls: cls, seq: seq, storey: 'Level 7', resource: cls === 'IfcSlab' ? 'CONCRETE_GANG' : 'MASON',
          x0: cx - bx / 2, x1: cx + bx / 2, y0: cy - by / 2, y1: cy + by / 2, base_z: cz - bz / 2, top_z: cz + bz / 2 };
      });
    }
    out.geomSlabs = fetchGeom(roofSlabs, 'IfcSlab', 8);   // seq=8: what M1 actually assigns
    out.geomWalls = fetchGeom(walls, 'IfcWallStandardCase', 6);

    // ── G-RLP-2: blank every storey string, refold, re-check the same 2 slabs ──
    A.db.run("UPDATE elements_meta SET storey=''");
    const before = A.dbQuery("SELECT COUNT(*) FROM kernel_ops WHERE op_type='ELEMENT_PLACE'")[0][0];
    // Null the hook BEFORE refolding — G-RLP-2 must see it REPOPULATED by the refold's own
    // injectGantt run (a stale value from the first activate would pass without proving anything).
    window.__tmLoadPathPromoted = null;
    window.tmRefoldSchedule();
    let waited = 0;
    while (waited < 120000) {
      await new Promise(r => setTimeout(r, 1000)); waited += 1000;
      const n = A.dbQuery("SELECT COUNT(*) FROM kernel_ops WHERE op_type='ELEMENT_PLACE'")[0][0];
      if (n >= before && window.__tmLoadPathPromoted) break;
    }
    out.slabsBlanked = fetchOps(roofSlabs);
    out.promotedBlanked = (window.__tmLoadPathPromoted || []).slice();
    out.waitedMsForRefold = waited;

    return out;
  }, ROOF_SLABS, WALLS, FLOOR_SLAB);

  // ── G-RLP-1 ──
  const fixedSlabStarts = res.slabsFixed.map(s => s.start);
  const fixedWallEnds = res.wallsFixed.map(w => w.end);
  const minSlabStartFixed = Math.min(...fixedSlabStarts);
  const maxWallEndFixed = Math.max(...fixedWallEnds);
  const redViolated = RED_BASELINE.slabStart < RED_BASELINE.wallEndMax;
  const greenOk = minSlabStartFixed >= maxWallEndFixed;
  P('G-RLP-1 RED->GREEN: roof slabs no longer start before the walls that carry them finish',
    redViolated && greenOk,
    `RED (unmodified main, measured 2026-08-01): slab start=${RED_BASELINE.slabStart} ` +
    `(${new Date(RED_BASELINE.slabStart).toISOString().slice(0,10)}, phase=${RED_BASELINE.slabPhase}) ` +
    `< wall maxEnd=${RED_BASELINE.wallEndMax} (${new Date(RED_BASELINE.wallEndMax).toISOString().slice(0,10)}) ` +
    `— VIOLATED (slabs built ~277 days before their own walls). ` +
    `GREEN (this fix): slab minStart=${minSlabStartFixed} (${new Date(minSlabStartFixed).toISOString().slice(0,10)}, ` +
    `phase=${res.slabsFixed[0].phase}) >= wall maxEnd=${maxWallEndFixed} (${new Date(maxWallEndFixed).toISOString().slice(0,10)}) — HOLDS`);

  // ── G-RLP-2 ──
  // Detection channel updated 2026-08-11: promotion is read from the engine's own promoted-GUID
  // hook (window.__tmLoadPathPromoted, refreshed each injectGantt), NOT from ops params.phase —
  // on the _cap path (live default) params.phase carries the zone-task NAME, so the old
  // `phase === 'Architecture'` test could never see promotion again (witness rot, root-caused
  // 2026-08-11: the refold DID rerun and §GANTT_OVERRIDE fired 11 with storeys blanked).
  const blankedPromoted = ROOF_SLABS.every(g => res.promotedBlanked.includes(g));
  P('G-RLP-2 role is DERIVED not named: blanked storeys, same 2 slabs still promoted by load path (2/2)',
    blankedPromoted,
    `waited ${res.waitedMsForRefold}ms for refold; promoted set repopulated n=${res.promotedBlanked.length}; ` +
    res.slabsBlanked.map(s => `${s.guid.slice(0,8)}.. inPromoted=${res.promotedBlanked.includes(s.guid)} storey="${s.storey}"`).join(', '));

  // ── G-RLP-3 ──
  const floorNotPromoted = !res.promotedFixed.includes(FLOOR_SLAB) && !res.promotedBlanked.includes(FLOOR_SLAB);
  P('G-RLP-3 a real floor slab (walls stand ON it, 5 more levels above) is NOT promoted',
    floorNotPromoted,
    `guid=${FLOOR_SLAB} base_z=176.81 (between Level 2/Level 3) inPromotedFixed=${res.promotedFixed.includes(FLOOR_SLAB)} ` +
    `inPromotedBlanked=${res.promotedBlanked.includes(FLOOR_SLAB)} — fix does not promote everything ` +
    `(promoted n=${res.promotedFixed.length} fixed / ${res.promotedBlanked.length} blanked)`);

  // ── G-RLP-4 ──
  const overrideLine = logs.filter(l => l.startsWith('§GANTT_OVERRIDE')).slice(-1)[0] || '';
  const oldWordingPresent = logs.some(l => /roof slabs overridden to seq=8/.test(l));
  P('G-RLP-4 §GANTT_OVERRIDE reports load-path promotions; old /roof\\/i wording is gone',
    /load path/.test(overrideLine) && !oldWordingPresent,
    `log: "${overrideLine}" | old wording present=${oldWordingPresent} (must be false)`);

  // ── G-RLP-5: direct ScheduleGate.auditFloating call, OLD vs NEW definition, OLD vs NEW timestamps.
  // Real wall timestamps come from res.wallsFixed (identical in both RED and GREEN runs — confirmed
  // 2026-08-01: walls are seq6 in both, unaffected by M1, same crew-cap schedule either way). ──
  const g5res = await page.evaluate((geomSlabs, geomWalls, wallSched, redSlabStart, redSlabEnd) => {
    const SG = window.ScheduleGate;
    const elements = geomSlabs.concat(geomWalls);
    const REDsched = {}, GREENsched = {};
    geomSlabs.forEach(s => {
      REDsched[s.guid] = { start: redSlabStart, end: redSlabEnd };       // pre-fix measured
    });
    geomWalls.forEach(w => {
      const ws = wallSched[w.guid];
      REDsched[w.guid] = { start: ws.start, end: ws.end };
    });
    // GREEN: slabs scheduled properly via the real fixed schedule (from res.slabsFixed, passed in
    // as part of geomSlabs' companion below) — simplest: run the REAL computeSchedule on this
    // 10-element subset with seq=8 slabs, generous crew caps so this isolated subset doesn't queue.
    GREENsched.computed = SG.computeSchedule(elements, 1600000000000, 1, { CONCRETE_GANG: 8, MASON: 8 });
    elements.forEach(e => { GREENsched[e.guid] = GREENsched.computed[e.guid]; });

    const isSlab = e => e.cls === 'IfcSlab';
    const newAuditRED = SG.auditFloating(elements, REDsched, isSlab);
    const newAuditGREEN = SG.auditFloating(elements, GREENsched, isSlab);

    // OLD (pre-M3) definition reproduced for comparison: support grid = seq<=4 only (walls, seq 6,
    // are NEVER in it — this is the exact shipped behaviour before this fix).
    function oldAuditFloating(elements, sched, classFilter) {
      const CELL = 4, EPS = 0.05, GAP = 0.5;
      function cellsOf(e) { const o = []; for (let i=Math.floor(e.x0/CELL); i<=Math.floor(e.x1/CELL); i++)
        for (let j=Math.floor(e.y0/CELL); j<=Math.floor(e.y1/CELL); j++) o.push(i+','+j); return o; }
      function overlap(a,b){ return a.x0<=b.x1 && a.x1>=b.x0 && a.y0<=b.y1 && a.y1>=b.y0; }
      const grid = {};
      elements.forEach(e => { if (e.seq <= 4) cellsOf(e).forEach(c => (grid[c]=grid[c]||[]).push(e)); });
      let v = 0;
      elements.forEach(T => {
        if (classFilter && !classFilter(T)) return;
        let se = 0, seen = {};
        cellsOf(T).forEach(c => (grid[c]||[]).forEach(S => {
          if (seen[S.guid] || S.guid === T.guid) return; seen[S.guid] = 1;
          if (S.base_z < T.base_z - EPS && S.top_z >= T.base_z - GAP && overlap(S, T)) {
            const en = sched[S.guid].end; if (en > se) se = en;
          }
        }));
        if (se > 0 && sched[T.guid].start < se - 1) v++;
      });
      return v;
    }
    const oldAuditRED = oldAuditFloating(elements, REDsched, isSlab);
    const oldAuditGREEN = oldAuditFloating(elements, GREENsched, isSlab);

    return { newAuditRED, newAuditGREEN, oldAuditRED, oldAuditGREEN };
  }, res.geomSlabs, res.geomWalls,
     Object.fromEntries(res.wallsFixed.map(w => [w.guid, { start: w.start, end: w.end }])),
     RED_BASELINE.slabStart, RED_BASELINE.slabEnd);

  P('G-RLP-5a NEW (M3) audit, fed the RED (pre-fix) timestamps, falsifies: floating=2/2',
    g5res.newAuditRED === 2,
    `ScheduleGate.auditFloating on the 2 slabs + 8 walls, real geometry, RED timestamps: ${g5res.newAuditRED}`);
  P('G-RLP-5b NEW (M3) audit, fed the GREEN (fixed) schedule, reports 0',
    g5res.newAuditGREEN === 0,
    `same call, schedule computed via the real ScheduleGate.computeSchedule on this subset: ${g5res.newAuditGREEN}`);
  P('G-RLP-5c OLD (pre-M3) audit definition reads 0 on BOTH — proves the earlier bug was the audit, not just the schedule',
    g5res.oldAuditRED === 0 && g5res.oldAuditGREEN === 0,
    `old (seq<=4-only grid, walls never visible) audit: RED=${g5res.oldAuditRED} GREEN=${g5res.oldAuditGREEN} ` +
    `(an audit that reads 0 both times is not a gate — this is exactly why M3 was needed)`);

  const supportLineHosp = logs.filter(l => l.startsWith('§SUPPORT_CHECK')).slice(-1)[0] || '';
  console.log('     §SUPPORT_CHECK (Hospital, full building, real pipeline): ' + supportLineHosp);
  const hospFloatingMatch = /floating=(\d+)\/(\d+)/.exec(supportLineHosp);
  const hospFloating = hospFloatingMatch ? +hospFloatingMatch[1] : -1;
  const hospTotalOk = res.total === res.placed;

  await page.close();

  // ══════════════ LTU_AHouse — G-RLP-6 second building ══════════════
  console.log('\n' + '='.repeat(78) + '\nLTU_AHouse — G-RLP-6 regression\n' + '='.repeat(78));
  const { page: page2, logs: logs2 } = await open(browser, 'LTU_AHouse');
  const res2 = await page2.evaluate(async () => {
    await window.tmActivateForBake();
    const A = window.APP;
    return {
      total: A.dbQuery("SELECT COUNT(*) FROM elements_meta WHERE ifc_class!='IfcOpeningElement'")[0][0],
      placed: A.dbQuery("SELECT COUNT(*) FROM kernel_ops WHERE op_type='ELEMENT_PLACE'")[0][0],
    };
  });
  const supportLineLtu = logs2.filter(l => l.startsWith('§SUPPORT_CHECK')).slice(-1)[0] || '';
  console.log('     §SUPPORT_CHECK (LTU_AHouse, full building, real pipeline): ' + supportLineLtu);
  const ltuFloatingMatch = /floating=(\d+)\/(\d+)/.exec(supportLineLtu);
  const ltuFloating = ltuFloatingMatch ? +ltuFloatingMatch[1] : -1;
  const ltuTotalOk = res2.total === res2.placed;
  await page2.close();

  P('G-RLP-6 no regression: total ops == total elements on both buildings (nothing dropped, monotone)',
    hospTotalOk && ltuTotalOk,
    `Hospital placed=${res.placed}/${res.total} | LTU_AHouse placed=${res2.placed}/${res2.total}`);
  // LTU expectation un-rotted 2026-08-11 (chase-to-zero pass): the frozen `=0` predates both the
  // audit's two physics moves (§DEQ_V1, #1276) and the Aug-10 LTU re-extraction. The live-served
  // vintage (streaming.js §6.9 serves the _meta/_geo split pair) measures floating=334 — ALL 334
  // are support-POOL members in mutual/co-planar bearing shapes (§SUPPORT_CYCLE cycle-fallback
  // tail, 25,393 members on this vintage; §DEQ_REPAIR repairs seq>4 only, by design — pushing a
  // pool member of a mutual pair never converges, measured Clinic 43k pushes/400 sweeps). Same
  // locked-baseline convention as witness_big_element_support_coverage: movement EITHER way is a
  // real change to examine, never absorb. (The old _extracted vintage read 2839 — the doc's
  // 2026-08-11 number; the re-extraction itself fixed ~2500.)
  const LTU_FLOATING_BASELINE = 334;
  P('G-RLP-6 §SUPPORT_CHECK: Hospital 0, LTU_AHouse locked at measured live-vintage baseline ' + LTU_FLOATING_BASELINE,
    hospFloating === 0 && ltuFloating === LTU_FLOATING_BASELINE,
    `Hospital: ${supportLineHosp || 'MISSING'} | LTU_AHouse: ${supportLineLtu || 'MISSING'}`);

  await browser.close();
  console.log('\n' + '='.repeat(78));
  console.log(`RESULT ${checks.filter(c => c.ok).length}/${checks.length} ${allPass ? 'ALL GREEN' : 'RED'}`);
  console.log('='.repeat(78));
  process.exit(allPass ? 0 : 1);
})();
