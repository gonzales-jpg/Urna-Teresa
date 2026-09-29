const cache=new Map();
export const isCentral=config=>config?.modo==='central';
export function centralState(config){return cache.get(config.id)||{encerrada:false,totalVotacoes:0};}
export async function request(action,body){
  let response;
  try{response=await fetch(`/api/urna?action=${action}`,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});}
  catch{throw new Error('Sem conexão com a votação central. Verifique a internet e tente novamente.');}
  let data;try{data=await response.json();}catch{throw new Error('A API central não está disponível neste endereço.');}
  if(!response.ok)throw Object.assign(new Error(data.error||'Não foi possível concluir a operação.'),{status:response.status,code:data.code});
  return data;
}
export async function syncCentral(config,admin=false){
  const state=await request(admin?'results':'status');
  if(state.eleicao&&state.eleicao!==config.id)throw new Error('O cadastro desta página mudou. Recarregue antes de votar.');
  const previous=centralState(config);
  if(Number.isSafeInteger(state.rodada)&&state.rodada<(previous.rodada??1))return previous;
  cache.set(config.id,{...(state.rodada!==previous.rodada?{}:previous),...state});
  if(!state.encerrada)delete cache.get(config.id).resultados;
  return state;
}
export async function closeCentral(config){cache.set(config.id,await request('close',{}));}
export async function resetCentral(config,password,rodada){cache.set(config.id,await request('reset',{password,rodada,confirmar:true}));}
const pendingKey=config=>`urna-central:pendente:${config.id}`;
export function pendingVote(config){return isCentral(config)?JSON.parse(sessionStorage.getItem(pendingKey(config))||'null'):null;}
export function clearOldPending(config){
  const pending=pendingVote(config);
  if(pending&&(pending.rodada??1)!==(centralState(config).rodada??1)){sessionStorage.removeItem(pendingKey(config));return true;}
  return false;
}
export async function saveCentral(config,votes){
  let pending=pendingVote(config);
  if(!pending){
    pending={eleicao:config.id,rodada:centralState(config).rodada??1,requestId:crypto.randomUUID(),votes:votes.map(v=>({tipo:v.tipo,numero:v.numero}))};
    // Persist before sending. Retries, including after reload, use this same ID.
    sessionStorage.setItem(pendingKey(config),JSON.stringify(pending));
  }
  const result=await request('vote',pending);
  if(result.salvo!==true)throw new Error('O servidor não confirmou o registro. Tente novamente.');
  sessionStorage.removeItem(pendingKey(config));
}
