// ⚠ DO NOT REMOVE — W-TIP-UPDATE-READ (bim-compiler prompts/TEAMWORK_FRAMEWORK.md §41 agent H). READ THE LOG after every run; exit code is not evidence.
// SPEC (written first): a signed CRUD_UPDATE on a row of the SHIPPED dictionary bundle (ad_seed.db) must be what the model layer reads inside a process
//   transaction. Legacy: PO.save writes the column, the next MWarehouse.get / PO.load reads it. Twin: CRUD_UPDATE (applyOp) -> crud_overlay._tipShadowOn
//   (TEMP table = crud_core.listTip fold of the bundle + signed ops) -> ModelLayer.Trx.get / trx.q.
// ISSUE it proves/disproves (found by W-HQ-CLERK arms H10/H11b, 2026-10-28): M_Warehouse.M_WarehouseSource_ID set by a signed CRUD_UPDATE on warehouse 104 reads
//   null inside Replenish Report (ReplenishReportProduction.js:40 trx.get('m_warehouse')) -> "No Source Warehouse", 0 movements.
// ARMS (each names what it judges; INCONCLUSIVE, never PASS, when the population is empty):
//   T1 CENSUS    the bundle tables whose pk column <t>_id: N total, M with a non-lowercase pk column name (the suspect property).
//   T2 SAMPLE    X of N: for every census table (all mixed-case + a control sample of lowercase ones) edit the first row's first plain TEXT column through
//                the page's own write path (window.__crud.applyOp CRUD_UPDATE), then read it back with ModelLayer Trx.get inside modelRun (the process-trx path).
//   T3 HQ-CASE   M_Warehouse 104 .M_WarehouseSource_ID := 103 reads back 103 in Trx.get (the exact H10/H11b precondition) and through trx.q SQL.
//   T4 CREATED   a warehouse CREATED in the sidecar (CRUD_CREATE) is read back by Trx.get and by trx.q (control: the create side).
// Run: node erp/tests/witness_tip_update_read.js > <log>     (TIP_ALL=1 also edits every lowercase table; default samples 12 of them)
'use strict';
var path = require('path'), http = require('http'), fs = require('fs');
var ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var judged = 0, fails = 0;
function verdict(id, ok, label, detail) { judged++; if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + id + ' ' + label + (detail ? ' — ' + detail : '')); return ok; }
var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

(async function () {
  var server = http.createServer(function (req, res) {
    var p = decodeURIComponent(new URL(req.url, 'http://x').pathname), f = path.join(ROOT, p === '/' ? '/erp/idempiere.html' : p);
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port;
  var browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] });
  var pg = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage(), errs = [], logs = [];
  pg.on('pageerror', function (e) { errs.push(e.message); }); pg.on('console', function (m) { logs.push(m.text()); });
  await pg.goto(base + '/erp/idempiere.html?login=GardenAdmin&lang=en_US', { waitUntil: 'load' });
  await pg.waitForFunction(function () { return window.__idmpDb && window.__crud && window.ModelLayer && window.__idmpDb.exec('SELECT count(*) FROM ad_table')[0].values[0][0] > 0 && document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0; }, null, { timeout: 180000 });
  await sleep(1500);

  // T1 census (bundle columns as the page's own db has them)
  var census = await pg.evaluate(function () {
    var db = window.__idmpDb, out = [];
    db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0].values.forEach(function (r) {
      var t = r[0]; if (/^(sqlite_|kernel_|temp)/i.test(t)) return;
      var ti = db.exec('PRAGMA table_info("' + t + '")'); if (!ti.length) return;
      var cols = ti[0].values.map(function (v) { return { n: v[1], ty: String(v[2] || '').toUpperCase(), pk: v[5] }; });
      var k = cols.filter(function (c) { return c.n.toLowerCase() === t.toLowerCase() + '_id'; })[0]; if (!k) return;
      out.push({ t: t, k: k.n, mixed: k.n !== k.n.toLowerCase(), cols: cols.map(function (c) { return c.n; }), types: cols.map(function (c) { return c.ty; }) });
    });
    return out;
  });
  var mixed = census.filter(function (c) { return c.mixed; }), lower = census.filter(function (c) { return !c.mixed; });
  console.log('§TIPREAD-CENSUS tables_with_pk=' + census.length + ' mixed_case_pk=' + mixed.length + ' lowercase_pk=' + lower.length + ' mixed=[' + mixed.map(function (c) { return c.t; }).join(',') + ']');
  verdict('T1', census.length > 0 && mixed.length > 0, 'the bundle has tables whose pk column name is not lowercase (the property under test): N=' + census.length + ' mixed=' + mixed.length);

  // helpers: the page's own write path, and the process-trx read path
  function upd(table, id, changes) { return pg.evaluate(function (a) { return new Promise(function (res) {
    var done = false, fin = function (v) { if (!done) { done = true; window.removeEventListener('overlay:committed', once); res(v); } };
    var once = function (e) { if (e.detail && String(e.detail.table).toLowerCase() === a.t) fin('committed'); };
    window.addEventListener('overlay:committed', once);
    try { window.__crud.applyOp({ op_type: 'CRUD_UPDATE', key: a.t, table: a.t, verb: 'update', id: a.id, changes: a.c }, function (r) { if (r && r.ok === false) fin('REJECT:' + (r.reason || r.error || '')); }); } catch (e) { fin('THROW:' + e.message); }
    setTimeout(function () { fin('TIMEOUT'); }, 6000); }); }, { t: table, id: id, c: changes }); }
  function trxGet(table, id) { return pg.evaluate(function (a) { return new Promise(function (res) {
    var got = false;
    window.__crud.modelRun({ table: a.t, timing: 'PROCESS', fn: function (trx) { var r = trx.get(a.t, a.id); got = true; res(r ? Object.assign({}, r) : null); return { ok: true }; } }, function () { if (!got) res('NOTRUN'); });
    setTimeout(function () { if (!got) res('TIMEOUT'); }, 8000); }); }, { t: table, id: id }); }
  function trxQ(sql) { return pg.evaluate(function (q) { return new Promise(function (res) { var got = false; window.__crud.modelRun({ table: 'c_order', timing: 'PROCESS', fn: function (trx) { got = true; res(trx.q(q)); return { ok: true }; } }, function () { if (!got) res('NOTRUN'); }); setTimeout(function () { if (!got) res('TIMEOUT'); }, 8000); }); }, sql); }

  // T2 X of N
  var AUDIT = /^(created|createdby|updated|updatedby|ad_client_id|ad_org_id|isactive|processed|processing|posted|docstatus|docaction|.*_uu)$/i;
  var sample = mixed.concat(process.env.TIP_ALL ? lower : lower.filter(function (c, i) { return i % Math.max(1, Math.floor(lower.length / 12)) === 0; }).slice(0, 12));
  var ok = 0, bad = [], inconc = [], judgedRows = 0;
  for (var si = 0; si < sample.length; si++) {
    var c = sample[si];
    var row = await pg.evaluate(function (c) {
      var cols = c.cols.map(function (n) { return '"' + n + '"'; }).join(',');
      // a row whose key is >0 (a seed row, not a sidecar-synthetic one)
      var hasCli = c.cols.some(function (n) { return n.toLowerCase() === 'ad_client_id'; });
      var r = window.__idmpDb.exec('SELECT ' + cols + ' FROM "' + c.t + '" WHERE "' + c.k + '" IS NOT NULL' + (hasCli ? ' AND AD_Client_ID=11' : '') + ' ORDER BY "' + c.k + '" DESC LIMIT 1');   // the page's gate rejects a system (client 0) row for a client-11 user: that is the dictionary rule, not what is under test
      if (!r.length) return null; var o = {}; r[0].columns.forEach(function (n, i) { o[n] = r[0].values[0][i]; }); return o;
    }, c);
    if (!row) { inconc.push(c.t + ':empty-table'); continue; }
    var col = null;
    for (var i = 0; i < c.cols.length; i++) { if (/TEXT|CHAR|^$/.test(c.types[i]) && !AUDIT.test(c.cols[i]) && c.cols[i].toLowerCase() !== c.k.toLowerCase() && !/_id$/i.test(c.cols[i]) && !/^(value|name)$/i.test(c.cols[i]) === true) { col = c.cols[i]; break; } }
    if (!col) for (i = 0; i < c.cols.length; i++) { if (/TEXT|CHAR/.test(c.types[i]) && !AUDIT.test(c.cols[i]) && !/_id$/i.test(c.cols[i])) { col = c.cols[i]; break; } }
    if (!col) { inconc.push(c.t + ':no-plain-text-column'); continue; }
    var nv = 'TIPREAD-' + c.t.slice(0, 12), id = row[c.k];
    var w = await upd(c.t.toLowerCase(), id, (function () { var o = {}; o[col.toLowerCase()] = { old: row[col], new: nv }; return o; })());
    if (w !== 'committed') { inconc.push(c.t + ':write-' + w); continue; }
    await sleep(250);
    var g = await trxGet(c.t.toLowerCase(), id), seen = (g && typeof g === 'object') ? g[col.toLowerCase()] : g;
    judgedRows++;
    if (seen === nv) ok++; else bad.push(c.t + '.' + col + '(' + id + ')=' + JSON.stringify(seen));
  }
  console.log('§TIPREAD-SAMPLE X_of_N=' + ok + '_of_' + judgedRows + ' (census N=' + census.length + ', sampled=' + sample.length + ', not judged=' + inconc.length + ') not_judged=[' + inconc.join(',') + '] WRONG=[' + bad.join(' | ') + ']');
  if (!judgedRows) { console.log('§TIPREAD-INCONCLUSIVE T2 no table was judged'); }
  else verdict('T2', ok === judgedRows, 'a signed CRUD_UPDATE on a bundle row is what Trx.get reads: X of N = ' + ok + ' of ' + judgedRows + ' tables (' + mixed.length + ' mixed-case pk in the census)', bad.slice(0, 6).join(' | '));

  // T3 the exact H10/H11b precondition
  var w3 = await upd('m_warehouse', 104, { m_warehousesource_id: { old: null, new: 103 } }); await sleep(400);
  var g3 = await trxGet('m_warehouse', 104), q3 = await trxQ('SELECT m_warehousesource_id AS s FROM m_warehouse WHERE m_warehouse_id=104');
  verdict('T3', w3 === 'committed' && g3 && Number(g3.m_warehousesource_id) === 103 && q3 && q3[0] && Number(q3[0].s) === 103, 'M_Warehouse 104 M_WarehouseSource_ID set by a signed CRUD_UPDATE reads 103 in Trx.get and in trx.q', 'write=' + w3 + ' get=' + (g3 && g3.m_warehousesource_id) + ' q=' + JSON.stringify(q3));

  // T4 created side (control)
  var cid = await pg.evaluate(function () { return new Promise(function (res) { var once = function (e) { if (e.detail && String(e.detail.table).toLowerCase() === 'm_warehouse') { window.removeEventListener('overlay:committed', once); res(e.detail.createdId); } };
    window.addEventListener('overlay:committed', once);
    window.__crud.applyOp({ op_type: 'CRUD_CREATE', key: 'm_warehouse', table: 'm_warehouse', verb: 'create', fields: { value: 'TIPW', name: 'Tip Warehouse', ad_client_id: 11, ad_org_id: 12, isactive: 'Y' } });
    setTimeout(function () { res(null); }, 6000); }); });
  await sleep(400);
  var g4 = cid != null ? await trxGet('m_warehouse', cid) : null, q4 = cid != null ? await trxQ('SELECT name FROM m_warehouse WHERE m_warehouse_id=' + Number(cid)) : null;
  verdict('T4', cid != null && g4 && g4.name === 'Tip Warehouse' && q4 && q4[0] && q4[0].name === 'Tip Warehouse', 'a CRUD_CREATE warehouse is read back by Trx.get and trx.q (control: the create side)', 'id=' + cid + ' get=' + (g4 && g4.name) + ' q=' + JSON.stringify(q4));

  var pe = errs.length;
  console.log('§TIPREAD-VERDICT ' + (judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fails=' + fails + ' pageerrors=' + pe + (pe ? ' ' + errs[0].slice(0, 120) : ''));
  await browser.close(); server.close();
  process.exit(judged && !fails ? 0 : 1);
})().catch(function (e) { console.log('§TIPREAD-CRASH ' + (e && e.stack || e)); process.exit(2); });
