// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-MOBILE-viewport §-witness that the iDempiere pill bar (idmp_pills.js, mounted from
//   pills_idmp.json) RENDERS VISIBLE pills on a phone — the proof poc_onboard_front_door.js never had
//   (that one checks pill CONFIG via builder.getConfig(), NOT that buttons are on-screen). The reported bug:
//   "Install/Migrate/Read still NOT in the pill, mobile (and likely desktop)" — the user sees them missing
//   on a real device. This witness NAMES that bug.
//
//   THE CLAIMS (390×844, idempiere.html, pre-client stage = front door):
//     §P0-A  #idmp-pillbar exists AND is on-screen (getBoundingClientRect intersects the 390×844 viewport).
//     §P0-B  the expected pre-client pills (install, migrate, erpdoc) are RENDERED (button#pill-* exists),
//            VISIBLE (offsetParent != null) and ON-SCREEN (rect intersects viewport) — not merely in config.
//     §P0-C  the lens pills (posted/graph/kanban/rule) — always present — are likewise rendered+on-screen.
//     §P2-A  the mobile strip is RIGHT-anchored vertical (rect.right within ~24px of viewport edge AND the
//            bar is taller than wide), NOT the old bottom row dock.  [turns GREEN after §P2 CSS rework]
//     §P2-B  the self-reveal cue fires WHENEVER pills are hidden: with the bar collapsed (PB.close) OR with a
//            non-empty hidden-set, the ⋯ trigger/bar carries the peek class.  [GREEN after §P2]
//
//   §-log FIRST — READ poc_pill_mobile.log before any conclusion. RED on today's build is the point of §P0.
// Run:  node tests/poc_pill_mobile.js 2>&1 | tee tests/poc_pill_mobile.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(__dirname + '/../../tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.db':'application/octet-stream', '.wasm':'application/wasm', '.css':'text/css', '.png':'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/idempiere.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});

const VW = 390, VH = 844;
const PRE_CLIENT = ['install', 'migrate', 'erpdoc'];   // front-door pills that MUST be visible pre-auth
const LENS = ['posted', 'graph', 'kanban', 'rule'];     // always present

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const url = `http://localhost:${port}/idempiere.html`;
  const errs = [];
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('console', m => { /* host §-logs flow to the .log via tee of THIS process if needed */ });
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => window.IdmpPills && window.IdmpPills.builder, { timeout: 20000 }).catch(() => {});
  // Front door: ensure the login card is up so stage = pre-client (Install/Migrate belong on the rail).
  // NOTE (user decision 2026-06-09): the rail is now COLLAPSED BY DEFAULT on both form factors — do NOT open it
  // here; the first thing this witness proves is the clean collapsed resting state.
  await page.evaluate(() => {
    var lg = document.getElementById('idmp-login'); if (lg) lg.style.display = 'flex';
    window.IdmpPills.setStage('pre-client');
  });
  // §P4-3 — the boot PEEK (strip slides out then re-collapses) fires on mount. Let it SETTLE before asserting
  // the clean resting state, else §P3-A would catch the strip mid-peek. Wait for the peek class to clear.
  await page.waitForFunction(() => {
    var p = document.getElementById('idmp-pill');
    return p && !p.classList.contains('idmp-pill-peeking');
  }, { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(120);

  // Per-pill on-screen probe: rendered (exists) + visible (offsetParent) + rect intersects 390×844.
  function probe(ids) {
    return page.evaluate((arg) => {
      var ids = arg.ids, VW = arg.VW, VH = arg.VH;
      return ids.map(function (id) {
        var b = document.getElementById('pill-' + id);
        if (!b) return { id: id, rendered: false, visible: false, onScreen: false };
        var r = b.getBoundingClientRect();
        var visible = b.offsetParent !== null;
        var onScreen = r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < VW && r.top < VH;
        return { id: id, rendered: true, visible: visible, onScreen: onScreen,
                 rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } };
      });
    }, { ids, VW, VH });
  }
  function barRect() {
    return page.evaluate((arg) => {
      var VW = arg.VW, VH = arg.VH;
      var el = document.getElementById('idmp-pillbar');
      if (!el) return { exists: false };
      var r = el.getBoundingClientRect();
      return { exists: true, onScreen: r.right > 0 && r.bottom > 0 && r.left < VW && r.top < VH,
               rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
                       right: Math.round(r.right), bottom: Math.round(r.bottom) } };
    }, { VW, VH });
  }

  // ── §P3-A — COLLAPSED BY DEFAULT: at boot the ⋯ is present + on-screen, the pills are NOT visible yet, and the
  //    ⋯ carries the attract cue inviting the tap. This is the clean resting state (both desktop + mobile). ──
  const dflt = await page.evaluate(() => {
    var trig = document.getElementById('idmp-pill-trigger');
    var open = window.IdmpPills.builder.isOpen();
    var anyPillVisible = ['install','migrate','erpdoc','posted','graph','kanban','rule']
      .some(function (id) { var b = document.getElementById('pill-' + id); return b && b.offsetParent !== null; });
    return { open: open, trigOnScreen: !!(trig && trig.offsetParent !== null),
             cueArmed: !!(trig && /idmp-pill-attract/.test(trig.className)), anyPillVisible: anyPillVisible };
  });
  await page.screenshot({ path: __dirname + '/poc_pill_mobile_collapsed.png' });
  console.log('§P3-DEFAULT open=' + dflt.open + ' trigOnScreen=' + dflt.trigOnScreen +
              ' cueArmed=' + dflt.cueArmed + ' anyPillVisible=' + dflt.anyPillVisible);
  const collapsedDefaultOk = !dflt.open && dflt.trigOnScreen && !dflt.anyPillVisible;

  // ── §P4-3 — TRUE PEEK: fire the cue from the collapsed resting state and prove the actual PILLS become
  //    momentarily VISIBLE (the strip slides out, a real pill button is on-screen) then RE-COLLAPSE (the strip
  //    returns to display:none, no pill visible) — not just a ⋯ bob. Names the bug "jump-reveal never happens". ──
  const peekProbe = () => page.evaluate(() => {
    var p = document.getElementById('idmp-pill');
    var anyPill = ['install','migrate','erpdoc','posted','graph','kanban','rule']
      .some(function (id) { var b = document.getElementById('pill-' + id); return b && b.offsetParent !== null; });
    return { peeking: !!(p && p.classList.contains('idmp-pill-peeking')),
             display: p ? getComputedStyle(p).display : 'none', anyPillVisible: anyPill };
  });
  await page.evaluate(() => { window.IdmpPills._evalReveal(); });   // fire from collapsed → strip slides out
  await page.waitForTimeout(60);                                    // mid-peek
  const peekOpen = await peekProbe();
  await page.waitForFunction(() => {                                // wait for the slide-back + re-collapse
    var p = document.getElementById('idmp-pill');
    return p && !p.classList.contains('idmp-pill-peeking');
  }, { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(80);
  const peekDone = await peekProbe();
  console.log('§P4-3-PEEK openPhase=' + JSON.stringify(peekOpen) + ' collapsePhase=' + JSON.stringify(peekDone));
  const peekOk = peekOpen.peeking && peekOpen.display !== 'none' && peekOpen.anyPillVisible &&
                 !peekDone.peeking && peekDone.display === 'none' && !peekDone.anyPillVisible;

  // ── REVEAL: simulate the user's ⋯ tap (PB.toggle) — now the pills must render + be visible + on-screen. ──
  await page.evaluate(() => { window.IdmpPills.builder.toggle(); });
  await page.waitForTimeout(120);

  const bar = await barRect();
  const pre = await probe(PRE_CLIENT);
  const lens = await probe(LENS);
  console.log('§P0-BAR exists=' + bar.exists + ' onScreen=' + (bar.onScreen||false) + ' rect=' + JSON.stringify(bar.rect||null));
  console.log('§P0-PRE  ' + JSON.stringify(pre));
  console.log('§P0-LENS ' + JSON.stringify(lens));

  const allVisible = (arr) => arr.every(p => p.rendered && p.visible && p.onScreen);
  const barOk = bar.exists && bar.onScreen;
  const preOk = allVisible(pre);
  const lensOk = allVisible(lens);

  // ── §P4-1 — at the FRONT DOOR (pre-client, login overlay up) the ShowMe pill must produce a MEANINGFUL,
  //    VISIBLE card — NOT the in-client AD tour whose steps target nonexistent keys → 0 badges behind the z-120
  //    login ("ShowMe gives nothing"). Tap showme → assert the help card is OPEN, on-screen, ON TOP (elementFromPoint
  //    hits it, above the login), and shows the onboarding store (a real title + steps). This is the test that
  //    PASSES ONLY IF the feature is actually visible (the §P3-B gap §P4-1 called out). Restores ShowMe off. ──
  const onboard = await page.evaluate(() => {
    var stage = (typeof window.IdmpPillStage === 'function') ? window.IdmpPillStage() : '?';
    var btn = document.getElementById('pill-showme');
    if (btn) btn.dispatchEvent(new Event('pointerup', { bubbles: true }));     // ShowMe on
    var card = document.getElementById('helpCard');
    var out = { stage: stage, open: false, onScreen: false, onTop: false, title: '', steps: 0 };
    if (card) {
      out.open = card.classList.contains('open');
      var r = card.getBoundingClientRect();
      out.onScreen = r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 &&
                     r.right <= window.innerWidth && r.bottom <= window.innerHeight;
      var hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      out.onTop = !!(hit && (hit === card || card.contains(hit)));
      var t = card.querySelector('.hctitle'); out.title = t ? t.textContent.trim() : '';
    }
    out.steps = (window.__help && window.__help.steps) ? window.__help.steps().length : 0;
    var ck = document.getElementById('needHelpCk'); if (ck && ck.checked) { ck.checked = false; ck.dispatchEvent(new Event('change')); }  // restore
    return out;
  });
  console.log('§P4-1-ONBOARD ' + JSON.stringify(onboard));
  const onboardOk = onboard.stage === 'pre-client' && onboard.open && onboard.onScreen && onboard.onTop &&
                    onboard.title.length > 0 && onboard.steps >= 1;

  // ── §P4-2 — the gate switches BOTH ways: in-client restores the default AD tour (setOps(null) → help_ops.json,
  //    the o2c store), NOT the onboarding store. Drive the default directly + enable; assert the o2c keys load. ──
  const inClient = await page.evaluate(() => new Promise((resolve) => {
    window.__help.setOps(null);                                  // what _driveShowMeOps() does in-client
    var ck = document.getElementById('needHelpCk');
    ck.checked = true; ck.dispatchEvent(new Event('change'));    // enable → fetch help_ops.json → buildSteps
    setTimeout(function () {
      var steps = (window.__help.steps && window.__help.steps()) || [];
      var keys = steps.map(function (s) { return s.key; });
      if (ck.checked) { ck.checked = false; ck.dispatchEvent(new Event('change')); }   // restore off
      resolve({ n: steps.length, hasO2c: keys.indexOf('o2c') >= 0, hasOrder: keys.indexOf('c_order') >= 0 });
    }, 500);
  }));
  console.log('§P4-2-INCLIENT ' + JSON.stringify(inClient));
  const inClientOk = inClient.hasO2c && inClient.n >= 4;

  // ── §P3-B — Help/ShowMe is now a CLEAN pill, not header chrome. Assert: (1) the 'showme' pill renders
  //    visible+on-screen (reveal state); (2) its handler is wired; (3) the header '?' (#idmp-help-btn) is GONE;
  //    (4) the shared floating '#needHelpWrap' (NeedHelp? checkbox) is suppressed on this surface; (5) tapping the
  //    showme pill TOGGLES the shared #needHelpCk on (and the pill goes lit). Drives the real wiring, no fork. ──
  const showme = (await probe(['showme']))[0];
  const help = await page.evaluate(() => {
    var out = { handler: !!(window.IdmpPillActions && typeof window.IdmpPillActions.showme === 'function'),
                headerQ: !!document.getElementById('idmp-help-btn'),
                floatingShown: false, toggledOn: false, pillLit: false };
    var wrap = document.getElementById('needHelpWrap');
    out.floatingShown = !!(wrap && wrap.offsetParent !== null);     // suppressed ⇒ offsetParent null
    // tap the showme pill → should flip #needHelpCk on
    var btn = document.getElementById('pill-showme'); if (btn) btn.dispatchEvent(new Event('pointerup', { bubbles: true }));
    var ck = document.getElementById('needHelpCk');
    out.toggledOn = !!(ck && ck.checked);
    window.IdmpPills.builder.sync();                                // re-evaluate lit states
    out.pillLit = !!(btn && /active/.test(btn.className));
    if (ck && ck.checked) { ck.checked = false; ck.dispatchEvent(new Event('change')); }   // restore
    return out;
  });
  console.log('§P3-SHOWME pill=' + JSON.stringify(showme) + ' ' + JSON.stringify(help));
  const showmeOk = showme.rendered && showme.visible && showme.onScreen && help.handler &&
                   !help.headerQ && !help.floatingShown && help.toggledOn && help.pillLit;

  // §P2-A — mobile strip is RIGHT-anchored vertical (right edge hugged, taller than wide).
  const rightVertical = bar.exists && bar.rect.right >= (VW - 24) && bar.rect.h > bar.rect.w;
  console.log('§P2-STRIP rightAnchored=' + (bar.exists && bar.rect.right >= (VW-24)) +
              ' vertical(h>w)=' + (bar.exists && bar.rect.h > bar.rect.w) + ' => rightVertical=' + rightVertical);

  // §P2-B — self-reveal cue fires whenever pills are hidden. Two conditions, OR over them:
  //   (1) collapse the bar (PB.close → off-rail pills behind ⋯)   (2) push a non-empty hidden-set.
  const cue = await page.evaluate(() => {
    var out = { collapsedCue: false, hiddenSetCue: false };
    var bar = document.getElementById('idmp-pillbar'), trig = document.getElementById('idmp-pill-trigger');
    var has = function () {
      var n = (bar && bar.className || '') + ' ' + (trig && trig.className || '');
      return /idmp-pill-attract|idmp-pill-peek|attract|peek/.test(n);
    };
    // (1) collapsed
    if (window.IdmpPills.builder.close) window.IdmpPills.builder.close();
    if (window.IdmpPills._evalReveal) window.IdmpPills._evalReveal();   // optional explicit hook if §P2 adds one
    out.collapsedCue = has();
    // reopen, then (2) hidden-set via in-client stage (demotes install/migrate to overflow)
    if (!window.IdmpPills.builder.isOpen()) window.IdmpPills.builder.toggle();
    window.IdmpPills.setStage('in-client');
    if (window.IdmpPills._evalReveal) window.IdmpPills._evalReveal();
    out.hiddenSetCue = has();
    out.hiddenLen = (window.IdmpPills.builder.getConfig().hidden || []).length;
    window.IdmpPills.setStage('pre-client');
    return out;
  });
  console.log('§P2-CUE ' + JSON.stringify(cue));
  const cueOk = (cue.collapsedCue || cue.hiddenSetCue);

  console.log('   ' + (collapsedDefaultOk ? '🟢' : '🔴') + ' §P3-A COLLAPSED BY DEFAULT — at boot only the ⋯ shows (no pills visible), clean resting state');
  console.log('   ' + (peekOk ? '🟢' : '🔴') + ' §P4-3 TRUE PEEK — the hidden pills slide OUT (visible) then RE-COLLAPSE (display:none), not just a ⋯ bob');
  console.log('   ' + (barOk ? '🟢' : '🔴') + ' §P0-A after ⋯ tap: #idmp-pillbar exists + on-screen (390×844)');
  console.log('   ' + (preOk ? '🟢' : '🔴') + ' §P0-B after ⋯ tap: pre-client pills [install,migrate,erpdoc] rendered+visible+on-screen');
  console.log('   ' + (lensOk ? '🟢' : '🔴') + ' §P0-C after ⋯ tap: lens pills [posted,graph,kanban,rule] rendered+visible+on-screen');
  console.log('   ' + (showmeOk ? '🟢' : '🔴') + ' §P3-B Help/ShowMe is a CLEAN pill (circleHelp, lit-on-toggle); header ? gone + floating NeedHelp suppressed');
  console.log('   ' + (onboardOk ? '🟢' : '🔴') + ' §P4-1 ShowMe at the front door shows a VISIBLE onboarding card on top of the login (not 0-badges-nothing)');
  console.log('   ' + (inClientOk ? '🟢' : '🔴') + ' §P4-2 in-client restores the default AD tour (o2c store) — the gate switches both ways');
  console.log('   ' + (rightVertical ? '🟢' : '🔴') + ' §P2-A mobile strip is RIGHT-anchored vertical (not bottom dock)');
  console.log('   ' + (cueOk ? '🟢' : '🔴') + ' §P2-B self-reveal cue fires when pills hidden (collapsed OR hidden-set>0)');

  const pass = collapsedDefaultOk && peekOk && barOk && preOk && lensOk && showmeOk && onboardOk && inClientOk && rightVertical && cueOk && errs.length === 0;
  console.log('§P0-RESULT ' + (pass ? 'PASS' : 'FAIL') + ' pageErrors=' + (errs.length ? errs.join('|') : 0));
  // Always capture the 390px screenshot (log≠visual proof) — attach to §P2.
  try { await page.screenshot({ path: __dirname + '/poc_pill_mobile.png' }); console.log('§P0-SHOT tests/poc_pill_mobile.png'); } catch (e) {}
  await browser.close(); server.close(); process.exit(pass ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); server.close(); process.exit(2); });
