'use strict';
// shared bits for the door witnesses (W-DOOR-*, W-VOCAB-*, W-REPLY-HONEST, W-DSL). Each witness prints its own § lines; this only counts.
const path = require('path'), fs = require('fs'), os = require('os'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..'), DOOR = path.join(ROOT, 'common', 'door', 'door.js');
function kit(tag) {
  const k = { pass: 0, fail: 0, inc: 0 };
  k.L = (m) => console.log('§' + tag + ' ' + m);
  k.chk = (name, ok, info) => { if (ok) k.pass++; else k.fail++; console.log('  ' + (ok ? '✅' : '❌') + ' ' + name + (info ? '  ' + info : '')); };
  k.incon = (id, why) => { k.inc++; k.L('INCONCLUSIVE ' + id + ' — ' + why); };
  k.end = () => { const v = k.fail ? 'FAIL' : (k.inc ? 'INCONCLUSIVE' : 'PASS'); console.log('§WITNESS_' + tag.replace(/^W-/, '').replace(/-/g, '_') + ' pass=' + k.pass + ' fail=' + k.fail + ' inconclusive=' + k.inc + ' verdict=' + v + (process.env.DOOR_BREAK ? ' (DOOR_BREAK=' + process.env.DOOR_BREAK + ')' : '') + (process.env.MCP_BREAK ? ' (MCP_BREAK=' + process.env.MCP_BREAK + ')' : '')); process.exit(k.fail ? 1 : (k.inc ? 2 : 0)); };
  return k;
}
const tmp = (p) => path.join(fs.mkdtempSync(path.join(os.tmpdir(), p || 'door_')), 'x');
const run = (file, argv, env) => new Promise((res) => { let o = '', e = ''; const p = spawn(process.execPath, [file].concat(argv), { env: Object.assign({}, process.env, env || {}), stdio: ['ignore', 'pipe', 'pipe'] }); p.stdout.on('data', d => { o += d; }); p.stderr.on('data', d => { e += d; }); p.on('close', c => res({ code: c, out: o.trim(), err: e.trim() })); });
const stripMs = (t) => { try { const j = typeof t === 'string' ? JSON.parse(t) : JSON.parse(JSON.stringify(t)); delete j.ms; return JSON.stringify(j); } catch (e) { return 'UNPARSEABLE ' + String(t).slice(0, 80); } };
module.exports = { kit, tmp, run, stripMs, ROOT, DOOR };
