# Candidato operacional OAuth + proxy — primeiro canário

Estado verificado em 2026-10-14: configuração candidata e teste combinado GREEN no commit f68ac5b7a37b3bb915909bf2f710c8c950dfabcc. Não é instalação, registro OAuth, autorização de produção ou prova de conexão ChatGPT. O laboratório usa pacote lab.4 instalado, JWT humano Keycloak, Envoy/mTLS, DSH oficial e PostgreSQL real.

## Produzir a configuração revisável

Copiar `operational-input.review.json` para área privada do operador e preencher somente os valores comprovados. O arquivo versionado permanece vazio; o gerador recusa null, valores incompletos, wildcard e segredos. Não substituir issuer/resource pelo laboratório. O resource usa hostname MCP dedicado e `/mcp`; `deep.wandora.com.br` fica reservado à Web UI.

O callback deve ser copiado exatamente da gestão da conexão ChatGPT, nunca deduzido. O modo estável somente é aceito quando a metadata e a resposta OAuth comprovam identificação do issuer. O método `none`, `client_secret_basic` ou `client_secret_post` deve corresponder à interface real; segredos são provisionados fora desses arquivos.

```sh
node deploy/mcp/render-operational-candidate.mjs /private/operator-input.json /private/new-review-directory
```

O diretório de saída deve ser novo. Gera:

- `keycloak-clients.disabled.json`: resource client e cliente humano dedicados, ambos desativados, PKCE S256, callback exato, sem implicit/password/service-account, com mappers individuais/audiência/token_use já testados.
- `client-scope.review.json`: definição revisável de agent-teams:read; scope não concede grants.
- `envoy.json`: configuração Envoy v1.40.0 com listener loopback e `bind_to_port:false`; não inicia processo nem abre porta.
- `connection.review.json`: valores e política revisável do backend; não é entrada direta da factory e não contém query/discovery executáveis ou credenciais.

Este é o primeiro canário: access token <=300s e `use.refresh.tokens:false`, conforme OAUTH_CONNECTION_CONTRACT. A autorização expira e poderá exigir novo login depois do canário; não prometer sessão persistente. Refresh é uma alteração posterior que exige testes e decisão próprios. Atributos do cliente/metadata/TTL reais deverão ser readback-verificados antes de ativação. Reutilizar o Keycloak e resource-indicators já testados, sem importar realm, usuário ou segredo de fixtures. Não usar o gerador para provisionar servidor de identidade.

## Fronteiras concretas do proxy

Escolha preparada: Envoy faz mTLS externo e mantém mTLS separado no backend. É um componente candidato, não um serviço já instalado. A CA confiável externa é somente o intermediário OpenAI Connectors, sem fingerprint de leaf fixado. Exige certificado cliente, cadeia válida, propósito clientAuth e SAN `mtls.prod.connectors.openai.com`. O backend possui CA dedicada e um certificado cliente do proxy; não compartilhar essa CA com clientes externos.

Arquivos fornecidos pelo secret manager, somente após autorização:

| Referência | Uso |
| --- | --- |
| `/run/secrets/public-server-chain.pem`, `public-server-key.pem` | TLS do hostname MCP real |
| `/run/secrets/openai-connectors-intermediate.pem` | CA pública obtida e conferida a partir da documentação oficial OpenAI |
| `/run/secrets/backend-ca.pem` | CA privada dedicada ao canal backend |
| `/run/secrets/proxy-backend-client-chain.pem`, `proxy-backend-client-key.pem` | Certificado do proxy, nunca fornecido ao ChatGPT |

Host literal, caminhos `/mcp` POST e metadata GET e origens exatas são validados. Headers de prova fornecidos pelo cliente são removidos; Authorization permanece intacto. A única identificação humana continua sendo JWT validado pelo pacote DSH com grants PostgreSQL exatos. Cliente mTLS sozinho não permite leitura.

`verified-mtls-channel` permite somente ausência de Origin: a rota já protegida por cadeia/SAN OpenAI atribui o valor interno `https://chatgpt-mtls-proxy.invalid`. Esse valor representa o canal autenticado, não uma origem de navegador nem identidade do usuário; não é URL acessível. O backend allowlista esse valor junto das origens reais. Origin presente maliciosa ou vazia é negada, sem substituição. `missingOriginPolicy: deny` desliga esse mapeamento. A policy do host deve ser fornecida por composição confiável e manter JWT/grants/revogação íntegros; não usar argumentos MCP para preencher configuração.

Não depender de headers de certificado encaminhados por Cloudflare ou Traefik. Para preservar o certificado OpenAI até Envoy, o desenho futuro requer hostname dedicado com TLS sem terminação anterior (por exemplo DNS-only e roteamento TCP/SNI pass-through). Essas mudanças não estão aplicadas e exigem autorização específica. O listener deste candidato não tem bind; a escolha de rede/porta/container e o roteamento real devem ser apresentados juntos antes de ativá-lo. Não reutilizar BasicAuth da Web UI no MCP.

O backend precisa rodar no mesmo host Cordis/DSH que possui as sessões existentes, com plugin lab.4, policy confiável, TLS interno e SDK fornecidos pelo operador. Não criar um DSH separado para copiar sessões. O pacote ainda não se instala automaticamente na imagem de produção; esta configuração não supre a composição operacional do host.

## Testes e limites de evidência

Cinco testes locais do gerador/CLI passaram. A CI nova valida o JSON com Envoy fixado e exercita TLS real em loopback contra backend double: cadeia, SAN/EKU incorretos, certificado ausente/não confiável, Host/Origin/path/method, mTLS backend, headers falsos e OAuth ainda exigido. Usa somente CAs e certificados descartáveis; não possui a chave OpenAI. Marca sucesso somente com `OPERATIONAL_PROXY_MTLS_SAN_ORIGIN_MATCH` e leitura positiva após cada negação TLS.

Esse teste não substitui o fluxo humano Keycloak/DSH/PostgreSQL já comprovado, nem comprova o cliente ChatGPT real ou todos os componentes pelo novo proxy. O teste combinado descrito abaixo já passou. A próxima etapa é preencher e revisar a composição operacional real, seguida do canário pelo ChatGPT após autorização de ativação. Não afirmar compatibilidade só por `--mode validate`.

## Ativação e rollback posteriores

Antes de autorização, conferir callback/client/issuer/resource reais, metadata/TTL, CA OpenAI pública, hostname/certificado do resource e canal privado; preparar digest, configuração de host/rota e grants do único owner/workspace/Lead. O orçamento de uma leitura é condição do canário e ainda não é contador global do proxy.

Só então apresentar o diff de infraestrutura, inclusive bind e TLS pass-through, para autorização. Registrar/importar clientes somente nessa etapa e conferir que permanecem disabled até o canário. O output do gerador nunca registra cliente ou altera DNS, VPS, Portainer, Traefik, Cloudflare ou PostgreSQL.

Rollback: bloquear o transporte MCP primeiro, revogar grant/token no primary, desativar cliente dedicado e parar a composição MCP; restaurar digest/config anteriores sem apagar volumes DSH. Conferir nova leitura negada e saúde Web/Agent Teams. Desativar cliente ou logout sozinhos não revogam JWT já emitido.

Fontes verificadas em 2026-10-14:
- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/plugins/build/mcp-server
- https://www.envoyproxy.io/docs/envoy/latest/start/quick-start/securing.html
- https://www.envoyproxy.io/docs/envoy/latest/api-v3/extensions/transport_sockets/tls/v3/common.proto.html
- https://github.com/envoyproxy/envoy/releases/tag/v1.40.0


## Fluxo completo pelo proxy (CI verificada)

O job independente do proxy passou em df9a5ff, incluindo o marcador
OPERATIONAL_PROXY_MTLS_SAN_ORIGIN_MATCH. A correção do harness executa o
binário Envoy com UID/GID do dono dos arquivos, preservando permissões privadas.

O probe humano agora insere a mesma configuração Envoy entre o cliente de
laboratório e o handler do pacote lab.4 instalado. Chave/certificado de cliente
externo pertencem a uma CA descartável com SAN gerenciado simulado; não é
certificado OpenAI real nem cliente ChatGPT. O backend continua com mTLS
privado distinto. JWT humano Keycloak e PostgreSQL primary continuam reais
no laboratório; nenhuma alteração nos validadores de autenticação ou grants.

Exige leitura permitida com Origin ausente através do canal normalizado e
negação sem bearer, com Origin presente maliciosa, grant revogado e token
revogado, incluindo o canal sem Origin. Mantém controle positivo não revogado,
reinícios de pool/plugin/banco, indisponibilidade e old-handler503 antes de
cada rebind. A imagem Envoy é pré-carregada antes de emitir os JWTs, para que
download não consuma sua validade. Cleanup encerra backend e remove chaves
mesmo se a remoção do container proxy falhar.

Novo marcador obrigatório:
KEYCLOAK_PACKED_PROXY_OFFICIAL_DSH_PERSISTENT_GRANTS_MATCH.
Sintaxe e 104 testes locais passaram, incluindo falha simulada de remoção do proxy com encerramento real do backend e limpeza de fixtures; o fluxo novo passou na CI Keycloak #38592622957 em f68ac5b7a37b3bb915909bf2f710c8c950dfabcc.
Isso não preenche issuer/resource/callback de produção nem autoriza ingress.


## Preparação operacional pelo Git — 2026-10-14

A stack deepharness foi informada pelo proprietário como Git-backed, com
repositório OARANHA/deepharness e caminho deploy/portainer-stack.yml.
O arquivo da main foi lido: serviço web, imagem por DEEPHARNESS_IMAGE,
BasicAuth por DSH_BASIC_AUTH_USERS, volumes dsh_data/dsh_workspace,
rede externa traefik-public e Web UI deep.wandora.com.br. Isso verifica
o conteúdo do Git, não a revisão aplicada pelo Portainer nem seus valores.

O proprietário distinguiu o Portainer da stack do Portainer configurado
no conector MCP de infraestrutura. Uma listagem vazia pelo conector não
é evidência de ausência da stack deepharness. A navegação ao Portainer
da stack terminou em erro de transporte TLS neste navegador; não foi
possível ler sua configuração ativa. Não alterar URLs/configuração
do conector nem tentar contornar a allowlist de containers.

### Valores necessários e fonte de comprovação

| Valor | Fonte | Situação |
| --- | --- | --- |
| Branch/ref e revisão aplicada da stack | Configuração Git e histórico de redeploy no Portainer | Não verificados; o runbook recomenda main, não comprova uso atual |
| DEEPHARNESS_IMAGE e digest anterior para rollback | Variável da stack e imagem efetivamente executada | Não verificados; digest histórico ou de CI não substitui readback |
| DSH_BASIC_AUTH_USERS | Provisionamento privado no Portainer | Referência existente; não copiar valor para Git/chat |
| issuer | Discovery HTTPS do realm Keycloak operacional | Não definido; não reutilizar localhost do laboratório |
| resource | Hostname HTTPS MCP dedicado e caminho /mcp | Não definido; não reutilizar hostname da Web UI |
| clientId / resourceClientId | Clientes dedicados revisados no Keycloak | Não definidos; gerar candidato disabled antes de provisionar |
| redirectUri / redirectUriEvidence | Interface real de gestão da conexão ChatGPT | Não definidos; copiar callback exato, sem inferência |
| authorizationResponseIssuerSupported | Metadata e contrato do issuer operacional | Não verificado |
| tokenEndpointAuthMethod | Interface ChatGPT e cliente Keycloak correspondente | Não definido |
| backendHost / backendPort | Composição privada no mesmo host DSH existente | Não definidos; requer instalação do pacote e policy confiável |
| allowedOrigins | Origens efetivamente utilizadas pelo cliente | Não definidas; ausência tratada apenas pelo canal mTLS verificado |
| Owner, workspace e Lead | Identidade JWT e serviços DSH existentes | Não definidos para o canário; grants exatos provisionados no primary |
| Certificados e acesso PostgreSQL | Secret manager e rede operacional privada | Não provisionados por este incremento |

### Sequência restante

1. Confirmar revisão/digest ativos e rollback da stack existente; preservar
   volumes e usar exatamente o mesmo host DSH/sessões. Não executar redeploy
   só porque a branch do conector recebeu documentação.
2. Obter os valores reais acima. Preencher entrada privada do gerador e
   produzir os quatro arquivos desativados. Nenhum segredo entra no Git.
3. Preparar uma única revisão final com imagem que realmente contenha lab.4,
   montagem do host/policy/SDK, PostgreSQL primary, backend mTLS e ingresso
   dedicado. O YAML atual não fornece esses componentes; um overlay de
   produção completo permanece pendente dos valores e da composição real.
4. Apresentar o diff concreto para autorização de implantação/provisionamento
   e ativação. A preparação no Git não autoriza importação de clientes,
   grants, DNS, certificados, bind ou alterações na stack.
5. Após ativação autorizada e readbacks, executar canário humano ChatGPT
   limitado à leitura aprovada e verificar a revogação/rollback.

Não há novo gate sintético planejado. Correções exigirão verificação apenas
se a revisão operacional ou o cliente real revelar uma falha.
