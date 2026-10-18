#!/usr/bin/env node
// ⚠ DO NOT REMOVE — DXF2BIM film v5 (§L31): the two closing cards (prior art; what was built here) as 1920x1080 stills. Every line is a claim of the docs page DXF2BIM_Prior_Art (BIMCompiler docs, researched 2026-10-18; no benchmark was run, the search was limited) or a measured figure of this repo (cited per line in the lane doc §L31). usage: node film_dxf2bim_v5_cards.js <outdir>
'use strict';
const path = require('path'), puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const out = path.resolve(process.argv[2] || '.');
const CSS = 'margin:0;width:1920px;height:1080px;background:#14161c;color:#F3EEE8;font:30px/1.5 "DejaVu Sans",sans-serif;display:flex;flex-direction:column;align-items:center;padding-top:96px;box-sizing:border-box';
const H = (a, b) => `<div style="font-size:64px;font-weight:bold;letter-spacing:5px;color:#F3EEE8">${a}</div><div style="font-size:34px;color:#FF6B78;letter-spacing:3px;margin:10px 0 40px">${b}</div>`;
const L = items => `<div style="text-align:left;max-width:1500px;font-size:31px;line-height:1.62">${items.map(t => `<div style="margin:0 0 15px 0"><span style="color:#FF6B78">·</span>&nbsp;&nbsp;${t}</div>`).join('')}</div>`;
const CARDS = {
  pa1: H('PRIOR ART', 'searched 2026-10-18 · vendor and project pages · no head-to-head run') + L([
    'Existing tools turn a 2D plan into walls, doors, windows and slabs, or only into curves: by recognition, by templates, or by tracing by hand',
    'They apply default heights and thicknesses at generation; several need a paid module, a subscription, or a paid SDK to read DWG',
    'Not found in that search: a value the drawing does not state kept as a visible, listed setting',
    'Not found: the source sheet and entity on every element, or a rebuild checked against an answer key']),
  pa2: H('WHAT WAS BUILT HERE', 'a 2D drawing set to a model, a schedule and a cost') + L([
    'Yellow = a setting with its basis, never a silent default: 43 listed settings',
    'Every body carries its sheet, handle, layer and how each size was obtained; the details sheet adds concrete grade, casting ratios and the column schedule',
    'Deterministic: the same drawings and markings give the same model, with no AI on your drawings',
    'Rebuilt within 1 mm of an answer key (a duplex); the shed written back to 2D within 0.02 mm',
    'The settings travel inside the DXF. Zero install, MIT, in a browser tab: IFC4, database, Viewer, 4D and 5D'])
};
(async () => {
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  try { const pg = await br.newPage(); await pg.setViewport({ width: 1920, height: 1080 });
    for (const k of Object.keys(CARDS)) { await pg.setContent(`<html><body style='${CSS}'>${CARDS[k]}</body></html>`); await pg.screenshot({ path: path.join(out, k + '.png') }); console.log('§CARD ' + k); }
  } finally { await br.close(); }
})();
