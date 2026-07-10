// disc_walker.js — the ONE engine every discipline walker shares: Placer / Router / Gate,
// reading the MEASURED terminal_rules.db (mined off the Terminal building). Modeller-only;
// loaded locally from ../modeller/terminal_rules.db (NO OCI). The discipline is a DATA filter
// (WHERE disc=?), never a code fork — grep-clean, like the SDG builders.
//
// ⚠ READ docs/internal/WalkerDoctrine.md FIRST — it indexes every sibling spec this file must obey.
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
  // The IndexedDB cache is an OFFLINE OPTIMISATION, never the source of truth — so NO IDB operation may ever block
  // a rules load. Under concurrent IDB use of the SHARED bim_ootb_cache 'dbs' store (scene.js caching the building
  // DB + a fire-and-forget put + this get all contend), an open/get can hang WITHOUT firing success OR error — the
  // classic silent-inactive-transaction failure. That stalled discWalk's pre-walk borrow → the whole Walk tool
  // rendered nothing for the user (W-E2E-WALK proved this; nondeterministic race). Every IDB await is therefore
  // timeout-guarded: a stall resolves to null and _loadDbBuf falls back to a bare network fetch (deterministic, no hang).
  var IDB_TIMEOUT_MS = 1500;
  function _withTimeout(p, ms, fallback) {
    return Promise.race([p, new Promise(function (res) { setTimeout(function () { res(fallback); }, ms); })]);
  }
  function _openCacheDB() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    if (ROOT.APP && ROOT.APP.openCacheDB) { try { return _withTimeout(Promise.resolve(ROOT.APP.openCacheDB()), IDB_TIMEOUT_MS, null); } catch (e) { /* fall through */ } }
    return _withTimeout(new Promise(function (res) {          // no version → current (avoid VersionError drift below scene.js v2)
      var rq = indexedDB.open('bim_ootb_cache');
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { res(null); };
      rq.onblocked = function () { res(null); };              // another connection blocks the open → don't wait, fall back to fetch
    }), IDB_TIMEOUT_MS, null);
  }
  function _idbGet(idb, key) {
    return _withTimeout(new Promise(function (res) {
      try { var rq = idb.transaction('dbs', 'readonly').objectStore('dbs').get(key);
        rq.onsuccess = function () { res(rq.result || null); }; rq.onerror = function () { res(null); };
      } catch (e) { res(null); }
    }), IDB_TIMEOUT_MS, null);                                // a hung readonly tx (store-lock contention) → null → MISS → fetch
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

  // §SPACE-SCOPED piece 2 (SPACE_SCOPED_DISC_INSTALL_VISION.md, 2026-07-10): a real IfcSpace's own bbox,
  // reshaped into the EXACT same {name,z,x0,x1,y0,y1} shape substrate() already produces per storey — so
  // place()/occupancy() need NO new math, just a narrower input. NON-INVENT: the boundary is the space's
  // own measured bbox (elements_meta/element_transforms), nothing inferred or drawn. Returns null (honest
  // REFUSE upstream in dwWalk) if the guid isn't a real IfcSpace row with a resolved transform.
  function spaceAsStorey(bdb, spaceGuid) {
    var r = _rows(bdb, "SELECT m.storey s, t.center_x cx, t.center_y cy, t.center_z cz, " +
      "COALESCE(t.bbox_x,0) bx, COALESCE(t.bbox_y,0) by_ FROM elements_meta m JOIN element_transforms t " +
      "ON m.guid=t.guid WHERE m.guid='" + _esc(spaceGuid) + "' AND m.ifc_class='IfcSpace'")[0];
    if (!r || !r.bx || !r.by_) return null;
    return { name: r.s, z: r.cz, x0: r.cx - r.bx / 2, x1: r.cx + r.bx / 2, y0: r.cy - r.by_ / 2,
      y1: r.cy + r.by_ / 2, n: 1, spaceGuid: spaceGuid };
  }

  // ── SPACE-SCHEDULE PLACEMENT (Step 2 PLACE of the geometry-hell fix, 2026-07-10) ──────────
  // The Java-era generative placer solved fixture placement in Oct-Dec (schedule per space type ×
  // offset semantics × real room bbox — reproduced a real compile EXACTLY, 43/43, W-SCHED-MINE).
  // Step 1 mined that MEASURED data into rule_space_schedule/rule_space_type/rule_space_alias/
  // rule_code_spacing (projected, verbatim). This section is the JS transcription of the PROVEN
  // Java semantics (SpaceScheduleDAO.resolveQty/computePosition + MEPDevicePlacer.distributeInstance
  // + PlacementCollectorVisitor's FLOOR half-height lift and co-location spacing) — not a new design.
  // OPT-IN via dwWalk(..., {schedule:true}) so every pre-existing walk path stays byte-identical;
  // the default flips only after the DX walkback RSGT (W1-W5) numbers are reviewed.
  // LOD400 LAW (WalkerDoctrine §11, UNBREAKABLE): a schedule device with NO real mesh
  // (geometry_hash NULL, stamped by the miner) is REFUSED with a §-log — never a fallback shape.

  // All REAL spaces of a building. Two real sources, tried in order:
  //  (a) elements_meta IfcSpace rows (piece-1 re-extraction path, e.g. Clinic — 269 spaces);
  //  (b) spatial_structure IfcSpace rows WITH measured center/size (older DAGCompiler tessellation
  //      path, e.g. Duplex — 21 real rooms). Synthetic flood-fill rows (guid 'RM_%' / name '≈',
  //      compile_rooms.py heuristic, ~5/21 recall) are EXCLUDED — they are guesses, not extraction.
  // LongName (the space-TYPE key, e.g. 'Bathroom 1') rides in element_name for (a) and in
  // object_type for (b) (stamped verbatim from the source IFC by scripts/stamp_space_longnames.py).
  function spacesOf(bdb) {
    var out = _rows(bdb, "SELECT m.guid guid, COALESCE(m.element_name, m.guid) label, m.storey storey, " +
      "t.center_x cx, t.center_y cy, t.center_z cz, COALESCE(t.bbox_x,0) bx, COALESCE(t.bbox_y,0) by_, " +
      "COALESCE(t.bbox_z,0) bz FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid " +
      "WHERE m.ifc_class='IfcSpace'").filter(function (s) { return s.bx > 0.1 && s.by_ > 0.1; });
    // §LIVEWIRE hardening (2026-07-10, caught by W-DW-LIVEWIRE L4 on real SampleCastle_ARC.db): the
    // shipped ARC residents mostly carry NO spatial_structure table at all — probe sqlite_master first
    // (same idiom as placeMeasured's rule_placement probe) instead of throwing out of the whole walk.
    if (!out.length && _rows(bdb, "SELECT 1 FROM sqlite_master WHERE type='table' AND name='spatial_structure'").length) {
      out = _rows(bdb, "SELECT guid, COALESCE(NULLIF(object_type,''), name) label, name room_no, " +
        "parent_guid, center_x cx, center_y cy, center_z cz, COALESCE(size_x,0) bx, " +
        "COALESCE(size_y,0) by_, COALESCE(size_z,0) bz FROM spatial_structure WHERE type='IfcSpace' " +
        "AND guid NOT LIKE 'RM\\_%' ESCAPE '\\' AND name NOT LIKE '%≈%'")
        .filter(function (s) { return s.bx > 0.1 && s.by_ > 0.1; });
      var storeyName = {};
      _rows(bdb, "SELECT guid, name FROM spatial_structure WHERE type='IfcBuildingStorey'")
        .forEach(function (r) { storeyName[r.guid] = r.name; });
      out.forEach(function (s) { s.storey = storeyName[s.parent_guid] || 'Unknown'; });
    }
    return out.map(function (s) {
      return { guid: s.guid, label: s.label, storey: s.storey,
        x0: s.cx - s.bx / 2, x1: s.cx + s.bx / 2, y0: s.cy - s.by_ / 2, y1: s.cy + s.by_ / 2,
        z0: s.cz - s.bz / 2, z1: s.cz + s.bz / 2 };
    });
  }

  // LongName → schedule space_type: normalize (upper, spaces→_, strip trailing numbering — the
  // same normalization H6's deriveSpaceType applied), then direct rule_space_type match, then
  // rule_space_alias ('LIVING_ROOM'→LIVING, 'HALLWAY'→CORRIDOR, ...). null = no schedule (skip).
  function _spaceTypeFor(disc, label) {
    if (!label) return null;
    var norm = String(label).toUpperCase().replace(/[\s]+/g, '_').replace(/[_\s]*\d+$/, '').trim();
    if (!norm) return null;
    var db = _dbFor(disc);
    if (_rows(db, "SELECT 1 FROM rule_space_type WHERE value='" + _esc(norm) + "'").length) return norm;
    var a = _rows(db, "SELECT space_type_id st FROM rule_space_alias WHERE alias='" + _esc(norm) + "'");
    return a.length ? a[0].st : null;
  }

  // Ported VERBATIM from SpaceScheduleDAO.resolveQty (§6.12.4 §8): per_area first;
  // orderQty 99/blank → qty_normal, 0 → qty_max, N → budget cap; always ≥ qty_min.
  function _resolveQty(orderQty, e, areaM2) {
    var qty;
    if (e.per_area_normal > 0) qty = Math.ceil(areaM2 * e.per_area_normal);
    else if (orderQty === 0) qty = e.qty_max;
    else if (orderQty === 99 || orderQty < 0) qty = e.qty_normal;
    else qty = orderQty;
    return Math.max(e.qty_min, qty);
  }

  // Ported from SpaceScheduleDAO.computePosition: x by x_ref (MIN edge / MAX edge / CENTER),
  // y by y_ref, z by z_rule (FLOOR: z0+off, CEILING: z1-off, MID: middle).
  function _schedBasePos(sp, e) {
    var px = (sp.x0 + sp.x1) / 2, py = (sp.y0 + sp.y1) / 2, pz = (sp.z0 + sp.z1) / 2;
    if (e.x_ref === 'MIN') px = sp.x0 + (e.edge_x_m || 0);
    else if (e.x_ref === 'MAX') px = sp.x1 - (e.edge_x_m || 0);
    if (e.y_ref === 'MIN') py = sp.y0 + (e.edge_y_m || 0);
    else if (e.y_ref === 'MAX') py = sp.y1 - (e.edge_y_m || 0);
    if (e.z_rule === 'FLOOR') pz = sp.z0 + (e.z_offset_m || 0);
    else if (e.z_rule === 'CEILING') pz = sp.z1 - (e.z_offset_m || 0);
    return [px, py, pz];
  }

  // Ported from MEPDevicePlacer.distributeInstance (qty>1 spreads evenly, spacing len/(n+1))
  // with ONE deliberate correction the DX walkback witness caught on first run (W3 WALL-HOST/
  // FACING, 2026-07-10): Java spread along the space's DOMINANT axis, which drags a wall-anchored
  // rule (x_ref/y_ref MIN|MAX, e.g. WALL_SPACED outlets) OFF its wall into mid-room — Java then
  // compensated post-hoc with collision-shift + ShimMatcher wall-snap. Here the fixture stays ON
  // its anchored wall at source: spread runs ALONG the wall (perpendicular to the anchored edge);
  // only non-anchored rules (CENTER/CENTER, e.g. ceiling grids) use the dominant axis.
  function _schedDistribute(sp, base, i, total, e) {
    var wallX = e && (e.x_ref === 'MIN' || e.x_ref === 'MAX');   // anchored to a ±X wall
    var wallY = e && (e.y_ref === 'MIN' || e.y_ref === 'MAX');   // anchored to a ±Y wall
    var alongX;
    if (wallX && !wallY) alongX = false;                          // spread along the wall (Y)
    else if (wallY && !wallX) alongX = true;                      // spread along the wall (X)
    else alongX = (sp.x1 - sp.x0) >= (sp.y1 - sp.y0);             // corner/centre → dominant axis
    var min = alongX ? sp.x0 : sp.y0, len = alongX ? (sp.x1 - sp.x0) : (sp.y1 - sp.y0);
    var pos = min + (len / (total + 1)) * (i + 1);
    return alongX ? [pos, base[1], base[2]] : [base[0], pos, base[2]];
  }

  // Wall-mounted fixtures face INTO the room: yaw from the edge the offset rule anchored to.
  // Convention: yaw = atan2(dir_y, dir_x) of the facing direction (radians, world XY).
  function _schedFacing(e) {
    if (e.x_ref === 'MIN') return 0;                 // on -X wall → faces +X
    if (e.x_ref === 'MAX') return Math.PI;           // on +X wall → faces -X
    if (e.y_ref === 'MIN') return Math.PI / 2;       // on -Y wall → faces +Y
    if (e.y_ref === 'MAX') return -Math.PI / 2;      // on +Y wall → faces -Y
    return 0;
  }

  // ── REAL-WALL SNAP for wall-anchored schedule rules (DX walkback W3 finding, 2026-07-10) ──
  // A space's bbox edge is NOT always a wall (open-plan boundaries, irregular rooms) — anchoring
  // to the bbox edge left switches/fans floating on wall-less sides. Same doctrine as Java's
  // ShimMatcher and hostBind: mount on the NEAREST REAL WALL FACE. The fixture keeps its
  // rule-driven along-wall spread + z; only the mount is corrected to real geometry:
  //   pos'  = nearest wall's inner face + (device_depth/2 + 10mm) toward the room centre,
  //   yaw   = the face normal pointing INTO the room, clamped inside the space bbox.
  // Honest REFUSE-to-snap: no real wall within REACH (1.5m) of the space → keep the bbox-edge
  // position, return snapped:false (caller logs §SCHED-NOWALL) — never an invented wall.
  var _SNAP_REACH = 1.5;
  function _spaceWalls(bdb, sp, geoDb) {
    // BBOX-INTERSECT selection (a long perimeter wall's CENTER can sit far outside this space —
    // filtering by center missed real bordering walls) + _trueMidpoint correction (the measured
    // raw-placement-origin defect on walls, up to 3.12m on Duplex — same fix occupancy() uses).
    var pad = 0.5;
    var raw = _rows(bdb, "SELECT m.guid g, t.center_x x, t.center_y y, t.center_z z, " +
      "COALESCE(t.bbox_x,0) bx, COALESCE(t.bbox_y,0) by_, COALESCE(t.bbox_z,0) bz, " +
      "COALESCE(t.rotation_x,0) rx, COALESCE(t.rotation_y,0) ry, COALESCE(t.rotation_z,0) rot " +
      "FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class LIKE '%Wall%' " +
      "AND (t.center_x + COALESCE(t.bbox_x,0)/2) >= " + (sp.x0 - pad) +
      " AND (t.center_x - COALESCE(t.bbox_x,0)/2) <= " + (sp.x1 + pad) +
      " AND (t.center_y + COALESCE(t.bbox_y,0)/2) >= " + (sp.y0 - pad) +
      " AND (t.center_y - COALESCE(t.bbox_y,0)/2) <= " + (sp.y1 + pad));
    return raw.map(function (w) {
      var mid = _trueMidpoint(bdb, w.g, { x: w.x, y: w.y, z: w.z, rx: w.rx, ry: w.ry, rot: w.rot }, geoDb);
      return { x: mid.verified ? mid.x : w.x, y: mid.verified ? mid.y : w.y, bx: w.bx, by_: w.by_,
        z: w.z, bz: w.bz };
    });
  }
  function _snapToWall(spWalls, sp, pos, halfDepth) {
    var best = null, bestD = Infinity;
    spWalls.forEach(function (w) {
      // the wall must EXIST at the fixture's mounting height — a downstand/bulkhead segment
      // whose z-band misses the fixture is not a mount (W3 finding: switches snapped to
      // above-door wall segments that stop 1.5m over their heads).
      if (w.bz > 0 && (pos[2] < w.z - w.bz / 2 - 0.05 || pos[2] > w.z + w.bz / 2 + 0.05)) return;
      var dx = Math.max(Math.abs(pos[0] - w.x) - w.bx / 2, 0);
      var dy = Math.max(Math.abs(pos[1] - w.y) - w.by_ / 2, 0);
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) { bestD = d; best = w; }
    });
    // No wall in reach of the rule's anchor point = the rule anchored to an OPEN boundary
    // (open-plan edge). A wall-mounted device still needs A wall: relocate to the nearest
    // REAL z-valid wall of the room (any distance inside it), reported via moved. Refuse
    // only when the room has no z-valid wall at all — never an invented mount.
    if (!best) return { snapped: false, pos: pos, yaw: null };
    var moved = bestD > _SNAP_REACH ? bestD : 0;
    var cx = (sp.x0 + sp.x1) / 2, cy = (sp.y0 + sp.y1) / 2;
    var standoff = (halfDepth || 0.05) + 0.01;
    var p = pos.slice(), yaw;
    if (best.bx >= best.by_) {                       // wall runs along X → mount on a ±Y face
      var faceY = (cy >= best.y) ? (best.y + best.by_ / 2) : (best.y - best.by_ / 2);
      var dirY = (cy >= best.y) ? 1 : -1;
      p[1] = faceY + dirY * standoff;
      p[0] = Math.min(Math.max(p[0], Math.max(best.x - best.bx / 2, sp.x0)), Math.min(best.x + best.bx / 2, sp.x1));
      yaw = dirY > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {                                          // wall runs along Y → mount on a ±X face
      var faceX = (cx >= best.x) ? (best.x + best.bx / 2) : (best.x - best.bx / 2);
      var dirX = (cx >= best.x) ? 1 : -1;
      p[0] = faceX + dirX * standoff;
      p[1] = Math.min(Math.max(p[1], Math.max(best.y - best.by_ / 2, sp.y0)), Math.min(best.y + best.by_ / 2, sp.y1));
      yaw = dirX > 0 ? 0 : Math.PI;
    }
    p[0] = Math.min(Math.max(p[0], sp.x0 + 0.02), sp.x1 - 0.02);
    p[1] = Math.min(Math.max(p[1], sp.y0 + 0.02), sp.y1 - 0.02);
    return { snapped: true, pos: p, yaw: yaw, moved: moved };
  }

  // Place one discipline's scheduled devices into every REAL space (or one space via
  // opts.spaceGuid). Returns { placements, spaces, skippedSpaces, refused } — refused =
  // LOD400-law refusals (no real mesh), honest and counted, never substituted.
  function placeSchedule(disc, bdb, opts) {
    opts = opts || {};
    if (!_rows(_dbFor(disc), "SELECT 1 FROM sqlite_master WHERE type='table' AND name='rule_space_schedule'").length) {
      return { placements: [], spaces: -1, spacesUsed: 0, skippedSpaces: [], refused: {},
        noRules: 'rules DB has no rule_space_schedule (run build/project_rule_space_schedule.py)' };
    }
    var orderQty = (opts.orderQty == null) ? 99 : opts.orderQty;
    var all = spacesOf(bdb);
    if (opts.spaceGuid) all = all.filter(function (s) { return s.guid === opts.spaceGuid; });
    // §W7-COLLISION cross-disc coordination: opts.avoid = prior discs' placements. Checked in FULL
    // (not per-space): adjacent space bboxes overlap (Hallway×Stair), so a same-space scan misses
    // real cross-space overlaps.
    var avoidAll = opts.avoid || [];
    var out = [], refused = {}, skipped = [], used = 0;
    all.forEach(function (sp) {
      var stype = _spaceTypeFor(disc, sp.label);
      if (!stype) { skipped.push(sp.label); return; }
      var sched = _rows(_dbFor(disc), "SELECT * FROM rule_space_schedule WHERE disc='" + _esc(disc) +
        "' AND space_type_id='" + _esc(stype) + "'");
      if (!sched.length) return;
      used++;
      var area = (sp.x1 - sp.x0) * (sp.y1 - sp.y0);
      var perAxisCount = {};                          // co-location spreader (Java GAP-10 port)
      var spWalls = null;                             // real walls near this space (lazy, once)
      var spaceStart = out.length;                    // §W7-COLLISION: this space's own placements
      sched.forEach(function (e) {
        var qty = _resolveQty(orderQty, e, area);
        if (qty <= 0) return;
        if (!e.geometry_hash) {                       // LOD400 LAW: no real mesh → REFUSE
          refused[e.device_id] = (refused[e.device_id] || 0) + qty;
          console.log(TAG + ' §LOD400-REFUSE ' + disc + '/' + e.device_id + ' ×' + qty + ' in ' +
            sp.label + ' — no real mesh in the catalog; refused, never a fallback shape');
          return;
        }
        var base = _schedBasePos(sp, e);
        var hz = (e.dim_z_m || 0.1) / 2;
        var wallAnchored = (e.x_ref === 'MIN' || e.x_ref === 'MAX' || e.y_ref === 'MIN' || e.y_ref === 'MAX');
        for (var i = 0; i < qty; i++) {
          var pos = (qty === 1) ? base.slice() : _schedDistribute(sp, base, i, qty, e);
          var yaw = _schedFacing(e);
          if (wallAnchored) {                          // W3 finding: mount on a REAL wall face,
            if (spWalls === null) spWalls = _spaceWalls(bdb, sp, opts.geoDb);   // not the space bbox edge
            var snap = _snapToWall(spWalls, sp, pos, (e.dim_y_m || e.dim_x_m || 0.1) / 2);
            if (snap.snapped) {
              pos = snap.pos; yaw = snap.yaw;
              if (snap.moved) console.log(TAG + ' §SCHED-RELOC ' + disc + '/' + e.device_id + ' in ' +
                sp.label + ' — rule anchored to an OPEN boundary; mounted on the nearest REAL wall ' +
                snap.moved.toFixed(2) + 'm away (real geometry, never an invented mount)');
            } else console.log(TAG + ' §SCHED-NOWALL ' + disc + '/' + e.device_id + ' in ' + sp.label +
              ' — room has no z-valid real wall; kept rule position (never an invented wall)');
          }
          if (e.host_surface === 'FLOOR') pos[2] += hz;      // W-FRIDGE-Z: bottom on floor
          // co-located same-position devices (e.g. two CEILING_CENTER classes): spread by the
          // measured code spacing (rule_code_spacing max_spacing/2), 0.5m fallback — Java GAP-10.
          var key = pos[0].toFixed(2) + '_' + pos[1].toFixed(2) + '_' + pos[2].toFixed(2);
          var idx = (perAxisCount[key] = (perAxisCount[key] || 0) + 1) - 1;
          if (idx > 0) {
            var spc = _rows(_dbFor(disc), "SELECT max_spacing_m m FROM rule_code_spacing WHERE " +
              "element_type='" + _esc(e.device_id) + "' AND (space_type='" + _esc(stype) + "' OR space_type='ANY') " +
              "ORDER BY CASE WHEN space_type='" + _esc(stype) + "' THEN 0 ELSE 1 END LIMIT 1");
            var step = (spc.length && spc[0].m > 0) ? spc[0].m / 2 : 0.5;
            if ((sp.x1 - sp.x0) >= (sp.y1 - sp.y0)) pos[0] = Math.min(pos[0] + idx * step, sp.x1 - 0.05);
            else pos[1] = Math.min(pos[1] + idx * step, sp.y1 - 0.05);
          }
          // §W7-COLLISION (BIMEyes item 3, found by the pairwise check 2026-07-10): the code-spacing
          // step alone doesn't clear WIDE co-located devices (CEILING_FAN 1.2m × 0.5m step → 48 real
          // bbox overlaps), and separate per-disc walks can't see each other (fan×diffuser, outlet×
          // sink). Every device slides in 0.1m steps until its MEASURED bbox clears (a) fixtures
          // already placed in this space this walk and (b) the caller-passed `opts.avoid` list
          // (prior discs' placements — cross-disc coordination). Direction: wall-anchored devices
          // slide ALONG their wall run (yaw+90°, staying mounted); free devices along the room's
          // spread axis. Dims are measured; the Java code-spacing base/step semantics are unchanged.
          var dirx, diry;
          if (wallAnchored) { dirx = Math.cos((yaw || 0) + Math.PI / 2); diry = Math.sin((yaw || 0) + Math.PI / 2); }
          else if ((sp.x1 - sp.x0) >= (sp.y1 - sp.y0)) { dirx = 1; diry = 0; } else { dirx = 0; diry = 1; }
          function _clashAt(px, py, pz2) {
            var q, o;
            for (q = 0; q < out.length; q++) {
              o = out[q];
              if (Math.abs(pz2 - o.z) >= ((e.dim_z_m || 0.2) + (o.bz || 0.2)) / 2) continue;
              if (Math.abs(px - o.x) < ((e.dim_x_m || 0.2) + (o.bx || 0.2)) / 2 &&
                  Math.abs(py - o.y) < ((e.dim_y_m || 0.2) + (o.by || 0.2)) / 2) return true;
            }
            for (q = 0; q < avoidAll.length; q++) {
              o = avoidAll[q];
              if (Math.abs(pz2 - o.z) >= ((e.dim_z_m || 0.2) + (o.bz || 0.2)) / 2) continue;
              if (Math.abs(px - o.x) < ((e.dim_x_m || 0.2) + (o.bx || 0.2)) / 2 &&
                  Math.abs(py - o.y) < ((e.dim_y_m || 0.2) + (o.by || 0.2)) / 2) return true;
            }
            return false;
          }
          var basePos = pos.slice(), movedClear = 0, cleared = !_clashAt(pos[0], pos[1], pos[2]);
          [1, -1].forEach(function (sgn) {                     // try +dir first, then −dir from base
            if (cleared) return;
            pos[0] = basePos[0]; pos[1] = basePos[1];
            for (var guard = 0; guard < 200; guard++) {
              var nxp = Math.min(Math.max(pos[0] + 0.1 * sgn * dirx, sp.x0 + 0.05), sp.x1 - 0.05);
              var nyp = Math.min(Math.max(pos[1] + 0.1 * sgn * diry, sp.y0 + 0.05), sp.y1 - 0.05);
              if (Math.abs(nxp - pos[0]) < 1e-9 && Math.abs(nyp - pos[1]) < 1e-9) break;   // clamped
              pos[0] = nxp; pos[1] = nyp; movedClear += 0.1;
              if (!_clashAt(pos[0], pos[1], pos[2])) { cleared = true; break; }
            }
          });
          if (!cleared) { pos[0] = basePos[0]; pos[1] = basePos[1]; console.log(TAG + ' §SCHED-CLASH ' + disc + '/' + e.device_id + ' in ' + sp.label + ' — no clear position in this space (kept rule position, residual overlap reported)'); }
          else if (movedClear > 0.05) console.log(TAG + ' §SCHED-CLEAR ' + disc + '/' + e.device_id + ' in ' +
            sp.label + ' — slid to clear a co-located fixture bbox' + (wallAnchored ? ' (along its wall run)' : ''));
          out.push({ disc: disc, ifc_class: 'IfcFlowTerminal', device: e.device_id,
            x: pos[0], y: pos[1], z: pos[2], storey: sp.storey, spaceGuid: sp.guid,
            space: sp.label, rot: yaw,
            bx: e.dim_x_m || null, by: e.dim_y_m || null, bz: e.dim_z_m || null,
            geometry_hash: e.geometry_hash, element_name: e.element_name,
            prim: _primFor('IfcFlowTerminal'),
            prov: 'sched:space-schedule:' + e.placement_rule, src: e.standard || '' });
        }
      });
    });
    return { placements: out, spaces: all.length, spacesUsed: used, skippedSpaces: skipped, refused: refused };
  }

  // ── §NOSPACES (item 2, RESUME_DISC_WALKER_ENVELOPE_BOUND.md, 2026-07-10): measured-band placement
  // for buildings with NO real IfcSpace rows (Terminal-class). Each rule_placement row IS the zone: its
  // ABSOLUTE measured z-band + n_measured + src_storey_area_m2. Count = n_measured × bandArea/srcArea
  // (the walked building's own rules ⇒ ratio≈1; envelope is the ceiling, §DW-CAP style). Position =
  // envelope-bound grid cells from real ARC elements whose vertical EXTENT intersects the band (true
  // geometric overlap, no invented pad); pitch = the row's own measured mean spacing √(srcArea/n);
  // z = the measured band midpoint. ANTI-CHEAT: the cell query EXCLUDES every rules-generatable class
  // (derived from rule_placement itself, no hand list) — the walker never consults MEP rows even when
  // the caller hands it a full extraction. LOD400 law (WalkerDoctrine §11): each class carries its
  // MINED dominant real mesh hash (rule_mesh_binding, projected by build/project_rule_mesh_binding.py)
  // or the whole class REFUSEs — never a fallback shape.
  function placeMeasured(disc, bdb, opts) {
    var db = _dbFor(disc);
    if (!_rows(db, "SELECT 1 FROM sqlite_master WHERE type='table' AND name='rule_placement'").length)
      return { noRules: 'rules DB has no rule_placement' };
    var rows = _rows(db, "SELECT * FROM rule_placement WHERE disc='" + _esc(disc) +
      "' AND n_measured>0 AND z_band_lo IS NOT NULL AND z_band_hi IS NOT NULL AND src_storey_area_m2>0");
    if (!rows.length) return { noRules: 'no measured z-band rule_placement rows for ' + disc };
    var bind = {};
    if (_rows(db, "SELECT 1 FROM sqlite_master WHERE type='table' AND name='rule_mesh_binding'").length)
      _rows(db, "SELECT ifc_class, geometry_hash FROM rule_mesh_binding WHERE disc='" + _esc(disc) + "'")
        .forEach(function (b) { bind[b.ifc_class] = b.geometry_hash; });
    var genCls = _rows(db, 'SELECT DISTINCT ifc_class FROM rule_placement')
      .map(function (r) { return "'" + _esc(r.ifc_class) + "'"; }).join(',');
    // §NOSPACES frame reconciliation: the bands were baked in the 2026-06-28 building-datum frame;
    // the extraction was later re-datumed to site coords. The MEASURED offset (median of each rule
    // row's own src_guids' site z − band mid, stamped by project_rule_mesh_binding.py) converts
    // band → the walked db's frame. Missing key → 0 (bands already in the db's frame).
    var zOffRow = _rows(db, "SELECT value FROM rules_meta WHERE key='z_datum_offset'");
    var zOff = zOffRow.length ? parseFloat(zOffRow[0].value) || 0 : 0;
    var out = [], refused = {}, zones = 0;
    rows.forEach(function (r) {
      r = Object.assign({}, r);
      r.z_band_lo += zOff; r.z_band_hi += zOff;               // site-frame band from here on
      var ghash = bind[r.ifc_class] || null;
      if (!ghash) {                                           // LOD400 REFUSE — no mined real mesh
        refused[r.ifc_class] = (refused[r.ifc_class] || 0) + r.n_measured;
        console.log(TAG + ' §LOD400-REFUSE ' + disc + '/' + r.ifc_class + ' ×' + r.n_measured +
          ' band=[' + r.z_band_lo + ',' + r.z_band_hi + '] (no rule_mesh_binding row — no real mesh, never a fallback shape)');
        return;
      }
      var pitch = Math.max(0.5, Math.sqrt(r.src_storey_area_m2 / r.n_measured));
      var els = _rows(bdb,
        'SELECT t.center_x cx, t.center_y cy, t.bbox_x bx, t.bbox_y by_ FROM elements_meta em ' +
        'JOIN element_transforms t ON t.guid = em.guid ' +
        'WHERE em.ifc_class NOT IN (' + genCls + ",'IfcSpace') " +
        'AND t.center_z + t.bbox_z/2 >= ' + r.z_band_lo + ' AND t.center_z - t.bbox_z/2 <= ' + r.z_band_hi);
      var seen = {}, cells = [];
      var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      els.forEach(function (e) {
        x0 = Math.min(x0, e.cx - e.bx / 2); x1 = Math.max(x1, e.cx + e.bx / 2);
        y0 = Math.min(y0, e.cy - e.by_ / 2); y1 = Math.max(y1, e.cy + e.by_ / 2);
        var k = Math.round(e.cx / pitch) + '_' + Math.round(e.cy / pitch);
        if (!seen[k]) { seen[k] = 1; cells.push({ x: Math.round(e.cx / pitch) * pitch, y: Math.round(e.cy / pitch) * pitch }); }
      });
      // cell quantization can round an edge cell past the measured envelope — clamp back inside
      // (envelope-bound by definition; the envelope itself is measured, not invented).
      cells.forEach(function (c) {
        c.x = Math.min(Math.max(c.x, x0), x1); c.y = Math.min(Math.max(c.y, y0), y1);
      });
      if (!cells.length) {                                    // no ARC envelope in the band → honest skip
        console.log(TAG + ' §NOSPACES-NOCELLS ' + disc + '/' + r.ifc_class + ' band=[' + r.z_band_lo + ',' + r.z_band_hi + '] 0 ARC cells — skipped');
        return;
      }
      // bandArea: SAME XY-bbox footprint formula the mining side used to stamp src_storey_area_m2
      // (stamp_terminal_src_area.py band_area(): min/max of center ± bbox/2) — parity keeps the
      // ratio ≈1 when a building walks its own measured rules; cells stay the position sampler.
      var bandArea = (x1 - x0) * (y1 - y0);
      var count = Math.round(r.n_measured * bandArea / r.src_storey_area_m2);
      // a thin band (ceiling grids: 0.14–1.6 m) holds few ARC elements — when the area-bound count
      // exceeds the ARC cells, TOP UP from a uniform grid at the row's own MEASURED cadence
      // (spacing_x/y_m mined with the rule) across the measured band bbox. Logged, never silent.
      if (count > cells.length) {
        var gx = r.spacing_x_m > 0 ? r.spacing_x_m : pitch, gy = r.spacing_y_m > 0 ? r.spacing_y_m : pitch;
        var added = 0;
        for (var ux = x0 + gx / 2; ux <= x1 && cells.length < count; ux += gx) {
          for (var uy = y0 + gy / 2; uy <= y1 && cells.length < count; uy += gy) {
            var uk = Math.round(ux / pitch) + '_' + Math.round(uy / pitch);
            if (!seen[uk]) { seen[uk] = 1; cells.push({ x: ux, y: uy }); added++; }
          }
        }
        if (added) console.log(TAG + ' §NOSPACES-TOPUP ' + disc + '/' + r.ifc_class + ' band=[' + r.z_band_lo.toFixed(2) + ',' + r.z_band_hi.toFixed(2) + '] +' + added + ' measured-cadence grid positions (ARC cells ' + (cells.length - added) + ' < count ' + count + ')');
      }
      var placeN = Math.min(count, cells.length), stride = cells.length / Math.max(1, placeN);
      if (count > cells.length) console.log(TAG + ' §DW-CAP ' + disc + '/' + r.ifc_class + ' band=[' + r.z_band_lo + ',' + r.z_band_hi + '] placed=' + placeN + ' of ' + count + ' (envelope is the ceiling)');
      var z = (r.z_band_lo + r.z_band_hi) / 2;
      for (var c = 0; c < placeN; c++) {
        var cell = cells[Math.floor(c * stride)];
        out.push({ disc: disc, ifc_class: r.ifc_class, x: cell.x, y: cell.y, z: z,
          storey: r.storey_scope, band: [r.z_band_lo, r.z_band_hi],
          bx: r.bbox_dx || null, by: r.bbox_dy || null, bz: r.bbox_dz || null,
          geometry_hash: ghash, prim: _primFor(r.ifc_class),
          prov: 'placed:measured-band', src: r.provenance || '' });
      }
      zones++;
      console.log(TAG + ' §NOSPACES-ZONE ' + disc + '/' + r.ifc_class + ' band=[' + r.z_band_lo + ',' + r.z_band_hi +
        '] n_measured=' + r.n_measured + ' ratio=' + (bandArea / r.src_storey_area_m2).toFixed(2) + ' placed=' + placeN);
    });
    return { placements: out, zones: zones, refused: refused };
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
  function hostWalls(bdb, storeyName, spaceBBox) {
    var sql = "SELECT t.center_x cx, t.center_y cy, t.rotation_z rot, m.guid guid " +
      "FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid " +
      "WHERE m.storey='" + _esc(storeyName) + "' AND m.ifc_class LIKE '%Wall%'";
    // §SPACE-SCOPED piece 2: the ref_kind='host' placement path (wall-tacked fixtures, e.g. FP alarms) is a
    // SEPARATE code path from occupancy()/place()'s density branch — it doesn't go through occupancy() at
    // all, so it needs its OWN space-scoping. Same shape as _occElements' narrowing: restrict to walls whose
    // CENTER falls inside the space's own real bbox, when one is given. Storey-wide calls (spaceBBox omitted)
    // are unchanged.
    if (spaceBBox) {
      sql += " AND t.center_x BETWEEN " + spaceBBox.x0 + " AND " + spaceBBox.x1 +
        " AND t.center_y BETWEEN " + spaceBBox.y0 + " AND " + spaceBBox.y1;
    }
    return _rows(bdb, sql);
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
  // §BUG-A-OCC-SCOPE (RESUME_DISC_WALKER_ENVELOPE_BOUND.md ⛔ item 1, MEASURED 2026-07-09): occupancy() reads
  // EVERY element on a storey to build the footprint mask that density/single fixture placement snaps to —
  // and unlike routing classes (pipes/fittings/ducts, measured max delta 0.21m — negligible, left uncorrected),
  // it's dominated by IfcWall*, which carries the SAME raw-placement-line-origin defect proven in hostBind
  // (measured true-midpoint delta up to 3.12m on Duplex, 1.03m SampleCastle). Corrected here the same way.
  // Cached per (bdb,storey) since occupancy() is called once per placement RULE for the same storey (place()
  // loops rules×storeys) — recomputing _trueMidpoint per element on every call would be O(rules) redundant work.
  // `geoDb` (optional, §GEO-SPLIT): threaded through to `_trueMidpoint` for residents whose geometry table
  // lives in a separate handle (Terminal_geo.db). Cache is keyed by `bdb` only — a given bdb is always paired
  // with the same geoDb within one walk, so this doesn't need a second cache dimension.
  var _occMidCache = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;
  function _occElements(bdb, st, geoDb) {
    // §SPACE-SCOPED piece 2: a space-scoped "storey" (from spaceAsStorey) carries the SAME name as its
    // real storey, so it needs its OWN cache slot — key on name+spaceGuid, not name alone.
    var cacheKey = st.spaceGuid ? (st.name + '::' + st.spaceGuid) : st.name;
    var byStorey = _occMidCache ? _occMidCache.get(bdb) : null;
    if (!byStorey) { byStorey = {}; if (_occMidCache) _occMidCache.set(bdb, byStorey); }
    if (byStorey[cacheKey]) return byStorey[cacheKey];
    // §SPACE-SCOPED blind-spot-1 (SPACE_SCOPED_DISC_INSTALL_VISION.md, MEASURED 2026-07-10): IfcSpace rows
    // are open floor area, not solid mass — piece 1's extractor fix made them real rows in elements_meta for
    // 5/8 buildings, so without this exclusion the footprint mask would treat empty room area as a no-go
    // obstruction, wrongly starving fixture placement inside the very spaces it's meant to serve.
    var sql = "SELECT m.guid g, t.center_x cx, t.center_y cy, t.center_z cz, COALESCE(t.bbox_x,0) bx, COALESCE(t.bbox_y,0) by_, " +
      "COALESCE(t.rotation_x,0) rx, COALESCE(t.rotation_y,0) ry, COALESCE(t.rotation_z,0) rot " +
      "FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.storey='" + _esc(st.name) +
      "' AND m.ifc_class<>'IfcSpace'";
    // §SPACE-SCOPED piece 2: when scoped to one space (st.spaceGuid set via spaceAsStorey), further narrow
    // to elements whose CENTER falls inside that space's own real bbox — same query shape, one more AND.
    // Reuses st's own x0/x1/y0/y1 (the space's measured boundary, set by spaceAsStorey), no new math.
    if (st.spaceGuid) {
      sql += " AND t.center_x BETWEEN " + st.x0 + " AND " + st.x1 +
        " AND t.center_y BETWEEN " + st.y0 + " AND " + st.y1;
    }
    var raw = _rows(bdb, sql);
    var out = raw.map(function (e) {
      var mid = _trueMidpoint(bdb, e.g, { x: e.cx, y: e.cy, z: e.cz, rx: e.rx, ry: e.ry, rot: e.rot }, geoDb);
      return { cx: mid.verified ? mid.x : e.cx, cy: mid.verified ? mid.y : e.cy, bx: e.bx, by_: e.by_ };
    });
    byStorey[cacheKey] = out;
    return out;
  }
  function occupancy(bdb, st, cell, geoDb) {
    cell = Math.max(cell > 0 ? cell : 1, 0.5);
    var els = _occElements(bdb, st, geoDb);
    var occ = {};
    els.forEach(function (e) {
      var i0 = Math.floor((e.cx - e.bx / 2) / cell), i1 = Math.floor((e.cx + e.bx / 2) / cell);
      var j0 = Math.floor((e.cy - e.by_ / 2) / cell), j1 = Math.floor((e.cy + e.by_ / 2) / cell);
      for (var i = i0; i <= i1 && i < i0 + _OCC_SPAN; i++)
        for (var j = j0; j <= j1 && j < j0 + _OCC_SPAN; j++) occ[i + ',' + j] = 1;
    });
    var cells = Object.keys(occ).map(function (k) {
      var ij = k.split(','); return { x: (+ij[0] + 0.5) * cell, y: (+ij[1] + 0.5) * cell };
    });
    // §SPACE-SCOPED piece 2: _occElements already restricts to elements CENTERED inside the space (when
    // st.spaceGuid is set), but a straddling element's own bbox can still generate a cell that pokes past
    // the space's real boundary (e.g. a slab/covering whose center is barely inside the room). Clip the
    // returned candidate cells to the space's own bbox so every fixture position this feeds into place()
    // stays inside the real boundary the user picked. Storey-wide (non-scoped) calls are BYTE-IDENTICAL —
    // this only fires when a space is the input, never for the existing whole-storey path.
    if (st.spaceGuid) {
      cells = cells.filter(function (c) { return c.x >= st.x0 && c.x <= st.x1 && c.y >= st.y0 && c.y <= st.y1; });
    }
    return cells;
  }

  // ── PLACER ──────────────────────────────────────────────────────────────────────
  var _MAX_PER_STOREY = 50000;                               // legacy spacing-tile backstop (never silent)
  function place(disc, storeys, bdb, geoDb) {
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
            var cells = occupancy(bdb, st, rp.sx, geoDb);
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
          var walls = hostWalls(bdb, st.name, st.spaceGuid ? st : null);
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
          var scells = occupancy(bdb, st, rp.sx > 0 ? rp.sx : 1, geoDb);
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
  // §BUG-A-TRUE-MIDPOINT (RESUME_DISC_WALKER_ENVELOPE_BOUND.md): element_transforms.center is the raw IFC
  // placement-line origin, NOT a bbox midpoint -- proven off by up to a wall's own half-length on real,
  // non-centred walls (measured: Duplex wall 2O2Fr$t4X7Zf8NOew3FNqI, Y off by 0.81m; bbox_x/y/z themselves ARE
  // reliable, computed as maxXYZ-minXYZ by the extractor -- only the CENTRE is suspect). Recover the TRUE
  // world-bbox midpoint from the host's OWN real mesh (component_geometries via element_instances, mirroring
  // scripts/test_orientation_proof.py's proven P2 BBOX_RECONSTRUCT: R(rotation) @ local_mesh_bbox_corners +
  // centre = world bbox). Available today on Duplex/SampleHouse/SampleCastle (100% wall coverage measured);
  // Terminal has neither this nor elements_rtree -- falls back to the raw (unverified) centre rather than
  // inventing one; callers get `verified:false` and log the uncertainty once per host, never silently trusting
  // an unmeasured number as ground truth (mirrors the existing §DW-NONCARDINAL refuse-and-log precedent).
  // §ROTATION-CONVENTION FIX (RESUME_DISC_WALKER_ENVELOPE_BOUND.md item 3, 2026-07-09): this used to build a
  // literal XYZ rotation matrix straight from (rotation_x, rotation_y, rotation_z) -- but the ACTUAL production
  // renderer takes ONE OF TWO DIFFERENT CODE PATHS depending on whether the element has a genuine 3-axis tilt
  // (modeller/bonsai_library.js:76, `if (pl.rotX || pl.rotY)`, mirrored by arc_editable.js:211's `if (rx||ry)`):
  //   - rx||ry truthy (Terminal doors/windows/furniture/proxies -- 325 real elements): render applies
  //     `new THREE.Euler(rotX, rotZRad, -rotY)` (default 'XYZ' order) -- the render's Y-axis angle is
  //     rotation_z and its Z-axis angle is -rotation_y, NOT rotation_y/rotation_z taken literally.
  //   - rx=ry=0 (the COMMON case -- ordinary wall/door/window yaw, ALL of Duplex/SampleHouse/SampleCastle and
  //     most of Terminal): render takes the SEPARATE plain-Z-axis-yaw path (bonsai_library.js:92-97, standard
  //     cos/sin about Z using rotation_z directly) -- NOT the Euler remap at all.
  // ⚠ A FIRST VERSION OF THIS FIX APPLIED THE EULER REMAP UNCONDITIONALLY and broke the common case: with
  // rx=ry=0, `_eulerXYZ_toQuat(0, rz, 0)` is a PURE Y-AXIS rotation, silently rotating every ordinary yawed
  // wall about the wrong axis (caught by scripts/witness_true_midpoint.js's T5 regression, 65->33 outside on
  // real Duplex -- diffed against a `git stash` baseline to confirm it was a genuine regression, not a
  // pre-existing flake, before concluding anything). Branching on `rx||ry` (matching the render's OWN branch
  // condition exactly) fixes this: the rx=ry=0 case reduces to the ORIGINAL cardinal-Z formula, byte-identical
  // to pre-fix behaviour (zero regression risk on the common case) -- VERIFIED against real Terminal_ARC.db
  // elements (325 with non-zero rotation_y: IfcBuildingElementProxy 242, IfcDoor 36, IfcFurniture 43,
  // IfcWindow 4) using the REAL browser-side THREE.js as ground truth: old (unconditional-literal) formula
  // diverged up to 1.1569m on the tilt cases, this fix matches the real renderer to 0.00000000m across every
  // real case tested (tilt + zero-rotation controls). eulerXYZ_toQuat/quatToMat9 = the EXACT quaternion/matrix
  // math extracted verbatim from modeller/lib/three.core.min.js by the embed-8-arc rotation-consolidation
  // session (prompts/Modeller/DISC_Walker/embed8_scripts/finalize_all_8.js), already proven bit-for-bit
  // correct there (max error 1e-13 to 1e-17) -- reused here, not reinvented.
  function _eulerXYZ_toQuat(ex, ey, ez) {
    var c1 = Math.cos(ex / 2), c2 = Math.cos(ey / 2), c3 = Math.cos(ez / 2), s1 = Math.sin(ex / 2), s2 = Math.sin(ey / 2), s3 = Math.sin(ez / 2);
    return { x: s1 * c2 * c3 + c1 * s2 * s3, y: c1 * s2 * c3 - s1 * c2 * s3, z: c1 * c2 * s3 + s1 * s2 * c3, w: c1 * c2 * c3 - s1 * s2 * s3 };
  }
  function _quatToMat9(q) {
    var x = q.x, y = q.y, z = q.z, w = q.w, x2 = x + x, y2 = y + y, z2 = z + z,
      xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    return [1 - (yy + zz), xy + wz, xz - wy, xy - wz, 1 - (xx + zz), yz + wx, xz + wy, yz - wx, 1 - (xx + yy)];
  }
  function _eulerMat3(rx, ry, rz) {
    if (rx || ry) {                                   // genuine 3-axis tilt -> render's Euler(rotX,rotZ,-rotY) remap
      var q = _eulerXYZ_toQuat(rx, rz, -ry);
      var m = _quatToMat9(q);
      return [[m[0], m[3], m[6]], [m[1], m[4], m[7]], [m[2], m[5], m[8]]];
    }
    var cc = Math.cos(rz), sc = Math.sin(rz);          // rx=ry=0 -> render's OTHER path: plain cardinal-Z yaw
    return [[cc, -sc, 0], [sc, cc, 0], [0, 0, 1]];
  }
  // §BUG-A CORRECTION (found by an independent reviewer session, re-verified here before touching code): the
  // LIVE building DBs (e.g. ~/bim-ootb/modeller/Duplex_extracted.db, the actual 65/267-outside evidence DB) name
  // this table `base_geometries`, NOT `component_geometries` -- this repo's own committed `deploy/buildings/*`
  // copies happen to use the other name, which is why the fix "worked" there and did NOTHING on the real evidence
  // DB (confirmed: live Duplex has 0 `component_geometries` rows, 170/170 populated `base_geometries` rows).
  // `scripts/measure_narrowphase.js` already carries this exact two-name fallback precedent for the same reason
  // -- mirrored here, not invented.
  var _GEOM_TABLES = ['component_geometries', 'base_geometries'];
  // §GEO-SPLIT (2026-07-09, mirrors real_geometry.js's buildGeometryIndex(db,geoDb), already proven live for
  // Terminal in the modeller): `geoDb` is an OPTIONAL second sql.js handle carrying the geometry table, for
  // residents where element_instances (in `bdb`) and component_geometries (250MB, in a SEPARATE file --
  // Terminal_geo.db) can't be sql.js-JOINed because they're independently-opened databases. Defaults to `bdb`
  // (single-file residents: SampleHouse/Duplex/SampleCastle) -- byte-identical old behaviour when omitted.
  function _geomRow(bdb, ghash, geoDb) {
    var g = geoDb || bdb;
    for (var i = 0; i < _GEOM_TABLES.length; i++) {
      try {
        var r = _rows(g, "SELECT vertices vb FROM " + _GEOM_TABLES[i] + " WHERE geometry_hash='" + _esc(ghash) + "'")[0];
        if (r && r.vb && r.vb.length) return r;
      } catch (e) { /* table doesn't exist on this DB -- try the next name */ }
    }
    return null;
  }
  function _trueMidpoint(bdb, guid, w, geoDb) {
    var fallback = { x: w.x, y: w.y, z: w.z, verified: false };
    var inst, geo;
    try { inst = _rows(bdb, "SELECT geometry_hash gh FROM element_instances WHERE guid='" + _esc(guid) + "'")[0]; }
    catch (e) { return fallback; }                                // no element_instances table on this DB
    if (!inst || !inst.gh) return fallback;
    geo = _geomRow(bdb, inst.gh, geoDb);
    if (!geo || !geo.vb || !geo.vb.length) return fallback;
    var u8 = (geo.vb instanceof Uint8Array) ? geo.vb : new Uint8Array(geo.vb);
    var n3 = Math.floor(u8.byteLength / 4 / 3) * 3;
    var f32 = new Float32Array(u8.buffer, u8.byteOffset, n3);
    if (f32.length < 3) return fallback;
    var lMin = [Infinity, Infinity, Infinity], lMax = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i + 2 < f32.length; i += 3) {
      for (var k = 0; k < 3; k++) { var v = f32[i + k]; if (v < lMin[k]) lMin[k] = v; if (v > lMax[k]) lMax[k] = v; }
    }
    var R = _eulerMat3(w.rx || 0, w.ry || 0, w.rot || 0);
    var wMin = [Infinity, Infinity, Infinity], wMax = [-Infinity, -Infinity, -Infinity];
    [0, 1].forEach(function (xi) { [0, 1].forEach(function (yi) { [0, 1].forEach(function (zi) {
      var c = [xi ? lMax[0] : lMin[0], yi ? lMax[1] : lMin[1], zi ? lMax[2] : lMin[2]];
      var wx = R[0][0] * c[0] + R[0][1] * c[1] + R[0][2] * c[2] + w.x;
      var wy = R[1][0] * c[0] + R[1][1] * c[1] + R[1][2] * c[2] + w.y;
      var wz = R[2][0] * c[0] + R[2][1] * c[1] + R[2][2] * c[2] + w.z;
      if (wx < wMin[0]) wMin[0] = wx; if (wx > wMax[0]) wMax[0] = wx;
      if (wy < wMin[1]) wMin[1] = wy; if (wy > wMax[1]) wMax[1] = wy;
      if (wz < wMin[2]) wMin[2] = wz; if (wz > wMax[2]) wMax[2] = wz;
    }); }); });
    return { x: (wMin[0] + wMax[0]) / 2, y: (wMin[1] + wMax[1]) / 2, z: (wMin[2] + wMax[2]) / 2, verified: true };
  }

  // `geoDb` (optional, §GEO-SPLIT): a SEPARATE sql.js handle carrying the geometry table for residents where
  // it can't live in `bdb` itself (Terminal_geo.db, 250MB, kept apart from Terminal_meta.db). Omitted → old
  // single-file behaviour, unchanged (SampleHouse/Duplex/SampleCastle all embed their own geometry).
  function hostBind(placements, bdb, shim, geoDb, spaceBBox) {
    shim = shim || {};
    var reach = shim.reach_m != null ? shim.reach_m : 6;
    var hostClass = shim.host_ifc_class || 'IfcWall';
    var mount = (shim.mount || 'SIDE').toUpperCase();
    var hostSql = "SELECT m.guid g, m.storey st, t.center_x x, t.center_y y, t.center_z z, t.bbox_x bx, t.bbox_y by_, t.bbox_z bz, " +
      "t.rotation_x rx, t.rotation_y ry, t.rotation_z rot " +
      "FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class LIKE '%" + _esc(hostClass) + "%'";
    // §SPACE-SCOPED piece 2 — EXTENDS the vision doc's original "hostBind needs no change" note (revised,
    // not silently overridden — see SPACE_SCOPED_DISC_INSTALL_VISION.md): the TOP/BOTTOM/CENTER mount branch
    // below re-snaps a placement's x/y to the HOST's own centroid (bh.x/bh.y), not the fixture's original
    // position. Measured on real Clinic data: without this, an ACMV diffuser generated correctly inside
    // CENTER WAITING's own bbox got re-snapped to a same-storey IfcCovering panel centered ~1m OUTSIDE the
    // room — the density/occupancy scoping alone does not guarantee the FINAL bound position stays inside
    // the space the user picked, because hostBind's host search is storey/building-wide by design. This
    // optional 5th param (spaceBBox) narrows host CANDIDATES to the space when the caller opts in — every
    // EXISTING caller (4-arg calls) is byte-identical; only dwWalk's own space-scoped path passes it.
    if (spaceBBox) {
      hostSql += " AND t.center_x BETWEEN " + spaceBBox.x0 + " AND " + spaceBBox.x1 +
        " AND t.center_y BETWEEN " + spaceBBox.y0 + " AND " + spaceBBox.y1;
    }
    var hosts = _rows(bdb, hostSql);
    if (!hosts.length) return { bound: [], refused: placements.length, noHost: true, hostClass: hostClass };
    var unverifiedHosts = 0;
    hosts.forEach(function (h) {
      var mid = _trueMidpoint(bdb, h.g, h, geoDb);
      h.tx = mid.x; h.ty = mid.y; h.tz = mid.z; h.midVerified = mid.verified;
      if (!mid.verified) {
        unverifiedHosts++;
        console.log(TAG + ' §DW-UNVERIFIED-MIDPOINT host=' + h.g + ' ifc=' + hostClass +
          ' (no mesh geometry on this DB -- raw center used, may be off up to half the host length; RESUME_DISC_WALKER_ENVELOPE_BOUND.md §BUG-A)');
      }
    });
    var off = shim.offset_m || 0;
    var bound = [], refused = 0, refusedList = [];

    if (mount === 'SIDE') {
      // ── wall-face projection (the original, unchanged geometry) ──
      var lines = hosts.map(function (w) {
        var horiz = w.bx >= w.by_ ? 0 : 1;                       // dominant horizontal axis = host run
        var hlen = (horiz === 0 ? w.bx : w.by_) / 2, thick = (horiz === 0 ? w.by_ : w.bx);
        var a = [w.tx, w.ty], b = [w.tx, w.ty]; a[horiz] -= hlen; b[horiz] += hlen;   // §BUG-A: TRUE midpoint, not raw centre
        return { a: a, b: b, horiz: horiz, thick: thick, w: w };
      });
      placements.forEach(function (p) {
        var best = Infinity, bl = null, bpt = null;
        for (var i = 0; i < lines.length; i++) {
          var L = lines[i], abx = L.b[0] - L.a[0], aby = L.b[1] - L.a[1];
          // §NOSPACES stacked-host disambiguation (see TOP/BOTTOM path): band-carrying placements
          // only bind walls that vertically intersect their own measured z-band.
          if (p.band && (L.w.tz + L.w.bz / 2 < p.band[0] || L.w.tz - L.w.bz / 2 > p.band[1])) continue;
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
          bx: p.bx, by: p.by, bz: p.bz, prim: p.prim, src: p.src, snapDist: +best.toFixed(4), midVerified: bl.w.midVerified,
          band: p.band, geometry_hash: p.geometry_hash });      // §NOSPACES carry-through (undefined on legacy walks)
      });
      return { bound: bound, refused: refused, refusedList: refusedList, hostCount: hosts.length, hostClass: hostClass, mount: mount, unverifiedHosts: unverifiedHosts };
    }

    // ── TOP / BOTTOM / CENTER: nearest host by XY, bind to its top/bottom/centre face ──
    // CENTER (z = host centre + signed offset) is the natural anchor when the device rides at a fixed rise off
    // the host centre (e.g. SC vent grilles sit above their same-storey window centre). TOP/BOTTOM add a
    // half-extent to reach the named face. `shim.same_storey` constrains host selection to the placement's own
    // storey — required for vertically STACKED hosts (windows stack floor-on-floor; nearest-XY alone is ambiguous).
    // §BUG-A-OCC-SCOPE (2026-07-09, supersedes the earlier "deliberately RAW" note): the earlier scope-out was
    // because the MINED offset (VENT_WINDOW_SHIM) was measured against the window's RAW centre_z, so correcting
    // only the apply side introduced a fresh mismatch. MEASURED (scripts/witness_hostbind_agnostic.js H0): the
    // 7 SC grille-associated windows carry a REAL, consistent Z true-midpoint defect (true_z = raw_z − 0.0835m,
    // MAD≈0 — not noise), so VENT_WINDOW_SHIM's 0.415m raw-measured offset was itself contaminated (true rise
    // is 0.498m). Now BOTH sides use the true midpoint (`tz`, mining re-measured accordingly) — self-consistent.
    // XY uses `bh.x/bh.y` still (no window XY defect was ever measured; §BUG-A's proven defect is wall-linear,
    // not point-host XY — same "don't overfit past the evidence" scope discipline as before, now for X/Y only).
    var sign = mount === 'BOTTOM' ? -1 : 1;                       // TOP=+half above, BOTTOM=−half below, CENTER=face 0
    var faceHalf = mount === 'CENTER' ? 0 : 1;                    // CENTER rides the centre; TOP/BOTTOM the face
    var sameStorey = !!shim.same_storey;
    placements.forEach(function (p) {
      var best = Infinity, bh = null;
      for (var i = 0; i < hosts.length; i++) {
        var h = hosts[i];
        if (sameStorey && p.storey != null && h.st !== p.storey) continue;  // stacked-host disambiguation
        // §NOSPACES stacked-host disambiguation for measured-band placements (no storey names to match):
        // a candidate host must VERTICALLY INTERSECT the placement's own measured z-band — nearest-XY
        // alone binds a ground-floor light to a level-3 covering. No-band placements are untouched.
        if (p.band && (h.tz + h.bz / 2 < p.band[0] || h.tz - h.bz / 2 > p.band[1])) continue;
        var d = Math.hypot(p.x - h.x, p.y - h.y);                 // XY proximity = host association
        if (d < best) { best = d; bh = h; }
      }
      if (!bh || best > reach) { refused++; refusedList.push(p); return; }  // no host in reach → honest refuse
      var horiz = bh.bx >= bh.by_ ? 0 : 1;                        // host run axis (for yaw)
      var pz = bh.tz + sign * faceHalf * (bh.bz / 2) + sign * off; // named face of the TRUE host + offset
      bound.push({ disc: p.disc, ifc_class: p.ifc_class, x: bh.x, y: bh.y, z: pz, yaw: horiz === 0 ? 0 : Math.PI / 2,
        storey: p.storey, host: bh.g, mount: mount, prov: 'shim:host-' + hostClass + '-' + mount.toLowerCase(),
        bx: p.bx, by: p.by, bz: p.bz, prim: p.prim, src: p.src, snapDist: +best.toFixed(4), midVerified: bh.midVerified,
        band: p.band, geometry_hash: p.geometry_hash });        // §NOSPACES carry-through (undefined on legacy walks)
    });
    return { bound: bound, refused: refused, refusedList: refusedList, hostCount: hosts.length, hostClass: hostClass, mount: mount, unverifiedHosts: unverifiedHosts };
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
    a[ax] -= h; b[ax] += h; return { a: a, b: b, ax: ax };
  }
  // §FACE-SURFACE: MEASURED half-extent of an element's cross-section PERPENDICULAR to a run axis (mean of the two
  // perp half-extents). centre-to-line over-states a bulky element's gap by ~this much; subtracting it (clamped ≥0)
  // yields the surface-to-surface gap. NON-INVENT: bbox-derived, never a constant; 0 bbox → 0 (centre fallback).
  function _perpHalf(bx, by, bz, ax) {
    var e = [bx || 0, by || 0, bz || 0], perp = [0, 1, 2].filter(function (i) { return i !== ax; });
    return (e[perp[0]] / 2 + e[perp[1]] / 2) / 2;
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
      if (bj >= 0 && best <= bound) {
        // §FACE-SURFACE: surface-to-surface gap = centre-line gap − both perp half-sections (measured), clamped ≥0.
        var ax = lines[bj].ax, r = runs[bj];
        var gSurf = Math.max(0, best - _perpHalf(r.bx, r.by_, r.bz, ax) - _perpHalf(f.bx, f.by_, f.bz, ax));
        pairs.push({ ni: fi, ri: bj, gap: best, gapSurface: gSurf }); sum += best;
      }
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
        var runs = _loadXYZB(bdb, runCls), nodes = _loadXYZB(bdb, nodeCls);  // nodes WITH bbox → §FACE-SURFACE gapSurface
        var fp = _nnPassFace(nodes, runs, bound);
        fp.pairs.forEach(function (pr) {
          var nEl = nodes[pr.ni], rEl = runs[pr.ri];
          var fEl = fromIsRun ? rEl : nEl, tEl = fromIsRun ? nEl : rEl;
          segs.push({ disc: disc, rule: 'nn', from_kind: r.from_kind, to_kind: r.to_kind,
            from_guid: fEl.g, to_guid: tEl.g, from: [fEl.x, fEl.y, fEl.z], to: [tEl.x, tEl.y, tEl.z],
            gap: +pr.gap.toFixed(4), gapSurface: +pr.gapSurface.toFixed(4),  // §FACE-SURFACE: surface-to-surface gap
            bound: +(+bound).toFixed(4), gapSource: gapSource, mode: 'face' });
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

  // ── PATTERN-TOPOLOGY BRIDGE (RESUME_MODELLER_WALK_SUBSTRATE.md §CAMPAIGN M1, REDIRECTED 2026-07-07: bridge
  // ARC-derived anchors into routewalker.js's ALREADY-PROVEN ad_mep_pattern engine — do not reinvent a second,
  // less-tested generation mechanism here) ──────────────────────────────────────────────────────────────────
  // routewalker.js's _rwApplyPattern/_rwPairSegments is a faithful JS port of RouteWalker.java (same node-type
  // mapping, same nearest-unmatched-anchor pairing, same GRADIENT slope rule, same ARC-clash skip — the engine
  // DAGCompiler's RouteWalkerTest.java exercises 7/7 against HospitalAuckland, PR #450/#456). It is normally
  // anchor-DEPENDENT: it reads PRE-MINED ad_mep_anchor rows keyed to one of 3 hardcoded building names via
  // mep_rw.db (the "drop a BOM assembly" flow, modeller.html autoRouteMEP). This bridges the SAME pairing engine
  // to an ARBITRARY opened ARC-only building by deriving the anchor roles LIVE, mirroring defaultSeed()'s own
  // technique (a real element, heuristically picked, human-confirmable):
  //   METER   = the service-entry door (defaultSeed, IfcDoor)            — CW's mains connection point.
  //   STACK   = the nearest real stair/riser core (defaultSeed, IfcStair) — SP's vertical drain-stack point
  //             (ad_mep_anchor's schema has no separate STACK anchor_type — a METER-typed anchor becomes a
  //             STACK NODE only when the pattern discipline is SP; _rwToNodeType's own mapping, unchanged here).
  //   FIXTURE = this discipline's OWN measured density-placed fixtures (place()) — already non-invented.
  //   JUNCTION= real corridor WAYPOINTS, sampled off SeedTrunk.planTrunk's already-proven, wall-avoiding
  //             Dijkstra backbone (reuses seed_trunk's corridor derivation for WAYPOINT POSITIONS ONLY — the
  //             actual pairing/gradient/clash DECISION is routewalker's own _rwPairSegments, untouched).
  // SCOPE, MEASURED not assumed: `ad_mep_pattern` carries rows for exactly two disciplines, 'CW' (pressurised
  // cold-water supply) and 'SP' (gravity soil/waste drain) — both PLUMBING sub-networks (routewalker.js's own
  // RW_DISC_TO_COORD: CW/SP→DWATER/DRAIN, same table PLB→DWATER). So this bridges disc_walker's 'PLB' discipline
  // to a CW pass + an SP pass. ELEC/ACMV/FP have ZERO ad_mep_pattern rows (checked directly against ERP.db) —
  // they honestly REFUSE via this bridge (no pattern to walk), which is the correct refuse-beats-fabricate
  // answer, not a bug: covering them would need someone to MINE+author their own pattern rows first (a data
  // task), not a code generalization this bridge can manufacture. NON-INVENT: every anchor is a real element
  // position (door/stair/measured-generated-fixture) or a real wall-avoiding corridor waypoint; the pairing/
  // gradient/clash logic is routewalker.js's own proven code, called, never re-implemented.
  var _RW_PATTERN_DISC = { PLB: ['CW', 'SP'] };                 // disc_walker disc -> routewalker pattern discipline(s)
  // real IfcStair columns, deduped by XY (mirrors modeller.html's own _seedRisers) — the riser/STACK candidates
  // SeedTrunk climbs and this bridge treats as the SP discipline's STACK proxy.
  function _risers(bdb) {
    var r = _rows(bdb, "SELECT m.guid g, t.center_x x, t.center_y y FROM elements_meta m JOIN element_transforms t " +
      "ON m.guid=t.guid WHERE m.ifc_class LIKE '%Stair%'");
    var out = [];
    r.forEach(function (s) { if (!out.some(function (o) { return Math.hypot(o.x - s.x, o.y - s.y) < 0.5; })) out.push(s); });
    return out;
  }
  // Real STR members (columns/beams/struts) as clash boxes — SAME shape as routewalker.js's own
  // _rwLoadArcEnvelope ({cx,cy,cz,w,d,h}), so the two arrays concat directly into ONE envelope _rwPairSegments
  // already knows how to clash-check against. FOLLOW-UP fix (RESUME_MODELLER_WALK_SUBSTRATE.md, found by
  // witness_str_mep_clash_gate.js M2, 1/63 real penetration): routewalker.js's OWN clash gate
  // (_rwLoadArcEnvelope) only ever queried ARC walls/slabs/roof/covering — a real STR column was never in the
  // bus a pattern-bridged pipe run was checked against. This is the ARC-envelope's exact sibling query, just
  // discipline='STR' + the structural classes, so a routed run now honestly refuses (or the pairing engine
  // routes AROUND it — same clash-skip `_rwPairSegments` already applies to ARC) when it would penetrate real
  // structure, not just real architecture.
  function _strEnvelope(bdb) {
    return _rows(bdb,
      "SELECT t.center_x cx, t.center_y cy, t.center_z cz, t.bbox_x w, t.bbox_y d, t.bbox_z h " +
      "FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid " +
      "WHERE m.discipline='STR' AND m.ifc_class IN ('IfcColumn','IfcBeam','IfcMember')")
      .filter(function (b) { return b.w > 0 && b.d > 0 && b.h > 0; });
  }
  // Correct axis-aligned segment-vs-envelope-box overlap — the REAL fix, found while wiring the STR envelope
  // above. routewalker.js's OWN _rwPairSegments clash-skip calls _rwClashesWithArc with a box shaped
  // [crossSection, crossSection, LEN] — i.e. it ALWAYS treats the THIRD (Z) axis as the pipe's long axis,
  // regardless of whether the run is actually horizontal (X or Y, the common case for a corridor/pattern run).
  // A horizontal run's clash box is therefore a thin 0.075m×0.075m COLUMN at its midpoint that never reaches
  // sideways along the run's real path — so adding _strEnvelope to arcEnv alone did NOT change the segment
  // count (verified: re-ran witness_route_pattern_bridge.js/witness_str_mep_clash_gate.js, chainSegs unchanged,
  // the 2.6cm penetration still present) — the missing envelope was never the actual blocker, the box
  // orientation was. NOT fixed inside routewalker.js itself (a separate file with its own witness suite this
  // session is careful not to widen scope into) — instead this is an ADDITIONAL, correctly-oriented AABB
  // check disc_walker.js applies as an authoritative POST-filter on _rwPairSegments' output. Safe because every
  // pattern step declares a direction_axis (X/Y/Z) — these runs are axis-aligned BY CONSTRUCTION, so a plain
  // axis-aligned box (spanning the segment's real extent on whichever axis it actually moves along, inflated
  // by the pipe's real half cross-section on the other two) is exact, not an approximation.
  function _envelopeClash(from, to, envelope, halfWidth) {
    var minX = Math.min(from[0], to[0]) - halfWidth, maxX = Math.max(from[0], to[0]) + halfWidth;
    var minY = Math.min(from[1], to[1]) - halfWidth, maxY = Math.max(from[1], to[1]) + halfWidth;
    var minZ = Math.min(from[2], to[2]) - halfWidth, maxZ = Math.max(from[2], to[2]) + halfWidth;
    for (var i = 0; i < envelope.length; i++) {
      var e = envelope[i];
      var ox = Math.min(maxX, e.cx + e.w / 2) - Math.max(minX, e.cx - e.w / 2);
      var oy = Math.min(maxY, e.cy + e.d / 2) - Math.max(minY, e.cy - e.d / 2);
      var oz = Math.min(maxZ, e.cz + e.h / 2) - Math.max(minZ, e.cz - e.h / 2);
      if (ox > 0 && oy > 0 && oz > 0) return true;
    }
    return false;
  }
  // Sample SeedTrunk's corridor backbone every `step` metres into JUNCTION-role waypoint anchors. Pure position
  // derivation — no pairing decision made here (that is entirely _rwPairSegments' job on the anchors we hand it).
  function _corridorJunctions(bdb, seed, placements, sub, opts) {
    var ST = (opts && opts.SeedTrunk) || ROOT.SeedTrunk;
    if (!ST) return [];
    var risers = _risers(bdb);
    var net = ST.planTrunk(bdb, placements, seed, risers, { storeys: sub, groundStorey: seed.storey });
    if (net.refused === true) return [];
    var STEP = (opts && opts.junctionStep > 0) ? opts.junctionStep : 3, out = [], seen = {}, n = 0;
    net.storeys.forEach(function (st) {
      (st.edges || []).forEach(function (poly) {
        var acc = 0;
        for (var i = 1; i < poly.length; i++) {
          var a = poly[i - 1], b = poly[i];
          acc += Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]) + (b[2] - a[2]) * (b[2] - a[2]));
          if (acc >= STEP) {
            var k = b[0].toFixed(2) + ',' + b[1].toFixed(2) + ',' + b[2].toFixed(2);
            if (!seen[k]) { seen[k] = 1; out.push({ anchorId: 'JN' + (n++), anchorType: 'GENERIC', x: b[0], y: b[1], z: b[2], storey: st.name }); }
            acc = 0;
          }
        }
      });
    });
    return out;
  }
  function routePattern(disc, bdb, opts) {
    opts = opts || {};
    var loadSteps = opts.loadPatternSteps || ROOT._rwLoadPatternSteps;
    var pair = opts.pairSegments || ROOT._rwPairSegments;
    var loadArc = opts.loadArcEnvelope || ROOT._rwLoadArcEnvelope;
    if (typeof loadSteps !== 'function' || typeof pair !== 'function') {
      return { segs: [], refused: true, reason: 'routewalker.js pattern engine not loaded' };
    }
    // routewalker.js's _rwLoadPatternSteps reads its OWN module-scope _rwDb (populated only after rwInit(SQL,
    // baseUrl) resolves, today only awaited by the BOM-drop flow's _rwReadyOnce()). Rather than reach into that
    // async init from here (this function stays sync, like routeChains/place — no new async surface on the
    // live walk path), honestly refuse when it hasn't run yet; the caller wires rwInit() before Walk (see
    // RESUME_MODELLER_WALK_SUBSTRATE.md M1 follow-on note) or passes opts.loadPatternSteps/opts.pairSegments
    // directly (a witness's own explicit rwInit, as this file's tests do).
    if (!opts.loadPatternSteps && !(opts.rwReady != null ? opts.rwReady : ROOT._rwReady)) {
      return { segs: [], refused: true, reason: 'routewalker.js mep_rw.db pattern table not loaded (call rwInit first)' };
    }
    var rwDiscs = (opts.rwPatternDisc || _RW_PATTERN_DISC)[disc];
    if (!rwDiscs) return { segs: [], refused: true, reason: 'no ad_mep_pattern coverage for ' + disc + ' (CW/SP only, PLB-mapped)' };
    var sub = opts.storeys || substrate(bdb);
    if (!sub.length) return { segs: [], refused: true, reason: 'no habitable storeys' };
    var placements = opts.placements || place(disc, sub, bdb);
    if (!placements.length) return { segs: [], refused: true, reason: 'no measured placement rule for ' + disc };
    var seed = (opts.seed && opts.seed.guid) ? opts.seed : defaultSeed(bdb, {});
    if (seed.refused) return { segs: [], refused: true, reason: seed.reason };
    var riser = defaultSeed(bdb, { classes: ['IfcStair'] });    // STACK proxy; refusal here is honest (e.g. single-storey)
    var junctions = _corridorJunctions(bdb, seed, placements, sub, opts);
    var fixtureAnchors = placements.map(function (p, i) {
      return { anchorId: 'FX' + i, anchorType: 'FIXTURE', x: p.x, y: p.y, z: p.z, storey: p.storey };
    });
    // FOLLOW-UP fix: the clash envelope is ARC (walls/slabs/roof/covering, routewalker.js's own query) PLUS
    // real STR members (columns/beams/struts) — a routed run must clash-refuse against BOTH, not just ARC.
    // opts.arcEnvelope (a caller override) is honoured AS-IS (no STR appended) — that override existed before
    // this fix and callers using it explicitly opt out of the default envelope entirely (e.g. a witness that
    // wants to isolate the ARC-only behaviour). opts.strEnvelope lets a caller override the STR side alone.
    var arcEnv = opts.arcEnvelope ||
      (typeof loadArc === 'function' ? loadArc(bdb) : []).concat(opts.strEnvelope || _strEnvelope(bdb));
    var segs = [], byRule = [];
    rwDiscs.forEach(function (rwd) {
      // Defensive boundary: routewalker.js's rwInit has a KNOWN latent bug (found this pass, not fixed here —
      // out of scope, a separate file with its own witness suite) — it sets its readiness flag TRUE before
      // confirming mep_rw.db actually parsed (a failed/404 fetch can leave _rwReady=true over a garbage DB
      // handle); the first real query against it then throws deep inside loadSteps/pair. That must never crash
      // the WHOLE walk (refuse-beats-fabricate applies to engine failures too, not just missing data) — so this
      // pass is try/catched into an honest per-rwd skip, exactly like assemble()'s own try/catch in modeller.html.
      try {
        var steps = loadSteps(rwd, opts.buildingType || 'GENERIC');
        if (!steps.length) { byRule.push({ from: 'pattern:' + rwd, to: disc, mode: rwd, segs: 0, noNbr: 0, skipped: 'no-pattern-steps' }); return; }
        // METER role: the door-seed feeds CW's mains entry; the stair-riser feeds SP's STACK (via _rwToNodeType's
        // own METER->STACK mapping for discipline='SP') — kept SEPARATE per pass so a stair is never mistaken for
        // a cold-water main and a door is never mistaken for a drain stack.
        var meterAnchor = (rwd === 'SP')
          ? (riser.refused ? null : { anchorId: 'STK0', anchorType: 'METER', x: riser.x, y: riser.y, z: riser.z, storey: riser.storey })
          : { anchorId: 'MTR0', anchorType: 'METER', x: seed.x, y: seed.y, z: seed.z, storey: seed.storey };
        if (!meterAnchor) { byRule.push({ from: 'pattern:' + rwd, to: disc, mode: rwd, segs: 0, noNbr: 0, skipped: 'no-stack-riser' }); return; }
        var anchors = fixtureAnchors.concat(junctions, [meterAnchor]);
        var out = [];
        pair(rwd, steps, anchors, arcEnv, out);
        // Authoritative post-filter (see _envelopeClash above) — routewalker.js's own internal clash-skip
        // mis-orients its box for horizontal runs, so re-check every emitted segment properly before accepting
        // it. halfWidth mirrors routewalker.js's OWN measured pipe cross-section (RW_PIPE_CROSS/1000/2), not an
        // invented constant; opts.pipeHalfWidth lets a caller override for a witness.
        var halfW = (opts.pipeHalfWidth > 0) ? opts.pipeHalfWidth : (ROOT.RW_PIPE_CROSS ? ROOT.RW_PIPE_CROSS / 1000 / 2 : 0.0375);
        var envClashed = 0;
        out.forEach(function (s) {
          if (_envelopeClash(s.from, s.to, arcEnv, halfW)) { envClashed++; return; }
          segs.push({ disc: disc, rule: 'pattern:' + rwd, from_kind: 'RW_' + rwd, to_kind: 'RW_' + rwd,
            from: s.from, to: s.to, storey: s.storey, mode: 'pattern-bridge', axis: s.axis });
        });
        byRule.push({ from: 'pattern:' + rwd, to: disc, mode: rwd, segs: out.length - envClashed, noNbr: envClashed,
          steps: steps.length, anchors: anchors.length, envelopeClashed: envClashed });
      } catch (e) {
        byRule.push({ from: 'pattern:' + rwd, to: disc, mode: rwd, segs: 0, noNbr: 0, skipped: 'engine-error: ' + (e && e.message) });
      }
    });
    return { segs: segs, refused: false, seed: seed, riser: riser.refused ? null : riser, byRule: byRule,
      anchorCounts: { fixture: fixtureAnchors.length, junction: junctions.length } };
  }

  // ── M5: BEND/TEE FITTING PLACEMENT (RESUME_MODELLER_WALK_SUBSTRATE.md §CAMPAIGN M5 SPEC, 2026-07-07) ──────
  // routePattern()'s (and routewalker.js's own rwRouteSegments()'s) segments are independent straight runs
  // with NO adjacency/merge logic between them (routewalker.js's rwSweepOps maps each 1:1 to its own
  // GEOM_SWEEP) — a direction change today is just two straight tubes meeting at a shared point, rendered as
  // one continuous tube (M4). This bend-finder groups segments of the SAME sub-network (from_kind — 'RW_CW'
  // vs 'RW_SP' are DIFFERENT pipe services and must never be joined into one fake fitting just because they
  // independently sample the same shared corridor JUNCTION waypoint — routePattern computes `junctions` ONCE
  // and re-uses it for BOTH the CW and SP passes, so a coincident coordinate across the two is a sampling
  // artefact, not a real shared pipe joint) by COINCIDENT endpoint (a real shared anchor, rounded to
  // BEND_ANCHOR_TOL decimal places) and classifies what meets there:
  //   N=2, outward vectors ~antiparallel -> STRAIGHT (no fitting — M4's continuous-tube rendering is correct
  //                                          as-is; this is the REGRESSION GUARD the M5 witness checks)
  //   N=2, NOT antiparallel              -> ELBOW (2-way bend)
  //   N=3                                -> TEE (the catalog's only 3-port generic fitting — a documented
  //                                          simplification: this does not distinguish a true in-line branch
  //                                          from a Y/wye junction; the catalog carries no separate wye/cross
  //                                          part, so every 3-way junction maps to the one 3-port fitting it has)
  //   N>=4                               -> REFUSE (no catalog fitting for a 4+-way cross — refuse-beats-
  //                                          fabricate, logged, never a placeholder)
  var BEND_ANCHOR_TOL = 3;                // decimal places for the coincident-endpoint key (~1mm at metre scale)
  var BEND_STRAIGHT_DOT = 0.999;          // dot(u1,u2) <= -this = antiparallel enough to call it a straight run
  function _bendKey(p) { return p[0].toFixed(BEND_ANCHOR_TOL) + ',' + p[1].toFixed(BEND_ANCHOR_TOL) + ',' + p[2].toFixed(BEND_ANCHOR_TOL); }
  function _vSub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function _vAdd(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function _vLen(v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); }
  function _vNorm(v) { var l = _vLen(v); return l > 1e-9 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, 0]; }
  function _vDot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function _vCross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

  // Group segs by shared anchor -> joint descriptors. opts.networkKey overrides the default (from_kind, falling
  // back to disc) grouping — a witness can pass a stricter/looser key to prove the CW/SP separation matters.
  function bendFinder(segs, opts) {
    opts = opts || {};
    var netKey = opts.networkKey || function (s) { return s.from_kind || s.disc; };
    var nets = {};
    (segs || []).forEach(function (s) {
      if (_vLen(_vSub(s.to, s.from)) < 1e-6) return;              // zero-length segment — nothing to bend
      var k = netKey(s); (nets[k] = nets[k] || []).push(s);
    });
    var out = [];
    Object.keys(nets).forEach(function (nk) {
      var byAnchor = {};
      nets[nk].forEach(function (s) {
        var dir = _vNorm(_vSub(s.to, s.from));
        (byAnchor[_bendKey(s.from)] = byAnchor[_bendKey(s.from)] || []).push({ seg: s, out: dir });                 // outward = downstream, away from this anchor
        (byAnchor[_bendKey(s.to)] = byAnchor[_bendKey(s.to)] || []).push({ seg: s, out: [-dir[0], -dir[1], -dir[2]] }); // outward = upstream, away from this anchor
      });
      Object.keys(byAnchor).forEach(function (ak) {
        var touches = byAnchor[ak], n = touches.length;
        if (n < 2) return;
        var coord = ak.split(',').map(Number);
        var vectors = touches.map(function (t) { return t.out; });
        if (n === 2) {
          var dp = _vDot(vectors[0], vectors[1]);
          if (dp <= -BEND_STRAIGHT_DOT) return;                    // antiparallel -> straight-through, no fitting
          out.push({ network: nk, anchor: coord, kind: 'ELBOW', n: 2, vectors: vectors, dot: dp });
        } else if (n === 3) {
          out.push({ network: nk, anchor: coord, kind: 'TEE', n: 3, vectors: vectors });
        } else {
          out.push({ network: nk, anchor: coord, kind: 'REFUSE', n: n, vectors: vectors,
            reason: n + '-way junction has no catalog fitting (elbow/tee only)' });
        }
      });
    });
    return out;
  }

  // ── Fitting rotation: real angle-bisector trig between the adjoining run direction vectors — the genuinely
  // NEW part (M5 SPEC item 4): searched disc_walker.js's own SIDE/TOP/BOTTOM hostBind branches + arc_editable.js's
  // rotation handling for existing bisector/miter/atan2 two-vector-to-rotation logic — NONE found; every existing
  // rotation in this codebase is either a stored single rotation_z or a dominant-AABB-axis pick (0/π/2 only, the
  // M6 heuristic). This is new engineering, not reuse.
  //
  // PLACEMENT CONVENTION (a real decision this task must disclose, since the generic catalog meshes — measured
  // directly, see session report — carry no documented canonical port axis: FITTING_ELBOW_GENERIC's own local
  // mesh is close to symmetric about the anchor, likely a low-poly generic placeholder, not a faithfully-modeled
  // bend): the fitting's LOCAL reference direction is +X; final orientation rotates local +X onto the BISECTOR
  // of every adjoining outward run vector at the joint. For N=2 this is the standard angle-bisector formula
  // normalize(u1+u2); it generalizes cleanly to a 3-way TEE as the vector-sum mean direction (no single true
  // bisector exists for 3 non-coplanar vectors — the normalized sum is the well-defined, hand-checkable choice
  // used here, consistent with assemble()'s own existing "mean incident run vector" orientation convention a few
  // hundred lines up — same idea, extended here into a full rotation instead of a bare direction).
  //
  // Horizontal case (bisector.z ~ 0 — the common Manhattan-turn bend, and the ONLY case every OTHER rotation in
  // this codebase supports, see M6's own finding): plain yaw (placement.rot degrees), matching place()'s yaw-only
  // path. Non-horizontal (a REAL vertical run exists in Duplex's own SP network — the STACK riser drop) uses
  // place()'s already-existing 3-axis quaternion path (rotX/rotY/rotZRad) via a dependency-free "rotate a
  // reference vector onto a target vector" quaternion + XYZ-Euler decomposition — the SAME algorithm THREE.js's
  // own Quaternion.setFromUnitVectors + Euler.setFromRotationMatrix('XYZ') use (ported here, not re-derived, so
  // it runs identically in Node — this witness's hand-calculated proof, no window.THREE — and in the browser,
  // where place() reconstructs the identical Euler from rotX/rotY/rotZRad using THREE itself).
  var FIT_REF = [1, 0, 0];
  var FIT_HORIZ_TOL = 1e-4;                // |bisector.z| below this -> treat the bend as horizontal (yaw-only)
  function _quatFromTo(ref, target) {
    var d = _vDot(ref, target);
    if (d < -0.999999) {                   // ref and target opposite (180°) -> any axis perpendicular to ref works
      var alt = Math.abs(ref[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      var axis = _vNorm(_vCross(ref, alt));
      return [axis[0], axis[1], axis[2], 0];
    }
    var c = _vCross(ref, target), w = d + 1;
    var l = Math.sqrt(c[0] * c[0] + c[1] * c[1] + c[2] * c[2] + w * w);
    return l > 1e-12 ? [c[0] / l, c[1] / l, c[2] / l, w / l] : [0, 0, 0, 1];
  }
  // Quaternion -> Euler 'XYZ' (three.js's own Euler.setFromRotationMatrix('XYZ') algorithm, ported verbatim —
  // MUST agree with it bit-for-bit, since place()'s 3-axis branch reconstructs a THREE.Euler from exactly these
  // three numbers; a hand-rolled DIFFERENT formula would silently misplace every non-horizontal fitting).
  function _quatToEulerXYZ(q) {
    var x = q[0], y = q[1], z = q[2], w = q[3];
    var m11 = 1 - 2 * (y * y + z * z), m12 = 2 * (x * y - w * z), m13 = 2 * (x * z + w * y);
    var m21 = 2 * (x * y + w * z), m22 = 1 - 2 * (x * x + z * z), m23 = 2 * (y * z - w * x);
    var m31 = 2 * (x * z - w * y), m32 = 2 * (y * z + w * x), m33 = 1 - 2 * (x * x + y * y);
    var ey = Math.asin(Math.max(-1, Math.min(1, m13)));
    var ex, ez;
    if (Math.abs(m13) < 0.9999999) { ex = Math.atan2(-m23, m33); ez = Math.atan2(-m12, m11); }
    else { ex = Math.atan2(m32, m22); ez = 0; }
    return [ex, ey, ez];
  }
  // vectors: the outward run direction unit vectors touching one joint (2 for an elbow, 3 for a tee). Returns
  // { bisector:[x,y,z], horizontal, rot (deg, yaw-only path), rotX, rotY, rotZRad (3-axis path, non-horizontal
  // only) } — shape matches `place()`'s placement fields exactly (bonsai_library.js place()/foldInsert).
  function fittingOrientation(vectors) {
    var sum = (vectors || []).reduce(function (a, v) { return _vAdd(a, v); }, [0, 0, 0]);
    if (_vLen(sum) < 1e-6) return { bisector: [0, 0, 0], degenerate: true, rot: 0 };  // exactly-opposing set — no well-defined bisector
    var bis = _vNorm(sum);
    if (Math.abs(bis[2]) < FIT_HORIZ_TOL) {
      return { bisector: bis, horizontal: true, rot: Math.atan2(bis[1], bis[0]) * 180 / Math.PI };
    }
    var q = _quatFromTo(FIT_REF, bis), e = _quatToEulerXYZ(q);
    return { bisector: bis, horizontal: false, rot: 0, rotX: e[0], rotZRad: e[1], rotY: -e[2] };
  }
  // ── M6: REAL mini-BOM RosettaStone lookup, checked BEFORE fittingOrientation's bisector (WalkerDoctrine.md
  // §7 / prompts/Modeller/DISC_Walker/DISC_ROSETTASTONE_MEP_MINISET.md Task 4) ─────────────────────────────
  // fittingOrientation's bisector trig (above) is PROVEN WRONG on real data: on a real tee it predicts ~-45°
  // vs the real ~135°-off π/2 axis-aligned turn; on a real reducer/transition (coaxial — path direction does
  // NOT change) it predicts ZERO rotation vs the real compound (−π/2, π/2, 0) turn that re-orients the
  // piece's own authored local mesh axes — something no path-vector bisector can see at all. Full numbers +
  // GUIDs: prompts/Modeller/DISC_Walker/mep_rosettastone_miniset.db (`mep_run_piece` id=3 tee, id=4
  // transition), extracted from a REAL SJTII_Terminal fire-suppression sprinkler branch. Per §4/§7's
  // LANDED/GENERATED distinction: when a real mini-BOM fragment matches the discovered joint's topology
  // shape, REPLAY its extracted rotation (LANDED) instead of computing one; only fall back to bisector
  // (flagged low-confidence, never presented as equally solid) when genuinely no real match exists.
  //
  // HONESTY (per spec, not oversold): this reference set is EXACTLY these 2 real pieces from ONE real run —
  // not a fitting library. `kind` here is a TOPOLOGY tag, not bendFinder's own `j.kind` ('ELBOW'/'TEE') —
  // 'TEE' matches bendFinder's 3-way TEE 1:1. 'COAXIAL' (the transition/reducer — 2-way, NO directional
  // turn) does NOT match bendFinder's 'ELBOW' (bendFinder's own doc above: N=2 antiparallel outward vectors
  // -> STRAIGHT, no fitting emitted at all — see BEND_STRAIGHT_DOT). This is a REAL, DISCLOSED gap: a
  // diameter-changing-but-direction-preserving fitting is invisible to bendFinder's direction-vector-only
  // detection (segs carry no diameter/bbox at all — rwRouteSegments()'s `{disc,rule,from_kind,to_kind,
  // from,to,storey,mode,axis}` shape has nothing to detect it from), so the COAXIAL entry is NOT reachable
  // through the live bendFittings()->bendFinder() path today — extending bendFinder's DETECTION to notice a
  // diameter-only change is a bigger, separate change (threading real diameter data from IFC extraction
  // through rwRouteSegments) and is OUT OF SCOPE here (this task wires the ROTATION lookup for bends already
  // discovered, not new detection). It is kept here, real and directly callable (`lookupRealFitting('COAXIAL',
  // 2, ...)`, proven in witness_mep_rosettastone_lookup.js), documented rather than silently dropped, so a
  // future bendFinder extension has a real value to replay instead of re-deriving one.
  //
  // Field mapping (replay, not invented trig): bonsai_library.js's OWN existing 3-axis placement contract
  // (place()/foldInsert, bonsai_library.js:78/110) reconstructs `new THREE.Euler(pl.rotX, pl.rotZRad,
  // -pl.rotY, 'XYZ')` for ANY placement carrying rotX/rotY — the SAME contract fittingOrientation's own
  // non-horizontal branch already targets (`rotX: e[0], rotZRad: e[1], rotY: -e[2]`, e = XYZ-Euler decomp).
  // The real extracted `rotation_x/rotation_y/rotation_z` (mep_run_piece, itself an XYZ-order Euler triple of
  // the real world rotation) is replayed into that SAME existing contract: rotX=rotation_x, rotZRad=
  // rotation_y, rotY=-rotation_z. No new trigonometry — only this existing field-order mapping. (The TEE case
  // is single-axis (rotation_y=rotation_z=0) so this mapping is UNAMBIGUOUSLY correct regardless of Euler
  // order; the transition's compound case relies on this file's own already-established XYZ convention.)
  var MEP_REAL_FITTINGS = [
    {
      key: 'TEE_THREADED_FP', kind: 'TEE', n: 3,
      diaMin: 0.0278, diaMax: 0.2855,                    // real 1,035-row family envelope (component_library.db)
      rotation_x: 1.5707963267949, rotation_y: 0, rotation_z: 0,
      source_guid: 'T0_Terminal_1c33yVIIL358EhW_$Ep9bA',
      source: 'mep_rosettastone_miniset.db mep_run_piece id=3 (SJTII_Terminal, real threaded tee)'
    },
    {
      key: 'TRANSITION_REDUCER_FP', kind: 'COAXIAL', n: 2,
      diaMin: 0.0056, diaMax: 0.1132,                    // real 911-row HORIZONTAL-family envelope
      rotation_x: -1.5707963267949, rotation_y: 1.5707963267949, rotation_z: 0,
      source_guid: 'T0_Terminal_1c33yVIIL358EhW_$Ep9bx',
      source: 'mep_rosettastone_miniset.db mep_run_piece id=4 (SJTII_Terminal, real coaxial transition/reducer)'
    }
  ];
  // lookupRealFitting(topoKind, n, diameterHint) -> the matching real reference row, or null (honest no-match).
  // Match = topoKind + n exact (never cross ELBOW<->COAXIAL, a real physical difference — see comment above).
  // diameterHint narrows only when >1 candidate ties on topoKind+n; today there is exactly one of each, so a
  // caller with no diameter data (production segs carry none) still gets a real, unambiguous match — this is
  // the "generous enough to be useful" match the spec calls for, not diameter-strict.
  function lookupRealFitting(topoKind, n, diameterHint) {
    var cands = MEP_REAL_FITTINGS.filter(function (f) { return f.kind === topoKind && f.n === n; });
    if (!cands.length) return null;
    if (cands.length === 1 || diameterHint == null) return cands[0];
    var narrowed = cands.filter(function (f) { return diameterHint >= f.diaMin && diameterHint <= f.diaMax; });
    return narrowed.length ? narrowed[0] : cands[0];
  }
  // Elbow (2-way) / Tee (3-way) -> the real catalog hashes (viewer/dagevu_catalog.json), verified present.
  // ASMONLY DECISION (M5 SPEC item 2, disclosed not silently bypassed): grepped every consumer of the catalog's
  // `asmOnly` field across modeller/*.js + modeller/*.html + viewer/*.js — it is set once (bonsai_library.js:38,
  // copied from the catalog JSON) and read NOWHERE else in this codebase; foldInsert/Library.get/search() apply
  // NO asmOnly check at all. So there is no live gate to bypass here — a direct GEOM_INSERT of these hashes is
  // already structurally reachable today exactly like any other catalog placement. Flagging (not silently
  // assuming) that `asmOnly:true` in the DATA still likely signals an INTENDED future restriction (e.g. hiding
  // these parts from the general catalog browse/insert picker so a user can't hand-place a bare "assembly part"
  // outside a real assembly) — if that gate gets wired later, it should stay scoped to the interactive catalog
  // PICKER, not to this programmatic disc-walker placement (a different call path, analogous to how RouteWalker's
  // own fixtures/pipes are placed via RW_IFC_MAP without going through that picker either).
  function _fittingHash(kind) {
    if (kind === 'ELBOW') return 'FITTING_ELBOW_GENERIC';
    if (kind === 'TEE') return 'FITTING_TEE_GENERIC';
    return null;
  }
  // Top-level: segs (rwRouteSegments()/routePattern().segs shape) -> fitting placements ready for a normal
  // GEOM_INSERT ({hash, placement:{x,y,z,rot[,rotX,rotY,rotZRad]}}) — no new placement path, per M5 SPEC item 2.
  function bendFittings(disc, segs, opts) {
    opts = opts || {};
    var joints = bendFinder(segs, opts), out = [], refused = 0, landedN = 0, computedN = 0;
    joints.forEach(function (j) {
      var hash = _fittingHash(j.kind);
      if (!hash) { refused++; return; }
      // M6: real mini-BOM RosettaStone lookup FIRST — replay an extracted rotation (LANDED) when a real
      // fragment matches this joint's topology shape; only compute a bisector (flagged low-confidence) when
      // genuinely no real match exists (docs/internal/WalkerDoctrine.md §7's LANDED/GENERATED distinction).
      var real = lookupRealFitting(j.kind, j.n, opts.diameterHint);
      var pl, landed, bisector, horizontal;
      if (real) {
        pl = { x: j.anchor[0], y: j.anchor[1], z: j.anchor[2], rot: 0,
          rotX: real.rotation_x, rotZRad: real.rotation_y, rotY: -real.rotation_z };
        landed = true; landedN++;
      } else {
        var orient = fittingOrientation(j.vectors);
        if (orient.degenerate) { refused++; return; }
        pl = { x: j.anchor[0], y: j.anchor[1], z: j.anchor[2], rot: orient.rot };
        if (!orient.horizontal) { pl.rotX = orient.rotX; pl.rotY = orient.rotY; pl.rotZRad = orient.rotZRad; }
        landed = false; computedN++; bisector = orient.bisector; horizontal = !!orient.horizontal;
      }
      out.push({ disc: disc, network: j.network, kind: j.kind, hash: hash, anchor: j.anchor,
        placement: pl, n: j.n, bisector: bisector, horizontal: horizontal,
        landed: landed, prov: landed ? 'landed:mep-rosettastone' : 'computed:bisector-lowconfidence',
        realMatch: landed ? real.key : null, realSourceGuid: landed ? real.source_guid : null });
    });
    console.log(TAG + ' §BEND disc=' + disc + ' joints=' + joints.length +
      ' elbow=' + out.filter(function (o) { return o.kind === 'ELBOW'; }).length +
      ' tee=' + out.filter(function (o) { return o.kind === 'TEE'; }).length +
      ' refused=' + refused + (joints.length ? ' (' + joints.map(function(j){return j.kind + ':' + j.n;}).join(' ') + ')' : ''));
    console.log(TAG + ' §MEP-RS disc=' + disc + ' landed=' + landedN + ' computed(bisector-lowconfidence)=' + computedN);
    return out;
  }


  // ── ROUTE → ASSEMBLE bridge (docs/WalkerDoctrine.md roadmap #3) ──────────────────────────────────
  // routeChains gives the real nn-NETWORK (segments between real extracted element guids). assemble() turns that
  // network into instantiated catalog PARTS: at each routed NODE (a real element endpoint), instantiate the matching
  // catalog piece (disc_patterns._import_joint_piece_types, keyed by ifc_class) — POSE from the REAL node, TYPE+Ø
  // from the catalog (MEASURED, mined off the source building), ORIENTATION from the incident run direction.
  // NON-INVENT: nothing fabricated — pose is a real element's position, size is a measured catalog Ø, direction is
  // real segment geometry. A node whose class has no catalog part is honestly SKIPPED (no fabricated part).
  // opts.catalog = [{ifc_class, piece_type, diameter_mm, length_mm}] — caller-passed percept from the pattern store
  // (mirrors the host-bind shim's caller-passed start; a projected `rule_joint_piece` is the later first-class step).
  // opts.toFace forwards to routeChains. Returns {parts, joints, segs, nodes} or {refused, reason}.
  function assemble(disc, bdb, opts) {
    opts = opts || {};
    var rc = routeChains(disc, bdb, opts);
    if (!rc.segs.length) return { disc: disc, refused: true, reason: 'no routed network', parts: [], joints: [] };
    // CATALOG source: caller-passed opts.catalog (raw _import_joint_piece_types rows) ELSE the first-class
    // PROJECTED `rule_joint_piece` table in the (borrowed-aware) rules DB — the §SHIM-SELECT/routing pattern, so
    // assemble needs no caller percept. Each projected row is ALREADY the per-(disc,ifc_class) measured median
    // (one row per class), so _part()'s _med over a single row returns that exact value (no re-aggregation drift).
    var cat = opts.catalog || _loadJointPieces(disc);
    if (!cat.length) return { disc: disc, refused: true, reason: 'no catalog (pass opts.catalog or project rule_joint_piece)', parts: [], joints: [] };
    var byCls = {};
    cat.forEach(function (c) { (byCls[c.ifc_class] = byCls[c.ifc_class] || []).push(c); });
    function _part(cls) {
      var g = byCls[cls]; if (!g) return null;
      return { piece_type: g[0].piece_type,                       // representative type (one per class in the catalog)
        diameter_mm: _med(g.map(function (c) { return c.diameter_mm; })),   // MEASURED median Ø for the class
        length_mm: _med(g.map(function (c) { return c.length_mm; })) };
    }
    // unique nodes from the network; accumulate incident run unit-vectors at each node for orientation.
    var nodes = {}, joints = [];
    function _touch(guid, kind, xyz, dir) {
      var n = nodes[guid] || (nodes[guid] = { guid: guid, ifc_class: kind, x: xyz[0], y: xyz[1], z: xyz[2], dirs: [] });
      if (dir) n.dirs.push(dir);
    }
    rc.segs.forEach(function (s) {
      var dx = s.to[0] - s.from[0], dy = s.to[1] - s.from[1], dz = s.to[2] - s.from[2];
      var L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1, u = [dx / L, dy / L, dz / L];
      _touch(s.from_guid, s.from_kind, s.from, u);                // run leaves the from-end along +u
      _touch(s.to_guid, s.to_kind, s.to, [-u[0], -u[1], -u[2]]);  // and arrives at the to-end along -u
      var pf = _part(s.from_kind), pt = _part(s.to_kind);
      joints.push({ from_guid: s.from_guid, to_guid: s.to_guid, gap: s.gap,
        dia_from_mm: pf ? pf.diameter_mm : null, dia_to_mm: pt ? pt.diameter_mm : null });
    });
    var parts = [], skipped = 0;
    Object.keys(nodes).forEach(function (g) {
      var n = nodes[g], p = _part(n.ifc_class);
      if (!p) { skipped++; return; }                              // no catalog part for this class → honest skip
      var ax = 0, ay = 0, az = 0;                                 // orientation = mean incident run vector, renormalized
      n.dirs.forEach(function (d) { ax += d[0]; ay += d[1]; az += d[2]; });
      var aL = Math.sqrt(ax * ax + ay * ay + az * az);
      var dir = aL > 1e-9 ? [ax / aL, ay / aL, az / aL] : [0, 0, 1];
      parts.push({ disc: disc, guid: n.guid, ifc_class: n.ifc_class, piece_type: p.piece_type,
        diameter_mm: p.diameter_mm, length_mm: p.length_mm, pos: [n.x, n.y, n.z], dir: dir,
        prim: _primFor(n.ifc_class), prov: 'assembled:catalog+routed-node' });
    });
    return { disc: disc, refused: false, parts: parts, joints: joints, segs: rc.segs.length,
      nodes: Object.keys(nodes).length, skipped: skipped };
  }

  // ── CONNECTOR + CLEARANCE (roadmap #3b) ──────────────────────────────────────────────────────────
  // The FIXTURE→SERVICE hookup: a named assembly (disc_patterns.ad_assembly_connector) declares which FACE
  // connects to which SERVICE at what Ø (e.g. SPRINKLER TOP SUPPLY_IN Ø25 → FP_MAIN; TOILET BOTTOM WASTE_OUT
  // Ø100 → PLUMBING_STACK), and ad_assembly_manifest gives the standoff CLEARANCE per face. _faceDir maps the
  // measured FACE NAME to its local-frame axis — a frame CONVENTION (the face name is the datum), not invented data.
  function _faceDir(face) {
    switch (String(face).toUpperCase()) {
      case 'TOP': return [0, 0, 1];
      case 'BOTTOM': return [0, 0, -1];
      case 'BACK': return [0, -1, 0];
      case 'FRONT': return [0, 1, 0];
      case 'LEFT': return [-1, 0, 0];
      case 'RIGHT': return [1, 0, 0];
      default: return null;
    }
  }
  // Resolve the service connector + standoff for a named assembly. Picks the connector that names a SERVICE
  // (connects_to) — the hookup that orients the part — else the first connector. NON-INVENT: face/type/Ø/
  // connects_to/clearance are READ verbatim from the tables; only faceDir is the convention. null if no connector.
  function connectorFor(assemblyId, connectors, manifest) {
    var conns = (connectors || []).filter(function (c) { return c.assembly_id === assemblyId; });
    if (!conns.length) return null;
    var c = conns.filter(function (x) { return x.connects_to; })[0] || conns[0];
    var mf = (manifest || []).filter(function (m) { return m.assembly_id === assemblyId && m.face === c.face; });
    return { assembly_id: assemblyId, face: c.face, faceDir: _faceDir(c.face), connector_type: c.connector_type,
      dia_mm: c.diameter_mm, connects_to: c.connects_to || null, standoff_m: mf.length ? mf[0].clearance_m : 0,
      all: conns.map(function (x) { return { face: x.face, type: x.connector_type, dia_mm: x.diameter_mm, to: x.connects_to || null }; }) };
  }
  // Enrich placed parts/fixtures with their assembly connector + stand the pose OFF along the connector face by
  // the measured manifest clearance (toward the service). opts.assemblyKey = {ifc_class: assembly_id} OR a fn(part)
  // (caller-passed — a projected rule_connector is the later first-class step, mirroring rule_shim/rule_joint_piece).
  // NON-INVENT: a part with no mapped assembly or no connector is LEFT UNTOUCHED (no fabricated hookup); the pose
  // offset is exactly faceDir·standoff (0 standoff = flush hookup, the common measured case); count preserved.
  // Two source modes (additive — the caller path is byte-identical to before):
  //  • CALLER-PASSED (opts.connectors present): assemblyKey {ifc_class:id}|fn(part) + connectors + manifest, as before.
  //  • PROJECTED (no opts.connectors): read the first-class `rule_connector` table per (part.disc, part.ifc_class)
  //    via _loadConnectors — so the modeller enriches with NO caller percept. Each part needs .disc + .ifc_class.
  function connectorEnrich(parts, opts) {
    opts = opts || {};
    var key = opts.assemblyKey || {}, conns = opts.connectors, manifest = opts.manifest || [], n = 0;
    var projMap = null;
    if (!conns) {                                              // PROJECTED path: ifc_class→connector per disc
      projMap = {};
      var discs = {};
      (parts || []).forEach(function (p) { if (p.disc != null) discs[p.disc] = 1; });
      Object.keys(discs).forEach(function (d) {
        _loadConnectors(d).forEach(function (r) {
          projMap[d + '|' + r.ifc_class] = { assembly_id: r.assembly_id, face: r.face, faceDir: _faceDir(r.face),
            connector_type: r.connector_type, dia_mm: r.diameter_mm, connects_to: r.connects_to || null,
            standoff_m: r.standoff_m || 0 };
        });
      });
    }
    (parts || []).forEach(function (p) {
      var con;
      if (conns) {                                             // caller-passed (UNCHANGED)
        var aid = (typeof key === 'function') ? key(p) : key[p.ifc_class];
        if (!aid) return;
        con = connectorFor(aid, conns, manifest);
      } else {                                                 // projected
        con = projMap[p.disc + '|' + p.ifc_class] || null;
      }
      if (!con || !con.faceDir) return;
      p.connector = con; p.standoff_m = con.standoff_m;
      var pos = p.pos || [p.x, p.y, p.z];
      p.posStood = [pos[0] + con.faceDir[0] * con.standoff_m,
                    pos[1] + con.faceDir[1] * con.standoff_m,
                    pos[2] + con.faceDir[2] * con.standoff_m];
      n++;
    });
    return { enriched: n, total: (parts || []).length };
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
  // The first-class PROJECTED catalog for assemble (roadmap #3a): per-(disc,ifc_class) measured piece + Ø + length,
  // projected from disc_patterns._import_joint_piece_types by build/project_rule_joint_piece.py. Borrow-aware
  // (_dbFor) and table-absent-safe → []. Shape matches a caller's opts.catalog row, so assemble's _part() is uniform.
  function _loadJointPieces(disc) {
    try { return _rows(_dbFor(disc), "SELECT ifc_class, piece_type, diameter_mm, length_mm FROM rule_joint_piece WHERE disc='" + _esc(disc) + "'"); }
    catch (e) { return []; }
  }
  // The first-class PROJECTED connector hookup (§3c): per-(disc,ifc_class) fixture→service connector
  // (face/Ø/connects_to + standoff), projected from disc_patterns.ad_assembly_connector/manifest by
  // build/project_rule_connector.py. Borrow-aware (_dbFor) + table-absent-safe → []. Lets connectorEnrich
  // read the hookup with NO caller percept (the modeller carries only *_rules.db, never disc_patterns.db).
  function _loadConnectors(disc) {
    try { return _rows(_dbFor(disc), "SELECT ifc_class, assembly_id, face, connector_type, diameter_mm, connects_to, standoff_m FROM rule_connector WHERE disc='" + _esc(disc) + "'"); }
    catch (e) { return []; }
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
    // §SCHED-WALK (Step 2 PLACE, opt-in): schedule-driven per-space placement — the transcribed
    // Java semantics over the Step-1 mined rules. Fixture generation ONLY; routing (route/
    // routeChains) still runs below-shape via the same calls. Every non-schedule call path is
    // byte-identical (this returns before any legacy placement code is touched).
    if (opts && opts.schedule) {
      var ps = placeSchedule(disc, bdb, opts);
      // §NOSPACES (item 2): a building the schedule walk cannot serve (no schedule tables in its class
      // DB — Terminal by design, M6 — or no real IfcSpace rows) falls through to the measured-band walk
      // instead of a flat REFUSE. Residential schedule data is NEVER consumed here (placeMeasured reads
      // rule_placement/rule_mesh_binding only); a building with BOTH schedule tables AND real spaces is
      // byte-identical to before (this branch is unreachable there).
      if (ps.noRules || !ps.spaces) {
        var pm = placeMeasured(disc, bdb, opts);
        if (pm.noRules) {
          var why = (ps.noRules || 'no real spaces for schedule walk') + '; measured-band: ' + pm.noRules;
          console.log(TAG + ' §WALK-SCHED disc=' + disc + ' bldg=' + buildingName + ' REFUSE ' + why);
          return { disc: disc, refused: true, reason: why, placed: 0 };
        }
        // same grouped host-bind flow as the legacy walk: measured-band floats snap to real hosts via
        // the projected rule_shim; refused stay envelope-bound at the measured z (honest §NOSPACES-FLOAT).
        var mPlaced = pm.placements, mBound = 0, mFloat = 0;
        if (!(opts.noHostBind || opts.hostBind === false)) {
          var mShim = (opts && opts.shims) || _loadRuleShims(disc);
          var mByCls = {}; mPlaced.forEach(function (p) { (mByCls[p.ifc_class] = mByCls[p.ifc_class] || []).push(p); });
          var mOut = [];
          Object.keys(mByCls).forEach(function (cls) {
            var grp = mByCls[cls], shim = _shimForFixture(mShim, disc, cls);
            if (!shim) { mOut = mOut.concat(grp); mFloat += grp.length; return; }
            var hb = hostBind(grp, bdb, shim, opts && opts.geoDb, null);
            if (hb.noHost) { mOut = mOut.concat(grp); mFloat += grp.length; return; }
            mOut = mOut.concat(hb.bound, hb.refusedList || []);
            mBound += hb.bound.length; mFloat += hb.refused;
          });
          mPlaced = mOut;
        } else mFloat = mPlaced.length;
        var mChains = route(disc, bdb), mSrc = routeChains(disc, bdb);
        var mRefN = Object.keys(pm.refused).reduce(function (a, k) { return a + pm.refused[k]; }, 0);
        console.log(TAG + ' §WALK-NOSPACES disc=' + disc + ' bldg=' + buildingName + ' placed=' + mPlaced.length +
          ' zones=' + pm.zones + ' hostBound=' + mBound + ' floats=' + mFloat + ' lod400Refused=' + mRefN +
          (Object.keys(pm.refused).length ? ' [' + Object.keys(pm.refused).map(function (k) { return k + '×' + pm.refused[k]; }).join(' ') + ']' : ''));
        return { disc: disc, refused: false, mode: 'measured-band', placed: mPlaced.length, placements: mPlaced,
          measured: { zones: pm.zones, hostBound: mBound, floats: mFloat, lod400Refused: pm.refused },
          chains: mChains, chainSegs: mSrc.segs, chainByRule: mSrc.byRule, storeys: 0 };
      }
      var schains = route(disc, bdb), src2 = routeChains(disc, bdb);
      var refusedN = Object.keys(ps.refused).reduce(function (a, k) { return a + ps.refused[k]; }, 0);
      console.log(TAG + ' §WALK-SCHED disc=' + disc + ' bldg=' + buildingName + ' placed=' + ps.placements.length +
        ' spaces=' + ps.spacesUsed + '/' + ps.spaces + ' lod400Refused=' + refusedN +
        (Object.keys(ps.refused).length ? ' [' + Object.keys(ps.refused).map(function (k) { return k + '×' + ps.refused[k]; }).join(' ') + ']' : '') +
        ' skippedSpaces=' + ps.skippedSpaces.length);
      return { disc: disc, refused: false, placed: ps.placements.length, placements: ps.placements,
        schedule: { spaces: ps.spaces, spacesUsed: ps.spacesUsed, skippedSpaces: ps.skippedSpaces, lod400Refused: ps.refused },
        chains: schains, chainSegs: src2.segs, chainByRule: src2.byRule, storeys: 0 };
    }
    var reps = repRules(disc);
    // §SPACE-SCOPED piece 2: opts.spaceGuid narrows the walk to ONE real IfcSpace's own boundary instead
    // of the whole building's storeys — same place()/occupancy() pipeline, just a 1-element "storeys" list
    // shaped by spaceAsStorey(). Honest REFUSE (not a crash, not a silent whole-building fallback) if the
    // guid doesn't resolve to a real space with a measured bbox.
    var sub;
    if (opts && opts.spaceGuid) {
      var spaceSt = spaceAsStorey(bdb, opts.spaceGuid);
      if (!spaceSt) {
        console.log(TAG + ' §WALK disc=' + disc + ' bldg=' + buildingName + ' REFUSE space-not-found guid=' + opts.spaceGuid);
        return { disc: disc, refused: true, reason: 'spaceGuid does not resolve to a real IfcSpace bbox', placed: 0 };
      }
      sub = [spaceSt];
      console.log(TAG + ' §WALK-SPACE disc=' + disc + ' bldg=' + buildingName + ' space=' + opts.spaceGuid +
        ' storey=' + spaceSt.name + ' bbox=' + (spaceSt.x1 - spaceSt.x0).toFixed(2) + 'x' + (spaceSt.y1 - spaceSt.y0).toFixed(2));
    } else {
      sub = substrate(bdb);
    }
    if (!reps.length && !_rows(_dbFor(disc), "SELECT 1 FROM rule_routing WHERE disc='" + _esc(disc) + "' LIMIT 1").length) {
      console.log(TAG + ' §WALK disc=' + disc + ' bldg=' + buildingName + ' REFUSE no-measured-rule');
      return { disc: disc, refused: true, reason: 'no measured rule for ' + disc, placed: 0 };
    }
    if (!sub.length) {
      console.log(TAG + ' §WALK disc=' + disc + ' bldg=' + buildingName + ' REFUSE no-substrate');
      return { disc: disc, refused: true, reason: 'no habitable storeys', placed: 0 };
    }
    var geoDb = opts && opts.geoDb;                                              // §GEO-SPLIT (Terminal_geo.db)
    var placements = place(disc, sub, bdb, geoDb);
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
        var hb = hostBind(grp, bdb, shim, geoDb, (opts && opts.spaceGuid) ? sub[0] : null);
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
    // §CAMPAIGN M1 bridge: routeChains legitimately returns 0 on an ARC-only building (no real MEP elements
    // exist to nn-pair — that is the whole reason the discipline needs GENERATING). When it does, try the
    // ARC-derived-anchors → routewalker.js pattern-topology bridge (routePattern, PLB-only per its own measured
    // ad_mep_pattern coverage) before falling back to an honest 0. opts.noPattern=true restores the old
    // byte-identical behaviour (used by generalization/regression checks that want routeChains in isolation).
    var patternInfo = null;
    if (!rc.segs.length && !(opts && opts.noPattern)) {
      var pat = routePattern(disc, bdb, { placements: placements, buildingType: buildingName });
      if (!pat.refused && pat.segs.length) { rc = { segs: pat.segs, byRule: pat.byRule }; patternInfo = pat; }
      else if (pat.refused) console.log(TAG + ' §WALK-PATTERN disc=' + disc + ' bldg=' + buildingName + ' REFUSE ' + pat.reason);
    }
    console.log(TAG + ' §WALK disc=' + disc + ' bldg=' + buildingName + ' placed=' + placements.length +
      ' chains=' + chains.length + ' chainSegs=' + rc.segs.length + ' storeys=' + sub.length +
      (rc.byRule.length ? ' [' + rc.byRule.map(function (b) { return b.from.replace('Ifc', '') + '→' + b.to.replace('Ifc', '') + ':' + (b.skipped || (b.segs + '/' + (b.segs + b.noNbr))); }).join(' ') + ']' : ''));
    return { disc: disc, refused: false, placed: placements.length, placements: placements, hostBind: hbInfo,
      chains: chains, chainSegs: rc.segs, chainByRule: rc.byRule, storeys: sub.length, patternBridge: patternInfo };
  }

  // ── SEED PICKER (human-in-the-loop service entry; W-SEED-TRUNK / W-SEED-DEFAULT) ──────────────────
  // When the user walks a GENERATED discipline (Outliner.DISC.MEP) the modeller checks for an assigned SEED (the
  // service entry the trunk radiates from). If none, it shows this DEFAULT in a popup → the user OKs or picks another.
  // NON-INVENT: the default is a REAL element (IfcDoor, +IfcStair for vertical) picked DETERMINISTICALLY — the most
  // EXTERNAL entry (nearest the footprint boundary) on the LOWEST storey = the service-entry proxy. It is a HEURISTIC
  // the human confirms; we never claim it is correct, which is exactly why the popup exists. opts.seed (a guid) →
  // the user's explicit choice WINS (returned verbatim). No entry element → honest REFUSE (no fabricated seed).
  function defaultSeed(bdb, opts) {
    opts = opts || {};
    var classes = opts.classes || (opts.vertical ? ['IfcDoor', 'IfcStair'] : ['IfcDoor']);
    var like = classes.map(function (c) { return "m.ifc_class LIKE '%" + _esc(c) + "%'"; }).join(' OR ');
    var cand = _rows(bdb, "SELECT m.guid g, m.ifc_class c, m.storey st, t.center_x x, t.center_y y, t.center_z z " +
      "FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE " + like);
    if (opts.seed) {                                          // user's explicit choice wins — resolve to the real element
      var s = cand.filter(function (e) { return e.g === opts.seed; })[0] ||
        _rows(bdb, "SELECT m.guid g, m.ifc_class c, m.storey st, t.center_x x, t.center_y y, t.center_z z " +
          "FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.guid='" + _esc(opts.seed) + "'")[0];
      if (!s) return { refused: true, reason: 'assigned seed guid not found: ' + opts.seed };
      return { guid: s.g, ifc_class: s.c, storey: s.st, x: s.x, y: s.y, z: s.z, source: 'user-assigned',
        reason: 'user-assigned seed', candidates: cand.map(_seedLabel) };
    }
    if (!cand.length) return { refused: true, reason: 'no entry element (' + classes.join('/') + ') in model — ask the user to assign a seed' };
    // footprint bbox from ALL elements → externality = min distance to a footprint edge (small = near the perimeter)
    var bb = _rows(bdb, "SELECT MIN(center_x) x0, MAX(center_x) x1, MIN(center_y) y0, MAX(center_y) y1 FROM element_transforms")[0];
    cand.forEach(function (e) { e.ext = Math.min(e.x - bb.x0, bb.x1 - e.x, e.y - bb.y0, bb.y1 - e.y); });
    // deterministic: most external (smallest ext) → lowest storey (smallest z) → smallest guid
    cand.sort(function (a, b) { return (a.ext - b.ext) || (a.z - b.z) || (a.g < b.g ? -1 : a.g > b.g ? 1 : 0); });
    var d = cand[0];
    return { guid: d.g, ifc_class: d.c, storey: d.st, x: d.x, y: d.y, z: d.z, externality: +d.ext.toFixed(4),
      source: 'default-heuristic', reason: 'most external ' + d.c + ' on storey ' + d.st + ' (service-entry proxy; ' +
      d.ext.toFixed(2) + 'm from footprint edge) — confirm or choose another', candidates: cand.map(_seedLabel) };
  }
  function _seedLabel(e) { return { guid: e.g, ifc_class: e.c, storey: e.st, x: e.x, y: e.y, z: e.z }; }

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

  var API = { dwInit: dwInit, dwOpen: dwOpen, dwBorrow: dwBorrow, dwBorrowFile: dwBorrowFile, dwWalk: dwWalk, assemble: assemble, connectorFor: connectorFor, connectorEnrich: connectorEnrich, substrate: substrate, place: place, hostBind: hostBind,
    route: route, routeChains: routeChains, routePattern: routePattern, gate: gate, repRules: repRules, order: order, clearance: clearance,
    hostWalls: hostWalls, countPer: countPer, occupancy: occupancy, defaultSeed: defaultSeed, spaceAsStorey: spaceAsStorey,
    spacesOf: spacesOf, placeSchedule: placeSchedule,
    _shimForDisc: _shimForDisc, _shimForFixture: _shimForFixture, _loadRuleShims: _loadRuleShims,
    _trueMidpoint: _trueMidpoint,
    bendFinder: bendFinder, fittingOrientation: fittingOrientation, bendFittings: bendFittings,
    lookupRealFitting: lookupRealFitting, MEP_REAL_FITTINGS: MEP_REAL_FITTINGS,
    disciplines: disciplines, loadedFile: loadedFile, _ready: function () { return _ready; } };
  ROOT.DiscWalker = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  console.log(TAG + ' module loaded');
})();
