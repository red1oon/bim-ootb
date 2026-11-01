#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-PUBLISH-ERP, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §16.35 (an admin PUBLISHES signed upcaster sets inside the POLICY op; devices adopt them on their next visit). READ THE LOG after every run.
//   The REAL erp/idempiere.html (?team=1, GardenAdmin) in TWO or THREE headless Chromium contexts (A = admin/founder, B = approved joiner, C = a device that joins AFTER the publish) on one dumb folder pipe;
//   A, B, C pair through the ERP's own found()/join()/requests()/approve(); the "older peer" op is authored with store.author() (no sv); every number is read from the live page.
//   §P1 waiting  — B (shape 2, no set): the older peer's op is PARKED needs-mapping, B's chip says "translation rule", the op is not in B's database.
//   §P2 publish  — A publishes the owner-signed set; after B's next visit the op is MERGED in the v2 shape, B's database gains the element, B's chip is clear, B's stored envelope is untouched.
//   §P3 refused  — an unsigned set is refused by the ENGINE (bad-policy:upcasters); a set edited after signing is refused by B (bad-signature); the op stays parked.
//   §P4 untrusted— a set signed by a key outside the trust list: refused:untrusted-signer; the op stays parked (and the earlier bad set was kept, never dropped).
//   §P5 admin    — B (not admin) calling publishUpcasters has no effect: its POLICY is REFUSED not-admin on both devices.
//   §P6 late     — C joins after the publish and adopts the set on its first visit: the set travels with the log, no fetch.   §P7 0 page errors.
//   §MUTANTS     — the host / glue served with one rule broken; each must turn >= 1 arm red.
// Run: node erp/tests/witness_team_publish.js 2>&1 | tee /tmp/witness_team_publish_erp.log
'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), vm = require('vm'), nodeCrypto = require('crypto');
var ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
function reqPw() {      // §50.3: the tree's own tests/ install, else normal resolution; never a home-directory path
  var c = [require('path').join(__dirname, '..', '..', 'tests', 'node_modules', 'playwright'), 'playwright'];
  for (var i = 0; i < c.length; i++) { try { return require(c[i]); } catch (e) { /* next */ } }
  throw new Error('playwright is not installed: run `cd ' + require('path').join(__dirname, '..', '..', 'tests') + ' && npm install && npx playwright install chromium` (§50.3)'); }
var subtle = nodeCrypto.webcrypto.subtle, fails = 0, judged = 0, errors = 0, ARMS = {}, QUIET = !!process.env.WP_ONLY_ARMS;
function verdict(arm, ok, label, detail) { judged++; ARMS[arm] = ARMS[arm] || 0; if (!ok) { fails++; ARMS[arm]++; } if (!QUIET) console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + arm + ' ' + label + (detail ? ' — ' + detail : '')); return ok; }
function walk(d, rel, out) { if (!fs.existsSync(d)) return out; fs.readdirSync(d).forEach(function (n) { var p = path.join(d, n), r = rel ? rel + '/' + n : n; if (fs.statSync(p).isDirectory()) walk(p, r, out); else out.push(r); }); return out; }
function canon(o) { if (o === null || typeof o !== 'object') return JSON.stringify(o); if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']'; return '{' + Object.keys(o).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(o[k]); }).join(',') + '}'; }
function hex(buf) { return Buffer.from(buf).toString('hex'); }
async function mkKey() { var kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']), j = await subtle.exportKey('jwk', kp.publicKey); return { priv: kp.privateKey, pub: { kty: j.kty, crv: j.crv, x: j.x, y: j.y } }; }
async function signObj(obj, key) { var b = JSON.parse(JSON.stringify(obj)); delete b.sig; delete b.signer; var s = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.priv, new TextEncoder().encode(canon(b))); var o = JSON.parse(JSON.stringify(b)); o.signer = key.pub; o.sig = hex(s); return o; }

var PLAN_SRC = fs.readFileSync(path.join(ROOT, 'erp', 'team_plan.js'), 'utf8');
var PLAN = (function () { var g = {}; vm.runInNewContext(PLAN_SRC, { window: g, globalThis: g }); return g.TEAM_PLAN; })();
var planJs = function (o) { return '(function (g) { g.TEAM_PLAN = ' + JSON.stringify(o) + '; })(typeof window !== \'undefined\' ? window : globalThis);\n'; };
var ADAPTER = fs.readFileSync(path.join(ROOT, 'erp', 'team_sync.js'), 'utf8'), GLUE = fs.readFileSync(path.join(ROOT, 'common', 'comm', 'team_versions.js'), 'utf8');
var SET12 = { kind: 'upcasters', op: 'CRUD_CREATE', steps: [{ from: 1, map: [{ at: 'fields', rename: ['legacy_note', 'description'] }] }] };

(async function () {
  if (!QUIET) console.log('═══ W-PUBLISH-ERP — signed upcaster sets published in the POLICY (TEAMWORK_FRAMEWORK §16.35) ═══\n');
  var FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'versions-modeller-')), cur = { plan: null, adapter: null, glue: null };
  if (process.env.WP_MUT_FILE) cur[process.env.WP_MUT_KIND] = fs.readFileSync(process.env.WP_MUT_FILE, 'utf8');   // child run of a mutant: serve the broken file
  var server = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
    if (p === '/pipe/list') { var pre = u.searchParams.get('prefix') || ''; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(walk(FOLDER, '', []).filter(function (n) { return n.indexOf(pre) === 0; }))); return; }
    if (p.indexOf('/pipe/f/') === 0) { var fp = path.join(FOLDER, p.slice(8)); if (fp.indexOf(FOLDER) !== 0) { res.writeHead(400); res.end(); return; }
      if (req.method === 'PUT') { var ch = []; req.on('data', function (c) { ch.push(c); }); req.on('end', function () { fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, Buffer.concat(ch)); res.writeHead(200); res.end('ok'); }); return; }
      if (!fs.existsSync(fp)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); return; }
    if (p === '/erp/team_plan.js' && cur.plan) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(cur.plan); return; }
    if (p === '/erp/team_sync.js' && cur.adapter) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(cur.adapter); return; }
    if (p === '/common/comm/team_versions.js' && cur.glue) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(cur.glue); return; }
    var f = path.join(ROOT, p === '/' ? '/erp/idempiere.html' : p);
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port, PIPE = base + '/pipe';
  var browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] });
  var admin = await mkKey(), other = await mkKey();
  var signedPlan = planJs(await signObj(PLAN, admin));

  // one device = one fresh Chromium context. cfg: shape 2 for CRUD_CREATE, NO sets in config, trust = the owner key; the plan is served signed (else it would fail closed).
  var devices = [];
  async function device(name) {
    cur.plan = signedPlan;
    var ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } }), pg = await ctx.newPage(), logs = [], errs = [];
    pg.on('console', function (m) { logs.push(m.text()); }); pg.on('pageerror', function (e) { errs.push(e.message); errors++; });
    await pg.addInitScript(function () { var q = new URLSearchParams(location.search).get('vcfg'); if (q) { var c = JSON.parse(atob(q)); window.TEAM_SHAPE_V = c.shape; window.TEAM_UPCASTERS = c.sets; window.TEAM_PLAN_TRUST = c.trust; } });
    var vcfg = Buffer.from(JSON.stringify({ shape: { CRUD_CREATE: 2 }, sets: [], trust: [admin.pub] })).toString('base64');
    await pg.goto(base + '/erp/idempiere.html?login=GardenAdmin&window=143&team=1&pipe=' + encodeURIComponent(PIPE) + '&vcfg=' + encodeURIComponent(vcfg), { waitUntil: 'load' });
    await pg.waitForFunction(function () { return window.TeamSync && window.__idmpDb && window.__crud && window.__idmpDb.exec('SELECT count(*) FROM ad_table')[0].values[0][0] > 0; }, null, { timeout: 120000 });
    await pg.evaluate(function () { return window.TeamSync.ready; });
    var d = { name: name, pg: pg, logs: logs, errs: errs, ctx: ctx }; devices.push(d); return d;
  }
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var T = {
    found: function (d) { return d.pg.evaluate(function () { return window.TeamSync.found(); }); },
    join: function (d, space) { return d.pg.evaluate(function (sp) { return window.TeamSync.join(sp); }, space); },
    approveAll: function (d) { return d.pg.evaluate(async function () { var r = await window.TeamSync.requests(); for (var x of r) await window.TeamSync.approve(x.rq, 102); return r.length; }); },
    visit: function (d) { return d.pg.evaluate(async function () { await window.TeamSync.visit(); }); },
    enrolled: function (d) { return d.pg.evaluate(async function () { return (await window.TeamSync.pairState()).enrolled; }); },
    realOp: async function (d, tag) { var n0 = d.logs.length; await d.pg.evaluate(function (t) { return window.__crud.applyOp({ op_type: 'CRUD_CREATE', key: 'c_bpartner', table: 'c_bpartner', verb: 'create', fields: { value: t, name: 'Publish ' + t, ad_client_id: 11, ad_org_id: 11, isactive: 'Y' } }); }, tag);
      for (var i = 0; i < 60 && !d.logs.slice(n0).some(function (l) { return /§TEAM_OUT op=CRUD_CREATE table=c_bpartner/.test(l); }); i++) await new Promise(function (r) { setTimeout(r, 250); });
      return d.pg.evaluate(function (v) { var S = window.TeamSync.store(), all = S.query('SELECT envelope FROM cl_op').map(function (r) { return JSON.parse(r.envelope); }); var e = all.filter(function (x) { return x.body.op_type === 'CRUD_CREATE' && x.target.table === 'c_bpartner' && (x.body.params.fields || {}).value === v; })[0]; return e ? e.body.params.fields : null; }, tag); },
    // an op as an OLDER peer (no sv, field legacy_note) would have authored it
    legacyOp: function (d, tpl) { return d.pg.evaluate(async function (tpl) { var S = window.TeamSync.store(), f = JSON.parse(JSON.stringify(tpl)); delete f.output_guid; f.value = 'L' + Math.random().toString(36).slice(2, 7); f.name = 'Legacy ' + f.value; f.legacy_note = 'from an older app';
      var r = await S.author({ target: { table: 'c_bpartner', uu: crypto.randomUUID() }, intent: 'K2', body: { op_type: 'CRUD_CREATE', params: { fields: f } } }); return r.hash; }, tpl); },
    verdict: function (d, h) { return d.pg.evaluate(async function (h) { var v = (await window.TeamSync.store().order()).verdict[h]; return v ? v.verdict + ':' + v.reason : 'none'; }, h); },
    folded: function (d, h) { return d.pg.evaluate(async function (h) { var f = (await window.TeamSync.store().foldable()).filter(function (p) { return p.hash === h; })[0]; return f ? f.env.body : null; }, h); },
    stored: function (d, h) { return d.pg.evaluate(function (h) { var r = window.TeamSync.store().db.exec('SELECT envelope FROM cl_op WHERE op_hash=?', [h]); return r.length ? r[0].values[0][0] : null; }, h); },
    rows: function (d) { return d.pg.evaluate(function () { var r = window.__crud.kernelDb().exec("SELECT count(*) FROM kernel_ops WHERE op_type='CRUD_CREATE' AND parameters LIKE '%c_bpartner%'"); return r[0].values[0][0]; }); },
    chip: function (d) { return d.pg.evaluate(async function () { await window.TeamSync.render(); var c = document.getElementById('team-chip'), w = document.getElementById('team-warn'); return { versions: c.getAttribute('data-versions'), parked: c.getAttribute('data-parked'), warn: w.textContent }; }); },
    publish: function (d, sets) { return d.pg.evaluate(async function (sets) { var r = await window.TeamSync.publishUpcasters(sets); return r && r.hash; }, sets); },
    policy: function (d) { return d.pg.evaluate(async function () { var p = await window.TeamSync.store().policy(); return p ? { epoch: p.epoch, n: (p.params.upcasters || []).length } : null; }); }
  };
  async function pair(A, B) { var space = await T.found(A); await T.join(B, space); for (var i = 0; i < 4; i++) { await T.approveAll(A); await T.visit(B); await T.visit(A); if (await T.enrolled(B)) break; await sleep(300); } return { space: space, enrolled: await T.enrolled(B) }; }
  var line = function (logs, re) { return logs.filter(function (l) { return re.test(l); }); };
  var WAITS = 'for a translation rule from the team admin';

  // ───────────── S1: A (admin) and B (joiner), the owner-signed set published later ─────────────
  if (!QUIET) console.log('§S1 two devices: waiting, a non-admin cannot publish, the admin publishes');
  var setGood = await signObj(Object.assign({}, SET12), admin);
  var A = await device('A'), B = await device('B'), pr = await pair(A, B);
  verdict('P0', pr.enrolled === true, 'precondition: B joined and was approved by A through the Modeller\'s own pairing', 'enrolled=' + pr.enrolled);
  var tpl = await T.realOp(A, 'PUB-S1'); await T.visit(A); await T.visit(B);
  var hLegacy = await T.legacyOp(A, tpl); await T.visit(A); await T.visit(B);
  var vB1 = await T.verdict(B, hLegacy), fB1 = await T.folded(B, hLegacy), rowsB1 = await T.rows(B), chipB1 = await T.chip(B);
  verdict('P1', vB1 === 'PARKED:needs-mapping' && fB1 === null && chipB1.versions === 'provisional' && chipB1.warn.indexOf(WAITS) !== -1, 'B (shape 2, no set) parks the older peer\'s op needs-mapping, it is not folded, and B\'s chip says it waits for a translation rule', vB1 + ' | ' + chipB1.warn);
  // P5: B is not the admin
  var hNon = await T.publish(B, [setGood]); await T.visit(B); await T.visit(A); await T.visit(B);
  var vNonA = await T.verdict(A, hNon), vNonB = await T.verdict(B, hNon), polNon = await T.policy(B), vB1b = await T.verdict(B, hLegacy);
  verdict('P5', /^REFUSED:not-admin$/.test(vNonA) && /^REFUSED:not-admin$/.test(vNonB) && polNon === null && vB1b === 'PARKED:needs-mapping', 'a non-admin\'s publishUpcasters has no effect: its POLICY is REFUSED not-admin on both devices, no policy in force, the op stays parked', vNonA + ' / ' + vNonB + ' policy=' + JSON.stringify(polNon));
  // P2: the admin publishes
  var rowsBefore = await T.rows(B), hPub = await T.publish(A, [setGood]); await T.visit(B);            // ONE visit by B: adopt + refold must act within it (a second visit would hide a missing refold)
  var vB2 = await T.verdict(B, hLegacy), fB2 = await T.folded(B, hLegacy), rowsB2 = await T.rows(B), chipB2 = await T.chip(B), stB = await T.stored(B, hLegacy), stB0 = await T.stored(A, hLegacy), polB = await T.policy(B);
  verdict('P2', /^MERGED/.test(vB2) && !!fB2 && fB2.params.fields.description === 'from an older app' && fB2.params.fields.legacy_note === undefined && fB2.params._sv === 2, 'after A publishes and B visits: the op is MERGED and folded in the v2 shape (legacy_note -> description, _sv 2)', vB2 + ' ' + (fB2 ? JSON.stringify(fB2.params.fields).slice(0, 70) : 'null'));
  verdict('P2', rowsB2 === rowsBefore + 1 && chipB2.versions === 'ok' && !/translation rule|newer app/.test(chipB2.warn), 'B\'s model gained the element (' + rowsBefore + ' -> ' + rowsB2 + ') and the chip cleared by itself', JSON.stringify(chipB2));
  verdict('P2', polB && polB.n === 1 && stB !== null && JSON.parse(stB).body.params.fields.legacy_note === 'from an older app' && JSON.parse(stB).body.sv === undefined && line(B.logs, /§TEAM_VERSIONS_ADOPT newly loaded=1/).length >= 1, 'B\'s policy in force carries the set, the STORED envelope of the op still says legacy_note (byte-level upcast is on a copy), and B logged §TEAM_VERSIONS_ADOPT', JSON.stringify(polB));
  // P6: C joins after the publish
  var C = await device('C'); var spaceC = pr.space; await T.join(C, spaceC);
  for (var i = 0; i < 4; i++) { await T.approveAll(A); await T.visit(C); await T.visit(A); if (await T.enrolled(C)) break; await sleep(300); } await T.visit(C); await T.visit(C);
  var vC = await T.verdict(C, hLegacy), fC = await T.folded(C, hLegacy), chipC = await T.chip(C);
  verdict('P6', await T.enrolled(C) && /^MERGED/.test(vC) && !!fC && fC.params.fields.description === 'from an older app' && chipC.versions === 'ok', 'C, which joined AFTER the publish, adopted the set on its own visits and folds the old op in the v2 shape (the set travelled with the log)', vC + ' enrolled=' + (await T.enrolled(C)));

  // ───────────── S2: bad sets ─────────────
  if (!QUIET) console.log('§S2 bad sets');
  var A2 = await device('A2'), B2 = await device('B2'), pr2 = await pair(A2, B2);
  var tpl2 = await T.realOp(A2, 'PUB-S2'); await T.visit(A2); await T.visit(B2);
  var hLeg2 = await T.legacyOp(A2, tpl2); await T.visit(A2); await T.visit(B2);
  var unsignedSet = JSON.parse(JSON.stringify(setGood)); delete unsignedSet.sig; delete unsignedSet.signer;
  var hUns = null, unsErr = null; try { hUns = await T.publish(A2, [unsignedSet]); } catch (e) { unsErr = e.message; }
  await T.visit(A2); await T.visit(B2);
  var vUns = hUns ? await T.verdict(B2, hUns) : 'not-authored(' + unsErr + ')', polUns = await T.policy(B2);
  verdict('P3', /^REFUSED:bad-policy:upcasters$/.test(vUns) && polUns === null, 'an UNSIGNED set is refused by the engine itself (bad-policy:upcasters); no policy takes effect', vUns + ' policy=' + JSON.stringify(polUns));
  var tampered = JSON.parse(JSON.stringify(setGood)); tampered.steps[0].map[0].rename = ['legacy_note', 'steal'];
  var hTam = await T.publish(A2, [tampered]); await T.visit(A2); await T.visit(B2); await T.visit(B2);
  var vTam = await T.verdict(B2, hTam), vLeg2 = await T.verdict(B2, hLeg2), chip2 = await T.chip(B2);
  verdict('P3', /^MERGED/.test(vTam) && line(B2.logs, /§TEAM_VERSIONS_SET op=CRUD_CREATE refused:bad-signature$/).length >= 1 && vLeg2 === 'PARKED:needs-mapping' && chip2.warn.indexOf(WAITS) !== -1, 'a set edited after signing: the POLICY is merged (the admin may publish it) but B REFUSES the set (bad-signature) and the op stays parked, the chip still says translation rule', vTam + ' | ' + vLeg2);
  var untrusted = await signObj(Object.assign({}, SET12, { op: 'CRUD_UPDATE' }), other);
  var hUnt = await T.publish(A2, [untrusted]); await T.visit(A2); await T.visit(B2); await T.visit(B2);
  var polUnt = await T.policy(B2), vLeg2b = await T.verdict(B2, hLeg2);
  verdict('P4', line(B2.logs, /§TEAM_VERSIONS_SET op=CRUD_UPDATE refused:untrusted-signer$/).length >= 1 && vLeg2b === 'PARKED:needs-mapping' && polUnt && polUnt.n === 2, 'a set signed by a key outside the trust list: refused:untrusted-signer, the op stays parked; the policy in force keeps BOTH sets (the earlier bad one was never dropped)', JSON.stringify(polUnt) + ' ' + vLeg2b);
  // a correct set finally clears it (the bad ones do not block a good one)
  var hGood2 = await T.publish(A2, [setGood]); await T.visit(A2); await T.visit(B2); await T.visit(B2);
  var vLeg2c = await T.verdict(B2, hLeg2), chip2c = await T.chip(B2);
  verdict('P4', /^MERGED/.test(vLeg2c) && chip2c.versions === 'ok', 'CONTROL: after the good set is published (alongside the bad ones) B folds the op and the chip clears', vLeg2c);

  // ───────────── P7 ─────────────
  var errN = devices.reduce(function (n, d) { return n + d.errs.length; }, 0);
  verdict('P7', errN === 0, '0 page errors across all ' + devices.length + ' devices', errN ? devices.map(function (d) { return d.errs.join('|'); }).join(' ; ').slice(0, 200) : 'errors=0');
  for (var d of devices) await d.ctx.close();

  var red = Object.keys(ARMS).filter(function (k) { return ARMS[k] > 0; });
  console.log('§WP_ARMS red=' + (red.join(',') || 'none') + ' judged=' + judged);
  await browser.close(); server.close();
  if (QUIET) process.exit(red.length ? 1 : 0);
  if (process.env.WP_NO_MUT) { console.log('§WP_VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fails=' + fails + ' mutants=skipped pageerrors=' + errors); process.exit(fails ? 1 : 0); }

  // ───────────── mutants: run this same file against a broken copy of the adapter / glue ─────────────
  var M = [
    ['the host never adopts published sets', 'adapter', "async function adoptSets() { if (global.TeamVersions && global.TeamVersions.adopt && S) {", "async function adoptSets() { if (false) {", ['P2', 'P6']],
    ['adopt does not refold after loading', 'glue', "if (n && typeof store.refold === 'function') store.refold();", ';', ['P2']],
    ['adopt verifies nothing (verifySet accepts all)', 'glue', 'async function verifySet(set) {', 'async function verifySet(set) { return null;', ['P3', 'P4']],
    ['publish drops the previous sets', 'glue', '(Array.isArray(base.upcasters) ? base.upcasters : []).concat(sets || [])', '[].concat(sets || [])', ['P4']]];
  var cp = require('child_process'), muts = [];
  for (var m of M) {
    var src = m[1] === 'adapter' ? ADAPTER : GLUE;
    if (src.split(m[2]).length !== 2) { muts.push({ name: m[0], error: 'anchor not found exactly once' }); continue; }
    var tmp = path.join(os.tmpdir(), 'wp_mut_' + process.pid + '_' + muts.length + '.js'); fs.writeFileSync(tmp, src.replace(m[2], m[3]));
    var k = cp.spawnSync(process.execPath, [__filename], { encoding: 'utf8', timeout: 600000, env: Object.assign({}, process.env, { WP_ONLY_ARMS: '1', WP_MUT_KIND: m[1], WP_MUT_FILE: tmp }) });
    fs.unlinkSync(tmp); var mm = /§WP_ARMS red=(\S+)/.exec(k.stdout || ''), r2 = mm && mm[1] !== 'none' ? mm[1].split(',') : [];
    muts.push({ name: m[0], expect: m[4], red: r2 });
  }
  console.log('\n§WP_MUTANTS');
  muts.forEach(function (m) { var ok = !m.error && m.expect.every(function (e) { return m.red.indexOf(e) !== -1; }); if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + m.name + ' -> ' + (m.error || 'red arms: ' + (m.red.join(', ') || 'NONE (survivor)') + ' (expected ' + m.expect.join('/') + ')')); });
  console.log('§WP_VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fails=' + fails + ' mutants_killed=' + muts.filter(function (m) { return !m.error && m.red.length; }).length + '/' + muts.length + ' pageerrors=' + errors);
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.log('§WP_CRASH ' + (e && e.stack || e)); process.exit(2); });
