# TASK: check the exported PSDs with real third-party apps (terminal session)

Context: `prompts/RESUME_PSD_OPLOG_POC.md` and `poc/psd-oplog/README.md` (sections "PSD export" and "Op-log schema v1 and PSD profile import").
Branch: `claude/photoshop-clone-gaps-m5p5mz`. Run from the worktree (e.g. `~/bim-ootb-psd`), after `git pull`.

Why: the cloud session could only test the exported PSDs with ag-psd, psd-tools and our own importer. This task finds out how real applications
installed on this machine read them. **Photoshop does not run on Linux: do not claim anything about Photoshop.**

Files: `poc/psd-oplog/doc/.emit_export/{adobe_mixed,embedded_custom_working,p3_mixed,p3_pure,srgb_mixed}.psd`
(if missing: `cd poc/psd-oplog && npm i && npm run samples`; for the oracle comparison files also run `npm run export` once, it needs `pip install psd-tools numpy`).

## Steps
1. **Inventory.** Which exist: krita, gimp, magick/convert (ImageMagick), exiftool, python3 + Pillow + psd-tools. Report versions. Never use sudo; a missing tool is
   reported and skipped (a user-level `pip install` of Pillow/psd-tools is fine).
2. **Profile as seen.** For each PSD and each available app, record what it reports for the embedded ICC profile: name, colour space, known vs custom.
   e.g. `magick identify -verbose FILE | grep -i -A3 profile`, `exiftool -icc_profile:all FILE`, GIMP/Krita headless scripting if possible.
3. **Render and compare numerically, not by eye.** Render each PSD to PNG in `/tmp` (never into the repo) with each app that can do it headlessly, once without colour
   conversion and once converted to sRGB via the embedded profile. Then:
   a. `srgb_mixed` vs `p3_mixed` after conversion to sRGB (same layers, different working spaces): max/mean difference per channel in 8-bit levels, and dE2000
      median/p95/max (`poc/psd-oplog/icc/color_math.js` has `dE2000`, `rgbToXyz`, `xyzToLab`).
   b. each app's sRGB render vs `poc/psd-oplog/doc/.emit_export/<name>.oracle_srgb.rgba8` (128x128 straight RGBA8) when present (written by `npm run export`),
      otherwise vs a float64 computation from `color_math.js`.
   c. layers, blend modes, opacity, masks reported by each app that can list them (count, per-layer mode/opacity, mask yes/no).
4. **Anything odd**: an app rejects the file, warns, asks to convert-or-keep the profile, drops masks, flattens, mislabels blend modes: report verbatim with the exact
   command and output. Do not smooth over failures. If a result contradicts the README, say so plainly.
5. **Write** `poc/psd-oplog/app_results/<hostname>-<YYYY-MM-DD>.md`: tools+versions; a table (app x file: profile seen, layers/modes/opacity/mask ok, difference numbers);
   a short "what this does and does not show". Do not commit PSDs, PNGs or any binaries. Do not change code or test gates.
6. **Commit** only that results file; `git push -u origin claude/photoshop-clone-gaps-m5p5mz` (retry on network errors only). No PR.

## Final reply, in exactly this shape
- TOOLS: available / not available
- PROFILE: what each app called the embedded profile, known vs custom
- COLOUR: numbers from 3a and 3b, one line per file
- STRUCTURE: layers / modes / opacity / masks per app, any mismatch
- PROBLEMS: every warning, rejection or surprise, verbatim
- NOT CHECKED: Photoshop, plus anything not possible headlessly, with the exact files a human should open
- Result file path and commit hash

## Then, in the cloud session
Bring the final reply back; the cloud session will fold the findings into the README and continue with groups and clipping masks.
