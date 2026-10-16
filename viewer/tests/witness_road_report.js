#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §ROAD_REPORT (2026-10-08, bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §ROAD_REPORT). No bake.
// Read the log after every run — the exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: is every line of The Road Report a measured, sourced fact (nothing typed by hand), do the
// dashboard, the .txt and the PDF say the same thing, and does R open it ONLY on a road model?
// GREEN = (1) R on the road model opens the panel; sections in the user's order · (2) drift lines == own severity classification of
// every chainage interval by the std cut-offs (count + per-interval) · (3) grade stretches == own chord recompute on the 1 m road
// profile vs each zone's ATJ max (count, s0, s1, max grade ±0.05) and the HEALTHY metres == own · (4) earthworks stretches == own
// cut/fill recompute · (5) sign HEALTHY "x of N" == own DB query · (6) environment line NOT CHECKED with own pset query == 0 ·
// (7) .txt and PDF hold exactly the dashboard's lines per section · (8) clicking a chainage line puts the camera on the route at
// that s (±1 m) · (9) R on Duplex: no report, Room Cycle ran (§ROOM_CYCLE) · RED: a cut-off change flips a drift line's severity.
// CAN REPORT ITS OWN FAILURE: INCONCLUSIVE (load failed / no lines), VACUOUS (Duplex), RED CONTROL.
// Env: GPU=real|sw (default sw), BLD, BLD_DIR, DUP_DIR, PORT, LOG.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const { Witness } = require('../../witness_kit/contract');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const BLD = process.env.BLD || 'CivilWorksPath';
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'Downloads', 'JALAN JELAPANG IFC');
const DUP_DIR = process.env.DUP_DIR || '/home/red1/bim-compiler/deploy/buildings';
const GPU = process.env.GPU || 'sw';
const PORT = +(process.env.PORT || 8594);
const LOG = process.env.LOG || '/tmp/witness_road_report.log';
const logStream = fs.createWriteStream(LOG, { flags: 'w' });
const _cl = console.log.bind(console);
function log(l) { logStream.write(l + '\n'); _cl(l); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]); let fp = path.join(ROOT, u.replace(/^\/+/, ''));
  if (u.startsWith('/buildings/')) { const n = u.slice('/buildings/'.length); fp = fs.existsSync(path.join(BLD_DIR, n)) ? path.join(BLD_DIR, n) : path.join(DUP_DIR, n); }
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  const st = fs.statSync(fp); res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(res); } catch (e) { res.writeHead(500); res.end(String(e)); } });
const STD = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'std_values.json'), 'utf8'));
const RR = STD._road_report || {};
const ORDER = ['align', 'earth', 'geo', 'signs', 'env'];

// ── own recomputes (not the engine's code) ──
function ownGrade(road, ds, zones, win) {
  const step = Math.round(win / ds), runs = []; let okM = 0, judged = 0, run = null;
  const zAt = s => zones.find(z => !z.offRoute && s >= z.s0 - 1e-9 && s < z.s1 - 1e-9);
  for (let i = 0; i + step < road.length; i++) {
    const a = road[i], b = road[i + step]; if (a == null || b == null || Number.isNaN(a) || Number.isNaN(b)) { run = null; continue; }
    const z = zAt(i * ds + win / 2); if (!z || z.max == null) { run = null; continue; }
    judged++; const g = Math.abs(b - a) / win * 100;
    if (g > z.max) { if (run && run.zone === z.id && run.last === i - 1) { run.last = i; run.s1 = i * ds + win; run.maxG = Math.max(run.maxG, g); } else { run = { zone: z.id, s0: i * ds, s1: i * ds + win, last: i, maxG: g }; runs.push(run); } }
    else { okM++; run = null; }
  }
  return { runs, okM, judged };
}
function ownEarth(road, ground, ds, minLen) {
  const out = []; let cur = null;
  const close = () => { if (cur && cur.s1 - cur.s0 >= minLen) out.push(cur); cur = null; };
  for (let i = 0; i < road.length; i++) { const r = road[i], g = ground[i];
    if (r == null || g == null || Number.isNaN(r) || Number.isNaN(g)) { close(); continue; }
    const k = r - g < 0 ? 'cut' : 'fill';
    if (cur && cur.k === k && cur.last === i - 1) { cur.last = i; cur.s1 = i * ds; cur.max = Math.max(cur.max, Math.abs(r - g)); } else { close(); cur = { k, s0: i * ds, s1: i * ds, last: i, max: Math.abs(r - g) }; } }
  close(); return out;
}

async function open(browser, bld) {
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('console', m => { const t = m.text(); logStream.write('[con:' + bld + '] ' + t + '\n'); if (/§ROAD_REPORT(?!_LINE)|§ROOM_CYCLE|§CHAINAGE_AUTO_READ/.test(t)) _cl('  [' + bld + '] ' + t.slice(0, 220)); });
  page.on('pageerror', e => logStream.write('[pageerror] ' + e.message + '\n'));
  await page.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${bld}.db`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.APP && window.APP.activeBuilding && window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming, { timeout: 25 * 60 * 1000, polling: 1000 });
  return page;
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const gpuArgs = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] }[GPU] || [];
  const browser = await puppeteer.launch({ headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'rr-profile-')), protocolTimeout: 30 * 60 * 1000, args: ['--no-sandbox', '--window-size=1280,720', ...gpuArgs] });
  const R = { gpu: GPU };
  try {
    const pr = await open(browser, BLD);
    for (let i = 0; i < 60; i++) { if (await pr.evaluate(() => !!(window.APP.civilChainReal && window.APP.civilChainReal()))) break; await new Promise(r => setTimeout(r, 500)); }
    await pr.evaluate(() => document.body.focus());
    await pr.keyboard.press('r');
    await pr.waitForFunction(() => !!document.getElementById('road-report-panel') && !!window.APP._roadReport, { timeout: 10 * 60 * 1000, polling: 500 });
    R.road = await pr.evaluate(async () => {
      const A = window.APP, rep = A._roadReport, pan = document.getElementById('road-report-panel');
      const std = await (await fetch('std_values.json?v=3')).json(), C = A.chainage.read(std), P = A.civilProfile(), SZ = A._speedZones;
      const out = { lines: rep.lines.map(l => Object.assign({}, l)), counts: rep.counts };
      out.dom = [...pan.querySelectorAll('.rr-sec')].map(d => ({ sec: d.dataset.sec, lines: [...d.querySelectorAll('.rr-line')].map(e => ({ sev: e.dataset.sev, text: e.textContent.replace(/^(CRITICAL|WARNING|HEALTHY|INFO|NOT CHECKED) /, '') })) }));
      out.chips = [...pan.querySelectorAll('.rr-chip')].map(e => e.textContent);
      out.title = (pan.querySelector('.rr-title') || {}).textContent; out.txt = A._roadReportText;
      const pdf = new DOMParser().parseFromString(window.RoadReport.pdfHTML(rep, std, 'm', 'd'), 'text/html');
      out.pdf = [...pdf.querySelectorAll('h2')].map(h => { const ls = []; let n = h.nextElementSibling; while (n && n.classList.contains('ln')) { ls.push({ sev: n.dataset.sev, text: n.textContent.replace(/^(CRITICAL|WARNING|HEALTHY|INFO|NOT CHECKED)/, '') }); n = n.nextElementSibling; } return { sec: h.dataset.sec, lines: ls }; });
      out.intervals = C.anc.intervals; out.prof = { ds: P.ds, road: Array.from(P.road), ground: Array.from(P.ground) };
      out.zones = SZ.zones.map(z => ({ id: z.id, s0: z.s0, s1: z.s1, offRoute: z.offRoute, max: z.grade ? z.grade.pct : null }));
      const q = (sql, p) => A.dbQuery(sql, p || []);
      out.signN = q("SELECT COUNT(*) FROM elements_meta WHERE discipline = ?", [std._model_map.discipline])[0][0];
      out.signCoded = q("SELECT COUNT(DISTINCT m.guid) FROM elements_meta m JOIN element_psets p ON p.guid = m.guid WHERE m.discipline = ? AND p.name = ? AND TRIM(COALESCE(p.value,'')) <> ''", [std._model_map.discipline, std._model_map.code_prop])[0][0];
      { const T = ((std._road_report || {}).environment_terms || []).map(t => t.toLowerCase()); out.envTerms = T;   // same terms as the engine, own query
        out.env = T.length ? q('SELECT COUNT(*) FROM element_psets WHERE ' + T.map(() => '(lower(name) LIKE ? OR lower(value) LIKE ?)').join(' OR '), [].concat(...T.map(t => ['%' + t + '%', '%' + t + '%'])))[0][0] : -1; }
      // RED probe: the same inputs with a stricter warning cut-off must re-grade the drift lines
      out.redCounts = null;
      // click the first line that carries a chainage
      const li = rep.lines.findIndex(l => l.s != null && l.s > 100 && l.kind === 'drift'), el = pan.querySelector('.rr-line[data-i="' + li + '"]');
      if (el) { el.click(); await new Promise(r => setTimeout(r, 300)); const p = A.civilRouteAt(rep.lines[li].s); out.click = { s: rep.lines[li].s, err: Math.hypot(A.camera.position.x - p.x, A.camera.position.z - p.z) }; }
      return out;
    });
    const pd = await open(browser, 'Duplex_extracted');
    const before = [];
    pd.on('console', m => { if (/§ROOM_CYCLE/.test(m.text())) before.push(m.text()); });
    await pd.evaluate(() => document.body.focus()); await pd.keyboard.press('r'); await new Promise(r => setTimeout(r, 8000));
    R.dup = await pd.evaluate(() => ({ civil: window.APP.isCivilModel(), panel: !!document.getElementById('road-report-panel'), rep: window.APP._roadReport || null }));
    R.dup.roomCycle = before.slice(0, 3);
    log('§ROAD_REPORT_DUPLEX ' + JSON.stringify(R.dup) + (!R.dup.panel ? ' verdict=VACUOUS' : ''));
  } catch (e) { log('§ROAD_REPORT verdict=INCONCLUSIVE reason=' + e.message); R.err = e.message; process.exitCode = 2; }
  finally { await browser.close(); server.close(); }
  if (R.err) { logStream.end(); return; }
  const r = R.road;
  if (!r.lines || !r.lines.length) { log('§WITNESS_ROAD_REPORT verdict=INCONCLUSIVE reason=no lines'); process.exitCode = 2; logStream.end(); return; }
  r.prof.road = r.prof.road.map(v => v == null ? NaN : v); r.prof.ground = r.prof.ground.map(v => v == null ? NaN : v);
  fs.writeFileSync(LOG.replace(/\.log$/, '') + '_profile.json', JSON.stringify(r.prof));
  r.lines.forEach(l => log('§ROAD_REPORT_LINE [' + l.sev + '] (' + l.sec + ') ' + l.text));
  // own drift classification
  const dp = RR.drift_pct, own = r.intervals.map(q => { const p = Math.abs(q.drift) / q.stepM * 100; return { from: q.from, sev: p >= dp.critical ? 'CRITICAL' : p >= dp.warning ? 'WARNING' : 'OK', p }; });
    log('§ROAD_REPORT_INDEP drift own=' + own.map(o => o.from + ':' + o.sev[0] + o.p.toFixed(1)).join(','));
  const G = ownGrade(r.prof.road, r.prof.ds, r.zones, RR.grade_window_m);
  log('§ROAD_REPORT_INDEP grade runs=' + G.runs.length + ' okM=' + G.okM + ' judged=' + G.judged + ' ' + G.runs.map(x => x.zone + '@' + x.s0 + '-' + x.s1 + ':' + x.maxG.toFixed(2)).join(','));
  const E = ownEarth(r.prof.road, r.prof.ground, r.prof.ds, RR.grade_window_m);
  log('§ROAD_REPORT_INDEP earth stretches=' + E.length + ' ' + E.map(x => x.k + '@' + x.s0 + '-' + x.s1 + ':' + x.max.toFixed(2)).join(','));
  log('§ROAD_REPORT_INDEP signs N=' + r.signN + ' coded=' + r.signCoded + ' env=' + r.env + ' click=' + JSON.stringify(r.click));
  const W = Witness('ROAD_REPORT')
    .population(() => [Object.assign({ id: BLD }, r)])
    .schema({ type: 'object', required: ['id', 'lines'], properties: { id: { type: 'string' } } })
    .invariant('(1) R on the road model opened "The Road Report"; sections in the user\'s order (Alignment & Drift, Earthworks, Geometric Health, Signs, Environment); chips == counts', rs => rs.every(x => x.title === 'The Road Report' && x.dom.map(d => d.sec).join() === ORDER.filter(k => x.dom.some(d => d.sec === k)).join() && x.dom.length === 5 &&
      x.chips.every(c => { const m = /^(.*) (\d+)$/.exec(c); return m && x.counts[m[1]] === +m[2]; })))
    .invariant('(2) drift: one CRITICAL/WARNING line per interval the own classification flags, same severity, and HEALTHY "k of n" == own OK count', rs => rs.every(x => { const dL = x.lines.filter(l => l.kind === 'drift' && (l.sev === 'CRITICAL' || l.sev === 'WARNING')); return dL.length === own.filter(o => o.sev !== 'OK').length &&
      own.filter(o => o.sev !== 'OK').every(o => dL.some(l => l.ch === o.from && l.sev === o.sev && Math.abs(l.pct - o.p) < 0.05)) && x.lines.some(l => l.kind === 'drift' && l.sev === 'HEALTHY' && l.text.startsWith('Chainage: ' + own.filter(o => o.sev === 'OK').length + ' of ' + own.length + ' ')); }))
    .invariant('(3) grade: stretches == own chord recompute (count, s0, s1 exact; max grade ±0.05), each cites an ATJ 8/86 Table 4.10 row; HEALTHY metres == own', rs => rs.every(x => { const gL = x.lines.filter(l => l.kind === 'grade' && l.sev === 'WARNING'); return gL.length === G.runs.length && G.runs.every((g, i) => { const l = gL.slice().sort((a, b) => a.s0 - b.s0)[i]; return l && l.s0 === g.s0 && l.s1 === g.s1 && Math.abs(l.maxG - g.maxG) < 0.05 && /ATJ 8\/86 Table 4\.10[A-F], p\.\d+/.test(l.text) && /grade up to (\d+\.\d+)% exceeds max (\d+(\.\d+)?)%/.test(l.text) && +/grade up to (\d+\.\d+)%/.exec(l.text)[1] > l.max; }) &&
      x.lines.some(l => l.kind === 'grade' && l.sev === 'HEALTHY' && l.text.startsWith('Grade: ' + Math.round(G.okM * x.prof.ds).toLocaleString('en-US') + ' m of ' + Math.round(G.judged * x.prof.ds).toLocaleString('en-US') + ' m ')); }))
    .invariant('(4) earthworks: cut/fill stretches == own recompute (count, s0, s1, depth ±0.01); a coverage line says how much has a ground surface', rs => rs.every(x => { const eL = x.lines.filter(l => l.kind === 'earth' && l.sev === 'INFO'); return eL.length === E.length && E.every((e, i) => { const l = eL.slice().sort((a, b) => a.s0 - b.s0)[i]; return l && l.s0 === e.s0 && l.s1 === e.s1 && Math.abs(l.depth - e.max) < 0.01 && l.text.includes(e.k === 'cut' ? ': cut up to' : ': fill up to'); }) &&
      x.lines.some(l => l.kind === 'earth' && l.sev === 'NOT CHECKED' && /ground surface found under/.test(l.text)); }))
    .invariant('(5) signs: HEALTHY "Sign codes: k of N" with N == own SIGNAGE count; unknown + missing lines carry codes/counts', rs => rs.every(x => x.lines.some(l => l.kind === 'sign' && l.sev === 'HEALTHY' && new RegExp('^Sign codes: \\d+ of ' + x.signN + ' in the ATJ 2A/85 table$').test(l.text)) &&
      x.lines.filter(l => l.kind === 'sign' && l.sev === 'WARNING' && /no code property/.test(l.text)).reduce((a, l) => a + +(/(\d+) signs? ha/.exec(l.text) || [0, 0])[1], 0) === x.signN - x.signCoded))
    .invariant('(6) environment: own pset query finds 0 → a NOT CHECKED line saying no environmental layer; no CRITICAL/WARNING in Environment', rs => rs.every(x => x.envTerms.length > 0 && x.env === 0 && x.lines.some(l => l.sec === 'env' && l.sev === 'NOT CHECKED' && /no environmental layer/.test(l.text)) && !x.lines.some(l => l.sec === 'env' && (l.sev === 'CRITICAL' || l.sev === 'WARNING'))))
    .invariant('(7) .txt and PDF hold exactly the dashboard lines, section by section (same order, same severity, same text)', rs => rs.every(x => { const flat = d => d.map(s => s.sec + '|' + s.lines.map(l => l.sev + ':' + l.text.trim()).join('~')).join('#');
      const txt = x.dom.every(s => s.lines.every(l => x.txt.includes('[' + l.sev + '] ' + l.text.trim()))) && x.txt.split('\n').filter(t => /^\[/.test(t)).length === x.lines.length; return flat(x.dom) === flat(x.pdf) && txt; }))
    .invariant('(8) clicking a chainage line: camera on the route at that s (±1 m)', rs => rs.every(x => x.click && x.click.err <= 1))
    .invariant('(10) polish: a sign line never repeats a chainage; a grade line\'s printed value is above its printed max (no "3.0% exceeds max 3%")', rs => rs.every(x => x.lines.filter(l => l.kind === 'sign' && /^CH /.test(l.text)).every(l => { const cs = l.text.split(':')[0].replace(/^CH /, '').split(/, | \+\d+ more/).filter(Boolean); return new Set(cs).size === cs.length; }) &&
      x.lines.filter(l => l.kind === 'grade' && l.sev === 'WARNING').every(l => { const m = /grade up to ([\d.]+)% exceeds max ([\d.]+)%/.exec(l.text); return m && +m[1] > +m[2]; })))
    .invariant('(9) R on Duplex: not civil, no report panel, Room Cycle handled the key (§ROOM_CYCLE logged)', () => R.dup && !R.dup.civil && !R.dup.panel && R.dup.rep === null && R.dup.roomCycle.length > 0)
    .redControl(rs => rs.map(x => Object.assign({}, x, { lines: x.lines.map(l => l.kind === 'drift' && l.sev === 'WARNING' ? Object.assign({}, l, { sev: 'CRITICAL' }) : l) })));
  console.log = (...a) => { const s = a.join(' '); logStream.write(s + '\n'); _cl(...a); };
  try { W.run(); } finally { console.log = _cl; }
  await new Promise(res => logStream.end(res));
})();
