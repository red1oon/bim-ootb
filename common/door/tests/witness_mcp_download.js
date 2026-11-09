#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-MCP-DOWNLOAD (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §0.7 FIX). READ THE §-LOG after every run.
 * ISSUE: #2766 broke the published connector's empty-folder download (door.js not found); every repo-layout witness stayed green. This one does what an outsider does:
 * fetch ONLY the files the public guide lists (bim_mcp.js, edit_cli.js, door.js, verbs.json) into an empty folder, HOME pointed there, run the connector.
 *   node witness_mcp_download.js            the LIVE site (green only after GitHub Pages serves the fix)
 *   node witness_mcp_download.js --local    a static copy of THIS tree served on localhost (the same layout Pages serves)
 *   D1 initialize + tools/list from the flat folder give the 4 published tools   D2 one bim_lines call answers (live Modeller, ok, grid lines)
 *   D3 with ONE file removed (each of door.js, verbs.json, edit_cli.js) the connector fails (exit 1) and names that file with its curl line
 * Falsifier: --drop bim_mcp.js-less list is not needed; D3 is the falsifier (a connector that starts without its file fails D3).
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), https = require('https'), { spawn } = require('child_process');
const { kit, ROOT } = require('./_kit');
const k = kit('W-MCP-DOWNLOAD'), LOCAL = process.argv.indexOf('--local') >= 0;
const LISTED = ['modeller/tools/bim_mcp.js', 'modeller/tools/edit_cli.js', 'common/door/door.js', 'common/door/verbs.json'];   // the guide's download lines
const get = (base, rel) => new Promise((res, rej) => (base.startsWith('https') ? https : http).get(base + rel + '?nc=' + Date.now(), (r) => { if (r.statusCode !== 200) { rej(new Error('HTTP ' + r.statusCode + ' ' + base + rel)); r.resume(); return; } const c = []; r.on('data', d => c.push(d)); r.on('end', () => res(Buffer.concat(c))); }).on('error', rej));
function folder(files) { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp_dl_')); files.forEach(([rel, buf]) => fs.writeFileSync(path.join(d, path.basename(rel)), buf)); return d; }
function runConn(dir, calls) {
  return new Promise((res) => {
    const env = Object.assign({}, process.env, { HOME: dir, BIM_DOOR_JOURNAL: '', PUPPETEER_CACHE_DIR: process.env.PUPPETEER_CACHE_DIR || path.join(os.userInfo().homedir, '.cache', 'puppeteer') }); delete env.BIM_DOOR_JOURNAL;
    const p = spawn(process.execPath, [path.join(dir, 'bim_mcp.js')], { cwd: dir, env, stdio: ['pipe', 'pipe', 'pipe'] }); let o = '', e = '';
    const got = {}; p.stdout.on('data', d => { o += d; o.split('\n').filter(Boolean).forEach(l => { try { const m = JSON.parse(l); got[m.id] = m; } catch (x) {} }); if (calls.every(c => got[c.id])) p.stdin.end(); });
    p.stderr.on('data', d => { e += d; }); p.on('close', code => res({ code, got, err: e }));
    calls.forEach(c => p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: c.id, method: c.method, params: c.params }) + '\n'));
    setTimeout(() => p.kill(), 240000);
  });
}
(async () => {
  let server = null, base = 'https://red1oon.github.io/bim-ootb/';
  if (LOCAL) { server = http.createServer((q, r) => { fs.readFile(path.join(ROOT, decodeURIComponent(q.url.split('?')[0])), (er, b) => { if (er) { r.writeHead(404); r.end(); } else { r.writeHead(200); r.end(b); } }); }); await new Promise(r => server.listen(0, r)); base = 'http://localhost:' + server.address().port + '/'; }
  k.L('source ' + base + (LOCAL ? ' (local static copy of this tree)' : ' (LIVE)'));
  let files; try { files = await Promise.all(LISTED.map(async rel => [rel, await get(base, rel)])); } catch (e) { k.incon('FETCH', String(e.message)); if (server) server.close(); return k.end(); }
  const dir = folder(files); k.L('empty folder ' + dir + ' holds ' + fs.readdirSync(dir).join(','));
  const r = await runConn(dir, [{ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', clientInfo: { name: 'witness_mcp_download' } } }, { id: 2, method: 'tools/list', params: {} }, { id: 3, method: 'tools/call', params: { name: 'bim_lines', arguments: { building: 'HospitalGarage' } } }]);
  const names = r.got[2] && r.got[2].result ? r.got[2].result.tools.map(t => t.name).join(',') : '';
  k.chk('D1 flat download: initialize + tools/list give the 4 published tools', !!r.got[1] && names === 'bim_lines,bim_try_shift,viewer_counts,viewer_clashes', 'tools=' + names + ' exit=' + r.code + (names ? '' : ' stderr=' + r.err.split('\n').slice(0, 2).join(' | ')));
  let lj = null; try { lj = JSON.parse(r.got[3].result.content[0].text); } catch (e) {}
  k.chk('D2 flat download: bim_lines answers from the live Modeller (ok, grid lines)', !!lj && lj.ok === true && lj.model && lj.model.lines.length > 5 && r.got[3].result.isError === false, 'lines=' + (lj && lj.model && lj.model.lines.length) + (lj ? '' : ' result=' + JSON.stringify(r.got[3] && r.got[3].result).slice(0, 200) + ' err=' + r.err.split('\n').slice(-3).join(' | ')));
  for (const rel of ['common/door/door.js', 'common/door/verbs.json', 'modeller/tools/edit_cli.js']) {
    const d = folder(files.filter(f => f[0] !== rel)), x = await runConn(d, [{ id: 1, method: 'initialize', params: {} }]), b = path.basename(rel);
    k.chk('D3 without ' + b + ': exit 1, names it and prints its curl line', x.code === 1 && x.err.indexOf('curl -O https://red1oon.github.io/bim-ootb/' + rel) >= 0, 'exit=' + x.code + ' ' + x.err.split('\n')[0].slice(0, 100));
  }
  if (server) server.close();
  k.end();
})().catch(e => { console.log('§WITNESS_MCP_DOWNLOAD verdict=INCONCLUSIVE ' + (e && e.stack || e)); process.exit(2); });
