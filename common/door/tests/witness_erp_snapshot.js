#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ERP-SNAPSHOT (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §0.16). READ THE §-LOG after every run; an exit code is not evidence.
 * ISSUE it proves or disproves: the kept image of "seed + self-heal patch" (the ERP door's speed-up) answers differently from a freshly patched one, or outlives a change of the patch.
 * No browser, no GPU, no pilot. The cache lives in a temp folder for the run (ERP_SNAPSHOT_DIR); the shipped seed is never written.
 * Falsifier (must make this witness FAIL): ERP_BREAK=stalesnap (the key ignores the patch bytes, so a changed patch is served from the old image).
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const { kit, run, stripMs, ROOT, DOOR } = require('./_kit');
const k = kit('W-ERP-SNAPSHOT');
const E = require('../erp_cli.js'), SEED = path.join(ROOT, 'erp', 'ad_seed.db');
const quiet = async (fn) => { const w = process.stderr.write; let err = ''; process.stderr.write = (s) => { err += s; return true; }; try { return { v: await fn(), err }; } finally { process.stderr.write = w; } };
(async () => {
  if (!fs.existsSync(SEED) || fs.statSync(SEED).size < 1e6) { k.incon('SEED', 'erp/ad_seed.db is not in this checkout (or is a stub)'); return k.end(); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erpsnap_')); process.env.ERP_SNAPSHOT_DIR = dir; process.env.BIM_OBJECT_OPLOG = path.join(dir, 'ops.jsonl');
  const boot = async (env, db) => { const old = process.env.ERP_SNAPSHOT; if (env === 'off') process.env.ERP_SNAPSHOT = 'off'; else delete process.env.ERP_SNAPSHOT; const t0 = Date.now(); try { const r = await quiet(() => E.boot(db ? { db } : {})); return { O: r.v, line: (r.err.split('\n').filter(l => /snapshot=/.test(l))[0] || ''), ms: Date.now() - t0 }; } finally { if (old === undefined) delete process.env.ERP_SNAPSHOT; else process.env.ERP_SNAPSHOT = old; } };
  // ── 1 miss then hit ──
  const b1 = await boot('on'), files1 = fs.readdirSync(dir).filter(f => /\.db$/.test(f)), b2 = await boot('on');
  k.chk('CACHE the first call is a miss and writes exactly one image; the second is a hit', /snapshot=miss /.test(b1.line) && files1.length === 1 && /snapshot=hit /.test(b2.line) && fs.readdirSync(dir).filter(f => /\.db$/.test(f)).length === 1, b1.line.replace(/^§ERP /, '') + ' | ' + b2.line.replace(/^§ERP /, ''));
  // ── 2 the hit image = a fresh patch, table by table ──
  const off = await boot('off');
  const tables = (O) => O.rows("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map(r => r.name);
  const tH = tables(b2.O), tF = tables(off.O);
  const counts = (O, ts) => ts.map(t => t + ':' + O.rows('SELECT count(*) AS n FROM "' + t + '"')[0].n).join('|');
  const cH = counts(b2.O, tH), cF = counts(off.O, tF), rowsTotal = cF.split('|').reduce((s, x) => s + Number(x.split(':').pop()), 0);
  k.L('tables hit=' + tH.length + ' fresh=' + tF.length + ' rows(fresh)=' + rowsTotal);
  if (!tF.length || !rowsTotal) k.incon('IMAGE', 'the fresh image holds no table or no row');
  else k.chk('IMAGE every table and its row count are identical, hit vs freshly patched (' + tF.length + ' tables, ' + rowsTotal + ' rows)', tH.join() === tF.join() && cH === cF, 'tables ' + tH.length + '/' + tF.length);
  const FULL = ['ad_table', 'ad_column', 'ad_tab', 'ad_field', 'ad_window', 'ad_ref_list', 'ad_process', 'c_doctype', 'c_order', 'c_orderline', 'c_invoice', 'm_inout'].filter(t => tF.map(x => x.toLowerCase()).indexOf(t) >= 0);
  const hashOf = (O, t) => { const h = crypto.createHash('sha256'); O.rows('SELECT * FROM ' + t + ' ORDER BY 1, 2').forEach(r => h.update(JSON.stringify(r))); return h.digest('hex').slice(0, 16); };
  const diff = FULL.filter(t => hashOf(b2.O, t) !== hashOf(off.O, t));
  k.chk('IMAGE the full contents of ' + FULL.length + ' dictionary and document tables hash the same, hit vs fresh', FULL.length >= 8 && diff.length === 0, 'differing=' + diff.join(',') + ' tables=' + FULL.join(','));
  const schema = (O) => crypto.createHash('sha256').update(JSON.stringify(O.rows("SELECT type, name, sql FROM sqlite_master ORDER BY type, name"))).digest('hex').slice(0, 16);
  k.chk('IMAGE the schema (every table, index, view, trigger statement) is identical', schema(b2.O) === schema(off.O), schema(b2.O) + ' / ' + schema(off.O));
  // ── 3 the door's answers, hit vs off ──
  const num = off.O.rows("SELECT documentno FROM c_order WHERE documentno IS NOT NULL ORDER BY c_order_id LIMIT 1")[0], id = off.O.rows('SELECT c_order_id FROM c_order ORDER BY c_order_id LIMIT 1')[0];
  if (!num || !id) k.incon('DOOR', 'the seed holds no order to ask about');
  else {
    const J = path.join(dir, 'journal.jsonl'); let seq = 0;
    const ask = async (line, env) => { const r = await run(DOOR, ['--journal', J, '--request', 'sn-' + (++seq), line], Object.assign({ ERP_SNAPSHOT_DIR: dir, BIM_OBJECT_OPLOG: path.join(dir, 'ops.jsonl') }, env)); try { const o = JSON.parse(stripMs(r.out.split('\n').pop())); delete o.request; return JSON.stringify(o); } catch (e) { return 'UNPARSEABLE ' + r.err.slice(-120); } };
    for (const line of ['erp.find kind=Order number=' + num.documentno, 'erp.actions kind=Order id=' + id.c_order_id, 'erp.describe kind=Order']) {
      const a = await ask(line, {}), b = await ask(line, { ERP_SNAPSHOT: 'off' });
      k.chk('DOOR `' + line + '` gives the same envelope from the kept image and from a fresh patch', a === b && /"status":"ok"/.test(a), 'bytes=' + a.length + ' ' + (a === b ? 'equal' : 'DIFFER'));
    }
  }
  // ── 4 a changed patch is never served from the old image ──
  const cdir = fs.mkdtempSync(path.join(os.tmpdir(), 'erpsnap_seed_')), cseed = path.join(cdir, 'ad_seed.db'); fs.copyFileSync(SEED, cseed); fs.mkdirSync(path.join(cdir, 'patches'));
  ['ad_seed.db.sql', 'mfg.sql'].forEach(f => { const src = path.join(ROOT, 'erp', 'patches', f); if (fs.existsSync(src)) fs.copyFileSync(src, path.join(cdir, 'patches', f)); });
  const has = (O) => { try { return O.rows('SELECT count(*) AS n FROM zz_snapshot_probe')[0].n; } catch (e) { return -1; } };
  const c1 = await boot('on', cseed); const before = has(c1.O);
  fs.appendFileSync(path.join(cdir, 'patches', 'ad_seed.db.sql'), '\nCREATE TABLE zz_snapshot_probe (a);\nINSERT INTO zz_snapshot_probe VALUES (1);\n');
  const c2 = await boot('on', cseed), after = has(c2.O), c3 = await boot('on', cseed);
  k.chk('STALE after the patch gains a statement the next call is a miss and sees the new row; the call after that is a hit that still sees it', before === -1 && /snapshot=miss /.test(c2.line) && after === 1 && /snapshot=hit /.test(c3.line) && has(c3.O) === 1, 'before=' + before + ' after=' + after + ' | ' + c2.line.replace(/^§ERP /, ''));
  // ── 5 the cost ──
  const h2 = await boot('on'), o2 = await boot('off');
  k.L('boot ms: kept image=' + h2.ms + ' fresh patch=' + o2.ms + ' (this machine, this load)');
  k.chk('COST a boot from the kept image is faster than a fresh patch', h2.ms < o2.ms, h2.ms + ' ms vs ' + o2.ms + ' ms');
  k.chk('SAFE nothing was written beside the shipped seed (no new file in erp/), and the image sits only in the cache folder', !fs.readdirSync(path.join(ROOT, 'erp')).some(f => /ad_seed-[0-9a-f]{32}\.db/.test(f)), '');
  k.end();
})().catch(e => { console.error('§W-ERP-SNAPSHOT HARNESS-ERROR ' + (e && e.stack || e)); process.exit(1); });
