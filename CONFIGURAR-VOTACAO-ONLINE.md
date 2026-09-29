# Ativar a votação automática entre PCs

O código está pronto, mas precisa de um banco na sua conta. Esta configuração é feita uma vez. Depois, basta abrir o mesmo link da Vercel em cada PC: votos e encerramento serão compartilhados automaticamente.

Até terminar os passos abaixo, o site permanece no modo local. Os votos antigos de cada navegador são preservados, mas **não entram automaticamente na votação central**. Faça a mudança entre atividades, depois de exportar eventuais votos que queira guardar. O banco começa com zero votos.

## 1. Criar o banco no Supabase

1. Acesse [Supabase](https://supabase.com/dashboard) e entre na sua conta ou crie uma.
2. Clique em **New project**. Se for solicitado, crie uma organização.
3. Dê ao projeto o nome **Urna Teresa**.
4. Defina uma senha forte para o banco e guarde-a. Essa senha é diferente da senha do painel da escola.
5. Selecione uma região próxima, como São Paulo quando disponível, e crie o projeto. Aguarde a preparação terminar.

## 2. Preparar as tabelas

1. Dentro do projeto, abra **SQL Editor** e crie uma consulta (**New query**).
2. Abra [supabase/setup.sql](https://github.com/gonzales-jpg/Urna-Teresa/blob/main/supabase/setup.sql) no GitHub. Use a opção de copiar o conteúdo do arquivo.
3. Cole todo o conteúdo no editor do Supabase e clique em **Run**.
4. Aguarde a mensagem de sucesso. Não precisa entender ou editar os comandos. Executar novamente não apaga os votos nem reabre uma votação encerrada.

## 3. Copiar os dados de conexão

No projeto Supabase, use **Connect** ou as configurações de API para localizar:

- **Project URL**: endereço com formato `https://SEU-PROJETO.supabase.co`.
- **Secret key**: chave de servidor que começa com `sb_secret_`, disponível na área de API Keys. Se o projeto apresentar somente as chaves antigas, a chave `service_role` também é aceita. **Não use a chave publishable/anon.**

Essa chave dá acesso ao banco. Não coloque no GitHub, no HTML ou em mensagens. Copie diretamente para o campo de variável de ambiente da Vercel, conforme o próximo passo.

## 4. Configurar a Vercel

Na Vercel, abra o projeto **Urna-Teresa → Settings → Environment Variables**. Adicione as variáveis abaixo para o ambiente **Production**:

| Nome | Valor |
| --- | --- |
| `SUPABASE_URL` | O Project URL copiado do Supabase |
| `SUPABASE_SECRET_KEY` | A Secret key copiada do Supabase |
| `ADMIN_PASSWORD` | A senha de acesso ao painel da escola |
| `SESSION_SECRET` | Um valor aleatório com pelo menos 32 caracteres, diferente das outras senhas |
| `VOTACAO_CENTRAL` | `true` |

Para gerar o `SESSION_SECRET`, você pode usar o gerador de senhas de um gerenciador de senhas, com 40 ou mais caracteres. Quem já tem Node no computador também pode executar `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` no terminal e copiar o resultado.

A senha antiga do painel apareceu em arquivos de testes da versão local do repositório. Para o painel online, configure uma nova senha em `ADMIN_PASSWORD`; não a escreva em arquivos públicos. Não haverá link de esqueci minha senha.

Depois de salvar todas as variáveis, vá a **Deployments**, abra o menu da publicação mais recente e clique em **Redeploy**. Aguarde ficar pronta. A variável `VOTACAO_CENTRAL` é aplicada durante a publicação, portanto o redeploy é necessário.

Não configure previews para usar o banco real da votação. Para testar uma publicação de preview, use um projeto Supabase separado, com suas próprias variáveis.

## 5. Conferir nos PCs

1. Abra o mesmo endereço de produção em ambos os PCs e recarregue as páginas antigas.
2. Entre no painel: ele deve mostrar **VOTAÇÕES EM TODOS OS PCs**. Se disser “nesta urna”, a publicação ainda está no modo local.
3. Faça uma votação completa no primeiro PC. Espere a tela **FIM**.
4. Confira o painel no outro PC. O total é atualizado a cada cinco segundos.
5. Teste o segundo PC. O total deve aumentar novamente.

Testes contam como votos. Para uma atividade real, use uma eleição nova ou um banco separado; não misture votos de teste com os dos alunos.

## Durante a atividade

- Use internet nos dois PCs. Não existe gravação local de emergência no modo central.
- Se o envio falhar, mantenha a aba aberta e aperte **CONFIRMA** novamente. O reenvio usa a mesma identificação e não duplica votos. As escolhas ficam bloqueadas enquanto o envio está pendente; recarregar a mesma aba permite recuperar o envio. **Não feche uma aba com envio pendente nem atenda outro aluno antes do FIM.**
- Ao terminar todos os alunos, entre no painel e encerre a votação. Isso vale para todos os PCs. As telas detectam o encerramento em até cinco segundos; o banco bloqueia novos registros imediatamente na confirmação do encerramento.
- Resultados por candidato são liberados somente após encerrar. O JSON central pode ser exportado como backup, sem necessidade de importação entre PCs.
- A votação não identifica alunos nem impede que uma mesma pessoa vote várias vezes. O acesso físico às urnas deve continuar supervisionado. A API de voto é pública; para acesso restrito a dispositivos autorizados, será necessária uma etapa adicional de credenciamento das urnas.

## Se aparecer erro

- **Conexão central não configurada**: confira se todas as variáveis estão em Production, incluindo um `SESSION_SECRET` com no mínimo 32 caracteres, e faça Redeploy.
- **Banco indisponível ou ainda não configurado**: confira se o projeto Supabase está ativo, se o SQL foi executado, se o Project URL está correto e se a chave é de servidor.
- **Muitas tentativas**: aguarde 15 minutos antes de tentar a senha novamente. A proteção é compartilhada por endereço de rede.
- **Urna encerrada**: apagar o armazenamento do navegador não reabre a votação central. Não existe botão de reabertura nesta versão. Para uma nova atividade, prepare outro identificador de eleição e outra linha no banco.

Referências: [chaves de API do Supabase](https://supabase.com/docs/guides/api/api-keys), [variáveis de ambiente da Vercel](https://vercel.com/docs/environment-variables).
