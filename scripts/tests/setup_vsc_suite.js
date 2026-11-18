// SPDX-License-Identifier: MIT
// W-SETUP T9, the half that runs INSIDE the real VS Code (launched by witness_setup.js with the folder + the extensions folder node scripts/setup.js made).
// It reports what VS Code itself sees: the opened folder, whether X0 is there and active, and the task labels. It judges nothing.
'use strict';
const fs = require('fs'), vscode = require('vscode');
exports.run = async function () {
  const r = { vscode: vscode.version, folder: ((vscode.workspace.workspaceFolders || [])[0] || { uri: { fsPath: null } }).uri.fsPath };
  try {
    const ext = vscode.extensions.getExtension('bim-devtools.x0-navigator');
    r.x0_found = !!ext; if (ext) { await ext.activate(); r.x0_active = ext.isActive; r.x0_path = ext.extensionPath; }
    let t = []; for (let i = 0; i < 20 && !t.length; i++) { t = await vscode.tasks.fetchTasks(); if (!t.length) await new Promise(res => setTimeout(res, 500)); }
    r.tasks = t.filter(x => x.source === 'Workspace').map(x => x.name);
  } catch (e) { r.error = String(e && e.stack || e); }
  fs.writeFileSync(process.env.SETUP_VSC_OUT, JSON.stringify(r));
};
