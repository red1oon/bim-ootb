// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// speed_zones.js — §SPEED_ZONES (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §SPEED_ZONES). Speed limits DERIVED by the
// ATJ 8/86 rules held in std_values.json `geometric` (extracted by tools/extract_atj8_geometric.py; every row carries
// table + page). NO model names / GUIDs / codes here: the title->category mapping, the speed-sign codes, the assumed inputs
// and the user lever all live in std_values.json and are editable through the Settings JSON editor.
// Chain: project title -> road category (mapping row) -> design standard class (Table 2.4: category x area x ADT) ->
//        design speed (Table 3.2A rural x terrain / 3.2B urban x area type) -> lane width (Table 5.2) + max grade (4.10A-F).
// Lever geometric.speed_setting.mode: "derived" | "class" (user picks R1-R6/U1-U6) | "manual" (user types km/h, global or per zone).
// Pure core (node + browser) + browser glue (mount). Witness: tests/witness_speed_zones.js
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SpeedZones = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  function esc(x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var ROMAN = ['I', 'II', 'III'], TERR = ['FLAT', 'ROLLING', 'MOUNTAINOUS'];
  function refTxt(r) { return r ? 'ATJ 8/86 ' + r.table + ', p.' + r.page : 'ATJ 8/86 (no table row)'; }

  // ── Table 2.4 lookup: category x area x ADT -> class ──────────────────────────────────────────────────────────────
  function bandOf(name, adt) {
    if (name === 'all') return true;
    if (adt == null) return false;
    var m;
    if ((m = /^>=(\d+)$/.exec(name))) return adt >= +m[1];
    if ((m = /^<=(\d+)$/.exec(name))) return adt <= +m[1];
    if ((m = /^(\d+)-(\d+)$/.exec(name))) return adt >= +m[1] && adt <= +m[2];
    return false;
  }
  function selectClass(geo, area, category, adt) {
    var rows = geo.selection.rows.filter(function (r) { return r.area === area && r.category === category; });
    if (!rows.length) return { cls: null, why: 'Table 2.4 has no row for ' + area + ' ' + category };
    var hit = rows.filter(function (r) { return bandOf(r.adt_band, adt); });
    if (hit.length === 1) return { cls: hit[0]['class'], band: hit[0].adt_band, ref: geo.selection.ref };
    if (adt == null && rows.every(function (r) { return r.adt_band !== 'all'; })) return { cls: null, why: 'ADT missing — Table 2.4 needs it for ' + area + ' ' + category };
    return { cls: null, why: 'ADT ' + adt + ' falls in no Table 2.4 band for ' + area + ' ' + category };
  }
  function speedRow(geo, cls) {
    var rural = /^R/.test(cls), t = geo.design_speed[rural ? 'rural' : 'urban'];
    return t && t.rows[cls] ? { row: t.rows[cls], ref: t.ref, axis: rural ? 'terrain' : 'area_type' } : null;
  }
  function speedAt(geo, cls, terrain, areaType) {
    var s = speedRow(geo, cls); if (!s) return null;
    var i = s.axis === 'terrain' ? TERR.indexOf(terrain) : ROMAN.indexOf(areaType);
    return i < 0 ? null : { speed: s.row[i], ref: s.ref };
  }
  function maxGrade(geo, cls, speed, terrain, areaType) {
    var rural = /^R/.test(cls), keys = rural ? [terrain, terrain + '|' + ROMAN[TERR.indexOf(terrain)]] : [areaType, TERR[ROMAN.indexOf(areaType)] + '|' + areaType];
    var r = geo.max_grade.rows.filter(function (g) { return g.classes.indexOf(cls) >= 0 && g.speed_kmh === speed && keys.indexOf(g.terrain_or_area) >= 0; })[0];
    return r ? { pct: r.max_grade_pct, ref: { table: r.table, page: r.page } } : null;
  }
  function laneWidth(geo, cls) {
    var r = geo.lane_width.rows[cls];
    return r ? { m: r.lane_width_m, note: r._note || null, ref: geo.lane_width.ref } : null;
  }

  // ── project a point onto the route polyline (xz) -> chainage s (m) + lateral distance ────────────────────────────
  function projectToRoute(route, x, z) {
    var best = null, cum = 0;
    for (var i = 1; i < route.length; i++) {
      var ax = route[i - 1].x, az = route[i - 1].z, bx = route[i].x, bz = route[i].z, dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz, L = Math.sqrt(L2);
      var u = L2 > 1e-12 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)) : 0;
      var px = ax + u * dx, pz = az + u * dz, d = Math.hypot(x - px, z - pz);
      if (!best || d < best.lateral) best = { s: cum + u * L, lateral: d };
      cum += L;
    }
    return best;
  }
  // point + unit tangent at chainage s (x,z plane; y from the waypoint when it has one)
  function pointAt(route, s) {
    var cum = 0;
    for (var i = 1; i < route.length; i++) {
      var ax = route[i - 1].x, az = route[i - 1].z, bx = route[i].x, bz = route[i].z, L = Math.hypot(bx - ax, bz - az);
      if (s <= cum + L || i === route.length - 1) { var u = L > 1e-12 ? Math.max(0, Math.min(1, (s - cum) / L)) : 0; return { x: ax + u * (bx - ax), z: az + u * (bz - az), y: route[i - 1].y != null ? route[i - 1].y + u * ((route[i].y != null ? route[i].y : route[i - 1].y) - route[i - 1].y) : null, tx: L > 1e-12 ? (bx - ax) / L : 1, tz: L > 1e-12 ? (bz - az) / L : 0 }; }
      cum += L;
    }
    return null;
  }
  function routeLength(route) { var c = 0; for (var i = 1; i < route.length; i++) c += Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z); return c; }

  // ── terrain per window from the long-section samples (median |slope| %, ATJ thresholds) ────────────────────────
  function terrainClass(geo, pct) {
    var cl = geo.terrain.classes;
    if (pct < cl[0].max_pct) return cl[0].name;
    if (pct <= cl[1].max_pct) return cl[1].name;
    return cl[2].name;
  }
  function terrainWindows(geo, ti, prof, L, msgs) {
    var ds = prof.ds, wm = ti.window_m, out = [], arr = prof[ti.source === 'road' ? 'road' : 'ground'];
    for (var s0 = 0; s0 < L - 1e-6; s0 += wm) {
      var s1 = Math.min(L, s0 + wm), sl = [];
      for (var i = Math.floor(s0 / ds) + 1; i <= Math.min(arr.length - 1, Math.floor(s1 / ds)); i++)
        if (arr[i] === arr[i] && arr[i - 1] === arr[i - 1]) sl.push(Math.abs(arr[i] - arr[i - 1]) / ds * 100);
      if (sl.length < ti.min_pairs) { out.push({ s0: s0, s1: s1, terrain: ti.assumed_terrain, measured: false, pairs: sl.length, pct: null }); continue; }
      sl.sort(function (a, b) { return a - b; });
      var med = sl.length % 2 ? sl[(sl.length - 1) / 2] : (sl[sl.length / 2 - 1] + sl[sl.length / 2]) / 2;
      out.push({ s0: s0, s1: s1, terrain: terrainClass(geo, med), measured: true, pairs: sl.length, pct: med });
    }
    return out;
  }

  // ── the derivation ───────────────────────────────────────────────────────────────────────────────────────────────
  // in: { title, route:[{x,z}], profile:{ds,ground:[],road:[]}, signs:[{guid,code,name,x,z}] }
  function derive(std, inp, opts) {
    var log = (opts && opts.log) || function () {}, geo = std && std.geometric, msgs = [];
    var R = { ok: false, vacuous: true, msgs: msgs, zones: [], signRows: [], mode: null, assumed: [] };
    if (!geo || !geo.selection || !geo.design_speed || !geo.inputs || !geo.road_category_map || !geo.speed_setting || !geo.terrain_inputs) {
      msgs.push('std_values.json has no complete `geometric` section — nothing derived'); log('§SPEED_ZONES NO_DATA ' + msgs[0]); return R;
    }
    if (!inp.route || inp.route.length < 2) { msgs.push('no drive route in this model — cannot place chainages'); log('§SPEED_ZONES VACUOUS ' + msgs[0]); return R; }
    var L = routeLength(inp.route), lever = geo.speed_setting, mode = lever.mode || 'derived', I = geo.inputs;
    R.mode = mode; R.length = L;
    // 1. category from the model's own title via the editable mapping row
    var cat = null;
    for (var i = 0; i < geo.road_category_map.rows.length && !cat; i++) {
      var mr = geo.road_category_map.rows[i];
      try { if (new RegExp(mr.title_regex, 'i').test(inp.title || '')) cat = mr; } catch (e) { msgs.push('bad title_regex in road_category_map: ' + mr.title_regex); }
    }
    if (!cat) { msgs.push('road category: model title "' + (inp.title || '') + '" matches no road_category_map row — add one in Settings'); log('§SPEED_ZONES NO_CATEGORY'); return R; }
    var area = I.area.value, adt = I.adt.value, areaType = I.area_type.value;
    if (I.area.status !== 'user') R.assumed.push('area ' + area); if (I.area_type.status !== 'user' && area === 'URBAN') R.assumed.push('area type ' + areaType);
    if (I.adt.status !== 'user' && adt != null) R.assumed.push('ADT ' + adt);
    if (cat.status !== 'user') R.assumed.push('category ' + cat.category + ' (title -> category mapping)');
    var sel = selectClass(geo, cat.area || area, cat.category, adt);
    area = cat.area || area;
    // 2. terrain windows
    var ti = geo.terrain_inputs, tw = terrainWindows(geo, ti, inp.profile || { ds: 1, ground: [], road: [] }, L, msgs);
    var unm = tw.filter(function (w) { return !w.measured; }).length;
    if (unm) { msgs.push('terrain: ' + unm + ' of ' + tw.length + ' windows have < ' + ti.min_pairs + ' ' + ti.source + ' samples — terrain ASSUMED ' + ti.assumed_terrain + ' there'); R.assumed.push('terrain ' + ti.assumed_terrain + ' (' + unm + ' unmeasured windows)'); }
    // 3. breakpoints: speed-sign chainages + terrain-window class changes
    var codes = (geo.speed_sign_codes || []).map(norm), speedSigns = [];
    var signs = (inp.signs || []).map(function (sg) { var pj = projectToRoute(inp.route, sg.x, sg.z); return { guid: sg.guid, code: sg.code, name: sg.name, s: pj.s, lateral: pj.lateral }; });
    signs.forEach(function (sg) { if (sg.code && sg.code.split('&').map(norm).some(function (c) { return codes.indexOf(c) >= 0; })) speedSigns.push(sg); });
    var bp = [0, L], why = { 0: 'start' };
    speedSigns.forEach(function (sg) { if (sg.s > 0 && sg.s < L) { bp.push(sg.s); why[sg.s] = 'sign ' + sg.code; } });
    for (var w = 1; w < tw.length; w++) if (tw[w].terrain !== tw[w - 1].terrain) { bp.push(tw[w].s0); if (!why[tw[w].s0]) why[tw[w].s0] = 'terrain ' + tw[w - 1].terrain + '->' + tw[w].terrain; }
    bp = bp.filter(function (v, k, a) { return a.indexOf(v) === k; }).sort(function (a, b) { return a - b; });
    function terrainAt(s) { for (var k = 0; k < tw.length; k++) if (s < tw[k].s1 - 1e-9 || k === tw.length - 1) return tw[k]; return tw[tw.length - 1]; }
    var gcl = geo.speed_setting.class, mainCls = sel.cls;
    // buildZones(bp, ivs): one zone per breakpoint pair; a zone whose midpoint lies in a roundabout/approach interval (ivs) takes that rule's speed
    // (a per_zone user value still overrides); every other zone is a link zone (the ATJ 8/86 chain / lever).
    function buildZones(bp, ivs) {
    var outZ = [];
    for (var z = 0; z + 1 < bp.length; z++) {
      var s0 = bp[z], s1 = bp[z + 1], tws = terrainAt(s0 + 1e-6), zone = { id: 'Z' + (z + 1), kind: 'link', s0: s0, s1: s1, opens: why[s0] || '', terrain: tws.terrain, terrainMeasured: tws.measured, terrainPct: tws.pct, areaType: areaType, area: area, category: cat.category, derivedClass: mainCls, notes: [] };
      var cls = null, speed = null, spRef = null, label = 'derived';
      var iv = ivs.filter(function (q) { var m = (s0 + s1) / 2; return m >= q.s0 && m < q.s1; })[0];
      if (iv) {
        var pzr = lever.per_zone && lever.per_zone[zone.id];
        zone.kind = iv.kind; zone.node = iv.node; zone.srcText = iv.srcText; zone.approachM = iv.approachM || null; zone.linkSpeed = iv.linkSpeed || null;
        zone.cls = null; zone.speed = pzr != null ? +pzr : iv.speed; zone.speedRef = null; zone.lane = null; zone.grade = null; zone.selRef = null; zone.catRow = cat; zone.mode = mode;
        zone.label = pzr != null ? 'manual (user, per zone)' : iv.label; zone.assumed = R.assumed.slice(); if (iv.assumed) zone.assumed.push(iv.assumed);
        outZ.push(zone); continue;
      }
      if (mode === 'class') {
        cls = lever['class']; label = 'class ' + cls + ' (user)';
        var sa = cls && speedAt(geo, cls, tws.terrain, areaType);
        if (!sa) { zone.notes.push('class "' + cls + '" not in the ATJ 8/86 design-speed tables'); msgs.push('lever class "' + cls + '" not in Table 3.2A/B'); cls = null; } else { speed = sa.speed; spRef = sa.ref; }
      } else if (mode === 'manual') {
        label = 'manual (user)';
        var pz = lever.per_zone && lever.per_zone[zone.id], v = pz != null ? pz : lever.design_speed_kmh;
        if (v == null) { zone.notes.push('manual mode but no speed set for ' + zone.id); msgs.push('manual mode: no design_speed_kmh / per_zone.' + zone.id); }
        else {
          speed = +v;
          var cands = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'U1', 'U2', 'U3', 'U4', 'U5', 'U6'].filter(function (c) {
            if (mainCls && c[0] !== mainCls[0]) return false; var q = speedAt(geo, c, tws.terrain, areaType); return q && q.speed === speed; });
          cls = (mainCls && cands.indexOf(mainCls) >= 0) ? mainCls : (cands.length === 1 ? cands[0] : null);
          if (!cls) { label = 'manual (user), no table row'; zone.notes.push('speed ' + speed + ' km/h matches ' + (cands.length ? 'several classes (' + cands.join(', ') + ')' : 'no class') + ' at ' + tws.terrain + ' — width/gradient not looked up'); }
        }
      } else {
        if (mode !== 'derived') { msgs.push('unknown speed_setting.mode "' + mode + '" — treated as derived'); }
        if (!sel.cls) { zone.notes.push(sel.why); if (msgs.indexOf(sel.why) < 0) msgs.push(sel.why); }
        else { cls = sel.cls; var sd = speedAt(geo, cls, tws.terrain, areaType); if (sd) { speed = sd.speed; spRef = sd.ref; } }
      }
      zone.cls = cls; zone.speed = speed; zone.speedRef = spRef; zone.label = label; zone.mode = mode;
      zone.lane = cls ? laneWidth(geo, cls) : null; zone.grade = (cls && speed != null) ? maxGrade(geo, cls, speed, tws.terrain, areaType) : null;
      zone.selRef = sel.ref || null; zone.catRow = cat;
      zone.assumed = R.assumed.slice();
      outZ.push(zone);
    }
    return outZ;
    }
    var n0 = msgs.length, baseZ = buildZones(bp, []), n1 = msgs.length;
    // §CONTROLLED_NODE — ONE mechanism for every node kind listed in geometric.node_kinds (roundabout, signal_junction, ...). Per kind (geometric[kind]):
    //   detection = model_map[<map>_prop/_value]; speed = `speed_kmh` (demo default) or a `nchrp_entry_speed` table row; approach = ATJ 8/86 Table 4.1
    //   SSD at the adjoining link speed on each side that exists (or fixed_m); membership = 'self' (elements painted) | 'road_in_box' (off-route: ROAD
    //   pieces inside the plan box of the node elements). No names in code: kinds, keys, labels, zone ids all come from std_values.json.
    var ivs = [], nodes = {}, ssd = geo.stopping_sight_distance;
    function linkSpeedAt(s) { var q = baseZ.filter(function (k) { return s >= k.s0 - 1e-9 && s < k.s1 - 1e-9; })[0] || baseZ[baseZ.length - 1]; return q ? q.speed : null; }
    function deriveNode(key) {
      var C = geo[key]; if (!C || C.enabled === false) return null;
      var mm = geo.model_map || {}, noun = C.noun || key, tag = '§' + key.toUpperCase() + '_ZONE', zid = C.zone_id || key.toUpperCase();
      var raw = (inp.nodes && inp.nodes[key]) || [], pts = raw.map(function (p) { return projectToRoute(inp.route, p.x, p.z); });
      if (!pts.length) { msgs.push(noun + ': no model elements with ' + mm[C.map + '_prop'] + ' = ' + mm[C.map + '_value'] + ' — no ' + noun + ' zone derived'); log(tag + ' NONE ' + msgs[msgs.length - 1]); return null; }
      var rs0 = Math.min.apply(null, pts.map(function (p) { return p.s; })), rs1 = Math.max.apply(null, pts.map(function (p) { return p.s; })), rlat = Math.max.apply(null, pts.map(function (p) { return p.lateral; })), rmin = Math.min.apply(null, pts.map(function (p) { return p.lateral; }));
      var lane = C.lane_type, tab = C.nchrp_entry_speed && C.nchrp_entry_speed[lane], pick = C.speed_pick === 'upper' ? 1 : 0, sp = null, mph = null, speedTxt = '', assumedTxt = null;
      if (C.speed_kmh != null) { sp = +C.speed_kmh; speedTxt = sp + ' km/h (geometric.' + key + '.speed_kmh, editable)'; if (C.speed_status !== 'user') assumedTxt = noun + ' speed ' + sp + ' km/h is a demo default'; }
      else if (tab) { sp = tab.kmh[pick]; mph = tab.mph[pick]; speedTxt = 'recommended max entry design speed ' + mph + ' mph = ' + sp + ' km/h (' + (C.speed_pick || 'lower') + ' bound, ' + lane + '-lane)'; if (C.lane_type_status !== 'user') assumedTxt = noun + ' lane type ' + lane; }
      if (sp == null) { msgs.push(noun + ': no speed_kmh and lane_type "' + lane + '" has no row in geometric.' + key + '.nchrp_entry_speed — no ' + noun + ' zone'); log(tag + ' NO_SPEED ' + msgs[msgs.length - 1]); return null; }
      var offRoute = (rs1 - rs0) < 1e-6 && (rs1 <= 1e-6 || rs0 >= L - 1e-6);
      var info = { key: key, noun: noun, zoneId: zid, membership: C.membership || 'self', offRoute: offRoute, guids: raw.map(function (p) { return p.guid; }), n: pts.length, s0: rs0, s1: rs1, maxLateral: rlat, minLateral: rmin, lane: lane, pick: C.speed_pick || 'lower', speed: sp, mph: mph, pre: null, post: null, signs: [],
        box: { x0: Math.min.apply(null, raw.map(function (p) { return p.x; })), x1: Math.max.apply(null, raw.map(function (p) { return p.x; })), z0: Math.min.apply(null, raw.map(function (p) { return p.z; })), z1: Math.max.apply(null, raw.map(function (p) { return p.z; })) } };
      var fixed = C.approach && typeof C.approach === 'object' ? C.approach.fixed_m : null, lbl = C.label || key;
      function linkSpeed(side) { return side === 'before' ? (rs0 > 1e-6 ? linkSpeedAt(rs0 - 1e-6) : null) : (rs1 < L - 1e-6 ? linkSpeedAt(rs1 + 1e-6) : null); }
      function appr(side) {
        var ls = linkSpeed(side), len = null, how = null;
        if (side === 'before' ? rs0 <= 1e-6 : rs1 >= L - 1e-6) return { len: null, linkSpeed: null, how: null, routeEnd: true };   // the route ends at the node on this side: nothing to slow
        if (fixed != null) { len = +fixed; how = 'fixed ' + len + ' m (user)'; }
        else if (ls == null) { msgs.push(noun + ' ' + side + '-approach: adjoining link has no design speed — approach not drawn'); }
        else if (ssd && ssd.rows_m[String(ls)] != null) { len = ssd.rows_m[String(ls)]; how = 'ATJ 8/86 ' + ssd.ref.table.split(' ').slice(0, 2).join(' ') + ', p.' + ssd.ref.page + ': ' + len + ' m SSD at ' + ls + ' km/h link'; }
        else { msgs.push(noun + ' ' + side + '-approach: ATJ 8/86 Table 4.1 has no row for ' + ls + ' km/h — approach not drawn (set approach.fixed_m to override)'); }
        return { len: len, linkSpeed: ls, how: how };
      }
      var pre = appr('before'), post = appr('after'); info.pre = pre; info.post = post;
      function apIv(a, s0, s1) { return { kind: 'approach', node: key, s0: s0, s1: s1, speed: sp, approachM: a.len, linkSpeed: a.linkSpeed, label: 'demo rule (editable): approach slows to the ' + noun + ' speed — ' + a.how, srcText: 'demo rule (editable) · ' + a.how + ' · speed = ' + noun + ' speed (' + lbl + ')', assumed: assumedTxt }; }
      if (pre.len) { pre.s0 = Math.max(0, rs0 - pre.len); ivs.push(apIv(pre, pre.s0, rs0)); why[pre.s0] = why[pre.s0] || noun + ' approach (before)'; bp.push(pre.s0); }
      why[rs0] = offRoute ? noun + ' (off-route, ' + rlat.toFixed(0) + ' m max / ' + rmin.toFixed(0) + ' m min lateral, beyond the route ' + (rs1 <= 1e-6 ? 'start' : 'end') + ')' : noun; bp.push(rs0); why[rs1] = why[rs1] || noun + ' exit (approach after)'; bp.push(rs1);
      if (!offRoute) ivs.push({ kind: key, node: key, s0: rs0, s1: rs1, speed: sp, label: lbl, srcText: lbl + ' · ' + speedTxt, assumed: assumedTxt });
      if (post.len) { post.s1 = Math.min(L, rs1 + post.len); ivs.push(apIv(post, rs1, post.s1)); why[post.s1] = why[post.s1] || noun + ' approach ends'; bp.push(post.s1); }
      var rx = C.sign_regex ? new RegExp(C.sign_regex, 'i') : null;
      if (rx) info.signs = signs.filter(function (sg) { return rx.test(sg.name || '') || rx.test(sg.code || ''); }).map(function (sg) { return { guid: sg.guid, name: sg.name, code: sg.code, s: sg.s }; });
      info.lbl = lbl; info.speedTxt = speedTxt; info.assumedTxt = assumedTxt; info.minLat = rmin;
      return info;
    }
    (geo.node_kinds || []).forEach(function (key) {
      var info = deriveNode(key); if (!info) return; nodes[key] = info;
      bp = bp.filter(function (v, k, a) { return a.indexOf(v) === k; }).sort(function (a, b) { return a - b; });
      if (!ivs.some(function (q) { return q.node === key; })) msgs.push(info.noun + ': zero-length on the route and no approach could be placed');
    });
    if (ivs.length) { var nm = msgs.splice(n1); msgs.length = n0; R.zones = buildZones(bp, ivs); nm.forEach(function (m) { msgs.push(m); }); } else R.zones = baseZ;
    R.nodes = nodes;
    // off-route node (all its elements project onto a route END): no chainage extent -> an extra zone entry (id = config zone_id, s0=s1) so the legend/sign list/paint
    // still carry its speed; membership (elements / road pieces in the plan box) is painted by membership, not by chainage.
    Object.keys(nodes).forEach(function (key) {
      var nf = nodes[key]; if (!nf.offRoute) return;
      var zO = { id: nf.zoneId, kind: key, offRoute: true, s0: nf.s0, s1: nf.s1, opens: 'off-route (' + nf.n + ' elements, nearest ' + nf.minLat.toFixed(0) + ' m from the route end)', terrain: '-', terrainMeasured: false, terrainPct: null, areaType: areaType, area: area, category: cat.category, derivedClass: mainCls, notes: [], cls: null, speed: nf.speed, speedRef: null, lane: null, grade: null, selRef: null, catRow: cat, mode: mode,
        label: nf.lbl, srcText: nf.lbl + ' · ' + nf.speedTxt + ' · ' + nf.n + ' ' + nf.noun + ' elements lie off the route (no on-route chainage)', assumed: R.assumed.slice().concat(nf.assumedTxt ? [nf.assumedTxt] : []) };
      var pzO = geo.speed_setting.per_zone && geo.speed_setting.per_zone[nf.zoneId]; if (pzO != null) { zO.speed = +pzO; zO.label = 'manual (user, per zone)'; }
      R.zones.push(zO); nf.zone = zO;
    });
    // merge neighbours that differ in nothing but a terrain-window edge (a sign boundary always stays)
    R.signRows = signs.map(function (sg) {
      var tile = R.zones.filter(function (q) { return !q.offRoute; }), zz = tile.filter(function (q) { return sg.s >= q.s0 - 1e-9 && sg.s < q.s1 - 1e-9; })[0] || tile[tile.length - 1];
      var isSpeed = speedSigns.indexOf(sg) >= 0;
      return { guid: sg.guid, code: sg.code, name: sg.name, s: sg.s, lateral: sg.lateral, isSpeedSign: isSpeed, zone: zz.id, speed: zz.speed, label: zz.label, cls: zz.cls };
    });
    R.signRows.sort(function (a, b) { return (b.isSpeedSign ? 1 : 0) - (a.isSpeedSign ? 1 : 0) || a.s - b.s; });
    // §SPEED_SIGN_DISC plan: a disc on every real speed sign, plus one at the START of every on-route zone that has no speed sign within disc_snap_m of it
    //   (nearest unused SIGNAGE element within disc_snap_m, else a free-standing marker on the route). Pure data; the browser glue mounts it.
    var snap = (geo.disc_snap_m != null ? +geo.disc_snap_m : 100), atStart = (geo.disc_has_sign_m != null ? +geo.disc_has_sign_m : 30), plan = [], used = {};
    R.signRows.forEach(function (r) { if (r.isSpeedSign) { plan.push({ kind: 'real', guid: r.guid, zone: r.zone, s: r.s, speed: r.speed, label: r.label }); used[r.guid] = 1; } });
    R.zones.filter(function (q) { return !q.offRoute; }).forEach(function (q) {
      if (q.speed == null) return;
      if (R.signRows.some(function (r) { return r.isSpeedSign && Math.abs(r.s - q.s0) <= atStart; })) return;
      var cand = R.signRows.filter(function (r) { return !used[r.guid] && Math.abs(r.s - q.s0) <= snap; }).sort(function (a, b) { return Math.abs(a.s - q.s0) - Math.abs(b.s - q.s0); })[0];
      if (cand) { used[cand.guid] = 1; plan.push({ kind: 'other', guid: cand.guid, code: cand.code || cand.name || null, zone: q.id, zoneStart: q.s0, zoneEnd: q.s1, s: cand.s, speed: q.speed, label: 'derived — no speed sign in model' }); }
      else plan.push({ kind: 'free', guid: null, zone: q.id, zoneStart: q.s0, zoneEnd: q.s1, s: q.s0, speed: q.speed, label: 'derived — no speed sign in model' });
    });
    R.discPlan = plan; R.discSnapM = snap; R.discAtStartM = atStart;
    log('§SPEED_SIGN_PLAN real=' + plan.filter(function (x) { return x.kind === 'real'; }).length + ' borrowed=' + plan.filter(function (x) { return x.kind === 'other'; }).length + ' freeStanding=' + plan.filter(function (x) { return x.kind === 'free'; }).length + ' snapM=' + snap + ' atStartM=' + atStart);
    R.terrainWindows = tw; R.speedSigns = speedSigns.map(function (s) { return { guid: s.guid, code: s.code, s: s.s }; }); R.catRow = cat; R.sel = sel;
    R.ok = R.zones.length > 0 && R.zones.every(function (q) { return q.speed != null; }); R.vacuous = false;
    log('§SPEED_ZONES mode=' + mode + ' category=' + cat.category + ' area=' + area + ' class=' + (mainCls || 'NONE') + ' zones=' + R.zones.length + ' speedSigns=' + speedSigns.length + ' signs=' + signs.length +
        ' routeLen=' + L.toFixed(1) + ' assumed=[' + R.assumed.join('; ') + ']' + (msgs.length ? ' MSG=' + msgs.join(' | ') : ''));
    R.zones.forEach(function (q) {
      log('§SPEED_ZONE ' + q.id + ' s=' + q.s0.toFixed(1) + '..' + q.s1.toFixed(1) + ' opens=' + q.opens + ' terrain=' + q.terrain + (q.terrainMeasured ? '(' + q.terrainPct.toFixed(2) + '%)' : '(assumed)') +
          ' kind=' + q.kind + ' class=' + q.cls + ' speed=' + q.speed + ' label="' + q.label + '" lane=' + (q.lane ? q.lane.m : 'NA') + ' maxGrade=' + (q.grade ? q.grade.pct : 'NA') + ' src=' + (q.srcText || refTxt(q.speedRef)));
    });
    Object.keys(nodes).forEach(function (key) {
      var rb = nodes[key], T = '§' + key.toUpperCase();
      log(T + '_ZONE s=' + rb.s0.toFixed(1) + '..' + rb.s1.toFixed(1) + ' elements=' + rb.n + ' maxLateralM=' + rb.maxLateral.toFixed(1) + ' offRoute=' + rb.offRoute + ' membership=' + rb.membership + ' lane=' + rb.lane + ' pick=' + rb.pick + ' speed=' + rb.speed + ' km/h (' + rb.speedTxt + ') before=' + (rb.pre.len || 'none') + ' m@link' + rb.pre.linkSpeed + ' after=' + (rb.post.len || 'none') + ' m@link' + rb.post.linkSpeed);
      rb.signs.forEach(function (sg) { log(T + '_SIGN ' + (sg.name || sg.code) + ' s=' + sg.s.toFixed(1) + ' vs approach-before start ' + (rb.pre.s0 != null ? rb.pre.s0.toFixed(1) : 'n/a') + ' (comparison only, not a boundary)'); });
      log(T + '_SIGNS count=' + rb.signs.length);
    });
    return R;
  }
  function norm(c) { return String(c == null ? '' : c).toUpperCase().replace(/[\s.]/g, ''); }

  // colour per speed: shipped table (presentation, std_values `speed_colours`), else deterministic hue from the number
  function colourFor(std, speed) {
    // speed colour ramp lives in std_values.json geometric.speed_ramp (editable); hsl fallback only if the ramp is absent
    var rp = std.geometric && std.geometric.speed_ramp, st = rp && rp.stops;
    if (st && st.length && speed != null) {
      var hx = function (c) { return [(parseInt(c.slice(1), 16) >> 16) & 255, (parseInt(c.slice(1), 16) >> 8) & 255, parseInt(c.slice(1), 16) & 255]; };
      if (speed <= st[0].kmh) return st[0].hex; if (speed >= st[st.length - 1].kmh) return st[st.length - 1].hex;
      for (var i = 1; i < st.length; i++) if (speed <= st[i].kmh) {
        var u = (speed - st[i - 1].kmh) / (st[i].kmh - st[i - 1].kmh), a = hx(st[i - 1].hex), b = hx(st[i].hex), o = '#';
        for (var j = 0; j < 3; j++) o += ('0' + Math.round(a[j] + (b[j] - a[j]) * u).toString(16)).slice(-2);
        return o; }
    }
    var h = Math.round(((speed % 140) / 140) * 300), c = 'hsl(' + h + ',70%,50%)';
    return c;
  }
  function hexOf(css) {
    if (/^#/.test(css)) return parseInt(css.slice(1), 16);
    var m = /hsl\((\d+),(\d+)%,(\d+)%\)/.exec(css); if (!m) return 0x888888;
    var h = +m[1] / 360, s = +m[2] / 100, l = +m[3] / 100, q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    function f(t) { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }
    return (Math.round(f(h + 1 / 3) * 255) << 16) | (Math.round(f(h) * 255) << 8) | Math.round(f(h - 1 / 3) * 255);
  }

  // ── browser glue ────────────────────────────────────────────────────────────────────────────────────────────────
  function setupSpeedZones(A) {
    var _touched = [], _on = false, _discs = [], _mats = [];
    function objQuery(q, params) { var st = A.db.prepare(q), out = []; try { if (params && params.length) st.bind(params); while (st.step()) out.push(st.getAsObject()); } finally { st.free(); } return out; }
    function gather(std) {
      var mm = std._model_map || {}, geo = std.geometric, route = (A.civilDriveRoute && A.civilDriveRoute()) || null;
      var title = '';
      var tr = objQuery('SELECT value FROM element_psets WHERE name = ? LIMIT 1', [geo.model_map.title_prop]); if (tr.length) title = String(tr[0].value);
      var signs = [], codeOf = {}, nameOf = {};
      if (geo.model_map.sign_name_prop) objQuery('SELECT guid, value FROM element_psets WHERE name = ?', [geo.model_map.sign_name_prop]).forEach(function (r) { if (nameOf[r.guid] == null && r.value != null) nameOf[r.guid] = String(r.value); });
      objQuery('SELECT guid, value FROM element_psets WHERE name = ?', [mm.code_prop]).forEach(function (r) { if (codeOf[r.guid] == null && r.value != null) codeOf[r.guid] = String(r.value); });
      objQuery('SELECT m.guid AS guid, m.element_name AS name, t.center_x AS cx, t.center_y AS cy, t.center_z AS cz FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid WHERE m.discipline = ?', [mm.discipline]).forEach(function (r) {
        var p = A.ifc2three(r.cx, r.cy, r.cz); signs.push({ guid: r.guid, code: codeOf[r.guid] || null, name: nameOf[r.guid] || r.name, x: p.x, z: p.z }); });
      // §CONTROLLED_NODE: per node kind, the elements the model_map names (property + value [+ discipline] from std_values.json, no names in code)
      var nodes = {};
      (geo.node_kinds || []).forEach(function (key) {
        var C = geo[key], mm2 = geo.model_map, list = nodes[key] = []; if (!C || C.enabled === false || !mm2[C.map + '_prop']) return;
        var disc = mm2[C.map + '_discipline'];
        objQuery('SELECT m.guid AS guid, t.center_x AS cx, t.center_y AS cy, t.center_z AS cz FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid JOIN element_psets p ON p.guid = m.guid WHERE p.name = ? AND p.value = ?' + (disc ? ' AND m.discipline = ?' : ''), [mm2[C.map + '_prop'], mm2[C.map + '_value']].concat(disc ? [disc] : [])).forEach(function (r) { var p = A.ifc2three(r.cx, r.cy, r.cz); list.push({ guid: r.guid, x: p.x, z: p.z }); });
      });
      return { title: title, route: route, signs: signs, nodes: nodes };
    }
    function revert() {
      _touched.forEach(function (s) {
        try { if (s.inst != null) { s.m.setColorAt(s.inst, s.col.setHex(s.c)); s.m.instanceColor.needsUpdate = true; } else if (s.batch != null) s.m.setColorAt(s.batch, s.col.setHex(s.c)); } catch (e) {}
      });
      _mats.forEach(function (x) { try { if (x.m.material !== x.mat) { x.m.material.dispose(); x.m.material = x.mat; } delete x.m._szWhite; } catch (e) {} }); _mats = [];
      _discs.forEach(function (d) { try { A.scene.remove(d); d.material.map.dispose(); d.material.dispose(); d.geometry.dispose(); } catch (e) {} }); _discs = [];
      var n = _touched.length; _touched = []; _on = false; A._speedZonesTint = null; if (A.markDirty) A.markDirty();
      console.log('§SPEED_ZONES_PAINT off reverted=' + n); return n;
    }
    // ROAD elements -> chainage -> zone colour (presentation only; saved originals restored by revert())
    function paint(res, std) {
      revert();
      var route = res.route, byGuid = {}, ms = {}, n = 0, maxLat = 0, noZone = 0, colOf = {}, rbSet = {};
      Object.keys(res.nodes || {}).forEach(function (k) { var nf = res.nodes[k]; if (nf.membership === 'self') nf.guids.forEach(function (g) { rbSet[g] = k; }); });
      var rows = objQuery("SELECT m.guid AS guid, t.center_x AS cx, t.center_y AS cy, t.center_z AS cz FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid WHERE m.discipline = ?", [std.geometric.model_map.road_discipline]);
      rows.forEach(function (r) {
        var p = A.ifc2three(r.cx, r.cy, r.cz), pj = projectToRoute(route, p.x, p.z), tile = res.zones.filter(function (q) { return !q.offRoute; });
        var zz = tile.filter(function (q) { return pj.s >= q.s0 - 1e-9 && pj.s < q.s1 - 1e-9; })[0] || tile[tile.length - 1];
        // roundabout elements (model_map property) carry the roundabout zone speed by membership; interior roundabout zone or the off-route RB entry
        if (rbSet[r.guid]) zz = res.zones.filter(function (q) { return q.kind === rbSet[r.guid]; })[0] || zz;
        // road_in_box membership: an OFF-route node paints the ROAD pieces whose centre lies inside the plan box of its elements (the on-route case is chainage)
        Object.keys(res.nodes || {}).forEach(function (k) { var nf = res.nodes[k], bx = nf.box; if (nf.membership !== 'road_in_box' || !nf.offRoute) return;
          if (p.x >= bx.x0 && p.x <= bx.x1 && p.z >= bx.z0 && p.z <= bx.z1) zz = res.zones.filter(function (q) { return q.kind === k; })[0] || zz; });
        if (zz.speed == null) { noZone++; return; }
        byGuid[r.guid] = { hex: hexOf(colourFor(std, zz.speed)), zone: zz.id, speed: zz.speed, s: pj.s }; maxLat = Math.max(maxLat, pj.lateral);
      });
      var C = new THREE.Color();
      A.collectMeshes(function (o) { return o.isMesh || o.isInstancedMesh || o.isBatchedMesh; }).forEach(function (o) { ms[o.id] = o; });
      var gm = A.guidMap || {};
      // §SPEED_ZONE_TRUE_COLOUR (user 2026-10-07: "colors on the HUD for high is near red whereas on the hiway they are more greyish brown"):
      //   an instance/batch colour MULTIPLIES the material colour, so a grey road material turned the legend's red into grey-brown. Each
      //   mesh holding a painted slot gets a WHITE clone of its material; every other slot of that mesh is compensated to prev × material
      //   colour (looks unchanged); revert() restores slots then the original material. Rendered tint = legend colour (before lighting).
      var slotsOf = {};
      Object.keys(gm).forEach(function (k) { var us = k.indexOf('_'); if (us <= 0 || !/^\d+$/.test(k.slice(us + 1))) return; var id = k.slice(0, us); (slotsOf[id] || (slotsOf[id] = [])).push(parseInt(k.slice(us + 1), 10)); });
      var whitened = 0;
      Object.keys(slotsOf).forEach(function (id) {
        var m = ms[parseInt(id, 10)]; if (!m || !m.setColorAt || m._szWhite) return;
        if (!slotsOf[id].some(function (sl) { return byGuid[gm[id + '_' + sl]]; })) return;
        var mat = m.material; m._szWhite = true; if (!mat || Array.isArray(mat) || !mat.color) return;
        // the clone also ignores distance haze (fog:false) — far road read grey-brown, near read brick (user, same day)
        var M = mat.color.clone(), plainWhite = M.getHex() === 0xffffff;
        _mats.push({ m: m, mat: mat }); var cl = mat.clone(); cl.color.set(0xffffff); cl.fog = false; m.material = cl; whitened++;
        if (plainWhite) return;                                          // no tint to compensate on the other slots
        slotsOf[id].forEach(function (sl) {
          if (byGuid[gm[id + '_' + sl]]) return;                        // painted below
          var pc = new THREE.Color(1, 1, 1);
          if (m.isInstancedMesh) { if (m.instanceColor) m.getColorAt(sl, pc); }
          else { try { m.getColorAt(sl, pc); } catch (e) {} }
          var rec = { m: m, c: pc.getHex(), col: new THREE.Color() }; if (m.isInstancedMesh) rec.inst = sl; else rec.batch = sl; _touched.push(rec);
          pc.multiply(M); try { m.setColorAt(sl, pc); if (m.instanceColor) m.instanceColor.needsUpdate = true; } catch (e) {}
        });
      });
      Object.keys(gm).forEach(function (k) {
        var b = byGuid[gm[k]]; if (!b) return;
        var us = k.indexOf('_'); if (us <= 0 || !/^\d+$/.test(k.slice(us + 1))) return;     // ROAD is per-slot (instanced / batched)
        var m = ms[parseInt(k.slice(0, us), 10)], slot = parseInt(k.slice(us + 1), 10); if (!m || !m.setColorAt) return;
        var prev = 0xffffff, col = new THREE.Color();
        if (m.isInstancedMesh) { if (m.instanceColor) { m.getColorAt(slot, C); prev = C.getHex(); } _touched.push({ m: m, inst: slot, c: prev, col: col }); m.setColorAt(slot, C.setHex(b.hex)); m.instanceColor.needsUpdate = true; }
        else if (m.isBatchedMesh) { try { m.getColorAt(slot, C); prev = C.getHex(); } catch (e) {} _touched.push({ m: m, batch: slot, c: prev, col: col }); try { m.setColorAt(slot, C.setHex(b.hex)); } catch (e2) {} }
        else return;
        n++;
      });
      discs(res, std);
      _on = true; A._speedZonesTint = { byGuid: byGuid, painted: n };
      if (A.markDirty) A.markDirty();
      console.log('§SPEED_ZONES_PAINT on roadElements=' + rows.length + ' painted=' + n + ' whitenedMeshes=' + whitened + ' maxLateralM=' + maxLat.toFixed(2) + ' noZone=' + noZone + ' verts=0');
      return n;
    }
    // §SPEED_SIGN_DISC (user 2026-10-07: "better if the speed number is painted on the sign"): a speed-limit disc (red ring, white face,
    //   black number = the zone speed that sign opens, derived or user-set) on each speed sign while the zones are on. Size = the sign's own
    //   plan width (element_transforms bbox), centred one radius below the sign's top — where the face is. Presentation only; revert() removes.
    function discTex(speed, ring, borrowed) {
      var cv = document.createElement('canvas'); cv.width = cv.height = 256; var g = cv.getContext('2d');
      g.beginPath(); g.arc(128, 128, 120, 0, 2 * Math.PI); g.fillStyle = '#222'; g.fill();
      g.beginPath(); g.arc(128, 128, 112, 0, 2 * Math.PI); g.fillStyle = borrowed ? '#ffb300' : (ring || '#d32f2f'); g.fill();
      if (borrowed) { g.strokeStyle = '#222'; g.lineWidth = 12; g.setLineDash([22, 16]); g.beginPath(); g.arc(128, 128, 102, 0, 2 * Math.PI); g.stroke(); g.setLineDash([]); }   // dashed amber ring = borrowed board
      g.beginPath(); g.arc(128, 128, 92, 0, 2 * Math.PI); g.fillStyle = '#ffffff'; g.fill();
      g.fillStyle = '#000'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold ' + (String(speed).length > 2 ? 84 : 110) + 'px sans-serif';
      g.fillText(String(speed), 128, borrowed ? 108 : 136);
      if (borrowed) { g.font = 'bold 17px sans-serif'; g.fillStyle = '#b26a00'; g.fillText('no speed sign', 128, 170); g.fillText('\u2014 borrowed', 128, 190); }
      var t = new THREE.CanvasTexture(cv); return t;
    }
    // flat disc ON the sign face (user 2026-10-07: "stick that right onto the sign board"): CircleGeometry plane, one each side, 0.02 m outward of the bbox face,
    // normal = the thinnest horizontal bbox axis, diameter = the wider horizontal axis, centre one radius below the sign top. Free-standing: faces along the route tangent.
    var DISC_OFF = 0.02;
    function mkDisc(map, dia, pos, yaw, ud) {
      var m = new THREE.Mesh(new THREE.CircleGeometry(dia / 2, 48), new THREE.MeshBasicMaterial({ map: map, transparent: true, alphaTest: 0.05, depthTest: true, fog: false }));
      m.position.set(pos.x, pos.y, pos.z); m.rotation.y = yaw; m.renderOrder = 6; Object.assign(m.userData, ud); A.scene.add(m); _discs.push(m); return m;
    }
    function discs(res, std) {
      var plan = res.discPlan || [], made = 0, skipped = [], cnt = { real: 0, other: 0, free: 0 }, meshes = 0;
      plan.forEach(function (r) {
        if (r.speed == null) { skipped.push((r.guid || r.zone) + ':no-speed'); return; }
        var map = discTex(r.speed, colourFor(std, r.speed), r.kind !== 'real'), ud = { speedDisc: r.guid || ('zone-' + r.zone), speed: r.speed, discKind: r.kind, borrowed: r.kind !== 'real', zone: r.zone, label: r.label, zoneStart: r.zoneStart != null ? r.zoneStart : null };
        if (r.kind === 'free') {
          var pt = pointAt(res.route, r.zoneStart); if (!pt) { skipped.push(r.zone + ':no-route-point'); return; }
          var zq = res.zones.filter(function (q) { return q.id === r.zone; })[0], half = zq && zq.lane ? zq.lane.m : 0;     // half the road width = one lane (ATJ 8/86 lane width of the zone class); 0 if unknown
          var dia = 0.9, y = (pt.y != null ? pt.y : 0) + 2.2, pos = { x: pt.x + pt.tz * half, y: y, z: pt.z - pt.tx * half }, yaw = Math.atan2(pt.tx, pt.tz);
          [0, Math.PI].forEach(function (d, i) { var o = DISC_OFF * (i ? -1 : 1); mkDisc(map, dia, { x: pos.x + Math.sin(yaw + d) * o, y: pos.y, z: pos.z + Math.cos(yaw + d) * o }, yaw + d, Object.assign({ side: i, half: half, normal: [Math.sin(yaw + d), 0, Math.cos(yaw + d)] }, ud)); meshes++; });
          made++; cnt.free++; return;
        }
        var t = objQuery('SELECT center_x AS cx, center_y AS cy, center_z AS cz, bbox_x AS bx, bbox_y AS by, bbox_z AS bz FROM element_transforms WHERE guid = ?', [r.guid])[0];
        if (!t || !(t.bz > 0)) { skipped.push(r.guid + ':no-bbox'); return; }
        var w = Math.max(t.bx || 0, t.by || 0), th = Math.min(t.bx || 0, t.by || 0); if (!(w > 0)) { skipped.push(r.guid + ':no-width'); return; }
        var nIfc = (t.bx || 0) <= (t.by || 0) ? [1, 0] : [0, 1];                       // IFC horizontal axis of the thinnest bbox extent = face normal
        var c0 = A.ifc2three(t.cx, t.cy, t.cz + t.bz / 2 - w / 2), c1 = A.ifc2three(t.cx + nIfc[0], t.cy + nIfc[1], t.cz + t.bz / 2 - w / 2);
        var nx = c1.x - c0.x, nz = c1.z - c0.z, nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
        var yaw0 = Math.atan2(nx, nz);
        [1, -1].forEach(function (sd, i) { var off = th / 2 + DISC_OFF;
          mkDisc(map, w, { x: c0.x + sd * nx * off, y: c0.y, z: c0.z + sd * nz * off }, yaw0 + (i ? Math.PI : 0), Object.assign({ side: i, normal: [sd * nx, 0, sd * nz], face: { c: [c0.x, c0.y, c0.z], n: [nx, 0, nz], half: th / 2 } }, ud)); meshes++; });
        made++; cnt[r.kind]++;
      });
      console.log('§SPEED_SIGN_DISC made=' + made + ' meshes=' + meshes + ' onRealSign=' + cnt.real + ' onOtherSign=' + cnt.other + ' freeStanding=' + cnt.free + ' speedSigns=' + plan.filter(function (r) { return r.kind === 'real'; }).length + (skipped.length ? ' skipped=' + skipped.join(',') : '') + ' verts=' + (meshes * 50));
    }
    function focusRow(res, std, row, card) {
      var z = res.zones.filter(function (q) { return q.id === row.zone; })[0];
      var how = z && z.kind !== 'link' ? 'Zone ' + z.id + ' (' + z.s0.toFixed(0) + '–' + z.s1.toFixed(0) + ' m, ' + esc(z.kind) + ', opens at ' + esc(z.opens) + '). Speed ' + (z.speed != null ? z.speed + ' km/h' : 'n/a') + ' — ' + esc(z.srcText) + '. Mode: ' + esc(z.label) + (z.assumed.length ? ' · assumed inputs: ' + esc(z.assumed.join('; ')) : '') : z ? 'Zone ' + z.id + ' (' + z.s0.toFixed(0) + '–' + z.s1.toFixed(0) + ' m, opens at ' + esc(z.opens) + '). ' +
        'Category ' + esc(z.category) + ' (' + (z.catRow.status === 'user' ? 'user' : 'assumed') + ' title mapping: ' + esc(z.catRow.basis) + ') → class ' + esc(z.derivedClass || 'n/a') + ' (' + refTxt(z.selRef) + '). ' +
        'Terrain ' + z.terrain + (z.terrainMeasured ? ' (measured median grade ' + z.terrainPct.toFixed(2) + '%)' : ' (assumed)') + ' → speed ' + (z.speed != null ? z.speed + ' km/h' : 'n/a') + ' (' + refTxt(z.speedRef) + '). ' +
        'Lane ' + (z.lane ? z.lane.m + ' m (' + refTxt(z.lane.ref).replace('ATJ 8/86 ', '') + ')' : 'n/a') + ', max grade ' + (z.grade ? z.grade.pct + '% (' + z.grade.ref.table + ', p.' + z.grade.ref.page + ')' : 'n/a') + '. ' +
        'Mode: ' + esc(z.label) + (z.assumed.length ? ' · assumed inputs: ' + esc(z.assumed.join('; ')) : '') + (z.notes.length ? ' · ' + esc(z.notes.join('; ')) : '') : 'no zone';
      card.style.display = ''; card.setAttribute('data-guid', row.guid);
      card.innerHTML = '<b>' + esc(row.code) + '</b> @ ' + row.s.toFixed(1) + ' m · <b>' + (row.speed != null ? row.speed + ' km/h' : 'no speed') + '</b> · ' + esc(row.label) + '<br>' + how;
      console.log('§SPEED_ZONES_CLICK guid=' + row.guid + ' code=' + row.code + ' s=' + row.s.toFixed(1) + ' zone=' + row.zone + ' speed=' + row.speed + ' label="' + row.label + '"');
      // signs are batched/instanced: the shared focus primitive frames from element_transforms (lazy-loaded with the navigation bundle, as road_standards.js)
      if (typeof A.focusElement === 'function') A.focusElement(row.guid);
      else if (typeof A.loadNavigate === 'function') A.loadNavigate().then(function () { if (A.focusElement) A.focusElement(row.guid); else if (A.zoomToGuid) A.zoomToGuid(row.guid); });
      else if (A.zoomToGuid) A.zoomToGuid(row.guid);
    }
    function discNote(res, q) { var d = (res.discPlan || []).filter(function (x) { return x.zone === q.id && x.kind !== 'real' && x.zoneStart != null; })[0]; return d ? ' · disc: ' + d.label + (d.kind === 'other' ? ' (on sign ' + (d.guid || '').slice(0, 8) + ')' : ' (free-standing)') : ''; }
    // mount(std, container, card): builds the "Speed" section inside the Road standards panel (async: waits for the profile)
    function mount(std, host, card) {
      var sec = document.createElement('div'); sec.className = 'sz-section'; sec.style.cssText = 'margin-top:10px;border-top:1px solid rgba(255,255,255,0.12);padding-top:8px';
      sec.innerHTML = '<div style="color:#4fc3f7;font-weight:bold;margin-bottom:4px">Speed zones &mdash; derived from ATJ 8/86</div><div class="sz-body" style="color:#888;font-size:10px">computing long section&hellip;</div>';
      host.appendChild(sec); var body = sec.querySelector('.sz-body');
      var p = (A.civilProfilePrepare ? A.civilProfilePrepare() : Promise.resolve(null));
      return p.then(function (prof) {
        var g = gather(std); var inp = { title: g.title, route: g.route, signs: g.signs, nodes: g.nodes, profile: prof ? { ds: prof.ds, ground: prof.ground, road: prof.road } : null };
        var res = derive(std, inp, { log: console.log }); res.route = g.route; A._speedZones = res;
        if (res.vacuous || !res.zones.length) { body.innerHTML = '<span style="color:#f90">' + esc(res.msgs.join(' · ') || 'nothing derived') + '</span>'; return res; }
        var h = '<div style="margin-bottom:4px;color:#aaa;font-size:10px">Mode: <b class="sz-mode">' + esc(res.mode) + '</b> (Settings → std_values.json → geometric.speed_setting)' +
          (res.assumed.length ? ' · <span style="color:#fc6">assumed inputs: ' + esc(res.assumed.join('; ')) + '</span>' : '') + '</div>';
        if (res.msgs.length) h += '<div class="sz-msgs" style="color:#f90;font-size:10px;margin-bottom:4px">' + res.msgs.map(esc).join('<br>') + '</div>';
        var miss = (res.discPlan || []).filter(function (x) { return x.kind !== 'real'; }), V = 'MISSING SPEED SIGN';
        res.missingRows = miss.map(function (x) { var z = res.zones.filter(function (q) { return q.id === x.zone; })[0];
          return { guid: x.guid, zone: x.zone, s0: z.s0, s1: z.s1, speed: z.speed, code: x.code, text: 'Zone ' + z.id + ' (' + z.s0.toFixed(0) + '\u2013' + z.s1.toFixed(0) + ' m, ' + z.speed + ' km/h) has no speed-limit sign \u2014 shown on ' + (x.guid ? (x.code || 'a sign board') : 'a free-standing marker') + ' for demo' }; });
        if (miss.length) h += '<details class="sz-missing-grp" data-verdict="' + V + '" open><summary style="cursor:pointer;font-weight:600;font-size:12px;color:#ffaa33;margin:6px 0 2px">' + V + ' (' + miss.length + ')</summary>' + res.missingRows.map(function (m, i) {
          return '<div class="sz-missing" data-i="' + i + '" data-guid="' + esc(m.guid || '') + '" style="margin:1px 0;padding:2px 6px;border-left:3px solid #ffaa33;background:rgba(255,255,255,0.03);cursor:pointer;font-size:10px;color:#aaa">' + esc(m.text) + '</div>'; }).join('') + '</details>';
        h += '<label style="cursor:pointer;font-size:11px"><input type="checkbox" class="sz-toggle"> Speed zones on road</label>';
        h += '<div class="sz-legend" style="margin:6px 0;border:1px solid rgba(255,255,255,0.12);border-radius:6px;padding:4px 6px">' + res.zones.map(function (q) {
          return '<div class="sz-leg" data-zone="' + q.id + '" style="display:flex;gap:6px;align-items:center;margin:2px 0;font-size:10px;color:#ccc"><span class="sz-sw" style="width:12px;height:12px;border-radius:2px;background:' + colourFor(std, q.speed) + ';flex:none"></span>' +
            '<span><b>' + (q.speed != null ? q.speed + ' km/h' : 'no speed') + '</b> · ' + q.s0.toFixed(0) + '–' + q.s1.toFixed(0) + ' m · ' + esc(q.cls || '—') + ' · ' + esc(q.label) +
            (q.assumed.length ? ' · derived · assumed: ' + esc(q.assumed.join('; ')) : '') + discNote(res, q) + '</span></div>'; }).join('') + '</div>';
        h += '<div style="font-size:11px;color:#9ad;margin-bottom:2px">Signs (' + res.signRows.length + ') — speed at each</div><div class="sz-signs" style="max-height:22vh;overflow-y:auto">' + res.signRows.map(function (r, i) {
          return '<div class="sz-row" data-i="' + i + '" data-guid="' + esc(r.guid) + '" style="margin:1px 0;padding:2px 6px;border-left:3px solid ' + (r.speed != null ? colourFor(std, r.speed) : '#666') + ';background:rgba(255,255,255,0.03);cursor:pointer;font-size:10px;color:#aaa">' +
            (r.isSpeedSign ? '<b style="color:#fc6">' : '<b>') + esc(r.code || '(no code)') + '</b> · ' + r.s.toFixed(0) + ' m · ' + (r.speed != null ? '<b>' + r.speed + ' km/h</b>' : 'n/a') + ' · ' + esc(r.label) + '</div>'; }).join('') + '</div>';
        body.innerHTML = h; body.style.color = '#ccc'; body.style.fontSize = '12px';
        var tg = body.querySelector('.sz-toggle');
        tg.addEventListener('change', function () { if (tg.checked) paint(res, std); else revert(); });
        body.addEventListener('click', function (ev) { var el = ev.target.closest && ev.target.closest('.sz-missing'); if (!el) return; var m = res.missingRows[+el.getAttribute('data-i')]; card.style.display = ''; card.innerHTML = '<b style="color:#ffaa33">MISSING SPEED SIGN</b> &middot; ' + esc(m.text);
          console.log('§SPEED_MISSING_CLICK zone=' + m.zone + ' guid=' + (m.guid || 'free') + ' speed=' + m.speed);
          if (m.guid) { if (typeof A.focusElement === 'function') A.focusElement(m.guid); else if (A.zoomToGuid) A.zoomToGuid(m.guid); } });
        console.log('§SPEED_MISSING rows=' + miss.length + ' zones=' + miss.map(function (x) { return x.zone; }).join(','));
        body.querySelector('.sz-signs').addEventListener('click', function (ev) { var el = ev.target.closest && ev.target.closest('.sz-row'); if (!el) return; focusRow(res, std, res.signRows[+el.getAttribute('data-i')], card); });
        console.log('§SPEED_ZONES_PANEL zones=' + res.zones.length + ' signRows=' + res.signRows.length + ' mode=' + res.mode);
        return res;
      });
    }
    A.speedZones = { mount: mount, paint: paint, revert: revert, gather: gather, active: function () { return _on; } };
  }

  var api = { derive: derive, selectClass: selectClass, speedAt: speedAt, maxGrade: maxGrade, laneWidth: laneWidth, projectToRoute: projectToRoute, pointAt: pointAt, routeLength: routeLength, terrainClass: terrainClass, colourFor: colourFor, hexOf: hexOf, setupSpeedZones: setupSpeedZones };
  if (typeof window !== 'undefined') window.setupSpeedZones = setupSpeedZones;
  return api;
});
