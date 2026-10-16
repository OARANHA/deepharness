# Preparação operacional OAuth e transporte — sem ativação

Estado: somente documentos e ficha de revisão. Base comprovada:
`2ded7e16348cbd7c51ebcf2296c9b2360cfb0e74`, cinco workflows GREEN;
instalação offline pelo CLI oficial comprovada com plugin desativado.
Não existe prova de conexão real ChatGPT.

## Entregáveis e decisão

`oauth-onboarding.review.json` é uma ficha inerte, não configuração aceita pelo
plugin, não ClientRepresentation para importar e não realm Keycloak.
Nenhum consumidor runtime deve carregá-la. Campos null são dependências
não comprovadas; preencher a ficha não autoriza ativação.

Ruling: reutilizar o contrato/cliente pré-registrado já definido; preparar os
valores e procedimento sem mudar autenticação runtime ou registrar cliente.
Custo: a interoperabilidade externa permanece bloqueada até valores reais e
testes do cliente. Não prometer sucesso pelo GREEN de laboratório.

O cliente candidato permanece disabled. Público/none é a primeira opção
somente se a interface ChatGPT e o emissor comprovarem suporte. Caso contrário,
revisar o método suportado; segredo somente em secret manager, após autorização.
Não ativar DCR anônimo nem CIMD para contornar incompatibilidade.

## Callback e registro

A documentação OpenAI admite cliente pré-definido, CIMD ou DCR. Copiar o
redirect URI exato mostrado na gestão do MCP. O callback pode ser específico
da conexão ou estável conforme identificação do issuer; não presumir o modo.
PKCE S256 e resource vinculado à audiência são requisitos.
Fonte: https://developers.openai.com/plugins/build/auth (consultada 2026-10-14).

Procedimento do registro futuro, não executado:

1. Registrar em ficha privada a URL exibida pela interface da conexão, sem
   abrir uma conexão em nome do usuário nesta preparação. Confirmar o método
   de autenticação do token endpoint disponível. Não usar callback do lab.
2. Fixar issuer/resource HTTPS reais e metadata autenticada do emissor.
   Conferir issuer literal, endpoints e S256. Se anunciar suporte ao iss
   da resposta, testar sucesso e erro com issuer exato.
3. Registrar cliente dedicado somente após autorização, inicialmente disabled,
   com uma redirect URI exata, authorization code, PKCE S256, sem implicit,
   password grant ou service account. Nunca wildcard de redirect/origin.
4. Reutilizar os mappers revisados do lab apenas após adaptar o resource real:
   access JWT RS256, sub individual, token_use access, jti/iat/exp e scope.
   Exigir audience string exata. Não importar realm.json, usuário ou credenciais
   de fixtures. Sem refresh/offline_access no primeiro canário; comprovar que o
   emissor não entrega refresh utilizável, não apenas omitir scope.
5. Conferir que resource errado no auth e token endpoint não produz token
   aceito. Scope/login não provisionam grants. Somente depois da revisão do
   registro considerar enable do cliente para o canário autorizado.

O callback é recebido pelo ChatGPT; nenhum callback ou troca de código será
implementado no DSH. Não transportar códigos, cookies ou JWTs humanos via chat.

## Transporte protegido

A documentação OpenAI descreve Streamable HTTP, proxy HTTPS com mTLS para
identificar o cliente e OAuth para o usuário, ou Secure MCP Tunnel para acesso
privado; disponibilidade concreta ainda precisa ser comprovada.
Fonte: https://developers.openai.com/plugins/build/mcp-server.

Seleção proposta: proxy HTTPS com validação mTLS efetiva, mantendo backend
privado e OAuth independente. Se a conta só disponibilizar túnel, revisar
explicitamente alcance e equivalência antes de escolher. Nenhuma configuração
Traefik/Cloudflare/DNS ou regra de ingress é aplicada nesta entrega.

| Limite | Mapeamento proposto |
| --- | --- |
| URL MCP | resource HTTPS canônico com path /mcp, valor real ainda null |
| Discovery | GET /.well-known/oauth-protected-resource/mcp; somente metadata |
| Identificação do cliente | mTLS no terminador comprovado, não header fornecido pelo solicitante |
| Identificação humana | Authorization Bearer validado pelos adaptadores existentes |
| Dados | somente dsh_read_agent_team e tupla exata principal/workspace/Lead |
| Proxy/backend | sem acesso direto que contorne a verificação do cliente |
| Sessões | IDs MCP/DSH nunca substituem autenticação ou grants |
| Origin | allowlist exata; ausência negada pelo código atual |
| Logs | status, duração, request ID sanitizado; sem header, URL de callback, corpo ou resultado |
| Limites | proposta: uma leitura, concorrência 1, timeout 10s; implementação ainda pendente |

Separar Origin de callback. Não colocar redirect URI na allowlist de Origin.
Se o cliente legítimo omitir Origin, registrar apenas presença/ausência sem
credenciais; propor correção isolada com teste negativo antes de conectar.
Não acrescentar bypass no código atual.

Na composição futura: metadata/401 gate antes do dispatch MCP; cada leitura
entra por runHttpRequest/readTeam do serviço oficial, com reautenticação e
grants persistentes, inclusive após awaits. Registrar somente a ferramenta
permitida; nenhuma ferramenta upstream de escrita.
O plugin atual não cria listener e rejeita endpointEnabled:true; será necessária
composição de transporte separada, testada, sem transformar essa flag em bypass.

## Revogação e rollback

A factory operacional existente fixa PostgreSQL para grants. A conexão query
deve ler primary em cada decisão; schema001 para tokens e schema002 para grants.
Não usar fallback estático, seed de login ou cache permissivo. Provisionamento
e revogação administrativos ficam fora das ferramentas MCP.
Separar role de leitura da role administrativa; referências de segredos e IDs
reais ficam na ficha privada do operador, nunca neste repositório.

Antes do canário, registrar digest e configuração anterior, duração, owner,
ponto de bloqueio do transporte, cliente dedicado e procedimento de revogação.
Em falha: bloquear transporte MCP primeiro; revogar grant/token no primary;
desabilitar cliente; parar composição MCP e restaurar artefato/config anterior.
Verificar nova leitura negada e saúde Web/Agent Teams. Preservar volumes DSH.

Logout do emissor sozinho não prova revogação local imediata. A proposta de
token até 300s limita janela residual, mas exige TTL real verificado.
Desabilitar cliente sozinho também não invalida JWT já emitido.
Não afirmar revogação atômica até entrega pela rede: verificar novamente após
fronteiras assíncronas e na decisão final, como no adaptador existente.

## Evidência ainda necessária

- Interface real: callback, modo de registro e autenticação do token endpoint.
- Issuer/resource/JWKS reais, claim profile e TTL; nenhum hostname inferido.
- Testes lab: redirect divergente, state incorreto, iss divergente/ausente,
  resource errado, replay e PKCE negativo independente.
- Transporte: certificado ausente/inválido, mTLS válido sem OAuth, Host errado,
  Origin permitida/maliciosa/ausente e bypass direto negado.
- TLS/SNI, egress, limites e Streamable HTTP lifecycle initialize/tools/list.
- DB operacional, política confiável injetada, roles/secret manager e rollback.
- Autorização específica antes de credencial persistente, endpoint, infraestrutura
  ou consulta real. Somente uma equipe existente selecionada pelo operador.

Nenhum desses itens é considerado concluído pela ficha ou pela CI anterior.
