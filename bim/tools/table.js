// table.js — THE one tool table (prompts/BIM_UTILITY_KNIFE.md §Key map / §Installers): drives pills, keys, CLI, launcher stubs, manifests.
// Only tools that are BUILT and witnessed are listed. mode: 'background' = headless, result beside input; 'interactive' = opens bim.html with the model.
(function (g) {
  'use strict';
  const T = [
    { key: 'u', id: 'upgrade', name: 'Upgrade to IFC4.3', tier: 'easy', mode: 'background', suffix: 'ifc43', lib: 'BIM_UPGRADE', desc: 'IFC2X3 / IFC4 → IFC4X3_ADD2' },
    { key: 'e', id: 'extract', name: 'Extract items', tier: 'easy', mode: 'interactive', suffix: 'extract', lib: 'BIM_EXTRACT', desc: 'Pick elements, save them as their own IFC' },
    { key: 'k', id: 'split', name: 'Split by storey', tier: 'easy', mode: 'background', suffix: null, lib: 'BIM_SPLIT', desc: 'One IFC per building storey' },
    { key: '6', id: 'health', name: 'Health report', tier: 'easy', mode: 'background', suffix: 'health', lib: 'BIM_HEALTH', desc: 'Counts: schema, spatial chain, psets, materials, duplicate GUIDs' },
  ];
  // Launcher stub text for a tool ('win' => .bat with CRLF, else POSIX sh). Lives here so the page, the CLI and the witness use ONE generator.
  g.BIM_STUB = function (tool, os) {
    const flags = tool.mode === 'interactive' ? '' : '--notify ';
    if (os === 'win') return { name: 'BIM_' + tool.id + '.bat', body: '@echo off\r\ncd /d "%~dp0"\r\n' + (tool.mode === 'interactive' ? 'for %%f in (%*) do (node bim-cli.js open "%%~f")\r\n' : 'node bim-cli.js ' + tool.id + ' ' + flags + '%*\r\n') };
    return { name: 'BIM_' + tool.id + '.sh', body: '#!/bin/sh\ncd "$(dirname "$0")"\n' + (tool.mode === 'interactive' ? 'for f in "$@"; do node bim-cli.js open "$f"; done\n' : 'node bim-cli.js ' + tool.id + ' ' + flags + '"$@"\n') };
  };
  g.BIM_TOOLS = T;
  if (typeof module !== 'undefined') module.exports = T;
})(typeof self !== 'undefined' ? self : globalThis);
