#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-GATE-SCALE: the edit gate survives a Terminal-scale multi-element edit (MODELLER_MASTER row 22 part 3).
 * SCOPE: BIMCompiler prompts/Modeller/NEXT_0926/SPEC_GATE_SCALE.md. Real Open of Duplex + Terminal, the gate's own inputs
 * (__gateBoxes / __gateRel). Read the log after every run.
 * ISSUE: SdgGate.evaluate kept a `seen` string key per (moved, other) pair — Terminal (35,552 boxes): 100 moved = 2.9 s,
 *   300+ moved = RangeError "Too many properties to enumerate" (main 9325eb6d), so a big edit reported FAIL, no gate.
 *   S1 PARITY-DUPLEX   — 1 / 10 / all moved: indexed result deep-equals the old brute-force loop (same items, same order).
 *   S2 PARITY-TERMINAL — 1 / 10 / 100 moved: same.
 *   S3 SCALE           — Terminal 1,000 moved: no throw, < 5 s.
 *   S4 NOT-VACUOUS     — the Terminal 100-moved case has ≥1 RED and ≥1 ORANGE (else INCONCLUSIVE, not PASS).
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.sql': 'text/plain' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); });
(async () => {
  await new Promise(r => server.listen(0, r));
  const br = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let pass = 0, fail = 0; const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + '  ' + x); } else { fail++; console.log('  ❌ ' + n + '  ' + x); } };
  console.log('═══ W-GATE-SCALE ═══');
  const R = {};
  for (const [KEY, counts] of [['Duplex', [1, 10, 'all']], ['Terminal', [1, 10, 100, 1000]]]) {
    const pg = await br.newPage(); const errs = []; pg.on('pageerror', e => errs.push(String(e)));
    await pg.goto(`http://localhost:${server.address().port}/modeller/modeller.html`, { waitUntil: 'load' });
    await pg.waitForFunction('window.__sceneReady === true && typeof window.__gateBoxes==="function"', { timeout: 60000 });
    await pg.click('#b-open'); await pg.waitForSelector(`#m-open-panel .mo-row[data-key="${KEY}"]`); await pg.click(`#m-open-panel .mo-row[data-key="${KEY}"]`);
    await pg.waitForFunction(k => window.__dwName === k && window.Bonsai.oplog.length > 0 && !!window.__arcFidByGuid && Object.keys(window.__gateBoxes()).length > 0, { timeout: 300000, polling: 500 }, KEY);
    await new Promise(r => setTimeout(r, 3000));
    R[KEY] = await pg.evaluate((counts) => {
      const before = window.__gateBoxes(), rel = window.__gateRel(), ids = Object.keys(before).map(Number), out = {};
      // deterministic spread: every k-th fid, shifted +0.3 m in x/y
      for (const c of counts) {
        const n = c === 'all' ? ids.length : c, step = Math.max(1, Math.floor(ids.length / n)), mv = [];
        for (let i = 0; i < ids.length && mv.length < n; i += step) mv.push(ids[i]);
        const after = Object.assign({}, before); mv.forEach(i => { const q = before[i]; after[i] = [q[0] + 0.3, q[1] + 0.3, q[2] + 0.3, q[3] + 0.3, q[4], q[5]]; });
        const run = (o) => { const t = performance.now(); try { const r = window.SdgGate.evaluate(before, after, mv, rel, o); return { ms: performance.now() - t, r }; } catch (e) { return { ms: performance.now() - t, err: String(e) }; } };
        const fast = run({}), slow = c === 1000 ? null : run({ bruteForce: true });
        out[c] = { n: mv.length, fastMs: +fast.ms.toFixed(0), slowMs: slow ? +slow.ms.toFixed(0) : null, err: fast.err || null, slowErr: slow && slow.err || null,
          red: fast.r ? fast.r.red.length : -1, orange: fast.r ? fast.r.orange.length : -1,
          equal: slow && fast.r && slow.r ? JSON.stringify(fast.r) === JSON.stringify(slow.r) : null };
      }
      return { boxes: ids.length, out };
    }, counts);
    R[KEY].errs = errs.length;
    console.log('  §GATE-SCALE ' + KEY + ' ' + JSON.stringify(R[KEY]));
    await pg.close();
  }
  const D = R.Duplex.out, T = R.Terminal.out;
  chk('S1 PARITY-DUPLEX (1/10/all moved: indexed == brute force, same order)', [1, 10, 'all'].every(c => D[c].equal === true), JSON.stringify([1, 10, 'all'].map(c => [D[c].n, D[c].equal, D[c].red, D[c].orange])));
  chk('S2 PARITY-TERMINAL (1/10/100 moved: indexed == brute force)', [1, 10, 100].every(c => T[c].equal === true), JSON.stringify([1, 10, 100].map(c => [T[c].n, T[c].equal, T[c].fastMs + 'ms vs ' + T[c].slowMs + 'ms'])));
  chk('S3 SCALE (Terminal 1,000 moved: no throw, < 5 s)', !T[1000].err && T[1000].fastMs < 5000, JSON.stringify(T[1000]));
  const nv = T[100].red > 0 && T[100].orange > 0;
  if (!nv) console.log('  ⚪ S4 INCONCLUSIVE — the 100-moved case found no RED or no ORANGE; parity over empty results proves nothing');
  chk('S4 NOT-VACUOUS (Terminal 100 moved has RED and ORANGE)', nv, 'red=' + T[100].red + ' orange=' + T[100].orange);
  chk('S5 NO-ERROR', R.Duplex.errs === 0 && R.Terminal.errs === 0, 'errs=' + R.Duplex.errs + '/' + R.Terminal.errs);
  console.log('W-GATE-SCALE: ' + pass + ' PASS / ' + fail + ' FAIL');
  await br.close(); server.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
