// SPDX-License-Identifier: MIT
// W-X0-REALVSC, the half that runs INSIDE VS Code (its extension-test mode loads this file and calls run()).
// Spec: bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.9 · issue #2932. Launched by run.js; never run by hand.
// It asks VS Code itself what a user would get (executeDefinitionProvider / executeHoverProvider on a real
// document) and writes the raw answers to the JSON file named in X0_REALVSC_OUT. It judges nothing: run.js does.
'use strict';
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const withTimeout = (p, ms) => Promise.race([p, sleep(ms).then(() => '__timeout__')]);
const hoverText = hs => (hs || []).map(h => (Array.isArray(h.contents) ? h.contents : [h.contents])
  .map(c => (typeof c === 'string' ? c : (c && c.value) || '')).join('\n')).join('\n---\n');
const locs = ls => (ls || []).map(l => {
  const uri = l.uri || l.targetUri, range = l.range || l.targetSelectionRange || l.targetRange;
  return { file: uri ? uri.fsPath : '', line: range ? range.start.line + 1 : 0 };
});

async function run() {
  const out = process.env.X0_REALVSC_OUT;
  const plan = JSON.parse(process.env.X0_REALVSC_PLAN || '{}');
  const res = { vscode: vscode.version, steps: {}, error: null };
  try {
    const ext = vscode.extensions.getExtension('bim-devtools.x0-navigator');
    res.found = !!ext;
    const api = await ext.activate();
    res.active = ext.isActive;
    res.indexBefore = api.indexFile();
    const fresh = await withTimeout(api.whenFresh(), 90000);
    res.fresh = fresh === '__timeout__' ? 'timeout' : (fresh ? { file: fresh.file, ms: fresh.ms, line: fresh.line } : null);
    res.indexAfter = api.indexFile();
    res.storage = !!res.indexAfter && res.indexAfter !== res.indexBefore;

    const at = async (label, file, line, col, tries) => {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
      await vscode.window.showTextDocument(doc);
      const pos = new vscode.Position(line - 1, col);
      let defs = [], hov = [];
      // VS Code's own JavaScript support answers late on a big project: ask until two answers agree (or `tries` run out).
      let last = -1;
      for (let i = 0; i < (tries || 1); i++) {
        defs = locs(await vscode.commands.executeCommand('vscode.executeDefinitionProvider', doc.uri, pos));
        hov = await vscode.commands.executeCommand('vscode.executeHoverProvider', doc.uri, pos);
        if (defs.length === last && i >= 2) break;
        last = defs.length;
        if (tries > 1) await sleep(3000);
      }
      const refs = locs(await vscode.commands.executeCommand('vscode.executeReferenceProvider', doc.uri, pos));
      res.steps[label] = { text: doc.lineAt(line - 1).text.trim().slice(0, 160), defs, hover: hoverText(hov), refs };
    };
    // Is VS Code's own JavaScript support answering yet? Ask it about a plain local function call (it can resolve
    // that without X0) until it does, so "it found nothing for the field" below is not just "it was still loading".
    if (plan.probe) {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(plan.probe.file));
      await vscode.window.showTextDocument(doc);
      const pos = new vscode.Position(plan.probe.line - 1, plan.probe.col);
      const t0 = Date.now();
      res.probe = { ready: false, seconds: 0, name: plan.probe.name };
      while (Date.now() - t0 < 150000) {
        const d = locs(await vscode.commands.executeCommand('vscode.executeDefinitionProvider', doc.uri, pos));
        if (d.length > 0) { res.probe.ready = true; res.probe.to = d[0].file + ':' + d[0].line; break; }
        await sleep(2000);
      }
      res.probe.seconds = Math.round((Date.now() - t0) / 100) / 10;
    }
    for (const s of plan.steps || []) await at(s.label, s.file, s.line, s.col, s.tries);
    // §F.12 first versions, asked through VS Code's own command and provider entry points
    if (plan.extras) {
      const x = res.extras = {};
      const all = await vscode.commands.getCommands(true);
      x.commands = all.filter(c => c.startsWith('x0Navigator.')).sort();
      x.cost = await vscode.commands.executeCommand('x0Navigator.costIfDeployed');
      x.check = await vscode.commands.executeCommand('x0Navigator.shipCheck');
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(plan.extras.lensFile));
      await vscode.window.showTextDocument(doc);
      x.status = api.statusText(doc);
      const lenses = await vscode.commands.executeCommand('vscode.executeCodeLensProvider', doc.uri, 500);
      x.lenses = (lenses || []).filter(l => l.command && l.command.command === 'x0Navigator.openLogLine').map(l => ({ line: l.range.start.line + 1, title: l.command.title }));
      // F-6: a real cached file is edited and saved in the editor → X0's warning, its two quick fixes, and the dry run.
      // The edit is taken back and saved again before anything else (run.js also restores the file from git).
      if (plan.extras.bumpFile) {
        const bdoc = await vscode.workspace.openTextDocument(vscode.Uri.file(plan.extras.bumpFile));
        const bed = await vscode.window.showTextDocument(bdoc);
        const mineOf = () => vscode.languages.getDiagnostics(bdoc.uri).filter(d => d.code === 'x0.bump');
        x.bumpBefore = mineOf().length;
        await bed.edit(e => e.insert(new vscode.Position(0, 0), '// realvsc: one line added\n'));
        await bdoc.save(); await sleep(1500);
        const diags = mineOf();
        x.bumpAfter = diags.length; x.bumpMessage = diags[0] ? diags[0].message : '';
        const acts = diags[0] ? await vscode.commands.executeCommand('vscode.executeCodeActionProvider', bdoc.uri, diags[0].range, 'quickfix') : [];
        x.bumpActions = (acts || []).filter(a => a.command && a.command.command === 'x0Navigator.bumpThisFile').map(a => ({ title: a.title, write: a.command.arguments[1] }));
        x.bumpDry = await vscode.commands.executeCommand('x0Navigator.bumpThisFile', plan.extras.bumpRel, false);
        await bed.edit(e => e.delete(new vscode.Range(0, 0, 1, 0)));
        await bdoc.save(); await sleep(1500);
        x.bumpRestored = mineOf().length;
      }
      // §F.16: "Context for this file", run as a VS Code command on the open file. It copies the block and opens it beside.
      await vscode.window.showTextDocument(doc);
      x.context = await vscode.commands.executeCommand('x0Navigator.contextForFile');
      await sleep(500);
      x.contextClip = await vscode.env.clipboard.readText();
      x.contextDocs = vscode.window.visibleTextEditors.filter(e => e.document.languageId === 'markdown' && e.document.getText().startsWith('# Context for')).length;
    }
  } catch (e) {
    res.error = String(e && e.stack || e);
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(res, null, 1));
}

module.exports = { run };
