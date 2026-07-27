// WITNESS — §CPE_UNDO: a misplaced edit is one keystroke away from being gone.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_UNDO.
//
// THE ASK (user, 2026-07-27): "allow UNDO, Ctl-Z as reflecting in the history line to take effect
// so a misplaced can be easily reverted". Direct manipulation is only safe to experiment with if a
// bad drag costs nothing to reverse — without this, a misplaced band had to be dragged back by
// hand, which is exactly the gesture §CPE_DRAG_TELEPORT proved is hard to do accurately.
//
//   U1 a drag then Ctrl+Z restores the band centre EXACTLY (not approximately — the pre-drag
//      snapshot, so the residue is 0, unlike dragging back by hand).
//   U2 Ctrl+Shift+Z redoes it, landing back on the dragged position. Undo that cannot be redone
//      is a trap of its own.
//   U3 undo is BOUNDED by real history: with an empty stack Ctrl+Z is a no-op and must not throw,
//      corrupt the bands, or wind past the state the editor opened in.
//   U4 the edit reaches the HISTORY LINE — UniversalHistory.recordEvent is called, which is the
//      user's actual ask ("reflecting in the history line"), not just an internal stack.
//   U5 a KEYED edit (typing in the panel, not dragging) is undoable too — the panel and the canvas
//      are the same state per §CINEMA_PATH_EDITOR_MODEL item 19, so undo cannot cover only one.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8403;
const BUILDINGS = (process.env.BLDS || 'Duplex,Terminal').split(',');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function drag(page, x0, y0, x1, y1) {
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8);
  await page.mouse.up();
  await sleep(150);
}
// A REAL keystroke through the browser's input pipeline — not a call to an exposed seam, so this
// proves the binding a user actually presses is the one that works.
async function ctrlZ(page, shift) {
  await page.keyboard.down('Control');
  if (shift) await page.keyboard.down('Shift');
  await page.keyboard.press('KeyZ');
  if (shift) await page.keyboard.up('Shift');
  await page.keyboard.up('Control');
  await sleep(250);
}

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
    await page.setViewport({ width: 1280, height: 800 });
    const logs = [];
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
    await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
      { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.APP && window.APP.cinemaPathEditor && window.APP.startMaxQualityOrbit
      && window.APP._composer, { timeout: 120000 });
    await sleep(9000);
    await page.waitForFunction(() => {
      try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
      catch (e) { return false; }
    }, { timeout: 60000, polling: 2000 });

    // Spy on the history channel BEFORE the editor opens, so U4 observes real calls.
    await page.evaluate(() => {
      window.__histSpy = [];
      const UH = window.UniversalHistory;
      if (UH && UH.recordEvent) {
        const orig = UH.recordEvent.bind(UH);
        UH.recordEvent = function (type, label, ref) {
          window.__histSpy.push({ type, label });
          try { return orig(type, label, ref); } catch (e) { return null; }
        };
      }
    });

    await page.evaluate(() => { window.APP.startMaxQualityOrbit({ preview: false, fps: 1 }); });
    await page.waitForSelector('#cpe-rows', { timeout: 120000 });
    await sleep(600);

    const centres = () => page.evaluate(() => {
      const out = [];
      document.querySelectorAll('#cpe-rows > div').forEach(row => {
        const i = row.querySelectorAll('input');
        out.push({ x: parseFloat(i[0].value), z: parseFloat(i[1].value), y: parseFloat(i[2].value) });
      });
      return out;
    });
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

    // ── U3 first, while the stack is genuinely empty (order matters: it cannot be tested later).
    const cOpen = await centres();
    await ctrlZ(page, false);
    const cEmpty = await centres();
    P('U3 Ctrl+Z on an empty stack is a safe no-op (no throw, no drift)',
      dist(cOpen[0], cEmpty[0]) < 1e-9 && !logs.some(l => l.startsWith('PAGEERROR')),
      `centre moved ${dist(cOpen[0], cEmpty[0]).toExponential(2)}m; ` +
      `${logs.filter(l => l.startsWith('PAGEERROR')).length} page error(s); ` +
      `log: ${(logs.filter(l => /§CPE_UNDO/.test(l)).slice(-1)[0] || '(none)')}`);

    // Where band 0 projects on screen.
    const proj = await page.evaluate(() => {
      const A = window.APP, c = A.camera;
      const row = document.querySelectorAll('#cpe-rows > div')[0].querySelectorAll('input');
      const p = new THREE.Vector3(parseFloat(row[0].value), parseFloat(row[2].value), parseFloat(row[1].value));
      const v = p.clone().project(c);
      const r = A.canvas.getBoundingClientRect();
      return { sx: r.left + (v.x + 1) / 2 * r.width, sy: r.top + (1 - v.y) / 2 * r.height };
    });

    // ── U1: drag, then undo.
    const before = await centres();
    await drag(page, Math.round(proj.sx), Math.round(proj.sy), Math.round(proj.sx + 90), Math.round(proj.sy + 60));
    const dragged = await centres();
    const moved = dist(before[0], dragged[0]);
    await ctrlZ(page, false);
    const undone = await centres();
    const residue = dist(before[0], undone[0]);
    P('U1 a drag is exactly reverted by Ctrl+Z',
      moved > 0.5 && residue < 1e-9,
      `dragged ${moved.toFixed(2)}m, then Ctrl+Z left residue ${residue.toExponential(2)}m ` +
      `(exact snapshot restore, not a hand-drag back)`);

    // ── U2: redo.
    await ctrlZ(page, true);
    const redone = await centres();
    P('U2 Ctrl+Shift+Z redoes the drag',
      dist(dragged[0], redone[0]) < 1e-9,
      `redo landed ${dist(dragged[0], redone[0]).toExponential(2)}m from the dragged position`);

    // ── U5: a KEYED edit is undoable too.
    const preKey = await centres();
    const keyed = await page.evaluate(() => {
      const inp = document.querySelectorAll('#cpe-rows > div')[0].querySelectorAll('input')[0];
      const v = parseFloat(inp.value) + 7;
      inp.value = String(v);
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      return v;
    });
    await sleep(250);
    const afterKey = await centres();
    await ctrlZ(page, false);
    const afterKeyUndo = await centres();
    P('U5 a keyed panel edit is undoable, same as a drag',
      Math.abs(afterKey[0].x - keyed) < 1e-6 && dist(preKey[0], afterKeyUndo[0]) < 1e-9,
      `typed x=${keyed.toFixed(2)} (panel read ${afterKey[0].x.toFixed(2)}), Ctrl+Z residue ` +
      `${dist(preKey[0], afterKeyUndo[0]).toExponential(2)}m`);

    // ── U4: it reached the history line.
    const spy = await page.evaluate(() => window.__histSpy || []);
    const undoEvents = spy.filter(e => e.type === 'CINEMA_PATH_EDIT');
    P('U4 the edit reaches the history line (UniversalHistory.recordEvent)',
      undoEvents.length >= 2,
      `${undoEvents.length} CINEMA_PATH_EDIT event(s): ` +
      (undoEvents.slice(0, 4).map(e => `"${e.label}"`).join(', ') || 'none') +
      (spy.length === 0 ? ' — NOTE: UniversalHistory absent or never called' : ''));

    try { await page.evaluate(() => document.getElementById('cpe-cancel').click()); } catch (e) {}
    console.log(`  INFO  ${logs.filter(l => /§CPE_LOADED/.test(l))[0] || '(no §CPE_LOADED)'}`);
    logs.filter(l => /§CPE_UNDO/.test(l)).slice(0, 6).forEach(l => console.log(`  INFO  ${l}`));
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
