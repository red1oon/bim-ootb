# APP surface — generated index

> **Generated. Do not hand-edit.** `node scripts/gen_app_surface.js`
> Spec: `scripts/gen_app_surface.js` §W-APP-SURFACE. See CodeScrapBook §2 and §14.

The viewer god object is **written as `A.x`** (every module is `setupX(A)`) and
**read as `APP.x`**. Same object, two spellings — so `grep 'APP.camera ='` finds
nothing. This index is the missing "go to definition".

| | |
|---|---:|
| files scanned | 1669 |
| distinct fields | 1105 |
| written only as `A.x`/`app.x` (invisible to an `APP.` grep) | 991 |
| read but never written (phantom) | 53 |
| — of those, read from production code | 32 |

## Phantom fields — read, never written

Each is a guard that can never be true, or a writer that was removed. Check before use.

| field | first read site | prod? |
|---|---|---|
| `APP.LABOR_RATES` | `viewer/cpe_resource_panel.js:43` | **yes** |
| `APP.LIB_URL` | `tests/specs/10-deploy-integrity.spec.js:78` | no |
| `APP._allRoomVolumes` | `probe_buildpass_v2.js:80` | no |
| `APP._applyViewFilter` | `viewer/panels.js:2321` | **yes** |
| `APP._billboardImage` | `viewer/effects.js:2343` | **yes** |
| `APP._cinemaOrbitActive` | `viewer/dlod_nav.js:400` | **yes** |
| `APP._cpeViewfinderRender` | `viewer/main.js:740` | **yes** |
| `APP._envCache` | `tests/specs/20-s250-polish.spec.js:294` | no |
| `APP._gradePass` | `witness_photo_grade.js:58` | no |
| `APP._gridGroup` | `tests/specs/20-s250-polish.spec.js:250` | no |
| `APP._gridOverlayState` | `viewer/scene.js:2168` | **yes** |
| `APP._hba` | `viewer/hba_lens.js:223` | **yes** |
| `APP._hbaClassFilter` | `viewer/hba_lens.js:472` | **yes** |
| `APP._hbaPeriod` | `viewer/hba_avatars.js:63` | **yes** |
| `APP._mainPillActions` | `hr_bim_asset/tests/live/action_regression.js:19` | no |
| `APP._nav` | `tests/specs/17-find-navigate.spec.js:337` | **yes** |
| `APP._photoFacadeLightsDbg` | `probe_facade_warm_cool.js:56` | no |
| `APP._probeAimDepth` | `viewer/effects.js:7548` | **yes** |
| `APP._rangeDb` | `viewer/clash_narrow.js:379` | **yes** |
| `APP._resetAllVisibility` | `viewer/panels.js:2320` | **yes** |
| `APP._streaming` | `tests/specs/s271-mobile-perf.spec.js:84` | no |
| `APP._swCacheVersion` | `viewer/rule_checklist.js:305` | **yes** |
| `APP._teardownStillRefine` | `probe_ground_albedo.js:85` | no |
| `APP._tmState` | `tests/whitebox_regression.js:963` | no |
| `APP._updateFacadeFacing` | `probe_facade_warm_cool.js:88` | no |
| `APP._useMerge` | `viewer/streaming.js:2127` | **yes** |
| `APP._useRangeStream` | `viewer/clash_narrow.js:401` | **yes** |
| `APP._walkMode` | `viewer/panels.js:1358` | **yes** |
| `APP.advanceNavStep` | `viewer/tests/witness_room_cycle_home_2026-07-22.js:241` | no |
| `APP.buildRouteTemplate` | `tests/specs/17-find-navigate.spec.js:585` | no |
| `APP.buildingName` | `viewer/hba_iot.js:268` | **yes** |
| `APP.calls` | `tests/specs/99-shadow-perf.spec.js:10` | no |
| `APP.clearRouteCache` | `viewer/navigate_find.js:10` | **yes** |
| `APP.closeSunglass` | `viewer/main.js:292` | **yes** |
| `APP.contributeBuilding` | `tests/specs/20-s250-polish.spec.js:338` | no |
| `APP.currentBuilding` | `viewer/cpe_room_title.js:296` | **yes** |
| `APP.getRouteTemplate` | `tests/specs/17-find-navigate.spec.js:639` | no |
| `APP.kernelOps` | `viewer/time_machine.js:8990` | **yes** |
| `APP.materializeZones` | `optics_hud.js:31` | **yes** |
| `APP.navJumpToEnd` | `tests/specs/17-find-navigate.spec.js:179` | no |
| `APP.onSectionOff` | `viewer/tools.js:420` | **yes** |
| `APP.onSectionSliderChange` | `viewer/tools.js:488` | **yes** |
| `APP.probeGradeHdr` | `probe_grade_hdr.js:20` | no |
| `APP.ruleFindingsFilmBuild` | `cli_silent_bake.js:305` | **yes** |
| `APP.sky` | `viewer/effects.js:1083` | **yes** |
| `APP.startFlyTour` | `viewer/main.js:1148` | **yes** |
| `APP.startMaxQ` | `probe_bake_start.js:22` | no |
| `APP.startNavigation` | `viewer/navigate.js:37` | **yes** |
| `APP.stopNavigation` | `viewer/navigate_find.js:10` | **yes** |
| `APP.toast` | `viewer/dlod_nav.js:2005` | **yes** |
| `APP.toggleGridOverlay` | `tests/specs/28-grid-overlay-init.spec.js:3` | **yes** |
| `APP.viewer` | `probe_drag_scale.js:39` | no |
| `APP.walkSpeed` | `tests/specs/03-walk-sitecam-cycle.spec.js:227` | no |

## All fields

| field | written at | writes | reads |
|---|---|---:|---:|
| `APP.BLANK_MODE` | `viewer/config.js:23` *(as `A.`)* | 1 | 4 |
| `APP.BLD_BASE` | `viewer/config.js:31` *(as `A.`)* | 1 | 4 |
| `APP.CACHE_DB_NAME` | `viewer/scene.js:515` *(as `A.`)* | 1 | 4 |
| `APP.CACHE_STORE` | `viewer/scene.js:516` *(as `A.`)* | 1 | 43 |
| `APP.CITY_URL` | `viewer/config.js:30` *(as `A.`)* | 1 | 15 |
| `APP.CONTRIBUTE_PAR` | `viewer/config.js:89` *(as `A.`)* | 1 | 5 |
| `APP.DB_URL` | `erp/kanban_lens.html:243` | 2 | 74 |
| `APP.DEFAULT_COLOR` | `viewer/config.js:49` *(as `A.`)* | 1 | 8 |
| `APP.DISC_COLORS` | `viewer/config.js:43` *(as `A.`)* | 1 | 43 |
| `APP.EMBEDDED` | `viewer/config.js:34` *(as `A.`)* | 1 | 4 |
| `APP.FIND_GUID` | `viewer/config.js:40` *(as `A.`)* | 1 | 13 |
| `APP.FLYTHRU_BOX_EDGES` | `viewer/cpe_flythru_dims.js:541` *(as `A.`)* | 1 | 1 |
| `APP.FLYTHRU_DRAW_CONTRACT` | `viewer/cpe_flythru_dims.js:386` *(as `A.`)* | 1 | 1 |
| `APP.HOME_URL` | `viewer/config.js:36` *(as `A.`)* | 1 | 4 |
| `APP.LABOR_PROD` | `viewer/config.js:68` *(as `A.`)* | 1 | 1 |
| `APP.LABOR_RATES` | — *phantom* | 0 | 1 |
| `APP.LIB_URL` | — *phantom* | 0 | 1 |
| `APP.MATERIAL_COSTS` | `viewer/config.js:52` *(as `A.`)* | 1 | 5 |
| `APP.MEP_HUE_ACHROMATIC_MAX` | `viewer/streaming.js:670` *(as `A.`)* | 1 | 9 |
| `APP.PAN_SPEED` | `viewer/config.js:83` *(as `A.`)* | 1 | 2 |
| `APP.PHASE_MAP` | `viewer/config.js:74` *(as `A.`)* | 1 | 5 |
| `APP.PROD_BASE` | `viewer/config.js:21` *(as `A.`)* | 1 | 9 |
| `APP.RECORD_ID` | `viewer/config.js:35` *(as `A.`)* | 1 | 1 |
| `APP.WALK_EYE_HEIGHT` | `viewer/config.js:81` *(as `A.`)* | 1 | 17 |
| `APP.WALK_SPEED` | `viewer/config.js:82` *(as `A.`)* | 1 | 3 |
| `APP.WALK_STEP_COOLDOWN_MS` | `viewer/config.js:86` *(as `A.`)* | 1 | 2 |
| `APP.WALK_STEP_DISTANCE` | `viewer/config.js:85` *(as `A.`)* | 1 | 4 |
| `APP.WALK_STEP_THRESHOLD` | `viewer/config.js:84` *(as `A.`)* | 1 | 3 |
| `APP._CLASH_PAGE_SIZE` | `viewer/clash_report.js:106` *(as `A.`)* | 10 | 22 |
| `APP._MAX_CACHE_ENTRIES` | `viewer/scene.js:617` *(as `A.`)* | 1 | 3 |
| `APP._MERGE_GEO_TABLES` | `viewer/scene.js:924` *(as `A.`)* | 1 | 7 |
| `APP._MERGE_META_TABLES` | `viewer/scene.js:921` *(as `A.`)* | 1 | 5 |
| `APP._SQL` | `viewer/streaming.js:2934` *(as `A.`)* | 1 | 34 |
| `APP._TRIPLANAR_BY_NAME` | `viewer/streaming.js:1158` *(as `A.`)* | 1 | 5 |
| `APP._TRIPLANAR_MAT` | `viewer/streaming.js:1157` *(as `A.`)* | 1 | 5 |
| `APP.__cpeAimOff` | `witness_cpe_corr_brush.js:190` *(as `A.`)* | 2 | 3 |
| `APP._allRoomVolumes` | — *phantom* | 0 | 2 |
| `APP._alphaOf` | `viewer/streaming.js:743` *(as `A.`)* | 1 | 4 |
| `APP._ambienceTick` | `viewer/tools.js:676` *(as `A.`)* | 1 | 4 |
| `APP._applyDiscVisibility` | `viewer/panels.js:821` *(as `A.`)* | 1 | 7 |
| `APP._applyGroundTexture` | `viewer/tools.js:215` *(as `A.`)* | 1 | 8 |
| `APP._applyNightGlowToMatCache` | `viewer/tools.js:1232` *(as `A.`)* | 1 | 7 |
| `APP._applyPendingPatch` | `viewer/scene.js:1735` *(as `A.`)* | 1 | 7 |
| `APP._applyViewFilter` | — *phantom* | 0 | 4 |
| `APP._archGroundZ` | `viewer/city.js:274` *(as `A.`)* | 1 | 3 |
| `APP._areaBackups` | `viewer/measure.js:1226` *(as `A.`)* | 2 | 5 |
| `APP._areaCache` | `viewer/measure.js:1359` *(as `A.`)* | 1 | 4 |
| `APP._batchDiscMap` | `viewer/streaming.js:2006` *(as `A.`)* | 2 | 9 |
| `APP._batchFlushCount` | `viewer/streaming.js:2532` *(as `A.`)* | 1 | 4 |
| `APP._batchMeta` | `viewer/streaming.js:2004` *(as `A.`)* | 1 | 122 |
| `APP._batchStoreyMap` | `viewer/streaming.js:2005` *(as `A.`)* | 2 | 9 |
| `APP._bboxCleared` | `viewer/streaming.js:395` *(as `A.`)* | 5 | 10 |
| `APP._bboxMaterial` | `viewer/helpers.js:535` *(as `A.`)* | 1 | 6 |
| `APP._bboxPlaceholder` | `viewer/streaming.js:481` *(as `A.`)* | 1 | 1 |
| `APP._bboxPlaceholders` | `viewer/streaming.js:485` *(as `A.`)* | 2 | 8 |
| `APP._billboardAutoBuild` | `viewer/effects.js:2318` *(as `A.`)* | 1 | 3 |
| `APP._billboardFit` | `viewer/effects.js:2355` *(as `A.`)* | 1 | 3 |
| `APP._billboardImage` | — *phantom* | 0 | 5 |
| `APP._billboardNameState` | `viewer/effects.js:2531` *(as `A.`)* | 1 | 1 |
| `APP._bimGuidsForClass` | `viewer/main.js:48` | 1 | 2 |
| `APP._bimHighlight` | `viewer/main.js:55` | 1 | 3 |
| `APP._bimPostFocus` | `viewer/main.js:37` | 1 | 4 |
| `APP._blobToThumbUrl` | `viewer/issues.js:67` *(as `A.`)* | 1 | 2 |
| `APP._bloomOff` | `viewer/effects.js:5164` *(as `A.`)* | 2 | 4 |
| `APP._bloomPass` | `viewer/effects.js:92` *(as `A.`)* | 1 | 19 |
| `APP._bmShapeWarned` | `viewer/streaming.js:135` *(as `A.`)* | 1 | 2 |
| `APP._bom` | `viewer/panels.js:1181` *(as `A.`)* | 2 | 19 |
| `APP._bomDb` | `viewer/panels.js:2418` *(as `A.`)* | 1 | 7 |
| `APP._bsDrawErrLogged` | `viewer/cinema_maxq.js:846` *(as `A.`)* | 1 | 2 |
| `APP._buildBillboardArt` | `viewer/effects.js:2323` *(as `A.`)* | 1 | 3 |
| `APP._buildBillboardNamePlate` | `viewer/effects.js:2444` *(as `A.`)* | 1 | 3 |
| `APP._buildClashDeepLink` | `viewer/measure.js:790` *(as `A.`)* | 1 | 9 |
| `APP._buildExportHtml` | `viewer/clash_report.js:97` *(as `A.`)* | 1 | 5 |
| `APP._buildGraphRoute` | `viewer/tour.js:465` *(as `A.`)* | 1 | 3 |
| `APP._buildGraphRouteInner` | `viewer/tour.js:476` *(as `A.`)* | 1 | 2 |
| `APP._buildPill` | `viewer/panels.js:2291` *(as `A.`)* | 1 | 5 |
| `APP._buildSunglassPanel` | `viewer/panels.js:312` *(as `A.`)* | 1 | 3 |
| `APP._buildTourInner` | `viewer/tour.js:822` *(as `A.`)* | 1 | 2 |
| `APP._buildingCol` | `viewer/scene.js:1015` *(as `A.`)* | 4 | 9 |
| `APP._bvhPending` | `viewer/streaming.js:1765` *(as `A.`)* | 3 | 14 |
| `APP._bvhRunning` | `viewer/streaming.js:1767` *(as `A.`)* | 2 | 6 |
| `APP._cacheDisabled` | `viewer/scene.js:526` *(as `A.`)* | 3 | 8 |
| `APP._cacheHitLogged` | `viewer/scene.js:1511` *(as `A.`)* | 1 | 4 |
| `APP._cacheIssuesForExport` | `viewer/excel.js:9` *(as `A.`)* | 1 | 3 |
| `APP._cachedIssues` | `viewer/excel.js:7` *(as `A.`)* | 3 | 4 |
| `APP._cachedPairCounts` | `viewer/clash_report.js:10` *(as `A.`)* | 4 | 11 |
| `APP._calcGroundY` | `viewer/tools.js:8` *(as `A.`)* | 1 | 10 |
| `APP._camBimSnapshot` | `viewer/sitecam.js:33` *(as `A.`)* | 2 | 4 |
| `APP._camGpsPos` | `viewer/clash_snag.js:19` *(as `A.`)* | 5 | 31 |
| `APP._camHeading` | `viewer/sitecam.js:34` *(as `A.`)* | 3 | 15 |
| `APP._camLight` | `viewer/effects.js:3844` *(as `A.`)* | 1 | 19 |
| `APP._camOrientHandler` | `viewer/sitecam.js:35` *(as `A.`)* | 4 | 10 |
| `APP._camPhotoBlob` | `viewer/clash_snag.js:104` *(as `A.`)* | 4 | 4 |
| `APP._camStream` | `viewer/sitecam.js:29` *(as `A.`)* | 3 | 6 |
| `APP._camTimerIv` | `viewer/sitecam.js:32` *(as `A.`)* | 3 | 5 |
| `APP._canvasCoords` | `viewer/sitecam.js:391` *(as `A.`)* | 1 | 3 |
| `APP._canvasPointerDown` | `viewer/picking.js:97` *(as `A.`)* | 4 | 5 |
| `APP._catFirst` | `probe_dim_catalogue.js:206` *(as `A.`)* | 1 | 2 |
| `APP._checkCache` | `viewer/scene.js:672` *(as `A.`)* | 1 | 5 |
| `APP._chromaOf` | `viewer/streaming.js:674` *(as `A.`)* | 1 | 7 |
| `APP._cinemaFanMeshesDebug` | `viewer/effects.js:6366` *(as `A.`)* | 1 | 5 |
| `APP._cinemaOrbitActive` | — *phantom* | 0 | 3 |
| `APP._cinemaPathEdit` | `viewer/effects.js:9179` *(as `A.`)* | 24 | 46 |
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
| `APP._cityElemBudget` | `viewer/city.js:87` *(as `A.`)* | 1 | 4 |
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
| `APP._cityRayBlast` | `viewer/city.js:915` *(as `A.`)* | 1 | 3 |
| `APP._cityRayBlastCols` | `viewer/city.js:848` *(as `A.`)* | 1 | 2 |
| `APP._cityRayBlastRows` | `viewer/city.js:849` *(as `A.`)* | 1 | 2 |
| `APP._cityResidentBytes` | `viewer/city.js:105` *(as `A.`)* | 1 | 9 |
| `APP._cityResidentElems` | `viewer/city.js:106` *(as `A.`)* | 1 | 6 |
| `APP._cityResidentOrder` | `viewer/city.js:85` *(as `A.`)* | 2 | 16 |
| `APP._cityRestoreBboxes` | `viewer/city.js:43` *(as `A.`)* | 1 | 2 |
| `APP._cityRestoreBuildingBboxes` | `viewer/city.js:65` *(as `A.`)* | 1 | 1 |
| `APP._citySQL` | `viewer/streaming.js:2950` *(as `A.`)* | 1 | 5 |
| `APP._citySmallFirst` | `viewer/city.js:862` *(as `A.`)* | 1 | 3 |
| `APP._citySmallThreshold` | `viewer/city.js:579` *(as `A.`)* | 1 | 3 |
| `APP._citySneak` | `viewer/city.js:577` *(as `A.`)* | 3 | 19 |
| `APP._citySneakEnabled` | `viewer/city.js:578` *(as `A.`)* | 1 | 1 |
| `APP._citySneakNext` | `viewer/city.js:961` *(as `A.`)* | 1 | 1 |
| `APP._cityStreamNext` | `viewer/city.js:970` *(as `A.`)* | 1 | 6 |
| `APP._cityStreamRows` | `viewer/city.js:952` *(as `A.`)* | 1 | 3 |
| `APP._cityTagAndBudget` | `viewer/city.js:111` *(as `A.`)* | 1 | 3 |
| `APP._clashBackups` | `viewer/measure.js:593` *(as `A.`)* | 2 | 3 |
| `APP._clashBboxCloud` | `viewer/measure.js:1685` *(as `A.`)* | 2 | 8 |
| `APP._clashBboxMap` | `viewer/measure.js:1737` *(as `A.`)* | 1 | 6 |
| `APP._clashDiscCache` | `viewer/clash_matrix.js:13` *(as `A.`)* | 1 | 7 |
| `APP._clashEnvelopes` | `viewer/clash_matrix.js:345` *(as `A.`)* | 3 | 5 |
| `APP._clashExistsPerPair` | `viewer/measure.js:213` *(as `A.`)* | 1 | 1 |
| `APP._clashFilmUpdateWarned` | `viewer/cinema_maxq.js:1824` *(as `A.`)* | 1 | 2 |
| `APP._clashHighlights` | `viewer/issues.js:176` *(as `A.`)* | 5 | 18 |
| `APP._clashHudHighlightLast` | `viewer/cinema_maxq.js:1674` *(as `A.`)* | 5 | 9 |
| `APP._clashIndexesReady` | `viewer/measure.js:101` *(as `A.`)* | 2 | 3 |
| `APP._clashLblDrawErrLogged` | `viewer/cinema_maxq.js:808` *(as `A.`)* | 1 | 2 |
| `APP._clashLblErrLogged` | `viewer/cinema_maxq.js:1816` *(as `A.`)* | 1 | 2 |
| `APP._clashLblStopped` | `viewer/cinema_maxq.js:1517` *(as `A.`)* | 2 | 3 |
| `APP._clashListDiv` | `viewer/measure.js:921` *(as `A.`)* | 5 | 54 |
| `APP._clashListNav` | `viewer/scene.js:2345` *(as `A.`)* | 1 | 4 |
| `APP._clashLodUpdateFreq` | `viewer/measure.js:1686` *(as `A.`)* | 1 | 2 |
| `APP._clashMatrixDiv` | `viewer/clash_matrix.js:251` *(as `A.`)* | 7 | 38 |
| `APP._clashModeActive` | `viewer/measure.js:1684` *(as `A.`)* | 3 | 11 |
| `APP._clashPairKey` | `viewer/measure.js:618` *(as `A.`)* | 1 | 10 |
| `APP._clashPairOffset` | `viewer/clash_matrix.js:294` *(as `A.`)* | 7 | 8 |
| `APP._clashProxMeshes` | `viewer/measure.js:1689` *(as `A.`)* | 4 | 8 |
| `APP._clashProxSet` | `viewer/measure.js:1688` *(as `A.`)* | 3 | 7 |
| `APP._clashRevealActive` | `viewer/measure.js:592` *(as `A.`)* | 4 | 12 |
| `APP._clashRtreeBuilding` | `viewer/measure.js:103` *(as `A.`)* | 6 | 7 |
| `APP._clashRtreeReady` | `viewer/measure.js:102` *(as `A.`)* | 4 | 24 |
| `APP._clashRules` | `viewer/measure.js:73` *(as `A.`)* | 2 | 4 |
| `APP._clashRulesLoading` | `viewer/measure.js:74` *(as `A.`)* | 4 | 5 |
| `APP._clashSeverity` | `viewer/measure.js:584` *(as `A.`)* | 1 | 7 |
| `APP._clashStatusCycle` | `viewer/measure.js:596` *(as `A.`)* | 1 | 2 |
| `APP._clashStatusKey` | `viewer/measure.js:605` *(as `A.`)* | 1 | 3 |
| `APP._clashStatusStyles` | `viewer/measure.js:597` *(as `A.`)* | 1 | 2 |
| `APP._clashStatuses` | `viewer/measure.js:608` *(as `A.`)* | 3 | 16 |
| `APP._clashWhereParts` | `viewer/measure.js:193` *(as `A.`)* | 1 | 12 |
| `APP._clearBboxPlaceholders` | `viewer/streaming.js:554` *(as `A.`)* | 1 | 5 |
| `APP._cloudPlane` | `viewer/scene.js:377` *(as `A.`)* | 1 | 1 |
| `APP._cloudTex` | `viewer/scene.js:378` *(as `A.`)* | 1 | 1 |
| `APP._collectAllMeshes` | `viewer/tools.js:607` *(as `A.`)* | 1 | 9 |
| `APP._composer` | `viewer/effects.js:10` *(as `A.`)* | 3 | 82 |
| `APP._composerEnabled` | `viewer/effects.js:13` *(as `A.`)* | 10 | 16 |
| `APP._compositePhoto` | `viewer/sitecam.js:247` *(as `A.`)* | 1 | 5 |
| `APP._connectApplying` | `viewer/main.js:87` | 2 | 3 |
| `APP._consolidateBatched` | `viewer/streaming.js:2774` *(as `A.`)* | 1 | 1 |
| `APP._countClashesAsync` | `viewer/measure.js:468` *(as `A.`)* | 1 | 3 |
| `APP._countClashesRtree` | `viewer/clash_matrix.js:15` *(as `A.`)* | 1 | 4 |
| `APP._cpeAimFreezeOff` | `witness_cpe_corr_brush.js:152` *(as `A.`)* | 6 | 8 |
| `APP._cpeBeat3GazeDebug` | `viewer/effects.js:7274` *(as `A.`)* | 2 | 13 |
| `APP._cpeBeat3PoseDebug` | `viewer/effects.js:7265` *(as `A.`)* | 1 | 3 |
| `APP._cpeCorrBranchOff` | `witness_cpe_aim_retire.js:322` *(as `A.`)* | 4 | 5 |
| `APP._cpeCorrectionsDebug` | `viewer/effects.js:7259` *(as `A.`)* | 1 | 9 |
| `APP._cpeGazeClearDebug` | `viewer/effects.js:7291` *(as `A.`)* | 1 | 9 |
| `APP._cpePinZonesDebug` | `viewer/effects.js:7011` *(as `A.`)* | 1 | 8 |
| `APP._cpeRevealLightsOff` | `viewer/cinema_maxq.js:1832` *(as `A.`)* | 1 | 8 |
| `APP._cpeRevealLightsOffLast` | `viewer/cinema_maxq.js:1834` *(as `A.`)* | 1 | 2 |
| `APP._cpeRevealSavedHidden` | `viewer/effects.js:5977` *(as `A.`)* | 3 | 6 |
| `APP._cpeRevealVisualKey` | `viewer/effects.js:5978` *(as `A.`)* | 2 | 4 |
| `APP._cpeTailGlowLogged` | `viewer/effects.js:4738` *(as `A.`)* | 1 | 2 |
| `APP._cpeViewfinderRender` | — *phantom* | 0 | 9 |
| `APP._createIsSOTrx` | `erp/idempiere.html:3637` | 1 | 4 |
| `APP._createMovementType` | `erp/idempiere.html:3645` | 1 | 2 |
| `APP._csvExportInProgress` | `viewer/clash_report.js:9` *(as `A.`)* | 4 | 5 |
| `APP._currentClashPairLabel` | `viewer/clash_matrix.js:316` *(as `A.`)* | 3 | 6 |
| `APP._currentClashRules` | `viewer/issues.js:174` *(as `A.`)* | 5 | 12 |
| `APP._currentClashStorey` | `viewer/measure.js:1578` *(as `A.`)* | 2 | 7 |
| `APP._currentClashViewIdx` | `viewer/measure.js:624` *(as `A.`)* | 1 | 3 |
| `APP._currentClashes` | `viewer/clash_matrix.js:315` *(as `A.`)* | 10 | 45 |
| `APP._dbPersistUrl` | `viewer/streaming.js:3084` *(as `A.`)* | 2 | 17 |
| `APP._debugForceGhostLensOwned` | `viewer/navigate_find.js:1642` *(as `A.`)* | 1 | 7 |
| `APP._debugGhostLensOwned` | `viewer/navigate_find.js:1647` *(as `A.`)* | 1 | 4 |
| `APP._deepLinkCamOverride` | `viewer/issues.js:182` *(as `A.`)* | 3 | 5 |
| `APP._diffToVoRows` | `viewer/diff.js:350` *(as `A.`)* | 1 | 3 |
| `APP._dimClear` | `probe_dim_cue_demo.js:116` *(as `A.`)* | 1 | 2 |
| `APP._dimDrawCue` | `probe_dim_cue_demo.js:90` *(as `A.`)* | 1 | 2 |
| `APP._dimPickTargets` | `probe_dim_cue_demo.js:75` *(as `A.`)* | 1 | 2 |
| `APP._dimTargetFor` | `probe_dim_cue_demo.js:42` *(as `A.`)* | 1 | 4 |
| `APP._dismissClashes` | `viewer/measure.js:1150` *(as `A.`)* | 1 | 10 |
| `APP._dlodBboxGeo` | `viewer/scene.js:455` *(as `A.`)* | 1 | 2 |
| `APP._dlodEnabled` | `viewer/dlod.js:14` *(as `A.`)* | 4 | 15 |
| `APP._dlodFrame` | `viewer/dlod.js:15` *(as `A.`)* | 10 | 12 |
| `APP._dlodPaused` | `viewer/dlod.js:16` *(as `A.`)* | 1 | 2 |
| `APP._dlodSlots` | `viewer/streaming.js:20` *(as `A.`)* | 1 | 2 |
| `APP._doMeasureClick` | `viewer/measure.js:1262` *(as `A.`)* | 1 | 2 |
| `APP._doReportBug` | `viewer/helpers.js:241` *(as `A.`)* | 1 | 8 |
| `APP._docEnv` | `viewer/doc_canvas.js:566` *(as `A.`)* | 1 | 32 |
| `APP._downloadClashSnag` | `viewer/clash_snag.js:244` *(as `A.`)* | 1 | 4 |
| `APP._downloadRuleReport` | `viewer/rule_checklist.js:274` *(as `A.`)* | 1 | 2 |
| `APP._drawBboxPlaceholders` | `viewer/streaming.js:486` *(as `A.`)* | 1 | 9 |
| `APP._drawMiniQR` | `viewer/sitecam.js:234` *(as `A.`)* | 1 | 2 |
| `APP._drawStroke` | `viewer/sitecam.js:365` *(as `A.`)* | 1 | 3 |
| `APP._driveBtn` | `viewer/sitecam.js:153` *(as `A.`)* | 3 | 13 |
| `APP._driveBtnWasActive` | `viewer/sitecam.js:154` *(as `A.`)* | 2 | 5 |
| `APP._driveHoldCount` | `viewer/walk.js:406` *(as `A.`)* | 2 | 4 |
| `APP._driveHoldInterval` | `viewer/walk.js:405` *(as `A.`)* | 4 | 8 |
| `APP._egressRulesCache` | `viewer/rule_checklist.js:717` *(as `A.`)* | 2 | 4 |
| `APP._egressRulesSource` | `viewer/rule_checklist.js:717` *(as `A.`)* | 2 | 3 |
| `APP._emberEnabled` | `viewer/effects.js:4567` *(as `A.`)* | 2 | 5 |
| `APP._ensureClashIndexes` | `viewer/measure.js:107` *(as `A.`)* | 1 | 7 |
| `APP._ensureRoomsInflight` | `viewer/navigate_find.js:939` *(as `A.`)* | 2 | 8 |
| `APP._enterClashMode` | `viewer/measure.js:1693` *(as `A.`)* | 1 | 4 |
| `APP._entourageVariant` | `viewer/streaming.js:581` *(as `A.`)* | 1 | 6 |
| `APP._envCache` | — *phantom* | 0 | 2 |
| `APP._envMap` | `viewer/effects.js:3533` *(as `A.`)* | 5 | 39 |
| `APP._envMapHdriActive` | `viewer/effects.js:3696` *(as `A.`)* | 2 | 6 |
| `APP._envMapThrottle` | `viewer/scene.js:297` *(as `A.`)* | 2 | 5 |
| `APP._envmapStompStats` | `viewer/scene.js:214` *(as `A.`)* | 1 | 1 |
| `APP._evictOldest` | `viewer/scene.js:621` *(as `A.`)* | 1 | 3 |
| `APP._exitClashMode` | `viewer/measure.js:1784` *(as `A.`)* | 1 | 9 |
| `APP._exportBuildingDb` | `viewer/scene.js:805` *(as `A.`)* | 1 | 21 |
| `APP._exportCSVBackground` | `viewer/clash_report.js:391` *(as `A.`)* | 1 | 5 |
| `APP._exportClashReport` | `viewer/clash_report.js:16` *(as `A.`)* | 1 | 4 |
| `APP._exportInProgress` | `viewer/clash_report.js:8` *(as `A.`)* | 4 | 6 |
| `APP._facadeWarmCool` | `viewer/effects.js:368` | 5 | 6 |
| `APP._flushBboxBatched` | `viewer/streaming.js:2602` *(as `A.`)* | 1 | 2 |
| `APP._flushInstanced` | `viewer/streaming.js:2115` *(as `A.`)* | 1 | 3 |
| `APP._flyPreparing` | `viewer/tour.js:70` *(as `A.`)* | 3 | 6 |
| `APP._flyToClash` | `viewer/measure.js:621` *(as `A.`)* | 1 | 11 |
| `APP._flythruCueWarned` | `viewer/cinema_maxq.js:1787` *(as `A.`)* | 1 | 2 |
| `APP._flythruCuesLast` | `viewer/cpe_flythru_cues.js:514` *(as `A.`)* | 1 | 4 |
| `APP._flythruDatumAtWarned` | `viewer/cinema_maxq.js:1774` *(as `A.`)* | 1 | 2 |
| `APP._flythruDatumLast` | `viewer/cpe_flythru_datum.js:411` *(as `A.`)* | 2 | 7 |
| `APP._flythruDatumOn` | `viewer/cinema_maxq.js:1547` *(as `A.`)* | 1 | 4 |
| `APP._flythruDatumWarned` | `viewer/cinema_maxq.js:790` *(as `A.`)* | 1 | 2 |
| `APP._flythruDimWarned` | `viewer/cinema_maxq.js:794` *(as `A.`)* | 1 | 2 |
| `APP._flythruFilmSec` | `viewer/cinema_maxq.js:1786` *(as `A.`)* | 1 | 3 |
| `APP._flythruFilmSecFull` | `viewer/cinema_maxq.js:1546` *(as `A.`)* | 1 | 2 |
| `APP._forceNoMerge` | `viewer/streaming.js:480` *(as `A.`)* | 2 | 3 |
| `APP._formatGps` | `viewer/sitecam.js:48` *(as `A.`)* | 1 | 7 |
| `APP._formatIssueGps` | `viewer/issues.js:87` *(as `A.`)* | 1 | 3 |
| `APP._formatTimestamp` | `viewer/sitecam.js:58` *(as `A.`)* | 1 | 8 |
| `APP._frontSideClasses` | `viewer/streaming.js:902` *(as `A.`)* | 1 | 3 |
| `APP._getAllIssues` | `viewer/issues.js:56` *(as `A.`)* | 1 | 3 |
| `APP._getAutoStageState` | `viewer/effects.js:5369` *(as `A.`)* | 1 | 1 |
| `APP._getCamBimInfo` | `viewer/sitecam.js:37` *(as `A.`)* | 1 | 6 |
| `APP._getCinemaPathEdit` | `viewer/effects.js:9213` *(as `A.`)* | 1 | 26 |
| `APP._getImport` | `viewer/import.js:601` *(as `A.`)* | 1 | 8 |
| `APP._getMarkupBlob` | `viewer/sitecam.js:442` *(as `A.`)* | 1 | 6 |
| `APP._getMaterial` | `viewer/streaming.js:907` *(as `A.`)* | 1 | 17 |
| `APP._getPhotoSkyline` | `viewer/effects.js:4535` *(as `A.`)* | 1 | 4 |
| `APP._getPhotoSparkles` | `viewer/effects.js:4534` *(as `A.`)* | 1 | 2 |
| `APP._getStaffageInstances` | `viewer/effects.js:1785` *(as `A.`)* | 1 | 10 |
| `APP._ghostGlass` | `viewer/ghostglass.js:310` | 1 | 13 |
| `APP._giComposer` | `viewer/effects_gi_poc.js:11` *(as `A.`)* | 5 | 19 |
| `APP._giComposerActive` | `viewer/effects_gi_poc.js:12` *(as `A.`)* | 5 | 27 |
| `APP._giN8aoPass` | `viewer/effects_gi_poc.js:86` *(as `A.`)* | 1 | 25 |
| `APP._glowQuadZeroLogged` | `viewer/effects.js:3867` *(as `A.`)* | 2 | 3 |
| `APP._glowSpriteCount` | `viewer/effects.js:4890` *(as `A.`)* | 1 | 7 |
| `APP._glowSpriteEnabled` | `viewer/effects.js:4678` *(as `A.`)* | 2 | 4 |
| `APP._glowStage` | `viewer/effects.js:4898` *(as `A.`)* | 1 | 1 |
| `APP._glowUnstage` | `viewer/effects.js:4899` *(as `A.`)* | 1 | 3 |
| `APP._goldenHue` | `viewer/tools.js:605` *(as `A.`)* | 1 | 2 |
| `APP._grMemo` | `viewer/tour.js:278` *(as `A.`)* | 3 | 7 |
| `APP._gradeOff` | `probe_grade_hdr.js:37` | 2 | 2 |
| `APP._gradePass` | — *phantom* | 0 | 2 |
| `APP._gridGroup` | — *phantom* | 0 | 1 |
| `APP._gridOverlayState` | — *phantom* | 0 | 8 |
| `APP._groundAlbedoGain` | `viewer/effects.js:3663` *(as `A.`)* | 3 | 10 |
| `APP._groundCfgDefault` | `viewer/tools.js:107` *(as `A.`)* | 1 | 5 |
| `APP._groundConfig` | `viewer/tools.js:116` *(as `A.`)* | 3 | 8 |
| `APP._groundDetailMean` | `viewer/tools.js:177` *(as `A.`)* | 2 | 6 |
| `APP._groundSolidColor` | `viewer/tools.js:120` *(as `A.`)* | 2 | 6 |
| `APP._groundTexCache` | `viewer/tools.js:117` *(as `A.`)* | 1 | 7 |
| `APP._groundTexKey` | `viewer/tools.js:118` *(as `A.`)* | 2 | 5 |
| `APP._groundUserPicked` | `viewer/tools.js:119` *(as `A.`)* | 2 | 3 |
| `APP._groundWetnessOverride` | `viewer/effects.js:3393` *(as `A.`)* | 2 | 10 |
| `APP._groupBy` | `viewer/tools.js:624` *(as `A.`)* | 1 | 19 |
| `APP._guidToMesh` | `viewer/measure.js:1237` *(as `A.`)* | 1 | 1 |
| `APP._hasBbox` | `viewer/streaming.js:345` *(as `A.`)* | 6 | 22 |
| `APP._hasBuildingCol` | `viewer/streaming.js:258` *(as `A.`)* | 1 | 13 |
| `APP._hasMatNameCol` | `viewer/streaming.js:289` *(as `A.`)* | 1 | 2 |
| `APP._hasMultiDraw` | `viewer/scene.js:59` *(as `A.`)* | 2 | 4 |
| `APP._hba` | — *phantom* | 0 | 3 |
| `APP._hbaAttendanceLog` | `viewer/hba_lens.js:262` *(as `A.`)* | 1 | 15 |
| `APP._hbaAttendanceSpec` | `viewer/hba_lens.js:387` *(as `A.`)* | 1 | 12 |
| `APP._hbaBomSpec` | `viewer/hba_lens.js:395` *(as `A.`)* | 1 | 8 |
| `APP._hbaClassFilter` | — *phantom* | 0 | 1 |
| `APP._hbaEmpResourceMap` | `viewer/hba_lens.js:386` *(as `A.`)* | 1 | 5 |
| `APP._hbaLeaveSpec` | `viewer/hba_lens.js:291` *(as `A.`)* | 1 | 4 |
| `APP._hbaOccupancyLog` | `viewer/hba_lens.js:255` *(as `A.`)* | 1 | 12 |
| `APP._hbaPayrollSpec` | `viewer/hba_lens.js:281` *(as `A.`)* | 2 | 10 |
| `APP._hbaPeriod` | — *phantom* | 0 | 6 |
| `APP._hbaRequestLog` | `viewer/hba_lens.js:273` *(as `A.`)* | 1 | 7 |
| `APP._hbaResourceSpec` | `viewer/hba_lens.js:306` *(as `A.`)* | 1 | 8 |
| `APP._hbaRoomFootprint` | `viewer/hba_lens.js:220` *(as `A.`)* | 1 | 5 |
| `APP._hbaRoomMembers` | `viewer/hba_lens.js:232` *(as `A.`)* | 3 | 20 |
| `APP._hbaRooms` | `viewer/hba_lens.js:225` *(as `A.`)* | 2 | 30 |
| `APP._hbaSpaceClass` | `viewer/hba_lens.js:206` *(as `A.`)* | 1 | 3 |
| `APP._hbaStoreyOf` | `viewer/hba_lens.js:225` *(as `A.`)* | 2 | 11 |
| `APP._hbaTenancySpec` | `viewer/hba_lens.js:298` *(as `A.`)* | 2 | 17 |
| `APP._highlightMesh` | `viewer/measure.js:1410` *(as `A.`)* | 1 | 3 |
| `APP._historyOpened` | `viewer/streaming.js:1818` *(as `A.`)* | 1 | 4 |
| `APP._hoverNameState` | `viewer/hover_name.js:172` *(as `A.`)* | 1 | 3 |
| `APP._hrCost` | `viewer/time_machine.js:8726` *(as `app.`)* | 1 | 20 |
| `APP._indoorBeatsAtWarned` | `viewer/cinema_maxq.js:1783` *(as `A.`)* | 1 | 2 |
| `APP._indoorBeatsWarned` | `viewer/cinema_maxq.js:803` *(as `A.`)* | 1 | 2 |
| `APP._infoCardDiv` | `viewer/measure.js:1238` *(as `A.`)* | 6 | 11 |
| `APP._initMarkupListeners` | `viewer/sitecam.js:400` *(as `A.`)* | 1 | 3 |
| `APP._initSnagTable` | `viewer/helpers.js:462` *(as `A.`)* | 1 | 3 |
| `APP._instDiscMixed` | `viewer/streaming.js:2252` *(as `A.`)* | 1 | 6 |
| `APP._instDiscUniform` | `viewer/streaming.js:2251` *(as `A.`)* | 1 | 7 |
| `APP._instMepMixed` | `viewer/streaming.js:2215` *(as `A.`)* | 2 | 5 |
| `APP._instMepUniform` | `viewer/streaming.js:2216` *(as `A.`)* | 2 | 5 |
| `APP._installGroundShader` | `viewer/tools.js:178` *(as `A.`)* | 1 | 2 |
| `APP._installMergedRaycast` | `viewer/streaming.js:2052` *(as `A.`)* | 1 | 2 |
| `APP._instanceGuids` | `viewer/streaming.js:473` *(as `A.`)* | 2 | 10 |
| `APP._instanceMeta` | `viewer/navigate_find.js:1857` *(as `A.`)* | 3 | 118 |
| `APP._isAuthoredMatName` | `viewer/streaming.js:684` *(as `A.`)* | 1 | 4 |
| `APP._isMobile` | `viewer/streaming.js:474` *(as `A.`)* | 1 | 22 |
| `APP._isPhotoGlossyMat` | `viewer/effects.js:2924` *(as `A.`)* | 1 | 12 |
| `APP._isWebGPU` | `viewer/scene.js:102` *(as `A.`)* | 1 | 3 |
| `APP._isWhiteMat` | `viewer/tools.js:597` *(as `A.`)* | 1 | 1 |
| `APP._issueBackToList` | `viewer/issues.js:237` *(as `A.`)* | 1 | 2 |
| `APP._jsonRegistry` | `viewer/panels.js:2189` *(as `A.`)* | 1 | 2 |
| `APP._lastClashLodUpdate` | `viewer/measure.js:1687` *(as `A.`)* | 2 | 3 |
| `APP._lastFlushIdx` | `viewer/streaming.js:394` *(as `A.`)* | 4 | 6 |
| `APP._lastMeasureTap` | `viewer/picking.js:178` *(as `A.`)* | 2 | 4 |
| `APP._lastPickCenter` | `viewer/picking.js:235` *(as `A.`)* | 4 | 4 |
| `APP._lastPickGuid` | `viewer/picking.js:235` *(as `A.`)* | 5 | 8 |
| `APP._lensflare` | `viewer/scene.js:426` *(as `A.`)* | 1 | 33 |
| `APP._libHasNormals` | `viewer/streaming.js:18` *(as `A.`)* | 5 | 18 |
| `APP._linearBeatWarned` | `viewer/cinema_maxq.js:799` *(as `A.`)* | 1 | 2 |
| `APP._loadClashRules` | `viewer/measure.js:76` *(as `A.`)* | 1 | 11 |
| `APP._loadClashStatuses` | `viewer/measure.js:609` *(as `A.`)* | 1 | 2 |
| `APP._loadGroundConfig` | `viewer/tools.js:122` *(as `A.`)* | 1 | 3 |
| `APP._loadNightFixtures` | `viewer/tools.js:1277` *(as `A.`)* | 1 | 6 |
| `APP._loadRemainingStoreys` | `viewer/measure.js:420` *(as `A.`)* | 1 | 3 |
| `APP._longPressFired` | `viewer/measure.js:1204` *(as `A.`)* | 4 | 5 |
| `APP._longPressTimer` | `viewer/measure.js:1203` *(as `A.`)* | 7 | 15 |
| `APP._mainPillActions` | — *phantom* | 0 | 1 |
| `APP._makeDraggable` | `viewer/measure.js:13` *(as `A.`)* | 1 | 21 |
| `APP._markupActive` | `viewer/sitecam.js:332` *(as `A.`)* | 4 | 6 |
| `APP._markupBaseImage` | `viewer/clash_snag.js:102` *(as `A.`)* | 3 | 4 |
| `APP._markupCanvas` | `viewer/sitecam.js:404` *(as `A.`)* | 1 | 2 |
| `APP._markupColor` | `viewer/sitecam.js:329` *(as `A.`)* | 2 | 3 |
| `APP._markupListenersSet` | `viewer/clash_snag.js:105` *(as `A.`)* | 4 | 5 |
| `APP._markupStart` | `viewer/sitecam.js:333` *(as `A.`)* | 1 | 1 |
| `APP._markupStrokes` | `viewer/clash_snag.js:103` *(as `A.`)* | 3 | 6 |
| `APP._markupTool` | `viewer/sitecam.js:328` *(as `A.`)* | 2 | 8 |
| `APP._matCache` | `viewer/streaming.js:471` *(as `A.`)* | 7 | 81 |
| `APP._matNameCol` | `viewer/streaming.js:288` *(as `A.`)* | 6 | 13 |
| `APP._maxqActive` | `viewer/cinema_maxq.js:1053` *(as `A.`)* | 8 | 28 |
| `APP._measureCardLast` | `viewer/cinema_maxq.js:1516` *(as `A.`)* | 2 | 3 |
| `APP._measureClickTimer` | `viewer/measure.js:1202` *(as `A.`)* | 6 | 14 |
| `APP._measureFirstMesh` | `viewer/measure.js:1280` *(as `A.`)* | 3 | 4 |
| `APP._mepDiscAlbedo` | `viewer/streaming.js:721` *(as `A.`)* | 1 | 8 |
| `APP._mepHueClasses` | `viewer/streaming.js:662` *(as `A.`)* | 1 | 10 |
| `APP._mepHueCounts` | `viewer/streaming.js:1207` *(as `A.`)* | 2 | 5 |
| `APP._mepHueOff` | `viewer/tests/witness_mep_color_photoreal.js:33` *(as `A.`)* | 6 | 11 |
| `APP._mepHueRollup` | `viewer/streaming.js:810` *(as `A.`)* | 1 | 3 |
| `APP._mepNameHint` | `viewer/streaming.js:604` *(as `A.`)* | 1 | 7 |
| `APP._mepSmoothDone` | `viewer/effects.js:2239` *(as `A.`)* | 2 | 5 |
| `APP._mepTradeHue` | `viewer/streaming.js:690` *(as `A.`)* | 1 | 2 |
| `APP._mergeActive` | `viewer/streaming.js:2515` *(as `A.`)* | 2 | 3 |
| `APP._mergeDbIntoScene` | `viewer/scene.js:1050` *(as `A.`)* | 1 | 3 |
| `APP._mergeLogged` | `viewer/streaming.js:2153` *(as `A.`)* | 2 | 3 |
| `APP._mergeOverride` | `viewer/streaming.js:2142` *(as `A.`)* | 1 | 3 |
| `APP._mergePending` | `viewer/scene.js:1155` *(as `A.`)* | 2 | 17 |
| `APP._mergeSplitDbIntoScene` | `viewer/scene.js:1167` *(as `A.`)* | 1 | 3 |
| `APP._mergeStreamNext` | `viewer/scene.js:1277` *(as `A.`)* | 1 | 5 |
| `APP._mergedIndex` | `viewer/streaming.js:2011` *(as `A.`)* | 2 | 8 |
| `APP._mergedMeta` | `viewer/streaming.js:2010` *(as `A.`)* | 2 | 17 |
| `APP._mergedRayStats` | `viewer/streaming.js:2014` *(as `A.`)* | 1 | 6 |
| `APP._meshArea` | `viewer/measure.js:1360` *(as `A.`)* | 1 | 3 |
| `APP._meshVolume` | `viewer/measure.js:1401` *(as `A.`)* | 1 | 1 |
| `APP._metaGen` | `viewer/city.js:164` *(as `A.`)* | 5 | 19 |
| `APP._mobileRenderSkip` | `viewer/main.js:925` | 2 | 4 |
| `APP._moon` | `viewer/time_machine.js:2468` *(as `app.`)* | 3 | 14 |
| `APP._nav` | — *phantom* | 0 | 40 |
| `APP._navigateLoaded` | `viewer/main.js:125` | 3 | 37 |
| `APP._navigatePromise` | `viewer/main.js:128` | 1 | 4 |
| `APP._nightBakePool` | `viewer/tools.js:1774` *(as `A.`)* | 2 | 18 |
| `APP._nightControlsListener` | `viewer/tools.js:1581` *(as `A.`)* | 2 | 6 |
| `APP._nightFixturePositions` | `viewer/tools.js:1280` *(as `A.`)* | 3 | 5 |
| `APP._nightFixtureSource` | `viewer/tools.js:1461` *(as `A.`)* | 1 | 3 |
| `APP._nightFixtureWorldPositions` | `viewer/tools.js:1665` *(as `A.`)* | 1 | 18 |
| `APP._nightFixtures` | `viewer/tools.js:1063` *(as `A.`)* | 2 | 19 |
| `APP._nightGlowClasses` | `viewer/tools.js:1513` *(as `A.`)* | 1 | 5 |
| `APP._nightGlowMatKeys` | `viewer/tools.js:1511` *(as `A.`)* | 2 | 7 |
| `APP._nightGlowMats` | `viewer/tools.js:1510` *(as `A.`)* | 2 | 9 |
| `APP._nightLightByPos` | `viewer/tools.js:1632` *(as `A.`)* | 2 | 16 |
| `APP._nightLights` | `viewer/tools.js:1062` *(as `A.`)* | 5 | 29 |
| `APP._nightMaxLights` | `viewer/effects.js:2708` *(as `A.`)* | 4 | 14 |
| `APP._nightMaxLightsNav` | `viewer/tools.js:1083` *(as `A.`)* | 1 | 5 |
| `APP._nightMaxLightsStill` | `viewer/tools.js:1087` *(as `A.`)* | 1 | 8 |
| `APP._nightMixAmber` | `viewer/tools.js:1124` *(as `A.`)* | 1 | 2 |
| `APP._nightMixBlue` | `viewer/tools.js:1123` *(as `A.`)* | 1 | 3 |
| `APP._nightMode` | `viewer/tools.js:1061` *(as `A.`)* | 2 | 15 |
| `APP._nightNearFadeFloor` | `viewer/effects.js:2709` *(as `A.`)* | 5 | 17 |
| `APP._nightNearFadeFloorStill` | `viewer/tools.js:1090` *(as `A.`)* | 1 | 10 |
| `APP._nightPLScale` | `viewer/effects.js:2680` *(as `A.`)* | 10 | 29 |
| `APP._nightPLScaleStaged` | `viewer/effects.js:3774` *(as `A.`)* | 5 | 16 |
| `APP._nightPLScaleStill` | `viewer/tools.js:1100` *(as `A.`)* | 1 | 6 |
| `APP._nightSaved` | `viewer/tools.js:1064` *(as `A.`)* | 2 | 28 |
| `APP._nightStars` | `viewer/time_machine.js:2462` *(as `app.`)* | 3 | 14 |
| `APP._nightStillBoost` | `viewer/tools.js:1088` *(as `A.`)* | 1 | 7 |
| `APP._nightUpdateLights` | `viewer/tools.js:1766` *(as `A.`)* | 2 | 18 |
| `APP._nightWindowGlowClasses` | `viewer/tools.js:1548` *(as `A.`)* | 1 | 2 |
| `APP._nlpExecute` | `viewer/nlp.js:589` *(as `A.`)* | 1 | 26 |
| `APP._normalsComputed` | `viewer/scene.js:1924` *(as `A.`)* | 2 | 5 |
| `APP._normalsPrecomputed` | `viewer/scene.js:1921` *(as `A.`)* | 2 | 5 |
| `APP._onResize` | `viewer/scene.js:1948` *(as `A.`)* | 1 | 4 |
| `APP._onStreamDone` | `viewer/main.js:857` | 1 | 4 |
| `APP._openDbBytes` | `viewer/scene.js:1293` *(as `A.`)* | 1 | 8 |
| `APP._openIfcFiles` | `viewer/scene.js:1355` *(as `A.`)* | 1 | 3 |
| `APP._openIssuesDB` | `viewer/issues.js:9` *(as `A.`)* | 1 | 6 |
| `APP._openJsonEditor` | `viewer/panels.js:2273` *(as `A.`)* | 1 | 3 |
| `APP._openSplitDbBytes` | `viewer/scene.js:1322` *(as `A.`)* | 1 | 5 |
| `APP._outlinePass` | `viewer/effects.js:12` *(as `A.`)* | 2 | 28 |
| `APP._ovDrawErrLogged` | `viewer/cinema_maxq.js:833` *(as `A.`)* | 1 | 2 |
| `APP._paletteMeshY` | `viewer/tools.js:639` *(as `A.`)* | 1 | 2 |
| `APP._pendingBboxBuckets` | `viewer/streaming.js:1695` *(as `A.`)* | 2 | 9 |
| `APP._pendingClashArgs` | `viewer/measure.js:267` *(as `A.`)* | 2 | 3 |
| `APP._pendingClashSnag` | `viewer/clash_snag.js:8` *(as `A.`)* | 7 | 13 |
| `APP._pendingClashStoreys` | `viewer/measure.js:266` *(as `A.`)* | 3 | 7 |
| `APP._pendingInstances` | `viewer/streaming.js:1956` *(as `A.`)* | 3 | 11 |
| `APP._pendingSnagInfo` | `viewer/sitecam.js:215` *(as `A.`)* | 1 | 3 |
| `APP._photoAutoStageOn` | `viewer/effects.js:5376` *(as `A.`)* | 1 | 3 |
| `APP._photoDuskMood` | `viewer/effects.js:3711` | 1 | 3 |
| `APP._photoFacadeLightsDbg` | — *phantom* | 0 | 1 |
| `APP._photoFillBase` | `viewer/effects.js:3804` *(as `A.`)* | 2 | 11 |
| `APP._photoGroundAlbedoGain` | `viewer/effects.js:2854` *(as `A.`)* | 2 | 4 |
| `APP._photoMatteSkyEnv` | `viewer/effects.js:2925` *(as `A.`)* | 1 | 3 |
| `APP._photoPaintSeed` | `viewer/effects.js:3633` *(as `A.`)* | 1 | 10 |
| `APP._photoPrewarm` | `viewer/effects.js:2232` *(as `A.`)* | 1 | 4 |
| `APP._photoPrewarmDone` | `viewer/effects.js:2234` *(as `A.`)* | 1 | 2 |
| `APP._photoStaffageGroup` | `viewer/effects.js:1206` *(as `A.`)* | 1 | 3 |
| `APP._photoStagingOn` | `viewer/effects.js:3327` *(as `A.`)* | 3 | 10 |
| `APP._pickIsolated` | `viewer/picking.js:20` *(as `A.`)* | 2 | 5 |
| `APP._plTopoutWant` | `viewer/effects.js:2734` *(as `A.`)* | 1 | 7 |
| `APP._placePanel` | `viewer/panels.js:264` *(as `A.`)* | 1 | 8 |
| `APP._pointerCount` | `viewer/picking.js:113` *(as `A.`)* | 3 | 9 |
| `APP._populateBusy` | `viewer/effects.js:1753` *(as `A.`)* | 4 | 6 |
| `APP._populatePitchHooked` | `viewer/effects.js:2188` *(as `A.`)* | 1 | 2 |
| `APP._positionRows` | `viewer/streaming.js:3018` *(as `A.`)* | 2 | 8 |
| `APP._prepareGraphTour` | `viewer/tour.js:113` *(as `A.`)* | 1 | 2 |
| `APP._probeAimDepth` | — *phantom* | 0 | 13 |
| `APP._qualifyClashRows` | `viewer/measure.js:1143` *(as `A.`)* | 1 | 6 |
| `APP._queryClashes` | `viewer/measure.js:560` *(as `A.`)* | 1 | 1 |
| `APP._queryClashesPair` | `viewer/measure.js:263` *(as `A.`)* | 1 | 4 |
| `APP._queryClashesPairAll` | `viewer/measure.js:526` *(as `A.`)* | 1 | 2 |
| `APP._queryClashesPairRtree` | `viewer/measure.js:330` *(as `A.`)* | 1 | 8 |
| `APP._rangeDb` | — *phantom* | 0 | 8 |
| `APP._rayAABB` | `viewer/city.js:904` *(as `A.`)* | 1 | 2 |
| `APP._reassertPhotoSparkles` | `viewer/effects.js:4536` *(as `A.`)* | 1 | 1 |
| `APP._recolorMesh` | `viewer/tools.js:614` *(as `A.`)* | 1 | 8 |
| `APP._redrawMarkup` | `viewer/sitecam.js:358` *(as `A.`)* | 1 | 4 |
| `APP._refreshClashList` | `viewer/measure.js:1134` *(as `A.`)* | 1 | 2 |
| `APP._refreshGroundBtns` | `viewer/panels.js:1633` *(as `A.`)* | 1 | 5 |
| `APP._registerBatchSlot` | `viewer/streaming.js:2031` *(as `A.`)* | 1 | 3 |
| `APP._registerInstanceSlot` | `viewer/streaming.js:2107` *(as `A.`)* | 1 | 2 |
| `APP._registerPanel` | `viewer/scene.js:3115` *(as `A.`)* | 1 | 1 |
| `APP._renderClashList` | `viewer/measure.js:839` *(as `A.`)* | 1 | 8 |
| `APP._renderIssueList` | `viewer/issues.js:95` *(as `A.`)* | 1 | 4 |
| `APP._renderPass` | `viewer/effects.js:95` *(as `A.`)* | 1 | 1 |
| `APP._renderSnagStamps` | `viewer/helpers.js:481` *(as `A.`)* | 1 | 3 |
| `APP._repairDegenerateNormals` | `viewer/streaming.js:1589` *(as `A.`)* | 1 | 2 |
| `APP._reportPairCounts` | `viewer/clash_report.js:11` *(as `A.`)* | 3 | 3 |
| `APP._resDrawErrLogged` | `viewer/cinema_maxq.js:839` *(as `A.`)* | 1 | 2 |
| `APP._resHoldFrames` | `viewer/cinema_maxq.js:1514` *(as `A.`)* | 2 | 7 |
| `APP._resHoldLogged` | `viewer/cinema_maxq.js:1514` *(as `A.`)* | 2 | 3 |
| `APP._resWhyLogged` | `viewer/cpe_resource_panel.js:81` *(as `A.`)* | 1 | 2 |
| `APP._resetAllVisibility` | — *phantom* | 0 | 2 |
| `APP._restoreIsolation` | `viewer/picking.js:42` *(as `A.`)* | 1 | 1 |
| `APP._restoreStaffageInstances` | `viewer/effects.js:1801` *(as `A.`)* | 1 | 2 |
| `APP._restoreSunglass` | `viewer/tools.js:592` *(as `A.`)* | 1 | 2 |
| `APP._revalidateCache` | `viewer/scene.js:1441` *(as `A.`)* | 1 | 2 |
| `APP._revealClashes` | `viewer/measure.js:812` *(as `A.`)* | 1 | 4 |
| `APP._roleFilterIdx` | `viewer/panels.js:803` *(as `A.`)* | 2 | 10 |
| `APP._roleFilterLabel` | `viewer/panels.js:816` *(as `A.`)* | 1 | 4 |
| `APP._roomCycle` | `viewer/scene.js:2155` *(as `A.`)* | 1 | 1 |
| `APP._ruleChecklistActiveCategory` | `viewer/rule_checklist.js:245` *(as `A.`)* | 3 | 6 |
| `APP._ruleChecklistConfig` | `viewer/rule_checklist.js:244` *(as `A.`)* | 2 | 7 |
| `APP._ruleChecklistOpeners` | `viewer/rule_checklist.js:242` *(as `A.`)* | 1 | 7 |
| `APP._ruleTintActive` | `viewer/rule_checklist.js:447` *(as `A.`)* | 3 | 5 |
| `APP._ruleTintMeshes` | `viewer/rule_checklist.js:446` *(as `A.`)* | 3 | 8 |
| `APP._runSqlChunked` | `viewer/scene.js:1717` *(as `A.`)* | 1 | 3 |
| `APP._saveClashIssue` | `viewer/clash_snag.js:260` *(as `A.`)* | 1 | 4 |
| `APP._saveClashStatuses` | `viewer/measure.js:615` *(as `A.`)* | 1 | 2 |
| `APP._saveIssueToLog` | `viewer/issues.js:24` *(as `A.`)* | 1 | 3 |
| `APP._savedClearColor` | `viewer/tools.js:1036` *(as `A.`)* | 2 | 4 |
| `APP._savedGroundColor` | `viewer/tools.js:1044` *(as `A.`)* | 1 | 3 |
| `APP._scrubHide` | `viewer/tour.js:1907` *(as `A.`)* | 1 | 11 |
| `APP._scrubShow` | `viewer/tour.js:1897` *(as `A.`)* | 1 | 7 |
| `APP._scrubStop` | `viewer/tour.js:1918` *(as `A.`)* | 1 | 8 |
| `APP._scrubVisible` | `viewer/tour.js:1893` *(as `A.`)* | 1 | 3 |
| `APP._sectionNav` | `viewer/panels.js:669` *(as `A.`)* | 1 | 3 |
| `APP._setBillboardImage` | `viewer/effects.js:2380` *(as `A.`)* | 1 | 2 |
| `APP._setGroundColor` | `viewer/tools.js:155` *(as `A.`)* | 1 | 15 |
| `APP._setGroundWetness` | `viewer/effects.js:3408` *(as `A.`)* | 1 | 5 |
| `APP._setRuleChecklistCategory` | `viewer/rule_checklist.js:434` *(as `A.`)* | 1 | 4 |
| `APP._setTreeMode` | `viewer/navigate_find.js:1648` *(as `A.`)* | 1 | 3 |
| `APP._shadowGroundKey` | `viewer/tools.js:924` *(as `A.`)* | 2 | 8 |
| `APP._shadowInited` | `viewer/effects.js:3074` *(as `A.`)* | 2 | 4 |
| `APP._shadowOn` | `viewer/tools.js:923` *(as `A.`)* | 2 | 32 |
| `APP._shadowRestoreMat` | `viewer/effects.js:4363` *(as `A.`)* | 1 | 1 |
| `APP._shareClashSnag` | `viewer/clash_snag.js:115` *(as `A.`)* | 1 | 4 |
| `APP._shareLoaded` | `viewer/import.js:606` *(as `A.`)* | 1 | 2 |
| `APP._showClashMatrix` | `viewer/clash_matrix.js:91` *(as `A.`)* | 1 | 5 |
| `APP._showClassCost` | `viewer/navigate_find.js:1788` *(as `A.`)* | 1 | 2 |
| `APP._showIssueDetail` | `viewer/issues.js:130` *(as `A.`)* | 1 | 2 |
| `APP._showMergeModal` | `viewer/scene.js:877` *(as `A.`)* | 1 | 3 |
| `APP._singleBuildingName` | `viewer/streaming.js:276` *(as `A.`)* | 1 | 8 |
| `APP._sky` | `viewer/scene.js:248` *(as `A.`)* | 1 | 28 |
| `APP._slabBeatAtWarned` | `viewer/cinema_maxq.js:1779` *(as `A.`)* | 1 | 2 |
| `APP._snagClash` | `viewer/clash_snag.js:11` *(as `A.`)* | 1 | 2 |
| `APP._snagGroup` | `viewer/helpers.js:479` *(as `A.`)* | 2 | 9 |
| `APP._snagObserver` | `viewer/sitecam.js:22` *(as `A.`)* | 1 | 2 |
| `APP._solidMeshes` | `viewer/effects.js:1099` *(as `A.`)* | 1 | 7 |
| `APP._splitHasMeta` | `viewer/streaming.js:3078` *(as `A.`)* | 4 | 7 |
| `APP._ssaoPass` | `viewer/effects.js:11` *(as `A.`)* | 2 | 15 |
| `APP._ssgiActive` | `viewer/effects_gi_poc.js:140` *(as `A.`)* | 4 | 18 |
| `APP._ssgiEffect` | `viewer/effects_gi_poc.js:315` *(as `A.`)* | 1 | 13 |
| `APP._staffageIsSeat` | `viewer/effects.js:1933` *(as `A.`)* | 1 | 1 |
| `APP._startFlyTour` | `viewer/tour.js:307` *(as `A.`)* | 1 | 3 |
| `APP._statTailFrames` | `viewer/cinema_maxq.js:1515` *(as `A.`)* | 2 | 6 |
| `APP._statTailLogged` | `viewer/cinema_maxq.js:1515` *(as `A.`)* | 2 | 3 |
| `APP._statTailRosterLogged` | `viewer/cinema_maxq.js:2121` *(as `A.`)* | 1 | 2 |
| `APP._stillAOAdapter` | `viewer/effects.js:4362` *(as `A.`)* | 1 | 4 |
| `APP._stillAOPass` | `viewer/effects.js:4361` *(as `A.`)* | 1 | 1 |
| `APP._stillBudget` | `viewer/cinema_maxq.js:538` | 3 | 12 |
| `APP._stillRefineActive` | `viewer/effects.js:122` *(as `A.`)* | 8 | 65 |
| `APP._stillRefineBusy` | `viewer/effects.js:4400` *(as `A.`)* | 7 | 26 |
| `APP._stillSSGIEnabled` | `viewer/effects.js:4034` *(as `A.`)* | 2 | 3 |
| `APP._storeyOrdinalKeys` | `viewer/tools.js:661` *(as `A.`)* | 1 | 4 |
| `APP._storeyVisible` | `viewer/panels.js:705` *(as `A.`)* | 1 | 17 |
| `APP._streamPaused` | `viewer/streaming.js:1850` *(as `A.`)* | 2 | 3 |
| `APP._streaming` | — *phantom* | 0 | 1 |
| `APP._structuralRulesCache` | `viewer/rule_checklist.js:646` *(as `A.`)* | 2 | 4 |
| `APP._structuralRulesSource` | `viewer/rule_checklist.js:646` *(as `A.`)* | 2 | 3 |
| `APP._sunArcElevationDeg` | `viewer/effects.js:2648` *(as `A.`)* | 2 | 7 |
| `APP._sunArcFillPin` | `viewer/effects.js:2733` *(as `A.`)* | 2 | 11 |
| `APP._sunArcStep` | `viewer/effects.js:2653` *(as `A.`)* | 1 | 8 |
| `APP._sunCycleActive` | `viewer/time_machine.js:2375` *(as `app.`)* | 3 | 4 |
| `APP._sunShadowRestoreEnabled` | `viewer/effects.js:4364` *(as `A.`)* | 1 | 4 |
| `APP._sunglassBackups` | `viewer/tools.js:575` *(as `A.`)* | 3 | 16 |
| `APP._sunglassNav` | `viewer/panels.js:685` *(as `A.`)* | 1 | 3 |
| `APP._swCacheVersion` | — *phantom* | 0 | 1 |
| `APP._taaPass` | `viewer/effects.js:96` *(as `A.`)* | 1 | 21 |
| `APP._teardownStillRefine` | — *phantom* | 0 | 2 |
| `APP._tmBloomActive` | `viewer/time_machine.js:2530` *(as `app.`)* | 3 | 6 |
| `APP._tmComposeSnapshot` | `viewer/share.js:370` *(as `A.`)* | 1 | 2 |
| `APP._tmIsVisible` | `viewer/effects.js:2511` *(as `A.`)* | 2 | 15 |
| `APP._tmOn` | `viewer/time_machine.js:8831` *(as `app.`)* | 2 | 15 |
| `APP._tmOverlayRegister` | `viewer/effects.js:2512` *(as `A.`)* | 1 | 4 |
| `APP._tmSnapshotCaption` | `viewer/share.js:358` *(as `A.`)* | 1 | 2 |
| `APP._tmState` | — *phantom* | 0 | 3 |
| `APP._tmUnmergeTried` | `viewer/time_machine.js:8629` *(as `app.`)* | 1 | 2 |
| `APP._tmVisSubscribe` | `viewer/effects.js:2508` *(as `A.`)* | 1 | 4 |
| `APP._toggleClashStatus` | `viewer/measure.js:1080` *(as `A.`)* | 1 | 3 |
| `APP._toolbarNav` | `viewer/panels.js:654` *(as `A.`)* | 1 | 3 |
| `APP._tourCacheBust` | `viewer/tour.js:268` *(as `A.`)* | 1 | 5 |
| `APP._tourCachedRoute` | `viewer/tour.js:91` *(as `A.`)* | 2 | 8 |
| `APP._tourPaused` | `viewer/tour.js:357` *(as `A.`)* | 3 | 16 |
| `APP._tourPrepare` | `viewer/tour.js:1414` *(as `A.`)* | 1 | 3 |
| `APP._tourStarts` | `viewer/tour.js:1419` *(as `A.`)* | 1 | 27 |
| `APP._tourStoreyZ` | `viewer/tour.js:451` *(as `A.`)* | 1 | 3 |
| `APP._tourT` | `viewer/tour.js:1431` *(as `A.`)* | 4 | 22 |
| `APP._tourTotal` | `viewer/tour.js:1430` *(as `A.`)* | 1 | 26 |
| `APP._triNormalOff` | `viewer/streaming.js:1486` | 2 | 3 |
| `APP._triResolve` | `viewer/streaming.js:752` *(as `A.`)* | 1 | 5 |
| `APP._triSrcTally` | `viewer/streaming.js:766` *(as `A.`)* | 1 | 3 |
| `APP._triplanarLoader` | `viewer/streaming.js:1315` *(as `A.`)* | 1 | 3 |
| `APP._triplanarMaterials` | `viewer/streaming.js:1491` *(as `A.`)* | 1 | 7 |
| `APP._triplanarTexCache` | `viewer/streaming.js:1314` *(as `A.`)* | 1 | 5 |
| `APP._updateCamLight` | `viewer/effects.js:350` *(as `A.`)* | 1 | 3 |
| `APP._updateClashLOD` | `viewer/measure.js:1822` *(as `A.`)* | 1 | 3 |
| `APP._updateFacadeFacing` | — *phantom* | 0 | 2 |
| `APP._updateFogDensity` | `viewer/scene.js:129` *(as `A.`)* | 1 | 7 |
| `APP._useDlodPath` | `viewer/streaming.js:19` *(as `A.`)* | 3 | 7 |
| `APP._useMerge` | — *phantom* | 0 | 1 |
| `APP._useRangeStream` | — *phantom* | 0 | 5 |
| `APP._visibilityGen` | `viewer/panels.js:732` *(as `A.`)* | 3 | 8 |
| `APP._voToErp` | `viewer/diff.js:411` *(as `A.`)* | 1 | 2 |
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
| `APP._webglContextLost` | `viewer/scene.js:475` *(as `A.`)* | 2 | 3 |
| `APP._whiteBg` | `viewer/tools.js:1035` *(as `A.`)* | 2 | 11 |
| `APP._winCtx` | `erp/idempiere.html:3856` | 1 | 2 |
| `APP._wireListKeyNav` | `viewer/panels.js:648` *(as `A.`)* | 1 | 3 |
| `APP._wizardLoaded` | `viewer/main.js:232` | 3 | 3 |
| `APP._wizardPromise` | `viewer/main.js:235` | 1 | 4 |
| `APP._wlog` | `viewer/picking.js:88` *(as `A.`)* | 1 | 3 |
| `APP.activeBuilding` | `viewer/city.js:788` *(as `A.`)* | 9 | 251 |
| `APP.activeBuildingTotal` | `viewer/city.js:789` *(as `A.`)* | 9 | 20 |
| `APP.activeGuidFilter` | `viewer/panels.js:847` *(as `A.`)* | 1 | 10 |
| `APP.activeStoreyFilter` | `viewer/main.js:1114` | 4 | 32 |
| `APP.actor` | `erp/crud_overlay.js:1786` | 3 | 16 |
| `APP.addQRBorder` | `viewer/helpers.js:412` *(as `A.`)* | 1 | 2 |
| `APP.advanceNavStep` | — *phantom* | 0 | 2 |
| `APP.advanceWalkStep` | `viewer/walk.js:458` *(as `A.`)* | 1 | 5 |
| `APP.allBuildingCards` | `viewer/panels.js:900` *(as `A.`)* | 2 | 5 |
| `APP.allRoomVolumes` | `viewer/navigate_find.js:2293` *(as `A.`)* | 1 | 5 |
| `APP.ambient` | `viewer/scene.js:190` *(as `A.`)* | 1 | 42 |
| `APP.applyDefaultGroundTexture` | `viewer/tools.js:282` *(as `A.`)* | 1 | 1 |
| `APP.applyDiffOverlay` | `viewer/diff.js:56` *(as `A.`)* | 1 | 4 |
| `APP.applyFindScope` | `viewer/navigate_find.js:5149` *(as `A.`)* | 1 | 6 |
| `APP.applySectionAxis` | `viewer/tools.js:438` *(as `A.`)* | 1 | 3 |
| `APP.bigStatsAt` | `viewer/cpe_resource_panel.js:486` *(as `A.`)* | 1 | 4 |
| `APP.bigStatsAtSpan` | `viewer/cpe_resource_panel.js:474` *(as `A.`)* | 1 | 3 |
| `APP.bigStatsBuild` | `viewer/cpe_resource_panel.js:244` *(as `A.`)* | 1 | 11 |
| `APP.bigStatsCompositeOntoCanvas` | `viewer/cpe_resource_panel.js:555` *(as `A.`)* | 1 | 6 |
| `APP.blobToGeometry` | `viewer/scene.js:1883` *(as `A.`)* | 1 | 8 |
| `APP.buildDoorPath` | `viewer/tour.js:2241` *(as `A.`)* | 1 | 2 |
| `APP.buildPointPath` | `viewer/tour.js:2149` *(as `A.`)* | 1 | 3 |
| `APP.buildRouteTemplate` | — *phantom* | 0 | 2 |
| `APP.buildRuleDeepLink` | `viewer/rule_checklist.js:544` *(as `A.`)* | 1 | 4 |
| `APP.buildShareUrl` | `viewer/share.js:211` *(as `A.`)* | 1 | 6 |
| `APP.buildSpacePath` | `viewer/tour.js:2236` *(as `A.`)* | 1 | 2 |
| `APP.buildTour` | `viewer/tour.js:815` *(as `A.`)* | 1 | 2 |
| `APP.buildWalkGraphPath` | `viewer/tour.js:2030` *(as `A.`)* | 1 | 2 |
| `APP.buildingCentres` | `viewer/scene.js:452` *(as `A.`)* | 1 | 102 |
| `APP.buildingMeasureCard` | `viewer/cpe_resource_panel.js:442` *(as `A.`)* | 1 | 2 |
| `APP.buildingMeasureCards` | `viewer/cpe_resource_panel.js:376` *(as `A.`)* | 1 | 3 |
| `APP.buildingName` | — *phantom* | 0 | 7 |
| `APP.buildingsRendered` | `viewer/scene.js:461` *(as `A.`)* | 1 | 63 |
| `APP.buildupCursorAt` | `viewer/cinema_maxq.js:2377` | 1 | 39 |
| `APP.buildupPacingReset` | `viewer/cinema_maxq.js:2382` | 1 | 19 |
| `APP.buildupTAt` | `viewer/cinema_maxq.js:2380` | 1 | 29 |
| `APP.buildupTopoutU` | `viewer/cinema_maxq.js:2381` | 1 | 9 |
| `APP.cacheStoreyLevels` | `viewer/walk.js:243` *(as `A.`)* | 1 | 2 |
| `APP.cachedFetch` | `viewer/scene.js:1487` *(as `A.`)* | 1 | 25 |
| `APP.calls` | — *phantom* | 0 | 2 |
| `APP.camera` | `viewer/grid_views.js:83` *(as `A.`)* | 4 | 830 |
| `APP.cancelMaxQualityOrbit` | `viewer/cinema_maxq.js:2372` | 1 | 4 |
| `APP.cancelWalkAnchor` | `viewer/walk.js:33` *(as `A.`)* | 1 | 2 |
| `APP.canvas` | `viewer/scene.js:10` *(as `A.`)* | 1 | 56 |
| `APP.checkUpdate` | `viewer/scene.js:3039` *(as `A.`)* | 1 | 1 |
| `APP.cinemaBandFlow` | `viewer/effects.js:6106` *(as `A.`)* | 1 | 10 |
| `APP.cinemaBandWaypoints` | `viewer/effects.js:6033` *(as `A.`)* | 1 | 2 |
| `APP.cinemaFan` | `viewer/effects.js:9312` *(as `A.`)* | 1 | 5 |
| `APP.cinemaHoseApply` | `viewer/effects.js:6160` *(as `A.`)* | 1 | 6 |
| `APP.cinemaHoseReanchor` | `viewer/effects.js:6189` *(as `A.`)* | 1 | 2 |
| `APP.cinemaLookDist` | `viewer/effects.js:9332` *(as `A.`)* | 1 | 4 |
| `APP.cinemaPathEditor` | `viewer/cinema_path_editor.js:3886` | 1 | 149 |
| `APP.cinemaPathPlan` | `viewer/effects.js:9267` *(as `A.`)* | 1 | 195 |
| `APP.cinemaPathPlanDerived` | `viewer/effects.js:9307` *(as `A.`)* | 1 | 2 |
| `APP.cinemaPrefixInvalidate` | `viewer/effects.js:9262` *(as `A.`)* | 1 | 5 |
| `APP.cinemaRoundCorners` | `viewer/effects.js:5743` *(as `A.`)* | 1 | 3 |
| `APP.cinemaSeedBands` | `viewer/effects.js:6258` *(as `A.`)* | 1 | 13 |
| `APP.cinemaSeedStick` | `viewer/effects.js:6277` *(as `A.`)* | 1 | 3 |
| `APP.cityArchetypes` | `viewer/city.js:10` *(as `A.`)* | 1 | 5 |
| `APP.cityBuildingDbs` | `viewer/city.js:11` *(as `A.`)* | 3 | 16 |
| `APP.cityClear` | `viewer/city.js:806` *(as `A.`)* | 1 | 2 |
| `APP.cityDb` | `viewer/city.js:8` *(as `A.`)* | 2 | 15 |
| `APP.cityLoadBuilding` | `viewer/city.js:641` *(as `A.`)* | 1 | 3 |
| `APP.citySQL` | `viewer/city.js:9` *(as `A.`)* | 2 | 9 |
| `APP.clashFilm` | `viewer/clash_film.js:91` *(as `A.`)* | 1 | 123 |
| `APP.clashLabels` | `viewer/clash_labels.js:119` *(as `A.`)* | 1 | 48 |
| `APP.clashLabelsCompositeOntoCanvas` | `viewer/clash_labels.js:309` *(as `A.`)* | 1 | 8 |
| `APP.clashNarrow` | `viewer/clash_narrow.js:447` *(as `A.`)* | 1 | 49 |
| `APP.clearAllIssues` | `viewer/issues.js:261` *(as `A.`)* | 1 | 2 |
| `APP.clearCinemaPath` | `viewer/effects.js:9214` *(as `A.`)* | 1 | 1 |
| `APP.clearFocusElement` | `viewer/navigate_find.js:5119` *(as `A.`)* | 1 | 12 |
| `APP.clearHighlight` | `viewer/navigate_find.js:5030` *(as `A.`)* | 1 | 2 |
| `APP.clearMeasures` | `viewer/measure.js:1212` *(as `A.`)* | 1 | 3 |
| `APP.clearRouteCache` | — *phantom* | 0 | 3 |
| `APP.clearStreamed` | `viewer/streaming.js:3456` *(as `A.`)* | 1 | 3 |
| `APP.clientId` | `erp/idempiere.html:1187` | 1 | 4 |
| `APP.closeFindPanel` | `viewer/navigate_find.js:4330` *(as `A.`)* | 1 | 4 |
| `APP.closeSiteCamera` | `viewer/sitecam.js:179` *(as `A.`)* | 1 | 11 |
| `APP.closeSitePreview` | `viewer/sitecam.js:449` *(as `A.`)* | 1 | 8 |
| `APP.closeSunglass` | — *phantom* | 0 | 1 |
| `APP.collectMeshes` | `viewer/helpers.js:20` *(as `A.`)* | 1 | 106 |
| `APP.composeGhostsFromAggregates` | `viewer/scene.js:1791` *(as `A.`)* | 1 | 5 |
| `APP.computeDiff` | `viewer/diff.js:18` *(as `A.`)* | 1 | 4 |
| `APP.computePathLength` | `viewer/tour.js:2246` *(as `A.`)* | 1 | 2 |
| `APP.contributeBuilding` | — *phantom* | 0 | 2 |
| `APP.controls` | `viewer/scene.js:164` *(as `A.`)* | 2 | 516 |
| `APP.cpeRevealApplyVisual` | `viewer/effects.js:5995` *(as `A.`)* | 1 | 10 |
| `APP.cpeRevealCaptionAt` | `viewer/effects.js:5953` *(as `A.`)* | 1 | 8 |
| `APP.cpeRevealDiscLabel` | `viewer/effects.js:5916` *(as `A.`)* | 1 | 10 |
| `APP.cpeRevealDiscQtyCost` | `viewer/effects.js:5929` *(as `A.`)* | 1 | 8 |
| `APP.cpeRevealDiscsPresent` | `viewer/effects.js:5802` *(as `A.`)* | 1 | 8 |
| `APP.cpeRevealLightsOffAt` | `viewer/effects.js:5991` *(as `A.`)* | 1 | 3 |
| `APP.cpeRevealVisualAt` | `viewer/effects.js:5876` *(as `A.`)* | 1 | 12 |
| `APP.createPanel` | `viewer/panels.js:209` *(as `A.`)* | 1 | 8 |
| `APP.createSnag` | `viewer/helpers.js:515` *(as `A.`)* | 1 | 3 |
| `APP.currentBuilding` | — *phantom* | 0 | 5 |
| `APP.cycleRoleFilter` | `viewer/panels.js:806` *(as `A.`)* | 1 | 4 |
| `APP.cycleWalkSpeed` | `viewer/tour.js:1103` *(as `A.`)* | 1 | 2 |
| `APP.cycleXrayBboxMode` | `viewer/tools.js:375` *(as `A.`)* | 1 | 7 |
| `APP.dayCounterAt` | `viewer/cpe_day_counter.js:32` *(as `A.`)* | 1 | 23 |
| `APP.dayCounterBoxSize` | `viewer/cpe_day_counter.js:57` *(as `A.`)* | 1 | 6 |
| `APP.dayCounterCompositeOntoCanvas` | `viewer/cpe_day_counter.js:62` *(as `A.`)* | 1 | 13 |
| `APP.dayCounterLiveStart` | `viewer/cpe_day_counter.js:130` *(as `A.`)* | 1 | 1 |
| `APP.dayCounterLiveStop` | `viewer/cpe_day_counter.js:154` *(as `A.`)* | 1 | 1 |
| `APP.dayCounterLiveTick` | `viewer/cpe_day_counter.js:139` *(as `A.`)* | 1 | 1 |
| `APP.db` | `viewer/city.js:712` *(as `A.`)* | 15 | 618 |
| `APP.dbQuery` | `viewer/helpers.js:116` *(as `A.`)* | 1 | 562 |
| `APP.dbQueryFirst` | `viewer/helpers.js:130` *(as `A.`)* | 1 | 12 |
| `APP.deleteImported` | `viewer/import.js:591` *(as `A.`)* | 1 | 5 |
| `APP.diffDb` | `viewer/diff.js:17` *(as `A.`)* | 2 | 19 |
| `APP.diffResult` | `viewer/diff.js:47` *(as `A.`)* | 1 | 33 |
| `APP.discCounts` | `viewer/scene.js:453` *(as `A.`)* | 3 | 11 |
| `APP.dlodDemoteAll` | `viewer/dlod.js:132` *(as `A.`)* | 1 | 1 |
| `APP.dlodDisable` | `viewer/dlod.js:125` *(as `A.`)* | 1 | 7 |
| `APP.dlodEnable` | `viewer/dlod.js:99` *(as `A.`)* | 1 | 9 |
| `APP.dlodTick` | `viewer/dlod.js:137` *(as `A.`)* | 1 | 18 |
| `APP.downloadSitePhoto` | `viewer/sitecam.js:514` *(as `A.`)* | 1 | 4 |
| `APP.drawBuildingBoxes` | `viewer/streaming.js:23` *(as `A.`)* | 1 | 4 |
| `APP.ensureHdriEnvMapReady` | `viewer/effects.js:9340` *(as `A.`)* | 1 | 3 |
| `APP.ensureRooms` | `viewer/navigate_find.js:937` *(as `A.`)* | 1 | 91 |
| `APP.erpQuery` | `viewer/hba_lens.js:349` *(as `A.`)* | 1 | 4 |
| `APP.exitRuleModeTint` | `viewer/rule_checklist.js:520` *(as `A.`)* | 1 | 3 |
| `APP.export4D5D` | `viewer/tools.js:493` *(as `A.`)* | 1 | 6 |
| `APP.exportIFC` | `viewer/import.js:677` *(as `A.`)* | 1 | 5 |
| `APP.exportIssuesExcel` | `viewer/excel.js:16` *(as `A.`)* | 1 | 2 |
| `APP.filterBatchedMesh` | `viewer/helpers.js:62` *(as `A.`)* | 1 | 5 |
| `APP.filterByGuids` | `viewer/panels.js:846` *(as `A.`)* | 1 | 48 |
| `APP.filterDisc` | `viewer/panels.js:751` *(as `A.`)* | 1 | 21 |
| `APP.filterDiscs` | `viewer/panels.js:756` *(as `A.`)* | 1 | 15 |
| `APP.filterInstancedMesh` | `viewer/helpers.js:36` *(as `A.`)* | 1 | 6 |
| `APP.filterMergedMesh` | `viewer/helpers.js:85` *(as `A.`)* | 1 | 3 |
| `APP.filterStorey` | `viewer/panels.js:716` *(as `A.`)* | 1 | 29 |
| `APP.findMainEntrance` | `viewer/navigate_find.js:5032` *(as `A.`)* | 1 | 1 |
| `APP.findMeshByGuid` | `viewer/walk.js:577` *(as `A.`)* | 1 | 4 |
| `APP.findNearestDoorPosition` | `viewer/walk.js:199` *(as `A.`)* | 1 | 2 |
| `APP.flyActive` | `viewer/picking.js:71` *(as `A.`)* | 14 | 52 |
| `APP.flyAngle` | `viewer/picking.js:72` *(as `A.`)* | 4 | 8 |
| `APP.flyFromPos` | `viewer/picking.js:77` *(as `A.`)* | 2 | 3 |
| `APP.flyFromTarget` | `viewer/picking.js:78` *(as `A.`)* | 2 | 3 |
| `APP.flyTargetIdx` | `viewer/picking.js:74` *(as `A.`)* | 3 | 6 |
| `APP.flyTargets` | `viewer/picking.js:73` *(as `A.`)* | 2 | 12 |
| `APP.flyTick` | `viewer/tour.js:397` *(as `A.`)* | 1 | 2 |
| `APP.flyTo` | `viewer/city.js:611` *(as `A.`)* | 2 | 7 |
| `APP.flyTransitionStart` | `viewer/picking.js:76` *(as `A.`)* | 2 | 3 |
| `APP.flyTransitioning` | `viewer/picking.js:75` *(as `A.`)* | 4 | 5 |
| `APP.flythruBestPerClass` | `viewer/cpe_flythru_dims.js:84` *(as `A.`)* | 1 | 1 |
| `APP.flythruBoxCorners` | `viewer/cpe_flythru_dims.js:529` *(as `A.`)* | 1 | 1 |
| `APP.flythruBoxPerimeter` | `viewer/cpe_flythru_dims.js:547` *(as `A.`)* | 1 | 1 |
| `APP.flythruCouldRead` | `viewer/cpe_flythru_dims.js:569` *(as `A.`)* | 1 | 1 |
| `APP.flythruCueCaptionAt` | `viewer/cpe_flythru_cues.js:327` *(as `A.`)* | 1 | 5 |
| `APP.flythruCueInk` | `viewer/cpe_flythru_dims.js:723` *(as `A.`)* | 1 | 1 |
| `APP.flythruCuesApplyVisual` | `viewer/cpe_flythru_cues.js:361` *(as `A.`)* | 1 | 8 |
| `APP.flythruCuesBuild` | `viewer/cpe_flythru_cues.js:166` *(as `A.`)* | 1 | 12 |
| `APP.flythruCuesCompositeOntoCanvas` | `viewer/cpe_flythru_cues.js:473` *(as `A.`)* | 1 | 7 |
| `APP.flythruCuesDispose` | `viewer/cpe_flythru_cues.js:533` *(as `A.`)* | 1 | 5 |
| `APP.flythruCuesWindows` | `viewer/cpe_flythru_cues.js:468` *(as `A.`)* | 1 | 9 |
| `APP.flythruDatumAt` | `viewer/cpe_flythru_datum.js:330` *(as `A.`)* | 1 | 6 |
| `APP.flythruDatumBuild` | `viewer/cpe_flythru_datum.js:183` *(as `A.`)* | 1 | 16 |
| `APP.flythruDatumCompositeOntoCanvas` | `viewer/cpe_flythru_datum.js:407` *(as `A.`)* | 1 | 11 |
| `APP.flythruDatumDispose` | `viewer/cpe_flythru_datum.js:767` *(as `A.`)* | 1 | 6 |
| `APP.flythruDatumFigures` | `viewer/cpe_flythru_datum.js:753` *(as `A.`)* | 1 | 6 |
| `APP.flythruDatumSetLife2` | `viewer/cpe_flythru_datum.js:47` *(as `A.`)* | 1 | 5 |
| `APP.flythruDedupe` | `viewer/cpe_flythru_dims.js:490` *(as `A.`)* | 1 | 3 |
| `APP.flythruDepthSpan` | `viewer/cpe_flythru_dims.js:210` *(as `A.`)* | 1 | 1 |
| `APP.flythruDrawDim` | `viewer/cpe_flythru_cues.js:465` *(as `A.`)* | 1 | 6 |
| `APP.flythruDrawPanel` | `viewer/cpe_flythru_cues.js:465` *(as `A.`)* | 1 | 4 |
| `APP.flythruDrawStateAt` | `viewer/cpe_flythru_dims.js:905` *(as `A.`)* | 1 | 1 |
| `APP.flythruEaseScore` | `viewer/cpe_flythru_dims.js:165` *(as `A.`)* | 1 | 4 |
| `APP.flythruFrameMap` | `viewer/cpe_flythru_dims.js:291` *(as `A.`)* | 1 | 5 |
| `APP.flythruGapsAlong` | `viewer/cpe_flythru_dims.js:695` *(as `A.`)* | 1 | 8 |
| `APP.flythruGate` | `viewer/cpe_flythru_dims.js:594` *(as `A.`)* | 1 | 11 |
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
| `APP.flythruProj` | `viewer/cpe_flythru_cues.js:465` *(as `A.`)* | 1 | 7 |
| `APP.flythruReentryFrac` | `viewer/cpe_flythru_dims.js:875` *(as `A.`)* | 1 | 1 |
| `APP.flythruScaleState` | `viewer/cpe_flythru_dims.js:61` *(as `A.`)* | 1 | 1 |
| `APP.flythruSceneToDb` | `viewer/cpe_flythru_dims.js:319` *(as `A.`)* | 1 | 1 |
| `APP.flythruSchedule` | `viewer/cpe_flythru_dims.js:115` *(as `A.`)* | 1 | 4 |
| `APP.flythruSemantics` | `viewer/cpe_flythru_dims.js:248` *(as `A.`)* | 1 | 3 |
| `APP.flythruSetScale` | `viewer/cpe_flythru_dims.js:48` *(as `A.`)* | 1 | 4 |
| `APP.flythruShouldShow` | `viewer/cpe_flythru_dims.js:877` *(as `A.`)* | 1 | 1 |
| `APP.focusElement` | `viewer/navigate_find.js:5044` *(as `A.`)* | 1 | 14 |
| `APP.friendlyName` | `viewer/navigate_find.js:5033` *(as `A.`)* | 1 | 21 |
| `APP.gateRecordFor` | `erp/idempiere.html:1193` | 1 | 4 |
| `APP.gazeAcquireCap` | `viewer/effects.js:6464` *(as `A.`)* | 1 | 6 |
| `APP.gazeAcquireStep` | `viewer/effects.js:6465` *(as `A.`)* | 1 | 4 |
| `APP.generateQR` | `viewer/helpers.js:391` *(as `A.`)* | 1 | 4 |
| `APP.getDiffDetail` | `viewer/diff.js:168` *(as `A.`)* | 1 | 1 |
| `APP.getRoomGraph` | `viewer/navigate_find.js:1237` *(as `A.`)* | 1 | 33 |
| `APP.getRouteTemplate` | — *phantom* | 0 | 2 |
| `APP.ghostGroundArm` | `viewer/cinema_maxq.js:2383` | 1 | 9 |
| `APP.ghostGroundAt` | `viewer/cinema_maxq.js:2384` | 1 | 10 |
| `APP.ghostGroundDebugState` | `viewer/cinema_maxq.js:2390` | 1 | 3 |
| `APP.ghostGroundRestore` | `viewer/cinema_maxq.js:2385` | 1 | 8 |
| `APP.ground` | `viewer/scene.js:441` *(as `A.`)* | 1 | 136 |
| `APP.groundIfcZ` | `viewer/tools.js:88` *(as `A.`)* | 1 | 8 |
| `APP.guidMap` | `viewer/city.js:822` *(as `A.`)* | 4 | 211 |
| `APP.handleMeasureClick` | `viewer/measure.js:1251` *(as `A.`)* | 1 | 2 |
| `APP.handleMeasureDblClick` | `viewer/measure.js:1431` *(as `A.`)* | 1 | 3 |
| `APP.handleMeasureRightClick` | `viewer/measure.js:1454` *(as `A.`)* | 1 | 3 |
| `APP.handleWallXray` | `viewer/walk.js:474` *(as `A.`)* | 1 | 2 |
| `APP.hemi` | `viewer/scene.js:200` *(as `A.`)* | 1 | 40 |
| `APP.hiddenDiscs` | `viewer/panels.js:737` *(as `A.`)* | 1 | 36 |
| `APP.highlightElement` | `viewer/navigate_find.js:5031` *(as `A.`)* | 1 | 1 |
| `APP.hoverHighlight` | `viewer/tools.js:1977` *(as `A.`)* | 3 | 8 |
| `APP.icon` | `viewer/panels.js:182` *(as `A.`)* | 1 | 18 |
| `APP.ifc2three` | `viewer/scene.js:499` *(as `A.`)* | 2 | 308 |
| `APP.ifc2threeDir` | `viewer/scene.js:512` *(as `A.`)* | 1 | 2 |
| `APP.importIFC` | `viewer/import.js:143` *(as `A.`)* | 1 | 3 |
| `APP.importMesh` | `viewer/import.js:439` *(as `A.`)* | 1 | 3 |
| `APP.importMultiIFC` | `viewer/import.js:267` *(as `A.`)* | 1 | 6 |
| `APP.indoorBeatsAt` | `viewer/cpe_indoor_beats.js:247` *(as `A.`)* | 1 | 5 |
| `APP.indoorBeatsBuild` | `viewer/cpe_indoor_beats.js:33` *(as `A.`)* | 1 | 5 |
| `APP.indoorBeatsCompositeOntoCanvas` | `viewer/cpe_indoor_beats.js:262` *(as `A.`)* | 1 | 4 |
| `APP.indoorBeatsDispose` | `viewer/cpe_indoor_beats.js:291` *(as `A.`)* | 1 | 5 |
| `APP.indoorBeatsReport` | `viewer/cpe_indoor_beats.js:290` *(as `A.`)* | 1 | 1 |
| `APP.init` | `viewer/streaming.js:2925` *(as `A.`)* | 1 | 6 |
| `APP.initCity` | `viewer/city.js:314` *(as `A.`)* | 1 | 3 |
| `APP.inputWasVoice` | `viewer/navigate_find.js:4157` *(as `A.`)* | 6 | 9 |
| `APP.interpolateWalkPath` | `viewer/tour.js:2257` *(as `A.`)* | 1 | 1 |
| `APP.isolateRoom` | `viewer/panels.js:887` *(as `A.`)* | 1 | 2 |
| `APP.kernelOps` | — *phantom* | 0 | 4 |
| `APP.libDb` | `viewer/city.js:660` *(as `A.`)* | 14 | 67 |
| `APP.lightTheme` | `viewer/tools.js:546` *(as `A.`)* | 2 | 18 |
| `APP.linearBeatBuild` | `viewer/cpe_linear_beat.js:47` *(as `A.`)* | 1 | 6 |
| `APP.linearBeatCompositeOntoCanvas` | `viewer/cpe_linear_beat.js:171` *(as `A.`)* | 1 | 4 |
| `APP.linearBeatDispose` | `viewer/cpe_linear_beat.js:191` *(as `A.`)* | 1 | 5 |
| `APP.linearBeatReport` | `viewer/cpe_linear_beat.js:190` *(as `A.`)* | 1 | 4 |
| `APP.listRooms` | `viewer/panels.js:875` *(as `A.`)* | 1 | 2 |
| `APP.loadCityManual` | `viewer/city.js:306` *(as `A.`)* | 1 | 2 |
| `APP.loadFromHash` | `viewer/streaming.js:3447` *(as `A.`)* | 1 | 2 |
| `APP.loadNavigate` | `viewer/main.js:126` | 1 | 117 |
| `APP.loadWizard` | `viewer/main.js:233` | 1 | 3 |
| `APP.markDirty` | `viewer/effects.js:4371` *(as `A.`)* | 4 | 344 |
| `APP.materializeZones` | — *phantom* | 0 | 3 |
| `APP.maxqStatusDayRoomSegs` | `viewer/cinema_maxq.js:2396` | 1 | 14 |
| `APP.measureActive` | `viewer/main.js:1060` | 3 | 27 |
| `APP.measureFirstMarker` | `viewer/measure.js:1223` *(as `A.`)* | 5 | 9 |
| `APP.measureFirstPoint` | `viewer/measure.js:1222` *(as `A.`)* | 5 | 8 |
| `APP.measureGroup` | `viewer/picking.js:66` *(as `A.`)* | 1 | 19 |
| `APP.measureLabels` | `viewer/measure.js:1221` *(as `A.`)* | 3 | 24 |
| `APP.mepSmoothNormals` | `viewer/streaming.js:84` *(as `A.`)* | 1 | 10 |
| `APP.meshCache` | `viewer/scene.js:454` *(as `A.`)* | 2 | 41 |
| `APP.modelOffset` | `viewer/scene.js:458` *(as `A.`)* | 1 | 71 |
| `APP.mouse` | `viewer/scene.js:496` *(as `A.`)* | 1 | 13 |
| `APP.navActive` | `viewer/navigate.js:31` *(as `A.`)* | 1 | 7 |
| `APP.navCurrentStep` | `viewer/navigate.js:32` *(as `A.`)* | 1 | 5 |
| `APP.navJumpToEnd` | — *phantom* | 0 | 3 |
| `APP.nightIsExitSign` | `viewer/tools.js:1147` *(as `A.`)* | 1 | 3 |
| `APP.nightLightColor` | `viewer/tools.js:1151` *(as `A.`)* | 1 | 9 |
| `APP.nightLightIntensityMult` | `viewer/tools.js:1205` *(as `A.`)* | 1 | 3 |
| `APP.onSectionOff` | — *phantom* | 0 | 2 |
| `APP.onSectionSliderChange` | — *phantom* | 0 | 2 |
| `APP.openCacheDB` | `viewer/scene.js:582` *(as `A.`)* | 1 | 30 |
| `APP.openFindPanel` | `viewer/main.js:230` | 2 | 61 |
| `APP.openImported` | `viewer/import.js:533` *(as `A.`)* | 1 | 9 |
| `APP.openModelDb` | `viewer/scene.js:1382` *(as `A.`)* | 1 | 14 |
| `APP.openShareSheet` | `viewer/import.js:602` *(as `A.`)* | 2 | 5 |
| `APP.openSiteCamera` | `viewer/sitecam.js:73` *(as `A.`)* | 1 | 7 |
| `APP.orgId` | `erp/idempiere.html:1188` | 1 | 4 |
| `APP.pathOverviewCompositeOntoCanvas` | `viewer/cpe_path_overview.js:165` *(as `A.`)* | 1 | 6 |
| `APP.pathOverviewPrepare` | `viewer/cpe_path_overview.js:76` *(as `A.`)* | 1 | 11 |
| `APP.pathOverviewToBox` | `viewer/cpe_path_overview.js:148` *(as `A.`)* | 1 | 9 |
| `APP.pauseStillRefineForGI` | `viewer/effects.js:5407` *(as `A.`)* | 1 | 5 |
| `APP.pointerDownPos` | `viewer/scene.js:464` *(as `A.`)* | 1 | 7 |
| `APP.populateActive` | `viewer/effects.js:2195` *(as `A.`)* | 1 | 3 |
| `APP.populateBuildingList` | `viewer/panels.js:902` *(as `A.`)* | 1 | 7 |
| `APP.populateDiscs` | `viewer/panels.js:739` *(as `A.`)* | 1 | 7 |
| `APP.populateStoreys` | `viewer/panels.js:713` *(as `A.`)* | 1 | 7 |
| `APP.printQRSheet` | `viewer/helpers.js:442` *(as `A.`)* | 1 | 3 |
| `APP.probeGradeHdr` | — *phantom* | 0 | 2 |
| `APP.queryWalkPath` | `viewer/tour.js:1936` *(as `A.`)* | 1 | 1 |
| `APP.quickShare` | `viewer/share.js:636` *(as `A.`)* | 1 | 7 |
| `APP.raycaster` | `viewer/scene.js:495` *(as `A.`)* | 1 | 18 |
| `APP.renderImportCards` | `viewer/import.js:615` *(as `A.`)* | 1 | 10 |
| `APP.renderer` | `viewer/scene.js:123` *(as `A.`)* | 1 | 350 |
| `APP.reportBug` | `viewer/helpers.js:204` *(as `A.`)* | 1 | 10 |
| `APP.reportError` | `viewer/error_reporter.js:112` *(as `A.`)* | 2 | 14 |
| `APP.resetCinemaGhostLens` | `viewer/navigate_find.js:4341` *(as `A.`)* | 1 | 5 |
| `APP.resourcePanelAt` | `viewer/cpe_resource_panel.js:50` *(as `A.`)* | 1 | 7 |
| `APP.resourcePanelCompositeOntoCanvas` | `viewer/cpe_resource_panel.js:698` *(as `A.`)* | 1 | 4 |
| `APP.resourcePanelFrozenAt` | `viewer/cpe_resource_panel.js:200` *(as `A.`)* | 1 | 3 |
| `APP.resourcePanelHoldAt` | `viewer/cpe_resource_panel.js:144` *(as `A.`)* | 1 | 4 |
| `APP.resourcePanelLightDir` | `viewer/cpe_resource_panel.js:217` *(as `A.`)* | 1 | 2 |
| `APP.restoreWallXray` | `viewer/walk.js:581` *(as `A.`)* | 1 | 3 |
| `APP.roleId` | `erp/idempiere.html:1189` | 1 | 2 |
| `APP.roomTitleApplyHold` | `viewer/cpe_room_title.js:763` *(as `A.`)* | 1 | 11 |
| `APP.roomTitleApplyLead` | `viewer/cpe_room_title.js:711` *(as `A.`)* | 1 | 13 |
| `APP.roomTitleBuildTimeline` | `viewer/cpe_room_title.js:444` *(as `A.`)* | 1 | 20 |
| `APP.roomTitleCompositeOntoCanvas` | `viewer/cpe_room_title.js:816` *(as `A.`)* | 1 | 17 |
| `APP.roomTitleContainProbe` | `viewer/cpe_room_title.js:249` *(as `A.`)* | 1 | 3 |
| `APP.roomTitleFinalText` | `viewer/cpe_room_title.js:805` *(as `A.`)* | 1 | 4 |
| `APP.roomTitleGazeProbe` | `viewer/cpe_room_title.js:254` *(as `A.`)* | 1 | 13 |
| `APP.roomTitleGazeSingleProbe` | `viewer/cpe_room_title.js:265` *(as `A.`)* | 1 | 4 |
| `APP.roomTitleLiveStart` | `viewer/cpe_room_title.js:877` *(as `A.`)* | 4 | 5 |
| `APP.roomTitleLiveStop` | `viewer/cpe_room_title.js:905` *(as `A.`)* | 1 | 1 |
| `APP.roomTitleLiveTick` | `viewer/cpe_room_title.js:887` *(as `A.`)* | 1 | 1 |
| `APP.roomTitleOpacityAt` | `viewer/cpe_room_title.js:781` *(as `A.`)* | 1 | 14 |
| `APP.roomTitleSightProbe` | `viewer/cpe_room_title.js:355` *(as `A.`)* | 1 | 3 |
| `APP.ruleFindingsFilmBuild` | — *phantom* | 0 | 1 |
| `APP.runPanelAction` | `viewer/panels.js:1497` *(as `A.`)* | 1 | 3 |
| `APP.saveModelDb` | `viewer/scene.js:844` *(as `A.`)* | 1 | 7 |
| `APP.savedStreams` | `viewer/streaming.js:17` *(as `A.`)* | 1 | 8 |
| `APP.scene` | `viewer/scene.js:137` *(as `A.`)* | 1 | 480 |
| `APP.screenshot` | `viewer/tools.js:510` *(as `A.`)* | 1 | 4 |
| `APP.sectionAxis` | `viewer/section_cut.js:834` | 4 | 12 |
| `APP.sectionMax` | `viewer/tools.js:400` *(as `A.`)* | 2 | 2 |
| `APP.sectionMin` | `viewer/tools.js:399` *(as `A.`)* | 2 | 2 |
| `APP.sectionOn` | `viewer/section_cut.js:834` | 6 | 19 |
| `APP.sectionPlane` | `viewer/tools.js:398` *(as `A.`)* | 3 | 18 |
| `APP.setGroundTexture` | `viewer/tools.js:276` *(as `A.`)* | 1 | 3 |
| `APP.setMarkupColor` | `viewer/sitecam.js:344` *(as `A.`)* | 1 | 2 |
| `APP.setMarkupTool` | `viewer/sitecam.js:336` *(as `A.`)* | 1 | 2 |
| `APP.setOutline` | `viewer/effects.js:20` *(as `A.`)* | 2 | 30 |
| `APP.setSectionAxis` | `viewer/tools.js:425` *(as `A.`)* | 1 | 2 |
| `APP.setWalkAnchor` | `viewer/walk.js:37` *(as `A.`)* | 1 | 2 |
| `APP.shareProject` | `viewer/scene.js:3040` *(as `A.`)* | 1 | 1 |
| `APP.shareSitePhoto` | `viewer/sitecam.js:456` *(as `A.`)* | 1 | 4 |
| `APP.shareUrl` | `viewer/share.js:294` *(as `A.`)* | 1 | 6 |
| `APP.showCommandPalette` | `viewer/scene.js:2647` *(as `A.`)* | 1 | 1 |
| `APP.showDiffSummary` | `viewer/diff.js:293` *(as `A.`)* | 1 | 2 |
| `APP.showEgressSanity` | `viewer/rule_checklist.js:673` *(as `A.`)* | 1 | 7 |
| `APP.showQRShare` | `viewer/helpers.js:420` *(as `A.`)* | 1 | 5 |
| `APP.showRuleChecklist` | `viewer/rule_checklist.js:427` *(as `A.`)* | 1 | 8 |
| `APP.showRuleModeTint` | `viewer/rule_checklist.js:449` *(as `A.`)* | 1 | 7 |
| `APP.showStructuralSanity` | `viewer/rule_checklist.js:622` *(as `A.`)* | 1 | 8 |
| `APP.sky` | — *phantom* | 0 | 11 |
| `APP.slabBeatAt` | `viewer/cpe_slab_beat.js:419` *(as `A.`)* | 1 | 4 |
| `APP.slabBeatBuild` | `viewer/cpe_slab_beat.js:156` *(as `A.`)* | 1 | 8 |
| `APP.slabBeatClock` | `viewer/cpe_slab_beat.js:449` *(as `A.`)* | 1 | 6 |
| `APP.slabBeatDispose` | `viewer/cpe_slab_beat.js:450` *(as `A.`)* | 1 | 5 |
| `APP.slabBeatReport` | `viewer/cpe_slab_beat.js:448` *(as `A.`)* | 1 | 6 |
| `APP.snapSitePhoto` | `viewer/sitecam.js:204` *(as `A.`)* | 1 | 2 |
| `APP.softStopStillRefine` | `viewer/effects.js:5427` *(as `A.`)* | 1 | 5 |
| `APP.stageCinemaPath` | `viewer/effects.js:9202` *(as `A.`)* | 1 | 4 |
| `APP.startCinemaOrbit` | `viewer/effects.js:9341` *(as `A.`)* | 1 | 12 |
| `APP.startDriveThru` | `viewer/walk.js:396` *(as `A.`)* | 1 | 7 |
| `APP.startFlyTour` | — *phantom* | 0 | 2 |
| `APP.startMaxQ` | — *phantom* | 0 | 2 |
| `APP.startMaxQualityOrbit` | `viewer/cinema_maxq.js:2371` | 1 | 82 |
| `APP.startNavigation` | — *phantom* | 0 | 4 |
| `APP.startOfflineDownload` | `viewer/scene.js:3041` *(as `A.`)* | 1 | 1 |
| `APP.startStepDetection` | `viewer/walk.js:354` *(as `A.`)* | 1 | 1 |
| `APP.startStillRefine` | `viewer/effects.js:5138` *(as `A.`)* | 1 | 60 |
| `APP.startStillSSGIPhase` | `viewer/effects_gi_poc.js:542` *(as `A.`)* | 1 | 3 |
| `APP.startStreaming` | `viewer/streaming.js:304` *(as `A.`)* | 1 | 2 |
| `APP.startWalkGpsTracking` | `viewer/walk.js:260` *(as `A.`)* | 1 | 2 |
| `APP.status` | `viewer/scene.js:462` *(as `A.`)* | 1 | 296 |
| `APP.stopCinemaOrbit` | `viewer/effects.js:9556` *(as `A.`)* | 1 | 1 |
| `APP.stopDriveThru` | `viewer/walk.js:447` *(as `A.`)* | 1 | 2 |
| `APP.stopNavigation` | — *phantom* | 0 | 5 |
| `APP.stopStepDetection` | `viewer/walk.js:383` *(as `A.`)* | 1 | 2 |
| `APP.stopStillRefine` | `viewer/effects.js:5314` *(as `A.`)* | 1 | 30 |
| `APP.stopStillSSGIPhase` | `viewer/effects_gi_poc.js:563` *(as `A.`)* | 1 | 3 |
| `APP.stopWalkMode` | `viewer/walk.js:315` *(as `A.`)* | 1 | 2 |
| `APP.storeyMeshGroups` | `viewer/panels.js:701` *(as `A.`)* | 1 | 1 |
| `APP.storeyRevealApplyVisual` | `viewer/cpe_storey_reveal.js:343` *(as `A.`)* | 1 | 7 |
| `APP.storeyRevealCaptionAt` | `viewer/cpe_storey_reveal.js:192` *(as `A.`)* | 1 | 5 |
| `APP.storeyRevealList` | `viewer/cpe_storey_reveal.js:64` *(as `A.`)* | 1 | 2 |
| `APP.storeyRevealStatCardAt` | `viewer/cpe_storey_reveal.js:209` *(as `A.`)* | 1 | 6 |
| `APP.storeyRevealStatsFor` | `viewer/cpe_storey_reveal.js:93` *(as `A.`)* | 1 | 6 |
| `APP.storeyRevealVisualAt` | `viewer/cpe_storey_reveal.js:163` *(as `A.`)* | 1 | 7 |
| `APP.streamBuilding` | `viewer/streaming.js:318` *(as `A.`)* | 1 | 29 |
| `APP.streamIdx` | `viewer/city.js:786` *(as `A.`)* | 10 | 59 |
| `APP.streamQueue` | `viewer/city.js:777` *(as `A.`)* | 12 | 87 |
| `APP.streamTick` | `viewer/streaming.js:1683` *(as `A.`)* | 1 | 2 |
| `APP.streamedCount` | `viewer/city.js:820` *(as `A.`)* | 5 | 41 |
| `APP.streaming` | `cli_silent_bake.js:280` *(as `A.`)* | 18 | 148 |
| `APP.sun` | `viewer/scene.js:196` *(as `A.`)* | 1 | 210 |
| `APP.sunglassOn` | `viewer/tools.js:574` *(as `A.`)* | 2 | 4 |
| `APP.tailPanelAt` | `viewer/cpe_resource_panel.js:543` *(as `A.`)* | 1 | 5 |
| `APP.three2ifc` | `viewer/scene.js:506` *(as `A.`)* | 1 | 33 |
| `APP.three2ifcDir` | `viewer/scene.js:511` *(as `A.`)* | 1 | 3 |
| `APP.tmCopySnapshotImage` | `viewer/share.js:415` *(as `A.`)* | 1 | 3 |
| `APP.tmCopySnapshotLink` | `viewer/share.js:446` *(as `A.`)* | 1 | 2 |
| `APP.tmFrontierPhase` | `witness_cpe_room_title_collective.js:146` *(as `A.`)* | 3 | 5 |
| `APP.toast` | — *phantom* | 0 | 2 |
| `APP.toggleBackground` | `viewer/tools.js:1037` *(as `A.`)* | 1 | 2 |
| `APP.toggleClashMode` | `viewer/measure.js:1951` *(as `A.`)* | 1 | 1 |
| `APP.toggleDisc` | `viewer/panels.js:741` *(as `A.`)* | 1 | 2 |
| `APP.toggleFlyAround` | `viewer/tour.js:8` *(as `A.`)* | 1 | 7 |
| `APP.toggleFullscreen` | `viewer/tools.js:532` *(as `A.`)* | 1 | 5 |
| `APP.toggleGIPreview` | `viewer/effects_gi_poc.js:15` *(as `A.`)* | 2 | 11 |
| `APP.toggleGridOverlay` | — *phantom* | 0 | 27 |
| `APP.toggleHoverName` | `viewer/hover_name.js:149` *(as `A.`)* | 1 | 9 |
| `APP.toggleIssues` | `viewer/issues.js:243` *(as `A.`)* | 1 | 2 |
| `APP.toggleMeasure` | `viewer/measure.js:1177` *(as `A.`)* | 1 | 8 |
| `APP.toggleNightMode` | `viewer/tools.js:1465` *(as `A.`)* | 1 | 23 |
| `APP.toggleNlp` | `viewer/nlp.js:672` *(as `A.`)* | 1 | 9 |
| `APP.togglePanel` | `viewer/panels.js:494` *(as `A.`)* | 1 | 2 |
| `APP.togglePopulate` | `viewer/effects.js:2141` *(as `A.`)* | 1 | 19 |
| `APP.toggleSSAO` | `viewer/effects.js:19` *(as `A.`)* | 2 | 6 |
| `APP.toggleSSGIPreview` | `viewer/effects_gi_poc.js:487` *(as `A.`)* | 1 | 7 |
| `APP.toggleSection` | `viewer/tools.js:402` *(as `A.`)* | 1 | 10 |
| `APP.toggleShadow` | `viewer/tools.js:930` *(as `A.`)* | 1 | 16 |
| `APP.toggleStillRefine` | `viewer/effects.js:5442` *(as `A.`)* | 1 | 10 |
| `APP.toggleSunglass` | `viewer/tools.js:577` *(as `A.`)* | 1 | 2 |
| `APP.toggleTheme` | `viewer/tools.js:547` *(as `A.`)* | 1 | 2 |
| `APP.toggleVariance` | `viewer/diff.js:433` *(as `A.`)* | 1 | 3 |
| `APP.toggleWalkMode` | `viewer/walk.js:25` *(as `A.`)* | 1 | 2 |
| `APP.toggleWireframe` | `viewer/tools.js:291` *(as `A.`)* | 1 | 1 |
| `APP.toggleXray` | `viewer/tools.js:306` *(as `A.`)* | 1 | 44 |
| `APP.totalElements` | `viewer/city.js:364` *(as `A.`)* | 5 | 15 |
| `APP.tourScrubSpeed` | `viewer/tour.js:356` *(as `A.`)* | 2 | 5 |
| `APP.tourSeek` | `viewer/tour.js:1442` *(as `A.`)* | 1 | 25 |
| `APP.tourSetSpeed` | `viewer/tour.js:1837` *(as `A.`)* | 1 | 5 |
| `APP.tourStepBeat` | `viewer/tour.js:1477` *(as `A.`)* | 1 | 8 |
| `APP.tourTogglePause` | `viewer/tour.js:1828` *(as `A.`)* | 1 | 12 |
| `APP.undoMarkup` | `viewer/sitecam.js:353` *(as `A.`)* | 1 | 2 |
| `APP.updateAmbience` | `viewer/tools.js:674` *(as `A.`)* | 1 | 8 |
| `APP.updateHUD` | `viewer/panels.js:939` *(as `A.`)* | 1 | 7 |
| `APP.updateHash` | `viewer/streaming.js:3438` *(as `A.`)* | 1 | 2 |
| `APP.updateLighting` | `viewer/tools.js:894` *(as `A.`)* | 1 | 2 |
| `APP.updateMeasureLabels` | `viewer/measure.js:1652` *(as `A.`)* | 1 | 2 |
| `APP.updateSectionPlane` | `viewer/tools.js:484` *(as `A.`)* | 1 | 4 |
| `APP.updateSky` | `viewer/scene.js:253` *(as `A.`)* | 1 | 28 |
| `APP.viewer` | — *phantom* | 0 | 2 |
| `APP.walkActionIdx` | `viewer/picking.js:82` *(as `A.`)* | 9 | 43 |
| `APP.walkActionT` | `viewer/picking.js:83` *(as `A.`)* | 11 | 15 |
| `APP.walkActions` | `viewer/picking.js:81` *(as `A.`)* | 6 | 51 |
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
| `APP.walkMode` | `viewer/picking.js:46` *(as `A.`)* | 14 | 33 |
| `APP.walkModeActive` | `viewer/navigate_find.js:4234` *(as `A.`)* | 4 | 46 |
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
| `APP.walkTick` | `viewer/tour.js:1524` *(as `A.`)* | 1 | 6 |
| `APP.walkTotalLen` | `viewer/picking.js:58` *(as `A.`)* | 1 | 1 |
| `APP.wallXrayActive` | `viewer/picking.js:54` *(as `A.`)* | 3 | 4 |
| `APP.wallXrayMepHighlights` | `viewer/picking.js:62` *(as `A.`)* | 2 | 4 |
| `APP.wallXrayOriginals` | `viewer/picking.js:55` *(as `A.`)* | 2 | 5 |
| `APP.wireOn` | `viewer/tools.js:290` *(as `A.`)* | 2 | 7 |
| `APP.wlog` | `viewer/picking.js:89` *(as `A.`)* | 1 | 26 |
| `APP.xrayOn` | `viewer/tools.js:305` *(as `A.`)* | 4 | 64 |
| `APP.zoomToGuid` | `viewer/diff.js:187` *(as `A.`)* | 1 | 10 |
| `APP.zoomToGuids` | `viewer/diff.js:241` *(as `A.`)* | 1 | 4 |
