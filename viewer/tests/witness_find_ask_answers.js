#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §FIND_ASK (2026-09-30, prompts/FIND_ASK_ANSWERS.md §F)
// Scope: the Find panel Ask mode (viewer/find_ask.js) on a real building, in headless Chrome.
// Read the log after every run — the exit code is not evidence.
//
// ISSUES THIS PROVES OR DISPROVES:
//  W1 ENGINE-PARITY     an Ask answer could drift from the engine it claims to wrap → each value is
//                       re-derived here from the engine/DB directly and must be equal.
//  W2 EVIDENCE-REAL     evidence could be decorative → every OK answer carries ≥1 ENGINE § tag
//                       (not §ASK_*) that also appears in the page console captured by this script.
//  W3 HONEST-INCONCL.   a missing table could yield a fake 0 → cost_total must be OK iff qto_cache is
//                       visible to the viewer's DB; exit_path must be OK iff the escape engine built a
//                       record; neither may be OK with a null value.
//  W4 SAVE-ROUNDTRIP    the saved file could differ from the screen → the workbook buffer is parsed in
//                       node: Answers rows = answers, each verdict/summary equal to the in-page answer.
//  W8 FILM-PARITY      Ask's escape alternatives could disagree with the Alt-C film's Escape Route beat →
//                       the worst-case answer must equal the film's own §ESCAPE_ROUTE_ALTERNATES line, and
//                       escapeRouteFor(worst room) must reproduce the film record (one shared function).
//  W5 UI-WIRED          a working API behind a dead button → Ask pill → type "clash" → Run → exactly
//                       one new .ask-card whose text holds that answer's summary.
// Verdict: INCONCLUSIVE (exit 2) when nothing was judged OK — never PASS on an empty population.
//
// Env: SAVE_XLSX (write the full workbook to this path, §J) · BLD (default Clinic) · BLD_DIR (default ~/bim-ootb/buildings) · ROOT · PORT · GPU=sw|real · LOAD_MS · LOG
/* global SEQUENCE_RULES, LABOR_RATES, EQUIPMENT_ALLOCATION, EQUIPMENT_RATES, Buffer */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const XLSX = require('/home/red1/bim-compiler/node_modules/xlsx');
const { Witness } = require('../../witness_kit/contract');

const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const BLD = process.env.BLD || 'Clinic';
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
const PORT = +(process.env.PORT || 8573);
const GPU = process.env.GPU || 'sw';
const LOAD_MS = +(process.env.LOAD_MS || 900000);
const LOG = process.env.LOG || ('/tmp/witness_find_ask_answers_' + BLD + '.log');
fs.writeFileSync(LOG, '');
const logRaw = (s) => fs.appendFileSync(LOG, s + '\n');
const log = (s) => { console.log(s); logRaw(s); };

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.json': 'application/json', '.css': 'text/css',
  '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.png': 'image/png', '.svg': 'image/svg+xml', '.gz': 'application/gzip', '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]); let fp = path.join(ROOT, u.replace(/^\/+/, ''));
  if (!fs.existsSync(fp) && u.startsWith('/buildings/')) fp = path.join(BLD_DIR, u.slice('/buildings/'.length));
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(res);
} catch (e) { res.writeHead(500); res.end(); } });

// In-page independent re-derivations (W1) — the witness's own oracle, not find_ask.js code.
async function oracle(ids) {
  const A = window.APP, out = {};
  const q = (s) => { try { return A.dbQuery(s) || []; } catch (e) { return []; } };
  out.qtoVisible = +(q("SELECT count(*) FROM sqlite_master WHERE name='qto_cache'")[0] || [0])[0] > 0;
  if (ids.clash_pair) {
    const rules = await new Promise(r => A._loadClashRules(r));
    const [a, b] = ids.clash_pair;
    const rule = rules.clash_rules.find(r => (r.source.discipline === a && r.target.discipline === b) || (r.source.discipline === b && r.target.discipline === a));
    rules._activeTolerance = rule ? rule.tolerance_m || 0.025 : 0.025;
    out.clash = { broad: (A._queryClashesPairAll(rules, a, b) || []).length, tol: rules._activeTolerance };
  }
  if (window.ScheduleRead4D) {
    const t = window.ScheduleRead4D.readTasks(A.db, { quiet: true, rules: typeof SEQUENCE_RULES !== 'undefined' ? SEQUENCE_RULES : null,
      laborRates: typeof LABOR_RATES !== 'undefined' ? LABOR_RATES : null, equipmentAllocation: typeof EQUIPMENT_ALLOCATION !== 'undefined' ? EQUIPMENT_ALLOCATION : null,
      equipmentRates: typeof EQUIPMENT_RATES !== 'undefined' ? EQUIPMENT_RATES : null });
    out.sched = t ? { tasks: t.length, days: t.reduce((m, x) => Math.max(m, x.finishDay || 0), 0) } : null;
  }
  { // independent: raw kernel_ops ELEMENT_PLACE rows (the played layer), own SQL
    const r = q("SELECT min(timestamp), count(*) FROM kernel_ops WHERE undone=0 AND op_type='ELEMENT_PLACE'")[0] || [null, 0];
    let maxEnd = -Infinity;
    q("SELECT timestamp, parameters FROM kernel_ops WHERE undone=0 AND op_type='ELEMENT_PLACE'").forEach(x => { const p = x[1] ? JSON.parse(x[1]) : {}; const e = p._end_ts || (x[0] + 60000); if (e > maxEnd) maxEnd = e; });
    out.played = r[1] ? { ops: r[1], days: Math.round((maxEnd - r[0]) / 86400000), start: (d => d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2))(new Date(r[0])), hr: A._hrCost ? A._hrCost.total : null } : null;
  }
  if (out.qtoVisible) out.cost = +(q('SELECT ROUND(SUM(COALESCE(material_cost,0)+COALESCE(labour_cost,0)+COALESCE(equipment_cost,0))) FROM qto_cache')[0] || [null])[0];
  if (typeof A.allRoomVolumes === 'function') {
    const by = {}; (A.allRoomVolumes() || []).forEach(v => { by[v.guid] = (by[v.guid] || 0) + v.size.x * v.size.z; });
    const ks = Object.keys(by).sort((x, y) => by[y] - by[x]);
    out.rooms = { n: ks.length, top: ks[0] || null, area: ks[0] ? +by[ks[0]].toFixed(2) : null };
  }
  const rec = A.escapeRouteRecord ? A.escapeRouteRecord() : null;
  out.exit = rec ? { roomGuid: rec.roomGuid, exitGuid: rec.exitGuid, walkM: +rec.walkM.toFixed(2) } : null;
  out.counts = +(q('SELECT count(*) FROM elements_meta')[0] || [0])[0];
  return out;
}


// W6/W7 in-page probe — the witness's OWN vocabulary (own SQL, own parse), never FindAskGrammar.vocab.
async function grammarProbe(rulePairs) {
  const A = window.APP, q = (sql, p) => { try { return p ? (A.db.exec(sql, p)[0] || { values: [] }).values : (A.dbQuery(sql) || []); } catch (e) { return []; } };
  const col = (rows) => rows.map(r => r[0]).filter(v => v !== null && v !== '').map(String);
  const has = (t) => +((q("SELECT count(*) FROM sqlite_master WHERE name='" + t + "'")[0] || [0])[0]) > 0;
  const W = { discs: col(q('SELECT DISTINCT discipline FROM elements_meta')), qto: has('qto_cache'), raster: has('storey_walkable_raster') };
  W.qd = W.qto ? col(q('SELECT DISTINCT discipline FROM qto_cache')) : []; W.qs = W.qto ? col(q('SELECT DISTINCT storey FROM qto_cache')) : [];
  W.qc = W.qto ? col(q('SELECT DISTINCT ifc_class FROM qto_cache')) : [];
  const ops = q("SELECT parameters FROM kernel_ops WHERE undone=0 AND op_type='ELEMENT_PLACE'").map(r => { try { return JSON.parse(r[0]); } catch (e) { return {}; } });
  W.os = [...new Set(ops.map(o => o.storey).filter(Boolean))]; W.op = [...new Set(ops.map(o => o.phase).filter(Boolean))]; W.ot = [...new Set(ops.map(o => o.resource).filter(Boolean))];
  W.rooms = [...new Set((A.allRoomVolumes() || []).map(v => String(v.name)))];
  let gst = []; try { gst = [...new Set((A.getRoomGraph().nodes || []).map(n => n.storey).filter(Boolean).map(String))]; } catch (e) { /* none */ }
  const pairs = rulePairs.filter(p => W.discs.includes(p[0]) && W.discs.includes(p[1])).map(p => p.slice().sort().join('|'));
  const inputs = ['cost. MEP', 'cost material ' + (W.qd[0] || '') + ' ' + (W.qs[0] || ''), 'schedule ' + (W.os[0] || ''), '4d ' + (W.op[0] || ''),
    'clash', 'largest room', 'exit', 'count', '', 'zzqx qqzz'];
  const bad = [], seen = [];
  for (const t of inputs) {
    const list = await A.askSuggest(t);
    seen.push({ t, n: list.length, top: list.slice(0, 4).map(x => x.text) });
    for (const sg of list) {
      const s = sg.slots || {}, in_ = (v, arr) => v === null || v === undefined || arr.includes(v);
      let ok = true;
      if (sg.tpl === 'cost_total') ok = ['all', 'materials', 'labour', 'equipment'].includes(s.ctype) && in_(s.disc, W.qd) && in_(s.storey, W.qs) && in_(s.cls, W.qc) && sg.available === W.qto;
      if (sg.tpl === 'schedule_4d') ok = in_(s.storey, W.os) && in_(s.phase, W.op) && in_(s.trade, W.ot);
      if (sg.tpl === 'clash_pair') ok = pairs.includes([s.a, s.b].sort().join('|'));
      if (sg.tpl === 'largest_room') ok = in_(s.storey, gst);
      if (sg.tpl === 'exit_path') ok = in_(s.roomName, W.rooms) && sg.available === W.raster;
      if (sg.tpl === 'counts') ok = ['discipline', 'storey'].includes(s.by);
      if (!ok) bad.push(t + ' → ' + sg.text);
    }
  }
  const byT = Object.fromEntries(seen.map(x => [x.t, x]));
  const w6 = { bad, seen,
    emptyDefaults: byT[''].n === 6, junkEmpty: byT['zzqx qqzz'].n === 0,
    costMep: !(W.qto && W.qd.includes('MEP')) ? 'n/a' : JSON.stringify(byT['cost. MEP'].top) === JSON.stringify(['all', 'materials', 'labour', 'equipment'].map(c => 'Find 5D cost of ' + c + ' for MEP')) };
  // W7 — filters actually applied (witness SQL / own op filter)
  const w7 = {};
  if (W.qto && W.qd[0] && W.qs[0]) {
    const sg = (await A.askSuggest('cost material ' + W.qd[0] + ' ' + W.qs[0])).find(x => x.slots.disc === W.qd[0] && x.slots.storey === W.qs[0] && x.slots.ctype === 'materials');
    const a = sg ? await A.askRun(sg) : null;
    const want = +((q('SELECT ROUND(SUM(COALESCE(material_cost,0))) FROM qto_cache WHERE discipline=? AND storey=?', [W.qd[0], W.qs[0]])[0] || [null])[0]);
    w7.cost = { sentence: sg && sg.text, got: a && a.value && a.value.total, want, ok: !!a && a.verdict === 'OK' && +a.value.total === want };
  }
  if (W.os[0]) {
    const sg = (await A.askSuggest('schedule ' + W.os[0])).find(x => x.tpl === 'schedule_4d' && x.slots.storey === W.os[0] && !x.slots.phase && !x.slots.trade);
    const a = sg ? await A.askRun(sg) : null, want = ops.filter(o => o.storey === W.os[0]).length;
    w7.sched = { sentence: sg && sg.text, got: a && a.value && a.value.elements, want, ok: !!a && a.verdict === 'OK' && a.value.elements === want && a.value.labourCost === null };
  }
  { const sg = (await A.askSuggest('count')).find(x => x.slots.by === 'storey'); const a = sg ? await A.askRun(sg) : null;
    const rows = q('SELECT storey, count(*) FROM elements_meta GROUP BY storey ORDER BY 2 DESC');
    w7.countStorey = { sentence: sg && sg.text, ok: !!a && a.value.total === rows.reduce((t, r) => t + r[1], 0) && Object.keys(a.value.groups).length === rows.length }; }
  const rec = A.escapeRouteRecord ? A.escapeRouteRecord() : null;
  if (rec) {
    const sg = (await A.askSuggest('exit ' + rec.roomName)).find(x => x.slots.roomGuid === rec.roomGuid);
    const a = sg ? await A.askRun(sg) : null;
    w7.exitFrom = { sentence: sg && sg.text, got: a && a.value && a.value.exitGuid, want: rec.exitGuid, ok: !!a && a.verdict === 'OK' && a.value.exitGuid === rec.exitGuid };
  }
  return { w6, w7 };
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const gpuArgs = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] }[GPU] || [];
  const gpuEnv = GPU === 'real' ? { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' } : {};
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ask-profile-'));
  const commit = (() => { try { return require('child_process').execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD']).toString().trim(); } catch (e) { return '?'; } })();
  log(`§ASKW_ENV root=${ROOT} commit=${commit} bld=${BLD} bldDir=${BLD_DIR} gpu=${GPU} log=${LOG}`);
  const browser = await puppeteer.launch({ headless: true, userDataDir: profile, protocolTimeout: 30 * 60 * 1000, env: Object.assign({}, process.env, gpuEnv),
    args: ['--no-sandbox', '--hide-crash-restore-bubble', '--window-size=1300,840'].concat(gpuArgs) });
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  const consoleTags = new Set();
  const altLines = [];
  page.on('console', m => { const t = m.text(); logRaw('[con] ' + t); if (t.indexOf('§ESCAPE_ROUTE_ALTERNATES exitsReachable=') >= 0) altLines.push(t); (t.match(/§[A-Z0-9_]+/g) || []).forEach(x => consoleTags.add(x));
    if (/§ASK_|§4D_REAL_TASKS |§ESCAPE_ROUTE_BUILD|§NLP_DEC|§ROOM_VOL_COUNT|§CLASH_NARROWPHASE pair/.test(t)) console.log('  ' + t.slice(0, 240)); });
  page.on('pageerror', e => logRaw('[pageerror] ' + e.message));
  let rows = [], verdictLine = 'INCONCLUSIVE';
  try {
    const url = `http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`; log('§ASKW_NAV ' + url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.renderer && window.APP.db, { timeout: LOAD_MS });
    await page.waitForFunction(() => { const A = window.APP; return A.activeBuilding && A.buildingsRendered && A.buildingsRendered.has(A.activeBuilding) && !A.streaming; }, { timeout: LOAD_MS, polling: 1000 });
    await page.evaluate(() => window.APP.loadNavigate());
    await page.evaluate(() => window.APP.openFindPanel());
    await page.waitForFunction(() => !!document.getElementById('find-mode-ask') && typeof window.APP.askRun === 'function', { timeout: 60000 });
    const scope = await page.evaluate(() => ({ building: window.APP.activeBuilding, discs: (window.APP.dbQuery('SELECT DISTINCT discipline FROM elements_meta') || []).map(r => r[0]) }));
    log(`§ASKW_SCOPE building=${scope.building} discs=${scope.discs.join(',')}`);
    const pair = scope.discs.includes('MEP') ? ['ARC', 'MEP'] : ['ARC', scope.discs.find(d => d && d !== 'ARC') || 'STR'];

    // W5 — UI path: Ask pill → type "clash A B" → the top sentence is that pair → click it → one new card.
    //      Plus: a VOICE final must only fill the list, never run (§H).
    await page.click('#find-mode-ask');
    const typed = 'clash ' + pair.join(' ');
    await page.evaluate((t) => { const el = document.getElementById('find-name'); el.value = t; el.dispatchEvent(new Event('input', { bubbles: true })); }, typed);
    await page.waitForFunction((w) => { const r = document.querySelector('#find-ask-catalog .ask-q'); return r && r.textContent.indexOf(w) >= 0; }, { timeout: 120000 }, 'clash').catch(() => {});
    const uiBefore = await page.evaluate(() => ({ cards: document.querySelectorAll('.ask-card').length, list: Array.from(document.querySelectorAll('#find-ask-catalog .ask-q')).map(e => e.textContent) }));
    log(`§ASKW_UI typed="${typed}" suggestions=${JSON.stringify(uiBefore.list.slice(0, 4))} cardsBefore=${uiBefore.cards}`);
    await page.evaluate(() => { const r = document.querySelector('#find-ask-catalog .ask-q'); if (r) r.click(); });
    await page.waitForFunction((n) => (window.APP.askAnswers || []).length > n, { timeout: 900000, polling: 500 }, uiBefore.cards)
      .catch(() => { throw new Error('W5: clicking the top suggestion ran nothing — top was "' + uiBefore.list[0] + '"'); });
    const uiAfter = await page.evaluate(() => { const c = document.querySelectorAll('.ask-card'); const a = window.APP.askAnswers[window.APP.askAnswers.length - 1];
      return { cards: c.length, lastText: c.length ? c[c.length - 1].textContent : '', summary: a.summary, question: a.question }; });
    const voice = await page.evaluate(async () => { const A = window.APP, n = A.askAnswers.length; A.inputWasVoice = true; await A.askInput('cost', true); return { before: n, after: A.askAnswers.length }; });
    const want = 'Find clashes between ' + pair[0] + ' and ' + pair[1];
    const w5 = /^\u21B5 ?/.test(uiBefore.list[0] || '') && (uiBefore.list[0] || '').replace(/^\u21B5 ?/, '') === want && uiAfter.question === want &&
      uiAfter.cards === uiBefore.cards + 1 && uiAfter.lastText.includes(uiAfter.summary) && voice.after === voice.before;
    log(`§ASKW_W5 ${w5 ? 'PASS' : 'FAIL'} top="${uiBefore.list[0]}" want="${want}" cardsAfter=${uiAfter.cards} summaryInCard=${uiAfter.lastText.includes(uiAfter.summary)} voiceRan=${voice.after - voice.before}`);

    // Default sentence of every other template through the API (same askRun a click calls)
    for (const id of ['schedule_4d', 'cost_total', 'largest_room', 'exit_path', 'counts']) {
      await page.evaluate((i) => window.APP.askRun(i), id);
    }
    const answers = await page.evaluate(() => window.APP.askAnswers.map(a => ({ id: a.id, verdict: a.verdict, summary: a.summary, value: a.value, evidence: a.evidence.map(e => e.tag) })));
    const O = await page.evaluate(oracle, { clash_pair: pair });
    log('§ASKW_ORACLE ' + JSON.stringify(O));
    const b64 = await page.evaluate(async () => { const buf = await window.APP.askBuildWorkbook(); let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); });
    const wb = XLSX.read(Buffer.from(b64, 'base64'), { type: 'buffer' });
    const sheet = XLSX.utils.sheet_to_json(wb.Sheets['Answers'], { header: 1, defval: '' });
    const hdrIdx = sheet.findIndex(r => r[0] === '#');
    const xrows = hdrIdx >= 0 ? sheet.slice(hdrIdx + 1).filter(r => r[0] !== '') : [];
    log(`§ASKW_XLSX bytes=${Buffer.from(b64, 'base64').length} sheets=[${wb.SheetNames.join('|')}] answerRows=${xrows.length}`);

    rows = answers.map((a, i) => {
      let parity = null; // W1: null = not judgeable (non-OK), true/false = judged
      const v = a.value || {};
      if (a.verdict === 'OK') {
        if (a.id === 'clash_pair') parity = !!O.clash && v.bboxOverlaps === O.clash.broad && v.toleranceM === O.clash.tol &&
          (v.meshClashes === undefined || v.meshClashes + v.cleared + v.unknown === v.bboxOverlaps);
        if (a.id === 'schedule_4d') parity = v.source === 'authored'
          ? (!!O.sched && v.tasks === O.sched.tasks && v.days === O.sched.days)
          : (!!O.played && v.elements === O.played.ops && v.days === O.played.days && v.start === O.played.start && v.labourCost === O.played.hr);
        if (a.id === 'cost_total') parity = O.cost !== undefined && +v.total === O.cost;
        if (a.id === 'largest_room') parity = !!O.rooms && v.rooms === O.rooms.n && v.largest.guid === O.rooms.top && v.largest.areaM2 === O.rooms.area;
        if (a.id === 'exit_path') parity = !!O.exit && v.roomGuid === O.exit.roomGuid && v.exitGuid === O.exit.exitGuid && v.walkM === O.exit.walkM;
        if (a.id === 'counts') parity = v.total === O.counts;
      }
      const engineTags = a.evidence.filter(t => !/^§ASK_/.test(t));
      const evidenceReal = a.verdict !== 'OK' || (a.id === 'counts') || (a.id === 'cost_total' && a.evidence.includes('§ASK_COST')) || (engineTags.length > 0 && engineTags.every(t => consoleTags.has(t)));
      let honest = true; // W3
      if (a.verdict === 'OK' && (a.value === null || a.value === undefined)) honest = false;
      if (a.id === 'cost_total') honest = honest && ((a.verdict === 'OK') === O.qtoVisible);
      if (a.id === 'exit_path') honest = honest && ((a.verdict === 'OK') === !!O.exit);
      const x = xrows[i] || [];
      const saved = x[1] !== undefined && String(x[2]) === a.verdict && String(x[3]) === a.summary;
      log(`§ASKW_ROW id=${a.id} verdict=${a.verdict} W1=${parity === null ? 'n/a' : parity ? 'PASS' : 'FAIL'} W2=${evidenceReal ? 'PASS' : 'FAIL'}(${engineTags.join(',') || '-'}) W3=${honest ? 'PASS' : 'FAIL'} W4=${saved ? 'PASS' : 'FAIL'} summary="${a.summary}"`);
      return { id: a.id, verdict: a.verdict, parity, evidenceReal, honest, saved, w5 };
    });
    const rulePairs = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'clash_rules.json'), 'utf8')).clash_rules.map(r => [r.source.discipline, r.target.discipline]);
    const G = await page.evaluate(grammarProbe, rulePairs);
    G.w6.seen.forEach(x => log(`§ASKW_W6_INPUT "${x.t}" n=${x.n} top=${JSON.stringify(x.top)}`));
    const w6ok = G.w6.bad.length === 0 && G.w6.emptyDefaults && G.w6.junkEmpty && G.w6.costMep !== false;
    log(`§ASKW_W6 ${w6ok ? 'PASS' : 'FAIL'} offDataSlots=${G.w6.bad.length}${G.w6.bad.length ? ' ' + JSON.stringify(G.w6.bad.slice(0, 5)) : ''} emptyDefaults=${G.w6.emptyDefaults} junkEmpty=${G.w6.junkEmpty} costMep=${G.w6.costMep}`);
    const w7keys = Object.keys(G.w7), w7ok = w7keys.length > 0 && w7keys.every(k => G.w7[k].ok);
    w7keys.forEach(k => log(`§ASKW_W7 ${k} ${G.w7[k].ok ? 'PASS' : 'FAIL'} ${JSON.stringify(G.w7[k])}`));
    log(`§ASKW_W7 ${w7ok ? 'PASS' : (w7keys.length ? 'FAIL' : 'INCONCLUSIVE')} judged=${w7keys.join(',')}`);
    // W8 — film parity for escape alternatives (only judgeable where an exit route exists)
    const exitAns = answers.find(a => a.id === 'exit_path');
    let w8 = null;
    if (exitAns && exitAns.verdict === 'OK') {
      const v = exitAns.value, line = altLines[0] || '';
      const num = (re) => { const m = line.match(re); return m ? m[1] : null; };
      const film = { exits: +num(/exitsReachable=(\d+)/), common: +num(/commonPathRED=([\d.]+)m/), split: num(/divergence="([^"]+)"/), drawn: +num(/blueAlternates=(\d+)\//) };
      const per = await page.evaluate((g) => { const A = window.APP, a = A.escapeRouteRecord(), b = A.escapeRouteFor(g);
        const ex = (r) => (r.alternates || []).map(x => x.exitGuid);
        const G = A.getRoomGraph();
        return { same: !!b && b.exitGuid === a.exitGuid && Math.abs(b.walkM - a.walkM) < 1e-6 && b.commonPathM === a.commonPathM && JSON.stringify(ex(b)) === JSON.stringify(ex(a)),
          altsAreExits: ex(a).every(e => G.nodesByGuid[e] && G.nodesByGuid[e].kind === 'exit' && e !== a.exitGuid),
          ranksAsc: (a.alternates || []).every((x, i, arr) => i === 0 || arr[i - 1].rank < x.rank) }; }, v.roomGuid);
      const ok = !!line && v.exitsReachable === film.exits && Math.abs(v.commonPathM - film.common) < 0.006 && (v.splitAt || null) === (film.split || null) &&
        v.alternates.length === film.drawn && per.same && per.altsAreExits && per.ranksAsc;
      log(`§ASKW_W8 ${ok ? 'PASS' : 'FAIL'} film=${JSON.stringify(film)} ask={exits:${v.exitsReachable},common:${v.commonPathM},split:"${v.splitAt}",alts:${v.alternates.length}} perRoom=${JSON.stringify(per)}`);
      w8 = ok;
    } else log('§ASKW_W8 n/a — no exit route in this building (nothing to compare)');
    rows.forEach(r => { r.w6 = w6ok; r.w7 = w7ok; r.w8 = w8 !== false; });
    // §J — SAVE_XLSX: the FULL workbook (defaults + W7 drill-downs), same bytes as the Save .xlsx button
    if (process.env.SAVE_XLSX) {
      const full = await page.evaluate(async () => { const buf = await window.APP.askBuildWorkbook(); let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return { b64: btoa(s), n: window.APP.askAnswers.length }; });
      fs.writeFileSync(process.env.SAVE_XLSX, Buffer.from(full.b64, 'base64'));
      log(`§ASKW_SAVED file=${process.env.SAVE_XLSX} answers=${full.n} bytes=${Buffer.from(full.b64, 'base64').length}`);
    }
    const judged = rows.filter(r => r.verdict === 'OK').length;
    if (judged === 0) { log('§ASKW_VERDICT INCONCLUSIVE — no answer came back OK, nothing was judged'); process.exitCode = 2; }
    else {
      const res = Witness('FIND_ASK_' + BLD)
        .population(() => rows)
        .schema({ type: 'object', required: ['id', 'verdict', 'evidenceReal', 'honest', 'saved'], properties: { verdict: { enum: ['OK', 'INCONCLUSIVE', 'VACUOUS'] } } })
        .invariant('W1 engine-parity (every OK answer)', rs => rs.every(r => r.parity !== false))
        .invariant('W2 evidence-real', rs => rs.every(r => r.evidenceReal))
        .invariant('W3 honest-inconclusive', rs => rs.every(r => r.honest))
        .invariant('W4 save-roundtrip', rs => rs.length === xrows.length && rs.every(r => r.saved))
        .invariant('W5 ui-wired', rs => rs.every(r => r.w5))
        .invariant('W6 grammar-from-data', rs => rs.every(r => r.w6))
        .invariant('W7 filter-parity', rs => rs.every(r => r.w7))
        .invariant('W8 film-parity (escape alternates)', rs => rs.every(r => r.w8))
        .redControl(rs => rs.map(r => r.verdict === 'OK' ? Object.assign({}, r, { parity: false }) : r))
        .run();
      verdictLine = res.fail ? 'FAIL' : 'PASS';
      log(`§ASKW_VERDICT ${verdictLine} judgedOK=${judged}/${rows.length} pass=${res.pass} fail=${res.fail}`);
    }
  } catch (e) {
    log('§ASKW_VERDICT INCONCLUSIVE — harness error: ' + (e && e.stack || e)); process.exitCode = 2;
  } finally {
    await browser.close().catch(() => {}); server.close();
  }
})();
