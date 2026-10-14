# Aplicação revisável — identidade Wandora

Preparação apenas. Não executado naVPS, não é autorização de publicação/deploy.

## Objetos da aplicação proposta

| Objeto | Destino/valor |
| --- | --- |
| Host | wandora-vps-01, target wandora-agent; identidade confirmada |
| Stack nova | wandora-identity |
| Repositório | OARANHA/deepharness |
| Compose | deploy/identity/portainer-stack.review.yml |
| Ref de implantação | commit revisado fixado; não usar branch móvel automaticamente |
| Keycloak | imagem otimizada testada da CI, publicada posteriormente por autorização |
| PostgreSQL | digest do postgres16.15-bookworm efetivamente usado na mesma CI |
| Rede ingress | wandora-edge existente |
| Rede DB | privada da stack, internal |
| Volume DB | identity_pgdata da stack; único volume novo para o serviço novo |
| Rota nova | /opt/wandora/stacks/traefik/dynamic/wandora-identity.yml |
| Host público | id.wandora.com.br, owner informou DNS Cloudflare proxied |
| Exposição | login/OIDC/resources; sem /admin ou gestão9000 na rota pública |
| Gestão | loopback127.0.0.1:18080 daVPS; CLI/API com procedimento próprio |

Portainer configurado possui endpoint3 local, observado anteriormente, mas
validar novamente antes de criar stack e vincular àVPS correta. Nenhum comando
de implantação shell paralelo é proposto. Traefik lê arquivo dinâmico; uma
stack com labels, sozinha, não criará o ingresso.

## Artefato exato e publicação posterior

O workflow identity-candidate salva imagem Docker após os testes:
keycloak-tested.tar.gz, SHA256SUMS, image-ID, source-head, tested-checkout
e RepoDigests do PostgreSQL. Retenção7dias; nenhum banco de teste ou segredo
entra no artefato. Este passo não publica no GHCR.

Na etapa autorizada de publicação, recuperar o artefato do runGREEN revisado,
conferir SHA256SUMS e image-ID após docker load. Publicar exatamente essa
imagem, sem rebuild entre teste e push; registrar digest do manifestGHCR.
Image-ID local NÃO é digest do manifestregistry. Registrar também qual
mergecheckout foi testado: workflowPR usa merge ref, não necessariamente
apenas o head da branch. Arquivos aplicados devem corresponder ao conjunto
revisado, preservando diferenças entre source-head e tested-checkout.

Não usar hash mostrado por docker build como se fosse o digest para Portainer.
Não aplicar candidata se imagem testada não estiver recuperável/revisada.

## Sequência de aplicação após aprovação específica

1. Conferir DNSA/AAAA, origem correta, Cloudflare Fullstrict, certificados,
   ausência de rota conflituosa, rede e IP atual do Traefik.
2. Registrar inventário anterior e plano de backup/restore do banco.
3. Provisionar senhas DB e adminbootstrap em canal privado no servidor/
   Portainer. Não enviar senhas no chat nem colocá-las em Git.
4. Publicar artefato autorizado e preencher digests e proxyIP no Portainer.
5. Criar stack wandora-identity por Git usando commit revisado e o Compose
   indicado. Não alterar stacks de aplicações existentes.
6. Confirmar containers/banco/health antes de instalar a rota nova.
7. Aplicar somente wandora-identity.yml no diretório observado, por ação
   administrativa revisada. Não sobrescrever arquivos existentes, reiniciar
   Traefik nem modificar sua configuração global sem necessidade.
8. Validar discovery pública por HTTPS, cert origem e ausência de admin/health
   públicos. Testar forwardedheaders e trustedproxy pela rota real.
9. Via gestão privada, criar adminpermanente com MFA e remover bootstrap
   temporário e variáveis. Conferir redeploy sem exigência de credenciais
   temporárias. Realizar backup e validação de restore.
10. Criar realm planejado deepharness e clientesdisabled somente por etapa
    própria revisada. Não importar usuários/chaves das fixtures.
11. Continuar composição MCP no28server e obter callbackChatGPT exato.

## Rollback delimitado

Se a primeira aplicação falhar: desativar/retirar apenas rota nova e parar
stack nova; manter DBvolume, inventário e backups. Não excluir volumes,
pruneDocker ou alterar Traefikglobal. Na atualização de Keycloak, rollback
depende de compatibilidade do schema ou restorebackup; trocar tag para versão
antiga não é plano suficiente.

## Pendências que impedem autorização concreta neste momento

- CI completa do candidato e artefato testado recuperável.
- Manifestdigests de publicação e confirmação do proxyIP.
- Readback DNS/TLS Cloudflare da origem escolhida.
- Canal operacional para segredos e gestão privada.
- Procedimento de backup/restore verificado.
- Revisão final do conjunto de objetos acima.

A capacidade ChatGPT real continua pendente de callback, cliente, hostnameMCP,
host/policy/SDK no DSH existente e grantsprimary. Instalar Keycloak não fecha
essas etapas nem autoriza leitura automática de todas as sessões.
