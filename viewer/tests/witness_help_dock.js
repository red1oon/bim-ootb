#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-HELP-DOCK (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §14.4). Scope: the Viewer help panel's PLACE,
// LOOK, DRAG and REOPEN (scene.js showCommandPalette → #cmd-palette; measure.js A._makeDraggable switches). READ THE LOG.
// Issues it proves/disproves (each on the real page, viewer.html + Duplex, numbers read from the DOM, never a screenshot):
//   D1 PLACE    — "help covers the tools you are using, or vanishes while you work": F1 opens it left of centre, overlapping none
//                 of Find / Issues / info (each shown first); a click in the 3D view leaves it open; Esc closes it.
//   D2 CONTRAST — "amber glass is pretty but unreadable over a light model": every visible text node's colour against its
//                 effective background (its ancestors' rgba composited over the page's dark #1a1a2e AND white #ffffff, the
//                 Background toggle's two clear colours, tools.js) has WCAG contrast ≥ 4.5. Falsifier: the same maths with the
//                 panel's alpha forced to 0.10 must fall below 4.5 on white.
//   D3 DRAG     — "dragging does not move it where you put it, loses it, or throws it off screen": a header drag by (+200,+120)
//                 moves it by that ±1 px; it is saved and a reload reopens it there; a drag far off-screen ends with the header in
//                 the window; dragging a panel WITHOUT the switches (Find) writes no storage key.
//   D4 CONTENT  — "the move lost the How To": the panel shows the same guide links as help/howto.json.
//   D5 PHONE    — "on a phone it is a cramped box you can lose off screen": iPhone emulation → it fills the screen and a drag does not move it.
//   D6 REOPEN   — "closing help throws away what I was reading": type a word, open its entry, close with ×, reopen → same text, same entry open.
// usage: NODE_PATH=~/bim-ootb/node_modules:~/bim-compiler/node_modules node viewer/tests/witness_help_dock.js
//        [BUILDINGS=<dir with Duplex_extracted.db>, default ~/bim-ootb/viewer/buildings]
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..');
const BLD = process.env.BUILDINGS || path.join(process.env.HOME, 'bim-ootb', 'viewer', 'buildings');
const H = JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'help', 'howto.json'), 'utf8'));
const log = console.log;
let fails = 0; const ck = (id, ok, msg) => { log((ok ? '§PASS ' : '§FAIL ') + id + ' ' + msg); if (!ok) fails++; };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

// in-page: min WCAG contrast over all visible text nodes of the panel, for one page background; alphaOverride for the falsifier
function contrastProbe(bgHex, alphaOverride) {
  const pal = document.getElementById('cmd-palette'); if (!pal) return null;
  const P = s => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(',').map(x => parseFloat(x)); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const L = c => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const page = { r: parseInt(bgHex.slice(1, 3), 16), g: parseInt(bgHex.slice(3, 5), 16), b: parseInt(bgHex.slice(5, 7), 16), a: 1 };
  const tw = document.createTreeWalker(pal, NodeFilter.SHOW_TEXT); let min = Infinity, worst = null, n = 0;
  while (tw.nextNode()) {
    const t = tw.currentNode, el = t.parentElement; if (!t.textContent.trim() || !el) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height || el.closest('[style*="display: none"],[style*="display:none"]')) continue;
    const chain = []; for (let e = el; e; e = e.parentElement) { const b = P(getComputedStyle(e).backgroundColor); if (b && b.a > 0) chain.push(e === pal && alphaOverride != null ? Object.assign({}, b, { a: alphaOverride }) : b); if (e === pal) break; }
    let bg = page; for (let i = chain.length - 1; i >= 0; i--) bg = over(chain[i], bg);
    const fg = over(P(getComputedStyle(el).color), bg), a = L(fg), b = L(bg), cr = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    n++; if (cr < min) { min = cr; worst = t.textContent.trim().slice(0, 40) + ' color=' + getComputedStyle(el).color; }
  }
  return { min: Math.round(min * 100) / 100, worst, n };
}

(async () => {
  const puppeteer = require('puppeteer');
  const VDB = path.join(ROOT, 'viewer', 'buildings', 'WitnessDock_extracted.db');
  fs.mkdirSync(path.dirname(VDB), { recursive: true }); fs.copyFileSync(fs.realpathSync(path.join(BLD, 'Duplex_extracted.db')), VDB);
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const URL = 'http://127.0.0.1:' + srv.address().port + '/viewer/viewer.html?db=buildings/WitnessDock_extracted.db&lang=en_MY';
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (pg, lines) => {
    pg.on('console', m => { const t = m.text(); if (/§HELP_DOCK|§KBD_HELP|§DRAG_|§HOWTO_LOAD/.test(t)) lines.push(t); });
    pg.on('pageerror', e => log('§PAGEERR ' + String(e).slice(0, 200)));
    await pg.goto(URL, { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction('window.APP && window.APP.db && window._TRL_READY && window._mainPillActions && window.showCommandPalette', { timeout: 240000 });
    await pg.waitForFunction(() => { const w = String(window._trl('ui_status_done', null, 'DONE')).split(/[ —]/)[0]; return (document.body.innerText || '').indexOf(w) >= 0; }, { timeout: 240000 });
  };
  const rect = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); if (!e || !e.offsetWidth) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, sel);
  const overlap = (a, b) => !!(a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b);
  const press = async (pg, key) => { await pg.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }); await pg.keyboard.press(key); await new Promise(r => setTimeout(r, 400)); };
  // moves like a hand: the first steps are a few px, so they stay on the panel. A_makeDraggable arms on pointerdown and only
  // captures the pointer on its first move ≥4 px seen ON the element (a tap must still reach header controls, measure.js) — a
  // first jump that lands off the panel is never seen, so a coarse 10-step drag from near an edge silently did nothing.
  const drag = async (pg, from, dx, dy) => { await pg.mouse.move(from.x, from.y); await pg.mouse.down();
    const n = Math.max(20, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 15));
    for (let i = 1; i <= n; i++) await pg.mouse.move(from.x + dx * i / n, from.y + dy * i / n);
    await pg.mouse.up(); await new Promise(r => setTimeout(r, 300)); };
  try {
    // ── desktop ──
    const pg = await br.newPage(); await pg.setViewport({ width: 1600, height: 900 }); const lines = [];
    await open(pg, lines);
    await pg.evaluate(() => localStorage.removeItem('bim_help_dock_pos'));
    // D1: Find + a pick (info panel) + Issues shown first
    await pg.evaluate(() => window.APP.openFindPanel('IfcWall')); await new Promise(r => setTimeout(r, 2500));
    await pg.evaluate(() => { const r = document.querySelector('.find-result-item'); if (r) r.click(); }); await new Promise(r => setTimeout(r, 2500));
    await pg.evaluate(() => { const a = window._mainPillActions.find(x => x.id === 'issues'); if (a && a.fn) a.fn(); }); await new Promise(r => setTimeout(r, 1500));
    const others = { find: await rect(pg, '#find-panel'), info: await rect(pg, '#info-panel'), issues: await rect(pg, '#issues-panel') };
    await press(pg, 'F1');
    await pg.waitForFunction(() => document.querySelectorAll('#cmd-palette .cmd-howto-guide').length > 0, { timeout: 30000 }).catch(() => {});
    const d = await rect(pg, '#cmd-palette');
    const hits = Object.keys(others).filter(k => overlap(d, others[k]));
    ck('D1a', !!d && d.r < 800 && !hits.length && Object.values(others).filter(Boolean).length >= 2,
      'opens left (' + JSON.stringify(d && { l: d.l, t: d.t, w: d.w, h: d.h }) + '), overlaps none of ' + Object.keys(others).filter(k => others[k]).join('+') + (hits.length ? ' HITS ' + hits : ''));
    await pg.mouse.click(1100, 450); await new Promise(r => setTimeout(r, 600));
    ck('D1b', !!(await rect(pg, '#cmd-palette')), 'a click in the 3D view leaves it open');
    // D2 contrast (panel open, entries listed)
    const dark = await pg.evaluate(contrastProbe, '#1a1a2e', null), white = await pg.evaluate(contrastProbe, '#ffffff', null), weak = await pg.evaluate(contrastProbe, '#ffffff', 0.10);
    ck('D2', dark && white && dark.n > 20 && dark.min >= 4.5 && white.min >= 4.5, 'min contrast dark=' + (dark && dark.min) + ' white=' + (white && white.min) + ' over ' + (dark && dark.n) + ' text nodes (worst white: ' + (white && white.worst) + ')');
    ck('D2-red', !!weak && weak.min < 4.5, 'falsifier: alpha 0.10 on white → min ' + (weak && weak.min) + ' (' + (weak && weak.worst) + ') must be < 4.5');
    // D4 content
    const nGuide = await pg.evaluate(() => document.querySelectorAll('#cmd-palette .cmd-howto-guide').length);
    const want = Object.values(H.pills).filter(p => p.guide).length;
    ck('D4', nGuide === want, 'guide links in the panel ' + nGuide + ' == howto.json ' + want);
    // D3 drag by the header
    const hd = await rect(pg, '#cmd-head'), before = await rect(pg, '#cmd-palette');
    await drag(pg, { x: hd.l + 40, y: hd.t + hd.h / 2 }, 200, 120);
    const after = await rect(pg, '#cmd-palette');
    const saved = await pg.evaluate(() => localStorage.getItem('bim_help_dock_pos'));
    // the panel is nearly full height, so the whole-panel clamp allows only (900 - bottom) px downwards: expect min(120, that)
    const wantDy = Math.min(120, Math.max(0, 900 - before.b));
    ck('D3a', Math.abs(after.l - before.l - 200) <= 1 && Math.abs(after.t - before.t - wantDy) <= 1 && !!saved, 'moved by (' + (after.l - before.l) + ',' + (after.t - before.t) + '), expected (200,' + wantDy + ' = clamp room), saved=' + saved);
    // a panel without the switches (#info-panel: A._makeDraggable, panels.js) moves but writes no storage key
    await pg.evaluate(() => { const r = document.querySelector('.find-result-item'); if (r) r.click(); }); await new Promise(r => setTimeout(r, 2500));   // re-pick: the 3D-view click above cleared the selection
    const keys0 = await pg.evaluate(() => Object.keys(localStorage).sort().join(','));
    const ih = await rect(pg, '#info-panel');
    if (ih) await drag(pg, { x: ih.l + 40, y: ih.t + 8 }, -120, -60);
    const keys1 = await pg.evaluate(() => Object.keys(localStorage).sort().join(','));
    const iMoved = ih ? await rect(pg, '#info-panel') : null;
    ck('D3b', !!ih && keys0 === keys1 && !!iMoved && Math.abs(iMoved.l - ih.l) > 50, 'info panel (A._makeDraggable, panels.js, no switches) dragged ' + (iMoved && Math.round(iMoved.l - ih.l)) + ' px without the switches: no storage key written (' + (keys0 === keys1) + ')');
    // a drag that would push it past the bottom-right corner (pointer stays INSIDE the window) ends clamped, and it DID move
    const hd2 = await rect(pg, '#cmd-head'), strip = hd2.h, from = { x: hd2.l + 10, y: hd2.t + strip / 2 };
    const nClamp0 = lines.filter(l => /§DRAG_CLAMP id=cmd-palette/.test(l)).length;
    await drag(pg, from, 1595 - from.x, 895 - from.y);
    const cl = await rect(pg, '#cmd-palette'), nClamp1 = lines.filter(l => /§DRAG_CLAMP id=cmd-palette/.test(l)).length;
    ck('D3c', cl.l > 1000 && nClamp1 > nClamp0 && cl.r <= 1600 + 1 && cl.b <= 900 + 1 && cl.t >= 0, 'pushed past the corner then clamped: ' + JSON.stringify({ l: cl.l, t: cl.t, r: cl.r, b: cl.b }) + ' whole panel inside 1600x900, §DRAG_CLAMP logged ' + (nClamp1 - nClamp0));
    // reopen at the saved place after a reload
    await drag(pg, { x: cl.l + 40, y: cl.t + strip / 2 }, -(cl.l - 300), -(cl.t - 200));
    const placed = await rect(pg, '#cmd-palette');
    ck('D3d-move', Math.abs(placed.l - 300) <= 1, 'dragged back from the right edge to left=' + placed.l + ' (want 300)');
    await pg.reload({ waitUntil: 'domcontentloaded', timeout: 120000 }); await pg.waitForFunction('window.showCommandPalette && window._TRL_READY', { timeout: 240000 });
    await new Promise(r => setTimeout(r, 1500)); await press(pg, 'F1');
    const re = await rect(pg, '#cmd-palette');
    ck('D3d', !!re && Math.abs(re.l - placed.l) <= 1 && Math.abs(re.t - placed.t) <= 1, 'after reload it opens where it was left: ' + JSON.stringify(re && { l: re.l, t: re.t }) + ' vs ' + JSON.stringify({ l: placed.l, t: placed.t }));
    // D6 reopen as left. (a) an entry the USER opened (left-zone click, empty search) stays open after × + F1 — a search match
    // would open it by itself, so the filter is empty here; (b) the typed search text comes back.
    await pg.evaluate(() => { const i = document.getElementById('cmd-search'); i.value = ''; i.dispatchEvent(new Event('input')); }); await new Promise(r => setTimeout(r, 300));
    const sh = await pg.evaluate(() => { const row = [...document.querySelectorAll('#cmd-palette .cmd-row')].find(r => /Share/.test(r.textContent)); if (!row) return null; row.scrollIntoView(); const r = row.getBoundingClientRect(); return { x: r.left + 10, y: r.top + r.height / 2 }; });
    if (sh) { await pg.mouse.click(sh.x, sh.y); await new Promise(r => setTimeout(r, 300)); }
    const isOpen = () => pg.evaluate(() => { const row = [...document.querySelectorAll('#cmd-palette .cmd-row')].find(r => /Share/.test(r.textContent)); const nx = row && row.nextElementSibling; return !!nx && !nx.classList.contains('cmd-row') && nx.style.display === 'block'; });
    const openedByUser = await isOpen();
    await pg.click('#cmd-close'); await new Promise(r => setTimeout(r, 300));
    const closed = !(await rect(pg, '#cmd-palette'));
    await press(pg, 'F1');
    const stillOpen = await isOpen();
    ck('D6a', openedByUser && closed && stillOpen, 'Share opened by hand (' + openedByUser + '), × closed (' + closed + '), reopened with Share still open (' + stillOpen + ')');
    await pg.evaluate(() => { const i = document.getElementById('cmd-search'); i.value = 'native'; i.dispatchEvent(new Event('input')); }); await new Promise(r => setTimeout(r, 300));
    await pg.click('#cmd-close'); await new Promise(r => setTimeout(r, 300)); await press(pg, 'F1');
    const v = await pg.evaluate(() => (document.getElementById('cmd-search') || {}).value);
    ck('D6b', v === 'native', 'typed search comes back after × + F1: "' + v + '"');
    // D1c Esc closes (focus outside the panel)
    await press(pg, 'Escape');
    ck('D1c', !(await rect(pg, '#cmd-palette')), 'Esc closes it');
    lines.forEach(l => log('  ' + l));
    await pg.close();
    // ── phone ──
    const ph = await br.newPage(); const pl = [];
    await ph.emulate(puppeteer.KnownDevices['iPhone 12']);
    await open(ph, pl);
    await ph.evaluate(() => window.showCommandPalette()); await new Promise(r => setTimeout(r, 800));
    const m = await ph.evaluate(() => ({ mobile: !!window._isMobile, W: innerWidth, H: innerHeight }));
    const a = await rect(ph, '#cmd-palette'), hp = await rect(ph, '#cmd-head');
    if (hp) await drag(ph, { x: hp.l + 40, y: hp.t + hp.h / 2 }, 0, 200);
    const b = await rect(ph, '#cmd-palette');
    ck('D5', m.mobile && a && a.l <= 0.5 && a.t <= 0.5 && Math.abs(a.w - m.W) <= 1 && Math.abs(a.h - m.H) <= 1 && b && b.t === a.t, 'phone ' + m.W + 'x' + m.H + ' mobile=' + m.mobile + ': ' + JSON.stringify(a && { l: a.l, t: a.t, w: a.w, h: a.h }) + ', after drag top=' + (b && b.t));
    pl.forEach(l => log('  ' + l));
    await ph.close();
  } finally { await br.close(); srv.close(); try { fs.unlinkSync(VDB); } catch (e) {} }
  log('§W-HELP-DOCK ' + (fails ? 'FAIL ' + fails : 'PASS'));
  process.exit(fails ? 1 : 0);
})().catch(e => { log('§FAIL W-HELP-DOCK ' + (e && e.stack || e)); try { fs.unlinkSync(path.join(ROOT, 'viewer', 'buildings', 'WitnessDock_extracted.db')); } catch (x) {} process.exit(1); });
