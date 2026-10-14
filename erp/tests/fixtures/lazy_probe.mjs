// SPDX-License-Identifier: GPL-2.0-only
// Test fixture (NOT a product bundle): a LAZY plugin bundle used by tests/poc_plugin_lazy_live.js. Trigger table = PP_Order; on activation it registers a DocAction class for pp_order (which the base product does not have)
// and counts its activations on globalThis so a browser test can prove WHEN it was activated.
export const manifest = { id: 'com.test.lazy-probe', version: '1.0.0', engineVersion: '>=0.9.0', requires: {}, activation: 'lazy', triggers: { tables: ['PP_Order'] }, budget: { kb: 1, note: 'fixture' } };
export async function activate(ctx) {
  globalThis.__lazyProbe = (globalThis.__lazyProbe || 0) + 1;
  ctx.docAction.registerDocAction('pp_order', {
    prepareIt: function () { return 'IP'; }, completeIt: function () { return 'CO'; }, approveIt: function () { return true; }, voidIt: function () { return true; }, closeIt: function () { return true; },
    getSummary: function () { return 'lazy-probe DocAction'; } });
}
export async function deactivate() {}
