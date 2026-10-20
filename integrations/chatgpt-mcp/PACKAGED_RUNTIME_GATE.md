# Runtime empacotado — evidência e instalação interna

Incremento 2026-10-14; versão @wandora/deepharness-chatgpt-mcp-read@0.1.0-lab.1.
Escopo: biblioteca ESM instalável para host DSH existente; não é instalador Cordis/dsh plugin add, endpoint ou implantação.

## Implementação

runtime.mjs exporta somente createOfficialDshMcpReadRuntime(host, policy).
Reutiliza createDshHostReadBinding (referências oficiais e Session estável), autenticação JWKS rotativa com issuer independente fixado e scope agent-teams:read obrigatório, PostgreSQL primary revocation, e metadata OAuth. O retorno contém somente runHttpRequest/readTeam/handleOAuthRequest; não contém grant mutation, revoke, listener ou agentes.

Discovery, query PostgreSQL e host são injetados pelo servidor confiável. A embalagem não concede grants nem cria banco/pool/segredo. Grants continuam configuração server-owned em memória nesta versão; reidratação persistente permanece gate separado.

## Comprovado localmente

- Teste inicial RED por entry inexistente; depois entry disponível.
- npm test: 3/3 testes da composição passaram.
- npm pack --ignore-scripts gerou tarball; npm install --offline --ignore-scripts instalou o arquivo sem registry.
- Os mesmos 3 testes passaram contra o módulo efetivamente instalado.
- Conteúdo exato: 19 arquivos permitidos; README.md raiz é incluído obrigatoriamente pelo npm e está declarado no manifest, junto a PACKAGE_README.md e LICENSE.
- Sintaxe do teste oficial e YAML do workflow verificados.

Esses testes locais usam host/query doubles e chave JWT descartável. Não equivalem a carga oficial ou banco real.

## Gate CI pendente

Job packaged-runtime-host do workflow Agent Teams:
1. Executa testes da composição.
2. Instala dependências oficiais usando lock existente.
3. Gera, inspeciona e instala offline o tarball real em diretório temporário.
4. Inicializa Cordis/Storage/JSONL/WorkspaceRegistry/SessionStore/TeamService oficiais.
5. Lê uma projeção com JWT individual test-generated e grant exato; nega outro subject/Lead, revogação/DB indisponível simulados e serviço substituído.
6. Publica somente artefato CI private-dsh-read-runtime (.tgz + SHA256SUMS), com retenção sete dias; não publica registry/release nem deploy.

Marcador exigido: PACKED_OFFICIAL_DSH_READ_RUNTIME_MATCH.
DB nesta tarefa é contrato-double; real Keycloak+DSH+PostgreSQL com restart/outage passou separadamente em efd92367. Não somar resultados independentes como prova de pacote+Keycloak+DB no mesmo processo.

## Antes da instalação externa

- Confirmar CI deste HEAD e checksum do artefato. Não usar tarball local como release aprovado.
- Preparar ponto de carregamento no host/artefato DSH existente sem criar outra instância. Bootstrap Docker npm atual não incorpora esta biblioteca automaticamente.
- Configurar issuer/resource/callback/cliente e transporte protegido; persistência e revogação de grants após reinício ainda precisam de prova.
- Submeter alteração exata e rollback para autorização posterior do proprietário.

Nenhum merge, npm publish, GHCR release, VPS, DNS, ingress ou listener foi alterado.

Ruling: empacotar a composição interna já implementada como ESM, sem acrescentar instalação automática de plugin — cumpre o gate de artefato carregável sem inferir autoridade de execução/produção. Custo: ponto de embedding oficial ainda precisa de integração posterior.
