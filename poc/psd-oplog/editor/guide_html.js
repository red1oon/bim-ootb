// Minimal markdown -> HTML for editor/README.md (headings, bullet lists, paragraphs, **bold**, *italic*, `code`, [links](url)). Used by build_dist.js to generate guide.html. Spec: witness_log/HYPOTHESES.md Level 1j (G3, G4).
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
function toHtml(md) {
  const out = []; let list = false, para = [];
  const flush = () => { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } };
  const endList = () => { if (list) { out.push('</ul>'); list = false; } };
  for (const line of md.split('\n')) {
    let m;
    if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) { flush(); endList(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); }
    else if ((m = /^- (.*)$/.exec(line))) { flush(); if (!list) { out.push('<ul>'); list = true; } out.push('<li>' + inline(m[1]) + '</li>'); }
    else if (!line.trim()) { flush(); endList(); }
    else if (list && /^\s+\S/.test(line)) out[out.length - 1] = out[out.length - 1].replace(/<\/li>$/, ' ' + inline(line.trim()) + '</li>');
    else { endList(); para.push(line.trim()); }
  }
  flush(); endList(); return out.join('\n');
}
function page(md, appUrl) {
  const body = toHtml(md);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OplogPic user guide</title><style>
:root{--bg:#eef0f3;--panel:#fff;--line:#d5d9e0;--fg:#1b1f24;--mut:#5d6674;--acc:#2563eb;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#14161a;--panel:#1d2026;--line:#2c313a;--fg:#e6e8ec;--mut:#9097a3;--acc:#4c8dff;color-scheme:dark}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:46rem;margin:0 auto;padding:1rem 1rem 3rem}
nav{padding:.75rem 1rem;border-bottom:1px solid var(--line);background:var(--panel)} nav a{color:var(--acc);font-weight:600}
h1{font-size:1.6rem;margin:1.2rem 0 .6rem} h2{font-size:1.2rem;margin:1.8rem 0 .4rem;border-bottom:1px solid var(--line);padding-bottom:.2rem} h3{font-size:1.05rem}
code{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:0 .3em;font-size:.9em;overflow-wrap:anywhere} a{color:var(--acc)} li{margin:.3rem 0} p,li{overflow-wrap:anywhere}
</style></head><body><nav><a href="./">&larr; Back to the editor</a> &middot; <a href="${appUrl}">${appUrl}</a></nav><main>
${body}
</main></body></html>`;
}
module.exports = { toHtml, page };
