// Usage: node perf/run_dirty.js   Dirty-tile compositing: D1-D6 (pre-registered in witness_log/HYPOTHESES.md before this file existed).
const fs = require('fs'), path = require('path'), S = require('../stack.js'), { makeDirty } = require('./dirty.js');
const rec = [], fails = [], num = {};
const chk = (id, name, value, cmp, limit) => { const pass = cmp === '<=' ? value <= limit : cmp === '>=' ? value >= limit : value === limit; rec.push({ id, name, value, cmp, limit, pass }); if (!pass) fails.push({ id, name, value, cmp, limit }); };
const rng = (seed) => { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }, r4 = (x) => Math.round(x * 1e4) / 1e4;
const now = () => Number(process.hrtime.bigint()) / 1e6, med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
const col = (rnd) => [r4(rnd()), r4(rnd()), r4(rnd())];
const dab = (rnd, W, layer, rmin, rmax) => ({ op: 'dab', layer, x: r4(rnd() * W), y: r4(rnd() * W), r: r4(rmin + rnd() * (rmax - rmin)), c: col(rnd), a: r4(0.2 + rnd() * 0.7) });
const mdab = (rnd, W, layer) => ({ op: 'mdab', layer, x: r4(rnd() * W), y: r4(rnd() * W), r: r4(10 + rnd() * W * 0.15), v: [0, 1, 0.5][(rnd() * 3) | 0], a: r4(0.5 + rnd() * 0.5) });
// documents: heads (structure ops) + the ids that accept dabs / mdabs
function flatDoc(nl) { const M = ['normal', 'multiply', 'screen', 'overlay'], ops = []; for (let i = 0; i < nl; i++) ops.push({ op: 'layer', id: i, mode: M[i % 4], opacity: 0.85, mask: i === 2 }); ops.push({ op: 'fill', layer: 0, c: [0.5, 0.5, 0.5], a: 1 }); return { ops, dabL: [...Array(nl).keys()], maskT: [2], newLayerId: nl }; }
function treeDoc() { const ops = [
  { op: 'layer', id: 0, mode: 'normal', opacity: 1, mask: false }, { op: 'fill', layer: 0, c: [0.5, 0.5, 0.5], a: 1 },
  { op: 'group', id: 10, mode: 'pass-through', opacity: 0.8, mask: false },
  { op: 'layer', id: 1, mode: 'multiply', opacity: 0.9, mask: false, parent: 10 }, { op: 'layer', id: 2, mode: 'screen', opacity: 0.8, mask: false, parent: 10, clip: true },
  { op: 'group', id: 11, mode: 'multiply', opacity: 0.9, mask: true },
  { op: 'layer', id: 3, mode: 'normal', opacity: 1, mask: false, parent: 11 }, { op: 'layer', id: 4, mode: 'hue', opacity: 0.8, mask: false, parent: 11 },
  { op: 'adjust', id: 20, kind: 'levels', params: { in_black: 10, in_white: 240, out_black: 0, out_white: 255, gamma_x100: 100 }, opacity: 0.9, mask: true },
  { op: 'layer', id: 5, mode: 'overlay', opacity: 0.85, mask: true }];
  return { ops, dabL: [0, 1, 2, 3, 4, 5], maskT: [11, 20, 5], newLayerId: 9 }; }
const equalBytes = (a, b) => Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;

// ---- D1-D4 correctness on W=512, two documents, 60 random edits each (+ non-local ops at fixed positions)
function correctness(name, doc, seed, inject) {
  const W = 512, rnd = rng(seed), st = S.newState(W); for (const o of doc.ops) S.apply(st, o);
  for (const l of doc.dabL) for (let k = 0; k < 6; k++) S.apply(st, dab(rnd, W, l, 20, 120));   // content on every layer
  const D = makeDirty(st); D.full();
  let mism = 0, outside = 0, localSeen = 0, nonlocalAll = 0, nonlocalOps = 0, dabL = doc.dabL.slice(), prev = S.composite(st);
  if (!equalBytes(D.back, prev)) mism++;
  const ops = [];
  for (let i = 0; i < 60; i++) {
    if (i === 15) ops.push({ op: 'fill', layer: dabL[1], c: col(rnd), a: 0.5 });
    else if (i === 30) ops.push({ op: 'set', layer: dabL[2], opacity: 0.5 });
    else if (i === 40) ops.push({ op: 'set', layer: dabL[3], mode: 'darken' });
    else if (i === 45) ops.push({ op: 'layer', id: doc.newLayerId, mode: 'screen', opacity: 0.7, mask: false });
    else if (rnd() < 0.2) ops.push(mdab(rnd, W, doc.maskT[(rnd() * doc.maskT.length) | 0]));
    else ops.push(dab(rnd, W, dabL[(rnd() * dabL.length) | 0], 10, 90));
    if (i === 45) dabL.push(doc.newLayerId);
  }
  let injected = false;
  for (const o of ops) {
    let stale = null; if (inject === 'stale' && !injected && (o.op === 'dab' || o.op === 'mdab')) { const t0 = D.tilesOf(o)[0]; stale = { t0, crop: D.cropState(t0 % D.tn, (t0 / D.tn) | 0) }; }   // crop taken BEFORE the op
    S.apply(st, o); const local = o.op === 'dab' || o.op === 'mdab';
    let tiles = D.tilesOf(o); if (local) { localSeen++; if (tiles === null) nonlocalAll++; } else { nonlocalOps++; if (tiles !== null) nonlocalAll++; }
    if (inject === 'drop' && local && !injected && tiles.length > 1) { const dropped = tiles.pop(); injected = true; for (const t of tiles) D.renderTile(t); tiles = tiles.concat([]); }   // renders all but one touched tile
    else if (stale) { injected = true; D.blit(stale.t0 % D.tn, (stale.t0 / D.tn) | 0, S.composite(stale.crop)); for (const t of tiles.slice(1)) D.renderTile(t); }   // first touched tile composited from the pre-op crop
    else D.after(o);
    const full = S.composite(st);
    if (!equalBytes(D.back, full)) mism++;
    // D2: any float that changed vs the previous full composite must lie in a reported dirty tile (null = all)
    if (tiles !== null && !inject) { const set = new Set(tiles); for (let i = 0; i < full.length; i += 4) { if (full[i] !== prev[i] || full[i+1] !== prev[i+1] || full[i+2] !== prev[i+2] || full[i+3] !== prev[i+3]) { const p = i >> 2, t = (((p / W) | 0) >> 6) * D.tn + ((p % W) >> 6); if (!set.has(t)) { outside++; break; } } } }
    prev = full;
  }
  return { mism, outside, local: localSeen, nonlocal: nonlocalOps, nonlocalWrongKind: nonlocalAll, hash: S.hashF32(D.back).slice(0, 12), n: ops.length };
}
const R = {};
for (const [nm, doc, seed] of [['flat', flatDoc(4), 11], ['tree', treeDoc(), 12]]) R[nm] = correctness(nm, doc, seed);
chk('D1', `flat doc, 4 layers: dirty-tile backdrop == full composite after every op (${R.flat.n} ops, final ${R.flat.hash})`, R.flat.mism, '==', 0);
chk('D1', `tree doc (groups, clip, mask, levels adjust, hue): dirty-tile backdrop == full composite after every op (${R.tree.n} ops, final ${R.tree.hash})`, R.tree.mism, '==', 0);
chk('D2', 'no pixel changes outside the reported dirty tiles (flat)', R.flat.outside, '==', 0); chk('D2', 'no pixel changes outside the reported dirty tiles (tree)', R.tree.outside, '==', 0);
chk('D3', `non-local ops (fill/set/layer) report all tiles, dab/mdab report a tile list (flat ${R.flat.nonlocal} non-local, tree ${R.tree.nonlocal})`, R.flat.nonlocalWrongKind + R.tree.nonlocalWrongKind, '==', 0);
const negD = correctness('flat', flatDoc(4), 11, 'drop'), negS = correctness('tree', treeDoc(), 12, 'stale');
chk('D4', `negative control (i): one touched tile left out of the recomposite is detected (mismatches ${negD.mism})`, negD.mism > 0, '==', true);
chk('D4', `negative control (ii): a tile composited from a stale crop is detected (mismatches ${negS.mism})`, negS.mism > 0, '==', true);
num.correctness = R;

// ---- D5/D6 speed at 2048^2
function speed(name, doc, perLayerDabs, nTimed, nFull, seed) {
  const W = 2048, rnd = rng(seed), st = S.newState(W); for (const o of doc.ops) S.apply(st, o);
  for (let d = 0; d < perLayerDabs; d++) for (const l of doc.dabL) S.apply(st, dab(rnd, W, l, 20, 200));
  let a = now(); const D = makeDirty(st); D.full(); const tInit = now() - a; S.composite(st);   // warm-up
  const tD = [], tF = [], edits = []; for (let i = 0; i < nTimed; i++) edits.push(dab(rnd, W, doc.dabL[(rnd() * doc.dabL.length) | 0], 20, 100));
  for (let i = 0; i < nTimed; i++) { a = now(); S.apply(st, edits[i]); const n = D.after(edits[i]).length; tD.push(now() - a); edits[i].tiles = n; }
  const fe = []; for (let i = 0; i < nFull; i++) fe.push(dab(rnd, W, doc.dabL[(rnd() * doc.dabL.length) | 0], 20, 100));
  for (let i = 0; i < nFull; i++) { a = now(); S.apply(st, fe[i]); S.composite(st); tF.push(now() - a); }
  return { name, dirty_ms_median: med(tD), dirty_ms_max: Math.max(...tD), full_ms_median: med(tF), tiles_median: med(edits.map((e) => e.tiles)), tiles_total: (W / 64) ** 2, init_all_tiles_ms: tInit, speedup: med(tF) / med(tD) };
}
const P5 = speed('flat 8 layers', flatDoc(8), 40, 30, 8, 21), P6 = speed('tree doc', treeDoc(), 40, 20, 4, 22);
num.D5 = P5; num.D6 = P6;
chk('D5', `flat 8 layers 2048^2: dirty edit median ${P5.dirty_ms_median.toFixed(1)} ms (max ${P5.dirty_ms_max.toFixed(1)}; ${P5.tiles_median}/${P5.tiles_total} tiles), full ${P5.full_ms_median.toFixed(0)} ms`, +P5.dirty_ms_median.toFixed(1), '<=', 100);
chk('D5', `flat speedup (${P5.speedup.toFixed(1)}x)`, +P5.speedup.toFixed(1), '>=', 8);
chk('D6', `tree doc 2048^2: dirty edit median ${P6.dirty_ms_median.toFixed(1)} ms (${P6.tiles_median} tiles), full ${P6.full_ms_median.toFixed(0)} ms, speedup ${P6.speedup.toFixed(1)}x`, +P6.speedup.toFixed(1), '>=', 5);

const out = { n_checks: rec.length, gate: fails.length ? 'FAIL' : 'PASS', fails, numbers: num, checks: rec, node: process.version, cpus: require('os').cpus()[0].model };
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true }); fs.writeFileSync(path.join(__dirname, 'out', 'dirty.json'), JSON.stringify(out, null, 1)); console.log(JSON.stringify({ ...out, checks: undefined }, null, 1)); process.exit(fails.length ? 1 : 0);
