// ⚠ DO NOT REMOVE — helper of W-TASK-MISSION M10 (bim-compiler prompts/MOBILE_PERF.md WO-24 + the designer's ruling of 2026-11-28).
// ISSUE: the drawing of the room path (orange line + halo + marker spheres) moved out of viewer/nf_highlight_cost.js into
//        viewer/route_line.js so the phone's mission can draw its own route with the SAME drawer. The room path must come out
//        IDENTICAL: same line vertices, same marker positions, same mesh count.
// HOW:   capture(browser, base) drives the REAL Find panel on Duplex (desktop profile) exactly as witness_find_close_no_leak_2026-07-26.js does
//        (Navigate pill -> Find -> Room axis -> Path -> first connected pair of rooms), then reads every orange (0xff9100) object in
//        the scene: type, renderOrder, material opacity, geometry parameters, and the numbers (a Line's vertex array, a mesh's position).
//        `node viewer/tests/lib_room_path_capture.js --record` writes viewer/tests/fixtures/room_path_baseline.json — it was recorded on
//        origin/main BEFORE the move (the `base_commit` field names it). The witness compares a fresh capture to that file number for number.
// Never a screenshot: numbers only.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const FIX = path.join(__dirname, 'fixtures', 'room_path_baseline.json');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream',
  '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.bin': 'application/octet-stream' };

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
    fs.readFile(path.join(ROOT, p), (e, buf) => {
      if (e) { res.writeHead(404); res.end('404 ' + p); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
    });
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

async function capture(browser, base, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } }), page = await ctx.newPage(), cons = [];
  page.on('console', m => cons.push(m.text()));
  await page.goto(base + '/viewer/viewer.html?db=buildings/Duplex_extracted.db', { waitUntil: 'networkidle' });
  let ready = false;
  for (let i = 0; i < 90 && !ready; i++) { await page.waitForTimeout(1000);
    ready = await page.evaluate(() => !!(window.APP && APP.guidMap && Object.keys(APP.guidMap).length && APP.streaming === false)).catch(() => false); }
  if (!ready) { await ctx.close(); return { ok: false, why: 'model never ready' }; }
  await page.waitForFunction(() => window._mainPillActions && window._mainPillActions.length > 0, { timeout: 15000 }).catch(() => {});
  await page.click('#mobile-trigger', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);
  const tap = async id => { const h = await page.evaluate(eid => { const el = document.getElementById(eid); if (!el) return false; el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); return true; }, id); await page.waitForTimeout(400); return h; };
  if (!(await tap('pill-navigate')) || !(await tap('drawer-row-find'))) return { ok: false, why: 'pill/drawer row missing' };
  await page.waitForTimeout(500);
  // the Room axis: cycle the axis button until its label says Room (same as the close-no-leak witness)
  let axis = null;
  for (let i = 0; i < 6; i++) {
    axis = await page.evaluate(() => { const b = document.getElementById('find-axis-toggle'); return b ? b.getAttribute('data-axis') : null; });
    if (axis === 'room' || axis === null) break;
    await page.evaluate(() => document.getElementById('find-axis-toggle').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(400);
  const pathBtn = await page.evaluate(() => { const rows = Array.from(document.querySelectorAll('#find-tree button')); const b = rows.find(x => x.textContent.trim() === 'Path'); if (!b) return false;
    b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); return true; });
  await page.waitForTimeout(400);
  const optsList = await page.evaluate(() => { const sel = document.getElementById('find-path-from'); return sel ? Array.from(sel.options).map(o => o.value).filter(v => v) : []; });
  const orange = () => page.evaluate(() => {
    const out = [];
    APP.scene.traverse(o => {
      if (!(o.material && o.material.color && '#' + o.material.color.getHexString() === '#ff9100')) return;
      const r = { type: o.type, renderOrder: o.renderOrder, opacity: o.material.opacity, geom: o.geometry.type, params: o.geometry.parameters || null };
      if (o.type === 'Line') r.vertices = Array.from(o.geometry.attributes.position.array); else r.position = [o.position.x, o.position.y, o.position.z];
      out.push(r);
    });
    return out;
  });
  let pair = null, objs = [];
  for (let i = 0; i < optsList.length - 1 && !pair; i++) {
    await page.evaluate(([f, t]) => {
      const a = document.getElementById('find-path-from'), b = document.getElementById('find-path-to');
      a.value = f; a.dispatchEvent(new Event('change', { bubbles: true })); b.value = t; b.dispatchEvent(new Event('change', { bubbles: true }));
      const wrap = b.closest('div').parentElement, btn = wrap ? Array.from(wrap.querySelectorAll('button')).find(x => x.textContent.trim().length > 0) : null;
      if (btn) btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    }, [optsList[i], optsList[i + 1]]);
    await page.waitForTimeout(500);
    objs = await orange();
    if (objs.length) pair = [optsList[i], optsList[i + 1]];
  }
  const lines = cons.filter(t => /§ROOM_PATH |§DOT_DROP|§ROOM_PATH_NOT_FOUND/.test(t)).map(t => t.replace(/^\[[^\]]*\]\s*/, ''));
  const loaded = await page.evaluate(() => ({ drawFn: typeof APP.drawRoutePoints, clearFn: typeof APP.clearRoutePoints }));
  let afterClose = null;
  if (pair) { await page.click('#find-close').catch(() => {}); await page.waitForTimeout(400); afterClose = (await orange()).length; }
  await ctx.close();
  const lineObjs = objs.filter(o => o.type === 'Line'), meshes = objs.filter(o => o.type !== 'Line');
  return { ok: !!pair, why: pair ? '' : 'no orange object for any room pair (options=' + optsList.length + ' axis=' + axis + ' pathBtn=' + pathBtn + ')',
    pair, mesh_count: objs.length, lines: lineObjs.length, markers: meshes.length, objs, console: lines, after_close: afterClose, loaded };
}

module.exports = { capture, serve, FIX };

if (require.main === module) {
  (async () => {
    const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
    const server = await serve(), browser = await chromium.launch();
    const r = await capture(browser, 'http://127.0.0.1:' + server.address().port);
    await browser.close(); server.close();
    console.log('§ROOM_PATH_CAPTURE ok=' + r.ok + ' pair=' + JSON.stringify(r.pair) + ' mesh_count=' + r.mesh_count + ' lines=' + r.lines + ' markers=' + r.markers + ' after_close=' + r.after_close + ' ' + r.why);
    (r.console || []).forEach(l => console.log('  [console] ' + l.slice(0, 300)));
    if (process.argv.includes('--record')) {
      if (!r.ok) { console.log('NOT recorded: capture failed'); process.exit(1); }
      const commit = require('child_process').execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim();
      delete r.loaded;
      fs.mkdirSync(path.dirname(FIX), { recursive: true });
      fs.writeFileSync(FIX, JSON.stringify(Object.assign({ base_commit: commit, building: 'Duplex' }, r), null, 1));
      console.log('recorded ' + FIX + ' base_commit=' + commit);
    }
    process.exit(r.ok ? 0 : 1);
  })();
}
