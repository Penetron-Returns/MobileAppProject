const {PNG}=require('C:/Users/colin/dev/mp-sdk/node_modules/pngjs');const fs=require('fs');
const a=process.argv[2],o=process.argv[3],flat=process.argv[4]==='flat';
const p=PNG.sync.read(fs.readFileSync(a));
console.log(p.width,p.height);
if(flat){const d=p.data;for(let i=0;i<d.length;i+=4){const al=d[i+3]/255;for(let k=0;k<3;k++)d[i+k]=Math.round(d[i+k]*al+255*(1-al));d[i+3]=255}}
fs.writeFileSync(o,PNG.sync.write(p,{colorType:flat?2:6,inputColorType:6,inputHasAlpha:true}));
