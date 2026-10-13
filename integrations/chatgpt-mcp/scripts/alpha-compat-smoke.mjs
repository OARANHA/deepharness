#!/usr/bin/env node
/**
 * PROOF ONLY: tests the pinned upstream package with the exact Wandora DSH alpha
 * in an isolated temporary root. Never touches a user's DSH_HOME or VPS.
 * A successful result is a contract smoke, NOT production authorization.
 */
import assert from 'node:assert/strict';
import { adaptAlphaWebSurface } from '../adapters/dsh-alpha-web-surface.mjs';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const upstream = join(root, 'upstream');
const EXPECTED_UPSTREAM = 'b78a575e886de1644db5273df88907bd2f2163fa';
const DSH_VERSION = '0.2.1-alpha.2';
const temp = realpathSync(mkdtempSync(join(tmpdir(), 'wandora-dsh-bridge-alpha-')));

function run(binary, args, cwd, timeoutMs = 600000, capture = false) {
  const proc = spawnSync(binary, args, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    timeout: timeoutMs,
    env: {
      ...process.env,
      // This test never points to or inherits a production DSH profile.
      DSH_HOME: join(temp, 'no-real-profile'),
      HOME: temp,
    },
  });
  if (proc.error) throw proc.error;
  assert.equal(proc.status, 0,
    `Command failed with exit ${proc.status}: ${binary} ${args.slice(0, 2).join(' ')}`);
  return proc.stdout ?? '';
}

try {
  assert.equal(
    run('git', ['rev-parse', 'HEAD'], upstream, 10000, true).trim(),
    EXPECTED_UPSTREAM,
    'The source review pin changed: do not test an unreviewed revision',
  );
  const [pack] = JSON.parse(run(
    'npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', temp],
    upstream, 120000, true,
  ));
  const packed = new Set(pack.files.map(file => file.path));
  for (const file of ['lib/index.js', 'lib/bridge.js', 'lib/client.js', 'LICENSE', 'cordis.patch.yml']) {
    assert.ok(packed.has(file), `Missing entry from tarball: ${file}`);
  }
  const tarball = join(temp, pack.filename);
  assert.ok(existsSync(tarball));

  // Use an isolated installation and the exact official host version. The
  // upstream package pins rc.2 peers, so --legacy-peer-deps is ONLY a test
  // bypass to reveal runtime compatibility. It is NOT permission to deploy.
  run('npm', [
    'install', '--prefix', temp, '--ignore-scripts', '--no-audit', '--no-fund',
    '--package-lock=false', '--legacy-peer-deps', tarball,
    `@deepseek-ai/dsh@${DSH_VERSION}`,
  ], temp);
  const installed = join(temp, 'node_modules', 'dsh-chatgpt-bridge');
  assert.equal(JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8')).version, '0.6.0');
  assert.equal(
    JSON.parse(readFileSync(join(temp, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), 'utf8')).version,
    DSH_VERSION,
  );


  // npm --legacy-peer-deps bypasses peer resolution (required for the RC2
  // bridge against alpha). The official host also uses runtime peer imports
  // which may not be installed in a fresh environment. Resolve ONLY peers
  // declared by installed @deepseek-ai packages; never guess latest tags.
  const manifestPath = join(temp, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.dependencies ??= {};
  const scopeDir = join(temp, 'node_modules', '@deepseek-ai');
  for (let pass = 0; pass < 6; pass++) {
    const missing = new Map();
    for (const entry of readdirSync(scopeDir)) {
      const pkgPath = join(scopeDir, entry, 'package.json');
      if (!existsSync(pkgPath)) continue;
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      for (const [name, range] of Object.entries(pkg.peerDependencies ?? {})) {
        if (!name.startsWith('@deepseek-ai/')) continue;
        if (pkg.peerDependenciesMeta?.[name]?.optional) continue;
        if (existsSync(join(temp, 'node_modules', name, 'package.json'))) continue;
        const prev = missing.get(name);
        assert.ok(!prev || prev === range,
          `Conflicting required peer ranges for ${name}: ${prev} vs ${range}`);
        missing.set(name, range);
      }
    }
    if (!missing.size) break;
    console.log(`Official host missing required peers (pass ${pass + 1}): ${JSON.stringify(Object.fromEntries(missing))}`);
    for (const [name, range] of missing) manifest.dependencies[name] = range;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    run('npm', [
      'install', '--prefix', temp, '--ignore-scripts', '--no-audit',
      '--no-fund', '--package-lock=false', '--legacy-peer-deps',
    ], temp);
    if (pass === 5) throw new Error('Required official host peer closure did not converge');
  }

  // The official alpha host deliberately blocks RC2 peer declarations. Do NOT
  // grant allow-version. Adapt ONLY the installed throwaway package manifest
  // to the exact alpha after proving all five original peer pins match RC2.
  // This tests the actual code contracts, NOT publishable metadata compatibility.
  const bridgeManifestPath = join(installed, 'package.json');
  const bridgeManifest = JSON.parse(readFileSync(bridgeManifestPath, 'utf8'));
  const hostPeers = [
    '@deepseek-ai/dsh-llm',
    '@deepseek-ai/dsh-agent',
    '@deepseek-ai/dsh-agent-preset-registry',
    '@deepseek-ai/dsh-session',
    '@deepseek-ai/dsh-session-title',
  ];
  for (const name of hostPeers) {
    assert.equal(bridgeManifest.peerDependencies?.[name], '0.2.0-rc.2',
      `Unexpected upstream peer; do not silently adapt ${name}`);
    assert.equal(
      JSON.parse(readFileSync(join(temp, 'node_modules', name, 'package.json'), 'utf8')).version,
      DSH_VERSION, `Official host peer is not exact alpha: ${name}`,
    );
    bridgeManifest.peerDependencies[name] = DSH_VERSION;
  }
  writeFileSync(bridgeManifestPath, JSON.stringify(bridgeManifest, null, 2) + '\n');
  console.log('ALPHA_TEST_ONLY_PEER_METADATA_ADAPTATION: five exact RC2 peers → 0.2.1-alpha.2 (disposable copy, not upstream, not exemption)');

  // Apply the reviewed, versioned adapter only to the disposable install.\n  adaptAlphaWebSurface(installed);\n  console.log('ALPHA_TEST_ONLY_WEB_SERVER_ADAPTER: versioned adapter applied');\n\n  cpSync(join(upstream, 'test', 'integration'), join(installed, 'test', 'integration'), { recursive: true });
  // Instrument only the copied upstream test to identify which official
  // alpha health capability is absent. Preserve all original assertions.
  const cliTestPath = join(installed, 'test', 'integration', 'dsh-cli.test.mjs');
  let cliTest = readFileSync(cliTestPath, 'utf8');
  for (const name of ['agentPresets', 'webSurface', 'userQuestions']) {
    const original = `assert.equal(healthData.capabilities.${name}, true);`;
    assert.ok(cliTest.includes(original), `Upstream health assertion changed: ${name}`);
    cliTest = cliTest.replace(original,
      `assert.equal(healthData.capabilities.${name}, true, 'Missing alpha capability: ${name}; available: ' + JSON.stringify(healthData.capabilities));`);
  }
  writeFileSync(cliTestPath, cliTest);

  // The original tests assert 23 MCP tools, bearer auth, session operations,
  // Web origin fence and clean shutdown; no real model or production runtime.
  run(process.execPath, [
    '--test', 'test/integration/dsh-host.test.mjs', 'test/integration/dsh-cli.test.mjs',
  ], installed, 180000);
  console.log(`WANDORA_BRIDGE_ALPHA_CONTRACT_OK DSH=${DSH_VERSION} upstream=${EXPECTED_UPSTREAM}`);
} finally {
  const boundary = relative(realpathSync(tmpdir()), temp);
  assert.ok(boundary && !boundary.startsWith('..') && !isAbsolute(boundary));
  assert.equal(dirname(temp), realpathSync(tmpdir()));
  rmSync(temp, { recursive: true, force: true });
}
