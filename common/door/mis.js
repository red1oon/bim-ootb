#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — mis.js: the Node driver of the MIS list screen (bim-compiler prompts/CLI_ERP_IVR.md §14). The screen logic is common/door/mis_core.js (pure); this file only
// (1) runs each effect line through the door (journalled, claim-checked: createDoor().runLine), printing "-> <line>" first, (2) feeds the envelope back, (3) draws the screen, (4) reads keys.
// Usage: node common/door/mis.js kind="Business Partner" [name=Standard] [limit=10] [--plain]      keys: one per whitespace-separated token on stdin (Up Down Left Right Tab Enter Esc PageDown, a letter, a digit),
//   or, on a terminal without --plain, the arrow keys / Enter / Esc / Tab / PageDown. Nothing is written until a chip is run; Delete asks y/N first.
'use strict';
const path = require('path'), fs = require('fs');
const Core = require('./mis_core.js'), { createDoor } = require('./door.js'), EC = require('./erp_cli.js');
const KEYS = { Up: 'Up', Down: 'Down', Left: 'Left', Right: 'Right', Tab: 'Tab', Enter: 'Enter', Esc: 'Esc', PageDown: 'PageDown', PageUp: 'PageUp' };
const actionVerbs = () => { const m = {}; Object.keys(EC.ACT).forEach(v => { m[EC.ACT[v]] = 'erp.' + v; }); return m; };   // DocAction code -> the door verb that runs it (erp_cli's own table, not a second one)
function parse(argv) {
  const o = { filters: [], limit: 10, plain: false };
  argv.forEach(a => { if (a === '--plain') o.plain = true; else { const m = /^([A-Za-z_]\w*)=([\s\S]*)$/.exec(a); if (!m) throw new Error('usage: mis.js kind=K [column=value ...] [limit=N] [--plain]; got "' + a + '"'); if (m[1] === 'kind') o.kind = m[2]; else if (m[1] === 'limit') o.limit = Number(m[2]); else o.filters.push({ col: m[1], value: m[2] }); } });
  if (!o.kind) throw new Error('kind= is required');
  return o;
}
async function session(o, nextKey, out, door) {
  let st = Core.create({ kind: o.kind, filters: o.filters, limit: o.limit, actionVerbs: actionVerbs(), brk: process.env.MIS_SCREEN_BREAK || '' }), lines = [];
  const apply = async (input) => {
    let queue = [input];
    while (queue.length) {
      const r = Core.step(st, queue.shift()); st = r.state;
      for (const e of r.effects) { out('-> ' + e.line); lines.push(e.line); const env = await door.runLine(e.line, { actor: 'human' }); queue.push({ result: { purpose: e.purpose, envelope: env } }); }
      if (!queue.length) return r.screen;
    }
  };
  let screen = await apply({ key: '__start' }); out(Core.plain(screen).join('\n'));
  for (;;) {
    if (st.phase === 'quit' || st.phase === 'dead') break;
    const k = await nextKey(); if (k == null) break;
    const inp = typeof k === 'object' ? k : { key: k }; out('key ' + (inp.text != null ? '=' + inp.text : inp.key)); screen = await apply(inp); out(Core.plain(screen).join('\n'));
  }
  return { lines, state: st };
}
async function main(argv) {
  let o; try { o = parse(argv); } catch (e) { console.error('§MIS FAIL ' + e.message); return 2; }
  const door = createDoor({}), toks = [];
  let resolveNext = null, ended = false;
  const feed = (k) => { toks.push(k); if (resolveNext) { const r = resolveNext; resolveNext = null; r(toks.shift()); } };
  const nextKey = () => toks.length ? Promise.resolve(toks.shift()) : ended ? Promise.resolve(null) : new Promise(r => { resolveNext = r; });
  const tty = process.stdin.isTTY && !o.plain;
  if (tty) {
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
    const SEQ = { '\x1b[A': 'Up', '\x1b[B': 'Down', '\x1b[C': 'Right', '\x1b[D': 'Left', '\x1b[6~': 'PageDown', '\x1b[5~': 'PageUp', '\t': 'Tab', '\r': 'Enter', '\x1b': 'Esc', '\x03': 'Esc', '\x7f': 'Backspace', '\b': 'Backspace' };
    process.stdin.on('data', d => { const s = String(d); if (SEQ[s]) feed(SEQ[s]); else for (const ch of s) feed(ch); });
  } else {
    let buf = ''; process.stdin.setEncoding('utf8');   // a line starting with = is TYPED TEXT for the current field; any other line holds key names separated by spaces
    const eat = (line) => { if (line.charAt(0) === '=') feed({ text: line.slice(1) }); else line.split(/\s+/).filter(Boolean).forEach(feed); };
    process.stdin.on('data', d => { buf += d; const parts = buf.split('\n'); buf = parts.pop(); parts.forEach(eat); });
    process.stdin.on('end', () => { if (buf) eat(buf); ended = true; if (resolveNext) { const r = resolveNext; resolveNext = null; r(null); } });
  }
  const out = (s) => process.stdout.write((tty ? s.replace(/^key .*\n?/, '') : s) + '\n');
  const sf = process.env.MIS_SESSION_FILE;   // a terminal draws screens only; the door lines it ran go to MIS_SESSION_FILE (a replayable door script), one per line
  const r = await session(o, nextKey, tty ? (s) => { if (/^-> /.test(s)) { if (sf) fs.appendFileSync(sf, s.slice(3) + '\n'); return; } process.stdout.write('\x1b[2J\x1b[H' + s.replace(/\n/g, '\r\n') + '\r\n'); } : out, door);
  if (tty) process.stdin.setRawMode(false);
  console.error('§MIS session lines=' + r.lines.length + ' phase=' + r.state.phase);
  process.exit(0);
}
module.exports = { session, parse, actionVerbs };
if (require.main === module) main(process.argv.slice(2));
