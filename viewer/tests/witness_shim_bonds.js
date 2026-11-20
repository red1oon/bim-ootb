#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — W-SHIM-BONDS (gate 17). SCOPE: bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.37.2 (S1: the bond table, report only).
// READ THE LOG after every run; exit code is not evidence.
// ISSUE IT EXPOSES: does the shim-anchor bond table (viewer/shim_bonds.js) stay acyclic, total and deterministic on every building, and do
// the cases the model was invented for hold — structure never hosted by façade or hung, a floor not elected onto a partition while a column
// bears it, a stair landing bonded inside its own stair? It judges the TABLE, not the schedule: no schedule reads the bonds yet.
// B7 is a ratchet on the bonded share (baselines/shim_bonds.json; LOCK=1 writes it from the run).
// Usage: node witness_shim_bonds.js [Building ...]     default: all seven.   Reads the persisted runs only (scripts/cache_4d_run.js).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');
const R = require(path.join(ROOT, 'scripts', 'lib', 'shim_bonds_run.js')), SB = R.SB, O = SB.OUT;
const BLDS = process.argv.slice(2).filter(a => a[0] !== '-');
const ALL = BLDS.length ? BLDS : ['Duplex', 'HHS_Office_Federated', 'JKR', 'Clinic', 'Terminal', 'Hospital', 'LTU_AHouse'];
const LOCK_FILE = path.join(__dirname, 'baselines', 'shim_bonds.json');
const lock = fs.existsSync(LOCK_FILE) ? JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8')) : { _what: 'W-SHIM-BONDS B7 ratchet: bonded count per building, measured (LOCK=1 writes it)', buildings: {} };
let pass = 0, fail = 0, inc = 0;
const say = (id, b, ok, d) => { console.log('  ' + (ok === null ? 'INCONCLUSIVE' : ok ? 'PASS' : 'FAIL') + ' ' + id + ' ' + b + ' — ' + d); ok === null ? inc++ : ok ? pass++ : fail++; };
const STRUCT = { slab: 1, beam: 1, column: 1 }, FACADE = { facade_part: 1 };
const hashOf = res => crypto.createHash('sha1').update(res.outcome.join(',') + '|' + Array.from(res.host).join(',') + '|' + Array.from(res.wave).join(',')).digest('hex').slice(0, 12);

// b4(X) — structural elements hosted by a façade part, or bonded by hangs-below. Returns { judged, bad, sample }.
function b4(X) {
  const { items, res } = X; let judged = 0; const bad = [];
  for (let i = 0; i < res.n; i++) {
    if (!STRUCT[res.kind[i]] || res.outcome[i] !== O.BONDED) continue; judged++;
    const hs = res.hosts[i] || [];
    if (SB.capOf(res, i) === 'hangs-below' || hs.some(j => FACADE[res.kind[j]])) bad.push(items[i].guid);
  }
  return { judged, bad };
}
// b10(X) — hung bonds with an offerer between the element and its host, and `joins` bonds that do not touch. Returns { judged, through, apart, sample }.
function b10(X) {
  const { items, res, G } = X, EPS = R.SG.EPS, GAP = R.SG.GAP; let judged = 0, through = 0, apart = 0, sample = '';
  for (let i = 0; i < res.n; i++) {
    const h = res.host[i]; if (res.outcome[i] !== O.BONDED || h < 0) continue;
    const cap = SB.capOf(res, i), T = items[i], H = items[h];
    if (cap === 'joins') { judged++; if (!(H.bz <= T.tz + GAP && H.tz >= T.bz - GAP)) { apart++; if (!sample) sample = T.guid + ' joins ' + H.guid + ' gap=' + Math.max(H.bz - T.tz, T.bz - H.tz).toFixed(2) + ' m'; } continue; }
    if (cap !== 'hangs-below') continue; judged++;
    const off = {}; res.table[res.kind[i]].forEach(nd => { if (SB.REL[nd.cap] === 'above') nd.hosts.forEach(k => { off[k] = 1; }); });
    const hit = (G.contacts[i] || []).find(j => j !== h && off[res.kind[j]] && SB.relsOf(items[j], T, EPS, GAP).above && items[j].tz <= H.bz + EPS);
    if (hit !== undefined) { through++; if (!sample) sample = T.guid + ' hangs from ' + H.guid + ' (base z ' + H.bz.toFixed(2) + ') through ' + items[hit].guid + ' (' + res.kind[hit] + ', top z ' + items[hit].tz.toFixed(2) + ')'; }
  }
  return { judged, through, apart, sample };
}
(async () => {
  const SQL = await R.sql();
  for (const b of ALL) {
    const X = R.load(b, SQL);
    if (!X) { say('B0', b, null, 'no persisted run / played layer / contact graph — judged nothing (run: node scripts/cache_4d_run.js ' + b + ')'); continue; }
    const { items, res, G, agg } = X, n = res.n, c = res.counts, bonded = c[O.BONDED] || 0;
    console.log('§W_SHIM ' + b + ' db=' + X.run.dbFile + ' n=' + n + ' bonded=' + bonded + ' seeds=' + res.seeds + ' waves=' + res.waves + ' aggregates=' + (agg.has ? (agg.pairs != null ? agg.pairs : Object.keys(agg.parentOf).length) : 'NONE') + ' source=' + X.source);
    // B1 — total: one outcome each, and the counts add up
    const known = new Set(Object.keys(O).map(k => O[k])); let unk = 0, sum = 0;
    for (let i = 0; i < n; i++) if (!known.has(res.outcome[i])) unk++;
    Object.keys(c).forEach(k => { sum += c[k]; });
    say('B1', b, n > 0 ? (unk === 0 && sum === n) : null, 'every element has exactly one outcome (unclassified=' + unk + ', sum=' + sum + ' of ' + n + ')');
    // B2 — acyclic: every host is anchored in an EARLIER wave than what it carries
    let edges = 0, backward = 0;
    for (let i = 0; i < n; i++) (res.hosts[i] || []).forEach(j => { edges++; if (!(res.wave[j] >= 0 && res.wave[j] < res.wave[i])) backward++; });
    say('B2', b, edges ? backward === 0 : null, 'bond edges=' + edges + ' with a host not in an earlier wave=' + backward + ' (0 = no cycle possible)');
    // B3 — the table a judge READS is the table a fresh computation gives (persisted run, §Q.37 S2); without a persisted table: two computations agree
    const fr = X.fresh().res, viaStore = X.source === 'persisted';
    say('B3', b, hashOf(res) === hashOf(fr), (viaStore ? 'persisted table ' : 'computed table (run carries none for this table) ') + hashOf(res) + ' vs fresh computation ' + hashOf(fr));
    // B4 — structure is never hosted by a façade part and never hangs
    const f = b4(X);
    say('B4', b, f.judged ? f.bad.length === 0 : null, 'bonded slabs/beams/columns judged=' + f.judged + ' hosted by façade or bonded hangs-below=' + f.bad.length + (f.bad.length ? ' e.g. ' + f.bad.slice(0, 3).join(',') : ''));
    // B5 — a slab is not elected onto a non-bearing wall while a column or beam also bears it (the HHS "MW 11.5" case, §Q.33.5 break 2)
    let slabs = 0, onPartition = 0;
    for (let i = 0; i < n; i++) {
      if (res.kind[i] !== 'slab' || res.outcome[i] !== O.BONDED || res.host[i] < 0) continue; slabs++;
      if (res.kind[res.host[i]] === 'wall') onPartition++;
    }
    say('B5', b, slabs ? onPartition === 0 : null, 'bonded slabs with a host=' + slabs + ' whose primary host is a non-bearing wall=' + onPartition);
    // B6 — a stair landing that touches a part of its OWN stair bonds inside that stair
    let land = 0, own = 0;
    for (let i = 0; i < n; i++) {
      if (res.kind[i] !== 'landing') continue;
      const p = agg.parentOf[items[i].guid], sib = (G.contacts[i] || []).some(j => agg.parentOf[items[j].guid] === p && res.wave[j] >= 0);
      if (!sib) continue; land++;
      if (res.outcome[i] === O.BONDED && res.host[i] >= 0 && agg.parentOf[items[res.host[i]].guid] === p) own++;
    }
    say('B6', b, land ? own === land : null, land ? 'landings touching an anchored part of their own stair=' + land + ' bonded inside it=' + own : 'no declared stair landing with an anchored sibling contact (aggregates=' + (agg.has ? 'present' : 'absent') + ')');
    // B8 — §CEILING_CLOSEUP (bim-compiler 4D_MODEL_INTEGRITY §Q.39, standard practice on every building): a fitting that hangs from a CEILING (a
    // covering itself bonded hangs-below) does not start before that ceiling ends on the played layer. Before the rule every such fitting did
    // (JKR 151, Clinic 291, Terminal 76 of 156, Hospital 44, LTU 23, counting any covering host). B8 = the pairs filed on ONE level: must be 0.
    // B8x = the pairs filed on two levels (the ceiling was filed with the slab it hangs from, §D6; its fitting was not) — the hung-filing chain,
    // stage S4: a named ratchet, may not grow.
    const lvlOf = {}; (X.run.tasks || []).forEach(t => (t.guids || []).forEach(g => { lvlOf[g] = t.storey; }));
    let under = 0, earlySame = 0, earlyCross = 0;
    for (let i = 0; i < n; i++) {
      const h = res.host[i];
      if (res.kind[i] !== 'fixture' || SB.capOf(res, i) !== 'hangs-below' || h < 0 || res.kind[h] !== 'covering' || SB.capOf(res, h) !== 'hangs-below') continue;
      under++; if (!(items[h].e > items[i].s + 1)) continue;
      if (lvlOf[items[i].guid] === lvlOf[items[h].guid]) earlySame++; else earlyCross++;
    }
    say('B8', b, under ? earlySame === 0 : null, under ? 'fittings hanging from a ceiling=' + under + ' starting before it ends, same level=' + earlySame : 'no fitting hangs from a ceiling');
    const baseX = lock.buildings[b];
    if (process.env.LOCK !== '1') say('B8x', b, under && baseX && typeof baseX.ceilingCrossLevel === 'number' ? earlyCross <= baseX.ceilingCrossLevel : null,
      under ? 'cross-level (S4, hung-filing chain) early fittings=' + earlyCross + ' lock=' + (baseX && baseX.ceilingCrossLevel) : 'no fitting hangs from a ceiling');
    // B9 — §E1_BOND_CARRIERS (bim-compiler 4D_MODEL_INTEGRITY §Q.42): how many bonded elements (relay excluded) still START before one of their
    // hosts ENDS on the played layer. With the bonds as carriers in the solve the order inside a bar honours them; what is left is a host filed
    // in a LATER task (filing, not ordering). A named ratchet: may not grow. Before the switch: JKR 105, Clinic 397, Terminal 193, Hospital 805, LTU 301.
    let earlyHost = 0;
    for (let i = 0; i < n; i++) {
      if (res.outcome[i] !== O.BONDED || SB.capOf(res, i) === 'continues-same-kind') continue;
      if ((res.hosts[i] || []).some(j => items[j].e > items[i].s + 1)) earlyHost++;
    }
    const base9 = lock.buildings[b];
    if (process.env.LOCK !== '1') say('B9', b, base9 && typeof base9.earlyVsHost === 'number' ? earlyHost <= base9.earlyVsHost : null, 'bonded elements starting before a host ends=' + earlyHost + ' lock=' + (base9 && base9.earlyVsHost));
    // B10 — §Q.43 (bim-compiler 4D_MODEL_INTEGRITY): THE HOST IS WHAT THE ELEMENT MEETS. Judged on the result, independently of how compute()
    // chose: (N) no element bonded `hangs-below` has another offerer of its kind's hung needs lying wholly between it and its host;
    // (J) every `joins` bond is a touch (the two height ranges meet within the contact owner's GAP). Before the rule: Hospital 9,573 segments and
    // 884 façade parts had a nearer offerer; a façade plate "joined" a slab 13 m above it.
    const far = b10(X);
    say('B10', b, far.judged ? far.through === 0 && far.apart === 0 : null, 'hung / joined bonds judged=' + far.judged + ' with an offerer between element and host=' + far.through + ' joins that do not touch=' + far.apart + (far.sample ? ' e.g. ' + far.sample : ''));
    // B7 — ratchet: the bonded count may not fall
    const base = lock.buildings[b];
    if (process.env.LOCK === '1') { lock.buildings[b] = { n: n, bonded: bonded, db: X.run.dbFile, ceilingCrossLevel: earlyCross, earlyVsHost: earlyHost }; say('B7', b, true, 'LOCK=1 bonded=' + bonded + ' of ' + n + ' written'); }
    else say('B7', b, base ? (base.n === n ? bonded >= base.bonded : null) : null, base ? (base.n === n ? 'bonded=' + bonded + ' lock=' + base.bonded : 'population changed (' + base.n + ' -> ' + n + ') — re-lock from a run') : 'no baseline — run with LOCK=1');
  }
  if (process.env.LOCK === '1') fs.writeFileSync(LOCK_FILE, JSON.stringify(lock, null, 1) + '\n');
  // RED CONTROL — a table where a façade part OFFERS bears-on-top to slabs must make B4 fail on a building that has both (HHS).
  const rb = ALL.indexOf('HHS_Office_Federated') >= 0 ? 'HHS_Office_Federated' : null;
  if (!rb) say('RED', '-', null, 'HHS_Office_Federated not in this run — the red control was not exercised');
  else {
    const bad = JSON.parse(JSON.stringify(SB.TABLE)); bad.slab[0].hosts = ['facade_part'].concat(bad.slab[0].hosts);
    const Xr = R.load(rb, SQL, bad), fr = Xr ? b4(Xr) : null;
    say('RED', rb, fr ? fr.bad.length > 0 : null, fr ? 'with a façade part offered as a slab bearer B4 finds ' + fr.bad.length + ' (must be > 0: the witness can fail)' : 'not loadable');
  }
  // RED CONTROL for B10 — with `joins` relaxed back to `any` (the table before §Q.43) a building with façade parts must show joins that do not touch.
  const rb2 = ALL.indexOf('Hospital') >= 0 ? 'Hospital' : (ALL.indexOf('Clinic') >= 0 ? 'Clinic' : null);
  if (!rb2) say('RED10', '-', null, 'neither Hospital nor Clinic in this run — the B10 red control was not exercised');
  else {
    const keep = SB.REL.joins; SB.REL.joins = 'any';
    let fr2 = null; try { const Xr2 = R.load(rb2, SQL, SB.TABLE); fr2 = Xr2 ? b10(Xr2) : null; } finally { SB.REL.joins = keep; }
    say('RED10', rb2, fr2 ? fr2.apart > 0 : null, fr2 ? 'with joins = any, B10 finds ' + fr2.apart + ' joins that do not touch (must be > 0: the witness can fail)' : 'not loadable');
  }
  console.log('§W_SHIM_VERDICT pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + (fail ? '  FAIL' : inc && !pass ? '  INCONCLUSIVE' : '  PASS'));
  process.exit(fail ? 1 : (pass ? 0 : 2));
})();
