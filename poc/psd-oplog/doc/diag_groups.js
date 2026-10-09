// Diagnostic: one feature per document, exported to PSD, compared (python) against psd-tools' independent composite. Usage: node doc/diag_groups.js && python3 -I doc/diag_groups.py
const fs = require('fs'), path = require('path'); const S = require('../stack.js'), DF = require('./docfold.js'), { exportPsd } = require('./psd_export.js');
const W = 128, OUT = path.join(__dirname, '.emit_diag'); fs.mkdirSync(OUT, { recursive: true });
const rng = (seed) => { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }, r4 = (x) => Math.round(x * 1e4) / 1e4;
const dabs = (ops, layer, n, rnd, big) => { for (let i = 0; i < n; i++) ops.push({ op: 'dab', layer, x: r4(rnd() * W), y: r4(rnd() * W), r: r4((big ? 14 : 6) + rnd() * W * (big ? 0.3 : 0.18)), c: [r4(rnd()), r4(rnd()), r4(rnd())], a: r4(0.3 + rnd() * 0.65) }); };
const L = (id, mode, opacity, extra = {}) => ({ op: 'layer', id, mode, opacity, mask: !!extra.mask, space: 'srgb', ...(extra.parent !== undefined ? { parent: extra.parent } : {}), ...(extra.clip ? { clip: true } : {}) });
const G = (id, mode, opacity, extra = {}) => ({ op: 'group', id, mode, opacity, mask: !!extra.mask, ...(extra.parent !== undefined ? { parent: extra.parent } : {}) });
function doc(feature) {
  const rnd = rng(5), ops = [{ op: 'doc', v: 2, w: W, h: W, working: 'srgb', gamma: 'encoded' }, L(0, 'normal', 1), { op: 'fill', layer: 0, c: [0.55, 0.5, 0.6], a: 1 }]; dabs(ops, 0, 15, rnd);
  const lay = (id, mode, op, ex, big) => { ops.push(L(id, mode, op, ex)); dabs(ops, id, 30, rnd, big); };
  switch (feature) {
    case 'flat': lay(1, 'multiply', 0.9); lay(2, 'screen', 0.8); break;
    case 'passthrough_op1': ops.push(G(10, 'pass-through', 1)); lay(1, 'multiply', 0.9, { parent: 10 }); lay(2, 'screen', 0.8, { parent: 10 }); break;
    case 'passthrough_op07': ops.push(G(10, 'pass-through', 0.7)); lay(1, 'multiply', 0.9, { parent: 10 }); lay(2, 'screen', 0.8, { parent: 10 }); break;
    case 'passthrough_mask': ops.push(G(10, 'pass-through', 1, { mask: true })); lay(1, 'multiply', 0.9, { parent: 10 }); lay(2, 'screen', 0.8, { parent: 10 });
      for (let i = 0; i < 12; i++) ops.push({ op: 'mdab', layer: 10, x: r4(rnd() * W), y: r4(rnd() * W), r: r4(12 + rnd() * 30), v: i % 2 ? 1 : 0, a: 1 }); break;
    case 'isolated_normal_op1': ops.push(G(10, 'normal', 1)); lay(1, 'multiply', 0.9, { parent: 10 }); lay(2, 'screen', 0.8, { parent: 10 }); break;
    case 'isolated_overlay_op08': ops.push(G(10, 'overlay', 0.8)); lay(1, 'multiply', 0.9, { parent: 10 }); lay(2, 'screen', 0.8, { parent: 10 }); break;
    case 'clip_multiply': lay(1, 'normal', 1); lay(2, 'multiply', 1, { clip: true }, true); break;
    case 'clip_normal_op06': lay(1, 'normal', 1); lay(2, 'normal', 0.6, { clip: true }, true); break;
    case 'clip_base_op05': lay(1, 'normal', 0.5); lay(2, 'multiply', 1, { clip: true }, true); break;
    case 'clip_base_multiply': lay(1, 'multiply', 1); lay(2, 'normal', 1, { clip: true }, true); break;
    case 'clip_in_group': ops.push(G(10, 'pass-through', 1)); lay(1, 'normal', 1, { parent: 10 }); lay(2, 'multiply', 1, { parent: 10, clip: true }, true); break;
  }
  return ops;
}
const features = ['flat', 'passthrough_op1', 'passthrough_op07', 'passthrough_mask', 'isolated_normal_op1', 'isolated_overlay_op08', 'clip_multiply', 'clip_normal_op06', 'clip_base_op05', 'clip_base_multiply', 'clip_in_group'];
(async () => { const L_ = await import('lcms-wasm'), lcms = await L_.instantiate(), ctx = { L: L_, lcms, blobs: new Map() };
  for (const f of features) { const ops = doc(f), ex = exportPsd(ops, { ...ctx, _profiles: undefined }); fs.writeFileSync(path.join(OUT, f + '.psd'), ex.bytes); fs.writeFileSync(path.join(OUT, f + '.work.rgba8'), ex.merged); }
  fs.writeFileSync(path.join(OUT, 'features.json'), JSON.stringify(features)); console.log('wrote', features.length, 'documents to', OUT); })();
