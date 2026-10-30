#!/usr/bin/env node
// ⚠ DO NOT REMOVE — rewrites the tables of docs/DXF2BIM_Yellow_List.md (BIMCompiler) from modeller/element_defaults.json (prompts/DXF2BIM_FOUNDATION_LANE.md §D84). Read its § line after every run.
// Only the table ROWS under the §B header (the registry) and the §C header (the Farming Shed overrides) are written; every other line of the page is kept byte for byte.
// usage: node modeller/tools/gen_yellow_list.js <page.md>        (in place)   ·   require(): { render(text) -> { text, rows, overrides, kept } }
'use strict';
const fs = require('fs'), path = require('path');
const REG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'element_defaults.json'), 'utf8'));
const HB = '| Setting | Element | Unit | Default | Kind | Basis | Offered choices |', HC = '| Setting | Value | Basis |', SHED = 'Farming Shed';
const esc = t => String(t).replace(/\|/g, '\\|');
function rowsB() {
  const D = REG.defaults, keys = Object.keys(D).sort((a, b) => { const ea = D[a].element === 'Building' ? '' : D[a].element, eb = D[b].element === 'Building' ? '' : D[b].element; return ea < eb ? -1 : ea > eb ? 1 : a < b ? -1 : a > b ? 1 : 0; });
  return keys.map(k => { const r = D[k]; return '| `' + k + '` | ' + esc(r.element) + ' | ' + esc(r.unit) + ' | ' + (r.value === '' ? '*(empty)*' : '**' + esc(r.value) + '**') + ' | ' + esc(r.kind) + ' | ' + esc(r.basis) + ' | ' + (r.options || []).map(esc).join(', ') + ' |'; });
}
function rowsC() { const O = (REG.building_types[SHED] || {}).overrides || {}; return Object.keys(O).sort().map(k => '| `' + k + '` | ' + esc(O[k].value) + ' | ' + esc(O[k].basis) + ' |'); }
// replace the rows that follow `header` + its |---| line, up to the first line that is not a table row
function swap(L, header, rows) {
  const i = L.indexOf(header); if (i < 0 || !/^\|[-| ]+\|$/.test(L[i + 1] || '')) throw new Error('table header not found: ' + header);
  let j = i + 2; while (j < L.length && /^\| /.test(L[j])) j++;
  return { L: L.slice(0, i + 2).concat(rows, L.slice(j)), removed: j - i - 2 };
}
function render(text) {
  const L0 = text.split('\n'), b = swap(L0, HB, rowsB()), c = swap(b.L, HC, rowsC());
  return { text: c.L.join('\n'), rows: rowsB().length, overrides: rowsC().length, kept: L0.length - b.removed - c.removed };
}
if (require.main === module) {
  const p = process.argv[2]; if (!p) { console.log('§YELLOW_PAGE FAIL usage: gen_yellow_list.js <page.md>'); process.exit(1); }
  const r = render(fs.readFileSync(p, 'utf8')); fs.writeFileSync(p, r.text);
  console.log('§YELLOW_PAGE wrote ' + p + ' rows=' + r.rows + ' overrides=' + r.overrides + ' kept_lines=' + r.kept);
}
module.exports = { render, rowsB, rowsC, HB, HC };
