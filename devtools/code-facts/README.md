# Code Facts: the terminal command

Code Facts answers questions about this code from the repo's own indexes (where a name is written, what a tag means, how a file reaches users, what a change costs). Read-only, no network. Two forms: a VS Code extension (`devtools/vscode/code-facts/`) and a terminal command (this folder).
*Formerly X0 (a numbering label from DEV_TOOLKIT_NO_AI's X1–X6).*

```
node devtools/code-facts/code-facts.js help                 # the verbs, one row each, with an example
node devtools/code-facts/code-facts.js where camera         # where APP.camera is written
node devtools/code-facts/code-facts.js loaded viewer/scene.js
node devtools/code-facts/code-facts.js tag §BUMP
node devtools/code-facts/code-facts.js session last         # Claude Code token use beside what the session added to what users load
```

The verbs (`where`, `uses`, `tag`, `loaded`, `cost`, `last`, `context`, `check`, `pure`, `bump`, `session`) give the same answers as the extension's hovers and commands: both run the same code
(W-CODEFACTS-CLI checks each verb against the optional facts server). It is read-only except `bump`, which is `scripts/bump.js` itself and writes only with `--write`.

**A shorter way to type it** (optional; the repo adds no alias and puts nothing on your PATH): from inside this folder, `node code-facts.js where camera`; or add `alias code-facts='node devtools/code-facts/code-facts.js'` to your shell.

Plain node, no npm, no network module, named by no page, loader or `sw.js`. Spec: bim-compiler `prompts/CODE_ARCHITECTURE_DESIGN.md` §F.36, §F.37, §F.40.
