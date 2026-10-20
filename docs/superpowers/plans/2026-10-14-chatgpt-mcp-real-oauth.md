# Conexão OAuth privada ChatGPT ↔ DeepHarness — Implementation Plan

> **For agentic workers:** usar superpowers:executing-plans para executar incrementalmente. Cada gate requer evidência; esta entrega é planejamento, não autorização de implantação.

**Goal:** conectar uma identidade humana autenticada pelo Keycloak a uma única consulta autorizada de Agent Teams existentes.
**Architecture:** reutilizar os adaptadores internos e serviços oficiais DSH. A autenticação OAuth é independente do transporte protegido; grants exatos e revogação são verificados no servidor antes e após fronteiras assíncronas.
**Tech Stack:** DSH 0.2.1-alpha.2, Cordis 4.0.5-alpha.1, MCP SDK 1.30.0, Node 22 em laboratório, Keycloak 26.8.0 como versão candidata de laboratório; PostgreSQL 16 no teste isolado.
**Spec:** docs/PROJECT_SOURCE.md, AGENTS.md, integrations/chatgpt-mcp/KEYCLOAK_OAUTH_ADOPTION_GATE.md e SECURITY_PREPRODUCTION_REVIEW.md. Instruções do proprietário desta missão prevalecem.

## Global Constraints

- HEAD de evidência: 91ddc1f5ad2a7bdb9e4180d00b1e6fc170541653; PR #4 Draft, sem merge.
- Cinco workflows GREEN; Keycloak run 38520367275/job 115708437240 contém KEYCLOAK_HUMAN_OFFICIAL_DSH_READ_MATCH e KEYCLOAK_INDEPENDENT_WRONG_PKCE_DENIED.
- O teste combinado usa projeção oficial descartável com Lead e quadro vazio; dependências agents/subagents inertes. Revogação combinada em memória; PostgreSQL comprovado separadamente.
- Somente dsh_read_agent_team; sem criar/retomar sessões, executar agentes, alterar tarefas ou conceder wildcard.
- Principal = issuer#sub verificado; audiência string exatamente igual ao recurso MCP; RS256, token_use=access, jti, iat, exp e agent-teams:read obrigatórios.
- allowMissingNotBefore: true é exceção explícita já testada; nbf presente continua validado. Não inventar timestamps nem relaxar outros controles.
- Sem tokens, códigos, cookies, senhas ou resultados privados em logs, memória, artefatos ou manifests.
- Não fazer polling da CI. Commit incremental na branch da PR #4; proprietário comunica GREEN/RED.
- Produção, VPS, ingress/DNS, endpoint remoto, credenciais persistentes, migração e merge dependem de autorização posterior. Este plano não executa nenhuma dessas ações.

## Review Focus

| Condição | Comportamento exigido | Gate |
| --- | --- | --- |
| Callback/issuer divergente | Recusar login/exchange | 1 |
| Requisição legítima sem Origin | Política explícita comprovada, sem liberar origens maliciosas | 2 |
| Reinício/DB indisponível | Grants preservados corretamente ou acesso negado; nunca fallback permissivo | 3 |
| Logout do emissor | Não prometer revogação instantânea sem mecanismo testado | 3 |
| Sessão Lead ausente/substituída | Negar sem retomar agente ou devolver projeção antiga | 4 |

## Requisitos oficiais consultados em 2026-10-14

ChatGPT exige metadata do recurso e emissor, PKCE S256 e propagação de resource. Usar cliente pré-registrado inicialmente. Copiar o redirect URI exato da gestão da conexão; o callback estável https://chatgpt.com/connector_platform_oauth_redirect depende das condições de identificação do emissor, incluindo iss nas respostas. Sem essas condições, pode haver callback específico da conexão. Não adivinhar callback_id. Fonte: https://developers.openai.com/plugins/build/auth

Para servidor privado, a documentação descreve proxy HTTPS com mTLS OpenAI para identificar o cliente, mantendo OAuth para o usuário; Streamable HTTP e uma URL estável são requisitos do transporte remoto. Secure MCP Tunnel é alternativa documentada para conexão privada, cuja disponibilidade e compatibilidade nesta conta ainda não foram verificadas. Fonte: https://developers.openai.com/plugins/build/mcp-server

## Mapa de arquivos e reutilização

Existentes: adapters/prepare-official-dsh-team-read.mjs, mcp-read-request-context.mjs, rotating-jwks-transport-authenticator.mjs, pinned-oidc-discovery.mjs, dns-pinned-oidc-fetcher.mjs, postgres-token-revocation.mjs, scoped-read-grants.mjs, mcp-oauth-http-gate.mjs, mcp-oauth-resource-metadata.mjs, register-scoped-team-read-tool.mjs; todos sob integrations/chatgpt-mcp/.
Schema existente: integrations/chatgpt-mcp/sql/001_token_revocations.sql.
Testes existentes: integrations/chatgpt-mcp/initialized-host-probe/ e keycloak-lab/.
Documentos novos propostos abaixo são entregáveis futuros; configurações reais não estão definidas neste plano.

### Gate 1 — Contrato da conexão e cliente OAuth

**Files:** criar integrations/chatgpt-mcp/OAUTH_CONNECTION_CONTRACT.md; ampliar keycloak-lab/human-pkce-probe.mjs e realm.json somente no laboratório.
**Interfaces:** definir valores não secretos issuer, resource, redirectUri, clientId, tokenEndpointAuthMethod e originsPolicy. Produzir um contrato revisável, sem URL fictícia apresentada como endpoint real.

- [ ] Identificar a interface de conexão disponível na conta e copiar seu callback exato; registrar mecanismo suportado para cliente pré-registrado. Se indisponível, registrar bloqueio.
- [ ] Fixar issuer e resource HTTPS canônicos antes de registrar o cliente; nenhum hostname real é escolhido/alterado automaticamente.
- [ ] Definir cliente dedicado: authorization_code + S256; inicialmente sem refresh/offline_access. Preferir cliente público com none apenas se a interface e política do emissor comprovarem suporte. Se exigir segredo, manter entrega no gerenciador apropriado após autorização.
- [ ] Testar callback exato e callback divergente, state incorreto, iss ausente/incorreto quando anunciado, resource errado no auth/token endpoint, scope insuficiente, replay e PKCE com código independente.
- [ ] Exigir audiência exata, subject individual e ausência de privilégio implícito por scope. Rodar laboratório Keycloak e preservar marcadores sem segredos.
- [ ] Commit + documentação; aguardar GREEN. Não ativar DCR anônimo ou CIMD experimental para contornar incompatibilidade.

### Gate 2 — Transporte protegido e composição interna

**Files:** criar integrations/chatgpt-mcp/PRIVATE_TRANSPORT_DESIGN.md e initialized-host-probe/private-transport-contract.test.mjs; reutilizar mcp-oauth-http-gate.mjs e register-scoped-team-read-tool.mjs.
**Interfaces:** createMcpOAuthHttpGate({resource, issuer, authenticateTransport}).handle(req,res,dispatch); prepareOfficialDshTeamRead({workspaceRegistry,sessionProjections,resolveLiveLeadSession,authenticateTransport,grants,allowedOrigins}) retorna runHttpRequest/readTeam.

- [ ] Revisar proxy HTTPS com mTLS de ponta a ponta ou túnel privado suportado; registrar método selecionado e ponto real de verificação. Não confiar em header de certificado enviado pelo cliente.
- [ ] Mapear /.well-known/oauth-protected-resource/mcp e /mcp ao recurso canônico; nenhum endpoint Web DSH, BasicAuth ou cookie deve servir como autenticação MCP.
- [ ] Testar no laboratório: metadata pública sem dados, 401 + WWW-Authenticate, certificado ausente/inválido, certificado válido sem OAuth, Host divergente, requests/session IDs sem identidade válida.
- [ ] Confirmar os cabeçalhos reais do cliente sem capturar credenciais. Testar política de Origin: origem permitida, maliciosa e ausência. A composição atual não expõe allowMissingOrigin; qualquer suporte necessário deve ser alteração separada, justificada e testada, mantendo grants/OAuth/mTLS.
- [ ] Provar TLS/SNI real e egress DNS fixado, redirects privados, resolver/proxy e IPv6; doubles existentes não bastam. Aplicação de firewall/ingress permanece posterior à autorização.
- [ ] Definir limites propostos do canário: uma consulta de dados, timeout 10s, uma consulta simultânea; confirmar compatibilidade com lifecycle initialize/tools-list sem contar essas mensagens como leitura de equipe.
- [ ] Commit + CI isolada; aguardar GREEN. Não abrir listener remoto.

### Gate 3 — Revogação e grants persistentes

**Files:** criar initialized-host-probe/persistent-human-host-e2e.test.mjs e integrations/chatgpt-mcp/PERSISTENT_AUTH_RUNBOOK.md; reutilizar postgres-token-revocation.mjs, sql/001_token_revocations.sql e .github/workflows/chatgpt-mcp-postgres-revocation-integration.yml.
**Interfaces:** createPostgresRevocationBackend({query,timeoutMs:1000}) retorna isRevoked/revoke; query(sql,params,{signal,readFromPrimary}) deve executar no primary. createRotatingJwksTransportAuthenticator({discovery,audience,isRevoked,requiredScope:'agent-teams:read',allowMissingNotBefore:true}) alimenta a composição interna.

- [ ] Escrever teste que liga JWT humano real + host oficial + backend PostgreSQL no mesmo fluxo descartável; confirmar negação durante e após revogação e em nova instância de cliente.
- [ ] Exercitar reinício real do DB em laboratório, timeout, indisponibilidade e resposta ambígua; nunca usar cache negativo ou revogação em memória como fallback.
- [ ] Definir grants iniciais em configuração autoritativa versionada pelo operador, com tuplas exatas; reidratar no reinício e provar remoção sem reaparecimento. Não criar grants por login nem identidade recebida de tool.
- [ ] Revisar separação de acesso SQL entre leitura operacional e administração da revogação, migração, retenção, backup e recuperação; credenciais reais só após autorização.
- [ ] Política proposta para primeiro canário: access token de até 300s, sem refresh; não tratar logout Keycloak como revogação automática. Exigir revogação coordenada testada ou documentar janela residual de até o TTL.
- [ ] Commit + CI descartável + resultados; aguardar GREEN antes de provisionar DB.

### Gate 4 — Host real e consulta controlada

**Files:** criar integrations/chatgpt-mcp/OWNER_OAUTH_CANARY_RUNBOOK.md e initialized-host-probe/existing-lead-read-canary.test.mjs.
**Interfaces:** resolver somente sessions.get(id) da instância oficial existente; nunca cold-resume. Revalidar sessão e referências de serviço após await antes de retornar dados.

- [ ] Reconfrontar artefato executável/versão, PR base/main e serviço oficial que hospedará o plugin. Imagem bootstrap npm atual não incorpora alterações do source: provar empacotamento do adaptador antes de propor deploy.
- [ ] Testar host replacement, Lead removido/trocado, detached workspace, revogação concorrente e equipe com membros/tarefas representativos; verificar que nenhuma ação de agente ocorre.
- [ ] Preparar ficha para aprovação: artefato/digest, issuer/resource/callback/client, grant exato, datastore, regra de transporte, alvo, duração e rollback. Não incluir segredos nem IDs privados em documento público.
- [ ] Após autorização posterior, escolher uma equipe existente permitida e validar baseline pelo operador. Login humano ocorre na interface normal; não transportar sessão humana para ferramentas.
- [ ] Fazer uma chamada dsh_read_agent_team limitada ao workspace/Lead autorizado; comparar projeção, IDs e contador de ações antes/depois. Não usar solicitações de escrita.
- [ ] Testes negativos de autorização permanecem obrigatórios no laboratório; qualquer tentativa sobre dados reais adicionais exige escopo previamente aprovado.
- [ ] Aprovar resultado só com evidência real do cliente, grants e zero execução/mutação; registrar falhas como bloqueio, nunca como compatibilidade presumida.

### Gate 5 — Rollback e encerramento

**Files:** mesmo OWNER_OAUTH_CANARY_RUNBOOK.md e memória privada projects/deepseek-harness.md.

- [ ] Antes do canário, validar kill switch do transporte MCP, revogação do grant e token, bloqueio do cliente e retorno ao artefato/configuração anterior. Preservar volumes e dados DSH.
- [ ] Executar rollback em falha de login, audiência/issuer divergente, negação inesperada, inconsistência de revogação, vazamento em logs ou alteração de sessão/equipe.
- [ ] Confirmar acesso MCP negado após rollback, sem afetar DSH Web ou outros serviços. Não apagar volumes nem executar prune.
- [ ] Registrar commit, CI, artefato, gates, limitações e rollback observado em documentação e wmemory. Nenhum segredo ou conteúdo privado da equipe.
- [ ] Conexão aprovada apenas para leitura delimitada; ampliar usuários, equipes, ferramentas ou produção geral requer nova decisão.

## Decisão desta entrega

Plano preparado. Gates 1–3 podem avançar por documentos/testes isolados dentro do escopo autorizado. Execução externa dos gates 4–5 depende de autorização posterior do proprietário. Nenhum recurso de produção foi provisionado; callback, URLs reais, conta de conexão, acesso mTLS e infraestrutura DB permanecem dependências a verificar.
