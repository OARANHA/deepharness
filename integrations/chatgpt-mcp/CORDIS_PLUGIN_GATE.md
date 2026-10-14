# DSH/Cordis plugin de leitura — contrato e verificação

O pacote privado @wandora/deepharness-chatgpt-mcp-read@0.1.0-lab.2 contém o runtime ESM e plugin.mjs. A declaração dsh.bundle.patch aponta para cordis.patch.yml, que insere somente wandora-chatgpt-mcp-read, disabled:true e endpointEnabled:false. O módulo é carregado pelo subpath export /plugin. Nenhum serviço storage/workspace/session/team é duplicado.

## Carregamento e autoridade

O contrato Cordis usa name/inject/apply. O plugin requer workspaceRegistry, sessions, sessionProjections e chatgptMcpReadPolicy do host inicializado. A policy é um serviço confiável de composição, não valores de ferramentas MCP ou funções/segredos em YAML. Ausência da dependência impede ativação; configuração de endpointEnabled:true ou campos adicionais é recusada.

O serviço interno chatgptMcpRead fornece runHttpRequest/readTeam/handleOAuthRequest. Não registra HTTP/stdio, rotas Web, agente, ferramenta de escrita ou administração de grants. Os recursos DB/discovery permanecem do host. Na descarga, Cordis remove o serviço e o disposer invalida referências retidas, inclusive resultados aguardados; as sessões existentes permanecem.

Peers oficiais são exatos: Cordis4.0.5-alpha.1 e DSH Session/SessionProjection/Workspace0.2.1-alpha.2. optional serve somente para npm não buscar/instalar outro host; não torna os serviços opcionais na injeção Cordis nem autoriza versão incompatível.

## Evidência do incremento

Local: teste RED por plugin inexistente; npm test 5/5 passou após implementação. Tarball lab.2 gerado, instalado offline sem registry; dois testes do plugin instalado passaram. Whitelist exata de 21 arquivos e YAML desativado conferidos.

CI novo teste packed-runtime-host instala o tarball, inicializa serviços oficiais descartáveis, monta via ctx.plugin, lê Lead preexistente, descarrega via Fiber.dispose e exige negação por handle antigo. Marcador esperado: PACKED_OFFICIAL_DSH_CORDIS_PLUGIN_MATCH. Resultado desta execução ainda pendente; sintaxe/local doubles não provam lifecycle oficial.

Este teste não executa uma transação dsh plugin add/PluginManager de perfil; compatibilidade do bundle foi preparada com base no contrato oficial, e o ciclo Cordis é o alvo deste incremento. Host oficial descartável usa JWT test-generated e query-double; Keycloak+PostgreSQL reais permanecem teste separado.

## Fontes primárias inspecionadas

- deepseek-ai/deepseek-harness, tag dsh-v0.2.1-alpha.2: packages/boot/app-boot/src/profile-plugins.ts, packages/boot/app-boot/src/plugin-compatibility.ts e packages/boot/plugin-manager/README.md.
- Mesmo tag: vendor/cordis/src/registry.ts e fiber.ts, com inject/apply, Fiber awaitable, disposal e reativação por dependências.
- Bridge MIT fixado em b78a575e: src/index.ts e cordis.patch.yml; reutilizado o formato de bundle, sem importar sua execução/transporte/control plane.

Nenhum merge, instalação na VPS, deploy, credencial persistente ou endpoint foi realizado. Integração real de perfil, policy operacional, callback OAuth, grants persistentes e transporte protegido continuam dependências de produção.
