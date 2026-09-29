import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {emptyResults,tally} from '../../js/engine.js';
const config=JSON.parse(readFileSync(new URL('../../data/candidatos.json',import.meta.url)));
const key=`urna-escola:${config.id}`;
const votes=Array.from({length:6},()=>({tipo:'branco',numero:null}));
async function login(page){await page.goto('/apuracao.html');await page.getByLabel('Senha',{exact:true}).fill('Teresa2026');await page.getByRole('button',{name:'Entrar no painel'}).click();await expect(page.locator('#panel')).toBeVisible();}
async function close(page){await page.getByRole('button',{name:'Encerrar votação',exact:true}).click();await page.getByRole('button',{name:'Confirmar encerramento'}).click();await expect(page.locator('#status')).toContainText('encerrada');}
test('senha obrigatória, erro, logout e nova solicitação após recarregar',async({page})=>{
  await page.goto('/apuracao.html');await expect(page.locator('#panel')).toBeHidden();
  await page.getByLabel('Senha',{exact:true}).fill('errada');await page.getByRole('button',{name:'Entrar no painel'}).click();await expect(page.locator('#login-error')).toContainText('Senha incorreta');await expect(page.locator('#panel')).toBeHidden();
  await page.getByLabel('Senha',{exact:true}).fill('Teresa2026');await page.getByRole('button',{name:'Entrar no painel'}).click();await expect(page.locator('#panel')).toBeVisible();await expect(page.locator('#results')).toBeHidden();
  await page.reload();await expect(page.locator('#panel')).toBeHidden();
  await login(page);await page.getByRole('button',{name:'Sair do painel'}).click();await expect(page.locator('#panel')).toBeHidden();
});
test('encerramento confirmado mostra resultado e bloqueia voto em outra aba',async({page,context})=>{
  await page.goto('/');await page.evaluate(({key,data})=>localStorage.setItem(key,JSON.stringify(data)),{key,data:tally(emptyResults(config.id),votes)});
  const urna=await context.newPage();await urna.goto('/');await expect(urna.locator('[data-action="blank"]')).toBeEnabled();
  await login(page);await page.getByRole('button',{name:'Encerrar votação',exact:true}).click();await page.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(page.locator('#status')).toContainText('andamento');
  await close(page);await expect(page.locator('#results')).toBeVisible();await expect(page.locator('#combined-info')).toContainText('1 votações');
  await expect(urna.getByRole('heading',{name:'Votação encerrada'})).toBeVisible();await expect(urna.locator('[data-action="blank"]')).toBeDisabled();
  const result=await urna.evaluate(async({config,votes})=>{try{await (await import('/js/storage.js')).saveVotes(config,votes);return 'gravou';}catch(e){return e.message;}},{config,votes});expect(result).toContain('encerrada');
  await urna.reload();await expect(urna.getByRole('heading',{name:'Votação encerrada'})).toBeVisible();
  await page.screenshot({path:'tmp/painel-final.png',fullPage:true});
});
test('importação soma outro PC uma vez e rejeita arquivo inválido ou em andamento',async({page})=>{
  await login(page);await close(page);
  const data={...tally(emptyResults(config.id),votes),urnaId:'pc-2-test',encerrada:true};
  const upload=async value=>page.locator('#import').setInputFiles({name:'votos.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
  await upload({...data,encerrada:false});await expect(page.locator('#error')).toContainText('urna encerrada');
  await upload({...data,eleicao:'outra'});await expect(page.locator('#error')).toBeVisible();
  await upload(data);await expect(page.locator('#combined-info')).toContainText('1 votações concluídas em 2 urna(s)');
  await upload(data);await expect(page.locator('#error')).toContainText('já está contabilizada');
  await expect(page.locator('#combined-info')).toContainText('1 votações concluídas em 2 urna(s)');
  await page.reload();await login(page);await expect(page.locator('#combined-info')).toContainText('1 votações concluídas em 2 urna(s)');
  const download=page.waitForEvent('download');await page.locator('#export').click();const file=await download;const exported=JSON.parse(readFileSync(await file.path(),'utf8'));expect(exported.totalVotacoes).toBe(0);expect(exported.encerrada).toBe(true);
  await upload(exported);await expect(page.locator('#error')).toContainText('já está contabilizada');
});
