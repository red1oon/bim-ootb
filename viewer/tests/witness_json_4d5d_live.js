#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-JSON-4D5D-LIVE (docs/BIMUserGuide.md "Your own 4D / 5D references"; the browser half of W-JSON-4D5D). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: the Node witness proves the loaders and the editor's round trip, not that a person editing in the LIVE Viewer's
// Settings ▸ Edit Project JSON changes what the Viewer prices and schedules with. Here the real page is driven with real input events:
//   L1 the 5D Rate Pack entry opens the active pack's file; the IfcWall row (a JSON text field since the nested-value fix) edited to a new rate is saved as json_rates_<pack>.
//   L2 after a reload the Viewer prices with it: §RATE_OVERRIDE applied=1 and calcCost('IfcWall', n) = getRate('IfcWall') x n (nlp.js:76, the Find panel's own pricing) = n x the typed rate;
//      every other class unchanged.
//   L3 the 4D Schedule Template entry: a lag inside dependencies.within_level edited as JSON text is saved as json_4d_template, and after a reload the
//      loader's call (loadJsonWithOverrides('rates/4D_template.json', 'json_4d_template'), the one tm_sched_xray.js makes) returns the edited lag.
//   L4 Reset in each entry discards the copy: after a reload calcCost is back to the shipped number and the template's lag to its shipped value.
//   L0 no page errors from these steps.
// SAFE BY CONSTRUCTION: a fresh headless browser with its own throw-away profile (your browser and its saved settings are never touched), software GL,
// nothing uploaded (the site is only read). VIEWER_URL overrides the page (default: the live GitHub Pages Viewer).
// usage: NODE_PATH=~/bim-compiler/node_modules node viewer/tests/witness_json_4d5d_live.js
'use strict';
const path = require('path'), fs = require('fs'), os = require('os');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const URL0 = process.env.VIEWER_URL || 'https://red1oon.github.io/bim-ootb/viewer/viewer.html', N = 100, NEW_RATE = 4321, LAG = 7;
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + '  ' + m); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'json4d5d-live-'));
  const br = await puppeteer.launch({ headless: 'new', userDataDir: prof, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errs = [], logs = [];
  try {
    const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 900 });
    pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    pg.on('console', m => { const t = m.text(); if (/§RATE_OVERRIDE|§PROPSHEET_SAVE|§PROPSHEET_JSON_BAD|§JSON_/.test(t)) { logs.push(t); console.log('  ' + t.slice(0, 200)); } });
    const load = async () => { await pg.goto(URL0 + (URL0.indexOf('?') < 0 ? '?' : '&') + 'n=' + Date.now(), { waitUntil: 'load', timeout: 180000 });
      await pg.waitForFunction('typeof window.getRate === "function" && typeof window.loadJsonWithOverrides === "function" && typeof window._openSettingsPanel === "function"', { timeout: 180000 }); await sleep(1500); };
    // the Viewer page loads no rate pack by itself (rates.js: only boq_charts.html / mep_report.html call initRateTemplate): the user's path is Settings ▸ 5D Rate Pack, whose change loads the pack live
    // a Settings section header = div > span > [chevron, title]; its pointerup opens it (and builds its body the first time); already open = left open
    const openSection = async (title) => { await pg.evaluate(t => { const l = Array.from(document.querySelectorAll('span')).find(x => (x.textContent || '').trim() === t && x.parentElement && x.parentElement.parentElement && x.parentElement.firstChild && x.parentElement.firstChild.textContent === '\u25B6');
      if (!l) return; const hd = l.parentElement.parentElement, bd = hd.nextSibling; if (bd && (bd.style.maxHeight === '0px' || bd.style.maxHeight === '0')) hd.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); }, title); await sleep(600); };
    const pickPack = async (name) => { await pg.evaluate(() => window._openSettingsPanel()); await sleep(600); await openSection('5D Rate Pack');
      const done = await pg.evaluate(n => { const sel = Array.from(document.querySelectorAll('select')).find(x => Array.from(x.options).some(o => o.value === 'bcis2024_uk')); if (!sel) return false; sel.value = n; sel.dispatchEvent(new Event('change', { bubbles: true })); return true; }, name);
      if (done) await pg.waitForFunction(n => window.RATE_TEMPLATE_NAME === n, { timeout: 30000 }, name); await sleep(500); return done; };
    await load(); const builtin = await pg.evaluate(() => window.getRate('IfcWall'));
    const picked = await pickPack('cidb2024_my');
    const pack = await pg.evaluate(() => window.RATE_TEMPLATE_NAME), base = await pg.evaluate(n => ({ wall: window.getRate('IfcWall') * n, slab: window.getRate('IfcSlab') * n, door: window.getRate('IfcDoor') * n }), N);
    const tpl0 = await pg.evaluate(async () => (await window.loadJsonWithOverrides('rates/4D_template.json', 'json_4d_template')).dependencies.within_level[0].lag_days);
    console.log('  page=' + URL0 + ' picked=' + picked + ' pack=' + pack + ' IfcWall rate before any pick=' + builtin + ' (built-in) after=' + (base.wall / N) + ' calcCost(' + N + ') wall=' + base.wall + ' slab=' + base.slab + ' door=' + base.door + ' template lag[0]=' + tpl0);
    // open Settings ▸ Edit Project JSON ▸ <entry>, return the editor panel's id
    const openEntry = async (label) => {
      await pg.evaluate(() => window._openSettingsPanel()); await sleep(800);
      await openSection('Edit Project JSON');
      const hit = await pg.evaluate(l => { const r = Array.from(document.querySelectorAll('span')).find(s => (s.textContent || '').indexOf(l) === 0 && s.parentElement && /\u270E/.test(s.parentElement.textContent)); if (!r) return false; r.parentElement.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); return true; }, label);   // a hub row: label + the ✎ mark
      await sleep(1500); return hit; };
    // type into the field of row <rowId> (a JSON text field): replace with fn(JSON) and fire the editor's own change event
    const editJson = (rowId, fn) => pg.evaluate((rowId, src) => { const row = document.querySelector('[data-row-id="' + rowId + '"]'), inp = row && row.querySelector('input[type="text"]'); if (!inp) return 'no field';
      const v = JSON.parse(inp.value), f = new Function('v', src); inp.value = JSON.stringify(f(v)); inp.dispatchEvent(new Event('change', { bubbles: true })); return inp.value; }, rowId, fn);
    // ---- L1 + L2: the rate pack ----
    const o1 = await openEntry('5D Rate Pack');
    const t1 = await editJson('materials/IfcWall', 'v.rate = ' + NEW_RATE + '; return v;');
    const saved = await pg.evaluate(p => { try { return JSON.parse(localStorage.getItem('json_rates_' + p)).materials.IfcWall.rate; } catch (e) { return null; } }, pack);
    ok('L1 the 5D Rate Pack entry edits the active pack and saves it under json_rates_' + pack, o1 && saved === NEW_RATE, 'entry opened=' + o1 + ' field now ' + String(t1).slice(0, 60) + ' saved rate=' + saved);
    logs.length = 0; await load(); const beforePick = await pg.evaluate(() => window.getRate('IfcWall')); await pickPack(pack);
    console.log('  FINDING after a reload, before the pack is picked again, the Viewer prices IfcWall at ' + beforePick + ' (its built-in rate), not the pack\'s');
    const after = await pg.evaluate(n => ({ wall: window.getRate('IfcWall') * n, slab: window.getRate('IfcSlab') * n, door: window.getRate('IfcDoor') * n }), N), applied = logs.some(t => /§RATE_OVERRIDE pack=\S+ applied=1/.test(t));
    ok('L2 after a reload and the pack picked in Settings, the Viewer prices with it (calcCost = n x the typed rate), other classes unchanged', applied && after.wall === N * NEW_RATE && after.slab === base.slab && after.door === base.door,
      'applied=' + applied + ' wall ' + base.wall + ' -> ' + after.wall + ' (want ' + N * NEW_RATE + ') slab ' + base.slab + '=' + after.slab + ' door ' + base.door + '=' + after.door);
    // ---- L3: the 4D template ----
    const o3 = await openEntry('4D Schedule Template');
    const t3 = await editJson('dependencies/within_level', 'v[0].lag_days = ' + LAG + '; return v;');
    const s3 = await pg.evaluate(() => { try { return JSON.parse(localStorage.getItem('json_4d_template')).dependencies.within_level[0].lag_days; } catch (e) { return null; } });
    await load();
    const tpl1 = await pg.evaluate(async () => { const t = await window.loadJsonWithOverrides('rates/4D_template.json', 'json_4d_template'); return { lag: t.dependencies.within_level[0].lag_days, n: t.dependencies.within_level.length, pred: t.dependencies.within_level[0].pred, phases: t.phases.length }; });
    ok('L3 a lag edited in the template\'s dependencies is saved and is what the loader returns after a reload (the list stays objects)', o3 && s3 === LAG && tpl1.lag === LAG && typeof tpl1.pred === 'string' && tpl1.phases === 7,
      'entry opened=' + o3 + ' field ' + String(t3).slice(0, 50) + '… saved lag=' + s3 + ' loader lag ' + tpl0 + ' -> ' + tpl1.lag + ' deps=' + tpl1.n + ' pred=' + tpl1.pred + ' phases=' + tpl1.phases);
    // ---- L4: Reset both ----
    for (const label of ['5D Rate Pack', '4D Schedule Template']) { await openEntry(label);
      await pg.evaluate(l => { const b = Array.from(document.querySelectorAll('button,div,span')).find(e => (e.textContent || '').trim().indexOf('Reset ' + l) === 0 && e.offsetParent); if (b) { b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); b.click && b.click(); } }, label); await sleep(800); }
    const left = await pg.evaluate(p => ({ rate: localStorage.getItem('json_rates_' + p), tpl: localStorage.getItem('json_4d_template') }), pack);
    await load(); await pickPack(pack);
    const back = await pg.evaluate(async n => ({ wall: window.getRate('IfcWall') * n, lag: (await window.loadJsonWithOverrides('rates/4D_template.json', 'json_4d_template')).dependencies.within_level[0].lag_days }), N);
    ok('L4 Reset discards both copies: the shipped cost and lag are back after a reload', !left.rate && !left.tpl && back.wall === base.wall && back.lag === tpl0,
      'copies left rate=' + !!left.rate + ' tpl=' + !!left.tpl + ' wall ' + back.wall + ' (shipped ' + base.wall + ') lag ' + back.lag + ' (shipped ' + tpl0 + ')');
    ok('L0 no page errors from these steps', errs.length === 0, 'errors=' + errs.length + (errs.length ? ' ' + errs[0] : ''));
  } catch (e) { ok('L run', false, 'threw ' + String(e && e.stack || e).slice(0, 300)); }
  await br.close(); fs.rmSync(prof, { recursive: true, force: true });
  console.log('§W-JSON-4D5D-LIVE ' + (fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE') + ' judged=' + judged + ' fail=' + fails); process.exit(fails || !judged ? 1 : 0);
})();
