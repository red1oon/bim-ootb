// ⚠ DO NOT REMOVE — W-NINJA-STAGE-ISO (bim-compiler prompts/ERP_MIS_WINDOW_FROM_CSV.md §12.1: rollback is one model; a bundle has its own menu node). READ THE LOG; an exit code is not evidence.
//   I1 ISSUE (rolling back one bundle switches off every other staged bundle) · I2 ISSUE (a rolled-back model cannot come back, or comes back under other ids)
//   I3 ISSUE (two bundles share one menu node that carries a leftover name, so a bundle's name is shown nowhere) · I3b ISSUE (a rollback by bundle NAME, the form an emitted bundle module uses, is blanket or dead)
//   I4 ISSUE (a call with no model rolls back everything) · I5 ISSUE (rolling back a model that reused a dictionary table switches that table off, or leaves its added columns on)
//   Falsifiers: NINJAISO_BREAK=blanket (must FAIL I1) · onenode (must FAIL I3). A model that stages no row gives INCONCLUSIVE, never PASS.
//   Run: node erp/tests/witness_ninja_stage_iso.js > erp/tests/logs/ninja_stage_iso.log 2>&1
'use strict';
const fs = require('fs'), path = require('path');
const { kit, ROOT } = require(path.join(__dirname, '..', '..', 'common', 'door', 'tests', '_kit'));
const k = kit('W-NINJA-STAGE-ISO');
(async () => {
  const SQL = await require(path.join(ROOT, 'common/lib/sql-wasm.js'))({ wasmBinary: fs.readFileSync(path.join(ROOT, 'common/lib/sql-wasm.wasm')) });
  const NS = require(path.join(ROOT, 'erp/ninja_stage.js')), NM = require(path.join(ROOT, 'erp/ninja_model.js'));
  const HDR = ['RO_ModelHeader_ID', 'SeqNo', 'WorkflowStructure', 'KanbanBoard', 'Master', 'Name', 'Help', 'ColumnSet'];
  const parse = (bundle, rows) => { const r = NM.parseSheet([HDR].concat(rows.map((x, i) => [bundle, i + 1, 'N', 'N', x[0], x[1], '', x[2]])), { format: 'romo', bundleName: bundle }); return r.model || r; };
  const A = parse('IsoAlpha', [['', 'ZA_Asset', 'Name,Q#Cost'], ['ZA_Asset', 'ZA_AssetLine', 'Name,D#DateDone']]);
  const B = parse('IsoBeta', [['', 'ZB_Leave', 'Name,D#DateStart'], ['', 'ZB_Claim', 'Name,A#Amount']]);
  const db = new SQL.Database(fs.readFileSync(path.join(ROOT, 'erp/ad_seed.db')));
  const rows = (sql) => { const r = db.exec(sql); return r.length ? r[0].values.map(v => { const o = {}; r[0].columns.forEach((c, i) => { o[c] = v[i]; }); return o; }) : []; };
  const one = (sql) => { const r = rows(sql)[0]; return r ? r[Object.keys(r)[0]] : null; };
  const quiet = (f) => { const lg = console.log, out = []; console.log = (m) => { if (/^§NINJA_/.test(String(m))) out.push(String(m)); }; try { return { v: f(), log: out }; } finally { console.log = lg; } };
  const B0 = NS.NINJA_BASE, T = ['AD_Table', 'AD_Column', 'AD_Window', 'AD_Tab', 'AD_Field', 'AD_Menu'];
  // every staged row of a model, by its table names: { 'AD_Table:7000001': 'Y', ... }  (independent of the stager's own bookkeeping)
  const state = (model) => {
    const names = model.tables.map(t => "'" + t.name + "'").join(','), m = {};
    const tids = rows('SELECT AD_Table_ID AS id FROM AD_Table WHERE TableName IN (' + names + ') AND AD_Table_ID>=' + B0).map(r => r.id), inT = '(' + (tids.join(',') || '0') + ')';
    const put = (t, sql) => rows(sql).forEach(r => { m[t + ':' + r.id] = r.a; });
    put('AD_Table', 'SELECT AD_Table_ID AS id, IsActive AS a FROM AD_Table WHERE AD_Table_ID IN ' + inT);
    put('AD_Column', 'SELECT AD_Column_ID AS id, IsActive AS a FROM AD_Column WHERE AD_Table_ID IN ' + inT);
    put('AD_Tab', 'SELECT AD_Tab_ID AS id, IsActive AS a FROM AD_Tab WHERE AD_Table_ID IN ' + inT);
    put('AD_Field', 'SELECT f.AD_Field_ID AS id, f.IsActive AS a FROM AD_Field f JOIN AD_Tab t ON t.AD_Tab_ID=f.AD_Tab_ID WHERE t.AD_Table_ID IN ' + inT);
    put('AD_Window', 'SELECT DISTINCT w.AD_Window_ID AS id, w.IsActive AS a FROM AD_Window w JOIN AD_Tab t ON t.AD_Window_ID=w.AD_Window_ID WHERE t.AD_Table_ID IN ' + inT);
    put('AD_Menu', 'SELECT DISTINCT m.AD_Menu_ID AS id, m.IsActive AS a FROM AD_Menu m JOIN AD_Tab t ON t.AD_Window_ID=m.AD_Window_ID WHERE t.AD_Table_ID IN ' + inT + ' AND m.AD_Menu_ID>=' + B0);
    return m;
  };
  const cnt = (m, a) => Object.keys(m).filter(x => m[x] === a).length, same = (x, y) => JSON.stringify(Object.keys(x).sort().map(i => i + '=' + x[i])) === JSON.stringify(Object.keys(y).sort().map(i => i + '=' + y[i]));
  const nodeOf = (model) => rows("SELECT s.AD_Menu_ID AS id, s.Name AS name, s.IsActive AS a FROM AD_Menu s WHERE s.IsSummary='Y' AND s.AD_Menu_ID IN (SELECT n.Parent_ID FROM AD_TreeNodeMM n JOIN AD_Menu l ON l.AD_Menu_ID=n.Node_ID JOIN AD_Tab t ON t.AD_Window_ID=l.AD_Window_ID JOIN AD_Table x ON x.AD_Table_ID=t.AD_Table_ID WHERE x.TableName IN (" + model.tables.map(t => "'" + t.name + "'").join(',') + ') AND x.AD_Table_ID>=' + B0 + ')');
  const hba0 = one('SELECT IsActive FROM AD_Menu WHERE AD_Menu_ID=' + (B0 + 400000));

  const sA = quiet(() => NS.stageModels(db, A, 0)).v, sB = quiet(() => NS.stageModels(db, B, 0)).v, a1 = state(A), b1 = state(B);
  k.L('staged IsoAlpha ' + JSON.stringify(sA) + ' rows=' + Object.keys(a1).length + ' · IsoBeta ' + JSON.stringify(sB) + ' rows=' + Object.keys(b1).length + ' · seed node ' + (B0 + 400000) + ' active=' + hba0);
  if (!Object.keys(a1).length || !Object.keys(b1).length || cnt(a1, 'Y') !== Object.keys(a1).length) { k.incon('I1-I4', 'a model staged no row (alpha ' + Object.keys(a1).length + ', beta ' + Object.keys(b1).length + ')'); return k.end(); }

  // ── I3 two bundles, two nodes, each named after its bundle (before any rollback)
  const nA = nodeOf(A), nB = nodeOf(B), hba = rows('SELECT Name AS name, IsActive AS a FROM AD_Menu WHERE AD_Menu_ID=' + (B0 + 400000))[0] || {};
  k.chk('I3 two bundles give two menu nodes, each named after its bundle, each bundle\'s leaves under its own; the seed\'s leftover node (' + (hba.name || 'none') + ') is not taken over',
    nA.length === 1 && nB.length === 1 && nA[0].id !== nB[0].id && nA[0].name === 'IsoAlpha' && nB[0].name === 'IsoBeta' && nA[0].a === 'Y' && nB[0].a === 'Y' && hba.a === hba0,
    'alpha node=' + JSON.stringify(nA) + ' beta node=' + JSON.stringify(nB) + ' leftover active ' + hba0 + '->' + hba.a);

  // ── I1 roll back alpha: beta untouched, alpha all off
  const r1 = quiet(() => NS.rollbackModel(db, A)), a2 = state(A), b2 = state(B);
  k.L('rollback IsoAlpha ' + JSON.stringify(r1.v) + ' log=' + r1.log.join(' | '));
  k.chk('I1 rolling back one model leaves the other as it was: all ' + Object.keys(b1).length + ' rows of IsoBeta still active, all ' + Object.keys(a1).length + ' rows of IsoAlpha inactive, and the counts it reports equal the rows that changed',
    same(b1, b2) && cnt(b2, 'Y') === Object.keys(b1).length && cnt(a2, 'N') === Object.keys(a1).length && (r1.v.tables + r1.v.cols + r1.v.windows + r1.v.tabs + r1.v.fields + r1.v.menus) === Object.keys(a1).length + 1 && r1.log.length === 1,
    'beta active ' + cnt(b2, 'Y') + '/' + Object.keys(b1).length + ' · alpha inactive ' + cnt(a2, 'N') + '/' + Object.keys(a1).length + ' · reported ' + (r1.v.tables + r1.v.cols + r1.v.windows + r1.v.tabs + r1.v.fields + r1.v.menus) + ' (rows + its node)');
  const nA2 = rows("SELECT IsActive AS a FROM AD_Menu WHERE AD_Menu_ID=" + nA[0].id)[0], nB2 = rows("SELECT IsActive AS a FROM AD_Menu WHERE AD_Menu_ID=" + nB[0].id)[0];
  k.chk('I1b the rolled-back bundle\'s node is off and the other bundle\'s node stays on', nA2.a === 'N' && nB2.a === 'Y', 'alpha node ' + nA2.a + ' beta node ' + nB2.a);

  // ── I2 stage alpha again: same ids, all active, same node
  quiet(() => NS.stageModels(db, A, 0)); const a3 = state(A), nA3 = nodeOf(A);
  k.chk('I2 the same model staged again after its rollback is active again under the same ids and the same node', same(a1, a3) && nA3.length === 1 && nA3[0].id === nA[0].id && nA3[0].a === 'Y' && same(b1, state(B)), 'rows ' + cnt(a3, 'Y') + '/' + Object.keys(a1).length + ' node ' + JSON.stringify(nA3));

  // ── I3b by bundle NAME (what an emitted bundle module passes)
  let r3; try { r3 = quiet(() => NS.rollbackModel(db, 'IsoBeta')); } catch (e) { r3 = { v: {}, log: ['refused: ' + e.message] }; } const a4 = state(A), b4 = state(B);   // a refusal here is a FAIL of I3b, not a crash of the witness
  k.chk('I3b a rollback by bundle name takes that bundle only', cnt(b4, 'N') === Object.keys(b1).length && same(a3, a4), 'beta inactive ' + cnt(b4, 'N') + '/' + Object.keys(b1).length + ' alpha active ' + cnt(a4, 'Y') + '/' + Object.keys(a1).length + ' ' + r3.log.join(''));

  // ── I4 no model, or a name nothing carries: refused, nothing changed
  let e1 = '', e2 = ''; const snap = JSON.stringify(rows('SELECT AD_Table_ID, IsActive FROM AD_Table WHERE AD_Table_ID>=' + B0));
  try { quiet(() => NS.rollbackModel(db)); } catch (e) { e1 = e.message; } try { quiet(() => NS.rollbackModel(db, 'NoSuchBundle')); } catch (e) { e2 = e.message; }
  k.chk('I4 a rollback with no model, or with a name no bundle carries, is refused and changes nothing', /not offered/.test(e1) && /no staged bundle/.test(e2) && snap === JSON.stringify(rows('SELECT AD_Table_ID, IsActive FROM AD_Table WHERE AD_Table_ID>=' + B0)) && same(a4, state(A)), 'no model: "' + e1 + '" · unknown name: "' + e2 + '"');
  // ── I5 a model that REUSES a dictionary table (legacy Ninja: an existing table under a master gets the sheet's columns and a tab): its rollback takes the added rows only
  const C = parse('IsoReuse', [['', 'ZC_Club', 'Name'], ['ZC_Club', 'C_Greeting', 'Name,Q#Seats']]);
  const gq = (w) => Number(one("SELECT count(*) FROM AD_Column c JOIN AD_Table t ON t.AD_Table_ID=c.AD_Table_ID WHERE t.TableName='C_Greeting' AND " + w)), g0 = { own: gq("c.IsActive='Y' AND c.AD_Column_ID<" + B0), tbl: one("SELECT IsActive FROM AD_Table WHERE TableName='C_Greeting'") };
  const sC = quiet(() => NS.stageModels(db, C, 0)).v, on = { added: gq("c.IsActive='Y' AND c.AD_Column_ID>=" + B0), tab: Number(one("SELECT count(*) FROM AD_Tab tb JOIN AD_Table t ON t.AD_Table_ID=tb.AD_Table_ID WHERE t.TableName='C_Greeting' AND tb.IsActive='Y' AND tb.AD_Tab_ID>=" + B0)), rows: Number(one("SELECT count(*) FROM AD_Table WHERE upper(TableName)='C_GREETING'")) };
  quiet(() => NS.rollbackModel(db, C)); const off = { added: gq("c.IsActive='Y' AND c.AD_Column_ID>=" + B0), own: gq("c.IsActive='Y' AND c.AD_Column_ID<" + B0), tab: Number(one("SELECT count(*) FROM AD_Tab tb JOIN AD_Table t ON t.AD_Table_ID=tb.AD_Table_ID WHERE t.TableName='C_Greeting' AND tb.IsActive='Y' AND tb.AD_Tab_ID>=" + B0)), tbl: one("SELECT IsActive FROM AD_Table WHERE TableName='C_Greeting'") };
  if (!(sC.reused || []).length) k.incon('I5', 'the stager reused no table (the seed has no C_Greeting?)');
  else k.chk('I5 a reused dictionary table: staged, it is still one row with 2 columns and 1 tab added; rolled back, the 2 added columns and the tab are off while the table and its ' + g0.own + ' own columns stay as they were',
    on.rows === 1 && on.added === 2 && on.tab === 1 && off.added === 0 && off.tab === 0 && off.own === g0.own && off.tbl === g0.tbl && same(a4, state(A)), 'staged: rows=' + on.rows + ' added=' + on.added + ' tab=' + on.tab + ' · rolled back: added=' + off.added + ' tab=' + off.tab + ' own ' + off.own + '/' + g0.own + ' table active ' + g0.tbl + '->' + off.tbl + ' reused=' + JSON.stringify(sC.reused));
  k.end();
})().catch(e => { console.log('§W-NINJA-STAGE-ISO ERROR ' + e.stack); process.exit(2); });
