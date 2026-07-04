# Changelog

All notable, user-facing changes are batched here by [release-please](https://github.com/googleapis/release-please)
from our conventional-commit prefixes (`feat` → minor, `fix`/`docs` → patch, `feat!`/`BREAKING CHANGE` → major).
The per-deploy build id (`erp/sw.js` `CACHE_VERSION` = `vNNN`) is separate — a cache-bust id, not a release.

## [1.9.0](https://github.com/red1oon/bim-ootb/compare/v1.8.0...v1.9.0) (2026-07-03)


### ✨ Features

* **erp:** kernel T1 — PIN/login as audit metadata on the op (W-T1-ATTRIB), device key stays the only signer ([#634](https://github.com/red1oon/bim-ootb/issues/634)) ([1e202ce](https://github.com/red1oon/bim-ootb/commit/1e202ceca964447914528b13a056d9e9f813a6b0))
* **erp:** kernel T7 — wire incremental seal/verify/tip-folds + signed shard boundary w/ lazy first paint (W-T7-INC) ([#636](https://github.com/red1oon/bim-ootb/issues/636)) ([c2e51ef](https://github.com/red1oon/bim-ootb/commit/c2e51ef9f76e902077d1d3be578047a8161d1351))
* **hba:** §BOM-ERP-CENTERED — BIM BOM LIVES in native iDempiere pp_product_bom (ERP is the source of truth) ([#626](https://github.com/red1oon/bim-ootb/issues/626)) ([f447cbe](https://github.com/red1oon/bim-ootb/commit/f447cbecb3fb4a6976708deae7f874fd73dd2bee))
* **hba:** §PILLAR 3 E-Invoice stub + §P10a/b UX-IoT arc — mock_rates seam, einvoice mechanism, sync-merged with S2/[#626](https://github.com/red1oon/bim-ootb/issues/626) ([#628](https://github.com/red1oon/bim-ootb/issues/628)) ([e42a96b](https://github.com/red1oon/bim-ootb/commit/e42a96ba14c049502157b531e3e059fb55fa582a))
* **hba:** §STAGE3 — retire invented C_Attendance onto native S_Resource/S_ResourceAssignment + governed Presence drawer + BIM BOM pane + live smoke ([#632](https://github.com/red1oon/bim-ootb/issues/632)) ([5ce3404](https://github.com/red1oon/bim-ootb/commit/5ce340400c7eba4c9fd9b4d354bde8d4e13e95a6))
* **modeller:** §I5 per-instance hide inside a single InstancedMesh (Item 5, W-E2E-INSTHIDE 14/14) ([#637](https://github.com/red1oon/bim-ootb/issues/637)) ([f714daf](https://github.com/red1oon/bim-ootb/commit/f714daf92ac18c9065beb85fe0d75f6058d12aab))
* **modeller:** §POLISH3 — Outliner eye/filter-dim/windowing/auto-expand + selection outline + real shadows ([#625](https://github.com/red1oon/bim-ootb/issues/625)) ([5715364](https://github.com/red1oon/bim-ootb/commit/571536476e9021cea458fae4cdaa1a89fa33b4af))
* **modeller:** §V7 floating dimension readout during drags (POLISH3 follow-up) ([#627](https://github.com/red1oon/bim-ootb/issues/627)) ([49a6127](https://github.com/red1oon/bim-ootb/commit/49a6127d61608e573c2c5a7c52b90698d935bf35))
* **modeller:** §V8 T/S arm rotate-ring / scale-cube gizmo sub-modes (item 10, R stays Insert) ([#631](https://github.com/red1oon/bim-ootb/issues/631)) ([8d73fb0](https://github.com/red1oon/bim-ootb/commit/8d73fb04b7b5c734e01ed723ed4b4738b57d1a2d))
* **modeller:** ONE Export menu — Native .db (full-fidelity signed op-log) + IFC + BCF ([#633](https://github.com/red1oon/bim-ootb/issues/633)) ([f217552](https://github.com/red1oon/bim-ootb/commit/f217552eec106e828256a7cbc8a4b801e74a2f6d))


### 🐛 Fixes

* **erp:** kernel timebomb batch-1 — T3 period-close archive gate + T6 multi-tab persist guard (sw v759) ([#623](https://github.com/red1oon/bim-ootb/issues/623)) ([16baba5](https://github.com/red1oon/bim-ootb/commit/16baba54a2ccc57905daedda736a480e803ea917))
* **erp:** kernel timebomb T2+T1 — content-addressed signing + roster/key-epoch verify on import (sw v760) ([#630](https://github.com/red1oon/bim-ootb/issues/630)) ([a9c68f2](https://github.com/red1oon/bim-ootb/commit/a9c68f2cba962d0c9f56b86c3803883898f02949))


### 📝 Documentation

* **hba:** mark queued sync+PR handoff ✅ DONE — PR [#628](https://github.com/red1oon/bim-ootb/issues/628) merged (39/39 witnesses, union merge with S2/[#626](https://github.com/red1oon/bim-ootb/issues/626)) ([#629](https://github.com/red1oon/bim-ootb/issues/629)) ([1b4d99e](https://github.com/red1oon/bim-ootb/commit/1b4d99e21274aaeb996e15aeefc0158d90a8c58f))


### ♻️ Refactors

* **pills:** ONE canonical common/pill_builder.js — retire the silent erp/viewer fork + §ICON MAP de-collisions ([#635](https://github.com/red1oon/bim-ootb/issues/635)) ([f83312c](https://github.com/red1oon/bim-ootb/commit/f83312c6ecea59b6b8bb0300907d99372044c21e))

## [1.8.0](https://github.com/red1oon/bim-ootb/compare/v1.7.0...v1.8.0) (2026-07-03)


### ✨ Features

* **erp-pos:** staged Generate Replenishment — propose/stage/review/route/commit (erp sw v758) ([#619](https://github.com/red1oon/bim-ootb/issues/619)) ([d4ddab6](https://github.com/red1oon/bim-ootb/commit/d4ddab6dd0f7ac2f783eea5d47abff6671047f81))
* **erp:** Kitchen Display lens + POS HMI restyle onto app palette (erp sw v757) ([#617](https://github.com/red1oon/bim-ootb/issues/617)) ([ba12eba](https://github.com/red1oon/bim-ootb/commit/ba12ebaea13406c063b21bbdd1085e0b7d76d2df))
* **hba:** §HBA-ERP-GOV Stage 1 — real iDempiere seed rows + Ninja-staged C_Attendance lens (W-HBA-ERP-SEED 7/7) ([#621](https://github.com/red1oon/bim-ootb/issues/621)) ([8507608](https://github.com/red1oon/bim-ootb/commit/8507608b179343d98b9d5584aff2a3584177179a))
* **hba:** §HBA-ERP-GOV Stage 2 — compile-layer reads real seeded AD rows (governance seam, literal fallback) ([#622](https://github.com/red1oon/bim-ootb/issues/622)) ([cbe3649](https://github.com/red1oon/bim-ootb/commit/cbe364900d5c4c292ee32f3fc62764ef23a0a26d))
* **hba:** §P11 — deep-link Dashboard/Payslip/Leave/Tenancy/IoT panes into iDempiere ([#614](https://github.com/red1oon/bim-ootb/issues/614)) ([5a83955](https://github.com/red1oon/bim-ootb/commit/5a839555d00dd2f8ac7da5a16fe8e486fdc6345f))
* **hba:** HR_BIM_Asset — Human-Asset FM/Operate module ([#609](https://github.com/red1oon/bim-ootb/issues/609)) ([e31bebd](https://github.com/red1oon/bim-ootb/commit/e31bebde5aa04fe56811c42bcdcf6a80c79b5837))
* **modeller:** §POLISH batch — Outliner⇄canvas sync, geomap surfacing, typed R/S input, gesture undo, grid-alignment numeric witness ([#616](https://github.com/red1oon/bim-ootb/issues/616)) ([1e5713f](https://github.com/red1oon/bim-ootb/commit/1e5713f2f5d921eae8d8785ece21a4833e5427a0))
* **modeller:** §POLISH2 — local-axes scale preview, instanceId pick identity, real BCF 2.1 export ([#620](https://github.com/red1oon/bim-ootb/issues/620)) ([545527e](https://github.com/red1oon/bim-ootb/commit/545527eb3af8ab02c72f25cd2bf73cf47022ba00))


### 🐛 Fixes

* **erp:** escape filenames in innerHTML sinks — audit §5 self-XSS (erp sw v758) ([#618](https://github.com/red1oon/bim-ootb/issues/618)) ([b81731f](https://github.com/red1oon/bim-ootb/commit/b81731fa05aeb3153ca2e28da8dafc96e9c6c812))
* **hba:** pill tooltip, IoT table redundancy, fly-to-zone instanced-mesh bug, bar colors + click-to-locate ([#611](https://github.com/red1oon/bim-ootb/issues/611)) ([a2a1b5b](https://github.com/red1oon/bim-ootb/commit/a2a1b5b839b52884e7737b5872ebd8bc0d008006))
* **modeller-tests:** §F2-FRAMING — guide frames are real element close-ups, not silent wide-shot fallbacks ([#608](https://github.com/red1oon/bim-ootb/issues/608)) ([3132b9a](https://github.com/red1oon/bim-ootb/commit/3132b9ade3b59c5fcfbd48a88d9aa4f6ba04201a))
* **modeller:** §ARC-ANCHOR — ARC-seed placement follows the proven anchor semantics (W-MV-PARITY 12/12) ([#613](https://github.com/red1oon/bim-ootb/issues/613)) ([8449306](https://github.com/red1oon/bim-ootb/commit/84493061a2a4c953b76dc89f3a84e11d44466ec3))
* **modeller:** §WALKALL-TERMINAL-SCALE — Walk-ALL smooth at real Terminal scale (flash time-budget + chain group-commit) ([#606](https://github.com/red1oon/bim-ootb/issues/606)) ([810ff94](https://github.com/red1oon/bim-ootb/commit/810ff9442ba49ada0f9e4bfe8ba64aed9cc1b68e))


### 📝 Documentation

* **hba:** close §P10d (shipped+live PR [#609](https://github.com/red1oon/bim-ootb/issues/609)/[#611](https://github.com/red1oon/bim-ootb/issues/611)) — queue §P11 (dashboard/IoT → iDempiere deep-link) ([#612](https://github.com/red1oon/bim-ootb/issues/612)) ([cbde7e7](https://github.com/red1oon/bim-ootb/commit/cbde7e7c00c4ac29ab133a02e6e27ad5723f2cec))
* **prompts:** mirror §P11 closeout from bim-compiler ([#615](https://github.com/red1oon/bim-ootb/issues/615)) ([51bfdee](https://github.com/red1oon/bim-ootb/commit/51bfdeeb269971186f3fb3f4cb21479222c452e6))

## [1.7.0](https://github.com/red1oon/bim-ootb/compare/v1.6.0...v1.7.0) (2026-07-02)


### ✨ Features

* **geomapping:** graph-context alias layer — alias() + documented rename table (§ALIAS-SPEC, lane-concluding) ([#603](https://github.com/red1oon/bim-ootb/issues/603)) ([d9fff7a](https://github.com/red1oon/bim-ootb/commit/d9fff7a7a1bfecda7e4238385e2f065c4b35b6b1))
* **geomapping:** IFC→BOM deterministic classifier (Tier-1 relations + Tier-2 measured bands) ([#600](https://github.com/red1oon/bim-ootb/issues/600)) ([05a3009](https://github.com/red1oon/bim-ootb/commit/05a30092b0587ef7b881b639cbda0f514fd50232))
* **geomapping:** wire classifier into modeller — audit-first (§WIRE-SPEC items 1a/1b/1c) ([#601](https://github.com/red1oon/bim-ootb/issues/601)) ([1e879b5](https://github.com/red1oon/bim-ootb/commit/1e879b505e45713d1c8297476bd9666533197fd3))
* **modeller:** §STRETCH-RIDE — openings ride grid-stretch via rel_fills_host (no divorce, no door-scale) ([#604](https://github.com/red1oon/bim-ootb/issues/604)) ([cb7bc17](https://github.com/red1oon/bim-ootb/commit/cb7bc17ebe7b68333ce81812e93cb467088a87b3))
* **modeller:** real per-element geometry render (incl. Terminal split-file) + SampleCastle-ARC resident ([#598](https://github.com/red1oon/bim-ootb/issues/598)) ([02e5a2a](https://github.com/red1oon/bim-ootb/commit/02e5a2a5eaaf783cf725cdbd5a12bb355c25e880))
* **modeller:** Walk ALL Disciplines — loop, x-ray reveal, orange-flash-then-settle ([#599](https://github.com/red1oon/bim-ootb/issues/599)) ([5292ee1](https://github.com/red1oon/bim-ootb/commit/5292ee1dfb8cc2cf876a082e4c3f99e57b72924e))


### 🐛 Fixes

* **modeller:** ARC-seed full 3-axis rotation + SampleCastle one-source-of-truth ([#595](https://github.com/red1oon/bim-ootb/issues/595)) ([e4ce58f](https://github.com/red1oon/bim-ootb/commit/e4ce58f8cd60878d8728ca3ade8093455a071228))
* **modeller:** Outliner Components-category O(rows×total-ops) paint stall ([#596](https://github.com/red1oon/bim-ootb/issues/596)) ([147d098](https://github.com/red1oon/bim-ootb/commit/147d0981e464b2f24aef046e48d2e7c86a232b96))
* **modeller:** Terminal open stall + illegal LOD200 geometry + ARC rotation unit bug ([#594](https://github.com/red1oon/bim-ootb/issues/594)) ([351992e](https://github.com/red1oon/bim-ootb/commit/351992e6c2e9aabbef8c2074d785939a70dce660))


### 📝 Documentation

* **modeller:** §F2 DONE — all 21 guide frames at 2× standard, witnesses folded via [#590](https://github.com/red1oon/bim-ootb/issues/590) ([#591](https://github.com/red1oon/bim-ootb/issues/591)) ([ce52497](https://github.com/red1oon/bim-ootb/commit/ce52497304022532d71aeaf07afeaac2716e3086))
* **modeller:** §F2 outward steps DONE — PR [#10](https://github.com/red1oon/bim-ootb/issues/10) merged + deployed, suite-2 folded via [#588](https://github.com/red1oon/bim-ootb/issues/588) ([#589](https://github.com/red1oon/bim-ootb/issues/589)) ([77e29c4](https://github.com/red1oon/bim-ootb/commit/77e29c4523dcc729326e808ea3e3d837871b9996))

## [1.6.0](https://github.com/red1oon/bim-ootb/compare/v1.5.0...v1.6.0) (2026-06-30)


### ✨ Features

* **modeller:** seed-trunk render GATE + construction animation (sw v24) ([#582](https://github.com/red1oon/bim-ootb/issues/582)) ([836dbfc](https://github.com/red1oon/bim-ootb/commit/836dbfc5352f7c4d4d213f4c7dda2d89dcfeb8a5))
* **modeller:** seed→3D corridor trunk — Outliner popup + render (sw v23) ([#580](https://github.com/red1oon/bim-ootb/issues/580)) ([4c767cc](https://github.com/red1oon/bim-ootb/commit/4c767cc301e20d371423a83403dcaf0b5b8d2159))


### 🐛 Fixes

* **modeller:** Walk tool — borrow hang + 112s commit freeze; user-emulating E2E gates (sw v25) ([#584](https://github.com/red1oon/bim-ootb/issues/584)) ([18cddf2](https://github.com/red1oon/bim-ootb/commit/18cddf2fca50e8a01429f9c814978956ee90ef1f))

## [1.5.0](https://github.com/red1oon/bim-ootb/compare/v1.4.0...v1.5.0) (2026-06-30)


### ✨ Features

* **modeller:** §3c port ASSEMBLE render — connector hookup edges + catalog parts at routed nodes ([#578](https://github.com/red1oon/bim-ootb/issues/578)) ([87098ae](https://github.com/red1oon/bim-ootb/commit/87098aede545c2cc0afaa1ada7f093380f782ad0))
* **modeller:** §4 __dwPixelProbe render gate — prove disc-walk render paints + §3c connector edges wired live ([#579](https://github.com/red1oon/bim-ootb/issues/579)) ([236b645](https://github.com/red1oon/bim-ootb/commit/236b64569cef3af7eefe331bfe00978b5cf14bf8))
* **modeller:** port disc_walker (borrow+shim-select+default-on host-bind) + wire dwBorrow FP/sprinkler + LOD-seam render + rules-cache bust ([#576](https://github.com/red1oon/bim-ootb/issues/576)) ([a319a7d](https://github.com/red1oon/bim-ootb/commit/a319a7dc18af9abf809bf87780e70f9c75a384b4))

## [1.4.0](https://github.com/red1oon/bim-ootb/compare/v1.3.0...v1.4.0) (2026-06-28)


### ✨ Features

* **modeller:** §ARC-1 — load REAL ARC building as gizmo-editable, guid-carrying meshes ([#571](https://github.com/red1oon/bim-ootb/issues/571)) ([37af04a](https://github.com/red1oon/bim-ootb/commit/37af04a14311acfd9d1e0d407cae9c07c2b0faa3))
* **modeller:** §GATE-1 — RED/ORANGE conformity gate on edits (the planner's gate) ([#574](https://github.com/red1oon/bim-ootb/issues/574)) ([03eff00](https://github.com/red1oon/bim-ootb/commit/03eff005b7d88bdf917c70538e11ccab2d6e9e54))
* **modeller:** §SDG-CASCADE — hosted-by ride (drag wall → door rides) ([#573](https://github.com/red1oon/bim-ootb/issues/573)) ([0baced9](https://github.com/red1oon/bim-ootb/commit/0baced91d0d4e07599600243cb13c8c7016057e3))
* **modeller:** §STRETCH-1 — make the seeded ARC building grid-STRETCHABLE + gated ([#575](https://github.com/red1oon/bim-ootb/issues/575)) ([0952cae](https://github.com/red1oon/bim-ootb/commit/0952cae7e34b1ba7ddcbf3c706f712af78f16477))

## [1.3.0](https://github.com/red1oon/bim-ootb/compare/v1.2.0...v1.3.0) (2026-06-28)


### ✨ Features

* **modeller:** area-scaled disc-walker placement — fix density explosion (sw v5) ([#558](https://github.com/red1oon/bim-ootb/issues/558)) ([75500a4](https://github.com/red1oon/bim-ootb/commit/75500a41d811fec67aacf285ca0e28328a9e90fa))
* **modeller:** deploy clash-gate fix + RED irreducible-clash markers (walk-any-disc) ([#556](https://github.com/red1oon/bim-ootb/issues/556)) ([a2faac9](https://github.com/red1oon/bim-ootb/commit/a2faac90ceeb8ef1f2676e27abcbad48cfa75a39))
* **modeller:** deploy duplex_rules.db (residential disc standard) + building-class select ([#557](https://github.com/red1oon/bim-ootb/issues/557)) ([4083ff0](https://github.com/red1oon/bim-ootb/commit/4083ff041f18f735c3e8e9697cb173fa057cdffb))
* **modeller:** LANDED routed network as LOD tubes, not flat lines (sw v7) ([#560](https://github.com/red1oon/bim-ootb/issues/560)) ([dc2cbbd](https://github.com/red1oon/bim-ootb/commit/dc2cbbdd05dc8d1cca3e59ee3fe8f82df88784f9))
* **modeller:** Router half LIVE — nn-chains rendered + folded to op-log (W-ROUTER-NNCHAIN 8/8) ([#555](https://github.com/red1oon/bim-ootb/issues/555)) ([e0df841](https://github.com/red1oon/bim-ootb/commit/e0df841194cbb158202fce906d980bb291b53e3c))
* **modeller:** tack-chain op-log emit for disc-walk (W-DW-OPLOG 6/6) ([#553](https://github.com/red1oon/bim-ootb/issues/553)) ([696480e](https://github.com/red1oon/bim-ootb/commit/696480e1efbff7eec52289442d03b442d4847cee))
* **modeller:** terminal_rules.db src_area + routing src_guids — uniform area-density (sw v6) ([#559](https://github.com/red1oon/bim-ootb/issues/559)) ([b4aaaf4](https://github.com/red1oon/bim-ootb/commit/b4aaaf43b23e426a3dd924277d6f9f2daaeae58e))
* **modeller:** W-BONSAI-ASM-PREVIEW ([#6](https://github.com/red1oon/bim-ootb/issues/6)) — rich assembly-drop preview (sw v15) ([#570](https://github.com/red1oon/bim-ootb/issues/570)) ([707732f](https://github.com/red1oon/bim-ootb/commit/707732fd9e391ea6aed1de079f86f9bb3aa63d63))
* **modeller:** W-BONSAI-CURSOR ([#5](https://github.com/red1oon/bim-ootb/issues/5)) — canvas cursor reflects the active mode/tool (sw v10) ([#564](https://github.com/red1oon/bim-ootb/issues/564)) ([5bbc50c](https://github.com/red1oon/bim-ootb/commit/5bbc50c476893c5fe37895b67b0011de2581c428))
* **modeller:** W-BONSAI-OUTLINER-INCR ([#7](https://github.com/red1oon/bim-ootb/issues/7)) — incremental Outliner rebuild (sw v13) ([#568](https://github.com/red1oon/bim-ootb/issues/568)) ([5214b2d](https://github.com/red1oon/bim-ootb/commit/5214b2dacfb495969c21c2ba9e9667a1821ad644))
* **modeller:** W-BONSAI-POINTS-RECOVERY ([#4](https://github.com/red1oon/bim-ootb/issues/4)) — in-progress sketch/route points survive Escape (sw v12) ([#567](https://github.com/red1oon/bim-ootb/issues/567)) ([2b2496b](https://github.com/red1oon/bim-ootb/commit/2b2496b4c7fd45afc3231ae145bb2e9eb5651fe0))
* **modeller:** W-BONSAI-SCALE — gizmo cube scale-handles, edge-anchored, on inserts (sw v9) ([#563](https://github.com/red1oon/bim-ootb/issues/563)) ([4858511](https://github.com/red1oon/bim-ootb/commit/48585114a68dac68a900d3f44116fefc79d1010a))
* **modeller:** W-BONSAI-TOAST ([#8](https://github.com/red1oon/bim-ootb/issues/8)) — persistent error toast, status bar can't clobber it (sw v11) ([#566](https://github.com/red1oon/bim-ootb/issues/566)) ([c1ce3f4](https://github.com/red1oon/bim-ootb/commit/c1ce3f43688fdbd680f0613935b1457809df66ff))
* **modeller:** W-BONSAI-ZTOP ([#9](https://github.com/red1oon/bim-ootb/issues/9)) — Z-drag works in pure top view (sw v14) ([#569](https://github.com/red1oon/bim-ootb/issues/569)) ([269a694](https://github.com/red1oon/bim-ootb/commit/269a6943f3c8bdd8a0f1c52c27567bca513dc971))
* **modeller:** W-DW-PRIM measured-bbox fixture boxes + §DW_IDB offline rules cache (sw v8) ([#562](https://github.com/red1oon/bim-ootb/issues/562)) ([707533a](https://github.com/red1oon/bim-ootb/commit/707533a262daec2db166dd80c7f6d284cfe9ece5))
* **viewer:** upgrade Three.js r184 → r185 ([#552](https://github.com/red1oon/bim-ootb/issues/552)) ([84b3136](https://github.com/red1oon/bim-ootb/commit/84b31367ce7e30d9a9f878e76a0c4fa38976541c))


### 🐛 Fixes

* **history:** World History dedup + per-page bar restore (sw v755) ([#554](https://github.com/red1oon/bim-ootb/issues/554)) ([3472b93](https://github.com/red1oon/bim-ootb/commit/3472b939497057e643044a9033e06bd12adf64ff))
* **offline:** route ad_seed.db loads through APP.cachedFetch (sw v738) ([#561](https://github.com/red1oon/bim-ootb/issues/561)) ([55a59ea](https://github.com/red1oon/bim-ootb/commit/55a59eac61dc174ad46f5a3f72f6803fefc181dc))
* **pwa:** home icon falls back to cached index.html when offline ([#565](https://github.com/red1oon/bim-ootb/issues/565)) ([ee64e2e](https://github.com/red1oon/bim-ootb/commit/ee64e2e1e43df166267f002cb6fca11ae52bee37))


### ♻️ Refactors

* **modeller:** extract Modeller into its own top-level folder (trilogy viewer/·erp/·modeller/) ([#550](https://github.com/red1oon/bim-ootb/issues/550)) ([964ad3c](https://github.com/red1oon/bim-ootb/commit/964ad3cc7abd4bf62e53c1d761abdfa9c91dab06))

## [1.2.0](https://github.com/red1oon/bim-ootb/compare/v1.1.0...v1.2.0) (2026-06-27)


### ✨ Features

* **modeller-ux:** ⇄ adjacency lens — render abuts cross-edges on the backbone (W-UX-6) ([#547](https://github.com/red1oon/bim-ootb/issues/547)) ([351ac22](https://github.com/red1oon/bim-ootb/commit/351ac229c1dd625c366a36a942021e0579985ed9))
* **modeller-ux:** full SDG cross-edges JS-derived → multi-edge adjacency lens (W-UX-6 Phase 2) ([#548](https://github.com/red1oon/bim-ootb/issues/548)) ([76837d4](https://github.com/red1oon/bim-ootb/commit/76837d433a9fcbd0ac954a75fa36dde60d4d0392))
* **modeller:** all residents real rooms/storeys + cross-edges (recovers [#542](https://github.com/red1oon/bim-ootb/issues/542) orphan + adds SampleCastle) ([#543](https://github.com/red1oon/bim-ootb/issues/543)) ([1e8658b](https://github.com/red1oon/bim-ootb/commit/1e8658b6bee6bdbe3d4993f5732d4abb09b7bee0))
* **modeller:** BOM Tree editor in the Outliner — Open any extracted.db, signed re-parent ([#530](https://github.com/red1oon/bim-ootb/issues/530)) ([0bf40aa](https://github.com/red1oon/bim-ootb/commit/0bf40aa3fb80808c1f1ac1dce8a96b6b0620b914))
* **modeller:** bom-graph tab under DISC/ARC — ARC drops as a containment tree (sw v734) ([#539](https://github.com/red1oon/bim-ootb/issues/539)) ([81ebd6b](https://github.com/red1oon/bim-ootb/commit/81ebd6b6b9a751c4a5375a7fbe1d3cfb1014af89))
* **modeller:** calibrated-confidence highlight in the STR Walker Outliner (?strwalk) ([#533](https://github.com/red1oon/bim-ootb/issues/533)) ([d76e9f3](https://github.com/red1oon/bim-ootb/commit/d76e9f37c677939e98f66d4b868602ce3bf72d09))
* **modeller:** disc-walk from Terminal-mined rules wired to the Outliner (Phase 6) ([#549](https://github.com/red1oon/bim-ootb/issues/549)) ([a786659](https://github.com/red1oon/bim-ootb/commit/a786659d43dcd936318052b9e78be34fdc8613cf))
* **modeller:** guided Open — 4 permanent residents fetched from cloud + cached local (sw v731) ([#536](https://github.com/red1oon/bim-ootb/issues/536)) ([fb99891](https://github.com/red1oon/bim-ootb/commit/fb99891913d2ce6db9ca4f812e7ae7fce4237682))
* **modeller:** live-port ARC-only STR walker auto-pick to bim-ootb (sw v730) ([#534](https://github.com/red1oon/bim-ootb/issues/534)) ([29d1419](https://github.com/red1oon/bim-ootb/commit/29d141982947fbae82d26dc05cf74a84fd9be575))
* **modeller:** per-building editable instance — mo_&lt;key&gt; op-log fork, reference stays pristine (sw v732) ([#537](https://github.com/red1oon/bim-ootb/issues/537)) ([57b0e83](https://github.com/red1oon/bim-ootb/commit/57b0e8345a9f41f8e4ed5eadf89679e2e44d3e4e))
* **modeller:** replay an instance's STR edits on reopen — prior edits re-appear (sw v733) ([#538](https://github.com/red1oon/bim-ootb/issues/538)) ([fa46dc0](https://github.com/red1oon/bim-ootb/commit/fa46dc09692ee90d5440de9b40c4618e195f96e2))
* **modeller:** residents fetch from isolated GH playground — zero OCI + Terminal via LFS ([#542](https://github.com/red1oon/bim-ootb/issues/542)) ([a6dba4f](https://github.com/red1oon/bim-ootb/commit/a6dba4febc672ac614c955b14fe56c4818443b2a))
* **modeller:** STR Walker live wiring (?strwalk) + fix [#530](https://github.com/red1oon/bim-ootb/issues/530) qs TDZ that broke the modeller ([#531](https://github.com/red1oon/bim-ootb/issues/531)) ([41b385b](https://github.com/red1oon/bim-ootb/commit/41b385befa0491a55a86cb349182b786a6d011a8))


### 📝 Documentation

* **readme:** ADempiere origin + Alpha badge + feature refresh ([#545](https://github.com/red1oon/bim-ootb/issues/545)) ([0606a7e](https://github.com/red1oon/bim-ootb/commit/0606a7e859d2bc4e20c225f915df86d7382a1bd9))
* **readme:** update roadmap 2D→3D grid, add contributor section, extend who paragraph ([#544](https://github.com/red1oon/bim-ootb/issues/544)) ([8864397](https://github.com/red1oon/bim-ootb/commit/8864397491e9a36551db125094b6b7f763f3c778))
* **readme:** warm up tone — collaborative spirit, learning joy, BIM-ERP ambition ([#535](https://github.com/red1oon/bim-ootb/issues/535)) ([fdff53b](https://github.com/red1oon/bim-ootb/commit/fdff53bcfd810498e433e221cd2089f4fa4e278a))

## [1.1.0](https://github.com/red1oon/bim-ootb/compare/v1.0.0...v1.1.0) (2026-06-25)


### ✨ Features

* **release:** batched semantic-version releases via release-please; decouple build id from release (sw v754) ([#525](https://github.com/red1oon/bim-ootb/issues/525)) ([406c946](https://github.com/red1oon/bim-ootb/commit/406c94601e2a204e02f0a1a2a7499578c7ccbd6e))

## 1.0.0 (2026-06-25)

Baseline release — the iDempiere-faithful serverless browser ERP + BIM viewer as shipped to date:
folding kernel, signed op-log, spatial BIM→ERP (Find → Project Order), 4D/5D authoring + Schedule Editor,
What-if, foreign-schedule import (Primavera P6 / MS Project), and the System Monitor with paradigm vitals.
Subsequent entries are cut automatically from merged PRs.
