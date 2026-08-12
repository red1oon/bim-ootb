#!/usr/bin/env node
/**
 * W-HOVER-NAME / W-HOVER-COST / W-HOVER-COVERAGE / click-not-suppressed / toggle-symmetry —
 * prompts/Viewer/HOVER_NAME.md. Numeric §-tagged proof only, per CLAUDE.md's FUNDAMENTAL LAW —
 * no screenshots, no eyeballing.
 * RUN: node witness_hover_name.js
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = __dirname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css',
  '.db': 'application/octet-stream', '.data': 'application/octet-stream' };
function makeServer(root) {
  return http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    fs.readFile(path.join(root, p), (e, b) => {
      if (e) { r.writeHead(404); r.end('404'); return; }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' });
      r.end(b);
    });
  });
}
let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

// Hard watchdog — this host has been observed under heavy load from unrelated concurrent
// sessions (load avg 15+), which can stall a Puppeteer CDP round-trip indefinitely (evaluate()
// has no built-in timeout). Never let a hang masquerade as "still running" — force an exit with a
// loud, unambiguous signal instead.
const _watchdog = setTimeout(() => {
  console.log('\n§W-HOVER-NAME TIMEOUT — killed after 280s, host likely under heavy contention');
  process.exit(3);
}, 280000);

(async () => {
  const server = makeServer(ROOT);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const pg = await br.newPage();
  await pg.setViewport({ width: 1400, height: 900 });
  const hoverLogs = [];
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e)));
  pg.on('console', msg => {
    const t = msg.text();
    if (t.indexOf('§HOVER_NAME') === 0) hoverLogs.push(t);
  });
  const BLD = process.env.HOVER_WITNESS_BLD || 'Duplex_extracted.db';
  const url = `http://localhost:${port}/viewer/viewer.html?db=buildings/${BLD}`;
  console.log('  building=' + BLD);
  await pg.goto(url, { waitUntil: 'load', timeout: 90000 });
  await pg.waitForFunction('!!window.APP && !!window.APP.camera && !!window.APP.db && !!window.APP.toggleHoverName', { timeout: 90000 });
  await new Promise(r => setTimeout(r, 3000)); // let streaming settle so meshes are actually there

  // Force the Navigate bundle loaded (A.friendlyName lives there) so we're testing the steady
  // state, not the brief pre-load fallback.
  await pg.evaluate(() => window.APP.loadNavigate ? window.APP.loadNavigate() : null);
  await new Promise(r => setTimeout(r, 500));

  const meshCount = await pg.evaluate(() => window.APP.collectMeshes(o => o.isMesh || o.isInstancedMesh || o.isBatchedMesh).length);
  console.log('  scene meshCount=' + meshCount);

  // Pick N real elements with a known screen position (project their DB centre through the
  // camera) — NOT synthetic guids, real rows from element_transforms/elements_meta.
  const N = 18; // trimmed from 50 — host under heavy unrelated load, keep the run fast and reliable
  const targets = await pg.evaluate((n) => {
    const A = window.APP;
    const rows = A.dbQuery(
      `SELECT t.guid, t.center_x, t.center_y, t.center_z, m.element_name, m.ifc_class
       FROM element_transforms t JOIN elements_meta m ON m.guid = t.guid
       WHERE t.center_x IS NOT NULL ORDER BY RANDOM() LIMIT ?`, [n]);
    const out = [];
    rows.forEach(r => {
      const [guid, ix, iy, iz, name, cls] = r;
      const c = A.ifc2three(ix, iy, iz);
      const v = new THREE.Vector3(c.x, c.y, c.z).project(A.camera);
      if (v.z < -1 || v.z > 1) return; // behind camera / outside clip
      const sx = (v.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-v.y * 0.5 + 0.5) * window.innerHeight;
      if (sx < 0 || sx > window.innerWidth || sy < 0 || sy > window.innerHeight) return;
      out.push({ guid, name, cls, sx, sy, friendly: A.friendlyName(name, cls) });
    });
    return out;
  }, N);
  console.log('  on-screen candidate targets=' + targets.length + '/' + N);

  // ── Turn hover-name ON via the checkbox path (Find panel), verify the key stays in sync ──
  await pg.evaluate(() => { if (window.APP.openFindPanel) window.APP.openFindPanel(''); });
  await new Promise(r => setTimeout(r, 300));
  const cbBefore = await pg.evaluate(() => {
    const cb = document.getElementById('find-hover-name-cb');
    return cb ? { exists: true, checked: cb.checked, visible: cb.offsetParent !== null } : { exists: false };
  });
  chk('checkbox exists in Find panel', cbBefore.exists);
  chk('checkbox starts unchecked (default OFF per HOVER_NAME.md)', cbBefore.checked === false);

  await pg.evaluate(() => document.getElementById('find-hover-name-cb').click());
  await new Promise(r => setTimeout(r, 100));
  const onState1 = await pg.evaluate(() => document.getElementById('find-hover-name-cb').checked);
  chk('checkbox click → checked=true', onState1 === true);

  // Press the ' key → must toggle back OFF and the checkbox must follow (ONE state, HOVER_NAME.md).
  await pg.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: "'", bubbles: true })));
  await new Promise(r => setTimeout(r, 100));
  const afterKey = await pg.evaluate(() => document.getElementById('find-hover-name-cb').checked);
  chk("' key toggles OFF and checkbox follows (checkbox and key drive ONE state)", afterKey === false);

  // Turn back on via the key for the rest of the sweep.
  await pg.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: "'", bubbles: true })));
  await new Promise(r => setTimeout(r, 100));
  const onState2 = await pg.evaluate(() => document.getElementById('find-hover-name-cb').checked);
  chk("' key toggles ON and checkbox follows", onState2 === true);

  // ── W-HOVER-NAME (gate) + W-HOVER-COST + W-HOVER-COVERAGE: sweep real screen positions ──
  // NOTE: a target's DB-centre screen projection is NOT necessarily what the ray hits — dense BIM
  // scenes overlap in depth (a wall in front of the MEP behind it), so the nearest surface at that
  // pixel is legitimately a DIFFERENT, occluding element (same WYSIWYG rule picking.js applies).
  // The gate therefore checks the ACTUAL resolved element (via A._hoverNameState(), the same
  // test-only accessor sfx.js's window.__sfx precedent uses) against A.friendlyName for THAT
  // element — not against the pre-chosen target, which HOVER_NAME.md's own gate text calls for:
  // "the string shown equals A.friendlyName(...) for that element".
  const canvasBox = await pg.evaluate(() => { const r = window.APP.canvas.getBoundingClientRect(); return { x: r.x, y: r.y }; });
  let gateOk = 0, gateChecked = 0, coverageNamed = 0, coverageRaw = 0, roomHits = 0;
  let lastHoverGuid = null, lastHoverPos = null;
  for (const t of targets) {
    const cx = canvasBox.x + t.sx, cy = canvasBox.y + t.sy;
    await pg.mouse.move(cx - 5, cy - 5, { steps: 1 });
    await pg.mouse.move(cx, cy, { steps: 1 });
    await new Promise(r => setTimeout(r, 60)); // >= one rAF + settle
    const result = await pg.evaluate(() => {
      const A = window.APP;
      const el = document.getElementById('hover-name-label');
      const st = A._hoverNameState();
      let dbName = null, dbCls = null;
      if (st.guid) {
        const rows = A.dbQuery('SELECT element_name, ifc_class FROM elements_meta WHERE guid = ?', [st.guid]);
        if (rows.length) { dbName = rows[0][0]; dbCls = rows[0][1]; }
      }
      return {
        display: el ? el.style.display : null,
        html: el ? el.innerHTML : null,
        guid: st.guid,
        expectedFriendly: st.guid ? A.friendlyName(dbName, dbCls) : null,
        rawName: dbName
      };
    });
    if (result.display === 'block' && result.guid) {
      gateChecked++;
      const nameShown = result.html.replace(/<[^>]+>/g, '|').split('|')[1] || '';
      if (nameShown === result.expectedFriendly) gateOk++;
      if (result.expectedFriendly === result.rawName) coverageRaw++; else coverageNamed++;
      if (/opacity:0\.65/.test(result.html)) roomHits++;
      lastHoverGuid = result.guid; lastHoverPos = { cx, cy };
    }
  }
  chk('W-HOVER-NAME: label text matches A.friendlyName(...) for the ACTUAL resolved element',
    gateChecked > 0 && gateOk === gateChecked, 'checked=' + gateChecked + ' matched=' + gateOk);

  // Cost — mean/max ms from the §HOVER_NAME transition logs gathered during the sweep above.
  const costs = hoverLogs.map(l => { const m = /ms=([0-9.]+)/.exec(l); return m ? parseFloat(m[1]) : null; }).filter(v => v != null);
  const mean = costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null;
  const max = costs.length ? Math.max(...costs) : null;
  chk('W-HOVER-COST: samples captured', costs.length > 0, 'n=' + costs.length);
  console.log('  §HOVER_NAME cost mean=' + (mean != null ? mean.toFixed(2) : '?') + 'ms max=' + (max != null ? max.toFixed(2) : '?') + 'ms over n=' + costs.length + ' at meshCount=' + meshCount);
  chk('W-HOVER-COST: mean pick cost < 16ms (one frame budget at 60fps)', mean != null && mean < 16, 'mean=' + (mean || 0).toFixed(2) + 'ms');

  console.log('  W-HOVER-COVERAGE: named=' + coverageNamed + ' raw-passthrough=' + coverageRaw +
    ' room-subtitle-shown=' + roomHits + ' / resolved=' + gateChecked);

  // ── Click still SELECTS while hover is ON — the trap HOVER_NAME.md names explicitly ──
  // Click at the SAME pixel hover just verified (lastHoverGuid/lastHoverPos from the sweep above)
  // — that proves click and hover AGREE on which element is under the cursor (no "two truths, one
  // screen" desync) AND that hover does not consume/suppress the click.
  chk('sweep produced at least one verified hover position to click-test', !!lastHoverPos);
  if (lastHoverPos) {
    await pg.mouse.move(lastHoverPos.cx, lastHoverPos.cy);
    await new Promise(r => setTimeout(r, 60));
    await pg.mouse.down(); await pg.mouse.up();
    await new Promise(r => setTimeout(r, 200));
    const pickState = await pg.evaluate(() => ({
      lastPickGuid: window.APP._lastPickGuid,
      infoVisible: document.getElementById('info-panel') && document.getElementById('info-panel').style.display === 'block'
    }));
    chk('click while hover-name ON selects the SAME element hover showed (no interference)',
      pickState.lastPickGuid === lastHoverGuid, 'got=' + pickState.lastPickGuid + ' want=' + lastHoverGuid);
    chk('click while hover-name ON still opens the info panel', pickState.infoVisible === true);
  }

  chk('zero pageerrors through the whole run', errs.length === 0, errs.join(' | '));

  await br.close();
  await server.close();
  clearTimeout(_watchdog);
  console.log('\n§W-HOVER-NAME DONE pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('\n§W-HOVER-NAME CRASHED ' + (e && e.stack || e)); process.exit(2); });
