// Extracts embedded lectures and the programme from spondylarthrite_interactive.html.
import fs from 'node:fs'; import vm from 'node:vm';
const [,, srAppHtml, outDir='public/data'] = process.argv;
const html = fs.readFileSync(srAppHtml,'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.slice(8,-9)).sort((a,b)=>b.length-a.length)[0];
const start = m.indexOf('const PROGRAMME'); const end = m.indexOf("const STORE_KEY");
const code = m.slice(start,end);
const names=[...code.matchAll(/^const ([A-Z_]+_LECTURE)\s*=/gm)].map(x=>x[1]);
const ctx={}; vm.createContext(ctx);
vm.runInContext(code+';this.OUT={PROGRAMME,'+names.join(',')+'}',ctx);
fs.mkdirSync(outDir+'/lectures',{recursive:true});
const index=[];
for(const n of names){const L=ctx.OUT[n];
  fs.writeFileSync(`${outDir}/lectures/${L.id}.json`,JSON.stringify(L,null,1));
  index.push({id:L.id,progId:L.progId??null,name:L.name,cards:L.cards?.length??0,quiz:L.quiz?.length??0,vf:L.vf?.length??0});}
fs.writeFileSync(`${outDir}/index.json`,JSON.stringify({lectures:index},null,1));
fs.writeFileSync(`${outDir}/programme.json`,JSON.stringify(ctx.OUT.PROGRAMME));
console.log({lectures:index.length});
console.log(index);
