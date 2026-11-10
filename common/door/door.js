#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — door.js: THE DOOR, the one command engine every actor goes through (D4). READ THE §-LOG (stderr) after every run.
// Spec: bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §0.4 (detail 3 grammar, 3a layers, tier 2) and §0.6/§0.7 (actors, record, envelope).
// Witnesses: common/door/tests/witness_door_*.js (W-DOOR-SHAPE/-DUP/-SAME, W-VOCAB-FRESH/-NOESCAPE, W-REPLY-HONEST, W-DSL).
//
// A line `[name =] app.verb key=value …` (one per line, `--` comments, "quoted values", `{expr}` arithmetic) is parsed, validated against the vocabulary
// (verbs.json; the SAME generated validator serves the AI connector), bound to an actor, recorded in a journal BEFORE it runs, and then the verb's
// existing CLI is called (calls.cli; never new logic). The reply is one envelope {request, verb, actor, status, answer, why, notChecked, ops, next, ms};
// answer is the engine's own JSON, unchanged. No AI parses anything here. No eval, no SQL, no shell: a verb can only name a CLI from the fixed table below.
//   node common/door/door.js [--actor human] [--request ID] [--journal FILE] 'modeller.lines building=HospitalGarage'
//   node common/door/door.js [--actor human] --script FILE|-          (several lines; named results flow downwards; stops at the first line that is not ok)
// Exit: 0 ok · 3 refused / claim / inconclusive (an answer, not a failure) · 1 error · 2 usage.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
// ONE resolver (bim_mcp.js asks it too). A file is looked for BESIDE this script first (the flat download an outsider makes: bim_mcp.js, edit_cli.js,
// door.js, verbs.json in one folder), then at its place in the repo layout. Missing files are reported with the exact curl line from the live site.
const LIVE = 'https://red1oon.github.io/bim-ootb/';
const FILES = {   // name -> [repo path from the repo root, name beside door.js]
  'door.js': ['common/door/door.js'], 'verbs.json': ['common/door/verbs.json'], 'edit_cli.js': ['modeller/tools/edit_cli.js'],
  'bim_mcp.js': ['modeller/tools/bim_mcp.js'], 'viewer_verbs.js': ['viewer/tools/viewer_verbs.js'], 'film_path_vis.js': ['viewer/tools/film_path_vis.js'], 'schedule_verbs.js': ['viewer/tools/schedule_verbs.js'], 'object_cli.js': ['common/door/object_cli.js'], 'erp_cli.js': ['common/door/erp_cli.js'], 'walk_cli.js': ['modeller/tools/walk_cli.js']
};
function locate(name) {
  const beside = path.join(__dirname, name), repo = path.join(ROOT, FILES[name][0]);
  return fs.existsSync(beside) ? beside : repo;   // when neither exists, the repo path is what the error names
}
const curlFor = (names) => names.map(n => 'curl -O ' + LIVE + FILES[n][0]).join('\n');
function missingFiles(names) { return names.filter(n => !fs.existsSync(locate(n))); }
// The ONLY programs a verb may call. A vocabulary entry names one of these keys; it never names a path or a program (W-VOCAB-NOESCAPE).
const CLI_TABLE = { edit_cli: locate('edit_cli.js'), viewer_verbs: locate('viewer_verbs.js'), film_path_vis: locate('film_path_vis.js'), schedule_verbs: locate('schedule_verbs.js'), object_cli: locate('object_cli.js'), erp_cli: locate('erp_cli.js'), walk_cli: locate('walk_cli.js') };
const HARM = ['read', 'trial', 'writes', 'posts', 'sends'];
const STATUS = ['ok', 'refused', 'claim', 'error', 'inconclusive'];
// §0.6 detail 4. Only the local actors are wired; any other name (email, mobile, device, an outside system) has no proof here: read only, the rest is a claim.
const ACTORS = { human: { proof: 'local-session', allow: HARM }, ai: { proof: 'local-user', allow: ['read', 'trial'] } };
const NO_PROOF = { proof: 'none', allow: ['read'] };
const BREAK = () => process.env.DOOR_BREAK || '';   // the witnesses' falsifiers: shape | float | halve | confirm_ai | confirm_twice

// ───────────────────────── exact decimal (BigInt coefficient + scale; no floating point) ─────────────────────────
const DIV_DIGITS = 30;   // division carries 30 fractional digits, rounded half up
class Dec {
  constructor(big, scale) { while (scale > 0 && big % 10n === 0n) { big /= 10n; scale--; } this.big = big; this.scale = scale; }
  static parse(s) {
    const m = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(String(s).trim());
    if (!m) return null;
    let scale = (m[3] || '').length - (m[4] ? +m[4] : 0), big = BigInt(m[2] + (m[3] || ''));
    if (scale < 0) { big *= 10n ** BigInt(-scale); scale = 0; }
    return new Dec(m[1] === '-' ? -big : big, scale);
  }
  static of(x) { return x instanceof Dec ? x : Dec.parse(typeof x === 'number' ? String(x) : x); }
  static align(a, b) { const s = Math.max(a.scale, b.scale); return [a.big * 10n ** BigInt(s - a.scale), b.big * 10n ** BigInt(s - b.scale), s]; }
  add(o) { const [x, y, s] = Dec.align(this, o); return new Dec(x + y, s); }
  sub(o) { const [x, y, s] = Dec.align(this, o); return new Dec(x - y, s); }
  mul(o) { return new Dec(this.big * o.big, this.scale + o.scale); }
  div(o) {
    if (o.big === 0n) throw new Error('division by zero');
    const neg = (this.big < 0n) !== (o.big < 0n), n = (this.big < 0n ? -this.big : this.big) * 10n ** BigInt(o.scale + DIV_DIGITS), d = (o.big < 0n ? -o.big : o.big) * 10n ** BigInt(this.scale);
    const q = (2n * n + d) / (2n * d);
    return new Dec(neg ? -q : q, DIV_DIGITS);
  }
  neg() { return new Dec(-this.big, this.scale); }
  toString() {
    const neg = this.big < 0n, a = (neg ? -this.big : this.big).toString().padStart(this.scale + 1, '0'), i = a.slice(0, a.length - this.scale), f = a.slice(a.length - this.scale);
    return (neg ? '-' : '') + i + (f ? '.' + f : '');
  }
}

// ───────────────────────── vocabulary and the generated validator ─────────────────────────
const TYPES = {   // door-side shape checks; the engine checks meaning (does the grid line exist?). `number` is handled apart.
  building: { re: /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/, what: 'a building name (letters, digits, _ . -; up to 64)' },
  grid_line: { re: /^[A-Za-z][A-Za-z0-9_]{0,15}$/, what: 'a grid line id such as gx6' },
  discipline: { re: /^[A-Za-z0-9_]{1,16}$/, what: 'a discipline code such as ARC or MEP' },
  string: { re: /^[^\u0000-\u001f]{1,200}$/, what: 'a short text' },
  file: { re: /^[^\u0000-\u001f]{1,500}$/, what: 'a file path' }
};
const jsType = (t) => (t === 'number' ? 'number' : 'string');
function loadVocab(file) {
  const j = JSON.parse(fs.readFileSync(file || locate('verbs.json'), 'utf8')), byVerb = new Map();
  for (const e of j.verbs) { if (byVerb.has(e.verb)) throw new Error('verbs.json: duplicate verb ' + e.verb); byVerb.set(e.verb, e); }
  return { verbs: j.verbs, byVerb, raw: j };
}
// The one validator. `args` is typed: a number input is a finite JS number or a Dec; every other input a string. Returns null (fine) or the reason.
function validate(entry, args) {
  args = args || {};
  const names = entry.inputs.map(i => i.name), miss = entry.inputs.filter(i => i.required && (args[i.name] === undefined || args[i.name] === null || args[i.name] === '')).map(i => i.name);
  if (miss.length) return 'missing input: ' + miss.join(', ');
  const extra = Object.keys(args).filter(k => names.indexOf(k) < 0);
  // §0.13: a verb that declares calls.rest takes further column=value inputs; the ENGINE checks each column against the dictionary (reflection). The door only checks the shape.
  if (extra.length && entry.calls && entry.calls.rest) { const bad = extra.filter(k => typeof args[k] !== 'string' || !TYPES.string.re.test(args[k]) || !/^[A-Za-z_]\w{0,63}$/.test(k)); return bad.length ? 'input ' + bad[0] + ' must be ' + TYPES.string.what : shapeOf(entry, args); }
  if (extra.length) return 'unknown input: ' + extra.join(', ') + ' (the verb ' + entry.verb + ' takes: ' + names.join(', ') + ')';
  return shapeOf(entry, args);
}
function shapeOf(entry, args) {
  if (BREAK() === 'shape') return null;
  for (const i of entry.inputs) {
    const v = args[i.name]; if (v === undefined) continue;
    if (i.type === 'number') { if (!(v instanceof Dec) && !(typeof v === 'number' && isFinite(v))) return 'input ' + i.name + ' must be a number'; continue; }
    if (typeof v !== 'string') return 'input ' + i.name + ' must be a string';
    const T = TYPES[i.type]; if (!T) return 'vocabulary error: input ' + i.name + ' has unknown type ' + i.type;
    if (!T.re.test(v)) return 'input ' + i.name + ' must be ' + T.what + ', got "' + v.slice(0, 60) + '"';
    if (i.enum && i.enum.indexOf(v) < 0) return 'input ' + i.name + ' must be one of ' + i.enum.join(', ') + ', got "' + v + '"';
  }
  return null;
}
// Text from a line (or a template/expression result) -> the input's type. Units are never written on the line.
function coerce(inp, raw) {
  if (inp.type === 'number') {
    if (raw instanceof Dec || typeof raw === 'number') return raw;
    const d = Dec.parse(raw);
    if (!d) throw new Error('input ' + inp.name + ' must be a plain number' + (inp.unit ? ' in ' + inp.unit : '') + ', got "' + raw + '"' + (/^-?\d+(\.\d+)?[A-Za-z]+$/.test(String(raw)) ? ' (units come from the vocabulary, not the line)' : ''));
    return d;
  }
  return raw instanceof Dec ? raw.toString() : (typeof raw === 'number' ? String(raw) : raw);
}
const decStr = (v) => (v instanceof Dec ? v : Dec.of(v)).toString();
function buildArgv(entry, args) {   // the argv template: strings with {input} holes; {"if":"input","args":[…]} for optional inputs
  const sub = (s) => s.replace(/\{(\w+)\}/g, (m, k) => { const i = entry.inputs.filter(x => x.name === k)[0], v = args[k]; return i && i.type === 'number' ? decStr(v) : String(v); });
  const out = [];
  for (const t of entry.calls.argv) { if (typeof t === 'string') out.push(sub(t)); else if (args[t.if] !== undefined) t.args.forEach(a => out.push(sub(a))); }
  if (entry.calls.rest) Object.keys(args).filter(k => !entry.inputs.some(i => i.name === k)).forEach(k => out.push(entry.calls.rest.flag, k + '=' + args[k]));
  return out;
}
function mcpTools(vocab) {   // the connector's tools/list, generated: legacy names, descriptions and schemas byte for byte (W-VOCAB-FRESH)
  return vocab.verbs.filter(e => e.mcp_name).map(e => ({
    name: e.mcp_name, description: e.description,
    inputSchema: { type: 'object', properties: Object.fromEntries(e.inputs.map(i => [i.name, { type: jsType(i.type), description: i.description }])), required: e.inputs.filter(i => i.required).map(i => i.name) }
  }));
}

// ───────────────────────── line grammar ─────────────────────────
// Tokens split on spaces; "double quotes" group (the quotes drop); {…} groups with nesting (kept whole); `--` at a token start is a comment.
function tokenize(line) {
  const toks = []; let cur = null, q = false, depth = 0;
  const push = () => { if (cur) { toks.push(cur); cur = null; } };
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') q = false; else cur.text += c; continue; }
    if (depth > 0) { cur.text += c; if (c === '{') depth++; else if (c === '}') depth--; continue; }
    if (c === '"') { if (!cur) cur = { text: '', quoted: true }; cur.quoted = true; q = true; continue; }
    if (/\s/.test(c)) { push(); continue; }
    if (c === '-' && line[i + 1] === '-' && !cur) break;   // comment to end of line
    if (!cur) cur = { text: '', quoted: false };
    cur.text += c; if (c === '{') depth++;
  }
  if (q) throw new Error('unclosed quote');
  if (depth > 0) throw new Error('unclosed { in expression');
  push(); return toks;
}
// -> {blank:true} | {question:true} | {name, verb, kv:[{k, raw, quoted}]} ; throws for a malformed command
function parseLine(line) {
  const toks = tokenize(line);
  if (!toks.length) return { blank: true };
  let name = null, i = 0;
  if (toks.length > 1 && toks[1].text === '=' && !toks[0].quoted && /^[A-Za-z_]\w*$/.test(toks[0].text)) { name = toks[0].text; i = 2; }
  const head = toks[i];
  if (!head || head.quoted || !/^[a-z][a-z0-9]*\.[a-z][a-z0-9_]*$/.test(head.text)) return { question: true, text: line.trim() };
  const kv = [], seen = {};
  for (const t of toks.slice(i + 1)) {
    const m = /^([A-Za-z_]\w*)=([\s\S]*)$/.exec(t.text);
    if (!m) throw new Error('"' + t.text + '" is not key=value');
    if (seen[m[1]]) throw new Error('input ' + m[1] + ' given twice');
    seen[m[1]] = 1; kv.push({ k: m[1], raw: m[2], quoted: t.quoted });
  }
  return { name, verb: head.text, kv };
}

// ───────────────────────── {expr}: exact-decimal arithmetic over inputs and named results ─────────────────────────
// scope: Map name -> {kind:'input', value} | {kind:'result', verb, answer}
function evalExpr(src, scope, vocab) {
  const toks = []; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if ('+-*/()'.indexOf(c) >= 0) { toks.push({ t: c }); i++; continue; }
    let m = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (m) { toks.push({ t: 'num', v: Dec.parse(m[0]) }); i += m[0].length; continue; }
    m = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*|\[[^\]]*\])*/.exec(src.slice(i));
    if (m) { toks.push({ t: 'ref', v: m[0] }); i += m[0].length; continue; }
    throw new Error('cannot read "' + src.slice(i, i + 12) + '" in {' + src + '}');
  }
  let p = 0;
  const peek = () => toks[p] && toks[p].t, take = () => toks[p++];
  const ref = (text) => {
    const segs = []; const re = /([A-Za-z_]\w*)|\[([^\]]*)\]/g; let m; while ((m = re.exec(text))) segs.push(m[1] !== undefined ? { key: m[1] } : { idx: m[2].replace(/^["']|["']$/g, '') });
    const root = scope.get(segs[0].key); if (!root) throw new Error('"' + segs[0].key + '" is not an input or a named result in {' + src + '}');
    if (segs.length === 1) { if (root.kind === 'input') return root.value; throw new Error('"' + segs[0].key + '" is a whole result; name a field of it, e.g. ' + segs[0].key + '.' + ((root.verbEntry && root.verbEntry.returns.fields[0] && root.verbEntry.returns.fields[0].path) || 'field')); }
    if (root.kind !== 'result') throw new Error('"' + segs[0].key + '" is an input; it has no fields');
    const decl = segs.slice(1).map(s => (s.key !== undefined ? '.' + s.key : '[*]')).join('').replace(/^\./, ''), fields = (root.verbEntry.returns.fields || []).map(f => f.path);
    if (fields.indexOf(decl) < 0) throw new Error('field "' + decl + '" is not declared in the returns of ' + root.verb + ' (declared: ' + fields.join(', ') + ')');
    let node = root.answer;
    for (const s of segs.slice(1)) {
      if (s.key !== undefined) { if (node == null || typeof node !== 'object' || !(s.key in node)) throw new Error('the ' + root.verb + ' answer has no ' + s.key + ' (in ' + text + ')'); node = node[s.key]; }
      else {
        const e = scope.get(s.idx), key = e && e.kind === 'input' ? String(e.value) : s.idx;
        if (!Array.isArray(node)) throw new Error('not a list at [' + s.idx + '] in ' + text);
        const hit = node.filter(x => x && x.id === key)[0]; if (!hit) throw new Error('the ' + root.verb + ' answer has no element with id ' + key + ' (in ' + text + ')');
        node = hit;
      }
    }
    if (typeof node === 'number') return Dec.of(node);
    if (typeof node === 'string') return node;
    throw new Error('field ' + decl + ' is not a number or text');
  };
  const num = (v) => { if (v instanceof Dec) return v; throw new Error('"' + v + '" is text, not a number, in {' + src + '}'); };
  const atom = () => {
    const t = take(); if (!t) throw new Error('unexpected end of {' + src + '}');
    if (t.t === 'num') return t.v;
    if (t.t === 'ref') return ref(t.v);
    if (t.t === '-') return num(atom()).neg();
    if (t.t === '(') { const v = sum(); if (peek() !== ')') throw new Error('missing ) in {' + src + '}'); take(); return v; }
    throw new Error('unexpected "' + t.t + '" in {' + src + '}');
  };
  const prod = () => { let v = atom(); while (peek() === '*' || peek() === '/') { const o = take().t, r = atom(); v = bin(o, v, r); } return v; };
  const sum = () => { let v = prod(); while (peek() === '+' || peek() === '-') { const o = take().t, r = prod(); v = bin(o, v, r); } return v; };
  const bin = (o, a, b) => {
    a = num(a); b = num(b);
    if (BREAK() === 'float') { const x = +a.toString(), y = +b.toString(); return Dec.parse(String(o === '+' ? x + y : o === '-' ? x - y : o === '*' ? x * y : x / y)) || a; }   // falsifier: floating point
    return o === '+' ? a.add(b) : o === '-' ? a.sub(b) : o === '*' ? a.mul(b) : a.div(b);
  };
  const v = sum(); if (p < toks.length) throw new Error('unexpected "' + toks[p].t + '" in {' + src + '}');
  if (BREAK() === 'halve' && v instanceof Dec) return v.div(Dec.parse('2'));   // falsifier: the arithmetic is wrong
  return v;
}
// a value: exactly {expr} -> typed value; text with {name} holes -> string; else the text
function evalValue(raw, quoted, scope, vocab) {
  if (raw.charAt(0) === '{' && raw.charAt(raw.length - 1) === '}' && !quoted) { let d = 0, whole = true; for (let i = 0; i < raw.length; i++) { if (raw[i] === '{') d++; else if (raw[i] === '}') { d--; if (d === 0 && i < raw.length - 1) whole = false; } } if (whole) return evalExpr(raw.slice(1, -1), scope, vocab); }
  if (raw.indexOf('{') < 0) return raw;
  return raw.replace(/\{([^{}]*)\}/g, (m, e) => { const v = evalExpr(e, scope, vocab); return v instanceof Dec ? v.toString() : v; });
}

// ───────────────────────── the door ─────────────────────────
function createDoor(opts) {
  opts = opts || {};
  const vocab = opts.vocab || loadVocab(opts.vocabFile), cli = Object.assign({}, CLI_TABLE, opts.cli || {});
  const journalFile = opts.journal || process.env.BIM_DOOR_JOURNAL || path.join(os.homedir(), '.cache', 'bim_door', 'journal.jsonl');
  const say = opts.say || ((s) => process.stderr.write('§DOOR ' + s + '\n'));
  const inflight = new Map(), door = { vocab, spawned: 0, journalFile, validate: (v, a) => validate(vocab.byVerb.get(v), a), mcpTools: () => mcpTools(vocab) };
  let seq = 0;
  checkComposed();

  function checkComposed() {   // load-time: a composed verb's body must be readable, its verbs/keys real, harm = the highest of its lines, no cycles
    const state = {};
    const visit = (e, chain) => {
      if (!e.body) return;
      if (chain.indexOf(e.verb) >= 0) throw new Error('verbs.json: composed verb ' + e.verb + ' calls itself (' + chain.concat(e.verb).join(' > ') + ')');
      let top = 0, allowed = e.actors.slice();
      e.body.forEach((ln, n) => {
        const pl = parseLine(ln); if (pl.question || pl.blank) throw new Error('verbs.json: ' + e.verb + ' line ' + (n + 1) + ' is not a command');
        const t = vocab.byVerb.get(pl.verb); if (!t) throw new Error('verbs.json: ' + e.verb + ' line ' + (n + 1) + ' calls unknown verb ' + pl.verb);
        pl.kv.forEach(x => { if (!t.inputs.some(i => i.name === x.k) && !(t.calls && t.calls.rest)) throw new Error('verbs.json: ' + e.verb + ' line ' + (n + 1) + ' gives ' + pl.verb + ' an unknown input ' + x.k); });
        visit(t, chain.concat(e.verb));
        top = Math.max(top, HARM.indexOf(t.harm)); allowed = allowed.filter(a => t.actors.indexOf(a) >= 0);
      });
      if (HARM[top] !== e.harm) throw new Error('verbs.json: ' + e.verb + ' declares harm ' + e.harm + ' but its lines reach ' + HARM[top]);
      if (allowed.length !== e.actors.length) throw new Error('verbs.json: ' + e.verb + ' lists actors that a line of its body does not allow');
    };
    vocab.verbs.forEach(e => visit(e, []));
  }
  // ── journal ──
  function jread() { try { return fs.readFileSync(journalFile, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean); } catch (e) { return []; } }
  function jwrite(o) { fs.mkdirSync(path.dirname(journalFile), { recursive: true }); fs.appendFileSync(journalFile, JSON.stringify(o) + '\n'); }
  const newId = () => 'd-' + Date.now().toString(36) + '-' + process.pid + '-' + (++seq);

  function envelope(base, status, o) {
    const e = { request: base.request, verb: base.verb, actor: base.actor, status, answer: o.answer === undefined ? null : o.answer, why: o.why || null, notChecked: o.notChecked || [], ops: o.ops || [], next: [], ms: Date.now() - base.t0 };
    Object.defineProperty(e, '_raw', { value: o.raw === undefined ? null : o.raw, enumerable: false });
    return e;
  }
  function spawnCli(key, argv) {
    return new Promise((res) => {
      const file = cli[key];
      if (!file || !fs.existsSync(file)) return res({ code: 1, out: '', err: key + ' is not at ' + file + '. ' + (key === 'edit_cli' ? 'Download it beside door.js: ' + curlFor(['edit_cli.js']) : 'The Viewer tools need a bim-ootb checkout (the Viewer page tree).') });
      door.spawned++;
      let out = '', err = '';
      const p = spawn(process.execPath, [file].concat(argv), { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
      p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { err += d; });
      p.on('close', code => res({ code, out: out.trim(), err: err.trim() }));
    });
  }
  function engineResult(entry, base, r) {   // each engine's own exit contract -> the envelope's status; its JSON stays inside, unchanged
    const who = entry.calls.who || 'the app', fail = (why, status) => envelope(base, status || 'error', { why });
    const parse = () => { try { return JSON.parse(r.out); } catch (e) { return undefined; } };
    if (entry.calls.cli === 'edit_cli') {   // exit 0 every edit reported · 3 refused or stopped (an answer) · 2 usage · 1 failed
      if ((r.code === 0 || r.code === 3) && r.out) {
        const a = parse(); if (a === undefined) return fail('the ' + who.replace(/^the /, '') + ' answered with text that is not JSON');
        const edit = (a.edits || []).filter(x => x.refused)[0] || (a.edits || [])[0] || {}, nc = (edit.report && edit.report.notChecked) || [];
        return envelope(base, r.code === 3 ? 'refused' : 'ok', { answer: a, raw: r.out, why: r.code === 3 ? (edit.reason || 'refused') : null, notChecked: nc });
      }
      return fail('the app could not answer (exit ' + r.code + '): ' + (r.err || r.out || 'no output').split('\n').slice(-3).join(' '));
    }
    if (entry.calls.cli === 'viewer_verbs') {   // exit 0 the Viewer answered · 1 an error with the reason on stderr (INCONCLUSIVE/VACUOUS arrive here) · 2 usage
      if (r.code === 0 && r.out) { const a = parse(); return a === undefined ? fail('the Viewer answered with text that is not JSON') : envelope(base, a.verdict === 'OK' ? 'ok' : 'inconclusive', { answer: a, raw: r.out, why: a.verdict === 'OK' ? null : a.summary }); }
      const msg = (r.err.split('\n').filter(l => /VIEWER_VERB FAIL|viewer/.test(l)).pop() || r.err || r.out || 'no output').replace(/^§VIEWER_VERB FAIL /, '');
      return fail('the Viewer could not answer (exit ' + r.code + '): ' + msg, /the Viewer says (INCONCLUSIVE|VACUOUS)/.test(msg) ? 'inconclusive' : 'error');
    }
    if (entry.calls.cli === 'film_path_vis') {   // exit 0 judged · 3 INCONCLUSIVE (nothing judged) · 1 failed · 2 usage
      const a = parse();
      if ((r.code === 0 || r.code === 3) && a !== undefined) {
        const nc = (a.log || []).filter(l => /not-checked:/.test(l)).map(l => l.replace(/^.*not-checked:\s*/, '')), inc = r.code === 3 || a.verdict === 'INCONCLUSIVE';
        return envelope(base, inc ? 'inconclusive' : 'ok', { answer: a, raw: r.out, why: inc ? ((a.log || []).filter(l => /verdict=INCONCLUSIVE/.test(l))[0] || 'nothing was judged') : null, notChecked: nc });
      }
      return fail('the Viewer could not answer (exit ' + r.code + '): ' + (r.err || r.out || 'no output').split('\n').slice(-3).join(' '));
    }
    if (entry.calls.cli === 'schedule_verbs') {   // exit 0 answered (OK | PASS | FAIL are answers) · 3 INCONCLUSIVE (nothing judged) · 1 failed (unknown building) · 2 usage
      const a = parse();
      if ((r.code === 0 || r.code === 3) && a !== undefined) {
        const inc = r.code === 3 || a.verdict === 'INCONCLUSIVE' || a.verdict === 'VACUOUS';
        return envelope(base, inc ? 'inconclusive' : 'ok', { answer: a, raw: r.out, why: inc ? a.summary : null, notChecked: a.notChecked || [] });
      }
      return fail('the Viewer could not answer (exit ' + r.code + '): ' + (r.err.split('\n').filter(l => /SCHED_VERB (FAIL|USAGE)/.test(l)).pop() || r.err || r.out || 'no output').replace(/^§SCHED_VERB (FAIL|USAGE) /, ''));
    }
    if (entry.calls.cli === 'object_cli') {   // exit 0 answered · 3 refused (a dictionary rule or a missing record: an answer) · 1 failed (unknown kind, no dictionary) · 2 usage
      const a = parse();
      if ((r.code === 0 || r.code === 3) && a !== undefined) return r.code === 3 ? envelope(base, 'refused', { answer: a, raw: r.out, why: a.reason || 'refused' }) : a.verdict === 'VACUOUS' ? envelope(base, 'inconclusive', { answer: a, raw: r.out, why: a.summary }) : envelope(base, 'ok', { answer: a, raw: r.out, ops: a.ops || [] });
      return fail('the object engine could not answer (exit ' + r.code + '): ' + (r.err.split('\n').filter(l => /§OBJECT FAIL/.test(l)).pop() || r.err || r.out || 'no output').replace(/^§OBJECT FAIL /, ''));
    }
    if (entry.calls.cli === 'erp_cli') {   // exit 0 answered · 3 refused (not found, not offered, the engine said no: an answer) · 1 failed · 2 usage. `next` = the legal actions the engine reports (verbs(ctx))
      const a = parse();
      if ((r.code === 0 || r.code === 3) && a !== undefined) {
        const e = r.code === 3 ? envelope(base, 'refused', { answer: a, raw: r.out, why: a.reason || 'refused' }) : envelope(base, 'ok', { answer: a, raw: r.out, ops: a.ops || [] });
        const nx = a.actions && a.actions.actions ? a.actions.actions : a.actions; if (Array.isArray(nx)) e.next = nx.slice();
        return e;
      }
      return fail('the ERP engine could not answer (exit ' + r.code + '): ' + (r.err.split('\n').filter(l => /§ERP FAIL/.test(l)).pop() || r.err || r.out || 'no output').replace(/^§ERP FAIL /, ''));
    }
    if (entry.calls.cli === 'walk_cli') {   // exit 0 answered (verdict OK; VACUOUS = the walk placed nothing, so nothing was counted) · 1 failed (unknown building or discipline, named) · 2 usage
      const a = parse();
      if (r.code === 0 && a !== undefined) return envelope(base, a.verdict === 'OK' ? 'ok' : 'inconclusive', { answer: a, raw: r.out, why: a.verdict === 'OK' ? null : a.summary, notChecked: a.notChecked || [] });
      return fail('the Modeller\'s walker could not answer (exit ' + r.code + '): ' + (r.err.split('\n').filter(l => /§WALK (FAIL|USAGE)/.test(l)).pop() || r.err || r.out || 'no output').replace(/^§WALK (FAIL|USAGE) /, ''));
    }
    return fail('no result mapping for ' + entry.calls.cli);
  }
  // one command through the whole stack. args are typed. scope is given only for composed bodies and scripts.
  async function execArgs(o) {
    const request = o.request || newId(), actor = o.actor || 'human', base = { request, verb: o.verb || null, actor, t0: Date.now() }, line = o.line || lineOf(o.verb, o.args || {});
    if (inflight.has(request)) { const e = await inflight.get(request); say('request=' + request + ' actor=' + actor + ' verb=' + base.verb + ' status=' + e.status + ' replayed=1 inflight=1'); return e; }
    const done = jread().filter(x => x.request === request && x.state === 'done')[0];
    if (done) { const e = Object.assign({}, done.envelope); Object.defineProperty(e, '_raw', { value: e.answer === null ? null : JSON.stringify(e.answer), enumerable: false }); say('request=' + request + ' actor=' + actor + ' verb=' + base.verb + ' status=' + e.status + ' replayed=1'); return e; }
    const p = (async () => {
      const entry = vocab.byVerb.get(o.verb), prior = jread().filter(x => x.request === request && x.state === 'started')[0];
      jwrite({ request, state: 'started', t: new Date().toISOString(), actor, proof: (ACTORS[actor] || NO_PROOF).proof, line, verb: o.verb || null, inputs: serial(o.args) });
      let env;
      try { env = await decide(entry, base, o, prior); } catch (e) { env = envelope(base, 'error', { why: String(e && e.message || e) }); }
      jwrite({ request, state: 'done', t: new Date().toISOString(), envelope: env });
      say('request=' + request + ' actor=' + actor + ' verb=' + base.verb + ' status=' + env.status + ' ms=' + env.ms + (env.status === 'refused' || env.status === 'error' || env.status === 'inconclusive' ? ' why=' + JSON.stringify(String(env.why).slice(0, 120)) : ''));
      return env;
    })();
    inflight.set(request, p);
    try { return await p; } finally { inflight.delete(request); }
  }
  async function decide(entry, base, o, prior) {
    if (!entry) return envelope(base, 'error', { why: 'unknown verb: ' + base.verb + '. Verbs: ' + vocab.verbs.map(v => v.verb).join(', ') });
    const bad = validate(entry, o.args); if (bad) return envelope(base, 'error', { why: bad });
    const A = ACTORS[base.actor] || NO_PROOF;
    if (A.allow.indexOf(entry.harm) < 0) return envelope(base, 'claim', { why: 'actor ' + base.actor + ' has proof "' + A.proof + '", which allows ' + A.allow.join('/') + ' verbs; ' + entry.verb + ' is ' + entry.harm + '. Held as a claim, not run. A person confirms it with: door.js --confirm ' + base.request });
    if (entry.actors.indexOf(base.actor) < 0) return envelope(base, 'refused', { why: 'actor ' + base.actor + ' is not allowed to use ' + entry.verb + ' (allowed: ' + entry.actors.join(', ') + ')' });
    if (prior && HARM.indexOf(entry.harm) > 1) return envelope(base, 'refused', { why: 'request ' + base.request + ' started earlier and no result was recorded; a ' + entry.harm + ' verb is not re-run on a guess' });
    if (entry.body) return composed(entry, base, o);
    if (!Object.prototype.hasOwnProperty.call(cli, entry.calls.cli)) return envelope(base, 'error', { why: 'verb ' + entry.verb + ' names a program (' + entry.calls.cli + ') that is not in the door\'s table; not run' });
    return engineResult(entry, base, await spawnCli(entry.calls.cli, buildArgv(entry, o.args)));
  }
  async function composed(entry, base, o) {   // tier 2: every line is a door command; the first line that is not ok stops the body
    const scope = new Map(); entry.inputs.forEach(i => { if (o.args[i.name] !== undefined) scope.set(i.name, { kind: 'input', value: o.args[i.name] }); });
    const rec = []; let last = null;
    for (let n = 0; n < entry.body.length; n++) {
      const e = await runLine(entry.body[n], { scope, actor: base.actor, request: base.request + '.' + (n + 1) });
      rec.push({ n: n + 1, line: entry.body[n], envelope: e }); last = e;
      if (e.status !== 'ok') return envelope(base, e.status, { answer: { lines: rec }, why: 'line ' + (n + 1) + ' (' + e.verb + '): ' + e.why, notChecked: e.notChecked, raw: JSON.stringify({ lines: rec }) });
    }
    return envelope(base, 'ok', { answer: { lines: rec }, notChecked: last ? last.notChecked : [], raw: JSON.stringify({ lines: rec }) });
  }
  // one text line -> envelope. scope (optional) holds inputs and named results; a named result is stored in it when the line is ok.
  async function runLine(text, ctx) {
    ctx = ctx || {}; const actor = ctx.actor || 'human', request = ctx.request || newId(), base = { request, verb: null, actor, t0: Date.now() };
    let pl;
    try { pl = parseLine(text); } catch (e) { return journalled(base, text, envelope(base, 'error', { why: 'cannot read the line: ' + e.message })); }
    if (pl.blank) return null;
    if (pl.question) return journalled(base, text, envelope(base, 'refused', { why: 'not a command: "' + pl.text.slice(0, 80) + '"', answer: { question: 'I could not read that as a command. A command is app.verb key=value … Which one do you mean?', verbs: vocab.verbs.map(v => v.verb) } }));
    const entry = vocab.byVerb.get(pl.verb); base.verb = pl.verb;
    if (!entry) return journalled(base, text, envelope(base, 'error', { why: 'unknown verb: ' + pl.verb + '. Verbs: ' + vocab.verbs.map(v => v.verb).join(', ') }));
    const scope = ctx.scope || new Map(), args = {};
    try {
      for (const x of pl.kv) { const inp = entry.inputs.filter(i => i.name === x.k)[0]; if (!inp) { args[x.k] = x.raw; continue; } args[x.k] = coerce(inp, evalValue(x.raw, x.quoted, scope, vocab)); }
    } catch (e) { return journalled(base, text, envelope(base, 'error', { why: e.message })); }
    const env = await execArgs({ verb: pl.verb, args, actor, request, line: text });
    if (pl.name && env.status === 'ok') scope.set(pl.name, { kind: 'result', verb: pl.verb, verbEntry: entry, answer: env.answer });
    return env;
  }
  function journalled(base, line, env) {   // a line that never reached execArgs is still recorded, and still answered once per request id
    jwrite({ request: base.request, state: 'started', t: new Date().toISOString(), actor: base.actor, proof: (ACTORS[base.actor] || NO_PROOF).proof, line, verb: base.verb });
    jwrite({ request: base.request, state: 'done', t: new Date().toISOString(), envelope: env });
    say('request=' + base.request + ' actor=' + base.actor + ' verb=' + base.verb + ' status=' + env.status + ' why=' + JSON.stringify(String(env.why).slice(0, 120)));
    return env;
  }
  function serial(a) { const o = {}; Object.keys(a || {}).forEach(k => { o[k] = a[k] instanceof Dec ? a[k].toString() : a[k]; }); return o; }
  function lineOf(verb, a) { return verb + Object.keys(a).map(k => ' ' + k + '=' + (typeof a[k] === 'string' ? JSON.stringify(a[k]) : (a[k] instanceof Dec ? a[k].toString() : String(a[k])))).join(''); }

  door.execArgs = execArgs;   // typed arguments (the AI connector's JSON maps one to one onto a line)
  door.runLine = runLine;
  door.runScript = async (text, ctx) => {   // several lines, named results flow downwards, stops at the first line that is not ok
    ctx = Object.assign({}, ctx); ctx.scope = ctx.scope || new Map(); const base = ctx.request, out = []; let n = 0;
    for (const ln of String(text).split('\n')) { const c = Object.assign({}, ctx, { request: base ? base + '.' + (++n) : undefined }); const e = await runLine(ln, c); if (!e) continue; out.push(e); if (e.status !== 'ok') break; }
    return out;
  };
  // ── §0.14 the confirm channel: a person lets a held claim through by its request id. The recorded line runs byte for byte, as the person, once. ──
  const CONF = '#confirmed';
  door.claims = () => {
    const all = jread(), confirmed = new Set(all.filter(x => x.state === 'done' && String(x.request).indexOf(CONF) > 0).map(x => String(x.request).split(CONF)[0]));
    return all.filter(x => x.state === 'done' && x.envelope && x.envelope.status === 'claim' && !confirmed.has(x.request)).map(d => { const st = all.filter(x => x.request === d.request && x.state === 'started')[0] || {}, e = vocab.byVerb.get(st.verb); return { request: d.request, t: st.t || d.t, actor: st.actor || null, line: st.line || null, verb: st.verb || null, harm: e ? e.harm : null }; });
  };
  door.confirm = async (id, ctx) => {
    ctx = ctx || {}; const actor = ctx.actor || 'human', base = { request: id + CONF, verb: null, actor, t0: Date.now() }, all = jread();
    const st = all.filter(x => x.request === id && x.state === 'started')[0], dn = all.filter(x => x.request === id && x.state === 'done')[0];
    const out = (status, why) => { const e = envelope(base, status, { why }); e.confirms = id; say('confirm=' + id + ' actor=' + actor + ' status=' + status + ' why=' + JSON.stringify(why.slice(0, 120))); return e; };
    if (!st || !dn) return out('error', 'no request "' + id + '" in the journal ' + journalFile + ' (held claims: ' + (door.claims().map(c => c.request).join(', ') || 'none') + ')');
    base.verb = st.verb || null;
    if (!dn.envelope || dn.envelope.status !== 'claim') return out('refused', 'request ' + id + ' was ' + (dn.envelope ? dn.envelope.status : 'never answered') + '; only a held claim is confirmed');
    if (actor !== 'human' && BREAK() !== 'confirm_ai') return out('refused', 'a claim is confirmed by a person at a local session; actor ' + actor + ' cannot confirm. The claim stays held.');
    const env = await runLine(st.line, { actor: 'human', request: id + CONF + (BREAK() === 'confirm_twice' ? '-' + Date.now() : '') });
    env.confirms = id; return env;
  };
  door.parseLine = parseLine; door.coerce = coerce;
  return door;
}

module.exports = { locate, missingFiles, curlFor, createDoor, loadVocab, validate, coerce, parseLine, tokenize, evalExpr, mcpTools, Dec, CLI_TABLE, HARM, STATUS, ACTORS, TYPES };

if (require.main === module) {
  (async () => {
    const a = process.argv.slice(2), o = { actor: 'human' }; let script = null; const rest = [];
    for (let i = 0; i < a.length; i++) {
      if (a[i] === '--actor') o.actor = a[++i]; else if (a[i] === '--request') o.request = a[++i]; else if (a[i] === '--journal') o.journal = a[++i];
      else if (a[i] === '--script') script = a[++i]; else if (a[i] === '--confirm') o.confirm = a[++i]; else if (a[i] === '--claims') o.claims = true; else rest.push(a[i]);
    }
    if (!script && !o.confirm && !o.claims && rest.length !== 1) { console.error('usage: node common/door/door.js [--actor human|ai] [--request ID] [--journal FILE] \'app.verb key=value …\'   |   --script FILE|-   |   --claims   |   --confirm REQUEST_ID'); process.exit(2); }
    let door; try { door = createDoor({ journal: o.journal }); } catch (e) { console.error('§DOOR FAIL ' + e.message); process.exit(1); }
    if (o.claims) { const c = door.claims(); console.error('§DOOR claims held=' + c.length + ' journal=' + door.journalFile); console.log(JSON.stringify({ claims: c })); process.exit(0); }
    if (o.confirm) { const e = await door.confirm(o.confirm, o); console.log(JSON.stringify(e)); process.exit(e.status === 'ok' ? 0 : (e.status === 'error' ? 1 : 3)); }
    const envs = script ? await door.runScript(script === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(script, 'utf8'), o) : [await door.runLine(rest[0], o)].filter(Boolean);
    envs.forEach(e => console.log(JSON.stringify(e)));
    const worst = envs.length ? envs[envs.length - 1].status : 'error';
    process.exit(worst === 'ok' ? 0 : (worst === 'error' ? 1 : 3));
  })().catch(e => { console.error('§DOOR FAIL ' + (e && e.stack || e)); process.exit(1); });
}
