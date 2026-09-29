import {stages} from './engine.js';
import {loadConfig,readResults,exportResults,isClosed,closeVoting,combinedResults,readImports,importResults,showError,escapeHTML as esc} from './storage.js';
import {isCentral,request,syncCentral,centralState,resetCentral} from './central.js';
let config,authenticated=false,visibleResults=false;
let resetRound;
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
  if(isCentral(config)){
    $('#reset-controls').hidden=false;
    $('#reset').disabled=!Number.isSafeInteger(centralState(config).rodada);
    $('#reset-setup').hidden=!$('#reset').disabled;
    $('#status').textContent=closed?'Votação encerrada em todos os PCs.':'Votação central em andamento. Total atualizado automaticamente a cada 5 segundos.';
    $('.summary-card .eyebrow').textContent='VOTAÇÕES EM TODOS OS PCs';
    $('#export').textContent='↓ Exportar resultado central';$('#export').disabled=!closed;
    $('#open-controls p').textContent='Finalize o atendimento dos alunos em todos os PCs antes de encerrar. Esta ação bloqueia novos votos em todas as urnas. Escolhas ainda não enviadas não serão contabilizadas.';
    $('#final-controls>p').textContent='Os resultados de todos os PCs já estão somados automaticamente. Não é necessário importar arquivos.';
    $('.import-label').hidden=true;$('#final-controls>p:last-child').textContent='A exportação é um backup opcional do resultado completo.';
    $('.storage-note').textContent='Votos guardados no banco central. Internet necessária para confirmar cada votação. O resultado por candidato fica disponível após o encerramento.';
    $('#close-dialog p').textContent='Novos votos serão bloqueados em TODOS os PCs. Confira se o último aluno de cada urna já terminou.';
  }
  $('#open-controls').hidden=closed;$('#final-controls').hidden=!closed;
  $('#results').hidden=!closed||!visibleResults;
  if(closed){const combined=combinedResults(config);$('#combined-info').textContent=isCentral(config)?`${combined.totalVotacoes} votações concluídas no total de todos os PCs.`:`${combined.totalVotacoes} votações concluídas em ${1+readImports(config).length} urna(s) contabilizada(s).`;if(visibleResults)renderResults(combined);}
}
$('#login-form').addEventListener('submit',async event=>{
  event.preventDefault();const submit=event.submitter;submit.disabled=true;$('#login-error').hidden=true;
  try{
    const password=$('#password').value;$('#password').value='';config=await loadConfig();
    if(isCentral(config)){await request('login',{password});await syncCentral(config,true);}
    else{
      const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(password));
      const hex=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
      if(hex!==passwordHash)throw new Error('Senha incorreta. Tente novamente.');
    }
    readResults(config);authenticated=true;refresh();$('#login').hidden=true;$('#panel').hidden=false;$('#logout').focus();
  }catch(error){authenticated=false;$('#login-error').textContent=error.message;$('#login-error').hidden=false;$('#password').focus();}
  finally{submit.disabled=false;}
});
function logout(){authenticated=false;visibleResults=false;$('#panel').hidden=true;$('#login').hidden=false;$('#results').innerHTML='';$('#results').hidden=true;$('#password').value='';$('#close-dialog').close();$('#reset-dialog').close();$('#reset-password').value='';$('#password').focus();}
$('#logout').addEventListener('click',async()=>{if(isCentral(config))try{await request('logout',{});}catch(error){showError(error);return;}logout();});
window.addEventListener('pageshow',event=>{if(event.persisted)logout();});
function protectedAction(action){return async()=>{if(!authenticated)return;$('#error').hidden=true;try{await action();}catch(error){if(error.status===401)logout();else showError(error);}};}
$('#export').addEventListener('click',protectedAction(()=>exportResults(config)));
$('#close').addEventListener('click',protectedAction(()=>$('#close-dialog').showModal()));
$('#cancel-close').addEventListener('click',()=>$('#close-dialog').close());
$('#confirm-close').addEventListener('click',protectedAction(async()=>{await closeVoting(config);$('#close-dialog').close();visibleResults=true;refresh();}));
$('#show-results').addEventListener('click',protectedAction(()=>{visibleResults=true;refresh();$('#results').scrollIntoView({behavior:'smooth',block:'start'});}));
$('#reset').addEventListener('click',protectedAction(async()=>{
  await syncCentral(config,true);resetRound=centralState(config).rodada;
  $('#reset-form').reset();$('#reset-error').hidden=true;$('#reset-dialog').showModal();$('#reset-password').focus();
}));
$('#cancel-reset').addEventListener('click',()=>$('#reset-dialog').close());
$('#reset-dialog').addEventListener('close',()=>{$('#reset-password').value='';});
$('#reset-form').addEventListener('submit',async event=>{
  event.preventDefault();if(!authenticated||!$('#reset-confirm').checked)return;
  const button=$('#confirm-reset');if(button.disabled)return;button.disabled=true;$('#cancel-reset').disabled=true;$('#reset-error').hidden=true;
  const password=$('#reset-password').value;$('#reset-password').value='';
  try{
    await resetCentral(config,password,resetRound);visibleResults=false;$('#results').innerHTML='';$('#feedback').textContent='Votação reiniciada. Todos os votos foram zerados e as urnas estão abertas.';$('#reset-dialog').close();refresh();
  }catch(error){
    if(error.status===401)logout();
    else{$('#reset-error').textContent=error.message;$('#reset-error').hidden=false;$('#reset-password').focus();}
  }finally{button.disabled=false;$('#cancel-reset').disabled=false;}
});
$('#import').addEventListener('change',protectedAction(async()=>{
  const file=$('#import').files[0];$('#import').value='';if(!file)return;
  if(file.size>5*1024*1024)throw new Error('Arquivo muito grande. Selecione o JSON exportado pela urna.');
  await importResults(config,JSON.parse(await file.text()));visibleResults=true;refresh();$('#feedback').textContent='Resultados da outra urna importados com sucesso.';
}));
window.addEventListener('storage',()=>{if(authenticated)try{refresh();}catch(error){showError(error);}});
setInterval(async()=>{
  if(!authenticated||!isCentral(config)||document.hidden)return;
  try{await syncCentral(config,true);refresh();}
  catch(error){if(error.status===401)logout();else showError(error);}
},5000);
