# Contrato revisável — conexão ChatGPT ↔ DeepHarness

Atualizado: 2026-10-14. Estado: preparação; nenhuma conexão real ou infraestrutura alterada.
Plano: docs/superpowers/plans/2026-10-14-chatgpt-mcp-real-oauth.md.

## Configuração definida

| Campo | Valor/política |
| --- | --- |
| Ferramenta | dsh_read_agent_team, sem operações de escrita |
| Fluxo | authorization_code + PKCE S256 |
| Registro inicial | Cliente pré-registrado dedicado; não ativar DCR anônimo |
| Identidade | issuer#sub do access JWT assinado, sem email/username como substituto |
| Token | RS256; issuer fixado; audience string igual ao resource; token_use=access; jti/iat/exp |
| Scope | agent-teams:read |
| nbf | Ausência permitida somente por opção explícita já revisada; valor presente validado |
| Grants | Tuplas exatas de principal/workspace/Lead; configuração autoritativa do operador |
| Transporte | Streamable HTTP; TLS e identificação do cliente independente de OAuth |
| Revogação | PostgreSQL primary em cada verificação; falha/timeout/ambiguidade negam |
| Canário proposto | Um usuário, uma equipe existente, uma consulta de dados |
| Limites propostos | Access token até 300s; sem refresh inicial; leitura 10s; concorrência 1 |
| Kill switch | Bloquear transporte MCP, revogar grants/token e restaurar artefato/configuração anterior |

Os limites são proposta, não configuração implantada.

## Valores que dependem da conexão real

| Campo | Estado e origem da informação |
| --- | --- |
| issuer HTTPS real | Ainda não provisionado/validado; não reutilizar issuer loopback do laboratório |
| resource HTTPS canônico | Ainda não definido; não assumir deep.wandora.com.br como endpoint MCP |
| redirectUri | Copiar exatamente da gestão da conexão ChatGPT; não inventar callback_id |
| clientId / método do token endpoint | Obter do registro dedicado e confirmar suporte pela interface real |
| Cliente público none ou autenticado | Resolver no gate de registro; segredo nunca em GitHub ou chat |
| Certificado mTLS / proxy ou túnel | Confirmar disponibilidade e ponto de verificação; não aceitar header de cliente como prova |
| Origin real / ausência | Observar sem registrar bearer; adaptador atual exige Origin permitido |
| Grant real | Operador seleciona principal/workspace/Lead existentes após autorização |
| PostgreSQL operacional | Backend, role, rede, segredo, backup e migração ainda não aplicados |
| Artefato executável | Bootstrap npm atual não inclui os adaptadores novos; empacotamento precisa de prova |

O contrato não aceita preencher lacunas com URLs ou credenciais presumidas. Até esses campos estarem comprovados, a conexão permanece não ativável.

## Revogação persistente no mesmo fluxo — incremento atual

keycloak-postgres-host-probe.mjs recebe em memória a requisição com JWT humano real do laboratório, usa o verificador existente e createPostgresRevocationBackend com banco descartável em 127.0.0.1:15432. Reutiliza a leitura oficial DSH com grant exato e revogação durante await. Depois exige negação em novo pool, reinicia o mesmo container PostgreSQL preservando seus dados e exige negação novamente; também verifica lookup saudável de outro token e fail-closed quando o banco para.

Marcador esperado: KEYCLOAK_OFFICIAL_DSH_POSTGRES_REVOCATION_MATCH.
CI deste incremento ainda pendente. Não caracteriza failover/backup de produção nem grants persistentes. Driver pg@8.16.3 segue o padrão existente de integração isolada e não muda o lock de aplicação; transientes não são integralmente pinados por esse comando.

## Procedimento concreto para ativação futura

1. Fechar testes isolados de PostgreSQL combinado, grants no reinício, Origin e identificação do emissor/callback.
2. Preparar pacote/digest do plugin contendo os adaptadores e instruções de secret management e rollback.
3. Apresentar os valores reais desta ficha e a alteração exata de infraestrutura para autorização do proprietário.
4. Só após autorização: provisionar cliente/banco/transporte e configurar a conexão pela interface normal de login.
5. Realizar uma consulta de equipe permitida; comparar baseline sem criar/retomar sessões ou executar agentes.
6. Em qualquer desvio, aplicar kill switch e rollback sem apagar volumes DSH.

## Registro de execução do plano

Ruling: implementar primeiro o gate de PostgreSQL combinado — utiliza infraestrutura CI já autorizada e reduz uma dependência verificável; callback/mTLS reais dependem de interface/provisionamento ainda não disponíveis. Custo: ordem dos gates alterada, sem reduzir os critérios.
Revisão independente do incremento teste/CI solicitada conforme skill de execução.
Fonte oficial do contrato OAuth: https://developers.openai.com/plugins/build/auth
Fonte do transporte remoto: https://developers.openai.com/plugins/build/mcp-server
