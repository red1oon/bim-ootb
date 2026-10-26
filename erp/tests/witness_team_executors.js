#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-UPS-E2-HOST, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §38.5 (FL-8 E2: the one executor reaches the DocAction list the user sees). READ THE LOG after every run.
//   Issue: with the owner-signed executor map {c_order: HQ} in force (FL-8 E3), every device refuses a station's Complete (not-executor) — but the station's
//   Process button still OFFERED it. Legacy filters the DocAction list by the role (WDocActionPanel.java:185-205 -> MRole.checkActionAccess); the team map
//   rides the same check (erp/idempiere.html _docActionAccess, erp/team_sync.js notExecutor).
//   The REAL erp/idempiere.html (?team=1, GardenAdmin, window 143 Sales Order) in TWO headless Chromium contexts on one dumb folder pipe: A = founder (role 102),
//   B = joiner approved as role 103 (the station). Both open the same seed order and press the Process button; the Document Action buttons are read from the DOM.
//   §X0 precondition — B enrolled as role 103; both see the same record and the same non-empty Document Action list BEFORE any map (control: team without the rule).
//   §X1 the map    — A publishes {c_order: 102} signed by the owner key (the deployment's plan trust key): MERGED on both after a Visit.
//   §X2 offered    — after its Visit, B's Document Action group is GONE for the order (the map reached the list through the fold, no reload); A's is unchanged.
//   §X3 log        — B printed §TEAM_EXECUTORS (map + its role) and §DOCACTION_ACCESS (what was removed and why).   §X4 0 page errors.
//   §MUTANTS       — the adapter served with one rule broken; each must turn >= 1 arm red (a crashed child is NOT a kill).
// Run: node erp/tests/witness_team_executors.js 2>&1 | tee /tmp/witness_team_executors.log
'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), vm = require('vm'), nodeCrypto = require('crypto');
var ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var subtle = nodeCrypto.webcrypto.subtle, fails = 0, judged = 0, errors = 0, ARMS = {}, QUIET = !!process.env.WX_ONLY_ARMS;
function verdict(arm, ok, label, detail) { judged++; ARMS[arm] = ARMS[arm] || 0; if (!ok) { fails++; ARMS[arm]++; } if (!QUIET) console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + arm + ' ' + label + (detail ? ' — ' + detail : '')); return ok; }
function walk(d, rel, out) { if (!fs.existsSync(d)) return out; fs.readdirSync(d).forEach(function (n) { var p = path.join(d, n), r = rel ? rel + '/' + n : n; if (fs.statSync(p).isDirectory()) walk(p, r, out); else out.push(r); }); return out; }
function canon(o) { if (o === null || typeof o !== 'object') return JSON.stringify(o); if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']'; return '{' + Object.keys(o).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(o[k]); }).join(',') + '}'; }
function hex(buf) { return Buffer.from(buf).toString('hex'); }
async function mkKey() { var kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']), j = await subtle.exportKey('jwk', kp.publicKey); return { priv: kp.privateKey, pub: { kty: j.kty, crv: j.crv, x: j.x, y: j.y } }; }
async function signObj(obj, key) { var b = JSON.parse(JSON.stringify(obj)); delete b.sig; delete b.signer; var s = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.priv, new TextEncoder().encode(canon(b))); var o = JSON.parse(JSON.stringify(b)); o.signer = key.pub; o.sig = hex(s); return o; }
var sha = function (s) { return nodeCrypto.createHash('sha256').update(s).digest('hex'); };

var PLAN_SRC = fs.readFileSync(path.join(ROOT, 'erp', 'team_plan.js'), 'utf8');
var PLAN = (function () { var g = {}; vm.runInNewContext(PLAN_SRC, { window: g, globalThis: g }); return g.TEAM_PLAN; })();
var planJs = function (o) { return '(function (g) { g.TEAM_PLAN = ' + JSON.stringify(o) + '; })(typeof window !== \'undefined\' ? window : globalThis);\n'; };
var ADAPTER = fs.readFileSync(path.join(ROOT, 'erp', 'team_sync.js'), 'utf8');

(async function () {
  if (!QUIET) console.log('═══ W-UPS-E2-HOST — the executor map reaches the Document Action list (TEAMWORK_FRAMEWORK §38.5) ═══\n');
  var FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'team-exe-')), cur = { plan: null, adapter: null };
  if (process.env.WX_MUT_FILE) cur.adapter = fs.readFileSync(process.env.WX_MUT_FILE, 'utf8');   // child run of a mutant: serve the broken adapter
  var server = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
    if (p === '/pipe/list') { var pre = u.searchParams.get('prefix') || ''; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(walk(FOLDER, '', []).filter(function (n) { return n.indexOf(pre) === 0; }))); return; }
    if (p.indexOf('/pipe/f/') === 0) { var fp = path.join(FOLDER, p.slice(8)); if (fp.indexOf(FOLDER) !== 0) { res.writeHead(400); res.end(); return; }
      if (req.method === 'PUT') { var ch = []; req.on('data', function (c) { ch.push(c); }); req.on('end', function () { fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, Buffer.concat(ch)); res.writeHead(200); res.end('ok'); }); return; }
      if (!fs.existsSync(fp)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); return; }
    if (p === '/erp/team_plan.js' && cur.plan) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(cur.plan); return; }
    if (p === '/erp/team_sync.js' && cur.adapter) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(cur.adapter); return; }
    var f = path.join(ROOT, p === '/' ? '/erp/idempiere.html' : p);
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port, PIPE = base + '/pipe';
  var browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] });
  var owner = await mkKey();
  cur.plan = planJs(await signObj(PLAN, owner));            // the plan trust key is also the key that signs the executor map (§38.3: the same two-key scheme as §35)

  async function device(name) {
    var ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } }), pg = await ctx.newPage(), logs = [], errs = [];
    pg.on('console', function (m) { logs.push(m.text()); }); pg.on('pageerror', function (e) { errs.push(e.message); errors++; });
    await pg.addInitScript(function () { var q = new URLSearchParams(location.search).get('xcfg'); if (q) { var c = JSON.parse(atob(q)); window.TEAM_PLAN_TRUST = c.trust; } });
    var xcfg = Buffer.from(JSON.stringify({ trust: [owner.pub] })).toString('base64');
    await pg.goto(base + '/erp/idempiere.html?login=GardenAdmin&window=143&team=1&pipe=' + encodeURIComponent(PIPE) + '&xcfg=' + encodeURIComponent(xcfg), { waitUntil: 'load' });
    await pg.waitForFunction(function () { return window.TeamSync && window.__idmpDb && window.__crud && window.__idmpDb.exec('SELECT count(*) FROM ad_table')[0].values[0][0] > 0; }, null, { timeout: 180000 });
    await pg.evaluate(function () { return window.TeamSync.ready; });
    return { name: name, pg: pg, logs: logs, errs: errs, ctx: ctx };
  }
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var T = {
    found: function (d) { return d.pg.evaluate(function () { return window.TeamSync.found(); }); },
    join: function (d, space) { return d.pg.evaluate(function (sp) { return window.TeamSync.join(sp); }, space); },
    approveAll: function (d, role) { return d.pg.evaluate(async function (role) { var r = await window.TeamSync.requests(); for (var x of r) await window.TeamSync.approve(x.rq, role); return r.length; }, role); },
    visit: function (d) { return d.pg.evaluate(async function () { await window.TeamSync.visit(); }); },
    enrolled: function (d) { return d.pg.evaluate(async function () { return (await window.TeamSync.pairState()).enrolled; }); },
    myRole: function (d) { return d.pg.evaluate(async function () { var L = await window.TeamSync.store().order(), st = await window.TeamSync.pairState(); return L.roster.roleAt(st.device, Infinity).ad_role_id; }); },
    policy: function (d, params) { return d.pg.evaluate(async function (p) { var r = await window.TeamSync.store().setPolicy(p); return r && r.hash; }, params); },
    verdict: function (d, h) { return d.pg.evaluate(async function (h) { var v = (await window.TeamSync.store().order()).verdict[h]; return v ? v.verdict + (v.reason ? ':' + v.reason : '') : 'none'; }, h); },
    // what the user sees: press the Process button, read the Document Action group of the chooser, close it
    offered: async function (d) {
      var btn = await d.pg.$('#idmp-toolbar [data-tb="process"]'); if (!btn) return { err: 'no Process button' };
      await btn.click(); await d.pg.waitForSelector('#idmp-proc-ov', { timeout: 10000 }).catch(function () {});
      var o = await d.pg.evaluate(function () { var ov = document.getElementById('idmp-proc-ov'); if (!ov) return { err: 'chooser did not open' };
        var acts = Array.prototype.map.call(ov.querySelectorAll('[data-docact]'), function (b) { return b.getAttribute('data-docact'); }); ov.remove(); return { acts: acts }; });
      var rec = (d.logs.filter(function (l) { return /§FORM-PILL process-chooser record=/.test(l); }).slice(-1)[0] || '').replace(/^.*record=(\S+).*$/, '$1');
      o.rec = rec; return o;
    }
  };

  if (!QUIET) console.log('§S1 two devices: A founds (role 102), B joins as role 103 (the station)');
  var A = await device('A'), B = await device('B'), space = await T.found(A); await T.join(B, space);
  for (var i = 0; i < 4; i++) { await T.approveAll(A, 103); await T.visit(B); await T.visit(A); if (await T.enrolled(B)) break; await sleep(300); }
  var rA = await T.myRole(A), rB = await T.myRole(B);
  var a0 = await T.offered(A), b0 = await T.offered(B);
  verdict('X0', rA === 102 && rB === 103, 'precondition: A holds role 102, B was approved as role 103', 'A=' + rA + ' B=' + rB);
  verdict('X0', !a0.err && !b0.err && a0.acts.length > 0 && a0.rec === b0.rec && a0.acts.join() === b0.acts.join(), 'CONTROL before any map: both see the same order and the same Document Action list', 'A ' + a0.rec + ' [' + a0.acts + '] / B ' + b0.rec + ' [' + b0.acts + ']' + (a0.err || b0.err ? ' ' + (a0.err || b0.err) : ''));

  if (!QUIET) console.log('§S2 the owner-signed executor map {c_order: 102}, published by the admin device');
  var stmt = await signObj({ kind: 'executors', map: { c_order: 102 }, prev: sha(canon({})) }, owner);
  var ph = await T.policy(A, { epoch: 1, executors: stmt }); await T.visit(A); await T.visit(B);
  var vA = await T.verdict(A, ph), vB = await T.verdict(B, ph);
  verdict('X1', /^MERGED/.test(vA) && /^MERGED/.test(vB), 'the POLICY carrying the map is MERGED on both devices', 'A=' + vA + ' B=' + vB);
  var a1 = await T.offered(A), b1 = await T.offered(B);
  verdict('X2', !b1.err && b1.rec === b0.rec && b1.acts.length === 0, 'after its Visit, the station (B) is offered NO Document Action on the order (no reload)', 'B ' + b1.rec + ' [' + (b1.acts || []) + ']' + (b1.err ? ' ' + b1.err : ''));
  verdict('X2', !a1.err && a1.acts.join() === a0.acts.join(), 'the executor (A) keeps the same list', 'A [' + (a1.acts || []) + ']');
  var diag = await B.pg.evaluate(function (rec) { var o = {}; try { o.fn = typeof (window.AdAccess && window.AdAccess.RoleContext.prototype.checkActionAccess); o.app = { role: window.APP && window.APP.roleId, client: window.APP && window.APP.clientId };
    var rc = window.IdmpSession && window.IdmpSession.roleContextFor(window.__idmpDb, Number(window.APP.roleId)); o.rc = !!rc; o.docActRoles = rc && rc.docActRoles ? rc.docActRoles.map(function (R) { return R.roleId + ':' + R.rows.length; }) : null;
    o.notExe = window.TeamSync.notExecutor('C_Order', Number(rec)); var r = window.__idmpDb.exec('SELECT c_doctype_id, c_doctypetarget_id FROM c_order WHERE c_order_id=' + Number(rec)); o.dt = r.length ? r[0].values[0] : null; } catch (e) { o.err = e.message; } return o; }, b1.rec);
  console.log('§WX_DIAG B ' + JSON.stringify(diag));
  var exB = B.logs.filter(function (l) { return /§TEAM_EXECUTORS map=\{"c_order":102\} myRole=103/.test(l); }), daB = B.logs.filter(function (l) { return /§DOCACTION_ACCESS table=C_Order .*-> \[\] \(team: not the executor\)/.test(l); });
  verdict('X3', exB.length > 0 && daB.length > 0, 'B printed the map it applies and what it removed', (exB[0] || 'no §TEAM_EXECUTORS') + ' | ' + (daB[0] || 'no §DOCACTION_ACCESS'));
  verdict('X4', errors === 0, '0 page errors on both devices', 'errors=' + errors + (errors ? ' ' + A.errs.concat(B.errs).slice(0, 2).join(' | ') : ''));

  var red = Object.keys(ARMS).filter(function (k) { return ARMS[k]; });
  console.log('§WX_ARMS red=' + (red.length ? red.join(',') : 'none') + ' judged=' + judged);
  await browser.close(); server.close();
  if (QUIET) process.exit(red.length ? 1 : 0);
  if (red.length) { console.log('§WX_VERDICT FAIL judged=' + judged + ' fails=' + fails + ' mutants=NOT RUN (the base run is red: a mutant cannot be judged against it) pageerrors=' + errors); process.exit(1); }
  if (process.env.WX_NO_MUT) { console.log('§WX_VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fails=' + fails + ' mutants=skipped pageerrors=' + errors); process.exit(fails ? 1 : 0); }

  var M = [
    ['the map is not refreshed after a fold (render skips it)', 'try { await refreshExecutors(); } catch (eX)', 'try { } catch (eX)', ['X2']],
    ['the overlay never removes anything', 'if (!exe.map) return false;', 'return false;', ['X2']],
    ['every device is treated as a non-executor', "if (ex !== 'author') return exe.role !== ex;", "if (ex !== 'author') return true;", ['X2']]];
  var cp = require('child_process'), muts = [];
  for (var m of M) {
    if (ADAPTER.split(m[1]).length !== 2) { muts.push({ name: m[0], error: 'MUTATION DID NOT APPLY (anchor not found exactly once)' }); continue; }
    var tmp = path.join(os.tmpdir(), 'wx_mut_' + process.pid + '_' + muts.length + '.js'); fs.writeFileSync(tmp, ADAPTER.replace(m[1], m[2]));
    var k = cp.spawnSync(process.execPath, [__filename], { encoding: 'utf8', timeout: 1200000, env: Object.assign({}, process.env, { WX_ONLY_ARMS: '1', WX_MUT_FILE: tmp }) });
    fs.unlinkSync(tmp); var mm = /§WX_ARMS red=(\S+)/.exec(k.stdout || '');
    muts.push(mm ? { name: m[0], expect: m[3], red: mm[1] !== 'none' ? mm[1].split(',') : [] } : { name: m[0], error: 'CRASHED (not a kill) ' + String(k.stderr || k.stdout).split('\n').slice(-3).join(' ') });
  }
  console.log('\n§WX_MUTANTS');
  muts.forEach(function (m) { var ok = !m.error && m.expect.some(function (e) { return m.red.indexOf(e) !== -1; }); if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + m.name + ' -> ' + (m.error || 'red arms: ' + (m.red.join(', ') || 'NONE (survivor)') + ' (expected ' + m.expect.join('/') + ')')); });
  console.log('§WX_VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fails=' + fails + ' mutants_killed=' + muts.filter(function (m) { return !m.error && m.expect.some(function (e) { return m.red.indexOf(e) !== -1; }); }).length + '/' + muts.length + ' pageerrors=' + errors);
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.log('§WX_CRASH ' + (e && e.stack || e)); process.exit(2); });
