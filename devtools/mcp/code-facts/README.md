# code-facts — the project's facts, for an AI assistant

*Formerly x0-facts, from X0 (a numbering label from DEV_TOOLKIT_NO_AI's X1–X6). A third, optional way to ask Code Facts (see `devtools/code-facts/README.md`).*

A small local server that speaks MCP (Model Context Protocol), the open way assistants such as Claude Code load a
project's own tools. It answers from the **same code** Code Facts uses in the editor
(`devtools/vscode/code-facts/lib`), so an assistant gets this codebase's facts and does not guess.

- **Read-only.** No tool writes, commits, pushes or deploys.
- **No model, no network.** It calls no AI and opens no connection. It reads this checkout and runs git.
- **No npm.** Plain node. Nothing a page loads is touched.
- **Off by default.** Nothing in the repo starts it. When no assistant starts it, no process runs.

| Tool | Question it answers |
|---|---|
| `where_is_field_set` | Where is this `APP` field assigned? (says PHANTOM, or "not in the index": never a guess) |
| `what_is_tag` | What rule is this `§TAG`, and which code prints it? |
| `how_is_file_loaded` | Is this file loaded at start-up, stored for offline use, or neither? |
| `cost_if_deployed` | What does my working tree add to what users download, against `origin/main`? |
| `last_logged_value` | What did this file last print, in a saved log that is provably current? |
| `where_is_field_used` | Every place a field is written or read, under any spelling |
| `context_for_file` | Everything the indexes say about one file, in one answer: header, how it is loaded, fields set in it, tags it prints and their last provable values |
| `ship_check` | Do the pre-ship checks pass (syntax, precache audit, cache-version bump)? |

## Turn it on (Claude Code, from the bim-ootb folder)

```sh
claude mcp add code-facts --scope local -- node devtools/mcp/code-facts/server.js
```

`--scope local` means: you, this project folder only. Start a new Claude Code session and it is there; `/mcp` inside a
session shows it and lets you switch it for that session.

## Turn it off

```sh
claude mcp remove code-facts --scope local
```

The editor add-on (Code Facts) does not depend on this server and keeps working without it.

Other assistants that speak MCP over stdio can use the same command line: `node devtools/mcp/code-facts/server.js`.
Options: `--root <bim-ootb checkout>` (default: this checkout), `--compiler-root <bim-compiler checkout>` (default:
the sibling folder `../bim-compiler`), whose specs are searched for `§TAG`s.

## Witness

```sh
node devtools/mcp/code-facts/tests/witness_codefacts_mcp.js     # §CODEFACTS_MCP  [--compiler-root <dir>]
```

It starts the real server and speaks the protocol to it. Spec: bim-compiler `prompts/CODE_ARCHITECTURE_DESIGN.md` §F.14.
