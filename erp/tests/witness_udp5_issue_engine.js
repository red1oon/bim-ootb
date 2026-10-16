// ⚠ DO NOT REMOVE — Scope guard
// Scope: W-UDP5-ENGINE (bim-compiler prompts/ERP_DEPTH_FILM.md §UDP-5). READ tests/witness_udp5_issue_engine.log before any conclusion.
// THE ISSUE: is AD_Issue "selective, not spammy, small" as the user asked - (A) of EVERY static §-console site in erp/, only the ones
//   that report an error/failure qualify (never a counter like failed=0, never a witness-harness line, never §UDP5 itself); (B) a line
//   repeated in one session writes ONE row, a known key across sessions is a touch, the 51st distinct issue drops the oldest (cap 50);
//   (C) the row keeps MIssue's shape and truncation (INFOLENGTH 2000, java.lang./java.sql. stripped, Record_ID 1, no user name).
// Run: node tests/witness_udp5_issue_engine.js 2>&1 | tee tests/witness_udp5_issue_engine.log        (cwd = bim-ootb/erp)
'use strict';
const fs = require('fs'), path = require('path'), I = require('../ad_issue.js');
let pass = 0, fail = 0; const ok = (id, n, c, d) => { console.log((c ? '  ✅ ' : '  ❌ ') + id + ' ' + n + (d ? ' — ' + d : '')); c ? pass++ : fail++; };
const dir = path.join(__dirname, '..');
const files = fs.readdirSync(dir).filter(f => /\.(js|html)$/.test(f)).map(f => path.join(dir, f)).concat(fs.readdirSync(path.join(dir, 'overlay')).map(f => path.join(dir, 'overlay', f)));
const sites = [];
files.forEach(f => { const t = fs.readFileSync(f, 'utf8'); const re = /console\.(log|error|warn)\(\s*'(§[^']*)'/g; let m;
  while ((m = re.exec(t))) sites.push({ f: path.basename(f), level: m[1] === 'error' ? 'error' : 'log', text: m[2] }); });
const q = sites.map(s => Object.assign(s, I.qualify(s.text, s.level)));
const yes = q.filter(s => s.ok), worded = q.filter(s => /error|fail|abort/i.test(s.text.replace(/^§[A-Za-z0-9_-]+/, '')));
console.log('§UDP5E-SITES total=' + q.length + ' qualify=' + yes.length + ' errorWorded=' + worded.length);
const tags = {}; yes.forEach(s => { tags[s.tag] = (tags[s.tag] || 0) + 1; });
console.log('§UDP5E-QUALIFY tags=' + JSON.stringify(tags));
const wordedNo = worded.filter(s => !s.ok); console.log('§UDP5E-WORDED-NOT ' + JSON.stringify(wordedNo.map(s => s.f + ':' + s.text.slice(0, 70))));
ok('A1', 'only error/failure sites qualify: every qualifying site is console.error or error-worded', yes.every(s => s.level === 'error' || worded.indexOf(s) >= 0), yes.length + ' of ' + q.length);
ok('A2', 'the selective share stays small (< 15% of all § sites)', yes.length > 0 && yes.length < q.length * 0.15, yes.length + '/' + q.length);
ok('A3', 'counters and health/negation lines never qualify (failed=0, errors=0, fail:0, status=ok, "no uncaught errors")', ['§X ok=3 failed=0', '§X errors=0 done', '§X fail: 0',
  '§MON-FIELD_ERRORS value="0" status=ok — no uncaught errors this session', '§X no sync failures'].every(t => !I.qualify(t, 'log').ok));
ok('A4', 'harness + self lines never qualify', ['§W-FOO FAIL x', '§UDP5-ISSUE error', '§XCL-CHECK FAIL', '§FOO-VERDICT FAIL 1/2', '§CU-CHECK fail'].every(t => !I.qualify(t, 'error').ok));
ok('A5', 'real failures qualify', ['§OPLOG-APPEND error disk full', '§SEED-RESET fetch-fail 404', '§SHARD ABORT bad hash'].every(t => I.qualify(t, 'log').ok),
  JSON.stringify(['§OPLOG-APPEND error disk full', '§SEED-RESET fetch-fail 404', '§SHARD ABORT bad hash'].map(t => I.qualify(t, 'log').ok)));
// B — dedup / touch / cap
const seen = {}, c1 = { tag: '§OPLOG-APPEND', text: '§OPLOG-APPEND error op 17 disk full' };
const p1 = I.plan([], c1, seen), p2 = I.plan([], { tag: c1.tag, text: '§OPLOG-APPEND error op 99 disk full' }, seen);
ok('B1', 'same key twice in a session: one create, then nothing', p1.intents.length === 1 && p1.intents[0].op === 'create' && p2.intents.length === 0 && p2.dup === 1, JSON.stringify([p1.intents.map(i => i.op), p2.intents]));
const row = Object.assign({ ad_issue_id: 7, updated: '2026-10-01 00:00:00' }, p1.intents[0].fields);
const p3 = I.plan([row], c1, {});
ok('B2', 'known key in a new session: one touch, no new row', p3.intents.length === 1 && p3.intents[0].op === 'touch' && p3.intents[0].id === 7);
const rows50 = Array.from({ length: 50 }, (_, i) => ({ ad_issue_id: i + 1, sourceclassname: '§T' + i, issuesummary: 'x', updated: '2026-10-01 00:00:' + String(i).padStart(2, '0') }));
const p4 = I.plan(rows50, { tag: '§NEW', text: '§NEW error' }, {});
ok('B3', '51st distinct issue: create + delete the oldest (cap 50)', p4.intents.length === 2 && p4.intents[1].op === 'delete' && p4.intents[1].id === 1, JSON.stringify(p4.intents.map(i => i.op + (i.id || ''))));
// C — shape
const big = '§X error java.lang.NullPointerException at java.sql.Foo ' + 'z'.repeat(3000);
const f = I.fields({ tag: '§X', text: big, stack: 'Error: e\n' + 'a\n'.repeat(3000), windowId: 143, release: 'v859', systemName: 'System', host: 'h' });
ok('C1', 'IssueSummary cut to 1999 chars, java.lang./java.sql. stripped (MIssue.setIssueSummary)', f.issuesummary.length === 1999 && f.issuesummary.indexOf('java.') < 0, f.issuesummary.length);
ok('C2', 'StackTrace cut, ErrorTrace <= 6 lines, Record_ID 1, no user name, status E, window kept', f.stacktrace.length === 1999 && f.errortrace.split('\n').length <= 6 && f.record_id === 1 && f.username === '-' && f.systemstatus === 'E' && f.ad_window_id === 143);
console.log('§UDP5E-VERDICT ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
