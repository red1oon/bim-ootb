#!/usr/bin/env node
// # ⚠ DO NOT REMOVE — proto_method_order.js. SCOPE: bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.58. Read the §PROTO lines; exit code is not evidence.
// ISSUE IT ANSWERS, BEFORE ANY PRODUCT CODE: "if the build-up were ordered the way 4D tools in the industry order it — a declared METHOD (trade steps in
//   sequence) by LOCATION (level by level), elements mapped to a step by what they are — would the crawler's simple truths hold?"
// It takes the elements the product judge judged (true boxes), throws their times away, and orders them by nothing but:
//   1. the frame (foundations and structure) first, from the bottom up — by the height of each element's TOP (what carries has its top under what it carries);
//   2. then, level by level upward, the fit-out steps in this order: walls · roof and decks · glass framing · glazing · windows and doors · stairs and railings ·
//      other envelope · services first fix · ceilings · services second fix · finishes; inside a step, bottom-up again.
// No contact test, no election, no bond. Then the SAME crawler judges that order. usage: proto_method_order.js <tag> <Building ...>
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), CR = require('./lib/schedule_crawler.js');
const [tag, ...blds] = process.argv.slice(2), DIR = path.join(os.homedir(), '.cache', 'bim4d', 'product', tag);
const FIT = ['walls', 'roof and decks', 'glass framing', 'glazing', 'windows and doors', 'stairs and railings', 'other envelope', 'services first fix', 'ceilings', 'services second fix', 'finishes'];
for (const b of blds) {
  const f = path.join(DIR, b + '.items.json'); if (!fs.existsSync(f)) { console.log('§PROTO ' + b + ' INCONCLUSIVE — no ' + f); continue; }
  const { items, parent } = JSON.parse(fs.readFileSync(f, 'utf8'));
  const was = CR.crawl(items, parent).counts;
  // LOCATION = the floor an element stands over (the structural slab nearest under its base), not a storey label: two files of one building name their
  // storeys differently (LTU: "Plan 2" and "VÅN 2"), and a door filed on one label was ordered before its wall filed on the other.
  const CELL = 4, grid = {}, cellsOf = e => { const o = []; for (let i = Math.floor(e.x0 / CELL); i <= Math.floor(e.x1 / CELL); i++) for (let j = Math.floor(e.y0 / CELL); j <= Math.floor(e.y1 / CELL); j++) o.push(i + ',' + j); return o; };
  const floors = items.filter(e => e.cls === 'IfcSlab' && (e.phase === 'Superstructure' || e.phase === 'Substructure'));
  floors.forEach(f => cellsOf(f).forEach(c => (grid[c] = grid[c] || []).push(f)));
  const floorZ = e => { let z = -Infinity; cellsOf(e).forEach(c => (grid[c] || []).forEach(f => { if (f !== e && f.bz < e.bz - 0.05 && f.tz <= e.bz + 0.3 && Math.min(f.x1, e.x1) > Math.max(f.x0, e.x0) && Math.min(f.y1, e.y1) > Math.max(f.y0, e.y0) && f.tz > z) z = f.tz; })); return z === -Infinity ? -1e9 : Math.round(z * 2) / 2; };
  const STEP = t => t === 'glazing' ? FIT.indexOf('glass framing') : (FIT.indexOf(t) < 0 ? FIT.length : FIT.indexOf(t));   // a curtain wall goes up frame and glass together, bottom row first
  // inside a step: from the bottom up by BASE (what something rests on always starts lower than it does)
  const key = e => { const t = CR.trade(e); if (t === 'foundations' || t === 'frame and slabs') return [0, 0, 0, e.bz, e.tz];
    return [1, floorZ(e), STEP(t), e.bz, e.tz]; };
  const ord = items.map(e => ({ e, k: key(e) })).sort((x, y) => { for (let i = 0; i < 5; i++) if (x.k[i] !== y.k[i]) return x.k[i] - y.k[i]; return x.e.guid < y.e.guid ? -1 : 1; });
  const HOUR = 3600000, re = ord.map((o, i) => Object.assign({}, o.e, { s: i * HOUR, e: (i + 1) * HOUR }));
  const now = CR.crawl(re, parent);
  console.log('§PROTO ' + b + ' elements=' + items.length + ' | as the product plays it (' + tag + '): ' + Object.keys(was).map(k => k + '=' + was[k]).join(' ') + ' | ordered by METHOD x LEVEL only: ' + Object.keys(now.counts).map(k => k + '=' + now.counts[k]).join(' '));
  fs.writeFileSync(path.join(DIR, b + '.proto.screenplay.txt'), now.lines.join('\n') + '\n');
}
