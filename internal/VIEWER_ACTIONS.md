# Viewer actions — generated inventory

> **Generated. Do not hand-edit.** `node scripts/gen_viewer_actions.js`
> Spec: bim-compiler `prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md` §19.1 (W-VIEWER-ACTIONS). Witness: `tests/witness_viewer_actions.js`.

Every key and pill button a person can press in the Viewer, from the app's own tables, the functions each calls, and a harm class by rule. The denominator for "X of N Viewer actions are offered as verbs" (§19.0). A **view** row means no gpu/writes/leaves callee was found at the handler's top level; it never means safe.

| | |
|---|---:|
| entry points (N_entry) | 96 |
| — `_shortcuts` keys (viewer/scene.js) | 30 |
| — direct keydown branches | 20 |
| — pill entries incl. long-press (viewer/panels.js `_actions`) | 46 |
| distinct actions (N_actions) | 64 |
| offered as verbs (X) | 0 |
| class view | 69 |
| class leaves | 10 |
| class writes | 11 |
| class gpu | 6 |
| callees with no definition (PHANTOM) | 0 |
| pill key conflicts | 5 |
| keydown listener files (scanned 4, excluded 13, unaccounted 0) | 17 |

**Rules:** a key row joins a pill's action when the pill shows that key and they share a callee, or the pill delegates to that key; otherwise it is its own action. Class = the highest of its callees in the CLASS table of the generator (gpu > writes > leaves > view), each callee cited there. Out of N: keys inside a focused panel (Tab, Space, PageUp/Down, Enter, typeahead) and the listeners excluded below.

## Pill key conflicts

The pill shows a key that fires nothing, or fires a different action.

| pill | key shown | kind | what the key does |
|---|---|---|---|
| `roleFilter` | `r` | **DIFFERENT** | key fires _shortcuts r → A.isCivilModel, A.toggleRoadReport, _cycleRoom |
| `ew` | `u` | **UNBOUND** | no keydown table binds this key |
| `rw` | `k` | **UNBOUND** | no keydown table binds this key |
| `sanity` | `s` | **DIFFERENT** | key fires _shortcuts s → A.screenshot |
| `egress` | `e` | **UNBOUND** | no keydown table binds this key |

## Entry points

| # | source | key | pill | label (the app's own words) | calls → defined at | class | basis |
|---:|---|---|---|---|---|---|---|
| 1 | `viewer/scene.js:2616` | `+` |  | Zoom In | `_zoomStep` `viewer/scene.js:2437` | view | no gpu/writes/leaves callee found |
| 2 | `viewer/scene.js:2617` | `-` |  | Zoom Out | `_zoomStep` `viewer/scene.js:2437` | view | no gpu/writes/leaves callee found |
| 3 | `viewer/scene.js:2618` | `2` |  |  | `open2DPlans` `viewer/main.js:376` | view | no gpu/writes/leaves callee found |
| 4 | `viewer/scene.js:2624` | `x` |  | Section Cut *(pill section)* | `A.toggleSection` `viewer/tools.js:499` | view | no gpu/writes/leaves callee found |
| 5 | `viewer/scene.js:2635` | `4` |  | 4D / 5D *(pill report)* | `A.export4D5D` `viewer/tools.js:596` | leaves | A.export4D5D: opens boq_charts.html in a new tab (tools.js A.export4D5D, window.open) |
| 6 | `viewer/scene.js:2636` | `f` |  | Find / Navigate *(pill find)* | `A.openFindPanel` `viewer/main.js:290`<br>`A.loadNavigate` `viewer/main.js:155` | view | no gpu/writes/leaves callee found |
| 7 | `viewer/scene.js:2637` | `j` |  | Road standards *(pill roadstd)* | `A.toggleRoadStandards` `viewer/road_standards.js:127` | view | no gpu/writes/leaves callee found |
| 8 | `viewer/scene.js:2638` | `p` |  | Palette *(pill palette)* | `toggleSunglass` `viewer/tools.js:680` | view | no gpu/writes/leaves callee found |
| 9 | `viewer/scene.js:2639` | `t` |  | Time Machine *(pill tm)* | `toggleTimeMachine` `viewer/tm_lifecycle_api.js:764` | view | no gpu/writes/leaves callee found |
| 10 | `viewer/scene.js:2640` | `z` |  | Page History *(pill docHist)* | `UniversalHistory.toggleOpen` `viewer/universal_history.js:445` | view | no gpu/writes/leaves callee found |
| 11 | `viewer/scene.js:2641` | `w` |  | World History *(pill worldhist)* | `WholeHistory.toggleOpen` `common/whole_history.js:424` | view | no gpu/writes/leaves callee found |
| 12 | `viewer/scene.js:2642` | `l` |  | Fly Tour *(pill fly)* | `toggleFlyAround` `viewer/tour.js:8` | view | no gpu/writes/leaves callee found |
| 13 | `viewer/scene.js:2643` | `o` |  | Nav LOD (large bldgs) *(pill dlodnav)* | `toggleDlodNav` `viewer/dlod_nav.js:2000` | view | no gpu/writes/leaves callee found |
| 14 | `viewer/scene.js:2644` | `v` |  | Sound FX *(pill audio)* | `toggleSfx` `viewer/sfx.js:529` | view | no gpu/writes/leaves callee found |
| 15 | `viewer/scene.js:2645` | `s` |  |  | `A.screenshot` `viewer/tools.js:613` | writes | A.screenshot: downloads a PNG to the user's disk (tools.js A.screenshot, link.download) |
| 16 | `viewer/scene.js:2646` | `n` |  | Night *(pill night)* | `toggleNightMode` `viewer/tools.js:2112` | view | no gpu/writes/leaves callee found |
| 17 | `viewer/scene.js:2647` | `b` |  | Background *(pill background)* | `toggleBackground` `viewer/tools.js:1189` | view | no gpu/writes/leaves callee found |
| 18 | `viewer/scene.js:2648` | `i` |  | Issues *(pill issues)* | `toggleIssues` `viewer/issues.js:243` | view | no gpu/writes/leaves callee found |
| 19 | `viewer/scene.js:2649` | `h` |  | Shadow + Ground *(pill shadow)* | `toggleShadow` `viewer/tools.js:1033` | view | no gpu/writes/leaves callee found |
| 20 | `viewer/scene.js:2650` | `c` |  | Clash Matrix *(pill clash)* | `_blurPanel` `viewer/scene.js:3564`<br>`A._loadClashRules` `viewer/measure.js:76` | view | no gpu/writes/leaves callee found |
| 21 | `viewer/scene.js:2813` | `m` |  | Measure *(pill measure)* | `A.toggleMeasure` `viewer/measure.js:1230` | view | no gpu/writes/leaves callee found |
| 22 | `viewer/scene.js:2827` | `r` |  | Road report *(pill roadreport)* | `A.isCivilModel` `viewer/streaming.js:323`<br>`A.toggleRoadReport` `viewer/road_report.js:153`<br>`_cycleRoom` `viewer/scene.js:2545` | view | no gpu/writes/leaves callee found |
| 23 | `viewer/scene.js:2828` | `a` |  | Reset Camera *(pill cam-reset)* | `resetCamOrbit` `viewer/precision_cam.js:286` | view | no gpu/writes/leaves callee found |
| 24 | `viewer/scene.js:2829` | `q` |  | Auto-Pivot *(pill cam-pivot)* | `toggleCamPivot` `viewer/precision_cam.js:344` | view | no gpu/writes/leaves callee found |
| 25 | `viewer/scene.js:2830` | `Ctrl+S` |  | Save Building *(pill save)* | `A.saveModelDb` `viewer/scene.js:1031` | writes | A.saveModelDb: writes a .db file (pill save: "Save the open building to a .db file") |
| 26 | `viewer/scene.js:2831` | `Ctrl+O` |  | Open Building *(pill open)* | `A.openModelDb` `viewer/scene.js:1637` | leaves | A.openModelDb: native Open dialog, replaces the current scene (pill open) |
| 27 | `viewer/scene.js:2832` | `=` |  | Settings *(pill settings)* | `_openSettingsPanel` `viewer/panels.js:1850` | view | no gpu/writes/leaves callee found |
| 28 | `viewer/scene.js:2837` | `/` |  | Share *(pill share)* | `A.quickShare` `viewer/share.js:636` | leaves | A.quickShare: native share sheet / clipboard (share.js A.quickShare) |
| 29 | `viewer/scene.js:2841` | `'` |  | Hover Name | `A.toggleHoverName` `viewer/hover_name.js:198` | view | no gpu/writes/leaves callee found |
| 30 | `viewer/scene.js:2842` | `.` |  | §S281 P2: ⋯ toggle — prefer the live mobile pill, fall back to legacy overflow | `toggleMobilePill` `viewer/panels.js:2457`<br>`toggleOverflow` `viewer/panels.js:984` | view | no gpu/writes/leaves callee found |
| 31 | `viewer/scene.js:3613` | `Alt+Z` |  | X-Ray / Bbox *(pill xray)* | `A.cycleXrayBboxMode` `viewer/tools.js:454`<br>`S` `common/history_tap.js:190` | view | no gpu/writes/leaves callee found |
| 32 | `viewer/scene.js:3616` | `Alt+S` |  |  | `A.toggleStillRefineUI` `viewer/fx_still_refine.js:1359`<br>`A.toggleStillRefine` `viewer/fx_still_refine.js:1279` | gpu | A.toggleStillRefineUI: Alt+S still: progressive TAA supersample (scene.js Alt+S comment); §19.0 item 4; A.toggleStillRefine: Alt+S still fallback, same pass |
| 33 | `viewer/scene.js:3618` | `Alt+G` |  | GI Preview (AO) *(pill gi-preview)* | `A.toggleGIPreview` `viewer/effects_gi_poc.js:15` | gpu | A.toggleGIPreview: panels.js gi-preview: extra full-res GPU render targets |
| 34 | `viewer/scene.js:3619` | `Alt+J` |  |  | `A.toggleSSGIPreview` `viewer/effects_gi_poc.js:487` | gpu | A.toggleSSGIPreview: Alt+J SSGI spike, same GPU class as Alt+G |
| 35 | `viewer/scene.js:3624` | `Alt+C` |  | MaxQ Movie | `A.startMaxQualityOrbit` `viewer/maxq_start.js:2682`<br>`A.startCinemaOrbit` `viewer/fx_cinema_orbit.js:339` | gpu | A.startMaxQualityOrbit: Alt+C MaxQ movie bake; §19.0 item 4; A.startCinemaOrbit: Alt+C fallback, same bake |
| 36 | `viewer/scene.js:3627` | `Alt+P` |  | Populate (people + trees) | `A.togglePopulate` `viewer/fx_props_staffage.js:1624` | view | no gpu/writes/leaves callee found |
| 37 | `viewer/scene.js:3628` | `F1` |  | Help *(pill help)* | `showCommandPalette` `viewer/scene.js:2900` | view | no gpu/writes/leaves callee found |
| 38 | `viewer/scene.js:3629` | `F11` |  | Fullscreen *(pill fullscreen)* | `A.toggleFullscreen` `viewer/tools.js:635` | leaves | A.toggleFullscreen: needs a user gesture (tools.js §FULLSCREEN) |
| 39 | `viewer/scene.js:3632` | `Ctrl+S` |  | Save Building *(pill save)* | `A.saveModelDb` `viewer/scene.js:1031` | writes | A.saveModelDb: writes a .db file (pill save: "Save the open building to a .db file") |
| 40 | `viewer/scene.js:3633` | `Ctrl+O` |  | Open Building *(pill open)* | `A.openModelDb` `viewer/scene.js:1637` | leaves | A.openModelDb: native Open dialog, replaces the current scene (pill open) |
| 41 | `viewer/scene.js:3640` | `Backspace` |  |  | `UniversalHistory.open` `viewer/universal_history.js:445`<br>`UniversalHistory.undo` `viewer/universal_history.js:445`<br>`_doSceneUndo` `viewer/scene.js:3812` | writes | UniversalHistory.undo: steps the model's edit history back; _doSceneUndo: legacy scene undo |
| 42 | `viewer/scene.js:3646` | `\` |  |  | `UniversalHistory.open` `viewer/universal_history.js:445`<br>`UniversalHistory.redo` `viewer/universal_history.js:445`<br>`_doSceneRedo` `viewer/scene.js:3824` | writes | UniversalHistory.redo: steps the model's edit history forward; _doSceneRedo: legacy scene redo |
| 43 | `viewer/scene.js:3702` | `Home` |  |  | `_homeResetAndFrame` `viewer/scene.js:2609` | view | no gpu/writes/leaves callee found |
| 44 | `viewer/scene.js:3727` | `?` |  |  | `showCommandPalette` `viewer/scene.js:2900` | view | no gpu/writes/leaves callee found |
| 45 | `viewer/scene.js:3728` | `Escape` |  |  | `toggleMobilePill` `viewer/panels.js:2457` | view | no gpu/writes/leaves callee found |
| 46 | `viewer/gi_still.js:1227` | `Alt+S` |  |  | `giSupported` `viewer/gi_still.js:1217`<br>`plainStill` `viewer/gi_still.js:1423` | gpu | giSupported: gi_still.js Alt+S: gates the WebGPU light-bounce pass rendered after the still (§GI_LIVE) |
| 47 | `viewer/gi_still.js:1243` | `Alt+Shift+S` |  |  | `release` `viewer/gi_still.js:180`<br>`toast` `viewer/gi_still.js:64` | view | no gpu/writes/leaves callee found |
| 48 | `viewer/precision_cam.js:182` | `CapsLock` |  | Precision (Fine) *(pill precision)* | `toggleFine` `viewer/precision_cam.js:50` | view | no gpu/writes/leaves callee found |
| 49 | `common/history_bar.js:845` | `Ctrl+Z` |  |  | `open` `common/history_bar.js:579`<br>`undo` `common/history_bar.js:247` | writes | undo: history_bar.js undo |
| 50 | `common/history_bar.js:846` | `Ctrl+Shift+Z / Ctrl+Y` |  |  | `open` `common/history_bar.js:579`<br>`redo` `common/history_bar.js:259` | writes | redo: history_bar.js redo |
| 51 | `viewer/panels.js:1331` | `Ctrl+S` | `save` | Save Building — Save the open building to a .db file · Native Save As… dialog — pick name + folder · Re-openable with Open (Ctrl+O) | `A.saveModelDb` `viewer/scene.js:1031` | writes | A.saveModelDb: writes a .db file (pill save: "Save the open building to a .db file") |
| 52 | `viewer/panels.js:1335` |  | `lod400` | LOD400 Upgrade — Weld duplicate vertices + smooth curved surfaces · Same triangles, area and size; fewer vertices · Counted, logged; Save to keep it | `LOD400.openPanel` `viewer/lod400_upgrade.js:91` | writes | LOD400.openPanel: welds + smooths the open building's geometry tables (pill lod400) |
| 53 | `viewer/panels.js:1338` | `Ctrl+O` | `open` | Open Building — Open a saved .db file · Native Open… dialog · Replaces the current scene | `A.openModelDb` `viewer/scene.js:1637` | leaves | A.openModelDb: native Open dialog, replaces the current scene (pill open) |
| 54 | `viewer/panels.js:1344` | `f` | `find` | Find / Navigate — Search by name/class · Filter by storey/type · Voice search (mic) · Navigate to element | `A.openFindPanel` `viewer/main.js:290` | view | no gpu/writes/leaves callee found |
| 55 | `viewer/panels.js:1350` | `r` | `roleFilter` | Role View — Cycle a profession preset (Plumber/Electrician/ACMV/Structural/Cleaner) · Filters the 3D scene + Outliner to that role's disciplines · Convenience filter only — not access control | `A.cycleRoleFilter` `viewer/panels.js:822` | view | no gpu/writes/leaves callee found |
| 56 | `viewer/panels.js:1355` | `F1` | `help` | Help | `showCommandPalette` `viewer/scene.js:2900` | view | no gpu/writes/leaves callee found |
| 57 | `viewer/panels.js:1361` | `w` | `worldhist` | World History — History across ALL pages — viewer, iDempiere, Gravity · Whole \| This page toggle · Day strip — step back/forward by day · Tap a card to jump to that building/doc · Long-press → clear (bomb), warns first | `WholeHistory.toggleOpen` `common/whole_history.js:424` | view | no gpu/writes/leaves callee found |
| 58 | `viewer/panels.js:1363` |  | `worldhist (long-press)` | World History — long-press | `_worldHistDrawer` `viewer/panels.js:154` | writes | _worldHistDrawer: long-press = the bomb, clear history (pill worldhist comment) |
| 59 | `viewer/panels.js:1372` | `z` | `docHist` | Page History — This page's own dot timeline · Step back/forward through your edits | `UniversalHistory.toggleOpen` `viewer/universal_history.js:445` | view | no gpu/writes/leaves callee found |
| 60 | `viewer/panels.js:1378` |  | `walk` *(mobile only)* | Walk | `toggleWalkMode` `viewer/walk.js:25` | view | no gpu/writes/leaves callee found |
| 61 | `viewer/panels.js:1381` |  | `whwalk` | Pick Walk — Route over locators (walk order) · Fly-to next bin, FIND-lens depth · Scan bin QR / type code · Signed pick group per bin | `WHWalk.toggle` `viewer/wh_walk.js:33` | view | no gpu/writes/leaves callee found |
| 62 | `viewer/panels.js:1385` | `/` | `share` | Share | `A.quickShare` `viewer/share.js:636` | leaves | A.quickShare: native share sheet / clipboard (share.js A.quickShare) |
| 63 | `viewer/panels.js:1393` |  | `hbaFM` | Human-Asset — Operate-phase (7D) cockpit — one model, lenses each answering ONE question · Occupancy (incl. lease status) · Presence · Unit class · Assets/IoT · Dashboard · Wake-aware: only lenses with data in THIS building are enabled (others greyed) · All off one signed op-log; toggle a lens off restores the model | `HBALens.openFamilyDrawer` `viewer/hba_lens.js:1085` | view | no gpu/writes/leaves callee found |
| 64 | `viewer/panels.js:1399` | `m` | `measure` | Measure | `A.toggleMeasure` `viewer/measure.js:1230` | view | no gpu/writes/leaves callee found |
| 65 | `viewer/panels.js:1401` |  | `measure (long-press)` | Measure — long-press | `_revealChip` `common/pill_builder.js:154`<br>`→key c` | view | no gpu/writes/leaves callee found |
| 66 | `viewer/panels.js:1405` | `j` | `roadstd` *(civil model only)* | Road standards — Sign codes vs ATJ 2A/85 · OK / UNKNOWN / MISSING tree · Click a sign: zoom + standard | `A.toggleRoadStandards` `viewer/road_standards.js:127` | view | no gpu/writes/leaves callee found |
| 67 | `viewer/panels.js:1409` | `r` | `roadreport` *(civil model only)* | Road report — Alignment & Drift · Earthworks · Geometric Health · Signs · Environment · Copy / .txt / PDF | `A.toggleRoadReport` `viewer/road_report.js:153` | view | no gpu/writes/leaves callee found |
| 68 | `viewer/panels.js:1413` | `u` | `ew` *(civil model only)* | Earthworks — Cut & Fill overlay (inferred) · Cost · duration · plant: pending | `A.toggleEarthworksPanel` `viewer/earthworks_overlay.js:184` | view | no gpu/writes/leaves callee found |
| 69 | `viewer/panels.js:1416` | `k` | `rw` *(civil model only)* | Roadworks — Sight distance · radius · furniture: pending | `A.toggleRoadworksPanel` `viewer/earthworks_overlay.js:192` | view | no gpu/writes/leaves callee found |
| 70 | `viewer/panels.js:1419` | `c` | `clash` | Clash Matrix — Discipline pair grid · Tolerance 1–100mm · Status: Review/Resolve/Accept · HTML Report + CSV export | `→key c` | view | no gpu/writes/leaves callee found |
| 71 | `viewer/panels.js:1423` | `s` | `sanity` | Sanity — Floating Member (STR beams) · Span/Depth (advisory) · Column Continuity | `A.showStructuralSanity` `viewer/rule_checklist.js:812` | view | no gpu/writes/leaves callee found |
| 72 | `viewer/panels.js:1427` | `e` | `egress` | Egress — Isolated Room (no measured route out) · Circulation Distance (to real exit, falls back to spine) · Door Width (advisory) | `A.showEgressSanity` `viewer/rule_checklist.js:852` | view | no gpu/writes/leaves callee found |
| 73 | `viewer/panels.js:1433` | `Alt+Z` | `xray` | X-Ray / Bbox | `A.cycleXrayBboxMode` `viewer/tools.js:454` | view | no gpu/writes/leaves callee found |
| 74 | `viewer/panels.js:1439` |  | `bbox` | Bounding Boxes | `toggleGhostXray` `viewer/nf_highlight_cost.js:437` | view | no gpu/writes/leaves callee found |
| 75 | `viewer/panels.js:1440` | `t` | `tm` | Time Machine — Gantt timeline · Author 4D schedule (✎) · What-if (slip a phase) · Play / Pause sequence · Phase slider · Share ?tm=play link | `toggleTimeMachine` `viewer/tm_lifecycle_api.js:764` | view | no gpu/writes/leaves callee found |
| 76 | `viewer/panels.js:1458` |  | `sched4d` | 4D Window — Task name + start→finish beside the picked element · Trade + float, critical-path marker · One extra line on hover · No schedule yet? Tap to generate one on the fly | `SA.activeSchedule` `viewer/panels.js:1460`<br>`ScheduleInject.inject` `viewer/schedule_inject.js:254` | writes | ScheduleInject.inject: generates a 4D programme into the open DB (pill sched4d, §S7-INJECT) |
| 77 | `viewer/panels.js:1492` | `x` | `section` | Section Cut — Y axis (vertical) · X axis (lateral) · Z axis (depth) · Slider 0–100% · Bookmarks | `A.toggleSection` `viewer/tools.js:499` | view | no gpu/writes/leaves callee found |
| 78 | `viewer/panels.js:1496` | `b` | `background` | Background | `toggleBackground` `viewer/tools.js:1189` | view | no gpu/writes/leaves callee found |
| 79 | `viewer/panels.js:1499` | `n` | `night` | Night | `toggleNightMode` `viewer/tools.js:2112` | view | no gpu/writes/leaves callee found |
| 80 | `viewer/panels.js:1500` | `p` | `palette` | Palette — Ambience 0–100 · Sun 0–5 · Exposure 0.1–3 · Ambient 0–2 · Hemisphere 0–2 · Night · Shadow + Ground (cycle) · Reverse background · Sound FX | `toggleSunglass` `viewer/tools.js:680` | view | no gpu/writes/leaves callee found |
| 81 | `viewer/panels.js:1506` | `h` | `shadow` | Shadow + Ground | `A.toggleShadow` `viewer/tools.js:1033` | view | no gpu/writes/leaves callee found |
| 82 | `viewer/panels.js:1512` | `Alt+G` | `gi-preview` | GI Preview (AO) — N8AO ambient occlusion (research spike) · Desktop only — disabled on mobile (memory) | `A.toggleGIPreview` `viewer/effects_gi_poc.js:15` | gpu | A.toggleGIPreview: panels.js gi-preview: extra full-res GPU render targets |
| 83 | `viewer/panels.js:1517` | `l` | `fly` | Fly Tour | `toggleFlyAround` `viewer/tour.js:8` | view | no gpu/writes/leaves callee found |
| 84 | `viewer/panels.js:1523` | `o` | `dlodnav` | Nav LOD (large bldgs) — Boxes far/off-screen elements while you fly/orbit · Real mesh within 50 m + in view · Off during Time Machine, Find isolate, Cinema | `toggleDlodNav` `viewer/dlod_nav.js:2000` | view | no gpu/writes/leaves callee found |
| 85 | `viewer/panels.js:1528` | `4` | `report` | 4D / 5D | `A.export4D5D` `viewer/tools.js:596` | leaves | A.export4D5D: opens boq_charts.html in a new tab (tools.js A.export4D5D, window.open) |
| 86 | `viewer/panels.js:1529` | `i` | `issues` | Issues — Snag photo + annotation · Fly to clash deep-link · Export Excel | `toggleIssues` `viewer/issues.js:243` | view | no gpu/writes/leaves callee found |
| 87 | `viewer/panels.js:1532` | `F11` | `fullscreen` | Fullscreen | `document.exitFullscreen`<br>`document.requestFullscreen` | leaves | document.exitFullscreen: needs a user gesture; document.requestFullscreen: needs a user gesture |
| 88 | `viewer/panels.js:1537` | `Caps Lock` | `precision` | Precision (Fine) | `togglePrecisionFine` `viewer/precision_cam.js:290` | view | no gpu/writes/leaves callee found |
| 89 | `viewer/panels.js:1540` | `a` | `cam-reset` | Reset Camera | `resetCamOrbit` `viewer/precision_cam.js:286` | view | no gpu/writes/leaves callee found |
| 90 | `viewer/panels.js:1543` | `q` | `cam-pivot` | Auto-Pivot | `toggleCamPivot` `viewer/precision_cam.js:344` | view | no gpu/writes/leaves callee found |
| 91 | `viewer/panels.js:1547` |  | `home` | Home | `window.open` | leaves | window.open: opens another page or tab |
| 92 | `viewer/panels.js:1556` | `v` | `audio` | Sound FX — Time Machine: earcon per construction phase · Fly Tour: positional waypoint cues · UI: soft tap tick · Synthesized — no audio files, default OFF | `toggleSfx` `viewer/sfx.js:529` | view | no gpu/writes/leaves callee found |
| 93 | `viewer/panels.js:1560` | `=` | `settings` | Settings | `_openSettingsPanel` `viewer/panels.js:1850` | view | no gpu/writes/leaves callee found |
| 94 | `viewer/panels.js:1569` |  | `navigate` | Navigate | `_navigateDrawer.toggle` `viewer/panels.js:1819` | view | no gpu/writes/leaves callee found |
| 95 | `viewer/panels.js:1571` |  | `inspect` | Inspect | `_inspectDrawer.toggle` `viewer/panels.js:1820` | view | no gpu/writes/leaves callee found |
| 96 | `viewer/panels.js:1573` |  | `camview` | Camera / View | `_camviewDrawer.toggle` `viewer/panels.js:1821` | view | no gpu/writes/leaves callee found |

## Keydown listener files (R4)

| file | treatment |
|---|---|
| `common/comm/team_people_ui.js` | excluded: Enter/Space on a person row inside the Team panel (panel-local) |
| `common/history_bar.js` | scanned |
| `viewer/cinema_path_editor.js` | excluded: keys while the Cinema Path Editor is open (mode-local, capture listener) |
| `viewer/cpe_walk.js` | excluded: walk keys while a CPE walk is active (mode-local) |
| `viewer/doc_canvas.js` | excluded: Escape deselects inside the document canvas (panel-local) |
| `viewer/fx_still_refine.js` | excluded: Escape cancels a still in progress (mode-local lock) |
| `viewer/gi_still.js` | scanned |
| `viewer/grid_drag.js` | excluded: Ctrl+Z/Y only while the 2D grid drag is active (`st.active`), routed to UniversalHistory |
| `viewer/main.js` | excluded: any key restarts the render loop (_startLoop); no action |
| `viewer/navigate_controls.js` | excluded: Escape closes the Navigate panel (panel-local) |
| `viewer/navigate_engine.js` | excluded: keys while corridor navigation is active (mode-local) |
| `viewer/nf_panel_search.js` | excluded: Enter/Escape/arrows inside the Find input (panel-local) |
| `viewer/nlp.js` | excluded: Enter/Escape/ArrowDown inside the typed-query input (panel-local) |
| `viewer/precision_cam.js` | scanned |
| `viewer/print_sheet.js` | excluded: Escape closes the print overlay (panel-local) |
| `viewer/scene.js` | scanned |
| `viewer/sfx.js` | excluded: plays a tick for a pressed key; no action |

Ignored modifier lines inside a scanned file (panel navigation, not app actions):

- `viewer/scene.js:3665` panel navigation: Ctrl+Space inside a focused panel
- `viewer/scene.js:3669` panel navigation: Ctrl+A select-all inside a focused panel
- `viewer/panels.js:588` list navigation (makeListKeyNav): Ctrl+A selects every row of a focused list
- `viewer/panels.js:602` list navigation (makeListKeyNav): Ctrl+Space toggles one row of a focused list

