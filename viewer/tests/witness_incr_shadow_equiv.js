// WITNESS — W-INCR-EQUIV (TM_INCREMENTAL_RENDER_PERF.md §5), Phase 2 scope.
// ISSUE IT PROVES/DISPROVES: Phase 2 removes the blanket `!app._shadowOn` gate on the delta-skip
// path and adds a skip check to the BatchedMesh branch (previously only InstancedMesh had one).
// This is a pure perf refactor — the acceptance bar is ZERO visible-guid/slot-visibility mismatch
// between the delta path and a forced full-path re-render at the SAME cursor, WITH shadows on.
//   PASS = for each building, across forward playback, backward playback, random scrubs, and
//   jump-to-start/end, every cursor tested reports §INCR_VERIFY mismatch=0.
//   FAIL = any mismatch>0 — the delta path diverged from ground truth and must block the change.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8410;
const BUILDINGS = (process.env.BLDS || 'Hospital,LTU').split(',');

function diffSnapshots(a, b) {
  var mism = 0, details = [];
  function cmpMesh() {
    var sa = new Set(a.mesh), sb = new Set(b.mesh);
    sa.forEach(function (g) { if (!sb.has(g)) { mism++; details.push('mesh- ' + g); } });
    sb.forEach(function (g) { if (!sa.has(g)) { mism++; details.push('mesh+ ' + g); } });
  }
  function cmpSlotMap(kind) {
    var ma = a[kind], mb = b[kind];
    var ids = new Set(Object.keys(ma).concat(Object.keys(mb)));
    ids.forEach(function (id) {
      var va = ma[id] || {}, vb = mb[id] || {};
      var guids = new Set(Object.keys(va).concat(Object.keys(vb)));
      guids.forEach(function (g) {
        if (!!va[g] !== !!vb[g]) { mism++; details.push(kind + ' ' + id + ':' + g + ' ' + va[g] + '!=' + vb[g]); }
      });
    });
  }
  cmpMesh();
  cmpSlotMap('batched');
  cmpSlotMap('instanced');
  return { mism: mism, details: details.slice(0, 10) };
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  let allPass = true;

  for (const BLD of BUILDINGS) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 700 });
    const logs = [];
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));

    try {

    const url = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`;
    console.log(`\n${'='.repeat(78)}\n${BLD}\n${'='.repeat(78)}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.camera && window.APP.controls,
      { timeout: 120000 });
    await new Promise(r => setTimeout(r, 8000)); // let streaming settle

    await page.waitForFunction(() => {
      const A = window.APP;
      try { const r = A.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r.length && r[0][0] > 0; }
      catch (e) { return false; }
    }, { timeout: 180000, polling: 2000 });

    // Turn shadows ON (off -> grass) BEFORE activating TM, matching the real user path (Shadow/Alt-G).
    await page.evaluate(() => { window.APP.toggleShadow(); });

    // Activate TM and wait for the timeline to be ready.
    await page.evaluate(() => { window.toggleTimeMachine(); });
    const ready = await page.waitForFunction(() => {
      const st = window.tmGetState && window.tmGetState();
      return st && st.active && st.projectEnd > st.projectStart;
    }, { timeout: 90000 }).then(() => true).catch(() => false);

    if (!ready) {
      console.log(`${BLD}: FAIL — TM never became active/ready`);
      allPass = false;
      await page.close();
      continue;
    }

    const state0 = await page.evaluate(() => window.tmGetState());
    const shadowOn = await page.evaluate(() => !!window.APP._shadowOn);
    console.log(`${BLD}: projectStart=${state0.projectStart} projectEnd=${state0.projectEnd} shadowOn=${shadowOn}`);

    // Prime: one full pass at project start (also seeds _incrPrimed for later delta ticks).
    await page.evaluate((ps) => window.__tmSetCursor(ps), state0.projectStart);

    const span = state0.projectEnd - state0.projectStart;
    const tick = Math.max(60000, Math.round(span / 2000)); // small step relative to project length

    // Build the cursor sweep: forward playback, backward playback, random scrubs, jump-to-start/end.
    // Kept small (representative, not exhaustive) — each entry costs 2 full traverses + 2 snapshots
    // over the whole scene under puppeteer/swiftshader, which is expensive at Hospital/LTU scale.
    const cursors = [];
    let c = state0.projectStart + tick;
    for (let i = 0; i < 6; i++) { cursors.push(c); c += tick; if (c > state0.projectEnd) break; }
    let cb = state0.projectEnd - tick;
    for (let i = 0; i < 6; i++) { cursors.push(cb); cb -= tick; if (cb < state0.projectStart) break; }
    for (let i = 0; i < 5; i++) cursors.push(state0.projectStart + Math.random() * span);
    cursors.push(state0.projectStart, state0.projectEnd);

    let totalMism = 0, deltaCount = 0, fullCount = 0, crashed = false;
    for (const cur of cursors) {
      try {
        const r = await page.evaluate(async (cur) => {
          const snapA = window.__tmSetCursor(cur);
          const visA = window.__tmSnapshotVisible();
          window.__forceFull = true;
          const snapB = window.__tmSetCursor(cur);
          const visB = window.__tmSnapshotVisible();
          return { modeA: snapA && snapA.mode, modeB: snapB && snapB.mode, visA, visB };
        }, cur);
        const d = diffSnapshots(r.visA, r.visB);
        totalMism += d.mism;
        if (r.modeA === 'delta') deltaCount++; else fullCount++;
        console.log(`§INCR_VERIFY cursor=${Math.round(cur)} mismatch=${d.mism} modeA=${r.modeA}` +
          (d.mism ? ' SAMPLE=' + JSON.stringify(d.details) : ''));
      } catch (e) {
        console.log(`${BLD}: CRASH at cursor=${Math.round(cur)}: ${e.message}`);
        crashed = true;
        break;
      }
    }

    console.log(`${BLD}: TOTAL mismatch=${totalMism}  cursorsTested=${cursors.length}  deltaMode=${deltaCount} fullMode=${fullCount}`);
    if (totalMism > 0 || crashed) allPass = false;

    const errs = logs.filter(l => l.startsWith('PAGEERROR'));
    if (errs.length) { console.log(`${BLD}: PAGE ERRORS:\n` + errs.join('\n')); allPass = false; }

    } catch (e) {
      console.log(`${BLD}: SETUP CRASH: ${e.message}`);
      allPass = false;
    }
    try { await page.close(); } catch (e) {}
  }

  await browser.close();
  console.log('\n' + (allPass ? 'W-INCR-EQUIV PASS' : 'W-INCR-EQUIV FAIL'));
  process.exit(allPass ? 0 : 1);
})();
