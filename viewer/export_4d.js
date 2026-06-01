// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ============================================================================
// SAVE 4D SCHEDULE — ExcelJS: 3 sheets (matches schedule_export.py)
// ============================================================================
async function save4D() {
  if (_dbSourceLine) _log(_dbSourceLine);  // S238: re-emit DB source so it appears in every log
  document.getElementById('status').textContent = _TRL.ui_gen_4d || 'Generating 4D Excel...';
  const wb = new ExcelJS.Workbook();
  wb.creator = _TRL.source_app;
  const projDays = scheduleData.length ? Math.max(...scheduleData.map(t=>t.finishDay)) : 0;

  // ── Helper: style a header row (fill stops at last data column) ──
  function styleHeader(ws, rowNum, argb) {
    const row = ws.getRow(rowNum);
    const colCount = ws.columns ? ws.columns.length : row.cellCount;
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb || 'FF4FC3F7' } };
      cell.alignment = { horizontal: 'center' };
    }
    row.commit();
  }

  // ── Sheet 1: Construction Schedule ──
  const wsSched = wb.addWorksheet(_TRL.s_schedule);
  wsSched.columns = [
    { width: 12 },{ width: 40 },{ width: 16 },{ width: 10 },{ width: 10 },{ width: 8 },{ width: 6 },
    { width: 10 },{ width: 12 },{ width: 6 },{ width: 12 },{ width: 12 },{ width: 16 },{ width: 8 },
    { width: 22 },{ width: 12 },{ width: 10 },
  ];
  const schedHeaders = [_TRL.h_wbs, _TRL.h_task_name, _TRL.h_phase, _TRL.h_discipline, _TRL.h_storey, _TRL.h_quantity, _TRL.h_uom,
    _TRL.h_productivity, _TRL.h_duration, _TRL.h_gangs, _TRL.h_start_date, _TRL.h_finish_date, _TRL.h_labor_resource, _TRL.h_crew_size, _TRL.h_equipment, _TRL.h_status, _TRL.h_pct_complete];
  wsSched.addRow(schedHeaders);
  styleHeader(wsSched, 1, 'FF2C3E50');
  for (const t of scheduleData) {
    wsSched.addRow([t.wbs,t.name,t.phase,t.discipline,t.storey,t.qty,t.uom,t.productivity,
      Math.round(t.duration*100)/100, t.crews||1, t.startDate, t.finishDate, t.resource, t.crew, t.equipment, _TRL.not_started, 0]);
  }

  // ── Sheet 2: Project Summary ──
  const wsSum = wb.addWorksheet(_TRL.s_proj_summary);
  wsSum.columns = [{ width: 25 }, { width: 20 }];
  const phaseCounts = {}, discCounts = {};
  for (const t of scheduleData) {
    phaseCounts[t.phase] = (phaseCounts[t.phase]||0) + 1;
    discCounts[t.discipline] = (discCounts[t.discipline]||0) + 1;
  }
  wsSum.addRow([bldName + ' Construction']);
  wsSum.getRow(1).font = { bold: true, size: 14 };
  wsSum.addRow([]);
  wsSum.addRow(['Database', DB_URL]);
  wsSum.addRow(['Total Tasks', scheduleData.length]);
  wsSum.addRow(['Project Start', scheduleData.length ? scheduleData[0].startDate : 'N/A']);
  wsSum.addRow(['Project Finish', scheduleData.length ? scheduleData[scheduleData.length-1].finishDate : 'N/A']);
  wsSum.addRow(['Total Duration', `${projDays} days`]);
  wsSum.addRow(['Generated', new Date().toISOString()]);
  wsSum.addRow([]);
  wsSum.addRow([_TRL.h_phase+' Summary', _TRL.h_task_count]);
  styleHeader(wsSum, wsSum.rowCount, 'FF4472C4');
  for (const [p,cnt] of Object.entries(phaseCounts).sort()) wsSum.addRow([p, cnt]);
  wsSum.addRow([]);
  wsSum.addRow([_TRL.h_discipline+' Summary', _TRL.h_task_count]);
  styleHeader(wsSum, wsSum.rowCount, 'FF70AD47');
  for (const [d,cnt] of Object.entries(discCounts).sort()) wsSum.addRow([d, cnt]);

  // ── Sheet 3: BIM 4D Dashboard ──
  const wsDash = wb.addWorksheet(_TRL.s_dashboard);
  wsDash.columns = [{ width: 35 },{ width: 14 },{ width: 12 },{ width: 12 }];

  wsDash.addRow([`${bldName} - BIM 4D Analytics Dashboard`]);
  wsDash.getRow(1).font = { bold: true, size: 14 };
  wsDash.addRow([]);

  wsDash.addRow([_TRL.t_phase_dur_analysis]);
  wsDash.getRow(wsDash.rowCount).font = { bold: true, size: 12 };
  wsDash.addRow([_TRL.h_phase, _TRL.h_total_days]);
  styleHeader(wsDash, wsDash.rowCount, 'FF4472C4');
  const phaseDur2 = {};
  for (const t of scheduleData) phaseDur2[t.phase] = (phaseDur2[t.phase]||0) + t.duration;
  for (const [p,d] of Object.entries(phaseDur2).sort((a,b)=>b[1]-a[1])) wsDash.addRow([p, Math.round(d*100)/100]);
  wsDash.addRow([]);

  wsDash.addRow([_TRL.t_resource_analysis]);
  wsDash.getRow(wsDash.rowCount).font = { bold: true, size: 12 };
  wsDash.addRow([_TRL.h_phase, _TRL.h_total_man_days]);
  styleHeader(wsDash, wsDash.rowCount, 'FF70AD47');
  const phaseMD2 = {};
  for (const t of scheduleData) phaseMD2[t.phase] = (phaseMD2[t.phase]||0) + t.duration * t.crew;
  for (const [p,md] of Object.entries(phaseMD2).sort((a,b)=>b[1]-a[1])) wsDash.addRow([p, Math.round(md*10)/10]);
  wsDash.addRow([]);

  wsDash.addRow([_TRL.t_s_curve_progress]);
  wsDash.getRow(wsDash.rowCount).font = { bold: true, size: 12 };
  wsDash.addRow([_TRL.h_week, _TRL.h_cumulative_pct]);
  styleHeader(wsDash, wsDash.rowCount, 'FFFFC000');
  if (scheduleData.length) {
    const maxD = Math.max(...scheduleData.map(t=>t.finishDay));
    const tw = Math.max(1, Math.ceil(maxD/7));
    const si = Math.max(1, Math.floor(tw/20));
    for (let w = 0; w <= tw; w += si) {
      const completed = scheduleData.filter(t => t.finishDay <= w*7).length;
      wsDash.addRow([`W${w}`, Math.round(completed/scheduleData.length*1000)/10]);
    }
    const lastRow = wsDash.getRow(wsDash.rowCount);
    if (lastRow.getCell(2).value < 100) wsDash.addRow([`W${tw}`, 100]);
  }
  wsDash.addRow([]);

  wsDash.addRow([_TRL.t_milestone_timeline]);
  wsDash.getRow(wsDash.rowCount).font = { bold: true, size: 12 };
  wsDash.addRow([_TRL.h_milestone, _TRL.h_day_offset, _TRL.h_date]);
  styleHeader(wsDash, wsDash.rowCount, 'FFED7D31');
  const pd2 = {};
  for (const t of scheduleData) {
    if (!pd2[t.phase]) pd2[t.phase] = {s:t.startDate,e:t.finishDate,sd:t.startDay,ed:t.finishDay};
    else {
      if (t.startDay < pd2[t.phase].sd) { pd2[t.phase].sd = t.startDay; pd2[t.phase].s = t.startDate; }
      if (t.finishDay > pd2[t.phase].ed) { pd2[t.phase].ed = t.finishDay; pd2[t.phase].e = t.finishDate; }
    }
  }
  wsDash.addRow(['Project Start', 0, scheduleData.length ? scheduleData[0].startDate : '']);
  for (const phase of Object.keys(pd2).sort()) {
    wsDash.addRow([`${phase} Start`, pd2[phase].sd, pd2[phase].s]);
    wsDash.addRow([`${phase} End`, pd2[phase].ed, pd2[phase].e]);
  }
  wsDash.addRow(['Project Finish', projDays, scheduleData.length ? scheduleData[scheduleData.length-1].finishDate : '']);
  wsDash.addRow([]);

  wsDash.addRow([_TRL.t_gantt_timeline]);
  wsDash.getRow(wsDash.rowCount).font = { bold: true, size: 12 };
  wsDash.addRow([_TRL.h_task, _TRL.h_phase, _TRL.h_start_date, _TRL.h_duration]);
  styleHeader(wsDash, wsDash.rowCount, 'FF5B9BD5');
  const top15x = [...scheduleData].sort((a,b)=>b.duration-a.duration).slice(0,15).sort((a,b)=>a.startDay-b.startDay);
  for (const t of top15x) wsDash.addRow([t.name.slice(0,35), t.phase, t.startDay, Math.round(t.duration*10)/10]);

  // ── Embed 4D chart images on the RIGHT side (col E = col 4), stacked vertically ──
  // Charts are in the HTML page — no need to embed in Excel

  // ── Save ──
  const filename = `BIM_OOTB_${bldName}_4D_Schedule_${new Date().toISOString().slice(0,10)}.xlsx`;
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  document.getElementById('status').textContent = (_TRL.ui_saved_excel || 'Saved {f} ({n} sheets)').replace('{f}', filename).replace('{n}', 3);
  _verifyMaths(wb, '4D');
  _verifyTRL(wb, '4D');
  _log('[S226] §CHART_SUMMARY 4D: ' + _chartTestPass + ' PASS, ' + _chartTestFail + ' FAIL');
  _downloadLog('4D');
  _chartTestPass = 0; _chartTestFail = 0;
}
