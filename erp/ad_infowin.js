// SPDX-License-Identifier: GPL-2.0-only
// ⚠ DO NOT REMOVE — Scope guard. ad_infowin.js — the generic Info Window (iDempiere org.adempiere.webui.info.InfoWindow) driven by the
//   DICTIONARY (AD_InfoWindow + AD_InfoColumn), plus the per-table "subclass" hooks (InfoProductWindow) as registered plug-ins.
//   Spec: bim-compiler prompts/ERP_DEPTH_FILM.md §7 (every behaviour carries its Java file:line). Witnesses: W-INFOPROD-ONHAND, W-INFOPROD-PARITY.
//   READ THE §INFOWIN LOG after every run; a figure not traced to a §-line is not a result.
// AD-LAYER LAW: nothing here names a window. The engine reads AD_InfoWindow for the requested table; a table's lower tabs are a
//   registered hook (the Java subclass), exactly as DefaultInfoFactory.java:109 maps M_Product → InfoProductWindow.
// ONE stock truth: every figure is read through the tip-shadowed reader (window.__crud.withModelTrx) — records created THIS session live
//   in the signed sidecar, not the bundle (ERP_DEPTH_FILM.md §6). No second stock calculator.
(function (g) {
  'use strict';
  var HOOKS = {};   // upper(TableName) → { tabs:[{id,label,load(ctx,key,detail)->{cols,rows,totals?}}] , baseFilter(ctx)->sql|'' , defaultOrder(ctx)->str }
  function log(s) { try { console.log(s); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function sqlStr(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

  // Env.parseContextForSql (Env.java:1672-1760): every @Var@ / @WinNo|Var@ becomes a '?' with the value bound as a PARAMETER (Integer for *_ID, else string); an unresolvable
  //   token returns "" (the legacy caller logs "Failed to parsed sql" and runs nothing) unless ignoreUnparsable, which keeps the @Var@ text. '@@' = a literal '@'.
  //   Returns {sql, params} or null when unparsable. The SQL text otherwise reaches the DB UNTOUCHED - the stored functions run in the DB (here: the registered UDFs).
  function parseContextForSql(sql, ctx, ignoreUnparsable) {
    var out = '', params = [], inStr = String(sql == null ? '' : sql), i = inStr.indexOf('@');
    while (i !== -1) {
      out += inStr.slice(0, i); inStr = inStr.slice(i + 1);
      var j = inStr.indexOf('@'); if (j < 0) { out += '@'; break; }
      if (j === 0) { out += '@'; inStr = inStr.slice(1); i = inStr.indexOf('@'); continue; }
      var token = inStr.slice(0, j), name = token.replace(/^\d+\|/, '').replace(/:[^@]*$/, ''), v = ctx[name];
      if (v == null || String(v) === '') { if (!ignoreUnparsable) return null; out += '@' + token + '@'; }
      else { out += '?'; params.push(/_ID$/.test(name) && !isNaN(Number(v)) ? Number(v) : String(v)); }
      inStr = inStr.slice(j + 1); i = inStr.indexOf('@');
    }
    return { sql: out + inStr, params: params };
  }

  // ── data access: the tip-shadowed reader (bundle + this session's signed sidecar)
  function conv(sql) { return g.AdCallout && g.AdCallout.convertSql ? g.AdCallout.convertSql(sql) : sql; }   // the legacy Convert layer applies to every statement (Convert_PostgreSQL)
  function tipQ(sql, params) {
    sql = conv(sql);
    if (g.__crud && typeof g.__crud.withModelTrx === 'function') {
      var r = g.__crud.withModelTrx(function (q) { try { return { rows: q(sql, params || []) }; } catch (e) { return { err: e }; } });   // withModelTrx binds the stored-function UDFs (crud_overlay _coBindUdf)
      if (r && r.err) throw r.err;
      if (r && r.rows) return r.rows;
    }
    log('§INFOWIN tip=UNAVAILABLE (bundle-only read — figures from this session would be MISSING)');
    var A = g.AdCallout, db = g.__idmpDb;
    if (A && A.RUNTIME && A.RUNTIME.registerSqlFunctions && db && !db.__udfBound) { try { A.RUNTIME.registerSqlFunctions(function (n, f) { db.create_function(n, f); }); db.__udfBound = true; } catch (e) { log('§INFOWIN udf-register failed ' + e); } }
    var d = db.exec(sql, params || []); if (!d.length) return [];
    return d[0].values.map(function (v) { var o = {}; d[0].columns.forEach(function (c, i) { o[c.toLowerCase()] = v[i]; }); return o; });
  }
  function adQ(sql, params) { var d = g.__idmpDb.exec(sql, params || []); if (!d.length) return []; return d[0].values.map(function (v) { var o = {}; d[0].columns.forEach(function (c, i) { o[c.toLowerCase()] = v[i]; }); return o; }); }

  function stripAs(sel) { var u = sel.toUpperCase(), k = u.lastIndexOf(' AS '); return k > 0 && sel.slice(k + 4).indexOf(')') < 0 ? sel.slice(0, k) : sel; }
  var _probe = {};   // selectclause+from → ok bool
  function colOk(expr, from, params) {
    var key = expr + '||' + from; if (key in _probe) return _probe[key];
    var ok = true; try { tipQ('SELECT ' + expr + ' AS x FROM ' + from + ' LIMIT 1', params || []); } catch (e) { ok = false; log('§INFOWIN-COL-SKIP expr=' + expr.slice(0, 80) + ' (' + String(e.message || e).slice(0, 70) + ') → blank, named-deferred'); }
    _probe[key] = ok; return ok;
  }

  function fmtQty(v) { if (v == null || v === '') return ''; var n = Number(v); return isNaN(n) ? String(v) : (Math.round(n * 1e6) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 6 }); }
  function fmtAmt(v) { if (v == null || v === '') return ''; var n = Number(v); return isNaN(n) ? String(v) : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtCell(v, ref) { if (ref === 20 || ref === 17) return v === 'Y' ? '☑' : (v === 'N' ? '☐' : ''); if (ref === 29) return fmtQty(v); if (ref === 37 || ref === 12) return fmtAmt(v); return v == null ? '' : String(v); }

  // ── dictionary → definition (InfoWindow constructor / loadInfoWindowData)
  function definition(tableName, clientId) {
    var iw = adQ('SELECT w.* FROM ad_infowindow w JOIN ad_table t ON t.ad_table_id=w.ad_table_id WHERE UPPER(t.tablename)=UPPER(?) AND w.isactive=\'Y\' AND w.ad_client_id IN (0,?) ORDER BY w.ad_client_id DESC, w.ad_infowindow_id', [tableName, clientId || 0])[0];
    if (!iw) return null;
    var cols = adQ('SELECT * FROM ad_infocolumn WHERE ad_infowindow_id=? AND isactive=\'Y\' ORDER BY seqno', [iw.ad_infowindow_id]);
    var m = /^\s*(\w+)\s+(\w+)/.exec(iw.fromclause || '');
    return { iw: iw, cols: cols, table: m ? m[1] : tableName, alias: m ? m[2] : '', keycol: tableName + '_ID' };
  }

  // InfoWindow.getSQLFilter (InfoWindow.java:1385-1500) -> criteria WHERE; selectclause '0' columns only publish context. PURE (no DOM): the window and W-INFOWIN-SQL both call it.
  //   Assembly follows InfoWindow.java:1757-1773 - the dictionary SelectClause/FromClause/WhereClause text is concatenated as written and the context variables become bound '?' parameters.
  //   Returns {sql, params}, or null when a context variable is unresolvable (legacy: nothing runs). `probe` = true skips a column the twin cannot resolve (named-deferred, blank).
  function buildInfoSql(def, c, critVals, hook, client, disp) {
    var where = [], cparams = [];
    critVals.forEach(function (x) {
      var cc = x.def, v = x.value;
      if (v == null || String(v).trim() === '' || cc.selectclause === '0') return;
      var col = stripAs(cc.selectclause), op = cc.queryoperator || '=', fnc = cc.queryfunction, clause = col;
      if (fnc && fnc.trim()) clause = fnc.indexOf('?') >= 0 ? fnc.replace('?', col) : fnc + '(' + col + ')';
      var up = clause.toUpperCase().indexOf('UPPER(') === 0, val = v;
      if (op === 'Like' || op === 'LIKE') { op = 'LIKE'; if (!/%$/.test(val)) val += '%'; }
      else if (op === 'FullLike') { op = 'LIKE'; if (!/^%/.test(val)) val = '%' + val; if (!/%$/.test(val)) val += '%'; }
      where.push(clause + ' ' + op + (up ? ' UPPER(?)' : ' ?')); cparams.push(val);
    });
    var extra = hook.baseFilter ? hook.baseFilter(c, def) : '';
    var fromP = parseContextForSql(def.iw.fromclause, c); if (!fromP) return null;
    var fromSql = fromP.sql.replace(/\s+/g, ' ');
    var baseTxt = [def.alias + '.ad_client_id IN (0,' + (Number(client) || 0) + ')'].concat(def.iw.whereclause ? ['(' + def.iw.whereclause + ')'] : [], extra ? [extra] : []).join(' AND ');
    var baseP = parseContextForSql(baseTxt, c); if (!baseP) return null;
    var cols = [def.alias + '.' + def.keycol + ' AS k'], colParams = [];
    for (var i = 0; i < disp.length; i++) {
      var pc = parseContextForSql(stripAs(disp[i].selectclause), c); if (!pc) return null;
      var ok = colOk(pc.sql, fromSql, pc.params.concat(fromP.params));
      if (ok) { cols.push(pc.sql + ' AS c' + i); colParams = colParams.concat(pc.params); } else cols.push('NULL AS c' + i);
    }
    var order = def.iw.orderbyclause || (hook.defaultOrder ? hook.defaultOrder(c, def, disp) : ''), ordP = parseContextForSql(order, c); if (!ordP) return null;
    var sql = 'SELECT ' + cols.join(', ') + ' FROM ' + fromSql + ' WHERE ' + baseP.sql + (where.length ? ' AND (' + where.join(' AND ') + ')' : '') + (ordP.sql ? ' ORDER BY ' + ordP.sql : '') + ' LIMIT ' + (Number(def.iw.maxqueryrecords) || 1000);
    return { sql: sql, params: colParams.concat(fromP.params, baseP.params, cparams, ordP.params) };   // textual order of the '?' in the final statement
  }

  // ── open
  function open(opts) {
    opts = opts || {};
    var tableName = opts.tableName || 'M_Product', client = opts.clientId, doc = document;
    var def = definition(tableName, client);
    if (!def) { log('§INFOWIN table=' + tableName + ' NO-DEFINITION (no AD_InfoWindow row) — nothing to open'); return null; }
    var hook = HOOKS[tableName.toUpperCase()] || {};
    var old = doc.getElementById('idmp-infowin'); if (old) old.remove();
    var ctx = Object.assign({}, opts.ctx || {});
    // initParameters (InfoProductWindow.java): warehouse default from the login context
    if (hook.initContext) hook.initContext(ctx, opts);
    var crit = def.cols.filter(function (c) { return c.isquerycriteria === 'Y'; });
    var disp = def.cols.filter(function (c) { return c.isdisplayed === 'Y'; });
    log('§INFOWIN open table=' + tableName + ' infowindow=' + def.iw.ad_infowindow_id + ' "' + def.iw.name + '" criteria=' + crit.length + ' displayed=' + disp.length + ' ctx=' + JSON.stringify(ctx));

    var ov = doc.createElement('div'); ov.id = 'idmp-infowin';
    ov.style.cssText = 'position:fixed;inset:0;z-index:96;background:rgba(0,0,0,.42);display:flex;align-items:center;justify-content:center';
    var box = doc.createElement('div');
    box.style.cssText = 'background:var(--idmp-panel,#fff);color:var(--idmp-fg,#1c1c1c);border:1px solid var(--idmp-border,#c9c9c9);border-radius:6px;width:min(1180px,96vw);height:min(760px,92vh);display:flex;flex-direction:column;box-shadow:0 8px 28px rgba(0,0,0,.35);font:13px system-ui';
    ov.appendChild(box);
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    var title = doc.createElement('div'); title.textContent = def.iw.name; title.style.cssText = 'font-weight:700;padding:8px 14px;border-bottom:1px solid var(--idmp-border,#e0e0e0);display:flex;justify-content:space-between';
    var x = doc.createElement('button'); x.textContent = '✕'; x.title = 'Close'; x.onclick = function () { ov.remove(); }; title.appendChild(x); box.appendChild(title);

    // criteria panel (InfoWindow.renderParameterPane)
    var cp = doc.createElement('div'); cp.id = 'idmp-infowin-crit'; cp.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:6px 14px;padding:10px 14px;border-bottom:1px solid var(--idmp-border,#e0e0e0)';
    var editors = {};
    crit.forEach(function (c) {
      if (c.ad_reference_id === 35) return;   // ASI editor (InfoPAttributeInstance) — named-deferred
      var lab = doc.createElement('label'); lab.style.cssText = 'display:flex;flex-direction:column;gap:2px;font-size:11px;color:var(--idmp-muted,#555)'; lab.appendChild(doc.createTextNode(c.name));
      var ed;
      if (c.ad_reference_id === 19 || c.ad_reference_id === 30) {   // TableDir / Search → a picker over the referenced table (name column)
        ed = doc.createElement('select'); var tn = c.columnname.replace(/_ID$/i, '');
        var opt = doc.createElement('option'); opt.value = ''; opt.textContent = ''; ed.appendChild(opt);
        try { adQ('SELECT ' + c.columnname + ' AS k, name AS n FROM ' + tn + " WHERE isactive='Y' AND ad_client_id IN (0," + (Number(client) || 0) + ') ORDER BY name LIMIT 500').forEach(function (r) { var o = doc.createElement('option'); o.value = r.k; o.textContent = r.n; ed.appendChild(o); }); } catch (e) { log('§INFOWIN-COL-SKIP picker ' + c.columnname); }
      } else if (c.ad_reference_id === 17 || c.ad_reference_id === 20) {
        ed = doc.createElement('select'); [['', ''], ['Y', 'Yes'], ['N', 'No']].forEach(function (p) { var o = doc.createElement('option'); o.value = p[0]; o.textContent = p[1]; ed.appendChild(o); });
      } else { ed = doc.createElement('input'); ed.type = 'text'; ed.addEventListener('keydown', function (e) { if (e.key === 'Enter') refresh(); }); }
      ed.setAttribute('data-col', c.columnname); lab.appendChild(ed); cp.appendChild(lab); editors[c.columnname] = { el: ed, def: c };
    });
    if (ctx.M_Warehouse_ID && editors.M_Warehouse_ID) editors.M_Warehouse_ID.el.value = ctx.M_Warehouse_ID;
    box.appendChild(cp);
    var bar = doc.createElement('div'); bar.style.cssText = 'padding:6px 14px;display:flex;gap:8px;border-bottom:1px solid var(--idmp-border,#e0e0e0)';
    var bRef = doc.createElement('button'); bRef.textContent = 'Refresh'; bRef.setAttribute('data-act', 'refresh'); bRef.onclick = function () { refresh(); };
    var bRst = doc.createElement('button'); bRst.textContent = 'Reset'; bRst.setAttribute('data-act', 'reset'); bRst.onclick = function () { Object.keys(editors).forEach(function (k) { if (k !== 'M_Warehouse_ID') editors[k].el.value = ''; }); };
    var cnt = doc.createElement('span'); cnt.id = 'idmp-infowin-count'; cnt.style.cssText = 'margin-left:auto;color:var(--idmp-muted,#555)';
    bar.appendChild(bRef); bar.appendChild(bRst); bar.appendChild(cnt); box.appendChild(bar);

    var resWrap = doc.createElement('div'); resWrap.style.cssText = 'flex:1 1 55%;overflow:auto;min-height:80px'; box.appendChild(resWrap);
    var south = doc.createElement('div'); south.style.cssText = 'flex:0 0 38%;border-top:2px solid var(--idmp-border,#c9c9c9);display:flex;flex-direction:column;min-height:120px'; box.appendChild(south);
    var tabsBar = doc.createElement('div'); tabsBar.style.cssText = 'display:flex;gap:2px;padding:3px 8px 0'; south.appendChild(tabsBar);
    var tabBody = doc.createElement('div'); tabBody.style.cssText = 'flex:1;overflow:auto;padding:6px 10px'; south.appendChild(tabBody);
    doc.body.appendChild(ov);

    var state = { rows: [], sel: null, tab: 0, detail: false, lastSql: '' };

    function currentCtx() {
      var c = Object.assign({}, ctx);
      Object.keys(editors).forEach(function (k) { c[k] = editors[k].el.value; });
      return c;
    }
    function buildSql(c) {
      return buildInfoSql(def, c, crit.map(function (cc) { var ed = editors[cc.columnname]; return { def: cc, value: ed ? ed.el.value : '' }; }), hook, client, disp);
    }
    function refresh() {
      var c = currentCtx(), b = buildSql(c);
      if (!b) { log('§INFOWIN parse-FAILED unresolved context variable (Env.parseContextForSql returned "") ctx=' + JSON.stringify(c)); state.lastSql = ''; state.rows = []; resWrap.innerHTML = ''; cnt.textContent = '0 record(s)'; return; }
      state.lastSql = b.sql;
      var rows; try { rows = tipQ(b.sql, b.params); } catch (e) { log('§INFOWIN query-ERROR ' + String(e.message || e).slice(0, 160) + ' sql=' + b.sql.slice(0, 200)); rows = []; }
      state.rows = rows; state.sel = null;
      var h = '<table class="idmp-infowin-grid" style="border-collapse:collapse;width:100%"><thead><tr>' + disp.map(function (d) { return '<th style="text-align:' + (d.ad_reference_id === 29 || d.ad_reference_id === 37 ? 'right' : 'left') + ';padding:3px 8px;border-bottom:1px solid #aaa;position:sticky;top:0;background:var(--idmp-panel,#fff)">' + esc(d.name) + '</th>'; }).join('') + '</tr></thead><tbody>';
      rows.forEach(function (r, ri) { h += '<tr data-key="' + esc(r.k) + '" data-ri="' + ri + '" style="cursor:pointer">' + disp.map(function (d, i) { return '<td data-col="' + esc(d.columnname) + '" data-v="' + esc(r['c' + i]) + '" style="padding:3px 8px;border-bottom:1px solid #eee;text-align:' + (d.ad_reference_id === 29 || d.ad_reference_id === 37 ? 'right' : 'left') + '">' + esc(fmtCell(r['c' + i], d.ad_reference_id)) + '</td>'; }).join('') + '</tr>'; });
      resWrap.innerHTML = h + '</tbody></table>';
      cnt.textContent = rows.length + ' record(s)';
      Array.prototype.forEach.call(resWrap.querySelectorAll('tbody tr'), function (tr) { tr.addEventListener('click', function () { select(Number(tr.getAttribute('data-ri'))); }); });
      log('§INFOWIN refresh table=' + tableName + ' rows=' + rows.length + ' ctx=' + JSON.stringify({ M_Warehouse_ID: c.M_Warehouse_ID }) + ' sql=' + b.sql.replace(/\s+/g, ' ').slice(0, 260));
      if (rows.length) log('§INFOWIN row0 ' + JSON.stringify(disp.reduce(function (o, d, i) { o[d.columnname] = rows[0]['c' + i]; return o; }, { key: rows[0].k })));
      renderTabs();
      if (rows.length) select(0);
    }
    function select(ri) {
      state.sel = state.rows[ri];
      Array.prototype.forEach.call(resWrap.querySelectorAll('tbody tr'), function (tr) { tr.style.background = Number(tr.getAttribute('data-ri')) === ri ? 'var(--idmp-hover,#dbe8fb)' : ''; });
      loadTab();
    }
    function renderTabs() {
      tabsBar.innerHTML = '';
      (hook.tabs || []).forEach(function (t, i) {
        var b = doc.createElement('button'); b.textContent = t.label; b.setAttribute('data-tab', t.id); b.style.cssText = 'padding:3px 10px;border:1px solid #bbb;border-bottom:none;background:' + (i === state.tab ? 'var(--idmp-hover,#dbe8fb)' : 'transparent');
        b.onclick = function () { state.tab = i; renderTabs(); loadTab(); }; tabsBar.appendChild(b);
      });
      tabBody.innerHTML = '';
    }
    function loadTab() {
      var t = (hook.tabs || [])[state.tab]; if (!t || !state.sel) { tabBody.innerHTML = ''; return; }
      var c = currentCtx(), res = t.load(c, state.sel.k, state);
      var h = '';
      if (t.detailToggle) h += '<label><input type="checkbox" data-act="detail" ' + (state.detail ? 'checked' : '') + '> ' + esc(t.detailToggle) + '</label>';
      if (res.text != null) h += '<div data-tab-body="' + t.id + '" style="white-space:pre-wrap">' + esc(res.text) + '</div>';
      else {
        h += '<table data-tab-body="' + t.id + '" style="border-collapse:collapse;width:100%"><thead><tr>' + res.cols.map(function (cn) { return '<th style="text-align:left;padding:2px 8px;border-bottom:1px solid #aaa">' + esc(cn) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          res.rows.map(function (r) { return '<tr>' + r.map(function (v, i) { return '<td data-v="' + esc(v) + '" style="padding:2px 8px;border-bottom:1px solid #eee;text-align:' + (typeof v === 'number' ? 'right' : 'left') + '">' + esc(typeof v === 'number' ? fmtQty(v) : v) + '</td>'; }).join('') + '</tr>'; }).join('') +
          (res.totals ? '<tr style="font-weight:700">' + res.totals.map(function (v) { return '<td style="padding:2px 8px;text-align:' + (typeof v === 'number' ? 'right' : 'left') + '">' + esc(typeof v === 'number' ? fmtQty(v) : v) + '</td>'; }).join('') + '</tr>' : '') + '</tbody></table>';
      }
      tabBody.innerHTML = h;
      var dt = tabBody.querySelector('[data-act="detail"]'); if (dt) dt.addEventListener('change', function () { state.detail = dt.checked; loadTab(); });
      log('§INFOWIN tab=' + t.id + ' key=' + state.sel.k + ' rows=' + (res.rows ? res.rows.length : 0) + (res.rows && res.rows.length ? ' row0=' + JSON.stringify(res.rows[0]) : '') + (res.totals ? ' totals=' + JSON.stringify(res.totals) : ''));
    }
    renderTabs();
    return { refresh: refresh, el: ov, state: state, buildSql: function () { return buildSql(currentCtx()); }, set: function (col, v) { if (editors[col]) editors[col].el.value = v; } };
  }

  // ═══ InfoProductWindow hooks (the Java subclass) ═══════════════════════════════════════════════════════════════════════════════════════
  // InfoProductWindow.renderContentPane (java:316-326) / initAtpTab (java:882-935): the tab statements, text as written in the Java, run against the DB objects the legacy runs them on
  //   (M_PRODUCT_STOCK_V, M_Storage - both real views now, shipped by erp/patches/build_views_patch.py - plus M_LocatorType and the productAttribute() function). Pure builders: W-INFOWIN-SQL runs the same text on legacy.
  function stockSql() { return 'SELECT Warehouse AS wh, sum(QtyAvailable) AS av, sum(QtyOnHand) AS oh, sum(QtyReserved) AS rs FROM M_PRODUCT_STOCK_V WHERE M_Product_ID = ? GROUP BY Warehouse'; }
  function atpSql(showDetail, M_Warehouse_ID, M_AttributeSetInstance_ID, M_Product_ID) {
    var sql = showDetail ? 'SELECT s.QtyOnHand AS oh, s.QtyReserved AS rs, s.QtyOrdered AS od, productAttribute(s.M_AttributeSetInstance_ID) AS pa, s.M_AttributeSetInstance_ID AS asi,'
      : 'SELECT SUM(s.QtyOnHand) AS oh, SUM(s.QtyReserved) AS rs, SUM(s.QtyOrdered) AS od, productAttribute(s.M_AttributeSetInstance_ID) AS pa, 0 AS asi,', params = [M_Product_ID];
    sql += ' w.Name AS wn, l.Value AS lv FROM M_Storage s INNER JOIN M_Locator l ON (s.M_Locator_ID=l.M_Locator_ID) LEFT JOIN M_LocatorType lt ON (l.M_LocatorType_ID=lt.M_LocatorType_ID) INNER JOIN M_Warehouse w ON (l.M_Warehouse_ID=w.M_Warehouse_ID) WHERE M_Product_ID=?';
    if (M_Warehouse_ID) { sql += ' AND l.M_Warehouse_ID=?'; params.push(M_Warehouse_ID); }
    if (M_AttributeSetInstance_ID > 0) { sql += ' AND s.M_AttributeSetInstance_ID=?'; params.push(M_AttributeSetInstance_ID); }
    sql += " AND (s.QtyOnHand<>0 OR s.QtyReserved<>0 OR s.QtyOrdered<>0) AND COALESCE(lt.IsAvailableForReservation,'Y')='Y'";
    if (!showDetail) sql += ' GROUP BY productAttribute(s.M_AttributeSetInstance_ID), w.Name, l.Value';
    return { sql: sql + ' ORDER BY l.Value', params: params };
  }
  // initAtpTab orders part (java:947-): open order lines with a reservation; PO adds to QtyOrdered, others to QtyReserved
  function atpOrdersSql(M_Warehouse_ID, M_AttributeSetInstance_ID, M_Product_ID) {
    var sql = 'SELECT COALESCE(ol.DatePromised, o.DatePromised) AS dp, ol.QtyReserved AS q, productAttribute(ol.M_AttributeSetInstance_ID) AS pa, ol.M_AttributeSetInstance_ID AS asi, dt.DocBaseType AS bt, bp.Name AS bp, ' +
      "dt.PrintName || ' ' || o.DocumentNo AS dn, w.Name AS wn FROM C_Order o INNER JOIN C_OrderLine ol ON (o.C_Order_ID=ol.C_Order_ID) INNER JOIN C_DocType dt ON (o.C_DocType_ID=dt.C_DocType_ID) " +
      'INNER JOIN M_Warehouse w ON (ol.M_Warehouse_ID=w.M_Warehouse_ID) INNER JOIN C_BPartner bp ON (o.C_BPartner_ID=bp.C_BPartner_ID) WHERE ol.QtyReserved<>0 AND ol.M_Product_ID=?', params = [M_Product_ID];
    if (M_Warehouse_ID) { sql += ' AND ol.M_Warehouse_ID=?'; params.push(M_Warehouse_ID); }
    if (M_AttributeSetInstance_ID > 0) { sql += ' AND ol.M_AttributeSetInstance_ID=?'; params.push(M_AttributeSetInstance_ID); }
    return { sql: sql + ' ORDER BY o.DatePromised', params: params };
  }
  // m_sqlProductprice (java:382-399): bomPrice* are the DB functions; Margin = Std - Limit
  function priceSql() {
    return 'SELECT plv.Name AS n, plv.ValidFrom AS vf, bomPriceList(pp.M_Product_ID, pp.M_PriceList_Version_ID) AS PriceList, bomPriceStd(pp.M_Product_ID, pp.M_PriceList_Version_ID) AS PriceStd, ' +
      'bomPriceStd(pp.M_Product_ID, pp.M_PriceList_Version_ID)-bomPriceLimit(pp.M_Product_ID, pp.M_PriceList_Version_ID) AS Margin, bomPriceLimit(pp.M_Product_ID, pp.M_PriceList_Version_ID) AS PriceLimit ' +
      "FROM M_ProductPrice pp INNER JOIN M_PriceList_Version plv ON (pp.M_PriceList_Version_ID = plv.M_PriceList_Version_ID) WHERE pp.M_Product_ID = ? AND plv.IsActive = 'Y' AND pp.IsActive = 'Y' ORDER BY plv.ValidFrom DESC";
  }
  // renderContentPane substitute / related tabs (java:328-362): the same view, RowType 'S' / 'R'; the price list version comes from the window's criteria
  function substRelSql(rowType, M_Product_ID, M_PriceList_Version_ID) {
    return { sql: 'SELECT orgname AS orgname, (Select Value from M_Product p where p.M_Product_ID=M_PRODUCT_SUBSTITUTERELATED_V.Substitute_ID) AS value, Name AS name, QtyAvailable AS qtyavailable, QtyOnHand AS qtyonhand, QtyReserved AS qtyreserved, PriceStd AS pricestd ' +
      "FROM M_PRODUCT_SUBSTITUTERELATED_V WHERE M_Product_ID = ? AND M_PriceList_Version_ID = ? and RowType = '" + rowType + "'", params: [M_Product_ID, M_PriceList_Version_ID] };
  }
  function substRelTab(id, label, rowType) {
    return { id: id, label: label, load: function (c, pid) {
      var b = substRelSql(rowType, pid, Number(c.M_PriceList_Version_ID) || 0), r = tipQ(b.sql, b.params);
      return { cols: ['Warehouse', 'Value', 'Name', 'Available Quantity', 'On Hand Quantity', 'Reserved Quantity', 'Standard Price'], rows: r.map(function (x) { return [x.orgname, x.value, x.name, num(x.qtyavailable), num(x.qtyonhand), num(x.qtyreserved), num(x.pricestd)]; }) }; } };
  }
  function num(x) { return x == null ? 0 : Number(x); }
  HOOKS['M_PRODUCT'] = {
    // InfoProductWindow.initParameters:~470 — M_Warehouse_ID from the context; here the session org's AD_OrgInfo warehouse (no login-warehouse pick in this app)
    initContext: function (ctx, opts) {
      if (ctx.M_Warehouse_ID) return;
      var org = opts.orgId; if (org == null) return;
      var r = adQ('SELECT m_warehouse_id AS w FROM ad_orginfo WHERE ad_org_id=?', [org]);
      if (r.length && r[0].w) ctx.M_Warehouse_ID = r[0].w;
    },
    // InfoProductWindow.getSQLFilter: warehouse selected ⇒ p.IsSummary='N'
    baseFilter: function (c) { return Number(c.M_Warehouse_ID) > 0 ? "p.IsSummary='N'" : ''; },
    // InfoProductWindow.prepareTable: empty OrderBy && warehouse selected ⇒ "QtyAvailable DESC"
    defaultOrder: function (c, def, disp) {
      if (!(Number(c.M_Warehouse_ID) > 0)) return '';
      var i = disp.findIndex(function (d) { return d.columnname === 'QtyAvailable'; }); return i >= 0 ? 'c' + i + ' DESC' : '';
    },
    tabs: [
      { id: 'stock', label: 'Warehouse Stock', load: function (c, pid) {   // renderContentPane: M_PRODUCT_STOCK_V GROUP BY Warehouse, showTotals
          var r = tipQ(stockSql(), [pid]);
          var rows = r.map(function (x) { return [x.wh, num(x.av), num(x.oh), num(x.rs)]; });
          return { cols: ['Warehouse', 'Available Quantity', 'On Hand Quantity', 'Reserved Quantity'], rows: rows, totals: ['Total', rows.reduce(function (a, x) { return a + x[1]; }, 0), rows.reduce(function (a, x) { return a + x[2]; }, 0), rows.reduce(function (a, x) { return a + x[3]; }, 0)] }; } },
      { id: 'desc', label: 'Description', load: function (c, pid) { var r = tipQ('SELECT documentnote AS n FROM m_product WHERE m_product_id=?', [pid]); return { text: r.length && r[0].n ? r[0].n : '' }; } },
      { id: 'atp', label: 'ATP', detailToggle: 'Show Detail', load: function (c, pid, st) {   // initAtpTab:~705-880
          var wh = Number(c.M_Warehouse_ID) || 0, rows = [], qty = 0;
          var q1 = atpSql(!!st.detail, wh, 0, pid);
          tipQ(q1.sql, q1.params).forEach(function (x) { qty += num(x.oh); var asi = x.pa == null ? '' : String(x.pa); if (st.detail && asi === '') asi = '{' + (x.asi || 0) + '}'; rows.push(['', num(x.oh), '', num(x.od), num(x.rs), x.lv, asi, '', x.wn]); });   // java:918-935
          var q2 = atpOrdersSql(wh, 0, pid);
          tipQ(q2.sql, q2.params).forEach(function (x) {                                                    // java:975-1000
            var po = x.bt === 'POO', oq = num(x.q); if (po) qty += oq; else qty -= oq;
            var asi = x.pa == null ? '' : String(x.pa); if (st.detail && asi === '') asi = '{' + (x.asi || 0) + '}';
            rows.push([String(x.dp || '').slice(0, 10), qty, x.bp, po ? oq : '', po ? '' : oq, '', asi, x.dn, x.wn]);
          });
          return { cols: ['Date', 'On Hand Quantity', 'Business Partner', 'Ordered Quantity', 'Reserved Quantity', 'Locator', 'Attribute Set Instance', 'Document No', 'Warehouse'], rows: rows }; } },
      { id: 'price', label: 'Price', load: function (c, pid) {   // m_sqlProductprice (java:382-399), run as written
          var r = tipQ(priceSql(), [pid]);
          return { cols: ['Price List Version', 'Valid from', 'List Price', 'Standard Price', 'Margin', 'Limit Price'], rows: r.map(function (x) { return [x.n, String(x.vf || '').slice(0, 10), num(x.pricelist), num(x.pricestd), num(x.margin), num(x.pricelimit)]; }) }; } }
      ,substRelTab('substitute', 'Substitute Products', 'S'), substRelTab('related', 'Related Products', 'R')
    ]
  };

  g.AdInfoWindow = { open: open, register: function (table, hook) { HOOKS[String(table).toUpperCase()] = hook; }, parseContextForSql: parseContextForSql, buildInfoSql: buildInfoSql, hook: function (t) { return HOOKS[String(t).toUpperCase()] || {}; }, stockSql: stockSql, atpSql: atpSql, atpOrdersSql: atpOrdersSql, priceSql: priceSql, substRelSql: substRelSql, definition: definition };
})(typeof window !== 'undefined' ? window : globalThis);
