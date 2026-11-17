/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// common/help/help_panel.js — THE help panel, shared by the Viewer and the Modeller (bim-compiler
// prompts/VOCAB_MESSAGE_CATALOG.md §14.3-§14.5). Moved out of viewer/scene.js showCommandPalette; nothing app-specific here.
// It owns: the dock (warm AMBER glass, 85% solid so #e0e0e0/#d0d0d0 text keeps WCAG 4.5:1 over a white background too),
// stays open (Esc / F1 / × close it), search = the shared query core over the app's per-locale index (names, shortcuts, sub-rows, CLI titles, guide text), the How To blocks (guide link, CLI lines),
// reopen-as-left state (filter + opened entries, per app, in memory), drag through the ONE helper the app passes in.
// The app gives an adapter (cfg): entries(), placement, header/footer extras, hooks. Log lines are the ones the witnesses
// read: §KBD_HELP · §HOWTO_PALETTE · §HELP_DOCK · §KBD_PALETTE_RUN · §HOWTO_GUIDE_OPEN.
// cfg = {
//   id:'cmd-palette', T(k,en), icon(svg)->html, isMobile, place()->{left,top,width,height},
//   entries()->[{seq,name,icon,action,children:[{name,icon}],hkey,howto:{guide:{anchor,heading},cli:[{line,title,verb}]}}],
//   guideBase, guideIcon, runSeq(seq), makeDraggable(el), storageKey, state:{filter,open},
//   headerExtra (html), footer (html), onMount(pal, api), onOpen(pal), onClose(pal, why), onDrop(rect), noAutoFocus (bool),
//   index:{url()->string, rec?(entry)->record}  the per-locale query index (common/help/help_query.js pack; §19.4); an entry's hkey joins it to its record's go.hkey
//   §19.5: under the list ONE "Did you mean: A · B · C" line (common/help/help_dym.js + common/door/assist_core.js, loaded before this file), shown when the top result is not tier 0; a click fills the box and searches.
// }
(function (root) {
  'use strict';
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function attr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }
  // §14.8.1 (VOCAB_MESSAGE_CATALOG.md): a guide section heading's dictionary key; the same rule is in W-HOWTO H6 and trl_batch_2026-11-17_howto_headings.js
  function ghKey(anchor) { return 'howto_gh_' + String(anchor).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }

  var packs = {};   // url -> {state:'loading'|'ok'|'fail', pack, waiting[]}: one fetch per index file per page session

  function toggle(cfg) {
    var id = cfg.id || 'cmd-palette', T = cfg.T || function (k, en) { return en; }, ic = cfg.icon || function () { return ''; };
    var st = cfg.state || (cfg.state = { filter: '', open: {} });
    var existing = document.getElementById(id);
    if (existing) { if (cfg.onClose) cfg.onClose(existing, 'toggle'); existing.remove(); console.log('§KBD_HELP close via=toggle'); return null; }
    console.log('§KBD_HELP open');
    var pal = document.createElement('div');
    pal.id = id;
    var p = (!cfg.isMobile && cfg.place) ? cfg.place() : null;
    pal.style.cssText = (cfg.isMobile || !p
      ? 'position:fixed;left:0;top:0;right:0;bottom:0;border-radius:0;'
      : 'position:fixed;left:' + p.left + 'px;top:' + p.top + 'px;width:' + p.width + 'px;height:' + p.height + 'px;border-radius:12px;') +
      'z-index:10001;background:rgba(48,30,6,0.85);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);' +
      'border:1px solid rgba(255,183,77,0.35);box-shadow:0 8px 32px rgba(0,0,0,0.6);display:flex;flex-direction:column;' +
      'font-family:\'Segoe UI\',sans-serif;overflow:hidden';
    pal.innerHTML =
      '<div id="cmd-head" style="flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:8px 56px 8px 14px;color:#ffb74d;font-weight:bold;font-size:13px;cursor:grab;border-bottom:1px solid rgba(255,183,77,0.25)">' +
      '<span>' + esc(T('pill_help', 'Help')) + '</span>' +
      '<span id="cmd-close" class="bim-panel-close" title="' + attr(T('ui_close', 'Close')) + '" style="margin-left:auto;cursor:pointer;color:#d0d0d0;font-size:16px;line-height:1">×</span></div>' +
      (cfg.headerExtra || '') +
      '<div style="flex:0 0 auto;padding:10px 14px;border-bottom:1px solid rgba(255,183,77,0.25)">' +
      '<input id="cmd-search" type="text" placeholder="' + attr(T('ui_cmd_placeholder', 'Type a command...')) + '" ' +
      'style="width:100%;background:#222;color:#eee;border:1px solid #555;border-radius:6px;padding:8px 10px;font-size:13px;outline:none;box-sizing:border-box">' +
      '</div>' +
      '<div id="cmd-list" style="flex:1 1 auto;min-height:0;overflow-y:auto;padding:4px 0"></div>' +
      '<div id="cmd-dym" style="flex:0 0 auto;display:none;padding:6px 14px;font-size:12px;color:#d0d0d0;border-top:1px solid rgba(255,183,77,0.25)"></div>' +
      (cfg.footer || '');
    document.body.appendChild(pal);

    var searchInput = pal.querySelector('#cmd-search'), listEl = pal.querySelector('#cmd-list'), dymEl = pal.querySelector('#cmd-dym'), cursor = 0, currentMatches = [];
    function run(entry) {
      if (entry.action) entry.action(); else if (cfg.runSeq) cfg.runSeq(String(entry.seq || '').toLowerCase());
      console.log('§KBD_PALETTE_RUN name=' + entry.name + ' seq=' + entry.seq);
    }
    // §19.4 (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md): the search is the ONE query core (common/help/help_query.js, window.HelpQuery) over the app's per-locale index
    // (cfg.index.url(): built by the one builder from the app's adapter, fetched on the first typed query, cached). The substring filter that stood here is DELETED. A live entry the
    // pack holds no record for (a pill another module added later) is indexed from itself (cfg.index.rec(entry) or liveRec below) so nothing findable is lost; while the pack is on its
    // way the list stays whole and re-renders when it lands. A hit joins its entry through record.go.hkey; go.via marks a secondary record (a how-to heading), which never opens a row by itself.
    function entryKey(e) { return String(e.hkey || e.name); }
    function liveRec(e, kind) {   // an entry as a record: name, shortcut, sub-rows (d), CLI titles + verbs + guide paragraph (h) = every field the old filter read
      var d = (e.children || []).map(function (c) { return c.name; }).join('\n'), ht = e.howto || {};
      var h = ((ht.cli || []).map(function (c) { return c.title + '\n' + c.verb; }).concat(ht.text ? [String(ht.text).replace(/<[^>]*>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&')] : [])).join('\n');
      var r = { id: 'live/' + entryKey(e), k: kind || 'pill', n: String(e.name), go: { hkey: entryKey(e) } };
      if (e.seq) r.a = [String(e.seq)]; if (d) r.d = d; if (h) r.h = h;
      return r;
    }
    var hqCur = null;   // the last handle: {sig, h}; rebuilt only when the extra records change
    function hqHandle(all) {
      var HQ = root.HelpQuery, ix = cfg.index; if (!HQ || !ix || typeof ix.url !== 'function') return null;
      var url = ix.url(), pk = packs[url];
      if (!pk) {
        pk = packs[url] = { state: 'loading', pack: null, waiting: [] };
        fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function (j) { pk.pack = j; pk.state = 'ok'; console.log('§HELP_QUERY_LOAD url=' + url + ' records=' + (j.records || []).length + ' vocab=' + (j.vocab || []).length); })
          .catch(function (e) { pk.state = 'fail'; console.log('§HELP_QUERY_LOAD fail url=' + url + ' ' + e.message); })
          .then(function () { var w = pk.waiting; pk.waiting = []; w.forEach(function (f) { f(); }); });
      }
      if (pk.state === 'loading') { if (pk.waiting.indexOf(rerenderLater) < 0) pk.waiting.push(rerenderLater); return null; }
      var pack = pk.pack || { kinds: [], vocab: [], nospace: '', records: [] }, have = {};
      (pack.records || []).forEach(function (r) { if (r.go && r.go.hkey != null) have[String(r.go.hkey)] = 1; });
      var extra = all.filter(function (e) { return !have[entryKey(e)]; }).map(function (e) { return (ix.rec || liveRec)(e, (pack.kinds || [])[0]); });
      var sig = url + '|' + pk.state + '|' + extra.map(function (r) { return r.id + '\u0001' + r.n + '\u0001' + (r.d || '') + '\u0001' + (r.h || ''); }).join('\u0002');
      if (!hqCur || hqCur.sig !== sig) hqCur = { sig: sig, h: HQ.create(pack, { extra: extra }), extra: extra.length, state: pk.state, recs: (pack.records || []).concat(extra), names: null };
      return hqCur;
    }
    function rerenderLater() { if (api && document.getElementById(id) === pal) currentMatches = renderList(searchInput.value); }
    function renderList(filter) {
      var f = (filter || '').toLowerCase(), all = cfg.entries ? cfg.entries() : [], matches = all, how = 'all', dym = [];
      all.forEach(function (e) { e.seq = e.seq || ''; e._openForMatch = false; });
      if (f.trim()) {
        var cur = hqHandle(all);
        if (cur) {
          var byKey = {}, seen = {}, prim = {}, res = cur.h.query(f); matches = []; how = 'core:' + cur.state;
          all.forEach(function (e) { byKey[entryKey(e)] = e; });
          res.forEach(function (hit) {
            var g = hit.rec.go, e = g && byKey[String(g.hkey)]; if (!e) return;
            if (hit.tier < 3 && !g.via) prim[entryKey(e)] = 1;   // the entry's own name / shortcut matched: nothing to open to show why
            if (!seen[entryKey(e)]) { seen[entryKey(e)] = 1; matches.push(e); }
          });
          // §14.3: a word that is only in a bullet, a CLI title or a guide paragraph finds its entry, shown opened so the reason is visible
          matches.forEach(function (e) { if (!prim[entryKey(e)]) e._openForMatch = true; });
          // §19.5: ONE separate line "Did you mean: A · B · C" (common/help/help_dym.js, shared with the ERP box) when the top result is not tier 0. The pack's names; `a` here is the shortcut key, not a name.
          if (root.HelpDym) { if (!cur.names) cur.names = root.HelpDym.names(cur.recs, { alt: false }); dym = root.HelpDym.suggest(f, cur.names, res.length ? res[0].tier : 3); }
        } else how = 'wait';
      }
      var nGuide = 0, nCli = 0, en = /^en\b/i.test(document.documentElement.lang || 'en');
      listEl.innerHTML = '';
      if (dymEl) {   // a pick puts the name in the box and searches (the person's act); nothing runs
        if (root.HelpDym) root.HelpDym.render(dymEl, dym, T('ui_help_dym', 'Did you mean'), function (nm) {
          searchInput.value = nm; st.filter = nm; cursor = 0; currentMatches = renderList(nm); if (!cfg.isMobile && !cfg.noAutoFocus) searchInput.focus();
        });
        dymEl.style.display = dym.length ? 'block' : 'none';
        if (dym.length) console.log('§HELP_DYM line=' + JSON.stringify(dym) + ' filter="' + f + '"');
      }
      matches.forEach(function (entry, i) {
        var row = document.createElement('div');
        row.className = 'cmd-row';
        row.setAttribute('data-idx', String(i));
        row.style.cssText = 'padding:8px 14px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;font-size:13px;color:#e0e0e0;' +
          (i === cursor ? 'background:rgba(255,183,77,0.18)' : '');
        row.innerHTML = '<span style="display:flex;align-items:center;gap:8px">' + (entry.icon || '') + entry.name + '</span>' +
          (entry.seq ? '<kbd style="background:#333;color:#4fc3f7;padding:2px 8px;border-radius:4px;font-family:monospace;font-size:12px;border:1px solid #555">' + entry.seq + '</kbd>' : '');
        row.addEventListener('click', function (e) {
          // left zone (bar + icon, < 36 px) opens / closes the entry; the rest runs it (the panel stays open)
          if (entry._childDiv) {
            var rect = row.getBoundingClientRect();
            if (e.clientX - rect.left < 36) {
              var open = entry._childDiv.style.display !== 'none';
              entry._childDiv.style.display = open ? 'none' : 'block';
              if (entry._bar) entry._bar.style.background = open ? '#4fc3f7' : '#f44336';
              st.open[entry.hkey || entry.name] = !open;   // §14.4 reopen as left
              return;
            }
          }
          run(entry);
        });
        row.addEventListener('mouseenter', function () { cursor = i; highlightRows(); });
        listEl.appendChild(row);
        var ht = entry.howto, hasHt = !!(ht && (ht.guide || ht.text || (ht.cli && ht.cli.length)));
        if ((entry.children && entry.children.length) || hasHt) {
          var childDiv = document.createElement('div');
          var wasOpen = !!(entry._openForMatch || st.open[entry.hkey || entry.name]);
          childDiv.style.cssText = 'display:' + (wasOpen ? 'block' : 'none') + ';padding:2px 14px 4px 28px;background:rgba(255,255,255,0.03);border-left:2px solid rgba(255,183,77,0.25);margin-left:14px';
          (entry.children || []).forEach(function (c) {
            var ch = document.createElement('div');
            ch.style.cssText = 'font-size:12px;color:#d0d0d0;padding:3px 0;display:flex;align-items:center;gap:6px';
            ch.innerHTML = (c.icon ? ic(c.icon) : '') + '<span>' + c.name + '</span>';
            childDiv.appendChild(ch);
          });
          if (ht && ht.text) {   // §14.5: a guide paragraph shipped inside the app (the Modeller's own guide sections)
            var tx = document.createElement('div'); tx.className = 'cmd-howto-text';
            tx.style.cssText = 'font-size:12px;color:#d0d0d0;padding:3px 0;line-height:1.5';
            tx.innerHTML = ht.text;
            childDiv.appendChild(tx);
          }
          if (ht && ht.guide && cfg.guideBase) {   // §14.3 the guide section that explains this tool (the guide is English only — said so)
            nGuide++;
            var g = document.createElement('div'); g.className = 'cmd-howto-guide';
            g.style.cssText = 'font-size:12px;padding:3px 0';
            g.innerHTML = '<a href="' + cfg.guideBase + '#' + ht.guide.anchor + '" target="_blank" rel="noopener" title="' + attr(T('ui_howto_guide', 'Guide')) + ': ' +
              attr(T(ghKey(ht.guide.anchor), ht.guide.heading)) + '" style="color:#ffb74d">' + (cfg.guideIcon ? ic(cfg.guideIcon) : '') + ' ' +
              (en ? T('ui_howto_guide', 'Guide') : T('ui_howto_guide_en', 'Guide (English)')) + '</a>';
            g.addEventListener('click', function (ev) { ev.stopPropagation(); console.log('§HOWTO_GUIDE_OPEN pill=' + entry.name + ' anchor=' + ht.guide.anchor); });
            childDiv.appendChild(g);
          }
          if (ht && ht.cli && ht.cli.length) {   // §14.3 the same answer at the CLI: door verbs stay English (§0)
            nCli++;
            var c0 = document.createElement('div'); c0.className = 'cmd-howto-cli';
            c0.style.cssText = 'font-size:11px;color:#d0d0d0;padding:4px 0 2px';
            c0.textContent = T('ui_howto_cli', 'Same at the CLI');
            childDiv.appendChild(c0);
            ht.cli.forEach(function (c) {
              var l = document.createElement('div');
              l.className = 'cmd-howto-cli-line'; l.style.cssText = 'font-size:11px;padding:1px 0';
              l.innerHTML = '<code style="color:#c5e1a5;background:#1a1a2a;padding:1px 4px;border-radius:3px">' + esc(c.line) + '</code>';
              childDiv.appendChild(l);
            });
          }
          row.style.position = 'relative';
          var bar = document.createElement('span');
          bar.style.cssText = 'position:absolute;left:4px;top:50%;transform:translateY(-50%);width:3px;height:16px;background:' + (wasOpen ? '#f44336' : '#4fc3f7') + ';border-radius:1px';
          row.appendChild(bar);
          entry._childDiv = childDiv; entry._bar = bar;
          listEl.appendChild(childDiv);
        }
      });
      console.log('§HOWTO_PALETTE entries=' + matches.length + ' guide=' + nGuide + ' cli=' + nCli + ' loaded=' + !!cfg.howtoLoaded + ' filter="' + f + '" via=' + how);
      return matches;
    }
    function highlightRows() {
      var rows = listEl.querySelectorAll('.cmd-row');
      for (var i = 0; i < rows.length; i++) rows[i].style.background = (i === cursor) ? 'rgba(255,183,77,0.18)' : '';
    }
    function close(why) { if (cfg.onClose) cfg.onClose(pal, why); pal.remove(); console.log('§KBD_HELP close via=' + why); }
    var api = { pal: pal, rerender: function () { if (document.getElementById(id) === pal) currentMatches = renderList(searchInput.value); }, close: close };

    searchInput.value = st.filter;   // §14.4 reopen as left
    currentMatches = renderList(st.filter);
    pal.querySelector('#cmd-close').addEventListener('click', function (e) { e.stopPropagation(); close('x'); });
    if (!cfg.isMobile && typeof cfg.makeDraggable === 'function') {
      pal._dragStrip = pal.querySelector('#cmd-head').offsetHeight || 34;
      if (cfg.storageKey) pal._dragRemember = cfg.storageKey;
      pal._dragClamp = true;
      if (cfg.onDrop) pal._dragOnDrop = cfg.onDrop;
      cfg.makeDraggable(pal);
    }
    if (cfg.onMount) cfg.onMount(pal, api);
    if (cfg.onOpen) cfg.onOpen(pal);
    var pr = pal.getBoundingClientRect();
    console.log('§HELP_DOCK open left=' + Math.round(pr.left) + ' top=' + Math.round(pr.top) + ' w=' + Math.round(pr.width) + ' h=' + Math.round(pr.height) +
      ' mobile=' + !!cfg.isMobile + ' filter="' + st.filter + '" open=' + Object.keys(st.open).filter(function (k) { return st.open[k]; }).length);
    // §G5: no auto-focus on a phone (the soft keyboard is premature). §14.5 cfg.noAutoFocus: an app whose single letters are
    // shortcuts (the Modeller: ? toggles help, O/E/D run pills) keeps them working while the panel is open; click the box to search.
    if (!cfg.isMobile && !cfg.noAutoFocus) searchInput.focus();
    searchInput.addEventListener('input', function () { cursor = 0; st.filter = this.value; currentMatches = renderList(this.value); });
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'F1') { e.preventDefault(); close(e.key); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); cursor = Math.min(cursor + 1, currentMatches.length - 1); highlightRows(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); cursor = Math.max(cursor - 1, 0); highlightRows(); }
      if (e.key === 'Enter') { e.preventDefault(); var entry = currentMatches[cursor]; if (entry) run(entry); }
    });
    // §14.4: a click in the 3D view does not close it — it stays open while you work
    pal.addEventListener('click', function (e) { e.stopPropagation(); });
    return api;
  }

  var API = { toggle: toggle };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.HelpPanel = API;
})(typeof window !== 'undefined' ? window : globalThis);
