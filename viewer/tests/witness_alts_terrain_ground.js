#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §ALTS_CIVIL_TERRAIN_GROUND (2026-10-06, bim-compiler prompts/PHOTOREAL_STILL_RENDER.md). Read the log after every run.
// ISSUE THIS PROVES OR DISPROVES: "Alt+S on a road model with its own terrain draws a second, default ground ~30 m under the road, seen
// through the see-through earthworks, with puddles on it". GREEN (terrain DB): during Alt+S every EARTHWORK material is opaque with depthWrite
// on; puddles = 0 (reason=terrain); the default plane sits at the body's TRUE lowest vertex (sqlite oracle, ±0.05 m) so no terrain surface is
// below it; after Alt+S off the materials are back to 0.28 see-through. Building DB (Duplex): no terrain line, puddles > 0 — unchanged.
// CAN REPORT ITS OWN FAILURE: INCONCLUSIVE (load / Alt+S did not stage), RED per check.
// Env: ROOT · TERRAIN_DB (default ~/Downloads/JALAN JELAPANG IFC/CivilWorks.db) · BUILDING_DB (default ~/bim-ootb/buildings/Duplex_extracted.db) · PORT · LOG
// Issue under test (user 2026-10-06, Merged.db): (a) the partner's new elements (GEOTECH/CHAINAGE/GABION/
// EARTHWORK/ROW) are not seen although Find lists CHAINAGE; (b) the older building (Jelapang VBC) shows no
// bbox wireframe. DB is proven complete (read-only SQL) → this measures what the VIEWER registers/draws.
// Reports per discipline: DB rows vs elements registered in a drawn mesh vs visible; ghost-box counts per disc.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const TERRAIN_DB = process.env.TERRAIN_DB || path.join(os.homedir(), 'Downloads', 'JALAN JELAPANG IFC', 'CivilWorks.db');
const BUILDING_DB = process.env.BUILDING_DB || path.join(os.homedir(), 'bim-ootb', 'buildings', 'Duplex_extracted.db');
const PORT = +(process.env.PORT || 8621);
const LOG = process.env.LOG || '/tmp/witness_alts_terrain_ground.log';
const out = fs.createWriteStream(LOG, { flags: 'w' });
const log = l => { out.write(l + '\n'); console.log(l); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.sql': 'application/sql' };
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]); let fp = path.join(ROOT, u.replace(/^\/+/, ''));
  if (u === '/__terrain.db') fp = TERRAIN_DB; else if (u === '/__building.db') fp = BUILDING_DB;
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
  if (!fs.existsSync(fp)) { res.writeHead(404); res.end('404'); return; }
  const st = fs.statSync(fp); res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(res); } catch (e) { res.writeHead(500); res.end(String(e)); } });


const { execFileSync } = require('child_process');
function oracleBottom(db) {   // the earthworks body's TRUE lowest vertex (center_z + local min z) — read from sqlite, not the viewer
  const r = execFileSync('sqlite3', ['-readonly', db, "SELECT t.center_z || '|' || hex(g.vertices) FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid JOIN element_instances i ON i.guid=m.guid JOIN component_geometries g ON g.geometry_hash=i.geometry_hash WHERE m.discipline='EARTHWORK'"], { maxBuffer: 1 << 30 }).toString().trim();
  if (!r) return null; let mn = Infinity;
  for (const line of r.split('\n')) { const [cz, hx] = line.split('|'); const b = Buffer.from(hx, 'hex'); for (let k = 8; k + 3 < b.length; k += 12) mn = Math.min(mn, +cz + b.readFloatLE(k)); }
  return mn;
}
async function run(browser, url, tag) {
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  const con = []; page.on('console', m => { const t = m.text(); con.push(t); out.write('[' + tag + '] ' + t + '\n'); });
  page.on('pageerror', e => out.write('[' + tag + '][pageerror] ' + e.message + '\n'));
  page.on('response', r => { if (r.status() >= 400) out.write('[' + tag + '][http ' + r.status() + '] ' + r.url() + '\n'); });
  await page.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=${url}&photoseed=0.25`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.APP && window.APP.activeBuilding && window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming, { timeout: +(process.env.LOAD_MS || 1800000), polling: 1000 });
  let stable = 0; for (let i = 0; i < 300 && stable < 4; i++) { await new Promise(r => setTimeout(r, 1500)); stable = (await page.evaluate(() => !!window.APP.streaming || (window.APP._mergePending || []).length > 0)) ? 0 : stable + 1; }
  const mats = () => page.evaluate(() => { const mc = window.APP._matCache || {}, o = []; for (const k in mc) if (k.split('|')[3] === 'EARTHWORK') o.push({ op: mc[k].opacity, tr: mc[k].transparent, dw: mc[k].depthWrite }); return o; });
  const before = await mats();
  await page.evaluate(() => window.APP.startStillRefine());
  for (let i = 0; i < 120 && !con.some(t => /§PHOTO_PAINT_SEED/.test(t)); i++) await new Promise(r => setTimeout(r, 1000));
  await new Promise(r => setTimeout(r, 2000));
  const during = await mats();
  const plane = await page.evaluate(() => ({ vis: !!(window.APP.ground && window.APP.ground.visible), ifcZ: window.APP.groundIfcZ }));
  await page.evaluate(() => window.APP.stopStillRefine(true));
  await new Promise(r => setTimeout(r, 1500));
  const after = await mats();
  const seed = con.filter(t => /§PHOTO_PAINT_SEED/.test(t)).pop() || '';
  const pud = /puddles=(\d+)/.exec(seed); await page.close();
  return { before, during, after, plane, puddles: pud ? +pud[1] : null, terrainLine: con.some(t => /§ALTS_TERRAIN_GROUND earthworkMats=/.test(t)), staged: !!seed };
}
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({ headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'atg-')), protocolTimeout: 30 * 60 * 1000,
    args: ['--no-sandbox', '--window-size=1300,840', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const v = {};
  try {
    const bottom = oracleBottom(TERRAIN_DB); log('§ATG_ORACLE terrain bottom=' + (bottom == null ? 'none' : bottom.toFixed(2)));
    const T = await run(browser, '/__terrain.db', 'terrain'); log('§ATG_TERRAIN ' + JSON.stringify(T));
    if (!T.staged || !T.during.length) v.terrain = 'INCONCLUSIVE staged=' + T.staged + ' earthworkMats=' + T.during.length;
    else {
      const opaque = T.during.every(m => m.op === 1 && !m.tr && m.dw), restored = T.after.every((m, i) => m.op === T.before[i].op && m.tr === T.before[i].tr && m.dw === T.before[i].dw);
      const planeOk = T.plane.vis && bottom != null && Math.abs(T.plane.ifcZ - bottom) < 0.05;
      v.terrain = (opaque && restored && planeOk && T.puddles === 0 && T.terrainLine) ? 'GREEN' : 'RED opaque=' + opaque + ' restored=' + restored + ' planeOk=' + planeOk + ' puddles=' + T.puddles + ' line=' + T.terrainLine;
    }
    const B = await run(browser, '/__building.db', 'building'); log('§ATG_BUILDING ' + JSON.stringify(B));
    v.building = !B.staged ? 'INCONCLUSIVE not staged' : (!B.terrainLine && B.puddles > 0 && B.during.length === 0) ? 'GREEN' : 'RED line=' + B.terrainLine + ' puddles=' + B.puddles;
  } catch (e) { log('§ATG_ERR ' + e.message); }
  const all = ['terrain', 'building'].map(k => k + '=' + (v[k] || 'INCONCLUSIVE'));
  const verdict = all.every(s => /GREEN/.test(s)) ? 'GREEN' : all.some(s => /RED/.test(s)) ? 'RED' : 'INCONCLUSIVE';
  log('§ATG_VERDICT ' + verdict + ' ' + all.join(' '));
  await browser.close(); server.close(); out.end(); process.exit(verdict === 'GREEN' ? 0 : verdict === 'RED' ? 1 : 2);
})();
