#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-WING2D-BROWSER: prompts/DXF2BIM_FOUNDATION_LANE.md F7. Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: in the real Viewer (headless Chromium), Section Cut offers the `2D` mode for a building of more than 2 storeys; its plane stands on the
 * model and cuts nothing; dragging an edge handle with real pointer events turns the plane; the 2D button draws the wing's layout as an overlay whose drawn entity count equals
 * the DXF's; Save downloads a zip that the Modeller importer reads (frame stated, no refusal); the plane is exactly as it was after Save / Close.
 *   B1 OFFER   — the `2D` mode button exists after Section Cut opens (HHS: 4 storeys)        B2 PLANE  — plane state, framed walls > 0, nothing clipped
 *   B3 DRAG    — a pointer drag of the east handle changes the turn (and keeps the west end)  B4 EXPORT — overlay shown, 9 sheets, drawn entities == parsed entities
 *   B5 SAVE    — a zip with every sheet, importable, @FRAME present                          B6 RESTORE — plane unchanged after Save, overlay gone
 * NEEDS (not in the repo): a local viewer db and its sidecar: buildings/HHS_Office_Federated_extracted.db and buildings/HHS_Office_Federated_2d.db
 *   (the sidecar from modeller/dxf2bim/std2d_sidecar.js build() over the writer's extraction of the same IFC). Serve the repo root: python3 -m http.server 8191.
 * Usage: PW=<dir holding @playwright/test> NODE_PATH=<dir with sql.js> node tests/wing_2d_browser.js [http://localhost:8191]
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), { execFileSync } = require('child_process');
const { chromium } = require(path.join(process.env.PW || path.join(process.env.HOME, 'bim-ootb/tests/node_modules'), '@playwright/test'));
const BASE = process.argv[2] || 'http://localhost:8191', DB = process.env.WING_DB || '../buildings/HHS_Office_Federated_extracted.db';
let fail = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true })).newPage(), logs = []; p.on('console', m => logs.push(m.text())); p.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await p.goto(BASE + '/viewer/viewer.html?db=' + DB + '&ghost=1');
  await p.waitForFunction(() => window.APP && APP.scene && /DONE/.test((document.getElementById('s-active') || {}).textContent || ''), { timeout: 120000 });
  await p.waitForTimeout(2500); await p.evaluate(() => APP.toggleSection()); await p.waitForTimeout(2200);
  check('B1', 'Section Cut offers the 2D mode', await p.evaluate(() => !!document.getElementById('sec-axis-wing')), 'button present');
  await p.evaluate(() => document.getElementById('sec-axis-wing').click()); await p.waitForFunction(() => APP.wing2dState().side, { timeout: 60000 });
  const s0 = await p.evaluate(() => APP.wing2dState()), clipped = await p.evaluate(() => APP.renderer.localClippingEnabled);
  check('B2', 'plane stands, walls framed, nothing clipped', s0.on && s0.plane && s0.fam.length > 0 && clipped === false, JSON.stringify(s0.plane) + ' families=' + JSON.stringify(s0.fam) + ' clipping=' + clipped);
  const hp = await p.evaluate(() => { const v = APP._wing2d.parts.h1.position.clone().project(APP.camera), r = APP.canvas.getBoundingClientRect(); return { x: r.left + (v.x * .5 + .5) * r.width, y: r.top + (-v.y * .5 + .5) * r.height }; });
  await p.mouse.move(hp.x, hp.y); await p.mouse.down(); await p.mouse.move(hp.x + 40, hp.y - 40, { steps: 8 }); await p.mouse.up();
  const s1 = await p.evaluate(() => APP.wing2dState().plane);
  check('B3', 'a pointer drag of the east handle turns the plane and keeps the west end', Math.abs(s1.turn - s0.plane.turn) > 1 && s1.p0.every((v, i) => Math.abs(v - s0.plane.p0[i]) < 1e-6), 'turn ' + s0.plane.turn + ' -> ' + s1.turn);
  await p.evaluate(p0 => APP.wing2dSet(p0.p0, p0.p1), s0.plane); await p.evaluate(() => { window.__e = APP.wing2dExport(); });
  await p.waitForFunction(() => document.getElementById('wing-2d-overlay'), { timeout: 90000 }); await p.waitForTimeout(1200);
  const ov = await p.evaluate(() => APP.wing2dState().overlay), nTabs = await p.locator('#wing-2d-overlay button').count();
  check('B4', 'overlay shown; drawn entities == the sheet\'s entities', ov && ov.drawn && ov.drawn.stats && JSON.stringify(ov.drawn.stats.by_type) === JSON.stringify(ov.drawn.stats.drawn_by_type) && ov.drawn.entities > 0, JSON.stringify(ov && ov.drawn && ov.drawn.stats && ov.drawn.stats.drawn_by_type) + ' tabs+buttons=' + nTabs);
  await p.waitForTimeout(500); const ov2 = await p.evaluate(() => APP.wing2dState().overlay);
  check('B4a', 'the small card rests clear of the building (projected out of the building area)', ov2.big === false && ov2.overlapBuilding === 0 && ov2.building, 'rest=' + ov2.rest + ' overlap=' + ov2.overlapBuilding + ' building=' + JSON.stringify(ov2.building && { x0: Math.round(ov2.building.x0), x1: Math.round(ov2.building.x1) }) + ' card=' + JSON.stringify({ x0: Math.round(ov2.rect.x0), x1: Math.round(ov2.rect.x1) }));
  await p.click('#wing-2d-canvas'); await p.waitForTimeout(1000); check('B4b', 'a click fills the canvas', (await p.evaluate(() => APP.wing2dState().overlay.big)) === true, 'big=true');
  const tgt = await p.evaluate(() => { const e = document.getElementById('pill-save'), ids = ['pill-save', 'icon-pill', 'mobile-trigger']; for (const i of ids) { const x = document.getElementById(i); if (x) { const r = x.getBoundingClientRect(); if (r.width > 4 && r.height > 4) return { id: i, x: r.left + r.width / 2, y: r.top + r.height / 2 }; } } return null; });
  await p.evaluate(() => { window.__rec = []; const t0 = performance.now(); (function f() { const c = document.getElementById('wing-2d-overlay'); if (c) { const r = c.getBoundingClientRect(); window.__rec.push({ t: Math.round(performance.now() - t0), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width) }); } if (performance.now() - t0 < 1500) requestAnimationFrame(f); })(); });
  const before = await p.evaluate(() => JSON.stringify(APP.wing2dState().plane)), [dl] = await Promise.all([p.waitForEvent('download'), p.click('#wing-2d-save')]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wing2d-')), zp = path.join(dir, 'w.zip'); fs.copyFileSync(await dl.path(), zp);
  execFileSync('python3', ['-I', '-c', 'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;z.extractall(sys.argv[2])', zp, path.join(dir, 'x')]);
  const I = require(path.join(__dirname, '..', 'modeller', 'dxf2bim_import.js')), names = fs.readdirSync(path.join(dir, 'x')), sheets = I.readSheets(names.map(f => ({ name: f, text: fs.readFileSync(path.join(dir, 'x', f), 'utf8') }))), out = I.convert(sheets, {}), fr = I.frameOfSheets(sheets);
  check('B5', 'the saved zip imports in the Modeller path with the frame stated', names.length === 9 && !out.refused && fr && !fr.error && out.verdict && out.verdict.blocking.length > 0, 'sheets=' + names.length + ' frame=' + JSON.stringify(fr) + ' blocking=' + (out.verdict && out.verdict.blocking.length));
  const north = await p.evaluate(() => APP.wing2dState().north);
  await p.waitForTimeout(600); const rec = await p.evaluate(() => window.__rec), last = rec[rec.length - 1], first = rec[0];
  check('B6a', 'Save flies to the pill area in a few frames (frames recorded, the card narrows and its centre moves toward the target; the frame count varies with the renderer)', !tgt || (rec.length >= 2 && last.w < first.w && Math.hypot(last.x - tgt.x, last.y - tgt.y) < Math.hypot(first.x - tgt.x, first.y - tgt.y)), 'target=' + JSON.stringify(tgt) + ' frames=' + rec.length + ' first=' + JSON.stringify(first) + ' last=' + JSON.stringify(last));
  await p.waitForTimeout(500); const after = await p.evaluate(() => ({ plane: JSON.stringify(APP.wing2dState().plane), gone: !document.getElementById('wing-2d-overlay') }));
  const planTxt = fs.readFileSync(path.join(dir, 'x', names.filter(n => /FLOOR_LEVEL_1/.test(n))[0]), 'utf8'), wantN = north && north.source === 'ifc_truenorth' ? /TRUE NORTH \(ifc_truenorth\)/ : /NORTH NOT STATED/;
  check('B8', 'the saved plan carries the north the Viewer db states (an arrow), or says north is not stated', wantN.test(planTxt), 'georef=' + JSON.stringify(north) + ' sheet has ' + (/TRUE NORTH/.test(planTxt) ? 'arrow' : /NORTH NOT STATED/.test(planTxt) ? 'NORTH NOT STATED' : 'neither'));
  check('B6', 'plane unchanged after Save, overlay gone', after.plane === before && after.gone, 'unchanged=' + (after.plane === before));
  await p.evaluate(() => { window.__e = APP.wing2dExport(); }); await p.waitForFunction(() => document.getElementById('wing-2d-overlay') && APP.wing2dState().overlay, { timeout: 90000 }); await p.waitForTimeout(600);
  let got = false; p.once('download', () => { got = true; }); await p.click('#wing-2d-close'); await p.waitForTimeout(700);
  const cx = await p.evaluate(() => ({ plane: JSON.stringify(APP.wing2dState().plane), gone: !document.getElementById('wing-2d-overlay') }));
  check('B6b', 'Cancel saves nothing, removes the card, leaves the plane', !got && cx.gone && cx.plane === before, 'download=' + got + ' gone=' + cx.gone + ' unchanged=' + (cx.plane === before));
  const errs = logs.filter(l => /PAGEERROR|WING2D_EXPORT_FAIL/.test(l)); check('B7', 'no page error', errs.length === 0, errs.join(' | ').slice(0, 200));
  say(logs.filter(l => /WING2D/.test(l)).join('\n')); await b.close(); say('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
