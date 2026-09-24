// ⚠ DO NOT REMOVE — witness for §TRI_BIG_ONLY (bim-compiler PHOTOREAL_STILL_RENDER.md). Read the log after every run.
// Issue: rough triplanar maps land on small parts (doors, beams, plates). Proves the switch FIRES: with ?tri=big,
// during Alt+S every non-BIG triplanar material has uTriActive=0 and every BIG one 1; without it, all 1.
// Usage: node viewer/tests/witness_tri_big_only.js --port 8600 --tag on --url-extra '&tri=big'
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const arg = (k, d) => process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d;
const PORT = +arg('--port', 8600), TAG = arg('--tag', 'x'), EXTRA = arg('--url-extra', '');
const OUT = process.env.OUT || '/tmp/witness_tri_big_only'; fs.mkdirSync(OUT, { recursive: true }); const LOG = path.join(OUT, 'log_' + TAG + '.txt'); const lines = []; const T0 = Date.now();
function say(s) { const t = '+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s; lines.push(t); console.log(t); fs.writeFileSync(LOG, lines.join('\n')); }
(async () => {
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=gl-egl', '--window-size=1686,1044'] });
  const p = await b.newPage(); await p.setViewport({ width: 1666, height: 864 });
  p.on('console', m => { const t = m.text(); if (/§TRI_BIG_ONLY_TALLY|§TRI_SRC_TALLY|PAGEERROR|§LOAD_FAIL/.test(t)) say('[page] ' + t.slice(0, 1500)); });
  p.on('pageerror', e => say('PAGEERROR ' + e.message));
  await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=/buildings/Terminal_extracted.db' + EXTRA, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.APP && window.APP.cinemaPathPlan, { timeout: 180000 });
  try { await p.waitForFunction(() => { try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; } catch (e) { return false; } }, { timeout: 120000, polling: 2000 }); } catch (e) {}
  const blds = await p.evaluate(() => (window.APP.dbQuery('SELECT DISTINCT building FROM elements_meta') || []).map(r => r[0]));
  for (const bb of blds) { await p.evaluate(x => { try { window.APP.streamBuilding(x); } catch (e) {} }, bb);
    let prev = -1, st = 0; for (let i = 0; i < 90 && st < 3; i++) { const n = await p.evaluate(() => Object.keys(window.APP.guidMap).length); st = (n === prev && n > 0) ? st + 1 : 0; prev = n; await sleep(2000); } say('streamed ' + bb + ' guids=' + prev); }
  say('switch=' + await p.evaluate(() => window.APP._triBigOnly));
  await p.evaluate(() => window.APP.toggleStillRefine());
  let ok = false; for (let i = 0; i < 300; i++) { const s = await p.evaluate(() => ({ a: !!window.APP._stillRefineActive, b: !!window.APP._stillRefineBusy })); if (s.a && !s.b) { ok = true; break; } await sleep(1000); }
  say('still ready=' + ok);
  const act = await p.evaluate(() => { const r = { big: { on: 0, off: 0 }, small: { on: 0, off: 0 }, noShader: 0 };
    for (const m of (window.APP._triplanarMaterials || [])) { const sh = m._triplanarShader; if (!sh) { r.noShader++; continue; }
      const k = m.userData._triSmallPart ? 'small' : 'big'; if (sh.uniforms.uTriActive.value > 0.5) r[k].on++; else r[k].off++; } return r; });
  say('§TRI_BIG_ONLY_ACTIVE ' + JSON.stringify(act));
  const png = await p.evaluate(() => { const A = window.APP; try { A._composer ? A._composer.render() : A.renderer.render(A.scene, A.camera); } catch (e) {} return A.renderer.domElement.toDataURL('image/png'); });
  fs.writeFileSync(path.join(OUT, 'still_' + TAG + '.png'), Buffer.from(png.split(',')[1], 'base64')); say('wrote still_' + TAG + '.png');
  await b.close();
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
