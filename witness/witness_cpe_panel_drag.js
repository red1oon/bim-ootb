// WITNESS — §CPE_PANEL_DRAG: the path-editor panel moves by its header, and nothing else moves.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_PANEL_DRAG.
//
// ISSUE EACH GATE PROVES OR DISPROVES:
//   D1 the ask — a header drag of a known (dx,dy) moves the panel by EXACTLY that delta. A scaled,
//      offset or lagging drag would still "look draggable" in a screenshot and be wrong under the
//      hand, which is why this is measured in pixels off getBoundingClientRect, not eyeballed.
//   D2 the risk — the SAME drag must not touch the path. `_wire()` puts pointermove/pointerup on
//      WINDOW in the capture phase, and those are the handlers that move a band; the only thing
//      keeping a panel drag out of them is that `h.down` is bound to the canvas alone. Gate: zero
//      §CPE_DRAG lines, and band centres bit-identical before and after.
//   D3 the grab zone — an identical drag started on a ROW (below the 36px strip) must NOT move the
//      panel. The rows carry number inputs; keying a camera height must never fling the panel.
//   D4 session memory — after close and re-open, the panel is back where the user left it (the
//      spec's stated scope note, gated rather than assumed).
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8402;
const BUILDINGS = (process.env.BLDS || 'Duplex,Terminal').split(',');
const DX = 180, DY = 120;      // the drag under test
const TOL = 1;                 // px — sub-pixel rounding only

const sleep = ms => new Promise(r => setTimeout(r, ms));

// A real pointer drag through the browser's own input pipeline — not a synthesised DOM event.
// _makeDraggable only captures after 4px of movement, so the move is stepped, not teleported.
async function dragFrom(page, x0, y0, dx, dy) {
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(x0 + dx * i / 6, y0 + dy * i / 6);
  await page.mouse.up();
  await sleep(120);
}

const rectOf = (page, sel) => page.evaluate(s => {
  const r = document.querySelector(s).getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}, sel);

// Band centres, to 6dp — the path's own state, read straight off the live plan input.
const bandsOf = page => page.evaluate(() => {
  const r = [];
  document.querySelectorAll('#cpe-rows > div').forEach(row => {
    const v = [];
    row.querySelectorAll('input').forEach(i => v.push(i.value));
    r.push(v.join(','));
  });
  return r.join(' | ');
});

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  let allPass = true;
  const summary = [];

  for (const BLD of BUILDINGS) {
    console.log(`\n${'='.repeat(78)}\n${BLD}\n${'='.repeat(78)}`);
    const checks = [];
    const P = (n, ok, d) => { checks.push({ n, ok, d }); if (!ok) allPass = false; };

    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    const logs = [];
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));

    await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
      { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(
      () => window.APP && window.APP.cinemaPathEditor && window.APP.startMaxQualityOrbit &&
            window.APP._composer && typeof window.APP._makeDraggable === 'function',
      { timeout: 120000 });
    await sleep(9000);
    await page.waitForFunction(() => {
      try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
      catch (e) { return false; }
    }, { timeout: 60000, polling: 2000 });

    // ── open the editor exactly the way the bake does. BLOCK body on purpose: a concise body would
    // RETURN the bake's promise and page.evaluate would wait for the entire cook (protocolTimeout).
    await page.evaluate(() => { window.APP.startMaxQualityOrbit({ preview: false, fps: 1 }); });
    await page.waitForSelector('#cpe-title', { timeout: 120000 });
    await sleep(400);

    const wired = logs.filter(l => /§CPE_PANEL_DRAGGABLE/.test(l))[0] || '(no §CPE_PANEL_DRAGGABLE line)';

    // ── D1 + D2: drag the header, measure the panel and the path
    const before = await rectOf(page, '#cpe-panel');
    const bandsBefore = await bandsOf(page);
    const dragsBefore = logs.filter(l => /§CPE_DRAG /.test(l)).length;
    const t = await rectOf(page, '#cpe-title');
    await dragFrom(page, Math.round(t.left + t.width / 2), Math.round(t.top + t.height / 2), DX, DY);
    const after = await rectOf(page, '#cpe-panel');
    const bandsAfter = await bandsOf(page);
    const dragsAfter = logs.filter(l => /§CPE_DRAG /.test(l)).length;

    const mx = after.left - before.left, my = after.top - before.top;
    P(`D1 header drag moves the panel by exactly (${DX},${DY}) +/-${TOL}px`,
      Math.abs(mx - DX) <= TOL && Math.abs(my - DY) <= TOL,
      `panel (${before.left.toFixed(0)},${before.top.toFixed(0)}) -> (${after.left.toFixed(0)},${after.top.toFixed(0)}) ` +
      `= moved (${mx.toFixed(1)},${my.toFixed(1)}), asked (${DX},${DY})\n          wiring: ${wired}\n` +
      `          ${logs.filter(l => /§CPE_PANEL_MOVED/.test(l)).slice(-1)[0] || '(no §CPE_PANEL_MOVED line)'}`);

    P('D2 that drag left the PATH untouched — no §CPE_DRAG, band centres identical',
      dragsAfter === dragsBefore && bandsAfter === bandsBefore,
      `§CPE_DRAG lines ${dragsBefore} -> ${dragsAfter} (must not change) | bands ${bandsAfter === bandsBefore ? 'IDENTICAL' : 'CHANGED'}\n` +
      `          before: ${bandsBefore}\n          after:  ${bandsAfter}`);

    // ── D3: the same drag, started on a row instead of the header
    const rowRect = await page.evaluate(() => {
      const r = document.querySelectorAll('#cpe-rows > div')[0].getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });
    const beforeRow = await rectOf(page, '#cpe-panel');
    // Start on the row's own label area (left edge), clear of the number inputs.
    await dragFrom(page, Math.round(rowRect.left + 20), Math.round(rowRect.top + rowRect.height / 2), DX, -DY);
    const afterRow = await rectOf(page, '#cpe-panel');
    P('D3 a drag started on a ROW does not move the panel (grab zone = header only)',
      Math.abs(afterRow.left - beforeRow.left) <= TOL && Math.abs(afterRow.top - beforeRow.top) <= TOL,
      `panel (${beforeRow.left.toFixed(0)},${beforeRow.top.toFixed(0)}) -> (${afterRow.left.toFixed(0)},${afterRow.top.toFixed(0)}) ` +
      `= moved (${(afterRow.left - beforeRow.left).toFixed(1)},${(afterRow.top - beforeRow.top).toFixed(1)}), must be (0,0)`);

    // ── D4: close, re-open, is it where the user left it?
    const parked = await rectOf(page, '#cpe-panel');
    await page.evaluate(() => document.getElementById('cpe-cancel').click());
    await sleep(400);
    await page.evaluate(() => { window.APP.startMaxQualityOrbit({ preview: false, fps: 1 }); });
    await page.waitForSelector('#cpe-title', { timeout: 120000 });
    await sleep(400);
    const reopened = await rectOf(page, '#cpe-panel');
    P('D4 the dragged position survives close -> re-open (session memory)',
      Math.abs(reopened.left - parked.left) <= TOL && Math.abs(reopened.top - parked.top) <= TOL,
      `left at (${parked.left.toFixed(0)},${parked.top.toFixed(0)}), re-opened at (${reopened.left.toFixed(0)},${reopened.top.toFixed(0)})\n` +
      `          ${logs.filter(l => /§CPE_PANEL_DRAGGABLE/.test(l)).slice(-1)[0] || '(no line)'}`);

    try { await page.evaluate(() => document.getElementById('cpe-cancel').click()); } catch (e) {}
    await sleep(300);
    checks.forEach(c => console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.n}\n          ${c.d}`));
    summary.push({ BLD, pass: checks.every(c => c.ok), n: checks.filter(c => c.ok).length, t: checks.length });
    await page.close();
  }

  await browser.close();
  console.log(`\n${'='.repeat(78)}`);
  summary.forEach(s => console.log(`${s.pass ? 'PASS' : 'FAIL'}  ${s.BLD}  (${s.n}/${s.t})`));
  console.log(allPass ? '\nWITNESS PASS' : '\nWITNESS FAIL');
  process.exit(allPass ? 0 : 1);
})();
