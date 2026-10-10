// Usage: node editor/run_editor.js   Playable editor on the op log: U1-U9 (pre-registered in witness_log/HYPOTHESES.md before this file existed). Needs system Chrome (CHROMIUM env).
const fs = require('fs'), path = require('path'), http = require('http'), S = require('../stack.js'), Br = require('../filters/brush.js');
const ROOT = path.join(__dirname, '..'), rec = [], fails = [], num = {};
const chk = (id, name, value, cmp, limit) => { const pass = cmp === '<=' ? value <= limit : cmp === '>=' ? value >= limit : value === limit; rec.push({ id, name, value, cmp, limit, pass }); if (!pass) fails.push({ id, name, value, cmp, limit }); };
const rng = (seed) => { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }, r2 = (x) => Math.round(x * 100) / 100, r4 = (x) => Math.round(x * 1e4) / 1e4;
const eq = (a, b) => Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;
const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1], pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
const newSt = (W) => { const st = S.newState(W); S.apply(st, { op: 'layer', id: 0, mode: 'normal', opacity: 1, mask: false }); return st; };
(async () => {
  // ---- U1 / U2: incremental builders == batch ops, with duplicate pointer events mixed in
  { const rnd = rng(5), W = 256; let bad1 = 0, bad2 = 0;
    for (let t = 0; t < 50; t++) { const n = 2 + ((rnd() * 39) | 0), pts = []; for (let i = 0; i < n; i++) pts.push([r2(rnd() * W), r2(rnd() * W)]);
      const o = { op: 'stroke', layer: 0, kind: t % 2 ? 'soft' : 'hard', pts, r: 3 + rnd() * 37, c: [r4(rnd()), r4(rnd()), r4(rnd())], a: r4(0.2 + rnd() * 0.8) }, a = newSt(W), b = newSt(W); Br.applyOp(a, o);
      const sb = Br.StrokeBuilder(b, { ...o, pts: [] }); for (const p of pts) { sb.push(p[0], p[1]); if (rnd() < 0.3) sb.push(p[0], p[1]); } if (!eq(a.L[0].pix, b.L[0].pix)) bad1++; }
    const base = (() => { const st = newSt(W), r = rng(9); for (let i = 0; i < 80; i++) S.apply(st, { op: 'dab', layer: 0, x: r4(r() * W), y: r4(r() * W), r: r4(5 + r() * 40), c: [r4(r()), r4(r()), r4(r())], a: r4(0.3 + r() * 0.6) }); return st.L[0].pix; })();
    for (let t = 0; t < 30; t++) { const n = 2 + ((rnd() * 30) | 0), pts = []; for (let i = 0; i < n; i++) pts.push([r2(20 + rnd() * (W - 40)), r2(20 + rnd() * (W - 40))]);
      const o = { op: 'smudge', layer: 0, pts, r: 4 + rnd() * 20, s: r4(0.1 + rnd() * 0.9) }, a = newSt(W), b = newSt(W); a.L[0].pix.set(base); b.L[0].pix.set(base); Br.applyOp(a, o);
      const sm = Br.SmudgeBuilder(b.L[0], W, o), pb = Br.PositionBuilder(o.r, 0.1); for (const p of pts) { for (const q of pb.push(p[0], p[1])) sm.step(q); if (rnd() < 0.3) for (const q of pb.push(p[0], p[1])) sm.step(q); } if (!eq(a.L[0].pix, b.L[0].pix)) bad2++; }
    chk('U1', 'incremental stroke builder == batch stroke on 50 random polylines (hard and soft, duplicate pointer events mixed in)', bad1, '==', 0); chk('U2', 'incremental smudge builder == batch smudge on 30 random polylines', bad2, '==', 0); }
  // ---- Chromium
  const { chromium } = require('playwright-core'), srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0, '127.0.0.1');
  await new Promise((r) => srv.on('listening', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }), pg = await br.newPage({ viewport: { width: 1400, height: 900 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); pg.setDefaultTimeout(120000);
  await pg.goto(base + '/editor/index.html'); await pg.waitForFunction(() => window.__ed);
  const box = await pg.evaluate(() => { const r = document.getElementById('c').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const P = (u, v) => [box.x + u * box.w, box.y + v * box.h];   // u,v in 0..1 of the canvas
  const drag = async (pts) => { const [x0, y0] = P(...pts[0]); await pg.mouse.move(x0, y0); await pg.mouse.down(); for (const [u, v] of pts.slice(1)) { const [x, y] = P(u, v); await pg.mouse.move(x, y, { steps: 6 }); } await pg.mouse.up(); };
  const tool = (t) => pg.click(`#tools button[data-tool="${t}"]`), nOps = () => pg.evaluate(() => window.__ed.ops.length);
  // U4: one hard stroke = one op
  const n0 = await nOps(); await tool('hard'); await drag([[0.15, 0.2], [0.3, 0.35], [0.45, 0.25], [0.6, 0.4]]); const n1 = await nOps(), last = await pg.evaluate(() => { const o = window.__ed.ops.at(-1); return { op: o.op, kind: o.kind, pts: o.pts.length }; });
  chk('U4', `a mouse drag with the hard brush adds exactly one log entry (${JSON.stringify(last)})`, n1 - n0 === 1 && last.op === 'stroke' && last.kind === 'hard' && last.pts > 3, '==', true);
  // the rest of the scripted session
  await tool('soft'); await pg.fill('#size', '40'); await pg.dispatchEvent('#size', 'input'); await drag([[0.2, 0.6], [0.5, 0.7], [0.8, 0.55]]);
  await tool('smudge'); await drag([[0.18, 0.2], [0.35, 0.3], [0.5, 0.45], [0.62, 0.5]]);
  await tool('blur'); { const [x, y] = P(0.5, 0.65); await pg.mouse.click(x, y); }
  await pg.click('#addl'); await pg.evaluate(() => { const r = document.querySelector('#layers .layer.on input[type=range]'); r.value = 80; r.dispatchEvent(new Event('change')); });
  await pg.evaluate(() => { const c = document.getElementById('color'); c.value = '#cc3322'; c.dispatchEvent(new Event('input')); });
  await tool('hard'); await pg.fill('#size', '24'); await pg.dispatchEvent('#size', 'input'); await drag([[0.7, 0.15], [0.85, 0.3], [0.75, 0.45]]);
  await tool('soft'); await drag([[0.3, 0.85], [0.6, 0.9]]); await tool('smudge'); await drag([[0.72, 0.18], [0.8, 0.32], [0.78, 0.44]]);
  const total = await nOps(); num.ops = total;
  // U4 canvas == engine display, 200 random pixels
  { const bad = await pg.evaluate(() => { const ed = window.__ed, c = document.getElementById('c').getContext('2d'); let s = 12345, bad = 0; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; for (let i = 0; i < 200; i++) { const x = (rnd() * ed.W) | 0, y = (rnd() * ed.W) | 0, a = [...c.getImageData(x, y, 1, 1).data], b = ed.displayRGBA8(x, y); if (a.some((v, k) => v !== b[k])) bad++; } return bad; });
    chk('U4', 'canvas pixels equal the engine display for 200 random pixels after the session', bad, '==', 0); }
  chk('U4', 'no page errors while loading and drawing' + (errs.length ? ': ' + errs.join(' | ').slice(0, 300) : ''), errs.length, '==', 0);
  // U5 replay
  { const r = await pg.evaluate(() => { const ed = window.__ed, live = ed.hashes(), rf = Editor.refold(JSON.parse(JSON.stringify(ed.ops)), ed.W); return { live, rf, n: ed.ops.length }; });
    chk('U5', `refolding the ${r.n}-op log from scratch equals the live state (composite and ${r.live.layers.length} layer hashes)`, r.live.comp === r.rf.comp && JSON.stringify(r.live.layers) === JSON.stringify(r.rf.layers), '==', true); num.hash = r.live.comp.slice(0, 12); chk('U5', 'the session has at least 9 user ops after the 3 initial ones', total - 3 >= 9, '==', true); }
  // U6 undo / redo exact at every step
  { const res = await pg.evaluate(() => { const ed = window.__ed, out = { undo: [], redo: [] }, same = () => { const a = ed.hashes(), b = Editor.refold(JSON.parse(JSON.stringify(ed.ops)), ed.W); return a.comp === b.comp && JSON.stringify(a.layers) === JSON.stringify(b.layers); };
      for (let i = 0; i < 4; i++) { ed.undo(); out.undo.push(same()); } for (let i = 0; i < 4; i++) { ed.redo(); out.redo.push(same()); } out.n = ed.ops.length; return out; });
    chk('U6', `undo x4: live hashes equal a refold of the shortened log after each step (${res.undo.join(',')})`, res.undo.every(Boolean), '==', true); chk('U6', `redo x4: equal a refold of the log after each step (${res.redo.join(',')}), log length back to ${res.n}`, res.redo.every(Boolean) && res.n === total, '==', true); }
  // U7 save/load + chain, U9 tamper
  { const res = await pg.evaluate(() => { const ed = window.__ed, json = ed.save(), cv = document.createElement('canvas'), ed2 = Editor.createEditor(cv, 1024); ed2.load(json); const a = ed.hashes(), b = ed2.hashes();
      const bad = JSON.parse(json); const s = bad.ops.find((o) => o.op === 'stroke' && o.kind === 'hard'); s.pts[2][0] += 1; const ed3 = Editor.createEditor(document.createElement('canvas'), 1024); ed3.load(JSON.stringify(bad));
      return { same: a.comp === b.comp && JSON.stringify(a.layers) === JSON.stringify(b.layers), chain: Stack.verifyChain(Stack.chain(JSON.parse(json).ops)), tampered: ed3.hashes().comp !== a.comp, bytes: json.length, ops: ed.ops.length }; });
    num.save = { bytes: res.bytes, ops: res.ops }; chk('U7', `saved log (${res.bytes} bytes, ${res.ops} ops) loaded into a fresh editor gives the same hashes`, res.same, '==', true); chk('U7', 'the hash chain of the saved log verifies', res.chain, '==', -1);
    chk('U9', 'negative control: changing one logged point by 1 px changes the replayed composite', res.tampered, '==', true); }
  // U8 handler time
  { const ms = await pg.evaluate(() => window.__ed.moveMs.slice()); num.moveMs = { n: ms.length, median: med(ms), p95: pct(ms, 0.95), max: Math.max(...ms) };
    chk('U8', `pointermove handler time: median ${med(ms).toFixed(2)} ms, p95 ${pct(ms, 0.95).toFixed(2)} ms, max ${Math.max(...ms).toFixed(1)} ms over ${ms.length} moves (1024^2, 3 layers)`, med(ms) <= 16 && pct(ms, 0.95) <= 33, '==', true); }
  const shot = process.env.HOME + '/oplog_compare/editor_session.png'; try { fs.mkdirSync(path.dirname(shot), { recursive: true }); await pg.screenshot({ path: shot }); num.screenshot = shot; } catch (e) { num.screenshot = 'failed: ' + e.message; }
  await br.close(); srv.close();
  const out = { n_checks: rec.length, gate: fails.length ? 'FAIL' : 'PASS', fails, numbers: num, checks: rec, node: process.version, cpus: require('os').cpus()[0].model };
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true }); fs.writeFileSync(path.join(__dirname, 'out', 'editor.json'), JSON.stringify(out, null, 1)); console.log(JSON.stringify({ ...out, checks: undefined }, null, 1)); process.exit(fails.length ? 1 : 0);
})();
