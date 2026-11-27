// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ribbon.js - the handlers ribbon.xml names, for the Sheet Door WPS Spreadsheets add-in. Spec: bim-compiler prompts/SHEET_FRONT_DOOR.md section 11 (slice S4). Witness: erp/tests/witness_sheet_wps.js (P7).
// It does ONE thing: a ribbon button opens the task pane page (../taskpane.html, the page the Excel add-in uses too) at ?action=<id>. No logic, no cell address, no invoice word.
// WPS names used (all on the list in section 11.1): Application.PluginStorage.getItem/setItem, Application.CreateTaskPane(url) -> .ID/.Visible, Application.GetTaskPane(id) -> .Navigate(url)/.Visible,
// and the callback shapes OnAddinLoad(ribbonUI), OnAction(control) with control.Id, GetImage(control) of the wpsjs scaffold. Not run on real WPS.
var ACTION_OF = { btnFileIt: 'fileit', btnStamp: 'stamp', btnCellHistory: 'cellhistory', btnCheckHistory: 'checkhistory' };
var PANE_KEY = 'sheet_door_pane';

function OnAddinLoad(ribbonUI) {                                         // the first function WPS runs in an add-in
  if (typeof (window.Application.ribbonUI) != 'object') window.Application.ribbonUI = ribbonUI;
  return true;
}

function PaneUrl(action) { return new URL('../taskpane.html?action=' + action, document.location.href).href; }   // resolved from this entry page's own address (the scaffold's GetUrlPath way)

function OnAction(control) {
  var action = ACTION_OF[control.Id];
  if (!action) return true;
  var app = window.Application, id = app.PluginStorage.getItem(PANE_KEY), pane = null;
  if (id) { try { pane = app.GetTaskPane(Number(id)); pane.Navigate(PaneUrl(action)); } catch (e) { pane = null; } }   // a pane that no longer exists is made anew
  if (!pane) { pane = app.CreateTaskPane(PaneUrl(action)); app.PluginStorage.setItem(PANE_KEY, pane.ID); }
  pane.Visible = true;
  return true;
}

function GetImage(control) { return 'images/door.svg'; }
