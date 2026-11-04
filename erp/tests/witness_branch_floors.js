#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-BRANCH-FLOORS (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §32.1 item 4). READ THE LOG (/tmp/rest_logs/branch_floors.log): exit code is not evidence.
// THE ISSUE: floors/tables had no maintenance screen (a hardcoded 24-table list in till_ext.js). Proves the REAL branch POS admin page, on the real engine, writes a floor and a table as POS_FloorPlan rows
// (committed op groups) and reads them back through the fold. Real device boot in headless Chromium; the second-till view is judged by witness_rest.js (fold) until the SODA merge lets the till read them.
'use strict';
var http=require('http'),fs=require('fs'),path=require('path');var ROOT=path.join(__dirname,'..','..');
var MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.wasm':'application/wasm','.css':'text/css','.mjs':'text/javascript'};
var srv=http.createServer(function(q,r){var p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0])); if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.statusCode=404;return r.end();} r.setHeader('Content-Type',MIME[path.extname(p)]||'application/octet-stream'); fs.createReadStream(p).pipe(r);});
srv.listen(0,async function(){var port=srv.address().port;var pw;try{pw=require('playwright')}catch(e){pw=require('/home/red1/bim-ootb/tests/node_modules/playwright')}
var b=await pw.chromium.launch(),pg=await b.newPage();pg.on('console',function(m){var t=m.text();if(/§FLOORS|§EODA_BOOT|🔴/.test(t))console.log(t.slice(0,300));});pg.on('pageerror',function(e){console.log('PAGEERR '+e.message.slice(0,200))});
await pg.goto('http://localhost:'+port+'/erp/branch_admin.html?team=1&login=50001');
try{await pg.waitForFunction('window.BranchFloors&&window.BranchFloors.state()',null,{timeout:90000});}catch(e){console.log('TIMEOUT boot')}
await pg.fill('#f-name','Hall');await pg.click('#f-save');await pg.waitForTimeout(3000);
await pg.fill('#p-name','Table 1');await pg.click('#p-save');await pg.waitForTimeout(3000);
var nf=await pg.locator('#f-floors tr').count(),np=await pg.locator('#f-places tr').count(),ok=nf===1&&np===1;console.log('§FLOORS_CHECK floors='+nf+' places='+np+' '+(ok?'PASS':'FAIL'));process.exitCode=ok?0:1;
await b.close();srv.close();});
