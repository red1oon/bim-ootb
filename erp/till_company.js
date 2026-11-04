// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — till_company.js: the company on the till = the left menu panel, the About screen, the top-strip brand and the receipt header (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §36.2, §36.4-§36.6).
// READ THE LOG (§TILL_COMPANY lines of erp/tests/witness_till_company.js). The company arrives in the morning SODA batch as ONE POS_SodaRef row Kind 'O' (name = AD_Org.Name, detail = AD_OrgInfo + C_Location columns,
// imageurl = the logo AD_Image.ImageURL); it is kept in the device store as small strings. The logo is a URL: its picture goes through the §31 service-worker media cache, its bytes are NEVER in IndexedDB.
// Receipt header order = Printer.Ticket.xml (<image>Printer.Ticket.Logo</image> then printTicketHeaderLine1..6): a typed Setup header line (tkt.header1..6) wins, else the company lines.
// About = AppLocal.java:31,33 (APP_NAME "uniCenta oPOS", APP_VERSION "5.0"; the supplied 5.0 source has no About panel) + the company block.
(function () {
  'use strict';
  var A = null, APP = 'uniCenta oPOS', VER = '5.0';   // AppLocal.java:31,33
  function co() { return (A && A.S.store && A.S.store.company) || null; }
  function lines(c) {
    if (!c) return [];
    var d = c.detail || {}, out = []; if (c.name) out.push(c.name);
    if (d.address1) out.push(d.address1); if (d.address2) out.push(d.address2);
    var cp = [d.city, d.postal].filter(Boolean).join(' '); if (cp) out.push(cp); if (d.country) out.push(d.country);
    if (d.taxid) out.push('Tax ID: ' + d.taxid); if (d.phone) out.push('Tel: ' + d.phone); if (d.email) out.push(d.email);
    return out;
  }
  function headerLines() {
    var s = (A.S.store.setup || {}), typed = []; for (var i = 1; i <= 6; i++) { var t = String(s['tkt.header' + i] || '').trim(); if (t) typed.push(t); }
    return typed.length ? typed : lines(co());
  }
  function footerLine() { var c = co(); return String((A.S.store.setup || {})['tkt.footer1'] || '').trim() || (c && c.detail && c.detail.footer) || ''; }
  function headerHtml() {
    var c = co(), h = headerLines(); if (!h.length) return '';
    return (c && c.imageurl ? '<div class="rf" data-f="header-logo">[logo]</div>' : '') + h.map(function (t) { return '<div class="rf" data-f="header">' + A.esc(t) + '</div>'; }).join('');
  }
  function initial(c) { return ((c && c.name) || '?').trim().charAt(0).toUpperCase(); }
  function logoFill(box, img, c) {   // the picture when the company has a logo URL, else the placeholder initial in the theme colour (never an invented logo)
    if (c && c.imageurl) { img.hidden = false; if (img.getAttribute('src') !== c.imageurl) { img.crossOrigin = 'anonymous'; img.src = c.imageurl; } box.textContent = ''; box.hidden = true; }
    else { img.hidden = true; img.removeAttribute('src'); box.hidden = false; box.textContent = initial(c); }
  }
  function renderBrand() {
    var c = co(), b = A.$('#brand'); b.hidden = !c; if (!c) return;
    A.$('#brand-name').textContent = c.name || ''; logoFill(A.$('#brand-logo'), A.$('#brand-logo-img'), c);
  }
  function renderAbout() {
    var c = co(), box = A.$('#ab-logo');
    if (c && c.imageurl) box.innerHTML = '<img alt="" crossorigin="anonymous" src="' + A.esc(c.imageurl) + '" style="max-width:100%;max-height:100%">'; else box.textContent = initial(c);
    A.$('#ab-co').innerHTML = c ? lines(c).map(function (t, i) { return '<div data-ab="' + (i === 0 ? 'name' : 'line') + '"' + (i === 0 ? ' style="font-weight:700;font-size:18px"' : '') + '>' + A.esc(t) + '</div>'; }).join('') : '<div data-ab="none">No company details received yet (they arrive with the morning SODA batch).</div>';
    A.$('#ab-app').innerHTML = '<div data-ab="app">' + A.esc(APP) + ' ' + A.esc(VER) + '</div><div>Twin of uniCenta 5.0 on iDempiere (browser)</div>';
    A.log('§TILL_COMPANY about name=' + (c ? c.name : 'none') + ' lines=' + lines(c).length + ' logo=' + (c && c.imageurl ? c.imageurl : 'none') + ' seq=' + (c ? c.seq : '-'));
  }
  // the SODA apply for the 'O' rows (till.js applySoda hands them over): the newest one wins; unchanged -> nothing stored, nothing logged as applied
  function apply(rows) {
    var r = rows.slice().sort(function (a, b) { return Number(a.seq) - Number(b.seq); }).pop(); if (!r) return { applied: 0 };
    var d = {}; try { d = JSON.parse(r.detail || '{}'); } catch (e) { d = {}; }
    var next = { name: r.name || '', value: r.value || '', imageurl: r.imageurl || '', detail: d, seq: Number(r.seq) }, cur = co();
    var same = cur && JSON.stringify([cur.name, cur.value, cur.imageurl, cur.detail]) === JSON.stringify([next.name, next.value, next.imageurl, next.detail]);
    if (same) { cur.seq = next.seq; A.saveStore(); A.log('§TILL_COMPANY apply unchanged name=' + next.name); return { applied: 0, noop: 1 }; }
    A.S.store.company = next; A.saveStore(); renderBrand();
    A.log('§TILL_COMPANY apply name=' + next.name + ' lines=' + lines(next).length + ' logo=' + (next.imageurl || 'none') + ' seq=' + next.seq); return { applied: 1, logo: next.imageurl || null };
  }
  function logoUrls() { var c = co(); return c && c.imageurl ? [c.imageurl] : []; }
  // the left panel (§36.2): Main = Menu.Root.txt:2-6; Administration = the extras the till already has (Menu.Root.txt:115-143); System = Configuration, About
  function renderLeft() {
    var rest = A.S.mode === 'restaurant';
    var secs = [['Main', [['Sales', rest ? 'floors' : 'sales'], ['Edit Sales', 'editsales'], ['Customer Payment', 'custpay'], ['Payments', 'payments'], ['Close Cash', 'close']]],
      ['Administration', [['Check In/Out', 'presence'], ['Voucher', 'vouchers'], ['Pickup Reset', 'pickup']]], ['System', [['Configuration', 'setup'], ['About', 'about']]]];
    A.$('#lm-body').innerHTML = secs.map(function (s) { return '<div class="lm-h">' + A.esc(s[0]) + '</div>' + s[1].map(function (i) { return '<button class="lm-i" data-lm-go="' + i[1] + '">' + A.esc(i[0]) + '</button>'; }).join(''); }).join('');
    var min = !!(A.S.store.setup || {})['lm.min']; setMin(min, true);
  }
  function setMin(min, quiet) {
    var m = A.$('#leftmenu'); m.classList.toggle('min', min); var b = A.$('#lm-hide'); b.textContent = min ? '›' : '‹'; b.setAttribute('aria-expanded', min ? 'false' : 'true');
    if (!quiet) { var s = A.S.store.setup = A.S.store.setup || {}; s['lm.min'] = min; A.saveStore(); A.log('§TILL_LEFTMENU collapsed=' + min); }
  }
  function init(api) {
    A = api; A.S.screenBeforeAbout = 'menu'; A.hooks.about = renderAbout; renderLeft(); renderBrand();
    document.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('button'); if (!b) return;
      if (b.id === 'lm-hide') setMin(!A.$('#leftmenu').classList.contains('min'));
      else if (b.hasAttribute('data-lm-go')) { var n = b.getAttribute('data-lm-go'); if (n === 'about') A.S.screenBeforeAbout = A.S.screen || 'sales'; A.go(n); }
      else if (b.id === 'ab-back') A.go(A.S.screenBeforeAbout || 'menu');
    });
    window.TillCompany = { apply: apply, lines: lines, headerLines: headerLines, headerHtml: headerHtml, footerLine: footerLine, company: co, logoUrls: logoUrls, renderBrand: renderBrand, renderLeft: renderLeft };
  }
  window.TillCompanyInit = init;
})();
