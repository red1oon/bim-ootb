// common/door/lang_rule.js — the CLI's chosen language, legacy's order, written ONCE.
// ⚠ DO NOT REMOVE — Implementing bim-compiler prompts/CLI_ERP_IVR.md §30 (the order, owned by the CLI session) for prompts/VOCAB_MESSAGE_CATALOG.md §13 (erp.ask). Witness: W-ERP-ASK L-checks.
// Legacy (LoginPanel.java:625/235/237): (1) the user's saved AD_Preference 'Language' (PreferenceFor W, no window, no process), (2) else the browser's accept-language, (3) else the System client's language.
// The twin at the terminal (§30, DECIDED: no login by default): (1) only when a user is STATED (a login), (2) LANG (the terminal's accept-language), (3) client 0's ad_language; the seed has no client 0
//   row (measured 2026-11-16), so (3) falls to the session's client, then en_US, and the answer says which step decided. A `--lang` flag overrides all of them (a person's explicit choice).
// chosen(rows, {lang, user, client, env}) -> { lang: 'zh_CN', by: 'flag'|'preference'|'LANG'|'client0'|'client'|'default' }. rows(sql) -> [{...lowercased}].
'use strict';
// 'zh_CN.UTF-8' -> 'zh_CN', 'zh-CN' -> 'zh_CN', 'de' -> 'de'; C / POSIX / empty -> null (no language stated)
function norm(s) {
  const t = String(s == null ? '' : s).trim().split('.')[0].split('@')[0].replace('-', '_'); if (!t || /^(C|POSIX)$/i.test(t)) return null;
  const m = /^([a-zA-Z]{2,3})(?:_([a-zA-Z]{2}))?$/.exec(t); if (!m) return null; return m[1].toLowerCase() + (m[2] ? '_' + m[2].toUpperCase() : '');
}
function chosen(rows, o) {
  o = o || {}; const env = o.env || {};
  const f = norm(o.lang); if (f) return { lang: f, by: 'flag' };
  if (o.user != null && String(o.user) !== '') {
    let r = []; try { r = rows("SELECT value FROM ad_preference WHERE attribute='Language' AND isactive='Y' AND ad_user_id=" + Number(o.user) + " AND ad_window_id IS NULL AND ad_process_id IS NULL"); } catch (e) { r = []; }
    const p = r.length ? norm(r[0].value) : null; if (p) return { lang: p, by: 'preference' };
  }
  const l = norm(env.LANG); if (l) return { lang: l, by: 'LANG' };
  const c = (id) => { try { const r = rows('SELECT ad_language FROM ad_client WHERE ad_client_id=' + Number(id)); return r.length ? norm(r[0].ad_language) : null; } catch (e) { return null; } };
  const c0 = c(0); if (c0) return { lang: c0, by: 'client0' };
  if (o.client != null) { const cs = c(o.client); if (cs) return { lang: cs, by: 'client' }; }
  return { lang: 'en_US', by: 'default' };
}
module.exports = { chosen, norm };
