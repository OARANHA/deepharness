# ChatGPT ↔ DeepHarness — adoção do bridge

**Objetivo único:** permitir que o ChatGPT converse com sessões existentes do DeepHarness, especialmente o Lead, consulte resultados e encaminhe tarefas com autorização. **Não** instalar um segundo enxame nem criar um segundo sistema de execução.

## Código reaproveitado

- Origem: https://github.com/jiezeng2004-design/dsh-chatgpt-bridge
- Revisão fixada: `b78a575e886de1644db5273df88907bd2f2163fa` (2026-10-08)
- Caminho: `integrations/chatgpt-mcp/upstream/` (submódulo Git, **não carregado pela imagem atual**)
- Licença: MIT; o `LICENSE` e avisos de copyright permanecem na origem/submódulo, a preservar em qualquer código derivado.
- Nesta PR **não** se altera o Dockerfile, o perfil web, os modelos, o Portainer, o acesso público nem qualquer segredo.

O upstream já oferece 23 ferramentas MCP, entre elas `dsh_list_sessions`, `dsh_send_message`, `dsh_get_result`, `dsh_start_goal`, `dsh_wait_goal` e `dsh_approve`. A implementação `src/bridge.ts` utiliza os serviços `ctx.agents` e persistência nativa do DSH e consegue procurar sessões vivas e retomar sessões persistidas. `src/http.ts` disponibiliza HTTP MCP com bearer token em loopback, e `src/index.ts` o monta no runtime Cordis. São capacidades reais do código, **não** conectividade comprovada na nossa VPS.

## Bloqueios antes de permitir instalação

1. **Versão:** o código fixado depende de pacotes DSH `0.2.0-rc.2`; a implantação Wandora usa `0.2.1-alpha.2`. A versão npm `0.6.0` publicada foi construída para `0.1.7-rc.2`. Verificar em CI isolada todos os imports, serviços, retomada, migração e CLI com a versão exata da Wandora. **Não instalar o npm publicado em produção.**
2. **Agent Teams:** upstream não expõe `ctx.agentTeams`, quadro `agentTeam` nem `listMembers/listTasks`. Acrescentar apenas consultas read-only à **mesma** sessão Lead, respeitando o serviço/projeção oficial; criação de membros e transição de tarefas devem continuar sob autoridade do Lead.
3. **Poderes:** um bearer token dá acesso às ferramentas deste bridge; ainda não há vinculação por usuário a workspaces/sessões. Fixar allowlist explícita, autenticação do transporte público e autorizações separadas antes da exposição remota. Não usar cookie, token do browser ou BasicAuth de usuário como token de máquina.
4. **Aprovações:** upstream aprova automaticamente escrita no workspace e commit local por padrão (`src/approval-policy.ts` e `src/config.ts`). Para o primeiro teste definir ambas como `ask`, e manter publicação/push, alterações destrutivas, operações externas e segredos com aprovação/negação explícitas. A guarda por classificação de comandos **não** substitui o sandbox do DSH.
5. **Transporte:** a interface `http://127.0.0.1:3456/mcp` só está acessível no processo/container que a hospeda. Conectar ChatGPT requer um transporte remoto seguro e autenticado, sem expor o endpoint interno nem usar o token de lançamento do Web.
6. **Confiabilidade:** testes upstream (401 em 2026-10-08, um skip, conforme relatório do autor) usaram runtime isolado e `0.2.0-rc.2`, não nossa alpha nem uma sessão real de Team; CI upstream verde não prova integração de ponta a ponta. Revalidar CI do nosso SHA após adaptação.

## Aceitação — primeiro slice

No DSH `0.2.1-alpha.2`, em instância descartável e com workspace de teste:
- Listar sessões e encontrar um Lead pré-existente sem criar outra sessão.
- Ler status/membros/tarefas **da própria equipe** com dados projetados reais, distinguindo lista vazia de erro.
- Enviar **uma** instrução não mutante para o Lead existente, com request ID e prevenção de duplicação.
- Confirmar que os agentes-filhos e suas sessões permanecem os mesmos.
- Negar acesso sem token e a workspace/sessão fora da allowlist.
- Demonstrar desligamento/rollback sem afetar Web, Agent Teams ou credenciais.

Manter o resultado em branch e PR; pedir aprovação antes de alterações de produção. Não repetir polling da CI: proprietário comunicará quando terminar.

## Para revisar localmente

```sh
git submodule update --init integrations/chatgpt-mcp/upstream
cd integrations/chatgpt-mcp/upstream
git rev-parse HEAD
```

A saída esperada do último comando é a revisão fixada acima. Não executar `install.sh`, `npm ci` nem `dsh plugin add` diretamente no servidor em produção até passar o gate de compatibilidade e segurança.

**Estado:** código upstream vinculado/pinado para adaptação. **Nenhum MCP está instalado ou conectado ao ChatGPT por esta PR.**
