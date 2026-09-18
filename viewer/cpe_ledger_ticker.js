/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * cpe_ledger_ticker.js — §129.2 LEDGER TICKER (bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md
 * §129.2, implementation notes §129.4 v8). NOT a second visual pass over the geometry (replaying by
 * ledger id would look like a scrambled build, per the spec's own "hence HUD, not motion"). This is
 * a HUD row during the buildup — `ops verified n/N · remaining N-n · tip <hash[0:12]>` — counting up
 * as the kernel_ops chain's OWN verification result (real: erp/kernel_ops.js's `verifyChain`, FULL
 * from genesis, never the cached/incremental variant — see the v2 note at the call site — and never
 * re-derived here) is revealed over the buildup window, sealing/locking at topout.
 *
 * NON-INVENT: the chain check is `erp/kernel_ops.js`'s own `verifyChain` — this module never hashes
 * or verifies anything itself. It only (a) checks whether EVERY row of the LIVE `A.db` has been
 * sealed (op_hash IS NOT NULL, ALL of them — a partially-sealed chain is INCONCLUSIVE too, hardened
 * 2026-09-15 after a real HHS bake let 3-of-6884 sealed through) before trusting a count, and (b)
 * drives one FULL verification pass at BUILD time, then paints a count-up OF THAT ALREADY-KNOWN
 * RESULT across the buildup — the "ID ORDER vs 4D ORDER" spec note is explicit that this counts the
 * RECORD's own append order, not the construction sequence, so there is no per-element correspondence
 * to draw.
 *
 * PREFLIGHT (the real constraint, §129.2): a DB must be sealed AFTER the schedule capture rewrote
 * every ELEMENT_PLACE op's timestamp/parameters, never before (scripts/loadpath_ledger_preflight.js
 * does that, on a DB COPY, out of band, before the bake process starts — this module NEVER seals,
 * only verifies the LIVE, already-loaded `A.db`).
 *
 * ONE PURE BUILD, PER-FRAME APPLY, PER-FRAME 2D COMPOSITE, ONE DISPOSE — the same four-hook shape
 * cpe_flythru_cues.js/cpe_load_path.js already use, so cinema_maxq.js's bake loop wires this exactly
 * like its neighbours.
 *
 * Witness lines: §LEDGER_TICKER (build/final), §KRN_CHAIN (erp/kernel_ops.js's own line, plus this
 * module's own richer `verified=N/N tip=… sealedAfterCapture=true` line once verify resolves).
 * Control tap: window.__ledgerFlipByte=<id> (alters that op's `parameters` on the LIVE in-memory db
 * before verify runs — verify must fail AT that id, HUD must show "broken at op <id>").
 * No pixel evidence — every claim is a printed value, never a frame judgement.
 */
function setupCpeLedgerTicker(A) {
  'use strict';

  var LOCK_SEC = 2.0;   // §129.2 WHAT — the tip locks for 2s at topout, N/N verified.

  var _lt = null;   // this build's whole state, or null if never built / build failed / INCONCLUSIVE

  function _err(fn, e) { console.warn('§LEDGER_TICKER_' + fn + '_ERR ' + (e && e.message)); }

  function _hasKernelOps(db) {
    try {
      var r = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='kernel_ops'");
      return !!(r && r.length && r[0].values.length);
    } catch (e) { return false; }
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // A.ledgerTickerBuild(plan, filmSecFull, topoutU, db) — once, before the frame loop.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  A.ledgerTickerBuild = async function (plan, filmSecFull, topoutU, db) {
    _lt = null;
    try {
      db = db || A.db;
      if (!db) { console.log('§LEDGER_TICKER INCONCLUSIVE reason=no-db'); return; }
      var KO = (typeof window !== 'undefined' && window.KernelOps) || A.KernelOps;
      // §KRN_CHAIN v2 (2026-09-15, after a real HHS bake) — verifyChain, NOT verifyChainIncremental:
      // see the full reasoning at the call site below. Guard both so a missing/renamed export fails
      // loud (INCONCLUSIVE), never a silent fall-through to the wrong one.
      if (!KO || typeof KO.verifyChain !== 'function') {
        console.log('§LEDGER_TICKER INCONCLUSIVE reason=no-KernelOps'); return;
      }
      if (topoutU == null) { console.log('§LEDGER_TICKER INCONCLUSIVE reason=no-topout (no buildup on this bake)'); return; }
      if (!_hasKernelOps(db)) { console.log('§LEDGER_TICKER INCONCLUSIVE reason=no-kernel-ops-table'); return; }
      var totalR = db.exec('SELECT COUNT(*) FROM kernel_ops');
      var total = (totalR.length && totalR[0].values.length) ? totalR[0].values[0][0] : 0;
      if (!total) { console.log('§LEDGER_TICKER INCONCLUSIVE reason=no-kernel-ops (table empty)'); return; }

      // Control tap: __ledgerFlipByte=<id> — alter that op's OWN `parameters` on the LIVE in-memory
      // db, before verify runs. This is the module's own doing (not the tap script's — the db does
      // not exist yet when a --tap file runs at document-start), same idiom as cpe_load_path.js's
      // window.__lp* booleans, just carrying a value instead of a flag.
      if (typeof window !== 'undefined' && window.__ledgerFlipByte != null) {
        try {
          db.run("UPDATE kernel_ops SET parameters = parameters || '_TAMPERED' WHERE id = ?", [Number(window.__ledgerFlipByte)]);
          console.log('§LEDGER_TICKER control __ledgerFlipByte id=' + window.__ledgerFlipByte + ' applied');
        } catch (eflip) { _err('BUILD', eflip); }
      }

      // §129.2 PREFLIGHT — HARDENED 2026-09-15 after a real HHS bake showed the old gate
      // (`sealedBefore === 0`) letting a PARTIALLY sealed DB through: `sealedBefore=3` of
      // `total=6884` reached verify and printed a nonsense `final=6883/6884 tip=? ... => FAIL`
      // instead of the spec-required INCONCLUSIVE. The gate is ALL-OR-NOTHING: every row must carry
      // a real op_hash, or this beat has nothing true to show — UNLESS this bake can fix that itself
      // (see the bake-owned branch below); otherwise no HUD row, no verify call, full stop.
      var sealedR = db.exec('SELECT COUNT(*) FROM kernel_ops WHERE op_hash IS NOT NULL');
      var sealedBefore = (sealedR.length && sealedR[0].values.length) ? sealedR[0].values[0][0] : 0;
      var sealedBy = 'preflight';   // this DB arrived already fully sealed (scripts/loadpath_ledger_preflight.js)
      if (sealedBefore !== total) {
        // §LEDGER_TICKER v3 (2026-09-15, after a real HHS bake: file on disk was 6883/6883 sealed
        // per BOTH the preflight script and a direct sqlite3 check, yet this bake's own page opened
        // it at sealed=3/6884). Mechanism, from that same bake's own log: Time Machine's activation
        // found the persisted schedule's generation STALE against the current generator
        // (`§KERNEL_OPS_SCHED_VERSION stale genVersion=38 current=39`), DELETEd every ELEMENT_PLACE
        // op and re-materialized them fresh (`§WRITE_LOOP_TIMING`) — IN THIS PAGE, AFTER the sealed
        // file was already read from disk, with no seal step of its own. An out-of-band, file-level
        // seal cannot survive that: only the 3 non-ELEMENT_PLACE ops (never touched by the
        // regeneration) kept their hash. The fix is to seal the LIVE db, in-page, right here — but
        // ONLY in bake-owned mode (A._bakeOwned, scene.js's own `!!window.__MAXQ_SILENT` flag: a
        // controlled, repeatable, non-interactive pipeline), and only AFTER Time Machine's own
        // activation has FULLY finished. This call is already guaranteed downstream of that: this
        // beat's own build is invoked from cinema_maxq.js's bake body strictly after
        // `await window.tmActivateForBake()` resolves — the SAME "activation complete" signal
        // §CPE_BUILDUP's own buildup-ordering logic already gates on (tmActivateForBake itself only
        // resolves once `_bakeTimelineReady()` is true, which time_machine.js only sets AFTER
        // injectGantt's own `§GANTT_CACHE_SAVE`/`afterLoadOps` line) — so this is a real
        // "seal what THIS bake just finished materializing," never a poll or a guess at timing.
        // OUTSIDE bake-owned mode (a live interactive editor session) sealing stays exactly as
        // forbidden as before — a human did not ask for it, and may still be mid-edit.
        if (A._bakeOwned) {
          // ROUND 4 item 4 (2026-09-16, real Terminal bake, no tap): a real, on-disk stale-partial-
          // seal defect — id=48431 was ALREADY sealed (from an OLD chain, before this page's own
          // re-injection), so an INCREMENTAL sealFrom chained the newly-materialized rows onto that
          // stale tip while never re-hashing 48431 itself, and its own prev_hash pointer no longer
          // matched anything real — `verifyChain` broke at id=48431 with nothing tampered. Bake mode
          // NEVER trusts whatever sealed state the DB happens to carry in: `full=true` re-seals
          // EVERY row from id 1, overwriting every existing op_hash/prev_hash unconditionally.
          try { await KO.sealFrom(db, null, true); } catch (eSeal) { _err('BUILD', eSeal); }   // prints its own §KRN_SEAL_FROM mode=full line
          var sealedAfterR = db.exec('SELECT COUNT(*) FROM kernel_ops WHERE op_hash IS NOT NULL');
          sealedBefore = (sealedAfterR.length && sealedAfterR[0].values.length) ? sealedAfterR[0].values[0][0] : 0;
          if (sealedBefore !== total) {
            console.log('§LEDGER_TICKER INCONCLUSIVE reason=seal-failed sealed=' + sealedBefore + '/' + total);
            return;
          }
          sealedBy = 'bake';
        } else {
          console.log('§LEDGER_TICKER INCONCLUSIVE reason=unsealed sealed=' + sealedBefore + '/' + total);
          return;
        }
      }

      // `tip` — the last row's OWN op_hash, read straight from the DB, never derived from a verify
      // result (verifyChain's own failure object carries NO `tip` field at all — the exact cause of
      // the real bake's literal "tip=?"). Guaranteed non-null here since sealedBefore===total was
      // just confirmed; a null read anyway is a genuine data inconsistency, not "unsealed" — a
      // DISTINCT INCONCLUSIVE reason so the two causes are never conflated in a log.
      var tipR = db.exec('SELECT op_hash FROM kernel_ops ORDER BY id DESC LIMIT 1');
      var dbTip = (tipR.length && tipR[0].values.length) ? tipR[0].values[0][0] : null;
      if (!dbTip) {
        console.log('§LEDGER_TICKER INCONCLUSIVE reason=notip');
        return;
      }
      // So the film's own log states, unambiguously, which chain it is about to verify — the one
      // this bake JUST sealed in-page (after its own re-injection), or the one that arrived already
      // sealed (the preflight-script path). Printed regardless of `sealedBy` so a log reader never
      // has to infer it from the ABSENCE of a §KRN_SEAL_FROM line a few frames up.
      console.log('§LEDGER_TICKER sealedBy=' + sealedBy + (sealedBy === 'bake' ? ' sealedAt=afterInject' : '') +
        ' sealed=' + sealedBefore + '/' + total + ' tip=' + String(dbTip).slice(0, 12) + '…');

      _lt = {
        ok: true, db: db, total: total, filmSecFull: filmSecFull, topoutU: topoutU,
        ready: false, verified: 0, tip: dbTip, chainTipStr: null, chainOk: null, brokeAt: null,
        lockedFrom: null, finalFired: false, displayVerified: 0
      };
      // §KRN_CHAIN v2 — verifyChain (FULL, from genesis), NEVER verifyChainIncremental. kernel_ops.js's
      // own header on the incremental path says its cached prefix "is trusted because THIS session
      // already verified it against the same in-RAM db" and that an in-RAM tamper BEHIND the cached
      // tip is caught only by the NEXT FULL verify — "Boot/import/merge paths must keep calling
      // verifyChain." This ticker's build is exactly a boot check (the first look at this DB in this
      // context) and must never trust a `db.__krnVerifiedTip` some earlier, unrelated call in this
      // same page session may have warmed against a DIFFERENTLY-sealed moment of the same live db
      // object — the leading candidate for the real HHS bake's own "verified=6883 on 3 sealed"
      // anomaly (item 3 of the review). verifyChain walks from GENESIS and only advances `prev` (i.e.
      // only counts a row) once its OWN stored hash has been confirmed to chain-link — so its `len`
      // on success, or `brokeAt` on failure, is an authoritative "ops whose op_hash verified against
      // prev_hash" count, never a second, re-implemented check. ASYNC (per-op SHA-256 over
      // crypto.subtle) — run ONCE here, at build time, the same one-time-DB-pass cost this beat's
      // sibling cpe_load_path.js already accepts for SupportSweep.contactGraph.
      KO.verifyChain(db).then(function (res) {
        if (!_lt) return;   // disposed before verify resolved
        _lt.ready = true;
        _lt.chainOk = !!res.ok;
        _lt.verified = res.ok ? (res.len != null ? res.len : total) : Math.max(0, (res.brokeAt || 1) - 1);
        _lt.brokeAt = res.ok ? null : res.brokeAt;
        // chainTip: the verify's OWN confirmed tip on success (must equal the DB-read `tip` by
        // construction — both name the same last row's hash, a free consistency check). On failure
        // there is no confirmed tip (the chain broke before reaching it) — printed as the literal
        // word 'broken', never a fabricated hash and never the bare '?' the earlier version printed.
        _lt.chainTipStr = res.ok ? String(_lt.tip).slice(0, 12) + '…' : 'broken';
        console.log('§KRN_CHAIN verified=' + _lt.verified + '/' + total +
          ' tip=' + String(_lt.tip).slice(0, 12) + '…' +
          ' chainTip=' + _lt.chainTipStr +
          ' sealedAfterCapture=true' + (_lt.chainOk ? '' : ' brokenAt=' + _lt.brokeAt));
      }).catch(function (e) {
        if (!_lt) return;
        _err('BUILD', e); _lt.ready = true; _lt.chainOk = false; _lt.verified = 0; _lt.chainTipStr = 'broken';
      });
      console.log('§LEDGER_TICKER build total=' + total + ' sealedBefore=' + sealedBefore +
        ' window=[0,' + topoutU.toFixed(4) + '] (verify running async, one pass, full not incremental)');
    } catch (e) { _err('BUILD', e); _lt = null; }
  };

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // A.ledgerTickerApplyVisual(plan, tNorm) — every frame; (null, 0) forces a dispose/no-op.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  A.ledgerTickerApplyVisual = function (plan, tNorm) {
    try {
      if (plan === null) return;
      if (!_lt || !_lt.ok || !_lt.ready) { _lt && (_lt.displayVerified = 0); return; }
      var atTopout = tNorm >= _lt.topoutU;
      if (!atTopout) {
        // §129.2 WHAT — "a count-up ... counting up as each placed element's op is verified": the
        // real verification is already fully known (see BUILD); the buildup window [0,topoutU] is
        // what PAINTS that already-known result count up smoothly, never a second live check.
        var frac = _lt.topoutU > 0 ? Math.max(0, Math.min(1, tNorm / _lt.topoutU)) : 1;
        _lt.displayVerified = Math.min(_lt.verified, Math.floor(_lt.verified * frac));
      } else {
        if (_lt.lockedFrom == null) _lt.lockedFrom = tNorm * _lt.filmSecFull;
        _lt.displayVerified = _lt.verified;
        // §129.2 WHAT — "the tip LOCKS for 2 s" — a HOLD, not a permanent fixture; the row stops
        // drawing once LOCK_SEC has elapsed since topout (CompositeOntoCanvas checks this via
        // `_lt.visibleUntil`, computed once here against the SAME filmSecFull clock the hold uses).
        if (_lt.visibleUntil == null) _lt.visibleUntil = _lt.lockedFrom + LOCK_SEC;
        if (!_lt.finalFired) {
          _lt.finalFired = true;
          var ok = _lt.chainOk && (_lt.displayVerified === _lt.verified);
          console.log('§LEDGER_TICKER final=' + _lt.displayVerified + '/' + _lt.total +
            ' tip=' + String(_lt.tip).slice(0, 12) + '…' +
            ' chainTip=' + (_lt.chainTipStr || 'broken') +
            (_lt.chainOk ? '' : ' brokenAt=' + _lt.brokeAt) +
            ' => ' + (ok ? 'PASS' : 'FAIL'));
        }
      }
    } catch (e) { _err('APPLY', e); }
  };

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // A.ledgerTickerCompositeOntoCanvas(ctx, w, h, filmSec) — every captured frame, 2D pass.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // §129.6 item 6b (2026-09-15) SUPERSEDES the earlier free-floating draw: the ledger is now a ROW
  // of the pie-chart HUD (cpe_resource_panel.js's own resourcePanelCompositeOntoCanvas), directly
  // below the Cost row, drawn by THAT panel's row routine — this module never touches a canvas
  // again, it only reports its own current text. Kept as a no-op (not deleted) so cinema_maxq.js's
  // existing `if (A.ledgerTickerCompositeOntoCanvas)` call site needs no edit.
  A.ledgerTickerCompositeOntoCanvas = function () {};
  function _spaceThousands3(n) {
    var s = String(Math.round(n)), neg = s.charAt(0) === '-';
    if (neg) s = s.slice(1);
    s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (neg ? '-' : '') + s;
  }
  // The panel's own row string — FULL form, spec examples (§129.6 item 6b), verbatim:
  //   mid-buildup: "Ledger   2 418 / 6 884 verified · 4 466 remaining · tip 90331b9180a2"
  //   topout:      "Ledger   6 884 / 6 884 verified · tip 90331b9180a2 ✓"
  //   tampered:    "Ledger   2 / 6 884 verified · broken at op 3"
  // §129.7 item 4 (2026-09-16, user: "the pie can occupy its own width, and the lines sitting below
  // it, to get max width space... no wrapping I think not") RE-DESIGNED the SHORT form (`short=true`,
  // for when even the panel's now FULL-WIDTH row still does not fit `ctx.measureText` — never
  // ellipsis, a text shortened BY DESIGN): tightened spacing, no spaces around "/", 8-hex tip.
  // Spec's own literal examples (§129.7 item 4, supersedes §129.6 6b's earlier short form):
  //   mid-buildup: "Ledger 2 418/6 884 · tip 86791703"
  //   topout:      "Ledger 6 884/6 884 ✓ 86791703" (unchanged wording from the prior short form —
  //                 ✓ before a bare hex, no "tip" word — only the "/" spacing tightens)
  //   tampered:    "Ledger 2/6 884 · broken at op 3"
  // Returns null when there is nothing true to show (build not ready/INCONCLUSIVE) — the panel
  // simply omits the row rather than drawing a confident blank.
  A.ledgerTickerRowText = function (short) {
    if (!_lt || !_lt.ok || !_lt.ready) return null;
    var n = _lt.displayVerified, N = _lt.total;
    var tip12 = _lt.tip ? String(_lt.tip).slice(0, 12) : '';
    var tip8 = _lt.tip ? String(_lt.tip).slice(0, 8) : '';
    if (!_lt.chainOk && _lt.brokeAt != null && n >= _lt.brokeAt - 1) {
      return short
        ? 'Ledger ' + _spaceThousands3(n) + '/' + _spaceThousands3(N) + ' · broken at op ' + _lt.brokeAt
        : 'Ledger   ' + _spaceThousands3(n) + ' / ' + _spaceThousands3(N) + ' verified · broken at op ' + _lt.brokeAt;
    }
    if (n >= N) {
      return short
        ? 'Ledger ' + _spaceThousands3(N) + '/' + _spaceThousands3(N) + ' ✓ ' + tip8
        : 'Ledger   ' + _spaceThousands3(N) + ' / ' + _spaceThousands3(N) + ' verified · tip ' + tip12 + ' ✓';
    }
    return short
      ? 'Ledger ' + _spaceThousands3(n) + '/' + _spaceThousands3(N) + ' · tip ' + tip8
      : 'Ledger   ' + _spaceThousands3(n) + ' / ' + _spaceThousands3(N) + ' verified · ' +
        _spaceThousands3(N - n) + ' remaining · tip ' + tip12;
  };

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  A.ledgerTickerDispose = function () {
    _lt = null;
  };

  console.log('§LEDGER_TICKER_INIT wired gate=measure (§129.2 v2 — gate requires ALL rows sealed, ' +
    'build runs one FULL verifyChain (never incremental/cached) against the live A.db, buildup ' +
    'paints the count-up, topout locks 2s; control: window.__ledgerFlipByte=<id>)');
}
if (typeof window !== 'undefined') window.setupCpeLedgerTicker = setupCpeLedgerTicker;
if (typeof module !== 'undefined' && module.exports) module.exports = setupCpeLedgerTicker;
