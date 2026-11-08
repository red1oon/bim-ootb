// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// edit_report_panel.js — the panel for §EDIT-REPORT (bim-compiler prompts/MODELLER_MASTER.md, row 41). DOM only: it prints the report's
// own values and computes nothing. Values go through textContent. The wording never says safe, OK or compliant.
(function () {
  'use strict';
  var el = null, open = false;
  function make(tag, cls, text) { var d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; }
  function css() {
    if (document.getElementById('er-style')) return;
    var s = document.createElement('style'); s.id = 'er-style';
    s.textContent = '#edit-report{position:fixed;top:62px;right:62px;width:min(350px,calc(100vw - 76px));max-height:calc(100vh - 150px);overflow:auto;z-index:30;background:#1b1d23;border:1px solid #2c303a;border-radius:10px;color:#c7cdd8;font:12px system-ui,sans-serif;display:none}' +
      '#edit-report .er-head{display:flex;justify-content:space-between;gap:8px;padding:9px 10px;border-bottom:1px solid #23262e}' +
      '#edit-report .er-title{font-size:10px;letter-spacing:.14em;color:#5b6473}#edit-report .er-what{margin-top:4px;color:#e2e6ee}' +
      '#edit-report .er-x{background:none;border:0;color:#6b7488;cursor:pointer;font-size:14px;line-height:1;padding:0 2px;align-self:flex-start}' +
      '#edit-report table{width:100%;border-collapse:collapse}#edit-report th{font-weight:400;color:#5b6473;text-align:right;padding:6px 8px 2px;font-size:10px}' +
      '#edit-report th:first-child{text-align:left;padding-left:10px}#edit-report td{padding:4px 8px;text-align:right;font-variant-numeric:tabular-nums;vertical-align:top}' +
      '#edit-report td:first-child{text-align:left;padding-left:10px}#edit-report .er-scope{display:block;color:#5b6473;font-size:10px}' +
      '#edit-report .up{color:#e5484d;font-weight:600}#edit-report .down{color:#3fb950;font-weight:600}#edit-report .why{text-align:left;color:#b58a2a;font-size:11px}' +
      '#edit-report .er-sec{padding:8px 10px 2px;font-size:10px;letter-spacing:.1em;color:#5b6473}#edit-report .er-new{display:flex;justify-content:space-between;padding:2px 10px}' +
      '#edit-report .er-new.red b{color:#e5484d}#edit-report .er-new.orange b{color:#e08a00}#edit-report .er-note{padding:6px 10px;color:#6b7488;font-size:11px}' +
      '#edit-report .er-nc{display:block;width:100%;background:#13151a;border:0;border-top:1px solid #23262e;color:#b58a2a;text-align:left;padding:8px 10px;cursor:pointer;font:12px system-ui,sans-serif}' +
      '#edit-report ul{margin:0;padding:4px 10px 8px 24px;background:#13151a;color:#9aa3b2}';
    document.head.appendChild(s);
  }
  function fmtDelta(d) { return d > 0 ? '+' + d : d < 0 ? '−' + (-d) : '0'; }
  function render(r) {
    css();
    if (!el) { el = make('div'); el.id = 'edit-report'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = ''; open = false;
    var c = r.change || {}, head = make('div', 'er-head'), left = make('div');
    left.appendChild(make('div', 'er-title', 'WHAT THIS EDIT DID'));
    var dtxt = (c.delta >= 0 ? '+' : '−') + Math.abs(c.delta).toFixed(2) + ' m';
    if (c.kind === 'block-shift') {
      left.appendChild(make('div', 'er-what', 'Grid ' + c.grid + ' and the ' + (c.lines - 1) + ' lines after it moved ' + dtxt));
      left.appendChild(make('div', 'er-scope', c.moved + ' moved, ' + c.stretched + ' stretched, ' + c.riders + ' carried along, ' + c.left.count + ' crossing the line did not follow. One change, can undo.'));
    } else {
      left.appendChild(make('div', 'er-what', 'Grid ' + c.grid + ' moved ' + dtxt));
      left.appendChild(make('div', 'er-scope', c.recomposed + ' recomposed, ' + c.riders + ' carried along. One change, can undo.'));
    }
    var x = make('button', 'er-x', '×'); x.title = 'Close'; x.setAttribute('aria-label', 'Close report'); x.onclick = hide;
    head.appendChild(left); head.appendChild(x); el.appendChild(head);

    var t = make('table'), hr = make('tr');
    ['Checked', 'Before', 'After', ''].forEach(function (h) { hr.appendChild(make('th', '', h)); }); t.appendChild(hr);
    r.rows.forEach(function (row) {
      var tr = make('tr'); tr.dataset.row = row.id;
      var td0 = make('td'); td0.appendChild(document.createTextNode(row.label)); td0.appendChild(make('span', 'er-scope', row.scope)); tr.appendChild(td0);
      if (row.state === 'JUDGED') {
        tr.appendChild(make('td', '', String(row.before))); tr.appendChild(make('td', '', String(row.after)));
        tr.appendChild(make('td', row.delta > 0 ? 'up' : row.delta < 0 ? 'down' : '', fmtDelta(row.delta)));
      } else {
        var w = make('td', 'why', (row.state === 'NOT_JUDGED' ? 'Not judged: ' : 'Inconclusive: ') + row.note); w.colSpan = 3; tr.appendChild(w);
      }
      t.appendChild(tr);
      if (row.limit != null) {   // the limit and the bays behind the count
        var lr = make('tr'), ltd = make('td', 'why', 'Limit ' + row.limit + ' m' + (row.material ? ', ' + row.material : '') + (row.over_limit_changed_total ? '. Changed and over it: ' + row.over_limit_changed.map(function (b) { return b.bay + ' ' + (b.before != null ? b.before.toFixed(2) + ' → ' : '') + b.after.toFixed(2) + ' m'; }).join(', ') + (row.over_limit_changed_total > row.over_limit_changed.length ? ', and ' + (row.over_limit_changed_total - row.over_limit_changed.length) + ' more' : '') : ''));
        ltd.colSpan = 4; lr.dataset.row = row.id + '_limit'; lr.appendChild(ltd); t.appendChild(lr);
      }
    });
    el.appendChild(t);

    el.appendChild(make('div', 'er-sec', 'NEW FROM THIS EDIT'));
    r.newRows.forEach(function (n) {
      var d = make('div', 'er-new' + (n.count ? ' ' + n.level : '')); d.dataset.row = n.id;
      d.appendChild(make('span', '', n.label)); d.appendChild(make('b', '', n.state === 'JUDGED' ? String(n.count) : 'not judged')); el.appendChild(d);
    });
    var sh = r.shapes; // §20.2.10 the real-shape check: words, totals, and the pairs (full counts; the list is capped on screen only)
    if (sh && sh.state === 'JUDGED') {
      el.appendChild(make('div', 'er-sec', 'SHAPE CHECK (' + sh.judged + ' box pair' + (sh.judged === 1 ? '' : 's') + ' judged at ' + sh.tol_mm + ' mm)'));
      el.appendChild(make('div', 'er-note', sh.tally.clash + ' clash, ' + sh.tally['not judged'] + ' not judged, checked and cleared: ' + sh.cleared + ' (' + sh.tally.touching + ' touching, ' + sh.tally['box only, shapes clear'] + ' box only, shapes clear)' +
        (sh.resolved ? '. Resolved against before: ' + sh.resolved.count + ' (box level)' : '')));
      var shown = sh.pairs.filter(function (p) { return p.verdict === 'clash' || p.verdict === 'not judged'; }), nm = function (e) { return (e.name || ('#' + e.fid)) + (e.cls ? ' (' + String(e.cls).replace(/^Ifc/, '') + (e.disc ? ', ' + e.disc : '') + (e.storey ? ', ' + e.storey : '') + ')' : ''); };
      shown.slice(0, 8).forEach(function (p) { var d = make('div', 'er-new red'); d.dataset.shape = p.verdict; d.appendChild(make('span', '', nm(p.a) + ' x ' + nm(p.b) + ' [' + p.status + ']')); d.appendChild(make('b', '', p.verdict === 'clash' ? p.depth_mm + ' mm' : 'not judged')); el.appendChild(d); });
      if (shown.length > 8) el.appendChild(make('div', 'er-note', (shown.length - 8) + ' more clash or not-judged pairs: the full list is in the report.'));
    } else if (sh && sh.state === 'FALLBACK') el.appendChild(make('div', 'er-note', 'Shape check unavailable (' + sh.reason + '). The box stop applies.'));
    var prelim = r.rows.map(function (q) { return q.id.indexOf('span') === 0 && q.state === 'JUDGED' ? q.note : ''; }).filter(Boolean)[0];
    if (prelim) el.appendChild(make('div', 'er-note', prelim));

    var btn = make('button', 'er-nc', 'NOT checked: ' + r.notChecked.length + ' items ▾'), ul = make('ul');
    r.notChecked.forEach(function (n) { ul.appendChild(make('li', '', n)); });
    ul.style.display = 'none'; btn.setAttribute('aria-expanded', 'false');
    btn.onclick = function () { open = !open; ul.style.display = open ? 'block' : 'none'; btn.setAttribute('aria-expanded', String(open)); };
    el.appendChild(btn); el.appendChild(ul);
    el.style.display = 'block';
  }
  function hide() { if (el) el.style.display = 'none'; }
  window.EditReportPanel = { show: render, hide: hide };
})();
