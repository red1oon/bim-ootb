const fs=require('fs'),path=require('path'),Module=require('module'); const R=path.join(__dirname,'..');
// canonical stack.js evaluated with float64 arithmetic (Math.fround replaced by identity) to separate "logic differs" from "f32 rounding amplified"
let src=fs.readFileSync(R+'/stack.js','utf8').replace('const F = Math.fround;','const F = (x) => x;').replace(/Float32Array/g,'Float64Array'); const m=new Module(R+'/stack64.js'); m.paths=Module._nodeModulePaths(R); m.filename=R+'/stack64.js'; m._compile(src,R+'/stack64.js'); const S64=m.exports;
const S=require(R+'/stack.js'),O=require(R+'/oracle.js'),CM=require(R+'/icc/color_math.js'),DF=require(R+'/doc/docfold.js');
(async()=>{ const L=await import('lcms-wasm'),lcms=await L.instantiate(),ctx={L,lcms,blobs:new Map()}; const W=128;
 const rng=(seed)=>{let s=seed>>>0;return()=>(s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296},r4=x=>Math.round(x*1e4)/1e4;
 const dabs=(ops,layer,n,rnd)=>{for(let i=0;i<n;i++)ops.push({op:'dab',layer,x:r4(rnd()*W),y:r4(rnd()*W),r:r4(14+rnd()*W*0.22),c:[r4(rnd()),r4(rnd()),r4(rnd())],a:r4(0.25+rnd()*0.7)})};
 const Ly=(id,mode,opacity,space,extra={})=>({op:'layer',id,mode,opacity,mask:false,space,...(extra.parent!==undefined?{parent:extra.parent}:{}),...(extra.clip?{clip:true}:{})});
 const rnd=rng(3),ops=[{op:'doc',v:2,w:W,h:W,working:'p3',gamma:'encoded'},Ly(0,'normal',1,'srgb'),{op:'fill',layer:0,c:[0.55,0.5,0.5],a:1}];dabs(ops,0,40,rnd);
 ops.push({op:'group',id:10,mode:'pass-through',opacity:0.85,mask:false},Ly(1,'hue',0.9,'srgb',{parent:10}));dabs(ops,1,40,rnd);ops.push(Ly(2,'saturation',0.8,'p3',{parent:10}));dabs(ops,2,40,rnd);
 ops.push(Ly(3,'color',0.7,'srgb'));dabs(ops,3,40,rnd);ops.push(Ly(4,'luminosity',0.9,'p3',{clip:true}));dabs(ops,4,40,rnd);ops.push(Ly(5,'color',0.8,'srgb',{clip:true}));dabs(ops,5,30,rnd);
 ops.push({op:'group',id:11,mode:'luminosity',opacity:0.8,mask:false},Ly(6,'normal',1,'srgb',{parent:11}));dabs(ops,6,40,rnd);
 const f=DF.fold(ops,ctx), n=W*W;
 // converted (working-space) premultiplied layers, as the canonical composite sees them
 const cst={W,order:f.st.order.slice(),L:{},G:f.st.G,root:f.st.root,hasTree:true};
 for(const id of f.st.order){const l=f.st.L[id],pix=new Float32Array(n*4);for(let i=0;i<n;i++){const a=l.pix[i*4+3];pix[i*4+3]=a;if(a>0){const w=CM.fromXyz01('p3',CM.toXyz01(f.spaceOf[id],[0,1,2].map(k=>l.pix[i*4+k]/a)));for(let k=0;k<3;k++)pix[i*4+k]=Math.fround(w[k]*a);}}cst.L[id]={...l,pix};}
 const back32=S.compositeTree(cst); const st64={...cst,L:{}}; for(const id of cst.order){const l=cst.L[id];st64.L[id]={...l,pix:Float64Array.from(l.pix)};}
 const back64=S64.compositeTree(st64); let max64=0,big64=0; 
 const {C,A}=O.spec64tree(cst); let big32=0,maxd=0,worst=null; const q=v=>Math.floor(v*255+0.5);
 for(let i=0;i<n;i++){const a32=back32[i*4+3];for(let k=0;k<3;k++){const c32=a32>0?back32[i*4+k]/a32:0,d=Math.abs(q(c32)-q(C[i*3+k]));if(d>maxd){maxd=d;worst={i,k,c32,c64:C[i*3+k],a:a32};}if(d>1)big32++;}}
 console.log('canonical f32 vs float64 oracle on the same working-space layers: max',maxd,'levels; samples >1 level:',big32,'of',n*3,'; worst',JSON.stringify(worst));
 for(let i=0;i<n;i++){const a=back64[i*4+3];for(let k=0;k<3;k++){const c=a>0?back64[i*4+k]/a:0,d=Math.abs(q(c)-q(C[i*3+k]));max64=Math.max(max64,d);if(d>1)big64++;}}
 console.log('SAME canonical code evaluated in float64 vs the independent oracle: max',max64,'levels; samples >1 level:',big64,'=> logic',max64<=1?'AGREES':'DIFFERS');
})();
