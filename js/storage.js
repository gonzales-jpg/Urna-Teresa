import {emptyResults, assertResults, tally, stages} from './engine.js';
export async function loadConfig(){
  const response=await fetch('data/candidatos.json',{cache:'no-store'});
  if(!response.ok) throw new Error('Não foi possível carregar os candidatos.');
  const config=await response.json();
  if(!config.id || !Array.isArray(config.partidos) || typeof config.demonstracao!=='boolean') throw new Error('Configuração da eleição inválida.');
  if(!config.demonstracao && (!/^[A-Z]{2}$/.test(config.uf||'') || !config.fonte)) throw new Error('Informe a UF e a fonte dos candidatos reais no cadastro.');
  for(const s of stages){
    const list=config.candidatos?.[s.group];
    if(!Array.isArray(list)||!list.length||list.some(c=>!new RegExp(`^\\d{${s.digits}}$`).test(c.numero)||!c.nome||!c.partido)||new Set(list.map(c=>c.numero)).size!==list.length) throw new Error(`Cadastro inválido: ${s.label}.`);
  }
  return config;
}
const keyFor=config=>`urna-escola:${config.id}`;
export function isClosed(config){return localStorage.getItem(`${keyFor(config)}:encerrada`)!==null;}
export async function closeVoting(config){
  await navigator.locks.request(keyFor(config),()=>{readResults(config);localStorage.setItem(`${keyFor(config)}:encerrada`,new Date().toISOString());});
}
function stationId(config){
  const key=`${keyFor(config)}:urna`;let id=localStorage.getItem(key);
  if(!id){id=crypto.randomUUID();localStorage.setItem(key,id);}return id;
}
export function readImports(config){return JSON.parse(localStorage.getItem(`${keyFor(config)}:importacoes`)||'[]');}
export function combinedResults(config){
  const result=structuredClone(readResults(config));
  for(const imported of readImports(config)){
    assertResults(imported,config.id);result.totalVotacoes+=imported.totalVotacoes;
    for(const stage of stages)for(const [key,count] of Object.entries(imported.contagens[stage.id]))result.contagens[stage.id][key]=(result.contagens[stage.id][key]||0)+count;
  }return assertResults(result,config.id);
}
export async function importResults(config,data){
  assertResults(data,config.id);
  if(data.encerrada!==true||typeof data.urnaId!=='string'||!data.urnaId)throw new Error('Importe o JSON de uma urna encerrada, exportado pela versão atual.');
  await navigator.locks.request(keyFor(config),()=>{
    if(!isClosed(config))throw new Error('Encerre esta urna antes de reunir resultados.');
    const imports=readImports(config);
    if(data.urnaId===stationId(config)||imports.some(item=>item.urnaId===data.urnaId))throw new Error('Esta urna já está contabilizada. O arquivo não foi somado novamente.');
    const clean={...assertResults({versao:data.versao,eleicao:data.eleicao,totalVotacoes:data.totalVotacoes,contagens:data.contagens},config.id),urnaId:data.urnaId,encerrada:true};
    localStorage.setItem(`${keyFor(config)}:importacoes`,JSON.stringify([...imports,clean]));
  });
}
export function readResults(config){
  const raw=localStorage.getItem(keyFor(config));
  return raw===null?emptyResults(config.id):assertResults(JSON.parse(raw),config.id);
}
export async function saveVotes(config,votes){
  if(!navigator.locks) throw new Error('Abra a urna em HTTPS ou localhost em um navegador atualizado para salvar com segurança entre abas.');
  await navigator.locks.request(keyFor(config),()=>{
    if(isClosed(config))throw new Error('A votação desta urna foi encerrada. Este voto não foi registrado.');
    const next=tally(readResults(config),votes);
    localStorage.setItem(keyFor(config),JSON.stringify(next));
  });
}
export function exportResults(config){
  const data={...readResults(config),urnaId:stationId(config),encerrada:isClosed(config),exportadoEm:new Date().toISOString(),modo:config.demonstracao?'demonstracao':'simulacao',ano:config.ano,uf:config.uf};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='votos.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function showError(error){const el=document.querySelector('#error');el.hidden=false;el.textContent=error.message || 'Não foi possível concluir a operação.';}
export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
