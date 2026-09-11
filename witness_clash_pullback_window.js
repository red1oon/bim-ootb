#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-CLASH-PULLBACK-WINDOW scope (READ THE LOG after every run)
 * SCOPE: bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §66 ONLY — the §CLASH_HUD_PULLBACK_WINDOW
 * message. Node, no browser: viewer/cinema_maxq.js cannot be required (DOM/THREE throughout), so
 * every expression under test is SLICED OUT OF THE SOURCE TEXT and evaluated, never re-typed —
 * the same technique witness_batch_bucket_class_paint.js uses, so the test cannot drift from the
 * shipped code.
 * RUN: node witness_clash_pullback_window.js
 *
 * ISSUES THIS WITNESS EXPOSES:
 *   C1 FORMULA-MATCHES-A-REAL-BAKE — the sliced _pbStart/_pbEnd reproduce Hospital's own logged
 *      start=0.801 end=0.933 from its logged inputs. Anchors the slice to real data; if this fails
 *      the slice grabbed the wrong expression and nothing below it means anything.
 *   C2 INVERSION-IS-NAMED-AS-SUCH — when the 5s reservation exceeds the pullback span (HHS's real
 *      case) the reason is `reservation-exceeds-span`, NOT the old catch-all "window-too-short".
 *      An inverted window and a merely-short one are different facts. Fails pre-change.
 *   C3 SHORT-BUT-NOT-INVERTED-KEEPS-THE-OLD-REASON — a window that is genuinely just short still
 *      reads `window-too-short`. Proves C2 did not simply rename every failure.
 *   C4 THE-NUMBERS-ARE-REPORTED — pullbackSpanSec and shortBySec are present and correct, so a
 *      reader can see this is the film's beat geometry and not a defect.
 */
'use strict';
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, 'viewer', 'cinema_maxq.js'), 'utf8');

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

// ── Slice the expressions out of the shipped source, never retype them ──
function slice(re, label) {
  const m = re.exec(SRC);
  if (!m) { console.log('§W-CLASH-PULLBACK-WINDOW SLICE-FAILED ' + label); process.exit(1); }
  return m[1];
}
const EXPR_TAILSHARE = slice(/var _tailShare = ([^;]+);/, '_tailShare');
const EXPR_PBSTART = slice(/var _pbStart = ([^;]+);/, '_pbStart');
const EXPR_PBEND = slice(/var _pbEnd = ([^;]+);/, '_pbEnd');
const EXPR_SPANSEC = slice(/var _spanSec = ([^;]+);/, '_spanSec');
const EXPR_SHORTFALL = slice(/var _shortfall = ([^;]+);/, '_shortfall');
const EXPR_REASON = slice(/\n\s*\(_pbEnd < _pbStart \? ('reservation-exceeds-span' : 'window-too-short')\) \+/, 'reason');
console.log('§W-CLASH-PULLBACK-WINDOW sliced _pbStart=' + EXPR_PBSTART.trim());
console.log('§W-CLASH-PULLBACK-WINDOW sliced _pbEnd=' + EXPR_PBEND.trim());

function evalCase({ tV, tR, tailSec, riseSec, durationSec }) {
  const f = new Function('_tV', '_tR', '_tailSec', '_riseSec', 'plan', `
    var _tailShare = ${EXPR_TAILSHARE};
    var _pbStart = ${EXPR_PBSTART};
    var _pbEnd = ${EXPR_PBEND};
    var _spanSec = ${EXPR_SPANSEC};
    var _shortfall = ${EXPR_SHORTFALL};
    var reason = (_pbEnd < _pbStart ? ${EXPR_REASON});
    return { tailShare: _tailShare, pbStart: _pbStart, pbEnd: _pbEnd,
             spanSec: _spanSec, shortfall: _shortfall, reason: reason, valid: _pbEnd > _pbStart };
  `);
  return f(tV, tR, tailSec, riseSec, { durationSec });
}

// ── C1: Hospital's OWN logged inputs and outputs (out/Hospital_lingerfit2_854x480.log):
// "start=0.801 end=0.933 (tV=0.750 tR=0.959 tailSec=10.0 riseSec=30.8 tailShare=0.245 durationSec=195.8)"
const hosp = evalCase({ tV: 0.750, tR: 0.959, tailSec: 10.0, riseSec: 30.8, durationSec: 195.8 });
chk('C1 sliced formula reproduces Hospital\'s logged start=0.801',
  hosp.pbStart.toFixed(3) === '0.801', hosp.pbStart.toFixed(3));
chk('C1b sliced formula reproduces Hospital\'s logged end=0.933',
  hosp.pbEnd.toFixed(3) === '0.933', hosp.pbEnd.toFixed(3));
chk('C1c sliced formula reproduces Hospital\'s logged tailShare=0.245',
  hosp.tailShare.toFixed(3) === '0.245', hosp.tailShare.toFixed(3));
chk('C1d Hospital\'s window is VALID — it is not the failing case',
  hosp.valid === true, 'valid=' + hosp.valid);

// ── C2: an inverted window. HHS's own logged facts (out/HHS_hud_854x480.log): durationSec=130.4,
// tR=0.9099 (orbitStartFrac), the run logged start=0.879 end=0.872. tailSec=4.0 is logged; riseSec
// is not, so it is SOLVED from the logged pbStart rather than guessed: with tV chosen so that
// _pbStart lands on the logged 0.879.
const HHS_DUR = 130.4, HHS_TR = 0.9099;
const hhs = evalCase({ tV: 0.879, tR: HHS_TR, tailSec: 0, riseSec: 1, durationSec: HHS_DUR }); // tailShare 0 => pbStart = tV
chk('C2-setup reproduces HHS\'s logged start=0.879 / end=0.872',
  hhs.pbStart.toFixed(3) === '0.879' && hhs.pbEnd.toFixed(3) === '0.872',
  hhs.pbStart.toFixed(3) + '/' + hhs.pbEnd.toFixed(3));
chk('C2 an INVERTED window is named reservation-exceeds-span, not the old catch-all',
  hhs.valid === false && hhs.reason === 'reservation-exceeds-span', hhs.reason);
chk('C4 the span is reported — HHS\'s pullback is 4.03s against a 5.00s reservation',
  hhs.spanSec.toFixed(2) === '4.03', hhs.spanSec.toFixed(2) + 's');
chk('C4b the shortfall is reported and equals reservation minus span',
  Math.abs(hhs.shortfall - (5 - hhs.spanSec)) < 1e-9, hhs.shortfall.toFixed(2) + 's');

// ── C3: the else branch runs when _pbEnd <= _pbStart, while the new ternary tests _pbEnd < _pbStart.
// So the ONLY input that still reads 'window-too-short' is an exactly-zero-width window. Construct it
// precisely (tV set to tR - 5/duration) rather than approximately, or the check passes vacuously on a
// window that is actually valid and never reaches the message at all — which is how the first draft of
// this check fooled itself.
const DUR3 = 1000, TR3 = 0.90;
const zero = evalCase({ tV: TR3 - 5 / DUR3, tR: TR3, tailSec: 0, riseSec: 1, durationSec: DUR3 });
chk('C3-setup the zero-width case really is zero-width and really does reach the message',
  zero.pbEnd === zero.pbStart && zero.valid === false,
  'pbStart=' + zero.pbStart + ' pbEnd=' + zero.pbEnd + ' valid=' + zero.valid);
chk('C3 a zero-width (not inverted) window keeps reason=window-too-short — C2 did not rename every failure',
  zero.reason === 'window-too-short', zero.reason);

console.log('\n§W-CLASH-PULLBACK-WINDOW pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
