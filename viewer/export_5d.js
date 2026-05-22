// ============================================================================
// SAVE 5D BOQ — ExcelJS: Cover, Exec Summary, Mat/Lab/Equip, BOQ, WPs, Disc, Prov
// ============================================================================
async function save5D() {
  if (_dbSourceLine) _log(_dbSourceLine);  // S238: re-emit DB source so it appears in every log
  document.getElementById('status').textContent = _TRL.ui_gen_5d || 'Generating 5D Excel...';
  const wb = new ExcelJS.Workbook();
  wb.creator = _TRL.source_app;
  const gt = grandMaterial + grandLabor + grandEquip;
  const discs = Object.keys(discSummary);
  const NUM_FMT = '#,##0.00';
  const NUM_FMT_INT = '#,##0';

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

  // ── Helper: style a title row (merged, large font) ──
  function styleTitle(ws, rowNum, colSpan) {
    const row = ws.getRow(rowNum);
    row.font = { bold: true, size: 14, color: { argb: 'FF1A1A2E' } };
    if (colSpan > 1) ws.mergeCells(rowNum, 1, rowNum, colSpan);
    row.commit();
  }

  // ── Helper: format number cells in a row ──
  function fmtRow(ws, rowNum, cols, fmt) {
    for (const c of cols) {
      const cell = ws.getRow(rowNum).getCell(c);
      if (typeof cell.value === 'number') cell.numFmt = fmt || NUM_FMT;
    }
  }

  // ── Sheet 1: Cover Sheet ──
  const wsCover = wb.addWorksheet(_TRL.s_cover);
  wsCover.columns = [{ width: 22 }, { width: 50 }, { width: 35 }];
  const coverRows = [
    [_TRL.t_comp_boq],
    [`Project: ${bldName}`],
    [],
    [_TRL.t_cost_method],
    [],
    ['1. ' + _TRL.h_material.toUpperCase() + ' COSTS'],
    ['Source:', _TRL.rate_mat_source],
    ['Reference:', _TRL.rate_mat_ref],
    ['Includes:', _TRL.rate_mat_includes],
    [],
    ['2. ' + _TRL.h_labour.toUpperCase() + ' COSTS'],
    ['Source:', _TRL.rate_lab_source],
    ['Basis:', _TRL.rate_lab_basis],
    [_TRL.h_productivity + ':', _TRL.rate_lab_prod],
    [_TRL.h_crew_size + ':', _TRL.rate_lab_crew],
    [],
    ['3. ' + _TRL.h_equipment.toUpperCase() + '/PLANT HIRE'],
    ['Source:', _TRL.rate_eq_source],
    ['Allocation:', _TRL.rate_eq_alloc],
    ['Rates:', _TRL.rate_eq_basis],
    [],
    ['COST SUMMARY STRUCTURE'],
    ['Sheet 1:','Cover Sheet (this page)'],
    ['Sheet 2:','Executive Summary - Total costs'],
    ['Sheet 3:','Materials Cost Summary','Detailed material breakdown'],
    ['Sheet 4:','Labor Cost Summary','Crew allocation & man-days'],
    ['Sheet 5:','Equipment Cost Summary','Plant hire requirements'],
    ['Sheet 6:','Detailed BOQ','Line-by-line analysis all disciplines'],
    ['Sheets 7-11:','Work Package Sheets','Construction phase breakdown'],
    ['Sheets 12+:','Per-Discipline BOQ','Discipline-level breakdown'],
    ['Provisional Sums:','Finishes & fittings not in BIM'],
    ['Charts:','Embedded chart images'],
    [],
    ['PRICING STANDARDS & REFERENCES'],
    ['BOQ Format:','PWD Form 203A Malaysia'],
    ['Measurement:','SMM2 (Standard Method of Measurement)'],
    ['Pricing Date:','Q4 2024'],
    ['Currency:', CUR + (CUR2 !== CUR ? ' + ' + CUR2 + ' conversion' : '')],
    ['Conversion Rate:', `1 ${CUR2} = ${CUR_RATE} ${CUR}`],
    ['Validity:','60 days from date of issue'],
    [],
    ['EXCLUSIONS'],
    ['GST/SST (apply as per prevailing tax law)'],
    ['Preliminary & General items (add 8-12%)'],
    ['Profit & attendance (add 10-15%)'],
    ['Escalation beyond 60 days'],
    ['Site-specific conditions not shown in drawings'],
    [],
    ['Generated:',new Date().toISOString(), _TRL.source_app],
  ];
  for (const row of coverRows) wsCover.addRow(row);
  styleTitle(wsCover, 1, 3);
  wsCover.getRow(4).font = { bold: true, size: 12 };

  // ── Sheet 2: Executive Summary (with USD columns + pie chart image) ──
  const wsExec = wb.addWorksheet(_TRL.s_exec_summary);
  wsExec.columns = [
    { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 20 },
    { width: 18 }, { width: 18 }, { width: 18 }, { width: 20 },
  ];
  wsExec.addRow([_TRL.s_exec_summary.toUpperCase()]);
  styleTitle(wsExec, 1, 9);
  wsExec.addRow([]);
  wsExec.addRow([_TRL.h_discipline, _TRL.h_material+' ('+CUR+')', _TRL.h_labour+' ('+CUR+')', _TRL.h_equipment+' ('+CUR+')', _TRL.h_total+' ('+CUR+')',
                 _TRL.h_material+' ('+CUR2+')', _TRL.h_labour+' ('+CUR2+')', _TRL.h_equipment+' ('+CUR2+')', _TRL.h_total+' ('+CUR2+')']);
  styleHeader(wsExec, 3, 'FF2C3E50');
  let execDataStart = 4;
  for (const d of discs) {
    const s = discSummary[d];
    const totalRM = s.matTotal + s.laborCost + s.equipCost;
    wsExec.addRow([d, s.matTotal, s.laborCost, s.equipCost, totalRM,
                   Math.round(s.matTotal / USD_RATE * 100) / 100,
                   Math.round(s.laborCost / USD_RATE * 100) / 100,
                   Math.round(s.equipCost / USD_RATE * 100) / 100,
                   Math.round(totalRM / USD_RATE * 100) / 100]);
    const rn = wsExec.rowCount;
    fmtRow(wsExec, rn, [2,3,4,5,6,7,8,9], NUM_FMT);
  }
  wsExec.addRow([]);
  wsExec.addRow([_TRL.h_grand_total, grandMaterial, grandLabor, grandEquip, gt,
                 Math.round(grandMaterial / USD_RATE * 100) / 100,
                 Math.round(grandLabor / USD_RATE * 100) / 100,
                 Math.round(grandEquip / USD_RATE * 100) / 100,
                 Math.round(gt / USD_RATE * 100) / 100]);
  const gtRow = wsExec.rowCount;
  wsExec.getRow(gtRow).font = { bold: true };
  fmtRow(wsExec, gtRow, [2,3,4,5,6,7,8,9], NUM_FMT);

  // Charts are in the HTML page — no need to embed in Excel

  // ── Sheet 3: Material Summary (+ USD total) ──
  const wsMat = wb.addWorksheet(_TRL.s_material);
  wsMat.columns = [{ width: 15 },{ width: 28 },{ width: 12 },{ width: 8 },{ width: 16 },{ width: 20 },{ width: 18 }];
  wsMat.addRow([_TRL.t_mat_summary]);
  styleTitle(wsMat, 1, 7);
  wsMat.addRow([]);
  wsMat.addRow([_TRL.h_discipline, _TRL.h_ifc_class, _TRL.h_quantity, _TRL.h_uom, _TRL.h_unit_rate+' ('+CUR+')', _TRL.h_total+' '+_TRL.h_material+' ('+CUR+')', _TRL.h_total+' ('+CUR2+')']);
  styleHeader(wsMat, 3, 'FF27AE60');
  for (const r of qtoData) {
    wsMat.addRow([r.disc, r.cls, r.qty, r.unit, r.matRate, r.matTotal, Math.round(r.matTotal / USD_RATE * 100) / 100]);
    fmtRow(wsMat, wsMat.rowCount, [5,6,7], NUM_FMT);
  }
  wsMat.addRow([]);
  wsMat.addRow(['','','','','TOTAL', grandMaterial, Math.round(grandMaterial / USD_RATE * 100) / 100]);
  const matTotRow = wsMat.rowCount;
  wsMat.getRow(matTotRow).font = { bold: true };
  fmtRow(wsMat, matTotRow, [6,7], NUM_FMT);

  // ── Sheet 4: Labor Summary (+ USD total) ──
  const wsLab = wb.addWorksheet(_TRL.s_labour);
  wsLab.columns = [{ width: 15 },{ width: 28 },{ width: 12 },{ width: 8 },{ width: 30 },{ width: 10 },{ width: 12 },{ width: 18 },{ width: 16 }];
  wsLab.addRow([_TRL.t_lab_summary]);
  styleTitle(wsLab, 1, 9);
  wsLab.addRow([]);
  wsLab.addRow([_TRL.h_discipline, _TRL.h_ifc_class, _TRL.h_quantity, _TRL.h_uom, _TRL.h_trade, _TRL.h_crew_size, _TRL.h_man_days, _TRL.h_labour+' ('+CUR+')', _TRL.h_labour+' ('+CUR2+')']);
  styleHeader(wsLab, 3, 'FFFFC000');
  for (const r of qtoData) {
    if (r.laborCost === 0) continue;
    const manDays = r.laborDays * r.laborCrew;
    wsLab.addRow([r.disc, r.cls, r.qty, r.unit, r.laborTrade, r.laborCrew, Math.round(manDays*10)/10, r.laborCost, Math.round(r.laborCost / USD_RATE * 100) / 100]);
    fmtRow(wsLab, wsLab.rowCount, [7,8,9], NUM_FMT);
  }
  wsLab.addRow([]);
  wsLab.addRow(['','','','','','','TOTAL', grandLabor, Math.round(grandLabor / USD_RATE * 100) / 100]);
  const labTotRow = wsLab.rowCount;
  wsLab.getRow(labTotRow).font = { bold: true };
  fmtRow(wsLab, labTotRow, [8,9], NUM_FMT);

  // ── Sheet 5: Equipment Summary (+ USD total) ──
  const wsEq = wb.addWorksheet(_TRL.s_equipment);
  wsEq.columns = [{ width: 15 },{ width: 28 },{ width: 35 },{ width: 15 },{ width: 16 },{ width: 18 },{ width: 16 }];
  wsEq.addRow([_TRL.t_equip_summary]);
  styleTitle(wsEq, 1, 7);
  wsEq.addRow([]);
  wsEq.addRow([_TRL.h_discipline, _TRL.h_ifc_class, _TRL.h_equipment, _TRL.h_duration, _TRL.h_rate_day+' ('+CUR+')', _TRL.h_total+' ('+CUR+')', _TRL.h_total+' ('+CUR2+')']);
  styleHeader(wsEq, 3, 'FF5B9BD5');
  for (const r of qtoData) {
    if (r.equipCost === 0) continue;
    const alloc = EQUIPMENT_ALLOCATION[r.cls];
    const eqKey = alloc ? alloc.equipment : '';
    const rateDay = eqKey ? EQUIPMENT_RATES[eqKey].rate_per_day : 0;
    wsEq.addRow([r.disc, r.cls, r.equipDesc, Math.round(r.equipDays*10)/10, rateDay, r.equipCost, Math.round(r.equipCost / USD_RATE * 100) / 100]);
    fmtRow(wsEq, wsEq.rowCount, [5,6,7], NUM_FMT);
  }
  wsEq.addRow([]);
  wsEq.addRow(['','','','','TOTAL', grandEquip, Math.round(grandEquip / USD_RATE * 100) / 100]);
  const eqTotRow = wsEq.rowCount;
  wsEq.getRow(eqTotRow).font = { bold: true };
  fmtRow(wsEq, eqTotRow, [6,7], NUM_FMT);

  // ── Sheet 6: Detailed BOQ (+ USD total) ──
  const wsBOQ = wb.addWorksheet('5D-BOQ');
  wsBOQ.columns = [{ width: 10 },{ width: 26 },{ width: 16 },{ width: 8 },{ width: 5 },{ width: 30 },{ width: 12 },{ width: 14 },{ width: 14 },{ width: 14 },{ width: 14 },{ width: 14 }];
  wsBOQ.addRow(['DETAILED BOQ — ALL DISCIPLINES']);
  styleTitle(wsBOQ, 1, 12);
  wsBOQ.addRow([]);
  wsBOQ.addRow([_TRL.h_discipline, _TRL.h_ifc_class, _TRL.h_storey, _TRL.h_quantity, _TRL.h_uom, _TRL.h_description,
                _TRL.h_mat_rate+' ('+CUR+')', _TRL.h_material+' ('+CUR+')', _TRL.h_labour+' ('+CUR+')', _TRL.h_equipment+' ('+CUR+')', _TRL.h_total+' ('+CUR+')', _TRL.h_total+' ('+CUR2+')']);
  styleHeader(wsBOQ, 3, 'FF2C3E50');
  for (const r of qtoData) {
    const rowTotal = r.matTotal + r.laborCost + r.equipCost;
    wsBOQ.addRow([r.disc, r.cls, r.storey, r.qty, r.unit, r.desc, r.matRate, r.matTotal, r.laborCost, r.equipCost, rowTotal, Math.round(rowTotal / USD_RATE * 100) / 100]);
    fmtRow(wsBOQ, wsBOQ.rowCount, [7,8,9,10,11,12], NUM_FMT);
  }
  wsBOQ.addRow([]);
  wsBOQ.addRow(['','','','','',_TRL.h_material+' '+_TRL.h_subtotal,'', grandMaterial,'','','', fmtCur2(grandMaterial)]);
  fmtRow(wsBOQ, wsBOQ.rowCount, [8,12], NUM_FMT);
  wsBOQ.addRow(['','','','','',_TRL.h_labour+' '+_TRL.h_subtotal,'','', grandLabor,'','', fmtCur2(grandLabor)]);
  fmtRow(wsBOQ, wsBOQ.rowCount, [9,12], NUM_FMT);
  wsBOQ.addRow(['','','','','',_TRL.h_equipment+' '+_TRL.h_subtotal,'','','', grandEquip,'', fmtCur2(grandEquip)]);
  fmtRow(wsBOQ, wsBOQ.rowCount, [10,12], NUM_FMT);
  wsBOQ.addRow(['','','','','',_TRL.h_grand_total,'','','','', gt, fmtCur2(gt)]);
  const boqGtRow = wsBOQ.rowCount;
  wsBOQ.getRow(boqGtRow).font = { bold: true };
  fmtRow(wsBOQ, boqGtRow, [11,12], NUM_FMT);
  wsBOQ.addRow([]);
  wsBOQ.addRow(['Rates: ' + _TRL.rate_source]);
  wsBOQ.addRow([_TRL.source_app, new Date().toISOString()]);

  // ── Sheets 7-11+: Work Package Sheets ──
  const wpHeaders = [_TRL.h_item, _TRL.h_description, _TRL.h_quantity, _TRL.h_uom, _TRL.h_mat_rate+' ('+CUR+')', _TRL.h_material+' ('+CUR+')', _TRL.h_labour+' ('+CUR+')', _TRL.h_equipment+' ('+CUR+')', _TRL.h_total+' ('+CUR+')', _TRL.h_total+' ('+CUR2+')'];
  const wpColWidths = [{ width: 8 },{ width: 35 },{ width: 10 },{ width: 6 },{ width: 18 },{ width: 16 },{ width: 14 },{ width: 14 },{ width: 16 },{ width: 14 }];

  // Build set of all matched classes to find "OTHER"
  const matchedClasses = new Set();
  for (const wp of WORK_PACKAGES) wp.classes.forEach(c => matchedClasses.add(c));

  // Check if we need a PACKAGE 6: OTHER
  const otherRows = qtoData.filter(r => !matchedClasses.has(r.cls));
  const allWPs = [...WORK_PACKAGES];
  if (otherRows.length > 0) {
    allWPs.push({ id: 'PACKAGE 6', name: 'OTHER', color: '7F8C8D', classes: null });
  }

  const wsWP = wb.addWorksheet('Work Packages');
  wsWP.columns = wpColWidths;
  wsWP.addRow(['WORK PACKAGES — COST BREAKDOWN']);
  styleTitle(wsWP, 1, 10);
  let wpGrandMat = 0, wpGrandLab = 0, wpGrandEq = 0;

  for (const wp of allWPs) {
    const wpData = wp.classes
      ? qtoData.filter(r => wp.classes.includes(r.cls))
      : otherRows;
    if (wpData.length === 0) continue;

    wsWP.addRow([]);
    const hdrRow = wsWP.rowCount + 1;
    wsWP.addRow([`${wp.id}: ${wp.name}`]);
    wsWP.getRow(hdrRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + wp.color } };
    wsWP.getRow(hdrRow).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    wsWP.addRow(wpHeaders);
    styleHeader(wsWP, wsWP.rowCount, 'FF' + wp.color);

    let wpMatTotal = 0, wpLabTotal = 0, wpEqTotal = 0;
    let itemNum = 0;
    for (const r of wpData) {
      itemNum++;
      const rowTotal = r.matTotal + r.laborCost + r.equipCost;
      wpMatTotal += r.matTotal;
      wpLabTotal += r.laborCost;
      wpEqTotal += r.equipCost;
      wsWP.addRow([String(itemNum).padStart(3, '0'), r.desc || r.cls, r.qty, r.unit, r.matRate, r.matTotal, r.laborCost, r.equipCost, rowTotal, Math.round(rowTotal / USD_RATE * 100) / 100]);
      fmtRow(wsWP, wsWP.rowCount, [5,6,7,8,9,10], NUM_FMT);
    }
    const wpGrandRM = wpMatTotal + wpLabTotal + wpEqTotal;
    wsWP.addRow(['',_TRL.h_subtotal + ' — ' + wp.name,'','','', wpMatTotal, wpLabTotal, wpEqTotal, wpGrandRM, fmtCur2(wpGrandRM)]);
    wsWP.getRow(wsWP.rowCount).font = { bold: true };
    fmtRow(wsWP, wsWP.rowCount, [6,7,8,9,10], NUM_FMT);
    wpGrandMat += wpMatTotal; wpGrandLab += wpLabTotal; wpGrandEq += wpEqTotal;
  }
  // Grand total across all WPs
  wsWP.addRow([]);
  const wpAllRM = wpGrandMat + wpGrandLab + wpGrandEq;
  wsWP.addRow(['',_TRL.h_grand_total,'','','', wpGrandMat, wpGrandLab, wpGrandEq, wpAllRM, fmtCur2(wpAllRM)]);
  const wpGtRow = wsWP.rowCount;
  wsWP.getRow(wpGtRow).font = { bold: true, size: 12 };
  wsWP.getRow(wpGtRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } };
  wsWP.getRow(wpGtRow).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  fmtRow(wsWP, wpGtRow, [6,7,8,9,10], NUM_FMT);

  // ── Per-Discipline BOQ Sheets ──
  const discHeaders = [_TRL.h_item, _TRL.h_description, _TRL.h_quantity, _TRL.h_uom, _TRL.h_mat_rate+' ('+CUR+')', _TRL.h_material+' ('+CUR+')', _TRL.h_labour+' ('+CUR+')', _TRL.h_equipment+' ('+CUR+')', _TRL.h_total+' ('+CUR+')', _TRL.h_total+' ('+CUR2+')'];
  for (const disc of discs) {
    const discRows = qtoData.filter(r => r.disc === disc);
    if (discRows.length === 0) continue;

    const wsDisc = wb.addWorksheet(`BOQ-${disc}`);
    wsDisc.columns = wpColWidths;
    wsDisc.addRow([`DISCIPLINE: ${disc}`]);
    styleTitle(wsDisc, 1, 10);
    wsDisc.addRow([]);
    wsDisc.addRow(discHeaders);
    const discColor = DISC_COLORS[disc] ? DISC_COLORS[disc].replace('#','') : '888888';
    styleHeader(wsDisc, 3, 'FF' + discColor);

    let dMatT = 0, dLabT = 0, dEqT = 0;
    let dItemNum = 0;
    for (const r of discRows) {
      dItemNum++;
      const rowTotal = r.matTotal + r.laborCost + r.equipCost;
      dMatT += r.matTotal;
      dLabT += r.laborCost;
      dEqT += r.equipCost;
      wsDisc.addRow([String(dItemNum).padStart(3, '0'), r.desc || r.cls, r.qty, r.unit, r.matRate, r.matTotal, r.laborCost, r.equipCost, rowTotal, Math.round(rowTotal / USD_RATE * 100) / 100]);
      fmtRow(wsDisc, wsDisc.rowCount, [5,6,7,8,9,10], NUM_FMT);
    }
    wsDisc.addRow([]);
    const dGrandRM = dMatT + dLabT + dEqT;
    wsDisc.addRow(['',_TRL.h_subtotal,'','','', dMatT, dLabT, dEqT, dGrandRM, fmtCur2(dGrandRM)]);
    const dStRow = wsDisc.rowCount;
    wsDisc.getRow(dStRow).font = { bold: true };
    fmtRow(wsDisc, dStRow, [6,7,8,9,10], NUM_FMT);
  }

  // ── Provisional Sums (+ USD column) ──
  const wsProv = wb.addWorksheet(_TRL.s_prov);
  wsProv.columns = [{ width: 8 },{ width: 40 },{ width: 10 },{ width: 6 },{ width: 14 },{ width: 14 },{ width: 16 },{ width: 14 }];
  wsProv.addRow([_TRL.t_prov_sums]);
  styleTitle(wsProv, 1, 8);
  wsProv.addRow(['Items not explicitly modeled in BIM - calculated from built-up areas']);
  wsProv.addRow([]);
  wsProv.addRow([_TRL.h_item, _TRL.h_description, _TRL.h_quantity, _TRL.h_uom, _TRL.h_mat_rate+' ('+CUR+')', _TRL.h_lab_rate+' ('+CUR+')', _TRL.h_total+' ('+CUR+')', _TRL.h_total+' ('+CUR2+')']);
  styleHeader(wsProv, 4, 'FFC0392B');

  let wallArea = 0, floorArea = 0;
  for (const r of qtoData) {
    if (r.cls === 'IfcWall' || r.cls === 'IfcWallStandardCase') wallArea += r.qty;
    if (r.cls === 'IfcSlab') floorArea += r.qty;
  }
  const provItems = [
    ['P1','Painting - Walls and Ceilings',Math.round(wallArea*2),'M2',8.5,12,'Dulux/Nippon 2 coats emulsion'],
    ['P2','Check-in Counters & Service Desks',15,'EA',12500,2500,'Solid surface, modular system'],
    ['P3','Passenger Seating - Waiting Areas',250,'EA',580,45,'Airport beam seating, steel frame'],
    ['P4','Wayfinding Signage System',80,'EA',650,120,'Illuminated, bilingual'],
    ['P5','Flight Information Display (FIDS)',25,'EA',8500,1200,'55" LED, networked'],
    ['P6','Baggage Trolley Storage Racks',12,'EA',1850,350,'Stainless steel, 30 trolleys'],
    ['P7','Retail Kiosk Fit-outs (Shell)',8,'EA',22000,5500,'Structural frame, services rough-in'],
    ['P8','Rubber Safety Flooring',Math.round(floorArea*0.15),'M2',95,28,'Anti-slip, heavy duty'],
    ['P9','Acoustic Ceiling Panels',Math.round(floorArea*0.20),'M2',135,42,'Class A, fire-rated'],
    ['P10','Bollards & Barriers - Security',45,'EA',1250,280,'Fixed/removable, crash-rated'],
  ];
  let provTotal = 0;
  for (const p of provItems) {
    const total = p[2] * (p[4] + p[5]);
    provTotal += total;
    wsProv.addRow([p[0], p[1], p[2], p[3], p[4], p[5], Math.round(total), Math.round(total / USD_RATE * 100) / 100]);
    fmtRow(wsProv, wsProv.rowCount, [5,6,7,8], NUM_FMT);
  }
  wsProv.addRow([]);
  wsProv.addRow(['','','','','',_TRL.t_prov_sums + ' TOTAL', Math.round(provTotal), Math.round(provTotal / USD_RATE * 100) / 100]);
  const provTotRow = wsProv.rowCount;
  wsProv.getRow(provTotRow).font = { bold: true };
  fmtRow(wsProv, provTotRow, [7,8], NUM_FMT);

  // S225: Charts sheet removed — charts are in Executive Summary only

  // ── S224: Variance Order sheets (when diff data exists) ──
  if (diffResult && diffDb) {
    const VO_CFG = { addFactor: 1.0, removeFactor: 0.3, changeFactor: 1.3, overheadPct: 0.10, markupPct: 0.15, disruptionPct: 0.05 };
    function voRate(cls) { var r = RATES[cls]; return (r && r.rate) ? r.rate : 500; }
    function voPhase(cls) {
      const P = { IfcFooting:'Substructure', IfcPile:'Substructure', IfcColumn:'Superstructure', IfcBeam:'Superstructure', IfcSlab:'Superstructure',
        IfcWall:'Architecture', IfcWallStandardCase:'Architecture', IfcDoor:'Architecture', IfcWindow:'Architecture', IfcRoof:'Architecture',
        IfcDuct:'MEP Rough-in', IfcPipe:'MEP Rough-in', IfcCableCarrier:'MEP Rough-in', IfcLightFixture:'MEP Final', IfcOutlet:'MEP Final',
        IfcCovering:'Finishes', IfcFurniture:'Finishes' };
      return P[cls] || 'Architecture';
    }
    function voProd(cls) {
      const P = { IfcColumn:6, IfcBeam:8, IfcSlab:35, IfcWall:12, IfcDoor:5, IfcWindow:5, IfcDuct:18, IfcPipe:25, IfcLightFixture:20 };
      return P[cls] || 10;
    }
    function voInfo(dbRef, guid) {
      try { var r = dbRef.exec("SELECT ifc_class, element_name, storey, discipline, material_rgba FROM elements_meta WHERE guid='" + guid.replace(/'/g,"''") + "'"); return r.length ? r[0].values[0] : [null,null,null,null,null]; } catch(e) { return [null,null,null,null,null]; }
    }

    // VO Detail sheet
    const wsVO = wb.addWorksheet('Variation Order');
    wsVO.columns = [
      { header: 'Status', key: 's', width: 10 }, { header: 'GUID', key: 'g', width: 36 },
      { header: 'IFC Class', key: 'c', width: 20 }, { header: 'Name', key: 'n', width: 24 },
      { header: 'Storey', key: 'st', width: 16 }, { header: 'Discipline', key: 'd', width: 10 },
      { header: 'Phase (4D)', key: 'p', width: 14 }, { header: 'Unit Rate (' + CUR + ')', key: 'r', width: 12 },
      { header: 'Factor', key: 'f', width: 8 }, { header: 'Direct Cost', key: 'dc', width: 12 },
      { header: 'Total Impact', key: 'ti', width: 12 }, { header: 'Days', key: 'dy', width: 8 }
    ];
    styleHeader(wsVO, 1, 'FF4FC3F7');

    var voTotalDirect = 0, voTotalImpact = 0, voTotalDays = 0;
    var voAddCost = 0, voRemCost = 0, voChgCost = 0;
    function voRow(status, dbRef, guid, factor) {
      var info = voInfo(dbRef, guid);
      var cls = info[0] || 'Unknown';
      var rate = voRate(cls), direct = rate * factor;
      var total = direct * (1 + VO_CFG.overheadPct + VO_CFG.markupPct) * (1 + VO_CFG.disruptionPct);
      var days = 1 / voProd(cls);
      voTotalDirect += direct; voTotalImpact += total; voTotalDays += days;
      if (status === 'ADDED') voAddCost += total;
      else if (status === 'REMOVED') voRemCost += total;
      else voChgCost += total;
      wsVO.addRow({ s: status, g: guid, c: cls, n: info[1], st: info[2], d: info[3], p: voPhase(cls), r: rate, f: factor, dc: Math.round(direct), ti: Math.round(total), dy: +days.toFixed(2) });
    }
    diffResult.added.forEach(g => voRow('ADDED', diffDb, g, VO_CFG.addFactor));
    diffResult.removed.forEach(g => voRow('REMOVED', db, g, VO_CFG.removeFactor));
    diffResult.changed.forEach(g => voRow('CHANGED', diffDb, g, VO_CFG.changeFactor));
    // Color-code
    wsVO.eachRow((row, idx) => {
      if (idx === 1) return;
      var s = row.getCell(1).value;
      if (s === 'ADDED') row.getCell(1).font = { color: { argb: 'FF44CC44' }, bold: true };
      else if (s === 'REMOVED') row.getCell(1).font = { color: { argb: 'FFCC4444' }, bold: true };
      else if (s === 'CHANGED') row.getCell(1).font = { color: { argb: 'FFCCCC44' }, bold: true };
    });

    // VO Summary sheet
    const wsVOS = wb.addWorksheet('Variance Summary');
    wsVOS.columns = [{ header: 'Metric', key: 'm', width: 32 }, { header: 'Value', key: 'v', width: 22 }, { header: 'Notes', key: 'n', width: 48 }];
    styleHeader(wsVOS, 1, 'FF4FC3F7');
    wsVOS.addRow({ m: 'Variation Order', v: bldName, n: 'Auto-generated — ' + new Date().toISOString().split('T')[0] });
    wsVOS.addRow({});
    wsVOS.addRow({ m: '── SCOPE ──' }); wsVOS.lastRow.font = { bold: true, color: { argb: 'FF4FC3F7' } };
    wsVOS.addRow({ m: 'Elements Added', v: diffResult.added.length, n: 'New in variation (green)' });
    wsVOS.addRow({ m: 'Elements Removed', v: diffResult.removed.length, n: 'Demolished (red)' });
    wsVOS.addRow({ m: 'Elements Changed', v: diffResult.changed.length, n: 'Modified properties (yellow)' });
    wsVOS.addRow({ m: 'Total Affected', v: diffResult.added.length + diffResult.removed.length + diffResult.changed.length });
    wsVOS.addRow({});
    wsVOS.addRow({ m: '── COST IMPACT (5D) ──', n: 'FIDIC Clause 12 + AACE' }); wsVOS.lastRow.font = { bold: true, color: { argb: 'FF4FC3F7' } };
    wsVOS.addRow({ m: 'Addition Cost', v: CUR + ' ' + Math.round(voAddCost).toLocaleString() });
    wsVOS.addRow({ m: 'Removal Cost', v: CUR + ' ' + Math.round(voRemCost).toLocaleString() });
    wsVOS.addRow({ m: 'Change Cost', v: CUR + ' ' + Math.round(voChgCost).toLocaleString() });
    wsVOS.addRow({ m: 'Net Direct', v: CUR + ' ' + Math.round(voTotalDirect).toLocaleString() });
    wsVOS.addRow({ m: 'Total Impact (O&P)', v: CUR + ' ' + Math.round(voTotalImpact).toLocaleString(), n: 'Direct × (1+10%OH+15%Markup) × (1+5%Disruption)' });
    wsVOS.addRow({});
    wsVOS.addRow({ m: '── SCHEDULE IMPACT (4D) ──' }); wsVOS.lastRow.font = { bold: true, color: { argb: 'FF4FC3F7' } };
    wsVOS.addRow({ m: 'Total Additional Days', v: voTotalDays.toFixed(1) + ' days' });

    console.log('[S224] §VO_IN_5D added=' + diffResult.added.length + ' removed=' + diffResult.removed.length + ' changed=' + diffResult.changed.length + ' impact=' + CUR + Math.round(voTotalImpact));
  }

  // ── Save ──
  const sheetCount = wb.worksheets.length;
  const filename = `BIM_OOTB_${bldName}_5D_BOQ_${new Date().toISOString().slice(0,10)}.xlsx`;
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  document.getElementById('status').textContent = (_TRL.ui_saved_excel || 'Saved {f} ({n} sheets)').replace('{f}', filename).replace('{n}', sheetCount) + (diffResult ? ' \u2014 ' + (_TRL.ui_vo_label || 'includes Variance Order') : '');

  _verifyMaths(wb, '5D');
  _verifyTRL(wb, '5D');
  _log('[S226] §CHART_SUMMARY 5D: ' + _chartTestPass + ' PASS, ' + _chartTestFail + ' FAIL');
  _downloadLog('5D');
  _chartTestPass = 0; _chartTestFail = 0;
}
