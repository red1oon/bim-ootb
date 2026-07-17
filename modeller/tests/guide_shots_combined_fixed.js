#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — GUIDE-SHOTS (combined 4-branch worktree) scope
 * Produces the two User-Guide candidate screenshots off the combined branch
 * (lod400-livewire + grid-tilt-guard + dw-rot-units + dwprobe-dedup), per
 * feedback_user_guide_quality_bar: tightly-framed (camera fit to the subject,
 * canvas-clip screenshot), deviceScaleFactor:2, assert 0 console errors.
 *   SHOT 1  Duplex ELEC schedule-walk — REAL device meshes (lod400>0, not boxes)
 *   SHOT 2  SampleHouse rotated ELEC fixture — committed fold at the CORRECT yaw
 * Candidates only — does NOT touch docs/ or ModellerGuide.md. Read the log after every run.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(path.join(process.env.HOME, 'bim-ootb', 'tests', 'node_modules', 'playwright'));

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(__dirname, 'guide_shots');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm',
  '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const p = decodeURIComponent(req.url.split('?')[0]);
      let fp = path.join(ROOT, p === '/' ? 'modeller/modeller.html' : p);
      // known condition (see witness_bend_fitting.js): dagevu_catalog/geometries are git-tracked ONLY under
      // viewer/ — the modeller fetches them script-relative, so alias like the deployed site does
      if ((p === '/modeller/dagevu_catalog.json' || p === '/modeller/dagevu_geometries.json') && !fs.existsSync(fp)) fp = path.join(ROOT, 'viewer', path.basename(p));
      fs.readFile(fp, (e, buf) => {
        if (e) { console.log('  §SRV-404 ' + p); res.statusCode = 404; return res.end('nf'); }
        res.setHeader('Content-Type', MIME[path.extname(fp)] || 'application/octet-stream');
        res.setHeader('Accept-Ranges', 'bytes');
        res.end(buf);
      });
    });
    srv.listen(0, () => resolve(srv));
  });
}

async function boot(browser, port, key, logs, errs) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  pg.on('console', m => { logs.push(m.text()); if (m.type() === 'error') errs.push('CONSOLE-ERROR ' + m.text().slice(0, 200)); });
  pg.on('pageerror', e => errs.push('PAGEERROR ' + String(e).slice(0, 200)));
  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.SQL && !!window.Bonsai', null, { timeout: 30000 });
  await pg.click('#b-open'); await sleep(200);
  await pg.click(`#m-open-panel .mo-row[data-key="${key}"]`);
  // stability loop (same as W-DW-LIVEWIRE): child count stable 8 polls
  let lastN = -1, stable = 0, n = -1;
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    n = await pg.evaluate(() => { const g = window.Bonsai.group && window.Bonsai.group(); return g ? g.children.length : -1; }).catch(() => -1);
    if (n === lastN && n > 0) stable++; else stable = 0;
    lastN = n;
    if (stable >= 8) break;
    await sleep(500);
  }
  console.log(`  §OPEN ${key} children=${n}`);
  await pg.waitForFunction('window.DiscWalker && window.DiscWalker._ready()', null, { timeout: 25000 }).catch(() => {});
  return { ctx, pg };
}

async function walk(pg, logs, disc) {
  const before = logs.length;
  await pg.evaluate(d => { window.discWalk(d); }, disc);
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const done = logs.slice(before).some(l => l.indexOf(`§DISC-WALK ${disc} placed=`) >= 0 || l.indexOf(`§DISC-WALK ${disc} REFUSE`) >= 0);
    if (done) break;
    await sleep(500);
  }
  await sleep(1200); // let §DW-PRIM render logs land
  return logs.slice(before);
}

// camera-fit to a world-space box {min:[x,y,z],max:[..]} then render.
// opts.dist = absolute camera distance in metres (interior shots); default derives from box size.
async function frame(pg, box, opts) {
  await pg.evaluate(([b, o]) => {
    const { camera, controls, renderer, scene } = window.A;
    const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2, cz = (b.min[2] + b.max[2]) / 2;
    const sx = b.max[0] - b.min[0], sy = b.max[1] - b.min[1], sz = b.max[2] - b.min[2];
    const dist = o.dist || Math.max(sx, sy, sz, 1) * (o.pad || 0.75) * 2.2;
    const d = o.dir || [1, -1, 0.7];
    const dl = Math.hypot(d[0], d[1], d[2]);
    controls.target.set(cx, cy, cz + (o.tz || 0));
    camera.position.set(cx + dist * d[0] / dl, cy + dist * d[1] / dl, cz + (o.tz || 0) + dist * d[2] / dl);
    camera.near = 0.05; camera.far = 4000; camera.updateProjectionMatrix();
    controls.update();
    renderer.render(scene, camera);
  }, [box, opts || {}]);
  await sleep(400); // a few RAF frames at the new pose
}


// clip-based canvas shot: page.screenshot with the canvas rect (CSS px; deviceScaleFactor:2 doubles output)
// — element.screenshot's stability wait can stall on a continuously-RAF-painting canvas.
async function shootCanvas(pg, file) {
  const r = await pg.evaluate(() => { const c = document.querySelector('canvas'); const b = c.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; });
  await pg.screenshot({ path: file, clip: r, timeout: 15000 });
}

// project world points -> CSS-px bbox on the canvas (+margin) => deterministic tight clip around the subject
async function projClip(pg, pts, margin) {
  const r = await pg.evaluate(([P, M]) => {
    const { camera, renderer } = window.A;
    const el = renderer.domElement, b = el.getBoundingClientRect();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    P.forEach(p => {
      const v = new window.THREE.Vector3(p[0], p[1], p[2]).project(camera);
      const sx = b.x + (v.x + 1) / 2 * b.width, sy = b.y + (1 - (v.y + 1) / 2) * b.height;
      if (sx < x0) x0 = sx; if (sx > x1) x1 = sx; if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
    });
    x0 = Math.max(b.x, x0 - M); y0 = Math.max(b.y, y0 - M);
    x1 = Math.min(b.x + b.width, x1 + M); y1 = Math.min(b.y + b.height, y1 + M);
    return { x: x0, y: y0, width: Math.max(64, x1 - x0), height: Math.max(64, y1 - y0) };
  }, [pts, margin || 50]);
  return r;
}

async function collapseOutliner(pg) {
  await pg.evaluate(() => { const t = document.getElementById('ol-collapse'); if (t) t.click(); });
  // guide frames are canvas-only: the fixed-position chrome (#hist scrubber, #stat line) overlays the
  // canvas rect and leaks into any clip that reaches the bottom edge (Task-2 finding) — hide for the shot
  await pg.evaluate(() => { ['hist', 'stat'].forEach(id => { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; }); });
  await sleep(250);
}

// X-ray reveal (the app's own '#b-xray' mode): ARC goes glass, walked disciplines glow through — the
// established way to SHOW interior fixtures in a guide frame (mirrors the Viewer ghostglass doctrine).
async function xrayOn(pg, logs) {
  const before = logs.length;
  await pg.click('#b-xray');
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (logs.slice(before).some(l => l.indexOf('xray on') >= 0)) break;
    await sleep(200);
  }
  // xrayReveal only glasses the group's DIRECT mesh children — ARC-fetch meshes are NESTED in subgroups,
  // so on residents glass=0 (finding, not fixed here). Apply the same glass doctrine via traverse so the
  // structure actually goes ghost for the shot; glowing fixtures (renderOrder 999) already handled above.
  await pg.evaluate(() => {
    const g = window.Bonsai.group();
    g.traverse(o => {
      if (!o.isMesh || !o.material || o.renderOrder === 999) return;
      if (o.userData && (o.userData.dwDisc || o.userData.dwChain || o.userData.dwAsm || o.userData.dwSub)) return;
      if (!o._xrayOwn) { o.material = o.material.clone(); o._xrayOwn = true; }
      const m = o.material;
      // 0.05 washed the whole frame near-white when a glassed wall sat between camera and subject
      // (Task-2 diagnosis, DISC_WALKER_BRANCH_CLOSEOUT.md): keep the ghost readable, not a veil.
      m.transparent = true; m.opacity = 0.14; m.color.setHex(0xaabbcc);
      if (m.emissive) { m.emissive.setHex(0x000000); m.emissiveIntensity = 0; }
      m.depthWrite = false; m.needsUpdate = true;
    });
    window.A.renderer.render(window.A.scene, window.A.camera);
  });
  await sleep(400);
}

(async () => {
  const srv = await serve(); const port = srv.address().port;
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  let failures = 0;
  console.log('═══ GUIDE-SHOTS — combined branch candidates ═══');

  // ── SHOT 1: Duplex ELEC schedule-walk, real LOD400 device meshes ─────────────────────────────
  {
    const logs = [], errs = [];
    const { ctx, pg } = await boot(browser, port, 'Duplex', logs, errs);
    const wl = await walk(pg, logs, 'ELEC');
    const placed = wl.find(l => l.indexOf('§DISC-WALK ELEC placed=') >= 0) || '';
    const lod = wl.find(l => l.indexOf('§DW-PRIM-LOD') >= 0) || '';
    console.log('  ' + placed.slice(0, 120));
    console.log('  ' + lod.slice(0, 140));
    const lod400 = (lod.match(/lod400=(\d+)/) || [])[1];
    if (!lod400 || +lod400 === 0) { console.log('  ❌ SHOT1 lod400=0 — real meshes NOT rendering'); failures++; }
    // frame: densest ELEC cluster (placements around the median point) so device meshes read at guide scale
    const box = await pg.evaluate(() => {
      const g = window.Bonsai.group(); const root = g.children.find(o => o.userData && o.userData.dwRoot);
      const pts = [];
      root.children.forEach(o => { if (o.userData && o.userData.dwDisc === 'ELEC' && Array.isArray(o.userData.dwSub)) o.userData.dwSub.forEach(p => pts.push([p.x, p.y, p.z])); });
      if (!pts.length) return null;
      // densest cluster: for the median-z storey, take the point with most neighbours in 4m, frame that hood
      const zs = pts.map(p => p[2]).sort((a, b) => a - b); const zmed = zs[Math.floor(zs.length / 2)];
      const st = pts.filter(p => Math.abs(p[2] - zmed) < 1.6);
      let best = st[0], bestN = -1;
      st.forEach(a => { const nn = st.filter(b => Math.hypot(a[0] - b[0], a[1] - b[1]) < 4).length; if (nn > bestN) { bestN = nn; best = a; } });
      const hood = st.filter(b => Math.hypot(best[0] - b[0], best[1] - b[1]) < 4.5);
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      hood.forEach(p => { for (let i = 0; i < 3; i++) { if (p[i] < min[i]) min[i] = p[i]; if (p[i] > max[i]) max[i] = p[i]; } });
      return { min, max, n: hood.length, total: pts.length };
    });
    console.log(`  §FRAME1 cluster n=${box && box.n}/${box && box.total}`);
    await collapseOutliner(pg);
    // Task-2 fix: the glass-veil xray washed the frame near-white (opacity stacking through roof+slab).
    // Cutaway instead — hide non-disc meshes fully ABOVE the subject hood (roof/skylights/upper slab),
    // same view-state hide technique shot 2 already uses; walls and fixtures stay solid and crisp.
    const cut = await pg.evaluate(zTop => {
      let n = 0;
      window.Bonsai.group().traverse(o => {
        if (!o.isMesh || (o.userData && (o.userData.dwDisc || o.userData.dwChain || o.userData.dwAsm || o.userData.dwSub))) return;
        const wb = new window.THREE.Box3().setFromObject(o);
        if (wb.min.z > zTop - 0.3) { o.visible = false; n++; }
      });
      window.A.renderer.render(window.A.scene, window.A.camera);
      return n;
    }, box.max[2]);
    console.log(`  §FRAME1 cutaway meshes hidden=${cut}`);
    // dist=12 with dir [1,-1,0.55] parked the camera OUTSIDE the shell staring at a wall (Task-2 probe P3);
    // come in higher and steeper so the view enters through the glassed roof, not through a frame-filling wall.
    await frame(pg, box, { dir: [0.7, -0.7, 1.15], dist: 15, tz: 0 });
    const pts1 = await pg.evaluate(() => {
      const root = window.Bonsai.group().children.find(o => o.userData && o.userData.dwRoot);
      const pts = [];
      root.children.forEach(o => { if (o.userData && o.userData.dwDisc === 'ELEC' && Array.isArray(o.userData.dwSub)) o.userData.dwSub.forEach(p => pts.push([p.x, p.y, p.z])); });
      return pts;
    });
    const inHood1 = pts1.filter(p => p[0] >= box.min[0] - 0.5 && p[0] <= box.max[0] + 0.5 && p[1] >= box.min[1] - 0.5 && p[1] <= box.max[1] + 0.5 && p[2] >= box.min[2] - 0.5 && p[2] <= box.max[2] + 1.0);
    const clip1 = await projClip(pg, inHood1, 150);   // 70px cropped to a single fixture — keep ARC context in frame
    await pg.screenshot({ path: path.join(OUT, 'duplex_elec_lod400_walk_fixed.png'), clip: clip1, timeout: 15000 });
    if (errs.length) { console.log('  ❌ SHOT1 console errors: ' + errs.slice(0, 3).join(' | ')); failures++; }
    else console.log('  ✅ SHOT1 zero console errors — duplex_elec_lod400_walk.png');
    await ctx.close();
  }

  // ── SHOT 2: SampleHouse rotated ELEC fixture — committed fold at correct yaw ─────────────────
  {
    const logs = [], errs = [];
    const { ctx, pg } = await boot(browser, port, 'SampleHouse', logs, errs);
    await pg.click('#bo-tree [data-disc="ELEC"]');
    await pg.waitForFunction('!!(window.__dwWalks && window.__dwWalks.ELEC && window.__dwWalks.ELEC.length > 0)', null, { timeout: 20000 });
    await pg.waitForFunction('window.__dwLastCommitDisc === "ELEC"', null, { timeout: 20000 }).catch(() => {});
    await sleep(800);
    // the W-DW-ROT-UNITS subject: a shim:host-* placement with |yaw| ≈ π/2 — frame its fixture area
    const box = await pg.evaluate(() => {
      const recs = (window.__dwWalks && window.__dwWalks.ELEC) || [];
      const rot = recs.filter(r => r.prov && r.prov.indexOf('shim:host-') === 0 && r.yaw != null && Math.abs(Math.abs(r.yaw) - Math.PI / 2) < 1e-6);
      if (!rot.length) return null;
      const a = rot[0];
      const hood = recs.filter(b => Math.hypot(a.x - b.x, a.y - b.y) < 1.2 && Math.abs(a.z - b.z) < 1.2);
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      hood.forEach(p => { for (let i = 0; i < 3; i++) { const v = [p.x, p.y, p.z][i]; if (v < min[i]) min[i] = v; if (v > max[i]) max[i] = v; } });
      return { min, max, n: hood.length, rotN: rot.length, yawDeg: a.yaw * 180 / Math.PI };
    });
    if (!box) { console.log('  ❌ SHOT2 no |yaw|≈π/2 shim placement found'); failures++; }
    else console.log(`  §FRAME2 rotated fixtures=${box.rotN} yaw=${box.yawDeg.toFixed(2)}° hood n=${box.n}`);
    await collapseOutliner(pg);
    // solid walls are the rotation reference; the curved ROOF occludes the wall-top fixtures — hide it
    // for the shot (a view-state hide, same as the Outliner eye toggle)
    const hid = await pg.evaluate(() => {
      let n = 0; const sb = new window.THREE.Box3().setFromObject(window.Bonsai.group());
      const sx = sb.max.x - sb.min.x, sy = sb.max.y - sb.min.y;
      window.Bonsai.group().traverse(o => {
        if (!o.isMesh || (o.userData && (o.userData.dwDisc || o.userData.dwSub))) return;
        const wb = new window.THREE.Box3().setFromObject(o);
        if ((wb.max.x - wb.min.x) > sx * 0.6 && (wb.max.y - wb.min.y) > sy * 0.6 && wb.min.z > 1.2) { o.visible = false; n++; }
      });
      window.A.renderer.render(window.A.scene, window.A.camera);
      return n;
    });
    console.log(`  §FRAME2 roof meshes hidden=${hid}`);
    await frame(pg, box, { dir: [0.12, -0.18, 1], dist: 3.2, tz: 0 });   // plan view — footprint-vs-wall alignment unambiguous
    const subj2 = await pg.evaluate(() => (window.__dwWalks.ELEC || [])
      .filter(r => r.prov && r.prov.indexOf('shim:host-') === 0 && Math.abs(Math.abs(r.yaw) - Math.PI / 2) < 1e-6 && r.x > 5)
      .map(r => [r.x, r.y, r.z]));
    const clip2 = await projClip(pg, subj2.filter(q => q[1] > 2).concat([[6.2, 2.9, 2.4], [6.2, 4.4, 2.4]]), 110);
    await pg.screenshot({ path: path.join(OUT, 'samplehouse_elec_rotation_fix_v2.png'), clip: clip2, timeout: 15000 });
    if (errs.length) { console.log('  ❌ SHOT2 console errors: ' + errs.slice(0, 3).join(' | ')); failures++; }
    else console.log('  ✅ SHOT2 zero console errors — samplehouse_elec_rotation_fix.png');
    await ctx.close();
  }

  console.log('GUIDE-SHOTS: ' + (failures ? failures + ' FAILURE(S)' : 'both captured, 0 console errors'));
  await browser.close(); srv.close();
  process.exit(failures ? 1 : 0);
})().catch(e => { console.log('❌ UNCAUGHT ' + String(e && e.message || e).split('\n')[0]); process.exit(1); });
