#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-RED1-CONTAINER (bim-compiler prompts/CLI_ERP_IVR.md §40 C1, C2, C3, C4, C5). READ THE §-LOG after every run; an exit code is not evidence.
 * ISSUE: `bim` / `mis` / `erp` only printed help; there was no container to enter, so every word and verb was offered everywhere, and no key went back a place.
 *   The owner's rule: a container narrows what is OFFERED (help, Tab, the grey suggestion), NEVER what runs.
 *   X1 (pure) `bim` → prompt `red1 bim> `; the offered verbs are the bim group's door apps only (no erp.*, mis.*, ninja.*), and there are some (vacuity)
 *   X2 (session) inside `bim`, a full `mis.sum kind=Order column=GrandTotal` still runs and answers ok
 *   X3 (pure) `help bim` text = the group's help (words_core.helpText) and `help bim` leaves the state outside any group; `bim` then `mis` switches the group
 *   X4 (pure) `cd ..` backs out: Duplex/Element → Duplex → the group → the top; at the top backLine is null; `cd /` drops the group
 *   X5 (pure) Shift+Tab stands for `cd ..` wherever there is a place to leave, and for nothing at the top
 *   ISSUE (C3): inside a record, Tab / the grey suggestion offered every action code and every kind, not what THAT record may do, its tabs, its process buttons.
 *   X6 (session, real seed) `cd Order 100` → the offered actions == the journalled erp.actions answer's `actions` (non-empty), and every offered `do` code is one of them
 *   X7 (real seed) the offered processes == the window tab's displayed Button fields with an AD_Process_ID minus DocAction/CreateFrom/Posted (read here by SQL from the seed,
 *      AbstractADWindowContent.actionButton0 :3766/:3818/:3857), non-empty; `run Co` is completed to the quoted process name
 *   X9 (pure assist) after `do C` / `do R` in that record, no code outside its actions is suggested
 *   ISSUE (C5): `menu` was a separate full-screen program; the menu could not be walked as places, and Shift+Tab could not climb it.
 *   X10 every message the record and the walk print is reached (a refused menu, a process leaf, a page-only leaf): W-MSG-CATALOG M2 hands these keys here
 *   X8 (session, real mis.menu) menu → cd Quote → cd "Sales Orders" → cd "Sales Order" gives the menu path in the prompt and the ordinary describe line; cd .. climbs ONE node a step back to red1>
 * Falsifiers (each must make this witness FAIL): WORDS_BREAK=nonarrow (X1: everything offered inside a group) · RED1_BREAK=gatecontainer (X2: a container that blocks a foreign line)
 *   · WORDS_BREAK=allactions (X6/X9: the record offers every code) · WORDS_BREAK=menuskip (X8: cd .. from a window jumps to the menu root).
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const { kit, ROOT } = require('./_kit');
const k = kit('W-RED1-CONTAINER');
const DOORDIR = path.join(ROOT, 'common/door'), D = require(path.join(DOORDIR, 'door.js')), vocab = D.loadVocab(), words = JSON.parse(fs.readFileSync(path.join(DOORDIR, 'vocab/words.json'), 'utf8'));
const msg = require(path.join(DOORDIR, 'msg_core.js')).create(JSON.parse(fs.readFileSync(path.join(DOORDIR, 'vocab/messages.json'), 'utf8')));
const core0 = require(path.join(DOORDIR, 'words_core.js')).create({ vocab, words, msg, tokenize: D.tokenize, pickColumns: require(path.join(DOORDIR, 'mis_core.js')).pickColumns, buildings: ['Duplex'], brk: process.env.WORDS_BREAK || '' });
const core = Object.assign({}, core0, { step: (st, text) => core0.step(st, { text: text }) });   // the shell's own call shape (red1.js:113)
const verbNames = vocab.verbs.map(v => v.verb), wordNames = Object.keys(words.words), bimApps = words.groups.bim.apps;
// ── X1 ──
const sB = core.step(core.init(), 'bim'), off = core.offered(sB.state, wordNames, verbNames), foreign = off.verbs.filter(v => bimApps.indexOf(v.split('.')[0]) < 0);
k.L('X1 prompt=' + JSON.stringify(sB.prompt) + ' offered verbs=' + off.verbs.length + ' of ' + verbNames.length + ' words=' + off.words.length + ' of ' + wordNames.length + ' foreign=' + JSON.stringify(foreign.slice(0, 5)));
k.chk('X1 `bim` enters: prompt "red1 bim> "; offered verbs are the bim apps only (' + bimApps.join(',') + '), none foreign, some offered', sB.prompt === 'red1 bim> ' && foreign.length === 0 && off.verbs.length > 0 && off.verbs.length < verbNames.length, 'offered=' + off.verbs.length + ' foreign=' + foreign.length);
// ── X3 ──
const hB = core.helpText('bim', null), sw = core.step(sB.state, 'mis');
k.chk('X3 the group help is helpText("bim") and is shown on entering; `mis` inside `bim` switches the group', sB.screen.join('\n') === hB.replace(/\n$/, '') && sw.state.group === 'mis' && sw.prompt === 'red1 mis> ', 'switch=' + sw.state.group);
// ── X4 / X5 ──
let st = core.step(core.step(core.step(core.init(), 'bim').state, 'cd Duplex').state, 'cd Element').state;   // cd Element needs the door's describe: simulate its answer the way red1 applies it is out of scope; read the pure place steps below
const p0 = core.prompt(st);
const back = []; let s2 = { group: 'bim', building: 'Duplex', kind: 'Element' };
s2 = Object.assign(core.init(), s2);
for (let i = 0; i < 4; i++) { back.push(core.prompt(s2).trim() + ' [' + (core.backLine(s2) || '-') + ']'); s2 = core.step(s2, 'cd ..').state; }
back.push(core.prompt(s2).trim() + ' [' + (core.backLine(s2) || '-') + ']');
const slash = core.step(Object.assign(core.init(), { group: 'bim', building: 'Duplex' }), 'cd /').state;
k.L('X4 path ' + back.join(' → ') + ' · cd / → ' + JSON.stringify(core.prompt(slash)) + ' · after cd Duplex in bim: ' + JSON.stringify(p0));
k.chk('X4 `cd ..` backs out Duplex/Element → Duplex → bim → top, and `cd /` drops the group', back[0] === 'red1 bim Duplex/Element> [cd ..]' && back[1] === 'red1 bim Duplex> [cd ..]' && back[2] === 'red1 bim> [cd ..]' && back[3] === 'red1> [-]' && core.prompt(slash) === 'red1> ', back.join(' | '));
k.chk('X5 Shift+Tab stands for `cd ..` wherever a place can be left, nothing at the top', core.backLine(Object.assign(core.init(), { group: 'erp' })) === 'cd ..' && core.backLine(core.init()) === null && core.backLine(Object.assign(core.init(), { erp: 'Order', rec: { id: 1, label: '50000' } })) === 'cd ..');
// ── X2 session ──
const d = fs.mkdtempSync(path.join(os.tmpdir(), 'red1cont_')), J = path.join(d, 'j.jsonl');
const env = Object.assign({}, process.env, { RED1_HISTORY: path.join(d, 'h'), BIM_OBJECT_OPLOG: path.join(d, 'ops.jsonl'), BIM_DOOR_JOURNAL: J, ERP_SNAPSHOT_DIR: path.join(d, 'snap') });
const r = spawnSync(process.execPath, [path.join(DOORDIR, 'red1.js'), '--journal', J], { input: 'bim\nmis.sum kind=Order column=GrandTotal\nexit\n', env, encoding: 'utf8', timeout: 240000 });
const ran = (() => { try { return fs.readFileSync(J, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(x => x.state === 'done' && x.envelope && x.envelope.verb === 'mis.sum' && x.envelope.status === 'ok').length; } catch (e) { return 0; } })();
const where = ((r.stderr || '').match(/§RED1 typed n=\d+ where="[^"]*"/g) || []);
k.L('X2 where=' + JSON.stringify(where) + ' mis.sum ok in journal=' + ran);
k.chk('X2 inside `bim` (prompt red1 bim>), a full mis.sum still runs and answers ok (offers narrow, runs never)', where.some(w => /where="red1 bim>"/.test(w)) && ran === 1, 'where=' + where.length + ' ran=' + ran);
// ── X6 / X7 / X9 / X8: an in-process shell on the real seed (the shell's own run(), its own door; temp journal + op-log) ──
Object.assign(process.env, { RED1_HISTORY: env.RED1_HISTORY, BIM_OBJECT_OPLOG: env.BIM_OBJECT_OPLOG, BIM_DOOR_JOURNAL: J, ERP_SNAPSHOT_DIR: env.ERP_SNAPSHOT_DIR });
(async () => {
  const R1 = require(path.join(DOORDIR, 'red1.js')), AS = require(path.join(DOORDIR, 'assist_core.js'));
  const sh = R1.makeShell({ interactive: true, warm: false, journal: J }), scr = [], arrows = [];
  const io = { print: (t) => scr.push(String(t)), arrow: (l) => arrows.push(String(l)), show: async () => {}, menu: (ls) => ls.forEach(l => scr.push(l)) };
  const go = async (t) => { await sh.run(t, io); return sh.prompt(); };
  const jl = () => { try { return fs.readFileSync(J, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(x => x.state === 'done' && x.envelope); } catch (e) { return []; } };
  // X6
  await go('cd Order 100'); const s6 = sh.state(), names = vocab.verbs.map(v => v.verb).concat(wordNames), off6 = sh.core.offered(s6, wordNames, verbNames);
  const ja = jl().filter(x => x.envelope.verb === 'erp.actions' && x.envelope.status === 'ok').pop(), legal = ja ? ja.envelope.answer.actions : null;
  k.L('X6 prompt=' + JSON.stringify(sh.prompt()) + ' journal actions=' + JSON.stringify(legal) + ' offered actions=' + JSON.stringify(off6.actions) + ' do codes=' + JSON.stringify(off6.codes) + ' places=' + JSON.stringify(off6.places));
  if (!legal || !legal.length) k.incon('X6', 'no erp.actions answer in the journal for Order 100 (rec=' + JSON.stringify(s6.rec) + ')');
  else k.chk('X6 in `cd Order 100` the offered actions == erp.actions for that record, and every offered do code is one of them', JSON.stringify(off6.actions) === JSON.stringify(legal) && Object.keys(off6.codes || {}).length > 0 && Object.keys(off6.codes).every(c => legal.indexOf(c) >= 0), JSON.stringify(off6.actions));
  // X7
  const sq = (q) => { const r = spawnSync('sqlite3', [path.join(ROOT, 'erp/ad_seed.db'), q], { encoding: 'utf8' }); return (r.stdout || '').split('\n').filter(Boolean); };
  const tab = sq("SELECT t.ad_tab_id FROM ad_tab t JOIN ad_table tb ON tb.ad_table_id=t.ad_table_id WHERE tb.tablename='C_Order' AND t.isactive='Y' ORDER BY t.tablevel, t.seqno, t.ad_tab_id LIMIT 1")[0];
  const want = tab ? sq("SELECT DISTINCT p.name FROM ad_field f JOIN ad_column c ON c.ad_column_id=f.ad_column_id JOIN ad_process p ON p.ad_process_id=c.ad_process_id WHERE f.ad_tab_id=" + Number(tab) + " AND f.isactive='Y' AND f.isdisplayed='Y' AND c.ad_reference_id=28 AND c.columnname NOT IN ('DocAction','CreateFrom','Posted') ORDER BY p.name") : [];
  const got7 = (off6.processes || []).slice().sort(), runSug = AS.suggest({ processes: off6.processes }, 'run Co');
  k.L('X7 tab=' + tab + ' seed buttons=' + JSON.stringify(want) + ' offered=' + JSON.stringify(got7) + ' `run Co` → ' + JSON.stringify(runSug && (runSug.replace || runSug.ghost)));
  if (!want.length) k.incon('X7', 'the seed shows no process button on the Order tab');
  else k.chk('X7 the offered processes == the displayed process buttons of the tab (minus DocAction/CreateFrom/Posted); `run Co` → "Copy Lines"', JSON.stringify(got7) === JSON.stringify(want.slice().sort()) && !!runSug && !!runSug.replace && runSug.replace.to === '"Copy Lines"', JSON.stringify(got7));
  // X9
  const ctx9 = { codes: off6.codes || {} }, sC = AS.suggest(ctx9, 'do C'), sR = AS.suggest(ctx9, 'do R'), cand = [].concat(sC ? sC.candidates : [], sR ? sR.candidates : []).map(c => c.name);
  const DC = words.words.do.forms[0].codes, outside = cand.filter(n => { const code = DC[n] ? n : Object.keys(DC).filter(c => DC[c] === n)[0]; return code && (legal || []).indexOf(code) < 0; });
  k.L('X9 `do C`/`do R` candidates=' + JSON.stringify(cand) + ' outside the record\'s actions=' + JSON.stringify(outside));
  k.chk('X9 after `do C` / `do R` in the record, no code outside its actions is suggested (and something is)', cand.length > 0 && outside.length === 0, JSON.stringify(outside));
  // X8
  await go('cd /'); const p8 = [await go('menu'), await go('cd Quote'), await go('cd "Sales Orders"')]; const a0 = arrows.length; p8.push(await go('cd "Sales Order"'));
  const desc = arrows.slice(a0).filter(l => /^mis\.describe /.test(l)), bl = sh.core.backLine(sh.state());
  for (let i = 0; i < 4; i++) p8.push(await go('cd ..'));
  const want8 = ['red1 menu> ', 'red1 menu/Quote-to-Invoice (Sales)> ', 'red1 menu/Quote-to-Invoice (Sales)/Sales Orders> ', 'red1 menu/Quote-to-Invoice (Sales)/Sales Orders/Order> ', 'red1 menu/Quote-to-Invoice (Sales)/Sales Orders> ', 'red1 menu/Quote-to-Invoice (Sales)> ', 'red1 menu> ', 'red1> '];
  k.L('X8 prompts=' + JSON.stringify(p8) + ' describe=' + JSON.stringify(desc) + ' backLine in window=' + bl);
  k.chk('X8 the menu walked as places: the path in the prompt, a window = the ordinary describe line, cd .. climbs one node a step to red1>', JSON.stringify(p8) === JSON.stringify(want8) && desc.length === 1 && /kind=C_Order$/.test(desc[0]) && bl === 'cd ..', JSON.stringify(p8));
  // X10: every message the walk and the record print is reached (W-MSG-CATALOG M2 hands these keys here)
  const mark = scr.length; await go('menu role=999999'); const fail10 = scr.slice(mark).filter(l => /^menu: the menu did not open: /.test(l));
  await go('menu'); await go('cd Quote'); await go('cd "Sales Orders"'); const m2 = scr.length; await go('cd "Reopen Order"'); const run10 = scr.slice(m2);
  await go('cd /'); await go('menu'); await go('cd "System Admin"'); await go('cd "General Rules"'); await go('cd "System Rules"'); const m3 = scr.length; await go('cd "Language Setup"'); const page10 = scr.slice(m3); await go('cd /');
  const seen = (re) => scr.some(l => re.test(l)), keys10 = { rec_actions: seen(/^it may do: /), menu_walk_head: seen(/entries; cd <name> goes in/), menu_walk_folder: seen(/^  ▸ /), menu_walk_window: seen(/^  W .+ · C_Order$/), menu_walk_leaf: seen(/^  [PR] /), menu_walk_fail: fail10.length === 1, menu_leaf_run: run10.indexOf('Reopen Order is a process: run "Reopen Order"') >= 0, menu_leaf_page: page10.indexOf('Language Setup opens in the page, not at the prompt') >= 0 };
  k.L('X10 keys=' + JSON.stringify(keys10) + ' fail=' + JSON.stringify(fail10) + ' run=' + JSON.stringify(run10) + ' page=' + JSON.stringify(page10));
  k.chk('X10 every message of the record and the walk is reached on the real seed (' + Object.keys(keys10).length + ' keys)', Object.keys(keys10).every(x => keys10[x]), JSON.stringify(keys10));
  k.end();
})().catch(e => { k.chk('X6-X9 ran', false, e.stack); k.end(); });
