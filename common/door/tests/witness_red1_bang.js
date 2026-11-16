#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-RED1-BANG (bim-compiler prompts/CLI_ERP_IVR.md §39). READ THE §-LOG after every run; an exit code is not evidence.
 * ISSUE: red1 had no `!` history (a normal shell's !! / !n / !-n / !text), and `history` listed only this session's lines, not the saved ones Up-arrow recalls.
 *   B1 the pure expansion (words_core.expandBang) over a fixed history: !!, !3, !-2, !mis.s give the expected line; !zz gives none; `x !! y` and `"!!"` are left as typed
 *   B2 a piped session with RED1_HISTORY: `!!` re-runs the previous line (journal: the expanded line twice); `history` numbers the file's lines then this session's, the expanded line kept
 *   B3 `!nothing-like-this` runs no door line (the journal does not grow) and prints the no-match message
 * Falsifier (must make this witness FAIL): RED1_BREAK=nobang (expansion off) — B1 and B2.
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const { kit, ROOT } = require('./_kit');
const k = kit('W-RED1-BANG');
const W = require(path.join(ROOT, 'common/door/words_core.js')), brk = process.env.RED1_BREAK || '';
// ── B1 pure ──
const H = ['cd Order', 'mis.sum kind=Order column=GrandTotal', 'pwd', 'mis.list kind=Order limit=2'];
const e = (l) => W.expandBang(H, l, brk), L = (r) => r && r.line, cases = [
  ['!!', 'mis.list kind=Order limit=2'], ['!3', 'pwd'], ['!-2', 'pwd'], ['!mis.s', 'mis.sum kind=Order column=GrandTotal'], ['!! extra', 'mis.list kind=Order limit=2 extra']];
const bad = cases.filter(([i, want]) => L(e(i)) !== want), none = e('!zz'), left = [e('x !! y'), e('"!!"'), e('!')];
k.chk('B1 the expansion: ' + cases.map(c => c[0]).join(' ') + ' give the expected lines; !zz none; `x !! y`, `"!!"` and `!` left as typed', bad.length === 0 && none && none.none === true && left.every(r => r === null), 'bad=' + bad.map(c => c[0] + '->' + L(e(c[0]))).join(',') + ' zz=' + JSON.stringify(none));
// ── B2/B3 a piped session ──
const d = fs.mkdtempSync(path.join(os.tmpdir(), 'red1bang_')), hist = path.join(d, 'hist'), J = path.join(d, 'j.jsonl');
fs.writeFileSync(hist, 'pwd\nmis.sum kind=Order column=GrandTotal\n');
const env = Object.assign({}, process.env, { RED1_HISTORY: hist, BIM_OBJECT_OPLOG: path.join(d, 'ops.jsonl'), BIM_DOOR_JOURNAL: J, ERP_SNAPSHOT_DIR: path.join(d, 'snap') });
const sess = (input) => spawnSync(process.execPath, [path.join(ROOT, 'common/door/red1.js'), '--journal', J], { input, env, encoding: 'utf8', timeout: 240000 });
const jl = () => { try { return fs.readFileSync(J, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch (x) { return []; } };
const s1 = sess('mis.list kind=Order limit=1\n!!\nhistory\nexit\n'), out = s1.stdout || '';
const hl = out.split('\n').filter(l => /^\s+\d+\s{2}/.test(l)), lines = jl().map(r => r.line || (r.request && r.request.line) || r.text || JSON.stringify(r).slice(0, 0)).filter(Boolean);
const runs = jl().filter(r => /mis\.list kind=Order limit=1/.test(JSON.stringify(r)));
k.L('session1 history_lines=' + JSON.stringify(hl) + ' echo=' + /→ mis\.list kind=Order limit=1/.test(out) + ' journal_rows_with_line=' + runs.length + ' journal_rows=' + jl().length);
const bangLog = /§RED1 bang asked="!!" line="mis\.list kind=Order limit=1"/.test(s1.stderr || ''), shown = ((out.match(/80000/g)) || []).length;   // a repeated read is answered from the shell's held answer (§RED1 held), so the journal is not the count
k.chk('B2 `!!` re-runs the previous line (its § line names the expansion, the answer shows twice, the journal never holds "!!"), and `history` numbers the saved lines then this session\'s with the EXPANDED line: 1 pwd, 2 mis.sum, 3 mis.list, 4 mis.list',
  hl.length === 4 && /^\s+1\s{2}pwd$/.test(hl[0]) && /^\s+3\s{2}mis\.list kind=Order limit=1$/.test(hl[2]) && /^\s+4\s{2}mis\.list kind=Order limit=1$/.test(hl[3]) && bangLog && shown >= 2 && !jl().some(r => /"!!"/.test(JSON.stringify(r))),
  'history=' + hl.length + ' bangLog=' + bangLog + ' answers_shown=' + shown);
const n0 = jl().length, s2 = sess('!nothing-like-this\nexit\n'), n1 = jl().length;
k.chk('B3 `!nothing-like-this` runs nothing (the journal does not grow) and says nothing matched', n1 === n0 && /nothing in history matches !nothing-like-this/.test(s2.stdout || ''), 'journal ' + n0 + ' -> ' + n1 + ' said=' + JSON.stringify((s2.stdout || '').split('\n').filter(l => /history/.test(l))[0] || ''));
k.end();
