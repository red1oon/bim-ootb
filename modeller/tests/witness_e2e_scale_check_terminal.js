#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-SCALE-CHECK-TERMINAL scope (read the log after every run)
 * SCOPE: prompts/WATCHDOG_SCALE_AND_UX_SWEEP.md §1 — the 3 scale checks that must be measured at REAL Terminal
 * scale (~48k elements), not assumed fine from small-fixture witnesses (grid green/orange #656, Save/auto-heal
 * #658, Teams presence #661 all shipped only ever tested against Duplex/SampleHouse/synthetic pairs). This
 * project has been burned 3x by exactly this gap (Outliner O(rows×ops) stall, LOD400 load stall, Terminal
 * walk-all-disciplines flash) — treat this witness as the load-bearing check that gap doesn't recur here.
 *
 * ONE Terminal open, 3 independent checks against the SAME live scene (cheaper than 3 separate opens):
 *   C1 GRID-TINT      — drag a synthetic gridline (real pointerdown/pointermove dispatch) while ~48k real
 *                        Terminal meshes are attached as elementData() — times the REAL gmTint/previewCommands
 *                        recompute the live pointermove handler runs on every drag frame (modeller.html:1607).
 *   C2 SAVE-AUTOHEAL  — constructs 5 real ORANGE abuts-realign findings (same recipe as witness_e2e_save.js's
 *                        S2 fixture, repeated x5 against distinct real elements) then clicks the real #b-save
 *                        button and times runSave()'s full wall-clock (auto-heal pass + per-finding reverify +
 *                        full re-evaluate) via a performance.now() bracket around click→__lastSaveResult.
 *   C3 TEAMS-PRESENCE — confirms renderPresence() (teams_embed.js) is bounded by PEER count, not element count:
 *                        (a) real pill click at Terminal scale (ops=0 today — TeamsEmbedOps is not wired into
 *                        modeller.html, so the onMount per-row Outliner-dot loop is DORMANT/unreachable code,
 *                        confirmed by grep, not assumed) (b) direct TeamsPresence.foldPresence/presenceDots
 *                        stress at peers=5 vs peers=300 (the exact functions renderPresence calls) to confirm
 *                        near-linear peer scaling with zero dependency on scene element count.
 *
 * Logs real `§SCALE_CHECK feature=... elements=... ms=...` lines per CLAUDE.md Log Mandate — no "felt fine".
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); }); });

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', protocolTimeout: 1200000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0;
  const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

  console.log('═══ W-SCALE-CHECK-TERMINAL — real Terminal (~48k elements), 3 shipped features measured at scale ═══');
  const pg = await br.newPage(); await pg.setViewport({ width: 1200, height: 850, deviceScaleFactor: 1 });
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  const slog = []; pg.on('console', m => { const t = m.text(); if (/^§/.test(t)) { slog.push(t); console.log('  ' + t); } });

  const t0 = Date.now();
  // ?teams=1 so the Teams overlay auto-inits (C3) — its HARD RULE keeps it byte-identical otherwise.
  await pg.goto(`http://localhost:${port}/modeller/modeller.html?teams=1`, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai', { timeout: 60000 });
  await pg.click('#b-open'); await sleep(300);
  await pg.click('#m-open-panel .mo-row[data-key="Terminal"]');
  await pg.waitForFunction(() => !!window.__dwBuf, { timeout: 600000 });
  await pg.waitForFunction(() => window.Bonsai.group && window.Bonsai.group() && window.Bonsai.group().children.length > 30000, { timeout: 600000, polling: 1000 });
  await sleep(4000);
  const sceneTotal = await pg.evaluate(() => window.Bonsai.group().children.length);
  console.log('  §T-OPEN Terminal open+seeded elements=' + sceneTotal + ' in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  chk('T0 SCENE-SCALE (real Terminal, >30k children)', sceneTotal > 30000, 'sceneTotal=' + sceneTotal);

  const fitB = await pg.$('#b-fit'); if (fitB) { await fitB.click(); await sleep(600); }

  // ═══ C1 — GRID-TINT live recompute at Terminal scale ═══
  const cxy = await pg.evaluate(() => { const t = window.A.controls.target; return { cx: t.x, cy: t.y }; });
  await pg.evaluate((cx, cy) => {
    window.Bonsai.grid.define({ xs: [cx - 4, cx, cx + 4], ys: [cy - 3, cy, cy + 3], xlabels: ['A', 'B', 'C'], ylabels: ['1', '2'] });
  }, cxy.cx, cxy.cy);
  await pg.click('#b-gridmove'); await sleep(400);
  const gridPerf = await pg.evaluate((cx, cy) => new Promise((resolve) => {
    const canvas = document.getElementById('c');
    const rect = canvas.getBoundingClientRect();
    const proj = (x, y, z) => { const v = new window.THREE.Vector3(x, y, z).project(window.A.camera); return { x: (v.x * 0.5 + 0.5) * rect.width + rect.left, y: (-v.y * 0.5 + 0.5) * rect.height + rect.top }; };
    const down = proj(cx, cy, 0.03);
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: down.x, clientY: down.y, button: 0, bubbles: true }));
    const frames = []; let step = 0; const N = 15;
    function nextFrame() {
      step++;
      const p = proj(cx + step * 0.3, cy, 0.03);
      const a = performance.now();
      canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: p.x, clientY: p.y, bubbles: true }));
      frames.push(performance.now() - a);
      if (step < N) requestAnimationFrame(nextFrame);
      else { canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: p.x, clientY: p.y, bubbles: true })); resolve(frames); }
    }
    requestAnimationFrame(nextFrame);
  }), cxy.cx, cxy.cy);
  await sleep(200);
  const gridMax = Math.max(...gridPerf), gridAvg = gridPerf.reduce((a, b) => a + b, 0) / gridPerf.length;
  console.log('  §SCALE_CHECK feature=grid_tint elements=' + sceneTotal + ' ms=' + gridMax.toFixed(1) + ' avgMs=' + gridAvg.toFixed(1) + ' frames=' + gridPerf.length);
  chk('C1 GRID-TINT stays interactive (max frame < 200ms @ ' + sceneTotal + ' elements, existing DW_ALL_PROXY_THRESHOLD-class UI-thread budget)',
    gridMax < 200, 'max=' + gridMax.toFixed(1) + 'ms avg=' + gridAvg.toFixed(1) + 'ms over ' + gridPerf.length + ' frames');
  const gridBtn = await pg.$('#b-gridmove'); if (gridBtn) await gridBtn.click();   // exit grid-move mode

  // ═══ C2 — SAVE/AUTO-HEAL wall-clock with 5 real ORANGE findings at Terminal scale ═══
  const fixtures = await pg.evaluate(() => {
    const boxes = window.__gateBoxes(), rel = window.__gateRel();
    const entangled = new Set();
    Object.keys(rel.hostOf).forEach(k => { entangled.add(+k); entangled.add(rel.hostOf[k]); });
    ((window.swXEdges && window.swXEdges.abuts) || []).forEach(e => {
      const fbg = window.__arcFidByGuid || {}; const a = fbg[e.a], b = fbg[e.b]; if (a != null) entangled.add(a); if (b != null) entangled.add(b);
    });
    const ids = Object.keys(boxes).map(Number);
    const ext = (id) => { const b = boxes[id]; return [b[1] - b[0], b[3] - b[2], b[5] - b[4]]; };
    const wallish = ids.filter(id => { const e = ext(id); const mn = Math.min(...e), mx = Math.max(...e); return mn > 0.3 && mn < 0.6 && mx > 3; });
    const used = new Set(); const out = [];
    for (const wA of wallish) {
      if (used.has(wA) || out.length >= 5) continue;
      const small = ids.filter(id => id !== wA && !entangled.has(id) && !used.has(id) && Math.max(...ext(id)) < 1.5);
      if (small.length < 2) continue;
      const [elC, elB] = small;
      const wBox = boxes[wA], wExt = ext(wA); const k = wExt.indexOf(Math.min(...wExt));
      function flushDelta(id, side) {
        const b = boxes[id]; const d = [0, 0, 0];
        for (let ax = 0; ax < 3; ax++) {
          if (ax === k) d[ax] = side > 0 ? (wBox[2 * k + 1] - b[2 * k]) : (wBox[2 * k] - b[2 * k + 1]);
          else { const wC = (wBox[2 * ax] + wBox[2 * ax + 1]) / 2, bC = (b[2 * ax] + b[2 * ax + 1]) / 2; d[ax] = wC - bC; }
        }
        return d;
      }
      out.push({ wA, elC, elB, k, dC: flushDelta(elC, +1), dB: flushDelta(elB, -1) });
      used.add(wA); used.add(elC); used.add(elB);
    }
    return out;
  });
  chk('C2-SETUP found 5 distinct real wall+2-neighbour triples at Terminal scale', fixtures.length === 5, 'found=' + fixtures.length);

  await pg.evaluate(async (fx) => {
    window.swXEdges = window.swXEdges || { abuts: [], fills: [], anchored: [], spans: [], aggregates: [], datums: [] };
    for (const f of fx) {
      await window.Bonsai.oplog.commit({ op_type: 'GEOM_MOVE', parameters: { parent: f.elC, dx: f.dC[0], dy: f.dC[1], dz: f.dC[2] } });
      await window.Bonsai.oplog.commit({ op_type: 'GEOM_MOVE', parameters: { parent: f.elB, dx: f.dB[0], dy: f.dB[1], dz: f.dB[2] } });
      window.swXEdges.abuts.push({ a: window.__arcGuidByFid[f.wA], b: window.__arcGuidByFid[f.elC] });
      window.swXEdges.abuts.push({ a: window.__arcGuidByFid[f.wA], b: window.__arcGuidByFid[f.elB] });
    }
    window.__saveGateInit();   // re-arm baseline AT this flush state
  }, fixtures);
  await sleep(300);
  // pull each elC away — real GEOM_MOVE — triggers N independent abuts-realign ORANGE findings
  await pg.evaluate(async (fx) => {
    for (const f of fx) { const d = [0, 0, 0]; d[f.k] = 0.5; await window.Bonsai.oplog.commit({ op_type: 'GEOM_MOVE', parameters: { parent: f.elC, dx: d[0], dy: d[1], dz: d[2] } }); }
  }, fixtures);
  await sleep(300);
  const gatePre = await pg.evaluate((fx) => {
    const before = window.__saveGateBaseline, after = window.__gateBoxes(), rel = window.__gateRel();
    const moved = Object.keys(after).map(Number).filter(id => { const b = before[id], a = after[id]; return !b || b.some((v, i) => Math.abs(v - a[i]) > 1e-9); });
    const res = window.SdgGate.evaluate(before, after, moved, rel, {});
    return { red: res.red.length, orange: res.orange.filter(o => o.kind === 'abuts-realign').length };
  }, fixtures);
  console.log('  §T-C2-PRE red=' + gatePre.red + ' abuts-realign-orange=' + gatePre.orange);
  chk('C2-PRECONDITION several real ORANGE findings, zero RED', gatePre.red === 0 && gatePre.orange >= 5, JSON.stringify(gatePre));

  await pg.evaluate(() => { window.__lastSaveResult = undefined; window.__saveT0 = performance.now(); });
  await pg.click('#b-save');
  await pg.waitForFunction(() => window.__lastSaveResult !== undefined, { timeout: 120000 });
  const saveMs = await pg.evaluate(() => performance.now() - window.__saveT0);
  const r2 = await pg.evaluate(() => window.__lastSaveResult);
  const autohealLog = slog.filter(l => /^§SAVE_AUTOHEAL fixed=/.test(l)).pop() || '';
  console.log('  §SCALE_CHECK feature=save_autoheal elements=' + sceneTotal + ' ms=' + saveMs.toFixed(0) + ' findings=' + gatePre.orange);
  chk('C2 SAVE-AUTOHEAL (real Save click healed all 5 findings, wall-clock stayed UI-reasonable < 8000ms @ ' + sceneTotal + ' elements)',
    r2 && r2.ok === true && r2.healed.length === 5 && saveMs < 8000,
    'result=' + JSON.stringify(r2 && { ok: r2.ok, healed: r2.healed.length }) + ' ms=' + saveMs.toFixed(0) + ' log="' + autohealLog + '"');

  // ═══ C3 — TEAMS PRESENCE bounded by peers, not elements ═══
  const opsWired = await pg.evaluate(() => typeof window.TeamsEmbedOps === 'function');
  console.log('  §T-C3 TeamsEmbedOps wired into modeller.html: ' + opsWired + ' (false ⇒ onMount per-row Outliner-dot loop is DORMANT code, never runs in production today)');
  const ready = await pg.waitForFunction(() => window.__teamsEmbedReady === true, { timeout: 15000 }).then(() => true).catch(() => false);
  chk('C3-SETUP Teams overlay auto-init (?teams=1)', ready, 'ready=' + ready);
  const pillMs = await pg.evaluate(() => {
    const t0 = performance.now(); const pill = document.getElementById('teams-pill'); if (pill) pill.click(); return performance.now() - t0;
  });
  await sleep(200);
  const foldPerf = await pg.evaluate(() => {
    const PR = window.TeamsPresence; if (!PR) return null;
    function stress(n) {
      const beats = []; for (let i = 0; i < n; i++) beats.push(PR.makePresence({ user: 'peer' + i, product: i % 2 ? 'erp' : 'bim', location: { discipline: 'ARC' }, ts: Date.now() }));
      const t0 = performance.now();
      const folded = PR.foldPresence(beats, { now: Date.now(), activeMs: 60000 });
      PR.presenceDots(folded);
      return performance.now() - t0;
    }
    return { ms5: stress(5), ms300: stress(300) };
  });
  console.log('  §SCALE_CHECK feature=teams_presence elements=' + sceneTotal + ' peers=5 ms=' + (foldPerf ? foldPerf.ms5.toFixed(2) : 'n/a'));
  console.log('  §SCALE_CHECK feature=teams_presence elements=' + sceneTotal + ' peers=300 ms=' + (foldPerf ? foldPerf.ms300.toFixed(2) : 'n/a'));
  console.log('  §T-C3 onMount(real pill click, ops=0) ms=' + pillMs.toFixed(2));
  chk('C3 TEAMS-PRESENCE bounded by PEERS not elements (300 peers still sub-frame @ ' + sceneTotal + ' scene elements; scaling is peers-only)',
    !!foldPerf && foldPerf.ms300 < 50, JSON.stringify(foldPerf));
  chk('C3b NO-ELEMENT-COUPLING confirmed (TeamsEmbedOps unwired ⇒ zero per-row Outliner-dot cost paid in production)', opsWired === false, 'opsWired=' + opsWired);

  chk('NO-ERROR', errs.length === 0, errs.slice(0, 3).join(' | '));
  await br.close(); server.close();
  console.log('W-SCALE-CHECK-TERMINAL: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
