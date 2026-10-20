# Permissões das ferramentas — volumes existentes

Estado em 2026-10-14: correção candidata no Git, sem implantação.
Por decisão do proprietário, a stack usa somente dsh_data e dsh_workspace.
A proposta anterior de quatro volumes de ferramentas foi retirada;
nenhum desses volumes adicionais foi criado no28server.

## Diagnóstico

A imagem roda como node, com HOME e DSH_HOME em /data/dsh.
Já havia NPM_CONFIG_CACHE e XDG_CACHE_HOME. O relatório de instalação
aponta falhas nos caminhos abaixo; a propriedade real no servidor ainda
precisa ser inspecionada. Chown no build não modifica um volume existente.

| Caminho no dsh_data | Finalidade |
| --- | --- |
| .npm-cache | Cache npm |
| .cache/hyperframes | Cache HyperFrames/browser |
| .hyperframes | Configuração e estado HyperFrames |
| .npm-global | Ferramentas npm instaladas pelo usuário |

A imagem inicializa os diretórios de ferramentas como node, modo0700.
NPM_CONFIG_PREFIX=/data/dsh/.npm-global vale na imagem e no Compose.
PATH preserva /opt/dsh/node_modules/.bin primeiro e inclui o bin do prefixo
do usuário depois. Isso fornece destino para npm install -g sem root.
HOME e workspace não mudam; skills/plugins continuam nos destinos próprios
dentro dos volumes existentes. Nenhum overlay oculta configurações antigas.

## Inventário e reparo operacional pendentes

1. Confirmar usuário/UID/GID efetivos do processo, nomes reais dos dois
   volumes e montagens. Não deduzir o nome do volume pelo nome da stack.
2. Como o usuário efetivo, conferir proprietário, modo, ACL quando aplicável
   e acesso de escrita nos caminhos afetados, no HOME e nos destinos reais
   de instalação de skills/plugins. Root como dono, sozinho, não prova falha.
   Não imprimir conteúdo de configurações, tokens ou sessões.
3. Preservar estado/configuração e registrar metadados antes da alteração.
   Não apagar cache/configuração para contornar permissão.
4. Se necessário, preparar uma ação administrativa pontual: alterar apenas
   os diretórios e arquivos identificados que o usuário precisa escrever,
   usando UID/GID confirmados. Arquivos internos também podem bloquear
   gravação; corrigir só o diretório superior pode ser insuficiente.
   Não executar chown -R em /data/dsh, chmod777 nem seguir symlinks para
   caminhos externos. Suspender escritores durante a manutenção.
5. Criar .npm-global como o usuário efetivo se ausente e verificar acesso.
   Aplicar configuração/imagem pelo Portainer GitOps após autorização;
   não operar um Compose paralelo pelo shell.
6. Testar instalação npm no espaço do usuário e uma instalação oficial
   de skill/plugin autorizada em sessão nova; verificar persistência e
   saúde do Harness após recriação.

Esse reparo não está automatizado na inicialização e não foi executado.
O processo principal continua não-root, rootfs read-only, sem capabilities
e com no-new-privileges. Os volumes continuam graváveis. Instalações que
exigem apt ou bibliotecas de sistema necessitam empacotamento revisado;
não prometer que qualquer plugin arbitrário pode instalar tudo sozinho.

## Teste da candidata

deploy/tool-state-volume-smoke.mjs lê o Compose e exige exatamente os
destinos /data/dsh e /workspace. Cria somente dois volumes descartáveis de CI.

- Fixture root cria três diretórios0700 e sentinelas legadas.
- Processo UID1000 reproduz EACCES sem reparo.
- Uma ação restrita à fixture corrige só os três diretórios e suas sentinelas.
- Processo não-root verifica que estado antigo continua legível, escreve
  nos caches/config/prefixo e executa npm pack/cache add/verify offline.
- Instala uma CLI local via npm install --global --offline --ignore-scripts.
- Em outro container, executa a mesma CLI por PATH e relê skill e marcadores,
  sem reinstalação e mantendo os mesmos volumes.
- Verifica preservação das sentinelas e remove apenas os volumes próprios da CI.

Marcador: TOOL_STATE_EXISTING_VOLUME_NONROOT_INSTALL_MATCH.
Sintaxe do módulo e dos scripts internos verificada localmente. Docker não
está disponível no executor local, portanto execução real depende da CI.
Não testa rede, scripts arbitrários, renderização HyperFrames ou instalações
oficiais de todos os plugins. O gate de instalação offline do plugin DSH
existente permanece separado.

## Origem dos caminhos HyperFrames

Fonte upstream consultada no SHA6f90ca15a7fc937d9d6cf3ec289f2a26eca3724f:
- packages/cli/src/browser/manager.ts usa homedir()/.cache/hyperframes;
  redirecionar apenas XDG_CACHE_HOME não garante mudança desse caminho.
- packages/cli/src/telemetry/config.ts usa ~/.hyperframes/config.json
  e install-state.json. Preservar configuração/consentimento/estado.

Versão na sessão reportada desconhecida. Bootstrap não instala browser
completo. unsupported_harness, navegador indisponível e todo_write malformado
não são resolvidos por ajuste de permissões; exigem diagnóstico separado.

## Referência de implantação e rollback

Proprietário informou Git ref refs/heads/main e:
ghcr.io/oaranha/deepharness@sha256:27c6073e2dc4e8f4f34555aa89915285d8a7e25031dc4964cb7e80abbfb11075.
São valores fornecidos pelo proprietário, não inspeção independente do
container. Revisão aplicada desconhecida; registrar antes de cutover.

Imagem nova publicada somente pelo pipeline autorizado, sem build naVPS.
Rollback preserva dsh_data/workspace e restaura digest/config anteriores.
Para reparos de permissões, manter inventário e backup de metadados;
não reverter ownership cegamente nem apagar instalações/sessões.
Nenhuma alteração OAuth/MCP/Keycloak/PostgreSQL faz parte deste ajuste.
