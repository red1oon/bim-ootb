#!/usr/bin/env node
/**
 * §OVERLAY_LIFETIME — DOES AN OVERLAY EVER STOP, AND IS IT DRAWN ONCE?
 *
 * THE TWO DEFECTS THIS EXISTS FOR, both found by red1's eye on a delivered clip and neither
 * catchable by any witness that existed at the time:
 *
 *  1. TWO CAPTIONS. cinema_maxq.js drew the centred lower-third caption plate AND the status box
 *     that §38.1b says replaces it. The duplicate call sat OUTSIDE _drawUnlessHold, so it
 *     registered no rect — which is exactly why §HUD_LAYOUT reported overlaps=0 with two captions
 *     on screen. A layout witness cannot see a box that never declares itself.
 *
 *  2. A BOX THAT NEVER LEAVES. cpe_slab_beat.js re-posted its Measure label every frame while
 *     `_labelOn`, and §26.2's "until the crossing leaves frame" never fired on a film whose
 *     crossing stays in frame. cpe_film_boxes.js's 2.2 s LINGER can only expire a box when NOTHING
 *     posts, so a box that re-posts forever can never expire. MEASURED on clip_1127.log across 846
 *     frames: one §SLAB_BEAT_LABEL on, zero off, zero "§MEASURE_BOX rows=0 idle", zero
 *     §MEASURE_BOX_LINGER. §MEASURE_BOX only logs on a content CHANGE, so a box stuck for 800
 *     frames prints three lines and looks quiet.
 *
 * Both are STRUCTURAL properties of the draw chain, so they are read out of the source rather than
 * out of a frame — this project's own rule, and the only way to catch them before a 20-minute bake.
 *
 * RUN: node viewer/tests/witness_film_overlay_lifetime.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const mq = fs.readFileSync(path.join(ROOT, 'viewer/cinema_maxq.js'), 'utf8');
const slab = fs.readFileSync(path.join(ROOT, 'viewer/cpe_slab_beat.js'), 'utf8');

let pass = 0, fail = 0;
const ck = (n, c, x) => { (c ? pass++ : fail++); console.log('  §OVL ' + (c ? 'ok    ' : 'WRONG ') + n + (x ? '   ' + x : '')); };

// ── 1. ONE CAPTION, AND IT DECLARES ITSELF ───────────────────────────────────────────────────
const titleCalls = (mq.match(/A\.roomTitleCompositeOntoCanvas\(/g) || []).length;
ck('the lower-third caption plate is composited EXACTLY ONCE in the bake chain',
   titleCalls === 1, 'calls=' + titleCalls + (titleCalls > 1 ? ' — §38.1b: the status box REPLACES it' : ''));
ck('…and that one call is inside _drawUnlessHold, so it registers a rect and obeys the freeze',
   /_drawUnlessHold\('roomtitle\.fallback', function \(\) \{ A\.roomTitleCompositeOntoCanvas\(/.test(mq),
   'a bare call registers nothing, fades with nothing, and no suppression gate can reach it');
ck('…and it is the FALLBACK branch — the status box owns captions whenever it exists',
   /\} else if \(titleInfo && titleInfo\.opacity > 0 && A\.roomTitleCompositeOntoCanvas\) \{/.test(mq),
   'else of `if (A.filmBoxesDrawStatus)`');

// ── 2. §75 REACHES THE CAPTION, NOT JUST THE STATUS BOX ──────────────────────────────────────
// §75 split the room title into storey and rooms and wired the split into the status box, then
// left the caption chain reading the pre-§75 COMBINED string one line below. Evidence in the
// frames: status box Room="≈ Hall/Corridor 2, …" while the caption read "Level 1 ≈ Hall/Corridor 4,
// ≈ Hall/Corridor 5 +3" — storey and rooms glued together, the format §75 retired.
ck('the caption chain uses §75\'s SPLIT room row, never the combined pre-§75 string',
   /var _titleInfo = _erCapRow \|\| _srReveal \|\| _srCue \|\| _srRoomRow \|\| null;/.test(mq),
   '_srRoomRow, the object §75 already builds for the status box');
ck('the escape-route caption reaches the STATUS BOX, so deleting the duplicate bar cannot lose it',
   /reveal: _erCapRow \|\| _srReveal/.test(mq),
   'during its window the escape route IS the reveal');

// ── 3. THE MEASURE BOX CAN GO IDLE ───────────────────────────────────────────────────────────
ck('the slab label has a stale check at all — a re-posting box can never expire on its own',
   /A\.slabBeatLabelStaleCheck = function/.test(slab),
   'cpe_film_boxes.js LINGER only expires a box when NOTHING posts');
ck('…it CLEARS _labelOn, so the composite stops posting rather than merely drawing less',
   /A\.slabBeatLabelStaleCheck = function[\s\S]{0,400}_labelOn = false;/.test(slab));
ck('…it is wired into the frame loop, BEFORE the beat\'s own update',
   /A\.slabBeatLabelStaleCheck\(_tnFilm \* _filmSecFull\)[\s\S]{0,200}A\.slabBeatAt\(_tnFilm \* _filmSecFull\)/.test(mq),
   'a shipped-but-never-called fix is the defect this project has hit most often');
ck('…and it bounds on an EXISTING signal, not a new clock or an invented number',
   /_findingsHudSuppress/.test(slab) && !/setTimeout|LABEL_MAX_SEC|\b[0-9]+(\.[0-9]+)? \* 1000\b/.test(
     (slab.match(/A\.slabBeatLabelStaleCheck = function[\s\S]{0,900}/) || [''])[0]),
   '§FINDINGS_HUD_CLEAR — red1\'s own "their work is sufficient" moment');
ck('…and it says so in the log, so a reader can see the box stop',
   /A\.slabBeatLabelStaleCheck = function[\s\S]{0,700}§SLAB_BEAT_LABEL off/.test(slab));

// ── 4. ONE SLOT, ONE OCCUPANT ────────────────────────────────────────────────────────────────
// red1: "EscRoute should be taking over the opposing bottom HUD ... This leaves the main HUD to
// continue displaying its overall building info", then "And the old opposing HUD is replaced".
// The old code overwrote `_statInfo`, which EVICTED the building card for the whole escape window.
const esc = fs.readFileSync(path.join(ROOT, 'viewer/cpe_escape_route.js'), 'utf8');
ck('the escape card no longer overwrites _statInfo — the building card keeps the HUD column',
   !/_statInfo = \{ shown: _ec/.test(mq) && /_escCardInfo = \{ shown: _ec/.test(mq));
ck('…it takes the corner diagonally opposite, from cpe_film_boxes\'s OWN map, not a second copy',
   /A\.filmBoxesOppositeCorner \? A\.filmBoxesOppositeCorner\(_ovPos\)/.test(mq) &&
   /A\.filmBoxesOppositeCorner = function/.test(fs.readFileSync(path.join(ROOT, 'viewer/cpe_film_boxes.js'), 'utf8')),
   'a duplicated corner map is a thing that drifts');
ck('…and it draws inside _drawUnlessHold, so it registers a rect and fades with the freeze',
   /_drawUnlessHold\('escroute\.card', function \(a\) \{/.test(mq),
   'the exact two things the duplicated caption bar did not do');
ck('the Measure box REPLACED, not shared — it does not draw while the escape card holds the slot',
   /if \(A\.filmBoxesDrawMeasure && !escCardInfo\) \{/.test(mq),
   'two panels in one corner is the crowding the move exists to end');
ck('the linger reuses cpe_film_boxes\'s published LINGER_S — red1 spec\'d that dwell himself (§56.1)',
   /A\.filmBoxesMeasureLingerS > 0\) \? A\.filmBoxesMeasureLingerS : 2\.2/.test(esc),
   'same box, same request, same constant — not a second dwell');

// ── 5. THE SERVICE WORKER VERSION MOVED WITH THE MODULES ─────────────────────────────────────
// Not a draw defect, but the same class of silent failure: a reused bake profile renders the OLD
// modules and looks perfectly normal doing it. Four commits of viewer changes shipped on v1207.
{
  const sw = fs.readFileSync(path.join(ROOT, 'viewer/sw.js'), 'utf8');
  const m = /const CACHE_VERSION = 'v(\d+)'/.exec(sw);
  ck('CACHE_VERSION has moved past v1207, which carried four commits of viewer module changes',
     !!m && +m[1] > 1207, m ? 'v' + m[1] : 'not found');
}

console.log('§OVERLAY_LIFETIME ' + (fail ? 'FAIL' : 'PASS') + ' pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
