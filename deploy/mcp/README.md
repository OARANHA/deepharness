# Candidato operacional OAuth + proxy — primeiro canário

Estado: gerador e testes preparados; CI do novo proxy ainda pendente. Não é instalação, registro OAuth, autorização de produção ou prova de conexão ChatGPT. Base de laboratório GREEN: 510faad (pacote lab.4 + JWT humano Keycloak + MCP/mTLS + DSH oficial + PostgreSQL real).

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

Esse teste não substitui o fluxo humano Keycloak/DSH/PostgreSQL já comprovado, nem comprova o cliente ChatGPT real ou todos os componentes pelo novo proxy. O próximo teste deve usar o proxy na combinação já existente antes de qualquer implantação. Não afirmar compatibilidade só por `--mode validate`.

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
