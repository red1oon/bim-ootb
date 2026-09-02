// WITNESS — §CPE_PIE_HOLD + §CPE_STATS_TAIL (bim-compiler prompts/CINEMA_PATH_EDITOR.md).
//
// ISSUE IT PROVES/DISPROVES: the composition pie DISAPPEARED for the whole silent tail of a bake
// (after §CPE_BUILDUP_TOPOUT no trade is active, resourcePanelAt correctly returns null, and the
// panel's entire left column vanished while a full-width stat card took the slot). User, 2026-08-30:
// "make the pie part not to disappear but hold when there is silent info."
//
// Does the hold (a) return TODAY's real composition while trades work, (b) hold the REAL composition
// of the last staffed day once they stop — not a re-derivation, not an average, not a decay,
// (c) keep the progress ring LIVE while the wedges hold, (d) REFUSE when nothing has ever been
// staffed rather than fabricating one, and (e) actually draw the pie in BOTH panel modes?
//
// (b) and (d) are the load-bearing ones: a held pie is a claim about a PAST day, so it must be that
// day's real numbers and it must never be invented.
//
// Runs in NODE — the hold is pure arithmetic over an ops array, so no browser is launched. That is
// deliberate: the user's standing warning is that twelve puppeteer Chromes competed with a real bake
// and it had to be aborted. This witness costs a page-load of nothing.
const fs = require('fs'), path = require('path'), vm = require('vm');

// ── a recording 2D context: counts draw calls the way witness_big_stats.js does in the browser
function mkCtx(w, h) {
  // §CPE_PIE_FLYOUT_DROP additions: positions are recorded, not just counts — textXY (where every
  // string landed), imageArgs (arg-count per blit: the pie blit is the only 3-arg drawImage, the
  // glass blur is 5-arg), rects (every roundRect = the plate/clip box), arcs (the slot dots).
  const rec = { fills: 0, strokes: 0, images: 0, texts: [], textXY: [], imageArgs: [], rects: [], arcs: [] };
  const ctx = {
    canvas: { width: w, height: h }, filter: 'none', font: '', fillStyle: '', strokeStyle: '',
    lineWidth: 1, globalAlpha: 1, textAlign: 'left', textBaseline: 'alphabetic', _rec: rec,
    save() {}, restore() {}, translate() {}, clip() {}, beginPath() {}, closePath() {},
    moveTo() {}, lineTo() {}, arc(ax, ay) { rec.arcs.push([ax, ay]); }, arcTo() {}, ellipse() {},
    roundRect(rx, ry, rw, rh, rr) { rec.rects.push([rx, ry, rw, rh, rr]); },
    fill() { rec.fills++; }, stroke() { rec.strokes++; },
    drawImage() { rec.images++; rec.imageArgs.push(arguments.length); },
    fillText(t, tx, ty) { rec.texts.push(String(t)); rec.textXY.push([String(t), tx, ty]); },
    measureText(t) { return { width: String(t).length * 6 }; }
  };
  return ctx;
}
const sandbox = { console, Math, Date, JSON, parseInt, isFinite, Infinity };
sandbox.window = sandbox;
// Offscreen canvases matter here: the pie is rendered into one and BLITTED, so its wedge fills and
// its caption land on the offscreen recorder, never on the panel's own context. A witness that only
// counted fills on the visible context would score a pie that never drew as a pass.
let OFFSCREEN = [];
sandbox.document = { createElement: () => { const c = { width: 0, height: 0 };
  c.getContext = () => { const x = mkCtx(c.width, c.height); OFFSCREEN.push(x); return x; }; return c; } };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'viewer/cpe_resource_panel.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'viewer/rates.js'), 'utf8'), sandbox);

const A = { sun: { position: { x: -0.6, y: 1, z: -0.8 } } };
sandbox.APP = A;
sandbox.setupCpeResourcePanel(A);
if (!sandbox.LABOR_RATES) { console.log('INCONCLUSIVE — rates.js exposed no LABOR_RATES; nothing was judged.'); process.exit(1); }

// ── synthetic programme, shaped like the measured real ones (gap-free build, silent tail after
// topout). Every op carries a trade rates.js knows, so the arithmetic under test is the real one.
const D = 86400000, PS = Date.UTC(2026, 0, 5), DAYS = 60, TOPOUT = 30;
const ops = [];
function add(dayFrom, dayTo, trade, n) {
  for (let k = 0; k < n; k++) ops.push({ s: PS + dayFrom * D + 3600000, e: PS + dayTo * D + 3600000, r: trade });
}
add(0, 9, 'CONCRETE_GANG', 40);
add(4, 14, 'STEEL_ERECTOR', 25);
add(10, 19, 'MASON', 18);
add(15, TOPOUT - 1, 'HVAC_TECH', 12);
add(18, TOPOUT - 1, 'PLUMBER', 9);
// an UNSTAFFED day inside the programme: real ops, no trade on them (this is what an unassigned
// schedule looks like — the panel must hold, not blank)
for (let k = 0; k < 30; k++) ops.push({ s: PS + 12 * D, e: PS + 12 * D + 3600000, r: null });
ops.sort((a, b) => a.s - b.s);
const PE = PS + DAYS * D;
const at = (d) => PS + d * D + 12 * 3600000;

const live = A.resourcePanelHoldAt(at(6), ops, PS, PE);
const rawLive = A.resourcePanelAt(at(6), ops, PS, PE);
const lastStaffed = A.resourcePanelAt(at(TOPOUT - 1), ops, PS, PE);
const rawSilent = A.resourcePanelAt(at(45), ops, PS, PE);
const held = A.resourcePanelHoldAt(at(45), ops, PS, PE);
const before = A.resourcePanelHoldAt(PS - 3 * D, ops, PS, PE);
// mid-programme unstaffed day: build a programme whose day 12 has ONLY resource-less ops
const gapOps = ops.filter(o => !(o.r && o.s <= PS + 12 * D + D && (o.e == null ? o.s : o.e) >= PS + 12 * D));
gapOps.sort((a, b) => a.s - b.s);
const rawGap = A.resourcePanelAt(at(12), gapOps, PS, PE);
const gapHeld = A.resourcePanelHoldAt(at(12), gapOps, PS, PE);

const sig = (info) => info ? info.rows.map(r => r.trade + ':' + r.heads).sort().join(',') : null;

// ── §CPE_STATS_TAIL. ISSUE IT PROVES/DISPROVES: on the user's own Hospital bake the day counter
// pinned at 315/315 from u≈0.45 and the pie showed one static trade (Finisher ×4) for the remaining
// ≈125 s of a 229.8 s film — over HALF the film with nothing new on screen. §CPE_BIG_STATS could
// not reach it: its trigger was "the pie is honestly empty", and Finisher ops run to the last day so
// the pie is never empty. User's ruling: round 1 HOLDS and never intersperses; every highlight
// belongs in the Reveal 2nd round.
const frozenMid = A.resourcePanelFrozenAt(at(20), ops, PS, PE);      // trades still start/end ahead
const frozenTail = A.resourcePanelFrozenAt(at(45), ops, PS, PE);     // past every boundary
// the Hospital shape: staffed to the very last day, so the pie is NEVER empty but IS frozen
// Finisher runs to the LAST day and the cursor parks there, exactly as the bake's buildup remap
// leaves it (MEASURED: Day 315/315 with Finisher ×4 for the last ~125 s of the user's film).
const hOps = ops.filter(o => o.r).concat(
  Array.from({ length: 12 }, () => ({ s: PS + (DAYS - 6) * D, e: PE, r: 'FINISHER' })));
hOps.sort((a, b) => a.s - b.s);
const hLive = A.resourcePanelAt(at(DAYS - 1), hOps, PS, PE);
const hFrozen = A.resourcePanelFrozenAt(at(DAYS - 1), hOps, PS, PE);
const cards = [{ big: '63,182', label: 'elements coordinated', src: 'elements_meta' },
               { big: '8', label: 'levels', src: 'elements_meta.storey' },
               { big: '315', label: 'day programme', src: 'bake _bkState' }];
const seenSlots = new Set(); let rosterSlots = 0, cardSlots = 0, faded = false;
for (let t = 0; t < (cards.length + 1) * 4.5; t += 0.25) {
  const sh = A.tailPanelAt(cards, t, hLive);
  if (!sh) continue;
  seenSlots.add(sh.idx);
  if (sh.roster) rosterSlots++; else cardSlots++;
  if (sh.opacity < 0.99) faded = true;
}
// §CPE_CARD_FIT — the exact card the user's bake truncated, drawn into the narrow column the held
// pie leaves behind. The witness reads back what was actually PRINTED, not what was passed in.
const longCard = { big: '1,771,249', label: 'labour cost committed',
                   sub: '9 trades  ·  time-phased, not a bill of quantities', src: '§HR_COST' };
const rotN = A.tailPanelAt(cards, 0, hLive);
const noCards = A.tailPanelAt(null, 0, hLive);      // cards unbuildable -> roster still revolves

// ── draw: does the pie reach the canvas in BOTH modes?
const W = 1852, H = 960;
const off = () => OFFSCREEN.reduce((a, x) => ({ fills: a.fills + x._rec.fills, strokes: a.strokes + x._rec.strokes,
                                                texts: a.texts.concat(x._rec.texts) }), { fills: 0, strokes: 0, texts: [] });
OFFSCREEN = []; const c1 = mkCtx(W, H);
A.resourcePanelCompositeOntoCanvas(c1, W, H, held, 1, 'tr', 60);
const o1 = off();
const card = { card: { big: '63,182', label: 'elements coordinated', src: 'elements_meta' }, idx: 0, n: 5, opacity: 1 };
OFFSCREEN = []; const c2 = mkCtx(W, H); A.bigStatsCompositeOntoCanvas(c2, W, H, card, 1, 'tr', 60, held);
const o2 = off();
OFFSCREEN = []; const c3 = mkCtx(W, H); A.bigStatsCompositeOntoCanvas(c3, W, H, card, 1, 'tr', 60, null);
const o3 = off();
// the roster slot must draw the LIST (avatars + ×N), not a number
OFFSCREEN = []; const c4 = mkCtx(W, H);
A.bigStatsCompositeOntoCanvas(c4, W, H, A.tailPanelAt(cards, 0, hLive), 1, 'tr', 60, hLive);
const o4 = off();
const rosterTexts = c4._rec.texts.concat(o4.texts);
OFFSCREEN = []; const c5 = mkCtx(W, H);
A.bigStatsCompositeOntoCanvas(c5, W, H, { card: longCard, idx: 3, n: 10, opacity: 1 }, 1, 'tr', 60, hLive);
const cardTexts = c5._rec.texts.concat(off().texts);
const capHeld = o1.texts.concat(o2.texts).concat(c1._rec.texts).concat(c2._rec.texts);

// ── §CPE_PIE_FLYOUT_DROP. ISSUE IT PROVES/DISPROVES: the user's ask, 2026-09-01 — "during last
// fly out, the last pie is not needed. Remove to give max space to the revolving highlights."
// Does the Reveal round (a) draw ZERO pie on every fly-out frame while round 1 keeps it on every
// frame before the boundary, (b) hand the revolving cards AND the roster slot the full plate
// width, un-truncated (§CPE_CARD_FIT re-proven at the new width), (c) keep the plate box itself
// byte-identical so the §CPE_HUD_ORDER stack cannot open a hole where the pie was?
const pieBlits = (c) => c._rec.imageArgs.filter((n) => n === 3).length;   // _pie blit = drawImage(canvas,x,y)

// frame sweep — the predicate is cinema_maxq.js's own `_inReveal` (u >= _revealU), copied verbatim,
// on the Hospital-shaped programme (staffed to the last day, so round 1 always has a LIVE pie).
const nF = 200, revealU = 0.60, fpsW = 15;
const holdI = A.resourcePanelHoldAt(at(DAYS - 1), hOps, PS, PE);
let boundaryFrame = null, prePie = 0, preJudged = 0, revPieFrames = 0, revJudged = 0;
for (let i = 0; i < nF; i++) {
  const inReveal = nF > 1 ? (i / (nF - 1)) >= revealU : false;
  OFFSCREEN = []; const cf = mkCtx(W, H);
  if (!inReveal) {
    if (holdI) A.resourcePanelCompositeOntoCanvas(cf, W, H, holdI, 1, 'tr', 60);
    preJudged++; if (pieBlits(cf) === 1) prePie++;
  } else {
    if (boundaryFrame === null) boundaryFrame = i;
    const si = A.tailPanelAt(cards, i / fpsW, holdI);
    if (si) A.bigStatsCompositeOntoCanvas(cf, W, H, si, 1, 'tr', 60, null);   // the shipped wiring: held=null
    revJudged++; if (pieBlits(cf) > 0) revPieFrames++;
  }
}
const fdVacuous = (preJudged === 0 || revJudged === 0);

// measured column width: the longest label printed WITHOUT an ellipsis, beside the pie vs full
// width. 6 px/char stub -> printed-in-full iff len*6 <= colW, so maxChars*6 brackets the real colW.
function maxFullChars(heldArg) {
  let best = 0;
  for (let n = 10; n <= 60; n++) {
    OFFSCREEN = []; const cx = mkCtx(W, H);
    const probe = { big: '9', label: 'L'.repeat(n), src: 'probe' };
    A.bigStatsCompositeOntoCanvas(cx, W, H, { card: probe, idx: 0, n: 1, opacity: 1 }, 1, 'tr', 60, heldArg);
    if (cx._rec.texts.includes(probe.label)) best = n;
  }
  return best;
}
const charsHeld = maxFullChars(hLive), charsFull = maxFullChars(null);
const bwPx = Math.round(H * 0.36), bhPx = Math.round(H * 0.24);
const colWheld = charsHeld * 6, colWfull = charsFull * 6;                 // lower bounds, 6px quanta

// §CPE_CARD_FIT re-run at the FULL width — the exact card the user's bake truncated, held=null.
OFFSCREEN = []; const c6 = mkCtx(W, H);
A.bigStatsCompositeOntoCanvas(c6, W, H, { card: longCard, idx: 3, n: 10, opacity: 1 }, 1, 'tr', 60, null);
const fullCardTexts = c6._rec.texts.concat(off().texts);

// roster slot at full width — a long trade name that ellipsises beside the pie must print in full
// without it, and the heading + dots must move from the right column (G.lx) to the left pad (G.pad).
const longRoster = { rows: [{ trade: 'HVAC_TECH', label: 'Mechanical Ventilation & Ductwork', heads: 18 }],
                     totalHeads: 18, held: false, progress: 0.9, dayKey: 50 };
OFFSCREEN = []; const c7 = mkCtx(W, H);   // beside the pie (old geometry)
A.bigStatsCompositeOntoCanvas(c7, W, H, { roster: longRoster, idx: 0, n: 10, opacity: 1 }, 1, 'tr', 60, hLive);
OFFSCREEN = []; const c8 = mkCtx(W, H);   // pie-less (the fly-out)
A.bigStatsCompositeOntoCanvas(c8, W, H, { roster: longRoster, idx: 0, n: 10, opacity: 1 }, 1, 'tr', 60, null);
const padPx = Math.round(bhPx * 0.10), lxPx = bwPx - Math.max(Math.round(bwPx * 0.56), 110);
const boxX = W - Math.round(H * 0.028) - bwPx, boxY = Math.round(H * 0.028) + 60;
const headAt = (c, wantX) => c._rec.textXY.some(([t, tx]) => /on site$/.test(t) && tx === wantX);
const dotsAt = (c, wantX) => c._rec.arcs.some(([ax, ay]) => ax === wantX && ay === boxY + bhPx - Math.round(bhPx * 0.13) * 0.7);

// stack closure — every roundRect (plate + clips) across ALL modes is the SAME box rect, so the
// §CPE_HUD_ORDER column keeps exactly the y-extent it had and nothing can gap or overlap.
const rectKey = (r) => r.join(',');
const allRects = [c1, c2, c3, c6, c7, c8].map((c) => [...new Set(c._rec.rects.map(rectKey))]);
const boxRect = [boxX, boxY, bwPx, bhPx, Math.round(bhPx * 0.09)].join(',');
const rectsIdentical = allRects.every((rs) => rs.length === 1 && rs[0] === boxRect);
const inBox = (c) => c._rec.textXY.every(([, tx, ty]) =>
  (tx >= boxX && tx <= boxX + bwPx && ty >= boxY && ty <= boxY + bhPx) ||
  (tx >= 0 && tx <= bwPx && ty >= 0 && ty <= bhPx));   // roster texts are plate-local (translate)
const drawsInBox = inBox(c6) && inBox(c8);

// wiring — the shipped reveal branch itself: held must be null and the entered-log must say so.
const maxqSrc = fs.readFileSync(path.join(__dirname, 'viewer/cinema_maxq.js'), 'utf8');
const revealAt = maxqSrc.indexOf('tailPanelAt(_bigCards');
const revealBlock = maxqSrc.slice(revealAt, maxqSrc.indexOf('_captureFrame(w, h,', revealAt));
const wiringOk = /held:\s*null/.test(revealBlock) && !/held:\s*_holdInfo/.test(revealBlock) &&
                 revealBlock.indexOf('pie=dropped') >= 0;

// NO-OP guard — if the pie-less mode renders identically to the held mode, the change did nothing.
const bigXfull = c6._rec.textXY.find(([t]) => t === longCard.big);
const bigXheld = c5._rec.textXY.find(([t]) => t === longCard.big);
const fdNoop = !(pieBlits(c5) === 1 && pieBlits(c6) === 0 && bigXfull && bigXheld && bigXfull[1] < bigXheld[1]);

console.log('='.repeat(84) + '\n§CPE_PIE_HOLD witness — synthetic programme, ' + DAYS +
  ' days, topout day ' + TOPOUT + ', ' + ops.length + ' ops\n' + '='.repeat(84));
console.log('  live  day 7  : ' + JSON.stringify(sig(live)) + '  heads=' + (live && live.totalHeads) + ' held=' + (live && live.held));
console.log('  last staffed : day ' + (lastStaffed && lastStaffed.dayKey + 1) + '  ' + JSON.stringify(sig(lastStaffed)));
console.log('  silent day 46: raw=' + (rawSilent === null ? 'null' : 'NON-NULL') +
  '  hold=' + JSON.stringify(sig(held)) + '  held=' + (held && held.held) +
  ' heldDay=' + (held && held.heldDayKey + 1) + ' back=' + (held && held.heldDays) + 'd');
console.log('  ring on hold : progress=' + (held && held.progress.toFixed(4)) +
  '  cursor=' + ((at(45) - PS) / (PE - PS)).toFixed(4) +
  '  heldDayProgress=' + (lastStaffed && lastStaffed.progress.toFixed(4)));
console.log('  before start : ' + (before === null ? 'null (refused)' : 'FABRICATED ' + JSON.stringify(sig(before))));
console.log('  mid gap d13  : raw=' + (rawGap === null ? 'null' : 'NON-NULL') + '  hold=' + JSON.stringify(sig(gapHeld)) +
  ' heldDay=' + (gapHeld && gapHeld.heldDayKey + 1));
console.log('  draw: resource panel blits=' + c1._rec.images + ' offscreen wedgeFills=' + o1.fills +
  ' | stats+held blits=' + c2._rec.images + ' cardFills=' + c2._rec.fills +
  ' | stats alone blits=' + c3._rec.images + ' cardFills=' + c3._rec.fills);
console.log('  captions seen: ' + JSON.stringify(capHeld.filter(t => /^day /.test(t))));
console.log('  frozen: mid-programme=' + frozenMid + '  past-every-boundary=' + frozenTail +
  '  |  Hospital shape (staffed to the last day): pieEmpty=' + (hLive === null) + ' frozen=' + hFrozen +
  ' rows=' + JSON.stringify(sig(hLive)));
console.log('  rotation: slots=' + (rotN && rotN.n) + ' (1 roster + ' + cards.length + ' cards)  reached=' +
  seenSlots.size + '  rosterHits=' + rosterSlots + ' cardHits=' + cardSlots + ' fades=' + faded +
  '  noCardsFallback=' + (noCards ? 'roster n=' + noCards.n : 'null'));
console.log('  roster slot draws: ' + JSON.stringify(rosterTexts.filter(t => /on site|×/.test(t))));
console.log('  long card prints:  ' + JSON.stringify(cardTexts));
console.log('  §CPE_PIE_FLYOUT_DROP sweep: frames=' + nF + ' boundary=' + boundaryFrame +
  ' (u>=' + revealU + ')  pieBefore=' + prePie + '/' + preJudged +
  '  pieDuringFlyout=' + revPieFrames + '/' + revJudged + (fdVacuous ? '  VACUOUS' : ''));
console.log('  §CPE_PIE_FLYOUT_DROP width: colW beside pie >= ' + colWheld + 'px (' + charsHeld +
  ' chars) -> full >= ' + colWfull + 'px (' + charsFull + ' chars) of bw=' + bwPx +
  'px  fraction ' + (colWheld / bwPx).toFixed(3) + ' -> ' + (colWfull / bwPx).toFixed(3) +
  '  (derived exact: ' + (bwPx - 2 * Math.round(bhPx * 0.13)) + 'px = ' +
  ((bwPx - 2 * Math.round(bhPx * 0.13)) / bwPx).toFixed(3) + ')');
console.log('  §CPE_PIE_FLYOUT_DROP full-width card prints: ' + JSON.stringify(fullCardTexts));
console.log('  §CPE_PIE_FLYOUT_DROP roster: besidePie name=' +
  JSON.stringify(c7._rec.texts.find(t => /^Mechanical/.test(t) || /…$/.test(t))) +
  ' @lx=' + lxPx + '  pieLess name=' + JSON.stringify(c8._rec.texts.find(t => /^Mechanical/.test(t))) +
  ' @pad=' + padPx);
console.log('  §CPE_PIE_FLYOUT_DROP stack: plate rect ' + boxRect + ' identical across 6 modes=' +
  rectsIdentical + '  drawsInsideBox=' + drawsInBox);
console.log('  §CPE_PIE_FLYOUT_DROP verdict=' + (fdVacuous ? 'VACUOUS'
  : fdNoop ? 'NO-OP' : (revPieFrames === 0 && prePie === preJudged ? 'judged' : 'WRONG')));

const G = [
  ['G-HOLD-1  a staffed day returns the LIVE composition (held=false), identical to resourcePanelAt',
    !!live && live.held === false && sig(live) === sig(rawLive) && live.totalHeads > 0],
  ['G-HOLD-2  a silent day HOLDS the last staffed day\'s REAL rows (not a re-derivation)',
    !!held && held.held === true && sig(held) === sig(lastStaffed) &&
    held.totalHeads === lastStaffed.totalHeads && held.heldDayKey === lastStaffed.dayKey],
  ['G-HOLD-3  the ring stays LIVE on a held frame (cursor progress, not the held day\'s)',
    !!held && Math.abs(held.progress - (at(45) - PS) / (PE - PS)) < 1e-9 &&
    Math.abs(held.progress - lastStaffed.progress) > 0.01],
  ['G-HOLD-4  nothing staffed yet -> null, no fabricated composition', before === null],
  ['G-HOLD-5  an unstaffed day INSIDE the programme holds the PREVIOUS staffed day',
    rawGap === null && !!gapHeld && gapHeld.held === true && gapHeld.heldDayKey < 12 && gapHeld.totalHeads > 0],
  ['G-HOLD-6  resourcePanelAt itself still returns null on a silent day (live contract intact)',
    rawSilent === null],
  ['G-HOLD-7  the pie really DRAWS in both modes — wedges filled, and the stats panel blits one more layer than without it',
    o1.fills > 0 && c1._rec.images > 0 && c2._rec.images > c3._rec.images && c3._rec.fills > 0],
  ['G-HOLD-8  a held pie is captioned with the day it is from (a past day must say so)',
    capHeld.some(t => t === 'day ' + (lastStaffed.dayKey + 1))],
  ['G-HOLD-9  the pie bitmap is cached ACROSS both modes — the second panel re-blits, never re-renders',
    o2.fills === 0 && c2._rec.images > 0],
  ['G-TAIL-1  a cursor with a later op boundary is NOT frozen (round 1 keeps the trade list)',
    frozenMid === false],
  ['G-TAIL-2  staffed to the LAST day -> pie NOT empty yet IS frozen (the Hospital case the cards could not reach)',
    hLive !== null && hLive.totalHeads > 0 && hFrozen === true],
  ['G-TAIL-3  the empty-pie case still reports frozen (§CPE_PIE_HOLD subsumed, not regressed)',
    frozenTail === true],
  ['G-TAIL-4  the rotation reaches every slot, roster included, and fades',
    !!rotN && rotN.n === cards.length + 1 && seenSlots.size === cards.length + 1 &&
    rosterSlots > 0 && cardSlots > 0 && faded === true],
  ['G-TAIL-5  the roster slot draws the trade LIST (avatars + ×N), not a number',
    rosterTexts.some(t => /on site$/.test(t)) && rosterTexts.some(t => /^×\d+$/.test(t))],
  ['G-TAIL-6  no cards buildable -> the roster still revolves rather than the panel going blank',
    !!noCards && noCards.n === 1 && !!noCards.roster],
  // §CPE_CARD_FIT — the real Hospital bake showed "labour cost ..." and "9 trades  ·  time-..."
  // truncating once the pie took its own column. Shrink-before-ellipsis must print the WHOLE label.
  ['G-CARD-1  a long card label is printed IN FULL beside the pie, not ellipsised',
    cardTexts.includes('labour cost committed')],
  ['G-CARD-2  no card text on the panel ends in an ellipsis',
    !cardTexts.some(function (t) { return /…$/.test(t); })],
  ['G-CARD-3  the long sub WRAPS to a second line — the caveat survives, nothing is lost',
    cardTexts.join(' ').indexOf('a bill of quantities') >= 0],
  // §CPE_PIE_FLYOUT_DROP — user 2026-09-01: "during last fly out, the last pie is not needed.
  // Remove to give max space to the revolving highlights."
  ['G-FD-1   the pie is PRESENT on every frame before the boundary (round 1 untouched), not vacuous',
    !fdVacuous && prePie === preJudged && preJudged > 0 && boundaryFrame === Math.ceil(revealU * (nF - 1))],
  ['G-FD-2   the pie is ABSENT on every fly-out frame, roster slots included',
    !fdVacuous && revJudged > 0 && revPieFrames === 0],
  ['G-FD-3   the card column measurably WIDENED to the full plate (>= 0.80·bw, was ~0.49·bw)',
    colWfull >= Math.round(bwPx * 0.80) && colWfull > colWheld && colWheld <= Math.round(bwPx * 0.52)],
  ['G-FD-4   §CPE_CARD_FIT re-proven at the new width: label IN FULL, no ellipsis, sub complete',
    fullCardTexts.includes('labour cost committed') && !fullCardTexts.some(t => /…$/.test(t)) &&
    fullCardTexts.join(' ').indexOf('a bill of quantities') >= 0],
  ['G-FD-5   the roster slot takes the full width: long trade name whole, heading+dots at the left pad',
    c7._rec.texts.some(t => /…$/.test(t)) && c8._rec.texts.includes('Mechanical Ventilation & Ductwork') &&
    headAt(c7, lxPx) && headAt(c8, padPx) && dotsAt(c7, boxX + lxPx) && dotsAt(c8, boxX + padPx)],
  ['G-FD-6   the stack CLOSES UP: one identical plate rect in all modes, every draw inside it',
    rectsIdentical && drawsInBox],
  ['G-FD-7   fullW did NOT leak into round 1: the resource panel still blits the pie and lists at the reserved column',
    pieBlits(c1) === 1 && c1._rec.textXY.some(([t, tx]) => /on site$/.test(t) && tx === lxPx)],
  ['G-FD-8   the shipped reveal branch wires held:null and logs pie=dropped (§ line for the next bake)',
    wiringOk],
  ['G-FD-9   NO-OP guard: pie-less and held modes DIFFER (blits 0 vs 1, colX moved left)',
    !fdNoop]
];
let pass = 0;
G.forEach(([n, v]) => { console.log('  ' + (v ? 'PASS' : 'FAIL') + '  ' + n); if (v) pass++; });
console.log('\n  ' + pass + '/' + G.length + ' — ' + (pass === G.length ? 'PASS' : 'FAIL'));
process.exit(pass === G.length ? 0 : 1);
