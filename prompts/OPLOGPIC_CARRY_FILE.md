# ⚠ DO NOT REMOVE
**Scope:** OplogPic (`poc/psd-oplog/editor/`), "carry your work to another device": one portable file (`.oplogpic`), verified on open, handed over through the phone's Share sheet / drag-and-drop / a double-click, plus a QR code for small documents. SPEC ONLY. No code, no test code, until the owner says go and the matching HYPOTHESES.md section (Level 1m, copied from the table below) is written.
**Read the log after every run.** Exit code is not evidence; SKIP and silent failures show only in the log. Honour this block until the prompt is DONE.
Rules (owner, do not re-ask): never loosen a threshold, write amendments down BEFORE the passing run; claims about other editors only from their own pages (this spec makes NONE: the wording is "ours does X", never "first / unique / others lack"); no phone memory number; deploy only on his explicit OK; simple, serverless, mobile-ready; low-key names.

# OplogPic carry file

## What exists today (read from the code, 2026-10-14)
`Save log` writes `{format:'psd-oplog-editor', v:1, W, ops, blobs?}` as plain JSON (`editor.js save()`; photo and caption blobs are base64 inside, `IO.packBlobs`); `Load log` (`accept=".json,.oplog"`) reads it back and refuses a different canvas size `W`. The share link (`#v1=...`, deflate-raw + base64url, `HO.makeLink`) carries the log WITHOUT photo / caption blobs. `Share` already uses `navigator.share({files})` for the picture. The working copy is kept in IndexedDB (`oplogpic`). The page cannot open a PSD (PSD is the way OUT to other apps).

## Decision (from the owner conversation, 2026-10-14)
The PSD is the wrong carrier (undo history, re-editing and live parameters are lost, filters / effects arrive baked, and the page cannot import it). The carrier is our own file. Email: a web page cannot send mail silently or attach via `mailto:`; "email to myself" = the phone's Share sheet attaching the file (two taps, no server of ours). No server, no account, no relay in this spec (an encrypted relay and folder auto-save are listed under LATER).

## C.1 The file `.oplogpic`
- Container: gzip (`CompressionStream('gzip')` / `DecompressionStream`, Node `zlib`) of UTF-8 JSON: `{format:'oplogpic', v:1, W, saved:'<ISO time>', app:'<sw version or "dev">', ops, blobs?:{<sha256>:<base64>}, check:{n:<ops.length>, head:<hash-chain head of ops>, picture:<sha256 of the composite float32 RGBA>}}`. File name `oplogpic-YYYYMMDD-HHMM.oplogpic`. The history travels with the file (undo, amend, replay all still work on the other device).
- `head` = the existing op hash-chain head (`S.chain(ops)`), `picture` = the hash of `S.composite(state)` after the fold on the saving device.
- Loading accepts BOTH the new file and every old `Save log` JSON (detected by the gzip magic 1F 8B vs `{`). An old JSON has no `check`; it opens as today, labelled "old format: not verified".
- On open: gunzip -> validate shape -> fold -> recompute `n`, `head`, `picture` and compare. Equal: the page says "Verified: this is the identical picture" (one line, dismissable). Different: it opens anyway and says exactly what differs ("the log is intact but renders differently on this device (picture hash differs)" / "the file is damaged: log hash differs"). Unknown `v` or an unknown op: refused with "made by a newer version of OplogPic". A gzip CRC error: refused with "the file is damaged or cut short".
- A different canvas size `W`: opened as a NEW document of that size when the browser supports it (the editor already takes `W`); otherwise refused with the size in the message (today's behaviour). Spec decision: refuse with a clear message in v1 (a cross-size open path is not built here).

## C.2 Getting the file in and out
- **Save file** (replaces "Save log" in the menu; the old name stays as a tooltip alias): downloads `.oplogpic`; on a phone, where `navigator.canShare({files})` is true, it offers the Share sheet with the file attached (Mail, Messages, AirDrop / Nearby Share, Drive, Files). If the browser cannot share files it downloads. The menu shows the file size before sharing and warns above 15 MB (a design constant: mail providers limit attachment size; the app does not quote their limits).
- **Open file** (replaces "Load log"): file picker accepting `.oplogpic,.oplog,.json`; also **drag a file onto the page** (desktop) which opens it; a file that is a picture (png / jpg) keeps its current meaning (add photo), decided by extension + gzip magic, never by guessing.
- Installed copy (PWA): the manifest declares `file_handlers` for `.oplogpic` and the page reads `launchQueue` so a double-click opens the file (Chromium desktop; declared and unit-tested here, NOT claimed on any real device).
- Privacy line shown once on the first Save file: "The file contains your whole document, photos included. It goes only where you send it."
- `navigator.storage.persist()` is requested once after the first Save file (a user gesture), and the answer is shown in the menu ("This browser will keep your work" / "may clear it when space is low; Save file is your backup"). REPORTED, never claimed as protection.

## C.3 QR for small documents
A "Show QR" action on the share-link path: when the link (no blobs) fits a QR code, draw it (vendored MIT `qrcode-generator`, about 20 KB, licence file kept beside it) so a phone can hand a simple document to a desktop in front of it; when it does not fit, say so and point to Save file. Pre-registered capacity statement: version-40 QR at error correction L holds 2,953 bytes (ISO 18004), the link is checked against that, not against a guess.

## C.4 Hypotheses (thresholds fixed NOW; HYPOTHESES.md "Level 1m" copies this table before any code)
| ID | Hypothesis | Test | Threshold / prediction |
|---|---|---|---|
| CF1 | the file round-trips the identical picture | build documents (brush strokes, a photo, a caption, layers, a mask, a gradient map, a blur filter, a shape, a shadow); Save file in the page, open it in a FRESH page; also open it in Node (`editor/carry_file.js`, the shared reader / writer) | fresh page: live hashes == the saving page's (hard); Node refold `picture` hash == the page's (hard); `n` and `head` equal (hard); the undo stack works after opening (undo-all / redo-all hashes == refold) |
| CF2 | damage is detected, never silently opened | flip one byte inside the gzip stream; truncate the file; flip one byte in an op value after gunzip and re-gzip; flip one byte in a blob | all four are refused or flagged with the specific message above (hard); none opens as "Verified" |
| CF3 | old logs still open | every old `Save log` JSON the suites make (editor_photo, editor_layers, editor_history, editor_text, editor_xform...) | open == today's `Load log` result bitwise (hard); labelled "old format: not verified" |
| CF4 | versions and unknown ops | `v: 2`; an op named `frobnicate`; `format: 'other'`; missing `ops`; `W` different from the page | each refused with its specific message and the page state unchanged (hard) |
| CF5 | size | the CF1 documents vs today's plain-JSON Save log | the new file is never larger than the old JSON (hard); the caption-only document <= 30 % of the old JSON; a photo-like noise document <= 100 % (REPORTED ratios for all) |
| CF6 | Share / download paths | mock `navigator.share` + `canShare`: capture the call; then remove it | with share: exactly one call with one `File`, name matching `oplogpic-\d{8}-\d{4}.oplogpic`, bytes == the saved file (hard); without: a download of the same bytes (hard); size line shown; > 15 MB shows the warning |
| CF7 | drag and drop / picker | desktop: drop the file on the page; the picker with the file; a PNG dropped | the file opens (hard); the PNG still means add photo (hard); an unknown extension is refused with a message |
| CF8 | phone | 390x844 touch: Save file / Open file >= 44 px, the verified / differs / damaged messages readable and dismissable, no scroll | as stated (hard) |
| CF9 | PWA hooks (static) | the generated `manifest.webmanifest` and the page code | `file_handlers` for `.oplogpic` present and valid JSON; `launchQueue` consumer present (hard); real-device behaviour NOT claimed |
| CF10 | QR | links of 200 / 1,000 / 2,500 / 3,200 bytes | the first three draw a QR that an independent decoder (OpenCV `QRCodeDetector` or `zbar`, whichever the host has) decodes back to the exact link (hard); 3,200 is refused with a message (hard); if no decoder exists on the host the check is reported NOT RUN and the QR is not claimed |
| CF11 | persistence ask | first Save file | `persist()` called once with a user gesture; the answer text shown; REPORTED |
| CF12 | regression | `node witness_all.js`; editor_history (share link, L1-L2), editor_text, editor_photo | all pass; thresholds unchanged; "Save log" / "Load log" behaviour for old JSON unchanged (CF3) |
Honest limits fixed now: this is hand-over, not live sync (two devices editing at once make two files); the file holds the whole document including photos, so it can be large and is only as private as where the user sends it; mail providers limit attachment size (the app warns, it does not know the limit); the 7-day / eviction behaviour of browser storage is outside our control (Save file is the real backup); `file_handlers` is Chromium desktop only, the share sheet depends on the browser's file-sharing support; cross-size open (a different `W`) is not built; no encryption in this version.

## LATER (separate specs only if the owner asks; written so nobody re-litigates)
1. **Auto-save into a folder the user chose** (File System Access API: Chromium desktop; not claimed for iPhone Safari until verified) so a synced drive folder carries the document between devices.
2. **Encrypted relay**: the key stays in the link after `#`, the server stores ciphertext only; needs hosting (the owner has an OCI bucket pattern); off by default.
3. **Android share target** (`share_target` in the manifest: the installed app appears in the share sheet) needs a service-worker POST handler.
4. **Device-to-device (WebRTC) hand-over** with a short code.

## Build order (each step: HYPOTHESES section first, code, suite, verdict, commit)
1. `editor/carry_file.js` (Node + page: gzip, JSON, `check`, verify, messages) + CF1-CF5, CF3, CF4 headless. 2. Page: Save file / Open file / drag-drop / Share path + CF6-CF8, CF11. 3. Manifest handler + `launchQueue` + CF9. 4. QR + CF10. 5. Regression CF12, README / guide ("Moving your work to another device"), RESUME.

# Next-session pointer
Read this file, `editor/editor.js` (`save`, `load`, `hasBlobs`), `editor/history_ops.js` (`makeLink`, `parseLink`, the fingerprint), `editor/img_ops.js` (`packBlobs`, `unpackBlobs`), `editor/build_dist.js` (manifest), `editor/run_redpill.js` (a small runner template), `editor/run_shapes.js` (the oracle + live + phone template).
