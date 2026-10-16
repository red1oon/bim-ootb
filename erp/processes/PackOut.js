// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// processes/PackOut.js — the Pack Out process of window 50003 (AD_Process 50004, Classname org.adempiere.pipo.PackOut -> legacy runs org.adempiere.pipo2.PackOutProcess):
// PackOutProcess.doIt :79-150 for Record_ID = AD_Package_Exp_ID, one engine (pipo_packout.js), reads through the process transaction (the op log over the dictionary, as the user sees it).
// bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §25 — Witness: W-PACKOUT.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  var PO = (typeof module !== 'undefined' && module.exports) ? require('../pipo_packout.js') : global.PipoPackOut;
  P.defineProcess('org.adempiere.pipo.PackOut', function (SvrProcess, X) {
    function PackOutProcess() { SvrProcess.call(this); this.p_PackOut_ID = 0; }
    PackOutProcess.prototype = Object.create(SvrProcess.prototype);
    PackOutProcess.prototype.prepare = function () { this.p_PackOut_ID = this.getRecord_ID(); };   // :65-75
    PackOutProcess.prototype.doIt = function () {
      var R = X.A.RUNTIME;
      if (this.p_PackOut_ID === 0) throw new Error('No Record');                                   // :81-82
      var res = PO.exportById(function (sql, p) { return R.DB.query(sql, p || []); }, this.p_PackOut_ID, { clientId: this.getAD_Client_ID(), say: function (l) { R.log(l); } });
      PO.deliver(res);                                                                             // processUI.download(new File(exportFile))
      return 'Exported=' + res.count + ' File=' + res.name + '.zip';                               // :149
    };
    return PackOutProcess;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
