#!/usr/bin/env node
// ⚠ DO NOT REMOVE — §STATUS (prompts/DXF2BIM_ARCHITECT_REVIEW.md §D110 G4). Read the output, exit code is not evidence.
// Issue it exposes: what a stage moved was judged by hand. It prints every class, a class that did not move included, from two scoreboard files (witness_poc_scoreboard.js --json). No clock, path or random value.
// usage: status_diff.js <before.json> <after.json>
'use strict';
const fs = require('fs');
const val = r => (r ? r.built + ' of ' + r.evidence : '-');
function diff(a, b) {
  const L = [], gate = s => (s.ok ? 'ok' : 'refused=' + (s.refused || 0));
  if (gate(a) !== gate(b)) L.push('§STATUS_GATE ' + gate(a) + ' -> ' + gate(b));
  if (!b.ok) { L.push('§STATUS_GATE refused=' + (b.refused || 0) + ' nothing judged at this stage'); L.push('§STATUS_TOTAL moved=INCONCLUSIVE'); return L.join('\n'); }
  if (!a.ok) { b.rows.forEach(r => L.push('§STATUS ' + r.class + ' - -> ' + val(r))); L.push('§STATUS_TOTAL moved=INCONCLUSIVE'); return L.join('\n'); }
  const names = a.rows.map(r => r.class).concat(b.rows.map(r => r.class).filter(n => !a.rows.some(r => r.class === n)));
  let moved = 0;
  names.forEach(n => { const p = a.rows.find(r => r.class === n), q = b.rows.find(r => r.class === n); if (val(p) !== val(q)) moved++; L.push('§STATUS ' + n + ' ' + val(p) + ' -> ' + val(q)); });
  L.push('§STATUS_TOTAL moved=' + moved);
  return L.join('\n');
}
if (require.main === module) {
  const [x, y] = process.argv.slice(2); if (!x || !y) { console.log('§STATUS FAIL usage: status_diff.js <before.json> <after.json>'); process.exit(1); }
  console.log(diff(JSON.parse(fs.readFileSync(x, 'utf8')), JSON.parse(fs.readFileSync(y, 'utf8'))));
}
module.exports = { diff };
