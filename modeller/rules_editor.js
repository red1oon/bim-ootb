/**
 * BIM OOTB — Walker rules editor (the rules the disc walker uses, as JSON, in the project's ONE JSON editor).
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * Implementing prompts/MODELLER_RULES_EDITOR.md — Witness: W-E2E-RULES-EDIT. Loaded lazily by #b-rules.
 * The rule set = the rules DB DiscWalker loaded for this building's type (WalkRules: residential / farm / complex).
 * Shown as { <table>: [ {id: '<table>:<rowid>', label, ...columns} ] } through SettingsEditor.jsonToSchema; an edit is a
 * CELL; Save applies it to the live rules DB and stores it (DiscWalker re-applies it on every open, after the shipped patch).
 */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  var TAG = '§RULES-EDIT';
  var LABEL_COLS = ['disc', 'space_type_id', 'device_id', 'ifc_class', 'fixture_ifc_class', 'storey_scope', 'storey', 'pattern', 'alias', 'key'];
  var READONLY = { rules_meta: true };
  var state = null;

  function rows(db, sql) { var r = db.exec(sql); return r.length ? r[0].values.map(function (v) { var o = {}; r[0].columns.forEach(function (c, i) { o[c] = v[i]; }); return o; }) : []; }
  function loadEditor() {
    if (window.SettingsEditor) return Promise.resolve();
    return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = '../common/settings_editor.js?v=2'; s.onload = ok; s.onerror = function () { no(new Error('settings_editor.js failed to load')); }; document.head.appendChild(s); });
  }
  function toJson(db) {
    var out = {}, nRows = 0;
    rows(db, "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'rule\\_%' ESCAPE '\\' OR name='rules_meta') ORDER BY name").forEach(function (t) {
      if (/_archived$/.test(t.name)) return;
      var list = rows(db, 'SELECT rowid AS __rowid, * FROM "' + t.name + '"').map(function (r) {
        var o = { id: t.name + ':' + r.__rowid };
        o.label = LABEL_COLS.filter(function (c) { return r[c] != null && r[c] !== ''; }).map(function (c) { return r[c]; }).join(' · ') || ('row ' + r.__rowid);
        Object.keys(r).forEach(function (c) { if (c !== '__rowid') o[c] = r[c]; });
        return o;
      });
      if (list.length) { out[t.name] = list; nRows += list.length; }
    });
    return { json: out, rows: nRows };
  }
  function stored(file) { var DW = window.DiscWalker; return (DW.userRules && DW.userRules(file)) || { cells: {} }; }
  function save() {
    var DW = window.DiscWalker, file = state.file, cur = stored(file), n = 0;
    Object.keys(state.pending).forEach(function (rk) { cur.cells[rk] = Object.assign(cur.cells[rk] || {}, state.pending[rk]); });
    var r = DW.applyCells(DW.rulesDb(), state.pending);
    Object.keys(cur.cells).forEach(function (rk) { n += Object.keys(cur.cells[rk]).length; });
    cur.rulesFile = file; cur.buildingClass = state.cls; cur.saved = new Date().toISOString();
    try { localStorage.setItem(DW.userRulesKey(file), JSON.stringify(cur)); } catch (e) { console.warn(TAG + ' save storage failed ' + e.message); }
    state.pending = {};
    console.log(TAG + ' save file=' + file + ' applied=' + r.done + ' skipped=' + r.skipped + ' cells=' + n + ' (walk again to see the change)');
    if (window.setStat) window.setStat('Rules saved: ' + n + ' edited cell' + (n === 1 ? '' : 's') + ' — walk again to see the change');
    return r;
  }
  function sqlOf(cells) {
    var q = function (v) { return v == null ? 'NULL' : (typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'"); };
    var out = [];
    Object.keys(cells).forEach(function (rk) { var m = /^(\w+):(\d+)$/.exec(rk); if (!m) return;
      Object.keys(cells[rk]).forEach(function (c) { out.push('UPDATE "' + m[1] + '" SET "' + c + '"=' + q(cells[rk][c]) + ' WHERE rowid=' + m[2] + ';'); }); });
    return out.join('\n');
  }
  function download() {
    var cur = stored(state.file), n = 0; Object.keys(cur.cells).forEach(function (rk) { n += Object.keys(cur.cells[rk]).length; });
    var doc = { about: 'Walker rule edits (prompts/MODELLER_RULES_EDITOR.md). Each cell is <table>:<rowid> -> column -> value; sql is the same edit as SQL. checkedOn lists the buildings a fleet check walked (modeller/tests/rules_edit_fleet_check.js); empty = not checked.', rulesFile: state.file, buildingClass: state.cls, checkedOn: [], cells: cur.cells, sql: sqlOf(cur.cells) };
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' }));
    a.download = 'walker_rules_' + state.file.replace(/\.db$/, '') + '_edits.json'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    window.__rulesEditDownload = doc;   // witness oracle
    console.log(TAG + ' download file=' + state.file + ' cells=' + n);
    return doc;
  }
  async function reset() {
    var DW = window.DiscWalker; try { localStorage.removeItem(DW.userRulesKey(state.file)); } catch (e) { /* */ }
    await DW.reloadRules(window.SQL, window._DW_BASE);
    console.log(TAG + ' reset file=' + state.file);
    await open();
  }
  // §CLASS-SHARED (a): one rules file serves every building of its type; name the residents that use it
  function sharedBy(file) {
    var SW = window.STRWalkerOutliner, WR = window.WalkRules, res = (SW && SW._residents) || [];
    return res.filter(function (r) { return WR && WR.rulesDb(r.key) === file; }).map(function (r) { return r.key; });
  }
  function close() { var el = document.getElementById('rules-ed'); if (el) el.remove(); state = null; }
  async function open() {
    var DW = window.DiscWalker;
    // the rules load lazily after an open (measured on a real building: the Rules click came before the fetch finished and was
    // refused) — ask the open path's own loader first; it is a no-op when this building's rules are already loaded
    if (window.__dwBuf && typeof window.__ensureDiscWalker === 'function') { try { await window.__ensureDiscWalker(); } catch (e) { console.warn(TAG + ' ensure failed ' + (e && e.message)); } }
    if (!DW || !DW.rulesDb || !DW.rulesDb()) { if (window.setStat) window.setStat('Open a building first: the rules follow its type'); console.log(TAG + ' open refused (no rules loaded)'); return false; }
    await loadEditor();
    var file = DW.loadedFile ? DW.loadedFile() : '?';
    var cls = (window.WalkRules && window.WalkRules.classOf && window.WalkRules.classOf(file)) || '?';   // §CLASS-SHARED: the loaded FILE's class (was the open building's name: with none open it said 'terminal' on farm_rules.db)
    var J = toJson(DW.rulesDb()), shared = sharedBy(file);
    var el = document.getElementById('rules-ed'); if (el) el.remove();
    el = document.createElement('div'); el.id = 'rules-ed';
    el.style.cssText = 'position:fixed;right:12px;top:56px;bottom:60px;width:min(560px,92vw);z-index:60;background:#0f1622;color:#c7cdd8;border:1px solid #2a3344;border-radius:8px;display:flex;flex-direction:column;font:13px system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.5)';
    el.innerHTML = '<div style="padding:10px 12px;border-bottom:1px solid #2a3344"><div style="font-weight:600;color:#F3EEE8">Walker rules — ' + file + '</div>' +
      '<div id="rules-shared" style="color:#E8C77A;margin-top:4px">' + (shared.length ? 'These rules are shared by every ' + cls + ' building (here: ' + shared.join(', ') + '). An edit changes all of them.' : 'These rules are shared by every ' + cls + ' building; no resident building uses them.') + '</div>' +
      '<div style="color:#7f8aa0;margin-top:2px">building type: ' + cls + ' · ' + Object.keys(J.json).length + ' tables · ' + J.rows + ' rows · edit a value, Save, then walk again</div>' +
      '<div style="margin-top:8px;display:flex;gap:6px"><button id="rules-save">Save</button><button id="rules-dl">Download edits (JSON)</button><button id="rules-reset">Reset to shipped</button><span style="flex:1"></span><button id="rules-close">Close</button></div></div>' +
      '<div id="rules-body" style="overflow:auto;padding:6px 8px;flex:1"></div>';
    if (!document.getElementById('rules-ed-css')) { var st = document.createElement('style'); st.id = 'rules-ed-css';
      // presentation only (the shared renderer is unchanged): a rule row has ~26 columns, so let its fields wrap under its label
      st.textContent = '#rules-ed [data-row-id]{flex-wrap:wrap;row-gap:4px;column-gap:6px;padding:6px 2px;border-bottom:1px solid #1d2533}' +
        '#rules-ed [data-row-id]>span:first-child{flex:1 0 100%;color:#F3EEE8;font-weight:600}'; document.head.appendChild(st); }
    document.body.appendChild(el);
    state = { file: file, cls: cls, pending: {} };
    var schema = window.SettingsEditor.jsonToSchema(J.json, { __hide: ['id', 'label'] });
    schema.forEach(function (sec) { if (READONLY[sec._key]) sec.rows.forEach(function (r) { (r.fields || []).forEach(function (f) { f.readonly = true; }); }); });
    window.SettingsEditor({ container: el.querySelector('#rules-body'), schema: schema, persist: false,
      onChange: function (rowId, key, value) { var t = String(rowId).split(':')[0]; if (READONLY[t]) return; (state.pending[rowId] = state.pending[rowId] || {})[key] = value; console.log(TAG + ' edit ' + rowId + '.' + key + '=' + value); } });
    el.querySelector('#rules-save').onclick = save; el.querySelector('#rules-dl').onclick = download;
    el.querySelector('#rules-reset').onclick = reset; el.querySelector('#rules-close').onclick = close;
    console.log(TAG + ' open file=' + file + ' class=' + cls + ' tables=' + Object.keys(J.json).length + ' rows=' + J.rows + ' shared=' + shared.length + ' residents=' + (shared.join(',') || '-'));
    return true;
  }
  window.RulesEditor = { sharedBy: sharedBy, open: open, close: close, save: save, download: download, reset: reset, _toJson: toJson, _sqlOf: sqlOf };
})();
