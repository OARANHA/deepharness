#!/usr/bin/env node
/**
 * PROOF ONLY: tests the pinned upstream package with the exact Wandora DSH alpha
 * in an isolated temporary root. Never touches a user's DSH_HOME or VPS.
 * A successful result is a contract smoke, NOT production authorization.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
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

  cpSync(join(upstream, 'test', 'integration'), join(installed, 'test', 'integration'), { recursive: true });
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
