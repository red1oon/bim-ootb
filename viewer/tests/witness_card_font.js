#!/usr/bin/env node
/* ⚠ WITNESS — W-CARD-FONT, §129.39 (bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §129.39).
 *
 * THE ISSUE IT PROVES OR DISPROVES:
 *   The load-path freeze info card sized its white plate with one font and drew its text with
 *   another. `_infoCardLayout` sets ctx.font, measures the lines, and hands the context back
 *   through its own ctx.restore(); `_drawInfoCard` then called fillText without ever setting a
 *   font, so every line was painted at the canvas 2D default of 10px sans-serif. MEASURED on the
 *   delivered 1920x1080 film of 2026-09-19: a 913x163 plate — correct for 28px — carrying ~10px
 *   glyphs. It is also why §129.32 appeared to do nothing: it changed the SIZE FORMULA, the plate
 *   grew because the rect derives from it, and the text never moved because the text was never
 *   sized by that number.
 *
 * WHAT MAKES IT A WITNESS AND NOT A SMOKE TEST:
 *   - NO-OP: it records the ctx.font in force AT THE MOMENT of each fillText, not what the layout
 *     computed. A fix that set the font somewhere the draw does not see would still read 10px.
 *   - WRONG: it compares against the layout's OWN fontPx, so a fix that hardcoded some other
 *     "looks better" size fails too.
 *   - VACUOUS: if the card draws no text, or the module does not publish its draw entry point,
 *     it prints INCONCLUSIVE and exits 2 rather than passing quietly.
 *   - CONTROL: run it against the pre-fix file and it must FAIL —
 *       git show <before>:viewer/cpe_load_path.js > /tmp/before.js && node <this> /tmp/before.js
 *     gave 10px on all three lines, against 28px expected.
 *
 * RUN: node viewer/tests/witness_card_font.js [path/to/cpe_load_path.js]
 */
// font and its text drawn at another. Records the ctx.font in force AT EACH fillText and compares
// it against the fontPx the layout measured the plate with. A no-op fix would show them still
// disagreeing; a wrong one would show a font that is not the layout's own number.
const fs=require('fs'), vm=require('vm');
const src=fs.readFileSync(process.argv[2] || '/tmp/wt-loadpath/viewer/cpe_load_path.js','utf8');
const seen=[];
function mkCtx(){
  return { font:'10px sans-serif', fillStyle:'', textAlign:'', textBaseline:'', canvas:{width:1920,height:1080},
    // §129.58 — the card now draws the shared reversed plate, which STROKES its border. A stub
    // missing `stroke` threw inside the draw and turned this witness INCONCLUSIVE (it stopped
    // testing anything rather than failing loudly). Kept minimal: no-ops, same as the rest.
    strokeStyle: '', lineWidth: 1,
    save(){}, restore(){}, beginPath(){}, fill(){}, fillRect(){}, roundRect(){}, stroke(){},
    closePath(){}, moveTo(){}, lineTo(){}, arc(){}, clip(){}, translate(){},
    measureText(t){ const px=parseInt((this.font.match(/(\d+)px/)||[0,10])[1],10); return {width:t.length*px*0.55}; },
    fillText(t,x,y){ seen.push({t:t.slice(0,28), font:this.font}); } };
}
const win={}; win.window=win; win.APP={};
const mk=()=>new Proxy(function(){},{get:(t,k)=>k==='then'?undefined:mk(),set:()=>true,apply:()=>mk(),construct:()=>mk()});
const ctxv=vm.createContext(new Proxy(win,{has:()=>true,get:(t,k)=>(k in t)?t[k]:(k==='window'?win:mk()),set:(t,k,v)=>{t[k]=v;return true;}}));
try{ vm.runInContext(src,ctxv,{filename:'cpe_load_path.js'});}catch(e){ console.log('§CARD_FONT load-threw:',e.message); }
// the module is a function, not an IIFE — call it with a real APP object
if (typeof ctxv.setupCpeLoadPath === 'function') { try { ctxv.setupCpeLoadPath(win.APP); } catch(e){ console.log('§CARD_FONT setup-threw:', e.message); } }
const A=win.APP;
if(!A||!A._loadPathDrawInfoCard){ console.log('§CARD_FONT INCONCLUSIVE — _loadPathDrawInfoCard not published; nothing judged'); process.exit(2); }
const h=1080, expect=Math.max(12, Math.round(h*0.026));
const layout={ assembled:{lines:['LOAD PATH · day 50, structure topped out','Near stack   5 layers','each layer rests on the one below it']},
               rect:{x:30,y:30,w:913,h:163}, fontPx:expect, pad:17, rowH:43 };
try{ A._loadPathDrawInfoCard(mkCtx(),1920,h,1.2,layout); }catch(e){ console.log('§CARD_FONT draw-threw:',e.message); }
if(!seen.length){ console.log('§CARD_FONT INCONCLUSIVE — the card drew no text at all'); process.exit(2); }
let wrong=0;
for(const s of seen){
  const px=parseInt((s.font.match(/(\d+)px/)||[0,0])[1],10);
  const ok = px===expect;
  if(!ok) wrong++;
  console.log(`  §CF ${ok?'ok   ':'WRONG'} "${s.t}" drawn at ${px}px (plate measured at ${expect}px)`);
}
console.log(`§CARD_FONT ${wrong?'FAIL':'PASS'} lines=${seen.length} wrong=${wrong} expect=${expect}px at h=${h}`);
