// probe_depth.js — witness the §DEPTH model: GROUP select = 1.0 solid overlays + fit-zoom;
// ITEM select = cyan item + group overlays at 0.5. Drives the REAL find-panel DOM (storey axis:
// top-level row tap = GROUP, type-leaf child tap = ITEM). SW BLOCKED. Reads the actual loaded db
// + traverses the scene for userData._shapeOverlay material opacities. Leak-safe (caller kills).
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8137;
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

    // wait for db + meta + streamed geometry (meshCache) so _buildShapeMeshes has shapes to clone
    await page.waitForFunction(() => {
      const A = window.A || window.APP;
      return A && A.db && A.activeBuilding && A.meshCache && Object.keys(A.meshCache).length > 0;
    }, { timeout: 180000 }).catch(e => console.log('WAIT_FAIL ' + e.message));
    await sleep(2000);

    const ident = await page.evaluate(() => {
      const A = window.A || window.APP;
      return { bld: A.activeBuilding, meshes: A.meshCache ? Object.keys(A.meshCache).length : 0 };
    });
    console.log('IDENT: ' + JSON.stringify(ident));

    // open Find + build the storey tree
    await page.evaluate(async () => { const A = window.A || window.APP; if (A.loadNavigate) await A.loadNavigate(); A.openFindPanel(); });
    await sleep(1200);

    // helper injected into the page: dispatch pointerup, read overlay opacities + camera
    await page.evaluate(() => {
      window.__tap = (el, mods) => { el.dispatchEvent(new PointerEvent('pointerup', Object.assign({ bubbles: true, cancelable: true }, mods || {}))); };
      window.__overlays = () => {
        const A = window.A || window.APP; const out = [];
        A.scene.traverse(o => { if (o.userData && o.userData._shapeOverlay && o.material) {
          const m = o.material; out.push({ type: m.type, opacity: +m.opacity.toFixed(3), transparent: !!m.transparent,
            color: m.color ? '#' + m.color.getHexString() : null, count: o.count || 1 }); } });
        return out;
      };
      window.__cam = () => { const A = window.A || window.APP; const p = A.camera.position; return { x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1) }; };
    });

    const cam0 = await page.evaluate(() => window.__cam());

    // ---- GROUP select: tap the first top-level storey row (text span) ----
    const grpInfo = await page.evaluate(() => {
      const rows = document.querySelectorAll('#find-tree [data-find-parent]');
      if (!rows.length) return { err: 'no parent rows' };
      const row = rows[0]; const text = row.children[1]; // [arrow, text, badge]
      window.__tap(text);
      return { row: row.getAttribute('data-find-parent'), rows: rows.length };
    });
    console.log('GROUP_TAP: ' + JSON.stringify(grpInfo));
    await sleep(1600);
    const grpOverlays = await page.evaluate(() => window.__overlays());
    const camG = await page.evaluate(() => window.__cam());
    console.log('GROUP_OVERLAYS: ' + JSON.stringify(grpOverlays.slice(0, 6)) + ' n=' + grpOverlays.length);
    console.log('CAM group moved: ' + (JSON.stringify(cam0) !== JSON.stringify(camG)) + ' ' + JSON.stringify(camG));

    // ---- ITEM select: expand first storey (arrow), then tap first type-leaf child ----
    const itemInfo = await page.evaluate(() => {
      const rows = document.querySelectorAll('#find-tree [data-find-parent]');
      const arrow = rows[0].children[0];
      window.__tap(arrow); // expand → lazy children
      return { expanded: rows[0].getAttribute('data-find-parent') };
    });
    await sleep(1200);
    const itemTap = await page.evaluate(() => {
      // children rows are appended after the parent row, not [data-find-parent]; pick first non-parent leaf
      const all = document.querySelectorAll('#find-tree > * , #find-tree div');
      const leaves = [];
      document.querySelectorAll('#find-tree div').forEach(d => {
        if (!d.hasAttribute || d.hasAttribute('data-find-parent')) return;
        if (d.children && d.children.length === 3 && d.children[1] && d.children[1].textContent) leaves.push(d);
      });
      if (!leaves.length) return { err: 'no leaf rows', total: document.querySelectorAll('#find-tree div').length };
      const text = leaves[0].children[1];
      const label = text.textContent;
      window.__tap(text);
      return { label: label };
    });
    console.log('ITEM_TAP: ' + JSON.stringify(itemTap));
    await sleep(1800);
    const itemOverlays = await page.evaluate(() => window.__overlays());
    const camI = await page.evaluate(() => window.__cam());
    console.log('ITEM_OVERLAYS: ' + JSON.stringify(itemOverlays.slice(0, 8)) + ' n=' + itemOverlays.length);
    console.log('CAM item moved: ' + (JSON.stringify(camG) !== JSON.stringify(camI)) + ' ' + JSON.stringify(camI));

    // ---- ROOM select: cycle axis to 'room' (if available), expand a group, tap a room child ----
    const roomAxis = await page.evaluate(async () => {
      for (let i = 0; i < 6; i++) {
        const btn = document.getElementById('find-axis-toggle'); // re-query: _renderAxes rebuilds it
        if (!btn) return { err: 'no axis toggle' };
        if (btn.getAttribute('data-axis') === 'room') break;
        window.__tap(btn); await new Promise(r => setTimeout(r, 300));
      }
      return { axis: document.getElementById('find-axis-toggle') && document.getElementById('find-axis-toggle').getAttribute('data-axis') };
    });
    console.log('ROOM_AXIS: ' + JSON.stringify(roomAxis));
    await sleep(600);
    if (roomAxis.axis === 'room') {
      await page.evaluate(() => { const r = document.querySelectorAll('#find-tree [data-find-parent]'); if (r[0]) window.__tap(r[0].children[0]); });
      await sleep(900);
      const roomTap = await page.evaluate(() => {
        const leaves = [];
        document.querySelectorAll('#find-tree div').forEach(d => {
          if (!d.hasAttribute || d.hasAttribute('data-find-parent')) return;
          // a real tree leaf = [arrow, text, badge]; badge textContent starts with '(' — excludes
          // the [Storey|Type] sub-toggle row (whose 3rd child is a "Type" button, not "(n)").
          if (d.children && d.children.length === 3 && d.children[1] && d.children[1].textContent &&
              d.children[2] && /^\(/.test(d.children[2].textContent)) leaves.push(d);
        });
        if (!leaves.length) return { err: 'no room leaf' };
        const label = leaves[0].children[1].textContent; window.__tap(leaves[0].children[1]); return { label };
      });
      console.log('ROOM_TAP: ' + JSON.stringify(roomTap));
      await sleep(1800);
      console.log('CAM room: ' + JSON.stringify(await page.evaluate(() => window.__cam())));
    }

    console.log('--- §DEPTH log lines ---');
    console.log(logs.filter(l => /§STOREY_SELECT|§TYPE_SELECT|§ROOM_SELECT|_ZOOM|§GROUP_ZOOM|§XRAY_DIM|§AXIS_GROUP|PAGEERROR|§SHAPE_ERR/.test(l)).join('\n'));

    await ctx.close();
  } finally {
    await browser.close();
  }
})();
