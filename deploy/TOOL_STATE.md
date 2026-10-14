# Estado das ferramentas — correção candidata, sem implantação

## Diagnóstico verificado em 2026-10-14

A imagem define USER node (UID/GID 1000 no Node oficial), HOME e DSH_HOME
em /data/dsh, NPM_CONFIG_CACHE=/data/dsh/.npm-cache e
XDG_CACHE_HOME=/data/dsh/.cache. Portanto não faltam essas variáveis.
Exports em uma chamada shell não alteram chamadas seguintes; a configuração
da imagem/Compose é a persistência declarativa adequada.

A propriedade real dos diretórios no 28server não foi inspecionada.
O relatório fornecido é compatível com arquivos legados pertencentes ao root,
mas não comprova quando ou por quem foram criados. Chown durante docker build
não corrige conteúdo de um volume já existente.

Stack informada pelo proprietário:
- Git ref: refs/heads/main.
- DEEPHARNESS_IMAGE: ghcr.io/oaranha/deepharness@sha256:27c6073e2dc4e8f4f34555aa89915285d8a7e25031dc4964cb7e80abbfb11075.
- Esses valores são readback informado pelo proprietário, não inspeção
  independente do container. A revisão Git aplicada continua desconhecida.

## Correção preparada

A imagem prepara três diretórios privados 0700 pertencentes ao usuário node.
O Compose monta volumes novos e específicos nos mesmos caminhos:

| Volume | Destino | Conteúdo |
| --- | --- | --- |
| dsh_npm_cache_v1 | /data/dsh/.npm-cache | Cache npm |
| dsh_tool_cache_v1 | /data/dsh/.cache | Cache de ferramentas, incluindo browser HyperFrames |
| dsh_hyperframes_state_v1 | /data/dsh/.hyperframes | Configuração/estado HyperFrames |

A inicialização de volume vazio utiliza copy-up do diretório na imagem.
Não usar volume-nocopy, imagem antiga sem diretórios preparados ou volumes
v1 previamente inicializados por root. Não há chown em startup, usuário root
no serviço, chmod777 nem alteração recursiva do volume de sessões.
Volumes dsh_data e dsh_workspace permanecem os mesmos.

ATENÇÃO operacional: as novas montagens ocultam os três diretórios antigos
durante execução, sem apagá-los. Em especial, .hyperframes é ESTADO, não apenas
cache. Antes de implantação, inventariar e preservar sua configuração,
identidade/consentimento de telemetria e eventual autenticação; migrar os
arquivos necessários para o novo volume com proprietário1000:1000 e permissões
privadas, mediante ação operacional autorizada. Não substituir configurações
existentes por defaults nem divulgar seu conteúdo. A implantação fica
bloqueada até decidir e executar essa migração ou comprovar estado descartável.
Não remover diretórios antigos ou novos volumes para contornar falhas.

## Verificação

deploy/tool-state-volume-smoke.mjs usa somente Docker/volumes descartáveis da CI:
1. Cria dsh_data com raiz writable por UID1000 e três diretórios legados
   root-owned0700, reproduzindo EACCES no processo não-root.
2. Usa os destinos/variáveis do Compose real e a imagem candidata sob rootfs
   read-only, rede none, sem capabilities e sem privilégios adicionais.
3. Exige escrita nos três destinos e npm pack/cache add/verify offline.
4. Recria o container com os mesmos volumes e verifica marcadores e cache npm.
5. Confere que sentinelas e propriedade root dos diretórios antigos continuam
   intactas quando observados sem overlays.
6. Remove somente volumes descartáveis criados pelo próprio teste.

O teste prova escrita e persistência de cache, não instalação arbitrária
offline nem funcionamento de HyperFrames/Chrome/renderização. Sintaxe Node
verificada localmente. Docker não está instalado no executor local; uma
tentativa local adicional de fixture Unix esbarrou em chown não suportado pelo
filesystem, portanto não há alegação de reprodução local concluída.
O resultado do novo teste Docker depende da CI; não foi verificado GREEN ainda.

## HyperFrames e demais sintomas

Fonte upstream consultada no SHA6f90ca15a7fc937d9d6cf3ec289f2a26eca3724f:
- packages/cli/src/browser/manager.ts usa homedir()/.cache/hyperframes,
  não apenas XDG_CACHE_HOME; por isso mantemos HOME e o caminho original.
- packages/cli/src/telemetry/config.ts usa homedir()/.hyperframes/config.json
  e install-state.json, reforçando a necessidade de preservar estado.

A versão usada na sessão reportada é desconhecida. A imagem bootstrap não
instala HyperFrames nem um browser completo. Esta correção NÃO afirma que
Chrome, bibliotecas Linux ou captura/render estejam disponíveis. Verificar
versão efetiva e diagnóstico da ferramenta antes de adicionar dependências.

unsupported_harness e navegador indisponível podem ser restrições da
integração oferecida ao agente. Não inventar suporte nem desligar sandbox.
todo_write malformado exige comparar argumentos com schema real da ferramenta
e comportamento do provedor; caches não corrigem esse contrato.

## Implantação e rollback posteriores

Após CI e revisão, publicar imagem somente pelo pipeline GitHub autorizado;
não construir no28server. Usar digest da imagem nova compatível com o Compose
novo, com readback do usuário, modos, montagens e variáveis, depois testar uma
sessão nova. Não efetuar redeploy usando digest antigo e montagens novas.

Rollback exige restaurar TANTO digest quanto revisão anterior do Compose
(retirando os três overlays), preservando todos os volumes. O digest informado
acima é a referência anterior; a revisão antiga deve ser capturada antes do
cutover. A configuração atual do MCP/OAuth/Keycloak/PostgreSQL não muda neste
ajuste. Nenhuma ação na VPS ou no Portainer foi executada.
