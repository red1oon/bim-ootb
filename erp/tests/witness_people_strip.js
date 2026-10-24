#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-PEOPLE-STRIP + W-SCOPE-STRIP + W-SCOPE-INBOX, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §13.12.G.1 (+ §13.12.H uses 1,2). READ THE LOG after every run — the exit code is not evidence.
//   THREE real browser contexts (A sales = the founder with its role changed by a ROLE op, B warehouse, C accounts), the REAL erp/idempiere.html, dumb folder pipe, pairing through the Team panel.
//   The seed has no clerk roles, so three FIXTURE roles are injected into each page's in-memory dictionary (common/tests/people_fixture_roles.js, real windows 143 / 169 / 167+195).
//   Everything judged is read from the live pages and the pipe folder: DOM text of the heads-up banner and the People panel, the raw cl_op rows, the raw head/focus files — and the witness
//   recomputes ranking, history and the inbox ITSELF from those raw rows (not by calling TeamPeople). Every arm names the issue it proves or disproves, has a control, and prints INCONCLUSIVE when it judged nothing.
//   §PS-ON       setup is real: 3 devices paired, fixture roles visible, one shared order O exists on all
//   §PS-HEADSUP  (1) A opens O, B sees "A is editing this" — NO-OP guard: not before A's Visit; (2) A closes → B clears only after A's Visit AND B's Visit (staleness control)
//   §PS-RANK     (3) the strip order equals the newest-op/head order recomputed from the raw rows
//   §PS-TTL      (4) a focus older than the TTL is not shown (injected clock), shown again with the real clock
//   §PS-OFF      (5) "Don't show what I'm on": the pipe bytes carry no label, the banner and badge vanish, "active" stays; control: switching back on restores them
//   §PS-HIST     (6) the avatar's "last tasks" equal the raw cl_op ops of that person grouped by record
//   §SS-STRIP    W-SCOPE-STRIP: sales device collapses accounts to "+1 others", Everyone shows all; warehouse device collapses nobody (control); accounts' focus on O gives no heads-up (cannot write c_order)
//   §SI-INBOX    W-SCOPE-INBOX: warehouse inbox = exactly the sales-authored order; an accounts-authored order exists in the log but is not listed; sales and accounts inboxes are empty
//   §PS-NOERR    0 page errors
// Run: node erp/tests/witness_people_strip.js 2>&1 | tee /tmp/witness_people_strip.log

'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
var ROOT = path.join(__dirname, '..', '..');
var FX = require(path.join(ROOT, 'common', 'tests', 'people_fixture_roles.js'));
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var fails = 0, judged = 0, inconclusive = [], errors = 0, cur = 'W-PEOPLE-STRIP', per = {};
function P(k) { return per[cur] || (per[cur] = { j: 0, f: 0, i: 0 }); }
function verdict(ok, label, detail) { judged++; P().j++; if (!ok) { fails++; P().f++; } console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
function incon(label, why) { inconclusive.push(label); P().i++; console.log('   ⚪ INCONCLUSIVE ' + label + ' — ' + why); }
var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
var MUTANTS = {   // each must make a NAMED arm fail (run: PS_MUTATE=writers node erp/tests/witness_people_strip.js)
  writers: { file: '/common/comm/team_people.js', from: 'if (!opts.ignoreWriters && p.writes && !has(p.writes, e.table)) return;', to: '' },           // heads-up from people who cannot write the table  → §SS-STRIP (writers only)
  offleak: { file: '/common/comm/team_focus.js', from: 'var off = !!opts.off, list = off ? [] :', to: 'var off = !!opts.off, list = false ? [] :' },          // switch-off still writes the details                → §PS-OFF
  ttl: { file: '/common/comm/team_people.js', from: 'if (age > ttl) return;', to: '' }                                                               // no TTL                                              → §PS-TTL
};
function walk(d, rel, out) { if (!fs.existsSync(d)) return out; fs.readdirSync(d).forEach(function (n) { var p = path.join(d, n), r = rel ? rel + '/' + n : n;
  if (fs.statSync(p).isDirectory()) walk(p, r, out); else out.push(r); }); return out; }

(async function () {
  console.log('═══ W-PEOPLE-STRIP / W-SCOPE-STRIP / W-SCOPE-INBOX — the people strip in the real ERP, three real browsers (TEAMWORK_FRAMEWORK §13.12.G.1) ═══\n');
  var FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'team-people-'));
  var server = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
    if (p === '/pipe/list') { var pre = u.searchParams.get('prefix') || ''; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(walk(FOLDER, '', []).filter(function (n) { return n.indexOf(pre) === 0; }))); return; }
    if (p.indexOf('/pipe/f/') === 0) { var fp = path.join(FOLDER, p.slice(8)); if (fp.indexOf(FOLDER) !== 0) { res.writeHead(400); res.end(); return; }
      if (req.method === 'PUT') { var ch = []; req.on('data', function (c) { ch.push(c); }); req.on('end', function () { fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, Buffer.concat(ch)); res.writeHead(200); res.end('ok'); }); return; }
      if (!fs.existsSync(fp)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); return; }
    var f = path.join(ROOT, p === '/' ? '/erp/idempiere.html' : p);
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    var mut = MUTANTS[process.env.PS_MUTATE]; if (mut && f.replace(ROOT, '') === mut.file) { var txt = fs.readFileSync(f, 'utf8'); if (txt.indexOf(mut.from) < 0) { res.writeHead(500); res.end('mutant does not apply'); return; }   // PS_MUTATE=<name>: serve a deliberately broken module to prove an arm CAN fail
      res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(txt.replace(mut.from, mut.to)); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port, PIPE = base + '/pipe';

  var browser = await reqPw().chromium.launch({ args: ['--disable-gpu'] }), L = { A: [], B: [], C: [] }, WHO = ['A', 'B', 'C'];
  try {
    var ctx = {}, pg = {};
    for (var who of WHO) {
      ctx[who] = await browser.newContext({ viewport: { width: 1400, height: 900 } }); pg[who] = await ctx[who].newPage();
      (function (w) { pg[w].on('console', function (m) { var t = m.text(); L[w].push(t); if (/§PEOPLE_|§TEAM_VISIT|§TEAM_PAIR|🔴/.test(t)) console.log('     [' + w + '] ' + t.slice(0, 300)); });
        pg[w].on('pageerror', function (e) { errors++; L[w].push('PAGEERR ' + e.message); console.log('     [' + w + '] 🔴 pageerror ' + e.message); });
        pg[w].on('dialog', function (d) { d.accept().catch(function () {}); }); })(who);
    }
    var URL0 = base + '/erp/idempiere.html?login=GardenAdmin&window=143&team=1&pipe=' + encodeURIComponent(PIPE);
    async function loadErp(w, url) { await pg[w].goto(url || URL0, { waitUntil: 'load' }); await pg[w].waitForSelector('#idmp-toolbar [data-tb="new"]', { timeout: 60000 }); await pg[w].waitForSelector('#team-chip', { timeout: 60000 }); await sleep(1200);
      await pg[w].waitForFunction(function () { return window.__idmpDb && window.__idmpDb.run; }, null, { timeout: 30000 });
      await pg[w].evaluate(function (st) { st.forEach(function (s) { window.__idmpDb.run(s); }); }, FX.statements()); }
    async function pillClick(w) { if (!(await pg[w].isVisible('#pill-team'))) { await pg[w].click('#idmp-pill-trigger'); await sleep(900); } await pg[w].click('#pill-team'); await pg[w].waitForSelector('#team-panel', { timeout: 10000 }); }
    async function closePanel(w) { if (await pg[w].$('#team-panel')) await pg[w].click('#tp-close'); }
    async function waitLog(w, re, from, ms) { var t0 = Date.now(); while (Date.now() - t0 < ms) { var l = L[w].slice(from).find(function (x) { return re.test(x); }); if (l) return l; await sleep(150); } return null; }
    async function visit(w) { var n0 = L[w].length; await pg[w].click('#team-visit'); var l = await waitLog(w, /§TEAM_VISIT /, n0, 60000); await sleep(1100); return l; }
    var sel = function (c) { return '#idmp-inline-mount select[data-col="' + c + '"]'; };
    var inp = function (c) { return '#idmp-inline-mount input[data-col="' + c + '"]'; };
    async function toHeaderGrid(w) { var p = pg[w]; await p.click('#idmp-tabstrip .idmp-adtab >> nth=0'); await sleep(900); await require('./legacy_open.js').showAllRows(p, { settle: 300 }); await sleep(500); }
    async function gridRows(w) { return pg[w].evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('.idmp-grid tbody tr[data-ad-record]'), function (tr) { return { pk: Number(tr.getAttribute('data-ad-record')), text: tr.textContent.replace(/\s+/g, ' ').trim() }; }); }); }
    async function newOrder(w, desc) {
      var p = pg[w], n0 = L[w].length;
      await p.click('#idmp-tabstrip .idmp-adtab >> nth=0'); await sleep(700);
      await p.click('#idmp-toolbar [data-tb="new"]'); await p.waitForSelector('#idmp-inline-mount .cfrow'); await sleep(700);
      await p.selectOption(sel('ad_org_id'), '11').catch(function () {}); await sleep(400);
      await p.selectOption(sel('m_warehouse_id'), '103').catch(function () {}); await sleep(300);
      await p.selectOption(sel('c_bpartner_id'), '118'); await sleep(300);
      var dts = await p.$$eval(sel('c_doctypetarget_id') + ' option', function (o) { return o.map(function (x) { return { v: x.value, t: x.text }; }); });
      var dt = dts.find(function (o) { return /^Standard Order/.test(o.t); }) || dts.find(function (o) { return /^POS Order/.test(o.t); }); if (!dt) throw new Error('no order doctype');
      await p.selectOption(sel('c_doctypetarget_id'), dt.v);
      await p.fill(inp('description'), desc); await p.dispatchEvent(inp('description'), 'change');
      await p.click('#idmp-toolbar [data-tb="save"]');
      var l = await waitLog(w, /§CRUD-CREATE-SEL table=c_order id=/, n0, 15000); await sleep(900);
      return Number((/id=(-?\d+)/.exec(l || '') || [])[1]);
    }
    async function openRecord(w, pk) { await pg[w].evaluate(function (i) { var tr = Array.prototype.filter.call(document.querySelectorAll('.idmp-grid tbody tr[data-ad-record]'), function (x) { return Number(x.getAttribute('data-ad-record')) === i; })[0]; if (tr) tr.click(); }, pk);
      await pg[w].waitForSelector('#idmp-inline-mount .cfrow', { timeout: 8000 }).catch(function () {}); await sleep(900); }
    async function closeRecord(w) { var tgl = pg[w].locator('#idmp-toolbar [data-tb="toggle"]'); var inForm = await pg[w].evaluate(function () { return !document.querySelector('#idmp-content .idmp-grid'); });
      if (inForm && await tgl.count()) { await tgl.first().click().catch(function () {}); await sleep(900); } }
    async function editDesc(w, v) { var p = pg[w], n0 = L[w].length; await p.fill(inp('description'), v); await p.dispatchEvent(inp('description'), 'change'); await sleep(300);
      await p.click('#idmp-toolbar [data-tb="save"]'); await waitLog(w, /§CRUD-PERSIST key=c_order /, n0, 15000); await sleep(900); }
    async function negPks(w) { return (await gridRows(w)).filter(function (r) { return r.pk < 0; }).map(function (r) { return r.pk; }); }
    async function banner(w) { return pg[w].evaluate(function () { var b = document.getElementById('team-headsup'); return b ? { text: b.textContent.replace(/\s+/g, ' ').trim(), lines: Array.prototype.map.call(b.querySelectorAll('.team-headsup-line'), function (x) { return { person: x.getAttribute('data-person'), text: x.textContent.trim() }; }), h: b.getBoundingClientRect().height } : null; }); }
    async function raw(w) { return pg[w].evaluate(function () { return window.TeamSync.store().query('SELECT envelope FROM cl_op').map(function (r) { return JSON.parse(r.envelope); }); }); }
    function folderObj(rel) { var p = path.join(FOLDER, rel); return fs.existsSync(p) ? { text: fs.readFileSync(p, 'utf8'), json: JSON.parse(fs.readFileSync(p, 'utf8')) } : null; }
    async function openPanelPeople(w) { await pillClick(w); await pg[w].waitForSelector('#tp-people .tp-person', { timeout: 15000 }); await sleep(400); }
    async function strip(w) { return pg[w].evaluate(function () { return { mode: { scope: document.getElementById('tp-m-scope').getAttribute('aria-pressed'), all: document.getElementById('tp-m-all').getAttribute('aria-pressed') },
      rows: Array.prototype.map.call(document.querySelectorAll('#tp-people .tp-person'), function (r) { var vis = getComputedStyle(r).display !== 'none'; return { person: r.getAttribute('data-person'), self: r.getAttribute('data-self') === '1', inscope: r.getAttribute('data-inscope') === '1', off: r.getAttribute('data-off') === '1', visible: vis,
        name: r.querySelector('.tp-name').textContent.trim(), active: r.querySelector('.tp-active').textContent.trim(), initials: r.querySelector('.tp-avatar').textContent.trim(), h: r.getBoundingClientRect().height,
        badges: Array.prototype.map.call(r.querySelectorAll('.tp-badge'), function (b) { return { uu: b.getAttribute('data-uu'), text: b.textContent.trim() }; }) }; }),
      others: (document.getElementById('tp-others') || {}).textContent || null, inbox: Array.prototype.map.call(document.querySelectorAll('#tp-inbox .tp-inbox-item'), function (i) { return i.getAttribute('data-uu'); }), inboxText: document.getElementById('tp-inbox').textContent.trim() }; }); }

    // ═══ §PS-ON — real setup: Start a team (A), Join + Approve with a role (B warehouse, C accounts); A becomes sales by a ROLE op ═══
    console.log('§PS-ON');
    await loadErp('A'); await pillClick('A'); await pg.A.click('#tp-found'); await pg.A.waitForSelector('#tp-paired', { timeout: 30000 });
    var link = (await pg.A.inputValue('#tp-link')).replace(/^https?:\/\/[^/]+/, base); await pg.A.click('#tp-close');
    var codes = {};
    for (var jw of ['B', 'C']) {
      await loadErp(jw, link); await pg[jw].waitForSelector('#team-panel', { timeout: 60000 }); await pg[jw].click('#tp-join'); await pg[jw].waitForSelector('#tp-code', { timeout: 30000 });
      codes[jw] = (await pg[jw].textContent('#tp-code')).trim(); await closePanel(jw);
      await pillClick('A'); await pg.A.click('#tp-req'); await pg.A.waitForSelector('#tp-reqs .tp-request', { timeout: 30000 });
      var role = jw === 'B' ? '9002' : '9003';
      await pg.A.selectOption('#tp-reqs .tp-request:has(.tp-rcode:text("' + codes[jw] + '")) .tp-role', role);
      await pg.A.click('#tp-reqs .tp-request:has(.tp-rcode:text("' + codes[jw] + '")) .tp-approve'); await pg.A.waitForSelector('#tp-paired', { timeout: 30000 }); await sleep(800); await closePanel('A');
      await pillClick(jw); await pg[jw].click('#tp-visit'); await pg[jw].waitForSelector('#tp-paired', { timeout: 30000 }); await closePanel(jw);
    }
    await pg.A.evaluate(async function () { var S = window.TeamSync.store(), Lo = await S.order(), me = Lo.roster.devices[S.kid].person; await S.setRole({ person_uu: me, ad_role_id: 9001 }); await window.TeamSync.visit(); });   // test setup: no UI changes a role
    await sleep(800); for (var vw of ['B', 'C', 'A', 'B']) await visit(vw);
    var st0 = await pg.A.evaluate(function () { return window.TeamSync.pairState(); });
    var rolesSeen = await pg.B.evaluate(async function () { var Lo = await window.TeamSync.store().order(); return Object.keys(Lo.roster.devices).map(function (k) { var d = Lo.roster.devices[k]; return { person: d.person, role: Lo.roster.roleAt(k, 1e12).ad_role_id }; }); });
    verdict(st0.devices === 3 && rolesSeen.map(function (x) { return x.role; }).sort().join() === '9001,9002,9003', 'three devices paired through the Team panel, roles sales 9001 (A, by a ROLE op) / warehouse 9002 (B) / accounts 9003 (C) — read from B\'s own roster', JSON.stringify(rolesSeen.map(function (x) { return x.role; })));
    // one shared order O created by A (sales) through the real form, then every device visits
    await toHeaderGrid('A'); await toHeaderGrid('B'); await toHeaderGrid('C');
    var pkA0 = await newOrder('A', 'PS-one'); await visit('A'); await visit('B'); await visit('C'); await toHeaderGrid('A'); await toHeaderGrid('B'); await toHeaderGrid('C');
    var negA = await negPks('A'), negB = await negPks('B'), negC = await negPks('C');
    var oUu = await pg.A.evaluate(async function () { var envs = window.TeamSync.store().query('SELECT envelope FROM cl_op').map(function (r) { return JSON.parse(r.envelope); }); var c = envs.filter(function (e) { return e.body.op_type === 'CRUD_CREATE' && e.target.table === 'c_order'; }); return c.length === 1 ? c[0].target.uu : null; });
    verdict(negA.length === 1 && negB.length === 1 && negC.length === 1 && !!oUu, 'order O (uu ' + String(oUu).slice(0, 8) + ') exists on all three devices (one team-created order each)', JSON.stringify({ A: negA, B: negB, C: negC }));
    var bannerNone = await banner('B');
    verdict(bannerNone === null, 'no banner anywhere yet (B has not opened O either)', '');
    var space = await pg.A.evaluate(function () { return window.TeamSync.store().space; }), kidA = await pg.A.evaluate(function () { return window.TeamSync.store().kid; });
    var pre = folderObj('s/' + space + '/f/' + kidA);
    verdict(pre && pre.json.focus.length === 0, 'precondition: A created and SAVED O (its form showed the new record) and Visited — what A has on the pipe is the empty set: "clear on save" held (CONTROL for every arm below)', 'pipe entries=' + (pre && pre.json.focus.length));

    // ═══ §PS-HEADSUP (1) ═══
    console.log('\n§PS-HEADSUP');
    await openRecord('B', negB[0]);
    var fo0 = await pg.A.evaluate(function () { return window.TeamSync.focusOwn(); });
    verdict((await banner('B')) === null && fo0.length === 0, 'NO-OP guard: B has O open and A has nothing open — B shows no banner', 'B banner=' + JSON.stringify(await banner('B')));
    await openRecord('A', negA[0]);
    var foA = await pg.A.evaluate(function () { return window.TeamSync.focusOwn(); });
    var pub0 = folderObj('s/' + space + '/f/' + kidA);
    verdict(foA.length === 1 && foA[0].uu === oUu && foA[0].table === 'c_order' && /Order/.test(foA[0].label) && pub0 && pub0.json.focus.length === 0, 'A opens O: A\'s own focus = O (table c_order, label "' + (foA[0] && foA[0].label) + '"), but what is ON THE PIPE is still the empty set from the last Visit (focus is as fresh as the last Visit)', 'pipe focus entries=' + (pub0 && pub0.json.focus.length));
    await visit('B');
    verdict((await banner('B')) === null, 'CONTROL: B Visits while A has O open but has NOT visited → still no banner (nothing was published)', '');
    await visit('A');
    var pub1 = folderObj('s/' + space + '/f/' + kidA);
    verdict(pub1 && pub1.json.focus.length === 1 && pub1.json.focus[0].uu === oUu && pub1.json.off === false && typeof pub1.json.sig === 'string' && pub1.json.sig.length > 100, 'A Visits: the pipe object s/<space>/f/<kid> now lists O, is signed (sig ' + (pub1 && pub1.json.sig.length) + ' hex chars), off=false', JSON.stringify(pub1 && pub1.json.focus.map(function (e) { return e.table + ':' + e.uu.slice(0, 8) + ':' + e.label; })));
    await visit('B');
    var bn = await banner('B'), genesis = (await raw('B')).filter(function (e) { return e.body.op_type === 'GENESIS'; })[0], nameA = genesis.body.params.founder.name;
    verdict(bn && bn.lines.length === 1 && bn.lines[0].text === nameA + ' is editing this (just now)' && bn.h >= 44, 'B Visits with O open: the form shows "' + (bn && bn.lines[0] && bn.lines[0].text) + '" — the name is A\'s founder name from the raw GENESIS op ("' + nameA + '"), the banner is >= 44 px high', 'h=' + (bn && Math.round(bn.h)));
    // (2) A closes
    await closeRecord('A');
    var foA2 = await pg.A.evaluate(function () { return window.TeamSync.focusOwn(); });
    await visit('B');
    verdict(foA2.length === 0 && (await banner('B')) !== null, 'A closes O (own focus empty); B Visits BEFORE A does → the banner is still there (focus is advisory and as fresh as A\'s last Visit)', 'A focus=' + foA2.length);
    await visit('A');
    verdict(folderObj('s/' + space + '/f/' + kidA).json.focus.length === 0, 'A Visits: the pipe object is overwritten with the empty set', '');
    await visit('B');
    verdict((await banner('B')) === null, 'B\'s next Visit clears the banner', '');

    // ═══ §PS-TTL (4) ═══
    console.log('\n§PS-TTL');
    await openRecord('A', negA[0]); await visit('A'); await visit('B');
    var shown1 = await banner('B');
    await pg.B.evaluate(function () { window.TeamSync._setClock(function () { return Date.now() + 31 * 60000; }); return window.TeamSync.refreshPeople(); }); await sleep(500);
    var gone = await banner('B');
    await pg.B.evaluate(function () { window.TeamSync._setClock(null); return window.TeamSync.refreshPeople(); }); await sleep(500);
    var back = await banner('B');
    verdict(shown1 && !gone && back, 'A\'s focus is shown; with B\'s injected clock 31 min ahead (TTL 30 min) it is NOT shown; with the real clock it is shown again (CONTROL: the data was never lost)', JSON.stringify({ shown: !!shown1, at31min: !!gone, real: !!back }));

    // ═══ §SS-STRIP part: heads-up only from people who could write the table ═══
    console.log('\n§SS-STRIP (writers only)'); cur = 'W-SCOPE-STRIP';
    await openRecord('C', negC[0]); await visit('C'); await visit('A');
    var bA = await banner('A');
    await openPanelPeople('A'); var sA0 = await strip('A'); await closePanel('A');
    var cRowA = sA0.rows.filter(function (r) { return r.name !== 'founder' && /^device/.test(r.name); });
    var cBadge = sA0.rows.some(function (r) { return r.badges.some(function (b) { return b.uu === oUu; }) && !r.self; });
    verdict(bA === null && cBadge, 'C (accounts) has O open and published it: A\'s People list shows C\'s badge for O, but A\'s form shows NO heads-up — accounts cannot write c_order (CONTROL: B saw A\'s banner above because sales can)', 'banner=' + JSON.stringify(bA) + ' cBadge=' + cBadge);
    await closeRecord('C'); await visit('C');

    // ═══ §PS-RANK (3) — everyone mode, order recomputed from the raw rows ═══
    console.log('\n§PS-RANK'); cur = 'W-PEOPLE-STRIP';
    for (var rv of ['A', 'C', 'B']) await visit(rv);     // B last → B's own head is the newest; nobody visits between B's Visit and the panel
    await pg.B.evaluate(function () { return window.TeamSync.setMode('all'); });
    await openPanelPeople('B'); var sB = await strip('B');
    var envsB = await raw('B'), kidPerson = {}, nm = {};
    var gp = envsB.filter(function (e) { return e.body.op_type === 'GENESIS'; })[0].body.params.founder; kidPerson[gp.kid] = gp.person_uu.toLowerCase(); nm[gp.person_uu.toLowerCase()] = gp.name;
    envsB.filter(function (e) { return e.body.op_type === 'PERSON'; }).forEach(function (e) { nm[String(e.body.params.person_uu).toLowerCase()] = e.body.params.name; });
    envsB.filter(function (e) { return e.body.op_type === 'ENROLL'; }).forEach(function (e) { kidPerson[e.body.params.kid] = String(e.body.params.person_uu).toLowerCase(); });
    var last = {}; envsB.forEach(function (e) { var p = kidPerson[e.author]; if (p && (last[p] == null || e.ts > last[p])) last[p] = e.ts; });
    walk(path.join(FOLDER, 's', space, 'h'), '', []).forEach(function (k) { var hd = JSON.parse(fs.readFileSync(path.join(FOLDER, 's', space, 'h', k), 'utf8')), p = kidPerson[hd.author]; if (p && (last[p] == null || hd.ts > last[p])) last[p] = hd.ts; });
    var expect = Object.keys(last).sort(function (x, y) { return last[y] - last[x] || (x < y ? -1 : 1); }), got = sB.rows.map(function (r) { return r.person; });
    if (sB.rows.length < 3) incon('§PS-RANK', 'the strip lists fewer than 3 people — an ordering of that is vacuous');
    else verdict(got.join() === expect.join() && sB.mode.all === 'true', 'Everyone mode: the strip order [' + sB.rows.map(function (r) { return r.name; }).join(', ') + '] equals the newest op/head order recomputed from the raw cl_op rows and the raw head files [' + expect.map(function (p) { return nm[p]; }).join(', ') + ']', 'ages(s)=' + expect.map(function (p) { return Math.round((Date.now() - last[p]) / 1000); }).join(','));
    var ctlMix = expect.slice().reverse().join() !== got.join();
    verdict(ctlMix && sB.rows[0].self === true, 'CONTROL: the reversed order differs from what is shown, and B (who just Visited) is first — the order is not alphabetical/ID order', 'first=' + sB.rows[0].name);
    verdict(sB.rows.every(function (r) { return r.h >= 44 && r.initials.length >= 1 && /^active /.test(r.active); }) , 'every row is >= 44 px high, has an initials avatar and an "active …" text', JSON.stringify(sB.rows.map(function (r) { return r.initials + ':' + r.active + ':' + Math.round(r.h); })));
    await closePanel('B');

    // ═══ §PS-HIST (6) ═══
    console.log('\n§PS-HIST');
    await toHeaderGrid('A'); await openRecord('A', (await negPks('A'))[0]); await editDesc('A', 'PS-one edited');      // a second op on O by A → the history must show O with count 2
    await visit('A'); await visit('B');
    await pillClick('B'); await pg.B.waitForSelector('#tp-people .tp-person', { timeout: 15000 }); await sleep(400);
    var personA = kidPerson[kidA];
    await pg.B.click('#tp-people .tp-person[data-person="' + personA + '"]'); await sleep(500);
    var hist = await pg.B.evaluate(function (p) { return Array.prototype.map.call(document.querySelectorAll('#tp-people .tp-person[data-person="' + p + '"] .tp-hist'), function (h) { return { table: h.getAttribute('data-table'), uu: h.getAttribute('data-uu'), count: Number(h.getAttribute('data-count')), text: h.textContent.trim() }; }); }, personA);
    var envsH = await raw('B');     // re-read: A's edit above is in this log, not in the one read for the ranking arm
    var mine = envsH.filter(function (e) { return kidPerson[e.author] === personA && !/^comm_/.test(e.target.table); }).sort(function (a, b) { return b.ts - a.ts || b.seq - a.seq; }).slice(0, 10), grp = {};
    mine.forEach(function (e) { var k = e.target.table + '|' + e.target.uu; grp[k] = (grp[k] || 0) + 1; });
    var gotH = {}; hist.forEach(function (h) { gotH[h.table + '|' + h.uu] = h.count; });
    if (!mine.length) incon('§PS-HIST', 'A authored no business ops in the log — nothing to compare');
    else verdict(JSON.stringify(Object.keys(grp).sort().map(function (k) { return [k, grp[k]]; })) === JSON.stringify(Object.keys(gotH).sort().map(function (k) { return [k, gotH[k]]; })) && hist.some(function (h) { return h.uu === oUu && h.count === 2; }), 'A\'s "last tasks" in B\'s panel = A\'s raw cl_op ops grouped by record (' + mine.length + ' ops → ' + Object.keys(grp).length + ' record(s)); O is among them with count 2 (create + the edit)', JSON.stringify(hist.map(function (h) { return h.table + ':' + h.count + ':' + h.text; })));
    var hCtl = await pg.B.evaluate(function (p) { var other = Array.prototype.filter.call(document.querySelectorAll('#tp-people .tp-person'), function (r) { return r.getAttribute('data-person') !== p && r.getAttribute('data-self') !== '1'; })[0]; if (!other) return null; other.click(); return new Promise(function (res) { setTimeout(function () { res(Array.prototype.map.call(other.querySelectorAll('.tp-hist,.tp-hist-none'), function (h) { return h.className + ':' + h.getAttribute('data-uu'); })); }, 400); }); }, personA);
    verdict(hCtl && hCtl.every(function (x) { return x.indexOf('data-uu') < 0 && !/:[0-9a-f]{8}-/.test(x); }), 'CONTROL: another person\'s history does not contain A\'s records', JSON.stringify(hCtl));
    await closePanel('B');

    // ═══ §PS-OFF (5) ═══
    console.log('\n§PS-OFF');
    await toHeaderGrid('A'); await openRecord('A', (await negPks('A'))[0]); await visit('A'); await visit('B');     // A reopens O (the edit-save above cleared it) and lists it
    await pillClick('A'); await pg.A.waitForSelector('#tp-hide'); await pg.A.check('#tp-hide'); await sleep(500); await closePanel('A');
    await visit('A'); await visit('B');
    var offObj = folderObj('s/' + space + '/f/' + kidA), offBanner = await banner('B');
    await openPanelPeople('B'); var sOff = await strip('B'); await closePanel('B');
    var rowA = sOff.rows.filter(function (r) { return r.person === personA; })[0];
    verdict(offObj.json.off === true && offObj.json.focus.length === 0 && offObj.text.indexOf('PS-one') < 0 && offObj.text.indexOf('Order') < 0 && offObj.text.indexOf(oUu) < 0, 'switch-off: the pipe bytes of A\'s focus object carry no label, no table, no record uu — only {off:true}', 'bytes=' + offObj.text.length);
    verdict(offBanner === null && rowA && rowA.off && rowA.badges.length === 0 && /^active /.test(rowA.active), 'B shows no banner on O and A\'s row has no badge — only "' + (rowA && rowA.active) + '"', '');
    await pillClick('A'); await pg.A.waitForSelector('#tp-hide'); await pg.A.uncheck('#tp-hide'); await sleep(500); await closePanel('A');
    await visit('A'); await visit('B');
    var onBanner = await banner('B');
    verdict(onBanner && onBanner.lines.length === 1, 'CONTROL: switching it back on and Visiting restores the banner', onBanner && onBanner.text);
    await closeRecord('A'); await visit('A'); await visit('B'); await closeRecord('B'); await closeRecord('C');

    // ═══ §SS-STRIP — scope mode ═══
    console.log('\n§SS-STRIP'); cur = 'W-SCOPE-STRIP';
    await visit('A');
    await openPanelPeople('A'); var sScope = await strip('A');
    var shownNames = sScope.rows.filter(function (r) { return r.visible; }).map(function (r) { return r.name; }), hidden = sScope.rows.filter(function (r) { return !r.visible; });
    var roleOfPerson = {}; rolesSeen.forEach(function (x) { roleOfPerson[x.person] = x.role; });
    if (sScope.rows.length < 3) incon('§SS-STRIP', 'fewer than 3 people — collapsing is vacuous');
    else verdict(sScope.mode.scope === 'true' && sScope.rows.length === 3 && shownNames.length === 2 && hidden.length === 1 && roleOfPerson[hidden[0].person] === 9003 && /^\+1 others$/.test(sScope.others), 'sales device (default = My role scope): shows itself + warehouse; accounts is collapsed into "' + sScope.others + '" (role ' + (hidden[0] && roleOfPerson[hidden[0].person]) + ' via the raw roster)', 'shown=' + shownNames.join(',') + ' default scope pressed=' + sScope.mode.scope);
    await pg.A.click('#tp-others'); await sleep(300); var sOpen = await strip('A');
    verdict(sOpen.rows.every(function (r) { return r.visible; }), 'clicking "+1 others" reveals the collapsed person', '');
    await pg.A.click('#tp-m-all'); await sleep(900); var sAll = await strip('A');
    verdict(sAll.mode.all === 'true' && sAll.others === null && sAll.rows.length === 3 && sAll.rows.every(function (r) { return r.visible; }), 'CONTROL: "Everyone" shows all three and no "+N others"', 'others=' + sAll.others);
    await pg.A.click('#tp-m-scope'); await sleep(900); await closePanel('A');
    await openPanelPeople('B'); await pg.B.click('#tp-m-scope'); await sleep(900); var sWh = await strip('B'); await closePanel('B');
    verdict(sWh.mode.scope === 'true' && sWh.rows.length === 3 && sWh.rows.every(function (r) { return r.visible; }) && sWh.others === null, 'CONTROL, warehouse device in scope mode: sales (upstream) and accounts (downstream) are both in scope, so nothing is collapsed — the collapse above is the sales scope, not a blanket rule', 'others=' + sWh.others);

    // ═══ §SI-INBOX ═══
    console.log('\n§SI-INBOX'); cur = 'W-SCOPE-INBOX';
    var pkC = await newOrder('C', 'PS-accounts-order'); await visit('C'); await visit('B'); await visit('A'); await visit('C');
    var envsAll = await raw('B'), creates = envsAll.filter(function (e) { return e.body.op_type === 'CRUD_CREATE' && e.target.table === 'c_order'; }), cUu = creates.filter(function (e) { return e.target.uu !== oUu; }).map(function (e) { return e.target.uu; })[0];
    await openPanelPeople('B'); var inbB = await strip('B'); await closePanel('B');
    await openPanelPeople('A'); var inbA = await strip('A'); await closePanel('A');
    await openPanelPeople('C'); var inbC = await strip('C'); await closePanel('C');
    var salesAuthored = creates.filter(function (e) { return kidPerson[e.author] === personA; }).map(function (e) { return e.target.uu; });
    if (!cUu) incon('§SI-INBOX', 'the accounts-authored order did not reach B\'s log — the exclusion control is vacuous');
    else verdict(creates.length === 2 && JSON.stringify(inbB.inbox) === JSON.stringify(salesAuthored) && inbB.inbox[0] === oUu && inbB.inbox.indexOf(cUu) < 0, 'warehouse inbox = exactly the sales-authored order O (' + inbB.inbox.length + ' item); the accounts-authored order ' + cUu.slice(0, 8) + ' IS in the log (' + creates.length + ' orders) but is not listed — accounts is not an upstream role of warehouse', inbB.inboxText.slice(0, 120));
    verdict(inbA.inbox.length === 0 && inbC.inbox.length === 0, 'CONTROL: the sales inbox and the accounts inbox list nothing (no upstream-authored item on a table that flows into them yet)', 'A: ' + inbA.inboxText.slice(0, 60) + ' | C: ' + inbC.inboxText.slice(0, 60));

    console.log('\n§PS-NOERR'); cur = 'W-PEOPLE-STRIP'; verdict(errors === 0, 'zero page errors on all three users', 'errors=' + errors);
  } finally { await browser.close(); server.close(); try { fs.rmSync(FOLDER, { recursive: true, force: true }); } catch (e) {} }
  console.log('\n──────────────────────────────────────────────');
  ['W-PEOPLE-STRIP', 'W-SCOPE-STRIP', 'W-SCOPE-INBOX'].forEach(function (k) { var q = per[k] || { j: 0, f: 0, i: 0 }; console.log('§' + k + ' ' + (q.f || !q.j ? (q.j ? 'FAIL' : 'INCONCLUSIVE') : (q.i ? 'PASS-WITH-INCONCLUSIVE(' + q.i + ')' : 'PASS')) + ' judged=' + q.j + ' fails=' + q.f + ' inconclusive=' + q.i); });
  console.log('§W-PEOPLE-STRIP-ALL ' + (fails || !judged ? (judged ? 'FAIL' : 'INCONCLUSIVE') : (inconclusive.length ? 'PASS-WITH-INCONCLUSIVE(' + inconclusive.length + ')' : 'PASS')) + ' judged=' + judged + ' fails=' + fails + ' inconclusive=' + inconclusive.length + ' pageerrors=' + errors);
  process.exit(fails || !judged ? 1 : 0);
})().catch(function (e) { console.log('🔴 CRASH ' + (e && e.stack || e)); process.exit(2); });
