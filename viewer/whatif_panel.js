/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// whatif_panel.js — TM 4D/5D variance lane §S6 (UI): the visual face of viewer/whatif.js.
//
// A floating "What-if schedule" panel for a folded C_Project: the official finish-to-start phase chain as grey
// bars, per-phase −/+ slip steppers, and the rippled BLUE schedule beside it (downstream re-folds live). Accept
// re-baselines (writes the rippled dates onto the official rows + persists), Discard restores. ALL schedule math
// comes from window.WhatIf (ripple / scheduleWhatIf / commitSlip / acceptSlip) — this file only draws + wires.
//
// Data: the same folded project the › ERP push uses. Prefer the OPFS store a push persisted
// (bim_analysis/bim_project_orders.db); else the bundled erp/ad_seed.db (which carries the proven C_Project 990000
// 'BIM: Hospital' 7-phase chain). Picks the active building's project if it is folded, else the first with phases.
(function (global) {
  'use strict';
  var A = function () { return global.APP || global.A || {}; };
  var DAY = 86400000;
  var _db = null, _pid = null, _name = '', _phases = [], _slips = {}, _branch = 'blue-whatif-ui', _committed = false;

  function _SQL() { var a = A(); return a._SQL || global.SQL || global._SQL_CACHED || null; }
  function _money(n) {
    n = Math.round(Number(n) || 0); var a = Math.abs(n), s = n < 0 ? '-' : '';
    if (a >= 1e6) return s + (a / 1e6).toFixed(1) + 'M'; if (a >= 1e3) return s + Math.round(a / 1e3) + 'K'; return s + a;
  }
  function _days(s) { return global.WhatIf._days(s); }
  function _fmt(ds) { return global.WhatIf._date(ds).slice(0, 10); }

  // Load the ERP db (OPFS push-store first, then bundled seed). Returns a sql.js Database or null.
  function _loadDb() {
    if (_db) return Promise.resolve(_db);
    var SQL = _SQL();
    if (!SQL || !global.WhatIf) return Promise.resolve(null);
    var fromOpfs = Promise.resolve(null);
    try {
      if (navigator.storage && navigator.storage.getDirectory) {
        fromOpfs = navigator.storage.getDirectory()
          .then(function (root) { return root.getDirectoryHandle('bim_analysis'); })
          .then(function (dir) { return dir.getFileHandle('bim_project_orders.db'); })
          .then(function (fh) { return fh.getFile(); })
          .then(function (f) { return f.arrayBuffer(); })
          .then(function (buf) { return new SQL.Database(new Uint8Array(buf)); })
          .catch(function () { return null; });
      }
    } catch (e) { fromOpfs = Promise.resolve(null); }
    return fromOpfs.then(function (db) {
      if (db && _hasFoldedProject(db)) { _db = db; return _db; }
      return fetch('../erp/ad_seed.db').then(function (r) { return r.arrayBuffer(); })
        .then(function (buf) { _db = new SQL.Database(new Uint8Array(buf)); return _db; })
        .catch(function (e) { console.log('§WHATIF-UI db-load-err ' + e.message); return null; });
    });
  }
  function _scalar(db, sql, p) { try { var r = db.exec(sql, p || []); return (r.length && r[0].values.length) ? r[0].values[0][0] : null; } catch (e) { return null; } }
  function _hasFoldedProject(db) {
    return Number(_scalar(db, "SELECT COUNT(*) FROM C_ProjectPhase") || 0) > 0;
  }
  // pick the folded project: the active building's C_Project if it has phases, else the first project that does.
  function _pickProject(db) {
    var building = A().activeBuilding;
    // NB: don't filter on branch_id here — that column only exists AFTER a blue commit ALTERs it in. readPhases is
    // branch-aware; the picker just needs a project that HAS phases.
    if (building) {
      var pid = _scalar(db, "SELECT p.C_Project_ID FROM C_Project p WHERE p.Value=? AND EXISTS(SELECT 1 FROM C_ProjectPhase ph WHERE ph.C_Project_ID=p.C_Project_ID)", [building]);
      if (pid != null) return { id: pid, name: _scalar(db, "SELECT Name FROM C_Project WHERE C_Project_ID=?", [pid]) };
    }
    var r = db.exec("SELECT p.C_Project_ID, p.Name FROM C_Project p WHERE EXISTS(SELECT 1 FROM C_ProjectPhase ph WHERE ph.C_Project_ID=p.C_Project_ID) ORDER BY p.C_Project_ID DESC LIMIT 1");
    if (r.length && r[0].values.length) return { id: r[0].values[0][0], name: r[0].values[0][1] };
    return null;
  }

  function _injectStyle() {
    if (document.getElementById('whatif-style')) return;
    var s = document.createElement('style'); s.id = 'whatif-style';
    s.textContent = [
      '#whatif-panel{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(640px,94vw);max-height:88vh;overflow:auto;',
      'background:rgba(16,18,28,0.97);border:1px solid rgba(120,150,255,0.35);border-radius:10px;z-index:10050;',
      'box-shadow:0 12px 48px rgba(0,0,0,0.6);color:#e8ecf4;font:13px/1.4 system-ui,sans-serif;padding:14px 16px}',
      '#whatif-panel h3{margin:0 0 2px;font-size:15px;font-weight:600;display:flex;align-items:center;gap:8px}',
      '#whatif-panel .wi-sub{font-size:11px;color:#8893a8;margin-bottom:10px}',
      '#whatif-panel .wi-close{margin-left:auto;cursor:pointer;color:#8893a8;font-size:18px;line-height:1;background:none;border:none}',
      '#whatif-panel .wi-close:hover{color:#fff}',
      '.wi-row{display:grid;grid-template-columns:120px 1fr 92px;gap:8px;align-items:center;padding:3px 0}',
      '.wi-name{font-size:12px;color:#cfd6e6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.wi-track{position:relative;height:20px;background:rgba(255,255,255,0.04);border-radius:3px;overflow:hidden}',
      '.wi-bar{position:absolute;top:2px;height:7px;border-radius:2px}',
      '.wi-bar.off{background:#5a6478;top:2px}',
      '.wi-bar.blue{background:#5b8cff;top:11px;box-shadow:0 0 6px rgba(91,140,255,0.5)}',
      '.wi-step{display:flex;gap:3px;justify-content:flex-end}',
      '.wi-step button{width:24px;height:22px;border-radius:4px;border:1px solid rgba(120,150,255,0.3);background:rgba(91,140,255,0.12);',
      'color:#bcd0ff;cursor:pointer;font-size:13px;padding:0}',
      '.wi-step button:hover{background:rgba(91,140,255,0.3);color:#fff}',
      '.wi-step .wi-d{min-width:30px;text-align:center;font-size:11px;color:#8aa0d0;align-self:center}',
      '#whatif-summary{display:flex;gap:16px;flex-wrap:wrap;margin:10px 0;padding:8px 10px;background:rgba(91,140,255,0.07);border-radius:6px;font-size:12px}',
      '#whatif-summary b{color:#fff}',
      '#whatif-summary .blue{color:#7da4ff}',
      '#whatif-actions{display:flex;gap:8px;margin-top:6px}',
      '#whatif-actions button{flex:1;padding:8px;border-radius:6px;border:1px solid;cursor:pointer;font-size:13px;font-weight:600}',
      '#wi-accept{background:rgba(76,175,80,0.22);border-color:rgba(76,175,80,0.5);color:#9be4a0}',
      '#wi-accept:hover{background:rgba(76,175,80,0.4);color:#fff}',
      '#wi-discard{background:rgba(255,255,255,0.06);border-color:rgba(255,255,255,0.18);color:#c7cedd}',
      '#wi-discard:hover{background:rgba(255,90,90,0.25);border-color:rgba(255,90,90,0.5);color:#fff}',
      '#wi-accept:disabled,#wi-discard:disabled{opacity:0.4;cursor:default}',
      '#whatif-legend{font-size:11px;color:#8893a8;margin-top:4px;display:flex;gap:14px}',
      '#whatif-legend span::before{content:"";display:inline-block;width:14px;height:6px;border-radius:2px;margin-right:5px;vertical-align:middle}',
      '#whatif-legend .l-off::before{background:#5a6478}',
      '#whatif-legend .l-blue::before{background:#5b8cff}'
    ].join('');
    document.head.appendChild(s);
  }

  function _render() {
    var panel = document.getElementById('whatif-panel'); if (!panel) return;
    var wf = global.WhatIf.scheduleWhatIf(_db, _pid, _slips);
    var off = wf.official.phases, blue = wf.blue.phases;
    var p0 = _days(off[0].start), pEnd = Math.max(_days(off[off.length - 1].end), _days(blue[blue.length - 1].end));
    var span = Math.max(1, pEnd - p0);
    function pct(ds) { return ((_days(ds) - p0) / span * 100); }
    var rows = off.map(function (op, i) {
      var bp = blue[i], slip = _slips[op.seqno] || {}; var d = (slip.startDelta || 0);
      var offL = pct(op.start), offW = Math.max(1.5, pct(op.end) - offL);
      var bL = pct(bp.start), bW = Math.max(1.5, pct(bp.end) - bL);
      var moved = (bp.start !== op.start || bp.end !== op.end);
      return '<div class="wi-row">' +
        '<div class="wi-name" title="' + op.name + '">' + op.name + '</div>' +
        '<div class="wi-track" title="official ' + _fmt(op.start) + '→' + _fmt(op.end) + (moved ? '  ·  blue ' + _fmt(bp.start) + '→' + _fmt(bp.end) : '') + '">' +
          '<div class="wi-bar off" style="left:' + offL.toFixed(1) + '%;width:' + offW.toFixed(1) + '%"></div>' +
          (moved ? '<div class="wi-bar blue" style="left:' + bL.toFixed(1) + '%;width:' + bW.toFixed(1) + '%"></div>' : '') +
        '</div>' +
        '<div class="wi-step"><button data-seq="' + op.seqno + '" data-d="-7" title="pull in 7 days">−</button>' +
          '<span class="wi-d">' + (d > 0 ? '+' + d : d) + 'd</span>' +
          '<button data-seq="' + op.seqno + '" data-d="7" title="slip out 7 days">+</button></div>' +
      '</div>';
    }).join('');
    var fs = wf.forward.finishSlipDays || 0;
    var summary = '<div id="whatif-summary">' +
      '<div>Finish: <b>' + wf.official.finish.slice(0, 10) + '</b> → <span class="blue">' + wf.blue.finish.slice(0, 10) + '</span> ' +
        '<b>(' + (fs > 0 ? '+' + fs : fs) + 'd)</b></div>' +
      '<div>BAC: <b>' + _money(wf.official.bac) + '</b> <span style="color:#8893a8">(unchanged — same scope)</span></div>' +
      '<div>PV @ finish: <b>' + _money(wf.official.pv) + '</b> → <span class="blue">' + _money(wf.blue.pv) + '</span></div>' +
    '</div>';
    panel.querySelector('#whatif-body').innerHTML = summary +
      '<div id="whatif-legend"><span class="l-off">Official (planned)</span><span class="l-blue">What-if (blue ripple)</span></div>' +
      '<div style="margin-top:8px">' + rows + '</div>';
    var anySlip = Object.keys(_slips).some(function (k) { return _slips[k] && _slips[k].startDelta; });
    panel.querySelector('#wi-accept').disabled = !anySlip;
    panel.querySelector('#wi-discard').disabled = !anySlip;
    // wire steppers (re-bound each render — small N)
    panel.querySelectorAll('.wi-step button').forEach(function (b) {
      b.addEventListener('click', function () {
        var seq = Number(b.getAttribute('data-seq')), dd = Number(b.getAttribute('data-d'));
        var cur = (_slips[seq] && _slips[seq].startDelta) || 0;
        var next = cur + dd; if (next <= 0 && seq === _phases[0].seqno) next = Math.max(0, next); // anchor can't go negative-before-start
        if (next === 0) delete _slips[seq]; else _slips[seq] = { startDelta: next };
        console.log('§WHATIF-UI slip seq=' + seq + ' delta=' + next + 'd');
        _render();
      });
    });
  }

  function _persist() {
    if (!navigator.storage || !navigator.storage.getDirectory) return Promise.resolve(false);
    try {
      var bytes = _db.export();
      return navigator.storage.getDirectory()
        .then(function (root) { return root.getDirectoryHandle('bim_analysis', { create: true }); })
        .then(function (dir) { return dir.getFileHandle('bim_project_orders.db', { create: true }); })
        .then(function (fh) { return fh.createWritable(); })
        .then(function (w) { return w.write(bytes).then(function () { return w.close(); }); })
        .then(function () { return true; }).catch(function () { return false; });
    } catch (e) { return Promise.resolve(false); }
  }

  function _accept() {
    var anySlip = Object.keys(_slips).some(function (k) { return _slips[k] && _slips[k].startDelta; });
    if (!anySlip) return;
    // Exercise the real engine path: commit the slip onto a blue branch, then accept (re-baseline) it.
    global.WhatIf.commitSlip(_db, _branch, _pid, _slips).then(function (c) {
      return global.WhatIf.acceptSlip(_db, _branch, _pid, null).then(function (a) {
        _committed = true; _slips = {};
        console.log('§WHATIF-UI accept project=' + _pid + ' moved=' + c.movedPhases + ' finishSlip=' + c.finishSlipDays + 'd rebased=' + a.rebasedPhases);
        return _persist().then(function (ok) {
          console.log('§WHATIF-UI persist opfs=' + ok + ' (re-baseline ' + (ok ? 'saved' : 'in-memory only') + ')');
          _phases = global.WhatIf.readPhases(_db, _pid, null);
          var st = A().status; if (st) st.textContent = 'What-if accepted — schedule re-baselined (finish +' + c.finishSlipDays + 'd)';
          _render();
        });
      });
    });
  }
  function _discard() {
    _slips = {}; console.log('§WHATIF-UI discard — slips cleared, official restored');
    var st = A().status; if (st) st.textContent = 'What-if discarded — official schedule restored';
    _render();
  }

  function open() {
    _injectStyle();
    _loadDb().then(function (db) {
      if (!db) { var st = A().status; if (st) st.textContent = 'What-if: ERP engine not ready'; console.log('§WHATIF-UI no-db'); return; }
      var proj = _pickProject(db);
      if (!proj) { var st2 = A().status; if (st2) st2.textContent = 'What-if: no folded project yet — push one to ERP first'; console.log('§WHATIF-UI no-folded-project'); return; }
      _pid = proj.id; _name = proj.name || ('Project ' + proj.id); _slips = {}; _committed = false;
      _phases = global.WhatIf.readPhases(_db, _pid, null);
      var old = document.getElementById('whatif-panel'); if (old) old.remove();
      var panel = document.createElement('div'); panel.id = 'whatif-panel';
      panel.innerHTML =
        '<h3>What-if schedule <span style="font-weight:400;color:#8aa0d0;font-size:13px">' + _name + '</span>' +
          '<button class="wi-close" title="Close">×</button></h3>' +
        '<div class="wi-sub">Slip a phase → every downstream phase re-folds in blue (finish-to-start). ' +
          'Accept to re-baseline, Discard to drop.</div>' +
        '<div id="whatif-body"></div>' +
        '<div id="whatif-actions"><button id="wi-accept">Accept — re-baseline</button>' +
          '<button id="wi-discard">Discard</button></div>';
      document.body.appendChild(panel);
      panel.querySelector('.wi-close').addEventListener('click', function () { panel.remove(); });
      panel.querySelector('#wi-accept').addEventListener('click', _accept);
      panel.querySelector('#wi-discard').addEventListener('click', _discard);
      console.log('§WHATIF-UI open project=' + _pid + ' "' + _name + '" phases=' + _phases.length);
      _render();
    });
  }

  global.WhatIfPanel = { open: open };
})(typeof self !== 'undefined' ? self : this);
