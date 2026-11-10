#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — W-BAND-MIX, bim-compiler prompts/MODELLER_MASTER.md §BAND-MIX (the Q9 ruling: proportional allocation). Read the log after every run; exit code is not evidence.
// ISSUE IT EXPOSES: a building with no rooms walks measured bands; a band row was measured from a MIX of devices and the residential rules hold no single mesh for the class, so every
//   device of the row was refused. With the row's own source meshes shipped (rule_placement_mix), its devices must be placed in the measured mix, every one provisional, none counted as placed.
// Nothing judged = INCONCLUSIVE, never PASS. Node only (walk harness), public DBs.
// Usage: node modeller/tests/witness_band_mix.js
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'sql.js'));
const H = require('./walk_node_harness.js');
const M = path.join(__dirname, '..');
const PIECES = ['IfcPipeSegment', 'IfcPipeFitting', 'IfcDuctSegment', 'IfcDuctFitting', 'IfcFlowSegment', 'IfcFlowFitting'];
let pass = 0, fail = 0, inc = 0; const TAG = '§W_BMIX';
const chk = (id, ok, d) => { console.log(TAG + ' ' + id + ' ' + (ok ? 'PASS' : 'FAIL') + ' ' + (d || '')); ok ? pass++ : fail++; };
const incon = (id, d) => { console.log(TAG + ' ' + id + ' INCONCLUSIVE ' + d); inc++; };
const log = console.log, quiet = f => { const lines = []; console.log = s => lines.push(String(s)); try { return { r: f(), lines }; } finally { console.log = log; } };
// an independent largest-remainder split (not the walker's): n over weights k, ties in the given order
const split = (ks, n) => { const tot = ks.reduce((a, b) => a + b, 0), e = ks.map(k => n * k / tot), f = e.map(Math.floor); let left = n - f.reduce((a, b) => a + b, 0);
  e.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, left).forEach(([, i]) => { f[i]++; }); return f; };
(async () => {
  const SQL = await initSqlJs(), stack = await H.loadStack(SQL);
  const patch = path.join(M, 'patches', 'duplex_rules.db.sql');
  if (!fs.existsSync(patch)) { incon('ALL', 'modeller/patches/duplex_rules.db.sql absent: nothing judged'); return done(); }
  // the mix as shipped, read from the patch applied to a copy of the rules (not through the walker)
  const rdb = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(M, 'duplex_rules.db')))); stack.DW.applyRulesPatch(rdb, 'duplex_rules.db', fs.readFileSync(patch, 'utf8'));
  const mixRows = (() => { const r = rdb.exec('SELECT disc, ifc_class, storey_scope, geometry_hash, k, n, src_guid FROM rule_placement_mix ORDER BY disc, ifc_class, storey_scope, k DESC, geometry_hash'); return r.length ? r[0].values : []; })();
  const mixOf = {}; mixRows.forEach(m => { const key = m[0] + '|' + m[1] + '|' + m[2]; (mixOf[key] = mixOf[key] || []).push({ hash: m[3], k: m[4], n: m[5], src: m[6] }); });
  log(TAG + ' shipped mix rows=' + mixRows.length + ' rule rows=' + Object.keys(mixOf).length);
  const walk = (name, disc, noPatch) => { const f = path.join(M, name + '_ARC.db'); if (!fs.existsSync(f)) return null; const raw = fs.readFileSync(f);
    if (noPatch) process.env.DW_NO_RULES_PATCH = '1'; else delete process.env.DW_NO_RULES_PATCH;
    quiet(() => H.openBuildingRules(SQL, stack, name)); const W = quiet(() => H.walkLive(SQL, stack, disc, raw, name, [], {})); delete process.env.DW_NO_RULES_PATCH; return W; };
  const isMix = p => p.bandMix === true;   // the walker's own flag: a later pass (host binding) may relabel prov

  // ── X1 + X2: the building with no rooms
  let judgedRows = 0;
  for (const disc of ['ELEC', 'PLB']) {
    const A = walk('SampleCastle', disc, false), B = walk('SampleCastle', disc, true);
    if (!A || !B) { incon('X1 ' + disc, 'SampleCastle_ARC.db absent'); continue; }
    const pa = (A.r.placements || []), mx = pa.filter(isMix), bandLines = A.lines.filter(l => /§BAND-MIX /.test(l));
    bandLines.slice(0, 6).forEach(l => log('  ' + l.slice(0, 260)));
    log(TAG + ' SampleCastle ' + disc + ' with patch: placed=' + A.r.placed + ' provisional=' + A.r.provisional + ' mixDevices=' + mx.length + ' | no patch: placed=' + B.r.placed + ' provisional=' + B.r.provisional + ' refuseLines=' + B.lines.filter(l => /§LOD400-REFUSE /.test(l)).length + (A.r.refused ? ' (with-patch walk refused: ' + String(A.r.reason).slice(0, 120) + ')' : ''));
    // per (class, scope, band): the count per mesh against the independent split
    const groups = {}; mx.forEach(p => { const k = p.ifc_class + '|' + (p.reanchor ? p.reanchor.from : p.storey) + '|' + JSON.stringify(p.band); (groups[k] = groups[k] || []).push(p); });
    const bad = []; let dropped = 0;
    Object.keys(groups).forEach(k => { const g = groups[k], cls = g[0].ifc_class, scope = g[0].reanchor ? g[0].reanchor.from : g[0].storey, mix = mixOf[disc + '|' + cls + '|' + scope];
      if (!mix) { bad.push(k + ': no shipped mix for the row'); return; }
      // the mix is allocated over the row's devices at placement (the §BAND-MIX line says how many); a device the host pass refuses afterwards leaves its mesh one short. So: the
      //   allocation = the independent split of the ALLOCATED count, and what remains is that allocation minus exactly the dropped devices, never more of any mesh.
      const ln = bandLines.filter(l => l.indexOf(' ' + disc + '/' + cls + ' scope="' + scope + '"') >= 0)[0] || '', allocN = Number((/ placed=(\d+) /.exec(ln) || [])[1]);
      const want = split(mix.map(m => m.k), allocN), got = mix.map(m => g.filter(p => p.geometry_hash === m.hash).length), said = mix.map(m => Number((new RegExp(String(m.hash).slice(0, 8) + ':(\\d+)\\(').exec(ln) || [])[1])); judgedRows++;
      dropped += allocN - g.length;
      if (!isFinite(allocN) || JSON.stringify(want) !== JSON.stringify(said) || got.some((x, i) => x > want[i]) || want.reduce((a, b) => a + b, 0) - got.reduce((a, b) => a + b, 0) !== allocN - g.length) bad.push(cls + '/' + scope + ' allocated=' + allocN + ' said=' + said + ' want=' + want + ' remain=' + got);
      g.forEach(p => { const m = mix.find(x => x.hash === p.geometry_hash); if (!m || p.meshFrom !== m.src || p.mix !== m.k + ' of ' + m.n) bad.push(cls + ' device meshFrom/mix wrong: ' + p.meshFrom + ' ' + p.mix); }); });
    if (!mx.length) incon('X1 ' + disc, 'no band-mix device was placed on SampleCastle: nothing judged (' + (A.lines.filter(l => /§(DISC-WALK|WALK-BAND|LOD400-REFUSE)/.test(l))[0] || '').slice(0, 160) + ')');
    else {
      chk('X1 ' + disc + ' every band-mix device is provisional and names its source mesh; the allocation per mesh = the independent largest-remainder split', mx.every(p => p.provisional === true && p.meshFrom && p.mix) && !bad.length, 'devices=' + mx.length + ' rows=' + Object.keys(groups).length + ' droppedAfterAllocation=' + dropped + (bad.length ? ' bad=' + JSON.stringify(bad.slice(0, 4)) : ''));
      const dev = l => (l || []).filter(p => PIECES.indexOf(p.ifc_class) < 0 && /^(placed:|shim:)/.test(p.prov || '')), withMesh = l => dev(l).filter(p => p.geometry_hash).length;
      chk('X1 ' + disc + ' placed (counted) is unchanged; band devices now carry a real mesh, where none did', A.r.placed === B.r.placed && withMesh(pa) === mx.length && withMesh(B.r.placements) === 0, 'placed ' + B.r.placed + ' -> ' + A.r.placed + '; band devices with a mesh ' + withMesh(B.r.placements) + ' of ' + dev(B.r.placements).length + ' -> ' + withMesh(pa) + ' of ' + dev(pa).length + ' (provisional ' + B.r.provisional + ' -> ' + A.r.provisional + ')');
    }
    chk('X2 ' + disc + ' red control: with no patch no such device exists (the rows are refused)', !(B.r.placements || []).some(isMix), 'mixDevices=' + (B.r.placements || []).filter(isMix).length + ' refuseLines=' + B.lines.filter(l => /§LOD400-REFUSE /.test(l)).length);
    chk('X4 ' + disc + ' no run piece takes a mix mesh', !mx.some(p => PIECES.indexOf(p.ifc_class) >= 0), 'classes=' + JSON.stringify(Array.from(new Set(mx.map(p => p.ifc_class)))));
  }
  // ── X3: Duplex (walks from its rooms): placed unchanged
  const dup = {}; let dOk = true;
  for (const disc of ['ELEC', 'PLB', 'ACMV']) { const A = walk('Duplex', disc, false), B = walk('Duplex', disc, true); if (!A || !B) { dOk = null; break; }
    dup[disc] = { placed: [B.r.placed, A.r.placed], provisional: [B.r.provisional, A.r.provisional], mix: (A.r.placements || []).filter(isMix).length }; if (A.r.placed !== B.r.placed) dOk = false; }
  if (dOk === null) incon('X3', 'Duplex_ARC.db absent');
  else chk('X3 Duplex placed is unchanged by the patch (no patch -> patch)', dOk && dup.ELEC.placed[1] > 0, JSON.stringify(dup));
  // the allocation rule itself, against the independent split, on hand cases
  const cases = [[[1, 1, 1, 1, 1], 7], [[2, 1, 1, 1], 6], [[3, 1, 1], 4], [[1], 9], [[2, 1, 1, 1], 0]];
  const offs = cases.filter(([ks, n]) => { const mix = ks.map((k, i) => ({ k, id: i })), a = stack.DW.mixAllocate(mix, n); return JSON.stringify(mix.map(m => a.filter(x => x === m).length)) !== JSON.stringify(split(ks, n)) || a.length !== n; });
  chk('X5 the allocation equals the independent largest-remainder split on ' + cases.length + ' hand cases (and sums to n)', offs.length === 0, 'cases=' + JSON.stringify(cases.map(([ks, n]) => ks.join('+') + ' n=' + n + ' -> ' + split(ks, n).join(','))) + ' off=' + offs.length);
  if (!judgedRows) incon('ROWS', 'no band row was judged against its mix');
  done();
})().catch(e => { console.log = log; console.log(TAG + ' ERROR ' + (e && e.stack || e)); inc++; done(); });
function done() { console.log(TAG + ' VERDICT ' + (fail ? 'FAIL' : inc ? 'INCONCLUSIVE' : 'PASS') + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc); process.exit(fail ? 1 : inc ? 2 : 0); }
