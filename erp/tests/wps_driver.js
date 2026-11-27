// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// wps_driver.js - the ONE driver of the REAL WPS Spreadsheets (snap wps-office) for the lane's witnesses: its own Xvfb display (never the real screen), xdotool, Ctrl+S with WPS's
// own writer, and only the processes it started are killed. Method and findings: bim-compiler prompts/SHEET_FRONT_DOOR.md §13.3. Used by W-SHEET-WPS-REAL and W-HISTORY-PAGE (§14 P9).
// The snap sandbox cannot read /tmp: the file to save must live in a NON-HIDDEN directory under $HOME. A WPS-saved workbook carries the local user name: never commit one.
'use strict';
var fs = require('fs'), cp = require('child_process');
function sh(cmd, args, o) { return cp.spawnSync(cmd, args, Object.assign({ encoding: 'utf8', timeout: 30000 }, o || {})); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
var CLEAN = (function () { var e = Object.assign({}, process.env); delete e.DBUS_SESSION_BUS_ADDRESS; return e; })();
var WPS_BIN = '/snap/bin/wps-office.et', WPS_VER = (function () { try { return (/^version:\s*(\S+)/m.exec(fs.readFileSync('/snap/wps-office/current/meta/snap.yaml', 'utf8')) || [])[1] || ''; } catch (e) { return ''; } })();
function has(tool) { return !!sh('sh', ['-c', 'command -v ' + tool]).stdout.trim(); }
function tools() { return { wps: fs.existsSync(WPS_BIN) && !!WPS_VER, Xvfb: has('Xvfb'), xdotool: has('xdotool'), xprop: has('xprop'), python3: has('python3') }; }
var STARTED = { xvfb: [], wps: [] };           // ONLY the processes this run started

function freeDisplay() { for (var n = 90 + (process.pid % 40); n < 400; n++) if (!fs.existsSync('/tmp/.X11-unix/X' + n) && !fs.existsSync('/tmp/.X' + n + '-lock')) return n; return -1; }
function xd(D, args) { return sh('xdotool', args, { env: Object.assign({}, CLEAN, { DISPLAY: ':' + D }) }); }
function windows(D) { var ids = (xd(D, ['search', '--onlyvisible', '--name', '']).stdout || '').split(/\s+/).filter(Boolean); return ids.map(function (id) { var g = (xd(D, ['getwindowgeometry', id]).stdout || ''), m = /Position:\s*(-?\d+),(-?\d+)[\s\S]*Geometry:\s*(\d+)x(\d+)/.exec(g); return { id: id, name: (xd(D, ['getwindowname', id]).stdout || '').trim(), x: m ? +m[1] : 0, y: m ? +m[2] : 0, w: m ? +m[3] : 0, h: m ? +m[4] : 0 }; }); }
function killTree(pid) { try { process.kill(pid, 'SIGTERM'); } catch (e) { /* gone */ } }
function pidOfWindow(D, id) { var m = /=\s*(\d+)/.exec(sh('xprop', ['-id', id, '_NET_WM_PID'], { env: Object.assign({}, CLEAN, { DISPLAY: ':' + D }) }).stdout || ''); return m ? +m[1] : 0; }
// resave(file, o): open `file` in WPS Spreadsheets, Ctrl+S (WPS's own writer), detect by the file's bytes, close. o.save === false is the red control (the save step is skipped).
async function wpsResave(file, o) {
  o = o || {}; var out = { file: file, ok: false, ms: 0, bytesIn: fs.statSync(file).size, bytesOut: 0, titles: [], handled: [], err: '' }, t0 = Date.now(), D = freeDisplay(), xv = null, wps = null, wpid = 0;
  if (D < 0) { out.err = 'no free display number'; return out; }
  var statIn = fs.statSync(file), mt0 = statIn.mtimeMs;
  try {
    xv = cp.spawn('Xvfb', [':' + D, '-screen', '0', '1280x800x24', '-nolisten', 'tcp'], { stdio: 'ignore', env: CLEAN }); STARTED.xvfb.push(xv.pid);
    for (var i = 0; i < 50 && !fs.existsSync('/tmp/.X11-unix/X' + D); i++) await sleep(100);
    wps = cp.spawn(WPS_BIN, [file], { stdio: 'ignore', detached: true, env: Object.assign({}, CLEAN, { DISPLAY: ':' + D, LIBGL_ALWAYS_SOFTWARE: '1' }) }); wps.unref(); STARTED.wps.push(wps.pid);
    var main = null, seen = {};
    for (var s = 0; s < 120 && !main; s++) {                      // up to 60 s for the document window
      await sleep(500); var ws = windows(D);
      ws.forEach(function (w) { if (w.name && !seen[w.name]) { seen[w.name] = 1; out.titles.push(w.name); } });
      main = ws.filter(function (w) { return /Spreadsheets$/.test(w.name); })[0] || null;
    }
    if (!main) { out.err = 'no Spreadsheets window within 60 s; titles=' + JSON.stringify(out.titles); return out; }
    wpid = pidOfWindow(D, main.id); if (wpid) STARTED.wps.push(wpid);
    await sleep(4000);                                            // the System Check dialog appears a few seconds after the window
    for (var d = 0; d < 6; d++) {
      var ws2 = windows(D), dlg = ws2.filter(function (w) { return /^System Check$/.test(w.name); })[0];
      ws2.forEach(function (w) { if (w.name && !seen[w.name]) { seen[w.name] = 1; out.titles.push(w.name); } });
      if (!dlg) break;
      xd(D, ['mousemove', String(dlg.x + dlg.w - 47), String(dlg.y + dlg.h - 22), 'click', '1']); out.handled.push('System Check: Close clicked'); await sleep(1500);
    }
    if (o.save !== false) {
      var win = windows(D).filter(function (w) { return /Spreadsheets$/.test(w.name); })[0] || main;
      xd(D, ['windowfocus', win.id]); xd(D, ['mousemove', '640', '400', 'click', '1']); await sleep(500); xd(D, ['key', 'ctrl+s']);
      var last = -1, stable = 0;
      for (var k = 0; k < 120; k++) {                             // up to 60 s: wait for the bytes to change, then to stop changing
        await sleep(500); var st = fs.statSync(file); ws2 = windows(D); ws2.forEach(function (w) { if (w.name && !seen[w.name]) { seen[w.name] = 1; out.titles.push(w.name); } });
        if (st.mtimeMs !== mt0 && st.size !== statIn.size) { if (st.size === last) { if (++stable >= 3) break; } else { stable = 0; last = st.size; } }
      }
    } else await sleep(3000);
    out.bytesOut = fs.statSync(file).size; out.ok = true;
  } catch (e) { out.err = String(e && e.message || e); } finally {
    // close: our own Ctrl+Q first (the document is saved), then kill only the PIDs this run started
    try { if (wpid) { xd(D, ['key', 'ctrl+q']); await sleep(1500); } } catch (e) { /* ignore */ }
    STARTED.wps.forEach(function (p) { killTree(p); }); await sleep(1500); STARTED.wps.forEach(function (p) { try { process.kill(p, 0); process.kill(p, 'SIGKILL'); } catch (e) { /* gone */ } });
    if (xv) { killTree(xv.pid); await sleep(500); try { process.kill(xv.pid, 0); process.kill(xv.pid, 'SIGKILL'); } catch (e) { /* gone */ } }
    out.ms = Date.now() - t0;
  }
  return out;
}
// what is still running of what this driver started (for a §...-CLEANUP line)
function left() { var ids = STARTED.xvfb.concat(STARTED.wps); return ids.length ? sh('sh', ['-c', 'ps -o pid=,args= -p ' + ids.join(',') + ' 2>/dev/null']).stdout.trim() : ''; }
module.exports = { BIN: WPS_BIN, VERSION: WPS_VER, CLEAN: CLEAN, STARTED: STARTED, sh: sh, sleep: sleep, tools: tools, resave: wpsResave, killTree: killTree, left: left };
