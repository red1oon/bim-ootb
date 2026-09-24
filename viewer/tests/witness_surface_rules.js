// ⚠ DO NOT REMOVE — witness for §SURFACE_RULES (bim-compiler PHOTOREAL_STILL_RENDER.md). Read the log after every run.
// Issue: rough triplanar maps on everything (floors, beams, doors, MEP). Proves the ?surf=rules switch FIRES:
// the roof-layer test, per-row / per-class tallies, colour counts, and that the ONLY textured materials are
// rows R1-R3 (roof, exposed concrete). With ?surf=off the rules must not run (no §SURFACE_ lines).
// Usage: node viewer/tests/witness_surface_rules.js --port 8600 --db /buildings/Terminal_extracted.db [--off]
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const arg = (k, d) => process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d;
const PORT = +arg('--port', 8600), DB = arg('--db', '/buildings/Terminal_extracted.db'), OFF = process.argv.includes('--off');
const OUT = process.env.OUT || '/tmp/witness_surface_rules'; fs.mkdirSync(OUT, { recursive: true });
const TAG = path.basename(DB, '.db') + (OFF ? '_off' : '_rules');
const LOG = path.join(OUT, 'log_' + TAG + '.txt'); const lines = []; const T0 = Date.now();
function say(s) { const t = '+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s; lines.push(t); console.log(t); fs.writeFileSync(LOG, lines.join('\n')); }
(async () => {
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=gl-egl'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  p.on('console', m => { const t = m.text(); if (/§SURFACE_|PAGEERROR|§LOAD_FAIL|§TRI_SRC_TALLY/.test(t)) say('[page] ' + t.slice(0, 2500)); });
  p.on('pageerror', e => say('PAGEERROR ' + e.message));
  await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=' + DB + (OFF ? '&surf=off' : ''), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.APP && window.APP.cinemaPathPlan, { timeout: 180000 });
  try { await p.waitForFunction(() => { try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; } catch (e) { return false; } }, { timeout: 120000, polling: 2000 }); } catch (e) {}
  const blds = await p.evaluate(() => (window.APP.dbQuery('SELECT DISTINCT building FROM elements_meta') || []).map(r => r[0]));
  for (const bb of blds) { await p.evaluate(x => { try { window.APP.streamBuilding(x); } catch (e) {} }, bb);
    let prev = -1, st = 0; for (let i = 0; i < 120 && st < 3; i++) { const n = await p.evaluate(() => Object.keys(window.APP.guidMap).length); st = (n === prev && n > 0) ? st + 1 : 0; prev = n; await sleep(2000); } say('streamed ' + bb + ' guids=' + prev); }
  const act = await p.evaluate(() => { const r = { textured: {}, allRows: {} }; const seen = new Set();
    for (const m of (window.APP._triplanarMaterials || [])) { const k = m.userData._surfRow || '(none)'; r.textured[k] = (r.textured[k] || 0) + 1; }
    window.APP.scene.traverse(o => { const m = o.material; if (!m || seen.has(m)) return; seen.add(m); const k = (m.userData && m.userData._surfRow) || '(none)'; r.allRows[k] = (r.allRows[k] || 0) + 1; });
    return { switch: window.APP._surfRules, ...r }; });
  say('§SURFACE_RULES_ACTIVE ' + JSON.stringify(act));
  await b.close();
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
