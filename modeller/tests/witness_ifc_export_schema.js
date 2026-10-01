#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-IFC-EXPORT-SCHEMA: both IFC exporters write schema-valid IFC4, proven by an INDEPENDENT validator.
 * Scope: modeller/bonsai_ifc.js (Exporter A, web-ifc) + viewer/ifc_export_worker.js (Exporter B, STEP text).
 * Spec: bim-compiler prompts/IFC_COMPLIANCE_SELFCHECK.md §EXPORTER_FIX (claims X1..X8). READ THE LOG after every run: exit code is not evidence.
 *
 * WHY THE OLD WITNESS MISSED IT: witness_ifc_export_seed.js counts products with the repo's OWN reader (web-ifc), which accepts
 * duplicate GlobalIds, null contexts, missing spatial chain. This witness re-reads every exported file with ifcopenshell
 * (modeller/tests/ifc_export_schema_check.py: ifcopenshell.validate express_rules=False + structural facts).
 *
 * NO GPU: headless Chrome with --disable-gpu + SwiftShader. No network, no upload to any validator. Deterministic (no Math.random).
 *
 * Env: IFCX_OUT (default /tmp/ifcx_out)  IFCX_PREFIX (dir holding the PRE-FIX exports modeller_Duplex.ifc, modeller_SampleHouse.ifc,
 *      viewer_Duplex.ifc — the X8 negative control + the 'before' numbers; absent => X8 pre-fix control INCONCLUSIVE)
 *      IFCX_SKIP_SEED=1 skips X7 (then X7 prints INCONCLUSIVE and the verdict cannot be PASS).
 * Rerun: node modeller/tests/witness_ifc_export_schema.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const { spawnSync } = require('child_process');
const vm = require('vm');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..');
const OUT = process.env.IFCX_OUT || path.join(os.tmpdir(), 'ifcx_out');
const PREFIX = process.env.IFCX_PREFIX || '/tmp/claude-1000/-home-red1-bim-compiler/ab4a76a3-ccfc-4a13-8385-05e280b7ee04/scratchpad/prefix_fixture';
const PY = path.join(__dirname, 'ifc_export_schema_check.py');
const DB = path.join(process.env.HOME, 'bim-compiler', 'deploy', 'buildings', 'Duplex_extracted.db');
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = {};    // claim -> 'PASS' | 'FAIL' | 'INCONCLUSIVE'
const L = (s) => console.log(s);
function claim(id, status, text) { results[id] = status; L('§IFCX_' + id + ' ' + status + ' ' + text); }

function pyCheck(file) {
  const p = spawnSync('python3', [PY, 'check', file], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (p.status !== 0 || !p.stdout.trim()) {      // crash (e.g. ifcopenshell SIGSEGV on a truncated file) = a DETECTED failure, not a pass
    return { file, open_ok: false, open_error: 'validator exit=' + p.status + ' signal=' + p.signal + ' ' + (p.stderr || '').slice(0, 120), verdict: 'FAIL', why: ['validator-crash'] };
  }
  return JSON.parse(p.stdout.trim().split('\n').pop());
}
const sum = (r) => r.open_ok ? 'errors=' + r.errors + ' roots=' + r.guids.roots + ' distinct=' + r.guids.distinct + ' badGuid=' + r.guids.invalid +
  ' project=' + r.spatial.project + ' site=' + r.spatial.site + ' building=' + r.spatial.building + ' storey=' + r.spatial.storey +
  ' orphans=' + r.orphans + '/' + r.elements + ' nullCtx=' + r.shape_reps.bad_context + '/' + r.shape_reps.n : r.open_error;

// ── Exporter A: headless modeller (software GL), the same call path as the seed witness: Bonsai.ifc.build() ──────────────────
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css' };
async function exportA(keys) {
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
    fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); });
  });
  await new Promise(r => srv.listen(0, r));
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1280, height: 860 });
  pg.on('console', m => { const t = m.text(); if (/§IFCX|§IFC-SEED|§IFC build/.test(t)) L('  [A page] ' + t.slice(0, 260)); });
  const files = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    await pg.goto('http://localhost:' + srv.address().port + '/modeller/modeller.html', { waitUntil: 'load' }); await sleep(1500);
    await pg.click('#b-open'); await sleep(200);
    await pg.click('#m-open-panel .mo-row[data-key="' + key + '"]');
    await pg.waitForFunction(() => window.Bonsai && window.Bonsai.oplog && window.Bonsai.oplog._geomOps().length > 0, { timeout: 150000 }).catch(() => L('  [A] ops wait timeout ' + key));
    await sleep(3000);
    const r = await pg.evaluate(async () => {
      const r = await window.Bonsai.ifc.build(); let s = ''; const b = r.bytes;
      for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
      return { b64: btoa(s), seeded: r.seeded, noMesh: r.seedNoMesh };
    });
    const f = path.join(OUT, 'A_' + key + '_run' + (files.filter(x => x.key === key).length + 1) + '.ifc');
    fs.writeFileSync(f, Buffer.from(r.b64, 'base64')); files.push({ key, file: f, seeded: r.seeded, noMesh: r.noMesh });
  }
  await br.close(); srv.close();
  return files;
}

// ── Exporter B: viewer/ifc_export_worker.js UNMODIFIED in a vm shim, fed from the extracted Duplex DB (read-only) ──────────────
function exportB(runTag) {
  const dump = path.join(OUT, 'B_dump.json');
  const p = spawnSync('python3', [PY, 'dumpB', DB, dump], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (p.status !== 0) throw new Error('dumpB failed ' + p.stderr);
  const src = JSON.parse(p.stdout.trim());
  const d = JSON.parse(fs.readFileSync(dump));
  const u8 = s => s == null ? null : new Uint8Array(Buffer.from(s, 'base64'));
  d.geometries.forEach(g => { g.vertices = u8(g.vertices); g.faces = u8(g.faces); });
  let out = null, err = null; const logs = [];
  const ctx = { console: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push('WARN ' + a.join(' ')) }, TextEncoder, Math, Date, Object, Number, String, Uint8Array, Float32Array, Int32Array, DataView, ArrayBuffer, Array, JSON, BigInt, parseInt, isNaN,
    postMessage: (m) => { if (m.type === 'done') out = Buffer.from(m.ifcData); if (m.type === 'error') err = m.message; } };
  ctx.self = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'viewer', 'ifc_export_worker.js'), 'utf8'), ctx);
  ctx.self.onmessage({ data: d });
  if (err) throw new Error('B export error ' + err);
  const f = path.join(OUT, 'B_Duplex_' + runTag + '.ifc'); fs.writeFileSync(f, out);
  return { file: f, src, logs: logs.filter(l => /§IFCX|§EXPORT_BUILD/.test(l) && !/§IFCX_B_SKIP/.test(l)), skipLogs: logs.filter(l => /§IFCX_B_SKIP/.test(l)) };
}

const same = (a, b) => Buffer.compare(fs.readFileSync(a), fs.readFileSync(b)) === 0;

(async () => {
  L('§IFCX_START out=' + OUT + ' prefix=' + PREFIX + ' validator=ifcopenshell.validate(express_rules=False) — express/WHERE rules NOT run (module _pytest not installed; nothing pip-installed)');
  // ---------- produce ----------
  const A = await exportA(['Duplex', 'Duplex', 'SampleHouse']);
  const Aduplex1 = A[0], Aduplex2 = A[1], Ash = A[2];
  const B1 = exportB('run1'), B2 = exportB('run2');
  B1.logs.concat(B1.skipLogs.slice(0, 5)).forEach(l => L('  [B] ' + l));
  const samples = [
    { id: 'A-Duplex', file: Aduplex1.file, pre: path.join(PREFIX, 'modeller_Duplex.ifc') },
    { id: 'A-SampleHouse', file: Ash.file, pre: path.join(PREFIX, 'modeller_SampleHouse.ifc') },
    { id: 'B-Duplex', file: B1.file, pre: path.join(PREFIX, 'viewer_Duplex.ifc') },
  ];
  const post = {}, pre = {};
  for (const s of samples) {
    post[s.id] = pyCheck(s.file); L('  §IFCX_SAMPLE ' + s.id + ' after  ' + sum(post[s.id]) + ' verdict=' + post[s.id].verdict + ' ' + post[s.id].why.join(','));
    pre[s.id] = fs.existsSync(s.pre) ? pyCheck(s.pre) : null;
    L('  §IFCX_SAMPLE ' + s.id + ' before ' + (pre[s.id] ? sum(pre[s.id]) + ' verdict=' + pre[s.id].verdict + ' ' + pre[s.id].why.join(',') : 'no pre-fix fixture (INCONCLUSIVE)'));
  }

  // ---------- X1 ----------
  const x1 = samples.map(s => post[s.id]);
  const detA = same(Aduplex1.file, Aduplex2.file), detB = same(B1.file, B2.file);
  const x1ok = x1.every(r => r.open_ok && r.guids.roots > 0 && r.guids.distinct === r.guids.roots && r.guids.invalid === 0);
  claim('X1', x1ok && detA && detB ? 'PASS' : 'FAIL', 'distinct==roots & 22-char valid: ' + samples.map(s => s.id + '=' + post[s.id].guids.distinct + '/' + post[s.id].guids.roots + ' bad=' + post[s.id].guids.invalid).join(' ') +
    ' | byte-equal across two runs: A-Duplex=' + detA + ' B-Duplex=' + detB);
  // ---------- X2 ----------
  const x2ok = x1.every(r => r.spatial.project === 1 && r.spatial.site >= 1 && r.spatial.building >= 1 && r.orphans === 0 && r.aggregate_chain_ok && r.spatial.rel_contained >= 1);
  claim('X2', x2ok ? 'PASS' : 'FAIL', samples.map(s => { const r = post[s.id]; return s.id + ':{project=' + r.spatial.project + ',site=' + r.spatial.site + ',building=' + r.spatial.building + ',storey=' + r.spatial.storey + ',aggChain=' + r.aggregate_chain_ok + ',orphans=' + r.orphans + '/' + r.elements + '}'; }).join(' ') +
    ' (storeys only where the source rows carry them; none are invented)');
  // ---------- X3 ----------
  const U = (r, k, n) => r.units[k] && r.units[k].name === n && r.units[k].prefix == null;
  const x3ok = x1.every(r => U(r, 'LENGTHUNIT', 'METRE') && U(r, 'AREAUNIT', 'SQUARE_METRE') && U(r, 'VOLUMEUNIT', 'CUBIC_METRE'));
  claim('X3', x3ok ? 'PASS' : 'FAIL', samples.map(s => s.id + ':' + Object.keys(post[s.id].units).map(k => k.replace('UNIT', '') + '=' + post[s.id].units[k].name).join(',')).join(' '));
  // units evidence from the SOURCE rows (extract, don't guess): Duplex wall/slab bbox extents
  const ev = spawnSync('python3', ['-c', `
import sqlite3,json
c=sqlite3.connect("file:${DB}?mode=ro",uri=True)
r=c.execute("select m.ifc_class,max(t.bbox_x),max(t.bbox_y),max(t.bbox_z),count(*) from elements_meta m join element_transforms t on t.guid=m.guid where m.ifc_class in ('IfcWallStandardCase','IfcSlab','IfcDoor') group by 1").fetchall()
print(json.dumps(r))`], { encoding: 'utf8' });
  L('  §IFCX_UNITS_EVIDENCE source=Duplex_extracted.db max bbox (class,x,y,z,n)=' + ev.stdout.trim() + ' — door/wall/slab extents of 0.9-17 are metres (a 1-unit door is not a millimetre door); header declares METRE');
  // ---------- X4 ----------
  const x4ok = x1.every(r => r.shape_reps.n > 0 && r.shape_reps.bad_context === 0 && r.shape_reps.contexts >= 1 && r.shape_reps.body_subcontexts >= 1);
  claim('X4', x4ok ? 'PASS' : 'FAIL', samples.map(s => { const r = post[s.id]; return s.id + ':reps=' + r.shape_reps.n + ',nullOrDangling=' + r.shape_reps.bad_context + ',contexts=' + r.shape_reps.contexts + ',bodySub=' + r.shape_reps.body_subcontexts; }).join(' '));
  // ---------- X5 ----------
  let x5 = 'PASS';
  samples.forEach(s => {
    const a = post[s.id], b = pre[s.id];
    L('  §IFCX_X5_SAMPLE ' + s.id + ' errors before=' + (b ? b.errors : 'n/a') + ' after=' + a.errors);
    a.classes.forEach(c => L('    remaining ' + c.n + 'x ' + c.entity + ' ' + c.msg));
    if (!a.open_ok || a.errors > 0) x5 = 'FAIL';
  });
  claim('X5', x5, 'ifcopenshell.validate express_rules=False; target 0 on all three. NOT covered: express WHERE/global rules (no _pytest), buildingSMART Validation Service V4-V7 (no upload permitted)');
  // ---------- X6 ----------
  const srcCnt = B1.src;
  const emitted = x1.map(r => r.emitted_extras), anyEmit = emitted.some(e => Object.values(e).some(n => n > 0));
  claim('X6', anyEmit ? 'FAIL' : 'PASS', 'emitted spaces/materials/psets/quantities = 0 on all samples (nothing invented). SOURCE (Duplex_extracted.db) carries spaces=' + srcCnt.spaces + ' storeys=' + srcCnt.storeys + ' material_name rows=' + srcCnt.material_name_rows +
    ' of ' + srcCnt.elements + ' => §IFCX_X6 deferred: present in source, NOT emitted by this change (schema-validity scope); no psets/quantity tables exist in the source');
  // ---------- X7 ----------
  if (process.env.IFCX_SKIP_SEED === '1') claim('X7', 'INCONCLUSIVE', 'IFCX_SKIP_SEED=1');
  else {
    const t0 = Date.now();
    const p = spawnSync('node', [path.join(__dirname, 'witness_ifc_export_seed.js')], { encoding: 'utf8', cwd: ROOT, maxBuffer: 1 << 26, timeout: 900000 });
    const lines = (p.stdout || '').split('\n').filter(l => /E\d+b? |✅|❌|§IFC-SEED|PASS|FAIL|passed|failed/.test(l));
    lines.slice(-14).forEach(l => L('  [seed] ' + l.slice(0, 200)));
    const bad = (p.stdout || '').split('\n').filter(l => l.includes('❌')).length, good = (p.stdout || '').split('\n').filter(l => l.includes('✅')).length;
    claim('X7', p.status === 0 && bad === 0 && good >= 5 ? 'PASS' : 'FAIL', 'witness_ifc_export_seed.js exit=' + p.status + ' ok=' + good + ' red=' + bad + ' secs=' + Math.round((Date.now() - t0) / 1000));
  }
  // ---------- X8 negative controls ----------
  const ctl = [];
  const ctlRun = (name, file, expect) => { const r = pyCheck(file); const got = r.verdict; ctl.push({ name, got, expect }); L('  §IFCX_X8_CONTROL ' + name + ' verdict=' + got + ' ' + (r.why || []).join(',') + ' (expected ' + expect + ')'); return r; };
  let x8 = 'PASS'; const fail8 = [];
  for (const s of samples) {
    if (!pre[s.id]) { fail8.push(s.id + ':no-fixture'); continue; }
    ctlRun('prefix-' + s.id, s.pre, 'FAIL');
  }
  const good = fs.readFileSync(Aduplex1.file, 'latin1');
  const w = (n, txt) => { const f = path.join(OUT, 'ctl_' + n + '.ifc'); fs.writeFileSync(f, Buffer.from(txt, 'latin1')); return f; };
  // (a) duplicate GlobalId injected: give the 2nd IfcWindow the 1st window's GlobalId
  const wins = [...good.matchAll(/IFCWINDOW\('([^']{22})'/g)];
  ctlRun('corrupt-dup-guid', w('dup', good.replace(wins[1][0], "IFCWINDOW('" + wins[0][1] + "'")), 'FAIL');
  // (b) null a ContextOfItems
  ctlRun('corrupt-null-context', w('nullctx', good.replace(/IFCSHAPEREPRESENTATION\(#\d+,/, 'IFCSHAPEREPRESENTATION($,')), 'FAIL');
  // (c) invalid GlobalId first char
  ctlRun('corrupt-bad-guid-char', w('badguid', good.replace(wins[2][0], "IFCWINDOW('Z" + wins[2][1].slice(1) + "'")), 'FAIL');
  // (d) truncated mid-DATA (no ENDSEC)
  ctlRun('corrupt-truncated', w('trunc', good.slice(0, Math.floor(good.length * 0.4))), 'FAIL');
  // (e) orphan: drop the containment relation
  ctlRun('corrupt-orphans', w('orphan', good.replace(/#\d+=IFCRELCONTAINEDINSPATIALSTRUCTURE\([^;]*;/g, '')), 'FAIL');
  // (f) empty population must be INCONCLUSIVE, never PASS
  const hdr = good.slice(0, good.indexOf('DATA;') + 5);
  ctlRun('empty-population', w('empty', hdr + '\nENDSEC;\nEND-ISO-10303-21;\n'), 'INCONCLUSIVE');
  const wrong = ctl.filter(c => c.got !== c.expect);
  const passedBad = ctl.filter(c => c.expect === 'FAIL' && c.got === 'PASS');
  if (fail8.length) x8 = 'INCONCLUSIVE';
  if (wrong.length) x8 = 'FAIL';
  if (ctl.length && passedBad.length === ctl.filter(c => c.expect === 'FAIL').length) { x8 = 'VACUOUS'; }
  claim('X8', x8, 'controls=' + ctl.length + ' wrong=' + wrong.map(c => c.name + ':' + c.got).join(',') + (fail8.length ? ' missing=' + fail8.join(',') : '') +
    ' — a validator that passes every control would print VACUOUS');

  // ---------- verdict ----------
  const core = ['X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'X8'].map(k => results[k]);
  let v;
  if (core.includes('VACUOUS')) v = 'VACUOUS';
  else if (x1.every(r => !r.elements)) v = 'INCONCLUSIVE';
  else if (core.includes('FAIL')) v = results.X5 === 'FAIL' && ['X1', 'X2', 'X3', 'X4'].every(k => results[k] === 'PASS') ? 'PARTIAL' : 'FAIL';
  else if (core.includes('INCONCLUSIVE')) v = 'INCONCLUSIVE';
  else v = 'PASS';
  L('§IFCX_VERDICT ' + v + ' ' + Object.keys(results).map(k => k + '=' + results[k]).join(' '));
  process.exitCode = v === 'PASS' ? 0 : 1;
})().catch(e => { L('§IFCX_VERDICT FAIL harness-error ' + (e.stack || e)); process.exit(2); });
