// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/AcctSchemaCopyAcct.js — org.compiere.process.AcctSchemaCopyAcct, verbatim
// (org.adempiere.base.process/src/org/compiere/process/AcctSchemaCopyAcct.java) + the model code it calls:
// MAccount.get(…) :72-235, MAccount.setValueDescription :623-835 / validate :841-857 (M/MAccount.java),
// MAcctSchemaGL/MAcctSchemaDefault.getAcctInfo + beforeSave. §CP-PROC-CORE — Witness: W-CP-PROC-ORACLE.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.AcctSchemaCopyAcct', function (SvrProcess, X) {
    function AcctSchemaCopyAcct() { SvrProcess.call(this); this.p_SourceAcctSchema_ID = 0; this.p_TargetAcctSchema_ID = 0; }
    AcctSchemaCopyAcct.prototype = Object.create(SvrProcess.prototype);
    AcctSchemaCopyAcct.prototype.prepare = function () {                            // :53-67
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === 'C_AcctSchema_ID') this.p_SourceAcctSchema_ID = para[i].getParameterAsInt();
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA AcctSchemaCopyAcct ' + name);
      }
      this.p_TargetAcctSchema_ID = this.getRecord_ID();
    };
    var MT = (typeof module !== 'undefined' && module.exports) ? require('../model_trade') : global.ModelTrade;   // MAccount / MAcctSchemaElement live in model_trade.js (§CP-OPEN 4b)
    function elements(trx, asId) { return MT.getAcctSchemaElements(trx, asId); }
    AcctSchemaCopyAcct.prototype.doIt = function () {                               // :74-117
      var A = X.A, trx = this.get_TrxName(), self = this, src = this.p_SourceAcctSchema_ID, tgt = this.p_TargetAcctSchema_ID;
      if (src === 0 || tgt === 0) throw new Error('ID=0');
      if (src === tgt) throw A.AdempiereException('Must be different');
      var source = X.get(trx, 'C_AcctSchema', src);
      if (source == null || source.get_ID() === 0) throw new Error('NotFound Source C_AcctSchema_ID=' + src);
      var target = X.get(trx, 'C_AcctSchema', tgt);
      if (target == null || target.get_ID() === 0) throw new Error('NotFound Target C_AcctSchema_ID=' + tgt);
      var targetElements = elements(trx, tgt);
      if (targetElements.length === 0) throw A.AdempiereException('NotFound Target C_AcctSchema_Element');
      var sAC = elements(trx, src).filter(function (e) { return e.elementtype === 'AC'; })[0];
      if (sAC == null) throw A.AdempiereException('NotFound Source AC C_AcctSchema_Element');
      var tAC = targetElements.filter(function (e) { return e.elementtype === 'AC'; })[0];
      if (tAC == null) throw A.AdempiereException('NotFound Target AC C_AcctSchema_Element');
      if (Number(sAC.c_element_id) !== Number(tAC.c_element_id)) throw A.AdempiereException(A.Msg.parseTranslation(this.getCtx(), '@C_Element_ID@ different'));
      if (trx.find('c_acctschema_gl', { c_acctschema_id: tgt }).length === 0) this.copyAccts(X, trx, 'C_AcctSchema_GL', target.row, 'Could not Save GL');          // MAcctSchemaGL.get == null → copyGL
      if (trx.find('c_acctschema_default', { c_acctschema_id: tgt }).length === 0) this.copyAccts(X, trx, 'C_AcctSchema_Default', target.row, 'Could not Save Default'); // → copyDefault
      return '@OK@';
    };
    // copyGL :125-141 / copyDefault :148-166 — one body: the two methods are identical but for the table
    AcctSchemaCopyAcct.prototype.copyAccts = function (X, trx, table, targetAS, errMsg) {
      var self = this, src = this.p_SourceAcctSchema_ID, tgt = this.p_TargetAcctSchema_ID, lt = table.toLowerCase();
      var sRow = trx.q('SELECT * FROM ' + table + ' WHERE C_AcctSchema_ID=?', [src])[0];          // MAcctSchemaGL.get / MAcctSchemaDefault.get
      if (sRow == null) throw new TypeError('Cannot invoke "' + table + '.getAcctInfo()" because source is null');
      var fields = { c_acctschema_id: tgt };
      // getAcctInfo :128-141 — every column named …Acct, in the table's column order, value = C_ValidCombination_ID (an Integer: null → NullPointerException)
      var acctCols = trx.q("SELECT c.columnname AS c FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)=? AND c.isactive='Y' ORDER BY c.columnname", [lt]).map(function (r) { return r.c; }).filter(function (c) { return /Acct$/.test(c); });
      acctCols.forEach(function (columnName) {
        var id = sRow[columnName.toLowerCase()];
        if (id == null) throw new TypeError('Cannot invoke "java.lang.Integer.intValue()" because the ' + columnName + ' value is null');
        var sourceAccount = trx.q('SELECT * FROM C_ValidCombination WHERE C_ValidCombination_ID=?', [id])[0];       // MAccount.get(ctx, id)
        var targetAccount = MT.MAccount_create(trx, targetAS, sourceAccount);
        fields[columnName.toLowerCase()] = targetAccount.c_validcombination_id;
      });
      // new MAcctSchemaGL/Default(ctx,0,trx) + beforeSave (AD_Org_ID := 0, MAcctSchemaGL.java:167-173 / Default :155-160) + save
      fields.ad_org_id = 0;
      if (lt === 'c_acctschema_gl') { fields.usecurrencybalancing = 'N'; fields.usesuspensebalancing = 'N'; fields.usesuspenseerror = 'N'; }   // X_C_AcctSchema_GL(ctx,0) ctor defaults (setUse…(false))
      var row = X.newPO(trx, table, fields);                                                          // PO.setStandardDefaults only where the column exists (ModelLayer.newPO)
      var r = X.save(trx, table, null, row);
      if (!r.ok) throw new Error(errMsg);                                                              // Trx.insert keeps the given parent key C_AcctSchema_ID (§MODEL-INSERT-KEEPKEY)
    };
    return AcctSchemaCopyAcct;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
