# DeepHarness — preparação de atualização do backend semântico

**Estado: PREPARE-ONLY; SEM AUTORIZAÇÃO DE PUBLICAR, INSTALAR OU ATIVAR.**
Escopo autorizado pelo proprietário em 2026-10-20: preparar artefato
imutável, validação do pacote `lab.7`, plano de backup/rollback e gates
de promoção. Não executar operação no Portainer, não tocar no perfil
persistente do `28server`, não alterar runtime.json, Agent Mesh, Keycloak,
grants, relay ou enviar mensagens a Leads.

## Evidência real que motivou este plano

O operador em `root@28server` fez leitura estrita dentro do contêiner
`deepharness-web-1` e retornou:

```text
DSH_SEMANTIC_PACKAGE=PRESENT
DSH_SEMANTIC_HANDLER=ABSENT
DSH_OPERATIONAL_HOST_SUPPORT=ABSENT
DSH_SEMANTIC_ROUTE=ABSENT
DSH_CLIENT_AUTH_DIAGNOSTIC=COMPLETE
```

Assim, **não é seguro apenas acrescentar `semanticBridge.enabled`
ao runtime.json**: a biblioteca e o host instalados no contêiner não
fornecem o handler. O host operacional atual permanece em execução e
o banco de grants estava saudável na última consulta MCP.

Na consulta anterior o operador também confirmou o certificado TLS do
servidor `deepharness-mcp-backend` via CA local, finalidade sslserver e
nome DNS, válido até 2027-10-15. A identidade/certificado cliente
isolados, a imagem candidata local do relay e o diretório Unix com
permissões controladas foram preparados em gates anteriores; **o
relay e o socket não foram iniciados**. Esses recursos não exigem
reprovisionamento. Não registrar conteúdos PEM, segredos ou caminhos
de chaves neste documento público.

## Contrato da imagem e pacote candidatos

- **Branch alvo:** PR #17,
  `feat/remoteops-semantic-bridge-lab6-20261019`; manter Draft.
  Depende da PR #13 e sua cadeia ainda não integrada. Não mesclar
  isoladamente na `main`.
- **Base do candidato Stage D:** imagem publicada anteriormente
  `ghcr.io/oaranha/deepharness-mcp@sha256:2483c85cc3fbe6172bf284e67859572b8b6b5dc75bfea11ae160298f7202a62f`,
  que contém DSH **0.2.1-alpha.2** e host MCP/pg existentes.
  Não trocar silenciosamente para DSH **0.2.1-rc.2** apenas porque
  Bootstrap #492 passou em uma imagem CI separada.
- **Pacote-alvo:** `@wandora/deepharness-chatgpt-mcp-read@0.1.0-lab.7`,
  que exporta `./private-semantic-http-handler`,
  `./semantic-bridge` e `./pg-read-query`.
  A presença do pacote pelo nome **não** prova que o handler novo
  esteja instalado.
- **Evidência anterior:** Stage D #36 no commit
  `f0fdfaee738d2df7480c894fe95f2e8df77ce7be` passou
  `pg-primary` e `candidate`. O artifact de candidato
  `stage-d-integrated-candidates-f0fdfaee738d2df7480c894fe95f2e8df77ce7be`
  estava disponível em GitHub Actions. Esse artefato histórico é
  **evidência**, não uma imagem autorizada para produção.
- **Nova qualificação:** `deploy/mcp/verify_semantic_backend_review.py`
  audita offline, em conjunto, `source-head.txt`, `source-tree.txt`,
  `EVIDENCE_SHA256SUMS`, `SHA256SUMS`, `packed-files.json`,
  o conteúdo SHA256 de cada arquivo do tarball `lab.7`,
  os exports do handler e a imagem candidata `linux/amd64`
  com label de revisão do commit e `CMD` desativado.
  `deploy/mcp/test_verify_semantic_backend_review.py` cobre entradas
  sintéticas modificadas, arquivo sem handler e portas inesperadas.
  A workflow Stage D exige resultado `SEMANTIC_BACKEND_ARTIFACT=GREEN`
  **antes** de publicar o artefato de CI. Isso não inicia serviço.
  O teste não estabelece assinatura criptográfica do release:
  a confiança depende da origem e controles da execução GitHub Actions.
- **Identidade do artefato:** `docker image inspect .Id` é ID de
  configuração local, **não é** um manifesto `repo@sha256`
  publicado e verificável no registro. Não usar ID local como digest
  de Portainer.

## Gates para liberação futura, em ordem

1. **CI e proveniência.** Exigir Bootstrap + Stage D no MESMO SHA
   revisado, testes nativos e do perfil descartável, checks de hashes,
   tarball `lab.7` e imagem com `MCP_CANDIDATE_DISABLED`. Conferir
   o SHA/árvore e a integridade de download do artifact. Não inferir
   estado real da VPS a partir do CI.
2. **Perfil real somente leitura.** Antes de preparar upgrade, registrar
   em relatório *sem valores sensíveis* a versão do DSH realmente
   instalada, versão do pacote MCP e existência dos exports. Essa
   leitura ainda está incompleta: `PRESENT` não informa se é
   `lab.4`, `lab.5` ou outra versão. Conferir também que o
   host instalado é o atual, mesmo que `operational-host.mjs` da PR
   mais recente possua o suporte em fonte.
3. **Backup/restauração.** Submeter para aprovação separada o método
   de snapshot consistente do volume `deepharness_dsh_data`,
   cópia íntegra das configurações persistentes e inventário dos
   hashes/digests atuais de imagem, perfil, bundle e lockfile.
   Manter a cópia e qualquer credencial sob controle do operador,
   nunca exportar para CI/chat/Git. Provar recuperação num clone
   isolado, sem escrita no volume original.
4. **Ensaio de upgrade em clone privado.** Instalar somente o tarball
   cuja integridade foi verificada em um perfil *copiado* e isolado,
   usando a CLI oficial offline e configuração desativada. O contrato
   `upgrade-existing-profile-contract.mjs` exige preservar patch
   Cordis, composição, plugins e dependências/lock (exceto o pacote
   estritamente substituído). **Não reutilizar sem revisão**
   `private-profile-rehearsal.mjs`: ele assume `lab.4` como
   baseline e contém um SHA antigo de pacote. Se o perfil real
   divergir, resultado `NO_GO` e elaborar gate específico em clone.
5. **Publicação controlada (NÃO AUTORIZADA).** Definir um processo
   de release que consuma os exatos bytes verificados sem recompilar,
   valide o commit, a versão e o digest final do registro GHCR.
   O publicador Stage D atual está amarrado a outro commit/branch
   e **não deve ser apontado** à PR #17 por simples troca de
   parâmetros. Publicação exige decisão separada.
6. **Troca no Portainer (NÃO AUTORIZADA).** Somente após prova de
   rollback, reconciliar a stack única `deepharness`, image digest
   do backend e atualização do bundle no volume; manter
   `semanticBridge` **desativado** no primeiro restart. Exigir
   diagnóstico idêntico do host e handler novo, preservação da
   workspace, HTTPS/mTLS atual, grants e leitores. Nunca criar
   uma segunda stack, expor porta ou executar `docker system prune`.
7. **Ativação semântica (NÃO AUTORIZADA).** Como gate distinto,
   configurar pin mTLS do certificado cliente exato no backend,
   validar pin do servidor no relay e identidade OAuth/grants
   humanos por workspace, Lead e operação. Ativar capacidade
   semântica apenas para laboratório e operações de leitura;
   enviar instruções a Leads apenas após aprovação individual
   e readback independente. Um `accepted:true` é somente
   admissão na fila.

## Rollback futuro — plano, nunca execução automática

Guardar o digest anterior da imagem e snapshot íntegro do perfil
antes de qualquer mutação. Em falha pós-deploy: desabilitar
a rota semântica, **não iniciar o relay**, suspender novos grants
específicos de laboratório, restaurar **somente** o backend
e o perfil revisados como par compatível, e revalidar
Web/DB/leitura já existente. Usar o procedimento canônico do
Portainer na stack atual; não recriar volumes vazios nem mexer
nas aplicações externas. Conservar as evidências e pedir nova
aprovação antes de executar o rollback de produção.

## Estado do gate

`PREPARE_ONLY` e `NO_GO` operacional até que todos os
pré-requisitos sejam provados no SHA específico. O comando do
verificador não contém `docker pull`, `docker run`,
`docker compose`, consultas a segredos, manipulação do
`/data/dsh` nem acesso à rede. As ações de produção
dependem de autorização separada do proprietário.
