// capex/adapters.js — the two data-source adapters (spec: prompts/CAPEX_DASHBOARD.md §4). Both return the SAME normalised shape:
//   { source, projects, phases, tasks, lines, orgs, phaseRef, currencies, wf, unavailable:[names], meta }
// A = SQLite (sql.js Database, read-only SELECTs).  B = legacy iDempiere stock WebServices query_data (node/fetch) or its snapshot JSON.
(function (root) {
  'use strict';
  var COLS = {
    projects:   { table: 'C_Project',      cols: ['C_Project_ID', 'AD_Org_ID', 'Value', 'Name', 'C_Currency_ID', 'PlannedAmt', 'ProjectBalanceAmt', 'CommittedAmt', 'InvoicedAmt', 'C_Phase_ID', 'IsActive', 'Processed', 'ProjectCategory', 'DateFinish', 'Updated'] },
    phases:     { table: 'C_ProjectPhase', cols: ['C_ProjectPhase_ID', 'C_Project_ID', 'Name', 'StartDate', 'EndDate', 'IsComplete', 'PlannedAmt', 'CommittedAmt', 'SeqNo'] },
    tasks:      { table: 'C_ProjectTask',  cols: ['C_ProjectTask_ID', 'C_ProjectPhase_ID', 'Name', 'PlannedAmt', 'BIM_StartDate', 'BIM_EndDate'] },   // §5.58: the last two exist only where the BIM Document plugin is (twin picks the columns it has; legacy: the read type's output fields), else null
    lines:      { table: 'C_ProjectLine',  cols: ['C_ProjectLine_ID', 'C_Project_ID', 'PlannedAmt', 'CommittedAmt', 'InvoicedAmt'] },
    orgs:       { table: 'AD_Org',         cols: ['AD_Org_ID', 'Name'] },
    phaseRef:   { table: 'C_Phase',        cols: ['C_Phase_ID', 'Name'] },
    currencies: { table: 'C_Currency',     cols: ['C_Currency_ID', 'ISO_Code', 'CurSymbol', 'StdPrecision'] },
    wf:         { table: 'AD_WF_Activity', cols: ['AD_WF_Activity_ID', 'WFState', 'Processed'] },
    orders:     { table: 'C_Order',        cols: ['C_Order_ID', 'C_Project_ID', 'GrandTotal', 'C_Currency_ID', 'IsSOTrx', 'DocStatus'] },   // §5.38 Q4 (optional entity)
    issues:     { table: 'C_ProjectIssue', cols: ['C_ProjectIssue_ID', 'C_Project_ID', 'Processed'] },
    receipts:   { table: 'M_InOut',        cols: ['M_InOut_ID', 'C_Project_ID', 'C_Order_ID', 'IsSOTrx', 'DocStatus', 'MovementDate'] },   // §5.59 supply-chain drill (optional entities)
    vinvoices:  { table: 'C_Invoice',      cols: ['C_Invoice_ID', 'C_Project_ID', 'C_Order_ID', 'GrandTotal', 'C_Currency_ID', 'IsSOTrx', 'DocStatus'] },
    payments:   { table: 'C_Payment',      cols: ['C_Payment_ID', 'C_Project_ID', 'C_Order_ID', 'C_Invoice_ID', 'PayAmt', 'C_Currency_ID', 'IsReceipt', 'DocStatus'] },
    pacalc:     { table: 'PA_MeasureCalc', cols: ['PA_MeasureCalc_ID', 'PA_MeasureCalc_UU', 'Name', 'Description', 'SelectClause', 'WhereClause', 'DateColumn', 'OrgColumn', 'KeyColumn', 'IsActive'] },   // §5.66: the tile definitions themselves (read from the source, as every other row)
    bimdocs:    { table: 'BIM_Document',   cols: ['BIM_Document_ID', 'C_Project_ID', 'C_ProjectPhase_ID', 'C_ProjectTask_ID', 'DeliverableNo', 'Revision', 'DocStatus', 'IsActive', 'Name', 'Discipline', 'HoursBudget'] }   // §5.36B: the BIM Document plugin's table; absent = unavailable = "not installed"
  };
  var ENTITIES = Object.keys(COLS), OPTIONAL = ['bimdocs', 'orders', 'issues', 'receipts', 'vinvoices', 'payments', 'pacalc'];   // OPTIONAL: an entity a server may legitimately lack (a plugin's table): unavailable there is the honest state, not a defect

  // ── Source A ──
  function fromSqlite(db, meta) {
    var out = { source: 'sqlite', unavailable: [], meta: meta || {} };
    ENTITIES.forEach(function (e) {
      var spec = COLS[e], info = db.exec('PRAGMA table_info("' + spec.table + '")');
      if (!info.length) { out[e] = []; out.unavailable.push(e); return; }
      var have = {}; info[0].values.forEach(function (r) { have[String(r[1]).toLowerCase()] = r[1]; });
      var pick = spec.cols.filter(function (c) { return have[c.toLowerCase()]; });
      var res = db.exec('SELECT ' + pick.map(function (c) { return '"' + have[c.toLowerCase()] + '"'; }).join(',') + ' FROM "' + spec.table + '"');
      out[e] = res.length ? res[0].values.map(function (v) { var o = {}; pick.forEach(function (c, i) { o[c] = v[i]; }); return o; }) : [];
    });
    return out;
  }
  async function loadSqlite(SQL, url) {
    var buf = await (await fetch(url)).arrayBuffer();
    return fromSqlite(new SQL.Database(new Uint8Array(buf)), { url: url });
  }

  // ── Source B ──
  var PATH = '/ADInterface/services/rest/model_adservice/query_data';
  var LEGACY_TYPES = { projects: 'QueryCProject', orgs: 'QueryADOrg', phases: 'QueryCProjectPhase', tasks: 'QueryCProjectTask', lines: 'QueryCProjectLine', phaseRef: 'QueryCPhase', currencies: 'QueryCCurrency', wf: 'QueryADWFActivity', bimdocs: 'QueryBIMDocument', orders: 'QueryCOrder', issues: 'QueryCProjectIssue', receipts: 'QueryMInOut', vinvoices: 'QueryCInvoice', payments: 'QueryCPayment', pacalc: 'QueryPAMeasureCalc' };
  function parseRows(j) {                    // identical wire handling to scripts/bridge/ad_client.js rows()/query()
    var w = j.WindowTabData; if (!w) return [];
    if (w.Error) throw new Error('§AD_ERROR ' + w.Error);
    var dr = w.DataSet && w.DataSet.DataRow; if (!dr) return [];
    if (!Array.isArray(dr)) dr = [dr];
    var rows = dr.map(function (r) {
      var o = {}; [].concat(r.field || []).forEach(function (f) { o[f['@column']] = (f.val && typeof f.val === 'object' && f.val['@nil']) ? null : f.val; }); return o;
    });
    var total = w['@TotalRows']; if (total != null && +total !== rows.length) throw new Error('§AD_PAGED total=' + total + ' got=' + rows.length);
    return rows;
  }
  // cfg = { base, login:{user,pass,lang,ClientID,RoleID,OrgID,WarehouseID,stage:0} }; types = optional override of LEGACY_TYPES
  // opts.all: keep every column the WS type returns, not only COLS (the DOWN copy, §5.26); meta.client = the login's client (what a mirror may replace)
  async function loadLegacy(cfg, types, opts) {
    types = types || LEGACY_TYPES;
    var all = !!(opts && opts.all), out = { source: 'legacy', unavailable: [], meta: { base: cfg.base, client: cfg.login && cfg.login.ClientID } };
    for (var i = 0; i < ENTITIES.length; i++) {
      var e = ENTITIES[i];
      var res = await fetch(cfg.base + PATH, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ModelCRUDRequest: { ModelCRUD: { serviceType: types[e] }, ADLoginRequest: cfg.login } }) });
      var txt = await res.text(), j; try { j = JSON.parse(txt); } catch (x) { throw new Error('§AD_HTTP ' + res.status + ' non-JSON: ' + txt.slice(0, 120)); }
      var sr = j.StandardResponse;
      if (j.status === '500' || j.message || (sr && sr['@IsError'])) {            // a read type that is not registered => this entity is UNAVAILABLE (never guessed)
        var msg = j.message || (sr && sr.Error) || ''; out.unavailable.push(e); out.meta['err_' + e] = String(msg).slice(0, 160); out[e] = []; continue;
      }
      var cols = COLS[e].cols;
      var rows;
      try { rows = parseRows(j); }
      catch (x) { if (/Service type .* not configured/.test(x.message)) { out.unavailable.push(e); out.meta['err_' + e] = x.message.slice(0, 160); out[e] = []; continue; } throw x; }   // a type this server never registered (e.g. QueryBIMDocument where the plugin is not installed) = UNAVAILABLE, not a crash
      out[e] = rows.map(function (r) { if (all) return r; var o = {}; cols.forEach(function (c) { o[c] = r[c] === undefined ? null : r[c]; }); return o; });
    }
    return out;
  }
  async function loadSnapshot(url) { var j = await (await fetch(url)).json(); j.source = 'legacy'; return j; }

  var API = { fromSqlite: fromSqlite, loadSqlite: loadSqlite, loadLegacy: loadLegacy, loadSnapshot: loadSnapshot, parseRows: parseRows, ENTITIES: ENTITIES, COLS: COLS, OPTIONAL: OPTIONAL, LEGACY_TYPES: LEGACY_TYPES };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.CapexAdapters = API;
})(typeof window !== 'undefined' ? window : this);
