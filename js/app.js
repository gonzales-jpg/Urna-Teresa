import {stages,classify} from './engine.js';
import {loadConfig,readResults,saveVotes,isClosed,showError,escapeHTML as esc} from './storage.js';
let config,index=0,number='',blank=false,votes=[],finished=false,busy=false,sound=true,audio;
const screen=document.querySelector('#screen');
const keypad=document.querySelector('#keypad');
keypad.innerHTML=[1,2,3,4,5,6,7,8,9,0].map(n=>`<button class="number-key" data-number="${n}" aria-label="Número ${n}">${n}</button>`).join('');
function beep(final=false){
  if(!sound)return;
  try{audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{});const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.connect(gain);gain.connect(audio.destination);oscillator.frequency.value=final?660:880;gain.gain.setValueAtTime(.055,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+(final?.6:.1));oscillator.start();oscillator.stop(audio.currentTime+(final?.6:.1));}catch{/* O som é opcional. */}
}
function label(stage){return stage.id==='deputado_estadual'&&config.uf==='DF'?'Deputado distrital':stage.label;}
function renderGuide(query=''){
  const normalized=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  document.querySelector('#candidate-guide').innerHTML=stages.filter(s=>s.id!=='senador_2').map(s=>{
    const matches=config.candidatos[s.group].filter(c=>normalized(`${c.numero} ${c.nome} ${c.partido}`).includes(normalized(query)));
    return `<div><h3>${esc(label(s))}</h3><ul>${matches.slice(0,15).map(c=>`<li><strong>${esc(c.numero)}</strong> · ${esc(c.nome)} (${esc(c.partido)})</li>`).join('')}</ul><p>${matches.length>15?`Exibindo 15 de ${matches.length}. Refine a busca.`:matches.length+' candidato(s).'}</p></div>`;
  }).join('');
}
function render(){
  if(isClosed(config)){
    document.querySelectorAll('.controls button').forEach(b=>b.disabled=true);screen.classList.add('finish');
    screen.innerHTML='<h2 style="font-size:26px;letter-spacing:0">Votação encerrada</h2><p>Esta urna não está mais recebendo votos.<br>Os resultados estão no painel da escola.</p>';
    document.querySelector('#machine-status').textContent='Urna encerrada';document.querySelector('#vote-progress').textContent='VOTAÇÃO ENCERRADA';return;
  }
  const stage=stages[index];
  document.querySelector('#steps').innerHTML=stages.map((s,i)=>`<li class="${finished||i<index?'done':i===index?'active':''}" ${!finished&&i===index?'aria-current="step"':''}><span class="step-number">${finished||i<index?'✓':i+1}</span><span class="step-label">${esc(label(s))}${s.detail?`<small>${esc(s.detail)}</small>`:''}</span></li>`).join('');
  document.querySelectorAll('.controls button').forEach(b=>b.disabled=finished||busy);
  document.querySelector('#vote-progress').textContent=finished?'VOTAÇÃO CONCLUÍDA':`VOTO ${String(index+1).padStart(2,'0')} DE 06`;
  document.querySelector('#machine-status').textContent=finished?'Votação salva neste navegador':busy?'Salvando votação':'Urna pronta para votar';
  screen.classList.toggle('finish',finished);
  if(finished){screen.innerHTML='<span class="screen-kicker">VOTAÇÃO CONCLUÍDA</span><h2>FIM</h2><p>Suas seis escolhas foram registradas.<br>Obrigado por participar!</p><button class="primary" id="next-student">Próximo aluno →</button>';return;}
  const choice=classify(config,index,number,blank,votes);
  const candidate=config.candidatos[stage.group].find(c=>c.numero===number);
  let content='<p class="screen-description">Digite o número do seu candidato<br>ou aperte a tecla BRANCO.</p>';
  if(choice.tipo==='candidato') content=`<div class="candidate"><div class="candidate-info"><p>Nome</p><strong>${esc(choice.nome)}</strong><p>Partido: ${esc(choice.partido)}</p>${candidate.vice?`<p>Vice: ${esc(candidate.vice)}</p>`:''}${candidate.suplentes?`<p>Suplentes: ${candidate.suplentes.map(esc).join(' · ')}</p>`:''}</div>${candidate.foto?`<img class="portrait" alt="Foto de ${esc(choice.nome)}" src="${esc(candidate.foto)}">`:''}</div>`;
  if(choice.tipo==='legenda')content=`<div class="candidate-info"><p>VOTO DE LEGENDA</p><strong>${esc(choice.partido)}</strong><p>${esc(choice.nome)}</p></div>`;
  if(choice.tipo==='branco')content='<p class="vote-kind">VOTO EM BRANCO</p><p class="screen-description">Nenhum candidato será escolhido para este cargo.</p>';
  if(choice.tipo==='nulo')content='<p class="screen-kicker">NÚMERO NÃO CADASTRADO</p><p class="vote-kind">VOTO NULO</p><p class="screen-description">Confirme para anular ou corrija o número.</p>';
  if(choice.tipo==='repetido')content='<p class="vote-kind">SENADOR JÁ ESCOLHIDO</p><p class="screen-description">Escolha outro número para a segunda vaga. Aperte CORRIGE.</p>';
  screen.innerHTML=`<p class="screen-kicker">SEU VOTO PARA${stage.detail?' · '+esc(stage.detail):''}</p><h2>${esc(label(stage))}</h2>${blank?'':`<div class="digits" aria-label="Número digitado: ${number||'nenhum'}">${Array.from({length:stage.digits},(_,i)=>`<span class="digit ${i===number.length?'cursor':''}">${number[i]||''}</span>`).join('')}</div>`}${content}<div class="screen-instructions">Aperte a tecla:<br><strong>CONFIRMA</strong> para confirmar este voto<br><strong>CORRIGE</strong> para reiniciar este voto</div>`;
  document.querySelector('[data-action="confirm"]').disabled=busy||['incompleto','repetido'].includes(choice.tipo);
}
async function act(action,digit){
  if(!config||finished||busy)return;
  if(isClosed(config)){render();return;}
  if(action==='number'){if(blank||number.length>=stages[index].digits)return;number+=digit;beep();render();return;}
  if(action==='correct'){number='';blank=false;render();return;}
  if(action==='blank'){number='';blank=true;render();return;}
  if(action!=='confirm')return;
  const choice=classify(config,index,number,blank,votes);
  if(['incompleto','repetido'].includes(choice.tipo))return;
  if(index<5){votes.push(choice);index++;number='';blank=false;beep();render();return;}
  busy=true;render();
  try{await saveVotes(config,[...votes,choice]);finished=true;votes=[];number='';blank=false;document.querySelector('#error').hidden=true;beep(true);}
  catch(error){showError(new Error(`Não foi possível salvar. Suas escolhas continuam nesta tela; tente CONFIRMA novamente. ${error.message}`));}
  finally{busy=false;render();}
}
document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.number!==undefined)act('number',button.dataset.number);
  else if(button.dataset.action)act(button.dataset.action);
  else if(button.id==='next-student'){index=0;number='';blank=false;votes=[];finished=false;render();}
  else if(button.id==='sound-toggle'){sound=!sound;button.textContent=sound?'Som ligado ♫':'Som desligado';button.setAttribute('aria-pressed',String(sound));}
});
document.addEventListener('keydown',event=>{
  if(event.ctrlKey||event.altKey||event.metaKey||event.repeat||event.target.closest('input,textarea,select,summary,a'))return;
  if(event.key==='Enter'&&event.target.closest('button'))return;
  if(/^\d$/.test(event.key)){event.preventDefault();act('number',event.key);}
  if(event.key==='Enter'){event.preventDefault();act('confirm');}
  if(event.key==='Backspace'||event.key==='Escape'){event.preventDefault();act('correct');}
});
window.addEventListener('beforeunload',event=>{if(!finished&&(index>0||number||blank)){event.preventDefault();event.returnValue='';}});
async function init(){
  document.querySelectorAll('.controls button').forEach(b=>b.disabled=true);
  try{
    config=await loadConfig();readResults(config);
    document.querySelector('#config-notice').textContent=config.demonstracao?`MODO DE DEMONSTRAÇÃO · São Paulo · ${config.ano} — Os candidatos e partidos deste cadastro são fictícios. A base oficial ainda precisa ser importada.`:`SIMULAÇÃO ESCOLAR · ${config.uf} · ${config.ano} — Candidatos reais. Esta votação não tem valor eleitoral oficial.`;
    document.querySelector('#candidate-guide').className='candidate-list';
    const search=document.createElement('input');search.type='search';search.placeholder='Buscar por nome, número ou partido';search.setAttribute('aria-label','Buscar candidatos');search.className='candidate-search';search.addEventListener('input',()=>renderGuide(search.value));document.querySelector('#candidate-guide').before(search);
    renderGuide();
    render();
  }catch(error){config=null;screen.innerHTML='<h2>Urna indisponível</h2><p>Verifique o cadastro e o acesso ao armazenamento antes de iniciar.</p>';showError(error);}
}
init();
window.addEventListener('storage',()=>{if(config&&isClosed(config))render();});
