// ⚠ DO NOT REMOVE — Scope guard
// Scope: whitebox §-witness for RESUME_360_KANBAN_PIVOT item 3 — "surface pivot_lens on the ⋯ pill rail"
//   (W-PIVOT-PILL). The Pivot LENS becomes reachable from the ⋯ rail, sibling to kanban/graph, never on the
//   native iDempiere chrome (FUNDAMENTAL LAW). Structural (no browser) — the §-log + these asserts are the proof;
//   a live pill-presence shot is the secondary Playwright leg. Proves, against the shipped source:
//     A — pills_idmp.json registers a 'pivot' pill (icon 'table', a numeric order, name) on the rail.
//     B — the 'table' glyph is NON-INVENT: byte-verbatim in icons.js AND its panels.js source (no drift).
//     C — idempiere.html wires IdmpPillActions.pivot → openPivotFor, which opens pivot_lens.html?db=ad_seed.db
//         as an in-page overlay (the lens stays on-surface) and logs §PIVOT-PILL.
//     D — the lens target pivot_lens.html EXISTS and consumes a ?db= param (a real page, not a dead link).
//     E — the freshness bumps are in place (erp sw, icons.js?v, pills_idmp.json?v, panels.js?v, viewer sw).
//   Each assertion NAMES the issue. §-log first — READ test_pivot_pill.log before concluding.
// Run:  node erp/tests/test_pivot_pill.js          (exit 0 = PASS)
'use strict';
const fs = require('fs'), path = require('path');
const ERP = path.join(__dirname, '..');
const VIEWER = path.join(ERP, '..', 'viewer');
const read = (p) => fs.readFileSync(p, 'utf8');

const log = []; let pass = 0, fail = 0;
const S = (m) => { log.push(m); console.log(m); };
const ok = (cond, label, detail) => { if (cond) pass++; else fail++; S('  ' + (cond ? 'PASS' : 'FAIL') + ' ' + label + (detail ? ' — ' + detail : '')); };

S('§W-PIVOT-PILL — surface the Pivot LENS on the ⋯ pill rail (whitebox structural)');

// A — pills_idmp.json registers the pivot pill
const manifest = JSON.parse(read(path.join(ERP, 'pills_idmp.json')));
const pills = manifest.pills || manifest;                 // tolerate {pills:[...]} or [...]
const pivot = (Array.isArray(pills) ? pills : []).find(p => p.id === 'pivot');
ok(!!pivot, 'A1 — pills_idmp.json has a "pivot" pill', pivot ? 'order=' + pivot.order : 'absent');
ok(pivot && pivot.icon === 'table' && typeof pivot.order === 'number' && !!pivot.name,
   'A2 — pivot pill is icon "table", numeric order, named', pivot ? JSON.stringify({ icon: pivot.icon, order: pivot.order, name: pivot.name }) : '-');

// B — the 'table' glyph is non-invent (icons.js verbatim from panels.js)
const ICONS = require(path.join(ERP, 'icons.js'));
const PANELS = read(path.join(VIEWER, 'panels.js'));
function panelsNamedSvg(name) { const m = PANELS.match(new RegExp('\\b' + name + ':\\s*\\{\\s*svg:\\s*\'([^\']*)\'')); return m ? m[1] : null; }
const wantSvg = panelsNamedSvg('table'), gotSvg = ICONS.table && ICONS.table.svg;
ok(!!gotSvg && !!wantSvg && wantSvg === gotSvg,
   'B — "table" glyph byte-verbatim in icons.js AND its panels.js source (no drift, non-invent)',
   'icons.has=' + !!gotSvg + ' panels.has=' + !!wantSvg + ' identical=' + (wantSvg === gotSvg));

// C — idempiere.html wiring
const idmp = read(path.join(ERP, 'idempiere.html'));
ok(/pivot:\s*openPivotFor/.test(idmp), 'C1 — IdmpPillActions binds pivot → openPivotFor');
ok(/function openPivotFor\s*\(/.test(idmp), 'C2 — openPivotFor is defined');
ok(/pivot_lens\.html\?db=ad_seed\.db/.test(idmp), 'C3 — openPivotFor opens pivot_lens.html?db=ad_seed.db (the live tenant seed)');
ok(/_overlay\(\s*['"]Pivot/.test(idmp) && /§PIVOT-PILL/.test(idmp), 'C4 — in-page overlay (on-surface) + §PIVOT-PILL log');

// D — the lens target exists and is real
const lens = read(path.join(ERP, 'pivot_lens.html'));
ok(/URLSearchParams\(location\.search\)/.test(lens) && /params\.get\(['"]db['"]\)/.test(lens),
   'D — pivot_lens.html exists and consumes a ?db= param (real page, not a dead link)');

// E — freshness bumps in place
const erpSw = read(path.join(ERP, 'sw.js')), viewerSw = read(path.join(VIEWER, 'sw.js'));
const idmpPills = read(path.join(ERP, 'idmp_pills.js')), viewerHtml = read(path.join(VIEWER, 'viewer.html'));
ok(/CACHE_VERSION = 'v739'/.test(erpSw), 'E1 — erp/sw.js bumped to v739 (icons.js/pills/idempiere.html changed)');
ok(/CACHE_VERSION = 'v692'/.test(viewerSw), 'E2 — viewer/sw.js bumped to v692 (panels.js changed)');
ok(/icons\.js\?v=12/.test(idmp) && /idmp_pills\.js\?v=15/.test(idmp), 'E3 — idempiere.html busts icons.js?v=12 + idmp_pills.js?v=15');
ok(/pills_idmp\.json\?v=36/.test(idmpPills), 'E4 — idmp_pills.js busts pills_idmp.json?v=36');
ok(/panels\.js\?v=42/.test(viewerHtml), 'E5 — viewer.html busts panels.js?v=42');

const verdict = `§RESULT W-PIVOT-PILL  ${pass}/${pass + fail}  ${fail ? 'FAIL' : 'PASS'}`;
S(''); S(verdict);
fs.writeFileSync(path.join(__dirname, 'test_pivot_pill.log'), log.join('\n') + '\n');
process.exit(fail ? 1 : 0);
