// SPDX-License-Identifier: MIT
// W-X0-INSTALL, the half that runs INSIDE VS Code (launched by install.js). It reports whether VS Code itself has the
// INSTALLED extension, and what a hover gives. It judges nothing.
'use strict';
const fs = require('fs');
const vscode = require('vscode');
const sleep = ms => new Promise(r => setTimeout(r, ms));
exports.run = async function () {
  const plan = JSON.parse(process.env.X0_INSTALL_PLAN);
  const r = { vscode: vscode.version, found: false };
  try {
    const ext = vscode.extensions.getExtension('bim-devtools.x0-navigator');
    r.found = !!ext;
    if (ext) {
      const api = await ext.activate();
      r.active = ext.isActive; r.path = ext.extensionPath;
      const f = await Promise.race([api.whenFresh(), sleep(90000).then(() => null)]);
      r.fresh = f ? f.line : null;
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(plan.file));
      await vscode.window.showTextDocument(doc);
      const hov = await vscode.commands.executeCommand('vscode.executeHoverProvider', doc.uri, new vscode.Position(plan.line - 1, plan.col));
      r.hover = (hov || []).map(h => (Array.isArray(h.contents) ? h.contents : [h.contents]).map(c => (typeof c === 'string' ? c : (c && c.value) || '')).join(' ')).join(' | ');
    }
  } catch (e) { r.error = String(e && e.stack || e); }
  fs.writeFileSync(process.env.X0_INSTALL_OUT, JSON.stringify(r));
};
