// SPDX-License-Identifier: MIT
// Code Facts — thin glue between VS Code and the pure modules in lib/.
// Spec: bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.4 · issue #2920.
// Rules: plain JS, only the `vscode` API, no npm dependencies, no build step. All logic lives in lib/ (witnessed in node).
// This file holds no knowledge of the codebase: it only reads generated files and the specs.
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');   // §F.31: the memory run is a child node process
const vscode = require('vscode');
const tagIndex = require('./lib/tag_index');
const surface = require('./lib/app_surface_index');
const surfaceRefresh = require('./lib/surface_refresh');
const deployCost = require('./lib/deploy_cost');
const lensIndex = require('./lib/lens_index');
const ship = require('./lib/ship');
const fileContext = require('./lib/file_context');
const appRefs = require('./lib/app_refs');
const buildStamp = require('./lib/build_stamp');
const witnessStub = require('./lib/witness_stub');
const catalogIndex = require('./lib/catalog_index');

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

  // The APP field index (§F.5): Code Facts keeps its own fresh copy in VS Code's storage folder, made by the repo's own
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

  // slice-1: F12 on the god object's field → where it is written. Phantom, stale or unknown → no jump (never a guess).
  context.subscriptions.push(vscode.languages.registerDefinitionProvider(JS, {
    provideDefinition(document, position) {
      const res = fieldUnderCursor(document, position);
      if (!res || res.kind !== 'definition') return null;
      return new vscode.Location(vscode.Uri.file(res.abs), new vscode.Position(res.line - 1, res.column));
    }
  }));
  // Find All References (Shift+F12) on a field of the shared object: every write and read site the repo's own generator
  // recorded, under any of its spellings (§F.19). Sites come with Code Facts' fresh index copy; until that exists there are none.
  context.subscriptions.push(vscode.languages.registerReferenceProvider(JS, {
    provideReferences(document, position, ctx) {
      const hit = surface.fieldAt(document.lineAt(position.line).text, position.character, document.getText());
      const index = hit ? getFields() : null;
      const sourceRoot = findSourceRoot(context);
      if (!hit || !index || !sourceRoot) return null;
      const r = appRefs.references(sourceRoot, appRefs.loadSites(index.file), hit.field);
      if (!r.known) { if (!freshFile) refreshFields(); return null; }
      const sites = (ctx && ctx.includeDeclaration === false ? [] : r.writes).concat(r.reads);
      return sites.map(x => new vscode.Location(vscode.Uri.file(x.abs), new vscode.Position(x.line - 1, x.column)));
    }
  }));
  // slice-1: hover → written at · writes · reads, or PHANTOM, or "index stale".
  context.subscriptions.push(vscode.languages.registerHoverProvider(JS, {
    provideHover(document, position) {
      const text = surface.formatHover(fieldUnderCursor(document, position), link);
      return text ? new vscode.Hover(new vscode.MarkdownString(text)) : null;
    }
  }));

  // F-19 (§F.28, W-CODEFACTS-CATALOG): message keys and door verbs. Hover = the key's text and {n} count, or the verb's entry; F12 = its JSON
  // line; warnings in a catalog user. The scanner is the open folder's own common/door/msg_keys.js. Dev-side only.
  let catalogLoad = null, catalogRoot = null;
  function catalogState() {
    const sourceRoot = findSourceRoot(context);
    if (!sourceRoot) return null;
    if (!catalogLoad || catalogRoot !== sourceRoot) { catalogLoad = catalogIndex.create(sourceRoot); catalogRoot = sourceRoot; }
    return catalogLoad();
  }
  function catalogHit(document, position) {
    const st = catalogState();
    if (!st || !document.uri || !document.uri.fsPath) return null;
    const rel = path.relative(st.root, document.uri.fsPath).split(path.sep).join('/');
    const k = catalogIndex.keyAt(st, document.getText(), rel, position.line + 1, position.character);
    if (k) return { st, hit: k, kind: 'key' };
    const v = catalogIndex.verbAt(st, document.lineAt(position.line).text, position.character);
    return v ? { st, hit: v, kind: 'verb' } : null;
  }
  context.subscriptions.push(vscode.languages.registerHoverProvider(JS, {
    provideHover(document, position) {
      const h = catalogHit(document, position);
      if (!h) return null;
      return new vscode.Hover(new vscode.MarkdownString(h.kind === 'key' ? catalogIndex.formatKey(h.st, h.hit, link) : catalogIndex.formatVerb(h.st, h.hit, link)));
    }
  }));
  context.subscriptions.push(vscode.languages.registerDefinitionProvider(JS, {
    provideDefinition(document, position) {
      const h = catalogHit(document, position);
      const d = h && catalogIndex.definition(h.st, h.hit);
      return d ? new vscode.Location(vscode.Uri.file(d.abs), new vscode.Position(d.line - 1, 0)) : null;
    }
  }));
  const catalogDiag = vscode.languages.createDiagnosticCollection('code-facts-catalog');
  context.subscriptions.push(catalogDiag);
  function judgeCatalog(document) {
    const st = catalogState();
    if (!st || !document || !document.uri || typeof document.getText !== 'function' || document.uri.scheme !== 'file' || !/\.js$/.test(document.uri.fsPath) || !document.uri.fsPath.startsWith(st.root + path.sep)) return null;
    const rel = path.relative(st.root, document.uri.fsPath).split(path.sep).join('/');
    let f;
    try { f = catalogIndex.findings(st, document.getText(), rel); } catch (e) { out.appendLine('§CODEFACTS_CATALOG judge failed ' + rel + ': ' + e.message); return null; }   // a save handler never throws
    if (!f.length) { catalogDiag.delete(document.uri); return f; }
    catalogDiag.set(document.uri, f.map(x => {
      const d = new vscode.Diagnostic(new vscode.Range(x.line - 1, Math.max(0, x.col - 1), x.line - 1, Math.max(0, x.col - 1) + 1),
        (x.kind === 'unknown-key' ? 'Message key ' + x.key + ' is not in ' + catalogIndex.PATHS.messages + ': msg_core throws here when this line runs'
          : x.kind === 'arg-count' ? 'Message key ' + x.key + ': ' + x.detail : 'A message key must be a literal string (W-MSG-CATALOG M3)'),
        vscode.DiagnosticSeverity.Warning);
      d.source = 'Code Facts'; d.code = 'code-facts.' + x.kind;
      return d;
    }));
    return f;
  }
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc => { judgeCatalog(doc); }));
  if (vscode.workspace.onDidOpenTextDocument) context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(doc => { judgeCatalog(doc); }));

  // §F.35 (W-CODEFACTS-CORE-PURE): a core file (Part A, decision A-1) that calls a clock, random numbers or the network itself is underlined on
  // open and on save, before CI's W-CORE-PURE fails the PR. The scanner and the list are the open folder's own scripts/lib/core_pure.js
  // (ONE scanner, shared with the CI witness). No parser in that folder (no node_modules) → no warning and one output line, never a guess.
  const pureDiag = vscode.languages.createDiagnosticCollection('code-facts-core-pure');
  context.subscriptions.push(pureDiag);
  let pureLib = null, pureRoot = null, pureSaid = false;
  function corePure(sourceRoot) {
    if (pureRoot === sourceRoot) return pureLib;
    pureRoot = sourceRoot; pureLib = null;
    try { pureLib = require(path.join(sourceRoot, 'scripts', 'lib', 'core_pure.js')); }
    catch (e) { if (!pureSaid) { pureSaid = true; out.appendLine('§CODEFACTS_CORE_PURE unavailable (' + String(e.message).split('\n')[0] + '): no core-purity warnings in this window'); } }
    return pureLib;
  }
  function judgeCorePure(document) {
    const sourceRoot = findSourceRoot(context);
    if (!sourceRoot || !document || !document.uri || typeof document.getText !== 'function' || document.uri.scheme !== 'file' || !/\.js$/.test(document.uri.fsPath) || !document.uri.fsPath.startsWith(sourceRoot + path.sep)) return null;
    const lib = corePure(sourceRoot);
    if (!lib) return null;
    const rel = path.relative(sourceRoot, document.uri.fsPath).split(path.sep).join('/');
    if (!lib.isCore(rel)) { pureDiag.delete(document.uri); return null; }
    let r;
    try { r = lib.scan(document.getText()); } catch (e) { out.appendLine('§CODEFACTS_CORE_PURE judge failed ' + rel + ': ' + e.message); return null; }   // a save handler never throws
    if (!r.parsed || !r.hits.length) { pureDiag.delete(document.uri); return r.parsed ? [] : null; }   // a file that does not parse mid-edit: say nothing
    pureDiag.set(document.uri, r.hits.map(h => {
      const d = new vscode.Diagnostic(new vscode.Range(h.line - 1, h.col, h.endLine - 1, h.endCol),
        'Core file: ' + h.call + ' reads the ' + h.kind + ' itself, so a replay or a test gets a different value. Instead, ' + lib.ADVICE[h.kind] + '. CI fails this PR (W-CORE-PURE).',
        vscode.DiagnosticSeverity.Warning);
      d.source = 'Code Facts'; d.code = 'code-facts.core-pure.' + h.kind;
      return d;
    }));
    return r.hits;
  }
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc => { judgeCorePure(doc); }));
  if (vscode.workspace.onDidOpenTextDocument) context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(doc => { judgeCorePure(doc); }));

  // slice-2: hover on a §TAG → its spec places and the code that prints it.
  context.subscriptions.push(vscode.languages.registerHoverProvider(JS, {
    provideHover(document, position) {
      const tag = tagIndex.tagAt(document.lineAt(position.line).text, position.character);
      if (!tag) return null;
      const index = getTags();
      if (!index) return null;
      const last = lastValueLine(document, position.line, tag);
      // the value (or the reason there is none) goes right under the tag's name: below a long list of spec places it sat
      // under the fold of the hover and had to be scrolled to (#2980)
      const body = tagIndex.formatHover(tagIndex.lookup(index, tag), link);
      const cut = body.indexOf('\n');
      return new vscode.Hover(new vscode.MarkdownString(!last ? body : cut < 0 ? body + '\n\n' + last : body.slice(0, cut) + '\n\n' + last + body.slice(cut)));
    }
  }));

  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc => {
    if (/\.(js|md)$/.test(doc.fileName)) tags = null;
    if (/\.(js|mjs|html)$/.test(doc.fileName)) dirty = true;
  }));
  context.subscriptions.push(vscode.commands.registerCommand('codeFacts.rebuildIndexes', () => {
    tags = null;
    fields = null;
    refreshFields();
    const index = getTags();
    vscode.window.showInformationMessage(index
      ? 'Code Facts: ' + index.spec.tags.size + ' §TAGs in ' + index.spec.files + ' spec files'
      : 'Code Facts: bim-ootb root not found (no ' + MARKER + ' in the open folders)');
  }));

  // ── Cost if deployed (§F.12a): start-up and offline-cache bytes of the working tree vs a git ref. Raw bytes, no browser. ──
  const out = vscode.window.createOutputChannel('Code Facts');
  context.subscriptions.push(out);
  // ── Is this installed copy older than the source in the open folder? (§F.25, W-CODEFACTS-STAMP). Quiet unless stale. ──
  try {
    const st = buildStamp.compare(context.extensionPath, findSourceRoot(context));
    out.appendLine('§CODEFACTS_STAMP state=' + st.state + ' built=' + String(st.built || '').slice(0, 12) + ' source=' + String(st.source || '').slice(0, 12) + (st.reason ? ' reason=' + st.reason : ''));
    if (st.state === 'stale') vscode.window.showWarningMessage('Code Facts is older than ' + buildStamp.SOURCE.split(path.sep).join('/') + ' in this folder: run node devtools/vscode/pack.js --install, then reload the window.');
  } catch (e) { out.appendLine('§CODEFACTS_STAMP state=unknown reason=' + e.message); }
  let costNow = null, costAt = 0;
  function measureNow() {
    const sourceRoot = findSourceRoot(context);
    if (!sourceRoot) return null;
    if (!costNow || Date.now() - costAt > 30000) { costNow = deployCost.measure(sourceRoot, deployCost.fsReader(sourceRoot)); costAt = Date.now(); }
    return costNow;
  }
  function costIfDeployed() {
    const sourceRoot = findSourceRoot(context);
    if (!sourceRoot) return ['Code Facts: bim-ootb root not found'];
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
  context.subscriptions.push(vscode.commands.registerCommand('codeFacts.costIfDeployed', () => {
    const lines = costIfDeployed();
    lines.forEach(l => out.appendLine(l));
    out.show(true);
    return lines;
  }));
  // ── Memory of the three pages (§F.31; owner F-20 code only, F-21 button only, F-22 Code Facts panel + PR body). A headless browser runs only when
  // this command is pressed, in a child node process (lib/heap_impact.js), so VS Code never waits on it. The status-bar item and the save
  // listener that marks the result stale are created on the first run, never at activation.
  let heapItem = null, heapRunning = false;
  function heapImpact() {
    const sourceRoot = findSourceRoot(context);
    if (!sourceRoot) return Promise.resolve(say(['Code Facts: bim-ootb root not found']));
    if (heapRunning) return Promise.resolve(say(['§HEAP_IMPACT busy=Y (a run is in progress)']));
    heapRunning = true;
    const cfg = vscode.workspace.getConfiguration('bimDevtools');
    const pages = cfg.get('heapPages');
    const args = [path.join(__dirname, 'lib', 'heap_impact.js'), sourceRoot, baseRef()].concat(Array.isArray(pages) && pages.length ? ['--pages', pages.join(',')] : []);
    const lines = [];
    out.show(true);
    return new Promise(resolve => {
      const child = cp.spawn(process.execPath, args, { cwd: sourceRoot, env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' }) });
      let buf = '';
      const take = d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l) { lines.push(l); out.appendLine(l); } } };
      child.stdout.on('data', take); child.stderr.on('data', take);
      child.on('close', () => {
        heapRunning = false;
        if (buf) { lines.push(buf); out.appendLine(buf); }
        const text = heapStatusText(lines);
        if (text) {
          if (!heapItem) {
            heapItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 89);
            heapItem.command = 'codeFacts.heapImpact';
            context.subscriptions.push(heapItem);
            context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc => {
              if (heapItem && doc.uri.fsPath.startsWith(sourceRoot + path.sep) && !/\(stale\)$/.test(heapItem.text)) heapItem.text += ' (stale)';
            }));
          }
          heapItem.text = '$(pulse) ' + text;
          heapItem.tooltip = 'Code Facts: JS heap of each page after boot, working tree vs ' + baseRef() + ' (median of 3 headless runs). Click to measure again.';
          heapItem.show();
        }
        resolve(lines);
      });
    });
  }
  // the status line from the § lines the child printed (the same text lib/heap_impact.js statusText() gives)
  function heapStatusText(lines) {
    const work = {}, delta = {};
    for (const l of lines) {
      let m = l.match(/^§HEAP_IMPACT page=(\S+) tree=work jsMB=(\S+)/); if (m) work[m[1]] = m[2];
      m = l.match(/^§HEAP_IMPACT_DELTA page=(\S+) jsMB=(\S+) .* verdict=(GREW|SHRANK)$/); if (m) delta[m[1]] = m[2];
    }
    const pages = Object.keys(work);
    return pages.length ? 'MB ' + pages.map(p => p.split('/')[0].charAt(0).toUpperCase() + ' ' + work[p] + (delta[p] ? ' (' + delta[p] + ')' : '')).join(' · ') : null;
  }
  context.subscriptions.push(vscode.commands.registerCommand('codeFacts.heapImpact', heapImpact));
  // Context for this file (§F.16, F-3 (a)): what the indexes say about the open file, as markdown, for whatever assistant the
  // developer chose. Opened beside the code and copied. Code Facts calls no model: the developer pastes it where they like.
  context.subscriptions.push(vscode.commands.registerCommand('codeFacts.contextForFile', async () => {
    const sourceRoot = findSourceRoot(context);
    const editor = vscode.window.activeTextEditor;
    if (!sourceRoot || !editor || !editor.document.uri.fsPath.startsWith(sourceRoot + path.sep)) {
      vscode.window.showInformationMessage('Code Facts: open a file of the bim-ootb folder first');
      return null;
    }
    const rel = path.relative(sourceRoot, editor.document.uri.fsPath).split(path.sep).join('/');
    const r = fileContext.build(sourceRoot, rel, { fields: getFields(), tagIndex: getTags(), costNow: measureNow(), extraLogDirs: extraLogDirs() });
    try {
      await vscode.env.clipboard.writeText(r.text);
      const doc = await vscode.workspace.openTextDocument({ content: r.text, language: 'markdown' });
      await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: true, preserveFocus: true });
      vscode.window.showInformationMessage('Code Facts: context for ' + rel + ' copied');
    } catch (e) { out.appendLine(r.text); out.show(true); }
    return r.text;
  }));
  // New witness for this file (§F.26, W-CODEFACTS-NEWWIT): the ONE `witness` snippet, pre-filled with FACTS only (header spec, § tags with
  // their last values, APP fields written). The claim, population and red control stay empty, so it FAILs until a person fills them.
  context.subscriptions.push(vscode.commands.registerCommand('codeFacts.newWitnessForFile', async () => {
    const sourceRoot = findSourceRoot(context);
    const editor = vscode.window.activeTextEditor;
    if (!sourceRoot || !editor || !editor.document.uri.fsPath.startsWith(sourceRoot + path.sep)) {
      vscode.window.showInformationMessage('Code Facts: open a file of the bim-ootb folder first');
      return null;
    }
    const rel = path.relative(sourceRoot, editor.document.uri.fsPath).split(path.sep).join('/');
    const ctx = fileContext.build(sourceRoot, rel, { fields: getFields(), tagIndex: getTags(), costNow: measureNow(), extraLogDirs: extraLogDirs() });
    const r = witnessStub.make(sourceRoot, rel, ctx.facts);
    if (r.refused) { vscode.window.showInformationMessage('Code Facts: no witness made: ' + r.refused); return null; }
    const abs = path.join(sourceRoot, r.path);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, r.text, { flag: 'wx' });   // wx: never overwrite (make() already picked a free name)
    out.appendLine('§CODEFACTS_NEWWIT file=' + rel + ' witness=' + r.path + ' spec=' + (r.spec ? 'Y' : 'N') + ' tags=' + r.tags.length);
    try { const doc = await vscode.workspace.openTextDocument(abs); await vscode.window.showTextDocument(doc); } catch (e) { out.appendLine('open failed: ' + e.message); }
    return r.path;
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
    if (t) { status.text = '$(package) ' + t; status.tooltip = 'Code Facts: how this file reaches a user (raw bytes). Command: Cost if deployed'; status.command = 'codeFacts.costIfDeployed'; status.show(); } else status.hide();
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
        { title: lensIndex.title(l), tooltip: 'From ' + l.logName + ' line ' + l.logLine + ', made at commit ' + l.commit + '. This file is unchanged since.', command: 'codeFacts.openLogLine', arguments: [l.log, l.logLine] }));
    }
  }));
  context.subscriptions.push(vscode.commands.registerCommand('codeFacts.openLogLine', async (file, line) => {
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
    if (!sourceRoot) return say(['Code Facts: bim-ootb root not found']);
    let started = 'no task named "Serve repo…" in this workspace';
    try {
      const task = (await vscode.tasks.fetchTasks()).find(t => /^Serve repo/.test(t.name));
      if (task) { await vscode.tasks.executeTask(task); started = 'started the task "' + task.name + '"'; }
    } catch (e) { started = 'could not start the serve task: ' + e.message; }
    return say(['\u00a7SHIP_RUN ' + started].concat(ship.runLocalLines(sourceRoot, 8000)));
  }
  function shipCheck() {
    const sourceRoot = findSourceRoot(context);
    return say(sourceRoot ? ship.check(sourceRoot, baseRef()).lines : ['Code Facts: bim-ootb root not found']);
  }
  async function shipFetchBack() {
    const sourceRoot = findSourceRoot(context);
    if (!sourceRoot) return say(['Code Facts: bim-ootb root not found']);
    const site = vscode.workspace.getConfiguration('bimDevtools').get('liveSite') || undefined;
    return say((await ship.fetchBack(sourceRoot, { base: baseRef(), site })).lines);
  }
  // ── One-click cache bump (decision F-6, #2986): a saved file the offline cache serves, edited, with its app's CACHE_VERSION
  //    not raised, gets ONE warning on its first line. The quick fix runs the repo's own scripts/bump.js. Nothing is ever
  //    written without that click. The rule is lib/ship.js needsBump (the Check step's rule, for one file). ──
  const BUMP_CODE = 'code-facts.bump';
  const bumpDiag = vscode.languages.createDiagnosticCollection('code-facts-bump');
  context.subscriptions.push(bumpDiag);
  function relIn(document) {
    const sourceRoot = findSourceRoot(context);
    if (!sourceRoot || !document || !document.uri || document.uri.scheme !== 'file' || !document.uri.fsPath.startsWith(sourceRoot + path.sep)) return null;
    return { sourceRoot, rel: path.relative(sourceRoot, document.uri.fsPath).split(path.sep).join('/') };
  }
  function judgeBump(document) {
    const at = relIn(document);
    if (!at) return null;
    let need = null;
    try { costNow = null; need = ship.needsBump(at.sourceRoot, at.rel, baseRef(), measureNow()); } catch (e) { need = null; }
    if (!need) { bumpDiag.delete(document.uri); return null; }
    const d = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1),
      'This file is served from the ' + need.app + ' offline cache and was edited, but ' + need.sw + ' is still ' + need.version +
      ': users with a cached copy keep the old file. Quick fix: bump the cache version.', vscode.DiagnosticSeverity.Warning);
    d.source = 'Code Facts'; d.code = BUMP_CODE;
    bumpDiag.set(document.uri, [d]);
    return need;
  }
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc => {
    judgeBump(doc);
    const sr = findSourceRoot(context);   // §F.34: an edit after the check makes the result stale (it is keyed on the exact tree)
    if (sr && doc && doc.uri && doc.uri.fsPath.startsWith(sr + path.sep) && (bumpState === 'ready' || bumpState === 'failed')) bumpShow('idle', '$(circle-outline) Bump', 'Code Facts: changed since the check. ' + IDLE_TIP);
  }));
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(ed => { if (ed) judgeBump(ed.document); }));
  async function bumpThisFile(rel, write) {
    const sourceRoot = findSourceRoot(context);
    const ed = vscode.window.activeTextEditor;
    const at = rel ? { sourceRoot, rel } : (ed ? relIn(ed.document) : null);
    if (!at || !at.sourceRoot) return say(['Code Facts: open a file of the bim-ootb folder first']);
    if (bumpGateRoots().some(a => at.rel.startsWith(a))) {   // §F.34: a gated (ERP) bump runs minutes; ship.bump's spawnSync (60 s) froze VS Code and failed
      out.appendLine('§BUMP_BUTTON from=quickfix file=' + at.rel + ' (gated: the checks run in the background, then press Bump ✓ to write)');
      return bumpButton();
    }
    if (write === undefined) {                       // from the palette: show the dry run, then ask once
      const dry = ship.bump(at.sourceRoot, at.rel, false);
      say(dry.lines);
      if (!dry.ok) return dry.lines;
      const pick = await vscode.window.showInformationMessage('Code Facts: apply this bump for ' + at.rel + '? (the lines are in the Code Facts output)', 'Apply');
      if (pick !== 'Apply') return dry.lines;
      write = true;
    }
    const r = ship.bump(at.sourceRoot, at.rel, !!write);
    say(r.lines);
    if (write) for (const e of vscode.window.visibleTextEditors) judgeBump(e.document);
    return r.lines;
  }
  context.subscriptions.push(vscode.commands.registerCommand('codeFacts.bumpThisFile', bumpThisFile));
  // ── The Bump button (§F.34, decision F-24): the author presses it when the feature is complete. One background check (scripts/bump.js
  //    --changed --check: the parity bridge + the changed files' own witnesses, async spawn, never spawnSync) of every changed file of the branch;
  //    solid when it passes, a second press writes (the same tree reuses the stored result). A save puts it back to idle. Text only, no timer.
  const bumpBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  bumpBtn.command = 'codeFacts.bumpButton';
  context.subscriptions.push(bumpBtn);
  let bumpState = 'idle', bumpChild = null;
  const IDLE_TIP = 'Code Facts: press when the feature is complete. Checks every changed file of this branch in the background (legacy parity + each file\'s own witnesses); press again when it shows ✓ to write the cache bump.';
  function bumpShow(state, text, tip) { bumpState = state; bumpBtn.text = text; bumpBtn.tooltip = tip; bumpBtn.show(); }
  bumpShow('idle', '$(circle-outline) Bump', IDLE_TIP);
  function bumpRun(args, onLine) {
    const sourceRoot = findSourceRoot(context);
    return new Promise(resolve => {
      const child = bumpChild = cp.spawn(process.execPath, [path.join(sourceRoot, 'scripts', 'bump.js'), '--changed', ...args, '--root', sourceRoot],
        { cwd: sourceRoot, env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' }) });
      const lines = []; let buf = '';
      const take = d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l) { lines.push(l); out.appendLine(l); if (onLine) onLine(l); } } };
      child.stdout.on('data', take); child.stderr.on('data', take);
      child.on('close', code => { bumpChild = null; if (buf) { lines.push(buf); out.appendLine(buf); } resolve({ code, lines }); });
    });
  }
  async function bumpButton() {
    const sourceRoot = findSourceRoot(context);
    if (!sourceRoot) return say(['Code Facts: bim-ootb root not found']);
    if (bumpChild) { out.show(true); return ['§BUMP_BUTTON busy=Y state=' + bumpState]; }
    if (bumpState === 'ready') {
      bumpShow('writing', '$(sync~spin) Bump: writing', 'Code Facts: writing the cache bump (the checks already passed for this tree)');
      const r = await bumpRun(['--write']);
      bumpShow('idle', '$(circle-outline) Bump', IDLE_TIP);
      for (const e of vscode.window.visibleTextEditors || []) judgeBump(e.document);
      out.appendLine('§BUMP_BUTTON step=write exit=' + r.code);
      return r.lines;
    }
    out.show(true);
    let plan = 0, done = 0, phase = 'bridge';
    bumpShow('checking', '$(sync~spin) Bump: checking', 'Code Facts: checking in the background; you can keep working');
    const r = await bumpRun(['--check'], l => {
      let m;
      if ((m = /^§BUMP_PARITY_PLAN witnesses=(\d+)/.exec(l))) { phase = 'bridge'; plan = +m[1]; done = 0; }
      else if ((m = /^§BUMP_TOUCH_PLAN witnesses=(\d+)/.exec(l))) { phase = 'witnesses'; plan = +m[1]; done = 0; }
      else if (/^§BUMP_(PARITY|TOUCH)_RUN /.test(l)) done++;
      else return;
      bumpBtn.text = '$(sync~spin) Bump: ' + phase + ' ' + done + '/' + plan;
    });
    const touch = r.lines.find(l => l.startsWith('§BUMP_TOUCH ')) || '', parity = r.lines.find(l => l.startsWith('§BUMP_PARITY ')) || '';
    if (r.code === 0 && r.lines.some(l => l.startsWith('§BUMP_CHECK verdict=PASS'))) {
      const unrun = (/unrun=\[([^\]]*)\]/.exec(touch) || [])[1];
      bumpShow('ready', '$(pass-filled) Bump ✓', 'Code Facts: the checks passed for this tree' + (unrun ? ' (not reached in the 10-min budget: ' + unrun + ')' : '') + '. Press to write the cache bump.');
    } else if (r.code === 0) bumpShow('idle', '$(circle-outline) Bump', 'Code Facts: nothing to bump (no changed file is loaded by a page). ' + IDLE_TIP);
    else {
      const nf = (/new_fail=\[([^\],]+)/.exec(touch) || /new=\[([^\],]+)/.exec(parity) || [])[1] || (/verdict=(\w+)/.exec(touch || parity) || [])[1] || ('exit ' + r.code);
      bumpShow('failed', '$(error) Bump ✗ ' + nf, 'Code Facts: the check did not pass (' + nf + '). The lines are in the Code Facts output. Fix it, then press again.');
    }
    out.appendLine('§BUMP_BUTTON step=check exit=' + r.code + ' state=' + bumpState);
    return r.lines;
  }
  context.subscriptions.push(vscode.commands.registerCommand('codeFacts.bumpButton', bumpButton));
  const bumpGateRoots = () => { try { return JSON.parse(fs.readFileSync(path.join(findSourceRoot(context), 'scripts', 'bump_parity.json'), 'utf8')).applies_to || ['erp/']; } catch (e) { return ['erp/']; } };
  context.subscriptions.push(vscode.languages.registerCodeActionsProvider({ scheme: 'file' }, {
    provideCodeActions(document, range, ctx) {
      const mine = ((ctx && ctx.diagnostics) || []).filter(d => d.code === BUMP_CODE);
      const at = mine.length ? relIn(document) : null;
      if (!at) return [];
      const act = (title, write, preferred) => {
        const a = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
        a.diagnostics = mine; a.isPreferred = !!preferred;
        a.command = { command: 'codeFacts.bumpThisFile', title, arguments: [at.rel, write] };
        return a;
      };
      return [act('Bump the cache version for this file (scripts/bump.js --write)', true, true), act('Show what the bump would change (dry run)', false, false)];
    }
  }, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }));
  context.subscriptions.push(vscode.commands.registerCommand('codeFacts.shipRunLocal', shipRunLocal));
  context.subscriptions.push(vscode.commands.registerCommand('codeFacts.shipCheck', shipCheck));
  context.subscriptions.push(vscode.commands.registerCommand('codeFacts.shipFetchBack', shipFetchBack));
  // §F.29 (#3105): publish main with this machine's own gh login. Asks first; nothing runs without the Deploy click.
  async function shipDeploy() {
    const sourceRoot = findSourceRoot(context);
    if (!sourceRoot) return say(['Code Facts: bim-ootb root not found']);
    const pick = await vscode.window.showInformationMessage('Code Facts: deploy main to the live site now? (GitHub Pages, with your gh login on this machine)', 'Deploy');
    if (pick !== 'Deploy') return say(['\u00a7SHIP_DEPLOY started=N why=not confirmed']);
    return say(ship.deployMain(sourceRoot).lines);
  }
  context.subscriptions.push(vscode.commands.registerCommand('codeFacts.shipDeploy', shipDeploy));
  const STEPS = [
    ['1 · Run local', 'serve the repo, show each app\'s URL and version on disk', 'codeFacts.shipRunLocal'],
    ['2 · Check', 'syntax, precache audit, cache-version bump', 'codeFacts.shipCheck'],
    ['3 · Cost if deployed', 'start-up and offline-cache bytes vs main', 'codeFacts.costIfDeployed'],
    ['3m · Memory of the three pages', 'JS heap after boot, viewer / ERP / Modeller, vs main (headless, runs only when pressed)', 'codeFacts.heapImpact'],
    ['4 · Fetch back', 'is the live site on main? (uses the network)', 'codeFacts.shipFetchBack'],
    ['5 · Deploy main now', 'publish main to the live site with your gh login (asks first)', 'codeFacts.shipDeploy']
  ];
  context.subscriptions.push(vscode.window.registerTreeDataProvider('codeFactsRunShip', {
    getChildren(el) { return el ? [] : STEPS; },
    getTreeItem(s) {
      const item = new vscode.TreeItem(s[0]);
      item.description = s[1]; item.tooltip = s[1]; item.command = { command: s[2], title: s[0] };
      return item;
    }
  }));

  // For the node witness: when the first fresh copy is ready, and which index file the providers read now.
  return {
    costIfDeployed, heapImpact, heapStatusText, statusText, lenses, shipRunLocal, shipCheck, shipFetchBack, shipDeploy, steps: () => STEPS,
    whenFresh: () => firstRefresh,
    indexFile: () => { const f = getFields(); return f ? f.file : null; },
    refreshRuns: () => (refresher ? refresher.runs() : 0),
    judgeCatalog,
    judgeCorePure
  };
}

function deactivate() {}

module.exports = { activate, deactivate };
