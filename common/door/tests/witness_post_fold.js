// ⚠ DO NOT REMOVE — W-POST-FOLD (bim-compiler prompts/CLI_ERP_IVR.md §29.6 P3b: "Fold from BIM", a process of the BIM Document plugin). READ THE LOG (§POST_FOLD lines here, § lines of the CLI on stderr); an exit code is not evidence.
//   F1 ISSUE (what the fold wrote is lost, invented or hidden when plain SQL writes become op-log ops): the post's ops, replayed on a FRESH boot, give exactly the rows the fold writes when run directly
//      on a copy — the SAME set of changed tables (found by comparing EVERY table of the database, not by the wrapper's list) and, table by table, the same rows (the random UU columns aside)
//   F2 ISSUE (a second post piles up, or "0 ops" is only blindness): posting the same model again adds 0 ops and the version tag says `same`; a CHANGED selection (a different model) does write (non-vacuous)
//   F3 ISSUE (the order is not what `cost` showed): C_Project.PlannedAmt == Σ lines == an independent sum of rate x round3(qty) over the rows of `viewer.cost by=task` (BigInt decimals), exact; and it == cost's totalExact
//      exactly and == cost's shown total at its precision (§29.6 CENTS: cost prices on the order's line basis, it no longer rounds each group to a whole unit) -> §POST_FOLD_COST
//   F4 ISSUE (the order's dates are not the programme's): every phase of the persisted 4D run is a C_ProjectPhase once, StartDate = project start + min start day, EndDate = + max end day, and its 4D tasks
//      are C_ProjectTask rows; the only phase beyond the run is 'Unsequenced' (elements outside it) and it carries no dates
//   F5 ISSUE (the offer would not follow the engine): ProjOrderState.decide says `generate` before the post and `in-po` (no action) after, read on the replayed database
//   F6 ISSUE (a refused post writes or is silent): an unknown building, a selection matching nothing, and a missing Building are refused naming the reason, and the op-log is byte-equal after
//   Falsifiers: POST_BREAK=retag (F2 FAIL) · shift (F4 FAIL) · droprow (F3 FAIL) · CAPTURE_BREAK=lasttable (F1 FAIL) · CAPTURE_BREAK=skipupdate (F2 FAIL: the project row's new tag and PlannedAmt are an UPDATE op)
//   Run: node common/door/tests/witness_post_fold.js > common/door/tests/logs/post_fold.log 2>&1
'use strict';
const path = require('path'), cp = require('child_process'), fs = require('fs'), os = require('os'), crypto = require('crypto');
const { kit, ROOT, DOOR } = require('./_kit');
const k = kit('W-POST-FOLD'), NOW = '2026-11-16 12:00:00', BUILDING = process.env.POST_BUILDING || 'Duplex';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'postfold_')), oplog = path.join(dir, 'ops.jsonl'), empty = path.join(dir, 'empty.jsonl');
const env0 = Object.assign({}, process.env, { BIM_OBJECT_OPLOG: oplog, BIM_DOOR_JOURNAL: path.join(dir, 'j.jsonl'), RED1_WARM: 'off', BIM_ORDER_NOW: NOW });
const door = (line, e) => { const t = Date.now(), r = cp.spawnSync(process.execPath, [DOOR, line], { encoding: 'utf8', env: Object.assign({}, env0, e || {}), timeout: 600000, maxBuffer: 1 << 28 }); const l = (r.stdout || '').split('\n').filter(x => x.charAt(0) === '{').pop(); let j = null; try { j = JSON.parse(l); } catch (x) { /* none */ } return { j, ms: Date.now() - t, err: r.stderr || '' }; };
const nops = () => { try { return fs.readFileSync(oplog, 'utf8').split('\n').filter(Boolean).length; } catch (e) { return 0; } };
const bytes = () => { try { return fs.readFileSync(oplog); } catch (e) { return Buffer.alloc(0); } };
const sumOps = (a) => JSON.stringify(a && a.opSummary || {});
// every table's rows as strings, ordered; the UU columns (random) and nothing else are left out
const UU = (c) => /_uu$/.test(c);
function dump(db) {
  const out = {}, tabs = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  (tabs.length ? tabs[0].values : []).forEach(([t]) => { const r = db.exec('SELECT * FROM "' + t + '"'); if (!r.length) { out[t] = { cols: [], rows: [] }; return; }
    const cols = r[0].columns.map(c => c.toLowerCase()), keep = cols.map((c, i) => UU(c) ? -1 : i).filter(i => i >= 0);
    out[t] = { cols: keep.map(i => cols[i]), rows: r[0].values.map(v => JSON.stringify(keep.map(i => v[i]))).sort() }; });
  return out;
}
const changed = (a, b) => Object.keys(a).filter(t => !b[t] || a[t].rows.length !== b[t].rows.length || a[t].rows.some((x, i) => x !== b[t].rows[i])).sort();
(async () => {
  const EC = require(path.join(ROOT, 'common/door/erp_cli.js'));
  const quiet = async (fn) => { const w = process.stderr.write, l = console.log; process.stderr.write = () => true; console.log = () => {}; try { return await fn(); } finally { process.stderr.write = w; console.log = l; } };
  // the process, once (a fresh op-log)
  const p1 = door('erp.process name="Fold from BIM" Building=' + BUILDING), a1 = p1.j && p1.j.answer, n1 = nops();
  k.L('F0 post 1: status=' + (p1.j && p1.j.status) + ' ms=' + p1.ms + ' message=' + (a1 && a1.message) + ' ops=' + (a1 && a1.planned) + ' op-log lines=' + n1 + ' ' + sumOps(a1) + (p1.j && p1.j.why ? ' why=' + p1.j.why : ''));
  if (!a1 || p1.j.status !== 'ok' || !n1) { k.incon('F1-F5', 'the first post did not write (status=' + (p1.j && p1.j.status) + ' why=' + (p1.j && p1.j.why) + '): nothing to judge'); k.end(); process.exit(3); }
  // F1: oracle = the fold run directly on a copy of the same baseline; replay = a fresh boot of the op-log
  process.env.BIM_ORDER_NOW = NOW; process.env.BIM_OBJECT_OPLOG = empty;
  const B0 = await quiet(() => EC.boot({ oplog: empty })), inp = await quiet(() => globalThis.BimOrderHost.inputs({ building: BUILDING, selection: '' }));
  const base = dump(B0.db), copy = new B0.SQL.Database(B0.db.export()), PS = globalThis.BimOrderHost.ProjOrderState;
  const direct = await quiet(() => PS.generate(copy, inp.key, inp.rows, inp.env, inp.now, inp.cur)), dState = PS.readState(B0.db, inp.key, inp.classes, inp.env), dDec = PS.decide(dState, false);
  const orc = dump(copy), O1 = await quiet(() => EC.boot({ oplog })), rep = dump(O1.db);
  const tOrc = changed(orc, base), tRep = changed(rep, base), tDiff = tOrc.filter(t => changed({ [t]: orc[t] }, { [t]: rep[t] }).length);
  k.L('F1 changed tables: direct fold on a copy=' + JSON.stringify(tOrc) + ' replay of the op-log=' + JSON.stringify(tRep) + ' tables whose rows differ between them=' + JSON.stringify(tDiff) + ' (all ' + Object.keys(base).length + ' tables compared)');
  k.chk('F1 the post\'s ' + n1 + ' ops, replayed on a fresh boot, change the SAME ' + tOrc.length + ' tables as the fold run directly, and every one of them holds the same rows (' + tOrc.map(t => t + '=' + orc[t].rows.length).join(' ') + ')',
    tOrc.length > 0 && JSON.stringify(tOrc) === JSON.stringify(tRep) && tDiff.length === 0, 'direct=' + JSON.stringify(tOrc) + ' replay=' + JSON.stringify(tRep) + ' differ=' + JSON.stringify(tDiff));
  // F3
  const q = (db, sql) => { const r = db.exec(sql); return r.length ? r[0].values : []; };
  const proj = q(O1.db, "SELECT c_project_id, plannedamt FROM c_project WHERE value='" + inp.key.replace(/'/g, "''") + "'")[0], pid = proj && proj[0], planned = proj && String(proj[1]);
  const lines = q(O1.db, 'SELECT plannedqty, plannedprice, plannedamt FROM c_projectline WHERE c_project_id=' + pid);
  const cost = door('viewer.cost building=' + BUILDING + ' by=task').j, rows = cost && cost.answer && cost.answer.rows || [];
  // independent: one line per (class, discipline for a proxy, 4D task) -> qty = round3(sum qty), amount = rate x qty, exact decimals
  const lineKey = (r) => ((r.cls === 'IfcBuildingElementProxy' && r.disc && r.disc.charAt(0) !== '_') ? r.cls + ':' + r.disc : r.cls) + '#' + r.task, agg = {};
  rows.forEach(r => { const kk = lineKey(r), a = agg[kk] || (agg[kk] = { rate: r.rate, qty: 0 }); a.qty += r.qty; });
  const dec = (v) => { const s = String(v), m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/i.exec(s); if (!m || m[4]) throw new Error('not a plain decimal: ' + s); const f = m[3] || ''; return { i: BigInt(m[1] + m[2] + f), sc: f.length }; };
  let tot = { i: 0n, sc: 0 }; const add = (x, y) => { const sc = Math.max(x.sc, y.sc); return { i: x.i * 10n ** BigInt(sc - x.sc) + y.i * 10n ** BigInt(sc - y.sc), sc }; };
  Object.keys(agg).forEach(kk => { const q3 = (Math.round(agg[kk].qty * 1000) / 1000).toFixed(3), r = dec(agg[kk].rate), qd = dec(q3); tot = add(tot, { i: r.i * qd.i, sc: r.sc + qd.sc }); });
  const show = (d) => { let s = (d.i < 0n ? -d.i : d.i).toString(); while (s.length <= d.sc) s = '0' + s; let t = d.sc ? s.slice(0, -d.sc) + '.' + s.slice(-d.sc) : s; if (d.sc) t = t.replace(/0+$/, '').replace(/\.$/, ''); return (d.i < 0n ? '-' : '') + t; };
  const expect = show(tot), sumLines = lines.reduce((s, r) => add(s, dec(r[2])), { i: 0n, sc: 0 }), plannedN = show(dec(planned));
  k.L('§POST_FOLD_COST PlannedAmt=' + planned + ' sum of its ' + lines.length + ' lines=' + show(sumLines) + ' independent sum over the ' + rows.length + ' rows of `viewer.cost by=task` (' + Object.keys(agg).length + ' lines)=' + expect + ' | cost by=task totalExact=' + (cost && cost.answer && cost.answer.totalExact) + ' total=' + (cost && cost.answer && cost.answer.total) + ' precision=' + (cost && cost.answer && cost.answer.precision) + ' rows=' + rows.length);
  if (!rows.length) k.incon('F3', 'viewer.cost answered no rows: nothing to compare');
  else { const P2 = cost.answer.precision, f = 10n ** BigInt(Math.max(0, dec(planned).sc - (P2 == null ? dec(planned).sc : P2))), pd = dec(planned), q = pd.i / f, r = pd.i % f, shownWant = P2 == null ? plannedN : show({ i: q + ((r < 0n ? -r : r) * 2n >= f ? (pd.i < 0n ? -1n : 1n) : 0n), sc: Math.min(pd.sc, P2) });
    k.chk('F3 PlannedAmt ' + planned + ' == the sum of its lines == an independent sum of rate x round3(qty) over cost\'s rows (' + expect + ') == cost\'s totalExact (' + cost.answer.totalExact + '), and cost shows ' + cost.answer.total + ' == it at ' + P2 + ' decimals',
      plannedN === expect && show(sumLines) === expect && show(dec(cost.answer.totalExact)) === expect && Number(shownWant) === cost.answer.total, 'planned=' + planned + ' lines=' + show(sumLines) + ' independent=' + expect + ' costExact=' + cost.answer.totalExact + ' shown=' + cost.answer.total + ' want ' + shownWant); }
  // F4
  const CACHE = require(path.join(ROOT, 'scripts/cache_4d_run.js')), run = CACHE.read(BUILDING), start = Date.parse(CACHE.PROJECT_START + 'T00:00:00Z'), day = (d) => new Date(start + d * 86400000).toISOString().slice(0, 10) + ' 00:00:00';
  const win = {}; (run && run.tasks || []).forEach(t => { const w = win[t.phase] || (win[t.phase] = { s: 1e9, e: -1e9 }); w.s = Math.min(w.s, t.sDays); w.e = Math.max(w.e, t.eDays); });
  const ph = q(O1.db, 'SELECT name, startdate, enddate FROM c_projectphase WHERE c_project_id=' + pid), phBy = {}; ph.forEach(r => { phBy[r[0]] = (phBy[r[0]] || []).concat([[r[1], r[2]]]); });
  const bad = []; Object.keys(win).forEach(n => { const g = phBy[n]; if (!g || g.length !== 1) bad.push(n + ' rows=' + (g ? g.length : 0)); else if (g[0][0] !== day(win[n].s) || g[0][1] !== day(win[n].e)) bad.push(n + ' got ' + g[0][0] + '..' + g[0][1] + ' want ' + day(win[n].s) + '..' + day(win[n].e)); });
  const extra = Object.keys(phBy).filter(n => !win[n]), extraDated = extra.filter(n => phBy[n].some(x => x[0] || x[1]));
  const tk = q(O1.db, 'SELECT count(*) FROM c_projecttask t JOIN c_projectphase p ON p.c_projectphase_id=t.c_projectphase_id WHERE p.c_project_id=' + pid)[0][0];
  k.L('F4 run phases=' + JSON.stringify(Object.keys(win).map(n => n + ' ' + day(win[n].s).slice(0, 10) + '..' + day(win[n].e).slice(0, 10))) + ' order phases beyond the run=' + JSON.stringify(extra) + ' tasks in the order=' + tk + ' tasks in the run=' + (run && run.tasks && run.tasks.length) + ' mismatches=' + JSON.stringify(bad));
  if (!run || !Object.keys(win).length) k.incon('F4', 'no persisted 4D run for ' + BUILDING);
  else k.chk('F4 all ' + Object.keys(win).length + ' phases of the 4D run are one C_ProjectPhase with the run\'s dates (' + CACHE.PROJECT_START + ' + min start / max end day); ' + (run.tasks.length) + ' 4D tasks are C_ProjectTask rows; beyond the run only ' + JSON.stringify(extra) + ' (undated)',
    bad.length === 0 && extraDated.length === 0 && extra.every(n => n === 'Unsequenced') && tk === run.tasks.length, 'mismatches=' + JSON.stringify(bad) + ' extra=' + JSON.stringify(extra) + ' tasks=' + tk + '/' + (run && run.tasks.length));
  // F5
  const stAfter = PS.readState(O1.db, inp.key, inp.classes, inp.env), dAfter = PS.decide(stAfter, false);
  k.L('F5 before: ' + JSON.stringify({ generated: dState.generated, kind: dDec.kind, actions: dDec.actions }) + ' | the process said ' + JSON.stringify(a1.object && a1.object.decision) + ' | after (replayed db): ' + JSON.stringify({ generated: stAfter.generated, kind: dAfter.kind, actions: dAfter.actions, plannedAmt: stAfter.plannedAmt }));
  k.chk('F5 decide() says generate before the post (and the process reported the same) and in-po with no action after it, on the replayed database', dDec.kind === 'not-generated' && dDec.actions.join() === 'generate' && !!a1.object && a1.object.decision.kind === dDec.kind && dAfter.kind === 'in-po' && dAfter.actions.length === 0 && stAfter.plannedAmt === planned,
    'before=' + dDec.kind + ' after=' + dAfter.kind);
  // F2 — the same model again, then a changed one
  const before2 = bytes(), p2 = door('erp.process name="Fold from BIM" Building=' + BUILDING), a2 = p2.j && p2.j.answer;
  k.L('F2 post 2 (same model): status=' + (p2.j && p2.j.status) + ' planned ops=' + (a2 && a2.planned) + ' op-log lines ' + n1 + ' -> ' + nops() + ' version=' + JSON.stringify(a2 && a2.object && a2.object.version) + ' message=' + (a2 && a2.message));
  const same0 = !!a2 && a2.planned === 0 && nops() === n1 && Buffer.compare(before2, bytes()) === 0 && a2.object.version.state === 'same';
  const p3 = door('erp.process name="Fold from BIM" Building=' + BUILDING + ' Selection="discipline=ARC"'), a3 = p3.j && p3.j.answer;
  k.L('F2 post 3 (a changed selection, discipline=ARC): status=' + (p3.j && p3.j.status) + ' planned ops=' + (a3 && a3.planned) + ' ' + sumOps(a3) + ' version=' + JSON.stringify(a3 && a3.object && a3.object.version) + ' op-log lines now ' + nops());
  const O3 = await quiet(() => EC.boot({ oplog })), pr3 = q(O3.db, 'SELECT description, plannedamt FROM c_project WHERE c_project_id=' + pid)[0], tag3 = a3 && a3.object && a3.object.version && a3.object.version.tag;
  const upd3 = !!pr3 && !!tag3 && String(pr3[0]).indexOf(tag3) >= 0 && Number(pr3[1]) === Number(a3.object.plannedAmt);
  k.L('F2 after post 3 the replayed C_Project holds description=' + JSON.stringify(pr3 && pr3[0]) + ' plannedamt=' + (pr3 && pr3[1]) + ' (the new model ' + tag3 + ', plannedAmt ' + (a3 && a3.object && a3.object.plannedAmt) + ') -> ' + upd3);
  k.chk('F2 posting the same model again adds 0 ops (op-log byte-equal, version tag `same`); a different selection is a different model and DOES write (' + (a3 && a3.planned) + ' ops, version ' + (a3 && a3.object && a3.object.version && a3.object.version.state) + '), and the replayed C_Project carries the new tag and PlannedAmt (an UPDATE op)',
    same0 && !!a3 && a3.planned > 0 && nops() > n1 && upd3, 'same-model ops=' + (a2 && a2.planned) + ' changed-selection ops=' + (a3 && a3.planned));
  // F6
  const snap = bytes(), r1 = door('erp.process name="Fold from BIM" Building=NoSuchBuilding').j, r2 = door('erp.process name="Fold from BIM" Building=' + BUILDING + ' Selection="discipline=ZZZ"').j, r3 = door('erp.process name="Fold from BIM"').j;
  k.L('F6 unknown building: ' + (r1 && r1.status) + ' ' + (r1 && r1.why) + ' | empty selection: ' + (r2 && r2.status) + ' ' + (r2 && r2.why) + ' | no Building: ' + (r3 && r3.status) + ' ' + (r3 && r3.why));
  k.chk('F6 an unknown building, a selection matching nothing and a missing Building are each refused with a reason, and the op-log is byte-equal after',
    [r1, r2, r3].every(r => r && r.status === 'refused' && (r.why || '').length > 10) && /NoSuchBuilding|unknown building/i.test(r1.why) && /matched no element/.test(r2.why) && /Building/.test(r3.why) && Buffer.compare(snap, bytes()) === 0, 'op-log equal=' + (Buffer.compare(snap, bytes()) === 0));
  k.end(); process.exit(k.fail ? 1 : (k.inc ? 3 : 0));
})().catch(e => { console.log('§POST_FOLD CRASH ' + (e && e.stack || e)); process.exit(1); });
