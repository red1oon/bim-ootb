// Witness: the op-log replay must reproduce golden hashes; tampering must be detected.
// Usage: node witness_oplog.js [--update]   (exit 1 on any mismatch). Golden values live in golden.json.
const fs = require('fs'), path = require('path'), S = require('./stack.js');
const W = 128, SEEDS = [1, 2, 3], G = path.join(__dirname, 'golden.json'), update = process.argv.includes('--update');
const got = {}, fails = [];
for (const seed of SEEDS) {
  const ops = S.makeScene(seed, W), log = S.chain(ops), back = S.composite(S.fold(ops, W));
  got['scene' + seed] = { ops: ops.length, chain_head: log[log.length - 1].h, f32_hash: S.hashF32(back), rgba8_hash: S.sha256(S.toRGBA8(back)) };
  if (S.verifyChain(log) !== -1) fails.push('scene' + seed + ': fresh chain does not verify');
  const t = JSON.parse(JSON.stringify(log)); t[Math.floor(t.length / 2)].op.a = 0.999;       // tamper
  if (S.verifyChain(t) !== Math.floor(t.length / 2)) fails.push('scene' + seed + ': tamper not detected at the tampered entry');
  const sw = JSON.parse(JSON.stringify(log)); [sw[5], sw[6]] = [sw[6], sw[5]];                 // reorder
  if (S.verifyChain(sw) === -1) fails.push('scene' + seed + ': reorder not detected');
  const o2 = ops.map((o) => ({ ...o })); o2[o2.length - 1] = { op: 'set', layer: 5, mode: 'screen' };   // semantic edit changes pixels
  if (S.hashF32(S.composite(S.fold(o2, W))) === got['scene' + seed].f32_hash) fails.push('scene' + seed + ': edit did not change pixels');
}
if (update) { fs.writeFileSync(G, JSON.stringify(got, null, 1) + '\n'); fs.writeFileSync(path.join(__dirname, 'golden.js'), 'var GOLDEN = ' + JSON.stringify(got) + ';\n'); console.log('golden.json + golden.js updated'); }
else { const want = JSON.parse(fs.readFileSync(G, 'utf8')); for (const k of Object.keys(want)) for (const f of Object.keys(want[k])) if (got[k][f] !== want[k][f]) fails.push(k + '.' + f + ' changed: ' + want[k][f] + ' -> ' + got[k][f]); }
console.log(fails.length ? 'WITNESS FAIL\n  ' + fails.join('\n  ') : 'WITNESS PASS (' + SEEDS.length + ' scenes: replay hashes, chain verify, tamper + reorder detected)');
process.exit(fails.length ? 1 : 0);
