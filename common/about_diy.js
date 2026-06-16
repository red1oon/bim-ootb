/**
 * common/about_diy.js — the ONE shared About + DIY modal, mounted by every surface.
 * Copyright (c) 2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * Spec: prompts/ABOUT_BOX_CONSOLIDATE.md (in bim-compiler).
 *
 * Single source of truth (same ref → any change is one spot). Replaces: the landing's inline
 * #about-dialog + #diy-dialog, the ERP Install/Migrate pills + their picker, and the old
 * migrate_showme overlay. Mounted by:
 *   • landing index.html (About link + DIY button)
 *   • ERP Help / ShowMe pill (idempiere `showme`, erp `guide`)
 *   • viewer Help affordance (panels `help`)
 *
 * Doctrine: the DIY README is the single "what to run" — the UI hands you the download and
 * points at the README; it never re-authors commands you must keep in sync. delegate-to-install:
 * the browser never touches your DB; you run the agent natively; every value is a recorded row.
 *
 * Window API:  window.AboutDIY.open(tab?)  ·  .openAbout()  ·  .openDIY()  ·  .close()
 * Witness (console, §-log first):
 *   §ABOUT-DIY open=Y tab=<about|diy> audio=<Y|N>
 *   §ABOUT-DIY tab=<about|diy>  ·  §ABOUT-DIY diy-download os=<win|nix>  ·  §ABOUT-DIY agent=<odoo|idempiere>
 */
(function () {
  'use strict';

  // Brand — keep the existing BIM blue / ERP amber (non-invent), one dark coherent shell.
  var BLUE = '#4fc3f7', BLUE2 = '#0277bd', AMBER = '#e8a735';

  function _$(id) { return document.getElementById(id); }
  function _h(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (html != null) e.innerHTML = html;
    return e;
  }
  // SELF-CONTAINED Lucide glyphs (clean line icons, feedback_pill_icon_consistency: NO unicode). Embedded
  // VERBATIM from the registry (erp/icons.js ← viewer/panels.js, the source of truth) so this shared module
  // works identically on EVERY surface with no dependency — and never clobbers a page's own window.ICONS
  // (the viewer defines a global `ICONS` that an external icons.js would overwrite — that bug is avoided here).
  var GLYPHS = {
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    clipboard: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    xmark: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
    package: '<path d="m16.5 9.4-9-5.19"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12.01l8.73-5.05"/><path d="M12 22.08V12"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    banknote: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01"/><path d="M18 12h.01"/>',
    bomb: '<circle cx="11" cy="13" r="9"/><path d="M14.35 4.65 16.3 2.7a2.41 2.41 0 0 1 3.4 0l1.6 1.6a2.4 2.4 0 0 1 0 3.4l-1.95 1.95"/><path d="m22 22-1.5-1.5"/><path d="m19 8 1-1"/>',
    grid: '<path d="M3 3h18v18H3z"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/>',
    layout: '<rect width="18" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/>',
    arrowRightLeft: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
    route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
    search: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
    plug: '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>',
    circleHelp: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>'
  };
  function _ico(name, size, color) {
    var d = GLYPHS[name]; if (!d) return '';
    var s = size || 16;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="'
      + (color || 'currentColor') + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
      + ' style="vertical-align:middle;flex:0 0 auto">' + d + '</svg>';
  }

  // ── tasteful self-contained "ring" — a soft two-note FM-ish bell (no files, no deps). ──
  // open() is driven by a click so the AudioContext is gesture-allowed; silently no-ops otherwise.
  function _ring() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      var c = new AC(), t0 = c.currentTime;
      var rev = c.createGain(); rev.gain.value = 0.9; rev.connect(c.destination);
      [ [880, 0], [1318.5, 0.085] ].forEach(function (n) {  // A5 → E6, a gentle rising ding
        var o = c.createOscillator(), g = c.createGain(), t = t0 + n[1];
        o.type = 'sine'; o.frequency.setValueAtTime(n[0], t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
        o.connect(g); g.connect(rev); o.start(t); o.stop(t + 0.6);
      });
      setTimeout(function () { try { c.close(); } catch (e) {} }, 1200);
      return true;
    } catch (e) { return false; }
  }

  var _overlay = null, _tab = 'about';

  function open(tab) {
    _tab = (tab === 'diy') ? 'diy' : 'about';
    if (_overlay) close();
    _injectStyle();
    _overlay = _h('div', { id: 'adq-overlay', 'class': 'adq-overlay' });
    _overlay.innerHTML =
      '<div class="adq-card" role="dialog" aria-label="About BIM/ERP OOTB">'
      + '<button id="adq-x" class="adq-x" aria-label="Close">' + _ico('xmark', 17) + '</button>'
      + '<div class="adq-brand">'
      + '<span class="adq-logo adq-bim">BIM</span><span class="adq-slash">/</span>'
      + '<span class="adq-logo adq-erp">ERP</span>'
      + '<span class="adq-ootb">out&nbsp;of&nbsp;the&nbsp;box</span></div>'
      + '<div class="adq-tag">Frictionless PWA · offline-capable · no server · SQLite + WASM</div>'
      + '<div class="adq-seg" id="adq-seg">'
      + '<button class="adq-segb" data-tab="about">About</button>'
      + '<button class="adq-segb" data-tab="diy">Run it yourself (DIY)</button>'
      + '</div>'
      + '<div id="adq-body" class="adq-body"></div>'
      + '<div class="adq-foot">'
      + '<a href="mailto:red1org@gmail.com" class="adq-fl">Email</a>'
      + '<a href="https://github.com/red1oon/bim-ootb" target="_blank" rel="noopener" class="adq-fl">' + _ico('share', 12) + ' GitHub</a>'
      + '<span class="adq-mit">© 2026 Redhuan D. Oon · MIT</span></div>'
      + '</div>';
    document.body.appendChild(_overlay);
    _$('adq-x').onclick = close;
    _overlay.addEventListener('click', function (e) { if (e.target === _overlay) close(); });
    Array.prototype.forEach.call(_overlay.querySelectorAll('.adq-segb'), function (b) {
      b.onclick = function () { _go(b.getAttribute('data-tab')); };
    });
    _go(_tab);
    var audio = _ring();
    console.log('§ABOUT-DIY open=Y tab=' + _tab + ' audio=' + (audio ? 'Y' : 'N'));
  }
  function openAbout() { open('about'); }
  function openDIY() { open('diy'); }
  function close() { if (_overlay) { _overlay.remove(); _overlay = null; } }

  function _go(tab) {
    _tab = (tab === 'diy') ? 'diy' : 'about';
    Array.prototype.forEach.call(_overlay.querySelectorAll('.adq-segb'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-tab') === _tab);
    });
    _$('adq-body').innerHTML = (_tab === 'diy') ? _diyHtml() : _aboutHtml();
    if (_tab === 'diy') _wireDIY();
    console.log('§ABOUT-DIY tab=' + _tab);
  }

  // ── ABOUT — the project story (what you get). Feature list verbatim from the landing. ──
  function _aboutHtml() {
    var feats = [
      ['package', BLUE, '3D IFC Viewer', '125K elements · offline · &lt;1s load'],
      ['clock', BLUE, '4D Time Machine', 'sequence · drone tour · Gantt'],
      ['banknote', BLUE, '5D Cost &amp; BOQ', 'auto-extracted · 17 country rates'],
      ['bomb', BLUE, 'Clash Detection', 'R-tree spatial · QR snag reports'],
      ['grid', BLUE, '2D Plans &amp; Grids', 'section cut · elevations'],
      ['layout', AMBER, 'Spatial ERP', 'iDempiere AD · full CRUD · globe'],
      ['arrowRightLeft', AMBER, 'BIM → Project Order', 'a priced selection folds to a real C_Project'],
      ['route', BLUE, 'Walk Mode', 'GPS blue-dot · device orientation'],
      ['search', BLUE, 'Voice &amp; NLP Search', 'natural language · mic'],
      ['share', BLUE, 'Deep-link Share', 'URL · QR · native share sheet']
    ];
    return '<div class="adq-lead">Probably the best BIM5D / ERP in existence — one browser, two DBs, '
      + 'zero install. Everything below runs client-side; nothing is faked.</div>'
      + '<div class="adq-grid">' + feats.map(function (f) {
        return '<div class="adq-feat"><span class="adq-fi">' + _ico(f[0], 18, f[1]) + '</span>'
          + '<div><b>' + f[2] + '</b><span>' + f[3] + '</span></div></div>';
      }).join('') + '</div>'
      + '<div class="adq-supp">Chrome 90+ · Firefox 90+ · Safari 15+ · Edge 90+ · iOS Safari 15+ · Chrome Android</div>';
  }

  // ── DIY — run it on your own machine. README is the single "what to run". ──
  function _diyHtml() {
    return '<div class="adq-lead">Host it yourself and bring your own data in. '
      + 'The downloads carry a <b>README that tells you exactly what to run</b> — copy-paste from there; '
      + 'this panel just hands you the files.</div>'
      // A · self-host the BIM viewer
      + '<div class="adq-diy"><div class="adq-dh">' + _ico('package', 15, BLUE) + ' Self-host the BIM viewer</div>'
      + '<div class="adq-dd">The install script checks your OS, installs Python 3 if missing, downloads the '
      + 'viewer + libraries, serves it on <code>localhost:8080</code>, and opens your browser. Your domain, '
      + 'your branding; cloud buildings still load by URL.</div>'
      + '<button id="adq-dl-viewer" class="adq-btn adq-bim-btn">' + _ico('download', 14) + ' Download install script</button>'
      + '<div id="adq-dl-msg" class="adq-msg"></div></div>'
      // B · bring your ERP data in (delegate-to-install)
      + '<div class="adq-diy"><div class="adq-dh">' + _ico('plug', 15, AMBER) + ' Bring your ERP data in</div>'
      + '<div class="adq-dd">The browser cannot reach your DB / Docker, so you run a small agent <b>natively</b> '
      + 'on the machine that has your ERP — it writes one file you load back here (every value a recorded row). '
      + 'The bundle README has the exact commands.</div>'
      + '<div class="adq-seg adq-seg2">' + AGENT_ORDER.map(function (k) {
        var a = AGENTS[k];
        return a.soon
          ? '<button class="adq-agent soon" data-agent="' + k + '" disabled title="Under construction — on the roadmap">' + a.label + '</button>'
          : '<button class="adq-agent" data-agent="' + k + '">' + a.label + '</button>';
      }).join('') + '</div>'
      + '<a id="adq-dl-agent" class="adq-btn adq-erp-btn" download>' + _ico('download', 14) + ' <span id="adq-agent-txt"></span></a>'
      + '<div id="adq-agent-note" class="adq-msg"></div></div>'
      + '<div class="adq-save"><a href="javascript:void(0)" id="adq-save-offline">' + _ico('save', 13) + ' Save an offline copy</a> '
      + '<span class="adq-dim">— viewer + serve script + README</span></div>';
  }

  // The two live delegate agents + the roadmap sources (greyed, "Under construction" — shown for
  // roadmap consistency, NOT advertised as working: soon=true → disabled, no download, honest).
  var AGENT_ORDER = ['odoo', 'idempiere', 'sap', 'oracle', 'dynamics'];
  var AGENTS = {
    odoo: { label: 'Odoo', file: 'erp/odoo_agent.zip', txt: 'Download odoo_agent.zip',
      note: 'Unzip, then per its README: <code>cd odoo_agent &amp;&amp; npm install &amp;&amp; node agent.js</code> → writes <code>odoo_chain.json</code>. Load that file back here.' },
    idempiere: { label: 'iDempiere', file: 'erp/idempiere_agent.zip', txt: 'Download idempiere_agent.zip',
      note: 'Unzip, then per its README: <code>cd idempiere_agent &amp;&amp; npm install &amp;&amp; node migrate_agent.js --masters</code> → writes <code>ad_masters.db</code>. Load that file back here.' },
    sap: { label: 'SAP', soon: true },
    oracle: { label: 'Oracle', soon: true },
    dynamics: { label: 'Dynamics', soon: true }
  };

  function _wireDIY() {
    _$('adq-dl-viewer').onclick = function () { _downloadInstaller(); };
    var save = _$('adq-save-offline');
    if (save) save.onclick = function () {
      if (typeof window.packageLandingPage === 'function') window.packageLandingPage();
      else _downloadInstaller();
    };
    var setAgent = function (a) {
      var s = AGENTS[a];
      if (!s || s.soon) return;                      // roadmap sources are disabled — never selectable
      Array.prototype.forEach.call(_overlay.querySelectorAll('.adq-agent'), function (b) {
        b.classList.toggle('on', b.getAttribute('data-agent') === a);
      });
      var dl = _$('adq-dl-agent');
      dl.setAttribute('href', s.file); dl.setAttribute('download', s.file.split('/').pop());
      _$('adq-agent-txt').textContent = s.txt;
      _$('adq-agent-note').innerHTML = s.note;
      console.log('§ABOUT-DIY agent=' + a);
    };
    Array.prototype.forEach.call(_overlay.querySelectorAll('.adq-agent'), function (b) {
      if (b.disabled) return;
      b.onclick = function () { setAgent(b.getAttribute('data-agent')); };
    });
    setAgent('odoo');
  }

  // Self-host installer — OS-aware, serves the WHOLE app (landing + viewer + erp) on :8080.
  // CORRECTED target: this repo is `bim-ootb`, served from ROOT (no `full` branch, no deploy/dev) — the
  // old script's `full.zip` + `BIMCompiler-full/deploy/dev` 404'd and copied nothing. We own the generator
  // here (single source); the module never defers to a host page's copy, so the fix lands everywhere.
  // GitHub archive of branch `main` extracts to `bim-ootb-main/`; the repo's own README.md ships inside it.
  var REPO_ZIP = 'https://github.com/red1oon/bim-ootb/archive/refs/heads/main.zip';
  function _downloadInstaller() {
    var isWin = navigator.platform.indexOf('Win') > -1, script, filename, mime;
    if (isWin) {
      filename = 'bim-ootb-install.bat'; mime = 'application/x-bat';
      script = ['@echo off', 'echo BIM/ERP OOTB - Self-Host (Windows)',
        'python --version >nul 2>&1 || winget install Python.Python.3.12 --accept-package-agreements --accept-source-agreements',
        'set DEST=%USERPROFILE%\\bim-ootb', 'if not exist "%DEST%" mkdir "%DEST%"', 'cd /d "%DEST%"',
        'curl -sL -o app.zip "' + REPO_ZIP + '"',
        'powershell -Command "Expand-Archive -Path app.zip -DestinationPath . -Force"', 'del app.zip',
        'cd bim-ootb-main',
        'echo Serving BIM + ERP at http://localhost:8080  (see README.md)',
        'start http://localhost:8080', 'python -m http.server 8080'
      ].join('\r\n');
    } else {
      filename = 'bim-ootb-install.sh'; mime = 'application/x-sh';
      script = ['#!/usr/bin/env bash', '# BIM/ERP OOTB - Self-Host (Mac/Linux). MIT.', 'set -e',
        'command -v python3 >/dev/null || { echo "[!] please install python3"; exit 1; }',
        'DEST="$HOME/bim-ootb"; mkdir -p "$DEST" && cd "$DEST"',
        'echo "Downloading BIM/ERP OOTB..."',
        'curl -sL -o app.zip "' + REPO_ZIP + '"',
        'unzip -qo app.zip && rm app.zip && cd bim-ootb-main',
        'echo "Serving BIM + ERP at http://localhost:8080  (see README.md)"',
        'if [[ "$OSTYPE" == "darwin"* ]]; then open http://localhost:8080 &',
        'elif command -v xdg-open &>/dev/null; then xdg-open http://localhost:8080 &; fi',
        'python3 -m http.server 8080'
      ].join('\n');
    }
    var a = _h('a'); a.href = URL.createObjectURL(new Blob([script], { type: mime }));
    a.download = filename; a.click(); URL.revokeObjectURL(a.href);
    _diyMsg(isWin ? 'win' : 'nix');
  }
  function _diyMsg(os) {
    var m = _$('adq-dl-msg'); if (m) m.innerHTML = '✅ Downloaded — run the script; the README explains the rest.';
    console.log('§ABOUT-DIY diy-download os=' + os);
  }

  function _injectStyle() {
    if (_$('adq-style')) return;
    var s = _h('style', { id: 'adq-style' });
    s.textContent =
      ".adq-overlay{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;"
      + "padding:18px;background:rgba(6,8,20,.62);-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px);"
      + "font-family:'Segoe UI',system-ui,sans-serif}"
      + ".adq-card{position:relative;width:min(520px,100%);max-height:90vh;overflow:auto;text-align:center;color:#dfe6f0;"
      + "background:radial-gradient(120% 90% at 50% -10%,#16213e 0%,#0c1024 60%,#070a18 100%);"
      + "border:1px solid rgba(79,195,247,.22);border-radius:18px;padding:30px 30px 18px;"
      + "box-shadow:0 30px 90px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.04);animation:adq-rise .22s ease-out}"
      + "@keyframes adq-rise{from{opacity:0;transform:translateY(12px) scale(.985)}to{opacity:1;transform:none}}"
      + ".adq-x{position:absolute;top:14px;right:16px;border:0;background:rgba(255,255,255,.06);color:#9fb0c8;"
      + "width:30px;height:30px;border-radius:9px;font-size:20px;line-height:1;cursor:pointer}"
      + ".adq-x:hover{background:rgba(255,255,255,.14);color:#fff}"
      + ".adq-brand{display:flex;align-items:baseline;justify-content:center;gap:6px;font-family:'Arial Black',Impact,sans-serif;letter-spacing:4px}"
      + ".adq-logo{font-size:42px;font-weight:800;line-height:.9}.adq-bim{color:" + BLUE + "}.adq-erp{color:" + AMBER + "}"
      + ".adq-slash{font-size:30px;color:#56607a;font-weight:400}"
      + ".adq-ootb{font-size:11px;letter-spacing:5px;color:#7f8aa3;text-transform:uppercase;align-self:flex-end;margin-left:4px;padding-bottom:5px}"
      + ".adq-tag{font-size:12px;color:#8b97b0;margin:8px 0 16px}"
      + ".adq-seg{display:inline-flex;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:999px;padding:4px;margin-bottom:18px}"
      + ".adq-segb{padding:7px 18px;border:0;background:none;border-radius:999px;cursor:pointer;font-size:13px;font-weight:600;color:#9fb0c8;transition:.13s}"
      + ".adq-segb.on{background:" + BLUE2 + ";color:#fff;box-shadow:0 2px 10px rgba(2,119,189,.5)}"
      + ".adq-body{text-align:left;font-size:13px;line-height:1.5}"
      + ".adq-lead{color:#aebbd0;font-size:12.5px;line-height:1.55;margin-bottom:16px;text-align:center}"
      + ".adq-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}"
      + ".adq-feat{display:flex;gap:9px;align-items:flex-start;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);border-radius:10px;padding:9px 10px}"
      + ".adq-fi{font-size:16px;line-height:1.1;flex:0 0 auto}"
      + ".adq-feat b{display:block;font-size:12.5px;color:#e6edf6}.adq-feat span{display:block;font-size:10.5px;color:#8b97b0;margin-top:1px}"
      + ".adq-supp{text-align:center;color:#6b768e;font-size:10px;margin-top:14px}"
      + ".adq-diy{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:14px 15px;margin-bottom:13px}"
      + ".adq-dh{font-weight:700;font-size:14px;color:#e6edf6;margin-bottom:5px;display:flex;align-items:center;gap:7px}"
      + ".adq-dd{color:#9aa7bf;font-size:12px;line-height:1.5;margin-bottom:11px}"
      + ".adq-seg2{margin:0 0 11px;background:rgba(0,0,0,.25)}.adq-agent{padding:5px 14px;border:0;background:none;border-radius:999px;cursor:pointer;font-size:12px;font-weight:600;color:#9fb0c8}"
      + ".adq-agent.on{background:" + AMBER + ";color:#1a1206}"
      + ".adq-agent.soon{opacity:.32;cursor:not-allowed;text-decoration:line-through;text-decoration-thickness:1px}"
      + ".adq-agent.soon:hover{opacity:.5}"
      + ".adq-btn{display:inline-flex;align-items:center;gap:7px;padding:10px 18px;border:0;border-radius:10px;cursor:pointer;font-size:13px;font-weight:700;text-decoration:none}"
      + ".adq-bim-btn{background:" + BLUE2 + ";color:#fff}.adq-bim-btn:hover{background:#0288c4}"
      + ".adq-erp-btn{background:" + AMBER + ";color:#1a1206}.adq-erp-btn:hover{filter:brightness(1.08)}"
      + ".adq-msg{font-size:11px;color:#8b97b0;margin-top:8px;line-height:1.5}.adq-msg:empty{display:none}"
      + ".adq-save{text-align:center;margin-top:6px;font-size:11px}.adq-save a{color:" + BLUE + ";text-decoration:none}.adq-dim{color:#6b768e}"
      + ".adq-foot{display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,.07);font-size:11px}"
      + ".adq-fl{color:" + BLUE + ";text-decoration:none;padding:5px 11px;border:1px solid rgba(79,195,247,.2);border-radius:7px}"
      + ".adq-fl:hover{background:rgba(79,195,247,.1)}.adq-mit{color:#5d6884}"
      + ".adq-card code{background:rgba(0,0,0,.35);border-radius:4px;padding:1px 5px;font-size:.9em;color:#9be3c0}";
    document.head.appendChild(s);
  }

  window.AboutDIY = { open: open, openAbout: openAbout, openDIY: openDIY, close: close };
})();
