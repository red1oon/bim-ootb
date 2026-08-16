#!/usr/bin/env node
// probe_gantt_stagger.js — quantify Gantt "stagger" for any building, BOTH engines (CPM4D=0 legacy):
// dump all authored task windows, compute (a) within-level phase order violations, (b) per-phase
// level cascade overlap, (c) global parallelism. Numbers, not looks.
'use strict';
const { spawn } = require('child_process');
const puppeteer = require(process.env.PUPPETEER || 'puppeteer');
const PORT = 8125;
const MODE = process.env.CPM4D === '0' ? '&cpm4d=0' : '';
const BLD = process.env.BLD || 'Terminal_extracted';
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}.db${MODE}`;

async function main() {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', process.env.SERVE_ROOT || '/tmp/cpm-serve'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500));
  const browser = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  const lines = [];
  // §S4_ACTIVATION_TIMING (4D_GANTT_TM_REFACTOR.md §STAGES S4) — forward the activation-timing/
  // write-loop lines to stdout as they arrive (previously only pushed to the internal `lines` array
  // and never printed — a real gap, this fixes it for the timing-relevant subset without flooding
  // stdout with every § line the activation logs).
  const TIMING_RE = /§(S4_ACTIVATION|S4_RAW_SCHEDULE_REUSE|WRITE_LOOP_TIMING|CPM_DISPLAY_REUSE|GANTT_SOURCE|4D_COVERAGE|TM_OPS_CHECK|GANTT_CACHE)/;
  page.on('console', m => {
    const t = m.text();
    if (t.indexOf('§') >= 0) lines.push(t);
    if (TIMING_RE.test(t)) console.log('[activation] ' + t);
  });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof window.toggleTimeMachine === 'function', { timeout: 180000 });
  await page.waitForFunction(() => window.APP && window.APP.db, { timeout: 240000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 15000));
  const _actT0 = Date.now();
  await page.evaluate(() => window.toggleTimeMachine());
  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    if (lines.some(l => l.indexOf('§TIME_MACHINE ON') >= 0)) break;
    await new Promise(r => setTimeout(r, 200));
  }
  console.log('§S4_ACTIVATION_WALLCLOCK ms=' + (Date.now() - _actT0) + ' BLD=' + BLD + ' MODE=' + (MODE ? 'legacy' : 'cpm'));
  const rows = await page.evaluate(() => {
    const r = window.APP.db.exec("SELECT t.task_id, t.schedule_start, t.schedule_finish, COUNT(te.guid) " +
      "FROM tasks t LEFT JOIN task_elements te ON te.task_id=t.task_id " +
      "WHERE t.schedule_id='SCH_AUTHORED' AND (t.is_summary IS NULL OR t.is_summary=0) " +
      "GROUP BY t.task_id ORDER BY t.schedule_start");
    return r.length ? r[0].values : [];
  });
  console.log('MODE=' + (MODE ? 'legacy' : 'cpm') + ' BLD=' + BLD);
  const D = 86400000, parse = s => new Date(s).getTime();
  const t0 = Math.min(...rows.map(r => parse(r[1])));
  const tasks = rows.map(r => {
    const m = String(r[0]).match(/^TASK_(.+)_([^_]*Level[^_]*|.+)$/);
    return { id: r[0], s: (parse(r[1]) - t0) / D, e: (parse(r[2]) - t0) / D, n: r[3] };
  });
  tasks.forEach(t => console.log('TASK ' + t.id + ' s=' + t.s.toFixed(0) + ' e=' + t.e.toFixed(0) + ' n=' + t.n));
  // stagger metrics from task ids: TASK_<phase>_<storey>, phase in known set
  const PH = ['Substructure', 'Superstructure', 'Architecture', 'MEP_Rough_in', 'MEP_Final', 'Finishes'];
  const per = {};
  tasks.forEach(t => {
    for (const p of PH) {
      if (t.id.startsWith('TASK_' + p + '_')) {
        const st = t.id.slice(('TASK_' + p + '_').length);
        (per[st] = per[st] || {})[p] = t;
        break;
      }
    }
  });
  let phasePairs = 0, phaseOverlapPairs = 0, overlapDaysSum = 0;
  Object.keys(per).forEach(st => {
    const g = per[st];
    for (let i = 0; i + 1 < PH.length; i++) {
      for (let j = i + 1; j < PH.length; j++) {
        const a = g[PH[i]], b = g[PH[j]];
        if (!a || !b) continue;
        phasePairs++;
        const ov = Math.min(a.e, b.e) - Math.max(a.s, b.s);
        if (ov > 1) { phaseOverlapPairs++; overlapDaysSum += ov; }
      }
    }
  });
  const spans = tasks.map(t => t.e - t.s);
  const total = Math.max(...tasks.map(t => t.e));
  const sumSpan = spans.reduce((a, b) => a + b, 0);
  console.log('METRIC withinLevelPhasePairs=' + phasePairs + ' overlapping=' + phaseOverlapPairs +
    ' overlapDaysSum=' + overlapDaysSum.toFixed(0) +
    ' parallelism=' + (sumSpan / Math.max(1, total)).toFixed(2) + 'x totalDays=' + total.toFixed(0) +
    ' tasks=' + tasks.length);

  // §LAYER_BUILDUP (M3, bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §MODEL M3 + §STAGES S3) — the
  // user's "uniform layer by layer build up" complaint, as a number: OPS, not tasks. Query
  // kernel_ops ELEMENT_PLACE (the movie's own true physics times — M3: playback does not change)
  // joined to each element's real Z, banded into the same 3m z-band quantum M1's bandRank uses
  // (floor(centerZ/3m), the shipped §GANTT banding precedent). Acceptance: per band, the MEDIAN op
  // start must be monotone non-decreasing with band rank, tolerance 1 day (the window rounding
  // quantum) — violations must be 0 on Terminal AND Hospital.
  const opRows = await page.evaluate(() => {
    const r = window.APP.db.exec(
      "SELECT k.timestamp, COALESCE(t.center_z, 0) as cz " +
      "FROM kernel_ops k JOIN elements_meta m ON m.guid = k.output_guid " +
      "LEFT JOIN element_transforms t ON t.guid = m.guid " +
      "WHERE k.op_type='ELEMENT_PLACE' AND (k.undone IS NULL OR k.undone=0)");
    return r.length ? r[0].values : [];
  });
  if (opRows.length) {
    const opT0 = Math.min(...opRows.map(r => r[0]));
    const bandsOf = {};
    opRows.forEach(r => {
      const band = Math.floor(r[1] / 3);
      (bandsOf[band] = bandsOf[band] || []).push((r[0] - opT0) / D);
    });
    const bandKeys = Object.keys(bandsOf).map(Number).sort((a, b) => a - b);
    const medians = bandKeys.map(b => {
      const arr = bandsOf[b].slice().sort((a, c) => a - c);
      return { band: b, n: arr.length, median: arr[Math.floor(arr.length * 0.5)] };
    });
    let layerViol = 0, layerDetail = [];
    for (let i = 1; i < medians.length; i++) {
      if (medians[i].median < medians[i - 1].median - 1) {   // 1-day tolerance, §MODEL M3
        layerViol++;
        if (layerDetail.length < 10) layerDetail.push('band' + medians[i - 1].band + '(n=' + medians[i - 1].n +
          ',med=' + medians[i - 1].median.toFixed(1) + 'd)>band' + medians[i].band + '(n=' + medians[i].n +
          ',med=' + medians[i].median.toFixed(1) + 'd)');
      }
    }
    console.log('§LAYER_BUILDUP_TABLE ' + JSON.stringify(medians.map(m => [m.band, m.n, m.median.toFixed(1)])));
    console.log('§LAYER_BUILDUP MODE=' + (MODE ? 'legacy' : 'cpm') + ' BLD=' + BLD +
      ' violations=' + layerViol + '/' + (medians.length - 1) + ' bands=' + medians.length + ' ops=' + opRows.length +
      (layerDetail.length ? ' detail=' + JSON.stringify(layerDetail) : '') +
      ' ' + (layerViol === 0 ? 'PASS' : 'FAIL'));
  } else {
    console.log('§LAYER_BUILDUP_SKIP no ELEMENT_PLACE ops found in kernel_ops');
  }

  await browser.close(); server.kill(); process.exit(0);
}
main().catch(e => { console.error('ERR ' + (e && e.stack || e)); process.exit(2); });
