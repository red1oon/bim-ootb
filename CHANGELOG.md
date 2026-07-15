# Changelog

All notable, user-facing changes are batched here by [release-please](https://github.com/googleapis/release-please)
from our conventional-commit prefixes (`feat` → minor, `fix`/`docs` → patch, `feat!`/`BREAKING CHANGE` → major).
The per-deploy build id (`erp/sw.js` `CACHE_VERSION` = `vNNN`) is separate — a cache-bust id, not a release.

## [1.18.0](https://github.com/red1oon/bim-ootb/compare/v1.17.1...v1.18.0) (2026-07-15)


### ✨ Features

* **viewer:** Room Lens taxonomy + category coloring + reveal toggle + orange path ([#795](https://github.com/red1oon/bim-ootb/issues/795)) ([f82333d](https://github.com/red1oon/bim-ootb/commit/f82333da33663591b473026d17fa5d49639f8009))


### 🐛 Fixes

* **4d:** Editor Generate+MSProject export, dedupe TM matrix-clone (partial SE-7 fix) ([#789](https://github.com/red1oon/bim-ootb/issues/789)) ([0e3f181](https://github.com/red1oon/bim-ootb/commit/0e3f181ece3dbb0afad3076aa06a1f36c03bc0ef))
* **4d:** index kernel_ops.output_guid — the real Generate/Apply hang (O(n^2) full table scan) ([#791](https://github.com/red1oon/bim-ootb/issues/791)) ([3ca3724](https://github.com/red1oon/bim-ootb/commit/3ca37244497d6c6a6ab06f8beed84221529278d5))
* **rooms:** close two real connectivity-graph island gaps found by fullConnectivity() ([#794](https://github.com/red1oon/bim-ootb/issues/794)) ([95e788a](https://github.com/red1oon/bim-ootb/commit/95e788a7bef8594be1fa55abc0ebbbdcf80c717d))
* **rooms:** corridor plausibility framework — width bounds, common-sense filter, shape guard, full connectivity ([#792](https://github.com/red1oon/bim-ootb/issues/792)) ([8621e01](https://github.com/red1oon/bim-ootb/commit/8621e01a14e89717873d0a7081c7806a6f7839dc))
* **rooms:** hallway_backbone.js was never actually loaded in the browser ([#788](https://github.com/red1oon/bim-ootb/issues/788)) ([3f7386d](https://github.com/red1oon/bim-ootb/commit/3f7386d9419f9c5769476ea494d0b07975bbb493))
* **sfx:** guard non-finite camera position before feeding Web Audio setTargetAtTime ([#793](https://github.com/red1oon/bim-ootb/issues/793)) ([82fb998](https://github.com/red1oon/bim-ootb/commit/82fb998cf33edd621a6f7f71eb71186163b00e8b))
* **viewer:** Room Lens path/perf/color fixes — E6 x-crossing, desktop bbox default, Room-axis cache ([#796](https://github.com/red1oon/bim-ootb/issues/796)) ([d5ea49f](https://github.com/red1oon/bim-ootb/commit/d5ea49f7c57fcf12494403cde0795752063b8fb2))
* **viewer:** selected-room fill now shines through occluding geometry, like its border ([#797](https://github.com/red1oon/bim-ootb/issues/797)) ([3675ec3](https://github.com/red1oon/bim-ootb/commit/3675ec38f4c6983df89cb9b4947d4e40679b134b))

## [1.17.1](https://github.com/red1oon/bim-ootb/compare/v1.17.0...v1.17.1) (2026-07-13)


### 🐛 Fixes

* **pos:** cart panel + ⋯ dock survive the POS overlay's own ✕ close ([#771](https://github.com/red1oon/bim-ootb/issues/771)) ([95cd968](https://github.com/red1oon/bim-ootb/commit/95cd968a7ebcfa22f60d41b105ef60f5e37affac))
* **rooms:** path routing — stairwp storey bug + real walkable raster ([#777](https://github.com/red1oon/bim-ootb/issues/777)) ([77d52d1](https://github.com/red1oon/bim-ootb/commit/77d52d174cdc92aa038bdf9ae0834a867192ea90))
* **sw:** stop treating room_walker.js as an immutable lib/ vendor file ([#780](https://github.com/red1oon/bim-ootb/issues/780)) ([8895234](https://github.com/red1oon/bim-ootb/commit/8895234a905bd850085db4ac3cccd235c6673438))
* **viewer:** Find-panel room selection is now room_guid-aware (§MULTI-RECT) ([#778](https://github.com/red1oon/bim-ootb/issues/778)) ([810a0ab](https://github.com/red1oon/bim-ootb/commit/810a0ab1e2f57c9bf0987def00f6236c25fabfed))
* **viewer:** needle-inject trusted a successful patch as proof rooms were compiled ([#781](https://github.com/red1oon/bim-ootb/issues/781)) ([09008f7](https://github.com/red1oon/bim-ootb/commit/09008f7166c9e8d555ed0f744652aa39425ea1bb))
* **viewer:** retire stale HHS room patch so needle runs the fixed walker ([#775](https://github.com/red1oon/bim-ootb/issues/775)) ([5595840](https://github.com/red1oon/bim-ootb/commit/55958401f881b300597d38fc9677b4b9772e07fe))
* **viewer:** sync §SUSPECT-LARGE fix + regenerate HHS raster ([#779](https://github.com/red1oon/bim-ootb/issues/779)) ([3a55493](https://github.com/red1oon/bim-ootb/commit/3a554935d032e0f50b044afb7748985073e7be4b))
* **viewer:** sync room_walker.js needle copy with §WALL-SNAP fix ([#776](https://github.com/red1oon/bim-ootb/issues/776)) ([085e470](https://github.com/red1oon/bim-ootb/commit/085e4707188a78457687c49299d54314156e766e))
* **viewer:** sync room_walker.js needle-button copy with bim-compiler fixes ([#773](https://github.com/red1oon/bim-ootb/issues/773)) ([a06a67a](https://github.com/red1oon/bim-ootb/commit/a06a67ab0acf3da0aaf4e8c827b12fcc9993ebdd))
* **viewer:** Zoom Across never revealed the #find-selected ERP drawer ([#772](https://github.com/red1oon/bim-ootb/issues/772)) ([2ba6a4e](https://github.com/red1oon/bim-ootb/commit/2ba6a4e97368d2a60822bd38b00165b6c85853f4))

## [1.17.0](https://github.com/red1oon/bim-ootb/compare/v1.16.0...v1.17.0) (2026-07-12)


### ✨ Features

* **room_graph:** occupant pathfinder — circulation + stair + exit edges (human-walk routing) ([#759](https://github.com/red1oon/bim-ootb/issues/759)) ([b3462f6](https://github.com/red1oon/bim-ootb/commit/b3462f687c572d33b054a80c2ac1425adc88c750))


### 🐛 Fixes

* **disc_walker:** PATH_LEGAL_SEGMENTS §G3-REVISED — mesh-derived storey raster, no chord thru the void ([#767](https://github.com/red1oon/bim-ootb/issues/767)) ([073336f](https://github.com/red1oon/bim-ootb/commit/073336ff0f7b48d7fb0af9268c2ad65b8baa5864))
* **import:** Drop-IFC federation + site-identity auto-correct for georeferenced multi-file drops ([#762](https://github.com/red1oon/bim-ootb/issues/762)) ([2b955ed](https://github.com/red1oon/bim-ootb/commit/2b955ed33a566af6434912902b57656535fdfcae))
* **room_graph:** stair E3 — assembly-class fallback + consecutive-storey chaining + gap-relative tower ends (SampleCastle cross-storey paths) ([#763](https://github.com/red1oon/bim-ootb/issues/763)) ([80018dd](https://github.com/red1oon/bim-ootb/commit/80018dd7f941fe31cc756cc30799361983997cc5))
* **rooms:** STAIRWELL-STACK — stop compiling stair shafts as rooms (Terminal, user screenshot ≈ Aras 01 R1) ([#761](https://github.com/red1oon/bim-ootb/issues/761)) ([4f4b10f](https://github.com/red1oon/bim-ootb/commit/4f4b10f01c208ad9f5960fafb2b9168829a797c9))
* **rooms:** Terminal room self-heal (Viewer 0→59 rooms) + Modeller patch loader + needle room injector ([#758](https://github.com/red1oon/bim-ootb/issues/758)) ([d58ef64](https://github.com/red1oon/bim-ootb/commit/d58ef64f2cbfb33261c2658e55bbf534f818f7a2))
* **sw:** bump CACHE_VERSION v745→v746 — split-DB pair fix ([#764](https://github.com/red1oon/bim-ootb/issues/764)) never reached live browsers ([#765](https://github.com/red1oon/bim-ootb/issues/765)) ([46f3a70](https://github.com/red1oon/bim-ootb/commit/46f3a70a60abb182850ce101efb8f9cf2b328726))
* **viewer:** cache-bust room_graph.js v=1→v=2 — occupant graph ([#759](https://github.com/red1oon/bim-ootb/issues/759)) + stair chaining ([#763](https://github.com/red1oon/bim-ootb/issues/763)) never reached returning browsers ([#766](https://github.com/red1oon/bim-ootb/issues/766)) ([80b20fd](https://github.com/red1oon/bim-ootb/commit/80b20fd6136fa4622e812ea4c05b9ad272b2dd83))
* **viewer:** keyboard shortcuts dead on touch-capable desktops + dead Record binding ([#757](https://github.com/red1oon/bim-ootb/issues/757)) ([f7f27e7](https://github.com/red1oon/bim-ootb/commit/f7f27e748129ef2e8b161349854da262c58cc625))
* **viewer:** Room Lens selected-room cuboid — dispose the previous highlight before drawing a new one ([#768](https://github.com/red1oon/bim-ootb/issues/768)) ([6b69dc8](https://github.com/red1oon/bim-ootb/commit/6b69dc8f16ab413a0b5d2581461f12d2c05ea44f))
* **viewer:** split-DB detection requires BOTH meta.db AND geo.db, not meta.db alone ([#764](https://github.com/red1oon/bim-ootb/issues/764)) ([359a86f](https://github.com/red1oon/bim-ootb/commit/359a86f382b3492093396b8cf0f8f3915a1bbe80))

## [1.16.0](https://github.com/red1oon/bim-ootb/compare/v1.15.0...v1.16.0) (2026-07-11)


### ✨ Features

* **disc_walker:** room-type-aware _spaceTypeFor() fallback, gated to measured signal (PLB/FP) ([#738](https://github.com/red1oon/bim-ootb/issues/738)) ([f0f0994](https://github.com/red1oon/bim-ootb/commit/f0f0994d11d7cb9ba99a34a098d70c15aaeefb10))
* **gate:** §UBBL-DEMO — 5th sdg_gate case, static UBBL-style room-size demo indicator (By-Law 42 subset) ([#729](https://github.com/red1oon/bim-ootb/issues/729)) ([a4f1f59](https://github.com/red1oon/bim-ootb/commit/a4f1f59a010d5bfd3c6c0576aaa2ea28fc645e6b))
* **modeller:** §8E-3 routed MEP network render witness + __dwPixelProbe chain-tube fix ([#731](https://github.com/red1oon/bim-ootb/issues/731)) ([9abb845](https://github.com/red1oon/bim-ootb/commit/9abb8452152867ffef86304176694f50349fbaed))
* **modeller:** Building Parts Outliner category (Stairway/Lift Shaft/Plant Room) ([#737](https://github.com/red1oon/bim-ootb/issues/737)) ([8c6c70f](https://github.com/red1oon/bim-ootb/commit/8c6c70fc36b66ff809cdb8ed7d21a87938532a3b))
* **modeller:** Outliner single-click on a category/branch row selects+zooms (Find-panel parity) ([#739](https://github.com/red1oon/bim-ootb/issues/739)) ([4e50be2](https://github.com/red1oon/bim-ootb/commit/4e50be22f64555aa44fa0deef614465b82638e30))
* **viewer:** §7 room-to-room adjacency graph + Dijkstra pathfinding in Find panel ([#746](https://github.com/red1oon/bim-ootb/issues/746)) ([3f6dbbc](https://github.com/red1oon/bim-ootb/commit/3f6dbbce8b5ccf2477829ed33eb1e69a6773dd59))
* **viewer:** Eye icon = Role/Profession view filter (Plumber/Electrician/ACMV/Structural/Cleaner) ([#749](https://github.com/red1oon/bim-ootb/issues/749)) ([cbe6d2b](https://github.com/red1oon/bim-ootb/commit/cbe6d2bacca7a4ee3b40c5f641479d16d41804a4))
* **viewer:** Parts axis (Stairway/Lift Shaft/Plant Room) in Find panel ([#736](https://github.com/red1oon/bim-ootb/issues/736)) ([2058e70](https://github.com/red1oon/bim-ootb/commit/2058e70cb60e9c68a5e4f295cb786e8ff85fda52))


### 🐛 Fixes

* **disc_walker:** dedupe window.__dwPixelProbe, KEEP-BOTH _dwProbeMatch/__dwOcclusionProbe rename ([#743](https://github.com/red1oon/bim-ootb/issues/743)) ([8899174](https://github.com/red1oon/bim-ootb/commit/8899174a2e96814b1dc200b4866d57c867424adb))
* **modeller:** §AXIS-SCOPE — extend yaw/tilt skip to axis 'y' (the Modeller's real 2nd plan axis) ([#722](https://github.com/red1oon/bim-ootb/issues/722)) ([3252d50](https://github.com/red1oon/bim-ootb/commit/3252d5060891ddb4dde5c69d9b912779ff892159))
* **modeller:** glass/window transparency + Outliner collapse discoverability ([#735](https://github.com/red1oon/bim-ootb/issues/735)) ([924d434](https://github.com/red1oon/bim-ootb/commit/924d434d1de39a61cb370a61cb2db0ba52b02622))
* **modeller:** port §TE-ARC-DATUM walk-time z-datum reconciliation + W-DW-DATUM witness ([#726](https://github.com/red1oon/bim-ootb/issues/726)) ([3d09ad6](https://github.com/red1oon/bim-ootb/commit/3d09ad6ef9f6ed0a092e9adab4fe6092b0113e3d))
* **modeller:** witness_dw_rot_units.js — use portable require('playwright') ([#723](https://github.com/red1oon/bim-ootb/issues/723)) ([81f2dbd](https://github.com/red1oon/bim-ootb/commit/81f2dbd68dd7c5861a0807c136c19210eae92acb))
* **tests:** repoint Terminal density/clash witness oracle to Terminal_meta.db ([#741](https://github.com/red1oon/bim-ootb/issues/741)) ([a4c61eb](https://github.com/red1oon/bim-ootb/commit/a4c61ebb83919643ec9a8968d3772da42fdfc444))
* **tests:** retarget W-UX-DISC B5/B6 MEP-refusal oracle SampleCastle -&gt; Clinic + crash-guard the missing-node click ([#742](https://github.com/red1oon/bim-ootb/issues/742)) ([accffaa](https://github.com/red1oon/bim-ootb/commit/accffaa4fac1fc1f1e7a05e092222042b7adc031))
* **viewer,modeller:** Find panel Parts axis — PLANT_ROOM word-boundary + class-gate ([#740](https://github.com/red1oon/bim-ootb/issues/740)) ([9b62c4f](https://github.com/red1oon/bim-ootb/commit/9b62c4f977c6bc35efd12a208b657bd4ca39f2a1))
* **viewer:** add missing viewer/buildings/patches/ copy of the HHS self-heal SQL ([#744](https://github.com/red1oon/bim-ootb/issues/744)) ([79a0f7d](https://github.com/red1oon/bim-ootb/commit/79a0f7d0f2c7b4c40bc5a363baafb8927f4c919f))
* **viewer:** brighter room highlight + visible neon-green path ([#755](https://github.com/red1oon/bim-ootb/issues/755)) ([38d1d8e](https://github.com/red1oon/bim-ootb/commit/38d1d8ee1b95e51a1af4111a36a191508e6667e9))
* **viewer:** bump cache-bust to v=47 + strengthen room highlight further ([#756](https://github.com/red1oon/bim-ootb/issues/756)) ([178aba3](https://github.com/red1oon/bim-ootb/commit/178aba373dd3a34dbb977205e797f1c5bac4f9e4))
* **viewer:** bump navigate_find.js cache-bust to v=46 ([#752](https://github.com/red1oon/bim-ootb/issues/752)) ([353dd7c](https://github.com/red1oon/bim-ootb/commit/353dd7cbd402dc3656beb8ac81c9d05e12e55940))
* **viewer:** Find panel Disc axis + Doc Canvas popup show friendly discipline words, not raw codes ([#748](https://github.com/red1oon/bim-ootb/issues/748)) ([b83c791](https://github.com/red1oon/bim-ootb/commit/b83c791fc6f3203d3480a21ef6fbbabec9e82c57))
* **viewer:** Find panel isolate-tap now reframes the camera, not just visibility-filters ([#745](https://github.com/red1oon/bim-ootb/issues/745)) ([31b2375](https://github.com/red1oon/bim-ootb/commit/31b2375928f632fb65f04a9f907c70c4d4309d9f))
* **viewer:** Find panel visible at onset + rendered above browser top border ([#728](https://github.com/red1oon/bim-ootb/issues/728)) ([d89e559](https://github.com/red1oon/bim-ootb/commit/d89e55983554ce964892459515b94883e22eb268))
* **viewer:** pill master drawers (Navigate/Inspect/Camera-View) render off-screen on mobile ([#727](https://github.com/red1oon/bim-ootb/issues/727)) ([7c8bffa](https://github.com/red1oon/bim-ootb/commit/7c8bffa2a80050879307dbb283403fe39290c561))
* **viewer:** Room Lens habitability filter + Type-view COMPILED fallthrough + HHS self-heal migration ([#732](https://github.com/red1oon/bim-ootb/issues/732)) ([f60bfb7](https://github.com/red1oon/bim-ootb/commit/f60bfb778c6912813459779e72fba8e60ae07571))
* **viewer:** Room Lens renders room_guid-grouped multi-rect volume boxes (ROOM_INJECTION_HYBRID.md §9) ([#733](https://github.com/red1oon/bim-ootb/issues/733)) ([032224b](https://github.com/red1oon/bim-ootb/commit/032224be826d48a85be0f7c52f6fdafa8465a1ef))
* **viewer:** room-tap highlight defaults to purple cuboid, not fragmented real-element seams ([#747](https://github.com/red1oon/bim-ootb/issues/747)) ([dc58d3d](https://github.com/red1oon/bim-ootb/commit/dc58d3dde963db036991ff3450d9d97db7de6b50))


### ♻️ Refactors

* **erp,viewer:** resolve audit stale candidates — 2 removals, 8 deliberate keeps ([#753](https://github.com/red1oon/bim-ootb/issues/753)) ([40e107b](https://github.com/red1oon/bim-ootb/commit/40e107ba7e89c8f3390c11c7c6f4a4cb85392355))
* **trilogy:** remove 29 confirmed-orphan files + unused 22MB OCCT kernel copy (TRILOGY_STALE_CODE_AUDIT follow-up) ([#751](https://github.com/red1oon/bim-ootb/issues/751)) ([c49e66e](https://github.com/red1oon/bim-ootb/commit/c49e66e6a88d7a61047f44ff2a6ebf461d0ae973))
* **viewer:** retire 2d.html DXF plan viewer + exclusive satellites (user directive 2026-07-12) ([#750](https://github.com/red1oon/bim-ootb/issues/750)) ([375bf32](https://github.com/red1oon/bim-ootb/commit/375bf32e63c51aea3858221212ce509104fc53a9))

## [1.15.0](https://github.com/red1oon/bim-ootb/compare/v1.14.0...v1.15.0) (2026-07-10)


### ✨ Features

* **gridmove:** §SCALE-YAW-GUARD — harden GEOM_GRID_MOVE SCALE fold against rotated elements (GRID_ROTATED_SCALE_HARDENING.md §1) ([#721](https://github.com/red1oon/bim-ootb/issues/721)) ([c32692e](https://github.com/red1oon/bim-ootb/commit/c32692e1d83fddbeb83aa2253e15d4915b2c877b))
* **modeller:** embed 8 ARC-only buildings + shared mesh.db resident registry ([6068fab](https://github.com/red1oon/bim-ootb/commit/6068fab40e467934d92da2fef88f4682e444cdf9))


### 🐛 Fixes

* **disc_walker:** correct _eulerMat3 rotation-convention for real 3-axis tilts ([144943b](https://github.com/red1oon/bim-ootb/commit/144943b918268fdb37694c4ed3f7592606c77564))
* **disc_walker:** port true-midpoint + geoDb split-file support from bim-compiler ([8d161fa](https://github.com/red1oon/bim-ootb/commit/8d161fa41a66b38d3de0b69f2e27c987a3411ed3))
* **modeller:** guard grid-drag classification against oblique-yawed elements ([#720](https://github.com/red1oon/bim-ootb/issues/720)) ([67742b2](https://github.com/red1oon/bim-ootb/commit/67742b259b2897c8242a109b6807489beedb6d6f))

## [1.14.0](https://github.com/red1oon/bim-ootb/compare/v1.13.0...v1.14.0) (2026-07-08)


### ✨ Features

* **modeller:** onboard Ifc4_Revit as a new ARC-only resident ([#715](https://github.com/red1oon/bim-ootb/issues/715)) ([2c52f3f](https://github.com/red1oon/bim-ootb/commit/2c52f3fdeb6133cf206c126b8e9125db177417c3))
* **modeller:** Outliner collapse-all — dbl-click the root label folds the tree to the trunk ([#709](https://github.com/red1oon/bim-ootb/issues/709)) ([1cc282f](https://github.com/red1oon/bim-ootb/commit/1cc282ff05dfde43129dae4481da6e0d24b09c47))
* **modeller:** Outliner group select — dbl-click a category/group header selects the whole group (W-E2E-OL-GROUPSELECT) ([#713](https://github.com/red1oon/bim-ootb/issues/713)) ([c6bfd7d](https://github.com/red1oon/bim-ootb/commit/c6bfd7dc5ea25d469fa65a259e462b7800a30e6f))
* **modeller:** zoom-to-selection — port Viewer Find panel's frame-fly, Z-up adapted (W-E2E-ZOOMSEL) ([#711](https://github.com/red1oon/bim-ootb/issues/711)) ([fab731b](https://github.com/red1oon/bim-ootb/commit/fab731b3a4f5abccdddcd2b935d7a9e72f2ee588))


### 🐛 Fixes

* **modeller:** apply proven Terminal_geo.db mesh dedup — 96.1MB saved ([#714](https://github.com/red1oon/bim-ootb/issues/714)) ([9657a9c](https://github.com/red1oon/bim-ootb/commit/9657a9cfa5cdd1ebc4aaf7451124b0ad23be14ee))
* **modeller:** eager IndexedDB store creation — kills a ~28-30s open stall ([#716](https://github.com/red1oon/bim-ootb/issues/716)) ([faf0219](https://github.com/red1oon/bim-ootb/commit/faf021994ad2653707102b0187b283b9c504f3e6))
* **modeller:** grid-drag smart element scope + numeric sandbox proof ([#718](https://github.com/red1oon/bim-ootb/issues/718)) ([f028387](https://github.com/red1oon/bim-ootb/commit/f028387b3b63d19714a151399329d68f8439fc17))
* **modeller:** strip all 4 residents to ARC-only + repair mep_rw.db copy ([#712](https://github.com/red1oon/bim-ootb/issues/712)) ([b93ca13](https://github.com/red1oon/bim-ootb/commit/b93ca1320d8c096b163107a0ea7b7e4577fe0a82))
* **modeller:** thread hostBind's real yaw into _renderDiscWalk (Bug B, §ROTATION-BOUND) ([#717](https://github.com/red1oon/bim-ootb/issues/717)) ([aaa4517](https://github.com/red1oon/bim-ootb/commit/aaa4517c021152c1877fea94d4efb7fe4aa1f7fb))

## [1.13.0](https://github.com/red1oon/bim-ootb/compare/v1.12.0...v1.13.0) (2026-07-08)


### ✨ Features

* **modeller:** arc sketch primitive — FreeCAD "Arc by center" 3-click placement, sector-closure extrude ([#701](https://github.com/red1oon/bim-ootb/issues/701)) ([768db43](https://github.com/red1oon/bim-ootb/commit/768db43fac6b0a39c7b89cc02a199e8a6ae0496e))
* **modeller:** circle sketch primitive — center+radius placement, #dim-radius, makeCircleEdge extrude ([#699](https://github.com/red1oon/bim-ootb/issues/699)) ([2e862cb](https://github.com/red1oon/bim-ootb/commit/2e862cb1a217717d9f08b259be3ae97223140e56))
* **modeller:** p2p_coincident sketch vertex weld ([#696](https://github.com/red1oon/bim-ootb/issues/696)) ([5807c5b](https://github.com/red1oon/bim-ootb/commit/5807c5bfb58b2d6ba141a2b67cf00a910f94dfb6))
* **modeller:** sketch height proof + l2l_angle_ll corner-angle constraint ([#695](https://github.com/red1oon/bim-ootb/issues/695)) ([461f1ab](https://github.com/red1oon/bim-ootb/commit/461f1ab18b40e0cbbdd2296f4d80930cda0821ff))
* **modeller:** tangent-to-gridline circle snap — first real planegcs circle constraint (tangent_lc) ([#702](https://github.com/red1oon/bim-ootb/issues/702)) ([aff1f0c](https://github.com/red1oon/bim-ootb/commit/aff1f0c0ba22c2e177db9832ab2c505bfac221fd))
* **modeller:** wire p2p_distance sketch dimension + fix invisible dim-* toolbar fields ([#694](https://github.com/red1oon/bim-ootb/issues/694)) ([e8aa3d6](https://github.com/red1oon/bim-ootb/commit/e8aa3d611c0b56e63e1ed553403432c8e544318d))


### 🐛 Fixes

* **modeller:** de-duplicate Ctrl+Z/Ctrl+Y — one keypress fired two undos ([#707](https://github.com/red1oon/bim-ootb/issues/707)) ([1c58348](https://github.com/red1oon/bim-ootb/commit/1c58348903c79669cf70b3c0a0ad2167191a76f4))
* **modeller:** MEP fixture placement refuses, never invents, an unmatched box ([#708](https://github.com/red1oon/bim-ootb/issues/708)) ([4af60c4](https://github.com/red1oon/bim-ootb/commit/4af60c402a52563d6edbfd7358399264ccbd9b9a))
* **modeller:** oplog load paths (restore/reload/setModelKey) no longer autosave just-loaded bytes back to storage ([#705](https://github.com/red1oon/bim-ootb/issues/705)) ([1c14e1f](https://github.com/red1oon/bim-ootb/commit/1c14e1f3f86f34d9d2ad08d618208794fe12c033))
* **modeller:** oplog.clear() purges IDB fallback; stop re-attempting doomed localStorage.setItem ([#703](https://github.com/red1oon/bim-ootb/issues/703)) ([cfe491f](https://github.com/red1oon/bim-ootb/commit/cfe491f227be07aaf403ef062f27976e62271135))
* **viewer:** port real-placement gate from modeller PR [#693](https://github.com/red1oon/bim-ootb/issues/693) — kill hardcoded 0.15 fixture box ([#697](https://github.com/red1oon/bim-ootb/issues/697)) ([23e292e](https://github.com/red1oon/bim-ootb/commit/23e292ed1b1f1801681195bea572801890e8e2aa))


### 📝 Documentation

* **modeller:** update in-app User Guide — Move & Manipulate, sketch dimension typing, Circle mode ([#700](https://github.com/red1oon/bim-ootb/issues/700)) ([327c879](https://github.com/red1oon/bim-ootb/commit/327c879e88dedb180a72d918d3bb15d52c9f6ebe))

## [1.12.0](https://github.com/red1oon/bim-ootb/compare/v1.11.0...v1.12.0) (2026-07-07)


### ✨ Features

* **bonsai:** GEOM_ARRAY — array/pattern op family (W-BONSAI-ARRAY) ([#685](https://github.com/red1oon/bim-ootb/issues/685)) ([b788d13](https://github.com/red1oon/bim-ootb/commit/b788d13c9e4353e7226a5282f95fb7a01bf7bd5f))
* **bonsai:** GEOM_LOFT — loft op family (W-BONSAI-LOFT) ([#688](https://github.com/red1oon/bim-ootb/issues/688)) ([d1d771e](https://github.com/red1oon/bim-ootb/commit/d1d771eb9a873098c416cbf87cd254fcd759425e))
* **bonsai:** Tier 1 kernel shoulders — REVOLVE/SHELL/OFFSET/FILLET_VARIABLE/CHAMFER_DIST_ANGLE/DRAFT (W-BONSAI-TIER1) ([#691](https://github.com/red1oon/bim-ootb/issues/691)) ([bccea6d](https://github.com/red1oon/bim-ootb/commit/bccea6dcd2b732fc065e2b19d9b6701af8bd2294))
* **modeller:** M1 — bridge ARC-derived anchors into routewalker.js's pattern engine ([#683](https://github.com/red1oon/bim-ootb/issues/683)) ([a5a514c](https://github.com/red1oon/bim-ootb/commit/a5a514c941928fddb2d6c5b0ac09e3e581b551d2))
* **modeller:** M4 — construction reveal over M1's PLB pattern-bridge network ([#686](https://github.com/red1oon/bim-ootb/issues/686)) ([fb0cfaa](https://github.com/red1oon/bim-ootb/commit/fb0cfaadd1857ee3774a02a68203c8e0409f684d))
* **modeller:** M5 — elbow/tee fitting placement at MEP bends ([#689](https://github.com/red1oon/bim-ootb/issues/689)) ([9d0938e](https://github.com/red1oon/bim-ootb/commit/9d0938ea53d9d863982b219e4c30cd103db08a9f))
* **modeller:** wire real MEP mini-BOM rotation lookup ahead of bisector fallback ([#690](https://github.com/red1oon/bim-ootb/issues/690)) ([7a8e71d](https://github.com/red1oon/bim-ootb/commit/7a8e71db684cee811cb043aaf8e2e47de8810ebd))


### 🐛 Fixes

* **modeller:** M2 follow-up — close the real STR-column clash gap in the PLB pattern bridge ([#684](https://github.com/red1oon/bim-ootb/issues/684)) ([3b3a4c9](https://github.com/red1oon/bim-ootb/commit/3b3a4c9a5bbf5ed224099aa724536d28ff349433))

## [1.11.0](https://github.com/red1oon/bim-ootb/compare/v1.10.0...v1.11.0) (2026-07-06)


### ✨ Features

* **hba:** camera-POV-assume-flight — the 6 declared facing vectors, wired ([#674](https://github.com/red1oon/bim-ootb/issues/674)) ([77f41b9](https://github.com/red1oon/bim-ootb/commit/77f41b9b606c9aa727b98f1693126d903663e31b))
* **hba:** sensor click toggles device-view/nearest-camera POV; closer camera-tile zoom; realistic IoT bars ([#671](https://github.com/red1oon/bim-ootb/issues/671)) ([a872078](https://github.com/red1oon/bim-ootb/commit/a8720789bb3c091d9ed0a381402fa90ff7860c51))
* **modeller:** wire the World-History "W" pill (RESUME_WORLD_HISTORY_DEDUP_RESTORE.md 4-step handoff) ([#678](https://github.com/red1oon/bim-ootb/issues/678)) ([488fcf0](https://github.com/red1oon/bim-ootb/commit/488fcf0111c17222c00c8a5c706b3afb50e2f591))
* **viewer:** pill rail reorg — 4 real drawers, Shadow+Ground merge, dead-icon cleanup ([#667](https://github.com/red1oon/bim-ootb/issues/667)) ([409a445](https://github.com/red1oon/bim-ootb/commit/409a445a500ad4addb76cb7b46e2256fabe32f3f))


### 🐛 Fixes

* **hba:** outline shine-through + panel cascade + IoT phase offset (§2026-07-06c A/B/C) ([#677](https://github.com/red1oon/bim-ootb/issues/677)) ([89f5aa6](https://github.com/red1oon/bim-ootb/commit/89f5aa6f29c5d6f889d6342d6e85e279856e24d7))
* **hba:** recover orphaned IoT device-mesh commits (§2026-07-06c/d/e item D-followup + E) ([#679](https://github.com/red1oon/bim-ootb/issues/679)) ([234d41c](https://github.com/red1oon/bim-ootb/commit/234d41cc1141000832b7ce1b4d77001e3e59dd15))
* **hba:** sensor 2nd-click = exact webcam POV; bar jitter now genuinely fluctuates ([#681](https://github.com/red1oon/bim-ootb/issues/681)) ([0d84bca](https://github.com/red1oon/bim-ootb/commit/0d84bca0d36fcf553dd492dbfc1434e201ef4946))
* **hba:** Unit Class outline box now uses A.ifc2three (was rendering outside the building) ([#668](https://github.com/red1oon/bim-ootb/issues/668)) ([14154c8](https://github.com/red1oon/bim-ootb/commit/14154c84c340362429dcd9c48e36f377b0465c33))
* **offline-gateway:** stop 3 always-network requests once data is already cached ([#666](https://github.com/red1oon/bim-ootb/issues/666)) ([c5ffc08](https://github.com/red1oon/bim-ootb/commit/c5ffc08933566e497b6401b8786a8ce574f3a944))
* **viewer:** &gt;50k selection uses cheap filter instead of heavy X-Ray; kill pill-rail auto-reorder ([#672](https://github.com/red1oon/bim-ootb/issues/672)) ([7408ada](https://github.com/red1oon/bim-ootb/commit/7408ada65b4f4bd0e413ce375a37a588128b9807))
* **viewer:** generalize pill-highlight desync fix + panel abstraction (Human-Asset pill) ([#682](https://github.com/red1oon/bim-ootb/issues/682)) ([01d8932](https://github.com/red1oon/bim-ootb/commit/01d89322679a776a6c8f30d149a40673ad9faeb2))
* **viewer:** pill-drawer followup (master de-highlight, keyboard activate, Shadow+Ground) + Help icon-only footer ([#673](https://github.com/red1oon/bim-ootb/issues/673)) ([953d1e4](https://github.com/red1oon/bim-ootb/commit/953d1e427283ab94bb5c7ffaba0810c6f059bbba))
* **viewer:** undo no longer forks new History-bar dots for read-only crumbs ([#670](https://github.com/red1oon/bim-ootb/issues/670)) ([d6bfb80](https://github.com/red1oon/bim-ootb/commit/d6bfb8078f13d665ff0d9e2506b312dcb2fdbff8))

## [1.10.0](https://github.com/red1oon/bim-ootb/compare/v1.9.0...v1.10.0) (2026-07-05)


### ✨ Features

* **hba:** class-tint perimeter outline (real IfcSpace footprint) + mobile card-stack spec ([#659](https://github.com/red1oon/bim-ootb/issues/659)) ([e8dff13](https://github.com/red1oon/bim-ootb/commit/e8dff130af97bab672ed6ac87c71f5254b4174c5))
* **hba:** Construction AD_Window + Person forward link + Leave-as-Resource ([#645](https://github.com/red1oon/bim-ootb/issues/645)) ([e854a0e](https://github.com/red1oon/bim-ootb/commit/e854a0e14e3057ec173e1c6a189cf596286e364b))
* **hba:** IoT audio sirens (§P10c) + wider device zoom + movement/PIR sensor ([#653](https://github.com/red1oon/bim-ootb/issues/653)) ([af782ec](https://github.com/red1oon/bim-ootb/commit/af782ecd26fdee3d5586d4b502dac92a44485c92))
* **hba:** IoT per-device positions + Product/Order persistence + orange highlight + USD/RM ([#652](https://github.com/red1oon/bim-ootb/issues/652)) ([d6e82e3](https://github.com/red1oon/bim-ootb/commit/d6e82e37c6206fd2318b4113e435312207fbee29))
* **hba:** IoT per-sensor icons + camerasNearDevice connector + docs guide ([#655](https://github.com/red1oon/bim-ootb/issues/655)) ([2bdc241](https://github.com/red1oon/bim-ootb/commit/2bdc241060334b8b17c1bf9291175612c313c5a6))
* **hba:** mobile card-stack host for the 6 Human-Asset panes (item0) ([#662](https://github.com/red1oon/bim-ootb/issues/662)) ([37b293f](https://github.com/red1oon/bim-ootb/commit/37b293f77f9dc21a1b23d3eb543e57f94e2d501f))
* **iot:** IFC/LOD/ — real free LOD device objects (CCTV/sensor/solar/electrical) POC ([#651](https://github.com/red1oon/bim-ootb/issues/651)) ([bd76e9d](https://github.com/red1oon/bim-ootb/commit/bd76e9d31d9c423c77abdc479782df6521c52511))
* **landing:** version-merge popup — catalog-similarity detection for repeat IFC drops ([#657](https://github.com/red1oon/bim-ootb/issues/657)) ([17f0791](https://github.com/red1oon/bim-ootb/commit/17f079164219bacd75958ad11047dc86dafc68ff))
* **modeller:** §PREDRAG — grid-drag green/orange opt-out preview + live stretch-ride tint fix ([#656](https://github.com/red1oon/bim-ootb/issues/656)) ([8093e9a](https://github.com/red1oon/bim-ootb/commit/8093e9a6a3e27466841ea9a1f8776a195ef578db))
* **modeller:** abuts-realign ORANGE — first W-SDG-BACKPROP slice ([#647](https://github.com/red1oon/bim-ootb/issues/647)) ([665d1a6](https://github.com/red1oon/bim-ootb/commit/665d1a6bbeefe031d4b070f139de1d4f96a1c053))
* **modeller:** door-crush RED — hosted openings can be crushed by a wall shrink, not just slide out ([#646](https://github.com/red1oon/bim-ootb/issues/646)) ([a2567f6](https://github.com/red1oon/bim-ootb/commit/a2567f6ed917e062de579b89c0cb4878b598de0e))
* **modeller:** Save = validated snapshot promotion (clash-check + auto-heal + gated physical-DB write) ([#658](https://github.com/red1oon/bim-ootb/issues/658)) ([9e5e400](https://github.com/red1oon/bim-ootb/commit/9e5e40005eba9fc51afa8be6977f30b5f4d53135))


### 🐛 Fixes

* **modeller:** #b-clear leaks STR-walker module state into later grid-drags ([#644](https://github.com/red1oon/bim-ootb/issues/644)) ([587622c](https://github.com/red1oon/bim-ootb/commit/587622c909599fb0b086f7301c8599ca0c16d9cd))
* **modeller:** #b-clear round 2 — reset swXEdges, DiscWalker globals, BOM-tree State ([#649](https://github.com/red1oon/bim-ootb/issues/649)) ([1672238](https://github.com/red1oon/bim-ootb/commit/1672238ab25359e2c0d535bf81a1458468881df0))
* **modeller:** cross_edges.js abuts uses real per-element AABB, not coarse bbox ([#650](https://github.com/red1oon/bim-ootb/issues/650)) ([eaae683](https://github.com/red1oon/bim-ootb/commit/eaae6837352ff0b40cc46d3e24faa056aa1ebe03))


### 📝 Documentation

* **modeller:** add Conformity Gate section to in-app User Guide ([#648](https://github.com/red1oon/bim-ootb/issues/648)) ([6a49c6c](https://github.com/red1oon/bim-ootb/commit/6a49c6c751e3d3ced3ec2866e57fe3ee5b2db0db))

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
