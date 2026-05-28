/**
 * BIM OOTB — Frictionless BIM. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * error_reporter.js — §S274 Global error catcher with user-facing bug report prompt.
 * Separate module — no impact on existing code. Triggered ONLY on uncaught errors.
 * Uses the existing A.reportBug() flow (helpers.js) for GitHub/Email submission.
 *
 * Load AFTER helpers.js (needs A._doReportBug).
 */
function setupErrorReporter(A) {
  if (!A) return;

  var _toastTimer = null;
  var _lastError = '';       // dedup — don't show same error twice
  var _errorCount = 0;       // rate limit — max 3 toasts per session
  var MAX_TOASTS = 3;

  // ── Toast UI — non-intrusive bottom banner ──
  function _showToast(errMsg) {
    if (_errorCount >= MAX_TOASTS) return;  // don't spam
    if (errMsg === _lastError) return;      // dedup
    _lastError = errMsg;
    _errorCount++;

    // Remove previous toast if any
    var old = document.getElementById('_err_toast');
    if (old) old.remove();
    if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }

    var toast = document.createElement('div');
    toast.id = '_err_toast';
    toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);' +
      'z-index:9999;background:rgba(30,10,10,0.95);border:1px solid #cc4444;' +
      'border-radius:10px;padding:12px 20px;font-family:"Segoe UI",sans-serif;' +
      'color:#e0e0e0;font-size:13px;max-width:500px;width:90%;' +
      'box-shadow:0 4px 20px rgba(0,0,0,0.5);backdrop-filter:blur(6px);' +
      'display:flex;align-items:center;gap:12px;animation:_errSlideUp 0.3s ease-out';

    // Truncate long error messages for display
    var shortErr = errMsg.length > 120 ? errMsg.substring(0, 120) + '...' : errMsg;

    toast.innerHTML =
      '<div style="flex:1">' +
        '<div style="color:#ff6b6b;font-weight:700;font-size:12px;margin-bottom:4px">Something went wrong</div>' +
        '<div style="color:#aaa;font-size:11px;line-height:1.4;word-break:break-word">' + _escHtml(shortErr) + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-shrink:0">' +
        '<button id="_err_report" style="padding:6px 14px;background:#ff8a65;color:#000;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap">Report</button>' +
        '<button id="_err_dismiss" style="padding:6px 10px;background:transparent;color:#666;border:1px solid #444;border-radius:6px;font-size:11px;cursor:pointer">\u2715</button>' +
      '</div>';

    // Inject animation keyframe if not already present
    if (!document.getElementById('_errAnimStyle')) {
      var style = document.createElement('style');
      style.id = '_errAnimStyle';
      style.textContent = '@keyframes _errSlideUp{from{transform:translateX(-50%) translateY(30px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}';
      document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    document.getElementById('_err_dismiss').onclick = function() { toast.remove(); };
    document.getElementById('_err_report').onclick = function() {
      toast.remove();
      // Pre-fill the error message into reportBug
      if (A.reportBug) {
        A.reportBug();
      } else if (A._doReportBug) {
        A._doReportBug('github', 'Auto-caught error: ' + errMsg);
      }
    };

    // Auto-dismiss after 15s
    _toastTimer = setTimeout(function() { if (toast.parentNode) toast.remove(); }, 15000);
  }

  function _escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Global error hooks ──

  // Uncaught errors (sync throws)
  window.addEventListener('error', function(e) {
    // Ignore benign: ResizeObserver, CORS img, extension noise
    var msg = (e.message || '') + '';
    if (msg.indexOf('ResizeObserver') >= 0) return;
    if (msg.indexOf('Script error') >= 0) return;  // cross-origin, no useful info
    if (msg.indexOf('WEBGL_multi_draw') >= 0) return;
    console.error('[S274] §ERR_GLOBAL ' + msg + ' at ' + (e.filename || '') + ':' + (e.lineno || ''));
    _showToast(msg);
  });

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', function(e) {
    var msg = '';
    if (e.reason) {
      msg = e.reason.message || e.reason + '';
    }
    // Ignore benign: AbortError (fetch cancelled), navigation
    if (msg.indexOf('AbortError') >= 0) return;
    if (msg.indexOf('navigation') >= 0) return;
    if (msg.indexOf('Fullscreen request denied') >= 0) return;
    console.error('[S274] §ERR_PROMISE ' + msg);
    _showToast(msg);
  });

  // ── Public API for code-level caught errors ──
  // Call A.reportError(err) from any catch block to show the toast.
  A.reportError = function(err) {
    var msg = (err && err.message) ? err.message : (err + '');
    console.error('[S274] §ERR_REPORTED ' + msg);
    _showToast(msg);
  };

  console.log('[S274] §ERROR_REPORTER_READY max=' + MAX_TOASTS + ' toasts/session');
}
