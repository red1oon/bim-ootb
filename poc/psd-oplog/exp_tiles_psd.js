const crypto=require('crypto'),zlib=require('zlib');
const {writePsd,readPsd,initializeCanvas}=require('ag-psd');
initializeCanvas(()=>{throw new Error('no canvas')},(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}));
// ---- E. tile store: op-log + content-addressed tiles vs full snapshots
const W=2048,L=8,T=256;
let s=7;const rnd=()=>(s=(s*1664525+1013904223)>>>0)/4294967296;
const layers=[];for(let l=0;l<L;l++){const b=Buffer.alloc(W*W*4);for(let y=0;y<W;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;b[i]=(x*3+l*20)&255;b[i+1]=(y*2+l*9)&255;b[i+2]=((x^y)+l)&255;b[i+3]=255;}layers.push(b);}
const store=new Map();let storeBytes=0;
const tileKey=(buf,tx,ty)=>{const t=Buffer.alloc(T*T*4);for(let r=0;r<T;r++)buf.copy(t,r*T*4,((ty*T+r)*W+tx*T)*4,((ty*T+r)*W+tx*T+T)*4);const h=crypto.createHash('sha256').update(t).digest('hex');if(!store.has(h)){const z=zlib.deflateSync(t,{level:1});store.set(h,z.length);storeBytes+=z.length;}return h;};
const snap=()=>layers.map(b=>{const m=[];for(let ty=0;ty<W/T;ty++)for(let tx=0;tx<W/T;tx++)m.push(tileKey(b,tx,ty));return m;});
const snapshotBytes=()=>layers.reduce((a,b)=>a+zlib.deflateSync(b,{level:1}).length,0);
const v0=snap();const base=storeBytes;const full=snapshotBytes();
let edits=0;const EDITS=50;
for(let e=0;e<EDITS;e++){const b=layers[(rnd()*L)|0];const cx=(rnd()*(W-120))|0,cy=(rnd()*(W-120))|0;for(let y=0;y<100;y++)for(let x=0;x<100;x++){const i=((cy+y)*W+cx+x)*4;b[i]=255-b[i];}snap();}
console.log(JSON.stringify({
 doc:'2048x2048 x 8 layers ('+(W*W*4*L/1048576)+' MiB raw)',
 first_version_tiles_MiB:+(base/1048576).toFixed(2),
 full_snapshot_per_version_MiB:+(full/1048576).toFixed(2),
 after_50_edits_tilestore_MiB:+(storeBytes/1048576).toFixed(2),
 naive_50_full_snapshots_MiB:+(full*(EDITS+1)/1048576).toFixed(0),
 growth_per_edit_KiB:+(((storeBytes-base)/EDITS)/1024).toFixed(0),
 note:'ops themselves are ~100 bytes each; tiles only needed for fast open/checkpoints'
},null,1));
// ---- F. PSD round trip with ag-psd (no canvas needed)
const mkLayer=(name,r,g,b,bm,op)=>{const w=64,h=64,d=new Uint8ClampedArray(w*h*4);for(let i=0;i<w*h;i++){d[i*4]=r;d[i*4+1]=g;d[i*4+2]=b;d[i*4+3]=255;}return {name,left:0,top:0,right:w,bottom:h,blendMode:bm,opacity:op,imageData:{width:w,height:h,data:d}};};
const psd={width:64,height:64,children:[mkLayer('bg',200,200,200,'normal',1),mkLayer('mul',255,128,0,'multiply',.8),mkLayer('soft',0,128,255,'soft light',.5),mkLayer('ovl',90,90,200,'overlay',1)]};
const t0=Date.now();const buf=writePsd(psd,{generateThumbnail:false});const back=readPsd(Buffer.from(buf),{useImageData:true,skipCompositeImageData:true,skipThumbnail:true});
console.log(JSON.stringify({psd_bytes:buf.byteLength,ms:Date.now()-t0,layers_back:back.children.map(c=>[c.name,c.blendMode,c.opacity]),pixel_ok:back.children[1].imageData.data[0]===255&&back.children[1].imageData.data[1]===128},null,1));
