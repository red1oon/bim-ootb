#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-WING2D-MOBILE: prompts/DXF2BIM_FOUNDATION_LANE.md F7. Read the log after every run.
 * THE ISSUE THIS PROVES OR DISPROVES: on a phone-sized touch viewport (Pixel 7, emulated, real CDP touch events) the 2D wand's tools fit the screen, a TOUCH drag of an edge handle turns the plane,
 * the overlay card is smaller than on a desktop, rests inside the screen clear of the building, and a TAP fills the canvas.
 *   M1 FIT   — Section Cut panel, the 2D tools and the 2D button lie inside the viewport      M2 TOUCH — a touch drag of the east handle changes the turn, the west end stays
 *   M3 CARD  — the small card lies inside the viewport, is narrower than 60% of it, overlaps the building by 0   M4 TAP — a tap on the card fills the canvas
 * NEEDS (not in the repo): buildings/HHS_Office_Federated_extracted.db and its _2d.db (see tests/wing_2d_browser.js). Usage: PW=<dir with @playwright/test> NODE_PATH=<sql.js dir> node tests/wing_2d_mobile.js [http://localhost:8191]
 */
'use strict';
const path = require('path'), { chromium, devices } = require(path.join(process.env.PW || path.join(process.env.HOME, 'bim-ootb/tests/node_modules'), '@playwright/test')), BASE = process.argv[2] || 'http://localhost:8191';
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }), ctx = await b.newContext({ ...devices['Pixel 7'] }), p = await ctx.newPage(), cdp = await ctx.newCDPSession(p), logs = [];
  p.on('console', m => logs.push(m.text())); p.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await p.goto(BASE + '/viewer/viewer.html?db=../buildings/HHS_Office_Federated_extracted.db&ghost=1');
  await p.waitForFunction(() => window.APP && APP.scene && /DONE/.test((document.getElementById('s-active') || {}).textContent || ''), { timeout: 150000 }); await p.waitForTimeout(3000);
  const vp = await p.evaluate(() => ({ w: innerWidth, h: innerHeight })); await p.evaluate(() => APP.toggleSection()); await p.waitForTimeout(2500);
  await p.evaluate(() => document.getElementById('sec-axis-wing').click()); await p.waitForFunction(() => APP.wing2dState().side, { timeout: 90000 });
  const R = await p.evaluate(() => { const r = id => { const b = document.getElementById(id).getBoundingClientRect(); return { x0: b.left, y0: b.top, x1: b.right, y1: b.bottom }; }; return { panel: r('section-slider-panel'), tools: r('wing-2d-tools'), btn: r('wing-2d-btn') }; });
  check('M1', 'panel, tools and the 2D button lie inside the phone viewport', Object.values(R).every(r => r.x0 >= 0 && r.y0 >= 0 && r.x1 <= vp.w && r.y1 <= vp.h), JSON.stringify(vp) + ' ' + JSON.stringify(R.btn));
  await p.evaluate(() => APP.wing2dSet([8, 10], [28, 10])); await p.waitForTimeout(500);
  const hp = await p.evaluate(() => { const v = APP._wing2d.parts.h1.position.clone().project(APP.camera), r = APP.canvas.getBoundingClientRect(); return { x: r.left + (v.x * .5 + .5) * r.width, y: r.top + (-v.y * .5 + .5) * r.height }; });
  const t = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] }), before = await p.evaluate(() => APP.wing2dState().plane);
  await t('touchStart', hp.x, hp.y); for (let i = 1; i <= 8; i++) await t('touchMove', hp.x + 3 * i, hp.y - 6 * i); await t('touchEnd'); await p.waitForTimeout(500);
  const after = await p.evaluate(() => APP.wing2dState().plane);
  check('M2', 'a touch drag of the east handle turns the plane and keeps the west end', Math.abs(after.turn - before.turn) > 5 && after.p0.every((v, i) => Math.abs(v - before.p0[i]) < 1e-6), 'turn ' + before.turn + ' -> ' + after.turn + ' handle at ' + Math.round(hp.x) + ',' + Math.round(hp.y));
  await p.evaluate(() => APP.wing2dSet([8, 10], [28, 10])); await p.evaluate(() => { window.__e = APP.wing2dExport(); }); await p.waitForFunction(() => document.getElementById('wing-2d-overlay'), { timeout: 90000 }); await p.waitForTimeout(800);
  const ov = await p.evaluate(() => APP.wing2dState().overlay), w = ov.rect.x1 - ov.rect.x0;
  check('M3', 'the small card is inside the screen, under 60% of its width, clear of the building', ov.rect.x0 >= 0 && ov.rect.x1 <= vp.w && ov.rect.y0 >= 0 && ov.rect.y1 <= vp.h && w <= vp.w * 0.6 + 1 && ov.overlapBuilding === 0, 'card ' + Math.round(w) + ' px of ' + vp.w + ' rest=' + ov.rest + ' overlap=' + ov.overlapBuilding);
  await p.tap('#wing-2d-canvas'); await p.waitForTimeout(900); check('M4', 'a tap fills the canvas', await p.evaluate(() => APP.wing2dState().overlay.big), 'big');
  const errs = logs.filter(l => /PAGEERROR|EXPORT_FAIL/.test(l)); check('M5', 'no page error', errs.length === 0, errs.join(' | ').slice(0, 200)); await b.close(); say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
