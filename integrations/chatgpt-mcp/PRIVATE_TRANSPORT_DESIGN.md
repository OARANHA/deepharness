# Transporte privado MCP — laboratório

Estado: implementação opt-in, sem listener ou ativação de produção.
Base anterior GREEN: bcf78ca2bd856c738327eceb5179f1e0de927762.
Arquivos: adapters/private-mcp-http-handler.mjs; test/private-mcp-http-handler.test.mjs;
initialized-host-probe/private-transport-official-host.test.mjs.

## Composição

createPrivateMcpHttpHandler recebe enabled:true explícito, resource HTTPS com
path /mcp, allowedOrigins exatas, serviço interno chatgptMcpRead, construtores
McpServer/StreamableHTTPServerTransport e schema estrito de workspace/Lead.
Retorna handle(req,res) e dispose(); não cria servidor nem registra plugin.

Exige TLS direto: socket.encrypted, socket.authorized e certificado do peer.
A CA/mTLS são configurados pelo host HTTPS (requestCert/rejectUnauthorized),
não por argumentos MCP nem headers. Não suporta terminação mTLS em proxy
neste incremento. Uma futura integração de proxy requer canal backend confiável
e verificação próprios; não falsificar req.socket nem confiar em x-client-cert.

Host deve corresponder ao host/porta literal do resource. Origin é obrigatório
e pertence à allowlist; permanece também validado pelo serviço existente.
Headers críticos duplicados, URL diferente e mcp-session-id são negados.
Cada POST cria servidor e transporte SDK stateless novos, com somente
dsh_read_agent_team. A identidade é revalidada pelo gate OAuth e por
runHttpRequest/readTeam do serviço, mantendo grants e guards existentes.

Defaults: body máximo 16 KiB; timeout 10s; concorrência 1. Configuração aceita
limites menores dentro de intervalos fixos. Timeout cancela consumo do corpo,
impede dispatch/resultado tardios e liberta a concorrência; cleanup SDK possui
espera limitada. Uma dependência que ignore cancelamento pode continuar sua
operação interna, mas não recebe autorização para publicar dados posteriormente.
dispose bloqueia chamadas futuras e cancela a requisição em curso.
O adaptador não limita a uma leitura total de canário: esse orçamento ainda
depende da composição operacional, antes de ativação real.

## Evidência e limites

Local: 21 testes de fronteira/cancelamento passaram; 75 regressões existentes
passaram. RED reproduzido para implementação ausente e para retenção de
concorrência em corpo incompleto; correção verificada GREEN.
Revisão independente encontrou o problema de timeout e a ambiguidade das
asserções TLS; ambos corrigidos. JSON/schema/SDK reais não foram executados
localmente por falta das dependências oficiais no ambiente.

CI acrescenta teste com HTTPS e certificados CA/server/client descartáveis,
mTLS direto, SDK1.30.0 real e plugin sobre host oficial DSH/Cordis. Verifica
initialize/tools/list/read, nega certificado ausente/não confiável, servidor
não confiável, bearer inválido, Host/Origin, sessão forjada, outro principal/
workspace/Lead, extras de identidade, revogação, DB indisponível e unload.
Exige marcador PRIVATE_MTLS_OFFICIAL_DSH_MCP_MATCH.

JWT desse teste é assinado por chave de teste; query PostgreSQL é um double
explícito. Não é Keycloak humano nem prova de PostgreSQL persistente no mesmo
fluxo de rede. Esses componentes possuem testes separados já comprovados;
a combinação completa no transporte permanece próximo incremento após GREEN.
Não confundir ausência de erros com rejeição de certificado: exige erro TLS
de certificado observado no servidor e erro de CA no cliente.

O novo adaptador não entra nos exports/whitelist do tarball lab.3. Está restrito
ao source/laboratório até prova CI e revisão do empacotamento. Plugin,
Dockerfile de produção, stack, ingress/DNS e endpointEnabled:false não mudam.
Callback, issuer/resource e cliente real continuam dependências não definidas.
Nenhum segredo persistente, grant operacional ou sessão de produção criado.

Ruling: implementar primeiro mTLS direto em loopback para provar a fronteira
sem depender de proxy real — custo: integração proxy/túnel é trabalho separado.
Ruling: manter stateless no primeiro transporte para eliminar mapas de sessão
com identidade reutilizada — custo: clientes que exigirem sessão/SSE persistentes
precisam de contrato e testes posteriores; não presumir compatibilidade ChatGPT.

## JWT humano + PostgreSQL real no transporte (incremento; CI pendente)

O probe persistent-grant-policy-probe aceita withPrivateTransport:true apenas
no laboratório. Todas as leituras de aceitação/negação percorrem HTTPS/mTLS,
SDK stateless, plugin oficial e PostgreSQL primary real do laboratório existente.
Não há nova infraestrutura: listener somente 127.0.0.1/porta efêmera e certificados
descartáveis. O resource https://mcp.example/mcp permanece identificador do lab;
a conexão física é loopback, com SNI/Host e SAN correspondentes. Não é DNS real.

human-pkce-probe obtém JWT de uma transação PKCE independente para a rede e
outro JWT independente de controle, ambos autenticados como o mesmo principal.
Isso preserva o token original usado pelos testes existentes e impede reutilizar
um código para cenários incompatíveis. Nenhum token/código/cookie é registrado.

Reutiliza as provas existentes de grant ausente/exato, outro Lead, revogação
durante await, persistência permitida/revogada em pool/plugin/DB e outage.
Adiciona revogação real do token de rede; exige linha SQL saudável revoked:true,
grant allowed:true e leitura permitida do controle não revogado antes de aceitar
a negação do token alvo, inclusive após reinício de pool/plugin e banco.
Confirma ambos os tokens ainda não expirados. Cleanup restaura banco parado
pelo teste antes de encerrar pool, host, listener e arquivos temporários.

Revisão independente encontrou ausência desse controle positivo pós-reinício
e restauração do banco no caminho de erro; ambos foram corrigidos.
96 testes locais de fronteira/regressão passaram; sintaxe dos probes aprovada.
A combinação real exige a CI e o marcador
KEYCLOAK_MTLS_OFFICIAL_DSH_PERSISTENT_GRANTS_MATCH. Ainda não comprovada
neste incremento. Não altera adapters de produção, whitelist/exports lab.3,
Keycloak de produção, credenciais persistentes ou conexão ChatGPT.
