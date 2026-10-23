// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2bim.js — deterministic 2D DXF → 3D BIM ops. Spec: docs/DXF2BIM_SPEC.md (§5 rules, §6 stages,
// §7 formats, §10 notes). Pure functions: output depends only on (dxf text, layer_map, config, library).
// v1 scope: walls (LINE/LWPOLYLINE centreline), slabs (closed LWPOLYLINE), components (INSERT), metres.
// Openings (§9): ARC door swings implemented; no wall cut (GAP:no_host_cut).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Dxf2Bim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // §D55 (JKR tuning, 2026-10-23): glazing pieces within this distance (m) are parts of ONE window. Measured: JKR panes 2.4 mm / 50 mm off their frames and posts, nothing at 50-300 mm; Duplex,
  // Clinic, LTU, the shed: every piece touches (<= 1 mm). A module constant, not CFG, so no set's run_id changes.
  var WINDOW_PART_GAP = typeof process !== 'undefined' && process.env && process.env.DXF_WINDOW_PART_GAP ? Number(process.env.DXF_WINDOW_PART_GAP) : 0.05;   // env: the witness's falsifier hook

  function r6(x) { return Math.round(x * 1e6) / 1e6 + 0; }          // N5; +0 turns -0 into 0
  function canon(v) {                                                // N1 canonical JSON, keys sorted
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
  }
  function hnum(h) { return parseInt(h, 16); }                       // N2 numeric handle order

  function matchRule(layer, rules) {                                 // §7.1 first match wins
    var tail = layer.indexOf('$') >= 0 ? layer.slice(layer.lastIndexOf('$') + 1) : layer;
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (r.match === 'exact' && layer === r.pattern) return r;
      if (r.match === 'suffix' && tail === r.pattern) return r;
      if (r.match === 'prefix' && layer.indexOf(r.pattern) === 0) return r;
    }
    return null;
  }

  var TYPES = { wall: 1, wallline: 1, slab: 1, component: 1, opening: 1, glazing: 1, ignore: 1, slabedge: 1 };   // §D70.1 slabedge: the plan's A-FLOR-OTLN, read by Dxf2Shell.slabEdges
  function validateMap(map) {
    if (!map || !Array.isArray(map.rules)) throw new Error('layer_map: rules[] missing');
    map.rules.forEach(function (r, i) {
      if (!TYPES[r.type]) throw new Error('layer_map rule ' + i + ': bad type ' + r.type);
      if (['exact', 'suffix', 'prefix'].indexOf(r.match) < 0) throw new Error('layer_map rule ' + i + ': bad match ' + r.match);
    });
  }

  function has(o, path) {                                            // config value present and numeric
    var v = o;
    for (var i = 0; i < path.length; i++) { if (v == null) return false; v = v[path[i]]; }
    return typeof v === 'number' && isFinite(v);
  }

  // §28 H1: wall/door heights from elevations. Returns {height, base, pending, fallback} for wall params.
  function wallDims(config) {
    var fe = !!(config.wall && config.wall.height_from_elevation === true);
    if (fe) return { ok: true, height: null, base: null, pending: true,
      fallback: (has(config, ['wall', 'height']) ? { height: config.wall.height, base: has(config, ['wall', 'base']) ? config.wall.base : 0 } : null) };
    return { ok: has(config, ['wall', 'height']) && has(config, ['wall', 'base']), height: has(config, ['wall', 'height']) ? config.wall.height : null, base: has(config, ['wall', 'base']) ? config.wall.base : null, pending: false, fallback: null };
  }

  function area(pts) {
    var a = 0;
    for (var i = 0; i < pts.length; i++) { var p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
    return Math.abs(a) / 2;
  }


  // ---- footprint helpers (§15 F1, §18 F6) ----
  function mergeVals(vals, tol) {                                         // sorted unique values, merging within tol
    var v = vals.slice().sort(function (a, b) { return a - b; }), out = [];
    v.forEach(function (x) { if (!out.length || x - out[out.length - 1] > tol) out.push(x); });
    return out;
  }
  function snapTo(list, x, tol) { for (var i = 0; i < list.length; i++) if (Math.abs(list[i] - x) <= tol) return list[i]; return x; }
  function sweep(pts, tol, swap) {                                        // y-sweep (swap=false) or x-sweep; pts rectilinear, closed
    var P = pts.map(function (q) { return swap ? [q[1], q[0]] : [q[0], q[1]]; });
    var ys = mergeVals(P.map(function (q) { return q[1]; }), tol), xs = mergeVals(P.map(function (q) { return q[0]; }), tol);
    P = P.map(function (q) { return [snapTo(xs, q[0], tol), snapTo(ys, q[1], tol)]; });
    var edges = [];                                                       // vertical edges as [x, ylo, yhi]
    for (var i = 0; i < P.length; i++) { var a = P[i], b = P[(i + 1) % P.length]; if (a[0] === b[0] && a[1] !== b[1]) edges.push([a[0], Math.min(a[1], b[1]), Math.max(a[1], b[1])]); }
    var rects = [];
    for (var k = 0; k + 1 < ys.length; k++) {
      var y0 = ys[k], y1 = ys[k + 1], ym = (y0 + y1) / 2;
      var xsAt = edges.filter(function (e) { return e[1] < ym && ym < e[2]; }).map(function (e) { return e[0]; }).sort(function (a, b) { return a - b; });
      if (xsAt.length % 2) return null;
      for (var j = 0; j < xsAt.length; j += 2) rects.push([xsAt[j], y0, xsAt[j + 1], y1]);
    }
    var merged = [];                                                      // merge vertically adjacent rects with identical x-interval
    rects.forEach(function (rc) {
      for (var i = merged.length - 1; i >= 0; i--) {
        var m2 = merged[i];
        if (m2[0] === rc[0] && m2[2] === rc[2] && m2[3] === rc[1]) { m2[3] = rc[3]; return; }
      }
      merged.push(rc.slice());
    });
    return merged.map(function (rc) { return swap ? [rc[1], rc[0], rc[3], rc[2]] : rc; });
  }
  function rectsOf(fv, tol) {                                             // returns list of [x0,y0,x1,y1] or null
    if (fv.length < 4) return null;
    var x0 = Math.min.apply(null, fv.map(function (q) { return q[0]; })), x1 = Math.max.apply(null, fv.map(function (q) { return q[0]; }));
    var y0 = Math.min.apply(null, fv.map(function (q) { return q[1]; })), y1 = Math.max.apply(null, fv.map(function (q) { return q[1]; }));
    var boxA = (x1 - x0) * (y1 - y0);
    var onEdge = fv.every(function (q) { return Math.abs(q[0] - x0) <= tol || Math.abs(q[0] - x1) <= tol || Math.abs(q[1] - y0) <= tol || Math.abs(q[1] - y1) <= tol; });
    if (onEdge && boxA > 0 && Math.abs(area(fv) - boxA) <= 1e-6 * boxA) return [[x0, y0, x1, y1]];
    // F6 rectilinear: every edge axis-aligned within tol
    var rectilinear = fv.every(function (q, i) { var n = fv[(i + 1) % fv.length]; return Math.abs(q[0] - n[0]) <= tol || Math.abs(q[1] - n[1]) <= tol; });
    if (!rectilinear) return null;
    var a = sweep(fv, tol, false), b = sweep(fv, tol, true), best = null;
    if (a && b) best = b.length < a.length ? b : a; else best = a || b;
    if (!best || !best.length) return null;
    var sum = best.reduce(function (n, rc) { return n + (rc[2] - rc[0]) * (rc[3] - rc[1]); }, 0), poly = Math.abs(area(fv));
    if (Math.abs(sum - poly) > 1e-6 * poly) return null;
    best.sort(function (p, q) { return p[1] - q[1] || p[0] - q[0]; });
    return best;
  }

  /**
   * @param {string} dxfText
   * @param {Object} layerMap   §7.1
   * @param {Object} config     §7.2
   * @param {Object} deps       { DxfParser, hashHex(string)->hex, library: [block names], sink?(opType, params, inputGuids, outputGuid) }
   * @returns {{run_id, ops:Array, report:Object}}
   */
  // BASIC_SHAPES_SPEC §2.1 F9: cleaned simple polygon (collinear vertices removed, CCW) or null
  function polyOutline(fv, tol) {
    var p = fv.slice(), changed = true;
    while (changed && p.length > 3) {
      changed = false;
      for (var i = 0; i < p.length; i++) {
        var a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length];
        var L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L === 0) { p.splice(i, 1); changed = true; break; }
        var d = Math.abs((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / L;
        if (d <= tol + 1e-9) { p.splice(i, 1); changed = true; break; }
      }
    }
    if (p.length < 3) return null;
    function o(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
    var n = p.length;
    for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      var p1 = p[i], p2 = p[(i + 1) % n], p3 = p[j], p4 = p[(j + 1) % n];
      var d1 = o(p3, p4, p1), d2 = o(p3, p4, p2), d3 = o(p1, p2, p3), d4 = o(p1, p2, p4);
      if (((d1 > 1e-12 && d2 < -1e-12) || (d1 < -1e-12 && d2 > 1e-12)) && ((d3 > 1e-12 && d4 < -1e-12) || (d3 < -1e-12 && d4 > 1e-12))) return null;
    }
    if (area(p) < 0) p.reverse();
    if (Math.abs(area(p)) <= 1e-12) return null;
    return p.map(function (q) { return [r6(q[0]), r6(q[1])]; });
  }

  function run(dxfText, layerMap, config, deps) {
    validateMap(layerMap);
    var hashHex = deps.hashHex;
    var library = (deps.library || []).slice().sort();

    // S0 hash
    var dxfHash = hashHex(dxfText);
    var runId = hashHex(canon({ dxf: dxfHash, layer_map: layerMap, config: config, library: library, region: deps.region || null, exclude: deps.exclude || null }));

    // S1 parse (modelspace ENTITIES only, N3)
    var dxf = new deps.DxfParser().parseSync(dxfText);
    var ents = (dxf.entities || []).slice().sort(function (a, b) { return hnum(a.handle) - hnum(b.handle); });
    var regionInfo = null;                                                                                   // §31 V3
    if (deps.region) {
      var R = deps.region, kept = [], outside = 0, straddle = [], noAnchor = 0, fileEntities = ents.length;
      var pointsOf = function (e) {
        var pts = [];
        if (e.type === 'LINE' && e.vertices && e.vertices.length) pts = e.vertices.slice();
        else if (e.vertices && e.vertices.length) pts = e.vertices.slice();
        ['controlPoints', 'fitPoints'].forEach(function (k) { if (e[k] && e[k].length) pts = pts.concat(e[k]); });
        ['position', 'center', 'startPoint', 'endPoint', 'anchorPoint', 'middleOfText', 'linearOrAngularPoint1', 'linearOrAngularPoint2'].forEach(function (k) { if (e[k] && typeof e[k].x === 'number') pts.push(e[k]); });
        return pts;
      };
      ents.forEach(function (e) {
        if (e.layer === 'DXF2BIM-MARK') { kept.push(e); return; }
        var pts = pointsOf(e);
        if (!pts.length) { noAnchor++; return; }
        var inn = pts.filter(function (q) { return q.x >= R[0] && q.x <= R[2] && q.y >= R[1] && q.y <= R[3]; }).length;
        if (inn === pts.length) kept.push(e); else if (inn === 0) outside++; else straddle.push({ handle: e.handle, layer: e.layer, entity: e.type });
      });
      ents = kept;
      regionInfo = { region: R.slice(), file_entities: fileEntities, outside_region: outside, straddle: straddle.length, straddle_list: straddle.slice(0, 50), no_anchor: noAnchor };
    }

    var excludeInfo = null;                                                                                  // §34 X1
    if (deps.exclude && deps.exclude.length) {
      var EX = deps.exclude, keptX = [], excluded = 0, exStraddle = 0;
      var ptsOf = function (e) {
        var pts = (e.vertices && e.vertices.length) ? e.vertices.slice() : [];
        ['position', 'center', 'startPoint', 'endPoint', 'anchorPoint', 'middleOfText', 'linearOrAngularPoint1', 'linearOrAngularPoint2'].forEach(function (k) { if (e[k] && typeof e[k].x === 'number') pts.push(e[k]); });
        ['controlPoints', 'fitPoints'].forEach(function (k) { if (e[k] && e[k].length) pts = pts.concat(e[k]); });
        return pts;
      };
      ents.forEach(function (e) {
        if (e.layer === 'DXF2BIM-MARK') { keptX.push(e); return; }
        var pts = ptsOf(e), full = false, part = false;
        EX.forEach(function (R) {
          var n = pts.filter(function (q) { return q.x >= R[0] && q.x <= R[2] && q.y >= R[1] && q.y <= R[3]; }).length;
          if (pts.length && n === pts.length) full = true; else if (n > 0) part = true;
        });
        if (full) excluded++; else { keptX.push(e); if (part) exStraddle++; }
      });
      ents = keptX; excludeInfo = { rects: EX.length, excluded: excluded, exclude_straddle: exStraddle };
    }

    // S2 units (N9): factor to metres
    var UNIT = { 'in': 0.0254, ft: 0.3048, mm: 0.001, cm: 0.01, m: 1 };
    var BYCODE = { 1: 'in', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm' };
    var units = config.units, unitsSource = 'config';
    if (!units) {
      unitsSource = 'header';
      var iu = dxf.header && dxf.header.$INSUNITS;
      units = BYCODE[iu];
      if (!units) throw new Error('S2: no config.units and $INSUNITS=' + iu + ' — cannot decide units; stopping');
    }
    if (!UNIT[units]) throw new Error('S2: unknown units "' + units + '"');
    var K = UNIT[units];
    function m(x) { return r6(x * K); }

    var openingEnts = [], glazEnts = [], wlEnts = [], footSeen = null, thinCands = [];
    var elems = [], gaps = [], ignored = [], counts = { entities: ents.length };
    function gap(code, e, extra) { gaps.push(Object.assign({ code: code, handle: e.handle, layer: e.layer, entity: e.type }, extra || {})); }
    function guid(e, part) { return hashHex(runId + '|' + e.handle + '|' + part).slice(0, 32); }       // N4

    ents.forEach(function (e) {
      if (e.layer === 'DXF2BIM-MARK') { ignored.push({ handle: e.handle, layer: e.layer, entity: e.type }); return; }      // reserved marker layer (§26 E7)
      var rule = matchRule(e.layer, layerMap.rules);                                                      // S3
      if (!rule) { gap('GAP:unmapped_layer', e); return; }
      if (rule.type === 'ignore' || rule.type === 'slabedge') { ignored.push({ handle: e.handle, layer: e.layer, entity: e.type }); return; }   // §D70.1 slabedge: read by Dxf2Shell.slabEdges, not here
      if (rule.type === 'opening') { openingEnts.push(e); return; }
      if (rule.type === 'glazing') { glazEnts.push(e); return; }
      if (rule.type === 'wallline') { wlEnts.push(e); return; }

      if (rule.type === 'wall' && config.wall_mode === 'footprint') {                                      // §15 F1-F4
        if (!((e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && e.shape)) { gap('GAP:wall_not_footprint', e); return; }
        var fv = [];
        e.vertices.forEach(function (q) { var pt = [m(q.x), m(q.y)]; if (!fv.length || !(pt[0] === fv[fv.length - 1][0] && pt[1] === fv[fv.length - 1][1])) fv.push(pt); });
        if (fv.length > 1 && fv[0][0] === fv[fv.length - 1][0] && fv[0][1] === fv[fv.length - 1][1]) fv.pop();
        var ftol = has(config, ['snap_tol']) ? config.snap_tol : 0;
        var rects = rectsOf(fv, ftol);                                                                      // F1 rectangle, else F6 rectilinear split
        var poly = null;
        if (!rects && config.wall && config.wall.polygon_footprint === true) {                              // BASIC_SHAPES_SPEC §2.1 F9: exact polygon (mitres), never a bbox
          poly = polyOutline(fv, ftol);
          if (poly) rects = [[Math.min.apply(null, poly.map(function (q) { return q[0]; })), Math.min.apply(null, poly.map(function (q) { return q[1]; })),
            Math.max.apply(null, poly.map(function (q) { return q[0]; })), Math.max.apply(null, poly.map(function (q) { return q[1]; }))]];
        }
        if (!rects) { gap('GAP:wall_footprint_not_rect', e); return; }
        footSeen = footSeen || {};
        rects.forEach(function (rc, part) {
          var split = rects.length > 1;
          var fw = r6(rc[2] - rc[0]), fh = r6(rc[3] - rc[1]);
          if (has(config, ['wall', 'min_thickness']) && Math.min(fw, fh) < config.wall.min_thickness) {
            var tg = { code: 'GAP:wall_below_min_thickness', handle: e.handle, layer: e.layer, entity: e.type, part: part, thickness: Math.min(fw, fh) };
            gaps.push(tg);
            if (!poly && has(config, ['opening', 'gap_max'])) {                                              // BASIC_SHAPES_SPEC §2.2 F5b: decided after stub orientation
              var thz = r6(Math.min(fw, fh)), wdz = wallDims(config), hz = fw >= fh;
              if (wdz.ok) thinCands.push({ gapRef: tg, el: { op: 'DXF_WALL', e: e, part: part, thin: true, params: { start: hz ? [r6(rc[0]), r6((rc[1] + rc[3]) / 2)] : [r6((rc[0] + rc[2]) / 2), r6(rc[1])], end: hz ? [r6(rc[2]), r6((rc[1] + rc[3]) / 2)] : [r6((rc[0] + rc[2]) / 2), r6(rc[3])],
                length: hz ? fw : fh, thickness: thz, height: wdz.height, base: wdz.base, pending_elevation: wdz.pending, height_fallback: wdz.fallback, footprint: true, rect: [r6(rc[0]), r6(rc[1]), r6(rc[2]), r6(rc[3])], square: fw === fh, split_from: split } } });
            }
            return;
          }
          var fkey = rc.map(function (v) { return Math.round(v / (ftol || 1e-6)); }).join(',');
          if (footSeen[fkey]) { gap('GAP:duplicate_footprint', e, { part: part, first: footSeen[fkey] }); return; }
          footSeen[fkey] = e.handle;
          var wd = wallDims(config);
          if (!wd.ok) { gap('GAP:no_dimension', e, { part: part, need: 'wall.height,base' }); return; }
          var horiz = fw >= fh, fcx = r6((rc[0] + rc[2]) / 2), fcy = r6((rc[1] + rc[3]) / 2);
          var fa = horiz ? [r6(rc[0]), fcy] : [fcx, r6(rc[1])], fb = horiz ? [r6(rc[2]), fcy] : [fcx, r6(rc[3])];
          var wp = { start: fa, end: fb, length: horiz ? fw : fh, thickness: horiz ? fh : fw,
            height: wd.height, base: wd.base, pending_elevation: wd.pending, height_fallback: wd.fallback, footprint: true, rect: [r6(rc[0]), r6(rc[1]), r6(rc[2]), r6(rc[3])], square: fw === fh, split_from: split };
          if (poly) { wp.polygon = true; wp.outline = poly; }
          elems.push({ op: 'DXF_WALL', e: e, part: part, params: wp });
        });
        return;
      }
      if (rule.type === 'wall') {                                                                         // S4 + S5
        var segs = [];
        if (e.type === 'LINE') segs.push([e.vertices[0], e.vertices[1]]);
        else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
          var v = e.vertices;
          for (var i = 0; i + 1 < v.length; i++) segs.push([v[i], v[i + 1]]);
          if (e.shape && v.length > 2) segs.push([v[v.length - 1], v[0]]);
        } else { gap('GAP:unsupported_entity', e); return; }
        segs.forEach(function (s, part) {
          var a = [m(s[0].x), m(s[0].y)], b = [m(s[1].x), m(s[1].y)];
          var len = r6(Math.hypot(b[0] - a[0], b[1] - a[1]));
          if (len === 0) { gap('GAP:zero_length', e, { part: part }); return; }
          var wdc = wallDims(config);
          if (!has(config, ['wall', 'thickness']) || !wdc.ok) {
            gap('GAP:no_dimension', e, { part: part, need: 'wall.thickness,height,base' }); return;
          }
          elems.push({ op: 'DXF_WALL', e: e, part: part, params: {
            start: a, end: b, length: len, thickness: config.wall.thickness, height: wdc.height, base: wdc.base, pending_elevation: wdc.pending, height_fallback: wdc.fallback } });
        });
        return;
      }
      if (rule.type === 'slab') {
        if (e.type !== 'LWPOLYLINE' && e.type !== 'POLYLINE') { gap('GAP:unsupported_entity', e); return; }
        if (!e.shape) { gap('GAP:unclosed', e); return; }
        if (!has(config, ['slab', 'thickness']) || !has(config, ['slab', 'level'])) { gap('GAP:no_dimension', e, { need: 'slab.thickness,level' }); return; }
        var pts = e.vertices.map(function (p) { return [m(p.x), m(p.y)]; });
        elems.push({ op: 'DXF_SLAB', e: e, part: 0, params: {
          outline: pts, area: r6(area(pts)), thickness: config.slab.thickness, level: config.slab.level } });
        return;
      }
      if (rule.type === 'component') {
        if (e.type !== 'INSERT') { gap('GAP:unsupported_entity', e); return; }
        if (library.indexOf(e.name) < 0) { gap('GAP:unknown_block', e, { block: e.name }); return; }
        var p = e.position || { x: 0, y: 0 };
        elems.push({ op: 'DXF_COMPONENT', e: e, part: 0, params: {
          block: e.name, position: [m(p.x), m(p.y)], rotation: r6(e.rotation || 0) } });
      }
    });



    // §34 pair walls (double-line walls): deferred so every wallline is known
    (function () {
      if (!wlEnts.length) return;
      if (config.wall_mode !== 'pair') { wlEnts.forEach(function (e) { gap('GAP:wall_mode_mismatch', e, { need: 'config.wall_mode = "pair"' }); }); return; }
      var W = config.wall || {};
      if (!Array.isArray(W.pair_thicknesses) || !W.pair_thicknesses.length || !has(config, ['wall', 'pair_tol']) || !has(config, ['wall', 'pair_min_overlap']) || !has(config, ['snap_tol'])) {
        wlEnts.forEach(function (e) { gap('GAP:no_dimension', e, { need: 'wall.pair_thicknesses[],pair_tol,pair_min_overlap,snap_tol' }); }); return;
      }
      var ths = W.pair_thicknesses, ptol = W.pair_tol, minOv = W.pair_min_overlap, st = config.snap_tol, ln = [], seenG = {};
      function gapOnce(code, e, extra) { var k = code + e.handle; if (seenG[k]) return; seenG[k] = 1; gap(code, e, extra); }
      wlEnts.forEach(function (e) {
        if (e.type !== 'LINE') { gap('GAP:unsupported_entity', e); return; }
        var a = [m(e.vertices[0].x), m(e.vertices[0].y)], b = [m(e.vertices[1].x), m(e.vertices[1].y)], dx = b[0] - a[0], dy = b[1] - a[1];
        var hz = Math.abs(dy) <= st, vt = Math.abs(dx) <= st;
        if (!hz && !vt) { gap('GAP:wall_line_diagonal', e); return; }
        if (hz && vt) { gap('GAP:zero_length', e); return; }
        ln.push({ e: e, h: hz, c: hz ? r6((a[1] + b[1]) / 2) : r6((a[0] + b[0]) / 2), a0: hz ? Math.min(a[0], b[0]) : Math.min(a[1], b[1]), a1: hz ? Math.max(a[0], b[0]) : Math.max(a[1], b[1]) });
      });
      // P6: join collinear segments across T-joints (gap <= pair_join_gap)
      var lowestH = function (a, b) { return hnum(a.handle) <= hnum(b.handle) ? a : b; };
      ln.sort(function (p, q) { return (p.h === q.h ? 0 : p.h ? -1 : 1) || p.c - q.c || p.a0 - q.a0 || hnum(p.e.handle) - hnum(q.e.handle); });
      if (has(config, ['wall', 'pair_join_gap'])) {
        var jg = W.pair_join_gap, joined = [];
        ln.forEach(function (x) {
          var last = joined[joined.length - 1];
          if (last && last.h === x.h && Math.abs(last.c - x.c) <= st && x.a0 - last.a1 <= jg + st) { last.a1 = Math.max(last.a1, x.a1); last.members.push(x.e); last.e = lowestH(last.e, x.e); }
          else joined.push({ e: x.e, h: x.h, c: x.c, a0: x.a0, a1: x.a1, members: [x.e] });
        });
        ln = joined;
      } else ln.forEach(function (x) { x.members = [x.e]; });
      var links = [], partners = ln.map(function () { return 0; });
      for (var i = 0; i < ln.length; i++) for (var j = i + 1; j < ln.length; j++) {
        var A = ln[i], Bv = ln[j]; if (A.h !== Bv.h) continue;
        var sep = r6(Math.abs(A.c - Bv.c)); if (!ths.some(function (t) { return Math.abs(sep - t) <= ptol; })) continue;
        var ov0 = Math.max(A.a0, Bv.a0), ov1 = Math.min(A.a1, Bv.a1); if (ov1 - ov0 < minOv) continue;
        links.push({ i: i, j: j, sep: sep, ov0: ov0, ov1: ov1 }); partners[i]++; partners[j]++;
      }
      var amb = ln.map(function (_, k) { return partners[k] > 1; });
      links.forEach(function (l) { if (amb[l.i] || amb[l.j]) { amb[l.i] = true; amb[l.j] = true; } });                      // propagate: partners of a pattern line are pattern lines
      ln.forEach(function (x, k) { x.members.forEach(function (me) { if (amb[k]) gapOnce('GAP:wall_pair_ambiguous', me, { partners: partners[k] }); else if (partners[k] === 0) gapOnce('GAP:wall_line_unpaired', me); }); });
      var pieces = [];
      links.forEach(function (l) {
        if (amb[l.i] || amb[l.j]) return;
        var A = ln[l.i], Bv = ln[l.j], u0 = Math.min(A.a0, Bv.a0), u1 = Math.max(A.a1, Bv.a1);
        var lowEx = l.ov0 - u0, hiEx = u1 - l.ov1, useU = lowEx <= l.sep + ptol && hiEx <= l.sep + ptol;
        var a0 = useU ? u0 : l.ov0, a1 = useU ? u1 : l.ov1, c0 = Math.min(A.c, Bv.c), c1 = Math.max(A.c, Bv.c);
        var first = hnum(A.e.handle) <= hnum(Bv.e.handle) ? A : Bv, second = first === A ? Bv : A;
        pieces.push({ first: first.e, second: second.e, members: first.members.concat(second.members).map(function (q) { return q.handle; }), rc: A.h ? [a0, c0, a1, c1] : [c0, a0, c1, a1], key: hnum(first.e.handle) });
      });
      pieces.sort(function (p, q) { return p.key - q.key || p.rc[0] - q.rc[0] || p.rc[1] - q.rc[1]; });
      footSeen = footSeen || {};
      pieces.forEach(function (pc) {
        var rc = pc.rc, e = pc.first, fw = r6(rc[2] - rc[0]), fh = r6(rc[3] - rc[1]);
        if (has(config, ['wall', 'min_thickness']) && Math.min(fw, fh) < config.wall.min_thickness) { gap('GAP:wall_below_min_thickness', e, { thickness: Math.min(fw, fh) }); return; }
        var fkey = rc.map(function (v) { return Math.round(v / st); }).join(',');
        if (footSeen[fkey]) { gap('GAP:duplicate_footprint', e, { first: footSeen[fkey] }); return; }
        footSeen[fkey] = e.handle;
        var wd = wallDims(config); if (!wd.ok) { gap('GAP:no_dimension', e, { need: 'wall.height,base' }); return; }
        var horiz = fw >= fh, fcx = r6((rc[0] + rc[2]) / 2), fcy = r6((rc[1] + rc[3]) / 2);
        elems.push({ op: 'DXF_WALL', e: e, part: 0, params: { start: horiz ? [r6(rc[0]), fcy] : [fcx, r6(rc[1])], end: horiz ? [r6(rc[2]), fcy] : [fcx, r6(rc[3])], length: horiz ? fw : fh, thickness: horiz ? fh : fw,
          height: wd.height, base: wd.base, pending_elevation: wd.pending, height_fallback: wd.fallback, footprint: true, rect: [r6(rc[0]), r6(rc[1]), r6(rc[2]), r6(rc[3])], square: fw === fh, split_from: false, pair: [e.handle, pc.second.handle], members: pc.members } });
      });
    })();

    // §9 openings: deferred so all walls exist. ARC = door swing (hinge = centre, width = radius).
    function dist2seg(p, a, b) {
      var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
      var t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
      return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
    }
    function hostFor(pt) {
      var tol = config.host_tol, best = null;
      elems.forEach(function (w) {
        if (w.op !== 'DXF_WALL') return;
        var d = r6(dist2seg(pt, w.params.start, w.params.end));
        if (d > tol) return;
        var key = [d, hnum(w.e.handle), w.part];
        if (!best || key[0] < best.key[0] || (key[0] === best.key[0] && (key[1] < best.key[1] || (key[1] === best.key[1] && key[2] < best.key[2])))) best = { key: key, w: w };
      });
      return best && best.w;
    }
    // §F7 D20: a door hinge on an ANGLED (F9 polygon) wall is off the wall's bbox centre line by up to length x sin(angle) / 2: with no centre line within host_tol,
    // the polygon wall whose drawn outline holds the hinge or passes within host_tol of it hosts the door (0 inside; ties as hostFor). Rectangle walls are not concerned.
    function hostByOutline(pt) {
      var tol = config.host_tol, best = null;
      elems.forEach(function (w) {
        if (w.op !== 'DXF_WALL' || !w.params.polygon || !w.params.outline) return;
        var P = w.params.outline, inside = false, d = Infinity;
        for (var i = 0, j = P.length - 1; i < P.length; j = i++) {
          if ((P[i][1] > pt[1]) !== (P[j][1] > pt[1]) && pt[0] < (P[j][0] - P[i][0]) * (pt[1] - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) inside = !inside;
          d = Math.min(d, dist2seg(pt, P[j], P[i]));
        }
        d = inside ? 0 : r6(d);
        if (d > tol) return;
        var key = [d, hnum(w.e.handle), w.part];
        if (!best || key[0] < best.key[0] || (key[0] === best.key[0] && (key[1] < best.key[1] || (key[1] === best.key[1] && key[2] < best.key[2])))) best = { key: key, w: w };
      });
      return best && best.w;
    }
    var oSegs = [], doorPts = [];                            // §12: segments on opening layers + door anchor points
    // §F7 D17-R: a DOUBLE door = two arcs of one radius whose hinges are two radii apart, each closed end at the midpoint between the hinges: ONE door of the full width (leaves=2),
    // the second arc absorbed. (Two single doors hinged back to back with their leaves meeting draw the same thing: read as a double door, stated.)
    var arcs = openingEnts.filter(function (e) { return e.type === 'ARC'; }), pairOf = {}, absorbed = {}, tolP = has(config, ['snap_tol']) ? config.snap_tol : 0.001;
    var ends = function (e) { return [e.startAngle, e.endAngle].map(function (a) { return [m(e.center.x + e.radius * Math.cos(a)), m(e.center.y + e.radius * Math.sin(a))]; }); };
    arcs.forEach(function (a, i) { if (pairOf[a.handle] || absorbed[a.handle]) return; arcs.slice(i + 1).some(function (b) {
      if (pairOf[b.handle] || absorbed[b.handle] || Math.abs(m(a.radius) - m(b.radius)) > tolP) return false;
      var A = [m(a.center.x), m(a.center.y)], Bc = [m(b.center.x), m(b.center.y)], r = m(a.radius); if (Math.abs(Math.hypot(A[0] - Bc[0], A[1] - Bc[1]) - 2 * r) > tolP) return false;
      var Mid = [(A[0] + Bc[0]) / 2, (A[1] + Bc[1]) / 2], atM = function (e) { return ends(e).some(function (p) { return Math.hypot(p[0] - Mid[0], p[1] - Mid[1]) <= tolP; }); };
      if (!atM(a) || !atM(b)) return false;
      pairOf[a.handle] = b; absorbed[b.handle] = a; return true; }); });
    openingEnts.forEach(function (e) {
      if (e.type === 'ARC' && absorbed[e.handle]) return;   // D17-R: the second leaf of a double door
      if (e.type === 'ARC') {
        if (!has(config, ['host_tol'])) { gap('GAP:no_dimension', e, { need: 'host_tol' }); return; }
        var doorFromElev = !!(config.opening && config.opening.door && config.opening.door.from_elevation === true);
        if (!doorFromElev && !has(config, ['opening', 'door', 'height'])) { gap('GAP:no_dimension', e, { need: 'opening.door.height' }); return; }
        var pb = pairOf[e.handle], fullW = pb ? 2 * m(e.radius) : m(e.radius);   // D17-R: a double door's width is both leaves
        if (has(config, ['opening', 'door', 'min_width']) && fullW < config.opening.door.min_width) { gap('GAP:door_below_min_width', e, { width: fullW }); return; }
        var hinge = [m(e.center.x), m(e.center.y)], width = fullW;
        var host = hostFor(hinge), hostBasis = null;
        if (!host) { host = hostByOutline(hinge); if (host) hostBasis = 'outline'; }   // §F7 D20
        if (!host) { gap('GAP:no_host', e, { hinge: hinge }); return; }
        var door = { op: 'DXF_OPENING', e: e, part: 0, hostRef: host, params: {
          kind: 'door', hinge: hinge, width: width, height: doorFromElev ? null : config.opening.door.height, pending_elevation: doorFromElev, height_fallback: (doorFromElev && has(config, ['opening', 'door', 'height'])) ? config.opening.door.height : null,
          swing_start_deg: r6(e.startAngle * 180 / Math.PI), swing_end_deg: r6(e.endAngle * 180 / Math.PI), parts: [] } };
        if (hostBasis) door.params.host_basis = hostBasis;
        if (pb) { door.params.leaves = 2; door.params.leaf_width = m(e.radius); door.params.pair_handle = pb.handle; door.params.swing_start_deg = r6(e.startAngle * 180 / Math.PI); }
        elems.push(door);
        if (pb) ends(pb).concat([[m(pb.center.x), m(pb.center.y)]]).forEach(function (p) { doorPts.push({ door: door, p: p }); });
        doorPts.push({ door: door, p: hinge },
          { door: door, p: [m(e.center.x + e.radius * Math.cos(e.startAngle)), m(e.center.y + e.radius * Math.sin(e.startAngle))] },
          { door: door, p: [m(e.center.x + e.radius * Math.cos(e.endAngle)), m(e.center.y + e.radius * Math.sin(e.endAngle))] });
        gap('GAP:no_host_cut', e, { host_handle: host.e.handle, host_part: host.part });
      } else if (e.type === 'LINE' || e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
        var vs = e.type === 'LINE' ? [e.vertices[0], e.vertices[1]] : e.vertices, n = 0;
        var closeIt = e.type !== 'LINE' && e.shape && vs.length > 2;
        for (var i = 0; i + 1 < vs.length; i++) oSegs.push({ e: e, part: n++, a: [m(vs[i].x), m(vs[i].y)], b: [m(vs[i + 1].x), m(vs[i + 1].y)], used: false });
        if (closeIt) oSegs.push({ e: e, part: n++, a: [m(vs[vs.length - 1].x), m(vs[vs.length - 1].y)], b: [m(vs[0].x), m(vs[0].y)], used: false });
      } else if (e.type === 'INSERT') {
        gap('GAP:unknown_block', e, { block: e.name, note: 'opening INSERT needs a library entry with width (not supported in v1)' });
      } else gap('GAP:unsupported_entity', e);
    });

    if (oSegs.length && !has(config, ['snap_tol'])) {
      var seenNo = {};
      oSegs.forEach(function (sg) { if (!seenNo[sg.e.handle]) { seenNo[sg.e.handle] = 1; gap('GAP:no_dimension', sg.e, { need: 'snap_tol' }); } sg.used = true; });
    } else if (oSegs.length) {
      var tolS = config.snap_tol;
      var near = function (p, q) { return Math.hypot(p[0] - q[0], p[1] - q[1]) <= tolS; };
      // D1 door parts (lane spec L2.6 B): an entity whose outline (any vertex or segment) passes within snap_tol of a door's hinge or arc end
      // is that door's part, WHOLE (all its segments). Touching two doors -> GAP:door_part_ambiguous (not absorbed).
      var segD = function (p, a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
      var byEnt = {}, entOrder = [];
      oSegs.forEach(function (sg) { if (!byEnt[sg.e.handle]) { byEnt[sg.e.handle] = []; entOrder.push(sg.e.handle); } byEnt[sg.e.handle].push(sg); });
      // L2.7 (1): door symbol = arc + leaf + frame/casing. Pass 1: the L2.6 touch rule (hinge / arc ends). Pass 2: the door's opening box from the drawn walls
      // (closed leaf, jamb pieces, band) widened along by the parts pass 1 attached (the drawn casing extent); an entity in exactly one box joins that door.
      var wallEls = elems.filter(function (x) { return x.op === 'DXF_WALL' && x.params.rect; }).concat((typeof thinCands !== 'undefined' ? thinCands : []).map(function (c) { return c.el; }));   // drawn thin stubs (F5b candidates) are jambs too
      var touch = {};
      entOrder.sort(function (p, q) { return hnum(p) - hnum(q); }).forEach(function (h) {
        var segs = byEnt[h], hit = [];
        doorPts.forEach(function (dp) { if (hit.indexOf(dp.door) < 0 && segs.some(function (sg) { return segD(dp.p, sg.a, sg.b) <= tolS; })) hit.push(dp.door); });
        touch[h] = hit;
      });
      var ext = function (segs, ai) { var v = []; segs.forEach(function (sg) { v.push(sg.a[ai], sg.b[ai]); }); return [Math.min.apply(null, v), Math.max.apply(null, v)]; };
      elems.forEach(function (door) {
        if (door.op !== 'DXF_OPENING' || door.params.kind !== 'door') return;
        var q = door.params, H = q.hinge, found = [];
        [q.swing_start_deg, q.swing_end_deg].forEach(function (a) {
          var E = [H[0] + q.width * Math.cos(a * Math.PI / 180), H[1] + q.width * Math.sin(a * Math.PI / 180)];
          var ai = Math.abs(E[1] - H[1]) <= tolS ? 0 : Math.abs(E[0] - H[0]) <= tolS ? 1 : -1; if (ai < 0) return;
          var ci = 1 - ai, lo = Math.min(H[ai], E[ai]), hi = Math.max(H[ai], E[ai]);
          // wall lines through the hinge: the bands of LONG pieces parallel to the leaf; a line's pieces = every piece with that same band (short or square stubs included)
          var bands = [];
          wallEls.forEach(function (w) { var r = w.params.rect; if (r[ai + 2] - r[ai] > r[ci + 2] - r[ci] + tolS && H[ci] >= r[ci] - tolS && H[ci] <= r[ci + 2] + tolS && !bands.some(function (bd) { return Math.abs(bd[0] - r[ci]) <= tolS && Math.abs(bd[1] - r[ci + 2]) <= tolS; })) bands.push([r[ci], r[ci + 2]]); });
          bands.forEach(function (bd) {
            var strip = wallEls.filter(function (w) { var r = w.params.rect; return Math.abs(r[ci] - bd[0]) <= tolS && Math.abs(r[ci + 2] - bd[1]) <= tolS; });
            if (strip.some(function (w) { var r = w.params.rect; return r[ai] < hi - tolS && r[ai + 2] > lo + tolS; })) return;
            var before = strip.filter(function (w) { return w.params.rect[ai + 2] <= lo + tolS; }).sort(function (p, r) { return r.params.rect[ai + 2] - p.params.rect[ai + 2]; });
            var after = strip.filter(function (w) { return w.params.rect[ai] >= hi - tolS; }).sort(function (p, r) { return p.params.rect[ai] - r.params.rect[ai]; });
            if (!before.length || !after.length) return;
            var s0 = before[0].params.rect[ai + 2], s1 = after[0].params.rect[ai], along = [s0, s1];
            entOrder.forEach(function (h) { if (touch[h].length === 1 && touch[h][0] === door) { var e2 = ext(byEnt[h], ai); along = [Math.min(along[0], e2[0]), Math.max(along[1], e2[1])]; } });
            found.push({ axis: ai === 0 ? 'x' : 'y', s: [r6(s0), r6(s1)], along: [r6(along[0]), r6(along[1])], band: [r6(bd[0]), r6(bd[1])] });
          });
        });
        if (found.length === 1) q.opening_box = found[0];
      });
      var inBox = function (segs, b) {
        var ai = b.axis === 'x' ? 0 : 1, ci = 1 - ai, e1 = ext(segs, ai), e2 = ext(segs, ci);
        return e1[0] >= b.along[0] - tolS && e1[1] <= b.along[1] + tolS && e2[1] >= b.band[0] - tolS && e2[0] <= b.band[1] + tolS;
      };
      entOrder.forEach(function (h) {
        var segs = byEnt[h], hit = touch[h].slice();
        if (!hit.length) elems.forEach(function (door) { if (door.op === 'DXF_OPENING' && door.params.kind === 'door' && door.params.opening_box && inBox(segs, door.params.opening_box)) hit.push(door); });
        // D3 swing disc: still unattached -> the door whose hinge is within width + snap_tol of the piece's endpoint centroid (hardware, leaf, frame inside the swing)
        if (!hit.length) {
          var dcx = 0, dcy = 0; segs.forEach(function (sg) { dcx += sg.a[0] + sg.b[0]; dcy += sg.a[1] + sg.b[1]; }); dcx /= 2 * segs.length; dcy /= 2 * segs.length;
          elems.forEach(function (door) { if (door.op === 'DXF_OPENING' && door.params.kind === 'door' && Math.hypot(dcx - door.params.hinge[0], dcy - door.params.hinge[1]) <= door.params.width + (has(config, ['opening', 'casing']) ? config.opening.casing : tolS)) hit.push(door); });
          if (hit.length > 1) {   // the swing it sits deepest in wins (distance to the hinge as a share of the leaf width); a tie stays ambiguous
            var rr = hit.map(function (d) { return Math.hypot(dcx - d.params.hinge[0], dcy - d.params.hinge[1]) / d.params.width; }), rmin = Math.min.apply(null, rr), best = hit.filter(function (d, i) { return rr[i] <= rmin + 1e-9; });
            if (best.length === 1) hit = best;
          }
        }
        if (!hit.length) return;
        segs.forEach(function (sg) { sg.used = true; });
        if (hit.length > 1) { gap('GAP:door_part_ambiguous', segs[0].e, { doors: hit.map(function (d) { return d.e.handle; }).sort(function (p, q) { return hnum(p) - hnum(q); }) }); return; }
        segs.forEach(function (sg) { hit[0].params.parts.push({ handle: sg.e.handle, part: sg.part }); });
      });
      elems.forEach(function (x) { if (x.params.parts) x.params.parts.sort(function (p, q) { return hnum(p.handle) - hnum(q.handle) || p.part - q.part; }); });
      // W1 rectangle clusters among unconsumed segments
      var rest = oSegs.filter(function (sg) { return !sg.used; });
      var par = rest.map(function (_, i) { return i; });
      var find = function (i) { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
      for (var i = 0; i < rest.length; i++) for (var j = i + 1; j < rest.length; j++) {
        if (near(rest[i].a, rest[j].a) || near(rest[i].a, rest[j].b) || near(rest[i].b, rest[j].a) || near(rest[i].b, rest[j].b)) par[find(i)] = find(j);
      }
      var groups = {};
      rest.forEach(function (sg, i) { (groups[find(i)] = groups[find(i)] || []).push(sg); });
      var comps = Object.keys(groups).map(function (k) { return groups[k]; });
      comps.forEach(function (c) { c.sort(function (p, q) { return hnum(p.e.handle) - hnum(q.e.handle) || p.part - q.part; }); });
      comps.sort(function (p, q) { return hnum(p[0].e.handle) - hnum(q[0].e.handle) || p[0].part - q[0].part; });
      // D12 (c): leaves of 4 segments that share a FULL edge (the leaves of a double door, axis-aligned) are ONE rectangle opening, their union, when the union has exactly their total area; any other component of several entities is split per entity before the rectangle test.
      comps = comps.reduce(function (acc, c) {
        var by = {}; c.forEach(function (sg) { (by[sg.e.handle] = by[sg.e.handle] || []).push(sg); });
        var hs = Object.keys(by).sort(function (p, q) { return hnum(p) - hnum(q); });
        if (!(c.length > 4 && hs.length > 1 && hs.every(function (h) { return by[h].length === 4; }))) { acc.push(c); return acc; }
        var bbx = {}; hs.forEach(function (h) { var xs = [], ys = []; by[h].forEach(function (sg) { xs.push(sg.a[0], sg.b[0]); ys.push(sg.a[1], sg.b[1]); }); bbx[h] = [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)]; });
        var gp = {}; hs.forEach(function (h) { gp[h] = h; }); var gf = function (h) { while (gp[h] !== h) h = gp[h]; return h; };
        for (var i = 0; i < hs.length; i++) for (var j = i + 1; j < hs.length; j++) {
          var A = bbx[hs[i]], B2 = bbx[hs[j]];
          var sx = (Math.abs(A[2] - B2[0]) <= tolS || Math.abs(B2[2] - A[0]) <= tolS) && Math.abs(A[1] - B2[1]) <= tolS && Math.abs(A[3] - B2[3]) <= tolS;
          var sy = (Math.abs(A[3] - B2[1]) <= tolS || Math.abs(B2[3] - A[1]) <= tolS) && Math.abs(A[0] - B2[0]) <= tolS && Math.abs(A[2] - B2[2]) <= tolS;
          var same = Math.abs(A[0] - B2[0]) <= tolS && Math.abs(A[1] - B2[1]) <= tolS && Math.abs(A[2] - B2[2]) <= tolS && Math.abs(A[3] - B2[3]) <= tolS;
          if (sx || sy || same) gp[gf(hs[j])] = gf(hs[i]);
        }
        var grp = {}; hs.forEach(function (h) { (grp[gf(h)] = grp[gf(h)] || []).push(h); });
        Object.keys(grp).sort(function (p, q) { return hnum(p) - hnum(q); }).forEach(function (k) {
          var g = grp[k].sort(function (p, q) { return hnum(p) - hnum(q); });
          if (g.length > 1) {
            var U = [Math.min.apply(null, g.map(function (h) { return bbx[h][0]; })), Math.min.apply(null, g.map(function (h) { return bbx[h][1]; })), Math.max.apply(null, g.map(function (h) { return bbx[h][2]; })), Math.max.apply(null, g.map(function (h) { return bbx[h][3]; }))];
            var seenB = [], area = 0;   // two products drawn on the SAME footprint (e.g. leaf + panel) count once
            g.forEach(function (h) { var Bh = bbx[h]; if (seenB.some(function (o) { return Math.abs(o[0] - Bh[0]) <= tolS && Math.abs(o[1] - Bh[1]) <= tolS && Math.abs(o[2] - Bh[2]) <= tolS && Math.abs(o[3] - Bh[3]) <= tolS; })) return; seenB.push(Bh); area += (Bh[2] - Bh[0]) * (Bh[3] - Bh[1]); });
            if (Math.abs((U[2] - U[0]) * (U[3] - U[1]) - area) <= 1e-6) {
              var orig = []; g.forEach(function (h) { orig = orig.concat(by[h]); });
              var cs = [[U[0], U[1]], [U[2], U[1]], [U[2], U[3]], [U[0], U[3]]];
              acc.push(cs.map(function (q, i) { return { e: by[g[0]][0].e, part: i, a: q, b: cs[(i + 1) % 4], used: false, orig: orig, also: i === 0 ? g.slice(1).map(function (h) { return { handle: h, part: 0 }; }) : [] }; }));
              return;
            }
          }
          g.forEach(function (h) { acc.push(by[h]); });
        });
        return acc;
      }, []);
      comps.forEach(function (c) {
        if (c.length !== 4) return;
        var ends = []; c.forEach(function (sg) { ends.push(sg.a, sg.b); });
        for (var i = 0; i < ends.length; i++) { var cnt = 0; for (var j = 0; j < ends.length; j++) if (near(ends[i], ends[j])) cnt++; if (cnt !== 2) return; }
        var dirs = c.map(function (sg) { var dx = sg.b[0] - sg.a[0], dy = sg.b[1] - sg.a[1], L = Math.hypot(dx, dy); return L === 0 ? null : [dx / L, dy / L, L]; });
        if (dirs.some(function (d) { return !d; })) return;
        var parN = 0, perpN = 0;
        for (var i = 0; i < 4; i++) for (var j = i + 1; j < 4; j++) { var dot = Math.abs(dirs[i][0] * dirs[j][0] + dirs[i][1] * dirs[j][1]); if (dot > 0.999) parN++; else if (dot < 0.01) perpN++; }
        if (parN !== 2 || perpN !== 4) return;
        var li = 0, si = 0;
        for (var i = 1; i < 4; i++) { if (dirs[i][2] > dirs[li][2]) li = i; if (dirs[i][2] < dirs[si][2]) si = i; }
        var cx = 0, cy = 0; ends.forEach(function (q) { cx += q[0]; cy += q[1]; });
        var centre = [r6(cx / 8), r6(cy / 8)];
        var ang = Math.atan2(dirs[li][1], dirs[li][0]) * 180 / Math.PI; ang = ((ang % 180) + 180) % 180; ang = r6(ang) === 180 ? 0 : r6(ang);
        var first = c[0].e;
        c.forEach(function (sg) { sg.used = true; if (sg.orig) sg.orig.forEach(function (o) { o.used = true; }); });
        var members = c.map(function (sg) { return { handle: sg.e.handle, part: sg.part }; }).concat([].concat.apply([], c.map(function (sg) { return sg.also || []; })));
        var asDoor = !!(config.opening && config.opening.rect && config.opening.rect.door === true);   // D9: a rectangle on an opening layer is a door footprint (height from its label)
        if (!has(config, ['host_tol']) || (!asDoor && (!has(config, ['opening', 'rect', 'sill']) || !has(config, ['opening', 'rect', 'height'])))) {
          var seen = {}; c.forEach(function (sg) { if (!seen[sg.e.handle]) { seen[sg.e.handle] = 1; gap('GAP:no_dimension', sg.e, { need: 'host_tol,opening.rect.sill,opening.rect.height', members: members }); } });
          return;
        }
        var host = hostFor(centre);
        if (!host && asDoor) {   // D9: a door footprint lies in the GAP between two wall pieces; its two long-axis ends touch those pieces: the nearer piece hosts it (tie: lower handle, as hostFor)
          var ux = dirs[li][0], uy = dirs[li][1], hl = dirs[li][2] / 2, hA = hostFor([r6(centre[0] - ux * hl), r6(centre[1] - uy * hl)]), hB = hostFor([r6(centre[0] + ux * hl), r6(centre[1] + uy * hl)]);
          host = hA && hB ? (hnum(hA.e.handle) <= hnum(hB.e.handle) ? hA : hB) : (hA || hB);
        }
        if (!host) { var seen2 = {}; c.forEach(function (sg) { if (!seen2[sg.e.handle]) { seen2[sg.e.handle] = 1; gap('GAP:no_host', sg.e, { centre: centre, members: members }); } }); return; }
        elems.push({ op: 'DXF_OPENING', e: first, part: c[0].part, hostRef: host, params: {
          kind: 'rect', width: r6(dirs[li][2]), depth: r6(dirs[si][2]), centre: centre, angle_deg: ang,
          sill: asDoor ? 0 : config.opening.rect.sill, height: asDoor ? null : config.opening.rect.height, category: asDoor ? 'door' : undefined, pending_elevation: asDoor ? true : undefined, members: members } });
        gap('GAP:no_host_cut', first, { host_handle: host.e.handle, host_part: host.part, rect: true });
      });
      // D12 (b): a rectangle door (D9) takes the unattached entities whose endpoint centroid lies in its footprint grown by the casing; two footprints = ambiguous (listed)
      if (has(config, ['opening', 'casing'])) {
        var rdoors = elems.filter(function (x) { return x.op === 'DXF_OPENING' && x.params.kind === 'rect' && x.params.category === 'door'; });
        if (rdoors.length) {
          var left0 = {}; oSegs.forEach(function (sg) { if (!sg.used) (left0[sg.e.handle] = left0[sg.e.handle] || []).push(sg); });
          Object.keys(left0).sort(function (p, q) { return hnum(p) - hnum(q); }).forEach(function (h) {
            var segs = left0[h], cx = 0, cy = 0; segs.forEach(function (sg) { cx += sg.a[0] + sg.b[0]; cy += sg.a[1] + sg.b[1]; }); cx /= 2 * segs.length; cy /= 2 * segs.length;
            var over = [], hit = rdoors.filter(function (d) {
              var q = d.params, a = q.angle_deg * Math.PI / 180, dx = cx - q.centre[0], dy = cy - q.centre[1], u = dx * Math.cos(a) + dy * Math.sin(a), v = -dx * Math.sin(a) + dy * Math.cos(a);
              var ov = Math.max(Math.abs(u) - q.width / 2, Math.abs(v) - q.depth / 2, 0);   // how far outside the bare footprint (0 = inside it)
              if (ov > config.opening.casing) return false; over.push(ov); return true; });
            if (hit.length > 1) { var mn = Math.min.apply(null, over), at = hit.filter(function (d, i) { return over[i] <= mn + 1e-9; }); if (at.length === 1) hit = at; }   // the footprint it lies in (or nearest to) wins; a tie stays ambiguous
            if (!hit.length) return;
            segs.forEach(function (sg) { sg.used = true; });
            if (hit.length > 1) { gap('GAP:door_part_ambiguous', segs[0].e, { doors: hit.map(function (d) { return d.e.handle; }).sort(function (p, q) { return hnum(p) - hnum(q); }) }); return; }
            hit[0].params.parts = hit[0].params.parts || []; segs.forEach(function (sg) { hit[0].params.parts.push({ handle: sg.e.handle, part: sg.part }); });
          });
        }
      }
      // W4 leftovers: one gap per entity that still has unconsumed segments
      var left = {};
      oSegs.forEach(function (sg) { if (!sg.used) { left[sg.e.handle] = left[sg.e.handle] || { e: sg.e, n: 0 }; left[sg.e.handle].n++; } });
      Object.keys(left).sort(function (p, q) { return hnum(p) - hnum(q); }).forEach(function (h) { gap('GAP:opening_unclassified', left[h].e, { unconsumed_parts: left[h].n }); });
    }

    // §22 windows from glazing clusters
    (function () {
      if (!glazEnts.length) return;
      var gseen = {};
      if (!has(config, ['snap_tol'])) { glazEnts.forEach(function (e) { if (!gseen[e.handle]) { gseen[e.handle] = 1; gap('GAP:no_dimension', e, { need: 'snap_tol' }); } }); return; }
      var T = config.snap_tol, items = [];
      glazEnts.forEach(function (e) {
        if (e.type === 'LINE') items.push({ e: e, part: 0, pts: [e.vertices[0], e.vertices[1]] });
        else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') items.push({ e: e, part: 0, pts: e.vertices });
        else gap('GAP:unsupported_entity', e);
      });
      items.forEach(function (it) {
        var xs = it.pts.map(function (q) { return m(q.x); }), ys = it.pts.map(function (q) { return m(q.y); });
        it.b = [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)];
      });
      var par = items.map(function (_, i) { return i; });
      var find = function (i) { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
      var TP = Math.max(T, WINDOW_PART_GAP);   // §D55 the parts of one window (frames, mullions, panes) may be drawn a few mm to 50 mm apart: one cluster
      for (var i = 0; i < items.length; i++) for (var j = i + 1; j < items.length; j++) {
        var a = items[i].b, b = items[j].b;
        if (a[0] <= b[2] + TP && b[0] <= a[2] + TP && a[1] <= b[3] + TP && b[1] <= a[3] + TP) par[find(i)] = find(j);
      }
      var groups = {};
      items.forEach(function (it, i) { (groups[find(i)] = groups[find(i)] || []).push(it); });
      var cl = Object.keys(groups).map(function (k) { return groups[k]; });
      cl.forEach(function (c) { c.sort(function (p, q) { return hnum(p.e.handle) - hnum(q.e.handle); }); });
      cl.sort(function (p, q) { return hnum(p[0].e.handle) - hnum(q[0].e.handle); });
      function rectDist(a, b) { var dx = Math.max(0, a[0] - b[2], b[0] - a[2]), dy = Math.max(0, a[1] - b[3], b[1] - a[3]); return Math.hypot(dx, dy); }
      cl.forEach(function (c) {
        var bb = [Math.min.apply(null, c.map(function (x) { return x.b[0]; })), Math.min.apply(null, c.map(function (x) { return x.b[1]; })),
                  Math.max.apply(null, c.map(function (x) { return x.b[2]; })), Math.max.apply(null, c.map(function (x) { return x.b[3]; }))];
        var members = c.map(function (x) { return { handle: x.e.handle, part: x.part }; });
        var seen = {};
        function gapAll(code, extra) { c.forEach(function (x) { if (!seen[x.e.handle]) { seen[x.e.handle] = 1; gap(code, x.e, Object.assign({ members: members }, extra || {})); } }); }
        var fromElev = !!(config.opening && config.opening.window && config.opening.window.from_elevation === true);
        if (!has(config, ['host_tol']) || (!fromElev && (!has(config, ['opening', 'window', 'sill']) || !has(config, ['opening', 'window', 'height'])))) { gapAll('GAP:no_dimension', { need: fromElev ? 'host_tol' : 'host_tol,opening.window.sill,opening.window.height' }); return; }
        var best = null;
        elems.forEach(function (w) {
          if (w.op !== 'DXF_WALL') return;
          var d = w.params.rect ? rectDist(bb, w.params.rect) : null;
          if (d === null) { var cc = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2]; d = dist2seg(cc, w.params.start, w.params.end); }
          d = r6(d); if (d > config.host_tol) return;
          var key = [d, hnum(w.e.handle), w.part];
          if (!best || key[0] < best.key[0] || (key[0] === best.key[0] && (key[1] < best.key[1] || (key[1] === best.key[1] && key[2] < best.key[2])))) best = { key: key, w: w };
        });
        if (!best) { gapAll('GAP:no_host', { bbox: bb }); return; }
        var ww = r6(bb[2] - bb[0]), hh = r6(bb[3] - bb[1]);
        elems.push({ op: 'DXF_OPENING', e: c[0].e, part: 0, hostRef: best.w, params: {
          kind: 'window', centre: [r6((bb[0] + bb[2]) / 2), r6((bb[1] + bb[3]) / 2)], width: Math.max(ww, hh), depth: Math.min(ww, hh), angle_deg: ww >= hh ? 0 : 90,
          sill: fromElev ? null : config.opening.window.sill, height: fromElev ? null : config.opening.window.height, pending_elevation: fromElev, bbox: bb.map(r6), axis_aligned_bbox: true, members: members } });
        gap('GAP:no_host_cut', c[0].e, { host_handle: best.w.e.handle, host_part: best.w.part, window: true });
      });
    })();

    // §46 stub orientation: a footprint piece lying exactly in a neighbour's wall strip takes that wall's axis (pier between openings)
    (function () {
      if (!has(config, ['opening', 'gap_max'])) return;
      var gmax = config.opening.gap_max, st = has(config, ['snap_tol']) ? config.snap_tol : 0, eq = function (a, b) { return Math.abs(a - b) <= st + 1e-9; };
      var W = elems.filter(function (w) { return w.op === 'DXF_WALL' && w.params.footprint && !w.params.pair && !w.params.polygon && w.params.rect && !eq(w.params.rect[2] - w.params.rect[0], w.params.rect[3] - w.params.rect[1]); });
      var T = thinCands.map(function (c) { return c.el; }).filter(function (w) { return !eq(w.params.rect[2] - w.params.rect[0], w.params.rect[3] - w.params.rect[1]); });   // F5b: thin candidates are subjects, never voters
      var isH = function (w) { var r = w.params.rect || w.params.bbox; return (r[2] - r[0]) - (r[3] - r[1]) > st + 1e-9; };
      var V = W.concat(elems.filter(function (w) { return w.op === 'DXF_OPENING' && w.params.kind === 'window' && w.params.bbox && !eq(w.params.bbox[2] - w.params.bbox[0], w.params.bbox[3] - w.params.bbox[1]); }));   // W-S2b windows vote too
      var dec = W.concat(T).map(function (P) {
        var r = P.params.rect, votes = { h: [], v: [] };
        V.forEach(function (N) {
          if (N === P) return; var n = N.params.rect || N.params.bbox;
          if (isH(N)) { if (eq(r[1], n[1]) && eq(r[3], n[3])) { var gx = Math.max(n[0] - r[2], r[0] - n[2]); if (gx >= -1e-9 - st && gx <= gmax + st) votes.h.push(N); } }
          else if (eq(r[0], n[0]) && eq(r[2], n[2])) { var gy = Math.max(n[1] - r[3], r[1] - n[3]); if (gy >= -1e-9 - st && gy <= gmax + st) votes.v.push(N); }
        });
        return { P: P, votes: votes };
      });
      dec.forEach(function (d) {
        var P = d.P, h = d.votes.h, v = d.votes.v, r = P.params.rect;
        if (h.length && v.length) { if (!P.thin) gap('GAP:wall_orientation_ambiguous', P.e, { part: P.part, rect: r }); return; }
        if (!h.length && !v.length) return;
        var wantH = h.length > 0; if (wantH === isH(P)) return;
        var voters = (wantH ? h : v).slice().sort(function (a, b) { return hnum(a.e.handle) - hnum(b.e.handle); }), cx = r6((r[0] + r[2]) / 2), cy = r6((r[1] + r[3]) / 2), fw = r6(r[2] - r[0]), fh = r6(r[3] - r[1]);
        P.params.start = wantH ? [r[0], cy] : [cx, r[1]]; P.params.end = wantH ? [r[2], cy] : [cx, r[3]];
        P.params.length = wantH ? fw : fh; P.params.thickness = wantH ? fh : fw; P.params.orient_source = 'neighbour'; P.params.orient_from = voters[0].e.handle;
      });
    })();

    // BASIC_SHAPES_SPEC §2.2 F5b: a thin candidate whose oriented thickness reaches min_thickness is a wall (its gap removed); else the gap stays
    thinCands.forEach(function (c) {
      if (!(c.el.params.thickness >= config.wall.min_thickness)) return;
      gaps.splice(gaps.indexOf(c.gapRef), 1);
      c.el.params.min_thickness_after_orientation = true;
      var hk = hnum(c.el.e.handle), at = elems.length;
      for (var i = 0; i < elems.length; i++) { var x = elems[i]; if (x.op !== 'DXF_WALL' || hnum(x.e.handle) > hk || (hnum(x.e.handle) === hk && x.part > c.el.part)) { at = i; break; } }
      elems.splice(at, 0, c.el);
    });

    // extent (metres) of all emitted element geometry — logged so a wrong unit is visible (N11)
    var xs = [], ys = [];
    elems.forEach(function (x) {
      var P = x.params; var pts = P.rect ? [[P.rect[0], P.rect[1]], [P.rect[2], P.rect[3]]] : P.start ? [P.start, P.end] : P.outline ? P.outline : P.position ? [P.position] : [];   // footprint pieces: their drawn rectangle (BASIC_SHAPES_SPEC §2.2: a reoriented pier's axis is not its extent)
      pts.forEach(function (q) { xs.push(q[0]); ys.push(q[1]); });
    });
    var extent = xs.length ? { min: [Math.min.apply(null, xs), Math.min.apply(null, ys)], max: [Math.max.apply(null, xs), Math.max.apply(null, ys)] } : null;
    var warnings = [];
    if (unitsSource === 'header') warnings.push('WARN:units_from_header (' + units + '): header units are unverified, set config.units from the drawing');

    // S6 emit list: DXF_RUN first, then elements in handle/part order, then gaps
    var ops = [];
    ops.push({ op_type: 'DXF_RUN', params: {
      run_id: runId, dxf_hash: dxfHash, units: units, units_source: unitsSource, factor_to_m: K, extent_m: extent, warnings: warnings, counts: { entities: ents.length, elements: elems.length, ignored: ignored.length, gaps: gaps.length } },
      input_guids: [], output_guid: runId });
    elems.forEach(function (x) {
      var g = guid(x.e, x.part);
      var extra = x.hostRef ? { host_wall: guid(x.hostRef.e, x.hostRef.part), host_handle: x.hostRef.e.handle } : {};
      ops.push({ op_type: x.op, params: Object.assign({ run_id: runId, handle: x.e.handle, layer: x.e.layer, part: x.part }, x.params, extra),
        input_guids: [], output_guid: g });
    });
    gaps.forEach(function (g) { ops.push({ op_type: 'DXF_GAP', params: Object.assign({ run_id: runId }, g), input_guids: [], output_guid: null }); });

    if (deps.sink) ops.forEach(function (o) { deps.sink(o.op_type, o.params, o.input_guids, o.output_guid); });

    // S7 report
    counts.elements = elems.length; counts.ignored = ignored.length; counts.gaps = gaps.length;
    return { run_id: runId, ops: ops, report: { region: regionInfo, exclude: excludeInfo, counts: counts, gaps: gaps, ignored: ignored, extent_m: extent, warnings: warnings, units: units, units_source: unitsSource } };
  }

  return { run: run, canon: canon, matchRule: matchRule, r6: r6 };
});
