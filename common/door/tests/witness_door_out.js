#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DOOR-OUT (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §R.V item 9). READ THE §-LOG after every run.
 * ISSUE: the list, the CSV and the envelope are three renderings of ONE answer; a renderer that drops or alters a cell, or a file written for a refused line, is a wrong report.
 *   O1 synthetic rows with a comma, a quote, a newline, an empty value and a number: the CSV parsed back (own RFC 4180 parser, not render.js's) equals the envelope's rows cell for cell
 *   O2 the --list text carries every cell of every row and ends "shown N of TOTAL"
 *   O3 a real run (erp.find Order 60000, two matches): --csv rows = the --json envelope's matches, cell for cell
 *   O4 --out f.csv writes that file; the file equals the --csv stdout
 *   O5 a refused line (no such number) with --out writes NO file
 *   O6 a script line `> a.csv` writes inside the script folder; `> ../x.csv` is refused and writes nothing; `>> a.csv` appends
 *   O7 a single record (no rows) renders as field: value lines; --csv on it says "no rows" and exits with the envelope, never an empty file
 *   O8 an empty rows answer is INCONCLUSIVE-visible: header only, "shown 0 of 0"
 * Falsifier: OUT_BREAK=droplast (render.js drops the last row) must fail O1, O2, O3.
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { kit, DOOR } = require('./_kit');
const { spawn } = require('child_process');
const run = (file, argv, env, cwd) => new Promise((res) => { let o = '', e = ''; const p = spawn(process.execPath, [file].concat(argv), { cwd: cwd || process.cwd(), env: Object.assign({}, process.env, env || {}), stdio: ['ignore', 'pipe', 'pipe'] }); p.stdout.on('data', d => { o += d; }); p.stderr.on('data', d => { e += d; }); p.on('close', c => res({ code: c, out: o, err: e })); });
const R = require('../render.js');
const k = kit('W-DOOR-OUT');
function parseCsv(t) {   // independent RFC 4180 reader
  const rows = []; let row = [], f = '', q = false, i = 0;
  while (i < t.length) { const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\r' && t[i + 1] === '\n') { row.push(f); rows.push(row); row = []; f = ''; i++; } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else f += c;
    i++; }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const cells = (rows, cols) => rows.map(r => cols.map(c => R.cell(r[c])));
(async () => {
  const rows = [{ a: 'x,y', b: 'say "hi"', c: 'line1\nline2', d: null, e: 12.50 }, { a: 'plain', b: '', c: '', d: 'z', e: 0.1 }, { a: 'last', b: 'row', c: 'is', d: 'kept', e: 3 }];
  const env = { status: 'ok', answer: { columns: ['a', 'b', 'c', 'd', 'e'], rows, total: 3 } };
  const csv = R.toCsv(env), back = parseCsv(csv);
  k.chk('O1 CSV parsed back = envelope rows, cell for cell (comma, quote, newline, empty, number)', JSON.stringify(back.slice(1)) === JSON.stringify(cells(rows, env.answer.columns)) && back[0].join() === 'a,b,c,d,e', 'rows=' + (back.length - 1) + ' of ' + rows.length);
  const list = R.toList(env);
  k.chk('O2 the list ends "shown 3 of 3" and every cell is in it', /shown 3 of 3\n$/.test(list) && ['x,y', 'say "hi"', 'line1\\nline2', 'plain', 'last', 'kept', '12.5', '0.1'].every(x => list.indexOf(x) >= 0), 'lines=' + list.split('\n').length);
  // O3 real
  const J = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'out_')), 'j.jsonl');
  const Q = 'erp.find kind=Order number=60000';
  const rj = await run(DOOR, ['--journal', J, Q]), rc = await run(DOOR, ['--journal', J, '--csv', Q]);
  let ej = null; try { ej = JSON.parse(rj.out); } catch (e) {}
  if (!ej || ej.status !== 'ok' || !ej.answer.matches || !ej.answer.matches.length) { k.incon('O3', 'the real run answered ' + (rj.out || rj.err).slice(0, 160)); }
  else {
    const b = parseCsv(rc.out), cols = b[0], want = cells(ej.answer.matches, cols);
    k.chk('O3 real run: --csv = --json matches, cell for cell (' + ej.answer.matches.length + ' rows)', JSON.stringify(b.slice(1)) === JSON.stringify(want) && ej.answer.matches.length >= 2, 'cols=' + cols.join('|'));
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'outd_')), f = path.join(d, 'f.csv');
    const ro = await run(DOOR, ['--journal', J, '--csv', '--out', 'f.csv', Q], {}, d);
    k.chk('O4 --out f.csv writes the file, equal to --csv stdout', fs.existsSync(f) && fs.readFileSync(f, 'utf8') === rc.out, 'bytes=' + (fs.existsSync(f) ? fs.statSync(f).size : 'none'));
    const d5 = fs.mkdtempSync(path.join(os.tmpdir(), 'outr_')); await run(DOOR, ['--journal', J, '--csv', '--out', 'g.csv', 'erp.find kind=Order number=NOSUCH99'], {}, d5);
    k.chk('O5 a refused line writes no file', !fs.existsSync(path.join(d5, 'g.csv')), fs.readdirSync(d5).join(',') || 'folder empty');
    const d6 = fs.mkdtempSync(path.join(os.tmpdir(), 'outs_')), sc = path.join(d6, 's.door'); fs.mkdirSync(path.join(d6, 'sub'));
    fs.writeFileSync(sc, Q + ' > a.csv\n' + Q + ' >> a.csv\n'); const r6 = await run(DOOR, ['--journal', J, '--script', sc]);
    const a = fs.existsSync(path.join(d6, 'a.csv')) ? fs.readFileSync(path.join(d6, 'a.csv'), 'utf8') : '';
    k.chk('O6a `> a.csv` then `>> a.csv`: file holds the CSV twice (appended)', a === rc.out + rc.out, 'bytes=' + a.length + ' want=' + (rc.out.length * 2));
    fs.writeFileSync(sc, Q + ' > ../escape.csv\n'); const r6b = await run(DOOR, ['--journal', J, '--script', sc]);
    k.chk('O6b `> ../escape.csv` is refused and writes nothing', !fs.existsSync(path.join(d6, '..', 'escape.csv')) && /leaves the folder/.test(r6b.err), (r6b.err.split('\n').filter(x => /out /.test(x)).slice(-1)[0] || '').slice(0, 120));
  }
  const rec = { status: 'ok', answer: { ok: true, building: 'Duplex', n: 3 } };
  k.chk('O7a a single record renders as field: value lines', R.toList(rec) === 'ok: true\nbuilding: Duplex\nn: 3\n', JSON.stringify(R.toList(rec)));
  k.chk('O7b CSV of a record is null (no rows), not an empty file', R.toCsv(rec) === null);
  const emp = R.toList({ status: 'ok', answer: { columns: ['a', 'b'], rows: [], total: 0 } });
  k.chk('O8 empty rows: header only and "shown 0 of 0"', emp === 'a  b\nshown 0 of 0\n', JSON.stringify(emp));
  k.end();
})().catch(e => { console.log('§WITNESS_DOOR_OUT verdict=INCONCLUSIVE ' + (e && e.stack || e)); process.exit(2); });
