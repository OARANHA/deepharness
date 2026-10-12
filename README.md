# DeepHarness

**Repositório controlado pela Wandora para executar e estender o DeepSeek Harness.**

- Upstream: https://github.com/deepseek-ai/deepseek-harness
- Fonte de verdade: [docs/PROJECT_SOURCE.md](docs/PROJECT_SOURCE.md)
- Estado real e pendências: [docs/CANONICAL_STATE.md](docs/CANONICAL_STATE.md)
- Versão de origem: [UPSTREAM.md](UPSTREAM.md)
- Deploy seguro: [deploy/README.md](deploy/README.md)

## Política de execução
1. Importar código oficial de commit fixado para este repositório (licença MIT preservada).
2. Construir/testar imagem por GitHub Actions; publicar no GHCR apenas com testes aprovados.
3. Implantar **somente no 28server** por uma Stack do Portainer, usando imagem imutável por digest.
4. Nunca copiar segredos para o GitHub. Nunca reconstruir ou fazer prune na VPS.
5. Não executar instância paralela enquanto o container legado `deepseek-harness` não estiver reconciliado.
6. Conectar Chutes.ai pela interface do Harness, e posteriormente integrar ChatGPT através de plugin MCP com permissões mínimas.

**Estado:** implementação e deploy ainda não comprovados. Não confundir workflow criado com imagem testada ou Stack ativa.
