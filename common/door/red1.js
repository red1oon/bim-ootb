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
  const core = W.create({ vocab, words, tokenize: D.tokenize, pickColumns: M.pickColumns, menuCore: require(path.join(__dirname, 'menu_core.js')), interactive: !!o.interactive, buildings: buildingNames(), brk: process.env.WORDS_BREAK || '' });
  let st = core.init(), n = 0; const held = new Map(), G = require(path.join(__dirname, 'glob.js'));
  // §22.8 / R7 the warm page: while the session is in a building, ONE headless Viewer page of it stays open (viewer_verbs.js __serve); the verbs find it through
  // $VIEWER_SESSION and ask it instead of opening a page per line. RED1_WARM=off: no warm page (every line opens its own, as a line run alone does).
  const warm = { building: null, child: null, file: path.join(os.tmpdir(), 'red1-' + process.pid + '-viewer.json') };
  const warmTo = (b) => {
    if (process.env.RED1_WARM === 'off' || o.warm === false || b === warm.building) return;
    if (warm.child) { try { warm.child.kill(); } catch (e) { /* gone */ } warm.child = null; }
    try { fs.unlinkSync(warm.file); } catch (e) { /* none */ }
    warm.building = b; if (!b) { delete process.env.VIEWER_SESSION; return; }
    const vv = path.join(__dirname, '..', '..', 'viewer', 'tools', 'viewer_verbs.js'); if (!fs.existsSync(vv)) return;
    fs.writeFileSync(warm.file, JSON.stringify({ building: b, ready: false }));
    const log = fs.openSync(warm.file.replace(/\.json$/, '.log'), 'w');
    warm.child = cp.spawn(process.execPath, [vv, '__serve', '--building', b, '--state', warm.file], { stdio: ['ignore', log, log], env: Object.assign({}, process.env, { __VIEWER_PARENT: String(process.pid) }) });
    process.env.VIEWER_SESSION = warm.file;
    say('warm start building=' + b + ' pid=' + warm.child.pid + ' state=' + warm.file);
  };
  process.on('exit', () => { if (warm.child) { try { warm.child.kill(); } catch (e) { /* gone */ } } [warm.file, warm.file.replace(/\.json$/, '.log')].forEach(f => { try { fs.unlinkSync(f); } catch (e) { /* none */ } }); });
  // the shell's row filter (§22.7): the answer's rows kept where ANY cell matches the glob (glob.js, the one reader); the envelope says so (match, matched)
  const viewOf = (e, match) => {
    if (!match || !e || !e.answer || !Array.isArray(e.answer.rows)) return e;
    const m = G.match(match), rows = e.answer.rows.filter(r => (Array.isArray(r) ? r : Object.values(r)).some(m));
    say('match glob=' + JSON.stringify(match) + ' rows=' + rows.length + ' of=' + e.answer.rows.length);
    return Object.assign({}, e, { match, answer: Object.assign({}, e.answer, { rows, matched: rows.length, rowsBefore: e.answer.rows.length }) });
  };
  // one word-line (or door line): returns the envelopes of the lines it ran. print(text) for the screen, shown(line) for the `→` line
  async function run(text, io) {   // text: a word-line or a door line; or {key: 'Up'} while a pick menu is open
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
    const asKey = typeof text === 'object';
    if (!asKey && !core.menuOpen(st) && isDoorLine(text)) {   // a door line, maybe with the shell's row filter after a bar: `app.verb k=v | *Pipe*` (§22.7)
      const pm = /^(.*?\S)\s+\|\s+(\S+)\s*$/.exec(text.trim()), line = pm ? pm[1] : text.trim(), match = pm ? pm[2] : null;
      const e = await exec(line, null, match); if (e) { const v = viewOf(e, match); envs.push(v); await io.show(v); } return envs; }
    let r = core.step(st, asKey ? text : { text });
    for (;;) {
      st = r.state; if (core.menuOpen(st) && io.menu) io.menu(r.screen); else r.screen.forEach(io.print); warmTo(st.building);
      if (!r.effects.length) break;
      const ef = r.effects[0], e = await exec(ef.line, ef.shown, ef.match);
      if (!e) break;
      if (ef.purpose === 'run') { const v = viewOf(e, ef.match); envs.push(v); await io.show(v, ef.view, ef.draw); r = { state: st, effects: r.effects.slice(1), screen: [] }; continue; }
      r = core.step(st, { result: { purpose: ef.purpose, envelope: e } });
    }
    return envs;
  }
  return { run, prompt: () => core.prompt(st), state: () => st, menuOpen: () => core.menuOpen(st), core, vocab, R, door, words };
}

async function session(o) {
  let sh; try { sh = makeShell(Object.assign({}, o, { interactive: true })); } catch (e) { say('FAIL ' + e.message); return 1; }
  const { R, vocab } = sh, Dr = require(path.join(__dirname, 'draw_core.js')), tty = !!process.stdin.isTTY, histFile = process.env.RED1_HISTORY || path.join(os.homedir(), '.red1_history');
  let history = []; if (tty) { try { history = fs.readFileSync(histFile, 'utf8').split('\n').filter(Boolean).reverse().slice(0, 1000); } catch (e) { /* first run */ } }
  const names = vocab.verbs.map(v => v.verb).concat(sh.core.wordList().map(w => w.word), ['help', 'exit', 'quit', 'history', 'menu', 'cd', 'pwd', 'role']);
  const completer = (line) => { const w = line.split(/\s+/).pop(), hits = names.filter(v => v.indexOf(w) === 0); return [hits.length ? hits : names, w]; };
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: tty, completer: tty ? completer : undefined, history, historySize: 1000, prompt: tty ? sh.prompt() : '' });
  const typed = [];
  say('session tty=' + tty + ' journal=' + sh.door.journalFile + ' verbs=' + vocab.verbs.length + ' words=' + sh.core.wordList().length);
  // a pick menu on a terminal is redrawn in place (no scroll): the lines it took are cleared first; anything else printed ends that
  let menuH = 0;
  const w = (t) => { menuH = 0; process.stdout.write(t); };
  const io = {
    print: (t) => w(t + '\n'),
    arrow: (l) => w('→ ' + l + '\n'),
    menu: (lines) => { if (tty && menuH) process.stdout.write('\r\x1b[' + menuH + 'A\x1b[0J'); process.stdout.write(lines.join('\n') + '\n'); menuH = lines.length + (tty ? 1 : 0); },
    show: async (e, view, draw) => {
      menuH = 0;
      const a = e.answer || {}, rows = Array.isArray(a.rows) && view !== 'summary' ? a.rows : null;
      if (draw === 'tree' && e.status === 'ok') {   // §22.8 R6: a document's next steps, from erp.actions' own answer
        const inv = {}; try { const ACT = require(path.join(__dirname, 'erp_cli.js')).ACT; Object.keys(ACT).forEach(v => { inv[ACT[v]] = v; }); } catch (x) { /* no erp_cli: codes only */ }
        const t = Dr.nextTree(a, inv, { ascii: process.env.RED1_ASCII === '1', brk: process.env.DRAW_BREAK || '' });
        if (t) { process.stdout.write(e.status + ' · ' + e.verb + ' · ' + e.ms + ' ms\n'); t.forEach(l => process.stdout.write(l + '\n')); say('draw tree lines=' + t.length + ' legal=' + JSON.stringify(a.legal)); return; }
      }
      if (draw === 'funnel' && view === 'summary' && e.status === 'ok') {   // §22.8 R6: the clash funnel, drawn from the answer's own value
        const f = Dr.funnel(a.value, { ascii: process.env.RED1_ASCII === '1', brk: process.env.DRAW_BREAK || '' }); process.stdout.write(e.status + ' · ' + e.verb + (e.held ? ' · held' : ' · ' + e.ms + ' ms') + '\n');
        if (f) { f.forEach(l => process.stdout.write(l + '\n')); say('draw funnel lines=' + f.length + ' value=' + JSON.stringify(a.value)); if (Array.isArray(a.rows)) process.stdout.write('ls lists the ' + a.rows.length + ' rows\n'); return; }
      }
      process.stdout.write(e.status + (e.verb ? ' · ' + e.verb : '') + (e.held ? ' · held' : (e.ms != null ? ' · ' + e.ms + ' ms' : '')) + (e.why ? ' · ' + e.why : '') + '\n');
      if (a.summary) process.stdout.write(a.summary + '\n');
      if (e.match && !rows) process.stdout.write('no row matches ' + e.match + '\n');
      if (view === 'summary' && Array.isArray(a.rows)) process.stdout.write('ls lists the ' + a.rows.length + ' rows\n');
      if (rows && rows.length) { const cols = Array.isArray(a.cols) ? a.cols : (Array.isArray(a.columns) ? a.columns : Object.keys(rows[0])), T = Dr.table(cols, rows);
        // §22.6 paging: on a terminal, a table taller than the screen stops each page (Space or Return = the next page, q = stop); a pipe gets every row
        const H = tty && process.stdout.rows ? Math.max(5, process.stdout.rows - 3) : 0;
        let shown = T.length;
        if (H && T.length > H) {
          shown = 0;
          for (let i = 0; i < T.length; i += H - 1) {
            const page = (i === 0 ? T.slice(0, H) : [T[0]].concat(T.slice(i + 1, i + H))); page.forEach(l => process.stdout.write(l + '\n')); shown = Math.min(T.length, i === 0 ? H : i + H);
            if (shown >= T.length) break;
            process.stdout.write('-- ' + (shown - 1) + ' of ' + (T.length - 1) + ' rows: Space next page, q stop --');
            const echo = rl._writeToOutput; rl._writeToOutput = () => {};   // the pager's key is not typed into the prompt (readline would echo it and redraw the prompt)
            const k = await new Promise(res => { const h = (str, key) => { process.stdin.removeListener('keypress', h); res(key && key.name); }; process.stdin.on('keypress', h); });
            await new Promise(r => setImmediate(r)); rl.line = ''; rl.cursor = 0; rl._writeToOutput = echo;
            process.stdout.write('\r\x1b[0K');
            if ((k === 'q' || k === 'escape') && process.env.PAGE_BREAK !== 'nostop') break;   // nostop: W-RED1-PAGE falsifier (q ignored: must FAIL P1)
          }
          say('page rows=' + (T.length - 1) + ' shown=' + (shown - 1) + ' height=' + H);
        } else T.forEach(l => process.stdout.write(l + '\n')); if (e.match) process.stdout.write('(' + rows.length + ' of ' + a.rowsBefore + ' rows match ' + e.match + ')\n'); else if (a.rowsTotal > rows.length) process.stdout.write('(' + rows.length + ' of ' + a.rowsTotal + ' rows)\n'); }
      else if (e.answer != null && !a.summary) process.stdout.write((e.status === 'ok' && R.render(e, 'list')) || JSON.stringify(e.answer, null, 1).split('\n').slice(0, 40).join('\n') + '\n');
    }
  };
  let busy = Promise.resolve(), closed = false;
  const handle = async (raw) => {
    const line = raw.trim(); if ((!line && !sh.menuOpen()) || line.indexOf('--') === 0) return;
    typed.push(line);
    if (R.isHelp(line) && !sh.menuOpen()) {   // help = the red1 words (from words.json); help verbs | help <app> | help <app.verb> | help all = the door's own help (`!help` retired, §22.9)
      const topic = line.replace(/^\s*(help|\?)/, '').trim(), W = sh.words.words;
      if (topic && !W[topic]) { const h = R.help(vocab, 'help' + (topic !== 'verbs' ? ' ' + topic : '')); process.stdout.write(h.text); say('help topic=' + JSON.stringify(topic) + ' door=1 ok=' + h.ok); return; }
      const names = topic ? [topic] : Object.keys(W), wid = Math.max.apply(null, names.map(n => n.length));
      if (!topic) process.stdout.write('red1 words (each prints the door line it runs):\n');
      names.forEach(n => process.stdout.write('  ' + n.padEnd(wid) + '  ' + W[n].help + '   [' + W[n].forms.map(f => f.in + ' -> ' + f.verb).join(' · ') + ']\n'));
      if (!topic) process.stdout.write('  ' + 'cd'.padEnd(wid) + '  go to a building, a kind of it, or an ERP kind (cd .. back, cd alone: nowhere)\n  ' + 'pwd'.padEnd(wid) + '  where you are, as door keys\n  ' + 'role'.padEnd(wid) + '  role <id> on every line\n  ' + 'menu'.padEnd(wid) + '  the ERP menu\nhelp <word> for one; help verbs for every door verb (app.verb key=value).\n');
      say('help topic=' + JSON.stringify(topic) + ' words=' + names.length); return;
    }
    const sw = sh.menuOpen() ? null : SESSION_WORD.exec(line);
    if (sw) {
      const w = sw[1].toLowerCase();
      if (w === 'exit' || w === 'quit') { rl.close(); return; }
      if (w === 'history') { typed.slice(0, -1).forEach((l, i) => process.stdout.write(String(i + 1).padStart(4) + '  ' + l + '\n')); return; }
      if (w === 'menu') { rl.pause(); const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'mis.js'), '--menu'].concat(line.split(/\s+/).slice(1)), { stdio: 'inherit', env: process.env }); say('menu exit=' + r.status); rl.resume(); return; }
    }
    await sh.run(line, io);
    say('typed n=' + typed.length + ' where=' + JSON.stringify(sh.prompt().trim()));
  };
  if (tty) process.stdin.on('keypress', (str, key) => {   // while a pick menu is open, Up/Down/Esc move it (readline would recall history); digits and Enter arrive as a line
    if (!sh.menuOpen() || !key || ['up', 'down', 'escape'].indexOf(key.name) < 0) return;
    setImmediate(() => { rl.write(null, { ctrl: true, name: 'u' }); busy = busy.then(() => sh.run({ key: key.name === 'up' ? 'Up' : key.name === 'down' ? 'Down' : 'Esc' }, io)).then(() => { if (!closed) { rl.setPrompt(sh.prompt()); rl.prompt(); } }); });
  });
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
    if (rest.length === 1 && /^\s*menu(\s|$)/i.test(rest[0])) { /* `red1 menu` = the door's terminal menu, passed as it is */ }
    else if (rest.length === 1 && /^\s*\?/.test(rest[0])) a[a.indexOf(rest[0])] = rest[0].replace(/^\s*\?/, 'help');
    else if (rest.length === 1 && a.indexOf('--script') < 0 && (!isDoorLine(rest[0]) || /\s\|\s/.test(rest[0])) && !/^\s*(help)(\s|$)/.test(rest[0])) {   // words, or a door line with the shell's `| glob`
      wordShot(rest[0], o).then(c => process.exit(c)).catch(e => { say('FAIL ' + (e && e.stack || e)); process.exit(1); });
    } else process.exit(passThrough(a));
  } else session(o).then(c => process.exit(c)).catch(e => { say('FAIL ' + (e && e.stack || e)); process.exit(1); });
}
// §22.10 THE JS FACE: an object GENERATED from verbs.json, api.<app>.<verb>({inputs}) -> the envelope of the canonical door line (the same runLine, journalled).
// No hand-written method: a new verb appears with no code. api.words.run('clash ARC MEP', place) runs a word-line in a fresh place and returns its envelopes.
function api(o) {
  o = o || {};
  const D = require(DOOR), W = require(path.join(__dirname, 'words_core.js')), vocab = D.loadVocab(), words = JSON.parse(fs.readFileSync(path.join(__dirname, 'vocab', 'words.json'), 'utf8'));
  const core = W.create({ vocab, words, tokenize: D.tokenize, pickColumns: require(path.join(__dirname, 'mis_core.js')).pickColumns, buildings: buildingNames() }), door = D.createDoor({ journal: o.journal }), out = {};
  vocab.verbs.forEach((e, i) => { if (process.env.API_BREAK === 'skip' && i === vocab.verbs.length - 1) return;   // W-RED1-API falsifier: one verb left out (must FAIL A1)
    const [app, verb] = e.verb.split('.'); out[app] = out[app] || {};
    out[app][verb] = (args) => { const line = core.lineOf(e.verb, Object.assign({}, args || {})); return door.runLine(line, { actor: o.actor || 'human' }).then(env => Object.assign(env, { line })); }; });
  out.words = { run: async (text, place) => { const sh = makeShell(Object.assign({}, o, { interactive: false, warm: false })), envs = []; const io = { print: () => {}, arrow: () => {}, show: (e) => { envs.push(e); } };
    for (const p of (place ? [place] : []).concat(String(text).split(';'))) await sh.run(p.trim(), io); return envs; } };
  return out;
}
module.exports = { session, makeShell, buildingNames, api };
