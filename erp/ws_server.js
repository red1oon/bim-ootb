// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// ws_server.js - headless host for the Kernel ERP's ADInterface web service (bim-compiler prompts/ERP_WS_API.md S1). Same wire as legacy iDempiere:
//   POST /ADInterface/services/rest/model_adservice/{query_data,read_data}  XML in, XML out. No server of record: the DB is the shipped ad_seed.db (+ patches/ad_seed.db.sql) loaded into memory, as the page does.
// usage: node erp/ws_server.js [port] [extra.sql ...]     (extra SQL files are applied after the seed patch: tenant config such as web-service access rows)
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const Policy = require('./ws_policy.js'), WS = require('./ws_adinterface.js'), Kernel = require('./ws_kernel.js'), JsonBinding = require('./ws_json.js');
async function openDb(extraSql) {
  const initSqlJs = require(process.env.SQLJS || (os.homedir() + '/bim-ootb/tests/node_modules/sql.js'));
  const SQL = await initSqlJs(); const db = new SQL.Database(fs.readFileSync(path.join(__dirname, 'ad_seed.db')));
  const run = (txt) => txt.split(/;\s*\n/).forEach(st => { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) try { db.run(st); } catch (e) { /* the page's per-statement tolerance */ } });
  const pf = path.join(__dirname, 'patches/ad_seed.db.sql'); if (fs.existsSync(pf)) run(fs.readFileSync(pf, 'utf8'));
  (extraSql || []).forEach(f => run(fs.readFileSync(f, 'utf8')));
  require('./ad_rule.js').ensure(db);   // §10.8: the AD_Rule / AD_Table_ScriptValidator physical tables (boot overlay, not in the hashed patches)
  require('./ad_import_tables.js').ensure(db);   // §13.2 B1: the I_Order physical table (boot overlay, not in the hashed patches)
  const q = (sql, params) => { const st = db.prepare(sql), rows = []; try { if (params && params.length) st.bind(params.map(v => v === undefined ? null : v)); const cols = st.getColumnNames(); while (st.step()) { const v = st.get(), o = {}; cols.forEach((c, i) => { o[String(c).toLowerCase()] = v[i]; }); rows.push(o); } } finally { st.free(); } return rows; };
  return { db, q };
}
let server_scan = null;
async function start(port, extraSql, opts) {
  opts = opts || {};
  // DEFAULT OFF when started from the command line: the bundle must be exported ACTIVE from the Web Services plugin (erp/plugins/webservices.mjs). Read at every request, so Stop takes effect at once.
  const isOn = () => { if (!opts.config) return opts.enabled !== false; try { return JSON.parse(fs.readFileSync(opts.config, 'utf8')).state === 'ACTIVE'; } catch (e) { return false; } };
  const kernel = await Kernel.load(extraSql);
  if (opts.hashPasswords) {   // MUser.setPassword with USER_PASSWORD_HASH=Y (:518-556) for every plain-stored user: SHA-512 x310000 over a random 128-bit salt (the system algorithm), then the switch (MUser.get :230-277)
    const PW = require('./ws_password.js'), alg = ((kernel.one("SELECT value FROM ad_sysconfig WHERE name='USER_PASSWORD_HASH_ALGORITHM' AND ad_client_id=0") || {}).value) || 'SHA-512';
    let n = 0; kernel.q("SELECT ad_user_id AS id, password FROM ad_user WHERE password IS NOT NULL AND salt IS NULL").forEach(function (u) { const salt = require('crypto').randomBytes(16).toString('hex');
      kernel.run("UPDATE ad_user SET password='" + PW.passwordHash(alg, String(u.password), salt) + "', salt='" + salt + "', passwordhashalgorithm='" + alg + "', saltalgorithm='DRBG' WHERE ad_user_id=" + Number(u.id) + ";\n"); n++; });
    kernel.run("UPDATE ad_sysconfig SET value='Y' WHERE name='USER_PASSWORD_HASH';\n"); console.log('§WS passwords hashed users=' + n + ' algorithm=' + alg);
  }
  const policy = Policy.create({ q: kernel.q, run: kernel.run, onAlert: (a) => { console.log('§WS-ALERT ' + a.kind + ' ' + a.who + ' - ' + a.detail); if (opts.alerts) { try { fs.appendFileSync(opts.alerts, JSON.stringify(a) + '\n'); } catch (e) { /* no alert file */ } } } });
  const ad = WS.create({ q: kernel.q, kernel, validators: opts.validators || [], passwordMatch: require('./ws_password.js').isMatchHash, policy: opts.noPolicy ? null : policy }),   // noPolicy: W-WS-LIMITS negative control only
     journal = kernel.journal;
  const savePending = () => { if (opts.agentsDir) { try { fs.writeFileSync(path.join(opts.agentsDir, 'pending.json'), JSON.stringify(policy.list(), null, 2)); } catch (e) { /* dir absent */ } } };
  if (opts.journal) { let txt = ''; try { txt = fs.readFileSync(opts.journal, 'utf8'); } catch (e) { /* no journal yet */ } if (txt) { const rp = kernel.replay(txt); console.log('§WS journal replayed entries=' + rp.entries + ' applied=' + rp.replayed + ' withoutPayload=' + rp.skipped); } kernel.hooks.onJournal = (e) => fs.appendFileSync(opts.journal, JSON.stringify(e) + '\n'); }
  if (opts.agentsDir) {   // tenant admin boundary = the filesystem: SQL files dropped in this directory are applied once, in name order, while the host runs (a revoke takes effect on the next request)
    const seen = {}; const scan = () => { try { fs.readdirSync(opts.agentsDir).filter(f => /\.(sql|json)$/.test(f) && f !== 'pending.json' && !/^\./.test(f)).sort().forEach(f => { const fp = path.join(opts.agentsDir, f), m = fs.statSync(fp).mtimeMs; if (seen[f] !== m) { seen[f] = m;
        if (/\.sql$/.test(f)) { try { kernel.run(fs.readFileSync(fp, 'utf8')); console.log('§WS agents-dir applied ' + f); } catch (e) { console.log('§WS agents-dir FAILED ' + f + ' ' + e.message); } }
        else if (/^(approve|reject)-\d+\.json$/.test(f)) {   // a person's decision on a staged request (ws_agent.js approve|reject)
          try { const d = JSON.parse(fs.readFileSync(fp, 'utf8')); let out;
            if (/^approve/.test(f)) { out = policy.approve(d.id, d.digest, d.approver || 'unknown', (pr) => { kernel.ctxMeta.v = { approvedBy: d.approver || 'unknown', stagedId: pr.id, onBehalfOf: pr.principal || null }; try { return ad.handle(pr.method, pr.body, { approved: true }); } finally { kernel.ctxMeta.v = null; } }); }
            else out = policy.reject(d.id, d.approver || 'unknown');
            fs.writeFileSync(fp.replace(/\.json$/, '.result.txt'), JSON.stringify({ ok: out.ok, error: out.error || null, answer: out.result ? String(out.result).slice(0, 600) : null }, null, 2)); savePending(); console.log('§WS decision ' + f + ' ok=' + out.ok); } catch (e) { console.log('§WS decision FAILED ' + f + ' ' + e.message); } } } }); } catch (e) { /* dir absent */ } }; scan(); server_scan = setInterval(scan, 500); }
  const server = http.createServer((req, res) => {
    const m = /^\/ADInterface\/services\/rest\/(?:model_adservice|composite_service)\/(\w+)$/.exec(req.url.split('?')[0]);   // composite_service/composite_operation -> method composite_operation
    if (!isOn()) { console.log('§WS off (plugin org.idempiere.webservices is not ACTIVE in ' + (opts.config || 'the host options') + ') -> 404'); res.writeHead(404); res.end(); return; }   // a stopped bundle serves nothing
    if (!m || req.method !== 'POST') { res.writeHead(m ? 405 : 404); res.end(); return; }
    let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
      const rawBody = body, onBehalf = req.headers['x-on-behalf-of'] ? { name: String(req.headers['x-on-behalf-of']), sig: String(req.headers['x-on-behalf-sig'] || ''), raw: rawBody } : null;
      const asJson = /json/i.test(String(req.headers['content-type'] || '')), tableHint = asJson ? (m[1] === 'composite_operation' ? (body.match(/"(?:TableName|tableName)"\s*:\s*"[^"]*"/g) || []).map(x => /:\s*"([^"]*)"/.exec(x)[1]) : ((/"(?:TableName|tableName)"\s*:\s*"([^"]*)"/.exec(body) || [])[1] || null)) : null;
      if (asJson) { try { body = JsonBinding.toXml(body); } catch (e) { res.writeHead(400); res.end('{"Error":"Bad JSON request"}'); return; } }
      let out, status = 200; try { out = ad.handle(m[1], body, { onBehalf: onBehalf }); savePending(); if (out && typeof out === 'object') { status = out.status; out = out.body; } } catch (e) { out = '<?xml version="1.0" encoding="UTF-8"?><_0:WindowTabData xmlns:_0="http://idempiere.org/ADInterface/1_0"><_0:Error>' + String(e.message).replace(/</g, '&lt;') + '</_0:Error></_0:WindowTabData>'; }
      kernel.ctxMeta.v = null;
      console.log('§WS ' + m[1] + ' bytes=' + out.length + ' err=' + (/<_0:Error>/.test(out) ? (/<_0:Error>([^<]*)/.exec(out) || [])[1] : '-'));
      // a fault: legacy answers HTTP 500 with the Jetty HTML page, or an EMPTY body when the client asked for application/xml (the fault cannot be serialised as XML) - observed on the pilot
      if (asJson && status === 200) { out = JsonBinding.toJson(out, ad.typeOf, tableHint); console.log('§WS json ' + m[1] + ' bytes=' + out.length); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(out); return; }
      if (status !== 200 && /xml/.test(String(req.headers.accept || ''))) out = '';
      res.writeHead(status, status === 200 ? { 'Content-Type': 'application/xml' } : (out ? { 'Content-Type': 'text/html;charset=iso-8859-1' } : {})); res.end(out);
    });
  });
  await new Promise(r => server.listen(port || 0, opts.host || '127.0.0.1', r));
  // LOOPBACK ONLY unless --bind says otherwise: the service has no TLS (docs/ERP_AI_ADVISORY.md)
  server.kernel = kernel; server.policy = policy; server.on('close', () => { if (server_scan) clearInterval(server_scan); }); return server;
}
module.exports = { start, openDb };
if (require.main === module) {
  // --validators <module.js>: a module exporting [{ type, validate, login }] (IWSValidator)
  const a = process.argv.slice(2), o = { config: null, agentsDir: null, journal: null }, sql = []; let port = 8089;
  for (let i = 0; i < a.length; i++) { if (a[i] === '--config') o.config = a[++i]; else if (a[i] === '--agents') o.agentsDir = a[++i]; else if (a[i] === '--journal') o.journal = a[++i]; else if (a[i] === '--hash-passwords') o.hashPasswords = true; else if (a[i] === '--validators') o.validators = (o.validators || []).concat(require(path.resolve(a[++i]))); else if (a[i] === '--bind') { o.host = a[++i]; if (o.host !== '127.0.0.1' && o.host !== 'localhost') console.log('§WS WARNING --bind ' + o.host + ': the host speaks plain HTTP with the password in every request - put TLS (a reverse proxy) in front, never expose it directly'); } else if (/^\d+$/.test(a[i])) port = Number(a[i]); else sql.push(a[i]); }
  if (!o.config) o.config = path.join(process.cwd(), 'ws_host.json');   // absent file = OFF
  start(port, sql, o).then(s => console.log('§WS listening port=' + s.address().port + ' plugin=' + (JSON.parse((() => { try { return fs.readFileSync(o.config, 'utf8'); } catch (e) { return '{}'; } })()).state || 'OFF (no ' + o.config + ')')));
}
