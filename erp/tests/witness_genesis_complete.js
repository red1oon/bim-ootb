#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-GENESIS-COMPLETE (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §G1-SPEC). READ THE LOG after every run: every verdict is a §GC line; the exit code is not
//   the evidence. INCONCLUSIVE when nothing was judged.
// THE ISSUE it proves/disproves (owner, 2026-11-09: "fix newly created tenants"): a tenant born by the ported Initial Client Setup (genesis) must hold the rows legacy MSetup's
//   PO saves write — no AD-mandatory column empty, Created/CreatedBy stamped like the pilot tenant made by Initial Client Setup (CreatedBy=100), flag defaults that legacy
//   rows carry. W-NINJA-MIGRATE measured 116 gaps in 13 tables before the fix; the denominator here is EVERY table genesis writes (read from the ops, not a list).
// Cases: GAPS (production install path, opts from the host) · STAMP (Created/CreatedBy = the oracle) · ORACLE (defaulted flags take values the pilot's Initial-Client-Setup tenant
//   carries, fixture tests/fixtures/genesis_oracle_pilot_1000000.json) · FALS (the same merge without opts shows the gaps - the check can fail).
// Command: node erp/tests/witness_genesis_complete.js        (GC_RECORD=1 re-records the oracle fixture from docker postgres idempiere_pilot)
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..'), ORACLE = path.join(__dirname, 'fixtures', 'genesis_oracle_pilot_1000000.json');
var _log = console.log; console.log = function () {};
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function J(x) { return JSON.stringify(x); }
function check(cs, key, rule, ok, info) { var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §GC-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + J(info))); }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }, v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§GC-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed); return v; }
var NOW = '2026-11-09 09:00:00', USER = 100;   // the install clock + the user running Initial Client Setup (pilot oracle: CreatedBy=100 SuperUser)

(async function main() {
  var K = require(path.join(ERP, 'ws_kernel.js')), G = require(path.join(ERP, 'genesis.js'));
  async function boot() {
    var k = await K.load(), ML = k.ML;
    (fs.readFileSync(path.join(ERP, 'idempiere.html'), 'utf8').match(/<script src="(model_[a-z_]+\.js)/g) || []).forEach(function (m) { try { require(path.join(ERP, m.replace('<script src="', ''))); } catch (e) { /* node-only gap */ } });
    var shim = { prepare: function (sql) { return { all: function () { return k.q(sql); },
      run: function (row) { var b = {}; Object.keys(row || {}).forEach(function (x) { b['@' + x] = row[x] == null ? null : row[x]; }); var s = k.db.prepare(sql); try { s.bind(b); s.step(); } finally { s.free(); } } }; } };
    return { k: k, ML: ML, shim: shim };
  }
  function birth(env, withOpts) {
    var born = G.birthTenant({ clientName: withOpts ? 'Complete Co' : 'Raw Co', currencyId: 100, currencyIso: 'USD', currencyPrecision: 2, adminUser: 'admin', dateAcct: '2026-11-09', countryId: 100 });
    var rb = G.rebandGenesis({ groups: born.groups, refs: born.refs, input: born.input, tip: born.tip }, { clientId: G.nextClientId(env.shim) });
    var opts = withOpts ? { now: NOW, user: USER, initialDefaults: env.ML.initialDefaultsOf } : undefined;   // exactly what idempiere.html installGenesis passes
    var before = JSON.stringify(rb.groups), n = G.mergeGenesisInto(rb.groups, env.shim, opts), untouched = JSON.stringify(rb.groups) === before;
    var tables = {}, carried = {}; rb.groups.forEach(function (g) { (g.ops || []).forEach(function (o) { if (o.op !== 'CREATE') return; tables[o.table] = (tables[o.table] || 0) + 1;
      var c = carried[o.table] = carried[o.table] || {}; Object.keys(o.row).forEach(function (k) { c[k.toLowerCase()] = 1; }); }); });
    return { cid: rb.refs.clientId, n: n, tables: tables, carried: carried, tip: born.tip, untouched: untouched };
  }
  var ORC = fs.existsSync(ORACLE) ? JSON.parse(fs.readFileSync(ORACLE, 'utf8')) : null;
  function legacyEmpty(t, c) { return !!(ORC && ORC.legacyEmpty && ORC.legacyEmpty[t] && ORC.legacyEmpty[t].indexOf(c) >= 0); }
  function gaps(env, cid, tables) {
    var out = [], judged = 0, same = [];
    Object.keys(tables).sort().forEach(function (t) {
      var phys = env.k.colsOf(t); if (!phys.length || phys.indexOf('ad_client_id') < 0) return;
      var rows = env.k.q('SELECT count(*) AS n FROM ' + t + ' WHERE ad_client_id=?', [cid])[0].n; if (!rows) return;
      judged++;
      env.k.q("SELECT lower(c.columnname) AS c FROM ad_column c JOIN ad_table tb ON tb.ad_table_id=c.ad_table_id WHERE lower(tb.tablename)=? AND c.ismandatory='Y' AND c.isactive='Y' AND coalesce(c.columnsql,'')=''", [t])
        .map(function (r) { return r.c; }).filter(function (c) { return phys.indexOf(c) >= 0; })
        .forEach(function (c) { var n = env.k.q('SELECT count(*) AS n FROM ' + t + ' WHERE ad_client_id=? AND (' + c + " IS NULL OR " + c + "='')", [cid])[0].n;
          if (n) (legacyEmpty(t, c) ? same : out).push(t + '.' + c + '×' + n); });
    });
    return { list: out, judged: judged, same: same };
  }

  // ═══ GAPS + STAMP on the production install path ═══
  var E = await boot(), B = birth(E, true), g = gaps(E, B.cid, B.tables);
  say('§GC-BORN client=' + B.cid + ' merged=' + B.n + ' tables=' + Object.keys(B.tables).length + ' judged=' + g.judged + ' gaps=' + g.list.length);
  g.list.forEach(function (x) { say('   §GC-GAP ' + x); });
  say('§GC-SAME-AS-LEGACY empty in the born tenant AND in legacy\'s Initial-Client-Setup tenant (not a gap: twin == legacy) ' + J(g.same));
  check('GAPS', 'none', 'no AD-mandatory column is empty on any row of any table genesis writes (' + g.judged + ' tables judged)', g.judged > 20 && g.list.length === 0, { n: g.list.length, first: g.list.slice(0, 15) });
  verdict('GAPS');
  var bad = [];
  Object.keys(B.tables).forEach(function (t) { var cs = E.k.colsOf(t); if (cs.indexOf('createdby') < 0 || cs.indexOf('ad_client_id') < 0) return;
    var r = E.k.q('SELECT count(*) AS n, sum(CASE WHEN createdby=? AND created IS NOT NULL AND updated IS NOT NULL AND updatedby=? THEN 1 ELSE 0 END) AS ok FROM ' + t + ' WHERE ad_client_id=?', [USER, USER, B.cid])[0];
    if (r.n && r.ok !== r.n) bad.push(t + ' ' + r.ok + '/' + r.n); });
  check('STAMP', 'po-std', 'every born row has Created/Updated set and CreatedBy/UpdatedBy = 100, as the pilot tenant made by Initial Client Setup', bad.length === 0, { bad: bad });
  verdict('STAMP');

  // ═══ ORACLE: a defaulted flag takes a value legacy's Initial-Client-Setup tenant carries in that column ═══
  if (process.env.GC_RECORD) {
    var orc = {};
    Object.keys(B.tables).forEach(function (t) {
      var cs = E.k.q("SELECT lower(c.columnname) AS c FROM ad_column c JOIN ad_table tb ON tb.ad_table_id=c.ad_table_id WHERE lower(tb.tablename)=? AND c.ismandatory='Y' AND c.isactive='Y' AND c.ad_reference_id IN (17,20)", [t]).map(function (r) { return r.c; });
      if (!cs.length) return;
      var sql = 'select ' + cs.map(function (c) { return "string_agg(distinct " + c + "::text, ',')"; }).join(', ') + ' from adempiere.' + t + " where ad_client_id=1000000 and updatedby=createdby and updated - created < interval '1 second'";   // rows untouched since the setup
      var r; try { r = cp.execFileSync('docker', ['exec', 'postgres', 'psql', '-U', 'postgres', '-d', 'idempiere_pilot', '-At', '-F', '|', '-c', sql], { encoding: 'utf8' }).trim(); } catch (e) { return; }
      var v = r.split('|'); if (!r) return; orc[t] = {}; cs.forEach(function (c, i) { if (v[i]) orc[t][c] = v[i].split(','); });
    });
    var lem = {};
    Object.keys(B.tables).forEach(function (t) {
      var cs = E.k.q("SELECT lower(c.columnname) AS c FROM ad_column c JOIN ad_table tb ON tb.ad_table_id=c.ad_table_id WHERE lower(tb.tablename)=? AND c.ismandatory='Y' AND c.isactive='Y' AND coalesce(c.columnsql,'')=''", [t]).map(function (r) { return r.c; });
      if (!cs.length) return;
      var sql = 'select count(*), ' + cs.map(function (c) { return 'count(*) filter (where ' + c + " is null or " + c + "::text='')"; }).join(', ') + ' from adempiere.' + t + ' where ad_client_id=1000000';
      var r; try { r = cp.execFileSync('docker', ['exec', 'postgres', 'psql', '-U', 'postgres', '-d', 'idempiere_pilot', '-At', '-F', '|', '-c', sql], { encoding: 'utf8' }).trim().split('|'); } catch (e) { return; }
      if (!Number(r[0])) return; cs.forEach(function (c, i) { if (Number(r[i + 1]) > 0) (lem[t] = lem[t] || []).push(c); });
    });
    var pg = function (sql) { return cp.execFileSync('docker', ['exec', 'postgres', 'psql', '-U', 'postgres', '-d', 'idempiere_pilot', '-At', '-F', '|', '-c', sql], { encoding: 'utf8' }).trim(); };
    var trees = pg("select treetype from adempiere.ad_tree where ad_client_id=1000000 order by 1").split('\n');
    var ciCols = E.k.colsOf('ad_clientinfo').filter(function (c) { return !/_uu$/.test(c); });
    var ciVals = pg('select ' + ciCols.map(function (c) { return '(' + c + ' is not null)::int'; }).join(',') + ' from adempiere.ad_clientinfo where ad_client_id=1000000').split('|');
    var ciSet = ciCols.filter(function (c, i) { return ciVals[i] === '1'; });
    fs.writeFileSync(ORACLE, JSON.stringify({ treeTypes: trees, clientInfoSet: ciSet, legacyEmpty: lem, source: 'docker postgres idempiere_pilot, AD_Client_ID=1000000 (created by Initial Client Setup 2026-10-12), mandatory List/Yes-No columns, distinct values', recorded: '2026-11-09', tables: orc }, null, 1));
    say('§GC-ORACLE recorded tables=' + Object.keys(orc).length + ' → ' + path.relative(ERP, ORACLE));
  }
  if (fs.existsSync(ORACLE)) {
    var O = JSON.parse(fs.readFileSync(ORACLE, 'utf8')).tables, off = [], judgedCols = 0;
    Object.keys(O).forEach(function (t) { Object.keys(O[t]).forEach(function (c) {
      if (B.carried[t] && B.carried[t][c]) return;   // genesis composed it (chart data, a process parameter): not the fill's - judged by GAPS, not here
      var vals = E.k.q('SELECT DISTINCT ' + c + ' AS v FROM ' + t + ' WHERE ad_client_id=?', [B.cid]).map(function (r) { return r.v == null ? null : String(r.v); }).filter(function (v) { return v != null; });
      judgedCols++;
      var stray = vals.filter(function (v) { return O[t][c].indexOf(v) < 0; });
      if (stray.length) off.push(t + '.' + c + ' twin=' + J(vals) + ' legacy=' + J(O[t][c]));
    }); });
    say('§GC-ORACLE columns judged=' + judgedCols + ' off=' + off.length);
    off.forEach(function (x) { say('   §GC-ORACLE-OFF ' + x); });
    check('ORACLE', 'flags', 'every mandatory List/Yes-No value of the born tenant is one the legacy Initial-Client-Setup tenant carries in that column (' + judgedCols + ' columns)', judgedCols > 50 && off.length === 0, { off: off.slice(0, 12) });
  }
  verdict('ORACLE');

  // ═══ TREES + CLIENT INFO: MClient.setupClientInfo / MTree_Base.afterSave / MClientInfo (legacy rows the raw genesis never had) ═══
  if (ORC && ORC.treeTypes) {
    var tt = E.k.q('SELECT treetype AS t, ad_tree_id AS id FROM ad_tree WHERE ad_client_id=? ORDER BY treetype', [B.cid]);
    check('TREES', 'types', 'the born tenant has one tree per type legacy\'s Initial Client Setup makes (' + ORC.treeTypes.join(',') + ')', J(tt.map(function (r) { return r.t; })) === J(ORC.treeTypes), { twin: tt.map(function (r) { return r.t; }) });
    var noRoot = tt.filter(function (r) { var nt = r.t === 'BP' ? 'ad_treenodebp' : r.t === 'PR' ? 'ad_treenodepr' : 'ad_treenode'; return !E.k.q('SELECT 1 AS x FROM ' + nt + ' WHERE ad_tree_id=? AND node_id=0', [r.id]).length; }).map(function (r) { return r.t; });
    check('TREES', 'root', 'every tree has its root node 0 in the node table of its type (MTree_Base.afterSave)', tt.length > 0 && noRoot.length === 0, { noRoot: noRoot });
    var ev = E.k.q("SELECT e.ad_tree_id AS t, tr.treetype AS ty FROM c_element e LEFT JOIN ad_tree tr ON tr.ad_tree_id=e.ad_tree_id WHERE e.ad_client_id=?", [B.cid])[0];
    check('TREES', 'element', 'the account element uses the Element Value tree (MSetup.java:491-492)', !!ev && ev.ty === 'EV', { ev: ev });
    var ci = E.k.q('SELECT * FROM ad_clientinfo WHERE ad_client_id=?', [B.cid])[0];
    var ciMiss = ci ? ORC.clientInfoSet.filter(function (c) { return ci[c] == null || ci[c] === ''; }) : ['(no row)'];
    check('TREES', 'clientinfo', 'AD_ClientInfo exists and has every column legacy\'s has (' + ORC.clientInfoSet.length + ' columns: trees, schema, calendar, cash BP, freight product)', ciMiss.length === 0, { miss: ciMiss });
    if (ci) { var bad2 = []; [['ad_tree_org_id', 'OO'], ['ad_tree_bpartner_id', 'BP'], ['ad_tree_product_id', 'PR'], ['ad_tree_project_id', 'PJ']].forEach(function (p) { var r = E.k.q('SELECT treetype AS t FROM ad_tree WHERE ad_tree_id=?', [ci[p[0]]])[0]; if (!r || r.t !== p[1]) bad2.push(p[0]); });
      check('TREES', 'clientinfo-links', 'the client info tree columns point at the tenant\'s tree of that type', bad2.length === 0, { bad: bad2 }); }
  }
  verdict('TREES');

  // ═══ FALS: the same birth WITHOUT the host's opts (yesterday's raw merge) is caught ═══
  var E2 = await boot(), B2 = birth(E2, false), g2 = gaps(E2, B2.cid, B2.tables);
  say('§GC-FALS raw merge gaps=' + g2.list.length + ' (first ' + J(g2.list.slice(0, 5)) + ')');
  check('FALS', 'raw', 'the raw merge (no opts) is reported with gaps > 100 - the check can fail', g2.list.length > 100, { n: g2.list.length });
  check('FALS', 'ops-untouched', 'the filling merge leaves the signed op-log byte-identical (the install stamps the rows it writes; the ops stay what genesis composed, the tip still verifies)', B.untouched === true, { untouched: B.untouched });
  verdict('FALS');

  var v = ['GAPS', 'STAMP', 'ORACLE', 'TREES', 'FALS'].map(verdict), all = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS';
  say('§GC-VERDICT ' + all + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' cases=' + J(v));
  process.exit(all === 'PASS' ? 0 : all === 'INCONCLUSIVE' ? 3 : 1);
})().catch(function (e) { say('§GC-VERDICT FAIL threw ' + (e && e.stack || e)); process.exit(1); });
