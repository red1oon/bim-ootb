#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — dotted.js: the DOTTED FORM, a front end for PEOPLE (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §0.10.4, §0.13 item 3). READ THE §DOTTED lines after every run.
// It is NOT a second grammar at the door: a chain is compiled to ONE canonical door line, that line is printed, and only that line goes through the door (door.js), which journals it.
// The door itself refuses a dotted string. It is not offered to an AI (its menu is the verb list): --actor other than human is refused, and bim_mcp.js does not list it.
//   app(model).Kind.measure                    viewer(Duplex).Room.count              -> object.count building=Duplex kind=Room
//   app(model).Kind[column=value, …].measure   viewer(Duplex).Room[storey="Level 1"].count
//   app(model).method(args).field.path         viewer(Duplex).schedule_at(day=5).counts.placed   -> viewer.schedule_at building=Duplex day=5 ; then reads counts.placed
// One verb call per chain. Every name is resolved from the vocabulary (verbs.json): a measure is an object.* verb marked "measure"; a method is the verb app.method; arguments are named or
// positional in the vocabulary's order; a field must be one of the verb's returns.fields. A wrong name is an error that names it and lists the legal ones. A kind or a column is checked by
// the engine, through the door. No expression, no arithmetic, nothing evaluated.
// Exit: as door.js (0 ok · 3 refused/claim/inconclusive · 1 error) · 2 usage or a chain that does not compile.
'use strict';
const path = require('path'), D = require('./door.js');
const say = (s) => process.stderr.write('§DOTTED ' + s + '\n');
const BREAK = () => process.env.DOTTED_BREAK || '';   // W-DOTTED falsifier: line (the front end compiles another building)
class Bad extends Error {}
const bad = (m) => { throw new Bad(m); };

// ── a small reader: names, ( ) [ ] . , = and "quoted text" ──
function lex(src) {
  const t = []; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if ('()[].,='.indexOf(c) >= 0) { t.push({ t: c }); i++; continue; }
    if (c === '"') { const j = src.indexOf('"', i + 1); if (j < 0) bad('unclosed quote in the chain'); t.push({ t: 'w', v: src.slice(i + 1, j), q: true }); i = j + 1; continue; }
    const m = /^[A-Za-z0-9_+\-\/≈$]+(?:\.\d+)?/.exec(src.slice(i));   // a name or a number (a decimal point followed by digits stays in the number only when the token starts as a number)
    if (!m) bad('cannot read "' + src.slice(i, i + 12) + '" in the chain');
    let w = m[0]; if (!/^[+-]?\d/.test(w)) w = /^[A-Za-z0-9_+\-\/≈$]+/.exec(w)[0];
    t.push({ t: 'w', v: w }); i += w.length;
  }
  return t;
}
const quote = (v) => (/^[A-Za-z0-9_.+\-\/]+$/.test(v) ? v : '"' + v + '"');
function compile(chain, vocab) {
  if (/[{}]/.test(chain)) bad('a chain takes no expression ({ }); arithmetic belongs on door lines');
  const T = lex(chain); let p = 0;
  const peek = () => T[p] && T[p].t, take = (t, what) => { if (!T[p] || T[p].t !== t) bad('expected ' + what + ' at "' + (T[p] ? (T[p].v || T[p].t) : 'the end') + '"'); return T[p++]; };
  const apps = Array.from(new Set(vocab.verbs.map(v => v.verb.split('.')[0])));
  const app = take('w', 'an app name').v;
  if (apps.indexOf(app) < 0) bad('unknown app "' + app + '" (apps: ' + apps.join(', ') + ')');
  take('(', '( after the app'); const model = take('w', 'a model name').v; take(')', ') after the model'); take('.', 'a . after app(model)');
  const head = take('w', 'a kind or a method');
  const pairs = (close) => {   // name=value or value, comma separated
    const out = []; if (peek() === close) { p++; return out; }
    for (;;) { const a = take('w', 'a value'); if (peek() === '=') { p++; out.push({ k: a.v, v: take('w', 'a value after =').v }); } else out.push({ k: null, v: a.v }); if (peek() === ',') { p++; continue; } take(close, close); return out; }
  };
  let verb, kv = [], field = null;
  if (peek() === '(') {   // ── a method: the verb app.method ──
    p++; const args = pairs(')');
    verb = vocab.byVerb.get(app + '.' + head.v);
    const methods = vocab.verbs.filter(v => v.verb.indexOf(app + '.') === 0 && v.inputs[0] && v.inputs[0].name === 'building').map(v => v.verb.split('.')[1]);
    if (!verb || methods.indexOf(head.v) < 0) bad('unknown method "' + head.v + '" of ' + app + (methods.length ? ' (methods: ' + methods.join(', ') + ')' : ' (' + app + ' verbs take no model; type the door line)'));
    const rest = verb.inputs.slice(1); let pos = 0; kv.push(['building', model]);
    args.forEach(a => {
      if (a.k === null) { if (pos >= rest.length) bad('too many arguments for ' + verb.verb + ' (it takes: ' + rest.map(i => i.name).join(', ') + ')'); kv.push([rest[pos++].name, a.v]); }
      else { if (!rest.some(i => i.name === a.k)) bad('unknown argument "' + a.k + '" of ' + verb.verb + ' (it takes: ' + rest.map(i => i.name).join(', ') + ')'); kv.push([a.k, a.v]); }
    });
    const dup = kv.map(x => x[0]).filter((k, i, all) => all.indexOf(k) !== i)[0]; if (dup) bad('argument ' + dup + ' given twice');
    const path2 = []; while (peek() === '.') { p++; path2.push(take('w', 'a field name').v); }
    if (path2.length) { field = path2.join('.'); const legal = (verb.returns.fields || []).map(f => f.path).filter(f => f.indexOf('[') < 0); if (legal.indexOf(field) < 0) bad('unknown field "' + field + '" of ' + verb.verb + ' (fields: ' + legal.join(', ') + ')'); }
  } else {   // ── a kind, an optional [filter], then a measure ──
    if (app !== 'viewer') bad('kinds are read from the Viewer\'s model: write viewer(' + model + ').' + head.v + '… (' + app + ' offers methods, e.g. ' + app + '(' + model + ').method(…))');
    const filters = peek() === '[' ? (p++, pairs(']')) : [];
    filters.forEach(f => { if (f.k === null) bad('a filter is column=value, got "' + f.v + '"'); });
    take('.', 'a . and a measure after the kind'); const m = take('w', 'a measure').v, measures = vocab.verbs.filter(v => v.measure === true && v.verb.indexOf('object.') === 0).map(v => v.verb.split('.')[1]);
    if (measures.indexOf(m) < 0) bad('unknown measure "' + m + '" (measures: ' + measures.join(', ') + ')');
    verb = vocab.byVerb.get('object.' + m); kv = [['building', model], ['kind', head.v]].concat(filters.map(f => [f.k, f.v])); field = m;
    if ((verb.returns.fields || []).map(f => f.path).indexOf(field) < 0) bad('the measure ' + m + ' declares no field named ' + m);
  }
  if (p < T.length) bad('unexpected "' + (T[p].v || T[p].t) + '" after the chain (one verb call per chain)');
  if (BREAK() === 'line') kv[0][1] = kv[0][1] + 'X';
  return { verb: verb.verb, line: verb.verb + kv.map(x => ' ' + x[0] + '=' + quote(x[1])).join(''), field };
}
function pick(answer, field) { let n = answer; for (const k of field.split('.')) { if (n == null || typeof n !== 'object' || !(k in n)) return undefined; n = n[k]; } return n; }

async function main(argv) {
  const o = { actor: 'human' }, rest = [];
  for (let i = 0; i < argv.length; i++) { if (argv[i] === '--actor') o.actor = argv[++i]; else if (argv[i] === '--request') o.request = argv[++i]; else if (argv[i] === '--journal') o.journal = argv[++i]; else if (argv[i] === '--compile') o.only = true; else rest.push(argv[i]); }
  if (rest.length !== 1) { say('USAGE node common/door/dotted.js [--compile] [--request ID] [--journal FILE] \'viewer(Duplex).Room.count\''); return 2; }
  if (o.actor !== 'human') { say('REFUSED the dotted form is for people at a terminal; actor ' + o.actor + ' uses the verb list (door lines)'); process.stdout.write(JSON.stringify({ dotted: rest[0], refused: true, reason: 'the dotted form is for people; actor ' + o.actor + ' sends door lines' }) + '\n'); return 3; }
  let c; const door = D.createDoor({ journal: o.journal, say: (s) => process.stderr.write('§DOOR ' + s + '\n') });
  try { c = compile(rest[0], door.vocab); } catch (e) { if (!(e instanceof Bad)) throw e; say('ERROR ' + e.message); process.stdout.write(JSON.stringify({ dotted: rest[0], error: e.message }) + '\n'); return 2; }
  say('line=' + c.line + (c.field ? '   then reads ' + c.field : ''));
  if (o.only) { process.stdout.write(JSON.stringify({ dotted: rest[0], lines: [c.line], field: c.field }) + '\n'); return 0; }
  const env = await door.runLine(c.line, { actor: 'human', request: o.request });
  const value = env.status === 'ok' && c.field ? pick(env.answer, c.field) : null;
  if (env.status === 'ok' && c.field && value === undefined) { say('ERROR the answer of ' + c.verb + ' has no ' + c.field); process.stdout.write(JSON.stringify({ dotted: rest[0], lines: [c.line], envelope: env, field: c.field, error: 'the answer has no ' + c.field }) + '\n'); return 1; }
  say('status=' + env.status + (c.field && env.status === 'ok' ? ' ' + c.field + '=' + JSON.stringify(value) : '') + (env.why ? ' why=' + JSON.stringify(String(env.why).slice(0, 160)) : ''));
  process.stdout.write(JSON.stringify({ dotted: rest[0], lines: [c.line], envelope: env, field: c.field, value: value === undefined ? null : value }) + '\n');
  return env.status === 'ok' ? 0 : (env.status === 'error' ? 1 : 3);
}
if (require.main === module) main(process.argv.slice(2)).then(c => process.exit(c)).catch(e => { say('FAIL ' + (e && e.stack || e)); process.exit(1); });
module.exports = { compile, lex, main, Bad };
