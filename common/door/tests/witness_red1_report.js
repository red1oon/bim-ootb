// ⚠ DO NOT REMOVE — W-RED1-REPORT (bim-compiler prompts/CLI_ERP_IVR.md §28: a gap goes to the owner in one step). READ THE LOG; an exit code is not evidence.
//   P1 ISSUE (the person is blamed for a gap, or told to report their own typo): a no-port `run` prints the gap line; a typo refusal does not
//   P2 ISSUE (a draft that would not open, or loses the facts): `report` builds a GitHub URL on red1oon/bim-ootb/issues/new <= 8000 chars and a mailto: <= 1800 chars, both holding the line and the reason
//   P3 ISSUE (a third report shape): the GitHub body has the Viewer reporter's sections (## What happened?, ## Environment, the log in <details>, label bug)
//   P4 ISSUE (a script or an AI gets a prompt, or loses the mark): one-shot `erp.process` on a no-port process carries gap:true in the envelope and prints no hint
//   Falsifier: REPORT_BREAK=allgaps (every refusal called a gap: must FAIL P1).
//   Run: node common/door/tests/witness_red1_report.js > common/door/tests/logs/red1_report.log 2>&1
'use strict';
const path = require('path'), cp = require('child_process'), fs = require('fs'), os = require('os');
const { kit, ROOT, DOOR } = require('./_kit');
const k = kit('W-RED1-REPORT'), RED1 = path.join(ROOT, 'common/door/red1.js');
const env = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'r1rep_')); return { BIM_OBJECT_OPLOG: path.join(d, 'o.jsonl'), BIM_DOOR_JOURNAL: path.join(d, 'j.jsonl'), RED1_WARM: 'off', RED1_NO_OPEN: '1' }; };
const run = (argv, input) => { const r = cp.spawnSync(process.execPath, argv, { input: input || '', encoding: 'utf8', env: Object.assign({}, process.env, env()), timeout: 300000 }); return r.stdout || ''; };
const HINT = 'This is a gap in red1, not your mistake';
// P1: the gap line after a no-port run, none after a typo (each alone, so one cannot hide the other)
const g = run([RED1], 'cd Project\nrun "Close Project" 990000\nexit\n'), t = run([RED1], 'cd Project\nls Valu=x\nexit\n');
k.L('P1 no-port hint=' + g.includes(HINT) + ' · typo hint=' + t.includes(HINT));
k.chk('P1 a no-port `run` prints the gap line; a typo refusal does not', g.includes(HINT) && !t.includes(HINT), 'noport=' + g.includes(HINT) + ' typo=' + t.includes(HINT));
// P2 + P3: both drafts
const gh = run([RED1], 'cd Project\nrun "Close Project" 990000\nreport\n1\nexit\n'), em = run([RED1], 'cd Project\nrun "Close Project" 990000\nreport\n2\nexit\n');
const u1 = (gh.match(/^https:\/\/github\.com\/red1oon\/bim-ootb\/issues\/new\?\S+$/m) || [''])[0], u2 = (em.match(/^mailto:\S+$/m) || [''])[0];
const b1 = u1 ? decodeURIComponent((/[?&]body=([^&]*)/.exec(u1) || [])[1] || '') : '', b2 = u2 ? decodeURIComponent((/[?&]body=([^&]*)/.exec(u2) || [])[1] || '') : '';
const has = (b) => /erp\.process name="Close Project"/.test(b) && /no JS port yet \(class org\.compiere\.process\.ProjectClose\)/.test(b);
k.L('P2 github chars=' + u1.length + ' email chars=' + u2.length + ' github holds line+reason=' + has(b1) + ' email=' + has(b2));
k.chk('P2 report builds a GitHub issue URL (<= 8000) and a mailto (<= 1800), both holding the line and the reason', u1.length > 0 && u1.length <= 8000 && u2.length > 0 && u2.length <= 1800 && has(b1) && has(b2), 'gh=' + u1.length + ' mail=' + u2.length);
k.chk('P3 the GitHub body has the Viewer reporter\'s sections (What happened?, Environment, the log in <details>) and the bug label', /^## What happened\?/m.test(b1) && /^## Environment/m.test(b1) && /<details><summary>/.test(b1) && /&labels=bug$/.test(u1), u1.slice(-12));
// P4: one-shot
const o = run([DOOR, 'erp.process name="Close Project" record=990000']), e = o.split('\n').filter(l => l.charAt(0) === '{').map(l => JSON.parse(l)).pop();
k.chk('P4 one-shot: the envelope carries gap:true (no-port) and no hint is printed', !!e && e.status === 'refused' && e.answer && e.answer.gap === true && e.answer.gapKind === 'no-port' && !o.includes(HINT), JSON.stringify(e && e.answer));
k.end();
