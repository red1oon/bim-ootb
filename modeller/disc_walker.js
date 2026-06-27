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
// SOURCE COPY lives in bim-compiler/build/; the deployed copy is bim-ootb/viewer/disc_walker.js.
(function () {
  'use strict';
  var TAG = '§DW';
  var ROOT = (typeof window !== 'undefined') ? window : {};
  var _db = null, _ready = false;

  function _rows(db, sql) {
    var r = db.exec(sql);
    if (!r.length) return [];
    var cols = r[0].columns, vals = r[0].values;
    return vals.map(function (v) { var o = {}; cols.forEach(function (c, i) { o[c] = v[i]; }); return o; });
  }
  function _esc(s) { return String(s).replace(/'/g, "''"); }
  function _med(arr) { var a = arr.filter(function (v) { return v != null; }).sort(function (x, y) { return x - y; }); return a.length ? a[Math.floor(a.length / 2)] : 0; }

  // ── INIT ────────────────────────────────────────────────────────────────────────
  // Browser: dwInit(SQL, baseUrl) fetches ../modeller/terminal_rules.db (local, no OCI).
  // Node/witness: dwOpen(db) sets an already-opened sql.js instance directly.
  function dwOpen(db) { _db = db; _ready = !!db; return _ready; }
  async function dwInit(SQL, baseUrl) {
    var url = (baseUrl || '../modeller/') + 'terminal_rules.db';
    var buf = await (await fetch(url)).arrayBuffer();
    _db = new SQL.Database(new Uint8Array(buf));
    _ready = true;
    var n = function (t) { var r = _db.exec('SELECT COUNT(*) FROM ' + t); return r.length ? r[0].values[0][0] : 0; };
    console.log(TAG + ' dwInit terminal_rules.db placement=' + n('rule_placement') + ' routing=' + n('rule_routing') +
      ' place_order=' + n('rule_place_order') + ' avoidance=' + n('rule_avoidance'));
    return _ready;
  }

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
      return {
        ifc_class: cls,
        ref_kind: g[0].ref_kind,
        sx: _med(g.map(function (r) { return r.spacing_x_m; })),
        sy: _med(g.map(function (r) { return r.spacing_y_m; })),
        dz: _med(g.map(function (r) { return r.dz; })),
        n_rules: g.length,
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

  // ── PLACER ──────────────────────────────────────────────────────────────────────
  function place(disc, storeys, bdb) {
    var reps = repRules(disc), out = [];
    reps.forEach(function (rp) {
      storeys.forEach(function (st) {
        var w = st.x1 - st.x0, d = st.y1 - st.y0;
        var z = st.z + (rp.dz || 0);
        if (rp.sx > 0 && rp.sy > 0) {                       // measured array → tile the footprint
          var nx = Math.max(1, Math.round(w / rp.sx)), ny = Math.max(1, Math.round(d / rp.sy));
          for (var i = 0; i < nx; i++) for (var j = 0; j < ny; j++) {
            out.push({ disc: disc, ifc_class: rp.ifc_class, x: st.x0 + (i + 0.5) * (w / nx),
              y: st.y0 + (j + 0.5) * (d / ny), z: z, storey: st.name, prov: 'placed:array', src: rp.src });
          }
        } else if (rp.ref_kind === 'host' && bdb) {         // SHIM → tack onto real host walls
          var walls = hostWalls(bdb, st.name);
          if (walls.length) {
            var cap = countPer(disc, rp.ifc_class);
            var nP = (cap > 0) ? Math.min(cap, walls.length) : walls.length;
            var stride = walls.length / nP;
            for (var k = 0; k < nP; k++) {
              var wl = walls[Math.floor(k * stride)];
              out.push({ disc: disc, ifc_class: rp.ifc_class, x: wl.cx, y: wl.cy, z: z,
                yaw: wl.rot, storey: st.name, prov: 'shim:host-wall', host: wl.guid, src: rp.src });
            }
          }                                                 // no walls → honest skip (no host surface)
        } else {                                            // single placement (datum rule, no host)
          out.push({ disc: disc, ifc_class: rp.ifc_class, x: (st.x0 + st.x1) / 2, y: (st.y0 + st.y1) / 2,
            z: z, storey: st.name, prov: 'placed:single', src: rp.src });
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
  function gate(placements) {
    var ord = order(), clr = clearance(), yields = 0;
    var byDisc = {}; placements.forEach(function (p) { (byDisc[p.disc] = byDisc[p.disc] || []).push(p); });
    var discs = Object.keys(byDisc);
    for (var a = 0; a < discs.length; a++) for (var b = 0; b < discs.length; b++) {
      if (a === b) continue;
      var da = discs[a], dbb = discs[b];
      var oa = (ord[da] != null) ? ord[da] : 99, ob = (ord[dbb] != null) ? ord[dbb] : 99;
      if (!(oa < ob)) continue;                              // da is higher priority than dbb
      var k = [da, dbb].sort().join('|'); var c = clr[k]; if (!c) continue;
      var hi = byDisc[da], lo = byDisc[dbb];
      lo.forEach(function (pl) {
        for (var i = 0; i < hi.length; i++) {
          var ph = hi[i];
          var d3 = Math.sqrt(Math.pow(pl.x - ph.x, 2) + Math.pow(pl.y - ph.y, 2) + Math.pow(pl.z - ph.z, 2));
          if (d3 < c.min_clear) { pl.z -= c.min_clear; pl.gated = true; yields++; break; }
        }
      });
    }
    return { yields: yields, order: ord };
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
    console.log(TAG + ' §WALK disc=' + disc + ' bldg=' + buildingName + ' placed=' + placements.length +
      ' chains=' + chains.length + ' storeys=' + sub.length);
    return { disc: disc, refused: false, placed: placements.length, placements: placements, chains: chains, storeys: sub.length };
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
    route: route, gate: gate, repRules: repRules, order: order, clearance: clearance,
    hostWalls: hostWalls, countPer: countPer,
    disciplines: disciplines, _ready: function () { return _ready; } };
  ROOT.DiscWalker = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  console.log(TAG + ' module loaded');
})();
