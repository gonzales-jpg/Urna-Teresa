export const stages = [
  {id:'deputado_federal', group:'deputado_federal', label:'Deputado federal', digits:4, proportional:true},
  {id:'deputado_estadual', group:'deputado_estadual', label:'Deputado estadual', digits:5, proportional:true},
  {id:'senador_1', group:'senador', label:'Senador', detail:'Primeira vaga', digits:3},
  {id:'senador_2', group:'senador', label:'Senador', detail:'Segunda vaga', digits:3},
  {id:'governador', group:'governador', label:'Governador', detail:'e vice-governador', digits:2},
  {id:'presidente', group:'presidente', label:'Presidente', detail:'e vice-presidente', digits:2}
];
export function classify(config, index, number, blank, previous=[]) {
  const stage=stages[index];
  if(blank) return {tipo:'branco', numero:null};
  const candidates=config.candidatos[stage.group];
  const candidate=candidates.find(c=>c.numero===number);
  if(number.length===stage.digits && candidate){
    if(index===3 && previous[2]?.tipo==='candidato' && previous[2].numero===number) return {tipo:'repetido',numero:number};
    return {tipo:'candidato',numero:number,nome:candidate.nome,partido:candidate.partido};
  }
  const party=config.partidos.find(p=>p.numero===number.slice(0,2));
  if(stage.proportional && party && candidates.some(c=>c.numero.startsWith(party.numero)) && (number.length===2 || number.length===stage.digits)) return {tipo:'legenda',numero:party.numero,nome:party.nome,partido:party.sigla};
  if(number.length===stage.digits) return {tipo:'nulo',numero:null};
  return {tipo:'incompleto',numero:null};
}
export function emptyResults(id){return {versao:1,eleicao:id,totalVotacoes:0,contagens:Object.fromEntries(stages.map(s=>[s.id,{}]))};}
export function assertResults(data,id){
  if(data?.versao!==1 || data.eleicao!==id || !Number.isSafeInteger(data.totalVotacoes) || data.totalVotacoes<0) throw new Error('A base local está inválida. Preserve os dados do navegador para recuperação.');
  for(const stage of stages){
    const values=data.contagens?.[stage.id];
    if(!values || typeof values!=='object' || Array.isArray(values)) throw new Error('Contagens locais inválidas.');
    let sum=0;
    for(const [key,n] of Object.entries(values)){
      if(!/^(branco|nulo|candidato:\d{2,5}|legenda:\d{2})$/.test(key)||!Number.isSafeInteger(n)||n<0) throw new Error('Contagens locais inválidas.');
      sum+=n;
    }
    if(sum!==data.totalVotacoes) throw new Error('A base local está inconsistente. Preserve os dados para recuperação.');
  }
  return data;
}
export function tally(data, votes){
  assertResults(data,data.eleicao);
  if(votes.length!==6 || votes.some(v=>!['candidato','legenda','branco','nulo'].includes(v.tipo))) throw new Error('Votação incompleta.');
  const next=structuredClone(data);
  votes.forEach((v,i)=>{const key=['branco','nulo'].includes(v.tipo)?v.tipo:`${v.tipo}:${v.numero}`;next.contagens[stages[i].id][key]=(next.contagens[stages[i].id][key]||0)+1;});
  next.totalVotacoes++;
  return assertResults(next,data.eleicao);
}
