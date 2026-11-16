// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — the ONE fixture-side stub of the `vscode` calls extension.js uses (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.25,
// bim-ootb #3091). Shared by witness_x0_activate.js and witness_x0_stamp.js; it was inside witness_x0_activate.js until 2026-11-16.
// install(root) hooks require('vscode') to the stub (workspace folder = root) and returns { reg, vscodeStub }: reg records what activate()
// registered, the output lines and the warnings shown. The stub is not VS Code: it proves wiring, not how VS Code draws anything.
'use strict';
const Module = require('module');

function install(ROOT) {
  const reg = { definition: [], hover: [], commands: [], commandFns: {}, saves: 0, warnings: [], lines: [], infos: [], opened: [], shown: [] };
  const vscodeStub = {
    languages: {
      registerDefinitionProvider(sel, p) { reg.definition.push({ sel, p }); return { dispose() {} }; },
      registerHoverProvider(sel, p) { reg.hover.push({ sel, p }); return { dispose() {} }; },
      createDiagnosticCollection(name) { reg.diags = reg.diags || {}; reg.diag = reg.diags[name] = { name, m: new Map(), set(u, d) { this.m.set(u.fsPath, d); }, delete(u) { this.m.delete(u.fsPath); }, dispose() {} }; return reg.diag; },
      registerCodeActionsProvider(sel, p, meta) { reg.actions = (reg.actions || []).concat([{ sel, p, meta }]); return { dispose() {} }; },
      registerReferenceProvider(sel, p) { reg.refs = (reg.refs || []).concat([{ sel, p }]); return { dispose() {} }; },
      registerCodeLensProvider(sel, p) { reg.lens = (reg.lens || []).concat([{ sel, p }]); return { dispose() {} }; }
    },
    workspace: {
      openTextDocument(x) { reg.opened.push(x); return Promise.resolve({ uri: { fsPath: typeof x === 'string' ? x : '' } }); },
      workspaceFolders: [{ uri: { fsPath: ROOT } }],
      getConfiguration() { return { get() { return ''; } }; },
      onDidSaveTextDocument(fn) { reg.saves++; reg.saveFns = (reg.saveFns || []).concat([fn]); reg.onSave = d => reg.saveFns.forEach(f => f(d)); return { dispose() {} }; }
    },
    commands: { registerCommand(id, fn) { reg.commands.push(id); reg.commandFns[id] = fn; return { dispose() {} }; } },
    window: { showInformationMessage(m) { reg.infos.push(m); return Promise.resolve(undefined); }, showTextDocument(d) { reg.shown.push(d); return Promise.resolve(undefined); }, showWarningMessage(m) { reg.warnings.push(m); return Promise.resolve(undefined); }, activeTextEditor: undefined,
      createOutputChannel() { reg.channels = (reg.channels || 0) + 1; return { appendLine(s) { reg.lines.push(String(s)); }, show() {}, dispose() {} }; },
      createStatusBarItem() { reg.status = { show() { this.shown = true; }, hide() { this.shown = false; }, dispose() {} }; (reg.statusItems = reg.statusItems || []).push(reg.status); return reg.status; },
      onDidChangeActiveTextEditor(fn) { reg.onEditor = fn; return { dispose() {} }; },
      registerTreeDataProvider(id, p) { reg.tree = { id, p }; return { dispose() {} }; } },
    TreeItem: function (label) { this.label = label; },
    tasks: { fetchTasks: async () => [{ name: 'Serve repo (http://localhost:8000)' }], executeTask: async t => { reg.taskRun = t.name; } },
    StatusBarAlignment: { Left: 1, Right: 2 },
    EventEmitter: function () { this.event = function () {}; this.fire = function () {}; this.dispose = function () {}; },
    CodeLens: function (range, command) { this.range = range; this.command = command; },
    Diagnostic: function (range, message, severity) { this.range = range; this.message = message; this.severity = severity; },
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    CodeAction: function (title, kind) { this.title = title; this.kind = kind; },
    CodeActionKind: { QuickFix: 'quickfix' },
    Range: function (a, b, c, d) { this.start = { line: a, character: b }; this.end = { line: c, character: d }; },
    Selection: function (a, b) { this.active = a; },
    Uri: { file(p) { return { fsPath: p, with(o) { return { toString() { return 'file://' + p + '#' + o.fragment; } }; } }; } },
    Location: function (uri, position) { this.uri = uri; this.position = position; },
    Position: function (line, character) { this.line = line; this.character = character; },
    MarkdownString: function (value) { this.value = value; },
    Hover: function (contents) { this.contents = contents; }
  };
  const realLoad = Module._load;
  Module._load = function (request) { return request === 'vscode' ? vscodeStub : realLoad.apply(this, arguments); };
  return { reg, vscodeStub, restore() { Module._load = realLoad; } };
}

module.exports = { install };
