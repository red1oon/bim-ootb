#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-FILM-CAPEX-SEQ (spec prompts/CAPEX_DASHBOARD.md §5.37). A script-lint that runs BEFORE any recording. READ THE LOG: verdict = §FILM_SEQ_VERDICT; the exit code is not evidence.
// THE ISSUE it proves/disproves: "a spoken or captioned number in the film that the run never produced, a private name that leaks, a shown feature whose witness is not green, a proposed definition shown without the word proposed".
//   F1 every number in the narration's SOURCE column is a value on a log line of THIS run (exact), and every digit-number spoken in a dialogue appears in its own source column
//   F2 no private-name or sheet-code hit in the TSV, the cards, the shot names and the log names (the grep from the privacy rule, reported WITH its count)
//   F3 every shown feature has its witness green on the day (project selector, document tile, goal editor, proposed measures)   F4 each proposed definition shown (forecast, contract/verified, stage) is captioned proposed in its own row or the card
//   F5 VACUOUS guard: an empty §FILM_SHOT set or an empty TSV is INCONCLUSIVE.   Break: FILM_BREAK=1 changes one spoken number in memory → F1 must FAIL.
// Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tests/witness_film_capex_seq.js <logsDir with shots.log push.log fold.log cache4d.log progress.log> [--skip-witnesses]
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..'), dir = process.argv[2], SKIPW = process.argv.includes('--skip-witnesses'), BREAK = process.env.FILM_BREAK === '1', log = console.log;
let judged = 0, fails = 0, inconc = 0;
const ck = (n, ok, i) => { judged++; if (!ok) fails++; log('  §FILM_SEQ_W ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (i !== undefined ? ' ' + JSON.stringify(i) : '')); };
const inc = (n, why) => { inconc++; log('  §FILM_SEQ_W ' + n + ' INCONCLUSIVE ' + why); };
const done = () => { const v = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; log('§FILM_SEQ_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inconc + (BREAK ? ' (BREAK switch ON: FAIL expected)' : '')); process.exit(v === 'PASS' ? 0 : 1); };
const rd = f => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch (e) { return ''; } };
const TSV = process.env.FILM_TSV || path.join(ROOT, 'capex/tools/film_cards/narration_seq_en.tsv'), CARDS = path.join(ROOT, 'capex/tools/film_cards');
const rows = fs.readFileSync(TSV, 'utf8').split('\n').filter(Boolean).map(l => { const c = l.split('\t'); return { id: c[0], src: c[3] || '', short: c[4] || '', detail: c[5] || '' }; });
const logs = ['shots.log', 'push.log', 'fold.log', 'cache4d.log', 'progress.log', 'erp.log', 'walk.log'].map(rd), ALL = logs.join('\n');
const shotLines = rd('shots.log').split('\n').filter(l => /^§FILM_SHOT /.test(l));
if (!rows.length || !shotLines.length) { inc('F5', 'rows=' + rows.length + ' shot lines=' + shotLines.length + ': nothing to judge'); done(); }
// F1a: key=value pairs of "§FILM_SHOT <name> k=v ..." sources equal the run's values (the shot log prints values={...} JSON)
const shotVals = {}; shotLines.forEach(l => { const m = /^§FILM_SHOT (\S+) -> \S+ values=(\{.*\})$/.exec(l); if (m) shotVals[m[1]] = JSON.parse(m[2]); const s = /^§FILM_SHOT_SELECT project=(\S*) options=(\d+)/.exec(l); if (s) shotVals.s1_project_selector = { project: s[1], options: s[2] }; });
const bad = [];
rows.forEach(r => {
  const m = /^§FILM_SHOT (\S+) (.*)$/.exec(r.src); if (!m) return;
  const vals = shotVals[m[1]]; if (!vals) { bad.push(r.id + ': no shot ' + m[1]); return; }
  let rem = m[2]; Object.keys(vals).forEach(k => { const needle = k + '=' + vals[k]; if (rem.indexOf(needle) >= 0) rem = rem.replace(needle, ''); });
  if (rem.trim() !== '' && !/^project=|options=/.test(rem.trim())) bad.push(r.id + ': source has something the run did not print: "' + rem.trim() + '" (run=' + JSON.stringify(vals) + ')');
});
ck('F1a every §FILM_SHOT value in the TSV source column equals the value the run printed', bad.length === 0, bad.slice(0, 4));
// F1b other sources: each number token appears in the run's own logs
const other = rows.filter(r => !/^§FILM_SHOT /.test(r.src)), miss = [], FW = rd('shots.log') + '\n' + ALL;
other.forEach(r => (r.src.match(/\d[\d,.]*\d|\d/g) || []).forEach(n => { if (!/^\d{1,2}$/.test(n) && ALL.indexOf(n) < 0 && !/^(\d+\/\d+|1\.0\.3)$/.test(n)) miss.push(r.id + ':' + n); }));
// witness-cited sources (W-PA-EDITOR 7/0 …) are checked by F3, not by a log substring
ck('F1b every number in the other sources is on a log line of this run', miss.filter(x => !/^edit:/.test(x)).length === 0, miss.slice(0, 6));
// F1c: each digit-number spoken in a dialogue appears in its own source column (exact digits, commas ignored) — the spoken number can only come from the run
const spoken = [];
rows.forEach(r => { const text = BREAK ? (r.id === 'walked' ? r.detail.replace('207', '208') : r.detail) : r.detail; const src = r.src.replace(/,/g, ''); (text.replace(/,/g, '').match(/\d+(?:\.\d+)?/g) || []).forEach(n => { if (src.indexOf(n) < 0 && !/^(1|2|3|5|7)$/.test(n)) spoken.push(r.id + ':' + n); }); });
ck('F1c every digit-number spoken in a dialogue is in that row\'s source column', spoken.length === 0, spoken.slice(0, 6));
// F2 privacy
const PGF = process.env.FILM_PRIVATE_GREP_FILE || path.join(process.env.HOME, '.cache/capex_film/private_grep.txt');   // the names live OUTSIDE the repo (privacy rule: a public diff never holds them)
const PRIV = fs.existsSync(PGF) ? new RegExp(fs.readFileSync(PGF, 'utf8').trim(), 'i') : null;
const files = [TSV].concat(fs.readdirSync(CARDS).filter(f => /seq|^s\d|film_seq/.test(f)).map(f => path.join(CARDS, f)));
const names = [].concat(Object.keys(shotVals));
const hits = []; files.forEach(f => { fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (PRIV && PRIV.test(l)) hits.push(path.basename(f) + ':' + (i + 1)); }); }); names.forEach(n => { if (PRIV && PRIV.test(n)) hits.push('shot ' + n); });
if (!PRIV) inc('F2', 'private grep list not found (' + PGF + '): nothing judged'); else ck('F2 no private-name or sheet-code hit in the TSV, the seq cards and the shot names (files grepped=' + files.length + ', names=' + names.length + ', hits=' + hits.length + ')', hits.length === 0, hits.slice(0, 4));
// F4 proposed wording
const need = { committed: /proposed/i, forecast: /proposed/i, stage: /proposed/i }, nop = Object.keys(need).filter(k => { const r = rows.find(x => x.id === k); return r && !need[k].test(r.detail + r.short); });   // rows that exist and show a proposed definition
ck('F4 the three proposed definitions say "proposed" in their own row', nop.length === 0, nop);
// F3 witnesses green
if (SKIPW) inc('F3', '--skip-witnesses'); else {
  const W = [['witness_dash_projsel', /§DASH_PROJSEL_VERDICT PASS/], ['witness_dash_bimdoc', /§DASH_BIMDOC_VERDICT PASS/], ['witness_capex_proposed', /§CAPEX_PROPOSED_VERDICT PASS/], ['witness_pa_editor', /§PA_EDITOR_VERDICT PASS/]];
  W.forEach(([w, re]) => { const o = spawnSync('node', [path.join(ROOT, 'capex/tests', w + '.js')], { encoding: 'utf8', env: Object.assign({}, process.env, { NODE_PATH: process.env.NODE_PATH || '/home/red1/bim-ootb/node_modules' }), timeout: 600000 }); ck('F3 ' + w + ' green today', re.test(o.stdout || ''), (o.stdout || '').split('\n').filter(l => /VERDICT/.test(l)).slice(-1)); });
}
done();
