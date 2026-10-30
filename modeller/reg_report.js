// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// reg_report.js — the Regulatory Report (prompts/DXF2BIM_ARCHITECT_REVIEW.md RR / RR.5): one self-contained HTML page of the FACTS of a model, for a user to attach
// to a submission. A COMPOSER: every number is handed in by its owner (LoadSummary.compute, Dxf2Bill.bill, structural_sanity / egress_sanity + RuleReport.codesAndCoverage,
// the defaults table, the importer); this file only lays them out and words the verdicts (PASS / FINDINGS n / INCONCLUSIVE / NOT STATED — never "compliant").
// The one measure it takes itself is a slab's plan area, through the measures function it is handed (Dxf2Bill.measures). Log tag §REG_REPORT.
// RR.6: fromModel / billAndLoad / statedType are the CLI's and the Modeller page's (reg_report_ui.js) ONE path to the page — neither keeps its own copy.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RegReport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function num(v, dp) { var n = Number(v); return isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0 }) : '-'; }
  function stated(v) { return v !== undefined && v !== null && String(v).trim() !== ''; }
  // the facts a model cannot give (RR research): stated by the user, else "not stated"
  var FACTS = [['plot_area_m2', 'Plot area (m2)'], ['setbacks', 'Setbacks'], ['occupancy', 'Occupancy / use'], ['district', 'Site district'], ['soil_kPa', 'Soil bearing capacity (kPa, from a soil report)'],
    ['live_load', 'Live load'], ['wind', 'Wind (BNBC basic wind speed)'], ['seismic', 'Seismic zone'], ['fire_rating', 'Fire ratings'], ['ownership', 'Ownership / NOCs']];
  var VERDICT_CLASS = { PASS: 'ok', INCONCLUSIVE: 'inc', 'NOT STATED': 'inc', STATED: 'ok' };

  // rules: { structural: {rows, cov}, egress: {rows, cov}, byName: {rule: {basis}} } -> verdict + table rows
  function ruleSection(set, byName) {
    var cov = (set && set.cov) || {}, rows = (set && set.rows) || [], names = Object.keys(cov).sort(), ran = 0, fnd = 0;
    var tr = names.map(function (k) { var c = cov[k], n = rows.filter(function (r) { return r.rule === k; }).length, b = (byName[k] || {}).basis || null;
      if (c.state === 'ran') { ran++; fnd += n; }
      var basis = !b ? 'basis not stated' : b.code ? b.code + (b.edition ? ' ' + b.edition : '') + (b.clause ? ' ' + b.clause : '') : b.kind ? b.kind + (b.note ? ': ' + b.note : '') :
        Object.keys(b).map(function (f) { var x = b[f] || {}; return f + ': ' + (x.code ? x.code + (x.clause ? ' ' + x.clause : '') : (x.kind || '') + (x.note ? ' ' + x.note : '')); }).join('; ');
      var st = c.state === 'ran' ? (n ? 'FINDINGS ' + n : 'PASS') : c.state === 'nothing_to_judge' ? 'INCONCLUSIVE (nothing to judge' + (c.of ? ': no ' + c.of : '') + ')' : c.state === 'not_applicable' ? 'not for this building type' : 'not checkable' + (c.reason ? ': ' + c.reason : '');
      return [k, st, c.judged != null ? c.judged : '-', basis]; });
    var v = ran === 0 ? 'INCONCLUSIVE' : fnd ? 'FINDINGS ' + fnd : 'PASS';
    return { verdict: v, ran: ran, total: names.length, findings: fnd, rows: tr };
  }
  function table(head, rows) { return '<table><tr>' + head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr>' + rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>'; }
  function badge(v) { var k = VERDICT_CLASS[v] || (/^FINDINGS/.test(v) ? 'bad' : /^INCONCLUSIVE/.test(v) ? 'inc' : 'inc'); return '<span class="v v-' + k + '">' + esc(v) + '</span>'; }

  function compose(inp) {
    var I = inp.identity || {}, F = inp.facts || {}, S = [], verdicts = {}, log = [];
    var add = function (id, title, verdict, source, body) { S.push({ id: id, title: title, verdict: verdict, source: source, body: body }); verdicts[id] = verdict; };
    // 1 identification
    add('identity', '1. Identification and scope', 'STATED', 'the importer + this export',
      table(['Item', 'Value'], [['Drawing set', I.set || 'not stated'], ['Sheets read', (I.sheets || []).join(', ') || '-'], ['Building type', inp.buildingType || 'not stated'], ['Model file (SHA-256)', I.modelSha256 || 'no model file written'],
        ['Tool', I.tool || '-'], ['Report date', I.date || '-'], ['Rate pack', (I.pack || '-') + (I.packSource ? ' — ' + I.packSource : '')]]) +
      '<p class="note">This report states facts of the model and the checks that ran on it. It is not a compliance certificate: only the codes named below were judged, and only where a rule had something to judge.</p>' +
      table(['Role', 'Name', 'Licence / registration no.', 'Signature'], [['Architect', '', '', ''], ['Structural engineer', '', '', ''], ['Geotechnical engineer', '', '', '']]));
    // 2 areas and heights
    var meas = inp.measures, bodies = inp.bodies || [], st = (inp.storeys || []).slice().sort(function (a, b) { return a.level - b.level; });
    var top = bodies.reduce(function (m, b) { var z = (b.vertices || []).reduce(function (q, v) { return Math.max(q, v[2]); }, -Infinity); return Math.max(m, z); }, -Infinity);
    var ext = (function () { var lo = [Infinity, Infinity], hi = [-Infinity, -Infinity]; bodies.forEach(function (b) { (b.vertices || []).forEach(function (v) { for (var i = 0; i < 2; i++) { if (v[i] < lo[i]) lo[i] = v[i]; if (v[i] > hi[i]) hi[i] = v[i]; } }); }); return [hi[0] - lo[0], hi[1] - lo[1]]; })();
    var gfa = 0, measured = 0, stRows = (st.length ? st : [{ name: '(no storey)', level: 0 }]).map(function (s) {
      var sl = bodies.filter(function (b) { return b['class'] === 'IfcSlab' && (st.length ? b.storey === s.name : true); }), a = sl.reduce(function (q, b) { return q + (meas ? meas(b).A : 0); }, 0);
      if (sl.length) { gfa += a; measured++; }
      return [s.name, num(s.level, 3), sl.length ? num(a, 2) + ' m2 (' + sl.length + ' slab' + (sl.length > 1 ? 's' : '') + ')' : 'no floor slab modelled: floor area not measured'];
    });
    var pa = Number(F.plot_area_m2), haveArea = measured > 0;
    add('areas', '2. Areas and heights', haveArea ? 'STATED' : 'INCONCLUSIVE', 'storeys from the drawing set; floor area = plan area of the IfcSlab bodies on each storey (largest face of the mesh)',
      table(['Storey', 'Level (m)', 'Floor area'], stRows) +
      table(['Item', 'Value'], [['Total floor area (slabs)', haveArea ? num(gfa, 2) + ' m2' : 'not measured'], ['Outer extent of the model (not a floor area)', num(ext[0], 2) + ' x ' + num(ext[1], 2) + ' m'],
        ['Height (top of the highest body above level 0)', isFinite(top) ? num(top, 3) + ' m' : '-'],
        ['Plot ratio / ground coverage', stated(F.plot_area_m2) && isFinite(pa) && pa > 0 && haveArea ? 'plot ratio ' + num(gfa / pa, 2) + ' (floor area / stated plot area ' + num(pa, 2) + ' m2)' : 'not stated (needs the plot area)']]));
    // 3 / 4 rule checks
    var R = inp.rules || {}, by = R.byName || {}, eg = ruleSection(R.egress, by), sr = ruleSection(R.structural, by), cc = R.codes || {};
    var codeLine = '<p class="note">Judged against: ' + esc((cc.codes && cc.codes.length) ? cc.codes.join(', ') : 'no cited code') + ' · overlay: ' + esc(cc.overlay || 'none') + ' · building type: ' + esc(inp.buildingType || 'not stated') + '. Rules ' + (cc.total || 0) + ': ' + (cc.n ? cc.n.ran || 0 : 0) + ' ran.</p>';
    add('egress', '3. Egress checks', eg.verdict, 'egress_sanity.js with viewer/rates/egress_rules.json (basis per rule)', codeLine + table(['Rule', 'Result', 'Judged', 'Basis'], eg.rows));
    add('structural', '4. Structural checks', sr.verdict, 'structural_sanity.js with viewer/rates/structural_rules.json (basis per rule)', table(['Rule', 'Result', 'Judged', 'Basis'], sr.rows));
    // 4b dead load
    var L = inp.loadSummary;
    if (L) {
      var asm = (L.rows || []).filter(function (r) { return r.assumed; }).length;
      add('deadload', '5. Dead load (own weight)', L.unweighed ? 'FINDINGS ' + L.unweighed + ' unweighed' : 'STATED', 'load_summary.js (BNBC 2012 Part 6 Ch 2 unit weights, modeller/reference/)',
        table(['Item', 'Value'], [['Own weight weighed', num(L.total_kN, 1) + ' kN (' + num(L.tonnes, 1) + ' t), ' + L.weighed + ' parts'], ['Parts not weighed', L.unweighed + (L.unweighed ? ' (see below)' : '')], ['Members weighed from an assumed section', String(asm)]]) +
        table(['Part', 'Material', 'Count', 'Weight (kN)'], (L.groups || []).map(function (g) { return [g.cls, g.material, g.n, g.missing ? 'not weighed: ' + g.missing : num(g.kN, 2)]; })) +
        ((L.missing || []).length ? '<p class="note">Missing inputs: ' + esc(L.missing.map(function (m) { return m.what + (m.n > 1 ? ' x' + m.n : ''); }).join('; ')) + '</p>' : ''));
      var soil = Number(F.soil_kPa), fp = (L.footings || []).map(function (f) { return { kN: f.kN, kPa: f.area > 0 ? f.kN / f.area : NaN }; }), mx = fp.reduce(function (m, f) { return f.kN > m.kN ? f : m; }, { kN: -1, kPa: NaN });
      var hasSoil = stated(F.soil_kPa) && isFinite(soil) && soil > 0, maxP = fp.reduce(function (m, f) { return isFinite(f.kPa) && f.kPa > m ? f.kPa : m; }, 0);
      add('foundations', '6. Foundation loads (dead load only)', !fp.length ? 'INCONCLUSIVE' : hasSoil ? (maxP > soil ? 'FINDINGS 1' : 'PASS') : 'NOT STATED', 'load_summary.js: each weighed body to the nearest footing in plan',
        table(['Item', 'Value'], [['Footings', String(fp.length)], ['Load to footings', num(L.toFootings_kN, 1) + ' kN'], ['Heaviest footing', fp.length ? num(mx.kN, 1) + ' kN' : '-'], ['Highest pressure (dead load / footing plan area)', fp.length ? num(maxP, 1) + ' kPa' : '-'],
          ['Soil bearing capacity', hasSoil ? num(soil, 1) + ' kPa (stated); highest pressure / capacity = ' + num(maxP / soil, 2) : 'not stated (needs a soil report)'], ['Live / wind / seismic', 'not included (needs BNBC Sec 2.3-2.5 inputs)']]));
    }
    // 6 BOQ
    var B = inp.bill;
    if (B) {
      var srcs = {}; (B.lines || []).forEach(function (l) { if (l.rate_source && l.rate_source.item) srcs[l.rate_source.item] = (l.pack_desc || '') + ' — ' + l.rate + ' ' + (B.currency || '') + '/' + l.unit + ', ' + l.rate_source.doc + ' p.' + l.rate_source.page + ', ' + l.rate_source.column; });
      var unpriced = (B.lines || []).filter(function (l) { return !(l.amount > 0); }).length, T = B.totals || {};
      add('boq', '7. Bill of quantities', unpriced ? 'FINDINGS ' + unpriced + ' unpriced' : 'STATED', 'dxf2bill.js: quantity = the stated formula over the mesh; rate = the pack row for class + material, else the class rate',
        table(['Item', 'Value'], [['Total', num(T.amount, 0) + ' ' + (B.currency || '')], ['Drawn / derived / assumed', ['drawn', 'derived', 'assumed'].map(function (k) { return num((T.by_prov || {})[k] || 0, 0); }).join(' / ')], ['Lines', String((B.lines || []).length)], ['Lines priced 0 (flagged)', String(unpriced)]]) +
        table(['Class', 'Amount'], Object.keys(T.by_class || {}).sort().map(function (k) { return [k, num(T.by_class[k], 0)]; })) +
        table(['SoR item', 'Rate used'], Object.keys(srcs).sort().map(function (k) { return [k, srcs[k]]; })) +
        ((B.excluded || []).length ? '<p class="note">NOT PRICED: ' + esc(B.excluded.map(function (x) { return x.material + ': ' + x.what + ' (' + x.lines + ' lines)'; }).join('; ')) + '</p>' : ''));
    }
    // 7 model quality
    var byCls = {}; bodies.forEach(function (b) { byCls[b['class']] = (byCls[b['class']] || 0) + 1; });
    var noSt = bodies.filter(function (b) { return !stated(b.storey); }).length, prox = byCls.IfcBuildingElementProxy || 0, C = inp.cli || {};
    add('quality', '8. Model quality', prox || noSt || C.left_out ? 'FINDINGS ' + (prox + noSt + (C.left_out || 0)) : 'PASS', 'the importer (bodies, left out) and the rule coverage',
      table(['Item', 'Value'], [['Bodies', String(bodies.length)], ['By class', Object.keys(byCls).sort().map(function (k) { return k + ' ' + byCls[k]; }).join(', ')], ['Unclassified (IfcBuildingElementProxy)', String(prox)],
        ['Bodies without a storey', String(noSt)], ['Drawn shapes left out by the importer', C.left_out != null ? String(C.left_out) : '-'], ['Rules that ran / had nothing to judge', (cc.n ? (cc.n.ran || 0) + ' / ' + (cc.n.nothing_to_judge || 0) : '-')]]));
    // 8 assumptions
    var used = (inp.defaults_table || []).filter(function (r) { return r.used; });
    add('assumptions', '9. Assumptions and facts not stated', used.some(function (r) { return r.source === 'default' && r.kind === 'guess'; }) ? 'INCONCLUSIVE' : 'STATED', 'the defaults table (element_defaults.json + the drawing\'s @DEFAULT + the user\'s choices)',
      table(['Setting', 'Value', 'Tier', 'Basis'], used.map(function (r) { return [r.key, String(r.value) + (r.unit && r.unit !== 'text' ? ' ' + r.unit : ''), /^(file|sheet|choice)$/.test(r.source) ? 'stated' : r.kind === 'std' ? 'standard (cited)' : 'best effort — confirm', r.basis_in_force || r.basis || '']; })) +
      table(['Fact', 'Value'], FACTS.map(function (f) { return [f[1], stated(F[f[0]]) ? String(F[f[0]]) + ' (stated by the user)' : 'not stated']; })));
    var css = 'body{font:13px/1.45 system-ui,sans-serif;margin:24px;color:#1b1b1b}h1{font-size:20px}h2{font-size:15px;margin:22px 0 4px}table{border-collapse:collapse;margin:6px 0;width:100%}th,td{border:1px solid #ccc;padding:3px 6px;text-align:left;vertical-align:top}th{background:#f2f2f2}.src{color:#666;font-size:11px}.note{color:#444}.v{padding:1px 7px;border-radius:9px;font-size:11px;font-weight:600}.v-ok{background:#dff3e3}.v-bad{background:#fde2e1}.v-inc{background:#fff2c6}@media print{body{margin:10mm}}';
    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Regulatory Report — ' + esc(I.set || 'model') + '</title><style>' + css + '</style></head><body><h1>Regulatory Report — facts of the model</h1>' +
      '<p class="src">' + esc(I.set || '') + ' · ' + esc(I.date || '') + ' · verdict words: PASS = rules ran, no findings · FINDINGS n · INCONCLUSIVE = nothing was judged · NOT STATED = needs a fact from you</p>' +
      S.map(function (s) { return '<section id="rr-' + s.id + '"><h2>' + esc(s.title) + ' ' + badge(s.verdict) + '</h2><div class="src">Source: ' + esc(s.source) + '</div>' + s.body + '</section>'; }).join('') + '</body></html>';
    log.push('§REG_REPORT sections=' + S.length + ' verdicts=' + S.map(function (s) { return s.id + ':' + s.verdict.replace(/ /g, '_'); }).join(','));
    return { html: html, sections: S, verdicts: verdicts, log: log };
  }
  // T13.5: the type counts as stated only when a file/sheet/editor choice gave it, never the registry default or a type override
  function statedType(R) { var r = ((R && R.defaults_table) || []).filter(function (x) { return x.key === 'building.type'; })[0]; return r && /^(file|sheet|choice)$/.test(r.source) ? String(r.value) : null; }
  // T14b: the defaults in force (values + where each came from) and each body's weight from load_summary.js (the one owner of a body's weight) feed the bill rows that
  // state a quantity formula. o: { LS (LoadSummary), BL (Dxf2Bill), ref (synthetic_ref.json), pack (the pack JSON), packName }. No pack or no bodies -> both null.
  function billAndLoad(els, defaultsTable, o) {
    if (!o.pack || !els || !els.length) return { bill: null, loadSummary: null };
    var values = {}, sources = {}; (defaultsTable || []).forEach(function (r) { values[r.key] = r.value; sources[r.key] = r.source; });
    var LS = o.LS.compute(els, { values: values, sources: sources }), weights = {}, assumed = {};
    LS.rows.forEach(function (r) { if (r.kN != null && isFinite(r.kN)) weights[r.guid] = r.kN; if (r.assumed) assumed[r.guid] = r.sectionFrom; });
    return { loadSummary: LS, bill: o.BL.bill(els, { ref: o.ref, pack: o.pack, packName: o.packName, weights: weights, assumed: assumed, values: values, sources: sources }) };
  }
  // §D98: the set line. The placeholder a set gets when no sheet names it never counts as stated: alone it reads "not stated (placeholder …)", beside a real name it is dropped.
  function setLine(sets, placeholder) {
    var u = (sets || []).filter(function (x, i, a) { return x && a.indexOf(x) === i; }), real = u.filter(function (x) { return !placeholder || x !== placeholder; });
    return real.length ? real.join(' / ') : u.length ? 'not stated (placeholder ' + placeholder + ')' : null;
  }
  function today(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  // RR.5/RR.6 the ONE composition the CLI and the Modeller page both run: model IFC bytes -> the shipped extractor (sql.js) -> the shipped rule engines + RuleReport -> compose.
  // e: { ifcBytes, WebIFC, ifcApi (initialised), SQL (the sql.js module), Core (ifc_extract_core), SR, ER (rule files), SS, ES, RRp (engines), R (the converted run),
  //      bill, loadSummary, measures, facts, sets (the drawings' @SET values), setPlaceholder (Dxf2Suggest.SET_PLACEHOLDER, §D98), sheets (names), date, tool, packJ, sha256 (bytes -> hex, may be async), leftOut, buildingName, log }
  async function fromModel(e) {
    var say = e.log || function () {}, db = new e.SQL.Database();
    try {
      await e.Core.extractToDb({ WebIFC: e.WebIFC, ifcApi: e.ifcApi, ifcData: e.ifcBytes, db: e.Core.sqljsDb(db), Buf: e.Core.browserBuf, buildingName: e.buildingName || 'MODEL', sourceName: 'model.ifc', log: function () {} });
      var q = function (sql, p) { var r = p ? db.exec(sql, p) : db.exec(sql); return r.length ? r[0].values : []; };
      var bt = (q("SELECT value FROM project_metadata WHERE key='building_type'")[0] || [])[0] || null;
      var covS = {}, covE = {}, rlog = function (m) { if (/§RULE_COVERAGE|§RULE_APPLIES/.test(m)) say(m); };
      var rs = e.SS.evaluate(q, e.SR, { log: rlog, coverage: covS }), re = e.ES.evaluate(q, e.ER, { log: rlog, coverage: covE });
      rs = e.RRp.applyTypes('structural_rules', e.SR, rs, covS, bt, rlog); re = e.RRp.applyTypes('egress_rules', e.ER, re, covE, bt, rlog);
    } finally { db.close(); }
    var byName = {}; [].concat(e.SR.structural_rules, e.ER.egress_rules).forEach(function (r) { if (r && r.name) byName[r.name] = r; });
    var codes = e.RRp.codesAndCoverage({ structural_rules: e.SR.structural_rules, egress_rules: e.ER.egress_rules }, Object.assign({}, covS, covE), { type: bt });
    var pack = e.bill && e.bill.pack, pj = pack ? e.packJ : null, R = e.R || {};
    return compose({
      identity: { set: setLine(e.sets, e.setPlaceholder), sheets: e.sheets || [], date: e.date, tool: e.tool, modelSha256: await e.sha256(e.ifcBytes), pack: pack, packSource: pj && pj.meta ? (pj.meta.material_rates_note || pj.meta.source || '') : '' },
      buildingType: bt, facts: e.facts || {}, storeys: R.ST || [], bodies: R.els || [], measures: e.measures, loadSummary: e.loadSummary, bill: e.bill,
      rules: { structural: { rows: rs, cov: covS }, egress: { rows: re, cov: covE }, byName: byName, codes: codes }, cli: { left_out: e.leftOut != null ? e.leftOut : null }, defaults_table: R.defaults_table || [] });
  }
  return { compose: compose, ruleSection: ruleSection, FACTS: FACTS, statedType: statedType, billAndLoad: billAndLoad, fromModel: fromModel, today: today, setLine: setLine };
});
