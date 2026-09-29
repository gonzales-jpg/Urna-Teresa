# Urna Escola — São Paulo, 2026

Simulação escolar em HTML, CSS e JavaScript puro, sem React e sem build de produção. Interface responsiva inspirada na urna, com teclado físico ou virtual, som opcional, correção, branco, nulo e legenda para deputados.

## Executar

Na pasta do projeto, execute `python -m http.server 3000` e abra http://localhost:3000. Também é possível usar `npm.cmd start` no Windows. Não abra o HTML diretamente por `file://`: a aplicação carrega o JSON por HTTP.

## Publicar na Vercel

Importe o repositório como projeto estático, com preset **Other**, sem comando de build, e diretório de saída `.` (raiz). Não precisa de React nem de variáveis de ambiente. O arquivo `vercel.json` configura cabeçalhos básicos. O projeto está preparado para publicação; nenhum deploy foi realizado automaticamente.

## Arquivos

- `index.html`: votação em seis etapas.
- `apuracao.html`: apuração deste navegador e download de `votos.json`.
- `css/styles.css`: layout responsivo.
- `js/engine.js`: classificação e contagem dos votos.
- `js/storage.js`: configuração, persistência e exportação.
- `js/app.js` e `js/admin.js`: comportamento das páginas.
- `data/candidatos.json`: base oficial importada para SP e presidência nacional.
- `data/votos.json`: modelo vazio do formato de contagem. O navegador não escreve neste arquivo.
- `assets/candidatos/`: fotos oficiais dos candidatos importados.
- `scripts/importar_tse.py`: importação reproduzível.

## Fonte e atualização dos candidatos

Fonte: [Dados Abertos do TSE — Candidatos 2026](https://dadosabertos.tse.jus.br/dataset/candidatos-2026). Os metadados `geracaoTse`, `importadoEm`, `fonte` e `criterio` ficam no JSON.

O importador cruza `consulta_cand` e `consulta_cand_complementar` pelo identificador do candidato. Seleciona primeiro turno, SP para cargos estaduais e BR para presidência, `ST_CANDIDATO_INSERIDO_URNA = SIM` e não substituído. Vices e suplentes são associados pelo número, UF e coligação. Números ativos duplicados e vices ausentes/ambíguos interrompem a importação, preservando o cadastro anterior. Campos como CPF, e-mail, nascimento e título eleitoral não são copiados.

Inclui candidaturas inseridas na urna que estão sob recurso. A situação aparece no cadastro; a apuração escolar conta a escolha, sem simular decisões judiciais ou destinação oficial dos votos. Esta lista é uma fotografia da base importada, não uma sincronização automática. Confira e atualize antes da atividade.

Atualizar candidatos e fotos: `python scripts/importar_tse.py --fotos`. A opção sem `--fotos` importa apenas os dados. A importação não altera votos existentes. Não troque a base durante uma votação; para uma nova atividade, altere o `id` da eleição, que separa o armazenamento das outras atividades.

## Regras da simulação

Ordem: deputado federal (4 dígitos), deputado estadual (5), senador primeira vaga (3), senador segunda vaga (3), governador e vice (2), presidente e vice (2). A configuração também adapta o rótulo estadual para distrital quando a UF é DF.

BRANCO requer CONFIRMA. Número completo sem candidato e sem legenda válida é nulo. Para deputados, dois dígitos de partido com candidatura no cargo permitem legenda; um número completo inexistente com prefixo de partido habilitado também vai para legenda. Número incompleto não avança. A segunda vaga exige senador diferente da primeira; brancos e nulos podem se repetir. Ao final, FIM é exibido somente após salvar as seis escolhas. Próximo aluno inicia uma nova votação.

[Referência de ordem e duas vagas — TSE](https://www.tse.jus.br/comunicacao/noticias/2026/Marco/eleicoes-2026-conheca-a-ordem-de-votacao-na-urna-eletronica).

## Votos e limitações desta etapa

Os dados são contagens agregadas por cargo em `localStorage`, sem identidade ou vínculo entre as seis escolhas do aluno. Só a votação completa é contabilizada. As escolhas em andamento ficam na memória; recarregar ou fechar a página as descarta. A aplicação avisa antes de sair durante a votação. Web Locks serializa a gravação entre abas da mesma origem; requer HTTPS ou localhost em navegador moderno.

No painel, **Exportar votos.json desta urna** baixa uma fotografia das contagens locais, com identificador da urna e indicação de encerramento. Faça backups durante a atividade. Limpar dados do navegador remove a base local. Cada computador, navegador, perfil e domínio possui sua própria base; não há sincronização automática.

O painel solicita a senha definida pela escola, sem recuperação ou redefinição. A verificação compara um hash no JavaScript e a liberação fica apenas na memória da página: sair ou recarregar exige a senha novamente. Isso é uma barreira de interface, não autenticação segura: alguém com conhecimento de ferramentas de desenvolvimento pode contornar a tela e acessar os dados locais. Não existe controle de voto único por aluno. Use em computadores supervisionados. Proteção efetiva e operação centralizada exigem API, banco persistente, autenticação administrativa e encerramento validado no servidor, mantendo o frontend HTML/CSS/JS.

## Encerramento e resultado final

Entre no painel com a senha e clique em **Encerrar votação**. O diálogo pede confirmação, pois a operação bloqueia novos votos neste navegador e não há botão de reabertura. Termine o atendimento do último aluno antes de confirmar: uma votação incompleta não será registrada. O encerramento é persistido no armazenamento local, notifica outras abas e é conferido novamente no momento de gravar, sob o mesmo bloqueio usado pelos votos.

Depois do encerramento, o resultado é exibido por cargo, com contagens de candidatos, legendas, brancos e nulos. O botão **Ver resultado final** permite consultá-lo novamente. A contagem é educativa; não calcula distribuição proporcional de cadeiras nem proclama eleitos.

## Usar dois PCs

1. Abra a mesma versão do sistema nos dois PCs, pela Vercel em HTTPS ou por localhost em cada computador. Um endereço HTTP da rede local não oferece as APIs de contexto seguro necessárias.
2. Cada PC recebe e armazena seus próprios votos. Encerrar um não encerra o outro.
3. Ao finalizar, entre no painel e encerre a votação em cada PC.
4. Exporte o JSON de cada PC e mantenha uma cópia como backup.
5. Em um dos PCs, use **Importar JSON de outro PC** para selecionar o arquivo do segundo. O resultado passa a somar a urna local e a importada.

Uma mesma urna não pode ser importada duas vezes; arquivos de outra eleição, sem encerramento ou com contagens inconsistentes são rejeitados. As importações ficam salvas no navegador. O exportador continua exportando apenas a urna local, evitando repassar totais já somados como se fossem uma terceira urna. Os arquivos não têm assinatura digital e podem ser alterados externamente; transporte os backups sob responsabilidade da escola.

## Validação

`npm.cmd install` instala somente ferramentas de desenvolvimento. Execute `npm.cmd test` para as regras e `npx.cmd playwright install chromium` seguido de `npx.cmd playwright test` para os testes de navegador. Testes de navegador usam contexto isolado e não alteram os votos do navegador da escola. Abrangem seis etapas, branco/nulo, correção, bloqueio de senador repetido, vices, persistência, exportação JSON, busca, viewport móvel e falha de armazenamento.
