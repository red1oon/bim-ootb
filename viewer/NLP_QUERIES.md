# Ask-the-Building — typed natural-language queries

The viewer's NLP bar understands **plain typed English** and answers from the loaded
building's database (no server, no LLM, no cost). Voice was dropped on purpose — speech
recognition mangles the IDs and numbers that BIM/ERP queries depend on.

Open the NLP bar, type a question, press Enter. Matching elements light up in 3D when
the answer is a set of elements.

## What you can ask

| Type this | You get |
|---|---|
| `show me all the doors` · `doors` · `how many windows` | count + the elements highlighted in 3D |
| `total cost` | building cost (from `qto_cache` — extracted, not guessed) |
| `how much do the doors cost` · `cost of structural` | scoped cost |
| `total area of walls` · `pipe length` | **real** m² / m from extracted quantities |
| `doors and windows` | both, combined |
| `doors on level 2` · `ground floor walls` | scoped to a storey |
| `doors not on level 1` | negation |
| `doors between level 2 and 4` | a range of storeys |
| `which floor has the most doors` · `most common element` | ranked answer |
| `what disciplines are there` · `how many storeys` | a breakdown |

Phrasing is forgiving — filler words, order, case, and punctuation don't matter
(`SHOW me ALL the doors!!!` works the same as `doors`).

### Mobile-safe 3D behaviour
- **Large result (>2000 elements)** → shows the **count only**, no 3D highlight. Lighting up
  tens of thousands of meshes is the one heavy op; skipping it keeps cheap phones smooth.
- **Normal result (≤2000)** → highlights the matched elements in 3D.
- **Single element (a "leaf")** → highlights **and zooms the camera in** to frame it
  (reuses `A.zoomToGuid`).

### Storey names work in any language
`level 3` resolves against the building's **actual** storey labels, so it finds
`Level 3`, Malay `Aras 03`, Swedish `VÅNING 3`, or worded `Third Floor` — automatically.

## How it works (for developers)

- **`decoder.js`** — pure, dependency-free. `BimDecoder.decode(text, {storeys})` turns
  text into a query plan; `BimDecoder.formatResult(plan, exec, {cur,cur2,rate})` runs it
  and returns `{summary, guids, table}`. Full API + examples are in the file header.
- **`nlp.js`** wires it in: `executeQuery()` tries the decoder first and falls back to the
  legacy regex patterns only if the decoder returns `kind:'none'`. It feeds the building's
  distinct storey strings via `_nlpStoreys()` and highlights `f.guids` in 3D.
- Load order (`viewer.html`): `decoder.js` **before** `nlp.js`.

### Extending it
- New element word → add to `SYNONYMS` / `PLURALS` in `decoder.js`.
- New discipline → add to `DISC_MAP`.
- Costs and dimensions always come from `qto_cache` (extracted) — never hardcode a rate.

### Proven
`sandbox_nlp/` in the bim-compiler repo holds the witnesses: 38/38 intent cases on
Hospital, 92/92 across 7 buildings (EN/Malay/Swedish storey naming), and browser/Node
parity on `formatResult`. Re-run with `node sandbox_nlp/stress.js` / `cross.js` /
`format_test.js`.
