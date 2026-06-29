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
  // §BORROW — per-discipline source map (docs/WalkerDoctrine.md §2). The PRIMARY _db is the building-class
  // ruleset (e.g. duplex_rules.db for residential). A discipline ABSENT from the residential set (e.g. FP/
  // sprinkler) can be BORROWED from another ruleset (e.g. terminal_rules.db) WITHOUT switching the building's
  // class: per-discipline reads (placement/space_bom/routing/shim) route to _dbFor(disc); cross-disc tables
  // (rule_avoidance/place_order, the gate) stay on the PRIMARY _db (residential clearance standard). NON-INVENT:
  // a borrowed discipline reuses that DB's MEASURED rows; nothing is fabricated.
  var _borrow = {};                                              // disc -> borrowed sql.js db handle
  function _dbFor(disc) { return _borrow[disc] || _db; }
  // Register/clear a borrowed discipline source. dwBorrow('FP', terminalDb) → FP rules read from terminalDb.
  function dwBorrow(disc, db) { if (db) _borrow[disc] = db; else delete _borrow[disc]; return _borrow; }
  // Browser borrow-by-FILE (docs/WalkerDoctrine.md §2): IDB-cached load + open + register a borrowed discipline
  // from ANOTHER rules file WITHOUT switching the primary. A residential build (duplex_rules primary) lacks FP →
  // dwBorrowFile('FP', SQL, './', 'terminal_rules.db') routes FP's MEASURED rows to terminal_rules; the gate +
  // cross-disc clearances stay on the primary. Reuses _loadDbBuf (same offline cache as dwInit). Idempotent per
  // file. Browser-only (node witnesses use dwBorrow with an fs-opened handle and never reach _loadDbBuf's fetch).
  async function dwBorrowFile(disc, SQL, baseUrl, file) {
    if (_borrow[disc] && _borrow[disc]._dwFile === file) return _borrow[disc];   // already borrowed this file
    var url = (baseUrl || '../modeller/') + file;
    var buf = await _loadDbBuf(url);
    var db = new SQL.Database(new Uint8Array(buf));
    db._dwFile = file; _borrow[disc] = db;
    console.log(TAG + ' §DW-BORROW ' + disc + ' ← ' + file);
    return db;
  }

  function _rows(db, sql) {
    var r = db.exec(sql);
    if (!r.length) return [];
    var cols = r[0].columns, vals = r[0].values;
    return vals.map(function (v) { var o = {}; cols.forEach(function (c, i) { o[c] = v[i]; }); return o; });
  }
  function _esc(s) { return String(s).replace(/'/g, "''"); }
  // §LOD-SEAM (docs/WalkerDoctrine.md §5): map a fixture ifc_class → a SEMANTIC primitive kind. The modeller renders a
  // recognizable shape per kind NOW (POC) and swaps a fine LOD400 component-library mesh later — one seam, same placement.
  // Pure classification (no geometry, no invention); unknown classes fall back to 'box'.
  function _primFor(cls) {
    cls = String(cls || '');
    if (/FireSuppressionTerminal|Sprinkler/i.test(cls)) return 'sprinkler';
    if (/AirTerminal|Diffuser/i.test(cls)) return 'diffuser';
    if (/LightFixture|Lamp/i.test(cls)) return 'light';
    if (/Alarm|Sensor/i.test(cls)) return 'alarm';
    if (/Outlet|ElectricAppliance|SwitchingDevice/i.test(cls)) return 'outlet';
    if (/Valve|FlowController/i.test(cls)) return 'valve';
    if (/Pipe|Duct|FlowSegment|FlowFitting/i.test(cls)) return 'run';
    return 'box';
  }
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
    var rules = _rows(_dbFor(disc), "SELECT * FROM rule_placement WHERE disc='" + _esc(disc) + "'");
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
    var r = _rows(_dbFor(disc), "SELECT count_per FROM rule_space_bom WHERE disc='" + _esc(disc) +
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
      o.prim = _primFor(o.ifc_class);                         // §LOD-SEAM: semantic primitive kind (modeller render hint)
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
          // ENVELOPE-BIND the single too: a lone datum fixture must still sit on BUILT area, not in a courtyard
          // void at the raw bbox centre. Snap the centre to the nearest occupied cell (same envelope as the array
          // path). NON-INVENT: the cell is a real ARC footprint cell; no occupancy (bare DB) → keep the centre.
          var scx = (st.x0 + st.x1) / 2, scy = (st.y0 + st.y1) / 2;
          var scells = occupancy(bdb, st, rp.sx > 0 ? rp.sx : 1);
          if (scells.length) {
            var sbest = scells[0], sbd = Infinity;
            for (var sc = 0; sc < scells.length; sc++) {
              var sdd = (scells[sc].x - scx) * (scells[sc].x - scx) + (scells[sc].y - scy) * (scells[sc].y - scy);
              if (sdd < sbd) { sbd = sdd; sbest = scells[sc]; }
            }
            scx = sbest.x; scy = sbest.y;
          }
          _emit({ disc: disc, ifc_class: rp.ifc_class, x: scx, y: scy,
            z: z, storey: st.name, prov: 'placed:single', src: rp.src }, rp);
        }
      });
    });
    return out;
  }

  // ── HOST-BIND (the anti-float fix for host-bound standalone disciplines) ────────────
  // Density/storey placement scatters fixtures at FOOTPRINT-cell centres → they float mid-room (SH ELEC: 38/38
  // ~3.9m off any wall). But "host-bound standalone" classes (taxonomy class-2: ELEC outlets→wall SIDE, FP
  // alarms→covering BOTTOM, vent grilles→window TOP) are governed by a HOST + a mount face — NOT a joined
  // network (class-1) and NOT a proximity run (class-3). This snaps each placement onto the nearest real host
  // of `shim.host_ifc_class`, on the mount face named by `shim.mount`:
  //   SIDE   — project onto the host's CENTRELINE (host line = centre ± half its dominant horizontal axis),
  //            push to the room-side FACE by half-thickness + shim offset, yaw = host run axis. (walls)
  //   TOP    — snap XY to the host centre, set Z to the host top-face (centre_z + bbox_z/2) + shim offset;
  //            yaw = host run axis. (window grilles, slab-top risers)
  //   BOTTOM — snap XY to the host centre, set Z to the host bottom-face (centre_z − bbox_z/2) − shim offset.
  //            (ceiling-covering alarms/diffusers)
  // NON-INVENT: the host + its geometry are REAL; the shim percept {host_ifc_class, mount, offset_m, height_m}
  // is supplied (sourced from ERP.db `_shim_attributes`), never guessed. A placement with no host within
  // `reach_m` is REFUSED (kept floating + counted) — REFUSE beats fabricate. host_ifc_class matches as a
  // substring so 'IfcWall' still picks up IfcWallStandardCase (backward-compatible with the wall-only path).
  function hostBind(placements, bdb, shim) {
    shim = shim || {};
    var reach = shim.reach_m != null ? shim.reach_m : 6;
    var hostClass = shim.host_ifc_class || 'IfcWall';
    var mount = (shim.mount || 'SIDE').toUpperCase();
    var hosts = _rows(bdb,
      "SELECT m.guid g, m.storey st, t.center_x x, t.center_y y, t.center_z z, t.bbox_x bx, t.bbox_y by_, t.bbox_z bz " +
      "FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class LIKE '%" + _esc(hostClass) + "%'");
    if (!hosts.length) return { bound: [], refused: placements.length, noHost: true, hostClass: hostClass };
    var off = shim.offset_m || 0;
    var bound = [], refused = 0, refusedList = [];

    if (mount === 'SIDE') {
      // ── wall-face projection (the original, unchanged geometry) ──
      var lines = hosts.map(function (w) {
        var horiz = w.bx >= w.by_ ? 0 : 1;                       // dominant horizontal axis = host run
        var hlen = (horiz === 0 ? w.bx : w.by_) / 2, thick = (horiz === 0 ? w.by_ : w.bx);
        var a = [w.x, w.y], b = [w.x, w.y]; a[horiz] -= hlen; b[horiz] += hlen;
        return { a: a, b: b, horiz: horiz, thick: thick, w: w };
      });
      placements.forEach(function (p) {
        var best = Infinity, bl = null, bpt = null;
        for (var i = 0; i < lines.length; i++) {
          var L = lines[i], abx = L.b[0] - L.a[0], aby = L.b[1] - L.a[1];
          var l2 = abx * abx + aby * aby;
          var t = l2 > 0 ? ((p.x - L.a[0]) * abx + (p.y - L.a[1]) * aby) / l2 : 0;
          t = t < 0 ? 0 : (t > 1 ? 1 : t);
          var cx = L.a[0] + t * abx, cy = L.a[1] + t * aby;
          var d = Math.hypot(p.x - cx, p.y - cy);
          if (d < best) { best = d; bl = L; bpt = [cx, cy]; }
        }
        if (!bl || best > reach) { refused++; refusedList.push(p); return; }  // no host in reach → honest refuse (stays floating)
        // push from centreline to the room-side face: perpendicular toward the original (floating) point.
        var perpx = p.x - bpt[0], perpy = p.y - bpt[1], pl = Math.hypot(perpx, perpy) || 1;
        var faceOff = bl.thick / 2 + off;
        var fx = bpt[0] + (perpx / pl) * faceOff, fy = bpt[1] + (perpy / pl) * faceOff;
        // Z: preserve the MEASURED rule-z by default (non-invent); use the shim mount height only when the
        // witness supplies a storey base (height isn't measured for that building).
        var pz = (shim.height_m != null && p.storeyZ != null) ? (p.storeyZ + shim.height_m) : p.z;
        bound.push({ disc: p.disc, ifc_class: p.ifc_class, x: fx, y: fy, z: pz, yaw: bl.horiz === 0 ? 0 : Math.PI / 2,
          storey: p.storey, host: bl.w.g, mount: 'SIDE', prov: 'shim:host-' + hostClass + '-side',
          bx: p.bx, by: p.by, bz: p.bz, prim: p.prim, src: p.src, snapDist: +best.toFixed(4) });
      });
      return { bound: bound, refused: refused, refusedList: refusedList, hostCount: hosts.length, hostClass: hostClass, mount: mount };
    }

    // ── TOP / BOTTOM / CENTER: nearest host by XY, bind to its top/bottom/centre face ──
    // CENTER (z = host centre + signed offset) is the natural anchor when the device rides at a fixed rise off
    // the host centre (e.g. SC vent grilles sit 0.415m above their same-storey window centre). TOP/BOTTOM add a
    // half-extent to reach the named face. `shim.same_storey` constrains host selection to the placement's own
    // storey — required for vertically STACKED hosts (windows stack floor-on-floor; nearest-XY alone is ambiguous).
    var sign = mount === 'BOTTOM' ? -1 : 1;                       // TOP=+half above, BOTTOM=−half below, CENTER=face 0
    var faceHalf = mount === 'CENTER' ? 0 : 1;                    // CENTER rides the centre; TOP/BOTTOM the face
    var sameStorey = !!shim.same_storey;
    placements.forEach(function (p) {
      var best = Infinity, bh = null;
      for (var i = 0; i < hosts.length; i++) {
        var h = hosts[i];
        if (sameStorey && p.storey != null && h.st !== p.storey) continue;  // stacked-host disambiguation
        var d = Math.hypot(p.x - h.x, p.y - h.y);                 // XY proximity = host association
        if (d < best) { best = d; bh = h; }
      }
      if (!bh || best > reach) { refused++; refusedList.push(p); return; }  // no host in reach → honest refuse
      var horiz = bh.bx >= bh.by_ ? 0 : 1;                        // host run axis (for yaw)
      var pz = bh.z + sign * faceHalf * (bh.bz / 2) + sign * off; // named face of the REAL host + offset
      bound.push({ disc: p.disc, ifc_class: p.ifc_class, x: bh.x, y: bh.y, z: pz, yaw: horiz === 0 ? 0 : Math.PI / 2,
        storey: p.storey, host: bh.g, mount: mount, prov: 'shim:host-' + hostClass + '-' + mount.toLowerCase(),
        bx: p.bx, by: p.by, bz: p.bz, prim: p.prim, src: p.src, snapDist: +best.toFixed(4) });
    });
    return { bound: bound, refused: refused, refusedList: refusedList, hostCount: hosts.length, hostClass: hostClass, mount: mount };
  }

  // ── ROUTER ────────────────────────────────────────────────────────────────────────
  // Chain rules need real from/to elements in the TARGET building. Residents have no MEP
  // network → honest 0 (refusal), not a fabricated run.
  function route(disc, bdb) {
    var rr = _rows(_dbFor(disc), "SELECT * FROM rule_routing WHERE disc='" + _esc(disc) + "' AND pattern='nn'");
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
  // Same, with the AABB extent — needed for FACE routing (a run's physical line = centre ± half its dominant axis).
  function _loadXYZB(bdb, cls) {
    return _rows(bdb,
      "SELECT m.guid g, t.center_x x, t.center_y y, t.center_z z, t.bbox_x bx, t.bbox_y by_, t.bbox_z bz " +
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
  // ── FACE routing (opt-in) ───────────────────────────────────────────────────────────
  // A duct/pipe RUN connects to a fitting at its END/FACE, not its CENTRE. Centre-nn pairs a large duct by its
  // far centre (inflated gap, wrong partner); FACE-nn measures the node→run LINE distance so the genuine touching
  // run is chosen. NON-INVENT: the line endpoints are MEASURED (centre ± half the dominant AABB axis; rotations are
  // π/2-multiples so the AABB long axis IS the run axis), no invented constant. Default OFF — live dwWalk is unchanged.
  function _segLine(s) {
    var ext = [s.bx || 0, s.by_ || 0, s.bz || 0], ax = 0;
    if (ext[1] > ext[ax]) ax = 1; if (ext[2] > ext[ax]) ax = 2;
    var h = ext[ax] / 2, a = [s.x, s.y, s.z], b = [s.x, s.y, s.z];
    a[ax] -= h; b[ax] += h; return { a: a, b: b };
  }
  function _ptSeg(px, py, pz, a, b) {
    var abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    var apx = px - a[0], apy = py - a[1], apz = pz - a[2];
    var l2 = abx * abx + aby * aby + abz * abz;
    var t = l2 > 0 ? (apx * abx + apy * aby + apz * abz) / l2 : 0;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    var cx = a[0] + t * abx, cy = a[1] + t * aby, cz = a[2] + t * abz;
    return Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy) + (pz - cz) * (pz - cz));
  }
  // For each NODE (fitting/terminal) find the nearest RUN by point-to-LINE distance within bound (spatial-hash on
  // the run's endpoints + midpoint, so a long run that spans many cells is still found from the node's cell).
  function _nnPassFace(nodes, runs, bound) {
    var CELL = bound > 0 ? bound : 1, grid = {};
    var ck = function (a, b, c) { return a + ',' + b + ',' + c; };
    var lines = runs.map(_segLine);
    runs.forEach(function (r, i) {
      var L = lines[i];
      [L.a, L.b, [(L.a[0] + L.b[0]) / 2, (L.a[1] + L.b[1]) / 2, (L.a[2] + L.b[2]) / 2]].forEach(function (q) {
        var k = ck(Math.floor(q[0] / CELL), Math.floor(q[1] / CELL), Math.floor(q[2] / CELL));
        (grid[k] = grid[k] || []).push(i);
      });
    });
    var pairs = [], noNbr = 0, sum = 0;
    nodes.forEach(function (f, fi) {
      var ix = Math.floor(f.x / CELL), iy = Math.floor(f.y / CELL), iz = Math.floor(f.z / CELL);
      var best = Infinity, bj = -1, seen = {};
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) for (var dz = -1; dz <= 1; dz++) {
        var arr = grid[ck(ix + dx, iy + dy, iz + dz)]; if (!arr) continue;
        for (var a = 0; a < arr.length; a++) {
          var si = arr[a]; if (seen[si]) continue; seen[si] = 1;
          if (runs[si].g === f.g) continue;
          var d = _ptSeg(f.x, f.y, f.z, lines[si].a, lines[si].b);
          if (d < best) { best = d; bj = si; }
        }
      }
      if (bj >= 0 && best <= bound) { pairs.push({ ni: fi, ri: bj, gap: best }); sum += best; }
      else { noNbr++; }
    });
    return { pairs: pairs, noNbr: noNbr, mean: pairs.length ? sum / pairs.length : Infinity };
  }
  function routeChains(disc, bdb, opts) {
    // (rule source = _dbFor(disc) below, so a borrowed discipline routes from its own ruleset)
    opts = opts || {};
    var rr = _rows(_dbFor(disc), "SELECT * FROM rule_routing WHERE disc='" + _esc(disc) + "' AND pattern='nn'");
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
      // FACE mode (opt-in): pair each NODE to the nearest RUN by point-to-line distance (the run's real face),
      // not centre-to-centre. The RUN is the *Segment class; the NODE is the other. from_guid/to_guid still follow
      // the rule's from_kind/to_kind. NON-INVENT: real positions + measured AABB line; bounded by the measured gap.
      if (opts.toFace) {
        var fromIsRun = /Segment/.test(r.from_kind);
        var runCls = fromIsRun ? r.from_kind : r.to_kind, nodeCls = fromIsRun ? r.to_kind : r.from_kind;
        var runs = _loadXYZB(bdb, runCls), nodes = _loadXYZ(bdb, nodeCls);
        var fp = _nnPassFace(nodes, runs, bound);
        fp.pairs.forEach(function (pr) {
          var nEl = nodes[pr.ni], rEl = runs[pr.ri];
          var fEl = fromIsRun ? rEl : nEl, tEl = fromIsRun ? nEl : rEl;
          segs.push({ disc: disc, rule: 'nn', from_kind: r.from_kind, to_kind: r.to_kind,
            from_guid: fEl.g, to_guid: tEl.g, from: [fEl.x, fEl.y, fEl.z], to: [tEl.x, tEl.y, tEl.z],
            gap: +pr.gap.toFixed(4), bound: +(+bound).toFixed(4), gapSource: gapSource, mode: 'face' });
        });
        byRule.push({ from: r.from_kind, to: r.to_kind, segs: fp.pairs.length, noNbr: fp.noNbr,
          bound: +(+bound).toFixed(4), gapSource: gapSource, avg_measured: gp.avg, iterDir: 'node→run-face',
          meanGap: +fp.mean.toFixed(4), mode: 'face' });
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
  // opts.shims (optional) = array of host-bind percepts from disc_patterns.db `_shim_attributes` (physically
  // library/ERP.db until the rename slice lands), or any {product_value, host_ifc_class, mount,
  // offset_mm|offset_m, height_mm|height_m, reach_m?, same_storey?}. This is the CALLER-PASSED interim; the
  // hardened spec (§NAMING DIRECTIVE §SHIM) supersedes it with a `rule_shim` table projected into the *_rules.db
  // that dwWalk reads directly — not yet wired (selection-key per disc/ifc_class is an open design point).
  // When supplied AND a percept's discipline (product_value prefix before '_') matches `disc`, the FLOATING
  // density placements are routed through hostBind so the host-bound class (ELEC outlets→wall, grilles→window)
  // ADHERES to a real host instead of scattering mid-room. Count is PRESERVED (bound ∪ refused), refusals kept
  // floating + counted (REFUSE beats fabricate). DEFAULT (no opts.shims) → live walk byte-identical.
  // §SHIM PROJECTION SOURCE: the FIRST-CLASS source is the `rule_shim` table projected into the *_rules.db (read
  // from `_db` via _loadRuleShims) — same flow as routing/placement. A caller-passed opts.shims OVERRIDES it
  // (witness/host override). Both row shapes are accepted: rule_shim carries `disc`+`offset_m`+`priority`; the raw
  // disc_patterns `_shim_attributes` row carries `product_value`(prefix=disc)+`offset_mm`. Returns [] if neither.
  function _loadRuleShims(disc) {
    // disc-aware: when a disc is given, read its shims from _dbFor(disc) (a borrowed discipline carries its own
    // per-fixture rule_shim rows in the borrowed DB). With no disc → primary _db (back-compat).
    try { return _rows(_dbFor(disc), "SELECT * FROM rule_shim"); } catch (e) { return []; }   // table absent → []
  }
  function _discOf(s) { return s.disc != null ? s.disc : String(s.product_value || '').split('_')[0]; }
  function _shimForDisc(shims, disc) {
    if (!shims || !shims.length) return null;
    // disc-level fallback rows = no fixture_ifc_class (NULL/empty). Per-fixture rows are handled by _shimForFixture.
    var m = shims.filter(function (s) { return _discOf(s) === disc && !s.fixture_ifc_class; });
    if (!m.length) m = shims.filter(function (s) { return _discOf(s) === disc; });  // caller-passed raw rows have no col
    if (!m.length) return null;
    // SELECTION KEY (disc-level fallback): a disc may carry >1 shim (ELEC wall+ceiling). Deterministic pick = lowest
    // `priority` (rule_shim stamps SIDE/wall anti-float = 0). Per-fixture-ifc_class refinement = _shimForFixture (§SHIM-SELECT).
    m.sort(function (a, b) { return (a.priority != null ? a.priority : 9) - (b.priority != null ? b.priority : 9); });
    if (m.length > 1) console.log(TAG + ' §SHIM-AMBIG disc=' + disc + ' has ' + m.length + ' disc-level shims — picked ' +
      (m[0].host_ifc_class || '') + '/' + (m[0].mount || '') + ' by priority (no per-fixture row matched)');
    return _normShim(m[0]);
  }
  // Normalize a rule_shim / raw _shim_attributes row to the percept shape hostBind consumes.
  function _normShim(s) {
    return {
      host_ifc_class: s.host_ifc_class, mount: s.mount,
      offset_m: s.offset_m != null ? s.offset_m : (s.offset_mm != null ? s.offset_mm / 1000 : 0),
      height_m: s.height_m != null ? s.height_m : (s.height_mm ? s.height_mm / 1000 : null),
      reach_m: s.reach_m != null ? s.reach_m : 6, same_storey: !!s.same_storey,
      product_value: s.product_value || (_discOf(s) + ':' + s.host_ifc_class + '/' + s.mount)
    };
  }
  // §SHIM-SELECT — the SELECTION KEY: pick the shim by (disc, fixture ifc_class). A per-fixture row
  // (rule_shim.fixture_ifc_class == ifcClass, MEASURED nearest host) wins; else fall back to the disc-level
  // pick (_shimForDisc). This is what stops ELEC ceiling-lights mis-binding to walls: lights carry their own
  // IfcCovering row, wall-outlets their own IfcWall row. Caller-passed raw rows (no fixture_ifc_class column)
  // never match the exact branch → disc-level fallback = byte-identical to the interim path.
  function _shimForFixture(shims, disc, ifcClass) {
    if (!shims || !shims.length) return null;
    var m = shims.filter(function (s) { return _discOf(s) === disc && s.fixture_ifc_class && s.fixture_ifc_class === ifcClass; });
    if (m.length) {
      m.sort(function (a, b) { return (a.priority != null ? a.priority : 9) - (b.priority != null ? b.priority : 9); });
      return _normShim(m[0]);
    }
    return _shimForDisc(shims, disc);
  }
  function dwWalk(disc, bdb, buildingName, opts) {
    if (!_ready) { console.warn(TAG + ' not initialised'); return { disc: disc, refused: true, reason: 'engine not initialised', placed: 0 }; }
    var reps = repRules(disc);
    var sub = substrate(bdb);
    if (!reps.length && !_rows(_dbFor(disc), "SELECT 1 FROM rule_routing WHERE disc='" + _esc(disc) + "' LIMIT 1").length) {
      console.log(TAG + ' §WALK disc=' + disc + ' bldg=' + buildingName + ' REFUSE no-measured-rule');
      return { disc: disc, refused: true, reason: 'no measured rule for ' + disc, placed: 0 };
    }
    if (!sub.length) {
      console.log(TAG + ' §WALK disc=' + disc + ' bldg=' + buildingName + ' REFUSE no-substrate');
      return { disc: disc, refused: true, reason: 'no habitable storeys', placed: 0 };
    }
    var placements = place(disc, sub, bdb);
    // ── HOST-BIND from the PROJECTION: snap floating host-bound placements onto a real host (anti-float),
    // count-preserving. Source = caller opts.shims (override) ELSE the projected `rule_shim` table (the
    // first-class §SHIM flow — same as routing/placement). §SHIM-SELECT made this DEFAULT-ON (2026-06-30): the
    // per-fixture-ifc_class selection key removed the mis-bind risk (ELEC ceiling-lights → IfcCovering, wall-outlets
    // → IfcWall) so the live walk now anti-floats by default. CORRECTNESS-SAFE: a fixture binds only to its MEASURED
    // host when one exists in reach, else it stays floating (REFUSE) — never fabricated, count always preserved.
    // ESCAPE HATCHES: opts.noHostBind=true (or opts.hostBind===false) restores the raw floating generation walk
    // (used by the GENERATION-layer count checks in witness_disc_walk_generalize.js). opts.shims forces the caller
    // override. A discipline with NO matching shim row is a no-op (floats as before). The floating set is GROUPED BY
    // ifc_class and each group binds with its OWN shim; a class with no per-fixture row falls back to the disc-level
    // shim. Caller-passed raw rows (no fixture_ifc_class) → disc-level fallback.
    var hbInfo = null;
    var shimSrc = (opts && opts.shims) || _loadRuleShims(disc);
    var doBind = (opts && opts.shims) ? true : !(opts && (opts.noHostBind || opts.hostBind === false));
    // Only FLOATING density placements (prov 'placed:*') are anti-float candidates. Placements already tacked to a
    // real host by the ref_kind='host' path (prov 'shim:host-*') are LEFT UNTOUCHED — re-binding them would move a
    // correctly-hosted fixture. So host-bind rescues only what actually floats; already-hosted walks are invariant.
    var floating = [], fixed = [];
    placements.forEach(function (p) { (/^placed:/.test(p.prov || '') ? floating : fixed).push(p); });
    if (doBind && floating.length) {
      var stZ = {}; sub.forEach(function (st) { stZ[st.name] = st.z; });
      floating.forEach(function (p) { if (p.storeyZ == null) p.storeyZ = stZ[p.storey]; });
      // group floating by ifc_class → each group picks its own shim via the selection key.
      var byCls = {}; floating.forEach(function (p) { (byCls[p.ifc_class] = byCls[p.ifc_class] || []).push(p); });
      var rebuilt = fixed.slice(), totBound = 0, totRefused = 0, byClassInfo = [], hostsSeen = {}, perceptsSeen = {}, mountsSeen = {}, anyBound = false;
      Object.keys(byCls).forEach(function (cls) {
        var grp = byCls[cls];
        var shim = _shimForFixture(shimSrc, disc, cls);
        if (!shim) { rebuilt = rebuilt.concat(grp); totRefused += 0; return; }   // no shim for class → leave floating
        var hb = hostBind(grp, bdb, shim);
        if (hb.noHost) {
          rebuilt = rebuilt.concat(grp);                                          // host class absent in bldg → kept floating
          console.log(TAG + ' §WALK-HOSTBIND disc=' + disc + '/' + cls + ' percept=' + shim.product_value +
            ' REFUSE no-host (' + shim.host_ifc_class + ' absent) — kept floating');
          byClassInfo.push({ ifc_class: cls, percept: shim.product_value, host: shim.host_ifc_class, mount: shim.mount, bound: 0, refused: grp.length, noHost: true });
          return;
        }
        rebuilt = rebuilt.concat(hb.bound, hb.refusedList || []);                 // count preserved per group
        totBound += hb.bound.length; totRefused += hb.refused; anyBound = anyBound || hb.bound.length > 0;
        if (hb.bound.length) { hostsSeen[shim.host_ifc_class] = 1; perceptsSeen[shim.product_value] = 1; mountsSeen[shim.mount] = 1; }
        byClassInfo.push({ ifc_class: cls, percept: shim.product_value, host: shim.host_ifc_class, mount: shim.mount, bound: hb.bound.length, refused: hb.refused });
        console.log(TAG + ' §WALK-HOSTBIND disc=' + disc + '/' + cls + ' percept=' + shim.product_value + ' host=' +
          shim.host_ifc_class + '/' + shim.mount + ' floating=' + grp.length + ' bound=' + hb.bound.length + ' refused=' + hb.refused + ' (count preserved)');
      });
      if (anyBound || byClassInfo.length) {
        placements = rebuilt;
        var hostKeys = Object.keys(hostsSeen), perceptKeys = Object.keys(perceptsSeen), mountKeys = Object.keys(mountsSeen);
        function _agg(keys) { return keys.length === 1 ? keys[0] : (keys.length ? 'MIXED' : null); }
        hbInfo = { bound: totBound, refused: totRefused, floating: floating.length,
          host: _agg(hostKeys), mount: _agg(mountKeys), percept: _agg(perceptKeys), byClass: byClassInfo };
      }
    }
    var chains = route(disc, bdb);
    var rc = routeChains(disc, bdb);                         // LIVE nn-chain geometry (real on MEP-rich bldgs, 0 on residents)
    console.log(TAG + ' §WALK disc=' + disc + ' bldg=' + buildingName + ' placed=' + placements.length +
      ' chains=' + chains.length + ' chainSegs=' + rc.segs.length + ' storeys=' + sub.length +
      (rc.byRule.length ? ' [' + rc.byRule.map(function (b) { return b.from.replace('Ifc', '') + '→' + b.to.replace('Ifc', '') + ':' + (b.skipped || (b.segs + '/' + (b.segs + b.noNbr))); }).join(' ') + ']' : ''));
    return { disc: disc, refused: false, placed: placements.length, placements: placements, hostBind: hbInfo,
      chains: chains, chainSegs: rc.segs, chainByRule: rc.byRule, storeys: sub.length };
  }

  // The walkable disciplines the measured rules cover — drives the Outliner "Walk" roster so a
  // discipline ABSENT from the open building (e.g. FP on a house) is still walkable. Derived, not whitelisted.
  function disciplines() {
    if (!_ready) return [];
    // Only WALKABLE disciplines — those with a placement or routing rule. (rule_place_order alone, e.g. the
    // generic 'MEP' band, is not walkable: it would always refuse, so it stays off the roster.)
    var r = _db.exec("SELECT disc FROM rule_placement UNION SELECT disc FROM rule_routing");
    var ds = r.length ? r[0].values.map(function (v) { return v[0]; }) : [];
    // §BORROW: borrowed disciplines (e.g. FP from terminal_rules) are walkable too → add to the roster.
    Object.keys(_borrow).forEach(function (d) { if (ds.indexOf(d) < 0) ds.push(d); });
    return ds.filter(function (d) { return d && d !== 'ARC'; });
  }

  var API = { dwInit: dwInit, dwOpen: dwOpen, dwBorrow: dwBorrow, dwBorrowFile: dwBorrowFile, dwWalk: dwWalk, substrate: substrate, place: place, hostBind: hostBind,
    route: route, routeChains: routeChains, gate: gate, repRules: repRules, order: order, clearance: clearance,
    hostWalls: hostWalls, countPer: countPer, occupancy: occupancy,
    _shimForDisc: _shimForDisc, _shimForFixture: _shimForFixture, _loadRuleShims: _loadRuleShims,
    disciplines: disciplines, loadedFile: loadedFile, _ready: function () { return _ready; } };
  ROOT.DiscWalker = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  console.log(TAG + ' module loaded');
})();
