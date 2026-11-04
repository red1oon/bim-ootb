// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — till_setup.js: the till's Configuration screen (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §29.1, §29.D.1, §32.2 W-TILL-SETUP). READ THE LOG (§TILL_SETUP_* lines).
// uniCenta 5.0 JPanelConfiguration.java:233-267 (tabs General, Locale, System Options, Ticket Setup, Company) over the 49 keys that APPLY to a browser till (§29.1 rows marked A; 52 hardware/Swing/DB keys are
// not shown). SCOPE per key (§29.D): 'device' = this till's own store (S.store.setup, as uniCenta's per-machine properties file, AppConfig.java:73-76); 'cpos' = legacy C_POS field, branch-shared, read from C_POS
// (TWIN rule: AutoLogoutDelay, IsModifyPrice); 'branch' = taken from the branch client so every till prints identical receipts (§29.D.7, locale formats), 'tillkey' = the printed terminal (§29.D.8), 'admin' = set
// at the Branch POS Admin (override PIN). The mode switch (machine.ticketsbag) simple / standard / restaurant is applied at boot (till.js) and replaces the URL-only ?mode.
(function () {
  'use strict';
  var T = { G: 'General', L: 'Locale', S: 'System Options', K: 'Ticket Setup', C: 'Company' }, A = null;
  var K = [   // [tab, key, label, type, default, scope]
    ['G', 'machine.hostname', 'Terminal Name', 'text', '', 'tillkey'], ['G', 'machine.department', 'Department', 'text', '', 'device'], ['G', 'machine.ticketsbag', 'Tickets', 'mode', 'standard', 'device'], ['G', 'ui.theme', 'Look and Feel', 'theme', 'classic', 'device'], ['G', 'start.logo', 'Startup Logo', 'text', '', 'device'], ['G', 'start.text', 'Startup Text', 'text', '', 'device'],
    ['L', 'user.language', 'Locale: language', 'text', '', 'branch'], ['L', 'user.country', 'Locale: country', 'text', '', 'branch'], ['L', 'user.variant', 'Locale: variant', 'text', '', 'branch'],
    ['L', 'format.integer', 'Integer', 'text', '(Default)', 'branch'], ['L', 'format.double', 'Double', 'text', '(Default)', 'branch'], ['L', 'format.currency', 'Currency', 'text', '(Default)', 'branch'], ['L', 'format.percent', 'Percent', 'text', '(Default)', 'branch'],
    ['L', 'format.date', 'Date', 'text', '(Default)', 'branch'], ['L', 'format.time', 'Time', 'text', '(Default)', 'branch'], ['L', 'format.datetime', 'Date Time', 'text', '(Default)', 'branch'],
    ['S', 'till.autoLogoff', 'Auto LogOff after Sale?', 'bool', false, 'device'], ['S', 'till.autotimer', 'After ... seconds, 0 = No LogOff', 'num', 100, 'cpos:autologoutdelay'], ['S', 'till.autoLogoffrestaurant', 'In Restaurant mode - return to table plan?', 'bool', false, 'device'],
    ['S', 'table.showcustomerdetails', "Show Customer's detail on table plan", 'bool', true, 'device'], ['S', 'table.customercolour', 'Customer colour', 'text', '#58B000', 'device'], ['S', 'table.showwaiterdetails', "Show User's detail on table plan", 'bool', true, 'device'], ['S', 'table.waitercolour', 'Waiter colour', 'text', '#258FB0', 'device'],
    ['S', 'table.tablecolour', 'Table Name Text colour', 'text', '#D62E52', 'device'], ['S', 'table.transbtn', 'Transparent table button', 'bool', false, 'device'], ['S', 'till.autoRefreshTableMap', 'Auto Refresh Table Map', 'bool', false, 'device'], ['S', 'till.autoRefreshTimer', 'Auto Refresh (seconds)', 'num', 5, 'device'],
    ['S', 'till.pricewith00', 'Use 00 keypad button', 'bool', false, 'device'], ['S', 'till.amountattop', 'Input box above keypad', 'bool', true, 'device'], ['S', 'till.SCOnOff', 'Enable Service Charge', 'bool', false, 'device'], ['S', 'till.SCRate', 'Service Charge Rate', 'num', 0, 'device'], ['S', 'till.SCRestaurant', 'Restaurant mode only?', 'bool', false, 'device'],
    ['S', 'db.prodpriceupdate', 'Allow Price updates', 'bool', false, 'cpos:ismodifyprice'], ['S', 'override.check', 'Use Override?', 'bool', false, 'admin'], ['S', 'override.pin', 'PIN', 'text', '', 'admin'],
    ['K', 'till.pickupsize', 'Length of Pickup Number', 'num', 1, 'device'], ['K', 'till.receiptprintoff', 'Receipt Print Off', 'bool', false, 'device']
  ];
  for (var i = 1; i <= 6; i++) K.push(['C', 'tkt.header' + i, 'Header ' + i, 'text', '', 'device']);
  for (var j = 1; j <= 6; j++) K.push(['C', 'tkt.footer' + j, 'Footer ' + j, 'text', '', 'device']);
  K.push(['C', 'tkt.logopath', 'Receipt logo path', 'text', '', 'device']);
  var MODES = ['simple', 'standard', 'restaurant'];   // JPanelConfigGeneral.java:89-91
  function bag() { var s = A.S.store; s.setup = s.setup || {}; return s.setup; }
  async function cpos() { try { return (await A.rows('SELECT * FROM c_pos ORDER BY c_pos_id LIMIT 1'))[0] || {}; } catch (e) { return {}; } }
  async function derive() { var o = {}; try { var c = (await A.rows('SELECT ad_language AS l FROM ad_client WHERE ad_client_id=' + Number(A.S.cfg.client)))[0] || {}; o.lang = c.l || ''; } catch (e) { /* none */ } return o; }
  var cache = { cp: {}, dv: {} };
  async function render() { draw(); cache.cp = await cpos(); cache.dv = await derive(); draw(); }   // first paint is synchronous (a till screen never shows empty); C_POS / client values fill in
  function draw() {
    var s = bag(), cp = cache.cp, dv = cache.dv, tabs = ['G', 'L', 'S', 'K', 'C'], on = render.tab || 'G';
    A.$('#cfg-tabs').innerHTML = tabs.map(function (t) { return '<button data-cfg-tab="' + t + '"' + (t === on ? ' class="on"' : '') + '>' + T[t] + '</button>'; }).join('');
    A.$('#cfg-body').innerHTML = K.filter(function (k) { return k[0] === on; }).map(function (k) {
      var key = k[1], sc = k[5], val, ro = sc !== 'device', note = '';
      if (sc.indexOf('cpos:') === 0) { val = cp[sc.slice(5)]; note = 'branch setting (C_POS)'; if (val === undefined || val === null) val = k[4]; if (k[3] === 'bool') val = val === 'Y' || val === true; }
      else if (sc === 'tillkey') { val = A.S.cfg.tillKey; note = 'printed terminal = till key'; }
      else if (sc === 'branch') { val = key === 'user.language' ? dv.lang : (s[key] !== undefined ? s[key] : k[4]); note = 'from the branch client'; }
      else if (sc === 'admin') { val = key === 'override.pin' ? '' : true; note = 'set at the Branch POS Admin'; }
      else val = s[key] !== undefined ? s[key] : k[4];
      var inp = k[3] === 'theme' ? '<select id="cfg-theme" data-key="' + key + '">' + window.TillTheme.names().map(function (n) { return '<option value="' + n + '"' + (n === (val || 'classic') ? ' selected' : '') + '>' + A.esc(window.TillTheme.THEMES[n].label) + '</option>'; }).join('') + '</select>'
        : k[3] === 'mode' ? '<select id="cfg-mode" data-key="' + key + '">' + MODES.map(function (m) { return '<option' + (m === (A.S.mode || 'standard') ? ' selected' : '') + '>' + m + '</option>'; }).join('') + '</select>'
        : k[3] === 'bool' ? '<input type="checkbox" data-key="' + key + '"' + (val ? ' checked' : '') + (ro ? ' disabled' : '') + '>' : '<input data-key="' + key + '" type="' + (k[3] === 'num' ? 'number' : 'text') + '" value="' + A.esc(val) + '"' + (ro ? ' disabled' : '') + '>';
      return '<div class="cfgrow" data-scope="' + A.esc(sc) + '"><label>' + A.esc(k[2]) + ' ' + inp + '</label>' + (note ? ' <small>' + A.esc(note) + '</small>' : '') + '</div>';
    }).join('');
    A.log('§TILL_SETUP_VIEW tab=' + T[on] + ' keys=' + K.length + ' device=' + K.filter(function (k) { return k[5] === 'device'; }).length + ' mode=' + (A.S.mode || 'standard'));
  }
  function save() {
    var s = bag(), n = 0; A.$$('#cfg-body [data-key]:not([disabled])').forEach(function (e) { var k = e.getAttribute('data-key'), v = e.type === 'checkbox' ? e.checked : e.type === 'number' ? Number(e.value) : e.value; if (s[k] !== v) { s[k] = v; n++; } });
    var m = A.$('#cfg-mode'); if (m) s['machine.ticketsbag'] = m.value;
    if (window.TillTheme) window.TillTheme.apply(s['ui.theme'] || 'classic');   // §36.3: the theme applies at once
    A.saveStore(); A.log('§TILL_SETUP_SAVE till=' + A.S.cfg.tillKey + ' changed=' + n + ' mode=' + s['machine.ticketsbag']); A.msg('Saved. A changed Tickets mode applies at the next start.', 'ok'); return s;
  }
  function init(api) {
    A = api; A.hooks.setup = render; if (window.TillTheme) window.TillTheme.apply(bag()['ui.theme'] || 'classic');   // §36.3: the device's own choice, classic when none was made
    document.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('button'); if (!b) return;
      if (b.id === 'cfg-open') A.go('setup'); else if (b.id === 'cfg-save') save(); else if (b.id === 'cfg-back') A.go('menu'); else if (b.hasAttribute('data-cfg-tab')) { render.tab = b.getAttribute('data-cfg-tab'); render(); }
    });
    window.TillSetup = { keys: K, modes: MODES, render: render, save: save, bag: bag, count: function () { return K.length; } };
  }
  window.TillSetupInit = init;
})();
