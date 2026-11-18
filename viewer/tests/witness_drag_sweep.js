// ⚠ DO NOT REMOVE — W-DRAG-SWEEP (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §14.5.3). READ THE LOG; an exit code is not evidence.
// PROVES: common/drag.js
// ISSUE it proves or disproves: §14.5 moved A._makeDraggable into common/drag.js verbatim, but only 2 of its 13 callers were ever
// dragged by a witness. A caller whose panel no longer drags would pass every other witness. This drags EVERY caller it can reach.
//   N  = a static scan: each `_makeDraggable(` / `makeDraggable(` / `CommonDrag.make(` call in viewer/ and common/ (definitions,
//        comments and tests excluded), printed with file:line.
//   Instrument: window.CommonDrag is trapped before any page script runs; its make() is wrapped to record each element and its
//        caller's file:line from the stack. The app is not changed.
//   G1 each reached site whose element is shown drags: a hand-like drag on its top strip, toward the viewport centre, moves it by
//        the dragged amount (±2 px). X of the judged sites, each named.
//   G2 the denominator, stated: reached / judged / dragged / unreached (with the reason). INCONCLUSIVE when no site is judged.
//   G3 no stray caller: every site seen in a stack is one of the scanned N.
// Falsifier (must FAIL G1): DRAG_BREAK=nostrip — the instrument sets the element's _dragStrip to -1 before the real make, so no
//   drag can start.   Run: NODE_PATH=~/bim-compiler/node_modules node viewer/tests/witness_drag_sweep.js   (headless SwiftShader, no GPU)
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..');
const BLD = process.env.BUILDINGS || path.join(process.env.HOME, 'bim-ootb', 'viewer', 'buildings');
const LOGDIR = path.join(__dirname, 'logs'); fs.mkdirSync(LOGDIR, { recursive: true });
const BRK = process.env.DRAG_BREAK || '';
const LOGF = path.join(LOGDIR, 'witness_drag_sweep' + (BRK ? '_break_' + BRK : '') + '.log');
const OUT = []; const say = (s) => { OUT.push(s); console.log(s); };
let pass = 0, fail = 0, inc = 0; const ck = (id, ok, msg) => { ok ? pass++ : fail++; say((ok ? '§PASS ' : '§FAIL ') + id + ' ' + msg); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
// the openers NOT fired, with the reason (spec §14.5.3)
const SKIP = { save: 'file dialog', open: 'file dialog', share: 'download', home: 'leaves the page', fullscreen: 'fullscreen API', 'gi-preview': 'GI render',
  lod400: 'mesh load', sched4d: 'generates a programme', walk: 'camera mode takes the pointer', whwalk: 'camera mode takes the pointer', fly: 'camera mode takes the pointer' };
const NOT_DRIVEN = { 'viewer/cinema_path_editor.js': 'opens only inside the Alt+C bake flow with a waypoint plan (no-bake rule)' };

// ── N: the static scan ──
const OWN = [];
function scan() {
  const sites = [], walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name); if (e.isDirectory()) { if (!/^(tests|node_modules|lib|vendor)$/.test(e.name)) walk(p); return; }
    if (!/\.js$/.test(e.name) || /\.min\.js$/.test(e.name)) return;
    const src = fs.readFileSync(p, 'utf8'), own = /function\s+makeDraggable\s*\(/.test(src);   // a file with its OWN makeDraggable: its bare calls are not the shared helper (§14.5.3a D3)
    if (own) OWN.push(path.relative(ROOT, p) + ':' + (src.split('\n').findIndex((l) => /function\s+makeDraggable\s*\(/.test(l)) + 1));
    src.split('\n').forEach((ln, i) => {
      const code = ln.replace(/\/\/.*$/, ''); const m = /(?:\b_?makeDraggable|\bCommonDrag\.make)\s*\(/.exec(code); if (!m) return;
      if (own && /(^|[^.\w])makeDraggable\s*\(/.test(code)) return;
      if (/=\s*function|function\s+_?makeDraggable|function\s+make\s*\(/.test(code)) return;   // a definition / the delegate, not a caller
      sites.push(path.relative(ROOT, p) + ':' + (i + 1));
    });
  });
  walk(path.join(ROOT, 'viewer')); walk(path.join(ROOT, 'common'));
  return sites.sort();
}

(async () => {
  const SITES = scan();
  say('§DRAG_SCAN N=' + SITES.length + ' ' + SITES.join(' '));
  say('§DRAG_OWN_IMPL ' + (OWN.length ? OWN.join(' ') + ' (a second drag implementation, not a caller of common/drag.js; AD-LAYER LAW 5)' : 'none'));
  const puppeteer = require('puppeteer');
  const VDB = path.join(ROOT, 'viewer', 'buildings', 'WitnessDrag_extracted.db');
  fs.mkdirSync(path.dirname(VDB), { recursive: true }); fs.copyFileSync(fs.realpathSync(path.join(BLD, 'Duplex_extracted.db')), VDB);
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const URL = 'http://127.0.0.1:' + srv.address().port + '/viewer/viewer.html?db=buildings/WitnessDrag_extracted.db&lang=en_MY';
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const R = {};   // site -> {reached, judged, dragged, why}
  const stray = [];
  try {
    let pg = null;
    const boot = async () => {
      if (pg) { try { await pg.close(); } catch (e) { /* */ } }
      pg = await br.newPage(); await pg.setViewport({ width: 1600, height: 900 });
    pg.on('dialog', (d) => d.dismiss());
    pg.on('pageerror', (e) => say('§PAGEERR ' + String(e).slice(0, 160)));
    pg.on('error', (e) => say('§DRAG_PAGE_CRASH ' + String(e).slice(0, 160)));
    pg.on('close', () => say('§DRAG_PAGE_CLOSED'));
    let navs = 0; let lastUrl = ''; pg.on('framenavigated', (f) => { const u = f.url().split('#')[0]; if (f !== pg.mainFrame() || u === lastUrl) return; lastUrl = u; if (navs++ > 0) say('§DRAG_PAGE_NAVIGATED to ' + f.url().slice(0, 120) + ' (step ' + (global.__STEP || '?') + ')'); });
    await pg.evaluateOnNewDocument((brk) => {
      window.__DRAG_EL = []; let cd;
      const site = () => {   // the first frame in viewer/ or common/ that is not the drag helper or its delegate
        const fr = (new Error().stack || '').split('\n').slice(1);
        for (const f of fr) { const m = /\/((?:viewer|common)\/[^?:)\s]+)(?:\?[^:)\s]*)?:(\d+):\d+/.exec(f); if (!m) continue;
          if (m[1] === 'common/drag.js' || (m[1] === 'viewer/measure.js' && /A\._makeDraggable|measure\.js(\?[^:]*)?:14:/.test(f))) continue; return m[1] + ':' + m[2]; }
        return '?';
      };
      Object.defineProperty(window, 'CommonDrag', { configurable: true, get: () => cd, set: (v) => {
        if (v && typeof v.make === 'function' && !v.make.__w) {
          const real = v.make; const w = function (el) { const s = site(); window.__DRAG_EL.push({ el, site: s, strip: el && el._dragStrip, done: false }); if (brk === 'nostrip' && el) el._dragStrip = -1; return real.apply(this, arguments); };
          w.__w = 1; v.make = w;
        }
        cd = v;
      } });
    }, BRK);
    await pg.goto(URL, { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction('window.APP && window.APP.db && window._TRL_READY && window._mainPillActions', { timeout: 240000 });
    await pg.waitForFunction(() => { const w = String(window._trl('ui_status_done', null, 'DONE')).split(/[ —]/)[0]; return (document.body.innerText || '').indexOf(w) >= 0; }, { timeout: 240000 }).catch(() => say('§DRAG_NOTE status DONE not seen, going on'));
    };
    await boot();
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    // a hand-like drag (first steps a few px, so they stay on the panel; drag.js captures only on the first ≥4 px move seen ON it)
    const drag = async (from, dx, dy) => { await pg.mouse.move(from.x, from.y); await pg.mouse.down();
      const n = Math.max(20, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 15));
      for (let i = 1; i <= n; i++) await pg.mouse.move(from.x + dx * i / n, from.y + dy * i / n);
      await pg.mouse.up(); await wait(300); };
    // judge every registered, not-yet-dragged element that is on screen now
    const judge = async (step) => {
      const regs = await pg.evaluate(() => window.__DRAG_EL.map((r, i) => ({ i, site: r.site, done: r.done })));
      for (const r of regs) { if (!R[r.site]) { R[r.site] = { reached: true, judged: false, dragged: false, why: 'never shown', step }; if (SITES.indexOf(r.site) < 0) stray.push(r.site); } }
      for (const r of regs) {
        if (r.done || R[r.site].dragged) continue;
        const g = await pg.evaluate((i) => {   // a grab point on the element's own top strip, the element raised above others for the test
          const rec = window.__DRAG_EL[i], el = rec.el; if (!el || !el.isConnected || !el.offsetWidth || !el.offsetHeight) return null;
          const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return null;
          const b = el.getBoundingClientRect(); if (b.bottom < 5 || b.top > innerHeight - 5 || b.right < 5 || b.left > innerWidth - 5) return null;
          rec.z = el.style.zIndex; el.style.zIndex = '2147483000';
          const strip = Math.max(8, rec.strip || 30);   // the whole strip height (Find's is 64 px with a first row of controls)
          for (let y = Math.max(b.top, 0) + 4; y < Math.max(b.top, 0) + strip - 2; y += 6) for (let x = b.left + 12; x < b.right - 6; x += 18) {
            const t = document.elementFromPoint(x, y); if (!t || !el.contains(t)) continue;
            if (/^(INPUT|BUTTON|SELECT|TEXTAREA|A)$/.test(t.tagName) || t.closest('button,input,select,textarea,a,[data-pair],[data-clash-idx]')) continue;
            if ((t.id && /close|export/.test(t.id)) || (typeof t.className === 'string' && /close/.test(t.className))) continue;
            return { x, y, l: b.left, t: b.top, w: b.width, h: b.height };
          }
          return { none: true };
        }, r.i);
        if (!g) continue;
        R[r.site].judged = true;
        if (g.none) { R[r.site].why = 'no free point on its top strip'; continue; }
        // the direction with the most room on each axis, so a panel that keeps itself on screen (_dragClamp) is not pushed into an edge
        const rl = g.l, rr = 1600 - (g.l + g.w), ru = g.t, rd = 900 - (g.t + g.h);
        const dx = rr >= rl ? Math.min(90, Math.max(10, Math.floor(rr) - 2)) : -Math.min(90, Math.max(10, Math.floor(rl) - 2));
        const dy = rd >= ru ? Math.min(60, Math.max(10, Math.floor(rd) - 2)) : -Math.min(60, Math.max(10, Math.floor(ru) - 2));
        await drag({ x: g.x, y: g.y }, dx, dy);
        const a = await pg.evaluate((i) => { const rec = window.__DRAG_EL[i], el = rec.el, b = el.getBoundingClientRect(); el.style.zIndex = rec.z || ''; return { l: b.left, t: b.top }; }, r.i);
        const mx = Math.round(a.l - g.l), my = Math.round(a.t - g.t), ok = Math.abs(mx - dx) <= 2 && Math.abs(my - dy) <= 2;
        say('  §DRAG_TRY site=' + r.site + ' step=' + step + ' grab=' + Math.round(g.x) + ',' + Math.round(g.y) + ' want=' + dx + ',' + dy + ' moved=' + mx + ',' + my + (ok ? ' ok' : ' NO'));
        if (ok) { R[r.site].dragged = true; R[r.site].why = ''; await pg.evaluate((i) => { window.__DRAG_EL[i].done = true; }, r.i); }
        else R[r.site].why = 'moved ' + mx + ',' + my + ' for ' + dx + ',' + dy;
      }
    };
    const esc = async () => { await pg.keyboard.press('Escape'); await wait(400); };
    await judge('load');
    const ids = await pg.evaluate(() => window._mainPillActions.map((a) => a.id));
    say('§DRAG_PILLS fired=' + ids.filter((i) => !SKIP[i]).length + ' skipped=' + Object.keys(SKIP).filter((i) => ids.indexOf(i) >= 0).map((i) => i + '(' + SKIP[i] + ')').join(','));
    for (const id of ids) {
      if (SKIP[id]) continue;
      say('  §DRAG_STEP pill:' + id); global.__STEP = 'pill:' + id;
      const err = await pg.evaluate(async (id) => { try { const a = window._mainPillActions.find((x) => x.id === id); if (a && a.fn) await a.fn(); return null; } catch (e) { return String(e).slice(0, 100); } }, id);
      if (err) say('  §DRAG_PILL_ERR ' + id + ' ' + err);
      await wait(2000);
      if (id === 'find') {   // a pick shows the info panel
        await pg.evaluate(() => window.APP.openFindPanel && window.APP.openFindPanel('IfcWall')); await wait(2000);
        await pg.evaluate(() => { const r = document.querySelector('.find-result-item'); if (r) r.click(); }); await wait(2000);
      }
      if (id === 'clash') {   // a matrix cell runs the pair and shows the clash list
        await judge('pill:clash');
        const hit = await pg.evaluate(() => { const cs = Array.from(document.querySelectorAll('[data-pair]')), c = cs.find((e) => /[1-9]/.test(e.textContent || '')) || cs[0]; if (c) { c.click(); return c.getAttribute('data-pair') + ' text=' + JSON.stringify((c.textContent || '').trim().slice(0, 12)) + ' of ' + cs.length; } return null; });
        say('  §DRAG_CLASH_CELL ' + (hit || 'none with a count')); await wait(4000);
      }
      if (id === 'measure') {   // a right-click on the model in measure mode shows the measure card
        await judge('pill:measure');
        const ma = await pg.evaluate(() => { const at = document.elementFromPoint(800, 450); return !!window.APP.measureActive + ' at=' + (at ? at.tagName + '#' + at.id : '-'); });
        await pg.mouse.click(800, 450, { button: 'right' }); await wait(1500);
        if (!(await pg.evaluate(() => !!window.APP._infoCardDiv))) {   // the point was covered: call the canvas's own right-click handler (picking.js:155) with that point
          await pg.evaluate(() => window.APP.handleMeasureRightClick({ clientX: 800, clientY: 450, button: 2, preventDefault() {}, stopPropagation() {} })); await wait(1500);
          say('  §DRAG_MEASURE_HANDLER called picking.js:155 path directly');
        }
        say('  §DRAG_MEASURE measureActive=' + ma + ' card=' + (await pg.evaluate(() => !!window.APP._infoCardDiv)));
      }
      await judge('pill:' + id);
      await esc();
    }
    // the direct openers on a FRESH page: a long session (the clash run + ~30 panels, SwiftShader) once crashed the renderer mid-drag
    say('  §DRAG_STEP fresh page for the direct openers'); global.__STEP = 'reload'; await boot(); await judge('reload');
    global.__STEP = 'print'; await pg.evaluate(() => { try { if (window.PrintSheet) window.PrintSheet.capture(window.APP); } catch (e) { console.log('§DRAG_PRINT_ERR ' + e); } }); await wait(5000);
    await judge('PrintSheet.capture'); await esc();
    global.__STEP = 'grid'; const g = await pg.evaluate(() => { try { if (window.APP.toggleGridOverlay) { window.APP.toggleGridOverlay(); return !!document.getElementById('grid-panel'); } } catch (e) { return 'ERR ' + e; } return null; }); await wait(2000);
    say('  §DRAG_GRID panel=' + g);
    await judge('toggleGridOverlay');
  } catch (e) { say('§DRAG_RUN_STOPPED at step ' + (global.__STEP || '?') + ': ' + String(e && e.message || e).slice(0, 160) + ' (the sites judged so far still count)'); }
  finally { await Promise.race([br.close(), new Promise((r) => setTimeout(r, 15000))]); srv.close(); try { fs.unlinkSync(VDB); } catch (e) { /* */ } }

  // ── verdict ──
  let reached = 0, judged = 0, dragged = 0; const notDragged = [];
  SITES.forEach((s) => {
    const r = R[s], file = s.replace(/:\d+$/, '');
    if (!r) { say('  §DRAG_SITE ' + s + ' UNREACHED ' + (NOT_DRIVEN[file] || 'no opener reached it in this run')); return; }
    reached++; if (r.judged) judged++; if (r.dragged) dragged++;
    say('  §DRAG_SITE ' + s + ' reached(' + r.step + ')' + (r.judged ? ' judged' : '') + (r.dragged ? ' DRAGGED' : ' — ' + r.why));
    if (r.judged && !r.dragged) notDragged.push(s + ' ' + r.why);
  });
  say('§DRAG_SWEEP N=' + SITES.length + ' reached=' + reached + ' judged=' + judged + ' dragged=' + dragged + (BRK ? ' DRAG_BREAK=' + BRK : ''));
  if (!judged) { inc++; say('INCONCLUSIVE G1 — no site was judged'); }
  else ck('G1', dragged === judged, 'every judged site drags: ' + dragged + ' of ' + judged + (notDragged.length ? ' — ' + notDragged.join(' ; ') : ''));
  ck('G3', stray.length === 0, 'every caller seen in a stack is in the scan (' + stray.length + ' stray' + (stray.length ? ': ' + stray.join(' ') : '') + ')');
  const v = fail ? 'FAIL' : (inc || !pass ? 'INCONCLUSIVE' : 'PASS');
  say('§WITNESS_DRAG_SWEEP pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' verdict=' + v + (BRK ? ' DRAG_BREAK=' + BRK : ''));
  fs.writeFileSync(LOGF, OUT.join('\n') + '\n');
  process.exit(v === 'PASS' ? 0 : 1);
})().catch((e) => { say('§DRAG_SWEEP CRASH ' + (e && e.stack || e)); fs.writeFileSync(LOGF, OUT.join('\n') + '\n'); process.exit(2); });
