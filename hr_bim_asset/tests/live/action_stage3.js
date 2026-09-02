// §STAGE3 live action (RESUME_HBA_ERP_STAGE3.md item 4) — exercise the REAL user path: FM drawer → Presence
// lens + governed roster → BIM BOM pane; print ONE §DIAG truth line (whitebox-first — the log tells, the shot confirms).
var A = window.APP;
HBALens.openFamilyDrawer(A);
HBALens.activateLens(A, { kind: 'lens', mode: 'presence' });
HBALens.openPresenceDrawer(A);
if (window.HBABomPane) HBABomPane.toggle(A);
var att = A._hbaAttendanceSpec, bom = A._hbaBomSpec;
var presD = document.getElementById('hba-presence-drawer');
var presRows = presD ? presD.querySelectorAll('[data-employee]').length : -1;
var presGoverned = presD ? /ERP-governed/.test(presD.textContent) : false;
var bomP = document.getElementById('hba-bom-pane');
var bomAsmRows = bomP ? bomP.querySelectorAll('[data-assembly-guid]').length : -1;
var bomLineRows = bomP ? bomP.querySelectorAll('[data-line-id]').length : -1;
console.log('§DIAG_STAGE3 attRows=' + (att ? att.rows.length : -1) + ' attSkipped=' + (att ? att.skipped.length : -1)
  + ' presRows=' + presRows + ' presGoverned=' + presGoverned
  + ' bomAsm=' + (bom ? bom.assemblies.length : -1) + ' bomAsmRows=' + bomAsmRows + ' bomLineRows=' + bomLineRows
  + ' tinted=' + HBALens.tintedCount());
