# CLOSEOUT — fable/dwprobe-dedup: disc-walk witness harness hygiene (probe dedup + crash net + require path)

```
# ⚠ DO NOT REMOVE
SCOPE: closeout record for branch fable/dwprobe-dedup — 3 commits (43d713a, 3367afb, 52fea0e), all
independently Watchdog-verified and pushed to origin. PURE DOCUMENTATION of what was broken, the exact
fix, and the measured before/after witness tallies — no code accompanies this file. Every tally below
was read from a saved run log per the Log Mandate (exit code is not evidence); re-verify by re-running
the named witness, never by trusting this file's numbers over a fresh log. Carries ONE explicit
"not fixed here" follow-up (§FOLLOW-UP: Terminal_ARC.db oracle starvation) that needs its own scoping
session — do not fold it into unrelated work, and do not treat the density/clash witnesses' remaining
red sub-checks as caused by this branch.
```

## §1 — 2026-07-10 · 43d713a · `window.__dwPixelProbe` defined twice, second silently shadowed the first

**Broken:** `modeller/modeller.html` defined `window.__dwPixelProbe` TWICE — §4 (~line 4283, the
WHITEBOX PIXEL PROBE: scene-graph census of the dwRoot group + full-frame readPixels, returns
`{boxes,instances,edges,tubes,parts,asmEdges,litPct}`) and §8E-2b (~line 4679, a completely different
A/B-isolate occlusion-diff probe, returns `{dwPainted,meshes,inFrustum}`). The second overwrote the
first at load time. `witness_dw_pixelprobe.js` (asserts the §4 shape) read `undefined` fields and
failed 3/6; `witness_disc_density.js` + `witness_disc_clash.js` (assert the §8E-2b shape) worked only
by accident of load order.

**Fix (pure rename/dedup, no logic change to either probe):** §8E-2b probe renamed
`window.__dwOcclusionProbe` (sole owner of that shape); its two callers
(`witness_disc_density.js`, `witness_disc_clash.js`) updated; §4 census probe is again the sole
`window.__dwPixelProbe`. Repo-wide grep confirms no other reference.

**Tallies (from saved logs):**
- `W-DW-PIXELPROBE` **3/6 → 6/6** — census fields + litPct real again (§PROBE after: boxes=2
  instances=246 edges=1 litPct=42.05).
- `W-DW-DENSITY-TE` **5 PASS / 3 FAIL** and `W-DW-CLASH-TE` **9 PASS / 1 FAIL** — verdict-for-verdict
  IDENTICAL to a pristine `origin/main` baseline worktree run (diff on the ✅/❌ lines). The renamed
  probe itself works (D2 READPIXELS and S9 READPIXELS both pass with real pixel counts); the red
  sub-checks are pre-existing — see §FOLLOW-UP.

## §2 — 2026-07-10 · 3367afb · `witness_modeller_disc_walk.js` crashed on uncaught rejection after B5

**Broken:** when B5 finds no `[data-disc="MEP"]` node, the follow-on `page.click` timed out and threw
inside the witness's async IIFE, which had no `.catch` — uncaught promise rejection, node stack trace,
B6–B8 never tallied (observed on pristine `origin/main` too: B5's node absence is pre-existing).

**Fix (harness robustness only — B5's check and pass/fail logic untouched):** the MEP click wrapped in
try/catch (5s timeout, since B5's `waitForSelector` already spent the full 30s on the same selector)
with the failure logged in the file's own style; plus a last-resort top-level `.catch` on the IIFE —
any future rejection reports `❌ UNCAUGHT` and exits 1 instead of dying on a stack trace.

**Tallies (from saved logs):** uncaught crash after B5 → **`W-UX-DISC: 6 PASS / 2 FAIL`**, clean exit 1
from the tally line. B1–B5 verdict-identical to the pre-fix run; B6–B8 (previously swallowed by the
crash) now tally honestly (B6 ❌ no refusal log — nothing to click; B7 ✅ sweeps unchanged; B8 ✅).

## §3 — 2026-07-10 · 52fea0e · bare `require('playwright')` needed NODE_PATH to resolve

**Broken:** `witness_disc_density.js`, `witness_disc_clash.js`, `witness_modeller_disc_walk.js` all did
a bare `require('playwright')`, which only resolves with `NODE_PATH=~/bim-ootb/tests/node_modules` set —
silent `MODULE_NOT_FOUND` in any fresh worktree or CI shell (bit two verification runs on this very
branch before being fixed).

**Fix (pure require-resolution change, no logic touched):**
`require(path.join(process.env.HOME, 'bim-ootb', 'tests', 'node_modules', 'playwright'))` — the exact
pattern `witness_dw_pixelprobe.js` already uses for puppeteer.

**Tallies (from saved logs, run with NODE_PATH explicitly UNSET to prove the dependency is gone, not
dormant):** zero `Cannot find module` across all three; per-check verdicts diff-IDENTICAL to the prior
NODE_PATH runs — `W-DW-DENSITY-TE` **5/3** · `W-DW-CLASH-TE` **9/1** · `W-UX-DISC` **6/2**.

## §FOLLOW-UP — NOT FIXED HERE: Terminal_ARC.db oracle starvation (needs its own scoping session)

`modeller/Terminal_ARC.db` was regenerated ARC-only by the embed-8 merge (`6068fab` — "embed 8 ARC-only
buildings + shared mesh.db resident registry"): `elements_meta` now holds **35,552 ARC rows and 0 MEP
rows** (verified by direct query). `witness_disc_density.js` and `witness_disc_clash.js` use those
per-discipline counts as their ORACLE (`realCount(disc)`), so ELEC/FP/ACMV read `real=0` and the
remaining red sub-checks fail with `Infinity×` for EVERYONE, on pristine main included:
- `W-DW-DENSITY-TE` D3 ENVELOPE / D4 COUNT / D4b COUNT-TIGHT (e.g. `ELEC 1988/0=Infinity×`)
- `W-DW-CLASH-TE` S8 ORACLE (`stage2=0.06% vs real-TE=0.00% (0/0 sampled)`)

Real, pre-existing, out of this branch's scope. Options to scope properly (decision needed, not taken
here): regenerate `Terminal_ARC.db` with MEP `elements_meta` rows, or repoint the two witnesses at a
different oracle DB that still carries the measured per-disc counts.

Env note for whoever picks it up: `Terminal_arcstr_proof.db` is an untracked artifact that exists only
in the shared `~/bim-ootb` checkout — copy it into any fresh worktree before running these two
witnesses (a 404 surfaces as `file is not a database`).
