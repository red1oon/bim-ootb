// Test fixture (NOT a product bundle): LAZY bundle with a PROCESS trigger (classname OrderOpen) used by poc_plugin_grid_triggers_live.js.
export const manifest = { id: 'com.test.lazy-proc', version: '1.0.0', engineVersion: '>=0.9.0', requires: {}, activation: 'lazy', triggers: { processes: ['org.compiere.process.OrderOpen'] }, budget: { kb: 1, note: 'fixture' } };
export async function activate(ctx) {
  globalThis.__lazyProc = (globalThis.__lazyProc || 0) + 1;
  ctx.process.registerHandler('org.compiere.process.OrderOpen', function () { return { ok: true, message: 'lazy-probe' }; }, { name: 'lazy-probe' });
}
export async function deactivate() {}
