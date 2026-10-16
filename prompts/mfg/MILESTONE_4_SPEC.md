# ⚠ DO NOT REMOVE — Milestone 4: W-MFG-ASOF (scope: BOM explosion as of a date via ValidFrom/ValidTo; read the log after every run)

Parent: `Manufacturing Model Milestones and Contracts.md` row W-MFG-ASOF + design rule 4. Worktree `/tmp/wt-mfg`, branch `feat/mfg-wire`.

## Issue it proves or disproves
Exploding a BOM "as of" a date returns that date's component list: a line is in only while ValidFrom <= date <= ValidTo (both ends inclusive, either may be empty). Ignoring ValidTo
must make an expired line reappear and the witness go red. The as-of date is an INPUT (no clock), so the answer is replayable.

## Facts measured 2026-10-14
- Dictionary text (AD_Element, extracted): ValidFrom = "Valid from including this date (first day)"; ValidTo = "Valid to including this date (last day)". => inclusive at both ends, day granularity.
- REAL from-side data exists: 2 template lines carry ValidFrom 2008-09-22 (BOM 50006 "Fertilizer" line 30 = pp_product_bomline 50016; BOM 50003 "PFrontLeg" line 20 = 50008); 16 lines 2007-09-22, 3 lines 2003-01-21.
  Legacy orders 50000/50001 start 2008-08-16 on BOMs whose lines start 2007-09-22: all effective, consistent with the M3 oracle.
- NO real to-side data: 0 template headers/lines with ValidTo in the seed AND in the reference Postgres. The ValidTo cases are therefore a labelled FIXTURE (a copy of a real BOM with ValidTo set
  on one real line), printed as such; they test our logic, they are not legacy evidence.
- Libero's effectivity code is not in the local tree; the date semantics above come from the dictionary text only.

## Design (extends erp/mfg_snapshot.js, no kernel change)
- `isEffective(validfrom, validto, asOf)`: compares the YYYY-MM-DD prefix as ISO strings (no Date object, no clock). Empty/null bound = open.
- `explodeAsOf(q, bomId, asOf)` -> { header, lines, excluded:[{line, why}] } pure; `explodeOps` calls it, so order creation snapshots only the lines effective at `order.asOf`.
- `order.asOf` is REQUIRED (refuse 'asof-required' rather than read a clock). Header not effective at asOf -> refuse by name 'not-effective:<bom>' (conservative: legacy behaviour unevidenced).
- M3 witness updated to pass the legacy order's DateStartSchedule as asOf.

## Witness `erp/tests/witness_mfg_asof.js` (tag `§MFG-ASOF`)
- A1 REAL BOM 50006: as-of 2008-08-16 and 2008-09-21 exclude line 30; 2008-09-22 (first day) and 2030-01-01 include it. A2 REAL BOM 50003 line 20 likewise.
- A3 FIXTURE ValidTo: last day included, day after excluded, earlier included.
- A4 header not effective (a real BIM header with ValidFrom 2026-07-03, as-of 2008-08-16) refused by name; missing asOf refused.
- A5 order integration (BOM 50003; BOM 50006 has percentage lines, which M3 refuses): two orders on the same template, dates before/after 2008-09-22, get different snapshots; replay-from-log hash == live for both.
- A6 non-vacuity: the date windows actually exclude something; INCONCLUSIVE otherwise. A7 no clock: Date is made to throw while explodeAsOf runs.
- Deliberate breaks (must be red, named): `MFG_BREAK=ignoreto` (ValidTo ignored -> fixture expired line reappears), `MFG_BREAK=exclusive` (ValidFrom treated exclusive -> first-day line missing).

## RESULT 2026-10-14 (logs: ~/Projects/Mfg/logs/w_mfg_asof_{green,ignoreto,exclusive}.log)
- Green, 7 checks, exit 0. A1 REAL BOM 50006: as-of 2008-08-16 -> lines 10,20,40; 2008-09-21 -> same; 2008-09-22 (first day) and 2030-01-01 -> line 30 present. A2 REAL BOM 50003: 10,30 before / 10,20,30 on 2008-09-22.
  A3 FIXTURE ValidTo: last day (2008-12-31) in, 2009-01-01 out. A4 header ValidFrom 2026-07-03 as-of 2008 refused `not-effective:PP_Product_BOM#50007`; missing date refused `asof-required`.
  A5 orders created 2008-08-16 / 2008-09-22 snapshot lines 10,30 / 10,20,30; replay hash == live. A6 windows excluded 2 lines (non-vacuous). A7 no clock.
- Breaks red: `ignoreto` -> A3 (expired line reappears) + A6; `exclusive` -> A1, A2, A5 (first-day line missing).
- Instrument finding: sql.js itself reads the clock inside db.exec (sql-wasm.js:119); A7 therefore feeds the module an in-memory query, isolating mfg_snapshot.js. A first attempt that forbade Date around sql.js failed for that reason, not because of the module.
- Changed: erp/mfg_snapshot.js (+isEffective, +explodeAsOf, order.asOf required, snapshot records asof), erp/tests/witness_mfg_snap.js now passes the legacy DateStartSchedule as asOf (M3 still green, its 2 breaks still red).
- LIMITS (named): to-side evidence is a fixture only (no real ValidTo anywhere); header-not-effective refusal and day-granularity/inclusive semantics rest on dictionary text, not on Libero code (absent locally);
  BOM version SELECTION (which of several BOMs is effective for a product at a date) is not done here; Revision / M_ChangeNotice overlay (rule 4) is a later step.

## CORRECTION 2026-10-15 (after the conventions study, CONVENTIONS_STUDY.md §4-5) - supersedes the "day granularity / inclusive last day / not evidenced" statements above
- The legacy source IS local: org.adempiere.base/src/org/eevolution/model/MPPProductBOM.java (:155-185 getDefault, :195-232 get(product,org[,valid]), :296-312 getLines(valid), :340-352 getLines(true), :362-371 isValidFromTo) and
  MPPProductBOMLine.java :304-313. `isValidFromTo` is `validFrom != null && date.before(validFrom) -> false; validTo != null && date.after(validTo) -> false`: an EXACT timestamp compare. My day-granularity version was wrong
  (it would keep a line valid at 2008-12-31 10:00 for ValidTo 2008-12-31 00:00; Java drops it). An ineffective header is the NULL BOM of `get(...valid)`, not an error; lines are ACTIVE only, ORDER BY Line.
- Now ported verbatim in erp/mfg_snapshot.js: isValidFromTo, getLines(valid), getDefault (BOMUse=A, BOMType=A, active, org tie-break, null when several and org 0), bomGet (= get(product,org,valid) with an injectable planning-BOM
  step). NOT ported (named): the planning-BOM branch :200-209 (needs MOrgInfo warehouse -> plant -> MPPProductPlanning.get :94-143).
- Witness now 10 checks: A8 exact timestamps (real ValidFrom 2008-09-22 00:00:00 one second either side; fixture ValidTo midnight in at 00:00:00, out at 00:00:01), A9 inactive line excluded (fixture) + order by Line,
  A10 default BOM / ambiguity (fixture) / null header. New break `daygran` re-introduces the old bug and is caught ONLY by A8 (the previous witness passed it). Real data still covers ValidFrom only; ValidTo, inactive line, and two-default-BOM cases remain labelled fixtures.
- Lesson recorded: two fixture mistakes in this pass (id collision between fixtures; a comment swallowing a statement; fixtures sharing a product so the default-BOM rule correctly returned null) were found by diagnosing, not by loosening a check.
