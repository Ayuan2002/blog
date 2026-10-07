import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const config=JSON.parse(await readFile(path.join(root,'site.config.json'),'utf8'));
const base=new URL(config.url).pathname.replace(/\/?$/,'/');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.xml':'application/xml; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.pdf':'application/pdf'};
http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/'&&base!=='/'){res.writeHead(302,{Location:base});return res.end();}
    if(!url.pathname.startsWith(base)){res.writeHead(404);return res.end('Not found');}
    const relative=decodeURIComponent(url.pathname.slice(base.length));
    let filename=path.resolve(dist,relative||'index.html');
    if(filename!==dist&&!filename.startsWith(dist+path.sep)){res.writeHead(403);return res.end();}
    if((await stat(filename)).isDirectory()){
      if(!url.pathname.endsWith('/')){res.writeHead(302,{Location:url.pathname+'/'});return res.end();}
      filename=path.join(filename,'index.html');
    }
    res.writeHead(200,{'Content-Type':mime[path.extname(filename).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(await readFile(filename));
  }catch{
    const page=await readFile(path.join(dist,'404.html')).catch(()=>'Run npm run build first.');
    res.writeHead(404,{'Content-Type':'text/html; charset=utf-8'});res.end(page);
  }
}).listen(4173,'127.0.0.1',()=>console.log(`预览地址：http://127.0.0.1:4173${base}`));
