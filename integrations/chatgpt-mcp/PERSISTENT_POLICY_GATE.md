# Policy operacional e grants persistentes — laboratório

O pacote lab.3 oferece createPersistentDshMcpReadPolicy no export /policy. A composição confiável do host fornece discovery, issuer/resource, query do PostgreSQL primary e allowedOrigins; o retorno fixa grantMode:postgres. Não aceita grants estáticos ou modo alternativo como configuração adicional. O plugin continua consumindo chatgptMcpReadPolicy por injeção Cordis, sem endpoint.

## Autoridade

createPostgresReadGrantStore fornece somente hasReadGrant. Cada verificação valida IDs exatos, calcula SHA256(JSON.stringify([principalId,workspaceId,leadSessionId])) e consulta o primary. Apenas uma linha allowed:true autoriza. Ausência/revogação negam; formatos inválidos, erros e timeout falham fechados. Nenhum cache, startup seed ou fallback de grants em memória.

mcp-read-request-context aceita callback persistente apenas sem grants estáticos; seus mutadores em memória ficam indisponíveis nesse modo. Identidade continua derivada do JWT verificado; o callback recebe o scope gerado pelo servidor, nunca claims de ferramenta. As revalidações existentes antes/depois de await consultam novamente o backend.

sql/002_read_grants.sql contém somente tabela/hash/boolean; não cria grant inicial. Provisionar/revogar é ação administrativa separada e não exportada em MCP. Em produção, aplicar schemas, roles, conexões/segredos, backup e auditoria requer decisão e autorização próprias. Credenciais/testes atuais são CI descartáveis.

## Verificação do incremento

Local: teste inicial RED pelo backend inexistente; suíte do pacote 10/10 aprovada. Regressões anteriores de autenticação/request/session/service guards foram executadas com os novos adaptadores. Whitelist do tarball lab.3 é exata, 25 arquivos; YAML e sintaxe dos probes verificados.

O novo persistent-grant-policy-probe.mjs roda no mesmo processo do JWT humano real Keycloak e monta o plugin sobre serviços oficiais DSH descartáveis. Exige negação sem grant, permite somente uma tupla, nega outro Lead existente, reinicia pool/plugin/banco com grant permitido e depois revogado, exige SQL saudável da linha exata em cada prova de persistência, revoga durante autorização assíncrona e nega DB indisponível. O banco é recuperado para o teste subsequente de revogação de token. Inserts/updates administrativos existem somente na preparação do laboratório; o plugin não executa escrita.

Marcador esperado: KEYCLOAK_CORDIS_PERSISTENT_GRANTS_MATCH. CI atual ainda pendente; não afirmar grants/revogações preservados em runtime real antes desse marcador e workflow GREEN.

Não equivale a política de logout do emissor, failover/backup operacional, instalação PluginManager de perfil, conexão real ChatGPT, transporte protegido ou deploy. O endpoint permanece inexistente/desativado e a PR Draft.

Ruling: manter modo estático explícito apenas para compatibilidade dos testes anteriores; a factory operacional força PostgreSQL e rejeita mistura. Custo: dois modos internos precisam continuar com testes independentes, sem fallback entre eles.


## Revisão independente
Um achado material no teste foi corrigido: a fase de indisponibilidade agora exige grant allowed:true e leitura bem-sucedida imediatamente antes de parar o DB, negação durante a parada e SQL saudável/leitura permitida após recuperação; depois revoga e nega novamente. Um grant previamente falso não pode mascarar a prova de fail-closed. Não houve outro bypass material reportado.

Limite temporal: a decisão observa o primary em cada revalidação, incluindo após fronteiras assíncronas e antes de retornar. Não promete revogação atômica que se estenda além da última consulta ou até a entrega pela rede; uma revogação posterior à decisão final exige nova requisição/validação.

Regressão local ampliada: 75/75 testes passaram; quatro testes também passaram contra o tarball lab.3 instalado offline. Esses resultados não substituem a CI de grants reais/restart.
