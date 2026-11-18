#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-LODUP-SCHEDFMT: schedule formats are DATA, and a building with another firm's schedule adopts the Beam rebar pack by adding one format entry. Read the log (§LODUP_SCHEDFMT_*); the exit code is not evidence.
 * Spec: prompts/MODELLER_LOD_UPGRADE_PILL.md "P8 SPEC". THE ISSUE THIS PROVES OR DISPROVES: "the beam rebar pack only works on the one building it was built on".
 *   FORMATS_VALID   the shipped schedule_formats.json validates; malformed entries (no join, a bad regex, an unknown field, a required field with no column) are refused with a reason.
 *   PARITY_MARKS    (LODUP_S401_DXF + LODUP_MARKS_JSON) the JS reading the drawing through the shipped format gives the proven marks file: every mark, every field, every cell text, every citation equal.
 *   FORMAT_DETECT   that sheet matches exactly one format.
 *   READ_HOOK       the pack's own "Load schedule…" reader (readSchedule) on the .dxf and on a .json: the marks carry their _format; a .json naming no format while two formats exist is refused.
 *   SECOND_FIRM     (synthetic, hand-derived truth) a schedule with other headings is REFUSED with its headings listed; after ONE format entry is added (data, no code) it parses to the hand-derived marks and a model
 *                   whose beams are named another way joins through that entry and builds bars.
 *   AMBIGUOUS       two formats matching one table: refused, both named.
 *   NO_FORMAT       the red control: the S-401 sheet with the shipped entry removed is refused.
 *   JOIN_HOSPITAL   (LODUP_HOSP_DB) the pack on the Hospital model applies to 0 and says why (no IfcBeam name matches the format's mark_regex), never a silent 0.
 * Inputs by environment only (private drawings stay out of the repo). Unset = the synthetic checks alone, the real ones INCONCLUSIVE, never PASS.
 */
'use strict';
var fs = require('fs'), path = require('path');
global.window = undefined;
var ROOT = process.env.MODELLER_ROOT || path.join(__dirname, '..'), E = process.env;
var S = require(path.join(ROOT, 'lod/lod_schedule.js')), Beam = require(path.join(ROOT, 'lod/beambar_pack.js')), Rules = require(path.join(ROOT, 'lod/lod_rules.js')), Reader = require(path.join(ROOT, 'lod/lod_reader.js'));
var DxfParser = require(path.join(ROOT, 'lib/dxf-parser.js')), T = require(path.join(ROOT, 'dxf2tables.js'));
var initSqlJs = require(path.join(ROOT, 'lib', 'sql-wasm.js')), wasmBinary = fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm'));
var FAILS = [], INCONC = [];
function verdict(name, ok, line) { var v = ok === null ? 'INCONCLUSIVE' : ok ? 'PASS' : 'FAIL'; console.log('§LODUP_SCHEDFMT_' + name + ' ' + line + ' -> ' + v); if (v === 'FAIL') FAILS.push(name); if (v === 'INCONCLUSIVE') INCONC.push(name); return v; }
var canon = function (o) { return JSON.stringify(o, function (k, v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? Object.keys(v).sort().reduce(function (a, x) { a[x] = v[x]; return a; }, {}) : v; }); };
var DOC = JSON.parse(fs.readFileSync(path.join(ROOT, 'lod/rules/schedule_formats.json'), 'utf8')), FV = S.validateFormats(DOC), SHIPPED = FV.ok ? FV.list : [];
var sheetOf = function (file) { var dxf = new DxfParser().parseSync(fs.readFileSync(file, 'utf8')); return T.read({ name: path.basename(file), dxf: dxf }); };
var ctxOf = function (formats) { return { formats: formats, LodSchedule: S, dxfSheet: async function (text, name) { try { return { ok: true, sheet: T.read({ name: name, dxf: new DxfParser().parseSync(text) }) }; } catch (e) { return { ok: false, why: e.message }; } } }; };

(async function () {
  // ---- FORMATS_VALID
  var f0 = SHIPPED[0], clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  var bad1 = clone(f0); delete bad1.join; var bad2 = clone(f0); bad2.columns.w = '(['; var bad3 = clone(f0); bad3.columns.weight = 'X'; var bad4 = clone(f0); bad4.required = bad4.required.concat(['top_e']); delete bad4.columns.top_e;
  var rs = [bad1, bad2, bad3, bad4].map(function (b) { return S.validateFormats({ formats: [b] }); });
  verdict('FORMATS_VALID', FV.ok && rs.every(function (r) { return !r.ok; }), 'shipped: ' + (FV.ok ? FV.summary : 'REFUSED ' + FV.why) + ' | refused: ' + rs.map(function (r) { return r.ok ? 'ACCEPTED (wrong)' : r.why; }).join(' ; '));

  // ---- the real sheet
  var REAL = !!(E.LODUP_S401_DXF && E.LODUP_MARKS_JSON), sheet = null;
  if (REAL) {
    sheet = sheetOf(E.LODUP_S401_DXF); var ref = JSON.parse(fs.readFileSync(E.LODUP_MARKS_JSON, 'utf8')), name = path.basename(E.LODUP_S401_DXF), r = S.read(sheet, SHIPPED, name);
    console.log('[real] ' + (r.detect || '') + ' | ' + (r.line || r.why));
    var keys = Object.keys(ref).filter(function (k) { return k.charAt(0) !== '_'; }), diff = keys.filter(function (k) { return canon(ref[k]) !== canon((r.marks || {})[k]); }), extra = Object.keys(r.marks || {}).filter(function (k) { return !(k in ref); });
    verdict('PARITY_MARKS', r.ok && keys.length > 0 && !diff.length && !extra.length, 'proven=' + keys.length + ' js=' + Object.keys(r.marks || {}).length + ' differing=' + diff.length + (diff.length ? ' first=' + diff[0] : '') + ' extra=' + extra.length + ' (every field, every cell text, every citation)');
    var d = S.detect(sheet, SHIPPED); verdict('FORMAT_DETECT', d.ok && d.format.id === 'revit-s401-style', d.ok ? 'format=' + d.format.id + ' tables=' + d.tables : 'REFUSED ' + d.why);
    var rh = await Beam.readSchedule(fs.readFileSync(E.LODUP_S401_DXF, 'utf8'), name, ctxOf(SHIPPED)), rj = await Beam.readSchedule(JSON.stringify(ref), 's401_marks.json', ctxOf(SHIPPED));
    var two = SHIPPED.concat([Object.assign(clone(f0), { id: 'other' })]), rn = await Beam.readSchedule(JSON.stringify(ref), 's401_marks.json', ctxOf(two)), named = Object.assign({ _format: 'revit-s401-style' }, ref), rk = await Beam.readSchedule(JSON.stringify(named), 'named.json', ctxOf(two));
    verdict('READ_HOOK', rh.ok && rh.json._format && rh.json._format.id === 'revit-s401-style' && rj.ok && rj.json._format.id === 'revit-s401-style' && !rn.ok && rk.ok && rk.json._format.id === 'revit-s401-style',
      'dxf: ' + (rh.ok ? rh.summary : 'REFUSED ' + rh.why) + ' | json: ' + (rj.ok ? rj.summary : 'REFUSED ' + rj.why) + ' | json naming no format, 2 formats: ' + (rn.ok ? 'ACCEPTED (wrong)' : 'refused: ' + rn.why) + ' | json naming its format: ' + (rk.ok ? 'ok' : 'REFUSED ' + rk.why));
    var nf = S.read(sheet, [], name), nf2 = S.read(sheet, [Object.assign(clone(f0), { id: 'firm-b-only', key_column: '^MARK$' })], name);
    verdict('NO_FORMAT', !nf.ok && !nf2.ok && /no schedule format matches/.test(nf2.why), 'switch=on (the shipped entry removed): ' + (nf2.ok ? 'ACCEPTED (wrong)' : 'refused: ' + String(nf2.why).slice(0, 160)) + ' expected refused');
  } else ['PARITY_MARKS', 'FORMAT_DETECT', 'READ_HOOK', 'NO_FORMAT'].forEach(function (k) { verdict(k, null, 'LODUP_S401_DXF / LODUP_MARKS_JSON not set: not judged'); });

  // ---- SECOND_FIRM: another firm's schedule, hand-derived truth (2 marks)
  var firmB = { name: 'firmB_schedule.dxf', tables: [{ columns: ['MARK', 'B', 'D', 'BOT', 'TOP', 'SIDE', 'LINKS'], rows: [{ cells: ['B1', '250', '500', '3T16', '2T12', '-', '2T8-200'] }, { cells: ['B2', '300', '600', '4T20 + 1T16', '2T16', '2T10-300', '2T10-150'] }, { cells: ['', '', '', '', '', '', ''] }] }] };
  var refusedFirst = S.read(firmB, SHIPPED, firmB.name);
  var entry = { id: 'firm-b-style', label: 'Firm B beam schedule', status: 'synthetic test', source: 'W-LODUP-SCHEDFMT hand-made', key_column: '^MARK$', columns: { w: '^B$', h: '^D$', bottom_a: '^BOT', top_d: '^TOP', side: '^SIDE', end_outer: '^LINKS' }, required: ['w', 'h', 'bottom_a', 'top_d', 'end_outer'],
    bar_split: '[+,&]', bar_grammar: f0.bar_grammar, stirrup_grammar: f0.stirrup_grammar, empty_cell: ['', '-'], join: { host_class: 'IfcBeam', mark_source: 'element_name', mark_regex: 'beam (B[0-9]+)$' } };
  var withB = SHIPPED.concat([entry]), vB = S.validateFormats({ formats: withB }), rB = S.read(firmB, withB, firmB.name);
  var truth = { B1: { w: 250, h: 500, bottom: [[3, 16]], top: [[2, 12]], hanger: [], side: '', stirrup: [8, 200], stirrup_legs: 2, stirrup_balance: null, stirrup_inner: '' }, B2: { w: 300, h: 600, bottom: [[4, 20], [1, 16]], top: [[2, 16]], hanger: [], side: '2T10-300', stirrup: [10, 150], stirrup_legs: 2, stirrup_balance: null, stirrup_inner: '' } };
  var gotOk = rB.ok && Object.keys(truth).every(function (k) { var g = rB.marks[k], o = {}; if (!g) return false; Object.keys(truth[k]).forEach(function (x) { o[x] = g[x]; }); return canon(o) === canon(truth[k]); }) && Object.keys(rB.marks).length === 2 && rB.marks.B2.source === 'firmB_schedule.dxf table 0 row 1 (mark B2)';
  // a model named the firm-B way joins through the new entry
  var meta = { G1: { cls: 'IfcBeam', name: 'Concrete beam B1', storey: 'L1' }, G2: { cls: 'IfcBeam', name: 'Concrete beam B2', storey: 'L1' }, G3: { cls: 'IfcBeam', name: 'Steel beam UB305', storey: 'L1' } };
  var jB = rB.ok ? Beam.joinOf({ meta: meta, inputs: { beambars: { schedule: Beam.attachFormat(rB.marks, withB, 'firm-b-style').json } } }, {}, rB.marks) : { hosts: [] };
  var jS = Beam.joinOf({ meta: meta, inputs: { beambars: { schedule: Beam.attachFormat(rB.marks || {}, SHIPPED).json } } }, {}, rB.marks || {});
  verdict('SECOND_FIRM', !refusedFirst.ok && /headings found: table 0: MARK \| B \| D/.test(refusedFirst.why) && vB.ok && gotOk && jB.hosts.join() === 'G1,G2' && jB.unjoined.length === 0 && jS.hosts.length === 0,
    'before the entry: ' + (refusedFirst.ok ? 'ACCEPTED (wrong)' : 'refused: ' + refusedFirst.why.slice(0, 140)) + ' | one entry added (data only): ' + (vB.ok ? vB.summary : 'REFUSED ' + vB.why) + ' -> ' + (rB.line || rB.why) + ' hand_truth_equal=' + gotOk + ' | join through firm-b-style: ' + jB.hosts.join(',') + ' (the steel beam is not joined) | the same model through revit-s401-style joins ' + jS.hosts.length);
  // ---- AMBIGUOUS
  var amb = S.read(firmB, withB.concat([Object.assign(clone(entry), { id: 'firm-b-copy' })]), firmB.name);
  verdict('AMBIGUOUS', !amb.ok && /firm-b-style/.test(amb.why) && /firm-b-copy/.test(amb.why), amb.ok ? 'ACCEPTED (wrong)' : 'refused: ' + amb.why);

  // ---- JOIN_HOSPITAL: the pack says why it does nothing on a model with no joinable beam
  if (E.LODUP_HOSP_DB && REAL) {
    var SQL = await initSqlJs({ wasmBinary: wasmBinary }), db = new SQL.Database(new Uint8Array(fs.readFileSync(E.LODUP_HOSP_DB))), inp = Reader.fromDb(db), lines = [];
    inp.inputs = { beambars: { schedule: Beam.attachFormat(JSON.parse(fs.readFileSync(E.LODUP_MARKS_JSON, 'utf8')), SHIPPED).json } }; inp.callouts = []; inp.generated = function () { return []; };
    var RULES = Rules.load(JSON.parse(fs.readFileSync(path.join(ROOT, 'lod/rules/beambar_defaults.json'), 'utf8'))), res = Beam.run(inp, RULES, { log: function (l) { lines.push(l); } }), jl = lines.filter(function (l) { return /§LODUP_BEAMBAR_JOIN/.test(l); })[0] || '';
    console.log('[hospital] ' + jl);
    verdict('JOIN_HOSPITAL', res.parts.length === 0 && /names_matching_mark_regex=0/.test(jl) && /in_model=(\d+)/.test(jl) && +/in_model=(\d+)/.exec(jl)[1] > 0 && /no IfcBeam name matches the format/.test(res.stats.say || ''),
      'parts=' + res.parts.length + ' applies_to=' + Beam.appliesTo(inp, RULES) + ' say="' + (res.stats.say || '') + '"');
  } else verdict('JOIN_HOSPITAL', null, 'LODUP_HOSP_DB (and the real marks) not set: not judged');

  console.log('§LODUP_SCHEDFMT_SUMMARY failed=' + (FAILS.join(',') || 'none') + ' inconclusive=' + (INCONC.join(',') || 'none') + ' mode=' + (REAL ? 'real' : 'synthetic'));
  process.exit(FAILS.length ? 1 : 0);
})().catch(function (e) { console.error('§LODUP_SCHEDFMT_CRASH ' + (e && e.stack || e)); process.exit(2); });
