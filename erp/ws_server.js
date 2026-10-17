// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// ws_server.js - headless host for the Kernel ERP's ADInterface web service (bim-compiler prompts/ERP_WS_API.md S1). Same wire as legacy iDempiere:
//   POST /ADInterface/services/rest/model_adservice/{query_data,read_data}  XML in, XML out. No server of record: the DB is the shipped ad_seed.db (+ patches/ad_seed.db.sql) loaded into memory, as the page does.
// usage: node erp/ws_server.js [port] [extra.sql ...]     (extra SQL files are applied after the seed patch: tenant config such as web-service access rows)
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const WS = require('./ws_adinterface.js');
async function openDb(extraSql) {
  const initSqlJs = require(process.env.SQLJS || (os.homedir() + '/bim-ootb/tests/node_modules/sql.js'));
  const SQL = await initSqlJs(); const db = new SQL.Database(fs.readFileSync(path.join(__dirname, 'ad_seed.db')));
  const run = (txt) => txt.split(/;\s*\n/).forEach(st => { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) try { db.run(st); } catch (e) { /* the page's per-statement tolerance */ } });
  const pf = path.join(__dirname, 'patches/ad_seed.db.sql'); if (fs.existsSync(pf)) run(fs.readFileSync(pf, 'utf8'));
  (extraSql || []).forEach(f => run(fs.readFileSync(f, 'utf8')));
  const q = (sql, params) => { const st = db.prepare(sql), rows = []; try { if (params && params.length) st.bind(params.map(v => v === undefined ? null : v)); const cols = st.getColumnNames(); while (st.step()) { const v = st.get(), o = {}; cols.forEach((c, i) => { o[String(c).toLowerCase()] = v[i]; }); rows.push(o); } } finally { st.free(); } return rows; };
  return { db, q };
}
async function start(port, extraSql) {
  const { q } = await openDb(extraSql), ad = WS.create({ q });
  const server = http.createServer((req, res) => {
    const m = /^\/ADInterface\/services\/rest\/model_adservice\/(\w+)$/.exec(req.url.split('?')[0]);
    if (!m || req.method !== 'POST') { res.writeHead(m ? 405 : 404); res.end(); return; }
    let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
      let out, status = 200; try { out = ad.handle(m[1], body); if (out && typeof out === 'object') { status = out.status; out = out.body; } } catch (e) { out = '<?xml version="1.0" encoding="UTF-8"?><_0:WindowTabData xmlns:_0="http://idempiere.org/ADInterface/1_0"><_0:Error>' + String(e.message).replace(/</g, '&lt;') + '</_0:Error></_0:WindowTabData>'; }
      console.log('§WS ' + m[1] + ' bytes=' + out.length + ' err=' + (/<_0:Error>/.test(out) ? (/<_0:Error>([^<]*)/.exec(out) || [])[1] : '-'));
      // a fault: legacy answers HTTP 500 with the Jetty HTML page, or an EMPTY body when the client asked for application/xml (the fault cannot be serialised as XML) - observed on the pilot
      if (status !== 200 && /xml/.test(String(req.headers.accept || ''))) out = '';
      res.writeHead(status, status === 200 ? { 'Content-Type': 'application/xml' } : (out ? { 'Content-Type': 'text/html;charset=iso-8859-1' } : {})); res.end(out);
    });
  });
  await new Promise(r => server.listen(port || 0, r)); return server;
}
module.exports = { start, openDb };
if (require.main === module) start(Number(process.argv[2]) || 8089, process.argv.slice(3)).then(s => console.log('§WS listening port=' + s.address().port));
