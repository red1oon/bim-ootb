// console-capture.js — Capture §-tagged console output from browser page
// Usage: const logs = new ConsoleLogs(page);
//        await someAction();
//        logs.assertTag('§PW_STREAM_COUNT');

class ConsoleLogs {
  constructor(page) {
    this.entries = [];
    this.errors = [];
    page.on('console', msg => {
      const text = msg.text();
      this.entries.push({ type: msg.type(), text });
    });
    page.on('pageerror', err => {
      this.errors.push(err.message);
    });
  }

  /** Return all log lines containing the given § tag */
  tagged(tag) {
    return this.entries.filter(e => e.text.includes(tag));
  }

  /** Assert at least one log line contains the tag */
  assertTag(tag) {
    const found = this.tagged(tag);
    if (found.length === 0) {
      throw new Error(`§ tag not found in console: ${tag}\nAll logs:\n${this.entries.map(e => e.text).join('\n')}`);
    }
    return found;
  }

  /** Assert zero uncaught page errors */
  assertNoErrors() {
    if (this.errors.length > 0) {
      throw new Error(`Uncaught page errors:\n${this.errors.join('\n')}`);
    }
  }

  /** Return all log lines */
  all() {
    return this.entries.map(e => `[${e.type}] ${e.text}`);
  }

  /** Dump logs for debugging */
  dump() {
    console.log('--- Console Logs ---');
    for (const e of this.entries) console.log(`  [${e.type}] ${e.text}`);
    if (this.errors.length) {
      console.log('--- Page Errors ---');
      for (const e of this.errors) console.log(`  ${e}`);
    }
  }
}

module.exports = { ConsoleLogs };
