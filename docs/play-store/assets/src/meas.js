const {PNG}=require('C:/Users/colin/dev/mp-sdk/node_modules/pngjs');const fs=require('fs');
const [f,xa,ya,xb,yb,thr]=[process.argv[2],...process.argv.slice(3).map(Number)];
const q=PNG.sync.read(fs.readFileSync(f));
let x0=9999,x1=0,y0=9999,y1=0,dk=[255,255,255];
for(let y=ya;y<yb;y++)for(let x=xa;x<xb;x++){const i=(y*q.width+x)*4;const l=q.data[i]+q.data[i+1]+q.data[i+2];if(l<thr*3){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);if(l<dk[0]+dk[1]+dk[2])dk=[q.data[i],q.data[i+1],q.data[i+2]]}}
console.log(f,[xa,ya,xb,yb].join(','),'bbox',x0,x1,y0,y1,'w',x1-x0+1,'h',y1-y0+1,'dark',dk.join(','));
