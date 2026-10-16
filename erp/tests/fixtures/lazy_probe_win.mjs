// Test fixture (NOT a product bundle): LAZY bundle with a WINDOW trigger (Sales Order 143) and a callout, used by poc_plugin_grid_triggers_live.js. Counts activations on globalThis.
export const manifest = { id: 'com.test.lazy-win', version: '1.0.0', engineVersion: '>=0.9.0', requires: {}, activation: 'lazy', triggers: { windows: [143] }, budget: { kb: 1, note: 'fixture' } };
export async function activate(ctx) {
  globalThis.__lazyWin = (globalThis.__lazyWin || 0) + 1;
  ctx.callout.registerHandler('lazyWinProbeCallout', function () { return ''; });
}
export async function deactivate() {}
