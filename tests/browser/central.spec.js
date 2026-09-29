import {test,expect} from '@playwright/test';
import {emptyResults,tally} from '../../js/engine.js';
const election='sp-2026-turno1-v1';
function sharedAPI(){
  const state={closed:false,rodada:1,result:emptyResults(election),receipts:new Set(),loseResponse:false};
  state.attach=async context=>{
    await context.route('**/data/conexao.json',route=>route.fulfill({json:{modo:'central'}}));
    await context.route('**/api/urna?*',async route=>{
      const action=new URL(route.request().url()).searchParams.get('action');
      const body=route.request().method()==='POST'?route.request().postDataJSON():{};
      if(action==='status')return route.fulfill({json:{encerrada:state.closed,eleicao:election,rodada:state.rodada}});
      if(action==='login'||action==='logout')return route.fulfill({json:{ok:true}});
      if(action==='close')state.closed=true;
      if(action==='reset'){
        if(body.password!=='test-only')return route.fulfill({status:403,json:{error:'Senha incorreta. A votação não foi reiniciada.'}});
        if(body.rodada!==state.rodada)return route.fulfill({status:409,json:{code:'ROUND_CHANGED',error:'A votação foi reiniciada.'}});
        state.rodada++;state.closed=false;state.result=emptyResults(election);state.receipts.clear();
      }
      if(['results','close','reset'].includes(action))return route.fulfill({json:{encerrada:state.closed,rodada:state.rodada,totalVotacoes:state.result.totalVotacoes,...(state.closed?{resultados:state.result}:{})}});
      if(action==='vote'){
        if(body.rodada!==state.rodada)return route.fulfill({status:409,json:{code:'ROUND_CHANGED',error:'A votação foi reiniciada.'}});
        if(!state.receipts.has(body.requestId)){
          if(state.closed)return route.fulfill({status:409,json:{error:'A votação foi encerrada.'}});
          state.receipts.add(body.requestId);state.result=tally(state.result,body.votes);
        }
        if(state.loseResponse){state.loseResponse=false;return route.abort('failed');}
        return route.fulfill({json:{salvo:true}});
      }
      return route.fulfill({status:404,json:{error:'not found'}});
    });
  };
  return state;
}
async function voteBlank(page){for(let i=0;i<6;i++){await page.getByRole('button',{name:'BRANCO',exact:true}).click();await page.getByRole('button',{name:'CONFIRMA',exact:true}).click();}}
async function login(page){await page.goto('/apuracao.html');await page.getByLabel('Senha',{exact:true}).fill('test-only');await page.getByRole('button',{name:'Entrar no painel'}).click();await expect(page.locator('#panel')).toBeVisible();}
test('dois navegadores somam no painel e o encerramento chega aos dois',async({browser})=>{
  const api=sharedAPI();const first=await browser.newContext(),second=await browser.newContext();
  try{
    await api.attach(first);await api.attach(second);const a=await first.newPage(),b=await second.newPage();
    await a.goto('http://localhost:3000');await b.goto('http://localhost:3000');
    await Promise.all([voteBlank(a),voteBlank(b)]);await expect(a.getByRole('heading',{name:'FIM',exact:true})).toBeVisible();await expect(b.getByRole('heading',{name:'FIM',exact:true})).toBeVisible();
    expect(api.result.totalVotacoes).toBe(2);
    expect(await a.evaluate(()=>localStorage.getItem('urna-escola:sp-2026-turno1-v1'))).toBeNull();
    const panel=await first.newPage();await login(panel);await expect(panel.locator('#total')).toHaveText('2');await expect(panel.locator('#results')).toBeHidden();
    await a.getByRole('button',{name:'Próximo aluno'}).click();await b.getByRole('button',{name:'Próximo aluno'}).click();
    await panel.getByRole('button',{name:'Encerrar votação',exact:true}).click();await panel.getByRole('button',{name:'Confirmar encerramento'}).click();
    await expect(panel.locator('#combined-info')).toContainText('2 votações concluídas no total');await expect(panel.locator('.import-label')).toBeHidden();
    await expect(a.getByRole('heading',{name:'Votação encerrada'})).toBeVisible({timeout:10000});await expect(b.getByRole('heading',{name:'Votação encerrada'})).toBeVisible({timeout:10000});
  }finally{await first.close();await second.close();}
});
test('resposta perdida, recarga e repetição após encerramento não duplicam o voto',async({context,page})=>{
  const api=sharedAPI();await api.attach(context);api.loseResponse=true;await page.goto('/');await voteBlank(page);
  await expect(page.locator('#error')).toBeVisible();expect(api.result.totalVotacoes).toBe(1);
  await expect(page.getByRole('heading',{name:'FIM',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'CORRIGE',exact:true})).toBeDisabled();
  const ids=[...api.receipts];api.closed=true;
  page.on('dialog',dialog=>dialog.accept());await page.reload();
  await expect(page.locator('#error')).toContainText('envio pendente');await page.getByRole('button',{name:'CONFIRMA',exact:true}).click();
  await expect(page.getByRole('heading',{name:'FIM',exact:true})).toBeVisible();expect([...api.receipts]).toEqual(ids);expect(api.result.totalVotacoes).toBe(1);
  expect(await page.evaluate(()=>sessionStorage.getItem('urna-central:pendente:sp-2026-turno1-v1'))).toBeNull();
});
test('banco indisponível não cria votação local de emergência',async({context,page})=>{
  await context.route('**/data/conexao.json',route=>route.fulfill({json:{modo:'central'}}));
  await context.route('**/api/urna?*',route=>route.fulfill({status:503,json:{error:'Conexão central não configurada.'}}));
  await page.goto('/');await expect(page.getByRole('heading',{name:'Urna indisponível'})).toBeVisible();await expect(page.getByRole('button',{name:'BRANCO',exact:true})).toBeDisabled();
  expect(await page.evaluate(()=>localStorage.length)).toBe(0);
});
test('reinício exige senha novamente, zera e libera outra aba sem votos antigos',async({context,page})=>{
  const api=sharedAPI();await api.attach(context);await page.goto('/');api.loseResponse=true;await voteBlank(page);
  await expect(page.locator('#error')).toBeVisible();expect(api.result.totalVotacoes).toBe(1);
  const panel=await context.newPage();await login(panel);
  await panel.getByRole('button',{name:'Reiniciar votação',exact:true}).click();
  await panel.locator('#cancel-reset').click();expect(api.result.totalVotacoes).toBe(1);
  await panel.getByRole('button',{name:'Reiniciar votação',exact:true}).click();
  await panel.getByLabel('Digite novamente a senha do painel').fill('wrong');
  await panel.locator('#reset-confirm').check();await panel.getByRole('button',{name:'Confirmar reinício'}).click();
  await expect(panel.locator('#reset-error')).toContainText('Senha incorreta');expect(api.result.totalVotacoes).toBe(1);
  await panel.getByLabel('Digite novamente a senha do painel').fill('test-only');
  await panel.screenshot({path:'tmp/reiniciar-dialog.png'});
  await panel.getByRole('button',{name:'Confirmar reinício'}).click();await expect(panel.locator('#total')).toHaveText('0');expect(api.rodada).toBe(2);
  await expect(page.getByRole('heading',{name:'Deputado federal',exact:true})).toBeVisible({timeout:10000});
  expect(await page.evaluate(()=>sessionStorage.getItem('urna-central:pendente:sp-2026-turno1-v1'))).toBeNull();
  await voteBlank(page);await expect(page.getByRole('heading',{name:'FIM',exact:true})).toBeVisible();expect(api.result.totalVotacoes).toBe(1);
});
