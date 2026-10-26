#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-YELLOW-PAGE (prompts/DXF2BIM_FOUNDATION_LANE.md §D84, architect review R7-5). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: the published yellow-list page said it was generated from modeller/element_defaults.json but was kept by hand: 43 rows against 56 (13 settings a user could not look up).
//   YP1 the page's §B keys = the registry's keys, and each row's value / unit / kind / options = the registry's.
//   YP2 the page's §C rows = the Farming Shed overrides (key and value).
//   YP3 the generator is idempotent (its own output in -> byte-identical out) and keeps every non-table line (kept-line count before = after).
//   YP0 the page was found (absent -> MISSING input, never a PASS).
// Page: `git -C ~/bim-compiler show origin/master:docs/DXF2BIM_Yellow_List.md` (the published source); YELLOW_PAGE=<file> overrides.
// usage: node modeller/tests/witness_dxf_yellow_page.js
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const G = require('../tools/gen_yellow_list.js'), REG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'element_defaults.json'), 'utf8'));
let text = null, src = process.env.YELLOW_PAGE || 'origin/master:docs/DXF2BIM_Yellow_List.md';
if (process.env.YELLOW_PAGE) { if (fs.existsSync(src)) text = fs.readFileSync(src, 'utf8'); }
else { const r = cp.spawnSync('git', ['-C', path.join(process.env.HOME, 'bim-compiler'), 'show', src], { encoding: 'utf8' }); if (r.status === 0) text = r.stdout; }
if (text === null) { console.log('MISSING input: the yellow-list page (' + src + ')'); process.exit(2); }
let fails = 0; const ok = (id, c, m) => { console.log((c ? '§PASS ' : '§FAIL ') + id + '  ' + m); if (!c) fails++; };
const L = text.split('\n'), tableAfter = h => { const i = L.indexOf(h), out = []; if (i < 0) return null; for (let j = i + 2; j < L.length && /^\| /.test(L[j]); j++) out.push(L[j].split(/(?<!\\)\|/).slice(1, -1).map(c => c.trim())); return out; };
const B = tableAfter(G.HB), C = tableAfter(G.HC), D = REG.defaults;
ok('YP0 the page and both tables were found', !!B && !!C && B.length > 0, 'src=' + src + ' rowsB=' + (B ? B.length : 'none') + ' rowsC=' + (C ? C.length : 'none'));
if (B && C) {
  const pk = B.map(r => r[0].replace(/`/g, '')), rk = Object.keys(D), miss = rk.filter(k => pk.indexOf(k) < 0), extra = pk.filter(k => !D[k]);
  const un = s => String(s).replace(/\\\|/g, '|'), nv = v => { const t = String(v).trim(); return t !== '' && isFinite(Number(t)) ? String(Number(t)) : t; }, nl = v => String(v).split(', ').map(nv).join(', ');   // a number is compared as a number (3.0 = 3)
  const wrong = B.filter(r => { const k = r[0].replace(/`/g, ''), d = D[k]; return d && (nv(un(r[3]).replace(/^\*\*|\*\*$/g, '')) !== nv(d.value) || un(r[2]) !== String(d.unit) || un(r[4]) !== String(d.kind) || nl(un(r[6])) !== nl((d.options || []).join(', '))); }).map(r => r[0] + '(' + r[3] + ' vs ' + D[r[0].replace(/`/g, '')].value + ')');
  ok('YP1 the page\'s registry rows = element_defaults.json (keys, value, unit, kind, options)', !miss.length && !extra.length && !wrong.length, 'page=' + pk.length + ' registry=' + rk.length + (miss.length ? ' MISSING ' + miss.join(' ') : '') + (extra.length ? ' EXTRA ' + extra.join(' ') : '') + (wrong.length ? ' WRONG ' + wrong.join(' ') : ''));
  const O = (REG.building_types['Farming Shed'] || {}).overrides || {}, ck = C.map(r => r[0].replace(/`/g, '') + '=' + r[1]).sort(), ok2 = Object.keys(O).map(k => k + '=' + O[k].value).sort();
  ok('YP2 the page\'s Farming Shed rows = its overrides', JSON.stringify(ck) === JSON.stringify(ok2), 'page=' + ck.join(' ') + ' | json=' + ok2.join(' '));
}
const r1 = G.render(text), r2 = G.render(r1.text), nonTable = t => t.split('\n').filter(l => !/^\| `/.test(l)).length;
ok('YP3 the generator is idempotent and keeps every non-table line', r2.text === r1.text && nonTable(r1.text) === nonTable(text), 'idempotent=' + (r2.text === r1.text) + ' non-table lines before=' + nonTable(text) + ' after=' + nonTable(r1.text) + ' rows written=' + r1.rows + ' overrides=' + r1.overrides);
console.log('§W-YELLOW-PAGE ' + (fails ? 'FAIL' : 'PASS')); process.exit(fails ? 1 : 0);
