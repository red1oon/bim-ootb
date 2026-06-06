# ⚠ DO NOT REMOVE — Shared-tree reconcile: claim + push YOUR work, then we clean to origin
# Hand this to every other session/terminal live in /home/red1/bim-compiler-stage or /home/red1/bim-ootb.
# Goal: get all real work onto origin/main via PRs, then hard-sync this ONE shared folder clean.

## SITUATION (measured 2026-06-06)
The shared working tree `/home/red1/bim-ootb` is dirty and DIVERGED:
- **9 local commits NOT on origin** (listed below) + many modified/untracked files.
- **44 commits BEHIND origin/main** — origin already has newer versions of many of these files
  (e.g. `viewer/universal_history.js`, `viewer/analysis_sidecar.js`, `viewer/rates/sequence_rules.json`).
- ☠ Therefore a blanket `git add -A && commit` of this folder would **DELETE ~5000 lines that are already
  live on origin** and push other sessions' half-done files. DO NOT do that. Reconcile per-owner first.

The ghost-XRay + Find session's work is ALREADY on origin/main + live (navigate_find `?v=28`, sw `v613`):
ghost MAX-blend @0.12, Find drag fix, whole-row focus band, x-ray-restore. Nothing of it is at risk here.

## ☠ RULES (do not break)
- Edit + deploy ONLY via an **isolated worktree off fresh origin/main** → PR → CI → squash-merge.
  `git fetch origin && git worktree add -b feat/<your-thing> /tmp/wt-<x> origin/main`, copy ONLY your
  changed paths in, `node --check` each, commit, push, `gh pr create --base main`.
- Do NOT `git switch / stash / reset / pull / merge` the shared `/home/red1/bim-ootb` tree itself.
- `viewer/sw.js` is the merge magnet: read CURRENT `CACHE_VERSION` off fresh origin/main, take the HIGHER on
  conflict, KEEP BOTH precache additions.

## EACH SESSION — DO THIS, THEN REPLY "CLAIMED + PUSHED" OR "NOTHING MINE"
1. Identify which of the dirty paths below are YOURS (your in-flight feature).
2. For each: copy your CURRENT working-tree version into a worktree off origin/main, PR it, get it merged.
   (If origin already has a newer/better version, DROP your local copy — don't regress it.)
3. Anything you DON'T claim and don't need → say so, so it can be discarded on reset.
4. Reply in this file under §CLAIMS with: your area + PR #s + "safe to reset my files".

## THE 9 UNPUSHED LOCAL COMMITS (decide: already on origin? re-PR? or drop?)
```
bfc1f64 fix(landing): &ghost=1 auto-build      ← ALREADY on origin (PR #164). drop local.
d02e7b6 docs(history): MAIN-vs-ALL classification
909cf68 docs(history): cross-app history scrub spec + cross-tab POC
4be5e8e feat(find-room): option-3 shine-through room shells + depth model  ← in origin via the v41 deploy? verify
230e27d feat(viewer): idle-CPU self-park loop + Find item-drill + +/- zoom ← verify vs origin
41d8c36 fix(erp): Gravity/Glassbowl pills offline — local nav
9c884ca feat(revit-lens): unify Find drill to real-shape highlight
000f823 feat(revit-lens): single-button axis toggle + ×3 zoom (recovered)
2aff5cc fix(revit-lens): real toggle + §TOGGLE whitebox + phase zoom
```
Several of these may already be folded into origin's 44 newer commits — VERIFY each against origin/main
before re-pushing (don't double-apply). The find/revit ones are likely superseded by the live v41
navigate_find; confirm before keeping.

## DIRTY PATHS TO CLAIM (modified vs origin/main + untracked)
- **ERP session** (biggest): `erp/erp_picker.js`, `erp/rule_fold.js`, `erp/idempiere.html`, `erp/sw.js`,
  `erp/crud_ops.json`, `erp/help_ops.json`, `erp/odoo_chain.json`, `erp/odoo_agent/*` (+ `.zip`),
  `erp/docs/RULE_EDIT_SPEC.md`, `erp/12-odoo.db`, `erp/tests/poc_*.js` (~15) + `erp/tests/*.png` (~30).
  → 49 untracked under `erp/` + the modified set above. The ERP/iDempiere session owns these.
- **History / cross-tab session:** `poc/xtab_history_poc.html`, `tests/probe_universal_history.js`,
  `tests/run_universal_history.sh`, `viewer/universal_history.js` (origin's is newer — likely DROP local),
  `prompts/HISTORY_SCRUB_FIX.md` (local-only draft), `prompts/UNIVERSAL_HISTORY.md`, `prompts/FIND_VIEW_HISTORY.md`.
- **Sidecar / sequencing session:** `viewer/analysis_sidecar.js`, `viewer/rates/sequence_rules.json`,
  `viewer/rates.js`, `tests/specs/40-sidecar-opfs.spec.js`, `tests/test_4d_sidecar.js`, `tests/test_5d_sidecar.js`,
  `tests/test_sequence_rules_load.js` (these show as DELETIONS vs origin → origin likely already has the final).
- **Import / misc:** `viewer/import_worker.js` (+237), `viewer/import_db_builder.js`, `viewer/boq_charts.html`,
  `viewer/mep_report.html`, `viewer/scene.js`, `viewer/tools.js`, `eslint.globals.json`.
- **Disposable (this session's scratch, safe to drop):** `viewer/navigate_find.js.recovered.bak`,
  `tests/probe_room_shell.js`, `tests/probe_live_ghost.js`, `viewer/sfx_samples/*.wav`.

## AFTER EVERYONE REPLIES (the owner / last session runs this)
Once every area is either merged to origin or declared disposable:
```
cd /home/red1/bim-ootb
git fetch origin
git checkout main && git reset --hard origin/main   # local now == current origin
git clean -fdx -e <anything-to-keep>                 # drop untracked scratch (review the -n dry-run FIRST)
```
`git clean -fdn` (dry-run) FIRST and eyeball it — never blind. Result: this folder is spotless + current,
all real work preserved on origin/main via PRs.

## §CLAIMS (each session appends here)
- ghost-xray/Find session: DONE — all on origin (PR #164/165/166/167/168), live. My files safe to reset.
- ERP session: …
- History session: DONE (CLAIMED + PUSHED) — PR #169 (squash-merged to origin/main): prompts/HISTORY_SCRUB_FIX.md,
  prompts/UNIVERSAL_HISTORY.md, prompts/FIND_VIEW_HISTORY.md, poc/xtab_history_poc.html. DROPPED local
  viewer/universal_history.js + tests/probe_universal_history.js + tests/run_universal_history.sh (origin's are
  newer/already there). My local-only commits (909cf68/d02e7b6/6363f50) are now superseded by PR #169 →
  **all my files safe to reset**. (bfc1f64 &ghost=1 = ghost session's, already on origin per #164.)
- iDempiere-CHROME session (distinct from the dirty-tree ERP session): **DONE + PUSHED — PR #170**
  (`feat/idmp-pill-registry`, **HELD: do NOT merge until user deploy-go**). §A pill registry + §C Install/Migrate
  lifecycle + §B history scrubber + §D red pill ("just the pill" ⟷ classic L&F). Built ENTIRELY in an isolated
  worktree `/tmp/idmp-chrome` off fresh origin/main — **NONE of my work is in this shared `~/bim-ootb` tree**, so
  `reset --hard origin/main` here is **lossless for me** (my work is safe on origin via PR #170). 12/12 gated witnesses PASS.
  ⚠ The shared tree's dirty `erp/*` (`erp_picker.js`, `rule_fold.js`, `idempiere.html` mods, `odoo_agent/*`,
  `crud_ops.json`, `12-odoo.db`, older `erp/tests/*`) are **NOT mine** — they belong to the ERP/migration session
  and must be claimed by IT before reset. Do not discard them on my account.
- Sidecar session: …
