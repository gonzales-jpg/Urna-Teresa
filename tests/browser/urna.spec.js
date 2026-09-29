import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const config=JSON.parse(readFileSync(new URL('../../data/candidatos.json',import.meta.url)));
const key=`urna-escola:${config.id}`;
async function type(page,number){for(const digit of number)await page.getByRole('button',{name:`Número ${digit}`,exact:true}).click();}
test('votação completa, correção, senador repetido, persistência e exportação',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Deputado federal',exact:true})).toBeVisible();
  await page.screenshot({path:'tmp/urna-desktop.png',fullPage:true});
  await expect(page.getByRole('button',{name:'CONFIRMA',exact:true})).toBeDisabled();
  await type(page,config.candidatos.deputado_federal[0].numero);
  await expect(page.locator('#screen')).toContainText(config.candidatos.deputado_federal[0].nome);
  await page.getByRole('button',{name:'CORRIGE',exact:true}).click();
  await type(page,'0000');await expect(page.locator('#screen')).toContainText('VOTO NULO');
  await page.getByRole('button',{name:'CONFIRMA',exact:true}).click();
  await page.getByRole('button',{name:'BRANCO',exact:true}).click();
  await page.getByRole('button',{name:'CONFIRMA',exact:true}).click();
  const senator=config.candidatos.senador[0].numero;
  await type(page,senator);await page.getByRole('button',{name:'CONFIRMA',exact:true}).click();
  await type(page,senator);await expect(page.locator('#screen')).toContainText('SENADOR JÁ ESCOLHIDO');
  await expect(page.getByRole('button',{name:'CONFIRMA',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'CORRIGE',exact:true}).click();
  await type(page,config.candidatos.senador[1].numero);await page.getByRole('button',{name:'CONFIRMA',exact:true}).click();
  await type(page,config.candidatos.governador[0].numero);await expect(page.locator('#screen')).toContainText(config.candidatos.governador[0].vice);
  await page.getByRole('button',{name:'CONFIRMA',exact:true}).click();
  expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBeNull();
  await type(page,config.candidatos.presidente[0].numero);
  await page.getByRole('button',{name:'CONFIRMA',exact:true}).click();
  await expect(page.getByRole('heading',{name:'FIM',exact:true})).toBeVisible();
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  expect(saved.totalVotacoes).toBe(1);expect(saved.contagens.deputado_federal.nulo).toBe(1);
  await page.reload();await expect(page.getByRole('heading',{name:'Deputado federal',exact:true})).toBeVisible();
  await page.goto('/apuracao.html');await page.getByLabel('Senha',{exact:true}).fill('Teresa2026');await page.getByRole('button',{name:'Entrar no painel'}).click();await expect(page.locator('#total')).toHaveText('1');
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar votos.json'}).click();
  const download=await downloadPromise;expect(download.suggestedFilename()).toBe('votos.json');
  const exported=JSON.parse(readFileSync(await download.path(),'utf8'));expect(exported.totalVotacoes).toBe(1);
  expect(errors).toEqual([]);
});
test('layout móvel e consulta de candidatos',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  await expect(page.getByRole('heading',{name:'Deputado federal',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'tmp/urna-mobile.png',fullPage:true});
  await page.locator('summary').click();await page.getByRole('searchbox').fill(config.candidatos.deputado_federal[0].nome);
  await expect(page.locator('#candidate-guide')).toContainText(config.candidatos.deputado_federal[0].nome);
});
test('falha de armazenamento não mostra FIM nem perde escolhas',async({page})=>{
  await page.goto('/');await expect(page.getByRole('heading',{name:'Deputado federal',exact:true})).toBeVisible();
  await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new Error('Sem espaço');};});
  for(let i=0;i<6;i++){await page.getByRole('button',{name:'BRANCO',exact:true}).click();await page.getByRole('button',{name:'CONFIRMA',exact:true}).click();}
  await expect(page.locator('#error')).toContainText('Não foi possível salvar');
  await expect(page.getByRole('heading',{name:'Presidente',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'FIM',exact:true})).toHaveCount(0);
});
