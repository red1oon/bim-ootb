// time_machine family — part `lifecycle_api` (original time_machine.js lines 8974–10557).
// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/time_machine.json). Below the `yield` every
// statement is the original text; the only edit is that a name owned by ANOTHER part is reached as TMS.name.
// Edit this file normally from now on; regenerate only to re-split a branch that still edits the old single file.
(typeof window !== 'undefined' ? window : globalThis).__timeMachineParts = (typeof window !== 'undefined' ? window : globalThis).__timeMachineParts || {};
(typeof window !== 'undefined' ? window : globalThis).__timeMachineParts.lifecycle_api = function* __split_time_machine_lifecycle_api(TMS) {
  'use strict';
  // phase 1 — publish this part's names that other parts use (same function objects; vars as live accessors)
  TMS.cacheGet = cacheGet;
  TMS.cachePut = cachePut;
  TMS.viewerStatus = viewerStatus;
  TMS.deactivate = deactivate;
  TMS.refoldSchedule = refoldSchedule;
  yield;   // phase 2 resumes here, in this same scope: the original statements, in original order
   // §CHAINAGE_LEVELS + §CHAINAGE_V2 (2026-10-06, CIVIL_HIGHWAY_JELAPANG.md §CHAINAGE_V2) — a civil programme cached before chainage levels climbs by storey height (lamps first on a road+bridge merge); regenerate. Buildings regenerate once to an identical programme (no lvlSec). Previous: 40 §CIVIL_TRADES (2026-10-05, bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §Q.2) — a civil programme saved before the per-discipline crews carries ONE crew (MASON) and serial finishing; user saw "only one resource in play". Buildings regenerate once to an identical programme (cache_4d_run fleet before/after identical). Previous: 39 §STOREY_DATUM_FRAME (2026-09-03) — see above. Previous: 38 §TM_REVEAL_TILED (2026-09-02) — kernel_ops timestamps are now tiled inside each bar (CPM order, own-duration width) instead of the per-task affine; a v37 IDB entry still carries the affine layout (dead air 44-71% of every bar), regenerate
  // was 37:   // §S51 item d — ops now carry the cell stamp (_cell) so the Gantt groups by the schedule's own cells; pre-§S51 kernel_ops lack it, regenerate
  // was 28:   // §CPM_DISPLAY (2026-08-16): display timeline authored by the one-DAG CPM pass
  // was 27:   // §ZONE_DISPLAY_AUTHORING (2026-08-16): task windows authored from
                                   // the DISPLAY timeline + strict-bar sweep skipped on that path —
                                   // one schedule for movie and Gantt. Bump re-materializes stale
                                   // authored Gantts + regenerates kernel_ops under the new windows.
                                   // Prior: 26 §CROSSTASK_JUDGE_PARITY (2026-08-16): window-bounded judge-rule
                                   // repair after _ogSupportSweep — captured floating 3090 -> 656.
                                   // Prior: 25 §OG_HANG_UNBOUND (2026-08-15): _ogSupportSweep's hang repair
  // now searches unbounded above (was capped 9.5m) — a kernel_ops table materialized under v24 or
  // earlier keeps replaying elements left floating that this version now repairs.
  // §GANTT_GAP_CLAMP_SPREAD (2026-08-15): the per-task rescale's
  // gap-clamp+pad spread changes every element's display date — a kernel_ops table materialized
  // under v23 or earlier keeps replaying the old value-based-only positions forever without this
  // bump, regardless of the code fix being deployed.
  // §OG_HANG_BAND (2026-08-15): _ogSupportSweep's hang-repair search
  // radius widened 0.5m->9.5m (see that function's own header) — a kernel_ops table materialized
  // under v21 or earlier keeps replaying the narrower-band repair's (more-floating) dates forever
  // without this bump, regardless of the code fix being deployed.
  // v22->23: §OG_HANG_WINDOW_BOUND — the widened hang-repair now refuses a push that would land an
  // element outside its own task's authored window (see _ogSupportSweep's own header). A kernel_ops
  // table materialized under v22 keeps the wider-but-window-violating dates (up to 79d off on
  // LTU_AHouse) without this bump.
  // §GANTT_TASK_WINDOW_FIDELITY (2026-08-15): the captured overlay's
  // affine changed from ONE global rescale to a PER-TASK rescale — every element's placement moves,
  // on every building with a captured/materialized schedule. A kernel_ops table materialized under
  // v20 replays the old global-affine dates forever without this bump. Previous: §CAP_SHADOW_FIX
  // (2026-08-15): every kernel_ops materialized under
  // v19 or earlier was ALWAYS produced by the crash-fallback path (injectGantt's `_cap` overlay could
  // never run — see the fix note ~30 lines below, at the `_capacityCd` rename). Its data is not wrong
  // (the fallback used the already-correct generative timeline), but nobody has ever actually seen the
  // captured/native-IFC-schedule overlay run. Bump so every session regenerates once under the fixed
  // code and that path finally gets exercised for real, not silently skipped forever. Previous:
  // §TIER_REGATE_WORKLIST (2026-08-14): _tierAuditRegate rewritten full-array-rescan -> worklist/dirty-queue, A/B'd byte-identical on all 7 buildings (scripts/probe_tier_regate_worklist.js) but the ALGORITHM changed, so a building materialized under v18 must be regenerated to pick up the new code path even though its output is provably the same. Previous: §STAIR_FLIGHT_GRID_VISIBILITY (2026-08-14, 4D_SCHEDULE_PERFECTION.md SESSION 6): IfcStairFlight elements are now real geoGate/DAG support sources (schedule_gate.js structIdxGrid/grid) — previously invisible to anything resting on them (a mid-landing, a floor above), so the raw generative schedule this repair chain runs on changed for every building with stairs of this shape. HHS's Day-50 landing report closes near-exactly (FINAL display gap -40.85d -> -0.11d). A building materialized under v17 replays the old (stair-support-blind) order forever regardless of deployed code without this bump.
  // v16: §TIER2_PER_ELEMENT_CLAMP + §SHIFT_HOURS (2026-08-13): _twoTierRemap's Tier-2 push is now a per-element clamp to t1EndZ[z] instead of a uniform zone shift (MEP Final occupancy 22%->~69-105%, no more dead-air window inflation), and the real generation path now runs the crew's shift at rates.js SHIFT_HOURS (default 24, was hardcoded 8) — user ruling: "24hr is our default, import and JSON setting can import as we align to standard model". MEASURED Hospital totalDays 2019.6(v15, live) -> 369.2 (v16, all 7 buildings shrank 1.7x-5.5x, see prompts/4D_SCHEDULE_PERFECTION.md).
                                   // v14 was §CURTAIN_WALL_OPENING (2026-08-12): openingGate gained a curtain-wall fallback pool (IfcCurtainWall/IfcPlate/IfcMember) for openings with no IfcWall* host — HHS_Office_Federated had 34 of 133 openings ungated, Level 3's glass doors starting up to 9.5d before the façade they sit in. computeSchedule's gating changed ⇒ this constant MUST move with it, or a building already materialized under v13 replays the ungated order forever. NOTE this landed as v13 on its own branch and became v14 on merge: §ARCH_START_TEMPO/M1 (#1323) took v13 concurrently. Two independent gating changes on the same day = two bumps, never a shared one — the whole point of the constant is that a cache entry maps to exactly one algorithm.
                                   // v13 was §ARCH_START_TEMPO / M1 (2026-08-12): the 8-hour crew day. schedule_gate.js place() no longer spends installSecs as continuous 24-h wall clock — a crew gets 8 productive hours per calendar day (24/7 calendar unchanged) and the rest rolls over — so EVERY generated start/end moves and the programme is ~3x longer. A building materialized under v12 replays the old 24-h-shift timeline forever, no matter what code is deployed.
                                   // v12 was §HOSTED_BEFORE_HOST (2026-08-12, #1319): hostGate added to computeSchedule — a hosted element now waits for its host's finish. Missed on first landing (this constant's own v11 comment says "MUST bump on every change to computeSchedule's gating", and #1319 changed exactly that, same day, without bumping it) — a building materialized under v11 kept replaying the pre-fix order regardless of deployed code. This bump is that fix's second half.
                                   // v11 was §MIDAIR_REPAIR (2026-08-12): display times repaired so nothing appears before the first element it touches
                                   // v10 was §DOOR_WINDOW_HOST_WALL (2026-08-11): door/window gated on its host wall's finish (schedule_gate.js openingGate)
                                   // v9 was §TIER_SERIAL (2026-08-11): two-tier display remap (serial backbone + concurrent pool)
                                  // v7 was §4D_BAND_MONOTONIC (2026-08-02): PASS B cross-storey trade gate
  //                                 changes generated ordering for 35,484 non-structure elements.
  //                                 MUST bump: #1123 exists because a stale cache once stopped a
  //                                 sequencing fix reaching a browser, and the user has already been
  //                                 observed running new code against cached old ops.

  function _cacheKey(prefix) {
    var app = TMS.A();
    var bld = (app && app.activeBuilding) || 'unknown';
    // §HR_COST_CACHE_HIT (bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md item 8): 'hrCost' is derived
    // from the exact same injectGantt() generation run as 'gantt', so it shares that run's version
    // stamp — a _GANTT_CACHE_VERSION bump invalidates both together, never one without the other.
    var v = (prefix === 'gantt' || prefix === 'hrCost') ? ('v' + TMS._GANTT_CACHE_VERSION + ':') : '';
    return prefix + ':' + v + bld;
  }

  // Read JSON from IDB cache. Returns parsed object or null.
  function cacheGet(prefix) {
    return new Promise(function(resolve) {
      var app = TMS.A();
      if (!app || !app.openCacheDB) { resolve(null); return; }
      app.openCacheDB().then(function(cacheDb) {
        if (!cacheDb) { resolve(null); return; }
        var key = _cacheKey(prefix);
        var tx = cacheDb.transaction(app.CACHE_STORE, 'readonly');
        var req = tx.objectStore(app.CACHE_STORE).get(key);
        req.onsuccess = function() {
          var val = req.result;
          if (val && typeof val === 'string') {
            try { resolve(JSON.parse(val)); } catch(e) { resolve(null); }
          } else { resolve(null); }
        };
        req.onerror = function() { resolve(null); };
      }).catch(function() { resolve(null); });
    });
  }

  // Write JSON to IDB cache.
  function cachePut(prefix, data) {
    var app = TMS.A();
    if (!app || !app.openCacheDB) return;
    // LARGE_DB_BAKE.md §2 L2 — a bake profile is disposable; nothing it writes here is ever read
    // back by a later session, so skip it rather than pay an IDB round trip for no benefit.
    if (app._bakeOwned) { console.log('§CACHE_SKIP key=' + _cacheKey(prefix) + ' reason=bake'); return; }
    app.openCacheDB().then(function(cacheDb) {
      if (!cacheDb) return;
      var key = _cacheKey(prefix);
      var json = JSON.stringify(data);
      var tx = cacheDb.transaction([app.CACHE_STORE, 'timestamps'], 'readwrite');
      tx.objectStore(app.CACHE_STORE).put(json, key);
      tx.objectStore('timestamps').put(Date.now(), key);
      console.log('§CACHE_PUT key=' + key + ' size=' + (json.length / 1024).toFixed(0) + 'KB');
    }).catch(function(e) { console.warn('§CACHE_PUT_ERR ' + e.message); });
  }

  // Delete a cached JSON key (e.g. the stale 'gantt' fast-path) so cacheGet() returns null and activate()
  // recomputes from the live tables. Used by tmRefoldSchedule after an external 4D edit.
  function cacheDel(prefix) {
    var app = TMS.A();
    if (!app || !app.openCacheDB) return;
    app.openCacheDB().then(function(cacheDb) {
      if (!cacheDb) return;
      var key = _cacheKey(prefix);
      var tx = cacheDb.transaction(app.CACHE_STORE, 'readwrite');
      tx.objectStore(app.CACHE_STORE).delete(key);
      console.log('§CACHE_DEL key=' + key);
    }).catch(function(e) { console.warn('§CACHE_DEL_ERR ' + e.message); });
  }

  // §TM-REFOLD core: drop the cached schedule so the NEXT activate() re-reads the (possibly just-edited)
  // tasks table via injectGantt's _cap, instead of replaying the stale kernel_ops ELEMENT_PLACE fast-path.
  // Returns the count of place-ops cleared. db is sql.js (app.db); the witness drives the same API.
  function _invalidateSchedule(db) {
    if (!db) return 0;
    var n = 0;
    try {
      var r = db.exec("SELECT COUNT(*) FROM kernel_ops WHERE op_type='ELEMENT_PLACE'");
      n = (r.length && r[0].values.length) ? r[0].values[0][0] : 0;
      db.run("DELETE FROM kernel_ops WHERE op_type='ELEMENT_PLACE'");
    } catch (e) { /* no kernel_ops table → nothing to invalidate */ }
    return n;
  }

  // §KERNEL_OPS_SCHED_AGREE (2026-09-12, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md
  // §SCHED_TASK_BUCKET_SPLIT_BRAIN) — DOES THIS PERSISTED SCHEDULE STILL AGREE WITH THIS DB?
  //
  // §KERNEL_OPS_SCHED_VERSION below asks "were these ops produced by the current ALGORITHM?". It
  // never asks "are they still TRUE OF the model they sit in?", and those are different questions.
  // Measured consequence: Hospital_silent.db ships 63,415 ELEMENT_PLACE rows stamped _genVersion=39
  // against _GANTT_CACHE_VERSION=39, so they are adopted verbatim — yet its `tasks`/`task_elements`
  // tables were RE-AUTHORED after those ops were captured, so 13,574 of them (21.4%) carry a `_task`
  // that matches no task_elements row for their own guid, and the op calendar (2026-09-10..2027-07-17)
  // sits 233 days outside the task calendar (2026-01-01..2026-11-26) even though the DB's own
  // schedules.display_authored=1 asserts the task windows are VIEWS of these very element times.
  // 28 of those mis-bucketed rows are Level 1 foundation walls that carry an 8,899 m² ground slab and
  // are scheduled 13.47 h AFTER it, so §XRAY_STAGING_REMOVED correctly refuses to draw the floor.
  // Re-deriving (verified in a real browser: §GANTT_SOURCE, staged 544→501, slab leaves staging, wall
  // returns to TASK_Substructure_Level_1, span becomes 1/10/2026→11/26/2026) produces the right answer
  // — the TABLES are right, only the frozen answer is wrong.
  //
  // Deliberately NOT fixed by bumping _GANTT_CACHE_VERSION: that is a one-shot data patch. It
  // discards every user's warm gantt:v39:* entry fleet-wide (correct ones included) and leaves the
  // hole open, so the next re-authoring of `tasks` freezes a wrong answer again at v40. This makes
  // the staleness decision a property of the DB instead of a constant a human must remember to bump.
  //
  // TWO INDEPENDENT CLAUSES, both cheap, both measured to flag Hospital and NOT to flag a building
  // whose ops are correct (HHS_Office_Federated_silent: 0/6,880 task-link mismatches, op window
  // inside its task window):
  //   B-WIN  armed only when schedules.display_authored=1 — that flag IS the DB asserting the task
  //          windows are views of these element times, so containment must hold by construction.
  //          One MIN/MAX over the dated leaf tasks + one pass over ops already parsed in memory.
  //   B-TE   a SAMPLE of ops must have a task_elements row for their own guid and _task. One
  //          `guid IN (…)` query, so the cost is bounded by the sample, not by model size (loading
  //          the whole 63,415-row map costs 72 ms in sql.js and is not affordable per activate).
  //          At Hospital's 21.4% defect rate a sample of 50 detects in 2000/2000 trials.
  // ⚠ This NEVER rewrites an op from task_elements — a disagreement only triggers RE-DERIVATION by
  // the shipped verb. On the 13,546 one-storey shifts the OP is the better witness (it matches
  // elements_meta.storey 7,491 times, task_elements 0), so copying one table over the other would
  // repair 28 rows and break 13,546. Freshly derived ops measure 0/63,415 on B-TE and land inside the
  // task window, so neither clause re-fires and there is no derive-every-activate loop.
  var _AGREE_SAMPLE = 64;                    // ops sampled for B-TE (evenly spaced, deterministic)
  var _AGREE_WINDOW_SLACK_MS = 86400000;     // `tasks` bounds are DATE-only; allow a day either side

  function _schedOpsAgreementFail(db, placeOps) {
    if (!db || !placeOps || !placeOps.length) return '';
    var _t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    var reason = '', detail = '', winMs = 0, teMs = 0;
    try {
      // ── B-WIN ──────────────────────────────────────────────────────────────────────────────────
      var _da = 0;
      try {
        var r0 = db.exec('SELECT MAX(display_authored) FROM schedules');
        if (r0.length && r0[0].values.length && r0[0].values[0][0] != null) _da = r0[0].values[0][0] | 0;
      } catch (e) { _da = 0; }   // pre-§ZONE_DISPLAY_AUTHORING DB: no column, clause simply not armed
      if (_da === 1) {
        var r1 = db.exec('SELECT MIN(schedule_start), MAX(schedule_finish) FROM tasks ' +
          'WHERE schedule_start IS NOT NULL AND (is_summary IS NULL OR is_summary=0)');
        if (r1.length && r1[0].values.length && r1[0].values[0][0] && r1[0].values[0][1]) {
          var tS = Date.parse(r1[0].values[0][0]), tE = Date.parse(r1[0].values[0][1]);
          if (isFinite(tS) && isFinite(tE)) {
            var oS = Infinity, oE = -Infinity;
            for (var i = 0; i < placeOps.length; i++) {
              var pp = placeOps[i].parameters || {};
              var s = placeOps[i].start_ts, e = pp._end_ts;
              if (typeof s === 'number' && s < oS) oS = s;
              if (typeof e === 'number' && e > oE) oE = e;
            }
            if (isFinite(oS) && isFinite(oE) &&
                (oS < tS - _AGREE_WINDOW_SLACK_MS || oE > tE + _AGREE_WINDOW_SLACK_MS)) {
              reason = 'window';
              detail = ' ops=' + new Date(oS).toISOString().slice(0, 10) + '..' + new Date(oE).toISOString().slice(0, 10) +
                ' tasks=' + r1[0].values[0][0] + '..' + r1[0].values[0][1] +
                ' (display_authored=1 asserts these are the same window)';
            }
          }
        }
      }
      winMs = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - _t0;
      // ── B-TE ───────────────────────────────────────────────────────────────────────────────────
      if (!reason) {
        var step = Math.max(1, Math.floor(placeOps.length / _AGREE_SAMPLE));
        var want = {}, list = [], n = 0;
        for (var j = 0; j < placeOps.length && list.length < _AGREE_SAMPLE; j += step) {
          var o = placeOps[j], par = o.parameters || {};
          if (!o.output_guid || !par._task) continue;            // generated (uncaptured) op: no bucket to check
          if (/['\\]/.test(o.output_guid)) continue;             // IFC guids never contain these; skip rather than quote
          want[o.output_guid] = par._task; list.push(o.output_guid); n++;
        }
        if (n) {
          var got = {};
          var r2 = db.exec("SELECT guid, task_id FROM task_elements WHERE guid IN ('" + list.join("','") + "')");
          if (r2.length) for (var k = 0; k < r2[0].values.length; k++) {
            var g = r2[0].values[k][0];
            (got[g] = got[g] || []).push(r2[0].values[k][1]);
          }
          var bad = 0, firstBad = '';
          for (var g2 in want) {
            if (!got[g2] || got[g2].indexOf(want[g2]) < 0) {
              bad++;
              if (!firstBad) firstBad = g2 + ' _task=' + want[g2] + ' task_elements=' + JSON.stringify(got[g2] || null);
            }
          }
          if (bad) {
            reason = 'taskLink';
            detail = ' sampled=' + n + ' mismatched=' + bad + ' first ' + firstBad;
          }
        }
      }
      teMs = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - _t0 - winMs;
    } catch (e) {
      // A DB that cannot answer the question is never called stale on that account — an agreement
      // test that fails OPEN would re-derive every building with a missing table on every activate.
      console.log('§KERNEL_OPS_SCHED_AGREE unavailable (' + e.message + ') — agreement clause skipped');
      return '';
    }
    console.log('§KERNEL_OPS_SCHED_AGREE ops=' + placeOps.length +
      ' winMs=' + winMs.toFixed(1) + ' teMs=' + teMs.toFixed(1) +
      ' totalMs=' + (winMs + teMs).toFixed(1) +
      ' verdict=' + (reason || 'agrees') + detail);
    return reason;
  }

  // §KERNEL_OPS_SCHED_VERSION (2026-08-11): pure predicate, no db/window — placeOps materialized
  // under an OLDER schedule-generation algorithm (missing/mismatched _genVersion stamp) must never
  // be silently reused. currentVersion is _GANTT_CACHE_VERSION, passed in rather than closed over so
  // this stays independently testable (same idiom as _tier1Extents/_tier1Serialize below).
  // §KERNEL_OPS_SCHED_AGREE (2026-09-12): agreementFail is likewise PASSED IN, already computed by
  // _schedOpsAgreementFail above — this predicate stays pure, with no db or window of its own, so
  // witness_kernel_ops_sched_version.js can keep slicing and calling it in a bare vm sandbox.
  function _kernelOpsSchedStale(placeOps, currentVersion, agreementFail) {
    if (!(placeOps && placeOps.length && placeOps[0].parameters)) return false;
    if (placeOps[0].parameters._genVersion !== currentVersion) return true;
    return !!agreementFail;
  }

  // ── Activate / Deactivate ──
  function setToolbarHighlight(on) {
    var btn = document.getElementById('time-machine-btn');
    if (btn) btn.style.background = on ? '#1a6b8a' : '#444';
  }

  function viewerStatus(msg) {
    var app = TMS.A();
    if (app && app.status) app.status.textContent = msg;
  }

  var _s4ActT0 = 0;   // §S4_ACTIVATION_TIMING — shared with _finishActivate below (measure-first, additive only)
  // §CPE_BUILDUP_ACTIVATE_POPS_PANEL (2026-08-25, bim-compiler prompts/CINEMA_PATH_EDITOR.md):
  // silent=true loads the schedule DATA only, never touches the panel DOM — for tmActivateForBake,
  // per G-CPE-SOLE-OWNER ("only a real Play opens Time Machine"). Every other caller passes
  // nothing, so silent is falsy and behavior is byte-identical to before this flag existed.
  function activate(silent) {
    var _L = (typeof TMS._tmTrl === 'function') ? TMS._tmTrl : function (k, en, r) { var s = en; if (r) for (var q in r) s = s.replace('{' + q + '}', r[q]); return s; };   // S226 §R2b — sliced into vm sandboxes by witnesses
    if (TMS._active) return;
    _s4ActT0 = performance.now();
    TMS._lastEdit = null;   // §GANTT_EDIT_UNDO — a stale snapshot from a prior building must never apply here
    TMS._ganttAutoGenAttempted = false;   // §GANTT_EDIT_LOCK — allow one fresh auto-generate attempt
    TMS._ganttSelected = {}; TMS._marquee = null; TMS._groupDrag = null;   // §GANTT_GROUP_MOVE — stale selection from a prior building must never apply here
    // §MERGED_GUID: TM mutates elements individually (setMatrixAt/setVisibleAt per slot), which a
    // merged buffer cannot do — so TM re-streams unmerged. Two corrections to the old trigger:
    //   (1) condition is _mergeActive (are merged meshes ACTUALLY in the scene), not _isMobile.
    //       Since 68bd9a7 killed the merge routing, `_isMobile` re-streamed the WHOLE building on
    //       every mobile TM open for nothing; and with merging now capability-gated rather than
    //       device-gated, a no-multi_draw DESKTOP has merged meshes too and needs the same unmerge.
    //   (2) _forceNoMerge makes the re-stream stick — flipping _isMobile no longer disables merging
    //       (the gate is A._hasMultiDraw), so without this flag the re-stream would just re-merge.
    // ONE-SHOT: if a re-stream somehow still produced merged meshes, activate normally rather than
    // re-streaming forever. Belt-and-braces against the loop described above — a spinning
    // clearStreamed/streamBuilding cycle is a far worse failure than TM opening with merged geometry.
    var app = TMS.A();
    if (app && app._mergeActive && !app._tmUnmergeTried) {
      app._tmUnmergeTried = true;
      app._forceNoMerge = true;
      var bld = app.activeBuilding;
      console.log('§TM_UNMERGE re-streaming ' + (bld || '?') + ' without merge (TM needs per-element slots)');
      // §TM_UNMERGE duration (2026-08-12, CPE_4D_PERF_MEM_FINDINGS.md §3c R4 part (c)): this
      // branch re-streams the WHOLE building on the first-Play click path — a cost that scales with
      // building size and, until this line, was invisible in every witness that pre-streams
      // unmerged. Unmeasured, it hides inside "first Play felt slow".
      var _umT0 = performance.now();
      app.clearStreamed();
      if (bld) { app.streamBuilding(bld); }
      // Wait for re-stream to finish, then activate
      var _reWait = setInterval(function() {
        if (app.buildingsRendered && app.buildingsRendered.size > 0 && !app.streaming) {
          clearInterval(_reWait);
          console.log('§TM_UNMERGE done bld=' + (bld || '?') + ' ms=' + (performance.now() - _umT0).toFixed(1));
          activate(silent);
        }
      }, 500);
      return;
    }
    var st = null;
    if (!silent) {
      setToolbarHighlight(true);
      TMS._panel.style.display = 'flex';
      st = document.getElementById('tm-status');
      if (st) st.textContent = _L('tm_loading_timeline', 'Loading timeline...');
    }

    // §S260c: Try IDB cache first, then kernel_ops table, then full recompute
    _activateAsync(st, silent).then(function(ok) {
      if (!ok && !silent) { setToolbarHighlight(false); TMS._panel.style.display = 'none'; return; }
    });
    return; // async continuation below
  }

  function _activateAsync(st, silent) {
    var _L = (typeof TMS._tmTrl === 'function') ? TMS._tmTrl : function (k, en, r) { var s = en; if (r) for (var q in r) s = s.replace('{' + q + '}', r[q]); return s; };   // S226 §R2b — sliced into vm sandboxes by witnesses
    return new Promise(function(resolve) {
    var app = TMS.A();

    // §S260c: Check IDB for cached Gantt JSON
    cacheGet('gantt').then(async function(cachedOps) {   // §GANTT_REFOLD_HANG: awaits chunked injectGantt
      // §S260e: Only use cache if it has ELEMENT_PLACE ops (not just picks)
      var _hasCachedPlaces = cachedOps && cachedOps.length > 0 &&
        cachedOps.some(function(o) { return o.op_type === 'ELEMENT_PLACE'; });
      // §GANTT_STALE_CACHE (2026-08-08, 4D_SCHEDULE_PERFECTION.md §GANTT_DOUBLE_LOAD warm-open
      // variant, live user log on Terminal): #1237 fixed the COLD path only. A warm open serves
      // cached ops here, but bar editability is a DB join (tasks/task_elements) and the DB is
      // re-fetched fresh every session with no schedule tables in it — so bars resolve editable=0,
      // drawGanttMini's auto-generate fires, and tmRefoldSchedule() throws the entire cached pass
      // away and re-runs the full chain: the exact double load, resurrected through the cache
      // branch, on EVERY warm open until schedule persistence lands. Same cure as #1237: when the
      // DB behind the cache has no schedule, the cache is stale by construction — drop it and take
      // the cold path's single pass (prematerialize → one injectGantt → recache).
      if (_hasCachedPlaces) {
        var _act = null;
        try {
          var _SAx = (typeof window !== 'undefined') && window.ScheduleAuthor;
          _act = (_SAx && _SAx.activeSchedule) ? _SAx.activeSchedule(app.db) : null;
        } catch (e) { _act = null; }
        if (!_act) {
          console.log('§GANTT_STALE_CACHE ops=' + cachedOps.length +
            ' but no schedule in DB — dropping cache, taking the single-pass cold path');
          cacheDel('gantt');
          _hasCachedPlaces = false;
        }
      }
      // §KERNEL_OPS_SCHED_AGREE (2026-09-12) — kernel_ops HAS TWO HOMES and this branch is the other
      // one. It returns before the persisted-table branch below is ever reached, DELETE+INSERTing the
      // cached JSON over the DB's rows, so gating only the table would leave this home able to serve a
      // frozen answer the table can no longer serve. Same predicate, same question: is this cache
      // still TRUE OF this db? (A cache whose absence changes the answer is not a cache.)
      if (_hasCachedPlaces) {
        var _cachedPlaces = cachedOps.filter(function(o) { return o.op_type === 'ELEMENT_PLACE'; });
        var _cacheAgreeFail = _schedOpsAgreementFail(app.db, _cachedPlaces);
        if (_cacheAgreeFail) {
          console.log('§GANTT_STALE_CACHE ops=' + cachedOps.length + ' agreementFail=' + _cacheAgreeFail +
            ' — cached schedule no longer agrees with this DB, dropping cache and re-deriving');
          cacheDel('gantt');
          _hasCachedPlaces = false;
        }
      }
      if (_hasCachedPlaces) {
        // Fast path: inject cached JSON into kernel_ops table
        console.log('§GANTT_CACHE_HIT ops=' + cachedOps.length);
        var db = app.db;
        db.run('CREATE TABLE IF NOT EXISTS kernel_ops (' +
          'id INTEGER PRIMARY KEY, timestamp INTEGER NOT NULL,' +
          'op_type TEXT NOT NULL, parameters TEXT NOT NULL,' +
          'input_guids TEXT, output_guid TEXT, undone INTEGER DEFAULT 0)');
        db.run("DELETE FROM kernel_ops WHERE op_type = 'ELEMENT_PLACE'");
        db.run('BEGIN');
        var stmt = db.prepare('INSERT INTO kernel_ops (timestamp,op_type,parameters,input_guids,output_guid,undone) VALUES(?,?,?,?,?,0)');
        for (var i = 0; i < cachedOps.length; i++) {
          var op = cachedOps[i];
          stmt.run([op.start_ts, op.op_type, JSON.stringify(op.parameters), JSON.stringify(op.input_guids), op.output_guid]);
        }
        stmt.free();
        db.run('COMMIT');
        TMS._ops = TMS.loadOps(); TMS._ganttDirty = true;
        if (st) st.textContent = '';
        viewerStatus('Time Machine: ' + TMS._ops.length + ' elements (cached)');
        // §HR_COST_CACHE_HIT (bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md item 8): this fast path
        // never runs injectGantt(), so A()._hrCost (§HR_COST_EXPOSE) is never computed here — restore
        // the value injectGantt already computed and cached the last time it actually ran (see
        // §HR_COST_CACHE_SAVE above). If nothing was ever cached (cache written before this fix
        // shipped, or this is the very first activation), leave A()._hrCost unset — the two
        // cost/labour cards in cpe_resource_panel.js's A.bigStatsBuild stay correctly DROPPED per
        // its own "a card whose source is missing is DROPPED, never filled with a plausible number"
        // rule. Nothing is recomputed or invented on this path — a pure cache restore.
        var _cachedHrCost = await cacheGet('hrCost');
        if (_cachedHrCost && _cachedHrCost.total > 0) {
          app._hrCost = _cachedHrCost;
          console.log('§HR_COST_CACHE_HIT total=' + _cachedHrCost.total + ' personDays=' + _cachedHrCost.personDays +
            ' trades=' + _cachedHrCost.trades);
        } else {
          console.log('§HR_COST_CACHE_MISS — no cached hrCost for this schedule; cost/labour cards stay dropped until the next cold regenerate');
        }
        _finishActivate(app, silent);
        resolve(true);
        return;
      }

      // No cache — try loading existing kernel_ops
      TMS._ops = TMS.loadOps(); TMS._ganttDirty = true;
      // §S260e: Only count ELEMENT_PLACE ops — ignore picks/other ops
      var _placeOps = TMS._ops.filter(function(o) { return o.op_type === 'ELEMENT_PLACE'; });
      if (_placeOps.length && !_placeOps[0].parameters._end_ts) {
        try { app.db.run("DELETE FROM kernel_ops WHERE op_type = 'ELEMENT_PLACE'"); } catch(e) {}
        _placeOps = [];
        console.log('§TIME_MACHINE cleared stale unweighted ops — will re-inject');
      }
      // §KERNEL_OPS_SCHED_VERSION (2026-08-11): a building opened before this session's fix to the
      // schedule-generation algorithm (e.g. §TIER2_AFTER_TIER1) has kernel_ops ELEMENT_PLACE rows
      // materialized from the OLD algorithm, cached inside this building's IndexedDB-cached DB blob.
      // _GANTT_CACHE_VERSION already gates the separate 'gantt' JSON cache but never this table, so a
      // fixed schedule algorithm silently never reached an already-opened building — reported live:
      // HHS_Office_Federated still showing MEP Rough-in starting 20.8d before Architecture finished,
      // §TIER_SERIAL's own witness (which reads the freshly-recomputed _disp, not kernel_ops) could
      // not have caught it. Stamp+check closes the same gap _end_ts's check closes for schema shape.
      // §KERNEL_OPS_SCHED_AGREE (2026-09-12): …and the second question the stamp cannot answer —
      // do these rows still agree with THIS db's tasks/task_elements? See the long note on
      // _schedOpsAgreementFail. Computed here so the predicate itself stays pure.
      var _agreeFail = _schedOpsAgreementFail(app.db, _placeOps);
      if (_kernelOpsSchedStale(_placeOps, TMS._GANTT_CACHE_VERSION, _agreeFail)) {
        try { app.db.run("DELETE FROM kernel_ops WHERE op_type = 'ELEMENT_PLACE'"); } catch(e) {}
        console.log('§KERNEL_OPS_SCHED_VERSION stale genVersion=' + _placeOps[0].parameters._genVersion +
          ' current=' + TMS._GANTT_CACHE_VERSION + ' agreementFail=' + (_agreeFail || 'none') +
          ' — cleared ' + _placeOps.length + ' ops, will re-inject');
        _placeOps = [];
      }
      if (_placeOps.length) { TMS._ops = _placeOps; TMS._ganttDirty = true; }
      console.log('§TM_OPS_CHECK total=' + TMS._ops.length + ' place=' + _placeOps.length);

      if (!_placeOps.length) {
        if (st) st.textContent = _L('tm_setting_up', 'Setting up 4D construction timeline...');
        viewerStatus('Time Machine: generating construction schedule...');
        // §GANTT_SINGLE_LOAD (4D_SCHEDULE_PERFECTION.md §GANTT_DOUBLE_LOAD): a cold open used to run
        // injectGantt TWICE — pass 1 with no schedule (placeholder dates, task_id-less ops), then
        // drawGanttMini's §GANTT_EDIT_LOCK auto-materialize called tmRefoldSchedule(), which threw
        // pass 1 away (deactivate + cacheDel + re-activate) and ran the ENTIRE chain again. Now the
        // native schedule is materialized FIRST, so the single injectGantt run absorbs it, bars carry
        // real task_ids, and the auto-generate branch never fires. refoldSchedule() itself is
        // untouched — its external-edit caller (4D_SCHED_EDIT in main.js) still needs the round-trip.
        console.log('§S4_ACTIVATION_TIMING_MID beforeMaterializeNative=' + (performance.now() - _s4ActT0).toFixed(0));
        await TMS._load4DTemplate();   // §TPL_WIRED — before the first materialize, not after
        TMS._materializeNativeSchedule(app);
        console.log('§S4_ACTIVATION_TIMING_MID afterMaterializeNative=' + (performance.now() - _s4ActT0).toFixed(0));
        if (!(await TMS.injectGantt())) {
          if (st) st.textContent = _L('tm_no_elements_db', 'No elements found in database');
          viewerStatus('Time Machine: no elements found');
          console.log('§TIME_MACHINE no ops and no elements — nothing to show');
          resolve(false);
          return;
        }
        console.log('§S4_ACTIVATION_TIMING_MID afterInjectGantt=' + (performance.now() - _s4ActT0).toFixed(0));
        TMS._ops = TMS.loadOps(); TMS._ganttDirty = true;
        console.log('§S4_ACTIVATION_TIMING_MID afterLoadOps=' + (performance.now() - _s4ActT0).toFixed(0) + ' n=' + TMS._ops.length);
        if (!TMS._ops.length) { resolve(false); return; }
        // §S260c: Cache the newly computed schedule to IDB
        cachePut('gantt', TMS._ops);
        // §HR_COST_CACHE_HIT (bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md item 8): injectGantt()
        // just populated A()._hrCost (§HR_COST_EXPOSE, :4936) — persist it alongside the ops it was
        // derived from, so the NEXT open (the common §GANTT_CACHE_HIT fast path, which never runs
        // injectGantt at all) can restore it instead of leaving cpe_resource_panel.js's two 5D cards
        // permanently dropped. Cache only what injectGantt already computed — nothing recomputed here.
        if (TMS.A()._hrCost) {
          cachePut('hrCost', TMS.A()._hrCost);
          console.log('§HR_COST_CACHE_SAVE total=' + TMS.A()._hrCost.total + ' personDays=' + TMS.A()._hrCost.personDays);
        }
        console.log('§S4_ACTIVATION_TIMING_MID afterCachePut=' + (performance.now() - _s4ActT0).toFixed(0));
        console.log('§GANTT_CACHE_SAVE ops=' + TMS._ops.length);
        viewerStatus('Time Machine: ' + TMS._ops.length + ' elements scheduled');
      }

      // §HR_COST_PERSISTED — runs after BOTH branches, on purpose. On a building that regenerated
      // (a fresh IFC drop, or one whose ops were judged stale) injectGantt has already set _hrCost,
      // and this call becomes a CHECK: §HR_COST_AGREE compares the two and says WRONG if they
      // differ. On a building that kept its saved programme, injectGantt never ran and this is the
      // only thing that can cost it. Read-only either way — it writes no op, task or row.
      try { TMS._hrCostEnsure(app, _placeOps.length); } catch (eHC) { console.log('§HR_COST_PERSISTED hook threw: ' + eHC.message); }

      _finishActivate(app, silent);
      resolve(true);
    }).catch(async function(e) {   // §GANTT_REFOLD_HANG: awaits chunked injectGantt in the fallback
      // §GANTT_CACHE_ERR_STACK (2026-08-12) — this handler wraps the WHOLE async activate body
      // (cache read, _materializeNativeSchedule, injectGantt, loadOps, cachePut), so a message
      // alone cannot say which. Live user report: "Cannot read properties of undefined (reading
      // '3iM76qwej9Tf9ttHcbQp2z')" — a GUID used as a key on an undefined object, recovered by the
      // fallback below (TM still opened with 63,416 ops) but with no way to locate it. Log the
      // stack and the phase so the next occurrence names its own line.
      console.warn('§GANTT_CACHE_ERR ' + e.message + ' | phase=' + (TMS._ops && TMS._ops.length ? 'post-loadOps' : 'pre-loadOps') +
        ' | stack=' + String(e && e.stack || '(none)').split('\n').slice(0, 4).join(' << ') +
        // §KERNEL_OPS_SCHED_AGREE (2026-09-12): the line above promises the next occurrence will name
        // itself, and it did not — a silent-bake cold derive on Hospital logged `undefined | stack=(none)`
        // because sql.js throws a bare STRING ("Statement closed"), which has neither .message nor
        // .stack. One occurrence cost a whole diagnosis round. Print what a non-Error throw actually is.
        ' | thrown type=' + (typeof e) + ' value=' + String(e));
      // Fallback: compute without cache
      TMS._ops = TMS.loadOps(); TMS._ganttDirty = true;
      if (!TMS._ops.length) { await TMS._load4DTemplate(); TMS._materializeNativeSchedule(TMS.A()); await TMS.injectGantt(); TMS._ops = TMS.loadOps(); TMS._ganttDirty = true; }  // §GANTT_SINGLE_LOAD, same as the main path (await: loadOps must see the chunked writes)
      if (TMS._ops.length) { _finishActivate(app, silent); resolve(true); }
      else resolve(false);
    });
    });
  }

  function _finishActivate(app, silent) {
    // §DLOD_TM_OWNERSHIP (2026-09-04, PHOTOREAL_STILL_RENDER.md §BME.8): dlod.js must hand every
    // instance matrix back (its own hides restored while its refs are still real) BEFORE this
    // module's lazy _savedInstanceMatrices reads them, and stay down until deactivate(). One owner.
    TMS._dlodPausedByTm = false;
    if (app && typeof app.dlodDisable === 'function' && app._dlodEnabled) { app.dlodDisable('time-machine'); TMS._dlodPausedByTm = true; }
    TMS._active = true;
    app._tmOn = true;  // exposed for pill isActive highlight (panels.js 'tm' entry)
    // §TM_GI_AUTO RETIRED (2026-07-18, user: "its up to user to turn Shadow, G and audio"):
    // was auto-engaging Alt+G N8AO on every TM open with no opt-out — the one auto-forced effect
    // among Shadow/GI/Audio (the other two were already correctly user-choice-only, see
    // §TM_SUN_INHERIT/§TM_SHADOW_INHERIT below — "Don't force sun cycle — respect user's
    // shadow/sky choice"). Alt+G is now consistent with that: purely a manual keypress, same as
    // before #836 ever existed. _tmEnabledGI/the matching deactivate() auto-off stay defined
    // (now permanently false/no-op) rather than ripped out — a manual Alt+G press during TM still
    // needs deactivate() to leave it alone exactly like it already does for shadow/sky.
    TMS._tmEnabledGI = false;
    TMS._activeBuildingCount = app.activeBuildingTotal || 0;
    TMS._isLargeBuilding = TMS._activeBuildingCount > TMS.LARGE_BUILDING;
    if (TMS._isLargeBuilding) console.log('§S259_TM_LITE elements=' + app.activeBuildingTotal + ' — sparks disabled (>50K)');
    // TM_DLOD_SCALE.md §3: engage gate is size-based — pill only offers itself on large buildings.
    // A building switch below threshold also resets the toggle (never silently carries proxy state
    // into a small building where DLOD_TM_MIN_ELEMENTS wouldn't gate it anyway).
    if (!TMS._isLargeBuilding) TMS._dlodProxyOn = false;
    // §DLOD_BAKE_PROXY (2026-09-19, LARGE_DB_BAKE.md §8.3 L8c) — the draw-cost proxy already
    // exists, already works, and is reachable only by clicking `tm-lod`, which a headless bake can
    // never do. So the one thing most likely to cut large-building bake time has never been
    // measured in a bake. This lets a bake ask for it (`--tap` sets window.__dlodProxyBake), and
    // ONLY under the same large-building gate the button itself obeys — no new threshold, no new
    // behaviour, nothing changed for any interactive user or any bake that does not ask.
    if (TMS._isLargeBuilding && typeof window !== 'undefined' && window.__dlodProxyBake) {
      TMS._dlodProxyOn = true; window.__dlodProxyEngaged = true;   // W7: read by the film's end-of-bake NO-OP verdict
      console.log('§DLOD_BAKE_PROXY on — requested by the bake tap, large-building gate passed');
    }
    var _lodBtnGate = document.getElementById('tm-lod');
    if (_lodBtnGate) {
      _lodBtnGate.style.display = TMS._isLargeBuilding ? '' : 'none';
      _lodBtnGate.classList.toggle('tm-active', TMS._dlodProxyOn);
    }
    console.log('§DLOD_TM_GATE bld="' + (app.activeBuilding || '?') + '" elements=' + TMS._activeBuildingCount +
      ' threshold=' + TMS.DLOD_TM_MIN_ELEMENTS + ' large=' + TMS._isLargeBuilding);
    // §S280: Don't force sun cycle — respect user's shadow/sky choice
    // User can toggle shadow (H) independently. TM just plays construction.
    console.log('§TM_SUN_INHERIT shadowOn=' + !!app._shadowOn + ' sky=' + !!app._sky + ' sunCycle=user-choice');
    console.log('§TM_SHADOW_INHERIT shadowOn=' + !!app._shadowOn + ' groundVisible=' + (app.ground ? app.ground.visible : 'n/a'));
    // §Z_STACK_XRAY_STAGING — (re)build the support-edge cache on EVERY activation, not only a
    // fresh generate: runs on the §GANTT_CACHE_HIT fast path too (injectGantt never executes
    // there), so this is the ONE place, keyed off the _ops that actually ended up loaded regardless
    // of source (generated fallback or captured IFC 4D — schedMap is read from _ops, not from
    // injectGantt's own locals). Read-only: one SELECT + one pass over _ops, no db writes.
    // §S4_ACTIVATION_TIMING (measure-first, additive only) — the ~10s tail AFTER injectGantt()
    // returns (loadOps/cachePut/_finishActivate) was completely unmeasured before this; bracket it.
    var _s4fa = [];
    function _s4faMark(l) { _s4fa.push(l + '=' + (performance.now() - _s4ActT0).toFixed(0)); }
    _s4faMark('finishActivateStart');
    TMS._tmRebuildXrayCache();
    _s4faMark('xrayCache');
    TMS.computeDays();
    _s4faMark('computeDays');
    TMS.saveVisibility();
    // §S262: DLOD runs independently — camera distance drives promote/demote, TM drives visibility. No pause needed.
    console.log('§MOBILE_TM_TOGGLE method=setVisibleAt|setMatrixAt mobile=' + !!app._isMobile + ' dlod=' + !!app._useDlodPath);
    TMS._anchorDay = TMS._days.length ? TMS._days[TMS._days.length - 1] : null;
    TMS._anchorHr = 15;
    // §CPE_BUILDUP_ACTIVATE_POPS_PANEL: everything below this line is panel DOM/canvas work — the
    // bake path (silent=true) needs only _ops/_projectStart/_projectEnd, already populated above by
    // computeDays(). Skipping it here means Alt+C's bake never shows, draws into, or fetches for a
    // TM panel the user never asked to see; cinema_maxq drives the real per-frame render itself via
    // tmSetCursor()→renderAtTime(), so the initial renderAtTime(_projectEnd) below would be thrown
    // away by that first frame anyway.
    if (silent) {
      _s4faMark('silentSkipPanel');
      console.log('§TIME_MACHINE ON (silent, bake-owned) — ' + TMS._ops.length + ' ops, ' + TMS._days.length +
        ' days, project: ' + new Date(TMS._projectStart).toLocaleDateString() + ' → ' + new Date(TMS._projectEnd).toLocaleDateString());
      return;
    }
    TMS._panel.style.display = 'flex';
    TMS.switchMode('DAY');
    TMS.renderAtTime(TMS._projectEnd); // §S260c: initial render so Gantt + status populate immediately
    _s4faMark('renderAtTime');
    TMS.updateStatus();
    if (TMS._ganttVisible) TMS.drawGanttMini();
    _s4faMark('ganttMini');
    if (TMS._dashVisible) TMS.drawDashboard();
    _s4faMark('dashboard');
    console.log('§S4_ACTIVATION_TIMING_FINISH ' + _s4fa.join(' ') + ' totalSinceActivate=' + (performance.now() - _s4ActT0).toFixed(0));
    // §S2 — the ⚖ variance drawer only offers itself when this building HAS a folded twin (a C_Project with the
    // PlannedAmt↔CommittedAmt pair). No twin → no button, no drawer (user: "don't trigger it when no such info").
    TMS._loadTwin().then(function (t) {
      var vb = document.getElementById('tm-var');
      if (vb) vb.style.display = t ? '' : 'none';
      console.log('§TM_VAR_GATE building="' + ((app && app.activeBuilding) || '?') + '" twin=' + (t ? 'yes' : 'no') + ' ⚖=' + (t ? 'shown' : 'hidden'));
    });
    console.log('§TIME_MACHINE ON — ' + TMS._ops.length + ' ops, ' + TMS._days.length + ' days, ' +
      'project: ' + new Date(TMS._projectStart).toLocaleDateString() + ' → ' + new Date(TMS._projectEnd).toLocaleDateString());
  }

  function deactivate() {
    if (!TMS._active) return;
    TMS.stopPlayback();
    TMS.clearSparks();
    TMS._gspClear();   // §GROUP_SPARK: nothing may survive TM being switched off
    // §TM_OVERLAY_SYNC (see renderAtTime): null = "TM is off". Same contract as _gspClear above —
    // nothing TM imposed on a presentation overlay may survive TM being switched off, otherwise a
    // name plate stays hidden in the finished building because the scrub happened to end early.
    if (window.__tmOverlaySync) { try { window.__tmOverlaySync(null); } catch (e) {} }
    TMS._evMesh = null; TMS._evSig = ''; TMS._incrPrimed = false;   // §PERF_INCR: drop the event index
    TMS._tmXraySolidifyTs = {}; TMS._tmXrayStagedTotal = 0; TMS._tmXraySolidifiedN = 0;  // §Z_STACK_XRAY_STAGING: nothing may survive TM being switched off
    TMS._dlodDisposeBoxes(); TMS._dlodProxyOn = false; TMS._lastProxyEngaged = null; TMS._dlodLastCamSig = null; // §DLOD_TM: nothing may survive TM being switched off
    var _lodBtnOff = document.getElementById('tm-lod'); if (_lodBtnOff) _lodBtnOff.classList.remove('tm-active');
    TMS.restoreSky();
    TMS._sunCycle = false;
    TMS._camFollow = false;
    TMS._camAngle = 0;
    TMS._camTarget = null;
    TMS._cineStoryboard = [];
    if (TMS._bgBuildRaf) { cancelAnimationFrame(TMS._bgBuildRaf); TMS._bgBuildRaf = 0; }
    TMS._cineSceneIdx = 0;
    TMS._cineHeroSlowdown = false;
    TMS._cineEstabStart = null; TMS._cineEstabEnd = null;
    TMS.restorePeeled();
    // §S260b: Only hide ground if Sunglass shadow was OFF
    var app = TMS.A();
    if (app && app.ground && !app._shadowOn) app.ground.visible = false;
    TMS._ganttVisible = false;
    TMS._dashVisible = false;
    TMS._sCurveData = null;
    TMS._shopfloor = null; TMS._shopfloorLoading = false;    // §E2b: invalidate shopfloor cache on building change
    TMS._ganttTasks = [];
    TMS._ganttTasksComputed = false; TMS._ganttRebuildN = 0;   // §S58: ordinal is per building
    TMS._ganttCritical = {}; TMS._cpmPrimed = false;          // §S68: CPM marks are per building too
    TMS._tmCpmLegend(null);                               // §S75: and so is the legend that explains them
    TMS.invalidateGanttModel();   // K0: building changed → drop the cached task index + bar rollup
    var ganttBtn = document.getElementById('tm-gantt');
    if (ganttBtn) ganttBtn.classList.remove('tm-active');
    var ganttBox = document.getElementById('tm-gantt-box');
    if (ganttBox) ganttBox.classList.remove('open');
    // §TM-VARIANCE: reset the drawer state on deactivate (the twin cache is kept — it's read-only).
    TMS._varVisible = false; TMS._opsPlanned = null;
    var pin = document.getElementById('tm-pinpoint'); if (pin) pin.style.display = 'none';   // §S3 — clear the pinpoint callout
    var varBtn = document.getElementById('tm-var'); if (varBtn) varBtn.classList.remove('tm-active');
    var varBox = document.getElementById('tm-var-box'); if (varBox) varBox.classList.remove('open');
    TMS.toggleDashDOM(false);
    TMS._giCancelConverge();   // §TM_GI_HOLD: stop any in-flight hold-polish RAF/timer before restoring state
    // §TM_GI_RENDER restore: renderAtTime forced N8AO single-pass (accumulate off) for TM's
    // one-frame-then-park render gate. Hand it back to converged-still mode so a plain Alt+G outside
    // Time Machine regains its multi-frame accumulation quality. Reset the once-per-session log latch too.
    if (app && app._giN8aoPass && app._giN8aoPass.configuration) app._giN8aoPass.configuration.accumulate = true;
    TMS.renderAtTime._giLogged = false;
    // §TM_GI_AUTO off: only switch Alt+G off if TM itself turned it on — a user who engaged Alt+G
    // manually before/independently of TM keeps it on. Order matters: restore accumulate=true FIRST
    // (above) so the composer is already back in converged mode if it stays on for the manual case.
    if (TMS._tmEnabledGI && app && app._giComposerActive && typeof app.toggleGIPreview === 'function') {
      try { app.toggleGIPreview(false); console.log('§TM_GI_AUTO off (TM-owned)'); } catch (e) {}
    }
    TMS._tmEnabledGI = false;
    TMS._active = false;
    if (app) app._tmOn = false;  // exposed for pill isActive highlight (panels.js 'tm' entry)
    TMS._panel.style.display = 'none';
    setToolbarHighlight(false);
    TMS.restoreVisibility(true);  // §TM_CLOSE_RESTORE: force — nothing (incl. xray-staged ghosts) may survive TM going off
    // §DLOD_TM_OWNERSHIP: matrices are real again — dlod.js may take them back (refs rebuilt lazily).
    if (TMS._dlodPausedByTm && app && typeof app.dlodEnable === 'function' && !app._dlodEnabled) { try { app.dlodEnable(); } catch (eD) {} }
    TMS._dlodPausedByTm = false;
    // (§S262's "DLOD runs independently" is retired by §DLOD_TM_OWNERSHIP above — it did not run independently: it fought this module for the same matrices.)
    viewerStatus('');
    console.log('§TIME_MACHINE OFF — restored');
  }

  function toggle() {
    if (TMS._active) deactivate(); else activate();
  }

  // ── Auto-exit on new op ──
  var _origCommit = null;
  function hookCommitOp() {
    if (window.APP && window.APP.kernelOps && window.APP.kernelOps.commitOp) {
      _origCommit = window.APP.kernelOps.commitOp;
      window.APP.kernelOps.commitOp = function() {
        if (TMS._active) deactivate();
        return _origCommit.apply(this, arguments);
      };
    }
  }

  // ── Init ──
  function init() {
    TMS.buildPanel();
    // §S3 — listen for a sibling surface's scrub on the shared Connect bus (the modeller already speaks it).
    try { if (window.Connect && window.Connect.subscribe) window.Connect.subscribe('timeline', TMS._applyRemoteTimeline); } catch (e) {}

    // S265: TM button is now in icon pill — no longer injected into overflow
    // var toolbar = document.querySelector('#search-body > div');

    setTimeout(hookCommitOp, 2000);

    // URL param: ?tm=1 (open time machine) · ?tm=play (open + auto-play forward) ·
    //   ?pporder=<id> (PP_ORDER_ZOOM_TM_SPEC §B — deep-link to a manufacturing order's moment; implies tm=1).
    var _sp = new URLSearchParams(location.search);
    var tmParam = _sp.get('tm');
    var ppParam = _sp.get('pporder');
    if (tmParam || ppParam) {
      // Wait for DB to load before activating
      var _tmWait = setInterval(function() {
        var app = TMS.A();
        if (app && app.db && app.scene && app.buildingsRendered && app.buildingsRendered.size > 0 && !app.streaming) {
          clearInterval(_tmWait);
          activate();
          if (ppParam) {
            try { window.tmJumpToOrder(ppParam); }                  // straight to the order's construction moment
            catch (e) { console.log('§TM_ORDER_JUMP deeplink-err ' + e); }
          } else if (tmParam === 'play') {
            // Jump to start then play forward
            TMS.renderAtTime(TMS._projectStart);
            TMS.startPlayback(+1);
          }
        }
      }, 500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.toggleTimeMachine = toggle;

  // §TM-REFOLD (W-TM-REFOLD): rebuild the 4D from the LIVE tasks table after an external schedule edit
  // (the bim_4d 4D_SCHED_EDIT consumer in main.js). Replaces the old toggle-off → setTimeout(toggle-on, 60ms)
  // dance, which (a) raced the async activate() on a fixed timer and (b) silently REPLAYED the stale cached
  // schedule (cacheGet('gantt') fast-path + reused kernel_ops) so the edit never showed. This invalidates the
  // stale gantt cache + kernel_ops places first, then re-activates off the synchronous deactivate() — no timer.
  // No-op (returns false) if the Time Machine is closed. _expose for the witness too.
  function refoldSchedule() {
    var wasActive = TMS._active;
    if (TMS._active) deactivate();
    cacheDel('gantt');
    cacheDel('hrCost');   // §HR_COST_CACHE_HIT: paired lifecycle with 'gantt' — the forced cold
                          // path this triggers recomputes+re-caches both, this just keeps the two
                          // entries from disagreeing about which schedule they belong to
    var app = TMS.A();
    var cleared = (app && app.db) ? _invalidateSchedule(app.db) : 0;
    console.log('§TM_REFOLD wasActive=' + wasActive + ' clearedPlaceOps=' + cleared);
    if (wasActive) activate();   // async; injectGantt re-reads the edited tasks. No fixed-timer race.
    return wasActive;
  }
  window.tmRefoldSchedule = refoldSchedule;
  // §GANTT_RETIME_RESYNC witness hook (double-underscore debug convention, read-only intent):
  // lets witness_gantt_retime_resync.js drive the REAL ruler-shift commit path headlessly.
  window.__tmGanttShift = TMS.shiftGanttSchedule;

  // §S2 (TM_4D5D_VARIANCE_LANE) — juncture jump: land the cursor at the START of a named phase's window so the
  // scene is rendered PARTIALLY-BUILT at that moment (the IFC cost panel's "View at this moment"). The phase
  // window comes from TM's own _ops (same axis the cursor scrubs). Opens the ⚖ drawer so the cost story shows.
  // Activates TM first if needed (async). Returns a Promise<bool> (true = landed in the phase window).
  window.tmJumpToPhase = function (phaseName) {
    phaseName = String(phaseName || '');
    function doJump() {
      if (!TMS._ops.length) { console.log('§TM_JUNCTURE skip=no-ops phase="' + phaseName + '"'); return false; }
      var s = Infinity, e = -Infinity;
      for (var i = 0; i < TMS._ops.length; i++) {
        var ph = (TMS._ops[i].parameters || {}).phase || 'Architecture';
        if (ph === phaseName) { if (TMS._ops[i].start_ts < s) s = TMS._ops[i].start_ts; if (TMS._ops[i].end_ts > e) e = TMS._ops[i].end_ts; }
      }
      if (!isFinite(s)) { console.log('§TM_JUNCTURE miss phase="' + phaseName + '" (no ops in that phase)'); return false; }
      TMS.renderAtTime(s);
      try { TMS.anchorFromCursor(); } catch (x) {}
      try { TMS.configSlider(); } catch (x) {}
      // surface the cost story: open the ⚖ variance drawer (reads the twin) if it isn't already open — ONLY when
      // this building actually has a twin (no twin → no drawer; the ⚖ button is hidden anyway).
      if (TMS._twin && !TMS._varVisible) {
        TMS._varVisible = true;
        var vbtn = document.getElementById('tm-var'); if (vbtn) vbtn.classList.add('tm-active');
        var vbox = document.getElementById('tm-var-box'); if (vbox) vbox.classList.add('open');
        TMS.drawVariance();
      }
      var pct = Math.round((TMS._cursor - TMS._projectStart) / Math.max(1, TMS._projectEnd - TMS._projectStart) * 100);
      console.log('§TM_JUNCTURE phase="' + phaseName + '" cursor=' + Math.round(TMS._cursor) +
        ' winStart=' + new Date(s).toISOString().slice(0, 10) + ' built~' + pct + '% (partially built)');
      return true;
    }
    if (TMS._active) return Promise.resolve(doJump());
    var p = activate();
    return (p && p.then) ? p.then(function () { return doJump(); }) : Promise.resolve(doJump());
  };

  // §360-IDENTITY — freeze the cursor on the EXACT element the user is looking at (not just its phase).
  // The identity thread: ERP line / Find pick → guid → the op that builds it → its end_ts = the moment it
  // lands. renderAtTime broadcasts (line 1215) so the ERP tab reacts in lockstep. The point of 360 optics is
  // the STOPPED frame on the right item, with 4D (scene) + 5D (⚖ drawer) coupled — not the animation.
  window.tmJumpToElement = function (guid) {
    guid = String(guid || '');
    function doJump() {
      if (!TMS._ops.length) { console.log('§TM_PINPOINT_JUMP skip=no-ops guid="' + guid + '"'); return false; }
      var op = null;
      for (var i = 0; i < TMS._ops.length; i++) {
        var og = TMS._ops[i].output_guid || (TMS._ops[i].input_guids && TMS._ops[i].input_guids.length ? TMS._ops[i].input_guids[0] : null);
        if (og === guid) { op = TMS._ops[i]; break; }
      }
      if (!op) { console.log('§TM_PINPOINT_JUMP miss guid="' + guid + '" (no op builds it)'); return false; }
      TMS.renderAtTime(op.end_ts);                   // the instant it lands → present in the scene, the lead frontier
      try { TMS.anchorFromCursor(); } catch (x) {}
      try { TMS.configSlider(); } catch (x) {}
      if (TMS._twin && !TMS._varVisible) {                // couple the 5D cost story to the frozen frame (same as phase jump)
        TMS._varVisible = true;
        var vb = document.getElementById('tm-var'); if (vb) vb.classList.add('tm-active');
        var vx = document.getElementById('tm-var-box'); if (vx) vx.classList.add('open');
        TMS.drawVariance();
      }
      var ph = (op.parameters || {}).phase || '';
      var pct = Math.round((TMS._cursor - TMS._projectStart) / Math.max(1, TMS._projectEnd - TMS._projectStart) * 100);
      console.log('§TM_PINPOINT_JUMP guid="' + guid + '" phase="' + ph + '" cursor=' + Math.round(TMS._cursor) +
        ' at=' + new Date(op.end_ts).toISOString().slice(0, 10) + ' built~' + pct + '% (frozen on the item)');
      return true;
    }
    if (TMS._active) return Promise.resolve(doJump());
    var p = activate();
    return (p && p.then) ? p.then(function () { return doJump(); }) : Promise.resolve(doJump());
  };

  // PP_ORDER_ZOOM_TM_SPEC §B — land the TM at a manufacturing/project order's construction moment. The order
  // reaches us by IDENTITY (?pporder= / ERP Zoom-Across, never a bespoke link): PP_Order → its phase (the
  // Description token "<Phase> — <CREW>", the shared key with the gantt phase windows) → the cursor. The shopfloor
  // S-curve (dashboard) + the ⚖ variance drawer couple to the frozen frame. Honest mode: 'phase' when that phase
  // has ops on the loaded scene's axis; else 'projected' — the order's finish date mapped onto
  // [_projectStart,_projectEnd] by its position in the shopfloor span (labelled, never blurred). Returns
  // Promise<bool>. Whitebox §-log = the proof (the Hospital scene's geom lives in OPFS → live VISUAL deferred).
  window.tmJumpToOrder = function (ppOrderId) {
    ppOrderId = Number(ppOrderId);
    var app = TMS.A();
    var SQL = (app && app._SQL) || window.SQL || window._SQL_CACHED;
    function fetchOrder() {
      if (!SQL) { console.log('§TM_ORDER_JUMP skip=no-SQL order=' + ppOrderId); return Promise.resolve(null); }
      return APP.cachedFetch('../erp/ad_seed.db').then(function (buf) {
        var db = new SQL.Database(new Uint8Array(buf));
        var r = db.exec('SELECT Description, DateStartSchedule, DateFinishSchedule, C_Project_ID FROM PP_Order WHERE PP_Order_ID=' + ppOrderId);
        if (!r.length || !r[0].values.length) { db.close(); return null; }
        var row = r[0].values[0], pid = row[3];
        var c = db.exec('SELECT COALESCE(SUM(CumulatedAmt),0) FROM PP_Order_Cost WHERE PP_Order_ID=' + ppOrderId);
        // shopfloor finish-date span (the same orders the S-curve folds) → the projected-mode axis
        var sp = db.exec('SELECT MIN(o.DateFinishSchedule), MAX(o.DateFinishSchedule) FROM PP_Order o' +
          ' JOIN PP_Order_Cost oc ON o.PP_Order_ID=oc.PP_Order_ID WHERE o.C_Project_ID=' + Number(pid));
        db.close();
        return { desc: row[0], start: Date.parse(row[1]), end: Date.parse(row[2]),
                 cost: (c.length && c[0].values.length) ? Number(c[0].values[0][0]) : 0,
                 spanMin: (sp.length && sp[0].values.length) ? Date.parse(sp[0].values[0][0]) : NaN,
                 spanMax: (sp.length && sp[0].values.length) ? Date.parse(sp[0].values[0][1]) : NaN };
      }).catch(function (e) { console.log('§TM_ORDER_JUMP fetch-err ' + e.message); return null; });
    }
    function doJump(info) {
      if (!info) { console.log('§TM_ORDER_JUMP miss order=' + ppOrderId + ' (no PP_Order row)'); return false; }
      if (!TMS._ops.length) { console.log('§TM_ORDER_JUMP skip=no-ops order=' + ppOrderId); return false; }
      var phase = String(info.desc || '').split(' — ')[0].trim();   // — = em-dash, the generator's token sep
      var s = Infinity, e = -Infinity;                                    // mode=phase: this phase's window on the axis
      for (var i = 0; i < TMS._ops.length; i++) {
        var ph = (TMS._ops[i].parameters || {}).phase || 'Architecture';
        if (ph === phase) { if (TMS._ops[i].start_ts < s) s = TMS._ops[i].start_ts; if (TMS._ops[i].end_ts > e) e = TMS._ops[i].end_ts; }
      }
      var mode, _jumpTarget;
      if (isFinite(s)) { _jumpTarget = s; mode = 'phase'; }
      else {                                                             // mode=projected: order finish → axis position
        var frac = 0.5;
        if (isFinite(info.spanMin) && isFinite(info.spanMax) && info.spanMax > info.spanMin && isFinite(info.end))
          frac = Math.max(0, Math.min(1, (info.end - info.spanMin) / (info.spanMax - info.spanMin)));
        _jumpTarget = TMS._projectStart + frac * (TMS._projectEnd - TMS._projectStart);
        mode = 'projected';
      }
      TMS.renderAtTime(_jumpTarget);
      try { TMS.anchorFromCursor(); } catch (x) {}
      try { TMS.configSlider(); } catch (x) {}
      if (TMS._twin && !TMS._varVisible) {                                       // couple the 5D cost story (⚖ drawer)
        TMS._varVisible = true;
        var vb = document.getElementById('tm-var'); if (vb) vb.classList.add('tm-active');
        var vx = document.getElementById('tm-var-box'); if (vx) vx.classList.add('open');
        TMS.drawVariance();
      }
      if (!TMS._dashVisible) { TMS._dashVisible = true; try { TMS.toggleDashDOM(true); } catch (x) {} }
      try { TMS.drawDashboard(); } catch (x) {}                             // drawDashboard lazy-loads the shopfloor S-curve
      var pct = Math.round((TMS._cursor - TMS._projectStart) / Math.max(1, TMS._projectEnd - TMS._projectStart) * 100);
      console.log('§TM_ORDER_JUMP order=' + ppOrderId + ' phase="' + phase + '" mode=' + mode +
        ' cursor=' + Math.round(TMS._cursor) + ' at=' + (isFinite(TMS._cursor) ? new Date(TMS._cursor).toISOString().slice(0, 10) : '—') +
        ' cost=' + Math.round(info.cost) + ' built~' + pct + '%');
      return true;
    }
    function whenReady() {                                              // activate() is async → wait for the op-log
      return new Promise(function (resolve) {
        if (TMS._active && TMS._ops.length) { resolve(); return; }
        if (!TMS._active) activate();
        var n = 0, iv = setInterval(function () { if (TMS._ops.length || ++n > 60) { clearInterval(iv); resolve(); } }, 500);
      });
    }
    return whenReady().then(fetchOrder).then(doJump);
  };

  // S265 Phase 3: Expose TM state for share URL
  window.tmGetState = function() {
    return { active: TMS._active, cursor: TMS._cursor, projectStart: TMS._projectStart, projectEnd: TMS._projectEnd };
  };

  // §TM_OPS_SNAPSHOT (2026-08-30) — read-only, additive. §CPE_RESOURCE_PANEL needs, per calendar
  // day, which trades are working; _ops already carries exactly that (start_ts/_end_ts/resource,
  // written at :4918) and is module-private. Returns a compact copy so no caller can mutate the
  // real timeline. Nothing here derives, re-orders or re-dates anything — that is this file's job
  // and it has one already.
  window.tmOpsSnapshot = function() {
    var out = new Array(TMS._ops.length);
    for (var i = 0; i < TMS._ops.length; i++) {
      // The trade lives in `parameters`, not on the row: loadOps (:102) builds each op as
      // {id,start_ts,op_type,end_ts,parameters,input_guids,output_guid}, and injectGantt writes
      // `resource` INTO that params JSON (:4918). Reading o.resource returned undefined on every
      // op — MEASURED: §CPE_RESOURCE_PANEL withResource=0 of 16,114 on Clinic. `_end_ts` was the
      // same mistake: it is params._end_ts, already resolved into end_ts here.
      var pm = TMS._ops[i].parameters;
      out[i] = { s: TMS._ops[i].start_ts, e: TMS._ops[i].end_ts,
                 r: (pm && pm.resource) || null };
    }
    return out;
  };

  // ══ §MAXQ_TIME / §CPE_BUILDUP — drive the construction state from an external baker ═══════════
  // Spec: bim-compiler prompts/PHOTOREAL_STILL_RENDER.md §MAXQ_TIME (mode D) + prompts/
  // CINEMA_PATH_EDITOR.md §CPE_BUILDUP. User 2026-07-28: "this construction bit is a checkbox to
  // animate its buildup as cam goes along... its giving the impression and not chronologically
  // accurate. But the elements laying on each other according to its part in the 4D is educational."
  //
  // ⚠ WORDING, and it is forced by the data, not a hedge: `Terminal_Hi.db` has NO tasks/task_elements
  // tables and `Hospital_extracted.db` has them EMPTY (tasks=0). What TM synthesises is a DERIVED
  // BUILD ORDER (Z-band + SEQUENCE_RULES), never a construction programme. Say "derived build order"
  // — a BIM audience told "the schedule" will ask for the P6/MSP link, and there isn't one.
  //
  // renderAtTime() is internal by design; this is the ONE public cursor setter it needs. Note the
  // §0a lesson from prompts/TM_INCREMENTAL_RENDER_PERF.md: pass the target cursor as a LOCAL value,
  // never mutate the global `_cursor` first — doing that collapses the delta window to zero width and
  // the incremental path silently skips the whole scene.
  window.tmSetCursor = function(ms) {
    if (!isFinite(ms)) return false;
    TMS.renderAtTime(Math.max(TMS._projectStart, Math.min(TMS._projectEnd, ms)));
    return true;
  };

  // A bake needs Time Machine's op-log without the user having pressed the button. Same wait shape
  // as tmJumpToOrder's own whenReady() — activate() is async (it may have to inject the derived
  // timeline first), so poll for the ops rather than assuming they are there on the next line.
  //
  // §CPE_BUILDUP_ARM_GATE (2026-08-12, bim-compiler prompts/CINEMA_PATH_EDITOR.md — Witness:
  // W-ARM-GATE / witness_cpe_buildup_arm_gate.js). This used to poll `_ops.length` alone, which is
  // truthy for ONE stale op. Measured on the user's own Hospital run: at arm time `_ops` held
  // exactly the `BUILDING_OPEN` kernel op (`§TM_OPS_CHECK total=1 place=0`) and the epoch had never
  // been computed (`_projectStart == _projectEnd == 0`), so this resolved true against a zero-span
  // 1970 timeline. The rehearsal then armed on it (`§CPE_PREVIEW_BUILDUP armed ops=1 placed=0`) and
  // every frame's cursor `projectStart + u*(projectEnd-projectStart)` evaluated to the SAME 0 —
  // 497 frames of `§PERF_TRAVERSE span=0h`, camera flying, nothing building. The real 63,415-op
  // timeline finished loading (`§WRITE_LOOP_TIMING rows=63415`) seconds AFTER the flight started.
  // Readiness is "the timeline has a real SPAN", not "the array is non-empty" — the identical bar
  // ghostGroundArm already applied to the same state (`§GHOST_GROUND skip reason=buildup span is 0`)
  // and the only consumer that refused it. This is NOT a new wait: the existing 60x500ms poll now
  // waits for the condition it always meant. A real timeline always has span > 0 (`_projectStart =
  // _ops[0].start_ts - 1`, `_projectEnd` = max end_ts), so this cannot reject a usable state.
  function _bakeTimelineReady() { return !!TMS._ops.length && TMS._projectEnd > TMS._projectStart; }
  // §CPE_BUILDUP_ACTIVATE_POPS_PANEL: true only while THIS bake is the reason TM is _active — a bake
  // that started while a real user Play/TM session was already open must never turn that off underneath
  // them. window.tmDeactivateIfBakeOwned() (below) is the paired cleanup cinema_maxq calls on every
  // bake exit path (normal end, cancel, throw) — same contract as tmRestoreDerivedOrder/_ghostGroundRestore.
  var _bakeOwnsActivation = false;
  // §CPE_BUILDUP_REQUIRE_TM_FIRST (2026-08-25, bim-compiler prompts/CINEMA_PATH_EDITOR.md — user
  // ruling "no auto JSON outside TM"): a plain existence check, read-only, no DB writes, never
  // generates anything. cinema_maxq calls this BEFORE tmActivateForBake so it can refuse with a
  // clear reason instead of silently falling through activate()'s cold-generate path — the FIRST
  // schedule for a building must be born from a real Time Machine open (the one place generation is
  // allowed to run), so the user actually sees the buildup before it gets baked into a movie. Once a
  // schedule exists (cache OR kernel_ops), every later bake reads it silently — a one-time gate, not
  // a per-bake nag (user: "it is only 1 time and good practice").
  window.tmHasExistingSchedule = function() {
    function hasPlace(ops) { return !!ops && ops.some(function(o) { return o.op_type === 'ELEMENT_PLACE'; }); }
    if (TMS._active && hasPlace(TMS._ops)) return Promise.resolve(true);
    return cacheGet('gantt').then(function(cachedOps) {
      if (hasPlace(cachedOps)) return true;
      return hasPlace(TMS.loadOps());
    }).catch(function() { return hasPlace(TMS.loadOps()); });
  };
  window.tmActivateForBake = function() {
    return new Promise(function(resolve) {
      if (TMS._active && _bakeTimelineReady()) return resolve(true);
      if (!TMS._active) {
        _bakeOwnsActivation = true;
        try { activate(true); } catch (e) { _bakeOwnsActivation = false; console.warn('§MAXQ_TIME_ABORT reason=activate ' + e.message); return resolve(false); }
      }
      var n = 0, iv = setInterval(function() {
        if (_bakeTimelineReady() || ++n > 60) {
          clearInterval(iv);
          var ok = _bakeTimelineReady();
          if (!ok) console.warn('§CPE_BUILDUP_ARM_GATE timeout ops=' + TMS._ops.length +
            ' projectStart=' + TMS._projectStart + ' projectEnd=' + TMS._projectEnd +
            ' — no timeline with a real span after ' + n + ' polls; refusing to arm a cursor that cannot move');
          resolve(ok);
        }
      }, 500);
    });
  };
  // Paired with tmActivateForBake — call once on every bake exit path (normal end, cancel, throw).
  // No-op unless THIS bake was the one that silently turned TM on; a bake that reused an
  // already-open real TM session leaves it exactly as the user had it.
  window.tmDeactivateIfBakeOwned = function() {
    if (_bakeOwnsActivation && TMS._active) deactivate();
    _bakeOwnsActivation = false;
  };

  // ── §TM_WARM (2026-08-12, bim-compiler prompts/CPE_4D_PERF_MEM_FINDINGS.md §3c —
  // Implementing R4(a), user ruling "warm data only, never activate" — Witness: W-XRAY-MEMO #3) ──
  // G-CPE-SOLE-OWNER ("only a real Play opens Time Machine") holds by its LETTER here: this
  // precomputes DERIVED DATA into the memo and nothing else. It does not call activate(), does not
  // set _active, does not touch _ops, does not show the panel, and runs no DB write.
  //
  // Why only the elements half: _ops is NOT warmable and deliberately is not warmed — both load
  // paths in _activateAsync have side effects the ruling forbids (the §GANTT_CACHE_HIT branch
  // DELETEs+INSERTs kernel_ops; the cold branch runs the full injectGantt recompute). So the
  // support-edge pass (which needs _ops for its schedMap) still runs on first Play; §XRAY_CACHE_MEMO
  // is what makes every activation AFTER the first free. Stated plainly so nobody reads this as
  // "first Play is now 0 ms" — it is not.
  //
  // ⚠ BASELINE-PERF GUARD (user directive 2026-08-12: "it is performing very well now! Thus do take
  // care not to disturb that baseline perf"). _buildXrayElements() is ONE synchronous chunk (a
  // SELECT + a map over up to 125k rows) — once started it cannot yield, so an ill-timed warm is a
  // long task = a visible hitch mid-edit. Hence: pure-idle, NO requestIdleCallback timeout (never
  // forced — if the browser never idles, warm never happens and nothing is worse than today), and
  // NO setTimeout fallback (a fallback timer is exactly the "runs at a bad moment" case this guard
  // exists to prevent). Skipped outright while streaming, while TM is active, or if already warm.
  window.tmWarmXrayElements = function() {
    var app = TMS.A();
    if (!app || !app.db) return false;
    if (TMS._active) return false;                 // TM already owns this — nothing to warm
    if (app.streaming) return false;           // mirrors _dlodEngaged's !streaming gate
    // The busy flags dlod_nav.js:53 already names as "not idle": Cinema (_cinemaOrbitActive/
    // _maxqActive) and the Photoreal still refine (_stillRefineActive). Extracted from that list
    // rather than invented — there is no _bakeActive on APP.
    if (app._maxqActive || app._cinemaOrbitActive || app._stillRefineActive) return false;
    if (typeof window.requestIdleCallback !== 'function') return false;   // no fallback, by design
    var key = ((app && app.activeBuilding) || '?') + '|' + TMS._xrayMemoGen();
    if (TMS._xrayElemMemo && TMS._xrayElemMemo.key === key) return false;         // already warm
    window.requestIdleCallback(function() {
      var a2 = TMS.A();
      // Re-check at fire time: idle may land minutes later, after a Play/bake/stream started.
      if (!a2 || !a2.db || TMS._active || a2.streaming || a2._maxqActive || a2._cinemaOrbitActive || a2._stillRefineActive) {
        console.log('§TM_WARM skipped — state changed before idle fired');
        return;
      }
      var t0 = performance.now();
      var em = TMS._xrayElementsMemoized();
      console.log('§TM_WARM elements=' + ((em.elements && em.elements.length) || 0) +
        ' ms=' + (performance.now() - t0).toFixed(1) + ' memo=' + (em.hit ? 'hit' : 'miss') +
        ' active=' + TMS._active + ' ops=' + TMS._ops.length + ' (TM not activated)');
    });
    return true;
  };

  // Mode D: re-key the derived order so the reveal follows the CAMERA PATH instead of the Z-bands.
  // This adds NO new render path — `renderAtTime` is untouched. It consumes `_ops` purely as "sorted
  // ascending by start_ts, break past the cursor", so re-keying the timestamps IS the feature.
  //
  // The key, and why it is derived rather than tuned:
  //     revealS = (floor(cameraS · frames) + zRank) / frames
  // `cameraS` is where along the flight the camera comes closest to the element — the primary order,
  // which is the user's "construction follows the camera path". `zRank` is the element's place in the
  // DERIVED 4D order, and dividing by `frames` makes it the tie-break WITHIN one frame of camera
  // travel — so a region assembles bottom-up in its own 4D order as the camera passes it, which is
  // the "elements laying on each other according to its part in the 4D" half. The bucket size is the
  // bake's own frame count, not a chosen constant.
  //
  // Install duration is one and a half frames of cursor, deliberately: the playback-derived
  // `lingerMs = tickMs()*3` is ~2.7h in DAY mode while a film steps DAYS per frame, so inheriting it
  // would step clean over every frontier state and the film would read as pop-in rather than
  // assembly (recorded in PHOTOREAL_STILL_RENDER.md §MAXQ_TIME code-read, item 3.2).
  var _bkSaved = null;
  window.tmOrderByCameraPath = function(poseAt, frames, opts) {
    opts = opts || {};
    var t0 = performance.now();
    if (typeof poseAt !== 'function') { console.warn('§MAXQ_TIME_ABORT reason=no-poseAt'); return null; }
    if (!TMS._ops.length) { console.warn('§MAXQ_TIME_ABORT reason=no-ops (Time Machine has no derived order yet)'); return null; }
    var app = TMS.A();
    if (!app || !app.db || typeof app.three2ifc !== 'function') {
      console.warn('§MAXQ_TIME_ABORT reason=no-db-or-transform'); return null;
    }
    var nF = Math.max(2, frames | 0);
    // Element positions, in IFC space — the camera path is converted TO ifc rather than every element
    // to three, because there are ~250 path samples and up to 10^5 elements.
    var pos = {}, discOf = {}, nPos = 0;
    try {
      var rows = app.dbQuery('SELECT t.guid, t.center_x, t.center_y, t.center_z, m.discipline ' +
                             'FROM element_transforms t LEFT JOIN elements_meta m ON m.guid = t.guid');
      for (var r = 0; r < rows.length; r++) {
        pos[rows[r][0]] = [rows[r][1], rows[r][2], rows[r][3]];
        discOf[rows[r][0]] = rows[r][4] || '?';
        nPos++;
      }
    } catch (e) { console.warn('§MAXQ_TIME_ABORT reason=' + e.message); return null; }
    if (!nPos) { console.warn('§MAXQ_TIME_ABORT reason=no-element_transforms'); return null; }

    var NS = 256, path = [], k;
    for (k = 0; k < NS; k++) {
      var p = poseAt(k / (NS - 1));
      var q = app.three2ifc(p.x, p.y, p.z);
      path.push([q.ix, q.iy, q.iz]);
    }
    // Save the derived order ONCE so tmRestoreDerivedOrder can put it back exactly, without a
    // re-query (a re-query would also re-run injectGantt's cost for nothing).
    if (!_bkSaved) {
      _bkSaved = { ops: TMS._ops.map(function(o) { return { i: o, s: o.start_ts, e: o.end_ts }; }),
                   ps: TMS._projectStart, pe: TMS._projectEnd };
    }
    var n = TMS._ops.length, span = Math.max(1, _bkSaved.pe - _bkSaved.ps), base = _bkSaved.ps;
    var hit = 0, miss = 0, arc = 0;
    for (var i = 0; i < n; i++) {
      var op = TMS._ops[i];
      var guid = op.output_guid || (op.input_guids && op.input_guids.length ? op.input_guids[0] : null);
      var P = guid ? pos[guid] : null;
      var zRank = n > 1 ? i / (n - 1) : 0;
      var camS;
      if (!P) { camS = zRank; miss++; }          // no geometry: keep its derived place, do not invent one
      else {
        var bestK = 0, bestD = Infinity;
        for (k = 0; k < NS; k++) {
          var dx = path[k][0] - P[0], dy = path[k][1] - P[1], dz = path[k][2] - P[2];
          var d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < bestD) { bestD = d2; bestK = k; }
        }
        camS = bestK / (NS - 1); hit++;
        if (discOf[guid] === 'ARC') arc++;
      }
      var reveal = (Math.floor(camS * nF) + zRank) / nF;
      if (reveal > 1) reveal = 1;
      op.start_ts = base + reveal * span;
      op.end_ts = op.start_ts + (span / nF) * 1.5;
    }
    TMS._ops.sort(function(a, b) { return a.start_ts - b.start_ts; });
    TMS._projectStart = TMS._ops[0].start_ts - 1;
    TMS._projectEnd = Math.max.apply(null, TMS._ops.map(function(o) { return o.end_ts; }));
    // The event index is keyed on _ops; it is now stale in every entry. Drop it and require a fresh
    // full pass before any delta skip can engage again (§PERF_INCR's own invalidation contract).
    TMS._evMesh = null; TMS._evSig = ''; TMS._incrPrimed = false;
    // §Z_STACK_XRAY_STAGING: this re-keys op timestamps to a CAMERA-PATH order ("NOT a construction
    // programme" — see the log line below), not the construction schedule the staging cache was
    // built from, so its cached solidify times no longer correspond to when guids actually reach
    // "placed" under this order. Drop it rather than show a stale/wrong ghost — no rebuild call
    // exists on this path since "support" isn't a meaningful concept for a camera-driven reveal
    // order; elements simply go solid the moment they place, same as before this feature, only in
    // this one non-construction mode.
    TMS._tmXraySolidifyTs = {}; TMS._tmXrayStagedTotal = 0; TMS._tmXraySolidifiedN = 0;
    console.log('§MAXQ_TIME mode=D ops=' + n + ' placed=' + hit + ' noGeom=' + miss +
      ' arc=' + arc + ' frames=' + nF + ' samples=' + NS +
      ' span=' + Math.round(span) + 'ms installFrames=1.5' +
      ' ms=' + (performance.now() - t0).toFixed(0) +
      ' — DERIVED BUILD ORDER re-keyed to the camera path (NOT a construction programme)');
    return { ops: n, placed: hit, noGeom: miss, arc: arc, source: 'derived',
             projectStart: TMS._projectStart, projectEnd: TMS._projectEnd };
  };

  // ── §CPE_BUILDUP_REAL_SCHEDULE §3.1 — is this building's 4D REAL or DERIVED? ────────────────────
  // Implementing prompts/CINEMA_PATH_EDITOR.md §CPE_BUILDUP_REAL_SCHEDULE §3.1 — Witness: W-SCHED-COVERAGE
  // PURE READ. Must not trigger injectGantt and must not mutate anything.
  //
  // ⚠ MEASURED CORRECTION — `_capActive` ALONE IS THE WRONG TEST, and the witness caught it before
  // this shipped. `_capActive` is set by injectGantt's `_cap` overlay, so it is a RUN-SCOPED SIDE
  // EFFECT, not a property of the data. `activate()` deliberately SKIPS injectGantt when the db
  // already carries usable ELEMENT_PLACE ops with `_end_ts` (the cached/shipped-timeline fast path,
  // ~line 4462) — which is exactly the case for a building whose schedule was authored in an earlier
  // session and persisted. Confirmed on TerminalHi4D.db: all 48,433 ops carry `_captured:1` and
  // `_task:TASK_*`, timestamps spanning the real 2026-01-01..2026-05-30 window, yet `_capActive` was
  // false and this verb reported 'derived' — i.e. the real schedule was there and would still have
  // been thrown away by mode D.
  // So the source is decided by the OPS THEMSELVES: dated leaf tasks must exist AND the loaded ops
  // must actually be keyed to them (`parameters._captured`, the marker `_cap` persists), with
  // `_capActive` accepted as the same-session equivalent. Coverage falls back to the op count for the
  // same reason — `_coveredCount` is only populated on the run where injectGantt executed.
  window.tmScheduleSource = function() {
    var leafTasks = 0, summarySkipped = 0, total = 0;
    var app = TMS.A();
    var capOps = 0;
    for (var oi = 0; oi < TMS._ops.length; oi++) {
      if (TMS._ops[oi].parameters && TMS._ops[oi].parameters._captured) capOps++;
    }
    if (app && app.db) {
      try {
        var tr = app.db.exec("SELECT COUNT(*) FROM tasks WHERE schedule_start IS NOT NULL " +
          "AND schedule_finish IS NOT NULL AND (is_summary IS NULL OR is_summary = 0)");
        if (tr.length && tr[0].values.length) leafTasks = tr[0].values[0][0] | 0;
        var sr = app.db.exec("SELECT COUNT(*) FROM tasks WHERE is_summary = 1");
        if (sr.length && sr[0].values.length) summarySkipped = sr[0].values[0][0] | 0;
      } catch (e) { leafTasks = 0; summarySkipped = 0; }   // no tasks table → derived, not an error
      try {
        var er = app.db.exec("SELECT COUNT(*) FROM elements_meta WHERE " + TMS._scheduledWhere(''));
        if (er.length && er[0].values.length) total = er[0].values[0][0] | 0;
      } catch (e) { total = 0; }
    }
    // Coverage is counted off the LOADED OPS FIRST, not off `_coveredCount`. `_coveredCount` tallies
    // `_cap`'s UPDATE executions against kernel_ops, so a db carrying duplicate ELEMENT_PLACE rows for
    // a guid inflates it above the element count (measured: 2238 on a 1119-element Duplex after an
    // extra injectGantt pass). `capOps` is what the film actually reveals, so it is the honest number;
    // `_coveredCount` is kept only as the fallback for the window where ops have not been reloaded yet.
    var covered = capOps || TMS._coveredCount;
    return {
      source: (leafTasks > 0 && (TMS._capActive || capOps > 0)) ? 'captured' : 'derived',
      leafTasks: leafTasks, summarySkipped: summarySkipped,
      capOps: capOps, capActive: TMS._capActive,
      covered: covered, total: total, coveredUpdates: TMS._coveredCount,
      pct: total ? Math.min(100, Math.round(covered / total * 100)) : 0,
      projectStart: TMS._projectStart, projectEnd: TMS._projectEnd, ops: TMS._ops.length
    };
  };

  // ── §CPE_BUILDUP_REAL_SCHEDULE §3.2 — the CAPTURED branch of the buildup ───────────────────────
  // Implementing prompts/CINEMA_PATH_EDITOR.md §CPE_BUILDUP_REAL_SCHEDULE §3.2
  // Witnesses: W-SCHED-REAL-ORDER, W-SCHED-REVERSIBLE
  //
  // ⚠ This verb deliberately WRITES NOTHING, and that is the whole design — not an omission.
  // injectGantt's `_cap` overlay has ALREADY keyed every covered op to its own task's
  // [schedule_start, schedule_finish] window (leaf tasks only — `is_summary` is filtered there), with
  // §PLAYBACK-STAGGER distributing each task's guids bottom-up by center_z WITHIN that window.
  // loadOps() then reads them back ORDER BY timestamp and computeDays() sets _projectStart/_projectEnd
  // to the real project epoch. So "order the reveal by the real schedule" is already true of `_ops`
  // the moment the timeline exists; mode D's re-key is what was DESTROYING it (§2).
  //
  // Returns the SAME shape tmOrderByCameraPath returns, so cinema_maxq.js's per-frame cursor loop
  // needs no change. Because nothing was written, _bkSaved stays null and tmRestoreDerivedOrder() is a
  // genuine no-op — stronger than restoring correctly, since there is nothing to get wrong.
  window.tmOrderBySchedule = function() {
    if (!TMS._ops.length) { console.warn('§CPE_BUILDUP_SOURCE reject reason=no-ops'); return null; }
    var ss = window.tmScheduleSource();
    if (!ss.leafTasks) { console.warn('§CPE_BUILDUP_SOURCE reject reason=no-dated-leaf-tasks'); return null; }
    if (ss.source !== 'captured') { console.warn('§CPE_BUILDUP_SOURCE reject reason=ops-not-keyed-to-tasks'); return null; }
    var capOps = ss.capOps;
    var iso = function(ms) { return isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : '?'; };
    console.log('§CPE_BUILDUP_SOURCE source=captured leafTasks=' + ss.leafTasks +
      ' summarySkipped=' + ss.summarySkipped + ' covered=' + ss.covered + '/' + ss.total +
      ' pct=' + ss.pct + '% capOps=' + capOps + '/' + TMS._ops.length +
      ' capActive=' + ss.capActive +
      ' window=' + iso(TMS._projectStart) + '..' + iso(TMS._projectEnd) +
      ' — REAL LINKED SCHEDULE, reveal follows schedule_start (no re-key, no float/logic in this data)');
    return { ops: TMS._ops.length, placed: capOps, noGeom: TMS._ops.length - capOps, arc: 0, source: 'captured',
             leafTasks: ss.leafTasks, covered: ss.covered, total: ss.total, pct: ss.pct,
             projectStart: TMS._projectStart, projectEnd: TMS._projectEnd };
  };

  // ── §CPE_BUILDUP_FOLLOW_TM — the film PLAYS the Time Machine; it does not author a build order ──
  // Implementing prompts/CINEMA_PATH_EDITOR.md §CPE_BUILDUP_SOURCE_BLIND
  // User, 2026-07-29: "do not bake anything for TM.. as i said, it is user's own plan" /
  // "this practices good separation of tasks" — Time Machine owns the build order, Alt+C owns the
  // camera. The film is a camera over a timeline someone else authored, and nothing about pressing
  // Alt+C may change WHEN anything is built.
  //
  // This is the ONE verb both callers (the bake in cinema_maxq.js and the Preview in
  // cinema_path_editor.js) now use, which is also the fix for those two having chosen the buildup
  // source by different rules — the preview called tmOrderByCameraPath unconditionally while the bake
  // consulted tmScheduleSource(), so on a captured-schedule building the rehearsal and the film could
  // disagree about what they were showing.
  //
  // Like tmOrderBySchedule (which it delegates to for the captured case) it WRITES NOTHING: `_ops`
  // are already in timeline order the moment the timeline exists — loadOps() reads them ORDER BY
  // timestamp and computeDays() sets the real project epoch. So "follow the Time Machine" needs no
  // pass at all, which is why _bkSaved stays null and tmRestoreDerivedOrder() is a genuine no-op.
  //
  // mode S = a captured/linked schedule keyed to dated leaf tasks.
  // mode T = this model's own derived 4D timeline (schedule_gate's geometry-gated, bottom-up order —
  //          real work, but NOT a construction programme; the wording tiers in §5 still apply).
  // There is deliberately no mode D here. tmOrderByCameraPath still exists and is still correct at
  // what it does, but re-keying a timeline to camera proximity is exactly the interference this verb
  // was written to remove.
  window.tmFollowTimeline = function() {
    if (!TMS._ops.length) { console.warn('§CPE_BUILDUP_SOURCE reject reason=no-ops'); return null; }
    // §CPE_BUILDUP_ARM_GATE guard 2 (see tmActivateForBake above for the measured failure): a
    // timeline with no SPAN cannot drive a cursor — `projectStart + u*(projectEnd-projectStart)` is
    // the same value at every u, so the film freezes on frame 0's state and no log says why. Refuse
    // it loudly instead of handing back a bkState the caller will faithfully follow to nowhere. The
    // BAKE (cinema_maxq.js) calls this same verb, so this also stops a film silently recording a
    // static building. ghostGroundArm/dayCounterLiveStart already refuse this exact state.
    if (!(TMS._projectEnd > TMS._projectStart)) {
      console.warn('§CPE_BUILDUP_SOURCE reject reason=zero-span ops=' + TMS._ops.length +
        ' projectStart=' + TMS._projectStart + ' projectEnd=' + TMS._projectEnd +
        ' — every frame would ask for the same cursor; the timeline is not loaded yet');
      return null;
    }
    var ss = window.tmScheduleSource();
    if (ss.source === 'captured' && typeof window.tmOrderBySchedule === 'function') {
      var cap = window.tmOrderBySchedule();
      if (cap) return cap;
      // A degraded captured schedule falls through to the timeline as loaded — still the user's
      // plan, never a re-key.
      console.warn('§CPE_BUILDUP_SOURCE fallthrough reason=captured-but-unusable — following the timeline as loaded');
    }
    // Count what the reveal can actually show, the same way mode D counted `placed`: an op with no
    // geometry still holds its place in the order, it just has nothing to appear.
    var app = TMS.A(), placed = 0, noGeom = 0;
    try {
      var have = {};
      var rows = app.dbQuery('SELECT guid FROM element_transforms');
      for (var r = 0; r < rows.length; r++) have[rows[r][0]] = 1;
      for (var i = 0; i < TMS._ops.length; i++) {
        var op = TMS._ops[i];
        var guid = op.output_guid || (op.input_guids && op.input_guids.length ? op.input_guids[0] : null);
        if (guid && have[guid]) placed++; else noGeom++;
      }
    } catch (e) { placed = TMS._ops.length; noGeom = 0; }   // counting failed → do not block the film
    // §CPE_BUILDUP_ARM_GATE guard 2b: `placed` is this function's own count of ops that can actually
    // APPEAR. Zero of them means the reveal has nothing to reveal no matter where the cursor goes —
    // the user's failing run reported exactly `placed=0` and armed anyway. A counting FAILURE above
    // degrades to placed=_ops.length (never 0), so this only ever fires on a real, measured zero.
    if (placed === 0) {
      console.warn('§CPE_BUILDUP_SOURCE reject reason=nothing-placed ops=' + TMS._ops.length +
        ' noGeom=' + noGeom + ' — no op in this timeline maps to geometry; there is nothing to build');
      return null;
    }
    var iso = function(ms) { return isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : '?'; };
    console.log('§CPE_BUILDUP_SOURCE mode=T reason=generated-timeline ops=' + TMS._ops.length +
      ' placed=' + placed + ' noGeom=' + noGeom +
      ' leafTasks=' + ss.leafTasks + ' capOps=' + ss.capOps + '/' + TMS._ops.length +
      ' capActive=' + ss.capActive +
      ' window=' + iso(TMS._projectStart) + '..' + iso(TMS._projectEnd) +
      ' — the reveal FOLLOWS this model\'s own 4D timeline, unmodified (no re-key; not a construction programme)');
    return { ops: TMS._ops.length, placed: placed, noGeom: noGeom, arc: 0, source: 'timeline',
             leafTasks: ss.leafTasks, covered: ss.covered, total: ss.total, pct: ss.pct,
             projectStart: TMS._projectStart, projectEnd: TMS._projectEnd };
  };

  // ── §CPE_BUILDUP_REAL_SCHEDULE §4 — the numeric instrument the witnesses read ──────────────────
  // Implementing prompts/CINEMA_PATH_EDITOR.md §CPE_BUILDUP_REAL_SCHEDULE §4
  // Witnesses: W-SCHED-REAL-ORDER, W-SCHED-REVERSIBLE
  // Read-only, aggregate-only (never 10^5 rows across the bridge). Per dated leaf task it returns the
  // FIRST and LAST reveal timestamp its bound elements actually get in `_ops` — which is what makes
  // "the phases do not interleave" a number instead of an opinion. Works in BOTH branches, so the
  // same instrument reads the captured order and mode D's re-key, and the two can be compared.
  // `checksum` is the exact-reversibility probe: sums over EVERY op, so any single mutated timestamp
  // changes it (W-SCHED-REVERSIBLE), without shipping the op list to the caller.
  window.tmPhaseWindows = function() {
    var app = TMS.A(), out = [], byGuid = {};
    var chk = { opCount: TMS._ops.length, sumStart: 0, sumEnd: 0 };
    for (var i = 0; i < TMS._ops.length; i++) { chk.sumStart += TMS._ops[i].start_ts; chk.sumEnd += TMS._ops[i].end_ts; }
    if (!app || !app.db) return { phases: [], checksum: chk };
    var rows;
    try {
      rows = app.db.exec('SELECT te.guid, te.task_id, t.name, t.schedule_start FROM task_elements te ' +
        'JOIN tasks t ON t.task_id = te.task_id ' +
        'WHERE t.schedule_start IS NOT NULL AND t.schedule_finish IS NOT NULL ' +
        'AND (t.is_summary IS NULL OR t.is_summary = 0)');
    } catch (e) { return { phases: [], checksum: chk }; }
    if (!rows.length || !rows[0].values.length) return { phases: [], checksum: chk };
    var meta = {};
    rows[0].values.forEach(function(r) {
      byGuid[r[0]] = r[1];
      if (!meta[r[1]]) meta[r[1]] = { taskId: r[1], name: r[2], scheduleStart: r[3], n: 0,
                                      minStart: Infinity, maxStart: -Infinity, bound: 0 };
      meta[r[1]].bound++;
    });
    for (i = 0; i < TMS._ops.length; i++) {
      var op = TMS._ops[i];
      var g = op.output_guid || (op.input_guids && op.input_guids.length ? op.input_guids[0] : null);
      var tid = g ? byGuid[g] : null;
      if (!tid) continue;
      var m = meta[tid];
      m.n++;
      if (op.start_ts < m.minStart) m.minStart = op.start_ts;
      if (op.start_ts > m.maxStart) m.maxStart = op.start_ts;
    }
    for (var k in meta) if (meta[k].n) out.push(meta[k]);
    out.sort(function(a, b) {
      return (Date.parse(a.scheduleStart) - Date.parse(b.scheduleStart)) ||
             (a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0);   // §3.2: stable tie-break only
    });
    return { phases: out, checksum: chk };
  };

  window.tmRestoreDerivedOrder = function() {
    if (!_bkSaved) return false;
    for (var i = 0; i < _bkSaved.ops.length; i++) {
      _bkSaved.ops[i].i.start_ts = _bkSaved.ops[i].s;
      _bkSaved.ops[i].i.end_ts = _bkSaved.ops[i].e;
    }
    TMS._ops.sort(function(a, b) { return a.start_ts - b.start_ts; });
    TMS._projectStart = _bkSaved.ps; TMS._projectEnd = _bkSaved.pe;
    TMS._evMesh = null; TMS._evSig = ''; TMS._incrPrimed = false;
    _bkSaved = null;
    TMS._tmRebuildXrayCache();  // §Z_STACK_XRAY_STAGING: back on the real construction order — the
                              // cache is valid again, rebuild it rather than leave it cleared
    console.log('§MAXQ_TIME restored — derived Z-band order back in force');
    return true;
  };
  // W-BUILDUP-SAMPLE reads this: how many ops are placed at the current cursor. Counting ops rather
  // than meshes keeps the witness independent of the render path it is meant to be checking.
  window.tmPlacedCount = function(ms) {
    var c = isFinite(ms) ? ms : TMS._cursor, n = 0;
    for (var i = 0; i < TMS._ops.length; i++) {
      if (TMS._ops[i].start_ts > c) break;
      if (TMS._ops[i].end_ts <= c) n++;
    }
    return n;
  };

  // §CPE_GHOST_GROUND (CINEMA_PATH_EDITOR.md) — the cursor time at which the buildup first places
  // something that is NOT underground. A buildup film opens on substructure, and substructure sits
  // below the ground plane (§GROUND_Y), so the opening is not empty — it is OCCLUDED. This is the
  // moment the ghosted plane may start returning to opaque.
  //
  // `bottom >= ifcZ - EPS` deliberately COUNTS the ground-floor slab itself (its bottom IS the
  // ground datum, by construction — tools.js picks the plane's height from that very slab). The
  // user's own framing was "until its above slabs appears", and the slab appearing is exactly the
  // moment the ground stops needing to be see-through.
  //
  // One DB read, one pass over the ops, called ONCE per bake/preview — never per frame.
  // Returns null when nothing is ever at or above the datum (a fully-buried model, or no ops), and
  // the caller must treat null as "never ghost" rather than "ghost forever".
  window.tmFirstAboveGroundMs = function(ifcZ) {
    var app = TMS.A();
    if (!app || !app.db || !isFinite(ifcZ) || !TMS._ops.length) return null;
    var EPS = 0.05, above = Object.create(null), rows;
    try {
      rows = app.db.exec('SELECT guid, center_z - COALESCE(bbox_z, 0) / 2.0 AS bottom ' +
                         'FROM element_transforms WHERE center_z IS NOT NULL');
    } catch (e) { console.warn('§GHOST_GROUND_TRIGGER_FAIL ' + e.message); return null; }
    if (!rows.length || !rows[0].values.length) return null;
    var vals = rows[0].values, nAbove = 0;
    for (var r = 0; r < vals.length; r++) {
      if (vals[r][1] != null && vals[r][1] >= ifcZ - EPS) { above[vals[r][0]] = 1; nAbove++; }
    }
    // ⚠ MIN over end_ts, NOT the first match in start order. `_ops` is ordered by start_ts, but an
    // element only BECOMES VISIBLE when its op ends — `tmPlacedCount` counts `end_ts <= cursor`, and
    // the ghost has to lift on the same definition or it lifts while the ground is still bare.
    // Measured on Hospital: taking the first start-ordered match gave triggerT=0.0162 while ops with
    // EARLIER end_ts existed further down the list. One extra pass over 63k ops, once per bake.
    var firstMs = null, scanned = 0, matched = 0, belowN = 0, lastBelowMs = null;
    for (var i = 0; i < TMS._ops.length; i++) {
      var op = TMS._ops[i];
      var g = op.output_guid || (op.input_guids && op.input_guids.length ? op.input_guids[0] : null);
      scanned++;
      if (!g || !above[g]) { if (g) { belowN++; if (lastBelowMs == null || op.end_ts > lastBelowMs) lastBelowMs = op.end_ts; } continue; }
      matched++;
      if (firstMs == null || op.end_ts < firstMs) firstMs = op.end_ts;
    }
    console.log('§GHOST_GROUND_TRIGGER groundZ=' + ifcZ.toFixed(2) + ' aboveElems=' + nAbove + '/' + vals.length +
      ' firstAboveMs=' + (firstMs == null ? 'none' : Math.round(firstMs)) +
      ' aboveOps=' + matched + ' belowOps=' + belowN +
      ' lastBelowMs=' + (lastBelowMs == null ? 'none' : Math.round(lastBelowMs)) +
      ' opsScanned=' + scanned + '/' + TMS._ops.length +
      ' span=' + Math.round(TMS._projectStart) + '..' + Math.round(TMS._projectEnd) +
      ' — before this the buildup is entirely below the ground plane');
    return firstMs;
  };

  // §CPE_GHOST_GROUND_RATIO — the SCHEDULE of above-ground placement, not just its first moment.
  // Measured on Hospital: the first at-or-above-ground element lands at t=0.0162 (2.4s of a 147.9s
  // film) while below-ground work continues to t=0.9947 — that model has no clean "substructure
  // window" at all, so a first-element trigger lifts the ghost before the camera has even landed.
  // The generic answer is a RATIO against the model's own above-ground total: the ground solidifies
  // as the building rises, on every building, with no per-model tuning.
  //
  // Returns sorted end_ts for every above-ground op (binary-searchable per frame — never a rescan),
  // plus the counts a caller needs to decide whether ghosting applies to this model at all.
  window.tmGroundSchedule = function(ifcZ) {
    var app = TMS.A();
    if (!app || !app.db || !isFinite(ifcZ) || !TMS._ops.length) return null;
    var EPS = 0.05, above = Object.create(null), rows;
    try {
      rows = app.db.exec('SELECT guid, center_z - COALESCE(bbox_z, 0) / 2.0 AS bottom ' +
                         'FROM element_transforms WHERE center_z IS NOT NULL');
    } catch (e) { console.warn('§GHOST_GROUND_TRIGGER_FAIL ' + e.message); return null; }
    if (!rows.length || !rows[0].values.length) return null;
    var vals = rows[0].values, i;
    for (i = 0; i < vals.length; i++) {
      if (vals[i][1] != null && vals[i][1] >= ifcZ - EPS) above[vals[i][0]] = 1;
    }
    var ends = [], belowN = 0;
    for (i = 0; i < TMS._ops.length; i++) {
      var op = TMS._ops[i];
      var g = op.output_guid || (op.input_guids && op.input_guids.length ? op.input_guids[0] : null);
      if (!g) continue;
      if (above[g]) ends.push(op.end_ts); else belowN++;
    }
    ends.sort(function(a, b) { return a - b; });
    var out = { ends: ends, aboveTotal: ends.length, belowTotal: belowN,
                firstAboveMs: ends.length ? ends[0] : null,
                projectStart: TMS._projectStart, projectEnd: TMS._projectEnd };
    console.log('§GHOST_GROUND_SCHEDULE groundZ=' + ifcZ.toFixed(2) +
      ' aboveOps=' + out.aboveTotal + ' belowOps=' + out.belowTotal +
      ' firstAboveMs=' + (out.firstAboveMs == null ? 'none' : Math.round(out.firstAboveMs)) +
      ' — opacity follows the SHARE of above-ground work placed, so it scales to any building');
    return out;
  };

  // §CPE_BUILDUP_WORK_PACED (CINEMA_PATH_EDITOR.md) — the sorted completion times of every op, so a
  // film can advance by WORK instead of by CALENDAR. Measured on the user's own Hospital bakes: at
  // the same film fraction one run had 210/63,421 elements placed and another 15,485/63,416, because
  // the derived 4D order clusters thousands of elements at nearby timestamps and the film was
  // stepping the cursor linearly in days. Stepping it linearly in ELEMENTS makes "10% of the film"
  // mean "10% of the building" on any model.
  //
  // One pass, called ONCE per bake/preview — never per frame. Read-only: nothing here re-keys or
  // reorders the op log (§CPE_BUILDUP_FOLLOW_TM — the film plays the timeline, it does not author one).
  window.tmWorkSchedule = function() {
    if (!TMS._ops.length) return null;
    var ends = new Float64Array(TMS._ops.length), i;
    for (i = 0; i < TMS._ops.length; i++) ends[i] = TMS._ops[i].end_ts;
    ends.sort();
    var out = { ends: ends, total: ends.length, projectStart: TMS._projectStart, projectEnd: TMS._projectEnd };
    // How front-loaded IS this model? The share of work completed in the first 10% of the calendar —
    // 0.10 would mean evenly spread, and anything far above it is exactly the burst the user saw.
    var tenPct = TMS._projectStart + 0.10 * (TMS._projectEnd - TMS._projectStart), n10 = 0;
    for (i = 0; i < ends.length; i++) { if (ends[i] > tenPct) break; n10++; }
    out.workInFirstTenthOfCalendar = ends.length ? n10 / ends.length : 0;
    console.log('§CPE_WORK_SCHEDULE ops=' + out.total +
      ' span=' + Math.round(TMS._projectStart) + '..' + Math.round(TMS._projectEnd) +
      ' workInFirst10%OfCalendar=' + (out.workInFirstTenthOfCalendar * 100).toFixed(1) + '%' +
      ' (10.0% would be evenly spread — anything above it is the burst calendar pacing shows)');
    return out;
  };

  // Per-guid completion time — "is this SPECIFIC element placed by a given cursor", as opposed to
  // "how many ops are done in total" (tmWorkSchedule/tmPlacedCount above). One pass, read-only,
  // same guid-extraction every other _ops reader in this file already uses (tmGroundSchedule,
  // tmOrderByCameraPath) — not a new convention.
  // ORIGIN: §CPE_AIM_DEPTH_BUILDUP candidate 2 (2026-08-13), so §CPE_AIM_DEPTH's candidate-facade
  // search could not pick unbuilt geometry during a buildup bake. THAT CALLER IS GONE
  // (§CPE_AIM_DEPTH_RETIRED, 2026-09-02). This function STAYS: effects.js:4479's glow-lens
  // first-placement gate is a live, independent consumer — checked before writing this note.
  // MIN, not last-write: if a guid is touched by more than one op (uncommon but not assumed absent),
  // it counts as placed from its EARLIEST completion, matching "when does this first become real".
  window.tmGuidEndTs = function() {
    var out = Object.create(null);
    for (var i = 0; i < TMS._ops.length; i++) {
      var op = TMS._ops[i];
      var g = op.output_guid || (op.input_guids && op.input_guids.length ? op.input_guids[0] : null);
      if (!g) continue;
      if (!(g in out) || op.end_ts < out[g]) out[g] = op.end_ts;
    }
    return out;
  };

  // §PHASE_LENS exposure: let other modules (Find panel Phase axis) lazily
  // trigger the REAL timeline generator. Does NOT alter injectGantt's logic —
  // just exposes it. §GANTT_REFOLD_HANG: injectGantt is async now — this returns a
  // Promise<boolean>; callers must treat a thenable as "generating" (see navigate_find.js).
  window.tmGenerateTimeline = function() { return TMS.injectGantt(); };

  // §TM_STREAM_RESWEEP: streaming.js has no awareness of Time Machine — new BatchedMesh/
  // InstancedMesh geometry that finishes streaming in AFTER the current cursor's renderAtTime()
  // pass defaults to its normal (fully-visible) state and is never swept to match the active
  // cursor until the NEXT cursor change. On a large building (Hospital: 63K elements) streaming
  // can take 10s+ seconds, so a user sitting at 0Hr (cursor never moves) sees the scene fill back
  // up with fully-visible late-arriving geometry that should still be hidden. Confirmed present
  // on baseline `a13bb0d` too (pre-dates this session — not a regression, a longstanding gap).
  // streaming.js calls this (feature-detected, optional — same pattern as window.__sfxTM) after
  // each flush; no-ops when TM isn't active, so zero cost/behavior change for non-TM viewing.
  window.tmResweep = function() { if (TMS._active) TMS.renderAtTime(TMS._cursor); };
  // W-XRAY-MEMO test hook (§XRAY_CACHE_MEMO): read the x-ray staging map + memo state, and drive
  // the memo's key discipline deterministically. Diagnostic only — no production caller, same
  // contract as __tmSnapshotVisible. `map` returns the FULL guid→ms map so the witness can assert
  // byte-identical restore key-by-key rather than trusting a digest.
  window.__tmXrayProbe = function (op, arg) {
    if (op === 'clearMemo') { TMS._xrayElemMemo = null; TMS._xrayCacheMemo = []; }
    else if (op === 'rebuild') { TMS._tmRebuildXrayCache(); }
    else if (op === 'nudge') {   // move one op's end_ts → the key MUST miss
      if (TMS._ops.length) TMS._ops[0].end_ts += (arg || 0);
    }
    else if (op === 'deactivate') { deactivate(); }   // the same verb the panel's close button calls
    var keys = Object.keys(TMS._tmXraySolidifyTs);
    var out = { n: keys.length, staged: TMS._tmXrayStagedTotal, solidified: TMS._tmXraySolidifiedN,
                elemMemo: !!TMS._xrayElemMemo, edgeMemo: TMS._xrayCacheMemo.length,
                active: TMS._active, ops: TMS._ops.length };
    if (op === 'map') { out.map = {}; for (var i = 0; i < keys.length; i++) out.map[keys[i]] = TMS._tmXraySolidifyTs[keys[i]]; }
    return out;
  };
  // Test hook: simulate a playback tick (small cursor advance + roll bump) so a probe can exercise
  // the incremental (delta) path deterministically without the cinema UI. Diagnostic only.
  window.__tmStep = function (dms) { if (!TMS._active) return null; TMS._gspRoll++;
    TMS.renderAtTime(Math.min(TMS._projectEnd, TMS._cursor + (dms || 3600000))); return window.__tmTrav; };
  // W-INCR-EQUIV test hook: jump to an ABSOLUTE cursor (clamped to project bounds), for the
  // forward/backward/random-scrub/jump-to-start-end sweep TM_INCREMENTAL_RENDER_PERF.md §5 requires.
  // Diagnostic only, mirrors __tmStep's no-op-if-inactive contract.
  window.__tmSetCursor = function (absMs) {
    if (!TMS._active) return null;
    TMS.renderAtTime(Math.max(TMS._projectStart, Math.min(TMS._projectEnd, absMs)));
    return window.__tmTrav;
  };
  // W-INCR-EQUIV test hook: snapshot every visible guid + its slot visibility, for diffing the
  // delta path against the window.__forceFull full-path re-render at the same cursor.
  window.__tmSnapshotVisible = function () {
    if (!TMS._active) return null;
    var app = TMS.A();
    var out = { mesh: [], batched: {}, instanced: {} };
    app.scene.traverse(function (obj) {
      if (!obj.userData) return;
      if (obj.userData.guid) { if (obj.visible) out.mesh.push(obj.userData.guid); return; }
      if (obj.isBatchedMesh && app._batchMeta && app._batchMeta[obj.id]) {
        var bmetas = app._batchMeta[obj.id], vis = {};
        for (var bi = 0; bi < bmetas.length; bi++) {
          vis[bmetas[bi].guid] = !!(obj.getVisibleAt ? obj.getVisibleAt(bmetas[bi].slotId) : obj.visible);
        }
        out.batched[obj.id] = vis;
        return;
      }
      if (obj.isInstancedMesh && app._instanceMeta && app._instanceMeta[obj.id]) {
        var metas = app._instanceMeta[obj.id], ivis = {};
        var _snapM4 = window.__tmSnapshotVisible._m4 || (window.__tmSnapshotVisible._m4 = new THREE.Matrix4());
        for (var mi = 0; mi < metas.length; mi++) {
          obj.getMatrixAt(mi, _snapM4);
          ivis[metas[mi].guid] = !(_snapM4.elements[0] === 0 && _snapM4.elements[5] === 0 && _snapM4.elements[10] === 0);
        }
        out.instanced[obj.id] = ivis;
      }
    });
    out.mesh.sort();
    return out;
  };
};
