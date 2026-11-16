// erp/field_help.js — field tooltips + the Tool Tip help panel, the same as legacy iDempiere.
// ⚠ DO NOT REMOVE — Implementing bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §7 (P1b). Witness: W-FIELD-HELP (erp/tests/witness_field_help.js).
// ONE tooltip setter and ONE panel for every field-render path (read-only form, inline editor, grid cell editor, process parameters).
//   Tooltip = the field's Description, on the label and on the editor (WEditor.init, WEditor.java:333/339-340); none when it is empty.
//   Panel  = HelpController's Tool Tip widget (HelpController.java:136-150 onFieldTooltip, :186-230 renderToolTip): header, then the
//            description and the help, each only when not empty; the entity type only with "show technical info on help"
//            (Env.IsShowTechnicalInfOnHelp, P|IsShowTechnicalInfOnHelp); with no field focused, the message PlaceCursorIntoField.
//   Text is written as legacy writes it (raw, not escaped: the dictionary's own text, the same trust as legacy's Html component).
//   The developer's view (ColumnName · referenceType) goes to the §FIELD_HELP log line only, never to a person's tooltip.
// Falsifiers (W-FIELD-HELP): FH_BREAK=devtitle restores the old developer tooltip (F1+F2 FAIL) · nohelp leaves the panel empty (F3 FAIL).
(function (root) {
  'use strict';
  var BREAK = (typeof process !== 'undefined' && process.env && process.env.FH_BREAK) || (root && root.__FH_BREAK) || '';
  var str = function (s) { return s == null ? '' : String(s); };
  // legacy's shape of a field for help: GridField.getHeader/getDescription/getHelp/getEntityType ('' when NULL)
  function info(f) {
    if (!f) return null;
    return { header: str(f.name != null ? f.name : f.header), description: str(f.description), help: str(f.help), entityType: str(f.entityType),
      columnName: str(f.columnName), referenceType: str(f.referenceType || f.type) };
  }
  // tooltip(f) -> the text a person sees on hover, or null for none (ZK setTooltiptext("") renders no title)
  function tooltip(f) {
    var i = info(f); if (!i) return null;
    if (BREAK === 'devtitle') return i.columnName + ' · ' + i.referenceType;
    return i.description.length !== 0 ? i.description : null;
  }
  function setTip(el, f) {
    if (!el) return;
    var t = tooltip(f);
    if (t == null) el.removeAttribute('title'); else el.title = t;
  }
  // panelHtml(f, opts) -> the Tool Tip panel's content, HelpController's own markup
  //   opts: { tech: bool (IsShowTechnicalInfOnHelp), place: the PlaceCursorIntoField text }
  function panelHtml(f, opts) {
    opts = opts || {};
    var i = info(f), s = '<div class="help-content">';
    if (BREAK === 'nohelp') return s + '</div>';
    if (!i || i.header.trim().length === 0) return s + '<p><em>(' + str(opts.place) + ')</em></p></div>';
    s += '<p><strong>' + i.header + '</strong></p>';
    if (i.description.trim().length > 0) s += '<p><i>' + i.description + '</i></p>';
    if (i.help.trim().length > 0) s += '<p>' + i.help + '</p>';
    if (opts.tech && i.entityType.trim().length > 0) s += '<p class="help-entitytype">[ ' + i.entityType + ' ]</p>';
    return s + '</div>';
  }
  // ---- the page side: register an element for a field, and one panel that follows focus ----
  var _reg = (typeof WeakMap !== 'undefined') ? new WeakMap() : null, _panel = null, _opts = {}, _shown = null;
  function attach(el, f, focusable) {
    if (!el || !f) return;
    setTip(el, f);
    if (_reg) _reg.set(el, f);
    if (focusable && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');   // a read-only value still takes focus (legacy's read-only editors do)
  }
  // attachIn(host, fieldFor): after a crud render, the label and the editor of each [data-row] get the field's tooltip and panel entry
  function attachIn(host, fieldFor) {
    if (!host || typeof fieldFor !== 'function') return 0;
    var n = 0, rows = host.querySelectorAll('[data-row]');
    for (var r = 0; r < rows.length; r++) {
      var col = rows[r].getAttribute('data-row'), f = fieldFor(col); if (!f) continue;
      var lbl = rows[r].querySelector('.cfl'); if (lbl) attach(lbl, f);
      var ed = rows[r].querySelector('input[data-col],select[data-col],textarea[data-col]'); if (ed) attach(ed, f);
      n++;
    }
    // a lone grid-cell editor (crud_overlay.editCell) has no [data-row]: its editor carries data-col
    if (!rows.length) { var e1 = host.querySelector('input[data-col],select[data-col],textarea[data-col]'); if (e1) { var f1 = fieldFor(e1.getAttribute('data-col')); if (f1) { attach(e1, f1); n++; } } }
    return n;
  }
  function fieldOf(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentNode) { var f = _reg && _reg.get(e); if (f) return f; }
    return null;
  }
  function show(f) {
    _shown = f || null;
    if (!_panel) return;
    _panel.innerHTML = panelHtml(_shown, _opts);
    var i = info(_shown);
    console.log('§FIELD_HELP focus=' + (i ? i.columnName + ' · ' + i.referenceType + ' header=' + JSON.stringify(i.header) + ' desc=' + i.description.length + ' help=' + i.help.length : 'none'));
  }
  // bindPanel(panelEl, scopeEl, opts): the panel follows focus inside scopeEl; opts {tech, place}
  function bindPanel(panelEl, scopeEl, opts) {
    _panel = panelEl; _opts = opts || {};
    show(null);
    if (scopeEl && !scopeEl.__fhBound) {
      scopeEl.__fhBound = true;
      scopeEl.addEventListener('focusin', function (ev) { var f = fieldOf(ev.target); if (f) show(f); });
    }
  }
  var api = { info: info, tooltip: tooltip, setTip: setTip, panelHtml: panelHtml, attach: attach, attachIn: attachIn, bindPanel: bindPanel, show: show,
    fieldOf: fieldOf, shown: function () { return _shown; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else if (root) root.FieldHelp = api;
})(typeof window !== 'undefined' ? window : this);
