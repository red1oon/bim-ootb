// edit_delta_ui.js — §S8 Modeller half: hover/click on an EDITED element shows what the edit changes in material cost + labour time.
// bim-compiler prompts/TM_4D5D_VARIANCE_LANE.md §S8; decision: prompts/RATES_SOURCE_OF_TRUTH.md §5 (2026-09-30). ⚠ DO NOT REMOVE.
// The Modeller carries NO rate table and NO duration formula. This file only DISPLAYS: on the FIRST hover/click of an edited element
// it lazily <script>-loads the Viewer-side owners read-only (../viewer/rates.js, ../erp/bigdecimal.js, ../viewer/schedule_author.js,
// ../viewer/edit_delta.js — the same way connect_scene.js is shared), then calls the ONE pure function EditDelta.deltaForEdit over the
// Open building's own DB (window.__dwBuf). Open time is unchanged (nothing here loads until a hover/click on an edited element).
// Events come from two additive dispatchEvent lines in modeller.html (setHover -> 'dagevu:hover', setSelectionIds -> 'dagevu:select').
(function () {
  'use strict';
  var SRC = ['../viewer/rates.js?v=7', '../viewer/locale_loader.js?v=12', '../erp/bigdecimal.js', '../viewer/schedule_author.js?v=14', '../viewer/edit_delta.js?v=2'];
  var _loading = null, _db = null, _dbBuf = null, _mx = 0, _my = 0, _hoverFid = null, _selFid = null, _seenEdited = {};

  function _load(src) {
    return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('load ' + src)); }; document.body.appendChild(s); });   // BODY (document-order last): locale_loader.js derives its base URL from the LAST <script> in the document
  }
  function _ensure() {
    if (window.EditDelta && window.ScheduleAuthor && window.BigDecimal && window.RATES) return Promise.resolve(true);
    if (!_loading) {
      var t0 = performance.now();
      // S226 §R3: the Modeller now runs the FULL loader at boot (UI language) — reuse it; only a page without it lazy-loads the owners
      var src = window._TRL_LOADER ? SRC.filter(function (u) { return u.indexOf('locale_loader.js') < 0; }) : SRC;
      if (!window._TRL_LOADER) window.__TRL_NO_AUTORUN = true;   // locale_loader.js: expose the owners WITHOUT the Viewer's UI side effects (toast / DOM translate)
      _loading = src.reduce(function (p, s) { return p.then(function () { return _load(s); }); }, Promise.resolve())
        // the price the Viewer uses IS the user's locale rate pack (locale_loader overrides RATES/LABOR_RATES) — apply it the same way, by the same owner
        .then(function () { return new Promise(function (res) { var L = window._TRL_LOADER, code = L.detectLocale(); L.fetchLocale(code, function (err, data) { if (data) { L.applyRateOverrides(data); window.__S8_LOCALE_CUR = data.cur || null; } console.log('§S8-LAZY locale=' + code + ' applied=' + !!data + ' IfcWallStandardCase.rate=' + (window.RATES.IfcWallStandardCase || {}).rate); res(); }); }); })
        .then(function () { console.log('§S8-LAZY modeller loaded viewer owners ms=' + (performance.now() - t0).toFixed(0)); return true; })
        .catch(function (e) { console.warn('§S8-LAZY LOAD_FAIL ' + e.message); _loading = null; return false; });
    }
    return _loading;
  }
  async function _dbFor() {
    if (!window.__dwBuf) return null;
    if (_db && _dbBuf === window.__dwBuf) return _db;
    var SQL = window.SQL || await window.initSqlJs({ locateFile: function (f) { return new URL('lib/' + f, location.href).href; } });
    var b = window.__dwBuf; _db = new SQL.Database(b instanceof Uint8Array ? b : new Uint8Array(b)); _dbBuf = b; return _db;
  }

  // The op-log record of an ARC element (used when the opened DB carries no element_transforms — e.g. a user .ifc opened directly, measured 2026-09-30):
  // class + local bbox extents from the signed seed row, discipline/storey from elements_meta when present. Never invented: absent -> null.
  function opRecord(guid, db) {
    var fid = (window.__arcFidByGuid || {})[guid]; if (fid == null || !window.Bonsai || !window.Bonsai.oplog || !window.Bonsai.oplog.db) return null;
    var op = window.Bonsai.oplog._geomOps().find(function (o) { return o.id === fid; }); var P = op && op.parameters; if (!P || !P.bbox || !P.ifc_class) return null;
    var b = P.bbox, rec = { guid: guid, cls: P.ifc_class, dims: [b[1] - b[0], b[3] - b[2], b[5] - b[4]], disc: '_', storey: '_', name: null };
    try { var r = db && db.exec("SELECT discipline, storey, element_name FROM elements_meta WHERE guid='" + String(guid).replace(/'/g, "''") + "'"); if (r && r.length && r[0].values.length) { rec.disc = r[0].values[0][0] || '_'; rec.storey = r[0].values[0][1] || '_'; rec.name = r[0].values[0][2]; } } catch (e) { }
    return rec;
  }

  // Compute the Δ line for a featureId at the CURRENT cursor. Returns {d,line} | null (null = nothing edited, nothing to show).
  async function compute(fid) {
    if (fid == null || !window.Bonsai || !window.Bonsai.oplog || !window.Bonsai.oplog.db) return null;
    var guid = (window.__arcGuidByFid || {})[fid]; if (!guid) return null;
    var O = window.Bonsai.oplog, ops = O._geomOps().slice(0, O.cursor);
    var hasEdit = ops.some(function (o) { var p = o.parameters || {}; return (o.op_type === 'GEOM_MOVE' || o.op_type === 'GEOM_SCALE' || o.op_type === 'GEOM_ROTATE' || o.op_type === 'GEOM_GRID_MOVE') && (p.parent === fid || (p.commands || []).some(function (c) { return c.featureId === fid; })); });
    if (!hasEdit && !_seenEdited[fid]) return null;          // never edited -> no line (silence is correct)
    if (!(await _ensure())) return null;
    var db = await _dbFor(); if (!db) return null;
    var ED = window.EditDelta, net = ED.netEdits(ops).get(fid) || null;
    var d = ED.deltaForEdit(db, guid, net, ED.envFromGlobals(), function (g) { return opRecord(g, db); }); if (!d) return null;
    if (hasEdit) _seenEdited[fid] = true;
    ED.logLine(d, 'modeller');
    return { d: d, line: hasEdit ? ED.line(d) : 'Δ 0 — edit undone (no quantity change)' };
  }

  function _el(id, css) { var e = document.getElementById(id); if (!e) { e = document.createElement('div'); e.id = id; e.style.cssText = css; document.body.appendChild(e); } return e; }
  var HOVER_CSS = 'position:fixed;z-index:9999;pointer-events:none;display:none;max-width:460px;background:rgba(10,10,30,0.92);color:#ffd166;font:11px/1.35 system-ui,sans-serif;padding:5px 9px;border-radius:5px;border:1px solid rgba(255,209,102,0.4)';
  var PIN_CSS = 'position:fixed;z-index:9998;left:14px;bottom:122px;display:none;max-width:560px;background:rgba(10,10,30,0.88);color:#ffd166;font:11px/1.35 system-ui,sans-serif;padding:5px 9px;border-radius:5px;border:1px solid rgba(255,209,102,0.35)';

  async function showHover() {
    var fid = _hoverFid, box = _el('s8-delta-label', HOVER_CSS);
    if (fid == null) { box.style.display = 'none'; return; }
    var r = await compute(fid);
    if (fid !== _hoverFid) return;                             // moved on while loading
    if (!r) { box.style.display = 'none'; return; }
    box.textContent = r.line; box.style.left = Math.min(_mx + 14, window.innerWidth - 480) + 'px'; box.style.top = (_my + 16) + 'px'; box.style.display = 'block';
  }
  async function showPin() {
    var fid = _selFid, box = _el('s8-delta-pin', PIN_CSS);
    if (fid == null) { box.style.display = 'none'; return; }
    var r = await compute(fid);
    if (fid !== _selFid) return;
    if (!r) { box.style.display = 'none'; return; }
    box.textContent = r.line; box.style.display = 'block';
  }

  window.addEventListener('pointermove', function (e) { _mx = e.clientX; _my = e.clientY; var b = document.getElementById('s8-delta-label'); if (b && b.style.display === 'block') { b.style.left = Math.min(_mx + 14, window.innerWidth - 480) + 'px'; b.style.top = (_my + 16) + 'px'; } });
  window.addEventListener('dagevu:hover', function (e) { _hoverFid = e.detail ? e.detail.fid : null; showHover(); });
  window.addEventListener('dagevu:select', function (e) { _selFid = e.detail ? e.detail.fid : null; showPin(); });
  // an edit/undo changes the numbers under a still cursor / still selection -> refresh both (after the fold settles a tick)
  window.addEventListener('bonsai:oplog', function () { setTimeout(function () { showPin(); showHover(); }, 60); });
  window.EditDeltaUI = { compute: compute, ensure: _ensure, opRecord: opRecord, _seen: _seenEdited };
})();
