#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-FLYTHRU-CUES scope (READ THE LOG after every run)
 * SCOPE: prompts/MEP_CLASH_REVEAL_MOVIE.md §11/§14 — does the baseline cue set actually BUILD and
 * PLACE against the real camera path? Cheap stand-in for a bake: no frames captured.
 * Console IS captured — the previous session's probe threw the §-log away and re-derived by hand.
 */
'use strict';
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.env.PORT || '8477';
const DUR = Number(process.env.DUR || 195.8);
(async () => {
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  const logs = [];
  p.on('console', m => { const t = m.text(); logs.push(t); if (/§FLYTHRU|§LOAD_FAIL|§ROOM_LENS|VACUOUS|INCONCLUSIVE/.test(t)) console.log('  ' + t); });
  p.on('pageerror', e => { logs.push('PAGEERROR ' + e.message); console.log('  PAGEERROR ' + e.message); });
  await p.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/Hospital_silent_local.db`,
    { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForFunction(() => window.APP && window.APP.cinemaPathPlan, { timeout: 240000 });
  const parts = await p.evaluate(() => (window.APP.dbQuery('SELECT DISTINCT building FROM elements_meta') || []).map(r => r[0]));
  console.log('§PROBE streaming ' + parts.length + ' building part(s)');
  for (const bb of parts) await p.evaluate(x => { try { window.APP.streamBuilding(x); } catch (e) {} }, bb);
  let stable = 0;
  for (let i = 0; i < 400; i++) {
    const st = await p.evaluate(() => (window.APP.status && window.APP.status.textContent) || '');
    const m = st.match(/([\d,]+)\s*\/\s*([\d,]+)/);
    if (!m || m[1].replace(/,/g, '') === m[2].replace(/,/g, '')) { if (++stable >= 4) break; } else stable = 0;
    await sleep(3000);
  }
  await sleep(4000);
  console.log('§PROBE stream settled — building cues');
  const out = await p.evaluate((dur) => {
    const A = window.APP;
    const R = { has: { build: !!A.flythruCuesBuild, rooms: typeof A.allRoomVolumes === 'function',
                       maths: !!window.FlythruMaths, raster: !!window.StoreyRaster, windows: !!A.flythruPathWindows } };
    let plan = null;
    try { plan = A.cinemaPathPlan(dur); } catch (e) { R.planErr = e.message; }
    R.planOk = !!(plan && typeof plan.poseAt === 'function');
    try { R.cues = (A.flythruCuesBuild(plan, dur) || []).map(c => ({ key: c.key, at: Number(c.at.toFixed(2)), label: c.label })); }
    catch (e) { R.buildErr = e.message; }
    // sample the visual at each cue's mid-hold to prove it turns on
    R.visual = [];
    if (R.cues) for (const c of R.cues) {
      try { R.visual.push({ key: c.key, mid: A.flythruCuesApplyVisual(c.at + 1.1) }); } catch (e) { R.visual.push({ key: c.key, err: e.message }); }
    }
    try { R.offSlot = A.flythruCuesApplyVisual(0.0); } catch (e) {}
    return R;
  }, DUR);
  console.log('\n§FLYTHRU_PLACE_RESULT ' + JSON.stringify(out, null, 1));
  await b.close();
})().catch(e => { console.error('PROBE FAILED ' + e.message); process.exit(1); });
