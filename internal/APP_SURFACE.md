# APP surface — generated index

> **Generated. Do not hand-edit.** `node scripts/gen_app_surface.js`
> Spec: `scripts/gen_app_surface.js` §W-APP-SURFACE. See CodeScrapBook §2 and §14.

The viewer god object is **written as `A.x`** (every module is `setupX(A)`) and
**read as `APP.x`**. Same object, two spellings — so `grep 'APP.camera ='` finds
nothing. This index is the missing "go to definition".

| | |
|---|---:|
| files scanned | 3250 |
| distinct fields | 1696 |
| written only as `A.x`/`app.x` (invisible to an `APP.` grep) | 1325 |
| read but never written (phantom) | 281 |
| — of those, read from production code | 170 |

## Phantom fields — read, never written

Each is a guard that can never be true, or a writer that was removed. Check before use.

| field | first read site | prod? |
|---|---|---|
| `APP.Ctx` | `erp/crud_overlay.js:484` | **yes** |
| `APP.Env` | `erp/crud_overlay.js:489` | **yes** |
| `APP.KernelOps` | `viewer/cpe_ledger_ticker.js:62` | **yes** |
| `APP.L` | `viewer/tests/witness_colour_truth_gpu.js:153` | no |
| `APP.LABOR_RATES` | `viewer/cpe_resource_panel.js:43` | **yes** |
| `APP.LIB_URL` | `tests/specs/10-deploy-integrity.spec.js:78` | no |
| `APP.RUNTIME` | `erp/crud_overlay.js:432` | **yes** |
| `APP.__cease3DProbe` | `viewer/tests/witness_drawn_film_frame.js:109` | no |
| `APP._allRoomVolumes` | `scripts/probe_buildpass_v2.js:80` | no |
| `APP._applyViewFilter` | `viewer/panels.js:2532` | **yes** |
| `APP._billboardAutoBuild` | `viewer/streaming.js:3398` | **yes** |
| `APP._bloomPass` | `scripts/probe_allout.js:29` | no |
| `APP._camLight` | `viewer/sourced_light.js:888` | **yes** |
| `APP._camTorch` | `viewer/sourced_light.js:1507` | **yes** |
| `APP._cinemaFanMeshesDebug` | `witness/witness_bbox_ghost_stuck.js:88` | no |
| `APP._cinemaOrbitActive` | `viewer/dlod_nav.js:400` | **yes** |
| `APP._composer` | `maxq_offline_runner.js:201` | **yes** |
| `APP._concrete` | `viewer/streaming.js:1704` | **yes** |
| `APP._concreteTileM` | `viewer/streaming.js:1705` | **yes** |
| `APP._cpeBeat3GazeDebug` | `witness/witness_cpe_aim_retire.js:151` | no |
| `APP._cpeBeat3PoseDebug` | `witness/witness_cpe_cone_orient.js:186` | no |
| `APP._cpeCorrectionsDebug` | `witness/witness_cpe_aim_retire.js:315` | no |
| `APP._cpeGazeClearDebug` | `witness/witness_cpe_corr_brush.js:159` | no |
| `APP._cpePinZonesDebug` | `witness/witness_cpe_aim_pin.js:137` | no |
| `APP._cpeRevealVisualKey` | `viewer/cpe_storey_reveal.js:2018` | **yes** |
| `APP._cpeViewfinderRender` | `viewer/main.js:811` | **yes** |
| `APP._csmUncovered` | `viewer/still_fault.js:174` | **yes** |
| `APP._debugForceGhostLensOwned` | `witness/witness_bbox_ghost_stuck.js:65` | no |
| `APP._debugGhostLensOwned` | `witness/witness_bbox_ghost_stuck.js:65` | no |
| `APP._dlodStillHold` | `viewer/dlod.js:112` | **yes** |
| `APP._egressRulesCache` | `viewer/rule_checklist.js:910` | **yes** |
| `APP._egressRulesSource` | `viewer/rule_checklist.js:910` | **yes** |
| `APP._envCache` | `tests/specs/20-s250-polish.spec.js:294` | no |
| `APP._envMapHdriActive` | `viewer/scene.js:339` | **yes** |
| `APP._fieldTrace` | `viewer/light_zones.js:1098` | **yes** |
| `APP._filmBounceOff` | `viewer/gi_still.js:1405` | **yes** |
| `APP._filmExposureStep` | `viewer/maxq_start.js:1766` | **yes** |
| `APP._filmFieldOn` | `viewer/maxq_capture_stitch.js:129` | **yes** |
| `APP._filmParityStep` | `viewer/maxq_start.js:1761` | **yes** |
| `APP._findRefreshTree` | `viewer/scene.js:1397` | **yes** |
| `APP._freezeAnimKey` | `viewer/maxq_start.js:2319` | **yes** |
| `APP._getCinemaPathEdit` | `sandbox/spike_ssgi_webgpu/gi_webgpu_tap.js:329` | **yes** |
| `APP._getPhotoSkyline` | `viewer/tests/witness_still_shadow_fit.js:39` | no |
| `APP._getStaffageInstances` | `viewer/scene.js:792` | **yes** |
| `APP._glowSpriteCount` | `scripts/probe_glow_night.js:37` | no |
| `APP._gradePass` | `witness/witness_photo_grade.js:58` | no |
| `APP._gridGroup` | `tests/specs/20-s250-polish.spec.js:250` | no |
| `APP._groundWetnessOverride` | `scripts/probe_ground_albedo.js:80` | no |
| `APP._hbaClassFilter` | `viewer/hba_lens.js:472` | **yes** |
| `APP._hbaPeriod` | `viewer/hba_avatars.js:63` | **yes** |
| `APP._isPhotoGlossyMat` | `viewer/tests/witness_sun_fill_ratio.js:347` | no |
| `APP._loadPathArmTFilm` | `viewer/maxq_start.js:2467` | **yes** |
| `APP._loadPathDiagRaycast` | `viewer/maxq_capture_stitch.js:147` | **yes** |
| `APP._loadPathDiagSample` | `viewer/maxq_capture_stitch.js:89` | **yes** |
| `APP._loadPathFadeSecFor` | `viewer/maxq_start.js:310` | **yes** |
| `APP._loadPathInstanceWorldBox` | `viewer/tests/witness_civil_chainage_buildup.js:52` | no |
| `APP._loadPathReleaseTFilm` | `viewer/maxq_start.js:2467` | **yes** |
| `APP._loadPathRestoreCount` | `viewer/maxq_capture_stitch.js:578` | **yes** |
| `APP._loadPathVisualRev` | `viewer/maxq_start.js:2314` | **yes** |
| `APP._loadPathWindow` | `viewer/maxq_start.js:920` | **yes** |
| `APP._lpStackOnly` | `viewer/maxq_start.js:1766` | **yes** |
| `APP._mainPillActions` | `hr_bim_asset/tests/live/action_regression.js:19` | no |
| `APP._mepProxyOff` | `viewer/streaming.js:912` | **yes** |
| `APP._mepSmoothDone` | `witness/witness_photo_prewarm.js:35` | no |
| `APP._mirrorOwnMats` | `viewer/glass_fresnel.js:122` | **yes** |
| `APP._nav` | `tests/specs/17-find-navigate.spec.js:337` | **yes** |
| `APP._nightFixtureList` | `viewer/tests/witness_civil_fresh_import_fly.js:82` | no |
| `APP._outlinePass` | `viewer/effects_gi_poc.js:157` | no |
| `APP._photoAutoStageOn` | `viewer/main.js:801` | **yes** |
| `APP._photoFacadeLightsDbg` | `scripts/probe_facade_warm_cool.js:56` | no |
| `APP._photoFillBase` | `viewer/tests/tap_sun_arc_fill.js:66` | no |
| `APP._photoGroundAlbedoGain` | `scripts/probe_ground_albedo.js:75` | no |
| `APP._photoMatteSkyEnv` | `viewer/tests/witness_sun_fill_ratio.js:591` | no |
| `APP._photoPaintSeed` | `viewer/streaming.js:2068` | **yes** |
| `APP._photoPrewarm` | `viewer/streaming.js:3404` | **yes** |
| `APP._photoStaffageGroup` | `witness/witness_cinema_r1_sit_fallback.js:26` | no |
| `APP._photoStagingOn` | `viewer/main.js:870` | **yes** |
| `APP._plTopoutWant` | `viewer/tests/witness_pl_topout_unpin.js:63` | no |
| `APP._placeholderOff` | `viewer/streaming.js:1443` | **yes** |
| `APP._populateBusy` | `viewer/panels.js:427` | **yes** |
| `APP._probeAimDepth` | `witness/witness_cpe_aim_retire.js:355` | no |
| `APP._rangeDb` | `viewer/clash_narrow.js:379` | **yes** |
| `APP._resetAllVisibility` | `viewer/panels.js:2531` | **yes** |
| `APP._setGroundWetness` | `viewer/effects_gi_poc.js:472` | no |
| `APP._setTreeMode` | `witness/witness_bbox_ghost_stuck.js:65` | no |
| `APP._shellTrace` | `viewer/light_zones.js:1121` | **yes** |
| `APP._show4DWindow` | `viewer/tests/witness_s7_canvas_pick.js:77` | no |
| `APP._solidMeshes` | `witness/witness_bbox_ghost_stuck.js:88` | no |
| `APP._ssaoPass` | `viewer/effects_gi_poc.js:157` | **yes** |
| `APP._stillAo` | `viewer/gi_still.js:534` | **yes** |
| `APP._stillCalibOn` | `viewer/sky_portal.js:176` | **yes** |
| `APP._stillCalibSunI` | `viewer/gi_still.js:1097` | **yes** |
| `APP._stillCalibSunLux` | `viewer/gi_still.js:1097` | **yes** |
| `APP._stillCamInsideNow` | `viewer/sourced_light.js:1466` | **yes** |
| `APP._stillCapCentre` | `viewer/light_zones.js:337` | **yes** |
| `APP._stillCascadeExtraUnits` | `viewer/sky_portal.js:118` | **yes** |
| `APP._stillContact` | `viewer/sourced_light.js:353` | **yes** |
| `APP._stillFixNonLum` | `viewer/tools.js:1576` | **yes** |
| `APP._stillFloorContact` | `viewer/sourced_light.js:339` | **yes** |
| `APP._stillFloorFSmooth` | `viewer/sourced_light.js:1424` | **yes** |
| `APP._stillGiAlb` | `viewer/gi_still.js:866` | **yes** |
| `APP._stillGiBound` | `viewer/gi_still.js:858` | **yes** |
| `APP._stillGiRedist` | `viewer/gi_still.js:862` | **yes** |
| `APP._stillGlassBlock` | `viewer/light_zones.js:959` | **yes** |
| `APP._stillGlassEnv` | `viewer/glass_fresnel.js:123` | **yes** |
| `APP._stillGlassTone` | `viewer/sourced_light.js:929` | **yes** |
| `APP._stillGroundMode` | `viewer/light_zones.js:860` | **yes** |
| `APP._stillIr` | `viewer/sourced_light.js:657` | **yes** |
| `APP._stillIrColour` | `viewer/sourced_light.js:661` | **yes** |
| `APP._stillIrc` | `viewer/light_zones.js:148` | **yes** |
| `APP._stillLampCapNearest` | `viewer/tools.js:2653` | **yes** |
| `APP._stillLampData` | `viewer/sourced_light.js:557` | **yes** |
| `APP._stillLampDecayNow` | `viewer/tools.js:1706` | **yes** |
| `APP._stillLampEn` | `viewer/sourced_light.js:786` | **yes** |
| `APP._stillLampMul` | `viewer/tools.js:1705` | **yes** |
| `APP._stillLampRangeNow` | `viewer/tools.js:1707` | **yes** |
| `APP._stillLampShadow` | `viewer/tools.js:2517` | **yes** |
| `APP._stillLampsOff` | `viewer/still_fault.js:61` | **yes** |
| `APP._stillLocalExp` | `viewer/gi_still.js:1036` | **yes** |
| `APP._stillLockOn` | `viewer/main.js:873` | **yes** |
| `APP._stillMeter` | `viewer/sourced_light.js:1470` | **yes** |
| `APP._stillMeterMode` | `viewer/sourced_light.js:1646` | **yes** |
| `APP._stillObjContact` | `viewer/sourced_light.js:327` | **yes** |
| `APP._stillPortalSort` | `viewer/sky_portal.js:154` | **yes** |
| `APP._stillPortalsKeep` | `viewer/sky_portal.js:107` | **yes** |
| `APP._stillPoseLast` | `viewer/gi_still.js:1177` | **yes** |
| `APP._stillResPreset` | `viewer/gi_still.js:821` | **yes** |
| `APP._stillShadowWide` | `viewer/glass_fresnel.js:138` | **yes** |
| `APP._stillShapeColour` | `viewer/tools.js:1637` | **yes** |
| `APP._stillShellCull` | `viewer/light_zones.js:1134` | **yes** |
| `APP._stillShellReach` | `viewer/light_zones.js:852` | **yes** |
| `APP._stillSkyExactAllN` | `viewer/light_zones.js:790` | **yes** |
| `APP._stillSkyExactAllShell` | `viewer/light_zones.js:813` | **yes** |
| `APP._stillSkyExactCov` | `viewer/light_zones.js:812` | **yes** |
| `APP._stillSkyOpenRoof` | `viewer/light_zones.js:805` | **yes** |
| `APP._streaming` | `tests/specs/s271-mobile-perf.spec.js:84` | no |
| `APP._structuralRulesCache` | `viewer/rule_checklist.js:833` | **yes** |
| `APP._structuralRulesSource` | `viewer/rule_checklist.js:833` | **yes** |
| `APP._sunArcStep` | `viewer/maxq_start.js:1206` | **yes** |
| `APP._sunCycleActive` | `viewer/tools.js:1164` | **yes** |
| `APP._swCacheVersion` | `viewer/rule_checklist.js:381` | **yes** |
| `APP._taaPass` | `viewer/maxq_capture_stitch.js:94` | **yes** |
| `APP._teardownStillRefine` | `scripts/probe_ground_albedo.js:85` | no |
| `APP._tmState` | `tests/whitebox_regression.js:964` | no |
| `APP._updateCamLight` | `viewer/maxq_start.js:1374` | **yes** |
| `APP._updateCamTorch` | `viewer/maxq_start.js:1375` | **yes** |
| `APP._updateFacadeFacing` | `scripts/probe_facade_warm_cool.js:88` | no |
| `APP._useRangeStream` | `viewer/clash_narrow.js:401` | **yes** |
| `APP._walkMode` | `viewer/panels.js:1378` | **yes** |
| `APP.a` | `modeller/dxf2analytical.js:25` | **yes** |
| `APP.advanceNavStep` | `viewer/tests/witness_room_cycle_home_2026-07-22.js:241` | no |
| `APP.applicable` | `viewer/tests/witness_speed_zones.js:379` | no |
| `APP.applyFindScope` | `modeller/tests/witness_s9_modeller_project.js:129` | **yes** |
| `APP.area` | `modeller/load_summary.js:88` | **yes** |
| `APP.askAnswers` | `viewer/tests/witness_find_ask_answers.js:185` | no |
| `APP.askBuildWorkbook` | `viewer/tests/witness_find_ask_answers.js:202` | no |
| `APP.askInput` | `viewer/tests/witness_find_ask_answers.js:189` | no |
| `APP.askRun` | `viewer/tests/witness_find_ask_answers.js:127` | **yes** |
| `APP.askSuggest` | `viewer/tests/witness_find_ask_answers.js:105` | no |
| `APP.b` | `modeller/dxf2analytical.js:25` | **yes** |
| `APP.bind` | `erp/crud_overlay.js:427` | **yes** |
| `APP.budget` | `capex/tests/witness_td_pack_dash.js:124` | no |
| `APP.buildRouteTemplate` | `tests/specs/17-find-navigate.spec.js:585` | no |
| `APP.buildingName` | `viewer/hba_iot.js:268` | **yes** |
| `APP.bytes` | `erp/tests/witness_bimdoc_live.js:312` | no |
| `APP.cinemaBandFlow` | `scripts/probe_band_len.js:30` | no |
| `APP.cinemaBandWaypoints` | `witness/witness_cinema_bands.js:145` | no |
| `APP.cinemaFan` | `witness/witness_cinema_bands.js:136` | no |
| `APP.cinemaHoseApply` | `witness/witness_cpe_hose.js:76` | no |
| `APP.cinemaHoseReanchor` | `witness/witness_cpe_hose.js:292` | no |
| `APP.cinemaLookDist` | `viewer/tour.js:1290` | **yes** |
| `APP.cinemaPathPlan` | `cli_silent_bake.js:962` | **yes** |
| `APP.cinemaPathPlanDerived` | `witness/witness_cinema_path_editor.js:91` | no |
| `APP.cinemaPrefixInvalidate` | `witness/witness_cpe_replan_lazy.js:96` | no |
| `APP.cinemaRoundCorners` | `witness/witness_cinema_path_editor.js:227` | no |
| `APP.cinemaSeedBands` | `scripts/probe_band_len.js:17` | no |
| `APP.cinemaSeedStick` | `witness/witness_cpe_hose.js:180` | no |
| `APP.civilDriveRoute` | `viewer/chainage_grid.js:280` | **yes** |
| `APP.clearFocusElement` | `viewer/main.js:77` | **yes** |
| `APP.clientName` | `erp/overlay/pills.js:27` | **yes** |
| `APP.closeFindPanel` | `viewer/nlp.js:668` | **yes** |
| `APP.closeSunglass` | `viewer/main.js:357` | **yes** |
| `APP.column` | `viewer/tests/witness_speed_zones.js:380` | no |
| `APP.contributeBuilding` | `tests/specs/20-s250-polish.spec.js:338` | no |
| `APP.counts` | `viewer/tests/witness_speed_zones.js:378` | no |
| `APP.cpeArchFadeApplyVisual` | `viewer/maxq_start.js:1490` | **yes** |
| `APP.cpeRevealApplyVisual` | `viewer/maxq_start.js:1488` | **yes** |
| `APP.cpeRevealCaptionAt` | `sandbox/spike_ssgi_webgpu/gi_webgpu_tap.js:375` | **yes** |
| `APP.cpeRevealDiscLabel` | `viewer/cpe_road_panels.js:162` | **yes** |
| `APP.cpeRevealDiscQtyCost` | `witness/witness_cpe_reveal_pullout.js:338` | no |
| `APP.cpeRevealDiscsPresent` | `viewer/tests/witness_civil_reveal_shell.js:49` | no |
| `APP.cpeRevealLightsOffAt` | `viewer/maxq_start.js:1719` | **yes** |
| `APP.cpeRevealShellDiscs` | `viewer/tests/witness_civil_reveal_shell.js:49` | no |
| `APP.cpeRevealVisualAt` | `viewer/cpe_storey_reveal.js:642` | **yes** |
| `APP.currentBuilding` | `viewer/cpe_room_title.js:296` | **yes** |
| `APP.ensureHdriEnvMapReady` | `viewer/maxq_start.js:736` | **yes** |
| `APP.ensureRooms` | `scripts/probe_band_len.js:23` | **yes** |
| `APP.error` | `viewer/tests/witness_colour_truth_gpu.js:151` | no |
| `APP.errs` | `capex/tests/witness_td_pack_dash.js:142` | no |
| `APP.fault` | `viewer/tests/witness_light_field_db.js:98` | no |
| `APP.faultGi` | `viewer/tests/witness_light_field_db.js:103` | no |
| `APP.fieldSweepMs` | `viewer/tests/witness_light_field_db.js:96` | no |
| `APP.focusElement` | `viewer/chainage_grid.js:490` | **yes** |
| `APP.freezePerfBuild` | `viewer/maxq_start.js:906` | **yes** |
| `APP.friendlyName` | `viewer/cpe_room_title.js:277` | **yes** |
| `APP.gazeAcquireCap` | `witness/witness_cpe_gaze_acquire.js:67` | no |
| `APP.gazeAcquireStep` | `witness/witness_cpe_gaze_acquire.js:71` | no |
| `APP.getRouteTemplate` | `tests/specs/17-find-navigate.spec.js:639` | no |
| `APP.giBlown` | `viewer/tests/witness_light_field_db.js:104` | no |
| `APP.glassMs` | `viewer/tests/witness_light_field_db.js:96` | no |
| `APP.glassReflDark` | `viewer/tests/witness_light_field_db.js:98` | no |
| `APP.integrity` | `viewer/tests/witness_light_field_db.js:94` | no |
| `APP.kernelOps` | `viewer/tm_lifecycle_api.js:713` | **yes** |
| `APP.load` | `erp/tests/witness_bimdoc_live.js:311` | no |
| `APP.loadPathApplyVisual` | `viewer/maxq_start.js:1616` | **yes** |
| `APP.loadPathBuild` | `viewer/maxq_start.js:907` | **yes** |
| `APP.loadPathCardOn` | `viewer/maxq_capture_stitch.js:368` | **yes** |
| `APP.loadPathCompositeOntoCanvas` | `viewer/maxq_capture_stitch.js:72` | **yes** |
| `APP.loadPathDispose` | `viewer/maxq_start.js:2544` | **yes** |
| `APP.lookup` | `erp/tests/witness_bimdoc_live.js:309` | no |
| `APP.materializeZones` | `optics_hud.js:34` | **yes** |
| `APP.n` | `modeller/dxf2analytical.js:28` | **yes** |
| `APP.navJumpToEnd` | `tests/specs/17-find-navigate.spec.js:179` | no |
| `APP.onSectionOff` | `viewer/tools.js:519` | **yes** |
| `APP.onSectionSliderChange` | `viewer/tools.js:591` | **yes** |
| `APP.openTab` | `erp/crud_overlay.js:491` | **yes** |
| `APP.order` | `erp/tests/gen_idempiere_identity.js:58` | no |
| `APP.pageErrors` | `viewer/tests/witness_colour_truth_gpu.js:151` | no |
| `APP.paramsToParas` | `erp/idempiere.html:4719` | **yes** |
| `APP.parasToParams` | `erp/idempiere.html:4738` | **yes** |
| `APP.pauseStillRefineForGI` | `viewer/effects_gi_poc.js:131` | no |
| `APP.pinstanceList` | `erp/idempiere.html:4703` | **yes** |
| `APP.populateActive` | `viewer/panels.js:426` | **yes** |
| `APP.poses` | `viewer/tests/witness_colour_truth_gpu.js:141` | no |
| `APP.probeGradeHdr` | `scripts/probe_grade_hdr.js:20` | no |
| `APP.probes` | `capex/tests/witness_td_pack_dash.js:142` | no |
| `APP.resetCinemaGhostLens` | `viewer/maxq_start.js:26` | **yes** |
| `APP.resident` | `viewer/tests/witness_light_field_db.js:106` | no |
| `APP.rowBytes` | `viewer/tests/witness_light_field_db.js:94` | no |
| `APP.rowFileDelta` | `viewer/tests/witness_light_field_db.js:94` | no |
| `APP.rowRaw` | `viewer/tests/witness_light_field_db.js:94` | no |
| `APP.rows` | `viewer/tests/witness_speed_zones.js:379` | no |
| `APP.saveLines` | `viewer/tests/witness_light_field_db.js:94` | no |
| `APP.saveMs` | `viewer/tests/witness_light_field_db.js:94` | no |
| `APP.saveWallMs` | `viewer/tests/witness_light_field_db.js:94` | no |
| `APP.savedBytes` | `viewer/tests/witness_light_field_db.js:94` | no |
| `APP.sched` | `capex/tests/witness_td_pack_dash.js:137` | no |
| `APP.sessionContext` | `erp/crud_overlay.js:452` | **yes** |
| `APP.setOutline` | `viewer/measure.js:819` | **yes** |
| `APP.sheets` | `erp/tests/gen_idempiere_identity.js:58` | no |
| `APP.shellPassMs` | `viewer/tests/witness_light_field_db.js:96` | no |
| `APP.sky` | `witness/witness_cinema_r1_sit_fallback.js:34` | no |
| `APP.softStopStillRefine` | `viewer/main.js:801` | **yes** |
| `APP.sourcedStage` | `viewer/tests/witness_light_field_db.js:96` | no |
| `APP.src` | `capex/tests/witness_td_pack_dash.js:122` | no |
| `APP.srcBytes` | `viewer/tests/witness_light_field_db.js:94` | no |
| `APP.stageCinemaPath` | `witness/witness_cinema_path_persist.js:84` | no |
| `APP.stagingTotal` | `viewer/tests/witness_light_field_db.js:96` | no |
| `APP.startCinemaOrbit` | `viewer/panels.js:450` | **yes** |
| `APP.startFlyTour` | `viewer/main.js:1242` | **yes** |
| `APP.startMaxQ` | `scripts/probe_bake_start.js:22` | no |
| `APP.startNavigation` | `viewer/navigate.js:37` | **yes** |
| `APP.startStillRefine` | `scripts/probe_allout.js:14` | **yes** |
| `APP.std` | `viewer/tests/witness_colour_truth_gpu.js:176` | no |
| `APP.stillExit` | `viewer/gi_still.js:1184` | **yes** |
| `APP.stopStillRefine` | `scripts/probe_allout.js:30` | **yes** |
| `APP.sw` | `viewer/tests/witness_colour_truth_gpu.js:151` | no |
| `APP.t` | `modeller/dxf2analytical.js:25` | **yes** |
| `APP.toast` | `viewer/dlod_nav.js:2005` | **yes** |
| `APP.togglePopulate` | `viewer/panels.js:439` | **yes** |
| `APP.toggleSSAO` | `viewer/tools.js:1060` | **yes** |
| `APP.toggleStillRefine` | `sandbox/spike_ssgi_webgpu/run_gi_still_headless.js:106` | **yes** |
| `APP.toggleStillRefineUI` | `viewer/panels.js:432` | **yes** |
| `APP.v` | `viewer/tests/witness_colour_truth_gpu.js:151` | no |
| `APP.vacuous` | `viewer/tests/witness_speed_zones.js:370` | no |
| `APP.viewer` | `scripts/probe_drag_scale.js:39` | no |
| `APP.walkSpeed` | `tests/specs/03-walk-sitecam-cycle.spec.js:227` | no |
| `APP.x0` | `viewer/chainage_grid.js:39` | **yes** |
| `APP.x1` | `viewer/chainage_grid.js:39` | **yes** |
| `APP.y0` | `viewer/chainage_grid.js:39` | **yes** |
| `APP.y1` | `viewer/chainage_grid.js:39` | **yes** |

## All fields

| field | written at | writes | reads |
|---|---|---:|---:|
| `APP.BARE_METAL_PBR` | `viewer/streaming.js:769` *(as `A.`)* | 1 | 4 |
| `APP.BLANK_MODE` | `viewer/config.js:23` *(as `A.`)* | 1 | 4 |
| `APP.BLD_BASE` | `viewer/config.js:31` *(as `A.`)* | 1 | 4 |
| `APP.CACHE_DB_NAME` | `viewer/scene.js:537` *(as `A.`)* | 1 | 4 |
| `APP.CACHE_STORE` | `viewer/scene.js:538` *(as `A.`)* | 1 | 46 |
| `APP.CITY_URL` | `viewer/config.js:30` *(as `A.`)* | 1 | 18 |
| `APP.CIVIL_EARTHWORK_OPACITY` | `viewer/streaming.js:1506` *(as `A.`)* | 1 | 2 |
| `APP.CONTRIBUTE_PAR` | `viewer/config.js:94` *(as `A.`)* | 1 | 5 |
| `APP.Ctx` | — *phantom* | 0 | 1 |
| `APP.DB_URL` | `erp/kanban_lens.html:243` | 2 | 61 |
| `APP.DEFAULT_COLOR` | `viewer/config.js:54` *(as `A.`)* | 1 | 7 |
| `APP.DISC_COLORS` | `viewer/config.js:48` *(as `A.`)* | 1 | 35 |
| `APP.EMBEDDED` | `viewer/config.js:34` *(as `A.`)* | 1 | 3 |
| `APP.EXPORTER_PLACEHOLDER_MAT_NAMES` | `viewer/streaming.js:734` *(as `A.`)* | 1 | 2 |
| `APP.Env` | — *phantom* | 0 | 1 |
| `APP.FIND_GUID` | `viewer/config.js:40` *(as `A.`)* | 1 | 9 |
| `APP.FLYTHRU_BOX_EDGES` | `viewer/cpe_flythru_dims.js:541` *(as `A.`)* | 1 | 1 |
| `APP.FLYTHRU_DRAW_CONTRACT` | `viewer/cpe_flythru_dims.js:386` *(as `A.`)* | 1 | 1 |
| `APP.HOME_URL` | `viewer/config.js:36` *(as `A.`)* | 1 | 4 |
| `APP.KernelOps` | — *phantom* | 0 | 1 |
| `APP.L` | — *phantom* | 0 | 2 |
| `APP.LABOR_PROD` | `viewer/config.js:73` *(as `A.`)* | 1 | 1 |
| `APP.LABOR_RATES` | — *phantom* | 0 | 1 |
| `APP.LEGACY_ERP` | `viewer/config.js:44` *(as `A.`)* | 1 | 1 |
| `APP.LEGACY_ERP_CTX` | `viewer/config.js:45` *(as `A.`)* | 1 | 1 |
| `APP.LIB_URL` | — *phantom* | 0 | 1 |
| `APP.MATERIAL_COSTS` | `viewer/config.js:57` *(as `A.`)* | 1 | 3 |
| `APP.MEP_HUE_ACHROMATIC_MAX` | `viewer/streaming.js:716` *(as `A.`)* | 1 | 9 |
| `APP.METAL_PBR_CLASSES` | `viewer/streaming.js:767` *(as `A.`)* | 1 | 4 |
| `APP.NIGHT_LIGHT_INTENSITY_BASE` | `viewer/tools.js:1683` *(as `A.`)* | 1 | 1 |
| `APP.PAN_SPEED` | `viewer/config.js:88` *(as `A.`)* | 1 | 2 |
| `APP.PHASE_MAP` | `viewer/config.js:79` *(as `A.`)* | 1 | 2 |
| `APP.PORCELAIN_PBR` | `viewer/streaming.js:751` *(as `A.`)* | 1 | 6 |
| `APP.PROD_BASE` | `viewer/config.js:21` *(as `A.`)* | 1 | 11 |
| `APP.PROXY_NAME_MAT` | `viewer/streaming.js:786` *(as `A.`)* | 1 | 2 |
| `APP.RECORD_ID` | `viewer/config.js:35` *(as `A.`)* | 1 | 1 |
| `APP.RUNTIME` | — *phantom* | 0 | 4 |
| `APP.WALK_EYE_HEIGHT` | `viewer/config.js:86` *(as `A.`)* | 1 | 17 |
| `APP.WALK_SPEED` | `viewer/config.js:87` *(as `A.`)* | 1 | 5 |
| `APP.WALK_STEP_COOLDOWN_MS` | `viewer/config.js:91` *(as `A.`)* | 1 | 2 |
| `APP.WALK_STEP_DISTANCE` | `viewer/config.js:90` *(as `A.`)* | 1 | 4 |
| `APP.WALK_STEP_THRESHOLD` | `viewer/config.js:89` *(as `A.`)* | 1 | 3 |
| `APP._CACHE_MAX_BLOB_BYTES` | `viewer/scene.js:1884` *(as `A.`)* | 1 | 4 |
| `APP._CACHE_WRITE_TIMEOUT_MS` | `viewer/scene.js:1875` *(as `A.`)* | 1 | 5 |
| `APP._CLASH_PAGE_SIZE` | `viewer/clash_report.js:106` *(as `A.`)* | 12 | 25 |
| `APP._MAX_CACHE_ENTRIES` | `viewer/scene.js:648` *(as `A.`)* | 1 | 3 |
| `APP._MERGE_GEO_TABLES` | `viewer/scene.js:1124` *(as `A.`)* | 1 | 7 |
| `APP._MERGE_GUID_ROW_TABLES` | `viewer/scene.js:1127` *(as `A.`)* | 1 | 3 |
| `APP._MERGE_META_TABLES` | `viewer/scene.js:1121` *(as `A.`)* | 1 | 5 |
| `APP._SQL` | `viewer/streaming.js:3671` *(as `A.`)* | 1 | 35 |
| `APP._TRIPLANAR_BY_NAME` | `viewer/streaming.js:1798` *(as `A.`)* | 1 | 5 |
| `APP._TRIPLANAR_MAT` | `viewer/streaming.js:1797` *(as `A.`)* | 1 | 5 |
| `APP._TRI_BIG_CLASSES` | `viewer/streaming.js:954` *(as `A.`)* | 1 | 3 |
| `APP.__cease3DProbe` | — *phantom* | 0 | 2 |
| `APP.__ceaseSubjectOff` | `viewer/tests/witness_drawn_film_frame.js:114` *(as `A.`)* | 2 | 2 |
| `APP.__cpeAimOff` | `witness/witness_cpe_corr_brush.js:190` *(as `A.`)* | 2 | 2 |
| `APP.__frameQaCv` | `viewer/maxq_capture_stitch.js:625` *(as `A.`)* | 1 | 2 |
| `APP.__tmIsolateOff` | `viewer/tests/witness_drawn_film_frame.js:85` | 4 | 4 |
| `APP._allRoomVolumes` | — *phantom* | 0 | 2 |
| `APP._alphaOf` | `viewer/streaming.js:940` *(as `A.`)* | 1 | 9 |
| `APP._ambienceTick` | `viewer/tools.js:779` *(as `A.`)* | 1 | 4 |
| `APP._applyDiscVisibility` | `viewer/panels.js:837` *(as `A.`)* | 1 | 9 |
| `APP._applyGroundTexture` | `viewer/tools.js:294` *(as `A.`)* | 1 | 3 |
| `APP._applyNightGlowToMatCache` | `viewer/tools.js:1712` *(as `A.`)* | 1 | 2 |
| `APP._applyPendingPatch` | `viewer/scene.js:2111` *(as `A.`)* | 1 | 6 |
| `APP._applyViewFilter` | — *phantom* | 0 | 4 |
| `APP._archGroundZ` | `viewer/city.js:274` *(as `A.`)* | 1 | 3 |
| `APP._areaBackups` | `viewer/measure.js:1282` *(as `A.`)* | 2 | 5 |
| `APP._areaCache` | `viewer/measure.js:1500` *(as `A.`)* | 1 | 4 |
| `APP._bakeCameraPoseAt` | `viewer/maxq_start.js:420` *(as `A.`)* | 1 | 1 |
| `APP._bakeOwned` | `viewer/scene.js:547` *(as `A.`)* | 1 | 8 |
| `APP._bareMetalKey` | `viewer/streaming.js:772` *(as `A.`)* | 1 | 2 |
| `APP._batchDiscMap` | `viewer/streaming.js:2714` *(as `A.`)* | 1 | 8 |
| `APP._batchFlushCount` | `viewer/streaming.js:3340` *(as `A.`)* | 1 | 4 |
| `APP._batchMeta` | `viewer/streaming.js:2712` *(as `A.`)* | 1 | 169 |
| `APP._batchStoreyMap` | `viewer/streaming.js:2713` *(as `A.`)* | 1 | 8 |
| `APP._bboxCleared` | `viewer/streaming.js:434` *(as `A.`)* | 5 | 9 |
| `APP._bboxMaterial` | `viewer/helpers.js:535` *(as `A.`)* | 1 | 4 |
| `APP._bboxPlaceholder` | `viewer/streaming.js:527` *(as `A.`)* | 1 | 1 |
| `APP._bboxPlaceholders` | `viewer/streaming.js:531` *(as `A.`)* | 2 | 12 |
| `APP._bcf` | `viewer/bcf_export.js:224` *(as `A.`)* | 1 | 6 |
| `APP._bdEverDrawn` | `viewer/maxq_start.js:1432` *(as `A.`)* | 1 | 4 |
| `APP._bdSeenLast` | `viewer/maxq_start.js:1417` *(as `A.`)* | 1 | 4 |
| `APP._beamOffsetMats` | `viewer/streaming.js:2297` *(as `A.`)* | 1 | 3 |
| `APP._billboardAutoBuild` | — *phantom* | 0 | 2 |
| `APP._bimGuidsForClass` | `viewer/main.js:48` | 1 | 2 |
| `APP._bimHighlight` | `viewer/main.js:55` | 1 | 3 |
| `APP._bimPostFocus` | `viewer/main.js:37` | 1 | 4 |
| `APP._blankHeld` | `viewer/maxq_start.js:2355` *(as `A.`)* | 1 | 3 |
| `APP._blobToThumbUrl` | `viewer/issues.js:67` *(as `A.`)* | 1 | 2 |
| `APP._bloomPass` | — *phantom* | 0 | 6 |
| `APP._bmShapeWarned` | `viewer/streaming.js:135` *(as `A.`)* | 1 | 2 |
| `APP._bom` | `viewer/panels.js:1197` *(as `A.`)* | 2 | 19 |
| `APP._bomDb` | `viewer/panels.js:2629` *(as `A.`)* | 1 | 4 |
| `APP._bsDrawErrLogged` | `viewer/maxq_capture_stitch.js:450` *(as `A.`)* | 1 | 2 |
| `APP._buildClashDeepLink` | `viewer/measure.js:834` *(as `A.`)* | 1 | 9 |
| `APP._buildExportHtml` | `viewer/clash_report.js:97` *(as `A.`)* | 1 | 5 |
| `APP._buildGraphRoute` | `viewer/tour.js:471` *(as `A.`)* | 1 | 3 |
| `APP._buildGraphRouteInner` | `viewer/tour.js:482` *(as `A.`)* | 1 | 2 |
| `APP._buildPill` | `viewer/panels.js:2455` *(as `A.`)* | 1 | 7 |
| `APP._buildSunglassPanel` | `viewer/panels.js:325` *(as `A.`)* | 1 | 2 |
| `APP._buildTourInner` | `viewer/tour.js:956` *(as `A.`)* | 1 | 2 |
| `APP._buildingCol` | `viewer/scene.js:1221` *(as `A.`)* | 4 | 8 |
| `APP._burninDatumDir` | `viewer/maxq_start.js:38` *(as `A.`)* | 1 | 10 |
| `APP._burninFrameIdx` | `viewer/maxq_start.js:2126` | 1 | 2 |
| `APP._bvhPending` | `viewer/streaming.js:2469` *(as `A.`)* | 3 | 14 |
| `APP._bvhRunning` | `viewer/streaming.js:2471` *(as `A.`)* | 2 | 7 |
| `APP._cacheDisabled` | `viewer/scene.js:557` *(as `A.`)* | 3 | 8 |
| `APP._cacheEvictable` | `viewer/scene.js:655` *(as `A.`)* | 1 | 2 |
| `APP._cacheHitLogged` | `viewer/scene.js:1766` *(as `A.`)* | 1 | 4 |
| `APP._cacheIssuesForExport` | `viewer/excel.js:9` *(as `A.`)* | 1 | 3 |
| `APP._cachedIssues` | `viewer/excel.js:7` *(as `A.`)* | 3 | 4 |
| `APP._cachedPairCounts` | `viewer/clash_report.js:10` *(as `A.`)* | 4 | 11 |
| `APP._calcGroundY` | `viewer/tools.js:8` *(as `A.`)* | 1 | 8 |
| `APP._camBimSnapshot` | `viewer/sitecam.js:33` *(as `A.`)* | 2 | 4 |
| `APP._camGpsPos` | `viewer/clash_snag.js:19` *(as `A.`)* | 5 | 31 |
| `APP._camHeading` | `viewer/sitecam.js:34` *(as `A.`)* | 3 | 15 |
| `APP._camLight` | — *phantom* | 0 | 14 |
| `APP._camOrientHandler` | `viewer/sitecam.js:35` *(as `A.`)* | 4 | 10 |
| `APP._camPhotoBlob` | `viewer/clash_snag.js:104` *(as `A.`)* | 4 | 4 |
| `APP._camStream` | `viewer/sitecam.js:29` *(as `A.`)* | 3 | 6 |
| `APP._camTimerIv` | `viewer/sitecam.js:32` *(as `A.`)* | 3 | 5 |
| `APP._camTorch` | — *phantom* | 0 | 8 |
| `APP._canvasCoords` | `viewer/sitecam.js:391` *(as `A.`)* | 1 | 3 |
| `APP._canvasPointerDown` | `viewer/picking.js:97` *(as `A.`)* | 4 | 5 |
| `APP._capMarks` | `viewer/maxq_capture_stitch.js:30` | 2 | 5 |
| `APP._capT0` | `viewer/maxq_capture_stitch.js:36` | 1 | 4 |
| `APP._captureCtx` | `viewer/maxq_capture_stitch.js:50` *(as `A.`)* | 1 | 1 |
| `APP._catFirst` | `scripts/probe_dim_catalogue.js:206` *(as `A.`)* | 1 | 2 |
| `APP._cease3DKeptSeen` | `viewer/tests/witness_drawn_film_frame.js:113` *(as `A.`)* | 1 | 1 |
| `APP._cease3DSeen` | `viewer/tests/witness_drawn_film_frame.js:113` *(as `A.`)* | 1 | 1 |
| `APP._chainageDropGuid` | `viewer/tests/witness_chainage_grid.js:95` *(as `A.`)* | 2 | 5 |
| `APP._checkCache` | `viewer/scene.js:764` *(as `A.`)* | 1 | 5 |
| `APP._chromaOf` | `viewer/streaming.js:720` *(as `A.`)* | 1 | 10 |
| `APP._cinemaFanMeshesDebug` | — *phantom* | 0 | 4 |
| `APP._cinemaOrbitActive` | — *phantom* | 0 | 3 |
| `APP._cinemaPathEdit` | `scripts/probe_band_len.js:24` *(as `A.`)* | 21 | 29 |
| `APP._cityAutoLoad` | `viewer/city.js:580` *(as `A.`)* | 1 | 4 |
| `APP._cityBlastDominant` | `viewer/city.js:948` *(as `A.`)* | 1 | 2 |
| `APP._cityBlastDominantFrac` | `viewer/city.js:948` *(as `A.`)* | 1 | 2 |
| `APP._cityBlastNearest` | `viewer/city.js:947` *(as `A.`)* | 1 | 1 |
| `APP._cityBlastNearestDist` | `viewer/city.js:947` *(as `A.`)* | 1 | 1 |
| `APP._cityBlowFarARC` | `viewer/city.js:874` *(as `A.`)* | 1 | 2 |
| `APP._cityBuildingAABB` | `viewer/city.js:436` *(as `A.`)* | 1 | 5 |
| `APP._cityBuildingBytes` | `viewer/city.js:84` *(as `A.`)* | 2 | 9 |
| `APP._cityBuildingElems` | `viewer/city.js:88` *(as `A.`)* | 2 | 11 |
| `APP._cityCounted` | `viewer/city.js:556` *(as `A.`)* | 2 | 2 |
| `APP._cityDiscGate` | `viewer/city.js:581` *(as `A.`)* | 1 | 3 |
| `APP._cityDoneElements` | `viewer/city.js:556` *(as `A.`)* | 2 | 2 |
| `APP._cityElemBudget` | `viewer/city.js:87` *(as `A.`)* | 1 | 3 |
| `APP._cityEvictNonVisible` | `viewer/city.js:235` *(as `A.`)* | 1 | 2 |
| `APP._cityEvictToBudget` | `viewer/city.js:213` *(as `A.`)* | 1 | 2 |
| `APP._cityEvictVictims` | `viewer/city.js:145` *(as `A.`)* | 1 | 4 |
| `APP._cityFacadeTotal` | `viewer/city.js:557` *(as `A.`)* | 1 | 5 |
| `APP._cityFocus` | `viewer/city.js:597` *(as `A.`)* | 2 | 7 |
| `APP._cityFocusSneak` | `viewer/city.js:885` *(as `A.`)* | 1 | 3 |
| `APP._cityFollowHooked` | `viewer/city.js:587` *(as `A.`)* | 1 | 2 |
| `APP._cityGeoBytes` | `viewer/city.js:90` *(as `A.`)* | 1 | 2 |
| `APP._cityHidden` | `viewer/city.js:16` *(as `A.`)* | 4 | 16 |
| `APP._cityHideBuildingBboxes` | `viewer/city.js:17` *(as `A.`)* | 1 | 3 |
| `APP._cityLogMem` | `viewer/city.js:54` *(as `A.`)* | 1 | 3 |
| `APP._cityMemBudgetMB` | `viewer/city.js:86` *(as `A.`)* | 2 | 7 |
| `APP._cityMiss` | `viewer/city.js:240` *(as `A.`)* | 2 | 9 |
| `APP._cityNearestFirst` | `viewer/city.js:898` *(as `A.`)* | 1 | 1 |
| `APP._cityObjBytes` | `viewer/city.js:96` *(as `A.`)* | 1 | 2 |
| `APP._cityOrderBlastHits` | `viewer/city.js:855` *(as `A.`)* | 1 | 2 |
| `APP._cityPendingQueue` | `viewer/city.js:604` *(as `A.`)* | 5 | 12 |
| `APP._cityPreStreamIds` | `viewer/city.js:768` *(as `A.`)* | 2 | 3 |
| `APP._cityRayBlast` | `viewer/city.js:920` *(as `A.`)* | 1 | 2 |
| `APP._cityRayBlastCols` | `viewer/city.js:853` *(as `A.`)* | 1 | 2 |
| `APP._cityRayBlastRows` | `viewer/city.js:854` *(as `A.`)* | 1 | 2 |
| `APP._cityResidentBytes` | `viewer/city.js:105` *(as `A.`)* | 1 | 9 |
| `APP._cityResidentElems` | `viewer/city.js:106` *(as `A.`)* | 1 | 6 |
| `APP._cityResidentOrder` | `viewer/city.js:85` *(as `A.`)* | 2 | 16 |
| `APP._cityRestoreBboxes` | `viewer/city.js:43` *(as `A.`)* | 1 | 2 |
| `APP._cityRestoreBuildingBboxes` | `viewer/city.js:65` *(as `A.`)* | 1 | 1 |
| `APP._citySQL` | `viewer/streaming.js:3687` *(as `A.`)* | 1 | 5 |
| `APP._citySmallFirst` | `viewer/city.js:867` *(as `A.`)* | 1 | 3 |
| `APP._citySmallThreshold` | `viewer/city.js:584` *(as `A.`)* | 1 | 3 |
| `APP._citySneak` | `viewer/city.js:582` *(as `A.`)* | 3 | 19 |
| `APP._citySneakEnabled` | `viewer/city.js:583` *(as `A.`)* | 1 | 1 |
| `APP._citySneakNext` | `viewer/city.js:966` *(as `A.`)* | 1 | 1 |
| `APP._cityStreamNext` | `viewer/city.js:975` *(as `A.`)* | 1 | 6 |
| `APP._cityStreamRows` | `viewer/city.js:957` *(as `A.`)* | 1 | 3 |
| `APP._cityTagAndBudget` | `viewer/city.js:111` *(as `A.`)* | 1 | 3 |
| `APP._civilFastStats` | `viewer/civil_sections.js:110` *(as `A.`)* | 1 | 1 |
| `APP._civilGlowDotTex` | `viewer/tools.js:2087` *(as `A.`)* | 1 | 3 |
| `APP._civilGlowPts` | `viewer/tools.js:2069` *(as `A.`)* | 2 | 12 |
| `APP._civilGlowSync` | `viewer/tools.js:2104` *(as `A.`)* | 1 | 3 |
| `APP._civilLabels` | `viewer/tour.js:827` *(as `A.`)* | 2 | 12 |
| `APP._civilLampGlow` | `viewer/tools.js:2068` *(as `A.`)* | 1 | 3 |
| `APP._civilLens` | `viewer/civil_sections.js:681` *(as `A.`)* | 1 | 8 |
| `APP._civilLensWheel` | `viewer/civil_sections.js:527` *(as `A.`)* | 1 | 2 |
| `APP._civilLive` | `viewer/civil_sections.js:662` *(as `A.`)* | 1 | 13 |
| `APP._civilLiveReopen` | `viewer/civil_sections.js:664` *(as `A.`)* | 1 | 3 |
| `APP._civilLiveReset` | `viewer/civil_sections.js:663` *(as `A.`)* | 1 | 3 |
| `APP._civilModel` | `viewer/streaming.js:328` *(as `A.`)* | 1 | 4 |
| `APP._civilModelDb` | `viewer/streaming.js:328` *(as `A.`)* | 1 | 2 |
| `APP._civilProfileProgress` | `viewer/civil_sections.js:413` *(as `A.`)* | 1 | 2 |
| `APP._civilRayCount` | `viewer/civil_sections.js:114` *(as `A.`)* | 1 | 12 |
| `APP._civilRefLookLogged` | `viewer/streaming.js:2279` *(as `A.`)* | 1 | 2 |
| `APP._civilRouteTour` | `viewer/tour.js:918` *(as `A.`)* | 1 | 3 |
| `APP._civilRowOutline` | `viewer/streaming.js:1509` *(as `A.`)* | 1 | 3 |
| `APP._civilSection` | `viewer/civil_sections.js:169` *(as `A.`)* | 2 | 11 |
| `APP._civilSectionPoll` | `viewer/civil_sections.js:682` *(as `A.`)* | 1 | 1 |
| `APP._civilStd` | `viewer/chainage_grid.js:269` *(as `A.`)* | 3 | 7 |
| `APP._clashBackups` | `viewer/measure.js:625` *(as `A.`)* | 2 | 3 |
| `APP._clashBboxCloud` | `viewer/measure.js:1828` *(as `A.`)* | 2 | 8 |
| `APP._clashBboxMap` | `viewer/measure.js:1880` *(as `A.`)* | 1 | 6 |
| `APP._clashDiscCache` | `viewer/clash_matrix.js:13` *(as `A.`)* | 1 | 7 |
| `APP._clashEnvelopes` | `viewer/clash_matrix.js:342` *(as `A.`)* | 3 | 5 |
| `APP._clashExistsPerPair` | `viewer/measure.js:243` *(as `A.`)* | 1 | 1 |
| `APP._clashFilmUpdateWarned` | `viewer/maxq_start.js:1711` *(as `A.`)* | 1 | 2 |
| `APP._clashHighlights` | `viewer/issues.js:176` *(as `A.`)* | 5 | 18 |
| `APP._clashHudHighlightLast` | `viewer/maxq_start.js:1159` *(as `A.`)* | 5 | 9 |
| `APP._clashIgnoreSet` | `viewer/measure.js:197` *(as `A.`)* | 1 | 4 |
| `APP._clashIndexesReady` | `viewer/measure.js:101` *(as `A.`)* | 2 | 3 |
| `APP._clashLblDrawErrLogged` | `viewer/maxq_capture_stitch.js:262` *(as `A.`)* | 1 | 2 |
| `APP._clashLblErrLogged` | `viewer/maxq_start.js:1703` *(as `A.`)* | 1 | 2 |
| `APP._clashLblStopped` | `viewer/maxq_start.js:856` *(as `A.`)* | 2 | 3 |
| `APP._clashListDiv` | `viewer/measure.js:977` *(as `A.`)* | 5 | 56 |
| `APP._clashListNav` | `viewer/scene.js:2811` *(as `A.`)* | 1 | 4 |
| `APP._clashLodUpdateFreq` | `viewer/measure.js:1829` *(as `A.`)* | 1 | 2 |
| `APP._clashMatrixDiv` | `viewer/clash_matrix.js:248` *(as `A.`)* | 7 | 38 |
| `APP._clashModeActive` | `viewer/measure.js:1827` *(as `A.`)* | 3 | 11 |
| `APP._clashPair` | `viewer/measure.js:648` *(as `A.`)* | 1 | 3 |
| `APP._clashPairBoxTotal` | `viewer/measure.js:507` *(as `A.`)* | 3 | 10 |
| `APP._clashPairKey` | `viewer/measure.js:687` *(as `A.`)* | 2 | 15 |
| `APP._clashPairOffset` | `viewer/clash_matrix.js:291` *(as `A.`)* | 7 | 8 |
| `APP._clashProxMeshes` | `viewer/measure.js:1832` *(as `A.`)* | 4 | 8 |
| `APP._clashProxSet` | `viewer/measure.js:1831` *(as `A.`)* | 3 | 7 |
| `APP._clashRevealActive` | `viewer/measure.js:624` *(as `A.`)* | 4 | 13 |
| `APP._clashRtreeBuilding` | `viewer/measure.js:103` *(as `A.`)* | 6 | 7 |
| `APP._clashRtreeReady` | `viewer/measure.js:102` *(as `A.`)* | 4 | 25 |
| `APP._clashRuleFamily` | `viewer/measure.js:196` *(as `A.`)* | 1 | 5 |
| `APP._clashRules` | `viewer/measure.js:73` *(as `A.`)* | 2 | 4 |
| `APP._clashRulesLoading` | `viewer/measure.js:74` *(as `A.`)* | 4 | 5 |
| `APP._clashSeverity` | `viewer/measure.js:616` *(as `A.`)* | 1 | 7 |
| `APP._clashStatusCycle` | `viewer/measure.js:628` *(as `A.`)* | 1 | 2 |
| `APP._clashStatusKey` | `viewer/measure.js:637` *(as `A.`)* | 1 | 4 |
| `APP._clashStatusStyles` | `viewer/measure.js:629` *(as `A.`)* | 1 | 2 |
| `APP._clashStatuses` | `viewer/measure.js:640` *(as `A.`)* | 4 | 21 |
| `APP._clashTolerance` | `viewer/measure.js:224` *(as `A.`)* | 1 | 6 |
| `APP._clashWhereParts` | `viewer/measure.js:226` *(as `A.`)* | 1 | 12 |
| `APP._clearBboxPlaceholders` | `viewer/streaming.js:600` *(as `A.`)* | 1 | 5 |
| `APP._cloudPlane` | `viewer/scene.js:399` *(as `A.`)* | 1 | 1 |
| `APP._cloudTex` | `viewer/scene.js:400` *(as `A.`)* | 1 | 1 |
| `APP._collectAllMeshes` | `viewer/tools.js:710` *(as `A.`)* | 1 | 9 |
| `APP._colourTruthRollup` | `viewer/streaming.js:1430` *(as `A.`)* | 1 | 3 |
| `APP._composer` | — *phantom* | 0 | 87 |
| `APP._composerEnabled` | `viewer/effects_gi_poc.js:134` *(as `A.`)* | 4 | 9 |
| `APP._compositePhoto` | `viewer/sitecam.js:247` *(as `A.`)* | 1 | 4 |
| `APP._concrete` | — *phantom* | 0 | 2 |
| `APP._concreteStrength` | `viewer/streaming.js:1704` *(as `A.`)* | 1 | 3 |
| `APP._concreteTile` | `viewer/streaming.js:1705` *(as `A.`)* | 1 | 2 |
| `APP._concreteTileM` | — *phantom* | 0 | 2 |
| `APP._connectApplying` | `viewer/main.js:87` | 2 | 3 |
| `APP._consolidateBatched` | `viewer/streaming.js:3584` *(as `A.`)* | 1 | 3 |
| `APP._consolidateOpaqueOnly` | `viewer/maxq_start.js:135` *(as `A.`)* | 1 | 2 |
| `APP._costOdometerFinalFired` | `viewer/cpe_resource_panel.js:233` *(as `A.`)* | 2 | 3 |
| `APP._costOdometerOn` | `viewer/maxq_start.js:964` *(as `A.`)* | 1 | 3 |
| `APP._countClashesAsync` | `viewer/measure.js:495` *(as `A.`)* | 1 | 4 |
| `APP._countClashesRtree` | `viewer/clash_matrix.js:15` *(as `A.`)* | 1 | 4 |
| `APP._cpeAimFreezeOff` | `witness/witness_cpe_corr_brush.js:152` *(as `A.`)* | 6 | 6 |
| `APP._cpeBeat3GazeDebug` | — *phantom* | 0 | 9 |
| `APP._cpeBeat3PoseDebug` | — *phantom* | 0 | 1 |
| `APP._cpeCorrBranchOff` | `witness/witness_cpe_aim_retire.js:322` *(as `A.`)* | 4 | 4 |
| `APP._cpeCorrectionsDebug` | — *phantom* | 0 | 6 |
| `APP._cpeGazeClearDebug` | — *phantom* | 0 | 7 |
| `APP._cpePinZonesDebug` | — *phantom* | 0 | 5 |
| `APP._cpeRevealLightsOff` | `viewer/maxq_start.js:1719` *(as `A.`)* | 1 | 4 |
| `APP._cpeRevealLightsOffLast` | `viewer/maxq_start.js:1721` *(as `A.`)* | 1 | 2 |
| `APP._cpeRevealVisualKey` | — *phantom* | 0 | 4 |
| `APP._cpeViewfinderRender` | — *phantom* | 0 | 6 |
| `APP._createIsSOTrx` | `erp/idempiere.html:5244` | 1 | 1 |
| `APP._createMovementType` | `erp/idempiere.html:5252` | 1 | 1 |
| `APP._csmUncovered` | — *phantom* | 0 | 2 |
| `APP._csvExportInProgress` | `viewer/clash_report.js:9` *(as `A.`)* | 4 | 5 |
| `APP._currentClashPairLabel` | `viewer/clash_matrix.js:313` *(as `A.`)* | 3 | 6 |
| `APP._currentClashRules` | `viewer/issues.js:174` *(as `A.`)* | 5 | 12 |
| `APP._currentClashStorey` | `viewer/measure.js:1721` *(as `A.`)* | 2 | 7 |
| `APP._currentClashViewIdx` | `viewer/measure.js:693` *(as `A.`)* | 1 | 3 |
| `APP._currentClashes` | `viewer/clash_matrix.js:312` *(as `A.`)* | 10 | 43 |
| `APP._dbPersistUrl` | `viewer/streaming.js:3841` *(as `A.`)* | 2 | 14 |
| `APP._debugForceGhostLensOwned` | — *phantom* | 0 | 6 |
| `APP._debugGhostLensOwned` | — *phantom* | 0 | 3 |
| `APP._deepLinkCamOverride` | `viewer/issues.js:182` *(as `A.`)* | 3 | 5 |
| `APP._diffToVoRows` | `viewer/diff.js:350` *(as `A.`)* | 1 | 2 |
| `APP._dimClear` | `scripts/probe_dim_cue_demo.js:116` *(as `A.`)* | 1 | 2 |
| `APP._dimDrawCue` | `scripts/probe_dim_cue_demo.js:90` *(as `A.`)* | 1 | 2 |
| `APP._dimNaNLogged` | `viewer/cpe_flythru_cues.js:422` *(as `A.`)* | 1 | 2 |
| `APP._dimPickTargets` | `scripts/probe_dim_cue_demo.js:75` *(as `A.`)* | 1 | 2 |
| `APP._dimTargetFor` | `scripts/probe_dim_cue_demo.js:42` *(as `A.`)* | 1 | 4 |
| `APP._dismissClashes` | `viewer/measure.js:1206` *(as `A.`)* | 1 | 12 |
| `APP._dlodBboxGeo` | `viewer/scene.js:477` *(as `A.`)* | 1 | 2 |
| `APP._dlodEnabled` | `viewer/dlod.js:14` *(as `A.`)* | 4 | 26 |
| `APP._dlodFrame` | `viewer/dlod.js:15` *(as `A.`)* | 9 | 11 |
| `APP._dlodPaused` | `viewer/dlod.js:16` *(as `A.`)* | 1 | 2 |
| `APP._dlodSlots` | `viewer/streaming.js:20` *(as `A.`)* | 1 | 4 |
| `APP._dlodStillHold` | — *phantom* | 0 | 2 |
| `APP._dlodStillWanted` | `viewer/dlod.js:113` *(as `A.`)* | 1 | 2 |
| `APP._doMeasureClick` | `viewer/measure.js:1318` *(as `A.`)* | 1 | 2 |
| `APP._doReportBug` | `viewer/helpers.js:241` *(as `A.`)* | 1 | 6 |
| `APP._docEnv` | `viewer/doc_canvas.js:566` *(as `A.`)* | 1 | 32 |
| `APP._downloadClashSnag` | `viewer/clash_snag.js:244` *(as `A.`)* | 1 | 4 |
| `APP._downloadRuleReport` | `viewer/rule_checklist.js:350` *(as `A.`)* | 1 | 2 |
| `APP._drawBboxPlaceholders` | `viewer/streaming.js:532` *(as `A.`)* | 1 | 9 |
| `APP._drawMiniQR` | `viewer/sitecam.js:234` *(as `A.`)* | 1 | 2 |
| `APP._drawStroke` | `viewer/sitecam.js:365` *(as `A.`)* | 1 | 3 |
| `APP._driveBtn` | `viewer/sitecam.js:153` *(as `A.`)* | 3 | 13 |
| `APP._driveBtnWasActive` | `viewer/sitecam.js:154` *(as `A.`)* | 2 | 5 |
| `APP._driveHoldCount` | `viewer/walk.js:406` *(as `A.`)* | 2 | 4 |
| `APP._driveHoldInterval` | `viewer/walk.js:405` *(as `A.`)* | 4 | 8 |
| `APP._editedKeys` | `viewer/scene.js:664` *(as `A.`)* | 1 | 2 |
| `APP._egressRulesCache` | — *phantom* | 0 | 2 |
| `APP._egressRulesSource` | — *phantom* | 0 | 1 |
| `APP._elementOverlay` | `viewer/measure.js:1403` *(as `A.`)* | 1 | 4 |
| `APP._elementVariant` | `viewer/streaming.js:819` *(as `A.`)* | 1 | 4 |
| `APP._ensureClashIndexes` | `viewer/measure.js:107` *(as `A.`)* | 1 | 8 |
| `APP._enterClashMode` | `viewer/measure.js:1836` *(as `A.`)* | 1 | 2 |
| `APP._entourageVariant` | `viewer/streaming.js:627` *(as `A.`)* | 1 | 5 |
| `APP._envCache` | — *phantom* | 0 | 2 |
| `APP._envMap` | `viewer/scene.js:251` *(as `A.`)* | 1 | 15 |
| `APP._envMapHdriActive` | — *phantom* | 0 | 3 |
| `APP._envMapThrottle` | `viewer/scene.js:319` *(as `A.`)* | 2 | 4 |
| `APP._envmapStompStats` | `viewer/scene.js:236` *(as `A.`)* | 1 | 1 |
| `APP._escCardDrawErrLogged` | `viewer/maxq_capture_stitch.js:503` *(as `A.`)* | 1 | 2 |
| `APP._escDrawErrLogged` | `viewer/maxq_capture_stitch.js:241` *(as `A.`)* | 1 | 2 |
| `APP._escFrameWarned` | `viewer/maxq_start.js:2282` *(as `A.`)* | 1 | 2 |
| `APP._escLoggedFull` | `viewer/maxq_start.js:2286` *(as `A.`)* | 1 | 2 |
| `APP._escRouteHudSuppress` | `viewer/cpe_escape_route.js:1357` *(as `A.`)* | 2 | 5 |
| `APP._evictOldest` | `viewer/scene.js:692` *(as `A.`)* | 1 | 3 |
| `APP._ewInfer` | `viewer/earthworks_overlay.js:148` *(as `A.`)* | 1 | 1 |
| `APP._ewRowSets` | `viewer/earthworks_overlay.js:193` *(as `A.`)* | 1 | 1 |
| `APP._exitClashMode` | `viewer/measure.js:1927` *(as `A.`)* | 1 | 8 |
| `APP._exportBuildingDb` | `viewer/scene.js:988` *(as `A.`)* | 2 | 19 |
| `APP._exportCSVBackground` | `viewer/clash_report.js:391` *(as `A.`)* | 1 | 5 |
| `APP._exportClashReport` | `viewer/clash_report.js:16` *(as `A.`)* | 1 | 4 |
| `APP._exportInProgress` | `viewer/clash_report.js:8` *(as `A.`)* | 4 | 6 |
| `APP._facadeWarmCool` | `scripts/probe_facade_warm_cool.js:93` | 2 | 2 |
| `APP._fieldTrace` | — *phantom* | 0 | 3 |
| `APP._filmBounceOff` | — *phantom* | 0 | 1 |
| `APP._filmConsolidated` | `viewer/maxq_start.js:135` *(as `A.`)* | 1 | 2 |
| `APP._filmExposureStep` | — *phantom* | 0 | 2 |
| `APP._filmFieldOn` | — *phantom* | 0 | 3 |
| `APP._filmGeomWhole` | `viewer/maxq_start.js:1562` *(as `A.`)* | 1 | 1 |
| `APP._filmGeomWhyLast` | `viewer/maxq_start.js:1563` *(as `A.`)* | 1 | 2 |
| `APP._filmLampDataN` | `viewer/tools.js:2835` *(as `A.`)* | 1 | 1 |
| `APP._filmLayers` | `viewer/cpe_drawn_services.js:45` *(as `A.`)* | 1 | 3 |
| `APP._filmLogCompact` | `viewer/maxq_start.js:47` *(as `A.`)* | 1 | 3 |
| `APP._filmParity` | `viewer/tests/witness_civil_night_lamps.js:114` *(as `A.`)* | 2 | 10 |
| `APP._filmParityStep` | — *phantom* | 0 | 6 |
| `APP._filmWinPullErr` | `viewer/maxq_capture_stitch.js:132` *(as `A.`)* | 1 | 2 |
| `APP._filmWinPullN` | `viewer/maxq_capture_stitch.js:131` *(as `A.`)* | 1 | 2 |
| `APP._findRefreshTree` | — *phantom* | 0 | 8 |
| `APP._findingsHudSuppress` | `viewer/cpe_storey_reveal.js:2469` *(as `A.`)* | 5 | 6 |
| `APP._fixFacePatch` | `viewer/tools.js:1447` *(as `A.`)* | 1 | 2 |
| `APP._fixFaceU` | `viewer/tools.js:1445` *(as `A.`)* | 1 | 6 |
| `APP._fixtureFaceApply` | `viewer/tools.js:1505` *(as `A.`)* | 1 | 1 |
| `APP._fixtureFaceLast` | `viewer/tools.js:1625` *(as `A.`)* | 1 | 1 |
| `APP._fixtureFaceRestore` | `viewer/tools.js:1628` *(as `A.`)* | 1 | 1 |
| `APP._flushBboxBatched` | `viewer/streaming.js:3410` *(as `A.`)* | 1 | 2 |
| `APP._flushInstanced` | `viewer/streaming.js:2823` *(as `A.`)* | 1 | 3 |
| `APP._flyPreparing` | `viewer/tour.js:70` *(as `A.`)* | 3 | 6 |
| `APP._flyToClash` | `viewer/measure.js:690` *(as `A.`)* | 1 | 10 |
| `APP._flyoutBeatsWarned` | `viewer/maxq_capture_stitch.js:226` *(as `A.`)* | 1 | 2 |
| `APP._flythruCueWarned` | `viewer/maxq_start.js:1674` *(as `A.`)* | 1 | 2 |
| `APP._flythruCuesLast` | `viewer/cpe_flythru_cues.js:553` *(as `A.`)* | 1 | 4 |
| `APP._flythruDatumAtWarned` | `viewer/maxq_start.js:1644` *(as `A.`)* | 1 | 2 |
| `APP._flythruDatumLast` | `viewer/cpe_flythru_datum.js:519` *(as `A.`)* | 2 | 7 |
| `APP._flythruDatumOn` | `viewer/maxq_start.js:957` *(as `A.`)* | 1 | 7 |
| `APP._flythruDatumWarned` | `viewer/maxq_capture_stitch.js:181` *(as `A.`)* | 1 | 2 |
| `APP._flythruDimWarned` | `viewer/maxq_capture_stitch.js:192` *(as `A.`)* | 1 | 2 |
| `APP._flythruFilmSec` | `viewer/maxq_start.js:1673` *(as `A.`)* | 2 | 6 |
| `APP._flythruFilmSecFull` | `viewer/maxq_start.js:956` *(as `A.`)* | 1 | 2 |
| `APP._forceNoMerge` | `viewer/streaming.js:526` *(as `A.`)* | 2 | 3 |
| `APP._formatGps` | `viewer/sitecam.js:48` *(as `A.`)* | 1 | 7 |
| `APP._formatIssueGps` | `viewer/issues.js:87` *(as `A.`)* | 1 | 3 |
| `APP._formatTimestamp` | `viewer/sitecam.js:58` *(as `A.`)* | 1 | 8 |
| `APP._frLamps` | `viewer/maxq_start.js:2151` *(as `A.`)* | 1 | 2 |
| `APP._frameQa` | `viewer/maxq_capture_stitch.js:628` *(as `A.`)* | 2 | 12 |
| `APP._freezeAnimKey` | — *phantom* | 0 | 2 |
| `APP._freezePerfOn` | `viewer/maxq_start.js:644` *(as `A.`)* | 1 | 3 |
| `APP._frontSideClasses` | `viewer/streaming.js:1498` *(as `A.`)* | 1 | 3 |
| `APP._getAllIssues` | `viewer/issues.js:56` *(as `A.`)* | 1 | 4 |
| `APP._getCamBimInfo` | `viewer/sitecam.js:37` *(as `A.`)* | 1 | 6 |
| `APP._getCinemaPathEdit` | — *phantom* | 0 | 26 |
| `APP._getImport` | `viewer/import.js:609` *(as `A.`)* | 1 | 7 |
| `APP._getMarkupBlob` | `viewer/sitecam.js:442` *(as `A.`)* | 1 | 6 |
| `APP._getMaterial` | `viewer/streaming.js:1539` *(as `A.`)* | 1 | 17 |
| `APP._getPhotoSkyline` | — *phantom* | 0 | 6 |
| `APP._getStaffageInstances` | — *phantom* | 0 | 8 |
| `APP._ghostAutoHeldLogged` | `viewer/navigate_find.js:61` *(as `A.`)* | 1 | 2 |
| `APP._ghostGlass` | `viewer/ghostglass.js:310` | 1 | 13 |
| `APP._giCaptureErrLogged` | `viewer/maxq_capture_stitch.js:110` *(as `A.`)* | 1 | 2 |
| `APP._giComposer` | `viewer/effects_gi_poc.js:11` *(as `A.`)* | 5 | 15 |
| `APP._giComposerActive` | `viewer/effects_gi_poc.js:12` *(as `A.`)* | 5 | 20 |
| `APP._giFilmArmed` | `viewer/maxq_start.js:1760` *(as `A.`)* | 2 | 4 |
| `APP._giN8aoPass` | `viewer/effects_gi_poc.js:86` *(as `A.`)* | 1 | 14 |
| `APP._glowSpriteCount` | — *phantom* | 0 | 6 |
| `APP._glowSpriteEnabled` | `scripts/probe_glow_sprite.js:112` | 1 | 1 |
| `APP._goldenHue` | `viewer/tools.js:708` *(as `A.`)* | 1 | 2 |
| `APP._grMemo` | `viewer/tour.js:284` *(as `A.`)* | 3 | 7 |
| `APP._gradeOff` | `scripts/probe_grade_hdr.js:37` | 2 | 2 |
| `APP._gradePass` | — *phantom* | 0 | 2 |
| `APP._gridGroup` | — *phantom* | 0 | 1 |
| `APP._gridOverlayState` | `viewer/grid_overlay.js:1896` *(as `A.`)* | 1 | 11 |
| `APP._groundAlbedoGain` | `viewer/tools.js:222` *(as `A.`)* | 1 | 7 |
| `APP._groundCfgDefault` | `viewer/tools.js:175` *(as `A.`)* | 1 | 5 |
| `APP._groundConfig` | `viewer/tools.js:184` *(as `A.`)* | 3 | 9 |
| `APP._groundDetailMean` | `viewer/tools.js:256` *(as `A.`)* | 2 | 7 |
| `APP._groundSolidColor` | `viewer/tools.js:188` *(as `A.`)* | 2 | 5 |
| `APP._groundTexCache` | `viewer/tools.js:185` *(as `A.`)* | 1 | 7 |
| `APP._groundTexKey` | `viewer/tools.js:186` *(as `A.`)* | 2 | 6 |
| `APP._groundUserPicked` | `viewer/tools.js:187` *(as `A.`)* | 2 | 3 |
| `APP._groundWetnessOverride` | — *phantom* | 0 | 2 |
| `APP._groupBy` | `viewer/tools.js:727` *(as `A.`)* | 1 | 17 |
| `APP._guidToMesh` | `viewer/measure.js:1293` *(as `A.`)* | 1 | 1 |
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
| `APP._highlightMesh` | `viewer/measure.js:1551` *(as `A.`)* | 1 | 2 |
| `APP._historyOpened` | `viewer/streaming.js:2522` *(as `A.`)* | 1 | 4 |
| `APP._hoverNameState` | `viewer/hover_name.js:221` *(as `A.`)* | 1 | 4 |
| `APP._hrCost` | `viewer/tm_lifecycle_api.js:421` *(as `app.`)* | 2 | 24 |
| `APP._hudCompositeAlphaSample` | `viewer/maxq_capture_stitch.js:40` *(as `A.`)* | 1 | 2 |
| `APP._hudLayoutFocusWitness` | `viewer/maxq_capture_stitch.js:43` *(as `A.`)* | 1 | 3 |
| `APP._hudLayoutRects` | `viewer/maxq_capture_stitch.js:39` *(as `A.`)* | 3 | 5 |
| `APP._hudLayoutRegister` | `viewer/maxq_capture_stitch.js:41` *(as `A.`)* | 1 | 11 |
| `APP._hudLayoutWitness` | `viewer/maxq_capture_stitch.js:42` *(as `A.`)* | 1 | 5 |
| `APP._hudRowYield` | `viewer/maxq_capture_stitch.js:369` *(as `A.`)* | 2 | 2 |
| `APP._hudRowYieldLogged` | `viewer/maxq_capture_stitch.js:370` *(as `A.`)* | 2 | 3 |
| `APP._hudStackBottom` | `viewer/maxq_capture_stitch.js:614` *(as `A.`)* | 1 | 2 |
| `APP._ilArcOffLast` | `viewer/maxq_start.js:1573` *(as `A.`)* | 1 | 2 |
| `APP._ilBoundaryLogged` | `viewer/maxq_start.js:1538` *(as `A.`)* | 3 | 4 |
| `APP._ilPastStick` | `viewer/maxq_start.js:1506` *(as `A.`)* | 1 | 2 |
| `APP._ilPastTopout` | `viewer/maxq_start.js:1536` *(as `A.`)* | 1 | 1 |
| `APP._ilWitnessKey` | `viewer/maxq_start.js:2176` *(as `A.`)* | 2 | 3 |
| `APP._imHeurLast` | `viewer/tools.js:2797` *(as `A.`)* | 1 | 2 |
| `APP._inLoadPathComposite` | `viewer/maxq_capture_stitch.js:528` *(as `A.`)* | 2 | 2 |
| `APP._indoorBeatsAtWarned` | `viewer/maxq_start.js:1670` *(as `A.`)* | 1 | 2 |
| `APP._indoorBeatsWarned` | `viewer/maxq_capture_stitch.js:220` *(as `A.`)* | 1 | 2 |
| `APP._infoCardDiv` | `viewer/measure.js:1294` *(as `A.`)* | 6 | 11 |
| `APP._initMarkupListeners` | `viewer/sitecam.js:400` *(as `A.`)* | 1 | 3 |
| `APP._initSnagTable` | `viewer/helpers.js:462` *(as `A.`)* | 1 | 3 |
| `APP._instDiscMixed` | `viewer/streaming.js:3060` *(as `A.`)* | 1 | 6 |
| `APP._instDiscUniform` | `viewer/streaming.js:3059` *(as `A.`)* | 1 | 7 |
| `APP._instMepMixed` | `viewer/streaming.js:3023` *(as `A.`)* | 2 | 5 |
| `APP._instMepUniform` | `viewer/streaming.js:3024` *(as `A.`)* | 2 | 5 |
| `APP._instRgbaSplit` | `viewer/streaming.js:2925` *(as `A.`)* | 2 | 9 |
| `APP._installGroundShader` | `viewer/tools.js:257` *(as `A.`)* | 1 | 2 |
| `APP._installMergedRaycast` | `viewer/streaming.js:2760` *(as `A.`)* | 1 | 2 |
| `APP._instanceGuids` | `viewer/streaming.js:519` *(as `A.`)* | 2 | 9 |
| `APP._instanceMeta` | `viewer/streaming.js:518` *(as `A.`)* | 2 | 176 |
| `APP._interiorLightsOff` | `viewer/maxq_start.js:1572` *(as `A.`)* | 3 | 13 |
| `APP._isAuthoredMatName` | `viewer/streaming.js:735` *(as `A.`)* | 1 | 12 |
| `APP._isExporterPlaceholder` | `viewer/streaming.js:741` *(as `A.`)* | 1 | 10 |
| `APP._isMobile` | `viewer/streaming.js:520` *(as `A.`)* | 1 | 21 |
| `APP._isPhotoGlossyMat` | — *phantom* | 0 | 11 |
| `APP._isWebGPU` | `viewer/scene.js:117` *(as `A.`)* | 1 | 3 |
| `APP._isWhiteMat` | `viewer/tools.js:700` *(as `A.`)* | 1 | 1 |
| `APP._issueBackToList` | `viewer/issues.js:237` *(as `A.`)* | 1 | 2 |
| `APP._jsonRegistry` | `viewer/panels.js:2342` *(as `A.`)* | 1 | 2 |
| `APP._lampCapFarM` | `viewer/tools.js:2593` *(as `A.`)* | 4 | 9 |
| `APP._lampCapLast` | `viewer/tools.js:2677` *(as `A.`)* | 1 | 2 |
| `APP._lampCapListLogged` | `viewer/tools.js:2669` *(as `A.`)* | 1 | 2 |
| `APP._lampChurnPrev` | `viewer/tools.js:2915` *(as `A.`)* | 1 | 2 |
| `APP._lampData` | `viewer/sourced_light.js:861` *(as `A.`)* | 4 | 26 |
| `APP._lampDataKey` | `viewer/tools.js:2832` *(as `A.`)* | 1 | 2 |
| `APP._lampDataLastLine` | `viewer/tools.js:2838` *(as `A.`)* | 1 | 2 |
| `APP._lampDataOn` | `viewer/sourced_light.js:861` *(as `A.`)* | 4 | 17 |
| `APP._lampDataUsed` | `viewer/tools.js:2829` *(as `A.`)* | 1 | 1 |
| `APP._lampShadowClear` | `viewer/tools.js:2510` *(as `A.`)* | 1 | 5 |
| `APP._lampShadowKey` | `viewer/tools.js:2509` *(as `A.`)* | 3 | 4 |
| `APP._lampShadowLast` | `viewer/tools.js:2549` *(as `A.`)* | 1 | 2 |
| `APP._lampShadowLights` | `viewer/tools.js:2508` *(as `A.`)* | 2 | 9 |
| `APP._lampShadowPick` | `viewer/tools.js:2516` *(as `A.`)* | 1 | 2 |
| `APP._lampShapeMetrics` | `viewer/tools.js:1408` *(as `A.`)* | 1 | 1 |
| `APP._lampZonePick` | `viewer/tools.js:2481` *(as `A.`)* | 1 | 2 |
| `APP._lampZoneTable` | `viewer/tools.js:2411` *(as `A.`)* | 1 | 3 |
| `APP._lampZoneTableCache` | `viewer/tools.js:2427` *(as `A.`)* | 1 | 2 |
| `APP._lampZoneView` | `viewer/tools.js:2440` *(as `A.`)* | 1 | 2 |
| `APP._lampsSum` | `viewer/maxq_start.js:45` *(as `A.`)* | 3 | 5 |
| `APP._lastClashLodUpdate` | `viewer/measure.js:1830` *(as `A.`)* | 2 | 3 |
| `APP._lastFlushIdx` | `viewer/streaming.js:433` *(as `A.`)* | 4 | 6 |
| `APP._lastGoodFrameBlob` | `viewer/maxq_start.js:2358` *(as `A.`)* | 1 | 3 |
| `APP._lastMeasureItem` | `viewer/measure.js:1492` *(as `A.`)* | 1 | 1 |
| `APP._lastMeasureTap` | `viewer/picking.js:178` *(as `A.`)* | 2 | 4 |
| `APP._lastPickCenter` | `viewer/picking.js:235` *(as `A.`)* | 4 | 4 |
| `APP._lastPickGuid` | `viewer/picking.js:235` *(as `A.`)* | 5 | 7 |
| `APP._ledgerTickerDrawWarned` | `viewer/maxq_capture_stitch.js:535` *(as `A.`)* | 1 | 2 |
| `APP._lensflare` | `viewer/scene.js:448` *(as `A.`)* | 1 | 1 |
| `APP._libHasNormals` | `viewer/streaming.js:18` *(as `A.`)* | 5 | 17 |
| `APP._lightFieldByBuilding` | `viewer/scene.js:2077` *(as `A.`)* | 1 | 3 |
| `APP._lightZoneInnerR` | `viewer/tests/witness_sourced_stack.js:51` | 1 | 3 |
| `APP._linearBeatWarned` | `viewer/maxq_capture_stitch.js:205` *(as `A.`)* | 1 | 2 |
| `APP._loadClashRules` | `viewer/measure.js:76` *(as `A.`)* | 1 | 13 |
| `APP._loadClashStatuses` | `viewer/measure.js:668` *(as `A.`)* | 1 | 2 |
| `APP._loadGroundConfig` | `viewer/tools.js:190` *(as `A.`)* | 1 | 3 |
| `APP._loadNightFixtures` | `viewer/tools.js:1778` *(as `A.`)* | 1 | 3 |
| `APP._loadPathArmFrameThisFrame` | `viewer/maxq_capture_stitch.js:546` *(as `A.`)* | 1 | 2 |
| `APP._loadPathArmFrameTn` | `viewer/maxq_start.js:930` *(as `A.`)* | 1 | 1 |
| `APP._loadPathArmTFilm` | — *phantom* | 0 | 1 |
| `APP._loadPathArmTnMatch` | `viewer/maxq_start.js:930` *(as `A.`)* | 2 | 2 |
| `APP._loadPathDiagRaycast` | — *phantom* | 0 | 4 |
| `APP._loadPathDiagRaycastFired` | `viewer/maxq_capture_stitch.js:148` *(as `A.`)* | 1 | 2 |
| `APP._loadPathDiagSample` | — *phantom* | 0 | 2 |
| `APP._loadPathDrawWarned` | `viewer/maxq_capture_stitch.js:530` *(as `A.`)* | 1 | 2 |
| `APP._loadPathFadeSecFor` | — *phantom* | 0 | 3 |
| `APP._loadPathHoldFrameActive` | `viewer/maxq_start.js:1587` *(as `A.`)* | 1 | 11 |
| `APP._loadPathHudAlpha` | `viewer/maxq_start.js:1600` *(as `A.`)* | 3 | 11 |
| `APP._loadPathInstanceWorldBox` | — *phantom* | 0 | 2 |
| `APP._loadPathMidHoldThisFrame` | `viewer/maxq_capture_stitch.js:550` *(as `A.`)* | 1 | 4 |
| `APP._loadPathReleaseTFilm` | — *phantom* | 0 | 1 |
| `APP._loadPathRestoreCount` | — *phantom* | 0 | 2 |
| `APP._loadPathVisualRev` | — *phantom* | 0 | 2 |
| `APP._loadPathWindow` | — *phantom* | 0 | 12 |
| `APP._loadPrebake` | `viewer/scene.js:2060` *(as `A.`)* | 1 | 3 |
| `APP._loadRemainingStoreys` | `viewer/measure.js:447` *(as `A.`)* | 1 | 3 |
| `APP._longPressFired` | `viewer/measure.js:1260` *(as `A.`)* | 4 | 5 |
| `APP._longPressTimer` | `viewer/measure.js:1259` *(as `A.`)* | 7 | 15 |
| `APP._lp129PostReleaseFrameCount` | `viewer/maxq_capture_stitch.js:577` *(as `A.`)* | 2 | 13 |
| `APP._lpCamDirN` | `viewer/maxq_start.js:2337` *(as `A.`)* | 1 | 5 |
| `APP._lpStackOnly` | — *phantom* | 0 | 1 |
| `APP._mainPillActions` | — *phantom* | 0 | 1 |
| `APP._makeDraggable` | `viewer/measure.js:13` *(as `A.`)* | 1 | 19 |
| `APP._markupActive` | `viewer/sitecam.js:332` *(as `A.`)* | 4 | 6 |
| `APP._markupBaseImage` | `viewer/clash_snag.js:102` *(as `A.`)* | 3 | 4 |
| `APP._markupCanvas` | `viewer/sitecam.js:404` *(as `A.`)* | 1 | 2 |
| `APP._markupColor` | `viewer/sitecam.js:329` *(as `A.`)* | 2 | 3 |
| `APP._markupListenersSet` | `viewer/clash_snag.js:105` *(as `A.`)* | 4 | 5 |
| `APP._markupStart` | `viewer/sitecam.js:333` *(as `A.`)* | 1 | 1 |
| `APP._markupStrokes` | `viewer/clash_snag.js:103` *(as `A.`)* | 3 | 6 |
| `APP._markupTool` | `viewer/sitecam.js:328` *(as `A.`)* | 2 | 8 |
| `APP._matCache` | `viewer/streaming.js:517` *(as `A.`)* | 7 | 53 |
| `APP._matNameCol` | `viewer/streaming.js:288` *(as `A.`)* | 6 | 13 |
| `APP._maxqActive` | `viewer/maxq_start.js:44` *(as `A.`)* | 10 | 43 |
| `APP._measureBoxWarned` | `viewer/maxq_capture_stitch.js:281` *(as `A.`)* | 1 | 2 |
| `APP._measureCardLast` | `viewer/maxq_start.js:855` *(as `A.`)* | 2 | 3 |
| `APP._measureClickTimer` | `viewer/measure.js:1258` *(as `A.`)* | 6 | 14 |
| `APP._measureFirstHit` | `viewer/measure.js:1337` *(as `A.`)* | 1 | 2 |
| `APP._measureFirstMesh` | `viewer/measure.js:1336` *(as `A.`)* | 3 | 3 |
| `APP._measureItem` | `viewer/measure.js:1428` *(as `A.`)* | 1 | 4 |
| `APP._mepDiscAlbedo` | `viewer/streaming.js:914` *(as `A.`)* | 1 | 10 |
| `APP._mepHueClasses` | `viewer/streaming.js:708` *(as `A.`)* | 1 | 5 |
| `APP._mepHueCounts` | `viewer/streaming.js:1881` *(as `A.`)* | 2 | 5 |
| `APP._mepHueDisc` | `viewer/streaming.js:854` *(as `A.`)* | 3 | 4 |
| `APP._mepHueEligible` | `viewer/streaming.js:909` *(as `A.`)* | 1 | 8 |
| `APP._mepHueOff` | `viewer/tests/witness_mep_color_photoreal.js:179` *(as `A.`)* | 5 | 8 |
| `APP._mepHueRollup` | `viewer/streaming.js:1368` *(as `A.`)* | 1 | 3 |
| `APP._mepNameHint` | `viewer/streaming.js:650` *(as `A.`)* | 1 | 8 |
| `APP._mepProxyDisc` | `viewer/streaming.js:908` *(as `A.`)* | 1 | 1 |
| `APP._mepProxyOff` | — *phantom* | 0 | 1 |
| `APP._mepServiceColour` | `viewer/streaming.js:872` *(as `A.`)* | 1 | 4 |
| `APP._mepSmoothDone` | — *phantom* | 0 | 1 |
| `APP._mepSpecificTrade` | `viewer/streaming.js:831` *(as `A.`)* | 1 | 1 |
| `APP._mepTradeHue` | `viewer/streaming.js:833` *(as `A.`)* | 1 | 2 |
| `APP._mergeActive` | `viewer/streaming.js:3323` *(as `A.`)* | 2 | 3 |
| `APP._mergeDbIntoScene` | `viewer/scene.js:1286` *(as `A.`)* | 1 | 5 |
| `APP._mergeLogged` | `viewer/streaming.js:2861` *(as `A.`)* | 2 | 3 |
| `APP._mergeNewGuids` | `viewer/scene.js:1259` *(as `A.`)* | 1 | 3 |
| `APP._mergeOverride` | `viewer/streaming.js:2850` *(as `A.`)* | 1 | 3 |
| `APP._mergePending` | `viewer/scene.js:1396` *(as `A.`)* | 3 | 26 |
| `APP._mergeQueueTopUp` | `viewer/scene.js:1268` *(as `A.`)* | 1 | 3 |
| `APP._mergeSplitDbIntoScene` | `viewer/scene.js:1409` *(as `A.`)* | 1 | 2 |
| `APP._mergeStreamNext` | `viewer/scene.js:1525` *(as `A.`)* | 1 | 5 |
| `APP._mergeTopUp` | `viewer/scene.js:1280` *(as `A.`)* | 1 | 6 |
| `APP._mergedIndex` | `viewer/streaming.js:2719` *(as `A.`)* | 2 | 10 |
| `APP._mergedMeta` | `viewer/streaming.js:2718` *(as `A.`)* | 2 | 44 |
| `APP._mergedRayStats` | `viewer/streaming.js:2722` *(as `A.`)* | 1 | 6 |
| `APP._meshArea` | `viewer/measure.js:1501` *(as `A.`)* | 1 | 4 |
| `APP._meshSlimLoadLogged` | `viewer/streaming.js:2619` *(as `A.`)* | 1 | 2 |
| `APP._meshVolume` | `viewer/measure.js:1542` *(as `A.`)* | 1 | 1 |
| `APP._metaGen` | `viewer/city.js:164` *(as `A.`)* | 5 | 23 |
| `APP._metalPbrLogged` | `viewer/streaming.js:1830` *(as `A.`)* | 1 | 2 |
| `APP._metalPbrOff` | `viewer/streaming.js:832` *(as `A.`)* | 1 | 8 |
| `APP._meterIsolating` | `viewer/sourced_light.js:1510` *(as `A.`)* | 2 | 3 |
| `APP._meterLast` | `viewer/sourced_light.js:1469` *(as `A.`)* | 2 | 9 |
| `APP._meterPrimeForced` | `viewer/sourced_light.js:1557` *(as `A.`)* | 1 | 4 |
| `APP._meterPrimeSkipped` | `viewer/sourced_light.js:1558` *(as `A.`)* | 1 | 4 |
| `APP._meterPrimed` | `viewer/sourced_light.js:1560` *(as `A.`)* | 1 | 2 |
| `APP._mirrorOwnMats` | — *phantom* | 0 | 3 |
| `APP._mobileRenderSkip` | `viewer/main.js:1001` | 2 | 4 |
| `APP._nav` | — *phantom* | 0 | 36 |
| `APP._navLoadedBy` | `viewer/wing_2d.js:224` *(as `A.`)* | 1 | 6 |
| `APP._navigateLoaded` | `viewer/main.js:154` | 3 | 40 |
| `APP._navigatePromise` | `viewer/main.js:157` | 1 | 4 |
| `APP._nightBakePool` | `viewer/tools.js:2564` *(as `A.`)* | 2 | 27 |
| `APP._nightBakeSlotByPos` | `viewer/tools.js:2565` *(as `A.`)* | 2 | 4 |
| `APP._nightControlsListener` | `viewer/tools.js:2246` *(as `A.`)* | 2 | 6 |
| `APP._nightFixtureList` | — *phantom* | 0 | 1 |
| `APP._nightFixturePositions` | `viewer/tools.js:1781` *(as `A.`)* | 3 | 5 |
| `APP._nightFixtureSource` | `viewer/tools.js:2059` *(as `A.`)* | 1 | 4 |
| `APP._nightFixtureWorldPositions` | `viewer/tools.js:2330` *(as `A.`)* | 1 | 21 |
| `APP._nightFixtures` | `viewer/tools.js:1215` *(as `A.`)* | 2 | 25 |
| `APP._nightGlowClasses` | `viewer/tools.js:2160` *(as `A.`)* | 1 | 5 |
| `APP._nightGlowMatKeys` | `viewer/tools.js:2158` *(as `A.`)* | 2 | 7 |
| `APP._nightGlowMats` | `viewer/tools.js:2157` *(as `A.`)* | 2 | 27 |
| `APP._nightGlowMatsDimmed` | `viewer/tools.js:2268` *(as `A.`)* | 2 | 4 |
| `APP._nightLightByPos` | `viewer/tools.js:2299` *(as `A.`)* | 2 | 25 |
| `APP._nightLightDecayDefault` | `viewer/tools.js:1699` *(as `A.`)* | 1 | 1 |
| `APP._nightLights` | `viewer/tools.js:1214` *(as `A.`)* | 5 | 27 |
| `APP._nightMaxLights` | `viewer/tools.js:1238` *(as `A.`)* | 1 | 7 |
| `APP._nightMaxLightsNav` | `viewer/tools.js:1235` *(as `A.`)* | 1 | 2 |
| `APP._nightMaxLightsStill` | `viewer/tools.js:1239` *(as `A.`)* | 1 | 3 |
| `APP._nightMixAmber` | `viewer/tools.js:1277` *(as `A.`)* | 1 | 2 |
| `APP._nightMixBlue` | `viewer/tools.js:1276` *(as `A.`)* | 1 | 3 |
| `APP._nightMode` | `viewer/tools.js:1213` *(as `A.`)* | 2 | 15 |
| `APP._nightNearFadeFloor` | `viewer/tools.js:1241` *(as `A.`)* | 2 | 11 |
| `APP._nightNearFadeFloorStill` | `viewer/tools.js:1242` *(as `A.`)* | 1 | 4 |
| `APP._nightPLScale` | `viewer/tools.js:1251` *(as `A.`)* | 2 | 16 |
| `APP._nightPLScaleStaged` | `viewer/tests/witness_pl_topout_unpin.js:78` *(as `A.`)* | 2 | 8 |
| `APP._nightPLScaleStill` | `viewer/tools.js:1252` *(as `A.`)* | 1 | 2 |
| `APP._nightPadLights` | `viewer/tools.js:2978` *(as `A.`)* | 1 | 5 |
| `APP._nightSaved` | `viewer/tools.js:1216` *(as `A.`)* | 2 | 19 |
| `APP._nightStillBoost` | `viewer/tools.js:1240` *(as `A.`)* | 1 | 4 |
| `APP._nightSyncPads` | `viewer/tools.js:2979` *(as `A.`)* | 1 | 2 |
| `APP._nightUpdateLights` | `viewer/tools.js:2556` *(as `A.`)* | 2 | 13 |
| `APP._nightWindowGlowClasses` | `viewer/tools.js:2195` *(as `A.`)* | 1 | 2 |
| `APP._nlpDiscMap` | `viewer/nlp.js:597` *(as `A.`)* | 1 | 1 |
| `APP._nlpExecute` | `viewer/nlp.js:591` *(as `A.`)* | 1 | 23 |
| `APP._normalsComputed` | `viewer/scene.js:2389` *(as `A.`)* | 2 | 5 |
| `APP._normalsPrecomputed` | `viewer/scene.js:2386` *(as `A.`)* | 2 | 5 |
| `APP._onResize` | `viewer/scene.js:2413` *(as `A.`)* | 1 | 4 |
| `APP._onStreamDone` | `viewer/main.js:930` | 1 | 4 |
| `APP._openDbBytes` | `viewer/scene.js:1541` *(as `A.`)* | 1 | 7 |
| `APP._openIfcFiles` | `viewer/scene.js:1610` *(as `A.`)* | 1 | 5 |
| `APP._openIssuesDB` | `viewer/issues.js:9` *(as `A.`)* | 1 | 7 |
| `APP._openJsonEditor` | `viewer/panels.js:2426` *(as `A.`)* | 1 | 3 |
| `APP._openSplitDbBytes` | `viewer/scene.js:1570` *(as `A.`)* | 1 | 4 |
| `APP._outlinePass` | — *phantom* | 0 | 4 |
| `APP._ovDrawErrLogged` | `viewer/maxq_capture_stitch.js:377` *(as `A.`)* | 1 | 2 |
| `APP._paletteMeshY` | `viewer/tools.js:742` *(as `A.`)* | 1 | 2 |
| `APP._pendingBboxBuckets` | `viewer/streaming.js:2390` *(as `A.`)* | 2 | 9 |
| `APP._pendingClashArgs` | `viewer/measure.js:297` *(as `A.`)* | 2 | 3 |
| `APP._pendingClashSnag` | `viewer/clash_snag.js:8` *(as `A.`)* | 7 | 13 |
| `APP._pendingClashStoreys` | `viewer/measure.js:296` *(as `A.`)* | 3 | 6 |
| `APP._pendingInstances` | `viewer/streaming.js:2664` *(as `A.`)* | 3 | 10 |
| `APP._pendingSnagInfo` | `viewer/sitecam.js:215` *(as `A.`)* | 1 | 3 |
| `APP._photoAutoStageOn` | — *phantom* | 0 | 2 |
| `APP._photoFacadeLightsDbg` | — *phantom* | 0 | 1 |
| `APP._photoFillBase` | — *phantom* | 0 | 4 |
| `APP._photoGroundAlbedoGain` | — *phantom* | 0 | 1 |
| `APP._photoMatteSkyEnv` | — *phantom* | 0 | 1 |
| `APP._photoPaintSeed` | — *phantom* | 0 | 3 |
| `APP._photoPrewarm` | — *phantom* | 0 | 3 |
| `APP._photoStaffageGroup` | — *phantom* | 0 | 2 |
| `APP._photoStagingOn` | — *phantom* | 0 | 9 |
| `APP._pickIsolated` | `viewer/picking.js:20` *(as `A.`)* | 2 | 4 |
| `APP._pieLedgerOn` | `viewer/maxq_start.js:965` *(as `A.`)* | 1 | 3 |
| `APP._plTopoutWant` | — *phantom* | 0 | 6 |
| `APP._placePanel` | `viewer/panels.js:277` *(as `A.`)* | 1 | 4 |
| `APP._placeTable` | `viewer/cpe_sun_compass.js:593` *(as `A.`)* | 3 | 15 |
| `APP._placeTableLoading` | `viewer/cpe_sun_compass.js:597` *(as `A.`)* | 1 | 4 |
| `APP._placeholderOff` | — *phantom* | 0 | 5 |
| `APP._pointerCount` | `viewer/picking.js:113` *(as `A.`)* | 3 | 9 |
| `APP._populateBusy` | — *phantom* | 0 | 2 |
| `APP._porcelainKey` | `viewer/streaming.js:756` *(as `A.`)* | 1 | 7 |
| `APP._porcelainVariant` | `viewer/streaming.js:762` *(as `A.`)* | 1 | 2 |
| `APP._positionRows` | `viewer/streaming.js:3775` *(as `A.`)* | 2 | 8 |
| `APP._prebake` | `viewer/scene.js:2059` *(as `A.`)* | 3 | 9 |
| `APP._prebakeFnv` | `viewer/scene.js:2058` *(as `A.`)* | 1 | 3 |
| `APP._prebakeOut` | `viewer/scene.js:2059` *(as `A.`)* | 1 | 5 |
| `APP._prebakeRecord` | `viewer/scene.js:2074` *(as `A.`)* | 1 | 3 |
| `APP._prepareGraphTour` | `viewer/tour.js:113` *(as `A.`)* | 1 | 2 |
| `APP._probeAimDepth` | — *phantom* | 0 | 7 |
| `APP._proxySubstance` | `viewer/streaming.js:801` *(as `A.`)* | 1 | 2 |
| `APP._proxySubstanceOff` | `viewer/streaming.js:796` *(as `A.`)* | 1 | 3 |
| `APP._proxyVariant` | `viewer/streaming.js:808` *(as `A.`)* | 1 | 3 |
| `APP._qualifyClashRows` | `viewer/measure.js:1199` *(as `A.`)* | 1 | 6 |
| `APP._queryClashes` | `viewer/measure.js:592` *(as `A.`)* | 1 | 1 |
| `APP._queryClashesPair` | `viewer/measure.js:293` *(as `A.`)* | 1 | 5 |
| `APP._queryClashesPairAll` | `viewer/measure.js:555` *(as `A.`)* | 1 | 3 |
| `APP._queryClashesPairRtree` | `viewer/measure.js:360` *(as `A.`)* | 1 | 8 |
| `APP._r10BuildGeo` | `viewer/streaming.js:1159` *(as `A.`)* | 1 | 2 |
| `APP._r10Cost` | `viewer/streaming.js:1288` *(as `A.`)* | 1 | 3 |
| `APP._r10DepthCompiled` | `viewer/streaming.js:1242` *(as `A.`)* | 1 | 3 |
| `APP._r10DepthMat` | `viewer/streaming.js:1246` *(as `A.`)* | 1 | 11 |
| `APP._r10DepthMaterial` | `viewer/streaming.js:1232` *(as `A.`)* | 1 | 3 |
| `APP._r10Eligible` | `viewer/streaming.js:1112` *(as `A.`)* | 1 | 2 |
| `APP._r10GeoCache` | `viewer/streaming.js:1109` *(as `A.`)* | 2 | 5 |
| `APP._r10Guids` | `viewer/streaming.js:1111` *(as `A.`)* | 2 | 6 |
| `APP._r10MatArray` | `viewer/streaming.js:1199` *(as `A.`)* | 1 | 5 |
| `APP._r10MatCache` | `viewer/streaming.js:1217` *(as `A.`)* | 2 | 5 |
| `APP._r10Materials` | `viewer/streaming.js:1218` *(as `A.`)* | 1 | 2 |
| `APP._r10PaneAlpha` | `viewer/streaming.js:1125` *(as `A.`)* | 1 | 3 |
| `APP._r10Report` | `viewer/streaming.js:1249` *(as `A.`)* | 1 | 3 |
| `APP._r10ShadowReport` | `viewer/streaming.js:1270` *(as `A.`)* | 1 | 4 |
| `APP._r10Split` | `viewer/streaming.js:1141` *(as `A.`)* | 1 | 2 |
| `APP._r10St` | `viewer/streaming.js:1117` *(as `A.`)* | 1 | 5 |
| `APP._r10State` | `viewer/streaming.js:1110` *(as `A.`)* | 3 | 6 |
| `APP._rangeDb` | — *phantom* | 0 | 8 |
| `APP._rayAABB` | `viewer/city.js:909` *(as `A.`)* | 1 | 2 |
| `APP._recolorMesh` | `viewer/tools.js:717` *(as `A.`)* | 1 | 8 |
| `APP._redrawMarkup` | `viewer/sitecam.js:358` *(as `A.`)* | 1 | 4 |
| `APP._refreshClashList` | `viewer/measure.js:1190` *(as `A.`)* | 1 | 7 |
| `APP._refreshGroundBtns` | `viewer/panels.js:1738` *(as `A.`)* | 1 | 5 |
| `APP._registerBatchSlot` | `viewer/streaming.js:2739` *(as `A.`)* | 1 | 4 |
| `APP._registerInstanceSlot` | `viewer/streaming.js:2815` *(as `A.`)* | 1 | 3 |
| `APP._registerPanel` | `viewer/scene.js:3595` *(as `A.`)* | 1 | 1 |
| `APP._renderClashList` | `viewer/measure.js:884` *(as `A.`)* | 1 | 8 |
| `APP._renderIssueList` | `viewer/issues.js:95` *(as `A.`)* | 1 | 4 |
| `APP._renderSnagStamps` | `viewer/helpers.js:481` *(as `A.`)* | 1 | 3 |
| `APP._repairDegenerateNormals` | `viewer/streaming.js:2336` *(as `A.`)* | 1 | 1 |
| `APP._reportPairCounts` | `viewer/clash_report.js:11` *(as `A.`)* | 3 | 3 |
| `APP._resDrawErrLogged` | `viewer/maxq_capture_stitch.js:468` *(as `A.`)* | 1 | 2 |
| `APP._resHoldFrames` | `viewer/cpe_resource_panel.js:410` *(as `A.`)* | 2 | 7 |
| `APP._resHoldLogged` | `viewer/cpe_resource_panel.js:405` *(as `A.`)* | 2 | 3 |
| `APP._resPanelClRows` | `viewer/cpe_resource_panel.js:922` *(as `A.`)* | 2 | 2 |
| `APP._resPanelFrames` | `viewer/maxq_capture_stitch.js:464` *(as `A.`)* | 2 | 5 |
| `APP._resPanelOps` | `viewer/cpe_resource_panel.js:56` *(as `A.`)* | 1 | 3 |
| `APP._resPanelProjectEnd` | `viewer/cpe_resource_panel.js:56` *(as `A.`)* | 1 | 3 |
| `APP._resPanelProjectStart` | `viewer/cpe_resource_panel.js:56` *(as `A.`)* | 1 | 3 |
| `APP._resPanelRowFontPx` | `viewer/cpe_resource_panel.js:1514` *(as `A.`)* | 1 | 1 |
| `APP._resPanelShownRows` | `viewer/cpe_resource_panel.js:922` *(as `A.`)* | 2 | 2 |
| `APP._resWhyLogged` | `viewer/cpe_resource_panel.js:86` *(as `A.`)* | 1 | 2 |
| `APP._resetAllVisibility` | — *phantom* | 0 | 2 |
| `APP._resourcePanelBox` | `viewer/cpe_resource_panel.js:337` *(as `A.`)* | 1 | 1 |
| `APP._resourcePanelCostLedgerRowsData` | `viewer/cpe_resource_panel.js:272` *(as `A.`)* | 1 | 1 |
| `APP._resourcePanelFit` | `viewer/cpe_resource_panel.js:334` *(as `A.`)* | 1 | 1 |
| `APP._resourcePanelPieCostLedgerRows` | `viewer/cpe_resource_panel.js:333` *(as `A.`)* | 1 | 1 |
| `APP._resourcePanelResetMaxRowsCache` | `viewer/cpe_resource_panel.js:142` *(as `A.`)* | 1 | 1 |
| `APP._resourcePanelScanMaxRows` | `viewer/cpe_resource_panel.js:141` *(as `A.`)* | 1 | 1 |
| `APP._restoreIsolation` | `viewer/picking.js:42` *(as `A.`)* | 1 | 1 |
| `APP._restoreSunglass` | `viewer/tools.js:695` *(as `A.`)* | 1 | 2 |
| `APP._revalidateCache` | `viewer/scene.js:1696` *(as `A.`)* | 1 | 2 |
| `APP._revealClashes` | `viewer/measure.js:856` *(as `A.`)* | 1 | 5 |
| `APP._riN` | `viewer/maxq_capture_stitch.js:94` *(as `A.`)* | 1 | 4 |
| `APP._roadPanelTn` | `viewer/maxq_start.js:1489` *(as `A.`)* | 3 | 5 |
| `APP._roadPanelsWarned` | `viewer/maxq_capture_stitch.js:524` *(as `A.`)* | 1 | 2 |
| `APP._roadReport` | `viewer/road_report.js:171` *(as `A.`)* | 1 | 4 |
| `APP._roadReportText` | `viewer/road_report.js:209` *(as `A.`)* | 1 | 2 |
| `APP._roadStdResult` | `viewer/road_standards.js:136` *(as `A.`)* | 1 | 1 |
| `APP._roadStdStd` | `viewer/road_standards.js:136` *(as `A.`)* | 1 | 1 |
| `APP._roleFilterIdx` | `viewer/panels.js:819` *(as `A.`)* | 2 | 11 |
| `APP._roleFilterLabel` | `viewer/panels.js:832` *(as `A.`)* | 1 | 3 |
| `APP._roomCycle` | `viewer/scene.js:2620` *(as `A.`)* | 1 | 1 |
| `APP._rowOutlines` | `viewer/streaming.js:1517` *(as `A.`)* | 2 | 10 |
| `APP._ruleChecklistActiveCategory` | `viewer/rule_checklist.js:321` *(as `A.`)* | 3 | 6 |
| `APP._ruleChecklistConfig` | `viewer/rule_checklist.js:320` *(as `A.`)* | 2 | 7 |
| `APP._ruleChecklistOpeners` | `viewer/rule_checklist.js:318` *(as `A.`)* | 1 | 6 |
| `APP._ruleFilmLastBoxPin` | `viewer/rule_findings_film.js:674` *(as `A.`)* | 1 | 1 |
| `APP._ruleFilmLastWave` | `viewer/rule_findings_film.js:582` *(as `A.`)* | 1 | 3 |
| `APP._ruleFilmLive` | `viewer/rule_findings_film.js:441` *(as `A.`)* | 2 | 4 |
| `APP._ruleFilmQueue` | `viewer/rule_findings_film.js:513` *(as `A.`)* | 1 | 1 |
| `APP._ruleFindingsFilmWarned` | `viewer/maxq_capture_stitch.js:232` *(as `A.`)* | 1 | 2 |
| `APP._ruleOverlay` | `viewer/rule_checklist.js:806` *(as `A.`)* | 1 | 4 |
| `APP._ruleProvenance` | `viewer/rule_checklist.js:806` *(as `A.`)* | 1 | 4 |
| `APP._ruleTintActive` | `viewer/rule_checklist.js:530` *(as `A.`)* | 3 | 5 |
| `APP._ruleTintAt` | `viewer/rule_checklist.js:608` *(as `A.`)* | 2 | 4 |
| `APP._ruleTintMeshes` | `viewer/rule_checklist.js:529` *(as `A.`)* | 3 | 11 |
| `APP._runSqlChunked` | `viewer/scene.js:2017` *(as `A.`)* | 1 | 3 |
| `APP._saveClashIssue` | `viewer/clash_snag.js:260` *(as `A.`)* | 1 | 4 |
| `APP._saveClashStatuses` | `viewer/measure.js:684` *(as `A.`)* | 1 | 2 |
| `APP._saveIssueToLog` | `viewer/issues.js:24` *(as `A.`)* | 1 | 3 |
| `APP._savedClearColor` | `viewer/tools.js:1188` *(as `A.`)* | 2 | 4 |
| `APP._savedGroundColor` | `viewer/tools.js:1196` *(as `A.`)* | 1 | 3 |
| `APP._sceneBorrowed` | `viewer/gi_still.js:813` | 4 | 6 |
| `APP._scrubHide` | `viewer/tour.js:2041` *(as `A.`)* | 1 | 11 |
| `APP._scrubShow` | `viewer/tour.js:2031` *(as `A.`)* | 1 | 7 |
| `APP._scrubStop` | `viewer/tour.js:2052` *(as `A.`)* | 1 | 5 |
| `APP._scrubVisible` | `viewer/tour.js:2027` *(as `A.`)* | 1 | 9 |
| `APP._secMode` | `viewer/tools.js:484` *(as `A.`)* | 3 | 9 |
| `APP._sectionNav` | `viewer/panels.js:683` *(as `A.`)* | 1 | 3 |
| `APP._setGroundColor` | `viewer/tools.js:223` *(as `A.`)* | 1 | 9 |
| `APP._setGroundWetness` | — *phantom* | 0 | 2 |
| `APP._setRuleChecklistCategory` | `viewer/rule_checklist.js:517` *(as `A.`)* | 1 | 4 |
| `APP._setTreeMode` | — *phantom* | 0 | 2 |
| `APP._shadowFollowEnv` | `viewer/tools.js:1092` *(as `A.`)* | 1 | 2 |
| `APP._shadowFollowFn` | `viewer/tools.js:1122` *(as `A.`)* | 2 | 7 |
| `APP._shadowGroundKey` | `viewer/tools.js:1027` *(as `A.`)* | 2 | 7 |
| `APP._shadowInited` | `viewer/tools.js:1053` *(as `A.`)* | 1 | 2 |
| `APP._shadowOn` | `viewer/tools.js:1026` *(as `A.`)* | 2 | 19 |
| `APP._shareClashSnag` | `viewer/clash_snag.js:115` *(as `A.`)* | 1 | 4 |
| `APP._shareLoaded` | `viewer/import.js:614` *(as `A.`)* | 1 | 2 |
| `APP._shellTrace` | — *phantom* | 0 | 1 |
| `APP._show4DWindow` | — *phantom* | 0 | 7 |
| `APP._showClashMatrix` | `viewer/clash_matrix.js:88` *(as `A.`)* | 1 | 5 |
| `APP._showIssueDetail` | `viewer/issues.js:130` *(as `A.`)* | 1 | 2 |
| `APP._showMergeModal` | `viewer/scene.js:1077` *(as `A.`)* | 1 | 3 |
| `APP._singleBuildingName` | `viewer/streaming.js:276` *(as `A.`)* | 1 | 8 |
| `APP._sky` | `viewer/scene.js:270` *(as `A.`)* | 1 | 57 |
| `APP._skyPortalLast` | `viewer/sky_portal.js:147` *(as `A.`)* | 2 | 2 |
| `APP._slForcePZ` | `viewer/tests/witness_sourced_crosswall.js:41` *(as `A.`)* | 2 | 5 |
| `APP._slLastOrder` | `viewer/sourced_light.js:898` *(as `A.`)* | 1 | 3 |
| `APP._slabBeatAtWarned` | `viewer/maxq_start.js:1653` *(as `A.`)* | 1 | 2 |
| `APP._slabBeatWarned` | `viewer/maxq_capture_stitch.js:214` *(as `A.`)* | 1 | 2 |
| `APP._snagClash` | `viewer/clash_snag.js:11` *(as `A.`)* | 1 | 2 |
| `APP._snagGroup` | `viewer/helpers.js:479` *(as `A.`)* | 2 | 9 |
| `APP._snagObserver` | `viewer/sitecam.js:22` *(as `A.`)* | 1 | 2 |
| `APP._solidMeshes` | — *phantom* | 0 | 5 |
| `APP._sourcedCap` | `viewer/sourced_light.js:989` *(as `A.`)* | 3 | 27 |
| `APP._sourcedZoneAt` | `viewer/tests/witness_sourced_stack.js:56` *(as `A.`)* | 1 | 1 |
| `APP._speedZones` | `viewer/speed_zones.js:576` *(as `A.`)* | 2 | 19 |
| `APP._speedZonesTint` | `viewer/speed_zones.js:376` *(as `A.`)* | 2 | 3 |
| `APP._splitHasMeta` | `viewer/streaming.js:3835` *(as `A.`)* | 4 | 7 |
| `APP._ssaoPass` | — *phantom* | 0 | 7 |
| `APP._ssgiActive` | `viewer/effects_gi_poc.js:140` *(as `A.`)* | 4 | 17 |
| `APP._ssgiEffect` | `viewer/effects_gi_poc.js:315` *(as `A.`)* | 1 | 13 |
| `APP._startFlyTour` | `viewer/tour.js:313` *(as `A.`)* | 1 | 3 |
| `APP._statTailFrames` | `viewer/maxq_start.js:854` *(as `A.`)* | 2 | 6 |
| `APP._statTailLogged` | `viewer/maxq_start.js:854` *(as `A.`)* | 2 | 3 |
| `APP._statTailRosterLogged` | `viewer/maxq_start.js:2071` *(as `A.`)* | 1 | 2 |
| `APP._statusBoxWarned` | `viewer/maxq_capture_stitch.js:491` *(as `A.`)* | 1 | 2 |
| `APP._stdMatClasses` | `viewer/streaming.js:1808` *(as `A.`)* | 1 | 6 |
| `APP._stillAo` | — *phantom* | 0 | 3 |
| `APP._stillBounceGain` | `viewer/tests/witness_gi_gain_dial.js:34` | 3 | 5 |
| `APP._stillBudget` | `viewer/maxq_infra.js:51` | 3 | 7 |
| `APP._stillCalibOn` | — *phantom* | 0 | 1 |
| `APP._stillCalibSunI` | — *phantom* | 0 | 12 |
| `APP._stillCalibSunLux` | — *phantom* | 0 | 9 |
| `APP._stillCamInsideNow` | — *phantom* | 0 | 4 |
| `APP._stillCapCentre` | — *phantom* | 0 | 1 |
| `APP._stillCarryLast` | `viewer/gi_still.js:916` *(as `A.`)* | 1 | 1 |
| `APP._stillCascadeExtraUnits` | — *phantom* | 0 | 1 |
| `APP._stillContact` | — *phantom* | 0 | 1 |
| `APP._stillCove` | `viewer/sourced_light.js:1312` | 1 | 2 |
| `APP._stillCullOff` | `viewer/tests/witness_still_shadow_fit.js:48` *(as `A.`)* | 1 | 1 |
| `APP._stillFaultGiLast` | `viewer/gi_still.js:1010` *(as `A.`)* | 1 | 2 |
| `APP._stillFaultLast` | `viewer/still_fault.js:187` *(as `A.`)* | 1 | 2 |
| `APP._stillFixFace` | `viewer/tools.js:1509` | 1 | 2 |
| `APP._stillFixNonLum` | — *phantom* | 0 | 1 |
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
| `APP._stillGroundMode` | — *phantom* | 0 | 1 |
| `APP._stillGroundView` | `viewer/sourced_light.js:1090` | 1 | 2 |
| `APP._stillIr` | — *phantom* | 0 | 1 |
| `APP._stillIrColour` | — *phantom* | 0 | 1 |
| `APP._stillIrc` | — *phantom* | 0 | 1 |
| `APP._stillLampCap` | `viewer/sky_portal.js:134` *(as `A.`)* | 2 | 22 |
| `APP._stillLampCapNearest` | — *phantom* | 0 | 1 |
| `APP._stillLampData` | — *phantom* | 0 | 1 |
| `APP._stillLampDecayNow` | — *phantom* | 0 | 2 |
| `APP._stillLampEn` | — *phantom* | 0 | 1 |
| `APP._stillLampMul` | — *phantom* | 0 | 2 |
| `APP._stillLampRangeNow` | — *phantom* | 0 | 2 |
| `APP._stillLampShadow` | — *phantom* | 0 | 2 |
| `APP._stillLampsOff` | — *phantom* | 0 | 8 |
| `APP._stillLocalExp` | — *phantom* | 0 | 2 |
| `APP._stillLockOn` | — *phantom* | 0 | 6 |
| `APP._stillMeter` | — *phantom* | 0 | 2 |
| `APP._stillMeterMode` | — *phantom* | 0 | 1 |
| `APP._stillObjContact` | — *phantom* | 0 | 2 |
| `APP._stillPortalSort` | — *phantom* | 0 | 1 |
| `APP._stillPortalsKeep` | — *phantom* | 0 | 1 |
| `APP._stillPoseLast` | — *phantom* | 0 | 5 |
| `APP._stillRefineActive` | `viewer/tests/witness_sun_fill_ratio.js:369` *(as `A.`)* | 4 | 74 |
| `APP._stillRefineBusy` | `viewer/effects_gi_poc.js:559` *(as `A.`)* | 1 | 32 |
| `APP._stillRes` | `viewer/tests/witness_still_res.js:24` | 1 | 1 |
| `APP._stillResPreset` | — *phantom* | 0 | 2 |
| `APP._stillSSGIEnabled` | `viewer/effects_gi_poc.js:541` *(as `A.`)* | 1 | 2 |
| `APP._stillShadowFit` | `viewer/fx_photo_staging.js:529` | 2 | 2 |
| `APP._stillShadowRadius` | `viewer/tests/witness_still_shadow_fit.js:49` | 1 | 2 |
| `APP._stillShadowWide` | — *phantom* | 0 | 6 |
| `APP._stillShapeColour` | — *phantom* | 0 | 1 |
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
| `APP._stillUnlitPts` | `viewer/still_fault.js:187` *(as `A.`)* | 1 | 1 |
| `APP._stillWindowGlowOff` | `viewer/tests/witness_civil_night_lamps.js:119` *(as `A.`)* | 2 | 6 |
| `APP._stillWindowPull` | `viewer/gi_still.js:1093` | 1 | 2 |
| `APP._stillZoneEye` | `viewer/sourced_light.js:1418` | 1 | 2 |
| `APP._storeyCutCeilY` | `viewer/cpe_storey_reveal.js:2263` *(as `A.`)* | 2 | 5 |
| `APP._storeyOrdinalKeys` | `viewer/tools.js:764` *(as `A.`)* | 1 | 4 |
| `APP._storeyRevealArmed` | `viewer/cpe_storey_reveal.js:2321` *(as `A.`)* | 5 | 6 |
| `APP._storeyVisible` | `viewer/panels.js:719` *(as `A.`)* | 1 | 19 |
| `APP._streamPaused` | `viewer/streaming.js:2554` *(as `A.`)* | 2 | 3 |
| `APP._streaming` | — *phantom* | 0 | 1 |
| `APP._structuralRulesCache` | — *phantom* | 0 | 2 |
| `APP._structuralRulesSource` | — *phantom* | 0 | 1 |
| `APP._sunArcElevationDeg` | `viewer/tests/witness_sun_arc_linear.js:63` *(as `A.`)* | 1 | 4 |
| `APP._sunArcFillPin` | `viewer/tests/tap_sun_arc_fill.js:33` *(as `A.`)* | 1 | 7 |
| `APP._sunArcStep` | — *phantom* | 0 | 10 |
| `APP._sunClockWarned` | `viewer/maxq_capture_stitch.js:402` *(as `A.`)* | 1 | 2 |
| `APP._sunCompassAtWarned` | `viewer/maxq_start.js:1476` *(as `A.`)* | 1 | 2 |
| `APP._sunCompassDrawWarned` | `viewer/maxq_capture_stitch.js:414` *(as `A.`)* | 1 | 2 |
| `APP._sunCompassOn` | `viewer/maxq_start.js:979` *(as `A.`)* | 4 | 13 |
| `APP._sunCycleActive` | — *phantom* | 0 | 1 |
| `APP._sunShadowRestoreEnabled` | `viewer/fx_still_refine.js:435` | 1 | 1 |
| `APP._sunglassBackups` | `viewer/tools.js:678` *(as `A.`)* | 3 | 16 |
| `APP._sunglassNav` | `viewer/panels.js:699` *(as `A.`)* | 1 | 3 |
| `APP._surfBuildRoof` | `viewer/streaming.js:993` *(as `A.`)* | 1 | 2 |
| `APP._surfRoofGuids` | `viewer/streaming.js:992` *(as `A.`)* | 3 | 8 |
| `APP._surfRowFor` | `viewer/streaming.js:1065` *(as `A.`)* | 1 | 8 |
| `APP._surfRowOf` | `viewer/streaming.js:1045` *(as `A.`)* | 1 | 2 |
| `APP._surfRules` | `viewer/streaming.js:968` *(as `A.`)* | 2 | 12 |
| `APP._surfSubstance` | `viewer/streaming.js:973` *(as `A.`)* | 1 | 5 |
| `APP._surfTally` | `viewer/streaming.js:1081` *(as `A.`)* | 1 | 3 |
| `APP._surfTallyData` | `viewer/streaming.js:1064` *(as `A.`)* | 2 | 4 |
| `APP._swCacheVersion` | — *phantom* | 0 | 1 |
| `APP._szPrewarmed` | `viewer/speed_zones.js:561` *(as `A.`)* | 1 | 2 |
| `APP._taaPass` | — *phantom* | 0 | 21 |
| `APP._teardownStillRefine` | — *phantom* | 0 | 2 |
| `APP._tmComposeSnapshot` | `viewer/share.js:370` *(as `A.`)* | 1 | 2 |
| `APP._tmIsVisible` | `viewer/tests/witness_clash_film_markers.js:64` *(as `A.`)* | 1 | 7 |
| `APP._tmOn` | `viewer/tm_lifecycle_api.js:544` *(as `app.`)* | 2 | 16 |
| `APP._tmSnapshotCaption` | `viewer/share.js:358` *(as `A.`)* | 1 | 2 |
| `APP._tmState` | — *phantom* | 0 | 3 |
| `APP._tmUnmergeTried` | `viewer/tm_lifecycle_api.js:308` *(as `app.`)* | 1 | 2 |
| `APP._toggleClashStatus` | `viewer/measure.js:1136` *(as `A.`)* | 1 | 3 |
| `APP._toolbarNav` | `viewer/panels.js:668` *(as `A.`)* | 1 | 3 |
| `APP._tourCacheBust` | `viewer/tour.js:274` *(as `A.`)* | 1 | 5 |
| `APP._tourCachedRoute` | `viewer/tour.js:91` *(as `A.`)* | 3 | 8 |
| `APP._tourPaused` | `viewer/tour.js:363` *(as `A.`)* | 4 | 17 |
| `APP._tourPrepare` | `viewer/tour.js:1548` *(as `A.`)* | 1 | 2 |
| `APP._tourStarts` | `viewer/tour.js:1553` *(as `A.`)* | 1 | 27 |
| `APP._tourStoreyZ` | `viewer/tour.js:457` *(as `A.`)* | 1 | 3 |
| `APP._tourT` | `viewer/tour.js:1565` *(as `A.`)* | 4 | 21 |
| `APP._tourTotal` | `viewer/tour.js:1564` *(as `A.`)* | 1 | 27 |
| `APP._triActiveFor` | `viewer/streaming.js:957` *(as `A.`)* | 1 | 3 |
| `APP._triBigOnly` | `viewer/streaming.js:956` *(as `A.`)* | 1 | 5 |
| `APP._triNormalOff` | `witness/witness_triplanar_normal.js:47` | 1 | 2 |
| `APP._triResolve` | `viewer/streaming.js:1297` *(as `A.`)* | 1 | 6 |
| `APP._triSrcTally` | `viewer/streaming.js:1311` *(as `A.`)* | 1 | 3 |
| `APP._triplanarLoader` | `viewer/streaming.js:2029` *(as `A.`)* | 1 | 3 |
| `APP._triplanarMaterials` | `viewer/streaming.js:2211` *(as `A.`)* | 1 | 8 |
| `APP._triplanarTexCache` | `viewer/streaming.js:2028` *(as `A.`)* | 1 | 5 |
| `APP._updateCamLight` | — *phantom* | 0 | 2 |
| `APP._updateCamTorch` | — *phantom* | 0 | 2 |
| `APP._updateClashLOD` | `viewer/measure.js:1965` *(as `A.`)* | 1 | 3 |
| `APP._updateFacadeFacing` | — *phantom* | 0 | 2 |
| `APP._updateFogDensity` | `viewer/scene.js:145` *(as `A.`)* | 1 | 9 |
| `APP._useDlodPath` | `viewer/streaming.js:19` *(as `A.`)* | 3 | 7 |
| `APP._useRangeStream` | — *phantom* | 0 | 5 |
| `APP._visibilityGen` | `viewer/panels.js:746` *(as `A.`)* | 3 | 6 |
| `APP._voToErp` | `viewer/diff.js:391` *(as `A.`)* | 1 | 2 |
| `APP._w2dLastOffer` | `viewer/wing_2d.js:36` *(as `A.`)* | 1 | 2 |
| `APP._w2dStoreys` | `viewer/wing_2d.js:32` *(as `A.`)* | 1 | 4 |
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
| `APP._whiteBg` | `viewer/tools.js:1187` *(as `A.`)* | 2 | 11 |
| `APP._winCtx` | `erp/idempiere.html:5542` | 1 | 1 |
| `APP._windBuckets` | `viewer/streaming.js:1501` *(as `A.`)* | 1 | 4 |
| `APP._windFlip` | `viewer/still_fault.js:186` | 1 | 2 |
| `APP._windFlipAny` | `viewer/streaming.js:1501` *(as `A.`)* | 1 | 4 |
| `APP._windStat` | `viewer/scene.js:2370` *(as `A.`)* | 1 | 8 |
| `APP._windTable` | `viewer/scene.js:2330` *(as `A.`)* | 2 | 5 |
| `APP._windTableGet` | `viewer/scene.js:2329` *(as `A.`)* | 1 | 5 |
| `APP._wing2d` | `viewer/wing_2d.js:327` *(as `A.`)* | 1 | 8 |
| `APP._wireListKeyNav` | `viewer/panels.js:662` *(as `A.`)* | 1 | 3 |
| `APP._wizardLoaded` | `viewer/main.js:292` | 3 | 3 |
| `APP._wizardPromise` | `viewer/main.js:295` | 1 | 4 |
| `APP._wlog` | `viewer/picking.js:88` *(as `A.`)* | 1 | 3 |
| `APP.a` | — *phantom* | 0 | 2 |
| `APP.activeBuilding` | `viewer/city.js:793` *(as `A.`)* | 9 | 321 |
| `APP.activeBuildingTotal` | `viewer/city.js:794` *(as `A.`)* | 9 | 19 |
| `APP.activeGuidFilter` | `viewer/panels.js:863` *(as `A.`)* | 1 | 13 |
| `APP.activeStoreyFilter` | `viewer/main.js:1208` | 4 | 30 |
| `APP.actor` | `erp/idempiere.html:1501` | 3 | 54 |
| `APP.addQRBorder` | `viewer/helpers.js:412` *(as `A.`)* | 1 | 2 |
| `APP.advanceNavStep` | — *phantom* | 0 | 2 |
| `APP.advanceWalkStep` | `viewer/walk.js:458` *(as `A.`)* | 1 | 5 |
| `APP.allBuildingCards` | `viewer/panels.js:916` *(as `A.`)* | 2 | 5 |
| `APP.allRoomVolumes` | `witness/witness_escape_colours.js:37` *(as `A.`)* | 2 | 15 |
| `APP.ambient` | `viewer/scene.js:212` *(as `A.`)* | 1 | 24 |
| `APP.applicable` | — *phantom* | 0 | 2 |
| `APP.applyDefaultGroundTexture` | `viewer/tools.js:361` *(as `A.`)* | 1 | 1 |
| `APP.applyDiffOverlay` | `viewer/diff.js:56` *(as `A.`)* | 1 | 4 |
| `APP.applyFindScope` | — *phantom* | 0 | 8 |
| `APP.applySectionAxis` | `viewer/tools.js:540` *(as `A.`)* | 1 | 3 |
| `APP.area` | — *phantom* | 0 | 1 |
| `APP.askAnswers` | — *phantom* | 0 | 7 |
| `APP.askBuildWorkbook` | — *phantom* | 0 | 2 |
| `APP.askInput` | — *phantom* | 0 | 1 |
| `APP.askRun` | — *phantom* | 0 | 8 |
| `APP.askSuggest` | — *phantom* | 0 | 5 |
| `APP.b` | — *phantom* | 0 | 2 |
| `APP.bearingDirectionThree` | `viewer/sun_path.js:207` *(as `A.`)* | 1 | 6 |
| `APP.bigStatsAt` | `viewer/cpe_resource_panel.js:744` *(as `A.`)* | 1 | 3 |
| `APP.bigStatsAtSpan` | `viewer/cpe_resource_panel.js:732` *(as `A.`)* | 1 | 3 |
| `APP.bigStatsBoxRect` | `viewer/cpe_resource_panel.js:895` *(as `A.`)* | 1 | 3 |
| `APP.bigStatsBuild` | `viewer/cpe_resource_panel.js:478` *(as `A.`)* | 1 | 10 |
| `APP.bigStatsCompositeOntoCanvas` | `viewer/cpe_resource_panel.js:899` *(as `A.`)* | 1 | 6 |
| `APP.bigStatsLastBox` | `viewer/cpe_resource_panel.js:900` *(as `A.`)* | 3 | 8 |
| `APP.bind` | — *phantom* | 0 | 3 |
| `APP.blobToGeometry` | `viewer/scene.js:2337` *(as `A.`)* | 1 | 9 |
| `APP.budget` | — *phantom* | 0 | 4 |
| `APP.buildDoorPath` | `viewer/tour.js:2375` *(as `A.`)* | 1 | 2 |
| `APP.buildPointPath` | `viewer/tour.js:2283` *(as `A.`)* | 1 | 3 |
| `APP.buildRouteTemplate` | — *phantom* | 0 | 2 |
| `APP.buildRuleDeepLink` | `viewer/rule_checklist.js:688` *(as `A.`)* | 1 | 3 |
| `APP.buildShareUrl` | `viewer/share.js:211` *(as `A.`)* | 1 | 5 |
| `APP.buildSpacePath` | `viewer/tour.js:2370` *(as `A.`)* | 1 | 2 |
| `APP.buildTour` | `viewer/tour.js:948` *(as `A.`)* | 1 | 2 |
| `APP.buildWalkGraphPath` | `viewer/tour.js:2164` *(as `A.`)* | 1 | 2 |
| `APP.buildingCentres` | `viewer/scene.js:474` *(as `A.`)* | 1 | 97 |
| `APP.buildingMeasureCard` | `viewer/cpe_resource_panel.js:700` *(as `A.`)* | 1 | 2 |
| `APP.buildingMeasureCards` | `viewer/cpe_resource_panel.js:634` *(as `A.`)* | 1 | 3 |
| `APP.buildingName` | — *phantom* | 0 | 4 |
| `APP.buildingsRendered` | `viewer/scene.js:483` *(as `A.`)* | 1 | 118 |
| `APP.buildupCursorAt` | `viewer/maxq_start.js:2691` | 1 | 31 |
| `APP.buildupPacingReset` | `viewer/maxq_start.js:2696` | 1 | 19 |
| `APP.buildupTAt` | `viewer/maxq_start.js:2694` | 1 | 27 |
| `APP.buildupTopoutU` | `viewer/maxq_start.js:2695` | 1 | 9 |
| `APP.bytes` | — *phantom* | 0 | 1 |
| `APP.cacheStoreyLevels` | `viewer/walk.js:243` *(as `A.`)* | 1 | 2 |
| `APP.cachedFetch` | `viewer/scene.js:1742` *(as `A.`)* | 1 | 21 |
| `APP.camera` | `viewer/grid_views.js:83` *(as `A.`)* | 4 | 1076 |
| `APP.cancelMaxQualityOrbit` | `viewer/maxq_start.js:2686` | 1 | 4 |
| `APP.cancelWalkAnchor` | `viewer/walk.js:33` *(as `A.`)* | 1 | 2 |
| `APP.canvas` | `viewer/scene.js:10` *(as `A.`)* | 1 | 76 |
| `APP.chainage` | `viewer/chainage_grid.js:519` *(as `A.`)* | 1 | 35 |
| `APP.checkUpdate` | `viewer/scene.js:3519` *(as `A.`)* | 1 | 1 |
| `APP.cinemaBandFlow` | — *phantom* | 0 | 9 |
| `APP.cinemaBandWaypoints` | — *phantom* | 0 | 1 |
| `APP.cinemaFan` | — *phantom* | 0 | 4 |
| `APP.cinemaHoseApply` | — *phantom* | 0 | 5 |
| `APP.cinemaHoseReanchor` | — *phantom* | 0 | 1 |
| `APP.cinemaLookDist` | — *phantom* | 0 | 3 |
| `APP.cinemaPathEditor` | `viewer/cinema_path_editor.js:4224` | 1 | 148 |
| `APP.cinemaPathPlan` | — *phantom* | 0 | 220 |
| `APP.cinemaPathPlanDerived` | — *phantom* | 0 | 1 |
| `APP.cinemaPrefixInvalidate` | — *phantom* | 0 | 2 |
| `APP.cinemaRoundCorners` | — *phantom* | 0 | 2 |
| `APP.cinemaSeedBands` | — *phantom* | 0 | 12 |
| `APP.cinemaSeedStick` | — *phantom* | 0 | 2 |
| `APP.cityArchetypes` | `viewer/city.js:10` *(as `A.`)* | 1 | 5 |
| `APP.cityBuildingDbs` | `viewer/city.js:11` *(as `A.`)* | 3 | 15 |
| `APP.cityClear` | `viewer/city.js:811` *(as `A.`)* | 1 | 1 |
| `APP.cityDb` | `viewer/city.js:8` *(as `A.`)* | 2 | 13 |
| `APP.cityLoadBuilding` | `viewer/city.js:646` *(as `A.`)* | 1 | 3 |
| `APP.citySQL` | `viewer/city.js:9` *(as `A.`)* | 2 | 9 |
| `APP.civilCastZ` | `viewer/civil_sections.js:128` *(as `A.`)* | 1 | 3 |
| `APP.civilChainLabel` | `viewer/chainage_grid.js:498` *(as `A.`)* | 1 | 11 |
| `APP.civilChainRange` | `viewer/chainage_grid.js:502` *(as `A.`)* | 1 | 10 |
| `APP.civilChainReal` | `viewer/chainage_grid.js:506` *(as `A.`)* | 1 | 13 |
| `APP.civilChainageAt` | `viewer/cpe_road_panels.js:289` *(as `A.`)* | 1 | 5 |
| `APP.civilCrossOutput` | `viewer/civil_sections.js:275` *(as `A.`)* | 1 | 9 |
| `APP.civilCrossPDF` | `viewer/civil_sections.js:347` *(as `A.`)* | 1 | 2 |
| `APP.civilCrossPNG` | `viewer/civil_sections.js:328` *(as `A.`)* | 1 | 4 |
| `APP.civilCrossSection` | `viewer/civil_sections.js:158` *(as `A.`)* | 1 | 4 |
| `APP.civilCrossSectionOff` | `viewer/civil_sections.js:175` *(as `A.`)* | 1 | 3 |
| `APP.civilCrossSegments` | `viewer/civil_sections.js:241` *(as `A.`)* | 1 | 2 |
| `APP.civilCrossSheetHTML` | `viewer/civil_sections.js:339` *(as `A.`)* | 1 | 3 |
| `APP.civilDriveRoute` | — *phantom* | 0 | 18 |
| `APP.civilElementBoxes` | `viewer/civil_sections.js:185` *(as `A.`)* | 1 | 2 |
| `APP.civilGotoChainage` | `viewer/civil_sections.js:353` *(as `A.`)* | 1 | 10 |
| `APP.civilLensPNG` | `viewer/civil_sections.js:538` *(as `A.`)* | 1 | 3 |
| `APP.civilLongSection` | `viewer/civil_sections.js:134` *(as `A.`)* | 1 | 5 |
| `APP.civilProfile` | `viewer/civil_sections.js:424` *(as `A.`)* | 1 | 14 |
| `APP.civilProfilePDF` | `viewer/civil_sections.js:577` *(as `A.`)* | 1 | 2 |
| `APP.civilProfilePrepare` | `viewer/civil_sections.js:389` *(as `A.`)* | 1 | 13 |
| `APP.civilProfilePrepareNow` | `viewer/civil_sections.js:396` *(as `A.`)* | 1 | 2 |
| `APP.civilProfileSheetsHTML` | `viewer/civil_sections.js:549` *(as `A.`)* | 1 | 2 |
| `APP.civilRouteAt` | `viewer/civil_sections.js:39` *(as `A.`)* | 1 | 31 |
| `APP.civilRoutePath` | `viewer/tour.js:833` *(as `A.`)* | 1 | 6 |
| `APP.civilSectionCut` | `viewer/civil_sections.js:205` *(as `A.`)* | 1 | 6 |
| `APP.clashFilm` | `viewer/clash_film.js:95` *(as `A.`)* | 1 | 121 |
| `APP.clashLabels` | `viewer/clash_labels.js:119` *(as `A.`)* | 1 | 51 |
| `APP.clashLabelsCompositeOntoCanvas` | `viewer/clash_labels.js:326` *(as `A.`)* | 1 | 8 |
| `APP.clashNarrow` | `viewer/clash_narrow.js:447` *(as `A.`)* | 1 | 50 |
| `APP.clearAllIssues` | `viewer/issues.js:261` *(as `A.`)* | 1 | 2 |
| `APP.clearFocusElement` | — *phantom* | 0 | 11 |
| `APP.clearMeasures` | `viewer/measure.js:1268` *(as `A.`)* | 1 | 5 |
| `APP.clearStreamed` | `viewer/streaming.js:4315` *(as `A.`)* | 1 | 3 |
| `APP.clientId` | `erp/idempiere.html:1502` | 1 | 54 |
| `APP.clientName` | — *phantom* | 0 | 2 |
| `APP.closeFindPanel` | — *phantom* | 0 | 2 |
| `APP.closeSiteCamera` | `viewer/sitecam.js:179` *(as `A.`)* | 1 | 11 |
| `APP.closeSitePreview` | `viewer/sitecam.js:449` *(as `A.`)* | 1 | 8 |
| `APP.closeSunglass` | — *phantom* | 0 | 1 |
| `APP.collectMeshes` | `viewer/helpers.js:20` *(as `A.`)* | 1 | 118 |
| `APP.column` | — *phantom* | 0 | 1 |
| `APP.composeGhostsFromAggregates` | `viewer/scene.js:2236` *(as `A.`)* | 1 | 5 |
| `APP.computeDiff` | `viewer/diff.js:18` *(as `A.`)* | 1 | 4 |
| `APP.computePathLength` | `viewer/tour.js:2380` *(as `A.`)* | 1 | 2 |
| `APP.contributeBuilding` | — *phantom* | 0 | 2 |
| `APP.controls` | `viewer/scene.js:186` *(as `A.`)* | 2 | 637 |
| `APP.costOdometerAt` | `viewer/cpe_resource_panel.js:169` *(as `A.`)* | 1 | 2 |
| `APP.costOdometerTick` | `viewer/cpe_resource_panel.js:205` *(as `A.`)* | 1 | 3 |
| `APP.counts` | — *phantom* | 0 | 4 |
| `APP.cpeArchFadeApplyVisual` | — *phantom* | 0 | 6 |
| `APP.cpePanelPlate` | `viewer/cpe_resource_panel.js:826` *(as `A.`)* | 1 | 4 |
| `APP.cpeRevealApplyVisual` | — *phantom* | 0 | 8 |
| `APP.cpeRevealCaptionAt` | — *phantom* | 0 | 7 |
| `APP.cpeRevealDiscLabel` | — *phantom* | 0 | 12 |
| `APP.cpeRevealDiscQtyCost` | — *phantom* | 0 | 3 |
| `APP.cpeRevealDiscsPresent` | — *phantom* | 0 | 5 |
| `APP.cpeRevealLightsOffAt` | — *phantom* | 0 | 2 |
| `APP.cpeRevealShellDiscs` | — *phantom* | 0 | 1 |
| `APP.cpeRevealVisualAt` | — *phantom* | 0 | 7 |
| `APP.createPanel` | `viewer/panels.js:222` *(as `A.`)* | 1 | 8 |
| `APP.createSnag` | `viewer/helpers.js:515` *(as `A.`)* | 1 | 3 |
| `APP.currentBuilding` | — *phantom* | 0 | 9 |
| `APP.cycleRoleFilter` | `viewer/panels.js:822` *(as `A.`)* | 1 | 3 |
| `APP.cycleWalkSpeed` | `viewer/tour.js:1237` *(as `A.`)* | 1 | 2 |
| `APP.cycleXrayBboxMode` | `viewer/tools.js:454` *(as `A.`)* | 1 | 5 |
| `APP.dayCounterAt` | `viewer/cpe_day_counter.js:32` *(as `A.`)* | 1 | 21 |
| `APP.dayCounterBoxSize` | `viewer/cpe_day_counter.js:57` *(as `A.`)* | 1 | 6 |
| `APP.dayCounterCompositeOntoCanvas` | `viewer/cpe_day_counter.js:77` *(as `A.`)* | 1 | 13 |
| `APP.dayCounterLastBox` | `viewer/cpe_day_counter.js:109` *(as `A.`)* | 2 | 4 |
| `APP.dayCounterLiveStart` | `viewer/cpe_day_counter.js:147` *(as `A.`)* | 1 | 1 |
| `APP.dayCounterLiveStop` | `viewer/cpe_day_counter.js:171` *(as `A.`)* | 1 | 1 |
| `APP.dayCounterLiveTick` | `viewer/cpe_day_counter.js:156` *(as `A.`)* | 1 | 1 |
| `APP.db` | `viewer/city.js:717` *(as `A.`)* | 14 | 754 |
| `APP.dbQuery` | `viewer/helpers.js:116` *(as `A.`)* | 2 | 598 |
| `APP.dbQueryFirst` | `viewer/helpers.js:130` *(as `A.`)* | 1 | 11 |
| `APP.deleteImported` | `viewer/import.js:599` *(as `A.`)* | 1 | 4 |
| `APP.diffDb` | `viewer/main.js:1074` | 1 | 18 |
| `APP.diffResult` | `viewer/diff.js:47` *(as `A.`)* | 1 | 32 |
| `APP.discCounts` | `viewer/scene.js:475` *(as `A.`)* | 3 | 12 |
| `APP.dlodDemoteAll` | `viewer/dlod.js:140` *(as `A.`)* | 1 | 1 |
| `APP.dlodDisable` | `viewer/dlod.js:133` *(as `A.`)* | 1 | 11 |
| `APP.dlodEnable` | `viewer/dlod.js:99` *(as `A.`)* | 1 | 14 |
| `APP.dlodTick` | `viewer/dlod.js:145` *(as `A.`)* | 1 | 26 |
| `APP.downloadSitePhoto` | `viewer/sitecam.js:514` *(as `A.`)* | 1 | 4 |
| `APP.drawBuildingBoxes` | `viewer/streaming.js:23` *(as `A.`)* | 1 | 4 |
| `APP.drawnOnlyView` | `viewer/cpe_drawn_services.js:87` *(as `A.`)* | 1 | 2 |
| `APP.drawnServicesApply` | `viewer/cpe_drawn_services.js:73` *(as `A.`)* | 1 | 1 |
| `APP.drawnServicesEnable` | `viewer/maxq_start.js:2718` | 1 | 8 |
| `APP.drawnServicesFrame` | `viewer/cpe_drawn_services.js:107` *(as `A.`)* | 1 | 6 |
| `APP.drawnServicesStats` | `viewer/cpe_drawn_services.js:84` *(as `A.`)* | 1 | 1 |
| `APP.earthworksPanelOpen` | `viewer/earthworks_overlay.js:183` *(as `A.`)* | 1 | 4 |
| `APP.earthworksVolume` | `viewer/cpe_road_panels.js:18` *(as `A.`)* | 1 | 5 |
| `APP.earthworksVolumeLine` | `viewer/cpe_road_panels.js:26` *(as `A.`)* | 1 | 4 |
| `APP.ensureHdriEnvMapReady` | — *phantom* | 0 | 2 |
| `APP.ensureRooms` | — *phantom* | 0 | 78 |
| `APP.erpQuery` | `viewer/hba_lens.js:349` *(as `A.`)* | 1 | 3 |
| `APP.error` | — *phantom* | 0 | 1 |
| `APP.errs` | — *phantom* | 0 | 2 |
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
| `APP.exitRuleModeTint` | `viewer/rule_checklist.js:663` *(as `A.`)* | 1 | 2 |
| `APP.export4D5D` | `viewer/tools.js:596` *(as `A.`)* | 1 | 6 |
| `APP.exportBcf` | `viewer/bcf_export.js:187` *(as `A.`)* | 1 | 7 |
| `APP.exportIFC` | `viewer/import.js:689` *(as `A.`)* | 1 | 5 |
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
| `APP.filmBoxesStatusRows` | `viewer/cpe_film_boxes.js:119` *(as `A.`)* | 1 | 5 |
| `APP.filmLayer` | `viewer/maxq_start.js:958` *(as `A.`)* | 1 | 16 |
| `APP.filterBatchedMesh` | `viewer/helpers.js:62` *(as `A.`)* | 1 | 4 |
| `APP.filterByGuids` | `viewer/panels.js:862` *(as `A.`)* | 1 | 16 |
| `APP.filterDisc` | `viewer/panels.js:765` *(as `A.`)* | 1 | 3 |
| `APP.filterDiscs` | `viewer/panels.js:770` *(as `A.`)* | 1 | 5 |
| `APP.filterInstancedMesh` | `viewer/helpers.js:36` *(as `A.`)* | 1 | 5 |
| `APP.filterMergedMesh` | `viewer/helpers.js:85` *(as `A.`)* | 1 | 2 |
| `APP.filterStorey` | `viewer/panels.js:730` *(as `A.`)* | 1 | 8 |
| `APP.findMeshByGuid` | `viewer/walk.js:577` *(as `A.`)* | 1 | 3 |
| `APP.findNearestDoorPosition` | `viewer/walk.js:199` *(as `A.`)* | 1 | 2 |
| `APP.flyActive` | `viewer/picking.js:71` *(as `A.`)* | 14 | 49 |
| `APP.flyAngle` | `viewer/picking.js:72` *(as `A.`)* | 4 | 8 |
| `APP.flyFromPos` | `viewer/picking.js:77` *(as `A.`)* | 2 | 3 |
| `APP.flyFromTarget` | `viewer/picking.js:78` *(as `A.`)* | 2 | 3 |
| `APP.flyTargetIdx` | `viewer/picking.js:74` *(as `A.`)* | 3 | 6 |
| `APP.flyTargets` | `viewer/picking.js:73` *(as `A.`)* | 2 | 17 |
| `APP.flyTick` | `viewer/tour.js:403` *(as `A.`)* | 1 | 2 |
| `APP.flyTo` | `viewer/city.js:616` *(as `A.`)* | 2 | 7 |
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
| `APP.friendlyName` | — *phantom* | 0 | 13 |
| `APP.gateRecordFor` | `erp/idempiere.html:1512` | 1 | 1 |
| `APP.gazeAcquireCap` | — *phantom* | 0 | 5 |
| `APP.gazeAcquireStep` | — *phantom* | 0 | 2 |
| `APP.generateQR` | `viewer/helpers.js:391` *(as `A.`)* | 1 | 4 |
| `APP.getDiffDetail` | `viewer/diff.js:168` *(as `A.`)* | 1 | 1 |
| `APP.getRoomGraph` | `witness/witness_escape_colours.js:35` *(as `A.`)* | 2 | 35 |
| `APP.getRouteTemplate` | — *phantom* | 0 | 2 |
| `APP.ghostGroundArm` | `viewer/maxq_start.js:2697` | 1 | 9 |
| `APP.ghostGroundAt` | `viewer/maxq_start.js:2698` | 1 | 10 |
| `APP.ghostGroundDebugState` | `viewer/maxq_start.js:2704` | 1 | 3 |
| `APP.ghostGroundRestore` | `viewer/maxq_start.js:2699` | 1 | 8 |
| `APP.giBlown` | — *phantom* | 0 | 2 |
| `APP.glassMs` | — *phantom* | 0 | 1 |
| `APP.glassReflDark` | — *phantom* | 0 | 1 |
| `APP.ground` | `viewer/scene.js:463` *(as `A.`)* | 1 | 131 |
| `APP.groundIfcZ` | `viewer/tools.js:156` *(as `A.`)* | 1 | 12 |
| `APP.guidForHit` | `viewer/hover_name.js:72` *(as `A.`)* | 1 | 4 |
| `APP.guidMap` | `viewer/city.js:827` *(as `A.`)* | 4 | 321 |
| `APP.handleMeasureClick` | `viewer/measure.js:1307` *(as `A.`)* | 1 | 2 |
| `APP.handleMeasureDblClick` | `viewer/measure.js:1572` *(as `A.`)* | 1 | 4 |
| `APP.handleMeasureRightClick` | `viewer/measure.js:1595` *(as `A.`)* | 1 | 3 |
| `APP.handleWallXray` | `viewer/walk.js:474` *(as `A.`)* | 1 | 2 |
| `APP.hemi` | `viewer/scene.js:222` *(as `A.`)* | 1 | 39 |
| `APP.hiddenDiscs` | `viewer/panels.js:751` *(as `A.`)* | 1 | 44 |
| `APP.hideEarthworksPanel` | `viewer/earthworks_overlay.js:182` *(as `A.`)* | 1 | 2 |
| `APP.hideRoadReport` | `viewer/road_report.js:152` *(as `A.`)* | 1 | 4 |
| `APP.hideRoadStandards` | `viewer/road_standards.js:126` *(as `A.`)* | 1 | 5 |
| `APP.hideRoadworksPanel` | `viewer/earthworks_overlay.js:190` *(as `A.`)* | 1 | 2 |
| `APP.hoverGuidAt` | `viewer/hover_name.js:124` *(as `A.`)* | 1 | 3 |
| `APP.hoverHighlight` | `viewer/tools.js:2991` *(as `A.`)* | 3 | 8 |
| `APP.icon` | `viewer/panels.js:195` *(as `A.`)* | 1 | 15 |
| `APP.ifc2three` | `viewer/scene.js:521` *(as `A.`)* | 4 | 322 |
| `APP.ifc2threeDir` | `viewer/scene.js:534` *(as `A.`)* | 1 | 8 |
| `APP.importIFC` | `viewer/import.js:151` *(as `A.`)* | 1 | 3 |
| `APP.importMesh` | `viewer/import.js:445` *(as `A.`)* | 1 | 3 |
| `APP.importMultiIFC` | `viewer/import.js:275` *(as `A.`)* | 1 | 12 |
| `APP.indoorBeatsAt` | `viewer/cpe_indoor_beats.js:249` *(as `A.`)* | 1 | 5 |
| `APP.indoorBeatsBuild` | `viewer/cpe_indoor_beats.js:33` *(as `A.`)* | 1 | 7 |
| `APP.indoorBeatsCompositeOntoCanvas` | `viewer/cpe_indoor_beats.js:264` *(as `A.`)* | 1 | 4 |
| `APP.indoorBeatsDispose` | `viewer/cpe_indoor_beats.js:319` *(as `A.`)* | 1 | 5 |
| `APP.indoorBeatsReport` | `viewer/cpe_indoor_beats.js:318` *(as `A.`)* | 1 | 5 |
| `APP.init` | `viewer/streaming.js:3662` *(as `A.`)* | 1 | 2 |
| `APP.initCity` | `viewer/city.js:314` *(as `A.`)* | 1 | 3 |
| `APP.inputWasVoice` | `viewer/nlp.js:601` *(as `A.`)* | 6 | 7 |
| `APP.integrity` | — *phantom* | 0 | 2 |
| `APP.interpolateWalkPath` | `viewer/tour.js:2391` *(as `A.`)* | 1 | 1 |
| `APP.isCivilModel` | `viewer/streaming.js:323` *(as `A.`)* | 1 | 65 |
| `APP.isIn2DView` | `viewer/grid_overlay.js:1731` *(as `A.`)* | 1 | 1 |
| `APP.isolateRoom` | `viewer/panels.js:903` *(as `A.`)* | 1 | 2 |
| `APP.kernelOps` | — *phantom* | 0 | 4 |
| `APP.ledgerTickerApplyVisual` | `viewer/cpe_ledger_ticker.js:202` *(as `A.`)* | 1 | 3 |
| `APP.ledgerTickerBuild` | `viewer/cpe_ledger_ticker.js:57` *(as `A.`)* | 1 | 3 |
| `APP.ledgerTickerCompositeOntoCanvas` | `viewer/cpe_ledger_ticker.js:241` *(as `A.`)* | 1 | 5 |
| `APP.ledgerTickerDispose` | `viewer/cpe_ledger_ticker.js:285` *(as `A.`)* | 1 | 5 |
| `APP.ledgerTickerRowText` | `viewer/cpe_ledger_ticker.js:263` *(as `A.`)* | 1 | 4 |
| `APP.libDb` | `viewer/city.js:718` *(as `A.`)* | 12 | 74 |
| `APP.lightTheme` | `viewer/tools.js:649` *(as `A.`)* | 2 | 19 |
| `APP.linearBeatBuild` | `viewer/cpe_linear_beat.js:47` *(as `A.`)* | 1 | 8 |
| `APP.linearBeatCompositeOntoCanvas` | `viewer/cpe_linear_beat.js:171` *(as `A.`)* | 1 | 4 |
| `APP.linearBeatDispose` | `viewer/cpe_linear_beat.js:191` *(as `A.`)* | 1 | 5 |
| `APP.linearBeatReport` | `viewer/cpe_linear_beat.js:190` *(as `A.`)* | 1 | 5 |
| `APP.listRooms` | `viewer/panels.js:891` *(as `A.`)* | 1 | 2 |
| `APP.load` | — *phantom* | 0 | 1 |
| `APP.loadCityManual` | `viewer/city.js:306` *(as `A.`)* | 1 | 1 |
| `APP.loadFromHash` | `viewer/streaming.js:4306` *(as `A.`)* | 1 | 2 |
| `APP.loadNavigate` | `viewer/main.js:155` | 1 | 130 |
| `APP.loadPathApplyVisual` | — *phantom* | 0 | 6 |
| `APP.loadPathBuild` | — *phantom* | 0 | 2 |
| `APP.loadPathCardOn` | — *phantom* | 0 | 2 |
| `APP.loadPathCompositeOntoCanvas` | — *phantom* | 0 | 4 |
| `APP.loadPathDispose` | — *phantom* | 0 | 4 |
| `APP.loadRuleSet` | `viewer/rule_checklist.js:810` *(as `A.`)* | 1 | 3 |
| `APP.loadWizard` | `viewer/main.js:293` | 1 | 2 |
| `APP.lookup` | — *phantom* | 0 | 1 |
| `APP.markDirty` | `viewer/main.js:783` | 3 | 383 |
| `APP.markEdited` | `viewer/scene.js:678` *(as `A.`)* | 1 | 4 |
| `APP.materializeZones` | — *phantom* | 0 | 2 |
| `APP.maxqStatusDayRoomSegs` | `viewer/maxq_start.js:2710` | 1 | 13 |
| `APP.measureActive` | `viewer/main.js:1154` | 4 | 28 |
| `APP.measureFirstMarker` | `viewer/measure.js:1279` *(as `A.`)* | 5 | 9 |
| `APP.measureFirstPoint` | `viewer/measure.js:1278` *(as `A.`)* | 5 | 8 |
| `APP.measureGroup` | `viewer/picking.js:66` *(as `A.`)* | 1 | 23 |
| `APP.measureLabels` | `viewer/measure.js:1277` *(as `A.`)* | 3 | 24 |
| `APP.mepSmoothNormals` | `viewer/streaming.js:84` *(as `A.`)* | 1 | 5 |
| `APP.meshCache` | `viewer/scene.js:476` *(as `A.`)* | 2 | 41 |
| `APP.meshSolidVolume` | `viewer/cpe_road_panels.js:16` *(as `A.`)* | 1 | 4 |
| `APP.minAreaRect` | `viewer/tools.js:1337` *(as `A.`)* | 1 | 5 |
| `APP.modelOffset` | `viewer/scene.js:480` *(as `A.`)* | 1 | 81 |
| `APP.mouse` | `viewer/scene.js:518` *(as `A.`)* | 1 | 13 |
| `APP.n` | — *phantom* | 0 | 6 |
| `APP.navActive` | `viewer/navigate.js:31` *(as `A.`)* | 1 | 7 |
| `APP.navCurrentStep` | `viewer/navigate.js:32` *(as `A.`)* | 1 | 5 |
| `APP.navJumpToEnd` | — *phantom* | 0 | 3 |
| `APP.nightFixtureColor` | `viewer/tools.js:1635` *(as `A.`)* | 1 | 4 |
| `APP.nightFixtureShape` | `viewer/tools.js:1415` *(as `A.`)* | 1 | 3 |
| `APP.nightIsExitSign` | `viewer/tools.js:1300` *(as `A.`)* | 1 | 3 |
| `APP.nightLightColor` | `viewer/tools.js:1304` *(as `A.`)* | 1 | 5 |
| `APP.nightLightIntensityMult` | `viewer/tools.js:1673` *(as `A.`)* | 1 | 2 |
| `APP.onSectionOff` | — *phantom* | 0 | 2 |
| `APP.onSectionSliderChange` | — *phantom* | 0 | 2 |
| `APP.openCacheDB` | `viewer/scene.js:613` *(as `A.`)* | 1 | 26 |
| `APP.openFindPanel` | `viewer/main.js:290` | 1 | 63 |
| `APP.openImported` | `viewer/import.js:539` *(as `A.`)* | 1 | 13 |
| `APP.openModelDb` | `viewer/scene.js:1637` *(as `A.`)* | 1 | 12 |
| `APP.openShareSheet` | `viewer/import.js:610` *(as `A.`)* | 2 | 5 |
| `APP.openSiteCamera` | `viewer/sitecam.js:73` *(as `A.`)* | 1 | 7 |
| `APP.openTab` | — *phantom* | 0 | 2 |
| `APP.order` | — *phantom* | 0 | 2 |
| `APP.orgId` | `erp/idempiere.html:1503` | 1 | 26 |
| `APP.pageErrors` | — *phantom* | 0 | 1 |
| `APP.paramsToParas` | — *phantom* | 0 | 1 |
| `APP.parasToParams` | — *phantom* | 0 | 1 |
| `APP.pathOverviewCompositeOntoCanvas` | `viewer/cpe_path_overview.js:170` *(as `A.`)* | 1 | 8 |
| `APP.pathOverviewLastBox` | `viewer/cpe_path_overview.js:183` *(as `A.`)* | 2 | 4 |
| `APP.pathOverviewPrepare` | `viewer/cpe_path_overview.js:76` *(as `A.`)* | 1 | 13 |
| `APP.pathOverviewToBox` | `viewer/cpe_path_overview.js:148` *(as `A.`)* | 1 | 9 |
| `APP.pauseStillRefineForGI` | — *phantom* | 0 | 4 |
| `APP.pinstanceList` | — *phantom* | 0 | 1 |
| `APP.placeLabelFor` | `viewer/cpe_sun_compass.js:617` *(as `A.`)* | 1 | 3 |
| `APP.placeTableLoad` | `viewer/cpe_sun_compass.js:594` *(as `A.`)* | 1 | 3 |
| `APP.pointerDownPos` | `viewer/scene.js:486` *(as `A.`)* | 1 | 7 |
| `APP.populateActive` | — *phantom* | 0 | 2 |
| `APP.populateBuildingList` | `viewer/panels.js:918` *(as `A.`)* | 1 | 7 |
| `APP.populateDiscs` | `viewer/panels.js:753` *(as `A.`)* | 1 | 7 |
| `APP.populateStoreys` | `viewer/panels.js:727` *(as `A.`)* | 1 | 7 |
| `APP.poses` | — *phantom* | 0 | 4 |
| `APP.printQRSheet` | `viewer/helpers.js:442` *(as `A.`)* | 1 | 3 |
| `APP.probeGradeHdr` | — *phantom* | 0 | 2 |
| `APP.probes` | — *phantom* | 0 | 2 |
| `APP.queryWalkPath` | `viewer/tour.js:2070` *(as `A.`)* | 1 | 1 |
| `APP.quickShare` | `viewer/share.js:636` *(as `A.`)* | 1 | 7 |
| `APP.raycaster` | `viewer/scene.js:517` *(as `A.`)* | 1 | 18 |
| `APP.realAt` | `viewer/chainage_grid.js:209` *(as `A.`)* | 1 | 1 |
| `APP.refreshSectionModes` | `viewer/tools.js:486` *(as `A.`)* | 1 | 8 |
| `APP.renderImportCards` | `viewer/import.js:623` *(as `A.`)* | 1 | 10 |
| `APP.renderer` | `viewer/scene.js:139` *(as `A.`)* | 1 | 538 |
| `APP.reportBug` | `viewer/helpers.js:204` *(as `A.`)* | 1 | 6 |
| `APP.reportError` | `viewer/error_reporter.js:112` *(as `A.`)* | 2 | 10 |
| `APP.resetCinemaGhostLens` | — *phantom* | 0 | 2 |
| `APP.resident` | — *phantom* | 0 | 4 |
| `APP.resourcePanelAt` | `viewer/cpe_resource_panel.js:50` *(as `A.`)* | 1 | 8 |
| `APP.resourcePanelCompositeOntoCanvas` | `viewer/cpe_resource_panel.js:1347` *(as `A.`)* | 1 | 4 |
| `APP.resourcePanelFrozenAt` | `viewer/cpe_resource_panel.js:434` *(as `A.`)* | 1 | 3 |
| `APP.resourcePanelHoldAt` | `viewer/cpe_resource_panel.js:378` *(as `A.`)* | 1 | 3 |
| `APP.resourcePanelLastBox` | `viewer/cpe_resource_panel.js:1394` *(as `A.`)* | 2 | 6 |
| `APP.resourcePanelLightDir` | `viewer/cpe_resource_panel.js:451` *(as `A.`)* | 1 | 2 |
| `APP.restoreWallXray` | `viewer/walk.js:581` *(as `A.`)* | 1 | 3 |
| `APP.roadPanelsBuild` | `viewer/cpe_road_panels.js:82` *(as `A.`)* | 1 | 4 |
| `APP.roadPanelsCardOf` | `viewer/cpe_road_panels.js:282` *(as `A.`)* | 1 | 9 |
| `APP.roadPanelsCompositeOntoCanvas` | `viewer/cpe_road_panels.js:252` *(as `A.`)* | 1 | 7 |
| `APP.roadPanelsDispose` | `viewer/cpe_road_panels.js:295` *(as `A.`)* | 1 | 5 |
| `APP.roadPanelsLastBox` | `viewer/cpe_road_panels.js:250` *(as `A.`)* | 4 | 6 |
| `APP.roadPanelsSlots` | `viewer/cpe_road_panels.js:281` *(as `A.`)* | 1 | 1 |
| `APP.roadReportOpen` | `viewer/road_report.js:151` *(as `A.`)* | 1 | 4 |
| `APP.roadStandardsOpen` | `viewer/road_standards.js:125` *(as `A.`)* | 1 | 4 |
| `APP.roadworksPanelOpen` | `viewer/earthworks_overlay.js:191` *(as `A.`)* | 1 | 4 |
| `APP.roleId` | `erp/idempiere.html:1504` | 5 | 41 |
| `APP.roleOrgWhere` | `erp/idempiere.html:2699` | 1 | 1 |
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
| `APP.ruleTintShowOnly` | `viewer/rule_checklist.js:632` *(as `A.`)* | 1 | 3 |
| `APP.runPanelAction` | `viewer/panels.js:1602` *(as `A.`)* | 1 | 3 |
| `APP.saveLines` | — *phantom* | 0 | 1 |
| `APP.saveModelDb` | `viewer/scene.js:1031` *(as `A.`)* | 1 | 9 |
| `APP.saveMs` | — *phantom* | 0 | 1 |
| `APP.saveSectionFromScissors` | `viewer/grid_overlay.js:1721` *(as `A.`)* | 1 | 1 |
| `APP.saveWallMs` | — *phantom* | 0 | 1 |
| `APP.savedBytes` | — *phantom* | 0 | 2 |
| `APP.savedStreams` | `viewer/streaming.js:17` *(as `A.`)* | 1 | 8 |
| `APP.scene` | `viewer/scene.js:159` *(as `A.`)* | 1 | 782 |
| `APP.sceneScopeBuilding` | `viewer/streaming.js:309` *(as `A.`)* | 1 | 3 |
| `APP.sched` | — *phantom* | 0 | 2 |
| `APP.screenshot` | `viewer/tools.js:613` *(as `A.`)* | 1 | 4 |
| `APP.sectionAxis` | `viewer/section_cut.js:834` | 4 | 14 |
| `APP.sectionMax` | `viewer/tools.js:479` *(as `A.`)* | 2 | 2 |
| `APP.sectionMin` | `viewer/tools.js:478` *(as `A.`)* | 2 | 2 |
| `APP.sectionModes` | `viewer/tools.js:483` *(as `A.`)* | 1 | 14 |
| `APP.sectionOn` | `viewer/civil_sections.js:165` *(as `A.`)* | 8 | 29 |
| `APP.sectionPlane` | `viewer/tools.js:477` *(as `A.`)* | 3 | 35 |
| `APP.sessionContext` | — *phantom* | 0 | 1 |
| `APP.setGroundTexture` | `viewer/tools.js:355` *(as `A.`)* | 1 | 3 |
| `APP.setMarkupColor` | `viewer/sitecam.js:344` *(as `A.`)* | 1 | 2 |
| `APP.setMarkupTool` | `viewer/sitecam.js:336` *(as `A.`)* | 1 | 2 |
| `APP.setOutline` | — *phantom* | 0 | 12 |
| `APP.setSectionAxis` | `viewer/tools.js:524` *(as `A.`)* | 1 | 4 |
| `APP.setWalkAnchor` | `viewer/walk.js:37` *(as `A.`)* | 1 | 2 |
| `APP.shareProject` | `viewer/scene.js:3520` *(as `A.`)* | 1 | 1 |
| `APP.shareSitePhoto` | `viewer/sitecam.js:456` *(as `A.`)* | 1 | 4 |
| `APP.shareUrl` | `viewer/share.js:294` *(as `A.`)* | 1 | 5 |
| `APP.sheets` | — *phantom* | 0 | 3 |
| `APP.shellPassMs` | — *phantom* | 0 | 1 |
| `APP.showAdvanced` | `erp/idempiere.html:1505` | 2 | 4 |
| `APP.showCommandPalette` | `viewer/scene.js:3117` *(as `A.`)* | 1 | 1 |
| `APP.showDiffSummary` | `viewer/diff.js:293` *(as `A.`)* | 1 | 2 |
| `APP.showEarthworksPanel` | `viewer/earthworks_overlay.js:170` *(as `A.`)* | 1 | 3 |
| `APP.showEgressSanity` | `viewer/rule_checklist.js:852` *(as `A.`)* | 1 | 4 |
| `APP.showQRShare` | `viewer/helpers.js:420` *(as `A.`)* | 1 | 5 |
| `APP.showRoadReport` | `viewer/road_report.js:154` *(as `A.`)* | 1 | 3 |
| `APP.showRoadStandards` | `viewer/road_standards.js:131` *(as `A.`)* | 1 | 9 |
| `APP.showRoadworksPanel` | `viewer/earthworks_overlay.js:185` *(as `A.`)* | 1 | 3 |
| `APP.showRuleChecklist` | `viewer/rule_checklist.js:510` *(as `A.`)* | 1 | 3 |
| `APP.showRuleModeTint` | `viewer/rule_checklist.js:532` *(as `A.`)* | 1 | 5 |
| `APP.showStructuralSanity` | `viewer/rule_checklist.js:812` *(as `A.`)* | 1 | 4 |
| `APP.sky` | — *phantom* | 0 | 4 |
| `APP.slabBeatAt` | `viewer/cpe_slab_beat.js:486` *(as `A.`)* | 1 | 4 |
| `APP.slabBeatBuild` | `viewer/cpe_slab_beat.js:267` *(as `A.`)* | 1 | 9 |
| `APP.slabBeatClock` | `viewer/cpe_slab_beat.js:543` *(as `A.`)* | 1 | 5 |
| `APP.slabBeatCompositeOntoCanvas` | `viewer/cpe_slab_beat.js:517` *(as `A.`)* | 1 | 4 |
| `APP.slabBeatDispose` | `viewer/cpe_slab_beat.js:544` *(as `A.`)* | 1 | 5 |
| `APP.slabBeatLabelStaleCheck` | `viewer/cpe_slab_beat.js:533` *(as `A.`)* | 1 | 3 |
| `APP.slabBeatReport` | `viewer/cpe_slab_beat.js:542` *(as `A.`)* | 1 | 9 |
| `APP.snapSitePhoto` | `viewer/sitecam.js:204` *(as `A.`)* | 1 | 2 |
| `APP.softStopStillRefine` | — *phantom* | 0 | 4 |
| `APP.sourcedStage` | — *phantom* | 0 | 2 |
| `APP.speedZones` | `viewer/speed_zones.js:644` *(as `A.`)* | 1 | 17 |
| `APP.src` | — *phantom* | 0 | 1 |
| `APP.srcBytes` | — *phantom* | 0 | 2 |
| `APP.stageCinemaPath` | — *phantom* | 0 | 1 |
| `APP.stagingTotal` | — *phantom* | 0 | 2 |
| `APP.startCinemaOrbit` | — *phantom* | 0 | 7 |
| `APP.startDriveThru` | `viewer/walk.js:396` *(as `A.`)* | 1 | 7 |
| `APP.startFlyTour` | — *phantom* | 0 | 2 |
| `APP.startMaxQ` | — *phantom* | 0 | 2 |
| `APP.startMaxQualityOrbit` | `viewer/maxq_start.js:2685` | 1 | 86 |
| `APP.startNavigation` | — *phantom* | 0 | 3 |
| `APP.startOfflineDownload` | `viewer/scene.js:3521` *(as `A.`)* | 1 | 3 |
| `APP.startStepDetection` | `viewer/walk.js:354` *(as `A.`)* | 1 | 1 |
| `APP.startStillRefine` | — *phantom* | 0 | 54 |
| `APP.startStillSSGIPhase` | `viewer/effects_gi_poc.js:542` *(as `A.`)* | 1 | 1 |
| `APP.startStreaming` | `viewer/streaming.js:333` *(as `A.`)* | 1 | 2 |
| `APP.startWalkGpsTracking` | `viewer/walk.js:260` *(as `A.`)* | 1 | 2 |
| `APP.status` | `viewer/scene.js:484` *(as `A.`)* | 1 | 311 |
| `APP.std` | — *phantom* | 0 | 1 |
| `APP.stillExit` | — *phantom* | 0 | 2 |
| `APP.stopDriveThru` | `viewer/walk.js:447` *(as `A.`)* | 1 | 2 |
| `APP.stopStepDetection` | `viewer/walk.js:383` *(as `A.`)* | 1 | 2 |
| `APP.stopStillRefine` | — *phantom* | 0 | 29 |
| `APP.stopStillSSGIPhase` | `viewer/effects_gi_poc.js:563` *(as `A.`)* | 1 | 1 |
| `APP.stopWalkMode` | `viewer/walk.js:315` *(as `A.`)* | 1 | 2 |
| `APP.storeyMeshGroups` | `viewer/panels.js:715` *(as `A.`)* | 1 | 1 |
| `APP.storeyRevealApplyCut` | `viewer/cpe_storey_reveal.js:2334` *(as `A.`)* | 1 | 7 |
| `APP.storeyRevealApplyVisual` | `viewer/cpe_storey_reveal.js:2424` *(as `A.`)* | 1 | 7 |
| `APP.storeyRevealCaptionAt` | `viewer/cpe_storey_reveal.js:694` *(as `A.`)* | 1 | 7 |
| `APP.storeyRevealCutAt` | `viewer/cpe_storey_reveal.js:1256` *(as `A.`)* | 1 | 2 |
| `APP.storeyRevealList` | `viewer/cpe_storey_reveal.js:304` *(as `A.`)* | 1 | 3 |
| `APP.storeyRevealMode` | `viewer/cpe_storey_reveal.js:2423` *(as `A.`)* | 1 | 1 |
| `APP.storeyRevealStatCardAt` | `viewer/cpe_storey_reveal.js:715` *(as `A.`)* | 1 | 5 |
| `APP.storeyRevealStatsFor` | `viewer/cpe_storey_reveal.js:440` *(as `A.`)* | 1 | 5 |
| `APP.storeyRevealTintFor` | `viewer/cpe_storey_reveal.js:2421` *(as `A.`)* | 1 | 1 |
| `APP.storeyRevealTintRestore` | `viewer/cpe_storey_reveal.js:2422` *(as `A.`)* | 1 | 1 |
| `APP.storeyRevealTintTouched` | `viewer/cpe_storey_reveal.js:899` *(as `A.`)* | 1 | 1 |
| `APP.storeyRevealVisualAt` | `viewer/cpe_storey_reveal.js:633` *(as `A.`)* | 1 | 7 |
| `APP.streamBuilding` | `viewer/streaming.js:347` *(as `A.`)* | 1 | 48 |
| `APP.streamIdx` | `viewer/city.js:791` *(as `A.`)* | 10 | 57 |
| `APP.streamQueue` | `viewer/city.js:782` *(as `A.`)* | 12 | 89 |
| `APP.streamTick` | `viewer/streaming.js:2378` *(as `A.`)* | 1 | 2 |
| `APP.streamedCount` | `viewer/city.js:825` *(as `A.`)* | 5 | 44 |
| `APP.streaming` | `viewer/city.js:792` *(as `A.`)* | 15 | 188 |
| `APP.sun` | `viewer/scene.js:218` *(as `A.`)* | 1 | 191 |
| `APP.sunClockBoxSize` | `viewer/cpe_sun_compass.js:735` *(as `A.`)* | 1 | 2 |
| `APP.sunClockCompositeOntoCanvas` | `viewer/cpe_sun_compass.js:741` *(as `A.`)* | 1 | 5 |
| `APP.sunClockLastBox` | `viewer/cpe_sun_compass.js:754` *(as `A.`)* | 4 | 6 |
| `APP.sunCompassAt` | `viewer/cpe_sun_compass.js:404` *(as `A.`)* | 1 | 5 |
| `APP.sunCompassBuild` | `viewer/cpe_sun_compass.js:213` *(as `A.`)* | 1 | 5 |
| `APP.sunCompassCompositeOntoCanvas` | `viewer/cpe_sun_compass.js:644` *(as `A.`)* | 1 | 5 |
| `APP.sunCompassDarkReport` | `viewer/cpe_sun_compass.js:828` *(as `A.`)* | 1 | 3 |
| `APP.sunCompassDispose` | `viewer/cpe_sun_compass.js:850` *(as `A.`)* | 1 | 1 |
| `APP.sunCompassInfo` | `viewer/cpe_sun_compass.js:821` *(as `A.`)* | 1 | 12 |
| `APP.sunCompassLabels` | `viewer/cpe_sun_compass.js:546` *(as `A.`)* | 1 | 2 |
| `APP.sunCompassSetDate` | `viewer/cpe_sun_compass.js:63` *(as `A.`)* | 1 | 3 |
| `APP.sunDayOfYear` | `viewer/sun_path.js:46` *(as `A.`)* | 1 | 2 |
| `APP.sunDirectionThree` | `viewer/sun_path.js:196` *(as `A.`)* | 1 | 3 |
| `APP.sunIncidenceDeg` | `viewer/sun_path.js:224` *(as `A.`)* | 1 | 3 |
| `APP.sunInstantAtSolarHour` | `viewer/sun_path.js:175` *(as `A.`)* | 1 | 2 |
| `APP.sunPositionAt` | `viewer/sun_path.js:62` *(as `A.`)* | 1 | 4 |
| `APP.sunReadoutLastBox` | `viewer/cpe_sun_compass.js:690` *(as `A.`)* | 2 | 4 |
| `APP.sunglassOn` | `viewer/tools.js:677` *(as `A.`)* | 2 | 3 |
| `APP.sw` | — *phantom* | 0 | 2 |
| `APP.t` | — *phantom* | 0 | 2 |
| `APP.tailPanelAt` | `viewer/cpe_resource_panel.js:881` *(as `A.`)* | 1 | 4 |
| `APP.three2ifc` | `viewer/scene.js:528` *(as `A.`)* | 1 | 33 |
| `APP.three2ifcDir` | `viewer/scene.js:533` *(as `A.`)* | 1 | 7 |
| `APP.tmCopySnapshotImage` | `viewer/share.js:415` *(as `A.`)* | 1 | 3 |
| `APP.tmCopySnapshotLink` | `viewer/share.js:446` *(as `A.`)* | 1 | 2 |
| `APP.tmFrontierPhase` | `witness/witness_cpe_room_title_collective.js:146` *(as `A.`)* | 3 | 6 |
| `APP.toast` | — *phantom* | 0 | 2 |
| `APP.toggleBackground` | `viewer/tools.js:1189` *(as `A.`)* | 1 | 2 |
| `APP.toggleClashMode` | `viewer/measure.js:2094` *(as `A.`)* | 1 | 1 |
| `APP.toggleDisc` | `viewer/panels.js:755` *(as `A.`)* | 1 | 2 |
| `APP.toggleEarthworksPanel` | `viewer/earthworks_overlay.js:184` *(as `A.`)* | 1 | 3 |
| `APP.toggleFlyAround` | `viewer/tour.js:8` *(as `A.`)* | 1 | 10 |
| `APP.toggleFullscreen` | `viewer/tools.js:635` *(as `A.`)* | 1 | 5 |
| `APP.toggleGIPreview` | `viewer/effects_gi_poc.js:15` *(as `A.`)* | 2 | 11 |
| `APP.toggleGridOverlay` | `viewer/grid_overlay.js:1583` *(as `A.`)* | 1 | 28 |
| `APP.toggleHoverName` | `viewer/hover_name.js:198` *(as `A.`)* | 1 | 12 |
| `APP.toggleIssues` | `viewer/issues.js:243` *(as `A.`)* | 1 | 2 |
| `APP.toggleMeasure` | `viewer/measure.js:1233` *(as `A.`)* | 1 | 8 |
| `APP.toggleNightMode` | `viewer/tools.js:2112` *(as `A.`)* | 1 | 18 |
| `APP.toggleNlp` | `viewer/nlp.js:676` *(as `A.`)* | 1 | 9 |
| `APP.togglePanel` | `viewer/panels.js:508` *(as `A.`)* | 1 | 2 |
| `APP.togglePopulate` | — *phantom* | 0 | 16 |
| `APP.toggleRoadReport` | `viewer/road_report.js:153` *(as `A.`)* | 1 | 5 |
| `APP.toggleRoadStandards` | `viewer/road_standards.js:127` *(as `A.`)* | 1 | 5 |
| `APP.toggleRoadworksPanel` | `viewer/earthworks_overlay.js:192` *(as `A.`)* | 1 | 3 |
| `APP.toggleSSAO` | — *phantom* | 0 | 4 |
| `APP.toggleSSGIPreview` | `viewer/effects_gi_poc.js:487` *(as `A.`)* | 1 | 7 |
| `APP.toggleSection` | `viewer/tools.js:499` *(as `A.`)* | 1 | 21 |
| `APP.toggleShadow` | `viewer/tools.js:1033` *(as `A.`)* | 1 | 13 |
| `APP.toggleStillRefine` | — *phantom* | 0 | 34 |
| `APP.toggleStillRefineUI` | — *phantom* | 0 | 4 |
| `APP.toggleSunglass` | `viewer/tools.js:680` *(as `A.`)* | 1 | 2 |
| `APP.toggleTheme` | `viewer/grid_overlay.js:1738` *(as `A.`)* | 2 | 4 |
| `APP.toggleVariance` | `viewer/diff.js:413` *(as `A.`)* | 1 | 3 |
| `APP.toggleWalkMode` | `viewer/walk.js:25` *(as `A.`)* | 1 | 2 |
| `APP.toggleWireframe` | `viewer/tools.js:370` *(as `A.`)* | 1 | 1 |
| `APP.toggleXray` | `viewer/tools.js:385` *(as `A.`)* | 1 | 17 |
| `APP.totalElements` | `viewer/city.js:364` *(as `A.`)* | 5 | 16 |
| `APP.tourScrubSpeed` | `viewer/tour.js:362` *(as `A.`)* | 2 | 5 |
| `APP.tourSeek` | `viewer/tour.js:1576` *(as `A.`)* | 1 | 25 |
| `APP.tourSetSpeed` | `viewer/tour.js:1971` *(as `A.`)* | 1 | 5 |
| `APP.tourStepBeat` | `viewer/tour.js:1611` *(as `A.`)* | 1 | 7 |
| `APP.tourTogglePause` | `viewer/tour.js:1962` *(as `A.`)* | 1 | 12 |
| `APP.undoMarkup` | `viewer/sitecam.js:353` *(as `A.`)* | 1 | 2 |
| `APP.updateAmbience` | `viewer/tools.js:777` *(as `A.`)* | 1 | 8 |
| `APP.updateHUD` | `viewer/panels.js:955` *(as `A.`)* | 1 | 7 |
| `APP.updateHash` | `viewer/streaming.js:4297` *(as `A.`)* | 1 | 2 |
| `APP.updateLighting` | `viewer/tools.js:997` *(as `A.`)* | 1 | 2 |
| `APP.updateMeasureLabels` | `viewer/measure.js:1795` *(as `A.`)* | 1 | 2 |
| `APP.updateSectionPlane` | `viewer/tools.js:586` *(as `A.`)* | 1 | 4 |
| `APP.updateSky` | `viewer/scene.js:275` *(as `A.`)* | 1 | 15 |
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
| `APP.wing2dClose` | `viewer/wing_2d.js:326` *(as `A.`)* | 1 | 1 |
| `APP.wing2dExport` | `viewer/wing_2d.js:231` *(as `A.`)* | 1 | 5 |
| `APP.wing2dSet` | `viewer/wing_2d.js:324` *(as `A.`)* | 1 | 6 |
| `APP.wing2dState` | `viewer/wing_2d.js:325` *(as `A.`)* | 1 | 29 |
| `APP.wireOn` | `viewer/tools.js:369` *(as `A.`)* | 2 | 7 |
| `APP.wlog` | `viewer/picking.js:89` *(as `A.`)* | 1 | 26 |
| `APP.x0` | — *phantom* | 0 | 1 |
| `APP.x1` | — *phantom* | 0 | 1 |
| `APP.xrayOn` | `viewer/tools.js:384` *(as `A.`)* | 4 | 38 |
| `APP.y0` | — *phantom* | 0 | 1 |
| `APP.y1` | — *phantom* | 0 | 1 |
| `APP.zoomToGuid` | `viewer/diff.js:187` *(as `A.`)* | 1 | 23 |
| `APP.zoomToGuids` | `viewer/diff.js:241` *(as `A.`)* | 1 | 3 |
