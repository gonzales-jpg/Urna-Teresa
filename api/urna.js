import {readFileSync} from 'node:fs';
import {createHash,createHmac} from 'node:crypto';
import {validateVotes} from '../server/votes.js';
import {passwordMatches,makeSession,validSession,cookie} from '../server/auth.js';
const config=JSON.parse(readFileSync(new URL('../data/candidatos.json',import.meta.url),'utf8'));
function fail(status,message){return Object.assign(new Error(message),{status});}
async function rpc(name,args){
  const key=process.env.SUPABASE_SECRET_KEY;
  const headers={'Content-Type':'application/json',apikey:key};
  // Legacy service_role JWT keys additionally use the Authorization header.
  if(key.startsWith('eyJ'))headers.Authorization=`Bearer ${key}`;
  let response;
  try{response=await fetch(`${process.env.SUPABASE_URL.replace(/\/$/,'')}/rest/v1/rpc/${name}`,{method:'POST',headers,body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});}
  catch{throw fail(503,'Não foi possível conectar ao banco. Tente novamente.');}
  const data=await response.json();
  if(!response.ok){
    if(data.message?.includes('ROUND_CHANGED'))throw Object.assign(fail(409,'A votação foi reiniciada. Atualize a página; escolhas da rodada anterior não serão registradas.'),{code:'ROUND_CHANGED'});
    if(data.message?.includes('ELECTION_CLOSED'))throw fail(409,'A votação foi encerrada. Este voto não foi registrado.');
    if(data.message?.includes('REQUEST_CONFLICT'))throw fail(409,'O envio pendente foi alterado. Não inicie outro voto; procure o responsável.');
    throw fail(503,'O banco está indisponível ou ainda não foi configurado. Avise o responsável.');
  }
  return data;
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');res.setHeader('X-Content-Type-Options','nosniff');
  try{
    const secret=process.env.SESSION_SECRET;
    if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY||!process.env.ADMIN_PASSWORD||!secret||secret.length<32)throw fail(503,'Conexão central não configurada. Avise o responsável.');
    if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');throw fail(405,'Método não permitido.');}
    if(req.method==='POST'){
      const origin=req.headers.origin;
      if(!origin||new URL(origin).host!==req.headers.host)throw fail(403,'Origem não permitida.');
      if(!req.headers['content-type']?.startsWith('application/json'))throw fail(415,'Envie JSON.');
    }
    const action=req.query?.action;
    let body=req.body||{};
    if(typeof body==='string'){if(body.length>10000)throw fail(413,'Envio muito grande.');try{body=JSON.parse(body);}catch{throw fail(400,'JSON inválido.');}}
    if(JSON.stringify(body).length>10000)throw fail(413,'Envio muito grande.');
    const admin=validSession((req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('urna_admin='))?.slice(11)||'',secret);
    if(req.method==='GET'&&action==='status'){
      const status=await rpc('urna_status',{p_election:config.id,p_details:false});
      return res.status(200).json({encerrada:status.encerrada,eleicao:config.id,rodada:status.rodada});
    }
    if(req.method==='POST'&&action==='login'){
      const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0];
      const bucket=createHmac('sha256',secret).update(ip).digest('hex');
      if(!await rpc('urna_allow_login',{p_bucket:bucket}))throw fail(429,'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.');
      if(!passwordMatches(body.password,process.env.ADMIN_PASSWORD))throw fail(401,'Senha incorreta. Tente novamente.');
      res.setHeader('Set-Cookie',cookie(makeSession(secret)));return res.status(200).json({ok:true});
    }
    if(req.method==='POST'&&action==='logout'){res.setHeader('Set-Cookie',cookie('',true));return res.status(200).json({ok:true});}
    if(req.method==='POST'&&action==='reset'){
      if(!admin)throw fail(401,'Sessão expirada. Entre novamente no painel.');
      if(body.confirmar!==true||!Number.isSafeInteger(body.rodada)||body.rodada<1)throw fail(400,'Confirme o reinício da votação.');
      const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0];
      const bucket=createHmac('sha256',secret).update(ip).digest('hex');
      if(!await rpc('urna_allow_login',{p_bucket:bucket}))throw fail(429,'Muitas tentativas. Aguarde 15 minutos.');
      if(!passwordMatches(body.password,process.env.ADMIN_PASSWORD))throw fail(403,'Senha incorreta. A votação não foi reiniciada.');
      return res.status(200).json(await rpc('urna_reset',{p_election:config.id,p_expected:body.rodada}));
    }
    if(req.method==='POST'&&action==='vote'){
      if(body.eleicao!==config.id||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId||''))throw fail(400,'Identificação de votação inválida.');
      let votes;try{votes=validateVotes(config,body.votes);}catch(error){throw fail(400,error.message);}
      const fingerprint=createHash('sha256').update(JSON.stringify(votes)).digest('hex');
      const generation=body.rodada??1;
      if(!Number.isSafeInteger(generation)||generation<1)throw fail(400,'Rodada inválida.');
      return res.status(200).json(await rpc('urna_submit',{p_election:config.id,p_request:body.requestId,p_fingerprint:fingerprint,p_votes:votes,...(generation===1?{}:{p_generation:generation})}));
    }
    if((req.method==='GET'&&action==='results')||(req.method==='POST'&&action==='close')){
      if(!admin)throw fail(401,'Sessão expirada. Entre novamente no painel.');
      return res.status(200).json(await rpc(action==='close'?'urna_close':'urna_status',action==='close'?{p_election:config.id}:{p_election:config.id,p_details:true}));
    }
    throw fail(404,'Operação não encontrada.');
  }catch(error){return res.status(error.status||500).json({error:error.status?error.message:'Não foi possível concluir a operação. Tente novamente.',...(error.code==='ROUND_CHANGED'?{code:error.code}:{})});}
}
