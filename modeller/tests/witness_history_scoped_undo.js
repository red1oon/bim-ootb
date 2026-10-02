#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-HISTORY-SCOPED-UNDO: Ctrl+Z / Ctrl+Y travel ONE glowing thread. Read the log after every run.
 * SPEC: bim-compiler prompts/HISTORY_PARALLEL_TIMELINE.md §THREADS step 2 + §THREADS-IMPL (append-only inverse, R1–R5 dependents).
 * ISSUE: red1 2026-10-02 — "user may do many things at same time, but does not want to undo the others. Just that particular
 *   wall adjustment". Global Ctrl+Z is LIFO over everything: undoing wall A after a walk + an insert means undoing those too.
 * Real Open Duplex → interleave by real input: wall A gizmo move → ELEC walk → wall B move (B hosts a door D, D rides) → catalog
 *   insert → door D's own gizmo move (a LATER edit leaning on B through the rel_fills_host edge). Then Walls strip tap → glow →
 *   S1 REFUSE    real Ctrl+Z → target B is REFUSED with its dependent named (the door move, relation R1 host/filling); 0 rows added
 *   S2 CASCADE   the badge's "Undo all" → ONE appended gesture reverts D's move + B (+ riders): B, its riders and D back at their
 *                pre-B centres ≤1e-6 m; the walk + insert rows (id, op_hash, undone) and their mesh position hashes byte-identical
 *   S3 SCOPED-A  real Ctrl+Z again → wall A + riders back at pre-A ≤1e-6 m; walk + insert still byte-identical
 *   S4 APPEND    every row that existed before the scoped steps is unchanged (id, op_hash, parameters, undone) — nothing deleted,
 *                reordered or flag-flipped; only new rows at the end; verifyChain ok after every step
 *   S5 REDO      real Ctrl+Y → wall A back at its post-A centre ≤1e-6 m (one appended gesture)
 *   S6 EXIT+GLOBAL Esc → scope off; real global Ctrl+Z undoes the LAST gesture (the redo node's rows → undone=1, wall A at pre-A)
 *   Falsifier: THREADS_SKIP_DEPCHECK=1 sets window.__threadsSkipDepCheck → S1 must go RED (B reverts with no dependent named).
 * A run that could not land the interleaved edits prints INCONCLUSIVE (nothing judged), never PASS.
 */
'use strict';
const { runE2E } = require('./e2e_harness');
const Dr = require('./threads_drive');
const URL_ = process.env.E2E_URL || undefined;
const SKIP = !!process.env.THREADS_SKIP_DEPCHECK;

runE2E('W-HISTORY-SCOPED-UNDO', async (t) => {
  const pg = t.pg, D = Dr.D;
  await Dr.openDuplex(t);
  if (SKIP) { await pg.evaluate(() => { window.__threadsSkipDepCheck = true; }); console.log('  §SCOPED FALSIFIER window.__threadsSkipDepCheck=true'); }
  const centres = async (fids) => { const o = {}; for (const f of fids) o[f] = await t.centre(f); return o; };
  const maxRes = (A, B, fids) => Math.max(0, ...fids.map(f => D(A[f], B[f])));
  const chain = async () => pg.evaluate(async () => { try { return !!(await window.KernelOps.verifyChain(window.Bonsai.oplog.db)).ok; } catch (e) { return 'ERR:' + e.message; } });
  const rowsSnap = async () => pg.evaluate(() => window.Bonsai.oplog.db.exec('SELECT id, op_hash, parameters, undone FROM kernel_ops ORDER BY id')[0].values.map(v => v.join('|')));
  const fp = async (ids) => pg.evaluate(ids => {   // (id, op_hash, undone) of the rows + an FNV hash of every mesh position array with those featureIds
    const db = window.Bonsai.oplog.db, set = new Set(ids);
    const r = db.exec('SELECT id, op_hash, undone FROM kernel_ops WHERE id IN (' + ids.join(',') + ') ORDER BY id');
    let h = 2166136261 >>> 0, nm = 0;
    const meshes = []; window.Bonsai.group().traverse(o => { if (o.isMesh && set.has(o.userData.featureId)) meshes.push(o); });
    meshes.sort((a, b) => a.userData.featureId - b.userData.featureId || a.geometry.attributes.position.count - b.geometry.attributes.position.count);
    meshes.forEach(m => { nm++; const a = new Uint8Array(m.geometry.attributes.position.array.buffer, m.geometry.attributes.position.array.byteOffset, m.geometry.attributes.position.array.byteLength); for (let i = 0; i < a.length; i++) { h ^= a[i]; h = Math.imul(h, 16777619) >>> 0; } });
    return { rows: r.length ? r[0].values.map(v => v.join(':')).join(',') : '', meshes: nm, meshHash: h.toString(16) };
  }, ids);
  const key = async (k) => { await Dr.blurAll(pg); await pg.keyboard.down('Control'); await pg.keyboard.press(k); await pg.keyboard.up('Control'); };
  const settle = async () => { await t.sleep(600); await Dr.idle(t, 20000); };
  // GUIDE_OUT=<dir>: one tight frame of the history bar per guide step (docs/ModellerFirstSteps.md Part 5), from THIS run
  const gshot = async (name) => { if (!process.env.GUIDE_OUT) return; const r = await pg.evaluate(() => { const b = document.getElementById('universal-hist-btns'); if (!b) return null; const q = b.getBoundingClientRect(); return { x: q.left, y: q.top, w: q.width, h: q.height }; });
    if (!r) return; const pad = 10, x = Math.max(0, r.x - pad), y = Math.max(0, r.y - pad);
    await pg.screenshot({ path: require('path').join(process.env.GUIDE_OUT, name + '.png'), clip: { x, y, width: Math.min(1400 - x, r.w + 2 * pad), height: Math.min(900 - y, r.h + 2 * pad) } }); console.log('  §GUIDE-SHOT ' + name + ' ' + Math.round(r.w) + 'x' + Math.round(r.h)); };

  // ── interleaved edits ────────────────────────────────────────────────────────
  const cands = await Dr.wallCandidates(t);
  const hosting = cands.filter(c => c.riders.length);
  let A = null, rowsA = null, preA = null, postA = null;
  for (const c of hosting) { const f = [c.fid].concat(c.riders); const p0 = await centres(f); rowsA = await Dr.moveByGizmo(t, c.fid, 0.4); if (rowsA && rowsA.length >= 2) { A = c; preA = p0; postA = await centres(f); break; } }
  const walkLine = await Dr.walk(t, 'ELEC');
  const walkRows = await pg.evaluate(() => { const s = (window.__dwRowsByDisc || {}).ELEC; return s ? s.walk.concat(s.chain, s.fit) : []; });
  let B = null, rowsB = null, preB = null, Dd = null;
  await pg.evaluate(() => window.Bonsai.select(null)); await pg.click('#b-fit'); await t.sleep(1000);
  const hostingB = (await Dr.wallCandidates(t)).filter(c => c.riders.length);   // re-read after Fit: the visible top-40 set moved with the camera
  console.log('  §SCOPED B candidates=' + JSON.stringify(hostingB.map(c => c.fid)));
  for (const c of hostingB) {
    if (A && c.fid === A.fid) continue;
    const f = [c.fid].concat(c.riders); const p0 = await centres(f);
    rowsB = await Dr.moveByGizmo(t, c.fid, -0.3);
    if (rowsB && rowsB.length >= 2) { B = c; preB = p0; break; }
  }
  const insId = await Dr.insertOne(t);
  let rowsD = null;
  if (B) for (const d of B.riders) { rowsD = await Dr.moveByGizmo(t, d, 0.2); if (rowsD && rowsD.length) { Dd = d; break; } }
  console.log('  §SCOPED edits A=' + (A && A.fid) + '+' + JSON.stringify(A && A.riders) + ' rows=' + (rowsA || []).length + ' walkRows=' + walkRows.length + ' (' + (walkLine || 'no walk').slice(0, 60) + ') B=' + (B && B.fid) + '+' + JSON.stringify(B && B.riders) +
    ' rows=' + (rowsB || []).length + ' insert=' + insId + ' door=' + Dd + ' rows=' + JSON.stringify((rowsD || []).map(r => r.op_type + '#' + r.id + '(' + (r.p.induced || 'p' + r.p.parent) + ')')));
  if (!A || !B || !Dd || !insId || !walkRows.length) { console.log('W-HISTORY-SCOPED-UNDO: INCONCLUSIVE — the interleaved real edits did not all land; nothing judged'); t.assert('S0 EDITS (A, walk, B, insert, door-on-B all landed by real input)', false, 'INCONCLUSIVE'); return; }
  const fidsA = [A.fid].concat(A.riders), fidsB = [B.fid].concat(B.riders);
  const untouched = walkRows.concat([insId]);
  const fp0 = await fp(untouched);
  const snap0 = await rowsSnap();
  const L0 = await Dr.line(t); L0.forEach(e => console.log('    line seq=' + e.seq + ' "' + e.label + '" cats=' + e.cats.join('+') + ' els=' + JSON.stringify(e.els)));
  console.log('  §SCOPED untouched rows=' + untouched.length + ' meshes=' + fp0.meshes + ' meshHash=' + fp0.meshHash + ' chain=' + await chain());

  // ── scope: expand Walls + tap its strip ──────────────────────────────────────
  await gshot('first-steps-thread1-chips');
  const pt = async (sel) => pg.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
  { const p = await pt('#hist-thr-chips .hist-thr-chip[data-thr-cat="Walls"]'); if (p) { await pg.mouse.click(p[0], p[1]); await pg.mouse.click(p[0], p[1], { clickCount: 2 }); await t.sleep(250); } }
  await gshot('first-steps-thread2-strip');
  { const p = await pt('#hist-thr-strips .hist-thr-strip[data-thr-cat="Walls"]:not([data-thr-el]) span'); if (p) { await pg.mouse.click(p[0], p[1]); await t.sleep(250); } }
  await gshot('first-steps-thread3-glow');
  const sc = await pg.evaluate(() => window.HistoryBar.getScope());
  console.log('  §SCOPED scope=' + JSON.stringify(sc));
  if (!sc || sc.cat !== 'Walls') { t.assert('S0 SCOPE (Walls strip tapped → scope on)', false, JSON.stringify(sc)); return; }

  // ── S1 refuse ────────────────────────────────────────────────────────────────
  const n1 = t.slog.length, len1 = snap0.length;
  await key('KeyZ'); await settle();
  const ref = t.slog.slice(n1).find(l => /§THREAD_UNDO_REFUSE/.test(l)) || '';
  const note = await pg.evaluate(() => { const n = document.getElementById('hist-thr-note'); return n ? n.textContent : null; });
  const len1b = (await rowsSnap()).length;
  const seqD = L0.filter(e => e.els && e.els.includes(Dd)).slice(-1)[0];
  console.log('  §SCOPED S1 app: ' + ref.slice(0, 300) + ' | note=' + note + ' | rows ' + len1 + '→' + len1b);
  t.assert('S1 REFUSE (Ctrl+Z on Walls → wall B refused, its dependent door move NAMED via R1 host/filling; 0 rows appended)',
    /dependents=1 /.test(ref) && !!seqD && ref.indexOf('(seq ' + seqD.seq + ')') >= 0 && /R1 host\/filling/.test(ref) && len1b === len1 && !!note && /blocked by/.test(note), ref.slice(0, 160));
  await t.shot('scoped-refused'); await gshot('first-steps-thread4-refused');

  // ── S2 cascade ───────────────────────────────────────────────────────────────
  if (!SKIP) { const p = await pt('#hist-thr-badge .hist-thr-act[data-act="cascade"]'); if (p) { await pg.mouse.click(p[0], p[1]); } await settle(); }
  const cB = await centres(fidsB.concat(B.riders.includes(Dd) ? [] : [Dd]));
  const fp2 = await fp(untouched), ch2 = await chain();
  const und2 = t.slog.filter(l => /§THREAD_UNDO scope=/.test(l)).slice(-1)[0] || '';
  const resB = maxRes(cB, preB, fidsB);
  console.log('  §SCOPED S2 app: ' + und2.slice(0, 260) + ' | B residual vs pre-B=' + resB.toExponential(2) + ' per-fid=' + JSON.stringify(Object.fromEntries(fidsB.map(f => [f, +D(cB[f], preB[f]).toExponential(2)]))) + ' untouched meshHash ' + fp0.meshHash + '→' + fp2.meshHash + ' chain=' + ch2);
  t.assert('S2 CASCADE ("Undo all" → ONE appended gesture reverts the door move + wall B + riders: all at pre-B ≤1e-6 m; walk+insert byte-identical; chain ok)',
    /cascade=\[/.test(und2) && resB < 1e-6 && fp2.rows === fp0.rows && fp2.meshHash === fp0.meshHash && fp2.meshes === fp0.meshes && ch2 === true, 'res=' + resB.toExponential(2));
  await t.shot('scoped-cascade'); await gshot('first-steps-thread5-cascade');

  // ── S3 scoped undo of A ──────────────────────────────────────────────────────
  await key('KeyZ'); await settle();
  const cA = await centres(fidsA), resA = maxRes(cA, preA, fidsA), fp3 = await fp(untouched), ch3 = await chain();
  const und3 = t.slog.filter(l => /§THREAD_UNDO scope=/.test(l)).slice(-1)[0] || '';
  const unt = t.slog.filter(l => /§THREAD_DEP_UNTRACKED/.test(l)).slice(-1)[0] || '';
  console.log('  §SCOPED S3 app: ' + und3.slice(0, 220) + ' | ' + unt.slice(0, 160) + ' | A residual vs pre-A=' + resA.toExponential(2) + ' meshHash=' + fp3.meshHash + ' chain=' + ch3);
  t.assert('S3 SCOPED-A (2nd Ctrl+Z → wall A + riders at pre-A ≤1e-6 m; walk+insert byte-identical; chain ok)',
    und3.indexOf('target="Move') >= 0 && und3.indexOf('#' + A.fid) >= 0 && resA < 1e-6 && fp3.rows === fp0.rows && fp3.meshHash === fp0.meshHash && ch3 === true, 'res=' + resA.toExponential(2));

  // ── S4 append-only ───────────────────────────────────────────────────────────
  const snap4 = await rowsSnap();
  const prefixSame = snap0.every((r, i) => snap4[i] === r);
  console.log('  §SCOPED S4 rows ' + snap0.length + '→' + snap4.length + ' prefixIdentical=' + prefixSame);
  t.assert('S4 APPEND (every pre-existing row unchanged — id, op_hash, parameters, undone; only new rows appended)', prefixSame && snap4.length > snap0.length, snap0.length + '→' + snap4.length);

  // ── S5 scoped redo ───────────────────────────────────────────────────────────
  await key('KeyY'); await settle();
  const cA5 = await centres(fidsA), res5 = maxRes(cA5, postA, fidsA), ch5 = await chain();
  const red5 = t.slog.filter(l => /§THREAD_REDO scope=/.test(l)).slice(-1)[0] || '';
  console.log('  §SCOPED S5 app: ' + red5.slice(0, 220) + ' | A residual vs post-A=' + res5.toExponential(2) + ' chain=' + ch5);
  t.assert('S5 REDO (Ctrl+Y → wall A + riders back at post-A ≤1e-6 m; chain ok)', /re-applied/.test(red5) && res5 < 1e-6 && ch5 === true, 'res=' + res5.toExponential(2));
  await t.shot('scoped-redo');

  // ── S6 exit + global undo ────────────────────────────────────────────────────
  await Dr.blurAll(pg); await pg.keyboard.press('Escape'); await t.sleep(300);
  const sc6 = await pg.evaluate(() => window.HistoryBar.getScope());
  await gshot('first-steps-thread6-exit');
  const lastGid = await pg.evaluate(() => window.Bonsai.oplog.db.exec('SELECT gid FROM kernel_ops ORDER BY id DESC LIMIT 1')[0].values[0][0]);
  const before6 = await pg.evaluate(g => window.Bonsai.oplog.db.exec("SELECT COUNT(*), SUM(undone) FROM kernel_ops WHERE gid='" + g + "'")[0].values[0], lastGid);
  const undAll0 = await pg.evaluate(() => window.Bonsai.oplog.db.exec('SELECT SUM(undone) FROM kernel_ops')[0].values[0][0]);
  await key('KeyZ'); await settle();
  const after6 = await pg.evaluate(g => window.Bonsai.oplog.db.exec("SELECT COUNT(*), SUM(undone) FROM kernel_ops WHERE gid='" + g + "'")[0].values[0], lastGid);
  const undAll1 = await pg.evaluate(() => window.Bonsai.oplog.db.exec('SELECT SUM(undone) FROM kernel_ops')[0].values[0][0]);
  const cA6 = await centres(fidsA), res6 = maxRes(cA6, preA, fidsA), ch6 = await chain();
  console.log('  §SCOPED S6 scope=' + JSON.stringify(sc6) + ' last gid=' + lastGid + ' rows/undone ' + before6 + '→' + after6 + ' total undone ' + undAll0 + '→' + undAll1 + ' A residual vs pre-A=' + res6.toExponential(2) + ' chain=' + ch6 + ' app: ' + (t.slog.filter(l => /§OPLOG undo/.test(l)).slice(-1)[0] || '').slice(0, 140));
  t.assert('S6 EXIT+GLOBAL (Esc → scope off; global Ctrl+Z undoes exactly the last gesture: its rows undone, wall A at pre-A, chain ok)',
    !sc6 && after6[1] === after6[0] && before6[1] === 0 && (undAll1 - undAll0) === after6[0] && res6 < 1e-6 && ch6 === true, 'undone ' + undAll0 + '→' + undAll1);

  t.slog.filter(l => /§THREAD/.test(l)).slice(-16).forEach(l => console.log('    app: ' + l.slice(0, 260)));
}, { width: 1400, height: 900, dpr: 1, url: URL_ });
