#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-VIEWER-DOWNLOAD (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §0.15). READ THE §-LOG after every run; an exit code is not evidence.
 * ISSUE it proves or disproves: a Viewer verb works only inside a checkout, or its answer from the live page is not the served building's.
 * An EMPTY folder gets only door.js, verbs.json, viewer_verbs.js, viewer_driver.js (from the live site; --local = this tree's files, still against the live page). The door there runs
 * viewer.counts on the public Duplex; the expected numbers are an independent SQL count on the SERVED building bytes with the SERVED patch applied (downloaded here), never a literal.
 * Headless Chrome on the CPU (SwiftShader); no GPU, no bake. Falsifier (must FAIL): VIEWER_DL_BREAK=Clinic (the tool opens another building than the one asked).
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib'), { spawn } = require('child_process');
const { kit, stripMs, ROOT } = require('../../common/door/tests/_kit');
const k = kit('W-VIEWER-DOWNLOAD');
const VD = require('../tools/viewer_driver.js'), LOCAL = process.argv.indexOf('--local') >= 0;
const FILES = ['common/door/door.js', 'common/door/verbs.json', 'viewer/tools/viewer_verbs.js', 'viewer/tools/viewer_driver.js'];
const bin = (url) => new Promise((res, rej) => require('https').get(url, { family: 4 }, (r) => { const c = []; r.on('data', d => c.push(d)); r.on('end', () => res({ status: r.statusCode, body: Buffer.concat(c) })); }).on('error', rej));
(async () => {
  let base, served, patch;
  try {
    base = await VD.liveBase();
    served = await bin(base + 'buildings/Duplex_extracted.db'); patch = await bin(base + 'buildings/patches/Duplex_extracted.db.sql');
    if (served.status !== 200) throw new Error('the bucket answered HTTP ' + served.status + ' for the Duplex');
  } catch (e) { k.incon('REACH', 'the live site or the bucket cannot be reached: ' + e.message); return k.end(); }
  // ── the flat folder ──
  const flat = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer_dl_'));
  for (const rel of FILES) { if (LOCAL) fs.copyFileSync(path.join(ROOT, rel), path.join(flat, path.basename(rel))); else { const r = await bin(VD.LIVE_SITE + rel + '?nc=' + Date.now()); if (r.status !== 200) { k.incon('FILES', rel + ' is not on the live site yet (HTTP ' + r.status + ')'); return k.end(); } fs.writeFileSync(path.join(flat, path.basename(rel)), r.body); } }
  k.L('flat folder ' + flat + ' holds ' + fs.readdirSync(flat).join(', ') + ' (' + (LOCAL ? 'this tree\'s files' : 'from the live site') + ')');
  k.chk('FLAT the folder holds only the 4 files and no page tree (no viewer.html anywhere in it)', fs.readdirSync(flat).length === 4 && !fs.existsSync(path.join(flat, 'viewer')), fs.readdirSync(flat).join(','));
  const door = (line, actor, env) => new Promise((res) => { let o = '', e = ''; const t0 = Date.now(), p = spawn(process.execPath, [path.join(flat, 'door.js'), '--actor', actor || 'human', '--journal', path.join(flat, 'journal.jsonl'), line], { cwd: flat, env: Object.assign({}, process.env, env || {}), stdio: ['ignore', 'pipe', 'pipe'] }); p.stdout.on('data', d => { o += d; }); p.stderr.on('data', d => { e += d; }); p.on('close', c => { let j = null; try { j = JSON.parse(o.trim().split('\n').pop()); } catch (x) { /* judged below */ } res({ code: c, j, err: e, ms: Date.now() - t0 }); }); });
  // ── expected: SQL on the served bytes, the served patch applied by the loader's own chunker ──
  const SQL = await require(path.join(ROOT, 'common/lib/sql-wasm.js'))({ wasmBinary: fs.readFileSync(path.join(ROOT, 'common/lib/sql-wasm.wasm')) });
  const raw = served.body[0] === 0x1f && served.body[1] === 0x8b ? zlib.gunzipSync(served.body) : served.body, M = new SQL.Database(raw);
  if (patch.status === 200) require(path.join(ROOT, 'common/door/object_cli.js')).loadChunker()(M, patch.body.toString('utf8'));
  const q = (sql) => { const r = M.exec(sql); return r.length ? r[0].values : []; };
  const total = q('SELECT count(*) FROM elements_meta')[0][0], byDisc = Object.fromEntries(q('SELECT discipline, count(*) FROM elements_meta GROUP BY discipline'));
  k.L('served Duplex bytes=' + raw.length + ' elements=' + total + ' by discipline=' + JSON.stringify(byDisc) + ' patch HTTP ' + patch.status);
  if (!total) { k.incon('SERVED', 'the served building holds no element'); return k.end(); }
  // ── the verb, from the flat folder ──
  const c1 = await door('viewer.counts building=Duplex'), a = c1.j && c1.j.answer;
  if (!c1.j || c1.j.status !== 'ok') k.chk('COUNT viewer.counts from the flat folder answers ok', false, c1.j ? c1.j.status + ' ' + c1.j.why : c1.err.slice(-300));
  else {
    const same = (x, y) => JSON.stringify(Object.keys(x).sort().map(n => [n, x[n]])) === JSON.stringify(Object.keys(y).sort().map(n => [n, y[n]]));
    k.chk('COUNT the total = SQL count on the served bytes', a.value.total === total, 'door=' + a.value.total + ' sql=' + total);
    k.chk('COUNT the per-discipline numbers = SQL on the served bytes', same(a.value.groups, byDisc), 'door=' + JSON.stringify(a.value.groups) + ' sql=' + JSON.stringify(byDisc));
    k.chk('LIVE the answer says the live Viewer page was opened (page=live), not a local page tree', a.page === 'live', 'page=' + a.page);
    const c2 = await door('viewer.counts building=Duplex by=storey'), g2 = c2.j && c2.j.answer && c2.j.answer.value;
    k.chk('COUNT by=storey sums to the same total', !!g2 && g2.total === total && Object.values(g2.groups).reduce((s, n) => s + n, 0) === total, g2 ? 'total=' + g2.total + ' storeys=' + Object.keys(g2.groups).length : (c2.j && c2.j.why));
    const ai = await door('viewer.counts building=Duplex', 'ai'), norm = (j) => { const o = JSON.parse(stripMs(j)); delete o.request; delete o.actor; return JSON.stringify(o).replace(/\b\d+(\.\d+)?\s?ms\b/g, '*ms').replace(/\b(ms|time)=[\d.]+/g, '$1=*'); };
    k.chk('ACTOR an AI gets the same envelope apart from request, actor and timing figures', ai.j && ai.j.status === 'ok' && norm(ai.j) === norm(c1.j), ai.j && ai.j.status);
  }
  const un = await door('viewer.counts building=NoSuchBuilding');
  k.chk('NAMES an unknown building is an error naming it, with no browser started (under 10 s)', un.j && un.j.status === 'error' && /unknown building "NoSuchBuilding"/.test(un.j.why) && un.ms < 10000, (un.j && un.j.why) + ' ms=' + un.ms);
  k.L('door ms: counts=' + c1.ms + (process.env.VIEWER_DL_BREAK ? ' VIEWER_DL_BREAK=' + process.env.VIEWER_DL_BREAK : ''));
  k.end();
})().catch(e => { console.error('§W-VIEWER-DOWNLOAD HARNESS-ERROR ' + (e && e.stack || e)); process.exit(1); });
