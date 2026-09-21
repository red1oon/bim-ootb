#!/usr/bin/env node
/**
 * WITNESS — storey_card_ink: §STOREY_CARD_INK.
 * Spec: bim-compiler prompts/LOADPATH_FREEZE_POLISH_RESUME.md §132.1.
 *
 * THE ISSUE IT PROVES OR DISPROVES, in red1's own words (2026-09-21):
 *   "make the storey by storey reveal HUD box same coloring to fall on the 'Level 1' rather, or swap
 *    places with number of rooms, which is not the highlight but the storey value."
 * The claim: the string the storey-reveal card draws IN THE STOREY'S TINT COLOUR is the storey value
 * — never a count — the colour is the SAME one the building is tinted with in that slot, and the card
 * still fits inside its own plate at 1920x1080, 1280x720 and 854x480.
 *
 * ⚠ WHY IT IS BUILT THIS WAY — §132's lesson 1 ("a green witness can mean unchanged pixels"). The
 * card's colour is not a property of the card, it is a property of what the COMPOSITOR does with it:
 * `c.ink` sets the fill for exactly one string, `c.big`, and only in the plain-card branch (a card
 * with no `legend`). A witness that asserted `card.big === vis.storey` and stopped would go green on
 * a build where the compositor had changed branch and the screen showed something else. So this runs
 * the REAL `A.bigStatsCompositeOntoCanvas` against a recording 2D context that keeps the fillStyle in
 * force at each `fillText`, and asserts on what the compositor itself drew.
 *
 * WHY THIS IS NOT PIXEL EVIDENCE. Nothing here reads a frame. The width model is the same estimate
 * `witness_escape_card_fit.js` uses (len * fontPx * 0.56) — sized to catch a string that overruns its
 * plate by tens of px, not a kerning difference.
 *
 * THE DATA IS REAL, NOT A FIXTURE. Storey names, door counts, slab footprints and room counts are
 * read from the shipped fleet DBs through the module's own `A.dbQuery`/`A.dbQueryFirst` seam, so the
 * strings tested are the strings the film draws. `walk` is null here (no StoreyRaster in Node), which
 * only omits the card's walkable clause — `witness_storey_walkable_card.js` owns that clause.
 *
 * RUN: node viewer/tests/witness_storey_card_ink.js
 */
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const { Witness } = require(path.join(ROOT, 'witness_kit', 'contract.js'));

// The plan window, taken from a REAL run's own §STOREY_REVEAL_WINDOW line
// (out/Terminal_loadpath_r7.log:647) rather than chosen: windowFrac=0.3127, rise=0.9063, 84.0s.
const PLAN = { durationSec: 84.0, beats: { rise: 0.9063 }, storeyReveal: { on: true, windowFrac: 0.3127 } };
const SIZES = [[1920, 1080], [1280, 720], [854, 480]];
const DBS = ['LTU_AHouse_silent', 'HHS_Office_Federated_silent', 'Hospital_silent', 'Terminal_silent'];

// ── the DB seam. The module only ever asks for dbQuery/dbQueryFirst, so the shipped sqlite3 CLI is
// enough and nothing is mocked above it. `?` is substituted with a quoted literal: every value
// passed here originates in the DB itself, and this is a read-only local harness.
function sqlFor(dbPath) {
  const lit = (v) => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");
  return function (sql, params) {
    let i = 0;
    const bound = sql.replace(/\?/g, () => lit(params && params[i++]));
    const raw = execFileSync('sqlite3', ['-json', '-readonly', dbPath, bound], { encoding: 'utf8', maxBuffer: 64 << 20 }).trim();
    if (!raw) return [];
    return JSON.parse(raw).map((o) => Object.keys(o).map((k) => o[k]));   // -json gives objects; the module reads r[0], r[1]…
  };
}
function loadReveal(dbPath) {
  const A = {};
  const q = sqlFor(dbPath);
  A.dbQuery = q;
  A.dbQueryFirst = (sql, params) => { const r = q(sql, params); return r.length ? r[0] : null; };
  A.activeBuilding = path.basename(dbPath, '.db');
  const src = fs.readFileSync(path.join(ROOT, 'viewer', 'cpe_storey_reveal.js'), 'utf8');
  eval(src + '\nsetupCpeStoreyReveal(A);');
  return A;
}
function loadPanel() {
  const A = {};
  const src = fs.readFileSync(path.join(ROOT, 'viewer', 'cpe_resource_panel.js'), 'utf8');
  eval(src + '\nsetupCpeResourcePanel(A);');
  return A;
}
// ── the recording context. Same shape as witness_escape_card_fit.js's, plus the one thing this
// witness turns on: the fillStyle IN FORCE when each string was drawn. That is the whole claim.
function recorder() {
  const R = { texts: [], font: '10px x', textAlign: 'left', textBaseline: 'alphabetic',
              fillStyle: '#000', strokeStyle: '#000', globalAlpha: 1, lineWidth: 1 };
  const px = () => { const m = /(\d+(?:\.\d+)?)px/.exec(R.font); return m ? +m[1] : 10; };
  R.measureText = (s) => ({ width: String(s).length * px() * 0.56 });
  R.fillText = (s, x, y) => {
    const w = R.measureText(s).width;
    R.texts.push({ s: String(s), x, y, w, fill: String(R.fillStyle), align: R.textAlign,
                   left: R.textAlign === 'right' ? x - w : x,
                   right: R.textAlign === 'right' ? x : x + w, px: px() });
  };
  ['save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'stroke', 'fill', 'fillRect', 'clip',
   'arc', 'rect', 'roundRect', 'translate', 'scale', 'setLineDash', 'strokeText', 'quadraticCurveTo',
   'bezierCurveTo', 'ellipse', 'strokeRect', 'clearRect', 'rotate'].forEach((k) => { R[k] = () => {}; });
  R.createLinearGradient = () => ({ addColorStop: () => {} });
  R.createRadialGradient = () => ({ addColorStop: () => {} });
  return R;
}

const PANEL = loadPanel();
const rows = [];
const skipped = [];
DBS.forEach((name) => {
  const dbPath = path.join(ROOT, 'buildings', name + '.db');
  if (!fs.existsSync(dbPath)) { skipped.push(name + ' (no such DB)'); return; }
  let A;
  try { A = loadReveal(dbPath); } catch (e) { skipped.push(name + ' (' + e.message + ')'); return; }
  // Walk the window and take ONE sample per slot — the slot's own midpoint, so the sample is inside
  // the lit phase rather than on a boundary frame.
  const winStart = PLAN.beats.rise - PLAN.storeyReveal.windowFrac;
  const seen = {};
  for (let k = 0; k <= 600; k++) {
    const tN = winStart + (PLAN.storeyReveal.windowFrac * (k + 0.5)) / 601;
    let vis = null, card = null;
    try { vis = A.storeyRevealVisualAt(PLAN, tN); } catch (e) { continue; }
    if (!vis || seen[vis.idx]) continue;
    try { card = A.storeyRevealStatCardAt(PLAN, tN); } catch (e) { continue; }
    if (!card || !card.card) continue;
    seen[vis.idx] = true;
    const inkHex = '#' + vis.color.toString(16).padStart(6, '0');
    SIZES.forEach(([w, h]) => {
      const ctx = recorder();
      let box = null;
      PANEL._hudLayoutRegister = (n, x, y, ww, hh) => { if (n === 'stats-panel') box = { x, y, w: ww, h: hh }; };
      // Drawn exactly as cinema_maxq.js:4332 hands it over: shown = the whole {card,idx,n,opacity}
      // record, alpha 1, the bottom-right slot §STOREY_INFO_NOT_IN_HUB put it in, stackY 0, no pie.
      PANEL.bigStatsCompositeOntoCanvas(ctx, w, h, card, 1, 'br', 0, null);
      if (!box) { rows.push({ db: name, size: w + 'x' + h, idx: vis.idx, storey: vis.storey, big: card.card.big,
                              label: card.card.label, ink: card.card.ink, visInk: inkHex, inkTexts: [],
                              bigPx: 0, plateW: 0, overflow: 9999, drawn: 0 }); return; }
      const L = box.x, Rr = box.x + box.w, T = box.y, B = box.y + box.h;
      const drawn = ctx.texts;
      // The tint colour is written as '#rrggbb' by the card; the compositor passes it through
      // untouched, so an exact match is the right test — a near-match would be a different colour.
      const inked = drawn.filter((t) => t.fill.toLowerCase() === inkHex.toLowerCase());
      let over = 0;
      drawn.forEach((t) => {
        over = Math.max(over, t.right - Rr, L - t.left, (t.y + t.px * 0.22) - B, T - (t.y - t.px * 0.78));
      });
      rows.push({ db: name, size: w + 'x' + h, idx: vis.idx, storey: vis.storey, big: card.card.big,
                  label: card.card.label, ink: card.card.ink, visInk: inkHex,
                  inkTexts: inked.map((t) => t.s), bigPx: inked.length ? inked[0].px : 0,
                  plateW: box.w, overflow: +Math.max(0, over).toFixed(1), drawn: drawn.length });
    });
  }
});

if (skipped.length) console.log('§STOREY_CARD_INK skipped=' + skipped.join(' | '));
rows.filter((r) => r.size === '854x480').forEach((r) => console.log(
  '§STOREY_CARD_INK db=' + r.db + ' slot=' + r.idx + ' storey="' + r.storey + '" big="' + r.big +
  '" label="' + r.label + '" ink=' + r.ink + ' inked=[' + r.inkTexts.join(' | ') + '] bigPx=' + r.bigPx +
  ' plateW=' + r.plateW + ' overflow=' + r.overflow + 'px @854x480'));

if (!rows.length) { console.log('§WITNESS_STOREY_CARD_INK INCONCLUSIVE — no card was produced on any fleet DB; nothing was judged'); process.exit(1); }

const isCount = (s) => /^[\d.,]+(\s*×\s*[\d.,]+)?$/.test(String(s).trim());

Witness('storey_card_ink')
  .population(() => rows)
  .schema({ type: 'object', required: ['db', 'size', 'storey', 'big', 'ink', 'visInk', 'inkTexts', 'overflow'],
            properties: { db: { type: 'string' }, size: { type: 'string' }, idx: { type: 'integer' },
                          storey: { type: 'string' }, big: { type: 'string' }, label: { type: 'string' },
                          ink: { type: 'string', pattern: '^#[0-9a-f]{6}$' }, visInk: { type: 'string' },
                          inkTexts: { type: 'array', items: { type: 'string' } },
                          bigPx: { type: 'number' }, plateW: { type: 'number' },
                          overflow: { type: 'number' }, drawn: { type: 'integer' } } })
  // THE CLAIM. Exactly one string is drawn in the tint colour, and it is the storey value.
  .invariant('the one string drawn in the tint colour IS the storey value, never a count',
    (rs) => rs.every((r) => r.inkTexts.length === 1 && r.inkTexts[0] === r.big && !isCount(r.inkTexts[0])))
  // The card cannot disagree with the building: the ink is the colour the visual record carried.
  .invariant('the card\'s ink is the SAME colour _applyTint was handed for that slot',
    (rs) => rs.every((r) => r.ink === r.visInk))
  // The count is not lost — it is demoted, and it is still on the card in plain ink.
  .invariant('the count it displaced is still drawn, in plain ink, on the label',
    (rs) => rs.every((r) => /\d/.test(r.label) && r.inkTexts.indexOf(r.label) < 0))
  .invariant('every string the card draws stays inside its own plate, at all three sizes',
    (rs) => rs.every((r) => r.overflow === 0))
  // The big slot shrinks in 2px steps and STOPS at 14px without ellipsis, so a name that needed
  // less than the floor would silently overrun. Proven above by overflow=0; stated here as its own
  // line so a future longer storey name fails on the reason, not on a symptom.
  .invariant('the storey text never has to fall below the 14px floor the big slot stops at',
    (rs) => rs.every((r) => r.bigPx >= 14))
  // RED CONTROL — the card as it was BEFORE this change: the door count in the emphatic slot.
  // If this population passes, the witness is not testing what it claims to test.
  .redControl((rs) => rs.map((r) => Object.assign({}, r, { big: '247', inkTexts: ['247'] })))
  .run();
