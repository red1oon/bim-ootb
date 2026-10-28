// ⚠ DO NOT REMOVE — W-BUNDLE-PROJECTION (bim-compiler prompts/TEAMWORK_FRAMEWORK.md §41.2 L4b, agent J). READ THE LOG after every run; exit code is not evidence.
// SPEC (written first): PROJECTED rows are not base data. While an executor map is in force Team sets IsActive='N' on Document Action Access rows IN MEMORY (team_sync.js projectExecutorRows, "nothing is written to the
//   op log, so the rule vanishes with the policy"). The host persists the in-memory bundle to the resident cache (IndexedDB ad_seed_v18) at three points - tenant delete, shard install, tenant genesis - by db.export().
//   A snapshot taken under the overlay therefore persisted the PROJECTION as if it were base: after a reload the rule stayed on the device with no policy behind it (the map retired, the rows still 'N').
//   Rule: a module that overlays the bundle registers {unproject, reproject} with window.BundleProjection; the host's ONE snapshot function (_persistBundle) runs unproject -> export -> reproject. No table is named.
// ISSUES (each arm names one):
//   BP1 BASE      the snapshot taken under a registered overlay holds the BASE value of the overlaid row (Y), not the projection (N).
//   BP2 RESTORED  after the snapshot the overlay is back in memory (N): the running device is not changed by being snapshotted.
//   BP3 JUDGED    the snapshot is a real one: the deleted tenant's rows are gone from it (so BP1 is not a pass on an empty/old blob), and a CONTROL row nobody overlaid is unchanged.
//   BP4 FAILS SAFE an unproject that throws persists NOTHING (the old blob stays: the tenant is still in it) and leaves no overlay broken in memory.
// NAMED, NOT JUDGED HERE: the REAL Team overlay. team_sync.js is agent E's file this wave; it registers with two lines (see the report). Until it does, BP1 on a real executor map stays red - the seam is proven with a
//   faithful double (same shape of write: a direct UPDATE of IsActive on a Document Action Access row, previous value kept privately). §BP-REAL prints INCONCLUSIVE for it.
// Run: node --no-experimental-fetch erp/tests/witness_bundle_projection.js > <log>      (BP_NO_MUT=1 skips the mutants; BP_MUT=<json {file,from,to}> is the mutant child mode)
'use strict';
var path = require('path'), http = require('http'), fs = require('fs');
var ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var judged = 0, fails = 0, ARMS = {};
function verdict(id, ok, label, detail) { judged++; ARMS[id] = ARMS[id] || 0; if (!ok) { fails++; ARMS[id]++; } console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + id + ' ' + label + (detail ? ' — ' + detail : '')); return ok; }
var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
var MUT = process.env.BP_MUT ? JSON.parse(process.env.BP_MUT) : null;
var ROLE = 102, DT = 115, RL = 178, CONTROL_RL = 179;   // role 102 GardenWorld Admin, doctype 115, two of its Document Action Access rows (both 'Y' in the shipped seed)

(async function () {
  var served = {};
  if (MUT) {
    var orig = fs.readFileSync(path.join(ROOT, MUT.file), 'utf8');
    if (orig.split(MUT.from).length !== 2) { console.log('§BP_CRASH MUTATION DID NOT APPLY (anchor not found exactly once) ' + MUT.file + ' :: ' + MUT.from.slice(0, 80)); process.exit(2); }
    served[MUT.file] = orig.replace(MUT.from, function () { return MUT.to; });
    console.log('§BP_MUTANT applied ' + MUT.file);
  }
  var server = http.createServer(function (req, res) {
    var p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/erp/idempiere.html';
    if (served[p]) { res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(served[p]); return; }
    var f = path.join(ROOT, p);
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port;
  var browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] });
  var pg = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage(), errs = [], logs = [];
  pg.on('pageerror', function (e) { errs.push(e.message); }); pg.on('console', function (m) { logs.push(m.text()); });
  // the LOGIN screen (no ?login=): step 0 lists the resident tenants, each but System/GardenWorld with a delete affordance - the page's own tenant-delete path
  await pg.goto(base + '/erp/idempiere.html?lang=en_US', { waitUntil: 'load' });
  await pg.waitForFunction(function () { return window.__idmpDb && window.SQL && document.querySelector('.idmp-tenant-del'); }, null, { timeout: 120000 });
  await sleep(500);

  var q = function (sql) { return pg.evaluate(function (s) { var r = window.__idmpDb.exec(s); return r.length ? r[0].values : []; }, sql); };
  var cell = function (rl) { return "SELECT isactive FROM ad_document_action_access WHERE ad_role_id=" + ROLE + " AND c_doctype_id=" + DT + " AND ad_ref_list_id=" + rl; };
  var before = { target: (await q(cell(RL)))[0], control: (await q(cell(CONTROL_RL)))[0], users12: (await q('SELECT count(*) FROM ad_user WHERE ad_client_id=12'))[0][0] };
  console.log('§BP-PRE target=' + JSON.stringify(before.target) + ' control=' + JSON.stringify(before.control) + ' users(client 12)=' + before.users12 + ' BundleProjection=' + (await pg.evaluate(function () { return typeof window.BundleProjection; })));
  if (!before.target || before.target[0] !== 'Y' || !before.control || before.control[0] !== 'Y' || !(before.users12 > 0)) { console.log('§BP-INCONCLUSIVE precondition: the rows the arms judge are not as the shipped seed has them'); await browser.close(); server.close(); process.exit(2); }

  // a faithful double of Team's overlay: a DIRECT UPDATE of IsActive on a Document Action Access row, the previous value kept privately (execRows), restored on unproject
  await pg.evaluate(function (a) {
    var db = window.__idmpDb, prev = {}, w = "ad_role_id=" + a.role + " AND c_doctype_id=" + a.dt + " AND ad_ref_list_id=" + a.rl;
    window.__projDouble = { project: function () { prev.v = db.exec('SELECT isactive FROM ad_document_action_access WHERE ' + w)[0].values[0][0]; db.run("UPDATE ad_document_action_access SET isactive='N' WHERE " + w); },
      unproject: function () { if (prev.v != null) db.run("UPDATE ad_document_action_access SET isactive=? WHERE " + w, [prev.v]); }, reproject: function () { db.run("UPDATE ad_document_action_access SET isactive='N' WHERE " + w); }, throwOnUnproject: false };
    window.__projDouble.project();
    if (window.BundleProjection && window.BundleProjection.register) window.__projUnreg = window.BundleProjection.register({ name: 'test-double', unproject: function (d) { if (window.__projDouble.throwOnUnproject) throw new Error('unproject refused'); window.__projDouble.unproject(d); }, reproject: function (d) { window.__projDouble.reproject(d); } });
  }, { role: ROLE, dt: DT, rl: RL });
  var mem0 = (await q(cell(RL)))[0];
  console.log('§BP-OVERLAY in-memory target=' + JSON.stringify(mem0) + ' (the projection) registered=' + (await pg.evaluate(function () { return !!window.__projUnreg; })));

  // BP4 first (a failing unproject): delete tenant 12 through the page's own UI; nothing may be persisted
  async function deleteTenant(clientId) {
    return pg.evaluate(function (cid) { var btns = Array.prototype.slice.call(document.querySelectorAll('.idmp-tenant-del')); var b = btns.filter(function (x) { return /\b/.test(x.title) && (x.parentElement.textContent || '').indexOf(' · ' + cid) >= 0; })[0]; if (!b) return 'NO-BUTTON'; b.click(); return 'clicked'; }, clientId)
      .then(async function (r) { if (r !== 'clicked') return r; await pg.waitForSelector('#idmp-del-go', { timeout: 10000 }); await pg.click('#idmp-del-go'); await sleep(1500); return 'deleted'; });
  }
  // the persisted snapshot is read AND opened inside the page (it is ~30 MB: never serialised out through the driver)
  function readBlob(sqls) { return pg.evaluate(function (ss) { return new Promise(function (res) { var rq = indexedDB.open('erp_cache', 1);
    rq.onsuccess = function () { try { var g = rq.result.transaction('blobs').objectStore('blobs').get('ad_seed_v18');
      g.onsuccess = function () { if (!g.result) { res(null); return; } var d = new window.SQL.Database(new Uint8Array(g.result)), out = ss.map(function (s) { var r = d.exec(s); return r.length ? r[0].values : []; }); d.close(); res({ bytes: g.result.byteLength, out: out }); }; g.onerror = function () { res(null); };
      } catch (e) { res(null); } }; rq.onerror = function () { res(null); }; setTimeout(function () { res(null); }, 30000); }); }, sqls); }
  var BSQL = [cell(RL), cell(CONTROL_RL), 'SELECT count(*) FROM ad_user WHERE ad_client_id=12'];

  // ── BP4: unproject throws ──
  await pg.evaluate(function () { window.__projDouble.throwOnUnproject = true; });
  var blob0 = await readBlob(BSQL);
  var d4 = await deleteTenant(12); await sleep(800);
  var blob4 = await readBlob(BSQL), same = (blob0 === null && blob4 === null) || (blob0 && blob4 && blob0.bytes === blob4.bytes && blob4.out[2][0][0] === blob0.out[2][0][0]), mem4 = (await q(cell(RL)))[0], still12 = (await q('SELECT count(*) FROM ad_user WHERE ad_client_id=12'))[0][0];
  console.log('§BP-FAILSAFE delete=' + d4 + ' blobBefore=' + (blob0 ? blob0.bytes : null) + ' blobAfter=' + (blob4 ? blob4.bytes : null) + ' memTarget=' + JSON.stringify(mem4) + ' users12InMemory=' + still12 + ' ' + (logs.filter(function (l) { return /PROJ|tenant-deleted/.test(l); }).slice(-2).join(' | ')).slice(0, 200));
  if (d4 !== 'deleted') console.log('§BP-INCONCLUSIVE BP4 the delete did not run (' + d4 + ')');
  else verdict('BP4', same && mem4 && mem4[0] === 'N', 'a failing unproject persists NOTHING (the blob is unchanged) and the overlay is still in memory (' + JSON.stringify(mem4) + ')', 'blob ' + (blob0 ? blob0.bytes : null) + ' -> ' + (blob4 ? blob4.bytes : null));

  // ── BP1-3: unproject works; delete tenant 13 (12 is already gone in memory after BP4's delete ran) ──
  await pg.evaluate(function () { window.__projDouble.throwOnUnproject = false; });
  var left = await pg.evaluate(function () { return Array.prototype.slice.call(document.querySelectorAll('.idmp-tenant-del')).map(function (x) { return (x.parentElement.textContent.match(/ · (\d+)/) || [])[1]; }); });
  var victim = left.filter(function (c) { return c && c !== '0' && c !== '11'; })[0];
  var vUsers = victim ? (await q('SELECT count(*) FROM ad_user WHERE ad_client_id=' + Number(victim)))[0][0] : null, BSQL1 = BSQL.concat(['SELECT count(*) FROM ad_user WHERE ad_client_id=' + Number(victim || -1)]);
  var d1 = victim ? await deleteTenant(Number(victim)) : 'NO-TENANT'; await sleep(800);
  var b1 = await readBlob(BSQL1), rb = b1 ? b1.out : null, memAfter = (await q(cell(RL)))[0];
  console.log('§BP-SNAPSHOT delete=' + d1 + ' victim=' + victim + ' persisted target=' + JSON.stringify(rb && rb[0][0]) + ' control=' + JSON.stringify(rb && rb[1][0]) + ' victimUsers ' + vUsers + ' -> ' + (rb && rb[3][0][0]) + ' users12InBlob=' + (rb && rb[2][0][0]) + ' memoryAfter=' + JSON.stringify(memAfter) + ' ' + (logs.filter(function (l) { return /§PROJ-SNAPSHOT/.test(l); }).pop() || ''));
  if (!b1 || d1 !== 'deleted') console.log('§BP-INCONCLUSIVE BP1-3 no snapshot was taken (delete=' + d1 + ' blob=' + !!b1 + ')');
  else {
    verdict('BP1', rb[0][0] && rb[0][0][0] === 'Y', 'the snapshot taken under the overlay holds the BASE value of the overlaid row (Y), not the projection (N)', 'persisted=' + JSON.stringify(rb[0][0]));
    verdict('BP2', memAfter && memAfter[0] === 'N', 'after the snapshot the overlay is back in memory (N): the running device is unchanged', 'memory=' + JSON.stringify(memAfter));
    verdict('BP3', rb[1][0] && rb[1][0][0] === 'Y' && vUsers > 0 && Number(rb[3][0][0]) === 0, 'the snapshot is a real one: the deleted tenant ' + victim + ' is gone from it (users ' + vUsers + ' -> ' + rb[3][0][0] + ') and the control row nobody overlaid is Y', 'control=' + JSON.stringify(rb[1][0]));
  }
  // ── §BP-REAL: Team's OWN registration (team_sync.js boot) and Team's OWN projection code, in a fresh browser context (fresh resident cache, so tenant 12 can be deleted again). The only stand-in is the roster the executor
  //   map is read from (a stub store answering order()): projectExecutorRows / refreshExecutors / the BundleProjection registration are Team's real code. ──
  var ctx2 = await browser.newContext({ viewport: { width: 1400, height: 900 } }); pg = await ctx2.newPage(); pg.on('pageerror', function (e) { errs.push(e.message); }); pg.on('console', function (m) { logs.push(m.text()); });
  await pg.goto(base + '/erp/idempiere.html?lang=en_US&team=1', { waitUntil: 'load' });
  await pg.waitForFunction(function () { return window.__idmpDb && window.SQL && document.querySelector('.idmp-tenant-del') && window.TeamSync; }, null, { timeout: 120000 }); await sleep(800);
  var NQ = "SELECT count(*) FROM ad_document_action_access WHERE isactive='N'";
  var regd = await pg.evaluate(function () { return { count: window.BundleProjection.count(), team: typeof window.TeamSync }; }), nBase = (await q(NQ))[0][0];
  await pg.evaluate(async function () { var st = { order: async function () { return { roster: { ok: true, executors: { c_order: 102 }, roleAt: function () { return { ad_role_id: 103 }; } } }; } }; await window.TeamSync._refreshExecutors(st, 'witness-kid'); });
  var nMem = (await q(NQ))[0][0], realRow = await q("SELECT ad_role_id, c_doctype_id, ad_ref_list_id FROM ad_document_action_access WHERE isactive='N' AND ad_role_id=103 LIMIT 1");
  var dR = nMem > nBase ? await deleteTenant(12) : 'NO-OVERLAY'; await sleep(800);
  var bR = await readBlob([NQ, 'SELECT count(*) FROM ad_user WHERE ad_client_id=12']), memR = (await q(NQ))[0][0];
  console.log('§BP-REAL registered=' + JSON.stringify(regd) + ' N-rows base=' + nBase + ' under Team overlay=' + nMem + ' delete=' + dR + ' persisted N-rows=' + JSON.stringify(bR && bR.out[0][0]) + ' users12InBlob=' + (bR && bR.out[1][0][0]) + ' memoryAfter=' + memR + ' ' + (logs.filter(function (l) { return /§PROJ-SNAPSHOT|§TEAM_EXEC_ROWS/.test(l); }).slice(-2).join(' | ')).slice(0, 220));
  verdict('BP5', regd.team === 'object' && regd.count === 1, 'Team REGISTERED its overlay with the host (BundleProjection.count() = 1 on a ?team=1 page, nothing else registered it)', JSON.stringify(regd));
  verdict('BP6', nMem > nBase && realRow.length === 1, 'Team\'s own executor-map projection really overlays the bundle: ' + (nMem - nBase) + ' Document Action Access rows are IsActive=N in memory (role 103 among them)', 'N rows ' + nBase + ' -> ' + nMem);
  if (dR !== 'deleted' || !bR) console.log('§BP-INCONCLUSIVE BP7-8 no snapshot was taken (delete=' + dR + ' blob=' + !!bR + ')');
  else {
    verdict('BP7', Number(bR.out[0][0][0]) === Number(nBase) && Number(bR.out[1][0][0]) === 0, 'the snapshot taken under Team\'s REAL overlay persists the BASE: ' + bR.out[0][0][0] + ' N rows in the blob = the ' + nBase + ' the shipped seed has (not ' + nMem + '), and it is a real snapshot (tenant 12 gone from it)', 'blob N=' + bR.out[0][0][0]);
    verdict('BP8', memR === nMem, 'after the snapshot Team\'s overlay is back in memory (' + memR + ' N rows): the running device is unchanged', 'memory N=' + memR);
  }

  var pe = errs.length;
  console.log('§BP-VERDICT ' + (judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fails=' + fails + ' arms=' + JSON.stringify(ARMS) + ' pageerrors=' + pe + (pe ? ' ' + errs[0].slice(0, 120) : ''));
  await browser.close(); server.close();
  if (!MUT && !process.env.BP_NO_MUT) {
    var cp = require('child_process'), killed = 0, notKilled = [], MUTANTS = [
      ['the snapshot exports the live bundle (no unproject)', '/erp/idempiere.html', "      _projectors.slice().reverse().forEach(function (p) { p.unproject(db); done.push(p); });\n", "", ['BP1']],
      ['the overlay is not put back after the snapshot', '/erp/idempiere.html', "      done.reverse().forEach(function (p) { try { p.reproject(db); }", "      done.reverse().forEach(function (p) { try { void 0; }", ['BP2']],
      ['Team does not register its overlay (the real seam is not wired)', '/erp/team_sync.js', "global.BundleProjection.register({ name: 'team-executors'", "void ({ name: 'team-executors'", ['BP5', 'BP7']],
      ['Team registers an overlay that does not unproject (reproject only)', '/erp/team_sync.js', "unproject: function () { projectExecutorRows(null); }", "unproject: function () { }", ['BP7']],
      ['a failing unproject is swallowed and the snapshot persists anyway', '/erp/idempiere.html', "      _projectors.slice().reverse().forEach(function (p) { p.unproject(db); done.push(p); });\n", "      _projectors.slice().reverse().forEach(function (p) { try { p.unproject(db); done.push(p); } catch (e) {} });\n", ['BP4']]
    ];
    MUTANTS.forEach(function (m) {
      var r = cp.spawnSync(process.execPath, ['--no-experimental-fetch', __filename], { env: Object.assign({}, process.env, { BP_MUT: JSON.stringify({ file: m[1], from: m[2], to: m[3] }) }), encoding: 'utf8', timeout: 300000 });
      var out = r.stdout || '', red = (out.match(/🔴 (BP\d)/g) || []).map(function (x) { return x.slice(3); }), ok = r.status === 1 && m[4].every(function (a) { return red.indexOf(a) >= 0; });
      console.log('§BP-MUTANT ' + (ok ? 'KILLED' : 'SURVIVED/NOT-JUDGED') + ' "' + m[0] + '" exit=' + r.status + ' red=[' + red.join(',') + '] wanted=[' + m[4].join(',') + ']' + (r.status === 2 ? ' ' + (out.match(/§BP_CRASH.*/) || [''])[0].slice(0, 120) : ''));
      if (ok) killed++; else notKilled.push(m[0]);
    });
    console.log('§BP-MUTANTS killed=' + killed + ' of ' + MUTANTS.length + (notKilled.length ? ' NOT KILLED: ' + notKilled.join('; ') : ''));
    if (notKilled.length) fails++;
  }
  process.exit(judged && !fails ? 0 : 1);
})().catch(function (e) { console.log('§BP-CRASH ' + (e && e.stack || e)); process.exit(2); });
