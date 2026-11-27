# common/pdfwriter — the one PDF writer for new pages we draw, and the fonts it embeds

`fonts/`, all SIL Open Font License 1.1: `LiberationSans-{Regular,Bold}.ttf` (Liberation Fonts), `NotoSansThai-{Regular,Bold}.ttf`,
`NotoSansLao-{Regular,Bold}.ttf` (Noto Project). The writer: `pdfkit.standalone.js` 0.15.2 (MIT, `pdfkit.LICENSE`).
Not in `common/lib/`: that folder holds the libraries mirrored into viewer/lib + modeller/lib (W-ONE-LIB-FOLDER); this kit has no mirror.

Used by the NinjaExcel report PDF (`erp/overlay/ninja/ninja_report.js` + `ninja_pdf.js`), fetched only when a PDF is asked for.
One copy for every page that draws a new PDF page (bim-compiler `prompts/SHEET_FRONT_DOOR.md` §19: one writer, no second one).
