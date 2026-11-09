// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>. SPDX-License-Identifier: MIT
// Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §OWN-DB-SPEC — Witness: W-ODOO-OWNDB
//
// cli.js — where the agent finds YOUR Odoo. Shared by agent.js and export.js.
//   Flags work in every shell (Windows cmd included):  --host 10.0.0.5 --port 8069 --db mydb --login me --so S00042|latest --cutover 2026-12-31
//   §HARDEN-SPEC H5: --url https://mycompany.odoo.com (Odoo.sh / Odoo Online / any https server; --host may carry the scheme too) · H4: --company <id> (several companies)
//   Environment variables still work (ODOO_HOST ODOO_PORT ODOO_DB ODOO_LOGIN ODOO_PASSWORD ODOO_SO CUTOVER); a flag wins.
//   No flag and no variable = the demo Odoo (odoodemo @ localhost:8069, admin/admin), so the demo needs no typing.
//   The PASSWORD is never a flag (it would sit in the shell history) and never in the browser: for any Odoo other than
//   the demo, unless ODOO_PASSWORD is set, the agent asks for it here (hidden on a terminal; one line of stdin otherwise).
'use strict';

function flags(argv) {
  var out = {};
  for (var i = 0; i < argv.length; i++) {
    var m = /^--([a-z]+)(?:=(.*))?$/.exec(argv[i]); if (!m) continue;
    out[m[1]] = m[2] !== undefined ? m[2] : (argv[i + 1] !== undefined && !/^--/.test(argv[i + 1]) ? argv[++i] : '');
  }
  if (out.password !== undefined) throw new Error('--password is not accepted (it would stay in your shell history). Set ODOO_PASSWORD or type it when asked.');
  return out;
}

function askHidden(question) {
  return new Promise(function (resolve, reject) {
    var input = process.stdin, buf = '';
    process.stderr.write(question);
    if (input.isTTY) {
      input.setRawMode(true); input.resume(); input.setEncoding('utf8');
      input.on('data', function on(ch) {
        if (ch === '\u0003') { input.setRawMode(false); process.stderr.write('\n'); process.exit(130); }
        if (ch === '\r' || ch === '\n' || ch === '\u0004') { input.setRawMode(false); input.pause(); input.removeListener('data', on); process.stderr.write('\n'); return resolve(buf); }
        if (ch === '\u007f' || ch === '\b') { buf = buf.slice(0, -1); return; }
        buf += ch;
      });
    } else {
      input.setEncoding('utf8');
      input.on('data', function (c) { buf += c; });
      input.on('end', function () { process.stderr.write('\n'); resolve(buf.split(/\r?\n/)[0]); });
      input.on('error', reject);
    }
  });
}

// H5: "https://x.odoo.com", "x.odoo.com:8443", "http://10.0.0.5:8069" → { https, host, port }. No scheme = http (the self-hosted default).
function parseUrl(u, port) {
  var m = /^(?:(https?):\/\/)?([^\/:]+)(?::(\d+))?\/?$/i.exec(String(u).trim());
  if (!m) throw new Error('--url/--host not understood: "' + u + '" (example: https://mycompany.odoo.com or 10.0.0.5)');
  var https = (m[1] || '').toLowerCase() === 'https';
  return { https: https, host: m[2], port: Number(m[3] || port || (https ? 443 : 8069)) };
}

async function config(argv) {
  if (Number(process.versions.node.split('.')[0]) < 16) { console.log('§ODOO-AGENT FAIL node: this needs Node.js 16 or newer (you have ' + process.versions.node + '). Install a current Node.js from nodejs.org and run it again.'); process.exit(1); }
  var f = flags(argv || process.argv.slice(2)), e = process.env;
  var where = parseUrl(f.url || f.host || e.ODOO_URL || e.ODOO_HOST || 'localhost', f.port || e.ODOO_PORT);
  var c = {
    HOST: where.host, HTTPS: where.https,
    PORT: where.port,
    COMPANY: f.company || e.ODOO_COMPANY || '',
    DB: f.db || e.ODOO_DB || 'odoodemo',
    LOGIN: f.login || e.ODOO_LOGIN || 'admin',
    SO: f.so || e.ODOO_SO || '',
    CUTOVER: f.cutover || e.CUTOVER || new Date().toISOString().slice(0, 10)
  };
  c.demo = c.DB === 'odoodemo' && c.LOGIN === 'admin';
  c.PASSWORD = e.ODOO_PASSWORD !== undefined ? e.ODOO_PASSWORD
    : c.demo ? 'admin'
    : await askHidden('Odoo password (or API key, if your Odoo asks for a 2-step code) for ' + c.LOGIN + ' @ ' + c.DB + ' (' + (c.HTTPS ? 'https://' : '') + c.HOST + ':' + c.PORT + '): ');
  c.passwordFrom = e.ODOO_PASSWORD !== undefined ? 'env' : c.demo ? 'demo-default' : 'prompt';
  return c;
}

module.exports = { config: config, flags: flags, parseUrl: parseUrl };
