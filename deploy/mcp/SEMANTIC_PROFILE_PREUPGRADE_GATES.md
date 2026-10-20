# DeepHarness — pré-upgrade do perfil persistente (PREPARE-ONLY)

Estado: **procedimento de revisão e inventário, SEM backup real, SEM clone real, SEM deploy.**
Este documento complementa \`SEMANTIC_BACKEND_UPGRADE_PREPARE_ONLY.md\`, preservando
a revisão já publicada da PR #17 e o digest GHCR já qualificado.

## Ponto de partida comprovado (2026-10-20)

- PR #17 continua Draft no SHA \`ddc94345d552dbda4f76e8571cb74faf89126e8c\`;
  Stage D #42 e Bootstrap #503 SUCCESS. Backend \`lab.7\` foi publicado sem
  recompilação como \`ghcr.io/oaranha/deepharness-mcp@sha256:860a793b251a4b5de6a142affd5967e77f6314fd9534053ba529aaac0d253169\`.
- \`deepharness-read\` é target do **28server**, transport Agent Mesh, **read-only**;
  nenhuma chamada \`docker exec\` ou escrita é autorizada nesse target. O operador
  poderá executar apenas o diagnóstico de leitura, após revisar seus comandos.
- \`deepharness-web-1\` continua na imagem existente de configuração Docker
  \`sha256:2483c85cc3fbe6172bf284e67859572b8b6b5dc75bfea11ae160298f7202a62f\`.
  Seu volume de perfil **real** é \`deepharness_dsh_data\` montado em \`/data/dsh\`
  e workspace real \`deepharness_dsh_workspace\` montado em \`/workspace\`;
  a configuração MCP é um bind separado. Nenhum deles é um fixture.
- O operador relatou pacote MCP presente, \`semanticBridge\` ausente,
  handler e host semântico ausentes. A **versão exata** do pacote instalado
  ainda NÃO foi lida; não assumir \`lab.4\`/ \`lab.5\`.

## Gate A — inventário somente leitura do perfil real

Arquivo: \`deploy/mcp/profile-preupgrade-readonly.review.sh\`, restrito a
\`root@28server\` e contêiner fixo \`deepharness-web-1\`, invocando Node como
UID 1000 sem shell nem gravação. Exibe somente versões delimitadas, hashes
SHA256 de arquivos de metadados e estado resumido da rota/handler.
**Nunca** imprime conteúdo do perfil, patches, manifestos, variáveis, chaves,
workspaces ou conversas.

O resultado correto é \`DSH_PREUPGRADE_PREFLIGHT=READ_ONLY_COMPLETE\`,
que atesta **somente o levantamento**: \`BACKUP=NOT_PERFORMED\` e
\`UPGRADE=NOT_PERFORMED\` continuam explícitos. \`READ_ONLY_COMPLETE\` não
autoriza alterar runtime ou publicar endpoint. Se versão, hashes,
perfil desativado ou arquivo estiver inesperado, sinalizar \`NO_GO\` para
o plano de upgrade e investigar sem escrever no ambiente.

Este diagnóstico não é executável pelo target MCP read-only porque
\`allowedDockerExecContainers=[]\`: a execução precisa do operador
na VPS real, se e quando ele quiser avançar o gate.

## Gate B — backup consistente e recuperação em cópia (PRECISA AUTORIZAÇÃO SEPARADA)

**Ainda não executar.** Antes, aprovar capacidade/espaço, exclusividade de
processos do perfil, janela de consistência e destino com controle de acesso.
Um \`cp -a\` de arquivos JSONL com o DSH escrevendo ativamente pode produzir
snapshot inconsistente. Para volume em uso, exigir snapshot de filesystem
consistente comprovado, ou janela com writers quiescentes/verificados.
Não parar a Web, Agent Mesh, grants DB nem containers por pressuposição.

Abrangência mínima: \`deepharness_dsh_data\` e
\`deepharness_dsh_workspace\` como unidades distintas, os manifestos do
perfil \`web\` (incluindo lock e patches), revisão/digest da imagem existente
e referência imutável da stack atual. Capturar configuração operacional
e segredos somente sob custódia do operador, **fora** de repositórios,
CI e conversa. Não montar backups privados em GitHub Actions.

Para restaurar num clone, verificar primeiro consistência de arquivos,
metadados/ownership, ausência de symlinks escapando da raiz do clone,
hashes do manifest/lock/patch, SessionController JSONL e configuração
inalterada. Demonstração de rollback deve ser no **clone descartável**,
sem bind-mount do volume original com qualquer escrita.

## Gate C — ensaio exclusivo em clone, pacote lab.7 (PRECISA AUTORIZAÇÃO SEPARADA)

Exigir identificação do perfil original no Gate A. Validar cópia em runtime
separado \`--network none\`, root filesystem read-only, tmpfs mínimo, nenhuma
porta publicada, modelo desativado e os volumes originais NÃO montados.
Apenas no clone isolado usar CLI oficial offline para instalar o tarball
\`lab.7\` cuja integridade já foi aprovada em Stage D #42. Não instalar
um segundo DSH ativo ou qualquer plugin na Web original.

Comparar \`before/after\`: patches de usuário, outros bundles, composição
Cordis (continua disabled), DSH \`0.2.1-alpha.2\` inalterado, importações
\`./private-semantic-http-handler\` e \`./semantic-bridge\` e hashes
do tarball instalado. O contrato histórico
\`upgrade-existing-profile-contract.mjs\` **presume \`lab.4\`** e
\`private-profile-rehearsal.mjs\` contém SHA de uma release antiga:
não tratá-los como prova de compatibilidade com baseline desconhecida.

O rollback em clone precisa restaurar versão e lock/patch anteriores e
provar que dados e sessões sintéticas permanecem legíveis. **Só depois**
propor troca de backend real por digest + pacote persistente em pares,
com aprovação de deploy separada. Deixar \`semanticBridge\` desativado
durante essa troca.

## Proibições mantidas

Sem \`docker system prune\`, \`docker compose up\`, Portainer changes,
shell no target read-only, upgrade de DSH para rc.2, publicação de
grants, alteração de Keycloak, abertura de porta, socket de relay,
\`DSH_SEMANTIC_ENABLED\`, concessão de grants ou mensagem a Leads.

O diretório \`/run/wandora/deepharness-semantic\` foi provisionado
em gate anterior, mas \`/run\` é volátil e o socket permanece ausente.
Isso não interfere no inventário do perfil.
