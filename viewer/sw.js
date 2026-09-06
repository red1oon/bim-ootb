/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// sw.js — Service Worker for offline support (S232, S239 cache versioning)
// Network-first for .html/.js (always fresh on deploy).
// Cache-first for heavy assets (.wasm, images). DB files skip SW (IndexedDB handles them).
//
// v1087 (2026-08-25) §S65 §TPL_ZERO_MINUTE: rates.js + rates/sequence_rules.json + schedule_author.js
// + time_machine.js all changed (preset 4D template fixes — see witness_sequence_template_lock.js).
// All four are in PRECACHE_ASSETS, so without this bump an installed service worker keeps serving the
// old table and the fix never reaches an existing user. That exact miss happened twice in 90 minutes
// on 2026-08-25 (#1521 for #1520, then #1524 for #1523) — WITNESS_INTERFACE_FRAMEWORK.md §CRISIS
// LESSON 4. Bumped in the SAME PR as the change, deliberately.
// v1088 (2026-08-25) §GANTT_BAR_IS_ITS_TASK (§S65 STAGE 3): gantt_model.js + time_machine.js changed —
// an authored Gantt bar is now drawn at its TASK'S window instead of a Tukey fence over its member
// elements. Both files are in PRECACHE_ASSETS. v1087 shipped the STAGE 2 template fix (#1527); this is
// a separate change and needs its own bump, per the twice-missed rule (§CRISIS LESSON 4).
// v1089 (2026-08-25) §ZONE_WINDOW_COVERS_WORK: schedule_author.js changed — a zone task's window is
// now floored at its own members' crew-days (5 over-committed windows across 4 buildings -> 0/135).
// schedule_author.js is in PRECACHE_ASSETS; v1088 shipped the STAGE 3 drawer change (#1528), so this
// separate change needs its own bump (§CRISIS LESSON 4).
// MERGE NOTE (2026-09-02): this branch and origin/main both bumped to v1121 concurrently (§MEP_DISC_PALETTE
// below took v1121 first). Same standing rule as every sw.js merge: KEEP BOTH notes, take the HIGHER
// version, each separate change gets its OWN bump — so §TM_REVEAL_TILED is v1122.
// v1122 (2026-09-02) §TM_REVEAL_TILED (4D_GANTT_TM_REFACTOR.md §FUTURE item 2 / §TM_REVEAL_SHIPPED):
// time_machine.js changed — kernel_ops timestamps are now tiled inside each task bar (CPM order,
// own-duration width, no dead air) instead of the per-task affine that left 44-71% of every bar
// empty and piled a floor's slabs into one instant. time_machine.js is in PRECACHE_ASSETS, so an
// installed service worker keeps serving the affine without this bump (§CRISIS LESSON 4). Paired
// with _GANTT_CACHE_VERSION 37→38 (the IDB kernel_ops self-heal) in the same commit.
// DEPLOY: bump CACHE_VERSION on every OCI upload. Old caches are purged on activate.
// v1133 (2026-09-03) §STOREY_DATUM_FRAME: schedule_author.js + time_machine.js changed — the declared
// storey ladder is now chosen by VERTICAL FRAME (its span must contain the element base-Z median),
// not by which column is non-empty; on Hospital_meta.db the 56 local-frame elevation rows had won
// over the 7 world-frame center_z rows and collapsed the building to ONE band (7 tasks, 509 d vs
// 8 bands / 42 tasks / 318 d). Both files are in PRECACHE_ASSETS, so an installed service worker
// keeps serving the collapse without this bump. Paired with _GANTT_CACHE_VERSION 38→39.
// v1134 (2026-09-04) §BAKE_INTERIOR_TOPUP: the still/bake fixture-light selection is no longer
// frustum-centre ONLY — a short in-frustum set is topped up to the still budget with the same
// nearest-to-aim + §NIGHT_SPREAD rule navigation uses (_nightPickNearest, extracted VERBATIM so
// nav and bake cannot drift apart), and the camera matrix is refreshed before the cull
// (§BAKE_FRUSTUM_STALE). An interior pose whose frustum held no fixture centre previously left
// every §NIGHT_BAKE_POOL slot at intensity 0 — the room lit by flat fill alone. tools.js?v=45->46.
// v1135 (2026-09-04) §CPE_FLAGS_PORTABLE: the building DB's `cinema_path` table now carries the
// four film flags (buildup, room_title, reveal, day_counter) alongside the path geometry it already
// stored, so a path saved with Ctrl+S no longer travels with every feature silently OFF. Columns are
// APPENDED and the reader PRAGMA-probes them, so old and new .db files open in both directions.
// scene.js?v=59->60, effects.js?v=32->33.
// v1136 (2026-09-04) §CPE_ROSTER_NOT_A_HIGHLIGHT: the Reveal round's revolving rotation is the
// stat cards ONLY. The held build-up crew roster is no longer one of the slots — it holds,
// un-rotated, through round 1 where it means something. A build-up slide is not a finished-building
// highlight (user ruling). cinema_maxq.js?v= bumped in viewer.html.
// v1137 (2026-09-04) §CPE_FLYBACK_FACE_TRAVEL: during the Reveal fly-back the camera now faces the
// DIRECTION OF FLIGHT (the retrace tangent) instead of holding the angle of attack it arrived on,
// which read as sideways on every corner. The two end turns are sized by the real angle at
// CINEMA_TURN_DPS, not a fixed seam, because the reveal sub-beats are outside the gaze rate limiter.
// effects.js?v=33->34.
// v1138 (2026-09-04) §CPE_TAIL_LIGHTS_ALL_ONLY: during the disc parade's ONE-DISCIPLINE slots the
// staged luminaires and their glow are OFF — the trade's delicate geometry reads on its own instead
// of being washed out by lamps that filterDiscs has hidden anyway. The all-together slot keeps its
// lights. Illumination is scaled to 0 rather than torn down, because §NIGHT_BAKE_POOL froze the
// point-light COUNT for the whole bake on purpose. effects.js?v=34->35, cinema_maxq.js?v=10->11.
// v1139 (2026-09-04) §SFR_UNIFORM_NOT_DEFINE: §SUN_FILL_RATIO's policy is unchanged, but it is no
// longer expressed by swapping m.envMap — every material keeps ONE map and the matte set is held at
// envMapIntensity 0 instead. The swap parked a second texture reference on every matte material for
// the whole of staging, and updateSky() disposes the target it pointed at. Same picture, no live
// reference to freed GPU memory. effects.js bumped in viewer.html.
// v1140 (2026-09-04, revival of PR #300) §CL-2: wh_walk.js gains a collapsed 'Paste incoming op
// log' receive box — paste base64 blob from POS -> pre-gate dedup by op_uuid -> commitGroup into the
// IDB sidecar (idmp_kanban_proj) -> draftPick refresh -> the pending shipment surfaces in the
// selector. Paste-twice safe.
// v1141 (2026-09-04) §DLOD_TM_OWNERSHIP: dlod.js stands down while the Time Machine owns instance
// matrices (time_machine.js _finishActivate → dlodDisable, deactivate → dlodEnable; dlodEnable/Tick
// refuse under _tmOn). Root cause of the first Hospital CLI silent bake losing 24,992 instanced
// elements (glass panes, mullions, furniture) at 47.9 s for the rest of the film — dlod.js captured
// its _origMatrix refs after TM had zero-scaled them and "restored" zero. Also §CPE_CLIP_REVEAL_FILM_T
// (cinema_maxq.js: the Reveal reads film time, not clip-local time) + dev-only --clip/--tap in
// cli_silent_bake.js. dlod.js?v, time_machine.js?v, cinema_maxq.js?v bumped in viewer.html.
// v1142 (2026-09-04) §CPE_REVEAL_LENS_QUAD_OFF: the §GLOW_LENS_QUAD path never honoured
// A._cpeRevealLightsOff — §CPE_TAIL_LIGHTS_ALL_ONLY turned off the round sprite and the point
// lights for a one-discipline Reveal slot, but the additive lens quads kept drawing over the trade
// being revealed. Gated by zeroing the material colour (not by teardown, so §R10's stage-keep guard
// survives). effects.js bumped in viewer.html.
// v1143 (2026-09-04) §MESH_NARROWPHASE (CLASH_GATE_OBB_NARROWPHASE.md §M): new viewer/clash_narrow.js —
// the clash list's bbox-only rows are annotated with a triangle-exact verdict (OBB/SAT mid phase +
// three-mesh-bvh intersectsGeometry, reusing the §BVH_DEFERRED trees). clash_matrix.js (qualify on cell
// click) and measure.js (list render shows mesh-true / bbox-only) changed; all three are PRECACHE_ASSETS.
// v1144 (2026-09-04) §CLASH_FILM_P1 (MEP_CLASH_REVEAL_MOVIE.md §CLASH_FILM_P1): new viewer/clash_film.js —
// the mesh-true clash pairs as PERSISTENT world content in a baked film, red/blue instanced box
// shells pulsing on FILM time. Not gated by the Time Machine: the markers stand from frame 0 over
// empty ground so the viewer sees where the trouble will be before it is built. Per-instance fade
// channel reserved for phase 2's near-and-facing labels. --clash/--no-clash on cli_silent_bake.js.
// v1145 (2026-09-05) §CLASH_FILM_CONTACT_MARKER + §CLASH_FILM_PULSE_ENVELOPE + §CPE_BAKE_RES:
// the clash marker is now the CLASH (two small boxes straddling the contact, sized from the
// penetration) not the whole element — a 98.9 m slab was lighting up the floor and washing the sky.
// The pulse is an asymmetric envelope (2 s rise, 1 s hold, 3 s fall, 2 s dark) instead of a sine
// that never read as off. Alt+C gains a Clash pairs checkbox and a Silent-bake size select which
// cli_silent_bake.js honours when --width/--height are absent.
// v1145 (2026-09-05) §CLASH_FILM_P2 (MEP_CLASH_REVEAL_MOVIE.md §CLASH_FILM_P2): new viewer/clash_labels.js —
// the in-scene label for a clash pair within 4.0 m of the camera (release 4.6 m), occluded or not,
// any number, limited only by screen-space non-overlap. One half-transparent HUD panel per pair
// (A-side name red above, B-side blue below, from rates.js desc), composited in _captureFrame's
// 2D pass with a leader to the projected contact; labelled pairs hold solid via clashFilm.setFade.
// cinema_maxq.js (hooks) + measure.js (setup) + viewer.html changed; all PRECACHE_ASSETS.
// v1146 (2026-09-05) §CLASH_FILM_SKY_WASH: viewer/clash_film.js — each marker is clamped to a
// constant small SCREEN size (6 % of frame height) per frame from the camera, so a marker near the
// lens can no longer balloon over the sky; PEAK 0.55 → 0.30. cinema_maxq.js disposes the markers
// on the THROW path too and guards the per-frame update. Also §CPE_CLIP_SUN_ARC_FILM_T: a --clip
// bake's sun arc now reads the FILM fraction, not the clip-local one (it swept 55°→6° inside every clip).
// v1147 (2026-09-05) §CLASH_LABEL_HUD_FAMILY: viewer/clash_labels.js — the label's text is now the
// day counter's family (marker colours tinted 0.45 toward white, weight 700, the counter's corner
// rule) instead of saturated rgb(255,33,26)/rgb(41,112,255) at 600; the leader line and dot carry a
// dark halo under the white core so they hold contrast against a lit wall or the sky.
// v1148 (2026-09-05) §P2.1 AMENDED: viewer/clash_labels.js — the label enter/release distance is 10.0 m /
// 10.6 m (was 4.0 / 4.6; user: "10 meters or half of scene space" after a clip whose nearest pair was 7.98 m).
// v1149 (2026-09-05) §R17_SHADOWMAP_RELEASE: effects.js — the Alt+S 4096² sun shadow map (and its
// depth-texture-backed WebGLRenderTarget) is disposed and handed back to the GPU on still-mode exit
// instead of retained, so repeated Alt+S sessions no longer accumulate a 128 MiB map / 64 MB live RT
// at rest.
// v1150 (2026-09-06) §SUN_ARC_TOPOUT_SNAP: effects.js/cinema_maxq.js — past the plan's topout
// fraction, the sun arc eases to the dramatic 6° Alt+S angle over a short window instead of crawling
// there at the film's last frame; the pre-topout formula is an untouched code branch (zero regression
// to the outdoor shadow-to-sun-angle correlation during active construction). Fill/PL pin unchanged.
// v1151 (2026-09-06) §P2.4 + §CLASH_HUD_CARD (MEP_CLASH_REVEAL_MOVIE.md): viewer/clash_labels.js — the
//   clash label gains a 3rd row "[tolerance mm / clash mm]" (rule tolerance from clash_rules.json, clash
//   from the pair's severityM); viewer/clash_film.js — stamps tolMm per pair, stats() exposes broad/
//   falseExcluded; viewer/cpe_resource_panel.js — reveal-round roster gains a "mesh-true clashes
//   flagged" card read from A.clashFilm.stats(), dropped when the film was never built.
// v1152 (2026-09-06) §MESH_OVERLAP_DEPTH (MEP_CLASH_REVEAL_MOVIE.md): viewer/clash_narrow.js — every mesh-true
//   CLASH record now carries depthMeshM/overlapMaxM/overlapA/overlapB/overlapExact/overlapCenter, the EXACT
//   box of the overlap solid (intersection-curve endpoints + inside vertices, both frames); §CLASH_DEPTH_PROXY
//   reports how far the SAT proxy sat from it. viewer/clash_labels.js — the [tol / clash] row reads the mesh
//   figure (clashSrc=mesh), the OBB proxy only as a stated fallback. viewer/clash_film.js — build log counts.
// v1153 (2026-09-06) §CLASH_MARKER_OVERLAP_BOX + §CLASH_FILM_FLAT_FILTER (MEP_CLASH_REVEAL_MOVIE.md): viewer/clash_film.js —
//   the marker is the oriented box of the REAL overlap solid (overlapCenter + overlapA, A's rotation), split red/blue
//   along the A→B-aligned axis, per-axis 0.30/1.20 m clamp; flat overlaps (<1 mm) are dropped from the film's set
//   (verdict untouched). viewer/cpe_resource_panel.js — the clash card notes dropped flat touches.
// v1154 (2026-09-06) §SUN_ARC_TOPOUT_SNAP REVERTED (MEP_CLASH_REVEAL_MOVIE.md): viewer/effects.js — the sun's elevation
//   is the single linear 55°→6° formula of the film fraction again (#1685's post-topout snap removed, user: it was
//   never to be touched); viewer/cinema_maxq.js — _sunArcStep(_tnFilm) single-argument. TOPOUT_SNAP_EASE_U and the
//   _revealU wiring stay (the Reveal round and §PL_TOPOUT_UNPIN use them).
// v1155 (2026-09-06) §PL_TOPOUT_UNPIN (MEP_CLASH_REVEAL_MOVIE.md): viewer/effects.js — past the plan's topout the bake's
//   fixture point-lights ease from the staged Alt+S cut (0.5) to nav Night Mode's tuned 1.0 over the sun's own snap
//   window; pre-topout byte-identical. viewer/cinema_maxq.js passes _revealU to the fill pin. (v1153 = #1689, v1154 = #1691.)
// v1156 (2026-09-06) §STOREY_HIGHLIGHT_REVEAL (MEP_CLASH_REVEAL_MOVIE.md): new viewer/cpe_storey_reveal.js —
//   fills the LAST 5 REAL SECONDS of the `pullback` beat (ending exactly where `orbit` begins, plan.beats.rise
//   — NOT the orbit beat itself) with each real storey (elements_meta, Ceiling/TOS pseudo-storeys excluded)
//   tinting blue/green/yellow/orange in sequence (hba_lens.js's proven setColorAt/emissive tint pattern,
//   restored on exit) plus a HUD card of real door count/footprint-estimate/compiled-room-count (room clause
//   omitted at 0 — §VACUOUS). New "Storey highlight" checkbox in cinema_path_editor.js (off by default);
//   cli_silent_bake.js gains --storey-reveal/--no-storey-reveal. viewer/cinema_maxq.js + cpe_room_title.js
//   wire the same pure functions into both the bake loop and the editor's live preview so they can never
//   disagree. Window narrowed mid-session (user correction) to leave the rest of `pullback` free for a
//   separate discipline-pair clash-highlight feature (fix/hud-clash-measure-stats, different worktree).
const CACHE_VERSION = 'v1156';   // bump on each deploy; per-change detail is the git commit message.
// v1128 (2026-09-02) §SUN_FILL_RATIO: viewer/effects.js — the Alt+S staging HDRI
// (belfast_sunset_puresky_1k) was being pushed onto EVERY material by _reassertPhotoEnvMap, matte
// concrete and plaster included. IBL is non-directional and is NOT shadow-map-occluded in three.js,
// so it lit walls facing AWAY from the sun as hard as walls facing it: measured away/sun separation
// 1.0429 on Clinic (the away wall was BRIGHTER) and 0.9170 on Hospital, against 0.2408/0.2372 in
// plain navigation. Matte materials now keep the plain-nav sky env map; glossy/mirror keep the HDRI
// (42/42 and 70/70 asserted still on it). effects.js is in PRECACHE_ASSETS and viewer.html's query
// is bumped effects.js?v=30->31 in the SAME PR (§CRISIS LESSON 4).
// Witness: witness_sun_fill_ratio.js (§SFR_REDGREEN, RED CONTROL 0.0005/0.0000).
// v1131 (2026-09-03) §R15 levers DEFAULT FALSE. #1635 auto-merged before the second
// W-BUDGET-CONVERGE run returned; that run reports verdict=FAIL (as did the first) with THREE
// phases 15-45% slower and whole-cycle dt_mean flipping sign between runs. The counters, the
// richer §DLOD_NAV_BUDGET line and the §ROOM_OCCL_INDEX_ERR fix all stay; only the behaviour
// change is disarmed until A-27 removes the demote-side fade cost. dlod_nav.js?v=3->4.
// v1130 (2026-09-03) §R15 DLOD budget controller convergence: the §20 mesh-budget integrator ran
// at 150 ms while its own feedback (activeElig, published once per completed chunked scan pass)
// arrived every 387 ms — MEASURED 55.0% of control periods integrated an unrefreshed number — and
// had no anti-windup, so it charged to MAX_BOOST against an aerial view where widening the distance
// provably buys nothing. Two rules, both conditions rather than tuned constants: act once per
// MEASUREMENT, and stop integrating in a direction the last step proved ineffective.
// viewer.html dlod_nav.js?v=2->3 bumped in the SAME commit. Witness: witness/w_budget_converge.js.
// v1129 (2026-09-02) §DUCT_SILHOUETTE: new viewer/silhouette_refine.js, hooked at the single
// geometry choke point A.blobToGeometry (scene.js). §MEP_SMOOTH_NORMALS fixes SHADING at a 55
// deg crease and provably cannot fix an OUTLINE, so a big duct stayed a visible N-gon while a
// lamp did not — MEASURED, the two differ 50x in projected chord deviation, not in detection.
// One level of uniform Phong subdivision on the elements whose own facet step still covers a
// 1080p pixel at 5 m. Hard edges keep the plain midpoint, so flat surfaces are untouched.
// viewer.html scene.js?v=58->59 and streaming.js?v=68->69 bumped in the SAME commit.
// PRECACHE entry added in this same commit — a new module that is not precached is invisible
// offline, and a precached scene.js served past a version bump would call a function that is
// not there (the §CRISIS LESSON 4 failure mode noted under v1127).
// v1127 (2026-09-02) §MEP_COLOR_SURVIVES_PHOTOREAL: streaming.js gives an MEP element its trade
// HUE when its own colour carries none, keeping the element's own V (and every roughness/metalness/
// envMap/triplanar term) untouched — so MEP reads by system in an Alt+S still and the Alt+C movie
// instead of the uniform grey metal the metal triplanar texture multiplied out of the shipped
// achromatic off-white default. §MEP_DISC_TINT's `!rgbaStr` gate + its 3-class DISC_TINT_CLASSES
// list are subsumed by ONE owner, A._mepDiscAlbedo. viewer.html streaming.js?v=67->68 bumped in
// the SAME commit (§CRISIS LESSON 4 — a precached streaming.js is served past a CACHE_VERSION bump
// without its own ?v= change). The disc->hue mapping is an AUTHORED choice reusing A.DISC_COLORS
// verbatim, NOT a published MEP standard — no such convention exists in the model data.
// Witness: witness_mep_color_photoreal.js (W-MEP-COLOR-PHOTOREAL) — 55/55, five buildings, red
// control + tier-1 byte-identity on the user's own fire-red lever (1300/1300 elements).
// v1126 (2026-09-02) §CPE_AIM_DEPTH_RETIRED: viewer/effects.js — §CPE_AIM_DEPTH, the last automatic
// exception to path-follow, is REMOVED on user directive ("its best to leave alone its pointing
// along its path ... to stay simple and predictable"). Gone with it: §CPE_AIM_GRID, §CPE_AIM_LATCH
// (the weight running-max; the Beat3→4 hand-off line is RENAMED §CPE_BEAT3_END_DIR, not removed),
// §CPE_AIM_DEPTH_SERIES/_SCALE/_VERTICALITY/_OPEN_TAPER/_FWD_CLEAR/_BUILDUP, and §CPE_STICK_HOLD's
// aim half (_holdBoostAt fed only _aimDepthApply — a held beat is now a pure rate dip). KEPT:
// §CPE_AIM_PIN, the correction window, §CPE_AIM_DEPTH_FREEZE (#1598), §CPE_CORR_BRANCH (#1597).
// effects.js is in PRECACHE_ASSETS and viewer.html's query is bumped effects.js?v=29->30 in the
// SAME PR — without both an installed SW keeps serving the pre-change file (§CRISIS LESSON 4).
// Witness: witness_cpe_aim_retire.js (7/7 depth-OFF, red control fails on the depth-ON arm).
// v1125 (rebase of PR #1318 onto origin/main) §GANTT_CACHE_ERR_STACK: time_machine.js's
// injectGantt cache-activate catch block now logs the stack + which phase failed (pre/post
// loadOps) instead of the bare error message, which could not locate a live user's GUID-key
// crash. Logging-only, no behavior change.
// MERGE NOTE (2026-09-01, third of the day, same standing rule: KEEP BOTH notes, take the HIGHER
// version, each separate change gets its OWN bump):
// v1119 (2026-09-01) §WALL_SIDE_AND_LIGHT_FLOOR: streaming.js class-keyed material.side (census-
// derived FRONT_SIDE_CLASSES, T1<=2% defect; §S260d "inconsistent normals" premise corrected —
// measured false) + scene.js ambient/hemi lowered to the derived light floor so away-from-sun
// faces darken. viewer.html streaming.js?v=65->66 + scene.js?v=57->58 bumped in the SAME commit.
// Witness: witness_wall_side_light_floor.js (pick integrity + no-vanish + perf/mem gates).
// v1120 (2026-09-01) §CLI_SILENT_BAKE (cinema_maxq.js?v=9 dev-only scripted bake entry) +
// §NIGHT_BAKE_POOL (tools.js?v=44 — point-light COUNT frozen during a MaxQ bake; measured
// 13-53 s/frame shader-recompile churn on the first headless Hospital bake, s4_300.log).
// v1121 (2026-09-02) §MEP_DISC_PALETTE: the §SUNGLASS discipline band (ticks 56-65) paints from
// A.DISC_COLORS — the viewer's OWN legend — instead of an alphabetic cycle through a generic earth
// ramp (tools.js?v=44->45), and streaming.js?v=66->67 sets userData.disc on discipline-UNIFORM
// InstancedMeshes so they stop falling into §SUNGLASS's 'Unknown' bucket. The disc->colour mapping
// is an AUTHORED choice reusing an existing in-repo table, NOT an industry MEP standard — no such
// convention exists in the model data. Witness: viewer/tests/witness_mep_disc_palette.js.
// MERGE NOTE (2026-09-01): this branch and origin/main both bumped to a v1114/v1115 concurrently —
// the conflict CLAUDE.md names sw.js as the magnet for. Resolved by its own rule: KEEP BOTH notes,
// take the HIGHER version, and since §CPE_CORR_BRANCH is a SEPARATE change from §CPE_MATERIAL_KEY it
// gets its OWN bump rather than riding v1115 (§CRISIS LESSON 4, the twice-missed rule).
// v1116 (2026-09-01) §CPE_CORR_BRANCH: viewer/effects.js changed — _cpeCorrDirBlend's 2*pi branch is
// now resolved ONCE per correction stroke (a port of §CINEMA_GAZE_SENSE's fix) instead of per sample
// by round(raw/2pi), which is a step function of the underlying gaze and snapped the camera 110.44 deg
// in ONE sample on Hospital where the walk's own worst sample is 13.28. effects.js is in
// PRECACHE_ASSETS and viewer.html's query is bumped effects.js?v=27->28 in the SAME PR — without that
// second bump a stale ?v= URL keeps serving the pre-fix file (the failure at v-note "why is this still
// blue" below). Witness: witness_cpe_corr_brush.js 8/8 on Hospital, with an in-run A/B
// (A._cpeCorrBranchOff) measuring 110.436 -> 13.114 deg/sample.
// v1115 (2026-09-01) §CPE_MATERIAL_KEY: streaming.js triplanar texture lookup now keys the
// element's OWN authored material_name FIRST and falls back to ifc_class (viewer.html
// streaming.js?v=64->65 bumped in the same commit, per the v1030 lesson below).
// v1114 (2026-09-01) §SUNGLASS_GROUPING_RULES + §SUNGLASS_BROWN_TRACK (bim-compiler
// prompts/CINEMA_PATH_EDITOR.md §SESSION_2026-09-01C): palette storey bands (ticks 31-55) now a
// monotonic ramp keyed on the storey's geometric ordinal (median world-Y), not alphabetic rank +
// cycling list; class/disc bands byte-identical. Palette scrub track paints ticks 98-100 brown
// (material-injection affordance). tools.js?v=42->43, viewer.html CSS — both in PRECACHE_ASSETS.
// Witness: witness_sunglass_grouping_rules.js.
// v1092 (2026-08-27) §R10 (bim-compiler prompts/CPE_4D_PERF_MEM_FINDINGS.md §7, extends R1's
// §MAXQ_STAGE_KEEP contract): the MaxQ bake's per-frame §GLOW_LENS_QUAD rebuild (viewer/effects.js)
// now skips the dispose+rebuild when the TM-visible fixture count is unchanged since the last
// stage — its geometry never reads A.camera, unlike the round glow sprite and §NIGHT_STILL_LIGHTS
// (both untouched, both correctly camera-dependent). effects.js?v=26->27, both in PRECACHE_ASSETS.
// Witness: witness_glow_lens_stage_keep.js, 7/7 PASS (Duplex A/B: baseline 29 stage/remove cycles
// in 28 frames -> fix 2 stages + 27 skips, last-frame rect/round counts byte-identical both sides).
// v1090 (2026-08-27) §TPL_MODEL: rates/4D_template.json ADDED to PRECACHE_ASSETS (it defines the
// canonical task grid and was never precached, so offline/cold-SW silently ran the dead deriveZones
// path), plus schedule_author.js now names which model ran at the fork. Both are precached, so
// without this bump an installed worker keeps serving the version with neither.
// v1084 (2026-08-25) §CPE_BUILDUP_REQUIRE_TM_FIRST (CINEMA_PATH_EDITOR.md, user ruling "no auto
// JSON outside TM"): Alt+C's bake no longer generates a building's first-ever 4D schedule.
// window.tmHasExistingSchedule() (time_machine.js) — read-only, no DB writes, never generates —
// checks active ops / IDB gantt cache / kernel_ops before cinema_maxq.js ever calls
// tmActivateForBake(). No schedule yet -> visible status "Open Time Machine first to build the
// construction schedule — baking without it this time", bake continues as a plain flythrough with
// no buildup. Once a schedule exists (from either source) every later bake reads it silently, same
// as before — this is a one-time gate, not a per-bake check. Witness:
// witness_cpe_buildup_require_tm_first.js.
// v1083 (2026-08-25) §CPE_BUILDUP_ACTIVATE_POPS_PANEL (CINEMA_PATH_EDITOR.md): Alt+C's bake
// (tmActivateForBake) no longer calls the real, panel-popping activate() — a new `silent` param
// threaded through activate()->_activateAsync()->_finishActivate() loads the same schedule data
// (_ops/_projectStart/_projectEnd, xray cache, computeDays, saveVisibility) without ever touching
// the Time Machine panel DOM/canvas (no setToolbarHighlight/_panel.display/switchMode/renderAtTime/
// updateStatus/drawGanttMini/drawDashboard/_loadTwin fetch). A real user Play is unaffected (silent
// is falsy for every other caller). New window.tmDeactivateIfBakeOwned() (cinema_maxq.js, called on
// every bake exit path) turns TM back off ONLY if the bake itself silently turned it on — a bake
// that reuses an already-open real TM session leaves it untouched. Witness:
// witness_cpe_buildup_activate_silent.js.
// v1078 (2026-08-23) SCRIPT_LENGTH_REFACTOR_SEAMS.md §S59 candidate 2 — navigate_find.js's ERP-push
// block extracted to NEW find_erp_push.js (loaded by main.js's lazy navigate list BEFORE
// navigate_find.js?v=58). NOT precached ON PURPOSE: none of the lazy navigate_* sub-modules are
// (navigate_find/grid/path/engine/controls, room_graph, hallway_backbone — only navigate.js is);
// local .js is network-first, so online users fetch fresh. This bump purges stale runtime caches
// so an offline fallback can never pair an old self-contained navigate_find.js with the new main.js.
// v1064 (2026-08-21) 4D_GANTT_TM_REFACTOR.md §S58 — observability hardening, ADDITIVE LOGGING
// ONLY, no rule or behaviour changed. (a) the three §GANTT_* proof lines now fire on every
// model REBUILD instead of once per building, so an edit is auditable (rebuild=N ordinal).
// (b) NEW §HOSTED_BEFORE_HOST line — it had no log line at all; first run exposed Terminal
// 268/2367 hosted elements (11.3%) falling through unguarded. (c) NEW §GANTT_AXIS line.
// (d) five silent catches now warn: §LABOR_QUANTITY_WEIGHT_SKIP, §HEAVY_MEMBER_SPEED_LIMIT_SKIP,
// §WOULD_CYCLE_BLIND, §CASCADE_BLIND, §LOC_AXIS_PERSISTED_UNREADABLE.
// v1063 (2026-08-21) 4D_GANTT_TM_REFACTOR.md §S54 (item F2): time_machine.js's two ERP-twin
// loaders (_loadTwin/_loadShopfloor) no longer default a missing activeBuilding to 'Hospital' —
// with no active building they now skip BEFORE the 25.8MB ad_seed.db fetch instead of attaching
// another project's cost figures to an arbitrary IFC. Witness: witness_tm_erp_twin_guard.js.
// v1062 (2026-08-21) 4D_GANTT_TM_REFACTOR.md §S53 (item F3): the Gantt bar MODEL extracted out of
// time_machine.js into NEW gantt_model.js (precached above, viewer.html loads it first) —
// buildGanttTasks/computeDays/_tukeyBound are now thin wrappers over it. Behaviour-preserving,
// no rule changed; witness_midair_zero.js pass=49 fail=0 with every number identical.
// v1061 (2026-08-21) §S51 item d (4D_GANTT_TM_REFACTOR.md §S51): the Gantt reads the cell
// schedule — CELL-path generations stamp _cell into kernel_ops and buildGanttTasks groups bars by
// it (graph-path buildings unchanged). _GANTT_CACHE_VERSION 36->37 regenerates pre-stamp ops.
// v1060 (2026-08-21) §S50 cell-grain schedule (4D_GANTT_TM_REFACTOR.md §S50, user ruling: the
// support graph is retired as the live precedence carrier). cpm_schedule.js gates per building
// (representability >= 0.88 -> (location, trade) cell schedule; below -> graph engine unchanged);
// NEW location_axis.js + lib/level_deriver.js precached; viewer.html loads both + room_walker
// before cpm_schedule. _GANTT_CACHE_VERSION 35->36 — the schedule shape changes on gated buildings.
// v1059 (2026-08-18) 4D_GANTT_TM_REFACTOR.md, E3 gate fix: cpm_schedule.js's milestone() no longer
// exempts stragglers from feeding their own phase's completion gate ("phase done" now means the
// WHOLE group, not a filtered subset). Verified fleet-wide: floating=0/7 unaffected (only 'member'
// tidiness edges changed, never E1/E2 physics); the gate itself now matches true bulk completion
// exactly on Duplex/HHS/Hospital (e.g. HHS Level 1 t1Complete 0.2d->27.7d). Real, reported
// caveat: ~24% of MEP Rough-in at HHS Level 1 still starts early via legitimate cycle-breaking
// (the same deadlock-avoidance mechanism the removed exemption used to provide preemptively, now
// resolved per-cycle by solve()'s existing Round-1 breaker instead) — not silently patched around.
// _GANTT_CACHE_VERSION 34->35 bumped alongside.
// v1058 (2026-08-18) 4D_GANTT_TM_REFACTOR.md, the axis near-duplicate fix: computeDays()'s
// _ganttAxisEnd used the SAME cliff rule stage 2 fixed inside buildGanttTasks() (2nd-98th
// percentile above n=20, true max below), applied to the GLOBAL end_ts population instead of one
// bar's span. Fleet-measured live (before fix): every one of the 7 buildings had bars whose real
// end exceeded the axis they were drawn against — worst LTU 17.8d/12 bars, Hospital 10.6d/5 bars
// (top floors squashed toward the panel edge). Data-correct, draw-wrong. Now uses the same shared
// _tukeyBound as the bar-span fix — 0 overflow, all 7 buildings, after. _GANTT_CACHE_VERSION
// 33->34 bumped alongside.
// v1057 (2026-08-17) 4D_GANTT_TM_REFACTOR.md stage 2: buildGanttTasks()'s bar-span rule replaced
// (2nd-98th-percentile-above-n20/true-min-max-below -> uniform Tukey-fence, no cliff) — the
// mechanism behind the live "one pile, full project length" report. _GANTT_CACHE_VERSION 32->33
// bumped alongside so an already-persisted/cached schedule regenerates through the fixed path.
// v1056 (2026-08-17) §S20 Part B (4D_GANTT_TM_REFACTOR.md): time_machine.js's dead legacy
// display-repair chain (_twoTierRemap/_midairRepair/_tier1Serialize/_tierAuditRegate + their
// _tier1Extents/_tier1Protrusion/_zoneOf/_TIER1_ORDER helpers — reachable only via the now-deleted
// ?cpm4d=0 fallback, confirmed twice this lane never reached it live) DELETED, -540 lines. No
// schedule-affecting logic changed (the CPM branch, the only path ever executed live, is byte-for-
// byte unchanged) — _GANTT_CACHE_VERSION NOT bumped, fleet floating/storey/crew numbers measured
// IDENTICAL before/after (probe_cpm_schedule.js, probe_cpm_display_path.js). This bump is precache
// hygiene only (time_machine.js content changed).
// v1051 (2026-08-16) §S7_OUTLIER_DELTA: Gantt drag/resize no longer collapses (437/gesture) or
// INVERTS (217/gesture) the ops riding outside their task's drawn Tukey bar — outsiders get the
// window's uniform start delta with true duration preserved (time_machine.js, 4D_GANTT_TM_REFACTOR.md §S7).
// v1050 (2026-08-16) §MIRROR_ROOM_PROBE: Alt+S glossy/metal materials reflect a real one-time
// CubeCamera capture of the actual scene (a room-representative point, same pivot heuristic
// _cinemaPathPlan uses) instead of only the static sky/HDRI — user: "what does it take for
// mirrors to truly reflect... try the single room-representative probe first" (effects.js?v=23).
// A per-element name-keyword mirror boost was attempted and DROPPED (not shipped): A._matCache
// only covers instanced/merged-tracked elements — Clinic's real "M_Mirror" elements render via
// the batched path and never register a matCache entry, so there's nothing for a per-element
// boost to attach to; fixing that needs a batched-mesh-aware path, out of scope here. Real bug
// found+fixed in the same pass: dispose+rebuild every Alt+S cycle leaked +1 texture/cycle
// (compounding, C1/C2/C3 measured 25,1,1) — fixed by building the probe ONCE and reusing it
// across cycles (only disposed on a real building switch), same discipline as A._camLight.
// v1049 (2026-08-16) §S6_CREW_PASS: crew-aware CPM forward pass (serial SGS), §CREW_FEASIBILITY +
// §CREW_SPREAD_FLOOR fleet gates (#1406) — unrelated to this change.
// v1048 (2026-08-16) bim-compiler prompts/4D_GANTT_TM_REFACTOR.md S1-S4 closeout: §S1_BAND_RANK
// (cpm_schedule.js buildGraph — E4 storey hammocks + straggler group-key use 3m z-bands, not
// per-storey-name rank, PR #1401); §S2_TUKEY_ENVELOPE (time_machine.js _tmDisplayRemap — task bars
// are a classification-free Tukey-fenced robust envelope over ALL group members' true times,
// replacing the straggler-classification min/max clip, PR #1402); §S4_RAW_SCHEDULE_REUSE
// (time_machine.js injectGantt skips a redundant computeSchedule call when materializeZones already
// computed it, PR #1404). _GANTT_CACHE_VERSION 29->30 — any building already materialized under the
// old E4/bar-shape formulas will regenerate on next activation rather than replay stale schedules.
// v1047 (2026-08-16) §ZONE_WINDOW_DAGWINS_CLIP: task bars = non-straggler envelopes (user:
// "schedule looks gibberish" — every Hospital bar ran to project end, smeared by 11,215 dag-wins
// stragglers); §CAP_RESCALE_SKIP: display-authored windows never re-spaced (views, not a second
// schedule); §CPM_DISPLAY_EPOCH: one-truth reuse rigid-shifts the cached timeline onto the
// requester's epoch (was landing uncovered ops in 1970). _GANTT_CACHE_VERSION 28->29.
// v1046 (2026-08-16) §CPM_DISPLAY: time_machine.js display timeline authored by cpm_schedule.js
// one-DAG forward pass (support/host/discipline/storey edges, SCC-condensed) at BOTH consumers
// (kernel_ops write + materializeZones displayRemap) — floating 0 by construction, ?cpm4d=0 reverts.
// cpm_schedule.js added to precache; _GANTT_CACHE_VERSION 27->28 regenerates cached schedules.
// v1045 (2026-08-16) §CPE_DISCIPLINE_REVEAL_FLYBACK/§_ORDER/§_FADE: the pull-out->round-2 teleport
// cut replaced with a fast eased retrace fly-back (new plan.beats.flyback boundary); tail-parade
// discipline order now sorted ascending by real avg element bbox volume (element_transforms.bbox_x/
// y/z), MEP forced last, "All Disciplines" capstone unchanged; tail-parade boundaries get a brief
// overlap window (filterDiscs has no opacity channel — documented as an honest approximation, not a
// literal fade) instead of an instant swap (effects.js?v=21->22, cinema_path_editor.js?v=14->15).
// See bim-compiler prompts/CINEMA_DISCIPLINE_REVEAL.md's 2026-08-16 dated section for the full spec.
// Collided with #1393's independent v1044 (§GROUND_EARTH_DEFAULT) — took one past it, per this
// file's own KEEP-BOTH/take-the-higher merge convention.
// v1044 (2026-08-16) §GROUND_EARTH_DEFAULT: Alt+S/Alt+C bake staging ground texture switched from
// 'paved' back to 'earth' (effects.js?v=21) — user: "more realistic even surface feel", avoids
// paved's rectangular slab-joint relief entirely. Shadow-mode toggle cycle reordered so 'earth' is
// the first real choice (tools.js?v=42 _SG_CYCLE, panels.js?v=44 swatch row + tooltip).
// v1043 (2026-08-16) §ZONE_DISPLAY_AUTHORING: task windows authored from the display timeline
// (schedule_author.js displayRemap hook + time_machine.js _tmDisplayRemap), strict-bar sweep skipped
// on display-authored schedules, §CJP live census in the §CROSSTASK_JUDGE_PARITY log line.
// _GANTT_CACHE_VERSION 26->27. Probe §EXP8 Hospital: floating 664 -> 63, fidelity 97.03 -> 99.95.
// Collided with #1389's independent v1042 — took one past it, per the KEEP-BOTH convention.
// v1042 (2026-08-16) §STAGED_PL_CUT: night point-light intensity halved during Alt+S/Alt+C staging
// only (effects.js?v=20, tools.js?v=41) — user directive, restores ground-slab shadow play in bakes.
// v1041 (2026-08-16) §GROUND_DETAIL: ground normal/roughness maps + detail multiply + blotch
// (tools.js?v=40, ground_config.json?v=2, 6 new textures/ground/*.jpg). Collided with #1387's
// independent v1040 — took one past it, per this file's KEEP-BOTH/take-the-higher convention.
// v1040 (2026-08-16) §CROSSTASK_JUDGE_PARITY: time_machine.js _cjpJudgeParity after _ogSupportSweep
// — window-bounded judge-rule repair, captured floating 3090 -> 656 across the 7 buildings.
// Collided with the independent same-day v1039 bump on main (#1385/#1386) — took one past it, per
// this file's own KEEP-BOTH/take-the-higher merge convention.
// v1031 (2026-08-15) streaming.js envInt: beam/railing->0, +13 remaining MEP device classes->0.05
// (a prior PR's version bump for this same change was lost in a squash-merge race -- see git log).
// v1030 (2026-08-15) §PIPE_DUCT_BLUE_TINT / §PHOTO_ENVMAP_DOUBLE_BOOST_FIX (bim-ootb PRs #1367,
// #1369) shipped without a viewer.html script-version bump, so an already-cached browser kept
// serving pre-fix effects.js/streaming.js under the same ?v= URL — user report "why is this still
// blue" after both fixes were confirmed merged. Fix is the viewer.html bump (effects.js?v=17->18,
// streaming.js?v=59->60) in this same commit; CACHE_VERSION bumped alongside per this project's own
// standing convention (every deploy bumps it) so the offline precache path is refreshed too.
// v1029 (2026-08-15) §CPE_DISCIPLINE_REVEAL_PULLOUT: the there-and-back retrace round replaced with
// a pull-out + a single repeated forward lap (effects.js/cinema_maxq.js/cinema_path_editor.js/
// cpe_room_title.js). New beat boundary plan.beats.pullout; A.cpeRevealCaptionAt (new) swaps the
// room title to the discipline name during the tail's own slots; buildup topout now completes at
// the end of the pull-out, not the instant of arrival. See bim-compiler prompts/
// CINEMA_DISCIPLINE_REVEAL.md's dated "session 3" section for the full design/witness record.
// v1028 (2026-08-14) §GANTT_SCHEDULE_STALE: the authored Gantt (schedules/tasks/task_elements) had
// NO staleness signal at all, unlike kernel_ops (canvas), which self-heals via _genVersion/
// _GANTT_CACHE_VERSION. Once materialized, a building's Gantt panel was frozen forever — never
// re-derived however much the scheduling code (gates, display remap, §GANTT_SHIFT_HOURS_DESYNC
// itself) changed since, while canvas kept rendering fresh placements. schedules.gen_version now
// mirrors that same self-heal: a non-captured (synthetic SCH_AUTHORED), non-baselined schedule
// materialized under an older gen_version is re-materialized in place the next time the Gantt
// drawer builds its task index (buildTaskIndex, time_machine.js). Captured (imported) schedules and
// anything with a baseline set are NEVER touched — verified with 6 direct cases (fresh/unstamped/
// stale/baselined/re-stamped/captured), all match spec exactly. See
// prompts/4D_SCHEDULE_PERFECTION.md §GANTT_SCHEDULE_STALE.
// v1027 (2026-08-14) §GANTT_SHIFT_HOURS_DESYNC: schedule_author.js materializeZones() was calling
// computeSchedule() without shiftHours, silently taking the internal 8h/day default while the real
// canvas movie (time_machine.js injectGantt) runs at rates.js SHIFT_HOURS (24h) — Gantt bars authored
// ~3x slower than canvas actually plays. Fixed (#1355): materializeZones forwards opts.shiftHours
// (undefined stays byte-identical, witnesses unaffected); the two real UI entry points now pass
// window.SHIFT_HOURS. Measured Hospital: old call span 88d (8h default) -> fixed call span 30d (24h),
// 2.93x. Does NOT touch kernel_ops/canvas — _GANTT_CACHE_VERSION unchanged. Bumping THIS version only
// so the browser actually fetches the fixed JS on next load (schedules/tasks tables are the
// user-editable product and are never auto-regenerated once materialized — see
// prompts/4D_SCHEDULE_PERFECTION.md). Landed as a follow-up commit — #1355 squash-merged before this
// bump's push reached it (the sw.js-orphan-on-late-push landmine this project already documents).
// v1026 (2026-08-14) §TIER_REGATE_WORKLIST: time_machine.js _tierAuditRegate rewritten from a
// full-array-rescan fixpoint to a worklist/dirty-queue (SESSION 7's named, measured, not-fixed
// bottleneck — 15,466ms of Terminal's 19,773ms 4D-gen wall time). A/B'd byte-identical against the
// old algorithm on all 7 shipped buildings (scripts/probe_tier_regate_worklist.js in bim-compiler);
// 6.1x Terminal, 8.0x LTU_AHouse, 3.0-5.4x the other 5. _GANTT_CACHE_VERSION 18->19 alongside this.
// v1025 (2026-08-14) §SUN_SHADOW_RESTORE: effects.js _buildStillAO() adapter gains a mask/blend pass
// that reconstructs world position from N8AO's own depth texture, samples A.sun.shadow.map the same
// way three.js's own basic getShadow() shader chunk does, edge-detects the raw shadow term, and
// blends the AO-composited image back toward the pre-AO sharp TAA beauty at detected sun-shadow
// BOUNDARIES only — restores the contrast N8AO's denoiseRadius=7 blur (untouched, PR #1343) was
// smearing across the sun-cast shadow edge. Witnessed: +18.7% contrast at a real Clinic sun-shadow
// boundary, 40x tighter near-edge-vs-far-from-edge diff ratio (no bleed into ordinary AO contact
// corners). Bump so returning browsers get the restore pass instead of the old AO-only composite.
// v1022 (2026-08-13) §SUN_SHADOW_DROWNED: effects.js §PHOTO_AO denoiseRadius 12->7, denoiseSamples
// 8->5 — "ever so slight" step up from Alt+G's own never-bumped 6/4 baseline (not a full revert),
// user's own call after the full-revert-to-6 witness measured +9.9% beam-foot shadow contrast but
// risked reintroducing #1331's pre-fix dark/noisy-indoors complaint at the far end. Bump so
// returning browsers get the new denoise pair instead of the old always-8/12 one. Collided with
// #1338's independent same-day v1021 bump (§GROUNDED_OVERRIDE_FIX, kept below) — took one past it,
// per this file's own KEEP-BOTH/take-the-higher merge convention.
// v1021 (2026-08-13) §GROUNDED_OVERRIDE_FIX: time_machine.js's _midairRepair/_midairAudit no longer
// let "grounded" override a real detected floating violation — bump so returning browsers actually
// regenerate the 1,105-element-wider repair instead of replaying a cached pre-fix schedule.
// Collided with #1337's independent same-day v1020 bump (glow-lens soft-edge/shape-fit, kept below)
// — took one past it, per this file's own KEEP-BOTH/take-the-higher merge convention.
// v1020 (2026-08-13) §GLOW_LENS_SOFT_EDGE + §GLOW_LENS_SHAPE_FIT: still-render fixture glow quads
// (effects.js _glowLensOn) now use a feathered-rectangle canvas texture instead of a flat
// untextured plane, and split round-ish fixtures (bbox aspect < 1.25) onto the round soft texture
// instead of forcing every fixture into a rectangle — bump so returning browsers get the softened/
// shape-fit look instead of the old hard-edged one.
// v1019 (2026-08-13) §NIGHT_LIGHT_NEARFIELD: tools.js NIGHT_LIGHT_DECAY 1.5->1.0 — real
// PointLights were blowing out to a flat highlight right up close under ACES tonemapping (bright
// from afar, "not evident" close up) — bump so returning browsers get the retuned falloff.
// v1018 (2026-08-13) §PHOTO_AO_EDGE: N8AO intensity 2->4 in effects.js/effects_gi_poc.js (corner/
// edge contact shadow had gone invisible after the v1016 screenSpaceRadius fix) — bump so
// returning browsers get the new intensity instead of a cached pre-fix pass. This PR's own v1017
// collided with #1333's independent same-day bump (kept below, per this file's own KEEP-BOTH/
// take-the-higher merge convention) — took one past it.
// v1017 (2026-08-13) §TIER2_PER_ELEMENT_CLAMP + §SHIFT_HOURS: 4D schedule generation changed
// (schedule_gate.js computeSchedule's crew shift + time_machine.js's Tier-2 remap) — bump so
// returning browsers regenerate instead of replaying a cached pre-fix schedule/asset set.
// Collided 3x this session, independent same-day bumps, none with a dedicated comment here (see
// their commit messages): #1331 v1013->v1014 (N8AO retune), #1332 v1014->v1015 (SW precache
// cache.add->fetch+put fix), #1334 v1015->v1016 (N8AO screen-space radius fix) — took one past
// the highest per this file's own KEEP-BOTH/take-the-higher merge convention.
// v1013 (2026-08-13) §17.17.4 (W-OCC3-ARM): occlStructEnabled armed default-true in dlod_nav.js —
// bump so returning browsers actually get the new default instead of a cached copy.
// v1012 (2026-08-13) §RULES_TABLE_SOURCE: rates/sequence_rules.json is PRECACHED (line ~234) and its
// content changed — LABOR_RATES.ELECTRICIAN.productivity re-synced to rates.js's 15 class keys. Its
// only readers are mep_report.html and boq_charts.html (viewer.html never calls loadSequenceRules),
// so without this bump those two pages keep costing 7 electrical classes off a stale 8-key table.
// Deliberately NOT accompanied by a _GANTT_CACHE_VERSION bump: the viewer's generated schedule is
// byte-unchanged by this commit (it never reads the JSON, and the rates.js edit is comment-only), so
// forcing every materialized building to re-bake would be churn with no behavioural difference.
const CACHE_PREFIX = 'bim-ootb-';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;

// Local copies of vendor libs — single-origin, no CDN dependency.
// §PRECACHE-TRIM (UI_PAYLOAD_PERF.md Win #2): split SHELL (auto-precached on install — needed to
// render ANY building) vs DEFERRED (the ~8.9MB IFC/Excel giants — NOT auto-precached). The deferred
// libs still work offline via TWO existing paths, so NOTHING is lost:
//   (1) cacheFirst() caches each on its FIRST real use (drop an IFC → web-ifc sticks);
//   (2) the install-badge "download for offline" button (scene.js _startOfflineDownload →
//       GET_PRECACHE) force-caches the FULL set on demand — GET_PRECACHE still returns SHELL+DEFERRED.
// This drops the auto-install footprint EVERY first-visitor pays from ~10MB → ~1.5MB.
const SHELL_LIBS = [
  'lib/three.webgpu.min.js', // §S276: r184 WebGPU (imports three.core.min.js)
  'lib/three.module.min.js', // §S276: r184 standard ESM fallback
  'lib/three.core.min.js',  // §S276: r184 core (split build)
  'lib/OrbitControls.module.js',  // §S276: r184 ESM
  'lib/sql-wasm.js',
  'lib/sql-wasm.wasm',
  'lib/chart.umd.min.js',
  'lib/FileSaver.min.js',
  // §EFFECTS_COMPOSER_OFFLINE: setupEffects() (effects.js) dynamic-imports these 6 unconditionally
  // on every desktop (non-mobile) load, before streaming.js starts — not gated behind a keypress
  // like Alt+P/Alt+S. ~56KB total, trivial next to the libs above. Were never precached; on a
  // genuine offline+uncached load each import() rejects (sw.js's cacheFirst() synthesizes a 503 on
  // a failed fetch), caught by setupEffects()'s own try/catch (§EFFECTS_INIT_FAIL, degrades to
  // direct render) — not a crash, but silently drops SSAO shadows, the pick/clash/Find outline
  // highlight, and Alt+S Still-Refine. SHELL not DEFERRED: unlike web-ifc/xlsx these aren't behind
  // an optional feature, so they should be as guaranteed-present as the libs above.
  'lib/EffectComposer.js',
  'lib/RenderPass.js',
  'lib/TAARenderPass.js',
  'lib/SSAOPass.js',
  'lib/OutlinePass.js',
  'lib/OutputPass.js',
  'lib/BloomPass.js',
  // §CINEMA_SSAA (2026-07-18) + transitive-import completion: the 6 modules above `import` these
  // 8 (Pass/CopyShader ← everything; ShaderPass/MaskPass ← EffectComposer; SSAARenderPass ←
  // TAARenderPass; SimplexNoise/SSAOShader ← SSAOPass; OutputShader ← OutputPass) — precaching
  // only the 6 top-level files still 503'd the module graph's inner nodes on a genuine
  // offline+uncached load, same failure class §EFFECTS_COMPOSER_OFFLINE describes. In addition,
  // SSAARenderPass.js is now DIRECTLY imported by Cinema Orbit (Alt+C, effects.js §CINEMA_SSAA).
  'lib/Pass.js',
  'lib/CopyShader.js',
  'lib/ShaderPass.js',
  'lib/MaskPass.js',
  'lib/SSAARenderPass.js',
  'lib/SimplexNoise.js',
  'lib/SSAOShader.js',
  'lib/OutputShader.js',
];
// DEFERRED — heavy, feature-gated; cache-on-first-use OR via the offline-download button.
const DEFERRED_LIBS = [
  'lib/web-ifc-api-iife.js',  // §S284c: IFC parser (~5.8MB) — only on IFC drag-drop import
  'lib/web-ifc.wasm',          // §S284c: IFC parser WASM (~1.2MB)
  'lib/xlsx.full.min.js',      // ~0.9MB — only on boq_charts.html / spreadsheet export
  'lib/exceljs.min.js',        // ~0.9MB — only on Excel export
];
// §STAFFAGE_OFFLINE: Alt+P populate-staffage sprite cutouts (~4.2MB, PR #845) — shipped without
// ever being added here, so they fell through to the default cacheFirst() path: cache miss + a
// failed real fetch (offline) synthesizes a 503 (see cacheFirst()'s catch below), breaking Alt+P
// offline even after "Make available offline". Feature-gated like DEFERRED_LIBS, not auto-installed.
// SOURCE OF TRUTH is effects.js's _STAFFAGE_PEOPLE/_STAFFAGE_TREES — this list must mirror it
// exactly (see the matching comment there). Add/remove a staffage png in BOTH places, same PR.
const STAFFAGE_ASSETS = [
  'textures/staffage/people/person_sitting_casual_female.png',
  'textures/staffage/people/person_sitting_formal_male.png',
  'textures/staffage/people/person_standing_casual_male.png',
  'textures/staffage/people/person_standing_gesture_female.png',
  'textures/staffage/people/person_walking_gym_female.png',
  'textures/staffage/people/person_walking_shopping_female.png',
  'textures/staffage/trees/tree_beech.png',
  'textures/staffage/trees/tree_linden_big_old.png',
  'textures/staffage/trees/tree_linden_city.png',
  'textures/staffage/trees/tree_oak_big.png',
  'textures/staffage/trees/tree_oak_young.png',
  'textures/staffage/trees/tree_poplar.png',
];
// FULL set (back-compat): GET_PRECACHE returns this so the offline button = full offline.
const LOCAL_LIBS = [...SHELL_LIBS, ...DEFERRED_LIBS, ...STAFFAGE_ASSETS];

// CDN fallback URLs — cached opportunistically if loader falls back to them
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
  'https://cdn.jsdelivr.net/npm/rtree-sql.js@1.7.0/dist/sql-wasm.js',
  'https://cdn.jsdelivr.net/npm/rtree-sql.js@1.7.0/dist/sql-wasm.wasm',
  'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
];

// Local files to precache on install — viewer works fully offline after first visit.
// DB files are NOT here — they're cached in IndexedDB by A.cachedFetch().
const PRECACHE_ASSETS = [
  // Entry points
  'viewer.html',
  'boq_charts.html',
  'mep_report.html',
  'offline.html',
  'manifest.webmanifest',
  // Core viewer modules (order matches index.html script tags)
  'config.js',
  'db_resolve.js',
  'helpers.js',
  'silhouette_refine.js',
  'loader.js',
  'effects.js',
  'cinema_maxq.js',
  'cinema_path_editor.js',
  'cpe_walk.js',
  'cpe_xr.js',
  'lib/mp4_mux.js',   // §MAXQ_MP4 — hand-rolled mp4 muxer; missing => MaxQ silently falls back to webm
  'input_registry.js',
  'scene.js',
  'streaming.js',
  'panels.js',
  'tools.js',
  'picking.js',
  'hover_name.js',
  'cpe_room_title.js',
  'cpe_day_counter.js','cpe_path_overview.js','cpe_resource_panel.js','cpe_storey_reveal.js',
  'tour.js',
  'clash_matrix.js',
  'clash_narrow.js',
  'clash_film.js',
  'clash_labels.js',
  'measure.js',
  'sitecam.js',
  'issues.js',
  'excel.js',
  'walk.js',
  'city.js',
  'rates.js',
  'analysis_sidecar.js',
  'locale_loader.js',
  'decoder.js',
  'nlp.js',
  'semantic_enrichment.js',
  'scene_to_db.js',
  'import_db_builder.js',
  'diff.js',
  'variation_order.js',
  'import.js',
  'mep_coordination.js',
  'real_placement_resolver.js',
  'routewalker.js',
  // NOTE: the Modeller app (modeller.html + disc_walker/str_walker*/walker_confidence/cross_edges/
  // bonsai_*) moved to /modeller/ with its own sw — see the trilogy refactor. Not precached here.
  // SPATIAL_PICKING_SPEC §S-2..§S-5: warehouse pick-walk addon (data-gated pill)
  'wh_route.js',
  'wh_walk.js',
  'main.js',
  // Workers (fetched on demand by import/export flows)
  'import_worker.js',
  'ifc_export_worker.js',
  'mesh_import_worker.js',
  // Grid + 2D modules
  'grid_config.js',
  'grid_views.js',
  'grid_door_arcs.js',
  'grid_contours.js',
  'grid_dim_chains.js',
  'grid_dims.js',
  'grid_drag.js',
  'grid_scissors.js',
  'grid_overlay.js',
  'grid_assembler.js',
  // S266/S267: Doc pill + BOM modules
  'bom_extract.js',
  'verb_expand.js',
  'bom_walker.js',
  'grid_state.js',
  'bom_engine/bom_strategies.js',
  'bom_engine/bom_constraints.js',
  'bom_engine/bom_diff.js',
  'bom_engine/bom_node.js',
  'bom_engine/bom_tree.js',
  'bom_engine/bom_grid.js',
  'bom_engine/bom_rules.js',
  'grid_kinematics.js',
  'grid_recompose.js',
  'materialize.js',
  'doc_canvas.js',
  // Feature modules loaded by index.html
  '../erp/kernel_ops.js',   // the ONE kernel_ops (v13) — viewer-local copy no longer loaded by viewer.html
  'cost_panel.js',
  'clash_report.js',
  'clash_snag.js',
  'precision_cam.js',
  'schedule_gate.js',
  'lib/level_deriver.js',   // §S50 — vertical axis of the cell-grain schedule
  'location_axis.js',       // §S50 — rooms injection; lib/room_walker.js is network-first below
  'cpm_schedule.js',
  'gantt_model.js',      // §S53 (F3) — the Gantt bar model, extracted from time_machine.js
  'zone_index.js',       // §S62 — median-Z storey banding, extracted from time_machine.js
  'support_sweep.js',    // §S58 — support-order physics, extracted from time_machine.js
  'time_machine.js',
  'dlod_nav.js',
  'schedule_author.js',
  'schedule_read_4d.js',
  'schedule_author_ui.js',
  'foreign_schedule.js',    // §TM_P6_FOLD — lazy-loaded by the TM panel P6/MSP section; precached so it works offline
  'schedule_diff.js',       // §TM_P6_FOLD — same (Diff-vs-Model engine)
  'schedule_sync.js',
  'error_reporter.js',
  'print_sheet.js',
  'ghostglass.js',
  'qrcode.min.js',
  '../common/pill_builder.js',   // THE one canonical builder (PILLS_CONSOLIDATION_REVIEW_2026-07-03 — fork retired)
  // NOTE: the ERP app (erp.html, idempiere.html, ad_*/erp_* modules, icons.js, erp_pills.js,
  // pills.json, redpill/aplus.png) moved to /erp/ with its own sw — see ERP_FOLDER_HOME.md.
  // erp.html/idempiere.html below are now reroute STUBS that live in viewer/.
  'list_builder.js',
  'settings_editor.js',
  'panel_nav.js',
  // Lazy-loaded modules
  'navigate.js',
  'wizard.js',
  'wizard_orientation.js',
  'wizard_storeys.js',
  'wizard_classify.js',
  'section_cut.js',
  'elevation.js',
  'dlod.js',
  // Vendor libs not in LOCAL_LIBS (loaded by index.html)
  'lib/httpvfs.js',
  // Config files
  'clash_rules.json',
  'grid_rules.json',
  'rates/cidb2024_my.json',
  // Shared sequence/labour rules — one source for 4D schedule baker + drone order.
  // Precached so loadSequenceRules() resolves offline (else falls to hardcoded).
  'rates/sequence_rules.json',
  // §TPL_MODEL (2026-08-27) — the 4D programme template DEFINES the canonical task grid
  // (schedule_author.js instantiateTemplate; user ruling 2026-08-27). It was NOT precached while
  // sequence_rules.json above was, so on a cold SW or offline the fetch in time_machine.js
  // _load4DTemplate() fails, _4dTemplate stays null, and materializeZones silently takes the dead
  // deriveZones path. _4dTemplateTried makes that one-shot, so ONE failed fetch drops the
  // canonical model for the whole session. Precached so the model of record always loads.
  'rates/4D_template.json',
  // §S280g: ground texture config + default tile (grass) precached for offline shadow mode.
  // earth/paved are lazy (cacheFirst caches on first selection).
  'ground_config.json',
  'textures/ground/grass_1k.jpg',
  // §OFFLINE-GATEWAY-LEAK: was hardcoded network-first ("during tuning") — precached like every
  // other config file now so it stops re-hitting the network once cached.
  'sfx.json',
  // W-SW-UNLISTED (2026-08-21, bim-compiler prompts/SCRIPT_LENGTH_REFACTOR_SEAMS.md §S61.2):
  // 18 scripts viewer.html has always loaded that were never precached — invisible until the
  // audit gained its second direction. Offline users got them from the network or not at all.
  // 344 KB total, measured, against a shell that already precaches 121 assets.
  // History + share + sfx:
  '../common/history_tap.js', '../common/whole_history.js', '../common/history_bar.js',
  '../common/about_diy.js', 'universal_history.js', 'share.js', 'sfx.js',
  // ERP fold set (the viewer-side fold verbs and their FSM/decimal deps):
  '../erp/bigdecimal.js', '../erp/ad_docfsm.js', 'blue_fold.js', 'proj_fold.js', 'vo_fold.js',
  'proj_control.js', 'whatif.js', 'whatif_panel.js', 'vo_approve.js', 'proj_period.js',
  'proj_claim.js',
];

self.addEventListener('install', (event) => {
  // §PRECACHE-TRIM: auto-precache the SHELL only (not the deferred IFC/Excel giants). The deferred
  // libs cache on first use (cacheFirst) or via the offline-download button (GET_PRECACHE = full set).
  const _installSet = [...PRECACHE_ASSETS, ...SHELL_LIBS];
  console.log('§PRECACHE-TRIM install set=' + _installSet.length + ' deferred=' + DEFERRED_LIBS.length +
    ' (web-ifc/xlsx/exceljs off the install path, ~8.9MB)');
  // §SW_PRECACHE_STALE_FIX (2026-08-13): cache.add(url) fetches through the BROWSER's own HTTP
  // cache — a same-origin GET with an unexpired Cache-Control (these static assets serve
  // max-age=600) can be satisfied from that cache instead of hitting network, even during a
  // brand-new install triggered by a real CACHE_VERSION bump. Real repro: edit a precached file,
  // bump CACHE_VERSION, deploy — a browser that loaded the OLD file within the last 10 minutes
  // silently re-precaches that same stale response into the NEW version's cache, and won't
  // self-correct until the NEXT version bump. `{cache: 'reload'}` forces the underlying fetch to
  // bypass HTTP cache validation, so install always pulls the real current network response.
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(
        _installSet.map(url =>
          fetch(url, { cache: 'reload' })
            .then(resp => cache.put(url, resp))
            .catch(err => console.warn('§SW_PRECACHE_SKIP', url, err.message))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Purge ONLY this app's old caches (prefix-scoped) — the ERP app at /erp/ owns its own
  // 'erp-ootb-' caches and must not be deleted here (docs/ERP_FOLDER_HOME.md).
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k.indexOf(CACHE_PREFIX) === 0 && k !== CACHE_NAME)
        .map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Build a Set of precache basenames for O(1) lookup in isNetworkFirst()
const _PRECACHE_SET = new Set(PRECACHE_ASSETS);

// Returns true for URLs that should use network-first strategy.
// Precached files use cache-first — freshness guaranteed by CACHE_VERSION bump on deploy.
function isNetworkFirst(url) {
  var base = url.split('?')[0];
  // room_walker.js lives under lib/ by folder placement only — it's OUR frequently-changing
  // room logic (PR #773/#776/#779 all touched it), not a third-party immutable vendor lib.
  // The blanket lib/ rule below silently starved it of the network-first path for 3 straight
  // deploys (found 2026-07-14, prompts/FUNCTIONAL_SPACE_MGMT_NEXT_SESSION.md §CACHE-LANDMINE) —
  // exempt it explicitly rather than trusting folder placement to imply immutability.
  if (base.endsWith('/lib/room_walker.js')) return true;
  // lib/ files are versioned and immutable — always cache-first
  if (base.includes('/lib/')) return false;
  // CDN fallback assets are also immutable — cache-first
  for (const cdn of CDN_ASSETS) {
    if (url === cdn || base === cdn) return false;
  }
  // Precached local files — cache-first (CACHE_VERSION bump purges + refreshes)
  var filename = base.split('/').pop();
  if (_PRECACHE_SET.has(filename)) return false;
  // §SQL-PATCH-NETWORK-FIRST (2026-07-25, measured on a real user session —
  // VIEWER_FIND_PANEL_ROOM_ACCURACY.md §17): `buildings/patches/*.sql` used to fall through to
  // cacheFirst, because only .html/.js were network-first and .sql matched nothing. That silently
  // breaks THE PROJECT'S OWN DB-CHANGE DOCTRINE (CLAUDE.md §DB CHANGES): every DB fix ships as a
  // small .sql applied at load by A._applyPendingPatch(), so an UPDATED patch could never reach an
  // already-installed client — the SW kept serving the first body it ever cached. Proven live: the
  // regenerated Hospital walkable raster went to OCI at 07:45:18Z, and a session SIX HOURS later
  // (rooms_meta.built_at 13:37:44Z) still compiled against the OLD raster — its saved db carries the
  // pre-fix Level 1 signature (x0=-0.0147 cols=304 rows=332 instead of x0=-12.5998 cols=403 rows=372)
  // and its console reproduced all three pre-fix §PATH_LEGAL_DETOUR_FAIL legs exactly
  // (34.2m/96, 39.5m/135, 10.1m/34). With the live patch applied to that same saved db: zero
  // DETOUR_FAIL. networkFirst (not no-cache) keeps the offline PWA path intact — it falls back to the
  // cached body when the network is gone, which is what §38-offline-pwa needs.
  if (base.endsWith('.sql')) return true;
  // Unknown JS/HTML not in precache list — network-first (safe default)
  if (base.endsWith('.html') || base.endsWith('.js')) return true;
  return false;
}

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip DB file fetches — handled by IndexedDB in cachedFetch()
  if (url.split('?')[0].endsWith('.db')) return;

  // Navigation requests always network-first
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Network-first for local .html and .js — always get fresh on deploy
  if (isNetworkFirst(url)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Cache-first for CDN libs, .wasm, images, CSS — these are immutable or change rarely
  event.respondWith(cacheFirst(event.request));
});

// Try network, fall back to cache (for files that change on deploy)
function networkFirst(request) {
  // Strip ?v=N query string for cache matching — HTML references main.js?v=11
  // but precache stores main.js. Both should match.
  var cacheUrl = request.url.split('?')[0];
  return fetch(request)
    .then(resp => {
      if (resp && resp.status === 200) {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(cacheUrl, clone));
      }
      return resp;
    })
    .catch(() => caches.match(cacheUrl).then(r => {
      if (r) return r;
      // JS files: return empty 503 (script onerror handlers deal with it)
      if (cacheUrl.endsWith('.js')) return new Response('', { status: 503 });
      // Navigation: return offline page (resolve URL relative to SW scope)
      var offlineUrl = new URL('offline.html', self.registration.scope).href;
      return caches.match(offlineUrl).then(page =>
        page || new Response('<h1>Offline</h1><p>Open a building you viewed before.</p>',
          { headers: { 'Content-Type': 'text/html' } })
      );
    }));
}

// Try cache, fall back to network (for heavy/immutable assets + precached files)
function cacheFirst(request) {
  // Strip ?v=N for cache lookup — precache stores bare filenames
  var cacheUrl = request.url.split('?')[0];
  return caches.match(cacheUrl).then(cached => {
    if (cached) return cached;
    // Also try with the full URL (CDN assets are stored with full URL)
    return caches.match(request);
  }).then(cached => {
    if (cached) return cached;
    return fetch(request).then(resp => {
      if (!resp || resp.status !== 200) return resp;
      const clone = resp.clone();
      caches.open(CACHE_NAME).then(c => c.put(cacheUrl, clone));
      return resp;
    }).catch(() => new Response('', { status: 503, statusText: 'Offline' }));
  });
}

// §S283: Message handler — SKIP_WAITING for update flow, GET_PRECACHE for install flow
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'GET_PRECACHE') {
    // Return the full precache list so the install flow can force-cache all assets
    event.ports[0].postMessage({ assets: PRECACHE_ASSETS, libs: LOCAL_LIBS, version: CACHE_VERSION });
  }
});
