# ⚠ DO NOT REMOVE — session handoff for the §17.16/§17.17 structural-occluder (occl-struct) lane.
# Read this FIRST before touching occlStructEnabled / dlod_nav.js's §17.16+ code. Read the log after
# every run you do perform.

## Status (2026-08-13): fix landed, lever still OFF, one open design call, perf not yet clean

**Shipped:** `fix/occl-struct-fbo-selfexclude-bias` → PR #1328 (bim-ootb). Merged clean against 341
commits of origin/main drift. Contains:
- **§17.17.1 (W-OCC3-BIND):** the real bug — `_occStructPrepass` restored the display framebuffer
  *before* occlusion queries ran, so every query depth-tested the canvas (contaminated by DLOD's own
  box-proxy writes), not the dedicated occluder target. This is why §17.16 never worked despite a
  sound architecture. One-line fix.
- **§17.17.2 (W-OCC3-SELF):** occluder-set members (walls/slabs/roofs) excluded from being their own
  query subjects.
- **§17.17.3 (W-OCC3-BIAS):** depth bias for thin/coplanar subjects (coverings, plates, MEP
  terminals) — the residual false-hide class after .1/.2.
- **R6 single-building fallback:** `LTU_AHouse_meta.db`'s 2026-08-10 re-extract has no `building`
  column → `§CENTRES_RESULT rows=0` → building silently never streams. **Confirmed live-broken on
  production (red1oon.github.io) the night this was found** — unrelated to occl-struct, bundled in
  the same PR because it was needed to test occl-struct on LTU at all.

**`occlStructEnabled` stays default `false`.** Nothing shipped here changes behavior for any live
user. W-OCC3-EQUIV (lever off → byte-identical) passed first, before any other claim.

## Real numbers (real RTX 4060, LTU_AHouse, not swiftshader)
False-hide: 26.92% → 17.58% (self-exclude) → **2.34% mean-of-poses / 4.13% pooled** (bias). Settle
stable at every pose, every variant (was: never settled, 5 prior attempts all failed on this). Query
volume down ~49%.

## ⛔ One open design call, not decided here
Of the residual false-hides, most are elements hidden behind a wall the *display* has demoted to a
wireframe box (§17.16's static occluder set deliberately ignores DLOD state, by design). Whether a
demoted wireframe wall should count as a valid occluder is a product decision:
- Counting it as invalid (strict/current metric): **4.13% pooled** false-hide.
- Counting it as valid (matches what the static occluder set already assumes): **0.83%**.
My own read: probably invalid (a user looking at a wireframe wall sees through it), but this is a
call for whoever owns the feature, not something to re-derive from scratch.

## Perf: genuinely still open, but NOT what it looked like mid-session
A same-session A/B (LTU, addons loaded — night mode + Alt+G GI preview) showed dlod=on at 74.5 fps
mean vs dlod=off at 109.5 fps — looked like occl-struct was costly. **A cleaner same-session test
(no addons, `o` cycled on/off repeatedly) showed the opposite once the transient engage-hitch is
excluded: dlod=on beat dlod=off in every settled sample (168/148/173 vs 130/125/128/106).** The two
crash-to-14fps dips both happened during the *pre-existing* §20 budget-boost ramp
(`boost=2→50`) immediately after engage, with `occlStructHidden=0` in both — i.e. occl-struct wasn't
even active yet during the dips. **Confirmed on production Hospital (no occl-struct exists there at
all): the same on-is-sometimes-slower-then-faster pattern reproduces with zero occl-struct code
present** — so the transient hitch is the pre-existing base DLOD/budget-boost system, not this fix.

**Net: occl-struct itself is not implicated in any of tonight's slowdowns.** The one still-untested
hypothesis, user's own (plausible, not yet measured): DLOD/occl-struct may pay for itself at
whole-building/exterior distance and not be worth its fixed cost at close/interior range. The clean
test for this: two *fixed* poses (one genuine exterior, one genuine interior), toggle
`occlStructEnabled` only (not the whole `o` pill) at each, hold a few seconds past the engage
transient, diff FPS. Not done yet — do this before making any arm/don't-arm call on distance grounds.

## Before arming `occlStructEnabled` for real
1. Rule on the wireframe-occluder question above (or leave it — both numbers already clear a
   reasonable bar for many purposes).
2. Run the distance-isolated perf test described above, on an idle machine (this one is shared,
   noisy — do not trust any single-session FPS number without checking what else was running).
3. If both look good: flip the default, ship through this project's normal witness/PR/deploy flow —
   nothing here authorizes skipping that.

## Don't re-walk
- The wall-cutout theory (LTU_AHouse walls lack real door/window openings) — **disproven**, directly
  measured (mean aperture blockage 0.0035, near-perfect real cutouts). The false-hide residual was a
  code bug (§17.17.1), not a data problem.
- The §17.15 shared-depth-source restore fix shape — genuine dead end, correctly abandoned in the
  original investigation, don't retry it.
- `FLY_TOUR_DLOD_SCALE.md` is cited throughout `dlod_nav.js`'s comments (§17.x, §20, §9, etc.) but
  **does not exist in the current tree** — appears archived/removed without the code comments being
  updated. Not this session's problem to fix, but don't waste time searching for it; it's not there.
