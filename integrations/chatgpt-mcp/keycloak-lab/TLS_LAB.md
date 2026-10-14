# Keycloak HTTPS isolado — laboratório

O issuer do laboratório é https://127.0.0.1:18080/realms/deepharness-mcp-lab. O recurso MCP permanece https://mcp.example/mcp e o callback humano descartável permanece http://127.0.0.1:18081/callback. Nenhum deles é configuração de produção.

O workflow gera CA e certificado temporários válidos por um dia, SAN IP127.0.0.1, publica somente HTTPS8443 do container em loopback18080 e desabilita HTTP. Keycloak26.8.0 recebe o hostname HTTPS fixo e arquivos PEM readonly; a chave do servidor é modo0600, UID1000. A CA e sua chave não são montadas no servidor. Curl usa --cacert; somente os probes Node recebem NODE_EXTRA_CA_CERTS. Nada usa curl -k, rejectUnauthorized:false ou NODE_TLS_REJECT_UNAUTHORIZED=0.

tls-probe.mjs exige resposta HTTPS com socket autorizado. Um segundo processo sem confiança na CA deve falhar com código específico de validação de certificado; falha de conexão/deadline não conta como negação TLS. O cleanup sempre remove containers e material TLS/realm temporários; nenhum segredo ou certificado privado é salvo em artifacts/GitHub/memory.

## Diagnóstico e verificação

O HEAD235f09e2 falhou no novo teste de grants com erro genérico na fase schema. Reproduzida a incompatibilidade: a policy operacional corretamente recusa issuer HTTP, mas o laboratório anterior usava HTTP. O runtime/policy/verificador HTTPS não foi relaxado; o laboratório passou a satisfazer seu contrato.

As fases de schema, host oficial, policy e montagem agora são separadas. Apenas códigos conhecidos de erro podem entrar no diagnóstico; mensagens e objetos internos com valores sensíveis continuam ocultos.

Localmente: cadeia de certificados/IP127 foi aceita e IP errado rejeitado; o probe positivo/negativo passou contra stub HTTPS, não contra Keycloak; YAML, Bash e sintaxe Node aprovados. Revisão independente sem achados materiais. Startup real Keycloak, JWT/PKCE e grants persistentes HTTPS ainda aguardam CI.

Referências primárias das opções PEM/HTTPS/hostname: https://www.keycloak.org/server/enabletls e https://www.keycloak.org/server/hostname.
