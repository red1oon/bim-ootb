// ⚠ DO NOT REMOVE — W-RED1-COST (bim-compiler prompts/CLI_ERP_IVR.md §29.2, P2: the Find panel's cost of a selection at the door). READ THE LOG; an exit code is not evidence.
//   C1 ISSUE (money lost or counted twice between groupings): by phase, by discipline and by class each sum to the SAME total, and the groups add up to it
//   C2 ISSUE (the door prices differently from the Find panel): the total == ProjOrderState.pricedRowsFor called directly on the same guids (the function W-S9-PURE S1 pins to the Find panel's SQL)
//   C3 ISSUE (a phase that is not the 4D run's): the elements in each phase group == the persisted run's task guids of that phase ∩ the selection
//   C4 ISSUE (a selection that is not what was typed): `storey=*Level*` selects exactly the elements an independent SQL GLOB selects
//   C5 ISSUE (a typo runs): an unknown column is refused naming the nearest
//   C6 ISSUE (the film's cost printed 32 priced rows, not its summary): in a session `cost discipline` shows the groups table (one row per group, == the answer's groups) and `ls` then lists the priced rows
//   Falsifier: COST_BREAK=dropgroup (one group lost: must FAIL C1). A selection that matches nothing is INCONCLUSIVE.
//   Run: node common/door/tests/witness_red1_cost.js > common/door/tests/logs/red1_cost.log 2>&1
'use strict';
const path = require('path'), cp = require('child_process'), fs = require('fs'), vm = require('vm');
const { kit, ROOT, DOOR } = require('./_kit');
const k = kit('W-RED1-COST'), B = 'Duplex';
const door = (line) => { const r = cp.spawnSync(process.execPath, [DOOR, line], { encoding: 'utf8', env: process.env, timeout: 300000 }); return (r.stdout || '').split('\n').filter(l => l.charAt(0) === '{').map(l => JSON.parse(l)).pop(); };
(async () => {
  const P = door('viewer.cost building=' + B + ' by=phase'), D = door('viewer.cost building=' + B + ' by=discipline'), C = door('viewer.cost building=' + B + ' by=class');
  const ok = [P, D, C].every(e => e && e.status === 'ok' && e.answer.verdict === 'OK');
  if (!ok) { k.incon('C1', 'a cost line did not answer: ' + [P, D, C].map(e => e && (e.status + ' ' + (e.why || ''))).join(' | ')); k.end(); return; }
  const gsum = (e) => e.answer.groups.reduce((s, g) => s + g.cost, 0);
  k.L('C1 totals phase=' + P.answer.total + ' discipline=' + D.answer.total + ' class=' + C.answer.total + ' · group sums ' + gsum(P) + '/' + gsum(D) + '/' + gsum(C));
  k.chk('C1 by phase, discipline and class the total is the same (' + P.answer.total + ') and each grouping adds up to it', P.answer.total === D.answer.total && D.answer.total === C.answer.total && gsum(P) === P.answer.total && gsum(D) === D.answer.total && gsum(C) === C.answer.total,
    'phase ' + gsum(P) + '/' + P.answer.total + ' disc ' + gsum(D) + '/' + D.answer.total + ' class ' + gsum(C) + '/' + C.answer.total);
  // C2 + C3: independent, in this process
  const SV = require(path.join(ROOT, 'viewer/tools/schedule_verbs.js')), c = SV.cachedRun(B);
  const SQL = await require(path.join(ROOT, 'modeller/lib/sql-wasm.js'))({ wasmBinary: fs.readFileSync(path.join(ROOT, 'modeller/lib/sql-wasm.wasm')) }), bdb = new SQL.Database(fs.readFileSync(c.dbf.path));
  const rt = {}; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'viewer/rates.js'), 'utf8') + '\n;__o.RATES=RATES;', { __o: rt, console: { log() {}, warn() {} }, window: undefined });
  const PS = require(path.join(ROOT, 'viewer/proj_order_state.js')), env = { EditDelta: require(path.join(ROOT, 'viewer/edit_delta.js')), RATES: rt.RATES };
  const all = bdb.exec('SELECT guid FROM elements_meta')[0].values.map(r => r[0]), direct = PS.pricedRowsFor(bdb, all, env, null), dsum = direct.rows.reduce((s, r) => s + r.cost, 0);
  k.chk('C2 the door\'s total == pricedRowsFor on the same ' + all.length + ' elements (' + dsum + ')', dsum === P.answer.total && direct.elements === P.answer.elements, 'door ' + P.answer.total + '/' + P.answer.elements + ' direct ' + dsum + '/' + direct.elements);
  const sized = {}; bdb.exec('SELECT m.guid FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE t.bbox_x IS NOT NULL AND t.bbox_x>0')[0].values.forEach(r => { sized[r[0]] = 1; });
  const want = {}; (c.run.tasks || []).forEach(t => (t.guids || []).forEach(g => { if (sized[g]) want[t.phase] = (want[t.phase] || 0) + 1; }));
  const bad3 = P.answer.groups.filter(g => g.key !== '(not in the 4D run)' && g.elements !== (want[g.key] || 0)).map(g => g.key + ' ' + g.elements + '≠' + (want[g.key] || 0));
  k.L('C3 run phases=' + JSON.stringify(want));
  k.chk('C3 each phase group holds exactly the persisted 4D run\'s elements of that phase (' + Object.keys(want).length + ' phases)', !bad3.length && P.answer.groups.filter(g => g.key !== '(not in the 4D run)').length === Object.keys(want).length, bad3.join(' | '));
  // C4 a glob selection
  const S = door('viewer.cost building=' + B + ' by=storey storey=*Level*'), sq = bdb.exec("SELECT count(*) FROM elements_meta WHERE lower(CAST(storey AS TEXT)) GLOB '*level*'")[0].values[0][0];
  if (!S || S.status !== 'ok' || !sq) k.incon('C4', 'no Level storey: ' + (S && S.why));
  else k.chk('C4 `storey=*Level*` selects exactly what an independent SQL GLOB selects (' + sq + ')', S.answer.selected === sq, 'door ' + S.answer.selected + ' sql ' + sq);
  // C5 a typo
  const T = door('viewer.cost building=' + B + ' storye=Level1');
  k.chk('C5 an unknown column is refused naming the nearest (storey)', !!T && T.status !== 'ok' && /nearest: storey/.test(T.why || ''), T && (T.status + ' ' + T.why));
  // C6 the session screen: the groups first, ls = the rows
  { const r6 = cp.spawnSync(process.execPath, [path.join(ROOT, 'common/door/red1.js')], { input: 'cd ' + B + '\ncost discipline\nls\nexit\n', encoding: 'utf8', env: Object.assign({}, process.env, { RED1_WARM: 'off' }), timeout: 300000 }), out6 = r6.stdout || '';
    const lines6 = out6.split('\n'), hi = lines6.findIndex(l => /^discipline\s+elements\s+cost/.test(l)), grows = hi >= 0 ? lines6.slice(hi + 1).filter((l, j, arr) => j < D.answer.groups.length) : [];
    const same = D.answer.groups.every((g, j) => grows[j] && grows[j].split(/\s+/)[0] === String(g.key) && Number(grows[j].split(/\s+/).pop()) === g.cost), lsNote = /ls lists the (\d+) priced rows/.exec(out6);
    k.L('C6 header at ' + hi + ' group rows=' + JSON.stringify(grows) + ' ls note=' + (lsNote && lsNote[1]));
    k.chk('C6 a session `cost discipline` prints the ' + D.answer.groups.length + ' groups (== the answer), not the rows, and says ls lists the ' + D.answer.rows.length + ' priced rows', hi >= 0 && same && !!lsNote && Number(lsNote[1]) === D.answer.rows.length, 'header=' + hi + ' same=' + same); }
  k.end();
})().catch(e => { console.log('§W-RED1-COST FAIL ' + (e && e.stack || e)); process.exit(1); });
