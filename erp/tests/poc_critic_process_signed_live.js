// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for GRAND_LANE S1 / ERP_CRITIC_UX_LANE.md J5 PROCESS — "make Complete REAL".
//   W-CRITIC-PROCESS-LIVE. The critic drives the SERVED bundle and proves the re-pointed DocAction surfaces
//   (form Process ▶ pill + grid gear-batch) now EXECUTE + SIGN on the SHARED signed lane (crud_overlay
//   __crud.process → commitProcess → completeFanout → signed commitGroup → persist), NOT the old in-memory
//   PREVIEW. The ring NEVER opens.
//   PROVES (and HONESTLY records any gap — a dead-end is logged, never papered):
//     ACT 1 — ODOO (client 12) FORM PILL: open a processable (DR/IP) order → Process ▶ → Complete →
//        (a) a SIGNED op is committed (§CRUD process committed … verifyChain=ok) and the op-log readTip
//            for the order = 'CO' (the kernel sidecar, not the immutable bundle, carries the new status);
//        (b) the rendered DocStatus shows Completed (the readTip overlay / optimistic advance);
//        (c) RELOAD the page → the order STILL reads CO (the signed op persisted to IndexedDB + the
//            _overlayDocTip read-the-tip overlay re-applies) — a Complete that survives reload, the critic's bar.
//        FAN-OUT on these orders is correctly GATED (Odoo orders carry a NULL C_DocType_ID → iDempiere would
//        not auto-generate a shipment/invoice either) and the gate is LOGGED honestly (§SO-COMPLETE fan-out gated).
//     ACT 2 — ODOO GRID GEAR-BATCH: select ≥2 processable orders → batch Complete → a SIGNED op per row
//        (§CRUD-HOSTPROCESS ×N + committed ×N) and each row's readTip = 'CO' (the "dispatch over N rows" seam,
//        same signed verb — never forked).
//     ACT 3 — GARDENWORLD FAN-OUT (the consequence set is REAL through the re-pointed surface): reactivate then
//        Complete a POS-doctype order (135, auto-generate Y/Y) → the signed group carries the engine's fan-out:
//        §SO-COMPLETE … sealed=Y gid=<g> and the op-log holds CREATE_DOCUMENT M_InOut + C_Invoice under that gid
//        (drillable from the op-log). This is the SAME completeFanout lane the ring proved (W-SO-COMPLETE-UI),
//        now reached from iDempiere's OWN DocAction surface.
//     0 pageerrors.
//   §-log first — READ tests/poc_critic_process_signed_live.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_critic_process_signed_live.js   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/idempiere.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});

// PillBuilder binds on 'pointerup' — a programmatic tap dispatches the pointer sequence.
async function tapPill(page, pid) {
  return page.evaluate((p) => { const b = document.getElementById('pill-' + p); if (!b) return false;
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); return true; }, pid);
}
async function gotoTenant(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-ad-table]', { timeout: 20000 }).catch(async () => {
    const u = await page.$('#idmp-login-users .idmp-login-user:not(.disabled)');
    if (u) { await u.click(); const ok = await page.$('#idmp-login-ok'); if (ok) await ok.click(); }
    await page.waitForSelector('[data-ad-table]', { timeout: 15000 }).catch(() => {});
  });
  await page.waitForTimeout(1200);
}
// the signed op-log tip for an order id (lower-case table, the verb the host write uses). Force the lazy kernel
// sidecar to hydrate from IndexedDB FIRST (it is null on a fresh load) so the probe reflects the persisted truth.
const tipOf = (page, id) => page.evaluate((i) => new Promise((res) => {
  const c = window.__crud;
  if (!c || !c.readTip) return res('no-crud');
  if (typeof c.withSidecar === 'function') c.withSidecar(() => res(c.readTip('c_order', i)));
  else res(c.readTip('c_order', i));
}), id);
// open the target order's form by clicking its grid row, then Process ▶ → click a named action
async function processVia(page, id, actionRe) {
  await page.evaluate((i) => {
    const rows = Array.from(document.querySelectorAll('.idmp-grid tbody tr[data-ad-record]'));
    const tr = rows.find(r => Number(r.getAttribute('data-ad-record')) === i) || rows[0];
    if (tr) tr.click();
  }, id);
  await page.waitForSelector('#pill-formproc', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  await tapPill(page, 'formproc');
  await page.waitForTimeout(400);
  const did = await page.evaluate((re) => {
    const ov = document.getElementById('idmp-proc-ov'); if (!ov) return { present: false };
    const btns = Array.from(ov.querySelectorAll('button'));
    const b = btns.find(x => new RegExp(re, 'i').test(x.textContent));
    if (b) { b.click(); return { present: true, clicked: b.textContent.trim(), set: btns.map(x => x.textContent.trim()) }; }
    return { present: true, clicked: null, set: btns.map(x => x.textContent.trim()) };
  }, actionRe.source);
  await page.waitForTimeout(1500);   // let the async signed commit + _sidePersist land
  return did;
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));

  let pass = 0, fail = 0;
  const ok = (label, cond, extra) => { console.log('   ' + (cond ? '🟢' : '🔴') + ' ' + label + (extra ? ' — ' + extra : '')); cond ? pass++ : fail++; };
  const note = (label, extra) => console.log('   🟡 ' + label + (extra ? ' — ' + extra : ''));
  const lastLog = (re) => [...logs].reverse().find(l => re.test(l)) || '';

  // ════════════════════════════ ACT 1 — ODOO FORM PILL: signed + persist + reload-survival ════════════════════════════
  const odooUrl = `http://localhost:${port}/idempiere.html?seed=ad_seed.db&shard=12-odoo.db&login=Odoo&window=143`;
  await gotoTenant(page, odooUrl);

  const target = await page.evaluate(() => {
    const r = window.__idmpDb.exec("SELECT C_Order_ID, DocumentNo, DocStatus FROM C_Order WHERE AD_Client_ID=12 AND DocStatus IN ('DR','IP') ORDER BY C_Order_ID LIMIT 1");
    if (!r.length) return null; const v = r[0].values[0]; return { id: v[0], doc: v[1], ds: v[2] };
  });
  console.log('§CRITIC-PROCESS ACT1 target order=' + (target ? `${target.doc}(${target.id}) ds=${target.ds}` : 'NONE'));
  ok('a processable (DR/IP) Odoo order exists to drive Complete', !!target, target ? JSON.stringify(target) : 'none');

  const tipBefore = target ? await tipOf(page, target.id) : null;
  const did1 = target ? await processVia(page, target.id, /complete/i) : { present: false };
  const tipAfter = target ? await tipOf(page, target.id) : null;
  const shown = await page.evaluate(() => {
    const f = document.querySelector('[data-ad-column="DocStatus"]');
    return f ? (f.querySelector('input,select') ? f.querySelector('input,select').value : f.textContent).trim() : null;
  });
  const hostLog = lastLog(/§CRUD-HOSTPROCESS .*action=CO/);
  const commitLog = lastLog(/§CRUD process committed .*verifyChain=ok/);
  const gateLog = lastLog(/§SO-COMPLETE fan-out gated/);
  console.log('§CRITIC-PROCESS ACT1 chooser set=[' + (did1.set || []).join(' | ') + '] clicked=' + did1.clicked + ' tip ' + tipBefore + '→' + tipAfter + ' shown=' + shown);
  console.log('§CRITIC-PROCESS ACT1 hostproc="' + hostLog + '" commit="' + commitLog + '"');
  ok('form Process ▶ chooser offers the legal set incl. Complete', !!did1.clicked && (did1.set || []).length >= 2, JSON.stringify(did1.set));
  ok('Complete fires the HOST→signed lane (§CRUD-HOSTPROCESS action=CO)', /§CRUD-HOSTPROCESS/.test(hostLog), hostLog);
  ok('a SIGNED op is committed + chain-verified (§CRUD process committed verifyChain=ok)', /verifyChain=ok/.test(commitLog), commitLog);
  ok('the op-log readTip for the order = CO (signed, not the immutable bundle)', String(tipAfter) === 'CO', 'before=' + tipBefore + ' after=' + tipAfter);
  ok('the rendered DocStatus shows Completed', /complete/i.test(String(shown || '')) || String(shown) === 'CO', 'shown=' + shown);
  ok('fan-out is GATED honestly on a NULL-doctype Odoo order (matches iDempiere — no auto-ship)', /fan-out gated/.test(gateLog), gateLog || '(no gate log)');

  // RELOAD — the heart of the critic's bar: a real completion must survive a page reload.
  await gotoTenant(page, odooUrl);
  await page.waitForTimeout(1500);   // let the lazy sidecar hydrate from IndexedDB + the readTip overlay re-apply
  const tipReload = target ? await tipOf(page, target.id) : null;
  const renderReload = target ? await page.evaluate((i) => {
    const rows = Array.from(document.querySelectorAll('.idmp-grid tbody tr[data-ad-record]'));
    const tr = rows.find(r => Number(r.getAttribute('data-ad-record')) === i);
    if (!tr) return null;
    const chip = tr.querySelector('.idmp-stchip'); return chip ? chip.textContent.trim() : tr.textContent.slice(0, 40);
  }, target.id) : null;
  const docTipLog = lastLog(/§DOC-TIP overlay/);
  console.log('§CRITIC-PROCESS ACT1 RELOAD readTip=' + tipReload + ' renderedChip="' + renderReload + '" docTip="' + docTipLog + '"');
  ok('RELOAD: the signed CO SURVIVES (op-log readTip still CO after a fresh page load)', String(tipReload) === 'CO', 'reload tip=' + tipReload);
  ok('RELOAD: the grid renders the order as Completed (readTip overlay re-applied)', /complete/i.test(String(renderReload || '')), 'chip=' + renderReload);

  // ════════════════════════════ ACT 2 — ODOO GRID GEAR-BATCH: signed over N rows ════════════════════════════
  const batchIds = await page.evaluate((skip) => {
    // pick 2 orders STILL processable — exclude the ACT1 target (now CO via the overlay), else the legal-action
    // intersection of {CO, IP} excludes Complete and the batch correctly offers no Complete button.
    const r = window.__idmpDb.exec("SELECT C_Order_ID FROM C_Order WHERE AD_Client_ID=12 AND DocStatus IN ('DR','IP') AND C_Order_ID != " + Number(skip) + " ORDER BY C_Order_ID LIMIT 2");
    return r.length ? r[0].values.map(v => v[0]) : [];
  }, target ? target.id : 0);
  // ensure grid view, then tick the two rows
  await page.evaluate(() => { const t = document.querySelector('#idmp-tabstrip .idmp-adtab.active') || document.querySelector('#idmp-tabstrip .idmp-adtab'); if (t) t.click(); });
  await page.waitForSelector('.idmp-grid tbody tr[data-ad-record]', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  const ticked = await page.evaluate((ids) => {
    let n = 0;
    document.querySelectorAll('.idmp-grid tbody tr[data-ad-record]').forEach(tr => {
      if (ids.indexOf(Number(tr.getAttribute('data-ad-record'))) >= 0) { const cb = tr.querySelector('input[type="checkbox"]'); if (cb) { cb.click(); n++; } }
    });
    return n;
  }, batchIds);
  await page.waitForTimeout(400);
  const fired = await page.evaluate(() => {
    const bar = document.getElementById('idmp-batchbar'); if (!bar) return false;
    const b = Array.from(bar.querySelectorAll('.idmp-batch-act')).find(x => /complete/i.test(x.textContent));
    if (b) { b.click(); return true; } return false;
  });
  await page.waitForTimeout(1800);
  const batchTips = {};
  for (const id of batchIds) batchTips[id] = await tipOf(page, id);
  const hostCount = logs.filter(l => /§CRUD-HOSTPROCESS .*action=CO/.test(l)).length;
  const batchLog = lastLog(/§GRID-BATCH .*action=CO/);
  console.log('§CRITIC-PROCESS ACT2 ticked=' + ticked + ' fired=' + fired + ' batchTips=' + JSON.stringify(batchTips) + ' hostproc-total=' + hostCount);
  console.log('§CRITIC-PROCESS ACT2 batchLog="' + batchLog + '"');
  ok('grid gear-batch fires Complete over the selection (§GRID-BATCH action=CO ok≥1)', fired && /ok=[1-9]/.test(batchLog), batchLog);
  ok('every batched row carries a SIGNED CO in the op-log (dispatch-over-N, same signed verb)',
     batchIds.length >= 2 && batchIds.every(id => String(batchTips[id]) === 'CO'), JSON.stringify(batchTips));

  // ════════════════════════════ ACT 3 — GARDENWORLD: REAL fan-out through the re-pointed surface ════════════════════════════
  // POS-doctype order (135, auto-generate Y/Y, reactivatable): reactivate (CO→IP) then Complete (IP→CO) →
  // the signed group carries the engine's shipment + invoice. Same completeFanout lane the ring proved.
  const gwUrl = `http://localhost:${port}/idempiere.html?seed=ad_seed.db&login=GardenAdmin&window=143`;
  await gotoTenant(page, gwUrl);
  const fanTarget = await page.evaluate(() => {
    // a Completed order on an auto-generating, reactivatable doctype
    const r = window.__idmpDb.exec(
      "SELECT o.C_Order_ID,o.DocumentNo,o.DocStatus,o.C_DocType_ID FROM C_Order o " +
      "JOIN c_doctype d ON d.c_doctype_id=o.C_DocType_ID " +
      "WHERE d.iscanbereactivated='Y' AND d.isautogenerateinout='Y' AND o.DocStatus='CO' ORDER BY o.C_Order_ID LIMIT 1");
    if (!r.length) return null; const v = r[0].values[0]; return { id: v[0], doc: v[1], ds: v[2], dt: v[3] };
  });
  console.log('§CRITIC-PROCESS ACT3 fan-out target=' + (fanTarget ? `${fanTarget.doc}(${fanTarget.id}) ds=${fanTarget.ds} doctype=${fanTarget.dt}` : 'NONE'));
  ok('a reactivatable auto-generating (POS-style) order exists for the fan-out proof', !!fanTarget, fanTarget ? JSON.stringify(fanTarget) : 'none');

  if (fanTarget) {
    const re = await processVia(page, fanTarget.id, /re-?activate|reactivate/i);
    const tipRe = await tipOf(page, fanTarget.id);
    console.log('§CRITIC-PROCESS ACT3 reactivate set=[' + (re.set || []).join(' | ') + '] clicked=' + re.clicked + ' tip→' + tipRe);
    ok('ReActivate signs CO→IP (op-log readTip = IP)', String(tipRe) === 'IP', 'clicked=' + re.clicked + ' tip=' + tipRe);

    // back to grid, then Complete the now-IP order
    await page.evaluate(() => { const t = document.querySelector('#idmp-tabstrip .idmp-adtab.active') || document.querySelector('#idmp-tabstrip .idmp-adtab'); if (t) t.click(); });
    await page.waitForSelector('.idmp-grid tbody tr[data-ad-record]', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
    const co = await processVia(page, fanTarget.id, /complete/i);
    const tipCo = await tipOf(page, fanTarget.id);
    const sealed = lastLog(/§SO-COMPLETE order=.*sealed=Y gid=/);
    const fanline = lastLog(/§SO-FANOUT order=/);
    const opLog = await page.evaluate((id) => {
      const sdb = window.__crud && window.__crud.kernelDb && window.__crud.kernelDb(); if (!sdb) return { err: 'no-sidecar' };
      const r = sdb.exec("SELECT op_type, parameters FROM kernel_ops WHERE op_type IN ('CREATE_DOCUMENT','CREATE_LINE','SET_STATUS') AND undone=0");
      const out = { ship: 0, invoice: 0, lines: 0, status: 0 };
      if (r.length) r[0].values.forEach(row => {
        let p; try { p = JSON.parse(row[1]); } catch (e) { return; }
        const t = String((p && p.table) || '').toLowerCase();
        if (row[0] === 'CREATE_DOCUMENT' && t === 'm_inout') out.ship++;
        else if (row[0] === 'CREATE_DOCUMENT' && t === 'c_invoice') out.invoice++;
        else if (row[0] === 'CREATE_LINE') out.lines++;
        else if (row[0] === 'SET_STATUS') out.status++;
      });
      return out;
    }, fanTarget.id);
    console.log('§CRITIC-PROCESS ACT3 complete set=[' + (co.set || []).join(' | ') + '] clicked=' + co.clicked + ' tip→' + tipCo + ' opLog=' + JSON.stringify(opLog));
    console.log('§CRITIC-PROCESS ACT3 sealed="' + sealed + '" fanout="' + fanline + '"');
    ok('Complete signs IP→CO (op-log readTip = CO)', String(tipCo) === 'CO', 'tip=' + tipCo);
    ok('the signed group SEALS with fan-out (§SO-COMPLETE … sealed=Y gid=)', /sealed=Y gid=/.test(sealed), sealed);
    ok('the op-log carries a drillable shipment (CREATE_DOCUMENT M_InOut)', opLog.ship >= 1, JSON.stringify(opLog));
    ok('the op-log carries a drillable invoice (CREATE_DOCUMENT C_Invoice)', opLog.invoice >= 1, JSON.stringify(opLog));
  }

  ok('0 pageerrors across all three acts', errs.length === 0, errs.length ? errs.slice(0, 3).join(' | ') : '');

  // ── the critic's verdict ─────────────────────────────────────────────────────────────────────────────
  const verdict = fail === 0;
  console.log('\n§CRITIC-VERDICT(J5) ' + (verdict ? '✅' : '🔴') + ' — Complete is now REAL on iDempiere\'s OWN surfaces. The form '
    + 'Process ▶ pill AND the grid gear-batch route through __crud.process → the SHARED signed commitProcess lane '
    + '(NOT the old in-memory preview): a signed op is committed + chain-verified, the new DocStatus reads-the-tip and '
    + 'SURVIVES RELOAD, and on an auto-generating doctype the fan-out (shipment + invoice) seals into the same signed '
    + 'group — the consequence set the ring proved (W-SO-COMPLETE-UI), now reached from iDempiere\'s own DocAction bar. '
    + 'Fan-out on NULL-doctype Odoo orders is gated honestly (iDempiere would not auto-ship those either). The ring never opens.');
  console.log((verdict ? '✅' : '❌') + ' W-CRITIC-PROCESS-LIVE: ' + pass + '/' + (pass + fail) + ' PASS (' + fail + ' FAIL)');
  await browser.close(); server.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); try { server.close(); } catch (x) {} process.exit(1); });
