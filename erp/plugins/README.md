# erp/plugins/ — Fold-Engine bundles

A `.mjs` file in this folder (or any raw URL reachable from the browser) is a **Fold-Engine plugin
bundle** — the same contract whether it was installed by hand (paste a URL into the Plugin Engine
pill, `plugin_overlay.js`) or automatically proposed from an `ad_modelvalidator` AD row
(`ad_modelval_bridge.js`, `PLUGIN_SYSTEM_LANE.md` §Phase E). One ES module, three exports:

```javascript
export const manifest = {
  id: 'com.example.my-validator',   // unique — the plugin_registry.js lifecycle key
  version: '1.0.0',
  engineVersion: '>=0.9.0',
  requires: {}
};

export async function activate(ctx) {
  // ctx.modelval   -> ad_modelval.js   (registerValidator)
  // ctx.callout    -> ad_callout.js    (registerHandler)
  // ctx.process    -> ad_process.js    (registerHandler w/ meta.kind)
  // ctx.postTokens -> post_resolver.js token map (plain object)
  // ctx.db.query(sql, params) -> rows[]   (read-only)
  // ctx.ops.append(opType, params) -> opId
}

export async function deactivate(ctx) { /* undo what activate() did */ }
```

See `production_validator.mjs` in this folder for a working example (a BEFORE_SAVE `M_Production`
guard, registered via `ctx.modelval.registerValidator`).

## The AD-native install path (§Phase E)

`ad_modelvalidator`'s `ModelValidationClass` column — the same column iDempiere uses for a Java FQCN
— is reused here for a bundle URL/module path (e.g. `plugins/my-validator.mjs`, resolved relative to
`idempiere.html`, or a full `https://` URL). Adding a row there is the AD-native equivalent of pasting
a URL into the Plugin Engine pill. Two things are different from a hand-pasted install, both
deliberate:

- **Install only, never auto-start.** An AD row *proposes* a bundle; it does not self-approve. The
  bridge calls `installBundle()` and stops — the candidate then shows up in **Plugins & Releases**
  (`plugin_release.js`) in its installed-but-inactive state, same as anything a human pasted in. An
  admin still has to click **Enable** before `activate()` ever runs. This preserves the existing
  "foreign imperative code is a plugin, signed + reversible" posture instead of adding a second,
  weaker path around it.
- **No EntityType gating.** iDempiere's own three shipped `ad_modelvalidator` rows (Libero
  Manufacturing, Fixed Assets, Product Price) are `EntityType` `D`/`EE01` — real Dictionary/vendor
  rows, not `U` (user/custom) — so EntityType cannot tell "safe to auto-install" apart from "a vendor
  Java class that was never ported to JS." The bridge gates purely on whether `ModelValidationClass`
  resolves to an importable module. Those 3 rows never will, and correctly never install — no
  special-casing needed, and no infinite retry: a failed row logs once (`§MODELVAL_AUTOINSTALL
  state=UNRESOLVED`) per session and is skipped.

## The one rule every bundle here must follow — the A-4 seam

**A model-validator bundle GATES a save/complete; it must never derive a posting or write GL state.**
(`docs/internal/ERP_BACKEND_SEPARATION.md` §A-4, verbatim: *"MUST NOT know about: the GL derivation
table (it gates the action; it does not post). It may BLOCK a completion, but the posting fold (A-1)
is downstream and ignorant of why."*) A hook may return an error string to abort the operation
(`fireHooks`'s iDempiere-faithful semantics); it may never call into `doc_poster.js`/`erp_postings.js`
or otherwise decide what gets posted. Nothing in this engine enforces that boundary with a type
system — it is a documented discipline, and this is the one place a bundle author has to learn it.
