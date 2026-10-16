// witness_kit/progress.js — §W_PROGRESS. Spec: bim-compiler
// prompts/WITNESS_INTERFACE_FRAMEWORK.md §W_PROGRESS (queue item A-16b).
//
// THE ISSUE IT PROVES OR DISPROVES. A witness whose work happens inside one long
// `await page.evaluate(...)` prints NOTHING until that call returns. Redirected to a file, the run
// holds a **0-byte log** for its whole duration — and a 0-byte log at minute 40 is indistinguishable
// from a 0-byte log because the process died at second 3. On 2026-09-02 that ambiguity was resolved
// the wrong way twice: a completed Hospital run was reported as "never measured" and the absence was
// reported instead of re-checked (AGENT_QUEUE.md A-16, retracted). CLAUDE.md clause 4 says a witness
// that cannot report its own FAILURE is not a witness; this module is the same rule applied to
// LIVENESS — silence must be distinguishable from "still working".
//
// THREE STATES, exactly parallel to PASS / FAIL / INCONCLUSIVE:
//   a STAGE line      — this much definitely finished, and how long it took.
//   a HEARTBEAT line  — still working, and here is the stage it is inside.
//   nothing at all    — the process is gone; the last STAGE line names how far it got.
//
// WHY fs.writeSync AND NOT console.log. Node buffers stdout when it is a pipe. A SIGKILL then
// discards exactly the lines that mattered, which is the defect this file exists to remove. Every
// write here is a synchronous write to fd 1 (and, if OUT is given, to that file too), so a line that
// has been emitted is on disk before the next statement runs.
//
// WHY THE PAGE SIDE NEEDS NO NEW PLUMBING. Every witness in this family already installs
// `p.on('console', ...)` to keep the product's shipped §-log (CLAUDE.md rule 3). In-page progress
// rides that same hook: the page emits a tagged console.log, `attach()` recognises the tag and
// forwards it immediately. Nothing new is opened; what was missing is that nothing emitted, and that
// the node side buffered.
//
// RED CONTROL. `W_PROGRESS=0` disables every write. viewer/tests/witness_progress_flush.js runs the
// same fixture with and without it and asserts the OFF arm really does produce the 0-byte log — a
// progress reporter that could not be turned off would leave "the log is non-empty" unfalsifiable.
'use strict';
const fs = require('fs');

const TAG = '§W_PROGRESS';
// Any console line from the page starting with this prefix is progress, not product output.
const PAGE_PREFIX = TAG + ' ';

/**
 * Progress(name, opts) — an unbuffered, stage-and-heartbeat progress reporter for a long witness.
 *
 * @param {string} name - short witness name, printed on every line so interleaved runs are readable.
 * @param {{ beatMs?: number, out?: string, enabled?: boolean }} [opts]
 *   beatMs  heartbeat interval in ms (default 15000, env W_PROGRESS_BEAT_MS).
 *   out     optional extra file to append every line to, opened in append mode and written
 *           synchronously (for a caller that does not redirect stdout).
 *   enabled default true; forced false by `W_PROGRESS=0`. This is the red control.
 * @returns {{stage:(l:string)=>void, note:(s:string)=>void, attach:(page:object)=>object,
 *            end:(s?:string)=>void, enabled:boolean, tag:string}}
 */
function Progress(name, opts) {
  const o = opts || {};
  const enabled = o.enabled === false ? false : process.env.W_PROGRESS !== '0';
  const beatMs = +(o.beatMs || process.env.W_PROGRESS_BEAT_MS || 15000);
  const t0 = Date.now();
  let cur = null, curAt = t0, beat = null, ended = false;
  let fd = null;
  if (enabled && o.out) { try { fd = fs.openSync(o.out, 'a'); } catch (e) { fd = null; } }

  const secs = (ms) => (ms / 1000).toFixed(1);
  function emit(line) {
    if (!enabled) return;
    const s = line.endsWith('\n') ? line : line + '\n';
    // fd 1 direct: survives a SIGKILL, unlike a buffered console.log on a pipe.
    try { fs.writeSync(1, s); } catch (e) { /* EPIPE — the reader went away, keep going */ }
    if (fd != null) { try { fs.writeSync(fd, s); } catch (e) { /* full disk / closed */ } }
  }

  function armBeat() {
    if (!enabled || beat) return;
    beat = setInterval(() => {
      if (ended || !cur) return;
      emit(`${TAG} ${name} HEARTBEAT stage=${cur} openFor=${secs(Date.now() - curAt)}s ` +
        `total=${secs(Date.now() - t0)}s (still working — this line is what distinguishes a hung run from a dead one)`);
    }, beatMs);
    // NEVER hold the process open: a heartbeat that outlives the work would turn a finished witness
    // into a hang, which is the very failure mode this file is about.
    if (beat.unref) beat.unref();
  }

  const api = {
    enabled,
    tag: TAG,
    /**
     * Close the open stage (printing its duration) and open a new one. The CLOSING line is the
     * evidence a kill leaves behind: it names the last thing that definitely finished.
     * @param {string} label - stage name.
     */
    stage(label) {
      const now = Date.now();
      if (cur) emit(`${TAG} ${name} DONE stage=${cur} took=${secs(now - curAt)}s total=${secs(now - t0)}s`);
      cur = label; curAt = now;
      emit(`${TAG} ${name} ENTER stage=${label} total=${secs(now - t0)}s`);
      armBeat();
    },
    /**
     * A free-form progress note inside the current stage (a count, a detected value). Not a stage
     * boundary — use it for things a reader needs to see before the run can finish.
     * @param {string} s - the note.
     */
    note(s) {
      emit(`${TAG} ${name} NOTE stage=${cur || '-'} total=${secs(Date.now() - t0)}s ${s}`);
    },
    /**
     * Forward the PAGE's own progress lines through the `p.on('console')` hook that every witness in
     * this family already installs. Puppeteer delivers Runtime.consoleAPICalled events while the
     * outer `await page.evaluate()` is still pending, so this is what makes a long in-page run
     * narrate itself. Returns a predicate so the caller can keep progress lines OUT of the product
     * log it scans (an absence test must not count the witness's own lines).
     * @param {object} page - a puppeteer Page.
     * @returns {{isProgress:(text:string)=>boolean}}
     */
    attach(page) {
      if (page && page.on) {
        page.on('console', (m) => {
          let t = '';
          try { t = m.text(); } catch (e) { return; }
          if (t.indexOf(PAGE_PREFIX) === 0) {
            emit(`${TAG} ${name} PAGE ${t.slice(PAGE_PREFIX.length)} total=${secs(Date.now() - t0)}s`);
          }
        });
      }
      return { isProgress: (t) => typeof t === 'string' && t.indexOf(PAGE_PREFIX) === 0 };
    },
    /**
     * Close the last stage and stop the heartbeat. Safe to call twice.
     * @param {string} [summary] - optional trailing text.
     */
    end(summary) {
      if (ended) return;
      const now = Date.now();
      if (cur) emit(`${TAG} ${name} DONE stage=${cur} took=${secs(now - curAt)}s total=${secs(now - t0)}s`);
      emit(`${TAG} ${name} END total=${secs(now - t0)}s${summary ? ' ' + summary : ''}`);
      ended = true; cur = null;
      if (beat) { clearInterval(beat); beat = null; }
      if (fd != null) { try { fs.closeSync(fd); } catch (e) { /* already closed */ } fd = null; }
    },
  };

  // A witness killed by SIGTERM/SIGINT can still say where it was. SIGKILL cannot be caught — which
  // is exactly why every line above is written synchronously rather than relying on this.
  if (enabled) {
    ['SIGTERM', 'SIGINT'].forEach((sig) => {
      process.on(sig, () => {
        emit(`${TAG} ${name} ABORTED signal=${sig} stage=${cur || '-'} ` +
          `openFor=${secs(Date.now() - curAt)}s total=${secs(Date.now() - t0)}s`);
        process.exit(130);
      });
    });
  }

  return api;
}

/**
 * The snippet a page-side `evaluate` calls to narrate itself. Kept here, next to the node-side
 * reader, so the tag can never drift between the two halves.
 * @param {string} label - stage name to report from inside the page.
 * @returns {string} the exact console.log text the node side recognises.
 */
Progress.pageLine = (label) => PAGE_PREFIX + label;
Progress.TAG = TAG;

module.exports = Progress;
module.exports.Progress = Progress;
