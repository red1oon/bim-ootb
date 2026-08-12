// WITNESS — §CPE_REOPEN_NODE: the node you added survives OK, and you can SEE which node is yours.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_REOPEN_NODE.
//
// THE DEFECT THIS PROVES OR DISPROVES (user, 2026-07-31: "i can hardly pick out the extra node
// without been listed" / "the new nodes has to be darker blue when not selected to stand out"):
// `finish('ok')` handed the override to the bake (cinema_maxq.js:624) and staged NOTHING. The next
// Alt+C planned with no override (cinema_maxq.js:494 -> effects.js:6466 -> A._cinemaPathEdit null ->
// plan.bands null), so cinema_path_editor.js:1454 `authored` was false and the editor RE-SEEDED the
// derived three. The added stick was not hidden from the list — it no longer existed. And while it
// did exist it was drawn identically to a seeded band (white bar, white mid, 0x4fc3f7 ends), so it
// could not be picked out of the pipe either.
//
//   G-RN-1  RED on origin/main. Spawn a stick (rows N -> N+1), OK, re-open Alt+C: the panel lists
//           N+1 rows and the log says `§CPE_OPEN src=authored bands=N+1`. Today: `src=seeded bands=3`.
//   G-RN-2  Guardrail 2 intact: OK with NO edit stages nothing (`A._getCinemaPathEdit()` stays null)
//           and the next open is still `src=seeded`. An untouched OK must not silently pin a path.
//   G-RN-3  Provenance is CARRIED, not guessed from the index: after the re-open, exactly ONE row
//           has a × and it is the row the stick was dropped at — not every middle row.
//   G-RN-4  Colour by provenance, read off the REAL handle meshes (CLAUDE.md FUNDAMENTAL LAW —
//           numbers, never a screenshot): every unheld handle of the stick is 0x1565c0, seeded bands
//           keep 0xffffff mid / 0x4fc3f7 ends, and grabbing the stick turns its held handle 0xff8c00.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8437;
const BUILDINGS = (process.env.BLDS || 'Duplex').split(',');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const count = (logs, re) => logs.filter(l => re.test(l)).length;
const last = (logs, re) => { const h = logs.filter(l => re.test(l)); return h.length ? h[h.length - 1] : ''; };

async function newPage(browser, BLD) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => window.APP && window.APP.cinemaPathEditor && window.APP.startMaxQualityOrbit && window.APP._composer,
    { timeout: 120000 });
  await sleep(9000);
  await page.waitForFunction(() => {
    try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
    catch (e) { return false; }
  }, { timeout: 60000, polling: 2000 });
  return { page, logs };
}

// The REAL entry: Alt+C's own code path with the editor armed. Retried, because a bake left running
// from a previous OK makes start() a cancel request instead (cinema_maxq.js:420) — the retry both
// waits it out and is what accelerates it.
async function openEditor(page, tries = 8) {
  for (let t = 0; t < tries; t++) {
    await page.evaluate(() => { window.APP.startMaxQualityOrbit({ preview: false, fps: 1, frames: 4, editor: true }); });
    try {
      await page.waitForSelector('#cpe-ok', { timeout: 20000 });
      await sleep(800);
      return true;
    } catch (e) { await sleep(2500); }
  }
  return false;
}

// GRAB_PX is 18: a handle wins the pointerdown over the pipe, so a pixel that is on the pipe AND
// within 18px of a band handle is a rotate/translate gesture, not a click. Measured, not assumed —
// the first run of this witness picked frac 0.10, landed on band 0's end handle, and reported
// "rows 3 -> 3" as a product failure that was really a harness failure.
const HANDLE_CLEAR_PX = 26;

// The editor opens at the pre-dive orbit pose, from which Duplex's whole 15m walk projects into a
// ~30px smear — every pixel of it inside a band handle's 18px grab radius, so there is no pixel at
// which a click could ever reach the pipe (measured: nearest handle 0-3px across the first half of
// the walk). Looking closer is explicitly free: §CPE_PREVIEW_DIVERGENCE pins every re-plan to the
// pose the editor OPENED at, so moving the camera to see cannot change the film. This is the
// witness getting its eye close enough to click, not a product setting.
async function lookCloser(page) {
  const ok = await page.evaluate(() => {
    const A = window.APP, hs = A.cinemaPathEditor._probeHandles();
    if (!hs || !hs.length) return false;
    const mid = hs[Math.floor(hs.length / 2)];
    A.controls.target.set(mid.x, mid.y, mid.z3);
    A.camera.position.set(mid.x + 7, mid.y + 6, mid.z3 + 7);
    A.controls.update();
    if (A.markDirty) A.markDirty();
    return true;
  });
  await sleep(700);
  return ok;
}

async function findPipePixel(page) {
  const diag = [];
  for (let f = 0.02; f <= 0.98; f += 0.01) {
    const spot = await page.evaluate((f, clear) => {
      const cpe = window.APP.cinemaPathEditor;
      if (!cpe || !cpe._pipePixel || !cpe._probePipe) return null;
      const p = cpe._pipePixel(f);
      if (!p || !cpe._probePipe(p.x, p.y)) return null;
      const hs = cpe._probeHandles() || [];
      let near = 1e9;
      for (const h of hs) {
        if (h.px == null) continue;
        near = Math.min(near, Math.hypot(h.px - p.x, h.py - p.y));
      }
      if (near < clear) return { why: 'handle ' + near.toFixed(0) + 'px' };
      // The panel floats over the canvas: a pixel that is mathematically on the pipe can still
      // deliver its pointerdown to the panel (measured 2026-07-29, §CPE_CLICK_SLOP).
      if (document.elementFromPoint(p.x, p.y) !== window.APP.canvas) return null;
      return { px: p.x, py: p.y, frac: f };
    }, f, HANDLE_CLEAR_PX);
    if (spot && spot.px !== undefined) return spot;
    if (spot && spot.why) diag.push(f.toFixed(2) + ':' + spot.why);
  }
  console.log('        no usable pipe pixel — ' + diag.slice(0, 10).join(', ') + (diag.length ? '' : '(nothing hit the pipe at all)'));
  return null;
}

// §CPE_CLICK_SLOP: a 2px grab is a CLICK, and a click on the pipe spawns a stick.
async function clickPipe(page, px, py) {
  await page.mouse.move(px, py);
  await page.mouse.down();
  await page.mouse.move(px + 2, py);
  await sleep(60);
  await page.mouse.up();
  await sleep(900);
}

const rows = page => page.evaluate(() => {
  const out = [];
  document.querySelectorAll('#cpe-rows > div').forEach((d, i) => {
    const btns = Array.from(d.querySelectorAll('button')).map(b => b.textContent.trim());
    const lbl = d.querySelector('span');
    out.push({ i, label: lbl ? lbl.textContent : '', removable: btns.indexOf('×') >= 0,
               border: d.style.borderLeftColor, labelColor: lbl ? lbl.style.color : '' });
  });
  return out;
});

async function gates(browser, BLD) {
  const checks = [];
  const P = (n, ok, d) => { checks.push({ n, ok, d }); console.log(`  ${ok ? '✅' : '❌'} ${n}\n        ${d}`); };

  // ══ session 1: spawn a stick, look at it, OK ═══════════════════════════════════════════════
  const { page, logs } = await newPage(browser, BLD);
  if (!await openEditor(page)) { P('G-RN-0 the editor opens', false, 'no #cpe-ok — INCONCLUSIVE'); await page.close(); return checks; }
  await lookCloser(page);
  const spot = await findPipePixel(page);
  if (!spot) { P('G-RN-0 the fat pipe is reachable on screen', false, 'no usable pipe pixel — INCONCLUSIVE'); await page.close(); return checks; }

  const r0 = await rows(page);
  let mark = logs.length;
  await clickPipe(page, spot.px, spot.py);
  const r1 = await rows(page);
  const stickAt = r1.findIndex(r => r.removable);
  P('G-RN-1a a click on the pipe spawns exactly one stick, listed immediately',
    r1.length === r0.length + 1 && count(logs.slice(mark), /§CPE_STICK added/) === 1,
    `rows ${r0.length} -> ${r1.length}   stick at row ${stickAt}   label="${r1[stickAt] ? r1[stickAt].label : '-'}"`);

  // ── G-RN-4: colour off the real meshes, before anything is grabbed ─────────────────────────
  const h1 = await page.evaluate(() => window.APP.cinemaPathEditor._probeHandles());
  const sIdx = stickAt;
  const mine = h1.filter(h => h.b === sIdx);
  const others = h1.filter(h => h.b !== sIdx);
  const okStick = mine.length === 3 && mine.every(h => h.hex === '0x1565c0' && h.stick);
  const okOther = others.every(h => !h.stick && (h.z === 'mid' ? h.hex === '0xffffff' : h.hex === '0x4fc3f7'));
  P('G-RN-4a an unselected stick has BLUE dots; seeded bands keep their colours',
    okStick && okOther,
    `stick handles=[${mine.map(h => h.z + ':' + h.hex).join(' ')}]   ` +
    `seeded=[${others.map(h => h.z + ':' + h.hex).join(' ')}]`);

  // §CPE_STICK_RED_BAR: the bar is its own mesh — "red bar, blue dots" is two claims, so it takes
  // two probes. User, 2026-07-31: "the stick is not well colored ie if red with blue dots in it
  // will help" (all-blue read as one dim smudge).
  const bars = await page.evaluate(() => window.APP.cinemaPathEditor._probeBars());
  const myBar = bars.filter(r => r.b === sIdx)[0];
  const otherBars = bars.filter(r => r.b !== sIdx);
  P('G-RN-4c the stick BAR is red while its dots stay blue; seeded bars stay white',
    !!myBar && myBar.hex === '0xe53935' && otherBars.every(r => r.hex === '0xffffff'),
    `stick bar=${myBar ? myBar.hex : 'missing'} (want 0xe53935)   ` +
    `seeded bars=[${otherBars.map(r => r.hex).join(' ')}]   ` +
    `stick dots=[${mine.map(h => h.hex).join(' ')}]`);

  // grab the stick's middle handle — held-orange must still win over the new blue
  const mid = mine.find(h => h.z === 'mid');
  let heldHex = 'n/a', okHeld = false;
  if (mid && mid.px != null) {
    await page.mouse.move(mid.px, mid.py);
    await page.mouse.down();
    await sleep(500);
    const h2 = await page.evaluate(() => window.APP.cinemaPathEditor._probeHandles());
    const held = h2.filter(h => h.b === sIdx && h.z === 'mid')[0];
    heldHex = held ? held.hex : 'missing';
    okHeld = !!held && held.hex === '0xff8c00';
    await page.mouse.up();
    await sleep(600);
  }
  P('G-RN-4b grabbing the stick still turns it held-orange (selection stays the loudest state)',
    okHeld, `held mid handle = ${heldHex} (want 0xff8c00)`);

  // ── OK, then re-open through the real Alt+C entry ──────────────────────────────────────────
  mark = logs.length;
  await page.click('#cpe-ok');
  await sleep(2500);
  const staged = await page.evaluate(() => {
    const ov = window.APP._getCinemaPathEdit ? window.APP._getCinemaPathEdit() : null;
    return ov && ov.bands ? { bands: ov.bands.length, sticks: ov.bands.filter(b => b._stick).length } : null;
  });
  P('G-RN-1b an edited OK stages the path (the seam the whole defect turned on)',
    !!staged && staged.bands === r1.length && staged.sticks === 1,
    `A._cinemaPathEdit = ${staged ? `bands=${staged.bands} sticks=${staged.sticks}` : 'null'}   ` +
    `${last(logs.slice(mark), /§CPE_OK_STAGED/) || 'no §CPE_OK_STAGED'}`);

  mark = logs.length;
  const reopened = await openEditor(page);
  const r2 = reopened ? await rows(page) : [];
  const openLine = last(logs.slice(mark), /§CPE_OPEN /);
  P('G-RN-1 the added node is STILL THERE on re-open, and it is in the list',
    reopened && r2.length === r1.length && /src=authored/.test(openLine),
    `rows ${r1.length} -> ${r2.length}   ${openLine || 'no §CPE_OPEN line'}`);
  P('G-RN-3 provenance is carried, not guessed: exactly ONE removable row, at the same index',
    r2.filter(r => r.removable).length === 1 && r2.findIndex(r => r.removable) === stickAt,
    `removable rows=[${r2.map((r, i) => r.removable ? i : null).filter(v => v !== null).join(',')}]   ` +
    `want [${stickAt}]   labels=[${r2.map(r => r.label).join(' | ')}]`);
  P('G-RN-3c only the node the USER dropped is called a stick — the derived middle keeps its own name',
    r2.filter(r => /^stick/.test(r.label)).length === 1 && r2.some(r => r.label === 'exit door'),
    `labels=[${r2.map(r => r.label).join(' | ')}]   want exactly one "stick …"`);
  const blueRow = r2[stickAt];
  P('G-RN-3b the list carries the same blue cue as the pipe',
    !!blueRow && /rgb\(21, *101, *192\)/.test(blueRow.border || ''),
    `row ${stickAt} border=${blueRow ? blueRow.border : '-'} label=${blueRow ? blueRow.labelColor : '-'}`);
  await page.close();

  // ══ session 2: G-RN-2 — an untouched OK must stage nothing ════════════════════════════════
  const s2 = await newPage(browser, BLD);
  if (!await openEditor(s2.page)) {
    P('G-RN-2 untouched OK stages nothing', false, 'editor did not open — INCONCLUSIVE');
  } else {
    let m2 = s2.logs.length;
    await s2.page.click('#cpe-ok');
    await sleep(2500);
    const st2 = await s2.page.evaluate(() => (window.APP._getCinemaPathEdit ? window.APP._getCinemaPathEdit() : 'no hook'));
    const re2 = await openEditor(s2.page);
    const line2 = last(s2.logs.slice(m2), /§CPE_OPEN /);
    P('G-RN-2 Guardrail 2: an untouched OK stages nothing and the next open is still derived',
      st2 === null && re2 && /src=seeded/.test(line2) && count(s2.logs.slice(m2), /§CPE_OK_STAGED/) === 0,
      `_cinemaPathEdit=${JSON.stringify(st2)}   ${line2 || 'no §CPE_OPEN'}   ` +
      `§CPE_OK_STAGED=${count(s2.logs.slice(m2), /§CPE_OK_STAGED/)}`);
  }
  await s2.page.close();
  return checks;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  let allPass = true;
  for (const BLD of BUILDINGS) {
    console.log(`\n${'='.repeat(78)}\n${BLD}\n${'='.repeat(78)}`);
    const checks = await gates(browser, BLD);
    const pass = checks.filter(c => c.ok).length;
    console.log(`\n  ${BLD}: ${pass}/${checks.length}`);
    if (pass !== checks.length || !checks.length) allPass = false;
  }
  await browser.close();
  console.log(allPass ? '\nALL GREEN' : '\nRED');
  process.exit(allPass ? 0 : 1);
})();
