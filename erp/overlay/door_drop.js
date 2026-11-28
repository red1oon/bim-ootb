// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// overlay/door_drop.js - DRAG A MARKED WORKBOOK ONTO THE ERP, A DRAFT APPEARS (bim-compiler prompts/SHEET_FRONT_DOOR.md section 29.5, slice 1) - an OVERLAY over erp/idempiere.html
//   (prompts/ERP_DEPTH_FILM.md section EXTENSION-LAYER LAW): the windows stay the legacy twin and gain no viewer; the core carries no line of this. Witness: W-DOOR-DROP (erp/tests/witness_door_drop.js).
// WHAT IT DOES: a `window` listener (bubble phase) for dragover / drop that acts only when the event carries files, is not already handled by an element that wants it (the six drop zones
//   of the page call preventDefault on their own element, so e.defaultPrevented is true here and this file stays out), is not on a file input, and is not over the open Attachment dialog.
//   Per dropped file, each judged on its own: an .xlsx that carries `_door_tags` is read with the existing sheet-door readers (xlsx_host.js + host_shim.js), SheetDoor.file runs UNCHANGED inside
//   __crud.withModelTrx (the same Trx the page's own Import menu entry uses, idempiere.html runProcess), the one op group is committed with __crud.applyOpGroup, the dropped file's bytes are attached
//   to the new record through the page's generic attachment module (window.__idmpAttach, W-ATTACH), and the record is shown in its standard window (IdmpHost.zoom = AEnv.zoom). The door passes no
//   DocAction: Import Invoice's own default PR leaves the document In Progress, not posted (legacy ImportInvoice.java:53, MInvoice.java:1811-1814); completing it is the window's own button.
// TWIN RULES kept, only said in words (nothing softened): organisation * -> legacy's own "Invalid Org" from Import Invoice (ImportInvoice.java: AD_Org_ID must be > 0 for a document); a second invoice of
//   the same number / partner / type -> legacy's unique index c_invoice_documentno_target; the process's own error text for an unknown partner / product ("No BPartner" ...).
// NO per-window / per-table code: the table comes from the engine's answer (res.record.table), its window from ad_table.AD_Window_ID / PO_Window_ID, the key from the committed group.
// NOTHING is loaded before a drop: SheetJS, the engine, the readers and the attachment module come on the first drop (a page with no drop requests none of them).
// Reads the core only through published seams: window.APP, window.__crud (withModelTrx, applyOpGroup, withTipQuery, withSidecar), window.ModelLayer, window.AdProcess, window.__idmpAttach, window.IdmpHost.zoom.
(function () {
  'use strict';
  if (window.DoorDrop) return;
  // lazy loads: '<path>?v=CODE' literals are kept current by scripts/bump.js (erp/modules.json list of this file)
  var me = document.currentScript && document.currentScript.src, BASE = me ? me.replace(/[^\/]*(\?.*)?$/, '') : '';   // erp/overlay/
  var LOAD = [['XLSX', '../xlsx.mini.min.js?v=3120abba'], ['SheetDoor', '../sheet_door.js?v=d617587d'], ['SheetAddinExcel', '../sheet_addin/excel_host.js?v=75fb24e0'],
    ['SheetAddinXlsx', '../sheet_addin/xlsx_host.js?v=1b26dcdd'], ['SheetAddin', '../sheet_addin/host_shim.js?v=ed437ff0']];
  var TAGS = '_door_tags', chain = Promise.resolve(), first = true, last = null;

  function log(s) { try { console.log(s); } catch (e) { /* no console */ } }
  function el(tag, attrs, text) { var e = document.createElement(tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); if (text != null) e.textContent = text; return e; }
  function hasFiles(e) { var t = e.dataTransfer && e.dataTransfer.types; for (var i = 0; t && i < t.length; i++) if (t[i] === 'Files') return true; return false; }
  function onFileInput(e) { var t = e.target; return !!(t && t.closest && t.closest('input[type=file]')); }
  function dialogOpen() { return !!document.getElementById('att-ov'); }   // the Attachment dialog (ad_attachment.js): legacy's own drop area, not ours
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = BASE + src; s.onload = res; s.onerror = function () { rej(new Error(src.replace(/\?.*/, '') + ' could not be loaded')); }; document.head.appendChild(s); }); }
  function loadAll() { return LOAD.reduce(function (p, x) { return p.then(function () { return window[x[0]] ? null : loadScript(x[1]); }); }, Promise.resolve()); }

  // ── what the user is told: one line per file, plain words ──
  function noteBox() {
    var n = document.getElementById('door-drop-note'); if (n) return n;
    n = el('div', { id: 'door-drop-note', role: 'status', 'aria-live': 'polite' });
    n.style.cssText = 'position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:200;max-width:min(680px,92vw);padding:9px 34px 9px 14px;border-radius:6px;background:#1d2733;color:#fff;font:13px/1.45 system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.3)';
    var x = el('button', { type: 'button', 'aria-label': 'Close' }, '×'); x.style.cssText = 'position:absolute;right:6px;top:4px;border:0;background:transparent;color:#fff;font-size:18px;cursor:pointer';
    x.addEventListener('click', function () { n.remove(); }); n.appendChild(x); document.body.appendChild(n); return n;
  }
  function say(name, state, text) {
    var n = noteBox(), row = n.querySelector('[data-door-drop-file="' + String(name).replace(/"/g, '') + '"]');
    if (!row) { row = el('div', { 'data-door-drop-file': name }); n.appendChild(row); }
    row.setAttribute('data-state', state); row.textContent = (name ? name + ': ' : '') + text;
    log('§DOOR-DROP-SAY file="' + name + '" state=' + state + ' text="' + text + '"');
  }
  function resetNote() { var n = document.getElementById('door-drop-note'); if (n) n.remove(); }
  // legacy's own process text ("ERR=No BPartner, ") without its markup
  function plain(t) { return String(t || '').replace(/ERR=/g, '').replace(/\s*,\s*$/, '').replace(/\s+/g, ' ').trim(); }

  function tip(sql, args) { return window.__crud.withTipQuery(function (q) { return q(sql, args || []); }) || []; }
  function sidecarReady() { return new Promise(function (res) { var C = window.__crud; if (C && typeof C.withSidecar === 'function' && typeof C.kernelDb === 'function' && !C.kernelDb()) C.withSidecar(function () { res(); }); else res(); }); }
  function commit(ops) { return new Promise(function (res) { window.__crud.applyOpGroup(ops, function (cr) { res(cr || { committed: false }); }); }); }

  // the runner host_shim.fileIt calls: ONE Trx over the page's tip-shadowed books; on ok its op group is committed (a refusal commits nothing)
  function runner(out) {
    return { file: async function (tpl, cells, ledgerLines, noSavedResult) {
      await sidecarReady();
      var ML = window.ModelLayer, AP = window.AdProcess, box = null;
      window.__crud.withModelTrx(function (query, env) {
        var trx = new ML.Trx(query, env), r = window.SheetDoor.file(trx, { AP: AP, ML: ML }, tpl, cells, { AD_Client_ID: env.client, AD_Org_ID: env.org, noSavedResult: noSavedResult || [] });
        box = { r: r, ops: r.ok ? trx.groupOps() : [], log: trx.log };
      });
      if (!box) { out.r = { ok: false, verdict: 'REFUSED', reason: 'the books are not ready', writes: [], checks: [] }; return { result: out.r, ledgerLine: null, facts: null }; }
      var r = box.r; out.r = r; out.ops = box.ops;
      box.log.forEach(function (l) { if (/^§(SHEET_DOOR|IMPORT_INVOICE)/.test(l)) log(l); });
      if (r.ok) {
        var cr = await commit(box.ops); out.cr = cr;
        if (!cr.committed) { r.ok = false; r.verdict = 'REFUSED'; r.reason = 'the books did not accept it (' + (cr.reason || 'not committed') + ')'; }
      }
      return { result: r, ledgerLine: null, facts: null };
    } };
  }

  // the committed header record: its key from the group, its dictionary rows (table id, window)
  function whereIs(rec, ops, cr) {
    var t = String(rec.table).toLowerCase(), idx = -1;
    for (var i = 0; i < ops.length; i++) if (ops[i].op_type === 'CRUD_CREATE' && String(ops[i].table || ops[i].key).toLowerCase() === t) { idx = i; break; }
    var id = idx >= 0 && cr.ids && cr.ids[idx] != null ? -Number(cr.ids[idx]) : null;   // listTip gives a CRUD_CREATE row the pk -(kernel op id) (crud_overlay _resolveOpRefs)
    var d = tip('SELECT ad_table_id, ad_window_id, po_window_id FROM ad_table WHERE lower(tablename)=?', [t])[0] || {};
    var win = String(rec.issotrx) === 'N' && d.po_window_id != null ? d.po_window_id : d.ad_window_id;   // AEnv.getZoomWindowID: the table's window, its PO window for a purchase-side record
    // the committed row, read back: its key column is the dictionary's (AD_Column.IsKey), and its <Table>_UU is what the window's own Attachment button looks the record up by
    //   (MAttachment.get: Record_ID when > 0, else Record_UU; a record made in this session has a negative id) - so the attachment is saved under both, as the dialog does (ad_attachment.js ctxFor)
    var kc = (tip("SELECT columnname FROM ad_column WHERE ad_table_id=? AND iskey='Y'", [d.ad_table_id])[0] || {}).columnname, row = id != null && kc ? tip('SELECT * FROM ' + t + ' WHERE ' + kc + '=?', [id])[0] : null;
    return { id: row ? id : null, uu: row && row[t + '_uu'] != null ? String(row[t + '_uu']) : null, tableId: d.ad_table_id, windowId: win };
  }
  async function attach(rec, at, file, bytes) {
    var A = window.__idmpAttach; if (!A) throw new Error('the attachment module is not available');
    var AT = await A.load(); if (!AT) throw new Error('the attachment module did not load');
    var r = await AT.save(A.host(), { tableId: at.tableId, tableName: rec.table, recordId: at.id, recordUU: at.uu }, null, AT.addEntry([], file.name, bytes), '');
    log('§DOOR-DROP-ATTACH file="' + file.name + '" record=' + at.id + ' ok=' + r.ok + ' op=' + r.op + ' bytes=' + r.bytes + ' store=' + (r.store ? 1 : 0));
    return r;
  }

  // one file, from bytes to words. Returns { name, state: 'drafted'|'refused', text, ... }
  async function one(file) {
    var name = file.name, bytes = new Uint8Array(await file.arrayBuffer()), A = window.APP || {};
    var done = function (state, text, more) { say(name, state, text); var o = Object.assign({ name: name, state: state, text: text }, more || {}); log('§DOOR-DROP file="' + name + '" bytes=' + bytes.length + ' state=' + state); return o; };
    if (A.actor == null || A.clientId == null || !window.__idmpDb || !window.__crud) return done('refused', 'Log in first, then drop the file.');
    var zip = bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b, wb = null;
    if (zip) {
      try { await loadAll(); } catch (e) { log('§DOOR-DROP-ERROR load ' + (e && e.message)); return done('refused', 'The ERP could not load what it needs to read this file (' + (e && e.message) + ').'); }
      try { wb = window.XLSX.read(bytes, Object.assign({ type: 'array' }, window.SheetAddinXlsx.READ)); } catch (e) { wb = null; }   // a zip that is no workbook is a file with no marks
    }
    if (!wb || wb.SheetNames.indexOf(TAGS) < 0) return done('refused', 'This file is not marked for the ERP yet.');
    if (!A.orgId) return done('refused', 'Choose an organisation at login: a document cannot be filed under *.');   // legacy: Import Invoice refuses AD_Org_ID 0 (Invalid Org)
    var out = {}, host = window.SheetAddinXlsx.create(window.XLSX, wb, { engineValue: window.SheetAddinExcel.engineValue }), shim = window.SheetAddin.create(host, { SheetDoor: window.SheetDoor, runner: runner(out) });
    var res = await shim.fileIt(), r = out.r || res.result || {};
    if (!r.ok) { var why = plain(res.text || r.reason || res.verdict); return done('refused', (/^Not filed/i.test(why) ? why : 'Not filed: ' + why) + (/[.!]$/.test(why) ? '' : '.'), { verdict: r.verdict, committed: false }); }
    var rec = r.record, at = whereIs(rec, out.ops, out.cr), att = null, attErr = null;
    if (at.id == null) log('§DOOR-DROP-ERROR the committed record could not be found again (' + rec.table + ' ' + rec.documentno + ')');
    try { if (at.id == null) throw new Error('the new record could not be found'); att = await attach(rec, at, file, bytes); if (!att.ok) attErr = 'not saved'; } catch (e) { attErr = e && e.message || String(e); }
    var shown = false; try { shown = !!(window.IdmpHost && at.windowId != null && at.id != null && window.IdmpHost.zoom(at.windowId, null, at.id)); } catch (e) { shown = false; }
    var words = 'Drafted: ' + (rec.doctype || 'document') + ' ' + rec.documentno + ', ' + (r.invoice && r.invoice.docstatusname || 'In Progress') + '. Open it and press Complete.' + (attErr ? ' The file could not be attached (' + attErr + ').' : '');
    log('§DOOR-DROP-DRAFT file="' + name + '" table=' + rec.table + ' record=' + at.id + ' documentno=' + rec.documentno + ' window=' + at.windowId + ' shown=' + shown + ' attached=' + (!attErr) + ' ops=' + out.ops.length + ' gid=' + (out.cr && out.cr.gid));
    return done('drafted', words, { record: at.id, table: rec.table, documentno: rec.documentno, windowId: at.windowId, attached: !attErr, shown: shown });
  }

  function take(files) {
    var list = [].slice.call(files || []);
    var job = chain.then(async function () {
      var t0 = performance.now(), out = [], seen = [], obs = null;   // the resource timing buffer of a page this busy is full (250): what this drop brings is watched from here
      if (first && window.PerformanceObserver) { try { obs = new PerformanceObserver(function (l) { seen = seen.concat(l.getEntries()); }); obs.observe({ type: 'resource' }); } catch (e) { obs = null; } }
      resetNote();
      for (var i = 0; i < list.length; i++) {
        try { out.push(await one(list[i])); } catch (e) { say(list[i].name, 'refused', 'Could not read this file: ' + (e && e.message || e)); out.push({ name: list[i].name, state: 'refused', text: 'Could not read this file' }); log('§DOOR-DROP-ERROR file="' + list[i].name + '" ' + (e && e.stack || e)); }
      }
      if (first) {   // what the first drop cost: the files that came with it, their bytes, the time and the heap
        first = false;
        var rs = seen.concat(obs ? obs.takeRecords() : []); if (obs) obs.disconnect();
        var bytes = rs.reduce(function (s, x) { return s + (x.encodedBodySize || x.transferSize || 0); }, 0);
        log('§DOOR-DROP-COST first=Y files=' + list.length + ' requests=' + rs.length + ' bytes=' + bytes + ' ms=' + Math.round(performance.now() - t0) + ' heapMB=' + (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1) + ' loaded=' + rs.map(function (x) { return x.name.replace(/^.*\//, '').replace(/\?.*/, ''); }).join(','));
      }
      last = out; return out;
    });
    chain = job.catch(function () { /* the next drop starts clean */ });
    return job;
  }

  window.addEventListener('dragover', function (e) {
    if (e.defaultPrevented || !hasFiles(e) || onFileInput(e)) return;
    e.preventDefault(); try { e.dataTransfer.dropEffect = dialogOpen() ? 'none' : 'copy'; } catch (x) { /* read-only in some browsers */ }
  }, false);
  window.addEventListener('drop', function (e) {
    if (e.defaultPrevented || !hasFiles(e) || onFileInput(e)) return;
    e.preventDefault();                                   // never let the browser open the file in place of the ERP
    if (dialogOpen()) return;                              // the Attachment dialog is open: it is not ours
    take(e.dataTransfer.files);
  }, false);
  window.DoorDrop = { take: take, last: function () { return last; } };
  log('§DOOR-DROP overlay ready (nothing loaded until a file is dropped)');
})();
