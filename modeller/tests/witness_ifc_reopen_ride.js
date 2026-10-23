#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-IFC-REOPEN-RIDE (§D77 of prompts/DXF2BIM_FOUNDATION_LANE.md; architect review session 5 item 5, the §D69 open item). Read the log after every run.
 *
 * THE ISSUE THIS PROVES OR DISPROVES: §D69 gave an .ifc opened in the Modeller its `rel_fills_host` rows (node, no browser); whether a DOOR RIDES ITS WALL on that reopened model — the §D59 L4 move through the
 * page's own rider cascade — was never run. Drives: Open ▸ local .ifc (the Duplex ARC file) -> a signed move of a wall that hosts doors -> real Ctrl+Z / Ctrl+Y.
 *   F1 EDGES   — the page publishes the fills edges (window.swXEdges.fills, provenance ifc:recovered) and the §ARC-1 bridge resolves both ends of at least one row to scene features.
 *   F2 RIDES   — a 0.5 m move of a wall that hosts doors moves every door it hosts by the same 0.5 m (3 mm) in the same gesture; a door of another wall stays.
 *   F3 UNDO    — one real Ctrl+Z restores the wall and its doors (the gesture's rows = the wall + its doors, flipped, none added); Ctrl+Y moves them again.
 *   F4 EXACT   — the §SDG-CASCADE riders logged = the number of resolvable fills rows of that wall (not "some").
 * Input: an .ifc (IFC_FILE; default ~/bim-compiler/reference/residential/Ifc2x3_Duplex_Architecture.ifc; absent -> INCONCLUSIVE). Software GL, headless.
 * Usage: NODE_PATH=<dir with puppeteer's parent> node modeller/tests/witness_ifc_reopen_ride.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer')), ROOT = path.join(__dirname, '..', '..');
const IFC = process.env.IFC_FILE || path.join(process.env.HOME, 'bim-compiler/reference/residential/Ifc2x3_Duplex_Architecture.ifc'), DX = 0.5;
let fail = 0, judged = 0; const say = s => console.log(s), check = (id, issue, ok, d) => { judged++; if (!ok) fail++; say((ok ? 'PASS ' : 'FAIL ') + id + ' | ' + issue + ' | ' + d); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.db': 'application/octet-stream' };
(async () => {
  if (!fs.existsSync(IFC)) { say('INCONCLUSIVE | the .ifc is absent: ' + IFC); say('SUMMARY fail=0 judged=0'); process.exit(0); }
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await br.createBrowserContext(), pg = await ctx.newPage(); await pg.setViewport({ width: 1200, height: 700 }); const logs = [];
  pg.on('pageerror', e => say('§PAGEERR ' + String(e).slice(0, 200)));
  pg.on('console', m => { const t = m.text(); if (/§SDG-CASCADE|§MOVE commit|§REL_FILLS_HOST|§ONE-GESTURE|§IFC-OPEN|§ARC-1/.test(t)) { logs.push(t); say('  ' + t.slice(0, 200)); } });
  try {
    await pg.goto(base + '/modeller/modeller.html', { waitUntil: 'load', timeout: 120000 }); await pg.waitForFunction('window.__sceneReady===true && window.Bonsai && window.A', { timeout: 120000 });
    await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__local"]', { visible: true });
    const [c] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__local"]')]); await c.accept([IFC]);
    await pg.waitForFunction('window.swXEdges && (window.swXEdges.fills||[]).length>0 && window.__arcFidByGuid && Object.keys(window.__arcFidByGuid).length>0', { timeout: 600000, polling: 1000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 4000));
    const P = await pg.evaluate(() => {
      const X = window.swXEdges || { fills: [] }, fbg = window.__arcFidByGuid || {}, rows = X.fills.filter(r => fbg[r.host_guid] != null && fbg[r.filling_guid] != null);
      const byHost = {}; rows.forEach(r => { (byHost[r.host_guid] = byHost[r.host_guid] || []).push(r.filling_guid); });
      const hosts = Object.keys(byHost).sort((a, b) => byHost[b].length - byHost[a].length || (a < b ? -1 : 1)), host = hosts[0], other = hosts.length > 1 ? byHost[hosts[hosts.length - 1]][0] : null;
      return { rowsAll: X.fills.length, prov: Array.from(new Set(X.fills.map(r => r.provenance))), resolvable: rows.length, hosts: hosts.length, host, fills: host ? byHost[host] : [], hostFid: host ? fbg[host] : null, fillFids: host ? byHost[host].map(g => fbg[g]) : [], otherDoorFid: other && !byHost[host].includes(other) ? fbg[other] : null }; });
    check('F1', 'the reopened .ifc publishes fills edges (ifc:recovered) and the bridge resolves both ends of at least one row', P.rowsAll > 0 && P.resolvable > 0 && P.host != null, `fills_rows=${P.rowsAll} provenance=${JSON.stringify(P.prov)} resolvable=${P.resolvable} hosts=${P.hosts} chosen_host_fills=${P.fills.length}`);
    if (!P.host) { say('SUMMARY fail=' + fail + ' judged=' + judged); await br.close(); srv.close(); process.exit(fail ? 1 : 0); }
    const centre = fid => pg.evaluate(f => { const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === f); if (!m) return null; m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox.clone(); m.updateMatrixWorld(); b.applyMatrix4(m.matrixWorld); return [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2]; }, fid);
    const all = async () => ({ host: await centre(P.hostFid), fills: await Promise.all(P.fillFids.map(centre)), other: P.otherDoorFid != null ? await centre(P.otherDoorFid) : null });
    const dist = (a, b) => (a && b) ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : null, len0 = await pg.evaluate(() => window.Bonsai.oplog.length);
    const S0 = await all();
    await pg.evaluate(async (fid, dx) => { window.Bonsai.selectMany([fid]); await window.__commitMove(dx, 0, 0); }, P.hostFid, DX); await new Promise(r => setTimeout(r, 3000));
    const S1 = await all(), len1 = await pg.evaluate(() => window.Bonsai.oplog.length);
    const dh = dist(S0.host, S1.host), dfs = S0.fills.map((c, i) => dist(c, S1.fills[i])), dOther = dist(S0.other, S1.other);
    check('F2', 'a 0.5 m move of the wall moves each door it hosts by the same 0.5 m (3 mm) in one gesture; a door of another wall stays', dh != null && Math.abs(dh - DX) <= 0.003 && dfs.length > 0 && dfs.every(d => d != null && Math.abs(d - DX) <= 0.003) && (dOther === null || dOther <= 0.003),
      `host_moved=${dh && dh.toFixed(4)} doors_moved=${dfs.map(d => d && d.toFixed(4)).join('/')} other_door_moved=${dOther === null ? 'n/a' : dOther.toFixed(4)} rows ${len0}->${len1}`);
    const rid = logs.filter(t => /§SDG-CASCADE hosted-by hosts=1 riders=(\d+)/.test(t)).map(t => +/riders=(\d+)/.exec(t)[1]).pop();
    check('F4', 'the riders the cascade logged = the resolvable fills rows of that wall', rid === P.fills.length, `riders_logged=${rid} fills_rows_of_host=${P.fills.length}`);
    await pg.keyboard.down('Control'); await pg.keyboard.press('z'); await pg.keyboard.up('Control'); await new Promise(r => setTimeout(r, 3000));
    const S2 = await all(), len2 = await pg.evaluate(() => window.Bonsai.oplog.length);
    await pg.keyboard.down('Control'); await pg.keyboard.press('y'); await pg.keyboard.up('Control'); await new Promise(r => setTimeout(r, 3000));
    const S3 = await all(), len3 = await pg.evaluate(() => window.Bonsai.oplog.length);
    const back = dist(S0.host, S2.host) <= 0.003 && S0.fills.every((c, i) => dist(c, S2.fills[i]) <= 0.003), again = Math.abs(dist(S0.host, S3.host) - DX) <= 0.003 && S0.fills.every((c, i) => Math.abs(dist(c, S3.fills[i]) - DX) <= 0.003);
    check('F3', 'one Ctrl+Z restores the wall and its doors; Ctrl+Y moves them again; the gesture is the wall + its doors, flipped by the keys (no new row)', back && again && len2 === len0 && len3 === len1 && len1 - len0 === 1 + P.fills.length, `undo_restored=${back} redo_moved=${again} active rows ${len0}->${len1}->${len2}->${len3} (the gesture is the wall + ${P.fills.length} doors = ${len1 - len0} rows; undo and redo only flip them, no new row)`);
  } finally { await br.close(); srv.close(); }
  say('SUMMARY fail=' + fail + ' judged=' + judged); process.exit(fail ? 1 : 0);
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
