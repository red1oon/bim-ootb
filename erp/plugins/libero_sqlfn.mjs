// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only  (ported from org.idempiere.mfg / Libero 2Pack_1.0.0 SQLStatements, pshepetko @ b2adfea0)
// ⚠ DO NOT REMOVE — libero_sqlfn.mjs: the bodies of the stored functions Libero's 2Pack_1.0.0 creates in PL/pgSQL (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §24 slice B2).
//   SQLite has no stored procedures: the pack keeps its CREATE FUNCTION statements unchanged (portable to legacy); this module gives each one its body, written with the
//   same kit as core's callouts/sqlfn.js. The functions belong to the PACK: bound on the DB at Start and at every load while the pack is installed, also when the bundle is stopped.
//   Judge: erp/tests/witness_plugin_sqlfn.js (W-PLUGIN-SQLFN) - Postgres runs the pack's own PL/pgSQL over the twin's rows, value for value.
// Port notes, each read from the PL/pgSQL (not changed):
//   - warehouse NULL -> the locator's warehouse: SUM(M_Warehouse_ID) in OnHand, MAX in Reserved/Ordered; no warehouse -> 0
//   - an unknown product is not an error (SELECT INTO leaves NULLs); conditions follow SQL three-valued logic (NULL is neither true nor false)
//   - not a BOM and (not an Item or not stocked): OnHand 99999, Reserved/Ordered 0; stocked: the plain SUM over M_STORAGE (no rounding)
//   - the BOM loop reads IsBOM / IsStocked / ProductType of the PARENT (M_PRODUCT p joined on b.M_Product_ID), as the PL/pgSQL does; quantity = CASE IsQtyPercentage 'N' -> QtyBOM else QtyBatch/100;
//     per line ROUND(qty / BOMQty, component UOM precision), minimum over lines; Reserved/Ordered return 0 when nothing lowered 99999; the result ROUND(q, product precision) if > 0 else 0
//   - bomQtyAvailableASI = OnHandASI - ReservedASI (NULL if either is NULL)
export function functions(R) {
  const K = R.sqlFnKit, BD = K.BD, D = K.D, q = K.q;
  const T = (v) => v === true, and3 = (a, b) => (a === false || b === false) ? false : (a == null || b == null) ? null : true, or3 = (a, b) => (a === true || b === true) ? true : (a == null || b == null) ? null : false;
  const eq = (a, b) => (a == null || b == null) ? null : String(a) === String(b), ne = (a, b) => { const e = eq(a, b); return e == null ? null : !e; };
  const lt = (a, b) => (a == null || b == null) ? null : a.compareTo(b) < 0;
  const prec = (pid) => { const r = q('libero.asi', 'SELECT COALESCE(MAX(u.StdPrecision), 0) AS p FROM C_UOM u, M_Product p WHERE u.C_UOM_ID=p.C_UOM_ID AND p.M_Product_ID=?', [pid])[0]; return Number(r ? r.p : 0); };
  function asiQty(col, sumOrMax, notStocked, zeroIfUntouched) {
    const self = function (P, A, W, L, depth) {
      if (depth > 64) throw new Error('stack depth limit exceeded (bom' + col + 'ASI recursion)');
      let wh = W;
      if (wh == null) {
        if (L == null) return BD.ZERO;
        const lr = q('libero.asi', 'SELECT ' + sumOrMax + '(M_Warehouse_ID) AS w FROM M_Locator WHERE M_Locator_ID=?', [L])[0]; wh = lr ? lr.w : null;
      }
      if (wh == null) return BD.ZERO;
      const pr = q('libero.asi', 'SELECT IsBOM AS b, ProductType AS t, IsStocked AS s FROM M_Product WHERE M_Product_ID=?', [P])[0] || {};
      const stock = (prod) => { const r = q('libero.asi', 'SELECT COALESCE(SUM(s.' + col + '), 0) AS v FROM M_Storage s WHERE s.M_Product_ID=? AND EXISTS (SELECT * FROM M_Locator l WHERE s.M_Locator_ID=l.M_Locator_ID AND l.M_Warehouse_ID=?)' +
        ' AND (s.M_AttributeSetInstance_ID = ? OR COALESCE(?, 0) = 0)', [prod, wh, A, A])[0]; return D(r ? r.v : 0); };
      let v_Quantity = BD.of(99999);
      if (T(and3(eq(pr.b, 'N'), or3(ne(pr.t, 'I'), eq(pr.s, 'N'))))) return notStocked;
      if (T(eq(pr.s, 'Y'))) return stock(P);
      const lines = q('libero.asi', "SELECT bl.M_Product_ID AS c, bl.IsQtyPercentage AS pct, bl.QtyBOM AS qbom, bl.QtyBatch AS qbatch, p.IsBOM AS isbom, p.IsStocked AS st, p.ProductType AS pt" +
        ' FROM PP_Product_BOM b INNER JOIN M_Product p ON (p.M_Product_ID=b.M_Product_ID) INNER JOIN PP_Product_BOMLine bl ON (bl.PP_Product_BOM_ID=b.PP_Product_BOM_ID) WHERE b.M_Product_ID = ?', [P]);
      lines.forEach((bom) => {
        let pq;
        if (T(and3(eq(bom.pt, 'I'), eq(bom.st, 'Y')))) {
          const raw = T(eq(bom.pct, 'N')) ? bom.qbom : bom.qbatch, bq = raw == null ? null : (T(eq(bom.pct, 'N')) ? D(raw) : K.pdiv(D(raw), BD.of(100))), s = stock(bom.c);   // CASE IsQtyPercentage 'N' -> QtyBOM else QtyBatch / 100 (exact, as PG numeric)
          if (bq != null && bq.signum() === 0) throw new Error('division by zero');
          pq = bq == null ? null : K.round(K.pdiv(s, bq), prec(bom.c));
          if (T(lt(pq, v_Quantity))) v_Quantity = pq;
        } else if (T(eq(bom.isbom, 'Y'))) {
          pq = self(bom.c, A, wh, L, depth + 1);
          if (T(lt(pq, v_Quantity))) v_Quantity = pq;
        }
      });
      if (zeroIfUntouched && v_Quantity.compareTo(BD.of(99999)) === 0) return BD.ZERO;
      if (v_Quantity.signum() > 0) return K.round(v_Quantity, prec(P));
      return BD.ZERO;
    };
    return (P, A, W, L) => self(P, A, W, L, 0);
  }
  const onhand = asiQty('QtyOnHand', 'SUM', BD.of(99999), false), reserved = asiQty('QtyReserved', 'MAX', BD.ZERO, true), ordered = asiQty('QtyOrdered', 'MAX', BD.ZERO, true);
  return {
    bomqtyonhandasi: { arity: [4], fn: onhand },
    bomqtyreservedasi: { arity: [4], fn: reserved },
    bomqtyorderedasi: { arity: [4], fn: ordered },
    bomqtyavailableasi: { arity: [4], fn: (P, A, W, L) => { const a = onhand(P, A, W, L), b = reserved(P, A, W, L); return a == null || b == null ? null : a.subtract(b); } }
  };
}
