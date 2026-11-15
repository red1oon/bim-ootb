// ⚠ DO NOT REMOVE — W-RED1-WELCOME (bim-compiler prompts/CLI_ERP_IVR.md §26: the greeting when red1 opens). READ THE LOG; an exit code is not evidence.
//   W1 ISSUE (no greeting, or a greeting whose numbers are typed, not read): on a terminal the greeting comes before the first prompt and its version / counts / commit equal the files'
//   W2 ISSUE (a script's output changed): a piped session and a one-shot line print no greeting
//   W3 ISSUE (two versions): `red1 --version` == the greeting's version line
//   W4 ISSUE (the § log on a person's screen, or lost): on a terminal no `§RED1` line reaches the screen, and they are in $RED1_LOG
//   Falsifier: WELCOME_BREAK=pipe (greets a pipe: must FAIL W2). Needs `script` for W1 (else INCONCLUSIVE).
//   Run: node common/door/tests/witness_red1_welcome.js > common/door/tests/logs/red1_welcome.log 2>&1
'use strict';
const path = require('path'), cp = require('child_process'), fs = require('fs');
const { kit, ROOT } = require('./_kit');
const k = kit('W-RED1-WELCOME'), RED1 = path.join(ROOT, 'common/door/red1.js');
const run = (cmd) => cp.spawnSync('bash', ['-c', cmd], { encoding: 'utf8', env: Object.assign({}, process.env, { RED1_WARM: 'off' }) });
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const nVerbs = JSON.parse(fs.readFileSync(path.join(ROOT, 'common/door/verbs.json'), 'utf8')).verbs.length;
const nWords = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'common/door/vocab/words.json'), 'utf8')).words).length;
const commit = (run('git -C ' + ROOT + ' rev-parse --short HEAD').stdout || '').trim();
const want = 'red1 ' + version + ' · ' + nVerbs + ' verbs · ' + nWords + ' words' + (commit ? ' · ' + commit : '');
k.L('expected fields: ' + want);
// W1 on a pseudo-terminal
if (run('command -v script').status !== 0) k.incon('W1', 'no `script`');
else {
  const out = (run("(sleep 2; printf 'exit\\r') | script -qc \"stty cols 200; node " + RED1 + "\" /dev/null").stdout || '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\r/g, '');
  const iW = out.indexOf('Welcome to red1'), iR = out.indexOf('REMEMBER THE NAME'), iV = out.indexOf(want), iH = out.indexOf('Type help for the list of commands'), iP = out.indexOf('red1> ');
  k.L('W1 welcome@' + iW + ' remember@' + iR + ' fields@' + iV + ' prompt@' + iP + '\n' + out.split('\n').slice(0, 6).join('\n'));
  k.chk('W1 on a terminal the greeting (Welcome, REMEMBER THE NAME, `' + want + '`, the hint `Type help for the list of commands`) comes before the first prompt', iW >= 0 && iR > iW && iV > iR && iH > iV && iP > iH, 'help hint=' + iH + ' welcome=' + iW + ' remember=' + iR + ' fields=' + iV + ' prompt=' + iP);
}
// W2 a pipe and a one-shot: no greeting
const piped = run("printf 'help\\n' | node " + RED1 + ' 2>/dev/null'), one = run('node ' + RED1 + " help 2>/dev/null");
k.L('W2 piped bytes=' + piped.stdout.length + ' one-shot bytes=' + one.stdout.length);
k.chk('W2 a piped session and a one-shot line print no greeting (their first line is the help text)', !/Welcome to red1|REMEMBER THE NAME/.test(piped.stdout + one.stdout) && piped.stdout === one.stdout, 'piped=' + JSON.stringify(piped.stdout.split('\n')[0]) + ' one=' + JSON.stringify(one.stdout.split('\n')[0]));
// W3 --version
const v = (run('node ' + RED1 + ' --version').stdout || '').trim();
k.chk('W3 `red1 --version` prints the greeting\'s version line', v.indexOf(want) >= 0 && /Redhuan D\. OON/.test(v), JSON.stringify(v));
// W4 the § log on a terminal goes to the file
if (run('command -v script').status !== 0) k.incon('W4', 'no `script`');
else {
  const lf = path.join(require('os').tmpdir(), 'r1w_' + process.pid + '.log'); try { fs.unlinkSync(lf); } catch (e) { /* none */ }
  const scr = (run("(sleep 2; printf 'help\\r'; sleep 1; printf 'mis.list kind=Project columns=Value limit=1\\r'; sleep 3; printf 'exit\\r') | script -qc \"stty cols 200; RED1_LOG=" + lf + " node " + RED1 + "\" /dev/null").stdout || '');
  let log = ''; try { log = fs.readFileSync(lf, 'utf8'); } catch (e) { /* none */ }
  k.L('W4 screen §RED1 lines=' + (scr.match(/§RED1/g) || []).length + ' log lines=' + (log.match(/§RED1/g) || []).length);
  k.chk('W4 on a terminal no § line (§RED1, §DOOR) reaches the screen, and the log file holds them (welcome, session, help, a door line)', !/§RED1/.test(scr) && /§RED1 welcome/.test(log) && /§RED1 session/.test(log) && /§RED1 help/.test(log) && /§DOOR request/.test(log) && !/§/.test(scr), 'screen=' + (scr.match(/§RED1/g) || []).length + ' log=' + (log.match(/§RED1/g) || []).length);
}
k.end();
