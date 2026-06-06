// §VERIFY — DRIVE the real drill: click storey→type→item, drag grip. Watch effects FIRE (not just exist).
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8124, BLD = process.env.BLD || 'Hospital';
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=buildings/${BLD}_extracted.db&ghost=1`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader'] });
  try {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', m => { const t = m.text(); if (t.indexOf('§') >= 0) logs.push(t); });
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    page.setDefaultTimeout(0);
    await page.waitForFunction(() => { const A = window.APP||window.A; return A && A.meshCache && Object.keys(A.meshCache).length > 50; }, { timeout: 120000 }).catch(e=>console.log('MESH_WAIT '+e.message));
    await page.evaluate(async () => { const A = window.APP||window.A; if (A.loadNavigate) await A.loadNavigate(); A.openFindPanel(''); });
    await sleep(2500);

    // ── GRIP test: it must be VISIBLE on its own (not force-shown), then drag grows the tree ──
    const gripVis = await page.evaluate(() => { const g = document.getElementById('find-tree-grip'); return g ? getComputedStyle(g).display : 'missing'; });
    console.log('§T_GRIP_VISIBLE display=' + gripVis + ' (must NOT be none/missing)');
    const grip = await page.evaluate(() => {
      const t = document.getElementById('find-tree'), g = document.getElementById('find-tree-grip');
      if (!t || !g) return { ok:false, why:'missing tree/grip', tree:!!t, grip:!!g };
      const h0 = t.getBoundingClientRect().height;
      const r = g.getBoundingClientRect(), x = r.left + r.width/2, y0 = r.top + r.height/2;
      function pe(type, y){ return new PointerEvent(type, { bubbles:true, cancelable:true, clientX:x, clientY:y, pointerId:1, pointerType:'touch' }); }
      g.dispatchEvent(pe('pointerdown', y0));
      g.dispatchEvent(pe('pointermove', y0 + 120));
      g.dispatchEvent(pe('pointerup',   y0 + 120));
      const h1 = t.getBoundingClientRect().height;
      return { ok: h1 > h0 + 50, h0: Math.round(h0), h1: Math.round(h1) };
    });
    console.log('§T_GRIP resizes=' + grip.ok + ' h0=' + grip.h0 + ' h1=' + grip.h1 + (grip.why ? ' why=' + grip.why : ''));

    // ── DRILL: tap a real parent row (storey). _doTap is on the text span's pointerup, not row.click(). ──
    async function tapParent(idx, label) {
      const r = await page.evaluate((args) => {
        const rows = Array.from(document.querySelectorAll('#find-tree [data-find-parent]'));
        const el = rows[args.idx]; if (!el) return { ok:false, n: rows.length };
        el.scrollIntoView();
        const text = el.querySelector('span:nth-child(2)') || el;
        text.dispatchEvent(new PointerEvent('pointerup', { bubbles:true, cancelable:true, pointerId:1, pointerType:'touch' }));
        return { ok:true, n: rows.length, txt: (el.textContent||'').slice(0,30) };
      }, { idx });
      await sleep(1600);
      console.log('§T_TAP ' + label + ' ok=' + r.ok + ' parent_rows=' + r.n + (r.txt ? ' "' + r.txt.trim() + '"' : ''));
      return r;
    }
    await tapParent(1, 'storey');
    // focus-bg = the selected parent row's data-active style (yellow)
    let act = await page.evaluate(() => {
      const a = document.querySelector('#find-tree [data-find-parent][data-active]');
      if (!a) return { has:false };
      const cs = getComputedStyle(a); return { has:true, border: cs.borderLeftColor, bg: cs.backgroundImage.slice(0,46) };
    });
    console.log('§T_FOCUSBG_TREE active_row=' + act.has + (act.has ? ' borderL=' + act.border : ''));

    // ── deeper: expand a storey, tap a deeper (non-parent) row, verify it gets the SAME yellow band ──
    await page.evaluate(() => {
      const sRow = document.querySelector('#find-tree [data-find-parent]');
      const arrow = sRow && sRow.querySelector('span:first-child');
      if (arrow) arrow.dispatchEvent(new PointerEvent('pointerup', { bubbles:true, pointerId:1, pointerType:'touch' }));
    });
    await sleep(1700);
    const leaf = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('#find-tree div'))
        .filter(d => d.querySelector && d.querySelector('span:nth-child(2)') && !d.hasAttribute('data-find-parent') && d.offsetParent !== null);
      const el = all[0]; if (!el) return { ok:false, n: all.length };
      el.querySelector('span:nth-child(2)').dispatchEvent(new PointerEvent('pointerup', { bubbles:true, pointerId:1, pointerType:'touch' }));
      return { ok:true, n: all.length, txt:(el.textContent||'').slice(0,24) };
    });
    await sleep(900);
    const leafFocus = await page.evaluate(() => {
      const a = document.querySelector('#find-tree [data-leaf-active]');
      if (!a) return { has:false };
      return { has:true, bg: getComputedStyle(a).backgroundColor };
    });
    console.log('§T_LEAF_FOCUS deeper_tapped=' + leaf.ok + ' "' + (leaf.txt||'').trim() + '" leaf_band=' + leafFocus.has + (leafFocus.has ? ' bg=' + leafFocus.bg : ''));

    // ── yellow outline fired? ──
    const outline = await page.evaluate(() => {
      const A = window.APP||window.A;
      const op = A._outlinePass;
      if (!op) return { has:false, why:'no outlinePass' };
      const sel = (op.selectedObjects||[]).length;
      const c = op.visibleEdgeColor ? '#' + op.visibleEdgeColor.getHexString() : '?';
      return { has: sel>0, n: sel, color: c };
    });
    console.log('§T_OUTLINE fired=' + outline.has + ' n=' + (outline.n||0) + ' color=' + (outline.color||outline.why));

    // relevant drill logs
    logs.filter(l => /§(STOREY|TYPE|ITEM)_SELECT|FIND_GRIP|NAV_FIND_VERSION/.test(l)).slice(-6).forEach(l => console.log('  · ' + l.replace(/\[RP-TB\]\s*/,'')));
    console.log('§T_DONE');
  } finally { await browser.close(); }
})();
