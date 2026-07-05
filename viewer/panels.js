/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// panels.js — Panel collapse, storey/disc filters, building list, HUD, swipe
// ── S265 Phase 5: ICONS registry — single source of truth for all Lucide icons ──
// Implementing S265_UI_AESTHETICS.md §Implementation — Witness: W-PANEL
var ICONS = {
  clock:     { svg: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>', trl: 'ui_tt_tm', key: 'T', desc: 'Time Machine' },
  ruler:     { svg: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/>', trl: 'ui_tt_measure', key: null, desc: 'Measure' },
  search:    { svg: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>', trl: 'ui_tt_find', key: null, desc: 'Find' },
  share:     { svg: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>', trl: 'ui_tt_share', key: null, desc: 'Share' },
  lifeBuoy:  { svg: '<circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/><circle cx="12" cy="12" r="4"/>', trl: 'ui_tt_help', key: 'F1', desc: 'Help' },
  circleHelp:{ svg: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>', trl: 'ui_tt_help', key: 'F1', desc: 'Help' },
  moreVert:  { svg: '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>', trl: null, key: '.', desc: 'More' },
  moreHoriz: { svg: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>', trl: null, key: '.', desc: 'More' },  // FLAT kebab — mobile ⋯ trigger (differs from Android's vertical ⋮); parity with erp/icons.js
  scissors:  { svg: '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>', trl: 'ui_tt_section', key: null, desc: 'Section Cut' },
  eye:       { svg: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="1"/><path d="M18.944 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-13.888 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 13.888 0"/>', trl: 'ui_tt_xray', key: 'X', desc: 'X-Ray' },
  clipboard: { svg: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>', trl: 'ui_tt_issues', key: 'I', desc: 'Issues' },
  triangle:  { svg: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>', trl: 'ui_tt_clash', key: null, desc: 'Clash Matrix' },
  plane:     { svg: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>', trl: 'ui_tt_fly', key: 'L', desc: 'Fly Tour' },
  layout:    { svg: '<rect width="18" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/>', trl: 'ui_tt_2d', key: '2', desc: '2D Plans' },
  palette:   { svg: '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>', trl: 'ui_tt_sunglass', key: 'P', desc: 'Color Studio' },
  moon:      { svg: '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>', trl: 'ui_tt_night', key: 'N', desc: 'Night' },
  cloud:     { svg: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>', trl: 'ui_tt_shadow', key: 'H', desc: 'Shadow' },
  contrast:  { svg: '<circle cx="12" cy="12" r="10"/><path d="M12 18a6 6 0 0 0 0-12v12z"/>', trl: 'ui_tt_bg', key: 'B', desc: 'Background' },
  maximize:  { svg: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>', trl: 'ui_tt_fullscreen', key: null, desc: 'Fullscreen' },
  box:       { svg: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>', trl: 'ui_tt_bbox', key: 'Alt+X', desc: 'Bounding Boxes' },
  camera:    { svg: '<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/>', trl: null, key: null, desc: 'Camera / View' },
  // PILL_DRAWER_REORGANIZATION.md §NEW ICONS — Lucide, pulled verbatim 2026-07-05 (unpkg.com/lucide-static)
  bone:      { svg: '<path d="M17 10c.7-.7 1.69 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .81.7 1.8 0 2.5l-7 7c-.7.7-1.69 0-2.5 0a2.5 2.5 0 0 0 0 5c.28 0 .5.22.5.5a2.5 2.5 0 1 0 5 0c0-.81-.7-1.8 0-2.5Z" />', trl: 'ui_tt_xray', key: null, desc: 'X-Ray' },
  hardHat:   { svg: '<path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5" /><path d="M14 6a6 6 0 0 1 6 6v3" /><path d="M4 15v-3a6 6 0 0 1 6-6" /><rect x="2" y="15" width="20" height="4" rx="1" />', trl: null, key: null, desc: 'Inspect (unused, replaced by draftingCompass)' },
  draftingCompass: { svg: '<path d="m12.99 6.74 1.93 3.44" /><path d="M19.136 12a10 10 0 0 1-14.271 0" /><path d="m21 21-2.16-3.84" /><path d="m3 21 8.02-14.26" /><circle cx="12" cy="5" r="2" />', trl: null, key: null, desc: 'Inspect' },
  sailboat:  { svg: '<path d="M10 2v15" /><path d="M7 22a4 4 0 0 1-4-4 1 1 0 0 1 1-1h16a1 1 0 0 1 1 1 4 4 0 0 1-4 4z" /><path d="M9.159 2.46a1 1 0 0 1 1.521-.193l9.977 8.98A1 1 0 0 1 20 13H4a1 1 0 0 1-.824-1.567z" />', trl: null, key: null, desc: 'Navigate' },
  barChart:  { svg: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>', trl: 'ui_tt_export', key: null, desc: '4D/5D Export' },
  home:      { svg: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>', trl: 'ui_tt_home', key: null, desc: 'Home' },
  // S266: Doc pill icons — New From Reference designer
  doc:       { svg: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>', trl: 'ui_tt_doc', key: 'D', desc: 'Document' },
  grid:      { svg: '<path d="M3 3h18v18H3z"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/>', trl: 'ui_tt_grid', key: null, desc: 'Grid' },
  table:     { svg: '<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>', trl: 'ui_tt_table', key: null, desc: 'Table' },
  next:      { svg: '<path d="m9 18 6-6-6-6"/>', trl: 'ui_tt_next', key: null, desc: 'Next Phase' },
  save:      { svg: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>', trl: 'ui_tt_save', key: null, desc: 'Save Design' },
  folderOpen: { svg: '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>', trl: 'ui_tt_open', key: null, desc: 'Open Design' },
  // S266: MEP pipe icon (elbow pipe shape) + UBBL compliance checklist
  pipe:      { svg: '<path d="M12 2v6"/><path d="M12 8a4 4 0 0 1 4 4v0"/><path d="M16 12h6"/><path d="M10 8h4"/><path d="M16 10v4"/>', trl: 'ui_tt_mep', key: null, desc: 'MEP Routes' },
  checkList: { svg: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>', trl: 'ui_tt_ubbl', key: null, desc: 'UBBL Compliance' },
  // S266: Rosetta Stone — diamond gem icon (distinctive, calibration = precious)
  rosetta:   { svg: '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20"/><path d="M12 21 6 9"/><path d="M12 21l6-12"/><path d="M8 3l4 6 4-6"/>', trl: 'ui_tt_rosetta', key: null, desc: 'Rosetta Stone' },
  // S266: Discipline selector — hub icon + per-discipline icons
  disciplines: { svg: '<circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="12" cy="4" r="2"/><circle cx="12" cy="20" r="2"/><circle cx="4" cy="12" r="2"/><circle cx="20" cy="12" r="2"/><circle cx="6.34" cy="6.34" r="2"/><circle cx="17.66" cy="6.34" r="2"/><circle cx="6.34" cy="17.66" r="2"/><circle cx="17.66" cy="17.66" r="2"/><line x1="12" y1="7" x2="12" y2="9"/><line x1="12" y1="15" x2="12" y2="17"/><line x1="7" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="17" y2="12"/>', trl: 'ui_tt_disc', key: null, desc: 'Disciplines' },
  discSTR:   { svg: '<rect x="10" y="2" width="4" height="20"/><path d="M6 4h12"/><path d="M6 20h12"/>', trl: null, key: null, desc: 'Structural' },
  discARC:   { svg: '<path d="M3 21V8l9-6 9 6v13"/><path d="M9 21v-6h6v6"/>', trl: null, key: null, desc: 'Architectural' },
  discFP:    { svg: '<path d="M12 2v4"/><circle cx="12" cy="10" r="4"/><path d="M8 13l-2 6"/><path d="M16 13l2 6"/><path d="M12 14v5"/><circle cx="12" cy="10" r="1" fill="currentColor"/>', trl: null, key: null, desc: 'Fire Protection' },
  discACMV:  { svg: '<path d="M2 12c2-3 4-4 6-4s4 2 6 0 4-4 6-4"/><path d="M2 17c2-3 4-4 6-4s4 2 6 0 4-4 6-4"/><path d="M2 7c2-3 4-4 6-4s4 2 6 0 4-4 6-4"/>', trl: null, key: null, desc: 'ACMV' },
  discELEC:  { svg: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>', trl: null, key: null, desc: 'Electrical' },
  discPLMB:  { svg: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>', trl: null, key: null, desc: 'Plumbing' },
  discMEP:   { svg: '<path d="M12 2v6"/><path d="M12 8a4 4 0 0 1 4 4v0"/><path d="M16 12h6"/><path d="M10 8h4"/><path d="M16 10v4"/>', trl: null, key: null, desc: 'MEP General' },
  // P1 sunglass slider icons
  sun:       { svg: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>', trl: 'ui_sun', key: null, desc: 'Sun intensity' },
  sunDim:    { svg: '<circle cx="12" cy="12" r="4"/><path d="M12 4h.01"/><path d="M20 12h.01"/><path d="M12 20h.01"/><path d="M4 12h.01"/><path d="M17.66 6.34h.01"/><path d="M17.66 17.66h.01"/><path d="M6.34 17.66h.01"/><path d="M6.34 6.34h.01"/>', trl: 'ui_exposure', key: null, desc: 'Exposure' },
  lightbulb: { svg: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>', trl: 'ui_ambient', key: null, desc: 'Ambient' },
  sunrise:   { svg: '<path d="M12 2v8"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="M16 18a4 4 0 0 0-8 0"/>', trl: 'ui_hemisphere', key: null, desc: 'Hemisphere' },
  // SPATIAL_PICKING_SPEC §S-3 — Lucide "route" verbatim (the warehouse pick-walk lens pill).
  route:     { svg: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>', trl: null, key: null, desc: 'Pick Walk' },
  // WH Walk UX §C-5 — switch-source mid-walk (Lucide rotateCcw, verbatim).
  rotateCcw: { svg: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>', trl: null, key: null, desc: 'Switch source' },
  // HISTORY_KNOB_DIAL.md rework: "W" = World history (cross-page) — two overlapping outline circles.
  worldHist: { svg: '<circle cx="9.5" cy="12" r="6.5"/><circle cx="14.5" cy="12" r="6.5"/>', trl: null, key: 'w', desc: 'World History' },
  // "Z" per-page timeline — three small overlapping dots, the MIDDLE one filled.
  docHist:   { svg: '<circle cx="8" cy="12" r="3"/><circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="16" cy="12" r="3"/>', trl: null, key: 'z', desc: 'Page history' },
  // Clear history (bomb) — Lucide bomb (lives in the W long-press drawer, NO keyboard shortcut).
  bomb:      { svg: '<circle cx="11" cy="13" r="9"/><path d="M14.35 4.65 16.3 2.7a2.41 2.41 0 0 1 3.4 0l1.6 1.6a2.4 2.4 0 0 1 0 3.4l-1.95 1.95"/><path d="m22 22-1.5-1.5"/><path d="m19 8 1-1"/>', trl: null, key: null, desc: 'Clear history' },
  // HR_BIM_Asset — ONE "FM / Operate" family icon (the 6 lenses now live in a drawer owned by hba_lens.js,
  // which carries its own per-lens icons). Lucide 'building-2' = the operate-phase / facilities cockpit.
  fmCockpit: { svg: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>', trl: null, key: null, desc: 'FM / Operate' },
  barChart:  { svg: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>', trl: null, key: null, desc: 'Occupancy dashboard' },
  // PILLS_CONSOLIDATION_REVIEW_2026-07-03 §ICON MAP — one glyph = ONE meaning everywhere. These five
  // (Lucide, verbatim) break up the confirmed glyph collisions: checkList stays UBBL-only, maximize stays
  // Fullscreen-only, share stays Share-only, disciplines stays Disciplines-only, rotateCcw stays Switch-source-only.
  shieldCheck: { svg: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>', trl: null, key: null, desc: 'Verify Ledger' },
  scale:       { svg: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>', trl: null, key: null, desc: 'Business Rule' },
  locateFixed: { svg: '<line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/>', trl: null, key: null, desc: 'Reset / Re-center View' },
  footprints:  { svg: '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4"/><path d="M4 13h4"/>', trl: null, key: null, desc: 'Trace Lineage' },
  orbit:       { svg: '<circle cx="12" cy="12" r="3"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><path d="M10.4 21.9a10 10 0 0 0 9.941-15.416"/><path d="M13.5 2.1a10 10 0 0 0-9.841 15.416"/>', trl: null, key: null, desc: 'Gravity View' },
  waypoints:   { svg: '<circle cx="12" cy="4.5" r="2.5"/><path d="m10.2 6.3-3.9 3.9"/><circle cx="4.5" cy="12" r="2.5"/><path d="M7 12h10"/><circle cx="19.5" cy="12" r="2.5"/><path d="m13.8 17.7 3.9-3.9"/><circle cx="12" cy="19.5" r="2.5"/>', trl: null, key: null, desc: 'Untangle Graph' }
};

// HISTORY_KNOB_DIAL.md — the W pill's long-press drawer: two stacked chips above the pill.
//   Z (docHist) = open THIS page's dot-timeline bar · bomb = clear history (warns first, no shortcut).
function _histIconSvg(name, color) {
  var ic = ICONS[name];
  return '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" ' +
    'stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ic ? ic.svg : '') + '</svg>';
}
function _clearHistoryWithWarning() {
  // The timeline persists in localStorage (bim.hist.tree.<db>), NOT the SW cache — "clear cache" never
  // wiped it (this confused the user). The bomb is the one switch that does.
  // It must wipe BOTH stores: the per-page TIMELINE (bim.hist.tree.*) AND the cross-page WORLD log
  // (WholeHistory's bim.docHistory) — bug: the bomb only touched the timeline, so World History survived.
  if (window.confirm('Clear history for this page AND the world timeline?\nThis wipes the saved history (it lives in local storage, not the cache) and cannot be undone.')) {
    try { Object.keys(localStorage).filter(function (k) { return k.indexOf('bim.hist.tree') === 0; }).forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
    if (window.UniversalHistory && UniversalHistory.clear) UniversalHistory.clear();
    // §HIST_CLEAR world: WholeHistory keeps its own bim.docHistory log — clear it too, then refresh the
    // overlay in place (if open) so it shows empty straight away rather than stale entries.
    var world = 'n/a';
    if (window.WholeHistory && WholeHistory.clear) {
      try { WholeHistory.clear(); world = 'cleared'; } catch (e) { world = 'err'; }
      try {
        var p = document.getElementById('whole-hist-panel');
        if (p && p.classList.contains('show') && WholeHistory.open) WholeHistory.open();  // re-render to empty
      } catch (e) {}
    }
    console.log('§HIST_CLEAR via=bomb confirmed world=' + world);
  } else { console.log('§HIST_CLEAR via=bomb cancelled'); }
}
function _worldHistDrawer(srcBtn) {
  var open = document.getElementById('whist-drawer');
  if (open) { open.remove(); return; }                 // long-press again toggles it shut
  if (!srcBtn) return;
  var r = srcBtn.getBoundingClientRect();
  var d = document.createElement('div'); d.id = 'whist-drawer';
  // PERPENDICULAR auto-layout — draw the drawer ACROSS the pill strip, never ALONG it (a parallel drawer
  // covers the neighbouring pills). Measure the strip container: a VERTICAL strip (viewer right-edge
  // #mobile-pill) → a ROW to the LEFT of W; a HORIZONTAL strip → a COLUMN ABOVE. Same dynamic rule as
  // erp idmp_pills/glassbowl_pills — self-correcting if a bar's orientation flips (the regression that bit
  // the ERP bar when it went vertical). Chip order (bomb, then Z): row → bomb left/far, Z right/adjacent.
  var _host = srcBtn.parentElement, _hr = _host ? _host.getBoundingClientRect() : r;
  var _vertical = _hr.height >= _hr.width;
  var _base = 'position:fixed;z-index:10000;display:flex;align-items:center;gap:6px;';
  if (_vertical) {
    d.style.cssText = _base + 'flex-direction:row;top:' + r.top + 'px;right:' +
      Math.max(8, Math.round(window.innerWidth - r.left + 6)) + 'px;';
  } else {
    d.style.cssText = _base + 'flex-direction:column;bottom:' + (window.innerHeight - r.top + 6) +
      'px;left:' + Math.max(8, r.left) + 'px;';
  }
  console.log('§PILL_DRAWER orient=' + (_vertical ? 'row(vertical-strip)' : 'col(horizontal-strip)'));
  function chip(name, title, color, onTap) {
    var b = document.createElement('button'); b.title = title; b.innerHTML = _histIconSvg(name, color);
    b.style.cssText = 'width:44px;height:44px;display:flex;align-items:center;justify-content:center;border:none;' +
      'border-radius:8px;background:rgba(20,20,40,0.85);color:' + color + ';cursor:pointer;' +
      'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 2px 12px rgba(0,0,0,0.4);';
    b.addEventListener('pointerup', function (e) { e.stopPropagation(); onTap(); var dd = document.getElementById('whist-drawer'); if (dd) dd.remove(); });
    return b;
  }
  d.appendChild(chip('bomb', 'Clear history…', '#ff6b6b', _clearHistoryWithWarning));
  d.appendChild(chip('docHist', 'Page history (Z) — this page\'s dot timeline', '#4fc3f7',
    function () { if (window.UniversalHistory && UniversalHistory.toggleOpen) UniversalHistory.toggleOpen(); }));
  document.body.appendChild(d);
  setTimeout(function () {
    var off = function (ev) { var dd = document.getElementById('whist-drawer'); if (dd && !dd.contains(ev.target)) { dd.remove(); document.removeEventListener('pointerdown', off, true); } };
    document.addEventListener('pointerdown', off, true);
  }, 0);
  console.log('§PILL_DRAWER worldhist items=Z,bomb');
}

function setupPanels(A) {
  // ── S265 Phase 5: A.icon() — standard icon button factory ──
  A.icon = function(name, opts) {
    opts = opts || {};
    var ic = ICONS[name];
    if (!ic) { console.warn('§ICON_MISS name=' + name); return document.createElement('button'); }
    var btn = document.createElement('button');
    var size = opts.size || 20;
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ic.svg + '</svg>';
    btn.title = (typeof _TRL !== 'undefined' && ic.trl && _TRL[ic.trl]) || opts.title || ic.desc || '';
    if (ic.trl) btn.setAttribute('data-trl-title', ic.trl);
    if (opts.active) btn.classList.add('active');
    if (opts.id) btn.id = opts.id;
    if (opts.onClick) btn.addEventListener('pointerup', function(e) { e.stopPropagation(); opts.onClick(e); });
    return btn;
  };

  // ── S265 Phase 5: A.createPanel() — reusable panel factory ──
  A.createPanel = function(id, opts) {
    opts = opts || {};
    var el = document.createElement('div');
    el.id = id;
    el.className = 'bim-panel';
    if (opts.style) Object.assign(el.style, opts.style);
    // Close button
    if (opts.closable !== false) {
      var closeBtn = document.createElement('span');
      closeBtn.className = 'bim-panel-close';
      closeBtn.innerHTML = '&times;';
      closeBtn.addEventListener('pointerup', function(e) {
        e.stopPropagation();
        el.style.display = 'none';
        if (opts.onClose) opts.onClose();
      });
      el.appendChild(closeBtn);
    }
    // Content
    if (opts.content) {
      if (typeof opts.content === 'string') { el.insertAdjacentHTML('beforeend', opts.content); }
      else { el.appendChild(opts.content); }
    }
    // Draggable
    if (opts.draggable !== false && A._makeDraggable) {
      A._makeDraggable(el);
    }
    // Pointer isolation (prevent canvas pick-through)
    el.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
    // Register with focus system
    if (typeof _registerPanel === 'function') {
      var closeFn = opts.onClose || function() { el.style.display = 'none'; };
      _registerPanel(id.replace(/-/g, ''), el, null, closeFn);
    }
    el.style.display = 'none';
    document.body.appendChild(el);
    console.log('§PANEL_CREATE id=' + id);
    return el;
  };

  // ── S265 Phase 5 P1: Build Color Palette slider panel ──
  A._buildSunglassPanel = function() {
    var existing = document.getElementById('sunglass-slider-panel');
    if (!existing) return;
    // Replace the placeholder with a proper bim-panel
    existing.className = 'bim-panel';
    // §PANEL-SPREAD: upper-left — was top:90/right:70, same spot as Settings/drawers/JSON editor.
    existing.style.cssText = 'display:none; top:70px; left:16px; min-width:220px; max-width:280px;';

    // Close button
    var closeBtn = document.createElement('span');
    closeBtn.className = 'bim-panel-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('pointerup', function(e) {
      e.stopPropagation();
      if (typeof window.toggleSunglass === 'function') toggleSunglass();
    });
    existing.appendChild(closeBtn);

    // Slider row helper — icon + range + fade-value
    function sliderRow(iconName, sliderId, valId, min, max, val, step, onInput) {
      var row = document.createElement('div');
      row.className = 'bim-slider-row';
      // Icon button
      var btn = A.icon(iconName, { size: 18 });
      row.appendChild(btn);
      // Slider
      var inp = document.createElement('input');
      inp.type = 'range'; inp.id = sliderId;
      inp.min = String(min); inp.max = String(max); inp.step = String(step);
      inp.value = String(val);
      row.appendChild(inp);
      // Value label (hidden until drag)
      var valSpan = document.createElement('span');
      valSpan.className = 'bim-slider-val';
      valSpan.id = valId;
      valSpan.textContent = Number(val).toFixed(step < 1 ? 2 : 0);
      row.appendChild(valSpan);

      var fadeTimer = null;
      inp.addEventListener('input', function() {
        valSpan.classList.add('visible');
        if (fadeTimer) clearTimeout(fadeTimer);
        fadeTimer = setTimeout(function() { valSpan.classList.remove('visible'); }, 1000);
        if (onInput) onInput(inp.value);
      });
      // Show value on pointerdown too
      inp.addEventListener('pointerdown', function() { valSpan.classList.add('visible'); });
      return row;
    }

    // Row 1: Palette / Color Studio (ambience 0-100)
    existing.appendChild(sliderRow('palette', 'sunglass-slider', 'sunglass-val', 0, 100, 0, 1, function(v) {
      if (typeof updateAmbience === 'function') updateAmbience(v);
    }));

    // Separator
    var sep = document.createElement('hr');
    sep.style.cssText = 'border:none;border-top:1px solid rgba(255,255,255,0.1);margin:4px 0';
    existing.appendChild(sep);

    // Row 2: Sun (0-5.0)
    existing.appendChild(sliderRow('sun', 'sl-sun', 'sl-sun-val', 0, 5.0, 1.4, 0.05, function(v) {
      if (typeof updateLighting === 'function') updateLighting('sun', v);
    }));
    // Row 3: Aperture / Exposure (0.1-3.0)
    existing.appendChild(sliderRow('sunDim', 'sl-exposure', 'sl-exposure-val', 0.1, 3.0, 0.45, 0.05, function(v) {
      if (typeof updateLighting === 'function') updateLighting('exposure', v);
    }));
    // Row 4: Ambient (0-2.0)
    existing.appendChild(sliderRow('lightbulb', 'sl-ambient', 'sl-ambient-val', 0, 2.0, 0.25, 0.01, function(v) {
      if (typeof updateLighting === 'function') updateLighting('ambient', v);
    }));
    // Row 5: Hemisphere (0-2.0)
    existing.appendChild(sliderRow('sunrise', 'sl-hemi', 'sl-hemi-val', 0, 2.0, 0.40, 0.01, function(v) {
      if (typeof updateLighting === 'function') updateLighting('hemi', v);
    }));

    // §SHADOW-GROUND MERGE (PILL_DRAWER_REORGANIZATION.md): the old separate 4-button Ground
    // picker (None/Grass/Earth/Paved) is REMOVED here — replaced by the single Shadow+Ground
    // cycle swatch appended by _extendVisualFxPanel()/_buildShadowGroundRow() further down
    // (runs after _actions exists, reusing the 'shadow' action's real fn/isActive).

    // Draggable + pointer isolation
    if (A._makeDraggable) A._makeDraggable(existing);
    existing.addEventListener('pointerdown', function(e) { e.stopPropagation(); });

    console.log('§COLOR_PALETTE built with bim-panel + icon slider rows');
  };

  // Build the sunglass panel immediately
  A._buildSunglassPanel();

  // §S265c: Reset overflow state — bfcache/SW can restore stale class from previous session
  var _sb = document.getElementById('search-box');
  if (_sb) _sb.classList.remove('overflow-open');
  var _sc = document.getElementById('overflow-scrim');
  if (_sc) _sc.classList.remove('active');

  // Prevent touch/click on floating panels from reaching canvas underneath
  // S265 Phase 4: storey-panel/disc-panel removed (inside HUD now)
  ['hud','search-box','info-panel','issues-panel','status'].forEach(function(pid) {
    var el = document.getElementById(pid);
    if (el) el.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
  });

  // Panel collapse
  A.togglePanel = function(id) {
    const body = document.getElementById(id);
    body.classList.toggle('collapsed');
  };

  // ══════════════════════════════════════════════════════════════
  // S251 §8: ListKeyNav — universal keyboard navigator for list panels
  // Implementing S251_keyboard_modes.md — Witness: W-KBD
  // ══════════════════════════════════════════════════════════════
  function makeListKeyNav(getItems, onToggle, onActivate, onCursorMove) {
    var cursor = -1;
    var anchor = -1;
    var selected = new Set();
    var _taBuffer = '';
    var _taTimer = null;

    function scrollTo(i) {
      var items = getItems();
      if (items[i]) items[i].scrollIntoView({ block: 'nearest' });
    }

    function moveCursor(delta) {
      var items = getItems();
      if (!items.length) { console.log('§LISTNAV_MOVE empty list, no-op'); return; }
      var prev = cursor;
      cursor = Math.max(0, Math.min(items.length - 1, cursor + delta));
      scrollTo(cursor);
      // Visual highlight
      items.forEach(function(el, j) {
        el.style.outline = (j === cursor) ? '2px solid #4fc3f7' : '';
      });
      var label = items[cursor] ? (items[cursor].textContent || '').trim().slice(0, 20) : '?';
      console.log('§LISTNAV_MOVE prev=' + prev + ' now=' + cursor + ' label="' + label + '" total=' + items.length);
      if (onCursorMove) onCursorMove(cursor);
    }

    function extendRange(delta) {
      if (anchor < 0) anchor = cursor >= 0 ? cursor : 0;
      moveCursor(delta);
      var lo = Math.min(anchor, cursor), hi = Math.max(anchor, cursor);
      selected = new Set();
      for (var i = lo; i <= hi; i++) selected.add(i);
      console.log('§LISTNAV_RANGE anchor=' + anchor + ' cursor=' + cursor + ' lo=' + lo + ' hi=' + hi);
      _emit();
    }

    function _emit() {
      onToggle(Array.from(selected));
      console.log('§LISTNAV_SELECT count=' + selected.size + ' indices=[' + Array.from(selected).join(',') + ']');
    }

    return {
      onKey: function(e) {
        var items = getItems();
        // If cursor is on a slider, ←→ steps the slider value
        var curItem = items[cursor];
        if (curItem && curItem.tagName === 'INPUT' && curItem.type === 'range') {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            var step = parseFloat(curItem.step) || 1;
            var val = parseFloat(curItem.value) + (e.key === 'ArrowRight' ? step : -step);
            val = Math.max(parseFloat(curItem.min), Math.min(parseFloat(curItem.max), val));
            curItem.value = val;
            // Fire oninput handler
            curItem.dispatchEvent(new Event('input'));
            console.log('§LISTNAV_SLIDER val=' + val.toFixed(2));
            return;
          }
          // ↑↓ moves cursor off the slider to next/prev item
          if (e.key === 'ArrowUp') { moveCursor(-1); return; }
          if (e.key === 'ArrowDown') { moveCursor(+1); return; }
        }
        // Shift+Arrow must be checked BEFORE plain Arrow
        if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowLeft'))   { console.log('§LISTNAV_KEY shift+up'); extendRange(-1); return; }
        if (e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowRight')) { console.log('§LISTNAV_KEY shift+down'); extendRange(+1); return; }
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft')   { moveCursor(-1); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { moveCursor(+1); return; }
        if (e.key === 'PageUp')    { console.log('§LISTNAV_KEY pageup'); moveCursor(-5); return; }
        if (e.key === 'PageDown')  { console.log('§LISTNAV_KEY pagedown'); moveCursor(+5); return; }
        if (e.key === 'Home')      { console.log('§LISTNAV_KEY home'); cursor = -1; moveCursor(1); return; }
        if (e.key === 'End')       { console.log('§LISTNAV_KEY end'); cursor = items.length; moveCursor(-1); return; }
        if (e.ctrlKey && e.key === 'a') {
          selected = new Set();
          items.forEach(function(_, i) { selected.add(i); });
          console.log('§LISTNAV_KEY ctrl+a selectAll=' + selected.size);
          _emit();
          return;
        }
        if (e.key === ' ' && !e.ctrlKey) {
          selected = new Set([cursor]); anchor = cursor;
          console.log('§LISTNAV_KEY space activate cursor=' + cursor);
          _emit();
          if (onActivate) onActivate(cursor);
          return;
        }
        if (e.ctrlKey && e.key === ' ') {
          var action = selected.has(cursor) ? 'remove' : 'add';
          if (selected.has(cursor)) selected.delete(cursor); else selected.add(cursor);
          anchor = cursor;
          console.log('§LISTNAV_KEY ctrl+space ' + action + ' cursor=' + cursor);
          _emit();
          return;
        }
        if (e.key === 'Enter' && onActivate) { console.log('§LISTNAV_KEY enter cursor=' + cursor); onActivate(cursor); return; }
      },
      onTypeahead: function(ch) {
        clearTimeout(_taTimer);
        _taBuffer += ch.toLowerCase();
        var items = getItems();
        var labels = [];
        items.forEach(function(el) { labels.push((el.textContent || '').trim().toLowerCase()); });
        var matches = [];
        labels.forEach(function(l, i) { if (l.indexOf(_taBuffer) === 0) matches.push(i); });
        if (matches.length) {
          var next = matches[0];
          var cycled = false;
          if (_taBuffer.length === 1 && matches.indexOf(cursor) >= 0) {
            next = matches[(matches.indexOf(cursor) + 1) % matches.length];
            cycled = true;
          }
          cursor = next;
          scrollTo(cursor);
          var items2 = getItems();
          items2.forEach(function(el, j) {
            el.style.outline = (j === cursor) ? '2px solid #4fc3f7' : '';
          });
          var label = items2[cursor] ? (items2[cursor].textContent || '').trim().slice(0, 20) : '?';
          console.log('§LISTNAV_TYPEAHEAD buf="' + _taBuffer + '" matches=[' + matches.join(',') + '] cursor=' + cursor + ' label="' + label + '" cycled=' + cycled);
        } else {
          console.log('§LISTNAV_TYPEAHEAD buf="' + _taBuffer + '" NO MATCH items=' + items.length);
        }
        _taTimer = setTimeout(function() { console.log('§LISTNAV_TYPEAHEAD_RESET'); _taBuffer = ''; }, 600);
      },
      onClick: function(index, e) {
        if (e.ctrlKey || e.metaKey) {
          if (selected.has(index)) selected.delete(index); else selected.add(index);
          anchor = index;
        } else if (e.shiftKey && anchor >= 0) {
          var lo = Math.min(anchor, index), hi = Math.max(anchor, index);
          selected = new Set();
          for (var i = lo; i <= hi; i++) selected.add(i);
        } else {
          selected = new Set([index]); anchor = index; cursor = index;
        }
        _emit();
      },
      getSelected: function() { return Array.from(selected); }
    };
  }

  // Expose for dynamic panel registration (clash matrix, etc.)
  window.makeListKeyNav = makeListKeyNav;

  // Wire ListKeyNav to storey + DISC panels after populate
  // §S280: _storeyNav/_discNav removed — storey/disc now in Find outliner
  A._wireListKeyNav = function() {
    // §S280: Old storey/disc HUD panels removed — now in Find outliner (navigate_find.js)

    // Toolbar — horizontal, ←→ traversal, Space/Enter clicks
    var toolbox = document.getElementById('search-box');
    if (toolbox && !A._toolbarNav) {
      A._toolbarNav = makeListKeyNav(
        function() { return Array.from(document.querySelectorAll('#search-body button')); },
        function() { /* no multi-select for toolbar */ },
        function(idx) {
          var btns = Array.from(document.querySelectorAll('#search-body button'));
          if (btns[idx]) btns[idx].click();
        }
      );
      if (typeof _registerPanel === 'function') _registerPanel('toolbar', toolbox, A._toolbarNav);
      console.log('§LISTNAV_WIRE panel=toolbar');
    }

    // Section slider panel — buttons, sliders, AND close toggle
    var secPanel = document.getElementById('section-slider-panel');
    if (secPanel && !A._sectionNav) {
      A._sectionNav = makeListKeyNav(
        function() { return Array.from(secPanel.querySelectorAll('button, input[type="range"], .panel-toggle')); },
        function() {},
        function(idx) {
          var items = Array.from(secPanel.querySelectorAll('button, input[type="range"], .panel-toggle'));
          if (items[idx]) items[idx].click();
        }
      );
      var secClose = function() { if (typeof window.toggleSection === 'function') window.toggleSection(); };
      if (typeof _registerPanel === 'function') _registerPanel('section', secPanel, A._sectionNav, secClose);
      console.log('§LISTNAV_WIRE panel=section');
    }

    // Sunglasses slider panel — register with close
    var sunPanel = document.getElementById('sunglass-slider-panel');
    if (sunPanel && !A._sunglassNav) {
      A._sunglassNav = makeListKeyNav(
        function() { return Array.from(sunPanel.querySelectorAll('button, input[type="range"], .panel-toggle')); },
        function() {},
        function(idx) {
          var items = Array.from(sunPanel.querySelectorAll('button, input[type="range"], .panel-toggle'));
          if (items[idx]) items[idx].click();
        }
      );
      var sunClose = function() { if (typeof window.toggleSunglass === 'function') window.toggleSunglass(); };
      if (typeof _registerPanel === 'function') _registerPanel('sunglass', sunPanel, A._sunglassNav, sunClose);
      console.log('§LISTNAV_WIRE panel=sunglass');
    }
  };

  // Storey isolator
  A.activeStoreyFilter = null;
  A.storeyMeshGroups = {};

  // §NAV_FIND_002: ONE storey-visibility predicate. activeStoreyFilter may be
  // null (all) | string (one) | Array<string> (multi). All appliers route here.
  A._storeyVisible = function(s) {
    var f = A.activeStoreyFilter;
    if (f === null || f === undefined) return true;
    if (Array.isArray(f)) return f.indexOf(s) >= 0;
    return s === f;
  };

  // §S280: HUD removed — storey/disc now in Find outliner
  A.populateStoreys = function() {};

  // §NAV_FIND_002: accepts null | string | Array<string>. Empty array → all.
  A.filterStorey = function(storey) {
    if (Array.isArray(storey)) storey = storey.length ? (storey.length === 1 ? storey[0] : storey.slice()) : null;
    A.activeStoreyFilter = storey;
    // S239: Regular meshes — show/hide by storey
    A.collectMeshes(o => o.isMesh && o.userData.storey !== undefined).forEach(obj => {
      obj.visible = A._storeyVisible(obj.userData.storey);
    });
    // S232/S239: InstancedMesh — per-instance storey filter via zero-scale matrix
    A.collectMeshes(o => o.isInstancedMesh).forEach(mesh => {
      A.filterInstancedMesh(mesh, meta => A._storeyVisible(meta.storey));
    });
    // §S260: BatchedMesh — per-element storey filter via setVisibleAt
    A.collectMeshes(o => o.isBatchedMesh).forEach(mesh => {
      A.filterBatchedMesh(mesh, meta => A._storeyVisible(meta.storey));
    });
    console.log(`[S200] §STOREY_FILTER ${Array.isArray(storey) ? '[' + storey.join(',') + ']' : (storey || 'ALL')}`);
    if (A.markDirty) A.markDirty();
  };

  // Discipline toggle
  A.hiddenDiscs = new Set();

  A.populateDiscs = function() {};

  A.toggleDisc = function(disc) {
    if (A.hiddenDiscs.has(disc)) {
      A.hiddenDiscs.delete(disc);
    } else {
      A.hiddenDiscs.add(disc);
    }
    A._applyDiscVisibility();
  };

  // §S280d: Show only this discipline (null = show all). Counterpart to filterStorey.
  A.filterDisc = function(disc) {
    A.filterDiscs(disc === null ? null : [disc]);
  };

  // §NAV_FIND_002: Show ONLY the disciplines in `list` (empty/null → all). Multi-select.
  A.filterDiscs = function(list) {
    A.hiddenDiscs.clear();
    if (list && list.length) {
      var keep = new Set(list);
      // Build hiddenDiscs from scene — hide everything not in the keep set
      A.collectMeshes(o => o.isMesh && o.userData.disc).forEach(obj => {
        if (!keep.has(obj.userData.disc)) A.hiddenDiscs.add(obj.userData.disc);
      });
    }
    A._applyDiscVisibility();
    console.log('[S200] §DISC_FILTER ' + (list && list.length ? '[' + list.join(',') + ']' : 'ALL'));
  };

  // §S280d: shared traversal for disc + storey combined visibility
  A._applyDiscVisibility = function() {
    A.collectMeshes(o => o.isMesh && o.userData.disc).forEach(obj => {
      const discVisible = !A.hiddenDiscs.has(obj.userData.disc);
      obj.visible = discVisible && A._storeyVisible(obj.userData.storey);
    });
    A.collectMeshes(o => o.isInstancedMesh).forEach(mesh => {
      A.filterInstancedMesh(mesh, meta => {
        return !A.hiddenDiscs.has(meta.disc) && A._storeyVisible(meta.storey);
      });
    });
    A.collectMeshes(o => o.isBatchedMesh).forEach(mesh => {
      A.filterBatchedMesh(mesh, meta => {
        return !A.hiddenDiscs.has(meta.disc) && A._storeyVisible(meta.storey);
      });
    });
    if (A.markDirty) A.markDirty();
  };

  // §RevitParity A1 (W-FILTER-ISOLATE): Isolate an arbitrary element set by GUID.
  // guidSet = Set of guids to KEEP visible; null = restore all. Generic counterpart
  // to filterStorey/filterDisc — works across regular, instanced and batched meshes
  // because every element carries userData.guid / meta.guid. Mutually exclusive with
  // the storey/disc filters: callers clear those (filterStorey(null)/filterDisc(null))
  // before isolating so a single mechanism governs visibility.
  A.filterByGuids = function(guidSet) {
    A.activeGuidFilter = guidSet;
    const keep = g => guidSet === null || (g != null && guidSet.has(g));
    A.collectMeshes(o => o.isMesh && o.userData && o.userData.guid !== undefined).forEach(obj => {
      obj.visible = keep(obj.userData.guid);
    });
    A.collectMeshes(o => o.isInstancedMesh).forEach(mesh => {
      A.filterInstancedMesh(mesh, meta => keep(meta.guid));
    });
    A.collectMeshes(o => o.isBatchedMesh).forEach(mesh => {
      A.filterBatchedMesh(mesh, meta => keep(meta.guid));
    });
    console.log('[RP-A1] §FILTER_GUIDS ' + (guidSet === null ? 'ALL' : ('isolate=' + guidSet.size)));
    if (A.markDirty) A.markDirty();
  };

  // §RevitParity A2 (room reuse of A1): rooms live in spatial_structure (IfcSpace),
  // NOT elements_meta. Both tables are optional — absent in DBs built before the
  // pipeline preserved them, so every accessor degrades to empty.
  A.listRooms = function() {
    if (!A.db) return [];
    try {
      var has = A.db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='spatial_structure'");
      if (!has.length) return [];
    } catch(e) { return []; }
    return A.dbQuery("SELECT guid, name FROM spatial_structure WHERE type='IfcSpace' AND name IS NOT NULL ORDER BY name")
      .map(function(r) { return { guid: r[0], name: r[1] }; });
  };

  // Isolate a room's CONTENTS — reuses filterByGuids with the GUID set from
  // rel_contained_in_space. Returns the contents count (0 = nothing to isolate, no-op).
  A.isolateRoom = function(spaceGuid) {
    if (!A.db || !A.filterByGuids) return 0;
    var rows = A.dbQuery("SELECT element_guid FROM rel_contained_in_space WHERE space_guid = ?", [spaceGuid]);
    var set = new Set(rows.map(function(r) { return r[0]; }));
    if (!set.size) { console.log('[RP-A1] §ROOM_ISOLATE space=' + spaceGuid + ' contents=0 noop'); return 0; }
    if (A.filterStorey) A.filterStorey(null);
    if (A.filterDisc) A.filterDisc(null);
    A.filterByGuids(set);
    console.log('[RP-A1] §ROOM_ISOLATE space=' + spaceGuid + ' contents=' + set.size);
    return set.size;
  };

  // Building list
  A.allBuildingCards = [];

  A.populateBuildingList = function() {
    const list = document.getElementById('building-list');
    // Dedupe: strip grid prefix (S0_0_, T0_, etc.) → group by archetype, keep first instance
    const seen = {};
    for (const [name, bc] of Object.entries(A.buildingCentres)) {
      const arch = name.replace(/^[ST]\d+_\d*_?/, '');
      if (!seen[arch] || bc.count > seen[arch].count) {
        seen[arch] = { name, count: bc.count };
      }
    }
    const sorted = Object.entries(seen)
      .sort((a, b) => b[1].count - a[1].count);
    A.allBuildingCards = [];
    list.innerHTML = '';
    for (const [arch, info] of sorted) {
      const card = document.createElement('div');
      card.className = 'bld-card';
      card.innerHTML = `<span>${arch}</span><span class="cnt">${info.count.toLocaleString()}</span>`;
      card.onclick = () => A.flyTo(info.name);
      list.appendChild(card);
      A.allBuildingCards.push({ name: arch.toLowerCase(), el: card });
    }
  };

  // §S280: Search filter — guard against missing #search (overflow removed)
  var searchInput = document.getElementById('search');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      var q = searchInput.value.trim().toLowerCase();
      for (var ci = 0; ci < (A.allBuildingCards || []).length; ci++) {
        var card = A.allBuildingCards[ci];
        card.el.style.display = (!q || card.name.includes(q)) ? '' : 'none';
      }
    });
  }

  // HUD
  A.updateHUD = function() {
    const barsEl = document.getElementById('disc-bars');
    const total = Object.values(A.discCounts).reduce((a, b) => a + b, 0);
    barsEl.innerHTML = Object.entries(A.discCounts).map(([disc, cnt]) => {
      const pct = (cnt / total * 100).toFixed(1);
      const color = '#' + (A.DISC_COLORS[disc] || A.DEFAULT_COLOR).toString(16).padStart(6, '0');
      return `<span class="disc-bar" style="background:${color};width:${Math.max(pct*1.5, 3)}px" title="${disc}: ${cnt.toLocaleString()} (${pct}%)"></span>`;
    }).join('') + '<br><small style="color:#888">' +
      Object.entries(A.discCounts).slice(0, 6).map(([d, c]) => `${d}:${c.toLocaleString()}`).join(' ') + '</small>';
  };

  // §PILL-AUDIT (WATCHDOG_SCALE_AND_UX_SWEEP.md / SCALE_AND_UX_SWEEP.md §3.6, 2026-07-05): the old
  // _registerOverflowIcons() below registered 7 InputReg `kind:'icon'` entries (xray/section/sunglass/fly/
  // shadow/bg/grid2d) keyed to a pre-§S280 overflow-menu's button ids (xray-btn, section-btn, sunglass-btn,
  // fly-btn, shadow-overflow-btn, bg-overflow-btn, grid-2d-btn). Audited every one against the live DOM:
  // #search-box (their container) is `display:none !important` in viewer.html (permanently retired), #more-btn
  // doesn't exist at all, and only #section-btn survives as an empty hidden stub — the other 6 ids don't exist
  // anywhere in the HTML or any createElement/innerHTML call (grepped clean). viewer/tour.js and
  // viewer/grid_overlay.js already carry their own "may be null (pill removed button)" defensive null-checks
  // for fly-btn/grid-2d-btn — the codebase already knows these are gone. The CANONICAL, live highlight path for
  // these exact same toggles is common/pill_builder.js's own _sync() over the `_actions` array below (ids
  // xray/section/shadow/fly/palette/background/2d, driving #pill-<id> buttons) — this stale registration was a
  // pure pre-consolidation leftover (PR #635's "ONE canonical pill_builder.js" pass missed it), never fixed
  // anything, and only risked shadowing a future InputReg._icons lookup with a dead entry. Deleted (not just
  // 'shadow' — all 7, since none of their DOM targets are live); the canonical _actions-array path is unchanged.
  // §PILL_AUDIT ids_checked=7 collisions=[xray,section,sunglass,fly,shadow,bg,grid2d] removed=[xray,section,sunglass,fly,shadow,bg,grid2d]
  console.log('§PILL_AUDIT ids_checked=7 collisions=[xray,section,sunglass,fly,shadow,bg,grid2d] removed=[xray,section,sunglass,fly,shadow,bg,grid2d] (dead overflow-menu registration removed — canonical path = pill_builder.js _actions/_sync)');

  // ── S265: Icon Pill overflow toggle + §-tags ──
  window.toggleOverflow = function() {
    var box = document.getElementById('search-box');
    var scrim = document.getElementById('overflow-scrim');
    var moreBtn = document.getElementById('more-btn');
    if (!box) return;
    var opening = !box.classList.contains('overflow-open');
    box.classList.toggle('overflow-open', opening);
    if (scrim) scrim.classList.toggle('active', opening);
    if (moreBtn) moreBtn.classList.toggle('active', opening);
    // §PILL-AUDIT: the legacy per-button _s() sync (and its InputReg _registerOverflowIcons() twin) targeted
    // the same retired #search-box overflow menu (see note above) — removed. #search-box is permanently
    // display:none, so this toggle is a harmless no-op today; kept only as the '.' shortcut's defensive
    // fallback when window.toggleMobilePill is somehow absent (scene.js).
    console.log('§UI_OVERFLOW ' + (opening ? 'open' : 'close'));
  };
  // §-tag: pill rendered
  var pill = document.getElementById('icon-pill');
  if (pill) {
    var pillBtns = pill.querySelectorAll('button');
    var visCount = 0;
    pillBtns.forEach(function(b) { if (b.offsetParent !== null) visCount++; });
    console.log('§UI_PILL rendered=true icons=' + visCount + ' total=' + pillBtns.length);
  }
  // Sync pill-measure active state with overflow measure-btn
  var pillMeasure = document.getElementById('pill-measure');
  if (pillMeasure) {
    var origToggleMeasure = window.toggleMeasure;
    if (origToggleMeasure) {
      window.toggleMeasure = function() {
        origToggleMeasure();
        var active = A.measureActive;
        pillMeasure.classList.toggle('active', !!active);
      };
    }
  }

  // ── S266: Doc Pill — swap icon-pill between main mode and doc (red) mode ──
  var _docMode = false;
  window._docMode = false; // §S281: exposed for InputReg isActive callback
  var _mainPillHTML = ''; // stash main pill innerHTML for restore
  window.toggleDocPill = function() {
    var pill = document.getElementById('mobile-pill');
    if (!pill) pill = document.getElementById('icon-pill'); // fallback
    if (!pill) return;
    if (_docMode) {
      // restore main pill via _buildPill + deactivate canvas
      if (window.DocCanvas) DocCanvas.deactivate(A);
      pill.classList.remove('doc-mode');
      if (A._buildPill) A._buildPill(); // rebuild _actions-based pill
      else pill.innerHTML = _mainPillHTML; // fallback
      _docMode = false; window._docMode = false;
      console.log('§DOC_PILL mode=main');
    } else {
      // stash and swap to doc mode
      _mainPillHTML = pill.innerHTML;
      pill.innerHTML = '';
      pill.classList.add('doc-mode');
      pill.style.display = 'block'; // ensure visible
      // 1. Home — return to main pill
      var btnHome = A.icon('home', { size: 24, title: 'Home', onClick: function() { toggleDocPill(); } });
      btnHome.id = 'doc-home-btn';
      pill.appendChild(btnHome);
      // 2. Grid — 2D grid + lengths + bubbles toggle
      var _gridOn = true;  // grid starts ON
      var btnGrid = A.icon('grid', { size: 24, title: 'Grid', onClick: function() {
        if (window.DocCanvas) _gridOn = DocCanvas.toggleGrid();
        else _gridOn = !_gridOn;
        btnGrid.classList.toggle('active', _gridOn);
      }});
      btnGrid.classList.add('active');  // starts ON
      btnGrid.id = 'doc-grid-btn';
      pill.appendChild(btnGrid);
      // §S273: TM removed from doc pill — timeline slider is permanent, TM goes back to main pill
      // 4. Next — advance one construction phase
      var btnNext = A.icon('next', { size: 24, title: 'Next Phase', onClick: function() {
        if (window.DocCanvas) DocCanvas.nextPhase(A);
      }});
      btnNext.id = 'doc-next-btn';
      pill.appendChild(btnNext);
      // 5. Discipline selector — replaces MEP icon. Hub icon opens popup with all
      //    disciplines in the building. Selected disc drives what Next reveals.
      //    Active disc shown in top-right status badge.
      var _discPopup = null;
      var _discIconMap = {
        STR: 'discSTR', ARC: 'discARC', MEP: 'discMEP',
        FP: 'discFP', ELEC: 'discELEC', ACMV: 'discACMV', PLMB: 'discPLMB'
      };
      var _discColorMap = {
        STR: '#e57373', ARC: '#64b5f6', MEP: '#81c784',
        FP: '#ff8a65', ELEC: '#fff176', ACMV: '#4dd0e1', PLMB: '#ba68c8'
      };
      var btnDisc = A.icon('disciplines', { size: 24, title: 'Disciplines', onClick: function() {
        if (_discPopup) { _discPopup.remove(); _discPopup = null; return; }
        // Build popup from BOM disciplines
        var discs = [];
        if (A._bom && A._bom.storeys) {
          var seen = {};
          for (var si = 0; si < A._bom.storeys.length; si++) {
            for (var di = 0; di < A._bom.storeys[si].disciplines.length; di++) {
              var dn = A._bom.storeys[si].disciplines[di].name;
              if (!seen[dn]) { seen[dn] = true; discs.push(dn); }
            }
          }
        }
        if (!discs.length) { APP.status.textContent = 'No disciplines found'; return; }
        _discPopup = document.createElement('div');
        _discPopup.className = 'bim-panel';
        _discPopup.style.cssText = 'position:fixed;top:60px;right:10px;z-index:1100;padding:8px;min-width:140px;';
        var activeDisc = window.DocCanvas ? DocCanvas.getActiveDisc() : 'ARC';
        for (var k = 0; k < discs.length; k++) {
          (function(d) {
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 8px;cursor:pointer;border-radius:6px;' +
              (d === activeDisc ? 'background:rgba(255,255,255,0.15);' : '');
            // Discipline icon
            var ic = A.icon(_discIconMap[d] || 'discMEP', { size: 20 });
            ic.style.color = _discColorMap[d] || '#aaa';
            ic.style.minWidth = '24px';
            row.appendChild(ic);
            // Label
            var lbl = document.createElement('span');
            lbl.textContent = d;
            lbl.style.cssText = 'color:' + (_discColorMap[d] || '#ccc') + ';font:bold 13px monospace;';
            row.appendChild(lbl);
            // Active indicator
            if (d === activeDisc) {
              var dot = document.createElement('span');
              dot.textContent = ' \u25CF';
              dot.style.color = '#4caf50';
              row.appendChild(dot);
            }
            row.onpointerup = function() {
              if (window.DocCanvas) DocCanvas.setActiveDisc(d, A);
              btnDisc.style.color = _discColorMap[d] || '';
              _discPopup.remove(); _discPopup = null;
              console.log('§DOC_DISC selected=' + d);
            };
            _discPopup.appendChild(row);
          })(discs[k]);
        }
        document.body.appendChild(_discPopup);
        // Auto-close on outside tap
        setTimeout(function() {
          document.addEventListener('pointerup', function _closeDisc(ev) {
            if (_discPopup && !_discPopup.contains(ev.target) && ev.target !== btnDisc) {
              _discPopup.remove(); _discPopup = null;
              document.removeEventListener('pointerup', _closeDisc);
            }
          });
        }, 100);
      }});
      btnDisc.id = 'doc-disc-btn';
      btnDisc.style.color = _discColorMap['ARC'];  // default ARC color
      pill.appendChild(btnDisc);
      // 6. Open — list saved designs and restore selected
      var btnOpen = A.icon('folderOpen', { size: 24, title: 'Open Design', onClick: function() {
        if (!window.DocCanvas || !DocCanvas.listDesigns) return;
        DocCanvas.listDesigns(function(err, list) {
          if (err || !list.length) {
            if (window.APP && APP.status) {
              APP.status.textContent = err ? 'Error listing designs' : 'No saved designs found';
            }
            console.log('§DOC_OPEN ' + (err ? 'ERROR: ' + err : 'no_designs'));
            return;
          }
          // Show picker: most recent first
          list.sort(function(a, b) { return b.savedAt - a.savedAt; });
          var names = list.map(function(d, i) {
            var date = new Date(d.savedAt).toLocaleString();
            return (i + 1) + '. ' + d.key + ' (' + date + ', ' + d.ops + ' ops)';
          });
          var choice = prompt('Select design to open:\\n' + names.join('\\n') + '\\n\\nEnter number or name:');
          if (!choice) return;
          var idx = parseInt(choice) - 1;
          var key = (idx >= 0 && idx < list.length) ? list[idx].key : choice;
          DocCanvas.openDesign(A, key);
        });
      }});
      btnOpen.id = 'doc-open-btn';
      pill.appendChild(btnOpen);
      // 7. Save — serialize grid state + kernel_ops to IndexedDB
      var btnSave = A.icon('save', { size: 24, title: 'Save Design', onClick: function() {
        if (!window.DocCanvas || !DocCanvas.saveDesign) return;
        var key = prompt('Design name:', 'Design_' + new Date().toISOString().slice(0, 10));
        if (!key) return;
        DocCanvas.saveDesign(A, key);
      }});
      btnSave.id = 'doc-save-btn';
      pill.appendChild(btnSave);
      // 8. UBBL — compliance check
      var btnUBBL = A.icon('checkList', { size: 24, title: 'UBBL Compliance', onClick: function() {
        console.log('§DOC_UBBL compliance check');
        // TODO S266: wire to ubbl_rules.json checker
      }});
      btnUBBL.id = 'doc-ubbl-btn';
      pill.appendChild(btnUBBL);
      // 9. Rosetta Stone — grid calibration mode
      var _rosettaOn = false;
      var btnRosetta = A.icon('rosetta', { size: 24, title: 'Rosetta Stone', onClick: function() {
        _rosettaOn = !_rosettaOn;
        btnRosetta.classList.toggle('active', _rosettaOn);
        if (window.DocCanvas) DocCanvas.setCalibrationMode(_rosettaOn);
        console.log('§DOC_ROSETTA calibration=' + _rosettaOn);
      }});
      btnRosetta.id = 'doc-rosetta-btn';
      pill.appendChild(btnRosetta);
      _docMode = true; window._docMode = true;
      console.log('§DOC_PILL mode=doc icons=9');
      // S266: extract BOM on Doc pill entry, then activate canvas
      if (window.BOMExtract && A.db) {
        var bld = A.activeBuilding || 'unknown';
        BOMExtract.loadCached(bld, function(cached) {
          if (cached) {
            A._bom = cached;
            console.log('§DOC_BOM cached building=' + bld + ' storeys=' + cached.storeys.length);
          } else {
            A._bom = BOMExtract.extract(A);
            if (A._bom) BOMExtract.applySTDMEP(A._bom);
          }
          // Activate Doc canvas after BOM is ready
          if (A._bom && window.DocCanvas) DocCanvas.activate(A);
          // §S267: Lazy-fetch BOM.db for verb expansion (OOTB fleet only)
          _fetchBomDb(A, bld);
        });
      }
    }
  };

  // §S280: HUD removed — no-op stubs
  window.resetHudAutoCollapse = function() {};

  // S265 Phase 4: storey-panel/disc-panel removed (now inside HUD accordion)
  var panelIds = ['hud','search-box','icon-pill','info-panel',
                  'status-bar-wrap','grid-overlay-panel','dev-banner',
                  'section-slider-panel'];
  var panelsHidden = false;
  // §S280: toggleAllPanels = old +/- behavior, now triggered by double-tap []
  window.toggleAllPanels = function() {
    panelsHidden = !panelsHidden;
    panelIds.forEach(function(pid) {
      if (pid === 'status-bar-wrap' && panelsHidden && A._clashMatrixDiv) return;
      var el = document.getElementById(pid);
      if (el) el.classList.toggle('swipe-hidden', panelsHidden);
    });
    var extras = document.querySelectorAll('.glass-panel, #issues-panel, #find-panel, #nlp-bar, #nlp-chips, #nav-hud');
    extras.forEach(function(el) { el.classList.toggle('swipe-hidden', panelsHidden); });
    if (panelsHidden) {
      if (A._infoCardDiv) { A._infoCardDiv.remove(); A._infoCardDiv = null; }
      if (A._clashListDiv) { A._clashListDiv.remove(); A._clashListDiv = null; }
      if (A.measureLabels) A.measureLabels = A.measureLabels.filter(function(m) { return m.div === A._clashMatrixDiv; });
    }
    console.log('§PANEL_TOGGLE panelsHidden=' + panelsHidden);
  };

  // §S280: [] button — single tap = fullscreen (F11), double tap = close all except latest
  var _focusOnlyHidden = []; // stash panels hidden by double-tap, for restore
  window.focusOnlyLatest = function() {
    if (_focusOnlyHidden.length) {
      // Restore — show everything we hid
      _focusOnlyHidden.forEach(function(el) { el.classList.remove('swipe-hidden'); });
      console.log('§MINMAX_DBL restore count=' + _focusOnlyHidden.length);
      _focusOnlyHidden = [];
      return;
    }
    // Find the latest visible panel. §S281 P1: prefer the CURRENT focused panel
    // (InputReg.focusTop) — the prior bug walked _focusStack, which never holds the
    // currently-focused panel, so latestId came out wrong/null. Fall back to the old
    // stack walk only if the registry isn't loaded.
    var latestId = null;
    var _top = (window.InputReg && window.InputReg.focusTop()) || null;
    if (_top && _top.id) latestId = _top.id;
    if (!latestId && window._panels) {
      // Fallback: focus stack — last entry is the most recent
      var stack = window._focusStack || [];
      for (var si = stack.length - 1; si >= 0; si--) {
        for (var pi = 0; pi < window._panels.length; pi++) {
          if (window._panels[pi].id === stack[si] && window._panels[pi].el.style.display !== 'none') {
            latestId = stack[si]; break;
          }
        }
        if (latestId) break;
      }
    }
    // Hide all panels + HUD except the latest
    _focusOnlyHidden = [];
    panelIds.forEach(function(pid) {
      var el = document.getElementById(pid);
      if (!el) return;
      // §S282b: status bar persists in maxed mode — always visible for feedback
      if (pid === 'status-bar-wrap') return;
      // Don't hide if this is the latest panel's container
      if (latestId && el.querySelector && el.contains(document.getElementById(latestId))) return;
      if (el.style.display === 'none' || el.classList.contains('swipe-hidden')) return;
      el.classList.add('swipe-hidden');
      _focusOnlyHidden.push(el);
    });
    var extras = document.querySelectorAll('.glass-panel, #issues-panel, #find-panel, #nlp-bar, #nlp-chips, #nav-hud');
    extras.forEach(function(el) {
      if (el.style.display === 'none' || el.classList.contains('swipe-hidden')) return;
      // Check if this is the latest panel
      if (latestId && el.id === latestId) return;
      el.classList.add('swipe-hidden');
      _focusOnlyHidden.push(el);
    });
    console.log('§MINMAX_DBL focus-only latest=' + (latestId || 'none') + ' hidden=' + _focusOnlyHidden.length);
  };

  (function() {
    var mmBtn = document.getElementById('minmax-btn');
    if (!mmBtn) return;
    var _tapTimer = 0;
    var _DBL_MS = 300;
    mmBtn.addEventListener('pointerup', function(e) {
      e.stopPropagation();
      if (_tapTimer) {
        // Double tap — cancel pending fullscreen, focus on latest panel only
        clearTimeout(_tapTimer);
        _tapTimer = 0;
        window.focusOnlyLatest();
      } else {
        // First tap — wait for possible second
        _tapTimer = setTimeout(function() {
          _tapTimer = 0;
          // Single tap — fullscreen
          if (typeof A.toggleFullscreen === 'function') A.toggleFullscreen();
          else if (document.fullscreenElement) document.exitFullscreen();
          else document.documentElement.requestFullscreen();
          console.log('§MINMAX single-tap → fullscreen');
        }, _DBL_MS);
      }
    });
  })();

  // §S280: Mobile + Desktop — ESC cascades close, panels stack normally

  // §S281: Scrollable pill — uses PillBuilder for declarative icon+panel wiring
  (function() {
    var pill = document.getElementById('mobile-pill');
    var trigger = document.getElementById('mobile-trigger');
    if (!pill || !trigger) return;
    if (typeof PillBuilder !== 'function') { console.warn('§PILL pill_builder.js not loaded'); return; }
    // §S282: ONE list — icon + shortcut + Help description + Settings toggle.
    // Icons reference ICONS registry (no inline SVG duplication).
    // pill:false entries appear in Help/Settings but not in the pill strip.
    var I = ICONS; // shorthand
    var _actions = [
      // Document verbs — Save the open building / Open a saved one. Native OS dialogs, no card.
      { id: 'save',       name: 'Save Building',  key: 'Ctrl+S', icon: I.save.svg,
        fn: function() { if (A.saveModelDb) A.saveModelDb(); },
        children: [ { name: 'Save the open building to a .db file' }, { name: 'Native Save As… dialog — pick name + folder' }, { name: 'Re-openable with Open (Ctrl+O)' } ] },
      { id: 'open',       name: 'Open Building',  key: 'Ctrl+O', icon: I.folderOpen.svg,
        fn: function() { if (A.openModelDb) A.openModelDb(); },
        children: [ { name: 'Open a saved .db file' }, { name: 'Native Open… dialog' }, { name: 'Replaces the current scene' } ] },
      // PILL_DRAWER_REORGANIZATION.md §2 Navigate — absorbed into the Sailboat drawer below.
      // pill:false + keepOpen removed from rail; fn/isActive/hold/key wiring UNCHANGED (single
      // source of truth — the Navigate drawer rows call these SAME entries by id).
      { id: 'find',       name: 'Find / Navigate', key: 'f', pill: false, icon: I.search.svg, fn: function() { if (A.openFindPanel) A.openFindPanel(''); },
        children: [ { name: 'Search by name/class' }, { name: 'Filter by storey/type' }, { name: 'Voice search (mic)' }, { name: 'Navigate to element' } ] },
      { id: 'help',       name: 'Help',            key: 'F1', icon: I.circleHelp.svg, fn: function() { if (typeof showCommandPalette === 'function') showCommandPalette(); } },
      // HISTORY_KNOB_DIAL.md rework: ONE "W" World-history pill replaces the old History pill.
      //   TAP        = open the cross-page overlay (which building/doc/page).
      //   LONG-PRESS = a small drawer: Z (this page's dot-timeline bar) + bomb (clear history, warns first).
      // PILL_DRAWER_REORGANIZATION.md §2: absorbed into Navigate — own tap/long-press UNCHANGED per spec.
      { id: 'worldhist',  name: 'World History',   key: 'w', pill: false, icon: I.worldHist.svg,
        fn: function() { if (window.WholeHistory && WholeHistory.toggleOpen) WholeHistory.toggleOpen(); },
        hold: function(btn) { _worldHistDrawer(btn); },
        isActive: function() { var p = document.getElementById('whole-hist-panel'); return !!(p && p.classList.contains('show')); },
        children: [ { name: 'History across ALL pages — viewer, iDempiere, Gravity' }, { name: 'Whole | This page toggle' }, { name: 'Day strip — step back/forward by day' }, { name: 'Tap a card to jump to that building/doc' }, { name: 'Long-press → Z page-timeline + clear (bomb)' } ] },
      // PILL_DRAWER_REORGANIZATION.md §2: absorbed into Navigate on mobile — still NEVER on desktop
      // (the Navigate drawer row-builder re-applies the same platform gate).
      { id: 'walk',       name: 'Walk',            platform: 'mobile', pill: false, icon: '<ellipse cx="15" cy="5" rx="3" ry="4"/><ellipse cx="15" cy="11" rx="2" ry="1.5"/><ellipse cx="9" cy="13" rx="3" ry="4"/><ellipse cx="9" cy="19" rx="2" ry="1.5"/>', fn: function() { if (typeof toggleWalkMode === 'function') toggleWalkMode(); }, isActive: function() { return !!A._walkMode; } },
      // SPATIAL_PICKING_SPEC §S-3 — DATA-GATED (the pos-pill showWhen precedent): starts pill:false;
      // wh_walk.js flips it on + rebuilds ONLY when the loaded model carries locator-GUID bins (§S-1).
      { id: 'whwalk',     name: 'Pick Walk',       pill: false, icon: I.route.svg,
        fn: function() { if (window.WHWalk) WHWalk.toggle(); },
        isActive: function() { return !!(window.WHWalk && WHWalk.isOpen && WHWalk.isOpen()); },
        children: [ { name: 'Route over locators (walk order)' }, { name: 'Fly-to next bin, FIND-lens depth' }, { name: 'Scan bin QR / type code' }, { name: 'Signed pick group per bin' } ] },
      { id: 'share',      name: 'Share',           key: '/', icon: I.share.svg, fn: function() { if (A.quickShare) A.quickShare(); } },
      // HR_BIM_Asset — ONE "Human-Asset" family pill (RESUME_HR_BIM_ASSET.md §FM-FAMILY + §P10a, user 2026-07-01
      // / renamed 2026-07-02). De-clutter: the HBA lenses+panes (Tenancy folded into Occupancy = de-conflate)
      // live under one pill that opens a wake-aware drawer. DATA-GATED like whwalk: pill:false until
      // viewer/hba_lens.js detects ≥1 lens with data in the loaded building. The drawer logic + per-lens greying
      // live in hba_lens.js (the additive HBA module) — panels.js carries ONLY this one entry, keeping the
      // shared bar (and the Teams-adjacent file) minimal. Inert if hr_bim_asset/* did not load. id stays `hbaFM`
      // (internal, unrenamed — 29+ witness files reference it); only the user-visible label changed.
      { id: 'hbaFM',      name: 'Human-Asset',     pill: false, icon: I.fmCockpit.svg,
        fn: function() { if (window.HBALens && HBALens.openFamilyDrawer) HBALens.openFamilyDrawer(A); },
        isActive: function() { return !!(window.HBALens && HBALens.familyActive && HBALens.familyActive()); },
        children: [ { name: 'Operate-phase (7D) cockpit — one model, lenses each answering ONE question' }, { name: 'Occupancy (incl. lease status) · Presence · Unit class · Assets/IoT · Dashboard' }, { name: 'Wake-aware: only lenses with data in THIS building are enabled (others greyed)' }, { name: 'All off one signed op-log; toggle a lens off restores the model' } ] },
      // PILL_DRAWER_REORGANIZATION.md §4 Inspect — absorbed into the HardHat drawer below.
      // Long-press→Clash chip UNCHANGED (clash entry itself untouched, still pill:false/chip-only).
      { id: 'measure',    name: 'Measure',         key: 'm', pill: false, icon: I.ruler.svg,
        fn: function() { if (typeof A.toggleMeasure === 'function') A.toggleMeasure(); },
        hold: function(btn) { _revealChip(btn, 'clash', I.triangle.svg, function(){ if (window._shortcuts && window._shortcuts['c']) window._shortcuts['c'](); }); },
        isActive: function() { return !!A.measureActive; } },
      { id: 'clash',      name: 'Clash Matrix',    key: 'c', pill: false, icon: I.triangle.svg,
        fn: function() { if (window._shortcuts && window._shortcuts['c']) window._shortcuts['c'](); },
        children: [ { name: 'Discipline pair grid' }, { name: 'Tolerance 1–100mm' }, { name: 'Status: Review/Resolve/Accept' }, { name: 'HTML Report + CSV export' } ] },
      // PILL_DRAWER_REORGANIZATION.md §4: icon Eye→Bone (Eye freed, Bone = X-ray metaphor).
      // REVISED (user, 2026-07-06): Alt+X retired — this row is now a 3-state cycle
      // Off→X-Ray→Bbox→Off (A.cycleXrayBboxMode, tools.js), no more hold-to-reveal chip.
      { id: 'xray',       name: 'X-Ray / Bbox',    key: 'Alt+Z', pill: false, icon: I.bone.svg,
        fn: function() { if (typeof A.cycleXrayBboxMode === 'function') A.cycleXrayBboxMode(); },
        isActive: function() { return !!A.xrayOn || (typeof window.ghostXrayOn === 'function' && window.ghostXrayOn()); },
        stateLabel: function() { return A.xrayOn ? 'X-Ray' : ((typeof window.ghostXrayOn === 'function' && window.ghostXrayOn()) ? 'Bbox' : 'Off'); } },
      // Bounding-box envelope ghost — absorbed into the 'xray' cycle above, key removed (was
      // Alt+X). Entry kept (pill:false) only so Settings' pill editor still has a stable id.
      { id: 'bbox',       name: 'Bounding Boxes',  key: null, pill: false, icon: I.box.svg, fn: function() { if (typeof window.toggleGhostXray === 'function') window.toggleGhostXray(); }, isActive: function() { return typeof window.ghostXrayOn === 'function' && window.ghostXrayOn(); } },
      { id: 'tm',         name: 'Time Machine',    key: 't', pill: false, icon: I.clock.svg, fn: function() { if (typeof toggleTimeMachine === 'function') toggleTimeMachine(); }, isActive: function() { return !!A._tmOn; },
        children: [ { name: 'Gantt timeline' }, { name: 'Author 4D schedule (✎)' }, { name: 'What-if (slip a phase)' }, { name: 'Play / Pause sequence' }, { name: 'Phase slider' }, { name: 'Share ?tm=play link' } ] },
      { id: 'section',    name: 'Section Cut',     key: 'x', pill: false, icon: I.scissors.svg, fn: function() { if (A.toggleSection) A.toggleSection(); }, isActive: function() { return !!A.sectionOn; },
        children: [ { name: 'Y axis (vertical)' }, { name: 'X axis (lateral)' }, { name: 'Z axis (depth)' }, { name: 'Slider 0–100%' }, { name: 'Bookmarks' } ] },
      // PILL_DRAWER_REORGANIZATION.md §1 Visual FX — absorbed into the Palette (sunglass) panel.
      // Screenshot hold-chip DELETED (§DELETIONS — screenshot itself removed below).
      { id: 'background', name: 'Background',      key: 'b', pill: false, icon: I.contrast.svg,
        fn: function() { if (typeof window.toggleBackground === 'function') window.toggleBackground(); },
        isActive: function() { return !!A._whiteBg; } },
      { id: 'night',      name: 'Night',           key: 'n', pill: false, icon: I.moon.svg, fn: function() { if (typeof toggleNightMode === 'function') toggleNightMode(); }, isActive: function() { return !!A._nightMode; } },
      { id: 'palette',    name: 'Palette',         key: 'p', icon: I.palette.svg, fn: function() { if (typeof toggleSunglass === 'function') toggleSunglass(); }, isActive: function() { return !!A.sunglassOn; },
        children: [ { name: 'Ambience 0–100' }, { name: 'Sun 0–5' }, { name: 'Exposure 0.1–3' }, { name: 'Ambient 0–2' }, { name: 'Hemisphere 0–2' }, { name: 'Night' }, { name: 'Shadow + Ground (cycle)' }, { name: 'Reverse background' }, { name: 'Sound FX' } ] },
      // §SHADOW-GROUND MERGE: one 4-state cycle (Off→Grass→Earth→Paved→Off) — A.toggleShadow's
      // BODY changed in tools.js to do the cycling; this entry (id/key/fn UNCHANGED) still drives
      // the 'h' shortcut + Help listing. Row rendered specially (real texture-swatch) — see
      // _buildShadowGroundRow() below, not the generic drawer-row.
      { id: 'shadow',     name: 'Shadow + Ground', key: 'h', pill: false, icon: I.cloud.svg, fn: function() { if (typeof toggleShadow === 'function') toggleShadow(); }, isActive: function() { return !!A._shadowOn; } },
      { id: 'fly',        name: 'Fly Tour',        key: 'l', pill: false, icon: I.plane.svg, fn: function() { if (typeof toggleFlyAround === 'function') toggleFlyAround(); }, isActive: function() { return !!A.flyActive; } },
      { id: 'report',     name: '4D / 5D',         key: '4', pill: false, icon: I.barChart.svg, fn: function() { if (A.export4D5D) A.export4D5D(); } },
      { id: 'issues',     name: 'Issues',          key: 'i', pill: false, icon: I.clipboard.svg,
        fn: function() { if (typeof toggleIssues === 'function') toggleIssues(); },
        children: [ { name: 'Snag photo + annotation' }, { name: 'Fly to clash deep-link' }, { name: 'Export Excel' } ] },
      { id: 'fullscreen', name: 'Fullscreen',      key: 'F11', pill: false, icon: I.maximize.svg,
        fn: function() { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } },
      // PILL_DRAWER_REORGANIZATION.md §2 Camera/View — absorbed into the Camera drawer below.
      // §MASTER-ICON BEHAVIOR fix: Feather no longer dual-fires (old `hold` reveal-chip to
      // Reset/Pivot REMOVED — those are now their own rows inside the Camera/View drawer).
      { id: 'precision',  name: 'Precision (Fine)', key: 'Caps Lock', pill: false, icon: '<path d="M12.67 19a2 2 0 0 0 1.416-.588l6.154-6.172a6 6 0 0 0-8.49-8.49L5.586 9.914A2 2 0 0 0 5 11.328V18a1 1 0 0 0 1 1z"/><path d="M16 8 2 22"/><path d="M17.5 15H9"/>',
        fn: function() { if (typeof window.togglePrecisionFine === 'function') window.togglePrecisionFine(); },
        isActive: function() { return !!window._precisionFine; } },
      { id: 'cam-reset',  name: 'Reset Camera',    key: 'a', pill: false,
        icon: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9"/><line x1="12" y1="1" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="23"/><line x1="1" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="23" y2="12"/>',
        fn: function() { if (typeof window.resetCamOrbit === 'function') window.resetCamOrbit(); } },
      { id: 'cam-pivot',  name: 'Auto-Pivot',      key: 'q', pill: false,
        icon: '<path d="M20.341 6.484A10 10 0 0 1 10.266 21.85"/><path d="M3.659 17.516A10 10 0 0 1 13.74 2.152"/><circle cx="12" cy="12" r="3"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/>',
        fn: function() { if (typeof window.toggleCamPivot === 'function') window.toggleCamPivot(); },
        isActive: function() { return !!window._autoPivot; } },
      { id: 'home',       name: 'Home',            pill: false, icon: I.home.svg, fn: function() {
          // §S283: Standalone PWA — open live hub only when online; fall back to cached index offline
          if ((window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) && navigator.onLine) {
            window.open('https://red1oon.github.io/bim-ootb/', '_blank');
            console.log('§PWA_HOME opened');
          } else {
            location.href = '../index.html';
          }
        } },
      { id: 'audio',      name: 'Sound FX',        key: 'v', pill: false, icon: '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>',
        fn: function() { if (typeof window.toggleSfx === 'function') window.toggleSfx(); },
        isActive: function() { return !!(window.__sfx && window.__sfx.isOn()); },
        children: [ { name: 'Time Machine: earcon per construction phase' }, { name: 'Fly Tour: positional waypoint cues' }, { name: 'UI: soft tap tick' }, { name: 'Synthesized — no audio files, default OFF' } ] },
      { id: 'settings',   name: 'Settings',        key: '=', icon: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
        fn: function() { _openSettingsPanel(); },
        isActive: function() { var p = document.getElementById('settings-panel'); return p && p.style.display !== 'none'; } },
      // PILL_DRAWER_REORGANIZATION.md — the 4 real drawer masters. §MASTER-ICON BEHAVIOR: fn
      // ONLY opens/closes the panel below, NEVER fires a sub-action itself. No keyboard shortcut
      // (tap/click-only per spec). Toggle/isOpen closures come from _buildMasterDrawer() further
      // down (defined after _actions closes, so it can look up each absorbed sub-action's real
      // fn/isActive/hold by id) — safe because these are closures, only invoked on click, long
      // after _navigateDrawer/_inspectDrawer/_camviewDrawer are assigned.
      { id: 'navigate',   name: 'Navigate',        icon: I.sailboat.svg,
        fn: function() { _navigateDrawer.toggle(); }, isActive: function() { return _navigateDrawer.isOpen(); } },
      { id: 'inspect',    name: 'Inspect',         icon: I.draftingCompass.svg,
        fn: function() { _inspectDrawer.toggle(); }, isActive: function() { return _inspectDrawer.isOpen(); } },
      { id: 'camview',    name: 'Camera / View',   icon: I.camera.svg,
        fn: function() { _camviewDrawer.toggle(); }, isActive: function() { return _camviewDrawer.isOpen(); } }
    ];

    // ═══════════════════════════════════════════════════════════════════
    // PILL_DRAWER_REORGANIZATION.md §STEPS 3/5 — the drawer mechanism.
    // One reusable master-drawer builder: tap master → open/close panel ONLY, per
    // §MASTER-ICON BEHAVIOR (never fires a sub-action). Each row inside reuses the SAME
    // fn/isActive/hold a sub-action already carries in _actions — single source of truth,
    // no duplicated logic. Defined AFTER _actions closes so _actionById can find every id;
    // safe to reference from the master entries above because those are closures, only
    // invoked on click (well after this whole block has run).
    // ═══════════════════════════════════════════════════════════════════
    function _actionById(id) {
      for (var i = 0; i < _actions.length; i++) { if (_actions[i].id === id) return _actions[i]; }
      return null;
    }

    // One row = icon + label, reusing act.fn/isActive/hold verbatim. hold (Measure→Clash,
    // X-Ray→Bbox, World History→Z-drawer) replays the SAME long-press-then-tap mechanics as
    // the top-level rail (pill_builder.js _build()) so nested chip-reveals are UNCHANGED.
    function _buildDrawerActionRow(act) {
      var row = document.createElement('button');
      row.id = 'drawer-row-' + act.id;
      row.className = 'bim-drawer-row';
      row.title = act.name || act.id;
      var iconWrap = document.createElement('span');
      iconWrap.className = 'bim-drawer-row-icon';
      iconWrap.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (act.icon || '') + '</svg>';
      row.appendChild(iconWrap);
      var label = document.createElement('span');
      label.className = 'bim-drawer-row-label';
      label.textContent = act.name + (act.key ? '  ·  ' + act.key : '');
      row.appendChild(label);

      function _sync() {
        if (act.stateLabel) { try { label.textContent = act.name + '  ·  ' + act.stateLabel(); } catch (e) {} }
        if (!act.isActive) return;
        var on = false; try { on = !!act.isActive(); } catch (e) {}
        row.classList.toggle('active', on);
      }
      row._sync = _sync;

      if (act.hold) {
        var _holdTimer = 0, _held = false;
        row.addEventListener('pointerdown', function(e) {
          e.stopPropagation(); _held = false;
          _holdTimer = setTimeout(function() { _held = true; act.hold(row); }, 450);
        });
        var _cancelHold = function() { if (_holdTimer) { clearTimeout(_holdTimer); _holdTimer = 0; } };
        row.addEventListener('pointerup', function(e) {
          e.stopPropagation(); _cancelHold();
          if (_held) { _held = false; return; }
          act.fn(); _sync();
          setTimeout(_sync, 350);  // re-sync for actions that activate asynchronously (e.g. Time Machine op-log load)
          console.log('§DRAWER_ROW action=' + act.id);
        });
        row.addEventListener('pointerleave', _cancelHold);
        row.addEventListener('pointercancel', _cancelHold);
      } else {
        row.addEventListener('pointerup', function(e) {
          e.stopPropagation();
          act.fn(); _sync();
          setTimeout(_sync, 350);  // re-sync for actions that activate asynchronously (e.g. Time Machine op-log load)
          console.log('§DRAWER_ROW action=' + act.id);
        });
      }
      return row;
    }

    // §SHADOW-GROUND MERGE: the one 4-state cycle row — real texture-swatch thumbnail (not an
    // abstract icon/text label), per spec. Reads the SAME 'shadow' action (id/key/fn unchanged;
    // A.toggleShadow's BODY now cycles Off→Grass→Earth→Paved→Off, see tools.js).
    function _sgSwatchSrc(key) {
      if (!key || key === 'off') return null;
      var cfg = (A._groundConfig || A._groundCfgDefault || { options: [] });
      var opt = (cfg.options || []).filter(function(o) { return o.key === key; })[0];
      return opt && opt.src;
    }
    function _buildShadowGroundRow() {
      var act = _actionById('shadow');
      var row = document.createElement('button');
      row.id = 'drawer-row-shadow';
      row.className = 'bim-drawer-row';
      row.title = 'Shadow + Ground — cycle Off → Grass → Earth → Paved';
      var swatch = document.createElement('span');
      swatch.id = 'shadow-ground-swatch';
      swatch.className = 'bim-drawer-swatch';
      row.appendChild(swatch);
      var label = document.createElement('span');
      label.className = 'bim-drawer-row-label';
      label.id = 'shadow-ground-label';
      row.appendChild(label);

      var _LABELS = { off: 'Shadow + Ground: Off', grass: 'Shadow + Ground: Grass', earth: 'Shadow + Ground: Earth', paved: 'Shadow + Ground: Paved' };
      function _paint() {
        var key = A._shadowGroundKey || 'off';
        label.textContent = (_LABELS[key] || 'Shadow + Ground') + '  ·  h';
        if (key === 'off') {
          swatch.style.backgroundImage = 'none';
          swatch.style.backgroundColor = '#333';
        } else {
          var src = _sgSwatchSrc(key);
          if (src) { swatch.style.backgroundImage = 'url(' + src + ')'; swatch.style.backgroundColor = ''; }
          else { swatch.style.backgroundImage = 'none'; swatch.style.backgroundColor = '#4a7c3a'; }
        }
        row.classList.toggle('active', key !== 'off');
        console.log('§SHADOW_GROUND_SWATCH key=' + key);
      }
      row._sync = _paint;
      // Re-paint whenever the ground texture actually changes (A._applyGroundTexture already
      // calls this hook — reused verbatim, no tools.js change needed beyond the cycle itself).
      A._refreshGroundBtns = _paint;

      row.addEventListener('pointerup', function(e) {
        e.stopPropagation();
        if (act && act.fn) act.fn(); else if (typeof window.toggleShadow === 'function') window.toggleShadow();
        _paint();
        console.log('§DRAWER_ROW action=shadow-ground');
      });

      _paint();  // initial Off state
      return row;
    }

    // One master drawer: builds its panel lazily (first open), lists each absorbed sub-action
    // as its own row. §INTERACTION MODEL: stays open until the explicit ✕ (A.createPanel's
    // built-in bim-panel-close), never outside-tap/auto-collapse.
    function _buildMasterDrawer(masterId, title, subIds) {
      var panelId = masterId + '-drawer-panel';
      var panel = null, rows = [];
      function _ensure() {
        if (panel) return panel;
        var wrap = document.createElement('div');
        subIds.forEach(function(id) {
          var act = _actionById(id);
          if (!act) { console.warn('§DRAWER_MISSING id=' + id + ' master=' + masterId); return; }
          // Walk: platform-gated mobile-only, per spec "never appears on desktop" — omit the
          // row entirely on desktop (not just greyed) inside this drawer.
          var _onMobile = !!window._isMobile;
          if (act.platform === 'mobile' && !_onMobile) return;
          if (act.platform === 'desktop' && _onMobile) return;
          var row = _buildDrawerActionRow(act);
          rows.push(row);
          wrap.appendChild(row);
        });
        // §PANEL-SPREAD: left side of screen, staggered per drawer — was hardcoded top:90/
        // right:70 for ALL 3 drawers (+ Palette/Settings/JSON-editor also clustered there),
        // stacking directly on top of each other and covering the pill rail. Fixed 2026-07-06.
        // Own dedicated column (left:928), stacked vertically — kept OUT of Settings'/JSON-
        // editor's columns since those run much taller (700px+) and would otherwise overlap
        // anything sharing their column further down the same column.
        var _pos = { navigate: { top: '70px', left: '928px' }, inspect: { top: '250px', left: '928px' },
                     camview: { top: '520px', left: '928px' } }[masterId] || { top: '70px', left: '928px' };
        panel = A.createPanel(panelId, {
          closable: true,
          style: { position: 'fixed', top: _pos.top, left: _pos.left, zIndex: '1100', width: '230px', padding: '10px 8px' },
          content: '<h3 style="margin:0 0 8px 6px;color:#4fc3f7;font-size:13px">' + title + '</h3>',
          onClose: function() { console.log('§DRAWER_CLOSE id=' + masterId); }
        });
        panel.appendChild(wrap);
        if (window.InputReg) InputReg.register({ id: masterId + '-drawer', el: panel, kind: 'panel', release: function() { panel.style.display = 'none'; } });
        console.log('§DRAWER_BUILD id=' + masterId + ' rows=' + rows.length);
        return panel;
      }
      return {
        toggle: function() {
          var p = _ensure();
          var opening = p.style.display === 'none';
          p.style.display = opening ? '' : 'none';
          if (opening) rows.forEach(function(r) { if (r._sync) r._sync(); });
          console.log('§DRAWER toggle=' + masterId + ' open=' + opening);
        },
        isOpen: function() { return !!(panel && panel.style.display !== 'none'); }
      };
    }

    var _navigateDrawer = _buildMasterDrawer('navigate', 'Navigate', ['find', 'worldhist', 'home', 'walk']);
    var _inspectDrawer  = _buildMasterDrawer('inspect',  'Inspect',  ['measure', 'clash', 'xray', 'section', 'tm', 'report', 'fly']);
    var _camviewDrawer  = _buildMasterDrawer('camview',  'Camera / View', ['precision', 'cam-reset', 'cam-pivot']);

    // §1 Visual FX — extend the EXISTING Palette/sunglass panel (built earlier at
    // A._buildSunglassPanel(), before _actions existed — this runs AFTER, so it can reuse the
    // absorbed actions' real fn/isActive by id). Appends Night, the merged Shadow+Ground
    // swatch, Reverse-background, Audio as rows — same ✕-close panel, nothing new to open.
    function _extendVisualFxPanel() {
      var panel = document.getElementById('sunglass-slider-panel');
      if (!panel) { console.warn('§VISUALFX_EXTEND panel missing'); return; }
      var sep = document.createElement('hr');
      sep.style.cssText = 'border:none;border-top:1px solid rgba(255,255,255,0.1);margin:6px 0';
      panel.appendChild(sep);

      var nightAct = _actionById('night');
      if (nightAct) panel.appendChild(_buildDrawerActionRow(nightAct));

      panel.appendChild(_buildShadowGroundRow());

      var bgAct = _actionById('background');
      if (bgAct) panel.appendChild(_buildDrawerActionRow(bgAct));

      var audioAct = _actionById('audio');
      if (audioAct) panel.appendChild(_buildDrawerActionRow(audioAct));

      console.log('§VISUALFX_EXTEND rows=4');
    }
    _extendVisualFxPanel();

    // §S282: Settings property sheet — accordion sections → rows → fields
    function _openSettingsPanel() {
      var p = document.getElementById('settings-panel');
      if (p) { p.style.display = p.style.display === 'none' ? '' : 'none'; return; }

      // Build property sheet content
      var content = document.createElement('div');
      content.style.cssText = 'font-size:13px;color:#ccc;';

      // ── Section: Pill Icons — rendered by the shared SettingsEditor ──
      var pillBox = document.createElement('div');
      content.appendChild(pillBox);
      _renderPillEditor(pillBox);

      // ── JSON registry hub: open ANY registered project JSON in the same editor ──
      _buildJsonHub(content);

      // ── §5D Rate Pack (BIM→Project TASK A, docs/BIMtoProject.md §A): pick the active cost pack ──
      content.appendChild(_buildSection('5D Rate Pack', false, _rate5dBody));

      // ── §9 Cache Info: per-store size + clear (history-clear keeps the signed kernel) ──
      content.appendChild(_buildSection('Cache Info', false, _cacheInfoBody));

      // ── Reset button (Pill Icons defaults) ──
      var resetBtn = document.createElement('button');
      resetBtn.textContent = 'Reset Pill Icons';
      resetBtn.style.cssText = 'margin:12px 0 0;padding:8px 16px;border:1px solid rgba(108,159,255,0.2);border-radius:8px;background:transparent;color:#6c9fff;font-size:12px;cursor:pointer;width:100%;';
      resetBtn.addEventListener('pointerup', function(e) {
        e.stopPropagation();
        if (!_mainPill) return;
        _mainPill.resetConfig();
        _renderPillEditor(pillBox);   // rebuild schema from fresh config
        if (A.status) A.status.textContent = 'Defaults restored';
      });
      content.appendChild(resetBtn);

      // §PANEL-SPREAD: top row (tall content needs headroom) — was top:60/right:60, same
      // cluster as Palette/drawers/JSON editor, all stacking on the pill rail.
      p = A.createPanel('settings-panel', { closable: true, style: { position:'fixed', top:'70px', left:'320px', zIndex:'1100', width:'300px', padding:'0' },
        content: content,
        onClose: function() { _syncPillHighlights(); } });
      document.body.appendChild(p);
      p.style.display = '';   // createPanel returns hidden — reveal on first open (matches _openJsonEditor)
      if (window.InputReg) InputReg.register({ id: 'settings', el: p, kind: 'panel', release: function() { p.style.display = 'none'; } });
      // §S282b: PanelNav for Settings — arrows traverse pill rows, Enter toggles visibility
      if (typeof window.PanelNav === 'function') {
        PanelNav({
          id: 'settings',
          panel: p,
          zones: [
            { id: 'pillRows',
              items: function() { return p.querySelectorAll('[data-row-id]'); },
              onSelect: function(el) {
                var tog = el.querySelector('button');
                if (tog) tog.click();
              }
            }
          ],
          onClose: function() { p.style.display = 'none'; _syncPillHighlights(); }
        });
      }
      console.log('§SETTINGS_PANEL created');
    }
    // §S281 fix: expose so the '=' shortcut calls the action directly (pill buttons
    // wire pointerup, not click — a synthetic btn.click() never fired this). Idiomatic
    // window export like _revealChip / toggleDocPill.
    window._openSettingsPanel = _openSettingsPanel;

    // §9 Cache Info — three deliberately-separate storage tiers (HISTORY_SCRUB_FIX §9):
    //   kernel log (signed, tiny, KEPT) · history view cache (derived, safe to clear, rebuildable)
    //   · imported building DBs (IndexedDB) · offline app cache (SW). Each row shows a size + Clear.
    //   ☠ Clearing the history view cache MUST NOT touch kernel_ops — we verifyChain after to prove it.
    function _fmtBytes(b) {
      if (b == null || isNaN(b)) return '—';
      if (b < 1024) return b + ' B';
      if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
      return (b / 1048576).toFixed(1) + ' MB';
    }
    function _lsBytes() {
      var n = 0, b = 0;
      try { for (var k in localStorage) { if (!Object.prototype.hasOwnProperty.call(localStorage, k)) continue; n++; b += k.length + (localStorage.getItem(k) || '').length; } } catch (e) {}
      return { n: n, b: b };
    }
    function _idbInfo() {
      if (!window.indexedDB || !indexedDB.databases) return Promise.resolve('n/a');
      return indexedDB.databases().then(function (dbs) { return (dbs ? dbs.length : 0) + ' DB(s)'; }).catch(function () { return '—'; });
    }
    function _estimate() {
      if (!navigator.storage || !navigator.storage.estimate) return Promise.resolve(null);
      return navigator.storage.estimate().then(function (e) { return e.usage || 0; }).catch(function () { return null; });
    }
    function _swCacheInfo() {
      if (!window.caches) return Promise.resolve('n/a');
      return caches.keys().then(function (keys) { return keys.length + ' cache(s)'; }).catch(function () { return '—'; });
    }
    function _clearSwCaches() {
      if (!window.caches) return Promise.resolve();
      return caches.keys().then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k); })); })
        .then(function () { console.log('§CACHE_CLEAR sw caches purged'); });
    }
    function _clearImportedDbs() {
      if (!window.indexedDB || !indexedDB.databases) return Promise.resolve();
      return indexedDB.databases().then(function (dbs) {
        return Promise.all((dbs || []).map(function (d) { return new Promise(function (res) { try { var r = indexedDB.deleteDatabase(d.name); r.onsuccess = r.onerror = r.onblocked = function () { res(); }; } catch (e) { res(); } }); }));
      }).then(function () { console.log('§CACHE_CLEAR imported IndexedDB purged'); });
    }
    // Proof: clearing the history view cache leaves the signed kernel chain intact.
    function _verifyKernelAfterHistClear() {
      if (!A.db || !window.KernelOps || !KernelOps.verifyChain) return;
      KernelOps.verifyChain(A.db).then(function (res) {
        console.log('§CACHE_CLEAR_CHAIN_OK history-cleared kernel ok=' + (res && res.ok) + ' len=' + (res ? res.len : '?'));
      }).catch(function (e) { console.warn('§CACHE_CLEAR_CHAIN_ERR ' + (e && e.message)); });
    }
    function _cacheInfoBody() {
      var box = document.createElement('div');
      box.style.cssText = 'padding:6px 14px 14px;font-size:12px;color:#bbb;';
      var note = document.createElement('div');
      note.style.cssText = 'color:#888;font-size:11px;margin-bottom:8px;line-height:1.4;';
      note.textContent = 'Browser storage used by BIM OOTB. Clearing the history view cache or SW/imported caches is safe — the signed kernel log is kept.';
      box.appendChild(note);
      var rows = [];
      function addRow(label, sizeFn, clearFn, danger) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);';
        var l = document.createElement('span'); l.textContent = label; l.style.cssText = 'flex:1;color:#cfe;';
        var sz = document.createElement('span'); sz.textContent = '…'; sz.style.cssText = 'color:#8ab4ff;min-width:64px;text-align:right;';
        row.appendChild(l); row.appendChild(sz);
        if (clearFn) {
          var btn = document.createElement('button');
          btn.textContent = 'Clear';
          btn.style.cssText = 'padding:3px 10px;border:1px solid rgba(255,138,101,' + (danger ? '0.5' : '0.25') + ');border-radius:6px;background:transparent;color:' + (danger ? '#ff8a65' : '#6c9fff') + ';font-size:11px;cursor:pointer;';
          btn.addEventListener('pointerup', function (e) { e.stopPropagation(); Promise.resolve(clearFn()).then(refresh); });
          row.appendChild(btn);
        }
        box.appendChild(row);
        rows.push({ set: function (v) { sz.textContent = v; }, fn: sizeFn });
        return row;
      }
      addRow('Kernel log (signed)', function () { try { var r = A.db && A.db.exec('SELECT COUNT(*) FROM kernel_ops'); return (r && r.length ? r[0].values[0][0] : 0) + ' ops'; } catch (e) { return '—'; } }, null);
      addRow('History view cache', function () { return (window.UniversalHistory ? UniversalHistory.list().length : 0) + ' steps'; },
        function () { if (window.UniversalHistory) UniversalHistory.clear(); _verifyKernelAfterHistClear(); });
      addRow('Settings (localStorage)', function () { var x = _lsBytes(); return x.n + ' keys · ' + _fmtBytes(x.b); }, null);
      addRow('Imported buildings (IndexedDB)', _idbInfo, _clearImportedDbs, true);
      addRow('Offline app cache (SW)', _swCacheInfo, _clearSwCaches, true);
      var foot = document.createElement('div');
      foot.style.cssText = 'color:#777;font-size:11px;margin-top:8px;';
      box.appendChild(foot);
      function refresh() {
        rows.forEach(function (r) { try { Promise.resolve(r.fn()).then(function (v) { r.set(v); }); } catch (e) { r.set('—'); } });
        _estimate().then(function (u) { foot.textContent = u != null ? ('Total origin storage ≈ ' + _fmtBytes(u)) : ''; });
      }
      refresh();
      console.log('§CACHE_INFO panel built rows=' + rows.length);
      return box;
    }

    // §5D Rate Pack body (BIM→Project TASK A) — picks the active cost pack, persisted to
    // localStorage[bim_5d_pack] (read with priority by rates.js initRateTemplate). On change it
    // loads the pack LIVE (loadRateTemplate → RATES + _TRL.cur), so the Find-panel cost + future
    // BIM→ERP export bill from the chosen pack. The 4D sequence is edited via the JSON registry hub.
    function _rate5dBody() {
      var box = document.createElement('div');
      box.style.cssText = 'padding:8px 14px 14px;font-size:12px;color:#bbb;';
      var note = document.createElement('div');
      note.style.cssText = 'color:#888;font-size:11px;margin-bottom:8px;line-height:1.4;';
      note.textContent = 'Currency + unit rates for the Find-panel cost and BIM→ERP export. Editing the 4D sequence: use the JSON registry above (sequence_rules).';
      box.appendChild(note);
      // The shipped locale packs (rates/<id>.json). Value = file id; the pack carries its own currency.
      var PACKS = ['cidb2024_my', 'bcis2024_uk', 'rsmeans2024_us', 'rawlinsons2024_au', 'bki2024_de',
        'untec2024_fr', 'cype2024_es', 'gb50500_cn', 'dpt2024_th', 'jbci2024_jp', 'kict2024_kr',
        'aramco2024_sa', 'sinapi2024_br', 'sni2024_id', 'asaqs2024_za', 'pwd2024_bd'];
      var active = (function () { try { return localStorage.getItem('bim_5d_pack'); } catch (e) { return null; } })()
        || (window.RATE_TEMPLATE_NAME) || 'cidb2024_my';
      var sel = document.createElement('select');
      sel.style.cssText = 'width:100%;padding:6px 8px;border:1px solid rgba(108,159,255,0.3);border-radius:6px;background:#1a1a1a;color:#cfe;font-size:12px;';
      PACKS.forEach(function (id) {
        var o = document.createElement('option'); o.value = id; o.textContent = id;
        if (id === active) o.selected = true; sel.appendChild(o);
      });
      var status = document.createElement('div');
      status.style.cssText = 'color:#8ab4ff;font-size:11px;margin-top:8px;min-height:14px;';
      var curNow = (window._TRL && window._TRL.cur) || '';
      status.textContent = 'Active: ' + active + (curNow ? (' (' + curNow + ')') : '');
      sel.addEventListener('change', function () {
        var name = sel.value;
        try { localStorage.setItem('bim_5d_pack', name); } catch (e) {}
        if (typeof window.loadRateTemplate === 'function') {
          window.loadRateTemplate(name).then(function () {
            var cur = (window._TRL && window._TRL.cur) || '';
            status.textContent = 'Active: ' + (window.RATE_TEMPLATE_NAME || name) + (cur ? (' (' + cur + ')') : '');
            console.log('§FIND_COST_PACK set=' + name + ' active=' + (window.RATE_TEMPLATE_NAME || name) + ' cur=' + cur);
            if (A.status) A.status.textContent = '5D pack: ' + name;
          });
        }
      });
      box.appendChild(sel); box.appendChild(status);
      return box;
    }

    // §S282: Accordion section — ERP .acc pattern (chevron, expand/collapse)
    function _buildSection(title, startOpen, buildContent) {
      var sec = document.createElement('div');
      sec.style.cssText = 'margin:0;border-radius:0;overflow:hidden;background:transparent;';

      // Header
      var hd = document.createElement('div');
      hd.style.cssText = 'padding:14px 18px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;background:rgba(108,159,255,0.03);transition:background 150ms;';
      var chv = document.createElement('span');
      chv.textContent = '\u25B6';
      chv.style.cssText = 'font-size:11px;color:#6c9fff;margin-right:8px;display:inline-block;transition:transform 250ms;';
      if (startOpen) chv.style.transform = 'rotate(90deg)';
      var lbl = document.createElement('span');
      lbl.style.cssText = 'font-weight:600;color:#8ab4ff;font-size:13px;';
      lbl.textContent = title;
      var left = document.createElement('span');
      left.appendChild(chv); left.appendChild(lbl);
      hd.appendChild(left);
      sec.appendChild(hd);

      // Body
      var bd = document.createElement('div');
      bd.className = 'settings-bd';
      bd.style.cssText = 'max-height:' + (startOpen ? '70vh' : '0') + ';overflow:hidden;transition:max-height 300ms ease;padding:0 4px;';
      if (startOpen) { bd.style.overflowY = 'auto'; bd.appendChild(buildContent()); }
      sec.appendChild(bd);

      // Toggle
      hd.addEventListener('pointerup', function(e) {
        e.stopPropagation();
        var open = bd.style.maxHeight !== '0px' && bd.style.maxHeight !== '0';
        if (open) {
          bd.style.maxHeight = '0'; bd.style.overflowY = 'hidden';
          chv.style.transform = 'rotate(0deg)';
        } else {
          if (!bd.children.length) bd.appendChild(buildContent());
          bd.style.maxHeight = '70vh'; bd.style.overflowY = 'auto';
          chv.style.transform = 'rotate(90deg)';
        }
      });
      return sec;
    }

    // §S282c: Pill Icons as a SettingsEditor SCHEMA (reorderable rows, visible
    // toggle + readonly shortcut). Replaces the bespoke _buildPillRows/_renderPillRow.
    function _pillIconSchema() {
      if (!_mainPill) return [];
      var cfg = _mainPill.getConfig();
      var order = cfg.order, hidden = cfg.hidden || [];
      var sorted = _actions.slice().sort(function(a, b) {
        var ai = order.indexOf(a.id), bi = order.indexOf(b.id);
        if (ai < 0) ai = 9999; if (bi < 0) bi = 9999;
        return ai - bi;
      });
      var rows = sorted.map(function(act) {
      var icon = act.img ? '<img src="' + act.img + '" width="16" height="16">'
        : act.icon ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + act.icon + '</svg>'
        : '';
      var fields = [ { key: 'visible', type: 'toggle', value: hidden.indexOf(act.id) < 0 } ];
      if (act.key) fields.push({ key: 'shortcut', type: 'readonly', value: act.key.toUpperCase() });
      return { id: act.id, label: act.name || (act.id.charAt(0).toUpperCase() + act.id.slice(1)),
        icon: icon, fields: fields };
      });
      return [ { section: 'Pill Icons', reorderable: true, _key: 'pill', _array: true, rows: rows } ];
    }

    // Render Pill Icons into a box via SettingsEditor. persist:false \u2014 the pill's
    // own setConfig is the source of truth; onChange maps edits back to it.
    function _renderPillEditor(box) {
      box.innerHTML = '';
      if (typeof window.SettingsEditor !== 'function') { box.textContent = 'editor unavailable'; return null; }
      return SettingsEditor({
        container: box,
        schema: _pillIconSchema(),
        persist: false,
        onChange: function(rowId, key, value) {
          if (!_mainPill) return;
          var c = _mainPill.getConfig();
          if (rowId === '(order)') {
            c.order = String(value).split(',');
          } else if (key === 'visible') {
            var h = c.hidden || [];
            var idx = h.indexOf(rowId);
            if (value && idx >= 0) h.splice(idx, 1);
            else if (!value && idx < 0) h.push(rowId);
            c.hidden = h;
          } else { return; }
          _mainPill.setConfig(c);
          console.log('\u00A7SETTINGS_SAVE pill ' + rowId + '.' + key + '=' + value);
        }
      });
    }

    // \u00A7SETTINGS_JSON: CAPTURED provider \u2014 project the active building's native IFC
    // IfcWorkSchedule (tasks/task_elements tables in A.db) into the schedule_instance
    // contract shape (internal/schedule_instance.template.json): Project + Phases[].
    // Phases collapse Ceiling/TOS into their Level; each span = its own structural span
    // (min start\u2192max finish of its tasks). source='captured' (IFC verbatim). The generated
    // provider (rules session) emits the SAME shape for elements IFC has no 4D for.
    // Returns null when the building carries no native 4D \u2192 caller shows a fallback note.
    function _projectSchedule() {
      var db = A.db;
      if (!db) return null;
      function rows(sql) {
        var r; try { r = db.exec(sql); } catch (e) { return []; }
        if (!r.length) return [];
        var cols = r[0].columns, out = [];
        r[0].values.forEach(function(v) { var o = {}; cols.forEach(function(c, i) { o[c] = v[i]; }); out.push(o); });
        return out;
      }
      function meta(k, d) { var r = rows("SELECT value FROM project_metadata WHERE key='" + k + "'"); return r.length ? r[0].value : d; }
      function day(iso) { return (iso || '').slice(0, 10); }
      function weeksBetween(s, e) { return Math.max(1, Math.round((Date.parse(e) - Date.parse(s)) / (7 * 86400000))); }
      function collapseLevel(name) { var m = /^(Level\s*\S+?)(?:\s+(?:Ceiling|TOS|Top of Steel))?$/i.exec(name || ''); return m ? m[1] : name; }

      var tasks = rows("SELECT task_id,wbs_parent,name,is_summary,schedule_start,schedule_finish FROM tasks");
      // no native IFC tasks table → fall through to the generated (kernel_ops) path below
      var byId = {}; tasks.forEach(function(t) { byId[t.task_id] = t; });
      function phaseOf(t) {
        var cur = t, levelName = null, rootName = null, guard = 0;
        while (cur && guard++ < 64) {
          if (/^Level\b/i.test(cur.name)) levelName = collapseLevel(cur.name);
          rootName = cur.name;
          if (!cur.wbs_parent || !byId[cur.wbs_parent]) break;
          cur = byId[cur.wbs_parent];
        }
        if (levelName) return levelName;
        if (/site/i.test(rootName)) return 'Site Works';
        if (/structure/i.test(rootName)) return 'Substructure';
        return rootName || 'Other';
      }
      var teCount = {};
      rows("SELECT task_id, COUNT(*) n FROM task_elements GROUP BY task_id").forEach(function(r) { teCount[r.task_id] = r.n; });

      var ph = {};
      tasks.forEach(function(t) {
        if (t.is_summary || !t.schedule_start || !t.schedule_finish) return;
        var name = phaseOf(t);
        var p = ph[name] || (ph[name] = { phase: name, start: t.schedule_start, finish: t.schedule_finish, elements: 0 });
        if (t.schedule_start < p.start) p.start = t.schedule_start;
        if (t.schedule_finish > p.finish) p.finish = t.schedule_finish;
        p.elements += (teCount[t.task_id] || 0);
      });
      var ordered = Object.keys(ph).map(function(k) { return ph[k]; })
        .sort(function(a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });
      if (!ordered.length) return _projectGenerated();   // no captured phases → try the TM-generated schedule
      var phases = ordered.map(function(p, i) {
        return { id: 'p' + i, phase: p.phase, start: day(p.start), weeks: weeksBetween(p.start, p.finish), elements: p.elements, source: 'captured' };
      });
      var cal = rows("SELECT name FROM calendars LIMIT 1")[0] || {};
      var out = {
        Project: { building: meta('building_name', meta('project_name', '?')), start: day(ordered[0].start), calendar: cal.name || '', source: 'captured' },
        Phases: phases
      };
      var totalEl = phases.reduce(function(s, p) { return s + p.elements; }, 0);
      console.log('\u00A7SCHEDULE_INSTANCE building=' + out.Project.building + ' provider=captured phases=' +
        phases.length + ' captured=' + totalEl + ' generated=0 start=' + out.Project.start);
      return out;

      // GENERATED provider: no native IFC 4D, but TM ran \u2192 project the runtime kernel_ops
      // schedule (generative bands grouped by storey; captured-overlaid rows flagged). Same
      // contract shape (Project + Phases[]) so the same read-only viewer renders it.
      function _projectGenerated() {
        var ke = rows("SELECT timestamp, parameters FROM kernel_ops WHERE op_type = 'ELEMENT_PLACE' AND undone = 0");
        if (!ke.length) return null;                 // no schedule at all (Time Machine not run yet)
        function dayMs(ms) { try { return new Date(Number(ms)).toISOString().slice(0, 10); } catch (e) { return ''; } }
        function weeksMs(s, e) { return Math.max(1, Math.round((Number(e) - Number(s)) / (7 * 86400000))); }
        var g = {};
        ke.forEach(function(op) {
          var p; try { p = JSON.parse(op.parameters); } catch (e) { p = {}; }
          var key = collapseLevel(p.storey || p.phase || 'Unspecified');   // storey-banded, Ceiling/TOS collapsed
          var s = Number(op.timestamp), e = Number(p._end_ts != null ? p._end_ts : op.timestamp);
          if (!isFinite(s)) return;
          if (!isFinite(e) || e < s) e = s;
          var b = g[key] || (g[key] = { phase: key, start: s, finish: e, elements: 0, cap: 0 });
          if (s < b.start) b.start = s;
          if (e > b.finish) b.finish = e;
          b.elements++;
          if (p._captured) b.cap++;
        });
        var ord = Object.keys(g).map(function(k) { return g[k]; }).sort(function(a, b) { return a.start - b.start; });
        if (!ord.length) return null;
        var gphases = ord.map(function(b, i) {
          var src = b.cap === 0 ? 'generated' : (b.cap === b.elements ? 'captured' : 'mixed');
          return { id: 'p' + i, phase: b.phase, start: dayMs(b.start), weeks: weeksMs(b.start, b.finish), elements: b.elements, source: src };
        });
        var capTot = ord.reduce(function(s, b) { return s + b.cap; }, 0);
        var elTot = ord.reduce(function(s, b) { return s + b.elements; }, 0);
        var projSrc = capTot === 0 ? 'generated' : (capTot === elTot ? 'captured' : 'mixed');
        var cal = rows("SELECT name FROM calendars LIMIT 1")[0] || {};
        var gout = {
          Project: { building: meta('building_name', meta('project_name', '?')), start: dayMs(ord[0].start), calendar: cal.name || '', source: projSrc },
          Phases: gphases
        };
        console.log('\u00A7SCHEDULE_INSTANCE building=' + gout.Project.building + ' provider=' + projSrc + ' phases=' +
          gphases.length + ' captured=' + capTot + ' generated=' + (elTot - capTot) + ' start=' + gout.Project.start);
        return gout;
      }
    }

    // \u00A7S282c: registry of project JSONs editable from Settings (pure data).
    // overrides refine auto-inferred field types per file. manifest.json is
    // EXCLUDED (254KB machine-generated AD compile \u2014 not hand-editable).
    // schedule = source:'db' READ-ONLY (Phase 1): projects the captured 4D for viewing.
    var _jsonRegistry = [
      { id: 'corporate',   label: 'Corporate / Branding', url: 'corporate.json',   storageKey: 'json_corporate' },
      { id: 'grid_rules',  label: 'Grid Rules',           url: 'grid_rules.json',  storageKey: 'json_grid_rules' },
      { id: 'clash_rules', label: 'Clash Rules',          url: 'clash_rules.json', storageKey: 'json_clash_rules' },
      { id: 'initbubble',  label: 'ERP Globe Bubbles',    url: 'initbubble.json',  storageKey: 'json_initbubble',
        overrides: { color: { type: 'color' } } },
      { id: 'sfx',         label: 'Sound Effects',        url: 'sfx.json',         storageKey: 'json_sfx' },
      { id: 'schedule',    label: '4D Schedule (this building)', source: 'db', storageKey: 'json_schedule',
        readonly: true, project: _projectSchedule,
        // compact read-only view: phase name as row label + one "start · Nwk · elements" line
        overrides: { __labelKey: 'phase', __summary: ['start', 'weeks', 'elements'] } }
    ];

    // Build the "Edit project JSON" hub: a picker that opens any registered file
    // in the SAME SettingsEditor (auto-inferred schema), with Download + Reset.
    function _buildJsonHub(content) {
      var hub = _buildSection('Edit Project JSON', false, function() {
        var box = document.createElement('div');
        box.style.cssText = 'padding:4px 0;';
        _jsonRegistry.forEach(function(entry) {
          var row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.04);cursor:pointer;';
          var lbl = document.createElement('span');
          lbl.textContent = entry.label;
          lbl.style.cssText = 'font-size:12px;color:#ccc;';
          var arrow = document.createElement('span');
          arrow.textContent = '\u270E';
          arrow.style.cssText = 'font-size:12px;color:#6c9fff;';
          row.appendChild(lbl); row.appendChild(arrow);
          row.addEventListener('pointerup', function(e) {
            e.stopPropagation();
            _openJsonEditor(entry);
          });
          box.appendChild(row);
        });
        return box;
      });
      content.appendChild(hub);
    }

    // Open one registered JSON in a SettingsEditor sub-panel.
    // source:'url' (default) -> fetch + localStorage override (editable).
    // source:'db'           -> entry.project() returns the JSON (e.g. captured 4D).
    // readonly:true         -> whole-file viewer: no Download / no Reset, fields display-only.
    function _openJsonEditor(entry) {
      var id = 'json-editor-' + entry.id;
      var existing = document.getElementById(id);
      if (existing) { existing.style.display = ''; return; }

      // resolve the raw JSON by source (db = projected, url = fetched+override)
      var rawP;
      if (entry.source === 'db') {
        if (typeof entry.project !== 'function') return;
        try { rawP = Promise.resolve(entry.project()); } catch (e) { rawP = Promise.reject(e); }
      } else {
        if (typeof window.loadJsonWithOverrides !== 'function') return;
        rawP = loadJsonWithOverrides(entry.url, entry.storageKey);
      }

      rawP.then(function(raw) {
        var content = document.createElement('div');
        content.style.cssText = 'font-size:13px;color:#ccc;';

        var hdr = document.createElement('h3');
        hdr.textContent = entry.label + (entry.url ? ' — ' + entry.url : '');
        hdr.style.cssText = 'margin:0 0 10px;color:#4fc3f7;font-size:14px;';
        content.appendChild(hdr);

        if (raw == null) {                            // building carries no native 4D
          var note = document.createElement('div');
          note.textContent = 'No 4D schedule captured for this building. Open Time Machine to generate one, or import an IFC IfcWorkSchedule / MS Project export.';
          note.style.cssText = 'font-size:12px;color:#999;padding:8px 0;';
          content.appendChild(note);
          console.log('§JSON_EDITOR_EMPTY ' + entry.id);
        } else {
          var schema = SettingsEditor.jsonToSchema(raw, entry.overrides || {});
          var box = document.createElement('div');
          content.appendChild(box);
          var editor = SettingsEditor({
            container: box, schema: schema, storageKey: entry.storageKey,
            readonly: !!entry.readonly,
            persist: !entry.readonly,                 // read-only view never writes localStorage
            onChange: function() {}
          });

          if (!entry.readonly) {
            // Download edited JSON (so the user can commit it back to the repo)
            var dl = document.createElement('button');
            dl.textContent = '⬇ Download ' + entry.url;
            dl.style.cssText = 'margin:12px 0 0;padding:8px 16px;border:1px solid rgba(108,159,255,0.2);border-radius:8px;background:transparent;color:#6c9fff;font-size:12px;cursor:pointer;width:100%;';
            dl.addEventListener('pointerup', function(e) {
              e.stopPropagation();
              var blob = new Blob([JSON.stringify(editor.getState(), null, 2)], { type: 'application/json' });
              var a = document.createElement('a');
              a.href = URL.createObjectURL(blob); a.download = entry.url;
              a.click(); URL.revokeObjectURL(a.href);
              console.log('§JSON_DOWNLOAD ' + entry.url);
            });
            content.appendChild(dl);

            // Reset this file's overrides
            var rs = document.createElement('button');
            rs.textContent = 'Reset ' + entry.label;
            rs.style.cssText = 'margin:8px 0 0;padding:8px 16px;border:1px solid rgba(255,255,255,0.1);border-radius:8px;background:transparent;color:#999;font-size:12px;cursor:pointer;width:100%;';
            rs.addEventListener('pointerup', function(e) { e.stopPropagation(); editor.reset(); });
            content.appendChild(rs);
          }
        }

        // §PANEL-SPREAD: own dedicated column (tall content) — was top:80/right:80, same
        // cluster as the rest.
        var p = A.createPanel(id, { closable: true,
          style: { position:'fixed', top:'70px', left:'624px', zIndex:'1101', width:'320px', padding:'16px' },
          content: content });
        document.body.appendChild(p);
        p.style.display = '';   // createPanel returns hidden; reveal this fresh panel
        if (window.InputReg) InputReg.register({ id: 'json-editor', el: p, kind: 'panel', release: function() { p.style.display = 'none'; } });
        console.log('§JSON_EDITOR_OPEN ' + entry.id);
      }).catch(function(err) {
        console.warn('§JSON_EDITOR_FAIL ' + entry.id + ' ' + err);
      });
    }

    // PILL_DRAWER_REORGANIZATION.md §FINAL RAIL ORDER: Document(Save,Open) → Navigate → Inspect
    // → Visual FX → Camera/View → Share → Settings, Help. 9 visible icons (rest are pill:false,
    // absorbed into a drawer or Help/Settings-only — still present here so Settings' pill editor
    // and any localStorage-order migration have a stable position for them).
    var _defaultOrder = ['save','open','navigate','inspect','palette','camview','share','settings','help',
      'audio','report','fly','shadow','night','background','tm','section','xray','measure','walk','find','worldhist','precision','home','cam-reset','cam-pivot','clash','bbox','issues','fullscreen','hbaFM','whwalk'];

    // §S281: All pill infrastructure now in pill_builder.js — one PillBuilder call.
    var _mainPill = PillBuilder({
      pill: pill, trigger: trigger, APP: A,
      actions: _actions, order: _defaultOrder,
      storageKey: 'bim_pill_config',
      layout: 'rail'   // L-PATH position:fixed rail — viewer.html CSS declares the buttons fixed
    });

    // Expose for toggleDocPill restore + keyboard shortcut
    A._buildPill = _mainPill.build;
    window._syncPillHighlights = _mainPill.sync;
    window.toggleMobilePill = _mainPill.toggle;
    window._mainPillActions = _mainPill.actions; // §S281: exposed for Help panel dynamic merge

    // §S282: Shortcut audit — cross-check key props vs scene.js _shortcuts at init
    setTimeout(function() {
      var sc = window._shortcuts;
      if (!sc) { console.log('§SHORTCUT_AUDIT skipped — _shortcuts not available'); return; }
      var ok = 0, miss = 0;
      _actions.forEach(function(act) {
        if (!act.key) return;
        if (sc[act.key]) ok++;
        else { miss++; console.warn('§SHORTCUT_AUDIT MISS action=' + act.id + ' key=' + act.key + ' — no scene.js shortcut'); }
      });
      console.log('§SHORTCUT_AUDIT matched=' + ok + ' missing=' + miss);
    }, 2000);

    // §S280: Undo via kernel_ops
    var _redoBtn = null;
    function _doUndo() {
      if (!window.KernelOps || !A.db) { A.status.textContent = 'No ops to undo'; return; }
      var op = KernelOps.undoOp(A.db);
      if (!op) { A.status.textContent = 'Nothing to undo'; return; }
      A.status.textContent = 'Undo: ' + op.op_type;
      // Replay scene from clean state
      if (op.op_type === 'VIEW_FILTER' || op.op_type === 'ELEMENT_PICK') {
        // Replay all non-undone VIEW_FILTER ops to restore visibility
        var vfOps = KernelOps.replayOps(A.db, 'VIEW_FILTER');
        if (vfOps.length === 0 && A._resetAllVisibility) A._resetAllVisibility();
        else if (A._applyViewFilter) A._applyViewFilter(vfOps[vfOps.length - 1].parameters);
      }
      // Show redo button in pill
      if (!_redoBtn) {
        _redoBtn = document.createElement('button');
        _redoBtn.title = 'redo';
        _redoBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M21 13a9 9 0 0 0-3-6.36A8.97 8.97 0 0 0 12 4c-5 0-9 4-9 9s4 9 9 9a9 9 0 0 0 7.74-4.41"/></svg>';
        _redoBtn.style.color = '#4fc3f7';
        _redoBtn.addEventListener('pointerup', function(e) {
          e.stopPropagation();
          _doRedo();
        });
      }
      // Insert redo after undo in the pill scroll
      var undoBtn = scroll.querySelector('[title="undo"]');
      if (undoBtn && !_redoBtn.parentNode) {
        undoBtn.parentNode.insertBefore(_redoBtn, undoBtn.nextSibling);
      }
      console.log('§MOBILE_UNDO type=' + op.op_type + ' id=' + op.id);
    }
    function _doRedo() {
      if (!window.KernelOps || !A.db) return;
      var op = KernelOps.redoOp(A.db);
      if (!op) {
        A.status.textContent = 'Nothing to redo';
        if (_redoBtn && _redoBtn.parentNode) _redoBtn.parentNode.removeChild(_redoBtn);
        return;
      }
      A.status.textContent = 'Redo: ' + op.op_type;
      // Re-apply the op
      if (op.op_type === 'VIEW_FILTER' && A._applyViewFilter) {
        A._applyViewFilter(op.parameters);
      }
      // Check if more redos available
      var nextRedo = A.db.exec('SELECT id FROM kernel_ops WHERE undone = 1 ORDER BY id ASC LIMIT 1');
      if (!nextRedo.length || !nextRedo[0].values.length) {
        if (_redoBtn && _redoBtn.parentNode) _redoBtn.parentNode.removeChild(_redoBtn);
      }
      console.log('§MOBILE_REDO type=' + op.op_type + ' id=' + op.id);
    }

    console.log('§MOBILE_BAR_READY actions=' + _actions.length);
  })();

  // Register static panels immediately (don't wait for building to load)
  // §S267: Lazy-fetch BOM.db for OOTB fleet buildings (verb expansion)
  // BOM.db lives at buildings/{PREFIX}_BOM.db alongside the extracted DB.
  // Fetched once on Red Pill press, opened via sql.js, stored on A._bomDb.
  // IFC Drop buildings won't have BOM.db — 404 is expected, silently ignored.
  var BOM_IDB_STORE = 'bim_ootb_bomdb';
  function _fetchBomDb(A, buildingName) {
    if (A._bomDb) return; // already loaded
    if (!buildingName || !window.initSqlJs) return;

    // Derive BOM name: strip IFC schema prefix + _extracted/_meta suffixes
    // Ifc2x3_SampleCastle → SampleCastle, HITOS_extracted → HITOS
    var bomName = buildingName
      .replace(/^Ifc2x3_/i, '').replace(/^Ifc4_/i, '')
      .replace(/_extracted$/, '').replace(/_meta$/, '');

    // Try IndexedDB cache first
    _idbGet(BOM_IDB_STORE, bomName + '_BOM', function(cached) {
      if (cached) {
        _openBomDb(A, cached, bomName, 'cache');
        return;
      }
      // Resolve URL: same base as building DB, replace _extracted.db → _BOM.db
      var dbUrl = A.DB_URL || '';
      var bomUrl = '';
      if (dbUrl.indexOf('_extracted.db') !== -1) {
        // Direct replacement: SampleCastle_extracted.db → SampleCastle_BOM.db
        bomUrl = dbUrl.replace(/_extracted\.db.*$/, '_BOM.db');
      } else if (dbUrl.indexOf('buildings/') !== -1) {
        bomUrl = dbUrl.replace(/\/[^/]+$/, '/' + bomName + '_BOM.db');
      } else {
        bomUrl = 'buildings/' + bomName + '_BOM.db';
      }
      console.log('§BOM_DB_FETCH url=' + bomUrl);
      fetch(bomUrl).then(function(resp) {
        if (!resp.ok) {
          console.log('§BOM_DB_FETCH 404 — no BOM.db for ' + prefix + ' (IFC Drop path)');
          return;
        }
        return resp.arrayBuffer();
      }).then(function(buf) {
        if (!buf) return;
        // Cache in IndexedDB
        _idbPut(BOM_IDB_STORE, bomName + '_BOM', new Uint8Array(buf));
        _openBomDb(A, new Uint8Array(buf), bomName, 'fetch');
      }).catch(function(e) {
        console.log('§BOM_DB_FETCH err=' + e.message);
      });
    });
  }

  function _openBomDb(A, buf, bomName, source) {
    initSqlJs({ locateFile: function(f) { return 'lib/' + f; } }).then(function(SQL) {
      A._bomDb = new SQL.Database(buf);
      console.log('§BOM_DB_READY name=' + bomName + ' source=' + source +
        ' size=' + (buf.byteLength / 1024).toFixed(0) + 'KB');
      // §S267: BOM.db loaded after Doc canvas activated — reload phases
      if (window.DocCanvas && DocCanvas.isActive()) {
        // Deactivate and reactivate to rebuild envelope + phases from BOM
        DocCanvas.deactivate(A);
        DocCanvas.activate(A);
        console.log('§BOM_DB_RELOAD reactivated Doc canvas with BOM.db');
      }
    }).catch(function(e) {
      console.warn('§BOM_DB_OPEN err=' + e.message);
    });
  }

  // Minimal IndexedDB get/put for BOM.db cache
  function _idbGet(store, key, cb) {
    try {
      var req = indexedDB.open(store, 1);
      req.onupgradeneeded = function(e) { e.target.result.createObjectStore('data'); };
      req.onsuccess = function(e) {
        var tx = e.target.result.transaction('data', 'readonly');
        var get = tx.objectStore('data').get(key);
        get.onsuccess = function() { cb(get.result || null); };
        get.onerror = function() { cb(null); };
      };
      req.onerror = function() { cb(null); };
    } catch(e) { cb(null); }
  }
  function _idbPut(store, key, val) {
    try {
      var req = indexedDB.open(store, 1);
      req.onupgradeneeded = function(e) { e.target.result.createObjectStore('data'); };
      req.onsuccess = function(e) {
        var tx = e.target.result.transaction('data', 'readwrite');
        tx.objectStore('data').put(val, key);
      };
    } catch(e) { /* ignore */ }
  }

  // §WH-HOME — if the viewer was opened with ?home=<url>, render a back button in the top-left HUD.
  if (A.HOME_URL) {
    var whHomeBtn = A.icon('home', { size: 22, title: 'Back to iDempiere',
      onClick: function () { location.href = A.HOME_URL; }
    });
    whHomeBtn.style.cssText = 'position:fixed;top:10px;left:10px;z-index:900;' +
      'background:rgba(0,0,0,0.45);border-radius:8px;padding:5px;cursor:pointer';
    document.body.appendChild(whHomeBtn);
    console.log('§WH-HOME rendered href=' + A.HOME_URL);
  }

  // These exist in HTML from page load — section, sunglasses, toolbar
  setTimeout(function() {
    if (A._wireListKeyNav) A._wireListKeyNav();
    // S265 Phase 4: make info-panel draggable so it doesn't obscure pill
    var infoP = document.getElementById('info-panel');
    if (infoP && A._makeDraggable && !infoP._draggableWired) { A._makeDraggable(infoP); infoP._draggableWired = true; }
    console.log('§PANELS_INIT static panels registered');
  }, 500);
}
