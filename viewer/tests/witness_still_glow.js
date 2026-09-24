// ⚠ DO NOT REMOVE — witness for §STILL_GLOW (bim-compiler PHOTOREAL_STILL_RENDER.md). Read the log after every run.
// Issue: night mode's window-glazing glow (not dimmed by shadow) hid the wing shadows on the Hospital courtyard
// facades in daylight Alt+S stills. Proves: at a daylight sun the glazing emissive is 0 during the still, at a dusk
// sun it is kept, fixtures are untouched, and after the still ends every glazing material is back where it was.
// Usage: node viewer/tests/witness_still_glow.js --port 8600 --elev 25 --tag day
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const arg = (k, d) => process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d;
const PORT = +arg('--port', 8600), ELEV = +arg('--elev', 25), TAG = arg('--tag', 'x');
const DB = arg('--db', '/buildings/Hospital_extracted.db');
const POSES = { courtyard: { pos: [-62, 38, -4], tgt: [-16, -2, -4] }, interior: JSON.parse(arg('--interior', 'null')) };
const POSE = POSES[arg('--pose', 'courtyard')];
const OUT = process.env.OUT || '/tmp/witness_still_glow'; fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, 'log_' + TAG + '.txt'); const lines = []; const T0 = Date.now();
function say(s) { const t = '+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s; lines.push(t); console.log(t); fs.writeFileSync(LOG, lines.join('\n')); }
(async () => {
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=gl-egl', '--window-size=1686,1044'] });
  const p = await b.newPage(); await p.setViewport({ width: 1666, height: 864 });
  p.on('console', m => { const t = m.text(); if (/§STILL_GLOW|§STILL_BASE|§STILL_POSE|§NIGHT_STILL_LIGHTS|§STILL_ROOMS|§STILL_STATUS stagingStart|§NIGHT_GLOW_REASSERT|PAGEERROR|§LOAD_FAIL/.test(t)) say('[page] ' + t.slice(0, 300)); });
  p.on('pageerror', e => say('PAGEERROR ' + e.message));
  await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=' + DB, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.APP && window.APP.cinemaPathPlan, { timeout: 180000 });
  try { await p.waitForFunction(() => { try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; } catch (e) { return false; } }, { timeout: 120000, polling: 2000 }); } catch (e) {}
  const blds = await p.evaluate(() => (window.APP.dbQuery('SELECT DISTINCT building FROM elements_meta') || []).map(r => r[0]));
  for (const bb of blds) { await p.evaluate(x => { try { window.APP.streamBuilding(x); } catch (e) {} }, bb);
    const want = await p.evaluate(x => { try { return window.APP.dbQuery("SELECT COUNT(*) FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid WHERE m.building='" + x + "'")[0][0]; } catch (e) { return 0; } }, bb);
    let n = 0; for (let i = 0; i < 300; i++) { n = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (want && n >= want) break; await sleep(2000); }
    say('streamed ' + bb + ' guids=' + n + '/' + want + (n >= want ? '' : ' VACUOUS — incomplete load, this arm proves nothing')); }
  await p.evaluate((P, el) => { const A = window.APP; A.camera.position.set(...P.pos); A.controls.target.set(...P.tgt); A.controls.update(); A.updateSky(el, 180); if (A.markDirty) A.markDirty(); }, POSE, ELEV);
  await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');   // the USER path (compiles rooms first)
  let ok = false; for (let i = 0; i < 400; i++) { const s = await p.evaluate(() => ({ a: !!window.APP._stillRefineActive, b: !!window.APP._stillRefineBusy })); if (s.a && !s.b) { ok = true; break; } await sleep(1000); }
  const stat = () => p.evaluate(() => { const g = window.APP._nightGlowMats || []; const w = g.filter(x => x.win !== false && x.glowE === 0xfff8ec); const f = g.filter(x => x.glowE === 0xffe4b5);
    return { glazing: w.length, glazingEI: [...new Set(w.map(x => +x.mat.emissiveIntensity.toFixed(3)))], fixtures: f.length, fixturesEI: [...new Set(f.map(x => +x.mat.emissiveIntensity.toFixed(3)))], nightMode: !!window.APP._nightMode, plScale: window.APP._nightPLScale, lampsLit: (window.APP._nightLights || []).filter(l => l.intensity > 0).length, lamps: (window.APP._nightLights || []).length }; });
  say('still ready=' + ok + ' DURING ' + JSON.stringify(await stat()));
  const png = await p.evaluate(() => { const A = window.APP; try { A._composer ? A._composer.render() : A.renderer.render(A.scene, A.camera); } catch (e) {} return A.renderer.domElement.toDataURL('image/png'); });
  fs.writeFileSync(path.join(OUT, 'still_' + TAG + '.png'), Buffer.from(png.split(',')[1], 'base64'));
  await p.evaluate(() => window.APP.toggleStillRefine()); await sleep(4000);
  say('AFTER_EXIT ' + JSON.stringify(await stat()));
  await b.close();
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
