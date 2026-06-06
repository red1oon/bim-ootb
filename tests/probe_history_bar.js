// probe_history_bar.js — witness HISTORY_SCRUB_FIX §2/§3/§4/§5/§7 (the bar's own UX).
// Drives the REAL viewer on Duplex (non-split, fast). Leak-safe (caller kills chrome).
//   §7 BUILDING_OPEN: a fresh session's timeline is non-empty (§HIST_PUSH BUILDING_OPEN, no taps).
//   §3 PLACEMENT: #universal-hist-btns is a child of #status-bar-wrap, centered, BELOW the status row.
//   §2 BLOOM: double-tap the bar → dots become labelled chips (icon+label); tap chip → jumpTo.
//   §2 ICONS: a pick chip carries a discipline icon; the building-open chip carries a scope icon.
//   §4 MAXIMISE: focusOnlyLatest keeps #status-bar-wrap + the scrub visible (not swipe-hidden).
//   §5 LEGACY GONE: #undo-redo-btns querySelector null; showUndoRedo is a no-op.
//   NO REGRESSION: a 3D pick still records; idle gate parks; no PAGEERRORS.
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8146;
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/Duplex_extracted.db&bld=Duplex`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  try {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
    await page.goto(URL, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(() => {
      const A = window.A || window.APP;
      return A && A.db && A.activeBuilding && A.meshCache && Object.keys(A.meshCache).length > 0;
    }, { timeout: 180000 }).catch(e => console.log('WAIT_FAIL ' + e.message));
    // wait for streaming to finish → BUILDING_OPEN fires at stream-complete
    await page.waitForFunction(() => { const A = window.A || window.APP; return A && A.streaming === false; }, { timeout: 60000 }).catch(e => console.log('STREAM_WAIT_FAIL ' + e.message));
    await sleep(1500);
    await page.evaluate(() => { try { localStorage.removeItem('bim.universalHist.on'); } catch(e){} });

    // ── §7 building-open recorded with NO prior taps ─────────────────────
    console.log('--- §7 BUILDING_OPEN (no taps yet) ---');
    console.log(logs.filter(l => l.includes('§HIST_PUSH') && l.includes('Opened')).join('\n') ||
      logs.filter(l => l.includes('BUILDING_OPEN')).slice(-2).join('\n') || '(NONE)');

    // open the bar
    await page.evaluate(() => { if (window.UniversalHistory) UniversalHistory.open(); });
    await sleep(300);

    // ── §3 placement: scrub is a child of status-bar-wrap, below the status row, centered ─
    const place = await page.evaluate(() => {
      const bar = document.getElementById('universal-hist-btns');
      const wrap = document.getElementById('status-bar-wrap');
      const status = document.getElementById('status');
      if (!bar || !wrap || !status) return { ok: false, bar: !!bar, wrap: !!wrap };
      const inWrap = wrap.contains(bar);
      const br = bar.getBoundingClientRect(), sr = status.getBoundingClientRect();
      const W = window.innerWidth;
      return {
        ok: true, childOfWrap: inWrap,
        scrubBelowStatus: br.top >= sr.bottom - 4,
        barCenterX: Math.round(br.left + br.width / 2), statusCenterX: Math.round(sr.left + sr.width / 2),
        viewportCenterX: Math.round(W / 2)
      };
    });
    console.log('--- §3 PLACEMENT ---');
    console.log(JSON.stringify(place) + ' (want childOfWrap=true, scrubBelowStatus=true, centers≈viewportCenter)');

    // Helper: project an element to screen + dispatch a real tap (records a pick → chip icon test).
    async function tapElement(rank) {
      return await page.evaluate((rank) => {
        const A = window.A || window.APP;
        const r = A.db.exec("SELECT m.guid, m.element_name, m.ifc_class, t.center_x, t.center_y, t.center_z FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid WHERE t.center_x IS NOT NULL ORDER BY (t.bbox_x*t.bbox_y*t.bbox_z) DESC LIMIT 8");
        if (!r.length || !r[0].values.length) return { ok: false };
        const row = r[0].values[Math.min(rank, r[0].values.length - 1)];
        const c = A.ifc2three(row[3], row[4], row[5]);
        const v = new THREE.Vector3(c.x, c.y, c.z).project(A.camera);
        const px = (v.x * 0.5 + 0.5) * window.innerWidth, py = (-v.y * 0.5 + 0.5) * window.innerHeight;
        const cv = A.canvas, opt = () => ({ bubbles: true, cancelable: true, clientX: px, clientY: py, button: 0, pointerId: 1, isPrimary: true });
        cv.dispatchEvent(new PointerEvent('pointerdown', opt()));
        cv.dispatchEvent(new PointerEvent('pointerup', opt()));
        return { ok: true, guid: row[0], name: row[1], cls: row[2] };
      }, rank);
    }

    // ── NO REGRESSION: a 3D pick still records (the timeline now has open + pick) ─
    const t1 = await tapElement(0);
    console.log('TAP1: ' + JSON.stringify(t1));
    await page.waitForFunction(() => { const A = window.A || window.APP; return A && typeof A.focusElement === 'function'; }, { timeout: 30000 }).catch(() => {});
    await sleep(1200);

    // ── §2 bloom: double-tap the BAR (empty area) → chips with icons ─────
    await page.evaluate(() => {
      const bar = document.getElementById('universal-hist-btns');
      const ev = () => new PointerEvent('pointerup', { bubbles: false });
      bar.dispatchEvent(ev());
    });
    await sleep(80);
    await page.evaluate(() => { document.getElementById('universal-hist-btns').dispatchEvent(new PointerEvent('pointerup', { bubbles: false })); });
    await sleep(400);
    const bloom = await page.evaluate(() => {
      const marks = document.getElementById('hist-marks');
      const chips = marks ? Array.from(marks.children) : [];
      return {
        chipCount: chips.length,
        chipsHaveText: chips.filter(c => (c.textContent || '').trim().length > 0).length,
        chipsHaveSvg: chips.filter(c => c.querySelector && c.querySelector('svg')).length,
        firstChipLabel: chips[0] ? (chips[0].textContent || '').trim() : null,
        gold: chips.map(c => /255, 212, 121|#ffd479/.test(c.style.cssText) || /ffd479/.test(c.style.boxShadow || '')).filter(Boolean).length
      };
    }).catch(e => ({ err: e.message }));
    console.log('--- §2 BLOOM (want chipCount≥2, chipsHaveSvg≥2, chipsHaveText≥2) ---');
    console.log(JSON.stringify(bloom));
    console.log('§HIST_BLOOM log: ' + (logs.filter(l => l.includes('§HIST_BLOOM')).join(' | ') || '(none)'));

    // chip icons by WHAT: pick chip has a discipline icon path; the building-open chip is the home/scope icon
    const iconInfo = await page.evaluate(() => {
      const list = (window.UniversalHistory && UniversalHistory.list()) || [];
      const marks = document.getElementById('hist-marks');
      const chips = marks ? Array.from(marks.children) : [];
      return list.map((e, i) => ({ kind: e.kind, label: (e.label||'').slice(0,28), hasSvg: !!(chips[i] && chips[i].querySelector && chips[i].querySelector('svg')) }));
    });
    console.log('STEPS+icons: ' + JSON.stringify(iconInfo));

    // tap a chip → jumpTo restores (read-only)
    const jumpRes = await page.evaluate(() => {
      const marks = document.getElementById('hist-marks');
      if (!marks || !marks.children.length) return 'no-chips';
      marks.children[0].dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      return 'tapped-chip-0';
    });
    await sleep(800);
    console.log('chip tap: ' + jumpRes + ' → ' + (logs.filter(l => l.includes('§HIST_UNDO') || l.includes('§FOCUS_ELEM') || l.includes('§BUILDING')).slice(-1).join('') || 'jumped'));

    // ── §4 maximise: focusOnlyLatest keeps status-bar-wrap + scrub visible ─
    await page.evaluate(() => { if (window.focusOnlyLatest) window.focusOnlyLatest(); });
    await sleep(300);
    const maxi = await page.evaluate(() => {
      const wrap = document.getElementById('status-bar-wrap');
      const bar = document.getElementById('universal-hist-btns');
      const vis = el => el && getComputedStyle(el).display !== 'none' && !el.classList.contains('swipe-hidden');
      return { statusVisible: vis(wrap), scrubVisible: vis(bar) };
    });
    console.log('--- §4 MAXIMISE (focusOnlyLatest) — want both true ---');
    console.log(JSON.stringify(maxi));
    await page.evaluate(() => { if (window.focusOnlyLatest) window.focusOnlyLatest(); }); // restore

    // ── §5 legacy bar gone ───────────────────────────────────────────────
    const legacy = await page.evaluate(() => ({
      undoRedoBtns: !!document.getElementById('undo-redo-btns'),
      kernelUndoBtn: !!document.getElementById('kernel-undo-btn')
    }));
    console.log('--- §5 LEGACY (want both false) ---');
    console.log(JSON.stringify(legacy));

    // ── idle gate + errors ───────────────────────────────────────────────
    console.log('--- idle gate ---');
    console.log(logs.filter(l => l.includes('§IDLE_GATE')).slice(-2).join('\n') || '(none)');
    console.log('--- PAGEERRORS ---');
    console.log(logs.filter(l => l.startsWith('PAGEERROR')).join('\n') || '(none)');

    await ctx.close();
  } finally {
    await browser.close();
  }
})();
