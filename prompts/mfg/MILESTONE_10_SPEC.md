# ⚠ DO NOT REMOVE — Milestone 10: W-MFG-WHATIF (scope: a discarded what-if branch leaves the live state untouched; read the log after every run)

Parent row: "A branch runs MRP and is discarded, leaving the live state hash unchanged. Break: let the branch append to the live log." (Done after M9 was found blocked on M6.)
Worktree `/tmp/wt-mfg`, branch `feat/mfg-wire`.

## Issue it proves or disproves
A what-if scenario (extra order, changed quantity) can be MRP'd in a speculative branch and thrown away with NO effect on the official state: official projection, official op set and the official replay are byte-identical before and after.

## Facts measured 2026-10-14
- The repo's log-branch mechanism is BLUE FUTURE (kernel_ops.js): ops tagged `branch_id` in the SAME kernel_ops log (NULL = official), `replayOps(db,type,branch)` official-only by default, `discardBranch` (undone=1),
  `acceptBranchUpTo` (clear the tag). branch_id is NOT in the hashed canonical form, so branch rows sit in the chain and discard does not unlink them.
- DEFECT FOUND (probe in scratchpad leakprobe.js): `ERPKernel.apply` has no way to tag a branch, and `ERPKernel.replay` (the official rebuild path) selects `WHERE undone=0` with NO branch filter:
  with one official CREATE_DOCUMENT and one branch-tagged one in the log, `replay` rebuilt documents = PP_Order:1, PP_Order:SPEC. A speculative op therefore LEAKS into the official projection on any rebuild/reload.
- In bare node erp_kernel creates kernel_ops WITHOUT branch_id (browser: kernel_ops.js owns the table WITH it). The witness loads kernel_ops.js so the real shape is used.

## Design (reuse BLUE FUTURE; no second branch mechanism)
- erp_kernel.js `apply(db, ops, ctx)`: `ctx.branch` + `ctx.scratch`: the ops are applied to the SCRATCH projection (a clone of live) and committed to the live log TAGGED with branch_id; the live projection is not written.
  Without ctx.branch the behaviour is byte-identical to today. `dispatch` passes cellCtx.branch/scratch through (its read-only query is the caller's, i.e. over the scratch).
- erp_kernel.js `replay(src, fresh, opts)`: official-only by default (`branch_id IS NULL` when the column exists); `opts.branch` additionally includes that branch (blue view).
- New `erp/mfg_whatif.js`: `fork(SQL, live, branchId)` -> { scratch, dispatch(), apply(), mrp(), discard() } using ERPKernel + KernelOps.discardBranch + mfg_mrp.fold. Nothing manufacturing-specific in the kernel.

## Witness `erp/tests/witness_mfg_whatif.js` (tag `§MFG-WHATIF`)
- X1 the what-if changes the answer: MRP over the branch view has more rows and a different hash than the live MRP (non-vacuity). X2 while the branch exists: live projection hash and official op-set hash are unchanged, branch ops are in the log tagged.
- X3 after discard: branch ops are undone, official projection hash, official op-set hash and MRP hash equal their pre-branch values; an official replay equals the live scope. X4 the default replay excludes a tagged op; replay with `{branch}` includes it (the defect, fixed).
- Deliberate breaks (must be red, named): `MFG_BREAK=untagged` (branch ops committed to the live log with no tag and applied to the live projection) -> X2/X3 FAIL; `MFG_BREAK=leak` (replay ignoring the branch filter) -> X3/X4 FAIL.
- Baseline proof: the same witness run against origin/main's erp_kernel.js must be RED (the leak).

## RESULT 2026-10-14 (logs: ~/Projects/Mfg/logs/w_mfg_whatif_{green,untagged,leak,baseline_prefix_kernel}.log)
- Green, 5 checks, exit 0. Official state before: projection 5faa5b4c, op-set 194e5873, MRP dabc9e5d (6 rows), log 8 rows. What-if order WI-1 (qty 500) in branch `whatif-1`: branch MRP = 9 rows, hash 98603f4e (X1, non-vacuous).
  While the branch exists: projection and op-set unchanged, 4 ops in the log tagged `whatif-1` (X2). Default replay excludes WI-1, `{branch}` includes it (X4). After discard: 0 alive / 4 undone, projection, op-set and MRP hashes equal the pre-branch values, an official rebuild reproduces the live scope and the MRP (X3, X3b).
- Break `untagged` (branch order written to the live log + projection): X2, X3, X3b, X4 FAIL. Break `leak` (official rebuild includes tagged ops): X4 FAIL.
- BASELINE proof: the same witness against origin/main's erp_kernel.js is RED on all 5 checks - the original `apply` silently ignores a branch and writes the what-if order into the live projection untagged, and `replay` rebuilds tagged ops
  into the official state. The milestone's failure mode exists in current code.
- Changed: erp/erp_kernel.js (+hasBranchCol, apply ctx.branch/scratch, replay official-only default + opts.branch, dispatch passthrough; no ctx.branch => byte-identical behaviour), erp/mfg_whatif.js (new driver), erp/tests/witness_mfg_whatif.js.
  Regression: every kernel-dependent node witness (witness_t7_incremental, roster-verify, content-sign, M1-M8) exit 0; poc_accts_posted and poc_erp_picker fail identically on origin/main (pre-existing).
- LIMITS (named): `acceptBranchUpTo` (promoting a what-if to official) is not exercised here; the scratch is a full clone (export) of the live DB, fine for the seed, a cost question at building scale (PERF BUDGET: clone = duplicate heap).
  The branch tag is not in the hashed canonical form, so discarded ops remain in the chain as undone rows (existing BLUE FUTURE design): "unchanged" is defined on the OFFICIAL op set, not the raw log row count.
