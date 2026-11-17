// W-CONTRACT-SINK — spec: bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §14.8.2.
// Issue it proves or disproves: Witness().run() printed its PASS/FAIL lines to stdout only, so a witness that keeps its own
// .log file showed `fail=1` with no line naming what failed (found in witness_viewer_i18n.log, §14.8 RESULT).
// S1 the FAIL line reaches the sink · S2 no sink = the same lines on stdout · S3 returned `lines` = the sink's lines ·
// S4 the callers on the tree: of N that call .run() and write their own file, K pass a sink (printed, not pass/fail).
// Falsifier: SINK_BREAK=drop (the contract ignores the sink) must FAIL S1. Log: witness_kit/tests/logs/witness_contract_sink.log
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const LOGDIR = path.join(__dirname, 'logs'); fs.mkdirSync(LOGDIR, { recursive: true });
const LOGF = path.join(LOGDIR, 'witness_contract_sink.log');
const OUT = []; const say = (s) => { OUT.push(s); console.log(s); };
let pass = 0, fail = 0; const W = (ok, m) => { ok ? pass++ : fail++; say((ok ? 'PASS ' : 'FAIL ') + m); return ok; };

// the probe: one row, one invariant that fails, a redControl that fails too
const PROBE = `const { Witness } = require(${JSON.stringify(path.join(ROOT, 'witness_kit', 'contract.js'))});
module.exports = (sink) => Witness('sink_probe').population(() => [{ a: 1 }])
  .schema({ type: 'object', required: ['a'], properties: { a: { type: 'integer' } } })
  .invariant('a-is-two', rs => rs.every(r => r.a === 2))
  .redControl(rs => rs.map(r => Object.assign({}, r, { a: 'x' }))).run(sink);
if (require.main === module) { module.exports(); process.exitCode = 0; }`;
const probeF = path.join(LOGDIR, 'sink_probe.tmp.js'); fs.writeFileSync(probeF, PROBE);

// S1 + S3 — in this process, with a sink
const got = []; const saved = console.log; const leaked = [];
console.log = (l) => leaked.push(String(l));           // anything the contract prints past the sink lands here
let res; try { res = require(probeF)((l) => got.push(l)); } finally { console.log = saved; }
process.exitCode = 0;                                   // the probe fails on purpose; its exitCode is not this witness's verdict
say('  §SINK_PROBE sink=' + got.length + ' stdout-past-sink=' + leaked.length + ' lines=' + JSON.stringify(got));
W(got.includes('  FAIL a-is-two') && got.some(l => /^§WITNESS_SINK_PROBE pass=\d+ fail=1 ran=1$/.test(l)) && leaked.length === 0,
  'S1 the FAIL line and the §WITNESS summary reach the sink, none goes past it to stdout (sink=' + got.length + ', past=' + leaked.length + ')');
W(res && Array.isArray(res.lines) && JSON.stringify(res.lines) === JSON.stringify(got) && res.fail === 1,
  'S3 the returned lines equal the sink lines (' + (res && res.lines ? res.lines.length : 'none') + ')');

// S2 — no sink: byte-identical to the contract before this change (origin/main's copy), both run in a child process
const env = Object.assign({}, process.env); delete env.SINK_BREAK;
const runChild = (f) => cp.spawnSync(process.execPath, [f], { encoding: 'utf8', env, cwd: ROOT });
let before = '';
try {
  const mainF = path.join(LOGDIR, 'contract_main.tmp.js');
  fs.writeFileSync(mainF, cp.execSync('git show origin/main:witness_kit/contract.js', { cwd: ROOT, encoding: 'utf8' }));
  const probeMainF = path.join(LOGDIR, 'sink_probe_main.tmp.js');
  fs.writeFileSync(probeMainF, PROBE.replace(JSON.stringify(path.join(ROOT, 'witness_kit', 'contract.js')), JSON.stringify(mainF)));
  before = runChild(probeMainF).stdout; fs.unlinkSync(mainF); fs.unlinkSync(probeMainF);
} catch (e) { say('  §SINK_NOSINK no origin/main copy: ' + e.message); }
const child = runChild(probeF);
say('  §SINK_NOSINK now=' + child.stdout.length + 'B before=' + before.length + 'B status=' + child.status + (child.stderr ? ' stderr=' + JSON.stringify(child.stderr.slice(0, 200)) : ''));
if (!before) say('INCONCLUSIVE S2 no before-copy to compare with');
else W(child.stdout === before && child.stdout === (res && res.lines ? res.lines.join('\n') + '\n' : '?'),
  'S2 with no sink stdout is byte-identical to the contract before this change (' + child.stdout.length + ' bytes) and equals the returned lines');

// S4 — the callers on the tree (printed; the population is stated, never a pass)
const files = cp.execSync('git ls-files "*.js"', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
  .filter(f => !f.startsWith('witness_kit/') && !f.includes('node_modules/'));
const callers = [];
for (const f of files) {
  let s; try { s = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { continue; }
  if (!/witness_kit\/contract/.test(s) || !/\.run\(/.test(s)) continue;
  if (!/writeFileSync|appendFileSync|createWriteStream/.test(s)) continue;
  const sinkRuns = (s.match(/\.run\(\s*[A-Za-z_$][\w$.]*\s*\)/g) || []).length, bareRuns = (s.match(/\.run\(\s*\)/g) || []).length;
  const patched = /console\.log\s*=(?!=)/.test(s);
  callers.push({ f, sinkRuns, bareRuns, patched });
}
const K = callers.filter(c => c.bareRuns === 0 && c.sinkRuns > 0), P = callers.filter(c => c.bareRuns > 0 && c.patched), Z = callers.filter(c => c.bareRuns > 0 && !c.patched);
if (!callers.length) say('VACUOUS S4 no caller found that writes its own file');
say('  §SINK_CALLERS N=' + callers.length + ' with-sink=' + K.length + ' bare-but-console-patched=' + P.length + ' bare-no-patch=' + Z.length);
K.forEach(c => say('    §SINK_CALLER sink ' + c.f));
P.forEach(c => say('    §SINK_CALLER patched ' + c.f));
Z.forEach(c => say('    §SINK_CALLER bare ' + c.f));

try { fs.unlinkSync(probeF); } catch (e) { /* */ }
const verdict = fail ? 'FAIL' : 'PASS';
say('§W-CONTRACT-SINK ' + verdict + ' pass=' + pass + ' fail=' + fail + (process.env.SINK_BREAK ? ' falsifier=' + process.env.SINK_BREAK : ''));
fs.writeFileSync(LOGF, OUT.join('\n') + '\n');
process.exit(fail ? 1 : 0);
