// erp/ad_statusline.js — the twin of legacy's status-bar info line (S7, bim-ootb prompts/CAPEX_DASHBOARD.md §5.47). Generic: it names no window, tab or table; everything comes from AD_StatusLineUsedIn + AD_StatusLine + AD_Message.
// Ports (legacy source ~/idempiere-dev-setup/idempiere/org.adempiere.base/src/org/compiere/model): MStatusLine.getSL :138-190 (window+tab, then window with tab NULL, then table; IsStatusLine='Y', both rows active),
//   MStatusLine.parseLine :254-322 (@Col@ context into the SQL — an unresolved one returns null; first row; numbers for number/choice formats, strings otherwise; java.text.MessageFormat), GridTab.getStatusLine :2036-2046.
// host contract: rows(sql) -> array of row arrays (first result set), or throws. ctx(name) -> value of the current record's column (case-insensitive) or undefined.
(function (root) {
  'use strict';
  function getSL(rows, windowId, tabId, tableId) {
    var base = 'SELECT slu.ad_statusline_id FROM ad_statuslineusedin slu JOIN ad_statusline sl ON sl.ad_statusline_id=slu.ad_statusline_id WHERE slu.isactive=\'Y\' AND sl.isactive=\'Y\' AND slu.isstatusline=\'Y\' AND ';
    var qs = [base + 'slu.ad_window_id=' + Number(windowId) + ' AND slu.ad_tab_id=' + Number(tabId), base + 'slu.ad_window_id=' + Number(windowId) + ' AND slu.ad_tab_id IS NULL', base + 'slu.ad_table_id=' + Number(tableId)];
    for (var i = 0; i < qs.length; i++) { var r = rows(qs[i]); if (r && r.length && r[0][0] > 0) return Number(r[0][0]); }   // getSQLValueEx: the first row's first column
    return null;
  }
  // Env.parseContext(ctx, windowNo, sql, onlyWindow=false, ignoreUnparsable=false): any @X@ that has no value makes the whole statement empty
  function parseContext(sql, ctx) {
    var bad = false, out = sql.replace(/@([^@\s]+)@/g, function (m, n) { var v = ctx(n); if (v == null || v === '') { bad = true; return ''; } return String(v); });
    return bad ? '' : out;
  }
  function halfEven(x, d) { var f = Math.pow(10, d), s = x * f, r = Math.round(s); if (Math.abs(s % 1) === 0.5 && r % 2 !== 0) r -= 1; return r / f; }
  function group(i) { return i.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function decimal(x, pat) {   // DecimalFormat for '#,##0.00', '#.#', '#,##0.###' (the patterns the dictionary uses)
    var m = /^([#,0]*)(?:\.([#0]*))?$/.exec(pat); if (!m) return String(x);
    var minF = ((m[2] || '').match(/0/g) || []).length, maxF = (m[2] || '').length, minI = ((m[1].replace(/,/g, '')).match(/0/g) || []).length, grp = m[1].indexOf(',') >= 0;
    var neg = x < 0, v = halfEven(Math.abs(x), maxF), s = v.toFixed(maxF), p = s.split('.'), ip = p[0], fp = p[1] || '';
    while (fp.length > minF && fp.charAt(fp.length - 1) === '0') fp = fp.slice(0, -1);
    while (ip.length < minI) ip = '0' + ip; if (grp) ip = group(ip);
    return (neg && (Number(v) !== 0) ? '-' : '') + ip + (fp ? '.' + fp : '');
  }
  function choice(x, spec, fmt) {   // ChoiceFormat '0#a|1#b|1<c' (limits ascending; '<' is strictly greater)
    var parts = spec.split('|'), best = null; for (var i = 0; i < parts.length; i++) { var m = /^\s*(-?[\d.]+)\s*([#<≤])(.*)$/.exec(parts[i]); if (!m) continue; var lim = Number(m[1]), ok = m[2] === '<' ? x > lim : x >= lim; if (ok) best = m[3]; }
    if (best == null) { var f = /^\s*(-?[\d.]+)\s*[#<≤](.*)$/.exec(parts[0]); best = f ? f[2] : ''; }
    return best.indexOf('{') >= 0 ? fmt(best) : best;
  }
  // java.text.MessageFormat: {n}, {n,number}, {n,number,pattern|currency|integer|percent}, {n,choice,spec}; '' is a quote, 'x' quotes
  function split(pat) {   // [{t:'text'|'arg', ...}] with brace nesting for choice
    var out = [], i = 0, buf = '';
    while (i < pat.length) {
      var c = pat.charAt(i);
      if (c === "'") { if (pat.charAt(i + 1) === "'") { buf += "'"; i += 2; continue; } var j = pat.indexOf("'", i + 1); if (j < 0) j = pat.length; buf += pat.slice(i + 1, j); i = j + 1; continue; }
      if (c === '{') { var d = 1, j2 = i + 1; while (j2 < pat.length && d) { if (pat.charAt(j2) === '{') d++; else if (pat.charAt(j2) === '}') d--; j2++; } if (buf) out.push({ t: 'text', s: buf }); buf = ''; out.push({ t: 'arg', s: pat.slice(i + 1, j2 - 1) }); i = j2; continue; }
      buf += c; i++;
    }
    if (buf) out.push({ t: 'text', s: buf }); return out;
  }
  function argTypes(pat) {   // per argument index: 'number' | 'choice' | 'plain' (what parseLine uses to pick getBigDecimal vs getString)
    var t = {}; split(pat).forEach(function (p) { if (p.t !== 'arg') return; var a = p.s.split(','), n = Number(a[0].trim()); var k = (a[1] || '').trim(); t[n] = (k === 'number' || k === 'choice') ? 'number' : t[n] || 'plain'; if (k === 'choice') { var spec = a.slice(2).join(','); split(spec.replace(/^[^#<]*/, '')).forEach(function () {}); (spec.match(/\{(\d+)[^}]*\}/g) || []).forEach(function (g) { var nn = Number(/\d+/.exec(g)[0]); if (t[nn] == null) t[nn] = 'plain'; }); } });
    return t;
  }
  function format(pat, args) {
    return split(pat).map(function (p) {
      if (p.t === 'text') return p.s;
      var a = p.s.split(','), n = Number(a[0].trim()), k = (a[1] || '').trim(), sty = a.slice(2).join(',').trim(), v = args[n];
      if (v == null) return 'null';
      if (!k) return typeof v === 'number' ? decimal(v, '#,##0.###') : String(v);
      if (k === 'number') { v = Number(v); if (!sty) return decimal(v, '#,##0.###'); if (sty === 'currency') return (v < 0 ? '(' : '') + '$' + decimal(Math.abs(v), '#,##0.00') + (v < 0 ? ')' : ''); if (sty === 'integer') return decimal(halfEven(v, 0), '#,##0'); if (sty === 'percent') return decimal(halfEven(v * 100, 0), '#,##0') + '%'; return decimal(v, sty); }
      if (k === 'choice') return choice(Number(v), a.slice(2).join(','), function (s) { return format(s, args); });
      return String(v);
    }).join('');
  }
  // the one entry: a ready line (HTML text) or null
  function line(o) {   // {rows, windowId, tabId, tableId, ctx}
    var id = getSL(o.rows, o.windowId, o.tabId, o.tableId); if (id == null) return null;
    var h = o.rows('SELECT sl.sqlstatement, m.msgtext FROM ad_statusline sl JOIN ad_message m ON m.ad_message_id=sl.ad_message_id WHERE sl.ad_statusline_id=' + id); if (!h || !h.length) return null;
    var sql = h[0][0], pat = h[0][1]; if (sql == null || pat == null) return null;
    if (sql.indexOf('@') >= 0) { sql = parseContext(sql, o.ctx); if (!sql.length) return null; }
    var r; try { r = o.rows(sql); } catch (e) { return null; }   // legacy logs the SQLException and returns null
    if (!r || !r.length) return null;
    var ty = argTypes(pat), args = [], mx = -1; Object.keys(ty).forEach(function (k) { mx = Math.max(mx, Number(k)); });
    for (var i = 0; i <= mx; i++) { var v = r[0][i]; args[i] = v == null ? null : (ty[i] === 'number' ? Number(v) : String(v)); }
    return format(pat, args);
  }
  var API = { getSL: getSL, parseContext: parseContext, format: format, line: line, argTypes: argTypes, _decimal: decimal };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.AdStatusLine = API;
})(typeof window !== 'undefined' ? window : globalThis);
