// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// callouts/CalloutGLJournal.js — org.compiere.model.CalloutGLJournal, ported verbatim, all 7 methods
// (org.adempiere.base.callout/src/org/compiere/model/CalloutGLJournal.java). §CP — Witness: W-CP-CALLOUT-ORACLE.
(function (global) {
  'use strict';
  var A = (typeof module !== 'undefined' && module.exports) ? require('../ad_callout.js') : global.AdCallout;
  A.defineCallout('org.compiere.model.CalloutGLJournal', function (CalloutEngine, R) {
    var Env = R.Env, RM = R.RM, M = R.M, Timestamp = R.Timestamp;
    function I(v) { return v == null ? 0 : v; }
    function nz(v) { v = I(v); return v !== 0 ? v : null; }
    function asGet(ctx, id) { return R.PO.get('C_AcctSchema', id); }                       // MAcctSchema.get
    function asStdPrecision(as) { return I(M.MCurrency.get(null, I(as.getC_Currency_ID())).getStdPrecision()); }   // MAcctSchema.getStdPrecision :550-558
    function CalloutGLJournal() { CalloutEngine.call(this); }
    CalloutGLJournal.prototype = Object.create(CalloutEngine.prototype);
    var P = CalloutGLJournal.prototype;

    // period :50-146 — DateDoc→DateAcct; DateAcct/Org→C_Period_ID; C_Period_ID→DateAcct within the period
    P.period = function (ctx, WindowNo, mTab, mField, value) {
      var colName = mField.getColumnName();
      if (value == null) return '';
      var DateAcct = null;
      if (colName === 'DateAcct') DateAcct = value;
      else DateAcct = mTab.getValue('DateAcct');
      var C_Period_ID = 0;
      if (colName === 'C_Period_ID') C_Period_ID = value;
      if (colName === 'DateDoc') {                                  // :67-71 When DateDoc is changed, update DateAcct
        mTab.setValue('DateAcct', value);
      } else if (colName === 'DateAcct' || colName === 'AD_Org_ID') {   // :72-105 When DateAcct/Org is changed, set C_Period_ID
        var sql = 'SELECT C_Period_ID FROM C_Period WHERE C_Year_ID IN ' +
          '	(SELECT C_Year_ID FROM C_Year WHERE C_Calendar_ID=?) AND ? BETWEEN StartDate AND EndDate' +
          " AND IsActive='Y' AND PeriodType='S'";
        var pstmt = R.DB.prepareStatement(sql);
        var AD_Org_ID = mTab.getValue('AD_Org_ID') != null ? mTab.getValue('AD_Org_ID') : 0;
        var C_Calendar_ID = M.MPeriod.getC_Calendar_ID(ctx, AD_Org_ID);
        pstmt.setInt(1, C_Calendar_ID);
        pstmt.setTimestamp(2, DateAcct);
        var rs = pstmt.executeQuery();
        if (rs.next()) C_Period_ID = rs.getInt(1);
        if (C_Period_ID !== 0) mTab.setValue('C_Period_ID', C_Period_ID);
      } else {                                                      // :107-143 When C_Period_ID is changed
        var sql2 = 'SELECT PeriodType, StartDate, EndDate FROM C_Period WHERE C_Period_ID=?';
        var ps2 = R.DB.prepareStatement(sql2); ps2.setInt(1, C_Period_ID);
        var rs2 = ps2.executeQuery();
        if (rs2.next()) {
          var StartDate = rs2.getTimestamp(2), EndDate = rs2.getTimestamp(3);
          if (DateAcct == null || DateAcct.before(StartDate) || DateAcct.after(EndDate))   // out of range - set to last day
            mTab.setValue('DateAcct', EndDate);
        }
      }
      return '';
    };

    // rate :156-190 — CurrencyRate from the acct schema currency
    P.rate = function (ctx, WindowNo, mTab, mField, value) {
      if (value == null) return '';
      var Currency_ID = mTab.getValue('C_Currency_ID');             // :161-170 Source info
      if (Currency_ID == null) return '';
      var C_Currency_ID = Currency_ID;
      var ConversionType_ID = mTab.getValue('C_ConversionType_ID');
      if (ConversionType_ID == null) return '';
      var C_ConversionType_ID = ConversionType_ID;
      var DateAcct = mTab.getValue('DateAcct');
      if (DateAcct == null) DateAcct = new Timestamp(R.now());
      var C_AcctSchema_ID = Env.getContextAsInt(ctx, WindowNo, 'C_AcctSchema_ID');   // :176-181
      var as = asGet(ctx, C_AcctSchema_ID);
      var AD_Client_ID = Env.getContextAsInt(ctx, WindowNo, 'AD_Client_ID');
      var AD_Org_ID = Env.getContextAsInt(ctx, WindowNo, 'AD_Org_ID');
      var CurrencyRate = M.MConversionRate.getRate(C_Currency_ID, I(as.getC_Currency_ID()), DateAcct, C_ConversionType_ID, AD_Client_ID, AD_Org_ID);
      if (CurrencyRate == null) CurrencyRate = Env.ZERO;
      mTab.setValue('CurrencyRate', CurrencyRate);
      return '';
    };

    // amt :200-226 — AmtAcct = AmtSource × CurrencyRate at the schema precision
    P.amt = function (ctx, WindowNo, mTab, mField, value) {
      if (value == null || this.isCalloutActive()) return '';
      var C_AcctSchema_ID = Env.getContextAsInt(ctx, WindowNo, 'C_AcctSchema_ID');
      var as = asGet(ctx, C_AcctSchema_ID);
      var Precision = asStdPrecision(as);
      var CurrencyRate = mTab.getValue('CurrencyRate');
      if (CurrencyRate == null) { CurrencyRate = Env.ONE; mTab.setValue('CurrencyRate', CurrencyRate); }
      var AmtSourceDr = mTab.getValue('AmtSourceDr'); if (AmtSourceDr == null) AmtSourceDr = Env.ZERO;
      var AmtSourceCr = mTab.getValue('AmtSourceCr'); if (AmtSourceCr == null) AmtSourceCr = Env.ZERO;
      var AmtAcctDr = AmtSourceDr.multiply(CurrencyRate).setScale(Precision, RM.HALF_UP);
      mTab.setValue('AmtAcctDr', AmtAcctDr);
      var AmtAcctCr = AmtSourceCr.multiply(CurrencyRate).setScale(Precision, RM.HALF_UP);
      mTab.setValue('AmtAcctCr', AmtAcctCr);
      return '';
    };

    // account :235-259 — any dimension change invalidates the combination (idempiere 344)
    var DIMS = ['Account_ID', 'C_SubAcct_ID', 'M_Product_ID', 'C_BPartner_ID', 'AD_OrgTrx_ID', 'AD_Org_ID', 'C_LocFrom_ID', 'C_LocTo_ID',
      'C_SalesRegion_ID', 'C_Project_ID', 'C_Campaign_ID', 'C_Activity_ID', 'User1_ID', 'User2_ID', 'UserElement1_ID', 'UserElement2_ID'];
    P.account = function (ctx, WindowNo, mTab, mField, value) {
      var colName = mField.getColumnName();
      if (value == null || this.isCalloutActive()) return '';
      if (DIMS.indexOf(colName) >= 0) {
        mTab.setValue('C_ValidCombination_ID', null);
        mTab.setValue('Alias_ValidCombination_ID', null);
      }
      return '';
    };

    // alias :265-303 — the combination fills every dimension
    P.alias = function (ctx, WindowNo, mTab, mField, value) {
      var colName = mField.getColumnName();
      if (value == null || this.isCalloutActive()) return '';
      var Combi_ID = value;
      if (colName === 'Alias_ValidCombination_ID') mTab.setValue('C_ValidCombination_ID', Combi_ID);
      if (colName === 'C_ValidCombination_ID') mTab.setValue('Alias_ValidCombination_ID', Combi_ID);
      if (colName === 'C_ValidCombination_ID' || colName === 'Alias_ValidCombination_ID') {
        var combi = R.PO.get('C_ValidCombination', Combi_ID);       // new MAccount(ctx, Combi_ID, null)
        var g = function (c) { return combi == null ? null : nz(combi.get_Value(c)); };
        mTab.setValue('Account_ID', g('Account_ID'));
        mTab.setValue('C_SubAcct_ID', g('C_SubAcct_ID'));
        mTab.setValue('M_Product_ID', g('M_Product_ID'));
        mTab.setValue('C_BPartner_ID', g('C_BPartner_ID'));
        mTab.setValue('AD_OrgTrx_ID', g('AD_OrgTrx_ID'));
        mTab.setValue('AD_Org_ID', g('AD_Org_ID'));
        mTab.setValue('C_LocFrom_ID', g('C_LocFrom_ID'));
        mTab.setValue('C_LocTo_ID', g('C_LocTo_ID'));
        mTab.setValue('C_SalesRegion_ID', g('C_SalesRegion_ID'));
        mTab.setValue('C_Project_ID', g('C_Project_ID'));
        mTab.setValue('C_Campaign_ID', g('C_Campaign_ID'));
        mTab.setValue('C_Activity_ID', g('C_Activity_ID'));
        mTab.setValue('User1_ID', g('User1_ID'));
        mTab.setValue('User2_ID', g('User2_ID'));
        mTab.setValue('UserElement1_ID', g('UserElement1_ID'));
        mTab.setValue('UserElement2_ID', g('UserElement2_ID'));
      }
      return '';
    };

    // acctSchema :312-322
    P.acctSchema = function (ctx, WindowNo, mTab, mField, value) {
      if (value == null) return '';
      var C_AcctSchema_ID = Env.getContextAsInt(ctx, WindowNo, 'C_AcctSchema_ID');
      var as = asGet(ctx, C_AcctSchema_ID);
      mTab.setValue('C_Currency_ID', I(as.getC_Currency_ID()));
      return '';
    };

    // docType :334-344
    P.docType = function (ctx, WindowNo, mTab, mField, value) {
      if (value == null) return '';
      var C_DocType_ID = Env.getContextAsInt(ctx, WindowNo, 'C_DocType_ID');
      var dt = M.MDocType.get(ctx, C_DocType_ID);
      mTab.setValue('GL_Category_ID', I(dt.getGL_Category_ID()));
      return '';
    };
    return CalloutGLJournal;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
