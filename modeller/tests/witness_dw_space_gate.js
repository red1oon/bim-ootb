#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DW-SPACE-GATE
 * SCOPE: bim-compiler prompts/FUNCTIONAL_SPACES_ENSEMBLE.md §SPACE-GATE (2026-07-13) — the
 * no-MEP-outside-space refuse gate (disc_walker.js spaceGate(), wired into every dwWalk
 * placement path; scene half of the envelope from modeller.html _dwSceneEnvelope()).
 * ISSUE THIS WITNESS PROVES/DISPROVES: does the gate refuse EXACTLY the measured
 * floating-outside-structure strata and NOTHING else? Branch-measured baseline
 * (logs/wdwsb_GATE_BEFORE.log, fix/samplecastle-spatial-carry):
 *   - SampleHouse: 38 placed, 14 bad (13 Roof|side z=4.11 + 1 Ground Floor|float z=5.23,
 *     real structural top 3.475) → expect refused=14, placed=24, scene aboveRoof=0.
 *   - HHS: 722 placed, 177 bad (Ceiling Level 02 z=11.01 vs real top 10.789)
 *     → expect refused=177, placed=545, aboveRoof=0.
 *   - ZERO-REGRESSION legs (all measured aboveRoof=0 BEFORE): Duplex 102, SampleCastle 325
 *     (incl the 23 legit dak|side z=13.24 the DB-centers-only envelope would false-refuse —
 *     this witness is what proves the union envelope keeps them), Terminal 896 (scene-absent
 *     → DB-centers fallback), Clinic 406, HospitalGarage 2756, Hospital 3190 → refused=0,
 *     placed unchanged.
 * METRIC: §DW-SPACEGATE console line per building (checked/kept/refused) + the same scene
 * point-to-AABB aboveRoof sweep witness_dw_storey_band.js measures (skipped where the scene
 * has no structural meshes, e.g. Terminal — reported SCENE-SKIP, count assertions still run).
 * Read the log after every run — exit code alone is not evidence.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); }); });

// Branch-measured BEFORE baseline (logs/wdwsb_GATE_BEFORE.log) — placedBefore & expected refusals.
const EXPECT = {
  SampleHouse:    { before: 38,   refuse: 14  },
  HHS:            { before: 722,  refuse: 177 },
  Duplex:         { before: 102,  refuse: 0   },
  SampleCastle:   { before: 325,  refuse: 0   },
  Terminal:       { before: 896,  refuse: 0   },
  Clinic:         { before: 406,  refuse: 0   },
  HospitalGarage: { before: 2756, refuse: 0   },
  Hospital:       { before: 3190, refuse: 0   }
};

async function runOne(pg, key, consoleLines) {
  console.log(`\n═══ ${key} ═══`);
  const mark = consoleLines.length;
  await pg.click('#b-open'); await sleep(200);
  await pg.click(`#m-open-panel .mo-row[data-key="${key}"]`);
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai', { timeout: 60000 }).catch(() => {});
  await sleep(4000);
  await pg.evaluate((b) => window.discWalk('ELEC', { building: b }), key);
  const walked = await pg.waitForFunction((d) => window.__dwLastCommitDisc === d, { timeout: 180000, polling: 250 }, 'ELEC').then(() => true).catch(() => false);
  await sleep(1000);

  const r = await pg.evaluate(() => {
    const g = window.Bonsai.group();
    const O = window.Bonsai.oplog;
    const fixtureOpIds = new Set();
    O._geomOps().forEach(o => { if (o.op_type === 'GEOM_INSERT' && o.parameters && (o.parameters._dw != null || (o.parameters._rw && o.parameters._rw.fixture === true))) fixtureOpIds.add(o.id); });
    const dwRoot = g.children.find(o => o.userData && o.userData.dwRoot);
    let zmax = -Infinity, boxes = 0;
    g.children.forEach(o => {
      if (o === dwRoot || !o.isMesh || fixtureOpIds.has(o.userData.featureId)) return;
      const b = new window.THREE.Box3().setFromObject(o);
      if (!isFinite(b.max.z)) return;
      boxes++; if (b.max.z > zmax) zmax = b.max.z;
    });
    const pls = (window.__dwWalks && window.__dwWalks.ELEC) || [];
    const aboveRoof = boxes ? pls.filter(p => p.z > zmax).length : null;   // null = SCENE-SKIP
    return { placed: pls.length, structBoxes: boxes, structZmax: boxes ? +zmax.toFixed(3) : null, aboveRoof };
  });
  // gate numbers from the §DW-SPACEGATE console line(s) this building's walk emitted (last wins —
  // a schedule-path walk that yields 0 falls through to the legacy walk which gates again).
  let gate = null;
  for (let i = consoleLines.length - 1; i >= mark; i--) {
    const m = consoleLines[i].match(new RegExp('§DW-SPACEGATE disc=ELEC bldg=' + key + ' checked=(\\d+) kept=(\\d+) refused=(\\d+)'));
    if (m) { gate = { checked: +m[1], kept: +m[2], refused: +m[3] }; break; }
  }
  const exp = EXPECT[key];
  const sceneTxt = r.aboveRoof == null ? 'SCENE-SKIP (structBoxes=0)' : ('aboveRoof=' + r.aboveRoof + ' structZmax=' + r.structZmax);
  console.log(`§DWSG-${key} committed=${r.placed} gate=${gate ? gate.checked + '→' + gate.kept + ' refused=' + gate.refused : 'NO-LINE'} ${sceneTxt}`);
  const pass = walked && gate
    && gate.refused === exp.refuse
    && gate.checked === exp.before
    && r.placed === exp.before - exp.refuse
    && (r.aboveRoof == null || r.aboveRoof === 0);
  console.log(`§DWSG-${key} ${pass ? 'PASS' : 'FAIL'} (expect before=${exp.before} refuse=${exp.refuse} → placed=${exp.before - exp.refuse})`);
  return pass;
}

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1400, height: 950, deviceScaleFactor: 2 });
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  const consoleLines = [];
  pg.on('console', m => { const t = m.text(); consoleLines.push(t);
    if (/§(DW|WALK|SCHED|DISC|DIAG)/.test(t)) console.log('  [pg] ' + t); });
  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai && typeof window.discWalk==="function"', { timeout: 30000 }).catch(() => {});

  const keys = (process.env.DWSG_BUILDINGS || Object.keys(EXPECT).join(',')).split(',').map(s => s.trim()).filter(Boolean);
  const results = {};
  for (let i = 0; i < keys.length; i++) {
    if (i > 0) {
      await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
      await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai && typeof window.discWalk==="function"', { timeout: 30000 }).catch(() => {});
    }
    results[keys[i]] = await runOne(pg, keys[i], consoleLines);
  }
  const allPass = keys.every(k => results[k]);
  console.log('\nerrors=' + errs.length + (errs.length ? ' ' + JSON.stringify(errs) : ''));
  console.log('W-DW-SPACE-GATE ' + (allPass ? 'PASS' : 'FAIL') + ' — ' + keys.map(k => k + '=' + (results[k] ? 'PASS' : 'FAIL')).join(' '));
  await br.close(); server.close();
  process.exit(allPass && errs.length === 0 ? 0 : 1);
})();
