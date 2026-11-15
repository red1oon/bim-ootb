#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — red1.js: the `red1` shell, the person's face of the door (bim-compiler prompts/CLI_ERP_IVR.md §22, step R0). READ THE LOG of W-RED1-SHELL after every change.
// It is a FRONT END ONLY: every line goes through the door (door.js createDoor().runLine, journalled, claim-checked); nothing here runs an engine or holds a rule.
//   red1                         a session: the red1> prompt, history (~/.red1_history, or $RED1_HISTORY), Tab completes the verbs. Piped stdin = the same session without the prompt.
//   red1 'app.verb key=value …'  one line, then exit (the door's own one-line run; --json|--list|--csv|--out FILE|--actor|--journal pass through)
//   red1 -f FILE [--dry]         a file of lines (the door's --script; --dry on a throw-away copy)
// Session words (not door verbs): help [topic] | ? · menu [role=R] · history · exit | quit. Anything else is a door line. Short words (`clash ARC MEP`, `cd`) arrive in step R1.
// Exit: as door.js (0 ok · 3 refused/claim/inconclusive · 1 error · 2 usage). A session exits 0 on `exit`/end of input, whatever its lines answered.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), readline = require('readline');
const DOOR = path.join(__dirname, 'door.js');
const BREAK = () => process.env.RED1_BREAK || '';
const say = (s) => process.stderr.write('§RED1 ' + s + '\n');
const PROMPT = 'red1> ';

// one-shot and -f: the door's own command line, unchanged (one implementation of a run, a file and a dry run)
function passThrough(argv) {
  const r = cp.spawnSync(process.execPath, [DOOR].concat(argv), { stdio: 'inherit', env: process.env });
  return r.status == null ? 1 : r.status;
}

const SESSION_WORD = /^\s*(exit|quit|history|menu)(\s|$)/i;

async function session(o) {
  const D = require(DOOR), R = require(path.join(__dirname, 'render.js'));
  let door, vocab; try { door = D.createDoor({ journal: o.journal }); vocab = D.loadVocab(); } catch (e) { say('FAIL ' + e.message); return 1; }
  const tty = !!process.stdin.isTTY, histFile = process.env.RED1_HISTORY || path.join(os.homedir(), '.red1_history');
  let history = []; if (tty) { try { history = fs.readFileSync(histFile, 'utf8').split('\n').filter(Boolean).reverse().slice(0, 1000); } catch (e) { /* first run */ } }
  const verbs = vocab.verbs.map(v => v.verb).concat(['help', 'exit', 'quit', 'history', 'menu']);
  const completer = (line) => { const w = line.split(/\s+/).pop(), hits = verbs.filter(v => v.indexOf(w) === 0); return [hits.length ? hits : verbs, w]; };
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: tty, completer: tty ? completer : undefined, history, historySize: 1000, prompt: tty ? PROMPT : '' });
  const typed = [];
  say('session tty=' + tty + ' journal=' + door.journalFile + ' verbs=' + vocab.verbs.length);
  const show = (e) => {
    const list = e.status === 'ok' ? R.render(e, 'list') : null;
    process.stdout.write(e.status + (e.verb ? ' · ' + e.verb : '') + (e.ms != null ? ' · ' + e.ms + ' ms' : '') + (e.why ? ' · ' + e.why : '') + '\n');
    if (list) process.stdout.write(list); else if (e.answer !== undefined) process.stdout.write(JSON.stringify(e.answer, null, 1).split('\n').slice(0, 40).join('\n') + '\n');
  };
  let n = 0, busy = Promise.resolve(), closed = false;
  const handle = async (raw) => {
    const line = raw.trim(); if (!line || line.indexOf('--') === 0) return;
    typed.push(line);
    if (R.isHelp(line)) { const h = R.help(vocab, line); process.stdout.write(h.text); say('help topic=' + JSON.stringify(line.replace(/^\s*(!help|help|\?)/, '').trim()) + ' ok=' + h.ok); return; }
    const sw = SESSION_WORD.exec(line);
    if (sw) {
      const w = sw[1].toLowerCase();
      if (w === 'exit' || w === 'quit') { rl.close(); return; }
      if (w === 'history') { typed.slice(0, -1).forEach((l, i) => process.stdout.write(String(i + 1).padStart(4) + '  ' + l + '\n')); return; }
      if (w === 'menu') { rl.pause(); const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'mis.js'), '--menu'].concat(line.split(/\s+/).slice(1)), { stdio: 'inherit', env: process.env }); say('menu exit=' + r.status); rl.resume(); return; }
    }
    const req = o.request ? o.request + '.' + (++n) : undefined;
    const e = await door.runLine(line, { actor: o.actor, request: req });
    if (BREAK() === 'twice') await door.runLine(line, { actor: o.actor });   // W-RED1-SHELL falsifier: the session runs a line twice (must FAIL S2)
    if (!e) return;
    say('line n=' + typed.length + ' verb=' + (e.verb || '-') + ' status=' + e.status + ' request=' + e.request);
    show(e);
  };
  rl.on('line', (l) => { busy = busy.then(() => handle(l)).then(() => { if (!closed && tty) rl.prompt(); }).catch(err => { say('FAIL ' + (err && err.stack || err)); }); });
  if (tty) rl.prompt();
  await new Promise((res) => rl.on('close', () => { closed = true; busy.then(res); }));
  if (tty) { try { fs.appendFileSync(histFile, typed.map(l => l + '\n').join('')); } catch (e) { /* no home */ } }
  say('session end lines=' + typed.length);
  return 0;
}

if (require.main === module) {
  const a = process.argv.slice(2);
  const fi = a.indexOf('-f'); if (fi >= 0) a[fi] = '--script';
  const flags = new Set(['--json', '--list', '--csv', '--dry', '--claims']), withArg = new Set(['--out', '--actor', '--journal', '--request', '--script', '--confirm']);
  const rest = []; const o = { actor: 'human' };
  for (let i = 0; i < a.length; i++) { if (withArg.has(a[i])) { if (a[i] === '--actor') o.actor = a[i + 1]; if (a[i] === '--journal') o.journal = a[i + 1]; if (a[i] === '--request') o.request = a[i + 1]; i++; } else if (!flags.has(a[i])) rest.push(a[i]); }
  if (a.indexOf('-h') >= 0 || a.indexOf('--help') >= 0) { console.log("usage: red1                 (a session, the red1> prompt)\n       red1 'app.verb key=value …'  [--json|--list|--csv] [--out FILE]\n       red1 -f FILE [--dry]\n       red1 help [topic]"); process.exit(0); }
  const oneShot = rest.length > 0 || a.indexOf('--script') >= 0 || a.indexOf('--claims') >= 0 || a.indexOf('--confirm') >= 0;
  if (oneShot) {
    if (rest.length === 1 && /^\s*menu(\s|$)/i.test(rest[0])) a[a.indexOf(rest[0])] = rest[0].replace(/^\s*menu/i, '/M');   // `red1 menu` = the door's terminal menu
    if (rest.length === 1 && /^\s*\?/.test(rest[0])) a[a.indexOf(rest[0])] = rest[0].replace(/^\s*\?/, 'help');
    process.exit(passThrough(a));
  }
  session(o).then(c => process.exit(c)).catch(e => { say('FAIL ' + (e && e.stack || e)); process.exit(1); });
}
module.exports = { session };
