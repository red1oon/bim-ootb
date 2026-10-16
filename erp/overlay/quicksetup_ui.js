// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// overlay/quicksetup_ui.js — OPTIONAL "Quick setup" for Initial Client Setup, as an OVERLAY (prompts/ERP_DEPTH_FILM.md §QUICKSETUP, §EXTENSION-LAYER LAW). The core wizard form is NOT edited: when the
// form appears this file adds a tick-box (OFF by default). Ticked = hide the currency / administrator / chart fields and FILL them with the values derived from the dictionary (OverlayQuickInput); the
// core's own "Create tenant" handler then runs UNCHANGED over the filled form (the same Genesis.birthTenant + install path, so the tenant is byte-for-byte what the long form makes). A country the dictionary
// gives no currency for is REFUSED in a capture-phase click guard (a message, nothing created) - nothing is invented.
(function () {
  'use strict';
  function q(sql) { var H = window.OverlayHome; return H && H.q ? H.q(sql) : []; }
  function ctx() {
    var c = { countries: {}, currencies: {}, processDefaults: {} };
    q("SELECT C_Country_ID AS id, C_Currency_ID AS cur FROM C_Country WHERE IsActive='Y'").forEach(function (r) { c.countries[r.id] = { currencyId: r.cur }; });
    q("SELECT C_Currency_ID AS id, ISO_Code AS iso, StdPrecision AS prec, IsActive AS act FROM C_Currency").forEach(function (r) { c.currencies[r.id] = { iso: r.iso, prec: r.prec, active: r.act === 'Y' }; });
    q("SELECT ColumnName AS cn, DefaultValue AS dv FROM AD_Process_Para WHERE AD_Process_ID=53161").forEach(function (r) { c.processDefaults[r.cn] = r.dv; });
    return c;
  }
  function wrap(sel) { var e = document.querySelector(sel); return e ? (e.closest('.fld') || e.parentNode) : null; }
  function enhance() {
    try {
      var create = document.querySelector('[data-genesis-create]');
      if (!create || create.getAttribute('data-ovl-qs') || !window.OverlayQuickInput || !window.__idmpDb) return;
      var name = document.querySelector('[data-genesis-name]'), ccy = document.querySelector('[data-genesis-currency]'), cty = document.querySelector('[data-genesis-country]'), adm = document.querySelector('[data-genesis-admin]'), coa = document.querySelector('[data-genesis-coa]');
      if (!name || !ccy || !cty || !adm || !coa) return;
      create.setAttribute('data-ovl-qs', '1');
      var box = document.createElement('input'); box.type = 'checkbox'; box.setAttribute('data-genesis-quick', '1');
      var lbl = document.createElement('label'); lbl.appendChild(box); lbl.appendChild(document.createTextNode(' Quick setup — only company name and country; the rest comes from the dictionary'));
      var sum = document.createElement('div'); sum.className = 'sub'; sum.setAttribute('data-genesis-quicksum', '1');
      var fld = document.createElement('div'); fld.className = 'fld'; fld.appendChild(lbl); fld.appendChild(sum);
      var ccyW = wrap('[data-genesis-currency]'); ccyW.parentNode.insertBefore(fld, ccyW);
      var hideW = [ccyW, wrap('[data-genesis-admin]'), wrap('[data-genesis-coa]')];
      function derive() { return window.OverlayQuickInput.quickInput(ctx(), { clientName: (name.value || '').trim(), countryId: Number(cty.value), dateAcct: '1970-01-01' }); }
      function sync() {
        hideW.forEach(function (w) { if (w) w.style.display = box.checked ? 'none' : ''; });
        if (!box.checked) { sum.textContent = ''; return; }
        var qi = derive();
        if (qi.ok) { ccy.value = String(qi.input.currencyId); adm.value = qi.input.adminUser; coa.value = 'default'; coa.dispatchEvent(new Event('change')); }
        sum.textContent = qi.ok ? 'Currency ' + qi.input.currencyIso + ' (from the country) · administrator ' + qi.input.adminUser + ' (process default) · iDempiere default chart · this year\'s calendar'
          : 'Needs more than name and country: ' + qi.ask.join(', ') + ' — untick Quick setup to enter it.';
        console.log('§QUICKSETUP preview ok=' + qi.ok + ' ask=' + JSON.stringify(qi.ask) + (qi.ok ? ' currency=' + qi.input.currencyIso + ' admin=' + qi.input.adminUser : ''));
      }
      box.addEventListener('change', sync); cty.addEventListener('change', sync); name.addEventListener('input', sync);
      create.addEventListener('click', function (ev) {      // capture phase: runs BEFORE the core handler
        if (!box.checked) return;
        var qi = derive();
        if (!qi.ok) { ev.stopImmediatePropagation(); ev.preventDefault(); sum.textContent = 'Quick setup needs: ' + qi.ask.join(', ') + ' — untick Quick setup to enter it.'; console.log('§QUICKSETUP refused ask=' + JSON.stringify(qi.ask)); return; }
        ccy.value = String(qi.input.currencyId); adm.value = qi.input.adminUser; coa.value = 'default';
        console.log('§QUICKSETUP use typed=' + qi.typed.length + ' currency=' + qi.input.currencyIso + ' admin=' + qi.input.adminUser + ' country=' + qi.input.countryId + ' (the core handler runs unchanged on the filled form)');
      }, true);
    } catch (e) { console.log('§OVERLAY quicksetup failed (core unaffected): ' + String(e && e.message).slice(0, 160)); }
  }
  try { new MutationObserver(function () { setTimeout(enhance, 0); }).observe(document.body, { childList: true, subtree: true }); } catch (e) { console.log('§OVERLAY quicksetup observer failed: ' + e.message); }
})();
