// Editor-only declarations for jsconfig.json (checkJs). Never loaded by a page.
// Cross-file and host-page globals the erp/ scripts read (most are typeof-guarded); typed `any` so the
// checker stays quiet on them and flags everything else. Add a name here when you add a shared global.

interface Window { [key: string]: any }
// Node globals used by the UMD wrappers and node-run harnesses
declare var require: any, module: any, exports: any, process: any, Buffer: any, __dirname: string, global: any;
// Shared globals (generated from the first checkJs run on erp/, 2026-10-06)
declare var ADCharts: any;
declare var ADData: any;
declare var AdEvaluator: any;
declare var ADGraph: any;
declare var ADParser: any;
declare var ADUI: any;
declare var APP: any;
declare var BarcodeDetector: any;
declare var BigDecimal: any;
declare var curChain: any;
declare var ErpPicker: any;
declare var ERPSearch: any;
declare var helpJive: any;
declare var idx: any;
declare var INIT_BUBBLES: any;
declare var initSqlJs: any;
declare var k: any;
declare var KernelOps: any;
declare var N: any;
declare var navJive: any;
declare var NinjaCreate: any;
declare var OverlayKit: any;
declare var project: any;
declare var px: any;
declare var py: any;
declare var qrcode: any;
declare var radius: any;
declare var showmeJive: any;
declare var WholeHistory: any;
declare var withBundle: any;
