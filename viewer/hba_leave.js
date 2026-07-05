// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HR_BIM_ASSET → VIEWER LEAVE PANE (RESUME_HR_BIM_ASSET.md §RESUME NEXT — P8, Leave/Absence
//   ★★★★ T1). An EXTRA, ADDITIVE pane mirroring hba_payslip.js's pattern — NOT a change to the rest of the
//   viewer. ADDITIVE + HOST-INJECTED: imports NOTHING from viewer internals; the host hands it `A` (APP).
//   Renders `hr_bim_asset/leave.js`'s already-witnessed `summary()` reader (balance = REPLAY of the signed
//   accrue/take op-log, never a stored number) — no new schema, this is the VIEW on the compile layer.
//   ZERO-IMPACT: OFF = no DOM (pixel-identical); toggle ON mounts ONE fixed overlay; toggle OFF removes it
//   (zero residue). Data source = host-injected A._hbaLeaveSpec (seeded from leave.demoLog() by hba_lens.js —
//   leave identity has no spatial binding to check, same reasoning as Payslip); honest empty when none.
//   Read the log after run.
(function () {
  'use strict';
  var G = (typeof self !== 'undefined' ? self : this);
  var _pane = null, _sel = null;

  function deps() { return { Lv: G.HbaLeave, AD: G.HbaAdPayroll, Lens: G.HBALens }; }
  function ready() { return !!(deps().Lv && typeof document !== 'undefined'); }

  // the spec driving this pane — host-injected (per-building demo employees) or honestly absent.
  function spec(A) { return (A && A._hbaLeaveSpec) || null; }

  // is there leave data to show? (the data-gate the pill/drawer entry uses.)
  function detect(A) { var sp = spec(A); return !!(ready() && sp && sp.employees && sp.employees.length); }

  function el(tag, css, txt) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; }

  // render ONE employee's leave statement into `body` (called fresh on mount and on every employee re-select).
  function renderStatement(body, sp, empId, A) {
    var Lv = deps().Lv;
    var sum = Lv.summary(sp.log[empId] || [], empId, sp.period, sp.policy, sp.locale || 'en');
    body.appendChild(el('div', 'background:#fff8e1;color:#a06b00;font-weight:700;letter-spacing:1px;font-size:11px;padding:4px 0;', sum._watermark));
    var kp = el('div', 'display:flex;gap:8px;padding:6px 0;flex-wrap:wrap;');
    var bits = [['Taken', sum.taken], ['Unpaid', sum.unpaid]];
    Object.keys(sum.balances).sort().forEach(function (t) { bits.push([t + ' bal', sum.balances[t]]); });
    bits.forEach(function (k) {
      var c = el('div', 'background:#f4f5f7;border-radius:6px;padding:6px 10px;min-width:70px;');
      c.appendChild(el('div', 'font-size:18px;font-weight:700;color:#102a43;', String(k[1])));
      c.appendChild(el('div', 'font-size:10px;color:#627d98;text-transform:uppercase;', k[0]));
      kp.appendChild(c);
    });
    body.appendChild(kp);
    body.appendChild(el('div', 'font-size:11px;color:' + (sum.chainOk ? '#2e7d32' : '#c62828') + ';padding:2px 0 6px;',
      sum.chainOk ? '✓ signed chain verifies' : '✗ chain tamper detected'));
    // §2026-07-04 thread C — Leave ALSO surfaces as a resource-availability fact (S_ResourceUnAvailable, tab
    // 416 of window 236 "Resource" — the SAME window Dashboard already deep-links into), not just a payroll
    // line. This session is click-through only (the compile itself lives in ad_leave.js + is seeded into
    // ad_seed.db by scripts/seed_hba_erp.js) — an honest no-link when the employee has no resolved S_Resource
    // (A._hbaEmpResourceMap absent/ungoverned), never a fabricated id.
    var d0 = deps();
    var rid = A && A._hbaEmpResourceMap ? A._hbaEmpResourceMap[empId] : null;
    if (rid != null && d0.Lens && d0.Lens.erpLink) {
      var ra = document.createElement('a');
      ra.href = d0.Lens.erpLink(d0.Lens.AD_WINDOWS.RESOURCE, rid);
      ra.target = '_blank'; ra.rel = 'noopener'; ra.textContent = 'Resource ↗';
      ra.title = 'Open ' + empId + ' as a Resource (Unavailability tab shows leave-driven blackouts)';
      ra.style.cssText = 'display:inline-block;color:#1976d2;text-decoration:none;font-size:11px;padding-bottom:4px;';
      body.appendChild(ra);
    }
    var tbl = el('table', 'width:100%;border-collapse:collapse;font-size:12px;');
    // §P11 — Leave has NO native AD table of its own (verified §CRITICAL P8 finding) — an unpaid entry's
    // REAL AD identity is the "Leave without pay" pay-element it feeds INTO (ad_payroll.js CONCEPTS.UNPAID_LEAVE,
    // hr_concept_id), not a fabricated leave-record window. Only entries that actually carry unpaid days get
    // the link — an honest reflection of "this is what would post to payroll", not every row.
    var d = deps(), concept = d.AD && d.AD.CONCEPTS && d.AD.CONCEPTS.UNPAID_LEAVE;
    sum.entries.forEach(function (r) {
      var tr = el('tr', 'border-top:1px solid #eee;');
      tr.appendChild(el('td', 'padding:4px 2px;', r.period + ' · ' + r.type));
      tr.appendChild(el('td', 'padding:4px 2px;text-align:right;', r.days + 'd'));
      tr.appendChild(el('td', 'padding:4px 2px;text-align:right;color:' + (r.unpaidDays > 0 ? '#c62828' : '#627d98') + ';',
        r.unpaidDays > 0 ? (r.unpaidDays + 'd unpaid') : 'paid'));
      var linkTd = el('td', 'padding:4px 2px;text-align:right;');
      if (r.unpaidDays > 0 && concept && d.Lens && d.Lens.erpLink) {
        var a = document.createElement('a');
        a.href = d.Lens.erpLink(d.Lens.AD_WINDOWS.PAYROLL_CONCEPT, concept.hr_concept_id);
        a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'open ↗';
        a.title = 'Open the native "Leave without pay" payroll concept this feeds';
        a.style.cssText = 'color:#1976d2;text-decoration:none;font-size:11px;';
        linkTd.appendChild(a);
      }
      tr.appendChild(linkTd);
      tbl.appendChild(tr);
    });
    body.appendChild(tbl);
    return sum;
  }

  // remount with a NEW employee selection (same append-only pattern as hba_payslip.js — no innerHTML clearing).
  function reselect(A, empId) { _sel = empId; unmount(true); mount(A); }

  function mount(A) {
    var sp = spec(A);
    if (!sp) return false;
    if (_sel == null || !sp.employees.some(function (e) { return e.id === _sel; })) _sel = sp.employees[0].id;
    var pane = el('div', 'position:fixed;top:54px;right:12px;width:340px;max-height:82vh;overflow:auto;z-index:10050;' +
      'background:#fff;border-radius:10px;box-shadow:0 6px 24px #0005;font-family:system-ui,sans-serif;color:#222;');
    pane.id = 'hba-leave-pane';
    var head = el('div', 'display:flex;justify-content:space-between;align-items:center;background:#102a43;color:#fff;padding:10px 12px;border-radius:10px 10px 0 0;');
    head.appendChild(el('div', 'font-size:14px;font-weight:600;', 'Leave · Balance & Statement (' + (sp.period || 'all periods') + ')'));
    var x = el('button', 'background:none;border:none;color:#fff;font-size:18px;cursor:pointer;line-height:1;', '×');
    x.title = 'Close'; x.addEventListener('click', function () { toggle(A); });
    head.appendChild(x); pane.appendChild(head);
    var picker = el('div', 'display:flex;gap:6px;flex-wrap:wrap;padding:10px 12px 0;');
    sp.employees.forEach(function (e) {
      var active = e.id === _sel;
      var b = el('button', 'border:1px solid #dfe3e8;border-radius:6px;padding:4px 8px;font-size:12px;cursor:pointer;' +
        'background:' + (active ? '#1976d2' : '#f4f5f7') + ';color:' + (active ? '#fff' : '#222') + ';', e.name || e.id);
      b.setAttribute('data-emp', e.id);
      b.addEventListener('click', function () { reselect(A, e.id); });
      picker.appendChild(b);
    });
    pane.appendChild(picker);
    var body = el('div', 'padding:6px 12px 12px;');
    var sum = renderStatement(body, sp, _sel, A);
    pane.appendChild(body);
    // §MOBILE-STACK — desktop = append-to-body + drag-by-header (unchanged); mobile = card-stack host.
    // Inline fallback preserves today's behaviour for node witnesses / if hba_mobile_stack.js fails to load.
    (G.HbaPaneHost ? G.HbaPaneHost.present
      : function (p, h) { (document.body || document.documentElement).appendChild(p); if (G.HbaDraggable) G.HbaDraggable.enable(p, h); }
    )(pane, head, A);
    _pane = pane;
    console.log('§HBA_LEAVE_PANE mounted employees=' + sp.employees.length + ' period=' + sp.period + ' selected=' + _sel + ' unpaid=' + sum.unpaid);
    return true;
  }

  // unmount the pane. keepSel=true (an employee re-select) leaves `_sel` intact for the immediate remount;
  // a real close (toggle) drops it so re-opening starts from the first employee again.
  function unmount(keepSel) {
    if (_pane && _pane.parentNode) _pane.parentNode.removeChild(_pane);
    else if (_pane && typeof _pane.remove === 'function') _pane.remove();
    _pane = null;
    if (!keepSel) _sel = null;
    console.log('§HBA_LEAVE_PANE unmounted (zero residue)');
    return false;
  }

  // toggle the pane. ON → mount; ON-again/close → unmount (full removal). Returns the new state.
  function toggle(A) {
    if (!ready()) { if (A && A.status) A.status.textContent = 'HR leave not loaded'; return false; }
    return _pane ? unmount() : mount(A);
  }
  function isActive() { return !!_pane; }

  G.HBALeavePane = { toggle: toggle, detect: detect, isActive: isActive, _ready: ready, _spec: spec };
  if (typeof module === 'object' && module.exports) module.exports = G.HBALeavePane;
})();
