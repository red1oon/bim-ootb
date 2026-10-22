#!/usr/bin/env node
// ⚠ DO NOT REMOVE — Scope: narration TSVs with {fact} placeholders (first user: prompts/FILM_DXF2BIM_YELLOW_MARKINGS.md). Fills every {key} (or {key.field} for a JSON fact) in the SHORT / DETAIL
// columns from the take's `§FILM_FACT <key> <value>` lines, value verbatim; writes <tsv>.filled.tsv (or the 3rd arg) and prints §FILL key=value per placeholder.
// Exits 1 on a placeholder whose fact is missing from the log, or a {...} left in the output. Read every §FILL line after a run: exit code is not evidence.
// usage: node prompts/film_narration_fill.js <tsv> <take.log> [out.tsv]
'use strict';
const fs = require('fs');
const [tsv, log, outArg] = process.argv.slice(2);
if (!tsv || !log) { console.log('§FILL FAIL usage: <tsv> <take.log> [out.tsv]'); process.exit(1); }
const facts = {};
for (const l of fs.readFileSync(log, 'utf8').split('\n')) { const m = /^§FILM_FACT (\S+) ?(.*)$/.exec(l); if (m) facts[m[1]] = m[2]; }
let miss = 0; const seen = {};
const fill = cell => cell.replace(/\{([A-Za-z0-9_]+)(?:\.([A-Za-z0-9_:]+))?\}/g, (all, k, f) => {
  if (!(k in facts)) { miss++; console.log('§FILL MISSING ' + all); return all; }
  let v = facts[k]; if (f) { try { const o = JSON.parse(v); v = o[f]; } catch (e) { v = undefined; } if (v === undefined) { miss++; console.log('§FILL MISSING ' + all); return all; } v = String(v); }
  if (!seen[all]) { seen[all] = 1; console.log('§FILL ' + all.slice(1, -1) + '=' + v); } return v; });
const rows = fs.readFileSync(tsv, 'utf8').split('\n').filter(l => l.trim()).map(l => l.split('\t'));
const out = rows.map(r => r.map((c, i) => (i >= 3 && i <= 6) ? fill(c) : c).join('\t')).join('\n') + '\n';
const left = (out.split('\n').map(l => l.split('\t').slice(3, 7).join('\t')).join('\n').match(/\{[^}]*\}/g) || []);
const dst = outArg || tsv.replace(/\.tsv$/, '') + '.filled.tsv'; fs.writeFileSync(dst, out);
console.log('§FILL_DONE rows=' + rows.length + ' placeholders=' + Object.keys(seen).length + ' missing=' + miss + ' left=' + left.length + ' out=' + dst);
process.exit(miss || left.length ? 1 : 0);
