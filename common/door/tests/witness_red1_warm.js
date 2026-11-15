// ⚠ DO NOT REMOVE — W-RED1-WARM (bim-compiler prompts/CLI_ERP_IVR.md §22.8, §22.11 step R7: one warm Viewer page per building in a red1 session). READ THE LOG; an exit code is not evidence.
//   W1 ISSUE (the warm page answers differently from a fresh page: the shell would show numbers a line run alone does not give)
//   W2 ISSUE (the warm page saves nothing: a later BIM line in a session is not much faster than a line run alone) · W3 ISSUE (the warm page outlives the shell: a stray browser left running)
//   Falsifier: VIEWER_WARM_BREAK=lie (the warm page adds 1 to the mesh clashes: must FAIL W1). A claim with nothing to judge says INCONCLUSIVE, never PASS.
//   Needs the Viewer headless. Run: node common/door/tests/witness_red1_warm.js > common/door/tests/logs/red1_warm.log 2>&1
'use strict';
const path = require('path'), cp = require('child_process'), fs = require('fs'), os = require('os');
const { kit, ROOT, DOOR } = require('./_kit');
const k = kit('W-RED1-WARM'), RED1 = path.join(ROOT, 'common/door/red1.js'), BRK = process.env.VIEWER_WARM_BREAK || '';
const run = (argv, env) => new Promise((res) => { let o = '', e = ''; const en = Object.assign({}, process.env, env || {}); delete en.VIEWER_SESSION; const p = cp.spawn(process.execPath, argv, { env: en, stdio: ['ignore', 'pipe', 'pipe'] }); p.stdout.on('data', d => { o += d; }); p.stderr.on('data', d => { e += d; }); p.on('close', c => res({ code: c, out: o, err: e, pid: p.pid })); });
const envsOf = (r) => r.out.split('\n').filter(l => l.charAt(0) === '{').map(l => JSON.parse(l));
const core = (e) => e && e.answer ? JSON.stringify({ v: e.answer.verdict, s: e.answer.summary, value: e.answer.value, rows: e.answer.rows, total: e.answer.rowsTotal }) : 'none';
(async () => {
  const L = ['viewer.clashes building=Duplex discA=ARC discB=MEP rows=all', 'viewer.clashes building=Duplex discA=ARC discB=STR rows=all'];
  const s = await run([RED1, 'cd Duplex; ' + L[0] + '; ' + L[1]], BRK ? { VIEWER_WARM_BREAK: BRK } : {}), S = envsOf(s);
  const warmStart = (s.err.match(/^§RED1 warm start .*$/m) || [''])[0];
  k.L('session ' + warmStart + ' answers=' + S.map(e => e.verb + ':' + e.status + ':' + e.ms + 'ms').join(','));
  const F = []; for (const l of L) F.push(envsOf(await run([DOOR, '--actor', 'human', l])).pop());
  k.L('fresh answers=' + F.map(e => e && (e.verb + ':' + e.status + ':' + e.ms + 'ms')).join(','));
  if (S.length !== 2 || F.some(e => !e || e.status !== 'ok') || S.some(e => e.status !== 'ok')) k.incon('W1-W2', 'not every line answered ok: ' + s.err.slice(-300));
  else {
    k.chk('W1 both session lines (warm page) give the answers a fresh page gives: verdict, summary, value, every row', core(S[0]) === core(F[0]) && core(S[1]) === core(F[1]), S.map(e => e.answer.summary).join(' | ') + ' vs ' + F.map(e => e.answer.summary).join(' | '));
    console.log('§RED1_WARM line2 session_ms=' + S[1].ms + ' fresh_ms=' + F[1].ms + ' ratio=' + (S[1].ms / F[1].ms).toFixed(3));
    k.chk('W2 the second BIM line of the session takes under a fifth of the same line run alone', S[1].ms * 5 < F[1].ms, 'session ' + S[1].ms + ' ms, alone ' + F[1].ms + ' ms');
  }
  await new Promise(r => setTimeout(r, 4000));
  const stray = cp.execSync('ps -eo pid,cmd').toString().split('\n').filter(l => /viewer_verbs\.js __serve/.test(l) && l.indexOf('red1-' + s.pid + '-') >= 0);
  const stateLeft = fs.existsSync(path.join(os.tmpdir(), 'red1-' + s.pid + '-viewer.json'));
  if (!warmStart) k.incon('W3', 'no warm page was started (RED1_WARM=off?)');
  else k.chk('W3 4 s after the shell exits, no warm page of it is running and its state file is gone', !stray.length && !stateLeft, 'stray=' + stray.length + ' stateLeft=' + stateLeft);
  k.end();
})().catch(e => { console.log('§W-RED1-WARM FAIL ' + (e && e.stack || e)); process.exit(1); });
