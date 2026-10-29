#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-TEAM-UI-POS, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §44 (C1 the plan at "Start a team", C2 "Bound to" in the Approve dialog). READ THE LOG after every run — the exit code is not evidence.
//   THE ISSUE (§43): the POS plan was chosen only by `?teamplan=pos` in the founder's address, and a till / phone was bound to its branch / customer only by calling TeamSync.approve(request, role, record) from the console.
//   This witness drives the REAL Team panel (the buttons, the radios, the lists) in headless Chromium on one dumb folder pipe. No TeamSync.found / approve call is made by the witness for the arms it judges: the panel makes them.
//   U1   the founder picks "Point-of-sale team" in the panel (page opened WITHOUT ?teamplan) -> the signed genesis carries plan='pos' and a second device, which was told nothing, reads the same.
//   U1b  `?teamplan=pos` only PRE-SELECTS the radio (it is not a second mechanism): the founder can still pick Office.
//   U2   the admin approves a till as Web Service Execution (50004), Bound to = Store North -> the roster person's person_uu = that org's AD_Org_UU, and the till then receives ONLY its branch's movement.
//   U3   a borrower bound to a Business Partner receives its loan and nothing of another borrower's (the SAME role, a different record type: the picker offers both and the choice decides).
//   U4   an OFFICE team shows no "Bound to" for any role (and no plan choice on a host whose plan list has one entry).
//   U5   the founded team shows its plan read-only (no radios), on the founder and on a joined device.
//   U6   the choices come from the plans the page loaded: with no POS plan file there is no plan choice at all.
//   U7   an empty binding, where the plan needs one, is refused with a plain message and nothing is sent (the request stays pending).
//   U8   "Bound to" is absent for a role with no `by` rows (the processor role 102) in a POS team.
//   U9   "Who is on what" shows the bound record by name next to the person.
//   U10  a record created THIS SESSION (one signed op, not in the shipped bundle) is offered in Bound to, and binding it writes its _uu.
//   U11  0 page errors, 0 console 🔴.
//   MUTANTS (each served from a copy; the child prints §UIP_ARMS red=...; a crashed child is NOT a kill): the choice ignored (always office) · the plan list hand-coded · the binding not written · "Bound to" shown for a role without `by` rows · the picker reads the bare bundle (not the tip) · the picker's record types hand-coded (organisation only).
// Run: UIP_NO_MUT=1 skips the mutants.   node erp/tests/witness_team_ui_pos.js 2>&1 | tee /tmp/witness_team_ui_pos.log
'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), vm = require('vm'), nodeCrypto = require('crypto');
var ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var subtle = nodeCrypto.webcrypto.subtle, fails = 0, judged = 0, errors = 0, reds = 0, ARMS = {}, QUIET = !!process.env.UIP_ONLY_ARMS;
function verdict(arm, ok, label, detail) { judged++; ARMS[arm] = ARMS[arm] || 0; if (!ok) { fails++; ARMS[arm]++; } if (!QUIET) console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + arm + ' ' + label + (detail ? ' — ' + detail : '')); return ok; }
function walk(d, rel, out) { if (!fs.existsSync(d)) return out; fs.readdirSync(d).forEach(function (n) { var p = path.join(d, n), r = rel ? rel + '/' + n : n; if (fs.statSync(p).isDirectory()) walk(p, r, out); else out.push(r); }); return out; }
function canon(o) { if (o === null || typeof o !== 'object') return JSON.stringify(o); if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']'; return '{' + Object.keys(o).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(o[k]); }).join(',') + '}'; }
async function mkKey() { var kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']), j = await subtle.exportKey('jwk', kp.publicKey); return { priv: kp.privateKey, pub: { kty: j.kty, crv: j.crv, x: j.x, y: j.y } }; }
async function signObj(obj, key) { var b = JSON.parse(JSON.stringify(obj)); delete b.sig; delete b.signer; var s = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.priv, new TextEncoder().encode(canon(b))); var o = JSON.parse(JSON.stringify(b)); o.signer = key.pub; o.sig = Buffer.from(s).toString('hex'); return o; }
function loadPlan(file, g) { var o = {}; vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window: o, globalThis: o }); return o[g]; }
var OFFICE = loadPlan(path.join(ROOT, 'erp', 'team_plan.js'), 'TEAM_PLAN'), POSPLAN = loadPlan(path.join(ROOT, 'erp', 'team_plan_pos.js'), 'TEAM_PLAN_POS');
var planJs = function (name, o) { return '(function (g) { g.' + name + ' = ' + JSON.stringify(o) + '; })(typeof window !== \'undefined\' ? window : globalThis);\n'; };
var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
var TILL = 50004, HQ = 102, SRC = {};
['erp/team_sync.js', 'common/comm/team_scope.js', 'common/comm/team_panel.js', 'common/comm/team_people_ui.js', 'erp/idempiere.html'].forEach(function (f) { SRC['/' + f] = fs.readFileSync(path.join(ROOT, f), 'utf8'); });

(async function () {
  if (!QUIET) console.log('═══ W-TEAM-UI-POS — the plan at "Start a team" and "Bound to" in Approve, through the real Team panel (§44) ═══\n');
  var FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'team-ui-pos-')), cur = { plans: {}, over: {} };
  if (process.env.UIP_MUT_TARGET) cur.over[process.env.UIP_MUT_TARGET] = fs.readFileSync(process.env.UIP_MUT_FILE, 'utf8');
  var server = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
    if (p === '/pipe/list') { var pre = u.searchParams.get('prefix') || ''; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(walk(FOLDER, '', []).filter(function (n) { return n.indexOf(pre) === 0; }))); return; }
    if (p.indexOf('/pipe/f/') === 0) { var fp = path.join(FOLDER, p.slice(8)); if (fp.indexOf(FOLDER) !== 0) { res.writeHead(400); res.end(); return; }
      if (req.method === 'PUT') { var ch = []; req.on('data', function (c) { ch.push(c); }); req.on('end', function () { fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, Buffer.concat(ch)); res.writeHead(200); res.end('ok'); }); return; }
      if (!fs.existsSync(fp)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); return; }
    var over = { '/erp/team_plan.js': cur.plans.office, '/erp/team_plan_pos.js': cur.plans.pos }[p] || cur.over[p];
    if (over) { res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'text/javascript' }); res.end(over); return; }
    var f = path.join(ROOT, p === '/' ? '/erp/idempiere.html' : p);
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port, PIPE = base + '/pipe';
  var browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] });
  var owner = await mkKey(); cur.plans.office = planJs('TEAM_PLAN', await signObj(OFFICE, owner)); cur.plans.pos = planJs('TEAM_PLAN_POS', await signObj(POSPLAN, owner));
  var xcfg = encodeURIComponent(Buffer.from(JSON.stringify({ trust: [owner.pub] })).toString('base64'));

  async function device(name, opt) {
    opt = opt || {}; var ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } }), pg = await ctx.newPage(), logs = [], errs = [];
    if (opt.noPosPlan) await ctx.route('**/erp/team_plan_pos.js*', function (r) { r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* no POS plan on this deployment */' }); });
    pg.on('console', function (m) { var t = m.text(); logs.push(t); if (/🔴/.test(t)) reds++; }); pg.on('pageerror', function (e) { errs.push(e.message); errors++; });
    await pg.addInitScript(function () { var q = new URLSearchParams(location.search).get('xcfg'); if (q) { var c = JSON.parse(atob(q)); window.TEAM_PLAN_TRUST = c.trust; } });
    await pg.goto(base + '/erp/idempiere.html?login=GardenAdmin&window=281&team=1&pipe=' + encodeURIComponent(PIPE) + '&xcfg=' + xcfg + (opt.extra || ''), { waitUntil: 'load' });
    await pg.waitForFunction(function () { return window.TeamSync && window.TeamPanel && window.__idmpDb && window.__crud && window.__idmpDb.exec('SELECT count(*) FROM ad_table')[0].values[0][0] > 0; }, null, { timeout: 180000 });
    await pg.evaluate(function () { return window.TeamSync.ready; });
    return { name: name, pg: pg, logs: logs, errs: errs, ctx: ctx };
  }
  // ── the panel, through its own controls ──
  var P = {
    open: async function (d) { await d.pg.evaluate(function () { return window.TeamPanel.open(); }); await d.pg.waitForSelector('#tp-pairsec', { state: 'visible', timeout: 20000 }); await d.pg.waitForFunction(function () { return /Start a team|Paired|Waiting for approval/.test(document.getElementById('tp-pairsec').textContent); }, null, { timeout: 20000 }); },
    close: async function (d) { await d.pg.evaluate(function () { var b = document.getElementById('tp-close'); if (b) b.click(); }); },
    choices: function (d) { return d.pg.evaluate(function () { return [].map.call(document.querySelectorAll('#tp-pairsec input[name=tp-plan]'), function (r) { var l = r.closest('label'); return { id: r.value, checked: r.checked, label: l ? l.textContent.trim() : '' }; }); }); },
    planLine: function (d) { return d.pg.evaluate(function () { var e = document.getElementById('tp-plan'); return e ? e.textContent.trim() : null; }); },
    found: async function (d, planId) { if (planId && (await d.pg.locator('#tp-pairsec input[name=tp-plan][value=' + planId + ']').count())) await d.pg.locator('#tp-pairsec input[name=tp-plan][value=' + planId + ']').check(); await d.pg.locator('#tp-found').click(); await d.pg.waitForSelector('#tp-paired', { timeout: 60000 }); },
    // approve through the dialog: returns what the row offered; choose = the visible text of the Bound to option ('' = leave empty)
    approve: async function (a, code, role, choose, pending) {
      var out = { bound: false, groups: [], options: [], msg: null };
      if (!(await a.pg.locator('#tp-req').count())) await P.open(a);
      await a.pg.locator('#tp-req').click();
      var row = a.pg.locator('.tp-request', { has: a.pg.locator('.tp-rcode', { hasText: code }) }); if (!(await row.waitFor({ timeout: 8000 }).then(function () { return true; }, function () { return false; }))) { out.msg = 'NO-REQUEST-ROW'; return out; }
      await row.locator('.tp-role').selectOption(String(role));
      await a.pg.waitForFunction(function (c) { var r = [].filter.call(document.querySelectorAll('.tp-request'), function (x) { return x.querySelector('.tp-rcode').textContent === c; })[0]; return r && r.getAttribute('data-bound-for') !== null; }, code, { timeout: 20000 }).catch(function () {});
      await sleep(400);
      out.bound = (await row.locator('.tp-bound').count()) > 0;
      if (out.bound) { out.groups = await row.locator('.tp-bound optgroup').evaluateAll(function (g) { return g.map(function (x) { return x.label; }); }); out.options = await row.locator('.tp-bound option').evaluateAll(function (o) { return o.map(function (x) { return x.textContent; }); });
        if (choose) await row.locator('.tp-bound').selectOption({ label: choose }, { timeout: 5000 }).catch(function (e) { out.msg = 'SELECT-FAILED ' + String(e.message).split('\n')[0]; }); }
      await row.locator('.tp-approve').click(); await sleep(1200);
      out.msg = out.msg || await a.pg.evaluate(function () { var e = document.querySelector('#tp-reqs .tp-err'); return e ? e.textContent : null; });
      return out;
    }
  };
  var T = {
    code: function (d) { return d.pg.evaluate(async function () { return (await window.TeamSync.pairState()).code; }); },
    kid: function (d) { return d.pg.evaluate(async function () { return (await window.TeamSync.pairState()).device; }); },
    invite: function (d) { return d.pg.evaluate(async function () { return (await window.TeamSync.pairState()).space; }); },
    join: function (d, space) { return d.pg.evaluate(function (sp) { return window.TeamSync.join(sp); }, space); },
    visit: function (d) { return d.pg.evaluate(async function () { var v = await window.TeamSync.visit(); return v && v.replicaIn; }); },
    enrolled: function (d) { return d.pg.evaluate(async function () { return (await window.TeamSync.pairState()).enrolled; }); },
    settle: async function (devs, who) { for (var i = 0; i < 6; i++) { for (var d of devs) await T.visit(d); if (await T.enrolled(who)) return true; await sleep(300); } return false; },
    roster: function (d, kid) { return d.pg.evaluate(async function (k) { var R = (await window.TeamSync.store().order()).roster, dv = R.devices[k]; return { plan: R.plan || null, person: dv ? dv.person : null, role: dv ? R.roleAt(k, Infinity).ad_role_id : null }; }, kid); },
    kind: function (d) { return d.pg.evaluate(function () { return window.TeamScope.kind(); }); },
    create: function (d, table, fields) { return d.pg.evaluate(function (a) { return new Promise(function (res) { var once = function (e) { if (e.detail && String(e.detail.table).toLowerCase() === a.t) { window.removeEventListener('overlay:committed', once); res(e.detail.createdId); } }; window.addEventListener('overlay:committed', once); window.__crud.applyOp({ op_type: 'CRUD_CREATE', key: a.t, table: a.t, verb: 'create', fields: a.f }); setTimeout(function () { res(null); }, 8000); }); }, { t: table, f: fields }); },
    rows: function (d, sql) { return d.pg.evaluate(function (q) { return new Promise(function (res) { window.__crud.modelRun({ table: 'c_order', timing: 'PROCESS', fn: function (trx) { res(trx.q(q)); return { ok: true }; } }, function () {}); }); }, sql); },
    db: function (d, sql) { return d.pg.evaluate(function (q) { var r = window.__idmpDb.exec(q); return r.length ? r[0].values : []; }, sql); }
  };
  var tag = String(Math.floor(Math.random() * 9000) + 1000);

  // ═══ U6 first: a deployment WITHOUT the POS plan file offers no plan choice (the list comes from the plans loaded) ═══
  if (!QUIET) console.log('§U6 a page with no POS plan file');
  var Dn = await device('Dn', { noPosPlan: true }); await P.open(Dn);
  var chN = await P.choices(Dn);
  verdict('U6', chN.length === 0 && (await Dn.pg.locator('#tp-found').count()) === 1, 'no POS plan loaded -> no plan choice is offered (Start a team is the same button as before)', JSON.stringify(chN));
  await Dn.ctx.close();

  // ═══ U4 + U5(office): an OFFICE team ═══
  if (!QUIET) console.log('§U4 an OFFICE team (default choice), then a join request approved as 50004');
  var Ao = await device('Ao'), Bo = await device('Bo'); await P.open(Ao);
  var chO = await P.choices(Ao);
  verdict('U1', chO.length === 2 && chO[0].id === 'office' && chO[0].checked && chO[1].id === 'pos' && !chO[1].checked && /Office team/.test(chO[0].label) && /Point-of-sale team/.test(chO[1].label), 'the panel offers Office team (default) and Point-of-sale team at Start a team', JSON.stringify(chO));
  await P.found(Ao); var spO = await T.invite(Ao); await T.join(Bo, spO);
  var rosterO = await T.roster(Ao, await T.kid(Ao));
  verdict('U4', rosterO.plan === null || rosterO.plan === 'office', 'the Office choice writes no POS plan to the genesis (the roster reads office)', JSON.stringify(rosterO));
  var apO = await P.approve(Ao, await T.code(Bo), TILL, null);
  verdict('U4', apO.bound === false, 'an OFFICE team: role 50004 shows NO "Bound to"', JSON.stringify(apO));
  await T.settle([Bo, Ao], Bo);
  verdict('U4', (await T.enrolled(Bo)) && (await T.kind(Bo)) === 'office', 'the office device was approved without a binding and reads the office plan', 'kind=' + (await T.kind(Bo)));
  verdict('U5', (await P.planLine(Ao) || '').indexOf('Office team') >= 0 && (await P.choices(Ao)).length === 0, 'the founded OFFICE team shows its plan read-only on the founder', String(await P.planLine(Ao)));
  await Ao.ctx.close(); await Bo.ctx.close();

  // ═══ U1b: ?teamplan=pos only pre-selects ═══
  var Ap = await device('Ap', { extra: '&teamplan=pos' }); await P.open(Ap); var chP = await P.choices(Ap);
  verdict('U1', chP.length === 2 && chP[1].id === 'pos' && chP[1].checked && !chP[0].checked, '?teamplan=pos in the address only PRE-SELECTS Point-of-sale team; both choices are still there (U1b)', JSON.stringify(chP));
  await Ap.ctx.close();

  // ═══ the POS team, all through the panel ═══
  if (!QUIET) console.log('§U1 a POS team: founder picks Point-of-sale team in the panel (no ?teamplan)');
  var A = await device('A'), B = await device('B'), C = await device('C'), D = await device('D'); await P.open(A);
  await P.found(A, 'pos'); var space = await T.invite(A), aKid = await T.kid(A), rosterA = await T.roster(A, aKid);
  verdict('U1', rosterA.plan === 'pos' && (await T.kind(A)) === 'pos', 'the founder chose Point-of-sale team in the panel: the signed genesis carries plan=pos and the founder reads it', JSON.stringify(rosterA));
  for (var d of [B, C, D]) await T.join(d, space);
  var orgs = await T.db(A, "SELECT ad_org_id, ad_org_uu, name FROM ad_org WHERE ad_org_id IN (50002, 50004) ORDER BY ad_org_id");
  var bps = await T.db(A, "SELECT c_bpartner_id, c_bpartner_uu, name FROM c_bpartner WHERE ad_client_id=11 AND iscustomer='Y' AND c_bpartner_uu IS NOT NULL AND c_bpartner_id<>(SELECT c_bpartnercashtrx_id FROM ad_clientinfo WHERE ad_client_id=11) ORDER BY c_bpartner_id LIMIT 2");

  // U7 + U8 first, on B's request: role 102 (no by rows) shows nothing; role 50004 with no choice is refused and stays pending
  var bCode = await T.code(B), cCode = await T.code(C), dCode = await T.code(D);
  await P.open(A); await A.pg.locator('#tp-req').click(); await A.pg.locator('.tp-request').first().waitFor({ timeout: 20000 });
  var row8 = A.pg.locator('.tp-request', { has: A.pg.locator('.tp-rcode', { hasText: bCode }) });
  await row8.locator('.tp-role').selectOption('102'); await sleep(900);
  verdict('U8', (await row8.locator('.tp-bound').count()) === 0, 'a POS team, role 102 (the processor): the plan has no `by` rows for it -> NO "Bound to"', 'bound controls=' + (await row8.locator('.tp-bound').count()));
  await row8.locator('.tp-role').selectOption(String(TILL)); await sleep(900);
  var shown7 = (await row8.locator('.tp-bound').count()) > 0, groups7 = shown7 ? await row8.locator('.tp-bound optgroup').evaluateAll(function (g) { return g.map(function (x) { return x.label; }); }) : [];
  await row8.locator('.tp-approve').click(); await sleep(1200);
  var msg7 = await A.pg.evaluate(function () { var e = document.querySelector('#tp-reqs .tp-err'); return e ? e.textContent : null; });
  await T.visit(A); var pend7 = await A.pg.evaluate(async function () { return (await window.TeamSync.requests()).length; }), enrolled7 = await T.enrolled(B);
  verdict('U7', shown7 && !!msg7 && /bound|Bound/.test(msg7) && !enrolled7 && pend7 >= 3, 'role 50004 with "Bound to" left empty is REFUSED with a plain message and nothing is sent (request still pending, device not enrolled)', 'msg=' + JSON.stringify(msg7) + ' pending=' + pend7);
  verdict('U2', shown7 && groups7.length === 2 && groups7.indexOf('Organization') >= 0 && groups7.indexOf('Business Partner') >= 0, 'role 50004 offers "Bound to" with the record types the plan addresses, named by the dictionary: ' + JSON.stringify(groups7), JSON.stringify(groups7));
  await P.close(A);

  // U2: the till, bound to Store North through the dialog
  if (!QUIET) console.log('§U2 the till bound to Store North through the Approve dialog');
  var northName = orgs[0][2], southName = orgs[1][2];
  var apB = await P.approve(A, bCode, TILL, northName, true);
  await T.settle([B, A], B);
  var rB = await T.roster(A, await T.kid(B));
  console.log('   §UIP_OPTIONS groups=' + JSON.stringify(apB.groups) + ' options=' + apB.options.length + ' first=' + JSON.stringify(apB.options.slice(0, 6)));
  verdict('U2', (await T.enrolled(B)) && rB.person === orgs[0][1] && rB.role === TILL, 'Approve with Bound to = "' + northName + '" wrote the till\'s person_uu = that org\'s AD_Org_UU (' + String(orgs[0][1]).slice(0, 8) + ') at role 50004', JSON.stringify(rB));
  var mvN = await T.create(A, 'm_movementline', { ad_client_id: 11, ad_org_id: 11, m_product_id: 123, qtyentered: 13, c_uom_id: 100, m_locator_id: 101, m_locatorto_id: 50002, description: 'replenish North ' + tag });
  var mvS = await T.create(A, 'm_movementline', { ad_client_id: 11, ad_org_id: 11, m_product_id: 130, qtyentered: 17, c_uom_id: 100, m_locator_id: 101, m_locatorto_id: 50003, description: 'replenish South ' + tag });
  for (var r = 0; r < 3; r++) for (var d1 of [A, B]) await T.visit(d1);
  var mvq = "SELECT m_locatorto_id AS l FROM m_movementline WHERE qtyentered IN (13, 17) ORDER BY 1", mvBr = await T.rows(B, mvq), mvAr = await T.rows(A, mvq);
  verdict('U2', mvAr.length === 2 && mvBr.length === 1 && Number(mvBr[0].l) === 50002, 'the till bound through the dialog holds ONLY its branch\'s movement (locator 50002); the processor made two; 0 of South\'s reached it', 'processor=' + JSON.stringify(mvAr) + ' till=' + JSON.stringify(mvBr));

  // U3: a borrower bound to a Business Partner, same role
  if (!QUIET) console.log('§U3 a borrower bound to a Business Partner through the Approve dialog (same role 50004)');
  var apC = await P.approve(A, cCode, TILL, bps[0][2], true);
  await T.settle([C, A], C);
  var rC = await T.roster(A, await T.kid(C));
  verdict('U3', (await T.enrolled(C)) && rC.person === bps[0][1], 'Approve with Bound to = "' + bps[0][2] + '" wrote the borrower\'s person_uu = that C_BPartner_UU (' + String(bps[0][1]).slice(0, 8) + ')', JSON.stringify(rC));
  var nA = 'LN-A-' + tag, nB = 'LN-B-' + tag;
  var invA = await T.create(A, 'c_invoice', { ad_client_id: 11, ad_org_id: 11, c_bpartner_id: bps[0][0], documentno: nA, grandtotal: 228.85, dateinvoiced: '2026-10-28 00:00:00', issotrx: 'Y', description: 'secret of A' });
  var invB = await T.create(A, 'c_invoice', { ad_client_id: 11, ad_org_id: 11, c_bpartner_id: bps[1][0], documentno: nB, grandtotal: 100, dateinvoiced: '2026-10-28 00:00:00', issotrx: 'Y', description: 'secret of B' });
  for (var r2 = 0; r2 < 3; r2++) for (var d2 of [A, B, C]) await T.visit(d2);
  var cq = await T.rows(C, "SELECT documentno AS d FROM c_invoice WHERE documentno IN ('" + nA + "','" + nB + "')"), bq = await T.rows(B, "SELECT documentno AS d FROM c_invoice WHERE documentno IN ('" + nA + "','" + nB + "')");
  verdict('U3', invA != null && invB != null && cq.length === 1 && cq[0].d === nA && bq.length === 0, 'the borrower holds ITS loan (' + nA + ') and 0 of the other borrower\'s (' + nB + '); the till holds neither', JSON.stringify({ borrower: cq, till: bq }));

  // U10 + U9: a record made this session is offered; "Who is on what" names the bound record
  if (!QUIET) console.log('§U10 a record created this session is offered in Bound to');
  var newName = 'Session Borrower ' + tag;
  var newBp = await T.create(A, 'c_bpartner', { ad_client_id: 11, ad_org_id: 0, value: 'SB' + tag, name: newName, iscustomer: 'Y', isactive: 'Y', c_bp_group_id: 104 });
  var apD = await P.approve(A, dCode, TILL, newName, true);
  await T.settle([D, A], D);
  var rD = await T.roster(A, await T.kid(D)), newUu = await T.rows(A, "SELECT c_bpartner_uu AS u FROM c_bpartner WHERE c_bpartner_id=" + newBp);
  console.log('   §UIP_NEWBP id=' + newBp + ' offered=' + (apD.options.indexOf(newName) >= 0) + ' uu=' + JSON.stringify(newUu) + ' person=' + JSON.stringify(rD.person));
  verdict('U10', newBp != null && apD.options.indexOf(newName) >= 0, '"' + newName + '" (created this session by one signed op, not in the shipped bundle) is offered in Bound to', 'offered=' + (apD.options.indexOf(newName) >= 0) + ' created=' + newBp);
  verdict('U10', !!rD.person && newUu.length === 1 && newUu[0].u === rD.person, 'binding it wrote the person_uu = that record\'s _uu', JSON.stringify([newUu, rD]));
  await P.close(A); await T.visit(A); await P.open(A);
  await A.pg.waitForSelector('#tp-people .tp-person', { timeout: 20000 }); await sleep(1500);
  var who = await A.pg.evaluate(function () { return [].map.call(document.querySelectorAll('#tp-people .tp-person'), function (r) { var b = r.querySelector('.tp-bound'); return { name: r.querySelector('.tp-name').textContent, bound: b ? b.textContent : null }; }); });
  var boundTxt = who.map(function (x) { return x.bound; }).filter(Boolean).join('|');
  verdict('U9', boundTxt.indexOf(northName) >= 0 && boundTxt.indexOf(bps[0][2]) >= 0 && who.filter(function (x) { return !x.bound; }).length >= 1, 'Who is on what shows each bound device\'s record by name (' + northName + ', ' + bps[0][2] + '); the founder (bound to nothing) shows none', JSON.stringify(who));
  // U5: read-only plan on the founder and on a joined device
  var planA = await P.planLine(A), choicesA = await P.choices(A);
  await P.close(A); await P.open(B); var planB = await P.planLine(B), choicesB = await P.choices(B);
  verdict('U5', (planA || '').indexOf('Point-of-sale team') >= 0 && choicesA.length === 0 && (planB || '').indexOf('Point-of-sale team') >= 0 && choicesB.length === 0 && (await T.kind(B)) === 'pos', 'the founded POS team shows "Point-of-sale team" read-only (no radios) on the founder AND on a device that only joined, which read it from the genesis', JSON.stringify([planA, planB]));
  verdict('U11', errors === 0 && reds === 0, '0 page errors, 0 console 🔴 on all devices', 'errors=' + errors + ' reds=' + reds + (errors ? ' ' + [A, B, C].map(function (d) { return d.errs[0]; }).filter(Boolean).slice(0, 2).join(' | ') : ''));

  var red = Object.keys(ARMS).filter(function (k) { return ARMS[k]; });
  console.log('§UIP_ARMS red=' + (red.length ? red.join(',') : 'none') + ' judged=' + judged);
  await browser.close(); server.close();
  if (QUIET) process.exit(red.length ? 1 : 0);
  if (red.length) { console.log('§UIP_VERDICT FAIL judged=' + judged + ' fails=' + fails + ' mutants=NOT RUN (the base run is red) pageerrors=' + errors); process.exit(1); }
  if (process.env.UIP_NO_MUT) { console.log('§UIP_VERDICT PASS judged=' + judged + ' fails=0 mutants=skipped pageerrors=' + errors); process.exit(0); }
  var M = [
    { name: 'the choice is ignored (the genesis is always the office plan)', file: 'erp/team_sync.js', from: "if (pc && pc !== 'office' && planChoices()", to: "if (false && pc && pc !== 'office' && planChoices()", expect: ['U1'] },
    { name: 'the plan list is hand-coded (offered whether or not the plan file was loaded)', file: 'erp/team_sync.js', from: "if (global.TEAM_PLAN) ids.push('office'); if (P && P.kind && ids.indexOf(P.kind) < 0) ids.push(P.kind);", to: "ids.push('office', 'pos');", expect: ['U6'] },
    { name: 'the binding is not written (Approve sends the role only)', file: 'common/comm/team_panel.js', from: "bs ? bs.value : undefined)", to: "undefined)", expect: ['U2', 'U3', 'U10'] },
    { name: '"Bound to" is shown for a role without `by` rows (the role is ignored)', file: 'erp/team_sync.js', from: "var ts = bindTypes(roleId); if (!ts.length) return null;", to: "var ts = bindTypes(); if (!ts.length) return null;", expect: ['U8'] },
    { name: 'the picker reads the bare bundle, not the tip (a record made this session is missing)', file: 'erp/idempiere.html', from: "window.__tipRead = { rows: _sqlRows,", to: "window.__tipRead = { rows: _baseRows,", expect: ['U10'] },
    { name: 'the picker\'s record type is hand-coded (organisation only)', file: 'erp/team_sync.js', from: "r.by.forEach(function (c) { t = t && fkTarget(t, c); });", to: "r.by.forEach(function (c) { t = t && fkTarget(t, c); }); t = 'ad_org';", expect: ['U2', 'U3'] },
    { name: 'an empty binding is sent (the panel does not refuse)', file: 'common/comm/team_panel.js', from: "if (bs && !bs.value) {", to: "if (false && bs && !bs.value) {", expect: ['U7'] },
    { name: 'the founded team does not show its plan', file: 'common/comm/team_panel.js', from: "(many && st.plan ?", to: "(false && many && st.plan ?", expect: ['U5'] },
    { name: 'Who is on what does not show the bound record', file: 'common/comm/team_people_ui.js', from: "(p.boundTo ? ' <span", to: "(false && p.boundTo ? ' <span", expect: ['U9'] }];
  var cp = require('child_process'), muts = [];
  for (var m of M) {
    var srcText = SRC['/' + m.file]; if (srcText.split(m.from).length !== 2) { muts.push({ name: m.name, error: 'MUTATION DID NOT APPLY (anchor not found exactly once)' }); continue; }
    var tmp = path.join(os.tmpdir(), 'uip_mut_' + process.pid + '_' + muts.length + path.extname(m.file)); fs.writeFileSync(tmp, srcText.replace(m.from, function () { return m.to; }));
    var kk = cp.spawnSync(process.execPath, [__filename], { encoding: 'utf8', timeout: 1500000, env: Object.assign({}, process.env, { UIP_ONLY_ARMS: '1', UIP_MUT_TARGET: '/' + m.file, UIP_MUT_FILE: tmp }) });
    fs.unlinkSync(tmp); var mm = /§UIP_ARMS red=(\S+)/.exec(kk.stdout || '');
    muts.push(mm ? { name: m.name, expect: m.expect, red: mm[1] !== 'none' ? mm[1].split(',') : [] } : { name: m.name, error: 'CRASHED (not a kill) ' + String(kk.stderr || kk.stdout).split('\n').slice(-3).join(' ') });
  }
  console.log('\n§UIP_MUTANTS');
  var killed = 0; muts.forEach(function (m) { var ok = !m.error && m.expect.some(function (e) { return m.red.indexOf(e) !== -1; }); if (ok) killed++; else fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + m.name + ' -> ' + (m.error || 'red arms: ' + (m.red.join(', ') || 'NONE (survivor = hole)'))); });
  console.log('§UIP_VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fails=' + fails + ' mutants_killed=' + killed + '/' + muts.length + ' pageerrors=' + errors + ' reds=' + reds);
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.log('§UIP_CRASH ' + (e && e.stack || e)); process.exit(2); });
