// level_deriver.js — §S32 RUNTIME LEVEL DERIVATION (prompts/4D_GANTT_TM_REFACTOR.md §S32 · §S33.1
// · §S34). Reads a FROZEN buildings/*.db, computes an ordered LEVEL for every scheduled element,
// holds it in memory. Writes nothing, ever.
//
// §S32.1 rule 3 (user, unconditional): "All subsequent metadata must be derived runtime 1 time ie
// rooms injection." This is that pass for LEVEL. It follows room_walker.js's own conventions —
// same dual-mode (node + browser sql.js `db.exec`), same "compile, never invent" posture, same
// §-tagged self-reporting.
//
// THE CONTRACT IT SATISFIES (§S32.4, all five clauses):
//   read-only        — only db.exec() with SELECT/PRAGMA; no write call appears anywhere in this
//                      file (grep it: `db.run` occurs in this comment and nowhere else).
//   once per load    — derive() is a single pass; callers hold the returned object for the session.
//   TOTAL            — every element gets a level. The geometry tier cannot fail: an element with
//                      no transform is already dropped upstream by _buildScheduleElements
//                      (viewer/schedule_author.js:346 `.filter(!e.noGeo)`, read 2026-08-19), so
//                      base_z/top_z are finite for every element that reaches a schedule. §T4 is
//                      still counted and reported, never defaulted away.
//   reports coverage — §LEVEL_DERIVE_TIER / §LEVEL_DERIVE_GRID / §LEVEL_DERIVE_OVERRIDE per building.
//   instrument guard — §LEVEL_DERIVE_GUARD prints whether each tier and the override branch were
//                      REACHABLE on this building, so a green "0 overrides" can be told apart from
//                      a branch that never ran. scripts/witness_level_derive.js is the hand-computed
//                      proof that every branch CAN fire.
//
// THE LADDER (§S33.1, measured: T4 = 0 on all 7 fleet buildings):
//   T1 declared  rel_contained_in_space -> space -> parent storey -> center_z
//   T2 declared  elements_meta.storey NAME -> spatial_structure storey of that name with center_z
//   T3 geometry  the element's own base_z, placed on the building's level grid
//   T4 none      non-finite geometry (counted, reported, never silently defaulted)
//
// THE TIE-BREAK (§S34.3, measured before it was decided): a declared level is KEPT when the
// element's own extent reaches the band that storey owns — `[Z_i, Z_i+1)` extended DOWN by the
// LOCAL storey gap, because 87-100% of apparent disagreements are elements hosted at/under their
// own floor line and the tolerance sweep's knee is one storey height. Where the extent misses that
// band entirely (1.63% of declared elements fleetwide, overwhelmingly MEP fittings whose declared
// storey is a system label) GEOMETRY WINS and the override is counted per class.
//
// §S50 (4D_GANTT_TM_REFACTOR.md, 2026-08-21): PORTED VERBATIM from bim-compiler
// build/level_deriver.js (§S35 — gate-passed: 100% coverage 7/7, T4=0, 14/14 hand-computed
// fixtures, scripts/witness_level_derive.js). This copy is the shipped one; the algorithm is
// UNCHANGED — only this header block differs. It is now WIRED: location_axis.js consumes it as
// the vertical axis of the cell-grain schedule (§S50.1.b), under the user's 2026-08-21 ruling.
(function () {
  'use strict';
  var TAG = '§LEVEL_DERIVE';
  var ROOT = (typeof window !== 'undefined') ? window : {};

  var FALLBACK_BAND_M = 3.0;   // only when a building has NO level grid at all (§S1_BAND_RANK width)
  var EPS = 0.05;              // metres of slack on the extent/band intersection

  // ── frozen-DB reads ───────────────────────────────────────────────────────────────────────────
  function tableExists(db, name) {
    var r = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name=" + JSON.stringify(name));
    return !!(r.length && r[0].values.length);
  }
  function columnExists(db, table, col) {
    var r = db.exec('PRAGMA table_info(' + table + ')');
    if (!r.length) return false;
    var i = r[0].columns.indexOf('name');
    return r[0].values.some(function (row) { return row[i] === col; });
  }

  // readLookups(db) — everything the ladder needs, in one pass over the frozen DB.
  function readLookups(db) {
    var L = { elementSpaces: {}, spaceParent: {}, storeyCenterZ: {}, storeyNameCenterZ: {},
              rawStorey: {}, ambiguousNames: [] };
    db.exec('SELECT guid, storey FROM elements_meta').forEach(function (res) {
      res.values.forEach(function (row) { L.rawStorey[row[0]] = row[1]; });
    });
    // ⚠ column-shape landmine (§S32 probe, kept): LTU_AHouse_meta declares rel_contained_in_space
    // as (element_guid, space_guid) — REVERSED vs every other building. Selecting BY NAME is what
    // makes that harmless; a positional row[0]/row[1] read would silently swap LTU's pairs.
    if (tableExists(db, 'rel_contained_in_space')) {
      db.exec('SELECT space_guid, element_guid FROM rel_contained_in_space').forEach(function (res) {
        res.values.forEach(function (row) {
          (L.elementSpaces[row[1]] || (L.elementSpaces[row[1]] = [])).push(row[0]);
        });
      });
    }
    if (tableExists(db, 'spatial_structure')) {
      var hasCz = columnExists(db, 'spatial_structure', 'center_z');
      var cols = hasCz ? 'guid, type, name, parent_guid, center_z' : 'guid, type, name, parent_guid';
      var nameZs = {};
      db.exec('SELECT ' + cols + ' FROM spatial_structure').forEach(function (res) {
        res.values.forEach(function (row) {
          var guid = row[0], type = row[1], name = row[2], parent = row[3];
          var cz = hasCz ? row[4] : null;
          if (type === 'IfcSpace') L.spaceParent[guid] = parent;
          if (type === 'IfcBuildingStorey' && cz != null && isFinite(cz)) {
            L.storeyCenterZ[guid] = cz;
            if (name) (nameZs[name] || (nameZs[name] = [])).push(cz);
          }
        });
      });
      // one elevation per NAME, and say so when a name carries two (T2 would be unsafe — §S31.4
      // measured 0 ambiguous on this fleet; re-checked here per building, never assumed)
      Object.keys(nameZs).forEach(function (nm) {
        var zs = nameZs[nm], lo = Math.min.apply(null, zs), hi = Math.max.apply(null, zs);
        L.storeyNameCenterZ[nm] = zs[0];
        if (hi - lo > 0.01) L.ambiguousNames.push(nm + ' spread=' + (hi - lo).toFixed(2) + 'm');
      });
    }
    return L;
  }

  // ── the level grid — declared floor lines, ascending ──────────────────────────────────────────
  function buildGrid(L, elements) {
    var set = {};
    Object.keys(L.storeyCenterZ).forEach(function (g) { set[L.storeyCenterZ[g]] = 1; });
    Object.keys(L.storeyNameCenterZ).forEach(function (n) { set[L.storeyNameCenterZ[n]] = 1; });
    var grid = Object.keys(set).map(Number).filter(isFinite).sort(function (a, b) { return a - b; });
    if (grid.length) return { grid: grid, source: 'declared' };
    // No storey row carries an elevation (LTU_AHouse_meta, Duplex_extracted — measured §S34.1).
    // Nothing declared to extract, so band by fixed width and REPORT that this is what happened.
    // A derived grid (slab-top clustering) is NOT attempted here: on the one fleet building where
    // it looks clean (Duplex: 0.0/3.0/6.5) it is untested, and on the other (LTU, federated across
    // source models with different floor heights) it is wrong by construction — §S29.4, §S34.4.
    var zs = elements.map(function (e) { return e.base_z; }).filter(isFinite);
    if (!zs.length) return { grid: [], source: 'none' };
    var lo = Math.floor(Math.min.apply(null, zs) / FALLBACK_BAND_M) * FALLBACK_BAND_M;
    var hi = Math.max.apply(null, zs);
    var g = [];
    for (var z = lo; z <= hi + FALLBACK_BAND_M; z += FALLBACK_BAND_M) g.push(Number(z.toFixed(3)));
    return { grid: g, source: 'uniform' + FALLBACK_BAND_M + 'm' };
  }

  function nearestIdx(grid, z) {
    var best = 0, bd = Infinity;
    for (var i = 0; i < grid.length; i++) { var d = Math.abs(z - grid[i]); if (d < bd) { bd = d; best = i; } }
    return best;
  }
  // declaredBandOf(i) — the band storey i owns FOR THE PURPOSE OF VALIDATING A DECLARED VALUE:
  // [Z_i, Z_i+1) extended DOWN by the local storey gap (§S34.1's measured knee — a slab's top IS
  // the floor line, a beam hangs under it).
  // ⚠ These bands deliberately OVERLAP: band(i)'s downward extension reaches into band(i−1). That
  // is correct for "does this element reach the storey it claims?" and WRONG for "which storey is
  // this element on?" — caught by witness_level_derive.js fixtures A4/A5/A14 before anything was
  // wired: placing geometry-only elements through these bands put an element at z=0.2 on level 4.
  // Geometric PLACEMENT uses plain non-overlapping intervals (geomIdx below). Two different
  // questions, two different intervals; do not merge them again.
  function declaredBandOf(grid, i, medGap) {
    var down = i > 0 ? (grid[i] - grid[i - 1]) : medGap;
    return { lo: grid[i] - down, hi: (i === grid.length - 1) ? Infinity : grid[i + 1] };
  }
  function medianGap(grid) {
    if (grid.length < 2) return FALLBACK_BAND_M;
    var gaps = [];
    for (var i = 1; i < grid.length; i++) gaps.push(grid[i] - grid[i - 1]);
    gaps.sort(function (a, b) { return a - b; });
    return gaps[Math.floor(gaps.length / 2)];
  }
  // geometric PLACEMENT: the storey an element stands on — the highest floor line at or below its
  // base_z. Plain, non-overlapping [Z_i, Z_i+1). Below the lowest floor line belongs to the lowest
  // storey (a footing under the ground slab is ground-level work), and the top band is open-ended,
  // so this is TOTAL for any finite z — the §S32.4 totality floor.
  function geomIdx(grid, base_z) {
    var idx = 0;
    for (var i = 0; i < grid.length; i++) if (base_z >= grid[i] - EPS) idx = i;
    return idx;
  }

  // ── the per-element decision — pure, fixture-testable (scripts/witness_level_derive.js) ───────
  // returns { tier, source, idx, level, overridden }
  //   tier      T1|T2|T3|T4 — where the value CAME FROM after the tie-break
  //   source    'declared' | 'geometry' | 'none'
  //   idx/level the grid index and its floor-line elevation
  function levelFor(el, rawStorey, L, G) {
    var declZ = null, declTier = null;
    var spaces = L.elementSpaces[el.guid];
    if (spaces) {
      for (var i = 0; i < spaces.length; i++) {
        var sg = L.spaceParent[spaces[i]];
        if (sg == null) continue;
        var cz = L.storeyCenterZ[sg];
        if (cz != null && isFinite(cz)) { declZ = cz; declTier = 'T1'; break; }
      }
    }
    if (declZ === null && rawStorey && rawStorey !== '_UNKNOWN' && !/^unknown$/i.test(rawStorey)) {
      var cz2 = L.storeyNameCenterZ[rawStorey];
      if (cz2 != null && isFinite(cz2)) { declZ = cz2; declTier = 'T2'; }
    }
    var finite = isFinite(el.base_z) && isFinite(el.top_z);
    if (!G.grid.length) {
      // no grid at all: nothing to place against (only when a building has zero usable geometry)
      return { tier: finite ? 'T3' : 'T4', source: finite ? 'geometry' : 'none',
               idx: null, level: finite ? el.base_z : null, overridden: false };
    }
    if (declZ !== null) {
      var di = nearestIdx(G.grid, declZ), band = declaredBandOf(G.grid, di, G.medGap);
      // §S34.3 rule 1 — the element reaches the band its declared storey owns: DECLARED WINS
      if (finite && (el.base_z - EPS) < band.hi && (el.top_z + EPS) > band.lo) {
        return { tier: declTier, source: 'declared', idx: di, level: G.grid[di], overridden: false };
      }
      if (!finite) {   // declared value with unusable geometry — still declared, nothing to check it against
        return { tier: declTier, source: 'declared', idx: di, level: G.grid[di], overridden: false };
      }
      // §S34.3 rule 2 — it misses entirely: GEOMETRY WINS, counted, never silent
      var gi = geomIdx(G.grid, el.base_z);
      return { tier: 'T3', source: 'geometry', idx: gi, level: G.grid[gi], overridden: true,
               declIdx: di, declZ: declZ, declTier: declTier };
    }
    // §S34.3 rule 3 — no declared value: geometry, no tie-break exists
    if (!finite) return { tier: 'T4', source: 'none', idx: null, level: null, overridden: false };
    var gi2 = geomIdx(G.grid, el.base_z);
    return { tier: 'T3', source: 'geometry', idx: gi2, level: G.grid[gi2], overridden: false };
  }

  // ── derive(db, elements, opts) — the ONE runtime pass ─────────────────────────────────────────
  // elements = ScheduleAuthor._buildScheduleElements(db, ...) output (already classified, already
  // filtered of no-geometry rows). Returns levels held in memory; the DB is untouched.
  function derive(db, elements, opts) {
    opts = opts || {};
    var label = opts.label || 'building';
    var L = readLookups(db);
    var G = buildGrid(L, elements);
    G.medGap = medianGap(G.grid);

    var levelOf = {};
    var tier = { T1: 0, T2: 0, T3: 0, T4: 0 };
    var src = { declared: 0, geometry: 0, none: 0 };
    var overrides = [], overrideByClass = {};
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var r = levelFor(el, L.rawStorey[el.guid], L, G);
      levelOf[el.guid] = r;
      tier[r.tier]++; src[r.source]++;
      if (r.overridden) {
        overrides.push(el.guid);
        overrideByClass[el.cls] = (overrideByClass[el.cls] || 0) + 1;
      }
    }
    var n = elements.length || 1;
    var covered = elements.length - tier.T4;

    console.log(TAG + '_GRID ' + label + ' source=' + G.source + ' k=' + G.grid.length +
      ' medianStoreyGap=' + G.medGap.toFixed(2) + 'm' +
      ' elevations=[' + G.grid.slice(0, 12).map(function (z) { return z.toFixed(2); }).join(',') +
      (G.grid.length > 12 ? ',…' : '') + ']' +
      ' ambiguousStoreyNames=' + L.ambiguousNames.length);
    L.ambiguousNames.forEach(function (a) { console.log(TAG + '_AMBIGUOUS ' + label + ' ' + a); });
    console.log(TAG + '_TIER ' + label + ' n=' + elements.length +
      ' T1=' + tier.T1 + ' T2=' + tier.T2 + ' T3=' + tier.T3 + ' T4=' + tier.T4 +
      ' declared=' + src.declared + ' (' + (100 * src.declared / n).toFixed(2) + '%)' +
      ' geometry=' + src.geometry + ' (' + (100 * src.geometry / n).toFixed(2) + '%)' +
      ' coverage=' + covered + '/' + elements.length + ' (' + (100 * covered / n).toFixed(3) + '%)' +
      ' TOTAL=' + (tier.T4 === 0 ? 'YES' : 'NO — ' + tier.T4 + ' ELEMENTS UNCOVERED, §S32.4 STOP-AND-REPORT'));
    console.log(TAG + '_OVERRIDE ' + label + ' n=' + overrides.length +
      ' (' + (100 * overrides.length / n).toFixed(2) + '% of all, ' +
      (src.declared + overrides.length ? (100 * overrides.length / (src.declared + overrides.length)).toFixed(2) : '0.00') +
      '% of elements that had a declared value) byClass=' +
      JSON.stringify(Object.keys(overrideByClass).sort(function (a, b) { return overrideByClass[b] - overrideByClass[a]; })
        .slice(0, 6).reduce(function (o, k) { o[k] = overrideByClass[k]; return o; }, {})));

    // §LEVEL_DERIVE_GUARD — a green number is worthless until the instrument is shown to be able to
    // go red (§STATUS standing instrument rule). This prints, per building, whether each branch was
    // REACHABLE on this data at all, so "overrides=0" can be told apart from "the branch never ran".
    var hadDeclared = src.declared + overrides.length > 0;
    console.log(TAG + '_GUARD ' + label +
      ' gridPresent=' + (G.grid.length > 0) +
      ' declaredBranchReachable=' + hadDeclared +
      ' overrideBranchReachable=' + (hadDeclared ? 'YES' : 'NO — no declared values on this building, tie-break is MOOT (§S34.3 rule 3)') +
      ' tiersSeen=' + JSON.stringify(Object.keys(tier).filter(function (k) { return tier[k] > 0; })) +
      ' — witness: scripts/witness_level_derive.js proves every branch CAN fire on hand-computed fixtures');

    return { levelOf: levelOf, grid: G.grid, gridSource: G.source, medGap: G.medGap,
             tier: tier, source: src, overrides: overrides, overrideByClass: overrideByClass,
             ambiguousNames: L.ambiguousNames, n: elements.length };
  }

  var API = {
    derive: derive, levelFor: levelFor, readLookups: readLookups, buildGrid: buildGrid,
    declaredBandOf: declaredBandOf, geomIdx: geomIdx, nearestIdx: nearestIdx, medianGap: medianGap,
    FALLBACK_BAND_M: FALLBACK_BAND_M, EPS: EPS
  };
  ROOT.LevelDeriver = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof console !== 'undefined') console.log(TAG + ' module loaded');
})();
