#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §CIVIL_REF_LOOK (2026-10-06, bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §CIVIL_REF_LOOK)
// Scope: the BIM partner's EARTHWORK body + ROW solid must not hide the highway; the ground plane follows the earthworks
// terrain when the model has one and keeps today's rule when it has none. Read the log after every run.
//
// ISSUES THIS PROVES OR DISPROVES:
//  L1 "the earthworks solid obscures the main highway"   → every EARTHWORK material transparent, opacity 0.28, depthWrite off.
//  L2 "the ROW block obscures the highway"               → ROW material hidden AND an outline LineSegments (> 0 segments) in scene.
//  G1 "ground dropped 18.8 m after the merge"            → Merged.db: §GROUND_Y src=earthwork-bottom at the TRUE lowest earthworks
//                                                          vertex (oracle: sqlite3 CLI reads the vertex blob, not the viewer).
//  G0 "backward compat on a model without terrain"       → NOCOMPAT DB (no EARTHWORK): src=p2-bottom at the p2 of
//                                                          center_z − bbox_z/2 (oracle: sqlite3 CLI, same formula as Step 4).
// CAN REPORT ITS OWN FAILURE: INCONCLUSIVE (load failed / DB lacks EARTHWORK or ROW → vacuous), RED per check.
// Env: ROOT · BLD_DIR · DB (default Merged) · NOTERRAIN (default JELAPANG_AFTER) · GPU · PORT · LOG
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), { execFileSync } = require('child_process');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'Downloads', 'JALAN JELAPANG IFC');
const DB = process.env.DB || 'Merged', NOTERRAIN = process.env.NOTERRAIN || 'JELAPANG_AFTER';
const GPU = process.env.GPU || 'sw', PORT = +(process.env.PORT || 8579);
const LOG = process.env.LOG || '/tmp/witness_civil_ref_look.log';
const out = fs.createWriteStream(LOG, { flags: 'w' });
function log(l) { out.write(l + '\n'); console.log(l); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.sql': 'application/sql' };
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]); let fp = path.join(ROOT, u.replace(/^\/+/, ''));
  if (!fs.existsSync(fp) && u.startsWith('/buildings/')) fp = path.join(BLD_DIR, u.slice('/buildings/'.length));
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
  if (!fs.existsSync(fp)) { res.writeHead(404); res.end('404'); return; }
  const st = fs.statSync(fp); res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(res); } catch (e) { res.writeHead(500); res.end(String(e)); } });

const sq = (db, sql) => execFileSync('sqlite3', ['-readonly', db, sql], { maxBuffer: 1 << 30 }).toString().trim();
function oracleEarthBottom(db) {          // lowest TRUE vertex z over EARTHWORK elements (rotation x/y = 0)
  const rows = sq(db, "SELECT t.center_z || '|' || COALESCE(t.rotation_x,0) || '|' || COALESCE(t.rotation_y,0) || '|' || hex(g.vertices) FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid JOIN element_instances i ON i.guid=m.guid JOIN component_geometries g ON g.geometry_hash=i.geometry_hash WHERE m.discipline='EARTHWORK'");
  if (!rows) return null; let mn = Infinity;
  for (const line of rows.split('\n')) { const [cz, rx, ry, hx] = line.split('|'); if (+rx || +ry) continue;
    const b = Buffer.from(hx, 'hex'); for (let k = 8; k + 3 < b.length; k += 12) mn = Math.min(mn, +cz + b.readFloatLE(k)); }
  return isFinite(mn) ? mn : null;
}
function oracleP2(db) {
  const z = sq(db, 'SELECT center_z - COALESCE(bbox_z, 0) / 2 FROM element_transforms WHERE center_z IS NOT NULL ORDER BY 1').split('\n').map(Number);
  return z[Math.floor(z.length * 0.02)];
}

async function load(browser, name) {
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  const con = []; page.on('console', m => { const t = m.text(); con.push(t); out.write('[' + name + '] ' + t + '\n'); });
  page.on('pageerror', e => out.write('[' + name + '][pageerror] ' + e.message + '\n'));
  await page.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${name}.db`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.APP && window.APP.activeBuilding && window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming, { timeout: 1800000, polling: 1000 });
  let stable = 0; for (let i = 0; i < 300 && stable < 4; i++) { await new Promise(r => setTimeout(r, 1500));
    stable = (await page.evaluate(() => !!window.APP.streaming || (window.APP._mergePending || []).length > 0)) ? 0 : stable + 1; }
  if (await page.evaluate(() => typeof window.APP._calcGroundY === 'function')) await page.evaluate(() => window.APP._calcGroundY());
  return { page, con };
}
const lastGround = con => { const g = con.filter(t => /§GROUND_Y src=/.test(t)).pop(); const m = g && /src=(\S+) z=(-?[\d.]+)/.exec(g); return m ? { src: m[1], z: +m[2] } : null; };

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const gpuArgs = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] }[GPU] || [];
  const browser = await puppeteer.launch({ headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'crl-')), protocolTimeout: 30 * 60 * 1000, args: ['--no-sandbox', '--window-size=1300,840'].concat(gpuArgs) });
  const verdicts = {};
  try {
    const dbPath = path.join(BLD_DIR, DB + '.db'), ntPath = path.join(BLD_DIR, NOTERRAIN + '.db');
    const oEarth = oracleEarthBottom(dbPath), oP2 = oracleP2(ntPath);
    const ntEarth = +sq(ntPath, "SELECT COUNT(*) FROM elements_meta WHERE discipline='EARTHWORK'");
    log(`§CRL_ORACLE ${DB} earthwork_bottom=${oEarth == null ? 'none' : oEarth.toFixed(2)} · ${NOTERRAIN} earthwork_rows=${ntEarth} p2_bottom=${oP2.toFixed(2)}`);

    const A1 = await load(browser, DB);
    const r = await A1.page.evaluate(() => {
      const A = window.APP, metaSets = [A._batchMeta || {}, A._instanceMeta || {}, A._mergedMeta || {}];
      const ew = [], row = [];
      for (const ms of metaSets) for (const id in ms) { const o = A.scene.getObjectById(+id); if (!o) continue;
        const discs = new Set((ms[id] || []).map(e => e.disc));
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        if (discs.has('EARTHWORK')) mats.forEach(m => ew.push({ t: m.transparent, o: +m.opacity.toFixed(3), dw: m.depthWrite, mixed: discs.size }));
        if (discs.has('ROW')) mats.forEach(m => row.push({ vis: m.visible, mixed: discs.size })); }
      let outlines = 0, segs = 0; for (const g in (A._rowOutlines || {})) { const l = A._rowOutlines[g]; if (l.parent) { outlines++; segs += l.geometry.attributes.position.count / 2; } }
      return { ew, row, outlines, segs };
    });
    log('§CRL_LOOK ' + JSON.stringify(r));
    if (!r.ew.length) verdicts.L1 = 'INCONCLUSIVE no EARTHWORK mesh';
    else verdicts.L1 = r.ew.every(m => m.t && m.o === 0.28 && m.dw === false) ? 'GREEN' : 'RED';
    if (!r.row.length) verdicts.L2 = 'INCONCLUSIVE no ROW mesh';
    else verdicts.L2 = (r.row.every(m => m.vis === false) && r.outlines > 0 && r.segs > 0) ? 'GREEN' : 'RED';
    const g1 = lastGround(A1.con); log('§CRL_GROUND ' + DB + ' ' + JSON.stringify(g1));
    if (oEarth == null) verdicts.G1 = 'INCONCLUSIVE no EARTHWORK geometry';
    else verdicts.G1 = (g1 && g1.src === 'earthwork-bottom' && Math.abs(g1.z - oEarth) < 0.01) ? 'GREEN' : 'RED';
    await A1.page.close();

    const A2 = await load(browser, NOTERRAIN);
    const g0 = lastGround(A2.con); log('§CRL_GROUND ' + NOTERRAIN + ' ' + JSON.stringify(g0));
    if (ntEarth) verdicts.G0 = 'INCONCLUSIVE control DB has EARTHWORK';
    else verdicts.G0 = (g0 && g0.src === 'p2-bottom' && Math.abs(g0.z - oP2) < 0.01) ? 'GREEN' : 'RED';
  } catch (e) { log('§CRL_ERR ' + e.message); }
  const all = ['L1', 'L2', 'G1', 'G0'].map(k => k + '=' + (verdicts[k] || 'INCONCLUSIVE'));
  const v = all.every(s => s.endsWith('GREEN')) ? 'GREEN' : (all.some(s => /RED/.test(s)) ? 'RED' : 'INCONCLUSIVE');
  log('§CRL_VERDICT ' + v + ' ' + all.join(' '));
  await browser.close(); server.close(); out.end(); process.exit(v === 'GREEN' ? 0 : v === 'RED' ? 1 : 2);
})();
