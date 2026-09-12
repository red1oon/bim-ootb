#!/usr/bin/env node
// WITNESS — W-SCHED-COHERE — persisted kernel_ops vs the schedule they claim to come from
// Spec: bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §88.9 / §88.10 / §88.12.
//
// ISSUE THIS PROVES OR DISPROVES:
//   §88's missing 8,899 m² Hospital ground floor was caused by 28 Level 1 "Foundation" walls whose
//   op carries phase='Substructure' and _cell='L0·T1·L0' (sequence 1) while its _task says
//   TASK_Architecture_Envelope_Level_1 — a bucket that runs AFTER the slab those walls carry. Filed
//   correctly they finish 5.4 days BEFORE it; filed as they are, `maxCarrierEnd` lands 13.47 h past
//   the slab, §XRAY_STAGING_REMOVED correctly refuses to draw an unsupported floor, and no log
//   anywhere says why.
//
//   Nothing re-derives it. `injectGantt()` sits behind `if (!_placeOps.length)` in _activateAsync,
//   so a shipped 4D DB never re-runs it (0 §GANTT_SOURCE lines in any bake, browser or CLI), and
//   the only staleness gate — `_genVersion !== _GANTT_CACHE_VERSION` — asks whether the current
//   ALGORITHM produced the ops, never whether they still agree with tasks/task_elements. Once
//   written, a misassignment is replayed forever.
//
//   ⚠ WHY THIS IS A WITNESS AND NOT A CHECK INSIDE THE BAKE (user ruling, 2026-09-12: "bake follows
//   4D timeline and not has extra script to it"). The silent bake PLAYS the 4D timeline; it is not
//   the place to grow a second opinion about it. An audit living in cli_silent_bake.js would also
//   have to re-type the phase/task semantics, which is the "a re-typed predicate tests itself" trap
//   §88.9 was itself caught by. Read-only, DB-only, no GPU, runs in under a second per building.
//
// GATES (all REPORTED; only G-SC-SELF is blocking, and only against a recorded baseline):
//   G-SC-SELF    ops whose OWN `phase` contradicts their OWN `_task` bucket. No judgement about
//                which table is authoritative is needed — the op disagrees with itself. Hospital's
//                measured count is 39 (28 Substructure→Architecture_Envelope + 11
//                Architecture→Superstructure). BASELINE=<n> fails only on an INCREASE.
//   G-SC-TE      ops whose `_task` matches no `task_elements` row for that guid. Reported, never
//                blocking: on Hospital 13,546 of these are a one-storey band shift where the OP is
//                the better witness (it matches elements_meta.storey 7,491 times, task_elements 0)
//                — see §88.10d. Counting them is useful; judging them here would be wrong.
//   G-SC-CARRY   the payload gate: for each IfcSlab, in-extent structural carriers beneath it whose
//                op finishes AFTER the slab's. This is the number that becomes an invisible floor.
//
// Command (from the worktree root):
//   node viewer/tests/witness_schedule_coherence.js [building ...]
//   BLD_DIR=~/bim-ootb/buildings BASELINE=39 node viewer/tests/witness_schedule_coherence.js Hospital_silent
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const initSqlJs = require(path.join(os.homedir(), 'bim-ootb', 'node_modules', 'sql.js'));
const SQLJS_DIST = path.join(os.homedir(), 'bim-ootb', 'node_modules', 'sql.js', 'dist');
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
const BASELINE = process.env.BASELINE === undefined ? null : +process.env.BASELINE;

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const rows = (db, sql) => { try { const r = db.exec(sql); return r.length ? r[0].values : []; } catch (e) { return []; } };

// §OG_BEARING_BOUND constants, same as _buildXraySupportCache's.
const EPS = 0.05, GAP = 0.5;

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.join(SQLJS_DIST, f) });
  let names = process.argv.slice(2);
  if (!names.length) names = fs.readdirSync(BLD_DIR).filter(f => f.endsWith('.db')).map(f => f.replace(/\.db$/, ''));
  let fail = 0, checked = 0;

  for (const name of names) {
    const p = path.join(BLD_DIR, name + '.db');
    if (!fs.existsSync(p)) { console.log(`§W-SCHED-COHERE SKIP ${name} — no DB at ${p}`); continue; }
    let db;
    try { db = new SQL.Database(new Uint8Array(fs.readFileSync(p))); }
    catch (e) { console.log(`§W-SCHED-COHERE SKIP ${name} — unreadable (${e.message})`); continue; }
    if (!rows(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='kernel_ops'").length) {
      console.log(`§W-SCHED-COHERE SKIP ${name} — no kernel_ops (not a 4D DB)`); db.close(); continue;
    }
    checked++;

    const ops = rows(db, "SELECT output_guid, timestamp, parameters FROM kernel_ops " +
                         "WHERE op_type='ELEMENT_PLACE' AND undone=0 AND output_guid IS NOT NULL");
    if (!ops.length) { console.log(`§W-SCHED-COHERE VACUOUS ${name} — 0 ELEMENT_PLACE rows, nothing to audit`); db.close(); continue; }

    const te = {};
    rows(db, 'SELECT task_id, guid FROM task_elements').forEach(r => { (te[r[1]] = te[r[1]] || []).push(r[0]); });
    const haveTe = Object.keys(te).length > 0;

    const end = {}, phase = {};
    let selfContra = 0, noTeMatch = 0;
    const contraKinds = {}, samples = [];
    for (const [guid, ts, par] of ops) {
      let o; try { o = JSON.parse(par) || {}; } catch (e) { continue; }
      end[guid] = o._end_ts || (ts + 60000);
      phase[guid] = o.phase || null;
      const t = o._task || '', i = t.lastIndexOf('_Level_');
      if (o.phase && i > 0) {
        const tph = t.slice(5, i);
        if (norm(tph) !== norm(o.phase)) {
          selfContra++;
          const k = o.phase + ' -> ' + tph;
          contraKinds[k] = (contraKinds[k] || 0) + 1;
          if (samples.length < 3) samples.push(`${guid} phase=${o.phase} _task=${t}`);
        }
      }
      if (haveTe && t && !(te[guid] || []).includes(t)) noTeMatch++;
    }

    const selfOk = BASELINE === null ? true : selfContra <= BASELINE;
    console.log(`§W-SCHED-COHERE G-SC-SELF ${selfOk ? 'PASS' : 'FAIL'} ${name} ops=${ops.length} ` +
      `selfContradictory=${selfContra}${BASELINE === null ? ' (no BASELINE — reported only)' : ' baseline=' + BASELINE}`);
    for (const k of Object.keys(contraKinds).sort((a, b) => contraKinds[b] - contraKinds[a]))
      console.log(`§W-SCHED-COHERE   kind ${contraKinds[k]}  ${k}`);
    samples.forEach(s => console.log(`§W-SCHED-COHERE   first ${s}`));
    if (!selfOk) fail++;

    console.log(`§W-SCHED-COHERE G-SC-TE ${name} taskElementsMismatch=` +
      (haveTe ? noTeMatch : 'n/a (no task_elements)') + ' — reported, never blocking (§88.10d)');

    // ── G-SC-CARRY: in-extent structural carriers that finish after the slab they carry ─────────
    // Carrier pool mirrors §PROMOTED_CARRIER_POOL: seq<=4 u IfcSlab. seq comes from the OP's own
    // phase (the classifier result already stored on it), not a re-typed class table — the whole
    // point of §88.9's lesson. Substructure/Superstructure phases are the structural tiers.
    const STRUCT = new Set(['substructure', 'superstructure']);
    const els = rows(db, 'SELECT m.guid, m.ifc_class, COALESCE(t.center_z,0), COALESCE(t.bbox_z,0), ' +
      'COALESCE(t.center_x,0), COALESCE(t.center_y,0), COALESCE(t.bbox_x,0), COALESCE(t.bbox_y,0) ' +
      'FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid')
      .map(r => ({ guid: r[0], cls: r[1], base: r[2] - r[3] / 2, top: r[2] + r[3] / 2,
                   x0: r[4] - r[6] / 2, x1: r[4] + r[6] / 2, y0: r[5] - r[7] / 2, y1: r[5] + r[7] / 2 }));
    const carriers = els.filter(e => e.cls === 'IfcSlab' || STRUCT.has(norm(phase[e.guid])));
    let lateTotal = 0, slabsHit = 0, worstH = 0, worstGuid = null;
    for (const T of els) {
      if (T.cls !== 'IfcSlab' || end[T.guid] === undefined) continue;
      let late = 0, worst = 0;
      for (const S of carriers) {
        if (S === T || end[S.guid] === undefined) continue;
        if (!(S.base < T.base - EPS && S.top >= T.base - GAP)) continue;
        if (S.top > T.top + GAP) continue;                       // enveloping, tier-2 only
        if (!(S.x0 <= T.x1 && S.x1 >= T.x0 && S.y0 <= T.y1 && S.y1 >= T.y0)) continue;
        if (end[S.guid] > end[T.guid]) { late++; worst = Math.max(worst, end[S.guid] - end[T.guid]); }
      }
      if (late) { slabsHit++; lateTotal += late;
        if (worst > worstH) { worstH = worst; worstGuid = T.guid; } }
    }
    console.log(`§W-SCHED-COHERE G-SC-CARRY ${name} slabsWithLateCarriers=${slabsHit} lateCarriers=${lateTotal}` +
      (worstGuid ? ` worst=${worstGuid} by ${(worstH / 3600000).toFixed(2)}h` : '') +
      ' — each of these is a slab §XRAY_STAGING_REMOVED will hold back as unsupported');
    db.close();
  }

  console.log(`§W-SCHED-COHERE VERDICT ${fail === 0 ? 'PASS' : 'FAIL'} buildingsChecked=${checked} blockingFailures=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})();
