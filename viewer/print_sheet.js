/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
/**
 * print_sheet.js — Interactive A3 Print Preview (2D_025 D3 / 2D_027 §3)
 *
 * Implementing 2D_025 spec §D3 — Witness: W-PRINT
 * Implementing 2D_027 §3 — Witness: W-2D27
 *
 * Captures the current Three.js view and shows an interactive A3 preview:
 *   - Auto orientation: landscape when visW >= visH, portrait otherwise
 *   - Left panel: live A3 canvas (CSS-scaled for display)
 *   - Right panel: editable text fields, contrast slider, corporate info
 *   - Title bar: cursor:grab, "Print Preview" label
 *   - Save PNG button downloads the full A3 canvas
 *   - Corporate details loaded from corporate.json (new schema)
 *   - White background forced for print regardless of theme
 *
 * API:
 *   PrintSheet.capture(APP)         — open interactive A3 preview
 *   PrintSheet.preview(APP)         — alias for capture (§3.3 entry point)
 *
 * Log tags: §PRINT_SHEET, §PRINT_PREVIEW
 */
var PrintSheet = (function() {
  'use strict';

  // Implementing 2D_027 §3.1 — Witness: W-2D27
  // A3 at 150 DPI constants
  var A3_LONG  = Math.round(420 * 150 / 25.4); // 2480 px (long edge)
  var A3_SHORT = Math.round(297 * 150 / 25.4); // 1754 px (short edge)

  var MARGIN = 40; // px margin inside sheet

  var _corp = null; // cached corporate.json

  function log(msg) { console.log('[PrintSheet] ' + msg); }

  // ── Orientation helper ────────────────────────────────────────────
  // Implementing 2D_027 §3.1 — Witness: W-2D27
  function resolveOrientation(cam) {
    var visW = 1, visH = 1;
    if (cam && cam.isOrthographicCamera) {
      visW = (cam.right  || 1) - (cam.left   || 0);
      visH = (cam.top    || 1) - (cam.bottom  || 0);
      // Guard against degenerate values
      if (visW <= 0) visW = 1;
      if (visH <= 0) visH = 1;
    }
    var useLandscape = visW >= visH;
    var sheetW = useLandscape ? A3_LONG  : A3_SHORT;
    var sheetH = useLandscape ? A3_SHORT : A3_LONG;
    log('§PRINT_SHEET orient=' + (useLandscape ? 'landscape' : 'portrait') +
        ' visW=' + visW.toFixed(2) + ' visH=' + visH.toFixed(2));
    return { useLandscape: useLandscape, sheetW: sheetW, sheetH: sheetH };
  }

  // ── Corporate JSON ────────────────────────────────────────────────
  // Implementing 2D_027 §3.2 — Witness: W-2D27

  /** Load corporate.json once and cache. Calls cb(corp). Falls back gracefully.
   *  §S282c: routes through loadJsonWithOverrides so Settings edits (localStorage
   *  json_corporate) apply on top of the shipped file. */
  function loadCorporate(callback) {
    if (_corp) { callback(_corp); return; }
    var loader = (typeof window.loadJsonWithOverrides === 'function')
      ? window.loadJsonWithOverrides('corporate.json', 'json_corporate')
      : fetch('corporate.json').then(function(r) { return r.json(); });
    loader
      .then(function(data) {
        _corp = data;
        callback(_corp);
        log('§PRINT_SHEET corp loaded firmName=' + (data.firmName || data.company || '?'));
      })
      .catch(function() {
        _corp = {};
        callback(_corp);
        log('§PRINT_SHEET corp fallback — corporate.json not found');
      });
  }

  // ── Building Info ─────────────────────────────────────────────────

  function queryBuildingInfo(A) {
    var info = {
      name: A.activeBuilding || 'Unknown Building',
      storey: '',
      volume: 0,
      floorArea: 0,
      classCounts: [],
      totalElements: 0
    };
    if (!A.db) return info;

    var view = (typeof GridViews !== 'undefined') ? GridViews.activeView() : null;
    if (view === 'floor') info.storey = 'Ground Floor';
    else if (view === 'floor1') info.storey = 'First Floor';
    else if (view) info.storey = view.charAt(0).toUpperCase() + view.slice(1) + ' Elevation';

    // §2.5 — check SectionCut saved cuts for named view label
    if (typeof SectionCut !== 'undefined' && SectionCut.savedCuts) {
      var cuts = SectionCut.savedCuts;
      for (var ci = 0; ci < cuts.length; ci++) {
        if (cuts[ci].active) {
          info.storey = cuts[ci].name + ' \u2014 ' +
            cuts[ci].axis + ' axis @ ' + cuts[ci].constant.toFixed(1) + 'm';
          break;
        }
      }
    }

    try {
      var envResult = A.db.exec(
        'SELECT MIN(center_x),MAX(center_x),MIN(center_y),MAX(center_y),MIN(center_z),MAX(center_z) FROM element_transforms'
      );
      if (envResult.length > 0) {
        var v = envResult[0].values[0];
        var w = v[1] - v[0], d = v[3] - v[2], h = v[5] - v[4];
        info.volume = w * d * h;
        info.floorArea = w * d;
      }
    } catch (e) { /* skip */ }

    try {
      var classResult = A.db.exec(
        'SELECT ifc_class,COUNT(*) as n FROM elements_meta GROUP BY ifc_class ORDER BY n DESC LIMIT 8'
      );
      if (classResult.length > 0) {
        var rows = classResult[0].values;
        for (var i = 0; i < rows.length; i++) {
          info.classCounts.push({ cls: rows[i][0], count: rows[i][1] });
          info.totalElements += rows[i][1];
        }
      }
    } catch (e) { /* skip */ }

    return info;
  }

  // ── Sheet Rendering ───────────────────────────────────────────────

  /** Draw title block at bottom of sheet. Returns top-Y of title block. */
  function drawTitleBlock(ctx, info, opts, sheetW, sheetH) {
    // Implementing 2D_027 §3.2 — Witness: W-2D27
    var corp = opts.corp || {};
    var tbH = 120;
    var tbY = sheetH - MARGIN - tbH;
    var tbX = MARGIN;
    var tbW = sheetW - MARGIN * 2;

    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(tbX, tbY, tbW, tbH);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(tbX, tbY, tbW, tbH);

    // Vertical divider at 65%
    var divX = tbX + tbW * 0.65;
    ctx.beginPath();
    ctx.moveTo(divX, tbY); ctx.lineTo(divX, tbY + tbH);
    ctx.stroke();

    // Horizontal divider (stats row)
    var hDivY = tbY + 50;
    ctx.beginPath();
    ctx.moveTo(tbX, hDivY); ctx.lineTo(divX, hDivY);
    ctx.stroke();

    // Left cell — title
    ctx.fillStyle = '#333333';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(opts.title || info.name, tbX + 12, tbY + 30);

    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#333333';
    ctx.fillText(opts.subtitle || info.storey || 'Plan View', tbX + 12, tbY + 46);

    // Left cell — meta
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#555555';
    var dateStr = new Date().toISOString().slice(0, 10);
    var drRef  = opts.drawingRef  || corp.defaultDrawingRef  || 'DR-001';
    var prjRef = opts.projectRef  || corp.defaultProjectRef  || '';
    var rev    = opts.revision    || corp.defaultRevision    || 'P1';
    var prepBy = opts.preparedBy  || corp.defaultPreparedBy  || '';
    var metaLine = 'Date: ' + dateStr + '  |  Drg: ' + drRef + '  Rev: ' + rev;
    if (prjRef) metaLine += '  |  Proj: ' + prjRef;
    if (prepBy) metaLine += '  |  By: ' + prepBy;
    ctx.fillText(metaLine, tbX + 12, tbY + 70);
    if (opts.notes) ctx.fillText('Notes: ' + opts.notes.slice(0, 80), tbX + 12, tbY + 86);

    // Stats row
    ctx.fillStyle = '#555555';
    ctx.fillText('Vol: ' + info.volume.toFixed(1) + ' m\u00B3', tbX + 12, tbY + 106);
    ctx.fillText('Floor: ' + info.floorArea.toFixed(1) + ' m\u00B2', tbX + 180, tbY + 106);
    ctx.fillText('Elements: ' + info.totalElements, tbX + 350, tbY + 106);

    // Right cell — corporate (new schema fields)
    // Implementing 2D_027 §3.2 — Witness: W-2D27
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#000000';
    ctx.fillText(corp.logoText || corp.firmName || corp.company || 'BIM OOTB', divX + 12, tbY + 24);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#444444';
    if (corp.tagline) ctx.fillText(corp.tagline, divX + 12, tbY + 42);
    if (corp.subtitle) {
      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#666666';
      ctx.fillText(corp.subtitle, divX + 12, tbY + 57);
    }
    // Legacy fields (address/phone/email) still shown if present
    if (corp.address) { ctx.font = '11px sans-serif'; ctx.fillText(corp.address.slice(0, 46), divX + 12, tbY + 71); }
    if (corp.phone)   ctx.fillText(corp.phone, divX + 12, tbY + 85);
    if (corp.email)   ctx.fillText(corp.email, divX + 12, tbY + 99);
    if (corp.registration) {
      ctx.font = '9px sans-serif'; ctx.fillStyle = '#888888';
      ctx.fillText(corp.registration, divX + 12, tbY + 113);
    }

    return tbY; // top of title block
  }

  /** Draw scale bar at bottom-left of viewport area */
  function drawScaleBar(ctx, vpW, vpX, cam, tbY) {
    if (!cam || !cam.isOrthographicCamera) return;
    var visW = (cam.right - cam.left) / (cam.zoom || 1);
    var steps = [0.5, 1, 2, 5, 10, 20, 50, 100];
    var targetM = visW * 0.15;
    var barM = steps.reduce(function(best, s) {
      return Math.abs(s - targetM) < Math.abs(best - targetM) ? s : best;
    }, steps[0]);
    var barPx = (barM / visW) * vpW;
    var sbX = vpX + 20;
    var sbY = tbY - 25;

    ctx.strokeStyle = '#000000'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sbX, sbY); ctx.lineTo(sbX + barPx, sbY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sbX, sbY - 6); ctx.lineTo(sbX, sbY + 6);
    ctx.moveTo(sbX + barPx, sbY - 6); ctx.lineTo(sbX + barPx, sbY + 6);
    ctx.stroke();

    ctx.font = '11px sans-serif'; ctx.fillStyle = '#000000'; ctx.textAlign = 'center';
    ctx.fillText('0', sbX, sbY - 10);
    var barLabel = barM >= 1 ? barM.toFixed(0) + 'm' : (barM * 100).toFixed(0) + 'cm';
    ctx.fillText(barLabel, sbX + barPx, sbY - 10);
    ctx.textAlign = 'left';
  }

  /** Draw north arrow at top-right of viewport */
  function drawNorthArrow(ctx, sheetW) {
    var nX = sheetW - MARGIN - 30;
    var nY = MARGIN + 50;
    var len = 30;

    ctx.strokeStyle = '#000000'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(nX, nY + len); ctx.lineTo(nX, nY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(nX, nY); ctx.lineTo(nX - 8, nY + 12);
    ctx.moveTo(nX, nY); ctx.lineTo(nX + 8, nY + 12);
    ctx.stroke();

    ctx.font = 'bold 16px sans-serif'; ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.fillText('N', nX, nY - 6);
    ctx.textAlign = 'left';
  }

  /**
   * Render the full A3 sheet onto ctx.
   * opts = { title, subtitle, notes, drawingRef, projectRef, revision, preparedBy,
   *           contrast (0-100), corp, overrides, sheetW, sheetH, useLandscape }
   */
  function drawSheet(ctx, cam, sceneImg, info, opts) {
    var sheetW = opts.sheetW || A3_LONG;
    var sheetH = opts.sheetH || A3_SHORT;

    // Implementing 2D_027 §3.4 — Witness: W-2D27
    // White background for print regardless of dark/light theme
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sheetW, sheetH);

    ctx.strokeStyle = '#000000'; ctx.lineWidth = 3;
    ctx.strokeRect(MARGIN / 2, MARGIN / 2, sheetW - MARGIN, sheetH - MARGIN);

    var tbTop = drawTitleBlock(ctx, info, opts, sheetW, sheetH);

    // Viewport area
    var vpX = MARGIN, vpY = MARGIN;
    var vpW = sheetW - MARGIN * 2;
    var vpH = tbTop - MARGIN - 15;

    // Fit scene image (maintain aspect ratio)
    var srcAspect = sceneImg.width / sceneImg.height;
    var dstAspect = vpW / vpH;
    var drawW, drawH, drawX, drawY;
    if (srcAspect > dstAspect) {
      drawW = vpW; drawH = vpW / srcAspect;
      drawX = vpX; drawY = vpY + (vpH - drawH) / 2;
    } else {
      drawH = vpH; drawW = vpH * srcAspect;
      drawX = vpX + (vpW - drawW) / 2; drawY = vpY;
    }

    // Composite scene image onto white (sunglasses reverse §3.4)
    // Implementing 2D_027 §3.4 — Witness: W-2D27
    ctx.drawImage(sceneImg, drawX, drawY, drawW, drawH);

    // Force white behind scene content (handles dark/transparent Three.js canvas)
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sheetW, sheetH);
    ctx.globalCompositeOperation = 'source-over';
    log('§PRINT_SHEET bg=white forced');

    // Apply contrast/greyscale filter for any re-draw overlay
    var contrast = opts.contrast || 0; // 0-100
    var greyPct = Math.round(contrast * 0.8);          // 0→0, 100→80%
    var contrastPct = 100 + Math.round(contrast * 0.2); // 100→120%
    if (contrast > 0) {
      ctx.filter = 'grayscale(' + greyPct + '%) contrast(' + contrastPct + '%)';
      ctx.drawImage(sceneImg, drawX, drawY, drawW, drawH);
      ctx.filter = 'none';
      // Force white again after recomposite
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sheetW, sheetH);
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.strokeStyle = '#333333'; ctx.lineWidth = 1;
    ctx.strokeRect(drawX, drawY, drawW, drawH);

    drawScaleBar(ctx, drawW, drawX, cam, tbTop);
    drawNorthArrow(ctx, sheetW);

    log('§PRINT_SHEET drawSheet contrast=' + contrast + ' vp=' + Math.round(drawW) + 'x' + Math.round(drawH));
  }

  // ── Interactive Preview ───────────────────────────────────────────

  function showPreview(A, sceneImg, info, corp) {
    var old = document.getElementById('print-preview-overlay');
    if (old) old.remove();

    // Implementing 2D_027 §3.1 — Witness: W-2D27
    var orient = resolveOrientation(A.camera);
    var sheetW = orient.sheetW;
    var sheetH = orient.sheetH;

    // Working opts (mutated by fields/slider)
    var opts = {
      title: info.name,
      subtitle: info.storey || 'Plan View',
      notes: '',
      drawingRef:  corp.defaultDrawingRef  || 'DR-001',
      projectRef:  corp.defaultProjectRef  || '',
      revision:    corp.defaultRevision    || 'P1',
      preparedBy:  corp.defaultPreparedBy  || '',
      contrast: 0,
      corp: corp,
      sheetW: sheetW,
      sheetH: sheetH,
      useLandscape: orient.useLandscape
    };

    // ── Overlay container ─────────────────────────────────────────
    var overlay = document.createElement('div');
    overlay.id = 'print-preview-overlay';
    overlay.style.cssText =
      'position:fixed;top:0;left:0;width:100vw;height:100vh;' +
      'background:rgba(0,0,0,0.88);z-index:9999;overflow:auto;' +
      'display:flex;flex-direction:column;align-items:center;' +
      'padding:12px;box-sizing:border-box';

    // ── Title bar ─────────────────────────────────────────────────
    var titleBar = document.createElement('div');
    titleBar.style.cssText =
      'cursor:grab;color:#fff;font-size:13px;font-weight:bold;' +
      'padding:8px 12px;width:100%;max-width:1440px;display:flex;' +
      'align-items:center;gap:10px;background:rgba(255,255,255,0.08);' +
      'border-radius:6px 6px 0 0;margin-bottom:4px;box-sizing:border-box';

    var titleLabel = document.createElement('span');
    titleLabel.textContent = 'Print Preview \u2014 A3 ' + (orient.useLandscape ? 'Landscape' : 'Portrait');
    titleBar.appendChild(titleLabel);

    // Implementing 2D_027 §3.3 — Witness: W-2D27
    // Regenerate button
    var regenBtn = document.createElement('button');
    regenBtn.textContent = 'Regenerate';
    regenBtn.style.cssText =
      'background:#66bb6a;color:#000;border:none;border-radius:4px;' +
      'padding:6px 14px;font-size:12px;font-weight:bold;cursor:pointer;margin-left:auto';

    // Download button
    var downloadBtn = document.createElement('button');
    downloadBtn.textContent = 'Download';
    downloadBtn.style.cssText =
      'background:#4fc3f7;color:#000;border:none;border-radius:4px;' +
      'padding:6px 16px;font-size:12px;font-weight:bold;cursor:pointer';

    // Cancel button
    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText =
      'background:#666;color:#fff;border:none;border-radius:4px;' +
      'padding:6px 14px;font-size:12px;cursor:pointer';
    cancelBtn.onclick = function() { overlay.remove(); };

    titleBar.appendChild(regenBtn);
    titleBar.appendChild(downloadBtn);
    titleBar.appendChild(cancelBtn);

    // ── Content row ───────────────────────────────────────────────
    var contentRow = document.createElement('div');
    contentRow.style.cssText =
      'display:flex;gap:12px;width:100%;max-width:1440px;align-items:flex-start';

    // ── Preview canvas (full A3 resolution, CSS-scaled) ───────────
    var previewCanvas = document.createElement('canvas');
    previewCanvas.width  = sheetW;
    previewCanvas.height = sheetH;
    previewCanvas.style.cssText =
      'flex:1 1 auto;min-width:0;width:80%;max-height:calc(100vh - 120px);' +
      'object-fit:contain;border:2px solid #444;display:block';

    // ── Controls panel ────────────────────────────────────────────
    var ctrlPanel = document.createElement('div');
    ctrlPanel.style.cssText =
      'flex:0 0 250px;background:rgba(255,255,255,0.08);border-radius:6px;' +
      'padding:12px;color:#ddd;font-size:12px;box-sizing:border-box';

    var ctx = previewCanvas.getContext('2d');

    // ── Helper: make a text input field ──────────────────────────
    function makeField(labelText, value, key) {
      var row = document.createElement('div');
      row.style.cssText = 'margin-bottom:8px';
      var lbl = document.createElement('label');
      lbl.style.cssText = 'display:block;color:#aaa;font-size:11px;margin-bottom:2px';
      lbl.textContent = labelText;
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.value = value || '';
      inp.style.cssText =
        'width:100%;background:#2a2a2a;border:1px solid #555;border-radius:3px;' +
        'color:#eee;padding:4px 6px;font-size:12px;box-sizing:border-box';
      inp.addEventListener('input', function() {
        opts[key] = inp.value;
        log('§PRINT_SHEET field ' + key + '=' + inp.value.slice(0, 20));
      });
      row.appendChild(lbl);
      row.appendChild(inp);
      return row;
    }

    // Implementing 2D_027 §3.3 — Witness: W-2D27
    // Editable fields: Drawing Title, Project Ref, Drawing Ref, Revision, Prepared By, Notes
    ctrlPanel.appendChild(makeField('Drawing Title', opts.title, 'title'));
    ctrlPanel.appendChild(makeField('Project Ref', opts.projectRef, 'projectRef'));
    ctrlPanel.appendChild(makeField('Drawing Ref', opts.drawingRef, 'drawingRef'));
    ctrlPanel.appendChild(makeField('Revision', opts.revision, 'revision'));
    ctrlPanel.appendChild(makeField('Prepared By', opts.preparedBy, 'preparedBy'));
    ctrlPanel.appendChild(makeField('Notes', opts.notes, 'notes'));

    // Contrast slider
    var sliderRow = document.createElement('div');
    sliderRow.style.cssText = 'margin-bottom:12px';
    var sliderLbl = document.createElement('label');
    sliderLbl.style.cssText = 'display:block;color:#aaa;font-size:11px;margin-bottom:2px';
    sliderLbl.textContent = 'Contrast (0=colour \u2192 100=B&W)';
    var slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0'; slider.max = '100'; slider.value = '0';
    slider.style.cssText = 'width:100%;cursor:pointer';
    slider.addEventListener('input', function() {
      opts.contrast = parseInt(slider.value, 10);
      log('§PRINT_SHEET contrast=' + opts.contrast);
    });
    sliderRow.appendChild(sliderLbl);
    sliderRow.appendChild(slider);
    ctrlPanel.appendChild(sliderRow);

    // Corporate info display
    var corpDisplayName = corp.firmName || corp.logoText || corp.company || '';
    if (corpDisplayName) {
      var corpDiv = document.createElement('div');
      corpDiv.style.cssText =
        'margin-top:8px;padding:8px;background:rgba(0,0,0,0.3);' +
        'border-radius:4px;font-size:10px;color:#777;border:1px solid #333';
      corpDiv.innerHTML =
        '<b style="color:#999">' + corpDisplayName + '</b><br>' +
        (corp.tagline ? corp.tagline + '<br>' : '') +
        (corp.subtitle || '');
      ctrlPanel.appendChild(corpDiv);
    }

    contentRow.appendChild(previewCanvas);
    contentRow.appendChild(ctrlPanel);
    overlay.appendChild(titleBar);
    overlay.appendChild(contentRow);
    document.body.appendChild(overlay);

    // ── Implementing 2D_027 §3.3 — Regenerate button ─────────────
    regenBtn.onclick = function() {
      drawSheet(ctx, A.camera, sceneImg, info, opts);
      log('§PRINT_PREVIEW rendered orient=' + (opts.useLandscape ? 'L' : 'P') + ' fields=6');
    };

    // ── Download button ───────────────────────────────────────────
    downloadBtn.onclick = function() {
      var saveCanvas = document.createElement('canvas');
      saveCanvas.width  = sheetW;
      saveCanvas.height = sheetH;
      var saveCtx = saveCanvas.getContext('2d');
      drawSheet(saveCtx, A.camera, sceneImg, info, opts);

      var viewName = opts.subtitle || info.storey || 'View';
      var fileName = 'BIM_OOTB_' +
        (opts.title || info.name).replace(/\s+/g, '_') + '_' +
        viewName.replace(/\s+/g, '_') + '_' +
        new Date().toISOString().slice(0, 10) + '.png';
      var link = document.createElement('a');
      link.download = fileName;
      link.href = saveCanvas.toDataURL('image/png');
      link.click();
      if (A.status) A.status.textContent = 'Saved: ' + fileName;
      log('§PRINT_SHEET save_png name=' + fileName + ' size=' + sheetW + 'x' + sheetH);
    };

    // ── Draggable overlay via _makeDraggable ──────────────────────
    if (A._makeDraggable) {
      A._makeDraggable(overlay);
    } else {
      // Minimal inline drag on titleBar
      (function() {
        var dragging = false, ox = 0, oy = 0;
        titleBar.addEventListener('pointerdown', function(e) {
          dragging = true; ox = e.clientX; oy = e.clientY;
          titleBar.style.cursor = 'grabbing';
          e.stopPropagation();
        });
        document.addEventListener('pointermove', function(e) {
          if (!dragging) return;
          overlay.scrollLeft -= e.clientX - ox;
          overlay.scrollTop  -= e.clientY - oy;
          ox = e.clientX; oy = e.clientY;
        });
        document.addEventListener('pointerup', function() {
          dragging = false;
          titleBar.style.cursor = 'grab';
        });
      })();
    }

    // ── Escape to close ───────────────────────────────────────────
    var escHandler = function(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);

    // ── Initial draw ──────────────────────────────────────────────
    drawSheet(ctx, A.camera, sceneImg, info, opts);
    log('§PRINT_PREVIEW rendered orient=' + (orient.useLandscape ? 'L' : 'P') + ' fields=6');
    log('§PRINT_SHEET preview shown firmName=' + (corp.firmName || corp.company || 'none') +
        ' title=' + opts.title + ' view=' + opts.subtitle);
  }

  // ── Entry Point ───────────────────────────────────────────────────

  /**
   * Capture current Three.js view and open interactive A3 print preview.
   * @param {Object} A — APP object (needs renderer, canvas, camera, db, activeBuilding)
   * @param {Object} [optsOverride] — optional overrides ({ preview, overrides })
   */
  function capture(A, optsOverride) {
    log('§PRINT_SHEET start');
    A.renderer.render(A.scene, A.camera);
    var sceneDataURL = A.canvas.toDataURL('image/png');
    var info = queryBuildingInfo(A);

    // Implementing 2D_027 §3.1 — Witness: W-2D27
    // Orientation resolved per camera frustum (called again inside showPreview for modal)
    var orient = resolveOrientation(A.camera);
    log('§PRINT_SHEET orient=' + (orient.useLandscape ? 'landscape' : 'portrait') +
        ' sheetW=' + orient.sheetW + ' sheetH=' + orient.sheetH);

    loadCorporate(function(corp) {
      var img = new Image();
      img.onload = function() {
        showPreview(A, img, info, corp);
      };
      img.src = sceneDataURL;
    });
  }

  // Implementing 2D_027 §3.3 — Witness: W-2D27
  // PrintSheet.preview is the §3.3 editable preview entry point
  // tools.js calls PrintSheet.capture(A) which internally shows the preview modal
  // NOTE: If tools.js or grid_overlay.js need to call preview() directly, wire to capture().
  function preview(A) {
    capture(A);
  }

  return {
    capture: capture,
    preview: preview
  };
})();
