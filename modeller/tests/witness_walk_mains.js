#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — W-WALK-MAINS, prompts/DISC_WALK_DRAWN_MAINS.md §9. Read the log after every run; exit code is not evidence.
// ISSUE IT EXPOSES: runs with no source (lone stubs, no network) are still produced on a file with none of the service; or the rule also removed real runs. Nothing judged = INCONCLUSIVE, never PASS.
// Usage: BEFORE_TREE=<tree with the walker before this rule> node witness_walk_mains.js
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'sql.js'));
const H = require('./walk_node_harness.js');
const M = path.join(process.env.HOME, 'bim-ootb', 'modeller'), B = path.join(process.env.HOME, 'bim-ootb', 'buildings');
let pass = 0, fail = 0; const chk = (id, ok, d) => { console.log('§W_MAINS ' + id + ' ' + (ok ? 'PASS' : 'FAIL') + ' ' + (d || '')); ok ? pass++ : fail++; };
const log = console.log, quiet = f => { const lines = []; console.log = s => lines.push(String(s)); try { return { r: f(), lines }; } catch (e) { console.log = log; throw e; } finally { console.log = log; } };
const key = p => p.ifc_class + '|' + (+p.x).toFixed(3) + '|' + (+p.y).toFixed(3) + '|' + (+p.z).toFixed(3);
const sameBag = (a, b) => { const m = {}; a.forEach(p => { const k = key(p); m[k] = (m[k] || 0) + 1; }); b.forEach(p => { const k = key(p); m[k] = (m[k] || 0) - 1; }); return Object.keys(m).filter(k => m[k]).length; };
const fetchGeo = (SQL, n) => { const g = path.join(B, n + '_geo.db'); return fs.existsSync(g) && fs.statSync(g).size > 10240 ? new SQL.Database(new Uint8Array(fs.readFileSync(g))) : null; };
(async () => {
  const SQL = await initSqlJs(), stack = await H.loadStack(SQL);
  const beforeTree = process.env.BEFORE_TREE, OLD = beforeTree ? require(path.join(beforeTree, 'modeller', 'disc_walker.js')) : null, stOld = OLD ? { DW: OLD, WalkRules: stack.WalkRules } : null;
  log('§W_MAINS before=' + (beforeTree || 'none, N3 and N4 unrun'));
  const realPart = process.env.W_MAINS_PART === 'real';   // sql.js wasm does not give memory back across big opens: the real-run files get a fresh process
  const PIECES = ['IfcPipeSegment', 'IfcPipeFitting', 'IfcDuctSegment', 'IfcDuctFitting', 'IfcFlowSegment', 'IfcFlowFitting'], isPiece = p => /^(placed:|shim:host)/.test(p.prov || '') && PIECES.indexOf(p.ifc_class) >= 0, floats = p => isPiece(p) && /^placed:/.test(p.prov || '');   // a band piece the host search bound is a band piece too; one hosted before the pass is not touched
  let judged = 0, gone = 0, stubs = 0, moved = 0, saidNone = 0, pieceWalks = 0, piecesLeft = 0, piecesCtl = 0, countOff = [], zero = [];
  if (!realPart) {
  // N1 + N2: every ruled discipline on every ARC-only resident held.
  ['Clinic', 'Duplex', 'Garage', 'HHS', 'Hospital', 'JKR', 'Terminal', 'SampleCastle', 'SampleHouse'].forEach(n => {
    const f = path.join(M, n + '_ARC.db'); if (!fs.existsSync(f)) { log('§W_MAINS N1 ' + n + ' UNRUN db absent'); return; }
    const raw = fs.readFileSync(f), geo = fetchGeo(SQL, n), extra = geo ? { geoDb: geo } : {};
    quiet(() => H.openBuildingRules(SQL, stack, n));
    ['ACMV', 'FP', 'PLB'].forEach(d => {
      const now = quiet(() => H.walkLive(SQL, stack, d, new Uint8Array(raw), n, [], extra)), ctl = quiet(() => H.walkLive(SQL, stack, d, new Uint8Array(raw), n, [], Object.assign({ keepPatternStubs: true }, extra)));
      const r = (now.r.chainSegs || []).length, c = (ctl.r.chainSegs || []).length, line = now.lines.find(l => /§WALK-MAINS/.test(l)) || '';
      // N7 §9.2: the pieces are gone and counted. N8: everything else stays, against the switch that keeps them.
      const ctlP = ctl.r.placements || [], nowP = now.r.placements || [], kept = ctlP.filter(isPiece).length, left = nowP.filter(isPiece).length, stillFloat = nowP.filter(floats).length, nm = (now.r.refusedNoHost || {}).noMain || 0;
      if (kept) { pieceWalks++; piecesCtl += kept; piecesLeft += stillFloat; if (nm !== kept - left) countOff.push(n + '/' + d + ' noMain=' + nm + ' kept=' + kept + ' left=' + left); }
      moved += sameBag(nowP.filter(p => !isPiece(p)), ctlP.filter(p => !isPiece(p)));
      if (ctl.r.placed && !now.r.placed) zero.push(n + '/' + d);
      log('§W_MAINS N7 ' + n + '/' + d + ' pieces kept by the switch=' + kept + ' left=' + left + ' noMain=' + nm + ' placed=' + (now.r.placed || 0) + ' of ' + (ctl.r.placed || 0));
      if (!c) { log('§W_MAINS N1 ' + n + '/' + d + ' not judged, the bridge routes nothing here either (placed=' + (now.r.placed || 0) + ')'); return; }
      judged++; stubs += c; if (r) gone++; if (/none reason=no sheet held/.test(line)) saidNone++;
      log('§W_MAINS N1 ' + n + '/' + d + ' runs=' + r + ' withStubs=' + c + ' placed=' + now.r.placed + ' mains=' + JSON.stringify(now.r.mains) + ' | ' + line.replace(/^.*§WALK-MAINS/, '§WALK-MAINS'));
    });
    if (geo) geo.close();
  });
  if (!judged) { log('§W_MAINS VERDICT INCONCLUSIVE no ruled discipline routed on any resident held'); process.exit(0); }
  chk('N1a no ruled discipline makes a run with no source', gone === 0, 'walks=' + judged + ' stillRouting=' + gone);
  chk('N1b every one of those walks says so in the log', saidNone === judged, 'said=' + saidNone + ' of ' + judged);
  chk('N1 RED: keepPatternStubs routes, so the gate is what removed them', stubs > 0, 'stubRuns=' + stubs);
  if (pieceWalks) {
    chk('N7 no band duct or pipe piece is placed, and each is counted as no-main', piecesLeft === 0 && !countOff.length, 'walks=' + pieceWalks + ' left=' + piecesLeft + ' ' + countOff.join(' ; '));
    chk('N7 RED: the switch keeps them, so the rule is what removed them', piecesCtl > 0, 'pieces=' + piecesCtl);
  } else log('§W_MAINS N7 INCONCLUSIVE no walk placed a band piece even with the switch');
  chk('N8 every other placement identical with and without the rule, to 1e-3 m', moved === 0, 'differing=' + moved);
  log('§W_MAINS ZERO walks that placed devices and now place none: ' + zero.length + ' ' + zero.join(' '));
  if (OLD) ['Hospital', 'Terminal', 'elec', 'held'].forEach(part => { const c = require('child_process').spawnSync(process.execPath, ['--max-old-space-size=8000', __filename], { env: Object.assign({}, process.env, { W_MAINS_PART: 'real', W_MAINS_ONE: part }), encoding: 'utf8', maxBuffer: 1 << 26 }); process.stdout.write(c.stdout || ''); if (c.status && !/PART pass=/.test(c.stdout || '')) { fail++; log('§W_MAINS part ' + part + ' exit=' + c.status + ' ' + String(c.stderr || '').slice(0, 200)); } else { const m = (c.stdout || '').match(/PART pass=(\d+) fail=(\d+)/); if (m) { pass += +m[1]; fail += +m[2]; } } });
  }
  if (realPart) {
    // N3: a file holding the service keeps its runs. Real rows: extracted DBs that carry MEP.
    if (process.env.W_MAINS_ONE === 'held') {
      // N6 §9.1: a file that holds the service must not be told no sheet is held. Hospital holds FP-labelled pipes and the rules have no routing row that pairs them. Red control: the same file with those pieces removed says none.
      const p = path.join(B, 'Hospital_extracted.db'); if (!fs.existsSync(p)) { log('§W_MAINS N6 UNRUN db absent'); log('§W_MAINS PART pass=0 fail=0'); process.exit(0); }
      const raw = new Uint8Array(fs.readFileSync(p)), hb = new SQL.Database(raw), CLS = "('IfcPipeSegment','IfcPipeFitting','IfcDuctSegment','IfcDuctFitting','IfcFlowSegment','IfcFlowFitting')", n = hb.exec("SELECT COUNT(*) FROM elements_meta WHERE discipline='FP' AND ifc_class IN " + CLS)[0].values[0][0];
      quiet(() => H.openBuildingRules(SQL, stack, 'Hospital')); const a = quiet(() => H.walkLive(SQL, stack, 'FP', raw, 'Hospital', [], {})), la = a.lines.find(l => /§WALK-MAINS/.test(l)) || '';
      log('§W_MAINS N6 Hospital/FP pieces in the file=' + n + ' runs=' + (a.r.chainSegs || []).length + ' mains=' + JSON.stringify(a.r.mains) + ' | ' + la.replace(/^.*§WALK-MAINS/, '§WALK-MAINS'));
      if (!n) { log('§W_MAINS N6 not judged, no FP pieces in this file'); log('§W_MAINS PART pass=0 fail=0'); process.exit(0); }
      chk('N6 a file holding the service says held=, never no sheet held', new RegExp('held=' + n + ' real=0 reason=no routing rule pairs them').test(la) && !/no sheet held/.test(la) && a.r.mains && a.r.mains.held === n && !(a.r.chainSegs || []).length, 'held=' + (a.r.mains && a.r.mains.held));
      hb.run("DELETE FROM elements_meta WHERE discipline='FP' AND ifc_class IN " + CLS); const cut = hb.export(); hb.close();
      const c = quiet(() => H.walkLive(SQL, stack, 'FP', cut, 'Hospital', [], {})), lc = c.lines.find(l => /§WALK-MAINS/.test(l)) || '';
      chk('N6 RED: the same file with those pieces removed says none', /none reason=no sheet held/.test(lc) && c.r.mains && c.r.mains.none === 'no sheet held', lc.replace(/^.*§WALK-MAINS/, '§WALK-MAINS'));
      log('§W_MAINS PART pass=' + pass + ' fail=' + fail); process.exit(fail ? 1 : 0);
    }
    let real = 0, lost = [];
    [['Hospital', 'Hospital_extracted.db'], ['Terminal', 'Terminal_extracted.db']].filter(([n]) => n === process.env.W_MAINS_ONE).forEach(([n, f]) => {
      const p = path.join(B, f); if (!fs.existsSync(p)) return; const raw = fs.readFileSync(p);
      ['ACMV', 'FP', 'PLB'].forEach(d => {
        quiet(() => H.openBuildingRules(SQL, stack, n)); const a = quiet(() => H.walkLive(SQL, stack, d, new Uint8Array(raw), n, [], {}));
        quiet(() => H.openBuildingRules(SQL, stOld, n)); const b = quiet(() => H.walkLive(SQL, stOld, d, new Uint8Array(raw), n, [], {}));
        const rb = (b.r.chainSegs || []).filter(s => !/^pattern:/.test(s.rule || '')).length, ra = (a.r.chainSegs || []).length, line = a.lines.find(l => /§WALK-MAINS/.test(l)) || '';
        log('§W_MAINS N3 ' + n + '/' + d + ' realBefore=' + rb + ' now=' + ra + ' patternBefore=' + ((b.r.chainSegs || []).length - rb) + ' | ' + line.replace(/^.*§WALK-MAINS/, '§WALK-MAINS'));
        if (rb) { real++; if (ra !== rb || !/real=/.test(line)) lost.push(n + '/' + d + ' ' + rb + '->' + ra); }
      });
    });
    if (process.env.W_MAINS_ONE !== 'elec') { if (real) chk('N3 ' + process.env.W_MAINS_ONE + ': a file holding the service keeps its real runs and says real=', !lost.length, 'walks=' + real + ' ' + lost.join(' ; ')); else log('§W_MAINS N3 INCONCLUSIVE no walk had real runs'); }
    // N4: what the rule does not name. ELEC runs on the two residents that have them.
    let elec = 0, ediff = [];
    (process.env.W_MAINS_ONE === 'elec' ? ['HHS', 'SampleCastle'] : []).forEach(n => { const raw = fs.readFileSync(path.join(M, n + '_ARC.db')), geo = fetchGeo(SQL, n), extra = geo ? { geoDb: geo } : {};
      quiet(() => H.openBuildingRules(SQL, stack, n)); const a = quiet(() => H.walkLive(SQL, stack, 'ELEC', new Uint8Array(raw), n, [], extra)).r; quiet(() => H.openBuildingRules(SQL, stOld, n)); const b = quiet(() => H.walkLive(SQL, stOld, 'ELEC', new Uint8Array(raw), n, [], extra)).r;
      const x = (a.chainSegs || []).length, y = (b.chainSegs || []).length, pd = sameBag(a.placements || [], b.placements || []); log('§W_MAINS N4 ' + n + '/ELEC runs now=' + x + ' before=' + y + ' · N9 placementsDiffering=' + pd + ' of ' + (a.placed || 0)); if (y) elec++; if (x !== y || pd) ediff.push(n); if (geo) geo.close(); });
    if (process.env.W_MAINS_ONE === 'elec') { if (elec) chk('N4 + N9 ELEC runs and placements unchanged', !ediff.length, 'walks=' + elec); else log('§W_MAINS N4 INCONCLUSIVE no ELEC runs before'); }
    log('§W_MAINS PART pass=' + pass + ' fail=' + fail); process.exit(fail ? 1 : 0);
  } else if (!OLD) log('§W_MAINS N3 UNRUN no old walker · N4 UNRUN no old walker');
  log('§W_MAINS VERDICT pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log = log; log('§W_MAINS ERROR ' + (e && e.stack || e)); process.exit(1); });
