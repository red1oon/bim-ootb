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
// Session words: help [topic] | ? · bim · mis · erp (§24) · grey suggestions while typing, Tab/→ takes one (§1d.1) · menu [role=R] · history · exit | quit; cd <building|kind|ERP kind> · cd .. · cd · pwd · role <id>. The rest: vocab/words.json, or a door line.
// Exit: as door.js (0 ok · 3 refused/claim/inconclusive · 1 error · 2 usage). A session exits 0 on `exit`/end of input, whatever its lines answered.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), readline = require('readline');
const DOOR = path.join(__dirname, 'door.js');
const BREAK = () => process.env.RED1_BREAK || '';
// §26 the § log: stderr (pipes, one-shot, -f: what scripts and witnesses read); in a session on a terminal it goes to a FILE so the person's screen stays clean
// ($RED1_LOG = a path, default ~/.cache/red1/red1.log; RED1_LOG=stderr keeps it on the screen). The log is kept, never dropped (the Log Mandate).
let sayTo = null;
const RING = [];   // §28: the last § lines of this session, for `report` (what the person could read in the log file)
const say = (s) => { RING.push('§RED1 ' + s); if (RING.length > 200) RING.shift(); if (sayTo) { try { fs.appendFileSync(sayTo, new Date().toISOString() + ' §RED1 ' + s + '\n'); return; } catch (e) { sayTo = null; } } process.stderr.write('§RED1 ' + s + '\n'); };

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
const SESSION_WORD = /^\s*(exit|quit|history)(\s|$)/i;
const GROUP_WORD = /^\s*(bim|mis|erp)\s*$/i;
// §24 the one help reader: `help`, `?`, `bim|mis|erp`, `help <group|word>` -> words_core.helpText; anything else after help -> the door's own help (render.js help)
function helpOf(line, core, vocab, level) {   // level: the person's setting (VOCAB_MESSAGE_CATALOG.md §4 P3a), null = short
  const R = require(path.join(__dirname, 'render.js')), topic = String(line).replace(/^\s*(help|\?)/, '').trim().toLowerCase().replace(/^(bim|mis|erp)$/, '$1');
  const t = topic === 'verbs' ? null : core.helpText(topic, level || null);
  if (t != null) return { text: t, topic };
  const h = R.help(vocab, 'help' + (topic && topic !== 'verbs' ? ' ' + topic : '')); return { text: h.text, topic, door: true };
}
// §26 the greeting: words.json `welcome` (data), its fields read from package.json, verbs.json, words.json and the checkout's commit
function welcome() {
  const root = path.join(__dirname, '..', '..'), words = JSON.parse(fs.readFileSync(path.join(__dirname, 'vocab', 'words.json'), 'utf8')), W = words.welcome || { lines: [] };
  let version = '?'; try { version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version; } catch (e) { /* no package.json */ }
  const nVerbs = JSON.parse(fs.readFileSync(path.join(__dirname, 'verbs.json'), 'utf8')).verbs.length, nWords = Object.keys(words.words).length;
  let commit = ''; try { const r = cp.spawnSync('git', ['-C', root, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }); if (r.status === 0 && r.stdout.trim()) commit = ' · ' + r.stdout.trim(); } catch (e) { /* not a checkout */ }
  const f = (l) => l.replace('{version}', version).replace('{verbs}', nVerbs).replace('{words}', nWords).replace('{commit}', commit);
  return { lines: W.lines.map(f), version: W.lines.map(f).filter(l => l.indexOf('red1 ' + version) >= 0)[0] || ('red1 ' + version) };
}
// the person's text: ONE catalog (vocab/messages.json) read by msg_core.js, handed to words_core (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §3)
function msgCore() { return require(path.join(__dirname, 'msg_core.js')).create(JSON.parse(fs.readFileSync(path.join(__dirname, 'vocab', 'messages.json'), 'utf8'))); }
function wordsCore() {   // the expander alone, enough to print help (no door, no shell)
  const D = require(DOOR), vocab = D.loadVocab(), words = JSON.parse(fs.readFileSync(path.join(__dirname, 'vocab', 'words.json'), 'utf8'));
  return { vocab, core: require(path.join(__dirname, 'words_core.js')).create({ vocab, words, msg: msgCore(), tokenize: D.tokenize, pickColumns: require(path.join(__dirname, 'mis_core.js')).pickColumns, buildings: [], brk: (process.env.LOGIN_BREAK === 'nogate' ? 'nogate' : process.env.WORDS_BREAK) || '' }) };
}

function makeShell(o) {
  const D = require(DOOR), R = require(path.join(__dirname, 'render.js')), W = require(path.join(__dirname, 'words_core.js')), M = require(path.join(__dirname, 'mis_core.js'));
  const door = D.createDoor({ journal: o.journal }), vocab = D.loadVocab(), words = JSON.parse(fs.readFileSync(path.join(__dirname, 'vocab', 'words.json'), 'utf8'));
  const core = W.create({ vocab, words, msg: msgCore(), tokenize: D.tokenize, pickColumns: M.pickColumns, menuCore: require(path.join(__dirname, 'menu_core.js')), interactive: !!o.interactive, buildings: buildingNames(), brk: (process.env.LOGIN_BREAK === 'nogate' ? 'nogate' : process.env.WORDS_BREAK) || '' });
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
      // §30 L4: the logged-in user is the stamp of every engine this line starts (door.js passes its environment on); red1 alone sets it, nothing without a login
      if (st.user && process.env.LOGIN_BREAK !== 'nostamp') process.env.BIM_DOOR_USER = String(st.user.id); else delete process.env.BIM_DOOR_USER;   // nostamp: W-RED1-LOGIN falsifier (must FAIL G3)
      const e = await door.runLine(line, { actor: o.actor, request: o.request ? o.request + '.' + (++n) : undefined });
      const ent = e && vocab.byVerb.get(e.verb);
      if (e && e.status === 'ok' && ent && ent.harm === 'read') held.set(line, e); else if (e && !(ent && ent.harm === 'read')) held.clear();
      if (BREAK() === 'twice') await door.runLine(line, { actor: o.actor });   // W-RED1-SHELL falsifier: a line run twice (must FAIL S2)
      if (e) say('line verb=' + (e.verb || '-') + ' status=' + e.status + ' request=' + e.request + ' line=' + JSON.stringify(line));
      return e;
    };
    // §29.3 (D16): an answer that carries the engine's next step {key, line}: a session asks it (the pure core holds the question and the y/N), a one-shot or AI run asks nothing (the line is in the envelope's `next`)
    const offerOf = (v) => { if (!v || !v.offer || BREAK() === 'nooffer') return; const o2 = core.step(st, { result: { purpose: 'offer', envelope: v } }); st = o2.state; o2.screen.forEach(io.print); };
    const asKey = typeof text === 'object';
    if (!asKey && !core.menuOpen(st) && isDoorLine(text) && core.loginGate(st)) { io.print(core.loginGate(st)); say('login gate line=' + JSON.stringify(text)); return envs; }   // §30 L2
    if (!asKey && !core.menuOpen(st) && isDoorLine(text)) {   // a door line, maybe with the shell's row filter after a bar: `app.verb k=v | *Pipe*` (§22.7)
      const pm = /^(.*?\S)\s+\|\s+(\S+)\s*$/.exec(text.trim()), line = pm ? pm[1] : text.trim(), match = pm ? pm[2] : null;
      const e = await exec(line, null, match); if (e) { const v = viewOf(e, match); envs.push(v); await io.show(v); offerOf(v); } return envs; }
    let r = core.step(st, asKey ? text : { text });
    for (;;) {
      st = r.state; if (core.menuOpen(st) && io.menu) io.menu(r.screen); else r.screen.forEach(io.print); warmTo(st.building);
      if (!r.effects.length) break;
      const ef = r.effects[0], e = await exec(ef.line, ef.shown, ef.match);
      if (!e) break;
      if (ef.purpose === 'run') { const v = viewOf(e, ef.match); envs.push(v); await io.show(v, ef.view, ef.draw, ef.ctx); offerOf(v); st = core.step(st, { result: { purpose: 'ran', envelope: v } }).state; r = { state: st, effects: r.effects.slice(1), screen: [] }; continue; }   // §46 A4: the record's offers follow the answer
      r = core.step(st, { result: { purpose: ef.purpose, envelope: e } });
    }
    return envs;
  }
  return { run, prompt: () => core.prompt(st), state: () => st, menuOpen: () => core.menuOpen(st), core, vocab, R, door, words };
}

async function session(o) {
  let sh; try { sh = makeShell(Object.assign({}, o, { interactive: true })); } catch (e) { say('FAIL ' + e.message); return 1; }
  const { R, vocab } = sh, Dr = require(path.join(__dirname, 'draw_core.js')), tty = !!process.stdin.isTTY, histFile = process.env.RED1_HISTORY || path.join(os.homedir(), '.red1_history');
  let history = [], saved = []; if (tty || process.env.RED1_HISTORY) { try { saved = fs.readFileSync(histFile, 'utf8').split('\n').filter(Boolean).slice(-1000); history = saved.slice().reverse(); } catch (e) { /* first run */ } }   // §39 H4: saved = oldest first (the `history` numbering); RED1_HISTORY set = read without a terminal too
  const names = vocab.verbs.map(v => v.verb).concat(sh.core.wordList().map(w => w.word), ['help', 'bim', 'mis', 'erp', 'report', 'exit', 'quit', 'history', 'menu', 'cd', 'pwd', 'role', 'login']);
  // §1d.1 THE TYPE ASSIST: assist_core proposes what may come next at the end of the line; shown grey after the cursor (it extends what was typed) or as a dim hint
  // `▸ Name` (another spelling: case, -, a typo). Tab takes it (→ takes a grey one). Enter NEVER applies it: the line runs as typed. Not on a pipe, not in a menu.
  // film finding 4: a LOCAL folder can hold a private building; the assist offers only buildings this person has already opened (`cd <name>` in their history)
  //   that also exist here — `cd` itself still takes any name (RED1_ASSIST_BUILDINGS=all: every local one, the old behaviour)
  const BLD_ALL = buildingNames(), opened = (b) => history.concat(typed || []).some(h => new RegExp('^\\s*cd\\s+"?' + b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"?(\\s|;|$)').test(h));
  const BLD = () => (process.env.RED1_ASSIST_BUILDINGS === 'all' ? BLD_ALL : BLD_ALL.filter(opened));
  const AS = require(path.join(__dirname, 'assist_core.js')), VB = {}, DOF = ((sh.words.words.do || {}).forms || [{}])[0] || {};
  vocab.verbs.forEach(v => { VB[v.verb] = v; });
  // §1d.1 the ERP kinds `cd` can name, read ONCE per terminal session by one door line (journalled like any read), those with a window first
  let KINDS = [];
  if (tty && process.env.RED1_KINDS !== 'off') sh.door.runLine('mis.list kind=AD_Table columns=Name,AD_Window_ID IsActive=Y IsView=N sort=Name limit=1000', { actor: 'human' }).then(e => {
    const rows = e && e.status === 'ok' && e.answer && Array.isArray(e.answer.rows) ? e.answer.rows : [];
    KINDS = rows.filter(r => r.Name).map(r => ({ name: r.Name, window: r.AD_Window_ID != null })).sort((x, y) => (y.window - x.window) || (x.name < y.name ? -1 : 1));
    say('assist kinds=' + KINDS.length + ' with-window=' + KINDS.filter(k => k.window).length);
  }).catch(err => say('assist kinds FAIL ' + (err && err.message)));
  const narrowVB = (s) => { const off = sh.core.offered(s, [], Object.keys(VB)), o = {}; off.verbs.forEach(v => { o[v] = VB[v]; }); return o; };   // §40 C1: offers narrowed to the group, never what runs
  const actx = () => { const s = sh.state(), off = sh.core.offered(s, names.filter(n => n.indexOf('.') < 0), []);   // §40 C3/C5: in a record or the menu walk, cd / do / run offer the place's own
    return { words: off.words, verbs: narrowVB(s), buildings: off.places ? [] : BLD(), kinds: off.places ? [] : KINDS, places: off.places || null, props: s.kind ? s.props : (s.erp ? s.eprops : null), codes: off.codes || DOF.codes || {}, processes: off.processes || null }; };
  let hint = null;
  const completer = (line) => {
    if (hint && hint.ghost) return [[hint.token + hint.ghost], hint.token];
    if (hint && hint.replace && line.slice(-hint.replace.from.length) === hint.replace.from) { const to = line.slice(0, line.length - hint.replace.from.length) + hint.replace.to;   // readline completes by APPENDING; a different spelling replaces the token: clear the line, write it again
      say('assist take from=' + JSON.stringify(hint.replace.from) + ' to=' + JSON.stringify(hint.replace.to)); setImmediate(() => { rl.write(null, { ctrl: true, name: 'u' }); rl.write(to); }); return [[], line]; }
    const s0 = sh.state(), off = sh.core.offered(s0, names.filter(n => n.indexOf('.') < 0), names.filter(n => n.indexOf('.') >= 0)), here = off.words.concat(off.verbs);   // §40 C1
    const parts = line.split(/\s+/), w = parts.pop(), q = (n) => (/\s/.test(n) ? '"' + n + '"' : n);
    const arg = parts.length === 1 ? ({ cd: off.places ? off.places.map(q) : null, do: off.codes ? Object.keys(off.codes) : null, run: off.processes ? off.processes.map(q) : null })[parts[0]] : null;   // §40 C3/C5
    const pool = arg || here, hits = pool.filter(v => v.indexOf(w) === 0); return [hits.length ? hits : pool, w];
  };
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: tty, completer: tty ? completer : undefined, history, historySize: 1000, prompt: tty ? sh.prompt() : '' });
  const typed = [];
  let lastArrow = null, lastGap = null, lastBad = null, pendingReport = null, hintDue = false;   // §28
  const drawHint = () => {
    if (!tty || closed || sh.menuOpen() || (process.env.ASSIST_BREAK !== 'noquiet' && (pendingReport || (sh.state() || {}).asking || (sh.state() || {}).pending || (sh.state() || {}).offer))) { /* + an open next-step offer (§29.3; film rc2 finding) */ if (hint) process.stdout.write('\x1b[0K'); hint = null; return; }   // a question is open: no suggestion (film finding 3)
    const line = rl.line || '', r = rl.cursor === line.length && line.trim() ? AS.suggest(actx(), line) : null; hint = r && (r.ghost || r.replace) ? r : null;
    let t = !hint ? '' : hint.ghost ? hint.ghost : '   ▸ ' + hint.replace.to + (hint.candidates[0] && hint.candidates[0].reason ? '  (' + hint.candidates[0].reason + ')' : '');
    const room = (process.stdout.columns || 80) - sh.prompt().length - line.length - 1; if (t.length > room) t = room > 0 ? t.slice(0, room) : '';
    process.stdout.write('\x1b[0K' + (t ? '\x1b[90m' + t + '\x1b[0m\x1b[' + t.length + 'D' : ''));
  };
  if (tty) process.stdin.prependListener('keypress', (c, key) => {   // §46 A2: the grey suggestion is erased BEFORE readline ends the line (readline's own keypress handler runs first otherwise, and the grey text stayed on the finished line: film rc1 Found 5)
    if (key && (key.name === 'return' || key.name === 'enter') && hint && process.env.ASSIST_BREAK !== 'keephint') { process.stdout.write('\x1b[0K'); say('assist erased on return'); }   // keephint: W-RED1-ASSIST falsifier (must FAIL A9)
  });
  if (tty) process.stdin.on('keypress', (c, key) => {
    if (key && (key.name === 'return' || key.name === 'enter')) return;
    if (key && key.name === 'right' && hint && hint.ghost && rl.cursor === (rl.line || '').length) { const g = hint.ghost; hint = null; say('assist take ghost=' + JSON.stringify(g)); rl.write(g); return; }
    setImmediate(drawHint);
  });
  if (tty && process.env.RED1_LOG !== 'stderr') { const f = process.env.RED1_LOG || path.join(os.homedir(), '.cache', 'red1', 'red1.log'); try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.appendFileSync(f, ''); sayTo = f;
    const errW = process.stderr.write.bind(process.stderr);   // every § line of the session (the door's §DOOR too) goes to the same file; anything else (a real error) stays on screen
    process.stderr.write = (c, ...r) => { const t = String(c); if (/^§/.test(t)) { RING.push(t.replace(/\n$/, '')); if (RING.length > 200) RING.shift(); } if (sayTo && /^§/.test(t)) { try { fs.appendFileSync(sayTo, new Date().toISOString() + ' ' + t); return true; } catch (e) { /* fall through */ } } return errW(c, ...r); };
  } catch (e) { /* stays on stderr */ } }
  if (tty || process.env.WELCOME_BREAK === 'pipe') { const g = welcome(), tips = o.fast ? [] : [msgCore().t('words.tip_level')]; process.stdout.write(g.lines.concat(tips).join('\n') + '\n\n'); say('welcome lines=' + g.lines.length + ' tips=' + tips.length + (o.fast ? ' fast=1' : '') + ' version=' + JSON.stringify(g.version)); }   // the tip: VOCAB_MESSAGE_CATALOG.md §4 P3a-1 (owner: shown on opening, --fast skips it);   // §26: a terminal only (pipe: W-RED1-WELCOME falsifier, must FAIL W2)
  say('session tty=' + tty + ' journal=' + sh.door.journalFile + ' verbs=' + vocab.verbs.length + ' words=' + sh.core.wordList().length);
  // a pick menu on a terminal is redrawn in place (no scroll): the lines it took are cleared first; anything else printed ends that
  let menuH = 0;
  const w = (t) => { menuH = 0; process.stdout.write(t); };
  const io = {
    print: (t) => w(t + '\n'),
    arrow: (l) => { lastArrow = l; w('→ ' + l + '\n'); },
    menu: (lines) => { if (tty && menuH) process.stdout.write('\r\x1b[' + menuH + 'A\x1b[0J'); process.stdout.write(lines.join('\n') + '\n'); menuH = lines.length + (tty ? 1 : 0); },
    show: async (e, view, draw, ctx) => {
      { const gap = (e.answer && e.answer.gap) || e.status === 'error' || (process.env.REPORT_BREAK === 'allgaps' && e.status !== 'ok');   // §28: a gap = marked by the engine (answer.gap) or the engine could not answer (status error); allgaps: W-RED1-REPORT falsifier
        const rec = { line: lastArrow, why: e.why, status: e.status, gapKind: (e.answer && e.answer.gapKind) || (e.status === 'error' ? 'engine-error' : null) };
        if (e.status !== 'ok') lastBad = rec;
        if (gap) { lastGap = rec; hintDue = true; say('gap line=' + JSON.stringify(lastArrow) + ' kind=' + rec.gapKind); } }
      menuH = 0;
      const a = e.answer || {}, rows = Array.isArray(a.rows) && view !== 'summary' ? a.rows : null;
      if (draw === 'tree' && e.status === 'ok') {   // §22.8 R6: a document's next steps, from erp.actions' own answer
        const inv = {}; try { const ACT = require(path.join(__dirname, 'erp_cli.js')).ACT; Object.keys(ACT).forEach(v => { inv[ACT[v]] = v; }); } catch (x) { /* no erp_cli: codes only */ }
        const t = Dr.nextTree(a, inv, { ascii: process.env.RED1_ASCII === '1', brk: process.env.DRAW_BREAK || '' });
        if (t) { process.stdout.write(e.status + ' · ' + e.verb + ' · ' + e.ms + ' ms\n'); t.forEach(l => process.stdout.write(l + '\n')); say('draw tree lines=' + t.length + ' legal=' + JSON.stringify(a.legal)); return; }
      }
      if (draw === 'status' && e.status === 'ok') {   // §29.4 P5: the earned-value table, from erp.project_status' own answer
        const t = Dr.status(a);
        if (t) { process.stdout.write(e.status + ' · ' + e.verb + (e.held ? ' · held' : ' · ' + e.ms + ' ms') + '\n'); t.forEach(l => process.stdout.write(l + '\n')); say('draw status lines=' + t.length + ' phases=' + a.phases.length); return; }
      }
      if ((draw === 'record' || draw === 'tabs') && e.status === 'ok' && ctx) {   // §29.1: a record read as a record (not JSON), its tabs with their counts; both from the answer + the kind's own dictionary rows
        const t = draw === 'record' ? Dr.record(a, ctx, { brk: process.env.RECORD_BREAK || '' }) : Dr.tabs(a, ctx);
        if (t) { process.stdout.write(e.status + ' · ' + e.verb + (e.held ? ' · held' : ' · ' + e.ms + ' ms') + '\n'); t.forEach(l => process.stdout.write(l + '\n')); say('draw ' + draw + ' lines=' + t.length); return; }
      }
      if (draw === 'groups' && view === 'summary' && e.status === 'ok' && Array.isArray(a.groups)) {   // §29.2 cost: the groups first (the answer's own), `ls` = its rows (the held answer)
        process.stdout.write(e.status + ' · ' + e.verb + (e.held ? ' · held' : ' · ' + e.ms + ' ms') + '\n' + (a.summary ? a.summary + '\n' : ''));
        Dr.table([a.by || 'group', 'elements', 'cost'], a.groups.map(g => ({ [a.by || 'group']: g.key, elements: g.elements, cost: (a.precision != null && typeof g.cost === 'number' && process.env.COST_BREAK !== 'nopad') ? g.cost.toFixed(a.precision) : g.cost }))).forEach(l => process.stdout.write(l + '\n'));
        if (Array.isArray(a.rows)) process.stdout.write('ls lists the ' + a.rows.length + ' priced rows\n'); say('draw groups n=' + a.groups.length + ' total=' + a.total); return;
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
      else if (e.answer != null && !a.summary) {
        // §29.7 S1: a refusal is drawn once — the status line above already says refused + the reason (e.why); the gap marks are said by the gap line. Any OTHER key the engine sent is still drawn.
        const SAID = ['refused', 'reason', 'gap', 'gapKind'], rest = e.status === 'ok' || BREAK() === 'refusaljson' ? a : Object.keys(a).filter(k2 => SAID.indexOf(k2) < 0).reduce((o2, k2) => { o2[k2] = a[k2]; return o2; }, {});   // refusaljson: W-RED1-SHELL S6 falsifier
        if (e.status === 'ok' || Object.keys(rest).length) process.stdout.write((e.status === 'ok' && R.render(e, 'list')) || JSON.stringify(rest, null, 1).split('\n').slice(0, 40).join('\n') + '\n');
      }
    }
  };
  let busy = Promise.resolve(), closed = false;
  const MC = msgCore();
  const handle = async (raw) => {
    let line = raw.trim(); if ((!line && !sh.menuOpen() && !sh.state().asking && !sh.state().offer) || line.indexOf('--') === 0) return;   // an empty Return answers an open offer (n)
    if (!sh.menuOpen()) {   // §39 H2-H3: `!` history, expanded and echoed BEFORE it runs; history keeps the expanded line; no match runs nothing
      const bx = require(path.join(__dirname, 'words_core.js')).expandBang(saved.concat(typed), line, BREAK());
      if (bx && bx.none) { process.stdout.write(MC.t('words.bang_none', bx.asked) + '\n'); say('bang asked=' + JSON.stringify(bx.asked) + ' none=1'); return; }
      if (bx) { process.stdout.write('→ ' + bx.line + '\n'); say('bang asked=' + JSON.stringify(bx.asked) + ' line=' + JSON.stringify(bx.line)); line = bx.line; }
    }
    typed.push(line);
    if (R.isHelp(line) && !sh.menuOpen()) {   // §40 C1: `bim` / `mis` / `erp` ALONE now enter the group (words_core step); `help <g>` is the group's help   // §24: help / bim / mis / erp / help <word> = words_core.helpText (the SAME bytes as a one-shot `red1 help`); help verbs | help <app> | help <app.verb> = the door's own help
      const h = helpOf(sh.state().group && /^\s*(help|\?)\s*$/.test(line) ? 'help ' + sh.state().group : line, sh.core, vocab, sh.state().level); process.stdout.write(h.text); say('help topic=' + JSON.stringify(h.topic) + (h.door ? ' door=1' : ' words=1')); return;   // §40 C1: a bare help inside a group = that group
    }
    if (pendingReport && !sh.menuOpen()) {   // §28: the choice after `report`
      const g = pendingReport; pendingReport = null; const RC = require(path.join(__dirname, 'report_core.js'));
      if (!/^[12]$/.test(line)) { process.stdout.write('report cancelled: nothing was sent\n'); return; }
      const url = line === '1' ? RC.github(g) : RC.email(g); process.stdout.write((line === '1' ? 'GitHub issue' : 'Email') + ' (' + url.length + ' chars), open it to send:\n' + url + '\n');
      say('report via=' + (line === '1' ? 'github' : 'email') + ' chars=' + url.length);
      if (tty && process.env.RED1_NO_OPEN !== '1') { const op = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'; try { cp.spawn(op, [url], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref(); } catch (e) { /* the URL is printed */ } }
      return;
    }
    if (/^\s*report\s*$/i.test(line) && !sh.menuOpen()) {   // §28: the last gap (else the last line that did not answer ok) as a draft for the owner
      const g0 = lastGap || lastBad; if (!g0) { process.stdout.write('nothing to report: every line answered ok\n'); return; }
      const g = Object.assign({}, g0, { env: [['red1', welcome().version.replace(/^.*· red1 /, 'red1 ')], ['Platform', process.platform + ' ' + os.release()], ['Node', process.version], ['Place', sh.prompt().trim()]], logs: RING.slice(-50).map(l => process.env.REPORT_BREAK === 'nomask' ? String(l) : String(l).replace(/(\/tmp|\/home|\/Users|[A-Z]:\\Users)[^\s"',)]*/g, '<path>')) });   // film finding 5: no local path leaves in a report
      process.stdout.write('Draft (nothing is sent until you open it):\n' + require(path.join(__dirname, 'report_core.js')).draft(g) + '\nSend by: 1 GitHub issue · 2 email · q cancel\n');
      pendingReport = g; say('report draft gap=' + !!lastGap); return;
    }
    const sw = sh.menuOpen() ? null : SESSION_WORD.exec(line);
    if (sw) {
      const w = sw[1].toLowerCase();
      if (w === 'exit' || w === 'quit') { rl.close(); return; }
      if (w === 'history') { const all = saved.concat(typed.slice(0, -1)), nArg = Number((line.split(/\s+/)[1] || '').trim()), from = nArg > 0 ? Math.max(0, all.length - nArg) : 0; all.slice(from).forEach((l, i) => process.stdout.write(String(from + i + 1).padStart(4) + '  ' + l + '\n')); say('history saved=' + saved.length + ' session=' + (typed.length - 1) + ' shown=' + (all.length - from)); return; }   // §39 H1: earlier sessions too, numbered oldest first (the !n numbers)
      // §40 C5: `menu` in a session is the menu WALKED as places (words_core); `red1 menu` one-shot stays the full-screen menu (§21)
    }
    if (BREAK() === 'gatecontainer' && sh.state().group && /^\w+\.\w+/.test(line) && sh.core.groupOf(line.split(/\s/)[0]) !== sh.state().group) { process.stdout.write('refused: not in this group\n'); return; }   // W-RED1-CONTAINER X2 falsifier only
    await sh.run(line, io);
    say('typed n=' + typed.length + ' where=' + JSON.stringify(sh.prompt().trim()));
  };
  if (tty) process.stdin.on('keypress', (str, key) => {   // while a pick menu is open, Up/Down/Esc move it (readline would recall history); digits and Enter arrive as a line
    if (!sh.menuOpen() || !key || ['up', 'down', 'escape'].indexOf(key.name) < 0) return;
    setImmediate(() => { rl.write(null, { ctrl: true, name: 'u' }); busy = busy.then(() => sh.run({ key: key.name === 'up' ? 'Up' : key.name === 'down' ? 'Down' : 'Esc' }, io)).then(() => { if (!closed) { rl.setPrompt(sh.prompt()); rl.prompt(); } }); });
  });
  rl.on('line', (l) => { if (process.env.ASSIST_BREAK === 'autoapply' && hint && hint.replace && l.slice(-hint.replace.from.length) === hint.replace.from) l = l.slice(0, l.length - hint.replace.from.length) + hint.replace.to;   // W-RED1-ASSIST falsifier: Enter applies the hint (must FAIL A3)
    if (tty && hint) say('assist not-taken line=' + JSON.stringify(l) + ' hint=' + JSON.stringify(hint.ghost || hint.replace)); hint = null; busy = busy.then(() => handle(l)).then(() => { if (hintDue) { hintDue = false; process.stdout.write('This is a gap in red1, not your mistake. Type report to send it to us (email or GitHub issue).\n'); } if (!closed && tty) { rl.setPrompt(sh.prompt()); rl.prompt(); } }).catch(err => { say('FAIL ' + (err && err.stack || err)); }); });
  if (tty) {   // §40 C4: Shift+Tab (ESC [ Z, decoded as tab+shift) = one place back; it prints the line it stands for, so the session replays as text. Readline would complete on it: taken first.
    const tw = rl._ttyWrite.bind(rl);
    rl._ttyWrite = (str, key) => {
      if (key && key.name === 'tab' && key.shift && !sh.menuOpen()) { const b = sh.core.backLine(sh.state()); if (b) { rl.write(null, { ctrl: true, name: 'u' }); process.stdout.write('\n→ ' + b + '\n'); say('shift-tab line=' + JSON.stringify(b)); busy = busy.then(() => handle(b)).then(() => { if (!closed) { rl.setPrompt(sh.prompt()); rl.prompt(); } }); } return; }
      return tw(str, key);
    };
  }
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
  const flags = new Set(['--json', '--list', '--csv', '--dry', '--claims', '--fast']), withArg = new Set(['--out', '--actor', '--journal', '--request', '--script', '--confirm', '--level']);
  const rest = []; const o = { actor: 'human', fast: a.indexOf('--fast') >= 0 };
  for (let i = 0; i < a.length; i++) { if (withArg.has(a[i])) { if (a[i] === '--actor') o.actor = a[i + 1]; if (a[i] === '--journal') o.journal = a[i + 1]; if (a[i] === '--request') o.request = a[i + 1]; if (a[i] === '--level') o.level = a[i + 1]; i++; } else if (!flags.has(a[i])) rest.push(a[i]); }
  if (a.indexOf('--version') >= 0) { console.log(welcome().version); process.exit(0); }
  if (a.indexOf('-h') >= 0 || a.indexOf('--help') >= 0) { console.log("usage: red1                         (a session, the red1> prompt)\n       red1 'app.verb key=value …'  [--json|--list|--csv] [--out FILE]\n       red1 'cd Duplex; count'      (words, ; between them)\n       red1 -f FILE [--dry]\n       red1 help [topic]   [--level student]\n       red1 --fast                  (a session with no tips)"); process.exit(0); }
  const oneShot = rest.length > 0 || a.indexOf('--script') >= 0 || a.indexOf('--claims') >= 0 || a.indexOf('--confirm') >= 0;
  if (oneShot) {
    if (rest.length === 1 && /^\s*menu(\s|$)/i.test(rest[0])) { /* `red1 menu` = the door's terminal menu, passed as it is */ }
    else if (rest.length === 1 && (/^\s*(help|\?)(\s|$)/.test(rest[0]) || GROUP_WORD.test(rest[0])) && process.env.RED1_HELP_BREAK !== 'oneshot') {   // §24 D10: the session's help, the same bytes (oneshot: W-RED1-HELP falsifier, the door's text kept: must FAIL H1)
      if (o.level != null && ['short', 'student'].indexOf(o.level) < 0) { process.stderr.write(msgCore().t('words.level_bad', o.level, 'short, student') + '\n'); process.exit(2); }
      const w = wordsCore(), h = helpOf(rest[0], w.core, w.vocab, o.level === 'student' ? 'student' : null); process.stdout.write(h.text); say('help topic=' + JSON.stringify(h.topic) + (h.door ? ' door=1' : ' words=1')); process.exit(0);
    }
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
  const core = W.create({ vocab, words, msg: msgCore(), tokenize: D.tokenize, pickColumns: require(path.join(__dirname, 'mis_core.js')).pickColumns, buildings: buildingNames() }), door = D.createDoor({ journal: o.journal }), out = {};
  vocab.verbs.forEach((e, i) => { if (process.env.API_BREAK === 'skip' && i === vocab.verbs.length - 1) return;   // W-RED1-API falsifier: one verb left out (must FAIL A1)
    const [app, verb] = e.verb.split('.'); out[app] = out[app] || {};
    out[app][verb] = (args) => { const line = core.lineOf(e.verb, Object.assign({}, args || {})); return door.runLine(line, { actor: o.actor || 'human' }).then(env => Object.assign(env, { line })); }; });
  out.words = { run: async (text, place) => { const sh = makeShell(Object.assign({}, o, { interactive: false, warm: false })), envs = []; const io = { print: () => {}, arrow: () => {}, show: (e) => { envs.push(e); } };
    for (const p of (place ? [place] : []).concat(String(text).split(';'))) await sh.run(p.trim(), io); return envs; } };
  return out;
}
module.exports = { session, makeShell, buildingNames, api };
