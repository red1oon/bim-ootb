#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §ALTC_LABELS (2026-10-06, bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §ALTC_LABELS). No bake.
// Read the log after every run — the exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES (trial road film, user 2026-10-05): building rule cards ("Structural — floating member 68"),
// a "Building Envelope" cue and clash tags "Misc Element" appeared on the ROAD. GREEN = JELAPANG: rule film VACUOUS with
// stats.built false (no rule cards, no "structural issues" HUD card), envelope cue titled "Site Envelope", every civil
// discipline's clash name = its SEQUENCE_CIVIL phase while the class name alone would have been "Misc Element"; Duplex: rule
// film NOT road-VACUOUS, envelope "Building Envelope", civilNameFor null for every Duplex discipline.
// CAN REPORT ITS OWN FAILURE: INCONCLUSIVE (load failed / no civil discipline judged), RED CONTROL.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const { Witness } = require('../../witness_kit/contract');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const BLD = process.env.BLD || 'JELAPANG_AFTER';
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'Downloads', 'JALAN JELAPANG IFC');
const GPU = process.env.GPU || 'sw';
const PORT = +(process.env.PORT || 8581);
const LOG = process.env.LOG || '/tmp/witness_altc_labels.log';
const logStream = fs.createWriteStream(LOG, { flags: 'w' });
function log(l) { logStream.write(l + '\n'); console.log(l); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.png': 'image/png', '.svg': 'image/svg+xml', '.hdr': 'application/octet-stream', '.gz': 'application/gzip', '.webp': 'image/webp', '.woff2': 'font/woff2', '.sql': 'application/sql', '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]); let fp = path.join(ROOT, u.replace(/^\/+/, ''));
  if (!fs.existsSync(fp) && u.startsWith('/buildings/')) fp = path.join(BLD_DIR, u.slice('/buildings/'.length));
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
  if (!fs.existsSync(fp)) { res.writeHead(404); res.end('404'); return; }
  const st = fs.statSync(fp); res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(res); } catch (e) { res.writeHead(500); res.end(String(e)); } });

async function probe(browser, bld) {
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('console', m => { const t = m.text(); logStream.write('[con:' + bld + '] ' + t + '\n'); if (/§(RULE_FILM |CLASH_LABEL_NAME|FLYTHRU_CUES)/.test(t)) console.log('  [' + bld + '] ' + t.slice(0, 260)); });
  page.on('pageerror', e => logStream.write('[pageerror] ' + e.message + '\n'));
  await page.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${bld}.db`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.APP && window.APP.activeBuilding && window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming && (!window.APP.isCivilModel() || window.APP._civilLabels), { timeout: 1800000, polling: 1000 });
  return page.evaluate(async () => {
    const A = window.APP, plan = A.cinemaPathPlan(60);
    let rep = null; try { rep = await A.ruleFindingsFilmBuild(A.dbQuery, plan); } catch (e) { rep = { state: 'THREW', why: e.message }; }
    const st = A.ruleFindingsFilm && A.ruleFindingsFilm.stats ? A.ruleFindingsFilm.stats() : null;
    const cues = A.flythruCuesBuild ? (A.flythruCuesBuild(plan, plan.naturalTotal || 60) || []) : [];
    const env = cues.filter(c => c.key === 'envelope')[0];
    const discs = A.dbQuery('SELECT DISTINCT discipline FROM elements_meta').map(r => r[0]);
    const SC = window.SEQUENCE_CIVIL || {};
    const names = discs.map(d => ({ d, civil: A.clashLabels.civilNameFor(d), want: SC[d] ? SC[d].phase : null }));
    return { civil: A.isCivilModel(), ruleState: rep && rep.state, ruleWhy: rep && rep.why, statsBuilt: !!(st && st.built), envTitle: env ? env.title : null,
      envLabel: env ? String(env.label).slice(0, 60) : null, names, proxyName: A.clashLabels.semanticName('IfcBuildingElementProxy').name };
  });
}
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const gpuArgs = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] }[GPU] || [];
  const browser = await puppeteer.launch({ headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'alw-profile-')), protocolTimeout: 30 * 60 * 1000, args: ['--no-sandbox', '--window-size=1300,840'].concat(gpuArgs) });
  const R = {};
  try { R.road = await probe(browser, BLD); log('§ALW_ROAD ' + JSON.stringify(R.road)); R.bld = await probe(browser, 'Duplex_extracted'); log('§ALW_BLD ' + JSON.stringify(R.bld)); }
  catch (e) { log('§ALW verdict=INCONCLUSIVE reason=' + e.message); R.err = e.message; process.exitCode = 2; }
  finally { await browser.close(); server.close(); }
  if (R.err) { logStream.end(); return; }
  Witness('altc_labels')
    .population(() => [R])
    .schema({ type: 'object', required: ['road', 'bld'] })
    .invariant('road: civil model, ≥ 1 civil discipline judged (else nothing judged)', rs => rs.every(r => r.road.civil && r.road.names.some(n => n.want)))
    .invariant('road: rule film VACUOUS (road model) and no rule stats built → no rule cards / structural HUD card', rs => rs.every(r => r.road.ruleState === 'VACUOUS' && /road model/.test(r.road.ruleWhy || '') && !r.road.statsBuilt))
    .invariant('road: envelope cue titled "Site Envelope"', rs => rs.every(r => r.road.envTitle === 'Site Envelope' && /^Site Envelope/.test(r.road.envLabel)))
    .invariant('road: every civil discipline named by its SEQUENCE_CIVIL phase; non-civil discipline → null', rs => rs.every(r => r.road.names.every(n => n.civil === n.want)))
    .invariant('road: without the fix the class name alone reads "Misc Element" (the defect is real)', rs => rs.every(r => r.road.proxyName === 'Misc Element'))
    .invariant('building (Duplex): rule film not road-VACUOUS, envelope "Building Envelope", no civil names', rs => rs.every(r => !r.bld.civil && !/road model/.test(r.bld.ruleWhy || '') && r.bld.envTitle === 'Building Envelope' && r.bld.names.every(n => n.civil === null)))
    .redControl(rs => rs.map(r => Object.assign({}, r, { road: Object.assign({}, r.road, { envTitle: 'Building Envelope' }) })))
    .run();
  logStream.end();
})();
