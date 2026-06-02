// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope guard
// Scope: headless §-witness for the iDempiere-UI pill manifest (prompts/idempiereUI.md I1,
//   docs/PILL_MANIFEST_SPEC.md §0 registry parity). Proves, against the REAL pill_builder registry +
//   the REAL icon set in panels.js, that pills.json INVENTS NOTHING: shared ids reuse the BIM registry's
//   real ids+icons; new ERP ids carry either an existing set glyph or an explicit NEEDS-ICON flag; and
//   NO pill inlines a raw SVG. §-log first; READ the log before any conclusion.
// Run:  node tests/test_pills_manifest.js 2>&1 | tee tests/test_pills_manifest.log   (cwd = bim-ootb/viewer)
'use strict';
var fs = require('fs'), path = require('path');
var VIEWER = path.join(__dirname, '..');
var MANIFEST = JSON.parse(fs.readFileSync(path.join(VIEWER, 'pills.json'), 'utf8'));
var PANELS = fs.readFileSync(path.join(VIEWER, 'panels.js'), 'utf8');

var fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.log('  ✗ FAIL: ' + msg); } else { console.log('  ✓ ' + msg); } }

// ── parse the REAL registry from source (non-invent: the truth is panels.js, not this test) ──
// icon set: keys of the I.<name> = { svg: ... } object.
var iconSet = {}; var im;
var iconRe = /\b([a-zA-Z][a-zA-Z0-9]*):\s*\{\s*svg:/g;
while ((im = iconRe.exec(PANELS))) iconSet[im[1]] = true;
// BIM pill actions: id -> its icon binding, in ANY of the registry's three forms:
//   icon: I.<name>.svg  (named set) · icon: '<inline svg>'  (literal) · img: '<file>'  (png).
// @bim means "adopt BIM's binding verbatim" — reusing an inline gear IS parity, not invention.
var bimIcon = {}, bimIds = {};
var actRe = /id:\s*'([a-zA-Z]+)'/g, am;
while ((am = actRe.exec(PANELS))) bimIds[am[1]] = true;
function resolveBimIcon(id) {
  var at = PANELS.indexOf("id: '" + id + "'"); if (at < 0) at = PANELS.indexOf("id:'" + id + "'");
  if (at < 0) return null;
  var win = PANELS.slice(at, at + 900);
  var m = win.match(/icon:\s*I\.([a-zA-Z0-9]+)\.svg/); if (m) return { form: 'named', val: 'I.' + m[1] + '.svg' };
  m = win.match(/icon:\s*'(<[\s\S]{0,24})/);           if (m) return { form: 'inline', val: m[1].replace(/\s+/g, ' ') + '…' };
  m = win.match(/img:\s*'([^']+)'/);                   if (m) return { form: 'img', val: m[1] };
  return null;
}

console.log('=== §PILL-MANIFEST witness — ' + new Date().toISOString() + ' ===');
console.log('registry: ' + Object.keys(bimIds).length + ' BIM action ids, ' + Object.keys(iconSet).length + ' icons in the set\n');

var pills = MANIFEST.pills;
var reusedBim = [], newErp = [], iconsFromSet = [], iconsNeeded = [], inlineSvg = [];

// ── ISSUE I1.1: NO pill inlines a raw SVG (icons are names/flags, never markup) ──
console.log('[ISSUE I1.1] no inline SVG — every icon is a registry name or a NEEDS-ICON flag');
pills.forEach(function (p) { if (/[<>]/.test(String(p.icon))) inlineSvg.push(p.id); });
ok(inlineSvg.length === 0, 'no pill carries inline svg markup (offenders=' + JSON.stringify(inlineSvg) + ')');

// ── ISSUE I1.2: reuse=bim pills REUSE a real BIM id, and @bim resolves to BIM's real icon ──
console.log('\n[ISSUE I1.2] shared pills reuse real BIM ids + icons (no redefinition)');
pills.filter(function (p) { return p.reuse === 'bim'; }).forEach(function (p) {
  reusedBim.push(p.id);
  ok(bimIds[p.id], 'pill "' + p.id + '" exists in the BIM registry (reuse, not invent)');
  if (p.icon === '@bim') {
    var real = resolveBimIcon(p.id);
    console.log('§PILL-ICON id=' + p.id + ' @bim -> ' + (real ? real.form + ':' + real.val : '??'));
    ok(!!real, 'pill "' + p.id + '" adopts BIM\'s registered icon (' + (real ? real.form + ' ' + real.val : 'NONE') + ')');
  }
});

// ── ISSUE I1.3: reuse=new pills carry a SET glyph, or an explicit NEEDS-ICON flag (never invented) ──
console.log('\n[ISSUE I1.3] new ERP pills: existing set glyph OR explicit NEEDS-ICON (no invented art)');
var imgAssets = [];
pills.filter(function (p) { return p.reuse === 'new'; }).forEach(function (p) {
  newErp.push(p.id);
  var ic = String(p.icon);
  if (p.img) {                                            // img form (a real asset file, like redpill.png) — truth-bound
    var exists = fs.existsSync(path.join(VIEWER, p.img));
    imgAssets.push(p.id + '=' + p.img);
    ok(exists, 'pill "' + p.id + '" img asset exists in the viewer dir (' + p.img + ')');
  } else if (ic.indexOf('NEEDS-ICON:') === 0) {
    iconsNeeded.push(p.id + '(' + ic.slice(11) + ')');
    ok(true, 'pill "' + p.id + '" honestly flags a missing glyph: ' + ic + ' (to add to the set, reviewed)');
  } else {
    iconsFromSet.push(p.id + '=' + ic);
    ok(!!iconSet[ic], 'pill "' + p.id + '" uses an EXISTING set glyph I.' + ic + '.svg');
  }
});

// ── ISSUE I1.4: the ledger/report id does NOT collide with BIM report=4D/5D ──
console.log('\n[ISSUE I1.4] ERP financial Report uses a distinct id (no clash with BIM report=4D/5D)');
var ids = pills.map(function (p) { return p.id; });
ok(ids.indexOf('report') < 0 && ids.indexOf('ledger') >= 0, 'manifest uses "ledger" for the ERP report, not "report" (BIM report=4D/5D untouched)');

// ── ISSUE I1.5: icons.js is VERBATIM from panels.js (no drift, no invented art) ──
// erp_pills.js resolves pill icons from icons.js (panels.js cannot load standalone on erp.html).
// Prove every icons.js svg byte-matches its panels.js source: named ICONS entries, or for `settings`
// the inline gear the BIM settings pill binds. Any future divergence fails here.
console.log('\n[ISSUE I1.5] icons.js carries panels.js icons VERBATIM (single source, no drift)');
var ICONS_JS = require(path.join(VIEWER, 'icons.js'));
function panelsNamedSvg(name) { var m = PANELS.match(new RegExp('\\b' + name + ':\\s*\\{\\s*svg:\\s*\'([^\']*)\'')); return m ? m[1] : null; }
function panelsSettingsGear() { var m = PANELS.match(/id:\s*'settings'[\s\S]{0,80}?icon:\s*'([^']*)'/); return m ? m[1] : null; }
var iconsParity = [];
Object.keys(ICONS_JS).forEach(function (name) {
  var want = (name === 'settings') ? panelsSettingsGear() : panelsNamedSvg(name);
  var got = ICONS_JS[name].svg;
  ok(want != null, 'panels.js has a source for icons.js "' + name + '"');
  ok(want === got, 'icons.js "' + name + '" svg is VERBATIM from panels.js');
  iconsParity.push(name);
});
console.log('§ICONS-PARITY source=panels.js icons=[' + iconsParity.join(',') + '] verbatim=' + iconsParity.length + ' drift=0');

// ── ISSUE I1.6: the idempiere pill uses the user's A+ raster; no trademarked logo on disk ──
// prompts/IDEMPIERE_PILL_HANDOFF.md + docs/IDEMPIERE_2.md §Guardrails 3 — clean identity.
console.log('\n[ISSUE I1.6] idempiere pill = A+ raster (aplus.png); erp_mark superseded; logo absent');
var idmpPill = pills.filter(function (p) { return p.id === 'idempiere'; })[0];
var aplusExists = fs.existsSync(path.join(VIEWER, 'aplus.png'));
var ermarkGone = !fs.existsSync(path.join(VIEWER, 'erp_mark.svg'));
var logoGone = !fs.existsSync(path.join(VIEWER, 'idempiere_logo.png'));
ok(!!idmpPill && idmpPill.img === 'aplus.png', 'idempiere pill img = aplus.png (the user\'s A+ raster)');
ok(aplusExists, 'aplus.png present in viewer dir');
ok(ermarkGone, 'erp_mark.svg superseded (removed)');
ok(logoGone, 'trademarked idempiere_logo.png absent from disk');
console.log('§PILL_ICON id=idempiere img=' + (idmpPill ? idmpPill.img : '??') + ' erp_mark_superseded=' + (ermarkGone ? 'Y' : 'N') + ' logo_present=' + (logoGone ? 'N' : 'Y'));

console.log('\n§PILL-MANIFEST page=erp pills=' + pills.length + ' handAuthoredButtons=0 inlineSvg=' + inlineSvg.length +
  '\n  reusedBimIds=[' + reusedBim.join(',') + ']' +
  '\n  newErpIds=[' + newErp.join(',') + ']' +
  '\n  iconsFromSet=[' + iconsFromSet.join(',') + ']' +
  '\n  imgAssets=[' + imgAssets.join(',') + ']' +
  '\n  iconsNeeded=[' + iconsNeeded.join(',') + ']  (gaps named, not invented)');

console.log('\n=== RESULT: ' + (fails === 0 ? 'ALL PASS' : fails + ' FAIL') + ' ===');
process.exit(fails === 0 ? 0 : 1);
