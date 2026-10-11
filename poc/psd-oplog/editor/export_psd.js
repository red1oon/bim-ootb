// Export a saved editor log (JSON from the page's "Save log") to a PSD. Usage: node editor/export_psd.js painting.oplog.json out.psd
// Folds the log with the same engine as the page, writes every layer as an 8-bit straight RGBA raster in an sRGB / gamma-encoded schema-v1 document, keeps each layer's mode and opacity, and calls doc/psd_export.exportPsd.
const fs = require('fs'), S = require('../stack.js'), Br = require('../filters/brush.js'), Bl = require('../filters/blur.js'), Sch = require('../doc/schema.js'), { exportPsd } = require('../doc/psd_export.js');
const F = Math.fround, q8 = (v) => Math.max(0, Math.min(255, Math.floor(v * 255 + 0.5))), r4 = (x) => Math.round(x * 1e4) / 1e4;
const LO = require('./layer_ops.js'), applyOp = (st, o) => (LO.apply(st, o) ? undefined : o.op === 'blur' ? Bl.applyOp(st, o) : Br.applyOp(st, o));
function foldLog(j) { if (j.format !== 'psd-oplog-editor' || j.v !== 1) throw new Error('not an editor log'); const st = S.newState(j.W); for (const o of j.ops) applyOp(st, o); return st; }
function layerRGBA8(l, n) { const out = new Uint8Array(n * 4); for (let i = 0; i < n; i++) { const a = l.pix[i*4+3]; out[i*4+3] = q8(a); if (a > 0) for (let k = 0; k < 3; k++) out[i*4+k] = q8(F(l.pix[i*4+k] / a)); } return out; }
async function exportLog(json) {
  const j = typeof json === 'string' ? JSON.parse(json) : json, st = foldLog(j), W = j.W, n = W * W, blobs = new Map(), meta = LO.meta(st), ops = [{ op: 'doc', v: 1, w: W, h: W, working: 'srgb', gamma: 'encoded' }], layers = [];
  for (const id of st.order) { const l = st.L[id], rgba = layerRGBA8(l, n), sha = S.sha256(rgba); blobs.set(sha, rgba); ops.push({ op: 'layer', id, mode: l.mode, opacity: r4(meta[id].opacity), mask: false, space: 'srgb' }, { op: 'raster', layer: id, pixels: sha }); layers.push({ id, mode: l.mode, opacity: r4(meta[id].opacity), rgba }); }
  const errs = Sch.validate(ops, blobs); if (errs.length) throw new Error('schema: ' + errs.join('; '));
  const L = await import('lcms-wasm'), lcms = await L.instantiate(), ex = exportPsd(ops, { L, lcms, blobs, _profiles: undefined }, { meta });
  return { bytes: ex.bytes, layers, st, W, display: S.toRGBA8(S.composite(st)), info: ex.info };
}
module.exports = { exportLog, foldLog, layerRGBA8 };
if (require.main === module) { const [inp, out] = process.argv.slice(2); if (!inp || !out) { console.error('usage: node editor/export_psd.js in.oplog.json out.psd'); process.exit(2); } exportLog(fs.readFileSync(inp, 'utf8')).then((r) => { fs.writeFileSync(out, r.bytes); console.log(`wrote ${out}: ${r.bytes.length} bytes, ${r.layers.length} layers, profile ${r.info.profile}`); }).catch((e) => { console.error(e.message); process.exit(1); }); }
