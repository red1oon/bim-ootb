# NOTICE — third-party assets

MIT covers the code in this repository (see `LICENSE`). This file covers **bundled third-party
assets** — artwork and similar material that ships inside the repo under someone else's terms.

Third-party **libraries** are not listed here: they are credited in `README.md` → *Built with*, and
they are loaded at runtime rather than bundled. This file exists for things that are committed into
the tree and carry an attribution obligation.

---

## Icons

| Asset | Where it is used | Source | Licence | Attribution |
|---|---|---|---|---|
| Compass rose | Alt+C bake panel, "Sun compass" toggle — `viewer/cinema_path_editor.js`, §CPE_TOGGLE_ICONS (inlined SVG, traced from the source download `clipart4585220.png`) | Flaticon | Flaticon Free License — attribution required | ⚠ **PENDING — see below. Do not ship a guessed one.** |

### ⚠ The compass attribution is incomplete, deliberately

Flaticon's Free License requires a credit naming the icon's **author** and linking its **source
page**, in this form:

```html
<a href="[icon page URL]" title="[icon name] icons">[Icon name] icons created by [Author] - Flaticon</a>
```

Neither the author nor the page URL is recoverable from what is in this repo. The only artefact
here is the traced SVG; the source download (`clipart4585220.png`) carries neither, and the
information lives in the downloader's own Flaticon history. **It has been asked for.** Until it
arrives this row stays marked pending rather than carrying a plausible-looking name — a fabricated
attribution is worse than a missing one: it credits the wrong person and it silently converts an
open obligation into one that looks discharged.

To complete it: replace the Attribution cell with the exact string from Flaticon's own "Free
download → attribution" panel for that icon.

### ⚠ A file in the repo may not be where this credit has to appear

Flaticon requires the credit to be visible **in the project that uses the icon**. For a deployed
web application that normally means a credits page, an About box or a footer — not only a file in
the source tree. This repo already has an About box (`ABOUT_BOX_CONSOLIDATE.md` lane) that would be
the natural home.

Recorded here rather than acted on: where user-visible credit belongs is a product decision, not a
build detail. **Nothing in the viewer currently displays this attribution.**

---

## Adding to this file

One row per asset, in the table above. Each row needs: what the asset is, the exact file and symbol
that uses it, where it came from, its licence, and the attribution string **as the source states
it**. If the attribution is not yet known, write `PENDING` and say what is missing — never a
placeholder, never a guess.

Three more Flaticon icons are expected for the same panel (Buildup, Room titles, Storey highlight).
They are not listed yet because they are not in the tree: those three toggles currently render
caption-only, with no artwork. Add each row in the same commit that inlines its SVG, so the credit
and the asset cannot arrive separately.
