<!-- Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT -->
# ⚠ DO NOT REMOVE — RESUME: Modeller — Terminal open speed (signing gap) + roof/IfcPlate fast-placement

**Scope.** Follow-on to the 2026-07-01 session that fixed three confirmed defects (Terminal never opened, illegal
LOD200 geometry, and the actual root cause — a rotation radians/degrees unit bug corrupting every rotated wall in
every building). Those three fixes are **DONE, committed, and pushed**: bim-ootb branch
`fix/modeller-terminal-load-lod400` (PR: https://github.com/red1oon/bim-ootb/pull/new/fix/modeller-terminal-load-lod400,
not yet opened/merged — open it before continuing). **Read the log after every run.** Honour this preamble until
the remaining item below is `✅ DONE`.

## ✅ DONE this session (2026-07-01, commit d28b4c7 on the branch above)
1. **Terminal never opened** — `arc_editable.js buildSeedOps` hardcoded `ORDER BY m.id`; `Terminal_meta.db`'s
   `elements_meta` has no `id` column (guid-only PK). Fixed: runtime schema detection, falls back to `ORDER BY guid`.
2. **119-180s+ stall once seeding worked** — 3x-redundant crypto hash/sign pass, O(char-concat) base64 autosave
   (~108s alone), and an Outliner "Components" category building one DOM row per raw-bbox ARC insert (~80s). Fixed:
   `sealFrom` trusts an already-chained hash, chunked base64, chunked+yielded mesh-build with `setStat` progress,
   Components category excludes hash-less ARC rows. **Terminal now opens in ~14s** (from never-loads).
3. **Illegal LOD200 boxy geometry** — honest partial fix: ARC-seeded + DiscWalker elements now match against the 3
   existing real-mesh catalog items (Column/Beam/Door) by class+dimension (5% tolerance); matches upgrade to LOD-300,
   rest stays honestly LOD-200 (logged). Full LOD400 buildout (23,888-row `component_library.db`) still open, separate.
4. **THE root cause of "geometry hell"** (user screenshot, Duplex) — `element_transforms.rotation_z` is RADIANS; the
   ARC seed path fed it straight into a DEGREES-expecting pipeline (`bonsai_library.js place()`), shrinking every
   rotated wall's yaw ~57x. Fixed at the seed boundary (`rot: rz * 180 / Math.PI`). Verified numerically across
   SampleHouse (19/19), SampleCastle (1942/1942), Duplex (134/134) rotated elements now landing at their true angle.
   New falsifiable regression guard (A9/A10 in `witness_arc_editable.js`) — proven to actually catch the bug
   (reverted the fix, watched it fail 0/19, restored, confirmed pass).

All green: 12/12 `witness_e2e_*.js`, `witness_arc_editable.js` 10/10, new `witness_e2e_terminal_open.js` 7/7, new
`witness_e2e_lod_match.js` 6/6.

## ⛔ OPEN — Terminal's remaining 14s vs the Viewer's near-instant load (even at LTU's 122K elements)
**User's standard (re-stated 2026-07-01): the Modeller must follow the Viewer's proven approach, not maintain a
separately-reinvented one.** The Viewer never signs anything (pure read-only display: stream rows → `InstancedMesh`/
`BatchedMesh`, zero crypto). The Modeller's ARC-editable substrate signs **every** seeded element (all 35,552 of
Terminal's ARC rows) as an individually hash-chained, signed `GEOM_INSERT` op, eagerly, before anything renders —
because `arc_editable.js` (§ARC-1) was built to make every element gizmo-editable/undo-safe via the signed op-log.

Profiled 2026-07-01 (`witness_e2e_terminal_open.js`'s `§STAT-TRACE`): of the 14.1s open, **~6-7s is the crypto
signing phase alone** (`kernel_ops.js commitGroup`'s per-op `_sha256`/`_signer.sign` loop — 71,104 total async
`crypto.subtle.digest` calls for 35,552 ops: one for the hash chain, one for the signature).

**Two candidate fixes were scoped, NEITHER fully implemented/verified yet — pick up here:**

### Candidate A — lazy signing / promote-on-touch (bigger, riskier, was in progress, PAUSED not lost)
Render the pristine substrate unsigned (Viewer-style — `InstancedMesh` grouped by `ifc_class`, zero op-log commit).
Only promote ONE element to a signed `GEOM_INSERT` op the moment a user actually edits it (Move/Rotate/Scale/Cut/
Delete/Fillet). An agent was mid-investigation on this (reading `modeller.html`'s move/rotate/scale drag handlers,
`_dwRoot`, script load order) when the session was closed — **it had NOT yet written any code** (confirmed via
`git status` — worktree was unchanged from the committed state when stopped), so there is no partial/broken work to
clean up, but also no head start beyond the brief itself. Full task brief (file:line pointers, exact constraints,
witness requirements) is preserved in this session's transcript if picked up by the same agent framework — otherwise
re-derive from the "concrete scope" list: pristine `InstancedMesh` render path, guid↔instance addressing (mirror
`dlod.js`'s `_instanceMeta` pattern), promotion mechanism, idempotent-reopen reconciliation (mirror `_replayEdits`/
`swbReplay`'s pattern for STR), undo/redo scope decision.

### Candidate B — stop paying async dispatch overhead per hash (smaller, lower-risk, evidence-backed, NOT YET DONE)
`kernel_ops.js _sha256` and `bonsai_oplog.js sha256hex` both use `crypto.subtle.digest` — the **async** Web Crypto
API — called sequentially (unavoidable for the hash-CHAIN half, since `op_hash[i]` depends on `op_hash[i-1]`; the
SIGNATURE half is NOT chain-dependent and could be `Promise.all`-batched independently, a separate smaller win).
Node benchmark (2026-07-01, this session, `node -e` one-liner, not yet re-verified in-browser): 35,552 sequential
links —
- `crypto.subtle.digest` (async, current): **618ms**
- `crypto.createHash('sha256')` (sync, node-only API): **65ms** — **~9.5x faster**

Browsers have NO synchronous native crypto API (by W3C design, to avoid blocking the main thread) — matching that
65ms number in-browser requires a **pure-JS synchronous SHA-256 implementation** for the hot chain-computation path,
used ONLY where correctness is verified byte-identical to `crypto.subtle.digest` output (this is the security-
critical signing primitive — do not swap it in until proven exact on real op-canonical-string inputs, not just
random test vectors). **A first isolated in-browser benchmark attempt this session failed** (`about:blank` has no
secure-context `crypto.subtle` — must navigate via `e2e_harness.js`'s local `http://localhost:<port>/...` server
pattern instead, secure-context works there) — redo the isolated browser benchmark BEFORE touching production code,
to confirm the Node 9.5x gap holds in the actual swiftshader/puppeteer environment (it may not — Node's number
undershot the REAL measured 6-7s in-browser signing phase by ~10x already, so browser dispatch overhead is evidently
worse than Node's; re-verify, don't assume).

### Candidate C — batch-sign bulk/non-individually-edited classes as ONE row, not N (user-suggested 2026-07-01,
smallest + most targeted, NOT YET DONE) — **try this FIRST**
Today the whole building already commits as ONE atomic group (`gid='arcseed-<building>'`), but EVERY element inside
that group still gets its own individual hash-chain link + signature — 71,104 crypto calls for Terminal's 35,552
rows. Terminal's roof (33,324 `IfcPlate`, 93.7% of its ARC-seedable rows) is exactly the kind of class nobody
individually gizmo-selects (a user grabs a wall or a door, never one cladding panel of an airport roof). Store that
class's real, MEASURED placements (still non-generative, still real data — see the roof-placement note below) as
**ONE signed row carrying a batch payload** (all 33,324 placements serialized together) instead of 33,324 separate
signed `GEOM_INSERT` rows. That alone would cut Terminal's crypto work from ~71,104 calls to roughly ~4,456 (just
the remaining ~2,228 individually-meaningful walls/doors/columns × 2) — **an ~16x reduction**, achieved entirely at
SEED TIME with ZERO changes to selection/pick/edit code (unlike Candidate A). Walls/doors/furniture/columns — the
classes a user actually edits — stay as individual signed ops exactly as today; only bulk/decorative/cladding
classes (roof plates being the obvious first case, decide the general rule — e.g. by `ifc_class` allowlist or a
per-class row-count threshold) get batched.
Open design question to resolve before implementing: how does a batched-class element get edited if a user DOES
need to touch one (e.g. replace one roof panel)? Options: (a) refuse individual edit on batched classes for now
(honest scope-cut, document it), or (b) on first touch, unpack the ONE batch row into N individual signed ops
(same "promotion" idea as Candidate A, but ONLY triggered for the rare edit of a batched-class element, not for
every element — much smaller blast radius than full Candidate A). Pick (a) first unless the roster of Modeller
tools already needs per-plate roof editing (check before assuming — likely not, given the Walker Doctrine's own
§5 treats the roof as a class-level LOD/render concern, not an individually-authored one).

**Reconciling Candidate C with `swbCanopyOps` (user synthesis, 2026-07-01):** the two are not actually opposed —
`swbCanopyOps`'s correct STRUCTURAL insight is "treat the roof as ONE unit" (it calls it "one measured unit,
instanced-by-n"), which is exactly this repo's own **BOM PRINCIPLE** (`CLAUDE.md`: "one parent, N children, each
child can itself be a BOM... each level atomic and self-contained"). The 33,324 plates were never architecturally
33,324 independent top-level elements — they're one roof's tessellation detail. Where `swbCanopyOps` goes wrong is
only the DATA-FIDELITY choice: it re-derives a statistically-reconstructed distribution (`predictedN` vs
`extractedN`, ~1.4% error) instead of using the exact real per-plate positions we already have. **Candidate C is the
same "one roof = one parent unit" correction, done right**: one signed row (the parent), the 33,324 REAL measured
placements as its batch payload (the children/tessellation detail) — same structural fix `swbCanopyOps` reached for,
without discarding real data for a generative estimate. Whoever implements Candidate C should frame it exactly this
way: it's a BOM-PRINCIPLE fix (wrong parent/child modeling), not merely a performance hack.

### Candidate D — decouple PAINT from SIGNING entirely (user-suggested 2026-07-01, orthogonal to A/B/C, likely the
biggest immediate win, NOT YET DONE)
Rendering an element only needs its already-computed `bbox`/`placement`/`hash`/`lod` (available the instant
`buildSeedOps` builds the op object, before any crypto runs) — the `op_hash`/`sig` fields are needed ONLY by the
audit/tamper-evidence chain (`verifyChain`), never by `foldInsert`/`_buildMesh`. Today's flow serializes them
(`commitGroup` signs+persists ALL ops, THEN `foldChainToScene` renders), so paint waits on signing for no reason.
**Fix: paint immediately from the unsigned op params, run the hash-chain sealing as a SEPARATE background/chunked
pass afterward** — reuse the SAME `requestAnimationFrame`-yielded loop shape already added to `bonsai_kernel.js`
this session (the `_nextFrame`/`_reportProgress` chunking added for mesh-building), applied to the signing loop
instead. The user sees the full building instantly; the signed/verifiable audit trail catches up asynchronously in
the background with its own `setStat` progress line (e.g. "sealing 12000/35552…").
Two open design questions to resolve before implementing (don't hand-wave either):
1. **featureId availability for picking/gizmo before sealing completes** — `featureId` today = the committed
   `kernel_ops` row's `id`, assigned when the row is INSERTed. Check whether `kernel_ops.js`'s `commitGroup` can
   INSERT rows immediately (id assigned, `op_hash`/`sig` left NULL) and let a separate pass backfill those columns
   later — `sealFrom` (already in this codebase, and already touched this session — see its `§LOD400-STALL perf fix`
   comment) is BUILT for exactly this ("trusts an already-correctly-chained hash… only pay for crypto.subtle.digest
   when the row is genuinely unsealed") — likely the right primitive to run as the background pass, not something
   new to write.
2. **Chain-tip handling for a commit that arrives WHILE sealing is still in progress** — e.g. a user's first real
   edit, or the STR walker's own commit, needs to know the current chain tip to link onto. If the ARC seed's tip is
   still "pending" (rows inserted but not yet hashed), decide: does a subsequent commit block until sealing catches
   up to a stable tip, or can it start its OWN chain segment and reconcile later? Don't assume either answer — trace
   every other `commitGroup`/`commitSeedGroup` caller (STR walker trunk commit, disc-walk fixtures, user edits) to
   see what tip-dependency they actually have before designing this.

**Recommendation for whoever picks this up:** **Candidate D (decouple paint from signing) is likely the single
biggest, most direct win** — it doesn't reduce total crypto work like B/C do, but it removes crypto from the
CRITICAL PATH entirely, which is what the user actually experiences as "the stall." Pair it with **Candidate C**
(fewer total signed rows for bulk classes, the correct BOM-PRINCIPLE fix for the roof) for the best combined result;
**Candidate B** (faster hash) helps whatever background signing work remains regardless of A/C. **Candidate A**
(full lazy promote-on-touch) remains the most complete match to the Viewer's architecture but is the biggest/riskiest
— treat it as a later step only if D+C+B together don't close the gap enough. Do NOT do all four in one uncoordinated
pass — implement one, verify with real witness evidence, then reassess before the next.

## ⛔ OPEN — second bottleneck once signing is fixed: op-log autosave has no working cache (confirmed bug)
The Viewer's raw building-DB bytes ARE IndexedDB-cached (`bim_ootb_cache`/`dbs` store, `_idbGetDb` in
`str_walker_outliner.js`) — reopening Terminal doesn't re-fetch over network. But the **signed op-log** persists via
`bonsai_oplog.js _save()` to **localStorage** (`_KEY: 'bonsai_model_v1'`), which has a ~5-10MB per-origin quota.
Terminal's signed log export is multi-MB and **confirmed hits `QuotaExceededError`** (now logged loudly via
`console.error`, was previously silent) — meaning even after paying the full signing cost once, it is NEVER actually
saved, so EVERY future open re-pays the full cost from scratch. Fix: migrate `bonsai_oplog.js`'s persistence off
localStorage onto IndexedDB (same `bim_ootb_cache` database, a proper object store instead of a size-capped string
blob). This is complementary to (not a substitute for) Candidates A/B above — even a fast signing pass is wasted
work if it can never be cached across sessions.

## ⛔ OPEN — the 33,324-IfcPlate Terminal roof: ONE BOM-level parent unit, not 33,324 independent elements
**User clarification + synthesis (2026-07-01): the roof is ONE piece over a defined roof area — a BOM-PRINCIPLE
modeling correction, not a walk/generation problem.** The 33,324 `IfcPlate` roof elements are **REAL,
already-measured** `elements_meta`/`element_transforms` rows over a defined ARC/STR envelope (the Terminal roof
structure) — never architecturally 33,324 independent top-level elements; they're one roof's tessellation detail
(exactly `CLAUDE.md`'s BOM PRINCIPLE: "one parent, N children… each level atomic and self-contained"). The unmerged
`lane/arc-mesh-readpixels` branch's `§8E-2a swbCanopyOps` had the right STRUCTURAL instinct ("one measured unit,
instanced-by-n") but the wrong DATA-FIDELITY choice — it reconstructs a GENERATED distribution (`predictedN` vs
`extractedN`, ~1.4% error) instead of using the exact real per-plate positions already in hand. **Candidate C (see
above) is the same one-parent correction done right**: one signed row, the 33,324 REAL placements as its payload —
don't resurrect `swbCanopyOps`'s generative estimation, but DO keep its "treat the roof as one unit" insight.

If a future session considers the canopy-walker branch (`lane/arc-mesh-readpixels`) again for anything else, first
re-confirm this framing hasn't changed (i.e., confirm the roof plates are still real `elements_meta` rows, not
something that became unmeasured/absent) before reusing any of its generative logic.

## §RESUME — START HERE (next session)
1. `git -C ~/bim-ootb fetch origin && git -C ~/bim-ootb merge --ff-only origin/main` (or merge if diverged). Open
   PR https://github.com/red1oon/bim-ootb/pull/new/fix/modeller-terminal-load-lod400 if not already open, review/
   merge it (the 4 committed fixes are independent of everything below — no need to hold them hostage to the
   signing-speed work).
2. Fresh `/tmp/wt-*` worktree off latest `origin/main` (post-merge) for the signing-speed work.
3. Re-run `witness_e2e_terminal_open.js` to reconfirm the ~14s baseline still holds (code may have moved since).
4. Redo the in-browser crypto benchmark (via `e2e_harness.js`'s server pattern, NOT `about:blank`) before choosing
   which candidate(s) to implement — the Node numbers above are known to undershoot real browser overhead by ~10x.
5. Pick ONE candidate (D or C first per the recommendation above), implement, verify with real witness evidence,
   THEN reassess before adding another — don't stack multiple uncoordinated changes to the same signing path.
6. **Before declaring anything done: re-run the FULL walker regression sweep**, not just the ARC/LOD/Terminal-open
   witnesses this session focused on. The fixes here touched shared substrate the disc-walker and STR-walker both
   depend on (`kernel_ops.js`, `bonsai_kernel.js`, `arc_editable.js`, `bonsai_oplog.js`) — confirm nothing walker-side
   regressed: `witness_e2e_walk.js` (already green this session, re-run again after further changes), plus this
   repo's broader walker witness set per `docs/WalkerDoctrine.md` §6 (`witness_disc_walk_generalize.js` §DWG,
   `witness_disc_walk_duplex_generalize.js` §DXG, `witness_shim_select.js`, `witness_dwwalk_hostbind.js`,
   `witness_hostbind_agnostic.js`, `witness_elec_hostbind.js`, `witness_walkback_mep.js`) and the STR-into-ARC set
   (`witness_str_canopy.js` if `lane/arc-mesh-readpixels` is ever touched again, `W-STR-INTO-ARC`). Don't assume
   "the 12 E2E + ARC witnesses were green" means walkers are unaffected — they weren't in this session's scope, so
   they haven't been checked since these substrate files changed.
7. Same Log Mandate / non-invent / witness-first discipline as the rest of this repo. Don't touch `deploy/live/`.
