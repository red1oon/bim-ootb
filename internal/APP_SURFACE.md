# APP surface — generated index

> **Generated. Do not hand-edit.** `node scripts/gen_app_surface.js`
> Spec: `scripts/gen_app_surface.js` §W-APP-SURFACE. See CodeScrapBook §2 and §14.

The viewer god object is **written as `A.x`** (every module is `setupX(A)`) and
**read as `APP.x`**. Same object, two spellings — so `grep 'APP.camera ='` finds
nothing. This index is the missing "go to definition".

| | |
|---|---:|
| files scanned | 2261 |
| distinct fields | 1719 |
| written only as `A.x`/`app.x` (invisible to an `APP.` grep) | 1400 |
| read but never written (phantom) | 235 |
| — of those, read from production code | 163 |

## Phantom fields — read, never written

Each is a guard that can never be true, or a writer that was removed. Check before use.

| field | first read site | prod? |
|---|---|---|
| `APP.KernelOps` | `viewer/cpe_ledger_ticker.js:62` | **yes** |
| `APP.L` | `viewer/tests/witness_colour_truth_gpu.js:153` | no |
| `APP.LABOR_RATES` | `viewer/cpe_resource_panel.js:43` | **yes** |
| `APP.LIB_URL` | `tests/specs/10-deploy-integrity.spec.js:78` | no |
| `APP.NIGHT_LIGHT_INTENSITY_BASE` | `viewer/effects.js:4510` | **yes** |
| `APP._allRoomVolumes` | `scripts/probe_buildpass_v2.js:80` | no |
| `APP._ambienceTick` | `viewer/streaming.js:1296` | **yes** |
| `APP._applyGroundTexture` | `viewer/effects.js:4351` | **yes** |
| `APP._applyNightGlowToMatCache` | `viewer/effects.js:610` | **yes** |
| `APP._applyPendingPatch` | `viewer/cpe_escape_route.js:523` | **yes** |
| `APP._billboardImage` | `viewer/effects.js:2265` | **yes** |
| `APP._bomDb` | `viewer/doc_canvas.js:512` | **yes** |
| `APP._buildPill` | `viewer/panels.js:1032` | **yes** |
| `APP._cinemaOrbitActive` | `viewer/dlod_nav.js:400` | **yes** |
| `APP._civilGlowPts` | `viewer/tests/witness_civil_night_lamps.js:98` | no |
| `APP._civilGlowSync` | `viewer/effects.js:4585` | **yes** |
| `APP._collectAllMeshes` | `viewer/tests/witness_mep_disc_palette.js:89` | no |
| `APP._concrete` | `viewer/streaming.js:1659` | **yes** |
| `APP._concreteTileM` | `viewer/streaming.js:1660` | **yes** |
| `APP._cpeViewfinderRender` | `viewer/main.js:805` | **yes** |
| `APP._csmNearFix` | `viewer/effects.js:3482` | **yes** |
| `APP._debugForceGhostLensOwned` | `witness/witness_bbox_ghost_stuck.js:65` | no |
| `APP._debugGhostLensOwned` | `witness/witness_bbox_ghost_stuck.js:65` | no |
| `APP._egressRulesCache` | `viewer/rule_checklist.js:887` | **yes** |
| `APP._egressRulesSource` | `viewer/rule_checklist.js:887` | **yes** |
| `APP._envCache` | `tests/specs/20-s250-polish.spec.js:294` | no |
| `APP._fieldTrace` | `viewer/light_zones.js:1098` | **yes** |
| `APP._filmBounceOff` | `viewer/gi_still.js:1405` | **yes** |
| `APP._filmExpOff` | `viewer/effects.js:4906` | **yes** |
| `APP._filmInheritOff` | `viewer/effects.js:4865` | **yes** |
| `APP._filmParityOff` | `viewer/effects.js:4314` | **yes** |
| `APP._findRefreshTree` | `viewer/scene.js:1336` | **yes** |
| `APP._fixFaceU` | `viewer/sourced_light.js:1537` | **yes** |
| `APP._fixtureFaceApply` | `viewer/effects.js:6200` | **yes** |
| `APP._fixtureFaceRestore` | `viewer/effects.js:5804` | **yes** |
| `APP._glowSpriteCount` | `scripts/probe_glow_night.js:37` | no |
| `APP._gradePass` | `witness/witness_photo_grade.js:58` | no |
| `APP._gridGroup` | `tests/specs/20-s250-polish.spec.js:250` | no |
| `APP._gridOverlayState` | `viewer/scene.js:2513` | **yes** |
| `APP._groundSolidColor` | `viewer/effects.js:4350` | **yes** |
| `APP._groundTexKey` | `viewer/effects.js:4269` | **yes** |
| `APP._groupBy` | `viewer/tests/witness_mep_disc_palette.js:89` | no |
| `APP._hbaClassFilter` | `viewer/hba_lens.js:472` | **yes** |
| `APP._hbaPeriod` | `viewer/hba_avatars.js:63` | **yes** |
| `APP._jsonRegistry` | `viewer/measure.js:946` | **yes** |
| `APP._lampShadowClear` | `viewer/tools.js:2567` | **yes** |
| `APP._lampShadowLights` | `viewer/tools.js:2552` | **yes** |
| `APP._lampShadowPick` | `viewer/tools.js:2828` | **yes** |
| `APP._lampZonePick` | `viewer/tools.js:2616` | **yes** |
| `APP._lampZoneView` | `viewer/tools.js:2612` | **yes** |
| `APP._lightFieldByBuilding` | `viewer/main.js:1295` | **yes** |
| `APP._loadPrebake` | `viewer/main.js:1294` | **yes** |
| `APP._lpContext` | `viewer/cpe_load_path.js:3434` | **yes** |
| `APP._lpTwins` | `viewer/cpe_load_path.js:2690` | **yes** |
| `APP._mainPillActions` | `hr_bim_asset/tests/live/action_regression.js:19` | no |
| `APP._mepProxyOff` | `viewer/streaming.js:878` | **yes** |
| `APP._nav` | `tests/specs/17-find-navigate.spec.js:337` | **yes** |
| `APP._nightFixtureList` | `viewer/tests/witness_civil_fresh_import_fly.js:82` | no |
| `APP._nightFixtureSource` | `viewer/tests/witness_civil_night_lamps.js:103` | no |
| `APP._nightFixtureWorldPositions` | `scripts/probe_glow_diag.js:41` | **yes** |
| `APP._nightFixtures` | `scripts/probe_night.js:18` | **yes** |
| `APP._nightGlowClasses` | `scripts/probe_night.js:19` | no |
| `APP._nightGlowMats` | `scripts/probe_night.js:20` | **yes** |
| `APP._nightLightDecayDefault` | `viewer/effects.js:5000` | **yes** |
| `APP._nightMaxLightsNav` | `viewer/effects.js:5812` | **yes** |
| `APP._nightMaxLightsStill` | `viewer/effects.js:2679` | **yes** |
| `APP._nightMode` | `viewer/city.js:385` | **yes** |
| `APP._nightNearFadeFloorStill` | `viewer/effects.js:2680` | **yes** |
| `APP._nightPLScaleStill` | `viewer/effects.js:4489` | **yes** |
| `APP._nightSaved` | `viewer/effects.js:4502` | **yes** |
| `APP._nightStillBoost` | `viewer/effects.js:6137` | **yes** |
| `APP._openJsonEditor` | `viewer/measure.js:947` | **yes** |
| `APP._photoDuskMood` | `viewer/effects.js:4428` | **yes** |
| `APP._photoFacadeLightsDbg` | `scripts/probe_facade_warm_cool.js:56` | no |
| `APP._placeholderOff` | `viewer/streaming.js:1406` | **yes** |
| `APP._prebake` | `viewer/cpe_load_path.js:2424` | **yes** |
| `APP._prebakeFnv` | `viewer/cpe_load_path.js:2419` | **yes** |
| `APP._prebakeOut` | `viewer/cpe_load_path.js:2496` | **yes** |
| `APP._prebakeRecord` | `cli_silent_bake.js:1030` | **yes** |
| `APP._probeAimDepth` | `witness/witness_cpe_aim_retire.js:355` | no |
| `APP._rangeDb` | `viewer/clash_narrow.js:379` | **yes** |
| `APP._secMode` | `viewer/tests/witness_civil_sections.js:400` | no |
| `APP._setGroundColor` | `scripts/probe_ground_albedo.js:38` | **yes** |
| `APP._setTreeMode` | `witness/witness_bbox_ghost_stuck.js:65` | no |
| `APP._shadowGroundKey` | `viewer/tests/witness_pill_drawer_followup_2026-07-06.js:127` | no |
| `APP._shadowOn` | `tests/specs/99-shadow-perf.spec.js:38` | **yes** |
| `APP._shellTrace` | `viewer/light_zones.js:1121` | **yes** |
| `APP._show4DWindow` | `viewer/tests/witness_s7_canvas_pick.js:77` | no |
| `APP._stillAlbedoCap` | `viewer/effects.js:4644` | **yes** |
| `APP._stillAo` | `viewer/gi_still.js:534` | **yes** |
| `APP._stillAoLamps` | `viewer/effects.js:5625` | **yes** |
| `APP._stillCalib` | `viewer/effects.js:4506` | **yes** |
| `APP._stillCapCentre` | `viewer/light_zones.js:337` | **yes** |
| `APP._stillContact` | `viewer/sourced_light.js:353` | **yes** |
| `APP._stillExpMul` | `viewer/effects.js:4668` | **yes** |
| `APP._stillFloorContact` | `viewer/sourced_light.js:339` | **yes** |
| `APP._stillFloorFSmooth` | `viewer/sourced_light.js:1424` | **yes** |
| `APP._stillGiAlb` | `viewer/gi_still.js:866` | **yes** |
| `APP._stillGiBound` | `viewer/gi_still.js:858` | **yes** |
| `APP._stillGiRedist` | `viewer/gi_still.js:862` | **yes** |
| `APP._stillGlassBlock` | `viewer/light_zones.js:959` | **yes** |
| `APP._stillGlassEnv` | `viewer/glass_fresnel.js:123` | **yes** |
| `APP._stillGlassTone` | `viewer/sourced_light.js:929` | **yes** |
| `APP._stillGroundLaw` | `viewer/effects.js:4267` | **yes** |
| `APP._stillGroundMode` | `viewer/light_zones.js:860` | **yes** |
| `APP._stillIr` | `viewer/sourced_light.js:657` | **yes** |
| `APP._stillIrColour` | `viewer/sourced_light.js:661` | **yes** |
| `APP._stillIrc` | `viewer/light_zones.js:148` | **yes** |
| `APP._stillLampCapNearest` | `viewer/tools.js:2653` | **yes** |
| `APP._stillLampData` | `viewer/sourced_light.js:557` | **yes** |
| `APP._stillLampEn` | `viewer/sourced_light.js:786` | **yes** |
| `APP._stillLocalExp` | `viewer/gi_still.js:1036` | **yes** |
| `APP._stillMeterMode` | `viewer/effects.js:4917` | **yes** |
| `APP._stillObjContact` | `viewer/sourced_light.js:327` | **yes** |
| `APP._stillPortalSort` | `viewer/sky_portal.js:154` | **yes** |
| `APP._stillPortalsKeep` | `viewer/sky_portal.js:107` | **yes** |
| `APP._stillShadowCascade` | `viewer/effects.js:3269` | **yes** |
| `APP._stillShadowEdge` | `viewer/effects.js:3226` | **yes** |
| `APP._stillShellCull` | `viewer/light_zones.js:1134` | **yes** |
| `APP._stillShellReach` | `viewer/light_zones.js:852` | **yes** |
| `APP._stillSkyExactAllN` | `viewer/light_zones.js:790` | **yes** |
| `APP._stillSkyExactAllShell` | `viewer/light_zones.js:813` | **yes** |
| `APP._stillSkyExactCov` | `viewer/light_zones.js:812` | **yes** |
| `APP._stillSkyOpenRoof` | `viewer/light_zones.js:805` | **yes** |
| `APP._stillSrgbFix` | `viewer/effects.js:4642` | **yes** |
| `APP._stillTorch` | `viewer/effects.js:4950` | **yes** |
| `APP._storeyOrdinalKeys` | `viewer/tests/witness_sunglass_grouping_rules.js:67` | no |
| `APP._streaming` | `tests/specs/s271-mobile-perf.spec.js:84` | no |
| `APP._structuralRulesCache` | `viewer/rule_checklist.js:811` | **yes** |
| `APP._structuralRulesSource` | `viewer/rule_checklist.js:811` | **yes** |
| `APP._sunglassBackups` | `viewer/streaming.js:1297` | **yes** |
| `APP._swCacheVersion` | `viewer/rule_checklist.js:367` | **yes** |
| `APP._teardownStillRefine` | `scripts/probe_ground_albedo.js:85` | no |
| `APP._tmState` | `tests/whitebox_regression.js:963` | no |
| `APP._updateFacadeFacing` | `scripts/probe_facade_warm_cool.js:88` | no |
| `APP._useRangeStream` | `viewer/clash_narrow.js:401` | **yes** |
| `APP._walkMode` | `viewer/panels.js:1374` | **yes** |
| `APP.advanceNavStep` | `viewer/tests/witness_room_cycle_home_2026-07-22.js:241` | no |
| `APP.applicable` | `viewer/tests/witness_speed_zones.js:379` | no |
| `APP.applyFindScope` | `modeller/tests/witness_s9_modeller_project.js:129` | **yes** |
| `APP.askAnswers` | `viewer/tests/witness_find_ask_answers.js:185` | no |
| `APP.askBuildWorkbook` | `viewer/tests/witness_find_ask_answers.js:202` | no |
| `APP.askInput` | `viewer/tests/witness_find_ask_answers.js:189` | no |
| `APP.askRun` | `viewer/tests/witness_find_ask_answers.js:127` | no |
| `APP.askSuggest` | `viewer/tests/witness_find_ask_answers.js:105` | no |
| `APP.buildRouteTemplate` | `tests/specs/17-find-navigate.spec.js:585` | no |
| `APP.buildingName` | `viewer/hba_iot.js:268` | **yes** |
| `APP.clearFocusElement` | `viewer/main.js:77` | **yes** |
| `APP.clientName` | `erp/overlay/pills.js:27` | **yes** |
| `APP.closeFindPanel` | `viewer/nlp.js:666` | **yes** |
| `APP.closeSunglass` | `viewer/main.js:357` | **yes** |
| `APP.column` | `viewer/tests/witness_speed_zones.js:380` | no |
| `APP.composeGhostsFromAggregates` | `viewer/streaming.js:3777` | **yes** |
| `APP.contributeBuilding` | `tests/specs/20-s250-polish.spec.js:338` | no |
| `APP.counts` | `viewer/tests/witness_speed_zones.js:378` | no |
| `APP.currentBuilding` | `viewer/cpe_room_title.js:296` | **yes** |
| `APP.cycleXrayBboxMode` | `viewer/scene.js:3490` | **yes** |
| `APP.ensureRooms` | `scripts/probe_band_len.js:23` | **yes** |
| `APP.error` | `viewer/tests/witness_colour_truth_gpu.js:151` | no |
| `APP.export4D5D` | `viewer/main.js:339` | **yes** |
| `APP.fault` | `viewer/tests/witness_light_field_db.js:98` | no |
| `APP.faultGi` | `viewer/tests/witness_light_field_db.js:103` | no |
| `APP.fieldSweepMs` | `viewer/tests/witness_light_field_db.js:96` | no |
| `APP.focusElement` | `viewer/chainage_grid.js:490` | **yes** |
| `APP.freezePerfBuild` | `viewer/cinema_maxq.js:3478` | **yes** |
| `APP.freezePerfCompositeOntoCanvas` | `viewer/cpe_load_path.js:4665` | **yes** |
| `APP.friendlyName` | `viewer/cpe_room_title.js:277` | **yes** |
| `APP.getRouteTemplate` | `tests/specs/17-find-navigate.spec.js:639` | no |
| `APP.giBlown` | `viewer/tests/witness_light_field_db.js:104` | no |
| `APP.glassMs` | `viewer/tests/witness_light_field_db.js:96` | no |
| `APP.glassReflDark` | `viewer/tests/witness_light_field_db.js:98` | no |
| `APP.groundIfcZ` | `viewer/cinema_maxq.js:296` | **yes** |
| `APP.integrity` | `viewer/tests/witness_light_field_db.js:94` | no |
| `APP.kernelOps` | `viewer/time_machine.js:9630` | **yes** |
| `APP.lightTheme` | `viewer/grid_contours.js:107` | **yes** |
| `APP.materializeZones` | `optics_hud.js:34` | **yes** |
| `APP.minAreaRect` | `viewer/measure.js:1408` | **yes** |
| `APP.navJumpToEnd` | `tests/specs/17-find-navigate.spec.js:179` | no |
| `APP.nightFixtureColor` | `viewer/effects.js:5001` | **yes** |
| `APP.nightFixtureShape` | `viewer/effects.js:4531` | **yes** |
| `APP.nightLightColor` | `scripts/probe_mix.js:9` | no |
| `APP.pageErrors` | `viewer/tests/witness_colour_truth_gpu.js:151` | no |
| `APP.paramsToParas` | `erp/idempiere.html:4169` | **yes** |
| `APP.parasToParams` | `erp/idempiere.html:4188` | **yes** |
| `APP.pinstanceList` | `erp/idempiere.html:4153` | **yes** |
| `APP.poses` | `viewer/tests/witness_colour_truth_gpu.js:141` | no |
| `APP.probeGradeHdr` | `scripts/probe_grade_hdr.js:20` | no |
| `APP.refreshSectionModes` | `viewer/civil_sections.js:682` | **yes** |
| `APP.resetCinemaGhostLens` | `viewer/cinema_maxq.js:2598` | **yes** |
| `APP.resident` | `viewer/tests/witness_light_field_db.js:106` | no |
| `APP.resourcePanelCompositeOntoCanvas` | `optics_hud.js:96` | **yes** |
| `APP.rowBytes` | `viewer/tests/witness_light_field_db.js:94` | no |
| `APP.rowFileDelta` | `viewer/tests/witness_light_field_db.js:94` | no |
| `APP.rowRaw` | `viewer/tests/witness_light_field_db.js:94` | no |
| `APP.rows` | `viewer/tests/witness_speed_zones.js:379` | no |
| `APP.runPanelAction` | `viewer/main.js:1274` | **yes** |
| `APP.saveLines` | `viewer/tests/witness_light_field_db.js:94` | no |
| `APP.saveMs` | `viewer/tests/witness_light_field_db.js:94` | no |
| `APP.saveWallMs` | `viewer/tests/witness_light_field_db.js:94` | no |
| `APP.savedBytes` | `viewer/tests/witness_light_field_db.js:94` | no |
| `APP.screenshot` | `viewer/main.js:330` | **yes** |
| `APP.sectionModes` | `viewer/civil_sections.js:665` | **yes** |
| `APP.setSectionAxis` | `viewer/main.js:354` | **yes** |
| `APP.shellPassMs` | `viewer/tests/witness_light_field_db.js:96` | no |
| `APP.sky` | `viewer/effects.js:1001` | **yes** |
| `APP.sourcedStage` | `viewer/tests/witness_light_field_db.js:96` | no |
| `APP.srcBytes` | `viewer/tests/witness_light_field_db.js:94` | no |
| `APP.stagingTotal` | `viewer/tests/witness_light_field_db.js:96` | no |
| `APP.startFlyTour` | `viewer/main.js:1218` | **yes** |
| `APP.startMaxQ` | `scripts/probe_bake_start.js:22` | no |
| `APP.startNavigation` | `viewer/navigate.js:37` | **yes** |
| `APP.std` | `viewer/tests/witness_colour_truth_gpu.js:176` | no |
| `APP.sw` | `viewer/tests/witness_colour_truth_gpu.js:151` | no |
| `APP.toast` | `viewer/dlod_nav.js:2005` | **yes** |
| `APP.toggleBackground` | `viewer/main.js:362` | **yes** |
| `APP.toggleFullscreen` | `viewer/main.js:331` | **yes** |
| `APP.toggleGridOverlay` | `tests/specs/28-grid-overlay-init.spec.js:25` | **yes** |
| `APP.toggleNightMode` | `scripts/probe_glow_diag.js:36` | **yes** |
| `APP.toggleSection` | `tests/specs/33-gf-contour-verify.spec.js:149` | **yes** |
| `APP.toggleShadow` | `tests/specs/99-shadow-perf.spec.js:36` | **yes** |
| `APP.toggleSunglass` | `viewer/main.js:356` | **yes** |
| `APP.toggleTheme` | `viewer/main.js:332` | **yes** |
| `APP.toggleXray` | `viewer/cinema_maxq.js:2601` | **yes** |
| `APP.updateAmbience` | `viewer/main.js:358` | **yes** |
| `APP.updateLighting` | `viewer/main.js:359` | **yes** |
| `APP.updateSectionPlane` | `viewer/main.js:355` | **yes** |
| `APP.v` | `viewer/tests/witness_colour_truth_gpu.js:151` | no |
| `APP.vacuous` | `viewer/tests/witness_speed_zones.js:370` | no |
| `APP.viewer` | `scripts/probe_drag_scale.js:39` | no |
| `APP.walkSpeed` | `tests/specs/03-walk-sitecam-cycle.spec.js:227` | no |
| `APP.wireOn` | `viewer/streaming.js:2238` | **yes** |
| `APP.x0` | `viewer/chainage_grid.js:39` | **yes** |
| `APP.x1` | `viewer/chainage_grid.js:39` | **yes** |
| `APP.y0` | `viewer/chainage_grid.js:39` | **yes** |
| `APP.y1` | `viewer/chainage_grid.js:39` | **yes** |

## All fields

| field | written at | writes | reads |
|---|---|---:|---:|
| `APP.BARE_METAL_PBR` | `viewer/streaming.js:762` *(as `A.`)* | 1 | 2 |
| `APP.BLANK_MODE` | `viewer/config.js:23` *(as `A.`)* | 1 | 4 |
| `APP.BLD_BASE` | `viewer/config.js:31` *(as `A.`)* | 1 | 4 |
| `APP.CACHE_DB_NAME` | `viewer/scene.js:537` *(as `A.`)* | 1 | 4 |
| `APP.CACHE_STORE` | `viewer/scene.js:538` *(as `A.`)* | 1 | 41 |
| `APP.CITY_URL` | `viewer/config.js:30` *(as `A.`)* | 1 | 18 |
| `APP.CIVIL_EARTHWORK_OPACITY` | `viewer/streaming.js:1461` *(as `A.`)* | 1 | 2 |
| `APP.CONTRIBUTE_PAR` | `viewer/config.js:89` *(as `A.`)* | 1 | 5 |
| `APP.DB_URL` | `erp/kanban_lens.html:243` | 2 | 57 |
| `APP.DEFAULT_COLOR` | `viewer/config.js:49` *(as `A.`)* | 1 | 7 |
| `APP.DISC_COLORS` | `viewer/config.js:43` *(as `A.`)* | 1 | 32 |
| `APP.EMBEDDED` | `viewer/config.js:34` *(as `A.`)* | 1 | 3 |
| `APP.EXPORTER_PLACEHOLDER_MAT_NAMES` | `viewer/streaming.js:727` *(as `A.`)* | 1 | 2 |
| `APP.FIND_GUID` | `viewer/config.js:40` *(as `A.`)* | 1 | 9 |
| `APP.FLYTHRU_BOX_EDGES` | `viewer/cpe_flythru_dims.js:541` *(as `A.`)* | 1 | 1 |
| `APP.FLYTHRU_DRAW_CONTRACT` | `viewer/cpe_flythru_dims.js:386` *(as `A.`)* | 1 | 1 |
| `APP.HOME_URL` | `viewer/config.js:36` *(as `A.`)* | 1 | 4 |
| `APP.KernelOps` | — *phantom* | 0 | 1 |
| `APP.L` | — *phantom* | 0 | 2 |
| `APP.LABOR_PROD` | `viewer/config.js:68` *(as `A.`)* | 1 | 1 |
| `APP.LABOR_RATES` | — *phantom* | 0 | 1 |
| `APP.LIB_URL` | — *phantom* | 0 | 1 |
| `APP.MATERIAL_COSTS` | `viewer/config.js:52` *(as `A.`)* | 1 | 4 |
| `APP.MEP_HUE_ACHROMATIC_MAX` | `viewer/streaming.js:709` *(as `A.`)* | 1 | 9 |
| `APP.METAL_PBR_CLASSES` | `viewer/streaming.js:760` *(as `A.`)* | 1 | 4 |
| `APP.NIGHT_LIGHT_INTENSITY_BASE` | — *phantom* | 0 | 4 |
| `APP.PAN_SPEED` | `viewer/config.js:83` *(as `A.`)* | 1 | 2 |
| `APP.PHASE_MAP` | `viewer/config.js:74` *(as `A.`)* | 1 | 4 |
| `APP.PORCELAIN_PBR` | `viewer/streaming.js:744` *(as `A.`)* | 1 | 6 |
| `APP.PROD_BASE` | `viewer/config.js:21` *(as `A.`)* | 1 | 8 |
| `APP.PROXY_NAME_MAT` | `viewer/streaming.js:779` *(as `A.`)* | 1 | 2 |
| `APP.RECORD_ID` | `viewer/config.js:35` *(as `A.`)* | 1 | 1 |
| `APP.WALK_EYE_HEIGHT` | `viewer/config.js:81` *(as `A.`)* | 1 | 17 |
| `APP.WALK_SPEED` | `viewer/config.js:82` *(as `A.`)* | 1 | 5 |
| `APP.WALK_STEP_COOLDOWN_MS` | `viewer/config.js:86` *(as `A.`)* | 1 | 2 |
| `APP.WALK_STEP_DISTANCE` | `viewer/config.js:85` *(as `A.`)* | 1 | 4 |
| `APP.WALK_STEP_THRESHOLD` | `viewer/config.js:84` *(as `A.`)* | 1 | 3 |
| `APP._CACHE_MAX_BLOB_BYTES` | `viewer/scene.js:1802` *(as `A.`)* | 1 | 4 |
| `APP._CACHE_WRITE_TIMEOUT_MS` | `viewer/scene.js:1793` *(as `A.`)* | 1 | 5 |
| `APP._CLASH_PAGE_SIZE` | `viewer/clash_report.js:106` *(as `A.`)* | 10 | 22 |
| `APP._MAX_CACHE_ENTRIES` | `viewer/scene.js:648` *(as `A.`)* | 1 | 3 |
| `APP._MERGE_GEO_TABLES` | `viewer/scene.js:1063` *(as `A.`)* | 1 | 7 |
| `APP._MERGE_GUID_ROW_TABLES` | `viewer/scene.js:1066` *(as `A.`)* | 1 | 3 |
| `APP._MERGE_META_TABLES` | `viewer/scene.js:1060` *(as `A.`)* | 1 | 5 |
| `APP._SQL` | `viewer/streaming.js:3618` *(as `A.`)* | 1 | 35 |
| `APP._TRIPLANAR_BY_NAME` | `viewer/streaming.js:1753` *(as `A.`)* | 1 | 5 |
| `APP._TRIPLANAR_MAT` | `viewer/streaming.js:1752` *(as `A.`)* | 1 | 5 |
| `APP._TRI_BIG_CLASSES` | `viewer/streaming.js:920` *(as `A.`)* | 1 | 3 |
| `APP.__cpeAimOff` | `witness/witness_cpe_corr_brush.js:190` *(as `A.`)* | 2 | 2 |
| `APP.__frameQaCv` | `viewer/cinema_maxq.js:2322` *(as `A.`)* | 1 | 2 |
| `APP._allRoomVolumes` | — *phantom* | 0 | 2 |
| `APP._alphaOf` | `viewer/streaming.js:906` *(as `A.`)* | 1 | 9 |
| `APP._ambienceTick` | — *phantom* | 0 | 3 |
| `APP._aoExcludeWrap` | `viewer/effects.js:26` *(as `A.`)* | 1 | 3 |
| `APP._applyDiscVisibility` | `viewer/panels.js:837` *(as `A.`)* | 1 | 13 |
| `APP._applyGroundTexture` | — *phantom* | 0 | 4 |
| `APP._applyNightGlowToMatCache` | — *phantom* | 0 | 2 |
| `APP._applyPendingPatch` | — *phantom* | 0 | 5 |
| `APP._archGroundZ` | `viewer/city.js:274` *(as `A.`)* | 1 | 3 |
| `APP._areaBackups` | `viewer/measure.js:1242` *(as `A.`)* | 2 | 5 |
| `APP._areaCache` | `viewer/measure.js:1460` *(as `A.`)* | 1 | 4 |
| `APP._bakeCameraPoseAt` | `viewer/cinema_maxq.js:2992` *(as `A.`)* | 1 | 7 |
| `APP._bakeOwned` | `viewer/scene.js:547` *(as `A.`)* | 1 | 9 |
| `APP._bareMetalKey` | `viewer/streaming.js:765` *(as `A.`)* | 1 | 2 |
| `APP._batchDiscMap` | `viewer/streaming.js:2661` *(as `A.`)* | 1 | 6 |
| `APP._batchFlushCount` | `viewer/streaming.js:3287` *(as `A.`)* | 1 | 4 |
| `APP._batchMeta` | `viewer/streaming.js:2659` *(as `A.`)* | 1 | 178 |
| `APP._batchStoreyMap` | `viewer/streaming.js:2660` *(as `A.`)* | 1 | 6 |
| `APP._bboxCleared` | `viewer/streaming.js:434` *(as `A.`)* | 5 | 9 |
| `APP._bboxMaterial` | `viewer/helpers.js:535` *(as `A.`)* | 1 | 4 |
| `APP._bboxPlaceholder` | `viewer/streaming.js:520` *(as `A.`)* | 1 | 1 |
| `APP._bboxPlaceholders` | `viewer/streaming.js:524` *(as `A.`)* | 2 | 12 |
| `APP._bdEverDrawn` | `viewer/cinema_maxq.js:4004` *(as `A.`)* | 1 | 4 |
| `APP._bdSeenLast` | `viewer/cinema_maxq.js:3989` *(as `A.`)* | 1 | 4 |
| `APP._beamOffsetMats` | `viewer/streaming.js:2244` *(as `A.`)* | 1 | 3 |
| `APP._billboardAutoBuild` | `viewer/effects.js:2236` *(as `A.`)* | 1 | 3 |
| `APP._billboardFit` | `viewer/effects.js:2273` *(as `A.`)* | 1 | 3 |
| `APP._billboardImage` | — *phantom* | 0 | 4 |
| `APP._billboardNameState` | `viewer/effects.js:2443` *(as `A.`)* | 1 | 1 |
| `APP._bimGuidsForClass` | `viewer/main.js:48` | 1 | 2 |
| `APP._bimHighlight` | `viewer/main.js:55` | 1 | 3 |
| `APP._bimPostFocus` | `viewer/main.js:37` | 1 | 4 |
| `APP._blankHeld` | `viewer/cinema_maxq.js:4927` *(as `A.`)* | 1 | 3 |
| `APP._blobToThumbUrl` | `viewer/issues.js:67` *(as `A.`)* | 1 | 2 |
| `APP._bloomOff` | `viewer/effects.js:6086` *(as `A.`)* | 1 | 3 |
| `APP._bloomPass` | `viewer/effects.js:141` *(as `A.`)* | 1 | 15 |
| `APP._bmShapeWarned` | `viewer/streaming.js:135` *(as `A.`)* | 1 | 2 |
| `APP._bom` | `viewer/panels.js:1197` *(as `A.`)* | 2 | 19 |
| `APP._bomDb` | — *phantom* | 0 | 2 |
| `APP._bsDrawErrLogged` | `viewer/cinema_maxq.js:2147` *(as `A.`)* | 1 | 2 |
| `APP._buildBillboardArt` | `viewer/effects.js:2241` *(as `A.`)* | 1 | 3 |
| `APP._buildBillboardNamePlate` | `viewer/effects.js:2362` *(as `A.`)* | 1 | 3 |
| `APP._buildClashDeepLink` | `viewer/measure.js:794` *(as `A.`)* | 1 | 9 |
| `APP._buildExportHtml` | `viewer/clash_report.js:97` *(as `A.`)* | 1 | 5 |
| `APP._buildGraphRoute` | `viewer/tour.js:471` *(as `A.`)* | 1 | 3 |
| `APP._buildGraphRouteInner` | `viewer/tour.js:482` *(as `A.`)* | 1 | 2 |
| `APP._buildPill` | — *phantom* | 0 | 4 |
| `APP._buildSunglassPanel` | `viewer/panels.js:325` *(as `A.`)* | 1 | 2 |
| `APP._buildTourInner` | `viewer/tour.js:956` *(as `A.`)* | 1 | 2 |
| `APP._buildingCol` | `viewer/scene.js:1160` *(as `A.`)* | 4 | 8 |
| `APP._burninDatumDir` | `viewer/cinema_maxq.js:2610` *(as `A.`)* | 1 | 10 |
| `APP._burninFrameIdx` | `viewer/cinema_maxq.js:4698` | 1 | 2 |
| `APP._bvhPending` | `viewer/streaming.js:2416` *(as `A.`)* | 3 | 14 |
| `APP._bvhRunning` | `viewer/streaming.js:2418` *(as `A.`)* | 2 | 7 |
| `APP._cacheDisabled` | `viewer/scene.js:557` *(as `A.`)* | 3 | 9 |
| `APP._cacheHitLogged` | `viewer/scene.js:1698` *(as `A.`)* | 1 | 4 |
| `APP._cacheIssuesForExport` | `viewer/excel.js:9` *(as `A.`)* | 1 | 3 |
| `APP._cachedIssues` | `viewer/excel.js:7` *(as `A.`)* | 3 | 4 |
| `APP._cachedPairCounts` | `viewer/clash_report.js:10` *(as `A.`)* | 4 | 11 |
| `APP._calcGroundY` | `viewer/tools.js:8` *(as `A.`)* | 1 | 9 |
| `APP._camBimSnapshot` | `viewer/sitecam.js:33` *(as `A.`)* | 2 | 4 |
| `APP._camGpsPos` | `viewer/clash_snag.js:19` *(as `A.`)* | 5 | 31 |
| `APP._camHeading` | `viewer/sitecam.js:34` *(as `A.`)* | 3 | 15 |
| `APP._camLight` | `viewer/effects.js:4743` *(as `A.`)* | 1 | 26 |
| `APP._camOrientHandler` | `viewer/sitecam.js:35` *(as `A.`)* | 4 | 10 |
| `APP._camPhotoBlob` | `viewer/clash_snag.js:104` *(as `A.`)* | 4 | 4 |
| `APP._camStream` | `viewer/sitecam.js:29` *(as `A.`)* | 3 | 6 |
| `APP._camTimerIv` | `viewer/sitecam.js:32` *(as `A.`)* | 3 | 5 |
| `APP._camTorch` | `viewer/effects.js:4953` *(as `A.`)* | 1 | 30 |
| `APP._canvasCoords` | `viewer/sitecam.js:391` *(as `A.`)* | 1 | 3 |
| `APP._canvasPointerDown` | `viewer/picking.js:97` *(as `A.`)* | 4 | 5 |
| `APP._capMarks` | `viewer/cinema_maxq.js:1727` | 2 | 5 |
| `APP._capT0` | `viewer/cinema_maxq.js:1733` | 1 | 4 |
| `APP._captureCtx` | `viewer/cinema_maxq.js:1747` *(as `A.`)* | 1 | 1 |
| `APP._catFirst` | `scripts/probe_dim_catalogue.js:206` *(as `A.`)* | 1 | 2 |
| `APP._chainageDropGuid` | `viewer/tests/witness_chainage_grid.js:95` *(as `A.`)* | 2 | 5 |
| `APP._checkCache` | `viewer/scene.js:703` *(as `A.`)* | 1 | 5 |
| `APP._chromaOf` | `viewer/streaming.js:713` *(as `A.`)* | 1 | 10 |
| `APP._cinemaFanMeshesDebug` | `viewer/effects.js:7648` *(as `A.`)* | 1 | 5 |
| `APP._cinemaOrbitActive` | — *phantom* | 0 | 3 |
| `APP._cinemaPathEdit` | `viewer/effects.js:10664` *(as `A.`)* | 24 | 64 |
| `APP._cityAutoLoad` | `viewer/city.js:575` *(as `A.`)* | 1 | 4 |
| `APP._cityBlastDominant` | `viewer/city.js:943` *(as `A.`)* | 1 | 2 |
| `APP._cityBlastDominantFrac` | `viewer/city.js:943` *(as `A.`)* | 1 | 2 |
| `APP._cityBlastNearest` | `viewer/city.js:942` *(as `A.`)* | 1 | 1 |
| `APP._cityBlastNearestDist` | `viewer/city.js:942` *(as `A.`)* | 1 | 1 |
| `APP._cityBlowFarARC` | `viewer/city.js:869` *(as `A.`)* | 1 | 2 |
| `APP._cityBuildingAABB` | `viewer/city.js:436` *(as `A.`)* | 1 | 5 |
| `APP._cityBuildingBytes` | `viewer/city.js:84` *(as `A.`)* | 2 | 9 |
| `APP._cityBuildingElems` | `viewer/city.js:88` *(as `A.`)* | 2 | 11 |
| `APP._cityCounted` | `viewer/city.js:551` *(as `A.`)* | 2 | 2 |
| `APP._cityDiscGate` | `viewer/city.js:576` *(as `A.`)* | 1 | 3 |
| `APP._cityDoneElements` | `viewer/city.js:551` *(as `A.`)* | 2 | 2 |
| `APP._cityElemBudget` | `viewer/city.js:87` *(as `A.`)* | 1 | 3 |
| `APP._cityEvictNonVisible` | `viewer/city.js:235` *(as `A.`)* | 1 | 2 |
| `APP._cityEvictToBudget` | `viewer/city.js:213` *(as `A.`)* | 1 | 2 |
| `APP._cityEvictVictims` | `viewer/city.js:145` *(as `A.`)* | 1 | 4 |
| `APP._cityFacadeTotal` | `viewer/city.js:552` *(as `A.`)* | 1 | 5 |
| `APP._cityFocus` | `viewer/city.js:592` *(as `A.`)* | 2 | 7 |
| `APP._cityFocusSneak` | `viewer/city.js:880` *(as `A.`)* | 1 | 3 |
| `APP._cityFollowHooked` | `viewer/city.js:582` *(as `A.`)* | 1 | 2 |
| `APP._cityGeoBytes` | `viewer/city.js:90` *(as `A.`)* | 1 | 2 |
| `APP._cityHidden` | `viewer/city.js:16` *(as `A.`)* | 4 | 16 |
| `APP._cityHideBuildingBboxes` | `viewer/city.js:17` *(as `A.`)* | 1 | 3 |
| `APP._cityLogMem` | `viewer/city.js:54` *(as `A.`)* | 1 | 3 |
| `APP._cityMemBudgetMB` | `viewer/city.js:86` *(as `A.`)* | 2 | 7 |
| `APP._cityMiss` | `viewer/city.js:240` *(as `A.`)* | 2 | 9 |
| `APP._cityNearestFirst` | `viewer/city.js:893` *(as `A.`)* | 1 | 1 |
| `APP._cityObjBytes` | `viewer/city.js:96` *(as `A.`)* | 1 | 2 |
| `APP._cityOrderBlastHits` | `viewer/city.js:850` *(as `A.`)* | 1 | 2 |
| `APP._cityPendingQueue` | `viewer/city.js:599` *(as `A.`)* | 5 | 12 |
| `APP._cityPreStreamIds` | `viewer/city.js:763` *(as `A.`)* | 2 | 3 |
| `APP._cityRayBlast` | `viewer/city.js:915` *(as `A.`)* | 1 | 2 |
| `APP._cityRayBlastCols` | `viewer/city.js:848` *(as `A.`)* | 1 | 2 |
| `APP._cityRayBlastRows` | `viewer/city.js:849` *(as `A.`)* | 1 | 2 |
| `APP._cityResidentBytes` | `viewer/city.js:105` *(as `A.`)* | 1 | 9 |
| `APP._cityResidentElems` | `viewer/city.js:106` *(as `A.`)* | 1 | 6 |
| `APP._cityResidentOrder` | `viewer/city.js:85` *(as `A.`)* | 2 | 16 |
| `APP._cityRestoreBboxes` | `viewer/city.js:43` *(as `A.`)* | 1 | 2 |
| `APP._cityRestoreBuildingBboxes` | `viewer/city.js:65` *(as `A.`)* | 1 | 1 |
| `APP._citySQL` | `viewer/streaming.js:3634` *(as `A.`)* | 1 | 5 |
| `APP._citySmallFirst` | `viewer/city.js:862` *(as `A.`)* | 1 | 3 |
| `APP._citySmallThreshold` | `viewer/city.js:579` *(as `A.`)* | 1 | 3 |
| `APP._citySneak` | `viewer/city.js:577` *(as `A.`)* | 3 | 19 |
| `APP._citySneakEnabled` | `viewer/city.js:578` *(as `A.`)* | 1 | 1 |
| `APP._citySneakNext` | `viewer/city.js:961` *(as `A.`)* | 1 | 1 |
| `APP._cityStreamNext` | `viewer/city.js:970` *(as `A.`)* | 1 | 6 |
| `APP._cityStreamRows` | `viewer/city.js:952` *(as `A.`)* | 1 | 3 |
| `APP._cityTagAndBudget` | `viewer/city.js:111` *(as `A.`)* | 1 | 3 |
| `APP._civilFastStats` | `viewer/civil_sections.js:110` *(as `A.`)* | 1 | 1 |
| `APP._civilFilmOvC` | `viewer/effects.js:10837` *(as `A.`)* | 2 | 4 |
| `APP._civilFilmOvDb` | `viewer/effects.js:10837` *(as `A.`)* | 1 | 2 |
| `APP._civilGlowPts` | — *phantom* | 0 | 1 |
| `APP._civilGlowSync` | — *phantom* | 0 | 8 |
| `APP._civilLabels` | `viewer/tour.js:827` *(as `A.`)* | 2 | 12 |
| `APP._civilLens` | `viewer/civil_sections.js:681` *(as `A.`)* | 1 | 3 |
| `APP._civilLensWheel` | `viewer/civil_sections.js:527` *(as `A.`)* | 1 | 2 |
| `APP._civilLive` | `viewer/civil_sections.js:662` *(as `A.`)* | 1 | 4 |
| `APP._civilLiveReopen` | `viewer/civil_sections.js:664` *(as `A.`)* | 1 | 2 |
| `APP._civilLiveReset` | `viewer/civil_sections.js:663` *(as `A.`)* | 1 | 1 |
| `APP._civilModel` | `viewer/streaming.js:328` *(as `A.`)* | 1 | 4 |
| `APP._civilModelDb` | `viewer/streaming.js:328` *(as `A.`)* | 1 | 2 |
| `APP._civilProfileProgress` | `viewer/civil_sections.js:413` *(as `A.`)* | 1 | 2 |
| `APP._civilRayCount` | `viewer/civil_sections.js:114` *(as `A.`)* | 1 | 6 |
| `APP._civilRefLookLogged` | `viewer/streaming.js:2226` *(as `A.`)* | 1 | 2 |
| `APP._civilRouteTour` | `viewer/tour.js:918` *(as `A.`)* | 1 | 3 |
| `APP._civilRowOutline` | `viewer/streaming.js:1464` *(as `A.`)* | 1 | 3 |
| `APP._civilSection` | `viewer/civil_sections.js:169` *(as `A.`)* | 2 | 11 |
| `APP._civilSectionPoll` | `viewer/civil_sections.js:682` *(as `A.`)* | 1 | 1 |
| `APP._civilStd` | `viewer/chainage_grid.js:269` *(as `A.`)* | 3 | 7 |
| `APP._clashBackups` | `viewer/measure.js:622` *(as `A.`)* | 2 | 3 |
| `APP._clashBboxCloud` | `viewer/measure.js:1786` *(as `A.`)* | 2 | 8 |
| `APP._clashBboxMap` | `viewer/measure.js:1838` *(as `A.`)* | 1 | 6 |
| `APP._clashDiscCache` | `viewer/clash_matrix.js:13` *(as `A.`)* | 1 | 7 |
| `APP._clashEnvelopes` | `viewer/clash_matrix.js:342` *(as `A.`)* | 3 | 5 |
| `APP._clashExistsPerPair` | `viewer/measure.js:243` *(as `A.`)* | 1 | 1 |
| `APP._clashFilmUpdateWarned` | `viewer/cinema_maxq.js:4283` *(as `A.`)* | 1 | 2 |
| `APP._clashHighlights` | `viewer/issues.js:176` *(as `A.`)* | 5 | 18 |
| `APP._clashHudHighlightLast` | `viewer/cinema_maxq.js:3731` *(as `A.`)* | 5 | 9 |
| `APP._clashIgnoreSet` | `viewer/measure.js:197` *(as `A.`)* | 1 | 4 |
| `APP._clashIndexesReady` | `viewer/measure.js:101` *(as `A.`)* | 2 | 3 |
| `APP._clashLblDrawErrLogged` | `viewer/cinema_maxq.js:1959` *(as `A.`)* | 1 | 2 |
| `APP._clashLblErrLogged` | `viewer/cinema_maxq.js:4275` *(as `A.`)* | 1 | 2 |
| `APP._clashLblStopped` | `viewer/cinema_maxq.js:3428` *(as `A.`)* | 2 | 3 |
| `APP._clashListDiv` | `viewer/measure.js:937` *(as `A.`)* | 5 | 56 |
| `APP._clashListNav` | `viewer/scene.js:2691` *(as `A.`)* | 1 | 4 |
| `APP._clashLodUpdateFreq` | `viewer/measure.js:1787` *(as `A.`)* | 1 | 2 |
| `APP._clashMatrixDiv` | `viewer/clash_matrix.js:248` *(as `A.`)* | 7 | 38 |
| `APP._clashModeActive` | `viewer/measure.js:1785` *(as `A.`)* | 3 | 11 |
| `APP._clashPairBoxTotal` | `viewer/measure.js:507` *(as `A.`)* | 3 | 10 |
| `APP._clashPairKey` | `viewer/measure.js:647` *(as `A.`)* | 1 | 10 |
| `APP._clashPairOffset` | `viewer/clash_matrix.js:291` *(as `A.`)* | 7 | 8 |
| `APP._clashProxMeshes` | `viewer/measure.js:1790` *(as `A.`)* | 4 | 8 |
| `APP._clashProxSet` | `viewer/measure.js:1789` *(as `A.`)* | 3 | 7 |
| `APP._clashRevealActive` | `viewer/measure.js:621` *(as `A.`)* | 4 | 13 |
| `APP._clashRtreeBuilding` | `viewer/measure.js:103` *(as `A.`)* | 6 | 7 |
| `APP._clashRtreeReady` | `viewer/measure.js:102` *(as `A.`)* | 4 | 25 |
| `APP._clashRuleFamily` | `viewer/measure.js:196` *(as `A.`)* | 1 | 5 |
| `APP._clashRules` | `viewer/measure.js:73` *(as `A.`)* | 2 | 4 |
| `APP._clashRulesLoading` | `viewer/measure.js:74` *(as `A.`)* | 4 | 5 |
| `APP._clashSeverity` | `viewer/measure.js:613` *(as `A.`)* | 1 | 7 |
| `APP._clashStatusCycle` | `viewer/measure.js:625` *(as `A.`)* | 1 | 2 |
| `APP._clashStatusKey` | `viewer/measure.js:634` *(as `A.`)* | 1 | 3 |
| `APP._clashStatusStyles` | `viewer/measure.js:626` *(as `A.`)* | 1 | 2 |
| `APP._clashStatuses` | `viewer/measure.js:637` *(as `A.`)* | 3 | 16 |
| `APP._clashTolerance` | `viewer/measure.js:224` *(as `A.`)* | 1 | 6 |
| `APP._clashWhereParts` | `viewer/measure.js:226` *(as `A.`)* | 1 | 12 |
| `APP._clearBboxPlaceholders` | `viewer/streaming.js:593` *(as `A.`)* | 1 | 5 |
| `APP._cloudPlane` | `viewer/scene.js:399` *(as `A.`)* | 1 | 1 |
| `APP._cloudTex` | `viewer/scene.js:400` *(as `A.`)* | 1 | 1 |
| `APP._collectAllMeshes` | — *phantom* | 0 | 7 |
| `APP._colourTruthRollup` | `viewer/streaming.js:1393` *(as `A.`)* | 1 | 3 |
| `APP._composer` | `viewer/effects.js:10` *(as `A.`)* | 3 | 115 |
| `APP._composerEnabled` | `viewer/effects.js:49` *(as `A.`)* | 10 | 15 |
| `APP._compositePhoto` | `viewer/sitecam.js:247` *(as `A.`)* | 1 | 4 |
| `APP._concrete` | — *phantom* | 0 | 2 |
| `APP._concreteStrength` | `viewer/streaming.js:1659` *(as `A.`)* | 1 | 7 |
| `APP._concreteTile` | `viewer/streaming.js:1660` *(as `A.`)* | 1 | 3 |
| `APP._concreteTileM` | — *phantom* | 0 | 2 |
| `APP._connectApplying` | `viewer/main.js:87` | 2 | 3 |
| `APP._consolidateBatched` | `viewer/streaming.js:3531` *(as `A.`)* | 1 | 3 |
| `APP._consolidateOpaqueOnly` | `viewer/cinema_maxq.js:2707` *(as `A.`)* | 1 | 2 |
| `APP._costOdometerFinalFired` | `viewer/cinema_maxq.js:3538` *(as `A.`)* | 2 | 3 |
| `APP._costOdometerOn` | `viewer/cinema_maxq.js:3536` *(as `A.`)* | 1 | 3 |
| `APP._countClashesAsync` | `viewer/measure.js:495` *(as `A.`)* | 1 | 4 |
| `APP._countClashesRtree` | `viewer/clash_matrix.js:15` *(as `A.`)* | 1 | 4 |
| `APP._cpeAimFreezeOff` | `witness/witness_cpe_corr_brush.js:152` *(as `A.`)* | 6 | 7 |
| `APP._cpeBeat3GazeDebug` | `viewer/effects.js:8575` *(as `A.`)* | 1 | 10 |
| `APP._cpeBeat3PoseDebug` | `viewer/effects.js:8566` *(as `A.`)* | 1 | 2 |
| `APP._cpeCorrBranchOff` | `witness/witness_cpe_aim_retire.js:322` *(as `A.`)* | 4 | 5 |
| `APP._cpeCorrectionsDebug` | `viewer/effects.js:8560` *(as `A.`)* | 1 | 7 |
| `APP._cpeGazeClearDebug` | `viewer/effects.js:8592` *(as `A.`)* | 1 | 8 |
| `APP._cpePinZonesDebug` | `viewer/effects.js:8312` *(as `A.`)* | 1 | 6 |
| `APP._cpeRevealLeakAt` | `viewer/effects.js:7194` *(as `A.`)* | 1 | 3 |
| `APP._cpeRevealLightsOff` | `viewer/cinema_maxq.js:4291` *(as `A.`)* | 1 | 5 |
| `APP._cpeRevealLightsOffLast` | `viewer/cinema_maxq.js:4293` *(as `A.`)* | 1 | 2 |
| `APP._cpeRevealSavedHidden` | `viewer/effects.js:7106` *(as `A.`)* | 3 | 6 |
| `APP._cpeRevealVisualKey` | `viewer/effects.js:7107` *(as `A.`)* | 2 | 7 |
| `APP._cpeViewfinderRender` | — *phantom* | 0 | 8 |
| `APP._createIsSOTrx` | `erp/idempiere.html:4699` | 1 | 1 |
| `APP._createMovementType` | `erp/idempiere.html:4707` | 1 | 1 |
| `APP._csmLastFit` | `viewer/effects.js:3521` *(as `A.`)* | 1 | 1 |
| `APP._csmNearFix` | — *phantom* | 0 | 1 |
| `APP._csmUncovered` | `viewer/effects.js:3451` *(as `A.`)* | 2 | 4 |
| `APP._csvExportInProgress` | `viewer/clash_report.js:9` *(as `A.`)* | 4 | 5 |
| `APP._currentClashPairLabel` | `viewer/clash_matrix.js:313` *(as `A.`)* | 3 | 6 |
| `APP._currentClashRules` | `viewer/issues.js:174` *(as `A.`)* | 5 | 12 |
| `APP._currentClashStorey` | `viewer/measure.js:1679` *(as `A.`)* | 2 | 7 |
| `APP._currentClashViewIdx` | `viewer/measure.js:653` *(as `A.`)* | 1 | 3 |
| `APP._currentClashes` | `viewer/clash_matrix.js:312` *(as `A.`)* | 10 | 43 |
| `APP._dbPersistUrl` | `viewer/streaming.js:3788` *(as `A.`)* | 2 | 11 |
| `APP._debugForceGhostLensOwned` | — *phantom* | 0 | 6 |
| `APP._debugGhostLensOwned` | — *phantom* | 0 | 3 |
| `APP._deepLinkCamOverride` | `viewer/issues.js:182` *(as `A.`)* | 3 | 5 |
| `APP._diffToVoRows` | `viewer/diff.js:350` *(as `A.`)* | 1 | 2 |
| `APP._dimClear` | `scripts/probe_dim_cue_demo.js:116` *(as `A.`)* | 1 | 2 |
| `APP._dimDrawCue` | `scripts/probe_dim_cue_demo.js:90` *(as `A.`)* | 1 | 2 |
| `APP._dimNaNLogged` | `viewer/cpe_flythru_cues.js:422` *(as `A.`)* | 1 | 2 |
| `APP._dimPickTargets` | `scripts/probe_dim_cue_demo.js:75` *(as `A.`)* | 1 | 2 |
| `APP._dimTargetFor` | `scripts/probe_dim_cue_demo.js:42` *(as `A.`)* | 1 | 4 |
| `APP._dismissClashes` | `viewer/measure.js:1166` *(as `A.`)* | 1 | 12 |
| `APP._dlodBboxGeo` | `viewer/scene.js:477` *(as `A.`)* | 1 | 2 |
| `APP._dlodEnabled` | `viewer/dlod.js:14` *(as `A.`)* | 4 | 30 |
| `APP._dlodFrame` | `viewer/dlod.js:15` *(as `A.`)* | 9 | 11 |
| `APP._dlodPaused` | `viewer/dlod.js:16` *(as `A.`)* | 1 | 2 |
| `APP._dlodSlots` | `viewer/streaming.js:20` *(as `A.`)* | 1 | 4 |
| `APP._dlodStillHold` | `viewer/effects.js:4330` *(as `A.`)* | 2 | 4 |
| `APP._dlodStillWanted` | `viewer/dlod.js:113` *(as `A.`)* | 3 | 6 |
| `APP._doMeasureClick` | `viewer/measure.js:1278` *(as `A.`)* | 1 | 2 |
| `APP._doReportBug` | `viewer/helpers.js:241` *(as `A.`)* | 1 | 6 |
| `APP._docEnv` | `viewer/doc_canvas.js:566` *(as `A.`)* | 1 | 32 |
| `APP._downloadClashSnag` | `viewer/clash_snag.js:244` *(as `A.`)* | 1 | 4 |
| `APP._downloadRuleReport` | `viewer/rule_checklist.js:336` *(as `A.`)* | 1 | 2 |
| `APP._drawBboxPlaceholders` | `viewer/streaming.js:525` *(as `A.`)* | 1 | 9 |
| `APP._drawMiniQR` | `viewer/sitecam.js:234` *(as `A.`)* | 1 | 2 |
| `APP._drawStroke` | `viewer/sitecam.js:365` *(as `A.`)* | 1 | 3 |
| `APP._driveBtn` | `viewer/sitecam.js:153` *(as `A.`)* | 3 | 13 |
| `APP._driveBtnWasActive` | `viewer/sitecam.js:154` *(as `A.`)* | 2 | 5 |
| `APP._driveHoldCount` | `viewer/walk.js:406` *(as `A.`)* | 2 | 4 |
| `APP._driveHoldInterval` | `viewer/walk.js:405` *(as `A.`)* | 4 | 8 |
| `APP._egressRulesCache` | — *phantom* | 0 | 2 |
| `APP._egressRulesSource` | — *phantom* | 0 | 1 |
| `APP._elementOverlay` | `viewer/measure.js:1363` *(as `A.`)* | 1 | 4 |
| `APP._elementVariant` | `viewer/streaming.js:785` *(as `A.`)* | 1 | 3 |
| `APP._emberEnabled` | `viewer/effects.js:5877` *(as `A.`)* | 1 | 2 |
| `APP._ensureClashIndexes` | `viewer/measure.js:107` *(as `A.`)* | 1 | 8 |
| `APP._enterClashMode` | `viewer/measure.js:1794` *(as `A.`)* | 1 | 2 |
| `APP._entourageVariant` | `viewer/streaming.js:620` *(as `A.`)* | 1 | 5 |
| `APP._envCache` | — *phantom* | 0 | 2 |
| `APP._envMap` | `viewer/effects.js:4135` *(as `A.`)* | 4 | 31 |
| `APP._envMapHdriActive` | `viewer/effects.js:4410` *(as `A.`)* | 2 | 5 |
| `APP._envMapThrottle` | `viewer/scene.js:319` *(as `A.`)* | 2 | 4 |
| `APP._envmapStompStats` | `viewer/scene.js:236` *(as `A.`)* | 1 | 1 |
| `APP._escCardDrawErrLogged` | `viewer/cinema_maxq.js:2200` *(as `A.`)* | 1 | 2 |
| `APP._escDrawErrLogged` | `viewer/cinema_maxq.js:1938` *(as `A.`)* | 1 | 2 |
| `APP._escFrameWarned` | `viewer/cinema_maxq.js:4854` *(as `A.`)* | 1 | 2 |
| `APP._escLoggedFull` | `viewer/cinema_maxq.js:4858` *(as `A.`)* | 1 | 2 |
| `APP._escRouteHudSuppress` | `viewer/cpe_escape_route.js:1357` *(as `A.`)* | 2 | 5 |
| `APP._evictOldest` | `viewer/scene.js:652` *(as `A.`)* | 1 | 3 |
| `APP._ewInfer` | `viewer/earthworks_overlay.js:148` *(as `A.`)* | 1 | 1 |
| `APP._ewRowSets` | `viewer/earthworks_overlay.js:193` *(as `A.`)* | 1 | 1 |
| `APP._exitClashMode` | `viewer/measure.js:1885` *(as `A.`)* | 1 | 8 |
| `APP._exportBuildingDb` | `viewer/scene.js:927` *(as `A.`)* | 1 | 17 |
| `APP._exportCSVBackground` | `viewer/clash_report.js:391` *(as `A.`)* | 1 | 5 |
| `APP._exportClashReport` | `viewer/clash_report.js:16` *(as `A.`)* | 1 | 4 |
| `APP._exportInProgress` | `viewer/clash_report.js:8` *(as `A.`)* | 4 | 6 |
| `APP._facadeWarmCool` | `viewer/effects.js:429` *(as `A.`)* | 3 | 4 |
| `APP._fieldTrace` | — *phantom* | 0 | 3 |
| `APP._filmBounceOff` | — *phantom* | 0 | 1 |
| `APP._filmConsolidated` | `viewer/cinema_maxq.js:2707` *(as `A.`)* | 1 | 2 |
| `APP._filmEnvCaptures` | `viewer/effects.js:4881` *(as `A.`)* | 1 | 3 |
| `APP._filmEnvShot` | `viewer/effects.js:4880` *(as `A.`)* | 1 | 2 |
| `APP._filmExpOff` | — *phantom* | 0 | 1 |
| `APP._filmExpSnapAt` | `viewer/effects.js:4871` *(as `A.`)* | 1 | 3 |
| `APP._filmExposureStep` | `viewer/effects.js:4903` *(as `A.`)* | 1 | 3 |
| `APP._filmFieldOn` | `viewer/effects.js:4865` *(as `A.`)* | 1 | 7 |
| `APP._filmFillRestore` | `viewer/effects.js:4322` *(as `A.`)* | 1 | 5 |
| `APP._filmFitPrecompute` | `viewer/effects.js:3546` *(as `A.`)* | 1 | 2 |
| `APP._filmGateLastSl` | `viewer/effects.js:4871` *(as `A.`)* | 1 | 3 |
| `APP._filmGeomWhole` | `viewer/cinema_maxq.js:4134` *(as `A.`)* | 1 | 2 |
| `APP._filmGeomWhyLast` | `viewer/cinema_maxq.js:4135` *(as `A.`)* | 1 | 2 |
| `APP._filmInheritOff` | — *phantom* | 0 | 1 |
| `APP._filmLampDataN` | `viewer/tools.js:2835` *(as `A.`)* | 1 | 2 |
| `APP._filmLogCompact` | `viewer/cinema_maxq.js:2619` *(as `A.`)* | 1 | 3 |
| `APP._filmMirrorOn` | `viewer/effects.js:4882` *(as `A.`)* | 1 | 2 |
| `APP._filmParity` | `viewer/effects.js:4314` *(as `A.`)* | 3 | 27 |
| `APP._filmParityOff` | — *phantom* | 0 | 1 |
| `APP._filmParityShadowFit` | `viewer/effects.js:3542` *(as `A.`)* | 1 | 3 |
| `APP._filmParityStep` | `viewer/effects.js:4839` *(as `A.`)* | 1 | 7 |
| `APP._filmTnNow` | `viewer/effects.js:4841` *(as `A.`)* | 1 | 3 |
| `APP._filmWinPullErr` | `viewer/cinema_maxq.js:1829` *(as `A.`)* | 1 | 2 |
| `APP._filmWinPullN` | `viewer/cinema_maxq.js:1828` *(as `A.`)* | 1 | 2 |
| `APP._findRefreshTree` | — *phantom* | 0 | 6 |
| `APP._findingsHudSuppress` | `viewer/cpe_storey_reveal.js:2469` *(as `A.`)* | 3 | 4 |
| `APP._fixFaceU` | — *phantom* | 0 | 1 |
| `APP._fixtureEmissiveCount` | `viewer/effects.js:6052` *(as `A.`)* | 1 | 1 |
| `APP._fixtureFaceApply` | — *phantom* | 0 | 2 |
| `APP._fixtureFaceRestore` | — *phantom* | 0 | 2 |
| `APP._flushBboxBatched` | `viewer/streaming.js:3357` *(as `A.`)* | 1 | 2 |
| `APP._flushInstanced` | `viewer/streaming.js:2770` *(as `A.`)* | 1 | 3 |
| `APP._flyPreparing` | `viewer/tour.js:70` *(as `A.`)* | 3 | 6 |
| `APP._flyToClash` | `viewer/measure.js:650` *(as `A.`)* | 1 | 10 |
| `APP._flyoutBeatsWarned` | `viewer/cinema_maxq.js:1923` *(as `A.`)* | 1 | 2 |
| `APP._flythruCueWarned` | `viewer/cinema_maxq.js:4246` *(as `A.`)* | 1 | 2 |
| `APP._flythruCuesLast` | `viewer/cpe_flythru_cues.js:553` *(as `A.`)* | 1 | 4 |
| `APP._flythruDatumAtWarned` | `viewer/cinema_maxq.js:4216` *(as `A.`)* | 1 | 2 |
| `APP._flythruDatumLast` | `viewer/cpe_flythru_datum.js:519` *(as `A.`)* | 2 | 7 |
| `APP._flythruDatumOn` | `viewer/cinema_maxq.js:3529` *(as `A.`)* | 1 | 7 |
| `APP._flythruDatumWarned` | `viewer/cinema_maxq.js:1878` *(as `A.`)* | 1 | 2 |
| `APP._flythruDimWarned` | `viewer/cinema_maxq.js:1889` *(as `A.`)* | 1 | 2 |
| `APP._flythruFilmSec` | `viewer/cinema_maxq.js:4245` *(as `A.`)* | 2 | 6 |
| `APP._flythruFilmSecFull` | `viewer/cinema_maxq.js:3528` *(as `A.`)* | 1 | 2 |
| `APP._forceNoMerge` | `viewer/streaming.js:519` *(as `A.`)* | 2 | 3 |
| `APP._formatGps` | `viewer/sitecam.js:48` *(as `A.`)* | 1 | 7 |
| `APP._formatIssueGps` | `viewer/issues.js:87` *(as `A.`)* | 1 | 3 |
| `APP._formatTimestamp` | `viewer/sitecam.js:58` *(as `A.`)* | 1 | 8 |
| `APP._frLamps` | `viewer/cinema_maxq.js:4723` *(as `A.`)* | 1 | 2 |
| `APP._frameQa` | `viewer/cinema_maxq.js:2325` *(as `A.`)* | 2 | 12 |
| `APP._freezeAnim` | `viewer/cpe_load_path.js:4154` *(as `A.`)* | 1 | 2 |
| `APP._freezeAnimKey` | `viewer/cpe_load_path.js:4158` *(as `A.`)* | 1 | 3 |
| `APP._freezeBand` | `viewer/cpe_load_path.js:4146` *(as `A.`)* | 1 | 1 |
| `APP._freezeBandsOn` | `viewer/cpe_load_path.js:4146` *(as `A.`)* | 1 | 1 |
| `APP._freezePerfOn` | `viewer/cinema_maxq.js:3216` *(as `A.`)* | 1 | 9 |
| `APP._frontSideClasses` | `viewer/streaming.js:1453` *(as `A.`)* | 1 | 3 |
| `APP._getAllIssues` | `viewer/issues.js:56` *(as `A.`)* | 1 | 3 |
| `APP._getAutoStageState` | `viewer/effects.js:6333` *(as `A.`)* | 1 | 1 |
| `APP._getCamBimInfo` | `viewer/sitecam.js:37` *(as `A.`)* | 1 | 6 |
| `APP._getCinemaPathEdit` | `viewer/effects.js:10732` *(as `A.`)* | 1 | 25 |
| `APP._getImport` | `viewer/import.js:612` *(as `A.`)* | 1 | 7 |
| `APP._getMarkupBlob` | `viewer/sitecam.js:442` *(as `A.`)* | 1 | 6 |
| `APP._getMaterial` | `viewer/streaming.js:1494` *(as `A.`)* | 1 | 17 |
| `APP._getPhotoSkyline` | `viewer/effects.js:5843` *(as `A.`)* | 1 | 10 |
| `APP._getPhotoSparkles` | `viewer/effects.js:5842` *(as `A.`)* | 1 | 1 |
| `APP._getStaffageInstances` | `viewer/effects.js:1703` *(as `A.`)* | 1 | 9 |
| `APP._ghostAutoHeldLogged` | `viewer/navigate_find.js:60` *(as `A.`)* | 1 | 2 |
| `APP._ghostGlass` | `viewer/ghostglass.js:310` | 1 | 13 |
| `APP._giCaptureErrLogged` | `viewer/cinema_maxq.js:1807` *(as `A.`)* | 1 | 2 |
| `APP._giComposer` | `viewer/effects_gi_poc.js:11` *(as `A.`)* | 5 | 19 |
| `APP._giComposerActive` | `viewer/effects_gi_poc.js:12` *(as `A.`)* | 5 | 27 |
| `APP._giFilmArmed` | `viewer/cinema_maxq.js:4332` *(as `A.`)* | 2 | 4 |
| `APP._giN8aoPass` | `viewer/effects_gi_poc.js:86` *(as `A.`)* | 1 | 25 |
| `APP._glowSpriteCount` | — *phantom* | 0 | 6 |
| `APP._glowSpriteEnabled` | `scripts/probe_glow_sprite.js:112` | 1 | 1 |
| `APP._grMemo` | `viewer/tour.js:284` *(as `A.`)* | 3 | 7 |
| `APP._gradeOff` | `scripts/probe_grade_hdr.js:37` | 2 | 2 |
| `APP._gradePass` | — *phantom* | 0 | 2 |
| `APP._gridGroup` | — *phantom* | 0 | 1 |
| `APP._gridOverlayState` | — *phantom* | 0 | 8 |
| `APP._groundAlbedoGain` | `viewer/effects.js:4372` *(as `A.`)* | 2 | 11 |
| `APP._groundSolidColor` | — *phantom* | 0 | 1 |
| `APP._groundTexKey` | — *phantom* | 0 | 2 |
| `APP._groundWetnessOverride` | `viewer/effects.js:3995` *(as `A.`)* | 2 | 9 |
| `APP._groupBy` | — *phantom* | 0 | 7 |
| `APP._guidToMesh` | `viewer/measure.js:1253` *(as `A.`)* | 1 | 1 |
| `APP._hasBbox` | `viewer/streaming.js:384` *(as `A.`)* | 6 | 21 |
| `APP._hasBuildingCol` | `viewer/streaming.js:258` *(as `A.`)* | 1 | 12 |
| `APP._hasMatNameCol` | `viewer/streaming.js:289` *(as `A.`)* | 1 | 2 |
| `APP._hasMultiDraw` | `viewer/scene.js:74` *(as `A.`)* | 2 | 4 |
| `APP._hbaAttendanceLog` | `viewer/hba_lens.js:262` *(as `A.`)* | 1 | 14 |
| `APP._hbaAttendanceSpec` | `viewer/hba_lens.js:387` *(as `A.`)* | 1 | 11 |
| `APP._hbaBomSpec` | `viewer/hba_lens.js:395` *(as `A.`)* | 1 | 6 |
| `APP._hbaClassFilter` | — *phantom* | 0 | 1 |
| `APP._hbaEmpResourceMap` | `viewer/hba_lens.js:386` *(as `A.`)* | 1 | 4 |
| `APP._hbaLeaveSpec` | `viewer/hba_lens.js:291` *(as `A.`)* | 1 | 3 |
| `APP._hbaOccupancyLog` | `viewer/hba_lens.js:255` *(as `A.`)* | 1 | 9 |
| `APP._hbaPayrollSpec` | `viewer/hba_lens.js:281` *(as `A.`)* | 2 | 8 |
| `APP._hbaPeriod` | — *phantom* | 0 | 5 |
| `APP._hbaRequestLog` | `viewer/hba_lens.js:273` *(as `A.`)* | 1 | 6 |
| `APP._hbaResourceSpec` | `viewer/hba_lens.js:306` *(as `A.`)* | 1 | 6 |
| `APP._hbaRoomFootprint` | `viewer/hba_lens.js:220` *(as `A.`)* | 1 | 4 |
| `APP._hbaRoomMembers` | `viewer/hba_lens.js:232` *(as `A.`)* | 3 | 20 |
| `APP._hbaRooms` | `viewer/hba_lens.js:225` *(as `A.`)* | 2 | 29 |
| `APP._hbaSpaceClass` | `viewer/hba_lens.js:206` *(as `A.`)* | 1 | 2 |
| `APP._hbaStoreyOf` | `viewer/hba_lens.js:225` *(as `A.`)* | 2 | 11 |
| `APP._hbaTenancySpec` | `viewer/hba_lens.js:298` *(as `A.`)* | 2 | 16 |
| `APP._highlightMesh` | `viewer/measure.js:1511` *(as `A.`)* | 1 | 2 |
| `APP._historyOpened` | `viewer/streaming.js:2469` *(as `A.`)* | 1 | 4 |
| `APP._hoverNameState` | `viewer/hover_name.js:221` *(as `A.`)* | 1 | 4 |
| `APP._hrCost` | `viewer/time_machine.js:4502` *(as `app.`)* | 2 | 20 |
| `APP._hudCompositeAlphaSample` | `viewer/cinema_maxq.js:1737` *(as `A.`)* | 1 | 2 |
| `APP._hudLayoutFocusWitness` | `viewer/cinema_maxq.js:1740` *(as `A.`)* | 1 | 3 |
| `APP._hudLayoutRects` | `viewer/cinema_maxq.js:1736` *(as `A.`)* | 3 | 9 |
| `APP._hudLayoutRegister` | `viewer/cinema_maxq.js:1738` *(as `A.`)* | 1 | 13 |
| `APP._hudLayoutWitness` | `viewer/cinema_maxq.js:1739` *(as `A.`)* | 1 | 5 |
| `APP._hudRowYield` | `viewer/cinema_maxq.js:2066` *(as `A.`)* | 2 | 2 |
| `APP._hudRowYieldLogged` | `viewer/cinema_maxq.js:2067` *(as `A.`)* | 2 | 3 |
| `APP._hudStackBottom` | `viewer/cinema_maxq.js:2311` *(as `A.`)* | 1 | 2 |
| `APP._ilArcOffLast` | `viewer/cinema_maxq.js:4145` *(as `A.`)* | 1 | 2 |
| `APP._ilBoundaryLogged` | `viewer/cinema_maxq.js:4110` *(as `A.`)* | 3 | 4 |
| `APP._ilPastStick` | `viewer/cinema_maxq.js:4078` *(as `A.`)* | 1 | 2 |
| `APP._ilPastTopout` | `viewer/cinema_maxq.js:4108` *(as `A.`)* | 1 | 1 |
| `APP._ilWitnessKey` | `viewer/cinema_maxq.js:4748` *(as `A.`)* | 2 | 3 |
| `APP._imHeurLast` | `viewer/tools.js:2797` *(as `A.`)* | 1 | 2 |
| `APP._inLoadPathComposite` | `viewer/cinema_maxq.js:2225` *(as `A.`)* | 2 | 2 |
| `APP._indoorBeatsAtWarned` | `viewer/cinema_maxq.js:4242` *(as `A.`)* | 1 | 2 |
| `APP._indoorBeatsWarned` | `viewer/cinema_maxq.js:1917` *(as `A.`)* | 1 | 2 |
| `APP._infoCardDiv` | `viewer/measure.js:1254` *(as `A.`)* | 6 | 11 |
| `APP._initMarkupListeners` | `viewer/sitecam.js:400` *(as `A.`)* | 1 | 3 |
| `APP._initSnagTable` | `viewer/helpers.js:462` *(as `A.`)* | 1 | 3 |
| `APP._instDiscMixed` | `viewer/streaming.js:3007` *(as `A.`)* | 1 | 6 |
| `APP._instDiscUniform` | `viewer/streaming.js:3006` *(as `A.`)* | 1 | 7 |
| `APP._instMepMixed` | `viewer/streaming.js:2970` *(as `A.`)* | 2 | 5 |
| `APP._instMepUniform` | `viewer/streaming.js:2971` *(as `A.`)* | 2 | 5 |
| `APP._instRgbaSplit` | `viewer/streaming.js:2872` *(as `A.`)* | 2 | 9 |
| `APP._installMergedRaycast` | `viewer/streaming.js:2707` *(as `A.`)* | 1 | 2 |
| `APP._instanceGuids` | `viewer/streaming.js:512` *(as `A.`)* | 2 | 12 |
| `APP._instanceMeta` | `viewer/streaming.js:511` *(as `A.`)* | 2 | 177 |
| `APP._interiorLightsOff` | `viewer/cinema_maxq.js:4144` *(as `A.`)* | 3 | 13 |
| `APP._isAuthoredMatName` | `viewer/streaming.js:728` *(as `A.`)* | 1 | 11 |
| `APP._isExporterPlaceholder` | `viewer/streaming.js:734` *(as `A.`)* | 1 | 10 |
| `APP._isMobile` | `viewer/streaming.js:513` *(as `A.`)* | 1 | 20 |
| `APP._isPhotoGlossyMat` | `viewer/effects.js:2952` *(as `A.`)* | 1 | 12 |
| `APP._isWebGPU` | `viewer/scene.js:117` *(as `A.`)* | 1 | 3 |
| `APP._issueBackToList` | `viewer/issues.js:237` *(as `A.`)* | 1 | 2 |
| `APP._jsonRegistry` | — *phantom* | 0 | 1 |
| `APP._lampCapFarM` | `viewer/tools.js:2593` *(as `A.`)* | 4 | 7 |
| `APP._lampCapLast` | `viewer/tools.js:2677` *(as `A.`)* | 1 | 2 |
| `APP._lampCapListLogged` | `viewer/tools.js:2669` *(as `A.`)* | 1 | 2 |
| `APP._lampChurnPrev` | `viewer/tools.js:2915` *(as `A.`)* | 1 | 2 |
| `APP._lampData` | `viewer/sourced_light.js:861` *(as `A.`)* | 4 | 26 |
| `APP._lampDataKey` | `viewer/tools.js:2832` *(as `A.`)* | 1 | 2 |
| `APP._lampDataLastLine` | `viewer/tools.js:2838` *(as `A.`)* | 1 | 2 |
| `APP._lampDataOn` | `viewer/effects.js:4527` *(as `A.`)* | 5 | 25 |
| `APP._lampDataUsed` | `viewer/effects.js:5063` *(as `A.`)* | 2 | 4 |
| `APP._lampShadowClear` | — *phantom* | 0 | 2 |
| `APP._lampShadowLast` | `viewer/tools.js:2549` *(as `A.`)* | 1 | 2 |
| `APP._lampShadowLights` | — *phantom* | 0 | 2 |
| `APP._lampShadowPick` | — *phantom* | 0 | 1 |
| `APP._lampZonePick` | — *phantom* | 0 | 1 |
| `APP._lampZoneView` | — *phantom* | 0 | 1 |
| `APP._lampsSum` | `viewer/cinema_maxq.js:2617` *(as `A.`)* | 3 | 5 |
| `APP._lastClashLodUpdate` | `viewer/measure.js:1788` *(as `A.`)* | 2 | 3 |
| `APP._lastFlushIdx` | `viewer/streaming.js:433` *(as `A.`)* | 4 | 6 |
| `APP._lastGoodFrameBlob` | `viewer/cinema_maxq.js:4930` *(as `A.`)* | 1 | 3 |
| `APP._lastMeasureItem` | `viewer/measure.js:1452` *(as `A.`)* | 1 | 1 |
| `APP._lastMeasureTap` | `viewer/picking.js:178` *(as `A.`)* | 2 | 4 |
| `APP._lastPickCenter` | `viewer/picking.js:235` *(as `A.`)* | 4 | 4 |
| `APP._lastPickGuid` | `viewer/picking.js:235` *(as `A.`)* | 5 | 7 |
| `APP._leanTimersArmed` | `viewer/effects.js:6212` *(as `A.`)* | 1 | 3 |
| `APP._ledgerTickerDrawWarned` | `viewer/cinema_maxq.js:2232` *(as `A.`)* | 1 | 2 |
| `APP._lensflare` | `viewer/scene.js:448` *(as `A.`)* | 1 | 33 |
| `APP._libHasNormals` | `viewer/streaming.js:18` *(as `A.`)* | 5 | 17 |
| `APP._lightFieldByBuilding` | — *phantom* | 0 | 2 |
| `APP._lightZoneInnerR` | `viewer/tests/witness_sourced_stack.js:51` | 1 | 3 |
| `APP._linearBeatWarned` | `viewer/cinema_maxq.js:1902` *(as `A.`)* | 1 | 2 |
| `APP._loadClashRules` | `viewer/measure.js:76` *(as `A.`)* | 1 | 13 |
| `APP._loadClashStatuses` | `viewer/measure.js:638` *(as `A.`)* | 1 | 2 |
| `APP._loadPathAllElseObjects` | `viewer/cpe_load_path.js:1538` *(as `A.`)* | 1 | 1 |
| `APP._loadPathArmFrameThisFrame` | `viewer/cinema_maxq.js:2243` *(as `A.`)* | 2 | 3 |
| `APP._loadPathArmFrameTn` | `viewer/cinema_maxq.js:3502` *(as `A.`)* | 2 | 2 |
| `APP._loadPathArmTFilm` | `viewer/cpe_load_path.js:3269` *(as `A.`)* | 1 | 2 |
| `APP._loadPathArmTnMatch` | `viewer/cinema_maxq.js:3502` *(as `A.`)* | 3 | 4 |
| `APP._loadPathBackdropAppliedBlackOnce` | `viewer/cpe_load_path.js:2638` *(as `A.`)* | 2 | 3 |
| `APP._loadPathBackdropExpected` | `viewer/cpe_load_path.js:3060` *(as `A.`)* | 1 | 1 |
| `APP._loadPathBackdropFadeT` | `viewer/cpe_load_path.js:3058` *(as `A.`)* | 1 | 1 |
| `APP._loadPathBackdropSnapshot` | `viewer/cpe_load_path.js:3059` *(as `A.`)* | 1 | 1 |
| `APP._loadPathBackdropWitness` | `viewer/cpe_load_path.js:3060` *(as `A.`)* | 1 | 1 |
| `APP._loadPathCardAssemble` | `viewer/cpe_load_path.js:4510` *(as `A.`)* | 1 | 1 |
| `APP._loadPathCardDayNumber` | `viewer/cpe_load_path.js:4509` *(as `A.`)* | 1 | 1 |
| `APP._loadPathCardInFrame` | `viewer/cpe_load_path.js:4511` *(as `A.`)* | 1 | 1 |
| `APP._loadPathCardOverlapsLadders` | `viewer/cpe_load_path.js:4511` *(as `A.`)* | 1 | 1 |
| `APP._loadPathCardRect` | `viewer/cpe_load_path.js:4510` *(as `A.`)* | 1 | 1 |
| `APP._loadPathCardWitness` | `viewer/cpe_load_path.js:4512` *(as `A.`)* | 1 | 1 |
| `APP._loadPathCheapCandidateRank` | `viewer/cpe_load_path.js:1805` *(as `A.`)* | 1 | 1 |
| `APP._loadPathClassForGuid` | `viewer/cpe_load_path.js:1434` *(as `A.`)* | 1 | 1 |
| `APP._loadPathCrossOverlapCount` | `viewer/cpe_load_path.js:4001` *(as `A.`)* | 1 | 1 |
| `APP._loadPathDiagRaycast` | `viewer/cpe_load_path.js:3089` *(as `A.`)* | 1 | 5 |
| `APP._loadPathDiagRaycastFired` | `viewer/cinema_maxq.js:1845` *(as `A.`)* | 1 | 2 |
| `APP._loadPathDiagSample` | `viewer/cpe_load_path.js:3168` *(as `A.`)* | 1 | 3 |
| `APP._loadPathDrawInfoCard` | `viewer/cpe_load_path.js:4607` *(as `A.`)* | 1 | 1 |
| `APP._loadPathDrawWarned` | `viewer/cinema_maxq.js:2227` *(as `A.`)* | 2 | 4 |
| `APP._loadPathExtentAlongDir` | `viewer/cpe_load_path.js:1731` *(as `A.`)* | 1 | 1 |
| `APP._loadPathFacingFaceSamples` | `viewer/cpe_load_path.js:1630` *(as `A.`)* | 1 | 1 |
| `APP._loadPathFadeSecFor` | `viewer/cpe_load_path.js:3071` *(as `A.`)* | 1 | 4 |
| `APP._loadPathFadeT` | `viewer/cpe_load_path.js:3068` *(as `A.`)* | 1 | 1 |
| `APP._loadPathFocusLastResult` | `viewer/cpe_load_path.js:2643` *(as `A.`)* | 1 | 2 |
| `APP._loadPathFreeVerticalSpan` | `viewer/cpe_load_path.js:4001` *(as `A.`)* | 1 | 1 |
| `APP._loadPathHoldFrameActive` | `viewer/cinema_maxq.js:4159` *(as `A.`)* | 1 | 12 |
| `APP._loadPathHudAlpha` | `viewer/cinema_maxq.js:4172` *(as `A.`)* | 3 | 11 |
| `APP._loadPathInstanceWorldBox` | `viewer/cpe_load_path.js:1233` *(as `A.`)* | 1 | 3 |
| `APP._loadPathIsBuildingElementObj` | `viewer/cpe_load_path.js:1499` *(as `A.`)* | 1 | 3 |
| `APP._loadPathIsSolid` | `viewer/cpe_load_path.js:2778` *(as `A.`)* | 1 | 1 |
| `APP._loadPathLadderLayout` | `viewer/cpe_load_path.js:3999` *(as `A.`)* | 1 | 1 |
| `APP._loadPathLadderLayoutBesideStack` | `viewer/cpe_load_path.js:3973` *(as `A.`)* | 1 | 1 |
| `APP._loadPathMemberUnoccluded` | `viewer/cpe_load_path.js:1630` *(as `A.`)* | 1 | 1 |
| `APP._loadPathMidHoldThisFrame` | `viewer/cinema_maxq.js:2247` *(as `A.`)* | 2 | 8 |
| `APP._loadPathMinVerticalGap` | `viewer/cpe_load_path.js:4000` *(as `A.`)* | 1 | 1 |
| `APP._loadPathNaiveLayout` | `viewer/cpe_load_path.js:3999` *(as `A.`)* | 1 | 1 |
| `APP._loadPathPickTwoStacks` | `viewer/cpe_load_path.js:2001` *(as `A.`)* | 1 | 1 |
| `APP._loadPathProjectAABB` | `viewer/cpe_load_path.js:1357` *(as `A.`)* | 1 | 1 |
| `APP._loadPathProjectAABBLive` | `viewer/cpe_load_path.js:1357` *(as `A.`)* | 1 | 1 |
| `APP._loadPathRankAndCapForScoring` | `viewer/cpe_load_path.js:1805` *(as `A.`)* | 1 | 1 |
| `APP._loadPathRaycastUniverse` | `viewer/cpe_load_path.js:1462` *(as `A.`)* | 1 | 1 |
| `APP._loadPathRectsOverlapCount` | `viewer/cpe_load_path.js:4000` *(as `A.`)* | 1 | 1 |
| `APP._loadPathReleaseTFilm` | `viewer/cpe_load_path.js:3670` *(as `A.`)* | 1 | 2 |
| `APP._loadPathResetRayCache` | `viewer/cpe_load_path.js:1463` *(as `A.`)* | 1 | 1 |
| `APP._loadPathRestoreCount` | `viewer/cpe_load_path.js:3671` *(as `A.`)* | 1 | 6 |
| `APP._loadPathRevealStackStep` | `viewer/cpe_load_path.js:2777` *(as `A.`)* | 1 | 1 |
| `APP._loadPathReverseGuidFor` | `viewer/cpe_load_path.js:1462` *(as `A.`)* | 1 | 1 |
| `APP._loadPathSampleCountFor` | `viewer/cpe_load_path.js:1631` *(as `A.`)* | 1 | 1 |
| `APP._loadPathScoreChain` | `viewer/cpe_load_path.js:1711` *(as `A.`)* | 1 | 1 |
| `APP._loadPathScreenAreaPxLive` | `viewer/cpe_load_path.js:1380` *(as `A.`)* | 1 | 1 |
| `APP._loadPathScreenRectPx` | `viewer/cpe_load_path.js:1659` *(as `A.`)* | 1 | 1 |
| `APP._loadPathSearchHoldPoint` | `viewer/cpe_load_path.js:1234` *(as `A.`)* | 1 | 1 |
| `APP._loadPathShortClassLabel` | `viewer/cpe_load_path.js:4508` *(as `A.`)* | 1 | 1 |
| `APP._loadPathSolidSetFor` | `viewer/cpe_load_path.js:2778` *(as `A.`)* | 1 | 1 |
| `APP._loadPathSourceInstance` | `viewer/cpe_load_path.js:1233` *(as `A.`)* | 1 | 1 |
| `APP._loadPathStackCardLine` | `viewer/cpe_load_path.js:4509` *(as `A.`)* | 1 | 1 |
| `APP._loadPathStackCmp` | `viewer/cpe_load_path.js:1761` *(as `A.`)* | 1 | 1 |
| `APP._loadPathStackFragment` | `viewer/cpe_load_path.js:4508` *(as `A.`)* | 1 | 1 |
| `APP._loadPathStackInfoPanelMaxH` | `viewer/cpe_load_path.js:4044` *(as `A.`)* | 1 | 1 |
| `APP._loadPathStackWitness` | `viewer/cpe_load_path.js:2777` *(as `A.`)* | 1 | 1 |
| `APP._loadPathUnderHud` | `viewer/cpe_load_path.js:1659` *(as `A.`)* | 1 | 1 |
| `APP._loadPathVisualRev` | `viewer/cpe_load_path.js:2755` *(as `A.`)* | 3 | 8 |
| `APP._loadPathWindow` | `viewer/cpe_load_path.js:2386` *(as `A.`)* | 4 | 16 |
| `APP._loadPrebake` | — *phantom* | 0 | 2 |
| `APP._loadRemainingStoreys` | `viewer/measure.js:447` *(as `A.`)* | 1 | 3 |
| `APP._longPressFired` | `viewer/measure.js:1220` *(as `A.`)* | 4 | 5 |
| `APP._longPressTimer` | `viewer/measure.js:1219` *(as `A.`)* | 7 | 15 |
| `APP._lp129BackdropApplyLogCount` | `viewer/cpe_load_path.js:2961` *(as `A.`)* | 1 | 4 |
| `APP._lp129PostReleaseFrameCount` | `viewer/cinema_maxq.js:2274` *(as `A.`)* | 2 | 13 |
| `APP._lpCamDirN` | `viewer/cinema_maxq.js:4909` *(as `A.`)* | 1 | 5 |
| `APP._lpContext` | — *phantom* | 0 | 1 |
| `APP._lpDebugHidden` | `viewer/cpe_load_path.js:3531` *(as `A.`)* | 1 | 3 |
| `APP._lpStackOnly` | `viewer/cpe_load_path.js:911` *(as `A.`)* | 2 | 3 |
| `APP._lpTwins` | — *phantom* | 0 | 2 |
| `APP._mainPillActions` | — *phantom* | 0 | 1 |
| `APP._makeDraggable` | `viewer/measure.js:13` *(as `A.`)* | 1 | 17 |
| `APP._markupActive` | `viewer/sitecam.js:332` *(as `A.`)* | 4 | 6 |
| `APP._markupBaseImage` | `viewer/clash_snag.js:102` *(as `A.`)* | 3 | 4 |
| `APP._markupCanvas` | `viewer/sitecam.js:404` *(as `A.`)* | 1 | 2 |
| `APP._markupColor` | `viewer/sitecam.js:329` *(as `A.`)* | 2 | 3 |
| `APP._markupListenersSet` | `viewer/clash_snag.js:105` *(as `A.`)* | 4 | 5 |
| `APP._markupStart` | `viewer/sitecam.js:333` *(as `A.`)* | 1 | 1 |
| `APP._markupStrokes` | `viewer/clash_snag.js:103` *(as `A.`)* | 3 | 6 |
| `APP._markupTool` | `viewer/sitecam.js:328` *(as `A.`)* | 2 | 8 |
| `APP._matCache` | `viewer/streaming.js:510` *(as `A.`)* | 7 | 65 |
| `APP._matNameCol` | `viewer/streaming.js:288` *(as `A.`)* | 6 | 13 |
| `APP._maxqActive` | `viewer/cinema_maxq.js:2616` *(as `A.`)* | 10 | 91 |
| `APP._measureBoxWarned` | `viewer/cinema_maxq.js:1978` *(as `A.`)* | 1 | 2 |
| `APP._measureCardLast` | `viewer/cinema_maxq.js:3427` *(as `A.`)* | 2 | 3 |
| `APP._measureClickTimer` | `viewer/measure.js:1218` *(as `A.`)* | 6 | 14 |
| `APP._measureFirstHit` | `viewer/measure.js:1297` *(as `A.`)* | 1 | 2 |
| `APP._measureFirstMesh` | `viewer/measure.js:1296` *(as `A.`)* | 3 | 3 |
| `APP._measureItem` | `viewer/measure.js:1388` *(as `A.`)* | 1 | 4 |
| `APP._mepDiscAlbedo` | `viewer/streaming.js:880` *(as `A.`)* | 1 | 10 |
| `APP._mepHueClasses` | `viewer/streaming.js:701` *(as `A.`)* | 1 | 5 |
| `APP._mepHueCounts` | `viewer/streaming.js:1828` *(as `A.`)* | 2 | 5 |
| `APP._mepHueDisc` | `viewer/streaming.js:820` *(as `A.`)* | 3 | 4 |
| `APP._mepHueEligible` | `viewer/streaming.js:875` *(as `A.`)* | 1 | 8 |
| `APP._mepHueOff` | `viewer/tests/witness_mep_color_photoreal.js:179` *(as `A.`)* | 5 | 8 |
| `APP._mepHueRollup` | `viewer/streaming.js:1331` *(as `A.`)* | 1 | 3 |
| `APP._mepNameHint` | `viewer/streaming.js:643` *(as `A.`)* | 1 | 8 |
| `APP._mepProxyDisc` | `viewer/streaming.js:874` *(as `A.`)* | 1 | 1 |
| `APP._mepProxyOff` | — *phantom* | 0 | 1 |
| `APP._mepServiceColour` | `viewer/streaming.js:838` *(as `A.`)* | 1 | 4 |
| `APP._mepSmoothDone` | `viewer/effects.js:2157` *(as `A.`)* | 2 | 5 |
| `APP._mepSpecificTrade` | `viewer/streaming.js:797` *(as `A.`)* | 1 | 1 |
| `APP._mepTradeHue` | `viewer/streaming.js:799` *(as `A.`)* | 1 | 2 |
| `APP._mergeActive` | `viewer/streaming.js:3270` *(as `A.`)* | 2 | 3 |
| `APP._mergeDbIntoScene` | `viewer/scene.js:1225` *(as `A.`)* | 1 | 5 |
| `APP._mergeLogged` | `viewer/streaming.js:2808` *(as `A.`)* | 2 | 3 |
| `APP._mergeNewGuids` | `viewer/scene.js:1198` *(as `A.`)* | 1 | 3 |
| `APP._mergeOverride` | `viewer/streaming.js:2797` *(as `A.`)* | 1 | 3 |
| `APP._mergePending` | `viewer/scene.js:1335` *(as `A.`)* | 3 | 26 |
| `APP._mergeQueueTopUp` | `viewer/scene.js:1207` *(as `A.`)* | 1 | 3 |
| `APP._mergeSplitDbIntoScene` | `viewer/scene.js:1348` *(as `A.`)* | 1 | 2 |
| `APP._mergeStreamNext` | `viewer/scene.js:1464` *(as `A.`)* | 1 | 5 |
| `APP._mergeTopUp` | `viewer/scene.js:1219` *(as `A.`)* | 1 | 6 |
| `APP._mergedIndex` | `viewer/streaming.js:2666` *(as `A.`)* | 2 | 10 |
| `APP._mergedMeta` | `viewer/streaming.js:2665` *(as `A.`)* | 2 | 39 |
| `APP._mergedRayStats` | `viewer/streaming.js:2669` *(as `A.`)* | 1 | 6 |
| `APP._meshArea` | `viewer/measure.js:1461` *(as `A.`)* | 1 | 4 |
| `APP._meshSlimLoadLogged` | `viewer/streaming.js:2566` *(as `A.`)* | 1 | 2 |
| `APP._meshVolume` | `viewer/measure.js:1502` *(as `A.`)* | 1 | 1 |
| `APP._metaGen` | `viewer/city.js:164` *(as `A.`)* | 5 | 24 |
| `APP._metalPbrLogged` | `viewer/streaming.js:1785` *(as `A.`)* | 1 | 2 |
| `APP._metalPbrOff` | `viewer/streaming.js:798` *(as `A.`)* | 1 | 8 |
| `APP._meterIsolating` | `viewer/sourced_light.js:1510` *(as `A.`)* | 2 | 3 |
| `APP._meterLast` | `viewer/effects.js:4933` *(as `A.`)* | 4 | 13 |
| `APP._meterPrimeForced` | `viewer/sourced_light.js:1557` *(as `A.`)* | 1 | 4 |
| `APP._meterPrimeSkipped` | `viewer/sourced_light.js:1558` *(as `A.`)* | 1 | 4 |
| `APP._meterPrimed` | `viewer/sourced_light.js:1560` *(as `A.`)* | 1 | 2 |
| `APP._mirrorOwnMats` | `viewer/effects.js:2803` *(as `A.`)* | 2 | 5 |
| `APP._mobileRenderSkip` | `viewer/main.js:995` | 2 | 4 |
| `APP._moon` | `viewer/time_machine.js:2698` *(as `app.`)* | 3 | 14 |
| `APP._nav` | — *phantom* | 0 | 36 |
| `APP._navLoadedBy` | `viewer/effects.js:6505` *(as `A.`)* | 2 | 5 |
| `APP._navigateLoaded` | `viewer/main.js:154` | 3 | 40 |
| `APP._navigatePromise` | `viewer/main.js:157` | 1 | 4 |
| `APP._nightBakePool` | `viewer/tools.js:2564` *(as `A.`)* | 2 | 31 |
| `APP._nightBakeSlotByPos` | `viewer/tools.js:2565` *(as `A.`)* | 2 | 4 |
| `APP._nightFixtureList` | — *phantom* | 0 | 1 |
| `APP._nightFixtureSource` | — *phantom* | 0 | 2 |
| `APP._nightFixtureWorldPositions` | — *phantom* | 0 | 20 |
| `APP._nightFixtures` | — *phantom* | 0 | 8 |
| `APP._nightGlowClasses` | — *phantom* | 0 | 1 |
| `APP._nightGlowMats` | — *phantom* | 0 | 21 |
| `APP._nightGlowMatsDimmed` | `viewer/tools.js:2731` *(as `A.`)* | 1 | 3 |
| `APP._nightLightByPos` | `viewer/tools.js:2932` *(as `A.`)* | 1 | 22 |
| `APP._nightLightDecayDefault` | — *phantom* | 0 | 1 |
| `APP._nightLights` | `viewer/tools.js:2919` *(as `A.`)* | 3 | 37 |
| `APP._nightMaxLights` | `viewer/effects.js:2679` *(as `A.`)* | 3 | 12 |
| `APP._nightMaxLightsNav` | — *phantom* | 0 | 2 |
| `APP._nightMaxLightsStill` | — *phantom* | 0 | 5 |
| `APP._nightMode` | — *phantom* | 0 | 12 |
| `APP._nightNearFadeFloor` | `viewer/effects.js:2680` *(as `A.`)* | 4 | 15 |
| `APP._nightNearFadeFloorStill` | — *phantom* | 0 | 7 |
| `APP._nightPLScale` | `viewer/effects.js:2681` *(as `A.`)* | 8 | 29 |
| `APP._nightPLScaleStaged` | `viewer/effects.js:4490` *(as `A.`)* | 5 | 14 |
| `APP._nightPLScaleStill` | — *phantom* | 0 | 3 |
| `APP._nightPadLights` | `viewer/tools.js:2978` *(as `A.`)* | 1 | 7 |
| `APP._nightSaved` | — *phantom* | 0 | 10 |
| `APP._nightStars` | `viewer/time_machine.js:2692` *(as `app.`)* | 3 | 14 |
| `APP._nightStillBoost` | — *phantom* | 0 | 4 |
| `APP._nightSyncPads` | `viewer/tools.js:2979` *(as `A.`)* | 1 | 4 |
| `APP._nightUpdateLights` | `viewer/tools.js:2556` *(as `A.`)* | 2 | 19 |
| `APP._nlpDiscMap` | `viewer/nlp.js:595` *(as `A.`)* | 1 | 1 |
| `APP._nlpExecute` | `viewer/nlp.js:589` *(as `A.`)* | 1 | 23 |
| `APP._normalsComputed` | `viewer/scene.js:2269` *(as `A.`)* | 2 | 5 |
| `APP._normalsPrecomputed` | `viewer/scene.js:2266` *(as `A.`)* | 2 | 5 |
| `APP._onResize` | `viewer/scene.js:2293` *(as `A.`)* | 1 | 4 |
| `APP._onStreamDone` | `viewer/main.js:924` | 1 | 4 |
| `APP._openDbBytes` | `viewer/scene.js:1480` *(as `A.`)* | 1 | 7 |
| `APP._openIfcFiles` | `viewer/scene.js:1542` *(as `A.`)* | 1 | 3 |
| `APP._openIssuesDB` | `viewer/issues.js:9` *(as `A.`)* | 1 | 6 |
| `APP._openJsonEditor` | — *phantom* | 0 | 2 |
| `APP._openSplitDbBytes` | `viewer/scene.js:1509` *(as `A.`)* | 1 | 4 |
| `APP._outlinePass` | `viewer/effects.js:48` *(as `A.`)* | 2 | 15 |
| `APP._ovDrawErrLogged` | `viewer/cinema_maxq.js:2074` *(as `A.`)* | 1 | 2 |
| `APP._pbShotCheck` | `viewer/cpe_load_path.js:2444` *(as `A.`)* | 1 | 2 |
| `APP._pendingBboxBuckets` | `viewer/streaming.js:2337` *(as `A.`)* | 2 | 9 |
| `APP._pendingClashArgs` | `viewer/measure.js:297` *(as `A.`)* | 2 | 3 |
| `APP._pendingClashSnag` | `viewer/clash_snag.js:8` *(as `A.`)* | 7 | 13 |
| `APP._pendingClashStoreys` | `viewer/measure.js:296` *(as `A.`)* | 3 | 6 |
| `APP._pendingInstances` | `viewer/streaming.js:2611` *(as `A.`)* | 3 | 10 |
| `APP._pendingSnagInfo` | `viewer/sitecam.js:215` *(as `A.`)* | 1 | 3 |
| `APP._photoAutoStageOn` | `viewer/effects.js:6340` *(as `A.`)* | 1 | 3 |
| `APP._photoDuskMood` | — *phantom* | 0 | 1 |
| `APP._photoFacadeLightsDbg` | — *phantom* | 0 | 1 |
| `APP._photoFillBase` | `viewer/effects.js:4703` *(as `A.`)* | 2 | 9 |
| `APP._photoGroundAlbedoGain` | `viewer/effects.js:2881` *(as `A.`)* | 1 | 3 |
| `APP._photoMatteSkyEnv` | `viewer/effects.js:2953` *(as `A.`)* | 1 | 3 |
| `APP._photoPaintSeed` | `viewer/effects.js:4341` *(as `A.`)* | 2 | 9 |
| `APP._photoPrewarm` | `viewer/effects.js:2150` *(as `A.`)* | 1 | 4 |
| `APP._photoPrewarmDone` | `viewer/effects.js:2152` *(as `A.`)* | 1 | 2 |
| `APP._photoStaffageGroup` | `viewer/effects.js:1124` *(as `A.`)* | 1 | 3 |
| `APP._photoStagingOn` | `viewer/effects.js:3929` *(as `A.`)* | 3 | 12 |
| `APP._pickIsolated` | `viewer/picking.js:20` *(as `A.`)* | 2 | 4 |
| `APP._pieLedgerOn` | `viewer/cinema_maxq.js:3537` *(as `A.`)* | 1 | 3 |
| `APP._plTopoutWant` | `viewer/effects.js:2705` *(as `A.`)* | 1 | 7 |
| `APP._placePanel` | `viewer/panels.js:277` *(as `A.`)* | 1 | 4 |
| `APP._placeTable` | `viewer/cpe_sun_compass.js:593` *(as `A.`)* | 3 | 15 |
| `APP._placeTableLoading` | `viewer/cpe_sun_compass.js:597` *(as `A.`)* | 1 | 4 |
| `APP._placeholderOff` | — *phantom* | 0 | 5 |
| `APP._pointerCount` | `viewer/picking.js:113` *(as `A.`)* | 3 | 9 |
| `APP._populateBusy` | `viewer/effects.js:1671` *(as `A.`)* | 4 | 6 |
| `APP._populatePitchHooked` | `viewer/effects.js:2106` *(as `A.`)* | 1 | 2 |
| `APP._porcelainKey` | `viewer/streaming.js:749` *(as `A.`)* | 1 | 7 |
| `APP._porcelainVariant` | `viewer/streaming.js:755` *(as `A.`)* | 1 | 2 |
| `APP._positionRows` | `viewer/streaming.js:3722` *(as `A.`)* | 2 | 8 |
| `APP._prebake` | — *phantom* | 0 | 6 |
| `APP._prebakeFnv` | — *phantom* | 0 | 6 |
| `APP._prebakeOut` | — *phantom* | 0 | 4 |
| `APP._prebakeRecord` | — *phantom* | 0 | 2 |
| `APP._prepareGraphTour` | `viewer/tour.js:113` *(as `A.`)* | 1 | 2 |
| `APP._probeAimDepth` | — *phantom* | 0 | 7 |
| `APP._proxyVariant` | `viewer/streaming.js:781` *(as `A.`)* | 1 | 3 |
| `APP._qualifyClashRows` | `viewer/measure.js:1159` *(as `A.`)* | 1 | 6 |
| `APP._queryClashes` | `viewer/measure.js:589` *(as `A.`)* | 1 | 1 |
| `APP._queryClashesPair` | `viewer/measure.js:293` *(as `A.`)* | 1 | 5 |
| `APP._queryClashesPairAll` | `viewer/measure.js:555` *(as `A.`)* | 1 | 3 |
| `APP._queryClashesPairRtree` | `viewer/measure.js:360` *(as `A.`)* | 1 | 8 |
| `APP._r10BuildGeo` | `viewer/streaming.js:1122` *(as `A.`)* | 1 | 2 |
| `APP._r10Cost` | `viewer/streaming.js:1251` *(as `A.`)* | 1 | 3 |
| `APP._r10DepthCompiled` | `viewer/streaming.js:1205` *(as `A.`)* | 1 | 3 |
| `APP._r10DepthMat` | `viewer/streaming.js:1209` *(as `A.`)* | 1 | 11 |
| `APP._r10DepthMaterial` | `viewer/streaming.js:1195` *(as `A.`)* | 1 | 3 |
| `APP._r10Eligible` | `viewer/streaming.js:1075` *(as `A.`)* | 1 | 2 |
| `APP._r10GeoCache` | `viewer/streaming.js:1072` *(as `A.`)* | 2 | 5 |
| `APP._r10Guids` | `viewer/streaming.js:1074` *(as `A.`)* | 2 | 6 |
| `APP._r10MatArray` | `viewer/streaming.js:1162` *(as `A.`)* | 1 | 5 |
| `APP._r10MatCache` | `viewer/streaming.js:1180` *(as `A.`)* | 2 | 5 |
| `APP._r10Materials` | `viewer/streaming.js:1181` *(as `A.`)* | 1 | 2 |
| `APP._r10PaneAlpha` | `viewer/streaming.js:1088` *(as `A.`)* | 1 | 3 |
| `APP._r10Report` | `viewer/streaming.js:1212` *(as `A.`)* | 1 | 3 |
| `APP._r10ShadowReport` | `viewer/streaming.js:1233` *(as `A.`)* | 1 | 4 |
| `APP._r10Split` | `viewer/streaming.js:1104` *(as `A.`)* | 1 | 2 |
| `APP._r10St` | `viewer/streaming.js:1080` *(as `A.`)* | 1 | 5 |
| `APP._r10State` | `viewer/streaming.js:1073` *(as `A.`)* | 3 | 6 |
| `APP._rangeDb` | — *phantom* | 0 | 8 |
| `APP._rayAABB` | `viewer/city.js:904` *(as `A.`)* | 1 | 2 |
| `APP._reassertPhotoSparkles` | `viewer/effects.js:5844` *(as `A.`)* | 1 | 1 |
| `APP._redrawMarkup` | `viewer/sitecam.js:358` *(as `A.`)* | 1 | 4 |
| `APP._refreshClashList` | `viewer/measure.js:1150` *(as `A.`)* | 1 | 7 |
| `APP._registerBatchSlot` | `viewer/streaming.js:2686` *(as `A.`)* | 1 | 4 |
| `APP._registerInstanceSlot` | `viewer/streaming.js:2762` *(as `A.`)* | 1 | 3 |
| `APP._registerPanel` | `viewer/scene.js:3465` *(as `A.`)* | 1 | 1 |
| `APP._renderClashList` | `viewer/measure.js:844` *(as `A.`)* | 1 | 8 |
| `APP._renderIssueList` | `viewer/issues.js:95` *(as `A.`)* | 1 | 4 |
| `APP._renderPass` | `viewer/effects.js:144` *(as `A.`)* | 1 | 1 |
| `APP._renderSnagStamps` | `viewer/helpers.js:481` *(as `A.`)* | 1 | 3 |
| `APP._repairDegenerateNormals` | `viewer/streaming.js:2283` *(as `A.`)* | 1 | 3 |
| `APP._reportPairCounts` | `viewer/clash_report.js:11` *(as `A.`)* | 3 | 3 |
| `APP._resDrawErrLogged` | `viewer/cinema_maxq.js:2165` *(as `A.`)* | 1 | 2 |
| `APP._resHoldFrames` | `viewer/cinema_maxq.js:3425` *(as `A.`)* | 2 | 7 |
| `APP._resHoldLogged` | `viewer/cinema_maxq.js:3425` *(as `A.`)* | 2 | 3 |
| `APP._resPanelClRows` | `viewer/cpe_resource_panel.js:921` *(as `A.`)* | 1 | 1 |
| `APP._resPanelFrames` | `viewer/cinema_maxq.js:2161` *(as `A.`)* | 2 | 5 |
| `APP._resPanelOps` | `viewer/cpe_resource_panel.js:56` *(as `A.`)* | 1 | 3 |
| `APP._resPanelProjectEnd` | `viewer/cpe_resource_panel.js:56` *(as `A.`)* | 1 | 3 |
| `APP._resPanelProjectStart` | `viewer/cpe_resource_panel.js:56` *(as `A.`)* | 1 | 4 |
| `APP._resPanelShownRows` | `viewer/cpe_resource_panel.js:921` *(as `A.`)* | 1 | 1 |
| `APP._resWhyLogged` | `viewer/cpe_resource_panel.js:86` *(as `A.`)* | 1 | 2 |
| `APP._resourcePanelBox` | `viewer/cpe_resource_panel.js:337` *(as `A.`)* | 1 | 1 |
| `APP._resourcePanelCostLedgerRowsData` | `viewer/cpe_resource_panel.js:272` *(as `A.`)* | 1 | 1 |
| `APP._resourcePanelFit` | `viewer/cpe_resource_panel.js:334` *(as `A.`)* | 1 | 1 |
| `APP._resourcePanelPieCostLedgerRows` | `viewer/cpe_resource_panel.js:333` *(as `A.`)* | 1 | 1 |
| `APP._resourcePanelResetMaxRowsCache` | `viewer/cpe_resource_panel.js:142` *(as `A.`)* | 1 | 1 |
| `APP._resourcePanelScanMaxRows` | `viewer/cpe_resource_panel.js:141` *(as `A.`)* | 1 | 1 |
| `APP._restoreIsolation` | `viewer/picking.js:42` *(as `A.`)* | 1 | 1 |
| `APP._restoreStaffageInstances` | `viewer/effects.js:1719` *(as `A.`)* | 1 | 2 |
| `APP._revalidateCache` | `viewer/scene.js:1628` *(as `A.`)* | 1 | 2 |
| `APP._revealClashes` | `viewer/measure.js:816` *(as `A.`)* | 1 | 5 |
| `APP._revealTrapN` | `viewer/effects.js:7234` *(as `A.`)* | 1 | 5 |
| `APP._riN` | `viewer/cinema_maxq.js:1791` *(as `A.`)* | 1 | 4 |
| `APP._roadPanelTn` | `viewer/cinema_maxq.js:4061` *(as `A.`)* | 3 | 5 |
| `APP._roadPanelsWarned` | `viewer/cinema_maxq.js:2221` *(as `A.`)* | 1 | 2 |
| `APP._roadReport` | `viewer/road_report.js:171` *(as `A.`)* | 1 | 4 |
| `APP._roadReportText` | `viewer/road_report.js:209` *(as `A.`)* | 1 | 2 |
| `APP._roadStdResult` | `viewer/road_standards.js:136` *(as `A.`)* | 1 | 1 |
| `APP._roadStdStd` | `viewer/road_standards.js:136` *(as `A.`)* | 1 | 1 |
| `APP._roleFilterIdx` | `viewer/panels.js:819` *(as `A.`)* | 2 | 11 |
| `APP._roleFilterLabel` | `viewer/panels.js:832` *(as `A.`)* | 1 | 3 |
| `APP._roomCycle` | `viewer/scene.js:2500` *(as `A.`)* | 1 | 1 |
| `APP._rowOutlines` | `viewer/streaming.js:1472` *(as `A.`)* | 2 | 10 |
| `APP._ruleChecklistActiveCategory` | `viewer/rule_checklist.js:307` *(as `A.`)* | 3 | 6 |
| `APP._ruleChecklistConfig` | `viewer/rule_checklist.js:306` *(as `A.`)* | 2 | 7 |
| `APP._ruleChecklistOpeners` | `viewer/rule_checklist.js:304` *(as `A.`)* | 1 | 6 |
| `APP._ruleFilmLastBoxPin` | `viewer/rule_findings_film.js:674` *(as `A.`)* | 1 | 1 |
| `APP._ruleFilmLastWave` | `viewer/rule_findings_film.js:582` *(as `A.`)* | 1 | 3 |
| `APP._ruleFilmLive` | `viewer/rule_findings_film.js:441` *(as `A.`)* | 2 | 4 |
| `APP._ruleFilmQueue` | `viewer/rule_findings_film.js:513` *(as `A.`)* | 1 | 1 |
| `APP._ruleFindingsFilmWarned` | `viewer/cinema_maxq.js:1929` *(as `A.`)* | 1 | 2 |
| `APP._ruleOverlay` | `viewer/rule_checklist.js:785` *(as `A.`)* | 1 | 4 |
| `APP._ruleProvenance` | `viewer/rule_checklist.js:785` *(as `A.`)* | 1 | 4 |
| `APP._ruleTintActive` | `viewer/rule_checklist.js:516` *(as `A.`)* | 3 | 5 |
| `APP._ruleTintAt` | `viewer/rule_checklist.js:594` *(as `A.`)* | 2 | 4 |
| `APP._ruleTintMeshes` | `viewer/rule_checklist.js:515` *(as `A.`)* | 3 | 11 |
| `APP._saveClashIssue` | `viewer/clash_snag.js:260` *(as `A.`)* | 1 | 4 |
| `APP._saveClashStatuses` | `viewer/measure.js:644` *(as `A.`)* | 1 | 2 |
| `APP._saveIssueToLog` | `viewer/issues.js:24` *(as `A.`)* | 1 | 3 |
| `APP._sceneBorrowed` | `viewer/gi_still.js:813` | 4 | 6 |
| `APP._scrubHide` | `viewer/tour.js:2041` *(as `A.`)* | 1 | 11 |
| `APP._scrubShow` | `viewer/tour.js:2031` *(as `A.`)* | 1 | 7 |
| `APP._scrubStop` | `viewer/tour.js:2052` *(as `A.`)* | 1 | 5 |
| `APP._scrubVisible` | `viewer/tour.js:2027` *(as `A.`)* | 1 | 9 |
| `APP._secMode` | — *phantom* | 0 | 1 |
| `APP._sectionNav` | `viewer/panels.js:683` *(as `A.`)* | 1 | 3 |
| `APP._setBillboardImage` | `viewer/effects.js:2298` *(as `A.`)* | 1 | 1 |
| `APP._setGroundColor` | — *phantom* | 0 | 7 |
| `APP._setGroundWetness` | `viewer/effects.js:4010` *(as `A.`)* | 1 | 4 |
| `APP._setRuleChecklistCategory` | `viewer/rule_checklist.js:503` *(as `A.`)* | 1 | 4 |
| `APP._setTreeMode` | — *phantom* | 0 | 2 |
| `APP._shadowGroundKey` | — *phantom* | 0 | 3 |
| `APP._shadowInited` | `viewer/effects.js:3589` *(as `A.`)* | 1 | 2 |
| `APP._shadowOn` | — *phantom* | 0 | 22 |
| `APP._shadowRestoreMat` | `viewer/effects.js:5556` *(as `A.`)* | 1 | 1 |
| `APP._shareClashSnag` | `viewer/clash_snag.js:115` *(as `A.`)* | 1 | 4 |
| `APP._shareLoaded` | `viewer/import.js:617` *(as `A.`)* | 1 | 2 |
| `APP._shellTrace` | — *phantom* | 0 | 1 |
| `APP._show4DWindow` | — *phantom* | 0 | 7 |
| `APP._showClashMatrix` | `viewer/clash_matrix.js:88` *(as `A.`)* | 1 | 5 |
| `APP._showIssueDetail` | `viewer/issues.js:130` *(as `A.`)* | 1 | 2 |
| `APP._showMergeModal` | `viewer/scene.js:1016` *(as `A.`)* | 1 | 3 |
| `APP._singleBuildingName` | `viewer/streaming.js:276` *(as `A.`)* | 1 | 8 |
| `APP._sky` | `viewer/scene.js:270` *(as `A.`)* | 1 | 76 |
| `APP._skyPortalLast` | `viewer/sky_portal.js:147` *(as `A.`)* | 2 | 2 |
| `APP._slForcePZ` | `viewer/tests/witness_sourced_crosswall.js:41` *(as `A.`)* | 2 | 5 |
| `APP._slLastOrder` | `viewer/sourced_light.js:898` *(as `A.`)* | 1 | 3 |
| `APP._slabBeatAtWarned` | `viewer/cinema_maxq.js:4225` *(as `A.`)* | 1 | 2 |
| `APP._slabBeatWarned` | `viewer/cinema_maxq.js:1911` *(as `A.`)* | 1 | 2 |
| `APP._snagClash` | `viewer/clash_snag.js:11` *(as `A.`)* | 1 | 2 |
| `APP._snagGroup` | `viewer/helpers.js:479` *(as `A.`)* | 2 | 9 |
| `APP._snagObserver` | `viewer/sitecam.js:22` *(as `A.`)* | 1 | 2 |
| `APP._solidMeshes` | `viewer/effects.js:1017` *(as `A.`)* | 1 | 6 |
| `APP._sourcedCap` | `viewer/sourced_light.js:989` *(as `A.`)* | 3 | 27 |
| `APP._sourcedZoneAt` | `viewer/tests/witness_sourced_stack.js:56` *(as `A.`)* | 1 | 1 |
| `APP._speedZones` | `viewer/speed_zones.js:576` *(as `A.`)* | 2 | 16 |
| `APP._speedZonesTint` | `viewer/speed_zones.js:376` *(as `A.`)* | 2 | 3 |
| `APP._splitHasMeta` | `viewer/streaming.js:3782` *(as `A.`)* | 4 | 7 |
| `APP._ssaoPass` | `viewer/effects.js:11` *(as `A.`)* | 2 | 21 |
| `APP._ssgiActive` | `viewer/effects_gi_poc.js:140` *(as `A.`)* | 4 | 17 |
| `APP._ssgiEffect` | `viewer/effects_gi_poc.js:315` *(as `A.`)* | 1 | 13 |
| `APP._staffageIsSeat` | `viewer/effects.js:1851` *(as `A.`)* | 1 | 1 |
| `APP._startFlyTour` | `viewer/tour.js:313` *(as `A.`)* | 1 | 3 |
| `APP._statTailFrames` | `viewer/cinema_maxq.js:3426` *(as `A.`)* | 2 | 6 |
| `APP._statTailLogged` | `viewer/cinema_maxq.js:3426` *(as `A.`)* | 2 | 3 |
| `APP._statTailRosterLogged` | `viewer/cinema_maxq.js:4643` *(as `A.`)* | 1 | 2 |
| `APP._statusBoxWarned` | `viewer/cinema_maxq.js:2188` *(as `A.`)* | 1 | 2 |
| `APP._stdMatClasses` | `viewer/streaming.js:1763` *(as `A.`)* | 1 | 6 |
| `APP._stillAOAdapter` | `viewer/effects.js:5555` *(as `A.`)* | 1 | 6 |
| `APP._stillAOPass` | `viewer/effects.js:5554` *(as `A.`)* | 1 | 1 |
| `APP._stillAlbedoCap` | — *phantom* | 0 | 2 |
| `APP._stillAo` | — *phantom* | 0 | 3 |
| `APP._stillAoLamps` | — *phantom* | 0 | 1 |
| `APP._stillBounceGain` | `viewer/tests/witness_gi_gain_dial.js:34` | 3 | 5 |
| `APP._stillBudget` | `viewer/cinema_maxq.js:581` | 3 | 9 |
| `APP._stillCalib` | — *phantom* | 0 | 1 |
| `APP._stillCalibOn` | `viewer/effects.js:4506` *(as `A.`)* | 1 | 6 |
| `APP._stillCalibSunI` | `viewer/effects.js:4507` *(as `A.`)* | 1 | 14 |
| `APP._stillCalibSunLux` | `viewer/effects.js:4507` *(as `A.`)* | 1 | 11 |
| `APP._stillCamInsideNow` | `viewer/effects.js:3551` *(as `A.`)* | 4 | 9 |
| `APP._stillCamSrc` | `viewer/effects.js:4236` *(as `A.`)* | 2 | 8 |
| `APP._stillCapCentre` | — *phantom* | 0 | 1 |
| `APP._stillCarryLast` | `viewer/gi_still.js:916` *(as `A.`)* | 1 | 1 |
| `APP._stillCascadeExtraUnits` | `viewer/effects.js:3298` *(as `A.`)* | 2 | 3 |
| `APP._stillContact` | — *phantom* | 0 | 1 |
| `APP._stillCove` | `viewer/sourced_light.js:1312` | 1 | 2 |
| `APP._stillCullOff` | `viewer/tests/witness_still_shadow_fit.js:48` *(as `A.`)* | 1 | 1 |
| `APP._stillExpMul` | — *phantom* | 0 | 2 |
| `APP._stillFaultGiLast` | `viewer/gi_still.js:1010` *(as `A.`)* | 1 | 2 |
| `APP._stillFaultLast` | `viewer/still_fault.js:187` *(as `A.`)* | 1 | 2 |
| `APP._stillFloorContact` | — *phantom* | 0 | 2 |
| `APP._stillFloorFSmooth` | — *phantom* | 0 | 1 |
| `APP._stillFresnel` | `viewer/tests/witness_glass_fresnel.js:29` *(as `A.`)* | 1 | 3 |
| `APP._stillGiAlb` | — *phantom* | 0 | 1 |
| `APP._stillGiBound` | — *phantom* | 0 | 1 |
| `APP._stillGiRedist` | — *phantom* | 0 | 1 |
| `APP._stillGlassBlock` | — *phantom* | 0 | 1 |
| `APP._stillGlassEnv` | — *phantom* | 0 | 1 |
| `APP._stillGlassOpen` | `viewer/light_zones.js:1130` | 2 | 3 |
| `APP._stillGlassTone` | — *phantom* | 0 | 2 |
| `APP._stillGridBlend` | `viewer/tests/witness_z18_gridblend.js:79` | 1 | 3 |
| `APP._stillGroundLaw` | — *phantom* | 0 | 1 |
| `APP._stillGroundMode` | — *phantom* | 0 | 1 |
| `APP._stillGroundView` | `viewer/sourced_light.js:1090` | 1 | 2 |
| `APP._stillIr` | — *phantom* | 0 | 1 |
| `APP._stillIrColour` | — *phantom* | 0 | 1 |
| `APP._stillIrc` | — *phantom* | 0 | 1 |
| `APP._stillLampCap` | `viewer/sky_portal.js:134` *(as `A.`)* | 2 | 21 |
| `APP._stillLampCapNearest` | — *phantom* | 0 | 1 |
| `APP._stillLampData` | — *phantom* | 0 | 1 |
| `APP._stillLampDecayNow` | `viewer/effects.js:4493` *(as `A.`)* | 2 | 9 |
| `APP._stillLampEn` | — *phantom* | 0 | 1 |
| `APP._stillLampMul` | `viewer/effects.js:4511` *(as `A.`)* | 2 | 7 |
| `APP._stillLampRangeNow` | `viewer/effects.js:4517` *(as `A.`)* | 2 | 6 |
| `APP._stillLampsOff` | `viewer/effects.js:4591` *(as `A.`)* | 3 | 16 |
| `APP._stillLocalExp` | — *phantom* | 0 | 2 |
| `APP._stillLockOn` | `viewer/effects.js:6460` *(as `A.`)* | 1 | 7 |
| `APP._stillLockRelease` | `viewer/effects.js:6472` *(as `A.`)* | 1 | 1 |
| `APP._stillMeter` | `viewer/effects.js:4509` *(as `A.`)* | 2 | 5 |
| `APP._stillMeterMode` | — *phantom* | 0 | 2 |
| `APP._stillObjContact` | — *phantom* | 0 | 2 |
| `APP._stillPortalSort` | — *phantom* | 0 | 1 |
| `APP._stillPortalsKeep` | — *phantom* | 0 | 1 |
| `APP._stillPoseLast` | `viewer/effects.js:4800` *(as `A.`)* | 1 | 10 |
| `APP._stillRefineActive` | `viewer/effects.js:171` *(as `A.`)* | 8 | 97 |
| `APP._stillRefineBusy` | `viewer/effects.js:5657` *(as `A.`)* | 10 | 42 |
| `APP._stillRes` | `viewer/tests/witness_still_res.js:24` | 1 | 3 |
| `APP._stillResPreset` | `viewer/effects.js:5765` *(as `A.`)* | 1 | 3 |
| `APP._stillSSGIEnabled` | `viewer/effects_gi_poc.js:541` *(as `A.`)* | 1 | 2 |
| `APP._stillShadowCascade` | — *phantom* | 0 | 1 |
| `APP._stillShadowEdge` | — *phantom* | 0 | 1 |
| `APP._stillShadowFit` | `viewer/effects.js:4781` | 2 | 4 |
| `APP._stillShadowRadius` | `viewer/tests/witness_still_shadow_fit.js:49` | 1 | 4 |
| `APP._stillShadowWide` | `viewer/effects.js:3201` *(as `A.`)* | 1 | 7 |
| `APP._stillShapeColour` | `viewer/effects.js:4530` *(as `A.`)* | 2 | 3 |
| `APP._stillShellCull` | — *phantom* | 0 | 1 |
| `APP._stillShellReach` | — *phantom* | 0 | 2 |
| `APP._stillSkyExact` | `viewer/light_zones.js:1126` | 1 | 2 |
| `APP._stillSkyExactAll` | `viewer/light_zones.js:788` | 2 | 5 |
| `APP._stillSkyExactAllN` | — *phantom* | 0 | 1 |
| `APP._stillSkyExactAllShell` | — *phantom* | 0 | 1 |
| `APP._stillSkyExactCov` | — *phantom* | 0 | 1 |
| `APP._stillSkyField` | `viewer/sourced_light.js:1061` | 1 | 2 |
| `APP._stillSkyOcc` | `viewer/tests/witness_sky_occlusion.js:30` *(as `A.`)* | 1 | 3 |
| `APP._stillSkyOpenRoof` | — *phantom* | 0 | 1 |
| `APP._stillSkyShell` | `viewer/light_zones.js:1059` | 2 | 3 |
| `APP._stillSkySmooth` | `viewer/light_zones.js:810` | 1 | 2 |
| `APP._stillSpecSmooth` | `viewer/tests/witness_z18_gridblend.js:76` | 1 | 2 |
| `APP._stillSrgbFix` | — *phantom* | 0 | 2 |
| `APP._stillStageMsLast` | `viewer/effects.js:4784` *(as `A.`)* | 1 | 3 |
| `APP._stillTorch` | — *phantom* | 0 | 1 |
| `APP._stillUnlitPts` | `viewer/still_fault.js:187` *(as `A.`)* | 1 | 1 |
| `APP._stillWindowGlowOff` | `viewer/effects.js:4584` *(as `A.`)* | 5 | 7 |
| `APP._stillWindowPull` | `viewer/gi_still.js:1093` | 1 | 2 |
| `APP._stillZoneEye` | `viewer/sourced_light.js:1418` | 1 | 2 |
| `APP._storeyCutCeilY` | `viewer/cpe_storey_reveal.js:2263` *(as `A.`)* | 2 | 5 |
| `APP._storeyOrdinalKeys` | — *phantom* | 0 | 1 |
| `APP._storeyRevealArmed` | `viewer/cpe_storey_reveal.js:2321` *(as `A.`)* | 5 | 6 |
| `APP._storeyVisible` | `viewer/panels.js:719` *(as `A.`)* | 1 | 19 |
| `APP._streamPaused` | `viewer/streaming.js:2501` *(as `A.`)* | 2 | 3 |
| `APP._streaming` | — *phantom* | 0 | 1 |
| `APP._structuralRulesCache` | — *phantom* | 0 | 2 |
| `APP._structuralRulesSource` | — *phantom* | 0 | 1 |
| `APP._sunArcElevationDeg` | `viewer/effects.js:2594` *(as `A.`)* | 3 | 8 |
| `APP._sunArcFillPin` | `viewer/effects.js:2704` *(as `A.`)* | 2 | 8 |
| `APP._sunArcStep` | `viewer/effects.js:2611` *(as `A.`)* | 1 | 13 |
| `APP._sunClockWarned` | `viewer/cinema_maxq.js:2099` *(as `A.`)* | 1 | 2 |
| `APP._sunCompassAtWarned` | `viewer/cinema_maxq.js:4048` *(as `A.`)* | 1 | 2 |
| `APP._sunCompassDrawWarned` | `viewer/cinema_maxq.js:2111` *(as `A.`)* | 1 | 2 |
| `APP._sunCompassOn` | `viewer/cinema_maxq.js:3551` *(as `A.`)* | 4 | 14 |
| `APP._sunCycleActive` | `viewer/time_machine.js:2605` *(as `app.`)* | 3 | 3 |
| `APP._sunShadowRestoreEnabled` | `viewer/effects.js:5561` *(as `A.`)* | 2 | 5 |
| `APP._sunglassBackups` | — *phantom* | 0 | 11 |
| `APP._sunglassNav` | `viewer/panels.js:699` *(as `A.`)* | 1 | 3 |
| `APP._surfBuildRoof` | `viewer/streaming.js:959` *(as `A.`)* | 1 | 2 |
| `APP._surfRoofGuids` | `viewer/streaming.js:958` *(as `A.`)* | 3 | 6 |
| `APP._surfRowFor` | `viewer/streaming.js:1028` *(as `A.`)* | 1 | 8 |
| `APP._surfRowOf` | `viewer/streaming.js:1011` *(as `A.`)* | 1 | 2 |
| `APP._surfRules` | `viewer/streaming.js:934` *(as `A.`)* | 2 | 12 |
| `APP._surfSubstance` | `viewer/streaming.js:939` *(as `A.`)* | 1 | 4 |
| `APP._surfTally` | `viewer/streaming.js:1044` *(as `A.`)* | 1 | 3 |
| `APP._surfTallyData` | `viewer/streaming.js:1027` *(as `A.`)* | 2 | 4 |
| `APP._swCacheVersion` | — *phantom* | 0 | 1 |
| `APP._swVersion` | `viewer/effects.js:4796` *(as `A.`)* | 2 | 5 |
| `APP._szPrewarmed` | `viewer/speed_zones.js:561` *(as `A.`)* | 1 | 2 |
| `APP._taaPass` | `viewer/effects.js:145` *(as `A.`)* | 1 | 46 |
| `APP._teardownStillRefine` | — *phantom* | 0 | 2 |
| `APP._tmBloomActive` | `viewer/time_machine.js:2760` *(as `app.`)* | 3 | 6 |
| `APP._tmComposeSnapshot` | `viewer/share.js:370` *(as `A.`)* | 1 | 2 |
| `APP._tmIsVisible` | `viewer/effects.js:2426` *(as `A.`)* | 2 | 7 |
| `APP._tmOn` | `viewer/time_machine.js:9461` *(as `app.`)* | 2 | 16 |
| `APP._tmOverlayRegister` | `viewer/effects.js:2427` *(as `A.`)* | 1 | 4 |
| `APP._tmSnapshotCaption` | `viewer/share.js:358` *(as `A.`)* | 1 | 2 |
| `APP._tmState` | — *phantom* | 0 | 3 |
| `APP._tmUnmergeTried` | `viewer/time_machine.js:9226` *(as `app.`)* | 1 | 2 |
| `APP._toggleClashStatus` | `viewer/measure.js:1096` *(as `A.`)* | 1 | 3 |
| `APP._toolbarNav` | `viewer/panels.js:668` *(as `A.`)* | 1 | 3 |
| `APP._tourCacheBust` | `viewer/tour.js:274` *(as `A.`)* | 1 | 5 |
| `APP._tourCachedRoute` | `viewer/tour.js:91` *(as `A.`)* | 3 | 8 |
| `APP._tourPaused` | `viewer/tour.js:363` *(as `A.`)* | 4 | 17 |
| `APP._tourPrepare` | `viewer/tour.js:1548` *(as `A.`)* | 1 | 2 |
| `APP._tourStarts` | `viewer/tour.js:1553` *(as `A.`)* | 1 | 27 |
| `APP._tourStoreyZ` | `viewer/tour.js:457` *(as `A.`)* | 1 | 3 |
| `APP._tourT` | `viewer/tour.js:1565` *(as `A.`)* | 4 | 21 |
| `APP._tourTotal` | `viewer/tour.js:1564` *(as `A.`)* | 1 | 27 |
| `APP._triActiveFor` | `viewer/streaming.js:923` *(as `A.`)* | 1 | 3 |
| `APP._triBigOnly` | `viewer/streaming.js:922` *(as `A.`)* | 1 | 5 |
| `APP._triNormalOff` | `witness/witness_triplanar_normal.js:47` | 1 | 2 |
| `APP._triResolve` | `viewer/streaming.js:1260` *(as `A.`)* | 1 | 6 |
| `APP._triSrcTally` | `viewer/streaming.js:1274` *(as `A.`)* | 1 | 3 |
| `APP._triplanarLoader` | `viewer/streaming.js:1976` *(as `A.`)* | 1 | 3 |
| `APP._triplanarMaterials` | `viewer/streaming.js:2158` *(as `A.`)* | 1 | 10 |
| `APP._triplanarTexCache` | `viewer/streaming.js:1975` *(as `A.`)* | 1 | 5 |
| `APP._updateCamLight` | `viewer/effects.js:399` *(as `A.`)* | 1 | 3 |
| `APP._updateCamTorch` | `viewer/effects.js:411` *(as `A.`)* | 1 | 4 |
| `APP._updateClashLOD` | `viewer/measure.js:1923` *(as `A.`)* | 1 | 3 |
| `APP._updateFacadeFacing` | — *phantom* | 0 | 2 |
| `APP._updateFogDensity` | `viewer/scene.js:145` *(as `A.`)* | 1 | 9 |
| `APP._useDlodPath` | `viewer/streaming.js:19` *(as `A.`)* | 3 | 7 |
| `APP._useRangeStream` | — *phantom* | 0 | 5 |
| `APP._visibilityGen` | `viewer/panels.js:746` *(as `A.`)* | 3 | 7 |
| `APP._voToErp` | `viewer/diff.js:420` *(as `A.`)* | 1 | 2 |
| `APP._walkAlphaOffset` | `viewer/walk.js:96` *(as `A.`)* | 2 | 4 |
| `APP._walkBaselineAlpha` | `viewer/walk.js:111` *(as `A.`)* | 2 | 4 |
| `APP._walkCleanupScreen` | `viewer/walk.js:164` *(as `A.`)* | 2 | 4 |
| `APP._walkDeviceEvent` | `viewer/walk.js:99` *(as `A.`)* | 2 | 4 |
| `APP._walkFirstUpdate` | `viewer/walk.js:97` *(as `A.`)* | 1 | 1 |
| `APP._walkMode` | — *phantom* | 0 | 1 |
| `APP._walkOrientListener` | `viewer/walk.js:106` *(as `A.`)* | 2 | 7 |
| `APP._walkQBaseline` | `viewer/walk.js:89` *(as `A.`)* | 1 | 1 |
| `APP._walkQDoor` | `viewer/walk.js:88` *(as `A.`)* | 1 | 7 |
| `APP._walkScreenOrientation` | `viewer/walk.js:98` *(as `A.`)* | 2 | 6 |
| `APP._walkSmoothedAlpha` | `viewer/walk.js:100` *(as `A.`)* | 1 | 1 |
| `APP._walkUnlocked` | `viewer/walk.js:112` *(as `A.`)* | 2 | 3 |
| `APP._webglContextLost` | `viewer/scene.js:497` *(as `A.`)* | 2 | 3 |
| `APP._winCtx` | `erp/idempiere.html:4953` | 1 | 1 |
| `APP._windBuckets` | `viewer/streaming.js:1456` *(as `A.`)* | 1 | 4 |
| `APP._windFlip` | `viewer/still_fault.js:186` | 1 | 2 |
| `APP._windFlipAny` | `viewer/streaming.js:1456` *(as `A.`)* | 1 | 4 |
| `APP._windStat` | `viewer/scene.js:2250` *(as `A.`)* | 1 | 8 |
| `APP._windTable` | `viewer/scene.js:2210` *(as `A.`)* | 2 | 5 |
| `APP._windTableGet` | `viewer/scene.js:2209` *(as `A.`)* | 1 | 5 |
| `APP._wireListKeyNav` | `viewer/panels.js:662` *(as `A.`)* | 1 | 3 |
| `APP._wizardLoaded` | `viewer/main.js:292` | 3 | 3 |
| `APP._wizardPromise` | `viewer/main.js:295` | 1 | 4 |
| `APP._wlog` | `viewer/picking.js:88` *(as `A.`)* | 1 | 3 |
| `APP._worldBoxDlodRestored` | `viewer/cpe_load_path.js:1201` *(as `A.`)* | 1 | 2 |
| `APP.activeBuilding` | `viewer/city.js:788` *(as `A.`)* | 9 | 336 |
| `APP.activeBuildingTotal` | `viewer/city.js:789` *(as `A.`)* | 9 | 19 |
| `APP.activeGuidFilter` | `viewer/panels.js:863` *(as `A.`)* | 1 | 9 |
| `APP.activeStoreyFilter` | `viewer/main.js:1184` | 4 | 30 |
| `APP.actor` | `erp/idempiere.html:1373` | 2 | 31 |
| `APP.addQRBorder` | `viewer/helpers.js:412` *(as `A.`)* | 1 | 2 |
| `APP.advanceNavStep` | — *phantom* | 0 | 2 |
| `APP.advanceWalkStep` | `viewer/walk.js:458` *(as `A.`)* | 1 | 5 |
| `APP.allBuildingCards` | `viewer/panels.js:916` *(as `A.`)* | 2 | 5 |
| `APP.allRoomVolumes` | `witness/witness_escape_colours.js:37` *(as `A.`)* | 2 | 13 |
| `APP.ambient` | `viewer/scene.js:212` *(as `A.`)* | 1 | 52 |
| `APP.applicable` | — *phantom* | 0 | 2 |
| `APP.applyDiffOverlay` | `viewer/diff.js:56` *(as `A.`)* | 1 | 4 |
| `APP.applyFindScope` | — *phantom* | 0 | 8 |
| `APP.askAnswers` | — *phantom* | 0 | 7 |
| `APP.askBuildWorkbook` | — *phantom* | 0 | 2 |
| `APP.askInput` | — *phantom* | 0 | 1 |
| `APP.askRun` | — *phantom* | 0 | 6 |
| `APP.askSuggest` | — *phantom* | 0 | 5 |
| `APP.bearingDirectionThree` | `viewer/sun_path.js:207` *(as `A.`)* | 1 | 6 |
| `APP.bigStatsAt` | `viewer/cpe_resource_panel.js:743` *(as `A.`)* | 1 | 3 |
| `APP.bigStatsAtSpan` | `viewer/cpe_resource_panel.js:731` *(as `A.`)* | 1 | 3 |
| `APP.bigStatsBoxRect` | `viewer/cpe_resource_panel.js:894` *(as `A.`)* | 1 | 3 |
| `APP.bigStatsBuild` | `viewer/cpe_resource_panel.js:478` *(as `A.`)* | 1 | 9 |
| `APP.bigStatsCompositeOntoCanvas` | `viewer/cpe_resource_panel.js:898` *(as `A.`)* | 1 | 6 |
| `APP.bigStatsLastBox` | `viewer/cinema_maxq.js:2125` *(as `A.`)* | 3 | 8 |
| `APP.blobToGeometry` | `viewer/scene.js:2217` *(as `A.`)* | 1 | 9 |
| `APP.buildDoorPath` | `viewer/tour.js:2375` *(as `A.`)* | 1 | 2 |
| `APP.buildPointPath` | `viewer/tour.js:2283` *(as `A.`)* | 1 | 3 |
| `APP.buildRouteTemplate` | — *phantom* | 0 | 2 |
| `APP.buildRuleDeepLink` | `viewer/rule_checklist.js:674` *(as `A.`)* | 1 | 3 |
| `APP.buildShareUrl` | `viewer/share.js:211` *(as `A.`)* | 1 | 5 |
| `APP.buildSpacePath` | `viewer/tour.js:2370` *(as `A.`)* | 1 | 2 |
| `APP.buildTour` | `viewer/tour.js:948` *(as `A.`)* | 1 | 2 |
| `APP.buildWalkGraphPath` | `viewer/tour.js:2164` *(as `A.`)* | 1 | 2 |
| `APP.buildingCentres` | `viewer/scene.js:474` *(as `A.`)* | 1 | 100 |
| `APP.buildingMeasureCard` | `viewer/cpe_resource_panel.js:699` *(as `A.`)* | 1 | 2 |
| `APP.buildingMeasureCards` | `viewer/cpe_resource_panel.js:633` *(as `A.`)* | 1 | 3 |
| `APP.buildingName` | — *phantom* | 0 | 4 |
| `APP.buildingsRendered` | `viewer/scene.js:483` *(as `A.`)* | 1 | 112 |
| `APP.buildupCursorAt` | `viewer/cinema_maxq.js:5260` | 1 | 31 |
| `APP.buildupPacingReset` | `viewer/cinema_maxq.js:5265` | 1 | 19 |
| `APP.buildupTAt` | `viewer/cinema_maxq.js:5263` | 1 | 27 |
| `APP.buildupTopoutU` | `viewer/cinema_maxq.js:5264` | 1 | 9 |
| `APP.cacheStoreyLevels` | `viewer/walk.js:243` *(as `A.`)* | 1 | 2 |
| `APP.cachedFetch` | `viewer/scene.js:1674` *(as `A.`)* | 1 | 21 |
| `APP.camera` | `viewer/grid_views.js:83` *(as `A.`)* | 4 | 1182 |
| `APP.cancelMaxQualityOrbit` | `viewer/cinema_maxq.js:5255` | 1 | 4 |
| `APP.cancelWalkAnchor` | `viewer/walk.js:33` *(as `A.`)* | 1 | 2 |
| `APP.canvas` | `viewer/scene.js:10` *(as `A.`)* | 1 | 56 |
| `APP.chainage` | `viewer/chainage_grid.js:519` *(as `A.`)* | 1 | 35 |
| `APP.checkUpdate` | `viewer/scene.js:3389` *(as `A.`)* | 1 | 1 |
| `APP.cinemaBandFlow` | `viewer/effects.js:7361` *(as `A.`)* | 1 | 10 |
| `APP.cinemaBandWaypoints` | `viewer/effects.js:7288` *(as `A.`)* | 1 | 2 |
| `APP.cinemaFan` | `viewer/effects.js:10901` *(as `A.`)* | 1 | 5 |
| `APP.cinemaHoseApply` | `viewer/effects.js:7415` *(as `A.`)* | 1 | 6 |
| `APP.cinemaHoseReanchor` | `viewer/effects.js:7444` *(as `A.`)* | 1 | 2 |
| `APP.cinemaLookDist` | `viewer/effects.js:10921` *(as `A.`)* | 1 | 4 |
| `APP.cinemaPathEditor` | `viewer/cinema_path_editor.js:4224` | 1 | 148 |
| `APP.cinemaPathPlan` | `viewer/effects.js:10855` *(as `A.`)* | 1 | 217 |
| `APP.cinemaPathPlanDerived` | `viewer/effects.js:10896` *(as `A.`)* | 1 | 2 |
| `APP.cinemaPrefixInvalidate` | `viewer/effects.js:10781` *(as `A.`)* | 1 | 3 |
| `APP.cinemaRoundCorners` | `viewer/effects.js:6841` *(as `A.`)* | 1 | 3 |
| `APP.cinemaSeedBands` | `viewer/effects.js:7540` *(as `A.`)* | 1 | 13 |
| `APP.cinemaSeedStick` | `viewer/effects.js:7559` *(as `A.`)* | 1 | 3 |
| `APP.cityArchetypes` | `viewer/city.js:10` *(as `A.`)* | 1 | 5 |
| `APP.cityBuildingDbs` | `viewer/city.js:11` *(as `A.`)* | 3 | 15 |
| `APP.cityClear` | `viewer/city.js:806` *(as `A.`)* | 1 | 1 |
| `APP.cityDb` | `viewer/city.js:8` *(as `A.`)* | 2 | 13 |
| `APP.cityLoadBuilding` | `viewer/city.js:641` *(as `A.`)* | 1 | 3 |
| `APP.citySQL` | `viewer/city.js:9` *(as `A.`)* | 2 | 9 |
| `APP.civilCastZ` | `viewer/civil_sections.js:128` *(as `A.`)* | 1 | 3 |
| `APP.civilChainLabel` | `viewer/chainage_grid.js:498` *(as `A.`)* | 1 | 9 |
| `APP.civilChainRange` | `viewer/chainage_grid.js:502` *(as `A.`)* | 1 | 10 |
| `APP.civilChainReal` | `viewer/chainage_grid.js:506` *(as `A.`)* | 1 | 13 |
| `APP.civilChainageAt` | `viewer/cpe_road_panels.js:289` *(as `A.`)* | 1 | 3 |
| `APP.civilCrossOutput` | `viewer/civil_sections.js:275` *(as `A.`)* | 1 | 7 |
| `APP.civilCrossPDF` | `viewer/civil_sections.js:347` *(as `A.`)* | 1 | 2 |
| `APP.civilCrossPNG` | `viewer/civil_sections.js:328` *(as `A.`)* | 1 | 3 |
| `APP.civilCrossSection` | `viewer/civil_sections.js:158` *(as `A.`)* | 1 | 4 |
| `APP.civilCrossSectionOff` | `viewer/civil_sections.js:175` *(as `A.`)* | 1 | 3 |
| `APP.civilCrossSegments` | `viewer/civil_sections.js:241` *(as `A.`)* | 1 | 2 |
| `APP.civilCrossSheetHTML` | `viewer/civil_sections.js:339` *(as `A.`)* | 1 | 2 |
| `APP.civilDriveRoute` | `viewer/effects.js:10854` *(as `A.`)* | 1 | 14 |
| `APP.civilElementBoxes` | `viewer/civil_sections.js:185` *(as `A.`)* | 1 | 2 |
| `APP.civilGotoChainage` | `viewer/civil_sections.js:353` *(as `A.`)* | 1 | 10 |
| `APP.civilLensPNG` | `viewer/civil_sections.js:538` *(as `A.`)* | 1 | 3 |
| `APP.civilLongSection` | `viewer/civil_sections.js:134` *(as `A.`)* | 1 | 4 |
| `APP.civilProfile` | `viewer/civil_sections.js:424` *(as `A.`)* | 1 | 11 |
| `APP.civilProfilePDF` | `viewer/civil_sections.js:577` *(as `A.`)* | 1 | 2 |
| `APP.civilProfilePrepare` | `viewer/civil_sections.js:389` *(as `A.`)* | 1 | 11 |
| `APP.civilProfilePrepareNow` | `viewer/civil_sections.js:396` *(as `A.`)* | 1 | 2 |
| `APP.civilProfileSheetsHTML` | `viewer/civil_sections.js:549` *(as `A.`)* | 1 | 2 |
| `APP.civilRouteAt` | `viewer/civil_sections.js:39` *(as `A.`)* | 1 | 23 |
| `APP.civilRoutePath` | `viewer/tour.js:833` *(as `A.`)* | 1 | 9 |
| `APP.civilSectionCut` | `viewer/civil_sections.js:205` *(as `A.`)* | 1 | 4 |
| `APP.clashFilm` | `viewer/clash_film.js:95` *(as `A.`)* | 1 | 121 |
| `APP.clashLabels` | `viewer/clash_labels.js:119` *(as `A.`)* | 1 | 51 |
| `APP.clashLabelsCompositeOntoCanvas` | `viewer/clash_labels.js:326` *(as `A.`)* | 1 | 8 |
| `APP.clashNarrow` | `viewer/clash_narrow.js:447` *(as `A.`)* | 1 | 50 |
| `APP.clearAllIssues` | `viewer/issues.js:261` *(as `A.`)* | 1 | 2 |
| `APP.clearCinemaPath` | `viewer/effects.js:10733` *(as `A.`)* | 1 | 1 |
| `APP.clearFocusElement` | — *phantom* | 0 | 11 |
| `APP.clearMeasures` | `viewer/measure.js:1228` *(as `A.`)* | 1 | 5 |
| `APP.clearStreamed` | `viewer/streaming.js:4261` *(as `A.`)* | 1 | 3 |
| `APP.clientId` | `erp/idempiere.html:1374` | 1 | 23 |
| `APP.clientName` | — *phantom* | 0 | 2 |
| `APP.closeFindPanel` | — *phantom* | 0 | 2 |
| `APP.closeSiteCamera` | `viewer/sitecam.js:179` *(as `A.`)* | 1 | 11 |
| `APP.closeSitePreview` | `viewer/sitecam.js:449` *(as `A.`)* | 1 | 8 |
| `APP.closeSunglass` | — *phantom* | 0 | 1 |
| `APP.collectMeshes` | `viewer/helpers.js:20` *(as `A.`)* | 1 | 132 |
| `APP.column` | — *phantom* | 0 | 1 |
| `APP.composeGhostsFromAggregates` | — *phantom* | 0 | 4 |
| `APP.computeDiff` | `viewer/diff.js:18` *(as `A.`)* | 1 | 4 |
| `APP.computePathLength` | `viewer/tour.js:2380` *(as `A.`)* | 1 | 2 |
| `APP.contributeBuilding` | — *phantom* | 0 | 2 |
| `APP.controls` | `viewer/scene.js:186` *(as `A.`)* | 2 | 636 |
| `APP.costOdometerAt` | `viewer/cpe_resource_panel.js:169` *(as `A.`)* | 1 | 2 |
| `APP.costOdometerTick` | `viewer/cpe_resource_panel.js:205` *(as `A.`)* | 1 | 3 |
| `APP.counts` | — *phantom* | 0 | 4 |
| `APP.cpeArchFadeApplyVisual` | `viewer/effects.js:7147` *(as `A.`)* | 1 | 7 |
| `APP.cpePanelPlate` | `viewer/cpe_resource_panel.js:825` *(as `A.`)* | 1 | 4 |
| `APP.cpeRevealApplyVisual` | `viewer/effects.js:7173` *(as `A.`)* | 1 | 9 |
| `APP.cpeRevealCaptionAt` | `viewer/effects.js:7082` *(as `A.`)* | 1 | 8 |
| `APP.cpeRevealDiscLabel` | `viewer/effects.js:7045` *(as `A.`)* | 1 | 14 |
| `APP.cpeRevealDiscQtyCost` | `viewer/effects.js:7058` *(as `A.`)* | 1 | 6 |
| `APP.cpeRevealDiscsPresent` | `viewer/effects.js:6909` *(as `A.`)* | 1 | 7 |
| `APP.cpeRevealInDrive` | `viewer/effects.js:6904` *(as `A.`)* | 1 | 1 |
| `APP.cpeRevealLightsOffAt` | `viewer/effects.js:7120` *(as `A.`)* | 1 | 3 |
| `APP.cpeRevealShellDiscs` | `viewer/effects.js:6905` *(as `A.`)* | 1 | 7 |
| `APP.cpeRevealVisualAt` | `viewer/effects.js:6984` *(as `A.`)* | 1 | 13 |
| `APP.createPanel` | `viewer/panels.js:222` *(as `A.`)* | 1 | 4 |
| `APP.createSnag` | `viewer/helpers.js:515` *(as `A.`)* | 1 | 3 |
| `APP.currentBuilding` | — *phantom* | 0 | 9 |
| `APP.cycleRoleFilter` | `viewer/panels.js:822` *(as `A.`)* | 1 | 3 |
| `APP.cycleWalkSpeed` | `viewer/tour.js:1237` *(as `A.`)* | 1 | 2 |
| `APP.cycleXrayBboxMode` | — *phantom* | 0 | 2 |
| `APP.dayCounterAt` | `viewer/cpe_day_counter.js:32` *(as `A.`)* | 1 | 21 |
| `APP.dayCounterBoxSize` | `viewer/cpe_day_counter.js:57` *(as `A.`)* | 1 | 6 |
| `APP.dayCounterCompositeOntoCanvas` | `viewer/cpe_day_counter.js:77` *(as `A.`)* | 1 | 13 |
| `APP.dayCounterLastBox` | `viewer/cinema_maxq.js:2039` *(as `A.`)* | 2 | 4 |
| `APP.dayCounterLiveStart` | `viewer/cpe_day_counter.js:147` *(as `A.`)* | 1 | 1 |
| `APP.dayCounterLiveStop` | `viewer/cpe_day_counter.js:171` *(as `A.`)* | 1 | 1 |
| `APP.dayCounterLiveTick` | `viewer/cpe_day_counter.js:156` *(as `A.`)* | 1 | 1 |
| `APP.db` | `viewer/city.js:712` *(as `A.`)* | 13 | 622 |
| `APP.dbQuery` | `viewer/helpers.js:116` *(as `A.`)* | 2 | 624 |
| `APP.dbQueryFirst` | `viewer/helpers.js:130` *(as `A.`)* | 1 | 11 |
| `APP.deleteImported` | `viewer/import.js:602` *(as `A.`)* | 1 | 4 |
| `APP.diffDb` | `viewer/main.js:1050` | 1 | 18 |
| `APP.diffResult` | `viewer/diff.js:47` *(as `A.`)* | 1 | 32 |
| `APP.discCounts` | `viewer/scene.js:475` *(as `A.`)* | 3 | 11 |
| `APP.dlodDemoteAll` | `viewer/dlod.js:140` *(as `A.`)* | 1 | 1 |
| `APP.dlodDisable` | `viewer/dlod.js:133` *(as `A.`)* | 1 | 13 |
| `APP.dlodEnable` | `viewer/dlod.js:99` *(as `A.`)* | 1 | 16 |
| `APP.dlodTick` | `viewer/dlod.js:145` *(as `A.`)* | 1 | 26 |
| `APP.downloadSitePhoto` | `viewer/sitecam.js:514` *(as `A.`)* | 1 | 4 |
| `APP.drawBuildingBoxes` | `viewer/streaming.js:23` *(as `A.`)* | 1 | 4 |
| `APP.earthworksPanelOpen` | `viewer/earthworks_overlay.js:183` *(as `A.`)* | 1 | 2 |
| `APP.earthworksVolume` | `viewer/cpe_road_panels.js:18` *(as `A.`)* | 1 | 5 |
| `APP.earthworksVolumeLine` | `viewer/cpe_road_panels.js:26` *(as `A.`)* | 1 | 4 |
| `APP.ensureHdriEnvMapReady` | `viewer/effects.js:10929` *(as `A.`)* | 1 | 3 |
| `APP.ensureRooms` | — *phantom* | 0 | 80 |
| `APP.erpQuery` | `viewer/hba_lens.js:349` *(as `A.`)* | 1 | 3 |
| `APP.error` | — *phantom* | 0 | 1 |
| `APP.escapeRouteApplyVisual` | `viewer/cpe_escape_route.js:1409` *(as `A.`)* | 1 | 10 |
| `APP.escapeRouteBreach` | `viewer/cpe_escape_route.js:693` *(as `A.`)* | 1 | 5 |
| `APP.escapeRouteBuild` | `viewer/cpe_escape_route.js:460` *(as `A.`)* | 1 | 5 |
| `APP.escapeRouteCaptionAt` | `viewer/cpe_escape_route.js:995` *(as `A.`)* | 1 | 3 |
| `APP.escapeRouteCommonPathLimit` | `viewer/cpe_escape_route.js:685` *(as `A.`)* | 1 | 3 |
| `APP.escapeRouteCompositeOntoCanvas` | `viewer/cpe_escape_route.js:1235` *(as `A.`)* | 1 | 3 |
| `APP.escapeRouteConstants` | `viewer/cpe_escape_route.js:705` *(as `A.`)* | 1 | 4 |
| `APP.escapeRouteCutAt` | `viewer/cpe_escape_route.js:1011` *(as `A.`)* | 1 | 3 |
| `APP.escapeRouteEaseFilmT` | `viewer/cpe_escape_route.js:762` *(as `A.`)* | 1 | 8 |
| `APP.escapeRouteEaseRate` | `viewer/cpe_escape_route.js:780` *(as `A.`)* | 1 | 16 |
| `APP.escapeRouteFmtWalk` | `viewer/cpe_escape_route.js:704` *(as `A.`)* | 1 | 7 |
| `APP.escapeRouteFor` | `viewer/cpe_escape_route.js:437` *(as `A.`)* | 1 | 2 |
| `APP.escapeRouteFrameAt` | `viewer/cpe_escape_route.js:1069` *(as `A.`)* | 1 | 3 |
| `APP.escapeRoutePlaceLabels` | `viewer/cpe_escape_route.js:1421` *(as `A.`)* | 1 | 2 |
| `APP.escapeRouteRecord` | `viewer/cpe_escape_route.js:702` *(as `A.`)* | 1 | 6 |
| `APP.escapeRouteRectsHit` | `viewer/cpe_escape_route.js:1422` *(as `A.`)* | 1 | 4 |
| `APP.escapeRouteReservedRects` | `viewer/cpe_escape_route.js:1053` *(as `A.`)* | 1 | 8 |
| `APP.escapeRouteReset` | `viewer/cpe_escape_route.js:703` *(as `A.`)* | 1 | 1 |
| `APP.escapeRouteSetRules` | `viewer/cpe_escape_route.js:661` *(as `A.`)* | 1 | 6 |
| `APP.escapeRouteStatCardAt` | `viewer/cpe_escape_route.js:844` *(as `A.`)* | 1 | 14 |
| `APP.escapeRouteStats` | `viewer/cpe_escape_route.js:1423` *(as `A.`)* | 1 | 1 |
| `APP.escapeRouteSummary` | `viewer/cpe_escape_route.js:1431` *(as `A.`)* | 1 | 3 |
| `APP.escapeRouteVisualAt` | `viewer/cpe_escape_route.js:746` *(as `A.`)* | 1 | 12 |
| `APP.escapeRouteWindow` | `viewer/cpe_escape_route.js:714` *(as `A.`)* | 1 | 13 |
| `APP.ewCutFill` | `viewer/earthworks_overlay.js:142` *(as `A.`)* | 1 | 2 |
| `APP.ewCutFillOn` | `viewer/earthworks_overlay.js:141` *(as `A.`)* | 1 | 1 |
| `APP.ewCutFillResult` | `viewer/earthworks_overlay.js:147` *(as `A.`)* | 1 | 1 |
| `APP.exitRuleModeTint` | `viewer/rule_checklist.js:649` *(as `A.`)* | 1 | 2 |
| `APP.export4D5D` | — *phantom* | 0 | 3 |
| `APP.exportIFC` | `viewer/import.js:692` *(as `A.`)* | 1 | 5 |
| `APP.exportIssuesExcel` | `viewer/excel.js:16` *(as `A.`)* | 1 | 2 |
| `APP.fault` | — *phantom* | 0 | 2 |
| `APP.faultGi` | — *phantom* | 0 | 1 |
| `APP.fieldSweepMs` | — *phantom* | 0 | 1 |
| `APP.filmBoxesArm` | `viewer/cpe_film_boxes.js:93` *(as `A.`)* | 1 | 5 |
| `APP.filmBoxesArmed` | `viewer/cpe_film_boxes.js:111` *(as `A.`)* | 1 | 1 |
| `APP.filmBoxesDisarm` | `viewer/cpe_film_boxes.js:113` *(as `A.`)* | 1 | 3 |
| `APP.filmBoxesDrawMeasure` | `viewer/cpe_film_boxes.js:327` *(as `A.`)* | 1 | 3 |
| `APP.filmBoxesDrawStatus` | `viewer/cpe_film_boxes.js:201` *(as `A.`)* | 1 | 3 |
| `APP.filmBoxesLayout` | `viewer/cpe_film_boxes.js:44` *(as `A.`)* | 1 | 6 |
| `APP.filmBoxesLayoutOf` | `viewer/cpe_film_boxes.js:110` *(as `A.`)* | 1 | 3 |
| `APP.filmBoxesMeasureLastBox` | `viewer/cpe_film_boxes.js:333` *(as `A.`)* | 3 | 4 |
| `APP.filmBoxesMeasureLingerS` | `viewer/cpe_film_boxes.js:281` *(as `A.`)* | 1 | 1 |
| `APP.filmBoxesMeasurePost` | `viewer/cpe_film_boxes.js:247` *(as `A.`)* | 1 | 11 |
| `APP.filmBoxesMeasureQueue` | `viewer/cpe_film_boxes.js:254` *(as `A.`)* | 1 | 3 |
| `APP.filmBoxesMeasureReset` | `viewer/cpe_film_boxes.js:246` *(as `A.`)* | 1 | 5 |
| `APP.filmBoxesMeasureRowCap` | `viewer/cpe_film_boxes.js:282` *(as `A.`)* | 1 | 2 |
| `APP.filmBoxesOppositeCorner` | `viewer/cpe_film_boxes.js:29` *(as `A.`)* | 1 | 3 |
| `APP.filmBoxesOverlap` | `viewer/cpe_film_boxes.js:87` *(as `A.`)* | 1 | 1 |
| `APP.filmBoxesStatusLastBox` | `viewer/cpe_film_boxes.js:209` *(as `A.`)* | 2 | 7 |
| `APP.filmBoxesStatusRowNames` | `viewer/cpe_film_boxes.js:112` *(as `A.`)* | 1 | 1 |
| `APP.filmBoxesStatusRows` | `viewer/cpe_film_boxes.js:119` *(as `A.`)* | 1 | 3 |
| `APP.filmLayer` | `viewer/cinema_maxq.js:3530` *(as `A.`)* | 1 | 12 |
| `APP.filterBatchedMesh` | `viewer/helpers.js:62` *(as `A.`)* | 1 | 4 |
| `APP.filterByGuids` | `viewer/panels.js:862` *(as `A.`)* | 1 | 12 |
| `APP.filterDisc` | `viewer/panels.js:765` *(as `A.`)* | 1 | 3 |
| `APP.filterDiscs` | `viewer/panels.js:770` *(as `A.`)* | 1 | 7 |
| `APP.filterInstancedMesh` | `viewer/helpers.js:36` *(as `A.`)* | 1 | 5 |
| `APP.filterMergedMesh` | `viewer/helpers.js:85` *(as `A.`)* | 1 | 2 |
| `APP.filterStorey` | `viewer/panels.js:730` *(as `A.`)* | 1 | 8 |
| `APP.findMeshByGuid` | `viewer/walk.js:577` *(as `A.`)* | 1 | 3 |
| `APP.findNearestDoorPosition` | `viewer/walk.js:199` *(as `A.`)* | 1 | 2 |
| `APP.flyActive` | `viewer/picking.js:71` *(as `A.`)* | 14 | 48 |
| `APP.flyAngle` | `viewer/picking.js:72` *(as `A.`)* | 4 | 8 |
| `APP.flyFromPos` | `viewer/picking.js:77` *(as `A.`)* | 2 | 3 |
| `APP.flyFromTarget` | `viewer/picking.js:78` *(as `A.`)* | 2 | 3 |
| `APP.flyTargetIdx` | `viewer/picking.js:74` *(as `A.`)* | 3 | 6 |
| `APP.flyTargets` | `viewer/picking.js:73` *(as `A.`)* | 2 | 17 |
| `APP.flyTick` | `viewer/tour.js:403` *(as `A.`)* | 1 | 2 |
| `APP.flyTo` | `viewer/city.js:611` *(as `A.`)* | 2 | 7 |
| `APP.flyTransitionStart` | `viewer/picking.js:76` *(as `A.`)* | 2 | 3 |
| `APP.flyTransitioning` | `viewer/picking.js:75` *(as `A.`)* | 4 | 5 |
| `APP.flyoutBeatsBuild` | `viewer/cpe_flyout_beats.js:59` *(as `A.`)* | 1 | 5 |
| `APP.flyoutBeatsCompositeOntoCanvas` | `viewer/cpe_flyout_beats.js:230` *(as `A.`)* | 1 | 4 |
| `APP.flyoutBeatsDispose` | `viewer/cpe_flyout_beats.js:251` *(as `A.`)* | 1 | 5 |
| `APP.flyoutBeatsReport` | `viewer/cpe_flyout_beats.js:249` *(as `A.`)* | 1 | 1 |
| `APP.flyoutBeatsWindows` | `viewer/cpe_flyout_beats.js:250` *(as `A.`)* | 1 | 1 |
| `APP.flythruBestPerClass` | `viewer/cpe_flythru_dims.js:84` *(as `A.`)* | 1 | 1 |
| `APP.flythruBoxCorners` | `viewer/cpe_flythru_dims.js:529` *(as `A.`)* | 1 | 1 |
| `APP.flythruBoxPerimeter` | `viewer/cpe_flythru_dims.js:547` *(as `A.`)* | 1 | 1 |
| `APP.flythruCouldRead` | `viewer/cpe_flythru_dims.js:569` *(as `A.`)* | 1 | 1 |
| `APP.flythruCueCaptionAt` | `viewer/cpe_flythru_cues.js:329` *(as `A.`)* | 1 | 7 |
| `APP.flythruCueInk` | `viewer/cpe_flythru_dims.js:723` *(as `A.`)* | 1 | 1 |
| `APP.flythruCuesApplyVisual` | `viewer/cpe_flythru_cues.js:364` *(as `A.`)* | 1 | 10 |
| `APP.flythruCuesBuild` | `viewer/cpe_flythru_cues.js:166` *(as `A.`)* | 1 | 17 |
| `APP.flythruCuesCompositeOntoCanvas` | `viewer/cpe_flythru_cues.js:504` *(as `A.`)* | 1 | 9 |
| `APP.flythruCuesDispose` | `viewer/cpe_flythru_cues.js:572` *(as `A.`)* | 1 | 5 |
| `APP.flythruCuesWindows` | `viewer/cpe_flythru_cues.js:495` *(as `A.`)* | 1 | 13 |
| `APP.flythruDatumAt` | `viewer/cpe_flythru_datum.js:417` *(as `A.`)* | 1 | 6 |
| `APP.flythruDatumBuild` | `viewer/cpe_flythru_datum.js:209` *(as `A.`)* | 1 | 16 |
| `APP.flythruDatumCompositeOntoCanvas` | `viewer/cpe_flythru_datum.js:515` *(as `A.`)* | 1 | 11 |
| `APP.flythruDatumDispose` | `viewer/cpe_flythru_datum.js:917` *(as `A.`)* | 1 | 6 |
| `APP.flythruDatumFigures` | `viewer/cpe_flythru_datum.js:903` *(as `A.`)* | 1 | 5 |
| `APP.flythruDatumSetLife2` | `viewer/cpe_flythru_datum.js:73` *(as `A.`)* | 1 | 5 |
| `APP.flythruDedupe` | `viewer/cpe_flythru_dims.js:490` *(as `A.`)* | 1 | 3 |
| `APP.flythruDepthSpan` | `viewer/cpe_flythru_dims.js:210` *(as `A.`)* | 1 | 1 |
| `APP.flythruDrawDim` | `viewer/cpe_flythru_cues.js:492` *(as `A.`)* | 1 | 8 |
| `APP.flythruDrawPanel` | `viewer/cpe_flythru_cues.js:492` *(as `A.`)* | 1 | 4 |
| `APP.flythruDrawStateAt` | `viewer/cpe_flythru_dims.js:905` *(as `A.`)* | 1 | 1 |
| `APP.flythruEaseScore` | `viewer/cpe_flythru_dims.js:165` *(as `A.`)* | 1 | 4 |
| `APP.flythruFrameMap` | `viewer/cpe_flythru_dims.js:291` *(as `A.`)* | 1 | 4 |
| `APP.flythruGapsAlong` | `viewer/cpe_flythru_dims.js:695` *(as `A.`)* | 1 | 7 |
| `APP.flythruGate` | `viewer/cpe_flythru_dims.js:594` *(as `A.`)* | 1 | 10 |
| `APP.flythruGateCheap` | `viewer/cpe_flythru_dims.js:579` *(as `A.`)* | 1 | 1 |
| `APP.flythruHoldWindow` | `viewer/cpe_flythru_dims.js:832` *(as `A.`)* | 1 | 3 |
| `APP.flythruIsOutdoors` | `viewer/cpe_flythru_dims.js:809` *(as `A.`)* | 1 | 1 |
| `APP.flythruIsStatementCue` | `viewer/cpe_flythru_dims.js:884` *(as `A.`)* | 1 | 1 |
| `APP.flythruLabelPlace` | `viewer/cpe_flythru_dims.js:747` *(as `A.`)* | 1 | 1 |
| `APP.flythruLuminance` | `viewer/cpe_flythru_dims.js:799` *(as `A.`)* | 1 | 1 |
| `APP.flythruMaxDist` | `viewer/cpe_flythru_dims.js:438` *(as `A.`)* | 1 | 3 |
| `APP.flythruPathWindows` | `viewer/cpe_flythru_dims.js:407` *(as `A.`)* | 1 | 8 |
| `APP.flythruPerimeterLoop` | `viewer/cpe_flythru_dims.js:454` *(as `A.`)* | 1 | 1 |
| `APP.flythruPreCue` | `viewer/cpe_flythru_dims.js:345` *(as `A.`)* | 1 | 1 |
| `APP.flythruProj` | `viewer/cpe_flythru_cues.js:492` *(as `A.`)* | 1 | 9 |
| `APP.flythruReentryFrac` | `viewer/cpe_flythru_dims.js:875` *(as `A.`)* | 1 | 1 |
| `APP.flythruScaleState` | `viewer/cpe_flythru_dims.js:61` *(as `A.`)* | 1 | 1 |
| `APP.flythruSceneToDb` | `viewer/cpe_flythru_dims.js:319` *(as `A.`)* | 1 | 1 |
| `APP.flythruSchedule` | `viewer/cpe_flythru_dims.js:115` *(as `A.`)* | 1 | 4 |
| `APP.flythruSemantics` | `viewer/cpe_flythru_dims.js:248` *(as `A.`)* | 1 | 3 |
| `APP.flythruSetScale` | `viewer/cpe_flythru_dims.js:48` *(as `A.`)* | 1 | 4 |
| `APP.flythruShouldShow` | `viewer/cpe_flythru_dims.js:877` *(as `A.`)* | 1 | 1 |
| `APP.focusElement` | — *phantom* | 0 | 28 |
| `APP.freezePerfBuild` | — *phantom* | 0 | 2 |
| `APP.freezePerfCompositeOntoCanvas` | — *phantom* | 0 | 2 |
| `APP.friendlyName` | — *phantom* | 0 | 13 |
| `APP.gateRecordFor` | `erp/idempiere.html:1384` | 1 | 1 |
| `APP.gazeAcquireCap` | `viewer/effects.js:7746` *(as `A.`)* | 1 | 6 |
| `APP.gazeAcquireStep` | `viewer/effects.js:7747` *(as `A.`)* | 1 | 3 |
| `APP.generateQR` | `viewer/helpers.js:391` *(as `A.`)* | 1 | 4 |
| `APP.getDiffDetail` | `viewer/diff.js:168` *(as `A.`)* | 1 | 1 |
| `APP.getRoomGraph` | `witness/witness_escape_colours.js:35` *(as `A.`)* | 2 | 37 |
| `APP.getRouteTemplate` | — *phantom* | 0 | 2 |
| `APP.ghostGroundArm` | `viewer/cinema_maxq.js:5266` | 1 | 9 |
| `APP.ghostGroundAt` | `viewer/cinema_maxq.js:5267` | 1 | 10 |
| `APP.ghostGroundDebugState` | `viewer/cinema_maxq.js:5273` | 1 | 3 |
| `APP.ghostGroundRestore` | `viewer/cinema_maxq.js:5268` | 1 | 8 |
| `APP.giBlown` | — *phantom* | 0 | 2 |
| `APP.glassMs` | — *phantom* | 0 | 1 |
| `APP.glassReflDark` | — *phantom* | 0 | 1 |
| `APP.ground` | `viewer/scene.js:463` *(as `A.`)* | 1 | 138 |
| `APP.groundIfcZ` | — *phantom* | 0 | 11 |
| `APP.guidForHit` | `viewer/hover_name.js:72` *(as `A.`)* | 1 | 4 |
| `APP.guidMap` | `viewer/city.js:822` *(as `A.`)* | 4 | 324 |
| `APP.handleMeasureClick` | `viewer/measure.js:1267` *(as `A.`)* | 1 | 2 |
| `APP.handleMeasureDblClick` | `viewer/measure.js:1532` *(as `A.`)* | 1 | 4 |
| `APP.handleMeasureRightClick` | `viewer/measure.js:1555` *(as `A.`)* | 1 | 3 |
| `APP.handleWallXray` | `viewer/walk.js:474` *(as `A.`)* | 1 | 2 |
| `APP.hemi` | `viewer/scene.js:222` *(as `A.`)* | 1 | 78 |
| `APP.hiddenDiscs` | `viewer/panels.js:751` *(as `A.`)* | 1 | 56 |
| `APP.hideEarthworksPanel` | `viewer/earthworks_overlay.js:182` *(as `A.`)* | 1 | 2 |
| `APP.hideRoadReport` | `viewer/road_report.js:152` *(as `A.`)* | 1 | 2 |
| `APP.hideRoadStandards` | `viewer/road_standards.js:126` *(as `A.`)* | 1 | 3 |
| `APP.hideRoadworksPanel` | `viewer/earthworks_overlay.js:190` *(as `A.`)* | 1 | 2 |
| `APP.hoverGuidAt` | `viewer/hover_name.js:124` *(as `A.`)* | 1 | 3 |
| `APP.hoverHighlight` | `viewer/tools.js:2991` *(as `A.`)* | 3 | 8 |
| `APP.icon` | `viewer/panels.js:195` *(as `A.`)* | 1 | 15 |
| `APP.ifc2three` | `viewer/scene.js:521` *(as `A.`)* | 4 | 339 |
| `APP.ifc2threeDir` | `viewer/scene.js:534` *(as `A.`)* | 1 | 8 |
| `APP.importIFC` | `viewer/import.js:151` *(as `A.`)* | 1 | 3 |
| `APP.importMesh` | `viewer/import.js:450` *(as `A.`)* | 1 | 3 |
| `APP.importMultiIFC` | `viewer/import.js:275` *(as `A.`)* | 1 | 11 |
| `APP.indoorBeatsAt` | `viewer/cpe_indoor_beats.js:249` *(as `A.`)* | 1 | 5 |
| `APP.indoorBeatsBuild` | `viewer/cpe_indoor_beats.js:33` *(as `A.`)* | 1 | 7 |
| `APP.indoorBeatsCompositeOntoCanvas` | `viewer/cpe_indoor_beats.js:264` *(as `A.`)* | 1 | 4 |
| `APP.indoorBeatsDispose` | `viewer/cpe_indoor_beats.js:319` *(as `A.`)* | 1 | 5 |
| `APP.indoorBeatsReport` | `viewer/cpe_indoor_beats.js:318` *(as `A.`)* | 1 | 5 |
| `APP.init` | `viewer/streaming.js:3609` *(as `A.`)* | 1 | 2 |
| `APP.initCity` | `viewer/city.js:314` *(as `A.`)* | 1 | 3 |
| `APP.inputWasVoice` | `viewer/nlp.js:599` *(as `A.`)* | 6 | 7 |
| `APP.integrity` | — *phantom* | 0 | 2 |
| `APP.interpolateWalkPath` | `viewer/tour.js:2391` *(as `A.`)* | 1 | 1 |
| `APP.isCivilModel` | `viewer/streaming.js:323` *(as `A.`)* | 1 | 82 |
| `APP.isolateRoom` | `viewer/panels.js:903` *(as `A.`)* | 1 | 2 |
| `APP.kernelOps` | — *phantom* | 0 | 4 |
| `APP.ledgerTickerApplyVisual` | `viewer/cpe_ledger_ticker.js:202` *(as `A.`)* | 1 | 3 |
| `APP.ledgerTickerBuild` | `viewer/cpe_ledger_ticker.js:57` *(as `A.`)* | 1 | 3 |
| `APP.ledgerTickerCompositeOntoCanvas` | `viewer/cpe_ledger_ticker.js:241` *(as `A.`)* | 1 | 5 |
| `APP.ledgerTickerDispose` | `viewer/cpe_ledger_ticker.js:285` *(as `A.`)* | 1 | 5 |
| `APP.ledgerTickerRowText` | `viewer/cpe_ledger_ticker.js:263` *(as `A.`)* | 1 | 4 |
| `APP.libDb` | `viewer/city.js:713` *(as `A.`)* | 12 | 66 |
| `APP.lightTheme` | — *phantom* | 0 | 3 |
| `APP.linearBeatBuild` | `viewer/cpe_linear_beat.js:47` *(as `A.`)* | 1 | 8 |
| `APP.linearBeatCompositeOntoCanvas` | `viewer/cpe_linear_beat.js:171` *(as `A.`)* | 1 | 4 |
| `APP.linearBeatDispose` | `viewer/cpe_linear_beat.js:191` *(as `A.`)* | 1 | 5 |
| `APP.linearBeatReport` | `viewer/cpe_linear_beat.js:190` *(as `A.`)* | 1 | 5 |
| `APP.listRooms` | `viewer/panels.js:891` *(as `A.`)* | 1 | 2 |
| `APP.loadCityManual` | `viewer/city.js:306` *(as `A.`)* | 1 | 1 |
| `APP.loadFromHash` | `viewer/streaming.js:4252` *(as `A.`)* | 1 | 2 |
| `APP.loadNavigate` | `viewer/main.js:155` | 1 | 127 |
| `APP.loadPathApplyVisual` | `viewer/cpe_load_path.js:3188` *(as `A.`)* | 1 | 7 |
| `APP.loadPathBackdropApply` | `viewer/cpe_load_path.js:3058` *(as `A.`)* | 1 | 1 |
| `APP.loadPathBackdropRestore` | `viewer/cpe_load_path.js:3059` *(as `A.`)* | 1 | 1 |
| `APP.loadPathBuild` | `viewer/cpe_load_path.js:2385` *(as `A.`)* | 1 | 3 |
| `APP.loadPathCardOn` | `viewer/cpe_load_path.js:4610` *(as `A.`)* | 1 | 3 |
| `APP.loadPathCompositeOntoCanvas` | `viewer/cpe_load_path.js:4612` *(as `A.`)* | 1 | 5 |
| `APP.loadPathDispose` | `viewer/cpe_load_path.js:4674` *(as `A.`)* | 1 | 5 |
| `APP.loadRuleSet` | `viewer/rule_checklist.js:789` *(as `A.`)* | 1 | 3 |
| `APP.loadWizard` | `viewer/main.js:293` | 1 | 2 |
| `APP.markDirty` | `viewer/effects.js:5569` *(as `A.`)* | 4 | 361 |
| `APP.materializeZones` | — *phantom* | 0 | 2 |
| `APP.maxqStatusDayRoomSegs` | `viewer/cinema_maxq.js:5279` | 1 | 13 |
| `APP.measureActive` | `viewer/main.js:1130` | 4 | 27 |
| `APP.measureFirstMarker` | `viewer/measure.js:1239` *(as `A.`)* | 5 | 9 |
| `APP.measureFirstPoint` | `viewer/measure.js:1238` *(as `A.`)* | 5 | 8 |
| `APP.measureGroup` | `viewer/picking.js:66` *(as `A.`)* | 1 | 23 |
| `APP.measureLabels` | `viewer/measure.js:1237` *(as `A.`)* | 3 | 24 |
| `APP.mepSmoothNormals` | `viewer/streaming.js:84` *(as `A.`)* | 1 | 9 |
| `APP.meshCache` | `viewer/scene.js:476` *(as `A.`)* | 2 | 34 |
| `APP.meshSolidVolume` | `viewer/cpe_road_panels.js:16` *(as `A.`)* | 1 | 4 |
| `APP.minAreaRect` | — *phantom* | 0 | 3 |
| `APP.modelOffset` | `viewer/scene.js:480` *(as `A.`)* | 1 | 81 |
| `APP.mouse` | `viewer/scene.js:518` *(as `A.`)* | 1 | 13 |
| `APP.navActive` | `viewer/navigate.js:31` *(as `A.`)* | 1 | 7 |
| `APP.navCurrentStep` | `viewer/navigate.js:32` *(as `A.`)* | 1 | 5 |
| `APP.navJumpToEnd` | — *phantom* | 0 | 3 |
| `APP.nightFixtureColor` | — *phantom* | 0 | 5 |
| `APP.nightFixtureShape` | — *phantom* | 0 | 2 |
| `APP.nightLightColor` | — *phantom* | 0 | 3 |
| `APP.openCacheDB` | `viewer/scene.js:613` *(as `A.`)* | 1 | 27 |
| `APP.openFindPanel` | `viewer/main.js:290` | 1 | 59 |
| `APP.openImported` | `viewer/import.js:544` *(as `A.`)* | 1 | 13 |
| `APP.openModelDb` | `viewer/scene.js:1569` *(as `A.`)* | 1 | 12 |
| `APP.openShareSheet` | `viewer/import.js:613` *(as `A.`)* | 2 | 5 |
| `APP.openSiteCamera` | `viewer/sitecam.js:73` *(as `A.`)* | 1 | 7 |
| `APP.orgId` | `erp/idempiere.html:1375` | 1 | 10 |
| `APP.pageErrors` | — *phantom* | 0 | 1 |
| `APP.paramsToParas` | — *phantom* | 0 | 1 |
| `APP.parasToParams` | — *phantom* | 0 | 1 |
| `APP.pathOverviewCompositeOntoCanvas` | `viewer/cpe_path_overview.js:170` *(as `A.`)* | 1 | 8 |
| `APP.pathOverviewLastBox` | `viewer/cinema_maxq.js:2039` *(as `A.`)* | 2 | 4 |
| `APP.pathOverviewPrepare` | `viewer/cpe_path_overview.js:76` *(as `A.`)* | 1 | 13 |
| `APP.pathOverviewToBox` | `viewer/cpe_path_overview.js:148` *(as `A.`)* | 1 | 9 |
| `APP.pauseStillRefineForGI` | `viewer/effects.js:6371` *(as `A.`)* | 1 | 5 |
| `APP.pinstanceList` | — *phantom* | 0 | 1 |
| `APP.placeLabelFor` | `viewer/cpe_sun_compass.js:617` *(as `A.`)* | 1 | 3 |
| `APP.placeTableLoad` | `viewer/cpe_sun_compass.js:594` *(as `A.`)* | 1 | 3 |
| `APP.pointerDownPos` | `viewer/scene.js:486` *(as `A.`)* | 1 | 7 |
| `APP.populateActive` | `viewer/effects.js:2113` *(as `A.`)* | 1 | 3 |
| `APP.populateBuildingList` | `viewer/panels.js:918` *(as `A.`)* | 1 | 7 |
| `APP.populateDiscs` | `viewer/panels.js:753` *(as `A.`)* | 1 | 7 |
| `APP.populateStoreys` | `viewer/panels.js:727` *(as `A.`)* | 1 | 7 |
| `APP.poses` | — *phantom* | 0 | 4 |
| `APP.printQRSheet` | `viewer/helpers.js:442` *(as `A.`)* | 1 | 3 |
| `APP.probeGradeHdr` | — *phantom* | 0 | 2 |
| `APP.queryWalkPath` | `viewer/tour.js:2070` *(as `A.`)* | 1 | 1 |
| `APP.quickShare` | `viewer/share.js:636` *(as `A.`)* | 1 | 7 |
| `APP.raycaster` | `viewer/scene.js:517` *(as `A.`)* | 1 | 18 |
| `APP.realAt` | `viewer/chainage_grid.js:209` *(as `A.`)* | 1 | 1 |
| `APP.refreshSectionModes` | — *phantom* | 0 | 4 |
| `APP.renderImportCards` | `viewer/import.js:626` *(as `A.`)* | 1 | 10 |
| `APP.renderer` | `viewer/scene.js:139` *(as `A.`)* | 1 | 602 |
| `APP.reportBug` | `viewer/helpers.js:204` *(as `A.`)* | 1 | 6 |
| `APP.reportError` | `viewer/error_reporter.js:112` *(as `A.`)* | 2 | 10 |
| `APP.resetCinemaGhostLens` | — *phantom* | 0 | 6 |
| `APP.resident` | — *phantom* | 0 | 4 |
| `APP.resourcePanelAt` | `viewer/cpe_resource_panel.js:50` *(as `A.`)* | 1 | 8 |
| `APP.resourcePanelCompositeOntoCanvas` | — *phantom* | 0 | 3 |
| `APP.resourcePanelFrozenAt` | `viewer/cpe_resource_panel.js:434` *(as `A.`)* | 1 | 3 |
| `APP.resourcePanelHoldAt` | `viewer/cpe_resource_panel.js:378` *(as `A.`)* | 1 | 3 |
| `APP.resourcePanelLastBox` | `viewer/cinema_maxq.js:2124` *(as `A.`)* | 1 | 5 |
| `APP.resourcePanelLightDir` | `viewer/cpe_resource_panel.js:451` *(as `A.`)* | 1 | 2 |
| `APP.restoreWallXray` | `viewer/walk.js:581` *(as `A.`)* | 1 | 3 |
| `APP.roadPanelsBuild` | `viewer/cpe_road_panels.js:82` *(as `A.`)* | 1 | 4 |
| `APP.roadPanelsCardOf` | `viewer/cpe_road_panels.js:282` *(as `A.`)* | 1 | 9 |
| `APP.roadPanelsCompositeOntoCanvas` | `viewer/cpe_road_panels.js:252` *(as `A.`)* | 1 | 7 |
| `APP.roadPanelsDispose` | `viewer/cpe_road_panels.js:295` *(as `A.`)* | 1 | 5 |
| `APP.roadPanelsLastBox` | `viewer/cpe_road_panels.js:250` *(as `A.`)* | 4 | 6 |
| `APP.roadPanelsSlots` | `viewer/cpe_road_panels.js:281` *(as `A.`)* | 1 | 1 |
| `APP.roadReportOpen` | `viewer/road_report.js:151` *(as `A.`)* | 1 | 2 |
| `APP.roadStandardsOpen` | `viewer/road_standards.js:125` *(as `A.`)* | 1 | 2 |
| `APP.roadworksPanelOpen` | `viewer/earthworks_overlay.js:191` *(as `A.`)* | 1 | 2 |
| `APP.roleId` | `erp/idempiere.html:1376` | 1 | 5 |
| `APP.roleOrgWhere` | `erp/idempiere.html:2209` | 1 | 1 |
| `APP.roomTitleApplyHold` | `viewer/cpe_room_title.js:799` *(as `A.`)* | 1 | 10 |
| `APP.roomTitleApplyLead` | `viewer/cpe_room_title.js:747` *(as `A.`)* | 1 | 12 |
| `APP.roomTitleBandSize` | `viewer/cpe_room_title.js:859` *(as `A.`)* | 1 | 1 |
| `APP.roomTitleBuildTimeline` | `viewer/cpe_room_title.js:470` *(as `A.`)* | 1 | 20 |
| `APP.roomTitleCompositeOntoCanvas` | `viewer/cpe_room_title.js:868` *(as `A.`)* | 1 | 16 |
| `APP.roomTitleContainProbe` | `viewer/cpe_room_title.js:249` *(as `A.`)* | 1 | 3 |
| `APP.roomTitleFinalText` | `viewer/cpe_room_title.js:842` *(as `A.`)* | 1 | 4 |
| `APP.roomTitleGazeProbe` | `viewer/cpe_room_title.js:254` *(as `A.`)* | 1 | 13 |
| `APP.roomTitleGazeSingleProbe` | `viewer/cpe_room_title.js:265` *(as `A.`)* | 1 | 4 |
| `APP.roomTitleLiveStart` | `viewer/cpe_room_title.js:929` *(as `A.`)* | 4 | 5 |
| `APP.roomTitleLiveStop` | `viewer/cpe_room_title.js:957` *(as `A.`)* | 1 | 1 |
| `APP.roomTitleLiveTick` | `viewer/cpe_room_title.js:939` *(as `A.`)* | 1 | 1 |
| `APP.roomTitleOpacityAt` | `viewer/cpe_room_title.js:817` *(as `A.`)* | 1 | 10 |
| `APP.roomTitleSightProbe` | `viewer/cpe_room_title.js:355` *(as `A.`)* | 1 | 3 |
| `APP.routeSOf` | `viewer/chainage_grid.js:215` *(as `A.`)* | 1 | 1 |
| `APP.rowBytes` | — *phantom* | 0 | 4 |
| `APP.rowFileDelta` | — *phantom* | 0 | 3 |
| `APP.rowRaw` | — *phantom* | 0 | 1 |
| `APP.rows` | — *phantom* | 0 | 5 |
| `APP.ruleFindingsFilm` | `viewer/rule_findings_film.js:715` *(as `A.`)* | 1 | 9 |
| `APP.ruleFindingsFilmBuild` | `viewer/rule_findings_film.js:280` *(as `A.`)* | 1 | 4 |
| `APP.ruleFindingsFilmCompositeOntoCanvas` | `viewer/rule_findings_film.js:440` *(as `A.`)* | 1 | 3 |
| `APP.ruleFindingsFilmDispose` | `viewer/rule_findings_film.js:718` *(as `A.`)* | 1 | 1 |
| `APP.ruleFindingsFilmReport` | `viewer/rule_findings_film.js:717` *(as `A.`)* | 1 | 1 |
| `APP.ruleTintShowOnly` | `viewer/rule_checklist.js:618` *(as `A.`)* | 1 | 3 |
| `APP.runPanelAction` | — *phantom* | 0 | 2 |
| `APP.saveLines` | — *phantom* | 0 | 1 |
| `APP.saveModelDb` | `viewer/scene.js:970` *(as `A.`)* | 1 | 8 |
| `APP.saveMs` | — *phantom* | 0 | 1 |
| `APP.saveWallMs` | — *phantom* | 0 | 1 |
| `APP.savedBytes` | — *phantom* | 0 | 2 |
| `APP.savedStreams` | `viewer/streaming.js:17` *(as `A.`)* | 1 | 8 |
| `APP.scene` | `viewer/scene.js:159` *(as `A.`)* | 1 | 845 |
| `APP.sceneScopeBuilding` | `viewer/streaming.js:309` *(as `A.`)* | 1 | 3 |
| `APP.screenshot` | — *phantom* | 0 | 3 |
| `APP.sectionAxis` | `viewer/section_cut.js:834` | 2 | 4 |
| `APP.sectionModes` | — *phantom* | 0 | 5 |
| `APP.sectionOn` | `viewer/civil_sections.js:165` *(as `A.`)* | 6 | 14 |
| `APP.sectionPlane` | `tests/specs/27-save-section-print.spec.js:102` | 2 | 15 |
| `APP.setMarkupColor` | `viewer/sitecam.js:344` *(as `A.`)* | 1 | 2 |
| `APP.setMarkupTool` | `viewer/sitecam.js:336` *(as `A.`)* | 1 | 2 |
| `APP.setOutline` | `viewer/effects.js:56` *(as `A.`)* | 2 | 14 |
| `APP.setSectionAxis` | — *phantom* | 0 | 1 |
| `APP.setWalkAnchor` | `viewer/walk.js:37` *(as `A.`)* | 1 | 2 |
| `APP.shareProject` | `viewer/scene.js:3390` *(as `A.`)* | 1 | 1 |
| `APP.shareSitePhoto` | `viewer/sitecam.js:456` *(as `A.`)* | 1 | 4 |
| `APP.shareUrl` | `viewer/share.js:294` *(as `A.`)* | 1 | 5 |
| `APP.shellPassMs` | — *phantom* | 0 | 1 |
| `APP.showAdvanced` | `erp/idempiere.html:1377` | 2 | 4 |
| `APP.showCommandPalette` | `viewer/scene.js:2997` *(as `A.`)* | 1 | 1 |
| `APP.showDiffSummary` | `viewer/diff.js:293` *(as `A.`)* | 1 | 2 |
| `APP.showEarthworksPanel` | `viewer/earthworks_overlay.js:170` *(as `A.`)* | 1 | 2 |
| `APP.showEgressSanity` | `viewer/rule_checklist.js:830` *(as `A.`)* | 1 | 2 |
| `APP.showQRShare` | `viewer/helpers.js:420` *(as `A.`)* | 1 | 5 |
| `APP.showRoadReport` | `viewer/road_report.js:154` *(as `A.`)* | 1 | 2 |
| `APP.showRoadStandards` | `viewer/road_standards.js:131` *(as `A.`)* | 1 | 8 |
| `APP.showRoadworksPanel` | `viewer/earthworks_overlay.js:185` *(as `A.`)* | 1 | 2 |
| `APP.showRuleChecklist` | `viewer/rule_checklist.js:496` *(as `A.`)* | 1 | 3 |
| `APP.showRuleModeTint` | `viewer/rule_checklist.js:518` *(as `A.`)* | 1 | 5 |
| `APP.showStructuralSanity` | `viewer/rule_checklist.js:791` *(as `A.`)* | 1 | 2 |
| `APP.sky` | — *phantom* | 0 | 10 |
| `APP.slabBeatAt` | `viewer/cpe_slab_beat.js:486` *(as `A.`)* | 1 | 4 |
| `APP.slabBeatBuild` | `viewer/cpe_slab_beat.js:267` *(as `A.`)* | 1 | 9 |
| `APP.slabBeatClock` | `viewer/cpe_slab_beat.js:543` *(as `A.`)* | 1 | 5 |
| `APP.slabBeatCompositeOntoCanvas` | `viewer/cpe_slab_beat.js:517` *(as `A.`)* | 1 | 4 |
| `APP.slabBeatDispose` | `viewer/cpe_slab_beat.js:544` *(as `A.`)* | 1 | 5 |
| `APP.slabBeatLabelStaleCheck` | `viewer/cpe_slab_beat.js:533` *(as `A.`)* | 1 | 3 |
| `APP.slabBeatReport` | `viewer/cpe_slab_beat.js:542` *(as `A.`)* | 1 | 9 |
| `APP.snapSitePhoto` | `viewer/sitecam.js:204` *(as `A.`)* | 1 | 2 |
| `APP.softStopStillRefine` | `viewer/effects.js:6391` *(as `A.`)* | 1 | 5 |
| `APP.sourcedStage` | — *phantom* | 0 | 2 |
| `APP.speedZones` | `viewer/speed_zones.js:644` *(as `A.`)* | 1 | 10 |
| `APP.srcBytes` | — *phantom* | 0 | 2 |
| `APP.stageCinemaPath` | `viewer/effects.js:10721` *(as `A.`)* | 1 | 2 |
| `APP.stagingTotal` | — *phantom* | 0 | 2 |
| `APP.startCinemaOrbit` | `viewer/effects.js:10930` *(as `A.`)* | 1 | 8 |
| `APP.startDriveThru` | `viewer/walk.js:396` *(as `A.`)* | 1 | 7 |
| `APP.startFlyTour` | — *phantom* | 0 | 2 |
| `APP.startMaxQ` | — *phantom* | 0 | 2 |
| `APP.startMaxQualityOrbit` | `viewer/cinema_maxq.js:5254` | 1 | 83 |
| `APP.startNavigation` | — *phantom* | 0 | 3 |
| `APP.startOfflineDownload` | `viewer/scene.js:3391` *(as `A.`)* | 1 | 1 |
| `APP.startStepDetection` | `viewer/walk.js:354` *(as `A.`)* | 1 | 1 |
| `APP.startStillRefine` | `viewer/effects.js:6054` *(as `A.`)* | 1 | 57 |
| `APP.startStillSSGIPhase` | `viewer/effects_gi_poc.js:542` *(as `A.`)* | 1 | 3 |
| `APP.startStreaming` | `viewer/streaming.js:333` *(as `A.`)* | 1 | 2 |
| `APP.startWalkGpsTracking` | `viewer/walk.js:260` *(as `A.`)* | 1 | 2 |
| `APP.status` | `viewer/scene.js:484` *(as `A.`)* | 1 | 288 |
| `APP.std` | — *phantom* | 0 | 1 |
| `APP.stillExit` | `viewer/effects.js:6485` *(as `A.`)* | 1 | 3 |
| `APP.stopCinemaOrbit` | `viewer/effects.js:11147` *(as `A.`)* | 1 | 1 |
| `APP.stopDriveThru` | `viewer/walk.js:447` *(as `A.`)* | 1 | 2 |
| `APP.stopStepDetection` | `viewer/walk.js:383` *(as `A.`)* | 1 | 2 |
| `APP.stopStillRefine` | `viewer/effects.js:6278` *(as `A.`)* | 1 | 29 |
| `APP.stopStillSSGIPhase` | `viewer/effects_gi_poc.js:563` *(as `A.`)* | 1 | 3 |
| `APP.stopWalkMode` | `viewer/walk.js:315` *(as `A.`)* | 1 | 2 |
| `APP.storeyMeshGroups` | `viewer/panels.js:715` *(as `A.`)* | 1 | 1 |
| `APP.storeyRevealApplyCut` | `viewer/cpe_storey_reveal.js:2334` *(as `A.`)* | 1 | 7 |
| `APP.storeyRevealApplyVisual` | `viewer/cpe_storey_reveal.js:2424` *(as `A.`)* | 1 | 7 |
| `APP.storeyRevealCaptionAt` | `viewer/cpe_storey_reveal.js:694` *(as `A.`)* | 1 | 7 |
| `APP.storeyRevealCutAt` | `viewer/cpe_storey_reveal.js:1256` *(as `A.`)* | 1 | 2 |
| `APP.storeyRevealList` | `viewer/cpe_storey_reveal.js:304` *(as `A.`)* | 1 | 7 |
| `APP.storeyRevealMode` | `viewer/cpe_storey_reveal.js:2423` *(as `A.`)* | 1 | 1 |
| `APP.storeyRevealStatCardAt` | `viewer/cpe_storey_reveal.js:715` *(as `A.`)* | 1 | 5 |
| `APP.storeyRevealStatsFor` | `viewer/cpe_storey_reveal.js:440` *(as `A.`)* | 1 | 5 |
| `APP.storeyRevealTintFor` | `viewer/cpe_storey_reveal.js:2421` *(as `A.`)* | 1 | 1 |
| `APP.storeyRevealTintRestore` | `viewer/cpe_storey_reveal.js:2422` *(as `A.`)* | 1 | 1 |
| `APP.storeyRevealTintTouched` | `viewer/cpe_storey_reveal.js:899` *(as `A.`)* | 1 | 1 |
| `APP.storeyRevealVisualAt` | `viewer/cpe_storey_reveal.js:633` *(as `A.`)* | 1 | 7 |
| `APP.streamBuilding` | `viewer/streaming.js:347` *(as `A.`)* | 1 | 48 |
| `APP.streamIdx` | `viewer/city.js:786` *(as `A.`)* | 10 | 58 |
| `APP.streamQueue` | `viewer/city.js:777` *(as `A.`)* | 12 | 89 |
| `APP.streamTick` | `viewer/streaming.js:2325` *(as `A.`)* | 1 | 2 |
| `APP.streamedCount` | `viewer/city.js:820` *(as `A.`)* | 5 | 44 |
| `APP.streaming` | `viewer/city.js:787` *(as `A.`)* | 15 | 185 |
| `APP.sun` | `viewer/scene.js:218` *(as `A.`)* | 1 | 309 |
| `APP.sunClockBoxSize` | `viewer/cpe_sun_compass.js:735` *(as `A.`)* | 1 | 2 |
| `APP.sunClockCompositeOntoCanvas` | `viewer/cpe_sun_compass.js:741` *(as `A.`)* | 1 | 5 |
| `APP.sunClockLastBox` | `viewer/cinema_maxq.js:2039` *(as `A.`)* | 4 | 6 |
| `APP.sunCompassAt` | `viewer/cpe_sun_compass.js:404` *(as `A.`)* | 1 | 5 |
| `APP.sunCompassBuild` | `viewer/cpe_sun_compass.js:213` *(as `A.`)* | 1 | 5 |
| `APP.sunCompassCompositeOntoCanvas` | `viewer/cpe_sun_compass.js:644` *(as `A.`)* | 1 | 5 |
| `APP.sunCompassDarkReport` | `viewer/cpe_sun_compass.js:828` *(as `A.`)* | 1 | 3 |
| `APP.sunCompassDispose` | `viewer/cpe_sun_compass.js:850` *(as `A.`)* | 1 | 1 |
| `APP.sunCompassInfo` | `viewer/cpe_sun_compass.js:821` *(as `A.`)* | 1 | 14 |
| `APP.sunCompassLabels` | `viewer/cpe_sun_compass.js:546` *(as `A.`)* | 1 | 2 |
| `APP.sunCompassSetDate` | `viewer/cpe_sun_compass.js:63` *(as `A.`)* | 1 | 3 |
| `APP.sunDayOfYear` | `viewer/sun_path.js:46` *(as `A.`)* | 1 | 2 |
| `APP.sunDirectionThree` | `viewer/sun_path.js:196` *(as `A.`)* | 1 | 3 |
| `APP.sunIncidenceDeg` | `viewer/sun_path.js:224` *(as `A.`)* | 1 | 3 |
| `APP.sunInstantAtSolarHour` | `viewer/sun_path.js:175` *(as `A.`)* | 1 | 2 |
| `APP.sunPositionAt` | `viewer/sun_path.js:62` *(as `A.`)* | 1 | 4 |
| `APP.sunReadoutLastBox` | `viewer/cinema_maxq.js:2039` *(as `A.`)* | 2 | 4 |
| `APP.sw` | — *phantom* | 0 | 2 |
| `APP.tailPanelAt` | `viewer/cpe_resource_panel.js:880` *(as `A.`)* | 1 | 4 |
| `APP.three2ifc` | `viewer/scene.js:528` *(as `A.`)* | 1 | 32 |
| `APP.three2ifcDir` | `viewer/scene.js:533` *(as `A.`)* | 1 | 7 |
| `APP.tmCopySnapshotImage` | `viewer/share.js:415` *(as `A.`)* | 1 | 3 |
| `APP.tmCopySnapshotLink` | `viewer/share.js:446` *(as `A.`)* | 1 | 2 |
| `APP.tmFrontierPhase` | `witness/witness_cpe_room_title_collective.js:146` *(as `A.`)* | 3 | 6 |
| `APP.toast` | — *phantom* | 0 | 2 |
| `APP.toggleBackground` | — *phantom* | 0 | 1 |
| `APP.toggleClashMode` | `viewer/measure.js:2052` *(as `A.`)* | 1 | 1 |
| `APP.toggleDisc` | `viewer/panels.js:755` *(as `A.`)* | 1 | 2 |
| `APP.toggleEarthworksPanel` | `viewer/earthworks_overlay.js:184` *(as `A.`)* | 1 | 1 |
| `APP.toggleFlyAround` | `viewer/tour.js:8` *(as `A.`)* | 1 | 10 |
| `APP.toggleFullscreen` | — *phantom* | 0 | 4 |
| `APP.toggleGIPreview` | `viewer/effects_gi_poc.js:15` *(as `A.`)* | 2 | 11 |
| `APP.toggleGridOverlay` | — *phantom* | 0 | 25 |
| `APP.toggleHoverName` | `viewer/hover_name.js:198` *(as `A.`)* | 1 | 12 |
| `APP.toggleIssues` | `viewer/issues.js:243` *(as `A.`)* | 1 | 2 |
| `APP.toggleMeasure` | `viewer/measure.js:1193` *(as `A.`)* | 1 | 6 |
| `APP.toggleNightMode` | — *phantom* | 0 | 21 |
| `APP.toggleNlp` | `viewer/nlp.js:674` *(as `A.`)* | 1 | 9 |
| `APP.togglePanel` | `viewer/panels.js:508` *(as `A.`)* | 1 | 2 |
| `APP.togglePopulate` | `viewer/effects.js:2059` *(as `A.`)* | 1 | 17 |
| `APP.toggleRoadReport` | `viewer/road_report.js:153` *(as `A.`)* | 1 | 3 |
| `APP.toggleRoadStandards` | `viewer/road_standards.js:127` *(as `A.`)* | 1 | 3 |
| `APP.toggleRoadworksPanel` | `viewer/earthworks_overlay.js:192` *(as `A.`)* | 1 | 1 |
| `APP.toggleSSAO` | `viewer/effects.js:55` *(as `A.`)* | 2 | 2 |
| `APP.toggleSSGIPreview` | `viewer/effects_gi_poc.js:487` *(as `A.`)* | 1 | 7 |
| `APP.toggleSection` | — *phantom* | 0 | 11 |
| `APP.toggleShadow` | — *phantom* | 0 | 10 |
| `APP.toggleStillRefine` | `viewer/effects.js:6406` *(as `A.`)* | 1 | 36 |
| `APP.toggleStillRefineUI` | `viewer/effects.js:6486` *(as `A.`)* | 1 | 5 |
| `APP.toggleSunglass` | — *phantom* | 0 | 1 |
| `APP.toggleTheme` | — *phantom* | 0 | 1 |
| `APP.toggleVariance` | `viewer/diff.js:442` *(as `A.`)* | 1 | 3 |
| `APP.toggleWalkMode` | `viewer/walk.js:25` *(as `A.`)* | 1 | 2 |
| `APP.toggleXray` | — *phantom* | 0 | 15 |
| `APP.totalElements` | `viewer/city.js:364` *(as `A.`)* | 5 | 15 |
| `APP.tourScrubSpeed` | `viewer/tour.js:362` *(as `A.`)* | 2 | 5 |
| `APP.tourSeek` | `viewer/tour.js:1576` *(as `A.`)* | 1 | 25 |
| `APP.tourSetSpeed` | `viewer/tour.js:1971` *(as `A.`)* | 1 | 5 |
| `APP.tourStepBeat` | `viewer/tour.js:1611` *(as `A.`)* | 1 | 7 |
| `APP.tourTogglePause` | `viewer/tour.js:1962` *(as `A.`)* | 1 | 12 |
| `APP.undoMarkup` | `viewer/sitecam.js:353` *(as `A.`)* | 1 | 2 |
| `APP.updateAmbience` | — *phantom* | 0 | 7 |
| `APP.updateHUD` | `viewer/panels.js:955` *(as `A.`)* | 1 | 7 |
| `APP.updateHash` | `viewer/streaming.js:4243` *(as `A.`)* | 1 | 2 |
| `APP.updateLighting` | — *phantom* | 0 | 1 |
| `APP.updateMeasureLabels` | `viewer/measure.js:1753` *(as `A.`)* | 1 | 2 |
| `APP.updateSectionPlane` | — *phantom* | 0 | 3 |
| `APP.updateSky` | `viewer/scene.js:275` *(as `A.`)* | 1 | 22 |
| `APP.v` | — *phantom* | 0 | 2 |
| `APP.vacuous` | — *phantom* | 0 | 2 |
| `APP.viewer` | — *phantom* | 0 | 2 |
| `APP.walkActionIdx` | `viewer/picking.js:82` *(as `A.`)* | 9 | 44 |
| `APP.walkActionT` | `viewer/picking.js:83` *(as `A.`)* | 11 | 15 |
| `APP.walkActions` | `viewer/picking.js:81` *(as `A.`)* | 6 | 68 |
| `APP.walkAnchorGPS` | `viewer/picking.js:48` *(as `A.`)* | 3 | 12 |
| `APP.walkAnchorIFC` | `viewer/picking.js:49` *(as `A.`)* | 3 | 15 |
| `APP.walkBlueDot` | `viewer/picking.js:50` *(as `A.`)* | 2 | 6 |
| `APP.walkCompassReadings` | `viewer/walk.js:11` *(as `A.`)* | 2 | 2 |
| `APP.walkCurrentRoom` | `viewer/picking.js:60` *(as `A.`)* | 1 | 1 |
| `APP.walkGpsFollowCam` | `viewer/picking.js:53` *(as `A.`)* | 3 | 3 |
| `APP.walkGpsWatchId` | `viewer/picking.js:51` *(as `A.`)* | 3 | 7 |
| `APP.walkLastAccelZ` | `viewer/walk.js:21` *(as `A.`)* | 2 | 3 |
| `APP.walkLastTime` | `viewer/picking.js:61` *(as `A.`)* | 9 | 11 |
| `APP.walkLiveTilt` | `viewer/walk.js:13` *(as `A.`)* | 1 | 1 |
| `APP.walkLockedHeading` | `viewer/walk.js:12` *(as `A.`)* | 2 | 2 |
| `APP.walkMode` | `viewer/picking.js:46` *(as `A.`)* | 13 | 39 |
| `APP.walkModeActive` | `viewer/picking.js:47` *(as `A.`)* | 3 | 42 |
| `APP.walkModeGpsTick` | `viewer/walk.js:310` *(as `A.`)* | 1 | 2 |
| `APP.walkOrbitAngle` | `viewer/picking.js:85` *(as `A.`)* | 3 | 3 |
| `APP.walkOrientTick` | `viewer/walk.js:17` *(as `A.`)* | 2 | 4 |
| `APP.walkOrientationHandler` | `viewer/walk.js:14` *(as `A.`)* | 3 | 7 |
| `APP.walkPanAngle` | `viewer/picking.js:84` *(as `A.`)* | 7 | 7 |
| `APP.walkPath` | `viewer/picking.js:56` *(as `A.`)* | 2 | 2 |
| `APP.walkSpeed` | — *phantom* | 0 | 3 |
| `APP.walkSpeedMult` | `viewer/picking.js:59` *(as `A.`)* | 3 | 7 |
| `APP.walkStepCooldown` | `viewer/walk.js:22` *(as `A.`)* | 2 | 3 |
| `APP.walkStepCount` | `viewer/walk.js:23` *(as `A.`)* | 2 | 10 |
| `APP.walkStepHandler` | `viewer/walk.js:20` *(as `A.`)* | 3 | 7 |
| `APP.walkStoreyLevels` | `viewer/picking.js:52` *(as `A.`)* | 3 | 7 |
| `APP.walkT` | `viewer/picking.js:57` *(as `A.`)* | 1 | 1 |
| `APP.walkTick` | `viewer/tour.js:1658` *(as `A.`)* | 1 | 6 |
| `APP.walkTotalLen` | `viewer/picking.js:58` *(as `A.`)* | 1 | 1 |
| `APP.wallFaceNormalsThree` | `viewer/sun_path.js:242` *(as `A.`)* | 1 | 2 |
| `APP.wallXrayActive` | `viewer/picking.js:54` *(as `A.`)* | 3 | 4 |
| `APP.wallXrayMepHighlights` | `viewer/picking.js:62` *(as `A.`)* | 2 | 4 |
| `APP.wallXrayOriginals` | `viewer/picking.js:55` *(as `A.`)* | 2 | 5 |
| `APP.wireOn` | — *phantom* | 0 | 1 |
| `APP.wlog` | `viewer/picking.js:89` *(as `A.`)* | 1 | 26 |
| `APP.x0` | — *phantom* | 0 | 1 |
| `APP.x1` | — *phantom* | 0 | 1 |
| `APP.xrayOn` | `tests/whitebox_regression.js:872` *(as `A.`)* | 2 | 29 |
| `APP.y0` | — *phantom* | 0 | 1 |
| `APP.y1` | — *phantom* | 0 | 1 |
| `APP.zoomToGuid` | `viewer/diff.js:187` *(as `A.`)* | 1 | 23 |
| `APP.zoomToGuids` | `viewer/diff.js:241` *(as `A.`)* | 1 | 3 |
