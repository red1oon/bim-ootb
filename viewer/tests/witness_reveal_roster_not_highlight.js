#!/usr/bin/env node
// witness_reveal_roster_not_highlight.js — W-REVEAL-ROSTER
//
// ⚠ DO NOT REMOVE — SCOPE (bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_ROSTER_NOT_A_HIGHLIGHT).
// USER, 2026-09-04: "the last card during buildUP gives way to rotating slides highlights. But the
// last buildUp went along as part of the highlights. That slide of last buildup, drop that only.
// Let highlights be just highlights which are fine." Read the log after every run.
//
// THE ISSUE THIS PROVES OR DISPROVES: §CPE_STATS_TAIL put the HELD BUILD-UP ROSTER into the Reveal
// round's revolving rotation as one of its slots. The roster is round 1's last live crew, frozen —
// so a build-up slide was appearing among the finished-building highlights. This witness asserts
// the Reveal rotation contains CARDS ONLY, over a full cycle, and that the shipped bake loop is the
// thing that makes it so.
//
// Whitebox, no browser, no bake: `tailPanelAt` is SLICED OUT of the shipped cpe_resource_panel.js
// by brace matching and driven directly; the bake's call site is read out of the shipped
// cinema_maxq.js. Nothing is re-typed, so this cannot pass against a copy that is not what ships.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { Witness } = require(path.join(__dirname, '..', '..', 'witness_kit', 'contract.js'));

const panelSrc = fs.readFileSync(path.join(__dirname, '..', 'cpe_resource_panel.js'), 'utf8');
const maxqSrc = fs.readFileSync(path.join(__dirname, '..', 'cinema_maxq.js'), 'utf8');

function sliceFn(src, marker) {
  const i = src.indexOf(marker);
  if (i < 0) return null;
  let d = 0, open = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { d++; open = true; }
    else if (src[j] === '}') { d--; if (open && d === 0) return src.slice(i, j + 1); }
  }
  return null;
}
const tailSrc = sliceFn(panelSrc, 'A.tailPanelAt = function');
// CARD_SECONDS is the rotation's own period — READ it, never re-typed here.
const cardSec = Number((panelSrc.match(/var CARD_SECONDS\s*=\s*([0-9.]+)/) || [])[1]);
// The bake's Reveal call: what does it hand tailPanelAt as `info`?
const callMatch = maxqSrc.match(/A\.tailPanelAt\(\s*_bigCards\s*,\s*i\s*\/\s*fps\s*,\s*([A-Za-z_$][\w$]*|null)\s*\)/);
const callArg = callMatch ? callMatch[1] : null;

// The nine real Hospital/HHS cards, taken verbatim from a real bake's own §CPE_BIG_STATS line.
const CARDS = ['elements coordinated', 'disciplines federated', 'MEP elements resolved',
  'MEP on Level 2', 'levels', 'day programme', 'peak workforce',
  'labour cost committed', 'person-days of labour'].map(l => ({ big: '1', label: l }));
// A real held roster, the shape resourcePanelHoldAt returns.
const HELD = { rows: [{ trade: 'MASON', heads: 4 }, { trade: 'MEP', heads: 2 }], totalHeads: 6, heldFromDay: 133 };

function tailFn() {
  const A = {};
  const sb = { A, Math, console: { log() {} } };
  sb.CARD_SECONDS = cardSec;
  vm.createContext(sb);
  vm.runInContext('var CARD_SECONDS = ' + cardSec + ';\n' + tailSrc + ';', sb);
  return A.tailPanelAt;
}

function population() {
  if (!tailSrc || !cardSec || !callArg) return [];
  const tail = tailFn();
  // The shipped call passes `null`, so that is what the rotation is sampled with. Two full cycles,
  // several samples per slot, so a roster appearing anywhere in the cycle cannot be missed.
  const info = (callArg === 'null') ? null : HELD;
  const rows = [];
  const cycle = CARDS.length * cardSec;
  const step = cardSec / 4;
  for (let t = 0; t < cycle * 2; t += step) {
    const s = tail(CARDS, t, info);
    rows.push({
      t: +t.toFixed(2),
      kind: !s ? 'none' : (s.roster ? 'roster' : 'card'),
      label: (s && s.card) ? s.card.label : (s && s.roster ? 'ROSTER' : ''),
      slots: s ? s.n : 0,
      callArg: callArg
    });
  }
  return rows;
}

const schema = {
  type: 'object',
  required: ['t', 'kind', 'label', 'slots', 'callArg'],
  properties: {
    t: { type: 'number' }, kind: { type: 'string' }, label: { type: 'string' },
    slots: { type: 'integer' }, callArg: { type: 'string' }
  }
};

if (!tailSrc || !cardSec || !callArg) {
  console.log('§WITNESS_REVEAL_ROSTER_VERDICT INCONCLUSIVE — could not read ' +
    (!tailSrc ? 'tailPanelAt' : !cardSec ? 'CARD_SECONDS' : "cinema_maxq's tailPanelAt call") +
    '; nothing judged');
  process.exit(1);
}

const w = Witness('REVEAL_ROSTER_NOT_HIGHLIGHT')
  .population(population)
  .schema(schema)
  // G1 — the defect: the build-up roster must never be one of the Reveal slides.
  .invariant('no-roster-slide', rows => rows.every(r => r.kind !== 'roster'))
  // G2 — the rotation is exactly the cards, not cards+1.
  .invariant('slots-equal-cards', rows => rows.every(r => r.slots === CARDS.length))
  // G3 — nothing else was lost with it: every card still gets its slot in a cycle.
  .invariant('every-card-still-shown', rows => {
    const seen = new Set(rows.filter(r => r.kind === 'card').map(r => r.label));
    return CARDS.every(c => seen.has(c.label));
  })
  // G4 — it is the SHIPPED bake loop that makes it so, not this witness's own argument choice.
  .invariant('bake-passes-null', rows => rows.every(r => r.callArg === 'null'))
  // RED — the pre-fix bake: the held roster is handed in and takes slot 0 of every cycle.
  .redControl(rows => {
    const tail = tailFn();
    return rows.map(r => {
      const s = tail(CARDS, r.t, HELD);
      return Object.assign({}, r, {
        kind: !s ? 'none' : (s.roster ? 'roster' : 'card'),
        label: (s && s.card) ? s.card.label : (s && s.roster ? 'ROSTER' : ''),
        slots: s ? s.n : 0
      });
    });
  });

const res = w.run();
const rows = population();
const cardsSeen = new Set(rows.filter(r => r.kind === 'card').map(r => r.label));
console.log('§REVEAL_ROSTER_ROTATION cards=' + CARDS.length + ' slots=' + (rows[0] ? rows[0].slots : 0) +
  ' cardSec=' + cardSec + ' samples=' + rows.length + ' rosterSlides=' +
  rows.filter(r => r.kind === 'roster').length + ' distinctCardsShown=' + cardsSeen.size +
  ' bakeCallArg=' + callArg);
const vacuous = rows.length === 0;
const noop = rows.some(r => r.kind === 'roster');
console.log('§WITNESS_REVEAL_ROSTER_VERDICT ' +
  (vacuous ? 'VACUOUS — no rotation sampled'
   : noop ? 'NO-OP — a roster slide is still in the rotation; the change is not in force'
   : res.fail === 0 ? 'PASS' : 'FAIL') +
  ' rows=' + rows.length + ' pass=' + res.pass + ' fail=' + res.fail);
process.exit(res.fail === 0 && !vacuous && !noop ? 0 : 1);
