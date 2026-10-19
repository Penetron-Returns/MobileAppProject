const {PNG}=require('C:/Users/colin/dev/mp-sdk/node_modules/pngjs');const fs=require('fs');
function patch(inp,out,rects){const q=PNG.sync.read(fs.readFileSync(inp));
for(const [x0,y0,x1,y1,sx] of rects)for(let y=y0;y<y1;y++){const s=(y*q.width+sx)*4;for(let x=x0;x<x1;x++){const i=(y*q.width+x)*4;q.data[i]=q.data[s];q.data[i+1]=q.data[s+1];q.data[i+2]=q.data[s+2];q.data[i+3]=255}}
fs.writeFileSync(out,PNG.sync.write(q));}
patch('raw/booking.png','raw/_b.png',[[70,596,420,648,62],[70,540,412,592,62],[826,1218,1014,1272,818]]);
patch('raw/client.png','raw/_k.png',[[44,282,724,368,36],[90,462,184,518,72],[214,780,498,832,206],[786,1496,940,1552,778],[786,1650,940,1706,778],[786,1810,940,1866,778]]);
// text jobs: [text, weight, fs, anchor(l/r/c), x, baseline, color]
const jobs={
 b:[['Jake Miller',600,45,'l',75,583,'#000'],['+1 555 010 0142',400,41,'l',75,636,'#737378'],['$95.00',400,44.5,'r',1004,1260,'#000']],
 k:[['Jake Miller',700,91.7,'l',48,358,'#000'],['JM',600,58.5,'c',135.5,511,'#737378'],['$235 spent',400,44.8,'l',224,821,'#737378'],['$140',400,44.6,'r',934,1538,'#737378'],['$45',400,44.6,'r',934,1696,'#737378'],['$95',400,44.6,'r',934,1853,'#737378']]};
for(const k of ['b','k'])fs.writeFileSync(`_${k}.html`,`<html><head><style>body{margin:0}canvas{display:block}@font-face{font-family:R4;src:url(roboto400.woff2)}@font-face{font-family:R6;src:url(roboto600.woff2)}@font-face{font-family:R7;src:url(roboto700.woff2)}</style></head><body><canvas id=c width=1080 height=2400></canvas><script>
const J=${JSON.stringify(jobs[k])};const img=new Image();img.src='raw/_${k}.png';
Promise.all([img.decode(),...[4,6,7].map(w=>document.fonts.load('10px R'+w))]).then(()=>{const c=document.getElementById('c').getContext('2d');c.drawImage(img,0,0);
for(const [t,w,fs,a,x,y,col] of J){c.font=(w/100)+'';c.font=w+' '+fs+'px R'+(w/100);c.fillStyle=col;const m=c.measureText(t);let dx=x+m.actualBoundingBoxLeft;if(a=='r')dx=x-m.actualBoundingBoxRight;if(a=='c')dx=x-(m.actualBoundingBoxRight-m.actualBoundingBoxLeft)/2;c.fillText(t,dx,y)}
document.title='done'});</script></body></html>`);
