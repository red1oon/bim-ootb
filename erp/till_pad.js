// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — till_pad.js: U4 number-pad grammar of the Unicenta-alike till. READ THE LOG (§TILL_PAD lines of erp/tests/witness_till.js), exit codes are not evidence.
// Implementing bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §15.5 (W4) - Witness: W-TILL-PAD. A TRANSCRIPTION of uniCenta 3.81 JPanelTicket.stateTransition (JPanelTicket.java:886-1291);
//   labels/lines are `pending-5x` (owner: branches ran 5.x, §14A will confirm). Pure: press(state, ch, ctx) -> { state, effect }; the host performs the effect.
//   ctx: { selected: bool (a ticket line is selected), selMultiply, lines: count of ticket lines, canEdit: bool (permission sales.EditLines), type: 'S' }  priceWith00 (till.pricewith00) is OFF only.
// State names are Unicenta's: NUMBER_INPUTZERO..NUMBER_PORDEC (JPanelTicket.java:87-94), NUMBERZERO/NUMBERVALID (:84-85).
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.TillPad = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var ST = { INPUTZERO: 0, INPUTZERODEC: 1, INPUTINT: 2, INPUTDEC: 3, PORZERO: 4, PORZERODEC: 5, PORINT: 6, PORDEC: 7 };
  function zero() { return { st: ST.INPUTZERO, price: '', por: '', barcode: '', inValid: 0, porValid: 0 };  }   // stateToZero :773-782
  function copy(s) { return { st: s.st, price: s.price, por: s.por, barcode: s.barcode, inValid: s.inValid, porValid: s.porValid }; }
  var isD19 = function (c) { return c >= '1' && c <= '9'; }, isD = function (c) { return c >= '0' && c <= '9'; };
  function porValue(s) { var v = parseFloat(String(s.por).slice(1)); return isNaN(v) ? 0 : v; }     // getPorValue :764-770 (a parse failure answers 0)
  function inputValue(s) { var v = parseFloat(s.price); return isNaN(v) ? 0 : v; }                  // getInputValue
  var BEEP = function (why) { return { type: 'beep', why: why }; };

  function press(s0, ch, ctx) {
    ctx = ctx || {}; var s = copy(s0), St = s.st;
    // Enter / '?' = a barcode was typed (:890-1018)
    if (ch === '\n' || ch === '?') {
      if (s.barcode.length > 0) { var code = s.barcode; return { state: zero(), effect: { type: 'barcode', code: code } }; }  // the host resolves the code (incProductByCode :784-799); unknown -> beep + stateToZero
      return { state: s, effect: BEEP('empty-barcode') };
    }
    s.barcode += ch;                                                                  // :1021 m_sBarcode.append(cTrans) for every other key
    if (ch === '\u007f') return { state: zero(), effect: { type: 'clear' } };         // :1024
    if (ch === '0' && St === ST.INPUTZERO) { s.price = '0'; }                                                            // :1026
    else if (isD19(ch) && St === ST.INPUTZERO) { s.price = ch; s.st = ST.INPUTINT; s.inValid = 1; }                     // :1028-1038
    else if (isD(ch) && St === ST.INPUTINT) { s.price += ch; }                                                          // :1039-1045
    else if (ch === '.' && St === ST.INPUTZERO) { s.price = '0.'; s.st = ST.INPUTZERODEC; }                             // :1048-1050
    else if (ch === '.' && St === ST.INPUTINT) { s.price += '.'; s.st = ST.INPUTDEC; }                                  // :1054-1056
    else if (ch === '0' && (St === ST.INPUTZERODEC || St === ST.INPUTDEC)) { s.price += ch; }                          // :1066-1072
    else if (isD19(ch) && (St === ST.INPUTZERODEC || St === ST.INPUTDEC)) { s.price += ch; s.st = ST.INPUTDEC; s.inValid = 1; }   // :1074-1078
    else if (ch === '*' && (St === ST.INPUTINT || St === ST.INPUTDEC)) { s.por = 'x'; s.st = ST.PORZERO; }              // :1080-1082
    else if (ch === '*' && (St === ST.INPUTZERO || St === ST.INPUTZERODEC)) { s.price = '0'; s.por = 'x'; s.st = ST.PORZERO; }   // :1083-1086
    else if (ch === '0' && St === ST.PORZERO) { s.por = 'x0'; }                                                         // :1088
    else if (isD19(ch) && St === ST.PORZERO) { s.por = 'x' + ch; s.st = ST.PORINT; s.porValid = 1; }                   // :1090-1093
    else if (isD(ch) && St === ST.PORINT) { s.por += ch; }                                                              // :1095-1098
    else if (ch === '.' && St === ST.PORZERO) { s.por = 'x0.'; s.st = ST.PORZERODEC; }                                  // :1100-1102
    else if (ch === '.' && St === ST.PORINT) { s.por += '.'; s.st = ST.PORDEC; }                                        // :1108-1110
    else if (ch === '0' && (St === ST.PORZERODEC || St === ST.PORDEC)) { s.por += ch; }                                 // :1115-1117
    else if (isD19(ch) && (St === ST.PORZERODEC || St === ST.PORDEC)) { s.por += ch; s.st = ST.PORDEC; s.porValid = 1; }   // :1118-1122
    else if (ch === '§') { return { state: s, effect: BEEP('no-scale') }; }                                        // :1123-1171 (no scale device on a browser till: Unicenta beeps when existsScale is false)
    else if (ch === '+' && !s.inValid && !s.porValid) {                                                                  // :1174-1189 one unit more on the selected line
      if (!ctx.selected) return { state: s, effect: BEEP('no-selected-line') };
      return { state: zero(), effect: { type: 'incLine', delta: ctx.type === 'R' ? -1 : 1 } };
    } else if (ch === '-' && !s.inValid && !s.porValid && ctx.canEdit !== false) {                                       // :1191-1217 one unit less; a line at <=0 is removed
      if (!ctx.selected) return { state: s, effect: BEEP('no-selected-line') };
      return { state: zero(), effect: { type: 'decLine' } };
    } else if (ch === '+' && !s.inValid && s.porValid) {                                                                 // :1220-1236 set n units on the selected line, price made positive
      if (!ctx.selected) return { state: s, effect: BEEP('no-selected-line') };
      return { state: zero(), effect: { type: 'setLine', qty: porValue(s), absPrice: true } };
    } else if (ch === '-' && !s.inValid && s.porValid && ctx.canEdit !== false) {                                        // :1239-1255 n units, NEGATIVE price (normal ticket only)
      if (!ctx.selected) return { state: s, effect: BEEP('no-selected-line') };
      if (ctx.type === 'R') return { state: zero(), effect: { type: 'noop' } };
      return { state: zero(), effect: { type: 'negateLine', qty: porValue(s) } };
    } else if (ch === '+' && s.inValid && !s.porValid && ctx.canEdit !== false) { return { state: zero(), effect: { type: 'addFree', qty: 1, price: inputValue(s) } }; }       // :1258-1264 one free-price product
    else if (ch === '-' && s.inValid && !s.porValid && ctx.canEdit !== false) { return { state: zero(), effect: { type: 'addFree', qty: 1, price: -inputValue(s) } }; }      // :1266-1270 negative price
    else if (ch === '+' && s.inValid && s.porValid && ctx.canEdit !== false) { return { state: zero(), effect: { type: 'addFree', qty: porValue(s), price: inputValue(s) } }; }  // :1273-1277 n free-price products
    else if (ch === '-' && s.inValid && s.porValid && ctx.canEdit !== false) { return { state: zero(), effect: { type: 'addFree', qty: porValue(s), price: -inputValue(s) } }; } // :1280-1283
    else if (ch === ' ' || ch === '=') {                                                                                 // :1285-1291 Totals: pay
      if ((ctx.lines || 0) > 0) return { state: s, effect: { type: 'pay' } };
      return { state: s, effect: BEEP('no-lines') };
    }
    return { state: s, effect: { type: 'none' } };                                                                       // a key no branch matches changes only the barcode buffer
  }
  // a catalog product button (buttonTransition :871-882): nothing typed -> one unit; a number typed (no '*') -> that many units; otherwise beep (a variable-price product is not in this release)
  function product(s, prod) {
    if (!s.inValid && !s.porValid) return { state: zero(), effect: { type: 'addProduct', qty: 1 } };
    if (s.inValid && !s.porValid) return { state: zero(), effect: { type: 'addProduct', qty: inputValue(s) } };
    return { state: s, effect: BEEP('product-with-factor') };
  }
  return { ST: ST, zero: zero, press: press, product: product, porValue: porValue, inputValue: inputValue };
});
