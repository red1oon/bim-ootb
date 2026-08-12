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

## ⚠ §FPS_MODE is mislabeled — it logs ms/frame, NOT fps (found + confirmed 2026-08-13, late)
`viewer/main.js` `_fpsSample()` (~line 669): `dt = now - _fpsLastT` (milliseconds between frames),
accumulated into `_fpsSum`, `mean = _fpsSum/_fpsN`. **This is mean frame TIME in milliseconds. It is
never converted to a rate (`1000/dt`).** The console tag says `§FPS_MODE mean=X` with no unit — every
reader (this session included, for hours) assumes X is frames/second, where higher = better. It is
actually milliseconds/frame, where **lower = better**. Confirmed by code read, and independently by
the startup values making sense only this way (`mean=543.8` moments after page load, mid heavy
synchronous library import, reads as absurd 543fps but exactly-right as ~1.8fps/543ms-per-frame
jank). **Fix the label** (`§FRAME_MS` or actually convert to fps) before this metric is trusted again
— this is a real, separate, worth-fixing bug, independent of everything else in this doc.

## Perf: re-derived under the CORRECT direction — reverses tonight's earlier reported conclusion
Every FPS comparison earlier in this session was read backwards (higher-number-wins instead of
lower-number-wins) because of the mislabeling above. Re-reading the same already-collected numbers
the right way round:

| test | dlod=OFF | dlod=ON | winner (lower=faster) |
|---|---|---|---|
| Hospital LIVE production (no occl-struct code exists there at all) | 112.75 | 52.7 | **ON** |
| LTU freehand/orbit, localhost | 139.8 | 90.0 | **ON** |
| LTU with addons (night + Alt+G GI), localhost | 109.5 | 74.5 | **ON** |
| LTU no-addons, all on-samples | 115.3 | 98.2 | **ON** |
| LTU no-addons, on-samples excluding the 2 engage-transient spikes | 115.3 | 139.7 | OFF (the one exception) |

**Corrected reading: DLOD-on (base system + occl-struct together) was faster than DLOD-off in 4 of 5
independent tests tonight, including on production Hospital where occl-struct doesn't even exist.**
The one exception is a narrow sub-slice (2 samples excluded from an already-small n=6). This is the
opposite of what this document said earlier tonight — that direction was wrong, own the correction,
don't quietly average the two.

**What this does NOT yet prove:** which of DLOD's several sub-systems (base box-swap, §20
budget-boost, room-occlusion, occl-struct) contributes how much of the win — they were always
toggled together via the `'o'` pill, never in isolation. It also doesn't resolve the user's own
distance hypothesis (exterior vs interior) — that still wants the isolated test below, just now
starting from "DLOD looks like a net win" instead of "DLOD looks costly."

**Before trusting ANY future FPS_MODE-based conclusion:** fix the mislabeling first (or manually
invert every reading, which is exactly the error-prone step that produced tonight's wrong direction
in the first place). Then re-run the distance-isolated test: two *fixed* poses (genuine exterior,
genuine interior), toggle `occlStructEnabled` only (not the whole `o` pill) at each, hold a few
seconds past the engage transient, diff frame time — on an idle machine, this one is shared and noisy.

**Converted to actual fps (1000/ms) so nobody re-reads the raw table as fps again:**

| test | OFF | ON |
|---|---|---|
| Hospital LIVE production | 8.9 fps | 19.0 fps |
| LTU freehand/orbit | 7.2 fps | 11.1 fps |
| LTU with addons (night+GI) | 9.1 fps | 13.4 fps |
| LTU no-addons | 8.7 fps | 10.2 fps |

Real frame rates on LTU_AHouse (122,330 elements) are in the **7–19 fps range regardless of DLOD
state** — DLOD-on is a real, measurable win over off (roughly 1.3–2.1×), but this is not a
high-performance scene by any reading. Not a mystery: DLOD trades real geometry for cheap box
proxies at distance/occlusion, so fewer real triangles render — faster-with-it-on is the intended,
expected outcome of the mechanism working, not an anomaly needing a special explanation.

**Untested but plausible (user's own framing, worth prioritizing next):** LOD systems generally show
*more* relative benefit as scene size grows — DLOD/occl-struct's own bookkeeping cost stays roughly
flat while the naive full-detail cost it's saving you from keeps climbing. A ~1M-element building
would be a much more telling test of this mechanism's actual value than LTU's 122k. Not verified
tonight — no such building was tested — but a reasonable next target if one becomes available.

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
