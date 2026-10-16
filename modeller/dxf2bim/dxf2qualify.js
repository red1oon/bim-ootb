// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2qualify.js — L2 qualify verdict: does a DXF set follow the DXF2BIM schema of markings, layers, grid and dimensions?
// Spec: bim-ootb prompts/DXF2BIM_MODELLER_LANE.md §L2 + §L2.1. Pure function; it only REPORTS. It never fixes, fills or changes its input.
// Output is machine-readable for the metadata editor (L4): every item has a code, the sheet, the handle(s), a position (raw drawing coords) and one line.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dxf2marks.js'), require('./dxf2bim.js'));
  else root.Dxf2Qualify = factory(root.Dxf2Marks, root.Dxf2Bim);
})(typeof self !== 'undefined' ? self : this, function (MK, B) {
  'use strict';
  var r6 = B.r6, K = MK.UNITS, MARK = MK.LAYER, EPS = 1e-9;
  var HEADER_UNITS = { 1: 'in', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm' };                 // DXF $INSUNITS codes (reader table, SPEC N9)
  var FACES = ['minX', 'maxX', 'minY', 'maxY'];
  var SHAPES = ['walls', 'slabs', 'roof', 'openings'];
  var ADVISORY_GAP = /^GAP:(type_unbound|schedule_conflict|label_|wall_base_from_plan_level$)/;   // wall_base_from_plan_level: lane spec L2.8 (1)
  var SHAPE_TABLE = [                                                                 // §L2.1 stated table for gaps without shape/kind
    [/^GAP:slab_/, 'slabs'], [/^GAP:roof_/, 'roof'],
    [/^GAP:(wall_|no_elevation_height$|elevation_height_conflict$|no_elevation_for_face$|no_height$|duplicate_footprint$|zero_length$|bad_outline$|layers_sum_mismatch$)/, 'walls'],
    [/^GAP:(door_|window_|opening_|fill_|no_lod|lod|no_host|gap_height_conflict$|no_elevation_match$|unknown_block$|no_fill_geometry$|type_)/, 'openings']];
  var NOTE_ONLY = /^(EQ|VERIFY|V\.?I\.?F\.?)$/i, NOTE_SUFFIX = /^(.*?)\s+(TYP\.?|TYPICAL|VERIFY|V\.?I\.?F\.?)$/i;   // L2.3 D5 recognised drafting notes
  var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter(function (c) { return c !== 'I' && c !== 'O'; });

  function hnum(h) { var n = parseInt(h, 16); return isFinite(n) ? n : Infinity; }
  function byHandle(a, b) { return hnum(a.handle) - hnum(b.handle); }
  function get(o, path) { return path.split('.').reduce(function (v, k) { return v === undefined || v === null ? undefined : v[k]; }, o); }
  function letterLabel(i) { return i < LETTERS.length ? LETTERS[i] : LETTERS[Math.floor(i / LETTERS.length) - 1] + LETTERS[i % LETTERS.length]; }   // as L1 R6 writer

  // ---- entity geometry (the reader's region rule: dxf2bim.run §31 V3) ----
  function pointsOf(e) {
    var pts = (e.vertices && e.vertices.length) ? e.vertices.slice() : [];
    ['controlPoints', 'fitPoints'].forEach(function (k) { if (e[k] && e[k].length) pts = pts.concat(e[k]); });
    ['position', 'center', 'startPoint', 'endPoint', 'anchorPoint', 'middleOfText', 'linearOrAngularPoint1', 'linearOrAngularPoint2'].forEach(function (k) { if (e[k] && typeof e[k].x === 'number') pts.push(e[k]); });
    return pts;
  }
  function textPt(e) {                                                               // TEXT aligned (72/73 set) -> group 11 is the true point
    if (e.type === 'TEXT' && (e.halign || e.valign) && e.endPoint) return e.endPoint;
    return e.startPoint || e.position || null;
  }
  function posOf(e) {
    if (!e) return null;
    var p = (e.type === 'TEXT' || e.type === 'MTEXT') ? textPt(e) : (e.anchorPoint || e.center || e.position || e.startPoint || (e.vertices && e.vertices[0]) || (e.points && e.points[0]));
    return p && typeof p.x === 'number' ? { x: r6(p.x), y: r6(p.y) } : null;
  }
  function inRect(q, R) { return q.x >= R[0] && q.x <= R[2] && q.y >= R[1] && q.y <= R[3]; }

  // ---- text: MTEXT codes stripped, then the stated length grammar (§L2.1) ----
  function clean(t) {
    return String(t === undefined || t === null ? '' : t).replace(/\\S([^;\/#^]*)[\/#^]([^;]*);/g, ' $1/$2').replace(/\\P/g, ' ').replace(/\\[AfFHCcTQWp][^;]*;/g, '')
      .replace(/\\[LlOoKk]/g, '').replace(/\\~/g, ' ').replace(/[{}]/g, '').replace(/%%[dD]/g, '°').replace(/\s+/g, ' ').trim();
  }
  function decs(s) { var m = /\.(\d+)$/.exec(s); return m ? m[1].length : 0; }
  // -> null (not a length) | { unitless: true, v, res } (drawing units) | { m, res_m, unit } (explicit unit, metres)
  function parseLen(s) {
    var m = /^[+-]?\d+(?:\.\d+)?$/.exec(s);
    if (m) return { unitless: true, v: Number(s), res: Math.pow(10, -decs(s)) };
    m = /^(\d+(?:\.\d+)?)\s*(mm|cm|m)$/.exec(s);
    if (m) return { m: Number(m[1]) * K[m[2]], res_m: Math.pow(10, -decs(m[1])) * K[m[2]], unit: m[2] };
    m = /^(?:(\d+(?:\.\d+)?)')?\s*-?\s*(?:(\d+(?:\.\d+)?)?(?:[\s-]*(\d+)\/(\d+))?")?$/.exec(s);
    if (m && s !== '' && (m[1] !== undefined || m[2] !== undefined || m[3] !== undefined) && (s.indexOf("'") >= 0 || s.indexOf('"') >= 0)) {
      if (m[3] !== undefined && Number(m[4]) === 0) return null;
      var inch = (m[1] ? Number(m[1]) * 12 : 0) + (m[2] ? Number(m[2]) : 0) + (m[3] !== undefined ? Number(m[3]) / Number(m[4]) : 0);
      var resIn = m[3] !== undefined ? 1 / Number(m[4]) : m[2] !== undefined && decs(m[2]) ? Math.pow(10, -decs(m[2])) : 1;
      return { m: inch * K['in'], res_m: resIn * K['in'], unit: 'ft-in' };
    }
    return null;
  }

  // ---- DIMENSION geometry ----
  function dimKind(e) { return (e.dimensionType || 0) & 7; }                          // 0 rotated, 1 aligned (DXF group 70 low bits)
  function dimMeasured(e) {
    var a = e.linearOrAngularPoint1, b = e.linearOrAngularPoint2; if (!a || !b) return null;
    var k = dimKind(e);
    if (k === 1) return Math.hypot(b.x - a.x, b.y - a.y);
    if (k === 0) { var t = (e.angle || 0) * Math.PI / 180; return Math.abs((b.x - a.x) * Math.cos(t) + (b.y - a.y) * Math.sin(t)); }
    return null;
  }
  function dimAxis(e, tolRaw) {                                                       // 'x' | 'y' | null : which plan axis the dimension measures
    var a = e.linearOrAngularPoint1, b = e.linearOrAngularPoint2, k = dimKind(e); if (!a || !b) return null;
    if (k === 0) { var t = (e.angle || 0) * Math.PI / 180; if (Math.abs(Math.sin(t)) <= 1e-6) return 'x'; if (Math.abs(Math.cos(t)) <= 1e-6) return 'y'; return null; }
    if (k === 1) { if (Math.abs(b.y - a.y) <= tolRaw) return 'x'; if (Math.abs(b.x - a.x) <= tolRaw) return 'y'; }
    return null;
  }
  function dimText(e, blocks) {                                                       // { text, override } | null (automatic)
    if (e.text !== undefined && e.text !== null && String(e.text) !== '') {
      var o = clean(e.text);
      if (o !== '<>') return { text: o, override: true };                             // '<>' = the measurement: the block's rendered text is checked below (L2.3 D5)
    }
    var bl = blocks && e.block ? blocks[e.block] : null;
    var ts = bl && bl.entities ? bl.entities.filter(function (x) { return x.type === 'TEXT' || x.type === 'MTEXT'; }) : [];
    if (ts.length !== 1) return null;
    return { text: clean(ts[0].text), override: false };
  }

  // ---- grid lines + bubble labels (§L2.1 G1/G2) ----
  function gridLines(ents, gridLayers, tolRaw) {
    var lines = [], skew = [], circles = [], texts = [];
    ents.forEach(function (e) {
      if (gridLayers.indexOf(e.layer) >= 0 && e.type === 'CIRCLE' && e.center) circles.push(e);
      if ((e.type === 'TEXT' || e.type === 'MTEXT') && e.layer !== MARK) { var t = clean(e.text), p = textPt(e); if (t && !/\s/.test(t) && p) texts.push({ t: t, p: p, h: e.handle }); }
      if (gridLayers.indexOf(e.layer) < 0) return;
      var v = (e.type === 'LINE' || ((e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && !e.shape)) && e.vertices && e.vertices.length === 2 ? e.vertices : null;
      if (!v) return;
      var dx = Math.abs(v[1].x - v[0].x), dy = Math.abs(v[1].y - v[0].y);
      if (dx <= tolRaw && dy > tolRaw) lines.push({ axis: 'x', pos: (v[0].x + v[1].x) / 2, lo: Math.min(v[0].y, v[1].y), hi: Math.max(v[0].y, v[1].y), handles: [e.handle] });
      else if (dy <= tolRaw && dx > tolRaw) lines.push({ axis: 'y', pos: (v[0].y + v[1].y) / 2, lo: Math.min(v[0].x, v[1].x), hi: Math.max(v[0].x, v[1].x), handles: [e.handle] });
      else skew.push(e);
    });
    lines.forEach(function (L) {
      var labs = {};
      circles.forEach(function (c) {
        var perp = L.axis === 'x' ? c.center.x - L.pos : c.center.y - L.pos, along = L.axis === 'x' ? c.center.y : c.center.x, r = c.radius || 0;
        if (Math.abs(perp) > tolRaw || along < L.lo - r - tolRaw || along > L.hi + r + tolRaw) return;
        texts.forEach(function (t) { if (Math.hypot(t.p.x - c.center.x, t.p.y - c.center.y) <= r) { labs[t.t] = labs[t.t] || []; labs[t.t].push(t.h); } });
        L.handles.push(c.handle);
      });
      L.labels = Object.keys(labs).sort();
      L.label = L.labels.length === 1 ? L.labels[0] : null;
      Object.keys(labs).forEach(function (k) { L.handles = L.handles.concat(labs[k]); });
    });
    // one drawn grid line may be several entities: merge same axis + position + label
    var merged = [];
    lines.sort(function (a, b) { return a.axis < b.axis ? -1 : a.axis > b.axis ? 1 : a.pos - b.pos || hnum(a.handles[0]) - hnum(b.handles[0]); }).forEach(function (L) {
      var m = merged.find(function (q) { return q.axis === L.axis && Math.abs(q.pos - L.pos) <= tolRaw && q.label === L.label && q.labels.join() === L.labels.join(); });
      if (m) { m.handles = m.handles.concat(L.handles); m.lo = Math.min(m.lo, L.lo); m.hi = Math.max(m.hi, L.hi); } else merged.push(L);
    });
    merged.forEach(function (L) { L.handles = L.handles.filter(function (h, i, a) { return a.indexOf(h) === i; }).sort(function (a, b) { return hnum(a) - hnum(b); }); });
    return { lines: merged, skew: skew };
  }

  // ---- wall rects from plan ops (metres) ----
  function wallRects(ops) {
    return (ops || []).filter(function (o) { return o.op_type === 'DXF_WALL' && o.params && o.params.rect; }).map(function (o) {
      var r = o.params.rect, w = r[2] - r[0], h = r[3] - r[1];
      return { rect: r, handle: o.params.handle, layer: o.params.layer, thkAxis: w <= h ? 'x' : 'y', along: w <= h ? 'y' : 'x', len: Math.max(w, h), axisPos: w <= h ? (r[0] + r[2]) / 2 : (r[1] + r[3]) / 2, infill: !!o.params.infill };
    }).filter(function (w) { return !w.infill; });
  }
  function envelopeOf(ws) {
    if (!ws.length) return null;
    return [Math.min.apply(null, ws.map(function (w) { return w.rect[0]; })), Math.min.apply(null, ws.map(function (w) { return w.rect[1]; })),
      Math.max.apply(null, ws.map(function (w) { return w.rect[2]; })), Math.max.apply(null, ws.map(function (w) { return w.rect[3]; }))];
  }

  // ---- sheets from files (one per file, or one per @REGION) ----
  function sheets(files) {
    var out = [], fileErrors = [];
    (files || []).forEach(function (f) {
      var ents = ((f.dxf && f.dxf.entities) || []).slice().sort(byHandle);
      var views = MK.describeAll(MK.readMarks(ents)), multi = views.some(function (v) { return v.region; }), k = 0;
      views.forEach(function (v) {
        if (multi && !v.region) { v.errors.forEach(function (e) { fileErrors.push({ file: f.name, err: e }); }); return; }
        k++;
        var id = multi ? f.name + '#' + k : f.name, scoped = ents.filter(function (e) { return e.layer !== MARK; }), noAnchor = 0;
        if (v.region) scoped = scoped.filter(function (e) { var p = pointsOf(e); if (!p.length) { noAnchor++; return false; } return p.every(function (q) { return inRect(q, v.region); }); });
        var ex = v.desc.excludes || [];
        if (ex.length) scoped = scoped.filter(function (e) { var p = pointsOf(e); return !(p.length && ex.some(function (R) { return p.every(function (q) { return inRect(q, R); }); })); });
        var maps = (f.layer_maps_by_view && v.desc.view && f.layer_maps_by_view[v.desc.view]) || f.layer_maps || null;
        out.push({ id: id, file: f.name, region: v.region, desc: v.desc, errors: v.errors, ents: scoped, all: ents, header: (f.dxf && f.dxf.header) || {}, blocks: (f.dxf && f.dxf.blocks) || {}, maps: maps, no_anchor: noAnchor });
      });
    });
    return { sheets: out, fileErrors: fileErrors };
  }

  function qualify(input, settings) {
    input = input || {}; settings = settings || {};
    var blocking = [], advisory = [], checks = {};
    function count(k, n) { checks[k] = (checks[k] || 0) + (n === undefined ? 1 : n); }
    function item(list, code, shape, sheet, handles, pos, message, extra) {
      var it = { code: code, shape: shape, sheet: sheet === undefined ? null : sheet, handles: (handles || []).filter(function (h) { return h !== undefined && h !== null; }).map(String), pos: pos || null, message: message };
      if (extra) Object.keys(extra).forEach(function (k) { if (it[k] === undefined) it[k] = extra[k]; });
      list.push(it);
    }
    function block(code, sheet, handles, pos, message, extra, shape) { item(blocking, code, shape || 'set', sheet, handles, pos, message, extra); }

    // settings (no defaults, §L2.1)
    var NEED = ['tol.grid', 'tol.dim', 'tol.level', 'tol.align', 'grid.min_wall_len', 'layers.grid', 'layers.dims'];   // layers.bearing removed (L2.3 D4)
    var missing = NEED.filter(function (k) { var v = get(settings, k); return k.indexOf('layers.') === 0 ? !Array.isArray(v) : !(typeof v === 'number' && isFinite(v) && v >= 0); });
    missing.forEach(function (k) { block('QF:setting_missing', null, [], null, 'setting ' + k + ' is not stated (no default is invented)', { need: k }); });
    var has = function (k) { return missing.indexOf(k) < 0; };
    var tolG = settings.tol && settings.tol.grid, tolD = settings.tol && settings.tol.dim, tolL = settings.tol && settings.tol.level, tolA = settings.tol && settings.tol.align;

    var S = sheets(input.files), SH = S.sheets, byId = {};
    SH.forEach(function (s) { byId[s.id] = s; s.k = s.desc.units ? K[s.desc.units] : null; });
    S.fileErrors.forEach(function (fe) { block('QF:mark_invalid', fe.file, fe.err.handle ? [fe.err.handle] : [], null, fe.file + ': ' + fe.err.code + ' ' + fe.err.message, { mark_code: fe.err.code }); });

    // ---------- markings ----------
    SH.forEach(function (s) {
      var d = s.desc, entOf = function (h) { return s.all.find(function (e) { return e.handle === h; }); };
      if (!d.units) block('QF:units_unstated', s.id, [], null, s.id + ': no @UNITS marking (units must be user-stated; $INSUNITS=' + (s.header.$INSUNITS === undefined ? 'absent' : s.header.$INSUNITS) + ' is not trusted)');
      s.errors.forEach(function (e) {
        if (e.code === 'MARK:missing') {
          var keys = (e.keys || []).filter(function (x) { return x !== 'UNITS'; });
          if (keys.indexOf('VIEW') >= 0) { block('QF:sheet_no_role', s.id, [], null, s.id + ': no @VIEW (PLAN|ELEV) marking: the sheet has no role', { keys: keys }); return; }
          if (keys.indexOf('LEVEL') >= 0) block('QF:plan_no_level', s.id, [], null, s.id + ': PLAN without @LEVEL (storey level in metres)');
          keys = keys.filter(function (x) { return x !== 'LEVEL'; });
          if (keys.length) block('QF:mark_missing', s.id, [], null, s.id + ': missing markings ' + keys.map(function (x) { return '@' + x; }).join(' '), { keys: keys });
          return;
        }
        block('QF:mark_invalid', s.id, e.handle ? [e.handle] : [], posOf(entOf(e.handle)), s.id + ': ' + e.code + ' ' + e.message, { mark_code: e.code });
      });
    });
    var roled = SH.filter(function (s) { return s.desc.view; });
    var setNames = {}; roled.forEach(function (s) { if (s.desc.set !== undefined) (setNames[s.desc.set] = setNames[s.desc.set] || []).push(s.id); });
    if (Object.keys(setNames).length > 1) block('QF:set_mismatch', null, [], null, 'sheets carry different @SET: ' + Object.keys(setNames).sort().map(function (k) { return k + '=' + setNames[k].join(','); }).join(' / '));
    var plans = roled.filter(function (s) { return s.desc.view === 'PLAN'; }), elevs = roled.filter(function (s) { return s.desc.view === 'ELEV'; }), roofs = roled.filter(function (s) { return s.desc.view === 'ROOF'; }), sections = roled.filter(function (s) { return s.desc.view === 'SECTION'; });   // SECTION: lane spec L1.4 / L2.6 E
    if (!plans.length) block('QF:set_no_plan', null, [], null, 'no sheet is marked @VIEW=PLAN: the set has no storey');
    if (!roofs.length) block('QF:set_no_roof', null, [], null, 'no sheet is marked @VIEW=ROOF: the roof outline has no roof plan (L2.3 D1)', null, 'roof');
    var lv = {}; plans.forEach(function (s) { if (typeof s.desc.level === 'number') (lv[s.desc.level] = lv[s.desc.level] || []).push(s.id); });
    Object.keys(lv).forEach(function (l) { if (lv[l].length > 1) block('QF:plan_level_duplicate', lv[l][0], [], null, 'two plans state @LEVEL=' + l + ': ' + lv[l].join(', '), { level: Number(l) }); });
    var leveled = plans.filter(function (s) { return typeof s.desc.level === 'number'; }).sort(function (a, b) { return a.desc.level - b.desc.level || (a.id < b.id ? -1 : 1); });
    var ref = leveled[0] || null;                                                    // reference plan = lowest @LEVEL (grid storey, L1.1 R2)
    var planLevels = leveled.map(function (s) { return s.desc.level; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
    var refWalls = null, refEnv = null;
    if (ref && input.plan_ops && input.plan_ops[ref.id]) { refWalls = wallRects(input.plan_ops[ref.id]); refEnv = envelopeOf(refWalls); }
    FACES.forEach(function (f) {
      if (elevs.some(function (s) { return s.desc.face === f; })) return;
      var pos = null;
      if (refEnv && ref.k) { var E = refEnv, c = f === 'minX' ? [E[0], (E[1] + E[3]) / 2] : f === 'maxX' ? [E[2], (E[1] + E[3]) / 2] : f === 'minY' ? [(E[0] + E[2]) / 2, E[1]] : [(E[0] + E[2]) / 2, E[3]]; pos = { x: r6(c[0] / ref.k), y: r6(c[1] / ref.k) }; }
      block('QF:face_no_elev', ref ? ref.id : null, [], pos, 'building face ' + f + ' has no elevation sheet (@VIEW=ELEV @FACE=' + f + ')', { face: f });
    });

    // ---------- layers (every sheet) ----------
    SH.forEach(function (s) {
      if (!s.maps || !s.maps.length) { block('QF:check_skipped', s.id, [], null, s.id + ': no layer map given, layers not checked', { check: 'layers', need: 'layer_maps' }); return; }
      var un = {};
      s.ents.forEach(function (e) { if (!s.maps.some(function (m) { return B.matchRule(e.layer, m.rules); })) (un[e.layer] = un[e.layer] || []).push(e); });
      Object.keys(un).sort().forEach(function (L) { block('QF:layer_unmapped', s.id, un[L].map(function (e) { return e.handle; }), posOf(un[L][0]), s.id + ': layer "' + L + '" (' + un[L].length + ' entities) is neither mapped nor excluded', { layer: L, count: un[L].length }); });
      count('layers_checked', Object.keys(s.ents.reduce(function (a, e) { a[e.layer] = 1; return a; }, {})).length);
    });

    // ---------- unit evidence + dimension texts (every sheet with a factor) ----------
    SH.forEach(function (s) {
      var uname = s.desc.units || HEADER_UNITS[s.header.$INSUNITS], k = uname ? K[uname] : null;
      if (!k) return;
      var unitEv = [], implied = {};
      s.ents.filter(function (e) { return e.type === 'DIMENSION'; }).forEach(function (e) {
        var meas = dimMeasured(e); if (meas === null) { count('dims_unchecked_type'); return; }
        count('dims_checked');
        var dt = dimText(e, s.blocks); if (!dt) return;
        var note = null, L;
        if (dt.override && NOTE_ONLY.test(dt.text)) {                                   // L2.3 D5: a recognised drafting note, shown with the measured value
          item(advisory, 'QF:dim_note', 'set', s.id, [e.handle], posOf(e), s.id + ': dimension ' + e.handle + ' note "' + dt.text + '" (measures ' + r6(meas * k) + ' m)', { note: dt.text, measured_m: r6(meas * k) }); return;
        }
        var ns = dt.override ? NOTE_SUFFIX.exec(dt.text) : null;
        if (ns && parseLen(ns[1])) { L = parseLen(ns[1]); note = ns[2]; } else L = parseLen(dt.text);
        if (!L) { if (dt.override) block('QF:dim_text_unreadable', s.id, [e.handle], posOf(e), s.id + ': dimension text override "' + dt.text + '" is not a length (G3 forbids overrides; it cannot be verified)', { text: dt.text }); else count('dims_block_text_unparsed'); return; }
        if (!has('tol.dim')) return;
        var mm = meas, tm = L.unitless ? L.v * k : L.m, res = L.unitless ? L.res * k : L.res_m, tol = Math.max(tolD, res / 2) + EPS;
        if (Math.abs(tm - mm * k) <= tol) {
          if (note) { item(advisory, 'QF:dim_note', 'set', s.id, [e.handle], posOf(e), s.id + ': dimension ' + e.handle + ' "' + dt.text + '" (' + note + '), length equals the measurement ' + r6(mm * k) + ' m', { note: dt.text, measured_m: r6(mm * k) }); return; }
          if (dt.override) item(advisory, 'QF:dim_override_equal', 'set', s.id, [e.handle], posOf(e), s.id + ': override "' + dt.text + '" equals the measurement (G3 forbids overrides)', { text: dt.text }); return;
        }
        if (!L.unitless) {
          var other = Object.keys(K).filter(function (u) { return u !== uname && Math.abs(tm - mm * K[u]) <= tol; });
          if (other.length === 1) { unitEv.push(e); implied[other[0]] = (implied[other[0]] || 0) + 1; return; }
        }
        block('QF:dim_text_mismatch', s.id, [e.handle], posOf(e), s.id + ': dimension ' + e.handle + ' text "' + dt.text + '" = ' + r6(tm) + ' m but it measures ' + r6(mm * k) + ' m', { text: dt.text, measured_m: r6(mm * k), text_m: r6(tm), override: dt.override });
      });
      if (unitEv.length) block('QF:units_conflict', s.id, unitEv.map(function (e) { return e.handle; }), posOf(unitEv[0]), s.id + ': ' + unitEv.length + ' dimension texts read in ' + Object.keys(implied).sort().join('/') + ', not in ' + uname + (s.desc.units ? ' (@UNITS)' : ' ($INSUNITS)'), { units: uname, implied: Object.keys(implied).sort() });
      if (has('layers.dims') && has('tol.dim')) s.ents.forEach(function (e) {
        if ((e.type !== 'TEXT' && e.type !== 'MTEXT') || settings.layers.dims.indexOf(e.layer) < 0) return;
        var t = clean(e.text); if (parseLen(t)) block('QF:dim_not_entity', s.id, [e.handle], posOf(e), s.id + ': "' + t + '" on ' + e.layer + ' is a text, not a DIMENSION entity (exploded or typed dimension, G3)', { text: t });
      });
    });

    // ---------- grid + plan dimension strings (PLAN with role + units) ----------
    var gridOf = {}, allWs = [];                                                      // L2.3 D4: stray grid tested against every plan's walls (L1.1 R2: one building grid)
    plans.forEach(function (s) { if (input.plan_ops && input.plan_ops[s.id]) allWs = allWs.concat(wallRects(input.plan_ops[s.id])); });
    plans.forEach(function (s) {
      if (!s.k || !has('tol.grid') || !has('layers.grid')) return;
      var k = s.k, tolRaw = tolG / k, G = gridOf[s.id] = gridLines(s.ents, settings.layers.grid, tolRaw);
      count('grid_lines', G.lines.length);
      G.skew.forEach(function (e) { item(advisory, 'QF:grid_line_skew', 'set', s.id, [e.handle], posOf(e), s.id + ': grid-layer line ' + e.handle + ' is not axis-parallel; not read as a grid line'); });
      var gpos = function (L) { return L.axis === 'x' ? { x: r6(L.pos), y: r6(L.hi) } : { x: r6(L.hi), y: r6(L.pos) }; };
      G.lines.forEach(function (L) {
        if (!L.labels.length) block('QF:grid_unlabelled', s.id, L.handles, gpos(L), s.id + ': grid line at ' + L.axis + '=' + r6(L.pos) + ' has no bubble label');
        else if (L.labels.length > 1) block('QF:grid_label_conflict', s.id, L.handles, gpos(L), s.id + ': grid line at ' + L.axis + '=' + r6(L.pos) + ' has bubbles ' + L.labels.join(' / '), { labels: L.labels });
      });
      var seen = {}; G.lines.forEach(function (L) { if (L.label) (seen[L.label] = seen[L.label] || []).push(L); });
      Object.keys(seen).sort().forEach(function (lab) { if (seen[lab].length > 1) block('QF:grid_label_dup', s.id, [].concat.apply([], seen[lab].map(function (L) { return L.handles; })), gpos(seen[lab][1]), s.id + ': grid label ' + lab + ' is on ' + seen[lab].length + ' lines', { label: lab }); });
      ['x', 'y'].forEach(function (ax) {
        var ls = G.lines.filter(function (L) { return L.axis === ax && L.label; }).sort(function (a, b) { return a.pos - b.pos; });
        var bad = ls.filter(function (L) { return ax === 'x' ? !/^\d+$/.test(L.label) : !/^[A-Z]+$/.test(L.label); });
        bad.forEach(function (L) { block('QF:grid_label_series', s.id, L.handles, gpos(L), s.id + ': constant-' + ax.toUpperCase() + ' grid line labelled "' + L.label + '": G2 puts ' + (ax === 'x' ? 'numbers' : 'letters (no I/O)') + ' on constant-' + ax.toUpperCase() + ' lines', { label: L.label }); });
        if (bad.length || !ls.length) return;
        var want = ls.map(function (L, i) { return ax === 'x' ? String(i + 1) : letterLabel(i); }), got = ls.map(function (L) { return L.label; });
        if (want.join() !== got.join()) block('QF:grid_label_order', s.id, ls[0].handles, gpos(ls[0]), s.id + ': constant-' + ax.toUpperCase() + ' labels in position order are ' + got.join(',') + '; G2 expects ' + want.join(','), { got: got, want: want });
      });
      // wall axes: needs the plan ops
      var ops = input.plan_ops && input.plan_ops[s.id];
      if (!ops) { block('QF:check_skipped', s.id, [], null, s.id + ': no plan ops given, grid-to-wall and dimension-string checks not run', { check: 'grid_axis,dim_strings', need: 'plan_ops' }); return; }
      var ws = wallRects(ops), env = envelopeOf(ws);
      if (!env) { block('QF:check_skipped', s.id, [], null, s.id + ': the plan has no wall pieces, grid and dimension strings not checked', { check: 'grid_axis,dim_strings', need: 'DXF_WALL' }); return; }
      G.lines.forEach(function (L) {
        var P = L.pos * k, hit = allWs.some(function (w) { if (w.thkAxis !== L.axis) return false; var r = w.rect, f0 = L.axis === 'x' ? r[0] : r[1], f1 = L.axis === 'x' ? r[2] : r[3]; return Math.abs(w.axisPos - P) <= tolG + EPS || Math.abs(f0 - P) <= tolG + EPS || Math.abs(f1 - P) <= tolG + EPS; });
        if (!hit) block('QF:grid_off_axis', s.id, L.handles, gpos(L), s.id + ': grid line ' + (L.label || '?') + ' at ' + L.axis + '=' + r6(P) + ' m is on no wall axis or face (tol ' + tolG + ' m)', { label: L.label, pos_m: r6(P) });
      });
      if (has('grid.min_wall_len')) ['x', 'y'].forEach(function (ax) {                // L2.3 D4: exterior envelope axes only (the reader cannot know load-bearing)
        var bw = ws.filter(function (w) { var r = w.rect, ext = ax === 'x' ? Math.abs(r[0] - env[0]) <= tolG + EPS || Math.abs(r[2] - env[2]) <= tolG + EPS : Math.abs(r[1] - env[1]) <= tolG + EPS || Math.abs(r[3] - env[3]) <= tolG + EPS; return w.thkAxis === ax && ext && w.len >= settings.grid.min_wall_len - EPS; }).sort(function (a, b) { return a.axisPos - b.axisPos || hnum(a.handle) - hnum(b.handle); });
        var cl = []; bw.forEach(function (w) { var c = cl[cl.length - 1]; if (c && w.axisPos - c[c.length - 1].axisPos <= tolG + EPS) c.push(w); else cl.push([w]); });
        cl.forEach(function (c) {
          var P = c.reduce(function (n, w) { return n + w.axisPos; }, 0) / c.length;
          if (G.lines.some(function (L) { return L.axis === ax && Math.abs(L.pos * k - P) <= tolG + EPS; })) return;
          var w0 = c[0], mid = ax === 'x' ? { x: r6(P / k), y: r6((w0.rect[1] + w0.rect[3]) / 2 / k) } : { x: r6((w0.rect[0] + w0.rect[2]) / 2 / k), y: r6(P / k) };
          block('QF:grid_missing', s.id, c.map(function (w) { return w.handle; }), mid, s.id + ': exterior wall axis ' + ax + '=' + r6(P) + ' m (' + c.length + ' piece' + (c.length > 1 ? 's' : '') + ' on ' + c.map(function (w) { return w.layer; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(',') + ') has no grid line (G1)', { axis: ax, pos_m: r6(P), walls: c.map(function (w) { return w.handle; }) });
        });
      });
      // dimension strings per side (G3)
      if (!has('tol.dim')) return;
      var dims = s.ents.filter(function (e) { return e.type === 'DIMENSION' && e.anchorPoint; }).map(function (e) {
        var ax = dimAxis(e, tolRaw); if (!ax) return null;
        var a = e.linearOrAngularPoint1, b = e.linearOrAngularPoint2, c = ax === 'x' ? [a.x * k, b.x * k] : [a.y * k, b.y * k], line = (ax === 'x' ? e.anchorPoint.y : e.anchorPoint.x) * k;
        var side = ax === 'x' ? (line > env[3] + tolG ? 'maxY' : line < env[1] - tolG ? 'minY' : null) : (line > env[2] + tolG ? 'maxX' : line < env[0] - tolG ? 'minX' : null);
        return side ? { side: side, lo: Math.min(c[0], c[1]), hi: Math.max(c[0], c[1]), pts: c, handle: e.handle } : null;
      }).filter(Boolean);
      FACES.forEach(function (side) {
        var ax = side === 'minY' || side === 'maxY' ? 'x' : 'y', lo = ax === 'x' ? env[0] : env[1], hi = ax === 'x' ? env[2] : env[3], fc = side === 'minX' ? env[0] : side === 'maxX' ? env[2] : side === 'minY' ? env[1] : env[3];
        var on = dims.filter(function (d) { return d.side === side; });
        var spanOk = function (a, b) { return on.some(function (d) { return Math.abs(d.lo - a) <= tolD + EPS && Math.abs(d.hi - b) <= tolD + EPS; }); };
        var at = function (v) { return ax === 'x' ? { x: r6(v / k), y: r6(fc / k) } : { x: r6(fc / k), y: r6(v / k) }; };
        var need = [{ kind: 'overall', a: lo, b: hi }];
        var gl = G.lines.filter(function (L) { return L.axis === ax; }).map(function (L) { return L.pos * k; }).sort(function (p, q) { return p - q; });
        for (var i = 1; i < gl.length; i++) need.push({ kind: 'grid', a: gl[i - 1], b: gl[i] });
        need.forEach(function (n) { if (!spanOk(n.a, n.b)) block('QF:dim_missing', s.id, [], at((n.a + n.b) / 2), s.id + ': side ' + side + ' has no ' + n.kind + ' dimension ' + r6(n.a) + '..' + r6(n.b) + ' m (' + r6(n.b - n.a) + ' m, G3)', { side: side, kind: n.kind, span: [r6(n.a), r6(n.b)] }); });
        var runs = ws.filter(function (w) { var r = w.rect, f = side === 'minX' ? r[0] : side === 'maxX' ? r[2] : side === 'minY' ? r[1] : r[3]; return Math.abs(f - fc) <= tolG + EPS; })
          .map(function (w) { return ax === 'x' ? [w.rect[0], w.rect[2]] : [w.rect[1], w.rect[3]]; }).sort(function (p, q) { return p[0] - q[0] || p[1] - q[1]; });
        var mr = []; runs.forEach(function (r) { var c = mr[mr.length - 1]; if (c && r[0] - c[1] <= tolD + EPS) c[1] = Math.max(c[1], r[1]); else mr.push(r.slice()); });
        var pts = [lo, hi]; mr.forEach(function (r) { pts.push(r[0], r[1]); });
        pts.sort(function (p, q) { return p - q; });
        pts = pts.filter(function (p, i) { return i === 0 || p - pts[i - 1] > tolD + EPS; });
        pts.forEach(function (p) { if (!on.some(function (d) { return d.pts.some(function (q) { return Math.abs(q - p) <= tolD + EPS; }); })) block('QF:dim_point_missing', s.id, [], at(p), s.id + ': side ' + side + ' has no dimension point at ' + r6(p) + ' m (wall end / opening, G3-3)', { side: side, at_m: r6(p) }); });
      });
    });

    // ---------- elevations (G4) ----------
    var stated = planLevels.concat(roofs.filter(function (r) { return typeof r.desc.level === 'number'; }).map(function (r) { return r.desc.level; })), bands = [];
    // L2.6 E: a SECTION sheet (stated source of slab top/underside) aligns with the reference plan like an elevation; no face, no G4 datum checks
    sections.forEach(function (s) {
      if (!s.k || !ref || !ref.k || !s.desc.haxis || !has('tol.align')) return;
      if (s.errors.some(function (e) { return e.code === 'MARK:missing'; })) return;
      var al = MK.align(ref.desc, s.desc, tolA);
      if (!al.map || !al.map.zOf) al.errors.forEach(function (e) { block('QF:elev_align_fail', s.id, [], null, s.id + ': ' + e.code + ' ' + e.message + ' (section against ' + ref.id + ')', { mark_code: e.code }); });
    });
    elevs.concat(sections).forEach(function (s) {
      if (typeof s.desc.roof !== 'number' || !has('tol.level')) return;                  // L2.3 D1: one roof top across the set
      roofs.forEach(function (r) { if (typeof r.desc.roof === 'number' && Math.abs(r.desc.roof - s.desc.roof) > tolL + EPS) block('QF:roof_level_mismatch', s.id, [], null, s.id + ': @ROOF=' + s.desc.roof + ' but roof sheet ' + r.id + ' states @ROOF=' + r.desc.roof, { roof: s.desc.roof, roof_sheet: r.id, roof_sheet_value: r.desc.roof }, 'roof'); });
    });
    elevs.forEach(function (s) {
      if (!s.k || !ref || !ref.k || !s.desc.haxis || !has('tol.align')) return;
      if (s.errors.some(function (e) { return e.code === 'MARK:missing'; })) return;          // its missing markings are already listed
      var al = MK.align(ref.desc, s.desc, tolA);
      if (!al.map || !al.map.zOf) { al.errors.forEach(function (e) { block('QF:elev_align_fail', s.id, [], null, s.id + ': ' + e.code + ' ' + e.message + ' (against ' + ref.id + ')', { mark_code: e.code }); }); return; }
      var map = al.map, ke = s.k, zs = s.desc.zs.slice().sort(function (a, b) { return a.z - b.z; });
      var yOf = function (z) { return zs[0].y + (z - zs[0].z) / ke; };
      // L2.3 D2: level bands = elevwall rectangles starting at one bottom z that together span the face width; never inferred from datum lines
      if (has('tol.level') && has('tol.grid') && s.maps) {
        var rects = [];
        s.ents.forEach(function (e) {
          if (!(e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') || !e.shape || !e.vertices || e.vertices.length !== 4) return;
          if (!s.maps.some(function (m) { var r = B.matchRule(e.layer, m.rules); return r && r.type === 'elevwall'; })) return;
          var xs = e.vertices.map(function (v) { return v.x; }), ys = e.vertices.map(function (v) { return v.y; });
          var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys), on = function (v, a, b) { return Math.abs(v - a) <= 1e-6 || Math.abs(v - b) <= 1e-6; };
          if (!e.vertices.every(function (v) { return on(v.x, x0, x1) && on(v.y, y0, y1); })) return;
          rects.push({ e: e, h0: x0, h1: x1, z0: map.zOf(y0) });
        });
        if (rects.length) {
          var W0 = Math.min.apply(null, rects.map(function (r) { return r.h0; })), W1 = Math.max.apply(null, rects.map(function (r) { return r.h1; })), jt = tolG / ke + EPS;
          var zg = []; rects.slice().sort(function (a, b) { return a.z0 - b.z0 || hnum(a.e.handle) - hnum(b.e.handle); }).forEach(function (r) { var g = zg[zg.length - 1]; if (g && Math.abs(r.z0 - g.z) <= tolL + EPS) g.rs.push(r); else zg.push({ z: r.z0, rs: [r] }); });
          zg.forEach(function (g) {
            var iv = g.rs.map(function (r) { return [r.h0, r.h1]; }).sort(function (a, b) { return a[0] - b[0]; }), cur = null, ok = true;
            iv.forEach(function (x) { if (!cur) cur = x.slice(); else if (x[0] <= cur[1] + jt) cur[1] = Math.max(cur[1], x[1]); else ok = false; });
            if (!ok || !cur || cur[0] > W0 + jt || cur[1] < W1 - jt) return;               // not a band across the face
            if (stated.some(function (l) { return Math.abs(l - g.z) <= tolL + EPS; })) return;
            var b = bands.find(function (q) { return Math.abs(q.z - g.z) <= tolL + EPS; }); if (!b) bands.push(b = { z: g.z, by: {} });
            b.by[s.id] = (b.by[s.id] || []).concat(g.rs.map(function (r) { return r.e; }));
          });
        }
      }
      // grid bubbles projected onto the face
      var RG = gridOf[ref.id];
      if (RG && has('tol.grid')) {
        var EG = gridLines(s.ents, settings.layers.grid, tolG / ke);
        var ext = refEnv ? (map.axis === 'X' ? [refEnv[0], refEnv[2]] : [refEnv[1], refEnv[3]]) : null;
        RG.lines.filter(function (L) { return L.label && L.axis === map.axis.toLowerCase(); }).forEach(function (L) {
          var P = L.pos * ref.k; if (ext && (P < ext[0] - tolG || P > ext[1] + tolG)) return;
          var h = (P - map.b) / (map.s * ke);
          var at = EG.lines.filter(function (q) { return q.axis === 'x' && Math.abs(q.pos - h) <= tolG / ke + EPS; });
          if (at.some(function (q) { return q.label === L.label; })) return;
          block('QF:elev_grid_missing', s.id, at.length ? at[0].handles : [], { x: r6(h), y: r6(yOf(planLevels[0] !== undefined ? planLevels[0] : zs[0].z)) }, s.id + ': no grid line labelled ' + L.label + ' at h=' + r6(h) + ' (plan ' + map.axis + '=' + r6(P) + ' m)' + (at.length ? '; the line there is labelled ' + (at[0].labels.join('/') || 'nothing') : ''), { label: L.label });
        });
      }
      // level datums
      if (s.desc.roof === undefined) block('QF:elev_roof_unstated', s.id, [], null, s.id + ': no @ROOF marking (G4 roof-top datum)');
      if (!has('tol.level')) return;
      if (!s.maps || !s.maps.length) { block('QF:check_skipped', s.id, [], null, s.id + ': no layer map given, level datums and height dimensions not checked', { check: 'elev_levels', need: 'layer_maps (levelline)' }); return; }
      var lines = []; (s.maps || []).forEach(function (m) { s.ents.forEach(function (e) { var r = B.matchRule(e.layer, m.rules); if (!r || r.type !== 'levelline' || e.type !== 'LINE') return; var a = e.vertices[0], b = e.vertices[1]; if (Math.abs(a.y - b.y) > 1e-9) return; if (!lines.some(function (q) { return q.handle === e.handle; })) lines.push({ z: map.zOf(a.y), handle: e.handle, x: a.x, y: a.y }); }); });
      var datums = stated.filter(function (z, i, a) { return a.indexOf(z) === i; }).map(function (z) { return { z: z, what: planLevels.indexOf(z) >= 0 ? 'plan level' : 'roof-sheet level' }; });
      if (typeof s.desc.roof === 'number' && !datums.some(function (d) { return Math.abs(d.z - s.desc.roof) <= EPS; })) datums.push({ z: s.desc.roof, what: '@ROOF' });
      datums.sort(function (a, b) { return a.z - b.z; });
      datums.forEach(function (d) {
        if (lines.some(function (q) { return Math.abs(q.z - d.z) <= tolL + EPS; })) return;
        var near = lines.slice().sort(function (p, q) { return Math.abs(p.z - d.z) - Math.abs(q.z - d.z) || hnum(p.handle) - hnum(q.handle); })[0];
        block('QF:elev_level_mismatch', s.id, near ? [near.handle] : [], { x: near ? r6(near.x) : null, y: r6(yOf(d.z)) }, s.id + ': no level line at the ' + d.what + ' z=' + d.z + ' m' + (near ? ' (nearest line ' + near.handle + ' at z=' + r6(near.z) + ')' : ' (no level lines)'), { level: d.z, what: d.what });
      });
      if (!has('tol.dim') || datums.length < 2) return;
      var vd = s.ents.filter(function (e) { return e.type === 'DIMENSION' && dimAxis(e, tolD / ke) === 'y'; }).map(function (e) { var a = map.zOf(e.linearOrAngularPoint1.y), b = map.zOf(e.linearOrAngularPoint2.y); return [Math.min(a, b), Math.max(a, b)]; });
      var need = []; for (var i = 1; i < datums.length; i++) need.push([datums[i - 1].z, datums[i].z]);
      if (datums.length > 2) need.push([datums[0].z, datums[datums.length - 1].z]);
      need.forEach(function (n) { if (!vd.some(function (q) { return Math.abs(q[0] - n[0]) <= tolD + EPS && Math.abs(q[1] - n[1]) <= tolD + EPS; })) block('QF:elev_height_dim_missing', s.id, [], { x: null, y: r6(yOf((n[0] + n[1]) / 2)) }, s.id + ': no height dimension ' + n[0] + '..' + n[1] + ' m (G4)', { span: n }); });
    });

    bands.sort(function (a, b) { return a.z - b.z; }).forEach(function (b) {
      var ids = Object.keys(b.by).sort(), es = b.by[ids[0]].slice().sort(byHandle);
      block('QF:set_storey_unstated', ids[0], es.map(function (e) { return e.handle; }), posOf(es[0]), 'elevation' + (ids.length > 1 ? 's ' : ' ') + ids.join(', ') + ' show a level band at z=' + r6(b.z) + ' m but no PLAN (or ROOF) sheet states @LEVEL=' + r6(b.z) + ' (storeys come only from plans)', { level: r6(b.z), sheets: ids });
    });

    // ---------- conventions the user stated (L2.3 D3): @WALLTOP=<level>,slab_above; never a default ----------
    var conventions = [];
    roled.concat(SH.filter(function (s) { return !s.desc.view; })).forEach(function (s) {
      (s.desc.walltop || []).forEach(function (w) {
        var ent = s.all.find(function (e) { return e.handle === w.handle; });
        if (planLevels.indexOf(w.level) < 0) { block('QF:walltop_unknown_storey', s.id, [w.handle], posOf(ent), s.id + ': @WALLTOP=' + w.level + ',' + w.rule + ' names no PLAN @LEVEL (' + planLevels.join(', ') + ')', { level: w.level }); return; }
        if (!conventions.some(function (c) { return c.level === w.level && c.rule === w.rule; })) conventions.push({ level: w.level, rule: w.rule, sheet: s.id, handle: w.handle, source: 'stated (' + (w.by || 'file') + ')' });   // L2.7 (5): the marking's @BY
      });
    });
    conventions.sort(function (a, b) { return a.level - b.level; });

    // ---------- pipeline gaps (counted once, against the final stage: L2.3 D3) ----------
    var resolved = input.resolved || {}, SUPERSEDABLE = ['GAP:no_host_cut', 'GAP:opening_unclassified'];
    (input.gaps || []).forEach(function (g) {
      if (!g || !g.code || g.code === 'GAP:unmapped_layer') return;                     // folded into QF:layer_unmapped
      if (SUPERSEDABLE.indexOf(g.code) >= 0 && g.sheet !== undefined && (resolved[g.sheet] || []).indexOf(String(g.handle)) >= 0) { count('gaps_superseded'); return; }
      var s = g.sheet !== undefined ? byId[g.sheet] : null;
      var shape = g.shape || (g.kind === 'door' || g.kind === 'window' ? 'openings' : null);
      if (!shape && s && g.layer !== undefined) {                                       // L2.5 W3: the gap layer's rule type in that sheet's maps
        var lr = null; (s.maps || []).some(function (m) { lr = B.matchRule(g.layer, m.rules); return !!lr; });
        if (lr) shape = ['opening', 'glazing', 'elevdoor'].indexOf(lr.type) >= 0 ? 'openings' : ['wall', 'wallline'].indexOf(lr.type) >= 0 ? 'walls' : null;
      }
      if (!shape) { var t = SHAPE_TABLE.find(function (x) { return x[0].test(g.code); }); shape = t ? t[1] : 'set'; }
      var hs = typeof g.handle === 'string' || typeof g.handle === 'number' ? [String(g.handle)] : [];
      var e = s && hs.length ? s.all.find(function (x) { return x.handle === hs[0]; }) : null;
      var why = g.reason || (g.need ? 'need ' + g.need : '') || (g.layer ? 'layer ' + g.layer : '');
      var extra = {}; Object.keys(g).sort().forEach(function (k) { if (['code', 'shape', 'sheet', 'handle', 'run_id'].indexOf(k) < 0) extra[k] = g[k]; });
      if (g.code === 'GAP:no_elevation_height' && s && hs.length && (s.desc.walltop_walls || []).some(function (w) { return w.wall === hs[0].toUpperCase(); })) {   // L2.6 A: a per-wall top is stated
        var ww = s.desc.walltop_walls.find(function (w) { return w.wall === hs[0].toUpperCase(); });
        item(advisory, 'QF:height_stated', shape, g.sheet, hs, posOf(e), g.sheet + ': ' + g.code + ' ' + hs[0] + ' covered by @WALLTOP=handle:' + ww.wall + ',' + ww.z + ' (' + 'stated (' + (ww.by || 'file') + '))', { gap: g.code, z_top: ww.z, source: 'stated (' + (ww.by || 'file') + ')' }); return;
      }
      if (g.code === 'GAP:no_elevation_height' && s && s.desc.view === 'PLAN' && g.layer !== undefined && (s.maps || []).some(function (m) { var r = B.matchRule(g.layer, m.rules); return r && (r.type === 'wall' || r.type === 'wallline'); })) {
        var cv = conventions.find(function (c) { return c.level === s.desc.level && c.rule === 'slab_above'; });
        if (cv) { item(advisory, 'QF:convention_applied', shape, g.sheet, hs, posOf(e), g.sheet + ': ' + g.code + ' ' + hs[0] + ' covered by @WALLTOP=' + cv.level + ',slab_above (convention ' + cv.source + ')', { gap: g.code, convention: cv.source, walltop: cv.level }); return; }
      }
      item(ADVISORY_GAP.test(g.code) ? advisory : blocking, g.code, shape, g.sheet === undefined ? null : g.sheet, hs, posOf(e), (g.sheet ? g.sheet + ': ' : '') + g.code + (hs.length ? ' ' + hs[0] : '') + (why ? ' (' + why + ')' : ''), { detail: extra });
    });

    // ---------- verdict ----------
    function cmp(a, b) {
      return a.code < b.code ? -1 : a.code > b.code ? 1 : (a.sheet || '') < (b.sheet || '') ? -1 : (a.sheet || '') > (b.sheet || '') ? 1 :
        hnum(a.handles[0]) - hnum(b.handles[0]) || (a.message < b.message ? -1 : a.message > b.message ? 1 : 0);
    }
    blocking.sort(cmp); advisory.sort(cmp);
    var by = {}; SHAPES.forEach(function (sh) {
      var nb = blocking.filter(function (x) { return x.shape === sh || x.shape === 'set'; }).length, na = advisory.filter(function (x) { return x.shape === sh || x.shape === 'set'; }).length;
      by[sh] = { verdict: nb ? 'blocked' : 'qualifies', blocking: nb, advisory: na };
    });
    var counts = {}; blocking.forEach(function (x) { counts[x.code] = (counts[x.code] || 0) + 1; });
    var ck = {}; Object.keys(checks).sort().forEach(function (k) { ck[k] = checks[k]; });
    return {
      verdict: blocking.length ? 'blocked' : 'qualifies', blocking: blocking, advisory: advisory, by_shape: by, counts: counts,
      sheets: SH.map(function (s) { return { id: s.id, view: s.desc.view || null, units: s.desc.units || null, level: s.desc.level === undefined ? null : s.desc.level, face: s.desc.face || null, roof: s.desc.roof === undefined ? null : s.desc.roof, region: s.region || null, entities: s.ents.length }; }),
      reference_plan: ref ? ref.id : null, conventions: conventions, checks: ck
    };
  }

  return { qualify: qualify, sheets: function (files) { return sheets(files).sheets.map(function (s) { return { id: s.id, file: s.file, region: s.region, view: s.desc.view || null }; }); }, parseLen: parseLen, clean: clean, ADVISORY_GAP: ADVISORY_GAP };
});
