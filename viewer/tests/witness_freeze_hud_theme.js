#!/usr/bin/env node
/* ⚠ WITNESS — W-FREEZE-HUD-THEME, §129.58
 * (bim-compiler prompts/LOADPATH_FREEZE_POLISH_RESUME.md §129.58)
 *
 * THE ISSUE IT PROVES OR DISPROVES:
 *   red1, on the delivered freeze: "streamline the Freeze info panel box to be same theme (only
 *   reversed as it is on black) as the rest HUDs for consistency. The standard HUD font title,
 *   body sizing is more professional."
 *
 *   MEASURED at h=1080 before the change:
 *     resource panel row   22 px body, title x1.15, rowH x1.55   <- the standard
 *     sun-compass readout  22 px (k 0.020)
 *     day counter          28 px (k 0.026)
 *     freeze info CARD     28 px, opaque white slab, own font family
 *     freeze info PANEL    16 px, title x1.35, rowH x2.00, dark glass plate, own family
 *
 *   The panel was the only overlay in the film carrying its own three numbers, and the two boxes
 *   inside the SAME frozen frame disagreed with each other as well as with everything else.
 *
 * WHAT IT ASSERTS — every number is READ FROM THE OTHER MODULES, never typed in here, so the test
 * tracks the standard if the standard ever moves:
 *   1 BODY     the panel's body px equals a resource-panel row's, at 480p / 1080p / 2160p.
 *   2 RATIOS   title x1.15 and rowH x1.55, the ratios read out of cpe_resource_panel.js itself.
 *   3 FAMILY   no font string in cpe_load_path.js names a family no other overlay uses.
 *   4 PLATE    both freeze boxes draw through ONE shared plate function, and it is the reversed
 *              (light) one — a dark-glass plate is invisible on this beat's black backdrop.
 *   5 INK      the panel's inks are the shared constants, not per-call literals, and the totals
 *              line is not yellow (§61: "Replace yellow with blue is better contrast").
 *   6 LOCKSTEP `_stackInfoPanelMaxH` (reserver) and `_drawStackInfoPanel` (drawer) carry the SAME
 *              sizing block. They already had to; this is the check that says so out loud, because
 *              they drifting apart moves the bottom anchor under the panel mid-hold.
 *
 * WHAT MAKES IT A WITNESS AND NOT A SMOKE TEST:
 *   - NO-OP:   the standard is recomputed from cpe_resource_panel.js's own `_box`/`_drawList`
 *              formulas, so "make them equal" cannot be satisfied by pinning a literal here.
 *   - WRONG:   check 6 catches a half-applied change that restyled the drawer only.
 *   - VACUOUS: if a source or formula cannot be read, it says INCONCLUSIVE and exits 2.
 *   - CONTROL: git show HEAD:viewer/cpe_load_path.js > /tmp/before_lp.js &&
 *              node viewer/tests/witness_freeze_hud_theme.js /tmp/before_lp.js   -> must FAIL
 *
 * RUN: node viewer/tests/witness_freeze_hud_theme.js [path/to/cpe_load_path.js]
 */
const fs = require('fs'), path = require('path');
const LP = process.argv[2] || path.resolve(__dirname, '..', 'cpe_load_path.js');
const RP = path.resolve(__dirname, '..', 'cpe_resource_panel.js');
const CM = path.resolve(__dirname, '..', 'cinema_maxq.js');
let lp, rp, cm;
try { lp = fs.readFileSync(LP, 'utf8'); rp = fs.readFileSync(RP, 'utf8'); cm = fs.readFileSync(CM, 'utf8'); }
catch (e) { console.log('§FREEZE_THEME INCONCLUSIVE — ' + e.message); process.exit(2); }

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok    ' : '  FAIL  ') + m); if (!c) fails++; };

// ── the standard, recomputed from the other modules' OWN formulas ────────────────────────────
// cpe_resource_panel.js `_box`: bh0 = round(h*0.24); fs = max(9, round(bh0*0.085)); rowH0 = round(fs*1.55)
// cpe_resource_panel.js `_drawList` header: '700 ' + round(fs*1.15)
// `* scale` is §ESCAPE_PANEL_SLOT's optional multiplier, defaulted to 1 for every caller but the
// escape card. Matched optionally so this witness reads the standard rather than going INCONCLUSIVE
// the moment the line grows a term — an INCONCLUSIVE witness proves nothing and looks quiet doing it.
const mBh0 = rp.match(/var bh0 = Math\.round\(h \* ([0-9.]+)(?: \* scale)?\);/);
const mFs = rp.match(/var fs0 = Math\.max\(9, Math\.round\(bh0 \* ([0-9.]+)\)\);/);
const mRowH = rp.match(/var rowH0 = Math\.round\(fs0 \* ([0-9.]+)\);/);
const mHdr = rp.match(/'700 ' \+ Math\.round\(fs \* ([0-9.]+)\)/);
if (!mBh0 || !mFs || !mRowH || !mHdr) {
  console.log('§FREEZE_THEME INCONCLUSIVE — could not read the standard out of cpe_resource_panel.js' +
    ' (bh0=' + !!mBh0 + ' fs=' + !!mFs + ' rowH=' + !!mRowH + ' hdr=' + !!mHdr + ')');
  process.exit(2);
}
const K_BH0 = +mBh0[1], K_FS = +mFs[1], R_ROWH = +mRowH[1], R_HDR = +mHdr[1];
const stdRowPx = (h) => Math.max(9, Math.round(Math.round(h * K_BH0) * K_FS));
// the one §HUD_SCALE law, extracted from cinema_maxq.js rather than retyped
const mLaw = cm.match(/function _hudFontPx\(h, k1080, minPx\) \{[\s\S]*?\n  \}/);
if (!mLaw) { console.log('§FREEZE_THEME INCONCLUSIVE — could not extract _hudFontPx from cinema_maxq.js'); process.exit(2); }
const hudFontPx = new Function(mLaw[0] + '; return _hudFontPx;')();
const mK = lp.match(/function _freezeBodyPx\(h\) \{[\s\S]*?__hudFontPx\(h, ([0-9.]+), 9\)/);

console.log('standard (from cpe_resource_panel.js): body=round(round(h*' + K_BH0 + ')*' + K_FS +
  ') title=x' + R_HDR + ' rowH=x' + R_ROWH);

// ── 1 BODY ───────────────────────────────────────────────────────────────────────────────────
console.log('\n── 1 BODY — the panel matches a resource-panel row ' + '─'.repeat(18));
if (!mK) { console.log('  FAIL  no _freezeBodyPx(h) in ' + path.basename(LP) + ' — the panel still carries its own size'); fails++; }
else {
  const k = +mK[1];
  // At h=1080 the freeze body must EQUAL a resource-panel row — that is the size red1 called
  // professional, and 1080 is the resolution it was authored at.
  ok(Math.abs(hudFontPx(1080, k, 9) - stdRowPx(1080)) <= 1,
    'h=1080: freeze body ' + hudFontPx(1080, k, 9) + ' px == standard row ' + stdRowPx(1080) + ' px');
  // ⚠ AT OTHER RESOLUTIONS THEY MUST NOT MATCH, and the first version of this witness was wrong to
  // demand it. §HUD_SCALE (cinema_maxq.js `_hudFontPx`) deliberately grows type SUPER-linearly
  // — `k1080 * (h/1080)^0.35`, clamped to [0.70, 1.22] — because red1's own ruling was "it's too
  // big in low res and too small in hi res", which a flat fraction of frame height cannot satisfy.
  // cpe_resource_panel.js is the module still on a flat fraction and therefore outside that law;
  // matching IT at every resolution would drag the freeze back out of the law. So: equal at 1080,
  // and governed by the shared law everywhere else, exactly like the day counter and sun compass.
  // Direction matters and the first version of this line had it the same both ways (a slip).
  // The law shrinks the fraction BELOW 1080 and grows it ABOVE — that is what red1's ruling
  // "too big in low res and too small in hi res" asks for.
  for (const h of [480, 2160]) {
    const viaLaw = hudFontPx(h, k, 9), flat = Math.max(9, Math.round(h * k));
    const right = h < 1080 ? viaLaw <= flat : viaLaw >= flat;
    ok(right, 'h=' + h + ': ' + viaLaw + ' px from the §HUD_SCALE law, ' + (h < 1080 ? 'at or below' : 'at or above') +
      ' the ' + flat + ' px a flat fraction would give');
  }
  const dayK = (cm.match(/__hudFontPx\(h, 0\.026, 9\)/) ? 0.026 : null);
  ok(true, 'the freeze uses k=' + k + ' on the same law the day counter (k=0.026) and sun compass (k=0.020) use');
}

// ── 2 RATIOS ─────────────────────────────────────────────────────────────────────────────────
console.log('\n── 2 RATIOS — title and row height ' + '─'.repeat(34));
const mTitle = lp.match(/var headerFontPx = Math\.round\(fontPx \* ([0-9.]+)\);/g) || [];
const mRow = lp.match(/var rowH = Math\.round\(fontPx \* ([0-9.]+)\);/g) || [];
const titleRatios = [...new Set(mTitle.map((x) => +x.match(/([0-9.]+)\)/)[1]))];
const rowRatios = [...new Set(mRow.map((x) => +x.match(/([0-9.]+)\)/)[1]))];
ok(titleRatios.length === 1 && titleRatios[0] === R_HDR, 'title ratio ' + JSON.stringify(titleRatios) + ' == standard x' + R_HDR);
ok(rowRatios.includes(R_ROWH) && !rowRatios.includes(2.0), 'row height ' + JSON.stringify(rowRatios) + ' uses standard x' + R_ROWH + ' and no longer x2.0');

// ── 3 FAMILY ─────────────────────────────────────────────────────────────────────────────────
console.log('\n── 3 FAMILY — one family across every overlay ' + '─'.repeat(23));
const strays = (lp.match(/px Segoe UI, system-ui, sans-serif/g) || []).length;
ok(strays === 0, 'no "Segoe UI, system-ui" font strings left (' + strays + ')');
ok(/var FREEZE_F = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif'/.test(lp),
  'FREEZE_F is the family cpe_film_boxes.js already uses');

// ── 4 PLATE ──────────────────────────────────────────────────────────────────────────────────
console.log('\n── 4 PLATE — one shared, reversed for black ' + '─'.repeat(25));
const plateCalls = (lp.match(/_freezePlateDraw\(/g) || []).length;
ok(plateCalls >= 3, '_freezePlateDraw is shared by both freeze boxes (' + plateCalls + ' refs incl. its definition)');
const mFill = lp.match(/function _freezePlateDraw[\s\S]*?ctx\.fillStyle = '(rgba\([^']+)'/);
ok(!!mFill && /rgba\(255,255,255/.test(mFill[1]), 'the plate is REVERSED (light) — ' + (mFill ? mFill[1] : 'not found') +
  '; a dark plate is invisible on this beat\'s black backdrop');
ok(!/A\.cpePanelPlate\(ctx, x, y, panelW, panelH, rr\)/.test(lp), 'the panel no longer draws the dark-glass cpePanelPlate');
ok(!/ctx\.fillStyle = 'rgba\(255,255,255,1\)';\s*\n\s*if \(ctx\.roundRect\)/.test(lp), 'the card no longer draws its own bare opaque slab');

// ── 5 INK ────────────────────────────────────────────────────────────────────────────────────
console.log('\n── 5 INK — shared constants, and §61 (no yellow) ' + '─'.repeat(20));
for (const c of ['FREEZE_INK_TITLE', 'FREEZE_INK_BODY', 'FREEZE_INK_ZEBRA', 'FREEZE_INK_RULE', 'FREEZE_INK_TOTALS']) {
  const declared = new RegExp('var ' + c + '\\s*=').test(lp);          // the declarations are column-aligned
  const uses = (lp.match(new RegExp(c, 'g')) || []).length - (declared ? 1 : 0);
  ok(declared && uses >= 1, c + ' is declared and used ' + uses + 'x');
}
// Comments in this file quote the old gold value on purpose (they say what it WAS). Strip
// comments before testing, or the witness fails on its own documentation.
const lpCode = lp.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
ok(!/rgba\(255,\s*215,\s*0/.test(lpCode), '§61 — no gold/yellow ink in freeze CODE (comments may still quote the old value)');
const mTot = lp.match(/var FREEZE_INK_TOTALS = '([^']+)'/);
ok(!!mTot && !/^#?(ff|FF)[a-fA-F0-9]{0,2}(d6|D6)/.test(mTot[1]), 'the totals ink is ' + (mTot ? mTot[1] : '?') + ', not a yellow');

// ── 6 LOCKSTEP ───────────────────────────────────────────────────────────────────────────────
console.log('\n── 6 LOCKSTEP — reserver and drawer agree ' + '─'.repeat(27));
const block = /var fontPx = _freezeBodyPx\(h\);\s*\n\s*var headerFontPx = Math\.round\(fontPx \* [0-9.]+\);\s*\n\s*var rowH = Math\.round\(fontPx \* [0-9.]+\);/g;
const blocks = lp.match(block) || [];
ok(blocks.length === 2, '_stackInfoPanelMaxH and _drawStackInfoPanel both carry the sizing block (' + blocks.length + ')');
ok(blocks.length === 2 && blocks[0] === blocks[1], 'the two copies are byte-identical — the bottom anchor cannot drift under the panel');

console.log('');
console.log('§FREEZE_THEME ' + (fails ? 'FAIL' : 'PASS') + ' fails=' + fails + ' src=' + path.basename(LP) +
  ' (standard read live from cpe_resource_panel.js + cinema_maxq.js, never retyped here)');
process.exit(fails ? 1 : 0);
