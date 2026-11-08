#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-VIEWER-VERBS (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §19.4). READ THE §-LOG after every run: the exit code is not evidence.
// SCOPE: viewer/tools/viewer_verbs.js (viewer_counts, viewer_clashes) and their two tools in modeller/tools/bim_mcp.js. Public fixture: Duplex_extracted.db, read only.
// Each case names the issue it proves or disproves:
//  VV1 the verb's number is not the Viewer's: reply value == the Viewer's own §ASK_ANSWER line (to its 400-char cut) AND == a count taken here from the DB file.
//  VV2 the storey input is ignored: by=storey groups == GROUP BY storey from the DB, and differ from the discipline reply.
//  VV3 the clash list is made up: bboxOverlaps == hits= of the Viewer's own §CLASH_QUERY_RTREE line == the §ASK_ANSWER value; rowsTotal == the rows the Viewer returned.
//  VV4 a bad input reads as a result: missing / unknown building, bad `by`, a pair with no rule are errors through the connector; the first two start no browser (< 3 s).
//  VV5 the connector does not offer them: tools/list names both, each described with every input described; a scripted client gets the same value and Viewer line as the direct call.
//  VV6 the verbs write: the DB sha256 is unchanged after all runs.
//  VV-RED the witness cannot fail: VIEWER_VERB_BREAK=1 shifts the Viewer's number by 1; VV1 and VV3 must then catch it.
// A case whose population is empty prints INCONCLUSIVE, never PASS. Env: VIEWER_VERB_BREAK=1 (run the whole witness with the falsifier on: must FAIL), FIXTURE_DB.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), { spawn, spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const VERBS = path.join(ROOT, 'viewer', 'tools', 'viewer_verbs.js'), MCP = path.join(ROOT, 'modeller', 'tools', 'bim_mcp.js');
const DB = [process.env.FIXTURE_DB, path.join(ROOT, 'buildings', 'Duplex_extracted.db'), path.join(os.homedir(), 'bim-ootb', 'buildings', 'Duplex_extracted.db')]
  .filter(Boolean).find(f => fs.existsSync(f) && fs.statSync(f).size > 100000);
const L = (s) => console.log(s);
let pass = 0, fail = 0, inc = 0;
const ok = (id, good, info) => { good ? pass++ : fail++; L('§W-VIEWER-VERBS ' + (good ? 'PASS' : 'FAIL') + ' ' + id + ' — ' + info); };
const incon = (id, why) => { inc++; L('§W-VIEWER-VERBS INCONCLUSIVE ' + id + ' — ' + why); };
if (!DB) { L('§W-VIEWER-VERBS verdict=INCONCLUSIVE no Duplex_extracted.db (public fixture) found'); process.exit(2); }
const sha = () => crypto.createHash('sha256').update(fs.readFileSync(DB)).digest('hex');
const sha0 = sha(), env = (x) => Object.assign({}, process.env, { VIEWER_BLD_DIR: path.dirname(DB) }, x || {});
const sql = (q) => JSON.parse(spawnSync('python3', ['-I', '-c', 'import sqlite3,json,sys;c=sqlite3.connect("file:"+sys.argv[1]+"?mode=ro",uri=True);print(json.dumps(c.execute(sys.argv[2]).fetchall()))', DB, q], { encoding: 'utf8' }).stdout);
const run = (argv, x) => new Promise((res) => { let o = '', e = ''; const t0 = Date.now(), p = spawn(process.execPath, [VERBS].concat(argv), { env: env(x) });
  p.stdout.on('data', d => { o += d; }); p.stderr.on('data', d => { e += d; }); p.on('close', c => res({ code: c, out: o.trim(), err: e.trim(), ms: Date.now() - t0 })); });
const J = (r) => { try { return JSON.parse(r.out); } catch (e) { return null; } };
const lineVal = (j) => j && j.viewerLine ? j.viewerLine.slice(j.viewerLine.indexOf('value=') + 6) : null;
const canon = (x) => Array.isArray(x) ? x.map(canon) : x && typeof x === 'object' ? Object.keys(x).sort().reduce((o, k) => (o[k] = canon(x[k]), o), {}) : x;   // key order is not content
const eq = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
function client() {
  const p = spawn(process.execPath, [MCP], { env: env(), stdio: ['pipe', 'pipe', 'pipe'] }), wait = {}; let buf = '', id = 0;
  p.stderr.on('data', () => {});
  p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (!l.trim()) continue; const m = JSON.parse(l); if (wait[m.id]) { wait[m.id](m); delete wait[m.id]; } } });
  const rpc = (method, params) => new Promise((res) => { const k = ++id; wait[k] = res; p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: k, method, params }) + '\n'); });
  return { rpc, close: () => { p.stdin.end(); } };
}
(async () => {
  const BRK = process.env.VIEWER_VERB_BREAK === '1';
  L('§W-VIEWER-VERBS fixture ' + DB + ' sha256=' + sha0.slice(0, 12) + '…' + (BRK ? ' VIEWER_VERB_BREAK=1 (falsifier on: expect FAIL)' : ''));
  // VV1 + VV2
  const c1 = await run(['counts', '--building', 'Duplex']), j1 = J(c1);
  const dbBy = Object.fromEntries(sql('SELECT discipline,count(*) FROM elements_meta GROUP BY 1')), dbTot = sql('SELECT count(*) FROM elements_meta')[0][0];
  if (!j1 || !dbTot) incon('VV1', 'no answer or empty DB (exit ' + c1.code + '): ' + c1.err.slice(-200));
  else ok('VV1', JSON.stringify(j1.value).slice(0, 400) === lineVal(j1) && j1.value.total === dbTot && eq(j1.value.groups, dbBy),
    'verb total=' + j1.value.total + ' DB total=' + dbTot + ' groups=' + JSON.stringify(j1.value.groups) + ' DB groups=' + JSON.stringify(dbBy) + ' | Viewer line: ' + (j1.viewerLine || '').slice(0, 140));
  const c2 = await run(['counts', '--building', 'Duplex', '--by', 'storey']), j2 = J(c2);
  const dbSt = Object.fromEntries(sql('SELECT COALESCE(storey,"(none)"),count(*) FROM elements_meta GROUP BY 1'));
  if (!j2) incon('VV2', 'no answer (exit ' + c2.code + '): ' + c2.err.slice(-200));
  else ok('VV2', j2.value.by === 'storey' && eq(j2.value.groups, dbSt) && !!j1 && !eq(j2.value.groups, j1.value.groups) && JSON.stringify(j2.value).slice(0, 400) === lineVal(j2),
    'by=storey groups=' + JSON.stringify(j2.value.groups) + ' DB=' + JSON.stringify(dbSt));
  // VV3
  const k1 = await run(['clashes', '--building', 'Duplex', '--a', 'ARC', '--b', 'MEP']), jk = J(k1);
  if (!jk || !jk.value.bboxOverlaps) incon('VV3', 'no clash candidates or no answer (exit ' + k1.code + '): ' + k1.err.slice(-200));
  else {
    const rt = (jk.viewerLog.filter(l => l.indexOf('§CLASH_QUERY_RTREE ARC vs MEP') === 0).pop() || '').match(/hits=(\d+)/), hits = rt ? +rt[1] : null;
    ok('VV3', hits === jk.value.bboxOverlaps && jk.rowsTotal === hits && jk.rows.length === Math.min(20, hits) && JSON.stringify(jk.value).slice(0, 400) === lineVal(jk),
      'verb bboxOverlaps=' + jk.value.bboxOverlaps + ' Viewer §CLASH_QUERY_RTREE hits=' + hits + ' rowsTotal=' + jk.rowsTotal + ' rows=' + jk.rows.length + ' tol=' + jk.value.toleranceM);
    const v = jk.value; L('§W-VIEWER-VERBS OBSERVED Viewer answer, not changed by the verb: bboxOverlaps=' + v.bboxOverlaps + ' meshClashes=' + v.meshClashes + ' cleared=' + v.cleared + (v.cleared < 0 ? ' (NEGATIVE: the Viewer counts more mesh clashes than box overlaps; Viewer defect, find_ask.js runClash)' : ''));
  }
  // VV5 + VV4 through the connector
  const c = client();
  await c.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'witness_viewer_verbs', version: '1' } });
  const tools = ((await c.rpc('tools/list', {})).result || {}).tools || [], by = (n) => tools.filter(t => t.name === n)[0];
  const desc = ['viewer_counts', 'viewer_clashes'].every(n => by(n) && by(n).description.length > 60 && Object.keys(by(n).inputSchema.properties).every(k => (by(n).inputSchema.properties[k].description || '').length > 5));
  const mc = await c.rpc('tools/call', { name: 'viewer_counts', arguments: { building: 'Duplex' } }), mk = await c.rpc('tools/call', { name: 'viewer_clashes', arguments: { building: 'Duplex', discA: 'ARC', discB: 'MEP' } });
  const mj = (m) => { try { return JSON.parse(m.result.content[0].text); } catch (e) { return null; } }, mjc = mj(mc), mjk = mj(mk);
  if (!mjc || !mjk) incon('VV5', 'a connector call returned no JSON: ' + JSON.stringify([mc.result, mk.result]).slice(0, 300));
  else ok('VV5', desc && tools.length === 4 && mc.result.isError === false && mk.result.isError === false && !!j1 && !!jk && eq(mjc.value, j1.value) && mjc.viewerLine === j1.viewerLine && eq(mjk.value, jk.value) && mjk.viewerLine === jk.viewerLine,
    'tools=' + tools.map(t => t.name).join(',') + ' described=' + desc + ' connector counts total=' + mjc.value.total + ' clashes bboxOverlaps=' + mjk.value.bboxOverlaps);
  const t0 = Date.now(), e1 = await c.rpc('tools/call', { name: 'viewer_counts', arguments: {} }), e2 = await c.rpc('tools/call', { name: 'viewer_counts', arguments: { building: 'NoSuchBuilding' } }), fast = Date.now() - t0;
  const e3 = await c.rpc('tools/call', { name: 'viewer_counts', arguments: { building: 'Duplex', by: 'floor' } }), e4 = await c.rpc('tools/call', { name: 'viewer_clashes', arguments: { building: 'Duplex', discA: 'ARC', discB: 'ZZZ' } });
  const tx = (m) => m.result.content[0].text;
  ok('VV4', [e1, e2, e3, e4].every(m => m.result.isError === true) && /missing input: building/.test(tx(e1)) && /unknown building/.test(tx(e2)) && /discipline.*storey/.test(tx(e3)) && /no rule for ARC\/ZZZ/.test(tx(e4)) && fast < 3000,
    'errors: [' + [e1, e2, e3, e4].map(m => tx(m).slice(0, 70)).join(' | ') + '] first two in ' + fast + ' ms');
  c.close();
  // VV-RED: the falsifier shifts the Viewer's number; the VV1 and VV3 comparisons must see it
  const r1 = J(await run(['counts', '--building', 'Duplex'], { VIEWER_VERB_BREAK: '1' })), r2 = J(await run(['clashes', '--building', 'Duplex', '--a', 'ARC', '--b', 'MEP'], { VIEWER_VERB_BREAK: '1' }));
  if (!r1 || !r2) incon('VV-RED', 'falsifier runs gave no answer');
  else { const c1c = JSON.stringify(r1.value).slice(0, 400) !== lineVal(r1) || r1.value.total !== dbTot, c3c = JSON.stringify(r2.value).slice(0, 400) !== lineVal(r2);
    ok('VV-RED', c1c && c3c, 'VIEWER_VERB_BREAK=1: counts total=' + r1.value.total + ' vs DB ' + dbTot + ' (VV1 would FAIL: ' + c1c + '); clashes bboxOverlaps=' + r2.value.bboxOverlaps + ' vs Viewer line (VV3 would FAIL: ' + c3c + ')'); }
  ok('VV6', sha() === sha0, 'DB sha256 before=' + sha0.slice(0, 12) + ' after=' + sha().slice(0, 12));
  const verdict = fail ? 'FAIL' : (inc ? 'INCONCLUSIVE' : 'PASS');
  L('§W-VIEWER-VERBS verdict=' + verdict + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc);
  process.exit(fail ? 1 : inc ? 2 : 0);
})().catch(e => { L('§W-VIEWER-VERBS verdict=INCONCLUSIVE ' + (e && e.stack || e)); process.exit(2); });
