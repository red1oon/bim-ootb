// capex/tools/shed_twin.js — NEXT-2 (prompts/CAPEX_DASHBOARD.md §12, §12.1): the folded SHED Project Order (SQLite = the origin) pushed to the legacy pilot through the REST bridge
// (viewer/erp_rest_push.js), then the SAME tiles.js run on both sides scoped to that project + a row-by-row compare. Read the log: §SHED_PUSH / §SHED_ROW / §DASH_TWIN / §SHED_TWIN_VERDICT.
// The push sends only what a user types (inputs taken from the folded rows); what legacy derives (line PlannedAmt = qty x price, phase/task/project rollups) is COMPARED, never sent.
// Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tools/shed_twin.js <fold.db> [projectValue=SHED] [today=YYYY-MM-DD]   (env BRIDGE_* as legacy_snapshot.js; localhost only without creds)
const fs = require('fs'), path = require('path'), initSqlJs = require('sql.js');
const A = require('../adapters.js'), T = require('../tiles.js'), Push = require(path.join(__dirname, '..', '..', 'viewer', 'erp_rest_push.js')), Plan = require(path.join(__dirname, '..', '..', 'viewer', 'erp_push_plan.js'));
const env = process.env, base = env.BRIDGE_BASE || 'http://localhost:8088';
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base) && !(env.BRIDGE_USER && env.BRIDGE_PASS)) { console.error('§CFG BRIDGE_USER/BRIDGE_PASS required for a non-localhost base'); process.exit(2); }
const L = { user: env.BRIDGE_USER || 'GardenAdmin', pass: env.BRIDGE_PASS || 'GardenAdmin', lang: 'en_US', ClientID: +(env.BRIDGE_CLIENT || 11), RoleID: +(env.BRIDGE_ROLE || 102), OrgID: +(env.BRIDGE_ORG || 11), WarehouseID: +(env.BRIDGE_WH || 103), stage: 0 };
const legacyCfg = { base, login: L };
const pushCfg = { baseUrl: base, login: { user: L.user, pass: L.pass, lang: L.lang, clientId: L.ClientID, roleId: L.RoleID, orgId: L.OrgID, warehouseId: L.WarehouseID, stage: 0 },
  serviceTypes: { C_Project: { query: 'QueryCProject', create: 'BridgeCreateCProject' }, C_ProjectPhase: { query: 'QueryCProjectPhase', create: 'BridgeCreateCProjectPhase' },
    C_ProjectTask: { query: 'QueryCProjectTask', create: 'BridgeCreateCProjectTask' }, C_ProjectLine: { query: 'QueryCProjectLine', create: 'BridgeCreateCProjectLine' },
    M_Product: { query: 'QueryMProduct', create: 'Bridge_createData_M_Product' }, M_Product_Category: { query: 'QueryMProductCategory', create: 'Bridge_createData_M_Product_Category' }, C_UOM: { query: 'QueryCUOM', create: 'BridgeCreateCUOM' } } };
// BRIDGE_SVC=bimootb → the plugin's BIMOOTB_Query_/Create_<Table> types (viewer/erp_push_plan.js bimootbServiceTypes — the one map, bim-compiler prompts/BIM_OOTB_LEGACY_IDEMPIERE_INTEGRATION.md §8); default = the pilot POC types above.
if ((env.BRIDGE_SVC || '').toLowerCase() === 'bimootb') pushCfg.serviceTypes = Plan.bimootbServiceTypes();
const lc = o => { const r = {}; for (const k in o) r[k.toLowerCase()] = o[k]; return r; };
// legacy forbids a free Filter parameter (prompts/CAPEX_DASHBOARD.md §5.8): rows are read by DataRow KEY fields through the ONE shared reader (Push.queryRows: exact post-filter on LIKE keys)
const legacyQuery = async (type, table, keys) => (await Push.queryRows(pushCfg.baseUrl, pushCfg.login, type, table, keys)).map(lc);
const num = v => v == null || v === '' ? null : Number(v);
(async () => {
  const [foldPath, value = 'SHED', today = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
  if (!foldPath) { console.error('usage: shed_twin.js <fold.db> [projectValue] [today]'); process.exit(2); }
  const SQL = await initSqlJs(), db = new SQL.Database(fs.readFileSync(foldPath));
  const q = (sql, p) => { const st = db.prepare(sql); if (p) st.bind(p); const out = []; while (st.step()) out.push(lc(st.getAsObject())); st.free(); return out; };
  const proj = q('SELECT * FROM c_project WHERE value=?', [value])[0];
  if (!proj) { console.log('§SHED_TWIN_VERDICT INCONCLUSIVE reason=no project ' + value + ' in ' + foldPath); process.exit(1); }
  const phases = q('SELECT * FROM c_projectphase WHERE c_project_id=? ORDER BY seqno, c_projectphase_id', [proj.c_project_id]);
  const { plan, notes } = Plan.planFromDb(db, value);   // viewer/erp_push_plan.js — the ONE plan builder (moved out of this file, §8.6 P5)
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
  const lp = (await legacyQuery('QueryCProject', 'C_Project', [{ column: 'C_Project_ID', val: r.projectId }]))[0];
  cmp('C_Project', value, proj, lp, ['name', 'c_currency_id', 'plannedamt', 'plannedqty', 'plannedmarginamt', 'committedamt', 'invoicedamt', 'projectbalanceamt', 'processed']);
  const lph = await legacyQuery('QueryCProjectPhase', 'C_ProjectPhase', [{ column: 'C_Project_ID', val: r.projectId }]);
  for (const ph of phases) {
    const b = lph.find(x => x.c_projectphase_uu === ph.c_projectphase_uu) || lph.find(x => x.name === ph.name);
    cmp('C_ProjectPhase', ph.name, ph, b, ['seqno', 'startdate', 'enddate', 'iscomplete', 'plannedamt', 'committedamt']);
    if (!b) continue;
    const lt = await legacyQuery('QueryCProjectTask', 'C_ProjectTask', [{ column: 'C_ProjectPhase_ID', val: +b.c_projectphase_id }]), ll = await legacyQuery('QueryCProjectLine', 'C_ProjectLine', [{ column: 'C_ProjectPhase_ID', val: +b.c_projectphase_id }]);
    for (const t of q('SELECT * FROM c_projecttask WHERE c_projectphase_id=?', [ph.c_projectphase_id])) cmp('C_ProjectTask', ph.name + '/' + t.name, t, lt.find(x => x.c_projecttask_uu === t.c_projecttask_uu) || lt.find(x => x.name === t.name), ['seqno', 'plannedamt']);
    for (const l of q('SELECT * FROM c_projectline WHERE c_projectphase_id=?', [ph.c_projectphase_id])) cmp('C_ProjectLine', ph.name + '/' + l.description, l, (ll.find(x => x.c_projectline_uu === l.c_projectline_uu) || ll.find(x => x.description === l.description)), ['line', 'plannedqty', 'plannedprice', 'plannedamt', 'plannedmarginamt']);
  }
  const verdict = tv.diff || rd ? 'FAIL' : (tv.match || rm) ? 'PASS' : 'INCONCLUSIVE';
  console.log('§SHED_TWIN_VERDICT ' + verdict + ' tiles(match=' + tv.match + ' diff=' + tv.diff + ' inconclusive=' + tv.inconclusive + ') rows(match=' + rm + ' diff=' + rd + ') created=' + JSON.stringify(r.created));
  process.exitCode = verdict === 'PASS' ? 0 : 1;
})().catch(e => { console.log('§SHED_TWIN_VERDICT FAIL harness ' + (e && e.stack || e)); process.exit(1); });
