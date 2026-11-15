#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — red1.js: the `red1` shell, the person's face of the door (bim-compiler prompts/CLI_ERP_IVR.md §22; R0 the command, R1 the words, R2 cd). READ THE LOG of W-RED1-SHELL / W-RED1-WORDS / W-RED1-CD after every change.
// It is a FRONT END ONLY: every line goes through the door (door.js createDoor().runLine, journalled, claim-checked); nothing here runs an engine or holds a rule.
// A short word (`clash ARC MEP`) is expanded by words_core.js (pure, the table vocab/words.json) to ONE door line, printed `→ line` before it runs.
//   red1                              a session: the red1> prompt (it shows where you are: red1 Duplex/Element>), history (~/.red1_history or $RED1_HISTORY), Tab completes words and verbs.
//                                     Piped stdin = the same session without the prompt.
//   red1 'app.verb key=value …'       one door line, then exit (the door's own run; --json|--list|--csv|--out FILE|--actor|--journal pass through)
//   red1 'cd Duplex; count'           word-lines, `;` between them: each printed `→ line` on stderr, each envelope as JSON on stdout (as a door line's)
//   red1 -f FILE [--dry]              a file of door lines (the door's --script; --dry on a throw-away copy)
// Session words: help [topic] | ? · menu [role=R] · history · exit | quit; cd <building|kind|ERP kind> · cd .. · cd · pwd · role <id>. The rest: vocab/words.json, or a door line.
// Exit: as door.js (0 ok · 3 refused/claim/inconclusive · 1 error · 2 usage). A session exits 0 on `exit`/end of input, whatever its lines answered.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), readline = require('readline');
const DOOR = path.join(__dirname, 'door.js');
const BREAK = () => process.env.RED1_BREAK || '';
const say = (s) => process.stderr.write('§RED1 ' + s + '\n');

function passThrough(argv) {   // a door line and -f: the door's own command line, unchanged (one implementation of a run, a file and a dry run)
  const r = cp.spawnSync(process.execPath, [DOOR].concat(argv), { stdio: 'inherit', env: process.env });
  return r.status == null ? 1 : r.status;
}
// the buildings a `cd` can name: the Viewer's own places (viewer/tools/viewer_verbs.js resolveDb), read from the folders, never a hand list
function buildingNames() {
  const root = path.join(__dirname, '..', '..'), dirs = [process.env.VIEWER_BLD_DIR, path.join(root, 'buildings'), path.join(os.homedir(), 'bim-ootb', 'buildings')].filter(Boolean), out = [];
  dirs.forEach(d => { let names = []; try { names = fs.readdirSync(d); } catch (e) { return; }
    names.forEach(n => { const m = /^(.+)_extracted\.db$/.exec(n); if (!m || out.indexOf(m[1]) >= 0) return; try { if (fs.statSync(path.join(d, n)).size > 100000) out.push(m[1]); } catch (e) { /* a dead link */ } }); });
  return out.sort();
}
const isDoorLine = (l) => /^\s*([A-Za-z_]\w*\s*=\s*)?[a-z][a-z0-9]*\.[a-z][a-z0-9_]*(\s|$)/.test(l);
const SESSION_WORD = /^\s*(exit|quit|history|menu)(\s|$)/i;

function makeShell(o) {
  const D = require(DOOR), R = require(path.join(__dirname, 'render.js')), W = require(path.join(__dirname, 'words_core.js')), M = require(path.join(__dirname, 'mis_core.js'));
  const door = D.createDoor({ journal: o.journal }), vocab = D.loadVocab(), words = JSON.parse(fs.readFileSync(path.join(__dirname, 'vocab', 'words.json'), 'utf8'));
  const core = W.create({ vocab, words, tokenize: D.tokenize, pickColumns: M.pickColumns, buildings: buildingNames(), brk: process.env.WORDS_BREAK || '' });
  let st = core.init(), n = 0; const held = new Map(), G = require(path.join(__dirname, 'glob.js'));
  // the shell's row filter (§22.7): the answer's rows kept where ANY cell matches the glob (glob.js, the one reader); the envelope says so (match, matched)
  const viewOf = (e, match) => {
    if (!match || !e || !e.answer || !Array.isArray(e.answer.rows)) return e;
    const m = G.match(match), rows = e.answer.rows.filter(r => (Array.isArray(r) ? r : Object.values(r)).some(m));
    say('match glob=' + JSON.stringify(match) + ' rows=' + rows.length + ' of=' + e.answer.rows.length);
    return Object.assign({}, e, { match, answer: Object.assign({}, e.answer, { rows, matched: rows.length, rowsBefore: e.answer.rows.length }) });
  };
  // one word-line (or door line): returns the envelopes of the lines it ran. print(text) for the screen, shown(line) for the `→` line
  async function run(text, io) {
    const envs = [];
    const exec = async (line, shownLine, match) => {
      io.arrow((shownLine || line) + (match ? ' | ' + match : ''));
      // §22.6 the held answer: a READ line the session already ran is served from its answer (said so), never re-run; any line that is not a read forgets them all
      const key = BREAK() === 'stale' && held.size ? held.keys().next().value : line;   // W-RED1-LS falsifier: serve the answer of another line (must FAIL L1)
      if (held.has(key)) { io.print('(answer of the line above, not re-run)'); say('held line=' + JSON.stringify(line)); return Object.assign({}, held.get(key), { held: true }); }
      const e = await door.runLine(line, { actor: o.actor, request: o.request ? o.request + '.' + (++n) : undefined });
      const ent = e && vocab.byVerb.get(e.verb);
      if (e && e.status === 'ok' && ent && ent.harm === 'read') held.set(line, e); else if (e && !(ent && ent.harm === 'read')) held.clear();
      if (BREAK() === 'twice') await door.runLine(line, { actor: o.actor });   // W-RED1-SHELL falsifier: a line run twice (must FAIL S2)
      if (e) say('line verb=' + (e.verb || '-') + ' status=' + e.status + ' request=' + e.request + ' line=' + JSON.stringify(line));
      return e;
    };
    if (isDoorLine(text)) {   // a door line, maybe with the shell's row filter after a bar: `app.verb k=v | *Pipe*` (§22.7)
      const pm = /^(.*?\S)\s+\|\s+(\S+)\s*$/.exec(text.trim()), line = pm ? pm[1] : text.trim(), match = pm ? pm[2] : null;
      const e = await exec(line, null, match); if (e) { envs.push(e); io.show(viewOf(e, match)); } return envs; }
    let r = core.step(st, { text });
    for (;;) {
      st = r.state; r.screen.forEach(io.print);
      if (!r.effects.length) break;
      const ef = r.effects[0], e = await exec(ef.line, ef.shown, ef.match);
      if (!e) break;
      if (ef.purpose === 'run') { const v = viewOf(e, ef.match); envs.push(v); io.show(v, ef.view); r = { state: st, effects: r.effects.slice(1), screen: [] }; continue; }
      r = core.step(st, { result: { purpose: ef.purpose, envelope: e } });
    }
    return envs;
  }
  return { run, prompt: () => core.prompt(st), state: () => st, core, vocab, R, door };
}

async function session(o) {
  let sh; try { sh = makeShell(o); } catch (e) { say('FAIL ' + e.message); return 1; }
  const { R, vocab } = sh, Dr = require(path.join(__dirname, 'draw_core.js')), tty = !!process.stdin.isTTY, histFile = process.env.RED1_HISTORY || path.join(os.homedir(), '.red1_history');
  let history = []; if (tty) { try { history = fs.readFileSync(histFile, 'utf8').split('\n').filter(Boolean).reverse().slice(0, 1000); } catch (e) { /* first run */ } }
  const names = vocab.verbs.map(v => v.verb).concat(sh.core.wordList().map(w => w.word), ['help', 'exit', 'quit', 'history', 'menu', 'cd', 'pwd', 'role']);
  const completer = (line) => { const w = line.split(/\s+/).pop(), hits = names.filter(v => v.indexOf(w) === 0); return [hits.length ? hits : names, w]; };
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: tty, completer: tty ? completer : undefined, history, historySize: 1000, prompt: tty ? sh.prompt() : '' });
  const typed = [];
  say('session tty=' + tty + ' journal=' + sh.door.journalFile + ' verbs=' + vocab.verbs.length + ' words=' + sh.core.wordList().length);
  const io = {
    print: (t) => process.stdout.write(t + '\n'),
    arrow: (l) => process.stdout.write('→ ' + l + '\n'),
    show: (e, view) => {
      const a = e.answer || {}, rows = Array.isArray(a.rows) && view !== 'summary' ? a.rows : null;
      process.stdout.write(e.status + (e.verb ? ' · ' + e.verb : '') + (e.held ? ' · held' : (e.ms != null ? ' · ' + e.ms + ' ms' : '')) + (e.why ? ' · ' + e.why : '') + '\n');
      if (a.summary) process.stdout.write(a.summary + '\n');
      if (e.match && !rows) process.stdout.write('no row matches ' + e.match + '\n');
      if (view === 'summary' && Array.isArray(a.rows)) process.stdout.write('ls lists the ' + a.rows.length + ' rows\n');
      if (rows && rows.length) { const cols = Array.isArray(a.cols) ? a.cols : (Array.isArray(a.columns) ? a.columns : Object.keys(rows[0])); Dr.table(cols, rows).forEach(l => process.stdout.write(l + '\n')); if (e.match) process.stdout.write('(' + rows.length + ' of ' + a.rowsBefore + ' rows match ' + e.match + ')\n'); else if (a.rowsTotal > rows.length) process.stdout.write('(' + rows.length + ' of ' + a.rowsTotal + ' rows)\n'); }
      else if (e.answer != null && !a.summary) process.stdout.write((e.status === 'ok' && R.render(e, 'list')) || JSON.stringify(e.answer, null, 1).split('\n').slice(0, 40).join('\n') + '\n');
    }
  };
  let busy = Promise.resolve(), closed = false;
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
    await sh.run(line, io);
    say('typed n=' + typed.length + ' where=' + JSON.stringify(sh.prompt().trim()));
  };
  rl.on('line', (l) => { busy = busy.then(() => handle(l)).then(() => { if (!closed && tty) { rl.setPrompt(sh.prompt()); rl.prompt(); } }).catch(err => { say('FAIL ' + (err && err.stack || err)); }); });
  if (tty) rl.prompt();
  await new Promise((res) => rl.on('close', () => { closed = true; busy.then(res); }));
  if (tty) { try { fs.appendFileSync(histFile, typed.map(l => l + '\n').join('')); } catch (e) { /* no home */ } }
  say('session end lines=' + typed.length);
  return 0;
}

// `red1 'cd Duplex; count'`: word-lines in one shot. `;` splits outside double quotes.
async function wordShot(text, o) {
  const sh = makeShell(o), parts = [], re = /((?:"[^"]*"|[^;"])+)/g; let m; while ((m = re.exec(text))) if (m[1].trim()) parts.push(m[1].trim());
  const io = { print: (t) => process.stderr.write(t + '\n'), arrow: (l) => process.stderr.write('→ ' + l + '\n'), show: (e) => process.stdout.write(JSON.stringify(e) + '\n') };
  let last = null;
  for (const p of parts) { const envs = await sh.run(p, io); if (envs.length) last = envs[envs.length - 1]; if (last && last.status !== 'ok') break; }
  return !last ? 0 : (last.status === 'ok' ? 0 : (last.status === 'error' ? 1 : 3));
}

if (require.main === module) {
  const a = process.argv.slice(2);
  const fi = a.indexOf('-f'); if (fi >= 0) a[fi] = '--script';
  const flags = new Set(['--json', '--list', '--csv', '--dry', '--claims']), withArg = new Set(['--out', '--actor', '--journal', '--request', '--script', '--confirm']);
  const rest = []; const o = { actor: 'human' };
  for (let i = 0; i < a.length; i++) { if (withArg.has(a[i])) { if (a[i] === '--actor') o.actor = a[i + 1]; if (a[i] === '--journal') o.journal = a[i + 1]; if (a[i] === '--request') o.request = a[i + 1]; i++; } else if (!flags.has(a[i])) rest.push(a[i]); }
  if (a.indexOf('-h') >= 0 || a.indexOf('--help') >= 0) { console.log("usage: red1                         (a session, the red1> prompt)\n       red1 'app.verb key=value …'  [--json|--list|--csv] [--out FILE]\n       red1 'cd Duplex; count'      (words, ; between them)\n       red1 -f FILE [--dry]\n       red1 help [topic]"); process.exit(0); }
  const oneShot = rest.length > 0 || a.indexOf('--script') >= 0 || a.indexOf('--claims') >= 0 || a.indexOf('--confirm') >= 0;
  if (oneShot) {
    if (rest.length === 1 && /^\s*menu(\s|$)/i.test(rest[0])) a[a.indexOf(rest[0])] = rest[0].replace(/^\s*menu/i, '/M');   // `red1 menu` = the door's terminal menu
    else if (rest.length === 1 && /^\s*\?/.test(rest[0])) a[a.indexOf(rest[0])] = rest[0].replace(/^\s*\?/, 'help');
    else if (rest.length === 1 && a.indexOf('--script') < 0 && (!isDoorLine(rest[0]) || /\s\|\s/.test(rest[0])) && !/^\s*(!help|help)(\s|$)/.test(rest[0])) {   // words, or a door line with the shell's `| glob`
      wordShot(rest[0], o).then(c => process.exit(c)).catch(e => { say('FAIL ' + (e && e.stack || e)); process.exit(1); }); return;
    }
    process.exit(passThrough(a));
  }
  session(o).then(c => process.exit(c)).catch(e => { say('FAIL ' + (e && e.stack || e)); process.exit(1); });
}
module.exports = { session, makeShell, buildingNames };
