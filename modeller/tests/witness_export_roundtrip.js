#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — W-EXPORT-ROUNDTRIP. SCOPE: prompts/MODELLER_EXPORT_ROUNDTRIP.md (parent: bim-compiler prompts/MODELLER_MASTER.md §EXPORT-ROUNDTRIP). Read the log after EVERY run; exit code 0 is not evidence.
// ISSUE IT EXPOSES: "what the Modeller holds does not reach the hand-off IFC". MEASUREMENT witness: GAP is the expected finding, not a failure.
// Chain: Open a public IFC (page) -> Walk ALL -> A = the page's building DB (__dwBuf) + op-log -> Export via Bonsai.ifc.build() -> B = those bytes re-opened by the SAME route
// (modeller/ifc_open_db.js + dxf2bim/ifc_extract_core.js, node) -> compare A vs B as X of N. Verdict lines: `§RT <claim> X of N PASS|GAP|INCONCLUSIVE`.
// Red control: the same model exported with ONE element removed; its class must go GAP and nothing else may move (else §RT-CONTROL BLIND).
// PRIVATE RESULTS NEVER GO IN THIS REPO: RT_DB=<db> / RT_IFC=<ifc>[,<ifc>] run it on another file; keep that log outside the repo, and do not quote names from it here.
// Usage: node modeller/tests/witness_export_roundtrip.js > log 2>&1   (software GL only: no GPU, no bake; RT_NOWALK=1 skips Walk ALL)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const ROOT = path.join(__dirname, '..', '..'), SHARED = path.join(os.homedir(), 'bim-ootb'), NM = path.join(os.homedir(), 'bim-compiler', 'node_modules');
const puppeteer = require(path.join(NM, 'puppeteer')), WebIFC = require(path.join(NM, 'web-ifc')), initSqlJs = require(path.join(NM, 'sql.js'));
const Core = require(path.join(ROOT, 'modeller', 'dxf2bim', 'ifc_extract_core.js')), IOD = require(path.join(ROOT, 'modeller', 'ifc_open_db.js'));
let GridRead = null; try { GridRead = require(path.join(ROOT, 'common', 'ifc_grid_read.js')); } catch (e) { /* older tree */ }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const say = s => console.log(s);
const T0 = Date.now(), TAG = '§RT';
const FILES = process.env.RT_DB ? [{ file: process.env.RT_DB, kind: 'db' }] : (process.env.RT_IFC ? process.env.RT_IFC.split(',') : [path.join(ROOT, 'IFC', 'Duplex_ARC.ifc'), path.join(ROOT, 'IFC', 'SampleHouse_ARC.ifc')]).map(f => ({ file: f, kind: 'ifc' }));
const summary = [];
const verdict = (key, claim, X, N, extra) => { const v = N === 0 ? 'INCONCLUSIVE' : (X === N ? 'PASS' : 'GAP'); say(`${TAG} [${key}] ${claim} ${X} of ${N} ${v}${extra ? '  ' + extra : ''}`); summary.push({ key, claim, X, N, v }); return v; };
const rows = (db, sql) => { try { const r = db.exec(sql); return r.length ? r[0].values : []; } catch (e) { return null; } };
const has = (db, t) => (rows(db, "SELECT 1 FROM sqlite_master WHERE type='table' AND name='" + t + "'") || []).length > 0;
const cnt = (db, t) => has(db, t) ? rows(db, 'SELECT count(*) FROM "' + t + '"')[0][0] : null;   // null = table absent
const by = (list, f) => { const o = {}; list.forEach(x => { const k = f(x); o[k] = (o[k] || 0) + 1; }); return o; };
const med = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// ── file-text facts. The file is NEVER turned into one JS string (a ~600 MB export exceeds V8's 512 MB string limit): it is scanned as a Buffer in 32 MB pieces cut at statement ends, and only the few entity kinds judged are kept ──
function topArgs(s) {   // split a STEP argument string at top-level commas
  const out = []; let d = 0, q = false, cur = '';
  for (let i = 0; i < s.length; i++) { const c = s[i];
    if (q) { cur += c; if (c === "'") { if (s[i + 1] === "'") { cur += "'"; i++; } else q = false; } continue; }
    if (c === "'") { q = true; cur += c; } else if (c === '(') { d++; cur += c; } else if (c === ')') { d--; cur += c; } else if (c === ',' && d === 0) { out.push(cur); cur = ''; } else cur += c; }
  out.push(cur); return out.map(x => x.trim());
}
const unq = s => (s && s[0] === "'") ? s.slice(1, -1).replace(/''/g, "'") : (s === '$' ? null : s);
function fileFacts(buf) {
  const byType = {}, storeys = new Map(), keep = { siteArgs: null, ctxArgs: null, lengthUnit: null, buildingIds: new Set() }, rels = []; let spaceCommon = 0;
  const CH = 33554432;
  for (let at = 0; at < buf.length;) {
    let end = Math.min(at + CH, buf.length);
    while (end < buf.length && !(buf[end - 1] === 10 && buf[end - 2] === 59)) end++;   // a statement ends ';' + newline
    const piece = buf.toString('latin1', at, end);
    for (const st of piece.split(/;\s*\n/)) {
      const m = /^\s*#(\d+)\s*=\s*([A-Z0-9_]+)\s*\(/.exec(st); if (!m) continue; const t = m[2]; byType[t] = (byType[t] || 0) + 1;
      if (t === 'IFCBUILDINGSTOREY') storeys.set(+m[1], { name: unq(topArgs(st.slice(m[0].length, st.lastIndexOf(')')))[2]), n: 0 });
      else if (t === 'IFCBUILDING') keep.buildingIds.add(+m[1]);
      else if (t === 'IFCRELCONTAINEDINSPATIALSTRUCTURE') { const a = topArgs(st.slice(m[0].length, st.lastIndexOf(')'))); rels.push([(a[4].match(/#\d+/g) || []).length, +a[5].replace('#', '')]); }
      else if (t === 'IFCSITE' && !keep.siteArgs) keep.siteArgs = topArgs(st.slice(m[0].length, st.lastIndexOf(')')));
      else if (t === 'IFCGEOMETRICREPRESENTATIONCONTEXT' && !keep.ctxArgs) keep.ctxArgs = topArgs(st.slice(m[0].length, st.lastIndexOf(')')));
      else if (t === 'IFCSIUNIT' && keep.lengthUnit === null) { const a = topArgs(st.slice(m[0].length, st.lastIndexOf(')'))); if (a[1] === '.LENGTHUNIT.') keep.lengthUnit = (a[2] === '$' ? '' : a[2]) + a[3]; }
      else if (t === 'IFCPROPERTYSET' && st.indexOf("'Pset_SpaceCommon'") >= 0) spaceCommon++;
    }
    at = end;
  }
  let inStorey = 0, inBuilding = 0, inOther = 0;
  for (const [n, tgt] of rels) { if (storeys.has(tgt)) { storeys.get(tgt).n += n; inStorey += n; } else if (keep.buildingIds.has(tgt)) inBuilding += n; else inOther += n; }
  const sa = keep.siteArgs || [], ca = keep.ctxArgs || [];
  return { byType, storeys: [...storeys.values()], inStorey, inBuilding, inOther, siteLat: !!keep.siteArgs && sa[9] !== '$' && sa[9] !== undefined, siteLon: !!keep.siteArgs && sa[10] !== '$' && sa[10] !== undefined,
    spaceCommon, lengthUnit: keep.lengthUnit, trueNorth: !!keep.ctxArgs && ca[5] !== '$' && ca[5] !== undefined };
}

(async () => {
  const SQL = await initSqlJs(), api = new WebIFC.IfcAPI(); await api.Init();
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]), a = path.join(ROOT, p), b = path.join(SHARED, p), f = fs.existsSync(a) && fs.statSync(a).isFile() ? a : b;
    fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(d); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await puppeteer.launch({ headless: 'new', protocolTimeout: 3600000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=8192'] });
  let heapMax = 0;
  for (const F of FILES) {
    if (!fs.existsSync(F.file)) { say(`${TAG} INCONCLUSIVE input absent, nothing judged: ${path.basename(F.file)}`); continue; }
    const key = path.basename(F.file).replace(/\.(ifc|db)$/i, '');
    say(`\n${TAG} ===== ${key} (${F.kind}) =====`);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-')), local = path.join(tmp, path.basename(F.file)); fs.copyFileSync(F.file, local);   // source never written
    const pg = await br.newPage(); await pg.setViewport({ width: 1280, height: 720 }); const errs = [], conLog = [];
    pg.on('pageerror', e => { errs.push(String(e).slice(0, 300)); say('§PAGEERR ' + String(e).slice(0, 300)); });
    pg.on('console', m => { const t = m.text(); if (/§(IFC-SPATIAL|IFC-SEED|IFC-OPEN-X|DISCWALK-ALL|WALK-MAINS|IFC §M3B|IFC-WALKSET|ARC-SEED-WIRE)/.test(t) || /walkSets|BIMOOTB/.test(t)) { conLog.push(t); say('  [con] ' + t.slice(0, 600)); } });
    const bufs = {}; await pg.exposeFunction('__rtChunk', (k, b64) => { (bufs[k] = bufs[k] || []).push(Buffer.from(b64, 'base64')); });
    await pg.goto(base + '/modeller/modeller.html', { waitUntil: 'load', timeout: 180000 });
    await pg.waitForFunction('window.__sceneReady===true && window.Bonsai && window.Bonsai.ifc && typeof window.discWalkAll==="function"', { timeout: 180000 });
    await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__local"]', { visible: true });
    const [fc] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__local"]')]); await fc.accept([local]);
    await pg.waitForFunction('!!window.__dwBuf && !!window.__arcSeedReady', { timeout: 900000, polling: 1000 }); await pg.evaluate(async () => { await window.__arcSeedReady; }); await sleep(3000);
    // ── Walk ALL ──
    let walk = { state: 'skipped (RT_NOWALK)' };
    if (!process.env.RT_NOWALK) {
      const row = await pg.evaluate(() => !!document.querySelector('[data-bnode="dw-all"]'));
      if (!row) walk = { state: 'no Walk ALL row after open' };
      else { await pg.evaluate(() => { window.__dwAllDone = false; }); await pg.click('[data-bnode="dw-all"]');
        const done = await pg.waitForFunction(() => window.__dwAllDone === true, { timeout: 900000, polling: 1000 }).then(() => true).catch(() => false); await sleep(3000);
        walk = { state: done ? 'done' : 'TIMEOUT 900 s' }; }
    }
    // ── A: the page's DB + op-log summary ──
    const send = (expr) => pg.evaluate(async (expr, k) => { const u8 = eval(expr); for (let at = 0; at < u8.length; at += 786432) { let s = ''; const sub = u8.subarray(at, at + 786432); for (let i = 0; i < sub.length; i += 32768) s += String.fromCharCode.apply(null, sub.subarray(i, i + 32768)); await window.__rtChunk(k, btoa(s)); } return u8.length; }, expr, 'A');
    const nA = await send('new Uint8Array(window.__dwBuf)');
    const opsInfo = await pg.evaluate(() => { const O = window.Bonsai.oplog, L = window.Bonsai.library, out = [];
      O._geomOps().forEach(o => { const P = o.parameters || {}, d = P._dw, cat = P.hash && L.get ? L.get(P.hash) : null;
        const cls = P.ifc_class || (d && d.ifc) || (cat && cat.ifc_class) || null; let c = null;
        if (o.op_type === 'GEOM_INSERT' && d && !P.anchorOnly) { try { const fo = L.foldInsert(o, null, null); if (fo && fo.positions && fo.positions.length) { let mn = [1e99, 1e99, 1e99], mx = [-1e99, -1e99, -1e99]; for (let i = 0; i < fo.positions.length; i += 3) for (let k = 0; k < 3; k++) { const v = fo.positions[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; } c = [0, 1, 2].map(k => (mn[k] + mx[k]) / 2); } } catch (e) { c = null; } }
        out.push({ id: o.id, t: o.op_type, cls, disc: d ? (d.disc || null) : null, dw: !!d, dwIfc: d ? (d.ifc || null) : null, prov: !!(d && d.provisional), anchor: !!P.anchorOnly, storey: P.storey == null ? null : P.storey, guid: o.outputGuid || null, c }); });
      return out; });
    const dbA = new SQL.Database(Buffer.concat(bufs.A));
    say(`${TAG} [${key}] A: db bytes=${nA} elements_meta=${cnt(dbA, 'elements_meta')} ops=${opsInfo.length} (inserts=${opsInfo.filter(o => o.t === 'GEOM_INSERT').length} walked=${opsInfo.filter(o => o.dw).length} anchors=${opsInfo.filter(o => o.anchor).length}) walk=${walk.state}`);
    // ── Export through the shipped path, then the control with one seeded element removed ──
    const exportBytes = (dropId, k) => pg.evaluate(async (dropId, k) => { const O = window.Bonsai.oplog, orig = O._geomOps;
      if (dropId != null) O._geomOps = function () { return orig.call(O).filter(o => o.id !== dropId); };
      let r; try { r = await window.Bonsai.ifc.build(); } finally { O._geomOps = orig; }
      const u8 = r.bytes; for (let at = 0; at < u8.length; at += 786432) { let s = ''; const sub = u8.subarray(at, at + 786432); for (let i = 0; i < sub.length; i += 32768) s += String.fromCharCode.apply(null, sub.subarray(i, i + 32768)); await window.__rtChunk(k, btoa(s)); }
      return { bytes: u8.length, seeded: r.seeded, seedByClass: r.seedByClass, walkSets: r.walkSets, walkFixtures: r.walkFixtures, walkProvisional: r.walkProvisional, noMesh: r.seedNoMesh, proxy: r.seedProxy }; }, dropId, k);
    const tE = Date.now(), ex = await exportBytes(null, 'B'); const msExport = Date.now() - tE;
    say(`${TAG} [${key}] export bytes=${ex.bytes} seeded=${ex.seeded} noMeshSkipped=${ex.noMesh} proxyTyped=${ex.proxy} walkSets=${ex.walkSets} walkFixtures=${ex.walkFixtures} walkProvisional=${ex.walkProvisional} ms=${msExport}`);
    const openB = async bytes => IOD.open({ WebIFC, ifcApi: api, SQL, Core, GridRead: GridRead || undefined, bytes: new Uint8Array(bytes), name: key, log: () => {} });
    const bytesB = Buffer.concat(bufs.B), mem = () => { const m = process.memoryUsage(); return `rss=${Math.round(m.rss / 1048576)} heapUsed=${Math.round(m.heapUsed / 1048576)} external=${Math.round(m.external / 1048576)} MB`; };
    const FB = fileFacts(bytesB), srcBuf = F.kind === 'ifc' ? fs.readFileSync(F.file) : null, FS = srcBuf ? fileFacts(srcBuf) : null;
    say(`${TAG}-HEAP [${key}] before re-open: ${mem()} (export ${bytesB.length} bytes)`);
    let B = null, bFail = null; try { if (process.env.RT_FAKE_BFAIL) throw new Error('simulated re-open failure (RT_FAKE_BFAIL, harness self-test)'); B = (await openB(bytesB)).db; } catch (e) { bFail = String(e && e.message || e).slice(0, 300); }
    say(`${TAG}-HEAP [${key}] after re-open: ${mem()}`);
    if (!B) say(`${TAG} [${key}] B INCONCLUSIVE reason=${bFail}  (every B-side claim below prints INCONCLUSIVE; A-side and file-text claims still run)`);
    // a claim that needs the re-opened DB: INCONCLUSIVE, never PASS, when B could not be opened
    const vB = (k, claim, X, N, extra) => B ? verdict(k, claim, X, N, extra) : (say(`${TAG} [${k}] ${claim} INCONCLUSIVE  B not re-opened`), summary.push({ key: k, claim, X: 0, N: 0, v: 'INCONCLUSIVE' }), 'INCONCLUSIVE');
    const cm = a => (rows(a, 'SELECT ifc_class FROM elements_meta') || []).map(r => r[0]);

    // ── C1 / C2 classes and disciplines. A = the opened DB's elements + the walked fixtures/runs the op-log holds beyond it ──
    const aEl = (rows(dbA, 'SELECT guid, ifc_class, discipline, storey FROM elements_meta') || []).map(r => ({ guid: r[0], cls: r[1], disc: r[2], storey: r[3] }));
    const walked = opsInfo.filter(o => o.dw && o.t === 'GEOM_INSERT');
    const aAll = aEl.concat(walked.map(o => ({ guid: null, cls: o.cls, disc: o.disc, storey: o.storey, walked: true, run: !o.dwIfc, prov: o.prov, c: o.c })));
    const bEl = (rows(B, 'SELECT guid, ifc_class, discipline, storey FROM elements_meta') || []).map(r => ({ guid: r[0], cls: r[1], disc: r[2], storey: r[3] }));
    const classTable = (aList, bList, field) => { const a = by(aList, x => x[field] || '(none)'), b = by(bList, x => x[field] || '(none)'), lines = []; let X = 0, N = 0;
      Object.keys(a).sort().forEach(k => { const x = Math.min(b[k] || 0, a[k]); X += x; N += a[k]; lines.push(`    ${field} ${k}: A=${a[k]} B=${b[k] || 0} ${x === a[k] ? 'PASS' : 'GAP'} (${x} of ${a[k]})`); });
      const extra = Object.keys(b).filter(k => !a[k]).map(k => k + ':' + b[k]); lines.push(`    only in B: ${extra.length ? extra.join(' ') : '(none)'}`); return { X, N, lines, a, b }; };
    const c1 = classTable(aAll, bEl, 'cls'); c1.lines.forEach(say); vB(key, 'C1 elements per IFC class (total)', c1.X, c1.N, `A=${aAll.length} (db ${aEl.length} + walked ${walked.length}) B=${bEl.length}`);
    const c2 = classTable(aAll, bEl, 'disc'); c2.lines.forEach(say); vB(key, 'C2 elements per discipline (total)', c2.X, c2.N);

    // ── C3 storeys ──
    const aStoreys = rows(dbA, "SELECT name FROM storey_elevation") ? rows(dbA, 'SELECT name FROM storey_elevation').map(r => r[0]) : [];
    const NOSTOREY = s => !s || s === 'Unknown';   // 'Unknown' is the extractor's own label for an element contained in no storey
    const aStoreyNames = new Set(aEl.map(e => e.storey).filter(s => !NOSTOREY(s))); aStoreys.forEach(s => { if (!NOSTOREY(s)) aStoreyNames.add(s); });
    verdict(key, 'C3a IfcBuildingStorey in the file vs storeys A holds', Math.min(FB.storeys.length, aStoreyNames.size), aStoreyNames.size, `file=${FB.storeys.length} A=${[...aStoreyNames].join('|')}`);
    const aWithStorey = aAll.filter(e => !NOSTOREY(e.storey)).length;
    verdict(key, 'C3b A elements that name a storey, contained in a storey in the file', Math.min(FB.inStorey, aWithStorey), aWithStorey, `file: inStorey=${FB.inStorey} directlyInBuilding=${FB.inBuilding} other=${FB.inOther} (A elements naming no storey / 'Unknown': ${aAll.length - aWithStorey})`);
    { const a = by(aAll.filter(e => !NOSTOREY(e.storey)), e => e.storey); let X = 0, N = 0; const fb = {}; FB.storeys.forEach(s => fb[s.name] = (fb[s.name] || 0) + s.n);
      Object.keys(a).sort().forEach(k => { const x = Math.min(fb[k] || 0, a[k]); X += x; N += a[k]; say(`    storey "${k}": A=${a[k]} file=${fb[k] || 0} ${x === a[k] ? 'PASS' : 'GAP'}`); });
      verdict(key, 'C3c per-storey element counts (sum over A storeys)', X, N); }

    // ── C4 carried tables ──
    const tabs = ['storey_elevation', 'ifc_grid_axis', 'ifc_spaces', 'rel_fills_host', 'element_type', 'element_pset_common', 'rel_aggregates'];
    // element_pset_common: the export's own BIMOOTB_Walk rows are NOT the building's psets; counting them as carried made this claim pass vacuously (seen in the first full run: 531 B rows = 177 fixtures x 3). A's rows vs B's rows outside that set.
    const cntT = (db, t) => t === 'element_pset_common' && has(db, t) ? rows(db, "SELECT count(*) FROM element_pset_common WHERE pset <> 'BIMOOTB_Walk'")[0][0] : cnt(db, t);
    tabs.forEach(t => { const a = cntT(dbA, t), b = cntT(B, t); if (a === null || a === 0) { say(`${TAG} [${key}] C4 ${t} A=${a === null ? 'table absent' : 0} B=${b === null ? 'absent' : b} INCONCLUSIVE (VACUOUS: nothing in A to carry)`); summary.push({ key, claim: 'C4 ' + t, X: 0, N: 0, v: 'INCONCLUSIVE' }); } else vB(key, 'C4 ' + t + ' rows', Math.min(b || 0, a), a, `A=${a} B=${b === null ? 'absent' : b}`); });
    { const ea = rows(dbA, 'SELECT name, elevation_attr_m, placement_z_m FROM storey_elevation') || [], eb = {}; (rows(B, 'SELECT name, elevation_attr_m, placement_z_m FROM storey_elevation') || []).forEach(r => eb[r[0]] = r);
      vB(key, 'C4 storey_elevation values equal by name (1 mm)', ea.filter(r => eb[r[0]] && Math.abs((eb[r[0]][2] || 0) - (r[2] || 0)) < 1e-3).length, ea.length); }
    verdict(key, 'C4 IfcSpace in the file vs A ifc_spaces', Math.min(FB.byType.IFCSPACE || 0, cnt(dbA, 'ifc_spaces') || 0), cnt(dbA, 'ifc_spaces') || 0, `file IfcSpace=${FB.byType.IFCSPACE || 0}`);
    { const wf = walked.filter(o => !o.run), pv = wf.filter(o => o.prov);
      const bw = rows(B, "SELECT count(DISTINCT guid) FROM element_pset_common WHERE pset='BIMOOTB_Walk'"), bp = rows(B, "SELECT count(DISTINCT guid) FROM element_pset_common WHERE pset='BIMOOTB_Walk' AND name='Provisional' AND upper(value)='TRUE'");
      vB(key, 'C4 BIMOOTB_Walk set on walked fixtures', Math.min(bw ? bw[0][0] : 0, wf.length), wf.length, `walked fixtures=${wf.length} B guids with the set=${bw ? bw[0][0] : 'n/a'}`);
      vB(key, 'C4 Provisional=TRUE rows on provisional walked fixtures', Math.min(bp ? bp[0][0] : 0, pv.length), pv.length, `B=${bp ? bp[0][0] : 'n/a'}`); }
    { const pa = new Set((rows(dbA, 'SELECT parent_guid, child_guid FROM rel_aggregates') || []).map(r => r.join('|'))), elA = new Set(aEl.map(e => e.guid)), pb = new Set((rows(B, 'SELECT parent_guid, child_guid FROM rel_aggregates') || []).map(r => r.join('|')));
      const elementLevel = [...pa].filter(x => elA.has(x.split('|')[0]));
      vB(key, 'C4 rel_aggregates pairs by GlobalId (all A pairs)', [...pa].filter(x => pb.has(x)).length, pa.size, `element-level A pairs=${elementLevel.length}, found in B by GlobalId=${elementLevel.filter(x => pb.has(x)).length}`); }

    // ── C5 routed runs ──
    { const runs = walked.filter(o => o.run), rc = by(runs, o => o.cls || '(no class)'), bc = by(bEl, e => e.cls);
      const bText = FB.byType, sw = (bText.IFCSWEPTDISKSOLID || 0) + (bText.IFCSURFACECURVESWEPTAREASOLID || 0) + (bText.IFCSWEPTAREASOLID || 0) + (bText.IFCFIXEDREFERENCESWEPTAREASOLID || 0), ports = bText.IFCDISTRIBUTIONPORT || 0;
      let X = 0; Object.keys(rc).forEach(k => { const x = Math.min(bc[k] || 0, rc[k]); X += x; say(`    run class ${k}: A=${rc[k]} B=${bc[k] || 0}`); });
      vB(key, 'C5 routed runs (walked ops without a fixture class)', X, runs.length, `file: swept solids=${sw} ports=${ports} (A ports: not held in the op-log, n/a)`); }

    // ── C6 position: GlobalId survival, then centres ──
    { const gB = new Set(bEl.map(e => e.guid)), gotId = aEl.filter(e => gB.has(e.guid)).length;
      vB(key, 'C6a GlobalId of A (db) elements present in B', gotId, aEl.length);
      const cA = {}; (rows(dbA, 'SELECT e.guid, (w.minX+w.maxX)/2, (w.minY+w.maxY)/2, (w.minZ+w.maxZ)/2 FROM element_world_bbox w JOIN elements_meta e ON e.guid=w.guid') || []).forEach(r => cA[r[0]] = r.slice(1));
      const cB = {}; (rows(B, 'SELECT guid, (minX+maxX)/2, (minY+maxY)/2, (minZ+maxZ)/2 FROM element_world_bbox') || []).forEach(r => cB[r[0]] = r.slice(1));
      const clsB = {}; bEl.forEach(e => clsB[e.guid] = e.cls);
      const items = aEl.filter(e => cA[e.guid]).map(e => ({ cls: e.cls, c: cA[e.guid], guid: e.guid })).concat(walked.filter(o => o.c).map(o => ({ cls: o.cls, c: o.c, guid: null })));
      const poolBy = {}; Object.keys(cB).forEach(g => (poolBy[clsB[g]] = poolBy[clsB[g]] || []).push({ g, c: cB[g], used: false }));
      const pairs = [], d = [], dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); let byId = 0, byNear = 0, none = 0;
      items.forEach(it => { let hit = it.guid && cB[it.guid]; if (hit) { byId++; pairs.push([it.guid, it.guid]); d.push(dist(it.c, cB[it.guid])); return; }
        let best = null, bd = 2; (poolBy[it.cls] || (it.cls === 'IfcWallStandardCase' ? poolBy.IfcWall : null) || []).forEach(p => { if (p.used) return; const x = dist(it.c, p.c); if (x < bd) { bd = x; best = p; } });
        if (best) { best.used = true; byNear++; d.push(bd); if (it.guid) pairs.push([it.guid, best.g]); } else none++; });
      vB(key, 'C6b elements with a position in A that have a same-class element within 2 m in B', byId + byNear, items.length, `byGlobalId=${byId} byNearestCentre(fallback)=${byNear} unmatched=${none}`);
      say(`${TAG} [${key}] C6c centre difference m over ${d.length} matched: median=${med(d) === null ? 'n/a' : med(d).toFixed(4)} max=${d.length ? Math.max.apply(null, d).toFixed(4) : 'n/a'}  (fallback matches are a lower bound; a position GAP hides in the unmatched)`);
      vB(key, 'C6d matched centres within 1 cm', d.filter(x => x < 0.01).length, d.length);
      // ── (b) geometry per element, (c) materials and colours: pairs = A db elements matched to B (GlobalId, else same class + nearest centre). Measured from the re-open DBs (component_geometries, elements_meta) ──
      const vc = (db, g) => { const r = rows(db, "SELECT length(c.vertices)/12 FROM element_instances i JOIN component_geometries c ON c.geometry_hash=i.geometry_hash WHERE i.guid='" + g.replace(/'/g, "''") + "'"); return r && r[0] ? r[0][0] : null; };
      const vol = (db, g) => { const r = rows(db, "SELECT (maxX-minX)*(maxY-minY)*(maxZ-minZ) FROM element_world_bbox WHERE guid='" + g.replace(/'/g, "''") + "'"); return r && r[0] ? r[0][0] : null; };
      const mat = (db, g) => { const r = rows(db, "SELECT material_name, material_rgba FROM elements_meta WHERE guid='" + g.replace(/'/g, "''") + "'"); return r && r[0] ? r[0] : [null, null]; };
      let vEq = 0, volEq = 0, nmEq = 0, rgEq = 0, nmN = 0, rgN = 0; const vEx = [];
      pairs.forEach(([ga, gb]) => { const a = vc(dbA, ga), b = vc(B, gb); if (a === b) vEq++; else if (vEx.length < 3) vEx.push(ga.slice(0, 8) + ' ' + a + '/' + b);
        const va = vol(dbA, ga), vb = vol(B, gb); if (va !== null && vb !== null && Math.abs(va - vb) <= 0.01 * Math.max(Math.abs(va), 1e-9)) volEq++;
        const ma = mat(dbA, ga), mb = mat(B, gb); if (ma[0]) { nmN++; if (ma[0] === mb[0]) nmEq++; } if (ma[1]) { rgN++; if (ma[1] === mb[1]) rgEq++; } });
      vB(key, 'C9b vertex count per matched element (A vs B, from the re-open DBs)', vEq, pairs.length, `pairs=${pairs.length} (GlobalId ${byId}, fallback ${byNear}); first diffs: ${vEx.join(' | ') || '(none)'}`);
      vB(key, 'C9b bbox volume per matched element within 1%', volEq, pairs.length);
      vB(key, 'C9c material_name per matched element (A has a name)', nmEq, nmN, 'from the re-open DBs');
      vB(key, 'C9c material_rgba per matched element (A has a colour)', rgEq, rgN, 'from the re-open DBs'); }


    // ── C7 frame ──
    // C7a skips import_date (differs by construction) and building_name/source_file (set from the open call's file name: instrument-forced, not carried by the file)
    { const pa = (rows(dbA, 'SELECT key, value FROM project_metadata') || []).filter(r => !['import_date', 'building_name', 'source_file'].includes(r[0])), pb = {}; (rows(B, 'SELECT key, value FROM project_metadata') || []).forEach(r => pb[r[0]] = r[1]);
      pa.forEach(r => say(`    project_metadata ${r[0]}: A=${r[1]} B=${pb[r[0]] === undefined ? '(absent)' : pb[r[0]]}`));
      vB(key, 'C7a project_metadata keys equal', pa.filter(r => pb[r[0]] !== undefined && String(pb[r[0]]) === String(r[1])).length, pa.length);
      if (FS) { const items = [['IfcSite RefLatitude', FS.siteLat, FB.siteLat], ['IfcSite RefLongitude', FS.siteLon, FB.siteLon], ['IfcMapConversion', !!FS.byType.IFCMAPCONVERSION, !!FB.byType.IFCMAPCONVERSION], ['IfcProjectedCRS', !!FS.byType.IFCPROJECTEDCRS, !!FB.byType.IFCPROJECTEDCRS]].filter(x => x[1]);
        items.forEach(x => say(`    source has ${x[0]}: in export ${x[2]}`)); verdict(key, 'C7b frame facts the source IFC states, present in the export', items.filter(x => x[2]).length, items.length, 'source states: ' + (items.map(x => x[0]).join(', ') || 'none')); }
      else say(`${TAG} [${key}] C7b INCONCLUSIVE no source IFC (db input)`); }


    // ── C9 further measures from the design lane. Where the re-open DB does not carry a fact, it is counted in the exported FILE TEXT (stated per line) ──
    {
      // (a) GlobalId stability is C6a above.
      // (e) site placement: georef offset keys, site lat/long (C7b), true north
      const gA = (rows(dbA, "SELECT key, value FROM project_metadata WHERE key LIKE 'georef_offset%'") || []), gBm = {}; (rows(B, "SELECT key, value FROM project_metadata WHERE key LIKE 'georef_offset%'") || []).forEach(r => gBm[r[0]] = r[1]);
      vB(key, 'C9e georef_offset_* keys equal (re-open DBs)', gA.filter(r => String(gBm[r[0]]) === String(r[1])).length, gA.length, gA.length ? '' : 'A holds no georef_offset (local model): VACUOUS');
      verdict(key, 'C9e true north: source states it, export states it (file text)', FS && FS.trueNorth ? (FB.trueNorth ? 1 : 0) : 0, FS && FS.trueNorth ? 1 : 0);
      // (f) room property sets
      const sA = (rows(dbA, "SELECT count(*) FROM element_pset_common WHERE pset='Pset_SpaceCommon'") || [[0]])[0][0], sSrc = FS ? FS.spaceCommon : 0, sBf = FB.spaceCommon, nSp = sA || sSrc;
      verdict(key, 'C9f Pset_SpaceCommon property sets (A db rows ' + sA + '; source file text ' + sSrc + ') vs export file text', Math.min(sBf, nSp), nSp, 'IfcSpace rows are dropped from A by the open rule, so N comes from the source text when A has none');
      // (g) openings and voids
      const opA = (rows(dbA, 'SELECT count(DISTINCT opening_guid) FROM rel_fills_host') || [[0]])[0][0], cutsA = opsInfo.filter(o => o.t === 'GEOM_CUT').length, opF = FB.byType.IFCOPENINGELEMENT || 0, vdF = FB.byType.IFCRELVOIDSELEMENT || 0;
      verdict(key, 'C9g IfcOpeningElement in the file vs openings A holds (rel_fills_host)', Math.min(opF, opA), opA, `A op-log GEOM_CUT=${cutsA}; file IfcOpeningElement=${opF}`);
      verdict(key, 'C9g IfcRelVoidsElement in the file vs openings A holds', Math.min(vdF, opA), opA, `file IfcRelVoidsElement=${vdF}`);
      // (h) units
      const lS = FS ? FS.lengthUnit : null, lB = FB.lengthUnit;
      verdict(key, 'C9h length unit: export = source', FS && lS ? (lS === lB ? 1 : 0) : 0, FS && lS ? 1 : 0, `source=${lS} export=${lB} (file text)`);
      // (i) MEP hand-off, file text. N = walked runs; the walked fixtures are measured too.
      const runsA = walked.filter(o => o.run).length, fixA = walked.length - runsA, sys = FB.byType.IFCDISTRIBUTIONSYSTEM || 0, nest = FB.byType.IFCRELNESTS || 0, rcp = FB.byType.IFCRELCONNECTSPORTS || 0, ports = FB.byType.IFCDISTRIBUTIONPORT || 0, asg = FB.byType.IFCRELASSIGNSTOGROUP || 0;
      verdict(key, 'C9i walked runs assigned to an IfcDistributionSystem (IfcRelAssignsToGroup)', Math.min(asg, runsA), runsA, `file: IfcDistributionSystem=${sys} IfcRelAssignsToGroup=${asg}`);
      verdict(key, 'C9i walked runs with ports (IfcRelNests/IfcRelConnectsPorts)', Math.min(rcp, runsA), runsA, `file: IfcDistributionPort=${ports} IfcRelNests=${nest} IfcRelConnectsPorts=${rcp}`);
      verdict(key, 'C9i walked fixtures in an IfcDistributionSystem', Math.min(sys > 0 ? asg : 0, fixA), fixA, `file: IfcDistributionSystem=${sys}`); }

    // ── C8 red control: ONE seeded element removed ──
    { const seeded = opsInfo.filter(o => o.t === 'GEOM_INSERT' && !o.dw && !o.anchor && o.cls), bExp = by(bEl, e => e.cls), aC = by(aAll, e => e.cls);
      const cand = seeded.find(o => aC[o.cls] && (bExp[o.cls] || 0) === aC[o.cls]) || seeded.find(o => (bExp[o.cls] || 0) > 0);
      if (!B) { say(`${TAG} [${key}] C8 INCONCLUSIVE B not re-opened`); summary.push({ key, claim: 'C8 control', X: 0, N: 0, v: 'INCONCLUSIVE' }); }
      else if (!cand) { say(`${TAG} [${key}] C8 INCONCLUSIVE no seeded op to remove`); summary.push({ key, claim: 'C8 control', X: 0, N: 0, v: 'INCONCLUSIVE' }); }
      else { const ec = await exportBytes(cand.id, 'C'), Bc = (await openB(Buffer.concat(bufs.C))).db, bcc = by((rows(Bc, 'SELECT ifc_class FROM elements_meta') || []).map(r => ({ cls: r[0] })), e => e.cls);
        const cc = classTable(aAll, (rows(Bc, 'SELECT guid, ifc_class, discipline, storey FROM elements_meta') || []).map(r => ({ guid: r[0], cls: r[1], disc: r[2], storey: r[3] })), 'cls');
        const moved = Object.keys(Object.assign({}, bExp, bcc)).filter(k => (bExp[k] || 0) !== (bcc[k] || 0)), onlyThis = moved.length === 1 && moved[0] === cand.cls && (bcc[cand.cls] || 0) === (bExp[cand.cls] || 0) - 1;
        const main = c1.a[cand.cls] === Math.min(bExp[cand.cls] || 0, c1.a[cand.cls]) ? 'PASS' : 'GAP';
        say(`${TAG}-CONTROL [${key}] removed op ${cand.id} (${cand.cls}); class ${cand.cls}: A=${aC[cand.cls]} B(run)=${bExp[cand.cls] || 0} B(control)=${bcc[cand.cls] || 0}; main-run C1 row for it = ${main}; control C1 total ${cc.X} of ${cc.N} (main ${c1.X} of ${c1.N}); classes whose count moved: ${moved.join(',') || '(none)'}`);
        say(`${TAG}-CONTROL [${key}] ${onlyThis && cc.X === c1.X - 1 ? 'SEES IT (the removed class dropped by exactly 1, nothing else moved; C1 total ' + c1.X + ' -> ' + cc.X + ')' : (moved.length === 0 ? 'BLIND (nothing moved)' : 'INEXACT moved=' + moved.join(','))}${main === 'PASS' ? '' : '  (note: that class was already GAP in the main run, flip not shown)'}`);
        summary.push({ key, claim: 'C8 control sees one removal', X: onlyThis && cc.X === c1.X - 1 ? 1 : 0, N: 1, v: onlyThis && cc.X === c1.X - 1 ? 'PASS' : 'BLIND' }); Bc.close(); } }

    const heap = await pg.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1048576)); heapMax = Math.max(heapMax, heap);
    say(`${TAG}-HEAP [${key}] page heap=${heap} MB; page errors=${errs.length}; ${(Date.now() - T0) / 1000} s elapsed`);
    await pg.close(); dbA.close(); if (B) B.close(); fs.rmSync(tmp, { recursive: true, force: true });
  }
  await br.close(); srv.close();
  say(`\n${TAG} ===== SUMMARY =====`);
  summary.forEach(s => say(`${TAG} [${s.key}] ${s.claim}: ${s.X} of ${s.N} ${s.v}`));
  const mu = process.memoryUsage();
  say(`${TAG}-HEAP node rss=${Math.round(mu.rss / 1048576)} MB heapUsed=${Math.round(mu.heapUsed / 1048576)} MB; page heap max=${heapMax} MB; total ${((Date.now() - T0) / 1000).toFixed(1)} s`);
  say(`${TAG} VERDICT measurement only: PASS=${summary.filter(s => s.v === 'PASS').length} GAP=${summary.filter(s => s.v === 'GAP').length} INCONCLUSIVE=${summary.filter(s => s.v === 'INCONCLUSIVE').length} (GAP is the finding; exit 0)`);
  process.exit(0);
})().catch(e => { console.log(TAG + ' HARNESS ERROR ' + (e && e.stack || e)); process.exit(1); });
