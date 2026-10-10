// Usage: node icc/run_cmfold.js   Colour-managed fold at size: E1-E5 (pre-registered in witness_log/HYPOTHESES.md before this file existed). Needs lcms-wasm (npm i).
const fs = require('fs'), path = require('path'), S = require('../stack.js'), CM = require('./color_math.js'), O = require('../oracle.js'), IW = require('./icc_write.js'), { makeDirty } = require('../perf/dirty.js');
const rec = [], fails = [], num = {};
const chk = (id, name, value, cmp, limit) => { const pass = cmp === '<=' ? value <= limit : cmp === '>=' ? value >= limit : value === limit; rec.push({ id, name, value, cmp, limit, pass }); if (!pass) fails.push({ id, name, value, cmp, limit }); };
const F = Math.fround, rng = (seed) => { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }, r4 = (x) => Math.round(x * 1e4) / 1e4;
const now = () => Number(process.hrtime.bigint()) / 1e6, med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1], q8 = (v) => Math.max(0, Math.min(255, Math.floor(v * 255 + 0.5)));
const MODES = ['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'hard-light', 'darken', 'lighten'];
const dab = (rnd, W, layer, rmin, rmax) => ({ op: 'dab', layer, x: r4(rnd() * W), y: r4(rnd() * W), r: r4(rmin + rnd() * (rmax - rmin)), c: [r4(rnd()), r4(rnd()), r4(rnd())], a: r4(0.2 + rnd() * 0.7) });
const eq = (a, b) => Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;

(async () => {
  const L = await import('lcms-wasm'), lcms = await L.instantiate(), RC = L.INTENT_RELATIVE_COLORIMETRIC, NO = L.cmsFLAGS_NOOPTIMIZE;
  const p3Bytes = IW.matrixProfile('p3', 'Display P3 (generated)'), prof = { srgb: lcms.cmsCreate_sRGBProfile(), p3: lcms.cmsOpenProfileFromMem(p3Bytes, p3Bytes.length) }, xf = {};
  for (const a of ['srgb', 'p3']) for (const b of ['srgb', 'p3']) if (a !== b) xf[a + '>' + b] = lcms.cmsCreateTransform(prof[a], L.TYPE_RGB_16, prof[b], L.TYPE_RGB_16, RC, NO);
  const conv = (a, b, v16, n) => a === b ? v16 : lcms.cmsDoTransform(xf[a + '>' + b], v16, n);
  // ---- document: nl layers of float dab content -> 8-bit straight RGBA tagged srgb (id 0 and odd) / p3 (even) -> lcms import into the working space
  function makeDoc(W, nl, seed, work, dabsPer) {
    const rnd = rng(seed), src = S.newState(W); for (let i = 0; i < nl; i++) S.apply(src, { op: 'layer', id: i, mode: i === 0 ? 'normal' : MODES[i % MODES.length], opacity: 0.85, mask: false });
    S.apply(src, { op: 'fill', layer: 0, c: [0.5, 0.5, 0.5], a: 1 }); for (let l = 0; l < nl; l++) for (let k = 0; k < dabsPer; k++) S.apply(src, dab(rnd, W, l, 10, W * 0.2));
    const L8 = src.order.map((id) => { const l = src.L[id], rgba = new Uint8Array(W * W * 4); for (let i = 0; i < W * W; i++) { const a = l.pix[i*4+3]; rgba[i*4+3] = q8(a); if (a > 0) for (let k = 0; k < 3; k++) rgba[i*4+k] = q8(l.pix[i*4+k] / a); }
      return { id, mode: l.mode, opacity: l.opacity, rgba, tag: id === 0 || id % 2 ? 'srgb' : 'p3' }; });
    return { W, L8, work };
  }
  function importLayer(ly, W, work) { const n = W * W, in16 = new Uint16Array(n * 3); for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) in16[i*3+k] = ly.rgba[i*4+k] * 257;
    const o = conv(ly.tag, work, in16, n), pix = new Float32Array(n * 4); for (let i = 0; i < n; i++) { const a = F(ly.rgba[i*4+3] / 255); pix[i*4+3] = a; for (let k = 0; k < 3; k++) pix[i*4+k] = F(F(o[i*3+k] / 65535) * a); } return pix; }
  function stateOf(doc) { const st = S.newState(doc.W); for (const ly of doc.L8) { S.apply(st, { op: 'layer', id: ly.id, mode: ly.mode, opacity: ly.opacity, mask: false }); st.L[ly.id].pix = importLayer(ly, doc.W, doc.work); } return st; }
  // display export of a rect (tile or whole image) of the premultiplied backdrop into dst (straight RGBA8, W-wide)
  function exportRect(back, W, work, disp, x0, y0, tw, th, dst) { const n = tw * th, v16 = new Uint16Array(n * 3);
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) { const p = ((y0 + y) * W + x0 + x) * 4, a = back[p+3], j = (y * tw + x) * 3; for (let k = 0; k < 3; k++) v16[j+k] = a > 0 ? Math.max(0, Math.min(65535, Math.floor(F(back[p+k] / a) * 65535 + 0.5))) : 0; }
    const o = conv(work, disp, v16, n); for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) { const p = ((y0 + y) * W + x0 + x) * 4, j = (y * tw + x) * 3; for (let k = 0; k < 3; k++) dst[p+k] = Math.floor(o[j+k] / 257 + 0.5); dst[p+3] = q8(back[p+3]); } }
  const exportAll = (back, W, work, disp) => { const d = new Uint8Array(W * W * 4); exportRect(back, W, work, disp, 0, 0, W, W, d); return d; };
  // independent float64 reference (no ICC engine) on straight 8-bit layers of size W
  function refImage(L8, W, work, disp) { const n = W * W, st = { W, order: [], L: {} };
    for (const ly of L8) { const pix = new Float32Array(n * 4); for (let i = 0; i < n; i++) { const a = F(ly.rgba[i*4+3] / 255); pix[i*4+3] = a; const c8 = [ly.rgba[i*4], ly.rgba[i*4+1], ly.rgba[i*4+2]], c = ly.tag === work ? c8.map((v) => v / 255) : CM.xyzToRgb8(work, CM.rgbToXyz(ly.tag, c8)).map((v) => v / 255); for (let k = 0; k < 3; k++) pix[i*4+k] = F(F(c[k]) * a); }
      st.L[ly.id] = { mode: ly.mode, opacity: ly.opacity, pix, mask: null }; st.order.push(ly.id); }
    const { C, A } = O.spec64raw(st), res = new Uint8Array(n * 4); for (let i = 0; i < n; i++) { const c8 = [C[i*3] * 255, C[i*3+1] * 255, C[i*3+2] * 255], d = work === disp ? c8 : CM.xyzToRgb8(disp, CM.rgbToXyz(work, c8)); for (let k = 0; k < 3; k++) res[i*4+k] = Math.max(0, Math.min(255, Math.floor(d[k] + 0.5))); res[i*4+3] = q8(A[i]); } return res; }
  const cmp8 = (a, b, ax, ay, aW, bW) => { let mx = 0, sum = 0, n = 0; const W2 = bW; for (let y = 0; y < W2; y++) for (let x = 0; x < W2; x++) for (let k = 0; k < 3; k++) { const d = Math.abs(a[((ay + y) * aW + ax + x) * 4 + k] - b[(y * W2 + x) * 4 + k]); if (d > mx) mx = d; sum += d; n++; } return { max: mx, mean: sum / n }; };

  // ---- E2a: W=512, both directions, whole image
  { const W = 512; for (const [work, disp] of [['p3', 'srgb'], ['srgb', 'p3']]) { const doc = makeDoc(W, 8, 3, work, 12), st = stateOf(doc), got = exportAll(S.composite(st), W, work, disp), ref = refImage(doc.L8, W, work, disp), d = cmp8(got, ref, 0, 0, W, W);
      num[`E2a_${work}_${disp}`] = d; chk('E2', `W=512 work ${work} -> display ${disp}: max ${d.max} levels, mean ${d.mean.toFixed(4)}`, d.max <= 2 && d.mean <= 0.3, '==', true); } }

  // ---- E3 / E5: tile export == whole export after every edit (W=512), plus a negative control
  { const W = 512, rnd = rng(17), work = 'p3', disp = 'srgb', doc = makeDoc(W, 8, 4, work, 10), st = stateOf(doc), D = makeDirty(st); D.full(); const dispBuf = exportAll(D.back, W, work, disp);
    let mism = 0, edits = 0; const exportTiles = (tiles, skip) => { for (const t of tiles) { if (t === skip) continue; const tx = t % D.tn, ty = (t / D.tn) | 0; exportRect(D.back, W, work, disp, tx * 64, ty * 64, 64, 64, dispBuf); } };
    for (let i = 0; i < 40; i++) { const o = i === 12 ? { op: 'fill', layer: 3, c: [r4(rnd()), r4(rnd()), r4(rnd())], a: 0.4 } : i === 25 ? { op: 'set', layer: 2, opacity: 0.5 } : i === 33 ? { op: 'set', layer: 4, mode: 'darken' } : dab(rnd, W, (rnd() * 8) | 0, 10, 90);
      S.apply(st, o); const tiles = D.after(o); exportTiles(tiles); const full = exportAll(S.composite(st), W, work, disp); edits++; if (Buffer.compare(Buffer.from(dispBuf), Buffer.from(full)) !== 0) mism++; }
    chk('E3', `tile-wise display export == whole-image export after each of ${edits} edits (incl. fill, set opacity, set mode: all tiles)`, mism, '==', 0);
    const o = dab(rnd, W, 1, 40, 90); S.apply(st, o); const tiles = D.after(o); exportTiles(tiles, tiles[0]); const full = exportAll(S.composite(st), W, work, disp);
    chk('E5', `negative control: leaving one dirty tile unexported is detected (${tiles.length} tiles touched)`, Buffer.compare(Buffer.from(dispBuf), Buffer.from(full)) !== 0, '==', true); }

  // ---- W=2048: E1, E2b, E4
  { const W = 2048, work = 'srgb', disp = 'p3'; let a = now(); const doc = makeDoc(W, 8, 5, work, 40), tDoc = now() - a;
    const impT = []; for (let i = 0; i < 3; i++) { a = now(); importLayer(doc.L8[2], W, 'srgb'); impT.push(now() - a); }   // layer 2 is P3-tagged: a real P3 -> sRGB conversion
    a = now(); const st = stateOf(doc); const tState = now() - a; a = now(); const back0 = S.composite(st); const tComp = now() - a;
    const expT = []; let dispFull; for (let i = 0; i < 3; i++) { a = now(); dispFull = exportAll(back0, W, work, disp); expT.push(now() - a); }
    num.E1 = { build_float_doc_ms: tDoc, import_one_layer_ms_median: med(impT), import_8_layers_ms: tState, composite_ms: tComp, export_whole_ms_median: med(expT) };
    chk('E1', `import one 2048^2 layer (P3 -> sRGB working): ${med(impT).toFixed(0)} ms median`, +med(impT).toFixed(0), '<=', 2000); chk('E1', `export the whole 2048^2 backdrop (sRGB -> P3): ${med(expT).toFixed(0)} ms median`, +med(expT).toFixed(0), '<=', 2000);
    // E2b: 6 random 64x64 tiles of the 2048^2 result vs the float64 reference run on the same tile
    { const rnd = rng(23); let worst = { max: 0, mean: 0 }; for (let t = 0; t < 6; t++) { const tx = (rnd() * 32) | 0, ty = (rnd() * 32) | 0, T = 64, tileL8 = doc.L8.map((ly) => { const rgba = new Uint8Array(T * T * 4); for (let y = 0; y < T; y++) rgba.set(ly.rgba.subarray(((ty * T + y) * W + tx * T) * 4, ((ty * T + y) * W + tx * T + T) * 4), y * T * 4); return { ...ly, rgba }; });
        const ref = refImage(tileL8, T, work, disp), d = cmp8(dispFull, ref, tx * T, ty * T, W, T); if (d.max > worst.max) worst.max = d.max; if (d.mean > worst.mean) worst.mean = d.mean; }
      num.E2b = worst; chk('E2', `W=2048, 6 random tiles vs float64 reference: worst max ${worst.max} levels, worst mean ${worst.mean.toFixed(4)}`, worst.max <= 2 && worst.mean <= 0.3, '==', true); }
    // E4: interactive edit with colour-managed display
    { const D = makeDirty(st); D.full(); const rnd = rng(41), dispBuf = new Uint8Array(dispFull), tE = [], nt = []; exportAll(D.back, W, work, disp);
      for (let i = 0; i < 30; i++) { const o = dab(rnd, W, (rnd() * 8) | 0, 20, 100); a = now(); S.apply(st, o); const tiles = D.after(o); for (const t of tiles) exportRect(D.back, W, work, disp, (t % D.tn) * 64, ((t / D.tn) | 0) * 64, 64, 64, dispBuf); tE.push(now() - a); nt.push(tiles.length); }
      num.E4 = { edit_ms_median: med(tE), edit_ms_max: Math.max(...tE), tiles_median: med(nt), export_whole_ms: med(expT) }; chk('E4', `W=2048, 8 layers: dab + dirty composite + tile export median ${med(tE).toFixed(1)} ms (max ${Math.max(...tE).toFixed(1)}, ${med(nt)} tiles) vs ${med(expT).toFixed(0)} ms whole export`, +med(tE).toFixed(1), '<=', 50); }
  }
  const out = { n_checks: rec.length, gate: fails.length ? 'FAIL' : 'PASS', fails, numbers: num, checks: rec, node: process.version, cpus: require('os').cpus()[0].model };
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true }); fs.writeFileSync(path.join(__dirname, 'out', 'cmfold.json'), JSON.stringify(out, null, 1)); console.log(JSON.stringify({ ...out, checks: undefined }, null, 1)); process.exit(fails.length ? 1 : 0);
})();
