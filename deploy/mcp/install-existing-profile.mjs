/** Explicit operator migration: official offline installer, disabled connector only. */
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {verifyDisabledProfileDelta} from '/opt/wandora-mcp-verifier/disabled-mcp-profile-contract.mjs';
const exec=promisify(execFile),name='@wandora/deepharness-chatgpt-mcp-read';
assert.equal(process.env.DSH_MCP_OPERATOR_INSTALL,'disabled-only-v1');
assert.equal(process.getuid(),1000);
const profile='/data/dsh/profiles/web',manifest=profile+'/package.json';
const yaml=createRequire('/opt/wandora-mcp-verifier/package.json')('js-yaml');
const schema=yaml.JSON_SCHEMA.extend([new yaml.Type('tag:yaml.org,2002:js',{kind:'scalar',construct:value=>value})]);
const optional=async path=>{try{return await readFile(path);}catch(error){if(error.code==='ENOENT')return undefined;throw error;}};
const dump=async()=>yaml.load((await exec('dsh',['web','--dump-config'],{timeout:90000,maxBuffer:8*1024*1024})).stdout,{schema});
let phase='existing profile';
try{
  const before=JSON.parse(await readFile(manifest,'utf8'));
  assert.ok(before.dsh.profile.bundles.includes('@deepseek-ai/dsh-experimental-agent-team-profile'));
  assert.ok(!before.dsh.profile.bundles.includes(name)&&!Object.hasOwn(before.dependencies??{},name));
  const patches=[profile+'/cordis.patch.yml','/data/dsh/cordis.patch.yml'];
  const previousPatches=await Promise.all(patches.map(optional));
  const beforeTree=await dump();
  phase='immutable package';
  const artifacts='/opt/wandora-mcp-artifacts';
  const files=(await readdir(artifacts)).filter(file=>file.endsWith('.tgz'));
  assert.equal(files.length,1);
  await exec('sha256sum',['--check','SHA256SUMS'],{cwd:artifacts});
  assert.equal((await exec('/usr/local/bin/pnpm',['--version'])).stdout.trim(),'11.28.5');
  phase='official offline install';
  await exec('dsh',['plugin','--profile','web','add','--offline','--ignore-scripts',artifacts+'/'+files[0]],
    {timeout:180000,maxBuffer:8*1024*1024});
  phase='existing bundle and dependency preservation';
  const after=JSON.parse(await readFile(manifest,'utf8'));
  assert.deepEqual(after.dsh.profile.bundles,[...before.dsh.profile.bundles,name]);
  const restored=structuredClone(after);
  restored.dsh.profile.bundles=before.dsh.profile.bundles;
  assert.ok(Object.hasOwn(restored.dependencies,name));delete restored.dependencies[name];
  assert.deepEqual(restored,before);
  for(let i=0;i<patches.length;i++)assert.deepEqual(await optional(patches[i]),previousPatches[i]);
  const installed=createRequire(manifest);
  assert.equal(installed(name+'/package.json').version,'0.1.0-lab.4');
  phase='disabled composition delta';
  verifyDisabledProfileDelta(beforeTree,await dump());
  console.log('MCP_EXISTING_WEB_PROFILE_DISABLED_INSTALL_MATCH');
  console.log('Official offline install; existing bundles/dependencies/patches preserved; connector row and endpoint disabled; no listener');
}catch(error){
  try{await writeFile('/run/mcp-installer.log',String(error.stdout??'')+'\n'+String(error.stderr??''));}catch{}
  console.error('MCP operator installation denied at '+phase+'; private backup retained; do not redeploy');
  process.exitCode=1;
}
