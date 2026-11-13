// SPDX-License-Identifier: MIT
// X0 Navigator — thin glue between VS Code and the pure modules in lib/.
// Spec: bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.4 · issue #2920.
// Rules: plain JS, only the `vscode` API, no npm dependencies, no build step. All logic lives in lib/ (witnessed in node).
// This file holds no knowledge of the codebase: it only reads generated files and the specs.
'use strict';
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const tagIndex = require('./lib/tag_index');

const JS = { language: 'javascript' };
const MARKER = path.join('internal', 'APP_SURFACE.md'); // a folder holding this file is the bim-ootb root

/** The bim-ootb root: an open workspace folder first, else the checkout this extension folder sits in. */
function findSourceRoot(context) {
  for (const f of vscode.workspace.workspaceFolders || []) {
    if (fs.existsSync(path.join(f.uri.fsPath, MARKER))) return f.uri.fsPath;
  }
  try {
    const up = path.resolve(fs.realpathSync(context.extensionPath), '..', '..', '..');
    if (fs.existsSync(path.join(up, MARKER))) return up;
  } catch (e) { /* not installed from the repo */ }
  return null;
}

/** The bim-compiler root: the setting, else a sibling folder of bim-ootb. Never a hard-coded home path. */
function findCompilerRoot(sourceRoot) {
  const set = vscode.workspace.getConfiguration('bimDevtools').get('compilerRoot');
  return set ? path.resolve(sourceRoot, set) : path.resolve(sourceRoot, '..', 'bim-compiler');
}

function activate(context) {
  let tags = null; // built on the first hover, dropped when a .js or .md file is saved

  function getTags() {
    if (tags) return tags;
    const sourceRoot = findSourceRoot(context);
    if (!sourceRoot) return null;
    tags = tagIndex.buildIndex([
      { name: 'bim-ootb', dir: sourceRoot },
      { name: 'bim-compiler', dir: findCompilerRoot(sourceRoot) }
    ]);
    return tags;
  }
  const link = (abs, line) => vscode.Uri.file(abs).with({ fragment: 'L' + line }).toString();

  // X0-2: hover on a §TAG → its spec places and the code that prints it.
  context.subscriptions.push(vscode.languages.registerHoverProvider(JS, {
    provideHover(document, position) {
      const tag = tagIndex.tagAt(document.lineAt(position.line).text, position.character);
      if (!tag) return null;
      const index = getTags();
      if (!index) return null;
      return new vscode.Hover(new vscode.MarkdownString(tagIndex.formatHover(tagIndex.lookup(index, tag), link)));
    }
  }));

  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc => {
    if (/\.(js|md)$/.test(doc.fileName)) tags = null;
  }));
  context.subscriptions.push(vscode.commands.registerCommand('x0Navigator.rebuildIndexes', () => {
    tags = null;
    const index = getTags();
    vscode.window.showInformationMessage(index
      ? 'X0 Navigator: ' + index.spec.tags.size + ' §TAGs in ' + index.spec.files + ' spec files'
      : 'X0 Navigator: bim-ootb root not found (no ' + MARKER + ' in the open folders)');
  }));
}

function deactivate() {}

module.exports = { activate, deactivate };
