#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — product_judge.js. SCOPE: bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.56. Read the §PRODUCT lines after every run; exit code is not evidence.
// ISSUE IT EXPOSES: "what did this change do to the PRODUCT?" The 4D gates judged a node copy of the Time Machine on boxes nobody had checked; the
//   browser loaded the model differently and played another schedule. This judges the real viewer, headless, of ANY checkout (--root), against truth
//   that does not come from the code under test, and prints main and a branch side by side. A count that got worse fails; nothing is re-locked by hand.
// TRUTH: (1) what the product played = its own kernel_ops, read in the page; (2) where an element is = its mesh's box (scripts/element_true_boxes.py,
//   from the DB + its _geo half); (3) what it drew = real slot state at each cursor (viewer/tests/witness_tm_drawn_vs_scheduled.js, this checkout's copy).
// RULES (each a count; lower is better; 0 is the goal):
//   canvas   scheduled elements not drawn + drawn too early + incremental-vs-full differences, over play forward / scrub back / forward again / jumps
//   copy     elements the browser plays that the node copy (cache_4d_run.js of the same checkout) does not, or the reverse, or at another start (> 1 h)
//   box      played elements whose 4D box (the node copy's) is not the mesh's box (> the contact owner's EPS)
//   early    elements that start before their support is finished — the shipped judge (SupportSweep.midairAudit of --root) on the TRUE boxes, browser times
//   nopath   elements with no support path to the ground, same judge, same boxes
//   onNothing / beforeFloor / beforeWall / beforeFrame   the crawler's simple truths (scripts/lib/schedule_crawler.js), with a screenplay per building
// USE:  node scripts/product_judge.js run --root <checkout> --tag <name> <Building ...>      (Duplex HHS_Office_Federated JKR Clinic Terminal Hospital LTU_AHouse)
//       node scripts/product_judge.js compare <tagA> <tagB>                                 (exit 1 if any rule is worse in B on any building both have)
// Needs a headless browser with the GPU (the owner's go; never beside a live bake). Results: ~/.cache/bim4d/product/<tag>/<Building>.json + .log
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const HOME = os.homedir(), OUT = path.join(HOME, '.cache', 'bim4d', 'product'), BLD_DIR = process.env.BLD_DIR || path.join(HOME, 'bim-ootb', 'buildings');
const RULES = ['canvas', 'copy', 'box', 'early', 'nopath', 'onNothing', 'beforeFloor', 'beforeWall', 'beforeFrame'];
const CRAWLER = require(path.join(__dirname, 'lib', 'schedule_crawler.js'));
const PACK = process.env.RATES_PACK || 'cidb2024_my'; process.env.RATES_PACK = PACK;   // one pinned rate pack for the browser and the node copy (the viewer's own default)
const argv = process.argv.slice(2), cmd = argv.shift();
const REUSE = argv.indexOf('--reuse') >= 0; if (REUSE) argv.splice(argv.indexOf('--reuse'), 1);   // --reuse: judge again from the stored browser dump (no browser run)
const opt = k => { const i = argv.indexOf('--' + k); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; };

function dbOf(bld) {   // the files the viewer loads for this building, and the name it is opened by
  const meta = path.join(BLD_DIR, bld + '_meta.db'), geo = path.join(BLD_DIR, bld + '_geo.db'), ext = path.join(BLD_DIR, bld + '_extracted.db');
  const ok = f => fs.existsSync(f) && fs.statSync(f).size > 4096;
  if (ok(meta) && ok(geo)) return { open: bld, db: meta, geo: geo };
  if (ok(ext)) return { open: bld + '_extracted', db: ext, geo: null };
  return null;
}
// truth(root, bld, d) -> { guid: [x0, x1, y0, y1, z0, z1] } = where THAT product draws each mesh: the centre from the db as the viewer has it (raw file +
// the checkout's own patch, applied by the viewer's own chunker) + the mesh's own local min / max (read once from the db / its _geo half, cached).
const PARENT = {};   // bld -> { child guid: declared aggregate parent guid } (rel_aggregates of the db as the viewer has it)
async function truth(root, bld, d) {
  const f = path.join(OUT, '_truth', bld + '.local.json'); fs.mkdirSync(path.dirname(f), { recursive: true });
  if (!fs.existsSync(f) || fs.statSync(f).mtimeMs < fs.statSync(d.geo || d.db).mtimeMs) {
    const r = cp.spawnSync('python3', [path.join(__dirname, 'element_true_boxes.py'), f, d.db].concat(d.geo ? [d.geo] : []), { encoding: 'utf8' });
    process.stdout.write(r.stdout || ''); if (r.status !== 0) { console.log('§PRODUCT_TRUTH_FAIL ' + bld + ' ' + (r.stderr || '').slice(0, 300)); return null; }
  }
  const loc = JSON.parse(fs.readFileSync(f, 'utf8'));
  const SQL = await require(path.join(root, 'viewer', 'lib', 'sql-wasm.js'))({ wasmBinary: fs.readFileSync(path.join(root, 'viewer', 'lib', 'sql-wasm.wasm')) });
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(d.db))), BP = require(path.join(root, 'scripts', 'lib', 'apply_building_patch.js'));
  const pr = BP.applyTo(db, d.db, () => {}); if (pr.failed.length) console.log('§PRODUCT_TRUTH ' + bld + ' ⚠ the checkout\'s patch did not apply in node (' + pr.failed[0].err + ') — centres are the RAW file\'s');
  const out = {}, r = db.exec('SELECT guid, center_x, center_y, center_z FROM element_transforms'); let ag = []; try { ag = db.exec('SELECT child_guid, parent_guid FROM rel_aggregates'); } catch (e) {} db.close();
  PARENT[bld] = {}; (ag.length ? ag[0].values : []).forEach(v => { PARENT[bld][v[0]] = v[1]; });
  (r.length ? r[0].values : []).forEach(v => { const l = loc[v[0]]; if (l && v[1] !== null) out[v[0]] = [v[1] + l[0], v[1] + l[1], v[2] + l[2], v[2] + l[3], v[3] + l[4], v[3] + l[5]]; });
  return out;
}

async function runOne(root, tag, bld) {
  const d = dbOf(bld); if (!d) { console.log('§PRODUCT ' + tag + ' ' + bld + ' INCONCLUSIVE — no usable db in ' + BLD_DIR); return null; }
  const dir = path.join(OUT, tag); fs.mkdirSync(dir, { recursive: true });
  const dump = path.join(dir, bld + '.dump.json'), log = path.join(dir, bld + '.log'); if (!REUSE) { try { fs.unlinkSync(dump); } catch (e) {} }
  const env = Object.assign({}, process.env, { ROOT: root, BLD: d.open, BLD_DIR: BLD_DIR, GPU: process.env.GPU || 'real', RATES_PACK: PACK, SAMPLES: process.env.SAMPLES || '40', FINE: '0:0:0', REVEAL: '0', LOG: log, DUMP: dump });
  delete env.DBUS_SESSION_BUS_ADDRESS;
  const t0 = Date.now(), w = (REUSE && fs.existsSync(dump)) ? { stdout: '' } : cp.spawnSync('node', [path.join(__dirname, '..', 'viewer', 'tests', 'witness_tm_drawn_vs_scheduled.js')], { env: env, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 90 * 60 * 1000 });
  if (!fs.existsSync(dump)) { console.log('§PRODUCT ' + tag + ' ' + bld + ' INCONCLUSIVE — the viewer run gave no dump (see ' + log + '): ' + ((w.stdout || '').match(/§TM_DRAWN_VS_SCHEDULED verdict=.*/) || ['no verdict line'])[0]); return null; }
  const P = JSON.parse(fs.readFileSync(dump, 'utf8')), tb = await truth(root, bld, d); if (!tb) return null;
  // the node copy of the SAME checkout, built now (its own cache key; a hit is instant)
  const cb = cp.spawnSync('node', [path.join(root, 'scripts', 'cache_4d_run.js'), bld], { encoding: 'utf8', maxBuffer: 1 << 28, env: Object.assign({}, process.env, { BLD_DIR: BLD_DIR, RATES_PACK: PACK }) });
  fs.writeFileSync(path.join(dir, bld + '.copy.log'), (cb.stdout || '') + (cb.stderr || ''));
  const CACHE = require(path.join(root, 'scripts', 'cache_4d_run.js')), run = CACHE.read(bld), L = run ? CACHE.layerOf(run, 'played') : null;
  const SG = require(path.join(root, 'viewer', 'schedule_gate.js')); global.ScheduleGate = SG; global.CpmSchedule = require(path.join(root, 'viewer', 'cpm_schedule.js'));
  const SS = require(path.join(root, 'viewer', 'support_sweep.js')), DAY = 86400000, R = {};
  // canvas
  const paths = [{ cls: 'forward', maxMissing: P.forward.maxMissing, maxExtra: P.forward.maxExtra }].concat(P.paths.filter(r => r.kind === 'path'));
  const eq = P.forward.equivDiff + P.paths.filter(r => r.kind === 'equiv').reduce((a, r) => a + r.maxOther + r.maxExtra, 0) - P.paths.filter(r => r.kind === 'equiv' && r.cls === 'forward').reduce((a, r) => a + r.maxOther + r.maxExtra, 0);
  R.canvas = paths.reduce((a, r) => Math.max(a, r.maxMissing + r.maxExtra), 0) + eq;
  // copy: browser ops vs the node copy, each relative to its own first start
  const ops = P.ops, guids = Object.keys(ops); let bMin = Infinity; guids.forEach(g => { if (ops[g][0] < bMin) bMin = ops[g][0]; });
  // An op for an element with NOTHING to draw (a container the Time Machine parks at the end) is not something the product plays: counted apart.
  // The browser anchors its timeline at its own clock, so the two are compared after removing their COMMON shift (the median difference, printed):
  // one schedule moved as a whole is the same schedule; an element that moved against the rest is not.
  let onlyB = 0, onlyN = 0, late = 0, nMin = Infinity, els = {}, parked = 0, shiftH = 0;
  if (L) { for (const g in L.map) if (L.map[g].s < nMin) nMin = L.map[g].s; run.els.forEach(e => { els[e.guid] = e; });
    const dif = []; guids.forEach(g => { const m = L.map[g]; if (m) dif.push((ops[g][0] - bMin) - (m.s - nMin)); });
    dif.sort((x, y) => x - y); const med = dif.length ? dif[dif.length >> 1] : 0; shiftH = +(med / 3600000).toFixed(2);
    guids.forEach(g => { const m = L.map[g]; if (!m) { if (!ops[g][4]) parked++; else onlyB++; return; } if (Math.abs((ops[g][0] - bMin) - (m.s - nMin) - med) > 3600000) late++; });
    for (const g in L.map) if (!ops[g]) onlyN++; }
  R.copy = L ? onlyB + onlyN + late : null;
  // box: the 4D box (node copy's) vs the mesh's box
  let box = 0, noTruth = 0;
  if (L) run.els.forEach(e => { if (!L.map[e.guid]) return; const t = tb[e.guid]; if (!t) { noTruth++; return; }
    if (Math.max(Math.abs(t[0] - e.x0), Math.abs(t[1] - e.x1), Math.abs(t[2] - e.y0), Math.abs(t[3] - e.y1), Math.abs(t[4] - e.bz), Math.abs(t[5] - e.tz)) > SG.EPS) box++; });
  R.box = L ? box : null;
  // early / nopath: the shipped judge on TRUE boxes with the BROWSER's times. Class / sequence / phase per element come from the checkout's own classification (the node copy's rows).
  const items = []; let unjudged = 0;
  guids.forEach(g => { const t = tb[g], e = els[g]; if (!t || !e) { unjudged++; return; }
    items.push({ guid: g, cls: e.cls, seq: e.seq, phase: e.phase, storey: e.storey, x0: t[0], x1: t[1], y0: t[2], y1: t[3], bz: t[4], tz: t[5], s: ops[g][0], e: ops[g][1] }); });
  const q = console.log; console.log = () => {}; let ma; try { ma = SS.midairAudit(items); } finally { console.log = q; }
  R.early = items.length ? ma.midair : null; R.nopath = items.length ? ma.orphans : null;
  // the crawler: simple truths, one element at a time, on what the product played (scripts/lib/schedule_crawler.js) + the screenplay a person can read
  const cr = CRAWLER.crawl(items, PARENT[bld] || {}); Object.assign(R, cr.counts);
  fs.writeFileSync(path.join(dir, bld + '.items.json'), JSON.stringify({ parent: PARENT[bld] || {}, items: items }));   // what was judged, for scripts/proto_method_order.js
  // the same facts for the film (bim-compiler scripts/film_4d_true_box/render.py): per element its played days, phase, true box, and whether it breaks a truth when it appears
  { let f0 = Infinity; items.forEach(e => { if (e.s < f0) f0 = e.s; }); const brk = new Set(ma.guids || []); Object.keys(cr.guids).forEach(k => cr.guids[k].forEach(g => brk.add(g))); const np = new Set(ma.orphanGuids || []);
    fs.writeFileSync(path.join(dir, bld + '.film.json'), JSON.stringify({ run: tag + ' ' + P.commit, days: (P.projectEnd - P.projectStart) / DAY, n: items.length, broken: brk.size, nopath: np.size,
      rows: items.map(e => [e.guid, +((e.s - f0) / DAY).toFixed(4), +((e.e - f0) / DAY).toFixed(4), e.phase, e.cls, e.x0, e.x1, e.y0, e.y1, e.bz, e.tz, brk.has(e.guid) ? 1 : 0, np.has(e.guid) ? 1 : 0]) })); }
  fs.writeFileSync(path.join(dir, bld + '.screenplay.txt'), ['SCREENPLAY — ' + bld + ' — what the product plays (' + tag + ', commit ' + P.commit + ', rate pack ' + PACK + ')',
    'Each level: its trades in the order they first appear. ✗ = a simple truth broken, with the two days that prove it.',
    'broken truths: ' + Object.keys(cr.counts).map(k => k + ' ' + cr.counts[k] + ' of ' + cr.judged[k]).join(' · ')].concat(cr.lines).join('\n') + '\n');
  const res = { tag, bld, root, commit: P.commit, elements: guids.length, days: +((P.projectEnd - P.projectStart) / DAY).toFixed(1), drawable: P.rep.M + P.rep.B + P.rep.I, rules: R,
    detail: { paths: paths.map(r => r.cls + ':' + (r.maxMissing + r.maxExtra)).join(' '), incrementalVsFull: eq, heldByCanvas: P.heldInMap, onlyBrowser: onlyB, onlyCopy: onlyN, otherStart: late, commonShiftH: shiftH, parkedNoGeometry: parked,
      copyElements: L ? Object.keys(L.map).length : null, unjudged, noTruth, earlyGuids: (ma.guids || []).slice(0, 2000), nopathGuids: (ma.orphanGuids || []).slice(0, 2000) }, secs: Math.round((Date.now() - t0) / 1000) };
  fs.writeFileSync(path.join(dir, bld + '.json'), JSON.stringify(res));
  console.log('§PRODUCT ' + tag + ' ' + bld + ' commit=' + res.commit + ' elements=' + res.elements + ' days=' + res.days + ' drawable=' + res.drawable + ' | ' + RULES.map(k => k + '=' + (R[k] === null ? 'INCONCLUSIVE' : R[k])).join(' ') +
    ' | canvas[' + res.detail.paths + ' incrVsFull:' + eq + ' held:' + P.heldInMap + '] copy[onlyBrowser:' + onlyB + ' onlyCopy:' + onlyN + ' otherStart:' + late + ' commonShiftH:' + shiftH + ' parkedNoGeometry:' + parked + '] unjudged=' + unjudged + ' secs=' + res.secs);
  return res;
}

if (cmd === 'run') {
  const root = path.resolve(opt('root') || path.join(__dirname, '..')), tag = opt('tag') || 'run';
  if (!argv.length) { console.log('usage: product_judge.js run --root <checkout> --tag <name> <Building ...>'); process.exit(1); }
  (async () => { let bad = 0; for (const b of argv) { if (!(await runOne(root, tag, b))) bad++; }
    console.log('§PRODUCT_RUN tag=' + tag + ' root=' + root + ' buildings=' + argv.length + ' inconclusive=' + bad); process.exit(bad ? 2 : 0); })();
} else if (cmd === 'compare') {
  const [a, b] = argv, rd = t => { const o = {}; try { fs.readdirSync(path.join(OUT, t)).forEach(f => { if (/^[^.]+\.json$/.test(f)) { const r = JSON.parse(fs.readFileSync(path.join(OUT, t, f), 'utf8')); o[r.bld] = r; } }); } catch (e) {} return o; };
  const A = rd(a), B = rd(b), both = Object.keys(A).filter(k => B[k]); let worse = 0, better = 0, same = 0;
  if (!both.length) { console.log('§PRODUCT_COMPARE INCONCLUSIVE — no building judged under both ' + a + ' and ' + b); process.exit(2); }
  console.log('§PRODUCT_COMPARE ' + a + ' (' + A[both[0]].commit + ') -> ' + b + ' (' + B[both[0]].commit + ')   each cell: ' + a + ' -> ' + b);
  both.forEach(k => { const cells = RULES.map(r => { const x = A[k].rules[r], y = B[k].rules[r]; let m = '=';
      if (x === null || y === null) m = '?'; else if (y > x) { m = 'WORSE'; worse++; } else if (y < x) { m = 'better'; better++; } else same++;
      return r + ' ' + x + ' -> ' + y + (m === '=' ? '' : ' ' + m); });
    console.log('§PRODUCT_ROW ' + k.padEnd(22) + ' days ' + A[k].days + ' -> ' + B[k].days + ' | ' + cells.join(' | ')); });
  console.log('§PRODUCT_VERDICT ' + (worse ? 'FAIL' : 'PASS') + ' worse=' + worse + ' better=' + better + ' same=' + same + ' buildings=' + both.length + ' (a rule that got worse on any building fails; nothing is re-locked)');
  process.exit(worse ? 1 : 0);
} else { console.log('usage: product_judge.js run|compare …'); process.exit(1); }
