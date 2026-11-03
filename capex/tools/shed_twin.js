// capex/tools/shed_twin.js — NEXT-2 (prompts/CAPEX_DASHBOARD.md §12, §12.1): the folded SHED Project Order (SQLite = the origin) pushed to the legacy pilot through the REST bridge
// (viewer/erp_rest_push.js), then the SAME tiles.js run on both sides scoped to that project + a row-by-row compare. Read the log: §SHED_PUSH / §SHED_ROW / §DASH_TWIN / §SHED_TWIN_VERDICT.
// The push sends only what a user types (inputs taken from the folded rows); what legacy derives (line PlannedAmt = qty x price, phase/task/project rollups) is COMPARED, never sent.
// Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tools/shed_twin.js <fold.db> [projectValue=SHED] [today=YYYY-MM-DD]   (env BRIDGE_* as legacy_snapshot.js; localhost only without creds)
const fs = require('fs'), path = require('path'), initSqlJs = require('sql.js');
const A = require('../adapters.js'), T = require('../tiles.js'), Push = require(path.join(__dirname, '..', '..', 'viewer', 'erp_rest_push.js'));
const env = process.env, base = env.BRIDGE_BASE || 'http://localhost:8088';
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base) && !(env.BRIDGE_USER && env.BRIDGE_PASS)) { console.error('§CFG BRIDGE_USER/BRIDGE_PASS required for a non-localhost base'); process.exit(2); }
const L = { user: env.BRIDGE_USER || 'GardenAdmin', pass: env.BRIDGE_PASS || 'GardenAdmin', lang: 'en_US', ClientID: +(env.BRIDGE_CLIENT || 11), RoleID: +(env.BRIDGE_ROLE || 102), OrgID: +(env.BRIDGE_ORG || 11), WarehouseID: +(env.BRIDGE_WH || 103), stage: 0 };
const legacyCfg = { base, login: L };
const pushCfg = { baseUrl: base, login: { user: L.user, pass: L.pass, lang: L.lang, clientId: L.ClientID, roleId: L.RoleID, orgId: L.OrgID, warehouseId: L.WarehouseID, stage: 0 },
  serviceTypes: { C_Project: { query: 'QueryCProject', create: 'BridgeCreateCProject' }, C_ProjectPhase: { query: 'QueryCProjectPhase', create: 'BridgeCreateCProjectPhase' },
    C_ProjectTask: { query: 'QueryCProjectTask', create: 'BridgeCreateCProjectTask' }, C_ProjectLine: { query: 'QueryCProjectLine', create: 'BridgeCreateCProjectLine' },
    M_Product: { query: 'QueryMProduct', create: 'Bridge_createData_M_Product' }, M_Product_Category: { query: 'QueryMProductCategory', create: 'Bridge_createData_M_Product_Category' }, C_UOM: { query: 'QueryCUOM', create: 'BridgeCreateCUOM' } } };
// BRIDGE_SVC=bimootb → the service types the org.idempiere.bimootb plugin installs at System level (BIMOOTB_Query_<Table> / BIMOOTB_Create_<Table>), reached through its
// master role "BIM OOTB Push" (bim-compiler prompts/BIM_OOTB_LEGACY_IDEMPIERE_INTEGRATION.md §8); default = the pilot POC types above (unchanged).
if ((env.BRIDGE_SVC || '').toLowerCase() === 'bimootb') Object.keys(pushCfg.serviceTypes).forEach(t => { pushCfg.serviceTypes[t] = { query: 'BIMOOTB_Query_' + t, create: 'BIMOOTB_Create_' + t }; });
const lc = o => { const r = {}; for (const k in o) r[k.toLowerCase()] = o[k]; return r; };
async function legacyQuery(type, filter) {       // the adapters' own JSON wire form, with a Filter
  const res = await fetch(base + '/ADInterface/services/rest/model_adservice/query_data', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ModelCRUDRequest: { ModelCRUD: { serviceType: type, Filter: filter }, ADLoginRequest: L } }) });
  return A.parseRows(JSON.parse(await res.text())).map(lc);
}
const num = v => v == null || v === '' ? null : Number(v);
// legacy *_UU columns are Postgres uuid: a non-UUID UU (the shipped seed's Hospital-era 'bim-…' products, §12.1 D4) cannot be sent — dropped from the create and LOGGED, never silently
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, notes = [];
const uuField = (col, v, where) => { if (v == null) return null; if (UUID.test(v)) return { column: col, val: v }; notes.push(col + '=' + v + ' (' + where + ')'); return null; };
(async () => {
  const [foldPath, value = 'SHED', today = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
  if (!foldPath) { console.error('usage: shed_twin.js <fold.db> [projectValue] [today]'); process.exit(2); }
  const SQL = await initSqlJs(), db = new SQL.Database(fs.readFileSync(foldPath));
  const q = (sql, p) => { const st = db.prepare(sql); if (p) st.bind(p); const out = []; while (st.step()) out.push(lc(st.getAsObject())); st.free(); return out; };
  const proj = q('SELECT * FROM c_project WHERE value=?', [value])[0];
  if (!proj) { console.log('§SHED_TWIN_VERDICT INCONCLUSIVE reason=no project ' + value + ' in ' + foldPath); process.exit(1); }
  const phases = q('SELECT * FROM c_projectphase WHERE c_project_id=? ORDER BY seqno, c_projectphase_id', [proj.c_project_id]);
  const plan = { building: proj.value, name: proj.name, fields: [{ column: 'C_Currency_ID', val: proj.c_currency_id }, { column: 'IsCommitment', val: proj.iscommitment },
    { column: 'ProjInvoiceRule', val: proj.projinvoicerule }, { column: 'ProjectLineLevel', val: proj.projectlinelevel }, uuField('C_Project_UU', proj.c_project_uu, 'C_Project ' + proj.value)].filter(f => f && f.val != null), phases: [] };
  for (const ph of phases) {
    const tasks = q('SELECT * FROM c_projecttask WHERE c_projectphase_id=? ORDER BY seqno, c_projecttask_id', [ph.c_projectphase_id]);
    const tname = {}; tasks.forEach(t => { tname[t.c_projecttask_id] = t.name; });
    const lines = q('SELECT l.*, p.value AS pvalue, p.name AS pname, p.description AS pdesc, p.c_uom_id AS puom, p.c_taxcategory_id AS ptax, p.producttype AS ptype, p.isstocked AS pstk, p.ispurchased AS ppur, p.issold AS psold, p.m_product_uu AS puu, '
      + 'c.name AS cname, c.value AS cvalue, c.m_product_category_uu AS cuu, u.x12de355 AS ucode, u.name AS uname, u.uomsymbol AS usym, u.stdprecision AS ustd, u.costingprecision AS ucost, u.isdefault AS udef, u.c_uom_uu AS uuu FROM c_projectline l JOIN m_product p ON p.m_product_id=l.m_product_id LEFT JOIN m_product_category c ON c.m_product_category_id=p.m_product_category_id LEFT JOIN c_uom u ON u.c_uom_id=p.c_uom_id '
      + 'WHERE l.c_projectphase_id=? ORDER BY l.line, l.c_projectline_id', [ph.c_projectphase_id]);
    plan.phases.push({ name: ph.name, seqno: ph.seqno, startDate: ph.startdate, endDate: ph.enddate,
      fields: [{ column: 'IsComplete', val: ph.iscomplete }, { column: 'Qty', val: ph.qty }, uuField('C_ProjectPhase_UU', ph.c_projectphase_uu, 'phase ' + ph.name)].filter(f => f && f.val != null),
      tasks: tasks.map(t => ({ name: t.name, fields: [{ column: 'SeqNo', val: t.seqno }, { column: 'Qty', val: t.qty }, uuField('C_ProjectTask_UU', t.c_projecttask_uu, 'task ' + t.name)].filter(f => f && f.val != null) })),
      lines: lines.map(l => ({ productValue: l.pvalue, productName: l.pname, categoryName: l.cname, qty: l.plannedqty, price: l.plannedprice, taskName: l.c_projecttask_id != null ? tname[l.c_projecttask_id] : null,
        uom: l.ucode ? { x12de355: l.ucode, name: l.uname, fields: [{ column: 'UOMSymbol', val: l.usym }, { column: 'StdPrecision', val: l.ustd }, { column: 'CostingPrecision', val: l.ucost }, { column: 'IsDefault', val: l.udef }, uuField('C_UOM_UU', l.uuu, 'uom ' + l.ucode)].filter(f => f && f.val != null) } : null,
        categoryFields: [{ column: 'Value', val: l.cvalue }, uuField('M_Product_Category_UU', l.cuu, 'category ' + l.cname)].filter(f => f && f.val != null),
        productFields: [{ column: 'Description', val: l.pdesc }, { column: 'C_UOM_ID', val: l.puom }, { column: 'C_TaxCategory_ID', val: l.ptax }, { column: 'ProductType', val: l.ptype }, { column: 'IsStocked', val: l.pstk },
          { column: 'IsPurchased', val: l.ppur }, { column: 'IsSold', val: l.psold }, uuField('M_Product_UU', l.puu, 'product ' + l.pvalue)].filter(f => f && f.val != null),
        fields: [{ column: 'Line', val: l.line }, { column: 'Description', val: l.description }, { column: 'DoPricing', val: l.dopricing }, uuField('C_ProjectLine_UU', l.c_projectline_uu, 'line ' + l.description)].filter(f => f && f.val != null) })) });
  }
  notes.forEach(n => console.log('§SHED_PUSH_NOTE uu-not-uuid dropped ' + n + ' — the SQLite row keeps a UU legacy cannot hold (shipped seed, owner decision: base hash)'));
  console.log('§SHED_PLAN project=' + value + ' phases=' + plan.phases.length + ' tasks=' + plan.phases.reduce((a, p) => a + p.tasks.length, 0) + ' lines=' + plan.phases.reduce((a, p) => a + p.lines.length, 0));
  // ── push (idempotent find-or-create) ──
  const r = await Push.pushProjectOrder(pushCfg, plan);
  console.log('§SHED_PUSH projectId=' + r.projectId + ' created=' + JSON.stringify(r.created));
  // ── scoped twin: the SAME tiles.js over {this project} on each side ──
  // one implementation: tiles.compute's own project filter (§15.1), same on both sides
  const sa = A.fromSqlite(db), sb = await A.loadLegacy(legacyCfg);
  const fa = T.flatten(T.compute(sa, { status: 'all', today, project: value }).tiles), fb = T.flatten(T.compute(sb, { status: 'all', today, project: value }).tiles);
  delete fa.approvals; delete fb.approvals;   // system-wide (AD_WF_Activity), not this project's — out of this scope, judged by W-DOCVALUE-WF
  console.log('§DASH_TWIN_SCOPE project=' + value + ' sqlite#' + proj.c_project_id + ' legacy#' + r.projectId + ' today=' + today);
  const tv = T.twin(fa, fb, console.log);
  // ── row compare (legacy read through the Query* types; key = the row's UU, else name) ──
  let rm = 0, rd = 0;
  const cmp = (tbl, key, a, b, cols) => cols.forEach(c => {
    const va = a[c], vb = b ? b[c] : undefined, isNum = typeof va === 'number' || (va != null && va !== '' && !isNaN(va) && !/^\d{4}-/.test(String(va)));
    const same = b && (isNum ? Math.abs(num(va) - num(vb)) < 1e-9 : String(va == null ? '' : va).slice(0, 19) === String(vb == null ? '' : vb).replace('T', ' ').slice(0, 19));
    same ? rm++ : rd++; console.log('§SHED_ROW table=' + tbl + ' key=' + key + ' col=' + c + ' sqlite=' + va + ' legacy=' + (b ? vb : 'ABSENT') + ' ' + (same ? 'MATCH' : 'DIFF'));
  });
  const lp = (await legacyQuery('QueryCProject', 'C_Project_ID=' + r.projectId))[0];
  cmp('C_Project', value, proj, lp, ['name', 'c_currency_id', 'plannedamt', 'plannedqty', 'plannedmarginamt', 'committedamt', 'invoicedamt', 'projectbalanceamt', 'processed']);
  const lph = await legacyQuery('QueryCProjectPhase', 'C_Project_ID=' + r.projectId);
  for (const ph of phases) {
    const b = lph.find(x => x.c_projectphase_uu === ph.c_projectphase_uu) || lph.find(x => x.name === ph.name);
    cmp('C_ProjectPhase', ph.name, ph, b, ['seqno', 'startdate', 'enddate', 'iscomplete', 'plannedamt', 'committedamt']);
    if (!b) continue;
    const lt = await legacyQuery('QueryCProjectTask', 'C_ProjectPhase_ID=' + b.c_projectphase_id), ll = await legacyQuery('QueryCProjectLine', 'C_ProjectPhase_ID=' + b.c_projectphase_id);
    for (const t of q('SELECT * FROM c_projecttask WHERE c_projectphase_id=?', [ph.c_projectphase_id])) cmp('C_ProjectTask', ph.name + '/' + t.name, t, lt.find(x => x.c_projecttask_uu === t.c_projecttask_uu) || lt.find(x => x.name === t.name), ['seqno', 'plannedamt']);
    for (const l of q('SELECT * FROM c_projectline WHERE c_projectphase_id=?', [ph.c_projectphase_id])) cmp('C_ProjectLine', ph.name + '/' + l.description, l, (ll.find(x => x.c_projectline_uu === l.c_projectline_uu) || ll.find(x => x.description === l.description)), ['line', 'plannedqty', 'plannedprice', 'plannedamt', 'plannedmarginamt']);
  }
  const verdict = tv.diff || rd ? 'FAIL' : (tv.match || rm) ? 'PASS' : 'INCONCLUSIVE';
  console.log('§SHED_TWIN_VERDICT ' + verdict + ' tiles(match=' + tv.match + ' diff=' + tv.diff + ' inconclusive=' + tv.inconclusive + ') rows(match=' + rm + ' diff=' + rd + ') created=' + JSON.stringify(r.created));
  process.exitCode = verdict === 'PASS' ? 0 : 1;
})().catch(e => { console.log('§SHED_TWIN_VERDICT FAIL harness ' + (e && e.stack || e)); process.exit(1); });
