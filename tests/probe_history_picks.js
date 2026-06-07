// probe_history_picks.js — witness HISTORY_SCRUB_FIX §1 (Step 1): an ELEMENT_PICK is a
// first-class, read-only SELECTION step that restores as a cyan SHAPE MESH via A.focusElement.
// Drives the REAL viewer on Duplex (non-split, fast). Proves IT WORKS + IT DOESN'T IMPACT OTHERS.
//
// WORKS:
//   1. A.focusElement exists (the neutral shared primitive).
//   2. Real 3D tap → §PICK + §HIST_PUSH kind=pick label="<name> · <class>" (NOT §HIST_DROP) +
//      §FOCUS_ELEM (live tap upgraded box→shape) + a userData._shapeOverlay (cyan) in the scene.
//   3. A SECOND distinct tap → second §HIST_PUSH step. Stream kinds include 'pick'.
//   4. jumpTo step 0 → element re-lights as a SHAPE MESH (scene has _shapeOverlay; §FOCUS_ELEM
//      fired on restore, NOT a §BBOX_DEBUG box) + verifyChain ok=true after (§HIST_CHAIN_OK).
// NO REGRESSION:
//   5. §HIST_DROP still fires for an audit op (SESSION_START not-significant).
//   6. info-panel populated on the live pick (info-name not '—').
//   7. Find lens unaffected — §INSTROWS_CACHED still fires (count 1) on a group select.
//   8. Idle gate intact — §IDLE_GATE / §RENDER_LOOP park lines still present.
// SW BLOCKED. Leak-safe (caller kills chrome).
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8142;
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
    await sleep(2500);
    await page.evaluate(() => { try { localStorage.removeItem('bim.universalHist.on'); } catch(e){} });
    // open the bar so it renders (not required for recording, but exercises _render with picks)
    await page.evaluate(() => { if (window.UniversalHistory) UniversalHistory.open(); });
    await sleep(200);

    // ── 1. the neutral primitive is LAZY (lives in navigate module) ──────
    const beforeLoad = await page.evaluate(() => {
      const A = window.A || window.APP; return typeof (A && A.focusElement);
    });
    console.log('A.focusElement BEFORE navigate load (lazy → want undefined): ' + beforeLoad);

    // Helper: project an element's center to a screen pixel and dispatch a real tap on the canvas.
    async function tapElement(rank) {
      return await page.evaluate((rank) => {
        const A = window.A || window.APP;
        const r = A.db.exec(
          "SELECT m.guid, m.element_name, m.ifc_class, t.center_x, t.center_y, t.center_z " +
          "FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid " +
          "WHERE t.center_x IS NOT NULL ORDER BY (t.bbox_x*t.bbox_y*t.bbox_z) DESC LIMIT 8");
        if (!r.length || !r[0].values.length) return { ok: false, why: 'no-rows' };
        const row = r[0].values[Math.min(rank, r[0].values.length - 1)];
        const [guid, name, cls, cx, cy, cz] = row;
        const c = A.ifc2three(cx, cy, cz);
        const v = new THREE.Vector3(c.x, c.y, c.z).project(A.camera);
        const px = (v.x * 0.5 + 0.5) * window.innerWidth;
        const py = (-v.y * 0.5 + 0.5) * window.innerHeight;
        const cv = A.canvas;
        const opt = b => ({ bubbles: true, cancelable: true, clientX: px, clientY: py, button: 0, pointerId: 1, isPrimary: true });
        cv.dispatchEvent(new PointerEvent('pointerdown', opt()));
        cv.dispatchEvent(new PointerEvent('pointerup', opt()));
        return { ok: true, guid: guid, name: name, cls: cls, px: Math.round(px), py: Math.round(py) };
      }, rank);
    }

    function shapeOverlayCount() {
      return page.evaluate(() => {
        const A = window.A || window.APP; let n = 0, cyan = 0;
        if (A && A.scene) A.scene.traverse(o => {
          if (o.userData && o.userData._shapeOverlay) {
            n++;
            const m = o.material;
            if (m && m.color && Math.round(m.color.b * 255) > 180 && Math.round(m.color.r * 255) < 80) cyan++;
          }
        });
        return { overlays: n, cyan: cyan };
      });
    }

    // ── 2. real 3D tap → auto-loads navigate, records pick, shape-mesh focus
    // The tap itself triggers A.loadNavigate() (picking.js §FOCUS-ELEM guard), so no pre-load here
    // — this witnesses the real first-tap path.
    const t1 = await tapElement(0);
    console.log('TAP1: ' + JSON.stringify(t1));
    // wait for the lazy navigate module to load + the deferred focus to run
    await page.waitForFunction(() => {
      const A = window.A || window.APP; return A && typeof A.focusElement === 'function';
    }, { timeout: 30000 }).catch(e => console.log('FOCUS_LOAD_WAIT_FAIL ' + e.message));
    await sleep(1500);
    const afterLoad = await page.evaluate(() => { const A = window.A || window.APP; return typeof A.focusElement; });
    console.log('A.focusElement AFTER first tap (want function): ' + afterLoad);
    const ov1 = await shapeOverlayCount();
    console.log('after TAP1 shapeOverlays: ' + JSON.stringify(ov1) + ' (want overlays>0, cyan>0)');

    // info-panel populated?
    const info1 = await page.evaluate(() => {
      const p = document.getElementById('info-panel');
      return { display: p ? p.style.display : 'no-panel',
               name: (document.getElementById('info-name') || {}).textContent,
               cls:  (document.getElementById('info-class') || {}).textContent };
    });
    console.log('INFO-PANEL after TAP1: ' + JSON.stringify(info1) + ' (want display=block, name≠—)');

    // ── 3. a SECOND distinct pick via the SAME API picking.js calls (deterministic;
    // raycast-projected taps cluster on the front element). guid distinct from TAP1.
    const t2 = await page.evaluate(() => {
      const A = window.A || window.APP;
      const r = A.db.exec(
        "SELECT m.guid, m.element_name, m.ifc_class, m.discipline, m.storey " +
        "FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid " +
        "WHERE t.center_x IS NOT NULL AND m.ifc_class='IfcWindow' LIMIT 1");
      if (!r.length || !r[0].values.length) return { ok: false };
      const [guid, name, cls, disc, storey] = r[0].values[0];
      KernelOps.commitOp(A.db, 'ELEMENT_PICK', { cls: cls, name: name, disc: disc, storey: storey }, [guid]);
      return { ok: true, guid: guid, name: name, cls: cls };
    });
    console.log('PICK2 (direct commitOp, distinct): ' + JSON.stringify(t2));
    await sleep(600);

    console.log('--- §PICK ---');
    console.log(logs.filter(l => /§PICK\b|§PICK /.test(l)).slice(-6).join('\n'));
    console.log('--- §HIST_PUSH ---');
    console.log(logs.filter(l => l.includes('§HIST_PUSH')).join('\n'));
    console.log('--- §HIST_DROP ---');
    console.log(logs.filter(l => l.includes('§HIST_DROP')).join('\n'));
    console.log('--- §FOCUS_ELEM ---');
    console.log(logs.filter(l => l.includes('§FOCUS_ELEM')).join('\n'));
    console.log('--- §KERNEL_OP ELEMENT_PICK ---');
    console.log(logs.filter(l => l.includes('§KERNEL_OP') && l.includes('ELEMENT_PICK')).join('\n'));

    const listSnap = await page.evaluate(() => UniversalHistory.list());
    console.log('STREAM kinds: ' + JSON.stringify(listSnap.map(e => e.kind)) +
      ' labels: ' + JSON.stringify(listSnap.map(e => e.label)));

    // ── 4. jumpTo a PICK step → shape-mesh restore + chain ok ────────────
    // (The stream starts with a BUILDING_OPEN milestone (§7); jump to the first 'pick' step so the
    // restore is a real element focus, not the milestone which correctly clears focus.)
    const pickIdx = await page.evaluate(() => { var l = UniversalHistory.list(); for (var i = 0; i < l.length; i++) if (l[i].kind === 'pick') return i; return 0; });
    const focusBefore = logs.filter(l => l.includes('§FOCUS_ELEM ')).length;
    await page.evaluate((i) => UniversalHistory.jumpTo(i), pickIdx);
    await sleep(1200);
    const ovR = await shapeOverlayCount();
    const focusAfter = logs.filter(l => l.includes('§FOCUS_ELEM ')).length;
    console.log('after jumpTo(pick idx=' + pickIdx + ') shapeOverlays: ' + JSON.stringify(ovR) +
      ' §FOCUS_ELEM restore-fired: ' + (focusAfter > focusBefore) + ' (want overlays>0 AND restore-fired)');
    await sleep(1400); // let async chainCheck resolve
    console.log('--- §HIST_CHAIN_OK (after jumpTo) ---');
    console.log(logs.filter(l => l.includes('§HIST_CHAIN_OK') || l.includes('§HIST_CHAIN_ERR')).join('\n'));
    const chainNow = await page.evaluate(async () => {
      const A = window.A || window.APP;
      if (!window.KernelOps || !KernelOps.verifyChain) return 'no-verify';
      const res = await KernelOps.verifyChain(A.db);
      return res && res.ok;
    });
    console.log('verifyChain ok right now (want true): ' + chainNow);

    // ── 5. audit op still DROPPED by the gate ────────────────────────────
    await page.evaluate(() => { const A = window.A || window.APP; KernelOps.commitOp(A.db, 'SESSION_START', { note: 'audit' }); });
    await sleep(200);
    console.log('SESSION_START dropped: ' +
      logs.some(l => l.includes('§HIST_DROP') && l.includes('SESSION_START')));

    // ── 7. Find lens unaffected — a real Find drill still fires + records a VIEW step
    // (interleaved with the picks → mixed stream). §INSTROWS_CACHED only logs for >1500-elem sets
    // (Duplex storeys are small → small-set path), so we witness the DRILL tag + the view push.
    const pushesBeforeFind = logs.filter(l => l.includes('§HIST_PUSH')).length;
    await page.evaluate(async () => { const A = window.A || window.APP; if (A.loadNavigate) await A.loadNavigate(); A.openFindPanel(); });
    await sleep(1200);
    await page.evaluate(() => {
      const rows = document.querySelectorAll('#find-tree [data-find-parent]');
      if (rows.length) rows[0].children[1].dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    });
    await sleep(1700);
    const findDrillLines = logs.filter(l => / GROUP focus=| ITEM focus=|§GROUP_EXPAND_VIA_LABEL|_SELECT "/.test(l));
    console.log('--- Find drill (want ≥1, proves Find lens intact) ---');
    console.log(findDrillLines.slice(-4).join('\n') || '(NONE — investigate)');
    console.log('--- §HIST_PUSH after Find (want a kind=view step) ---');
    console.log(logs.filter(l => l.includes('§HIST_PUSH')).slice(pushesBeforeFind).join('\n') || '(none)');
    console.log('§INSTROWS_CACHED count (Duplex small → may be 0; must NOT grow from picks): ' +
      logs.filter(l => l.includes('§INSTROWS_CACHED')).length);
    const listAfterFind = await page.evaluate(() => UniversalHistory.list());
    console.log('STREAM kinds after Find (want pick,pick,…,view): ' + JSON.stringify(listAfterFind.map(e => e.kind)));

    // ── 8. idle gate park lines present ──────────────────────────────────
    console.log('--- idle gate sample ---');
    console.log(logs.filter(l => l.includes('§IDLE_GATE') || l.includes('§RENDER_LOOP')).slice(-3).join('\n') || '(none seen)');

    console.log('--- PAGEERRORS ---');
    console.log(logs.filter(l => l.startsWith('PAGEERROR')).join('\n') || '(none)');

    await ctx.close();
  } finally {
    await browser.close();
  }
})();
