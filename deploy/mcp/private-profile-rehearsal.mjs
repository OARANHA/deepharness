/** Run ONLY in a disconnected container on a private COPY mounted at /data/dsh. */
import assert from 'node:assert/strict';
import {readFile,realpath} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),home='/data/dsh',profile=home+'/profiles/web';
const name='@wandora/deepharness-chatgpt-mcp-read';
let phase='guard';
try{
  assert.equal(process.env.DSH_MCP_PRIVATE_REHEARSAL,'offline-copy-only');
  assert.equal(process.getuid(),1000);
  assert.equal(await readFile('/review/CLONE_ONLY','utf8'),'private-profile-copy-only\n');
  assert.equal(await realpath(home),home);
  assert.equal(await realpath(profile),profile);
  const interfaces=await readFile('/proc/net/dev','utf8');
  assert.ok(interfaces.split('\n').filter(x=>x.includes(':')).every(x=>x.trim().startsWith('lo:')));
  const {verifyExistingProfileUpgrade}=await import('/opt/wandora-mcp-verifier/mcp/upgrade-existing-profile-contract.mjs');
  const {verifyPackedInstall}=await import('/opt/wandora-mcp-verifier/mcp/verify-packed-install.mjs');
  const yaml=createRequire('/opt/wandora-mcp-verifier/package.json')('js-yaml');
  const schema=yaml.JSON_SCHEMA.extend([new yaml.Type('tag:yaml.org,2002:js',{kind:'scalar',construct:x=>x})]);
  const env={...process.env,HOME:home,DSH_HOME:home,COREPACK_ENABLE_DOWNLOAD_PROMPT:'0'};
  const run=async args=>(await exec('dsh',args,{env,cwd:home,timeout:240000,maxBuffer:8*1024*1024})).stdout;
  const optional=async path=>{try{return await readFile(path,'utf8');}catch(error){if(error.code==='ENOENT')return null;throw error;}};
  const snapshot=async()=>({
    manifest:JSON.parse(await readFile(profile+'/package.json','utf8')),
    version:JSON.parse(await readFile(profile+'/node_modules/'+name+'/package.json','utf8')).version,
    userPatch:await optional(profile+'/cordis.patch.yml'),homePatch:await optional(home+'/cordis.patch.yml'),
    composition:yaml.load(await run(['web','--dump-config']),{schema}),
    lock:yaml.load(await readFile(profile+'/pnpm-lock.yaml','utf8'),{schema}),
  });
  phase='baseline';
  // Missing or unexpected profile is refused; this tool never initializes one.
  const original=JSON.parse(await readFile(profile+'/package.json','utf8'));
  assert.ok(original.dsh.profile.bundles.includes('@deepseek-ai/dsh-experimental-agent-team-profile'));
  assert.equal(JSON.parse(await readFile(profile+'/node_modules/'+name+'/package.json','utf8')).version,'0.1.0-lab.4');
  const before=await snapshot();
  // Exercise the original disabled composition gate BEFORE installing anything.
  const expected=structuredClone(before);expected.version='0.1.0-lab.5';
  expected.manifest.dependencies[name]='file:/review/expected-new-package.tgz';
  verifyExistingProfileUpgrade(before,expected);
  const artifacts='/opt/wandora-mcp-artifacts';
  const proof=JSON.parse(await readFile(artifacts+'/packed-files.json','utf8'));
  assert.equal(proof.sourceSha,'f5a5a4f75b680fa1866d843014ea61e7a5e40506');
  assert.match(proof.tarball,/^[a-zA-Z0-9_.-]+\.tgz$/);
  phase='offline-install';
  await run(['plugin','--profile','web','add','--offline','--ignore-scripts',artifacts+'/'+proof.tarball]);
  phase='preservation';
  verifyExistingProfileUpgrade(before,await snapshot());
  await verifyPackedInstall(profile+'/node_modules/'+name,artifacts+'/packed-files.json');
  console.log('PRIVATE_PROFILE_OFFLINE_UPGRADE_MATCH');
}catch{
  // Never print captured CLI/config output: it may contain private profile values.
  console.error('PRIVATE_PROFILE_REHEARSAL_DENIED '+phase);process.exitCode=1;
}
