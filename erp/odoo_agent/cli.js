// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>. SPDX-License-Identifier: MIT
// Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §OWN-DB-SPEC — Witness: W-ODOO-OWNDB
//
// cli.js — where the agent finds YOUR Odoo. Shared by agent.js and export.js.
//   Flags work in every shell (Windows cmd included):  --host 10.0.0.5 --port 8069 --db mydb --login me --so S00042|latest --cutover 2026-12-31
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

async function config(argv) {
  var f = flags(argv || process.argv.slice(2)), e = process.env;
  var c = {
    HOST: f.host || e.ODOO_HOST || 'localhost',
    PORT: Number(f.port || e.ODOO_PORT || 8069),
    DB: f.db || e.ODOO_DB || 'odoodemo',
    LOGIN: f.login || e.ODOO_LOGIN || 'admin',
    SO: f.so || e.ODOO_SO || '',
    CUTOVER: f.cutover || e.CUTOVER || new Date().toISOString().slice(0, 10)
  };
  c.demo = c.DB === 'odoodemo' && c.LOGIN === 'admin';
  c.PASSWORD = e.ODOO_PASSWORD !== undefined ? e.ODOO_PASSWORD
    : c.demo ? 'admin'
    : await askHidden('Odoo password for ' + c.LOGIN + ' @ ' + c.DB + ' (' + c.HOST + ':' + c.PORT + '): ');
  c.passwordFrom = e.ODOO_PASSWORD !== undefined ? 'env' : c.demo ? 'demo-default' : 'prompt';
  return c;
}

module.exports = { config: config, flags: flags };
