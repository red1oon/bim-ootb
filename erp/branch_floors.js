// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — branch_floors.js: the Floors / Tables / Settings tab of the Branch POS Admin (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §32.1 item 4). READ THE LOG (§FLOORS_* lines).
// Layout and fields follow uniCenta FloorsEditor.java:19-167 (name, image) and PlacesEditor.java:242-286 (name, floor, seats, x, y, width, height). Writes POS_FloorPlan rows (flow R1, branch-local,
// never to HQ) through the engine's op group: ONE group per Save. All logic is in rest_core.js (fold/editRow/toDb); this file only draws and deposits.
(function () {
  'use strict';
  var RC = window.RestCore, st = { s: null };
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function log(s) { try { console.log(s); } catch (e) { /* never breaks the page */ } }
  function A() { return window.BranchAdmin; }
  async function read() {
    var a = A(), all = [];
    for (var t in RC.FIELDS) { var rs = await a.rows('SELECT * FROM ' + t.toLowerCase() + ' ORDER BY ABS(' + t.toLowerCase() + '_id)'); rs.forEach(function (r) { all.push(RC.fromDb(t, r)); }); }
    return RC.fold(all);
  }
  async function deposit(rows) {
    var E = A().engine(), ops = rows.map(function (r) { var tb = r._t.toLowerCase(); return { op_type: 'CRUD_CREATE', key: tb, table: tb, verb: 'create', fields: Object.assign({ ad_client_id: A().state().cfg.client, ad_org_id: A().state().cfg.org }, RC.toDb(r)) }; });
    var res = await new Promise(function (ok) { var t = setTimeout(function () { ok({ committed: false, reason: 'timeout' }); }, 60000); E.__crud.applyOpGroup(ops, function (r) { clearTimeout(t); ok(r); }); });
    log('§FLOORS_SAVE rows=' + rows.length + ' committed=' + (res && res.committed) + (res && res.committed ? '' : ' reason=' + (res && res.reason)));
    if (res && res.committed) await E.TeamSync.visit(); return res;
  }
  async function render() {
    var s = st.s = await read(), z = RC.sizes(s.settings);
    $('#f-floors').innerHTML = s.floors.map(function (f) { return '<tr data-floor="' + esc(f.RecId) + '"><td>' + esc(f.Name) + '</td><td>' + esc(f.Image || '') + '</td><td><button data-del-floor="' + esc(f.RecId) + '">Delete</button></td></tr>'; }).join('');
    $('#f-places').innerHTML = s.places.map(function (p) { return '<tr data-place="' + esc(p.RecId) + '"><td>' + esc(p.Name) + '</td><td>' + esc((s.floors.filter(function (f) { return f.RecId === p.FloorId; })[0] || {}).Name || p.FloorId) + '</td><td>' + p.Seats + '</td><td>' + p.X + '</td><td>' + p.Y + '</td><td>' + p.W + '</td><td>' + p.H + '</td><td><button data-del-place="' + esc(p.RecId) + '">Delete</button></td></tr>'; }).join('');
    $('#f-floor').innerHTML = s.floors.map(function (f) { return '<option value="' + esc(f.RecId) + '">' + esc(f.Name) + '</option>'; }).join('');
    ['img-width', 'img-height', 'cat-height'].forEach(function (k) { $('#s-' + k).value = z[k]; });
    log('§FLOORS_VIEW floors=' + s.floors.length + ' places=' + s.places.length + ' sizes=' + JSON.stringify(z)); return s;
  }
  var id = function (p) { return p + Date.now().toString(36) + Math.floor(Math.random() * 1e3); };
  async function saveFloor() { var n = $('#f-name').value.trim(); if (!n) return; var r = RC.editRow(st.s, 'F', { RecId: id('F'), Name: n, Image: $('#f-image').value.trim() }); await deposit([r]); $('#f-name').value = ''; return render(); }
  async function savePlace() { var n = $('#p-name').value.trim(), fl = $('#f-floor').value; if (!n || !fl) return; var num = function (k, d) { return Number($('#p-' + k).value || d); };
    var r = RC.editRow(st.s, 'P', { RecId: id('T'), Name: n, FloorId: fl, Seats: num('seats', 1), X: num('x', 100), Y: num('y', 50), W: num('w', 90), H: num('h', 45) }); await deposit([r]); $('#p-name').value = ''; return render(); }
  async function del(kind, recId) { var r = RC.editRow(st.s, kind, { RecId: recId, Deleted: 'Y' }); await deposit([r]); return render(); }
  async function saveSettings() {
    var rows = [], z = RC.sizes(st.s.settings);
    ['img-width', 'img-height', 'cat-height'].forEach(function (k) { var v = $('#s-' + k).value; if (String(z[k]) !== String(v)) rows.push(RC.editRow(st.s, 'S', { RecId: k, Value: String(v) })); });
    var pin = $('#s-pin').value; if (pin) rows.push(RC.editRow(st.s, 'S', { RecId: 'PinHash', Value: await RC.sha(pin) })); $('#s-pin').value = '';
    if (rows.length) await deposit(rows); return render();
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('button'); if (!b) return;
    if (b.id === 'f-save') saveFloor(); else if (b.id === 'p-save') savePlace(); else if (b.id === 's-save') saveSettings();
    else if (b.hasAttribute('data-del-floor')) del('F', b.getAttribute('data-del-floor')); else if (b.hasAttribute('data-del-place')) del('P', b.getAttribute('data-del-place'));
  });
  (function wait() { if (A() && A().ready) { render().then(function () { window.BranchFloors = { render: render, saveFloor: saveFloor, savePlace: savePlace, state: function () { return st.s; } }; }); } else setTimeout(wait, 300); })();
})();
