# ⚠ DO NOT REMOVE — WORK ORDER SCOPE
Fix: the 3D viewer scene goes BLANK when left idle, and only reappears when you
touch/move/click. Keep the idle CPU/fan savings — do NOT revert to continuous
rendering. READ THE LOG (§-lines) after EVERY run before drawing conclusions.
REPO: bim-ootb viewer ONLY (canonical). Do NOT touch bim-compiler/deploy/dev
(that is a stale drifted copy). Test on localhost in an INCOGNITO window (the
service worker is cache-first and will serve stale JS otherwise).

## Symptom
Load a building, leave it untouched ~10-60s. The canvas goes blank/black. Any
interaction (pointerdown / wheel / keydown) instantly brings it back. Reproduces
on large buildings (e.g. LTU_AHouse, Terminal); watch the console.

## Where it lives
- Render loop + idle gate: viewer/main.js -- `animate()` ~585-647.
  - Self-park: when nothing needs frames it does `_rafId = null; return;`
    and logs `§IDLE_GATE park -- rAF chain stopped (self-parking, 0 frames)` (~592-595).
  - Revive: `markDirty()` / controls / pointerdown / wheel / keydown -> `_startLoop()`
    (main.js:508, 557-559). This is why a touch fixes it.
- Renderer creation: search `new THREE.WebGLRenderer(` (and the WebGPU path).
  Currently WebGL r184 (`§S277b_RENDERER WebGLRenderer r184 (WebGPU deferred)`).

## Prime hypothesis (check first)
On-demand rendering + `preserveDrawingBuffer: false` (the default). When the rAF
chain STOPS, no new frame is drawn, and the browser/compositor is free to clear
the drawing buffer -> blank canvas until the next render. Fix candidate: create the
renderer with `preserveDrawingBuffer: true` so the last frame persists while parked.
VERIFY the perf/memory cost is acceptable (it can disable some compositor fast-paths).

## Other hypotheses to rule out (with §-logs, not guesses)
1. A window/canvas RESIZE (or ResizeObserver / devicePixelRatio change) firing while
   parked clears the buffer without a re-render. Add a §-log on resize; if it fires
   right before a blank, the fix is: any resize must `markDirty()`.
2. Compositor/visibility: confirm it is NOT `visibilitychange` cancelling the loop
   (main.js:544) -- that path is expected. Distinguish "tab hidden" from "idle blank."
3. The orbit-DPR change on controls 'end' (main.js:521-528) leaving a half-painted frame.

## Whitebox plan (§-log first, Playwright only for wiring)
- Add a §-log of the LAST successful render timestamp + whether a frame was actually
  drawn in the tick before park. Determine: does it blank AT park, or after a later event?
- Reproduce idle (no mouse) and capture the §-line sequence around the blank.
- Name the issue each test proves/disproves.

## Witness (must pass)
Load LTU_AHouse, do not touch for 60s. Expected: `§IDLE_GATE park` fires (CPU idle
preserved) AND the scene stays fully visible -- no blank. A single forced resize while
idle also keeps the scene visible.

## Constraints
- Keep the self-parking idle gate (the whole point of §S286/§S287b). The fix must
  keep parking at 0 GPU frames but keep the last frame on screen.
- One bounded change; spec the fix before coding.

## SPEC — ✅ DONE (witness below)
**Prime hypothesis was ALREADY shipped.** `preserveDrawingBuffer: true` is set at
`viewer/scene.js:44` (added 2026-05-25, commit 1b003426). So the static no-touch
idle case is already covered — verified in headless: after `§IDLE_GATE park` the
back-buffer keeps 1.02% content (no blank). The residual real-GPU blank is
**hypothesis #1**, not the renderer flag.

**Root cause (hypothesis #1, proven):** any op that reallocates/clears the WebGL
drawing buffer *while the rAF chain is parked* and does NOT schedule a re-render
leaves a cleared buffer on screen until the next pointer/wheel/key event. The
window-resize handler `A._onResize` (`viewer/scene.js:601`) calls
`renderer.setSize()` (+ `composer.setSize()`) — which reallocates+clears the buffer —
but never calls `markDirty()`. On a real GPU the cleared buffer is visible → blank.
A spurious resize on idle (mobile URL-bar collapse, DPR/monitor change, OS display
event) therefore blanks the scene with no user "interaction". The 2D ortho grid
resize handler `viewer/grid_views.js:93` has the identical defect.

**Whitebox proof (`tests/probe_idle_blank.js`, headless swiftshader, LTU_AHouse):**
the `§RENDER_LOOP start`/`§IDLE_GATE` sequence after a forced resize while parked is
`start=1 → park → (resize fires) → <nothing> → start=2 (only on my explicit
markDirty) → wake`. No `RENDER_LOOP start` follows the resize → the resize re-paints
0 frames → blank on real hardware. (swiftshader retains pixels across realloc, so it
can't *visually* repro — the §-log is the authority, per protocol.)

**Fix (one bounded change — "any resize must markDirty"):** append
`if (A.markDirty) A.markDirty();` to the end of `A._onResize` (scene.js), and add the
same call inside the grid_views ortho `_resizeHandler`. This revives the parked loop,
draws exactly one frame at the new size, then the idle gate immediately re-parks at 0
GPU frames — the idle-CPU savings are untouched. Mirrors the existing
`webglcontextrestored` handler, which already calls `markDirty()` (scene.js:352).

### Witness (PASS)
- `§IDLE_GATE park` fires after idle (CPU savings preserved) — UNCHANGED.
- After fix, a forced resize while parked emits `§RENDER_LOOP start` + `§IDLE_GATE
  wake` (one frame) then re-parks — proven by `tests/probe_idle_blank.js`
  (`§PROBE resize-revives-loop: true`).
