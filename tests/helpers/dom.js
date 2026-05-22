// dom.js — DOM query helpers for Playwright assertions
// Usage: const { visible, text, count, zIndex } = require('./dom');

/**
 * Check if element is visible (display != none, visibility != hidden, opacity > 0).
 */
async function visible(page, selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const s = window.getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0;
  }, selector);
}

/**
 * Get text content of element.
 */
async function text(page, selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    return el ? el.textContent.trim() : null;
  }, selector);
}

/**
 * Count child elements matching selector.
 */
async function count(page, selector) {
  return page.evaluate(sel => document.querySelectorAll(sel).length, selector);
}

/**
 * Get computed z-index of element.
 */
async function zIndex(page, selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return null;
    return parseInt(window.getComputedStyle(el).zIndex) || 0;
  }, selector);
}

/**
 * Get bounding rect of element.
 */
async function rect(page, selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right };
  }, selector);
}

/**
 * Get computed CSS property.
 */
async function css(page, selector, prop) {
  return page.evaluate(([sel, p]) => {
    const el = document.querySelector(sel);
    return el ? window.getComputedStyle(el)[p] : null;
  }, [selector, prop]);
}

module.exports = { visible, text, count, zIndex, rect, css };
