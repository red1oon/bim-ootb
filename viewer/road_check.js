// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// road_check.js — road standards check for civil models (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §MC).
// PORTABLE, same contract as viewer/structural_sanity.js / viewer/egress_sanity.js: dbQuery(sql, params) -> rows in,
// plain JS out, no DOM / THREE. Rows use their shape {guid, ifc_class, name, storey, rule, severity, ratio} plus
// {measured, limit, unit, clause, code, note} so the rule-checklist panel and the findings film can take them later.
//
// Every limit comes from rates/road_rules.json (JKR ATJ 2B/2D, cited to clause). The geometry method settings in its
// `measurement` block are ours and are returned in `assumptions` so the report prints them.
//
// Geometry: the DB stores `center` = vertex CENTROID and vertices relative to it (import_worker.js), so an element's
// world points are center + R_z(local) — never center ± bbox/2 (§W.2). Faces are Int32 indices, vertices Float32.
//
// Witness: tests/witness_road_check.js.

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.RoadCheck = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  function _bytes(b) {
    if (!b) return null;
    var u = (b instanceof Uint8Array) ? b : new Uint8Array(b);
    return u.slice();   // own, aligned buffer (better-sqlite3 Buffers can sit at odd offsets)
  }
  function _f32(b) { var u = _bytes(b); return u ? new Float32Array(u.buffer, 0, u.byteLength >> 2) : null; }
  function _i32(b) { var u = _bytes(b); return u ? new Int32Array(u.buffer, 0, u.byteLength >> 2) : null; }

  function _inList(guids) { return guids.map(function () { return '?'; }).join(','); }

  // World points + triangles for a list of guids. Rotation as the renderer applies it (streaming.js rotation.set
  // (rotX, rotZ, -rotY) = CCW about IFC Z); civil imports carry rotation_x/y = 0.
  function _loadGeom(dbQuery, guids) {
    var out = {};
    for (var k = 0; k < guids.length; k += 400) {
      var chunk = guids.slice(k, k + 400);
      var rows = dbQuery('SELECT t.guid, t.center_x cx, t.center_y cy, t.center_z cz, t.rotation_z rz, c.vertices v, c.faces f ' +
        'FROM element_transforms t JOIN element_instances i ON i.guid = t.guid ' +
        'JOIN component_geometries c ON c.geometry_hash = i.geometry_hash WHERE t.guid IN (' + _inList(chunk) + ')', chunk);
      rows.forEach(function (r) {
        var a = _f32(r.v); if (!a || !a.length) return;
        var c = Math.cos(r.rz || 0), s = Math.sin(r.rz || 0), n = a.length / 3;
        var w = new Float64Array(a.length);
        var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
        for (var i = 0; i < n; i++) {
          var x = a[3 * i], y = a[3 * i + 1], z = a[3 * i + 2];
          var X = r.cx + x * c - y * s, Y = r.cy + x * s + y * c, Z = r.cz + z;
          w[3 * i] = X; w[3 * i + 1] = Y; w[3 * i + 2] = Z;
          if (X < mn[0]) mn[0] = X; if (Y < mn[1]) mn[1] = Y; if (Z < mn[2]) mn[2] = Z;
          if (X > mx[0]) mx[0] = X; if (Y > mx[1]) mx[1] = Y; if (Z > mx[2]) mx[2] = Z;
        }
        out[r.guid] = { v: w, f: _i32(r.f), min: mn, max: mx };
      });
    }
    return out;
  }

  // ── Sign face by triangle sections. A z-plane cuts the mesh into segments; their union length along the sign's
  // plan axis is the "coverage" at that height. A post covers its own width; a two-post frame covers two post
  // widths (NOT the span between them — vertex extent got that wrong); the face covers its width.
  function _signFace(g, M) {
    var v = g.v, f = g.f, n = v.length / 3, i;
    var mx = 0, my = 0; for (i = 0; i < n; i++) { mx += v[3 * i]; my += v[3 * i + 1]; } mx /= n; my /= n;
    var sxx = 0, syy = 0, sxy = 0;
    for (i = 0; i < n; i++) { var dx = v[3 * i] - mx, dy = v[3 * i + 1] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    var th = 0.5 * Math.atan2(2 * sxy, sxx - syy), ax = Math.cos(th), ay = Math.sin(th);
    var z0 = g.min[2], z1 = g.max[2], step = M.slice_step_m;
    var slices = [];
    for (var z = z0 + step / 2; z < z1; z += step) slices.push({ z: z, iv: [] });
    if (f && f.length >= 3) {
      for (var t = 0; t + 2 < f.length; t += 3) {
        var p = [f[t], f[t + 1], f[t + 2]].map(function (q) { return [v[3 * q], v[3 * q + 1], v[3 * q + 2]]; });
        var tz0 = Math.min(p[0][2], p[1][2], p[2][2]), tz1 = Math.max(p[0][2], p[1][2], p[2][2]);
        var s0 = Math.max(0, Math.ceil((tz0 - z0 - step / 2) / step)), s1 = Math.min(slices.length - 1, Math.floor((tz1 - z0 - step / 2) / step));
        for (var si = s0; si <= s1; si++) {
          var zz = slices[si].z, ts = [];
          for (var e = 0; e < 3; e++) {
            var A = p[e], B = p[(e + 1) % 3];
            if ((A[2] - zz) * (B[2] - zz) <= 0 && A[2] !== B[2]) {
              var u = (zz - A[2]) / (B[2] - A[2]);
              ts.push((A[0] + u * (B[0] - A[0]) - mx) * ax + (A[1] + u * (B[1] - A[1]) - my) * ay);
            }
          }
          if (ts.length >= 2) slices[si].iv.push([Math.min.apply(null, ts), Math.max.apply(null, ts)]);
        }
      }
    }
    slices.forEach(function (sl) {
      sl.iv.sort(function (a, b) { return a[0] - b[0]; });
      var cov = 0, cs = null, ce = null;
      sl.iv.forEach(function (I) {
        if (cs === null) { cs = I[0]; ce = I[1]; }
        else if (I[0] > ce) { cov += ce - cs; cs = I[0]; ce = I[1]; }
        else if (I[1] > ce) ce = I[1];
      });
      if (cs !== null) cov += ce - cs;
      sl.cov = cov;
    });
    var post = slices.length ? slices[0].cov : 0;
    var thr = Math.max(post * M.face_cover_factor, post + M.face_cover_margin_m);
    var faceIdx = -1;
    for (i = 0; i < slices.length; i++) if (slices[i].cov > thr) { faceIdx = i; break; }
    var faceBottom = faceIdx >= 0 ? slices[faceIdx].z - step / 2 : z0;
    var width = 0; slices.forEach(function (sl) { if (sl.cov > width) width = sl.cov; });
    // plan points: post foot (vertices in the lowest 0.2 m) and the face's two ends along the axis
    var fx = 0, fy = 0, fn = 0, tmin = Infinity, tmax = -Infinity, pmin = null, pmax = null;
    for (i = 0; i < n; i++) {
      var X = v[3 * i], Y = v[3 * i + 1], Z = v[3 * i + 2];
      if (Z < z0 + 0.2) { fx += X; fy += Y; fn++; }
      if (Z >= faceBottom) {
        var tt = (X - mx) * ax + (Y - my) * ay;
        if (tt < tmin) { tmin = tt; pmin = [X, Y]; }
        if (tt > tmax) { tmax = tt; pmax = [X, Y]; }
      }
    }
    return { faceBottom: faceBottom, faceFound: faceIdx >= 0, faceWidth: width, postCover: post,
             foot: fn ? [fx / fn, fy / fn] : [mx, my], ends: [pmin, pmax].filter(Boolean) };
  }

  function _ptTri2(px, py, a, b, c) {
    var d1 = (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1]);
    var d2 = (px - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (py - c[1]);
    var d3 = (px - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (py - a[1]);
    var neg = (d1 < 0) || (d2 < 0) || (d3 < 0), pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
    if (!(neg && pos)) return 0;
    return Math.min(_ptSeg(px, py, a, b), _ptSeg(px, py, b, c), _ptSeg(px, py, c, a));
  }
  function _ptSeg(px, py, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
    var u = L ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / L)) : 0;
    var X = a[0] + u * dx - px, Y = a[1] + u * dy - py;
    return Math.sqrt(X * X + Y * Y);
  }

  // Plan distance from a point to the nearest ROAD triangle, and the road top there: the highest vertex of every road
  // triangle within (nearest + road_top_band_m) — the nearest vertex alone can be the solid's underside.
  function _roadAt(roadGeoms, px, py, M) {
    var best = Infinity, near = [];
    roadGeoms.forEach(function (g) {
      if (px < g.min[0] - M.road_search_m || px > g.max[0] + M.road_search_m ||
          py < g.min[1] - M.road_search_m || py > g.max[1] + M.road_search_m) return;
      var v = g.v, f = g.f;
      for (var t = 0; t + 2 < f.length; t += 3) {
        var a = [v[3 * f[t]], v[3 * f[t] + 1]], b = [v[3 * f[t + 1]], v[3 * f[t + 1] + 1]], c = [v[3 * f[t + 2]], v[3 * f[t + 2] + 1]];
        var d = _ptTri2(px, py, a, b, c);
        if (d > M.road_search_m) continue;
        if (d < best) best = d;
        near.push([d, Math.max(v[3 * f[t] + 2], v[3 * f[t + 1] + 2], v[3 * f[t + 2] + 2])]);
      }
    });
    if (best === Infinity) return null;
    var top = -Infinity;
    near.forEach(function (q) { if (q[0] <= best + M.road_top_band_m && q[1] > top) top = q[1]; });
    return { dist: best, top: top };
  }

  function _normCode(c) { return String(c || '').replace(/\s+/g, '').toUpperCase(); }

  function _pop(rule) { return { rule: rule, population: 0, judged: 0, notJudged: 0, findings: 0 }; }
  function _status(p) { return p.population === 0 ? 'VACUOUS' : (p.judged === 0 ? 'INCONCLUSIVE' : 'JUDGED'); }

  /**
   * @param {function(string, Array=): Array<object>} dbQuery
   * @param {object} cfg - parsed rates/road_rules.json
   * @param {object} [opts] - { log: fn }
   * @returns {{rows:Array, populations:object, coverage:Array, assumptions:object, signs:Array, studGroups:Array}}
   */
  function run(dbQuery, cfg, opts) {
    var log = (opts && opts.log) || function () {};
    var S = cfg.selectors, M = cfg.measurement, R = {};
    (cfg.road_rules || []).forEach(function (r) { R[r.name] = r; });
    var rows = [], pops = {};
    ['sign_mounting_height', 'obstruction_marker_height', 'sign_lateral_clearance', 'chevron_spacing', 'rrpm_spacing']
      .forEach(function (n) { pops[n] = _pop(n); });

    var hasPsets = dbQuery("SELECT COUNT(*) n FROM sqlite_master WHERE name = 'element_psets'")[0].n > 0;
    function psetMap(name) {
      var m = {};
      if (!hasPsets) return m;
      dbQuery('SELECT guid, value FROM element_psets WHERE name = ?', [name]).forEach(function (r) { m[r.guid] = r.value; });
      return m;
    }
    var codeOf = psetMap(S.sign_code_pset), nameOf = psetMap(S.sign_name_pset), compOf = psetMap(S.component_pset);

    // ── Signs ──
    var signRows = dbQuery('SELECT m.guid, m.ifc_class, m.element_name, m.storey FROM elements_meta m WHERE m.discipline = ?', [S.sign_discipline]);
    var roadMeta = dbQuery('SELECT guid FROM elements_meta WHERE discipline = ?', [S.road_discipline]).map(function (r) { return r.guid; });
    var signs = [];
    if (signRows.length) {
      var sg = _loadGeom(dbQuery, signRows.map(function (r) { return r.guid; }));
      // ROAD pieces near any sign: plan prefilter with center ± bbox (FULL size — the centroid can sit anywhere inside
      // the true box, so ±bbox always contains it) grown by the search radius.
      var tr = roadMeta.length ? dbQuery('SELECT t.guid, t.center_x cx, t.center_y cy, t.bbox_x bx, t.bbox_y by FROM element_transforms t JOIN elements_meta m ON m.guid = t.guid WHERE m.discipline = ?', [S.road_discipline]) : [];
      var pts = signRows.map(function (r) { var g = sg[r.guid]; return g ? [(g.min[0] + g.max[0]) / 2, (g.min[1] + g.max[1]) / 2] : null; }).filter(Boolean);
      var need = tr.filter(function (t) {
        var rx = (t.bx || 0) + M.road_search_m, ry = (t.by || 0) + M.road_search_m;
        return pts.some(function (p) { return Math.abs(p[0] - t.cx) <= rx && Math.abs(p[1] - t.cy) <= ry; });
      }).map(function (t) { return t.guid; });
      var rg = _loadGeom(dbQuery, need), roadGeoms = Object.keys(rg).map(function (k) { return rg[k]; }).filter(function (g) { return g.f; });
      log('§ROAD_CHECK signs=' + signRows.length + ' road_pieces=' + roadMeta.length + ' road_near=' + roadGeoms.length);

      signRows.forEach(function (r) {
        var g = sg[r.guid]; if (!g) return;
        var face = _signFace(g, M);
        var road = _roadAt(roadGeoms, face.foot[0], face.foot[1], M);
        var lat = null;
        if (road) {
          var ends = face.ends.length ? face.ends : [face.foot];
          lat = Math.min.apply(null, ends.map(function (p) { var q = _roadAt(roadGeoms, p[0], p[1], M); return q ? q.dist : Infinity; }));
        }
        signs.push({ guid: r.guid, ifc_class: r.ifc_class, storey: r.storey, code: codeOf[r.guid] || null,
          label: nameOf[r.guid] || r.element_name, face: face, road: road, lateral: lat,
          height: road ? face.faceBottom - road.top : null, secondary: false });
      });
      // secondary sign: another sign's face directly above it on the same post (foot within secondary_sign_plan_m)
      signs.forEach(function (a) {
        signs.forEach(function (b) {
          if (a === b) return;
          var d = Math.hypot(a.face.foot[0] - b.face.foot[0], a.face.foot[1] - b.face.foot[1]);
          if (d <= M.secondary_sign_plan_m && b.face.faceBottom > a.face.faceBottom) a.secondary = true;
        });
      });

      var obstr = (S.obstruction_marker_codes || []).map(_normCode), chev = (S.chevron_delineator_codes || []).map(_normCode);
      signs.forEach(function (s) {
        var nc = _normCode(s.code), isObs = obstr.indexOf(nc) >= 0, isChev = chev.indexOf(nc) >= 0;
        var base = { guid: s.guid, ifc_class: s.ifc_class, storey: s.storey, code: s.code,
          name: (s.code ? s.code + ' ' : '') + (s.label || '') };
        // height
        var hr = isObs ? 'obstruction_marker_height' : 'sign_mounting_height', P = pops[hr];
        P.population++;
        if (s.height === null) { P.notJudged++; }
        else {
          P.judged++;
          var lim = isObs ? R[hr].limit_m : (s.secondary ? R[hr].limits_m.secondary : R[hr].limits_m[cfg.area_type]);
          if (s.height < lim) {
            P.findings++;
            rows.push(Object.assign({}, base, { rule: hr, severity: R[hr].severity, ratio: +s.height.toFixed(3),
              measured: +s.height.toFixed(3), limit: lim, unit: 'm', clause: R[hr].clause,
              note: isObs ? 'bottom of marker above road edge' : ('bottom of sign above road edge' + (s.secondary ? ' (secondary sign)' : ' (' + cfg.area_type + ')') + (s.face.faceFound ? '' : '; no post found — whole element taken as face')) }));
          }
        }
        // lateral clearance
        var L = pops.sign_lateral_clearance; L.population++;
        if (s.lateral === null || !isFinite(s.lateral)) { L.notJudged++; }
        else {
          L.judged++;
          var ll = isChev ? R.sign_lateral_clearance.chevron_recommended_m : R.sign_lateral_clearance.limit_m;
          if (s.lateral < ll) {
            L.findings++;
            rows.push(Object.assign({}, base, { rule: 'sign_lateral_clearance', severity: R.sign_lateral_clearance.severity,
              ratio: +s.lateral.toFixed(3), measured: +s.lateral.toFixed(3), limit: ll, unit: 'm', clause: R.sign_lateral_clearance.clause,
              note: isChev ? 'chevron: 1.8 m recommended' : 'nearest sign edge to nearest ROAD solid' }));
          }
        }
      });

      // chevron spacing — nearest other chevron delineator
      var chevs = signs.filter(function (s) { return chev.indexOf(_normCode(s.code)) >= 0; });
      var C = pops.chevron_spacing; C.population = chevs.length;
      chevs.forEach(function (a) {
        var nn = Infinity;
        chevs.forEach(function (b) { if (a !== b) nn = Math.min(nn, Math.hypot(a.face.foot[0] - b.face.foot[0], a.face.foot[1] - b.face.foot[1])); });
        if (!isFinite(nn)) { C.notJudged++; return; }
        C.judged++;
        a.chevronSpacing = nn;
        if (Math.abs(nn - R.chevron_spacing.spacing_m) > M.spacing_tolerance_m) {
          C.findings++;
          rows.push({ guid: a.guid, ifc_class: a.ifc_class, storey: a.storey, code: a.code, name: a.code + ' ' + (a.label || ''),
            rule: 'chevron_spacing', severity: R.chevron_spacing.severity, ratio: +nn.toFixed(3), measured: +nn.toFixed(3),
            limit: R.chevron_spacing.spacing_m, unit: 'm', clause: R.chevron_spacing.clause,
            note: 'nearest other chevron; tolerance ±' + M.spacing_tolerance_m + ' m (ours)' });
        }
      });
    }

    // ── Road studs (RRPM) ──
    var studGuids = Object.keys(compOf).filter(function (g) { return compOf[g] === S.stud_component; });
    var groups = [];
    if (studGuids.length) {
      var P2 = [];
      for (var k = 0; k < studGuids.length; k += 400) {
        var ch = studGuids.slice(k, k + 400);
        P2 = P2.concat(dbQuery('SELECT guid, center_x x, center_y y FROM element_transforms WHERE guid IN (' + _inList(ch) + ')', ch));
      }
      var n = P2.length, nn = new Array(n);
      for (var a = 0; a < n; a++) { var m = Infinity; for (var b = 0; b < n; b++) if (a !== b) m = Math.min(m, Math.hypot(P2[a].x - P2[b].x, P2[a].y - P2[b].y)); nn[a] = m; }
      var sorted = nn.slice().sort(function (p, q) { return p - q; }), med = sorted[Math.floor(n / 2)];
      var link = med * M.stud_link_factor, par = []; for (a = 0; a < n; a++) par[a] = a;
      function fnd(x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; }
      for (a = 0; a < n; a++) for (b = a + 1; b < n; b++) if (Math.hypot(P2[a].x - P2[b].x, P2[a].y - P2[b].y) <= link) par[fnd(a)] = fnd(b);
      var gm = {}; for (a = 0; a < n; a++) (gm[fnd(a)] = gm[fnd(a)] || []).push(a);
      var G = pops.rrpm_spacing;
      Object.keys(gm).forEach(function (key, gi) {
        var idx = gm[key], sp = idx.map(function (i) { return nn[i]; }).sort(function (p, q) { return p - q; });
        var spacing = sp[Math.floor(sp.length / 2)], tol = M.spacing_tolerance_m;
        var match = R.rrpm_spacing.rows.filter(function (row) {
          return row.spacing_m != null ? Math.abs(spacing - row.spacing_m) <= tol : (spacing >= row.min_m - tol && spacing <= row.max_m + tol);
        });
        var grp = { id: gi + 1, n: idx.length, spacing: spacing, guid: P2[idx[0]].guid, matches: match.map(function (r) { return r.application; }) };
        groups.push(grp);
        G.population++; G.judged++;
        if (!match.length) {
          G.findings++;
          rows.push({ guid: grp.guid, ifc_class: 'IfcBuildingElementProxy', storey: null, code: null,
            name: 'Stud group ' + grp.id + ' (' + grp.n + ' studs)', rule: 'rrpm_spacing', severity: R.rrpm_spacing.severity,
            ratio: +spacing.toFixed(3), measured: +spacing.toFixed(3), limit: '12 / 24 (lines) · 4–12 (islands)', unit: 'm',
            clause: R.rrpm_spacing.clause, note: 'median stud spacing matches no Table 4.2 row; application not in the data',
            guids: idx.map(function (i) { return P2[i].guid; }) });
        }
      });
      log('§ROAD_CHECK studs=' + n + ' groups=' + groups.length + ' median_nn=' + med.toFixed(3) + ' link=' + link.toFixed(3));
    }

    // ── Sign code coverage (not a finding) ──
    var atj = {}; Object.keys(cfg.atj2a_codes || {}).forEach(function (c) { if (c[0] !== '_') atj[_normCode(c)] = cfg.atj2a_codes[c]; });
    var cov = {};
    signs.forEach(function (s) {
      var key = s.code || '(no code)';
      if (!cov[key]) {
        var parts = s.code ? String(s.code).split('&').map(function (p) { return p.trim(); }) : [];
        cov[key] = { code: key, count: 0, label: s.label, atj2a: parts.length ? parts.map(function (p) { return atj[_normCode(p)] ? 'line ' + atj[_normCode(p)] : null; }) : null };
      }
      cov[key].count++;
    });
    var coverage = Object.keys(cov).map(function (k) { return cov[k]; }).sort(function (p, q) { return q.count - p.count; });

    Object.keys(pops).forEach(function (k) {
      pops[k].status = _status(pops[k]);
      log('§ROAD_CHECK rule=' + k + ' status=' + pops[k].status + ' population=' + pops[k].population +
        ' judged=' + pops[k].judged + ' not_judged=' + pops[k].notJudged + ' findings=' + pops[k].findings);
    });
    return { rows: rows, populations: pops, coverage: coverage, signs: signs, studGroups: groups,
             assumptions: { area_type: cfg.area_type, measurement: M } };
  }

  function evaluate(dbQuery, cfg, opts) { return run(dbQuery, cfg, opts).rows; }

  // A model is a road when it has elements and every discipline is a civil one (same gate as the civil 4D template).
  function isCivilModel(dbQuery, civilDiscs) {
    var d = dbQuery('SELECT DISTINCT discipline d FROM elements_meta').map(function (r) { return r.d; });
    return d.length > 0 && d.every(function (x) { return civilDiscs.indexOf(x) >= 0; });
  }

  return { run: run, evaluate: evaluate, isCivilModel: isCivilModel, _signFace: _signFace, _roadAt: _roadAt };
});
