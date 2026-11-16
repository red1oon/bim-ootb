// ⚠ DO NOT REMOVE — W-RED1-COST (bim-compiler prompts/CLI_ERP_IVR.md §29.2, P2: the Find panel's cost of a selection at the door). READ THE LOG; an exit code is not evidence.
//   C1 ISSUE (money lost or counted twice between groupings): by phase, by discipline and by class the EXACT total is the same, and each grouping's exact group sums add up to it
//   C2 ISSUE (cost is not what the order will hold, §29.6 CENTS): totalExact == an independent BigInt sum of rate x round3(Σ qty) per (line key, 4D task) over pricedRowsFor rows priced task by task
//      (the fold's line rule, computed here, not by ProjFold.lineAmounts), and `total` == totalExact rounded HALF_UP to the seed's C_Currency.StdPrecision of MYR (the post's 'RM'), read here
//   C3 ISSUE (a phase that is not the 4D run's): the elements in each phase group == the persisted run's task guids of that phase ∩ the selection
//   C4 ISSUE (a selection that is not what was typed): `storey=*Level*` selects exactly the elements an independent SQL GLOB selects
//   C5 ISSUE (a typo runs): an unknown column is refused naming the nearest
//   C6 ISSUE (the film's cost printed 32 priced rows, not its summary): in a session `cost discipline` shows the groups table (one row per group, == the answer's groups, each amount with the currency's `precision` decimals: 153825.40, §29.6 CENTS) and `ls` then lists the priced rows
//   Falsifiers: COST_BREAK=dropgroup (one group lost: must FAIL C1) · COST_BREAK=introws (whole units per row, the old basis: must FAIL C2) · COST_BREAK=nopad (amounts drawn without their decimals: must FAIL C6). A selection that matches nothing is INCONCLUSIVE.
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
  // exact decimals as BigInt (value, scale): nothing here reuses the code under test
  const dec = (v) => { const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(v)); if (!m) throw new Error('not a plain decimal: ' + v); const f = m[3] || ''; return { i: BigInt(m[1] + m[2] + f), sc: f.length }; };
  const add = (x, y) => { const sc = Math.max(x.sc, y.sc); return { i: x.i * 10n ** BigInt(sc - x.sc) + y.i * 10n ** BigInt(sc - y.sc), sc }; };
  const eq = (x, y) => { const sc = Math.max(x.sc, y.sc); return x.i * 10n ** BigInt(sc - x.sc) === y.i * 10n ** BigInt(sc - y.sc); };
  const show = (d) => { let s = (d.i < 0n ? -d.i : d.i).toString(); while (s.length <= d.sc) s = '0' + s; let t = d.sc ? s.slice(0, -d.sc) + '.' + s.slice(-d.sc) : s; if (d.sc) t = t.replace(/0+$/, '').replace(/\.$/, ''); return (d.i < 0n ? '-' : '') + t; };
  const round = (d, p) => { if (d.sc <= p) return d; const f = 10n ** BigInt(d.sc - p), q = d.i / f, r = d.i % f; const up = (r < 0n ? -r : r) * 2n >= f; return { i: q + (up ? (d.i < 0n ? -1n : 1n) : 0n), sc: p }; };
  // an answer with no exact figures (the old whole-unit cost) is judged, not crashed on: its exact total is taken as the whole-unit figure it shows, which C1/C2 then FAIL on the order's basis
  const ex = (v, w) => dec(v != null ? v : w), gsum = (e) => e.answer.groups.reduce((s, g) => add(s, ex(g.costExact, g.cost)), { i: 0n, sc: 0 });
  const noExact = [P, D, C].filter(e => e.answer.totalExact == null).length; if (noExact) k.L('§RED1_COST_NO_EXACT ' + noExact + ' of 3 answers carry no totalExact (whole units only)');
  k.L('C1 totalExact phase=' + P.answer.totalExact + ' discipline=' + D.answer.totalExact + ' class=' + C.answer.totalExact + ' · exact group sums ' + show(gsum(P)) + '/' + show(gsum(D)) + '/' + show(gsum(C)) + ' · shown total ' + P.answer.total);
  const T0 = ex(P.answer.totalExact, P.answer.total);
  k.chk('C1 by phase, discipline and class the exact total is the same (' + P.answer.totalExact + ') and each grouping\'s exact groups add up to it', !noExact && eq(T0, ex(D.answer.totalExact, D.answer.total)) && eq(T0, ex(C.answer.totalExact, C.answer.total)) && eq(gsum(P), T0) && eq(gsum(D), T0) && eq(gsum(C), T0),
    'phase ' + show(gsum(P)) + '/' + P.answer.totalExact + ' disc ' + show(gsum(D)) + '/' + D.answer.totalExact + ' class ' + show(gsum(C)) + '/' + C.answer.totalExact);
  // C2 + C3: independent, in this process
  const SV = require(path.join(ROOT, 'viewer/tools/schedule_verbs.js')), c = SV.cachedRun(B);
  const SQL = await require(path.join(ROOT, 'modeller/lib/sql-wasm.js'))({ wasmBinary: fs.readFileSync(path.join(ROOT, 'modeller/lib/sql-wasm.wasm')) }), bdb = new SQL.Database(fs.readFileSync(c.dbf.path));
  const rt = {}; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'viewer/rates.js'), 'utf8') + '\n;__o.RATES=RATES;', { __o: rt, console: { log() {}, warn() {} }, window: undefined });
  const PS = require(path.join(ROOT, 'viewer/proj_order_state.js')), env = { EditDelta: require(path.join(ROOT, 'viewer/edit_delta.js')), RATES: rt.RATES };
  const PF = require(path.join(ROOT, 'viewer/proj_fold.js')), _l = console.log; let sch; console.log = () => {}; try { sch = PF.scheduleFromRun(c.run, require(path.join(ROOT, 'viewer/rates/4D_template.json')), require(path.join(ROOT, 'scripts/cache_4d_run.js')).PROJECT_START); } finally { console.log = _l; }
  const all = bdb.exec('SELECT guid FROM elements_meta')[0].values.map(r => r[0]), g2t = {}; ((sch && sch.tasks) || []).forEach(t => t.guids.forEach(g => { g2t[g] = t.id; }));
  const buckets = {}; all.forEach(g => { const t = g2t[g] != null ? g2t[g] : ''; (buckets[t] || (buckets[t] = [])).push(g); });
  const lines = {}; let elements = 0;
  Object.keys(buckets).forEach(t => { const p = PS.pricedRowsFor(bdb, buckets[t], env, null); elements += p.elements;
    p.rows.forEach(r => { const kk = ((r.cls === 'IfcBuildingElementProxy' && r.disc && r.disc.charAt(0) !== '_') ? r.cls + ':' + r.disc : r.cls) + '#' + t, L = lines[kk] || (lines[kk] = { rate: r.rate, qty: 0 }); L.qty += r.qty; }); });
  const indep = Object.keys(lines).reduce((s, kk) => { const r = dec(lines[kk].rate), q = dec((Math.round(lines[kk].qty * 1000) / 1000).toFixed(3)); return add(s, { i: r.i * q.i, sc: r.sc + q.sc }); }, { i: 0n, sc: 0 });
  const seed = new SQL.Database(fs.readFileSync(path.join(ROOT, 'erp/ad_seed.db'))), pq = seed.exec("SELECT StdPrecision FROM C_Currency WHERE ISO_Code='MYR'"), prec = pq.length ? Number(pq[0].values[0][0]) : null; seed.close();
  const shownWant = prec == null ? null : show(round(T0, prec));
  k.L('§RED1_COST_LINES independent lines=' + Object.keys(lines).length + ' sum=' + show(indep) + ' door totalExact=' + P.answer.totalExact + ' lines=' + P.answer.lines + ' · MYR StdPrecision=' + prec + ' want shown=' + shownWant + ' door total=' + P.answer.total + ' precision=' + P.answer.precision + ' currency=' + P.answer.currency);
  if (prec == null) k.incon('C2', 'the seed has no MYR currency: the precision cannot be judged');
  else k.chk('C2 totalExact == an independent sum of rate x round3(qty) over ' + Object.keys(lines).length + ' order lines (' + show(indep) + '), and total == it at MYR\'s ' + prec + ' decimals (' + shownWant + ')',
    eq(indep, T0) && elements === P.answer.elements && Number(shownWant) === P.answer.total && P.answer.precision === prec, 'independent ' + show(indep) + '/' + elements + ' door ' + P.answer.totalExact + '/' + P.answer.elements + ' shown ' + P.answer.total + ' want ' + shownWant);
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
    const P6 = D.answer.precision, padded = (x) => P6 == null || new RegExp('^-?\\d+' + (P6 ? '\\.\\d{' + P6 + '}' : '') + '$').test(x), same = D.answer.groups.every((g, j) => grows[j] && grows[j].split(/\s+/)[0] === String(g.key) && Number(grows[j].split(/\s+/).pop()) === g.cost && padded(grows[j].split(/\s+/).pop())), lsNote = /ls lists the (\d+) priced rows/.exec(out6);
    k.L('C6 header at ' + hi + ' group rows=' + JSON.stringify(grows) + ' ls note=' + (lsNote && lsNote[1]));
    k.chk('C6 a session `cost discipline` prints the ' + D.answer.groups.length + ' groups (== the answer), not the rows, and says ls lists the ' + D.answer.rows.length + ' priced rows', hi >= 0 && same && !!lsNote && Number(lsNote[1]) === D.answer.rows.length, 'header=' + hi + ' same=' + same); }
  k.end();
})().catch(e => { console.log('§W-RED1-COST FAIL ' + (e && e.stack || e)); process.exit(1); });
