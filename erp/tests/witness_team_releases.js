#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-RELEASE-SCREENS, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §46.5 Stage 4 (STAGE4_SPEC): Trusted keys · Sync rules · Rollout · Updates · Publish in the Team panel. READ THE LOG after every run: verdict = §RS_VERDICT.
//   THE ISSUE it proves/disproves: Stages 2-3 built keys, thresholds, bundle signatures, the anchor and the signed update list, but no person could SEE or USE any of it. The screens must show exactly what the store holds,
//   publish only what receivers would accept, and touch nothing in the core ERP (twin rule). The REAL erp/idempiere.html (?team=1) in two headless Chromium contexts on one dumb folder pipe: A = founder/admin, B = a joined device.
//   Every arm CLICKS the real button and asserts VALUES read from state (counts equal the store's) plus §-lines; nothing is "looks right".
//   S0 the buttons (B has no Publish) · K trusted keys · R sync rules · O rollout · U updates (published through the Publish screen) · C anchor confirm · G unsigned plugin badge · P publish refusals · T twin: AD rows unchanged, 0 page errors, source names no table · MUTANTS.
// Run: node erp/tests/witness_team_releases.js 2>&1 | tee build/scriptor/versioning_s2_s4/witness_team_releases.log
'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), vm = require('vm'), nodeCrypto = require('crypto'), cp = require('child_process');
var ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var subtle = nodeCrypto.webcrypto.subtle, judged = 0, errors = 0, ARMS = {}, QUIET = !!process.env.RS_ONLY_ARMS;
function A(arm, ok, label, detail) { if (ok === null) { if (!QUIET) console.log('   ⚪ INCONCLUSIVE ' + arm + ' ' + label + (detail ? ' — ' + detail : '')); ARMS['~' + arm] = 1; return null; } judged++; ARMS[arm] = ARMS[arm] || 0; if (!ok) ARMS[arm]++; if (!QUIET) console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + arm + ' ' + label + (detail ? ' — ' + detail : '')); return ok; }
function walk(d, rel, out) { if (!fs.existsSync(d)) return out; fs.readdirSync(d).forEach(function (n) { var p = path.join(d, n), r = rel ? rel + '/' + n : n; if (fs.statSync(p).isDirectory()) walk(p, r, out); else out.push(r); }); return out; }
function canon(o) { if (o === null || typeof o !== 'object') return JSON.stringify(o); if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']'; return '{' + Object.keys(o).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(o[k]); }).join(',') + '}'; }
var hex = function (b) { return Buffer.from(b).toString('hex'); }, sha = function (b) { return nodeCrypto.createHash('sha256').update(b).digest('hex'); };
async function mkKey(role) { var kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']), j = await subtle.exportKey('jwk', kp.publicKey), pub = { kty: j.kty, crv: j.crv, x: j.x, y: j.y }; var en = Object.assign({}, pub); if (role) en.role = role; return { priv: kp.privateKey, pub: pub, entry: en }; }
function bodyOf(st) { var b = JSON.parse(JSON.stringify(st)); delete b.sig; delete b.signer; delete b.cosigs; return b; }
async function sigOf(body, key) { return hex(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.priv, new TextEncoder().encode(canon(body)))); }
async function signL(st, keys) { var b = bodyOf(st), out = Object.assign({}, b, { signer: keys[0].pub, sig: await sigOf(b, keys[0]) }); if (keys.length > 1) { out.cosigs = []; for (var i = 1; i < keys.length; i++) out.cosigs.push({ signer: keys[i].pub, sig: await sigOf(b, keys[i]) }); } return out; }
async function signPlan(obj, key) { var b = JSON.parse(JSON.stringify(obj)); delete b.sig; delete b.signer; var s = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.priv, new TextEncoder().encode(canon(b))); var o = JSON.parse(JSON.stringify(b)); o.sig = hex(s); o.signer = key.pub; return o; }
var PLAN_SRC = fs.readFileSync(path.join(ROOT, 'erp', 'team_plan.js'), 'utf8');
var PLAN = (function () { var g = {}; vm.runInNewContext(PLAN_SRC, { window: g, globalThis: g }); return g.TEAM_PLAN; })();
var planJs = function (o) { return '(function (g) { g.TEAM_PLAN = ' + JSON.stringify(o) + '; })(typeof window !== \'undefined\' ? window : globalThis);\n'; };
var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

(async function () {
  if (!QUIET) console.log('═══ W-RELEASE-SCREENS — Trusted keys, Sync rules, Rollout, Updates, Publish in the Team panel (STAGE4_SPEC) ═══\n');
  var FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'team-rel-')), cur = { plan: null, mutPath: null, mutText: null };
  if (process.env.RS_MUT_FILE) { cur.mutPath = process.env.RS_MUT_PATH; cur.mutText = fs.readFileSync(process.env.RS_MUT_FILE, 'utf8'); }
  var server = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
    if (p === '/pipe/list') { var pre = u.searchParams.get('prefix') || ''; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(walk(FOLDER, '', []).filter(function (n) { return n.indexOf(pre) === 0; }))); return; }
    if (p.indexOf('/pipe/f/') === 0) { var fp = path.join(FOLDER, p.slice(8)); if (fp.indexOf(FOLDER) !== 0) { res.writeHead(400); res.end(); return; }
      if (req.method === 'PUT') { var ch = []; req.on('data', function (c) { ch.push(c); }); req.on('end', function () { fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, Buffer.concat(ch)); res.writeHead(200); res.end('ok'); }); return; }
      if (!fs.existsSync(fp)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); return; }
    if (p === '/erp/team_plan.js' && cur.plan) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(cur.plan); return; }
    if (cur.mutPath && p === cur.mutPath) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(cur.mutText); return; }
    var f = path.join(ROOT, p === '/' ? '/erp/idempiere.html' : p);
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port, PIPE = base + '/pipe';
  var browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] });
  var Ko = await mkKey(), Kr = await mkKey('rotate-only'), Kp = await mkKey('publish'), THR = 2, TRUST = [Ko.entry, Kr.entry, Kp.entry];
  cur.plan = planJs(await signPlan(PLAN, Ko));

  async function device(name, login, installed) {
    var ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } }), pg = await ctx.newPage(), logs = [], errs = [];
    pg.on('console', function (m) { logs.push(m.text()); }); pg.on('pageerror', function (e) { errs.push(e.message); errors++; });
    await pg.addInitScript(function () { var q = new URLSearchParams(location.search).get('xcfg'); if (q) { var c = JSON.parse(atob(q)); window.TEAM_PLAN_TRUST = c.trust; window.TEAM_PLAN_TRUST_THRESHOLD = c.thr; if (c.installed) window.TEAM_INSTALLED = c.installed; } });
    var xcfg = Buffer.from(JSON.stringify({ trust: TRUST, thr: THR, installed: installed || null })).toString('base64');
    await pg.goto(base + '/erp/idempiere.html?login=' + (login || 'GardenAdmin') + '&window=143&record=108&team=1&pipe=' + encodeURIComponent(PIPE) + '&xcfg=' + encodeURIComponent(xcfg), { waitUntil: 'load' });
    await pg.waitForFunction(function () { return window.TeamSync && window.__idmpDb && window.__crud && window.__idmpDb.exec('SELECT count(*) FROM ad_table')[0].values[0][0] > 0; }, null, { timeout: 180000 });
    await pg.evaluate(function () { return window.TeamSync.ready; });
    return { name: name, pg: pg, logs: logs, errs: errs, ctx: ctx };
  }
  var T = {
    found: function (d) { return d.pg.evaluate(function () { return window.TeamSync.found(); }); },
    join: function (d, space) { return d.pg.evaluate(function (sp) { return window.TeamSync.join(sp); }, space); },
    approveAll: function (d, role) { return d.pg.evaluate(async function (role) { var r = await window.TeamSync.requests(); for (var x of r) await window.TeamSync.approve(x.rq, role); return r.length; }, role); },
    visit: function (d) { return d.pg.evaluate(async function () { await window.TeamSync.visit(); }); },
    enrolled: function (d) { return d.pg.evaluate(async function () { return (await window.TeamSync.pairState()).enrolled; }); },
    openPanel: async function (d) { await d.pg.evaluate(function () { var p = document.getElementById('team-panel'); if (p) p.remove(); return window.TeamPanel.open(); }); await d.pg.waitForSelector('#tp-rel-buttons button', { timeout: 20000 }).catch(function () {}); },
    click: async function (d, id) { await d.pg.click('#' + id); await sleep(400); },
    rows: function (d) { return d.pg.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('#tp-rel-body .tp-rel-row'), function (r) { var o = {}; for (var i = 0; i < r.attributes.length; i++) if (/^data-/.test(r.attributes[i].name)) o[r.attributes[i].name.slice(5)] = r.attributes[i].value; o.text = r.textContent; o.cl = r.querySelectorAll('.tp-cl').length; return o; }); }); },
    attr: function (d, sel, a) { return d.pg.evaluate(function (x) { var e = document.querySelector(x.sel); return e ? { v: e.getAttribute(x.a), t: e.textContent } : null; }, { sel: sel, a: a }); },
    adCounts: function (d) { return d.pg.evaluate(function () { var o = {}; ['ad_window', 'ad_tab', 'ad_field', 'ad_process', 'ad_menu', 'ad_document_action_access'].forEach(function (t) { o[t] = window.__idmpDb.exec('SELECT count(*) FROM ' + t)[0].values[0][0]; }); return o; }); },
    pub: function (d, files) { return d.pg.evaluate(function () { var r = document.getElementById('tp-pub-result'); r.setAttribute('data-ok', ''); r.setAttribute('data-reason', ''); }).then(function () { return d.pg.setInputFiles('#tp-pub-files', files); }).then(function () { return d.pg.click('#tp-pub-go'); }).then(function () { return d.pg.waitForFunction(function () { var r = document.getElementById('tp-pub-result'); return r && r.getAttribute('data-ok') !== ''; }, null, { timeout: 30000 }); }).then(function () { return T.attr(d, '#tp-pub-result', 'data-reason').then(function (r) { return d.pg.evaluate(function () { var r = document.getElementById('tp-pub-result'); return { ok: r.getAttribute('data-ok') === 'true', reason: r.getAttribute('data-reason'), text: r.textContent }; }); }); }); },
    relayPub: function () { return walk(FOLDER, '', []).filter(function (n) { return /\/pub\//.test(n); }); }
  };

  // ── setup ──
  var AD0;
  var Dev = {}; Dev.A = await device('A', 'GardenAdmin'); Dev.B = await device('B', 'GardenUser', { 'kw.same': '1.0.0' });
  var space = await T.found(Dev.A); await T.join(Dev.B, space);
  for (var i = 0; i < 4; i++) { await T.approveAll(Dev.A, 103); await T.visit(Dev.B); await T.visit(Dev.A); if (await T.enrolled(Dev.B)) break; await sleep(300); }
  var a = Dev.A, b = Dev.B, enrolledB = await T.enrolled(b);
  AD0 = await T.adCounts(a);
  await T.openPanel(a); await T.openPanel(b);
  var btnsA = await a.pg.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('#tp-rel-buttons button'), function (x) { return x.id; }); });
  var btnsB = await b.pg.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('#tp-rel-buttons button'), function (x) { return x.id; }); });
  var kidA = await a.pg.evaluate(function () { return window.TeamSync.pairState().then(function (s) { return s.device; }); });
  A('S0', enrolledB && btnsA.length === 5 && btnsA.indexOf('tp-rel-publish') >= 0, 'both devices are paired; the founder/admin sees all 5 Releases buttons', 'B enrolled=' + enrolledB + ' A=' + btnsA.join(','));
  A('S0', btnsB.length === 4 && btnsB.indexOf('tp-rel-publish') < 0, 'a non-admin device has NO Publish button (4 buttons)', 'B=' + btnsB.join(','));

  // ── K trusted keys ──
  var storeKeys = await a.pg.evaluate(function () { return window.TeamSync.store().planTrustInfo(); });
  await T.click(a, 'tp-rel-keys');
  var kr = await T.rows(a), kt = await T.attr(a, '#tp-keys-text', 'data-threshold');
  A('K', storeKeys && storeKeys.keys.length === 3 && kr.length === storeKeys.keys.length, 'the screen shows one row per key in the store (3)', 'rows=' + kr.length + ' store=' + (storeKeys && storeKeys.keys.length));
  A('K', kt && Number(kt.v) === storeKeys.threshold && storeKeys.threshold === THR && new RegExp('^' + storeKeys.threshold + ' of ' + storeKeys.keys.length + ' keys must sign').test(kt.t), 'the threshold shown (attribute AND sentence) equals the store\'s (2 of 3)', 'shown=' + (kt && kt.v) + ' store=' + (storeKeys && storeKeys.threshold) + ' text=' + (kt && kt.t));
  A('K', kr.map(function (r) { return r.role; }).join() === ['owner', 'rotate-only', 'publish'].join() && kr[1].rotate === 'true' && kr[1].publish === 'false' && kr[2].rotate === 'false' && kr[2].publish === 'true', 'roles and abilities per row equal the store\'s (owner, recovery rotates only, publisher publishes only)', kr.map(function (r) { return r.role + '/r' + r.rotate + '/p' + r.publish; }).join(' '));

  // ── R sync rules ──
  var polRes = await a.pg.evaluate(async function () { var S = window.TeamSync.store(), pol = await S.policy(), p = JSON.parse(JSON.stringify(pol ? pol.params : {})); p.epoch = (pol ? pol.epoch : 0) + 1; p.visit_ms = 60000; p.bundle_max_ops = 500; p.gate = { max_puts_per_hour: 120 }; p.checkpoint = { every_ops: 200 }; p.number_prefix = 'T';
    var op = await S.setPolicy(p), v = (await S.order()).verdict[op.hash]; return v.verdict; });
  await T.visit(a); await T.click(a, 'tp-rel-rules');
  var rr = await T.rows(a), keysShown = rr.map(function (r) { return r.key; }), polNow = await a.pg.evaluate(function () { return window.TeamSync.store().policy().then(function (p) { return { params: p.params, epoch: p.epoch }; }); });
  var want = { visit_ms: '1 min', bundle_max_ops: '500', 'gate.max_puts_per_hour': '120', 'checkpoint.every_ops': '200 operations', number_prefix: 'T' };
  A('R', polRes === 'MERGED' && Object.keys(want).every(function (k) { var r = rr.filter(function (x) { return x.key === k; })[0]; return r && r.value === want[k]; }), 'every rule the POLICY holds is shown with its value (visit period, bundle cap, write limit, checkpoint cadence, prefix)', JSON.stringify(rr.map(function (r) { return r.key + '=' + r.value; })));
  A('R', keysShown.indexOf('lease_ttl_ms') < 0 && keysShown.indexOf('gate.max_object_bytes') < 0 && keysShown.indexOf('min_v.CRUD_CREATE') < 0, 'a value the POLICY does not hold has NO row (nothing invented)', keysShown.join(','));
  var rh = await T.attr(a, '#tp-rules-head', 'data-epoch');
  A('R', rh && Number(rh.v) === polNow.epoch && (rr.filter(function (r) { return r.key === 'anchor'; })[0] || {}).value === 'not set', 'the epoch shown equals the policy\'s; the anchor reads "not set" before the administrator sets one', 'epoch shown=' + (rh && rh.v) + ' store=' + polNow.epoch);

  // ── O rollout ──
  await T.visit(b); await T.visit(a);
  await T.click(a, 'tp-rel-rollout');
  var fr0 = await a.pg.evaluate(function () { return window.TeamSync.store().frontier(); }), or0 = await T.rows(a), devs = await a.pg.evaluate(function () { return window.TeamSync.store().order().then(function (L) { return Object.keys(L.roster.devices).length; }); });
  var rowA = or0.filter(function (r) { return r.kid === kidA; })[0], rowB = or0.filter(function (r) { return r.kid !== kidA; })[0];
  A('O', or0.length === devs && devs === 2, 'one row per device in the roster (2)', 'rows=' + or0.length + ' roster=' + devs);
  A('O', rowA && Number(rowA['last-seen']) === fr0[kidA] && fr0[kidA] > 0, 'A\'s "last seen at op N" equals the store\'s frontier for A', 'shown=' + (rowA && rowA['last-seen']) + ' store=' + fr0[kidA]);
  var bBefore = fr0[rowB.kid] || 0;
  A('O', bBefore === 0 && rowB.heard === 'false' && /never heard from/.test(rowB.text), 'B has authored nothing yet: "never heard from" (N = 0)', rowB.text);
  var bop = await b.pg.evaluate(async function () { var S = window.TeamSync.store(); var r = await S.author({ target: { table: 'c_bpartner', uu: crypto.randomUUID() }, intent: 'K2', body: { op_type: 'CRUD_CREATE', params: { fields: { value: 'RS1', name: 'Releases screen test', ad_client_id: 11, ad_org_id: 11, isactive: 'Y' } } } }); return r.hash; });
  await T.visit(b); await T.visit(a); await T.click(a, 'tp-rel-rollout');
  var fr1 = await a.pg.evaluate(function () { return window.TeamSync.store().frontier(); }), or1 = await T.rows(a), rowB1 = or1.filter(function (r) { return r.kid === rowB.kid; })[0], head = await T.attr(a, '#tp-rollout-head', 'data-heard');
  A('O', !!bop && rowB1 && Number(rowB1['last-seen']) === fr1[rowB.kid] && fr1[rowB.kid] > bBefore && rowB1.heard === 'true', 'after B authors an op and Visits, B\'s row reads "last seen at op N" with N equal to the store\'s frontier', 'shown=' + (rowB1 && rowB1['last-seen']) + ' store=' + fr1[rowB.kid]);
  A('O', head && Number(head.v) === Object.keys(fr1).filter(function (k) { return fr1[k] > 0; }).length && /Heard from \d of 2 devices/.test(head.t), 'the header counts the devices heard from, computed from the store', head && head.t);

  // ── U updates, published through the Publish screen ──
  var DAY = 86400000, T0 = Date.UTC(2026, 9, 31), BASEH = null;
  function rb(id, v) { return Buffer.from('release bytes of ' + id + '@' + v + '\n'); }
  function ent(id, cur, over, withCl) { var bts = rb(id, cur); return Object.assign({ id: id, kind: 'plugin', current: cur, minimum: '1.0.0', status: 'update-available', hash: sha(bts), size: bts.length, carrier: 'pub', apply: 'none' },
    withCl === false ? {} : { changelog: { Added: [{ what: id + ' ' + cur + ' adds a thing', why: 'the team asked for it' }] } }, over || {}); }
  var eAlpha = ent('kw.alpha', '1.1.0', { changelog: { Added: [{ what: 'a new report', why: 'finance asked' }], Fixed: [{ what: 'rounding on credit notes', why: 'totals were 1 cent off', action: 'recheck open notes' }] } });
  var eBad = ent('kw.bad', '1.5.0', { status: 'withdrawn', reason: 'wrong totals on credit notes' }, false), eSame = ent('kw.same', '1.0.0', { status: 'current' }), eLate = ent('kw.late', '2.0.0'), eTam = ent('kw.tamper', '1.2.0');
  function listBody(n, entries, prev, over) { return Object.assign({ kind: 'update-list', space: space, number: n, prev: prev || null, signed_at: T0 + n * 1000, expires: T0 + 30 * DAY, caps: { list_entries: 64, list_bytes: 65536, release_bytes: 2097152, policy_upcaster_sets: 16 }, entries: entries }, over || {}); }
  var L1 = await signL(listBody(1, [eAlpha, eBad, eSame, eLate, eTam]), [Ko, Kp]);      // threshold 2: owner + publisher
  var f = function (name, buf) { return { name: name, mimeType: 'application/octet-stream', buffer: buf }; };
  await T.click(a, 'tp-rel-publish');
  var pub1 = await T.pub(a, [f('list1.json', Buffer.from(JSON.stringify(L1))), f('alpha.rel', rb('kw.alpha', '1.1.0')), f('tamper.rel', rb('kw.tamper', '1.2.0')), f('stray.rel', Buffer.from('matches no entry'))]);
  var objs1 = T.relayPub();
  A('U', pub1.ok && objs1.length === 3, 'the Publish screen puts the list and the 2 release files that match an entry (the stray file is not put)', pub1.reason + ' objects=' + objs1.length + ' ' + objs1.map(function (n) { return n.split('/').pop().slice(0, 22); }).join(' '));
  // the relay (the only party able to alter bytes) serves a different object under kw.tamper's right name
  var tamName = objs1.filter(function (n) { return n.indexOf('release-' + eTam.hash) >= 0; })[0]; if (tamName) fs.writeFileSync(path.join(FOLDER, tamName), 'TAMPERED bytes under the right name');
  await T.visit(a); await T.visit(b);
  await T.click(b, 'tp-rel-updates');
  var ur = await T.rows(b), ub = await T.attr(b, '#tp-upd-banner', 'data-out-of-date'), by = {}; ur.forEach(function (r) { by[r.id] = r; });
  var EXP = { 'kw.alpha': 'update-available', 'kw.bad': 'withdrawn', 'kw.same': 'current', 'kw.late': 'not-downloaded', 'kw.tamper': 'hash-mismatch' };
  A('U', ur.length === 5 && Object.keys(EXP).every(function (k) { return by[k] && by[k].state === EXP[k]; }), 'B\'s Updates screen shows 5 rows whose states equal the expected table (computed here, independently)', ur.map(function (r) { return r.id + ':' + r.state; }).join(' '));
  A('U', by['kw.bad'] && by['kw.bad'].yanked === 'true' && /\[YANKED\]/.test(by['kw.bad'].text) && /wrong totals on credit notes/.test(by['kw.bad'].text), 'the withdrawn row carries [YANKED] and its reason', by['kw.bad'] && by['kw.bad'].text.slice(0, 120));
  var clOf = function (id) { return (by[id] || {}).cl; };
  A('U', clOf('kw.alpha') === 2 && clOf('kw.same') === 1 && clOf('kw.bad') === 0 && !!by['kw.bad'], 'the "what changed and why" expander lists exactly the changelog lines of each entry (2 / 1 / 0)', 'alpha=' + clOf('kw.alpha') + ' same=' + clOf('kw.same') + ' bad=' + clOf('kw.bad'));
  var puts = await b.pg.evaluate(function () { return { installed: window.TEAM_INSTALLED, reg: (window.PluginEngine && window.PluginEngine._reg && window.PluginEngine._reg() && window.PluginEngine._reg().list().length) || 0 }; });
  A('U', JSON.stringify(puts.installed) === JSON.stringify({ 'kw.same': '1.0.0' }) && T.relayPub().length === 3 && b.logs.some(function (l) { return /§UPD_PICK number=1 rows=5 outOfDate=false/.test(l); }), 'nothing is applied by the screen: B\'s installed set is unchanged and it put nothing on the relay; §UPD_PICK says number=1 rows=5 outOfDate=false', JSON.stringify(puts));
  A('U', ub && ub.v === 'false' && !/out of date/.test(ub.t), 'no out-of-date banner while the anchor is within the list\'s life', ub && ub.v);
  // the administrator sets the time anchor: first the real "now", then (admin's assertion) 40 days on -> past `expires`
  await T.click(a, 'tp-rel-publish');
  // ── C anchor confirm (owner decision 2026-10-31): the exact moment is shown, nothing is signed until confirmed, cancel signs nothing ──
  var anch0 = await a.pg.evaluate(function () { return window.TeamSync.store().anchor(); }), relay0 = JSON.stringify(walk(FOLDER, '', []).sort());
  await a.pg.click('#tp-pub-anchor'); await sleep(500);
  var cf = await a.pg.evaluate(function () { var c = document.getElementById('tp-pub-confirm'); return { vis: !!c && c.style.display !== 'none', ts: Number(c && c.getAttribute('data-ts')), when: (document.getElementById('tp-anchor-when') || {}).textContent || '', warn: (document.getElementById('tp-anchor-warn') || {}).textContent || '', yes: !!document.getElementById('tp-anchor-yes'), no: !!document.getElementById('tp-anchor-no') }; });
  var anch1 = await a.pg.evaluate(function () { return window.TeamSync.store().anchor(); });
  var iso = function (t) { return new Date(t).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'; };
  A('C', cf.vis && cf.yes && cf.no && cf.ts > 0 && cf.when.indexOf(iso(cf.ts)) >= 0 && /can never be lowered/.test(cf.warn), 'clicking "Set the time anchor to now" opens an IN-PANEL confirm showing the exact date and time (to the second, UTC) and that a first anchor can never be lowered', JSON.stringify(cf).slice(0, 220));
  A('C', anch0 == null && anch1 == null && JSON.stringify(walk(FOLDER, '', []).sort()) === relay0, 'BEFORE confirming nothing is signed: the store anchor is still unset and the relay holds the same objects', 'anchor ' + anch0 + '->' + anch1);
  await a.pg.click('#tp-anchor-no'); await sleep(500);
  var cx = await a.pg.evaluate(function () { var c = document.getElementById('tp-pub-confirm'); return { hidden: c.style.display === 'none', res: document.getElementById('tp-pub-result').textContent }; }), anch2 = await a.pg.evaluate(function () { return window.TeamSync.store().anchor(); });
  A('C', cx.hidden && /Nothing was signed/.test(cx.res) && anch2 == null && JSON.stringify(walk(FOLDER, '', []).sort()) === relay0 && !a.logs.some(function (l) { return /§TEAM_ANCHOR /.test(l); }), 'Cancel signs nothing: confirm closed, anchor still unset, relay unchanged, no §TEAM_ANCHOR line', 'anchor=' + anch2 + ' ' + cx.res);
  await a.pg.click('#tp-pub-anchor'); await sleep(300);
  var shown = await a.pg.evaluate(function () { var c = document.getElementById('tp-pub-confirm'); return { ts: Number(c.getAttribute('data-ts')), when: document.getElementById('tp-anchor-when').textContent }; });
  await a.pg.click('#tp-anchor-yes'); await sleep(1500);
  var anch3 = await a.pg.evaluate(function () { return window.TeamSync.store().anchor(); });
  A('C', anch3 === shown.ts && shown.when.indexOf(iso(anch3)) >= 0 && a.logs.some(function (l) { return l.indexOf('§TEAM_ANCHOR ok=true') === 0; }), 'Confirm signs EXACTLY the moment that was shown: the anchor read from state equals the displayed time', 'shown=' + shown.ts + ' signed=' + anch3);
  await a.pg.evaluate(function (t) { Date.now = function () { return t; }; }, T0 + 40 * DAY);
  await a.pg.click('#tp-pub-anchor'); await sleep(300); await a.pg.click('#tp-anchor-yes'); await sleep(1500);
  var anchorA = await a.pg.evaluate(function () { return window.TeamSync.store().anchor(); });
  await T.visit(a); await T.visit(b); await T.click(b, 'tp-rel-updates');
  var ub2 = await T.attr(b, '#tp-upd-banner', 'data-out-of-date'), ur2 = await T.rows(b);
  A('U', anchorA === T0 + 40 * DAY && ub2 && ub2.v === 'true' && /out of date/.test(ub2.t) && ur2.length === 5, 'after the administrator\'s anchor passes `expires` the banner says out of date (advisory) and all 5 rows are STILL shown', 'anchor=' + anchorA + ' banner=' + (ub2 && ub2.v) + ' rows=' + ur2.length);
  var b40 = await b.pg.evaluate(function (t) { Date.now = function () { return t; }; return true; }, Date.UTC(2040, 0, 1));
  await T.click(b, 'tp-rel-updates'); var ub3 = await T.attr(b, '#tp-upd-banner', 'data-out-of-date');
  A('U', b40 && ub3 && ub3.v === 'true', 'CONTROL of the clock rule: B\'s own clock set to 2040 changes nothing (still judged by the administrator\'s anchor)', 'banner=' + (ub3 && ub3.v));
  // rules screen now shows the anchor as a date
  await T.click(a, 'tp-rel-rules'); var rr2 = await T.rows(a), anchorRow = rr2.filter(function (r) { return r.key === 'anchor'; })[0];
  A('R', anchorRow && /^2026-12-10 \(set by the administrator\)$/.test(anchorRow.value), 'Sync rules shows the anchor the administrator set', anchorRow && anchorRow.value);

  // ── P publish refusals ──
  await T.click(a, 'tp-rel-publish');
  var objsBefore = T.relayPub().length;
  var Lbad = JSON.parse(JSON.stringify(await signL(listBody(2, [eAlpha], L1 && await listHash(L1)), [Ko, Kp]))); Lbad.entries[0].current = '9.9.9';
  async function listHash(l) { return sha(canon(bodyOf(l))); }
  var p1 = await T.pub(a, [f('bad.json', Buffer.from(JSON.stringify(Lbad)))]);
  A('P', !p1.ok && p1.reason === 'list-signature', 'a list edited after signing is refused with the exact reason', p1.reason);
  var L2 = await signL(listBody(2, [eAlpha], await listHash(L1)), [Ko, Kp]), p2 = await T.pub(a, [f('l2.json', Buffer.from(JSON.stringify(L2)))]), objsAfter2 = T.relayPub().length;
  A('P', p2.ok && objsAfter2 === objsBefore + 1, 'CONTROL: a valid #2 (prev = #1\'s hash) is accepted and adds exactly one object', p2.reason + ' ' + objsBefore + '->' + objsAfter2);
  var p3 = await T.pub(a, [f('l1again.json', Buffer.from(JSON.stringify(L1)))]);
  A('P', !p3.ok && p3.reason === 'list-replayed' && T.relayPub().length === objsAfter2, 'publishing the older #1 again is refused list-replayed and adds nothing', p3.reason);
  var p4 = await T.pub(a, [f('one.json', Buffer.from(JSON.stringify(await signL(listBody(3, [eAlpha], await listHash(L2)), [Ko])))) ]);
  A('P', !p4.ok && p4.reason === 'list-threshold' && T.relayPub().length === objsAfter2, 'T=2: a list with ONE signature is refused list-threshold', p4.reason);
  var baseInfo = await a.pg.evaluate(function () { return window.TeamSync.store().baseInfo(); });
  if (!baseInfo) A('P', null, 'a base-changing entry is refused at Publish', 'the founded space has no base: the rule cannot be exercised here (W-UPDATE-LIST U3 covers it)');
  else { var eB = ent('kw.base', '3.0.0', { kind: 'release', base: { sha256: sha('another-base') } }), p5 = await T.pub(a, [f('b.json', Buffer.from(JSON.stringify(await signL(listBody(3, [eB], await listHash(L2)), [Ko, Kp]))))]);
    A('P', !p5.ok && /refused-base-change/.test(p5.reason), 'a base-changing entry is refused at Publish', p5.reason); }

  // ── G unsigned plugin badge (owner decision 2026-10-31): installs stay allowed unsigned; the panel marks them and a §PLUGIN_UNSIGNED line is printed ──
  var Cc = await device('C', 'GardenAdmin'), PURL = base + '/erp/plugins/wip_token.mjs';
  await Cc.pg.evaluate(function () { window.APP = window.APP || {}; window.APP.roleId = 0; window.APP.actor = window.APP.actor || 'SuperUser'; });   // the registry's own writer gate (W-PLUGIN-ROLE, witness_plugin_role) admits only System Administrator; this arm judges the badge, not that gate
  var openCard = async function () { await Cc.pg.evaluate(function () { var c = document.getElementById('pe-ov'); if (c) c.remove(); window.IdmpPillActions.plugin(); }); await Cc.pg.waitForSelector('#pe-url', { timeout: 20000 }); await sleep(800); };
  var badgeOf = function (id) { return Cc.pg.evaluate(function (i) { var rows = Array.prototype.slice.call(document.querySelectorAll('#pe-list .pe-row')).filter(function (r) { return r.querySelector('.pe-id').textContent.indexOf(i) === 0; }); return rows.length ? { n: rows.length, badge: rows[0].querySelectorAll('.pe-unsigned').length, text: (rows[0].querySelector('.pe-unsigned') || {}).textContent || '' } : null; }, id); };
  await openCard();
  await Cc.pg.fill('#pe-url', PURL); await Cc.pg.evaluate(function () { window.APP.roleId = 0; }); await Cc.pg.click('#pe-install'); await sleep(2500);
  var inst = await Cc.pg.evaluate(function (u) { return window.PluginEngine._reg().list().filter(function (b) { return b.url === u; })[0] || null; }, PURL);
  if (!inst) console.log('   [debug] ' + Cc.logs.filter(function (l) { return /PLUGIN|ROLE/.test(l); }).slice(-3).map(function (l) { return l.slice(0, 260); }).join(' || ') + ' errs=' + Cc.errs.join(';'));
  var bg = inst ? await badgeOf(inst.id) : null, ul = Cc.logs.filter(function (l) { return /^§PLUGIN_UNSIGNED /.test(l) && inst && l.indexOf('id=' + inst.id + ' ') >= 0; });
  A('G', !!inst && inst.signed === false && bg && bg.n === 1 && bg.badge === 1 && bg.text === 'unsigned', 'a plugin installed through the Plugins panel (no signature) is ALLOWED and its row shows a visible "unsigned" badge; the registry reports signed=false', JSON.stringify({ inst: inst && { id: inst.id, state: inst.state, signed: inst.signed }, bg: bg }));
  A('G', ul.length === 1 && ul[0] === '§PLUGIN_UNSIGNED id=' + inst.id + ' version=' + inst.version + ' source=' + PURL, 'exactly one §PLUGIN_UNSIGNED id=<id> version=<v> source=<url> line was printed at install', ul.join(' | '));
  await Cc.pg.evaluate(function (id) { var R = window.PluginEngine._reg(), orig = R.list; R.list = function () { return orig.call(R).map(function (b) { return b.id === id ? Object.assign({}, b, { signed: true }) : b; }); }; }, inst.id);
  await openCard(); var bg2 = await badgeOf(inst.id);
  A('G', bg2 && bg2.n === 1 && bg2.badge === 0, 'CONTROL: the same row, reported as signed by the registry (signed=true), shows NO badge (the real signed/accepted path is witnessed in witness_team_keys B1)', JSON.stringify(bg2));

  // ── T twin ──
  var AD1 = await T.adCounts(a), AD1b = await T.adCounts(b), ADb0 = AD0;
  A('T', JSON.stringify(AD1) === JSON.stringify(ADb0) && JSON.stringify(AD1b) === JSON.stringify(ADb0), 'the AD dictionary (windows, tabs, fields, processes, menus, document-action access) has IDENTICAL row counts before and after every screen was opened and used, on both devices', JSON.stringify(AD1));
  var src = fs.readFileSync(path.join(ROOT, 'common/comm/team_releases.js'), 'utf8').replace(/\/\/[^\n]*\n/g, '\n');
  A('T', !/\b(ad_window|ad_tab|ad_field|ad_process|ad_table|ad_column|ad_menu|c_order|c_invoice|m_product|docaction|DocAction)\b/i.test(src), 'the screens\' source names no AD table, window or DocAction', '');
  A('T', errors === 0, '0 page errors across both devices', 'errors=' + errors);

  var red = Object.keys(ARMS).filter(function (k) { return ARMS[k] > 0 && k[0] !== '~'; }), incon = Object.keys(ARMS).filter(function (k) { return k[0] === '~'; });
  console.log('§RS_ARMS red=' + (red.length ? red.join(',') : 'none') + ' judged=' + judged + (incon.length ? ' inconclusive=' + incon.join(',') : ''));
  await browser.close(); server.close(); fs.rmSync(FOLDER, { recursive: true, force: true });
  if (QUIET) process.exit(red.length ? 1 : 0);
  if (red.length) { console.log('§RS_VERDICT FAIL judged=' + judged + ' red=' + red.join(',') + ' mutants=NOT RUN (the base run is red)'); process.exit(1); }
  if (process.env.RS_NO_MUT) { console.log('§RS_VERDICT ' + (incon.length ? 'INCONCLUSIVE' : 'PASS') + ' judged=' + judged + ' mutants=skipped'); process.exit(0); }
  var SRC = fs.readFileSync(path.join(ROOT, 'common/comm/team_releases.js'), 'utf8'), SYNC = fs.readFileSync(path.join(ROOT, 'erp/team_sync.js'), 'utf8');
  var M = [
    ['last key row dropped', '/common/comm/team_releases.js', SRC, 'var rows = info.keys.map(', 'var rows = info.keys.slice(0, -1).map(', ['K']],
    ['threshold shown as 1', '/common/comm/team_releases.js', SRC, "text: info.threshold + ' of '", "text: '1 of '", ['K']],
    ['threshold attribute wrong', '/common/comm/team_releases.js', SRC, "data-threshold=\"' + esc(m.threshold)", "data-threshold=\"' + esc(1)", ['K']],
    ['last-seen taken from the wrong device', '/common/comm/team_releases.js', SRC, 'var n = fr[d.kid] || 0;', 'var n = fr[(v.devices[0] || {}).kid] || 0;', ['O']],
    ['withdrawn rows dropped', '/common/comm/team_releases.js', SRC, "var rows = (u.rows || []).map(", "var rows = (u.rows || []).filter(function (r) { return r.state !== 'withdrawn'; }).map(", ['U']],
    ['changelog expander shows only the first line', '/common/comm/team_releases.js', SRC, 'var cl = []; if (r.changelog) Object.keys(r.changelog).forEach(function (sec) { (r.changelog[sec] || []).forEach(', 'var cl = []; if (r.changelog) Object.keys(r.changelog).slice(0, 1).forEach(function (sec) { (r.changelog[sec] || []).slice(0, 1).forEach(', ['U']],
    ['anchor signed without confirming', '/common/comm/team_releases.js', SRC, "cbox.setAttribute('data-ts', String(t)); cbox.style.display = 'block';", "cbox.setAttribute('data-ts', String(t)); cbox.style.display = 'block'; host.anchor(t);", ['C']],
    ['cancel still signs', '/common/comm/team_releases.js', SRC, "cbox.querySelector('#tp-anchor-no').onclick = function () { closeConfirm();", "cbox.querySelector('#tp-anchor-no').onclick = function () { host.anchor(t); closeConfirm();", ['C']],
    ['confirm signs a different moment than shown', '/common/comm/team_releases.js', SRC, 'var r = await host.anchor(t);', 'var r = await host.anchor(t + 5000);', ['C']],
    ['unsigned badge hidden', '/erp/plugin_overlay.js', fs.readFileSync(path.join(ROOT, 'erp/plugin_overlay.js'), 'utf8'), "(b.signed ? '' : '<span class=\"pe-chip pe-unsigned\"", "(true ? '' : '<span class=\"pe-chip pe-unsigned\"", ['G']],
    ['unsigned log line not printed', '/erp/plugin_registry.js', fs.readFileSync(path.join(ROOT, 'erp/plugin_registry.js'), 'utf8'), "if (!signedOk) console.log('§PLUGIN_UNSIGNED", "if (false) console.log('§PLUGIN_UNSIGNED", ['G']],
    ['Publish shown to a non-admin', '/common/comm/team_releases.js', SRC, "return s[0] !== 'publish' || v.admin;", 'return true;', ['S0']],
    ['out-of-date banner reads the device clock', '/common/comm/team_releases.js', SRC, "(u.outOfDate ? ' Update list is out of date: connect to check.' : '')", "(Date.now() > 0 && u.list.expires < Date.now() ? ' Update list is out of date: connect to check.' : '')", ['U']],
    ['Publish skips verification', '/erp/team_sync.js', SYNC, 'var ctx = await ctxFor(), r = await TUp().publish(pipe, cfg.space, dev.kid, lists[0], ctx);', 'var ctx = await ctxFor(), r = { ok: true, hash: "x", name: "s/" + cfg.space + "/pub/" + dev.kid + "/update-list-" + ("00000000" + lists[0].number).slice(-8) + ".json" }; await pipe.put(r.name, new TextEncoder().encode(JSON.stringify(lists[0])));', ['P']],
    ['the screen touches an AD table', '/common/comm/team_releases.js', SRC, "console.log('§TEAM_RELEASES opened admin='", "try { window.__idmpDb.run(\"UPDATE ad_menu SET isactive='N' WHERE ad_menu_id=-1\"); window.__idmpDb.run(\"DELETE FROM ad_menu WHERE ad_menu_id IN (SELECT ad_menu_id FROM ad_menu LIMIT 1)\"); } catch (e) {} console.log('§TEAM_RELEASES opened admin='", ['T']]
  ];
  var killed = 0, muts = [];
  for (var mi = 0; mi < M.length; mi++) { var m = M[mi];
    if (m[2].split(m[3]).length !== 2) { console.log('   🔴 mutant ' + m[0] + ': MUTATION DID NOT APPLY'); muts.push(0); continue; }
    var tmp = path.join(os.tmpdir(), 'rs_mut_' + process.pid + '_' + mi + '.js'); fs.writeFileSync(tmp, m[2].replace(m[3], m[4]));
    var k = cp.spawnSync(process.execPath, [__filename], { encoding: 'utf8', timeout: 1500000, env: Object.assign({}, process.env, { RS_ONLY_ARMS: '1', RS_MUT_FILE: tmp, RS_MUT_PATH: m[1] }) }); fs.unlinkSync(tmp);
    var mm = /§RS_ARMS red=(\S+)/.exec(k.stdout || ''), reds = mm && mm[1] !== 'none' ? mm[1].split(',') : [], hit = !!mm && m[5].some(function (e) { return reds.indexOf(e) >= 0; }); if (hit) killed++;
    console.log('   ' + (hit ? '🟢' : '🔴') + ' mutant ' + m[0] + ' -> ' + (mm ? 'red=' + (reds.join(',') || 'none') : 'CRASHED (not a kill) ' + String(k.stderr || k.stdout).split('\n').slice(-3).join(' ')) + ' (expected ' + m[5].join('|') + ')'); }
  var verdict = killed !== M.length ? 'FAIL' : (incon.length ? 'INCONCLUSIVE' : 'PASS');
  console.log('§RS_VERDICT ' + verdict + ' judged=' + judged + ' mutants=' + killed + '/' + M.length + (incon.length ? ' inconclusive=' + incon.join(',') : ''));
  process.exit(verdict === 'FAIL' ? 1 : 0);
})().catch(function (e) { console.log('§RS_CRASH ' + (e && e.stack || e)); process.exit(2); });
