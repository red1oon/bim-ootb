# common/fonts — fonts embedded in the PDFs we draw

All SIL Open Font License 1.1: `LiberationSans-{Regular,Bold}.ttf` (Liberation Fonts), `NotoSansThai-{Regular,Bold}.ttf`,
`NotoSansLao-{Regular,Bold}.ttf` (Noto Project). The PDF writer is `common/lib/pdfkit.standalone.js` 0.15.2 (MIT, `pdfkit.LICENSE`).

Used by the NinjaExcel report PDF (`erp/overlay/ninja/ninja_report.js` + `ninja_pdf.js`), fetched only when a PDF is asked for.
One copy for every page that draws a new PDF page (bim-compiler `prompts/SHEET_FRONT_DOOR.md` §19: one writer, no second one).
