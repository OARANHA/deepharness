# Certificados MCP — procedimento operacional preparado

Estado: procedimento revisável; nenhum certificado, token DNS, renovador ou
agendamento foi provisionado por este documento.

## Três fronteiras distintas
- HTTPS público de dsh-mcp.wandora.com.br: certificado de servidor publicamente
  confiável e chave exclusiva, usados pelo Envoy. Traefik faz TCP/SNI passthrough
  pelo entrypoint websecure já observado; Cloudflare deve continuar DNS-only.
- Cliente OpenAI: cadeia pública oficial OpenAI Connectors, propósito clientAuth
  e SAN mtls.prod.connectors.openai.com. Não emitir certificado para ChatGPT,
  não aceitar headers como prova e não fixar fingerprint de leaf.
- Backend privado: CA própria exclusiva; certificado serverAuth com SAN
  deepharness-mcp-backend no DSH e certificado clientAuth exclusivo do proxy.
  A chave da CA não entra em nenhum container de execução.

## Emissão pública proposta
Usar ACME DNS-01 com certbot-dns-cloudflare. O plugin cria/remove o TXT de
validação. Credencial é arquivo INI root0600, fora do Git/chat/CI, com token
restrito a Zone:DNS:Edit somente na zona wandora.com.br. Não usar Global API Key.
Antes de instalar qualquer ferramenta, verificar se há um provisionador
aprovado no28server e escolher versão/digest testado. Não ler/copiar segredos
do Traefik ou sobrescrever seu armazenamento ACME compartilhado.

Parâmetros do pedido: certonly, dns-cloudflare, hostname único
dsh-mcp.wandora.com.br, credencial privada e diretório ACME dedicado. Não abrir
HTTP/80 adicional e não alterar proxy DNS para emitir o certificado.
Não executar um pedido com caminhos/token de exemplo.

## Organização privada prevista no28server
- /opt/wandora/data/deepharness-mcp/acme: credencial e estado ACME, root0700.
- tls/authority: CA backend e chave root0600; nunca montada no DSH/Envoy.
- tls/backend: backend-server-chain.pem, backend-server-key.pem, backend-ca.pem.
- tls/proxy: public-server-chain.pem, public-server-key.pem,
  openai-connectors-intermediate.pem, backend-ca.pem,
  proxy-backend-client-chain.pem e proxy-backend-client-key.pem.
- secrets: senhas separadas de DB; nunca montar esse diretório inteiro no proxy.

O ancestral privado permanece root0700. O diretório efetivamente montado no
proxy deve ser atravessável somente pelo UID1000 (owner1000, modo0500), com
chaves0400 e certificados públicos0444. Montagem read-only. Backend recebe
somente sua própria chave/cadeia/CA e a senha do usuário SQL de leitura.
O proxy nunca recebe senha SQL administrativa ou chave da CA privada.

## Validação antes da ativação
Confirmar hostname, validade, cadeia pública, correspondência cert/chave e
permissões sem imprimir material privado. Obter CA OpenAI pelos links da
documentação oficial e verificar cadeia/propriedades públicas. Backend deve
aceitar somente certificados da CA dedicada, com clientAuth válido.
Exigir metadata pública pelo cliente autorizado, negação sem certificado e
negação sem OAuth, com controles positivos. TLS não concede grants.

## Renovação e rollback
Preparar automação própria do emissor e executar renew dry-run antes de ativar.
Não há automação instalada ainda. O hook precisa validar a nova cadeia/chave,
preservar o par anterior no diretório privado, substituir arquivos de forma
atômica e recarregar SOMENTE o proxy MCP identificado. A configuração TLS
estática do candidato não promete recarga automática de certificados.
Rever/readback o nome do container antes de registrar qualquer hook.
Não reiniciar o Traefik compartilhado. Se validação falhar, manter o par anterior.

Renovação do backend exige procedimento próprio de sobreposição de confiança e
reinicialização controlada do listener DSH; o módulo atual não fornece hot reload.
Monitorar datas de expiração e testar rollback antes de retirar a CA anterior.

Fontes oficiais consultadas:
- https://certbot-dns-cloudflare.readthedocs.io/en/stable/
- https://developers.openai.com/plugins/build/auth

