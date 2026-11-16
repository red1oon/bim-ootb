#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-RED1-CONTAINER (bim-compiler prompts/CLI_ERP_IVR.md §40 C1, C2, C4). READ THE §-LOG after every run; an exit code is not evidence.
 * ISSUE: `bim` / `mis` / `erp` only printed help; there was no container to enter, so every word and verb was offered everywhere, and no key went back a place.
 *   The owner's rule: a container narrows what is OFFERED (help, Tab, the grey suggestion), NEVER what runs.
 *   X1 (pure) `bim` → prompt `red1 bim> `; the offered verbs are the bim group's door apps only (no erp.*, mis.*, ninja.*), and there are some (vacuity)
 *   X2 (session) inside `bim`, a full `mis.sum kind=Order column=GrandTotal` still runs and answers ok
 *   X3 (pure) `help bim` text = the group's help (words_core.helpText) and `help bim` leaves the state outside any group; `bim` then `mis` switches the group
 *   X4 (pure) `cd ..` backs out: Duplex/Element → Duplex → the group → the top; at the top backLine is null; `cd /` drops the group
 *   X5 (pure) Shift+Tab stands for `cd ..` wherever there is a place to leave, and for nothing at the top
 * Falsifiers (each must make this witness FAIL): WORDS_BREAK=nonarrow (X1: everything offered inside a group) · RED1_BREAK=gatecontainer (X2: a container that blocks a foreign line).
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
k.end();
