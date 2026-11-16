'use strict';
// ⚠ DO NOT REMOVE — Implementing bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §2 (P1, the Help read layer). Witness: W-HELP-CATALOG (erp/tests/witness_help_catalog.js).
// Pure: takes q(sql) -> rows (a handle of the door, the page or a test). Reads the dictionary, changes nothing, invents nothing.
// help(level, {fieldId|columnId|elementId}) -> {text, source, derived}; level 'short' = Description chain, 'student' = Help chain, then Description chain, then a derived tip.
const BREAK = (typeof process !== 'undefined' && process.env && (process.env.HELP_BREAK || process.env.FH_BREAK)) || '';
const blank = (s) => s == null || String(s).trim() === '';

function makeResolver(q) {
  const el = new Map(), col = new Map(), fld = new Map(), ref = new Map(), lists = new Map(), reft = new Map();
  q('SELECT ad_element_id id, name, description d, help h FROM ad_element').forEach((r) => el.set(r.id, r));
  q('SELECT ad_column_id id, ad_element_id e, columnname n, description d, help h, ad_reference_id rf, ad_reference_value_id rv, ismandatory m, defaultvalue df FROM ad_column').forEach((r) => col.set(r.id, r));
  q('SELECT ad_field_id id, ad_column_id c, name nm, description d, help h, entitytype et FROM ad_field').forEach((r) => fld.set(r.id, r));
  q('SELECT ad_reference_id id, name FROM ad_reference').forEach((r) => ref.set(r.id, r.name));
  q("SELECT ad_reference_id rv, value v, name n FROM ad_ref_list WHERE isactive='Y' ORDER BY ad_reference_id, value").forEach((r) => { (lists.get(r.rv) || lists.set(r.rv, []).get(r.rv)).push(r); });
  q('SELECT r.ad_reference_id rv, t.tablename tn FROM ad_ref_table r JOIN ad_table t ON t.ad_table_id = r.ad_table_id').forEach((r) => reft.set(r.rv, r.tn));

  function chain(kind, o) { // the stored texts to try, nearest first
    const c = o.columnId != null ? col.get(o.columnId) : (o.fieldId != null ? col.get((fld.get(o.fieldId) || {}).c) : null);
    const f = o.fieldId != null ? fld.get(o.fieldId) : null;
    const e = o.elementId != null ? el.get(o.elementId) : (c ? el.get(c.e) : null);
    const k = kind === 'h' ? 'h' : 'd';
    return [['field', f && f[k]], ['column', c && c[k]], ['element', e && e[k]]];
  }
  function derive(o) { // facts only; null when nothing beyond the type is known
    const c = o.columnId != null ? col.get(o.columnId) : (o.fieldId != null ? col.get((fld.get(o.fieldId) || {}).c) : null);
    if (!c) return null;
    const bits = [], type = ref.get(c.rf);
    if (String(c.m) === 'Y') bits.push('Required.');
    if (c.rf === 17 && lists.get(c.rv)) bits.push('One of: ' + lists.get(c.rv).map((x) => x.v + ' (' + x.n + ')').join(', ') + '.');
    if (c.rf === 19) bits.push('Refers to a ' + String(c.n).replace(/_ID$/, '') + ' record.');
    if ((c.rf === 18 || c.rf === 30) && reft.get(c.rv)) bits.push('Refers to a ' + reft.get(c.rv) + ' record.');
    if (!blank(c.df)) bits.push('Default: ' + c.df + '.');
    return bits.length ? (type || 'Value') + '. ' + bits.join(' ') : null;
  }
  function help(level, o) {
    const wanted = level === 'student' ? ['h', 'd'] : ['d'];
    for (const kind of wanted) {
      for (const [src, txt] of chain(kind, o)) if (!blank(txt)) return { text: txt, source: src, derived: false };
    }
    if (level === 'student' || BREAK === 'derivealways') { const d = derive(o); if (d) return { text: d, source: 'derived', derived: true }; }
    return { text: '', source: 'none', derived: false };
  }
  // derivealways (falsifier): derive even when written text exists
  const helpOut = (level, o) => {
    const r = help(level, o);
    if (BREAK === 'derivealways' && level === 'student' && !r.derived) { const d = derive(o); if (d) return { text: d, source: 'derived', derived: true }; }
    if (BREAK === 'swaplevel') return help(level === 'student' ? 'short' : 'student', o);
    return r;
  };
  // §7 P1b: what a TWIN WINDOW shows for a field, exactly as legacy's AD_Field_v gives it: the field's OWN name, description and help, no inheritance
  // (live view: SELECT ... f.name, f.description, f.help ... ; GridFieldVO reads AD_Field_v / AD_Field_vt). null -> '' as GridField.getDescription(); text kept byte for byte (no trim:
  // legacy tests length() != 0, HelpController.java:200-203). Inheritance and derived tips (help(), above) are for the CLI and the guides only, never a twin window.
  function legacyField(fieldId) {
    const f = fld.get(fieldId); if (!f) return null;
    if (BREAK === 'fallback') { const c = col.get(f.c) || {}; return { header: f.nm == null ? '' : String(f.nm), description: String(f.d != null && f.d !== '' ? f.d : (c.d == null ? '' : c.d)), help: String(f.h != null && f.h !== '' ? f.h : (c.h == null ? '' : c.h)), entityType: f.et == null ? '' : String(f.et) }; }   // W-FIELD-HELP falsifier: the field -> column inheritance (must FAIL F4)
    return { header: f.nm == null ? '' : String(f.nm), description: f.d == null ? '' : String(f.d), help: f.h == null ? '' : String(f.h), entityType: f.et == null ? '' : String(f.et) };
  }
  return { help: helpOut, derive, legacyField, size: { elements: el.size, columns: col.size, fields: fld.size } };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { makeResolver, blank }; else if (typeof window !== 'undefined') window.HelpCatalog = { makeResolver, blank };   // the page reads the SAME file (§7)
