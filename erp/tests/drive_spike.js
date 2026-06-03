// SPIKE driver — serve-and-drive the live write-path page headless, capture the in-browser §-logs
// (real crypto.subtle seal + real IndexedDB persist). Run from bim-compiler (has puppeteer):
//   node ~/bim-ootb/erp/tests/drive_spike.js [n]
'use strict';
var puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
var N = process.argv[2] || '300';
var URL = 'http://localhost:8753/spike_writepath.html?auto=1&n=' + N;

(async function () {
  var browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  var page = await browser.newPage();
  page.on('console', function (m) { var t = m.text(); if (/§|FATAL|BOOT/.test(t)) console.log(t); });
  page.on('pageerror', function (e) { console.log('PAGEERROR ' + e.message); });
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 60000 });
  try { await page.waitForFunction('window.__SPIKE_DONE === true', { timeout: 120000 }); }
  catch (e) { console.log('TIMEOUT waiting for spike done: ' + e.message); }
  await browser.close();
})().catch(function (e) { console.error('DRIVER FATAL', e); process.exit(2); });
