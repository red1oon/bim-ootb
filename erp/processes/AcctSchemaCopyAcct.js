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
    function elements(trx, asId) {                                                  // MAcctSchemaElement.getAcctSchemaElements :65-69
      return trx.q('SELECT * FROM C_AcctSchema_Element WHERE C_AcctSchema_ID=? AND IsActive=? ORDER BY SeqNo', [asId, 'Y']);
    }
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
      var S = P.PSTK, self = this, src = this.p_SourceAcctSchema_ID, tgt = this.p_TargetAcctSchema_ID, lt = table.toLowerCase();
      var sRow = trx.q('SELECT * FROM ' + table + ' WHERE C_AcctSchema_ID=?', [src])[0];          // MAcctSchemaGL.get / MAcctSchemaDefault.get
      if (sRow == null) throw new TypeError('Cannot invoke "' + table + '.getAcctInfo()" because source is null');
      var cols = S.cols(trx, table), fields = { c_acctschema_id: tgt };
      // getAcctInfo :128-141 — every column named …Acct, in the table's column order, value = C_ValidCombination_ID (an Integer: null → NullPointerException)
      var acctCols = trx.q("SELECT c.columnname AS c FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)=? AND c.isactive='Y' ORDER BY c.columnname", [lt]).map(function (r) { return r.c; }).filter(function (c) { return /Acct$/.test(c); });
      acctCols.forEach(function (columnName) {
        var id = sRow[columnName.toLowerCase()];
        if (id == null) throw new TypeError('Cannot invoke "java.lang.Integer.intValue()" because the ' + columnName + ' value is null');
        var sourceAccount = trx.q('SELECT * FROM C_ValidCombination WHERE C_ValidCombination_ID=?', [id])[0];       // MAccount.get(ctx, id)
        var targetAccount = self.createAccount(X, trx, targetAS, sourceAccount);
        fields[columnName.toLowerCase()] = targetAccount.c_validcombination_id;
      });
      // new MAcctSchemaGL/Default(ctx,0,trx) + beforeSave (AD_Org_ID := 0, MAcctSchemaGL.java:167-173 / Default :155-160) + save
      fields.ad_org_id = 0;
      if (lt === 'c_acctschema_gl') { fields.usecurrencybalancing = 'N'; fields.usesuspensebalancing = 'N'; fields.usesuspenseerror = 'N'; }   // X_C_AcctSchema_GL(ctx,0) ctor defaults (setUse…(false))
      var row = X.newPO(trx, table, fields);
      ['processed', 'processing', 'posted'].forEach(function (c) { if (!cols[c]) delete row[c]; });     // PO.setStandardDefaults only where the column exists
      var r = X.save(trx, table, null, row);
      if (!r.ok) throw new Error(errMsg);
      // the dictionary key of these tables is the parent C_AcctSchema_ID, which Trx.insert overwrites with a new-row placeholder — restore the real value
      r.row.c_acctschema_id = tgt;
    };
    // createAccount :174-237
    AcctSchemaCopyAcct.prototype.createAccount = function (X, trx, targetAS, sourceAcct) {
      var o = { AD_Org_ID: 0, Account_ID: 0, C_SubAcct_ID: 0, M_Product_ID: 0, C_BPartner_ID: 0, AD_OrgTrx_ID: 0, C_LocFrom_ID: 0, C_LocTo_ID: 0, C_SalesRegion_ID: 0, C_Project_ID: 0, C_Campaign_ID: 0, C_Activity_ID: 0, User1_ID: 0, User2_ID: 0, UserElement1_ID: 0, UserElement2_ID: 0 };
      function v(c) { var x = sourceAcct[c.toLowerCase()]; return x == null ? 0 : Number(x); }
      elements(trx, targetAS.c_acctschema_id).forEach(function (ase) {
        var t = ase.elementtype;
        if (t === 'OO') o.AD_Org_ID = v('AD_Org_ID');
        else if (t === 'AC') o.Account_ID = v('Account_ID');
        else if (t === 'SA') o.C_SubAcct_ID = v('C_SubAcct_ID');
        else if (t === 'BP') o.C_BPartner_ID = v('C_BPartner_ID');
        else if (t === 'PR') o.M_Product_ID = v('M_Product_ID');
        else if (t === 'AY') o.C_Activity_ID = v('C_Activity_ID');
        else if (t === 'LF') o.C_LocFrom_ID = v('C_LocFrom_ID');
        else if (t === 'LT') o.C_LocTo_ID = v('C_LocTo_ID');
        else if (t === 'MC') o.C_Campaign_ID = v('C_Campaign_ID');
        else if (t === 'OT') o.AD_OrgTrx_ID = v('AD_OrgTrx_ID');
        else if (t === 'PJ') o.C_Project_ID = v('C_Project_ID');
        else if (t === 'SR') o.C_SalesRegion_ID = v('C_SalesRegion_ID');
        else if (t === 'U1') o.User1_ID = v('User1_ID');
        else if (t === 'U2') o.User2_ID = v('User2_ID');
        else if (t === 'X1') o.UserElement1_ID = v('UserElement1_ID');
        else if (t === 'X2') o.UserElement2_ID = v('UserElement2_ID');
      });
      return this.getAccount(X, trx, targetAS.ad_client_id, targetAS.c_acctschema_id, o);
    };
    // MAccount.get(ctx, client, org, as, account, …, trxName) :72-235 — find the active combination, else create it
    AcctSchemaCopyAcct.prototype.getAccount = function (X, trx, clientId, asId, o) {
      var S = P.PSTK, optional = ['C_SubAcct_ID', 'M_Product_ID', 'C_BPartner_ID', 'AD_OrgTrx_ID', 'C_LocFrom_ID', 'C_LocTo_ID', 'C_SalesRegion_ID', 'C_Project_ID', 'C_Campaign_ID', 'C_Activity_ID', 'User1_ID', 'User2_ID', 'UserElement1_ID', 'UserElement2_ID'];
      var where = { ad_client_id: clientId, ad_org_id: o.AD_Org_ID, c_acctschema_id: asId, account_id: o.Account_ID, isactive: 'Y' };
      optional.forEach(function (c) { where[c.toLowerCase()] = o[c] === 0 ? null : o[c]; });
      var existing = trx.find('c_validcombination', where, ['c_validcombination_id'])[0];
      if (existing) return existing;
      var f = { ad_client_id: clientId, ad_org_id: o.AD_Org_ID, c_acctschema_id: asId, account_id: o.Account_ID, isfullyqualified: 'N' };     // MAccount(ctx,0) setInitialDefaults :434-436
      optional.forEach(function (c) { if (o[c] !== 0) f[c.toLowerCase()] = o[c]; });
      // beforeSave :846-851 — setValueDescription + validate
      var vd = this.valueDescription(trx, asId, f);
      f.combination = vd.combi; f.description = vd.descr; f.isfullyqualified = vd.fq ? 'Y' : 'N';
      if (f.c_subacct_id) {
        var sa = trx.q('SELECT C_ElementValue_ID AS e FROM C_SubAcct WHERE C_SubAcct_ID=?', [f.c_subacct_id])[0];
        if (!sa || Number(sa.e) !== Number(f.account_id)) { trx.say('§MODEL-PO Could not create new account - C_SubAcct.C_ElementValue_ID<>Account_ID'); return null; }
      }
      var row = X.newPO(trx, 'C_ValidCombination', f), r = X.save(trx, 'C_ValidCombination', null, row);
      if (!r.ok) { trx.say('§MODEL-PO Could not create new account - ' + r.error); return null; }
      return r.row;
    };
    // setValueDescription :623-835
    AcctSchemaCopyAcct.prototype.valueDescription = function (trx, asId, a) {
      var as = trx.q('SELECT Separator AS sep FROM C_AcctSchema WHERE C_AcctSchema_ID=?', [asId])[0], sep = as ? as.sep : '', combi = '', descr = '', fq = true;
      function look(tbl, id, vc, nc) { var r = trx.q('SELECT ' + vc + ' AS v, ' + nc + ' AS n FROM ' + tbl + ' WHERE ' + tbl + '_ID=?', [id])[0]; return r ? [r.v, r.n] : [null, null]; }
      elements(trx, asId).forEach(function (el, i) {
        if (i > 0) { combi += sep; descr += sep; }
        var cs = '_', ds = '_', t = el.elementtype, mand = el.ismandatory === 'Y', x;
        function need(name) { if (mand) { trx.say('§MODEL-PO Mandatory Element missing: ' + name); fq = false; } }
        if (t === 'OO') { if (Number(a.ad_org_id) !== 0) { x = look('AD_Org', a.ad_org_id, 'Value', 'Name'); cs = x[0]; ds = x[1]; } else { cs = '*'; ds = '*'; } }
        else if (t === 'AC') { if (a.account_id) { x = look('C_ElementValue', a.account_id, 'Value', 'Name'); cs = x[0]; ds = x[1]; } else need('Account'); }
        else if (t === 'SA') { if (a.c_subacct_id) { x = look('C_SubAcct', a.c_subacct_id, 'Value', 'Name'); cs = x[0]; ds = x[1]; } }
        else if (t === 'PR') { if (a.m_product_id) { x = look('M_Product', a.m_product_id, 'Value', 'Name'); cs = x[0]; ds = x[1]; } else need('Product'); }
        else if (t === 'BP') { if (a.c_bpartner_id) { x = look('C_BPartner', a.c_bpartner_id, 'Value', 'Name'); cs = x[0]; ds = x[1]; } else need('Business Partner'); }
        else if (t === 'OT') { if (a.ad_orgtrx_id) { x = look('AD_Org', a.ad_orgtrx_id, 'Value', 'Name'); cs = x[0]; ds = x[1]; } else need('Trx Org'); }
        else if (t === 'LF') { if (a.c_locfrom_id) { x = look('C_Location', a.c_locfrom_id, 'Postal', 'City'); cs = x[0]; ds = x[1]; } else need('Location From'); }
        else if (t === 'LT') { if (a.c_locto_id) { x = look('C_Location', a.c_locfrom_id, 'Postal', 'City'); cs = x[0]; ds = x[1]; } else need('Location To'); }   // :763 reads getC_LocFrom_ID() — verbatim
        else if (t === 'SR') { if (a.c_salesregion_id) { x = look('C_SalesRegion', a.c_salesregion_id, 'Value', 'Name'); cs = x[0]; ds = x[1]; } else need('SalesRegion'); }
        else if (t === 'PJ') { if (a.c_project_id) { x = look('C_Project', a.c_project_id, 'Value', 'Name'); cs = x[0]; ds = x[1]; } else need('Project'); }
        else if (t === 'MC') { if (a.c_campaign_id) { x = look('C_Campaign', a.c_campaign_id, 'Value', 'Name'); cs = x[0]; ds = x[1]; } else need('Campaign'); }
        else if (t === 'AY') { if (a.c_activity_id) { x = look('C_Activity', a.c_activity_id, 'Value', 'Name'); cs = x[0]; ds = x[1]; } else need('Campaign'); }
        else if (t === 'U1') { if (a.user1_id) { x = look('C_ElementValue', a.user1_id, 'Value', 'Name'); cs = x[0]; ds = x[1]; } }
        else if (t === 'U2') { if (a.user2_id) { x = look('C_ElementValue', a.user2_id, 'Value', 'Name'); cs = x[0]; ds = x[1]; } }
        combi += cs; descr += ds;
      });
      return { combi: combi, descr: descr, fq: fq };
    };
    return AcctSchemaCopyAcct;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
