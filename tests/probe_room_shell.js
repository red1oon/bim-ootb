// probe_room_shell.js — §VERIFY §RP-SHELL (option 3): Room axis draws a shine-through shell at
// every IfcSpace volume; tapping a room brightens its shell, dims contents inside, building→0.2.
// Proves/disproves: (1) overview shells == room count, (2) one shell brightened on select,
// (3) contents rendered as dim shape overlays (not bright cyan), (4) rest ghosted.
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8124;
const BLD = process.env.BLD || 'Terminal';
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db&bld=${BLD}`;

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  page.setDefaultTimeout(0);
  await page.waitForFunction(() => {
    const A = window.A || window.APP;
    return A && A.scene && A.streamQueue && A.streamedCount >= A.streamQueue.length && A.streamQueue.length > 0;
  }, { timeout: 150000 }).catch(e => console.log('WAIT_FAIL ' + e.message));
  // geometry decode readiness — contents shapes need A.meshCache populated
  await page.waitForFunction(() => {
    const A = window.A || window.APP;
    return A && A.meshCache && Object.keys(A.meshCache).length > 50;
  }, { timeout: 90000 }).catch(e => console.log('MESHCACHE_WAIT_FAIL ' + e.message));
  const mc = await page.evaluate(() => { const A = window.A || window.APP; return A.meshCache ? Object.keys(A.meshCache).length : -1; });
  console.log('MESHCACHE_KEYS: ' + mc);
  await page.waitForTimeout(1500);

  // DB ground truth
  const dbRooms = await page.evaluate(() => {
    const A = window.A || window.APP;
    const r = A.dbQuery("SELECT COUNT(*) FROM spatial_structure WHERE type='IfcSpace' AND center_x IS NOT NULL AND size_x IS NOT NULL");
    return r.length ? r[0][0] : -1;
  });
  console.log('DB_ROOM_VOLUMES: ' + dbRooms);

  await page.evaluate(async () => { const A = window.A || window.APP; if (A.loadNavigate) await A.loadNavigate(); A.openFindPanel(); });
  await page.waitForFunction(() => document.getElementById('find-axis-toggle'), { timeout: 8000 }).catch(e => console.log('NO_TOGGLE ' + e.message));

  // Cycle the single axis toggle until it reads "room"
  let axis = '';
  for (let i = 0; i < 6; i++) {
    axis = await page.evaluate(() => { const b = document.getElementById('find-axis-toggle'); return b ? b.getAttribute('data-axis') : 'none'; });
    if (axis === 'room') break;
    await page.evaluate(() => { const b = document.getElementById('find-axis-toggle'); b && b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
    await page.waitForTimeout(500);
  }
  console.log('AXIS_NOW: ' + axis);
  await page.waitForTimeout(900);

  // (1) overview shells
  const overview = await page.evaluate(() => {
    const A = window.A || window.APP; let n = 0, op = [];
    A.scene.traverse(o => { if (o.userData && o.userData._roomShell) { n++; if (op.length < 3) op.push(+o.material.opacity.toFixed(3)); } });
    return { shells: n, opSample: op, xrayOn: !!A.xrayOn };
  });
  console.log('OVERVIEW_SHELLS: ' + JSON.stringify(overview));
  await page.screenshot({ path: '/tmp/room_overview_' + BLD + '.png', timeout: 8000, animations: 'disabled' }).catch(e => console.log('SHOT_SKIP overview ' + e.message.split('\n')[0]));

  // Expand first storey group, tap first room leaf
  const tap = await page.evaluate(() => {
    const tree = document.getElementById('find-tree');
    const groups = tree.querySelectorAll('[data-find-parent]');
    if (!groups.length) return { err: 'no groups' };
    const g = groups[0];
    const gtext = g.querySelector('span:nth-child(2)');
    gtext && gtext.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    const cc = g.nextElementSibling;
    if (!cc) return { err: 'no childContainer', group: g.getAttribute('data-find-parent') };
    cc.style.display = 'block';
    const leaf = cc.querySelector('div');
    if (!leaf) return { err: 'no leaf', group: g.getAttribute('data-find-parent') };
    const ltext = leaf.querySelector('span:nth-child(2)');
    const label = ltext ? ltext.textContent : '?';
    ltext && ltext.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    return { group: g.getAttribute('data-find-parent'), leaf: label };
  });
  console.log('ROOM_TAP: ' + JSON.stringify(tap));
  await page.waitForTimeout(1800);
  // ground truth: contents count for the tapped room
  const contents = await page.evaluate(() => {
    const A = window.A || window.APP;
    const r = A.dbQuery("SELECT s.guid, COUNT(rc.element_guid) FROM spatial_structure s LEFT JOIN rel_contained_in_space rc ON rc.space_guid=s.guid WHERE s.type='IfcSpace' AND s.center_x IS NOT NULL GROUP BY s.guid HAVING COUNT(rc.element_guid)>0 ORDER BY 2 DESC LIMIT 1");
    return r.length ? { guid: r[0][0], contents: r[0][1] } : { err: 'none' };
  });
  console.log('TOP_ROOM_CONTENTS: ' + JSON.stringify(contents));

  // (2)(3)(4) selected state
  const sel = await page.evaluate(() => {
    const A = window.A || window.APP;
    let shells = 0, lit = 0, litOp = 0, dim = [], shapeOverlays = 0;
    A.scene.traverse(o => {
      if (o.userData && o.userData._roomShell) { shells++; const op = +o.material.opacity.toFixed(3); if (op >= 0.18) { lit++; litOp = op; } else dim.push(op); }
      if (o.userData && o.userData._shapeOverlay) shapeOverlays++;
    });
    return { shells, litShells: lit, litOpacity: litOp, dimShellSample: dim.slice(0, 2), shapeOverlays, xrayOn: !!A.xrayOn };
  });
  console.log('SELECT_PROBE: ' + JSON.stringify(sel));
  await page.screenshot({ path: '/tmp/room_select_' + BLD + '.png', timeout: 8000, animations: 'disabled' }).catch(e => console.log('SHOT_SKIP select ' + e.message.split('\n')[0]));

  // VERDICT
  const v = [];
  v.push('shells==rooms: ' + (overview.shells === dbRooms ? 'PASS(' + overview.shells + ')' : 'CHECK ' + overview.shells + '/' + dbRooms));
  v.push('one-shell-lit: ' + (sel.litShells === 1 ? 'PASS' : 'CHECK ' + sel.litShells));
  v.push('contents-dim-overlays: ' + (sel.shapeOverlays > 0 ? 'PASS(' + sel.shapeOverlays + ')' : 'CHECK 0'));
  v.push('xray-ghost: ' + (sel.xrayOn ? 'PASS' : 'CHECK'));
  console.log('VERDICT_SHELL: ' + v.join(' | '));

  console.log('--- §RP-SHELL / §DEPTH lines ---');
  console.log(logs.filter(l => /§ROOM_LENS|§ROOM_SHELL_LIT|§ROOM_SELECT|§XRAY_DIM|§GROUP_EXPAND|§ROOM_VOL_ERR|§ROOM_SELECT_ERR|§SHAPE_MISS|§INSTROWS|PAGEERROR/.test(l)).slice(-16).join('\n'));
  await browser.close();
})();
