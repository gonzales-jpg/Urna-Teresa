import {stages} from './engine.js';
import {loadConfig,readResults,exportResults,isClosed,closeVoting,combinedResults,readImports,importResults,showError,escapeHTML as esc} from './storage.js';
let config,authenticated=false,visibleResults=false;
const $=selector=>document.querySelector(selector);
const passwordHash='28765bc222b061ba0e74499d5696e05ed68785b549fb21bf994dbe57ca758a14';
function renderResults(data){
  $('#results').innerHTML=stages.map(s=>{
    const counts=data.contagens[s.id];
    const rows=config.candidatos[s.group].filter(c=>counts[`candidato:${c.numero}`]).map(c=>({key:`candidato:${c.numero}`,name:`${c.numero} · ${c.nome}`}));
    if(s.proportional)config.partidos.filter(p=>counts[`legenda:${p.numero}`]).forEach(p=>rows.push({key:`legenda:${p.numero}`,name:`Legenda ${p.numero} · ${p.sigla}`}));
    rows.push({key:'branco',name:'Brancos'},{key:'nulo',name:'Nulos'});
    for(const key of Object.keys(counts))if(!rows.some(r=>r.key===key))rows.push({key,name:key});
    rows.sort((a,b)=>(counts[b.key]||0)-(counts[a.key]||0)||a.name.localeCompare(b.name,'pt-BR'));
    return `<section class="result-card"><h2>${esc(s.id==='deputado_estadual'&&config.uf==='DF'?'Deputado distrital':s.label)} ${s.detail?'· '+esc(s.detail):''}</h2><table><thead><tr><th scope="col">Escolha</th><th scope="col">Votos</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${counts[r.key]||0}</td></tr>`).join('')}</tbody></table></section>`;
  }).join('');
}
function refresh(){
  if(!authenticated)return;
  const closed=isClosed(config);
  $('#total').textContent=readResults(config).totalVotacoes;
  $('#status').textContent=closed?'Votação encerrada neste navegador.':'Votação em andamento neste navegador. Os resultados por candidato serão exibidos após o encerramento.';
  $('#open-controls').hidden=closed;$('#final-controls').hidden=!closed;
  $('#results').hidden=!closed||!visibleResults;
  if(closed){const combined=combinedResults(config);$('#combined-info').textContent=`${combined.totalVotacoes} votações concluídas em ${1+readImports(config).length} urna(s) contabilizada(s).`;if(visibleResults)renderResults(combined);}
}
$('#login-form').addEventListener('submit',async event=>{
  event.preventDefault();const submit=event.submitter;submit.disabled=true;$('#login-error').hidden=true;
  try{
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode($('#password').value));
    const hex=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');$('#password').value='';
    if(hex!==passwordHash)throw new Error('Senha incorreta. Tente novamente.');
    config=await loadConfig();readResults(config);authenticated=true;refresh();$('#login').hidden=true;$('#panel').hidden=false;$('#logout').focus();
  }catch(error){authenticated=false;$('#login-error').textContent=error.message;$('#login-error').hidden=false;$('#password').focus();}
  finally{submit.disabled=false;}
});
function logout(){authenticated=false;visibleResults=false;$('#panel').hidden=true;$('#login').hidden=false;$('#results').innerHTML='';$('#results').hidden=true;$('#password').value='';$('#close-dialog').close();$('#password').focus();}
$('#logout').addEventListener('click',logout);
window.addEventListener('pageshow',event=>{if(event.persisted)logout();});
function protectedAction(action){return async()=>{if(!authenticated)return;$('#error').hidden=true;try{await action();}catch(error){showError(error);}};}
$('#export').addEventListener('click',protectedAction(()=>exportResults(config)));
$('#close').addEventListener('click',protectedAction(()=>$('#close-dialog').showModal()));
$('#cancel-close').addEventListener('click',()=>$('#close-dialog').close());
$('#confirm-close').addEventListener('click',protectedAction(async()=>{await closeVoting(config);$('#close-dialog').close();visibleResults=true;refresh();}));
$('#show-results').addEventListener('click',protectedAction(()=>{visibleResults=true;refresh();$('#results').scrollIntoView({behavior:'smooth',block:'start'});}));
$('#import').addEventListener('change',protectedAction(async()=>{
  const file=$('#import').files[0];$('#import').value='';if(!file)return;
  if(file.size>5*1024*1024)throw new Error('Arquivo muito grande. Selecione o JSON exportado pela urna.');
  await importResults(config,JSON.parse(await file.text()));visibleResults=true;refresh();$('#feedback').textContent='Resultados da outra urna importados com sucesso.';
}));
window.addEventListener('storage',()=>{if(authenticated)try{refresh();}catch(error){showError(error);}});
