// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HR_BIM_ASSET → VIEWER PAYSLIP PANE (RESUME_HR_BIM_ASSET.md §CRITICAL "Compile not Model",
//   P7). An EXTRA, ADDITIVE pane mirroring hba_dashboard.js's pattern — NOT a change to the rest of the viewer.
//   ADDITIVE + HOST-INJECTED: imports NOTHING from viewer internals; the host hands it `A` (APP). Renders
//   `hr_bim_asset/ad_payroll.js`'s payslip() reader (native hr_process/hr_movement compile, P7-PRE) — no new
//   schema, this is the VIEW on the already-witnessed compile layer. ZERO-IMPACT: OFF = no DOM (pixel-
//   identical); toggle ON mounts ONE fixed overlay; toggle OFF removes it (zero residue). It never touches the
//   3D scene, other panels, or sw.js. Data source = host-injected A._hbaPayrollSpec (seeded from
//   ad_payroll.demoSpec() by hba_lens.js — payroll identity has no spatial binding to check, unlike
//   Occupancy/Asset); honest empty when none. Read the log after run.
(function () {
  'use strict';
  var G = (typeof self !== 'undefined' ? self : this);
  var _pane = null, _sel = null;

  function deps() { return { AD: G.HbaAdPayroll }; }
  function ready() { return !!(deps().AD && typeof document !== 'undefined'); }

  // the spec driving this pane — host-injected (per-building demo employees) or honestly absent (no fallback
  // invention here: dataFor/detect both key off the SAME A._hbaPayrollSpec, so "no spec" means "no pane").
  function spec(A) { return (A && A._hbaPayrollSpec) || null; }
  function runFor(A) { var sp = spec(A); return sp ? deps().AD.runPeriod(sp) : null; }

  // is there payroll data to show? (the data-gate the pill/drawer entry uses.)
  function detect(A) { var sp = spec(A); return !!(ready() && sp && sp.employees && sp.employees.length); }

  function el(tag, css, txt) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; }

  // render ONE employee's payslip into `body` (called fresh on mount and on every employee re-select).
  function renderSlip(body, run, sp, empId) {
    var slip = deps().AD.payslip(run.hr_movement, empId, sp.locale || 'en');
    body.appendChild(el('div', 'background:#fff8e1;color:#a06b00;font-weight:700;letter-spacing:1px;font-size:11px;padding:4px 0;', slip._watermark));
    var kp = el('div', 'display:flex;gap:8px;padding:6px 0;flex-wrap:wrap;');
    [['Gross', slip.gross], ['Net', slip.net]].forEach(function (k) {
      var c = el('div', 'background:#f4f5f7;border-radius:6px;padding:6px 10px;min-width:70px;');
      c.appendChild(el('div', 'font-size:18px;font-weight:700;color:#102a43;', String(k[1])));
      c.appendChild(el('div', 'font-size:10px;color:#627d98;text-transform:uppercase;', k[0]));
      kp.appendChild(c);
    });
    body.appendChild(kp);
    var tbl = el('table', 'width:100%;border-collapse:collapse;font-size:12px;');
    slip.lines.forEach(function (l) {
      var tr = el('tr', 'border-top:1px solid #eee;');
      tr.appendChild(el('td', 'padding:4px 2px;', l.name));
      tr.appendChild(el('td', 'padding:4px 2px;text-align:right;color:' + (l.accountsign === '+' ? '#2e7d32' : '#c62828') + ';', (l.accountsign === '+' ? '+' : '-') + l.amount));
      tbl.appendChild(tr);
      var trace = el('tr', '');
      var td2 = el('td', 'padding:0 2px 6px;color:#627d98;font-size:10px;', l.trace); td2.colSpan = 2;
      trace.appendChild(td2); tbl.appendChild(trace);
    });
    body.appendChild(tbl);
    return slip;
  }

  // remount with a NEW employee selection — simplest re-render that keeps the stub-DOM-safe append-only
  // pattern (no innerHTML clearing, matching hba_dashboard.js's own "mount replaces the whole pane" style).
  function reselect(A, empId) { _sel = empId; unmount(true); mount(A); }

  function mount(A) {
    var sp = spec(A), run = runFor(A);
    if (!sp || !run) return false;
    if (_sel == null || !sp.employees.some(function (e) { return e.c_bpartner_id === _sel; })) _sel = sp.employees[0].c_bpartner_id;
    var pane = el('div', 'position:fixed;top:54px;right:12px;width:340px;max-height:82vh;overflow:auto;z-index:10050;' +
      'background:#fff;border-radius:10px;box-shadow:0 6px 24px #0005;font-family:system-ui,sans-serif;color:#222;');
    pane.id = 'hba-payslip-pane';
    var head = el('div', 'display:flex;justify-content:space-between;align-items:center;background:#102a43;color:#fff;padding:10px 12px;border-radius:10px 10px 0 0;');
    head.appendChild(el('div', 'font-size:14px;font-weight:600;', 'Payroll · Payslip (' + sp.period + ')'));
    var x = el('button', 'background:none;border:none;color:#fff;font-size:18px;cursor:pointer;line-height:1;', '×');
    x.title = 'Close'; x.addEventListener('click', function () { toggle(A); });
    head.appendChild(x); pane.appendChild(head);
    var picker = el('div', 'display:flex;gap:6px;flex-wrap:wrap;padding:10px 12px 0;');
    sp.employees.forEach(function (e) {
      var active = e.c_bpartner_id === _sel;
      var b = el('button', 'border:1px solid #dfe3e8;border-radius:6px;padding:4px 8px;font-size:12px;cursor:pointer;' +
        'background:' + (active ? '#1976d2' : '#f4f5f7') + ';color:' + (active ? '#fff' : '#222') + ';', e.name || ('#' + e.c_bpartner_id));
      b.setAttribute('data-emp', String(e.c_bpartner_id));
      b.addEventListener('click', function () { reselect(A, e.c_bpartner_id); });
      picker.appendChild(b);
    });
    pane.appendChild(picker);
    var body = el('div', 'padding:6px 12px 12px;');
    var slip = renderSlip(body, run, sp, _sel);
    pane.appendChild(body);
    (document.body || document.documentElement).appendChild(pane);
    _pane = pane;
    console.log('§HBA_PAYSLIP mounted employees=' + sp.employees.length + ' period=' + sp.period + ' selected=' + _sel + ' net=' + slip.net);
    return true;
  }

  // unmount the pane. keepSel=true (an employee re-select) leaves `_sel` intact for the immediate remount;
  // a real close (toggle) drops it so re-opening starts from the first employee again.
  function unmount(keepSel) {
    if (_pane && _pane.parentNode) _pane.parentNode.removeChild(_pane);
    else if (_pane && typeof _pane.remove === 'function') _pane.remove();
    _pane = null;
    if (!keepSel) _sel = null;
    console.log('§HBA_PAYSLIP unmounted (zero residue)');
    return false;
  }

  // toggle the pane. ON → mount; ON-again/close → unmount (full removal). Returns the new state.
  function toggle(A) {
    if (!ready()) { if (A && A.status) A.status.textContent = 'HR payroll not loaded'; return false; }
    return _pane ? unmount() : mount(A);
  }
  function isActive() { return !!_pane; }

  G.HBAPayslipPane = { toggle: toggle, detect: detect, isActive: isActive, _ready: ready, _spec: spec };
  if (typeof module === 'object' && module.exports) module.exports = G.HBAPayslipPane;
})();
