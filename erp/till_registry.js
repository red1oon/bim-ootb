// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — till_registry.js: the screen registry = the W-TILL-UNICENTA-PARITY table of prompts/POS_PLUGIN_LOCAL_FIRST.md §14.y, as DATA (owner 2026-11-03: branches ran uniCenta 5.x, §14A will change labels/N;
//   a change is an edit of this list, not of a screen). READ THE LOG (§TILL_PARITY). Each row: w (parity #), u (§14.1 id), label, src (3.81 file:line), ver ('pending-5x' = taken from 3.81 until §14A),
//   status ('built' | 'not-in-release'), screen (Till.go name), and the assertions the witness evaluates against the LIVE DOM: sels (must exist), order {container, texts[]}, count {sel, n}.
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.TillRegistry = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var MENU = ['Sales', 'Edit Sales', 'Customer Payment', 'Payments', 'Close Cash'];   // uniCenta 5.0 Menu.Root.txt:2-6 via pos_messages.properties:786,787,686,734,661 (same as 3.81 Menu.Root.txt:28-32)
  var TABS = ['Cash', 'Cheque', 'Voucher', 'Card', 'Free', 'Debt', 'Bank', 'Slip'];      // 5.0 JPaymentSelectReceipt.java:67-75
  var NIR = 'not-in-release';
  var ROWS = [
    { w: 1, u: 'U1', label: 'Login by user button / card', src: '5.0 JRootApp.java:900-919', ver: '5.0', status: 'built', screen: 'login', sels: ['#u1 .u-user'] },
    { w: 2, u: 'U2', label: 'Register menu', src: '5.0 Menu.Root.txt:2-6', ver: '5.0', status: 'built', screen: 'menu', sels: ['#u2 [data-panel]'], order: { container: '#u2', item: '[data-panel]', texts: MENU } },
    { w: 3, u: 'U3', label: 'Sales screen layout (6 regions, named buttons)', src: '5.0 JPanelTicket.java:3377-3421', ver: '5.0', status: 'built', screen: 'sales',
      sels: ['#u3 #north', '#u3 #rightcol', '#u3 #lines', '#u3 #totals', '#u3 #east', '#u3 #south', '#b-remove:not([disabled])'],
      order: { container: '#north #m_jButtons', item: '[data-btn]', texts: ['Scale', 'Mooring', 'Split Sale', 'Reprint Last Ticket', 'Send Order', 'Customer'] },
      order2: { container: '#rightcol', item: ':scope > [data-btn]', texts: ['Delete line', 'Search product', 'Edit line', 'Choose attributes', 'Check Stock'] },
      order3: { container: '#totals', item: '[data-total]', texts: ['Subtotal', 'Taxes', 'Total'] } },
    { w: 4, u: 'U4', label: 'Number-pad grammar', src: '3.81 JPanelTicket.java:1027-1291 (5.0 not re-read, §14A.1; witness re-derives)', ver: 'pending-5x-reverify', status: 'built', screen: 'sales', sels: ['#east .key[data-key="="]', '#east .key[data-key="*"]', '#east .key[data-key="+"]', '#east .key[data-key="-"]'], padWitness: true },
    { w: 5, u: 'U5', label: 'Catalog: categories, sub-categories, 107x60 tiles', src: '5.0 Ticket.Buttons.xml:77,89-90', ver: '5.0', status: 'built', screen: 'sales', sels: ['#south #cats', '#south #products .prod'], tile: { w: 107, h: 60 } },
    { w: 6, u: 'U6', label: 'Ticket button bar (total / line discount, print preview, drawer, virtual keyboard)', src: '5.0 Ticket.Buttons.xml:39-54', ver: '5.0', status: NIR, screen: 'sales', sels: ['#u3 #scriptbar [data-btn="Total discount"]'] },
    { w: 7, u: 'U7', label: 'Shared tickets: New, Layaways, Delete, Reprint, Quick LogOff', src: '5.0 JTicketsBagShared.java:255-331', ver: '5.0', status: NIR, screen: 'sales', sels: ['#bag [data-btn]:not([disabled])'] },
    { w: 8, u: 'U8', label: 'Payment dialog: 8 tenders, part payments, change', src: '5.0 JPaymentSelectReceipt.java:67-75', ver: '5.0', status: 'built', screen: 'pay',
      sels: ['#u8 #addpart', '#u8 #delpart', '#u8 #printtoggle', '#u8 #change', '#u8 #remaining', '#u8 #paytotal'], order: { container: '#u8 #tabs', item: '[data-tab]', texts: TABS }, liveTabs: 4 },
    { w: 9, u: 'U9', label: 'Receipt and change pop-up', src: '5.0 Printer.Ticket.xml:56,63; Ticket.Close.xml:44', ver: '5.0', status: 'built', screen: 'receipt', sels: ['#u9 .rf'], receiptOrder: ['Receipt', 'Date', 'Terminal', 'Served by', 'Item', 'line', 'Items count', 'Total'] },
    { w: 10, u: 'U10', label: 'Edit Sales', src: '5.0 JPanelTicketEdits (not re-read)', ver: '5.0', status: NIR, screen: 'editsales', sels: ['#editsales'] },
    { w: 11, u: 'U11', label: 'Refund', src: '5.0 JRefundLines.form', ver: '5.0', status: NIR, screen: 'refund', sels: ['#refund'] },
    { w: 12, u: 'U12', label: 'Customer Payment', src: '5.0 CustomersPayment', ver: '5.0', status: NIR, screen: 'custpay', sels: ['#custpay'] },
    { w: 13, u: 'U13', label: 'Payments cash in / out', src: '5.0 JPanelPayments (not re-read)', ver: '5.0', status: NIR, screen: 'payments', sels: ['#payments'] },
    { w: 14, u: 'U14', label: 'Close Cash (Z), print, reprint a past Z', src: '5.0 JPanelCloseMoney.java:445-627 + JPanelCloseMoneyReprint', ver: '5.0', status: 'built', screen: 'close',
      sels: ['#u14 [data-z="tickets"]', '#u14 [data-z="units"]', '#u14 [data-z="gross"]', '#u14 [data-z="payments"]', '#u14 [data-z="bytender"]', '#u14 [data-z="net"]', '#u14 [data-z="taxes"]', '#u14 [data-z="removed"]', '#u14 #zprint', '#u14 #zclose', '#u14 #zreprint'] },
    { w: 15, u: 'U15', label: 'Send Order -> kitchen queue', src: '5.0 JPanelTicket.java:3462-3490', ver: '5.0', status: NIR, screen: 'sales', sels: ['#north [data-btn="Send Order"]:not([disabled])'] },
    { w: 16, u: 'U16', label: 'Restaurant map', src: '5.0 JTicketsBagRestaurantMap', ver: '5.0', status: NIR, screen: 'floors', sels: ['#floors'] },
    { w: 17, u: 'U17', label: 'Reservations', src: '5.0 JTicketsBagRestaurantRes', ver: '5.0', status: NIR, screen: 'reservations', sels: ['#reservations'] },
    { w: 18, u: 'N18', label: 'Reprint Last Ticket button', src: '5.0 JPanelTicket.java:3377 btnReprint1', ver: '5.0', status: NIR, screen: 'sales', sels: ['#north [data-btn="Reprint Last Ticket"]:not([disabled])'] },
    { w: 19, u: 'N19', label: 'Voucher issue and redeem as tender', src: '5.0 vouchers SQ:515, tab.voucher', ver: '5.0', status: NIR, screen: 'pay', sels: ['#tabs [data-tab="paperin"]:not([disabled])'] },
    { w: 20, u: 'N20', label: 'Kitchen screen (P2)', src: '§14A.P rec. 2-4', ver: '5.0', status: NIR, screen: 'kitchen', sels: ['#kitchen'] },
    { w: 21, u: 'N21', label: 'Check In / Check Out', src: '5.0 Menu.Root.txt:143', ver: '5.0', status: NIR, screen: 'presence', sels: ['#presence'] },
    { w: 22, u: 'N22', label: 'Pick-up number reset', src: '5.0 JPanelResetPickupId.java', ver: '5.0', status: NIR, screen: 'pickup', sels: ['#pickup'] }
  ];
  return { MENU: MENU, ROWS: ROWS, N: ROWS.length };
});
