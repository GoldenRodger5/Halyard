import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.mp4':'video/mp4','.mp3':'audio/mpeg','.wav':'audio/wav','.json':'application/json','.html':'text/html; charset=utf-8'};
const server=http.createServer((req,res)=>{
  try {
    const u=new URL(req.url,'http://127.0.0.1');
    if(u.pathname==='/catalog.json'){
      res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',mime['.json']);
      res.end(fs.readFileSync(path.join(here,'catalog.json')));return;
    }
    if(u.pathname==='/'||u.pathname==='/index.html'){
      res.setHeader('Content-Type',mime['.html']);res.end(fs.readFileSync(path.join(here,'review.html')));return;
    }
    const catalog=JSON.parse(fs.readFileSync(path.join(here,'catalog.json'),'utf8'));
    const assets=[...catalog.ideas.flatMap(i=>i.variants.flatMap(v=>v.media)),...(catalog.referenceAssets??[])];
    const asset=assets.find(a=>`/media/${a.sha256}${path.extname(a.path)}`===u.pathname);
    if(!asset){res.writeHead(404);res.end('Not found');return;}
    const stat=fs.statSync(asset.path);res.setHeader('Content-Type',mime[path.extname(asset.path)]??'application/octet-stream');
    res.setHeader('Accept-Ranges','bytes');res.setHeader('Cache-Control','no-store');
    if(req.headers.range){
      const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
      if(!match){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return;}
      const start=Number(match[1]),end=Math.min(match[2]?Number(match[2]):stat.size-1,stat.size-1);
      if(start>end){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return;}
      res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${stat.size}`,'Content-Length':end-start+1});
      fs.createReadStream(asset.path,{start,end}).pipe(res);return;
    }
    res.setHeader('Content-Length',stat.size);fs.createReadStream(asset.path).pipe(res);
  }catch{res.writeHead(500);res.end('Review asset unavailable. Check the mounted T9 and catalog.');}
});
server.listen(Number(process.env.PORT??4360),'127.0.0.1',()=>console.log(`RecipeFix team review: http://127.0.0.1:${server.address().port}`));
