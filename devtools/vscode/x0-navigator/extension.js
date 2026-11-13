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
const deployCost = require('./lib/deploy_cost');
const lensIndex = require('./lib/lens_index');
const ship = require('./lib/ship');
const fileContext = require('./lib/file_context');

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
      const last = lastValueLine(document, position.line, tag);
      return new vscode.Hover(new vscode.MarkdownString(tagIndex.formatHover(tagIndex.lookup(index, tag), link) + (last ? '\n\n' + last : '')));
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

  // ── Cost if deployed (§F.12a): start-up and offline-cache bytes of the working tree vs a git ref. Raw bytes, no browser. ──
  const out = vscode.window.createOutputChannel('X0 Navigator');
  context.subscriptions.push(out);
  let costNow = null, costAt = 0;
  function measureNow() {
    const sourceRoot = findSourceRoot(context);
    if (!sourceRoot) return null;
    if (!costNow || Date.now() - costAt > 30000) { costNow = deployCost.measure(sourceRoot, deployCost.fsReader(sourceRoot)); costAt = Date.now(); }
    return costNow;
  }
  function costIfDeployed() {
    const sourceRoot = findSourceRoot(context);
    if (!sourceRoot) return ['X0 Navigator: bim-ootb root not found'];
    const ref = vscode.workspace.getConfiguration('bimDevtools').get('costBaseRef') || 'origin/main';
    const lines = [];
    try {
      costNow = null;
      const now = measureNow();
      if (!now.parser) return ['\u00a7DEPLOY_COST verdict=INCONCLUSIVE reason="no JavaScript parser found (scripts/lib/find_ts.js)"'];
      for (const r of deployCost.compare(now, deployCost.measure(sourceRoot, deployCost.gitReader(sourceRoot, ref)))) {
        lines.push(deployCost.formatRow(r, ref));
        for (const f of r.newBoot) lines.push('    new at start-up: ' + f);
        for (const f of r.movedToBoot) lines.push('    moved from offline-cache-only to start-up: ' + f);
      }
      lines.push('  raw bytes, not minified; start-up = all pages of the app together; no budget is applied (first version)');
    } catch (e) { lines.push('\u00a7DEPLOY_COST verdict=INCONCLUSIVE reason=' + JSON.stringify(String(e.message).split('\n')[0])); }
    return lines;
  }
  context.subscriptions.push(vscode.commands.registerCommand('x0Navigator.costIfDeployed', () => {
    const lines = costIfDeployed();
    lines.forEach(l => out.appendLine(l));
    out.show(true);
    return lines;
  }));
  // Context for this file (§F.16, F-3 (a)): what the indexes say about the open file, as markdown, for whatever assistant the
  // developer chose. Opened beside the code and copied. X0 calls no model: the developer pastes it where they like.
  context.subscriptions.push(vscode.commands.registerCommand('x0Navigator.contextForFile', async () => {
    const sourceRoot = findSourceRoot(context);
    const editor = vscode.window.activeTextEditor;
    if (!sourceRoot || !editor || !editor.document.uri.fsPath.startsWith(sourceRoot + path.sep)) {
      vscode.window.showInformationMessage('X0 Navigator: open a file of the bim-ootb folder first');
      return null;
    }
    const rel = path.relative(sourceRoot, editor.document.uri.fsPath).split(path.sep).join('/');
    const r = fileContext.build(sourceRoot, rel, { fields: getFields(), tagIndex: getTags(), costNow: measureNow(), extraLogDirs: extraLogDirs() });
    try {
      await vscode.env.clipboard.writeText(r.text);
      const doc = await vscode.workspace.openTextDocument({ content: r.text, language: 'markdown' });
      await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: true, preserveFocus: true });
      vscode.window.showInformationMessage('X0 Navigator: context for ' + rel + ' copied');
    } catch (e) { out.appendLine(r.text); out.show(true); }
    return r.text;
  }));
  // Status bar: how the open file reaches a user. "start-up" = every user pays for it when the page opens.
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  context.subscriptions.push(status);
  function statusText(document) {
    const sourceRoot = findSourceRoot(context);
    if (!document || !sourceRoot || !document.uri.fsPath.startsWith(sourceRoot + path.sep)) return null;
    let m; try { m = measureNow(); } catch (e) { return null; }
    if (!m || !m.parser) return null;
    const rel = path.relative(sourceRoot, document.uri.fsPath).split(path.sep).join('/');
    const cls = deployCost.fileClass(m, rel);
    return cls.length ? cls.map(c => c.app + ': ' + c.how + ' \u00b7 ' + deployCost.kb(c.bytes)).join('  |  ') : 'not loaded at start';
  }
  function showStatus(editor) {
    const t = editor ? statusText(editor.document) : null;
    if (t) { status.text = '$(package) ' + t; status.tooltip = 'X0 Navigator: how this file reaches a user (raw bytes). Command: Cost if deployed'; status.command = 'x0Navigator.costIfDeployed'; status.show(); } else status.hide();
  }
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(showStatus));
  showStatus(vscode.window.activeTextEditor);

  // ── Values beside the code (§F.12b): above a line that prints a §TAG, the last value a STAMPED log holds for it, shown
  //    only when the printing file is unchanged since that log's commit. Logs are re-read only when one of them changes. ──
  let logScan = null, logScanKey = '';
  const proofCache = new Map();
  function extraLogDirs() {
    const set = vscode.workspace.getConfiguration('bimDevtools').get('extraLogDirs');
    return Array.isArray(set) ? set : lensIndex.DEFAULT_EXTRA;
  }
  // The checkout's own logs/ is re-read when one of its files changes; the extra folders (hundreds of files, outside the
  // repo) are re-listed at most every 15 s.
  let logScanAt = 0;
  function scanLogs(sourceRoot) {
    const dir = path.join(sourceRoot, 'logs');
    let key = '';
    try { key = fs.readdirSync(dir).filter(n => n.endsWith('.log')).map(n => n + ':' + fs.statSync(path.join(dir, n)).mtimeMs).join('|'); } catch (e) { key = ''; }
    const extra = extraLogDirs();
    key += '\u0000' + extra.join('|');
    if (!logScan || key !== logScanKey || Date.now() - logScanAt > 15000) {
      logScan = lensIndex.scanLogs(lensIndex.logDirs(sourceRoot, extra)); logScanKey = key; logScanAt = Date.now(); proofCache.clear();
    }
    return logScan;
  }
  function lenses(document) {
    const sourceRoot = findSourceRoot(context);
    if (!sourceRoot || !document.uri.fsPath.startsWith(sourceRoot + path.sep)) return { shown: [], hidden: [] };
    const scan = scanLogs(sourceRoot);
    if (!scan.logs.length) return { shown: [], hidden: [] };
    const rel = path.relative(sourceRoot, document.uri.fsPath).split(path.sep).join('/');
    return lensIndex.lensesFor(sourceRoot, rel, document.getText(), scan, proofCache);
  }
  // §F.15 step 2: on a line that PRINTS the tag, the hover also says the last provable value, or names why there is none
  // (the grey line above stays silent in that case; the hover is where the reason is asked for). Other lines: nothing added.
  function lastValueLine(document, line, tag) {
    const sourceRoot = findSourceRoot(context);
    if (!sourceRoot || !document.uri || !document.uri.fsPath.startsWith(sourceRoot + path.sep)) return null;
    const rel = path.relative(sourceRoot, document.uri.fsPath).split(path.sep).join('/');
    const e = lensIndex.explain(sourceRoot, rel, document.getText(), scanLogs(sourceRoot), proofCache).find(x => x.line === line && x.tag === tag);
    return e ? lensIndex.hoverLine(e) : null;
  }
  const lensChanged = new vscode.EventEmitter();
  context.subscriptions.push(lensChanged);
  context.subscriptions.push(vscode.languages.registerCodeLensProvider(JS, {
    onDidChangeCodeLenses: lensChanged.event,
    provideCodeLenses(document) {
      return lenses(document).shown.map(l => new vscode.CodeLens(new vscode.Range(l.line, 0, l.line, 0),
        { title: lensIndex.title(l), tooltip: 'From ' + l.logName + ' line ' + l.logLine + ', made at commit ' + l.commit + '. This file is unchanged since.', command: 'x0Navigator.openLogLine', arguments: [l.log, l.logLine] }));
    }
  }));
  context.subscriptions.push(vscode.commands.registerCommand('x0Navigator.openLogLine', async (file, line) => {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    const ed = await vscode.window.showTextDocument(doc);
    const pos = new vscode.Position(Math.max(0, (line || 1) - 1), 0);
    ed.selection = new vscode.Selection(pos, pos);
    ed.revealRange(new vscode.Range(pos, pos));
  }));
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(() => { proofCache.clear(); lensChanged.fire(); }));

  // ── Run and ship (§F.12c), first version: Run local · Check · Fetch back. Each step prints § lines to the output and stops at
  //    the first failure. Nothing here commits, pushes, merges or deploys. Fetch back is the one step that uses the network. ──
  const say = lines => { lines.forEach(l => out.appendLine(l)); out.show(true); return lines; };
  const baseRef = () => vscode.workspace.getConfiguration('bimDevtools').get('costBaseRef') || 'origin/main';
  async function shipRunLocal() {
    const sourceRoot = findSourceRoot(context);
    if (!sourceRoot) return say(['X0 Navigator: bim-ootb root not found']);
    let started = 'no task named "Serve repo…" in this workspace';
    try {
      const task = (await vscode.tasks.fetchTasks()).find(t => /^Serve repo/.test(t.name));
      if (task) { await vscode.tasks.executeTask(task); started = 'started the task "' + task.name + '"'; }
    } catch (e) { started = 'could not start the serve task: ' + e.message; }
    return say(['\u00a7SHIP_RUN ' + started].concat(ship.runLocalLines(sourceRoot, 8000)));
  }
  function shipCheck() {
    const sourceRoot = findSourceRoot(context);
    return say(sourceRoot ? ship.check(sourceRoot, baseRef()).lines : ['X0 Navigator: bim-ootb root not found']);
  }
  async function shipFetchBack() {
    const sourceRoot = findSourceRoot(context);
    if (!sourceRoot) return say(['X0 Navigator: bim-ootb root not found']);
    const site = vscode.workspace.getConfiguration('bimDevtools').get('liveSite') || undefined;
    return say((await ship.fetchBack(sourceRoot, { base: baseRef(), site })).lines);
  }
  context.subscriptions.push(vscode.commands.registerCommand('x0Navigator.shipRunLocal', shipRunLocal));
  context.subscriptions.push(vscode.commands.registerCommand('x0Navigator.shipCheck', shipCheck));
  context.subscriptions.push(vscode.commands.registerCommand('x0Navigator.shipFetchBack', shipFetchBack));
  const STEPS = [
    ['1 · Run local', 'serve the repo, show each app\'s URL and version on disk', 'x0Navigator.shipRunLocal'],
    ['2 · Check', 'syntax, precache audit, cache-version bump', 'x0Navigator.shipCheck'],
    ['3 · Cost if deployed', 'start-up and offline-cache bytes vs main', 'x0Navigator.costIfDeployed'],
    ['4 · Fetch back', 'is the live site on main? (uses the network)', 'x0Navigator.shipFetchBack']
  ];
  context.subscriptions.push(vscode.window.registerTreeDataProvider('x0RunShip', {
    getChildren(el) { return el ? [] : STEPS; },
    getTreeItem(s) {
      const item = new vscode.TreeItem(s[0]);
      item.description = s[1]; item.tooltip = s[1]; item.command = { command: s[2], title: s[0] };
      return item;
    }
  }));

  // For the node witness: when the first fresh copy is ready, and which index file the providers read now.
  return {
    costIfDeployed, statusText, lenses, shipRunLocal, shipCheck, shipFetchBack, steps: () => STEPS,
    whenFresh: () => firstRefresh,
    indexFile: () => { const f = getFields(); return f ? f.file : null; },
    refreshRuns: () => (refresher ? refresher.runs() : 0)
  };
}

function deactivate() {}

module.exports = { activate, deactivate };
