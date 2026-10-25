#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-VERSIONS-MODELLER, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §16.32 (event versioning in the MODELLER host). READ THE LOG after every run — the exit code is not evidence.
//   The REAL modeller/modeller.html (?team=1) in headless Chromium, a dumb folder pipe, the Modeller founds a team through its own found() and authors through its own command API
//   (Bonsai.oplog.commit, the call the gizmo makes) and through the store's author() for ops that an OLDER or NEWER peer would have sent. Every number is read from the live page.
//   §M1 default      — no configuration: shape 1, nothing judged differently, authored ops carry no `sv` (byte-identical to before).
//   §M2 park         — an op stamped sv:2 on a shape-1 Modeller is PARKED needs-upgrade, is not folded, and the model is NOT changed by it.   Control: the same op without sv merges.
//   §M3 upcast       — shape 2 + one admin-signed set: an op from an older peer (no sv) is folded in the v2 shape, becomes an element in the model, the stored envelope is untouched; ops authored now carry sv:2.
//   §M4 bad sets     — unsigned / untrusted signer / edited after signing: refused with the reason, and the older peer's op is PARKED needs-mapping (not projected).
//   §M5 empty trust  — an EMPTY trust list accepts NO set (a set rewrites the meaning of stored data); the shape-1 behaviour and the unsigned plan still work.   §M6 0 page errors.
//   §MUTANTS         — the adapter / glue served with one rule broken; each must turn >= 1 arm red.
// Run: node modeller/tests/witness_team_versions.js 2>&1 | tee /tmp/witness_team_versions.log
'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), vm = require('vm'), nodeCrypto = require('crypto');
var ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var subtle = nodeCrypto.webcrypto.subtle, fails = 0, judged = 0, errors = 0, ARMS = {}, QUIET = !!process.env.VM_ONLY_ARMS;
function verdict(arm, ok, label, detail) { judged++; ARMS[arm] = ARMS[arm] || 0; if (!ok) { fails++; ARMS[arm]++; } if (!QUIET) console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + arm + ' ' + label + (detail ? ' — ' + detail : '')); return ok; }
function walk(d, rel, out) { if (!fs.existsSync(d)) return out; fs.readdirSync(d).forEach(function (n) { var p = path.join(d, n), r = rel ? rel + '/' + n : n; if (fs.statSync(p).isDirectory()) walk(p, r, out); else out.push(r); }); return out; }
function canon(o) { if (o === null || typeof o !== 'object') return JSON.stringify(o); if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']'; return '{' + Object.keys(o).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(o[k]); }).join(',') + '}'; }
function hex(buf) { return Buffer.from(buf).toString('hex'); }
async function mkKey() { var kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']), j = await subtle.exportKey('jwk', kp.publicKey); return { priv: kp.privateKey, pub: { kty: j.kty, crv: j.crv, x: j.x, y: j.y } }; }
async function signObj(obj, key) { var b = JSON.parse(JSON.stringify(obj)); delete b.sig; delete b.signer; var s = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.priv, new TextEncoder().encode(canon(b))); var o = JSON.parse(JSON.stringify(b)); o.signer = key.pub; o.sig = hex(s); return o; }

var PLAN_SRC = fs.readFileSync(path.join(ROOT, 'modeller', 'team_plan.js'), 'utf8');
var PLAN = (function () { var g = {}; vm.runInNewContext(PLAN_SRC, { window: g, globalThis: g }); return g.TEAM_PLAN; })();
var planJs = function (o) { return '(function (g) { g.TEAM_PLAN = ' + JSON.stringify(o) + '; })(typeof window !== \'undefined\' ? window : globalThis);\n'; };
var ADAPTER = fs.readFileSync(path.join(ROOT, 'modeller', 'team_sync.js'), 'utf8'), GLUE = fs.readFileSync(path.join(ROOT, 'common', 'comm', 'team_versions.js'), 'utf8');
var SET12 = { kind: 'upcasters', op: 'CRUD_CREATE', steps: [{ from: 1, map: [{ at: 'fields', rename: ['grandtotal', 'total'] }] }] };

(async function () {
  if (!QUIET) console.log('═══ W-VERSIONS-MODELLER — the Modeller host passes opts.versions (TEAMWORK_FRAMEWORK §16.32) ═══\n');
  var FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'versions-modeller-')), cur = { plan: null, adapter: null, glue: null };
  if (process.env.VM_MUT_FILE) cur[process.env.VM_MUT_KIND] = fs.readFileSync(process.env.VM_MUT_FILE, 'utf8');   // child run of a mutant: serve the broken file
  var server = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
    if (p === '/pipe/list') { var pre = u.searchParams.get('prefix') || ''; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(walk(FOLDER, '', []).filter(function (n) { return n.indexOf(pre) === 0; }))); return; }
    if (p.indexOf('/pipe/f/') === 0) { var fp = path.join(FOLDER, p.slice(8)); if (fp.indexOf(FOLDER) !== 0) { res.writeHead(400); res.end(); return; }
      if (req.method === 'PUT') { var ch = []; req.on('data', function (c) { ch.push(c); }); req.on('end', function () { fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, Buffer.concat(ch)); res.writeHead(200); res.end('ok'); }); return; }
      if (!fs.existsSync(fp)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); return; }
    if (p === '/modeller/team_plan.js' && cur.plan) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(cur.plan); return; }
    if (p === '/modeller/team_sync.js' && cur.adapter) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(cur.adapter); return; }
    if (p === '/common/comm/team_versions.js' && cur.glue) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(cur.glue); return; }
    var f = path.join(ROOT, p === '/' ? '/modeller/modeller.html' : p);
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port, PIPE = base + '/pipe';
  var browser = await reqPw().chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu'] });
  var admin = await mkKey(), other = await mkKey();
  var signedPlan = planJs(await signObj(PLAN, admin));

  // one scenario = one fresh Chromium context: found a team, then do things. cfg = { shape, sets, trust, signedPlan }
  async function scenario(cfg, fn) {
    cur.plan = cfg.signedPlan ? signedPlan : null;
    var ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } }), pg = await ctx.newPage(), logs = [], errs = [];
    pg.on('console', function (m) { logs.push(m.text()); }); pg.on('pageerror', function (e) { errs.push(e.message); errors++; });
    await pg.addInitScript(function () { var q = new URLSearchParams(location.search).get('vcfg'); if (q) { var c = JSON.parse(atob(q)); if (c.shape) window.TEAM_SHAPE_V = c.shape; if (c.sets) window.TEAM_UPCASTERS = c.sets; if (c.trust) window.TEAM_PLAN_TRUST = c.trust; } });
    var vcfg = Buffer.from(JSON.stringify({ shape: cfg.shape || null, sets: cfg.sets || null, trust: cfg.trust || null })).toString('base64');
    await pg.goto(base + '/modeller/modeller.html?team=1&pipe=' + encodeURIComponent(PIPE) + (cfg.noCfg ? '' : '&vcfg=' + encodeURIComponent(vcfg)), { waitUntil: 'load' });
    await pg.waitForFunction(function () { return window.TeamSyncModeller && window.Bonsai && window.Bonsai.oplog && window.KernelOps && window.Bonsai.group; }, null, { timeout: 90000 });
    await pg.evaluate(function () { return window.TeamSyncModeller.ready; });
    await pg.evaluate(function () { return window.TeamSyncModeller.found(); });
    var out = await fn(pg, logs); await ctx.close(); return Object.assign({ logs: logs, errs: errs }, out);
  }
  // helpers that run in the page
  var P = {
    realOp: function (pg) { return pg.evaluate(async function () { var O = window.Bonsai.oplog; await O.commit({ op_type: 'GEOM_EXTRUDE', parameters: { profile: { w: 1, h: 1 }, dir: [0, 0, 2] } }); await window.TeamSyncModeller.settle();
      var S = window.TeamSyncModeller.store(), L = await S.order(), ps = await S.placedEnvelopes(), e = ps.filter(function (p) { return p.env.body.op_type === 'CRUD_CREATE'; })[0]; return e ? { hash: e.hash, body: e.env.body, verdict: L.verdict[e.hash] } : null; }); },
    // an op as an OLDER peer (no sv) or a NEWER peer (sv:2) would have authored it: same fields as the real element, plus a v1-only field
    peerOp: function (pg, sv, tpl) { return pg.evaluate(async function (a) { var S = window.TeamSyncModeller.store(), f = JSON.parse(JSON.stringify(a.tpl)); delete f.output_guid; f.grandtotal = 10;
      var body = { op_type: 'CRUD_CREATE', params: { fields: f } }; if (a.sv) body.sv = a.sv; var r = await S.author({ target: { table: 'bim_element', uu: crypto.randomUUID() }, intent: 'K6', body: body });
      var L = await S.order(), fold = (await S.foldable()).filter(function (p) { return p.hash === r.hash; })[0], st = await S.db.exec('SELECT envelope FROM cl_op WHERE op_hash=?', [r.hash]);
      return { hash: r.hash, verdict: L.verdict[r.hash], folded: fold ? fold.env.body : null, stored: st[0].values[0][0] }; }, { sv: sv, tpl: tpl }); },
    rows: function (pg) { return pg.evaluate(function () { var r = window.Bonsai.oplog.db.exec("SELECT count(*) FROM kernel_ops WHERE op_type LIKE 'GEOM%'"); return r[0].values[0][0]; }); },
    visit: function (pg) { return pg.evaluate(async function () { await window.TeamSyncModeller.visit(); await window.TeamSyncModeller.settle(); }); },
    state: function (pg) { return pg.evaluate(function () { return window.TeamSyncModeller.versionState(); }); },
    storedBody: function (pg, hash) { return pg.evaluate(function (h) { var S = window.TeamSyncModeller.store(), r = S.db.exec('SELECT envelope FROM cl_op WHERE op_hash=?', [h]); return JSON.parse(r[0].values[0][0]).body; }, hash); },
    foldHas: function (pg, hash) { return pg.evaluate(async function (h) { return (await window.TeamSyncModeller.store().foldable()).some(function (p) { return p.hash === h; }); }, hash); }
  };
  var line = function (logs, re) { return logs.filter(function (l) { return re.test(l); }); };

  // ───────────── M1 default ─────────────
  if (!QUIET) console.log('§M1 default configuration');
  var m1 = await scenario({ noCfg: true }, async function (pg, logs) {
    var real = await P.realOp(pg), st = await P.state(pg), cl = await pg.evaluate(function () { return window.TeamSyncModeller.classes(); });
    return { real: real, st: st, cl: cl, tv: await pg.evaluate(function () { return window.TeamVersions && { appV: window.TeamVersions.appV('CRUD_CREATE'), loaded: window.TeamVersions.loaded() }; }) };
  });
  verdict('M1', !!m1.tv && m1.tv.appV === 1 && m1.tv.loaded === 0 && line(m1.logs, /§TEAM_VERSIONS appV=CRUD_CREATE:1,CRUD_UPDATE:1 sets=0\/0/).length === 1, 'no configuration: shape 1 for both op types, 0 sets, one §TEAM_VERSIONS line', JSON.stringify(m1.tv));
  verdict('M1', !!m1.real && !('sv' in m1.real.body) && m1.real.verdict && m1.real.verdict.verdict === 'MERGED', 'an op authored through the real command API carries NO `sv` (byte-identical to before) and is MERGED', m1.real ? JSON.stringify(Object.keys(m1.real.body)) + ' ' + m1.real.verdict.verdict : 'no CRUD_CREATE authored');
  verdict('M1', !!m1.st && m1.st.provisional === false && m1.st.parked_count === 0 && Object.keys(m1.cl).length === 7, 'versionState: nothing parked, not provisional; the plan still shares its 7 op classes', JSON.stringify(m1.st) + ' classes=' + Object.keys(m1.cl).length);

  // ───────────── M2 an op stamped sv:2 on a shape-1 Modeller ─────────────
  if (!QUIET) console.log('§M2 a newer peer\'s op parks');
  var m2 = await scenario({ noCfg: true }, async function (pg) {
    var real = await P.realOp(pg), tpl = real.body.params.fields, before = await P.rows(pg);
    var newer = await P.peerOp(pg, 2, tpl), same = await P.peerOp(pg, 0, tpl);
    await P.visit(pg); var after = await P.rows(pg), st = await P.state(pg);
    return { newer: newer, same: same, before: before, after: after, st: st, foldHas: await P.foldHas(pg, newer.hash) };
  });
  verdict('M2', m2.newer.verdict.verdict === 'PARKED' && m2.newer.verdict.reason === 'needs-upgrade' && m2.foldHas === false && m2.newer.folded === null, 'the sv:2 op is PARKED needs-upgrade and absent from foldable()', JSON.stringify(m2.newer.verdict));
  verdict('M2', m2.st.provisional === true && m2.st.parked_by_reason['needs-upgrade'] === 1, 'versionState: provisional, 1 op needs-upgrade', JSON.stringify(m2.st));
  verdict('M2', m2.same.verdict.verdict === 'MERGED' && m2.same.folded !== null, 'CONTROL: the same op without sv is MERGED and folded', JSON.stringify(m2.same.verdict));
  verdict('M2', m2.after === m2.before + 1, 'the model gained exactly ONE element from the two peer ops (the control), not two: the parked op never reached the model', 'GEOM rows ' + m2.before + ' -> ' + m2.after);

  // ───────────── M3 shape 2 + a signed set ─────────────
  if (!QUIET) console.log('§M3 shape 2 and an admin-signed set');
  var set = await signObj(Object.assign({}, SET12), admin);
  var m3 = await scenario({ shape: { CRUD_CREATE: 2 }, sets: [set], trust: [admin.pub], signedPlan: true }, async function (pg) {
    var real = await P.realOp(pg), tpl = real.body.params.fields, before = await P.rows(pg), tsState = await pg.evaluate(function () { return window.TeamScope.state(); });
    var legacy = await P.peerOp(pg, 0, tpl), native = await P.peerOp(pg, 2, tpl); await P.visit(pg);
    var stored2 = await P.storedBody(pg, legacy.hash), storedAgain = await pg.evaluate(function (h) { var r = window.TeamSyncModeller.store().db.exec('SELECT envelope FROM cl_op WHERE op_hash=?', [h]); return r[0].values[0][0]; }, legacy.hash);
    return { real: real, legacy: legacy, native: native, before: before, after: await P.rows(pg), st: await P.state(pg), tsState: tsState, storedAgain: storedAgain, storedBody: stored2 };
  });
  verdict('M3', line(m3.logs, /§TEAM_VERSIONS_SET op=CRUD_CREATE ok/).length === 1 && line(m3.logs, /§TEAM_VERSIONS appV=CRUD_CREATE:2,CRUD_UPDATE:1 sets=1\/1/).length === 1 && m3.tsState === 'ok', 'the signed set loads (sets=1/1) and the signed plan verifies with the same key', 'plan=' + m3.tsState);
  verdict('M3', m3.legacy.verdict.verdict === 'MERGED' && !!m3.legacy.folded && m3.legacy.folded.params.fields.total === 10 && m3.legacy.folded.params.fields.grandtotal === undefined && m3.legacy.folded.params._sv === 2, 'an older peer\'s op (no sv) is folded in the v2 shape: fields.grandtotal -> fields.total, marked _sv 2', m3.legacy.folded ? JSON.stringify(m3.legacy.folded.params.fields).slice(0, 80) : 'null');
  verdict('M3', m3.legacy.stored === m3.storedAgain && m3.storedBody.sv === undefined && m3.storedBody.params.fields.grandtotal === 10, 'the STORED envelope of that op is byte-identical and still says grandtotal (upcast is on a copy)');
  verdict('M3', m3.native.verdict.verdict === 'MERGED' && m3.real.body.sv === 2, 'a native sv:2 op MERGES, and the op the Modeller authored itself carries sv:2', 'real.sv=' + m3.real.body.sv);
  verdict('M3', m3.after === m3.before + 2 && m3.st.provisional === false && m3.st.parked_count === 0, 'both peer ops became elements in the model (' + m3.before + ' -> ' + m3.after + ') and nothing is parked', JSON.stringify(m3.st));

  // ───────────── M4 sets that must be refused ─────────────
  if (!QUIET) console.log('§M4 sets that must be refused');
  var unsigned = JSON.parse(JSON.stringify(set)); delete unsigned.sig; delete unsigned.signer;
  var untrusted = await signObj(Object.assign({}, SET12), other);
  var tampered = JSON.parse(JSON.stringify(set)); tampered.steps[0].map[0].rename = ['grandtotal', 'steal'];
  var m4 = {};
  for (var kind of [['unsigned', unsigned, 'unsigned'], ['untrusted', untrusted, 'untrusted-signer'], ['tampered', tampered, 'bad-signature']]) {
    m4[kind[0]] = await scenario({ shape: { CRUD_CREATE: 2 }, sets: [kind[1]], trust: [admin.pub], signedPlan: true }, async function (pg) {
      var real = await P.realOp(pg), tpl = real.body.params.fields, before = await P.rows(pg), legacy = await P.peerOp(pg, 0, tpl); await P.visit(pg);
      return { legacy: legacy, before: before, after: await P.rows(pg), foldHas: await P.foldHas(pg, legacy.hash), st: await P.state(pg) };
    });
    var r = m4[kind[0]];
    verdict('M4', line(r.logs, new RegExp('§TEAM_VERSIONS_SET op=CRUD_CREATE refused:' + kind[2] + '$')).length === 1 && line(r.logs, /sets=0\/1/).length === 1, kind[0] + ' set -> refused:' + kind[2] + ', sets=0/1');
    verdict('M4', r.legacy.verdict.verdict === 'PARKED' && r.legacy.verdict.reason === 'needs-mapping' && r.foldHas === false && r.after === r.before && r.st.provisional === true, kind[0] + ': the older peer\'s op is PARKED needs-mapping, not folded, not projected (GEOM rows ' + r.before + ' -> ' + r.after + ')', JSON.stringify(r.legacy.verdict));
  }

  // ───────────── M5 an empty trust list accepts no set ─────────────
  if (!QUIET) console.log('§M5 empty trust list');
  var m5 = await scenario({ shape: { CRUD_CREATE: 2 }, sets: [set], trust: [] }, async function (pg) {
    var real = await P.realOp(pg), tpl = real.body.params.fields, legacy = await P.peerOp(pg, 0, tpl), tsState = await pg.evaluate(function () { return window.TeamScope.state(); }), cl = await pg.evaluate(function () { return window.TeamSyncModeller.classes(); });
    return { legacy: legacy, tsState: tsState, cl: cl };
  });
  verdict('M5', line(m5.logs, /§TEAM_VERSIONS_SET op=CRUD_CREATE refused:untrusted-signer$/).length === 1 && m5.legacy.verdict.reason === 'needs-mapping', 'a correctly signed set is REFUSED untrusted-signer when the trust list is empty; the older op parks needs-mapping', JSON.stringify(m5.legacy.verdict));
  verdict('M5', m5.tsState === 'unsigned' && Object.keys(m5.cl).length === 7, 'CONTROL: the (unsigned) plan still works exactly as before with an empty trust list', 'plan=' + m5.tsState + ' classes=' + Object.keys(m5.cl).length);

  // ───────────── M6 ─────────────
  var all = [m1, m2, m3, m4.unsigned, m4.untrusted, m4.tampered, m5]; var errN = all.reduce(function (n, r) { return n + r.errs.length; }, 0);
  verdict('M6', errN === 0, '0 page errors across all ' + all.length + ' loads', errN ? all.map(function (r) { return r.errs.join('|'); }).join(' ; ').slice(0, 200) : 'errors=0');

  var red = Object.keys(ARMS).filter(function (k) { return ARMS[k] > 0; });
  console.log('§VM_ARMS red=' + (red.join(',') || 'none') + ' judged=' + judged);
  await browser.close(); server.close();
  if (QUIET) process.exit(red.length ? 1 : 0);

  // ───────────── mutants: run this same file against a broken copy of the adapter / glue ─────────────
  var M = [
    ['versions not passed to the store', 'adapter', ", versions: global.TeamVersions && global.TeamVersions.registry", '', ['M2', 'M4']],
    ['verifySet accepts everything', 'glue', 'async function verifySet(set) {', 'async function verifySet(set) { return null;', ['M4', 'M5']],
    ['an empty trust list accepts a set', 'glue', 'if (!t || !t.some(function (k) { return same(set.signer, k); })) return \'untrusted-signer\';', 'if (t && !t.some(function (k) { return same(set.signer, k); })) return \'untrusted-signer\';', ['M5']],
    ['stamp ignores the shape', 'adapter', 'if (!(v > 1)) return body;', 'if (false) return body;', ['M1']]];
  var cp = require('child_process'), muts = [];
  for (var m of M) {
    var src = m[1] === 'adapter' ? ADAPTER : GLUE;
    if (src.split(m[2]).length !== 2) { muts.push({ name: m[0], error: 'anchor not found exactly once' }); continue; }
    var tmp = path.join(os.tmpdir(), 'vm_mut_' + process.pid + '_' + muts.length + '.js'); fs.writeFileSync(tmp, src.replace(m[2], m[3]));
    var k = cp.spawnSync(process.execPath, [__filename], { encoding: 'utf8', timeout: 600000, env: Object.assign({}, process.env, { VM_ONLY_ARMS: '1', VM_MUT_KIND: m[1], VM_MUT_FILE: tmp }) });
    fs.unlinkSync(tmp); var mm = /§VM_ARMS red=(\S+)/.exec(k.stdout || ''), r2 = mm && mm[1] !== 'none' ? mm[1].split(',') : [];
    muts.push({ name: m[0], expect: m[4], red: r2 });
  }
  console.log('\n§VM_MUTANTS');
  muts.forEach(function (m) { var ok = !m.error && m.expect.every(function (e) { return m.red.indexOf(e) !== -1; }); if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + m.name + ' -> ' + (m.error || 'red arms: ' + (m.red.join(', ') || 'NONE (survivor)') + ' (expected ' + m.expect.join('/') + ')')); });
  console.log('§VM_VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fails=' + fails + ' mutants_killed=' + muts.filter(function (m) { return !m.error && m.red.length; }).length + '/' + muts.length + ' pageerrors=' + errors);
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.log('§VM_CRASH ' + (e && e.stack || e)); process.exit(2); });
