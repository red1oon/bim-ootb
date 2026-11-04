#!/usr/bin/env node
// ⚠ DO NOT REMOVE — the stages runner (prompts/DXF2BIM_ARCHITECT_REVIEW.md §D110 G5). Read the logs after every run: exit code is not evidence.
// Issue it exposes: which stage moved what was told from memory. A stage adds sheets, layers, choices or a reader commit, and is NAMED by its kind, so the status shows whether a drawing or the code moved the needle. A film's numbers regenerate from the stages file alone.
// usage: run_stages.js <stages.json> --out <dir> [--from <n>]
// stages.json: { "format": "dxf2bim-stages/1", "stages": [{ "name", "kind": "baseline|sheet|rule|fact", "reader": "<commit>|tree", "add": ["<file>"], "drop": ["<substr>"], "layer": ["<--layer arg>"], "layer_drop": ["<substr>"], "choice": ["<k=v>"], "choice_drop": ["<k>"] }] }. Stages accumulate; a reader holds until a later stage names another.
// writes <out>/stage_<n>/{sheets/, run/, cli.log, score.log, score.json, status.txt} and <out>/status.txt (every §STAGE + §STATUS, no clock, no path).
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const REPO = path.join(__dirname, '..', '..');
const arg = n => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : null; };
const file = process.argv[2], out = arg('out'), from = Number(arg('from') || 0);
if (!file || !out) { console.log('§STAGES FAIL usage: run_stages.js <stages.json> --out <dir>'); process.exit(1); }
const S = JSON.parse(fs.readFileSync(file, 'utf8')); if (S.format !== 'dxf2bim-stages/1') { console.log('§STAGES FAIL format ' + S.format); process.exit(1); }
const SD = require('./status_diff.js'), SCORE = path.join(__dirname, '..', 'tests', 'witness_poc_scoreboard.js');
const readerDir = c => {   // an old reader is unpacked, never checked out: no worktree, no LFS fetch
  if (c === 'tree') return path.join(REPO, 'modeller');
  const dir = path.join(os.homedir(), '.cache', 'dxf2bim_readers', c);
  if (!fs.existsSync(path.join(dir, 'modeller', 'dxf2bim_cli.js'))) { fs.mkdirSync(dir, { recursive: true }); cp.execSync('git -C ' + JSON.stringify(REPO) + ' archive ' + c + ' modeller viewer/rates | tar -x -C ' + JSON.stringify(dir), { stdio: 'inherit' }); }
  return path.join(dir, 'modeller');
};
fs.mkdirSync(out, { recursive: true });
let sheets = [], layers = [], choices = [], reader = 'tree', prev = null; const report = [];
const short = v => (v === 'tree' ? 'tree' : String(v).slice(0, 8));
S.stages.forEach((st, n) => {
  (st.drop || []).forEach(d => { sheets = sheets.filter(f => !path.basename(f).includes(d)); });
  (st.layer_drop || []).forEach(d => { layers = layers.filter(l => !l.includes(d)); });
  (st.choice_drop || []).forEach(k => { choices = choices.filter(c => !c.startsWith(k + '=')); });   // a rule stage lifts the set-back: the same code, one setting moved
  sheets = sheets.concat(st.add || []); layers = layers.concat(st.layer || []); choices = choices.concat(st.choice || []); if (st.reader) reader = st.reader;
  const dir = path.join(out, 'stage_' + n), sh = path.join(dir, 'sheets'), run = path.join(dir, 'run');
  if (n >= from) {
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(sh, { recursive: true });
    sheets.forEach(f => fs.symlinkSync(path.resolve(f), path.join(sh, path.basename(f))));
    const cli = ['--sheets'].concat(sheets.map(f => path.join(sh, path.basename(f))), ['--out', run, '--accept-suggestions'], [].concat(...layers.map(l => ['--layer', l])), [].concat(...choices.map(c => ['--choice', c])));
    const r = cp.spawnSync('node', [path.join(readerDir(reader), 'dxf2bim_cli.js')].concat(cli), { encoding: 'utf8', maxBuffer: 1 << 30, env: Object.assign({}, process.env, { NODE_OPTIONS: '--max-old-space-size=8192' }) });
    fs.writeFileSync(path.join(dir, 'cli.log'), r.stdout + r.stderr);
    const q = cp.spawnSync('node', [SCORE, '--sheets', sh, '--run', run, '--json', path.join(dir, 'score.json')], { encoding: 'utf8', maxBuffer: 1 << 30, env: Object.assign({}, process.env, { NODE_OPTIONS: '--max-old-space-size=8192' }) });
    fs.writeFileSync(path.join(dir, 'score.log'), q.stdout + q.stderr);
  }
  const score = JSON.parse(fs.readFileSync(path.join(dir, 'score.json'), 'utf8'));
  const head = '§STAGE ' + n + ' kind=' + st.kind + ' reader=' + short(reader) + ' sheets=' + score.sheets + ' bodies=' + score.bodies + ' gate=' + (score.ok ? 'ok' : 'refused:' + score.refused) + ' name=' + st.name;
  const body = prev ? SD.diff(prev, score) : score.rows.map(r => '§STATUS ' + r.class + ' ' + r.built + ' of ' + r.evidence).join('\n');
  fs.writeFileSync(path.join(dir, 'status.txt'), head + '\n' + body + '\n');
  report.push(head, body); console.log(head);
  if (score.ok) prev = score;   // a refused stage judged nothing: the next stage is compared with the last that did
});
fs.writeFileSync(path.join(out, 'status.txt'), report.join('\n') + '\n');
console.log('§STAGES done stages=' + S.stages.length + ' file=status.txt');
