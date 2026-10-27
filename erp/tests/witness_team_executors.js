#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-UPS-E2-HOST, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §38.5 (FL-8 E2: the one executor reaches the DocAction list the user sees). READ THE LOG after every run.
//   Issue: with the owner-signed executor map {c_order: HQ} in force (FL-8 E3), every device refuses a station's Complete (not-executor) — but the station's
//   Process button still OFFERED it. Legacy filters the DocAction list by the role (WDocActionPanel.java:185-205 -> MRole.checkActionAccess); the team map
//   rides the same check (erp/idempiere.html _docActionAccess, erp/team_sync.js notExecutor).
//   2.5 (study §12.2): the rule is DATA now - Team projects the owner-signed map onto AD_Document_Action_Access rows (IsActive='N' for every role but the executor, on the
//   doctypes of the table); the host's DocAction list is legacy's own check over the LOGIN role's rows, with no team branch; 'author' is retired.
//   The REAL erp/idempiere.html (?team=1, window 143 Sales Order, ?record= a completed order WITH a doctype) in headless Chromium contexts on one dumb folder pipe: A = founder
//   (login GardenAdmin, role 102), B = joiner approved as role 103 and logged in as GardenUser (role 103 - a login role IS the role, as in legacy), C = joiner approved as 103 but
//   logged in as GardenAdmin (login 102 != team 103: M4). The Document Action buttons are read from the DOM.
//   §X0 precondition — B enrolled as role 103; both see the same record and the same non-empty Document Action list BEFORE any map (control: team without the rule).
//   §X1 the map    — A publishes {c_order: 102} signed by the owner key (the deployment's plan trust key): MERGED on both after a Visit.
//   §X2 offered    — after its Visit, B's Document Action group is GONE for the order (the map reached the list through the fold, no reload); A's is unchanged.
//   §X3 log        — B printed §TEAM_EXECUTORS (map + its role) and §DOCACTION_ACCESS (what was removed and why).   §X4 0 page errors.
//   §X5 rows alone — B's AD_Document_Action_Access rows of role 103 on the order's doctype are ALL 'N', A's role-102 rows untouched; TeamSync has no notExecutor; the host's _docActionAccess names no TeamSync.
//   §X7 M4         — C (login 102, team 103) is offered the list (legacy judges the login role), prints §TEAM_ROLE_MISMATCH, and its DocAction is REFUSED at fold (not-executor) on A - the order on A is unchanged.
//   §X6 vanishes   — the map replaced by {} (second owner-signed statement): B's rows are back to 'Y' and B is offered the control list again.
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

  async function device(name, login, record) {
    var ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } }), pg = await ctx.newPage(), logs = [], errs = [];
    pg.on('console', function (m) { logs.push(m.text()); }); pg.on('pageerror', function (e) { errs.push(e.message); errors++; });
    await pg.addInitScript(function () { var q = new URLSearchParams(location.search).get('xcfg'); if (q) { var c = JSON.parse(atob(q)); window.TEAM_PLAN_TRUST = c.trust; } });
    var xcfg = Buffer.from(JSON.stringify({ trust: [owner.pub] })).toString('base64');
    await pg.goto(base + '/erp/idempiere.html?login=' + (login || 'GardenAdmin') + '&window=143&record=' + (record || 108) + '&team=1&pipe=' + encodeURIComponent(PIPE) + '&xcfg=' + encodeURIComponent(xcfg), { waitUntil: 'load' });
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
  var A = await device('A', 'GardenAdmin'), B = await device('B', 'GardenUser'), space = await T.found(A); await T.join(B, space);
  for (var i = 0; i < 4; i++) { await T.approveAll(A, 103); await T.visit(B); await T.visit(A); if (await T.enrolled(B)) break; await sleep(300); }
  var rA = await T.myRole(A), rB = await T.myRole(B);
  var a0 = await T.offered(A), b0 = await T.offered(B);
  verdict('X0', rA === 102 && rB === 103, 'precondition: A holds role 102, B was approved as role 103', 'A=' + rA + ' B=' + rB);
  verdict('X0', !a0.err && !b0.err && a0.acts.length > 0 && a0.rec === b0.rec && a0.acts.join() === b0.acts.join(), 'CONTROL before any map: both see the same order and the same Document Action list', 'A ' + a0.rec + ' [' + a0.acts + '] / B ' + b0.rec + ' [' + b0.acts + ']' + (a0.err || b0.err ? ' ' + (a0.err || b0.err) : ''));

  if (!QUIET) console.log('§S2 the owner-signed executor map {c_order: 102}, published by the admin device');
  // the owner's real path (§38.10, G-8): the statement is built and signed OFFLINE by the compiler's CLI, then published from the admin's app with TeamSync.publishStatement
  var KD = fs.mkdtempSync(path.join(os.tmpdir(), 'owner-key-')), SIGNJS = process.env.WX_SIGN_PLAN || path.join(os.homedir(), 'bim-compiler', 'build', 'scriptor', 'sign_plan.js');
  fs.writeFileSync(path.join(KD, 'priv.jwk'), JSON.stringify(await subtle.exportKey('jwk', owner.priv))); fs.writeFileSync(path.join(KD, 'pub.jwk'), JSON.stringify(owner.pub)); fs.writeFileSync(path.join(KD, 'map.json'), JSON.stringify({ c_order: 102 }));
  var cl = require('child_process').spawnSync(process.execPath, [SIGNJS, 'stmt', 'executors', path.join(KD, 'map.json'), 'none', path.join(KD, 'priv.jwk'), path.join(KD, 'pub.jwk'), path.join(KD, 'exe.json')], { encoding: 'utf8' });
  var stmt = fs.existsSync(path.join(KD, 'exe.json')) ? JSON.parse(fs.readFileSync(path.join(KD, 'exe.json'), 'utf8')) : null; fs.rmSync(KD, { recursive: true, force: true });
  if (!QUIET) console.log('   §WX_CLI ' + String(cl.stdout || cl.stderr).trim());
  var pub = stmt ? await A.pg.evaluate(function (st) { return window.TeamSync.publishStatement(st); }, stmt) : { ok: false, reason: 'cli wrote nothing' };
  verdict('X1', pub.ok === true, 'the CLI-signed statement published from the admin app (TeamSync.publishStatement) answers ok on the publishing device', JSON.stringify(pub));
  var ph = pub.hash; await T.visit(A); await T.visit(B);
  var vA = await T.verdict(A, ph), vB = await T.verdict(B, ph);
  verdict('X1', /^MERGED/.test(vA) && /^MERGED/.test(vB), 'the POLICY carrying the map is MERGED on both devices', 'A=' + vA + ' B=' + vB);
  var a1 = await T.offered(A), b1 = await T.offered(B);
  verdict('X2', !b1.err && b1.rec === b0.rec && b1.acts.length === 0, 'after its Visit, the station (B) is offered NO Document Action on the order (no reload)', 'B ' + b1.rec + ' [' + (b1.acts || []) + ']' + (b1.err ? ' ' + b1.err : ''));
  verdict('X2', !a1.err && a1.acts.join() === a0.acts.join(), 'the executor (A) keeps the same list', 'A [' + (a1.acts || []) + ']');
  var exB = B.logs.filter(function (l) { return /§TEAM_EXECUTORS map=\{"c_order":102\} myRole=103/.test(l); }), daB = B.logs.filter(function (l) { return /§DOCACTION_ACCESS table=C_Order .*-> \[\]/.test(l); });
  verdict('X3', exB.length > 0 && daB.length > 0, 'B printed the map it applies and what its login role was left with', (exB[0] || 'no §TEAM_EXECUTORS') + ' | ' + (daB[0] || 'no §DOCACTION_ACCESS'));
  // §X5 the list is decided by Document Action Access ROWS alone (study §12.2 2.5): read the rows, the API, the host source
  var dtId = await B.pg.evaluate(function (rec) { var r = window.__idmpDb.exec('SELECT c_doctypetarget_id, c_doctype_id FROM c_order WHERE c_order_id=' + Number(rec)); return r.length ? (r[0].values[0][0] || r[0].values[0][1]) : null; }, b1.rec);
  var rows = function (d, role, dt) { return d.pg.evaluate(function (x) { var o = { Y: 0, N: 0 }; var r = window.__idmpDb.exec("SELECT isactive, count(*) FROM ad_document_action_access WHERE ad_role_id=" + x.role + " AND c_doctype_id=" + x.dt + " GROUP BY 1"); (r.length ? r[0].values : []).forEach(function (v) { o[v[0]] = v[1]; }); return o; }, { role: role, dt: dt }); };
  var rB = await rows(B, 103, dtId), rA = await rows(A, 102, dtId), rA3 = await rows(A, 103, dtId);
  verdict('X5', dtId > 0 && rB.N > 0 && rB.Y === 0 && rA.Y > 0 && rA.N === 0, "the map is DATA: on B every AD_Document_Action_Access row of role 103 on the order's doctype is IsActive='N'; the executor's (102) rows are untouched", 'doctype=' + dtId + ' B role103 ' + JSON.stringify(rB) + ' | B-side role102 ' + JSON.stringify(await rows(B, 102, dtId)) + ' | A role102 ' + JSON.stringify(rA) + ' A role103 ' + JSON.stringify(rA3));
  var apiB = await B.pg.evaluate(function () { return typeof window.TeamSync.notExecutor; });
  var hostSrc = await B.pg.evaluate(async function () { return await (await fetch('idempiere.html', { cache: 'no-cache' })).text(); });
  var blk = hostSrc.slice(hostSrc.indexOf('function _docActionAccess('), hostSrc.indexOf('function _fsmCtx('));
  verdict('X5', apiB === 'undefined' && blk.length > 200 && !/TeamSync|notExecutor|team/i.test(blk.replace(/§DOCACTION_ACCESS[^\n]*/g, '')), "the host's _docActionAccess names no team and TeamSync has no notExecutor: the DocAction list is legacy's check over the login role, nothing else", 'TeamSync.notExecutor=' + apiB + ' block=' + blk.length + ' bytes' + (/TeamSync|notExecutor|team/i.test(blk) ? ' TEAM TEXT: ' + (blk.match(/.{30}(TeamSync|notExecutor|team).{30}/i) || [''])[0] : ''));
  verdict('X4', errors === 0, '0 page errors on both devices', 'errors=' + errors + (errors ? ' ' + A.errs.concat(B.errs).slice(0, 2).join(' | ') : ''));

  // §X7 M4: login role != team role. C logs in as GardenAdmin (102) and is approved as 103.
  if (!QUIET) console.log('§S3 M4: a device logged in as role 102 but approved as team role 103 (C)');
  var C = await device('C', 'GardenAdmin', 100), spaceC = space; await T.join(C, spaceC);
  for (var j = 0; j < 4; j++) { await T.approveAll(A, 103); await T.visit(C); await T.visit(A); if (await T.enrolled(C)) break; await sleep(300); }
  await T.visit(C); await T.visit(A); await T.visit(B);
  var rC = await T.myRole(C), c1 = await T.offered(C);
  verdict('X7', rC === 103 && !c1.err && c1.acts.length > 0 && c1.acts.indexOf('CL') >= 0, 'C (login 102, team role 103; its own order 100, so the later removal in X6 cannot touch the order B and A watch) is offered the list its LOGIN role is entitled to (legacy judges the login role); the hidden button is gone', 'team=' + rC + ' C [' + (c1.acts || []) + '] rec ' + c1.rec + (c1.err ? ' ' + c1.err : ''));
  var mmC = C.logs.filter(function (l) { return /§TEAM_ROLE_MISMATCH login=102 team=103/.test(l); });
  verdict('X7', mmC.length > 0, 'C printed the mismatch (evidence: login role vs team role)', mmC[0] || 'no §TEAM_ROLE_MISMATCH');
  var nExe = function (d) { return d.pg.evaluate(async function () { var L = await window.TeamSync.store().order(); return Object.keys(L.verdict).filter(function (h) { var v = L.verdict[h]; return v.reason === 'not-executor'; }).length; }); };
  var stat = function (d, rec) { return d.pg.evaluate(function (rec) { return window.__idmpDb.exec('SELECT docstatus FROM c_order WHERE c_order_id=' + Number(rec))[0].values[0][0]; }, rec); };
  var n0 = await nExe(A), st0 = await stat(A, c1.rec), pick = 'CL';
  var did = await C.pg.evaluate(async function (act) { var btn = document.querySelector('#idmp-toolbar [data-tb="process"]'); if (!btn) return 'no Process button'; btn.click();
    for (var i = 0; i < 50 && !document.getElementById('idmp-proc-ov'); i++) await new Promise(function (r) { setTimeout(r, 100); });
    var b = document.querySelector('#idmp-proc-ov [data-docact="' + act + '"]'); if (!b) return 'no button ' + act; b.click(); return 'clicked ' + act; }, pick);
  await sleep(1500); await T.visit(C); await T.visit(A); await T.visit(B); await T.visit(C);
  var n1 = await nExe(A), st1 = await stat(A, c1.rec), stC = await stat(C, c1.rec);
  verdict('X7', /^clicked/.test(did) && n1 > n0 && st1 === st0, "C's DocAction (" + pick + ') is REFUSED at fold on A (E3 stays: not-executor), and the order on A is unchanged', did + ' | not-executor verdicts ' + n0 + ' -> ' + n1 + ' | A status ' + st0 + ' -> ' + st1 + ' | C status after its Visit ' + stC);

  // §X6 the map is replaced by {}: the rows go back (the rule vanishes with the policy, nothing was written to the op log)
  if (!QUIET) console.log('§S4 the owner replaces the map by {} (second signed statement)');
  var KD2 = fs.mkdtempSync(path.join(os.tmpdir(), 'owner-key2-'));
  fs.writeFileSync(path.join(KD2, 'priv.jwk'), JSON.stringify(await subtle.exportKey('jwk', owner.priv))); fs.writeFileSync(path.join(KD2, 'pub.jwk'), JSON.stringify(owner.pub)); fs.writeFileSync(path.join(KD2, 'map.json'), JSON.stringify({})); fs.writeFileSync(path.join(KD2, 'prev.json'), JSON.stringify({ c_order: 102 }));
  require('child_process').spawnSync(process.execPath, [SIGNJS, 'stmt', 'executors', path.join(KD2, 'map.json'), path.join(KD2, 'prev.json'), path.join(KD2, 'priv.jwk'), path.join(KD2, 'pub.jwk'), path.join(KD2, 'exe.json')], { encoding: 'utf8' });
  var stmt2 = fs.existsSync(path.join(KD2, 'exe.json')) ? JSON.parse(fs.readFileSync(path.join(KD2, 'exe.json'), 'utf8')) : null; fs.rmSync(KD2, { recursive: true, force: true });
  var pub2 = stmt2 ? await A.pg.evaluate(function (st) { return window.TeamSync.publishStatement(st); }, stmt2) : { ok: false, reason: 'cli wrote nothing' };
  await T.visit(A); await T.visit(B);
  var rB2 = await rows(B, 103, dtId), b2 = await T.offered(B), vB2 = pub2.hash ? await T.verdict(B, pub2.hash) : 'none';
  verdict('X6', pub2.ok === true && /^MERGED/.test(vB2), 'the second statement (map {}) is published and MERGED on B', JSON.stringify(pub2) + ' B=' + vB2);
  verdict('X6', rB.N > 0 && rB2.Y > 0 && rB2.N === 0 && !b2.err && b2.acts.join() === a0.acts.join(), "the rule vanished with the policy: B's role-103 rows are back to 'Y' and B is offered the control list again", 'B role103 before ' + JSON.stringify(rB) + ' after ' + JSON.stringify(rB2) + ' B [' + (b2.acts || []) + '] control [' + a0.acts + ']');
  // §X8 rows alone (no Team in the loop): a Document Action Access row set 'N' by anyone + the MRole cache reset (ad:access-changed) changes B's list; set back, it returns
  var flip = function (d, v) { return d.pg.evaluate(function (x) { window.__idmpDb.run("UPDATE ad_document_action_access SET isactive=? WHERE ad_role_id=103 AND c_doctype_id=" + x.dt, [x.v]); window.dispatchEvent(new CustomEvent('ad:access-changed', { detail: { table: 'ad_document_action_access' } })); }, { dt: dtId, v: v }); };
  await flip(B, 'N'); var b8n = await T.offered(B); await flip(B, 'Y'); var b8y = await T.offered(B);
  verdict('X8', !b8n.err && b8n.acts.length === 0 && !b8y.err && b8y.acts.join() === a0.acts.join(), "the list follows the ROWS and the cache reset alone: role 103's rows set 'N' by hand -> B offered none; set 'Y' -> the control list (no map, no Team rule)", 'N [' + (b8n.acts || []) + '] Y [' + (b8y.acts || []) + ']');
  // evidence, not judged: the engine judges E3 against the map in force at the END of the fold (roster.executors), so retiring a map also re-admits what it had refused
  var late = await A.pg.evaluate(async function (rec) { var S = window.TeamSync.store(), L = await S.order(); return (await S.placedEnvelopes()).filter(function (p) { return p.env.body.op_type === 'SET_STATUS'; }).map(function (p) { return L.verdict[p.hash].verdict + ':' + (L.verdict[p.hash].reason || ''); }); }, c1.rec);
  console.log('§WX_NOTE after the map {} the SET_STATUS C was refused on now folds as ' + JSON.stringify(late) + ' (engine property: E3 reads the final map; recorded for the lead, not changed here)');
  verdict('X4', errors === 0, '0 page errors on all devices (after the mismatch and the removal)', 'errors=' + errors + (errors ? ' ' + A.errs.concat(B.errs, C.errs).slice(0, 2).join(' | ') : ''));

  var red = Object.keys(ARMS).filter(function (k) { return ARMS[k]; });
  console.log('§WX_ARMS red=' + (red.length ? red.join(',') : 'none') + ' judged=' + judged);
  await browser.close(); server.close();
  if (QUIET) process.exit(red.length ? 1 : 0);
  if (red.length) { console.log('§WX_VERDICT FAIL judged=' + judged + ' fails=' + fails + ' mutants=NOT RUN (the base run is red: a mutant cannot be judged against it) pageerrors=' + errors); process.exit(1); }
  if (process.env.WX_NO_MUT) { console.log('§WX_VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fails=' + fails + ' mutants=skipped pageerrors=' + errors); process.exit(fails ? 1 : 0); }

  var M = [
    ['the map is not refreshed after a fold (render skips it)', 'try { await refreshExecutors(); } catch (eX)', 'try { } catch (eX)', ['X2']],
    ['the rows are never set to N', "db.run(\"UPDATE ad_document_action_access SET isactive='N' WHERE", "db.run(\"UPDATE ad_document_action_access SET isactive='Y' WHERE", ['X2', 'X5']],
    ['the executor role is flipped too', 'WHERE ad_role_id<>? AND c_doctype_id', 'WHERE ad_role_id<>(?*0-1) AND c_doctype_id', ['X2', 'X5']],
    ['the rows are never restored when the map goes', "'UPDATE ad_document_action_access SET isactive=? WHERE", "'UPDATE ad_document_action_access SET isactive=CASE WHEN ?<>\\'\\' THEN isactive ELSE isactive END WHERE", ['X6']]];
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
