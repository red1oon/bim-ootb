# Changelog

All notable, user-facing changes are batched here by [release-please](https://github.com/googleapis/release-please)
from our conventional-commit prefixes (`feat` → minor, `fix`/`docs` → patch, `feat!`/`BREAKING CHANGE` → major).
The per-deploy build id (`erp/sw.js` `CACHE_VERSION` = `vNNN`) is separate — a cache-bust id, not a release.

## [1.33.0](https://github.com/red1oon/bim-ootb/compare/v1.32.0...v1.33.0) (2026-07-30)


### ✨ Features

* **cinema:** §CPE_AIM_DEPTH — face the furthest facade when boxed in, not the closest fleeting one ([#1101](https://github.com/red1oon/bim-ootb/issues/1101)) ([2bc17d1](https://github.com/red1oon/bim-ootb/commit/2bc17d137d09526e84f625e7fbc39440f8499699))
* **modeller:** §ANCHOR — void-consumed hosts as invisible ride anchors (user-approved, guardrailed) ([#1095](https://github.com/red1oon/bim-ootb/issues/1095)) ([03891df](https://github.com/red1oon/bim-ootb/commit/03891df275184bed9312ce18ec333fb7713593b5))
* **modeller:** §LOD400-LAYERS — layered walls reach the live residents + envelope refusal ([#1096](https://github.com/red1oon/bim-ootb/issues/1096)) ([8bf6035](https://github.com/red1oon/bim-ootb/commit/8bf6035e04c0f877ccd2f84227688611b393dd0a))


### 🐛 Fixes

* **4D:** §4D_FACADE_ORDER — populate the in-file SEQUENCE_NAME_OVERRIDES default (viewer.html never fetches the JSON) ([#1100](https://github.com/red1oon/bim-ootb/issues/1100)) ([1864c4c](https://github.com/red1oon/bim-ootb/commit/1864c4cb5b7ea7552f849dbfb172e72122be0121))
* **4D:** glazed curtain-wall panels no longer erect before their host wall ([#1098](https://github.com/red1oon/bim-ootb/issues/1098)) ([c51cfcf](https://github.com/red1oon/bim-ootb/commit/c51cfcf57b54f08befd37ecc763acc664c6a9b9e))
* **cinema:** §CPE_AIM_DEPTH — incoming-seam taper + buildup guard, radii clamp partial ([#1103](https://github.com/red1oon/bim-ootb/issues/1103)) ([05f39f1](https://github.com/red1oon/bim-ootb/commit/05f39f15ee9dde16e034a5e97deb38b6188e6849))
* **cinema:** §CPE_HOSE_LENGTH_BLIND — the editor costed a curve that is never flown ([#1107](https://github.com/red1oon/bim-ootb/issues/1107)) ([4d3aa7d](https://github.com/red1oon/bim-ootb/commit/4d3aa7d3d08d4a46467fb03309dfae7ebcf6f146))
* **cinema:** §CPE_REOPEN_NODE — the added node survives OK, and an unselected stick is dark blue ([#1104](https://github.com/red1oon/bim-ootb/issues/1104)) ([6ed67f8](https://github.com/red1oon/bim-ootb/commit/6ed67f83392caf4b9ea2b32f6f174e7b35eede55))
* **cinema:** §CPE_ROOM_TITLE_HEIGHT_BLIND — a title named the room you were flying OVER ([#1108](https://github.com/red1oon/bim-ootb/issues/1108)) ([ef7caf3](https://github.com/red1oon/bim-ootb/commit/ef7caf3a34266376045292bb1b5b933f3723b627))
* **cinema:** §CPE_STICK_RED_BAR — a stick is a RED bar with BLUE dots, not an all-blue smudge ([#1105](https://github.com/red1oon/bim-ootb/issues/1105)) ([d8209ac](https://github.com/red1oon/bim-ootb/commit/d8209acdd0d05662d99d572a141299d9ba62c2d8))
* **modeller:** row 33 — withdraw the partial layer ship; §LAYER-GATE refuses the 2 clip-trimmed party walls loudly (W-E2E-LAYERS-RESIDENTS 8/8 vs LIVE, RED-first) ([#1099](https://github.com/red1oon/bim-ootb/issues/1099)) ([3f29f15](https://github.com/red1oon/bim-ootb/commit/3f29f159d40f6142c417007c225a021e62db50a4))
* **modeller:** row 33 exception ruling — the two clipped party walls come back as 5 real slabs (W-E2E-LAYERS-RESIDENTS 8/8 vs LIVE, RED-first) ([#1102](https://github.com/red1oon/bim-ootb/issues/1102)) ([7cfedab](https://github.com/red1oon/bim-ootb/commit/7cfedabf778b9c3fa55b968407dbaae8ea56abd8))
* **seams:** §F2 IDB cache version drift — 4D/5D re-download + ERP persist loss ([#1106](https://github.com/red1oon/bim-ootb/issues/1106)) ([d2766f5](https://github.com/red1oon/bim-ootb/commit/d2766f51db5d418fc09b43cffedd21c4a94977c5))

## [1.32.0](https://github.com/red1oon/bim-ootb/compare/v1.31.0...v1.32.0) (2026-07-30)


### ✨ Features

* **viewer:** §CPE_ROOM_TITLE — the Film-Maker names the room as the camera enters it ([#1089](https://github.com/red1oon/bim-ootb/issues/1089)) ([aefcb1c](https://github.com/red1oon/bim-ootb/commit/aefcb1c7c87bc12efa2017ac1826fabbea2d5626))
* **viewer:** §HOVER_NAME — hover the model, see friendly name + room ([#1085](https://github.com/red1oon/bim-ootb/issues/1085)) ([609139b](https://github.com/red1oon/bim-ootb/commit/609139b77f4b5017318e2e72d33b875d5a9c6899))
* **viewer:** §SCENE_MERGE — File Open offers "merge into the current scene" instead of navigating away ([#1093](https://github.com/red1oon/bim-ootb/issues/1093)) ([3f41d18](https://github.com/red1oon/bim-ootb/commit/3f41d1848b5cf1ec366a26f32c797c697a464325))


### 🐛 Fixes

* **import:** bbox from vertices without Math.max.apply + bbox-ghost fallback for envelope-less models ([#1086](https://github.com/red1oon/bim-ootb/issues/1086)) ([6299772](https://github.com/red1oon/bim-ootb/commit/6299772345c1a7302c83d99043481989e6f1d894))
* **modeller:** §GEO-SERVED — the live Modeller never received its mesh file, so it drew bounding boxes ([#1090](https://github.com/red1oon/bim-ootb/issues/1090)) ([84d9878](https://github.com/red1oon/bim-ootb/commit/84d9878b0fdc297fa889319165d699486a4646be))
* **modeller:** bump service-worker cache v37→v38 so the §GEO-SERVED fix actually reaches a returning browser ([#1091](https://github.com/red1oon/bim-ootb/issues/1091)) ([be88cce](https://github.com/red1oon/bim-ootb/commit/be88cced1716536b89f2ae109fe70d6fb01e8921))
* **modeller:** Walk-ALL tooltip + proxy-mode toast + §SEL-TINT-REFOLD ([#1094](https://github.com/red1oon/bim-ootb/issues/1094)) ([31206ac](https://github.com/red1oon/bim-ootb/commit/31206ace771691936c96c5990a86125a2cd86ba5))
* **viewer:** §CACHE_KEY — stop re-downloading a building that's already in IndexedDB ([#1088](https://github.com/red1oon/bim-ootb/issues/1088)) ([b236e9e](https://github.com/red1oon/bim-ootb/commit/b236e9e0bee0a408ab2cdb1058ca0ca3ad743278))

## [1.31.0](https://github.com/red1oon/bim-ootb/compare/v1.30.0...v1.31.0) (2026-07-28)


### ✨ Features

* **cinema:** §CPE_BUILDUP_REAL_SCHEDULE — reveal by the REAL schedule when one exists ([#1078](https://github.com/red1oon/bim-ootb/issues/1078)) ([3d440e5](https://github.com/red1oon/bim-ootb/commit/3d440e55c066cbc42e4d6bd6a8032e573bcc4b68))
* **ifc:** KUL/ stress-test README + reusable large-IFC preflight script ([#1076](https://github.com/red1oon/bim-ootb/issues/1076)) ([79a0d79](https://github.com/red1oon/bim-ootb/commit/79a0d790c1d97f3aba49518b9972621a22c4f6e3))
* **ifc:** preflight script also reports unique-shape vs placed-instance counts ([#1077](https://github.com/red1oon/bim-ootb/issues/1077)) ([11cebad](https://github.com/red1oon/bim-ootb/commit/11cebad147f6dec0ea901811f1361254e922ba05))
* **photoreal:** §BILLBOARD_NAME_ELEMENT — the name plate is a real element, revealed last ([#1079](https://github.com/red1oon/bim-ootb/issues/1079)) ([c620bfc](https://github.com/red1oon/bim-ootb/commit/c620bfc251addf49fb9cb75a8fb70d801ba6e396))


### 🐛 Fixes

* **buildings:** restore HHS_Office_Federated_extracted.db — PR [#1071](https://github.com/red1oon/bim-ootb/issues/1071) replaced it with a symlink ([#1073](https://github.com/red1oon/bim-ootb/issues/1073)) ([5de3562](https://github.com/red1oon/bim-ootb/commit/5de3562f2248414a955c882e50437b0ad5edfc21))
* **cinema:** §CPE_CLICK_SLOP — a 4px click on the pipe spawns a stick again ([#1083](https://github.com/red1oon/bim-ootb/issues/1083)) ([58ef91f](https://github.com/red1oon/bim-ootb/commit/58ef91f74b3b805e9b8bd5abe38a82b440b3956f))
* **cinema:** §CPE_REOPEN_DOUBLE — re-open ADOPTS the authored bands instead of re-seeding them ([#1081](https://github.com/red1oon/bim-ootb/issues/1081)) ([994c0d6](https://github.com/red1oon/bim-ootb/commit/994c0d6f7baf8bf436b05708200de40e57f5b181))


### ⚡ Performance

* **viewer:** MergedMesh low-draw path restored (GUID-exact) + HBA opt-in — mobile LTU ([#1071](https://github.com/red1oon/bim-ootb/issues/1071)) ([f091f26](https://github.com/red1oon/bim-ootb/commit/f091f26a5ced174c188ffd2347befbe41ebf68f7))

## [1.30.0](https://github.com/red1oon/bim-ootb/compare/v1.29.0...v1.30.0) (2026-07-27)


### ✨ Features

* **night:** §NIGHT_LIGHT_MIX + §NIGHT_MIX_RATIO — mixed colour temperature ([#1055](https://github.com/red1oon/bim-ootb/issues/1055)) ([a6c6caa](https://github.com/red1oon/bim-ootb/commit/a6c6caa45b02581e334733a5fef4f679cda8e59a))
* **night:** §PHOTO_GLOW_SPRITE — luminaires light up in night mode, without touching a scene material ([#1057](https://github.com/red1oon/bim-ootb/issues/1057)) ([2941984](https://github.com/red1oon/bim-ootb/commit/294198430d579b37dd1a20d4b840cb6707e47dc2))
* **photoreal:** §BILLBOARD_ART — billboard artwork quad, PNG-from-DB-folder with a notice fallback ([#1066](https://github.com/red1oon/bim-ootb/issues/1066)) ([9345273](https://github.com/red1oon/bim-ootb/commit/9345273a5f471cd49fb17b40e015f8305e8ac792))
* **photoreal:** §BILLBOARD_SOURCE + §BILLBOARD_FIT + §BILLBOARD_ALWAYS ([#1069](https://github.com/red1oon/bim-ootb/issues/1069)) ([38753c0](https://github.com/red1oon/bim-ootb/commit/38753c0a98794c899b69220761699ccf00cfce16))
* **photoreal:** §FACADE_WARM_COOL — the facade wash stops contradicting the scene's own two illuminants ([#1064](https://github.com/red1oon/bim-ootb/issues/1064)) ([41d3523](https://github.com/red1oon/bim-ootb/commit/41d35234805b445c2e3b19bb068cdccfd07bf265))
* **viewer:** add Blank Viewer card to the Buildings/IFC hub ([#1068](https://github.com/red1oon/bim-ootb/issues/1068)) ([fbcd47c](https://github.com/red1oon/bim-ootb/commit/fbcd47ca4b8afba48890cc5d22c4dfe09e42a1aa))


### 🐛 Fixes

* **cinema:** §CINEMA_LOOKAHEAD_ARC — remove the look-ahead threshold that WAS the jerk ([#1044](https://github.com/red1oon/bim-ootb/issues/1044)) ([0eda490](https://github.com/red1oon/bim-ootb/commit/0eda490a06dd02b5e167848debf30102026c3db3))
* **cinema:** §CPE_NOISE_LAW + drag scale/land-first + basis pin ([#1050](https://github.com/red1oon/bim-ootb/issues/1050)) ([2243034](https://github.com/red1oon/bim-ootb/commit/2243034d8d129cded55ca1a495d2d4f22e326e4e))
* **cinema:** §CPE_PREVIEW_AFTER + P4 rotation gate + §CPE_DRAG_TRACK ([#1052](https://github.com/red1oon/bim-ootb/issues/1052)) ([998750e](https://github.com/red1oon/bim-ootb/commit/998750e9422097ac848aee1c054e9b4bcca7e0f0))
* **cinema:** turn budget + longer bars + the instrument bug that hid both ([#1047](https://github.com/red1oon/bim-ootb/issues/1047)) ([fa6d251](https://github.com/red1oon/bim-ootb/commit/fa6d251dc92158d15405d001430f6b4ac2630ac3))
* **maxq:** §MAXQ_ETA_TICK — progress readout driven by measured time, not frame count ([#1046](https://github.com/red1oon/bim-ootb/issues/1046)) ([de11b91](https://github.com/red1oon/bim-ootb/commit/de11b9145e7290fb5354c766c71c6dfaa0d0d247))
* **maxq:** hidden-tab pause + §PHOTO_EMBER/§PHOTO_BLOOM + night-mode luminaire fixes ([#1054](https://github.com/red1oon/bim-ootb/issues/1054)) ([1d1f3ff](https://github.com/red1oon/bim-ootb/commit/1d1f3ff26614ef11bfd8b622f816a3ba25c53d75))
* **modeller:** IFC-opened buildings render ZERO ARC geometry — seed the editable substrate ([#1062](https://github.com/red1oon/bim-ootb/issues/1062)) ([be5da13](https://github.com/red1oon/bim-ootb/commit/be5da13f1fe45f9a560696245809a4d31c98467b))
* **modeller:** ship rel_fills_host for Duplex + SampleHouse — hosted doors actually ride now ([#1065](https://github.com/red1oon/bim-ootb/issues/1065)) ([c49c057](https://github.com/red1oon/bim-ootb/commit/c49c0577d68c5fdbdb34fd1a5829120f166db9b2))
* **modeller:** ship SampleCastle rel_fills_host — stretchRide no longer no-ops for lack of the table ([#1051](https://github.com/red1oon/bim-ootb/issues/1051)) ([8de0644](https://github.com/red1oon/bim-ootb/commit/8de06447aba8bcda391c02d2165bb3714788f892))
* **night:** §GLOW_EMIT_DOWN — recessed troffers and downlights were lit inside the ceiling ([#1058](https://github.com/red1oon/bim-ootb/issues/1058)) ([51c0a01](https://github.com/red1oon/bim-ootb/commit/51c0a0103bb6d3abb43c30da82c448bb4e41d192))
* **night+bloom:** §BLOOM_BLACK_BOXES, §NIGHT_DIFFUSER, §LUM_VARIANT, §NIGHT_ROLE_EXCLUDE ([#1059](https://github.com/red1oon/bim-ootb/issues/1059)) ([5d6b2f3](https://github.com/red1oon/bim-ootb/commit/5d6b2f33ba6af2dac5a478347beb49f3490cd246))
* **photoreal:** §GROUND_ALBEDO + §GROUND_COLOR_ORDER_FIX — the evening ground was at 1/3 brightness ([#1063](https://github.com/red1oon/bim-ootb/issues/1063)) ([10059e2](https://github.com/red1oon/bim-ootb/commit/10059e2e36fc67e66e85ff4bc09b8c74b7d7ebee))
* **sw:** bump CACHE_VERSION v865-&gt;v866 + tools/effects/streaming ?v= — the fix was on main, the browser never got it ([#1061](https://github.com/red1oon/bim-ootb/issues/1061)) ([4b38804](https://github.com/red1oon/bim-ootb/commit/4b38804470c3cb33b056ee36739f0031411a5c23))


### 📝 Documentation

* **cinema:** §CPE_DRAG_TRACK — record WHY the amplification is wanted ([#1053](https://github.com/red1oon/bim-ootb/issues/1053)) ([432a049](https://github.com/red1oon/bim-ootb/commit/432a049c8d59edd8301a832a8da3a36683e14e3a))
* **readme:** announce BIM OOTB Film-Maker (Alt+C), link the demo film ([#1049](https://github.com/red1oon/bim-ootb/issues/1049)) ([970414f](https://github.com/red1oon/bim-ootb/commit/970414f1c16a526cf107a310c54001e0e9aeead0))


### ⏪ Reverts

* **night:** strip every scene-material write and the material-cache split ([#1060](https://github.com/red1oon/bim-ootb/issues/1060)) ([33e7718](https://github.com/red1oon/bim-ootb/commit/33e77182afca06cc4cfba714387451e35b6d4889))
* **photoreal:** §PHOTO_EMBER_DISARMED — turn the still-lighting batch OFF pending a dedicated session ([#1056](https://github.com/red1oon/bim-ootb/issues/1056)) ([819863e](https://github.com/red1oon/bim-ootb/commit/819863e9b86846b161df6cbc0772cb1bebe10f7f))
* **precision-cam:** remove §RESET_AMBIENT_AUTO entirely — pivot went haywire in real use ([#1048](https://github.com/red1oon/bim-ootb/issues/1048)) ([bac40e6](https://github.com/red1oon/bim-ootb/commit/bac40e6ca6544f42ed58e111dc121debb4e68765))

## [1.29.0](https://github.com/red1oon/bim-ootb/compare/v1.28.0...v1.29.0) (2026-07-27)


### ✨ Features

* **cinema:** §CINEMA_PATH_EDITOR — waypoint editor in the Alt+C gap ([#1023](https://github.com/red1oon/bim-ootb/issues/1023)) ([08bbd3e](https://github.com/red1oon/bim-ootb/commit/08bbd3e6c2692a2d9f4eeff1c9e30dc9766e7e9a))
* **cinema:** §CPE_BANDS — rigid bands, tangent-matched connectors, full-film tube ([#1026](https://github.com/red1oon/bim-ootb/issues/1026)) ([ecbeacc](https://github.com/red1oon/bim-ootb/commit/ecbeacc9660c6772217166030290e8454f65a429))
* **cinema:** §CPE_EVEN_TURN + §CPE_SEAM_CONTINUOUS + §CPE_UNDO ([#1042](https://github.com/red1oon/bim-ootb/issues/1042)) ([5687e14](https://github.com/red1oon/bim-ootb/commit/5687e1436e717f4a41c8bf5ee718591c182b26e8))
* **cinema:** §CPE_PANEL_DRAG — the path editor panel moves by its header ([#1030](https://github.com/red1oon/bim-ootb/issues/1030)) ([1456d9a](https://github.com/red1oon/bim-ootb/commit/1456d9a83bd8fee8427b562883a66661ab06054d))
* **cinema:** §CPE_SCREEN_PLANE drag + §CPE_PACING derived duration ([#1027](https://github.com/red1oon/bim-ootb/issues/1027)) ([8c310eb](https://github.com/red1oon/bim-ootb/commit/8c310eb8efe0d380abad69c721a98b7460d827fc))
* **cinema:** §CPE_WALK 2.3m/s base pace + §CPE_DRAG_REACH gesture cap ([#1037](https://github.com/red1oon/bim-ootb/issues/1037)) ([758c45c](https://github.com/red1oon/bim-ootb/commit/758c45c62b196648f888204f6868a47f0a6a6c08))
* **precision-cam:** §PIVOT_AMBIENT_AUTO — continuous nav by default, without touching Q/Fine/Reset ([#1039](https://github.com/red1oon/bim-ootb/issues/1039)) ([10d6670](https://github.com/red1oon/bim-ootb/commit/10d66700a7f7a6153dcac598b85e585363ac27f4))
* **precision-cam:** §PIVOT_DEFAULT_ON — Auto-Pivot active by default, Fine wins over auto-recenter ([#1033](https://github.com/red1oon/bim-ootb/issues/1033)) ([da61ccb](https://github.com/red1oon/bim-ootb/commit/da61ccb28d7956fbfaf9cc0350040fde39042876))


### 🐛 Fixes

* **bugreport:** §BUGREPORT_MAILTO_LEN — cascade-truncate email log lines to fit mailto: length limit ([#1028](https://github.com/red1oon/bim-ootb/issues/1028)) ([fad6992](https://github.com/red1oon/bim-ootb/commit/fad6992a837162a4c2e060bd22370c2a012a5f73))
* **cinema:** §CINEMA_DAMPING_BLEED — OrbitControls damping overwrites the authored cinema pose ([#1020](https://github.com/red1oon/bim-ootb/issues/1020)) ([8ad8877](https://github.com/red1oon/bim-ootb/commit/8ad8877f0558e5962c3d7465d132dac8f78eed00))
* **cinema:** §CINEMA_PATH_EDITOR — no-hit fan is UNKNOWN not 60m, plus orange held-state feedback ([#1025](https://github.com/red1oon/bim-ootb/issues/1025)) ([15c54a0](https://github.com/red1oon/bim-ootb/commit/15c54a077e920b54fcc4653b894d7cd2ec7a82d5))
* **cinema:** §CPE_DRAG_TELEPORT — mid-band drag moves by the gesture, not to the cursor ray ([#1035](https://github.com/red1oon/bim-ootb/issues/1035)) ([eecb9c5](https://github.com/red1oon/bim-ootb/commit/eecb9c5fc86fc247f2db1d0da3af585b588b29ad))
* **cinema:** §CPE_OK_CRASH — OK after a path edit no longer kills the bake ([#1029](https://github.com/red1oon/bim-ootb/issues/1029)) ([db04360](https://github.com/red1oon/bim-ootb/commit/db043609ad44176781e6142f79adaab5a9ca3b95))
* **cinema:** §CPE_PREVIEW_DIVERGENCE — the film you edit is the film that bakes ([#1031](https://github.com/red1oon/bim-ootb/issues/1031)) ([2fc4db9](https://github.com/red1oon/bim-ootb/commit/2fc4db9074ca1791d26705d2c433f77de59e833c))
* **cinema:** remove §CPE_DRAG_REACH cap — G-DRAG-3 measured it BREAKING out-and-back ([#1038](https://github.com/red1oon/bim-ootb/issues/1038)) ([f23127c](https://github.com/red1oon/bim-ootb/commit/f23127c96ea9bd3ae91b21dd24441f685b21b5ca))
* **precision-cam:** §RESET_AMBIENT_AUTO calls resetOrbit() (A), not recenterPivot() (Q) ([#1040](https://github.com/red1oon/bim-ootb/issues/1040)) ([325896c](https://github.com/red1oon/bim-ootb/commit/325896ccdf725b03bb8473b309a1df12af3e0007))
* **precision-cam:** re-check Q/Fine at fire-time, not just at count-time ([#1041](https://github.com/red1oon/bim-ootb/issues/1041)) ([e89418e](https://github.com/red1oon/bim-ootb/commit/e89418ed09eeb129531822845aa9a8085a49f50b))
* **staffage:** §STAFFAGE_OUTSIDE_VARIETY + §STAFFAGE_FLOOR_PHANTOM — one sprite for everyone, and figures 3.5m in the air ([#1022](https://github.com/red1oon/bim-ootb/issues/1022)) ([37ccd52](https://github.com/red1oon/bim-ootb/commit/37ccd52de3de0cecc101346bf1ba0f6484f9d9db))
* **viewer:** Find-panel close-leak recovery + Hall/Corridor shell reveal ([#1019](https://github.com/red1oon/bim-ootb/issues/1019)) ([c564934](https://github.com/red1oon/bim-ootb/commit/c564934e06b790b8fb520c57b71f0564c61ad0be))


### ⏪ Reverts

* **precision-cam:** §PIVOT_DEFAULT_ON — back to opt-in, real usage showed drift + breaks Reset ([#1034](https://github.com/red1oon/bim-ootb/issues/1034)) ([08c0809](https://github.com/red1oon/bim-ootb/commit/08c0809fdccf2178e0a2deb9c25413f8f9a9cb8a))

## [1.28.0](https://github.com/red1oon/bim-ootb/compare/v1.27.0...v1.28.0) (2026-07-26)


### ✨ Features

* **tour:** §TOUR-POLYLINE — Fly Tour flies the A* on-floor polyline, not node centroids ([#1012](https://github.com/red1oon/bim-ootb/issues/1012)) ([ee0b844](https://github.com/red1oon/bim-ootb/commit/ee0b8443b2e8f38abbbcace65693b61bc3aeeb00))
* **viewer:** single room-select cuboid now shows its own real door(s) ([#1016](https://github.com/red1oon/bim-ootb/issues/1016)) ([dbff9f4](https://github.com/red1oon/bim-ootb/commit/dbff9f49bf5494e2684dabcb48d10d049735530a))


### 🐛 Fixes

* **cinema:** §CINEMA_TURN_SLERP — the look-back was a ONE-FRAME 180° snap, not a turn ([#1018](https://github.com/red1oon/bim-ootb/issues/1018)) ([1ccc024](https://github.com/red1oon/bim-ootb/commit/1ccc0244a579d2761dbe3dd5349f21d9d56eebe5))
* **graph:** §G1-EXIT-IS-A-LIFT-DOOR step 1 — an `exit` node was a lift door; stop creating it ([#1014](https://github.com/red1oon/bim-ootb/issues/1014)) ([78036f6](https://github.com/red1oon/bim-ootb/commit/78036f66fc1fc58339b9a16002478e9f1de29a42))
* **graph:** bound the detour search (§DETOUR-MID-MARGIN) + explain the door-revisit wiggle instead of trading it for a longer line ([#1010](https://github.com/red1oon/bim-ootb/issues/1010)) ([34c0286](https://github.com/red1oon/bim-ootb/commit/34c028621f79ca2d5b7ecdfa0bcf31ac940c82d7))
* **graph:** Room→Path draws on real floor — raster union, door/stair thresholds, floor-plane raster (§17) ([#1006](https://github.com/red1oon/bim-ootb/issues/1006)) ([8356978](https://github.com/red1oon/bim-ootb/commit/8356978205879a4fdb02d218b167f8b6334af957))
* **sw:** serve buildings/patches/*.sql network-first — an updated DB patch could never reach a client ([#1009](https://github.com/red1oon/bim-ootb/issues/1009)) ([ffb71b1](https://github.com/red1oon/bim-ootb/commit/ffb71b176d7d2d22f8575c83bb98f5a9c6486557))
* **tour:** §SCRUB_BAR_LIFECYCLE — scrub bar returns after a canvas interrupt (11/11) ([#1002](https://github.com/red1oon/bim-ootb/issues/1002)) ([a2d01c7](https://github.com/red1oon/bim-ootb/commit/a2d01c7082b4e14b2a534ce36a8a5e0fc51671f8))
* **viewer:** §ROOM_PATH — split the misnamed rooms=[] into stops=[] and via=[] ([#1007](https://github.com/red1oon/bim-ootb/issues/1007)) ([491413f](https://github.com/red1oon/bim-ootb/commit/491413ffb4e3e277c23b7e7f4a61dfb7f4bf57d2))
* **viewer:** guarantee a fresh shadow reassert before Alt+S/Alt+C frame handoff (§PHOTO_SHADOW_FINALCAPTURE) ([#1004](https://github.com/red1oon/bim-ootb/issues/1004)) ([de7120f](https://github.com/red1oon/bim-ootb/commit/de7120f1d414996693b70c28e385d5694f89cc97))
* **viewer:** salvage MaxQ bakes that lose their IDB connection or WebGL context mid-run ([#1011](https://github.com/red1oon/bim-ootb/issues/1011)) ([8f7be57](https://github.com/red1oon/bim-ootb/commit/8f7be576473d24f773c2442105aa93f3462495bf))
* **viewer:** stop scene.js's throttled sky env-map regen from clobbering a staged HDRI (§ENVMAP_STOMP_GUARD) ([#1005](https://github.com/red1oon/bim-ootb/issues/1005)) ([9b01172](https://github.com/red1oon/bim-ootb/commit/9b01172f365c17be9fa6e3e6850230f0fd9e0546))

## [1.27.0](https://github.com/red1oon/bim-ootb/compare/v1.26.0...v1.27.0) (2026-07-25)


### ✨ Features

* **deploy:** §PATCH-PROVENANCE-GATE — mechanical pre-upload check for OCI patches ([#998](https://github.com/red1oon/bim-ootb/issues/998)) ([9f18562](https://github.com/red1oon/bim-ootb/commit/9f18562f9d6ad91c348fc96c8d15c18f365ab569))
* **graph:** §ROOM-SPINE-BRIDGE — connect stranded rooms to circulation; pathability 56%→86% ([#995](https://github.com/red1oon/bim-ootb/issues/995)) ([4a65a44](https://github.com/red1oon/bim-ootb/commit/4a65a44a4ff19f44abe3e4969f5edbd4203e4c5e))
* **tour:** §SCRUB_PANEL_DRAG — draggable Fly Tour scrub panel (10/10 witnesses) ([#1000](https://github.com/red1oon/bim-ootb/issues/1000)) ([52682b5](https://github.com/red1oon/bim-ootb/commit/52682b51704d4c6fce358dc122462e81122d76f2))
* **tour:** §TOUR_TIMELINE_SCRUB — continuous Fly Tour scrub bar, pose = f(T) ([#999](https://github.com/red1oon/bim-ootb/issues/999)) ([12ef411](https://github.com/red1oon/bim-ootb/commit/12ef411951792670b1536a1c9e7a110caf1ecc37))
* **viewer:** Cinema/MaxQ Alt+C timing — 6/6 dive-out, roll-to-stop, HDRI race fix ([#978](https://github.com/red1oon/bim-ootb/issues/978)) ([cbb8cae](https://github.com/red1oon/bim-ootb/commit/cbb8cae99bafc756afcd593978c79ce07e21d145))
* **viewer:** Fly Tour highlight-first routing — main hall → stairs → the rest ([#989](https://github.com/red1oon/bim-ootb/issues/989)) ([fab68d4](https://github.com/red1oon/bim-ootb/commit/fab68d4e026e22f430ac5c3ea69bb8cc83cbd3f5))


### 🐛 Fixes

* **graph:** §BRIDGE-ROUTED-LEGAL — gate room-spine bridges on a walkable ROUTE, not a straight chord ([#997](https://github.com/red1oon/bim-ootb/issues/997)) ([abc48cd](https://github.com/red1oon/bim-ootb/commit/abc48cd5922afe9dfc8ac56e7a79e5f65cc2adb2))
* **graph:** §BRIDGE-WALL-LEGAL — gate room-spine bridges on a measured chord ([#996](https://github.com/red1oon/bim-ootb/issues/996)) ([290c6be](https://github.com/red1oon/bim-ootb/commit/290c6be49e3376ebfa657fd2a01d6eeb4c51dd9a))
* **viewer:** bump TOUR_CACHE_VER v12→v13 — §HL-FIRST was masked by a stale cached route ([#991](https://github.com/red1oon/bim-ootb/issues/991)) ([5b8c071](https://github.com/red1oon/bim-ootb/commit/5b8c071846bcceff2841d3fd8494c0ed165e28b1))
* **viewer:** Cinema orbit — symmetric smooth ease, MaxQ HDRI wait, exit-gaze corner fix ([#979](https://github.com/red1oon/bim-ootb/issues/979)) ([8d12254](https://github.com/red1oon/bim-ootb/commit/8d1225422f256de4c5c4806d4dd5b55ace176e30))
* **viewer:** Fly Tour — SUSPECT_OPEN rooms are eligible highlight destinations ([#994](https://github.com/red1oon/bim-ootb/issues/994)) ([b951cae](https://github.com/red1oon/bim-ootb/commit/b951caeabdfc2cf64f5e631be055015cfa1a0b85))
* **viewer:** Fly Tour flyPath — bound look-ahead to absolute distance, not fraction of total path ([#986](https://github.com/red1oon/bim-ootb/issues/986)) ([119b5f0](https://github.com/red1oon/bim-ootb/commit/119b5f0d56d0f69517fd05e4f4601f57fa5af55f))
* **viewer:** Fly Tour interior pacing — 0.3x baseline + real-turn-angle slowdown, 2x entrance zoom ([#980](https://github.com/red1oon/bim-ootb/issues/980)) ([45d22b5](https://github.com/red1oon/bim-ootb/commit/45d22b522fb57b4493198e831944359092738b4e))
* **viewer:** Fly Tour interior pacing — measure line-of-sight ahead, not omnidirectional min ([#985](https://github.com/red1oon/bim-ootb/issues/985)) ([6938759](https://github.com/red1oon/bim-ootb/commit/6938759b4c44dc55b3da612141e71d2d208b3091))
* **viewer:** Fly Tour pacing — narrow clamp again + collapse to single PACE_SWING knob ([#988](https://github.com/red1oon/bim-ootb/issues/988)) ([c722195](https://github.com/red1oon/bim-ootb/commit/c7221953bf15f300ca6b10f7c18d885c8736878b))
* **viewer:** Fly Tour pacing — narrow inverse-distance clamp range, less extreme ([#987](https://github.com/red1oon/bim-ootb/issues/987)) ([077391d](https://github.com/red1oon/bim-ootb/commit/077391d30d3df28461d13df726c426d6bc12c12a))
* **viewer:** Fly Tour pacing v2 — real height/distance-based inverse law (orphaned from [#980](https://github.com/red1oon/bim-ootb/issues/980)) ([#984](https://github.com/red1oon/bim-ootb/issues/984)) ([3918140](https://github.com/red1oon/bim-ootb/commit/39181404cadf27c59d06743d4b6f5dc86adde619))


### ⚡ Performance

* **viewer:** object-count fix + walkTick damping fix (LTU 200-270ms→86.7ms) ([#981](https://github.com/red1oon/bim-ootb/issues/981)) ([1c2a625](https://github.com/red1oon/bim-ootb/commit/1c2a625b4f9688b369314d7f8811a088beea18cf))
* **viewer:** skip redundant shadow-reassert traversals in Alt+S/Alt+C ([#983](https://github.com/red1oon/bim-ootb/issues/983)) ([0760a2b](https://github.com/red1oon/bim-ootb/commit/0760a2b1d57a0d6e5c2a831062317e43ebaf6402))


### 📝 Documentation

* **readme:** refresh stale commit/PR/module/building counts ([#992](https://github.com/red1oon/bim-ootb/issues/992)) ([754ce8d](https://github.com/red1oon/bim-ootb/commit/754ce8d11738b24364ee44693dda9baae1df8f4f))

## [1.26.0](https://github.com/red1oon/bim-ootb/compare/v1.25.0...v1.26.0) (2026-07-22)


### ✨ Features

* **viewer:** R room-cycle + Home fill-frame keyboard shortcuts ([#969](https://github.com/red1oon/bim-ootb/issues/969)) ([ed1caa5](https://github.com/red1oon/bim-ootb/commit/ed1caa5e256822e952d499e7cd048167800baee3))
* **viewer:** room-graph portal PVS, step 2 (FLY_TOUR_DLOD_SCALE.md §16) ([#971](https://github.com/red1oon/bim-ootb/issues/971)) ([cb503f4](https://github.com/red1oon/bim-ootb/commit/cb503f4bee5ba3b234799b7a2531ffed871421f6))

## [1.25.0](https://github.com/red1oon/bim-ootb/compare/v1.24.0...v1.25.0) (2026-07-22)


### ✨ Features

* **erp:** Confirm & Post — Generate-Shipments/Invoices/PO results now actually commit ([#960](https://github.com/red1oon/bim-ootb/issues/960)) ([81518d2](https://github.com/red1oon/bim-ootb/commit/81518d2bf725dd5c27a9d48833fd23e3c05bba51))
* **room-path:** raster-constrained A* polyline — the drawn route hugs real floor (§13 Stage B) ([#967](https://github.com/red1oon/bim-ootb/issues/967)) ([302f694](https://github.com/red1oon/bim-ootb/commit/302f694ea4ae51bfaba6c576571daa161cf77ec1))
* **rooms:** §ROOM_WALKER_VERSION_STAMP stage 3 — HHS-only version-check pilot ([#939](https://github.com/red1oon/bim-ootb/issues/939)) ([811a7e3](https://github.com/red1oon/bim-ootb/commit/811a7e3f3180460f796e73e17158e080fe485964))
* **rooms:** §ROOM_WALKER_VERSION_STAMP stage 4 — widen version-check fleet-wide ([#947](https://github.com/red1oon/bim-ootb/issues/947)) ([34e6495](https://github.com/red1oon/bim-ootb/commit/34e6495237b7f8231082e5c0edf5887d0c3b1a61))
* **viewer:** 'o' DLOD-nav warms rooms via the existing ensureRooms path (idle-deferred) ([#942](https://github.com/red1oon/bim-ootb/issues/942)) ([b48a576](https://github.com/red1oon/bim-ootb/commit/b48a57676ab740826be5ac2db13a3e8b0a4062b4))
* **viewer:** GPU capability degradation warning (FLY_TOUR_DLOD_SCALE.md §14) ([#965](https://github.com/red1oon/bim-ootb/issues/965)) ([9e33777](https://github.com/red1oon/bim-ootb/commit/9e337773913cc024503fa77c6d8bfedfefe4d529))
* **viewer:** log active CACHE_VERSION at page onset (§BUILD_VERSION) ([#951](https://github.com/red1oon/bim-ootb/issues/951)) ([9bf2688](https://github.com/red1oon/bim-ootb/commit/9bf26881d6dcf2b05b8294951d6fd8fd45767857))
* **viewer:** room-mismatch demote, step 1 (FLY_TOUR_DLOD_SCALE.md §13) ([#962](https://github.com/red1oon/bim-ootb/issues/962)) ([e84a079](https://github.com/red1oon/bim-ootb/commit/e84a079e6e36f1c52cd485c7a8f1f090fb65c922))
* **viewer:** status-bar confirmation on Nav LOD toggle (user ask) — ON/OFF message, 5s auto-clear ([#941](https://github.com/red1oon/bim-ootb/issues/941)) ([7ba7537](https://github.com/red1oon/bim-ootb/commit/7ba75378e9c35a62eb385ac9c6b584e51240ce65))


### 🐛 Fixes

* **cinema:** spin-at-wall — glazing hits no longer trigger avoidance nudging (prompts/PHOTOREAL_STILL_RENDER.md §Issue 2a) ([#958](https://github.com/red1oon/bim-ootb/issues/958)) ([57a0f4d](https://github.com/red1oon/bim-ootb/commit/57a0f4dcef6d552f80822ed346cb35df96c57ad4))
* **disc-walker:** STOREY-ZBAND — measured-interval Z guard for hostBind SIDE selection ([#963](https://github.com/red1oon/bim-ootb/issues/963)) ([e5dd2bf](https://github.com/red1oon/bim-ootb/commit/e5dd2bf38575ae8217436384275cc9a71f8f7451))
* **erp:** C_Order.DeliveryRule/InvoiceRule now derive real AD_Column defaults, not left undefined ([#955](https://github.com/red1oon/bim-ootb/issues/955)) ([e27d1bf](https://github.com/red1oon/bim-ootb/commit/e27d1bfbdc0861c52014dc46aa7d54de869ae4e6))
* **erp:** child-tab New forms seed their locked parent-link FK with the real parent pk ([#956](https://github.com/red1oon/bim-ootb/issues/956)) ([0269cec](https://github.com/red1oon/bim-ootb/commit/0269cec26b077f23c76ed8ad204cf02bc342c98a))
* **erp:** cleanVals lets hook-derived CREATE fields ride the op — M_Warehouse_ID no longer dropped ([#944](https://github.com/red1oon/bim-ootb/issues/944)) ([b70f1ba](https://github.com/red1oon/bim-ootb/commit/b70f1baee406ea3614808085f846b0da7c4480e7))
* **erp:** fold the op-log overlay into the Generate-Shipments/Invoices order picker ([#938](https://github.com/red1oon/bim-ootb/issues/938)) ([2033997](https://github.com/red1oon/bim-ootb/commit/20339977ad6602d28e3d40cec08dce2d5ff988e2))
* **erp:** Generate-Shipments/Invoices handlers fold the op-log overlay, not just the raw base table ([#948](https://github.com/red1oon/bim-ootb/issues/948)) ([573a29f](https://github.com/red1oon/bim-ootb/commit/573a29f42687297b5703861149ec30c958e4c403))
* **erp:** listTip's stdDefaults fold writes lowercase columns, not mixed-case — fixes AD_Org_ID=NaN ([#968](https://github.com/red1oon/bim-ootb/issues/968)) ([e73c23c](https://github.com/red1oon/bim-ootb/commit/e73c23cd9e94494b7d5e24a25778ebfc4581b46a))
* **erp:** Sales vs Purchase Order windows now derive a real, distinct DocType/IsSOTrx ([#953](https://github.com/red1oon/bim-ootb/issues/953)) ([e9a35c7](https://github.com/red1oon/bim-ootb/commit/e9a35c7d2ea7ac61300eea4734c1f25db14c261e))
* **raster:** split-DB-aware walkable-raster build — Terminal slabs 0/174 → 174/174 ([#964](https://github.com/red1oon/bim-ootb/issues/964)) ([f60344a](https://github.com/red1oon/bim-ootb/commit/f60344a64142caad38f47c4b61b9fe8b4ce943c1))
* **room-graph:** tag door-carrying service rooms for routing (close §10 gap) ([#961](https://github.com/red1oon/bim-ootb/issues/961)) ([03a6cb7](https://github.com/red1oon/bim-ootb/commit/03a6cb702693806c87240b000f29a377247a55bb))
* **room-graph:** utility-room routing penalty in shared Dijkstra weighting ([#959](https://github.com/red1oon/bim-ootb/issues/959)) ([6209f54](https://github.com/red1oon/bim-ootb/commit/6209f54971dfa21f4e79c0834242a0da0b29eca3))
* **rooms:** Find Panel Room lens calls A.ensureRooms() itself — no longer depends on Fly/Cinema/DLOD warming it first ([#954](https://github.com/red1oon/bim-ootb/issues/954)) ([df5def1](https://github.com/red1oon/bim-ootb/commit/df5def1a26408be531ad60db68cde46078e43f42))
* **rooms:** port containment storey-alias fix to room_walker.js (JS twin) ([#950](https://github.com/red1oon/bim-ootb/issues/950)) ([1db5117](https://github.com/red1oon/bim-ootb/commit/1db511785e49ffa2f760e7c727ffcd495ee51f9b))
* **staffage:** Alt+P camera-room avoidance — dd floor + lateral-fan scaling (prompts/PHOTOREAL_STILL_RENDER.md §Issue 1) ([#957](https://github.com/red1oon/bim-ootb/issues/957)) ([33f20c9](https://github.com/red1oon/bim-ootb/commit/33f20c9592d4a50667506db1ee70bb09b25d3e7a))
* **tour:** IDB route cache + single planning pass — Fly instant on repeat/refresh (TOUR_ROUTE_CACHE.md §5); quiet §PILL_SYNC/§DLOD_NAV log spam ([#940](https://github.com/red1oon/bim-ootb/issues/940)) ([b10f2dd](https://github.com/red1oon/bim-ootb/commit/b10f2dd7303e8dbf7f13b786ceb732f72aa602b8))
* **viewer:** §CINEMA_SPACE_MEP_SKIP — dive candidates dominated by MEP/plant elements are excluded ([#949](https://github.com/red1oon/bim-ootb/issues/949)) ([9d070e2](https://github.com/red1oon/bim-ootb/commit/9d070e2bac4c067ee4e067b89466bf0434c181fc))
* **viewer:** §MAXQ_STREAM_FIRST — MaxQ waits for geometry streaming before baking ([#945](https://github.com/red1oon/bim-ootb/issues/945)) ([8e57fb8](https://github.com/red1oon/bim-ootb/commit/8e57fb8a549cb8ff7f2a6390cfa1d445b566c470))
* **viewer:** bust Fly tour route cache on stage-3 version recompile ([#946](https://github.com/red1oon/bim-ootb/issues/946)) ([7e20d3f](https://github.com/red1oon/bim-ootb/commit/7e20d3f3d9547f76dcf8f43288768338bf93a87a))
* **viewer:** Nav LOD findable + 'o' shortcut — v1 registered the entry in no drawer list (user: can't find icon; 'b' taken by Background) ([#936](https://github.com/red1oon/bim-ootb/issues/936)) ([2a80960](https://github.com/red1oon/bim-ootb/commit/2a80960fb6ee7d7047ab3baedd295d71b42148fc))
* **viewer:** NEEDLE_VERSION_STALE/FRAME_STALE log at console.log, not warn ([#952](https://github.com/red1oon/bim-ootb/issues/952)) ([1088805](https://github.com/red1oon/bim-ootb/commit/1088805448f89a1ff36fe6b6402390d76de07c36))


### ⚡ Performance

* **viewer:** chunked DLOD-nav evaluation — kills the 42ms in-flight eval hitch (user: 'still lagging in flight') ([#943](https://github.com/red1oon/bim-ootb/issues/943)) ([af6f492](https://github.com/red1oon/bim-ootb/commit/af6f492a17e58e73f8d1e033d426bc45d7a943b9))

## [1.24.0](https://github.com/red1oon/bim-ootb/compare/v1.23.0...v1.24.0) (2026-07-21)


### ✨ Features

* **cinema:** §CINEMA_FLAT_ENDING — monotonic glide to a held, flat orbit ending ([#923](https://github.com/red1oon/bim-ootb/issues/923)) ([a5b65fd](https://github.com/red1oon/bim-ootb/commit/a5b65fd06d6bff04ff6a79e3c561858bbab36ef6))
* **cinema:** §CINEMA_ORBIT_V2 — the whole route redesigned per live-trial feedback ([#925](https://github.com/red1oon/bim-ootb/issues/925)) ([3df154f](https://github.com/red1oon/bim-ootb/commit/3df154f87b53595093df5f5e81a701c4b17ae329))
* **erp:** multi-device roster verification for cross-device DocAction attribution (W-MULTI-DEVICE-VERIFY) ([#932](https://github.com/red1oon/bim-ootb/issues/932)) ([352f441](https://github.com/red1oon/bim-ootb/commit/352f441f348b669392b702de700acf4ccd824ecd))
* **rooms:** §ROOM_WALKER_VERSION_STAMP stages 1+2 — sync room_walker.js port + cache-bust ([#934](https://github.com/red1oon/bim-ootb/issues/934)) ([793a054](https://github.com/red1oon/bim-ootb/commit/793a054c1b606600fc084c079af04b40af3d619d))
* **schedule:** add PMXML/XER writers — the missing P6 write-back (prompts/XER_PMXML_WRITER_LANE.md) ([#911](https://github.com/red1oon/bim-ootb/issues/911)) ([2264092](https://github.com/red1oon/bim-ootb/commit/2264092fd168dbaa625eb93a648d083069b28ad0))
* **time-machine:** DLOD Phase 3 — box-proxy inactive-built elements by construction-time activity ([#918](https://github.com/red1oon/bim-ootb/issues/918)) ([4e9be99](https://github.com/red1oon/bim-ootb/commit/4e9be99dbcb6a237c1657aab6294c5e958efc002))
* **time-machine:** DLOD Phase 3 redesign — view-based, not time-based (user ask) ([#920](https://github.com/red1oon/bim-ootb/issues/920)) ([62b126e](https://github.com/red1oon/bim-ootb/commit/62b126e81c15e86a0f9275d0073424c712f83692))
* **tour:** §TOUR_CACHE — cache the computed Fly Tour route per building (16.5s → 0.4s repeat activation on LTU) ([#917](https://github.com/red1oon/bim-ootb/issues/917)) ([4ccf5ef](https://github.com/red1oon/bim-ootb/commit/4ccf5ef335b7f05511c47fec076f04abaa62ff81))
* **viewer:** nav-scope DLOD box-proxy — Fly Tour/free-orbit LOD for large buildings (FLY_TOUR_DLOD_SCALE.md §9) ([#935](https://github.com/red1oon/bim-ootb/issues/935)) ([29b7735](https://github.com/red1oon/bim-ootb/commit/29b7735d628ab443c593c7f7c237e4e955334867))


### 🐛 Fixes

* **cinema:** §CINEMA_SPACE_ENCLOSED_SKIP — skip disqualified dive candidates before bbox-centre ([#933](https://github.com/red1oon/bim-ootb/issues/933)) ([4a24cde](https://github.com/red1oon/bim-ootb/commit/4a24cde3d567094d7dbfb089f43bc44022d8b70c))
* **erp:** install the device signer + preserve gid/sig/branch_id through a relay rebase (W-REBASE-ATTRIB) ([#930](https://github.com/red1oon/bim-ootb/issues/930)) ([cb58306](https://github.com/red1oon/bim-ootb/commit/cb58306e30b881d8b4debf311519f506cfe599f4))
* **erp:** Sales Order child tab was binding to a stale parent order ([#928](https://github.com/red1oon/bim-ootb/issues/928)) ([5044d0d](https://github.com/red1oon/bim-ootb/commit/5044d0d11958de757043a775f901b15e6592cbe3))
* **history:** back-arrow no longer mints a spurious forward dot mid-scrub ([#924](https://github.com/red1oon/bim-ootb/issues/924)) ([bbf8c9e](https://github.com/red1oon/bim-ootb/commit/bbf8c9edac255550dc1a8c33ace1a1c2ad4d940e))
* **tests:** witness_disc_density D3 oracle — true-midpoint grid + per-host footprint for bound fixtures ([#929](https://github.com/red1oon/bim-ootb/issues/929)) ([ed1aafd](https://github.com/red1oon/bim-ootb/commit/ed1aafd8fc2254cb18b46aa671c0aed3643cdc41))
* **time-machine:** DLOD Phase 3 boxes → wireframe, not solid (user ask) ([#919](https://github.com/red1oon/bim-ootb/issues/919)) ([490c768](https://github.com/red1oon/bim-ootb/commit/490c76810d8f9249bc6c9e87f9f38ab127de9aeb))
* **time-machine:** startPlayback wrap warps render via renderAtTime — last cursor-pre-mutation sites ([#912](https://github.com/red1oon/bim-ootb/issues/912) audit) ([#916](https://github.com/red1oon/bim-ootb/issues/916)) ([43b9eb5](https://github.com/red1oon/bim-ootb/commit/43b9eb583cb779b2473c52f98cd68797634207ce))
* **time-machine:** stop pre-mutating _cursor before renderAtTime — fixes playback freeze under Phase 2 delta skip ([#912](https://github.com/red1oon/bim-ootb/issues/912)) ([58a9f2a](https://github.com/red1oon/bim-ootb/commit/58a9f2a93687945231c21d5a8e5feea8f38e1a79))
* **tm:** §DLOD_TM_CAMGUARD — box→real restore was skipped on camera-only ticks ([#927](https://github.com/red1oon/bim-ootb/issues/927)) ([ee57a3e](https://github.com/red1oon/bim-ootb/commit/ee57a3e40e06a6b4efdd378bca2ed81eba5ae8a6))
* **tour:** §IDLE-PARK wake missing in _startFlyTour — cinematic tour built but never ticked (LTU freeze) ([#914](https://github.com/red1oon/bim-ootb/issues/914)) ([a71a699](https://github.com/red1oon/bim-ootb/commit/a71a699167e87c59b5aa96ee48d26a2d40f5e5b4))
* **tour:** §TOUR_CACHE self-heals on quota-exceeded — evict stale keys and retry (prompts/TOUR_ROUTE_CACHE.md §4) ([#926](https://github.com/red1oon/bim-ootb/issues/926)) ([2353e1d](https://github.com/red1oon/bim-ootb/commit/2353e1dfe1211837be99ef9051f97ef80b10d9ec))
* **viewer:** §BBOX_GHOST_STUCK_RESET + §BBOX_GHOST_RAYCAST_FILTER — the merged-ghost shell never reverted, and raycasts never learned to ignore it ([#921](https://github.com/red1oon/bim-ootb/issues/921)) ([ddd25bd](https://github.com/red1oon/bim-ootb/commit/ddd25bd44406d8ff8c42b0dd06082a00e448b75d))
* **viewer:** §CINEMA_GHOST_RESET — Alt+C leaves ghost bbox/x-ray shell stuck visible ([#931](https://github.com/red1oon/bim-ootb/issues/931)) ([c6fe5b6](https://github.com/red1oon/bim-ootb/commit/c6fe5b6864a6c64d3576fc0d0982435de987e792))


### ⚡ Performance

* **time-machine:** §PERF_INCR Phase 2 — delta skip now engages under Shadow/Alt-G ([#909](https://github.com/red1oon/bim-ootb/issues/909)) ([98416d9](https://github.com/red1oon/bim-ootb/commit/98416d952268fc3f851959aeae9749eb29082279))

## [1.23.0](https://github.com/red1oon/bim-ootb/compare/v1.22.0...v1.23.0) (2026-07-19)


### ✨ Features

* **cinema:** §CINEMA_RECIPROCAL — the start pose authors the whole film, ending included ([#897](https://github.com/red1oon/bim-ootb/issues/897)) ([1b27126](https://github.com/red1oon/bim-ootb/commit/1b27126016f5247f876557822c1e91b654457b53))
* **cinema:** §CINEMA_SIMPLE — one routine, pivot fixed, exit chosen by facing ([#902](https://github.com/red1oon/bim-ootb/issues/902)) ([d647891](https://github.com/red1oon/bim-ootb/commit/d6478912c44ce6ee27815b8bfb2f424d33f41e6e))
* **viewer:** §MAXQ_MP4 — MaxQ exports mp4/H.264, so the movie plays on iPhone/WhatsApp ([#895](https://github.com/red1oon/bim-ootb/issues/895)) ([f913b67](https://github.com/red1oon/bim-ootb/commit/f913b67b7a0af340ca06a2539e224d65f2359c88))


### 🐛 Fixes

* **cinema:** §CINEMA_POV_CONTINUITY — the film must BEGIN at the authored pose ([#900](https://github.com/red1oon/bim-ootb/issues/900)) ([d5748d6](https://github.com/red1oon/bim-ootb/commit/d5748d6a240eed5299453b61b8c1a59d35ce9d65))
* **cinema:** §CINEMA_THEME — theme arrives AFTER the ease-back; rotation never unwinds ([#901](https://github.com/red1oon/bim-ootb/issues/901)) ([5c11be1](https://github.com/red1oon/bim-ootb/commit/5c11be1d6748681bb20e8bb7d741b8dc536a5e69))
* **sw:** bump CACHE_VERSION v813 -&gt; v814 — two merged PRs both claimed v813 ([#899](https://github.com/red1oon/bim-ootb/issues/899)) ([dc17fd0](https://github.com/red1oon/bim-ootb/commit/dc17fd0a0ba508f74835bbc8b7057b097de99d02))
* **time-machine:** §PERF_INCR event index thrashed every tick on LTU — was a net regression ([#906](https://github.com/red1oon/bim-ootb/issues/906)) ([eab9248](https://github.com/red1oon/bim-ootb/commit/eab92488c4da7488dbb3c4c5c54a02d9e9e944d2))
* **viewer:** §MAXQ_IDB — MaxQ bake no longer deadlocks silently on IndexedDB open ([#894](https://github.com/red1oon/bim-ootb/issues/894)) ([eebf9e7](https://github.com/red1oon/bim-ootb/commit/eebf9e73a13312bd38c6f4a138320faf8844947e))
* **viewer:** §STAFFAGE — cars can NEVER be indoors (user ruling); retire the car-park ceiling allowance ([#904](https://github.com/red1oon/bim-ootb/issues/904)) ([2b67445](https://github.com/red1oon/bim-ootb/commit/2b6744531a6b8b259f6c199767afdd717a5a9d20))
* **viewer:** §STAFFAGE_CLEARANCE — no trees/cars in the Terminal hall, no figure inside a mesh ([#903](https://github.com/red1oon/bim-ootb/issues/903)) ([6d00ecb](https://github.com/red1oon/bim-ootb/commit/6d00ecb52b3981d8e451bd737a89fa662f4db914))
* **viewer:** §STAFFAGE_SEAT_CLASS — seated staffage no longer placed inside tables ([#898](https://github.com/red1oon/bim-ootb/issues/898)) ([9d17619](https://github.com/red1oon/bim-ootb/commit/9d1761976d4a0534155bc3b1b39d6990313579ae))


### ⚡ Performance

* **viewer:** TM incremental render + silence per-tick playback logging (re-applies orphaned [#891](https://github.com/red1oon/bim-ootb/issues/891) tail) ([#905](https://github.com/red1oon/bim-ootb/issues/905)) ([fa7b4ef](https://github.com/red1oon/bim-ootb/commit/fa7b4ef34e004f9979df8fe30e44d4b3fb5b2ded))

## [1.22.0](https://github.com/red1oon/bim-ootb/compare/v1.21.0...v1.22.0) (2026-07-19)


### ✨ Features

* **cinema:** SSAA supersampling for Cinema Orbit + measured 15-&gt;24fps + composer module-graph precache ([#880](https://github.com/red1oon/bim-ootb/issues/880)) ([0acfcf8](https://github.com/red1oon/bim-ootb/commit/0acfcf89e44ec6c4358ad61ce107c81fcdfe271a))
* **staffage:** wide-radius fallback for people/cars on large buildings ([#881](https://github.com/red1oon/bim-ootb/issues/881)) ([b5bb932](https://github.com/red1oon/bim-ootb/commit/b5bb93217939384819320335b33e5c464a39fa3a))
* **time-machine:** §GROUP_SPARK frontier sparks — replaces the reverted [#866](https://github.com/red1oon/bim-ootb/issues/866) halo ([#891](https://github.com/red1oon/bim-ootb/issues/891)) ([b6edf76](https://github.com/red1oon/bim-ootb/commit/b6edf76c546341e22938ca91515efd8e000ea7e3))
* **time-machine:** frontier halo glow, shines through occluders, hot-to-cool by progress ([#866](https://github.com/red1oon/bim-ootb/issues/866)) ([28e4b9c](https://github.com/red1oon/bim-ootb/commit/28e4b9cc3b0824a78d997fcc06db2109c81df030))
* **ui:** "processing..." pulse on the Alt+S/Alt+P Palette icons ([#876](https://github.com/red1oon/bim-ootb/issues/876)) ([cdcfdcd](https://github.com/red1oon/bim-ootb/commit/cdcfdcd0b3110857a43ae19e80023e315390656e))
* **ui:** Alt+S/Alt+P icon row in Palette panel; move Fly to Navigate ([#874](https://github.com/red1oon/bim-ootb/issues/874)) ([c1de0e4](https://github.com/red1oon/bim-ootb/commit/c1de0e436afaa44957598505f99ef1077f565a59))
* **viewer:** §CINEMA_INDOOR — indoor start gets a dramatic exit prelude on the shared orbit path ([#889](https://github.com/red1oon/bim-ootb/issues/889)) ([05b7be1](https://github.com/red1oon/bim-ootb/commit/05b7be18b010627572731f1bcefb06e304d9e06f))
* **viewer:** §MAXQ_LOADED version fingerprint + per-frame ETA in §MAXQ_FRAME/status ([#888](https://github.com/red1oon/bim-ootb/issues/888)) ([84a2979](https://github.com/red1oon/bim-ootb/commit/84a297919621dd9480d9d85893ed08f11a51c0b7))
* **viewer:** §MAXQ_PREVIEW — 10s real-time path rehearsal before the bake ([#890](https://github.com/red1oon/bim-ootb/issues/890)) ([6a4bb70](https://github.com/red1oon/bim-ootb/commit/6a4bb70b50f7c46807a3e236b6468be9f7517c05))
* **viewer:** §MAXQ_WAKELOCK — screen wake lock holds the bake alive on unattended machines ([#893](https://github.com/red1oon/bim-ootb/issues/893)) ([7335bb5](https://github.com/red1oon/bim-ootb/commit/7335bb5b77a081f759585ee723d6cb24b65d7ef1))
* **viewer:** Alt+M Max-Quality Orbiter export — full Alt+S fold per frame, IDB frames, replay-record stitch ([#884](https://github.com/red1oon/bim-ootb/issues/884)) ([280f066](https://github.com/red1oon/bim-ootb/commit/280f066d095e06daf56c697a70430120bdd7d6ca))
* **viewer:** MaxQ cancel saves the partial movie (§MAXQ_PARTIAL) ([#887](https://github.com/red1oon/bim-ootb/issues/887)) ([62d7a0f](https://github.com/red1oon/bim-ootb/commit/62d7a0f23b598cbec7409673250c6330341f7ddb))
* **viewer:** MaxQ movie replaces live-capture orbit at the cinema icon / Alt+C ([#885](https://github.com/red1oon/bim-ootb/issues/885)) ([8e1aac4](https://github.com/red1oon/bim-ootb/commit/8e1aac4b2ec58c2f42f1e9a996cc033350c0a1df))
* **viewer:** staffage formula (4 trees/1 car/3 pax per press) + randomized clash-only capping ([#875](https://github.com/red1oon/bim-ootb/issues/875)) ([ae5b298](https://github.com/red1oon/bim-ootb/commit/ae5b29822873844e29f95e0c9a32ca2b7ba83737))
* **viewer:** staffage redesign — frame-focused, additive, save-persisted ([#868](https://github.com/red1oon/bim-ootb/issues/868)) ([d53a477](https://github.com/red1oon/bim-ootb/commit/d53a477064bdaa623ba8f88a6be1d3d1ec2837ea))


### 🐛 Fixes

* **cache:** fall back to unversioned IDB open when bim_ootb_cache is already past v2 ([#878](https://github.com/red1oon/bim-ootb/issues/878)) ([b5ff937](https://github.com/red1oon/bim-ootb/commit/b5ff9375295f6b7109511fa1fb77680c82eb3921))
* **schedule:** cap concurrent crews per trade project-wide, cascading floor-by-floor ([#864](https://github.com/red1oon/bim-ootb/issues/864)) ([8af5bcc](https://github.com/red1oon/bim-ootb/commit/8af5bcc4cf2700b4f3c0a153648c004e563766e8))
* **staffage:** Alt+P never yields zero of a kind + per-car paint colors ([#883](https://github.com/red1oon/bim-ootb/issues/883)) ([32962f9](https://github.com/red1oon/bim-ootb/commit/32962f986c8353fba03d7f44e76c283e834b227c))
* **time-machine:** bump _GANTT_CACHE_VERSION 3→4 (§STOREY-Z fix missed the cache-bust step) ([#871](https://github.com/red1oon/bim-ootb/issues/871)) ([9cf6abc](https://github.com/red1oon/bim-ootb/commit/9cf6abc1cb732f908ae79c97a3b3a22ad41f48be))
* **time-machine:** reassign no-storey elements to nearest real storey by Z (mini-Gantt "all at once") ([#869](https://github.com/red1oon/bim-ootb/issues/869)) ([926bd20](https://github.com/red1oon/bim-ootb/commit/926bd204c4d0b7bbf17a738e992301fa84c72517))
* **time-machine:** stagger per-element reveal within a captured phase's date window ([#882](https://github.com/red1oon/bim-ootb/issues/882)) ([6c786a8](https://github.com/red1oon/bim-ootb/commit/6c786a8ca0f4c380542e6b0c5d89bd34b5d8269d))
* **time-machine:** trim mini-Gantt bar span to p2-p98 (excludes mistagged-element outliers) ([#873](https://github.com/red1oon/bim-ootb/issues/873)) ([aa57fc3](https://github.com/red1oon/bim-ootb/commit/aa57fc367e659db0b24c291a7886a1eacb9f41bc))
* **viewer:** facade pax minimal — 1 standing figure per press, not 3, no walking at entrance ([#870](https://github.com/red1oon/bim-ootb/issues/870)) ([f1cb4c9](https://github.com/red1oon/bim-ootb/commit/f1cb4c9c06c0a1fab27c4544bede240cda191b31))
* **viewer:** ghost bbox grating on load — 3 placeholder row producers missed the [#839](https://github.com/red1oon/bim-ootb/issues/839) column shift ([#877](https://github.com/red1oon/bim-ootb/issues/877)) ([6774257](https://github.com/red1oon/bim-ootb/commit/6774257beb9b031cfda996f6406ffe255c6fc9cd))
* **viewer:** pax placement generalizes to complex footprints (Terminal was landing 0 pax) ([#879](https://github.com/red1oon/bim-ootb/issues/879)) ([ee20bbe](https://github.com/red1oon/bim-ootb/commit/ee20bbe1c31bc04be57e5b7053e57215317fe8f7))
* **viewer:** staffage ground-snap over atrium voids + no indoor trees + rolling MaxQ ETA ([#892](https://github.com/red1oon/bim-ootb/issues/892)) ([80967f8](https://github.com/red1oon/bim-ootb/commit/80967f872e47a9256b1859dbe2cbe09b7f04c22f))
* **viewer:** staffage occlusion, camera-facing facade pose, car clearance + colour ([#872](https://github.com/red1oon/bim-ootb/issues/872)) ([f295ac1](https://github.com/red1oon/bim-ootb/commit/f295ac1977c7b7e73bb621d6c22a8e54694845d6))


### ♻️ Refactors

* **viewer:** extract §CINEMA_PATH shared orbit plan; MaxQ flies the identical cinematic path ([#886](https://github.com/red1oon/bim-ootb/issues/886)) ([bae786e](https://github.com/red1oon/bim-ootb/commit/bae786e08c28bc507dcfa5d6f137b83a49d3f9e6))

## [1.21.0](https://github.com/red1oon/bim-ootb/compare/v1.20.0...v1.21.0) (2026-07-18)


### ✨ Features

* **room-lens:** differentiate room-shell colours — restroom/kitchen/bedroom + synthetic-honesty ([#847](https://github.com/red1oon/bim-ootb/issues/847)) ([3cfedd7](https://github.com/red1oon/bim-ootb/commit/3cfedd77075ad0d1a0e67726d5d20510a398e944))
* **time-machine:** high-quality Movie Export — Alt+S-quality per storyboard beat ([#849](https://github.com/red1oon/bim-ootb/issues/849)) ([a25418e](https://github.com/red1oon/bim-ootb/commit/a25418e0fd7fa5b59751d38e3a3a79a0e3ee50a9))


### 🐛 Fixes

* **guide-shots:** Task-2 diagnosis + fix — camera/styling bug, not a rendering defect ([#838](https://github.com/red1oon/bim-ootb/issues/838)) ([01bc0b6](https://github.com/red1oon/bim-ootb/commit/01bc0b6681ecd44e68a5988d8ef7c38c3d7f7dd0))
* **modeller:** DiscWalker fixtures never borrow cat[0]'s mesh for an unmatched class ([#844](https://github.com/red1oon/bim-ootb/issues/844)) ([71950ed](https://github.com/red1oon/bim-ootb/commit/71950edd8191444c6284a243a4ee82a4078590cd))
* **modeller:** DiscWalker fixtures no longer z-fight against their own instanced twin ([#851](https://github.com/red1oon/bim-ootb/issues/851)) ([58334dd](https://github.com/red1oon/bim-ootb/commit/58334dd68a5b04b9fa1aa207c42b70fb39edbc51))
* **modeller:** X-ray reveal — correct glass/glow classification + depth-adaptive opacity ([#846](https://github.com/red1oon/bim-ootb/issues/846)) ([0885b74](https://github.com/red1oon/bim-ootb/commit/0885b74253b80637e2d6aaa9948ae62954bd1f75))
* **offline:** precache Alt+P staffage textures ([#860](https://github.com/red1oon/bim-ootb/issues/860)) ([b756228](https://github.com/red1oon/bim-ootb/commit/b7562289006794983fbf7d4085d827065b78b6f0))
* **offline:** precache EffectComposer/SSAO/Outline/TAA/RenderPass/OutputPass ([#861](https://github.com/red1oon/bim-ootb/issues/861)) ([e2da25f](https://github.com/red1oon/bim-ootb/commit/e2da25f23b4265dccda00ea7d50a8d3dae5e2445))
* **rates:** locale productivity deep-merge + gantt cache version bump ([#853](https://github.com/red1oon/bim-ootb/issues/853)) ([782e244](https://github.com/red1oon/bim-ootb/commit/782e2447831f3f13c5a4009bb77761d9c6503fa4))
* real car mesh never rendered (missing boundingSphere + render-loop race) ([#857](https://github.com/red1oon/bim-ootb/issues/857)) ([eb614be](https://github.com/red1oon/bim-ootb/commit/eb614bec666300eb78f5655cc27e6d3b61f65cb2))
* **sw:** bump CACHE_VERSION v792 -&gt; v793 (missed across [#852](https://github.com/red1oon/bim-ootb/issues/852)/[#853](https://github.com/red1oon/bim-ootb/issues/853)/[#859](https://github.com/red1oon/bim-ootb/issues/859)) ([#862](https://github.com/red1oon/bim-ootb/issues/862)) ([8e14c6f](https://github.com/red1oon/bim-ootb/commit/8e14c6f20d260343cecf6cb7e9717a2cabd468c4))
* **time-machine:** §TM_GI_HOLD_CAMGUARD — pose guard on the N8AO 300ms hold-converge loop ([#848](https://github.com/red1oon/bim-ootb/issues/848)) ([a13bb0d](https://github.com/red1oon/bim-ootb/commit/a13bb0dbb4cf30ce8adde7b4e70398107293cdfc))
* **time-machine:** drop #tm-share button, don't restore it ([#852](https://github.com/red1oon/bim-ootb/issues/852)) ([a5f0415](https://github.com/red1oon/bim-ootb/commit/a5f0415099f2787c4fd24eb84d373b834a8149ee))
* **time-machine:** streaming re-sweeps TM visibility on new geometry arrival ([#859](https://github.com/red1oon/bim-ootb/issues/859)) ([8354c30](https://github.com/red1oon/bim-ootb/commit/8354c308081f99d8680382e601b17c184d0ac0bd))
* **viewer:** car mesh axis remap + ground offset; status bar shows car count (W-STAFFAGE-ZERO cont.) ([#858](https://github.com/red1oon/bim-ootb/issues/858)) ([3416b0b](https://github.com/red1oon/bim-ootb/commit/3416b0b90b29ee40c5bac18d5d6a81e7a263fc48))


### 📝 Documentation

* **disc-walker:** close out the double-render finding — fixed as PR [#851](https://github.com/red1oon/bim-ootb/issues/851) ([#855](https://github.com/red1oon/bim-ootb/issues/855)) ([7dadc88](https://github.com/red1oon/bim-ootb/commit/7dadc88a77764eebc1a77412cdd0928277d215c1))


### ⏪ Reverts

* retire Movie Export, Alt+G auto-engage, yellow frontier box ([#850](https://github.com/red1oon/bim-ootb/issues/850)) ([a3fc220](https://github.com/red1oon/bim-ootb/commit/a3fc220d01b8182919f048de9754e029f6e35a13))

## [1.20.0](https://github.com/red1oon/bim-ootb/compare/v1.19.0...v1.20.0) (2026-07-17)


### ✨ Features

* **time-machine:** re-accumulate Alt+G N8AO after ~300ms hold (polish held frame) ([#837](https://github.com/red1oon/bim-ootb/issues/837)) ([ac96aad](https://github.com/red1oon/bim-ootb/commit/ac96aad114b23e4b24b5714c11d9621f99ecbf55))
* **viewer:** §THIN-GRAPH-RECURE — one ✈ press self-cures stale compiled rooms ([#834](https://github.com/red1oon/bim-ootb/issues/834)) ([d7f5939](https://github.com/red1oon/bim-ootb/commit/d7f59392a1df578d70e1d0f25ae246f575d7c0ab))
* **viewer:** Alt+C for Cinema Orbit, add to Help palette, panel clicks soft-cancel not full-cancel ([#831](https://github.com/red1oon/bim-ootb/issues/831)) ([5c5f79a](https://github.com/red1oon/bim-ootb/commit/5c5f79a6b891d282efef4dbdc89b59dcd61e40a8))
* **viewer:** dramatic whole-ground reflectivity preset on tune HUD open ([#824](https://github.com/red1oon/bim-ootb/issues/824)) ([d8d64a8](https://github.com/red1oon/bim-ootb/commit/d8d64a81b0cbdb9af6311f39613e572c180d7f2c))
* **viewer:** Fly tour round 6 — corridor-spine itinerary, type dedupe, per-storey budget, real stair-flight climbs ([#815](https://github.com/red1oon/bim-ootb/issues/815)) ([531c1f1](https://github.com/red1oon/bim-ootb/commit/531c1f10669a23c83fb49508337c33db208b2b83))
* **viewer:** ground reflectivity sliders on the SSGI tune HUD ([#821](https://github.com/red1oon/bim-ootb/issues/821)) ([7eaef4d](https://github.com/red1oon/bim-ootb/commit/7eaef4de06c703966f4d615d7256255566c6843d))
* **viewer:** live SSGI tuning HUD for Alt+J, replaces blind guess/deploy cycles ([#818](https://github.com/red1oon/bim-ootb/issues/818)) ([a2c8dcc](https://github.com/red1oon/bim-ootb/commit/a2c8dcc91e0648a2b9285a4870a7befce4fa6b90))
* **viewer:** metal-strength dial drives full-surface puddle wetness, HUD close button ([#826](https://github.com/red1oon/bim-ootb/issues/826)) ([41b30c9](https://github.com/red1oon/bim-ootb/commit/41b30c9232e9110099b53b41772fd4bc817faac7))
* **viewer:** split tune HUD into Light/Noise groups, add denoiseKernel + ground metalness ([#822](https://github.com/red1oon/bim-ootb/issues/822)) ([b9b38a7](https://github.com/red1oon/bim-ootb/commit/b9b38a7f9b3442671c9ba5465e02b30df4eeaef4))


### 🐛 Fixes

* **viewer:** §MAJORITY-LEGAL tour gate — reject routes whose chords are mostly wall-illegal ([#835](https://github.com/red1oon/bim-ootb/issues/835)) ([2d57051](https://github.com/red1oon/bim-ootb/commit/2d57051a9bc7e2adf4496920f51d33e6a2a2fefd))
* **viewer:** §PATCH-FRAME-GUARD — never trust room patches from another building/frame ([#833](https://github.com/red1oon/bim-ootb/issues/833)) ([f409f8a](https://github.com/red1oon/bim-ootb/commit/f409f8a8fefa6016bd9e95405b1deee56264835a))
* **viewer:** contain ground reflectivity to S+J only, mid-value default, rename dial to 'reflect' ([#827](https://github.com/red1oon/bim-ootb/issues/827)) ([1e10405](https://github.com/red1oon/bim-ootb/commit/1e104058fc08a0739da3c097ea7d5bc3ac35ea61))
* **viewer:** default Alt+S back to AO-only fold, SSGI stays opt-in via Alt+J ([#817](https://github.com/red1oon/bim-ootb/issues/817)) ([ed9b693](https://github.com/red1oon/bim-ootb/commit/ed9b693bd630577fd4af34f1c7313d5d034b698f))
* **viewer:** Find-panel select hang on large buildings — shader in material.userData made every clone JSON-serialize GLSL+textures ([#811](https://github.com/red1oon/bim-ootb/issues/811)) ([e94944e](https://github.com/red1oon/bim-ootb/commit/e94944e747cfa35238a51bf2bba3bfd6704537da))
* **viewer:** ground metallic is a permanent base, not tied to Alt+J on/off ([#825](https://github.com/red1oon/bim-ootb/issues/825)) ([ce629cb](https://github.com/red1oon/bim-ootb/commit/ce629cb42604e4cd8b929394a26dee1b9079779f))
* **viewer:** ground-wetness default was gated behind the staging refire-skip guard ([#830](https://github.com/red1oon/bim-ootb/issues/830)) ([a9f05d2](https://github.com/red1oon/bim-ootb/commit/a9f05d2c22801424a7b025b81039b4ff86c0c843))
* **viewer:** single-item pick always gets x-ray-dim, cheap filter only for multi-select ([#819](https://github.com/red1oon/bim-ootb/issues/819)) ([ca65ddd](https://github.com/red1oon/bim-ootb/commit/ca65dddf386c4470255b31bc6d6b0151551d7c32))
* **viewer:** SSGI still-fold ghosting — camera-pose guard + SVGF hard-reset ([#816](https://github.com/red1oon/bim-ootb/issues/816)) ([7c2ba07](https://github.com/red1oon/bim-ootb/commit/7c2ba07c3a5d2339b3162a5c6a8d4bf887174271))
* **viewer:** stop full-DB IDB export on observational kernel ops (ELEMENT_PICK/BUILDING_OPEN) ([#808](https://github.com/red1oon/bim-ootb/issues/808)) ([4c0f4a0](https://github.com/red1oon/bim-ootb/commit/4c0f4a06fd3adb65ce71a7484152faad774a86c6))
* **viewer:** tune HUD wasn't showing — stale guard from the disabled auto still-fold ([#820](https://github.com/red1oon/bim-ootb/issues/820)) ([f09ec7a](https://github.com/red1oon/bim-ootb/commit/f09ec7af6d3af0cd344af06dd73b62f9528c7826))
* **viewer:** wetness now boosts metalness too, tune panel no longer leaks into Alt+S teardown ([#828](https://github.com/red1oon/bim-ootb/issues/828)) ([c04ece3](https://github.com/red1oon/bim-ootb/commit/c04ece30a6a5669248016401aa691d1ea538da07))
* **viewer:** x-ray-dim gate keys on zoom (opts.frame), not selection count ([#823](https://github.com/red1oon/bim-ootb/issues/823)) ([3ef24c5](https://github.com/red1oon/bim-ootb/commit/3ef24c569e6482060dfcc9fa2ae26b988570ddeb))


### 📝 Documentation

* **viewer:** fix stale comment describing a reverted permanent-metallic-ground design ([#829](https://github.com/red1oon/bim-ootb/issues/829)) ([afe91a1](https://github.com/red1oon/bim-ootb/commit/afe91a1438baccf8de73bf555b77e18aaf3e56ad))

## [1.19.0](https://github.com/red1oon/bim-ootb/compare/v1.18.0...v1.19.0) (2026-07-16)


### ✨ Features

* **viewer:** Alt+S still-refine — progressive TAA supersample on idle ([#801](https://github.com/red1oon/bim-ootb/issues/801)) ([0539621](https://github.com/red1oon/bim-ootb/commit/0539621fdac14dfb496b4f93be2f77bf63b5f840))
* **viewer:** night mode — facade glazing glows whitish, lit-from-inside look ([#798](https://github.com/red1oon/bim-ootb/issues/798)) ([8d37a27](https://github.com/red1oon/bim-ootb/commit/8d37a27ba4bdea37071e6f40c572ef90239aea66))


### 🐛 Fixes

* **rooms:** Hospital corridor join-ratio (4.5%→17.8%) + baseline witness + 2 room-lens fixes ([#800](https://github.com/red1oon/bim-ootb/issues/800)) ([7c548fa](https://github.com/red1oon/bim-ootb/commit/7c548facde9711094efabddb81fcb34cf220f4bd))
* **rooms:** JKR walkable raster + fix build script's missing corridor-rect union ([#803](https://github.com/red1oon/bim-ootb/issues/803)) ([e64fe3f](https://github.com/red1oon/bim-ootb/commit/e64fe3f0b5edaece6be846b73e5d04bc094d1536))
* **rooms:** Terminal's stale room-coordinate patch + raster slack-parity fix ([#804](https://github.com/red1oon/bim-ootb/issues/804)) ([7fd0bd0](https://github.com/red1oon/bim-ootb/commit/7fd0bd0ae9b6ddaa0b65bbb95b67ed848662ab62))
* **viewer:** sync HHS walkable raster to the file the live Viewer fetches + rebuild it correctly ([#802](https://github.com/red1oon/bim-ootb/issues/802)) ([0898f4c](https://github.com/red1oon/bim-ootb/commit/0898f4c76d730e38c69ce0c3c2f63ebd5d8c5762))

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
