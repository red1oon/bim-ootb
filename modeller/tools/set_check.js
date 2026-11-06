#!/usr/bin/env node
// set_check.js <set-folder> [--out report.md] : what a drawing set says about itself (prompts/DXF2BIM_ARCHITECT_REVIEW.md §D112). Each subfolder holding sheets is one group, as the set's own registers are.
'use strict';
const fs = require('fs'), path = require('path'), M = path.join(__dirname, '..'), DxfParser = require(path.join(M, 'lib/dxf-parser.js')), C = require(path.join(M, 'dxf2setcheck.js'));
const args = process.argv.slice(2), oi = args.indexOf('--out'), out = oi >= 0 ? args.splice(oi, 2)[1] : null, root = args[0];
if (!root) { console.log('usage: set_check.js <set-folder> [--out report.md]'); process.exit(2); }
const groups = [];
(function walk(d) { const here = fs.readdirSync(d).map(f => path.join(d, f)), dxf = here.filter(p => /\.dxf$/i.test(p)); if (dxf.length) groups.push({ name: path.relative(root, d) || path.basename(d), sheets: dxf.sort().map(p => ({ name: path.basename(p), role: 'drawing', dxf: new DxfParser().parseSync(fs.readFileSync(p, 'utf8')) })) }); here.filter(p => fs.statSync(p).isDirectory()).sort().forEach(walk); })(root);
const r = C.check(groups), L = [], T = r.totals, plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
L.push('# What this drawing set says about itself', '', 'Read by rule from the sheets themselves. Nothing here is modelled or decided. A difference is a question for the author, not a fault: it may have a reason the sheets do not state.', '');
L.push('## In short', '', `- **${plural(groups.length, 'folder')}, ${plural(T.listed, 'sheet')} listed in the registers, ${T.held} in this package.**`, `- ${T.not_reissued} absent sheets are listed at an older revision: they were not re-issued in this package, which is normal for a revision package.`, `- **${T.current_but_absent} absent sheets are listed at the current revision.** These are the ones to ask about.`, `- ${T.no_statement} absent sheets: the list does not say which revision they are at.`, `- **${plural(T.repeated, 'tag')} printed on two rows with different contents**, out of ${T.keys_judged} checked.`, `- **${T.sums_off} printed sums do not hold**, out of ${T.sums_judged} checked.`, `- ${plural(T.truncated, 'cell')} cut short with "..." in the export itself.`, '');
const asks = []; r.groups.forEach(g => (g.sheets.absent || []).filter(a => a.says === 'current_but_absent').forEach(a => asks.push(`- ${g.name}: **${a.no}** ${a.title || ''} (the list says revision ${a.rev})`)));
if (asks.length) L.push('## Sheets to ask about', '', 'The list says these are at the current revision, and they are not in this package:', '', ...asks, '');
const rep = []; r.groups.forEach(g => g.repeated.forEach(x => { rep.push(`- ${g.name}, ${x.sheet}: **${x.key}** (${x.column}) is printed ${x.rows.length} times:`); x.rows.forEach(s => rep.push(`  - ${s}`)); }));
if (rep.length) L.push('## One tag, two different rows', '', ...rep, '');
const off = []; r.groups.forEach(g => g.sums.forEach(s => s.off.forEach(o => off.push(`- ${g.name}, ${s.sheet}: ${o.row}: ${s.says}: comes to ${o.found}, printed ${o.printed}`))));
if (off.length) L.push('## Printed sums that do not hold', '', ...off, '');
L.push('## Folder by folder', '', '| Folder | Listed | Here | Older revision | Current, absent | List does not say |', '|---|---:|---:|---:|---:|---:|');
r.groups.forEach(g => { const s = g.sheets; L.push(s.status === 'read' ? `| ${g.name} | ${s.listed} | ${s.held} | ${s.not_reissued} | ${s.current_but_absent} | ${s.no_statement} |` : `| ${g.name} | no register read | | | | |`); });
const tr = []; r.groups.forEach(g => { const by = {}; g.truncated.forEach(x => { (by[x.sheet] = by[x.sheet] || []).push(x.text); }); Object.keys(by).forEach(k => tr.push(`- ${g.name}, ${k}: ${by[k].length}, for example "${by[k][0]}"`)); });
if (tr.length) L.push('', '## Cells cut short in the export', '', ...tr);
const j = []; r.groups.forEach(g => g.sums.forEach(s => j.push(`- ${g.name}, ${s.sheet}: ${s.says}: ${s.judged} checked, ${s.off.length} off`)));
if (j.length) L.push('', '## What was checked', '', ...j);
L.push('');
if (out) fs.writeFileSync(out, L.join('\n'));
console.log('§SETCHECK_REPORT ' + (out || '(no --out)') + ' asks=' + asks.length + ' status=' + r.status);
