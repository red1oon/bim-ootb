// Usage: node witness_all.js [--only icc,doc]   Runs every suite, appends one line per suite to witness_log/ledger.jsonl, keeps full output in witness_log/latest/.
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os');
const SUITES = [['oplog_witness', ['node', 'witness_oplog.js']], ['stack', ['node', 'run_stack.js']], ['psd_roundtrip', ['node', 'psd_roundtrip.js']], ['icc', ['sh', '-c', 'sh icc/fetch_profiles.sh >/dev/null && node icc/run_icc.js']],
  ['doc', ['node', 'doc/run_doc.js']], ['export', ['node', 'doc/run_export.js']], ['groups', ['node', 'doc/run_groups.js']], ['nonsep', ['node', 'doc/run_nonsep.js']], ['tiles', ['node', 'tiles/run_tiles.js']], ['adjust', ['node', 'doc/run_adjust.js']], ['curves', ['node', 'doc/run_curves.js']], ['depth16', ['node', 'doc/run_depth16.js']], ['dirty', ['node', 'perf/run_dirty.js']], ['cmfold', ['node', '--max-old-space-size=6000', 'icc/run_cmfold.js']], ['sha', ['node', 'perf/run_sha.js']], ['editor', ['node', 'editor/run_editor.js']], ['erase', ['node', 'filters/run_erase.js']], ['editor_export', ['node', 'editor/run_export.js']], ['editor_v01', ['node', 'editor/run_v01.js']], ['editor_mobile', ['node', 'editor/run_mobile.js']], ['editor_layers', ['node', 'editor/run_layers.js']], ['editor_select', ['node', 'editor/run_select.js']], ['blurbrush', ['node', 'filters/run_blurbrush.js']]];
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean), dir = path.join(__dirname, 'witness_log');
const git = (a) => { const r = spawnSync('git', a, { cwd: __dirname, encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : '?'; };
const commit = git(['rev-parse', '--short', 'HEAD']), dirty = git(['status', '--porcelain', '--', '.']).split('\n').filter((l) => l && !l.includes('witness_log/')).length > 0;
fs.mkdirSync(path.join(dir, 'latest'), { recursive: true }); let bad = 0; const rows = [];
for (const [name, cmd] of SUITES) {
  if (only.length && !only.includes(name)) continue; if (!fs.existsSync(path.join(__dirname, cmd[cmd.length - 1])) && cmd[0] === 'node') continue;
  const t0 = Date.now(), r = spawnSync(cmd[0], cmd.slice(1), { cwd: __dirname, encoding: 'utf8', timeout: 290000, maxBuffer: 1 << 28 }), out = r.stdout || '';
  let gate = r.status === 0 ? 'PASS' : 'FAIL', fails = [], j = null; try { j = JSON.parse(out); gate = j.gate || gate; fails = j.fails || []; } catch (e) { if (/FAIL/.test(out)) gate = 'FAIL'; }
  if (r.error) { gate = 'ERROR'; fails = [String(r.error.message)]; }
  const line = { ts: new Date().toISOString(), commit, dirty, node: process.version, host: os.hostname(), suite: name, exit: r.status, gate, n_fails: fails.length, fails: fails.slice(0, 6), out_sha256: crypto.createHash('sha256').update(out).digest('hex'), secs: +((Date.now() - t0) / 1000).toFixed(1) };
  fs.appendFileSync(path.join(dir, 'ledger.jsonl'), JSON.stringify(line) + '\n'); fs.writeFileSync(path.join(dir, 'latest', name + (j ? '.json' : '.txt')), out + (r.stderr ? '\n--- stderr ---\n' + r.stderr.slice(0, 4000) : ''));
  rows.push(line); if (gate !== 'PASS') bad++;
}
console.log(rows.map((l) => `${l.gate.padEnd(5)} ${l.suite.padEnd(14)} fails=${l.n_fails} ${l.secs}s ${l.out_sha256.slice(0, 10)}`).join('\n') + `\ncommit ${commit}${dirty ? ' (+uncommitted changes)' : ''}`);
process.exit(bad ? 1 : 0);
