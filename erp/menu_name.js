// erp/menu_name.js — the ONE rule for a menu entry's name in a language (the page's menu, the help pack builder).
// ⚠ DO NOT REMOVE — Implementing bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.14 (b). Witness: W-HQ-MENU-LEAVES M2 (common/help/tests/witness_hq_menu_leaves.js).
// READ THE LOG after every change; an exit code is not evidence.
// iDempiere's rule (SynchronizeTerminology): a centrally-maintained W/P/R/X menu entry takes its window / process / form translation;
// any other entry its own AD_Menu_Trl row; then the labelled machine supplement AD_Menu_Trl_m (the published pack always wins).
// of(node, pack, central) -> { name, machine }   node = {id, action, windowId, processId, formId}; pack = the screen pack (erp/i18n/<lang>.json) or null;
// central = AD_Menu.IsCentrallyMaintained='Y'. name = null when the pack has no translation (the caller shows the English name).
(function (root) {
  'use strict';
  function trl(pack, table, id) { if (!pack || id == null) return null; var t = pack[table + '_Trl']; if (!t) return null; var v = t[String(Math.round(Number(id)))]; return v == null ? null : v; }
  function of(node, pack, central) {
    var v = null;
    if (central) {
      if (node.action === 'W' && node.windowId) v = trl(pack, 'AD_Window', node.windowId);
      else if ((node.action === 'P' || node.action === 'R') && node.processId) v = trl(pack, 'AD_Process', node.processId);
      else if (node.action === 'X' && node.formId) v = trl(pack, 'AD_Form', node.formId);
    }
    v = v || trl(pack, 'AD_Menu', node.id);
    if (v) return { name: v, machine: false };
    var m = (pack && pack.AD_Menu_Trl_m) ? pack.AD_Menu_Trl_m[String(Math.round(Number(node.id)))] : null;
    return { name: m == null ? null : m, machine: m != null };
  }
  var api = { of: of };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else if (root) root.MenuName = api;
})(typeof window !== 'undefined' ? window : this);
