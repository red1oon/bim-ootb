#!/usr/bin/env node
/**
 * W-GM-SURFACE — §P1 (prompts/RESUME_MODELLER_POLISH_BATCH.md): the geomap seed audit is SURFACED in the
 * STR-Walker Outliner tab, not console-only.
 *
 * Issue under test: ArcEditable.buildSeedOps computes {checked,flagged,noBand,inBandRate} and
 * str_walker_outliner stashes it on window.__gmSeedAudit[key] — but tabRows() never rendered it, so the
 * user could never see the confidence the pipeline already earned. This proves tabRows() now emits the
 * summary + top-flag rows from the REAL stashed values, and emits NOTHING when the audit is absent
 * (byte-identical fallback — no invented rows).
 *
 * Checks:
 *   G1 absent-audit    — no __gmSeedAudit for the open key ⇒ NO sw-gm* rows (regression pin)
 *   G2 summary         — audit present ⇒ ONE sw-gm row carrying inBandRate% + flagged + noBand counts
 *   G3 flags           — top flagged rows rendered (id sw-gmf<i>), |z| DESC, capped at 6
 *   G4 values          — flag row carries the REAL z + ifc_class + guid prefix + why (extract, not invent)
 *   G5 clean           — zero flags ⇒ summary row says ✓ all-in-band, no sw-gmf rows
 */
'use strict';

global.window = global.window || {};
window.Bonsai = { outliner: null };
// tabRows() gates on swbTabData() — stub a minimal walked-building tab (values irrelevant to §P1 rows).
window.swbTabData = function () {
  return { grid: '2×3', columns: 4, girders: 5, signals: { RED: 0, ORANGE: 1, GREEN: 4 } };
};

var path = require('path');
require(path.join(__dirname, '..', 'str_walker_outliner.js'));   // → window.STRWalkerOutliner

var pass = 0, fail = 0;
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  ' + extra : '')); }
}
function rows() { return window.STRWalkerOutliner._category().tree(); }
function gmRows(rs) { return rs.filter(function (r) { return /^sw-gm/.test(r.id); }); }

console.log('═══ W-GM-SURFACE — §P1 geomap audit surfaced in the STR-Walker tab (node) ═══');

// G1 — absent audit ⇒ no gm rows at all
window.__dwName = 'Duplex';
window.__gmSeedAudit = {};
var r1 = gmRows(rows());
chk('G1 absent-audit → zero sw-gm rows', r1.length === 0, 'rows=' + r1.length);

// G2/G3/G4 — real-shaped audit (values mirror a genuine buildSeedOps geomap block)
window.__gmSeedAudit.Duplex = {
  checked: 120, noBand: 14, inBandRate: 0.942,
  flagged: [
    { guid: '2O2Fr$t4X7Zf8NOew3FLKQ', ifc_class: 'IfcWallStandardCase', z: 2.7, why: 'height outside band' },
    { guid: '1kTvXnbbzCWw8lcMd1dR4o', ifc_class: 'IfcDoor', z: -4.1, why: 'width outside band' },
    { guid: '0jf0XnbbzCWw8lcMd1dR9q', ifc_class: 'IfcWindow', z: 3.3, why: 'depth outside band' },
    { guid: '3aa0XnbbzCWw8lcMd1dAAa', ifc_class: 'IfcSlab', z: 2.1, why: 'thickness outside band' },
    { guid: '4bb0XnbbzCWw8lcMd1dBBb', ifc_class: 'IfcColumn', z: -2.2, why: 'section outside band' },
    { guid: '5cc0XnbbzCWw8lcMd1dCCc', ifc_class: 'IfcBeam', z: 2.4, why: 'span outside band' },
    { guid: '6dd0XnbbzCWw8lcMd1dDDd', ifc_class: 'IfcWall', z: 5.9, why: 'length outside band' }
  ]
};
var r2 = rows(), gm2 = gmRows(r2);
var sum = gm2.find(function (r) { return r.id === 'sw-gm'; });
var flags = gm2.filter(function (r) { return /^sw-gmf/.test(r.id); });
chk('G2 summary row present', !!sum, sum && (sum.label + ' | ' + sum.sub));
chk('G2 summary carries 94% + 7 flagged + 14 no-band', !!sum &&
  sum.label.indexOf('94% in-band') >= 0 && sum.sub.indexOf('7 outside') >= 0 && sum.sub.indexOf('14 no-band') >= 0);
chk('G3 flags capped at 6 of 7', flags.length === 6, 'n=' + flags.length);
var zs = flags.map(function (f) { return parseFloat(f.label.replace(/^⚠ z=/, '')); });
var absDesc = zs.every(function (z, i) { return i === 0 || Math.abs(zs[i - 1]) >= Math.abs(z); });
chk('G3 ordered |z| desc, worst first', absDesc && Math.abs(zs[0]) === 5.9, 'zs=' + zs.join(','));
var top = flags[0];
chk('G4 flag row = REAL z + class + guid prefix + why', !!top &&
  top.label.indexOf('z=5.9') >= 0 && top.label.indexOf('Wall') >= 0 &&
  top.label.indexOf('6dd0Xnbbzc'.slice(0, 6)) >= 0 && top.sub === 'length outside band',
  top && (top.label + ' | ' + top.sub));

// G5 — clean audit (no flags) ⇒ ✓ summary, no flag rows
window.__gmSeedAudit.Duplex = { checked: 80, noBand: 3, inBandRate: 1, flagged: [] };
var gm3 = gmRows(rows());
chk('G5 clean → ✓ summary only', gm3.length === 1 && gm3[0].id === 'sw-gm' &&
  gm3[0].sub.indexOf('✓ all 80') >= 0, gm3[0] && gm3[0].sub);

console.log('W-GM-SURFACE ' + (fail ? 'FAIL' : 'PASS') + '  pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
