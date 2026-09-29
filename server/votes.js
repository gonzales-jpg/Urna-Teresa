import {classify,stages} from '../js/engine.js';

// Never trust names, parties or the classification sent by the browser.
export function validateVotes(config,votes){
  if(!Array.isArray(votes)||votes.length!==stages.length)throw new Error('Envie as seis escolhas.');
  const validated=[];
  votes.forEach((vote,index)=>{
    if(!vote||!['candidato','legenda','branco','nulo'].includes(vote.tipo))throw new Error('Tipo de voto inválido.');
    if(['branco','nulo'].includes(vote.tipo)){
      if(vote.numero!==null)throw new Error('Voto branco ou nulo não deve ter número.');
      validated.push({tipo:vote.tipo,numero:null});return;
    }
    if(typeof vote.numero!=='string')throw new Error('Número inválido.');
    const result=classify(config,index,vote.numero,false,validated);
    if(result.tipo!==vote.tipo)throw new Error('Candidato, legenda ou segunda vaga de senador inválidos.');
    validated.push({tipo:result.tipo,numero:result.numero});
  });
  return validated;
}
