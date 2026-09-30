// proj_order_ui.js — §S9 Modeller half: read + open the ERP Project Order of the SELECTED parts (bim-compiler prompts/TM_4D5D_VARIANCE_LANE.md §S9).
// ⚠ DO NOT REMOVE. The Modeller carries NO fold logic, NO rates, NO ERP schema. On the FIRST click of the "ERP" button it lazily <script>-loads the
// Viewer-side owners read-only (proj_fold.js, vo_fold.js, proj_control.js, proj_order_state.js — plus everything edit_delta_ui.js already loads) and calls
// ProjOrderState (the ONE owner, also used by the Viewer's › ERP path). Nothing loads at Open, nothing loads on selection: the 27 MB ERP seed is only
// fetched when the user asks (button click) and only if the OPFS project-orders store the Viewer/ERP already share is absent.
// red1's flow: no Project Order -> Generate. Has one and the part is EDITED -> a VARIANT item of that same order: A) Delete & re-issue (only while NOT
// committed) or B) Variation Order (required once committed). "Committed" is read from records (ProjOrderState.readState).
(function () {
  'use strict';
  var SRC = ['../viewer/proj_fold.js?v=3', '../viewer/vo_fold.js?v=2', '../viewer/proj_control.js?v=1', '../viewer/proj_order_state.js?v=2'];
  var _loaded = null, _store = null, _busy = false, _sel = [];

  function _load(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('load ' + src)); }; document.body.appendChild(s); }); }
  function _ensure() {
    if (!_loaded) {
      _loaded = (window.EditDeltaUI && window.EditDeltaUI.ensure ? window.EditDeltaUI.ensure() : Promise.resolve(false)).then(function (ok) {
        if (!ok) throw new Error('edit_delta owners not available');
        return SRC.reduce(function (p, s) { return p.then(function () { return _load(s); }); }, Promise.resolve());
      }).then(function () { console.log('§S9-LAZY modeller loaded ERP owners'); return true; }).catch(function (e) { console.warn('§S9-LAZY LOAD_FAIL ' + e.message); _loaded = null; return false; });
    }
    return _loaded;
  }
  function _env() {
    var e = window.EditDelta.envFromGlobals();
    e.EditDelta = window.EditDelta; e.ProjFold = window.ProjFold; e.VoFold = window.VoFold; e.ProjControl = window.ProjControl; e.RATES_DEFAULT = window.RATES_DEFAULT;
    return e;
  }
  function _now() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }
  function _cur() { return window.__S8_LOCALE_CUR || 'RM'; }
  function _building() { return window.ProjOrderState.projectKey(window.__dwName); }   // the ERP Project Value = the Viewer's building label for this resident

  // the selection -> {guids, edits(by guid), edited}
  function _selection() {
    var O = window.Bonsai && window.Bonsai.oplog, ids = Array.from((window.Bonsai && window.Bonsai._selSet) || []);
    var g = window.__arcGuidByFid || {}, ED = window.EditDelta, guids = [], fidOf = {};
    ids.forEach(function (f) { if (g[f]) { guids.push(g[f]); fidOf[g[f]] = f; } });
    var net = (ED && O && O.db) ? ED.netEdits(O._geomOps().slice(0, O.cursor)) : new Map();
    var edits = {}, edited = false;
    guids.forEach(function (gu) { var n = net.get(fidOf[gu]); if (n && (n.fx !== 1 || n.fy !== 1 || n.fz !== 1)) { edits[gu] = n; edited = true; } });
    return { guids: guids, edits: edits, edited: edited };
  }

  async function _db() {
    if (_store) return _store;
    var SQL = window.SQL || await window.initSqlJs({ locateFile: function (f) { return new URL('lib/' + f, location.href).href; } });
    _store = await window.ProjOrderState.openStore(SQL, function () { return fetch('../erp/ad_seed.db').then(function (r) { if (!r.ok) throw new Error('seed HTTP ' + r.status); return r.arrayBuffer(); }); });
    return _store;
  }

  var PANEL_CSS = 'position:fixed;z-index:9998;left:14px;bottom:172px;display:none;width:min(560px,92vw);background:rgba(10,10,30,0.94);color:#dfe6f2;font:12px/1.4 system-ui,sans-serif;padding:8px 10px;border-radius:6px;border:1px solid rgba(79,195,247,0.45)';
  var BTN_CSS = 'position:fixed;z-index:9998;left:14px;bottom:84px;display:none;background:rgba(10,10,30,0.9);color:#4fc3f7;font:12px system-ui,sans-serif;padding:4px 10px;border-radius:5px;border:1px solid rgba(79,195,247,0.45);cursor:pointer';
  function _el(id, tag, css) { var e = document.getElementById(id); if (!e) { e = document.createElement(tag || 'div'); e.id = id; e.style.cssText = css; document.body.appendChild(e); } return e; }

  function _btn(id, label, title, onclick, disabled) {
    var b = document.createElement('button'); b.id = id; b.textContent = label; b.title = title || ''; b.disabled = !!disabled;
    b.style.cssText = 'margin:4px 6px 0 0;padding:3px 9px;border-radius:4px;border:1px solid rgba(79,195,247,0.5);background:' + (disabled ? '#222' : '#12384f') + ';color:' + (disabled ? '#777' : '#e8f6ff') + ';cursor:' + (disabled ? 'not-allowed' : 'pointer');
    if (!disabled) b.onclick = onclick; return b;
  }
  function _money(s) { var n = Number(s); return isNaN(n) ? String(s) : n.toLocaleString(undefined, { maximumFractionDigits: 2 }); }

  async function render(msg) {
    var panel = _el('s9-panel', 'div', PANEL_CSS), sel = _selection();
    if (!sel.guids.length) { panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    if (!(await _ensure())) { panel.textContent = 'ERP owners could not be loaded.'; return; }
    var PS = window.ProjOrderState, env = _env(), st = await _db(), db = st.db, building = _building();
    var priced = PS.pricedRowsFor(await _bdb(), sel.guids, env, sel.edits);
    var classes = priced.rows.map(function (r) { return r.cls; });
    var state = PS.readState(db, building, classes, env), dec = PS.decide(state, sel.edited);
    var sumCost = priced.rows.reduce(function (s, r) { return s + r.cost; }, 0);
    // scope note, from records: does the Project Order hold MORE for these classes than the selected (unedited) parts price at? Then A re-issues from the selection only.
    var base = PS.pricedRowsFor(await _bdb(), sel.guids, env, null), baseCost = base.rows.reduce(function (s, r) { return s + r.cost; }, 0);
    var poForClasses = state.generated ? state.lines.filter(function (l) { return classes.indexOf(l.cls) >= 0; }).reduce(function (s, l) { return s + Number(l.amt); }, 0) : 0;
    var scopeNote = state.generated && state.inPO.length && poForClasses !== baseCost ? (poForClasses > baseCost ? 'more' : 'less') : null;
    console.log('§S9-STATE building=' + building + ' parts=' + sel.guids.length + ' edited=' + sel.edited + ' generated=' + state.generated + (state.generated ? ' project=' + state.projectId + ' plannedAmt=' + state.plannedAmt + ' committed=' + state.committed.is + ' vos=' + state.vos.length : '') +
      ' kind=' + dec.kind + ' actions=' + dec.actions.join('|') + ' partsCost=' + sumCost + ' scopeNote=' + (scopeNote || 'none') + ' store=' + st.src);
    var html = '<div style="color:#4fc3f7;font-weight:bold">ERP · Project Order for ' + sel.guids.length + ' selected part' + (sel.guids.length > 1 ? 's' : '') + '</div>';
    if (!state.generated || !state.inPO.length) html += '<div id="s9-state">Not generated yet. These parts price at <b>' + _cur() + ' ' + _money(sumCost) + '</b> (' + priced.rows.length + ' line' + (priced.rows.length > 1 ? 's' : '') + ').</div>';
    else {
      html += '<div id="s9-state">Project Order <b>' + state.value + '</b> (#' + state.projectId + ') · planned <b>' + _cur() + ' ' + _money(state.plannedAmt) + '</b> · ' + state.lines.length + ' line(s) · ' +
        (state.committed.is ? 'committed to a vendor (' + state.committed.why.join('; ') + ')' : 'not committed') + (state.vos.length ? ' · ' + state.vos.length + ' Variation Order(s)' : '') + '</div>';
      if (state.contract) html += '<div style="opacity:.75">Contract: original ' + _money(state.contract.original) + ' + approved VOs ' + _money(state.contract.approvedVOs) + ' = revised ' + _money(state.contract.revised) + '</div>';
      if (scopeNote) html += '<div id="s9-scope" style="color:#ffcf8b">Note: the Project Order holds ' + scopeNote + ' for these classes (' + _money(poForClasses) + ') than the selected parts price at (' + _money(baseCost) + ') - A re-issues from the selected parts only.</div>';
      if (dec.kind === 'variant') html += '<div style="color:#ffd166" id="s9-variant">These parts are edited: a variant item of this Project Order. Choose A or B.</div>';
    }
    if (msg) html += '<div id="s9-msg" style="color:#8be28b">' + msg + '</div>';
    panel.innerHTML = html;
    var row = document.createElement('div'); panel.appendChild(row);
    if (dec.actions.indexOf('generate') >= 0) row.appendChild(_btn('s9-generate', 'Generate Project Order', 'Fold these parts into a new C_Project (the same engine as the Viewer › ERP button)', function () { act('generate'); }));
    if (dec.kind === 'variant') {
      row.appendChild(_btn('s9-a', 'A · Delete & re-issue (from the selection)', dec.refuseDeleteReissue ? 'Not allowed: ' + dec.refuseDeleteReissue : 'Delete this Project Order and issue a fresh one from the edited parts (work has not started)', function () { act('deleteReissue'); }, !!dec.refuseDeleteReissue));
      row.appendChild(_btn('s9-b', 'B · Issue Variation Order', 'Add the change as a Variation Order on the same Project Order', function () { act('issueVO'); }));
      if (dec.refuseDeleteReissue) { var r = document.createElement('div'); r.id = 's9-refuse'; r.style.cssText = 'color:#ff9b9b;margin-top:4px'; r.textContent = 'A is not available: ' + dec.refuseDeleteReissue; panel.appendChild(r); }
    }
    if (state.generated) { var a = document.createElement('a'); a.id = 's9-open'; a.textContent = 'Open in ERP ↗'; a.href = state.url; a.target = '_blank'; a.rel = 'noopener'; a.style.cssText = 'margin-left:6px;color:#4fc3f7'; row.appendChild(a); }
  }

  var _bdbCache = null, _bdbBuf = null;
  async function _bdb() {   // the Open building's own DB (window.__dwBuf), as edit_delta_ui.js
    var b = window.__dwBuf; if (_bdbCache && _bdbBuf === b) return _bdbCache;
    var SQL = window.SQL || await window.initSqlJs({ locateFile: function (f) { return new URL('lib/' + f, location.href).href; } });
    _bdbCache = new SQL.Database(b instanceof Uint8Array ? b : new Uint8Array(b)); _bdbBuf = b; return _bdbCache;
  }

  async function act(kind) {
    if (_busy) return; _busy = true;
    try {
      var PS = window.ProjOrderState, env = _env(), st = await _db(), db = st.db, building = _building(), sel = _selection();
      var bdb = await _bdb(), priced = PS.pricedRowsFor(bdb, sel.guids, env, sel.edits);
      var state = PS.readState(db, building, priced.rows.map(function (r) { return r.cls; }), env), msg = '';
      if (kind === 'generate') { var r = PS.generate(db, building, priced.rows, env, _now(), _cur()); msg = 'Generated Project Order #' + r.projectId + ' · planned ' + _money(r.plannedAmt) + '.'; }
      else if (kind === 'deleteReissue') { var d = PS.deleteReissue(db, building, priced.rows, env, _now(), _cur(), state); msg = d.ok ? 'Deleted and re-issued: Project Order #' + d.result.projectId + ' · planned ' + _money(d.result.plannedAmt) + ' (' + d.projectRowsAfter + ' Project Order).' : 'Refused: ' + d.reason; }
      else if (kind === 'issueVO') { var vr = PS.voRowsForEdited(bdb, sel.guids, env), v = PS.issueVO(db, building, vr, env, _now(), _cur()); msg = 'Variation Order ' + (v.docNo || '') + ' issued · ' + _money(v.grandTotal) + ' (draft).'; }
      var ok = await PS.persist(db);
      console.log('§S9-ACT kind=' + kind + ' persisted=' + ok);
      await render(msg);
    } catch (e) { console.warn('§S9-ACT ERROR ' + kind + ' ' + (e && e.stack || e)); } finally { _busy = false; }
  }

  function refreshButton() {
    var b = _el('s9-erp-btn', 'button', BTN_CSS); b.textContent = 'ERP ▸ Project Order';
    b.title = 'Read / generate / open the ERP Project Order of the selected parts';
    b.onclick = function () { render(); };
    var has = window.Bonsai && window.Bonsai._selSet && window.Bonsai._selSet.size > 0;
    b.style.display = has ? 'block' : 'none';
    var p = document.getElementById('s9-panel'); if (p && !has) p.style.display = 'none';
  }
  window.addEventListener('dagevu:select', refreshButton);
  window.addEventListener('bonsai:oplog', function () { var p = document.getElementById('s9-panel'); if (p && p.style.display === 'block') setTimeout(function () { render(); }, 120); });
  window.ProjOrderUI = { render: render, act: act, selection: _selection, store: function () { return _db(); } };
})();
