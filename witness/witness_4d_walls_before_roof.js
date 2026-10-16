// WITNESS — §4D_WALLS_BEFORE_ROOF: #1120 promoted the boxes' roofs and left the roof they stand on.
// Spec: bim-compiler prompts/GANTT_ACCURACY.md §4D_WALLS_BEFORE_ROOF.
//
// THE DEFECT THIS PROVES OR DISPROVES (user, live, MaxQ buildup bake of Hospital, 2026-08-01):
//   "The roof before the walls still happening on the roof top"
// §4D_ROOF_LOAD_PATH (#1120) did NOT fail — the user's own log shows `§GANTT_OVERRIDE 10 slabs
// promoted to roof role (seq=8) by load path`. What it cannot reach is the slab UNDER the two
// helipad boxes whose roofs it promoted: clause (b) ("no XY-overlapping wall may stand on it")
// disqualifies Hospital's 2091.5 m² topmost deck 3Csn1z$1v5Q8DXdumWYJUE (base_z 199.66) because the
// box walls stand on it. MEASURED on origin/main @9945364 (scratchpad/probe_rooftop_main.log):
// that deck starts 2022-07-27 as Superstructure while its 14 wall carriers finish 2023-04-30 —
// 277 days before its own walls, the identical error #1120 reported FIXING for the boxes.
//
// THE FIX (M4/M5/M6, see the spec):
//   M4 — a wall standing on a slab is not "the next storey" if that wall is itself CAPPED by a slab
//        already known to be a roof. Depth 1 on the frozen #1120 seed set: full recursion cascades
//        the whole building to "roof" (measured). Hospital 10 -> 11, the one addition is the
//        user's slab.
//   M5 — a promoted slab waits for its wall carriers by GEOMETRY. Before this its only wall
//        dependency was the per-PHASE trade gate, and 12 of this slab's 14 carriers are phase-key
//        "Level 6" while the slab is "Level 7" — covered by coincidence, not by a rule.
//   M6 — §ROOF_GATE, a role-blind line, so §SUPPORT_CHECK's floating=0 can no longer be the only
//        number (#1120's LIMIT 1: the audit's wall pool is offered ONLY to already-promoted slabs,
//        so a roof it FAILED to promote reads clean — exactly what happened here).
//
//   G-WBR-1  RED->GREEN, the user's slab: starts at/after the last of its 14 wall carriers, and is
//            phase=Architecture. On origin/main it is Superstructure and 277 days early.
//   G-WBR-2  no cascade: §GANTT_OVERRIDE reports 11 (was 10) and the four named controls (Level 6
//            191.66, Level 5 186.66, Level 4 181.66, and #1120's own floor control
//            1OV06Y3c5D8vODNyxVnSVI) are all still NOT promoted.
//   G-WBR-3  the role is still DERIVED, not named: with every storey string blanked, the same slab
//            is still promoted. A name test scores 0 here.
//   G-WBR-4  M5, as a pure-function claim on ScheduleGate.computeSchedule with the trade gate
//            NEUTRALISED (every carrier given a different storey than the slab): real geometry for
//            the slab + its 14 carriers; the slab must still start at/after the last carrier. The
//            pre-M5 gate definition, reproduced inline, fails this on the same input.
//   G-WBR-5  the instrument no longer hides it: §ROOF_GATE present, roof half = 0 (a gate), other
//            half reported non-zero (a measurement, not a gate).
//   G-WBR-6  no regression: placed == total on Hospital AND LTU_AHouse, §SUPPORT_CHECK still 0.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8451;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// The user's slab and its real load path — extracted 2026-08-01 directly from
// buildings/Hospital_extracted.db (elements_meta JOIN element_transforms). Real GUIDs, real geometry.
const ROOF_DECK = '3Csn1z$1v5Q8DXdumWYJUE';          // base_z 199.66, top_z 199.81, 2091.5 m²
const DECK_CARRIERS = ['3064w0y0nDv9wdb1cWL_ja', '3064w0y0nDv9wdb1cWL_ef', '3064w0y0nDv9wdb1cWL_g1',
  '3064w0y0nDv9wdb1cWL_JV', '0o_QWr67L6KuG2qQA6AhrN', '3klE5WDUzALuFQLQUdamb_',
  '0tapine8H8Pw$xCCYysqMV', '3064w0y0nDv9wdb1cWL_Gu', '3064w0y0nDv9wdb1cWL_H0',
  '3Vxmv9vT1DBOVGP9X4HeNy', '3Vxmv9vT1DBOVGP9X4HeLB', '3Vxmv9vT1DBOVGP9X4HeDg',
  '3Vxmv9vT1DBOVGP9X4HeCY', '3Vxmv9vT1DBOVGP9X4HeCq'];
// The three walls STANDING ON the deck — the helipad boxes whose own roofs #1120 promoted. These
// are what clause (b) trips over, and what M4 excuses (each is capped by a seed roof slab).
const DECK_APPURTENANCE_WALLS = ['3eq15PZlbCi8$6xdXFtxz7', '3Vxmv9vT1DBOVGP9X4HeGE',
  '3Vxmv9vT1DBOVGP9X4HeDp'];
// Controls — must stay NOT promoted. Real intermediate floors from the same DB.
const CONTROLS = {
  'Level 6 deck (base_z 191.66, 16 walls above, 3 not capped by a roof)': '0e8pm26Tv5vPrj6zU55MQt',
  'Level 5 deck (base_z 186.66, 54 above, 33 blockers)': '0e8pm26Tv5vPrj6zU55MQv',
  'Level 4 deck (base_z 181.66, 535 above, 514 blockers)': '0e8pm26Tv5vPrj6zU55MQh',
  "#1120's own floor control (base_z 176.81, 5 levels above)": '1OV06Y3c5D8vODNyxVnSVI',
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
const D = ms => new Date(ms).toISOString().slice(0, 10);

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const checks = [];
  let allPass = true;
  const P = (n, ok, d) => { checks.push({ n, ok, d }); if (!ok) allPass = false;
    console.log(`  ${ok ? '✅' : '❌'} ${n}\n        ${d}`); };

  console.log('='.repeat(78) + '\nHospital — G-WBR-1..5\n' + '='.repeat(78));
  const { page, logs } = await open(browser, 'Hospital');

  const res = await page.evaluate(async (deck, carriers, controls, appurt) => {
    const A = window.APP;
    const out = {};
    await window.tmActivateForBake();

    const fetchOps = guids => guids.map(g => {
      const r = A.dbQuery("SELECT timestamp, parameters FROM kernel_ops WHERE output_guid='" + g +
        "' AND op_type='ELEMENT_PLACE'");
      if (!r.length) return { guid: g, missing: true };
      const p = JSON.parse(r[0][1]);
      return { guid: g, start: r[0][0], end: p._end_ts, phase: p.phase, storey: p.storey };
    });
    const fetchGeom = (guids, cls, seq, storey) => guids.map(g => {
      const r = A.dbQuery('SELECT center_x,bbox_x,center_y,bbox_y,center_z,bbox_z ' +
        "FROM element_transforms WHERE guid='" + g + "'");
      const [cx, bx, cy, by, cz, bz] = r[0];
      return { guid: g, cls: cls, seq: seq, storey: storey,
        resource: cls === 'IfcSlab' ? 'CONCRETE_GANG' : 'MASON', installSecs: 120,
        x0: cx - bx / 2, x1: cx + bx / 2, y0: cy - by / 2, y1: cy + by / 2,
        base_z: cz - bz / 2, top_z: cz + bz / 2 };
    });

    out.deck = fetchOps([deck])[0];
    out.carriers = fetchOps(carriers);
    out.appurt = fetchOps(appurt);
    out.controls = {};
    for (const k in controls) out.controls[k] = fetchOps([controls[k]])[0];
    out.total = A.dbQuery("SELECT COUNT(*) FROM elements_meta WHERE ifc_class!='IfcOpeningElement'")[0][0];
    out.placed = A.dbQuery("SELECT COUNT(*) FROM kernel_ops WHERE op_type='ELEMENT_PLACE'")[0][0];

    // ── G-WBR-4: M5 as a pure-function claim, trade gate NEUTRALISED. The slab gets storey
    // "ROOF_PHASE", every carrier a DIFFERENT storey ("CARRIER_PHASE"), so collapsePhase() puts them
    // in separate phase buckets and the per-phase trade gate provably cannot cover them. Crew caps
    // are generous so the isolated subset does not queue. Only a geometric wall gate can hold here.
    const SG = window.ScheduleGate;
    const g4slab = fetchGeom([deck], 'IfcSlab', 8, 'ROOF_PHASE');
    const g4walls = fetchGeom(carriers, 'IfcWallStandardCase', 6, 'CARRIER_PHASE');
    const g4els = g4slab.concat(g4walls);
    const BASE = 1600000000000;
    const s4 = SG.computeSchedule(g4els, BASE, 1, { CONCRETE_GANG: 8, MASON: 8 });
    out.g4 = {
      slabStart: s4[deck].start,
      maxWallEnd: Math.max.apply(null, g4walls.map(w => s4[w.guid].end)),
      base: BASE,
    };
    // The PRE-M5 gate definition, reproduced inline on the same input: the support grid takes only
    // seq<=4, so a wall can never gate anything. This is exactly what origin/main does.
    out.g4pre = (function () {
      const CELL = 4, EPS = 0.05;
      const cellsOf = e => { const o = []; for (let i = Math.floor(e.x0 / CELL); i <= Math.floor(e.x1 / CELL); i++)
        for (let j = Math.floor(e.y0 / CELL); j <= Math.floor(e.y1 / CELL); j++) o.push(i + ',' + j); return o; };
      const ov = (a, b) => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
      const grid = {}, out2 = {};
      const place = (el, start) => { const end = start + 120000; out2[el.guid] = { start, end };
        if (el.seq <= 4) cellsOf(el).forEach(c => (grid[c] = grid[c] || []).push(Object.assign({ end }, el)));
        return end; };
      const geoGate = el => { let g = BASE;
        cellsOf(el).forEach(c => (grid[c] || []).forEach(S => {
          if (S.base_z < el.base_z - EPS && S.end > g && ov(S, el)) g = S.end; })); return g; };
      const nonst = g4els.slice().sort((a, b) => (a.seq - b.seq) || (a.base_z - b.base_z));
      const phaseTrade = {};
      nonst.forEach(el => {
        const ph = SG.collapsePhase(el.storey); const pt = phaseTrade[ph] || {}; let tg = BASE;
        for (const s in pt) if (+s < el.seq && pt[s] > tg) tg = pt[s];
        const end = place(el, Math.max(geoGate(el), tg));
        phaseTrade[ph] = phaseTrade[ph] || {};
        if (!(phaseTrade[ph][el.seq] > end)) phaseTrade[ph][el.seq] = end;
      });
      return { slabStart: out2[deck].start, maxWallEnd: Math.max.apply(null, g4walls.map(w => out2[w.guid].end)) };
    })();

    // ── G-WBR-3: blank every storey string, refold, re-check the same slab ──
    A.db.run("UPDATE elements_meta SET storey=''");
    const before = A.dbQuery("SELECT COUNT(*) FROM kernel_ops WHERE op_type='ELEMENT_PLACE'")[0][0];
    window.tmRefoldSchedule();
    let waited = 0;
    while (waited < 120000) {
      await new Promise(r => setTimeout(r, 1000)); waited += 1000;
      const n = A.dbQuery("SELECT COUNT(*) FROM kernel_ops WHERE op_type='ELEMENT_PLACE'")[0][0];
      if (n >= before) break;
    }
    out.deckBlanked = fetchOps([deck])[0];
    out.waitedMsForRefold = waited;
    return out;
  }, ROOF_DECK, DECK_CARRIERS, CONTROLS, DECK_APPURTENANCE_WALLS);

  // ── G-WBR-1 ──
  const maxCarrierEnd = Math.max(...res.carriers.map(c => c.end));
  const worstCarrier = res.carriers.find(c => c.end === maxCarrierEnd);
  const g1 = res.deck.start >= maxCarrierEnd && res.deck.phase === 'Architecture';
  P('G-WBR-1 the user\'s roof deck no longer starts before the walls that carry it',
    g1,
    `deck ${ROOF_DECK} base_z=199.66 (2091.5 m², the building silhouette): start=${D(res.deck.start)} ` +
    `phase=${res.deck.phase} | 14 wall carriers finish by ${D(maxCarrierEnd)} (last=${worstCarrier.guid}) | ` +
    `margin=${((res.deck.start - maxCarrierEnd) / 86400000).toFixed(0)}d (>=0 required). ` +
    `RED on origin/main @9945364, same DB, same GUIDs (scratchpad/probe_rooftop_main.log): ` +
    `start=2022-07-27 phase=Superstructure vs carriers ending 2023-04-30 = -277d.`);

  // ── G-WBR-2 ──
  const overrideLine = logs.filter(l => l.startsWith('§GANTT_OVERRIDE')).slice(-1)[0] || '';
  const nOverride = +((/§GANTT_OVERRIDE (\d+)/.exec(overrideLine) || [])[1] || -1);
  const ctrlBad = Object.keys(res.controls).filter(k => res.controls[k].phase === 'Architecture');
  P('G-WBR-2 no cascade: §GANTT_OVERRIDE 10 -> 11, and all 4 intermediate-floor controls stay unpromoted',
    nOverride === 11 && ctrlBad.length === 0,
    `§GANTT_OVERRIDE=${nOverride} (11 required: #1120's seed 10 + M4's 1). controls: ` +
    Object.keys(res.controls).map(k => `${k} -> ${res.controls[k].phase}`).join(' | ') +
    ` — any 'Architecture' here means the depth-1 rule cascaded. violations=${ctrlBad.length}`);

  // ── G-WBR-3 ──
  P('G-WBR-3 the role is DERIVED not named: storeys blanked, the same deck is still a roof',
    res.deckBlanked.phase === 'Architecture',
    `waited ${res.waitedMsForRefold}ms for refold; deck phase=${res.deckBlanked.phase} ` +
    `storey=${JSON.stringify(res.deckBlanked.storey)} (a storey-name test scores 0 here)`);

  // ── G-WBR-4 ──
  const g4ok = res.g4.slabStart >= res.g4.maxWallEnd;
  const g4preFails = res.g4pre.slabStart < res.g4pre.maxWallEnd;
  P('G-WBR-4 M5: the wall gate is GEOMETRIC — it holds with the per-phase trade gate neutralised',
    g4ok && g4preFails,
    `ScheduleGate.computeSchedule on the real deck + its 14 carriers, slab storey="ROOF_PHASE" vs ` +
    `carriers "CARRIER_PHASE" (different collapsePhase buckets, so the trade gate CANNOT fire): ` +
    `slabStart=${res.g4.slabStart - res.g4.base}ms maxWallEnd=${res.g4.maxWallEnd - res.g4.base}ms ` +
    `-> holds=${g4ok}. PRE-M5 definition (grid=seq<=4 only) on the SAME input: ` +
    `slabStart=${res.g4pre.slabStart - res.g4.base}ms maxWallEnd=${res.g4pre.maxWallEnd - res.g4.base}ms ` +
    `-> fails=${g4preFails}. Live, 12 of the 14 carriers are phase-key "Level 6" vs the deck's ` +
    `"Level 7", so the trade gate never covered them.`);

  // ── G-WBR-5 ──
  const roofGateLine = logs.filter(l => l.startsWith('§ROOF_GATE')).slice(-1)[0] || '';
  const rg = /roofSlabs=(\d+) lateVsWallCarriers=(\d+).*otherSlabs=(\d+) lateVsWallCarriers=(\d+)/.exec(roofGateLine);
  const supportLineHosp = logs.filter(l => l.startsWith('§SUPPORT_CHECK')).slice(-1)[0] || '';
  P('G-WBR-5 M6: the role-blind §ROOF_GATE exists, its roof half is 0, its other half is reported not hidden',
    !!rg && +rg[2] === 0 && +rg[4] > 0,
    `"${roofGateLine || 'MISSING'}" — roof half must be 0 (a gate), other half must be a reported ` +
    `non-zero (a measurement: ordinary floors legitimately precede their partitions). ` +
    `Meanwhile §SUPPORT_CHECK reads "${supportLineHosp}" — it read floating=0 on origin/main too, ` +
    `on the very run the user was complaining about. That is #1120's LIMIT 1, now visible.`);

  const hospFloating = +((/floating=(\d+)/.exec(supportLineHosp) || [])[1] ?? -1);
  const hospTotalOk = res.total === res.placed;
  await page.close();

  // ══════════════ LTU_AHouse — G-WBR-6 second building ══════════════
  console.log('\n' + '='.repeat(78) + '\nLTU_AHouse — G-WBR-6 regression\n' + '='.repeat(78));
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
  const roofGateLtu = logs2.filter(l => l.startsWith('§ROOF_GATE')).slice(-1)[0] || '';
  const ltuFloating = +((/floating=(\d+)/.exec(supportLineLtu) || [])[1] ?? -1);
  const ltuRoofLate = +((/roofSlabs=\d+ lateVsWallCarriers=(\d+)/.exec(roofGateLtu) || [])[1] ?? -1);
  await page2.close();

  P('G-WBR-6 no regression: total ops == total elements on both buildings (nothing dropped)',
    hospTotalOk && res2.total === res2.placed,
    `Hospital placed=${res.placed}/${res.total} | LTU_AHouse placed=${res2.placed}/${res2.total}`);
  P('G-WBR-6 §SUPPORT_CHECK still 0 on both, and §ROOF_GATE\'s roof half is 0 on both',
    hospFloating === 0 && ltuFloating === 0 && ltuRoofLate === 0,
    `Hospital: ${supportLineHosp || 'MISSING'}\n        LTU_AHouse: ${supportLineLtu || 'MISSING'}` +
    `\n        LTU_AHouse §ROOF_GATE: ${roofGateLtu || 'MISSING'}`);

  await browser.close();
  console.log('\n' + '='.repeat(78));
  console.log(`RESULT ${checks.filter(c => c.ok).length}/${checks.length} ${allPass ? 'ALL GREEN' : 'RED'}`);
  console.log('='.repeat(78));
  process.exit(allPass ? 0 : 1);
})();
