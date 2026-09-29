import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {validateVotes} from '../server/votes.js';
import {makeSession,validSession,passwordMatches} from '../server/auth.js';
import handler from '../api/urna.js';
const fixture=JSON.parse(readFileSync(new URL('./candidatos.fixture.json',import.meta.url)));
const votes=Array.from({length:6},()=>({tipo:'branco',numero:null}));
test('servidor rejeita candidato inexistente, legenda majoritária e senador repetido',()=>{
  assert.equal(validateVotes(fixture,votes).length,6);
  for(const [index,vote] of [[0,{tipo:'candidato',numero:'0000'}],[4,{tipo:'legenda',numero:'91'}]]){
    const data=structuredClone(votes);data[index]=vote;assert.throws(()=>validateVotes(fixture,data));
  }
  const duplicate=structuredClone(votes);duplicate[2]=duplicate[3]={tipo:'candidato',numero:'911'};assert.throws(()=>validateVotes(fixture,duplicate));
});
test('sessão tem assinatura, expira e depende do segredo',()=>{
  const token=makeSession('secret',1000);assert.equal(validSession(token,'secret',1001),true);
  assert.equal(validSession(token,'other',1001),false);assert.equal(validSession(token,'secret',1000+7200000),false);
  assert.equal(validSession(token+'x','secret',1001),false);assert.equal(passwordMatches('bad','correct'),false);
});
test('SQL real: transação, reenvio sem duplicação, encerramento e permissões',async()=>{
  const db=new PGlite();
  try{
    await db.exec('create role anon; create role authenticated; create role service_role;');
    await db.exec(readFileSync(new URL('../supabase/setup.sql',import.meta.url),'utf8'));
    const election='sp-2026-turno1-v1',id=randomUUID();
    const submit=(request,fingerprint,data=votes)=>db.query('select public.urna_submit($1,$2,$3,$4::jsonb) result',[election,request,fingerprint,JSON.stringify(data)]);
    await submit(id,'hash');await submit(id,'hash');
    assert.equal((await db.query('select total from public.urna_elections')).rows[0].total,1);
    await assert.rejects(()=>submit(id,'changed'));
    const invalid=structuredClone(votes);invalid[5]={tipo:'invalid'};
    await assert.rejects(()=>submit(randomUUID(),'invalid',invalid));
    const row=(await db.query('select * from public.urna_elections')).rows[0];assert.equal(row.total,1);
    for(const count of Object.values(row.counts))assert.equal(count.branco,1);
    await Promise.all(Array.from({length:5},()=>submit(randomUUID(),'unique')));
    assert.equal((await db.query('select total from public.urna_elections')).rows[0].total,6);
    const open=(await db.query('select public.urna_status($1,true) result',[election])).rows[0].result;assert.equal(open.resultados,undefined);
    await db.query('select public.urna_close($1)',[election]);await assert.rejects(()=>submit(randomUUID(),'late'));await submit(id,'hash');
    const closed=(await db.query('select public.urna_status($1,true) result',[election])).rows[0].result;assert.equal(closed.resultados.totalVotacoes,6);
    await db.exec('set role anon;');await assert.rejects(()=>db.query('select * from public.urna_elections'));await assert.rejects(()=>db.query('select public.urna_close($1)',[election]));await db.exec('reset role;');
    for(let i=0;i<10;i++)assert.equal((await db.query('select public.urna_allow_login($1) ok',['client'])).rows[0].ok,true);
    assert.equal((await db.query('select public.urna_allow_login($1) ok',['client'])).rows[0].ok,false);
    // Running setup twice does not reopen the election or clear votes.
    await db.exec(readFileSync(new URL('../supabase/setup.sql',import.meta.url),'utf8'));
    assert.equal((await db.query('select closed,total from public.urna_elections')).rows[0].total,6);
  }finally{await db.close();}
});
test('API exige login para resultados/encerramento, origem correta e configuração',async()=>{
  const saved={...process.env};const originalFetch=globalThis.fetch;
  Object.assign(process.env,{SUPABASE_URL:'https://database.example',SUPABASE_SECRET_KEY:'sb_secret_test',ADMIN_PASSWORD:'test-only',SESSION_SECRET:'a'.repeat(40)});
  let calls=0;
  globalThis.fetch=async(url)=>{calls++;return {ok:true,json:async()=>String(url).endsWith('urna_allow_login')?true:{encerrada:false,totalVotacoes:3}};};
  const call=async(action,{method='GET',body={},token='',origin='https://urna.example'}={})=>{
    const response={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(data){this.data=data;return this;}};
    await handler({method,query:{action},body,headers:{host:'urna.example',origin,'content-type':'application/json',cookie:token?`urna_admin=${token}`:''}},response);return response;
  };
  try{
    assert.equal((await call('results')).code,401);assert.equal((await call('close',{method:'POST'})).code,401);assert.equal(calls,0);
    assert.equal((await call('login',{method:'POST',body:{password:'bad'}})).code,401);
    const login=await call('login',{method:'POST',body:{password:'test-only'}});assert.equal(login.code,200);assert.match(login.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Strict/);
    const token=login.headers['Set-Cookie'].split(';')[0].slice(11);
    assert.equal((await call('results',{token})).code,200);
    assert.equal((await call('close',{method:'POST',token,origin:'https://evil.example'})).code,403);
    const status=await call('status');assert.equal(status.data.totalVotacoes,undefined);
    assert.equal((await call('vote',{method:'POST',body:{eleicao:'wrong',requestId:randomUUID(),votes}})).code,400);
    delete process.env.SUPABASE_SECRET_KEY;assert.equal((await call('status')).code,503);
  }finally{globalThis.fetch=originalFetch;for(const key of ['SUPABASE_URL','SUPABASE_SECRET_KEY','ADMIN_PASSWORD','SESSION_SECRET']){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});
