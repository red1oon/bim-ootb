// ⚠ DO NOT REMOVE — §D97 LOAD SUMMARY (prompts/DXF2BIM_FOUNDATION_LANE.md §D97, W-LOAD-SUMMARY). Read the log after every run.
// PURE (no DOM / THREE): bodies (the converted set, bodies.json shape) + inputs -> the building's own weight per body, per group and per footing, the shape inputs
// for wind / earthquake, and every input nobody stated (MISSING, never filled). Unit weights come from the inputs (element_defaults.json `load.*`, BNBC 2012 Part 6
// Ch 2 Tables 2.2.1 / 2.2.2, kept verbatim in modeller/reference/); a body whose size or weight the drawing does not give is MISSING, not estimated.
// NOT a design check: no live load, wind, earthquake or member strength is computed here.
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.LoadSummary = factory(); })(this, function () {
  'use strict';
  var IN = 0.0254, G = 9.80665;
  var KEYS = ['load.unit_weight.concrete', 'load.rc_steel_percent', 'load.unit_weight.brick', 'load.unit_weight.steel', 'load.roof_sheet'];
  // the required facts: no table gives them, the person states them (RED until then)
  var FACTS = [
    { key: 'fan_kN', label: 'Fan weight', unit: 'kN each', applies: 'IfcFan' },
    { key: 'netting_kNm2', label: 'Netting weight', unit: 'kN/m2', applies: 'IfcCovering' },
    { key: 'door_kN', label: 'Door weight', unit: 'kN each', applies: 'IfcDoor' },
    { key: 'district', label: 'Site district', unit: '', applies: null, why: 'sets the BNBC basic wind speed and seismic zone' },
    { key: 'soil_kPa', label: 'Soil bearing capacity', unit: 'kPa', applies: null, why: 'from a soil report; the footing pressures are compared with it' }
  ];
  // the body's box: bodies.json carries `bbox`; the page's bodies carry `vertices` (the CLI derives bbox from them the same way); neither -> null (the body is MISSING, never weighed 0)
  function box(b) { if (b.bbox && b.bbox.length === 6) return b.bbox; var V = b.vertices; if (!V || !V.length) return null;
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; V.forEach(function (v) { for (var i = 0; i < 3; i++) { if (v[i] < lo[i]) lo[i] = v[i]; if (v[i] > hi[i]) hi[i] = v[i]; } }); return lo.concat(hi); }
  function dims(b) { var x = box(b) || [0, 0, 0, 0, 0, 0]; return [x[3] - x[0], x[4] - x[1], x[5] - x[2]]; }
  function num(v) { return v && typeof v === 'object' ? Number(v.number) : Number(v); }
  function sz(b, k) { return b.size && b.size[k] !== undefined ? num(b.size[k]) : NaN; }
  function tname(b) { return String((b.ifc && b.ifc.type_name) || ''); }
  // a section label's legs and thickness, inches: `1.5"x1.5"x1/4" Angle`, `1.5"x1.5"x1/4"`, `2 - 2"x2"x1/4"` (a pair)
  function inch(s) { s = String(s).trim(); var m = /^(\d+)\s*\/\s*(\d+)$/.exec(s); if (m) return Number(m[1]) / Number(m[2]); var f = /^(\d+(?:\.\d+)?)(?:\s+(\d+)\s*\/\s*(\d+))?$/.exec(s); return f ? Number(f[1]) + (f[2] ? Number(f[2]) / Number(f[3]) : 0) : NaN; }
  function angleOf(label) {
    var m = /^(?:(\d+)\s*-\s*)?([\d.\s\/]+)"\s*x\s*([\d.\s\/]+)"\s*x\s*([\d.\s\/]+)"/.exec(String(label).trim()); if (!m) return null;
    var n = m[1] ? Number(m[1]) : 1, a = inch(m[2]), b = inch(m[3]), t = inch(m[4]); if (!(a > 0 && b > 0 && t > 0)) return null;
    return { n: n, a: a * IN, b: b * IN, t: t * IN, area: n * t * IN * (a * IN + b * IN - t * IN) };   // L section: t (a + b - t), root fillet ignored
  }
  // a bar's length from its box: the largest extent, or the diagonal of the two largest when it runs on a slope (± the section width)
  function barLength(b) { var d = dims(b).slice().sort(function (p, q) { return q - p; }), w = sz(b, 'w') || 0; return d[1] > 2 * w + 1e-6 ? Math.hypot(d[0], d[1]) : d[0]; }
  function compute(bodies, inputs) {
    inputs = inputs || {}; var V = inputs.values || {}, F = inputs.facts || {}, src = inputs.sources || {};
    var rc = Number(V['load.unit_weight.concrete']) + 0.63 * Number(V['load.rc_steel_percent']), brick = Number(V['load.unit_weight.brick']), steel = Number(V['load.unit_weight.steel']), sheet = Number(V['load.roof_sheet']);
    var rows = [], missing = [];
    // T14c: the section a member with none on its label takes: the stated member.section, else the most common drawn section of the SAME kind in this set (ties: lighter, then label)
    var MS = String(V['member.section'] == null ? '' : V['member.section']).trim(), modeOf = {};
    (function () { var cnt = {};
      (bodies || []).forEach(function (b) { if (b['class'] !== 'IfcMember') return; var A = angleOf(tname(b)); if (!A) return;
        var k = (b.kind || ''), key = [A.n, A.a, A.b, A.t].map(function (x) { return x.toFixed(6); }).join('|'), m = cnt[k] = cnt[k] || {}; (m[key] = m[key] || { A: A, label: tname(b), n: 0 }).n++; });
      Object.keys(cnt).forEach(function (k) { var c = Object.keys(cnt[k]).map(function (q) { return cnt[k][q]; }), N = c.reduce(function (a, x) { return a + x.n; }, 0);
        c.sort(function (p, q) { return q.n - p.n || p.A.area - q.A.area || (p.label < q.label ? -1 : 1); }); modeOf[k] = { A: c[0].A, label: c[0].label, n: c[0].n, of: N }; });
    })();
    function assumedSection(b) {
      if (/^none$/i.test(MS)) return null;
      if (MS) { var A = angleOf(MS); return A ? { A: A, from: 'stated member.section ' + MS, label: MS } : null; }
      var m = modeOf[b.kind || '']; return m ? { A: m.A, from: 'the drawing\'s most common ' + (b.kind || 'member') + ' section ' + m.label + ' (' + m.n + ' of ' + m.of + ' labelled)', label: m.label } : null;
    }
    (bodies || []).forEach(function (b) {
      var d = dims(b), h = (b.z1 - b.z0), c = b['class'], mat = String((b.ifc && b.ifc.material) || ''), r = { guid: b.guid, cls: c, type: tname(b) || c.replace(/^Ifc/, ''), material: mat, sheet: b.sheet, handle: b.handle, cx: 0, cy: 0, z0: b.z0, z1: b.z1 }, bx = box(b);
      if (bx) { r.cx = (bx[0] + bx[3]) / 2; r.cy = (bx[1] + bx[4]) / 2; }
      // how the SIZE is known: drawn / label / schedule / inherited (read) or default (a yellow default, e.g. the slab of "Complete the building")
      var ss = b.size ? Object.keys(b.size).map(function (k) { return b.size[k] && b.size[k].source; }).filter(Boolean) : [];
      r.sizeFrom = ss.indexOf('default') >= 0 ? 'default' : ss.length ? ss.filter(function (v, i) { return ss.indexOf(v) === i; }).join('+') : 'box';
      var set = function (qty, unit, uw, uwKey, formula) { r.qty = qty; r.unit = unit; r.uw = uw; r.uwKey = uwKey; r.kN = qty * uw; r.formula = formula; r.tier = uwKey ? (src[uwKey] || 'default') : 'stated'; };
      if (!bx) { r.missing = 'no geometry to measure'; rows.push(r); return; }
      if (/concrete/i.test(mat)) {
        var vol = c === 'IfcBeam' ? (sz(b, 'w') || d[1]) * (sz(b, 'd') || d[2]) * Math.max(d[0], d[1]) : c === 'IfcSlab' ? d[0] * d[1] * (sz(b, 't') || d[2]) : (sz(b, 'x') || d[0]) * (sz(b, 'y') || d[1]) * h;
        set(vol, 'm3', rc, 'load.unit_weight.concrete', 'volume x (22.8 + 0.63 x p) with p = load.rc_steel_percent');
      } else if (/brick/i.test(mat)) set(Math.max(d[0], d[1]) * h * (sz(b, 't') || Math.min(d[0], d[1])), 'm3', brick, 'load.unit_weight.brick', 'length x height x drawn thickness x brick');
      else if (c === 'IfcPlate') { var e = d.slice().sort(function (p, q) { return q - p; }); set(e[0] * e[1] * (sz(b, 't') || e[2]), 'm3', steel, 'load.unit_weight.steel', 'plate area x drawn thickness x steel'); }
      else if (c === 'IfcMember') { var A = angleOf(tname(b)), L = barLength(b), AS = A ? null : assumedSection(b); if (AS) { A = AS.A; r.assumed = true; r.sectionFrom = AS.from; r.sizeFrom = 'assumed'; }
        if (A) { set(L * A.area, 'm3', steel, 'load.unit_weight.steel', 'length x ' + (A.n > 1 ? A.n + ' x ' : '') + 't(a + b - t) from the label x steel (root fillet ignored)'); r.section = A; r.length = L; if (AS) r.formula += ' [section: ' + AS.from + ']'; }
        else { r.missing = 'section size not drawn'; r.length = c === 'IfcMember' && b.size && b.size.run ? Math.abs(b.size.run[1] - b.size.run[0]) : L; } }
      else if (c === 'IfcRoof') { var slope = Number(b.size && b.size.slope_deg) || 0, area = d[0] * d[1] / Math.cos(slope * Math.PI / 180); set(area, 'm2', sheet, 'load.roof_sheet', 'plan area / cos(slope) x sheet weight'); }
      else { var f = FACTS.filter(function (q) { return q.applies === c; })[0];
        if (f && F[f.key] !== undefined && F[f.key] !== null && F[f.key] !== '') { var each = f.unit === 'kN/m2' ? Math.max(d[0], d[1]) * h : 1; set(each, f.unit === 'kN/m2' ? 'm2' : 'each', Number(F[f.key]), null, f.unit === 'kN/m2' ? 'area x stated weight' : 'stated weight each'); }
        else r.missing = f ? f.label.toLowerCase() + ' not stated' : 'no weight rule for ' + c; }
      rows.push(r);
    });
    // per footing: every weighed body once to the nearest footing in plan (the tributary area on a regular grid); a slab whose bottom lies within GROUND_SLAB_M of the
    // ground datum (z = 0, the elevations' @Z=0) bears on the ground, not on a footing
    var foot = rows.filter(function (r) { return r.cls === 'IfcFooting'; }), GROUND_SLAB_M = 1.0;
    var F2 = foot.map(function (r) { var b = bodies.filter(function (q) { return q.guid === r.guid; })[0], d = dims(b); return { guid: r.guid, cx: r.cx, cy: r.cy, area: d[0] * d[1], kN: 0, n: 0 }; });
    var onGround = 0;
    rows.forEach(function (r) { if (!(r.kN >= 0)) return;
      if (r.cls === 'IfcSlab' && r.z0 <= GROUND_SLAB_M) { r.carriedBy = 'ground'; onGround += r.kN; return; }
      var best = null, bd = Infinity; F2.forEach(function (f) { var dd = Math.hypot(f.cx - r.cx, f.cy - r.cy); if (dd < bd) { bd = dd; best = f; } });
      if (best) { best.kN += r.kN; best.n++; r.carriedBy = best.guid; } });
    F2.forEach(function (f) { f.kPa = f.kN / f.area; f.soil = F.soil_kPa ? (f.kPa <= Number(F.soil_kPa) ? 'within' : 'OVER') : 'soil capacity not stated'; });
    // groups, totals
    var groups = {}; rows.forEach(function (r) { var k = r.cls + '|' + r.material + '|' + (r.missing ? 'missing' : r.uwKey || 'stated'); var g = groups[k] = groups[k] || { cls: r.cls, material: r.material, n: 0, qty: 0, unit: r.unit || '', kN: 0, missing: r.missing || null, uwKey: r.uwKey || null, uw: r.uw, formula: r.formula || '', lengthMissing: 0, sizeFrom: {} };
      g.sizeFrom[r.sizeFrom] = (g.sizeFrom[r.sizeFrom] || 0) + 1;
      g.n++; if (r.kN >= 0) { g.qty += r.qty; g.kN += r.kN; } else if (r.length) g.lengthMissing += r.length; });
    var G2 = Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) { return b.kN - a.kN; });
    var weighed = rows.filter(function (r) { return r.kN >= 0; }), total = weighed.reduce(function (a, r) { return a + r.kN; }, 0);
    rows.filter(function (r) { return r.missing; }).forEach(function () {});
    var missRows = rows.filter(function (r) { return r.missing; });
    var byMiss = {}; missRows.forEach(function (r) { var k = r.cls + ': ' + r.missing; byMiss[k] = (byMiss[k] || 0) + 1; });
    Object.keys(byMiss).forEach(function (k) { missing.push({ what: k, n: byMiss[k] }); });
    FACTS.filter(function (f) { return !f.applies; }).forEach(function (f) { if (F[f.key] === undefined || F[f.key] === null || F[f.key] === '') missing.push({ what: f.label + ' (' + f.why + ')', n: 1, fact: f.key }); });
    // shape inputs for wind / earthquake (read)
    var all = (bodies || []).map(box).filter(Boolean), mn = [0, 1, 2].map(function (i) { return Math.min.apply(null, all.map(function (x) { return x[i]; })); }), mx = [0, 1, 2].map(function (i) { return Math.max.apply(null, all.map(function (x) { return x[i + 3]; })); });
    var roofs = (bodies || []).filter(function (b) { return b['class'] === 'IfcRoof'; }), eave = roofs.length ? Math.min.apply(null, roofs.map(function (b) { return b.z0; })) : null;
    var shape = { length_m: Math.max(mx[0] - mn[0], mx[1] - mn[1]), width_m: Math.min(mx[0] - mn[0], mx[1] - mn[1]), ridge_m: mx[2], eave_m: eave, roof_slope_deg: roofs.length ? Number(roofs[0].size && roofs[0].size.slope_deg) : null, footings: foot.length };
    return { rows: rows, groups: G2, footings: F2, missing: missing, shape: shape, total_kN: total, onGround_kN: onGround, toFootings_kN: F2.reduce(function (a, f) { return a + f.kN; }, 0), weighed: weighed.length, unweighed: missRows.length, rc_kNm3: rc, tonnes: total / G };
  }
  function log(res, logFn) { logFn = logFn || function () {};
    var asm = res.rows.filter(function (r) { return r.assumed; }), by = {}; asm.forEach(function (r) { by[r.sectionFrom] = (by[r.sectionFrom] || 0) + 1; });
    logFn('§LOAD_ASSUMED_SECTION members=' + asm.length + (asm.length ? ' ' + Object.keys(by).sort().map(function (k) { return by[k] + ' x ' + k; }).join(' ; ') : ''));
    logFn('§LOAD_SUMMARY total_kN=' + res.total_kN.toFixed(1) + ' tonnes=' + res.tonnes.toFixed(1) + ' weighed=' + res.weighed + ' unweighed=' + res.unweighed + ' to_footings_kN=' + res.toFootings_kN.toFixed(1) + ' on_ground_kN=' + res.onGround_kN.toFixed(1) + ' footings=' + res.footings.length + ' missing=' + res.missing.map(function (m) { return m.what.split(' (')[0] + 'x' + m.n; }).join('; '));
    res.groups.forEach(function (g) { logFn('§LOAD_BODY cls=' + g.cls + ' material="' + g.material + '" n=' + g.n + ' qty=' + g.qty.toFixed(3) + g.unit + ' kN=' + g.kN.toFixed(2) + (g.missing ? ' MISSING="' + g.missing + '" length_m=' + g.lengthMissing.toFixed(1) : ' uw=' + g.uw + ' (' + g.uwKey + ')')); }); }
  return { compute: compute, log: log, KEYS: KEYS, FACTS: FACTS, angleOf: angleOf, barLength: barLength };
});
