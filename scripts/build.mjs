import {cp,mkdir,writeFile,readFile} from 'node:fs/promises';
// Only public assets are published. Server files, SQL, tests and secrets stay out.
await mkdir('dist',{recursive:true});
for(const path of ['index.html','apuracao.html','css','js','assets','data'])await cp(path,`dist/${path}`,{recursive:true});
const mode=process.env.VOTACAO_CENTRAL==='true'?'central':'local';
await writeFile('dist/data/conexao.json',JSON.stringify({modo:mode}));
// The legacy local password hash is unnecessary in the central public bundle.
if(mode==='central'){
  const path='dist/js/admin.js';const text=await readFile(path,'utf8');
  await writeFile(path,text.replace(/const passwordHash='[a-f0-9]+';/,"const passwordHash='';"));
}
console.log(`Site preparado no modo ${mode}.`);
