import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcpOAuthResourceMetadata, validatePinnedOAuthServerMetadata, createMcpOAuthChallenge } from '../adapters/mcp-oauth-resource-metadata.mjs';
const issuer = 'https://login.example';
const resource = 'https://mcp.example/mcp';
const good = { issuer, authorization_endpoint: issuer + '/authorize',
  token_endpoint: issuer + '/token', response_types_supported: ['code'],
  grant_types_supported: ['authorization_code'],
  code_challenge_methods_supported: ['S256'] };
test('protected resource metadata advertises only pinned issuer and read-only scope', () => {
  assert.deepEqual(createMcpOAuthResourceMetadata({ resource, issuer }), {
    resource, authorization_servers: [issuer], scopes_supported: ['agent-teams:read'],
    bearer_methods_supported: ['header'],
  });
  assert.match(createMcpOAuthChallenge({ metadataUri: 'https://mcp.example/.well-known/oauth-protected-resource/mcp' }), /resource_metadata=/);
  assert.throws(() => createMcpOAuthResourceMetadata({ resource, issuer: 'http://127.0.0.1' }), /denied/);
  assert.throws(() => createMcpOAuthResourceMetadata({ resource, issuer, scope: 'agent-teams:write' }), /denied/);
});
test('authorization metadata requires issuer, HTTPS pinned endpoints, code and PKCE S256', () => {
  const parsed = validatePinnedOAuthServerMetadata({ issuer, metadata: good });
  assert.equal(parsed.pkceMethod, 'S256');
  for (const changed of [
    { issuer: 'https://attacker.example' },
    { authorization_endpoint: 'https://attacker.example/authorize' },
    { token_endpoint: 'http://login.example/token' },
    { response_types_supported: ['token'] },
    { grant_types_supported: ['client_credentials'] },
    { code_challenge_methods_supported: ['plain'] },
    { code_challenge_methods_supported: undefined },
  ]) assert.throws(() => validatePinnedOAuthServerMetadata({
    issuer, metadata: { ...good, ...changed },
  }), /denied/);
});
