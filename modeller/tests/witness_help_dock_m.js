#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-HELP-DOCK-M (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §14.5). Scope: the MODELLER's help panel —
// common/help/help_panel.js opened by ? (#m-help) and the Guide pill (#b-guide), through the Modeller adapter in modeller.html.
// READ THE LOG (modeller/tests/logs/witness_help_dock_m.log); exit code is not evidence. Numbers come from the DOM, never a screenshot.
// Issues it proves or disproves:
//   M1 PLACE    — "help covers the tools you are working with": ? opens #cmd-palette on the outliner's strip (left 0, right ≤ 240),
//                 the outliner is hidden (visibility) WITHOUT body.ol-collapsed (that class would slide #hist/#stat/#ins-panel
//                 under the panel), no visible #bar button and not the properties panel #pp-panel (the Duplex resident opened,
//                 one element selected) is overlapped.
//   M2 DRAG     — "dragged away, it leaves a hole where the outliner was": drag right past 240 px → outliner visible; drag back
//                 onto the strip → hidden again.
//   M3 CLOSE    — "closing help throws away my own outliner choice": (a) outliner open → × → visible, not collapsed;
//                 (b) the user collapsed it with the real chevron #ol-collapse → ? → × → still collapsed, visibility restored.
//   M4 CONTRAST — "amber glass unreadable on the Modeller's dark scene": every visible text node ≥ WCAG 4.5 over the scene
//                 background #14161c (modeller.html scene.background). Falsifier: alpha 0.10 over white must fall below 4.5.
//   M5 TOOLS    — "the move dropped a tool or a key from Help": X of N, N = the live #bar buttons with an icon (not ? itself),
//                 each a row with its name and its SHORTCUTS key; plus the 10 keyboard-only rows the old panel listed
//                 (measured on main, VOCAB_MESSAGE_CATALOG §14.5 ▶ STEP 2).
//   M6 GUIDE    — "the guide was lost when its overlay was deleted": the guide paragraphs in the panel == the source SECTIONS
//                 (count AND titles); #b-guide opens the panel with every section open; a word found ONLY in a guide paragraph
//                 finds its section (falsifier: a nonsense word finds nothing). M6d folded (? with no search): each section is its title
//                 row alone, NO paragraph in the page (an English paragraph hidden in the page still counts as untranslated text).
//   M7 REMEMBER — "it forgets where I put it": dragged to x≈400, reload, ? → same place, and the outliner is visible there.
//   M8 PHONE    — "on a phone it is a box you lose off screen": iPhone 12 emulation → it fills the screen; a drag does not move it.
//   M9 KEYS     — "opening help steals the Modeller's keys": ? opens it WITHOUT focusing the search box, and ? closes it again
//                 (the old overlay had no input; W-DXF-PANEL-PILL P6c also needs E to reach its pill after ? / ?).
// Verdict: PASS / FAIL n / INCONCLUSIVE (a claim judged nothing, e.g. 0 tools or the properties panel never shown).
// usage: NODE_PATH=~/bim-ootb/node_modules node modeller/tests/witness_help_dock_m.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..');
const LOGD = path.join(__dirname, 'logs'); fs.mkdirSync(LOGD, { recursive: true });
const OUT = []; const log = s => { OUT.push(s); console.log(s); };
let fails = 0, inconclusive = 0;
const ck = (id, ok, msg) => { log((ok ? '§PASS ' : '§FAIL ') + id + ' ' + msg); if (!ok) fails++; };
const inc = (id, msg) => { log('§INCONCLUSIVE ' + id + ' ' + msg); inconclusive++; };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.db': 'application/octet-stream' };
const KEY_ROWS = [['Undo', 'Ctrl+Z'], ['Redo', 'Ctrl+⇧Z'], ['Cancel current mode', 'Esc'], ['Copy', 'Ctrl+C'], ['Paste (click to place)', 'Ctrl+V'],
  ['Drawing metadata', 'Shift+D'], ['This help', '?'], ['Snap-to-geometry on/off (while moving)', 'G'], ['Arm rotate ring (turn, in Move)', 'T'], ['Arm scale cubes (in Move)', 'S']];
// the source's own guide SECTIONS titles (as witness_modeller_pill_verbs D5 reads them)
const SRC = fs.readFileSync(path.join(ROOT, 'modeller', 'modeller.html'), 'utf8');
const SRC_TITLES = (() => { const a = SRC.indexOf('const SECTIONS = ['), b = SRC.indexOf('\n  ];', a); if (a < 0 || b < 0) return [];
  return (SRC.slice(a, b).match(/^\s*\['([^']+)'/gm) || []).map(s => s.replace(/^\s*\['/, '').replace(/'$/, '')); })();

function contrastProbe(bgHex, alphaOverride) {   // the same maths as viewer/tests/witness_help_dock.js D2
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
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(b); }); });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const URL = 'http://127.0.0.1:' + srv.address().port + '/modeller/modeller.html';
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  const open = async (pg, lines) => {
    pg.on('console', m => { const t = m.text(); if (/§HELP_DOCK|§KBD_HELP|§DRAG_|§HOWTO_PALETTE|§MODELLER-GUIDE|§MODELLER help/.test(t)) lines.push(t); });
    pg.on('pageerror', e => { errs.push(String(e).slice(0, 200)); log('§PAGEERR ' + String(e).slice(0, 200)); });
    await pg.goto(URL, { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction('window.__sceneReady === true && window.HelpPanel && window.CommonDrag && document.getElementById("m-help")', { timeout: 120000 });
  };
  const rect = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); if (!e || !e.offsetWidth) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, sel);
  const overlap = (a, b) => !!(a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b);
  const ol = pg => pg.evaluate(() => { const o = document.getElementById('bonsai-outliner'); return { vis: o ? getComputedStyle(o).visibility : 'none', collapsed: document.body.classList.contains('ol-collapsed') }; });
  const clickHelp = async pg => { await pg.evaluate(() => document.getElementById('m-help').click()); await new Promise(r => setTimeout(r, 400)); };
  const closeX = async pg => { await pg.evaluate(() => { const x = document.getElementById('cmd-close'); if (x) x.click(); }); await new Promise(r => setTimeout(r, 300)); };
  const drag = async (pg, from, dx, dy) => { await pg.mouse.move(from.x, from.y); await pg.mouse.down();
    const n = Math.max(20, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 15));
    for (let i = 1; i <= n; i++) await pg.mouse.move(from.x + dx * i / n, from.y + dy * i / n);
    await pg.mouse.up(); await new Promise(r => setTimeout(r, 300)); };
  const head = async pg => { const h = await rect(pg, '#cmd-head'); return { x: h.l + 30, y: h.t + h.h / 2 }; };
  try {
    const pg = await br.newPage(); await pg.setViewport({ width: 1440, height: 900 }); const lines = [];
    await open(pg, lines);
    await pg.evaluate(() => { localStorage.removeItem('dagevu_modeller_help_dock_pos'); localStorage.setItem('dagevu_modeller_ol_open', '1'); });
    // the Duplex resident opened and one of its elements selected, so the properties panel is on screen (as e2e_harness open())
    await pg.click('#b-open'); await new Promise(r => setTimeout(r, 300));
    await pg.click('#m-open-panel .mo-row[data-key="Duplex"]');
    await pg.waitForFunction(() => !!window.__dwBuf, { timeout: 60000 }).catch(() => {}); await new Promise(r => setTimeout(r, 2500));
    const fid = await pg.evaluate(() => { const g = window.Bonsai.group && window.Bonsai.group(); const m = g && g.children.find(c => c.isMesh && c.userData && c.userData.featureId != null); if (m) window.Bonsai.select(m.userData.featureId); return m ? m.userData.featureId : null; });
    await new Promise(r => setTimeout(r, 2500)); log('  selected fid=' + fid);
    const pp = await rect(pg, '#pp-panel'), ol0 = await ol(pg);
    // #bar is a full-width container; the controls are its visible buttons (laid out along the rail)
    const btns = () => pg.evaluate(() => [...document.querySelectorAll('#bar button')].filter(b => b.offsetWidth && getComputedStyle(b).display !== 'none').map(b => { const r = b.getBoundingClientRect(); return { id: b.id, l: r.left, t: r.top, r: r.right, b: r.bottom }; }));
    // ── M1 ──
    await clickHelp(pg);
    const d = await rect(pg, '#cmd-palette'), ol1 = await ol(pg), lit = await pg.evaluate(() => document.getElementById('m-help').classList.contains('on'));
    ck('M1a', !!d && d.l <= 0.5 && d.t <= 0.5 && d.r <= 240.5 && Math.abs(d.h - 900) <= 1, '? opens on the outliner strip: ' + JSON.stringify(d && { l: d.l, t: d.t, r: d.r, h: d.h }));
    ck('M1b', ol0.vis === 'visible' && !ol0.collapsed && ol1.vis === 'hidden' && !ol1.collapsed, 'outliner before ' + JSON.stringify(ol0) + ' → open ' + JSON.stringify(ol1) + ' (hidden, NOT ol-collapsed)');
    const bs = await btns(), hitB = bs.filter(b => overlap(d, b)).map(b => b.id);
    if (!bs.length) inc('M1c', 'no visible #bar button — nothing judged');
    else ck('M1c', hitB.length === 0, (bs.length - hitB.length) + ' of ' + bs.length + ' visible #bar buttons not covered' + (hitB.length ? ' COVERED ' + hitB.join(',') : '') + ' (panel right ' + (d && d.r) + ')');
    if (!pp) inc('M1d', '#pp-panel was not on screen (selected fid=' + fid + ') — nothing judged');
    else ck('M1d', !overlap(d, pp), '#pp-panel not covered: ' + JSON.stringify({ l: pp.l, t: pp.t, r: pp.r, b: pp.b }));
    ck('M1e', lit, 'the ? pill is lit while open');
    // ── M4 ──
    const dark = await pg.evaluate(contrastProbe, '#14161c', null), weak = await pg.evaluate(contrastProbe, '#ffffff', 0.10);
    ck('M4', !!dark && dark.n > 20 && dark.min >= 4.5, 'min contrast over #14161c = ' + (dark && dark.min) + ' over ' + (dark && dark.n) + ' text nodes (worst: ' + (dark && dark.worst) + ')');
    ck('M4-red', !!weak && weak.min < 4.5, 'falsifier: alpha 0.10 over white → min ' + (weak && weak.min) + ' must be < 4.5');
    // ── M5 ──
    const m5 = await pg.evaluate(keyRows => {
      const SC = { 'b-fit': 'F', 'b-insert': 'R', 'b-del': 'Del', 'b-move': 'M', 'b-open': 'O', 'b-export': 'E', 'b-2d': 'D' };   // modeller.html SHORTCUTS
      const rows = [...document.querySelectorAll('#cmd-palette .cmd-row')].map(r => ({ t: r.textContent.replace(/\s+/g, ' ').trim(), k: (r.querySelector('kbd') || {}).textContent || '' }));
      const tools = [...document.querySelectorAll('#bar button')].filter(b => b.querySelector('.ic') && b.style.display !== 'none' && b.id !== 'm-help')
        .map(b => { const s = b.querySelector('span'); return { id: b.id, name: s ? s.textContent.trim() : (b.title || b.id), key: SC[b.id] || '' }; });
      const miss = tools.filter(x => !rows.some(r => r.t.indexOf(x.name) === 0 && r.k === x.key)).map(x => x.id + '"' + x.name + '"' + x.key);
      const kmiss = keyRows.filter(([n, k]) => !rows.some(r => r.t.indexOf(n) === 0 && r.k === k)).map(([n, k]) => n + ' ' + k);
      return { n: tools.length, miss, kmiss, rows: rows.length };
    }, KEY_ROWS);
    if (!m5.n) inc('M5a', 'no #bar tools found — nothing judged');
    else ck('M5a', m5.miss.length === 0, (m5.n - m5.miss.length) + ' of ' + m5.n + ' #bar tools are rows with their key' + (m5.miss.length ? ' MISSING ' + m5.miss.join(', ') : ''));
    ck('M5b', m5.kmiss.length === 0, (KEY_ROWS.length - m5.kmiss.length) + ' of ' + KEY_ROWS.length + ' keyboard rows' + (m5.kmiss.length ? ' MISSING ' + m5.kmiss.join(', ') : '') + ' (panel rows ' + m5.rows + ')');
    // ── M6 ──
    const guideIn = () => pg.evaluate(() => [...document.querySelectorAll('#cmd-palette .cmd-howto-text')].map(t => {
      const box = t.parentElement, row = box && box.previousElementSibling; return { title: row ? row.textContent.replace(/\s+/g, ' ').trim() : '', open: box.style.display === 'block' }; }));
    // M6d folded: on ? (no search) each guide section is its title row alone — no hidden English paragraph on the page
    const g1 = await guideIn(), rowNames = await pg.evaluate(() => [...document.querySelectorAll('#cmd-palette .cmd-row')].map(r => r.textContent.replace(/\s+/g, ' ').trim()));
    ck('M6d', g1.length === 0 && SRC_TITLES.length > 0 && SRC_TITLES.every(t => rowNames.indexOf(t) >= 0), 'folded: ' + g1.length + ' guide paragraphs in the page, ' + SRC_TITLES.filter(t => rowNames.indexOf(t) >= 0).length + ' of ' + SRC_TITLES.length + ' section titles as rows');
    const search = async w => { await pg.evaluate(w => { const i = document.getElementById('cmd-search'); i.value = w; i.dispatchEvent(new Event('input')); }, w); await new Promise(r => setTimeout(r, 300));
      return pg.evaluate(() => [...document.querySelectorAll('#cmd-palette .cmd-row')].map(r => r.textContent.replace(/\s+/g, ' ').trim())); };
    const hit = await search('turns green'), none = await search('zqxwv');
    // §19.4 (VOCAB_MESSAGE_CATALOG.md): the search is the shared query core (ranked, any-term), not a whole-phrase substring. "turns green" is a phrase only the 3D Grid paragraph has, but the Teams paragraph
    // holds the word "turns" ("click turns it on"), so the list is [3D Grid, Teams]: 3D Grid FIRST (both words), the weaker hit after. OLD expectation: exactly ["3D Grid"]. NEW: 3D Grid first, the nonsense word still finds 0.
    ck('M6c', hit.length >= 1 && hit[0] === '3D Grid' && hit.every(x => SRC_TITLES.indexOf(x) >= 0) && none.length === 0, '"turns green" (both words only in the 3D Grid paragraph) finds ' + JSON.stringify(hit) + ' (3D Grid first); falsifier "zqxwv" finds ' + none.length);
    await search('');
    await closeX(pg);
    await pg.evaluate(() => document.getElementById('b-guide').click()); await new Promise(r => setTimeout(r, 400));
    const g2 = await guideIn(), gLit = await pg.evaluate(() => document.getElementById('b-guide').classList.contains('on'));
    const titles = g2.map(x => x.title), same = SRC_TITLES.length > 0 && titles.length === SRC_TITLES.length && SRC_TITLES.every((t, i) => titles[i] === t);
    ck('M6a', same, 'guide paragraphs in the panel ' + titles.length + ' == source SECTIONS ' + SRC_TITLES.length + (same ? '' : ' panel=[' + titles.join(' | ') + '] source=[' + SRC_TITLES.join(' | ') + ']'));
    ck('M6b', g2.length === SRC_TITLES.length && g2.every(x => x.open) && gLit, '#b-guide opens the panel with ' + g2.filter(x => x.open).length + ' of ' + g2.length + ' sections open, Guide pill lit=' + gLit);
    // ── M3a ──
    await closeX(pg);
    const ol3a = await ol(pg), gone = !(await rect(pg, '#cmd-palette'));
    ck('M3a', gone && ol3a.vis === 'visible' && !ol3a.collapsed, '× closes; outliner was open → ' + JSON.stringify(ol3a));
    // ── M2 ──
    await clickHelp(pg);
    let h = await head(pg); await drag(pg, h, 400, 0);
    const r2a = await rect(pg, '#cmd-palette'), ol2a = await ol(pg);
    ck('M2a', r2a.l >= 240 && ol2a.vis === 'visible', 'dragged to left=' + r2a.l + ' → outliner ' + ol2a.vis);
    h = await head(pg); await drag(pg, h, -(r2a.l - 20), 0);
    const r2b = await rect(pg, '#cmd-palette'), ol2b = await ol(pg);
    ck('M2b', r2b.l < 240 && ol2b.vis === 'hidden', 'dragged back to left=' + r2b.l + ' → outliner ' + ol2b.vis);
    await closeX(pg);
    // ── M3b: the user collapses the outliner with its own chevron ──
    await pg.evaluate(() => document.getElementById('ol-collapse').click()); await new Promise(r => setTimeout(r, 300));
    const c0 = await ol(pg);
    await clickHelp(pg); const c1 = await ol(pg); await closeX(pg); const c2 = await ol(pg);
    ck('M3b', c0.collapsed && c1.collapsed && c2.collapsed && c2.vis === 'visible', 'user-collapsed ' + JSON.stringify(c0) + ' → open ' + JSON.stringify(c1) + ' → × ' + JSON.stringify(c2) + ' (still collapsed)');
    await pg.evaluate(() => document.getElementById('ol-show').click()); await new Promise(r => setTimeout(r, 300));
    // ── M7 ──
    await clickHelp(pg);
    h = await head(pg); await drag(pg, h, 400, 100);
    const placed = await rect(pg, '#cmd-palette');
    await pg.reload({ waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction('window.__sceneReady === true && window.HelpPanel && document.getElementById("m-help")', { timeout: 120000 });
    await clickHelp(pg);
    const re = await rect(pg, '#cmd-palette'), ol7 = await ol(pg);
    ck('M7', !!re && Math.abs(re.l - placed.l) <= 1 && Math.abs(re.t - placed.t) <= 1 && placed.l >= 240 && ol7.vis === 'visible',
      'after reload it opens where it was left ' + JSON.stringify(re && { l: re.l, t: re.t }) + ' vs ' + JSON.stringify({ l: placed.l, t: placed.t }) + ', outliner ' + ol7.vis);
    await closeX(pg);
    // ── M9: the Modeller's single-letter keys keep working while help is open (cfg.noAutoFocus) ──
    await pg.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
    await pg.keyboard.press('?'); await new Promise(r => setTimeout(r, 400));
    const k1 = await pg.evaluate(() => ({ open: !!document.getElementById('cmd-palette'), focus: (document.activeElement || {}).id || document.activeElement.tagName }));
    await pg.keyboard.press('?'); await new Promise(r => setTimeout(r, 400));
    const k2 = await pg.evaluate(() => ({ open: !!document.getElementById('cmd-palette') }));
    ck('M9', k1.open && k1.focus !== 'cmd-search' && !k2.open, '? opens (focus on ' + k1.focus + ', not the search box) and ? closes again: ' + JSON.stringify([k1, k2]));
    await pg.evaluate(() => localStorage.removeItem('dagevu_modeller_help_dock_pos'));
    lines.forEach(l => log('  ' + l));
    await pg.close();
    // ── M8 phone ──
    const ph = await br.newPage(); const pl = [];
    await ph.emulate(puppeteer.KnownDevices['iPhone 12']);
    await open(ph, pl);
    await clickHelp(ph);
    const W = await ph.evaluate(() => ({ W: innerWidth, H: innerHeight }));
    const a = await rect(ph, '#cmd-palette'), hp = await rect(ph, '#cmd-head');
    if (hp) await drag(ph, { x: hp.l + 40, y: hp.t + hp.h / 2 }, 0, 200);
    const b = await rect(ph, '#cmd-palette');
    ck('M8', !!a && a.l <= 0.5 && a.t <= 0.5 && Math.abs(a.w - W.W) <= 1 && Math.abs(a.h - W.H) <= 1 && !!b && b.t === a.t,
      'phone ' + W.W + 'x' + W.H + ': ' + JSON.stringify(a && { l: a.l, t: a.t, w: a.w, h: a.h }) + ', after drag top=' + (b && b.t));
    pl.forEach(l => log('  ' + l));
    await ph.close();
    ck('M0', errs.length === 0, 'page errors ' + errs.length + (errs[0] ? ' ' + errs[0] : ''));
  } finally { await br.close(); srv.close(); }
  log('§W-HELP-DOCK-M ' + (fails ? 'FAIL ' + fails : inconclusive ? 'INCONCLUSIVE ' + inconclusive : 'PASS'));
  fs.writeFileSync(path.join(LOGD, 'witness_help_dock_m.log'), OUT.join('\n') + '\n');
  process.exit(fails || inconclusive ? 1 : 0);
})().catch(e => { log('§FAIL W-HELP-DOCK-M ' + (e && e.stack || e)); try { fs.writeFileSync(path.join(LOGD, 'witness_help_dock_m.log'), OUT.join('\n') + '\n'); } catch (x) {} process.exit(1); });
