// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// road_report.js — §ROAD_REPORT (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §ROAD_REPORT). "R for Road": one key opens a
// prognosis dashboard of the road — every line is a chainage + a measured value + the rule it was judged by + its source.
// Implementing CIVIL_HIGHWAY_JELAPANG.md §ROAD_REPORT — Witness: viewer/tests/witness_road_report.js
// NOTHING is computed twice here: drift = §CHAINAGE_GRID intervals, zones + max grade = §SPEED_ZONES (ATJ 8/86 rows), sign verdicts =
// §SIGN_CHECK, missing speed signs + advance placement = §SPEED_ZONES / §SIGN_VS_SPEED. The ONLY new measurement is the grade chord
// on the existing 1 m road profile. Cut-offs (drift %, grade window) are std_values.json `_road_report` — demo defaults, editable.
// Pure core (node + browser) + browser glue (setupRoadReport).
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.RoadReport = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var SEV = ['CRITICAL', 'WARNING', 'HEALTHY', 'INFO', 'NOT CHECKED'];
  // sections (user 2026-10-08 naming): kind -> section
  var SECTIONS = [['align', '\ud83d\uddfa\ufe0f Alignment & Drift'], ['earth', '\u26f0\ufe0f Earthworks'], ['geo', '\ud83d\udea7 Geometric Health'], ['signs', '\ud83d\udea6 Signs'], ['env', '\ud83c\udf31 Environment']];
  var SEC_OF = { drift: 'align', earth: 'earth', grade: 'geo', radius: 'geo', sign: 'signs', speed_sign: 'signs', advance: 'signs', environment: 'env' };
  function fmtCh(ch) { if (ch == null || !isFinite(ch)) return '—'; var r = Math.round(ch); return Math.floor(r / 1000) + '+' + ('00' + (r % 1000)).slice(-3); }
  function n0(x) { return Math.round(x).toLocaleString('en-US'); }

  // grade stretches: chord of `win` m on the 1 m road profile, both ends on a road surface (NaN = no surface → not judged).
  // A start s is in breach when |dz|/win > the max grade of the zone at the chord's middle. Consecutive breach starts merge.
  function gradeStretches(prof, zones, win) {
    var road = prof.road, ds = prof.ds, n = road.length, step = Math.max(1, Math.round(win / ds)), out = [], judged = 0, okM = 0, noMax = 0, cur = null;
    function zoneAt(s) { for (var k = 0; k < zones.length; k++) if (!zones[k].offRoute && s >= zones[k].s0 - 1e-9 && s < zones[k].s1 - 1e-9) return zones[k]; return null; }
    for (var i = 0; i + step < n; i++) {
      var a = road[i], b = road[i + step], s = i * ds;
      if (!(a === a) || !(b === b) || a == null || b == null) { if (cur) { out.push(cur); cur = null; } continue; }
      var z = zoneAt(s + win / 2), g = Math.abs(b - a) / win * 100;
      if (!z || !z.grade || z.grade.pct == null) { noMax++; if (cur) { out.push(cur); cur = null; } continue; }
      judged++;
      if (g > z.grade.pct) {
        if (cur && cur.zone === z.id && i === cur.lastI + 1) { cur.s1 = s + win; cur.lastI = i; if (g > cur.maxG) { cur.maxG = g; cur.atS = s; } }
        else { if (cur) out.push(cur); cur = { s0: s, s1: s + win, lastI: i, maxG: g, atS: s, zone: z.id, speed: z.speed, max: z.grade.pct, ref: z.grade.ref }; }
      } else { okM++; if (cur) { out.push(cur); cur = null; } }
    }
    if (cur) out.push(cur);
    return { stretches: out, judgedStarts: judged, okStarts: okM, noMaxStarts: noMax, step: step };
  }

  function earthStretches(prof, minLen) {
    var road = prof.road, gr = prof.ground, ds = prof.ds, out = [], cur = null, both = 0;
    function close() { if (cur && (cur.s1 - cur.s0) >= minLen) out.push(cur); cur = null; }
    for (var i = 0; i < road.length; i++) {
      var r = road[i], g = gr[i]; if (!(r === r) || !(g === g) || r == null || g == null) { close(); continue; }
      both++; var d = r - g, kind = d < 0 ? 'cut' : 'fill', s = i * ds;
      if (cur && cur.kind === kind && i === cur.lastI + 1) { cur.s1 = s; cur.lastI = i; if (Math.abs(d) > cur.max) { cur.max = Math.abs(d); cur.at = s; } }
      else { close(); cur = { kind: kind, s0: s, s1: s, lastI: i, max: Math.abs(d), at: s }; }
    }
    close(); return { stretches: out, both: both };
  }

  // in: { intervals, prof, zones, realAt(s), signRows (sign check rows), signS {guid: s}, missingRows, advRows, envHits, cfg }
  function build(inp) {
    var cfg = inp.cfg || {}, dp = cfg.drift_pct || {}, lines = [], R = inp.realAt || function (s) { return s; };
    var CH = function (s) { return 'CH ' + fmtCh(R(s)); };
    function add(sev, kind, text, extra) { lines.push(Object.assign({ sev: sev, kind: kind, sec: SEC_OF[kind], text: text }, extra || {})); }
    // 1. chainage drift (model markers vs the inferred route)
    var iv = inp.intervals || [], ivOk = 0;
    iv.forEach(function (q) {
      var pct = Math.abs(q.drift) / q.stepM * 100, sev = pct >= dp.critical ? 'CRITICAL' : pct >= dp.warning ? 'WARNING' : null;
      if (!sev) { ivOk++; return; }
      add(sev, 'drift', 'CH ' + fmtCh(q.from) + ' to ' + fmtCh(q.to) + ': ' + pct.toFixed(1) + '% drift — inferred route ' + q.routeM.toFixed(1) + ' m vs printed ' + q.stepM + ' m (model chainage markers)',
        { ch: q.from, pct: pct, s: inp.routeSOf ? inp.routeSOf(q.from) : null, src: 'chainage markers vs drive route' });
    });
    if (iv.length) add('HEALTHY', 'drift', 'Chainage: ' + ivOk + ' of ' + iv.length + ' intervals within ' + dp.warning + '% of the printed step', { n: ivOk, of: iv.length });
    else add('NOT CHECKED', 'drift', 'Chainage drift: no anchored chainage markers on the route');
    // 2. grade vs ATJ 8/86 max grade of the zone
    if (inp.prof && inp.zones && inp.zones.length) {
      var G = gradeStretches(inp.prof, inp.zones, cfg.grade_window_m || 20);
      G.stretches.forEach(function (g) {
        add('WARNING', 'grade', CH(g.s0) + ' to ' + fmtCh(R(g.s1)) + ': grade up to ' + (g.maxG.toFixed(1) === String(+(+g.max).toFixed(1)) || +g.maxG.toFixed(1) === +g.max ? g.maxG.toFixed(2) : g.maxG.toFixed(1)) + '% exceeds max ' + g.max + '% for ' + g.zone + ' ' + g.speed + ' km/h (ATJ 8/86 ' + g.ref.table + ', p.' + g.ref.page + ')',
          { s: g.atS, s0: g.s0, s1: g.s1, maxG: g.maxG, max: g.max, src: 'ATJ 8/86 ' + g.ref.table + ' p.' + g.ref.page });
      });
      add('HEALTHY', 'grade', 'Grade: ' + n0(G.okStarts * inp.prof.ds) + ' m of ' + n0(G.judgedStarts * inp.prof.ds) + ' m judged within the ATJ 8/86 max (' + cfg.grade_window_m + ' m chords)' +
        (G.noMaxStarts ? '; ' + n0(G.noMaxStarts * inp.prof.ds) + ' m in zones with no max-grade row not judged' : ''), { ok: G.okStarts, judged: G.judgedStarts });
      var unj = (inp.prof.road.length - 1) - G.judgedStarts - G.noMaxStarts - G.step;
      if (unj > 0) add('NOT CHECKED', 'grade', 'Grade: ' + n0(unj * inp.prof.ds) + ' m with no road surface under the route (no grade measured there)');
      inp._grade = G;
    } else add('NOT CHECKED', 'grade', 'Grade: speed zones / road profile not derived — no max grade to judge against');
    // 2b. earthworks: road top minus ground (EARTHWORK surface) where BOTH were hit; road below ground = cut, above = fill.
    //     Stretches of one sign at least `grade_window_m` long; depth = max |road - ground| in the stretch. No severity: information.
    if (inp.prof && inp.prof.ground) {
      var E = earthStretches(inp.prof, cfg.grade_window_m || 20), both = E.both * inp.prof.ds, Ltot = (inp.prof.road.length - 1) * inp.prof.ds;
      E.stretches.forEach(function (e) {
        add('INFO', 'earth', CH(e.s0) + ' to ' + fmtCh(R(e.s1)) + ': ' + (e.kind === 'cut' ? 'cut' : 'fill') + ' up to ' + e.max.toFixed(1) + ' m (' + (e.kind === 'cut' ? 'road below ground' : 'road above ground') + ', ' + n0(e.s1 - e.s0) + ' m)',
          { s: e.at, s0: e.s0, s1: e.s1, depth: e.max, src: 'road profile vs EARTHWORK surface' });
      });
      add('NOT CHECKED', 'earth', 'Earthworks: ground surface found under ' + n0(both) + ' m of ' + n0(Ltot) + ' m of road — the rest has no EARTHWORK surface under the route', { both: both });
    }
    add('NOT CHECKED', 'radius', 'Curve radius: not measured yet — needs the road edge geometry (ATJ 8/86 \u00a74.2.3 minimum radius is the rule to judge by)');
    // 3. sign codes (§SIGN_CHECK) — one line per code, chainages listed
    var sr = inp.signRows || [], byCode = {};
    sr.forEach(function (r) { if (r.verdict === 'OK') return; var k = r.verdict + '|' + (r.code == null ? '' : r.code); (byCode[k] || (byCode[k] = [])).push(r); });
    Object.keys(byCode).forEach(function (k) {
      var g = byCode[k], v = g[0].verdict, seen = {}, ss = g.map(function (r) { return inp.signS[r.guid]; }).filter(function (s) { return s != null; }).sort(function (a, b) { return a - b; })
        .filter(function (s) { var key = fmtCh(R(s)); if (seen[key]) return false; seen[key] = 1; return true; });   // one chainage once (several boards at one station)
      var at = ss.slice(0, 4).map(function (s) { return fmtCh(R(s)); }).join(', ') + (ss.length > 4 ? ' +' + (ss.length - 4) + ' more' : '');
      add(v === 'UNKNOWN' ? 'CRITICAL' : 'WARNING', 'sign', (ss.length ? 'CH ' + at : 'Signs') + ': ' + (v === 'UNKNOWN' ? 'sign code "' + g[0].code + '" ×' + g.length + ' not in the ATJ 2A/85 table' : g.length + ' sign' + (g.length > 1 ? 's have' : ' has') + ' no code property'),
        { s: ss[0], guid: g[0].guid, src: 'ATJ 2A/85 (std_values.json)' });
    });
    if (sr.length) add('HEALTHY', 'sign', 'Sign codes: ' + sr.filter(function (r) { return r.verdict === 'OK'; }).length + ' of ' + sr.length + ' in the ATJ 2A/85 table');
    // 4. missing speed-limit signs (zone start without one)
    var mr = inp.missingRows || [], nz = (inp.zones || []).filter(function (z) { return !z.offRoute; }).length;
    mr.forEach(function (m) { add('WARNING', 'speed_sign', CH(m.s0) + ' to ' + fmtCh(R(m.s1)) + ' (' + m.zone + ', ' + m.speed + ' km/h): no speed-limit sign at the zone start', { s: m.s0, src: '§SPEED_ZONES' }); });
    if (nz) add('HEALTHY', 'speed_sign', 'Speed zones: ' + Math.max(0, nz - mr.length) + ' of ' + nz + ' start with a speed-limit sign');
    // 5. advance placement (ATJ 2B/85 cl.2.2.8)
    var ar = inp.advRows || [];
    ar.filter(function (r) { return r.verdict === 'CHECK'; }).forEach(function (r) {
      add('WARNING', 'advance', CH(r.s) + ': ' + r.code + ' is ' + r.dist.toFixed(0) + ' m before the ' + r.noun + ', needs ≥ ' + r.minM + ' m (ATJ 2B/85 cl.2.2.8)', { s: r.s, guid: r.guid, src: 'ATJ 2B/85 cl.2.2.8' });
    });
    var aok = ar.filter(function (r) { return r.verdict === 'OK'; }).length, anj = ar.filter(function (r) { return r.verdict === 'NOT_JUDGED'; }).length;
    if (ar.length) add('HEALTHY', 'advance', 'Advance placement: ' + aok + ' of ' + (ar.length - anj) + ' judged signs far enough from their hazard');
    if (anj) add('NOT CHECKED', 'advance', 'Advance placement: ' + anj + ' sign' + (anj > 1 ? 's' : '') + ' whose hazard position is unknown');
    // 6. environment — only when the model carries such a layer
    if (!inp.envHits) add('NOT CHECKED', 'environment', 'Environmental buffers (wetland, protection zones): no environmental layer in the model');
    else add('NOT CHECKED', 'environment', 'Environmental buffers: ' + inp.envHits + ' environmental properties found — no buffer rule set up yet');
    lines.sort(function (a, b) { return SEV.indexOf(a.sev) - SEV.indexOf(b.sev) || (b.pct || 0) - (a.pct || 0) || (a.s != null && b.s != null ? a.s - b.s : 0); });
    var counts = {}; SEV.forEach(function (k) { counts[k] = lines.filter(function (l) { return l.sev === k; }).length; });
    return { lines: lines, counts: counts };
  }
  function bySection(res) { return SECTIONS.map(function (sc) { return { id: sc[0], name: sc[1], lines: res.lines.filter(function (l) { return l.sec === sc[0]; }) }; }).filter(function (g) { return g.lines.length; }); }
  function toText(res, title) {
    return (title ? title + '\n' : '') + bySection(res).map(function (g) { return '\n' + g.name + '\n' + g.lines.map(function (l) { return '[' + l.sev + '] ' + l.text; }).join('\n'); }).join('\n') + '\n';
  }

  // printable A4 page (browser "Save as PDF", same route as the Cross / Profile sheets): the SAME lines, same sections
  function pdfHTML(res, std, model, when) {
    var e = function (x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }, C = { CRITICAL: '#c62828', WARNING: '#e65100', HEALTHY: '#2e7d32', INFO: '#0277bd', 'NOT CHECKED': '#666' };
    var rr = (std && std._road_report) || {}, dp = rr.drift_pct || {};
    return '<!doctype html><html><head><meta charset="utf-8"><title>The Road Report — ' + e(model) + '</title><style>body{font:12px Arial,sans-serif;margin:16px;color:#111}h1{font-size:20px;margin:0}.sub{color:#666;margin-bottom:8px}' +
      '.chips span{display:inline-block;border:1px solid;border-radius:10px;padding:1px 8px;margin-right:4px;font-weight:700}h2{font-size:14px;margin:14px 0 4px;border-bottom:1px solid #ccc}.ln{margin:2px 0;padding:2px 6px;border-left:3px solid}' +
      '.sev{font-weight:700;font-size:10px;margin-right:4px}.src{margin-top:16px;color:#444;font-size:11px;page-break-before:always}@page{size:A4;margin:12mm}</style></head><body>' +
      '<h1>The Road Report</h1><div class="sub">' + e(model) + ' \u00b7 ' + e(when) + ' \u00b7 Measured on the model \u00b7 judged by ATJ</div><div class="chips">' +
      SEV.map(function (k) { return '<span class="chip" data-sev="' + k + '" style="border-color:' + C[k] + ';color:' + C[k] + '">' + k + ' ' + res.counts[k] + '</span>'; }).join('') + '</div>' +
      bySection(res).map(function (g) { return '<h2 data-sec="' + g.id + '">' + e(g.name) + '</h2>' + g.lines.slice().sort(function (x, y) { return SEV.indexOf(x.sev) - SEV.indexOf(y.sev); }).map(function (l) {
        return '<div class="ln" data-sev="' + l.sev + '" style="border-color:' + C[l.sev] + '"><span class="sev" style="color:' + C[l.sev] + '">' + l.sev + '</span>' + e(l.text) + '</div>'; }).join(''); }).join('') +
      '<div class="src"><b>Sources and cut-offs</b><br>Chainage: the model\'s own CHAINAGE marker text, anchored where each label line crosses the drive route. Grade: ' + e(rr.grade_window_m) + ' m chords on the 1 m road profile vs ATJ 8/86 Tables 4.10A\u2013F (max grade per class, speed, terrain). ' +
      'Signs: ATJ 2A/85 (codes), ATJ 2B/85 cl.2.2.8 (advance placement). Speed zones: ATJ 8/86 Tables 2.4, 3.2A/B. Earthworks: road profile minus EARTHWORK surface. Drift cut-offs CRITICAL \u2265 ' + e(dp.critical) + '%, WARNING \u2265 ' + e(dp.warning) + '% are demo defaults (editable).</div></body></html>';
  }

  // ── browser glue ──
  var COL = { CRITICAL: '#ff5252', WARNING: '#ffaa33', HEALTHY: '#44cc44', INFO: '#4fc3f7', 'NOT CHECKED': '#888' };
  function esc(x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function setupRoadReport(A) {
    var PANEL = 'road-report-panel';
    function objQuery(q, params) { var st = A.db.prepare(q), out = []; try { if (params && params.length) st.bind(params); while (st.step()) out.push(st.getAsObject()); } finally { st.free(); } return out; }
    A.roadReportOpen = function () { var p = document.getElementById(PANEL); return !!(p && p.style.display !== 'none'); };
    A.hideRoadReport = function (why) { var p = document.getElementById(PANEL); if (p) p.remove(); console.log('§ROAD_REPORT closed via=' + (why || 'api')); };
    A.toggleRoadReport = function () { if (A.roadReportOpen()) { A.hideRoadReport('toggle'); return null; } return A.showRoadReport(); };
    A.showRoadReport = function () {
      if (!(A.isCivilModel && A.isCivilModel())) { console.log('§ROAD_REPORT VACUOUS not a civil model — the road report is civil-only'); return Promise.resolve(null); }
      var t0 = performance.now();
      var ld = (typeof window.loadJsonWithOverrides === 'function') ? window.loadJsonWithOverrides('std_values.json?v=3', 'json_std_values') : fetch('std_values.json?v=3').then(function (r) { return r.json(); });
      return ld.then(function (std) {
        var C = A.chainage ? A.chainage.read(std) : null;
        // speed zones: reuse a derived result; else derive into a detached host (same owner, no second engine)
        var szP = A._speedZones ? Promise.resolve(A._speedZones) : (A.speedZones && std.geometric ? A.speedZones.mount(std, document.createElement('div'), document.createElement('div')).then(function () { return A._speedZones; }) : Promise.resolve(null));
        return szP.then(function (SZ) {
          var sc = window.RoadStandards ? window.RoadStandards.checkSigns(objQuery, std, {}) : { rows: [] };
          var signS = {}; ((SZ && SZ.signRows) || []).forEach(function (r) { signS[r.guid] = r.s; });
          // environment layer: any pset name/value containing one of std_values _road_report.environment_terms (editable)
          var terms = ((std._road_report || {}).environment_terms || []).map(function (t) { return String(t).toLowerCase(); }), env = 0;
          if (terms.length) env = objQuery('SELECT COUNT(*) AS n FROM element_psets WHERE ' + terms.map(function () { return '(lower(name) LIKE ? OR lower(value) LIKE ?)'; }).join(' OR '), [].concat.apply([], terms.map(function (t) { return ['%' + t + '%', '%' + t + '%']; })))[0].n;
          var P = A.civilProfile ? A.civilProfile() : null;
          var inp = { intervals: C && C.anc ? C.anc.intervals : [], prof: P ? { ds: P.ds, road: P.road, ground: P.ground } : null, zones: SZ ? SZ.zones : null, realAt: C && C.anc ? C.anc.realAt : null, routeSOf: C && C.anc ? C.anc.routeSOf : null,
            signRows: sc.rows, signS: signS, missingRows: SZ ? SZ.missingRows : [], advRows: SZ ? SZ.advRows : [], envHits: env, cfg: std._road_report || {} };
          var res = build(inp); A._roadReport = res;
          render(res, std);
          res.lines.forEach(function (l) { console.log('§ROAD_REPORT_LINE [' + l.sev + '] ' + l.text); });
          console.log('§ROAD_REPORT counts=' + JSON.stringify(res.counts) + ' lines=' + res.lines.length + ' anchored=' + !!(C && C.anc) + ' zones=' + (SZ ? SZ.zones.length : 0) + ' env=' + env + ' ms=' + (performance.now() - t0).toFixed(0) +
            (inp._grade ? ' gradeJudgedM=' + inp._grade.judgedStarts + ' gradeStretches=' + inp._grade.stretches.length : ''));
          return res;
        });
      });
    };
    function render(res, std) {
      var old = document.getElementById(PANEL); if (old) old.remove();
      var title = 'The Road Report — ' + (A.activeBuilding || 'model'), body = document.createElement('div'); body.style.cssText = 'font-size:12px;color:#ccc;max-height:66vh;overflow-y:auto';
      var chips = SEV.map(function (k) { return '<span class="rr-chip" data-sev="' + k + '" style="padding:1px 8px;border-radius:10px;border:1px solid ' + COL[k] + ';color:' + COL[k] + ';font-weight:700">' + k + ' ' + res.counts[k] + '</span>'; }).join(' ');
      var h = '<div class="rr-title" style="color:#4fc3f7;font-weight:700;font-size:16px">The Road Report</div><div class="rr-sub" style="color:#888;font-size:11px;margin-bottom:4px">Measured on the model \u00b7 judged by ATJ</div><div class="rr-chips" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">' + chips + '</div>' +
        '<details class="rr-why" style="margin:2px 0 4px"><summary style="cursor:pointer;color:#9ad">Why / sources</summary><div style="color:#aaa">Every line is measured on this model and judged by a cited rule: chainage drift = the model\'s chainage markers vs the drive route; grade = ' +
        esc((std._road_report || {}).grade_window_m) + ' m chords on the road profile vs the ATJ 8/86 max grade of the speed zone; sign codes vs ATJ 2A/85; missing speed signs and advance placement (ATJ 2B/85 cl.2.2.8) from the Speed zones. Drift cut-offs CRITICAL ≥ ' +
        esc(((std._road_report || {}).drift_pct || {}).critical) + '%, WARNING ≥ ' + esc(((std._road_report || {}).drift_pct || {}).warning) + '% are demo defaults (editable in Settings → std_values.json _road_report).</div></details>';
      // sections in the user's order; inside a section, lines by severity (CRITICAL first); a section opens when it has a finding
      bySection(res).forEach(function (g) {
        var ls = g.lines.slice().sort(function (x, y) { return SEV.indexOf(x.sev) - SEV.indexOf(y.sev); }), bad = ls.filter(function (l) { return l.sev === 'CRITICAL' || l.sev === 'WARNING'; }).length;
        var dots = SEV.map(function (k) { var n = ls.filter(function (l) { return l.sev === k; }).length; return n ? '<span style="color:' + COL[k] + '">' + n + '</span>' : ''; }).filter(Boolean).join(' \u00b7 ');
        h += '<details class="rr-sec" data-sec="' + g.id + '"' + '' + '><summary style="cursor:pointer;font-weight:700;font-size:13px;color:#eee;margin:8px 0 2px">' + esc(g.name) + ' <span style="font-weight:400;font-size:11px">' + dots + '</span></summary>' +
          ls.map(function (l) { var i = res.lines.indexOf(l); return '<div class="rr-line" data-i="' + i + '" data-sev="' + l.sev + '" style="margin:2px 0;padding:3px 6px;border-left:3px solid ' + COL[l.sev] + ';background:rgba(255,255,255,0.03);' + (l.s != null || l.guid ? 'cursor:pointer;' : '') + 'line-height:1.35"><b style="color:' + COL[l.sev] + ';font-size:10px">' + l.sev + '</b> ' + esc(l.text) + '</div>'; }).join('') + '</details>';
      });
      h += '<div style="display:flex;gap:6px;margin-top:8px"><button class="rr-copy" style="flex:1">Copy</button><button class="rr-dl" style="flex:1">Download .txt</button><button class="rr-pdf" style="flex:1">PDF</button></div>';
      body.innerHTML = h;
      body.addEventListener('click', function (ev) {
        var el = ev.target.closest && ev.target.closest('.rr-line');
        if (el) { var l = res.lines[+el.getAttribute('data-i')];
          if (l.s != null && A.civilGotoChainage) A.civilGotoChainage(l.s); else if (l.guid && A.focusElement) A.focusElement(l.guid);
          console.log('§ROAD_REPORT_CLICK sev=' + l.sev + ' kind=' + l.kind + ' s=' + (l.s != null ? l.s.toFixed(1) : 'NA') + ' guid=' + (l.guid || 'NA')); return; }
        var txt = toText(res, title);
        if (ev.target.closest('.rr-copy')) { try { navigator.clipboard.writeText(txt); } catch (e) {} console.log('§ROAD_REPORT_COPY chars=' + txt.length); }
        if (ev.target.closest('.rr-pdf')) { var w = window.open(URL.createObjectURL(new Blob([pdfHTML(res, std, A.activeBuilding || 'model', new Date().toISOString().slice(0, 10))], { type: 'text/html' })), '_blank'); console.log('§ROAD_REPORT_PDF opened=' + !!w); }
        if (ev.target.closest('.rr-dl')) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' })); a.download = 'Road_report_' + String(A.activeBuilding || 'model').replace(/\W+/g, '_') + '.txt'; a.click(); console.log('§ROAD_REPORT_DOWNLOAD chars=' + txt.length); }
      });
      var p = A.createPanel(PANEL, { closable: true, onClose: function () { console.log('§ROAD_REPORT closed via=close-button'); }, style: { position: 'fixed', top: '70px', right: '16px', zIndex: '1101', width: '420px', padding: '12px 14px' }, content: body });
      document.body.appendChild(p); p.style.display = '';
      A._roadReportText = toText(res, title);
    }
  }

  var api = { build: build, pdfHTML: pdfHTML, bySection: bySection, earthStretches: earthStretches, SECTIONS: SECTIONS, gradeStretches: gradeStretches, toText: toText, fmtCh: fmtCh, SEV: SEV, setupRoadReport: setupRoadReport };
  if (typeof window !== 'undefined') { window.RoadReport = api; window.setupRoadReport = setupRoadReport; }
  return api;
});
