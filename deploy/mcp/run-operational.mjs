/** Separate opt-in launcher, never the candidate image's default CMD. */
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {startOperationalReadHost} from './operational-host.mjs';
import {verifyPackedInstall} from './verify-packed-install.mjs';
const imported=async(resolve,name)=>import(pathToFileURL(resolve.resolve(name)).href);
try{
  const config=JSON.parse(await readFile('/etc/wandora-mcp/runtime.json','utf8'));
  // A candidate image is not proof that a persistent Web profile was updated.
  // Refuse the previous disabled bundle rather than executing stale adapters.
  await verifyPackedInstall('/data/dsh/profiles/web/node_modules/@wandora/deepharness-chatgpt-mcp-read',
    '/opt/wandora-mcp-artifacts/packed-files.json');
  const official=createRequire('/opt/dsh/node_modules/@deepseek-ai/dsh/package.json');
  const installed=createRequire('/data/dsh/profiles/web/package.json');
  const dependencies=createRequire('/opt/wandora-mcp-host/package.json');
  const {runProfile}=await imported(official,'@deepseek-ai/dsh/profile-boot');
  const {loadLayeredEnv}=await imported(official,'@deepseek-ai/dsh-app-boot');
  const plugin=await imported(installed,'@wandora/deepharness-chatgpt-mcp-read/plugin');
  const {createPersistentDshMcpReadPolicy:createPolicy}=await imported(installed,'@wandora/deepharness-chatgpt-mcp-read/policy');
  const {createAuthoritativePgReadQuery,assertAuthoritativePgReadPool}=await imported(installed,'@wandora/deepharness-chatgpt-mcp-read/pg-read-query');
  // require.resolve selects pg's CommonJS entry; read its actual module.exports.
  const {Pool}=dependencies('pg');
  const {McpServer}=await imported(dependencies,'@modelcontextprotocol/sdk/server/mcp.js');
  const {StreamableHTTPServerTransport}=await imported(dependencies,'@modelcontextprotocol/sdk/server/streamableHttp.js');
  const {z}=await imported(dependencies,'zod');
  const {createPinnedOidcDiscovery:createDiscovery}=await import('/opt/wandora-mcp-host/oidc/pinned-oidc-discovery.mjs');
  await startOperationalReadHost(config,{runProfile,loadLayeredEnv,plugin,createPolicy,Pool,createDiscovery,createAuthoritativePgReadQuery,assertAuthoritativePgReadPool,
    sdk:{McpServer,StreamableHTTPServerTransport,inputSchema:z.object({
      workspaceId:z.string().min(1).max(256),leadSessionId:z.string().min(1).max(256)}).strict()}});
  console.log('OPERATIONAL_MCP_HOST_READY');
}catch{
  console.error('Operational MCP host startup denied');process.exitCode=1;
}
