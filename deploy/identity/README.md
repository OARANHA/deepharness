# Keycloak operacional — candidato para id.wandora.com.br

Estado: preparação no Git, sem implantação/provisionamento. O proprietário
escolheu wandora-vps-01 e informou DNS Cloudflare proxied (nuvem laranja).
Esse DNS não foi readback-verificado e o IP informado não foi confirmado.

## Inventário observado em 2026-10-14

Target wandora-agent: hostname wandora-vps-01, Ubuntu24.04.5, aproximadamente
3.7GiB disponíveis, sem swap, raiz81% usada e39GiB livres.
Uma instância inicial limitada é candidata; monitorar capacidade e backups.
Não há garantia de segurança ou capacidade apenas por esses números.

wandora-traefik saudável, versão3.7.13:
- somente provider file em /etc/traefik/dynamic, watch=true;
- origem /opt/wandora/stacks/traefik/dynamic, montagem read-only no Traefik;
- rede existente wandora-edge, IP observado172.18.0.2;
- entrypoint websecure443;
- resolver letsencrypt usando DNS challenge Cloudflare;
- nenhum provider Docker observado. Labels não criariam a rota.
Portainer MCP retornou stacks vazias; isso não inventaria todos os containers
nem comprova ausência de serviço de identidade.

## Arquivos preparados

- Dockerfile: Keycloak oficial26.8.1 otimizado fora daVPS, PostgreSQL,
  health enabled e cache local para uma única instância. Versão release
  verificada, mas laboratório combinado anterior usava26.8.0; compatibilidade
  completa dos mappers/token no patch escolhido requer verificação.
- portainer-stack.review.yml: Keycloak e PostgreSQL16, somente um volume
  identity_pgdata necessário à persistência da identidade, rede DB privada
  internal e rede de ingresso existente. Não modifica volumes do DSH.
- traefik-route.review.yml: rota candidata por file provider, não instalada.
  Publica somente /realms/, /resources/ e /.well-known/; /admin/ e health9000
  não são publicados. Gestão inicial via API/CLI no loopback18080 daVPS,
  com procedimento autorizado separado; não há painel admin público preparado.
- Workflow identity-candidate: build e startup production, issuer HTTPS e
  PostgreSQL persistente entre containers recriados. Fixtures descartáveis,
  sem publicação GHCR, DNS, realm operacional ou alteração deVPS.

## Cloudflare e TLS

Nuvem laranja é compatível com login HTTP/OIDC comum nessa topologia.
Exigir Cloudflare Full(strict), certificado válido na origem pelo resolver
existente, e HTTPS efetivo antes de cadastrar clientes/callback.
Não criar regra Cache Everything para OIDC nem challenge que impeça
discovery/token do cliente. Conferir comportamento real, sem alterar regras
globais ou reduzir validação TLS. O MCP/mTLS tem topologia distinta; não
copiar automaticamente o proxy laranja para ele.

Hostname é HTTPS fixo. BackendHTTP8080 somente pela rede Docker de ingresso
e loopback administrativo; proxy-headers xforwarded deve confiar somente
no endereço real do Traefik, nunca0.0.0.0/0 nem toda rede compartilhada.
Valor172.18.0.2 foi observado e pode mudar na recriação; confirmar antes de
deploy e manter política/IP compatíveis. Nenhuma mudança no Traefik foi feita.
Não encaminhar headers de autenticação fornecidos pelo cliente como identidade.

## Provisionamento pendente e aprovação

Antes de aplicar:
1. Confirmar DNS A/AAAA para aVPS correta, origemTLS e modo Full(strict).
2. Confirmar volumes/serviços existentes, rede wandora-edge e endereço do
   Traefik; capturar configuração de rollback e eventual conflito hostname.
3. Executar CI e aceitar imagem otimizada; publicar somente após aprovação
   apropriada, registrar digest imutável. PostgreSQL candidato16.15-bookworm;
   registrar digest efetivamente testado. Não utilizar latest.
4. Provisionar valores privados no Portainer:
   WANDORA_KEYCLOAK_IMAGE, WANDORA_ID_POSTGRES_IMAGE,
   WANDORA_ID_DB_PASSWORD, WANDORA_ID_TRUSTED_PROXY,
   WANDORA_ID_BOOTSTRAP_USER, WANDORA_ID_BOOTSTRAP_PASSWORD.
   No primeiro start de banco vazio, fornecer ambos os campos bootstrap.
   Depois eles são opcionais no Compose e devem ser removidos da configuração
   privada. Não iniciar banco vazio sem planejar o bootstrap administrativo.
   Nenhum valor secreto entra no Git, chat ou memória. Bootstrap é temporário:
   criar admin permanente com MFA e remover conta temporária e variáveis após
   readback da gestão. Definir backup/restore antes de uso operacional.
5. Apresentar e aprovar juntos stack, rota dinâmica e procedimento de segredos.
   O proprietário autorizou preparação, não implantação automática.
   Aplicar somente arquivo novo de rota, sem trocar configurações globais,
   reiniciar ou recriar o Traefik sem necessidade.
6. Validar saúde, persistência e metadata antes de criar realm/clientes humanos.
   Realm planejado deepharness; issuer futuro:
   https://id.wandora.com.br/realms/deepharness.
   Esse issuer ainda NÃO existe e o operacional-input permanece incompleto.
7. Configurar clientes disabled com callback ChatGPT exato, mappers revisados
   e PKCE; continuar gate do conector. Não importar usuários/segredos da fixture.

KeycloakDB armazena identidade/config; não substitui automaticamente o
PostgreSQL primary dos grants/revogações do conector no28server.
Essa composição continua pendente e separada.

Rollback: retirar apenas rota nova, parar stack identidade autorizada,
preservar identity_pgdata e backups. Não apagar banco, volumes ou imagens;
downgrade de Keycloak com schema atualizado exige plano de restore compatível.
Não chamar conexão ChatGPT pronta só por startup/discovery.

Fontes:
https://github.com/keycloak/keycloak/releases/tag/26.8.1
https://www.keycloak.org/server/containers
https://www.keycloak.org/server/reverseproxy
https://www.keycloak.org/server/configuration-production
https://github.com/docker-library/official-images/blob/master/library/postgres
