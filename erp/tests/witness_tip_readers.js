// ⚠ DO NOT REMOVE — W-TIP-READERS (bim-compiler prompts/TEAMWORK_FRAMEWORK.md §41.2 L3, agent J). READ THE LOG after every run; exit code is not evidence.
// SPEC (written first): the host has ONE reader for "what this device holds": the TIP = the shipped bundle + every row this session's signed ops wrote.
//   Legacy: PO.save writes, the very next MLookup / MQuery / process-parameter read sees it. Twin: crud_overlay.withModelTrx shadows the written tables.
//   idempiere.html had TWO readers: _sqlRows (bare bundle, 103 call sites) and _tipSql (the tip, 10 sites). A record made this session was therefore missing from
//   every site that read the bare bundle - found at the process dialog (agent H): a warehouse created this session was not offered for Replenish Report's
//   M_Warehouse_ID, legacy offers it. Rule (derived, not listed): every DATA read is a tip read; the bare bundle is read only (a) as the BASE a site folds ops
//   over itself, (b) for the bundle's own structure (PRAGMA / sqlite_master). Those are _baseRows, one named seam; a new one is a conscious entry in BASE_OK below.
// ISSUES it proves/disproves (each arm names one):
//   TR1 WAREHOUSE  a warehouse created this session is offered in the Replenish Report (53267) M_Warehouse_ID parameter, opened from the MENU (the defect).
//   TR2 ONE READER the source has exactly one tip reader and no second mechanism: no _tipSql beside _sqlRows; _sqlRows reads through withModelTrx; X of N
//                  call sites read the tip, the rest are _baseRows sites that match BASE_OK by enclosing function (count equal, nothing silent).
//   TR3 CHEAP      the tip reader shadows only the written tables the statement names: a read of a table nobody wrote costs about the same with 4 other tables
//                  written as with none (hot paths stay hot). §TIPR-COST prints the ms.
//   TR4 NESTED     a tip read inside a tip read (a process handler reading through the host while it runs in a Trx) must not drop the outer shadow.
//   TR5 BASE       the bundle itself is untouched by session writes (the base readers still see the BASE - a fold must not double-count).
// Run: node --no-experimental-fetch erp/tests/witness_tip_readers.js > <log>      (TIPR_NO_MUT=1 skips the 6 mutants; TIPR_MUT=<json {file,from,to}> is the mutant child mode)
'use strict';
var path = require('path'), http = require('http'), fs = require('fs');
var ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var judged = 0, fails = 0, ARMS = {};
function verdict(id, ok, label, detail) { judged++; ARMS[id] = ARMS[id] || 0; if (!ok) { fails++; ARMS[id]++; } console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + id + ' ' + label + (detail ? ' — ' + detail : '')); return ok; }
var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
var MUT = process.env.TIPR_MUT ? JSON.parse(process.env.TIPR_MUT) : null;

// every _baseRows( site, keyed by the first words of its statement (normalised): how many, and why it must see the BARE bundle - it supplies the BASE a fold starts from, or reads the bundle's own structure
var BASE_OK = [
  ['sql)', 1, '_sqlRows falls back to the bare bundle when the overlay is absent'],
  ["'SELECT * FROM ' + tn + ' WHERE ' + kc + '=' + _lit(pk)", 1, 'record-info change log: the pre-session row the log diffs against (changeLog baseRow)'],
  ["'SELECT * FROM ad_userquery", 1, 'base for core.listTip (ad_userquery)'],
  ["'SELECT * FROM c_order WHERE", 1, 'base for the listTip fallback of _foldOrderRow (the tip read is tried first)'],
  ["'SELECT * FROM c_orderline WHERE", 1, 'base for the listTip fallback of _foldOrderLines'],
  ["'SELECT * FROM ' + table)", 2, 'tipRows base for _foldRowsSync; _appendOnlyRowsFor base the CREATE_LINE replay is appended to'],
  ["'SELECT COALESCE(SUM(s.qtyonhand)", 1, 'onHandOf: base stock; _sidecarStockDelta adds the op delta itself'],
  ["'SELECT * FROM ' + dir.doc", 1, 'Match form header base for _foldTable'], ["'SELECT * FROM ' + dir.line", 1, 'Match form line base for _foldTable'],
  ["'SELECT t_selection_id AS i", 1, 't_selection is written straight into the bundle by this page (never a signed op); read back what was written'],
  ["'SELECT * FROM ad_pinstance WHERE", 1, 'base for core.listTip (ad_pinstance)'], ["'SELECT * FROM ad_pinstance_para WHERE", 1, 'base for core.listTip (ad_pinstance_para)'],
  ["'SELECT * FROM ad_recentitem WHERE", 2, 'base for the recent-item fold (add / list)'],
  ["'SELECT * FROM ' + tn + ' WHERE ' + where", 1, 'base for _recentTip of the recent item\'s record'],
  ["'PRAGMA table_info(' + t + ')'", 2, 'the bundle\'s own structure (housekeeping)'],
  ["'SELECT * FROM ' + t + ' WHERE ad_client_id", 1, 'housekeeping base for _recentTip'], ["'SELECT * FROM ' + t)", 1, 'housekeeping base for _recentTip'],
  ['"SELECT name FROM sqlite_master', 1, 'the bundle\'s own structure (housekeeping)'],
  ["'SELECT * FROM ' + t + ' WHERE ' + kc + '=' + _lit(id)", 1, 'change audit: the pre-session row (baseRowOf)'],
  ["'SELECT ad_session_id, createdby", 1, 'base for core.listTip (ad_session)'],
  ["'SELECT * FROM ad_tab_customization", 1, 'base for _recentTip (ad_tab_customization)']
];

(async function () {
  var src = fs.readFileSync(path.join(ROOT, 'erp', 'idempiere.html'), 'utf8'), served = {};
  if (MUT) {   // the page is served with ONE edit (a copy in memory - the tree is never touched); the edit must apply exactly once or the child CRASHES (a crash is not a kill)
    var mf = path.join(ROOT, MUT.file), orig = fs.readFileSync(mf, 'utf8');
    if (orig.split(MUT.from).length !== 2) { console.log('§TIPR_CRASH MUTATION DID NOT APPLY (anchor not found exactly once) ' + MUT.file + ' :: ' + MUT.from.slice(0, 80)); process.exit(2); }
    var edited = orig.replace(MUT.from, function () { return MUT.to; });
    if (MUT.file === '/erp/idempiere.html') src = edited; else served[MUT.file] = edited;
    console.log('§TIPR_MUTANT applied ' + MUT.file + ' (' + orig.length + ' -> ' + edited.length + ' bytes)');
  }
  var server = http.createServer(function (req, res) {
    var p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (served[p]) { res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(served[p]); return; }
    if (p === '/erp/idempiere.html' || p === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(src); return; }
    var f = path.join(ROOT, p);
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

  function create(table, fields) { return pg.evaluate(function (a) { return new Promise(function (res) {
    var once = function (e) { if (e.detail && String(e.detail.table).toLowerCase() === a.t) { window.removeEventListener('overlay:committed', once); res(e.detail.createdId); } };
    window.addEventListener('overlay:committed', once);
    window.__crud.applyOp({ op_type: 'CRUD_CREATE', key: a.t, table: a.t, verb: 'create', fields: a.f });
    setTimeout(function () { res(null); }, 8000); }); }, { t: table, f: fields }); }

  // ── TR3 first (nothing written yet: the zero-written baseline), then the four writes it needs ──
  var COST_SQL = 'SELECT name FROM ad_table WHERE ad_table_id=259';
  var cost0 = await pg.evaluate(function (q) { var s = performance.now(); for (var i = 0; i < 40; i++) window.__crud.withModelTrx(function (x) { return x(q); }, { sql: q }); return (performance.now() - s) / 40; }, COST_SQL);

  // ── TR1 the defect: a warehouse created this session, offered in a process parameter opened from the menu ──
  var whId = await create('m_warehouse', { value: 'TIPR-WH', name: 'TIPR Session Warehouse', ad_client_id: 11, ad_org_id: 12, isactive: 'Y' });
  await sleep(500);
  var opened = await pg.evaluate(function () { var leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="53354"]'); if (!leaf) return false; var n = leaf.parentElement; while (n && n.id !== 'idmp-tree') { if (n.classList && n.classList.contains('idmp-node')) n.classList.add('open'); n = n.parentElement; } leaf.click(); return true; });
  if (opened) await pg.waitForSelector('#idmp-content [data-proc-run]', { timeout: 20000 }).catch(function () {});
  await sleep(800);
  var opts = await pg.evaluate(function () { var s = document.querySelector('#idmp-content [data-proc-param="M_Warehouse_ID"]'); return s && s.options ? Array.prototype.map.call(s.options, function (o) { return { v: o.value, t: o.textContent }; }) : null; });
  var seedOpt = opts && opts.filter(function (o) { return o.v === '103'; })[0], newOpt = opts && whId != null && opts.filter(function (o) { return o.v === String(whId); })[0];
  console.log('§TIPR-WH created=' + whId + ' menuOpened=' + opened + ' options=' + (opts ? opts.length : 'none') + ' seed103=' + !!seedOpt + ' new=' + JSON.stringify(newOpt || null) + ' ' + (logs.filter(function (l) { return /§PROC-PARAM-PICKER col=M_Warehouse_ID/.test(l); }).pop() || '').slice(0, 160));
  if (whId == null || !opened || !opts || !seedOpt) console.log('§TIPR-INCONCLUSIVE TR1 precondition not met (created=' + whId + ' opened=' + opened + ' seedOptionShown=' + !!seedOpt + ')');
  else verdict('TR1', !!newOpt && /TIPR/.test(newOpt.t), 'a warehouse created this session is offered in the Replenish Report M_Warehouse_ID parameter (the seed warehouse 103 is, as control)', 'new option=' + JSON.stringify(newOpt || null));

  // ── TR3 cost: the same read, with m_warehouse written and then 3 more tables written; the hint keeps the unrelated read as cheap as before ──
  await create('c_bpartner', { value: 'TIPR-BP', name: 'TIPR BP', ad_client_id: 11, ad_org_id: 12, isactive: 'Y' });
  await create('m_product', { value: 'TIPR-P', name: 'TIPR Product', ad_client_id: 11, ad_org_id: 12, isactive: 'Y' });
  await create('c_order', { documentno: 'TIPR-1', ad_client_id: 11, ad_org_id: 12, isactive: 'Y' });
  var cost4 = await pg.evaluate(function (q) { var s = performance.now(); for (var i = 0; i < 40; i++) window.__crud.withModelTrx(function (x) { return x(q); }, { sql: q }); return (performance.now() - s) / 40; }, COST_SQL);
  var costRel = await pg.evaluate(function () { var q = 'SELECT name FROM m_warehouse WHERE m_warehouse_id=103', s = performance.now(); for (var i = 0; i < 40; i++) window.__crud.withModelTrx(function (x) { return x(q); }, { sql: q }); return (performance.now() - s) / 40; });
  var bare = await pg.evaluate(function (q) { var s = performance.now(); for (var i = 0; i < 40; i++) window.__idmpDb.exec(q); return (performance.now() - s) / 40; }, COST_SQL);
  console.log('§TIPR-COST ms bare=' + bare.toFixed(3) + ' tip_0_written=' + cost0.toFixed(3) + ' tip_4_written_unrelated=' + cost4.toFixed(3) + ' tip_4_written_related(m_warehouse)=' + costRel.toFixed(3));
  verdict('TR3', cost4 <= Math.max(cost0 * 2.5, 1.0), 'a tip read of a table nobody wrote costs the same with 4 other tables written (shadow limited to the statement\'s tables)', 'ms 0 written=' + cost0.toFixed(3) + ' 4 written=' + cost4.toFixed(3));

  // ── TR4 nested tip read: the outer shadow survives the inner one ──
  var nest = await pg.evaluate(function (id) {
    var w = window.__crud.withModelTrx, sql = 'SELECT name FROM m_warehouse WHERE m_warehouse_id=' + Number(id);
    return w(function (q) {
      var before = q(sql)[0], inner = w(function (q2) { return q2(sql)[0]; }, { sql: sql }), after = q(sql)[0];
      return { before: before && before.name, inner: inner && inner.name, after: after && after.name };
    }, { sql: sql });
  }, whId);
  console.log('§TIPR-NEST ' + JSON.stringify(nest));
  if (whId == null) console.log('§TIPR-INCONCLUSIVE TR4 no warehouse to read');
  else verdict('TR4', nest && nest.before === 'TIPR Session Warehouse' && nest.inner === 'TIPR Session Warehouse' && nest.after === 'TIPR Session Warehouse', 'a tip read inside a tip read keeps the outer shadow (before / inner / after all see the session warehouse)', JSON.stringify(nest));

  // ── TR5 the bundle is not the tip: the base seam still sees the pre-session state ──
  var inBundle = await pg.evaluate(function (id) { var r = window.__idmpDb.exec('SELECT count(*) FROM m_warehouse WHERE m_warehouse_id=' + Number(id)); return r[0].values[0][0]; }, whId);
  var stillShadow = await pg.evaluate(function () { var r = window.__idmpDb.exec("SELECT name FROM sqlite_temp_master WHERE type='table' AND lower(name)='m_warehouse'"); return r.length ? r[0].values.length : 0; });
  console.log('§TIPR-BASE bundleRowsForSessionWarehouse=' + inBundle + ' leftoverTempShadows=' + stillShadow);
  if (whId == null) console.log('§TIPR-INCONCLUSIVE TR5 no warehouse to look for');
  else verdict('TR5', Number(inBundle) === 0 && Number(stillShadow) === 0, 'the session warehouse is in the tip only (bundle rows 0) and no temp shadow is left behind after the reads', 'bundle=' + inBundle + ' shadows=' + stillShadow);

  // ── TR2 one reader: source census (X of N) ──
  var sites = [], re = /\b(_sqlRows|_tipSql|_baseRows)\(/g, m;
  while ((m = re.exec(src))) { var pre = src.slice(Math.max(0, m.index - 9), m.index); if (/function\s+$/.test(pre)) continue; sites.push({ kind: m[1], idx: m.index }); }
  function enclosing(idx) { var head = src.slice(0, idx), r2 = /function\s+([A-Za-z_$][\w$]*)\s*\(/g, last = null, mm; while ((mm = r2.exec(head))) last = mm[1]; return last; }
  var defs = { tipSql: /function\s+_tipSql\s*\(/.test(src), sqlRows: src.match(/function\s+_sqlRows\s*\(([\s\S]{0,900}?)\n  \}/), baseRows: /function\s+_baseRows\s*\(/.test(src) };
  var N = sites.length, nBase = sites.filter(function (s) { return s.kind === '_baseRows'; }).length, nTipOld = sites.filter(function (s) { return s.kind === '_tipSql'; }).length;
  var sqlRowsReadsTip = !!(defs.sqlRows && /withModelTrx/.test(defs.sqlRows[1]));
  var tipSites = sites.filter(function (s) { return s.kind === '_tipSql' || (s.kind === '_sqlRows' && sqlRowsReadsTip); }).length;
  var snippet = function (idx) { return src.slice(idx + '_baseRows('.length, idx + '_baseRows('.length + 140).replace(/\s+/g, ' '); };
  var used = BASE_OK.map(function () { return 0; }), unexpected = [], missing = [];
  sites.filter(function (s) { return s.kind === '_baseRows'; }).forEach(function (s) {
    var sn = snippet(s.idx), k = BASE_OK.findIndex(function (e) { return sn.indexOf(e[0]) === 0; });
    if (k < 0) unexpected.push(sn.slice(0, 60)); else used[k]++;
  });
  BASE_OK.forEach(function (e, k) { if (used[k] !== e[1]) missing.push(e[0].slice(0, 40) + ' x' + used[k] + '/' + e[1]); });
  console.log('§TIPR-CENSUS call_sites=' + N + ' read_the_tip=' + tipSites + ' base_sites=' + nBase + ' legacy_tipSql_sites=' + nTipOld + ' tipSql_defined=' + defs.tipSql + ' sqlRows_reads_tip=' + sqlRowsReadsTip + ' baseRows_defined=' + defs.baseRows + ' unexpected_base=[' + unexpected.join(' | ') + '] allow_list_count_mismatch=[' + missing.join(' | ') + ']');
  if (!N) console.log('§TIPR-INCONCLUSIVE TR2 no call sites parsed');
  else verdict('TR2', !defs.tipSql && nTipOld === 0 && sqlRowsReadsTip && defs.baseRows && !unexpected.length && !missing.length, 'ONE tip reader: X of N call sites read the tip = ' + tipSites + ' of ' + N + '; ' + nBase + ' base sites, all on the allow-list; no second tip reader', 'unexpected=[' + unexpected.join(' | ') + '] mismatch=[' + missing.join(' | ') + '] tipSql_defined=' + defs.tipSql);

  var pe = errs.length;
  console.log('§TIPR-VERDICT ' + (judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fails=' + fails + ' arms=' + JSON.stringify(ARMS) + ' pageerrors=' + pe + (pe ? ' ' + errs[0].slice(0, 120) : ''));
  await browser.close(); server.close();
  if (!MUT && !process.env.TIPR_NO_MUT) {
    // mutants: each breaks ONE rule; the child must exit 1 with the named arm red (exit 2 = crash or did-not-apply = NOT a kill)
    var cp = require('child_process'), killed = 0, notKilled = [], MUTANTS = [
      ['reader ignores the tip (bare bundle)', '/erp/idempiere.html', "    try { if (window.__crud && typeof window.__crud.withModelTrx === 'function') { var r = window.__crud.withModelTrx(function (q) { return q(sql); }, { sql: sql }); if (r) return r; } } catch (e) {}\n    return _baseRows(sql);", "    return _baseRows(sql);", ['TR1', 'TR2']],
      ['a second tip reader returns', '/erp/idempiere.html', "  function _sysConfig(name, clientId) {", "  function _tipSql(sql) { return _sqlRows(sql); }\n  function _sysConfig(name, clientId) {", ['TR2']],
      ['process-parameter lookup reads the bundle', '/erp/idempiere.html', "var rows = _sqlRows('SELECT ' + key + ' AS k, ' + disp", "var rows = _baseRows('SELECT ' + key + ' AS k, ' + disp", ['TR1', 'TR2']],
      ['a fold base read through the tip (double count)', '/erp/idempiere.html', "var base = _baseRows('SELECT * FROM ad_userquery", "var base = _sqlRows('SELECT * FROM ad_userquery", ['TR2']],
      ['no statement hint: every written table shadowed per read', '/erp/crud_overlay.js', "    if (!sql || !all.length) return all;\n    var words", "    if (true) return all;\n    var words", ['TR3']],
      ['nested read re-shadows what the outer holds', '/erp/crud_overlay.js', "                      if (held) want = want.filter(function (t) { return !held.have[t]; });\n", "", ['TR4']]
    ];
    MUTANTS.forEach(function (m) {
      var r = cp.spawnSync(process.execPath, ['--no-experimental-fetch', __filename], { env: Object.assign({}, process.env, { TIPR_MUT: JSON.stringify({ file: m[1], from: m[2], to: m[3] }) }), encoding: 'utf8', timeout: 300000 });
      var out = r.stdout || '', red = (out.match(/🔴 (TR\d)/g) || []).map(function (x) { return x.slice(3); }), want = m[4];
      var ok = r.status === 1 && want.every(function (a) { return red.indexOf(a) >= 0; });
      console.log('§TIPR-MUTANT ' + (ok ? 'KILLED' : 'SURVIVED/NOT-JUDGED') + ' "' + m[0] + '" exit=' + r.status + ' red=[' + red.join(',') + '] wanted=[' + want.join(',') + ']' + (r.status === 2 ? ' ' + (out.match(/§TIPR_CRASH.*/) || [''])[0].slice(0, 120) : ''));
      if (ok) killed++; else notKilled.push(m[0]);
    });
    console.log('§TIPR-MUTANTS killed=' + killed + ' of ' + MUTANTS.length + (notKilled.length ? ' NOT KILLED: ' + notKilled.join('; ') : ''));
    if (notKilled.length) fails++;
  }
  process.exit(judged && !fails ? 0 : 1);
})().catch(function (e) { console.log('§TIPR-CRASH ' + (e && e.stack || e)); process.exit(2); });
