// foreign_compose_smoke.js — §COMPOSE-SMOKE (wiring check, secondary to W-COMPOSE node proof 16/16).
// In the live Schedule Editor: import the tokened demo into the REAL Hospital model with auto-bind on →
// break a bound phase down BY STOREY via the #518 "break by…" select → the WBS re-renders the per-storey
// sub-tasks → Compute CPM still lights a path. Proves the deepen-an-imported-plan seam is wired, NOT
// engine values (that's W-COMPOSE). Hospital because breakdown-by-storey needs a multi-storey phase.
'use strict';
var http = require('http');
var fs = require('fs');
var path = require('path');
var VIEWER = path.join(__dirname, '..', '..', 'viewer');
var FIX = path.join(__dirname, '..', '..', 'tests', 'fixtures', 'Hospital_GW_Programme.bound.xer');
var BLD = '/home/red1/bim-ootb/buildings/Hospital_meta.db';
var chromium = require('/home/red1/bim-ootb/tests/node_modules/playwright').chromium;

var MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json',
  '.db': 'application/octet-stream', '.wasm': 'application/wasm', '.css': 'text/css' };

function serve(port, cb) {
  var srv = http.createServer(function (req, res) {
    var u = decodeURIComponent(req.url.split('?')[0]);
    var file = u === '/buildings/sample.db' ? BLD : path.join(VIEWER, u.replace(/^\//, ''));
    fs.readFile(file, function (err, buf) {
      if (err) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*' });
      res.end(buf);
    });
  });
  srv.listen(port, function () { cb(srv); });
}

var pass = 0, fail = 0;
function check(n, c, d) { (c ? pass++ : fail++); console.log('§COMPOSE-SMOKE ' + (c ? 'PASS' : 'FAIL') + '  ' + n + (d ? '  ' + d : '')); }

(async function () {
  await new Promise(function (res) { serve(8733, function (s) { global.__srv = s; res(); }); });
  var browser = await chromium.launch();
  var page = await browser.newPage();
  var logs = [];
  page.on('console', function (m) { logs.push(m.text()); });
  page.on('pageerror', function (e) { logs.push('PAGEERROR ' + e.message); });

  await page.goto('http://localhost:8733/schedule_editor.html?db=buildings/sample.db', { waitUntil: 'load' });
  await page.waitForFunction(function () {
    var s = document.getElementById('se-status');
    return s && !/Initialising|Loading/.test(s.textContent);
  }, { timeout: 60000 }).catch(function () {});
  check('editor-booted', await page.$('#se-import-btn') !== null, 'import button present');

  await page.setInputFiles('#se-import-file', FIX);
  await page.waitForFunction(function () {
    var s = document.getElementById('se-status');
    return s && /Pre-bound/.test(s.textContent);
  }, { timeout: 20000 }).catch(function () {});
  check('imported-and-bound', /Pre-bound/.test(await page.$eval('#se-status', function (e) { return e.textContent; })), 'auto-bind ran on import');

  // drive the #518 "break by…" select on the "Columns" leaf → storey
  var broke = await page.evaluate(function () {
    var sels = Array.prototype.slice.call(document.querySelectorAll('#se-wbs select'));
    for (var i = 0; i < sels.length; i++) {
      var row = sels[i].closest('div');
      if (row && /Columns/.test(row.textContent) && !/·/.test(row.textContent)) {
        sels[i].value = 'storey';
        sels[i].dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    return false;
  });
  check('break-select-found', broke, 'found the Columns break-by select and chose storey');

  await page.waitForFunction(function () {
    var s = document.getElementById('se-status');
    return s && /split into/.test(s.textContent);
  }, { timeout: 10000 }).catch(function () {});
  var statusTxt = await page.$eval('#se-status', function (e) { return e.textContent; });
  check('status-split', /split into \d+ sub-tasks by storey/.test(statusTxt), statusTxt.slice(0, 90));

  var wbsTxt = await page.$eval('#se-wbs', function (e) { return e.textContent; });
  check('subtasks-rendered', /Columns · Level/.test(wbsTxt), 'per-storey sub-tasks visible in WBS');

  await page.click('#se-cpm-btn');
  await page.waitForTimeout(500);
  var cpmTxt = await page.$eval('#se-cpm-out', function (e) { return e.textContent; });
  check('cpm-still-runs', /\d/.test(cpmTxt), 'cpm-out=' + cpmTxt.slice(0, 60));

  var errs = logs.filter(function (l) { return /PAGEERROR/.test(l); });
  check('no-page-errors', errs.length === 0, errs.join(' | ').slice(0, 120));

  await browser.close();
  global.__srv.close();
  console.log('\n§COMPOSE-SMOKE SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('§COMPOSE-SMOKE ERROR', e); try { global.__srv.close(); } catch (x) {} process.exit(1); });
