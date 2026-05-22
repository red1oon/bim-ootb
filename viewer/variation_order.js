/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// variation_order.js — S222 Variation Order Excel with full cost engine
// Uses ExcelJS (already loaded by excel.js in viewer)
// Formulas: FIDIC Clause 12 valuation + AACE change order costing + EVM variance
//
// Cost model per change type:
//   ADDED   = Unit Rate × 1.0  (install only)
//   REMOVED = Unit Rate × 0.3  (demolition + disposal)
//   CHANGED = Unit Rate × 1.3  (remove old + add new + disruption)
//
// Total Impact = Direct Cost × (1 + Overhead% + Markup%) × (1 + Disruption%)
//
// Schedule Impact = element count / productivity (elements/day from 4D template)

// RATES, SEQUENCE_RULES, getRate(), getPhase(), getProductivity() — from rates.js

// ── Change Order Cost Multipliers (FIDIC/AACE standard, configurable) ──
var VO_CONFIG = {
  // Cost multipliers per change type
  addFactor:    1.0,   // ADDED: full install cost
  removeFactor: 0.3,   // REMOVED: demolition + disposal = 30% of install
  changeFactor: 1.3,   // CHANGED: remove + reinstall + disruption
  // Overhead, markup, disruption (FIDIC Clause 12 standard ranges)
  overheadPct:   0.10,  // 10% general conditions, site management
  markupPct:     0.15,  // 15% contractor profit
  disruptionPct: 0.05,  // 5% productivity loss per change (AACE avg)
  // Currency
  currency: 'MYR',
  usdRate: 0.21,        // MYR→USD conversion
};

function exportVariationOrder() {
  var A = window.APP;
  if (!A || !A.diffResult || !A.db || !A.diffDb) {
    alert('No diff data available');
    return;
  }
  if (typeof ExcelJS === 'undefined') {
    alert('ExcelJS not loaded');
    return;
  }

  var d = A.diffResult;
  var C = VO_CONFIG;
  var wb = new ExcelJS.Workbook();

  // ── Sheet 1: Configuration ──
  var wsConfig = wb.addWorksheet('VO Configuration');
  wsConfig.columns = [
    { header: 'Parameter', key: 'param', width: 30 },
    { header: 'Value', key: 'val', width: 20 },
    { header: 'Description', key: 'desc', width: 50 },
  ];
  wsConfig.getRow(1).font = { bold: true };
  wsConfig.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333333' } };
  wsConfig.getRow(1).font = { bold: true, color: { argb: 'FF4FC3F7' } };
  wsConfig.addRow({ param: 'Addition Factor', val: C.addFactor, desc: 'Multiplier for ADDED elements (1.0 = full install cost)' });
  wsConfig.addRow({ param: 'Removal Factor', val: C.removeFactor, desc: 'Multiplier for REMOVED elements (0.3 = demo + disposal)' });
  wsConfig.addRow({ param: 'Change Factor', val: C.changeFactor, desc: 'Multiplier for CHANGED elements (1.3 = remove + reinstall + disruption)' });
  wsConfig.addRow({ param: 'Overhead %', val: (C.overheadPct * 100) + '%', desc: 'General conditions, site management (FIDIC Clause 12)' });
  wsConfig.addRow({ param: 'Markup %', val: (C.markupPct * 100) + '%', desc: 'Contractor profit margin' });
  wsConfig.addRow({ param: 'Disruption %', val: (C.disruptionPct * 100) + '%', desc: 'Productivity loss per change (AACE standard)' });
  wsConfig.addRow({ param: 'Currency', val: C.currency, desc: 'Base currency for all rates' });
  wsConfig.addRow({ param: 'USD Rate', val: C.usdRate, desc: C.currency + ' to USD conversion' });
  wsConfig.addRow({ param: 'Rate Source', val: typeof _TRL!=='undefined'&&_TRL.rate_source||'CIDB 2024', desc: typeof _TRL!=='undefined'&&_TRL.rate_mat_source||'Malaysian CIDB N3C / BCISM Cost Book 2022-2024' });

  // Get delivery lag
  var lag = '—';
  try {
    var d1 = A.db.exec("SELECT value FROM project_metadata WHERE key='import_date'");
    var d2 = A.diffDb.exec("SELECT value FROM project_metadata WHERE key='import_date'");
    if (d1.length && d2.length) {
      var t1 = new Date(d1[0].values[0][0]);
      var t2 = new Date(d2[0].values[0][0]);
      var lagDays = Math.abs(Math.round((t2 - t1) / 86400000));
      lag = lagDays + ' days';
      wsConfig.addRow({ param: 'BIM Delivery Lag', val: lag, desc: 'Time between base and variation import — cost of waiting for updated model' });
    }
  } catch(e) { console.warn('[S227] §VO_LAG_ERR ' + e.message); }

  // ── Sheet 2: Variation Order Detail ──
  var ws = wb.addWorksheet('Variation Order');
  var _t = typeof _TRL!=='undefined' ? _TRL : {};
  ws.columns = [
    { header: _t.h_status||'Status', key: 'status', width: 12 },
    { header: 'GUID', key: 'guid', width: 38 },
    { header: _t.h_ifc_class||'IFC Class', key: 'ifcClass', width: 22 },
    { header: _t.ui_name||'Name', key: 'name', width: 28 },
    { header: _t.h_storey||'Storey', key: 'storey', width: 18 },
    { header: _t.h_discipline||'Discipline', key: 'disc', width: 10 },
    { header: (_t.h_phase||'Phase') + ' (4D)', key: 'phase', width: 16 },
    { header: (_t.h_unit_rate||'Unit Rate') + ' (' + C.currency + ')', key: 'rate', width: 14 },
    { header: 'Cost Factor', key: 'factor', width: 12 },
    { header: 'Direct Cost', key: 'direct', width: 14 },
    { header: (_t.h_total||'Total') + ' Impact', key: 'total', width: 14 },
    { header: 'Schedule (days)', key: 'days', width: 14 },
    { header: 'Old Value', key: 'oldVal', width: 26 },
    { header: 'New Value', key: 'newVal', width: 26 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4FC3F7' } };

  function getElementInfo(db, guid) {
    try {
      var r = db.exec("SELECT ifc_class, element_name, storey, discipline, material_rgba FROM elements_meta WHERE guid=?", [guid]);
      if (r.length > 0 && r[0].values.length > 0) return r[0].values[0];
    } catch(e) { console.warn('[S227] §VO_ELEM_ERR guid=' + guid + ' ' + e.message); }
    return [null, null, null, null, null];
  }

  function calcImpact(ifcClass, factor) {
    var rate = getRate(ifcClass);
    var direct = rate * factor;
    var total = direct * (1 + C.overheadPct + C.markupPct) * (1 + C.disruptionPct);
    var days = 1 / getProductivity(ifcClass);
    return { rate: rate, direct: direct, total: total, days: days };
  }

  var totalDirect = 0, totalImpact = 0, totalDays = 0;
  var addCost = 0, removeCost = 0, changeCost = 0;
  var phaseImpact = {};

  // ADDED elements
  for (var i = 0; i < d.added.length; i++) {
    var guid = d.added[i];
    var info = getElementInfo(A.diffDb, guid);
    var cls = info[0] || 'Unknown';
    var impact = calcImpact(cls, C.addFactor);
    var phase = getPhase(cls);
    totalDirect += impact.direct;
    totalImpact += impact.total;
    totalDays += impact.days;
    addCost += impact.total;
    phaseImpact[phase] = (phaseImpact[phase] || 0) + impact.days;
    ws.addRow({
      status: 'ADDED', guid: guid, ifcClass: cls, name: info[1], storey: info[2], disc: info[3],
      phase: phase, rate: impact.rate, factor: C.addFactor,
      direct: Math.round(impact.direct), total: Math.round(impact.total),
      days: +impact.days.toFixed(2),
      oldVal: '\u2014', newVal: _t.ui_vo_new||'New element'
    });
  }

  // REMOVED elements
  for (var i = 0; i < d.removed.length; i++) {
    var guid = d.removed[i];
    var info = getElementInfo(A.db, guid);
    var cls = info[0] || 'Unknown';
    var impact = calcImpact(cls, C.removeFactor);
    var phase = getPhase(cls);
    totalDirect += impact.direct;
    totalImpact += impact.total;
    totalDays += impact.days;
    removeCost += impact.total;
    phaseImpact[phase] = (phaseImpact[phase] || 0) + impact.days;
    ws.addRow({
      status: 'REMOVED', guid: guid, ifcClass: cls, name: info[1], storey: info[2], disc: info[3],
      phase: phase, rate: impact.rate, factor: '-' + C.removeFactor,
      direct: -Math.round(impact.direct), total: -Math.round(impact.total),
      days: +impact.days.toFixed(2),
      oldVal: _t.ui_vo_existed||'Existed', newVal: _t.ui_vo_demolished||'\u2014 (demolished)'
    });
  }

  // CHANGED elements
  for (var i = 0; i < d.changed.length; i++) {
    var guid = d.changed[i];
    var info1 = getElementInfo(A.db, guid);
    var info2 = getElementInfo(A.diffDb, guid);
    var cls = info2[0] || info1[0] || 'Unknown';
    var impact = calcImpact(cls, C.changeFactor);
    var phase = getPhase(cls);
    totalDirect += impact.direct;
    totalImpact += impact.total;
    totalDays += impact.days;
    changeCost += impact.total;
    phaseImpact[phase] = (phaseImpact[phase] || 0) + impact.days;
    var changes = [];
    if (info1[1] !== info2[1]) changes.push('name: ' + (info1[1]||'') + ' \u2192 ' + (info2[1]||''));
    if (info1[2] !== info2[2]) changes.push('storey: ' + (info1[2]||'') + ' \u2192 ' + (info2[2]||''));
    if (info1[4] !== info2[4]) changes.push('material: ' + (info1[4]||'') + ' \u2192 ' + (info2[4]||''));
    ws.addRow({
      status: 'CHANGED', guid: guid, ifcClass: cls, name: info2[1] || info1[1], storey: info2[2] || info1[2], disc: info2[3] || info1[3],
      phase: phase, rate: impact.rate, factor: C.changeFactor,
      direct: Math.round(impact.direct), total: Math.round(impact.total),
      days: +impact.days.toFixed(2),
      oldVal: changes.map(function(c) { return c.split(' \u2192 ')[0]; }).join('; ') || 'see props',
      newVal: changes.map(function(c) { return c.split(' \u2192 ')[1]; }).join('; ') || 'modified',
    });
  }

  // Color-code status
  ws.eachRow(function(row, idx) {
    if (idx === 1) return;
    var s = row.getCell(1).value;
    if (s === 'ADDED') row.getCell(1).font = { color: { argb: 'FF44CC44' }, bold: true };
    else if (s === 'REMOVED') row.getCell(1).font = { color: { argb: 'FFCC4444' }, bold: true };
    else if (s === 'CHANGED') row.getCell(1).font = { color: { argb: 'FFCCCC44' }, bold: true };
  });

  // ── Sheet 3: Executive Summary ──
  var wsSummary = wb.addWorksheet('Executive Summary');
  wsSummary.columns = [
    { header: 'Metric', key: 'metric', width: 35 },
    { header: 'Value', key: 'val', width: 25 },
    { header: 'Notes', key: 'notes', width: 50 },
  ];
  wsSummary.getRow(1).font = { bold: true };
  wsSummary.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4FC3F7' } };

  wsSummary.addRow({ metric: 'Variation Order', val: (A.activeBuilding || 'Import'), notes: 'Auto-generated from IFC diff — ' + new Date().toISOString().split('T')[0] });
  wsSummary.addRow({});

  // EVM metrics
  wsSummary.addRow({ metric: '── SCOPE ──', val: '', notes: '' });
  wsSummary.addRow({ metric: 'Elements Added', val: d.added.length, notes: 'New elements in variation (green)' });
  wsSummary.addRow({ metric: 'Elements Removed', val: d.removed.length, notes: 'Demolished elements (red)' });
  wsSummary.addRow({ metric: 'Elements Changed', val: d.changed.length, notes: 'Modified properties (yellow)' });
  wsSummary.addRow({ metric: 'Total Affected', val: d.added.length + d.removed.length + d.changed.length, notes: 'Total scope change' });
  wsSummary.addRow({ metric: 'BIM Delivery Lag', val: lag, notes: 'Time between model versions — cost of delayed information' });
  wsSummary.addRow({});

  // Cost
  var usd = function(myr) { return Math.round(myr * C.usdRate); };
  wsSummary.addRow({ metric: '── COST IMPACT (5D) ──', val: '', notes: 'FIDIC Clause 12 valuation + AACE change order costing' });
  wsSummary.addRow({ metric: 'Addition Cost', val: C.currency + ' ' + Math.round(addCost).toLocaleString(), notes: d.added.length + ' elements × unit rate × ' + C.addFactor + ' (USD ' + usd(addCost).toLocaleString() + ')' });
  wsSummary.addRow({ metric: 'Removal Cost', val: C.currency + ' ' + Math.round(removeCost).toLocaleString(), notes: d.removed.length + ' elements × unit rate × ' + C.removeFactor + ' (demo+disposal) (USD ' + usd(removeCost).toLocaleString() + ')' });
  wsSummary.addRow({ metric: 'Change Cost', val: C.currency + ' ' + Math.round(changeCost).toLocaleString(), notes: d.changed.length + ' elements × unit rate × ' + C.changeFactor + ' (remove+reinstall) (USD ' + usd(changeCost).toLocaleString() + ')' });
  wsSummary.addRow({ metric: 'Net Direct Cost', val: C.currency + ' ' + Math.round(totalDirect).toLocaleString(), notes: 'Before overhead and markup' });
  wsSummary.addRow({ metric: 'Total Impact (with O&P)', val: C.currency + ' ' + Math.round(totalImpact).toLocaleString(), notes: 'Direct × (1+' + (C.overheadPct*100) + '%OH+' + (C.markupPct*100) + '%Markup) × (1+' + (C.disruptionPct*100) + '%Disruption) = USD ' + usd(totalImpact).toLocaleString() });
  wsSummary.addRow({});

  // Schedule
  wsSummary.addRow({ metric: '── SCHEDULE IMPACT (4D) ──', val: '', notes: 'Based on CIDB productivity rates (elements/day)' });
  wsSummary.addRow({ metric: 'Total Additional Days', val: totalDays.toFixed(1) + ' days', notes: 'Across all phases (parallel work reduces calendar impact)' });
  var phases = Object.entries(phaseImpact).sort(function(a,b) { return b[1]-a[1]; });
  for (var p = 0; p < phases.length; p++) {
    wsSummary.addRow({ metric: '  ' + phases[p][0], val: phases[p][1].toFixed(1) + ' days', notes: 'Can run parallel with other phases' });
  }
  wsSummary.addRow({});

  // Formulas reference
  wsSummary.addRow({ metric: '── FORMULAS ──', val: '', notes: '' });
  wsSummary.addRow({ metric: 'Direct Cost', val: 'Rate × Factor', notes: 'ADD=1.0×, REMOVE=0.3×, CHANGE=1.3×' });
  wsSummary.addRow({ metric: 'Total Impact', val: 'Direct × (1+OH+Markup) × (1+Disruption)', notes: 'FIDIC Clause 12 + AACE change order standard' });
  wsSummary.addRow({ metric: 'Schedule Days', val: 'Count / Productivity', notes: '4D template: elements per crew per day' });
  wsSummary.addRow({ metric: 'Cost Variance (CV)', val: 'EV - AC', notes: 'PMI Earned Value: positive = under budget' });
  wsSummary.addRow({ metric: 'Schedule Variance (SV)', val: 'EV - PV', notes: 'PMI Earned Value: positive = ahead of schedule' });
  wsSummary.addRow({ metric: 'CPI', val: 'EV / AC', notes: '>1 = good, <1 = over budget' });
  wsSummary.addRow({ metric: 'SPI', val: 'EV / PV', notes: '>1 = ahead, <1 = behind schedule' });

  // Bold section headers
  wsSummary.eachRow(function(row, idx) {
    if (idx === 1) return;
    var m = row.getCell(1).value || '';
    if (m.startsWith('\u2500\u2500') || m.startsWith('──')) {
      row.font = { bold: true, color: { argb: 'FF4FC3F7' } };
    }
  });

  // Download
  wb.xlsx.writeBuffer().then(function(buf) {
    var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'VO_' + (A.activeBuilding || 'import') + '_' + new Date().toISOString().split('T')[0] + '.xlsx';
    a.click();
    URL.revokeObjectURL(a.href);
    console.log('[S222] §VO_EXPORT rows=' + (d.added.length + d.removed.length + d.changed.length) +
      ' total_impact=' + C.currency + Math.round(totalImpact) +
      ' schedule=' + totalDays.toFixed(1) + 'days');
  });
}
