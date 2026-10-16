/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// schedule_inject.js — §S7-INJECT (bim-compiler prompts/TM_4D5D_VARIANCE_LANE.md): "materialize the
// schedule ONCE, on the fly" — the user decision that resolves §S7-DATA-REALITY ("no published
// building carries a persisted schedule") without making the user find ✎ Author first.
//
// WHY THIS IS ITS OWN FILE, NOT A METHOD ON schedule_author.js OR THE WIZARD (schedule_author_ui.js):
// this is a TRIGGER + REPORTER, not a producer. It calls the SAME engine verbs the wizard already
// calls (materializeZones, persistDb) and adds nothing to what they compute — see §3 "read/write the
// twin, don't recompute" doctrine. Putting it in schedule_author.js would mix an orchestration/UI-
// facing concern into the pure engine module; putting it in schedule_author_ui.js would drag in the
// whole editing-panel wizard (build/render/drag-handle/element-reassignment UI) for a feature that
// is ONE tap and never opens that panel. One small module, one job: decide whether to fire, fire it,
// and say honestly what happened.
//
// ONE PATH, EVERY BUILDING, NO BUILDING-CLASS SPLIT (§S7-INJECT, the decision superseding its own
// earlier struck-through verdict): materialize into the in-memory db (always succeeds — the SAME
// A.db every read path already uses, so the panel works the instant this returns, whether or not the
// save below survives) then persist BEST EFFORT. Over Chrome's ~127MiB single-IDB-value cap the
// persist transaction aborts (EXPECTED on Hospital ~260MB / JKR ~196MB, NOT a feature failure) — only
// the schedule's LIFETIME differs (this device forever vs this tab session). Never a dead-end
// "this building needs a baked schedule" message; always say which of the two happened.
//
// NEVER OVERWRITE (§S7-INJECT's own header rule, restated here because this is the ONLY call site
// that may trigger it unprompted): inject ONLY when ScheduleAuthor.activeSchedule(db) returns null.
// That function returns non-null for a captured (imported) schedule AND for the user's own edited
// SCH_AUTHORED draft (baselined or not) — every one of those must not be auto-touched, full stop.
// The guard below is a single null-check for exactly that reason: activeSchedule's own definition of
// "there is a schedule" already covers every case this feature must refuse, so no second, narrower
// check (captured / hasBaseline) is needed or safer — a narrower check would be a NEW way to miss one.
//
// DETERMINISM (Prime Directive): start is the '2026-01-01' LITERAL, never Date.now() — the same run
// must produce byte-identical dates. See START below; do not parametrize it from the caller.
//
// HONESTY (§S7-INJECT): schedule_id stays 'SCH_AUTHORED' (activeSchedule's own definition of
// "authored"; any other id reads as captured, the one state that must never be auto-touched).
// Provenance goes in `schedules.name` instead — GEN_NAME below, against the wizard's own
// 'Authored Schedule (4D template)' — never schedule_id, display_authored or gen_version, none of
// which are provenance flags (see the spec section by the same name).
//
// DUAL-MODE (find_erp_push.js/schedule_read_4d.js/info_4d_panel.js convention): attaches to the
// browser global AND exports for require() so a Node witness can drive `inject()` against a real
// fleet DB with a stub `A` (no DOM, no document) — only the DOM/progress-bar helpers at the bottom
// are browser-only, guarded by `typeof document`.
(function (global) {
  'use strict';

  var START = '2026-01-01';                                  // literal — see DETERMINISM above
  var GEN_NAME = 'Default Programme (auto-generated)';        // see HONESTY above
  var _busy = false;                                          // re-entrancy guard — one tap, not N

  function _now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  // Let one frame paint between a DOM update and the next heavy synchronous call. materializeZones
  // is SYNCHRONOUS and measured up to 2,515ms (§S7-INJECT-COST, Hospital) — without this the
  // "Materializing…" stage would never actually be painted before the tab freezes to compute it.
  function _yield() { return new Promise(function (r) { setTimeout(r, 0); }); }

  // Resolve the 4D template WITHOUT loading a second copy (§S7-GRAIN / §S7-INJECT-WHERE). Priority:
  // (1) a witness's explicit override (opts.template, including an explicit `null` to force the
  //     legacy zone path on purpose — hence the `!== undefined` check, not a truthiness check);
  // (2) window._4dTemplate if some earlier Time Machine activity this session already published it;
  // (3) window.tm4DTemplate() — the ONE loader (time_machine.js _load4DTemplate), exposed for this
  //     exact caller; idempotent, so calling it here even after (2) missed costs nothing extra;
  // (4) null — no loader present (Node, or time_machine.js failed to load). materializeZones itself
  //     degrades to the legacy deriveZones path on a null template, same as every existing caller
  //     that omits opts.template; this is NOT this module inventing a second fallback.
  function _resolveTemplate(opts) {
    if (opts && opts.template !== undefined) return Promise.resolve(opts.template);
    if (typeof window !== 'undefined' && window._4dTemplate) return Promise.resolve(window._4dTemplate);
    if (typeof window !== 'undefined' && typeof window.tm4DTemplate === 'function') {
      return Promise.resolve(window.tm4DTemplate()).catch(function () { return null; });
    }
    return Promise.resolve(null);
  }

  // inject(A, opts) — the whole leg. A: {db, DB_URL, status?}. opts (all optional, all witness
  // override seams, mirroring schedule_read_4d.js's own convention):
  //   scheduleAuthor, rules, laborRates, defaultRule, nameOverrides, scheduleGate, template, progress
  // Returns a Promise resolving to one of:
  //   { ok:false, reason:'no_db'|'no_engine'|'busy' }
  //   { ok:false, reason:'exists', schedule }                       — NEVER OVERWRITE, see header
  //   { ok:false, reason:<materializeZones reason>, materializeMs } — honest degrade, e.g. no_elements
  //   { ok:true, scheduleId, persisted:bool, materializeMs, persistMs, taskCount, templateVersion }
  function inject(A, opts) {
    opts = opts || {};
    var d = A && A.db;
    var progress = opts.progress || _domProgress(A);
    if (!d) {
      console.log('§SCHED_INJECT skip reason=no_db');
      progress.fail('No model loaded — nothing to generate a programme for.');
      return Promise.resolve({ ok: false, reason: 'no_db' });
    }
    var SA = opts.scheduleAuthor || global.ScheduleAuthor;
    if (!SA || !SA.materializeZones || !SA.activeSchedule || !SA.persistDb) {
      console.log('§SCHED_INJECT skip reason=engine_not_loaded');
      progress.fail('4D authoring engine not loaded — cannot generate a programme.');
      return Promise.resolve({ ok: false, reason: 'no_engine' });
    }
    if (_busy) {
      console.log('§SCHED_INJECT skip reason=busy');
      progress.fail('Already generating a programme — please wait.');
      return Promise.resolve({ ok: false, reason: 'busy' });
    }
    // ── NEVER OVERWRITE ──────────────────────────────────────────────────────────────────────────
    var existing = null;
    try { existing = SA.activeSchedule(d); } catch (e) { existing = null; }
    if (existing && existing.id) {
      // existing.hasBaseline is only ever computed by activeSchedule() when the caller also passes
      // opts.currentGenVersion (it means "stale AND baselined", a narrower question this caller
      // never asks) — reading it here would print hasBaseline=false on every genuinely-baselined
      // schedule and silently mislead this exact log line. Query task_baseline directly instead:
      // purely for the log's honesty, never for the decision above, which already refused on the
      // null-check alone regardless of baseline status (see header — one check covers both cases).
      var hasBaselineReal = false;
      try {
        var _br = d.exec('SELECT COUNT(*) FROM task_baseline WHERE schedule_id=?', [existing.id]);
        hasBaselineReal = !!(_br.length && _br[0].values.length && _br[0].values[0][0] > 0);
      } catch (e) { /* no task_baseline table at all — false is correct */ }
      console.log('§SCHED_INJECT skip reason=schedule_exists id=' + existing.id +
        ' captured=' + !!existing.captured + ' hasBaseline=' + hasBaselineReal);
      // This IS the "re-running injection is a no-op" claim (W-S7-INJECT) as well as the data-loss
      // guard (W-S7-INJECT-GUARD) — one check, both claims, on purpose (see header).
      return Promise.resolve({ ok: false, reason: 'exists', schedule: existing });
    }

    _busy = true;
    progress.stage('materializing');
    var t0 = _now();
    return _yield().then(function () { return _resolveTemplate(opts); }).then(function (tpl) {
      var rules = opts.rules || global.SEQUENCE_RULES || {};
      var res;
      try {
        res = SA.materializeZones(d, rules, {
          start: START,
          laborRates: opts.laborRates || global.LABOR_RATES || {},
          defaultRule: opts.defaultRule || global.SEQUENCE_DEFAULT,
          nameOverrides: opts.nameOverrides || global.SEQUENCE_NAME_OVERRIDES,
          scheduleGate: opts.scheduleGate || global.ScheduleGate,
          template: tpl
        });
      } catch (e) {
        res = { ok: false, reason: 'exception: ' + (e && e.message) };
      }
      var materializeMs = _now() - t0;
      if (!res || !res.ok) {
        _busy = false;
        var reason = (res && res.reason) || 'unknown';
        console.log('§SCHED_INJECT_FAIL reason=' + reason + ' ms=' + materializeMs.toFixed(0));
        // Honest degrade, never the dead-end "needs a baked schedule" message (§S7-INJECT rule 3).
        progress.fail('Could not generate a construction programme (' + reason + ').');
        return { ok: false, reason: reason, materializeMs: materializeMs };
      }
      var schedId = res.scheduleId || 'SCH_AUTHORED';
      // ── HONESTY — provenance goes in schedules.name, nowhere else (see header) ──────────────────
      try { d.run('UPDATE schedules SET name=? WHERE schedule_id=?', [GEN_NAME, schedId]); }
      catch (e) { console.log('§SCHED_INJECT_NAME_FAIL ' + (e && e.message)); }
      console.log('§SCHED_INJECT materialized schedule=' + schedId +
        ' tasks=' + (res.zoneCount != null ? res.zoneCount : '?') +
        ' templateVersion=' + (res.templateVersion || 'legacy(no-template)') +
        ' ms=' + materializeMs.toFixed(0));
      progress.stage('saving');
      return _yield().then(function () {
        if (!A.DB_URL) {
          _busy = false;
          console.log('§SCHED_INJECT_PERSIST_SKIP reason=no_db_url');
          var outNoUrl = { ok: true, scheduleId: schedId, persisted: false, reason: 'no_db_url',
            materializeMs: materializeMs, taskCount: res.zoneCount, templateVersion: res.templateVersion };
          progress.done(outNoUrl);
          return outNoUrl;
        }
        var tp0 = _now();
        // immediate:true — a deliberate one-time commit, same as schedule_author_ui.js's Apply-to-4D
        // (§SE-6); do not let the default 1200ms debounce delay the honest result the UI reports.
        return SA.persistDb(d, A.DB_URL, { immediate: true }).then(function (saved) {
          var persistMs = _now() - tp0;
          _busy = false;
          var out = { ok: true, scheduleId: schedId, persisted: !!saved,
            materializeMs: materializeMs, persistMs: persistMs,
            taskCount: res.zoneCount, templateVersion: res.templateVersion };
          console.log('§SCHED_INJECT_RESULT persisted=' + !!saved +
            ' materializeMs=' + materializeMs.toFixed(0) + ' persistMs=' + persistMs.toFixed(0));
          progress.done(out);
          return out;
        });
      });
    });
  }

  function isBusy() { return _busy; }

  // ── DOM progress (§S7-INJECT UI ruling: "a progress bar, not a spinner") ──────────────────────────
  // Reuses the existing #status-row / A.status surface (viewer.html) rather than inventing a new
  // chrome element — a thin two-checkpoint bar in the SAME visual idiom as import.js's
  // #import-progress-bar / time_machine.js's #tm-progress-bar (a track + a width/colour-animated
  // fill), inserted next to the status text so it reads as part of the app's one existing status
  // surface, not a new dialog. Two checkpoints (not a smooth animation) because that is all that is
  // REAL here: materializeZones is one synchronous call with no incremental progress to report, and
  // persistDb is one IndexedDB transaction — fabricating intermediate percentages would be inventing
  // progress that doesn't exist (Prime Directive: non-invent). What IS real and load-bearing is
  // reporting the PERSIST OUTCOME instead of looking done the instant materialize finishes.
  function _domProgress(A) {
    if (typeof document === 'undefined') {
      // Node / no DOM — degrade to A.status-only if a stub happens to provide one, else silent.
      return {
        stage: function () {},
        fail: function (msg) { if (A && A.status) A.status.textContent = msg; },
        done: function (res) {
          if (!A || !A.status) return;
          A.status.textContent = res.persisted
            ? 'Programme generated — saved, won’t need regenerating.'
            : 'Programme generated — kept for this session (too large to cache).';
        }
      };
    }
    var wrap = document.getElementById('s7-inject-progress-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 's7-inject-progress-wrap';
      wrap.style.cssText = 'width:100%;height:3px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;display:none';
      var bar = document.createElement('div');
      bar.id = 's7-inject-progress-bar';
      bar.style.cssText = 'height:100%;width:0%;background:#4fc3f7;transition:width 0.25s,background 0.25s';
      wrap.appendChild(bar);
      var row = document.getElementById('status-row');
      if (row && row.parentNode) row.parentNode.insertBefore(wrap, row.nextSibling);
      else document.body.appendChild(wrap);
    }
    var bar = document.getElementById('s7-inject-progress-bar');
    function setBar(pct, color) { wrap.style.display = 'block'; bar.style.width = pct + '%'; bar.style.background = color; }
    function setStatus(msg) { if (A && A.status) A.status.textContent = msg; }
    function hideLater() { setTimeout(function () { wrap.style.display = 'none'; bar.style.width = '0%'; }, 2500); }
    return {
      stage: function (name) {
        if (name === 'materializing') { setBar(12, '#4fc3f7'); setStatus('Generating construction programme — materializing…'); }
        else if (name === 'saving') { setBar(60, '#4fc3f7'); setStatus('Generating construction programme — saving…'); }
      },
      fail: function (msg) { setBar(100, '#e05252'); setStatus(msg); hideLater(); },
      done: function (res) {
        var msg = res.persisted
          ? 'Programme generated — saved, won’t need regenerating.'
          : 'Programme generated — kept for this session (too large to cache).';
        setBar(100, res.persisted ? '#57c07a' : '#e0a840');
        setStatus(msg);
        hideLater();
      }
    };
  }

  var API = { inject: inject, isBusy: isBusy, GEN_NAME: GEN_NAME, START: START };
  if (typeof window !== 'undefined') window.ScheduleInject = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.ScheduleInject = API;

  console.log('§SCHEDULE_INJECT_LOADED v1');
})(typeof self !== 'undefined' ? self : this);
