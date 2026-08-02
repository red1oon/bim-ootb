// §21.29 §APERTURE_TIER WITNESS — where does the doorway hole come from, and does knowing that
// buy anything? Tests written BEFORE the code, per §21.14 (that discipline caught all three of
// §21.27's carving bugs; two of them presented as clean-looking numbers, not as errors).
//
// The question this exists to settle, in the user's own framing: the aperture rule has to "generally
// apply to most IFCs a user may import." Measured over the shipped fleet, only 1 of 9 buildings
// carries IfcOpeningElement at all — so opening geometry can only ever be an UPGRADE over a
// door-bbox floor, never the method. Three tiers, one output shape, best-available wins.
//
// WHAT EACH TEST PROVES OR DISPROVES:
//   T1 TIER FIDELITY — does the resolver report the provenance the DATA actually has? LTU must show
//      a real tier-B population and Clinic must show NONE (it has zero openings). If Clinic reports
//      any tier B, the resolver is inventing apertures, and every number after it is worthless.
//   T2 NON-REGRESSION ON TIER C — Clinic can only ever be tier C, so tier C must reproduce §21.27
//      exactly: door centres 0% blocked, enclosure intact. This is the guarantee that the 8
//      opening-less buildings cannot be made worse by a feature they cannot use.
//   T3 DOES TIER B BEAT TIER C? The decisive one. LTU's 107 stranded rooms (§21.28) were counted on
//      a bbox-carved substrate. Under real apertures they must FALL. If they do not move, §21.28's
//      cause (2) — "a door exists but its carve did not pierce the host wall" — is REFUTED, and the
//      effort belongs on causes (1) and (3). That is a result, not a failure, and is recorded as one.
//   T4 NO NEW LEAK — 'cur' admits every floor-level ARC opening, including LTU's 1,250 unhosted ones
//      (125 at >=2.0 m, up to 25 m and 55 m across: atrium/stair/facade voids, not doorways).
//      Carving one along a facade removes a long run of exterior wall. Leak signature = ONE pocket
//      swallowing the plan; total area alone cannot tell a leak from a legitimately different raster.
//   T5 ENCLOSURE RETENTION — added after the first run, because T4 PASSED while the shipped 'cur'
//      mode was destroying 57% of LTU's enclosed floor (22,311 -> 9,696 m²). The largest-pocket
//      leak signature cannot see that failure at all: carving an exterior wall does not merge
//      pockets into one giant region, it lets the flood ESCAPE, and the floor silently stops being
//      enclosed. So retention is its own gate: carved enclosed area must stay >=90% of uncarved.
//      This is the gate §21.27 needed and did not have — its G3 printed the number and accepted it.
//
// PASS-CONDITION HONESTY: T3's first version passed on any fall at all, and the run produced
// 320 -> 319, one room. That is noise dressed as a result. The threshold below is now MATERIAL
// (>=10%), and the change is recorded here rather than made silently after seeing the number.
const fs = require('fs'), path = require('path');
const WT = path.resolve(__dirname);
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const RW = require(path.join(WT, 'viewer/lib/room_walker.js'));
const BLD = path.join(process.env.HOME, 'bim-ootb', 'buildings');
const quiet = fn => { const rl = console.log; console.log = () => {}; try { return fn(); } finally { console.log = rl; } };

// Fleet-wide provenance census, straight from the DB — this is the fact that forced the tier design.
function census(db) {
  const q = s => { const r = db.exec(s); return r.length ? r[0].values[0][0] : 0; };
  return {
    doors: q("SELECT COUNT(*) FROM elements_meta WHERE ifc_class LIKE 'IfcDoor%'"),
    openings: q("SELECT COUNT(*) FROM elements_meta WHERE ifc_class LIKE 'IfcOpening%'"),
    // tier A source: import_worker.js writes VOIDS/FILLS into bom_tree for user imports.
    bomTree: q("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='bom_tree'"),
  };
}
function tierA(db) {
  try {
    const r = db.exec("SELECT rel_type, COUNT(*) FROM bom_tree WHERE rel_type IN ('VOIDS','FILLS') GROUP BY 1");
    if (!r.length) return { VOIDS: 0, FILLS: 0 };
    const o = { VOIDS: 0, FILLS: 0 }; r[0].values.forEach(v => o[v[0]] = v[1]); return o;
  } catch (e) { return { VOIDS: 0, FILLS: 0 }; }
}

// Count what each tier ADMITS, so T1's fidelity claim is read off the resolver, not assumed.
function admitted(db, anchors, mode) {
  const by = RW.storeyVoids(db, anchors, mode);
  let doors = 0, openings = 0;
  Object.keys(by).forEach(st => by[st].forEach(v => { if (v[6]) { if (v[5]) doors++; else openings++; } }));
  return { doors, openings };
}

function measure(db, mode) {
  const anch = RW.storeyZAnchors(db);
  const doorsBy = RW.storeyDoors(db, anch);
  const map = quiet(() => RW.spineMap(db, { voidMode: mode }));
  let tot = 0, blk = 0, wall = 0, encl = 0, biggest = 0, planCells = 0;
  let rooms = 0, stranded = 0, pairs = 0, bad = 0, spineA = 0, intA = 0;
  Object.keys(map).forEach(st => {
    const m = map[st], g = m.grid;
    for (let k = 0; k < g.raw.length; k++) { if (g.raw[k]) wall++; if (g.enclosed[k]) encl++; }
    planCells += g.nx * g.ny;
    m.pockets.forEach(pk => { if (pk.area > biggest) biggest = pk.area; });
    (doorsBy[st] || []).forEach(d => {
      tot++;
      const i2 = Math.floor((d[0] - g.xs0) / RW.RES), j2 = Math.floor((d[1] - g.ys0) / RW.RES);
      if (i2 < 0 || i2 >= g.nx || j2 < 0 || j2 >= g.ny) return;
      if (g.raw[i2 * g.ny + j2]) blk++;
    });
    if (!m.pockets.length) return;
    spineA += m.spineArea; intA += m.interiorArea;
    const others = m.groups.filter(x => x.id !== m.spineGroup);
    rooms += others.length;
    stranded += others.filter(x => x.depth === -1 && x.area >= 2.0).length;
    // same union-find as spine_first.js §S4 — identical arithmetic, so the numbers are comparable
    const ids = m.groups.map(x => x.id), p = {}; ids.forEach(i2 => p[i2] = i2);
    const find = a => { while (p[a] !== a) { p[a] = p[p[a]]; a = p[a]; } return a; };
    m.links.forEach(l => { const ra = find(l.a), rb = find(l.b); if (ra !== rb) p[ra] = rb; });
    const sz = {}; ids.forEach(i2 => { const r = find(i2); sz[r] = (sz[r] || 0) + 1; });
    const n = ids.length, t = n * (n - 1) / 2;
    const same = Object.values(sz).reduce((s, k) => s + k * (k - 1) / 2, 0);
    pairs += t; bad += t - same;
  });
  const A = c => c * RW.RES * RW.RES;
  return {
    blockedPct: tot ? 100 * blk / tot : 0, wall: A(wall), encl: A(encl),
    biggest, planPct: 100 * biggest / Math.max(1, A(planCells)),
    rooms, stranded, unroutable: 100 * bad / Math.max(1, pairs),
    spinePct: 100 * spineA / Math.max(1e-6, intA),
  };
}

(async () => {
  const SQL = await initSqlJs();
  const FLEET = ['Clinic_extracted.db', 'Duplex_extracted.db', 'HHS_Office_Federated_extracted.db',
    'Hospital_extracted.db', 'JKR_extracted.db', 'Terminal_extracted.db', 'LTU_AHouse_extracted.db'];

  console.log('===== §APERTURE_CENSUS — the fact that forces the tier design =====');
  let withOpenings = 0, withA = 0, n = 0;
  for (const f of FLEET) {
    const fp = path.join(BLD, f); if (!fs.existsSync(fp) || !fs.statSync(fp).size) continue;
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(fp)));
    const c = census(db), a = tierA(db); n++;
    if (c.openings > 0) withOpenings++;
    if (a.VOIDS > 0 || a.FILLS > 0) withA++;
    console.log('§APERTURE_CENSUS ' + f.replace('_extracted.db', '').padEnd(22) +
      ' doors=' + String(c.doors).padStart(4) + '  IfcOpeningElement=' + String(c.openings).padStart(5) +
      '  bom_tree=' + (c.bomTree ? 'yes' : 'no ') + ' VOIDS=' + a.VOIDS + ' FILLS=' + a.FILLS);
    db.close();
  }
  console.log('§APERTURE_CENSUS TOTAL buildings=' + n + '  with opening geometry (tier B possible)=' +
    withOpenings + '  with VOIDS/FILLS (tier A possible)=' + withA);
  console.log('  -> tier C (IfcDoor bbox) is the only source available on ' + (n - withOpenings) +
    '/' + n + ' buildings. It cannot be removed.');

  for (const f of ['Clinic_extracted.db', 'LTU_AHouse_extracted.db']) {
    console.log('\n================ ' + f + ' ================');
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD, f))));
    const anch = RW.storeyZAnchors(db);

    // ---- T1 TIER FIDELITY
    const adm = {};
    ['cur', 'B', 'C'].forEach(m => adm[m] = admitted(db, anch, m));
    console.log('§APERTURE_TIER  cur: doors=' + adm.cur.doors + ' openings=' + adm.cur.openings +
      '   |  B: doors=' + adm.B.doors + ' openings=' + adm.B.openings +
      '   |  C: doors=' + adm.C.doors + ' openings=' + adm.C.openings);
    const isClinic = f[0] === 'C';
    const t1 = isClinic
      ? (adm.cur.openings === 0 && adm.B.openings === 0 && adm.C.openings === 0)
      : (adm.B.openings > 0 && adm.B.openings < adm.cur.openings && adm.C.openings === 0);
    console.log('§T1 TIER FIDELITY ' + (t1 ? 'PASS' : 'FAIL') + ' — ' + (isClinic
      ? 'Clinic has no opening geometry; no tier admitted one (would be invention)'
      : 'LTU: tier B admits door-hosted openings only, strictly fewer than cur, and tier C admits none'));

    // ---- T2/T3/T4 — one raster build per mode, all downstream numbers from it
    const R = {};
    ['cur', 'B', 'C'].forEach(m => { R[m] = measure(db, m); });
    ['cur', 'B', 'C'].forEach(m => {
      const r = R[m];
      console.log('  ' + ('tier ' + m).padEnd(9) +
        ' doorCentresOnWall=' + r.blockedPct.toFixed(0) + '%' +
        '  wall=' + r.wall.toFixed(0) + 'm²  enclosed=' + r.encl.toFixed(0) + 'm²' +
        '  largestPocket=' + r.biggest.toFixed(0) + 'm² (' + r.planPct.toFixed(1) + '% of plan)' +
        '  spine=' + r.spinePct.toFixed(0) + '%' +
        '  stranded=' + r.stranded + '/' + r.rooms +
        '  unroutable=' + r.unroutable.toFixed(1) + '%');
    });

    // T2 — tier C must be a working raster, not a degenerate one
    const t2 = R.C.blockedPct < 5 && R.C.encl > 0 && R.C.planPct < 60;
    console.log('§T2 TIER-C NON-REGRESSION ' + (t2 ? 'PASS' : 'FAIL') +
      ' — doorCentresOnWall=' + R.C.blockedPct.toFixed(0) + '% (must be <5), enclosed=' +
      R.C.encl.toFixed(0) + 'm², largestPocket=' + R.C.planPct.toFixed(1) + '% of plan (must be <60)');

    // T3 — the decisive comparison. Only meaningful where tier B differs from tier C at all.
    if (adm.B.openings > 0) {
      // MATERIAL fall required — a 1-room delta on 320 is noise, and the first version of this
      // test called that a PASS. 10% is the smallest drop that could not be a raster-quantisation
      // artefact at RES on a fixture this size.
      const drop = R.C.stranded ? 100 * (R.C.stranded - R.B.stranded) / R.C.stranded : 0;
      const fell = drop >= 10;
      console.log('§T3 TIER-B vs TIER-C stranded ' + R.C.stranded + ' -> ' + R.B.stranded +
        ' (' + drop.toFixed(1) + '%)  ' + (fell ? 'PASS (real apertures recover stranded rooms)'
          : 'FAIL — §21.28 cause (2) "a door exists but its carve did not pierce the host wall" is' +
            ' REFUTED on this fixture. The door-bbox proxy is as good as the real aperture;' +
            ' the stranded rooms belong to causes (1) no door element / (3) pocket never formed.') +
        '   unroutable ' + R.C.unroutable.toFixed(1) + '% -> ' + R.B.unroutable.toFixed(1) + '%');
    } else {
      console.log('§T3 TIER-B vs TIER-C  N/A — no opening geometry, tier B == tier C by construction');
    }

    // T4 — leak signature, not total area
    const t4 = R.cur.planPct < 60 && R.B.planPct < 60;
    console.log('§T4 NO-LEAK ' + (t4 ? 'PASS' : 'FAIL') + ' — largestPocket share of plan: cur=' +
      R.cur.planPct.toFixed(1) + '%  B=' + R.B.planPct.toFixed(1) + '%  C=' + R.C.planPct.toFixed(1) +
      '%   (a leak shows as ONE pocket swallowing the plan)');
    console.log('§T4_AREA enclosed cur=' + R.cur.encl.toFixed(0) + 'm²  B=' + R.B.encl.toFixed(0) +
      'm²  C=' + R.C.encl.toFixed(0) + 'm²   wall cur=' + R.cur.wall.toFixed(0) +
      'm²  B=' + R.B.wall.toFixed(0) + 'm²  C=' + R.C.wall.toFixed(0) + 'm²');

    // ---- T5 ENCLOSURE RETENTION — measured against the UNCARVED raster, the thing T4 cannot see
    const uncarved = (() => {
      const map = quiet(() => RW.spineMap(db, { carve: false }));
      let encl = 0;
      Object.keys(map).forEach(st => { const g = map[st].grid; for (let k = 0; k < g.enclosed.length; k++) if (g.enclosed[k]) encl++; });
      return encl * RW.RES * RW.RES;
    })();
    // Judged on EVERY mode including 'cur' — 'cur' is what ships, so exempting it would make the
    // gate decorative. A mode that dissolves enclosed floor is broken whether or not it is the new one.
    const ret = m => 100 * R[m].encl / Math.max(1e-6, uncarved);
    const verd = m => ret(m).toFixed(0) + '%' + (ret(m) >= 90 ? '' : ' FAIL');
    const t5 = ['cur', 'B', 'C'].every(m => ret(m) >= 90);
    console.log('§T5 ENCLOSURE RETENTION ' + (t5 ? 'PASS' : 'FAIL') + ' — uncarved=' + uncarved.toFixed(0) +
      'm²  retained: cur=' + verd('cur') + '  B=' + verd('B') + '  C=' + verd('C') + '   (>=90% required)');
    db.close();
  }
})();
