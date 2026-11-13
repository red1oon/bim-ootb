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
const surface = require('./lib/app_surface_index');
const surfaceRefresh = require('./lib/surface_refresh');

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

  // The APP field index (§F.5): X0 keeps its own fresh copy in VS Code's storage folder, made by the repo's own
  // generator. Until that copy exists, or if the generator fails, the committed internal/APP_SURFACE.md is used.
  // Either way the file is re-read only when it changes (one stat per request).
  const storage = context.storageUri || context.globalStorageUri;
  // A generator run costs ~4 s and ~300 MB in a child process (measured 2026-11-13), so it is never run per save:
  // a save only marks the copy dirty, and the next lookup that finds a moved or unknown field starts ONE run.
  let fields = null, fieldsKey = '', refresher = null, refresherRoot = null, freshFile = null, dirty = false;
  function refreshFields() {
    const sourceRoot = findSourceRoot(context);
    if (!sourceRoot || !storage) return Promise.resolve(null);
    if (!refresher || refresherRoot !== sourceRoot) {
      refresher = surfaceRefresh.createRefresher(sourceRoot, path.join(storage.fsPath, 'app_surface'));
      refresherRoot = sourceRoot;
      freshFile = null;
    }
    dirty = false;
    return refresher.refresh().then(r => { freshFile = r.file; return r; }, () => null);
  }
  function getFields() {
    const sourceRoot = findSourceRoot(context);
    if (!sourceRoot) return null;
    const file = freshFile && refresherRoot === sourceRoot ? freshFile : path.join(sourceRoot, MARKER);
    let key;
    try { key = file + '@' + fs.statSync(file).mtimeMs; } catch (e) { return null; }
    if (!fields || key !== fieldsKey) { fields = surface.loadSurface(sourceRoot, file); fieldsKey = key; }
    return fields;
  }
  const firstRefresh = refreshFields();
  function fieldUnderCursor(document, position) {
    const hit = surface.fieldAt(document.lineAt(position.line).text, position.character, document.getText());
    if (!hit) return null;
    const index = getFields();
    const res = index ? surface.resolve(index, hit.field) : null;
    if (dirty && (!res || res.kind === 'stale')) refreshFields(); // answers the NEXT lookup; this one stays honest
    return res;
  }

  // X0-1: F12 on the god object's field → where it is written. Phantom, stale or unknown → no jump (never a guess).
  context.subscriptions.push(vscode.languages.registerDefinitionProvider(JS, {
    provideDefinition(document, position) {
      const res = fieldUnderCursor(document, position);
      if (!res || res.kind !== 'definition') return null;
      return new vscode.Location(vscode.Uri.file(res.abs), new vscode.Position(res.line - 1, res.column));
    }
  }));
  // X0-1: hover → written at · writes · reads, or PHANTOM, or "index stale".
  context.subscriptions.push(vscode.languages.registerHoverProvider(JS, {
    provideHover(document, position) {
      const text = surface.formatHover(fieldUnderCursor(document, position), link);
      return text ? new vscode.Hover(new vscode.MarkdownString(text)) : null;
    }
  }));

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
    if (/\.(js|mjs|html)$/.test(doc.fileName)) dirty = true;
  }));
  context.subscriptions.push(vscode.commands.registerCommand('x0Navigator.rebuildIndexes', () => {
    tags = null;
    fields = null;
    refreshFields();
    const index = getTags();
    vscode.window.showInformationMessage(index
      ? 'X0 Navigator: ' + index.spec.tags.size + ' §TAGs in ' + index.spec.files + ' spec files'
      : 'X0 Navigator: bim-ootb root not found (no ' + MARKER + ' in the open folders)');
  }));

  // For the node witness: when the first fresh copy is ready, and which index file the providers read now.
  return {
    whenFresh: () => firstRefresh,
    indexFile: () => { const f = getFields(); return f ? f.file : null; },
    refreshRuns: () => (refresher ? refresher.runs() : 0)
  };
}

function deactivate() {}

module.exports = { activate, deactivate };
