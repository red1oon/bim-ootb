// disc_walker.js — the ONE engine every discipline walker shares: Placer / Router / Gate,
// reading the MEASURED terminal_rules.db (mined off the Terminal building). Modeller-only;
// loaded locally from ../modeller/terminal_rules.db (NO OCI). The discipline is a DATA filter
// (WHERE disc=?), never a code fork — grep-clean, like the SDG builders.
//
// prompts/RESUME_TERMINAL_RULE_MINING.md §CONVERGENCE + §ELEGANT SHARED ABSTRACTION:
//   Placer — rule_placement/rule_space_bom → array-on-a-datum (FP sprinklers, ELEC lights,
//            STR columns, roof plates are ALL "measured cadence on a datum", one code path).
//   Router — rule_routing → from_kind→to_kind chains (pipe runs ≡ duct runs, different rows).
//   Gate   — rule_place_order + rule_avoidance → cross-disc ordering + clash-yield ("as in Terminal").
//
// NON-INVENT: places only from measured rules onto the TARGET building's REAL storeys/footprint.
// The rules carry RELATIVE dz + spacing (these transfer to a new building); absolute Terminal
// z-bands do NOT transfer and are not used for placement. Honest-REFUSE when no rule covers a
// disc, or the building lacks the substrate (no storeys / no network elements to route).
// SOURCE COPY lives in bim-compiler/build/; the deployed copy is bim-ootb/modeller/disc_walker.js
// (the Modeller is its own top-level app now — trilogy viewer/·erp/·modeller/).
(function () {
  'use strict';
  var TAG = '§DW';
  var ROOT = (typeof window !== 'undefined') ? window : {};
  var _db = null, _ready = false, _loadedFile = null;

  function _rows(db, sql) {
    var r = db.exec(sql);
    if (!r.length) return [];
    var cols = r[0].columns, vals = r[0].values;
    return vals.map(function (v) { var o = {}; cols.forEach(function (c, i) { o[c] = v[i]; }); return o; });
  }
  function _esc(s) { return String(s).replace(/'/g, "''"); }
  function _med(arr) { var a = arr.filter(function (v) { return v != null; }).sort(function (x, y) { return x - y; }); return a.length ? a[Math.floor(a.length / 2)] : 0; }

  // ── INIT ────────────────────────────────────────────────────────────────────────
  // Browser: dwInit(SQL, baseUrl, rulesFile) fetches ../modeller/<rulesFile> (local, no OCI).
  //   rulesFile defaults to 'terminal_rules.db' (large-complex standard, back-compat). Pass
  //   'duplex_rules.db' for the residential standard — building-class select is the caller's
  //   choice; the engine is disc=data-filter, never forked. §DATA-LOCALITY: each modeller/*.db
  //   is its OWN bim-compiler-built copy carrying a `rules_meta` provenance row, printed below so
  //   a STALE copy is detectable in the §-log (never assume modeller mirrors viewer/OCI buildings).
  // Node/witness: dwOpen(db) sets an already-opened sql.js instance directly.
  function dwOpen(db) { _db = db; _ready = !!db; return _ready; }
  // Print the rules_meta provenance (standard/version/built_from) if the DB carries it.
  function _logProvenance(file) {
    try {
      var r = _db.exec("SELECT key,value FROM rules_meta");
      if (!r.length) { console.log(TAG + ' §DW-PROV ' + file + ' NO rules_meta (unstamped — staleness undetectable)'); return; }
      var m = {}; r[0].values.forEach(function (kv) { m[kv[0]] = kv[1]; });
      console.log(TAG + ' §DW-PROV ' + file + ' standard=' + m.standard + ' version=' + m.version +
        ' built_from=' + m.built_from + ' built_at=' + m.built_at + ' avoidance=' + m.n_avoidance +
        ' [' + (m.clearance_summary || '') + ']');
    } catch (e) { console.log(TAG + ' §DW-PROV ' + file + ' rules_meta read failed: ' + e.message); }
  }
  // §DW_IDB — OFFLINE cache for the rules DB. dwInit hits the network on EVERY open for
  // terminal_rules.db / duplex_rules.db; wrap it with the SHARED bim_ootb_cache/'dbs' store
  // (the same store kernel_ops.js seals into + scene.js cachedFetch reads), so a repeat visit
  // opens the rules with NO network — making the modeller sw.js "terminal_rules.db cached in
  // IndexedDB" claim true. Try IDB hit → on miss fetch + put → bare fetch fallback on any IDB
  // error. Browser-only: node witnesses use dwOpen and never reach this path (indexedDB guard).
  function _openCacheDB() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    if (ROOT.APP && ROOT.APP.openCacheDB) { try { return ROOT.APP.openCacheDB(); } catch (e) { /* fall through */ } }
    return new Promise(function (res) {                       // no version → current (avoid VersionError drift below scene.js v2)
      var rq = indexedDB.open('bim_ootb_cache');
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { res(null); };
    });
  }
  function _idbGet(idb, key) {
    return new Promise(function (res) {
      try { var rq = idb.transaction('dbs', 'readonly').objectStore('dbs').get(key);
        rq.onsuccess = function () { res(rq.result || null); }; rq.onerror = function () { res(null); };
      } catch (e) { res(null); }
    });
  }
  function _idbPut(idb, key, buf) {
    try { var tx = idb.transaction('dbs', 'readwrite'); tx.objectStore('dbs').put(buf, key);
      tx.oncomplete = function () { console.log(TAG + ' §DW_IDB_WRITE ' + key + ' size=' + (buf.byteLength / 1024).toFixed(0) + 'KB'); };
      tx.onerror = function () { console.warn(TAG + ' §DW_IDB_WRITE_ERR ' + (tx.error && tx.error.message)); };
    } catch (e) { console.warn(TAG + ' §DW_IDB_WRITE_ERR ' + (e && e.message)); }
  }
  async function _loadDbBuf(url) {
    var idb = await _openCacheDB();
    if (idb && idb.objectStoreNames && idb.objectStoreNames.contains('dbs')) {
      var hit = await _idbGet(idb, url);
      if (hit) { console.log(TAG + ' §DW_IDB_HIT ' + url + ' size=' + (hit.byteLength / 1024).toFixed(0) + 'KB'); return hit; }
      console.log(TAG + ' §DW_IDB_MISS ' + url + ' — fetching');
      var buf = await (await fetch(url)).arrayBuffer();
      _idbPut(idb, url, buf);                                 // fire-and-forget (mirrors kernel_ops persist)
      return buf;
    }
    return (await fetch(url)).arrayBuffer();                  // no IDB / no 'dbs' store → bare fetch
  }
  async function dwInit(SQL, baseUrl, rulesFile) {
    var file = rulesFile || 'terminal_rules.db';
    // Building-class select: reload only when the requested standard CHANGES (open a house
    // after a terminal → swap residential rules in). Same file already loaded → no-op.
    if (_ready && _loadedFile === file) return _ready;
    var url = (baseUrl || '../modeller/') + file;
    var buf = await _loadDbBuf(url);                          // §DW_IDB: IDB-cached, network only on first open
    _db = new SQL.Database(new Uint8Array(buf));
    _ready = true; _loadedFile = file;
    var n = function (t) { var r = _db.exec('SELECT COUNT(*) FROM ' + t); return r.length ? r[0].values[0][0] : 0; };
    console.log(TAG + ' dwInit ' + file + ' placement=' + n('rule_placement') + ' routing=' + n('rule_routing') +
      ' place_order=' + n('rule_place_order') + ' avoidance=' + n('rule_avoidance'));
    _logProvenance(file);
    return _ready;
  }
  function loadedFile() { return _loadedFile; }

  // ── TARGET-BUILDING SUBSTRATE ─────────────────────────────────────────────────────
  // Real storeys from the building's OWN elements: median elevation + XY footprint (bbox union).
  function substrate(bdb) {
    var els = _rows(bdb,
      "SELECT m.storey s, t.center_x cx, t.center_y cy, t.center_z cz, " +
      "t.bbox_x bx, t.bbox_y by_, t.bbox_z bz " +
      "FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid");
    var by = {};
    els.forEach(function (e) { if (e.s == null) return; (by[e.s] = by[e.s] || []).push(e); });
    var storeys = [];
    Object.keys(by).forEach(function (s) {
      var g = by[s];
      var z = _med(g.map(function (e) { return e.cz; }));
      var x0 = Math.min.apply(null, g.map(function (e) { return e.cx - e.bx / 2; }));
      var x1 = Math.max.apply(null, g.map(function (e) { return e.cx + e.bx / 2; }));
      var y0 = Math.min.apply(null, g.map(function (e) { return e.cy - e.by_ / 2; }));
      var y1 = Math.max.apply(null, g.map(function (e) { return e.cy + e.by_ / 2; }));
      storeys.push({ name: s, z: z, x0: x0, x1: x1, y0: y0, y1: y1, n: g.length });
    });
    // habitable-ish: positive footprint + more than a trivial element count
    return storeys.filter(function (st) { return (st.x1 - st.x0) > 0.5 && (st.y1 - st.y0) > 0.5 && st.n >= 2; });
  }

  // Reduce a discipline's rule_placement rows to ONE representative per ifc_class
  // (median spacing + dz) — on a new building we have no storey mapping, so we apply
  // the measured cadence once per target storey rather than the Terminal's per-storey rows.
  function repRules(disc) {
    var rules = _rows(_db, "SELECT * FROM rule_placement WHERE disc='" + _esc(disc) + "'");
    var by = {};
    rules.forEach(function (r) { (by[r.ifc_class] = by[r.ifc_class] || []).push(r); });
    return Object.keys(by).map(function (cls) {
      var g = by[cls];
      // AREAL DENSITY (RouteWalker-aligned, supersedes bbox-tiling): when the rule carries the
      // SOURCE storey footprint (src_storey_area_m2, stamped by the re-baked miner), the measured
      // per-storey count n_measured scales by floor area — count = density × target_area — NOT by
      // tiling the bbox at the local cluster pitch (which exploded SC residential PLB to 708k). The
      // pitch (sx/sy) only ARRANGES the count locally. Density = median(n_measured / src_area) over
      // the class's source rows. Rules WITHOUT src_storey_area (e.g. terminal_rules.db, already sparse)
      // → density 0 → the legacy spacing-tile path (back-compat, numerically unchanged).
      var dens = _med(g.map(function (r) {
        return (r.src_storey_area_m2 > 0 && r.n_measured > 0) ? (r.n_measured / r.src_storey_area_m2) : null;
      }));
      // §PRIM (W-DW-PRIM): the class's MEASURED median bbox (stamped by stamp_src_bbox.py off
      // the source meta DB). Lets the modeller render each GENERATED fixture as a BOX of the real
      // class footprint/height, not a uniform 0.18 cube. NON-INVENT: SIZE only — no position/count
      // change; absent (NULL bbox / unstamped DB) → bbox=null → engine keeps the 0.18 fallback.
      var bdx = _med(g.map(function (r) { return r.bbox_dx; }));
      var bdy = _med(g.map(function (r) { return r.bbox_dy; }));
      var bdz = _med(g.map(function (r) { return r.bbox_dz; }));
      var bbox = (bdx > 0 && bdy > 0 && bdz > 0) ? { dx: bdx, dy: bdy, dz: bdz } : null;
      return {
        ifc_class: cls,
        ref_kind: g[0].ref_kind,
        sx: _med(g.map(function (r) { return r.spacing_x_m; })),
        sy: _med(g.map(function (r) { return r.spacing_y_m; })),
        dz: _med(g.map(function (r) { return r.dz; })),
        density: dens || 0,
        n_measured: _med(g.map(function (r) { return r.n_measured; })),
        n_rules: g.length,
        bbox: bbox,
        src: (g[0].src_guids || '').split(',')[0] || ''
      };
    });
  }

  // ── SHIM (host-attach) ────────────────────────────────────────────────────────────
  // Prior-art _shim_attributes/ShimMatcher model: a host-attached device tacks off its
  // host SURFACE frame, not the room centre. We adopt the MODEL (not the Java code): for a
  // ref_kind='host' rule, the device tacks onto a REAL wall in the target storey —
  // position=wall centre, z=floor+measured dz, yaw=wall rotation_z (the host normal = the
  // SHIM facing). NON-INVENT: every position is a real wall; height + count are measured.
  function hostWalls(bdb, storeyName) {
    return _rows(bdb,
      "SELECT t.center_x cx, t.center_y cy, t.rotation_z rot, m.guid guid " +
      "FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid " +
      "WHERE m.storey='" + _esc(storeyName) + "' AND m.ifc_class LIKE '%Wall%'");
  }
  // Measured per-storey count for a host class (rule_space_bom); 0 = unknown -> one per host.
  function countPer(disc, cls) {
    var r = _rows(_db, "SELECT count_per FROM rule_space_bom WHERE disc='" + _esc(disc) +
      "' AND ifc_class='" + _esc(cls) + "'");
    return r.length ? _med(r.map(function (x) { return x.count_per; })) : 0;
  }

  // ── ARC OCCUPANCY ENVELOPE ──────────────────────────────────────────────────────
  // The disc_walker-native analogue of RouteWalker's arc_envelope: a coarse occupancy grid
  // over the storey's REAL elements, so area-scaled fixtures land on built area (rooms/walls),
  // never in the void between wings. Returns occupied cell centres. NON-INVENT: a cell is
  // occupied only where a real element's XY footprint covers it. Per-element cell span is
  // bounded so one giant slab can't blow up the grid (it still marks its own footprint).
  var _OCC_SPAN = 256;                                       // max cells one element marks per axis
  function occupancy(bdb, st, cell) {
    cell = Math.max(cell > 0 ? cell : 1, 0.5);
    var rows = _rows(bdb,
      "SELECT t.center_x cx, t.center_y cy, COALESCE(t.bbox_x,0) bx, COALESCE(t.bbox_y,0) by_ " +
      "FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.storey='" + _esc(st.name) + "'");
    var occ = {};
    rows.forEach(function (e) {
      var i0 = Math.floor((e.cx - e.bx / 2) / cell), i1 = Math.floor((e.cx + e.bx / 2) / cell);
      var j0 = Math.floor((e.cy - e.by_ / 2) / cell), j1 = Math.floor((e.cy + e.by_ / 2) / cell);
      for (var i = i0; i <= i1 && i < i0 + _OCC_SPAN; i++)
        for (var j = j0; j <= j1 && j < j0 + _OCC_SPAN; j++) occ[i + ',' + j] = 1;
    });
    return Object.keys(occ).map(function (k) {
      var ij = k.split(','); return { x: (+ij[0] + 0.5) * cell, y: (+ij[1] + 0.5) * cell };
    });
  }

  // ── PLACER ──────────────────────────────────────────────────────────────────────
  var _MAX_PER_STOREY = 50000;                               // legacy spacing-tile backstop (never silent)
  function place(disc, storeys, bdb) {
    var reps = repRules(disc), out = [];
    // §PRIM: attach the class's MEASURED bbox (or null) to every placement so the modeller
    // sizes its GENERATED-fixture box per class. SIZE only — count/position untouched.
    function _emit(o, rp) {
      o.bx = rp.bbox ? rp.bbox.dx : null; o.by = rp.bbox ? rp.bbox.dy : null; o.bz = rp.bbox ? rp.bbox.dz : null;
      out.push(o);
    }
    reps.forEach(function (rp) {
      storeys.forEach(function (st) {
        var w = st.x1 - st.x0, d = st.y1 - st.y0;
        var z = st.z + (rp.dz || 0);
        if (rp.density > 0 && rp.sx > 0) {                  // AREA-SCALED measured count, envelope-placed (FIXTURES only)
          var count = Math.round(rp.density * w * d);       // n_measured × (target_area / src_area)
          if (count > 0) {
            var cells = occupancy(bdb, st, rp.sx);
            if (!cells.length) cells = [{ x: (st.x0 + st.x1) / 2, y: (st.y0 + st.y1) / 2 }];
            var cap = cells.length, placeN = Math.min(count, cap), stride = cap / placeN;
            for (var c = 0; c < placeN; c++) {
              var cell = cells[Math.floor(c * stride)];
              _emit({ disc: disc, ifc_class: rp.ifc_class, x: cell.x, y: cell.y, z: z,
                storey: st.name, prov: 'placed:array-density', src: rp.src }, rp);
            }
            if (count > cap) console.log(TAG + ' §DW-CAP ' + disc + '/' + rp.ifc_class + ' storey=' + st.name +
              ' placed=' + placeN + ' of ' + count + ' (envelope is the ceiling)');
          }
        } else if (rp.sx > 0 && rp.sy > 0) {                // legacy measured array → tile the footprint (no src area)
          var nx = Math.max(1, Math.round(w / rp.sx)), ny = Math.max(1, Math.round(d / rp.sy));
          if (nx * ny > _MAX_PER_STOREY) {                  // backstop: never silently emit a runaway count
            var sc = Math.sqrt((nx * ny) / _MAX_PER_STOREY); nx = Math.max(1, Math.round(nx / sc)); ny = Math.max(1, Math.round(ny / sc));
            console.log(TAG + ' §DW-CAP ' + disc + '/' + rp.ifc_class + ' storey=' + st.name + ' tile capped to ' + (nx * ny) + ' (no src area — re-bake to area-scale)');
          }
          for (var i = 0; i < nx; i++) for (var j = 0; j < ny; j++) {
            _emit({ disc: disc, ifc_class: rp.ifc_class, x: st.x0 + (i + 0.5) * (w / nx),
              y: st.y0 + (j + 0.5) * (d / ny), z: z, storey: st.name, prov: 'placed:array', src: rp.src }, rp);
          }
        } else if (rp.ref_kind === 'host' && bdb) {         // SHIM → tack onto real host walls
          var walls = hostWalls(bdb, st.name);
          if (walls.length) {
            var cap = countPer(disc, rp.ifc_class);
            var nP = (cap > 0) ? Math.min(cap, walls.length) : walls.length;
            var stride = walls.length / nP;
            for (var k = 0; k < nP; k++) {
              var wl = walls[Math.floor(k * stride)];
              _emit({ disc: disc, ifc_class: rp.ifc_class, x: wl.cx, y: wl.cy, z: z,
                yaw: wl.rot, storey: st.name, prov: 'shim:host-wall', host: wl.guid, src: rp.src }, rp);
            }
          }                                                 // no walls → honest skip (no host surface)
        } else {                                            // single placement (datum rule, no host)
          _emit({ disc: disc, ifc_class: rp.ifc_class, x: (st.x0 + st.x1) / 2, y: (st.y0 + st.y1) / 2,
            z: z, storey: st.name, prov: 'placed:single', src: rp.src }, rp);
        }
      });
    });
    return out;
  }

  // ── ROUTER ────────────────────────────────────────────────────────────────────────
  // Chain rules need real from/to elements in the TARGET building. Residents have no MEP
  // network → honest 0 (refusal), not a fabricated run.
  function route(disc, bdb) {
    var rr = _rows(_db, "SELECT * FROM rule_routing WHERE disc='" + _esc(disc) + "' AND pattern='nn'");
    var chains = [];
    rr.forEach(function (r) {
      var nf = _rows(bdb, "SELECT COUNT(*) c FROM elements_meta WHERE ifc_class='" + _esc(r.from_kind) + "'");
      var nt = _rows(bdb, "SELECT COUNT(*) c FROM elements_meta WHERE ifc_class='" + _esc(r.to_kind) + "'");
      var cf = nf.length ? nf[0].c : 0, ct = nt.length ? nt[0].c : 0;
      if (cf > 0 && ct > 0) chains.push({ from: r.from_kind, to: r.to_kind, pattern: 'nn', n_from: cf, n_to: ct });
    });
    return chains;
  }

  // ── ROUTER nn-CHAINS (live geometry) ────────────────────────────────────────────────
  // route() above only COUNTS endpoint classes (does the building have both?). routeChains
  // PRODUCES the real network: for each measured 'nn' rule, pair every from-element to its
  // NEAREST to-element in 3D, bounded by the measured max gap. A spatial hash (cell=bound)
  // keeps it O(n) — NOT brute-force n×m (4243×3821 pipe pairs would be 16M). NON-INVENT: every
  // segment joins TWO REAL elements at their REAL element_transforms positions; the only derived
  // thing is the nearest-neighbour pairing, capped at the measured gap so no implausibly long run
  // is fabricated. A from-element with no neighbour within the bound is HONESTLY skipped + counted.
  function _gapParams(pj) {
    var p = {}; try { p = JSON.parse(pj || '{}'); } catch (e) { p = {}; }
    return {                                                  // PLB uses *_m keys; ACMV uses nn_dist_*_m — accept both
      avg: (p.avg_gap_m != null) ? p.avg_gap_m : p.nn_dist_avg_m,
      max: (p.max_m != null) ? p.max_m : p.nn_dist_max_m,
      min: (p.min_m != null) ? p.min_m : p.nn_dist_min_m
    };
  }
  function _loadXYZ(bdb, cls) {
    return _rows(bdb,
      "SELECT m.guid g, t.center_x x, t.center_y y, t.center_z z " +
      "FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class='" + _esc(cls) + "'");
  }
  var _DERIVED_MAX_K = 4;                                     // when a rule has no measured max, bound = K×avg (logged)
  // ONE nn pass: for each ANCHOR element find the nearest CAND within `bound` (spatial-hash, O(n)).
  // Returns the paired list {ai, ci, gap} + the no-neighbour count + the mean gap of paired.
  function _nnPass(anchor, cand, bound) {
    var CELL = bound > 0 ? bound : 1, grid = {};
    var ck = function (a, b, c) { return a + ',' + b + ',' + c; };
    cand.forEach(function (p, i) {
      var k = ck(Math.floor(p.x / CELL), Math.floor(p.y / CELL), Math.floor(p.z / CELL));
      (grid[k] = grid[k] || []).push(i);
    });
    var pairs = [], noNbr = 0, sum = 0;
    anchor.forEach(function (f, fi) {
      var ix = Math.floor(f.x / CELL), iy = Math.floor(f.y / CELL), iz = Math.floor(f.z / CELL);
      var best = Infinity, bj = -1;
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) for (var dz = -1; dz <= 1; dz++) {
        var arr = grid[ck(ix + dx, iy + dy, iz + dz)]; if (!arr) continue;
        for (var a = 0; a < arr.length; a++) {
          var p = cand[arr[a]];
          if (p.g === f.g) continue;                         // self-pair guard (same-class nn, e.g. IfcMember→IfcMember)
          var d = Math.sqrt((f.x - p.x) * (f.x - p.x) + (f.y - p.y) * (f.y - p.y) + (f.z - p.z) * (f.z - p.z));
          if (d < best) { best = d; bj = arr[a]; }
        }
      }
      if (bj >= 0 && best <= bound) { pairs.push({ ai: fi, ci: bj, gap: best }); sum += best; }
      else { noNbr++; }
    });
    return { pairs: pairs, noNbr: noNbr, mean: pairs.length ? sum / pairs.length : Infinity };
  }
  function routeChains(disc, bdb) {
    var rr = _rows(_db, "SELECT * FROM rule_routing WHERE disc='" + _esc(disc) + "' AND pattern='nn'");
    var segs = [], byRule = [];
    rr.forEach(function (r) {
      var gp = _gapParams(r.params_json);
      if (gp.avg == null && gp.max == null) {                // no measured gap → cannot bound → honest skip
        byRule.push({ from: r.from_kind, to: r.to_kind, segs: 0, noNbr: 0, skipped: 'no-measured-gap' });
        return;
      }
      var bound = (gp.max != null) ? gp.max : _DERIVED_MAX_K * gp.avg;
      var gapSource = (gp.max != null) ? 'measured-max' : 'derived-from-avg';
      var from = _loadXYZ(bdb, r.from_kind), to = _loadXYZ(bdb, r.to_kind);
      if (!from.length || !to.length) {                      // building lacks one endpoint class → honest 0
        byRule.push({ from: r.from_kind, to: r.to_kind, segs: 0, noNbr: 0, skipped: 'no-endpoints' });
        return;
      }
      // The rule declares from→to, but its measured avg gap was mined from whichever endpoint set is the
      // LEAF (one connection per device). Routing the wrong way pairs sparse devices across the room (inflated
      // mean, fabricated long links). So run nn BOTH orientations and KEEP THE TIGHTER (smaller mean gap) — the
      // direction where every iterated element has a genuine nearby partner = the real connectivity. NON-INVENT:
      // both passes use only real positions; we choose the orientation that fabricates the least gap. Segments
      // always record from_guid/to_guid by the RULE's from_kind/to_kind, regardless of which set we iterated.
      var fwd = _nnPass(from, to, bound);                    // anchor=from, cand=to
      var rev = _nnPass(to, from, bound);                    // anchor=to,   cand=from
      var useRev = rev.mean < fwd.mean;
      var chosen = useRev ? rev : fwd;
      var iterDir = useRev ? 'to→from' : 'from→to';
      chosen.pairs.forEach(function (pr) {
        // map the paired indices back to from-class / to-class endpoints (rule semantics, not iteration order)
        var fEl = useRev ? from[pr.ci] : from[pr.ai];
        var tEl = useRev ? to[pr.ai] : to[pr.ci];
        segs.push({ disc: disc, rule: 'nn', from_kind: r.from_kind, to_kind: r.to_kind,
          from_guid: fEl.g, to_guid: tEl.g, from: [fEl.x, fEl.y, fEl.z], to: [tEl.x, tEl.y, tEl.z],
          gap: +pr.gap.toFixed(4), bound: +(+bound).toFixed(4), gapSource: gapSource });
      });
      byRule.push({ from: r.from_kind, to: r.to_kind, segs: chosen.pairs.length, noNbr: chosen.noNbr,
        bound: +(+bound).toFixed(4), gapSource: gapSource, avg_measured: gp.avg, iterDir: iterDir,
        meanGap: +chosen.mean.toFixed(4) });
    });
    return { segs: segs, byRule: byRule };
  }

  // ── GATE (place-order + avoidance) ─────────────────────────────────────────────────
  // Global per-disc order = the median order_index across the measured place_order rows.
  function order() {
    var po = _rows(_db, "SELECT disc, order_index FROM rule_place_order");
    var by = {};
    po.forEach(function (r) { (by[r.disc] = by[r.disc] || []).push(r.order_index); });
    var o = {}; Object.keys(by).forEach(function (d) { o[d] = _med(by[d]); });
    return o;
  }
  // Measured min clearance between a disc pair (median over storeys; symmetric).
  function clearance() {
    var av = _rows(_db, "SELECT disc_a, disc_b, min_clear_m, yields FROM rule_avoidance");
    var by = {};
    av.forEach(function (r) {
      var k = [r.disc_a, r.disc_b].sort().join('|');
      (by[k] = by[k] || []).push(r);
    });
    var out = {};
    Object.keys(by).forEach(function (k) {
      var g = by[k]; out[k] = { min_clear: _med(g.map(function (r) { return r.min_clear_m; })), yields: g[0].yields };
    });
    return out;
  }
  // Apply the gate to placements from ≥2 disciplines: the lower-priority disc YIELDS
  // (pushed down by min_clear) where it sits within min_clear of a higher-priority disc.
  // AvoidanceGate. A lower-priority discipline yields by dropping into the plenum
  // (measured min_clear, as in Terminal). TWO fixes over the naive one-shot drop:
  //  (1) ITERATE — a single drop+break leaves dense sets clashing (the dropped fixture
  //      can still be < min_clear of a DIFFERENT high-priority element); loop until stable.
  //  (2) STAY IN THE ENVELOPE + FLAG — never drop a fixture below the lowest MEASURED
  //      z-band (`floor`): below that is fabricated underground space (a Duplex has no
  //      Terminal-deep plenum to drop into). Anything that still clashes after we have
  //      dropped as far as the envelope allows is IRREDUCIBLE → mark `clash=true` so the
  //      UI renders it RED. NON-INVENT, no-handwave: clashes are RESOLVED or FLAGGED,
  //      never silently rendered clean and never buried underground to fake a clean count.
  function _gatePairs(byDisc, discs, ord, clr, cb) {
    for (var a = 0; a < discs.length; a++) for (var b = 0; b < discs.length; b++) {
      if (a === b) continue;
      var da = discs[a], dbb = discs[b];
      var oa = (ord[da] != null) ? ord[da] : 99, ob = (ord[dbb] != null) ? ord[dbb] : 99;
      if (!(oa < ob)) continue;                              // da is higher priority than dbb
      var k = [da, dbb].sort().join('|'); var c = clr[k]; if (!c) continue;
      cb(byDisc[da], byDisc[dbb], c.min_clear);              // hi, lo, min_clear
    }
  }
  function _d3(p, q) {
    return Math.sqrt((p.x - q.x) * (p.x - q.x) + (p.y - q.y) * (p.y - q.y) + (p.z - q.z) * (p.z - q.z));
  }
  function gate(placements) {
    var ord = order(), clr = clearance(), yields = 0;
    // remember each placement's ORIGINAL z once (idempotent across repeated gate() calls
    // as the modeller re-gates the cumulative set after each new walk).
    placements.forEach(function (p) { if (p._z0 == null) p._z0 = p.z; });
    // floor = lowest measured band across the walked set — the bottom of real, measured space.
    var floor = Infinity; placements.forEach(function (p) { if (p._z0 < floor) floor = p._z0; });
    var byDisc = {}; placements.forEach(function (p) { (byDisc[p.disc] = byDisc[p.disc] || []).push(p); });
    var discs = Object.keys(byDisc);
    var MAXIT = 16, it = 0, changed = true;
    while (changed && it < MAXIT) {
      changed = false; it++;
      _gatePairs(byDisc, discs, ord, clr, function (hi, lo, mc) {
        lo.forEach(function (pl) {
          for (var i = 0; i < hi.length; i++) {
            if (_d3(pl, hi[i]) < mc) {
              var nz = pl.z - mc;
              if (nz >= floor - 1e-6) { pl.z = nz; if (!pl.gated) yields++; pl.gated = true; changed = true; }
              break;                                          // re-checked next iteration
            }
          }
        });
      });
    }
    // honest residual pass: whatever STILL clashes can't be resolved inside the envelope → FLAG it.
    var residual = 0;
    placements.forEach(function (p) { p.clash = false; });
    _gatePairs(byDisc, discs, ord, clr, function (hi, lo, mc) {
      lo.forEach(function (pl) {
        for (var i = 0; i < hi.length; i++) {
          if (_d3(pl, hi[i]) < mc) { if (!pl.clash) { pl.clash = true; residual++; } break; }
        }
      });
    });
    return { yields: yields, residual: residual, iterations: it, floor: floor, order: ord };
  }

  // ── WALK (the disc-node onWalk entry point) ─────────────────────────────────────────
  function dwWalk(disc, bdb, buildingName) {
    if (!_ready) { console.warn(TAG + ' not initialised'); return { disc: disc, refused: true, reason: 'engine not initialised', placed: 0 }; }
    var reps = repRules(disc);
    var sub = substrate(bdb);
    if (!reps.length && !_rows(_db, "SELECT 1 FROM rule_routing WHERE disc='" + _esc(disc) + "' LIMIT 1").length) {
      console.log(TAG + ' §WALK disc=' + disc + ' bldg=' + buildingName + ' REFUSE no-measured-rule');
      return { disc: disc, refused: true, reason: 'no measured rule for ' + disc, placed: 0 };
    }
    if (!sub.length) {
      console.log(TAG + ' §WALK disc=' + disc + ' bldg=' + buildingName + ' REFUSE no-substrate');
      return { disc: disc, refused: true, reason: 'no habitable storeys', placed: 0 };
    }
    var placements = place(disc, sub, bdb);
    var chains = route(disc, bdb);
    var rc = routeChains(disc, bdb);                         // LIVE nn-chain geometry (real on MEP-rich bldgs, 0 on residents)
    console.log(TAG + ' §WALK disc=' + disc + ' bldg=' + buildingName + ' placed=' + placements.length +
      ' chains=' + chains.length + ' chainSegs=' + rc.segs.length + ' storeys=' + sub.length +
      (rc.byRule.length ? ' [' + rc.byRule.map(function (b) { return b.from.replace('Ifc', '') + '→' + b.to.replace('Ifc', '') + ':' + (b.skipped || (b.segs + '/' + (b.segs + b.noNbr))); }).join(' ') + ']' : ''));
    return { disc: disc, refused: false, placed: placements.length, placements: placements,
      chains: chains, chainSegs: rc.segs, chainByRule: rc.byRule, storeys: sub.length };
  }

  // The walkable disciplines the measured rules cover — drives the Outliner "Walk" roster so a
  // discipline ABSENT from the open building (e.g. FP on a house) is still walkable. Derived, not whitelisted.
  function disciplines() {
    if (!_ready) return [];
    // Only WALKABLE disciplines — those with a placement or routing rule. (rule_place_order alone, e.g. the
    // generic 'MEP' band, is not walkable: it would always refuse, so it stays off the roster.)
    var r = _db.exec("SELECT disc FROM rule_placement UNION SELECT disc FROM rule_routing");
    return r.length ? r[0].values.map(function (v) { return v[0]; }).filter(function (d) { return d && d !== 'ARC'; }) : [];
  }

  var API = { dwInit: dwInit, dwOpen: dwOpen, dwWalk: dwWalk, substrate: substrate, place: place,
    route: route, routeChains: routeChains, gate: gate, repRules: repRules, order: order, clearance: clearance,
    hostWalls: hostWalls, countPer: countPer, occupancy: occupancy,
    disciplines: disciplines, loadedFile: loadedFile, _ready: function () { return _ready; } };
  ROOT.DiscWalker = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  console.log(TAG + ' module loaded');
})();
