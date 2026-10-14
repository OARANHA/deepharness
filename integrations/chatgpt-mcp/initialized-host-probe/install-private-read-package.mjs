/** Test-only offline installation. No registry, credentials or source fallback. */
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {join,relative,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),name='@wandora/deepharness-chatgpt-mcp-read';
export async function installPrivateReadPackage(root) {
  const source=fileURLToPath(new URL('../',import.meta.url));
  const manifest=JSON.parse(await readFile(join(source,'package.json'),'utf8'));
  assert.equal(manifest.version,'0.1.0-lab.4');assert.equal(manifest.private,true);
  const {stdout}=await exec('npm',['pack',source,'--ignore-scripts','--json','--pack-destination',root],{timeout:15000});
  const [packed]=JSON.parse(stdout);
  assert.deepEqual(packed.files.map(f=>f.path).sort(),['package.json',...manifest.files].sort());
  const install=join(root,'installed-package');await mkdir(install);
  await exec('npm',['install','--prefix',install,'--offline','--ignore-scripts','--no-audit','--no-fund',
    '--package-lock=false',join(root,packed.filename)],{timeout:15000});
  const resolve=createRequire(join(install,'package.json'));
  const packageRoot=join(install,'node_modules','@wandora','deepharness-chatgpt-mcp-read');
  const inside=path=>{
    const rel=relative(packageRoot,path);
    assert.ok(rel!==''&&!rel.startsWith('..')&&!isAbsolute(rel),'must resolve installed package, never source');
    return path;
  };
  const installed=JSON.parse(await readFile(inside(resolve.resolve(name+'/package.json')),'utf8'));
  assert.equal(installed.version,manifest.version);
  const plugin=await import(pathToFileURL(inside(resolve.resolve(name+'/plugin'))).href);
  const {createPersistentDshMcpReadPolicy}=await import(pathToFileURL(inside(resolve.resolve(name+'/policy'))).href);
  const {createPostgresReadGrantStore}=await import(pathToFileURL(inside(join(packageRoot,'adapters/postgres-read-grants.mjs'))).href);
  const {createPostgresRevocationBackend}=await import(pathToFileURL(inside(join(packageRoot,'adapters/postgres-token-revocation.mjs'))).href);
  return Object.freeze({plugin,createPersistentDshMcpReadPolicy,createPostgresReadGrantStore,createPostgresRevocationBackend,
    readSchema:async file=>{
      assert.ok(['001_token_revocations.sql','002_read_grants.sql'].includes(file));
      return readFile(inside(join(packageRoot,'sql',file)),'utf8');
    },version:installed.version});
}
