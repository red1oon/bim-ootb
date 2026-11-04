// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — till_theme.js: the till's look as DATA (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §36.1, §36.3, §36.2). READ THE LOG (§TILL_THEME lines of erp/tests/witness_till_theme.js).
// uniCenta 5.0 JPanelConfigGeneral.java:78-84,120-125,158-160 ("Look and Feel", key swing.defaultlaf) revived as a CSS-variable theme per entry. 'classic' = the owner's 2011 Openbravo POS screen, every value
// extracted from the pixels of ~/Downloads/openbravoPOSGuide.pdf p23 (/tmp/theme_logs/palette_p23.log, §36.1 table; the source row is the comment of each value). 'modern' = the till's look before §36 (the values the
// stylesheet carried), kept as the second theme. The choice is device-local (§29.D.1): setup['ui.theme'] in the device store, mirrored to localStorage 'till.theme' so the first paint already wears it.
'use strict';
(function (root) {
  var GRAD = function (a, b, c) { return 'linear-gradient(' + a + ', ' + b + ' 50%, ' + c + ')'; };
  var THEMES = {
    classic: { label: 'Classic (2011)', vars: {
      '--bg': '#EEEEEE',                                    // p23 window_bg_titlebar / left_menu_body / catalog_bg
      '--pn': '#FFFFFF',                                    // p23 ticket_row_unselected / totals_field / clock_field
      '--fg': '#343434',                                    // p23 label_text_Subtotal_Total, menu_text_Sales
      '--ln': '#8090A1',                                    // p23 button_gradient_print y833 (outline)
      '--mut': '#667',
      '--acc': '#391CAA',                                   // p23 keypad_CE_text
      '--btn': GRAD('#F8FAFC', '#E1EBF5', '#C7D8EC'),       // p23 button_gradient_print y785 / y800 / y822
      '--btn-ln': '#8090A1', '--btn-fg': '#343434', '--btn-rad': '3px',
      '--go-bg': GRAD('#F8FAFC', '#E1EBF5', '#C7D8EC'), '--go-fg': '#391CAA',
      '--on-bg': '#B9CEE7', '--on-fg': '#343434',           // p23 category_row_selected
      '--sel': '#B9CEE7',                                   // p23 ticket_row_selected
      '--key-fg': '#391CAA', '--key-fw': '700',             // p23 keypad_CE_text
      '--bar': '#EEEEEE', '--bar-ln': '#B7C0C9',            // p23 window_bg_titlebar / window_hairline_under_titlebar
      '--chip-bg': '#FFFFFF',                               // p23 clock_field
      '--field-bg': '#FFFFFF', '--field-ln': '#8090A1', '--field-bw': '1px', '--field-pad': '0 6px',   // p23 totals_field
      '--tile-bg': GRAD('#F8FAFC', '#F8FAFC', '#BBD0E8'), '--tile-ic': '#8090A1',   // p23 tile_gradient y1328 / y1407
      '--lm-bg': '#EEEEEE', '--hdr-bg': 'linear-gradient(#F1F5F9, #C7D8EC)'          // p23 left_menu_body / menu_section_header y812 / y782
    } },
    modern: { label: 'Modern', vars: {   // the till's look before §36 (till.html's hard-coded values)
      '--bg': '#f0f0f0', '--pn': '#fff', '--fg': '#111', '--ln': '#9aa', '--mut': '#667', '--acc': '#2a6db0',
      '--btn': '#e8eef5', '--btn-ln': '#9aa', '--btn-fg': '#000', '--btn-rad': '4px', '--go-bg': '#2a6db0', '--go-fg': '#fff', '--on-bg': '#2a6db0', '--on-fg': '#fff', '--sel': '#cfe3ff',
      '--key-fg': '#000', '--key-fw': '400', '--bar': '#dde', '--bar-ln': '#9aa', '--chip-bg': 'transparent',
      '--field-bg': 'transparent', '--field-ln': 'transparent', '--field-bw': '0px', '--field-pad': '0',
      '--tile-bg': '#e8eef5', '--tile-ic': 'currentColor', '--lm-bg': '#dde', '--hdr-bg': '#cdd'
    } }
  };
  var DEFAULT = 'classic';
  function names() { return Object.keys(THEMES); }
  function apply(name) {
    if (!THEMES[name]) name = DEFAULT;
    var el = document.documentElement, v = THEMES[name].vars; Object.keys(v).forEach(function (k) { el.style.setProperty(k, v[k]); });
    el.setAttribute('data-theme', name);
    try { localStorage.setItem('till.theme', name); } catch (e) { /* private window */ }
    if (root.console) console.log('§TILL_THEME applied=' + name + ' vars=' + Object.keys(v).length);
    return name;
  }
  var early = DEFAULT; try { early = localStorage.getItem('till.theme') || DEFAULT; } catch (e) { /* none */ }
  if (typeof document !== 'undefined') apply(early);   // before first paint: this script is loaded in <head>-order before the till boots
  root.TillTheme = { THEMES: THEMES, DEFAULT: DEFAULT, names: names, apply: apply };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TillTheme;
})(typeof window !== 'undefined' ? window : globalThis);
