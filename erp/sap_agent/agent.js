#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — sap_agent/agent.js: SAP Business One → BIM-OOTB ERP, ALPHA (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §SAP-SPEC — Witness: W-SAP-MIGRATE,
//   erp/tests/witness_sap_migrate.js). READ THE LOG: every step prints a §SAP-AGENT line.
// WHAT IT DOES: you run it on a machine that can reach YOUR Business One Service Layer. It logs in, reads the model your server publishes ($metadata), reads the master data
//   (read only: GET, plus Login / Logout) and writes ONE file, sap_export.json, which you then drop on "Migrate from SAP Business One (alpha)" in the browser.
//   The browser never connects to SAP; your password never leaves this machine.
// WHERE THE FIELD NAMES COME FROM: SAP's guide "Working with SAP Business One Service Layer" (v1.26) — and every one is checked against YOUR server's $metadata before it is
//   asked for. A field your server does not have is listed as missing in the manifest (§SAP-FIELD), never guessed.
// No npm dependencies: Node 18+ (built-in fetch).
//   node agent.js --url https://<server>:50000 --company <CompanyDB> --user <user> [--insecure] [--out sap_export.json] [--page 100] [--cutover YYYY-MM-DD [--openfile sap_open.json]]
//   password: SAP_PASSWORD, else asked here (hidden). --insecure accepts B1's self-signed certificate.
'use strict';
var fs = require('fs'), crypto = require('crypto');

// the sets this alpha reads and the fields it maps (the converter, erp/plugins/sap_migrate_convert.mjs, uses exactly these)
var SETS = {
  UnitOfMeasurements: { type: 'UnitOfMeasurement', fields: ['AbsEntry', 'Code', 'Name', 'InternationalSymbol'] },
  PaymentTermsTypes: { type: 'PaymentTermsType', fields: ['GroupNumber', 'PaymentTermsGroupName', 'NumberOfAdditionalDays', 'NumberOfAdditionalMonths', 'StartFrom'] },
  ItemGroups: { type: 'ItemGroups', fields: ['Number', 'GroupName'] },
  ChartOfAccounts: { type: 'ChartOfAccount', fields: ['Code', 'Name', 'AccountType', 'ActiveAccount', 'FatherAccountKey', 'AccountLevel'] },
  BusinessPartners: { type: 'BusinessPartner', fields: ['CardCode', 'CardName', 'CardType', 'FederalTaxID', 'Phone1', 'Phone2', 'Cellular', 'EmailAddress', 'ContactPerson', 'Valid', 'Frozen', 'BPAddresses', 'ContactEmployees'] },
  Items: { type: 'Item', fields: ['ItemCode', 'ItemName', 'ForeignName', 'ItemsGroupCode', 'ItemType', 'InventoryItem', 'BarCode', 'Mainsupplier', 'SupplierCatalogNo', 'Valid', 'Frozen', 'InventoryUOM', 'SalesUnitWeight', 'SalesUnitVolume', 'ItemPrices', 'ItemWarehouseInfoCollection'] },
  PriceLists: { type: 'PriceList', fields: ['PriceListNo', 'PriceListName', 'DefaultPrimeCurrency', 'Active'] },
  Warehouses: { type: 'Warehouse', fields: ['WarehouseCode', 'WarehouseName', 'Street', 'Block', 'City', 'ZipCode', 'County', 'State', 'Country', 'Inactive'] },
  BinLocations: { type: 'BinLocation', fields: ['AbsEntry', 'Warehouse', 'BinCode', 'Inactive'] }
};

function flags(argv) {
  var out = {};
  for (var i = 0; i < argv.length; i++) { var m = /^--([a-z]+)(?:=(.*))?$/.exec(argv[i]); if (!m) continue; out[m[1]] = m[2] !== undefined ? m[2] : (argv[i + 1] !== undefined && !/^--/.test(argv[i + 1]) ? argv[++i] : ''); }
  if (out.password !== undefined) throw new Error('--password is not accepted (it would stay in your shell history). Set SAP_PASSWORD or type it when asked.');
  return out;
}
function askHidden(q) {
  return new Promise(function (resolve) { var input = process.stdin, buf = ''; process.stderr.write(q);
    if (input.isTTY) { input.setRawMode(true); input.resume(); input.setEncoding('utf8');
      input.on('data', function on(ch) { if (ch === '\u0003') { input.setRawMode(false); process.exit(130); }
        if (ch === '\r' || ch === '\n' || ch === '\u0004') { input.setRawMode(false); input.pause(); input.removeListener('data', on); process.stderr.write('\n'); return resolve(buf); }
        if (ch === '\u007f' || ch === '\b') { buf = buf.slice(0, -1); return; } buf += ch; });
    } else { input.setEncoding('utf8'); input.on('data', function (c) { buf += c; }); input.on('end', function () { resolve(buf.split(/\r?\n/)[0]); }); } });
}

// $metadata (EDMX, OData v3 or v4) → { types: { name: [property names] }, sets: { set: type }, version }
function readMetadata(xml) {
  var types = {}, sets = {}, re = /<(EntityType|ComplexType)\b([^>]*)>([\s\S]*?)<\/\1>/g, m;
  while ((m = re.exec(xml))) { var nm = /\bName="([^"]+)"/.exec(m[2]); if (!nm) continue; var ps = [], pr = /<(?:Navigation)?Property\b([^>]*?)\/?>/g, p;
    while ((p = pr.exec(m[3]))) { var pn = /\bName="([^"]+)"/.exec(p[1]); if (pn) ps.push(pn[1]); } types[nm[1]] = ps; }
  var sr = /<EntitySet\b([^>]*)>/g; while ((m = sr.exec(xml))) { var n = /\bName="([^"]+)"/.exec(m[1]), t = /\bEntityType="(?:[A-Za-z0-9_]+\.)?([^"]+)"/.exec(m[1]); if (n && t) sets[n[1]] = t[1]; }
  var v = /<edmx:Edmx\b[^>]*\bVersion="([^"]+)"/.exec(xml);
  return { types: types, sets: sets, version: v ? v[1] : '' };
}

// run(opts, fetchImpl, log) -> the export object. opts: { url, company, user, password, page }
async function run(opts, fetchImpl, log) {
  var F = fetchImpl || fetch, say = log || function (s) { console.log(s); }, base = String(opts.url || '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) throw new Error('--url must be the Service Layer address, e.g. https://myserver:50000');
  var root = /\/b1s\/v[12]$/.test(base) ? base : base + '/b1s/v1', origin = /^(https?:\/\/[^/]+)/.exec(root)[1], cookie = '', calls = [];
  async function call(method, p, body, extra) {
    var u = /^https?:/.test(p) ? p : p.charAt(0) === '/' ? origin + p : root + '/' + p, h = Object.assign({ Accept: 'application/json' }, extra || {});
    if (cookie) h.Cookie = cookie; if (body) h['Content-Type'] = 'application/json';
    calls.push(method + ' ' + u.replace(origin, ''));
    var r = await F(u, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined });
    var txt = await r.text(); if (!r.ok) { var e = new Error(method + ' ' + u.replace(origin, '') + ' → HTTP ' + r.status + ' ' + txt.slice(0, 300)); e.status = r.status; throw e; }
    return { r: r, txt: txt };
  }
  // 1. Login (guide §3.1): the B1SESSION (+ ROUTEID) cookie goes on every request after
  var li = await call('POST', 'Login', { CompanyDB: opts.company, UserName: opts.user, Password: opts.password });
  var sc = li.r.headers.getSetCookie ? li.r.headers.getSetCookie() : String(li.r.headers.get('set-cookie') || '').split(/,(?=\s*[A-Za-z0-9_]+=)/);
  cookie = sc.map(function (c) { return String(c).split(';')[0].trim(); }).filter(function (c) { return /^(B1SESSION|ROUTEID)=/.test(c); }).join('; ');
  var lj = {}; try { lj = JSON.parse(li.txt); } catch (e) {}
  say('§SAP-AGENT login ok session=' + (/B1SESSION=/.test(cookie) ? 'Y' : 'N') + ' version=' + (lj.Version || '?') + ' timeout=' + (lj.SessionTimeout || '?'));
  if (!/B1SESSION=/.test(cookie)) throw new Error('Login answered without a B1SESSION cookie — is this a Service Layer address?');
  var out = { manifest: { tool: 'erp/sap_agent/agent.js', format: 'sap-b1-export-v1', alpha: true, company: opts.company, version: lj.Version || '', sets: {} }, sets: {} };
  try {
    // 2. the model YOUR server publishes (guide §3.3)
    var md = await call('GET', '$metadata', null, { Accept: 'application/xml' }), meta = readMetadata(md.txt);
    out.manifest.metadata = { sha256: crypto.createHash('sha256').update(md.txt).digest('hex'), bytes: md.txt.length, edmx: meta.version, types: Object.keys(meta.types).length, sets: Object.keys(meta.sets).length };
    say('§SAP-AGENT metadata edmx=' + meta.version + ' types=' + out.manifest.metadata.types + ' sets=' + out.manifest.metadata.sets + ' sha=' + out.manifest.metadata.sha256.slice(0, 16));
    // 3. each set: the fields your server has, its $count, then every page (guide §3.7: Prefer odata.maxpagesize, odata.nextLink / @odata.nextLink)
    for (var s of Object.keys(SETS)) {
      var spec = SETS[s], ty = meta.sets[s], have = ty && meta.types[ty] ? meta.types[ty] : null, ms = out.manifest.sets[s] = { type: ty || null };
      if (!have) { ms.missing_set = true; out.sets[s] = []; say('§SAP-FIELD set=' + s + ' missing — your server publishes no such set; nothing read'); continue; }
      var read = spec.fields.filter(function (f) { return have.indexOf(f) >= 0; }), miss = spec.fields.filter(function (f) { return have.indexOf(f) < 0; });
      ms.fields_read = read; ms.fields_missing = miss;
      if (miss.length) say('§SAP-FIELD set=' + s + ' missing=' + JSON.stringify(miss) + ' — those columns stay empty');
      var cnt = await call('GET', s + '/$count'); ms.count = Number(String(cnt.txt).replace(/[^0-9]/g, '')) || 0;
      var rows = [], next = s + '?$select=' + read.join(','), pages = 0;
      while (next) { var pg = await call('GET', next, null, { Prefer: 'odata.maxpagesize=' + (opts.page || 100) }), j = JSON.parse(pg.txt); pages++;
        (j.value || []).forEach(function (r) { var o = {}; read.forEach(function (f) { if (r[f] !== undefined) o[f] = r[f]; }); rows.push(o); });
        next = j['@odata.nextLink'] || j['odata.nextLink'] || ''; if (pages > 100000) throw new Error(s + ': paging did not end'); }
      out.sets[s] = rows; ms.rows = rows.length; ms.pages = pages;
      say('§SAP-AGENT set=' + s + ' count=' + ms.count + ' rows=' + rows.length + ' pages=' + pages + ' fields=' + read.length + '/' + spec.fields.length + (ms.count === rows.length ? '' : ' COUNT≠ROWS'));
    }
    // 4. the company's local currency and country — only if your server declares the function (it is in SAP's metadata; how to call it is not in the guide: tried as POST)
    if (/Name="CompanyService_GetAdminInfo"/.test(md.txt)) {
      try { var ai = JSON.parse((await call('POST', 'CompanyService_GetAdminInfo')).txt); out.admin = { LocalCurrency: ai.LocalCurrency || '', Country: ai.Country || '', SystemCurrency: ai.SystemCurrency || '' };
        say('§SAP-AGENT admininfo currency=' + out.admin.LocalCurrency + ' country=' + out.admin.Country); }
      catch (e) { say('§SAP-AGENT admininfo unavailable (' + String(e.message).slice(0, 120) + ') — the price list currency is used, the country is asked'); }
    } else say('§SAP-AGENT admininfo not declared by this server');
  } finally {
    try { await call('POST', 'Logout'); say('§SAP-AGENT logout ok'); } catch (e) { say('§SAP-AGENT logout failed ' + String(e.message).slice(0, 120)); }
  }
  out.manifest.calls = calls;
  out.manifest.read_only = calls.every(function (c) { return /^GET /.test(c) || /^POST \/b1s\/v[12]\/(Login|Logout|CompanyService_GetAdminInfo)$/.test(c); });
  say('§SAP-AGENT done calls=' + calls.length + ' read_only=' + (out.manifest.read_only ? 'Y' : 'N') + ' sets=' + Object.keys(out.sets).length + ' rows=' + Object.keys(out.sets).reduce(function (n, k) { return n + out.sets[k].length; }, 0));
  return out;
}

module.exports = { run: run, readMetadata: readMetadata, SETS: SETS };

if (require.main === module) (async function () {
  var f = flags(process.argv.slice(2));
  if (!f.url || !f.company || !f.user) { console.error('usage: node agent.js --url https://<server>:50000 --company <CompanyDB> --user <user> [--insecure] [--out sap_export.json] [--cutover YYYY-MM-DD [--openfile sap_open.json]]'); process.exit(2); }
  if (f.insecure !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  var pw = process.env.SAP_PASSWORD || await askHidden('Password for ' + f.user + '@' + f.company + ': ');
  var out = await run({ url: f.url, company: f.company, user: f.user, password: pw, page: Number(f.page) || 100 });
  var file = f.out || 'sap_export.json'; fs.writeFileSync(file, JSON.stringify(out, null, 1));
  console.log('§SAP-AGENT wrote ' + file + ' — drop it on "Migrate from SAP Business One (alpha)" in the browser. ALPHA: please send the §SAP lines above back (they hold counts and field names, no data).');
  if (f.cutover) {   // open balances at the cut-over (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §SAP-BC-OPEN-SPEC): a second, separate file; the masters file above is unchanged
    var op = await require('./open_reader.js').run({ url: f.url, company: f.company, user: f.user, password: pw, page: Number(f.page) || 100, cutover: f.cutover });
    var ofile = f.openfile || 'sap_open.json'; fs.writeFileSync(ofile, JSON.stringify(op, null, 1)); console.log('§SAP-OPEN wrote ' + ofile + ' (ALPHA: read only, never run on a real company by its author).');
  }
})().catch(function (e) { console.error('§SAP-AGENT ERROR ' + (e && e.message)); process.exit(1); });
